import MapKit
import SwiftUI

// A match's track on the phone (TRK-14), as the web's and Android's: the route and the pitch on a map, the
// replay with its clock, score and goals and cards, adjusting the pitch by hand, and the heart rate chart.

struct TrackData {
    let track: MatchTrack
    let summary: TrackSummary
    let pitch: PitchOutline?
}

private func eventsOf(_ record: MatchRecord, track: MatchTrack) -> [ReplayEvent] {
    let ms = { (s: String?) -> Int? in instantOf(s).map { Int($0.timeIntervalSince1970 * 1000) } }
    let start = ms(track.start) ?? 0
    // TMR-15: on a clock that stops, times are the clock's, so each goes after the time it stood still before it.
    let stops = clockStopsOf(record)
    return record.events.compactMap { event in
        let p: (type: String, team: String, when: String, period: Int?, sec: Int?, at: String?, player: Int?, goalType: String?, lengthSec: Int?)
        switch event {
        case .goal(let e): p = ("goal", e.team, e.when, e.period, e.periodSec, e.at, e.player, e.goalType, nil)
        case .caution(let e): p = ("caution", e.team, e.when, e.period, e.periodSec, e.at, nil, nil, nil)
        case .secondCaution(let e): p = ("secondCaution", e.team, e.when, e.period, e.periodSec, e.at, nil, nil, nil)
        case .sendOff(let e): p = ("sendOff", e.team, e.when, e.period, e.periodSec, e.at, nil, nil, nil)
        // EVT-12: sin bins too, as the website's replay.ts.
        case .sinBin(let e): p = ("sinBin", e.team, e.when, e.period, e.periodSec, e.at, nil, nil, e.lengthSec)
        case .secondSinBin(let e): p = ("secondSinBin", e.team, e.when, e.period, e.periodSec, e.at, nil, nil, nil)
        default: return nil
        }
        guard p.when == "play" else { return nil }
        // TMR-13: after a suspension, in the period's later stretch.
        let inPlay = p.sec.flatMap { sec in
            trackTimeOf(playSpans(record.periods, start: start), period: p.period, periodSec: p.period.map { elapsedOfClock(stops[$0], sec) } ?? sec)
        }
        guard let t = inPlay ?? ms(p.at).map({ $0 - start }) else { return nil }
        return ReplayEvent(type: p.type, team: p.team, t: t, period: p.period ?? 0, player: p.player, goalType: p.goalType, lengthSec: p.lengthSec)
    }
}

/// "23'" at a time since a period's kickoff; TMR-15: on a clock that stops, the clock's minute, standing still through its stops.
private func replayMinute(_ m: Match, _ record: MatchRecord, period: Int, elapsedSec: Int) -> String {
    let stops = clockStopsOf(record)
    return matchMinute(m.format, period: period, periodSec: stops.isEmpty ? elapsedSec : clockOfElapsed(stops[period], elapsedSec))
}

private func pitchFrame(of p: PitchOutline) -> PitchFrame? {
    guard let list = p.corners.array, list.count == 2, let a = list[0]["lat"]?.double, let aLon = list[0]["lon"]?.double,
          let b = list[1]["lat"]?.double, let bLon = list[1]["lon"]?.double else { return nil }
    return .from(a: Position(lat: a, lon: aLon), b: Position(lat: b, lon: bLon), centre: p.centre)
}

