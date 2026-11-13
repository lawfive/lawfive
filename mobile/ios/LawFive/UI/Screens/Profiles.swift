import SwiftUI

// A venue's and a referee's own pages (IOS-4): what there is to know at a glance, with Edit for the
// form, as a match has its page and its edit.

/// A venue: its map, Directions, pitches, tags and notes, the matches there, and photos.
struct VenueScreen: View {
    let id: String
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav

    var body: some View {
        if let v = graph.records.venue(id) {
            let here = (graph.records.matches ?? []).filter { $0.venueId == id }
            let pins = (v.position.map { [MapPin(id: "parking", lat: $0.lat, lon: $0.lon, kind: .parking, mark: "P")] } ?? []) +
                v.pitches.enumerated().compactMap { i, p in p.position.map { MapPin(id: p.id, lat: $0.lat, lon: $0.lon, kind: .pitch, mark: "\(i + 1)") } }
            let target = venuePosition(v).map { "\($0.lat),\($0.lon)" } ?? v.address
            Page(v.name, sub: [v.aliases.flatMap { $0.isEmpty ? nil : "Also \($0.joined(separator: ", "))" }, v.address].compactMap { $0 }.joined(separator: " · ").orNil, large: false) {
                DuplicateCard(kind: .venues, id: id)
                // WEB-28: how much you've refereed here, on its slab.
                TogetherSlab(title: "At this venue", t: workedTogether(here),
                             extra: SlabCellFigure(label: "Pitches", value: "\(v.pitches.count)", caption: v.pitches.isEmpty ? "None yet" : "\(v.pitches.filter { $0.position != nil }.count) on the map"))
                    .padding(.top, 30).padding(.bottom, 22)
                if !pins.isEmpty {
                    VenueMap(pins: pins, height: 220).padding(.bottom, 12)
                }
                if let target {
                    SecondaryButton("Directions", icon: .directions) { graph.openDirections(to: target) }
                }
                if !v.pitches.isEmpty {
                    SectionTitle("Pitches")
                    LfCard {
                        ForEach(Array(v.pitches.enumerated()), id: \.element.id) { i, p in
                            // TRK-13: corners walked on the watch.
                            let walked = p.markings?.last.flatMap { instantOf($0.at) }.map { "Corners walked \(formatShortDay($0, zone: .current))" }
                            ListRow(title: p.name, sub: [p.position != nil ? "On the map" : "Not on the map yet", walked].compactMap { $0 }.joined(separator: " · "), divider: i > 0,
                                    leading: { MiniPin(mark: "\(i + 1)", size: 30) }, trailing: { EmptyView() })
                        }
                    }
                }
                let facts = [
                    v.tags.flatMap { $0.isEmpty ? nil : Fact(icon: .tag, label: "Tags", value: $0.joined(separator: ", "), wide: true) },
                    v.notes.map { Fact(icon: .note, label: "Notes", value: $0, wide: true) },
                ].compactMap { $0 }
                if !facts.isEmpty {
                    SectionTitle("Details")
                    FactsCard(facts: facts)
                }
                MatchesWith(title: "Matches here", matches: here, none: "No matches here yet.").id(matchesAnchor)
                PhotosSection(recordType: "venue", recordId: id).padding(.top, 8)
            }
            .backTitle("Venue · \(v.name)")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { BarIcon(icon: .edit, label: "Edit") { nav.sheet = .venue(id) } } }
        } else {
            Page("Venue", large: false) { LoadingPitch() }
        }
    }
}

/// A referee: their picture and how to reach them, the matches you've worked together, and photos.
struct RefereeScreen: View {
    let id: String
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL

    var body: some View {
        if let r = graph.records.referee(id) {
            let together = (graph.records.matches ?? []).filter { m in m.crew.contains { $0.refereeId == id } }
            Page(r.name, sub: r.aliases.flatMap { $0.isEmpty ? nil : "Also \($0.joined(separator: ", "))" }, large: false) {
                DuplicateCard(kind: .referees, id: id)
                // WEB-28: their picture and how much you've worked together on a slab, then how to reach them.
                TogetherSlab(title: "Working together", t: workedTogether(together)) { RefereeAvatar(r: r, size: 72, tile: true) }
                    .padding(.top, 30)
                if r.phone != nil || r.email != nil {
                    Flow(spacing: 8) {
                        if let phone = r.phone?.filter({ !$0.isWhitespace }) {
                            SecondaryButton("Call", icon: .phone) { if let url = URL(string: "tel:\(phone)") { openURL(url) } }
                            SecondaryButton("Text", icon: .message) { if let url = URL(string: "sms:\(phone)") { openURL(url) } }
                        }
                        if let email = r.email {
                            SecondaryButton("Email", icon: .mail) { if let url = URL(string: "mailto:\(email)") { openURL(url) } }
                        }
                    }
                    .padding(.top, 16)
                }
                let facts = [
                    r.phone.map { Fact(icon: .phone, label: "Phone", value: $0) },
                    r.email.map { Fact(icon: .mail, label: "Email", value: $0, wide: true) },
                    r.tags.flatMap { $0.isEmpty ? nil : Fact(icon: .tag, label: "Tags", value: $0.joined(separator: ", "), wide: true) },
                    r.notes.map { Fact(icon: .note, label: "Notes", value: $0, wide: true) },
                ].compactMap { $0 }
                if !facts.isEmpty {
                    SectionTitle("Details")
                    FactsCard(facts: facts)
                }
                MatchesWith(title: "Matches together", matches: together, none: "No matches together yet.").id(matchesAnchor)
                PhotosSection(recordType: "referee", recordId: id).padding(.top, 8)
            }
            .backTitle("Referee · \(r.name)")
            .toolbar { ToolbarItem(placement: .topBarTrailing) { BarIcon(icon: .edit, label: "Edit") { nav.sheet = .referee(id) } } }
            .task { await graph.loadRefereePictures() }
        } else {
            Page("Referee", large: false) { LoadingPitch() }
        }
    }
}

