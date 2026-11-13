import SwiftUI

// One match (IOS-4): the scoreboard and weather, the fee with its Paid switch, the details, the
// crew, the events once played, the track's figures, photos, and sharing the report or a link.

struct MatchScreen: View {
    let id: String
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @State private var weather: MatchWeather?
    @State private var track: TrackSummary?
    @State private var heat: Heat?
    /// TRK-9: the heatmap's ends, worked out from the track's pitch.
    @State private var heatEnds: ((Int?) -> [HeatEnds])?
    /// TRK-14: all of it, for the map, replay and heart rate; again when the pitch changes.
    @State private var trackData: TrackData?
    @State private var trackTurn = 0
    /// TRK-14: the track couldn't be fetched (no signal), so it's asked for again after the next sync.
    @State private var trackMissed = false
    @State private var shareURL: ShareItem?
    /// RES-3: showing the watch's own recording, and putting it back.
    @State private var asRecorded = false
    @State private var reverting = false

    private func recorded(_ r: MatchRecord) -> MatchRecord {
        guard let o = r.original else { return r }
        var shown = r
        shown.outcome = o.outcome
        shown.events = o.events
        return shown
    }

    /// The server sees the watch's recording and clears the correction (RES-3).
    private func revert(_ r: MatchRecord) {
        guard let o = r.original else { return }
        var back = r
        back.outcome = o.outcome
        back.events = o.events
        back.goldenGoal = o.goldenGoal
        back.score = MatchRecordScore(home: o.score.home, away: o.score.away)
        back.penalties = o.penalties.map { MatchRecordPenalties(home: $0.home, away: $0.away) }
        asRecorded = false
        Task {
            await graph.records.save(Collections.matchRecords, id: back.id, back)
            graph.requestSync(delay: 0)
        }
    }

