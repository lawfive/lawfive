import Foundation

// A match's replay on the phone (TRK-14), as Android's and the web's: where the referee was at any moment,
// along a timeline of the periods back to back, with the goals and cards marked. And the pitch in
// metres (as schema/src/pitch.ts), for adjusting it by hand. Times are milliseconds after the track's start.

/// A stretch of play; a period suspended part way (TMR-13) has one either side, the later starting `played` ms into the period.
struct Span: Equatable {
    let period: Int
    let from: Int
    let to: Int
    var played: Int = 0
}

/// Each period's stretches of play on the track's clock (ms after `start`), as schema's playWindows: from its kickoff for
/// its time played, split where play was suspended (TMR-13). Empty without period start times. On a clock that stops
/// (TMR-15) the period ran for its clock's time and the time it stood still (stoppedSec), the referee still on the field.
func playSpans(_ periods: [PeriodPlayed], start: Int) -> [Span] {
    periods.flatMap { p -> [Span] in
        guard let at = instantOf(p.startedAt) else { return [] }
        let kickoff = Int(at.timeIntervalSince1970 * 1000) - start
        let gaps = (p.suspended ?? []).sorted { $0.fromSec < $1.fromSec }
        let end = kickoff + (p.playedSec + (p.stoppedSec ?? 0) + gaps.reduce(0) { $0 + $1.lengthSec }) * 1000
        var spans: [Span] = []
        var from = kickoff
        var played = 0
        for gap in gaps {
            let at = min(max(kickoff + gap.fromSec * 1000, from), end)
            if at > from {
                spans.append(Span(period: p.period, from: from, to: at, played: played))
                played += at - from
            }
            from = min(at + gap.lengthSec * 1000, end)
        }
        spans.append(Span(period: p.period, from: from, to: end, played: played))
        return spans
    }
}

/// TMR-15: where a stopping clock stood still in a period: from the clock's time, for how long.
struct ClockStop: Equatable {
    let atSec: Int
    let lengthSec: Int
}

/// TMR-15: the stops of a match on a clock that stops, by period, from its record's stoppages, as schema's clockStopsOf;
/// none for a match on a clock that runs on, whose events' times are already the time played.
func clockStopsOf(_ record: MatchRecord) -> [Int: [ClockStop]] {
    guard record.stoppingClock == true else { return [:] }
    var stops: [Int: [ClockStop]] = [:]
    for event in record.events {
        if case .stoppage(let s) = event, s.when == "play", let period = s.period, let at = s.periodSec {
            stops[period, default: []].append(ClockStop(atSec: at, lengthSec: s.lengthSec))
        }
    }
    return stops.mapValues { $0.sorted { $0.atSec < $1.atSec } }
}

/// TMR-15: a stopping clock's time in a period as the time since its kickoff (leaving out suspensions, as `played`
/// does): the clock's time and every stop before it. An event at the clock's time a stop began (the goal that
/// stopped it, a card while it stood still) goes at the stop's start.
func elapsedOfClock(_ stops: [ClockStop]?, _ clockSec: Int) -> Int {
    clockSec + (stops ?? []).reduce(0) { $0 + ($1.atSec < clockSec ? $1.lengthSec : 0) }
}

/// TMR-15: the other way: the clock's time at a time since the period's kickoff, standing still through each stop.
func clockOfElapsed(_ stops: [ClockStop]?, _ elapsedSec: Int) -> Int {
    var stopped = 0
    for s in stops ?? [] {
        let from = s.atSec + stopped
        if elapsedSec < from { break }
        if elapsedSec < from + s.lengthSec { return s.atSec }
        stopped += s.lengthSec
    }
    return elapsedSec - stopped
}

/// TMR-13: an event's track time, in the stretch of its period its time falls in (the first, when none holds it).
func trackTimeOf(_ spans: [Span], period: Int?, periodSec: Int) -> Int? {
    let mine = spans.filter { $0.period == period }
    let ms = periodSec * 1000
    guard let span = mine.first(where: { ms >= $0.played && ms <= $0.played + ($0.to - $0.from) }) ?? mine.first else { return nil }
    return span.from + ms - span.played
}

