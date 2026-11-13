package app.lawfive

import app.lawfive.data.Records
import app.lawfive.data.json
import app.lawfive.schema.UserSettings
import app.lawfive.ui.screens.kickoffSpoken
import app.lawfive.ui.screens.nextMatchFolded
import app.lawfive.ui.screens.stripCountdown
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration

// WEB-27: the next match folds to a strip, kept with the account's settings; open when not set.
class NextMatchFoldTest {
    private val settings = UserSettings(id = "s1", version = 3, updatedAt = "2026-11-08T00:00:00Z", misconductScheme = "ifab", currency = "USD", distanceUnit = "mi", temperatureUnit = "f")

    @Test
    fun openUntilChosen() {
        assertFalse(nextMatchFolded(null))
        assertFalse(nextMatchFolded(settings))
        assertTrue(nextMatchFolded(settings.copy(nextMatchCollapsed = true)))
        assertFalse(nextMatchFolded(settings.copy(nextMatchCollapsed = false)))
    }

    @Test
    fun savedWithTheOtherSettings() {
        // Saved as Settings saves: the choice over the stored record, keeping what this app doesn't know.
        val raw = json.parseToJsonElement("""{"id":"s1","version":3,"updatedAt":"2026-11-08T00:00:00Z","misconductScheme":"ifab","currency":"USD","distanceUnit":"mi","temperatureUnit":"f","futureField":"kept"}""").jsonObject
        val saved = Records.patched(raw, UserSettings.serializer(), settings.copy(nextMatchCollapsed = true))
        assertEquals(JsonPrimitive(true), saved["nextMatchCollapsed"])
        assertEquals(JsonPrimitive("kept"), saved["futureField"])
        assertEquals(JsonPrimitive("mi"), saved["distanceUnit"])
        assertTrue(nextMatchFolded(json.decodeFromJsonElement(UserSettings.serializer(), saved)))
    }

    @Test
    fun theStripsCountdownAsTheWebsites() {
        val left = Duration.ofDays(1).plusHours(23).plusMinutes(8)
        assertEquals(listOf("1" to "D", "23" to "H", "08" to "M"), stripCountdown(left))
        assertEquals(listOf("3" to "H", "05" to "M"), stripCountdown(Duration.ofHours(3).plusMinutes(5)))
        assertEquals(listOf("2" to "D", "00" to "H", "07" to "M"), stripCountdown(Duration.ofDays(2).plusMinutes(7)))
        assertEquals(listOf("45" to "M"), stripCountdown(Duration.ofMinutes(45)))
        assertEquals(emptyList<Pair<String, String>>(), stripCountdown(Duration.ZERO))
    }

    @Test
    fun theCountdownSpoken() {
        assertEquals("Kickoff in 1 day 23 hrs 8 min", kickoffSpoken(Duration.ofDays(1).plusHours(23).plusMinutes(8)))
        assertEquals("Kickoff in 2 days 1 hr 0 min", kickoffSpoken(Duration.ofDays(2).plusHours(1)))
        assertEquals("Kickoff in 0 min", kickoffSpoken(Duration.ZERO))
    }
}
