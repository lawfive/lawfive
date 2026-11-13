package app.lawfive.wear

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.min

// A match in progress (WCH-2): the same rules as the Garmin watch's Match.mc, with the same requirement
// IDs. All clocks come from stored start times, and the whole state is saved on every change, so a
// match survives the app being closed (TMR-8). Nothing here touches Android, so it's tested on its own.

/**
 * Golden (ET-6): a golden goal in extra time, End match or Undo, while the clock runs on. Suspended (TMR-13): play
 * stopped for a lightning or weather delay, every clock standing still until Resume.
 */
enum class Phase { Pre, Ready, Running, Break, Done, NextKickoff, Decide, Penalties, Golden, Suspended }
/**
 * Lightning (TMR-13): the 30:00 countdown at zero, one long vibration as the break end's (VIB-3). SinBinEnd (EVT-12):
 * a sin bin over, repeating as VIB-1's until a button is pressed.
 */
enum class Alert { BreakEnd, FullTime, AddedTime, BreakStart, Reminder, Lightning, SinBinEnd }
enum class Decision { ExtraTime, Penalties, EndMatch }

const val HOME = 0
const val AWAY = 1

const val EVENT_GOAL = "G"
const val EVENT_OWN_GOAL = "GO"
const val EVENT_PEN_GOAL = "GP"
const val EVENT_DFK_GOAL = "GF"
const val EVENT_YELLOW = "Y"
const val EVENT_RED = "R"
const val EVENT_SECOND_YELLOW = "Y2"
// EVT-15: a team official's caution and send-off, with the role in extra (officialRoles); EVT-16 an injury.
const val EVENT_OFFICIAL_YELLOW = "TY"
const val EVENT_OFFICIAL_RED = "TR"
const val EVENT_INJURY = "I"
const val EVENT_STOPPAGE = "S"
const val EVENT_PERIOD_END = "E"
const val EVENT_PEN_SCORED = "PG"
const val EVENT_PEN_MISSED = "PM"
const val EVENT_ABANDON = "A" // EVT-11: the reason's number in extra
// TMR-14: the match clock and the added time corrected, the change in seconds in extra.
const val EVENT_CLOCK_ADJUSTED = "CK"
const val EVENT_ADDED_ADJUSTED = "CA"
// TMR-13: play suspended, the reason's number in extra (as an abandonment's), and resumed, the whole seconds suspended in extra.
const val EVENT_SUSPENDED = "SU"
const val EVENT_RESUMED = "RS"
// EVT-12: a sin bin, its length in seconds in extra; a second for the same number, a send-off, with the length too.
const val EVENT_SIN_BIN = "SB"
const val EVENT_SECOND_SIN_BIN = "SB2"

/** TMR-13: the reasons play is suspended for, by the numbers an abandonment's have (3, not enough players, isn't one). */
val suspendReasons = listOf(0 to "Weather", 1 to "Lightning", 2 to "Crowd trouble", 4 to "Other")
const val LIGHTNING = 1
/** TMR-13: the US 30-minute rule, started over by each strike. */
const val LIGHTNING_WAIT_MS = 30 * 60 * 1000L

const val SECONDS_BEFORE_KICKOFF = -1
const val SECONDS_AT_BREAK = -2
const val SECONDS_AFTER_FULL_TIME = -3
const val SECONDS_PENALTIES = -4

// TMR-11, as the server's clockStyle numbers.
const val CLOCK_UP = 0
const val CLOCK_UP_EACH = 1
const val CLOCK_DOWN = 2

// UI-21: the match screen's choices, as the Garmin watch numbers them.
const val CLOCKS_ONE = 0
const val CLOCKS_STACKED = 1
const val CLOCKS_SIDE_BY_SIDE = 2
const val EDGE_NONE = 0
const val EDGE_RING = 1
const val EDGE_TIME = 2
// TMR-4.
const val BREAK_DOWN = 0
const val BREAK_UP = 1

// The six layouts before UI-21's choices, as older servers and saved matches name them.
const val LAYOUT_DEFAULT = 0
const val LAYOUT_STACKED = 1
const val LAYOUT_MINIMAL = 2
const val LAYOUT_SCOREBOARD = 3
const val LAYOUT_SIDE_BY_SIDE = 4
const val LAYOUT_RING = 5

/** UI-21 to UI-23, TMR-4, TMR-11: the match screen. Left out, a choice is the old layouts' (one clock with names). */
@Serializable
data class WatchScreen(
    val clocks: Int = CLOCKS_ONE,
    val mainClock: Int = CLOCK_UP,
    val secondClock: Int = CLOCK_DOWN,
    val breakClock: Int = BREAK_DOWN,
    val edge: Int = EDGE_NONE,
    val names: Boolean = true,
) {
    /** UI-22: never the same style as the match clock. */
    val second get() = if (secondClock != mainClock) secondClock else if (mainClock == CLOCK_DOWN) CLOCK_UP_EACH else CLOCK_DOWN

    /** UI-24: the nearest old layout, for servers from before UI-21's choices. */
    val nearestLayout get() = when {
        clocks == CLOCKS_STACKED -> LAYOUT_STACKED
        clocks == CLOCKS_SIDE_BY_SIDE -> LAYOUT_SIDE_BY_SIDE
        !names -> LAYOUT_MINIMAL
        edge == EDGE_RING -> LAYOUT_RING
        else -> LAYOUT_DEFAULT
    }

    companion object {
        /** UI-24: what the watch shows until one is chosen: two clocks stacked, the time left over the match time, with the time of day and names. */
        val DEFAULT = WatchScreen(clocks = CLOCKS_STACKED, mainClock = CLOCK_DOWN, secondClock = CLOCK_UP, edge = EDGE_TIME)

        /** One of the six old layouts as the choices; Scoreboard was dropped and becomes one clock with names. */
        fun fromLayout(layout: Int, mainClock: Int, secondClock: Int, breakClock: Int = BREAK_DOWN) = WatchScreen(
            clocks = when (layout) { LAYOUT_STACKED -> CLOCKS_STACKED; LAYOUT_SIDE_BY_SIDE -> CLOCKS_SIDE_BY_SIDE; else -> CLOCKS_ONE },
            mainClock = mainClock, secondClock = secondClock, breakClock = breakClock,
            edge = if (layout == LAYOUT_RING) EDGE_RING else EDGE_NONE,
            names = layout != LAYOUT_MINIMAL,
        )
    }
}

fun isGoal(type: String) = type == EVENT_GOAL || type == EVENT_OWN_GOAL || type == EVENT_PEN_GOAL || type == EVENT_DFK_GOAL
fun isKick(type: String) = type == EVENT_PEN_SCORED || type == EVENT_PEN_MISSED

fun isAdjustment(type: String) = type == EVENT_CLOCK_ADJUSTED || type == EVENT_ADDED_ADJUSTED

/**
 * INP-6: what Undo can take back: goals, cards (a team official's too), injuries and shoot-out kicks; not stoppages or periods' ends.
 * TMR-14: a clock's correction too, but only while its period is being played, as it moves the running clock.
 */
fun isUndoable(type: String, playing: Boolean) = isGoal(type) || isKick(type) ||
    type in setOf(EVENT_YELLOW, EVENT_SECOND_YELLOW, EVENT_RED, EVENT_OFFICIAL_YELLOW, EVENT_OFFICIAL_RED, EVENT_INJURY, EVENT_SIN_BIN, EVENT_SECOND_SIN_BIN) ||
    (playing && isAdjustment(type))