    var body: some View {
        if let m = graph.records.match(id) {
            content(m)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        BarIcon(icon: .edit, label: "Edit") { nav.sheet = .match(id) }
                    }
                }
                .sheet(item: $shareURL) { ActivitySheet(items: [$0.url]) }
        } else {
            Page("Match", large: false) { LoadingPitch() }
        }
    }

    private func content(_ stored: Match) -> some View {
        let records = graph.records
        let record = records.matchRecords.first { $0.matchId == id }
        // Q-20: its periods named as they were played.
        let m = asPlayed(match: stored, record)
        let venue = records.venue(m.venueId)
        let pitch = venue?.pitches.first { $0.id == m.pitchId }
        let position = pitch?.position ?? venue?.position
        let competition = records.competition(m.competitionId)
        let kickoff = instantOf(m.kickoff)
        let zone = zoneOf(m)
        let unit = records.effectiveSettings.distanceUnit
        // The kickoff is in the scoreboard until the match is played; then the day goes here.
        let sub = [competition?.name, record == nil ? nil : kickoff.map { formatShortDay($0, zone: zone) }].compactMap { $0 }.joined(separator: " · ")
        return Page(m.name ?? matchTitle(m), sub: sub.isEmpty ? nil : sub, large: false) {
            // The page's actions under its title, as outlines (WEB-24).
            Flow(spacing: 8) {
                if let record {
                    // DATA-6: the match's name when it has no competition, as the website's MatchReport.tsx.
                    ShareLink(item: reportText(m, record, competition: competition?.name ?? (m.competitionId == nil ? m.name : nil), venue: venue?.name, pitch: pitch?.name, you: graph.session.name ?? "You", referees: records.referees ?? []), subject: Text("Match report: \(matchTitle(m))")) {
                        SecondaryLabel(text: "Report", icon: .report)
                    }
                    .buttonStyle(PressStyle())
                }
                SecondaryButton("Share link", icon: .share) {
                    Task {
                        if let url = try? await graph.api.call("POST", "/v1/matches/\(m.id)/share", body: .object([:]))?["url"]?.string, let link = URL(string: url) {
                            shareURL = ShareItem(url: link)
                        }
                    }
                }
                if let position {
                    SecondaryButton("Directions", icon: .directions) {
                        graph.openDirections(lat: position.lat, lon: position.lon)
                    }
                }
            }
            .padding(.bottom, 18)
            Scoreboard(m: m, record: record, distance: track?.total.distanceM ?? record?.distanceM, unit: unit)
            // WX-9, WX-5, WEB-28: on a slab under the scoreboard, its details a tap away.
            if let w = weather ?? graph.weather.byMatch[m.id] {
                WeatherSlab(w: w, units: records.units).padding(.top, 30)
            }
            // The match (WEB-24): a chalk panel with the pitch's corners: the kickoff, fee and periods as
            // figures between heavy rules, then the details, the fee with its Paid switch last.
            MatchPanel(m: m, kickoff: kickoff, zone: zone, facts: details(m, venue: venue, pitch: pitch, kickoff: kickoff, zone: zone)) {
                if let fee = m.fee {
                    Hairline().padding(.horizontal, 16)
                    ToggleRow("Fee \(money(fee.amount, fee.currency))", sub: fee.paid ? "Paid" : "Not paid yet", divider: false, isOn: Binding(get: { fee.paid }, set: { paid in
                        var changed = stored
                        changed.fee?.paid = paid
                        Task { await records.save(Collections.matches, id: m.id, changed) }
                    }))
                }
            }
            .padding(.top, 24)
            if let record {
                SectionTitle(text: "Events") {
                    Button { nav.sheet = .result(id) } label: {
                        SecondaryLabel(text: "Edit result", icon: .edit)
                    }
                    .buttonStyle(PressStyle())
                }
                // RES-3: the watch's own recording in place of the corrected one.
                Timeline(m: m, r: asRecorded ? recorded(record) : record)
                if let edited = record.editedAt {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(asRecorded ? "As the watch recorded it" : "Edited after the match, \(instantOf(edited).map { formatShortDay($0, zone: zone) } ?? "")")
                            .font(.lfBodySmall).foregroundStyle(LF.muted)
                        if record.original != nil {
                            Flow(spacing: 16) {
                                LinkButton(asRecorded ? "Show the corrected result" : "Show as recorded") { asRecorded.toggle() }
                                LinkButton("Put back the watch's") { reverting = true }
                            }
                        }
                    }
                    .padding(.top, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } else if m.status == "played" || m.status == "abandoned" || (kickoff.map { $0 < AppClock.now } ?? false) {
                // RES-2: refereed without the watch, the result can be entered here.
                PrimaryButton("Add result", icon: .plus) { nav.sheet = .result(id) }.padding(.top, 18)
            }
            SectionTitle("Officials")
            CrewTiles(m: m)
            if let t = track {
                SectionTitle("Your track")
                TrackFigures(t: t, unit: unit).padding(.top, 6)
            }
            if let record, let trackData {
                TrackSection(m: m, record: record, data: trackData, unit: unit) { trackTurn += 1 }
                    .id(trackTurn)
            }
            if let h = heat {
                // WEB-28: on its slab, whose tab is its heading. TRK-9: as the website says it: an assistant's touchline at the bottom; as referee, with the
                // kickoff direction from the watch, which way the first kickoff team attacked (teams change
                // ends each period of normal time; extra time has its own toss).
                let assistant = m.role == "ar1" || m.role == "ar2"
                let kicker = record?.kickoffDirection.map { $0.team == "home" ? teamAlias(m.home, other: m.away, home: true) : teamAlias(m.away, other: m.home, home: false) }
                // TRK-9: under the drawing, each end's team, so a period's own line would say it twice.
                HeatmapCard(heat: h, format: m.format, unit: unit, ends: heatEnds ?? { _ in [] }) { period in
                    if assistant { return "Your touchline at the bottom" }
                    guard let kicker, period == nil else { return nil }
                    return "\(kicker) kicked off attacking →"
                }
                .padding(.top, 30)
            }
            PhotosSection(recordType: "match", recordId: m.id).padding(.top, 8)
        }
        .confirm("Put back the watch's?", isPresented: $reverting, message: "What the watch recorded comes back, and your corrections to the goals, cards and outcome go.", action: "Put back") {
            if let record { revert(record) }
        }
        .backTitle("Match · \(m.name ?? matchTitle(m))")
        .refreshable { await graph.pullToSync() }
        .task(id: id) {
            weather = try? await graph.api.call("GET", "/v1/weather/\(id)")?.decoded(as: MatchWeather.self)
        }
        .task(id: "\(record?.id ?? "")-\(trackTurn)") {
            guard let r = record else { return }
            let answer: JSONValue?
            do {
                answer = try await graph.api.call("GET", "/v1/match-records/\(r.id)/track")
                trackMissed = false
            } catch let error as ServerError where error.status != 0 {
                // The server's own answer (404: no track) is final.
                trackMissed = false
                return
            } catch {
                // Not reaching the server isn't: what's shown stays, and the next sync that reaches it asks again.
                trackMissed = !Task.isCancelled
                return
            }
            guard let body = answer else { return }
            track = try? body["summary"]?.decoded(as: TrackSummary.self)
            heat = try? body["heat"]?.decoded(as: Heat.self)
            let full = try? body["track"]?.decoded(as: MatchTrack.self)
            let outline = try? body["pitch"]?.decoded(as: PitchOutline.self)
            if let track, let full {
                trackData = TrackData(track: full, summary: track, pitch: outline)
            }
            heatEnds = heatEndsOf(m, r, track: full, pitch: outline)
        }
        // TRK-14: a track that couldn't be fetched is asked for again after the next sync that reaches
        // the server (its lastSync, as Merge's lists follow it); a pull to refresh is one.
        .task(id: graph.session.lastSync) { if trackMissed { trackTurn += 1 } }
    }

    private func details(_ m: Match, venue: Venue?, pitch: Pitch?, kickoff: Date?, zone: TimeZone) -> [Fact] {
        var facts: [Fact] = []
        if let venue { facts.append(Fact(icon: .venues, label: "Venue", value: [venue.name, pitch?.name].compactMap { $0 }.joined(separator: ", "))) }
        if let role = m.role { facts.append(Fact(icon: .role, label: "Your role", value: roleNames[role] ?? role, tone: .brand)) }
        // SYNC-14: whether an upcoming match is on the account's watches, as of the last sync with signal: a
        // scheduled match until three hours after its kickoff (what a watch downloads, SYNC-3), and no report yet.
        let hasReport = graph.records.matchRecords.contains { $0.matchId == m.id }
        if m.status == "scheduled", !hasReport, kickoff.map({ $0 > AppClock.now.addingTimeInterval(-3 * 3600) }) ?? true {
            let lines = OnWatchStore.lines(m.id, graph.onWatch.saved, zone: .current, now: AppClock.now, time: { formatTime($0, zone: .current) }, day: { formatShortDay($0, zone: .current) })
            if !lines.isEmpty {
                facts.append(Fact(icon: .watch, label: "Watch", value: "", lines: lines.map { FactLine(text: $0.text, tone: $0.tone == .old ? .amber : $0.tone == .none ? .plain : nil) }))
            }
        }
        let players = describePlayers(m)
        if !players.isEmpty { facts.append(Fact(icon: .referees, label: "Players", value: players)) }
        facts.append(Fact(icon: .clock, label: "Format", value: describeFormat(m.format)))
        if let kickoff { facts.append(Fact(icon: .calendar, label: "Date", value: formatFullDate(kickoff, zone: zone))) }
        if let outlook = m.outlook { facts.append(Fact(icon: .info, label: "What to expect", value: outlook)) }
        if let tags = m.tags, !tags.isEmpty { facts.append(Fact(icon: .tag, label: "Tags", value: tags.joined(separator: ", "))) }
        if let assignor = m.assignor { facts.append(Fact(icon: .assignor, label: "Assignor", value: assignor)) }
        if let e = m.external { facts.append(Fact(icon: .hash, label: "Match number", value: "\(e.id) (\(e.source))")) }
        if let notes = m.notes { facts.append(Fact(icon: .note, label: "Notes", value: notes)) }
        return facts
    }
}

