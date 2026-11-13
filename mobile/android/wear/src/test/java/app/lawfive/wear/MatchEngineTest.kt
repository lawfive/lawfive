package app.lawfive.wear

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// WCH-2: what's particular to the Wear OS engine; the match's rules themselves are the shared cases (MatchCasesTest).

class MatchEngineTest {
    private val t0 = 1_800_000_000_000L
    private fun at(start: Long, min: Int, sec: Int = 0) = start + (min * 60 + sec) * 1000L
    private fun match(setup: MatchSetup = MatchSetup()) = Match(setup, created = t0 / 1000).apply { selectKickoff(HOME) }
    /** TMR-11: the match clock comes from the match screen at kickoff; the setup's style stands in for it here. */
    private fun started(setup: MatchSetup = MatchSetup()) = match(setup).apply { start(t0, WatchScreen(mainClock = setup.clockStyle)) }

    @Test fun screenFromTheOldLayouts() {
        assertEquals(WatchScreen(edge = EDGE_RING), WatchScreen.fromLayout(LAYOUT_RING, CLOCK_UP, CLOCK_DOWN))
        assertFalse(WatchScreen.fromLayout(LAYOUT_MINIMAL, CLOCK_UP, CLOCK_DOWN).names)
        assertEquals(WatchScreen(), WatchScreen.fromLayout(LAYOUT_SCOREBOARD, CLOCK_UP, CLOCK_DOWN))
        assertEquals(LAYOUT_SIDE_BY_SIDE, WatchScreen(clocks = CLOCKS_SIDE_BY_SIDE, edge = EDGE_RING).nearestLayout)
        assertEquals(LAYOUT_MINIMAL, WatchScreen(names = false, edge = EDGE_RING).nearestLayout)
        assertEquals(LAYOUT_DEFAULT, WatchScreen(edge = EDGE_TIME).nearestLayout)
        // A match saved before the choices reads its layout and its own clock style.
        val old = match(MatchSetup(clockStyle = CLOCK_DOWN)).apply { faceLayout = LAYOUT_STACKED }
        assertEquals(CLOCKS_STACKED, old.shown.clocks)
        assertEquals(CLOCK_DOWN, old.clockStyle)
    }

    @Test fun theDefaultScreen() {
        // UI-24: until one is chosen, two clocks stacked, the time left over the match time, with the time of day.
        assertEquals(WatchScreen(CLOCKS_STACKED, CLOCK_DOWN, CLOCK_UP, BREAK_DOWN, EDGE_TIME, true), Saved().chosenScreen)
        // A layout chosen before the choices is kept.
        assertEquals(CLOCKS_SIDE_BY_SIDE, Saved(faceLayout = LAYOUT_SIDE_BY_SIDE).chosenScreen.clocks)
    }

    @Test fun theBatteryIsNotedAtEachKickoffAndEnd() {
        battery = { 80 }
        val m = started(MatchSetup(numPeriods = 2))
        m.endPeriod(at(t0, 45, 0))
        assertEquals(listOf(listOf(0, 0, 80), listOf(0, 1, 80)), m.batteryLog)
        battery = { null }
    }

    /** ET-6: as MatchTests.mc's testGoldenGoal. */
    // PRE-8: as MatchTests.mc's testKickoffDirection.
    @Test fun kickoffDirection() {
        val full = (2 * Math.PI).toFloat()
        fun near(a: Float?, b: Double) = assertEquals(b, a!!.toDouble(), 0.001)
        val m = match()
        assertNull(m.attackHeading(1))
        m.setKickoffHeading((Math.PI / 2).toFloat())
        m.start(t0, WatchScreen())
        assertTrue(m.canRecordDirection)
        m.endPeriod(at(t0, 46))
        m.endHalftime()
        near(m.attackHeading(1), Math.PI / 2)
        m.selectKickoff(HOME)
        near(m.attackHeading(1), 3 * Math.PI / 2)
        m.selectKickoff(AWAY)
        near(m.attackHeading(1), Math.PI / 2)
        m.startNextPeriod(at(t0, 61))
        assertFalse(m.canRecordDirection)

        val swapped = match()
        swapped.setKickoffHeading((Math.PI / 2).toFloat())
        swapped.start(t0, WatchScreen())
        swapped.swapKickoff()
        swapped.endPeriod(at(t0, 46))
        swapped.endHalftime()
        assertEquals(HOME, swapped.kickoffFor(1))
        near(swapped.attackHeading(1), 3 * Math.PI / 2)
        assertTrue(normalizeHeading(-1f) in 0f..full)
    }

