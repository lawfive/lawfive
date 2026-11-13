package app.lawfive.data

import app.lawfive.schema.Event
import app.lawfive.schema.EventAbandonment
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventClockAdjusted
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventInjury
import app.lawfive.schema.EventPenaltyKick
import app.lawfive.schema.EventPeriodEnd
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.EventStoppage
import app.lawfive.schema.EventSuspension
import app.lawfive.schema.MatchFormat
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchRecordPenalties
import app.lawfive.schema.MatchRecordScore
import app.lawfive.schema.OffenderPlayer
import app.lawfive.schema.MisconductScheme
import app.lawfive.schema.PeriodPlayed
import android.content.Context

// Correcting a result (RES-1 to RES-6): the website's rules (schema/src/result.ts), tested with the
// same cases (ResultTest). The score is the goals, a second caution to the same player is a send-off
// (and a second sin bin, EVT-12), and a minute is written as a referee writes it.

/** Where and when an event happened, whatever kind it is. */
val Event.whenText: String get() = when (this) {
    is EventGoal -> `when`; is EventCaution -> `when`; is EventSecondCaution -> `when`; is EventSendOff -> `when`
    is EventSinBin -> `when`; is EventSecondSinBin -> `when`
    is EventStoppage -> `when`; is EventPeriodEnd -> `when`; is EventPenaltyKick -> `when`; is EventInjury -> `when`
    is EventSuspension -> `when`; is EventAbandonment -> `when`; is EventClockAdjusted -> `when`; else -> "play"
}
val Event.periodOf: Long? get() = when (this) {
    is EventGoal -> period; is EventCaution -> period; is EventSecondCaution -> period; is EventSendOff -> period
    is EventSinBin -> period; is EventSecondSinBin -> period
    is EventStoppage -> period; is EventPeriodEnd -> period; is EventPenaltyKick -> period; is EventInjury -> period
    is EventSuspension -> period; is EventAbandonment -> period; is EventClockAdjusted -> period; else -> null
}
val Event.periodSecOf: Long? get() = when (this) {
    is EventGoal -> periodSec; is EventCaution -> periodSec; is EventSecondCaution -> periodSec; is EventSendOff -> periodSec
    is EventSinBin -> periodSec; is EventSecondSinBin -> periodSec
    is EventStoppage -> periodSec; is EventPeriodEnd -> periodSec; is EventPenaltyKick -> periodSec; is EventInjury -> periodSec
    is EventSuspension -> periodSec; is EventAbandonment -> periodSec; is EventClockAdjusted -> periodSec; else -> null
}

/** RES-1: the score is the goals. */
fun scoreOf(events: List<Event>): MatchRecordScore =
    MatchRecordScore(events.count { it is EventGoal && it.team == "home" }.toLong(), events.count { it is EventGoal && it.team == "away" }.toLong())

/** The shoot-out's score from its kicks, or null when there wasn't one. */
fun penaltiesOf(events: List<Event>): MatchRecordPenalties? {
    val kicks = events.filterIsInstance<EventPenaltyKick>()
    if (kicks.isEmpty()) return null
    return MatchRecordPenalties(kicks.count { it.scored && it.team == "home" }.toLong(), kicks.count { it.scored && it.team == "away" }.toLong())
}

/**
 * RES-6: a second caution to the same numbered player of the same team is a second caution; one that's
 * no longer second is a caution. EVT-12: sin bins the same way, on their own: a second sin bin for the
 * same number is a second sin bin (a send-off), one no longer second a sin bin; a sin bin and a caution
 * don't combine (Q-22).
 */
