package app.lawfive

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.work.CoroutineWorker
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.lawfive.data.json
import app.lawfive.schema.Match
import app.lawfive.schema.Venue
import app.lawfive.ui.formatTime
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.matchTitle
import app.lawfive.ui.zoneOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.util.concurrent.TimeUnit

// Match reminders on the phone (APP-6): their own settings, off until turned on, so someone using
// the calendar feed doesn't get two; minutes before kickoff (15-minute steps up to 3 hours,
// several), the day before and the day of at chosen times, as the calendar's (CAL-3). Scheduled
// with WorkManager for the next fortnight's matches, again after every sync.

private val Context.reminderStore: DataStore<Preferences> by preferencesDataStore("reminders")

data class ReminderSettings(
    val enabled: Boolean = false,
    val minutesBefore: List<Int> = listOf(60),
    /** "19:00", or null for none. */
    val dayBefore: String? = null,
    val dayOf: String? = null,
    /** PUSH-5: new weather risks, from the server. */
    val weatherRisks: Boolean = false,
    /** NOTE-4: matches an integration added or changed, from the server. */
    val integrations: Boolean = false,
)

class Reminders(private val context: Context) {
    private object Keys {
        val enabled = booleanPreferencesKey("enabled")
        val minutes = stringPreferencesKey("minutes")
        val dayBefore = stringPreferencesKey("dayBefore")
        val dayOf = stringPreferencesKey("dayOf")
        val weatherRisks = booleanPreferencesKey("weatherRisks")
        val integrations = booleanPreferencesKey("integrations")
    }

    val settings: Flow<ReminderSettings> = context.reminderStore.data.map { p ->
        ReminderSettings(
            enabled = p[Keys.enabled] ?: false,
            minutesBefore = p[Keys.minutes]?.split(",")?.mapNotNull { it.toIntOrNull() } ?: listOf(60),
            dayBefore = p[Keys.dayBefore]?.ifEmpty { null },
            dayOf = p[Keys.dayOf]?.ifEmpty { null },
            weatherRisks = p[Keys.weatherRisks] ?: false,
            integrations = p[Keys.integrations] ?: false,
        )
    }

    suspend fun update(s: ReminderSettings) {
        context.reminderStore.edit {
            it[Keys.enabled] = s.enabled
            it[Keys.minutes] = s.minutesBefore.sorted().joinToString(",")
            it[Keys.dayBefore] = s.dayBefore ?: ""
            it[Keys.dayOf] = s.dayOf ?: ""
            it[Keys.weatherRisks] = s.weatherRisks
            it[Keys.integrations] = s.integrations
        }
        reschedule()
        runCatching { context.graph.push.refresh() }
    }