/// TRK-9: who attacked from each end of the heatmap, as the website's TrackSection and Android's work it
/// out from the track the server sent (its pitch, and for an assistant where they were in the periods):
/// for the match, a row for each way round; for one period of normal time, its row; none for extra
/// time, or without the kickoff direction from the watch.
func heatEndsOf(_ m: Match, _ record: MatchRecord, track: MatchTrack?, pitch: PitchOutline?) -> (Int?) -> [HeatEnds] {
    let none: (Int?) -> [HeatEnds] = { _ in [] }
    guard let direction = record.kickoffDirection, let pitch, let frame = pitchFrame(of: pitch) else { return none }
    let assistant = m.role == "ar1" || m.role == "ar2"
    var across: [Double] = []
    if assistant, let track, let gps = track.gps {
        let ms = { (s: String?) -> Int? in instantOf(s).map { Int($0.timeIntervalSince1970 * 1000) } }
        let start = ms(track.start) ?? 0
        // The periods' windows on the track's clock, as schema's periodWindowsOf, without time play was suspended (TMR-13); the whole track without start times.
        let windows = playSpans(record.periods, start: start).map { ($0.from, $0.to) }
        across = gps.t.indices.filter { i in windows.isEmpty || windows.contains { gps.t[i] >= $0.0 && gps.t[i] <= $0.1 } }
            .map { frame.toPitch(lat: gps.lat[$0], lon: gps.lon[$0]).y }
    }
    let turned = pitchTurned(role: m.role, acrossInPeriods: across, bearingDeg: direction.bearingDeg, ux: frame.ux, uy: frame.uy)
    let periods = m.format.periods
    let ends = pitchEnds(periods: periods, team: direction.team, bearingDeg: direction.bearingDeg, ux: frame.ux, uy: frame.uy, turned: turned)
    func team(_ side: String) -> Team { side == "home" ? m.home : m.away }
    return { period in
        let rows = period == nil ? endsByWayRound(ends, periods: periods)
            : ends.filter { $0.period == period }.map { EndsRow(label: endsLabel($0.period, periods: periods), left: $0.left, right: $0.right) }
        return rows.map { HeatEnds(label: $0.label, left: team($0.left), leftHome: $0.left == "home", right: team($0.right), rightHome: $0.right == "home") }
    }
}

private func coords(_ points: [LatLon]) -> [CLLocationCoordinate2D] {
    points.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
}

struct TrackSection: View {
    let m: Match
    let record: MatchRecord
    let data: TrackData
    let unit: String
    let reload: () -> Void

    var body: some View {
        if data.track.gps != nil {
            MapAndReplay(m: m, record: record, track: data.track, outline: data.pitch, unit: unit, sprintKph: data.summary.sprintKph, reload: reload)
        }
        if (data.track.heartRate?.t.count ?? 0) > 1 {
            HeartRateCard(m: m, record: record, track: data.track, summary: data.summary)
        }
    }
}

private struct MapAndReplay: View {
    let m: Match
    let record: MatchRecord
    let track: MatchTrack
    let outline: PitchOutline?
    let unit: String
    let sprintKph: Double
    let reload: () -> Void
    @Environment(AppGraph.self) private var graph
    @Environment(\.accessibilityReduceMotion) private var lessMotion
    @State private var speedLines: [SpeedStretch] = []
    @State private var replay: TrackReplay?
    @State private var routes: [[LatLon]] = []
    @State private var position: Int?
    @State private var playing = false
    @State private var speed = 30
    @State private var banner: ReplayEvent?
    @State private var holdUntil = Date.distantPast
    @State private var adjusting: PitchFrame?
    @State private var saving = false
    @State private var picked: ReplayEvent?
    @State private var camera: MapCameraPosition = .automatic
    /// Counts the map's moves, so the pitch being adjusted is drawn again where the map now puts it.
    @State private var cameraMoves = 0

    private var saved: PitchFrame? { outline.flatMap { pitchFrame(of: $0) } }

