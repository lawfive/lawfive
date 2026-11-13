package app.lawfive

import app.lawfive.schema.MatchNotice
import app.lawfive.schema.MatchNoticeMatchesItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// NOTE-3: a notice of what an integration did, in words; one match says what happened to it,
// several say how many with a line each.
class NoticesTest {
    private val time = KickoffFormat { iso, _ -> mapOf("2026-11-07T17:00:00Z" to "Sat, Nov 7, 9:00 AM", "2026-11-07T19:30:00Z" to "Sat, Nov 7, 11:30 AM")[iso] }
    private fun item(vararg changes: String, kickoff: String? = "2026-11-07T17:00:00Z", previousKickoff: String? = null, venue: String? = "Twin Creeks, Field 3", previousVenue: String? = null, title: String = "Strikers v Rovers") =
        MatchNoticeMatchesItem(matchId = "m-$title", changes = changes.toList(), title = title, kickoff = kickoff, previousKickoff = previousKickoff, venue = venue, previousVenue = previousVenue)
    private fun notice(vararg items: MatchNoticeMatchesItem) = MatchNotice(id = "n1", source = "RefSync", createdAt = "2026-11-02T12:00:00Z", matches = items.toList())

    @Test
    fun `one match says what happened, when and where`() {
        val added = noticeWords(notice(item("added")), time)!!
        assertEquals("New match: Strikers v Rovers", added.title)
        assertEquals("Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3", added.text)
        assertEquals("m-Strikers v Rovers", added.matchId)
        assertEquals("Canceled: Strikers v Rovers", noticeWords(notice(item("canceled")), time)!!.title)
        assertEquals("Was Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3", noticeWords(notice(item("postponed")), time)!!.text)
        assertEquals("Back on: Strikers v Rovers", noticeWords(notice(item("backOn", "kickoff")), time)!!.title)
    }

    @Test
    fun `a move says what it is now and was, with Directions for a new venue`() {
        val moved = noticeWords(notice(item("kickoff", kickoff = "2026-11-07T19:30:00Z", previousKickoff = "2026-11-07T17:00:00Z")), time)!!
        assertEquals("Kickoff moved: Strikers v Rovers", moved.title)
        assertEquals("Now Sat, Nov 7, 11:30 AM · was Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3", moved.text)
        assertEquals(false, moved.directions)
        val elsewhere = noticeWords(notice(item("venue", venue = "Ortega Park", previousVenue = "Twin Creeks")), time)!!
        assertEquals("Venue changed: Strikers v Rovers", elsewhere.title)
        assertEquals("Now at Ortega Park · was Twin Creeks · Sat, Nov 7, 9:00 AM", elsewhere.text)
        assertEquals(true, elsewhere.directions)
        val both = noticeWords(notice(item("kickoff", "venue", kickoff = "2026-11-07T19:30:00Z", previousKickoff = "2026-11-07T17:00:00Z", venue = "Ortega Park", previousVenue = "Twin Creeks")), time)!!
        assertEquals("Kickoff and venue changed: Strikers v Rovers", both.title)
        assertEquals("Now Sat, Nov 7, 11:30 AM at Ortega Park · was Sat, Nov 7, 9:00 AM at Twin Creeks", both.text)
    }

    @Test
    fun `a removed match opens the list, as it's gone`() {
        val removed = noticeWords(notice(item("removed")), time)!!
        assertEquals("Removed: Strikers v Rovers", removed.title)
        assertNull(removed.matchId)
        assertEquals(false, removed.directions)
    }

    @Test
    fun `several say how many, with a line each, and open the list`() {
        val added = noticeWords(notice(item("added"), item("added", title = "Cobras v Rovers"), item("added", title = "Thunder v Galaxy")), time)!!
        assertEquals("RefSync added 3 matches", added.title)
        assertEquals("Strikers v Rovers, Sat, Nov 7, 9:00 AM, and 2 more", added.text)
        assertEquals(listOf("Strikers v Rovers, Sat, Nov 7, 9:00 AM", "Cobras v Rovers, Sat, Nov 7, 9:00 AM", "Thunder v Galaxy, Sat, Nov 7, 9:00 AM"), added.lines)
        assertNull(added.matchId)
        val mixed = noticeWords(notice(item("canceled"), item("added", title = "Cobras v Rovers")), time)!!
        assertEquals("RefSync changed 2 matches", mixed.title)
        assertEquals("Canceled: Strikers v Rovers, Sat, Nov 7, 9:00 AM", mixed.lines.first())
        assertNull(noticeWords(notice(), time))
    }
}