    // ET-7: as MatchTests.mc's testExtraTimeFlow and testKickoffDirection: extra time's own toss and direction.
    @Test fun extraTimeHasItsOwnToss() {
        fun near(a: Float?, b: Double) = assertEquals(b, a!!.toDouble(), 0.001)
        val m = started(MatchSetup(extraTime = true, penalties = true))
        m.setKickoffHeading((Math.PI / 2).toFloat())
        m.endPeriod(at(t0, 45))
        m.endHalftime()
        m.startNextPeriod(at(t0, 60))
        m.endPeriod(at(t0, 105))
        m.chooseExtraTime(at(t0, 105))
        assertEquals("before extra time it's down to the toss", -1, m.kickoffFor(2))
        m.endHalftime()
        assertEquals(-1, m.kickoffTeamOnScreen)
        assertFalse(m.canRecordDirection)
        m.startNextPeriod(at(t0, 120))
        assertEquals("ET1 waits for its kickoff team", Phase.NextKickoff, m.phase)
        m.selectKickoff(AWAY)
        assertEquals(AWAY, m.kickoffTeamOnScreen)
        assertEquals("the match's own kickoff team is kept", HOME, m.kickoff)
        assertTrue(m.canRecordDirection)
        assertFalse(m.hasDirection)
        m.setKickoffHeading(0f) // AWY attacks north in ET1
        assertTrue(m.hasDirection)
        near(m.homeHeading, Math.PI / 2)
        m.startNextPeriod(at(t0, 120))
        assertEquals(AWAY, m.firstKickoff)
        assertTrue(m.canRecordDirection)
        m.endPeriod(at(t0, 135))
        assertEquals(HOME, m.kickoffFor(3))
        m.endHalftime()
        assertEquals(HOME, m.kickoffTeamOnScreen)
        assertEquals(1.0, Math.cos(m.attackHeading(3)!!.toDouble()), 0.001) // ends changed: HOM attacks north in ET2
        assertFalse(m.canRecordDirection)
        m.startNextPeriod(at(t0, 140))
        m.swapKickoff() // HOM took the ET1 kickoff after all
        assertEquals(HOME, m.etKickoff)
        assertEquals(HOME, m.kickoff)
    }

    // SET-13: Same as last carries the format, not the teams, colors or timer names; turning it back on keeps the colors chosen.
    @Test fun sameAsLastFormat() {
        val played = MatchSetup(home = "STR", away = "ROV", homeColor = 0xD71920, numPeriods = 4, periodSec = 600, extraTime = true, goldenGoal = true,
            penalties = true, trackStoppage = true, goalTypes = true, stoppageLabel = "water", breakLabel = "drinks")
        val last = played.format()
        assertEquals("HOM", last.home)
        assertEquals(-1, last.homeColor)
        assertEquals("stoppage", last.stoppageLabel)
        assertEquals(4, last.numPeriods)
        assertEquals(600, last.periodSec)
        assertTrue(last.extraTime && last.goldenGoal && last.penalties && last.trackStoppage && last.goalTypes)
        val draft = MatchSetup(homeColor = 0x0057B8, numPeriods = 2).withFormat(last)
        assertEquals(0x0057B8, draft.homeColor)
        assertEquals(4, draft.numPeriods)
    }

    // SET-13: New match leaves out Same as last when it's Quick match over again, whatever the teams and colors.
    @Test fun sameAsLastHiddenWhenQuick() {
        val quick = MatchSetup()
        assertTrue(MatchSetup(home = "STR", homeColor = 0xD71920, stoppageLabel = "water").format().sameFormat(quick))
        assertFalse(MatchSetup(trackStoppage = true).sameFormat(quick))
        assertFalse(MatchSetup(periodSec = 40 * 60).sameFormat(quick))
    }

    // TRK-7: samples packed as the Garmin watch packs them (MatchTests.mc's testTrackSampleText and testTrackChunksAndUpload).
    @Test fun trackPacking() {
        assertEquals(",51500000,-120000,345,142;", TrackChunk.encode(10, 51500000, -120000, null, null, 345, 142))
        assertEquals(",3,-5,120,141;", TrackChunk.encode(10, 51500003, -120005, 51500000, -120000, 120, 141))
        assertEquals("12,,,,140;", TrackChunk.encode(12, null, null, 51500003, -120005, null, 140))
        assertEquals(",1,0;", TrackChunk.encode(10, 51500004, -120005, 51500003, -120005, null, null))
        var chunk = TrackChunk()
        for (i in 0 until TrackChunk.SAMPLES) chunk = chunk.add(i * 10, 51500000 + i, -120000, 300, 140)!!
        assertTrue(chunk.isFull)
        assertEquals("0,51500000,-120000,300,", chunk.text.take(23))
        val next = TrackChunk().add(3000, 51500300, -120000, 300, 140)!!
        assertEquals("3000,51500300,-120000,300,140;", next.text)
        assertEquals(null, next.add(3010, null, null, null, null))
        assertEquals(null, next.add(3000, 51500301, -120000, null, null))
    }