private let shownCount = 5

/// Where See matches scrolls to: the matches further down the page.
private let matchesAnchor = "matches"

/// A figure on a record's slab: a label, the figure and a line under it.
private struct SlabCellFigure {
    let label: String
    let value: String
    let caption: String
}

/// WEB-28: how much you've worked with a referee or at a venue, as the website's: a slab cut on the
/// diagonal (At this venue, Working together) tagged since the first match played, with Played (and the
/// last), Coming up and any `extra` (a venue's pitches), two to a row where they fit and one under
/// another beside `aside` (a referee's picture); See matches along its foot scrolls to them further down
/// this page, where the phones list them.
private struct TogetherSlab<Aside: View>: View {
    let title: String
    let t: WorkedTogether
    var extra: SlabCellFigure?
    @ViewBuilder var aside: () -> Aside
    @Environment(\.pageScroll) private var scroll

    var body: some View {
        let cells = [
            // A date never breaks across lines.
            SlabCellFigure(label: "Played", value: "\(t.played)", caption: t.last.map { "Last " + formatShortDay($0.at, zone: $0.zone).replacingOccurrences(of: " ", with: "\u{00A0}") } ?? "None yet"),
            SlabCellFigure(label: "Coming up", value: "\(t.upcoming)", caption: t.upcoming == 0 ? "Nothing yet" : t.upcoming == 1 ? "1 match" : "\(t.upcoming) matches"),
            extra,
        ].compactMap { $0 }
        let hasAside = Aside.self != EmptyView.self
        Slab(title: title, tag: sinceTag(t), cut: true) {
            HStack(alignment: .top, spacing: 16) {
                if hasAside {
                    aside()
                    SlabRule(vertical: true)
                }
                // Two to a row where both fit (an odd last one across), else one under another.
                ViewThatFits(in: .horizontal) {
                    if !hasAside { grid(cells.chunked(2)) }
                    grid(cells.map { [$0] })
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            if t.played + t.upcoming > 0 {
                SlabRule().padding(.top, 18)
                HStack {
                    Spacer(minLength: 0)
                    Button {
                        withAnimation(.easeInOut(duration: 0.4)) { scroll?.scrollTo(matchesAnchor, anchor: .top) }
                    } label: {
                        HStack(spacing: 8) {
                            Text("SEE MATCHES").lfWord(17).foregroundStyle(LF.onBoardStrong)
                            PhIcon(.open, size: 16, tint: LF.onBoardStrong)
                        }
                        .frame(minHeight: 44)
                        .padding(.horizontal, 4)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("See matches")
                    .accessibilityHint("Goes to the matches further down")
                }
                .padding(.top, 4)
            }
        }
    }

    private func grid(_ lines: [[SlabCellFigure]]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { i, line in
                if i > 0 { SlabRule().padding(.vertical, 14) }
                HStack(alignment: .top, spacing: 16) {
                    ForEach(Array(line.enumerated()), id: \.offset) { j, cell in
                        if j > 0 { SlabRule(vertical: true) }
                        TogetherCell(cell: cell, narrowest: line.count > 1 ? 120 : 0)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

extension TogetherSlab where Aside == EmptyView {
    init(title: String, t: WorkedTogether, extra: SlabCellFigure? = nil) {
        self.init(title: title, t: t, extra: extra, aside: { EmptyView() })
    }
}

/// A figure in a record's slab: the mint label, the figure, and its line, which never breaks a date.
private struct TogetherCell: View {
    let cell: SlabCellFigure
    /// How narrow it may get beside another before they go one under another.
    var narrowest: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            SlabLabel(cell.label)
            SlabFigure(text: cell.value, size: 52)
            Text(cell.caption).font(.barlow(14, .medium, relativeTo: .subheadline)).foregroundStyle(LF.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(minWidth: narrowest, maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private extension Array {
    func chunked(_ size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}

/// A few of the matches at a venue or with a referee: the next ones, then the latest.
private struct MatchesWith: View {
    let title: String
    let matches: [Match]
    let none: String

    var body: some View {
        let upcoming = matches.filter(isUpcoming).sorted { ($0.kickoff ?? "9999") < ($1.kickoff ?? "9999") }
        let past = matches.filter { !isUpcoming($0) }.sorted { ($0.kickoff ?? "") > ($1.kickoff ?? "") }
        let shown = Array((upcoming + past).prefix(shownCount))
        SectionTitle(matches.isEmpty ? title : "\(title) (\(matches.count))")
        if shown.isEmpty {
            LfCard { Text(none).font(.lfBodyMedium).foregroundStyle(LF.muted).padding(16) }
        }
        VStack(spacing: 8) {
            ForEach(shown, id: \.id) { MatchRow(m: $0) }
        }
        if matches.count > shownCount {
            Text("And \(matches.count - shownCount) more: search for them in Matches.").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.top, 8)
        }
    }
}