struct ShareItem: Identifiable {
    let url: URL
    var id: URL { url }
}

/// The native share sheet, for something only known once asked for.
struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// The scoreboard (WEB-24): a board: Full time (or the status, or Kickoff) in mint with the day and
/// time; each team a row, its kit with HOME or AWAY and its score beside it on the board (the side
/// that lost dimmed), or the kickoff time large on the dots before the match; a foot with penalties, a
/// golden goal and how far you ran.
private struct Scoreboard: View {
    let m: Match
    let record: MatchRecord?
    let distance: Double?
    let unit: String

    private func lost(_ home: Bool) -> Bool {
        guard let r = record else { return false }
        let (us, them) = home ? (r.score.home, r.score.away) : (r.score.away, r.score.home)
        guard let p = r.penalties else { return us < them }
        return us < them || (us == them && (home ? p.home < p.away : p.away < p.home))
    }

    var body: some View {
        let kickoff = instantOf(m.kickoff)
        let zone = zoneOf(m)
        let label: String = {
            if let record { return record.outcome == "abandoned" ? "Abandoned" : "Full time" }
            switch m.status {
            case "postponed": return "Postponed"
            case "cancelled": return "Canceled"
            case "abandoned": return "Abandoned"
            case "played": return "Played"
            default: return "Kickoff"
            }
        }()
        Board {
            BoardHead(label, about: kickoff.map { "\(formatShortDay($0, zone: zone)) · \(formatTime($0, zone: zone))" } ?? "Time to be set")
                .padding(.bottom, 12)
            if record == nil, let kickoff {
                let (time, ampm) = timeParts(kickoff, zone: zone)
                HStack(alignment: .lastTextBaseline, spacing: 6) {
                    Text(time).font(.display(68, relativeTo: .largeTitle)).foregroundStyle(LF.onBoardStrong).lineLimit(1)
                    if let ampm { Text(ampm).font(.display(22)).foregroundStyle(LF.onBoardStrong) }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(Dots())
            }
            VStack(spacing: 6) {
                ForEach([true, false], id: \.self) { home in
                    let team = home ? m.home : m.away
                    let ink = kitInk(team)
                    HStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(home ? "HOME" : "AWAY").lfLabel(10.5, spacing: 0.16).foregroundStyle(ink.opacity(0.85))
                            Text(teamName(team, home: home).uppercased()).font(.display(26, relativeTo: .title2)).foregroundStyle(ink).lineLimit(2).minimumScaleFactor(0.8)
                                .accessibilityLabel(teamName(team, home: home))
                        }
                        .padding(.leading, 14).padding(.trailing, 26).padding(.vertical, 12)
                        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
                        .background(kitColor(team))
                        .clipShape(KitCut(home: true, cut: 14))
                        if let record {
                            Text("\(home ? record.score.home : record.score.away)").font(.display(88, relativeTo: .largeTitle))
                                .foregroundStyle(lost(home) ? LF.onBoardDim : LF.onBoardStrong).lineLimit(1).minimumScaleFactor(0.6)
                                .frame(width: 108).padding(.trailing, 8)
                        } else {
                            Color.clear.frame(width: 18)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine)
                }
            }
            let foot = [
                record?.penalties.map { "\($0.home)–\($0.away) on penalties" },
                record?.goldenGoal == true ? "On a golden goal" : nil,
                record != nil ? distance.map { "You covered \(formatDistance($0, unit: unit))" } : nil,
            ].compactMap { $0 }
            if !foot.isEmpty {
                Text(foot.joined(separator: " · ").uppercased()).lfLabel(11, spacing: 0.1).foregroundStyle(LF.onBoardMuted)
                    .padding(.horizontal, 14).padding(.vertical, 12)
            } else {
                Color.clear.frame(height: 12)
            }
        }
    }
}

/// The match (WEB-24): a chalk panel with the pitch's corners: its title, the kickoff, fee and periods
/// as figures between heavy rules, then the facts.
private struct MatchPanel<More: View>: View {
    let m: Match
    let kickoff: Date?
    let zone: TimeZone
    let facts: [Fact]
    @ViewBuilder let more: () -> More

