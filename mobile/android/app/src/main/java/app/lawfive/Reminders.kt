package app.lawfive

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.lawfive.data.json
import app.lawfive.schema.Match
import app.lawfive.schema.UserSettings
import app.lawfive.schema.Venue
import app.lawfive.ui.formatTime
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.matchTitle
import app.lawfive.ui.teamAlias
import app.lawfive.ui.zoneOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

// Match reminders on the phone (APP-6, APP-28). Each phone has its own switch, off until turned on, so
// someone using the calendar feed doesn't get two; the times are the account's, shared with the
// calendar feed and the other phones (CAL-3): minutes before kickoff (15-minute steps up to 3 hours,
// several), and the day before and the day of at chosen times, one notification for all the matches
// it's about. Scheduled for the next fortnight's matches, again after every sync: as exact alarms
// where the phone allows them (APP-28), otherwise with WorkManager, which Android can hold back a
// few minutes.

private val Context.reminderStore: DataStore<Preferences> by preferencesDataStore("reminders")

/** What's this phone's own: whether it reminds, and the notifications from the server (PUSH-5, NOTE-4). */
data class ReminderSettings(
    val enabled: Boolean = false,
    /** PUSH-5: new weather risks, from the server. */
    val weatherRisks: Boolean = false,
    /** NOTE-4: matches an integration added or changed, from the server. */
    val integrations: Boolean = false,
)

/** APP-6, CAL-3: when reminders go, as the account has them. */
data class ReminderTimes(val minutesBefore: List<Int> = listOf(60), val dayBefore: String? = null, val dayOf: String? = null) {
    /** Into the account's settings as the website writes them: all three, so a single reminder from before stops applying. */
    fun into(s: UserSettings): UserSettings =
        s.copy(calendarReminders = minutesBefore.distinct().sortedDescending(), calendarDayBefore = dayBefore, calendarDayOf = dayOf)

    companion object {
        /** CAL-3: every 15 minutes up to 3 hours before kickoff. */
        val STEPS = (15..180 step 15).toList()

        /**
         * The account's reminders, as the website's Calendar settings show them (CalendarReminders in
         * web/src/pages/Calendar.tsx): an account that has never chosen several keeps its one reminder
         * (an hour before when it has none), a day's notice being the evening before at 7:00 PM.
         */
        fun of(s: UserSettings?): ReminderTimes {
            if (s == null) return ReminderTimes()
            if (s.calendarReminders != null || s.calendarDayBefore != null || s.calendarDayOf != null) {
                return ReminderTimes(s.calendarReminders ?: emptyList(), s.calendarDayBefore, s.calendarDayOf)
            }
            val legacy = s.calendarReminderMin ?: 60
            return ReminderTimes(if (legacy in STEPS) listOf(legacy) else emptyList(), if (legacy == 1440) "19:00" else null)
        }
    }
}

/**
 * APP-6: before the times were the account's, each phone kept its own. The first sync after uploads
 * them when the account has never chosen any (and they were in use here: reminders on, or times
 * other than the starting ones); otherwise the account's win. Null: nothing to upload.
 */
internal fun timesToUpload(phone: ReminderTimes?, enabled: Boolean, account: UserSettings?): ReminderTimes? {
    if (phone == null) return null
    val chosen = account != null && (account.calendarReminders != null || account.calendarDayBefore != null || account.calendarDayOf != null)
    return phone.takeIf { !chosen && (enabled || it != ReminderTimes()) }
}

/** A match as its reminders put it. */
internal data class ReminderMatch(
    val id: String, val title: String,
    /** "STR v ROV" (SET-5). */
    val short: String,
    val kickoff: ZonedDateTime, val where: String?, val lat: Double?, val lon: Double?,
)

/** APP-6: the day a day's reminder is about. */
internal enum class ReminderDay(val word: String) { BEFORE("tomorrow"), OF("today") }

/** One notification: before one match's kickoff, or the day before or the day of for every match whose reminder lands then. */
internal data class PlannedReminder(val at: Instant, val matches: List<ReminderMatch>, val day: ReminderDay? = null) {
    /** For an alarm or a job, and for a notification that replaces its match's earlier one. */
    val key: String get() = if (matches.size == 1) "${matches[0].id}-${at.toEpochMilli()}" else "day-${day?.name}-${at.toEpochMilli()}"
}

/**
 * APP-6: every reminder for the scheduled matches kicking off in the next fortnight (not canceled,
 * postponed or played), soonest first. The day's times are in each match's own time zone (CAL-3); the
 * day-of one only for matches that kick off after it; and a day's one leaves out a match that has a
 * reminder before kickoff at that very moment.
 */
