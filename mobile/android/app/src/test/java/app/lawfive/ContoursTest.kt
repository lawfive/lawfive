package app.lawfive

import app.lawfive.data.contourLevels
import app.lawfive.data.heatContours
import app.lawfive.data.march
import app.lawfive.data.svgPath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

// TRK-9, WEB-24: the painted heatmap's bands work out as the website's (web/src/contours.ts), with
// the same cases as web/test/contours.test.ts, and the same paths for the same grid.
class ContoursTest {
    @Test
    fun `no time on the pitch draws no bands`() {
        val paths = heatContours(List(24 * 18) { 0.0 }, 24, 18, 115.0, 84.0)
        assertEquals(contourLevels.size, paths.size)
        assertTrue(paths.all { it.isEmpty() })
    }

    @Test
    fun `time in one place draws a closed band at every level, around that place`() {
        val cols = 24
        val rows = 18
        val cells = MutableList(cols * rows) { 0.0 }
        cells[9 * cols + 12] = 600.0
        cells[9 * cols + 11] = 300.0
        val paths = heatContours(cells, cols, rows, 120.0, 90.0).map(::svgPath)
        assertEquals(6, paths.size)
        for (d in paths) {
            assertTrue(d, Regex("^M[\\d.]+ [\\d.]+C").containsMatchIn(d))
            assertTrue(d.endsWith("Z"))
            // Every point of every band lies around the hot cells (x 55 to 65, y 45 to 50), within a few cells.
            val numbers = Regex("-?[\\d.]+").findAll(d).map { it.value.toDouble() }.toList()
            for (i in numbers.indices step 2) {
                assertTrue("x ${numbers[i]}", numbers[i] > 35 && numbers[i] < 85)
                assertTrue("y ${numbers[i + 1]}", numbers[i + 1] > 25 && numbers[i + 1] < 70)
            }
        }
        // Higher levels draw smaller rings.
        assertTrue(paths[5].length <= paths[0].length)
    }

    @Test
    fun `marching squares closes a ring round a single high point`() {
        val grid = doubleArrayOf(
            0.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 0.0,
        )
        val rings = march(grid, 3, 3, 0.5)
        assertEquals(1, rings.size)
        assertEquals(4, rings[0].size)
        for (p in rings[0]) assertEquals(0.5, abs(p.x - 1) + abs(p.y - 1), 1e-9)
    }

    @Test
    fun `the same grid draws the website's paths`() {
        val paths = heatContours(contourCase.cells, contourCase.cols, contourCase.rows, contourCase.w, contourCase.h).map(::svgPath)
        assertEquals(contourCase.paths.size, paths.size)
        for ((ours, theirs) in paths.zip(contourCase.paths)) assertSamePath(theirs, ours)
    }

    /** The same commands and numbers, each within a rounding step (the platforms' exp can differ in its last digit). */
    private fun assertSamePath(expected: String, actual: String) {
        assertEquals(expected.replace(Regex("[-\\d.]+"), "#"), actual.replace(Regex("[-\\d.]+"), "#"))
        val a = Regex("-?[\\d.]+").findAll(expected).map { it.value.toDouble() }.toList()
        val b = Regex("-?[\\d.]+").findAll(actual).map { it.value.toDouble() }.toList()
        for (i in a.indices) assertTrue("${a[i]} and ${b[i]} at $i", abs(a[i] - b[i]) <= 0.1 + 1e-9)
    }
}
