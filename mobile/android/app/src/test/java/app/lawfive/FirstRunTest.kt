package app.lawfive

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.lawfive.data.Devices
import app.lawfive.data.Session
import app.lawfive.data.SettingsDefaults
import app.lawfive.schema.Match
import app.lawfive.schema.Team
import app.lawfive.ui.screens.defaultFormat
import app.lawfive.ui.screens.isBlankMatch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.util.Locale

// A new account on the phone: its settings before it has any (APP-4, as the website's), the first
// sync after signing in told apart by its own flag (APP-16, APP-26), the empty match form (WEB-30),
// and which devices are watches.

class FirstRunTest {
    @Test
    fun `defaults follow the phone's region, as the website's do`() {
        val us = SettingsDefaults.forLocale(Locale.US)
        assertEquals(listOf("mi", "f", "USD", "ussf"), listOf(us.distanceUnit, us.temperatureUnit, us.currency, us.misconductScheme))
        val uk = SettingsDefaults.forLocale(Locale.UK)
        assertEquals(listOf("km", "c", "GBP", "fa"), listOf(uk.distanceUnit, uk.temperatureUnit, uk.currency, uk.misconductScheme))
        val de = SettingsDefaults.forLocale(Locale.GERMANY)
        assertEquals(listOf("km", "c", "EUR", "ifab"), listOf(de.distanceUnit, de.temperatureUnit, de.currency, de.misconductScheme))
        val ca = SettingsDefaults.forLocale(Locale.CANADA_FRENCH)
        assertEquals(listOf("km", "c", "CAD", "ifab"), listOf(ca.distanceUnit, ca.temperatureUnit, ca.currency, ca.misconductScheme))
        assertEquals("JPY", SettingsDefaults.forLocale(Locale.JAPAN).currency)
        // A language without a region, and one with no currency of its own here: US, and dollars.
        assertEquals("mi", SettingsDefaults.forLocale(Locale.ENGLISH).distanceUnit)
        assertEquals("USD", SettingsDefaults.forLocale(Locale.Builder().setLanguage("is").setRegion("AQ").build()).currency)
        assertNull(us.timeZone)
    }

    @Test
    fun `the first change makes the record from the defaults with the phone's time zone, later ones change it`() {
        val defaults = SettingsDefaults.forLocale(Locale.US, id = "s1")
        val first = SettingsDefaults.toSave(null, defaults, "America/Los_Angeles") { it.copy(distanceUnit = "km") }
        assertEquals("s1", first.id)
        assertEquals("km", first.distanceUnit)
        assertEquals("f", first.temperatureUnit)
        assertEquals("America/Los_Angeles", first.timeZone)
        val second = SettingsDefaults.toSave(first.copy(version = 1), defaults, "Europe/London") { it.copy(teamSwipes = "sideways") }
        assertEquals("s1", second.id)
        assertEquals(1L, second.version)
        assertEquals("km", second.distanceUnit)
        assertEquals("sideways", second.teamSwipes)
        // The account's own zone isn't changed by a phone elsewhere.
        assertEquals("America/Los_Angeles", second.timeZone)
    }

    @Test
    fun `the first sync after signing in is its own flag, not an empty cursor`() = runBlocking {
        val dir = Files.createTempDirectory("session").toFile()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val store = PreferenceDataStoreFactory.create(scope = scope) { File(dir, "session.preferences_pb") }
            val session = Session(store, scope)
            // Signed in on an older version: never the first.
            assertFalse(session.current.firstSync)
            session.signedIn("https://lawfive.example.com", "token", "u1", "Sam", "sam@example.com", "active")
            withTimeout(5000) { session.state.first { it.firstSync } }
            // An empty account's first sync leaves the cursor where it was; it's still the first until it finishes.
            session.synced(0, 1000)
            assertTrue(withTimeout(5000) { session.state.first { it.lastSync == 1000L } }.firstSync)
            session.firstSyncDone()
            assertEquals(0L, withTimeout(5000) { session.state.first { !it.firstSync } }.cursor)
            session.signedIn("https://lawfive.example.com", "token", "u1", "Sam", "sam@example.com", "active")
            withTimeout(5000) { session.state.first { it.firstSync } }
            session.signedOut()
            assertFalse(withTimeout(5000) { session.state.first { it.token == null } }.firstSync)
        } finally {
            scope.cancel()
            dir.deleteRecursively()
        }
    }

    private fun match(home: String? = null, away: String? = null, kickoff: String? = null) = Match(
        id = "m1", version = 0, updatedAt = "2026-11-09T00:00:00Z", status = "scheduled", format = defaultFormat,
        home = Team(name = home), away = Team(name = away), crew = emptyList(), kickoff = kickoff,
    )

    @Test
    fun `a match needs a team or a kickoff`() {
        assertTrue(isBlankMatch(match()))
        assertTrue(isBlankMatch(match(home = "  ")))
        assertFalse(isBlankMatch(match(home = "Strikers U12")))
        assertFalse(isBlankMatch(match(away = "Rovers U12")))
        assertFalse(isBlankMatch(match(kickoff = "2026-11-14T17:00:00Z")))
    }

    @Test
    fun `watches are Garmin, Wear OS and Apple Watch, not phones or browsers`() {
        assertFalse(Devices.anyWatch(listOf("browser", "android", "ios", null)))
        assertTrue(Devices.anyWatch(listOf("browser", "wearos")))
        assertTrue(Devices.anyWatch(listOf("garmin")))
        assertTrue(Devices.anyWatch(listOf("applewatch")))
    }
}