internal fun planReminders(times: ReminderTimes, matches: List<Match>, venues: Map<String, Venue>, now: Instant): List<PlannedReminder> {
    val horizon = now.plus(Duration.ofDays(14))
    val planned = mutableListOf<PlannedReminder>()
    val days = linkedMapOf<Pair<ReminderDay, Instant>, MutableList<ReminderMatch>>()
    for (m in matches) {
        if (m.status != "scheduled") continue
        val kickoff = kickoffAt(m) ?: continue
        if (!kickoff.toInstant().isAfter(now) || kickoff.toInstant().isAfter(horizon)) continue
        val venue = venues[m.venueId]
        val place = venue?.pitches?.firstOrNull { it.id == m.pitchId }?.position ?: venue?.position
        val r = ReminderMatch(m.id, matchTitle(m), "${teamAlias(m.home, m.away, true)} v ${teamAlias(m.away, m.home, false)}", kickoff,
            venue?.name?.ifEmpty { null }, place?.lat, place?.lon)
        val before = times.minutesBefore.distinct().map { kickoff.minusMinutes(it.toLong()).toInstant() }.filter { it.isAfter(now) }
        before.forEach { planned += PlannedReminder(it, listOf(r)) }
        fun on(date: java.time.LocalDate, time: String?) = time?.let { runCatching { LocalTime.parse(it) }.getOrNull() }?.let { date.atTime(it).atZone(zoneOf(m)).toInstant() }
        val dayBefore = on(kickoff.toLocalDate().minusDays(1), times.dayBefore)
        val dayOf = on(kickoff.toLocalDate(), times.dayOf)?.takeIf { it.isBefore(kickoff.toInstant()) }
        for ((day, at) in listOf(ReminderDay.BEFORE to dayBefore, ReminderDay.OF to dayOf)) {
            if (at == null || !at.isAfter(now) || at in before) continue
            days.getOrPut(day to at) { mutableListOf() } += r
        }
    }
    days.forEach { (key, list) -> planned += PlannedReminder(key.second, list.sortedBy { it.kickoff.toInstant() }, key.first) }
    return planned.sortedWith(compareBy({ it.at }, { it.matches.first().kickoff.toInstant() }))
}

/** APP-6: a day's line for a match: "STR v ROV · 9:00 AM · Central Park". */
internal fun dayLine(m: ReminderMatch, use24Hour: Boolean): String = listOfNotNull(m.short, formatTime(m.kickoff, use24Hour), m.where).joinToString(" · ")

/** APP-6: "2 matches tomorrow", "3 matches today". */
internal fun dayTitle(count: Int, day: ReminderDay): String = "$count matches ${day.word}"

/**
 * What a planned reminder's notification needs, through an alarm's intent or a job's data. Words that
 * depend on how long is left are written when it shows.
 */
internal data class ReminderNote(
    /** The match a tap opens: the day's first. */
    val match: String,
    val title: String,
    /** One match: its kickoff time and venue. */
    val time: String?,
    val where: String?,
    /** Several: a line for each. */
    val lines: List<String>,
    /** The kickoff it leaves the shade at: the last one's for a day's. */
    val kickoff: Instant,
    val lat: Double?,
    val lon: Double?,
) {
    /** One match: its own notification, which the next reminder for it replaces. */
    val notificationId: Int get() = if (lines.size > 1) "day-$match-$title".hashCode() else match.hashCode()

    fun toBundle(): Bundle = Bundle().apply {
        putString("match", match); putString("title", title); putString("time", time); putString("where", where)
        putStringArray("lines", lines.toTypedArray()); putLong("kickoff", kickoff.toEpochMilli())
        putDouble("lat", lat ?: Double.NaN); putDouble("lon", lon ?: Double.NaN)
    }

    fun toData(): Data = Data.Builder()
        .putString("match", match).putString("title", title).putString("time", time).putString("where", where)
        .putStringArray("lines", lines.toTypedArray()).putLong("kickoff", kickoff.toEpochMilli())
        .putDouble("lat", lat ?: Double.NaN).putDouble("lon", lon ?: Double.NaN)
        .build()

    companion object {
        fun of(p: PlannedReminder, use24Hour: Boolean): ReminderNote {
            val first = p.matches.first()
            val several = p.matches.size > 1 && p.day != null
            return ReminderNote(
                match = first.id,
                title = if (several) dayTitle(p.matches.size, p.day!!) else first.title,
                time = formatTime(first.kickoff, use24Hour),
                where = first.where,
                lines = if (several) p.matches.map { dayLine(it, use24Hour) } else emptyList(),
                kickoff = p.matches.maxOf { it.kickoff.toInstant() },
                lat = first.lat, lon = first.lon,
            )
        }

        fun of(b: Bundle) = ReminderNote(
            b.getString("match") ?: "", b.getString("title") ?: "", b.getString("time"), b.getString("where"),
            b.getStringArray("lines")?.toList() ?: emptyList(), Instant.ofEpochMilli(b.getLong("kickoff")),
            b.getDouble("lat", Double.NaN).takeUnless { it.isNaN() }, b.getDouble("lon", Double.NaN).takeUnless { it.isNaN() },
        )

        fun of(d: Data) = ReminderNote(
            d.getString("match") ?: "", d.getString("title") ?: "", d.getString("time"), d.getString("where"),
            d.getStringArray("lines")?.toList() ?: emptyList(), Instant.ofEpochMilli(d.getLong("kickoff", 0)),
            d.getDouble("lat", Double.NaN).takeUnless { it.isNaN() }, d.getDouble("lon", Double.NaN).takeUnless { it.isNaN() },
        )
    }
}