    var body: some View {
        let figures: [(String, String, String?)] = [
            kickoff.map { k in let (t, a) = timeParts(k, zone: zone); return ("Kickoff", t, a) },
            m.fee.map { ("Fee", money($0.amount, $0.currency), nil) },
            (m.format.periods == 2 ? "Halves" : "Periods", "\(m.format.periods)×\(m.format.periodSec / 60)", nil),
        ].compactMap { $0 }
        LfCard {
            VStack(alignment: .leading, spacing: 0) {
                Text("THE MATCH").font(.display(30, relativeTo: .title)).foregroundStyle(LF.text)
                    .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 12)
                    .accessibilityAddTraits(.isHeader)
                VStack(spacing: 0) {
                    Rectangle().fill(LF.text).frame(height: 3)
                    HStack(spacing: 0) {
                        ForEach(Array(figures.enumerated()), id: \.offset) { i, f in
                            if i > 0 { Rectangle().fill(LF.text).frame(width: 3) }
                            VStack(alignment: .leading, spacing: 4) {
                                Text(f.0.uppercased()).lfLabel(10.5, spacing: 0.12).foregroundStyle(LF.muted).lineLimit(1)
                                HStack(alignment: .lastTextBaseline, spacing: 2) {
                                    Text(f.1).font(.display(28)).foregroundStyle(LF.text).lineLimit(1).minimumScaleFactor(0.7)
                                    if let a = f.2 { Text(a).font(.display(12)).foregroundStyle(LF.text) }
                                }
                            }
                            .padding(.leading, i == 0 ? 0 : 10).padding(.trailing, 6).padding(.top, 10).padding(.bottom, 8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Rectangle().fill(LF.text).frame(height: 3)
                }
                .padding(.horizontal, 16)
                Facts(facts: facts).padding(.top, 6)
                more()
                Color.clear.frame(height: 10)
            }
            .overlay(CornerArcs())
        }
    }
}

/// The officials as tile rows (DESIGN.md "Tile rows"): a board tile at the left with the role in black
/// italic capitals (REF, AR1), then a chalk panel with the name and the role; your own row's green
/// You, a saved referee's Call, Text and Email; the whole row opening their page.
private struct CrewTiles: View {
    let m: Match
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        let officials = crewInOrder(m.crew, you: m.role)
        VStack(spacing: 8) {
            if officials.isEmpty {
                Text("No officials listed.").font(.lfBodyMedium).foregroundStyle(LF.muted).frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(Array(officials.enumerated()), id: \.offset) { _, o in
                switch o {
                case .you(let role):
                    TileRow(tile: roleNamesShort[role] ?? role, name: graph.session.name ?? "You", sub: roleNamesInFull[role], you: true)
                case .member(let role, let member):
                    let referee = graph.records.referee(member.refereeId)
                    let name = referee?.name ?? member.name ?? "Unknown"
                    TileRow(tile: roleNamesShort[role] ?? role, name: name, sub: roleNamesInFull[role], action: referee.map { r in { nav.push(.referee(r.id)) } }) {
                        if let referee { ContactButtons(phone: referee.phone, email: referee.email, name: name) }
                    }
                }
            }
        }
    }
}

private struct TileRow<Trailing: View>: View {
    let tile: String
    let name: String
    var sub: String?
    var you = false
    var action: (() -> Void)?
    @ViewBuilder var trailing: () -> Trailing
    @Environment(\.colorScheme) private var scheme

    private var row: some View {
        HStack(spacing: 0) {
            Text(tile.uppercased()).font(.display(22)).foregroundStyle(LF.onBoard).lineLimit(1).minimumScaleFactor(0.7)
                .frame(width: 60).frame(maxHeight: .infinity)
                .background(LF.board)
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.barlow(17, .bold)).foregroundStyle(LF.text).lineLimit(1)
                    if let sub { Text(sub).font(.lfBodySmall).foregroundStyle(LF.muted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if you { Chip("You", tone: .brand) }
                trailing()
            }
            .padding(.leading, 14).padding(.trailing, 10).padding(.vertical, 8)
            .frame(maxHeight: .infinity)
            .background(LF.surface)
            .ground(.panel)
        }
        .frame(minHeight: 60)
        .fixedSize(horizontal: false, vertical: true)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay { if scheme == .dark { RoundedRectangle(cornerRadius: 4).stroke(LF.panelEdge, lineWidth: 1) } }
        .hardDrop(LF.panelShadow, RoundedRectangle(cornerRadius: 4))
    }

    var body: some View {
        if let action {
            Button(action: action) { row }.buttonStyle(PressStyle())
        } else {
            row.accessibilityElement(children: .combine)
        }
    }
}

extension TileRow where Trailing == EmptyView {
    init(tile: String, name: String, sub: String?, you: Bool = false, action: (() -> Void)? = nil) {
        self.init(tile: tile, name: name, sub: sub, you: you, action: action, trailing: { EmptyView() })
    }
}

/// WEB-28: the track's figures as the website's The running: on a slab cut on the diagonal, tagged The
/// periods (or Whole recording without period start times), the first (the distance) huge over its mint
/// bar, the rest as rows, each label beside its figure, as the website's at a phone's width.
private struct TrackFigures: View {
    let t: TrackSummary
    let unit: String

    private struct Figure {
        let label: String
        let value: String
        var caption: String?
    }

    var body: some View {
        let figures: [Figure] = [
            t.total.distanceM.map { Figure(label: "Distance", value: formatDistance($0, unit: unit)) },
            t.total.topSpeedMps.map { Figure(label: "Top speed", value: formatSpeed($0, unit: unit)) },
            t.total.sprints.map { Figure(label: "Sprints", value: "\($0)", caption: sprintsCaption(t.sprintKph, unit: unit)) },
            t.total.avgBpm.map { Figure(label: "Average heart rate", value: "\($0) bpm") },
            t.total.maxBpm.map { Figure(label: "Highest heart rate", value: "\($0) bpm") },
        ].compactMap { $0 }
        if let lead = figures.first {
            Slab(title: "The running", tag: t.covers == "track" ? "Whole recording" : "Playing time only", icon: .sprint, cut: true) {
                VStack(alignment: .leading, spacing: 10) {
                    SlabLabel(lead.label)
                    SlabFigure(text: lead.value, size: 72)
                }
                .accessibilityElement(children: .combine)
                MintBar().padding(.top, 12).padding(.bottom, 18)
                ForEach(figures.dropFirst(), id: \.label) { f in
                    SlabRow(label: f.label, figure: f.value, caption: f.caption)
                }
                if t.covers == "track" {
                    Text("This match report has no period start times, so the figures cover the whole recording, breaks included.")
                        .font(.barlow(13, .medium, relativeTo: .footnote)).foregroundStyle(LF.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, figures.count > 1 ? 8 : 4)
                }
            }
        }
    }
}

// MARK: - Events

private extension Event {
    var whenPlayed: String? {
        switch self {
        case .goal(let e): return e.when
        case .caution(let e): return e.when
        case .secondCaution(let e): return e.when
        case .sendOff(let e): return e.when
        case .sinBin(let e): return e.when
        case .secondSinBin(let e): return e.when
        case .stoppage(let e): return e.when
        case .injury(let e): return e.when
        case .suspension(let e): return e.when
        case .clockAdjusted(let e): return e.when
        case .abandonment(let e): return e.when
        default: return nil
        }
    }

    var periodPlayed: Int? {
        switch self {
        case .goal(let e): return e.period
        case .caution(let e): return e.period
        case .secondCaution(let e): return e.period
        case .sendOff(let e): return e.period
        case .sinBin(let e): return e.period
        case .secondSinBin(let e): return e.period
        case .stoppage(let e): return e.period
        case .injury(let e): return e.period
        case .suspension(let e): return e.period
        case .clockAdjusted(let e): return e.period
        case .abandonment(let e): return e.period
        default: return nil
        }
    }

    var secondsIn: Int? {
        switch self {
        case .goal(let e): return e.periodSec
        case .caution(let e): return e.periodSec
        case .secondCaution(let e): return e.periodSec
        case .sendOff(let e): return e.periodSec
        case .sinBin(let e): return e.periodSec
        case .secondSinBin(let e): return e.periodSec
        case .stoppage(let e): return e.periodSec
        case .injury(let e): return e.periodSec
        case .suspension(let e): return e.periodSec
        case .clockAdjusted(let e): return e.periodSec
        case .abandonment(let e): return e.periodSec
        default: return nil
        }
    }
}

/// TMR-14: a clock corrected on the watch, in muted words as a stoppage: "Clock adjusted +0:40", "Added time adjusted −1:05".
func clockAdjustedWords(_ e: EventClockAdjusted) -> String {
    let change = abs(e.changeSec)
    return "\(e.clock == "added" ? "Added time" : "Clock") adjusted \(e.changeSec < 0 ? "\u{2212}" : "+")\(change / 60):\(String(format: "%02d", change % 60))"
}

private let suspensionReasons = ["weather": "Weather", "lightning": "Lightning", "crowdTrouble": "Crowd trouble", "other": "Other reason"]

/// TMR-13: play suspended on the watch and resumed, "Suspended 30:00 · Lightning"; without a length when it never resumed.
func suspensionWords(_ e: EventSuspension) -> String {
    let length = e.lengthSec.map { " \($0 / 60):\(String(format: "%02d", $0 % 60))" } ?? ""
    let note = e.note.flatMap { $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : " · \($0)" } ?? ""
    return "Suspended\(length) · \(suspensionReasons[e.reason] ?? "Other reason")\(note)"
}

/// EVT-12: a sin bin with its player and how long they were off, "Sin bin #7 · 10 min", "Sin bin · 5 min".
func sinBinWords(_ e: EventSinBin) -> String {
    let number: String
    if case .player(let p) = e.offender, let n = shirt(p.number) { number = " \(n)" } else { number = "" }
    return "Sin bin\(number) · \(minutesText(e.lengthSec)) min"
}

private let goalTypeNames = ["goal": "Goal", "directFreeKick": "DFK goal", "penalty": "Penalty goal", "ownGoal": "Own goal"]
private let officialNames = ["headCoach": "Head coach", "assistantCoach": "Assistant coach", "other": "Team official"]

/// EVT-3: a player's number, "#7"; none (or 0, as the website's `!number`) when the watch recorded none.
private func shirt(_ n: Int?) -> String? { n.flatMap { $0 > 0 ? "#\($0)" : nil } }

private func who(_ o: Offender) -> String {
    switch o {
    case .player(let p): return shirt(p.number) ?? ""
    case .teamOfficial(let t): return officialNames[t.role] ?? "Team official"
    default: return ""
    }
}

/// DATA-6: who a card was for in the report, as the website's report.ts: "#5", "Player" without a number, "Head coach Pat Lee".
private func reportWho(_ o: Offender) -> String {
    switch o {
    case .player(let p): return shirt(p.number) ?? "Player"
    case .teamOfficial(let t): return [officialNames[t.role] ?? "Team official", t.name.flatMap { $0.isEmpty ? nil : $0 }].compactMap { $0 }.joined(separator: " ")
    default: return ""
    }
}

/// The events (WEB-24): the kits as a thin strip with the first period's chalk band hanging from it,
/// then the timeline down a chalk halfway line: home's events on its left, away's on its right, the
/// minute in a board-black circle ringed in chalk on the line, a goal as the score after it (the side
/// that scored in chalk), a card as a tilted card, neutral events in muted words; each later period a
/// chalk band; the end on the board ("Full time 3–1").
private struct Timeline: View {
    let m: Match
    let r: MatchRecord

    /// TMR-15: played on a clock that stops, so its stoppages are the clock standing still, not time added on.
    private var stoppingClock: Bool { r.stoppingClock == true || m.format.stoppingClock == true }

    /// The running score after each goal, by its place in the record.
    private var scores: [Int: (Int, Int)] {
        var home = 0, away = 0
        var out: [Int: (Int, Int)] = [:]
        for (i, e) in r.events.enumerated() {
            if case .goal(let g) = e {
                if g.team == "home" { home += 1 } else { away += 1 }
                out[i] = (home, away)
            }
        }
        return out
    }

    private var indexed: [(Int, Event)] { Array(r.events.enumerated()).filter { _, e in
        switch e {
        case .penaltyKick, .periodEnd: return false
        default: return true
        }
    } }

    private var periods: [Int] {
        let list = r.periods.map(\.period) + indexed.compactMap(\.1.periodPlayed)
        return Array(Set(list.isEmpty ? Array(1...m.format.periods) : list)).sorted()
    }

    /// The groups shown, in order: a label, its events, and whether it shows when empty.
    private var groups: [(String, [(Int, Event)])] {
        var out: [(String, [(Int, Event)], Bool)] = [("Before kickoff", indexed.filter { $0.1.whenPlayed == "beforeKickoff" }, false)]
        for p in periods {
            out.append((periodName(m.format, period: p), indexed.filter { $0.1.whenPlayed == "play" && $0.1.periodPlayed == p }, true))
            out.append((p == m.format.periods / 2 ? "Half-time" : "Break", indexed.filter { $0.1.whenPlayed == "break" && $0.1.periodPlayed == p }, false))
        }
        out.append(("After full time", indexed.filter { $0.1.whenPlayed == "afterFullTime" }, false))
        return out.filter { !$0.1.isEmpty || $0.2 }.map { ($0.0, $0.1) }
    }

    var body: some View {
        let kicks: [EventPenaltyKick] = r.events.compactMap { if case .penaltyKick(let k) = $0 { return k } else { return nil } }
        let scores = scores
        VStack(spacing: 0) {
            KitPanels(home: m.home, away: m.away, size: .small, lines: 1)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: 6, topTrailingRadius: 6))
            ForEach(Array(groups.enumerated()), id: \.offset) { i, group in
                Band(label: group.0, top: i == 0)
                TimelineLine {
                    if group.1.isEmpty {
                        Text("No events").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.horizontal, 6).background(LF.pitch).padding(.vertical, 10)
                    } else {
                        VStack(spacing: 12) {
                            ForEach(group.1, id: \.0) { index, e in EventLine(m: m, e: e, score: scores[index], stoppingClock: stoppingClock) }
                        }
                        .padding(.vertical, 10)
                    }
                }
            }
            if !kicks.isEmpty {
                Band(label: "Penalties", top: false)
                TimelineLine {
                    VStack(spacing: 8) {
                        ForEach(["home", "away"], id: \.self) { side in
                            HStack(spacing: 6) {
                                TeamBadge(team: side == "home" ? m.home : m.away, other: side == "home" ? m.away : m.home, home: side == "home")
                                ForEach(Array(kicks.filter { $0.team == side }.enumerated()), id: \.offset) { _, k in
                                    Circle().fill(k.scored ? LF.chalk : LF.red).frame(width: 12, height: 12)
                                }
                            }
                            .padding(.trailing, 6)
                            .background(LF.pitch)
                        }
                    }
                    .padding(.vertical, 10)
                }
            }
            // The end on the board.
            Board(shadow: false) {
                HStack {
                    Text((r.outcome == "abandoned" ? "Abandoned" : "Full time").uppercased()).font(.display(24)).foregroundStyle(LF.onBoardStrong)
                    Spacer()
                    Text("\(r.score.home)–\(r.score.away)").font(.display(44)).foregroundStyle(LF.onBoardStrong)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// A period's band: a chalk strip as wide as the kits, its name in black italic capitals.
private struct Band: View {
    let label: String
    let top: Bool

    var body: some View {
        Text(label.uppercased()).font(.display(20)).foregroundStyle(LF.brandStrong)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LF.surface)
            .clipShape(RoundedRectangle(cornerRadius: top ? 0 : 4))
            .ground(.panel)
            .accessibilityAddTraits(.isHeader)
    }
}

/// What runs down the chalk halfway line between two bands.
private struct TimelineLine<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity)
            .background { Rectangle().fill(LF.chalkLine).frame(width: 3) }
    }
}

