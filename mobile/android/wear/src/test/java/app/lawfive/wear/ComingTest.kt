package app.lawfive.wear

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// SYNC-16: canceled and postponed matches in Matches until their kickoff, never counted or offered as coming up.

class ComingTest {
    private val now = 1_780_000_000L

    private fun match(id: String, kickoff: Long?, status: String? = null) = JsonObject(buildMap {
        put("id", JsonPrimitive(id))
        put("home", JsonPrimitive("STR")); put("away", JsonPrimitive("ROV"))
        kickoff?.let { put("kickoff", JsonPrimitive(it)) }
        status?.let { put("status", JsonPrimitive(it)) }
    })

    private fun ids(list: List<JsonObject>) = list.map { it.str("id") }

    @Test fun theWatchAsksForCanceledMatches() {
        assertTrue(MATCHES_PATH.startsWith("/v1/watch/matches?"))
        assertTrue(MATCHES_PATH.contains("canceled=true"))
        assertTrue(MATCHES_PATH.contains("limit=10"))
    }

    @Test fun aCanceledMatchIsListedUntilItsKickoff() {
        val matches = listOf(
            match("started", now - 3600),
            match("canceled", now + 1800, "cancelled"),
            match("next", now + 3600),
            match("postponed", now + 7200, "postponed"),
        )
        assertEquals(listOf("started", "canceled", "next", "postponed"), ids(listed(matches, now)))
        // Its kickoff passed without a sync: it goes, while a scheduled one keeps today's rules (the server's three hours).
        assertEquals(listOf("started", "next", "postponed"), ids(listed(matches, now + 1800)))
        assertEquals(listOf("started", "next"), ids(listed(matches, now + 7201)))
    }

    @Test fun aPastOrUndatedCanceledMatchIsDropped() {
        val matches = listOf(match("past", now - 60, "cancelled"), match("undated", null, "postponed"), match("next", now + 3600))
        assertEquals(listOf("next"), ids(listed(matches, now)))
    }

    @Test fun onlyScheduledMatchesAreComingUp() {
        val matches = listOf(match("canceled", now + 1800, "cancelled"), match("postponed", now + 2400, "postponed"), match("next", now + 3600))
        // The start menu's next match is the soonest scheduled one.
        assertEquals("next", coming(matches).firstOrNull()?.str("id"))
        assertTrue(coming(matches.take(2)).isEmpty())
    }

    @Test fun eachSaysWhatHappened() {
        assertEquals("Canceled", offLabel(match("a", now, "cancelled")))
        assertEquals("Postponed", offLabel(match("b", now, "postponed")))
        assertNull(offLabel(match("c", now)))
        assertEquals("This match was canceled", offDetail(match("a", now, "cancelled")))
        assertEquals("This match was postponed", offDetail(match("b", now, "postponed")))
        assertNull(offDetail(match("c", now)))
    }
}
