package app.lawfive

import app.lawfive.data.SyncActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// APP-16: the sync screen comes up for big syncs only, says what's moving, and gets out of the way.

class SyncActivityTest {
    private var now = 1_000_000L
    private val activity = SyncActivity { now }

    @Test
    fun `an everyday sync stays quiet`() {
        activity.syncStarted()
        activity.pushing(0, 2, "UTD v STR")
        activity.pulled(mapOf("matches" to 3), mapOf("matches" to "UTD v STR"), first = false)
        activity.syncFinished(null)
        assertFalse(activity.state.value.show)
    }

    @Test
    fun `a watch's match and its track show as they go, then finish`() {
        activity.watchMatch(5, "United v Strikers", sent = false)
        assertTrue(activity.state.value.show)
        assertTrue(activity.state.value.fromWatch)
        assertEquals("Sending the match", activity.state.value.rows[0].detail)
        activity.watchMatch(5, "United v Strikers", sent = true)
        activity.watchTrack(5, 1, 3)
        assertEquals(1, activity.state.value.rows.size)
        assertEquals("United v Strikers", activity.state.value.rows[0].title)
        assertEquals("Track: 2 of 3", activity.state.value.rows[0].detail)
        assertFalse(activity.state.value.rows[0].done)
        // The watch sends a piece at a time: a short pause isn't the end.
        now += SyncActivity.QUIET_MS - 1
        activity.tick()
        assertFalse(activity.state.value.finished)
        activity.watchTrack(5, 2, 3)
        assertTrue(activity.state.value.rows[0].done)
        now += SyncActivity.QUIET_MS
        activity.tick()
        assertTrue(activity.state.value.finished)
        assertTrue(activity.state.value.show)
        now += SyncActivity.CLOSE_MS
        activity.tick()
        assertFalse(activity.state.value.show)
        assertTrue(activity.state.value.rows.isEmpty())
    }

    @Test
    fun `the first sync and a big one show, by kind of record`() {
        activity.syncStarted()
        activity.pulled(mapOf("matches" to 2), mapOf("matches" to "UTD v STR"), first = true)
        activity.pulled(mapOf("matches" to 3, "venues" to 1), emptyMap(), first = false)
        val rows = activity.state.value.rows
        assertTrue(activity.state.value.show)
        assertEquals("5", rows.first { it.title == "Matches" }.detail)
        assertEquals("1", rows.first { it.title == "Venues" }.detail)
    }

    @Test
    fun `hiding carries on out of sight, and the next one shows`() {
        activity.watchMatch(5, "United v Strikers", sent = false)
        activity.hide()
        activity.watchTrack(5, 0, 3)
        assertFalse(activity.state.value.show)
        assertEquals("Track: 1 of 3", activity.state.value.rows[0].detail)
        now += SyncActivity.QUIET_MS
        activity.tick()
        assertFalse(activity.state.value.show)
        activity.watchMatch(6, "Rovers v City", sent = false)
        assertTrue(activity.state.value.show)
        assertEquals(1, activity.state.value.rows.size)
    }

    @Test
    fun `a problem stays until it's closed`() {
        activity.syncStarted()
        activity.pulled(mapOf("matches" to 2), emptyMap(), first = true)
        activity.syncFinished("No connection to the server")
        assertEquals("No connection to the server", activity.state.value.problem)
        now += SyncActivity.CLOSE_MS * 10
        activity.tick()
        assertTrue(activity.state.value.show)
        activity.close()
        assertNull(activity.state.value.problem)
        assertFalse(activity.state.value.show)
    }
}