/** EVT-12: what sends a player off, so a sin bin running for them ends without a return. */
fun isSendOff(type: String) = type == EVENT_RED || type == EVENT_SECOND_YELLOW || type == EVENT_SECOND_SIN_BIN

/** EVT-15: a team official's role, by the number the watches keep and upload. */
val officialRoles = listOf("Head coach", "Assistant coach", "Other")

/**
 * EVT-14: [reason] is a card's misconduct code (from its match's scheme), given just after it; left out of the stored
 * form when there's none, so matches saved before it still load. The upload sends reasons beside the events.
 */
@Serializable
data class MatchEvent(val type: String, val team: Int, val period: Int, val seconds: Int, val player: Int? = null, val extra: Int? = null, var reason: String? = null)

/** EVT-14: what a reason can be given to: a player's or team official's caution or send-off, and sin bins. */
fun isCard(type: String) = type in setOf(EVENT_YELLOW, EVENT_SECOND_YELLOW, EVENT_RED, EVENT_SIN_BIN, EVENT_SECOND_SIN_BIN, EVENT_OFFICIAL_YELLOW, EVENT_OFFICIAL_RED)

fun formatClock(ms: Long): String {
    val total = ms / 1000
    return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
}

fun formatCountdown(ms: Long) = formatClock(ms + 999)

/** UI-2, UI-4: a timer pill's text, and whether it's solid. */
data class PillText(val text: String, val solid: Boolean)

/**
 * UI-2, UI-4, TMR-16: the stoppage pill, solid while a stoppage runs; null until there's stoppage time. Before the period's
 * length it shows the total (TMR-3); from the length the added time still to play (the total less the time past the length),
 * held while a stoppage runs then, 0:00 for the second the added time alert fires (VIB-7), then the time over it ("+0:05").
 */
fun stoppagePillAt(totalMs: Long, running: Boolean, elapsedMs: Long, periodMs: Long): PillText? {
    if (!running && totalMs <= 0) return null
    if (elapsedMs < periodMs) return PillText(formatClock(totalMs), running)
    val over = elapsedMs - periodMs - totalMs
    return PillText(if (over >= 1000) "+" + formatClock(over) else formatCountdown(maxOf(-over, 0L)), running)
}

/** TMR-14: a clock's change as the watches show it: "+0:40", "−1:05" (U+2212 minus). */
fun formatChange(sec: Int) = (if (sec < 0) "\u2212" else "+") + formatClock(kotlin.math.abs(sec) * 1000L)

/** TMR-13: SU and RS in the events list's words: "Suspended, lightning", "Resumed after 30:00"; null for any other event. */
fun suspensionWords(e: MatchEvent): String? = when (e.type) {
    EVENT_SUSPENDED -> "Suspended, " + (suspendReasons.firstOrNull { it.first == e.extra }?.second ?: "Other").lowercase()
    EVENT_RESUMED -> "Resumed after ${formatClock((e.extra ?: 0) * 1000L)}"
    else -> null
}

/** What a match is started from: a downloaded match's format, or Quick match's (SET-9). */
@Serializable
data class MatchSetup(
    val matchId: String? = null,
    val home: String = "HOM",
    val away: String = "AWY",
    val homeName: String = "",
    val awayName: String = "",
    val homeColor: Int = -1,
    val awayColor: Int = -1,
    val numPeriods: Int = 2,
    val periodSec: Int = 45 * 60,
    val halftimeSec: Int = 15 * 60,
    val teamSize: Int = 11,
    val midBreak: Boolean = false,
    val breakLenSec: Int = 120,
    val extraTime: Boolean = false,
    val etPeriods: Int = 2,
    val etPeriodSec: Int = 15 * 60,
    /** ET-6: with extra time, a goal in it ends the match. */
    val goldenGoal: Boolean = false,
    val penalties: Boolean = false,
    val clockStyle: Int = CLOCK_UP,
    val trackStoppage: Boolean = false,
    val breakStoppage: Boolean = true,
    val goalScorers: Boolean = true,
    val goalTypes: Boolean = false,
    /** EVT-12: Sin bin in the team menu, for sinBinSec of the match clock. */
    val sinBins: Boolean = false,
    val sinBinSec: Int = 600,
    /** TMR-15: the match clock stops while play does (stoppage tracking goes with it), and a goal or card recorded stops it. */
    val stoppingClock: Boolean = false,
    val stopForGoalsCards: Boolean = true,
    /** SET-8: the stoppage and break timers' names, copied in when the match is created. */
    val stoppageLabel: String = "stoppage",
    val breakLabel: String = "break",
    /** EVT-14: a downloaded match's misconduct scheme (its competition's, else the account's); not part of the format. */
    val misconductScheme: String? = null,
) {
    /** SET-13: only the format, for Same as last: no teams, colors or names. */
    fun format() = MatchSetup(
        numPeriods = numPeriods, periodSec = periodSec, halftimeSec = halftimeSec, teamSize = teamSize, midBreak = midBreak, breakLenSec = breakLenSec,
        extraTime = extraTime, etPeriods = etPeriods, etPeriodSec = etPeriodSec, goldenGoal = goldenGoal, penalties = penalties,
        trackStoppage = trackStoppage, breakStoppage = breakStoppage, goalScorers = goalScorers, goalTypes = goalTypes,
        sinBins = sinBins, sinBinSec = sinBinSec, stoppingClock = stoppingClock, stopForGoalsCards = stopForGoalsCards,
    )

    /** TMR-15: a stopping clock stops with the stoppage clock, so it's tracked whatever trackStoppage says. */
    val tracked get() = trackStoppage || stoppingClock

    /** SET-13: whether two setups have the same format, so New match can leave out Same as last when it's Quick match over again. */
    fun sameFormat(other: MatchSetup) = format() == other.format()

    /** This setup with [format]'s format, keeping its teams and colors. */
    fun withFormat(format: MatchSetup) = format.copy(home = home, away = away, homeName = homeName, awayName = awayName, homeColor = homeColor, awayColor = awayColor)
}

/** "Stoppage" for the start of a menu row. */
fun String.capitalized() = replaceFirstChar { it.uppercase() }

/** A heading in radians in the range 0 to 2π. */
fun normalizeHeading(heading: Float): Float {
    val full = (2 * Math.PI).toFloat()
    return ((heading % full) + full) % full
}

/** The watch's battery in percent (DIAG-1), set by the app: the rules know nothing of Android. */
var battery: () -> Int? = { null }

