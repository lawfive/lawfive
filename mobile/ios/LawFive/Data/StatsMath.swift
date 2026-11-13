import Foundation

// The Stats tab's arithmetic (STAT-3, STAT-13 to STAT-15, WEB-24), ported from the website's
// web/src/stats.ts (as Android's data/StatsMath.kt) so the phone's broadcast stats package works out
// the same figures: shares that add up to 100, ranks with ties, the pitch's thirds, the running total
// as stretches, the axis steps, which labels fit, the busiest times' grid and its light, and the
// watches' rings. Kept apart from the drawing so it can be tested.

/// Whole percentages of a total that add up to 100 (largest remainder), or all 0 with nothing.
func shares(_ values: [Double]) -> [Int] {
    let total = values.reduce(0, +)
    guard total > 0 else { return values.map { _ in 0 } }
    let exact = values.map { $0 / total * 100 }
    var out = exact.map { Int(floor($0)) }
    var left = 100 - out.reduce(0, +)
    // Stable, as the website's sort: equal remainders keep their order.
    let order = exact.indices.map { ($0, exact[$0] - floor(exact[$0])) }
        .enumerated().sorted { $0.element.1 != $1.element.1 ? $0.element.1 > $1.element.1 : $0.offset < $1.offset }
        .map { $0.element.0 }
    for i in order where left > 0 {
        out[i] += 1
        left -= 1
    }
    return out
}

/// Ranks as a league table gives them: equal values share a rank and the next skips (1, 2, 3, 3, 5). Values come sorted, most first.
func ranks(_ values: [Int]) -> [Int] {
    values.enumerated().map { i, v in i > 0 && v == values[i - 1] ? (values.firstIndex(of: v) ?? i) + 1 : i + 1 }
}

/// The margins around the pitch in the heatmap's grid (the schema's heatGrid): wider beyond the touchlines, where assistants run.
let heatMarginLength = 0.05
let heatMarginWidth = 0.12

/// The time in each third of the pitch's length (left, middle, right) and width (far side, middle, near side), as whole percentages.
struct Thirds: Equatable {
    let length: [Int]
    let width: [Int]
}

/// TRK-9: the thirds from the heatmap's grid, which runs past the lines: time beyond a goal line or
/// touchline counts to the third it's beside, so an assistant's touchline counts.
func pitchThirds(_ cells: [Double], cols: Int, rows: Int) -> Thirds {
    var length = [0.0, 0, 0]
    var width = [0.0, 0, 0]
    let w = 1 + 2 * heatMarginLength
    let h = 1 + 2 * heatMarginWidth
    let third = { (at: Double) in min(2, max(0, Int(floor(at * 3)))) }
    for (i, sec) in cells.enumerated() {
        let x = (Double(i % cols) + 0.5) * (w / Double(cols)) - heatMarginLength
        let y = (Double(i / cols) + 0.5) * (h / Double(rows)) - heatMarginWidth
        length[third(x)] += sec
        width[third(y)] += sec
    }
    return Thirds(length: shares(length), width: shares(width))
}

/// A third's shade on the heatmap's own scale: a third with two thirds of the time is the palest band.
func thirdStep(_ share: Int) -> Int { max(1, min(6, Int(ceil(Double(share) / 11)))) }

/// A stretch of the running total's track: a month (or a year, for a long span) of games.
struct Stretch: Equatable {
    let key: String
    /// "Aug", or "2026" for a year.
    let label: String
    /// The year under the first stretch and each January's.
    let sub: String?
    var addedM: Double
    /// The running total at the stretch's last game.
    var totalM: Double
    /// That game's kickoff.
    var lastKickoff: String
    var games: Int
}

/// A game on the running total: its kickoff, its distance and the total after it.
struct RunGame {
    let kickoff: String
    let distanceM: Double
    let totalM: Double
}

