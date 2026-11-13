package app.lawfive

import app.lawfive.data.MatchMoment
import app.lawfive.data.ScreenSetup
import app.lawfive.data.breakClockText
import app.lawfive.data.clockText
import app.lawfive.data.momentLabel
import app.lawfive.data.playAt
import app.lawfive.schema.WatchScreen
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

// UI-27: what's particular to the setup's pictures (the clocks are checked by the shared screen cases,
// MatchCasesTest). UI-21, UI-24: setups saved before the choices.

class WatchPreviewTest {
    private fun at(m: Int, s: Int = 0) = (m * 60 + s) * 1000L
    private fun running(elapsedMs: Long, period: Int = 0) = MatchMoment(period = period, elapsedMs = elapsedMs)

    // What's particular to the pictures; the clocks themselves are checked by the shared screen cases (MatchCasesTest).
    @Test fun breakClockText() {
        assertEquals("1:30", breakClockText("down", at(1, 30), at(2)))
        assertEquals("0:30", breakClockText("up", at(1, 30), at(2)))
        assertEquals("0:00", clockText("down", 0, at(47, 5)))
    }

    @Test fun playThrough() {
        assertEquals(at(21, 30), playAt(0f).breakDueInMs)
        assertEquals(true, playAt(0.5f).halftime)
        assertEquals(1, playAt(1f).period)
        assertEquals(at(3, 30), playAt(1f).stoppageMs)
        assertEquals("1H 23:12", momentLabel(running(at(23, 12))))
        assertEquals("2H 90:00 +1:12", momentLabel(running(at(46, 12), 1)))
        assertEquals("Half-time 3:00", momentLabel(MatchMoment(halftime = true, elapsedMs = at(3))))
    }

    @Test fun defaultScreen() {
        assertEquals(ScreenSetup("stacked", "down", "up", "down", "time", true), ScreenSetup.of(null))
    }

    @Test fun oldSetups() {
        val ring = ScreenSetup.of(WatchScreen(layout = "ring", secondClock = "down", changedAt = "2026-11-03T12:00:00Z"))
        assertEquals(ScreenSetup(edge = "ring"), ring)
        assertFalse(ScreenSetup.of(WatchScreen(layout = "minimal", secondClock = "down", changedAt = "2026-11-03T12:00:00Z")).names)
        assertEquals(ScreenSetup(), ScreenSetup.of(WatchScreen(layout = "scoreboard", secondClock = "down", changedAt = "2026-11-03T12:00:00Z")))
        val saved = ScreenSetup(clocks = "sideBySide", mainClock = "down", secondClock = "down", edge = "ring").saved("2026-11-03T12:00:00Z")
        assertEquals("sideBySide", saved.layout)
        assertEquals("upEach", saved.secondClock)
        assertEquals("minimal", ScreenSetup(names = false, edge = "ring").nearestLayout)
    }
}
