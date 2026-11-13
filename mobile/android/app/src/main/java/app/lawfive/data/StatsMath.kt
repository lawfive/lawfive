package app.lawfive.data

import app.lawfive.schema.StatsWatches
import app.lawfive.schema.StatsWatchesModelsItem
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// The Stats tab's arithmetic (STAT-3, STAT-13 to STAT-15, WEB-24), ported from the website's
// web/src/stats.ts so the phone's broadcast stats package works out the same figures: shares that
// add up to 100, ranks with ties, the pitch's thirds, the running total as stretches, the axis
// steps, which labels fit, the busiest times' grid and its light, and the watches' rings. Kept apart
// from the drawing so it can be tested.

/** Whole percentages of a total that add up to 100 (largest remainder), or all 0 with nothing. */
fun shares(values: List<Double>): List<Int> {
    val total = values.sum()
    if (total <= 0) return values.map { 0 }
    val exact = values.map { it / total * 100 }
    val out = exact.map { floor(it).toInt() }.toMutableList()
    var left = 100 - out.sum()
    // Stable, as the website's sort: equal remainders keep their order.
    for (i in exact.indices.sortedByDescending { exact[it] - floor(exact[it]) }) {
        if (left <= 0) break
        out[i] += 1
        left -= 1
    }
    return out
}

/** Ranks as a league table gives them: equal values share a rank and the next skips (1, 2, 3, 3, 5). Values come sorted, most first. */
fun ranks(values: List<Long>): List<Int> = values.mapIndexed { i, v -> if (i > 0 && v == values[i - 1]) values.indexOf(v) + 1 else i + 1 }

/** The margins around the pitch in the heatmap's grid (the schema's heatGrid): wider beyond the touchlines, where assistants run. */
const val HEAT_MARGIN_LENGTH = 0.05
const val HEAT_MARGIN_WIDTH = 0.12

/** The time in each third of the pitch's length (left, middle, right) and width (far side, middle, near side), as whole percentages. */
data class Thirds(val length: List<Int>, val width: List<Int>)

/**
 * TRK-9: the thirds from the heatmap's grid, which runs past the lines: time beyond a goal line or
 * touchline counts to the third it's beside, so an assistant's touchline counts.
 */
fun pitchThirds(cells: List<Double>, cols: Int, rows: Int): Thirds {
    val length = DoubleArray(3)
    val width = DoubleArray(3)
    val w = 1 + 2 * HEAT_MARGIN_LENGTH
    val h = 1 + 2 * HEAT_MARGIN_WIDTH
    val third = { at: Double -> min(2, max(0, floor(at * 3).toInt())) }
    cells.forEachIndexed { i, sec ->
        val x = ((i % cols) + 0.5) * (w / cols) - HEAT_MARGIN_LENGTH
        val y = ((i / cols) + 0.5) * (h / rows) - HEAT_MARGIN_WIDTH
        length[third(x)] += sec
        width[third(y)] += sec
    }
    return Thirds(shares(length.toList()), shares(width.toList()))
}

/** A third's shade on the heatmap's own scale: a third with two thirds of the time is the palest band. */
fun thirdStep(share: Int): Int = max(1, min(6, ceil(share / 11.0).toInt()))

/** A stretch of the running total's track: a month (or a year, for a long span) of games. */
data class Stretch(
    val key: String,
    /** "Aug", or "2026" for a year. */
    val label: String,
    /** The year under the first stretch and each January's. */
    val sub: String?,
    val addedM: Double,
    /** The running total at the stretch's last game. */
    val totalM: Double,
    /** That game's kickoff. */
    val lastKickoff: String,
    val games: Int,
)

/** A game on the running total: its kickoff, its distance and the total after it. */
data class RunGame(val kickoff: String, val distanceM: Double, val totalM: Double)

/**
 * The running total of distance as stretches (STAT-3): a month each, or a year each when the games
 * span more than `maxMonths` months, so a long career doesn't make slivers. Months by the phone's calendar.
 */
