package app.lawfive.wear

import app.lawfive.cases.MATCH_CASES_JSON
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.fail
import org.junit.Test

// WCH-2: the shared match cases (schema/match-cases/*.json) run on this engine: each case's format and
// screen, then its steps' actions at their times, checking what's expected after each. A mismatch names
// the case, the step and the field; every mismatch is listed before the test fails.
class MatchCasesTest {
    private val t0 = 1_800_000_000_000L

    private fun JsonObject.text(key: String) = (this[key] as? JsonPrimitive)?.contentOrNull
    private fun JsonObject.number(key: String) = (this[key] as? JsonPrimitive)?.intOrNull
    private fun JsonObject.flag(key: String) = (this[key] as? JsonPrimitive)?.booleanOrNull
    private fun team(name: String?) = if (name == "away") AWAY else HOME
    private fun teamName(team: Int): JsonElement = if (team == HOME) JsonPrimitive("home") else if (team == AWAY) JsonPrimitive("away") else JsonNull
    private val styles = mapOf("up" to CLOCK_UP, "upEach" to CLOCK_UP_EACH, "down" to CLOCK_DOWN)

    private fun setupOf(f: JsonObject): MatchSetup {
        val d = MatchSetup()
        return d.copy(
            numPeriods = f.number("numPeriods") ?: d.numPeriods, periodSec = f.number("periodSec") ?: d.periodSec,
            halftimeSec = f.number("halftimeSec") ?: d.halftimeSec, midBreak = f.flag("midBreak") ?: d.midBreak,
            breakLenSec = f.number("breakLenSec") ?: d.breakLenSec, breakStoppage = f.flag("breakStoppage") ?: d.breakStoppage,
            trackStoppage = f.flag("trackStoppage") ?: d.trackStoppage, goalScorers = f.flag("goalScorers") ?: d.goalScorers,
            goalTypes = f.flag("goalTypes") ?: d.goalTypes, extraTime = f.flag("extraTime") ?: d.extraTime,
            etPeriods = f.number("etPeriods") ?: d.etPeriods, etPeriodSec = f.number("etPeriodSec") ?: d.etPeriodSec,
            goldenGoal = f.flag("goldenGoal") ?: d.goldenGoal, penalties = f.flag("penalties") ?: d.penalties,
            sinBins = f.flag("sinBins") ?: d.sinBins, sinBinSec = f.number("sinBinSec") ?: d.sinBinSec,
            // TMR-15.
            stoppingClock = f.flag("stoppingClock") ?: d.stoppingClock, stopForGoalsCards = f.flag("stopForGoalsCards") ?: d.stopForGoalsCards,
        )
    }

    private fun screenOf(s: JsonObject) = WatchScreen(
        clocks = when (s.text("clocks")) { "stacked" -> CLOCKS_STACKED; "sideBySide" -> CLOCKS_SIDE_BY_SIDE; else -> CLOCKS_ONE },
        mainClock = styles[s.text("mainClock")] ?: CLOCK_UP,
        secondClock = styles[s.text("secondClock")] ?: CLOCK_DOWN,
        breakClock = if (s.text("breakClock") == "up") BREAK_UP else BREAK_DOWN,
    )

