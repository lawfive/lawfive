package app.lawfive

import app.lawfive.ui.screens.percent
import app.lawfive.ui.screens.statsQuery
import app.lawfive.ui.screens.temperatureBands
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

// STAT-13: the phone's Stats filters, figures and chart steps, as the website works them out.
class StatsTest {
    @Test
    fun `filters become the API's query`() {
        val today = LocalDate.of(2026, 11, 2)
        assertEquals("", statsQuery("all", null, today))
        assertEquals("from=2025-11-03", statsQuery("12m", null, today))
        assertEquals("from=2025-01-01&to=2025-12-31&role=assistant", statsQuery("2025", "assistant", today))
    }

    @Test
    fun `shares round as the website's`() {
        assertEquals("33%", percent(1, 3))
        assertEquals("0%", percent(0, 0))
    }

    @Test
    fun `temperatures go in 10 °F or 5 °C bands, empty ones between included`() {
        assertEquals(listOf(60 to 2, 70 to 0, 80 to 1), temperatureBands(listOf(16.0, 18.0, 28.0), fahrenheit = true))
        assertEquals(listOf(-5 to 1, 0 to 1), temperatureBands(listOf(-0.5, 3.0), fahrenheit = false))
    }
}