    // INP-6: Undo is offered only for the current period's events, so the game menu leaves it out otherwise
    // (the shared case "undo takes back only the current period's events" checks undoLastEvent itself).
    @Test fun undoOnlyInTheCurrentPeriod() {
        val m = match()
        m.addEvent(EVENT_YELLOW, AWAY, 3, t0) // Before kickoff.
        m.start(t0, WatchScreen())
        assertNull(m.lastUndoableEvent()) // The pre-match card isn't this period's play.
        m.addEvent(EVENT_GOAL, HOME, 9, at(t0, 10))
        assertEquals(EVENT_GOAL, m.lastUndoableEvent()?.type)
        m.endPeriod(at(t0, 46))
        // At half-time, the half just ended and the break's own are still offered.
        assertEquals(EVENT_GOAL, m.lastUndoableEvent()?.type)
        m.addEvent(EVENT_YELLOW, HOME, 6, at(t0, 47))
        assertEquals(EVENT_YELLOW, m.lastUndoableEvent()?.type)
        m.endHalftime()
        m.startNextPeriod(at(t0, 60))
        // In the second half, nothing from the first or its break: no Undo row.
        assertNull(m.lastUndoableEvent())
        m.undoLastEvent()
        assertEquals(4, m.events.size) // The card before kickoff, the goal, the half's end and the half-time card.
        assertEquals(listOf(1, 0), m.score.toList())
        m.addEvent(EVENT_RED, AWAY, 4, at(t0, 61))
        assertEquals(EVENT_RED, m.lastUndoableEvent()?.type)
        m.undoLastEvent()
        assertNull(m.lastUndoableEvent())
    }

    // TMR-14, TMR-8: a correction is saved as it goes: the clock, the added time and their events come back
    // from the watch's file as they were, and Undo still takes them back after it.
    @Test fun anAdjustmentSurvivesASaveAndReload() {
        val m = started(MatchSetup(trackStoppage = true))
        m.toggleStoppage(at(t0, 5))
        m.toggleStoppage(at(t0, 6))
        assertTrue(m.adjustClock(40, at(t0, 20)))
        assertTrue(m.adjustAdded(-15, at(t0, 21)))
        val back = json.decodeFromString<Saved>(json.encodeToString(Saved(match = m))).match!!
        assertEquals("21:40", back.clockDisplay(at(t0, 21)).first)
        assertEquals(45_000L, back.stoppageTotalMs(at(t0, 21)))
        assertEquals(listOf(EVENT_STOPPAGE, EVENT_CLOCK_ADJUSTED, EVENT_ADDED_ADJUSTED), back.events.map { it.type })
        assertEquals(listOf(40, -15), back.events.drop(1).map { it.extra })
        back.undoLastEvent(at(t0, 22))
        assertEquals(60_000L, back.stoppageTotalMs(at(t0, 22)))
        back.undoLastEvent(at(t0, 22))
        assertEquals("22:00", back.clockDisplay(at(t0, 22)).first)
        assertEquals(1, back.events.size)
    }

    // TMR-14: the change as the watches write it, with a true minus.
    @Test fun changesAreSigned() {
        assertEquals("+0:40", formatChange(40))
        assertEquals("−1:05", formatChange(-65))
        assertEquals("+12:00", formatChange(720))
    }

