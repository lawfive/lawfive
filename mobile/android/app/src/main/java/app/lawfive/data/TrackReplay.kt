package app.lawfive.data

import app.lawfive.schema.EventStoppage
import app.lawfive.schema.GpsSeries
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchTrack
import app.lawfive.schema.PeriodPlayed
import java.time.OffsetDateTime
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin

// A match's replay on the phone (TRK-14), as the web's replay.ts: where the referee was at any moment,
// along a timeline of the periods back to back, with the goals and cards marked. And the pitch in
// metres (as schema/src/pitch.ts), for adjusting it by hand. Times are milliseconds after the track's start.

fun instantMs(text: String): Long = OffsetDateTime.parse(text).toInstant().toEpochMilli()

/** A stretch of play; a period suspended part way (TMR-13) has one either side, the later starting `played` ms into the period. */
data class Span(val period: Long, val from: Long, val to: Long, val played: Long = 0)

/**
 * Each period's stretches of play on the track's clock, as schema's playWindows: from its kickoff for its time played,
 * split where play was suspended (TMR-13). Empty without period start times. On a clock that stops (TMR-15) the period
 * ran for its clock's time and the time it stood still (stoppedSec), the referee still on the field, so a stretch takes
 * in both and `played` counts both.
 */
fun playSpans(periods: List<PeriodPlayed>, start: Long): List<Span> = periods.filter { it.startedAt != null }.flatMap { p ->
    val kickoff = instantMs(p.startedAt!!) - start
    val gaps = (p.suspended ?: emptyList()).sortedBy { it.fromSec }
    val end = kickoff + (p.playedSec + (p.stoppedSec ?: 0) + gaps.sumOf { it.lengthSec }) * 1000
    val spans = ArrayList<Span>()
    var from = kickoff
    var played = 0L
    for (gap in gaps) {
        val at = (kickoff + gap.fromSec * 1000).coerceAtLeast(from).coerceAtMost(end)
        if (at > from) {
            spans.add(Span(p.period, from, at, played))
            played += at - from
        }
        from = (at + gap.lengthSec * 1000).coerceAtMost(end)
    }
    spans.add(Span(p.period, from, end, played))
    spans
}

/** TMR-13: an event's track time, in the stretch of its period its time falls in (the first, when none holds it). */
fun trackTimeOf(spans: List<Span>, period: Long?, periodSec: Long): Long? {
    val mine = spans.filter { it.period == period }
    val ms = periodSec * 1000
    val span = mine.firstOrNull { ms >= it.played && ms <= it.played + (it.to - it.from) } ?: mine.firstOrNull() ?: return null
    return span.from + ms - span.played
}

/** TMR-15: where a stopping clock stood still in a period: from the clock's time, for how long (schema's ClockStop). */
data class ClockStop(val atSec: Long, val lengthSec: Long)

/**
 * TMR-15: the stops of a match on a clock that stops, by period, from its record's stoppages, in the order they came
 * (schema's clockStopsOf); none for a match on a clock that runs on, whose events' times are already the time played.
 */
fun clockStopsOf(record: MatchRecord): Map<Long, List<ClockStop>> {
    if (record.stoppingClock != true) return emptyMap()
    return record.events.filterIsInstance<EventStoppage>()
        .filter { it.`when` == "play" && it.period != null && it.periodSec != null }
        .groupBy({ it.period!! }, { ClockStop(it.periodSec!!, it.lengthSec) })
        .mapValues { (_, stops) -> stops.sortedBy { it.atSec } }
}

/**
 * TMR-15: a stopping clock's time in a period as the time since its kickoff (leaving out suspensions, as `played` does):
 * the clock's time and every stop before it. An event at the clock's time a stop began (the goal that stopped it, a card
 * while it stood still) goes at the stop's start.
 */
