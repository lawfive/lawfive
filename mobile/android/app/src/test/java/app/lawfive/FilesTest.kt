package app.lawfive

import app.lawfive.data.KEEP_BUDGET
import app.lawfive.data.Refused
import app.lawfive.data.WantedFile
import app.lawfive.data.describeFile
import app.lawfive.data.fileSize
import app.lawfive.data.keepsEnding
import app.lawfive.data.keepsFilesFor
import app.lawfive.data.opensInApp
import app.lawfive.data.planKeeping
import app.lawfive.data.refusedTitle
import app.lawfive.data.splitName
import app.lawfive.data.takenLine
import app.lawfive.data.textPreview
import app.lawfive.data.withoutTaken
import app.lawfive.schema.Attachment
import app.lawfive.schema.Match
import app.lawfive.schema.Team
import app.lawfive.ui.screens.defaultFormat
import app.lawfive.ui.screens.describeDates
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Files on records (FILE-6 to FILE-13), in the website's words (web/test/files.test.ts), and which
// are kept on the phone for the next 3 days' matches.
class FilesTest {
    private fun file(id: String, type: String = "application/pdf", size: Long = 1000, name: String? = "Map.pdf") = Attachment(
        id = id, recordType = "venue", recordId = "v1", kind = "file", contentType = type, name = name, size = size, position = 0,
        createdAt = "2026-11-01T00:00:00Z", url = "/v1/attachments/$id/file", thumbUrl = "/v1/attachments/$id/thumb", hasThumb = false,
    )

    @Test fun `a file's line is its kind and size`() {
        assertEquals("PDF · 1.2 MB", describeFile(file("a", size = (1.2 * 1024 * 1024).toLong())))
        assertEquals("Spreadsheet · 12 KB", describeFile(file("a", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 12 * 1024)))
        assertEquals("CSV · 317 bytes", describeFile(file("a", "text/csv", 317)))
        assertEquals("Word · 1 KB", describeFile(file("a", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1100)))
        assertEquals("Photo · 120 MB", describeFile(file("a", "image/jpeg", 120L shl 20)))
        assertEquals("Text · 1 KB", describeFile(file("a", "text/plain", 1024)))
        assertEquals("999 KB", fileSize(999 * 1024))
    }

    @Test fun `PDFs, photos, CSV and text open in the app, spreadsheets and Word documents in another`() {
        assertTrue(opensInApp(file("a")))
        assertTrue(opensInApp(file("a", "text/csv")))
        assertTrue(opensInApp(file("a", "image/webp")))
        assertFalse(opensInApp(file("a", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")))
    }

    @Test fun `a renamed file keeps its ending`() {
        assertEquals("Field map" to ".pdf", splitName("Field map.pdf"))
        assertEquals("README" to "", splitName("README"))
        assertEquals(".env" to "", splitName(".env"))
        assertEquals("It stays a PDF file", keepsEnding(".pdf"))
    }

    @Test fun `CSV and text show their first 200 lines, in UTF-8 or the older Windows encoding`() {
        val long = textPreview((1..250).joinToString("\r\n") { "line $it" }.toByteArray())
        assertEquals(200, long.lines.size)
        assertTrue(long.more)
        val short = textPreview("﻿Name,Role\nDana,Assignor\n".toByteArray())
        assertEquals(listOf("Name,Role", "Dana,Assignor"), short.lines)
        assertFalse(short.more)
        // "Café" in Windows-1252, which isn't UTF-8.
        assertEquals(listOf("Café"), textPreview(byteArrayOf(0x43, 0x61, 0x66, 0xE9.toByte())).lines)
    }

    @Test fun `what's taken is said once, after the refusals`() {
        val taken = "LawFive keeps PDF, spreadsheets (XLSX, CSV), Word documents (DOCX), text (TXT) and photos (JPEG, PNG, WebP)."
        val refused = listOf(Refused("page.html", "A web page isn't taken. $taken"), Refused("old.xls", "Older Office files aren't taken. $taken"))
        assertEquals(taken, takenLine(refused))
        assertEquals(listOf("A web page isn't taken.", "Older Office files aren't taken."), withoutTaken(refused).map { it.why })
        assertEquals("2 files weren't added.", refusedTitle(refused))
        assertEquals("page.html wasn't added.", refusedTitle(refused.take(1)))
        assertNull(takenLine(listOf(Refused("big.pdf", "big.pdf is too big: at most 20 MB."))))
    }

    private val now = Instant.parse("2026-11-09T16:00:00Z")
    private fun match(kickoff: String?, status: String = "scheduled") =
        Match(id = "m$kickoff", version = 1, updatedAt = "2026-11-01T00:00:00Z", status = status, format = defaultFormat, home = Team(), away = Team(), crew = emptyList(), kickoff = kickoff)

    @Test fun `files are kept for matches in the next 3 days, until they're over`() {
        assertTrue(keepsFilesFor(match("2026-11-11T17:00:00Z"), now))
        assertTrue(keepsFilesFor(match("2026-11-12T16:00:00Z"), now))
        assertFalse(keepsFilesFor(match("2026-11-12T16:00:01Z"), now))
        // Under way, and an hour after; then over.
        assertTrue(keepsFilesFor(match("2026-11-09T15:00:00Z"), now))
        assertFalse(keepsFilesFor(match("2026-11-09T12:59:00Z"), now))
        assertTrue(keepsFilesFor(match("2026-11-10T16:00:00Z", "postponed"), now))
        assertFalse(keepsFilesFor(match("2026-11-10T16:00:00Z", "cancelled"), now))
        assertFalse(keepsFilesFor(match(null), now))
    }

    @Test fun `in at most 200 MB, with those kept on purpose first, then the soonest match's`() {
        val mb = 1L shl 20
        val soon = Instant.parse("2026-11-10T16:00:00Z")
        val later = Instant.parse("2026-11-12T16:00:00Z")
        val pinned = file("pinned", size = 50 * mb)
        val forSoon = file("soon", size = 100 * mb)
        val forLater = file("later", size = 100 * mb)
        val shared = file("shared", size = 10 * mb)
        val plan = planKeeping(listOf(pinned), listOf(WantedFile(forSoon, soon), WantedFile(forLater, later), WantedFile(shared, soon), WantedFile(shared, later)))
        // The soon match's two, then the later one's doesn't fit.
        assertEquals(listOf("pinned", "soon", "shared"), plan.map { it.id })
        assertTrue(plan.sumOf { it.size } <= KEEP_BUDGET)
        assertEquals(listOf("pinned", "soon"), planKeeping(listOf(pinned), listOf(WantedFile(forSoon, soon))).map { it.id })
    }

    @Test fun `a competition's dates, as the website says them`() {
        assertEquals("Sep 5 – Dec 12, 2026", describeDates("2026-09-05", "2026-12-12"))
        assertEquals("Nov 14 – 15, 2026", describeDates("2026-11-14", "2026-11-15"))
        assertEquals("Aug 29, 2026 – May 30, 2027", describeDates("2026-08-29", "2027-05-30"))
        assertEquals("From Sep 5, 2026", describeDates("2026-09-05", null))
        assertNull(describeDates(null, null))
    }
}