private struct EventLine: View {
    let m: Match
    let e: Event
    let score: (Int, Int)?
    /// TMR-15: a stoppage is the clock standing still, "Clock stopped, 1:30".
    var stoppingClock = false

    private var side: String? {
        switch e {
        case .goal(let g): return g.team
        case .caution(let c): return c.team
        case .secondCaution(let c): return c.team
        case .sendOff(let c): return c.team
        case .sinBin(let c): return c.team
        case .secondSinBin(let c): return c.team
        case .injury(let i): return i.team
        default: return nil
        }
    }

    private var code: String? {
        switch e {
        case .caution(let c): return c.misconduct?.code
        case .secondCaution(let c): return c.misconduct?.code
        case .sendOff(let c): return c.misconduct?.code
        case .sinBin(let c): return c.misconduct?.code
        case .secondSinBin(let c): return c.misconduct?.code
        default: return nil
        }
    }

    private func with(_ words: String, _ who: String) -> String { who.isEmpty ? words : "\(words) \(who)" }

    private var words: String? {
        switch e {
        case .goal(let g): return "\(goalTypeNames[g.goalType ?? "goal"] ?? "Goal")\(shirt(g.player).map { " \($0)" } ?? "")"
        case .caution(let c): return with("Caution", who(c.offender))
        case .secondCaution(let c): return with("Second caution", who(c.offender))
        case .sendOff(let c): return with("Sent off", who(c.offender))
        case .sinBin(let c): return sinBinWords(c)
        case .secondSinBin(let c): return with("Second sin bin", who(c.offender))
        case .stoppage(let s):
            let length = "\(s.lengthSec / 60):\(String(format: "%02d", s.lengthSec % 60))"
            return stoppingClock ? "Clock stopped, \(length)" : "Stoppage, \(length) added"
        case .injury(let i): return "Injury\(shirt(i.player).map { " \($0)" } ?? "")"
        case .suspension(let s): return suspensionWords(s)
        case .clockAdjusted(let c): return clockAdjustedWords(c)
        case .abandonment: return "Match abandoned"
        default: return nil
        }
    }