struct Moment {
    var lat: Double?
    var lon: Double?
    var noGps: Bool
    var speedMps: Double?
    var bpm: Int?
}

/// A goal or card (a sin bin too, EVT-12, with its length), and when it happened in track time.
struct ReplayEvent: Identifiable, Equatable {
    let type: String
    let team: String
    let t: Int
    let period: Int
    let player: Int?
    let goalType: String?
    var lengthSec: Int? = nil
    var id: String { "\(type)-\(t)" }
    var goal: Bool { type == "goal" }
    /// A caution or a sin bin: a yellow mark and banner; the rest of the cards are red.
    var yellow: Bool { type == "caution" || type == "sinBin" }
    /// The banner's title and the scrubber's words for it.
    var title: String {
        switch type {
        case "goal": "Goal"
        case "caution": "Yellow card"
        case "secondCaution": "Second yellow"
        case "sinBin": "Sin bin"
        case "secondSinBin": "Second sin bin"
        default: "Red card"
        }
    }
}

typealias LatLon = (lat: Double, lon: Double)

/// One unbroken run of steps in the same speed band, 0 walking to 4 sprinting (TRK-5).
struct SpeedStretch {
    let band: Int
    var points: [LatLon]
    /// Still being added to, while they're worked out.
    var open = true
}

private let bandFromKph = [0.0, 7, 13, 18, 21]
private let defaultSprintKph = 21.0

private func metresBetween(_ a: LatLon, _ b: LatLon) -> Double {
    let radians = Double.pi / 180
    let x = (b.lon - a.lon) * radians * cos((a.lat + b.lat) / 2 * radians)
    let y = (b.lat - a.lat) * radians
    return hypot(x, y) * 6_371_008.8
}

/// The band of the step into each point, or nil where there's no step: schema/src/track.ts's trackPath, so the bands agree with the website's.
func speedBandsOf(_ g: GpsSeries, sprintKph: Double = defaultSprintKph) -> [Int?] {
    let n = g.t.count
    let gapMs = 15_000, maxSpeed = 10.0, travelWindowMs = 30_000, travelSpeed = 4.0, sprintMaxSec = 6.0
    func point(_ i: Int) -> LatLon { (g.lat[i], g.lon[i]) }
    func raw(_ i: Int) -> Double { metresBetween(point(i - 1), point(i)) }
    var counts = (0..<n).map { i -> Bool in
        guard i > 0 else { return false }
        let dt = g.t[i] - g.t[i - 1]
        return dt > 0 && dt <= gapMs && raw(i) / (Double(dt) / 1000) <= maxSpeed
    }
    // Travel: every step in a window (at least two thirds full) that covers too much ground.
    var travel = Set<Int>()
    var from = 0
    var metres = 0.0
    if n > 1 {
        for i in 1..<n {
            if counts[i] { metres += raw(i) }
            while g.t[i] - g.t[from] > travelWindowMs {
                from += 1
                if counts[from] { metres -= raw(from) }
            }
            let sec = Double(g.t[i] - g.t[from]) / 1000
            if sec * 1000 >= Double(travelWindowMs) * 2 / 3 && metres / sec > travelSpeed {
                if from + 1 <= i { for k in (from + 1)...i { travel.insert(k) } }
            }
        }
    }
    for k in travel { counts[k] = false }
    // Each point averaged with the neighbours it has a counted step to.
    let smooth = (0..<n).map { i -> LatLon in
        var near = [i]
        if counts[i] { near.append(i - 1) }
        if i + 1 < n && counts[i + 1] { near.append(i + 1) }
        return (near.map { g.lat[$0] }.reduce(0, +) / Double(near.count), near.map { g.lon[$0] }.reduce(0, +) / Double(near.count))
    }
    var speeds = (0..<n).map { i -> Double? in
        guard counts[i] else { return nil }
        let measured = g.speedMps.flatMap { i < $0.count ? $0[i] : nil }
        return min(measured ?? metresBetween(smooth[i - 1], smooth[i]) / (Double(g.t[i] - g.t[i - 1]) / 1000), maxSpeed)
    }
    // Sprinting for too long is travel too, at the default sprint speed whatever the user's.
    var run: [Int] = []
    func endRun() {
        if run.map({ Double(g.t[$0] - g.t[$0 - 1]) / 1000 }).reduce(0, +) >= sprintMaxSec { for k in run { speeds[k] = nil } }
        run = []
    }
    for i in 0..<n {
        if let speed = speeds[i], speed * 3.6 >= defaultSprintKph { run.append(i) } else { endRun() }
    }
    endRun()
    return speeds.map { speed in
        speed.map { s in bandFromKph.lastIndex { s * 3.6 >= $0 * sprintKph / defaultSprintKph } ?? 0 }
    }
}

