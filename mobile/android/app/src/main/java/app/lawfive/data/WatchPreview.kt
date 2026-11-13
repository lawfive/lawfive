package app.lawfive.data

import app.lawfive.schema.WatchScreen
import kotlin.math.max
import kotlin.math.min

// UI-21 to UI-24, UI-27: the match screen's choices, and what the screen shows at a moment of a match,
// for the setup's pictures. The same as the website's (schema/src/screen.ts, web/src/watchPreview.ts),
// and the clock readings the watches' own rules, tested with the same cases.

/** The account's match screen, complete. Left out, a choice is the old layouts' (one clock with names). */
data class ScreenSetup(
    val clocks: String = "one",
    val mainClock: String = "up",
    val secondClock: String = "down",
    val breakClock: String = "down",
    val edge: String = "none",
    val names: Boolean = true,
) {
    /** UI-24: the nearest of the six old layouts, for watch builds that only know those. */
    val nearestLayout get() = when {
        clocks == "stacked" -> "stacked"
        clocks == "sideBySide" -> "sideBySide"
        !names -> "minimal"
        edge == "ring" -> "ring"
        else -> "default"
    }

    /** As it's saved in the account's settings. */
    fun saved(changedAt: String) = WatchScreen(
        layout = nearestLayout, secondClock = secondStyle(mainClock, secondClock), clocks = clocks, mainClock = mainClock,
        breakClock = breakClock, edge = edge, names = names, changedAt = changedAt,
    )

    companion object {
        /** UI-24: what watches show until one is chosen: two clocks stacked, the time left over the match time, with the time of day and names. */
        val DEFAULT = ScreenSetup(clocks = "stacked", mainClock = "down", secondClock = "up", edge = "time")

        /** From a saved setup of any age: fields it lacks come from its layout; Scoreboard was dropped. */
        fun of(saved: WatchScreen?): ScreenSetup {
            if (saved == null) return DEFAULT
            val main = saved.mainClock ?: "up"
            return ScreenSetup(
                clocks = saved.clocks ?: when (saved.layout) { "stacked" -> "stacked"; "sideBySide" -> "sideBySide"; else -> "one" },
                mainClock = main,
                secondClock = secondStyle(main, saved.secondClock),
                breakClock = saved.breakClock ?: "down",
                edge = saved.edge ?: if (saved.layout == "ring") "ring" else "none",
                names = saved.names ?: (saved.layout != "minimal"),
            )
        }
    }
}

/** UI-22: the second clock is never a copy of the match clock. */
fun secondStyle(main: String, second: String) = if (second != main) second else if (main == "down") "upEach" else "down"

/** A 2 × 45 match with a 15-minute half-time and a 2-minute halfway break: what the pictures show. */
object PreviewFormat {
    const val PERIODS = 2
    const val PERIOD_SEC = 45 * 60
    const val HALFTIME_SEC = 15 * 60
    const val BREAK_SEC = 2 * 60
}

data class MatchMoment(
    val halftime: Boolean = false,
    val period: Int = 0,
    val elapsedMs: Long,
    val stoppageMs: Long = 0,
    val stoppageRunning: Boolean = false,
    val breakDueInMs: Long? = null,
    val breakDue: Boolean = false,
    val breakLeftMs: Long? = null,
)

data class Pill(val text: String, val solid: Boolean)

/** What the screen shows; the picture draws it. */
data class ScreenAt(
    val halftime: Boolean,
    val period: String,
    val clock: String,
    val second: String? = null,
    val added: String? = null,
    val stoppage: Pill? = null,
    val breakPill: Pill? = null,
    val progress: Float = 0f,
    val breakClock: String? = null,
    val breakOver: Boolean = false,
)

fun formatClock(ms: Long): String {
    val total = max(ms, 0L) / 1000
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}

fun formatCountdown(ms: Long) = formatClock(ms + 999)

/**
 * UI-2, TMR-16: the stoppage pill, as the watches' engines have it: the total until the period's length, then the added
 * time still to play (0:00 for the second the added time alert fires), then the time over it ("+0:05").
 */
fun stoppagePillAt(totalMs: Long, running: Boolean, elapsedMs: Long, periodMs: Long): Pill? {
    if (!running && totalMs <= 0) return null
    if (elapsedMs < periodMs) return Pill(formatClock(totalMs), running)
    val over = elapsedMs - periodMs - totalMs
    return Pill(if (over >= 1000) "+" + formatClock(over) else formatCountdown(max(-over, 0L)), running)
}

/** UI-3. */
fun periodLabel(period: Int, periods: Int) = when {
    period >= periods -> "ET${period - periods + 1}"
    periods == 2 -> "${period + 1}H"
    periods == 4 -> "Q${period + 1}"
    else -> "P${period + 1}"
}

/** TMR-11: the period's time in one of the styles, held at the period's end. */
fun clockText(style: String, period: Int, elapsedMs: Long, periodSec: Int = PreviewFormat.PERIOD_SEC): String {
    val periodMs = periodSec * 1000L
    val shown = min(elapsedMs, periodMs)
    return when (style) {
        "up" -> formatClock(period * periodMs + shown)
        "down" -> formatCountdown(periodMs - shown)
        else -> formatClock(shown)
    }
}

/** TMR-4: time left or time taken. */
fun breakClockText(breakClock: String, leftMs: Long, lengthMs: Long) = if (breakClock == "up") formatClock(lengthMs - leftMs) else formatCountdown(leftMs)