fun settleCautions(events: List<Event>): List<Event> {
    val cautioned = mutableSetOf<String>()
    val binned = mutableSetOf<String>()
    return events.map { e ->
        val (team, offender) = when (e) {
            is EventCaution -> e.team to e.offender
            is EventSecondCaution -> e.team to e.offender
            is EventSinBin -> e.team to e.offender
            is EventSecondSinBin -> e.team to e.offender
            else -> return@map e
        }
        // As the website's `!number`: no number, or 0, is left as it is.
        val number = (offender as? OffenderPlayer)?.number?.takeIf { it != 0 } ?: return@map e
        val seen = if (e is EventCaution || e is EventSecondCaution) cautioned else binned
        val second = !seen.add("$team $number")
        when {
            second && e is EventCaution -> EventSecondCaution(`when` = e.`when`, period = e.period, periodSec = e.periodSec, at = e.at, team = e.team, offender = e.offender, misconduct = e.misconduct)
            !second && e is EventSecondCaution -> EventCaution(`when` = e.`when`, period = e.period, periodSec = e.periodSec, at = e.at, team = e.team, offender = e.offender, misconduct = e.misconduct)
            second && e is EventSinBin -> EventSecondSinBin(`when` = e.`when`, period = e.period, periodSec = e.periodSec, at = e.at, team = e.team, offender = e.offender, misconduct = e.misconduct, lengthSec = e.lengthSec)
            !second && e is EventSecondSinBin -> EventSinBin(`when` = e.`when`, period = e.period, periodSec = e.periodSec, at = e.at, team = e.team, offender = e.offender, misconduct = e.misconduct, lengthSec = e.lengthSec)
            else -> e
        }
    }
}

private fun span(format: MatchFormat, period: Int): Pair<Int, Int> {
    val regular = period <= format.periods
    val length = (if (regular) format.periodSec else format.extraTimePeriodSec) / 60
    val start = if (regular) (period - 1) * format.periodSec / 60
    else format.periods * format.periodSec / 60 + (period - format.periods - 1) * format.extraTimePeriodSec / 60
    return start to length
}

private val minutePattern = Regex("""^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$""")

/** RES-1: "23" or "45+2" (an apostrophe allowed) to seconds into the period, or null when it isn't in it. */
fun periodSecOf(format: MatchFormat, period: Int, text: String): Long? {
    val parsed = minutePattern.find(text.trim().trimEnd('\'', '’')) ?: return null
    val (start, length) = span(format, period)
    val minute = parsed.groupValues[1].toInt()
    val added = parsed.groupValues[2].takeIf { it.isNotEmpty() }?.toInt()
    if (added != null) return if (minute == start + length && added >= 1) (length + added - 1) * 60L else null
    val into = minute - start
    return if (into in 1..length) (into - 1) * 60L else null
}

/** The minute an event shows as, "23'" or "45+2'". */
fun minuteText(format: MatchFormat, period: Int, periodSec: Long): String {
    val (start, length) = span(format, period)
    val minute = (periodSec / 60).toInt() + 1
    return if (minute > length) "${start + length}+${minute - length}'" else "${start + minute}'"
}

/** RES-1: a result after editing its events: in order, cautions settled, the score and shoot-out from them. */
fun withEvents(record: MatchRecord, events: List<Event>): MatchRecord {
    val order = mapOf("beforeKickoff" to 0, "play" to 1, "break" to 1, "afterFullTime" to 2, "penalties" to 3)
    val sorted = events.withIndex().sortedWith(
        compareBy<IndexedValue<Event>> { order[it.value.whenText] ?: 1 }
            .thenBy { if (it.value.whenText == "play" || it.value.whenText == "break") it.value.periodOf ?: 0 else 0 }
            .thenBy { if (it.value.whenText == "break") 1 else 0 }
            .thenBy { if (it.value.whenText == "play") it.value.periodSecOf ?: 0 else 0 }
            .thenBy { it.index },
    ).map { it.value }
    val settled = settleCautions(sorted)
    return record.copy(events = settled, score = scoreOf(settled), penalties = penaltiesOf(settled))
}

/** RES-2: the periods of a match entered without a watch, from its format. */
fun periodsFromFormat(format: MatchFormat): List<PeriodPlayed> =
    (1..format.periods).map { PeriodPlayed(period = it.toLong(), extraTime = false, playedSec = format.periodSec.toLong()) }

/** RES-1: a misconduct scheme's codes, bundled from schema/misconduct/; null for one the app doesn't know. */
fun misconductScheme(context: Context, id: String): MisconductScheme? =
    runCatching { context.assets.open("$id.json").bufferedReader().use { json.decodeFromString(MisconductScheme.serializer(), it.readText()) } }.getOrNull()