final class TrackReplay {
    static let gapMs = 10_000
    static let trailMs = 60_000
    static let metresPerDegree = 111_195.0
    /// How long the replay holds on a goal, and on a card.
    static let holdGoal: TimeInterval = 3
    static let holdCard: TimeInterval = 2

    private let gps: GpsSeries?
    private let hr: HeartRateSeries?
    /// Each period's stretch; the whole recording without period times.
    let spans: [Span]
    let length: Int
    let events: [ReplayEvent]
    /// Where each period after the first starts along the timeline.
    let boundaries: [Int]

    private let sprintKph: Double

    init(track: MatchTrack, periods: [PeriodPlayed], events: [ReplayEvent], sprintKph: Double = 21) {
        self.sprintKph = sprintKph
        gps = track.gps
        hr = track.heartRate
        let start = Int((instantOf(track.start)?.timeIntervalSince1970 ?? 0) * 1000)
        var timed = playSpans(periods, start: start)
        if timed.isEmpty {
            let times = [track.gps?.t, track.heartRate?.t].compactMap { $0 }.flatMap { $0.isEmpty ? [] : [$0.first!, $0.last!] }
            if let lo = times.min(), let hi = times.max() { timed = [Span(period: 0, from: lo, to: hi)] }
        }
        spans = timed
        length = timed.reduce(0) { $0 + ($1.to - $1.from) }
        self.events = events.sorted { $0.t < $1.t }
        var before = 0
        var starts: [Int] = []
        for span in timed {
            starts.append(before)
            before += span.to - span.from
        }
        boundaries = Array(starts.dropFirst())
    }

    /// The track time at a point along the timeline (0 to length).
    func trackTimeAt(_ position: Int) -> Int {
        var left = min(max(position, 0), length)
        for span in spans {
            let size = span.to - span.from
            if left <= size { return span.from + left }
            left -= size
        }
        return spans.last?.to ?? 0
    }

    /// Where a track time falls along the timeline; in a break, the start of the next period.
    func positionAt(_ t: Int) -> Int {
        var before = 0
        for span in spans {
            if t < span.from { return before }
            if t <= span.to { return before + (t - span.from) }
            before += span.to - span.from
        }
        return length
    }

    private func indexAt(_ times: [Int], _ t: Int) -> Int {
        var lo = 0
        var hi = times.count - 1
        var found = -1
        while lo <= hi {
            let mid = (lo + hi) / 2
            if times[mid] <= t {
                found = mid
                lo = mid + 1
            } else {
                hi = mid - 1
            }
        }
        return found
    }