/// The running total of distance as stretches (STAT-3): a month each, or a year each when the games
/// span more than `maxMonths` months, so a long career doesn't make slivers. Months by the phone's calendar.
func runningStretches(_ games: [RunGame], zone: TimeZone = .current, maxMonths: Int = 14) -> [Stretch] {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    let parts = { (iso: String) -> (year: Int, month: Int, date: Date) in
        let d = instantOf(iso) ?? Date(timeIntervalSince1970: 0)
        let c = calendar.dateComponents([.year, .month], from: d)
        return (c.year ?? 1970, c.month ?? 1, d)
    }
    let index = { (iso: String) -> Int in let p = parts(iso); return p.year * 12 + p.month - 1 }
    let byYear = !games.isEmpty && index(games.last!.kickoff) - index(games.first!.kickoff) + 1 > maxMonths
    let monthName = DateFormatter()
    monthName.locale = .current
    monthName.timeZone = zone
    monthName.dateFormat = "MMM"
    var out: [Stretch] = []
    for g in games {
        let p = parts(g.kickoff)
        let key = byYear ? "\(p.year)" : String(format: "%d-%02d", p.year, p.month)
        if var last = out.last, last.key == key {
            last.addedM += g.distanceM
            last.totalM = g.totalM
            last.lastKickoff = g.kickoff
            last.games += 1
            out[out.count - 1] = last
        } else {
            out.append(Stretch(
                key: key,
                label: byYear ? key : monthName.string(from: p.date),
                sub: !byYear && (out.isEmpty || p.month == 1) ? "\(p.year)" : nil,
                addedM: g.distanceM, totalM: g.totalM, lastKickoff: g.kickoff, games: 1
            ))
        }
    }
    return out
}

/// Round steps from 0 to at least max, four or five of them, ending close above it (0, 50 … 250 for 226).
func axisTicks(_ max: Double) -> [Double] {
    guard max > 0 else { return [0, 1] }
    let raw = max / 5
    let power = pow(10, floor(log10(raw)))
    let step = [1.0, 2, 2.5, 5, 10].map { $0 * power }.first { $0 >= raw } ?? raw
    var out = [0.0]
    while out.last! < max - step * 0.001 { out.append(((out.last! + step) * 1000).rounded() / 1000) }
    return out
}

/// Which labels along a line fit without touching: the last always, others where there's `gap` between them and it.
func spacedLabels(_ positions: [Double], gap: Double) -> [Bool] {
    var shown = Array(repeating: false, count: positions.count)
    guard let last = positions.indices.last else { return shown }
    shown[last] = true
    var previous = -Double.infinity
    for i in 0..<last where positions[i] - previous >= gap && positions[last] - positions[i] >= gap {
        shown[i] = true
        previous = positions[i]
    }
    return shown
}

/// The busiest times as a grid: the kickoff hours from the earliest to the latest with games, and the busiest cell.
struct BusyGrid {
    let hours: [Int]
    let games: [Int: Int]
    let max: Int
    func at(_ day: Int, _ hour: Int) -> Int { games[day * 100 + hour] ?? 0 }
}

/// From the server's day-and-hour pairs (day 0 is Monday).
func busiestGrid(_ cells: [(day: Int, hour: Int, games: Int)]) -> BusyGrid {
    guard let from = cells.map(\.hour).min(), let to = cells.map(\.hour).max() else { return BusyGrid(hours: [], games: [:], max: 0) }
    var games: [Int: Int] = [:]
    for c in cells { games[c.day * 100 + c.hour] = c.games }
    return BusyGrid(hours: Array(from...to), games: games, max: cells.map(\.games).max() ?? 0)
}

/// Six steps of light, by share of the busiest: 0 for none.
func lightStep(_ games: Int, _ most: Int) -> Int { games <= 0 || most <= 0 ? 0 : max(1, min(6, Int(ceil(Double(games) / Double(most) * 6)))) }

/// STAT-15: the scale of a watch's ring, the battery used an hour, full at 30% an hour.
let ringFullPerHour = 30.0

/// How much of a watch's ring is lit for its battery used an hour: 0 to 1, full at the top of the scale (and past it).
func ringShare(_ drainPerHour: Double?) -> Double {
    guard let drainPerHour else { return 0 }
    return min(1, max(0, drainPerHour / ringFullPerHour))
}

