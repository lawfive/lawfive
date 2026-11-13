package app.lawfive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import app.lawfive.data.json
import app.lawfive.schema.Match
import app.lawfive.schema.MatchNotice
import app.lawfive.schema.MatchNoticeChange
import app.lawfive.schema.MatchNoticeMatchesItem
import app.lawfive.schema.Venue
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.formatTime
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlinx.coroutines.flow.first

// Matches from integrations (NOTE-1 to NOTE-4): an app with an API key, such as an assignor's, added,
// canceled, postponed, moved or removed matches. The push carries only the notice's id; the phone
// syncs (which also moves or drops its reminders), asks its server for the notice, and writes it.

/** A notice in words: one match says what happened to it; several say how many, with a line each. */
data class NoticeWords(
    val title: String,
    val text: String,
    /** One line a match, when there are several. */
    val lines: List<String>,
    /** The match a tap opens; none opens the match list. */
    val matchId: String?,
    /** A Directions button, for a match moved to another venue that's still on. */
    val directions: Boolean,
)

/** "Sat, Nov 7, 9:00 AM", in the match's own time zone. */
fun interface KickoffFormat {
    fun format(iso: String, timeZone: String?): String?
}

/** What happened to one match, as a notification's title says it: "Kickoff moved: Strikers v Rovers". */
internal fun headline(m: MatchNoticeMatchesItem): String {
    val c = m.changes
    val what = when {
        MatchNoticeChange.ADDED in c -> "New match"
        MatchNoticeChange.REMOVED in c -> "Removed"
        MatchNoticeChange.CANCELED in c -> "Canceled"
        MatchNoticeChange.POSTPONED in c -> "Postponed"
        MatchNoticeChange.BACK_ON in c -> "Back on"
        MatchNoticeChange.KICKOFF in c && MatchNoticeChange.VENUE in c -> "Kickoff and venue changed"
        MatchNoticeChange.KICKOFF in c -> "Kickoff moved"
        else -> "Venue changed"
    }
    return "$what: ${m.title}"
}

/** The rest: when and where it is now, and what it was when that's what changed. */
internal fun detail(m: MatchNoticeMatchesItem, time: KickoffFormat): String {
    val c = m.changes
    val kickoff = m.kickoff?.let { time.format(it, m.timeZone) }
    val before = m.previousKickoff?.let { time.format(it, m.timeZone) }
    val moved = MatchNoticeChange.KICKOFF in c && MatchNoticeChange.BACK_ON !in c
    val elsewhere = MatchNoticeChange.VENUE in c && MatchNoticeChange.BACK_ON !in c
    val parts = when {
        MatchNoticeChange.POSTPONED in c -> listOf(kickoff?.let { "Was $it" }, m.venue)
        moved && elsewhere -> listOf(listOfNotNull(kickoff?.let { "Now $it" } ?: "Now", m.venue?.let { "at $it" }).joinToString(" "),
            listOfNotNull(before?.let { "was $it" } ?: "was", m.previousVenue?.let { "at $it" }).joinToString(" ").takeUnless { it == "was" })
        moved -> listOf(kickoff?.let { "Now $it" }, before?.let { "was $it" }, m.venue)
        elsewhere -> listOf(m.venue?.let { "Now at $it" }, m.previousVenue?.let { "was $it" }, kickoff)
        else -> listOf(kickoff, m.venue)
    }
    return parts.filterNotNull().joinToString(" · ")
}

/** NOTE-3: a notice in words. */
fun noticeWords(notice: MatchNotice, time: KickoffFormat): NoticeWords? {
    val matches = notice.matches.filter { it.changes.isNotEmpty() }
    val one = matches.singleOrNull()
    if (one != null) {
        val gone = MatchNoticeChange.REMOVED in one.changes
        val on = gone || MatchNoticeChange.CANCELED in one.changes || MatchNoticeChange.POSTPONED in one.changes
        return NoticeWords(headline(one), detail(one, time), emptyList(), one.matchId.takeUnless { gone }, !on && MatchNoticeChange.VENUE in one.changes)
    }
    if (matches.isEmpty()) return null
    val allAdded = matches.all { MatchNoticeChange.ADDED in it.changes }
    val title = "${notice.source} ${if (allAdded) "added" else "changed"} ${matches.size} matches"
    val lines = matches.map { m -> listOf(if (allAdded) m.title else headline(m), m.kickoff?.let { time.format(it, m.timeZone) }).filterNotNull().joinToString(", ") }
    return NoticeWords(title, lines.first() + if (lines.size > 1) ", and ${lines.size - 1} more" else "", lines, null, false)
}