@Serializable
class Match(
    val setup: MatchSetup = MatchSetup(),
    val created: Long = 0,
    val repeatSec: Int = 10,
    val reminderSec: Int = 10,
    val vibeFullTime: Boolean = true,
    val vibeStoppage: Boolean = true,
    val vibeBreak: Boolean = true,
    /** VIB-7. */
    val vibeAdded: Boolean = true,
    /** EVT-12: the sin bin return's vibration. */
    val vibeSinBin: Boolean = true,
    /** Matches saved before UI-21's choices: their layout and second clock, read into [shown]. */
    var faceLayout: Int = LAYOUT_DEFAULT,
    var secondClock: Int = CLOCK_DOWN,
    /** UI-21: the match screen, fixed at kickoff. */
    var screen: WatchScreen? = null,
    var phase: Phase = Phase.Pre,
    var period: Int = 0,
    var kickoff: Int = -1,
    var periodStart: Long? = null,
    var stoppageMs: Long = 0,
    var stoppageStart: Long? = null,
    var breakEnd: Long? = null,
    var breakIsHalftime: Boolean = false,
    var scheduledBreakDone: Boolean = false,
    var fullTimeAcked: Boolean = false,
    /** VIB-7: once a period. */
    var addedAcked: Boolean = false,
    /** VIB-1: stoppage tracked, but none when the period's length was reached, so full time repeats. */
    var fullTimeRepeats: Boolean = false,
    var breakDue: Boolean = false,
    var breakDueSilenced: Boolean = false,
    var breakEndAlerted: Boolean = false,
    var breakStoppageRunning: Boolean = false,
    var score: MutableList<Int> = mutableListOf(0, 0),
    var events: MutableList<MatchEvent> = mutableListOf(),
    var penFirst: Int = -1,
    var penStarted: Boolean = false,
    var startedAt: MutableList<Long> = mutableListOf(),
    var distanceM: Double? = null,
    // DIAG-1: [period, 0 kickoff or 1 its end, percent], and times the app started again mid-match.
    var batteryLog: MutableList<List<Int>> = mutableListOf(),
    var restarts: Int = 0,
    // PRE-8: the compass heading (radians) of the goal the home team attacks in the first period.
    var homeHeading: Float? = null,
    // ET-7: a new toss decides extra time: the team kicking off ET1 (-1 until chosen) and the heading
    // of the goal the home team attacks in ET1, kept apart from the above.
    var etKickoff: Int = -1,
    var etHomeHeading: Float? = null,
    /** ET-6: it ended on a golden goal. */
    var endedGolden: Boolean = false,
    /** TRK-7: whether this match keeps a track, from Record track when it was set up. */
    var recordTrack: Boolean = true,
    // DIAG-1: the track's samples, those without a GPS fix, and seconds from kickoff to the first fix.
    var gpsSamples: Int = 0,
    var gpsMissed: Int = 0,
    var gpsFirstFixSec: Int? = null,
    /** TMR-13: while suspended, when it was, why (suspendReasons, -1 none), and when the lightning countdown last started (lightning only). */
    var suspendedAt: Long? = null,
    var suspendReason: Int = -1,
    var lightningFrom: Long? = null,
    var lightningAlerted: Boolean = false,
    /** EVT-12: the sin bins over, waiting for a button for "can return", in the order they ended. */
    var sinBinReturns: MutableList<MatchEvent> = mutableListOf(),
    /** EVT-12: the time played at the last tick, so each sin bin's end is announced once. */
    var sinBinCheckedMs: Long = 0,
    /** EVT-14: the scheme the cards' reasons come from (Misconduct), fixed when the match is set up. */
    val misconductScheme: String = "ifab",
) {
    /** DIAG-1: one track sample, and whether it had a GPS fix. */
    fun noteGps(hadFix: Boolean, now: Long) {
        gpsSamples += 1
        if (!hadFix) gpsMissed += 1
        else if (gpsFirstFixSec == null && startedAt.isNotEmpty()) gpsFirstFixSec = maxOf((now / 1000 - startedAt.first()).toInt(), 0)
    }

    private fun noteBattery(at: Int) {
        battery()?.let { if (batteryLog.size < 24) batteryLog.add(listOf(period, at, it)) }
    }

    // TMR-7: centered on halfway, so due half the break's length before it.
    val breakAtSec: Int get() = if (setup.midBreak) maxOf((setup.periodSec - setup.breakLenSec) / 2, 0) else -1

    @kotlinx.serialization.Transient private var lastRepeat = 0L
    @kotlinx.serialization.Transient private var lastReminder = 0L

    val isExtraTime get() = period >= setup.numPeriods
    val currentPeriodSec get() = if (isExtraTime) setup.etPeriodSec else setup.periodSec
    val isStoppageActive get() = stoppageStart != null
    val isLastPeriod get() = if (isExtraTime) period >= setup.numPeriods + setup.etPeriods - 1 else period >= setup.numPeriods - 1
    val canExtraTime get() = setup.extraTime && !isExtraTime
    val canPenalties get() = setup.penalties && phase != Phase.Penalties
    val periodEndsMatch get() = isLastPeriod && !canExtraTime && !canPenalties
    val isHalftime get() = setup.numPeriods == 2 && period == 0
    /** ET-7: whether the period being played, or about to kick off, is in extra time. */
    private val aboutExtraTime get() = if (phase == Phase.NextKickoff) period + 1 >= setup.numPeriods else isExtraTime

    /** The team that kicked off the match, or extra time once it's on (PRE-3, ET-7). */
    val firstKickoff get() = if (aboutExtraTime) etKickoff else kickoff

    /** PRE-8: once the kickoff team is chosen, until the end of the first period; ET-7: again for ET1. */
    val canRecordDirection get() = when (phase) {
        Phase.NextKickoff -> period + 1 == setup.numPeriods && etKickoff >= 0
        else -> phase == Phase.Ready || (phase == Phase.Running && (period == 0 || period == setup.numPeriods))
    }
    val hasDirection get() = (if (aboutExtraTime) etHomeHeading else homeHeading) != null

    /** PRE-8: the referee faced the goal the current kickoff team attacks in the first period (or ET1, ET-7). */
    fun setKickoffHeading(heading: Float) {
        val home = normalizeHeading(if (firstKickoff == AWAY) heading + Math.PI.toFloat() else heading)
        if (aboutExtraTime) etHomeHeading = home else homeHeading = home
    }

    /** PRE-8: teams change ends each period; extra time counts the same way from its own toss (ET-7). */
    fun attackHeading(p: Int): Float? {
        val extra = p >= setup.numPeriods
        val heading = (if (extra) etHomeHeading else homeHeading) ?: return null
        val flip = (kickoffFor(p) == AWAY) != ((if (extra) p - setup.numPeriods else p) % 2 == 1)
        return if (flip) normalizeHeading(heading + Math.PI.toFloat()) else heading
    }

    val kickoffTeamOnScreen get() = if (phase == Phase.NextKickoff) kickoffFor(period + 1) else kickoff

    fun teamName(team: Int) = if (team == HOME) setup.home else setup.away
    fun teamColor(team: Int) = if (team == HOME) setup.homeColor else setup.awayColor
    /** TMR-13: every clock stands where it was while play is suspended. */
    private fun clockNow(now: Long): Long {
        val at = suspendedAt
        return if (phase == Phase.Suspended && at != null) min(now, at) else now
    }
    /**
     * The period's time. TMR-15: on a stopping clock, less the time stopped (the stoppage clock), and held at the
     * period's length, as there's no added time.
     */
    fun matchMs(now: Long): Long {
        val kickoff = periodStart ?: return 0L
        val elapsed = clockNow(now) - kickoff
        return if (setup.stoppingClock) min(elapsed - stoppageTotalMs(now), currentPeriodSec * 1000L) else elapsed
    }

    /** TMR-15: the stopping clock standing still, while a stoppage runs (shown in orange). */
    val clockStopped get() = setup.stoppingClock && stoppageStart != null
    fun stoppageTotalMs(now: Long) = stoppageMs + (stoppageStart?.let { clockNow(now) - it } ?: 0L)
    fun breakRemainingMs(now: Long) = breakEnd?.let { maxOf(it - clockNow(now), 0L) }
    /** TMR-13: how long play has been suspended, counting up; null when it isn't. */
    fun suspendedMs(now: Long): Long? = suspendedAt?.takeIf { phase == Phase.Suspended }?.let { maxOf(now - it, 0L) }
    /** TMR-13: for lightning, the 30:00 countdown's time left, held at 0:00; null otherwise. */
    fun lightningLeftMs(now: Long): Long? = lightningFrom?.takeIf { phase == Phase.Suspended }?.let { maxOf(it + LIGHTNING_WAIT_MS - now, 0L) }
    /** PRE-5; extra time alternates from its own kickoff team (ET-7). */
    fun kickoffFor(p: Int): Int {
        val extra = p >= setup.numPeriods
        val first = if (extra) etKickoff else kickoff
        return if (first < 0) -1 else if ((if (extra) p - setup.numPeriods else p) % 2 == 0) first else 1 - first
    }
    fun periodStartSec(p: Int) = if (p < setup.numPeriods) p * setup.periodSec else setup.numPeriods * setup.periodSec + (p - setup.numPeriods) * setup.etPeriodSec

    /** TMR-11, TMR-2: the clock as shown, and the added time under it once the period's length is reached. */
    fun clockDisplay(now: Long): Pair<String, String?> {
        val elapsed = matchMs(now)
        val periodMs = currentPeriodSec * 1000L
        // TMR-15: a stopping clock has no added time.
        return clockText(clockStyle, now) to if (elapsed >= periodMs && !setup.stoppingClock) "+" + formatClock(elapsed - periodMs) else null
    }

    /** UI-2, TMR-16: the stoppage pill, with stoppage tracked: the total, then from the length the added time left. None on a stopping clock (TMR-15). */
    fun stoppagePill(now: Long): PillText? =
        if (setup.tracked && !setup.stoppingClock) stoppagePillAt(stoppageTotalMs(now), isStoppageActive, matchMs(now), currentPeriodSec * 1000L) else null

    /** UI-21: the match screen; a match saved before the choices has its layout's. */
    val shown get() = screen ?: WatchScreen.fromLayout(faceLayout, setup.clockStyle, secondClock)

    /** TMR-11: taken from the match screen at kickoff. */
    val clockStyle get() = shown.mainClock

    private fun clockText(style: Int, now: Long): String {
        val periodMs = currentPeriodSec * 1000L
        val shown = min(matchMs(now), periodMs)
        return when (style) {
            CLOCK_UP -> formatClock(periodStartSec(period) * 1000L + shown)
            CLOCK_DOWN -> formatCountdown(periodMs - shown)
            else -> formatClock(shown)
        }
    }

    /** UI-22: never a copy of the main clock. */
    fun secondClockText(now: Long) = clockText(shown.second, now)

    /** TMR-4: the break clock as shown, time left or time taken; null when no break is running. */
    fun breakClockText(now: Long): String? {
        val remaining = breakRemainingMs(now) ?: return null
        if (shown.breakClock != BREAK_UP) return formatCountdown(remaining)
        val length = (if (breakIsHalftime) setup.halftimeSec else setup.breakLenSec) * 1000L
        return formatClock(length - remaining)
    }

    /** UI-23: from 0 to 1, and 1 through added time. */
    fun periodProgress(now: Long) = min(matchMs(now).toFloat() / (currentPeriodSec * 1000), 1f)

    /** VIB-1: the period's length reached, and its alert not yet answered (with stoppage tracked, not yet given). */
    private fun fullTimeDue(now: Long) = phase == Phase.Running && vibeFullTime && !fullTimeAcked && matchMs(now) >= currentPeriodSec * 1000L
    /**
     * VIB-1: full time repeats until a button without stoppage tracked, and with it when there was no stoppage time at the
     * length (no added time alert would follow); otherwise it's one vibration as added time starts.
     */
    private fun fullTimeAlertActive(now: Long) = (!setup.tracked || fullTimeRepeats) && fullTimeDue(now)
    /** VIB-7: with stoppage tracked, once the period's length and its added time (the stoppage total) have both passed. */
    private fun addedAlertActive(now: Long): Boolean {
        // TMR-15: none on a stopping clock, which has no added time.
        if (phase != Phase.Running || !setup.tracked || setup.stoppingClock || !vibeAdded || addedAcked) return false
        val added = stoppageTotalMs(now)
        return added > 0 && matchMs(now) >= currentPeriodSec * 1000L + added
    }
    private fun breakDueAlertActive() = phase == Phase.Running && vibeBreak && breakDue && !breakDueSilenced
    /** EVT-12: a sin bin over, during play, with its vibration on. */
    private fun sinBinAlertActive() = (phase == Phase.Running || phase == Phase.Golden) && vibeSinBin && sinBinReturns.isNotEmpty()
    fun hasActiveAlert(now: Long) = fullTimeAlertActive(now) || addedAlertActive(now) || breakDueAlertActive() || sinBinAlertActive()

    /** UI-12: from 30 s before the period's time is up until it's ended, and while a break is due. */
    fun wantsScreenOn(now: Long) = phase == Phase.Running && (breakDue || matchMs(now) >= currentPeriodSec * 1000L - 30_000)

    /** VIB-6: silences repeating alerts; true if there was one. */
    fun acknowledgeAlerts(now: Long): Boolean {
        // EVT-12: "can return" waits for a button even with its vibration off.
        if (!hasActiveAlert(now) && sinBinReturns.isEmpty()) return false
        sinBinReturns = mutableListOf()
        if (fullTimeAlertActive(now)) fullTimeAcked = true
        if (addedAlertActive(now)) addedAcked = true
        if (breakDueAlertActive()) breakDueSilenced = true
        return true
    }

    /** Every second: makes scheduled breaks due, and says which vibration is due, at most one. Returns whether the state changed too. */
    fun tick(now: Long): Alert? {
        // TMR-13: while suspended every clock stands still; only the lightning countdown runs, with one vibration at zero.
        if (phase == Phase.Suspended) {
            val from = lightningFrom
            if (from != null && !lightningAlerted && now >= from + LIGHTNING_WAIT_MS) {
                lightningAlerted = true
                return if (vibeBreak) Alert.Lightning else null
            }
            return null
        }
        if (phase == Phase.Running) makeBreakDue(now)
        checkSinBins(now)
        val end = breakEnd
        if (end != null && !breakEndAlerted && now >= end) {
            breakEndAlerted = true
            if (!breakIsHalftime) {
                breakEnd = null
                if (breakStoppageRunning) closeStoppage(end)
            }
            return if (vibeBreak) Alert.BreakEnd else null
        }
        // VIB-1: with stoppage tracked, decided as the length is reached: with stoppage time, full time vibrates once with
        // nothing to answer, so the next press starts a stoppage; with none, it repeats until a press, as no added time alert
        // follows, and stands for that alert this period, so a stoppage started after it brings no other.
        // TMR-15: a stopping clock has no added time to follow, so its full time always repeats.
        if (setup.tracked && !fullTimeRepeats && fullTimeDue(now)) {
            if (stoppageTotalMs(now) > 0 && !setup.stoppingClock) {
                fullTimeAcked = true
                return Alert.FullTime
            }
            fullTimeRepeats = true
            addedAcked = true
        }
        if (hasActiveAlert(now)) {
            if (now - lastRepeat >= repeatSec * 1000L) {
                lastRepeat = now
                // VIB-7 comes after full time, so it's the news when both are waiting; a sin bin over is newer still (EVT-12).
                return if (sinBinAlertActive()) Alert.SinBinEnd else if (addedAlertActive(now)) Alert.AddedTime else if (fullTimeAlertActive(now)) Alert.FullTime else Alert.BreakStart
            }
            return null
        }
        // TMR-12: no reminders for the stoppage a break started: the break clock is running.
        if (phase == Phase.Running && isStoppageActive && !breakStoppageRunning && vibeStoppage && reminderSec > 0 && now - lastReminder >= reminderSec * 1000L) {
            lastReminder = now
            return Alert.Reminder
        }
        return null
    }

    /**
     * EVT-12: the time played in the match so far, by the match clock: each ended period's time (its E event), and
     * the period being played (stood still while suspended). Breaks add nothing, so a sin bin waits through them.
     */
    fun playedMs(now: Long): Long {
        val inPlay = phase == Phase.Running || phase == Phase.Golden || phase == Phase.Suspended
        return endedMs { true } + if (inPlay) matchMs(now) else 0L
    }

    private fun endedMs(which: (Int) -> Boolean) = events.sumOf { if (it.type == EVENT_PERIOD_END && it.seconds >= 0 && which(it.period)) it.seconds * 1000L else 0L }

    /** EVT-12: the stoppages recorded (S, their length in extra), TMR-10; none without stoppage tracked. */
    private fun stoppedMs(list: List<MatchEvent>) = list.sumOf { if (it.type == EVENT_STOPPAGE) (it.extra ?: 0) * 1000L else 0L }
    /** EVT-12: the stoppage running, stood still while suspended. */
    private fun runningStoppageMs(now: Long) = stoppageStart?.let { clockNow(now) - it } ?: 0L

    /**
     * EVT-12: the sin bins' clock: the time played less the stoppage in it, so a sin bin holds while a stoppage runs, as
     * IFAB's guidance adds the time lost in one (the owner's choice, 2026-11-10).
     */
    private fun sinBinClockMs(now: Long) = if (setup.stoppingClock) playedMs(now) else playedMs(now) - stoppedMs(events) - runningStoppageMs(now)

    /**
     * EVT-12: the sin bins' clock when one began: the time played then (before kickoff 0:00, at a break the end of the
     * period before), less the stoppage before it, and of a stoppage running then, the part before it.
     */
    private fun sinBinFromMs(e: MatchEvent, now: Long): Long {
        val before = endedMs { it < e.period }
        val played = before + if (e.seconds >= 0) e.seconds * 1000L else if (e.seconds == SECONDS_AT_BREAK) endedMs { it == e.period } else 0L
        // TMR-15: the clock stood still for the stoppages, so the time played is the sin bins' clock.
        if (setup.stoppingClock) return played
        val index = events.indexOfFirst { it === e }
        var stopped = stoppedMs(events.subList(0, maxOf(index, 0)))
        if (e.seconds >= 0) {
            // Given during a stoppage: the first one recorded after it, if it started before it, or the one running now.
            val next = events.drop(index + 1).firstOrNull { it.type == EVENT_STOPPAGE }
            val start = stoppageStart
            val kickoff = periodStart
            if (next != null) {
                if (next.period == e.period) stopped += ((e.seconds - next.seconds) * 1000L).coerceIn(0L, (next.extra ?: 0) * 1000L)
            } else if (start != null && kickoff != null && period == e.period) {
                stopped += (e.seconds * 1000L - (start - kickoff)).coerceIn(0L, maxOf(runningStoppageMs(now), 0L))
            }
        }
        return played - stopped
    }

    /** EVT-12: a sin bin's time left, by the sin bins' clock, from its length down to 0. */
    fun sinBinLeftMs(e: MatchEvent, now: Long): Long {
        val length = (e.extra ?: 0) * 1000L
        return (length - (sinBinClockMs(now) - sinBinFromMs(e, now))).coerceIn(0L, length)
    }

    /** EVT-12: sin bins not ended by the player being sent off after it (a red, a second yellow or a second sin bin). */
    private fun liveSinBins() = events.filterIndexed { i, e ->
        e.type == EVENT_SIN_BIN && !(e.player != null && events.drop(i + 1).any { later -> isSendOff(later.type) && later.team == e.team && later.player == e.player })
    }

    /** EVT-12: the sin bins counting down, the one ending first first. */
    fun runningSinBins(now: Long) = liveSinBins().map { it to sinBinLeftMs(it, now) }.filter { it.second > 0 }.sortedBy { it.second }.map { it.first }

    /**
     * EVT-12, UI-1: the sin bin pill, "AWY 7 4:12" for the one ending first, "+1" after it for each other; null for
     * none. Without [team], "7 4:12 +1", for a pill row too full for the team's name.
     */
    fun sinBinPill(now: Long, team: Boolean = true): String? {
        val running = runningSinBins(now)
        val first = running.firstOrNull() ?: return null
        val more = if (running.size > 1) " +${running.size - 1}" else ""
        val who = listOfNotNull(teamName(first.team).takeIf { team }, first.player?.toString()).joinToString(" ")
        return (if (who.isEmpty()) "" else "$who ") + formatCountdown(sinBinLeftMs(first, now)) + more
    }

    /** EVT-12: "AWY #7 can return", for the first sin bin over; null for none. */
    fun sinBinReturnText(): String? = sinBinReturns.firstOrNull()?.let { e -> teamName(e.team) + (e.player?.let { " #$it" } ?: "") + " can return" }

    /** EVT-12: each sin bin's end, announced once, when the sin bins' clock reaches it. */
    private fun checkSinBins(now: Long) {
        val clock = sinBinClockMs(now)
        for (e in liveSinBins()) {
            val end = sinBinFromMs(e, now) + (e.extra ?: 0) * 1000L
            if (sinBinCheckedMs < end && end <= clock && sinBinReturns.none { it === e }) {
                sinBinReturns.add(e)
                lastRepeat = 0
            }
        }
        sinBinCheckedMs = clock
    }

    /**
     * EVT-12, TMR-8: after the app started again, the sin bins waiting for "can return" are made the match's own
     * events again (saved, they're only copies), so Undo takes one back from the waiting too.
     */
    fun restored() {
        val linked = mutableListOf<MatchEvent>()
        for (r in sinBinReturns) events.firstOrNull { e -> e == r && linked.none { it === e } }?.let(linked::add)
        sinBinReturns = linked
    }

    private fun makeBreakDue(now: Long) {
        if (scheduledBreakDone || periodStart == null || breakAtSec < 0 || setup.breakLenSec <= 0 || isExtraTime) return
        if (matchMs(now) < breakAtSec * 1000L) return
        scheduledBreakDone = true
        breakDue = true
        breakDueSilenced = false
        lastRepeat = 0
    }

    /** UI-4: time until the break is due, or null when none is still to come this period. */
    fun breakDueInMs(now: Long): Long? {
        if (phase != Phase.Running || scheduledBreakDone || periodStart == null || breakAtSec < 0 || setup.breakLenSec <= 0 || isExtraTime) return null
        return maxOf(breakAtSec * 1000L - matchMs(now), 0L)
    }

    /** TMR-7: the referee accepts the due break. */
    fun startBreak(now: Long) {
        if (phase != Phase.Running || !breakDue) return
        breakDue = false
        breakIsHalftime = false
        breakEnd = now + setup.breakLenSec * 1000L
        breakEndAlerted = false
        // TMR-12: its time is added on, as a stoppage that ends with the break. TMR-15: a stopping clock stops for it, whatever the setting.
        if (setup.tracked && (setup.breakStoppage || setup.stoppingClock) && stoppageStart == null) {
            stoppageStart = now
            breakStoppageRunning = true
        }
    }

    fun skipBreak() {
        breakDue = false
    }

    /** TMR-7: ends a running halfway break early; the time it took counts as stoppage (TMR-12). */
    fun endBreakEarly(now: Long) {
        if (phase == Phase.Running && breakEnd != null) {
            breakEnd = null
            if (breakStoppageRunning) closeStoppage(now)
        }
    }

    /** TMR-7: a break started by mistake: it's due again, and counts for nothing. */
    fun resetBreak() {
        if (phase == Phase.Running && breakEnd != null) {
            breakEnd = null
            breakDue = true
            breakDueSilenced = true
            if (breakStoppageRunning) {
                stoppageStart = null
                breakStoppageRunning = false
            }
        }
    }

    fun selectKickoff(team: Int) {
        if (phase == Phase.Pre || phase == Phase.Ready) {
            kickoff = team
            phase = Phase.Ready
        } else if (phase == Phase.NextKickoff) {
            val next = period + 1
            if (next >= setup.numPeriods) etKickoff = if ((next - setup.numPeriods) % 2 == 0) team else 1 - team
            else kickoff = if (next % 2 == 0) team else 1 - team
        }
    }

    /** PRE-3. */
    fun clearKickoff() {
        if (phase == Phase.Ready) {
            kickoff = -1
            phase = Phase.Pre
        }
    }

    /** PRE-3: fix a wrongly chosen team after the match has started (in extra time, its own, ET-7). */
    fun swapKickoff() {
        if (aboutExtraTime) {
            if (etKickoff >= 0) etKickoff = 1 - etKickoff
        } else if (kickoff >= 0) kickoff = 1 - kickoff
    }

    /** PRE-6: back to kickoff after an accidental start, in the first period only. Cards given before kickoff stay. */
    fun restart() {
        if (phase != Phase.Running || period != 0) return
        beginPeriod(0)
        periodStart = null
        phase = Phase.Ready
        score = mutableListOf(0, 0)
        events = events.filter { it.seconds == SECONDS_BEFORE_KICKOFF }.toMutableList()
        startedAt = mutableListOf()
        sinBinReturns = mutableListOf()
        sinBinCheckedMs = 0
    }

    /** UI-21, TMR-11: the match screen is fixed here, so it doesn't change during the match. */
    fun start(now: Long, chosen: WatchScreen) {
        if (phase != Phase.Ready) return
        period = 0
        screen = chosen
        beginPeriod(now)
        startedAt = mutableListOf(now / 1000)
        noteBattery(0)
        phase = Phase.Running
    }

    private fun beginPeriod(now: Long) {
        periodStart = now
        stoppageMs = 0
        stoppageStart = null
        breakStoppageRunning = false
        breakEnd = null
        breakIsHalftime = false
        scheduledBreakDone = false
        fullTimeAcked = false
        addedAcked = false
        fullTimeRepeats = false
        breakDue = false
        breakDueSilenced = false
        breakEndAlerted = false
        lastRepeat = 0
    }

    /** TMR-10: only when tracked. */
    fun toggleStoppage(now: Long) {
        if (phase != Phase.Running || !setup.tracked) return
        if (stoppageStart == null) {
            stoppageStart = now
            lastReminder = now
        } else {
            closeStoppage(now)
        }
    }

    private fun closeStoppage(now: Long) {
        val start = stoppageStart ?: return
        // The period's time it began at: on a stopping clock (TMR-15), where the clock stood still.
        val seconds = (matchMs(start) / 1000).toInt()
        val duration = now - start
        stoppageMs += duration
        stoppageStart = null
        breakStoppageRunning = false
        events.add(MatchEvent(EVENT_STOPPAGE, -1, period, seconds, null, (duration / 1000).toInt()))
    }

    /** EVT-16, TMR-15: a stoppage started by an event, as Start/Stop starts one, unless one is running. */
    private fun stopFor(now: Long) {
        if (phase == Phase.Running && setup.tracked && stoppageStart == null) {
            stoppageStart = now
            lastReminder = now
        }
    }

    /** TMR-15: a goal or card recorded stops a stopping clock, when it's set to. */
    private val stopsForGoalsCards get() = setup.stoppingClock && setup.stopForGoalsCards

    /** EVT-1, EVT-5, EVT-7: goals during play, cards at any time. True when it's a second yellow, or a second sin bin (EVT-12). */
    fun addEvent(type: String, team: Int, given: Int?, now: Long): Boolean {
        if (isGoal(type) && phase != Phase.Running) return false
        // EVT-12: only with sin bins on, and not once the clock has nothing left to run (the shoot-out, after full time).
        val sinBin = type == EVENT_SIN_BIN
        if (sinBin && (!setup.sinBins || phase == Phase.Penalties || phase == Phase.Done)) return false
        // EVT-3: 00 on the entry is no number.
        val player = given?.takeIf { it != 0 }
        // EVT-5; EVT-12: a second sin bin is a send-off too; a sin bin and a caution don't combine (Q-22).
        val second = (type == EVENT_YELLOW || sinBin) && player != null && events.any { it.type == type && it.team == team && it.player == player }
        val recorded = if (!second) type else if (sinBin) EVENT_SECOND_SIN_BIN else EVENT_SECOND_YELLOW
        events.add(MatchEvent(recorded, team, period, eventSeconds(now), player, if (sinBin) setup.sinBinSec else null))
        if (isGoal(recorded)) {
            score[team] = score[team] + 1
            // ET-6: the first goal in extra time wins it; End match or Undo comes next.
            if (goldenGoal && isExtraTime) phase = Phase.Golden
        }
        // EVT-16: an injury in play starts the stoppage, as Start/Stop does, unless one is running; at a break it has none.
        // TMR-15: so does a goal or card on a stopping clock, Start/Stop starting it again at the restart.
        if (recorded == EVENT_INJURY || (stopsForGoalsCards && (isGoal(recorded) || isCard(recorded)))) stopFor(now)
        return second
    }

    /**
     * EVT-15: a team official's caution or send-off, at any time as a player's card (EVT-7), with the role
     * (officialRoles) in extra. It never makes a second yellow: officials aren't matched by number.
     */
    fun addOfficialCard(red: Boolean, team: Int, role: Int, now: Long) {
        events.add(MatchEvent(if (red) EVENT_OFFICIAL_RED else EVENT_OFFICIAL_YELLOW, team, period, eventSeconds(now), null, role))
        // TMR-15: a card stops a stopping clock.
        if (stopsForGoalsCards) stopFor(now)
    }

    /**
     * EVT-14: a reason for the most recent card (Y, Y2, R, SB, SB2, TY, TR), replacing one given before; nothing when
     * there's no card. Undo takes it with its card.
     */
    fun giveReason(code: String) {
        events.lastOrNull { isCard(it.type) }?.reason = code
    }

    /** EVT-14: each card with a reason, in order, as its index in [events] and its code; worked out when asked, so it follows undos. */
    fun cardReasons(): List<Pair<Int, String>> = events.mapIndexedNotNull { i, e -> e.reason?.let { i to it } }

    /**
     * EVT-14: the upload's "misconduct", beside the events (which keep their six fields, for servers from before it):
     * the match's scheme and [index, code] for each card with a reason; null when none has one.
     */
    fun misconductUpload(): JsonObject? {
        val reasons = cardReasons()
        if (reasons.isEmpty()) return null
        return JsonObject(mapOf(
            "scheme" to JsonPrimitive(misconductScheme),
            "codes" to JsonArray(reasons.map { (i, code) -> JsonArray(listOf(JsonPrimitive(i), JsonPrimitive(code))) }),
        ))
    }

    /**
     * TMR-14: Adjust clock, during play: the period's clock moves by whole seconds (forward for a clock started
     * late), by moving the period's kickoff time, so every clock style, the halfway break and the alerts follow.
     * Never before the kickoff. Events already recorded keep their times. Recorded as CK at the new time, with the
     * change; false when nothing changed.
     */
    fun adjustClock(changeSec: Int, now: Long): Boolean {
        if (phase != Phase.Running || periodStart == null) return false
        val change = maxOf(changeSec, -(matchMs(now) / 1000).toInt())
        if (change == 0) return false
        shiftClock(change, now)
        events.add(MatchEvent(EVENT_CLOCK_ADJUSTED, -1, period, (matchMs(now) / 1000).toInt(), null, change))
        return true
    }

    private fun shiftClock(change: Int, now: Long) {
        periodStart = periodStart!! - change * 1000L
        val elapsed = matchMs(now)
        // The alerts and the halfway break come again when the clock is put back before them.
        if (elapsed < currentPeriodSec * 1000L) {
            fullTimeAcked = false
            // VIB-1: decided again when the length is reached again.
            fullTimeRepeats = false
        }
        rearmAdded(now)
        if (breakDue && breakAtSec >= 0 && elapsed < breakAtSec * 1000L) {
            breakDue = false
            breakDueSilenced = false
            scheduledBreakDone = false
        }
    }

    private fun rearmAdded(now: Long) {
        if (matchMs(now) < currentPeriodSec * 1000L + stoppageTotalMs(now)) addedAcked = false
    }

    /**
     * TMR-14: Adjust added time, with stoppage tracked: the stoppage total moves by whole seconds, for a stoppage
     * started or ended late; never below 0:00. A stoppage running carries on. Recorded as CA, with the change.
     */
    fun adjustAdded(changeSec: Int, now: Long): Boolean {
        // TMR-15: a stopping clock has no added time.
        if (phase != Phase.Running || !setup.tracked || setup.stoppingClock) return false
        val change = maxOf(changeSec, -(stoppageTotalMs(now) / 1000).toInt())
        if (change == 0) return false
        shiftAdded(change, now)
        events.add(MatchEvent(EVENT_ADDED_ADJUSTED, -1, period, eventSeconds(now), null, change))
        return true
    }

    private fun shiftAdded(change: Int, now: Long) {
        stoppageMs += change * 1000L
        // Taken back further than the stoppages before the running one: the running one is shorter.
        val start = stoppageStart
        if (stoppageMs < 0 && start != null) stoppageStart = min(start - stoppageMs, now)
        stoppageMs = maxOf(stoppageMs, 0L)
        rearmAdded(now)
    }

    /** ET-6: only with extra time. */
    val goldenGoal get() = setup.extraTime && setup.goldenGoal

    private fun eventSeconds(now: Long) = when (phase) {
        // TMR-13: a card while suspended is at the time play stopped.
        Phase.Running, Phase.Golden, Phase.Suspended -> (matchMs(now) / 1000).toInt()
        Phase.Pre, Phase.Ready -> SECONDS_BEFORE_KICKOFF
        Phase.Done -> SECONDS_AFTER_FULL_TIME
        Phase.Penalties -> SECONDS_PENALTIES
        else -> SECONDS_AT_BREAK
    }

    /**
     * INP-6: the most recent goal, card or shoot-out kick, only while it's in the current period: while play runs,
     * recorded since this period's kickoff; at a break, in the period just ended or the break itself. An earlier
     * period's can't be undone (null), so the game menu leaves Undo out and a hurried tap can't take back a
     * first-half card in the second half.
     */
    fun lastUndoableEvent(): MatchEvent? {
        val playing = phase == Phase.Running || phase == Phase.Golden
        // TMR-13: while suspended, as during play, but not a clock's correction.
        val inPlay = playing || phase == Phase.Suspended
        val event = events.lastOrNull { isUndoable(it.type, playing) } ?: return null
        return event.takeIf { it.period == period && !(inPlay && it.seconds < 0) }
    }

    fun undoLastEvent(now: Long = System.currentTimeMillis()) {
        val event = lastUndoableEvent() ?: return
        // TMR-14: a correction taken back moves the clock back by its change.
        if (event.type == EVENT_CLOCK_ADJUSTED) shiftClock(-(event.extra ?: 0), now)
        else if (event.type == EVENT_ADDED_ADJUSTED) shiftAdded(-(event.extra ?: 0), now)
        if (isGoal(event.type)) {
            score[event.team] = score[event.team] - 1
            // ET-6: the golden goal taken back, so play goes on.
            if (phase == Phase.Golden) phase = Phase.Running
        }
        events.removeAt(events.lastIndexOf(event))
        // EVT-12: a sin bin taken back no longer waits for its return.
        sinBinReturns = sinBinReturns.filter { it !== event }.toMutableList()
    }

    /** ET-6: the team whose golden goal won (or wins, while End match is offered), or -1. */
    fun goldenWinner(): Int = if (phase != Phase.Golden && !endedGolden) -1 else events.lastOrNull { isGoal(it.type) }?.team ?: -1

    /** ET-6: Undo on the golden goal screen: that goal goes, even with a card given since, and the period carries on. */
    fun undoGoldenGoal() {
        if (phase != Phase.Golden) return
        val goal = events.indexOfLast { isGoal(it.type) }
        if (goal >= 0) {
            score[events[goal].team] = score[events[goal].team] - 1
            events.removeAt(goal)
        }
        phase = Phase.Running
    }

    /** TMR-5, TMR-6. True when it ended the match. */
    fun endPeriod(now: Long): Boolean {
        if (phase != Phase.Running) return false
        if (periodEndsMatch) {
            finish(now)
            return true
        }
        closeStoppage(now)
        events.add(MatchEvent(EVENT_PERIOD_END, -1, period, (matchMs(now) / 1000).toInt()))
noteBattery(1)
        breakDue = false
        if (isLastPeriod) {
            phase = Phase.Decide
            breakEnd = null
        } else {
            beginBreak(now)
        }
        return false
    }

    private fun beginBreak(now: Long) {
        phase = Phase.Break
        breakIsHalftime = true
        breakEnd = now + setup.halftimeSec * 1000L
        breakEndAlerted = setup.halftimeSec <= 0
    }

    /** ET-1: extra time or penalties when level, otherwise the end. */
    fun recommendedDecision() = when {
        score[HOME] == score[AWAY] && canExtraTime -> Decision.ExtraTime
        score[HOME] == score[AWAY] && canPenalties -> Decision.Penalties
        else -> Decision.EndMatch
    }

    fun chooseExtraTime(now: Long) {
        if (phase == Phase.Decide && canExtraTime) beginBreak(now)
    }

    fun choosePenalties() {
        if (phase == Phase.Decide && canPenalties) {
            phase = Phase.Penalties
            penFirst = -1
            penStarted = false
        }
    }

    fun selectPenaltyFirst(team: Int) {
        if (phase == Phase.Penalties && !penStarted) penFirst = team
    }

    fun startPenalties() {
        if (phase == Phase.Penalties && !penStarted && penFirst >= 0) penStarted = true
    }

    fun nextKicker(): Int {
        val first = if (penFirst < 0) HOME else penFirst
        return if (penaltyKicks(first) == penaltyKicks(1 - first)) first else 1 - first
    }

    fun recordKick(scored: Boolean) {
        if (phase != Phase.Penalties || !penStarted || penaltyWinner() >= 0) return
        events.add(MatchEvent(if (scored) EVENT_PEN_SCORED else EVENT_PEN_MISSED, nextKicker(), period, SECONDS_PENALTIES))
    }

    fun penaltyKicks(team: Int) = events.count { it.team == team && isKick(it.type) }
    fun penaltyGoals(team: Int) = events.count { it.team == team && it.type == EVENT_PEN_SCORED }
    fun kickResults(team: Int) = events.filter { it.team == team && isKick(it.type) }.map { it.type == EVENT_PEN_SCORED }

    /** ET-4: the winner, or -1 while undecided. */
    fun penaltyWinner(): Int {
        val goals = listOf(penaltyGoals(HOME), penaltyGoals(AWAY))
        val kicks = listOf(penaltyKicks(HOME), penaltyKicks(AWAY))
        if (kicks[HOME] <= 5 && kicks[AWAY] <= 5) {
            for (team in 0..1) if (goals[team] > goals[1 - team] + 5 - kicks[1 - team]) return team
        } else if (kicks[HOME] == kicks[AWAY] && goals[HOME] != goals[AWAY]) {
            return if (goals[HOME] > goals[AWAY]) HOME else AWAY
        }
        return -1
    }

    fun penaltyScore(): List<Int>? = if (penFirst < 0 && penaltyKicks(HOME) == 0 && penaltyKicks(AWAY) == 0) null else listOf(penaltyGoals(HOME), penaltyGoals(AWAY))

    fun endHalftime() {
        if (phase != Phase.Break) return
        phase = Phase.NextKickoff
        breakEnd = null
        breakIsHalftime = false
    }

    fun startNextPeriod(now: Long) {
        // ET-7: ET1 waits for its kickoff team.
        if (phase != Phase.NextKickoff || kickoffFor(period + 1) < 0) return
        period += 1
        beginPeriod(now)
        startedAt.add(now / 1000)
        noteBattery(0)
        phase = Phase.Running
    }

    /** EVT-11: ended for good here, with the score as it stands. */
    fun abandon(now: Long, reason: Int) = finish(now, reason)

    val isAbandoned get() = events.any { it.type == EVENT_ABANDON }

    fun finish(now: Long, abandonReason: Int? = null) {
        if (phase == Phase.Done) return
        var seconds = if (phase == Phase.Penalties) SECONDS_PENALTIES else SECONDS_AT_BREAK
        // ET-6: End match after a golden goal, not an abandonment from its screen.
        endedGolden = phase == Phase.Golden && abandonReason == null
        if (phase == Phase.Running || phase == Phase.Golden || phase == Phase.Suspended) {
            // TMR-13: abandoned while suspended, the period ends where play stopped.
            closeStoppage(clockNow(now))
            seconds = (matchMs(now) / 1000).toInt()
            events.add(MatchEvent(EVENT_PERIOD_END, -1, period, seconds))
            noteBattery(1)
        }
        abandonReason?.let { events.add(MatchEvent(EVENT_ABANDON, -1, period, seconds, null, it)) }
        phase = Phase.Done
        breakEnd = null
        clearSuspension()
    }

    /**
     * TMR-13: Suspend match, during play, for a lightning or weather delay: every clock stops where it is (the
     * match clock, the stoppage clock, a running halfway break) until Resume. Recorded as SU at the period's
     * time, with the reason (suspendReasons) in extra. For lightning, a 30:00 countdown starts.
     */
    fun suspend(reason: Int, now: Long): Boolean {
        if (phase != Phase.Running || suspendReasons.none { it.first == reason }) return false
        events.add(MatchEvent(EVENT_SUSPENDED, -1, period, eventSeconds(now), null, reason))
        phase = Phase.Suspended
        suspendedAt = now
        suspendReason = reason
        lightningFrom = if (reason == LIGHTNING) now else null
        lightningAlerted = false
        return true
    }

    /** TMR-13: Lightning again, while suspended for lightning: the 30:00 countdown starts over. */
    fun lightningAgain(now: Long) {
        if (phase == Phase.Suspended && suspendReason == LIGHTNING) {
            lightningFrom = now
            lightningAlerted = false
        }
    }

    /**
     * TMR-13: Resume: the period carries on from where it stopped, every clock moved on by the time suspended,
     * so it's neither played time nor added time. Recorded as RS at the same period's time, with the whole
     * seconds suspended in extra. The period's startedAt (for the track) stays as it was.
     */
    fun resume(now: Long) {
        val at = suspendedAt
        if (phase != Phase.Suspended || at == null) return
        val shift = maxOf(now - at, 0L)
        periodStart = periodStart?.let { it + shift }
        stoppageStart = stoppageStart?.let { it + shift }
        breakEnd = breakEnd?.let { it + shift }
        lastReminder += shift
        phase = Phase.Running
        clearSuspension()
        events.add(MatchEvent(EVENT_RESUMED, -1, period, (matchMs(now) / 1000).toInt(), null, (shift / 1000).toInt()))
    }

    private fun clearSuspension() {
        suspendedAt = null
        suspendReason = -1
        lightningFrom = null
        lightningAlerted = false
    }
}

