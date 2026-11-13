package app.lawfive

import app.lawfive.data.ScreenSetup
import app.lawfive.data.tryMatchUrl
import app.lawfive.data.tryWatchFor
import app.lawfive.ui.screens.screenLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// DEMO-9: Try a match's address, the same cases as the website's (schema/test/screen.test.ts). SYNC-15: the
// match screen in a line, as the website's.

class TryMatchTest {
    private val oneClock = ScreenSetup(clocks = "one", mainClock = "up", secondClock = "down", breakClock = "down", edge = "none", names = true)

    @Test fun addressCarriesTheWatchAndTheMatchScreen() {
        assertEquals(
            "https://lawfive.app/try?watch=wearos&clocks=one&mainClock=up&secondClock=down&breakClock=down&edge=none&names=true&teamSwipes=sideways",
            tryMatchUrl("wearos", oneClock, "sideways"),
        )
    }

    @Test fun secondClockIsNeverTheMatchClock() {
        val url = tryMatchUrl("garmin", oneClock.copy(mainClock = "down", secondClock = "down"))
        assertTrue(url, url.contains("&mainClock=down&secondClock=upEach&"))
        assertTrue(url, !url.contains("teamSwipes"))
    }

    @Test fun linkedWatchIsShownAsItsKindAVenuAsTheVenu() {
        assertEquals("apple", tryWatchFor("lawfive-applewatch"))
        assertEquals("wearos", tryWatchFor("wearos", "Galaxy Watch4"))
        assertEquals("wearos", tryWatchFor("lawfive-wear", "Galaxy Watch4"))
        assertEquals("venu", tryWatchFor("lawfive-garmin", "Garmin Venu 2"))
        assertEquals("garmin", tryWatchFor("garmin", "Garmin Forerunner 965"))
        assertEquals("garmin", tryWatchFor(null))
    }

    @Test fun matchScreenInALine() {
        assertEquals("Two clocks stacked, the time of day, names", screenLine(ScreenSetup.DEFAULT))
        assertEquals("One clock, scores only", screenLine(oneClock.copy(names = false)))
        assertEquals("Two clocks side by side, the ring, names", screenLine(oneClock.copy(clocks = "sideBySide", edge = "ring")))
    }
}
