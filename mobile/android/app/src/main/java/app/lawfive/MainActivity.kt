package app.lawfive

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import app.lawfive.data.AppLink
import app.lawfive.ui.LawFiveApp
import app.lawfive.ui.theme.LawFiveTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // WEB-24: the status and navigation bars sit on the board (near black) in light and dark, so their icons are light.
        enableEdgeToEdge(
            statusBarStyle = androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = androidx.activity.SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        if (savedInstanceState == null) openLink(intent)
        setContent {
            LawFiveTheme {
                LawFiveApp(graph)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openLink(intent)
    }

    /** A lawfive:// link (APP-13, APP-14); the sign-in screen asks before doing anything with it. */
    private fun openLink(intent: Intent?) {
        intent?.getStringExtra(EXTRA_MATCH)?.let { graph.pendingMatch.value = it }
        intent?.dataString?.let { AppLink.parse(it, BuildConfig.DEBUG) }?.let { graph.pendingLink.value = it }
        // For testing on an emulator (adb shell am start ... --ez watchSync true): a watch handing over a match and its track (APP-16).
        if (BuildConfig.DEBUG && intent?.getBooleanExtra("watchSync", false) == true) {
            lifecycleScope.launch {
                graph.syncActivity.watchMatch(1, "United U12 v Strikers U12", sent = false)
                kotlinx.coroutines.delay(800)
                graph.syncActivity.watchMatch(1, "United U12 v Strikers U12", sent = true)
                for (chunk in 0 until 12) {
                    graph.syncActivity.watchTrack(1, chunk, 12)
                    kotlinx.coroutines.delay(500)
                }
                graph.syncActivity.watchMatch(2, "Thunder FC v Galaxy SC", sent = false)
                kotlinx.coroutines.delay(800)
                graph.syncActivity.watchMatch(2, "Thunder FC v Galaxy SC", sent = true)
            }
        }
        // For testing on an emulator (--el reminderIn 2700): a match reminder at once, for a kickoff that many seconds away (APP-6).
        if (BuildConfig.DEBUG && intent?.hasExtra("reminderIn") == true) {
            val left = java.time.Duration.ofSeconds(intent.getLongExtra("reminderIn", 2700))
            val kickoff = java.time.Instant.now().plus(left)
            getSystemService(android.app.NotificationManager::class.java)
                .createNotificationChannel(android.app.NotificationChannel(Reminders.CHANNEL, "Match reminders", android.app.NotificationManager.IMPORTANCE_DEFAULT))
            val time = app.lawfive.ui.formatTime(kickoff.atZone(java.time.ZoneId.systemDefault()), this)
            androidx.core.app.NotificationManagerCompat.from(this).notify(7303, matchNotification(this, Reminders.CHANNEL, "", "Strikers v Rovers",
                reminderText(time, "Central Park", left), 33.6, -117.6, null, kickoff, countdown = left <= COUNTDOWN_WITHIN))
        }
        // For testing on an emulator (--ez dayReminder true): the day before's reminder for two matches (APP-6).
        if (BuildConfig.DEBUG && intent?.getBooleanExtra("dayReminder", false) == true) {
            val lines = listOf("STR v ROV · 9:00 AM · Central Park", "LIO v TIG · 12:30 PM · Twin Creeks")
            lifecycleScope.launch {
                showReminder(this@MainActivity, ReminderNote("", "2 matches tomorrow", null, null, lines, java.time.Instant.now().plus(java.time.Duration.ofHours(16)), 33.6, -117.6))
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Back in the app: catch up with the server (and send anything waiting).
        lifecycleScope.launch { graph.refreshAccount() }
        graph.requestSync(0)
    }
}

/** The match a notification opens. */
const val EXTRA_MATCH = "app.lawfive.match"
