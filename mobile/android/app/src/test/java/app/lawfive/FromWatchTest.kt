package app.lawfive

import app.lawfive.data.FromWatch
import app.lawfive.data.SyncActivity
import app.lawfive.schema.Event
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchRecordScore
import app.lawfive.schema.OffenderPlayer
import app.lawfive.ui.screens.goalsAndCards
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// APP-26: which matches a sync brought from a watch, how they're counted, and that they wait on the
// phone until the summary is closed.

class FromWatchTest {
    private fun report(vararg fields: Pair<String, Any?>) = JsonObject(
        mapOf<String, kotlinx.serialization.json.JsonElement>("id" to JsonPrimitive("r1")) +
            fields.associate { (k, v) -> k to if (v == null) JsonNull else JsonPrimitive(v.toString()) },
    )

    private fun arrived(record: JsonObject, collection: String = "match-records", first: Boolean = false, had: Boolean = false) =
        runBlocking { FromWatch.arrived(collection, record, first) { had } }

    @Test
    fun `a new match report recorded on a watch is one`() {
        assertTrue(arrived(report("device" to "garmin:venu2")))
    }

    @Test
    fun `not on the first sync after signing in`() {
        assertFalse(arrived(report("device" to "garmin:venu2"), first = true))
    }

    @Test
    fun `not one the phone already had (a correction, or a watch sending it again)`() {
        assertFalse(arrived(report("device" to "garmin:venu2"), had = true))
    }

    @Test
    fun `not a result entered without a watch`() {
        assertFalse(arrived(report()))
        assertFalse(arrived(report("device" to null)))
        assertFalse(arrived(report("device" to "")))
    }

    @Test
    fun `not a deleted one, nor another kind of record`() {
        assertFalse(arrived(report("device" to "garmin:venu2", "deletedAt" to "2026-11-06T10:00:00Z")))
        assertFalse(arrived(report("device" to "garmin:venu2"), collection = "matches"))
    }

    @Test
    fun `the phone isn't asked about one that can't count`() {
        var asked = false
        runBlocking { FromWatch.arrived("match-records", report(), first = false) { asked = true; false } }
        assertFalse(asked)
    }

    private fun record(home: Long, away: Long, events: List<Event>) = MatchRecord(
        id = "r1", version = 1, updatedAt = "2026-11-06T10:00:00Z", outcome = "fullTime", periods = emptyList(),
        score = MatchRecordScore(home, away), events = events,
    )

    private fun caution() = EventCaution(`when` = "play", team = "home", offender = OffenderPlayer(number = 4))
    private fun second() = EventSecondCaution(`when` = "play", team = "away", offender = OffenderPlayer(number = 9))
    private fun sendOff() = EventSendOff(`when` = "play", team = "home", offender = OffenderPlayer(number = 2))

    @Test
    fun `goals and cards in words`() {
        assertEquals("4 goals · 2 cautions · 1 send-off", goalsAndCards(record(3, 1, listOf(caution(), caution(), sendOff()))))
        assertEquals("1 goal · 1 caution", goalsAndCards(record(1, 0, listOf(EventGoal(`when` = "play", team = "home"), caution()))))
        assertEquals("2 send-offs", goalsAndCards(record(0, 0, listOf(sendOff(), sendOff()))))
        assertEquals("No goals or cards", goalsAndCards(record(0, 0, emptyList())))
    }

    @Test
    fun `a second caution counts as a caution and a send-off, as Stats does`() {
        assertEquals("2 cautions · 1 send-off", goalsAndCards(record(0, 0, listOf(caution(), second()))))
    }

    @Test
    fun `a second sin bin counts as a sin bin and a send-off, as Stats does (EVT-12)`() {
        val sinBin = EventSinBin(`when` = "play", team = "away", offender = OffenderPlayer(number = 7), lengthSec = 600)
        val second = EventSecondSinBin(`when` = "play", team = "away", offender = OffenderPlayer(number = 7), lengthSec = 600)
        assertEquals("1 caution · 1 send-off · 2 sin bins", goalsAndCards(record(0, 0, listOf(caution(), sinBin, second))))
    }

    @Test
    fun `they wait on the phone until closed`() = runBlocking {
        val file = File.createTempFile("from-watch", ".json").also { it.delete() }
        try {
            val store = FromWatch(file)
            store.add(listOf("a", "b"))
            store.add(listOf("b", "c"))
            assertEquals(listOf("a", "b", "c"), store.waiting.value)
            // The app closed and opened again.
            assertEquals(listOf("a", "b", "c"), FromWatch(file).waiting.value)
            store.clear()
            assertTrue(store.waiting.value.isEmpty())
            assertTrue(FromWatch(file).waiting.value.isEmpty())
        } finally {
            file.delete()
        }
    }

    @Test
    fun `the sync screen hands over to the summary instead of All synced`() {
        var now = 1_000_000L
        val activity = SyncActivity { now }
        var waiting = true
        activity.handOver = { waiting }
        activity.watchMatch(5, "United v Strikers", sent = true)
        assertTrue(activity.state.value.busy)
        now += SyncActivity.QUIET_MS
        activity.tick()
        assertFalse(activity.state.value.show)
        assertFalse(activity.state.value.busy)
        // Nothing waiting: All synced, as before.
        waiting = false
        activity.watchMatch(6, "Rovers v City", sent = true)
        now += SyncActivity.QUIET_MS
        activity.tick()
        assertTrue(activity.state.value.finished)
        assertTrue(activity.state.value.show)
    }
}