fun runningStretches(games: List<RunGame>, zone: ZoneId = ZoneId.systemDefault(), maxMonths: Int = 14): List<Stretch> {
    val at = { iso: String -> Instant.parse(iso).atZone(zone) }
    val index = { iso: String -> at(iso).let { it.year * 12 + it.monthValue - 1 } }
    val byYear = games.isNotEmpty() && index(games.last().kickoff) - index(games.first().kickoff) + 1 > maxMonths
    val monthName = DateTimeFormatter.ofPattern("MMM", Locale.getDefault())
    val out = mutableListOf<Stretch>()
    for (g in games) {
        val d = at(g.kickoff)
        val key = if (byYear) "${d.year}" else "${d.year}-${"%02d".format(d.monthValue)}"
        val last = out.lastOrNull()
        if (last != null && last.key == key) {
            out[out.lastIndex] = last.copy(addedM = last.addedM + g.distanceM, totalM = g.totalM, lastKickoff = g.kickoff, games = last.games + 1)
        } else {
            out += Stretch(
                key = key,
                label = if (byYear) key else d.format(monthName),
                sub = if (!byYear && (out.isEmpty() || d.monthValue == 1)) "${d.year}" else null,
                addedM = g.distanceM, totalM = g.totalM, lastKickoff = g.kickoff, games = 1,
            )
        }
    }
    return out
}

/** Round steps from 0 to at least max, four or five of them, ending close above it (0, 50 … 250 for 226). */
fun axisTicks(max: Double): List<Double> {
    if (max <= 0) return listOf(0.0, 1.0)
    val raw = max / 5
    val power = 10.0.pow(floor(log10(raw)))
    val step = listOf(1.0, 2.0, 2.5, 5.0, 10.0).map { it * power }.firstOrNull { it >= raw } ?: raw
    val out = mutableListOf(0.0)
    while (out.last() < max - step * 0.001) out += ((out.last() + step) * 1000).roundToInt() / 1000.0
    return out
}

/** Which labels along a line fit without touching: the last always, others where there's `gap` between them and it. */
fun spacedLabels(positions: List<Float>, gap: Float): List<Boolean> {
    val shown = MutableList(positions.size) { false }
    if (positions.isEmpty()) return shown
    val last = positions.lastIndex
    shown[last] = true
    var previous = Float.NEGATIVE_INFINITY
    for (i in 0 until last) {
        if (positions[i] - previous >= gap && positions[last] - positions[i] >= gap) {
            shown[i] = true
            previous = positions[i]
        }
    }
    return shown
}

/** The busiest times as a grid: the kickoff hours from the earliest to the latest with games, and the busiest cell. */
data class BusyGrid(val hours: List<Int>, val games: Map<Pair<Int, Int>, Long>, val max: Long) {
    fun at(day: Int, hour: Int): Long = games[day to hour] ?: 0L
}

/** From the server's day-and-hour pairs (day 0 is Monday). */
fun busiestGrid(cells: List<Triple<Int, Int, Long>>): BusyGrid {
    if (cells.isEmpty()) return BusyGrid(emptyList(), emptyMap(), 0)
    val from = cells.minOf { it.second }
    val to = cells.maxOf { it.second }
    return BusyGrid((from..to).toList(), cells.associate { (it.first to it.second) to it.third }, cells.maxOf { it.third })
}

/** Six steps of light, by share of the busiest: 0 for none. */
fun lightStep(games: Long, max: Long): Int = if (games <= 0 || max <= 0) 0 else max(1, min(6, ceil(games.toDouble() / max * 6).toInt()))

/** STAT-15: the scale of a watch's ring, the battery used an hour, full at 30% an hour. */
const val RING_FULL_PER_HOUR = 30.0

