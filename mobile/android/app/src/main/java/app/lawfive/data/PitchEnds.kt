package app.lawfive.data

import kotlin.math.cos
import kotlin.math.sin

// TRK-9: the direction of play on a match's heatmap, as the website's web/src/pitchEnds.ts. With the
// kickoff direction from the watch (PRE-8), each period of normal time names the team attacking from
// each end of the drawing: the team defending the left goal line attacks left to right, the other
// right to left. Teams change ends every period, so odd periods are the first period's way round and
// even ones the other. Extra time has its own toss, which the record doesn't carry, so it gets none.
// The drawing is the ground seen from above, never mirrored; only which way round it's drawn
// changes (`turned`, as schema's pitchTurned).

/** Who attacks from each end in one period: `left` from the left end, left to right; `right` the other way. "home" or "away". */
data class PeriodEnds(val period: Int, val left: String, val right: String)

/** A row under the drawing: what the periods are called ("1st half", "P1, P3") and who attacks from each end. */
data class EndsRow(val label: String, val left: String, val right: String)

/**
 * Who attacks from each end in each period of normal time, on a drawing whose length runs along
 * (ux, uy) (east and north, from the pitch's frame), turned end to end when `turned`.
 */
fun pitchEnds(periods: Int, team: String?, bearingDeg: Double?, ux: Double, uy: Double, turned: Boolean): List<PeriodEnds> {
    if (team == null || bearingDeg == null || periods < 1) return emptyList()
    val b = Math.toRadians(bearingDeg)
    // Along the pitch's length, toward the end drawn on the right before any turn.
    val along = sin(b) * ux + cos(b) * uy
    val kickerAttacksRight = (along >= 0) != turned
    val other = if (team == "home") "away" else "home"
    return (0 until periods).map { i ->
        val kickerLeft = kickerAttacksRight == (i % 2 == 0)
        PeriodEnds(i + 1, if (kickerLeft) team else other, if (kickerLeft) other else team)
    }
}

/** The Match view's rows: the periods grouped by which way round they were played, the first period's first. */
fun endsByWayRound(ends: List<PeriodEnds>, periods: Int): List<EndsRow> =
    listOf(0, 1).mapNotNull { parity ->
        val group = ends.filter { (it.period - 1) % 2 == parity }
        group.firstOrNull()?.let { EndsRow(group.joinToString(", ") { e -> endsLabel(e.period, periods) }, it.left, it.right) }
    }

/** A period's name under the halfway line: "1st half", "2nd half", or P1 to P4. */
fun endsLabel(period: Int, periods: Int): String =
    if (periods == 2) (if (period == 1) "1st half" else "2nd half") else "P$period"

/**
 * Whether the server turned the drawing end to end (schema's pitchTurned): an assistant's so their
 * touchline (the side of the pitch where they were in the periods, `y` the positions across it) is
 * at the bottom; a referee's so the first kickoff team attacks left to right.
 */
fun pitchTurned(role: String?, acrossInPeriods: List<Double>, bearingDeg: Double?, ux: Double, uy: Double): Boolean {
    if (role == "ar1" || role == "ar2") return acrossInPeriods.sum() > 0
    if (bearingDeg == null) return false
    val b = Math.toRadians(bearingDeg)
    return sin(b) * ux + cos(b) * uy < 0
}