/** NOTE-3: syncs, asks the server what the integration did, and says so. */
class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    /** Only before Android 12, where this work runs as a foreground service for a moment. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        ensureChannel(applicationContext)
        val notification: Notification = lawFiveNotification(applicationContext, CHANNEL)
            .setContentTitle("Checking your matches")
            .build()
        return ForegroundInfo(FOREGROUND_ID, notification)
    }

    override suspend fun doWork(): Result {
        val graph = applicationContext.graph
        val id = inputData.getString("notice") ?: return Result.success()
        if (!graph.session.current.signedIn || !graph.reminders.settings.first().integrations || !graph.reminders.canNotify()) return Result.success()
        // The match list, the match page and the reminders follow straight away (APP-6).
        runCatching { graph.sync.sync() }
        val body = runCatching { graph.api.call("GET", "/v1/notices/$id") }.getOrNull() ?: return Result.retry()
        val notice = runCatching { json.decodeFromJsonElement(MatchNotice.serializer(), body) }.getOrNull() ?: return Result.success()
        val context = applicationContext
        val words = noticeWords(notice) { iso, zone ->
            runCatching {
                val t = ZonedDateTime.parse(iso).withZoneSameInstant(zone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault())
                "${formatShortDay(t)}, ${formatTime(t, context)}"
            }.getOrNull()
        } ?: return Result.success()
        ensureChannel(context)
        val mapsApp = graph.records.settings.first()?.mapsApp
        val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        words.matchId?.let { open.putExtra(EXTRA_MATCH, it) }
        val builder = lawFiveNotification(context, CHANNEL)
            .setContentTitle(words.title)
            .setContentText(words.text)
            .setSubText(notice.source.takeIf { words.matchId != null || words.lines.isEmpty() })
            .setContentIntent(PendingIntent.getActivity(context, id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            .setAutoCancel(true)
        if (words.lines.isNotEmpty()) {
            builder.setStyle(NotificationCompat.InboxStyle().also { style -> words.lines.take(6).forEach(style::addLine) }
                .setSummaryText(if (words.lines.size > 6) "and ${words.lines.size - 6} more" else null))
        } else {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(words.text))
        }
        if (words.directions && words.matchId != null) {
            placeOf(words.matchId)?.let { (lat, lon) ->
                val map = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(app.lawfive.ui.directionsUri(lat, lon, mapsApp)))
                builder.addAction(R.drawable.ph_directions, "Directions", PendingIntent.getActivity(context, id.hashCode() + 1, map, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            }
        }
        try {
            NotificationManagerCompat.from(context).notify("notice".hashCode() xor id.hashCode(), builder.build())
        } catch (_: SecurityException) {
            // Notifications turned off for the app since.
        }
        return Result.success()
    }

    /** Where the match is now, from this phone's copy: its pitch, else the venue's parking. */
    private suspend fun placeOf(matchId: String): Pair<Double, Double>? {
        val records = applicationContext.graph.db.records()
        val match = records.all("matches").firstNotNullOfOrNull { row -> runCatching { json.decodeFromString(Match.serializer(), row.json) }.getOrNull()?.takeIf { it.id == matchId } } ?: return null
        val venue = records.all("venues").firstNotNullOfOrNull { row -> runCatching { json.decodeFromString(Venue.serializer(), row.json) }.getOrNull()?.takeIf { it.id == match.venueId } } ?: return null
        val at = venue.pitches.firstOrNull { it.id == match.pitchId }?.position ?: venue.position ?: return null
        return at.lat to at.lon
    }

    companion object {
        const val CHANNEL = "integrations"
        private const val FOREGROUND_ID = 7303

        fun ensureChannel(context: Context) {
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Matches from integrations", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}