    private var card: CardKind? {
        switch e {
        case .caution: return .yellow
        case .secondCaution: return .second
        case .sendOff: return .red
        // EVT-12: a sin bin as its own card; a second one is a send-off, as a second caution is.
        case .sinBin: return .sinBin
        case .secondSinBin: return .second
        default: return nil
        }
    }

    @ViewBuilder
    private func what(_ words: String, end: Bool) -> some View {
        let home = side == "home"
        VStack(alignment: end ? .trailing : .leading, spacing: 2) {
            if case .goal = e {
                let (h, a) = score ?? (0, 0)
                (Text("\(h)").foregroundStyle(home ? LF.chalk : LF.chalkMuted) + Text("–").foregroundStyle(LF.chalkMuted) + Text("\(a)").foregroundStyle(!home ? LF.chalk : LF.chalkMuted))
                    .font(.display(38))
                Text(words).font(.barlow(13, .bold)).foregroundStyle(LF.chalk)
            } else if let card {
                HStack(spacing: 10) {
                    if !end { CardShape(kind: card, width: 22, height: 30) }
                    VStack(alignment: end ? .trailing : .leading, spacing: 3) {
                        Text(words).font(.barlow(13, .bold)).foregroundStyle(LF.chalk)
                        if let code { Chip(code) }
                    }
                    if end { CardShape(kind: card, width: 22, height: 30) }
                }
            } else {
                Text(words).font(.lfBodySmall).foregroundStyle(LF.chalkMuted).multilineTextAlignment(end ? .trailing : .leading)
            }
        }
    }

