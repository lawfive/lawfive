import Foundation

// TRK-9: the direction of play on a match's heatmap, as the website's web/src/pitchEnds.ts and
// Android's PitchEnds.kt. With the kickoff direction from the watch (PRE-8), each period of normal
// time names the team attacking from each end of the drawing: the team defending the left goal line
// attacks left to right, the other right to left. Teams change ends every period, so odd periods are
// the first period's way round and even ones the other. Extra time has its own toss, which the record
// doesn't carry, so it gets none. The drawing is the ground seen from above, never mirrored; only
// which way round it's drawn changes (`turned`, as schema's pitchTurned).

/// Who attacks from each end in one period: `left` from the left end, left to right; `right` the other way. "home" or "away".
struct PeriodEnds: Equatable {
    let period: Int
    let left: String
    let right: String
}

/// A row under the drawing: what the periods are called ("1st half", "P1, P3") and who attacks from each end.
struct EndsRow: Equatable {
    let label: String
    let left: String
    let right: String
}

/// Who attacks from each end in each period of normal time, on a drawing whose length runs along
/// (ux, uy) (east and north, from the pitch's frame), turned end to end when `turned`.
func pitchEnds(periods: Int, team: String?, bearingDeg: Double?, ux: Double, uy: Double, turned: Bool) -> [PeriodEnds] {
    guard let team, let bearingDeg, periods >= 1 else { return [] }
    let b = bearingDeg * .pi / 180
    // Along the pitch's length, toward the end drawn on the right before any turn.
    let along = sin(b) * ux + cos(b) * uy
    let kickerAttacksRight = (along >= 0) != turned
    let other = team == "home" ? "away" : "home"
    return (0..<periods).map { i in
        let kickerLeft = kickerAttacksRight == (i % 2 == 0)
        return PeriodEnds(period: i + 1, left: kickerLeft ? team : other, right: kickerLeft ? other : team)
    }
}

/// The Match view's rows: the periods grouped by which way round they were played, the first period's first.
func endsByWayRound(_ ends: [PeriodEnds], periods: Int) -> [EndsRow] {
    [0, 1].compactMap { parity in
        let group = ends.filter { ($0.period - 1) % 2 == parity }
        guard let first = group.first else { return nil }
        return EndsRow(label: group.map { endsLabel($0.period, periods: periods) }.joined(separator: ", "), left: first.left, right: first.right)
    }
}

/// A period's name under the halfway line: "1st half", "2nd half", or P1 to P4.
func endsLabel(_ period: Int, periods: Int) -> String {
    periods == 2 ? (period == 1 ? "1st half" : "2nd half") : "P\(period)"
}

/// Whether the server turned the drawing end to end (schema's pitchTurned): an assistant's so their
/// touchline (the side of the pitch where they were in the periods, `acrossInPeriods` the positions
/// across it) is at the bottom; a referee's so the first kickoff team attacks left to right.
func pitchTurned(role: String?, acrossInPeriods: [Double], bearingDeg: Double?, ux: Double, uy: Double) -> Bool {
    if role == "ar1" || role == "ar2" { return acrossInPeriods.reduce(0, +) > 0 }
    guard let bearingDeg else { return false }
    let b = bearingDeg * .pi / 180
    return sin(b) * ux + cos(b) * uy < 0
}