fun elapsedOfClock(stops: List<ClockStop>?, clockSec: Long): Long = clockSec + (stops ?: emptyList()).sumOf { if (it.atSec < clockSec) it.lengthSec else 0L }

/** TMR-15: the other way: the clock's time at a time since the period's kickoff, standing still through each stop. */
fun clockOfElapsed(stops: List<ClockStop>?, elapsedSec: Long): Long {
    var stopped = 0L
    for (s in stops ?: emptyList()) {
        val from = s.atSec + stopped
        if (elapsedSec < from) break
        if (elapsedSec < from + s.lengthSec) return s.atSec
        stopped += s.lengthSec
    }
    return elapsedSec - stopped
}

data class Moment(val lat: Double?, val lon: Double?, val noGps: Boolean, val speedMps: Double?, val bpm: Int?)

/** A goal or card (a sin bin too, EVT-12, with its length), and when it happened in track time. */
data class ReplayEvent(val type: String, val team: String, val t: Long, val period: Long, val periodSec: Long?, val player: Long?, val goalType: String?, val lengthSec: Long? = null) {
    val goal get() = type == "goal"
    /** A caution or a sin bin: a yellow mark and banner; the rest of the cards are red. */
    val yellow get() = type == "caution" || type == "sinBin"
}

/** One unbroken run of steps in the same speed band, 0 walking to 4 sprinting (TRK-5). */
data class SpeedStretch(val band: Int, val points: List<Pair<Double, Double>>)

private val bandFromKph = listOf(0.0, 7.0, 13.0, 18.0, 21.0)
private const val DEFAULT_SPRINT_KPH = 21.0
private const val STEP_GAP_MS = 15_000L
private const val MAX_SPEED_MPS = 10.0
private const val TRAVEL_WINDOW_MS = 30_000L
private const val TRAVEL_SPEED_MPS = 4.0
private const val SPRINT_MAX_SEC = 6.0

private fun metresBetween(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val radians = Math.PI / 180
    val x = (lon2 - lon1) * radians * Math.cos((lat1 + lat2) / 2 * radians)
    val y = (lat2 - lat1) * radians
    return Math.hypot(x, y) * 6_371_008.8
}

/** The band of the step into each point, or null where there's no step: schema/src/track.ts's trackPath, so the bands agree with the website's. */
fun speedBandsOf(g: GpsSeries, sprintKph: Double = DEFAULT_SPRINT_KPH): List<Int?> {
    val n = g.t.size
    fun raw(i: Int) = metresBetween(g.lat[i - 1], g.lon[i - 1], g.lat[i], g.lon[i])
    val counts = BooleanArray(n) { i ->
        val dt = if (i > 0) g.t[i] - g.t[i - 1] else 0
        dt in 1..STEP_GAP_MS && raw(i) / (dt / 1000.0) <= MAX_SPEED_MPS
    }
    // Travel: every step in a window (at least two thirds full) that covers too much ground.
    val travel = HashSet<Int>()
    var from = 0
    var metres = 0.0
    for (i in 1 until n) {
        if (counts[i]) metres += raw(i)
        while (g.t[i] - g.t[from] > TRAVEL_WINDOW_MS) {
            from++
            if (counts[from]) metres -= raw(from)
        }
        val sec = (g.t[i] - g.t[from]) / 1000.0
        if (sec * 1000 >= TRAVEL_WINDOW_MS * 2.0 / 3 && metres / sec > TRAVEL_SPEED_MPS) for (k in from + 1..i) travel.add(k)
    }
    travel.forEach { counts[it] = false }
    // Each point averaged with the neighbours it has a counted step to.
    val smooth = List(n) { i ->
        val near = listOfNotNull(i, (i - 1).takeIf { counts[i] }, (i + 1).takeIf { i + 1 < n && counts[i + 1] })
        near.sumOf { g.lat[it] } / near.size to near.sumOf { g.lon[it] } / near.size
    }
    val speeds = List(n) { i ->
        if (!counts[i]) null else minOf(
            g.speedMps?.getOrNull(i) ?: (metresBetween(smooth[i - 1].first, smooth[i - 1].second, smooth[i].first, smooth[i].second) / ((g.t[i] - g.t[i - 1]) / 1000.0)),
            MAX_SPEED_MPS,
        )
    }.toMutableList()
    // Sprinting for too long is travel too, at the default sprint speed whatever the user's.
    val run = ArrayList<Int>()
    fun endRun() {
        if (run.sumOf { (g.t[it] - g.t[it - 1]) / 1000.0 } >= SPRINT_MAX_SEC) run.forEach { speeds[it] = null }
        run.clear()
    }
    for (i in 0 until n) {
        val speed = speeds[i]
        if (speed != null && speed * 3.6 >= DEFAULT_SPRINT_KPH) run.add(i) else endRun()
    }
    endRun()
    return speeds.map { speed ->
        speed?.let { bandFromKph.indexOfLast { from -> it * 3.6 >= from * sprintKph / DEFAULT_SPRINT_KPH }.coerceAtLeast(0) }
    }
}