    private fun act(m: Match, a: JsonObject, now: Long, screen: WatchScreen) {
        when (a.text("do")) {
            "kickoff" -> m.selectKickoff(team(a.text("team")))
            "clearKickoff" -> m.clearKickoff()
            "start" -> m.start(now, screen)
            "swapKickoff" -> m.swapKickoff()
            "endPeriod" -> m.endPeriod(now)
            "endHalftime" -> m.endHalftime()
            "startNextPeriod" -> m.startNextPeriod(now)
            "stoppage" -> m.toggleStoppage(now)
            "undo" -> m.undoLastEvent(now)
            "restart" -> m.restart()
            "startBreak" -> m.startBreak(now)
            "skipBreak" -> m.skipBreak()
            "endBreakEarly" -> m.endBreakEarly(now)
            "chooseExtraTime" -> m.chooseExtraTime(now)
            "choosePenalties" -> m.choosePenalties()
            "penaltyFirst" -> m.selectPenaltyFirst(team(a.text("team")))
            "startPenalties" -> m.startPenalties()
            "kick" -> m.recordKick(a.flag("scored") == true)
            "acknowledge" -> m.acknowledgeAlerts(now)
            "finish" -> m.finish(now)
            "abandon" -> m.abandon(now, a.number("reason") ?: 0)
            "undoGoldenGoal" -> m.undoGoldenGoal()
            "resetBreak" -> m.resetBreak()
            "event" -> m.addEvent(a.text("type")!!, team(a.text("team")), a.number("player"), now)
            "official" -> m.addOfficialCard(a.text("type") == "R", team(a.text("team")), a.number("role") ?: 2, now)
            // TMR-14.
            "adjustClock" -> m.adjustClock(a.number("sec") ?: 0, now)
            "adjustAdded" -> m.adjustAdded(a.number("sec") ?: 0, now)
            // TMR-13.
            "suspend" -> m.suspend(a.number("reason") ?: 0, now)
            "resume" -> m.resume(now)
            "lightningAgain" -> m.lightningAgain(now)
            // EVT-14.
            "reason" -> m.giveReason(a.text("code")!!)
            else -> throw AssertionError("unknown action $a")
        }
    }

    /** What the engine shows for an expected field, as the cases write it. */
    private fun shown(m: Match, key: String, now: Long, alert: Alert?): JsonElement = when (key) {
        "clock" -> JsonPrimitive(m.clockDisplay(now).first)
        "added" -> m.clockDisplay(now).second?.let(::JsonPrimitive) ?: JsonNull
        "second" -> if (m.shown.clocks == CLOCKS_ONE) JsonNull else JsonPrimitive(m.secondClockText(now))
        "progress" -> JsonPrimitive(m.periodProgress(now))
        "breakClock" -> m.breakClockText(now)?.let(::JsonPrimitive) ?: JsonNull
        "phase" -> JsonPrimitive(when (m.phase) { Phase.Break -> "break"; else -> m.phase.name.replaceFirstChar { it.lowercase() } })
        "period" -> JsonPrimitive(m.period)
        "score" -> JsonArray(m.score.map(::JsonPrimitive))
        "kickoff" -> if (m.firstKickoff < 0) JsonNull else teamName(m.firstKickoff)
        "kickoffOnScreen" -> if (m.kickoffTeamOnScreen < 0) JsonNull else teamName(m.kickoffTeamOnScreen)
        "events" -> JsonPrimitive(m.events.size)
        "alert" -> alert?.let { JsonPrimitive(it.name.replaceFirstChar { c -> c.lowercase() }) } ?: JsonNull
        "alerting" -> JsonPrimitive(m.hasActiveAlert(now))
        "breakDue" -> JsonPrimitive(m.breakDue)
        "stoppageRunning" -> JsonPrimitive(m.isStoppageActive)
        // TMR-15.
        "clockStopped" -> JsonPrimitive(m.clockStopped)
        // TMR-16.
        "stoppage" -> m.stoppagePill(now)?.let { JsonObject(mapOf("text" to JsonPrimitive(it.text), "solid" to JsonPrimitive(it.solid))) } ?: JsonNull
        "pens" -> m.penaltyScore()?.let { p -> JsonArray(p.map(::JsonPrimitive)) } ?: JsonNull
        "endedGolden" -> JsonPrimitive(m.endedGolden)
        "abandoned" -> JsonPrimitive(m.isAbandoned)
        "periodLabel" -> JsonPrimitive(periodLabel(m.period, m.setup.numPeriods))
        "stoppageMs" -> JsonPrimitive(m.stoppageTotalMs(now))
        "breakStoppageRunning" -> JsonPrimitive(m.breakStoppageRunning)
        "breakLeftMs" -> m.breakRemainingMs(now)?.let(::JsonPrimitive) ?: JsonNull
        "breakDueInMs" -> m.breakDueInMs(now)?.let(::JsonPrimitive) ?: JsonNull
        "screenOn" -> JsonPrimitive(m.wantsScreenOn(now))
        "decision" -> JsonPrimitive(m.recommendedDecision().name.replaceFirstChar { it.lowercase() })
        "nextKicker" -> teamName(m.nextKicker())
        "penaltyWinner" -> m.penaltyWinner().let { if (it < 0) JsonNull else teamName(it) }
        "goldenWinner" -> m.goldenWinner().let { if (it < 0) JsonNull else teamName(it) }
        "suspendedMs" -> m.suspendedMs(now)?.let(::JsonPrimitive) ?: JsonNull
        "lightningLeftMs" -> m.lightningLeftMs(now)?.let(::JsonPrimitive) ?: JsonNull
        // EVT-12.
        "sinBinPill" -> m.sinBinPill(now)?.let(::JsonPrimitive) ?: JsonNull
        "sinBins" -> JsonPrimitive(m.runningSinBins(now).size)
        "sinBinReturn" -> m.sinBinReturns.firstOrNull()?.let { e -> JsonObject(mapOf("team" to teamName(e.team), "player" to (e.player?.let(::JsonPrimitive) ?: JsonNull))) } ?: JsonNull
        // EVT-14: [index in events, code] for each card with a reason.
        "reasons" -> JsonArray(m.cardReasons().map { (i, code) -> JsonArray(listOf(JsonPrimitive(i), JsonPrimitive(code))) })
        else -> JsonPrimitive("($key isn't checked on Wear OS)")
    }