class Reminders(private val context: Context, private val records: app.lawfive.data.Records) {
    private object Keys {
        val enabled = booleanPreferencesKey("enabled")
        val weatherRisks = booleanPreferencesKey("weatherRisks")
        val integrations = booleanPreferencesKey("integrations")
        /** The phone's own times from before they were the account's, until the first sync uploads or forgets them. */
        val minutes = stringPreferencesKey("minutes")
        val dayBefore = stringPreferencesKey("dayBefore")
        val dayOf = stringPreferencesKey("dayOf")
        /** APP-28: the alarms set, to cancel next time. */
        val alarms = stringSetPreferencesKey("alarms")
    }

    private val scheduling = Mutex()

    val settings: Flow<ReminderSettings> = context.reminderStore.data.map { p ->
        ReminderSettings(
            enabled = p[Keys.enabled] ?: false,
            weatherRisks = p[Keys.weatherRisks] ?: false,
            integrations = p[Keys.integrations] ?: false,
        )
    }

    /** The account's times, shared with the calendar feed and the other phones (CAL-3). */
    val times: Flow<ReminderTimes> get() = records.settingsOrDefaults.map { ReminderTimes.of(it) }

    suspend fun update(s: ReminderSettings) {
        save(s)
        reschedule()
        runCatching { context.graph.push.refresh() }
    }

    /** This phone's switches alone, nothing scheduled (the snapshot tests use it). */
    internal suspend fun save(s: ReminderSettings) {
        context.reminderStore.edit {
            it[Keys.enabled] = s.enabled
            it[Keys.weatherRisks] = s.weatherRisks
            it[Keys.integrations] = s.integrations
        }
    }

    /** CAL-3: new times for the account, which the calendar feed and the other phones follow. */
    suspend fun updateTimes(next: ReminderTimes) {
        records.saveSettings { next.into(it) }
        reschedule()
    }

