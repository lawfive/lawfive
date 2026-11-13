package app.lawfive

import app.lawfive.data.json
import app.lawfive.schema.ChangeMatchRecords
import app.lawfive.schema.ChangeMatches
import app.lawfive.schema.ChangeSettings
import app.lawfive.schema.ChangeUnknown
import app.lawfive.schema.ChangesPage
import app.lawfive.schema.MatchTrack
import app.lawfive.schema.MatchWeather
import app.lawfive.schema.PitchOutline
import app.lawfive.schema.Stats
import app.lawfive.schema.TrackSummary
import app.lawfive.ui.screens.Heat
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The shared sample data for the snapshot tests (schema/generated/fixtures, mobile/android/README.md#snapshot-tests)
// reads with the app's own models and JSON settings, as the API's answers do, so a screen drawn from it
// is drawn from what the phone would have.
class FixturesTest {
    private fun text(path: String): String =
        requireNotNull(javaClass.getResource("/$path")) { "no fixture $path (schema/generated/fixtures)" }.readText()

    private fun obj(path: String): JsonObject = json.parseToJsonElement(text(path)).jsonObject

    private val index = obj("index.json")

    @Test
    fun `every change in both accounts is a record the app knows`() {
        for (account in listOf("demo", "new-account")) {
            val page = json.decodeFromString(ChangesPage.serializer(), text("$account/changes.json"))
            assertFalse("$account: more pages", page.more)
            assertTrue("$account: a change the app doesn't know", page.changes.none { it is ChangeUnknown })
            // A record changed after it was made (the demo's next match, moved once its watch had it,
            // SYNC-14) is one change with a later number, so the cursor can pass the count.
            assertTrue("$account: the cursor", page.cursor >= page.changes.size.toLong())
        }
        val demo = json.decodeFromString(ChangesPage.serializer(), text("demo/changes.json"))
        assertEquals(22, demo.changes.count { it is ChangeMatches })
        assertEquals(1, demo.changes.count { it is ChangeSettings })
        assertTrue(json.decodeFromString(ChangesPage.serializer(), text("new-account/changes.json")).changes.isEmpty())
    }

    @Test
    fun `the matches index json names are in the demo, and the track's record is the track's match's`() {
        val demo = json.decodeFromString(ChangesPage.serializer(), text("demo/changes.json"))
        val matches = demo.changes.filterIsInstance<ChangeMatches>().associateBy { it.record.id }
        val ids = index["demo"]!!.jsonObject
        for ((name, id) in ids["matches"]!!.jsonObject) {
            assertNotNull("$name ($id)", matches[id.jsonPrimitive.content])
        }
        val record = demo.changes.filterIsInstance<ChangeMatchRecords>().single { it.record.id == ids["trackRecord"]!!.jsonPrimitive.content }
        assertEquals(ids["matches"]!!.jsonObject["withTrack"]!!.jsonPrimitive.content, record.record.matchId)
        assertEquals("2026-11-09T16:00:00.000Z", index["now"]!!.jsonPrimitive.content)
        assertEquals("America/Los_Angeles", index["timeZone"]!!.jsonPrimitive.content)
    }

    @Test
    fun `stats, weather and the track read as the screens read them`() {
        for (account in listOf("demo", "new-account")) {
            json.decodeFromString(Stats.serializer(), text("$account/stats.json"))
            json.decodeFromJsonElement(ListSerializer(MatchWeather.serializer()), obj("$account/weather.json")["items"]!!)
        }
        assertEquals(12, json.decodeFromJsonElement(ListSerializer(MatchWeather.serializer()), obj("demo/weather.json")["items"]!!).size)
        // As MatchScreen and the track's section read GET /v1/match-records/{id}/track.
        val track = obj("demo/track.json")
        json.decodeFromJsonElement(MatchTrack.serializer(), track["track"]!!)
        json.decodeFromJsonElement(TrackSummary.serializer(), track["summary"]!!)
        json.decodeFromJsonElement(PitchOutline.serializer(), track["pitch"]!!)
        val heat = json.decodeFromJsonElement(Heat.serializer(), track["heat"]!!)
        assertEquals(heat.cols * heat.rows, heat.total.size)
    }
}