    func at(_ t: Int) -> Moment {
        var bpm: Int?
        if let h = hr, !h.t.isEmpty {
            let i = indexAt(h.t, t)
            // The nearest reading, unless the recording had a gap there.
            if let near = [i, i + 1].filter({ h.t.indices.contains($0) }).min(by: { abs(h.t[$0] - t) < abs(h.t[$1] - t) }), abs(h.t[near] - t) <= Self.gapMs {
                bpm = h.bpm[near]
            }
        }
        guard let g = gps, let first = g.t.first, let last = g.t.last, t >= first, t <= last else { return Moment(noGps: true, bpm: bpm) }
        let i = indexAt(g.t, t)
        if i + 1 >= g.t.count { return Moment(lat: g.lat[i], lon: g.lon[i], noGps: false, speedMps: g.speedMps?[i], bpm: bpm) }
        let gap = g.t[i + 1] - g.t[i]
        // A gap in the fixes: wait at the last good position.
        if gap > Self.gapMs { return Moment(lat: g.lat[i], lon: g.lon[i], noGps: true, bpm: bpm) }
        let f = Double(t - g.t[i]) / Double(gap)
        let north = (g.lat[i + 1] - g.lat[i]) * Self.metresPerDegree
        let east = (g.lon[i + 1] - g.lon[i]) * Self.metresPerDegree * cos(g.lat[i] * .pi / 180)
        return Moment(
            lat: g.lat[i] + (g.lat[i + 1] - g.lat[i]) * f, lon: g.lon[i] + (g.lon[i + 1] - g.lon[i]) * f, noGps: false,
            speedMps: g.speedMps?[i + 1] ?? hypot(north, east) / (Double(gap) / 1000), bpm: bpm
        )
    }

    /// The last minute behind the marker.
    func trail(_ t: Int) -> [LatLon] {
        guard let g = gps else { return [] }
        let from = max(0, indexAt(g.t, t - Self.trailMs) + 1)
        let to = indexAt(g.t, t)
        guard to >= from else { return [] }
        return (from...to).map { (g.lat[$0], g.lon[$0]) }
    }

    private(set) lazy var bands: [Int?] = gps.map { speedBandsOf($0, sprintKph: sprintKph) } ?? []

    /// The route in its speed bands; steps that don't count leave a break (as the website's). Within a time range for the trail.
    func speedStretches(from: Int = .min, to: Int = .max) -> [SpeedStretch] {
        guard let g = gps else { return [] }
        var out: [SpeedStretch] = []
        let first = from == .min ? 1 : max(1, indexAt(g.t, from) + 1)
        guard first < g.t.count else { return [] }
        for i in first..<g.t.count {
            if g.t[i] > to { break }
            guard let step = bands[i], spans.contains(where: { g.t[i - 1] >= $0.from && g.t[i] <= $0.to }) else {
                if out.last?.open == true { out[out.count - 1].open = false }
                continue
            }
            if let last = out.last, last.open, last.band == step {
                out[out.count - 1].points.append((g.lat[i], g.lon[i]))
            } else {
                // Each stretch starts where the last ended, so the line is unbroken.
                if !out.isEmpty { out[out.count - 1].open = false }
                out.append(SpeedStretch(band: step, points: [(g.lat[i - 1], g.lon[i - 1]), (g.lat[i], g.lon[i])]))
            }
        }
        return out
    }

    /// The last minute behind the marker, in its speed bands.
    func trailStretches(_ t: Int) -> [SpeedStretch] { speedStretches(from: t - Self.trailMs, to: t) }

    /// Fewer lines for MapKit, which slows down with thousands: a run of a few points joins the one before.
    func speedLinesForMap() -> [SpeedStretch] {
        var out: [SpeedStretch] = []
        for stretch in speedStretches() {
            if let last = out.last, stretch.points.count < 4, let joint = last.points.last, let start = stretch.points.first, joint.lat == start.lat, joint.lon == start.lon {
                out[out.count - 1].points += stretch.points.dropFirst()
            } else {
                out.append(stretch)
            }
        }
        return out
    }

    /// Each period's points, for drawing the whole route.
    func routes() -> [[LatLon]] {
        guard let g = gps else { return [] }
        return spans.map { s in g.t.indices.filter { g.t[$0] >= s.from && g.t[$0] <= s.to }.map { (g.lat[$0], g.lon[$0]) } }.filter { $0.count > 1 }
    }

    func scoreAt(_ t: Int) -> (home: Int, away: Int) {
        events.filter { $0.goal && $0.t <= t }.reduce((0, 0)) { $1.team == "home" ? ($0.0 + 1, $0.1) : ($0.0, $0.1 + 1) }
    }

    func spanAt(_ t: Int) -> Span? {
        spans.first { $0.period > 0 && t >= $0.from && t <= $0.to }
    }