/** How much of a watch's ring is lit for its battery used an hour: 0 to 1, full at the top of the scale (and past it). */
fun ringShare(drainPerHour: Double?): Float = if (drainPerHour == null) 0f else (drainPerHour / RING_FULL_PER_HOUR).coerceIn(0.0, 1.0).toFloat()

/** "9%" or "2.5%": whole percents from 10, one decimal under it, as battery figures are read. */
fun percentFigure(value: Double): String {
    if (value >= 9.95) return "${value.roundToInt()}%"
    val tenths = (value * 10).roundToInt()
    return if (tenths % 10 == 0) "${tenths / 10}%" else "${tenths / 10}.${kotlin.math.abs(tenths % 10)}%"
}

/** So many a game, as the website writes it: one decimal from 1, two under it ("0.38", "0.8", "2.0"). */
fun rate(n: Long, games: Long): String {
    val r = if (games > 0) n.toDouble() / games else 0.0
    return if (r >= 1 || r == 0.0) String.format(Locale.US, "%.1f", r) else String.format(Locale.US, "%.2f", r).removeSuffix("0")
}

/** "27.0 mi" as its figure and its unit, so the unit can sit small beside it. */
fun figureAndUnit(text: String): Pair<String, String> {
    val found = Regex("^([\\d.,−-]+)\\s*(.*)$").find(text) ?: return text to ""
    return found.groupValues[1] to found.groupValues[2]
}

/** What the filters cover, for the ticker's tab: All time, Last 12 months, a year. */
fun periodName(time: String): String = when {
    time == "all" -> "All time"
    time == "12m" -> "Last 12 months"
    time.matches(Regex("\\d{4}")) -> time
    else -> "These dates"
}

private val platformNames = mapOf("garmin" to "Garmin", "wearos" to "Wear OS", "applewatch" to "Apple Watch", "other" to "Watch")

/** STAT-15: the watches to show, most games first, or none (an older server, or no watch said which it was): then the section is left out. */
fun watchesShown(watches: StatsWatches?): List<StatsWatchesModelsItem> = watches?.models.orEmpty().sortedByDescending { it.games }

/** The platform over a watch's name, only where the name doesn't already say it: Wear OS over Galaxy Watch4, not Garmin over Garmin Venu 2. */
fun platformLabel(watch: StatsWatchesModelsItem): String? {
    val platform = platformNames[watch.platform] ?: platformNames.getValue("other")
    return if (watch.name.lowercase().startsWith(platform.lowercase())) null else platform
}

/** Whether a watch has battery figures. */
fun hasBattery(watch: StatsWatchesModelsItem): Boolean = watch.drainPerHour != null && watch.batteryGames > 0

/** On the watch's face: the battery used an hour, or a dash with no readings. */
fun watchFigure(watch: StatsWatchesModelsItem): String = if (hasBattery(watch)) percentFigure(watch.drainPerHour!!) else "—"

/** Under its name: "16% a game, from 3 games", or "No battery readings yet". */
fun watchCaption(watch: StatsWatchesModelsItem): String {
    val perGame = watch.drainPerGame
    return if (perGame != null && watch.batteryGames > 0) "${percentFigure(perGame)} a game, from ${watch.batteryGames} ${if (watch.batteryGames == 1L) "game" else "games"}"
    else "No battery readings yet"
}

/** The watch in words, for TalkBack. */
fun describeWatch(watch: StatsWatchesModelsItem): String {
    val games = "${watch.games} ${if (watch.games == 1L) "game" else "games"} on it"
    val battery = if (hasBattery(watch)) "${percentFigure(watch.drainPerHour!!)} of the battery an hour${if (watch.drainPerHour!! > RING_FULL_PER_HOUR) ", past the ring's scale" else ""}" else "no battery readings yet"
    return listOfNotNull(platformLabel(watch), watch.name).joinToString(" ") + ": $battery; $games" + if (hasBattery(watch)) "; ${watchCaption(watch)}" else ""
}