    // TMR-13, TMR-8: a match saved while suspended comes back from the watch's file still suspended: its reason, the
    // lightning countdown where it was, the clock frozen, and a card given meanwhile at the time play stopped. The
    // countdown's alert comes once, even across another reload, and Resume carries the clock on from where it stopped.
    @Test fun aSuspensionSurvivesASaveAndReload() {
        fun reload(m: Match) = json.decodeFromString<Saved>(json.encodeToString(Saved(match = m))).match!!
        val m = started()
        assertTrue(m.suspend(LIGHTNING, at(t0, 20)))
        m.addEvent(EVENT_YELLOW, AWAY, 4, at(t0, 25))
        val back = reload(m)
        assertEquals(Phase.Suspended, back.phase)
        assertEquals(LIGHTNING, back.suspendReason)
        assertEquals("20:00", back.clockDisplay(at(t0, 40)).first)
        assertEquals(20 * 60_000L, back.suspendedMs(at(t0, 40)))
        assertEquals(10 * 60_000L, back.lightningLeftMs(at(t0, 40)))
        assertEquals(listOf(EVENT_SUSPENDED, EVENT_YELLOW), back.events.map { it.type })
        assertEquals(1200, back.events[1].seconds)
        assertEquals(EVENT_YELLOW, back.lastUndoableEvent()?.type)
        assertNull(back.tick(at(t0, 49, 59)))
        assertEquals(Alert.Lightning, back.tick(at(t0, 50)))
        val again = reload(back)
        assertNull(again.tick(at(t0, 50, 10)))
        assertEquals(0L, again.lightningLeftMs(at(t0, 51)))
        again.resume(at(t0, 55))
        assertEquals(Phase.Running, again.phase)
        assertEquals("21:00", again.clockDisplay(at(t0, 56)).first)
        assertEquals(EVENT_RESUMED to 2100, again.events.last().let { it.type to it.extra })
        assertNull(again.suspendedAt)
        assertEquals(-1, again.suspendReason)
    }

    // EVT-14, TMR-8: a card's reason and the match's scheme come back from the watch's file; a match saved before
    // reasons (no "reason", no scheme) still loads, with none and IFAB's.
    @Test fun aReasonSurvivesASaveAndReload() {
        val m = Match(MatchSetup(), created = t0 / 1000, misconductScheme = "ussf").apply { selectKickoff(HOME); start(t0, WatchScreen()) }
        m.addEvent(EVENT_YELLOW, HOME, 4, at(t0, 10))
        m.giveReason("UB")
        m.addEvent(EVENT_GOAL, AWAY, 9, at(t0, 12))
        val back = json.decodeFromString<Saved>(json.encodeToString(Saved(match = m))).match!!
        assertEquals("UB", back.events[0].reason)
        assertNull(back.events[1].reason)
        assertEquals("ussf", back.misconductScheme)
        assertEquals(listOf(0 to "UB"), back.cardReasons())

        val old = json.decodeFromString<Saved>("""{"match":{"events":[{"type":"Y","team":0,"period":0,"seconds":60,"player":4}]}}""").match!!
        assertNull(old.events.single().reason)
        assertEquals("ifab", old.misconductScheme)
        assertTrue(old.cardReasons().isEmpty())
        // Without a card, a reason goes nowhere.
        val none = started()
        none.addEvent(EVENT_GOAL, HOME, 9, at(t0, 1))
        none.giveReason("UB")
        assertTrue(none.cardReasons().isEmpty())
    }

    // EVT-14: the upload's misconduct, the match's scheme and [index, code], only when a card has a reason.
    @Test fun theUploadsMisconductOnlyWithReasons() {
        val m = Match(MatchSetup(), created = t0 / 1000, misconductScheme = "fa").apply { selectKickoff(HOME); start(t0, WatchScreen()) }
        m.addEvent(EVENT_YELLOW, HOME, 4, at(t0, 10))
        assertNull(m.misconductUpload())
        m.addOfficialCard(true, AWAY, 0, at(t0, 11))
        m.giveReason("S2")
        assertEquals("""{"scheme":"fa","codes":[[1,"S2"]]}""", m.misconductUpload().toString())
        m.undoLastEvent(at(t0, 12))
        assertNull(m.misconductUpload())
    }

    // EVT-14: a downloaded match's scheme, none from a server before it; not part of the format, so Same as last leaves it.
    @Test fun theSchemeFromTheDownload() {
        assertNull(setupOf(buildJsonObject { put("id", JsonPrimitive("m1")) }).misconductScheme)
        val planned = setupOf(buildJsonObject { put("misconductScheme", JsonPrimitive("ussf")) })
        assertEquals("ussf", planned.misconductScheme)
        assertNull(planned.format().misconductScheme)
        assertEquals("ifab", Misconduct.scheme(null))
        assertEquals("ifab", Misconduct.scheme("made-up"))
    }

