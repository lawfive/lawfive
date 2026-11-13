package app.lawfive

import app.lawfive.data.RunGame
import app.lawfive.data.axisTicks
import app.lawfive.data.busiestGrid
import app.lawfive.data.describeWatch
import app.lawfive.data.figureAndUnit
import app.lawfive.data.hasBattery
import app.lawfive.data.lightStep
import app.lawfive.data.percentFigure
import app.lawfive.data.periodName
import app.lawfive.data.pitchThirds
import app.lawfive.data.platformLabel
import app.lawfive.data.ranks
import app.lawfive.data.rate
import app.lawfive.data.ringShare
import app.lawfive.data.runningStretches
import app.lawfive.data.shares
import app.lawfive.data.spacedLabels
import app.lawfive.data.thirdStep
import app.lawfive.data.watchCaption
import app.lawfive.data.watchFigure
import app.lawfive.data.watchesShown
import app.lawfive.data.json
import app.lawfive.schema.Stats
import app.lawfive.schema.StatsWatches
import app.lawfive.schema.StatsWatchesModelsItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneOffset

// WEB-24, STAT-3, STAT-15: the phone's Stats works out what the website's does (web/src/stats.ts,
// and the same cases as web/test/stats.test.ts), and Your watches' states.
class StatsMathTest {
    @Test
    fun `shares add up to 100`() {
        assertEquals(listOf(34, 33, 33), shares(listOf(1.0, 1.0, 1.0)))
        assertEquals(listOf(31, 38, 20, 8, 3), shares(listOf(31.0, 38.0, 20.0, 8.0, 3.0)))
        assertEquals(listOf(0, 0), shares(listOf(0.0, 0.0)))
        assertEquals(100, shares(listOf(7.0, 2.0, 2.0, 5.0)).sum())
        // The demo's speed bands: walking takes the rounding's spare point, as on the website.
        assertEquals(listOf(92, 7, 1, 0, 0), shares(listOf(7260.0, 587.0, 63.0, 18.0, 9.0)))
    }

    @Test
    fun `ranks share a place on a tie, and the next skips`() {
        assertEquals(listOf(1, 2, 3, 3, 5), ranks(listOf(12, 9, 6, 6, 5)))
        assertEquals(listOf(1, 1, 1), ranks(listOf(3, 3, 3)))
        assertEquals(emptyList<Int>(), ranks(emptyList()))
    }

    @Test
    fun `the pitch's thirds count the time beyond the lines to the third beside it`() {
        val cols = 24
        val rows = 18
        val cells = MutableList(cols * rows) { 0.0 }
        // The far left column (beyond the goal line) and the bottom row (beyond the near touchline).
        cells[9 * cols] = 60.0
        cells[(rows - 1) * cols + 12] = 30.0
        cells[9 * cols + 12] = 10.0
        val t = pitchThirds(cells, cols, rows)
        assertEquals(listOf(60, 40, 0), t.length)
        assertEquals(listOf(0, 70, 30), t.width)
        // A third's shade: two thirds of the time is the palest of the six.
        assertEquals(6, thirdStep(67))
        assertEquals(1, thirdStep(0))
        assertEquals(3, thirdStep(26))
    }

    @Test
    fun `the running total runs in months, or years over a long span`() {
        val games = listOf(
            RunGame("2026-08-20T17:00:00Z", 8000.0, 8000.0),
            RunGame("2026-08-27T17:00:00Z", 7000.0, 15000.0),
            RunGame("2026-09-03T17:00:00Z", 9000.0, 24000.0),
        )
        val months = runningStretches(games, ZoneOffset.UTC)
        assertEquals(2, months.size)
        assertEquals(listOf(Triple(15000.0, 15000.0, 2), Triple(9000.0, 24000.0, 1)), months.map { Triple(it.addedM, it.totalM, it.games) })
        assertEquals("2026", months[0].sub)
        assertNull(months[1].sub)
        assertEquals("2026-09-03T17:00:00Z", months[1].lastKickoff)
        val years = runningStretches(games + RunGame("2027-12-01T17:00:00Z", 1000.0, 25000.0), ZoneOffset.UTC, maxMonths = 3)
        assertEquals(listOf("2026", "2027"), years.map { it.label })
    }

    @Test
    fun `axis ticks end close above the top`() {
        assertEquals(listOf(0.0, 50.0, 100.0, 150.0, 200.0, 250.0), axisTicks(226.0))
        assertEquals(listOf(0.0, 100.0, 200.0, 300.0, 400.0), axisTicks(312.5))
        assertEquals(listOf(0.0, 2.5, 5.0, 7.5, 10.0, 12.5), axisTicks(11.4))
        assertEquals(listOf(0.0, 1.0), axisTicks(0.0))
    }

    @Test
    fun `labels along a line keep their distance, the last always shown`() {
        assertEquals(listOf(true, false, false, true), spacedLabels(listOf(10f, 40f, 120f, 130f), 50f))
        assertEquals(listOf(true, true, true), spacedLabels(listOf(0f, 100f, 200f), 50f))
    }

    @Test
    fun `busiest times span the hours with games, lit by share of the busiest`() {
        val grid = busiestGrid(listOf(Triple(5, 9, 6L), Triple(6, 11, 1L)))
        assertEquals(listOf(9, 10, 11), grid.hours)
        assertEquals(6L, grid.at(5, 9))
        assertEquals(0L, grid.at(0, 10))
        assertEquals(6, lightStep(6, 6))
        assertEquals(1, lightStep(1, 6))
        assertEquals(0, lightStep(0, 6))
        assertTrue(busiestGrid(emptyList()).hours.isEmpty())
    }

