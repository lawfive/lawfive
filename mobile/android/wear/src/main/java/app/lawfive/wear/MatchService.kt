package app.lawfive.wear

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

// WCH-5: keeps the match's alerts going with the screen off, and the match a tap away on the watch face.
// The clocks themselves come from stored times (TMR-8); this only fires what's due.
class MatchService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var lock: PowerManager.WakeLock? = null

    private val tick = object : Runnable {
        override fun run() {
            val match = AppState.match
            if (match == null || match.phase == Phase.Done) {
                stopSelf()
                return
            }
            AppState.tickMatch(System.currentTimeMillis())?.let { Haptics.play(this@MatchService, it) }
            handler.postDelayed(this, 1000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        AppState.start(this)
        lock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lawfive:match").apply { acquire(4 * 60 * 60 * 1000L) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // WCH-7: the exercise's types only with the permissions they need, or starting would fail.
        var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        if (Workout.hasHeartRate(this)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        if (Workout.hasLocation(this)) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        startForeground(1, notification(), types)
        handler.removeCallbacks(tick)
        handler.post(tick)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(tick)
        lock?.takeIf { it.isHeld }?.release()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("match", "Match in progress", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val builder = NotificationCompat.Builder(this, "match")
            .setSmallIcon(R.drawable.ph_watch)
            .setContentTitle("LawFive")
            .setContentText("Match in progress")
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setOngoing(true)
            .setContentIntent(open)
        OngoingActivity.Builder(this, 1, builder)
            .setStaticIcon(R.drawable.ph_watch)
            .setTouchIntent(open)
            .setStatus(Status.forPart(Status.TextPart("Match in progress")))
            .build()
            .apply(this)
        return builder.build()
    }

    companion object {
        fun start(context: Context) = ContextCompat.startForegroundService(context, Intent(context, MatchService::class.java))
    }
}

/** VIB-1 to VIB-6: the watch's patterns, on and off in milliseconds. */
object Haptics {
    private fun vibrate(context: Context, pattern: LongArray) {
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }

    fun play(context: Context, alert: Alert) = vibrate(context, when (alert) {
        Alert.FullTime -> longArrayOf(0, 800, 200, 800, 200, 800)
        // VIB-7: four quick pulses.
        Alert.AddedTime -> longArrayOf(0, 150, 120, 150, 120, 150, 120, 150)
        // TMR-13: the lightning countdown's end vibrates as the break's end does (VIB-3).
        Alert.BreakStart, Alert.BreakEnd, Alert.Lightning -> longArrayOf(0, 500, 150, 500)
        Alert.Reminder -> longArrayOf(0, 150)
        // EVT-12: three short pulses, repeating as VIB-1's while "can return" waits.
        Alert.SinBinEnd -> longArrayOf(0, 150, 100, 150, 100, 150)
    })

    fun tick(context: Context) = vibrate(context, longArrayOf(0, 40))
    fun sendOff(context: Context) = vibrate(context, longArrayOf(0, 1000, 200, 1000))
}