/** SET-16: a period's label before a time, "1H 23:40", or the time alone for a match of one period. */
fun withPeriod(period: Int, numPeriods: Int, text: String) = periodLabel(period, numPeriods).let { if (it.isEmpty()) text else "$it $text" }

/** The format in short, "2×45' · HT 15'", and "1×20'" for one period, whose break is only before extra time (SET-16). */
fun formatSummary(f: MatchSetup): String {
    val periods = "${f.numPeriods}×${f.periodSec / 60}'"
    return if (f.numPeriods == 1) periods else "$periods · HT ${f.halftimeSec / 60}'"
}

/**
 * INP-3: a period spelled out, for the game menu's rows: "first half", "second quarter", "third period",
 * "extra time 1" ("extra time" when it has one period).
 */
fun periodName(period: Int, numPeriods: Int, etPeriods: Int = 2): String {
    if (period >= numPeriods) return if (etPeriods == 1) "extra time" else "extra time ${period - numPeriods + 1}"
    // SET-16: one period is just "period" ("End period" before extra time or penalties).
    if (numPeriods == 1) return "period"
    val nth = listOf("first", "second", "third", "fourth").getOrElse(period) { "${period + 1}th" }
    return nth + when (numPeriods) { 2 -> " half"; 4 -> " quarter"; else -> " period" }
}

/** UI-3: "1H", "Q1" with four periods, "P1" with three, "ET1"; nothing for a match of one period (SET-16). */
fun periodLabel(period: Int, numPeriods: Int): String = when {
    period >= numPeriods -> "ET${period - numPeriods + 1}"
    numPeriods == 1 -> ""
    numPeriods == 2 -> "${period + 1}H"
    numPeriods == 4 -> "Q${period + 1}"
    else -> "P${period + 1}"
}