fun screenAt(setup: ScreenSetup, m: MatchMoment, tracked: Boolean): ScreenAt {
    val periodMs = PreviewFormat.PERIOD_SEC * 1000L
    val period = periodLabel(m.period, PreviewFormat.PERIODS)
    if (m.halftime) {
        val length = PreviewFormat.HALFTIME_SEC * 1000L
        val left = max(length - m.elapsedMs, 0L)
        return ScreenAt(true, period, "", breakClock = breakClockText(setup.breakClock, left, length), breakOver = left == 0L)
    }
    val breakPill = when {
        m.breakDue -> Pill("Break due", true)
        m.breakLeftMs != null -> Pill(breakClockText(setup.breakClock, m.breakLeftMs, PreviewFormat.BREAK_SEC * 1000L), true)
        m.breakDueInMs != null -> Pill(formatCountdown(m.breakDueInMs), false)
        else -> null
    }
    return ScreenAt(
        halftime = false,
        period = period,
        clock = clockText(setup.mainClock, m.period, m.elapsedMs),
        second = if (setup.clocks == "one") null else clockText(secondStyle(setup.mainClock, setup.secondClock), m.period, m.elapsedMs),
        added = if (m.elapsedMs >= periodMs) "+${formatClock(m.elapsedMs - periodMs)}" else null,
        stoppage = if (tracked) stoppagePillAt(m.stoppageMs, m.stoppageRunning, m.elapsedMs, periodMs) else null,
        breakPill = breakPill,
        progress = min(m.elapsedMs.toFloat() / periodMs, 1f),
    )
}

/** Where a moment is in the match, for Play through: "1H 23:12", "2H 90:00 +1:12", "Half-time 3:00". */
fun momentLabel(m: MatchMoment): String {
    if (m.halftime) return "Half-time ${formatClock(m.elapsedMs)}"
    val periodMs = PreviewFormat.PERIOD_SEC * 1000L
    val label = "${periodLabel(m.period, PreviewFormat.PERIODS)} ${clockText("up", m.period, m.elapsedMs)}"
    return if (m.elapsedMs > periodMs) "$label +${formatClock(m.elapsedMs - periodMs)}" else label
}

private fun mins(m: Int, s: Int = 0) = (m * 60 + s) * 1000L

/** UI-27's moments, in the order the setup shows them; `stoppage` ones go when stoppage isn't tracked. */
data class NamedMoment(val id: String, val name: String, val moment: MatchMoment, val stoppage: Boolean = false)

val moments = listOf(
    NamedMoment("first", "1st half, 23:12", MatchMoment(elapsedMs = mins(23, 12), stoppageMs = mins(1, 4))),
    NamedMoment("second", "2nd half, 67:40", MatchMoment(period = 1, elapsedMs = mins(22, 40), stoppageMs = mins(0, 38))),
    NamedMoment("added", "Added time", MatchMoment(period = 1, elapsedMs = mins(46, 12), stoppageMs = mins(2))),
    NamedMoment("stoppage", "Stoppage running", MatchMoment(elapsedMs = mins(31, 5), stoppageMs = mins(0, 24), stoppageRunning = true), stoppage = true),
    NamedMoment("paused", "Stoppage paused", MatchMoment(elapsedMs = mins(33, 40), stoppageMs = mins(1, 10)), stoppage = true),
    NamedMoment("coming", "Break coming up", MatchMoment(elapsedMs = mins(12), breakDueInMs = mins(9, 30))),
    NamedMoment("due", "Break due", MatchMoment(elapsedMs = mins(21, 40), stoppageMs = mins(0, 30), breakDue = true)),
    NamedMoment("break", "Break running", MatchMoment(elapsedMs = mins(22, 30), stoppageMs = mins(1, 10), stoppageRunning = true, breakLeftMs = mins(1, 20))),
    NamedMoment("halftime", "Half-time", MatchMoment(halftime = true, elapsedMs = mins(3))),
)

/**
 * Play through (UI-27): a whole 2 × 45 match at a point from 0 to 1, as the website's: the halfway
 * break taken at 21:50 and added on (TMR-12), the first half ending at 47:00, half-time, and a second
 * half with a 1:30 stoppage at 30:00 too, ending at 48:30.
 */
fun playAt(at: Float): MatchMoment {
    val first = mins(47)
    val half = mins(15)
    val second = mins(48, 30)
    var t = (at.coerceIn(0f, 1f) * (first + half + second)).toLong()
    if (t < first) return halfAt(0, t, emptyList())
    t -= first
    if (t < half) return MatchMoment(halftime = true, elapsedMs = t)
    return halfAt(1, t - half, listOf(mins(30) to mins(31, 30)))
}

private fun halfAt(period: Int, t: Long, stoppages: List<Pair<Long, Long>>): MatchMoment {
    val due = mins(21, 30)
    val taken = mins(21, 50)
    val end = taken + mins(2)
    val all = listOf(taken to end) + stoppages
    return MatchMoment(
        period = period, elapsedMs = t,
        stoppageMs = all.sumOf { (a, b) -> max(0L, min(t, b) - a) },
        stoppageRunning = all.any { (a, b) -> t in a until b },
        breakDueInMs = if (t < due) due - t else null,
        breakDue = t in due until taken,
        breakLeftMs = if (t in taken until end) end - t else null,
    )
}