    @Test
    fun `a watch's ring is the battery an hour on a 30% scale, and full past it`() {
        assertEquals(0.5f, ringShare(15.0), 0f)
        assertEquals(1f, ringShare(45.0), 0f)
        assertEquals(0f, ringShare(null), 0f)
        assertEquals("8.6%", percentFigure(8.64))
        assertEquals("17%", percentFigure(17.4))
        assertEquals("10%", percentFigure(9.96))
        assertEquals("3%", percentFigure(3.0))
    }

    @Test
    fun `rates are written as the website's`() {
        assertEquals("0.38", rate(5, 13))
        assertEquals("0.15", rate(2, 13))
        assertEquals("0.8", rate(4, 5))
        assertEquals("2.0", rate(26, 13))
        assertEquals("0.0", rate(0, 13))
        assertEquals("0.0", rate(3, 0))
        assertEquals("27.0" to "mi", figureAndUnit("27.0 mi"))
        assertEquals("34" to "mph gusts", figureAndUnit("34 mph gusts"))
        assertEquals("—" to "", figureAndUnit("—"))
        assertEquals("All time", periodName("all"))
        assertEquals("Last 12 months", periodName("12m"))
        assertEquals("2025", periodName("2025"))
    }

    private fun watch(name: String, platform: String, games: Long, batteryGames: Long, perHour: Double? = null, perGame: Double? = null) =
        StatsWatchesModelsItem("$platform:x", name, platform, games, batteryGames, perHour, perGame)

    @Test
    fun `your watches name the platform only where the name doesn't`() {
        assertNull(platformLabel(watch("Garmin Venu 2", "garmin", 6, 3)))
        assertNull(platformLabel(watch("Apple Watch Series 9", "applewatch", 2, 2)))
        assertEquals("Wear OS", platformLabel(watch("Galaxy Watch4", "wearos", 2, 2)))
        assertEquals("Watch", platformLabel(watch("Pixel Watch", "other", 1, 0)))
    }

    @Test
    fun `a watch with readings shows its battery, one without says so`() {
        val venu = watch("Garmin Venu 2", "garmin", 6, 3, 9.9, 15.9)
        assertTrue(hasBattery(venu))
        assertEquals("9.9%", watchFigure(venu))
        assertEquals("16% a game, from 3 games", watchCaption(venu))
        assertEquals("Garmin Venu 2: 9.9% of the battery an hour; 6 games on it; 16% a game, from 3 games", describeWatch(venu))
        // With Role = Assistant in the demo: the Venu 2's one game has no readings.
        val none = watch("Garmin Venu 2", "garmin", 1, 0)
        assertFalse(hasBattery(none))
        assertEquals("—", watchFigure(none))
        assertEquals("No battery readings yet", watchCaption(none))
        assertEquals("Garmin Venu 2: no battery readings yet; 1 game on it", describeWatch(none))
        val one = watch("Galaxy Watch4", "wearos", 1, 1, 40.0, 27.0)
        assertEquals("27% a game, from 1 game", watchCaption(one))
        assertTrue(describeWatch(one).startsWith("Wear OS Galaxy Watch4: 40% of the battery an hour, past the ring's scale"))
    }

    @Test
    fun `the watches come most used first, and not at all from an older server`() {
        val shown = watchesShown(StatsWatches(9, listOf(watch("Galaxy Watch4", "wearos", 2, 2), watch("Garmin Venu 2", "garmin", 6, 3), watch("Apple Watch", "applewatch", 1, 0))))
        assertEquals(listOf("Garmin Venu 2", "Galaxy Watch4", "Apple Watch"), shown.map { it.name })
        assertTrue(watchesShown(null).isEmpty())
        assertTrue(watchesShown(StatsWatches(0, emptyList())).isEmpty())
    }

    @Test
    fun `an answer without watches, from a server before them, still reads`() {
        val old = """{"options":{"years":[],"genders":[],"competitions":[],"tags":[],"venues":[]},"games":{"total":0,"abandoned":0},
            "roles":{"referee":0,"ar1":0,"ar2":0,"fourth":0,"notSet":0},"distance":{"totalM":0,"games":0,"tracked":0,"byRole":[],"overTime":[]},
            "months":[],"busiest":[],"ageGroups":[],"places":{"venues":0,"pitches":0,"top":[]},"referees":{"count":0,"top":[]},
            "weather":{"games":0,"rainy":0,"temperaturesC":[]},"fees":{"games":0,"earnedAmount":0,"paidAmount":0,"owedAmount":0,"otherCurrencies":[],"months":[],"competitions":[]},
            "discipline":{"games":0,"cautions":0,"sendOffs":0,"secondCautions":0,"goals":0,"ageGroups":[],"competitions":[],"codes":[]},
            "fitness":{"games":[]},"addedTime":{"periods":0,"byPeriod":[],"ageGroups":[],"competitions":[]},"years":[]}"""
        val stats = json.decodeFromString(Stats.serializer(), old)
        assertNull(stats.watches)
        assertTrue(watchesShown(stats.watches).isEmpty())
    }
}
