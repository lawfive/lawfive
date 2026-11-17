package app.lawfive.wear

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// WCH-13: the app syncs on opening when it starts or comes back after five minutes away, never mid-match, and not
// with Sync on opening off.
class OpeningTest {
    @Test fun startingSyncs() {
        assertTrue(Opening.syncs(first = true, awayMs = null, syncOnOpening = true, matchInProgress = false))
    }

    @Test fun aGlanceDoesNotSync() {
        assertFalse(Opening.syncs(first = false, awayMs = 20_000, syncOnOpening = true, matchInProgress = false))
        assertFalse(Opening.syncs(first = false, awayMs = 299_999, syncOnOpening = true, matchInProgress = false))
    }

    @Test fun fiveMinutesAwaySyncs() {
        assertTrue(Opening.syncs(first = false, awayMs = 300_000, syncOnOpening = true, matchInProgress = false))
        assertTrue(Opening.syncs(first = false, awayMs = 3 * 3_600_000L, syncOnOpening = true, matchInProgress = false))
    }

    @Test fun neverMidMatch() {
        assertFalse(Opening.syncs(first = true, awayMs = null, syncOnOpening = true, matchInProgress = true))
        assertFalse(Opening.syncs(first = false, awayMs = 3_600_000, syncOnOpening = true, matchInProgress = true))
    }

    @Test fun offOnlySyncsWithSyncNow() {
        assertFalse(Opening.syncs(first = true, awayMs = null, syncOnOpening = false, matchInProgress = false))
        assertFalse(Opening.syncs(first = false, awayMs = 3_600_000, syncOnOpening = false, matchInProgress = false))
    }
}