    private fun same(a: JsonElement, b: JsonElement): Boolean {
        val x = (a as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
        val y = (b as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
        return if (x != null && y != null) kotlin.math.abs(x - y) < 0.0001 else a == b
    }

    @Test fun sharedCases() {
        val problems = mutableListOf<String>()
        val cases = Json.parseToJsonElement(MATCH_CASES_JSON).jsonObject["match"]!!.jsonArray
        for (element in cases) {
            val c = element.jsonObject
            val name = c.text("name")
            val screen = screenOf(c["screen"]!!.jsonObject)
            val format = c["format"]!!.jsonObject
            var m = Match(setupOf(format), created = t0 / 1000, vibeAdded = format.flag("vibeAdded") ?: true,
                vibeSinBin = format.flag("vibeSinBin") ?: true)
            c["steps"]!!.jsonArray.forEachIndexed { i, s ->
                val step = s.jsonObject
                val now = t0 + step["at"]!!.jsonPrimitive.long
                step["do"]!!.jsonArray.forEach {
                    // TMR-8: the app closed and opened again, the match read back from what the Store saved.
                    if (it.jsonObject.text("do") == "reopen") m = json.decodeFromString<Match>(json.encodeToString(m)).also { r -> r.restored() }
                    else act(m, it.jsonObject, now, screen)
                }
                val expect = step["expect"]?.jsonObject ?: return@forEachIndexed
                // A tick fires what's due at this time, before the rest is read.
                val alert = if ("alert" in expect) m.tick(now) else null
                for ((key, expected) in expect) {
                    val where = "$name › step ${i + 1}"
                    when (key) {
                        "breakPill" -> Unit // The pictures' own.
                        "last" -> {
                            val last = m.events.lastOrNull()
                            if (last == null) { problems += "$where: no events"; continue }
                            val got = mapOf("type" to JsonPrimitive(last.type), "team" to if (last.team < 0) JsonNull else teamName(last.team),
                                "seconds" to JsonPrimitive(last.seconds), "player" to (last.player?.let(::JsonPrimitive) ?: JsonNull),
                                "extra" to (last.extra?.let(::JsonPrimitive) ?: JsonNull), "reason" to (last.reason?.let(::JsonPrimitive) ?: JsonNull))
                            for ((k, v) in expected.jsonObject) if (!same(got[k] ?: JsonNull, v)) problems += "$where: last.$k expected $v, got ${got[k]}"
                        }
                        else -> shown(m, key, now, alert).let { if (!same(it, expected)) problems += "$where: $key expected $expected, got $it" }
                    }
                }
            }
        }
        if (problems.isNotEmpty()) fail(problems.joinToString("\n"))
    }
}