    // EVT-12, TMR-8: "can return" comes back from the watch's file waiting, as the match's own event, so Undo takes it
    // back from the waiting too; a sin bin that ended while the app was away is announced once it's back.
    @Test fun aSinBinSurvivesASaveAndReload() {
        fun reload(m: Match) = json.decodeFromString<Saved>(json.encodeToString(Saved(match = m))).match!!.apply { restored() }
        val m = started(MatchSetup(sinBins = true, sinBinSec = 300))
        m.addEvent(EVENT_SIN_BIN, AWAY, 7, at(t0, 10))
        assertEquals(Alert.SinBinEnd, m.tick(at(t0, 15)))
        val back = reload(m)
        assertEquals("AWY #7 can return", back.sinBinReturnText())
        assertTrue(back.sinBinReturns.single() === back.events.single())
        back.tick(at(t0, 15, 1))
        assertEquals(1, back.sinBinReturns.size)
        back.undoLastEvent(at(t0, 15, 2))
        assertTrue(back.sinBinReturns.isEmpty())

        val away = started(MatchSetup(sinBins = true, sinBinSec = 300))
        away.addEvent(EVENT_SIN_BIN, HOME, 0, at(t0, 10))
        assertNull(away.tick(at(t0, 12)))
        val later = reload(away)
        assertEquals(Alert.SinBinEnd, later.tick(at(t0, 16)))
        assertEquals("HOM can return", later.sinBinReturnText())
        assertTrue(later.acknowledgeAlerts(at(t0, 16, 5)))
        assertNull(reload(later).sinBinReturnText())
    }

    // EVT-12, UI-1: the pill without the team, for a row too full for it.
    @Test fun theSinBinPillWithoutItsTeam() {
        val m = started(MatchSetup(sinBins = true))
        m.addEvent(EVENT_SIN_BIN, AWAY, 7, at(t0, 1))
        m.addEvent(EVENT_SIN_BIN, HOME, null, at(t0, 2))
        assertEquals("AWY 7 6:00 +1", m.sinBinPill(at(t0, 5)))
        assertEquals("7 6:00 +1", m.sinBinPill(at(t0, 5), team = false))
        m.undoLastEvent(at(t0, 5))
        m.undoLastEvent(at(t0, 5))
        m.addEvent(EVENT_SIN_BIN, HOME, null, at(t0, 6))
        assertEquals("10:00", m.sinBinPill(at(t0, 6), team = false))
    }

    // EVT-12: a downloaded match's sin bins, off and 10 minutes from a server that sends neither; Same as last carries both.
    @Test fun sinBinsFromTheDownload() {
        val old = setupOf(buildJsonObject { put("id", JsonPrimitive("m1")) })
        assertFalse(old.sinBins)
        assertEquals(600, old.sinBinSec)
        val on = setupOf(buildJsonObject {
            put("sinBins", JsonPrimitive(true)); put("sinBinSec", JsonPrimitive(300))
        })
        assertTrue(on.sinBins)
        assertEquals(300, on.sinBinSec)
        assertEquals(on.sinBins to on.sinBinSec, on.copy(home = "STR").format().let { it.sinBins to it.sinBinSec })
        assertFalse(on.sameFormat(on.copy(sinBinSec = 600)))
    }

    // TMR-13: the events list's words for a suspension and its end.
    @Test fun suspendedAndResumedInWords() {
        assertEquals("Suspended, lightning", suspensionWords(MatchEvent(EVENT_SUSPENDED, -1, 0, 1200, null, LIGHTNING)))
        assertEquals("Suspended, crowd trouble", suspensionWords(MatchEvent(EVENT_SUSPENDED, -1, 0, 1200, null, 2)))
        assertEquals("Resumed after 30:00", suspensionWords(MatchEvent(EVENT_RESUMED, -1, 0, 1200, null, 1800)))
        assertNull(suspensionWords(MatchEvent(EVENT_GOAL, HOME, 0, 1200, 9)))
    }

    // INP-3: the game menu's rows spell the period out.
    @Test fun periodNames() {
        assertEquals("first half", periodName(0, 2))
        assertEquals("second half", periodName(1, 2))
        assertEquals("third quarter", periodName(2, 4))
        assertEquals("third period", periodName(2, 3))
        assertEquals("extra time 1", periodName(2, 2))
        assertEquals("extra time 2", periodName(3, 2))
        assertEquals("extra time", periodName(2, 2, etPeriods = 1))
    }

    // TMR-15: a downloaded match's clock, stoppage tracking going with it, and the format Same as last keeps.
    @Test fun stoppingClockFromTheServer() {
        val runsOn = setupOf(buildJsonObject { put("id", JsonPrimitive("m1")) })
        assertFalse(runsOn.stoppingClock)
        assertTrue(runsOn.stopForGoalsCards)
        assertFalse(runsOn.tracked)
        val stops = setupOf(buildJsonObject { put("stoppingClock", JsonPrimitive(true)); put("stopForGoalsCards", JsonPrimitive(false)) })
        assertTrue(stops.tracked)
        assertTrue(stops.copy(home = "STR").format().stoppingClock)
        assertFalse(stops.copy(home = "STR").format().stopForGoalsCards)
        assertFalse(stops.sameFormat(runsOn))
    }
}