class TrackReplay(
    private val track: MatchTrack, periods: List<PeriodPlayed>, events: List<ReplayEvent>, private val sprintKph: Double = DEFAULT_SPRINT_KPH,
    /** TMR-15: a stopping clock's stops (clockStopsOf), so the clock shown stands still through them. */
    private val stops: Map<Long, List<ClockStop>> = emptyMap(),
) {
    private val start = instantMs(track.start)
    private val gps = track.gps
    private val hr = track.heartRate

    /** Each period's stretch; the whole recording without period times. */
    val spans: List<Span> = playSpans(periods, start).ifEmpty {
        val times = listOfNotNull(gps?.t, hr?.t).flatMap { if (it.isEmpty()) emptyList() else listOf(it.first(), it.last()) }
        if (times.isEmpty()) emptyList() else listOf(Span(0, times.min(), times.max()))
    }
    val length: Long = spans.sumOf { it.to - it.from }
    val events: List<ReplayEvent> = events.sortedBy { it.t }

    /** Where each period after the first starts along the timeline. */
    val boundaries: List<Long> = spans.runningFold(0L) { before, s -> before + (s.to - s.from) }.drop(1).dropLast(1)

    /** The track time at a point along the timeline (0 to length). */
    fun trackTimeAt(position: Long): Long {
        var left = position.coerceIn(0, length)
        for (span in spans) {
            val size = span.to - span.from
            if (left <= size) return span.from + left
            left -= size
        }
        return spans.lastOrNull()?.to ?: 0
    }

    /** Where a track time falls along the timeline; in a break, the start of the next period. */
    fun positionAt(t: Long): Long {
        var before = 0L
        for (span in spans) {
            if (t < span.from) return before
            if (t <= span.to) return before + (t - span.from)
            before += span.to - span.from
        }
        return length
    }

    private fun indexAt(times: List<Long>, t: Long): Int {
        var lo = 0
        var hi = times.size - 1
        var found = -1
        while (lo <= hi) {
            val mid = (lo + hi) / 2
            if (times[mid] <= t) {
                found = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return found
    }

    fun at(t: Long): Moment {
        val bpm = hr?.takeIf { it.t.isNotEmpty() }?.let { h ->
            val i = indexAt(h.t, t)
            // The nearest reading, unless the recording had a gap there.
            val near = listOf(i, i + 1).filter { it in h.t.indices }.minByOrNull { abs(h.t[it] - t) }
            near?.takeIf { abs(h.t[it] - t) <= GAP_MS }?.let { h.bpm[it] }
        }
        val g = gps
        if (g == null || g.t.isEmpty() || t < g.t.first() || t > g.t.last()) return Moment(null, null, true, null, bpm)
        val i = indexAt(g.t, t)
        if (i + 1 >= g.t.size) return Moment(g.lat[i], g.lon[i], false, g.speedMps?.getOrNull(i), bpm)
        val gap = g.t[i + 1] - g.t[i]
        // A gap in the fixes: wait at the last good position.
        if (gap > GAP_MS) return Moment(g.lat[i], g.lon[i], true, null, bpm)
        val f = (t - g.t[i]).toDouble() / gap
        val metres = hypot((g.lat[i + 1] - g.lat[i]) * METRES_PER_DEGREE, (g.lon[i + 1] - g.lon[i]) * METRES_PER_DEGREE * cos(Math.toRadians(g.lat[i])))
        return Moment(
            g.lat[i] + (g.lat[i + 1] - g.lat[i]) * f, g.lon[i] + (g.lon[i + 1] - g.lon[i]) * f, false,
            g.speedMps?.getOrNull(i + 1) ?: (metres / (gap / 1000.0)), bpm,
        )
    }

    /** The last minute behind the marker, as [lat, lon] points. */
    fun trail(t: Long): List<Pair<Double, Double>> {
        val g = gps ?: return emptyList()
        val from = max(0, indexAt(g.t, t - TRAIL_MS) + 1)
        val to = indexAt(g.t, t)
        if (to < from) return emptyList()
        return (from..to).map { g.lat[it] to g.lon[it] }
    }

    private val bands by lazy { gps?.let { speedBandsOf(it, sprintKph) } ?: emptyList() }

    /** The route in its speed bands; steps that don't count leave a break (as the website's). Within a time range for the trail. */
    fun speedStretches(from: Long = Long.MIN_VALUE, to: Long = Long.MAX_VALUE): List<SpeedStretch> {
        val g = gps ?: return emptyList()
        val out = ArrayList<SpeedStretch>()
        var points: MutableList<Pair<Double, Double>>? = null
        var band = -1
        val first = if (from == Long.MIN_VALUE) 1 else max(1, indexAt(g.t, from) + 1)
        for (i in first until g.t.size) {
            if (g.t[i] > to) break
            val step = bands[i]
            if (step == null || !spans.any { g.t[i - 1] >= it.from && g.t[i] <= it.to }) {
                points = null
                continue
            }
            if (points == null || band != step) {
                // Each stretch starts where the last ended, so the line is unbroken.
                points = mutableListOf(g.lat[i - 1] to g.lon[i - 1])
                band = step
                out.add(SpeedStretch(step, points))
            }
            points.add(g.lat[i] to g.lon[i])
        }
        return out
    }

    /** The last minute behind the marker, in its speed bands. */
    fun trailStretches(t: Long) = speedStretches(t - TRAIL_MS, t)

    /** Each period's points, for drawing the whole route. */
    fun routes(): List<List<Pair<Double, Double>>> {
        val g = gps ?: return emptyList()
        return spans.map { s -> g.t.indices.filter { g.t[it] in s.from..s.to }.map { g.lat[it] to g.lon[it] } }.filter { it.size > 1 }
    }

    /** The period's time at a track time in [span], for its minute; on a stopping clock the clock's, standing still through its stops (TMR-15). */
    fun clockSecAt(span: Span, t: Long): Long = clockOfElapsed(stops[span.period], (t - span.from + span.played) / 1000)

    fun scoreAt(t: Long): Pair<Int, Int> =
        events.filter { it.goal && it.t <= t }.fold(0 to 0) { (h, a), e -> if (e.team == "home") h + 1 to a else h to a + 1 }

    fun spanAt(t: Long): Span? = spans.firstOrNull { it.period > 0 && t in it.from..it.to }

    /** The next goal or card after `from`, up to `to`, along the timeline. */
    fun stopBetween(from: Long, to: Long): ReplayEvent? = events.firstOrNull { positionAt(it.t) in (from + 1)..to }

    companion object {
        const val GAP_MS = 10_000L
        const val TRAIL_MS = 60_000L
        const val METRES_PER_DEGREE = 111_195.0
        /** How long the replay holds on a goal, and on a card. */
        const val HOLD_GOAL_MS = 3000L
        const val HOLD_CARD_MS = 2000L
    }
}

/** A pitch in metres around its centre spot, as schema/src/pitch.ts: x along its length, y along its width. */
class PitchFrame(val centreLat: Double, val centreLon: Double, val ux: Double, val uy: Double, val lengthM: Double, val widthM: Double) {
    private val eastScale = TrackReplay.METRES_PER_DEGREE * cos(Math.toRadians(centreLat))
    private val vx = -uy
    private val vy = ux

    fun toPitch(lat: Double, lon: Double): Pair<Double, Double> {
        val e = (lon - centreLon) * eastScale
        val n = (lat - centreLat) * TrackReplay.METRES_PER_DEGREE
        return e * ux + n * uy to e * vx + n * vy
    }

    fun fromPitch(x: Double, y: Double): Pair<Double, Double> {
        val e = x * ux + y * vx
        val n = x * uy + y * vy
        return centreLat + n / TrackReplay.METRES_PER_DEGREE to centreLon + e / eastScale
    }

    /** The bearing of its length, in degrees from north. */
    val bearing: Double get() = ((Math.toDegrees(atan2(ux, uy)) % 360) + 360) % 360

    /** Its four corners in order, then the two ends of the halfway line. */
    fun outline() = listOf(fromPitch(-lengthM / 2, -widthM / 2), fromPitch(lengthM / 2, -widthM / 2), fromPitch(lengthM / 2, widthM / 2), fromPitch(-lengthM / 2, widthM / 2))
    fun halfway() = listOf(fromPitch(0.0, -widthM / 2), fromPitch(0.0, widthM / 2))

    /** Moved so its centre spot is here. */
    fun movedTo(lat: Double, lon: Double) = of(lat, lon, bearing, lengthM, widthM)

    /** Turned and resized as if the middle of a goal line were dragged here. */
    fun withEnd(lat: Double, lon: Double): PitchFrame {
        val (x, y) = toPitch(lat, lon)
        return of(centreLat, centreLon, bearing - Math.toDegrees(atan2(y, x)), max(30.0, 2 * hypot(x, y)), widthM)
    }

    /** Widened as if the middle of a touchline were dragged here. */
    fun withSide(lat: Double, lon: Double): PitchFrame {
        val (_, y) = toPitch(lat, lon)
        return of(centreLat, centreLon, bearing, lengthM, max(20.0, 2 * abs(y)))
    }

    companion object {
        /** From the two corners of one touchline and the centre spot. */
        fun from(aLat: Double, aLon: Double, bLat: Double, bLon: Double, centreLat: Double, centreLon: Double): PitchFrame {
            val east = TrackReplay.METRES_PER_DEGREE * cos(Math.toRadians(centreLat))
            val a = (aLon - centreLon) * east to (aLat - centreLat) * TrackReplay.METRES_PER_DEGREE
            val b = (bLon - centreLon) * east to (bLat - centreLat) * TrackReplay.METRES_PER_DEGREE
            val length = hypot(b.first - a.first, b.second - a.second)
            val ux = if (length > 0) (b.first - a.first) / length else 1.0
            val uy = if (length > 0) (b.second - a.second) / length else 0.0
            val width = 2 * abs((a.first + b.first) / 2 * -uy + (a.second + b.second) / 2 * ux)
            return PitchFrame(centreLat, centreLon, ux, uy, length, width)
        }

        fun of(centreLat: Double, centreLon: Double, bearingDeg: Double, lengthM: Double, widthM: Double): PitchFrame {
            val r = Math.toRadians(bearingDeg)
            return PitchFrame(centreLat, centreLon, sin(r), cos(r), lengthM, widthM)
        }
    }
}