    fun canNotify(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Every reminder for the next fortnight's scheduled matches, from scratch. */
    suspend fun reschedule() {
        val work = WorkManager.getInstance(context)
        work.cancelAllWorkByTag(TAG)
        val s = settings.first()
        if (!s.enabled) return
        val graph = context.graph
        val now = Instant.now()
        val horizon = now.plus(Duration.ofDays(14))
        val matches = graph.db.records().all("matches").mapNotNull { runCatching { json.decodeFromString(Match.serializer(), it.json) }.getOrNull() }
        val venues = graph.db.records().all("venues").mapNotNull { runCatching { json.decodeFromString(Venue.serializer(), it.json) }.getOrNull() }.associateBy { it.id }
        for (m in matches) {
            if (m.status != "scheduled") continue
            val kickoff = kickoffAt(m) ?: continue
            if (kickoff.toInstant().isBefore(now) || kickoff.toInstant().isAfter(horizon)) continue
            val zone = zoneOf(m)
            val times = s.minutesBefore.map { kickoff.minusMinutes(it.toLong()).toInstant() } +
                listOfNotNull(
                    s.dayBefore?.let { kickoff.toLocalDate().minusDays(1).atTime(LocalTime.parse(it)).atZone(zone).toInstant() },
                    // The day of: only if it's before kickoff.
                    s.dayOf?.let { kickoff.toLocalDate().atTime(LocalTime.parse(it)).atZone(zone).toInstant() }?.takeIf { it.isBefore(kickoff.toInstant()) },
                )
            val where = listOfNotNull(venues[m.venueId]?.name).joinToString()
            val venue = venues[m.venueId]
            val place = venue?.pitches?.firstOrNull { it.id == m.pitchId }?.position ?: venue?.position
            for (at in times.distinct()) {
                if (!at.isAfter(now)) continue
                val request = OneTimeWorkRequestBuilder<ReminderWorker>()
                    .setInitialDelay(Duration.between(now, at).toMillis(), TimeUnit.MILLISECONDS)
                    .setInputData(workDataOf("match" to m.id, "title" to matchTitle(m), "kickoff" to kickoff.toInstant().toEpochMilli(),
                        "time" to formatTime(kickoff, context), "where" to where, "lat" to (place?.lat ?: Double.NaN), "lon" to (place?.lon ?: Double.NaN)))
                    .addTag(TAG)
                    .build()
                work.enqueue(request)
            }
        }
    }

    companion object {
        const val TAG = "reminder"
        const val CHANNEL = "reminders"
    }
}

/** APP-24: every notification of the app's: the LawFive mark in the status bar, and the brand green on it and the app's name in the shade. */
internal fun lawFiveNotification(context: Context, channel: String): NotificationCompat.Builder =
    NotificationCompat.Builder(context, channel)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(ContextCompat.getColor(context, R.color.brand))

/** APP-6: from this close to kickoff, a reminder counts down to it live instead of saying "in 45 min". */
internal val COUNTDOWN_WITHIN: Duration = Duration.ofHours(3)

/** APP-6: "11:30 AM · Central Park" when it counts down; further off, "11:30 AM in 5 hours · Central Park" or "tomorrow". */
internal fun reminderText(time: String?, where: String?, left: Duration): String {
    val whenText = when {
        left <= COUNTDOWN_WITHIN -> null
        left.toHours() < 20 -> "in ${Math.round(left.toMinutes() / 60.0)} hours"
        else -> "tomorrow"
    }
    return listOfNotNull(listOfNotNull(time, whenText).joinToString(" ").ifEmpty { null }, where?.ifEmpty { null }).joinToString(" · ")
}

/**
 * A notification about a match (APP-6, PUSH-5): tapping it opens the match, and with a place to go,
 * Directions opens the map. A reminder passes its kickoff: it goes then, and close to it counts down to it.
 */
internal fun matchNotification(context: Context, channel: String, matchId: String, title: String?, text: String, lat: Double?, lon: Double?, mapsApp: String?,
                               kickoff: Instant? = null, countdown: Boolean = false): android.app.Notification {
    val open = Intent(context, MainActivity::class.java).putExtra(EXTRA_MATCH, matchId).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val builder = lawFiveNotification(context, channel)
        .setContentTitle(title)
        .setContentText(text)
        .setContentIntent(PendingIntent.getActivity(context, matchId.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .setAutoCancel(true)
    if (kickoff != null) {
        builder.setTimeoutAfter(maxOf(Duration.between(Instant.now(), kickoff).toMillis(), 1))
        if (countdown) builder.setWhen(kickoff.toEpochMilli()).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
    }
    if (lat != null && lon != null) {
        val map = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(app.lawfive.ui.directionsUri(lat, lon, mapsApp)))
        builder.addAction(R.drawable.ph_directions, "Directions", PendingIntent.getActivity(context, matchId.hashCode() + 1, map, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    }
    return builder.build()
}

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(Reminders.CHANNEL, "Match reminders", NotificationManager.IMPORTANCE_DEFAULT))
        if (!applicationContext.graph.reminders.canNotify()) return Result.success()
        val kickoff = Instant.ofEpochMilli(inputData.getLong("kickoff", 0))
        val left = Duration.between(Instant.now(), kickoff)
        if (left.isNegative) return Result.success()
        val text = reminderText(inputData.getString("time"), inputData.getString("where"), left)
        val notification = matchNotification(applicationContext, Reminders.CHANNEL, inputData.getString("match") ?: "", inputData.getString("title"), text,
            inputData.getDouble("lat", Double.NaN).takeUnless { it.isNaN() }, inputData.getDouble("lon", Double.NaN).takeUnless { it.isNaN() },
            applicationContext.graph.records.settings.first()?.mapsApp, kickoff, countdown = left <= COUNTDOWN_WITHIN)
        try {
            NotificationManagerCompat.from(applicationContext).notify(inputData.getString("match").hashCode(), notification)
        } catch (_: SecurityException) {
            // Notifications turned off for the app since.
        }
        return Result.success()
    }
}
