package app.lawfive.data

import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToLong
import kotlin.math.sqrt

// TRK-9, WEB-24: the heatmap as contour bands, "painted on the grass", ported from the website's
// web/src/contours.ts so the three copies draw the same bands from the same grid: the time in each
// cell of the pitch's grid smoothed into a field, then marching squares at a few levels, each ring
// smoothed into curves. Rings are in the drawing's own units (metres), the grid's cells w / cols by
// h / rows, so they sit on the pitch drawing as they are. Kept apart from the drawing so it can be
// tested with the website's cases.

/** A point in the drawing (or in sample space while marching). */
data class Pt(val x: Double, val y: Double)

/** One cubic curve of a smoothed ring: its two control points and where it ends. */
data class Cubic(val c1: Pt, val c2: Pt, val to: Pt)

/** A closed ring as curves from `start`, back to it. */
data class SmoothRing(val start: Pt, val curves: List<Cubic>)

/** Six bands from a little time to the most, evenly spaced on the square root of the time. */
val contourLevels = listOf(0.14, 0.29, 0.44, 0.59, 0.74, 0.89)

/**
 * The time in each cell (row by row from the top) as contour rings over a drawing w by h, one list
 * per level, lowest first; each level is drawn filled (even-odd), the higher over the lower. The grid
 * is sampled at each cell's middle, `fine` times finer, padded with empty ground so every ring
 * closes, and blurred about half a cell, so bands follow the run of play rather than the grid's squares.
 */
fun heatContours(cells: List<Double>, cols: Int, rows: Int, w: Double, h: Double, levels: List<Double> = contourLevels, fine: Int = 4): List<List<SmoothRing>> {
    val most = max(0.0, cells.maxOrNull() ?: 0.0)
    if (most <= 0) return levels.map { emptyList() }
    // The square root, so the lighter places still show.
    fun value(c: Int, r: Int): Double = if (c < 0 || r < 0 || c >= cols || r >= rows) 0.0 else sqrt(max(0.0, cells[r * cols + c]) / most)
    val pad = 2
    val nx = (cols + 2 * pad) * fine + 1
    val ny = (rows + 2 * pad) * fine + 1
    // Sample points: x in cells from the drawing's left edge, at the cells' middles.
    fun at(i: Int) = i.toDouble() / fine - pad
    var grid = DoubleArray(nx * ny)
    for (j in 0 until ny) {
        val y = at(j) - 0.5
        val r0 = floor(y).toInt()
        val ty = y - r0
        for (i in 0 until nx) {
            val x = at(i) - 0.5
            val c0 = floor(x).toInt()
            val tx = x - c0
            grid[j * nx + i] = (value(c0, r0) * (1 - tx) + value(c0 + 1, r0) * tx) * (1 - ty) + (value(c0, r0 + 1) * (1 - tx) + value(c0 + 1, r0 + 1) * tx) * ty
        }
    }
    grid = blur(grid, nx, ny, 0.55 * fine)
    val top = grid.maxOrNull() ?: 0.0
    if (top <= 0) return levels.map { emptyList() }
    for (k in grid.indices) grid[k] /= top
    // From sample space to the drawing: a cell is w / cols across.
    val sx = w / cols / fine
    val sy = h / rows / fine
    val ox = (-pad * fine).toDouble()
    return levels.map { level ->
        march(grid, nx, ny, level)
            .filter { it.size >= 4 }
            .mapNotNull { ring -> smooth(ring.map { Pt((it.x + ox) * sx, (it.y + ox) * sy) }) }
    }
}

/** A separable Gaussian blur of the grid. */
private fun blur(grid: DoubleArray, nx: Int, ny: Int, sigma: Double): DoubleArray {
    val radius = ceil(sigma * 3).toInt()
    val kernel = (-radius..radius).map { k -> exp(-(k * k) / (2 * sigma * sigma)) }
    val sum = kernel.sum()
    val weights = kernel.map { it / sum }
    val across = DoubleArray(grid.size)
    for (j in 0 until ny) {
        for (i in 0 until nx) {
            var v = 0.0
            for (k in -radius..radius) {
                val x = i + k
                if (x in 0 until nx) v += grid[j * nx + x] * weights[k + radius]
            }
            across[j * nx + i] = v
        }
    }
    val out = DoubleArray(grid.size)
    for (j in 0 until ny) {
        for (i in 0 until nx) {
            var v = 0.0
            for (k in -radius..radius) {
                val y = j + k
                if (y in 0 until ny) v += across[y * nx + i] * weights[k + radius]
            }
            out[j * nx + i] = v
        }
    }
    return out
}

/**
 * Marching squares: the closed rings where the field crosses the level, in sample coordinates. The
 * grid's edge is empty ground, so every ring closes; a saddle is split by the middle's value.
 */