    fun canNotify(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** APP-28: reminders can go on the minute ("Alarms & reminders", needed from Android 12). */
    fun exactAlarms(): Boolean = Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    /** After a sync: the phone's times from before go to the account if it has none (once), then every reminder again. */
    suspend fun afterSync() {
        runCatching { adoptPhoneTimes() }
        reschedule()
    }

    private suspend fun adoptPhoneTimes() {
        val p = context.reminderStore.data.first()
        val minutes = p[Keys.minutes] ?: return
        val phone = ReminderTimes(
            minutes.split(",").mapNotNull { it.toIntOrNull() }.filter { it in ReminderTimes.STEPS }.distinct().take(12),
            p[Keys.dayBefore]?.ifEmpty { null }, p[Keys.dayOf]?.ifEmpty { null },
        )
        timesToUpload(phone, p[Keys.enabled] ?: false, records.settings.first())?.let { up -> records.saveSettings { up.into(it) } }
        context.reminderStore.edit {
            it.remove(Keys.minutes)
            it.remove(Keys.dayBefore)
            it.remove(Keys.dayOf)
        }
    }

    /** Every reminder for the next fortnight's scheduled matches, from scratch. */
    suspend fun reschedule() = scheduling.withLock {
        val work = WorkManager.getInstance(context)
        work.cancelAllWorkByTag(TAG)
        val alarms = context.getSystemService(AlarmManager::class.java)
        context.reminderStore.data.first()[Keys.alarms].orEmpty().forEach { key ->
            PendingIntent.getBroadcast(context, 0, alarmIntent(key), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)?.let {
                alarms.cancel(it)
                it.cancel()
            }
        }
        val set = mutableSetOf<String>()
        try {
            if (!settings.first().enabled) return@withLock
            val graph = context.graph
            val now = Instant.now()
            val matches = graph.db.records().all("matches").mapNotNull { runCatching { json.decodeFromString(Match.serializer(), it.json) }.getOrNull() }
            val venues = graph.db.records().all("venues").mapNotNull { runCatching { json.decodeFromString(Venue.serializer(), it.json) }.getOrNull() }.associateBy { it.id }
            val use24Hour = DateFormat.is24HourFormat(context)
            val exact = exactAlarms()
            for (p in planReminders(times.first(), matches, venues, now)) {
                val note = ReminderNote.of(p, use24Hour)
                // APP-28: on the minute where the phone allows it; otherwise when Android lets the job run.
                if (exact) {
                    val pending = PendingIntent.getBroadcast(context, 0, alarmIntent(p.key).putExtras(note.toBundle()),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    try {
                        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, p.at.toEpochMilli(), pending)
                        set += p.key
                        continue
                    } catch (_: SecurityException) {
                        // Taken away just now: a job instead.
                    }
                }
                work.enqueue(OneTimeWorkRequestBuilder<ReminderWorker>()
                    .setInitialDelay(Duration.between(now, p.at).toMillis(), TimeUnit.MILLISECONDS)
                    .setInputData(note.toData())
                    .addTag(TAG)
                    .build())
            }
        } finally {
            context.reminderStore.edit { it[Keys.alarms] = set }
        }
    }

    /** One alarm's intent, told apart from the others by its address. */
    private fun alarmIntent(key: String) = Intent(context, ReminderAlarmReceiver::class.java)
        .setAction(ALARM_ACTION)
        .setData(Uri.parse("lawfive-reminder://$key"))

    companion object {
        const val TAG = "reminder"
        const val CHANNEL = "reminders"
        private const val ALARM_ACTION = "app.lawfive.REMINDER"
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
 * With lines (a day's matches, APP-6), it opens to show them all.
 */
internal fun matchNotification(context: Context, channel: String, matchId: String, title: String?, text: String, lat: Double?, lon: Double?, mapsApp: String?,
                               kickoff: Instant? = null, countdown: Boolean = false, lines: List<String> = emptyList()): android.app.Notification {
    val open = Intent(context, MainActivity::class.java).putExtra(EXTRA_MATCH, matchId).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val builder = lawFiveNotification(context, channel)
        .setContentTitle(title)
        .setContentText(text)
        .setContentIntent(PendingIntent.getActivity(context, matchId.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        .setAutoCancel(true)
    if (lines.size > 1) {
        builder.setStyle(NotificationCompat.InboxStyle().also { style -> lines.forEach { style.addLine(it) } })
    }
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

/** APP-6: shows a reminder when it's due, unless its (last) match has kicked off by then. */
internal suspend fun showReminder(context: Context, note: ReminderNote) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(Reminders.CHANNEL, "Match reminders", NotificationManager.IMPORTANCE_DEFAULT))
    val graph = context.graph
    if (!graph.reminders.canNotify()) return
    val left = Duration.between(Instant.now(), note.kickoff)
    if (left.isNegative) return
    val several = note.lines.size > 1
    val text = if (several) note.lines.first() else reminderText(note.time, note.where, left)
    val notification = matchNotification(context, Reminders.CHANNEL, note.match, note.title, text, note.lat, note.lon,
        graph.records.settings.first()?.mapsApp, note.kickoff, countdown = !several && left <= COUNTDOWN_WITHIN, lines = note.lines)
    try {
        NotificationManagerCompat.from(context).notify(note.notificationId, notification)
    } catch (_: SecurityException) {
        // Notifications turned off for the app since.
    }
}

/** APP-6: a reminder Android lets run when it can, where exact alarms aren't allowed (APP-28). */
class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        showReminder(applicationContext, ReminderNote.of(inputData))
        return Result.success()
    }
}

/** APP-28: a reminder's exact alarm. */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val extras = intent.extras ?: return
        val done = goAsync()
        context.graph.scope.launch {
            try {
                showReminder(context.applicationContext, ReminderNote.of(extras))
            } finally {
                done.finish()
            }
        }
    }
}

/**
 * APP-28: exact alarms are cleared when the phone restarts and when the app is updated, a new clock
 * time or time zone moves them, and "Alarms & reminders" can be allowed later: each sets them all again.
 */
class RemindersRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in ACTIONS) return
        val done = goAsync()
        context.graph.scope.launch {
            try {
                runCatching { context.graph.reminders.reschedule() }
            } finally {
                done.finish()
            }
        }
    }

    private companion object {
        val ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED,
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED,
        )
    }
}
