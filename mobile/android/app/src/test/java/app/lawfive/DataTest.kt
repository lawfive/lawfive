package app.lawfive

import app.lawfive.data.Records
import app.lawfive.data.SyncEngine
import app.lawfive.data.json
import app.lawfive.schema.Event
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventUnknown
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.ui.initials
import app.lawfive.ui.teamAlias
import app.lawfive.schema.Team
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// The data layer's rules (APP-3): what a save keeps, how a conflict merges, and reading what a
// newer server sends. Uses the schema's own example files (schema/examples).

class DataTest {
    private fun example(name: String): JsonObject {
        // The tests run from app/; the examples are in the repo's schema/.
        val file = generateSequence(File("").absoluteFile) { it.parentFile }.map { File(it, "schema/examples/$name") }.first { it.exists() }
        return json.parseToJsonElement(file.readText()).jsonObject
    }

    @Test
    fun `the example records read as the generated types`() {
        val match = json.decodeFromJsonElement(Match.serializer(), example("Match.planned.json"))
        assertEquals("Strikers U12", match.home.name)
        val record = json.decodeFromJsonElement(MatchRecord.serializer(), example("MatchRecord.full-match.json"))
        assertTrue(record.events.any { it is EventGoal })
    }

    @Test
    fun `a field or event kind from a newer server doesn't stop a record being read`() {
        val newer = JsonObject(example("MatchRecord.full-match.json") + ("somethingNew" to JsonPrimitive(true)))
        val record = json.decodeFromJsonElement(MatchRecord.serializer(), newer)
        assertEquals(json.decodeFromString(Event.serializer(), """{"type":"varReview","when":"play"}"""), EventUnknown("varReview"))
        assertFalse(record.events.isEmpty())
    }

    @Test
    fun `saving keeps fields this app doesn't know`() {
        val raw = JsonObject(example("Match.planned.json") + ("fromTheFuture" to JsonPrimitive("kept")))
        val match = json.decodeFromJsonElement(Match.serializer(), raw)
        val saved = Records.patched(raw, Match.serializer(), match.copy(notes = null, ageGroup = "U13"))
        assertEquals(JsonPrimitive("kept"), saved["fromTheFuture"])
        assertEquals(JsonPrimitive("U13"), saved["ageGroup"])
        assertFalse("a field cleared on the phone is cleared", saved.containsKey("notes"))
    }

    @Test
    fun `a conflict puts the phone's changed fields on top of the newer copy`() {
        val base = JsonObject(mapOf("version" to JsonPrimitive(2), "notes" to JsonPrimitive("old"), "role" to JsonPrimitive("referee"), "ageGroup" to JsonPrimitive("U12")))
        val phone = JsonObject(base + mapOf("role" to JsonPrimitive("ar1")) - "ageGroup")
        val server = JsonObject(base + mapOf("version" to JsonPrimitive(3), "notes" to JsonPrimitive("changed on the website")))
        val merged = SyncEngine.merge(base, phone, server)
        assertEquals(JsonPrimitive("ar1"), merged["role"])
        assertEquals(JsonPrimitive("changed on the website"), merged["notes"])
        assertFalse("removed on the phone", merged.containsKey("ageGroup"))
        assertEquals(JsonPrimitive(3), merged["version"])
    }

    @Test
    fun `names and short names as the web app makes them`() {
        assertEquals("TV", initials("84-Van Der Wal, Travis (REG)"))
        assertEquals("SR", initials("Sam Rivera"))
        assertEquals("STR", teamAlias(Team(name = "Strikers U12"), Team(name = "Rovers U12"), true))
        assertEquals("AWY", teamAlias(Team(), Team(), false))
    }

    // SET-5: the shared cases (schema/short-names.json), which the server, the website and the iPhone run too.
    @Test
    fun `short names as every copy makes them`() {
        val cases = json.parseToJsonElement(app.lawfive.cases.SHORT_NAME_CASES_JSON).jsonObject["cases"]!!.jsonArray
        assertTrue(cases.size > 10)
        for (c in cases.map { it.jsonObject }) {
            fun team(side: String) = c[side]!!.jsonObject.let { Team(name = it["name"]?.jsonPrimitive?.content, alias = it["alias"]?.jsonPrimitive?.content) }
            val shown = c["shown"]!!.jsonArray.map { it.jsonPrimitive.content }
            val name = c["name"]!!.jsonPrimitive.content
            assertEquals(name, shown, listOf(teamAlias(team("home"), team("away"), true), teamAlias(team("away"), team("home"), false)))
        }
    }

    // FILE-7, as the website's.
    @Test fun storageWords() {
        val mb = 1L shl 20
        assertEquals("6 MB", app.lawfive.data.storageSize(6 * mb))
        assertEquals("5.9 MB", app.lawfive.data.storageSize((5.86 * mb).toLong()))
        assertEquals("120 MB", app.lawfive.data.storageSize(120 * mb))
        assertEquals("1.5 GB", app.lawfive.data.storageSize(1536 * mb))
        val nearly = app.lawfive.data.AccountStorage((5.86 * mb).toLong(), 6 * mb)
        assertTrue(nearly.nearlyFull)
        assertFalse(nearly.full)
        assertEquals("5.9 MB of 6 MB used", app.lawfive.data.storageUsedLine(nearly))
        assertEquals("3 photos didn't fit.", app.lawfive.data.noRoomTitle(3))
        assertEquals("You've used 5.9 MB of 6 MB. Delete some photos or tracks to make room.", app.lawfive.data.noRoomText(nearly, admin = true))
        assertTrue(app.lawfive.data.noRoomText(nearly, admin = false).endsWith("or ask an admin of this server for more."))
        assertFalse(app.lawfive.data.AccountStorage(100 * mb, null).nearlyFull)
    }

    @Test
    fun onlyLawFivesOwnAnswersCount() {
        // APP-23: Traefik's 404 while the server restarts isn't the server saying the record has gone.
        val traefik = okhttp3.Headers.headersOf("Content-Type", "text/plain; charset=utf-8")
        assertFalse(app.lawfive.data.isLawFive(traefik, null))
        assertFalse(app.lawfive.data.isLawFive(traefik, JsonPrimitive("404 page not found")))
        assertTrue(app.lawfive.data.isLawFive(okhttp3.Headers.headersOf("LawFive-Version", "2026.11.2"), null))
        // A server from before the header, known by its JSON error.
        assertTrue(app.lawfive.data.isLawFive(traefik, JsonObject(mapOf("error" to JsonPrimitive("not found")))))
    }
}
