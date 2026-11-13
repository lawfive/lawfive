package app.lawfive

import app.lawfive.data.AppClock
import app.lawfive.schema.Match
import app.lawfive.schema.MatchWeather
import app.lawfive.schema.Team
import app.lawfive.schema.WeatherRisk
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.screens.defaultFormat
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.util.Locale

// PUSH-4: when the phone asks the relay for a new handle.
class PushTest {
    private val now: Instant = Instant.parse("2026-11-01T12:00:00Z")

    @Test fun nothingNewNoNeed() {
        assertFalse(needsRegistering("t", "https://a.example", "t", "https://a.example", now.minus(Duration.ofDays(29)), now))
    }

    @Test fun aNewTokenRegisters() {
        assertTrue(needsRegistering("new", "https://a.example", "t", "https://a.example", now, now))
    }

    @Test fun anotherServerRegisters() {
        assertTrue(needsRegistering("t", "https://b.example", "t", "https://a.example", now, now))
    }

    @Test fun anOldHandleIsRenewedLongBeforeItExpires() {
        assertTrue(needsRegistering("t", "https://a.example", "t", "https://a.example", now.minus(Duration.ofDays(31)), now))
    }

    @Test fun neverRegisteredRegisters() {
        assertTrue(needsRegistering("t", "https://a.example", null, null, null, now))
    }
}

// PUSH-5: what the notification says. Friday 6:00 PM in Los Angeles, the evening before Saturday's match.
class PushTextTest {
    @Before fun fix() {
        Locale.setDefault(Locale.US)
        AppClock.fixed = Instant.parse("2026-11-14T02:00:00Z")
    }

    @After fun free() {
        AppClock.fixed = null
    }

    private fun match(id: String, home: String, away: String, kickoff: String) = Match(
        id = id, version = 0, updatedAt = "2026-11-09T00:00:00Z", status = "scheduled", format = defaultFormat,
        home = Team(name = home), away = Team(name = away), crew = emptyList(), kickoff = kickoff, timeZone = "America/Los_Angeles",
    )

    private fun weather(id: String, celsius: Double, vararg risks: WeatherRisk) = MatchWeather(
        matchId = id, final = false, condition = "cloudy", isDay = true, temperatureC = celsius, feelsLikeC = celsius,
        precipitationMm = 0.0, precipitationBeforeMm = 0.0, hours = emptyList(), risks = risks.toList(), updatedAt = "2026-11-14T01:00:00Z", source = "Open-Meteo",
    )

    private val storms = WeatherRisk("storm", "likely")
    private val rain = WeatherRisk("rain", "possible")
    private val early = match("m1", "Strikers", "Rovers", "2026-11-14T17:00:00Z")

    @Test fun aRiskSaysWhichDay() {
        assertEquals("Storms likely · tomorrow, 9:00 AM", riskText(weather("m1", 20.0, storms), kickoffAt(early), false))
        assertEquals("Storms likely, Rain possible · Mon, Nov 16, 09:00", riskText(weather("m1", 20.0, rain, storms), kickoffAt(match("m3", "A", "B", "2026-11-16T17:00:00Z")), true))
        assertEquals("Storms likely · today, 9:00 PM", riskText(weather("m1", 20.0, storms), kickoffAt(match("m4", "A", "B", "2026-11-14T05:00:00Z")), false))
    }
}