/// "9%" or "2.5%": whole percents from 10, one decimal under it, as battery figures are read.
func percentFigure(_ value: Double) -> String {
    if value >= 9.95 { return "\(Int(value.rounded()))%" }
    let tenths = Int((value * 10).rounded())
    return tenths % 10 == 0 ? "\(tenths / 10)%" : "\(tenths / 10).\(abs(tenths % 10))%"
}

/// So many a game, as the website writes it: one decimal from 1, two under it ("0.38", "0.8", "2.0").
func rate(_ n: Int, _ games: Int) -> String {
    let r = games > 0 ? Double(n) / Double(games) : 0
    if r >= 1 || r == 0 { return String(format: "%.1f", locale: Locale(identifier: "en_US"), r) }
    let two = String(format: "%.2f", locale: Locale(identifier: "en_US"), r)
    return two.hasSuffix("0") ? String(two.dropLast()) : two
}

/// "27.0 mi" as its figure and its unit, so the unit can sit small beside it.
func figureAndUnit(_ text: String) -> (figure: String, unit: String) {
    guard let match = text.range(of: #"^[\d.,−-]+"#, options: .regularExpression) else { return (text, "") }
    let figure = String(text[match])
    let unit = text[match.upperBound...].trimmingCharacters(in: .whitespaces)
    return (figure, unit)
}

/// What the filters cover, for the ticker's tab: All time, Last 12 months, a year.
func periodName(_ time: String) -> String {
    if time == "all" { return "All time" }
    if time == "12m" { return "Last 12 months" }
    if time.count == 4, Int(time) != nil { return time }
    return "These dates"
}

private let platformNames = ["garmin": "Garmin", "wearos": "Wear OS", "applewatch": "Apple Watch", "other": "Watch"]

/// STAT-15: the watches to show, most games first, or none (an older server, or no watch said which it was): then the section is left out.
func watchesShown(_ watches: StatsWatches?) -> [StatsWatchesModelsItem] {
    (watches?.models ?? []).enumerated().sorted { $0.element.games != $1.element.games ? $0.element.games > $1.element.games : $0.offset < $1.offset }.map(\.element)
}

/// The platform over a watch's name, only where the name doesn't already say it: Wear OS over Galaxy Watch4, not Garmin over Garmin Venu 2.
func platformLabel(_ watch: StatsWatchesModelsItem) -> String? {
    let platform = platformNames[watch.platform] ?? platformNames["other"]!
    return watch.name.lowercased().hasPrefix(platform.lowercased()) ? nil : platform
}

/// Whether a watch has battery figures.
func hasBattery(_ watch: StatsWatchesModelsItem) -> Bool { watch.drainPerHour != nil && watch.batteryGames > 0 }

/// On the watch's face: the battery used an hour, or a dash with no readings.
func watchFigure(_ watch: StatsWatchesModelsItem) -> String {
    guard hasBattery(watch), let perHour = watch.drainPerHour else { return "—" }
    return percentFigure(perHour)
}

/// Under its name: "16% a game, from 3 games", or "No battery readings yet".
func watchCaption(_ watch: StatsWatchesModelsItem) -> String {
    guard let perGame = watch.drainPerGame, watch.batteryGames > 0 else { return "No battery readings yet" }
    return "\(percentFigure(perGame)) a game, from \(watch.batteryGames) \(watch.batteryGames == 1 ? "game" : "games")"
}

/// The watch in words, for VoiceOver.
func describeWatch(_ watch: StatsWatchesModelsItem) -> String {
    let games = "\(watch.games) \(watch.games == 1 ? "game" : "games") on it"
    var battery = "no battery readings yet"
    if hasBattery(watch), let perHour = watch.drainPerHour {
        battery = "\(percentFigure(perHour)) of the battery an hour\(perHour > ringFullPerHour ? ", past the ring's scale" : "")"
    }
    let name = [platformLabel(watch), watch.name].compactMap { $0 }.joined(separator: " ")
    return "\(name): \(battery); \(games)" + (hasBattery(watch) ? "; \(watchCaption(watch))" : "")
}