    /// The next goal or card after `from`, up to `to`, along the timeline.
    func stopBetween(_ from: Int, _ to: Int) -> ReplayEvent? {
        events.first { positionAt($0.t) > from && positionAt($0.t) <= to }
    }
}

/// A pitch in metres around its centre spot, as schema/src/pitch.ts: x along its length, y along its width.
struct PitchFrame: Equatable {
    let centreLat: Double
    let centreLon: Double
    let ux: Double
    let uy: Double
    let lengthM: Double
    let widthM: Double

    private var eastScale: Double { TrackReplay.metresPerDegree * cos(centreLat * .pi / 180) }

    func toPitch(lat: Double, lon: Double) -> (x: Double, y: Double) {
        let e = (lon - centreLon) * eastScale
        let n = (lat - centreLat) * TrackReplay.metresPerDegree
        return (e * ux + n * uy, e * -uy + n * ux)
    }

    func fromPitch(x: Double, y: Double) -> LatLon {
        let e = x * ux + y * -uy
        let n = x * uy + y * ux
        return (centreLat + n / TrackReplay.metresPerDegree, centreLon + e / eastScale)
    }

    /// The bearing of its length, in degrees from north.
    var bearing: Double { (atan2(ux, uy) * 180 / .pi).truncatingRemainder(dividingBy: 360) + (atan2(ux, uy) < 0 ? 360 : 0) }

    /// Its four corners in order, back to the first, then the halfway line.
    var lines: [[LatLon]] {
        let (l, w) = (lengthM / 2, widthM / 2)
        let a = fromPitch(x: -l, y: -w)
        return [[a, fromPitch(x: l, y: -w), fromPitch(x: l, y: w), fromPitch(x: -l, y: w), a], [fromPitch(x: 0, y: -w), fromPitch(x: 0, y: w)]]
    }

    /// Moved so its centre spot is here.
    func moved(lat: Double, lon: Double) -> PitchFrame { .of(lat, lon, bearing: bearing, lengthM: lengthM, widthM: widthM) }

    /// Turned and resized as if the middle of a goal line were dragged here.
    func withEnd(lat: Double, lon: Double) -> PitchFrame {
        let (x, y) = toPitch(lat: lat, lon: lon)
        return .of(centreLat, centreLon, bearing: bearing - atan2(y, x) * 180 / .pi, lengthM: max(30, 2 * hypot(x, y)), widthM: widthM)
    }

    /// Widened as if the middle of a touchline were dragged here.
    func withSide(lat: Double, lon: Double) -> PitchFrame {
        let (_, y) = toPitch(lat: lat, lon: lon)
        return .of(centreLat, centreLon, bearing: bearing, lengthM: lengthM, widthM: max(20, 2 * abs(y)))
    }

    /// From the two corners of one touchline and the centre spot.
    static func from(a: Position, b: Position, centre: Position) -> PitchFrame {
        let east = TrackReplay.metresPerDegree * cos(centre.lat * .pi / 180)
        let p = ((a.lon - centre.lon) * east, (a.lat - centre.lat) * TrackReplay.metresPerDegree)
        let q = ((b.lon - centre.lon) * east, (b.lat - centre.lat) * TrackReplay.metresPerDegree)
        let length = hypot(q.0 - p.0, q.1 - p.1)
        let ux = length > 0 ? (q.0 - p.0) / length : 1
        let uy = length > 0 ? (q.1 - p.1) / length : 0
        let width = 2 * abs((p.0 + q.0) / 2 * -uy + (p.1 + q.1) / 2 * ux)
        return PitchFrame(centreLat: centre.lat, centreLon: centre.lon, ux: ux, uy: uy, lengthM: length, widthM: width)
    }

    static func of(_ lat: Double, _ lon: Double, bearing: Double, lengthM: Double, widthM: Double) -> PitchFrame {
        let r = bearing * .pi / 180
        return PitchFrame(centreLat: lat, centreLon: lon, ux: sin(r), uy: cos(r), lengthM: lengthM, widthM: widthM)
    }
}
