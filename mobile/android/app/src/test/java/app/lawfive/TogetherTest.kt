package app.lawfive

import app.lawfive.schema.Match
import app.lawfive.schema.Team
import app.lawfive.ui.Together
import app.lawfive.ui.isGame
import app.lawfive.ui.matchCounts
import app.lawfive.ui.sinceTag
import app.lawfive.ui.sprintsCaption
import app.lawfive.ui.togetherOf
import app.lawfive.ui.screens.defaultFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Locale

// WEB-28: a venue's and a referee's slab, as the website's history.ts works it out: the matches
// played with the first and last, those coming up, and the tag naming the first one's month.
class TogetherTest {
    private fun match(status: String, kickoff: String?) =
        Match(id = "m$kickoff$status", version = 1, updatedAt = "2026-11-08T00:00:00Z", status = status, format = defaultFormat, home = Team(), away = Team(), crew = emptyList(), kickoff = kickoff, timeZone = "America/Los_Angeles")

    @Test
    fun `games (played or abandoned, with a kickoff), the first and last of them, and what's coming up`() {
        val t = togetherOf(listOf(
            match("played", "2026-10-04T16:00:00Z"),
            match("played", "2026-09-12T17:00:00Z"),
            match("abandoned", "2026-11-02T18:00:00Z"),
            match("scheduled", "2026-11-14T17:00:00Z"),
            match("scheduled", null),
            match("cancelled", "2026-08-01T17:00:00Z"),
            // STAT-16: no kickoff, so not a game, as Stats counts them.
            match("played", null),
        ))
        assertEquals(3, t.played)
        assertEquals(2, t.upcoming)
        assertEquals("2026-09-12T10:00-07:00[America/Los_Angeles]", t.first.toString())
        assertEquals("2026-11-02T10:00-08:00[America/Los_Angeles]", t.last.toString())
    }

    @Test
    fun `the tag names the first match's month, in the match's own time zone, kept on one line`() {
        // 03:00 on October 1 in UTC is still September 30 in Los Angeles.
        assertEquals("Since Sep\u00A02026", sinceTag(togetherOf(listOf(match("played", "2026-10-01T03:00:00Z"))), Locale.US))
        // Before a first game, no tag: a caption with nothing to say (as the website's).
        assertNull(sinceTag(togetherOf(listOf(match("scheduled", "2026-11-14T17:00:00Z"))), Locale.US))
        assertNull(sinceTag(Together(), Locale.US))
    }

    @Test
    fun `one rule for a game, the match list's played and the venues' and referees' counts alike`() {
        assertEquals(true, isGame(match("played", "2026-10-04T16:00:00Z")))
        assertEquals(true, isGame(match("abandoned", "2026-10-04T16:00:00Z")))
        assertEquals(false, isGame(match("played", null)))
        assertEquals(false, isGame(match("cancelled", "2026-10-04T16:00:00Z")))
        val counts = matchCounts(listOf(match("played", "2026-10-04T16:00:00Z"), match("abandoned", "2026-10-05T16:00:00Z"), match("played", null), match("scheduled", "2026-11-14T17:00:00Z"))) { listOf("v1") }
        assertEquals(2, counts["v1"]!!.played)
        assertEquals(1, counts["v1"]!!.upcoming)
    }

    @Test
    fun `nothing yet`() {
        val t = togetherOf(emptyList())
        assertEquals(0, t.played)
        assertEquals(0, t.upcoming)
        assertNull(t.first)
    }

    @Test
    fun `what counts as a sprint, in the account's units`() {
        assertEquals("21 km/h or faster, 2 s or more", sprintsCaption(21.0, "km"))
        assertEquals("13 mph or faster, 2 s or more", sprintsCaption(21.0, "mi"))
    }
}