    var body: some View {
        if let words {
            let minute = e.whenPlayed == "play" ? e.periodPlayed.flatMap { p in e.secondsIn.map { matchMinute(m.format, period: p, periodSec: $0) } } ?? "" : ""
            let team = side.map { teamName($0 == "home" ? m.home : m.away, home: $0 == "home") }
            let spoken = [minute.isEmpty ? nil : minute, words, team, code, score.map { "\($0.0)–\($0.1)" }].compactMap { $0 }.joined(separator: ", ")
            let home = side == "home"
            // The other team's side is Color.clear, not an empty Group: iOS 26 drops an empty Group's
            // frame, which put the minute at the edge and the event on the wrong team's side.
            HStack(spacing: 0) {
                ZStack(alignment: .trailing) { Color.clear.frame(height: 0); if home { what(words, end: true) } }
                    .frame(maxWidth: .infinity, alignment: .trailing).padding(.trailing, 12)
                Text(minute.isEmpty ? "·" : minute).lfWord(minute.count > 4 ? 11 : 14).foregroundStyle(LF.onBoardStrong).lineLimit(1).minimumScaleFactor(0.7)
                    .frame(width: 42, height: 42)
                    .background(LF.board, in: Circle())
                    .overlay(Circle().stroke(LF.chalkLine, lineWidth: 2))
                ZStack(alignment: .leading) { Color.clear.frame(height: 0); if !home { what(words, end: false) } }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 12)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken)
        }
    }
}

/// DATA-6: a goal's kind in the report, as the website's report.ts (goalKinds); a plain goal says nothing.
private let reportGoalKinds = ["directFreeKick": "Direct free kick", "penalty": "Penalty", "ownGoal": "Own goal"]