    private func fit() {
        let all = (routes + (saved?.lines ?? [])).flatMap { $0 }
        guard let latLo = all.map(\.lat).min(), let latHi = all.map(\.lat).max(), let lonLo = all.map(\.lon).min(), let lonHi = all.map(\.lon).max() else { return }
        camera = .region(MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: (latLo + latHi) / 2, longitude: (lonLo + lonHi) / 2),
            span: MKCoordinateSpan(latitudeDelta: max((latHi - latLo) * 1.25, 0.001), longitudeDelta: max((lonHi - lonLo) * 1.25, 0.001))
        ))
    }

    private func save(_ f: PitchFrame) async {
        saving = true
        defer { saving = false }
        let c = f.fromPitch(x: -f.lengthM / 2, y: -f.widthM / 2)
        let d = f.fromPitch(x: f.lengthM / 2, y: -f.widthM / 2)
        let point = { (lat: Double, lon: Double) -> JSONValue in .object(["lat": .double(lat), "lon": .double(lon)]) }
        let body: JSONValue = .object(["corners": .array([point(c.lat, c.lon), point(d.lat, d.lon)]), "centre": point(f.centreLat, f.centreLon)])
        if (try? await graph.api.call("PUT", "/v1/match-records/\(record.id)/track/pitch", body: body)) != nil {
            adjusting = nil
            reload()
        }
    }

    /// The replay moving: a little at a time, and once a second with reduced motion (the web's too).
    private func play(_ replay: TrackReplay) async {
        let tick: TimeInterval = lessMotion ? 1 : 1.0 / 15
        while playing, !Task.isCancelled {
            try? await Task.sleep(for: .seconds(tick))
            if Date() < holdUntil { continue }
            banner = nil
            let from = position ?? 0
            let next = min(from + Int(tick * 1000) * speed, replay.length)
            // Reaching a goal or card: stop on it, and hold there with its banner.
            if let stop = replay.stopBetween(from, next) {
                position = replay.positionAt(stop.t)
                banner = stop
                holdUntil = Date().addingTimeInterval(stop.goal ? TrackReplay.holdGoal : TrackReplay.holdCard)
            } else {
                position = next
                if next >= replay.length { playing = false }
            }
        }
    }

    var body: some View {
        SectionTitle("Where you went")
        LfCard {
            if let replay {
                let cursor = position.map(replay.trackTimeAt)
                let moment = cursor.map(replay.at)
                map(replay, cursor: cursor, moment: moment)
                    .overlay(alignment: .topLeading) {
                        if let cursor, adjusting == nil { readout(replay, cursor: cursor, moment: moment) }
                    }
                    .overlay(alignment: .bottom) {
                        if let banner, adjusting == nil { bannerView(replay, banner).padding(10) }
                    }
                VStack(alignment: .leading, spacing: 10) {
                    if !speedLines.isEmpty && adjusting == nil { speedLegend }
                    if adjusting != nil { adjustControls } else { controls(replay) }
                }
                .padding(14)
            }
        }
        .task(id: "\(record.id)") {
            let made = TrackReplay(track: track, periods: record.periods, events: eventsOf(record, track: track), sprintKph: sprintKph)
            replay = made
            routes = made.routes()
            speedLines = made.speedLinesForMap()
            fit()
        }
        .task(id: "\(playing)-\(speed)") {
            if playing, let replay { await play(replay) }
        }
    }

    private func map(_ replay: TrackReplay, cursor: Int?, moment: Moment?) -> some View {
        MapReader { proxy in
            Map(position: $camera, interactionModes: [.pan, .zoom]) {
                // While it's adjusted, the pitch is drawn over the map instead (adjustLayer).
                if adjusting == nil {
                    ForEach(Array((saved?.lines ?? []).enumerated()), id: \.offset) { _, line in
                        MapPolyline(coordinates: coords(line)).stroke(LF.text.opacity(0.8), lineWidth: 1.5)
                    }
                }
                ForEach(Array(routes.enumerated()), id: \.offset) { _, route in
                    MapPolyline(coordinates: coords(route)).stroke(LF.brand.opacity(0.45), lineWidth: 2)
                }
                // TRK-5: in their speed bands, faint under a replay's trail (TRK-10).
                ForEach(Array(speedLines.enumerated()), id: \.offset) { _, line in
                    MapPolyline(coordinates: coords(line.points)).stroke(LF.speed[line.band].opacity(cursor == nil ? 1 : 0.3), lineWidth: 2.5)
                }
                if let cursor {
                    if speedLines.isEmpty {
                        MapPolyline(coordinates: coords(replay.trail(cursor))).stroke(LF.brand, lineWidth: 4)
                    } else {
                        ForEach(Array(replay.trailStretches(cursor).enumerated()), id: \.offset) { _, piece in
                            MapPolyline(coordinates: coords(piece.points)).stroke(LF.speed[piece.band], lineWidth: 4)
                        }
                    }
                }
                if let lat = moment?.lat, let lon = moment?.lon {
                    Annotation("", coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)) {
                        Circle().fill(LF.brand).frame(width: 14, height: 14).overlay(Circle().stroke(.white, lineWidth: 2))
                    }
                    .annotationTitles(.hidden)
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .mapControlVisibility(.hidden)
            .toolbarBackground(.automatic, for: .navigationBar, .tabBar)
            .onMapCameraChange(frequency: .continuous) { cameraMoves += 1 }
            .overlay {
                if let f = adjusting { adjustLayer(f, proxy: proxy) }
            }
        }
        .frame(height: 300)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    /// TRK-14: the pitch being adjusted and its handles, over the map rather than in it. MapKit swaps its
    /// lines for new ones on every move of a finger, and they blinked out while it did.
    private func adjustLayer(_ f: PitchFrame, proxy: MapProxy) -> some View {
        let _ = cameraMoves
        let point = { (p: LatLon) in proxy.convert(CLLocationCoordinate2D(latitude: p.lat, longitude: p.lon), to: .local) }
        return ZStack {
            Path { path in
                for line in f.lines {
                    let points = line.compactMap(point)
                    guard let first = points.first else { continue }
                    path.move(to: first)
                    points.dropFirst().forEach { path.addLine(to: $0) }
                }
            }
            .stroke(LF.brand.opacity(0.8), lineWidth: 1.5)
            .allowsHitTesting(false)
            handle("Move the pitch", point((f.centreLat, f.centreLon)), main: true, proxy: proxy) { lat, lon in adjusting = adjusting?.moved(lat: lat, lon: lon) }
            handle("Turn the pitch and change its length", point(f.fromPitch(x: f.lengthM / 2, y: 0)), main: false, proxy: proxy) { lat, lon in adjusting = adjusting?.withEnd(lat: lat, lon: lon) }
            handle("Change the pitch's width", point(f.fromPitch(x: 0, y: f.widthM / 2)), main: false, proxy: proxy) { lat, lon in adjusting = adjusting?.withSide(lat: lat, lon: lon) }
        }
    }

    @ViewBuilder
    private func handle(_ label: String, _ at: CGPoint?, main: Bool, proxy: MapProxy, onDrag: @escaping (Double, Double) -> Void) -> some View {
        if let at {
            Circle().fill(main ? LF.brand : .white).frame(width: 30, height: 30)
                .overlay(Circle().stroke(main ? .white : LF.brand, lineWidth: 3))
                .frame(width: 44, height: 44)
                .contentShape(Circle())
                .highPriorityGesture(DragGesture(coordinateSpace: .global).onChanged { value in
                    if let c = proxy.convert(value.location, from: .global) { onDrag(c.latitude, c.longitude) }
                })
                .accessibilityLabel(label)
                .position(at)
        }
    }

    private func readout(_ replay: TrackReplay, cursor: Int, moment: Moment?) -> some View {
        let score = replay.scoreAt(cursor)
        return VStack(alignment: .leading, spacing: 1) {
            if let span = replay.spanAt(cursor) {
                Text("\(replayMinute(m, record, period: span.period, elapsedSec: (cursor - span.from + span.played) / 1000)) · \(periodName(m.format, period: span.period))").font(.lfLabelSmall).foregroundStyle(LF.muted)
            }
            Text("\(teamAlias(m.home, other: m.away, home: true)) \(score.home)–\(score.away) \(teamAlias(m.away, other: m.home, home: false))").font(.lfTitleSmall).foregroundStyle(LF.text)
            let parts = [moment?.bpm.map { "\($0) bpm" }, moment?.speedMps.map { formatSpeed($0, unit: unit) }].compactMap { $0 }
            if !parts.isEmpty { Text(parts.joined(separator: " · ")).font(.lfLabelSmall).foregroundStyle(LF.muted) }
            if moment?.noGps == true { Text("No GPS here").font(.lfLabelSmall).foregroundStyle(LF.muted) }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(LF.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: 8))
        .padding(8)
    }

    private func bannerView(_ replay: TrackReplay, _ e: ReplayEvent) -> some View {
        // A goal in the team's color; a team without one gets the page's own box, with a brand edge.
        let kit = e.goal ? parseColor((e.team == "home" ? m.home : m.away).colour) : nil
        let fill = kit?.color ?? (e.goal ? LF.surface : e.yellow ? LF.yellow : LF.red)
        let ink: Color = kit.map(textOn) ?? (e.goal ? LF.text : e.yellow ? .black : .white)
        let score = replay.scoreAt(e.t)
        var title = e.title
        if e.goalType == "penalty" { title += " · Penalty" } else if e.goalType == "ownGoal" { title += " · Own goal" } else if e.goalType == "directFreeKick" { title += " · Free kick" }
        let team = teamName(e.team == "home" ? m.home : m.away, home: e.team == "home")
        // EVT-12: how long a sin bin is; a second sin bin is a send-off, so none.
        let length = e.type == "sinBin" ? e.lengthSec.map { "\(minutesText($0)) min" } : nil
        let line = [team, e.player.map { "#\($0)" }, e.goal ? "\(teamAlias(m.home, other: m.away, home: true)) \(score.home)–\(score.away) \(teamAlias(m.away, other: m.home, home: false))" : nil, length].compactMap { $0 }.joined(separator: " · ")
        return VStack(alignment: .leading, spacing: 1) {
            Text(title).font(.lfHeadlineSmall).foregroundStyle(ink)
            Text(line).font(.lfBodySmall).foregroundStyle(ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(fill, in: RoundedRectangle(cornerRadius: 6))
        // So a white or map-colored kit still has an edge, and the plain box looks like a goal.
        .overlay {
            if e.goal { RoundedRectangle(cornerRadius: 6).stroke(kit == nil ? LF.brand : ink.opacity(0.25), lineWidth: kit == nil ? 2 : 1) }
        }
    }

    private var adjustControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Drag the middle to move the pitch, the end of a goal line to turn it and change its length, the side to change its width.").font(.lfBodySmall).foregroundStyle(LF.muted)
            HStack(spacing: 8) {
                PrimaryButton(saving ? "Saving…" : "Save pitch", enabled: !saving) {
                    if let f = adjusting { Task { await save(f) } }
                }
                SecondaryButton("Cancel") { adjusting = nil }
                if outline?.by == "referee" {
                    SecondaryButton("Use the one found") {
                        Task {
                            _ = try? await graph.api.call("DELETE", "/v1/match-records/\(record.id)/track/pitch")
                            adjusting = nil
                            reload()
                        }
                    }
                }
            }
        }
    }

    private func controls(_ replay: TrackReplay) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                if position == nil {
                    PrimaryButton("Replay", icon: .play) {
                        position = 0
                        playing = true
                    }
                } else {
                    SecondaryButton(playing ? "Pause" : "Play", icon: playing ? .pause : .play) {
                        if !playing, (position ?? 0) >= replay.length { position = 0 }
                        playing.toggle()
                    }
                }
                VStack(spacing: 2) {
                    ticks(replay)
                    Slider(value: Binding(get: { Double(position ?? 0) }, set: { value in
                        position = Int(value)
                        banner = nil
                        picked = nil
                        holdUntil = .distantPast
                    }), in: 0...Double(max(replay.length, 1)))
                    .tint(LF.brand)
                    .accessibilityLabel("Replay position")
                }
            }
            if let picked { Text(words(replay, picked)).font(.lfBodySmall).foregroundStyle(LF.muted) }
            if position == nil { Text("Plays the periods, skipping breaks").font(.lfBodySmall).foregroundStyle(LF.muted) }
            HStack(spacing: 10) {
                Segmented(options: [10, 30, 60, 120].map { ($0, "\($0)×") }, selected: $speed).fixedSize()
                Spacer(minLength: 0)
                if position != nil {
                    SecondaryButton("Stop") {
                        playing = false
                        position = nil
                        banner = nil
                    }
                }
            }
            let start = saved ?? routes.first?.first.map { PitchFrame.of($0.lat, $0.lon, bearing: 0, lengthM: 100, widthM: 64) }
            if let start {
                Button {
                    playing = false
                    position = nil
                    adjusting = start
                } label: {
                    HStack(spacing: 6) {
                        PhIcon(.pin, size: 14, tint: LF.brandStrong)
                        Text(saved == nil ? "Mark the pitch on the map" : "Adjust the pitch on the map").font(.lfLabelMedium).foregroundStyle(LF.brandStrong)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func kit(_ team: String) -> Color {
        parseColor(team == "home" ? m.home.colour : m.away.colour)?.color ?? LF.brand
    }

    /// Walking to sprinting, for the route's colors (TRK-5).
    private var speedLegend: some View {
        HStack(spacing: 6) {
            Text("Walking").font(.lfBodySmall).foregroundStyle(LF.muted)
            ForEach(0..<LF.speed.count, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2).fill(LF.speed[i]).frame(width: 18, height: 5)
            }
            Text("Sprinting").font(.lfBodySmall).foregroundStyle(LF.muted)
        }
    }

    /// The goals and cards above the scrubber: a tap goes to the nearest.
    private func ticks(_ replay: TrackReplay) -> some View {
        GeometryReader { geo in
            let scale = geo.size.width / Double(max(replay.length, 1))
            ZStack(alignment: .leading) {
                ForEach(replay.boundaries, id: \.self) { b in
                    Rectangle().fill(LF.border).frame(width: 1, height: 14).offset(x: Double(b) * scale)
                }
                ForEach(replay.events) { e in
                    if e.goal {
                        // TRK-15: a goal is round, in its team's color with a ring for white and black kits; a card is upright.
                        Circle().fill(kit(e.team)).overlay(Circle().stroke(LF.text, lineWidth: 1.5))
                            .frame(width: 9, height: 9).offset(x: Double(replay.positionAt(e.t)) * scale - 4.5)
                    } else {
                        RoundedRectangle(cornerRadius: 2).fill(e.yellow ? LF.yellow : LF.red)
                            // EVT-12: a sin bin is the yellow mark with a dark waist, as its card carries the hourglass (the website's .tick-sinBin).
                            .overlay { if e.type == "sinBin" { Rectangle().fill(LF.onYellow).frame(height: 2.4) } }
                            .frame(width: 6, height: 10).offset(x: Double(replay.positionAt(e.t)) * scale - 3)
                    }
                }
            }
            .frame(width: geo.size.width, height: 14, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture { at in
                if let near = replay.events.min(by: { abs(Double(replay.positionAt($0.t)) * scale - at.x) < abs(Double(replay.positionAt($1.t)) * scale - at.x) }), abs(Double(replay.positionAt(near.t)) * scale - at.x) < 18 {
                    picked = near
                    position = replay.positionAt(near.t)
                    banner = nil
                    holdUntil = .distantPast
                }
            }
        }
        .frame(height: 14)
    }

    private func words(_ replay: TrackReplay, _ e: ReplayEvent) -> String {
        let what = e.title
        let minute = replay.spanAt(e.t).map { replayMinute(m, record, period: $0.period, elapsedSec: (e.t - $0.from + $0.played) / 1000) }
        return [minute, what, teamName(e.team == "home" ? m.home : m.away, home: e.team == "home")].compactMap { $0 }.joined(separator: " · ")
    }
}

private struct HeartRateCard: View {
    let m: Match
    let record: MatchRecord
    let track: MatchTrack
    let summary: TrackSummary
    @Environment(\.colorScheme) private var scheme
    @State private var at: Int?

    private var ramp: [Color] {
        (scheme == .dark ? [0x8A3311, 0xB8481A, 0xD95926, 0xEC8257, 0xF4A77F] : [0xF29A6C, 0xEA7440, 0xD0561F, 0xA8441A, 0x7C3112]).map { Color(uiColor: UIColor(hex: $0)) }
    }

    var body: some View {
        if let hr = track.heartRate, let first = hr.t.first, let last = hr.t.last {
            let start = Int((instantOf(track.start)?.timeIntervalSince1970 ?? 0) * 1000)
            // TMR-13: a period suspended part way is two bands.
            let windows = playSpans(record.periods, start: start).map { (period: $0.period, from: $0.from, to: $0.to, played: $0.played) }
            let x0 = max(first, (windows.first?.from ?? first) - 60_000)
            let x1 = min(last, (windows.last?.to ?? last) + 60_000)
            let points = Self.bin(hr, x0: x0, x1: x1)
            let shown = points.compactMap { $0?.bpm }
            if let lowest = shown.min(), let highest = shown.max(), x1 > x0 {
                let lo = max(40, ((lowest - 5) / 10).rounded(.down) * 10)
                let hi = ((highest + 5) / 10).rounded(.up) * 10
                let step = hi - lo > 60 ? 20.0 : 10.0
                SectionTitle("Heart rate")
                LfCard(padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(reading(points, windows)).font(.lfBodySmall).foregroundStyle(LF.muted)
                        HStack(alignment: .top, spacing: 4) {
                            VStack(alignment: .leading) {
                                ForEach(Array(stride(from: hi, through: lo, by: -step)), id: \.self) { v in
                                    if v != hi { Spacer(minLength: 0) }
                                    Text("\(Int(v))").font(.lfLabelSmall).foregroundStyle(LF.muted)
                                }
                            }
                            .frame(width: 28, height: 150)
                            chart(points, windows, x0: x0, x1: x1, lo: lo, hi: hi, step: step)
                        }
                        if let zones = summary.total.zones, zones.contains(where: { $0.sec > 0 }) { zoneList(zones) }
                    }
                }
            }
        }
    }

    private static func bin(_ hr: HeartRateSeries, x0: Int, x1: Int) -> [(t: Double, bpm: Double)?] {
        // A point every so often: each the average of the readings in its slice of time.
        let n = 160
        let slice = max(1, Double(x1 - x0) / Double(n))
        var sums = [Double](repeating: 0, count: n)
        var counts = [Int](repeating: 0, count: n)
        for (i, t) in hr.t.enumerated() {
            let k = Int((Double(t - x0) / slice).rounded(.down))
            if k >= 0, k < n {
                sums[k] += Double(hr.bpm[i])
                counts[k] += 1
            }
        }
        return (0..<n).map { k in counts[k] > 0 ? (Double(x0) + (Double(k) + 0.5) * slice, sums[k] / Double(counts[k])) : nil }
    }

    private func reading(_ points: [(t: Double, bpm: Double)?], _ windows: [(period: Int, from: Int, to: Int, played: Int)]) -> String {
        guard let at, let point = points[at] else { return "Touch the chart to read it" }
        let time = Int(point.t)
        let where_ = windows.first { time >= $0.from && time <= $0.to }.map { " · \(replayMinute(m, record, period: $0.period, elapsedSec: (time - $0.from + $0.played) / 1000)) · \(periodName(m.format, period: $0.period))" } ?? ""
        return "\(Int(point.bpm)) bpm\(where_)"
    }

    private func chart(_ points: [(t: Double, bpm: Double)?], _ windows: [(period: Int, from: Int, to: Int, played: Int)], x0: Int, x1: Int, lo: Double, hi: Double, step: Double) -> some View {
        Canvas { c, size in
            let x = { (t: Double) in (t - Double(x0)) / Double(x1 - x0) * size.width }
            let y = { (b: Double) in (1 - (b - lo) / (hi - lo)) * size.height }
            for w in windows {
                c.fill(Path(CGRect(x: x(Double(w.from)), y: 0, width: x(Double(w.to)) - x(Double(w.from)), height: size.height)), with: .color(LF.surface2))
            }
            for v in stride(from: lo, through: hi, by: step) {
                c.stroke(Path { $0.move(to: CGPoint(x: 0, y: y(v))); $0.addLine(to: CGPoint(x: size.width, y: y(v))) }, with: .color(LF.border), lineWidth: 0.5)
            }
            var path = Path()
            var pen = false
            for p in points {
                guard let p else {
                    pen = false
                    continue
                }
                if pen { path.addLine(to: CGPoint(x: x(p.t), y: y(p.bpm))) } else { path.move(to: CGPoint(x: x(p.t), y: y(p.bpm))) }
                pen = true
            }
            c.stroke(path, with: .color(ramp[scheme == .dark ? 3 : 2]), lineWidth: 1.5)
            if let at, let p = points[at] {
                c.stroke(Path { $0.move(to: CGPoint(x: x(p.t), y: 0)); $0.addLine(to: CGPoint(x: x(p.t), y: size.height)) }, with: .color(LF.brand), lineWidth: 1)
                c.fill(Path(ellipseIn: CGRect(x: x(p.t) - 4, y: y(p.bpm) - 4, width: 8, height: 8)), with: .color(LF.brand))
            }
        }
        .frame(height: 150)
        .contentShape(Rectangle())
        .overlay {
            GeometryReader { geo in
                Color.clear.contentShape(Rectangle()).gesture(DragGesture(minimumDistance: 0).onChanged { value in
                    at = min(max(Int(value.location.x / geo.size.width * Double(points.count)), 0), points.count - 1)
                }.onEnded { _ in at = nil })
            }
        }
        .accessibilityLabel("Heart rate through the match")
    }

    private func zoneList(_ zones: [TrackSummaryTotalZonesItem]) -> some View {
        let total = zones.reduce(0) { $0 + $1.sec }
        return VStack(alignment: .leading, spacing: 6) {
            Text("Time in each zone").font(.lfLabelMedium).foregroundStyle(LF.text)
            GeometryReader { geo in
                HStack(spacing: 0) {
                    ForEach(Array(zones.enumerated()), id: \.offset) { i, z in
                        ramp[i % ramp.count].frame(width: geo.size.width * z.sec / max(total, 1))
                    }
                }
            }
            .frame(height: 10)
            .clipShape(Capsule())
            ForEach(Array(zones.enumerated()), id: \.offset) { i, z in
                let to = i + 1 < zones.count ? "–\(zones[i + 1].fromBpm - 1) bpm" : " bpm and up"
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 2).fill(ramp[i % ramp.count]).frame(width: 10, height: 10)
                    Text("Zone \(z.zone)").font(.lfBodySmall).foregroundStyle(LF.text)
                    Text("\(z.fromBpm)\(to)").font(.lfBodySmall).foregroundStyle(LF.muted)
                    Spacer(minLength: 0)
                    Text(z.sec >= 60 ? "\(Int(z.sec / 60)) min" : "\(Int(z.sec)) s").font(.lfBodySmall).foregroundStyle(LF.muted)
                }
            }
        }
    }
}