fun march(grid: DoubleArray, nx: Int, ny: Int, level: Double): List<List<Pt>> {
    // An edge's crossing, keyed by which edge: horizontal edges from (i, j) to (i + 1, j), vertical from (i, j) to (i, j + 1).
    fun key(horizontal: Boolean, i: Int, j: Int) = (if (horizontal) 0 else 1) + 2 * (i + j * nx)
    fun point(k: Int): Pt {
        val horizontal = k % 2 == 0
        val n = k / 2
        val i = n % nx
        val j = n / nx
        val a = grid[j * nx + i]
        val b = if (horizontal) grid[j * nx + i + 1] else grid[(j + 1) * nx + i]
        val t = if (b == a) 0.5 else (level - a) / (b - a)
        return if (horizontal) Pt(i + t, j.toDouble()) else Pt(i.toDouble(), j + t)
    }
    // In the order they're first met, as the website's Map keeps them, so rings start where its do.
    val links = LinkedHashMap<Int, MutableList<Int>>()
    fun link(p: Int, q: Int) {
        links.getOrPut(p) { mutableListOf() }.add(q)
        links.getOrPut(q) { mutableListOf() }.add(p)
    }
    for (j in 0 until ny - 1) {
        for (i in 0 until nx - 1) {
            val a = grid[j * nx + i] > level
            val b = grid[j * nx + i + 1] > level
            val c = grid[(j + 1) * nx + i + 1] > level
            val d = grid[(j + 1) * nx + i] > level
            val top = key(true, i, j)
            val right = key(false, i + 1, j)
            val bottom = key(true, i, j + 1)
            val left = key(false, i, j)
            val crossed = ArrayList<Int>(4)
            if (a != b) crossed.add(top)
            if (b != c) crossed.add(right)
            if (c != d) crossed.add(bottom)
            if (d != a) crossed.add(left)
            if (crossed.size == 2) {
                link(crossed[0], crossed[1])
            } else if (crossed.size == 4) {
                val middle = (grid[j * nx + i] + grid[j * nx + i + 1] + grid[(j + 1) * nx + i + 1] + grid[(j + 1) * nx + i]) / 4 > level
                if (middle == a) {
                    link(top, right)
                    link(bottom, left)
                } else {
                    link(left, top)
                    link(right, bottom)
                }
            }
        }
    }
    val seen = HashSet<Int>()
    val rings = mutableListOf<List<Pt>>()
    for (start in links.keys) {
        if (start in seen) continue
        val ring = mutableListOf(start)
        seen.add(start)
        var current = start
        while (true) {
            val next = links[current].orEmpty().firstOrNull { it !in seen } ?: break
            seen.add(next)
            ring.add(next)
            current = next
        }
        rings.add(simplify(ring.map(::point)))
    }
    return rings
}

/** Drops points closer than about a third of a sample to the last kept, so curves stay light. */
private fun simplify(ring: List<Pt>): List<Pt> {
    val out = mutableListOf<Pt>()
    for (p in ring) {
        val last = out.lastOrNull()
        if (last == null || hypot(p.x - last.x, p.y - last.y) > 0.35) out.add(p)
    }
    return out
}

/** A closed ring as a smooth ring through its points (Catmull-Rom, as cubic curves), or null under three points. */
fun smooth(ring: List<Pt>): SmoothRing? {
    val count = ring.size
    if (count < 3) return null
    val curves = (0 until count).map { i ->
        val p0 = ring[(i - 1 + count) % count]
        val p1 = ring[i]
        val p2 = ring[(i + 1) % count]
        val p3 = ring[(i + 2) % count]
        Cubic(
            Pt(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6),
            Pt(p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6),
            p2,
        )
    }
    return SmoothRing(ring[0], curves)
}

/** A level's rings as SVG path data, exactly as the website writes them (a tenth of a metre), to compare the copies. */
fun svgPath(rings: List<SmoothRing>): String = rings.joinToString("") { ring ->
    buildString {
        append("M${tenth(ring.start.x)} ${tenth(ring.start.y)}")
        for (c in ring.curves) append("C${tenth(c.c1.x)} ${tenth(c.c1.y)} ${tenth(c.c2.x)} ${tenth(c.c2.y)} ${tenth(c.to.x)} ${tenth(c.to.y)}")
        append("Z")
    }
}

/** A number to a tenth as JavaScript prints Math.round(v * 10) / 10: "17.5", "2", "-0.5". */
private fun tenth(v: Double): String {
    val r = floor(v * 10 + 0.5).roundToLong()
    if (r == 0L) return "0"
    val sign = if (r < 0) "-" else ""
    val a = kotlin.math.abs(r)
    return if (a % 10 == 0L) "$sign${a / 10}" else "$sign${a / 10}.${a % 10}"
}