/// The match report as text (DATA-6), for the share sheet: what league forms ask for, as the website's report.ts.
/// `schemes` gives a misconduct scheme by its id, for what a card's code means.
func reportText(_ m: Match, _ r: MatchRecord, competition: String?, venue: String?, pitch: String?, you: String, referees: [Referee], schemes: (String) -> MisconductScheme? = misconductScheme) -> String {
    let zone = zoneOf(m)
    func team(_ side: String) -> String { teamName(side == "home" ? m.home : m.away, home: side == "home") }
    func minute(_ e: Event) -> String {
        if e.whenPlayed == "play", let p = e.periodPlayed, let s = e.secondsIn { return matchMinute(m.format, period: p, periodSec: s) }
        return ["beforeKickoff": "Before kickoff", "break": "During a break", "afterFullTime": "After full time", "penalties": "Shoot-out"][e.whenPlayed ?? ""] ?? ""
    }
    var lines = ["MATCH REPORT"]
    if let competition { lines.append(competition) }
    lines.append("\(team("home")) v \(team("away"))")
    // The date and kickoff, "Saturday, November 7, 2026, 9:00 AM", in the match's own time zone, as the website's. The
    // short time style follows the phone's 24-Hour Time setting ("13:30"), as formatTime does.
    if let kickoff = instantOf(m.kickoff) {
        let time = DateFormatter()
        time.timeZone = zone
        time.dateStyle = .none
        time.timeStyle = .short
        lines.append("\(formatFullDate(kickoff, zone: zone)), \(time.string(from: kickoff))")
    }
    let place = [venue, pitch].compactMap { $0 }.joined(separator: ", ")
    if !place.isEmpty { lines.append(place) }
    if let e = m.external { lines.append("Match number: \(e.id)") }
    if let assignor = m.assignor { lines.append("Assignor: \(assignor)") }
    lines += ["", "Officials"]
    for o in crewInOrder(m.crew, you: m.role) {
        let name: String
        switch o {
        case .you: name = you
        case .member(_, let member): name = referees.first { $0.id == member.refereeId }?.name ?? member.name ?? "Unknown"
        }
        lines.append("\(roleNames[o.role] ?? o.role): \(name)")
    }
    let penalties = r.penalties.map { " (\($0.home)–\($0.away) on penalties)" } ?? (r.goldenGoal == true ? " (golden goal)" : "")
    // RES-1: a result corrected after the match says so, as the website's printable page and text.
    let corrected = r.editedAt != nil ? ", corrected after the match" : ""
    lines += ["", "Result: \(team("home")) \(r.score.home) – \(r.score.away) \(team("away")), \(r.outcome == "abandoned" ? "abandoned" : "full time")\(penalties)\(corrected)"]
    // EVT-11: when the match was abandoned, "Abandoned 67': note", as the website's.
    if let a = r.events.lazy.compactMap({ if case .abandonment(let a) = $0 { return a } else { return nil } }).first {
        lines.append("Abandoned \(minute(.abandonment(a)))" + (a.note.flatMap { $0.isEmpty ? nil : ": \($0)" } ?? ""))
    }
    // TMR-13: the match suspended and resumed, "30'  Suspended 34:12 · Lightning: note", only when it was, as the website's report.ts (suspensionLines).
    let suspensions: [EventSuspension] = r.events.compactMap { if case .suspension(let s) = $0 { return s } else { return nil } }
    if !suspensions.isEmpty {
        lines += ["", "Suspended"]
        for s in suspensions {
            var quiet = s
            quiet.note = nil
            lines.append("\(minute(.suspension(s)))  \(suspensionWords(quiet))" + (s.note.flatMap { $0.isEmpty ? nil : ": \($0)" } ?? ""))
        }
    }
    // TMR-14: the clock's corrections during play, "12'  Clock adjusted +0:40", so the report says the times were corrected (clockLines).
    // TMR-15: first, that the clock stopped when play stopped, so its minutes are the clock's, with no added time.
    let adjustments: [EventClockAdjusted] = r.events.compactMap { if case .clockAdjusted(let a) = $0 { return a } else { return nil } }
    let stopping = r.stoppingClock == true || m.format.stoppingClock == true
    if !adjustments.isEmpty || stopping {
        lines += ["", "Clock"]
        if stopping { lines.append("Stopped when play stopped (the minutes are the clock's)") }
        for a in adjustments { lines.append("\(minute(.clockAdjusted(a)))  \(clockAdjustedWords(a))") }
    }
    lines += ["", "Goals"]
    let goals: [EventGoal] = r.events.compactMap { if case .goal(let g) = $0 { return g } else { return nil } }
    if goals.isEmpty { lines.append("None") }
    for g in goals {
        let kind = g.goalType.flatMap { reportGoalKinds[$0] }
        lines.append([minute(.goal(g)), team(g.team), shirt(g.player), kind].compactMap { $0 }.joined(separator: "  "))
    }
    lines += ["", "Cautions and send-offs"]
    // A code with what it means, "UB (Unsporting behavior)", when its scheme ships with LawFive (misconductDescription); each scheme read once.
    var read: [String: MisconductScheme?] = [:]
    func codeWords(_ code: MisconductCode?) -> String? {
        guard let code else { return nil }
        if read[code.scheme] == nil { read[code.scheme] = .some(schemes(code.scheme)) }
        let scheme = read[code.scheme] ?? nil
        let description = scheme?.cautions.first { $0.code == code.code }?.description ?? scheme?.sendOffs.first { $0.code == code.code }?.description
        return code.code + (description.map { " (\($0))" } ?? "")
    }
    var cards = 0
    for e in r.events {
        let parts: (String, String, String, String?)?
        switch e {
        case .caution(let c): parts = ("Caution", c.team, reportWho(c.offender), codeWords(c.misconduct))
        case .secondCaution(let c): parts = ("Second caution (sent off)", c.team, reportWho(c.offender), codeWords(c.misconduct))
        case .sendOff(let c): parts = ("Send-off", c.team, reportWho(c.offender), codeWords(c.misconduct))
        case .sinBin(let c): parts = ("Sin bin (\(minutesText(c.lengthSec)) min)", c.team, reportWho(c.offender), codeWords(c.misconduct))
        case .secondSinBin(let c): parts = ("Second sin bin (sent off)", c.team, reportWho(c.offender), codeWords(c.misconduct))
        default: parts = nil
        }
        if let (kind, side, offender, code) = parts {
            cards += 1
            lines.append([minute(e), team(side), offender.isEmpty ? nil : offender, kind, code].compactMap { $0 }.joined(separator: "  "))
        }
    }
    if cards == 0 { lines.append("None") }
    // EVT-16: injuries, only when there were any, as the website's report.ts (injuryLine).
    let injuries: [EventInjury] = r.events.compactMap { if case .injury(let i) = $0 { return i } else { return nil } }
    if !injuries.isEmpty {
        lines += ["", "Injuries"]
        for i in injuries {
            let stopped = i.lengthSec.flatMap { $0 > 0 ? "Play stopped \($0 / 60):\(String(format: "%02d", $0 % 60))" : nil }
            lines.append([minute(.injury(i)), team(i.team), shirt(i.player) ?? "Player", stopped].compactMap { $0 }.joined(separator: "  ") + (i.note.flatMap { $0.isEmpty ? nil : ": \($0)" } ?? ""))
        }
    }
    if let notes = m.notes { lines += ["", "Notes", notes] }
    return lines.joined(separator: "\n") + "\n"
}
