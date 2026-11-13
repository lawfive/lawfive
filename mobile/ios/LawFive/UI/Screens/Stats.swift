import SwiftUI

// The Stats tab on the phone (STAT-13, STAT-14, STAT-15), in the website's broadcast stats package
// (WEB-24, the owner's choice on 2026-11-08), as Android's, from the same GET /v1/stats: the filters
// on one board (When and Role), the games as a huge chalk figure, the roles as slabs as long as their
// counts, the distance on a slab cut on the diagonal, the cards rising out of a slab, the fees, the
// games a month as lamps, who you work with most as a name strap, the ticker and where on the pitch;
// then In detail on the halfway line: the running (distance by role, longest and shortest, the running
// total as a track, fitness, your watches), the fixtures (busiest times turned, where, the weather and
// its records) and the games (age groups, the referees you work with, year by year). As STAT-14 has
// it, the phones leave out added time, discipline's charts and codes, the fees by month and fitness
// game by game; Full stats at the end opens the website. The last answer for each set of filters is
// kept, so it shows without signal, saying when it's from. The arithmetic is the website's
// (Data/StatsMath.swift); the slab and its graphics are components (Slab.swift, BoardCharts.swift).

/// "When": all time, the last 12 months, or a year, and your role, as the API's query.
func statsQuery(time: String, role: String?, today: Date, calendar: Calendar = .current) -> String {
    var parts: [String] = []
    let day = { (d: Date) -> String in
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }
    if time == "12m", let start = calendar.date(byAdding: DateComponents(year: -1, day: 1), to: today) {
        parts.append("from=\(day(start))")
    } else if time.count == 4, Int(time) != nil {
        parts += ["from=\(time)-01-01", "to=\(time)-12-31"]
    }
    if let role { parts.append("role=\(role)") }
    return parts.joined(separator: "&")
}

/// "25%", a share, rounded.
func percent(_ part: Int, _ whole: Int) -> String { "\(whole == 0 ? 0 : Int((Double(part) * 100 / Double(whole)).rounded()))%" }

/// Temperature bands of 10 °F or 5 °C, as the website's: each band's start, and how many games.
func temperatureBands(_ celsius: [Double], fahrenheit: Bool) -> [(Int, Int)] {
    guard !celsius.isEmpty else { return [] }
    let width = fahrenheit ? 10 : 5
    let values = celsius.map { fahrenheit ? $0 * 9 / 5 + 32 : $0 }
    let band = { (v: Double) in Int(floor(v / Double(width))) * width }
    return stride(from: band(values.min()!), through: band(values.max()!), by: width).map { b in (b, values.filter { band($0) == b }.count) }
}

/// The speed each band starts at, for a sprint speed (TRK-11), as the schema's speedBandsFor.
private func bandStarts(_ sprintKph: Double) -> [Double] { [0.0, 7, 13, 18, 21].map { $0 * sprintKph / 21 } }

private let bandNames = ["walking": "Walking", "jogging": "Jogging", "running": "Running", "highSpeed": "High speed", "sprinting": "Sprinting"]
private let roleWords = ["referee": "Referee", "assistant": "Assistant", "fourth": "Fourth official"]

private func plural(_ n: Int, _ one: String, _ many: String? = nil) -> String { "\(n) \(n == 1 ? one : many ?? "\(one)s")" }

private func pattern(_ format: String) -> DateFormatter {
    let f = DateFormatter()
    f.locale = .current
    f.dateFormat = format
    return f
}

/// "Tue, Nov 3".
private func shortDay(_ iso: String) -> String { instantOf(iso).map { pattern("EEE, MMM d").string(from: $0) } ?? "" }

/// "40 s", or "12 min", as the website's.
private func duration(_ sec: Double) -> String { sec < 59.5 ? "\(Int(sec.rounded())) s" : "\(Int((sec / 60).rounded())) min" }

/// "Aug 17 – Nov 3, 2026", or one day.
private func span(_ s: Stats) -> String? {
    let parse = pattern("yyyy-MM-dd")
    guard let first = s.games.first.flatMap(parse.date(from:)), let last = s.games.last.flatMap(parse.date(from:)) else { return nil }
    let day = pattern("MMM d, yyyy")
    let calendar = Calendar.current
    if first == last { return day.string(from: first) }
    if calendar.component(.year, from: first) == calendar.component(.year, from: last) { return "\(pattern("MMM d").string(from: first)) – \(day.string(from: last))" }
    return "\(day.string(from: first)) – \(day.string(from: last))"
}

/// "13 games · Aug 17 – Nov 3, 2026 · 1 abandoned" under the title.
private func describeRange(_ s: Stats) -> String {
    [plural(s.games.total, "game"), span(s), s.games.abandoned > 0 ? "\(s.games.abandoned) abandoned" : nil].compactMap { $0 }.joined(separator: " · ")
}

/// What every section is given.
private struct Ctx {
    let s: Stats
    let unit: String
    let temperature: String
    let time: String
    let open: (Route) -> Void
}

struct StatsScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(Nav.self) private var nav
    @Environment(\.openURL) private var openURL
    @State private var time = "all"
    @State private var role: String?
    @State private var shown: KeptStats?
    @State private var shownFor: String?
    @State private var loading = true
    @State private var failed = false
    @State private var reload = 0
    /// When the stats first came, so sections rise in once as the page arrives and not after.
    @State private var arrived: Date?

    private var query: String { statsQuery(time: time, role: role, today: AppClock.now) }

    var body: some View {
        let data = shown?.stats
        // Another filter's numbers stay up, faded, while these come (as the website's).
        let stale = shownFor != query
        Page("Stats", sub: data.map(describeRange), hero: true) {
            if failed, let shown, !stale {
                Text("Offline · from \(shortWhen(shown.at))").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.bottom, 8)
            }
            Filters(time: $time, role: $role, years: data?.options.years ?? [])
            if let data, !(failed && stale) {
                if data.games.total == 0 {
                    LfCard(padding: 16) {
                        Text(data.options.years.isEmpty ? "Stats appear here once you've refereed some matches." : "No games match these filters.")
                            .font(.lfBodyMedium).foregroundStyle(LF.muted)
                    }
                    .padding(.top, 16)
                } else {
                    let x = Ctx(s: data, unit: graph.records.effectiveSettings.distanceUnit, temperature: graph.records.effectiveSettings.temperatureUnit, time: time) { nav.push($0) }
                    StatsSections(x: x, arrived: arrived)
                        .opacity(stale ? 0.6 : 1)
                        .animation(.easeOut(duration: 0.2), value: stale)
                }
            } else if loading {
                StatsPlaceholder()
            } else {
                LfCard(padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Can't reach your server").font(.lfTitleMedium).foregroundStyle(LF.text)
                        Text("There are no stats for these filters on this phone yet. Pull down to try again once you have a connection.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                    }
                }
                .padding(.top, 16)
            }
            VStack(alignment: .leading, spacing: 0) {
                SectionTitle("On the website")
                LfCard {
                    ListRow(title: "Full stats", sub: "Added time, more filters, tables and the CSV", divider: false, action: {
                        if let url = websiteURL(server: graph.session.server, path: "/stats") { openURL(url) }
                    }, leading: { Avatar(icon: .stats) }, trailing: { PhIcon(.link, size: 18, tint: LF.muted) })
                }
            }
            .padding(.top, 24)
        }
        .refreshable { reload += 1; await load() }
        .task(id: query) { await load() }
        .onChange(of: data != nil) { _, has in if has && arrived == nil { arrived = Date() } }
    }

    private func load() async {
        let q = query
        loading = true
        failed = false
        if let kept = graph.stats.kept(q) {
            shown = kept
            shownFor = q
            if arrived == nil { arrived = Date() }
        }
        do {
            let answer = try await graph.stats.fetch(q)
            guard q == query else { return }
            shown = answer
            shownFor = q
            if arrived == nil { arrived = Date() }
        } catch {
            failed = true
        }
        loading = false
    }

    /// When a kept answer came: "9:40 AM" today, else "Nov 1".
    private func shortWhen(_ at: Date) -> String {
        pattern(Calendar.current.isDateInToday(at) ? "h:mm a" : "MMM d").string(from: at)
    }
}

/// The filters on one board (STAT-13): When and Role, each with its small mint label over its control, which scrolls across.
private struct Filters: View {
    @Binding var time: String
    @Binding var role: String?
    let years: [Int]

    var body: some View {
        let choices = [("all", "All time"), ("12m", "Last 12 months")] + years.map { ("\($0)", "\($0)") }
        Board {
            VStack(alignment: .leading, spacing: 14) {
                row("When") {
                    Segmented(options: choices, selected: $time, background: LF.boardDots, minHeight: 48)
                }
                row("Role") {
                    Segmented(options: [(String?.none, "All"), ("referee", "Referee"), ("assistant", "Assistant"), ("fourth", "Fourth")], selected: $role, background: LF.boardDots, minHeight: 48)
                }
            }
            .padding(16)
        }
        .padding(.top, 4)
    }

    private func row<Control: View>(_ label: String, @ViewBuilder control: () -> Control) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label.uppercased()).lfLabel(11.5).foregroundStyle(LF.boardAccent).accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal, showsIndicators: false) { control() }
        }
    }
}

/// The filters board's shape, the headline and two slabs as faint shapes while the stats first load (WEB-8), after 0.3 s.
private struct StatsPlaceholder: View {
    @State private var show = false

    var body: some View {
        let bar = { (color: Color, fraction: CGFloat, height: CGFloat) in
            GeometryReader { geo in RoundedRectangle(cornerRadius: 4).fill(color).frame(width: geo.size.width * fraction) }.frame(height: height)
        }
        VStack(alignment: .leading, spacing: 14) {
            bar(LF.chalk.opacity(0.14), 0.5, 14)
            bar(LF.chalk.opacity(0.14), 0.45, 150)
            ForEach(0..<2, id: \.self) { _ in
                Board {
                    VStack(alignment: .leading, spacing: 14) {
                        bar(LF.onBoard.opacity(0.12), 0.3, 12)
                        bar(LF.onBoard.opacity(0.12), 1, 150)
                    }
                    .padding(22)
                }
                .padding(.top, 38)
            }
        }
        .padding(.top, 36)
        .opacity(show ? 1 : 0)
        .task {
            try? await Task.sleep(for: .milliseconds(300))
            show = true
        }
        .accessibilityElement()
        .accessibilityLabel("Loading the stats")
    }
}

/// A section rises in once if it's there as the page arrives; later ones (and anyone who asked for less motion) just show.
private struct Rise: ViewModifier {
    @State private var on: Bool
    @Environment(\.accessibilityReduceMotion) private var reduce

    init(arrived: Date?) {
        _on = State(initialValue: !(arrived == nil || Date().timeIntervalSince(arrived!) < 0.7))
    }

    func body(content: Content) -> some View {
        content
            .opacity(on ? 1 : 0)
            .offset(y: on ? 0 : 16)
            .onAppear {
                guard !on else { return }
                if reduce { on = true } else { withAnimation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.45)) { on = true } }
            }
    }
}

private struct StatsSections: View {
    let x: Ctx
    let arrived: Date?

    var body: some View {
        let s = x.s
        VStack(alignment: .leading, spacing: 0) {
            section(top: 36) { Headline(s: s) }
            section(top: 44) { RoleSlabs(s: s) }
            section { DistanceSlab(x: x) }
            section(top: 56) { CardsShown(s: s) }
            section { FeesSlab(s: s) }
            section { MonthsSlab(s: s) }
            if !s.referees.top.isEmpty { section(top: 44) { MostWith(x: x) } }
            section { Ticker(x: x) }
            if !(s.fitness.heatmaps ?? []).isEmpty { section { WhereOnThePitch(x: x) } }
            section(top: 72) { InDetailHead() }
            section(top: 12) { SectionTitle("The running") }.id("running")
            section(top: 28) { DistanceByRole(x: x) }
            if s.distance.longest != nil && s.distance.shortest != nil && s.distance.games >= 2 { section { LongestShortest(x: x) } }
            if !s.distance.overTime.isEmpty { section { DistanceOverTime(x: x) } }
            if !s.fitness.games.isEmpty { section { Fitness(x: x) } }
            if !watchesShown(s.watches).isEmpty { section { Watches(s: s) } }
            section(top: 44) { SectionTitle("The fixtures") }.id("fixtures")
            if !s.busiest.isEmpty { section(top: 28) { Busiest(x: x) } }
            section(top: s.busiest.isEmpty ? 28 : 52) { Places(x: x) }
            section { StatsWeatherSlab(x: x) }
            if !s.weather.temperaturesC.isEmpty { section { Temperatures(x: x) } }
            if s.weather.hottest != nil || s.weather.coldest != nil || s.weather.windiest != nil { section(top: 36) { WeatherRecords(x: x) } }
            if !s.ageGroups.isEmpty || !s.referees.top.isEmpty || s.years.count >= 2 { section(top: 44) { SectionTitle("The games") }.id("games") }
            if !s.ageGroups.isEmpty { section(top: 28) { AgeGroups(s: s) } }
            if !s.referees.top.isEmpty { section(top: 56) { RefereeStraps(x: x) } }
            if s.years.count >= 2 { section { Years(x: x) } }
        }
    }

    private func section<Content: View>(top: CGFloat = 52, @ViewBuilder _ content: () -> Content) -> some View {
        content().padding(.top, top).modifier(Rise(arrived: arrived))
    }
}

/// The games, a huge chalk figure on the grass with the hero offset and a mint bar under it, the dates they span over it.
private struct Headline: View {
    let s: Stats
    @State private var width: CGFloat = 0
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let total = s.games.total
        let digits = CGFloat(String(total).count)
        let screen = width + 2 * pagePad
        let size = max(60, min(300, screen * 0.46, (width > 0 ? width : 320) / (digits * 0.56)))
        let offset = scheme == .dark ? CGSize(width: 3, height: 2) : CGSize(width: size * 0.035, height: size * 0.035)
        VStack(alignment: .leading, spacing: 0) {
            WidthReader(width: $width)
            if let span = span(s) { Text(span.uppercased()).lfLabel(13, spacing: 0.16).foregroundStyle(LF.chalkMuted) }
            Text("\(total)")
                .font(LfFace.display.font(size))
                .tracking(-0.02 * size)
                .foregroundStyle(LF.chalk)
                .shadow(color: LF.heroShadow, radius: 0, x: offset.width, y: offset.height)
                .lineLimit(1)
                .fixedSize()
                .padding(.trailing, 8)
                // As tall as its digits: Barlow Condensed's ascent leaves a gap over them.
                .padding(.top, -size * 0.28).padding(.bottom, -size * 0.14)
                .padding(.top, 14)
            MintBar(height: 12, fraction: 0.72, most: 286).padding(.top, 16)
            HStack(alignment: .lastTextBaseline, spacing: 14) {
                Text(total == 1 ? "GAME" : "GAMES").font(.display(38, relativeTo: .largeTitle)).foregroundStyle(LF.chalk).padding(.trailing, 2)
                Text(s.games.abandoned > 0 ? "\(s.games.abandoned) abandoned" : "all completed").font(.barlow(17, .semibold)).foregroundStyle(LF.chalkMuted)
            }
            .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(plural(total, "game"))\(span(s).map { ", \($0)" } ?? ""), \(s.games.abandoned > 0 ? "\(s.games.abandoned) abandoned" : "all completed")")
    }
}

/// STAT-3: the games by role as slabs on the grass, each as long as its count, its name on a board tile
/// and its figure after it; the assistant's split into AR1 and AR2 inside it, written under the name.
private struct RoleSlabs: View {
    let s: Stats
    @State private var width: CGFloat = 0

    private struct Row {
        let label: String
        let value: Int
        let parts: [(Int, Color)]
        let split: String?
    }

    var body: some View {
        let r = s.roles
        let rows = [
            Row(label: "Referee", value: r.referee, parts: [(r.referee, LF.chalk)], split: nil),
            Row(label: "Assistant", value: r.ar1 + r.ar2, parts: [(r.ar1, LF.boardAccent), (r.ar2, LF.roleAr2)], split: r.ar1 + r.ar2 > 0 ? "AR1 \(r.ar1) · AR2 \(r.ar2)" : nil),
            Row(label: "4th official", value: r.fourth, parts: [(r.fourth, LF.roleFourth)], split: nil),
        ] + (r.notSet > 0 ? [Row(label: "Not set", value: r.notSet, parts: [(r.notSet, LF.roleNone)], split: nil)] : [])
        let most = max(1, rows.map(\.value).max() ?? 1)
        let barMax = max(24, width - 134 + 14 - 62)
        Slab(title: "By role", tag: "Counted in games", ground: .grass) {
            VStack(spacing: 10) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    HStack(spacing: 0) {
                        VStack(alignment: .leading, spacing: 4) {
                            WordFit(text: row.label.uppercased(), face: .word, size: grown(15, .subheadline), color: LF.onBoard, tracking: 0.06, line: 1.07)
                            if let split = row.split {
                                WordFit(text: split, face: .mono, size: grown(10.5, .caption2), color: LF.boardAccent, tracking: 0.04)
                            }
                        }
                        .padding(.leading, 12).padding(.trailing, 24).padding(.vertical, 5)
                        .frame(width: 134, alignment: .leading)
                        .frame(maxHeight: .infinity)
                        .boardSurface(SlantShape(right: tabCut))
                        HStack(spacing: 0) {
                            if row.value > 0 {
                                RoleBar(parts: row.parts).frame(width: max(24, barMax * CGFloat(row.value) / CGFloat(most))).frame(maxHeight: .infinity)
                            }
                            Text("\(row.value)").font(LfFace.display.font(42)).foregroundStyle(LF.chalk).lineLimit(1).fixedSize()
                                .padding(.leading, row.value > 0 ? 8 : 30).padding(.trailing, 4)
                        }
                        .offset(x: -14)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 54)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(row.label): \(plural(row.value, "game"))\(row.split.map { ", \($0.replacingOccurrences(of: " · ", with: " and "))" } ?? "")")
                }
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
}

/// A role's bar: its parts as slanted slabs, each cut on both sides and overlapping on the diagonal.
private struct RoleBar: View {
    let parts: [(Int, Color)]

    var body: some View {
        Canvas { c, size in
            let shown = parts.filter { $0.0 > 0 }
            guard !shown.isEmpty else { return }
            let cut: CGFloat = 18
            let overlap: CGFloat = 14
            let least: CGFloat = 24
            let room = size.width + overlap * CGFloat(shown.count - 1)
            let total = CGFloat(shown.reduce(0) { $0 + $1.0 })
            var widths = shown.map { max(least, CGFloat($0.0) / total * room) }
            let over = widths.reduce(0, +) - room
            if over > 0, let widest = widths.indices.max(by: { widths[$0] < widths[$1] }) { widths[widest] -= over }
            var x: CGFloat = 0
            for (i, part) in shown.enumerated() {
                let w = widths[i]
                c.fill(SlantShape(left: cut, right: cut).path(in: CGRect(x: x, y: 0, width: w, height: size.height)), with: .color(part.1))
                x += w - overlap
            }
        }
    }
}

/// The distance run on a slab cut on the diagonal: the total huge, then a game's and how many were tracked.
private struct DistanceSlab: View {
    let x: Ctx

    var body: some View {
        let d = x.s.distance
        let has = d.games > 0
        Slab(title: "Distance", icon: .distance, cut: true) {
            SlabLabel("Total run")
            SlabFigure(text: has ? formatDistance(d.totalM, unit: x.unit) : "—", size: 72).padding(.top, 10)
            MintBar().padding(.top, 12)
            if !has { Text("No distances in these games yet.").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.top, 14) }
            HStack(alignment: .top, spacing: 0) {
                // STAT-16: the one per-game distance, the server's.
                SlabCell(label: "A game", figure: has ? formatDistance(d.averageM ?? d.totalM / Double(d.games), unit: x.unit) : "—",
                         caption: has ? "from \(d.games) of \(x.s.games.total) games" : "no distances yet")
                SlabRule(vertical: true)
                SlabCell(label: "Tracked", figure: "\(d.tracked)", caption: "\(d.tracked == 1 ? "game" : "games") with a track").padding(.leading, 20)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 26)
        }
    }
}

/// A figure in a cell of a slab: a quiet label, the figure, a line under.
private struct SlabCell: View {
    let label: String
    let figure: String
    let caption: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SlabLabel(label, quiet: true)
            SlabFigure(text: figure, size: 44).padding(.top, 8)
            Text(caption).font(.barlow(15, .semibold, relativeTo: .subheadline)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true).padding(.top, 8)
        }
        .padding(.trailing, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}

/// A heading on the grass with a line under it ("Cards shown").
private struct GrassHead: View {
    let title: String
    let sub: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            WordFit(text: title.uppercased(), face: .display, size: grown(40, .largeTitle), color: LF.chalk, line: 0.92)
                .padding(.trailing, 4)
                .accessibilityAddTraits(.isHeader)
            if let sub { Text(sub).font(.barlow(16, .semibold)).foregroundStyle(LF.chalkMuted).fixedSize(horizontal: false, vertical: true) }
        }
    }
}

/// WEB-24: the cards shown, three large cards rising out of a board slab cut on the diagonal, each with its count and rate.
private struct CardsShown: View {
    let s: Stats
    @State private var width: CGFloat = 0

    var body: some View {
        let d = s.discipline
        VStack(alignment: .leading, spacing: 0) {
            WidthReader(width: $width)
            GrassHead(title: "Cards shown", sub: d.games > 0 ? "From \(plural(d.games, "match report"))" : nil)
            if d.games == 0 {
                Text("No match reports in these games, so no cards to count.").font(.lfBodyMedium).foregroundStyle(LF.chalkMuted).padding(.top, 12)
            } else {
                // EVT-12: sin bins (second sin bins included) as a fourth card, only when there are any.
                let sinBins = d.sinBins ?? 0
                let items: [(CardKind, Int, String, String)] = [
                    (.yellow, d.cautions, d.cautions == 1 ? "Caution" : "Cautions", "\(rate(d.cautions, d.games)) a game"),
                    (.red, d.sendOffs, d.sendOffs == 1 ? "Send-off" : "Send-offs", "\(rate(d.sendOffs, d.games)) a game"),
                    (.second, d.secondCautions, d.secondCautions == 1 ? "Second caution" : "Second cautions", "Counted in both"),
                ] + (sinBins > 0 ? [(.sinBin, sinBins, sinBins == 1 ? "Sin bin" : "Sin bins", "\(rate(sinBins, d.games)) a game")] : [])
                // As Android's under 380 dp: the page's width less its margins; four cards a size smaller.
                let narrow = width <= 338 || items.count > 3
                let rise: CGFloat = narrow ? 66 : 84
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                        VStack(spacing: 0) {
                            CardShape(kind: item.0, width: narrow ? 64 : 82, height: narrow ? 88 : 112)
                            Text("\(item.1)").font(LfFace.display.font(narrow ? 44 : 50)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize()
                                .padding(.trailing, 3).padding(.top, 14)
                            WordFit(text: item.2.uppercased(), face: .word, size: grown(14, .footnote), color: LF.onBoard, tracking: 0.04, alignment: .center, line: 1.07)
                                .padding(.top, 8)
                            WordFit(text: item.3.uppercased(), face: .mono, size: grown(10, .caption2), color: LF.boardAccent, tracking: 0.06, alignment: .center)
                                .padding(.top, 4)
                        }
                        .padding(.horizontal, 4)
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(.trailing, slabCut + 4).padding(.bottom, 26)
                .background(alignment: .top) {
                    Color.clear.boardSurface(SlantShape(right: slabCut)).padding(.top, rise)
                }
                .padding(.top, 18)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Cards shown: " + items.map { "\($0.1) \($0.2.lowercased()), \($0.3)" }.joined(separator: "; "))
            }
        }
    }
}

/// STAT-6, STAT-14: the fees: earned huge, paid against owed head to head, the note on other currencies and the competitions as slanted bars.
private struct FeesSlab: View {
    let s: Stats

    var body: some View {
        let f = s.fees
        Slab(title: "Fees", icon: .money) {
            if let currency = f.currency, f.games > 0 {
                let m = { (amount: Double) in money(amount, currency) }
                SlabLabel("Earned")
                SlabFigure(text: m(f.earnedAmount), size: 64).padding(.top, 10)
                MintBar().padding(.top, 12)
                Text("\(m(f.earnedAmount / Double(f.games))) a game · \(plural(f.games, "game")) with a fee in \(currency)")
                    .font(.barlow(15, .semibold, relativeTo: .subheadline)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                VStack(spacing: 0) {
                    HStack {
                        Text("PAID").lfLabel(12).foregroundStyle(LF.onBoard)
                        Spacer()
                        Text(f.owedAmount > 0 ? "OWED" : "ALL PAID").lfLabel(12).foregroundStyle(LF.boardAccent)
                    }
                    HStack(alignment: .bottom) {
                        SlabFigure(text: m(f.paidAmount), size: 38)
                        if f.owedAmount > 0 { SlabFigure(text: m(f.owedAmount), size: 38, color: LF.boardAccent, alignment: .trailing) }
                    }
                    .padding(.top, 6)
                    HeadToHead(parts: [Share(value: f.paidAmount, color: LF.chalk), Share(value: f.owedAmount, color: LF.boardAccent)]).padding(.top, 10)
                }
                .padding(.top, 30)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Paid \(m(f.paidAmount)), owed \(m(f.owedAmount))")
                if !f.otherCurrencies.isEmpty {
                    Text("Not included: \(f.otherCurrencies.map { "\(money($0.amount, $0.currency)) from \(plural($0.games, "game"))" }.joined(separator: ", ")).")
                        .font(.barlow(13.5, .medium, relativeTo: .footnote)).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 16)
                }
                if !f.competitions.isEmpty {
                    SlabRule().padding(.top, 26)
                    SlabLabel("By competition").padding(.top, 22).padding(.bottom, 8)
                    SlantBars(rows: f.competitions.map { SlantBar(label: $0.name, value: $0.amount, display: m($0.amount), color: LF.chalk) })
                }
            } else {
                Text("No fees in these games\(f.currency.map { " in \($0)" } ?? "").").font(.barlow(16, .medium)).foregroundStyle(LF.muted)
                if !f.otherCurrencies.isEmpty {
                    Text("\(f.otherCurrencies.map { "\($0.games) in \($0.currency)" }.joined(separator: ", ")): change the currency in Settings to see them.")
                        .font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
                }
            }
        }
    }
}

/// A board's legend: a swatch and a small mono name each.
private struct Legend: View {
    let items: [(String, Color)]

    var body: some View {
        Flow(spacing: 18) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 6) {
                    Rectangle().fill(item.1).frame(width: 10, height: 10)
                    Text(item.0.uppercased()).lfLabel(11, spacing: 0.1).foregroundStyle(LF.muted)
                }
            }
        }
        .padding(.bottom, 4)
        .accessibilityHidden(true)
    }
}

/// STAT-3, STAT-14: the games a month for the newest 12 months the filters have, as a form guide: a row
/// a month, a lamp a game in its role's color and unlit lamps up to the busiest month (one bar of the
/// roles past 24 in a month).
private struct MonthsSlab: View {
    let s: Stats

    private struct Role {
        let label: String
        let color: Color
        let of: (StatsMonthsItem) -> Int
    }

    var body: some View {
        let months = Array(s.months.suffix(12))
        let roles = [
            Role(label: "Referee", color: LF.chalk) { $0.referee }, Role(label: "Assistant", color: LF.boardAccent) { $0.assistant },
            Role(label: "Fourth", color: LF.roleFourth) { $0.fourth }, Role(label: "Not set", color: LF.roleNone) { $0.notSet },
        ]
        let used = roles.filter { r in months.contains { r.of($0) > 0 } }
        let total = { (m: StatsMonthsItem) in roles.reduce(0) { $0 + $1.of(m) } }
        let most = max(1, months.map(total).max() ?? 1)
        let lamps = most <= 24
        let thisMonth = pattern("yyyy-MM").string(from: AppClock.now)
        let parse = pattern("yyyy-MM")
        // One width for every row's count, so the lamps line up when a month says "so far" at a large text size.
        let countWidth = max(40, LfFace.semibold.width("so far", grown(11, .caption2)) + 2)
        Slab(title: "Games a month", tag: lamps ? "Each light is one game" : nil) {
            if s.months.count > 12 { Text("The newest 12 months").font(.lfBodySmall).foregroundStyle(LF.muted).padding(.bottom, 8) }
            if used.count > 1 { Legend(items: used.map { ($0.label, $0.color) }) }
            VStack(spacing: 0) {
                ForEach(Array(months.enumerated()), id: \.offset) { i, m in
                    let date = parse.date(from: m.month) ?? Date()
                    let month = Calendar.current.component(.month, from: date)
                    let sum = total(m)
                    let soFar = m.month == thisMonth
                    let words = "\(pattern("MMMM yyyy").string(from: date))\(soFar ? " so far" : ""): \(plural(sum, "game"))"
                        + (used.count > 1 ? ", " + used.filter { $0.of(m) > 0 }.map { "\($0.of(m)) as \($0.label.lowercased())" }.joined(separator: ", ") : "")
                    if i > 0 { SlabRule() }
                    HStack(spacing: 10) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(pattern("MMM").string(from: date).uppercased()).font(LfFace.word.font(grown(18, .headline))).tracking(1.4).foregroundStyle(LF.onBoard).lineLimit(1).fixedSize()
                            if i == 0 || month == 1 { Text(String(Calendar.current.component(.year, from: date))).lfLabel(10, spacing: 0.08).foregroundStyle(LF.onBoardMuted) }
                        }
                        .frame(width: 46, alignment: .leading)
                        GeometryReader { geo in
                            let lit = used.flatMap { r in Array(repeating: r.color, count: r.of(m)) }
                            if lamps {
                                let gap: CGFloat = 3
                                let lamp = min(30, (min(geo.size.width, 34 * CGFloat(most)) - gap * CGFloat(most - 1)) / CGFloat(most))
                                HStack(spacing: gap) {
                                    ForEach(0..<most, id: \.self) { k in Rectangle().fill(k < lit.count ? lit[k] : LF.boardDots).frame(width: lamp, height: 26) }
                                }
                            } else {
                                let room = geo.size.width - 2 * CGFloat(used.count)
                                HStack(spacing: 2) {
                                    ForEach(Array(used.enumerated()), id: \.offset) { _, r in
                                        if r.of(m) > 0 { Rectangle().fill(r.color).frame(width: room * CGFloat(r.of(m)) / CGFloat(most)) }
                                    }
                                    Rectangle().fill(LF.boardDots)
                                }
                            }
                        }
                        .frame(height: 26)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("\(sum)").font(LfFace.display.font(30)).foregroundStyle(LF.onBoardStrong).padding(.trailing, 2)
                            if soFar { Text("so far").font(.barlow(11, .semibold, relativeTo: .caption2)).foregroundStyle(LF.onBoardMuted) }
                        }
                        .frame(width: countWidth, alignment: .leading)
                    }
                    .frame(minHeight: 44)
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(words)
                }
            }
            .padding(.top, 6)
        }
    }
}

/// Who you work with most, as a broadcast's name strap: a mint tag, the surname on chalk, the games
/// together on a strip of the board; a saved referee opens their page.
private struct MostWith: View {
    let x: Ctx

    var body: some View {
        let most = x.s.referees.top[0]
        let last = surname(most.name).isEmpty ? most.name : surname(most.name)
        let strap = VStack(alignment: .leading, spacing: 0) {
            Text("MOST WITH").lfLabel(12).foregroundStyle(LF.board)
                .padding(.leading, 16).padding(.trailing, 30)
                .frame(height: 32)
                .background(SlantShape(right: 14).fill(LF.boardAccent))
            WordFit(text: last.uppercased(), face: .display, size: 48, color: LF.board, line: 0.96)
                .padding(.trailing, 4)
                .padding(.leading, 20).padding(.trailing, 44).padding(.top, 10).padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SlantShape(right: 24).fill(LF.chalk))
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    (Text("\(most.games)").font(LfFace.display.font(28)).foregroundColor(LF.onBoardStrong)
                        + Text(" \(most.games == 1 ? "GAME" : "GAMES") TOGETHER").font(.condensed(16, relativeTo: .subheadline)).foregroundColor(LF.onBoard))
                        .tracking(0.9)
                    if last != most.name { Text(most.name).font(.barlow(14, .semibold, relativeTo: .footnote)).foregroundStyle(LF.onBoardMuted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if most.refereeId != nil { PhIcon(.open, size: 20, tint: LF.onBoard) }
            }
            .padding(.leading, 18).padding(.trailing, 34).padding(.vertical, 8)
            .frame(minHeight: 48)
            .boardSurface(SlantShape(right: 18))
            .padding(.leading, 18)
        }
        .frame(maxWidth: 520, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Most with \(most.name): \(plural(most.games, "game")) together")
        if let id = most.refereeId {
            Button { x.open(.referee(id)) } label: { strap.contentShape(Rectangle()) }
                .buttonStyle(PressStyle())
                .accessibilityAddTraits(.isLink)
                .accessibilityHint("Opens \(most.name)")
        } else {
            strap
        }
    }
}

/// The small figures on a strip of the board from touchline to touchline: goals, referees worked with
/// and pitches, under the period's mint tab. It stays still.
private struct Ticker: View {
    let x: Ctx
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let d = x.s.discipline
        let items: [(String, Int, String)] = (d.games > 0 ? [("Goals", d.goals, "\(rate(d.goals, d.games)) a game")] : []) + [
            ("Referees", x.s.referees.count, "worked with"),
            ("Pitches", x.s.places.pitches, "at \(plural(x.s.places.venues, "venue"))"),
        ]
        let period = periodName(x.time)
        VStack(alignment: .leading, spacing: 0) {
            Text(period.uppercased()).font(.display(20, relativeTo: .title3)).foregroundStyle(LF.board).padding(.trailing, 2)
                .padding(.leading, 10).padding(.trailing, 48).padding(.vertical, 6)
                .frame(minHeight: 36)
                .background(SlantShape(right: 22).fill(LF.boardAccent))
            HStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                    if i > 0 {
                        Canvas { c, size in
                            let skew = size.height * 0.16
                            c.fill(Path { p in
                                p.move(to: CGPoint(x: skew + 2, y: 0)); p.addLine(to: CGPoint(x: skew + 5, y: 0))
                                p.addLine(to: CGPoint(x: 3, y: size.height)); p.addLine(to: CGPoint(x: 0, y: size.height)); p.closeSubpath()
                            }, with: .color(LF.kitBlank))
                        }
                        .frame(width: 10).padding(.vertical, 6)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        WordFit(text: item.0.uppercased(), face: .mono, size: grown(12, .caption1), color: LF.boardAccent, tracking: 0.14)
                        Text("\(item.1)").font(LfFace.display.font(40)).foregroundStyle(LF.onBoardStrong).padding(.trailing, 3).padding(.top, 4)
                        Text(item.2).font(.barlow(14, .semibold, relativeTo: .footnote)).foregroundStyle(LF.onBoardMuted).fixedSize(horizontal: false, vertical: true).padding(.top, 2)
                    }
                    .padding(.leading, i > 0 ? 8 : 0).padding(.trailing, 6).padding(.vertical, 6)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 14)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LF.board)
        .overlay { if scheme == .dark { Rectangle().stroke(LF.boardEdge, lineWidth: 1) } }
        .ground(.board)
        .toTouchlines()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(period): " + items.map { "\($0.0) \($0.1), \($0.2)" }.joined(separator: "; "))
    }
}

/// TRK-9: where the periods were spent across the games with GPS, on its slab: Referee or Assistant, the
/// heatmap, and the time in each third lined up with the pitch.
private struct WhereOnThePitch: View {
    let x: Ctx
    @State private var role: String?

    var body: some View {
        let maps = x.s.fitness.heatmaps ?? []
        let heat = maps.first { $0.role == (role ?? maps[0].role) } ?? maps[0]
        let games = plural(heat.games, "game")
        let asRole = heat.role == "referee" ? "as referee" : "as an assistant"
        let thirds = pitchThirds(heat.cells, cols: heat.cols, rows: heat.rows)
        let label = "Where you spent the periods in \(games) \(asRole), on the pitch. Thirds of the length, left to right: \(thirds.length.map { "\($0)%" }.joined(separator: ", ")). Of the width, far side to near: \(thirds.width.map { "\($0)%" }.joined(separator: ", "))."
        Slab(title: "Where on the pitch", tag: "From above") {
            Text("\(games) with GPS \(asRole)".uppercased()).font(.display(24, relativeTo: .title2)).foregroundStyle(LF.onBoardStrong).padding(.trailing, 2).fixedSize(horizontal: false, vertical: true)
            Text(heat.role == "assistant" ? "The periods, your touchline at the bottom." : "The periods; with the kickoff direction from the watch, the first kickoff team attacks left to right.")
                .font(.barlow(14, .medium, relativeTo: .footnote)).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 8)
            if maps.count > 1 {
                Segmented(options: maps.map { ($0.role, $0.role == "referee" ? "Referee" : "Assistant") }, selected: Binding(get: { role ?? maps[0].role }, set: { role = $0 }),
                          background: LF.boardDots, minHeight: 48, fill: true)
                    .padding(.top, 16)
            }
            // TRK-9, WEB-24: painted on the grass, on a standard pitch, the thirds lined up with it.
            PitchHeatmap(cols: heat.cols, rows: heat.rows, cells: heat.cells, unit: x.unit, label: label, thirds: thirds)
                .padding(.top, 20)
        }
    }
}

/// In detail on the halfway line, its three parts linked: each scrolls to its heading.
private struct InDetailHead: View {
    @Environment(\.pageScroll) private var scroll

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("IN DETAIL").font(.display(46, relativeTo: .largeTitle)).foregroundStyle(LF.chalk).padding(.trailing, 4).accessibilityAddTraits(.isHeader)
            Flow(spacing: 0) {
                ForEach(Array([("running", "The running"), ("fixtures", "The fixtures"), ("games", "The games")].enumerated()), id: \.offset) { _, part in
                    let (key, label) = part
                    Button {
                        withAnimation(.easeInOut(duration: 0.4)) { scroll?.scrollTo(key, anchor: .top) }
                    } label: {
                        Text(label.uppercased()).lfWord(15).foregroundStyle(LF.chalk).padding(.horizontal, 8).frame(minHeight: 48).contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityHint("Goes to \(label)")
                }
            }
            .padding(.top, 6).padding(.leading, -8)
            Halfway().padding(.top, 20)
        }
    }
}

/// STAT-3: the average distance a game in each role, head to head.
private struct DistanceByRole: View {
    let x: Ctx

    var body: some View {
        let byRole = x.s.distance.byRole
        let colorOf = ["referee": LF.chalk, "assistant": LF.boardAccent, "fourth": LF.roleFourth]
        Slab(title: "Distance by role", tag: x.unit == "mi" ? "Miles a game" : "Km a game", cut: true) {
            if byRole.isEmpty {
                Text("No distances in these games yet.").font(.barlow(16, .medium)).foregroundStyle(LF.muted)
            } else {
                let pairs = stride(from: 0, to: byRole.count, by: 2).map { Array(byRole[$0..<min($0 + 2, byRole.count)]) }
                ForEach(Array(pairs.enumerated()), id: \.offset) { row, pair in
                    HStack(alignment: .top, spacing: 18) {
                        ForEach(Array(pair.enumerated()), id: \.offset) { i, r in
                            let color = colorOf[r.role] ?? LF.chalk
                            // With two, the second sits at the right, as the head to head runs.
                            let right = byRole.count == 2 && i == 1
                            VStack(alignment: right ? .trailing : .leading, spacing: 0) {
                                SlabLabel(roleWords[r.role] ?? r.role, color: color, alignment: right ? .trailing : .leading)
                                SlabFigure(text: formatDistance(r.averageM, unit: x.unit), size: 44, color: color, alignment: right ? .trailing : .leading).padding(.top, 8)
                                Text(plural(r.games, "game")).font(.barlow(14, .semibold, relativeTo: .footnote)).foregroundStyle(LF.onBoardMuted).padding(.top, 6)
                            }
                            .frame(maxWidth: .infinity, alignment: right ? .trailing : .leading)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(roleWords[r.role] ?? r.role): \(formatDistance(r.averageM, unit: x.unit)) a game, from \(plural(r.games, "game"))")
                        }
                        if pair.count == 1 { Spacer().frame(maxWidth: .infinity) }
                    }
                    .padding(.top, row > 0 ? 18 : 0)
                }
                HeadToHead(parts: byRole.map { Share(value: $0.averageM, color: colorOf[$0.role] ?? LF.chalk) }, height: 28).padding(.top, 22)
            }
        }
    }
}

/// The longest and shortest games as a tale of the tape: the two side by side, distance, date, role and the match, which opens it.
private struct LongestShortest: View {
    let x: Ctx

    var body: some View {
        let long = x.s.distance.longest!
        let short = x.s.distance.shortest!
        let role = { (r: String?) -> String in r == nil ? "—" : r == "fourth" ? "4th official" : roleWords[r!] ?? r! }
        Slab(title: "Longest and shortest") {
            HStack(spacing: 0) {
                Text("LONGEST").font(LfFace.display.font(22)).foregroundStyle(LF.board).lineLimit(1).minimumScaleFactor(0.55)
                    .padding(.leading, 14).padding(.trailing, 26)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .background(SlantShape(right: tabCut).fill(LF.chalk))
                Text("SHORTEST").font(LfFace.display.font(22)).foregroundStyle(LF.board).lineLimit(1).minimumScaleFactor(0.55)
                    .padding(.leading, 26).padding(.trailing, 14)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
                    .background(SlantShape(left: tabCut).fill(LF.boardAccent))
            }
            .frame(height: 42)
            .accessibilityHidden(true)
            tapeRow(0, "Distance") { longest in
                SlabFigure(text: formatDistance(longest ? long.distanceM : short.distanceM, unit: x.unit), size: 40,
                           color: longest ? LF.onBoardStrong : LF.boardAccent, alignment: longest ? .leading : .trailing)
            }
            tapeRow(1, "Date") { longest in TapeWords(text: shortDay(longest ? long.kickoff : short.kickoff), left: longest) }
            tapeRow(2, "Role") { longest in TapeWords(text: role(longest ? long.role : short.role), left: longest) }
            tapeRow(3, "Match", last: true) { longest in
                let id = longest ? long.matchId : short.matchId
                let title = longest ? long.title : short.title
                Button { x.open(.match(id)) } label: {
                    Text(title).font(.barlow(14, .semibold, relativeTo: .footnote)).underline().foregroundStyle(LF.onBoardStrong)
                        .multilineTextAlignment(longest ? .leading : .trailing)
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: longest ? .leading : .trailing)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(longest ? "Longest" : "Shortest"): \(title)")
                .accessibilityAddTraits(.isLink)
            }
        }
    }

    private func tapeRow<Cell: View>(_ i: Int, _ label: String, last: Bool = false, @ViewBuilder cell: @escaping (Bool) -> Cell) -> some View {
        VStack(spacing: 0) {
            if i > 0 { SlabRule() }
            Text(label.uppercased()).lfLabel(12).foregroundStyle(LF.onBoardMuted).frame(maxWidth: .infinity).padding(.top, 10).accessibilityHidden(true)
            HStack(alignment: .top, spacing: 0) {
                cell(true).frame(maxWidth: .infinity, alignment: .leading).padding(.trailing, 8)
                cell(false).frame(maxWidth: .infinity, alignment: .trailing).padding(.leading, 8)
            }
            .padding(.top, 6).padding(.bottom, last ? 0 : 8)
        }
        .padding(.top, i == 0 ? 8 : 0)
    }
}

private struct TapeWords: View {
    let text: String
    let left: Bool

    var body: some View {
        Text(text.uppercased()).font(.condensed(17, relativeTo: .headline)).tracking(0.7).foregroundStyle(LF.onBoardStrong)
            .multilineTextAlignment(left ? .leading : .trailing)
            .frame(maxWidth: .infinity, alignment: left ? .leading : .trailing)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// STAT-3: the running total as one track, a stretch for each month (or year), each as long as the
/// distance in it, a notch for each game, and the total at the end of each stretch under it; a tap on a
/// stretch says what's in it.
private struct DistanceOverTime: View {
    let x: Ctx
    @State private var picked: Int?

    var body: some View {
        let over = x.s.distance.overTime
        let unit = x.unit
        let per = unit == "mi" ? 1609.344 : 1000
        let ticks = axisTicks((over.last?.totalM ?? 0) / per)
        let top = ticks.last ?? 1
        let stretches = runningStretches(over.map { RunGame(kickoff: $0.kickoff, distanceM: $0.distanceM, totalM: $0.totalM) })
        let num = { (metres: Double) in figureAndUnit(formatDistance(metres, unit: unit)).figure }
        let unitWord = unit == "mi" ? "mi" : "km"
        let thisMonth = pattern("yyyy-MM").string(from: AppClock.now)
        let endDay = { (iso: String) in instantOf(iso).map { pattern("MMM d").string(from: $0).uppercased() } ?? "" }
        let describe = { (i: Int) -> String in
            let st = stretches[i]
            return "\(st.label)\(st.sub.map { " \($0)" } ?? ""): +\(formatDistance(st.addedM, unit: unit)) in \(plural(st.games, "game")), \(formatDistance(st.totalM, unit: unit)) by \(shortDay(st.lastKickoff))"
        }
        Slab(title: "Distance over time", tag: "Running total") {
            Canvas { c, size in
                let w = size.width
                let at = { (metres: Double) in CGFloat((metres / per) / top) * w }
                // The axis's steps, the first at the left and the last (with its unit) at the right; one between that would touch a neighbor is left out.
                let labels = ticks.enumerated().map { i, t -> (GraphicsContext.ResolvedText, CGFloat, CGFloat) in
                    let words = "\(t == floor(t) ? String(Int(t)) : String(t))\(i == ticks.count - 1 ? " \(unitWord)" : "")"
                    let l = c.resolve(Text(words).font(LfFace.mono.font(11)).foregroundColor(LF.onBoardMuted))
                    let lw = l.measure(in: size).width
                    let px = CGFloat(t / top) * w
                    return (l, lw, i == 0 ? 0 : i == ticks.count - 1 ? px - lw : px - lw / 2)
                }
                var right = -CGFloat.infinity
                for (i, item) in labels.enumerated() {
                    let last = i == labels.count - 1
                    if last || (item.2 >= right + 8 && item.2 + item.1 <= labels.last!.2 - 8) {
                        c.draw(item.0, at: CGPoint(x: item.2, y: 0), anchor: .topLeading)
                        right = item.2 + item.1
                    }
                }
                let barTop: CGFloat = 24
                let barH: CGFloat = 40
                c.fill(Path(CGRect(x: 0, y: barTop, width: w, height: barH)), with: .color(LF.boardDots))
                var start = 0.0
                for (i, st) in stretches.enumerated() {
                    let x0 = at(start)
                    let x1 = at(st.totalM)
                    start = st.totalM
                    let last = i == stretches.count - 1
                    let dim = picked != nil && picked != i
                    let fill = (last ? LF.boardAccent : LF.chalk).opacity(dim ? 0.45 : 1)
                    if last {
                        c.fill(SlantShape(right: min(12, x1 - x0)).path(in: CGRect(x: x0, y: barTop, width: x1 - x0, height: barH)), with: .color(fill))
                    } else {
                        c.fill(Path(CGRect(x: x0, y: barTop, width: x1 - x0, height: barH)), with: .color(fill))
                        c.fill(Path(CGRect(x: x1 - 3, y: barTop, width: 3, height: barH)), with: .color(LF.board))
                    }
                    let words = "\(st.label) +\(num(st.addedM))\(last && st.key == thisMonth ? " · so far" : "")".uppercased()
                    let l = c.resolve(Text(words).font(LfFace.word.font(15)).tracking(0.6).foregroundColor(LF.board))
                    let ls = l.measure(in: size)
                    if x1 - x0 >= ls.width + 20 { c.draw(l, at: CGPoint(x: x0 + 10, y: barTop + barH / 2), anchor: .leading) }
                }
                // A notch at each game, where its distance ends.
                for g in over.dropLast() {
                    c.fill(Path(CGRect(x: at(g.totalM) - 1, y: barTop + barH - 8, width: 2, height: 8)), with: .color(LF.board.opacity(0.5)))
                }
                // The ends under it, as many as fit without touching.
                let ends = stretches.map { at($0.totalM) }
                let shown = spacedLabels(ends.map { p in Double(p + (p > w * 0.88 ? -40 : p < w * 0.08 ? 40 : 0)) }, gap: 84)
                let endTop = barTop + barH
                for (i, st) in stretches.enumerated() where shown[i] {
                    let last = i == stretches.count - 1
                    let px = ends[i]
                    let figure = c.resolve(Text("\(num(st.totalM))\(last ? " \(unitWord.uppercased())" : "")").font(LfFace.display.font(26)).foregroundColor(last ? LF.boardAccent : LF.onBoardStrong))
                    let date = c.resolve(Text(endDay(st.lastKickoff)).font(LfFace.mono.font(10.5)).tracking(1.05).foregroundColor(LF.onBoardMuted))
                    let fs = figure.measure(in: size)
                    let ds = date.measure(in: size)
                    let anchor: UnitPoint = px > w * 0.88 ? .topTrailing : px < w * 0.08 ? .topLeading : .top
                    let ax = px > w * 0.88 ? min(px, w - 2) : px
                    c.fill(Path(CGRect(x: px - 1, y: endTop, width: 2, height: 10)), with: .color(LF.onBoard))
                    c.draw(figure, at: CGPoint(x: ax, y: endTop + 12), anchor: anchor)
                    c.draw(date, at: CGPoint(x: ax, y: endTop + 12 + fs.height - 2), anchor: anchor)
                    _ = ds
                }
            }
            .frame(height: 130)
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { at in tap(at, stretches: stretches, per: per, top: top) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("The running total: " + stretches.indices.map(describe).joined(separator: "; ") + ".")
            Text(picked.map(describe) ?? "Tap a stretch to see its games")
                .font(.lfBodySmall).foregroundStyle(picked != nil ? LF.text : LF.muted)
                .frame(minHeight: 36, alignment: .topLeading).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
                .accessibilityHidden(true)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { trackWidth = $0 - 32 }
    }

    @State private var trackWidth: CGFloat = 300

    private func tap(_ at: CGPoint, stretches: [Stretch], per: Double, top: Double) {
        let k = Double(at.x / max(1, trackWidth)) * top
        var start = 0.0
        var found: Int?
        for (i, st) in stretches.enumerated() {
            let end = st.totalM / per
            if k >= start && k <= end { found = i; break }
            start = end
        }
        picked = found == nil || found == picked ? nil : found
    }
}

/// STAT-8, STAT-14: fitness as its figures, then the time at each speed and in each heart-rate zone (or the prompt to set a maximum heart rate).
private struct Fitness: View {
    let x: Ctx

    private struct Fig {
        let icon: Ph
        let label: String
        let text: String
        let sub: String
    }

    var body: some View {
        let f = x.s.fitness
        let unit = x.unit
        let hearts = f.games.compactMap(\.avgBpm)
        let sprints = f.games.compactMap(\.sprints)
        let speeds = f.games.compactMap(\.topSpeedMps)
        let figures = [
            // STAT-16: a game's distance is one figure, Distance's own (distance.averageM), so it isn't here too.
            hearts.isEmpty ? nil : Fig(icon: .heart, label: "Heart rate", text: "\(Int((Double(hearts.reduce(0, +)) / Double(hearts.count)).rounded())) bpm", sub: "average"),
            sprints.isEmpty ? nil : Fig(icon: .sprint, label: "Sprints", text: rate(sprints.reduce(0, +), sprints.count), sub: "a game · \(sprints.reduce(0, +)) in all"),
            speeds.isEmpty ? nil : Fig(icon: .speed, label: "Top speed", text: formatSpeed(speeds.max()!, unit: unit), sub: "the fastest in these games"),
        ].compactMap { $0 }
        let pairs = stride(from: 0, to: figures.count, by: 2).map { Array(figures[$0..<min($0 + 2, figures.count)]) }
        Slab(title: "Fitness", tag: "\(plural(f.games.count, "game")) with a track", icon: .heart) {
            ForEach(Array(pairs.enumerated()), id: \.offset) { row, pair in
                if row > 0 { SlabRule().padding(.vertical, 20) }
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(pair.enumerated()), id: \.offset) { i, fig in
                        if i > 0 { SlabRule(vertical: true) }
                        VStack(alignment: .leading, spacing: 0) {
                            SlabLabel(fig.label, icon: fig.icon)
                            SlabFigure(text: fig.text, size: 40).padding(.top, 8)
                            MintBar(height: 8, fraction: 0.8, most: 120).padding(.top, 10)
                            Text(fig.sub).font(.barlow(14, .semibold, relativeTo: .footnote)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                        }
                        .padding(.leading, i > 0 ? 18 : 0).padding(.trailing, 10)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .accessibilityElement(children: .combine)
                    }
                    if pair.count == 1 { Spacer().frame(maxWidth: .infinity) }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            if let bands = f.speedBands, bands.contains(where: { $0.sec > 0 }) {
                let starts = bandStarts(f.sprintKph ?? 21)
                let speed = { (kph: Double) in Int((unit == "mi" ? kph / 1.609344 : kph).rounded()) }
                let word = unit == "mi" ? "mph" : "km/h"
                let items = bands.enumerated().map { i, b in
                    let range = i == bands.count - 1 ? "\(speed(starts[i])) \(word) and up" : i == 0 ? "under \(speed(starts[1])) \(word)" : "\(speed(starts[i]))–\(speed(starts[i + 1])) \(word)"
                    return TimeBand(name: bandNames[b.band] ?? b.band, sub: range, sec: b.sec, color: LF.boardSpeed[i % LF.boardSpeed.count])
                }
                FitPart {
                    SlabLabel("Time in speed bands")
                    ElbowBar(bands: items, summary: "Time in speed bands: " + elbowWords(items)).padding(.top, 14)
                }
            }
            if let zones = f.zones {
                if zones.contains(where: { $0.sec > 0 }) {
                    let items = zones.enumerated().map { i, z in
                        TimeBand(name: "Zone \(z.zone)", sub: i + 1 < zones.count ? "\(z.fromBpm)–\(zones[i + 1].fromBpm - 1) bpm" : "\(z.fromBpm) bpm and up", sec: z.sec, color: LF.boardZones[i % LF.boardZones.count])
                    }
                    FitPart {
                        SlabLabel("Heart-rate zones\(f.maxHeartRate.map { " · max \($0) bpm" } ?? "")")
                        ElbowBar(bands: items, summary: "Time in each heart-rate zone: " + elbowWords(items), stepped: true).padding(.top, 14)
                    }
                }
            } else if !hearts.isEmpty {
                FitPart {
                    Button { x.open(.settings) } label: {
                        (Text("Set your maximum heart rate").underline().foregroundColor(LF.onBoardStrong).font(.barlow(15, .semibold, relativeTo: .subheadline))
                            + Text(" in Settings to see the time in each heart-rate zone.").foregroundColor(LF.muted).font(.lfBodyMedium))
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens Settings")
                }
            }
        }
    }

    private func elbowWords(_ items: [TimeBand]) -> String {
        let pcts = shares(items.map(\.sec))
        return items.enumerated().map { i, b in "\(b.name), \(b.sub): \(pcts[i])%, \(duration(b.sec))" }.joined(separator: "; ")
    }
}

private struct FitPart<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SlabRule()
            VStack(alignment: .leading, spacing: 0, content: content).padding(.top, 22)
        }
        .padding(.top, 28)
    }
}

/// STAT-15: the watches the games were recorded on, most used first, two to a row, each drawn flat with
/// its face showing the battery it used an hour as a ring (full at 30% an hour) and the figure.
private struct Watches: View {
    let s: Stats

    var body: some View {
        let models = watchesShown(s.watches)
        let pairs = stride(from: 0, to: models.count, by: 2).map { Array(models[$0..<min($0 + 2, models.count)]) }
        Slab(title: "Your watches", tag: "Battery an hour", icon: .watch) {
            ForEach(Array(pairs.enumerated()), id: \.offset) { row, pair in
                HStack(alignment: .top, spacing: 12) {
                    ForEach(pair, id: \.device) { m in WatchItem(m: m).frame(maxWidth: .infinity) }
                    if pair.count == 1 { Spacer().frame(maxWidth: .infinity) }
                }
                .padding(.top, row > 0 ? 26 : 0)
            }
            Text("The ring is the battery used an hour, from kickoff to full time: full at \(Int(ringFullPerHour))% an hour.")
                .font(.barlow(13.5, .regular, relativeTo: .footnote)).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true).padding(.top, 20)
        }
    }
}

private struct WatchItem: View {
    let m: StatsWatchesModelsItem

    var body: some View {
        VStack(spacing: 0) {
            WatchDrawing(m: m).frame(maxWidth: 150)
            // The platform only where the name doesn't already say it; kept as a blank line so the names line up.
            Text(platformLabel(m)?.uppercased() ?? " ").lfLabel(12).foregroundStyle(LF.boardAccent).padding(.top, 14)
            WordFit(text: m.name.uppercased(), face: .display, size: grown(21, .title3), color: LF.onBoardStrong, alignment: .center, line: 1).padding(.top, 4)
            Text("\(plural(m.games, "game")) on it").font(.barlow(15, .semibold, relativeTo: .subheadline)).foregroundStyle(LF.onBoard).multilineTextAlignment(.center).padding(.top, 4)
            Text(watchCaption(m)).font(.barlow(14, .medium, relativeTo: .footnote)).foregroundStyle(LF.onBoardMuted).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(describeWatch(m))
    }
}

/// The watches' own grays (DESIGN.md `--watch-*`), the same day and night.
private let watchStrap = Color(uiColor: UIColor(hex: 0x1D2321))
private let watchCase = Color(uiColor: UIColor(hex: 0x2F3533))
private let watchCaseEdge = Color(uiColor: UIColor(hex: 0x161A19))
private let watchButton = Color(uiColor: UIColor(hex: 0x59625E))
private let watchDim = Color(uiColor: UIColor(hex: 0xAAAAAA))

/// A watch drawn flat in a real watch's grays (round, or Apple Watch's rounded square), its face the
/// battery used an hour: a ring and the figure, in a 200 × 264 drawing whose words scale with it.
private struct WatchDrawing: View {
    let m: StatsWatchesModelsItem

    var body: some View {
        let share = ringShare(m.drainPerHour)
        let square = m.platform == "applewatch"
        let has = hasBattery(m)
        let figure = watchFigure(m)
        Canvas { c, size in
            let k = size.width / 200
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ radius: CGFloat, _ color: Color) {
                c.fill(Path(roundedRect: CGRect(x: x * k, y: y * k, width: w * k, height: h * k), cornerRadius: radius * k), with: .color(color))
            }
            let strapX: CGFloat = square ? 58 : 60
            let strapW: CGFloat = square ? 84 : 80
            r(strapX, 0, strapW, 70, 10, watchStrap)
            r(strapX, 194, strapW, 70, 10, watchStrap)
            var ring = Path()
            if square {
                r(172, 88, 12, 34, 5, watchButton)
                r(174, 136, 8, 28, 3, watchButton)
                r(24, 52, 152, 160, 42, watchCase)
                c.stroke(Path(roundedRect: CGRect(x: 24 * k, y: 52 * k, width: 152 * k, height: 160 * k), cornerRadius: 42 * k), with: .color(watchCaseEdge), lineWidth: 3 * k)
                r(36, 64, 128, 136, 32, .black)
                // Apple Watch's ring: a rounded rectangle's outline from the middle of its top, clockwise.
                let x0 = 46 * k, y0 = 74 * k, x1 = 154 * k, y1 = 190 * k, rr = 22 * k
                ring.move(to: CGPoint(x: 100 * k, y: y0))
                ring.addLine(to: CGPoint(x: x1 - rr, y: y0))
                ring.addArc(center: CGPoint(x: x1 - rr, y: y0 + rr), radius: rr, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
                ring.addLine(to: CGPoint(x: x1, y: y1 - rr))
                ring.addArc(center: CGPoint(x: x1 - rr, y: y1 - rr), radius: rr, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
                ring.addLine(to: CGPoint(x: x0 + rr, y: y1))
                ring.addArc(center: CGPoint(x: x0 + rr, y: y1 - rr), radius: rr, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
                ring.addLine(to: CGPoint(x: x0, y: y0 + rr))
                ring.addArc(center: CGPoint(x: x0 + rr, y: y0 + rr), radius: rr, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
                ring.closeSubpath()
            } else {
                r(180, 96, 12, 24, 4, watchButton)
                r(180, 144, 12, 24, 4, watchButton)
                r(8, 120, 12, 24, 4, watchButton)
                let center = CGPoint(x: 100 * k, y: 132 * k)
                func circle(_ radius: CGFloat) -> Path { Path(ellipseIn: CGRect(x: center.x - radius * k, y: center.y - radius * k, width: 2 * radius * k, height: 2 * radius * k)) }
                c.fill(circle(86), with: .color(watchCase))
                c.stroke(circle(86), with: .color(watchCaseEdge), lineWidth: 3 * k)
                c.fill(circle(76), with: .color(.black))
                ring.addArc(center: center, radius: 66 * k, startAngle: .degrees(-90), endAngle: .degrees(270), clockwise: false)
            }
            c.stroke(ring, with: .color(LF.boardDots), lineWidth: 9 * k)
            if share > 0 { c.stroke(ring.trimmedPath(from: 0, to: share), with: .color(LF.boardAccent), style: StrokeStyle(lineWidth: 9 * k, lineCap: .butt)) }
            // The figure and its word scale with the drawing, as the website's SVG text does.
            let f = c.resolve(Text(figure).font(LfFace.display.font(46 * k)).foregroundColor(.white))
            let u = c.resolve(Text(has ? "AN HOUR" : "NO READINGS").font(LfFace.mono.font(10.5 * k)).tracking(10.5 * k * 0.14).foregroundColor(watchDim))
            let fh = 46 * k * 0.7
            let uh = u.measure(in: size).height
            let block = fh + 6 * k + uh
            let top = 132 * k - block / 2
            // The digits stand 0.7 em over the baseline.
            c.draw(f, at: CGPoint(x: 100 * k, y: top + fh), anchor: UnitPoint(x: 0.5, y: 1.0 / 1.2))
            c.draw(u, at: CGPoint(x: 100 * k, y: top + fh + 6 * k), anchor: .top)
        }
        .aspectRatio(200 / 264, contentMode: .fit)
        .accessibilityHidden(true)
    }
}

private let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
private let dayNamesFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

/// A kickoff hour as the phone writes times: "9 AM", or "09:00".
private func hourName(_ h: Int) -> String { uses24Hours() ? String(format: "%02d:00", h) : "\(h % 12 == 0 ? 12 : h % 12) \(h < 12 ? "AM" : "PM")" }

/// STAT-3, STAT-14: the busiest times as a fixtures grid of lit tiles, turned for a phone: the days across, the kickoff hours down.
private struct Busiest: View {
    let x: Ctx

    var body: some View {
        let grid = busiestGrid(x.s.busiest.map { ($0.day, $0.hour, $0.games) })
        Slab(title: "Busiest times", tag: "Games by kickoff") {
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    Color.clear.frame(width: 52, height: 1)
                    ForEach(dayNames, id: \.self) { d in
                        Text(d.uppercased()).font(LfFace.word.font(15)).tracking(0.3).foregroundStyle(LF.onBoard).lineLimit(1).minimumScaleFactor(0.6).frame(maxWidth: .infinity)
                    }
                }
                ForEach(grid.hours, id: \.self) { h in
                    HStack(spacing: 4) {
                        Text(hourName(h)).font(LfFace.mono.font(10)).tracking(0.2).foregroundStyle(LF.onBoardMuted).lineLimit(1).fixedSize().frame(width: 52, alignment: .leading)
                        ForEach(0..<7, id: \.self) { d in
                            let n = grid.at(d, h)
                            let step = lightStep(n, grid.max)
                            ZStack {
                                if step == 0 {
                                    Circle().fill(LF.onBoardDim.opacity(0.5)).frame(width: 4, height: 4)
                                } else {
                                    RoundedRectangle(cornerRadius: 3).fill(LF.heat[step - 1])
                                    Text("\(n)").font(LfFace.display.font(20)).foregroundStyle(step <= 3 ? LF.chalk : LF.board).lineLimit(1).fixedSize()
                                }
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .frame(height: 30)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Games by day and kickoff hour, in each match's time zone: " + x.s.busiest.map { "\(dayNamesFull[$0.day]) \(hourName($0.hour)), \($0.games)" }.joined(separator: ", "))
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                Text("FEWER").lfLabel(11, spacing: 0.08).foregroundStyle(LF.onBoardMuted).padding(.trailing, 8)
                ForEach(0..<6, id: \.self) { Rectangle().fill(LF.heat[$0]).frame(width: 16, height: 12).padding(.horizontal, 1.5) }
                Text("MORE GAMES").lfLabel(11, spacing: 0.08).foregroundStyle(LF.onBoardMuted).padding(.leading, 8)
            }
            .padding(.top, 16)
            .accessibilityHidden(true)
        }
    }
}

/// STAT-3: where, as a league table on a chalk panel: the venues and pitches with the most games, ranked (sharing a rank on a tie), each opening its venue.
private struct Places: View {
    let x: Ctx

    var body: some View {
        let p = x.s.places
        Slab(title: "Where", tag: "\(plural(p.pitches, "pitch", "pitches")) · \(plural(p.venues, "venue"))", ground: .panel) {
            if p.top.isEmpty {
                Text("These games have no venues set.").font(.lfBodyLarge).foregroundStyle(LF.muted)
            } else {
                let most = max(1, p.top.map(\.games).max() ?? 1)
                let rank = ranks(p.top.map(\.games))
                Rectangle().fill(LF.inkRule).frame(height: 3)
                ForEach(Array(p.top.enumerated()), id: \.offset) { i, place in
                    if i > 0 { Hairline() }
                    Button { x.open(.venue(place.venueId)) } label: {
                        HStack(spacing: 12) {
                            Text("\(rank[i])").font(LfFace.display.font(26)).foregroundStyle(LF.brand).frame(width: 30, alignment: .leading)
                            VStack(alignment: .leading, spacing: 8) {
                                (Text(place.venue).foregroundColor(LF.text) + Text(place.pitch.map { " · \($0)" } ?? "").foregroundColor(LF.muted).font(.barlow(16, .medium)))
                                    .font(.barlow(16, .semibold)).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                GeometryReader { geo in Rectangle().fill(LF.brand).frame(width: geo.size.width * CGFloat(place.games) / CGFloat(most)) }.frame(height: 7)
                            }
                            Text("\(place.games)").font(LfFace.display.font(30)).foregroundStyle(LF.text).padding(.trailing, 2)
                        }
                        .padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowStyle())
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(rank[i]). \(place.venue)\(place.pitch.map { ", \($0)" } ?? ""): \(plural(place.games, "game"))")
                    .accessibilityAddTraits([.isButton, .isLink])
                }
            }
        }
    }
}

/// STAT-3: what the weather was like: dry against wet games as slanted bars, and the average at kickoff.
private struct StatsWeatherSlab: View {
    let x: Ctx

    var body: some View {
        let w = x.s.weather
        Slab(title: "Weather", tag: "\(w.games) of \(x.s.games.total) games", icon: .sun) {
            if w.games == 0 {
                Text("No weather for these games yet: it needs the venue or pitch on the map.").font(.barlow(16, .medium)).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                SlantBars(rows: [
                    SlantBar(label: "Dry", value: Double(w.games - w.rainy), display: "\(w.games - w.rainy)", color: LF.chalk, icon: .sun),
                    SlantBar(label: "Rain", value: Double(w.rainy), display: "\(w.rainy)", color: LF.boardAccent, icon: .cloudRain),
                ])
                Text("Rain: 1 mm or more from an hour before kickoff to the end.").font(.lfBodySmall).foregroundStyle(LF.onBoardMuted).fixedSize(horizontal: false, vertical: true).padding(.top, 12)
                if let avg = w.averageTemperatureC {
                    SlabRule().padding(.top, 18)
                    HStack {
                        SlabLabel("Average at kickoff")
                        SlabFigure(text: formatTemperature(avg, unit: x.temperature), size: 40, alignment: .trailing)
                    }
                    .padding(.top, 16)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// STAT-3: games in each band of kickoff temperature, as columns to scale with their counts over them.
private struct Temperatures: View {
    let x: Ctx

    var body: some View {
        let f = x.temperature == "f"
        let bands = temperatureBands(x.s.weather.temperaturesC, fahrenheit: f)
        let name = { (from: Int) in f ? "\(from)s °F" : "\(from)–\(from + 4) °C" }
        let columns = bands.map { from, n in BoardColumn(label: f ? "\(from)s" : "\(from)°", value: Double(n), display: "\(n)", describe: "\(plural(n, "game")) at \(name(from))") }
        Slab(title: "Temperature", tag: "At kickoff, \(f ? "°F" : "°C")", icon: .thermometer) {
            BoardColumns(columns: columns, color: LF.chalk, summary: "Games by the temperature at kickoff: " + columns.map(\.describe).joined(separator: "; "))
        }
    }
}

/// The weather's records, three boards cut on the diagonal: the hottest, coldest and windiest games, each opening its match.
private struct WeatherRecords: View {
    let x: Ctx

    var body: some View {
        let w = x.s.weather
        let wind = { (kph: Double) in x.unit == "mi" ? "\(Int((kph / 1.609344).rounded())) mph gusts" : "\(Int(kph.rounded())) km/h gusts" }
        let records: [(String, String, String, String)] = [
            w.hottest.map { ("Hottest", formatTemperature($0.temperatureC, unit: x.temperature), $0.matchId, "\(shortDay($0.kickoff)) · \($0.title)") },
            w.coldest.map { ("Coldest", formatTemperature($0.temperatureC, unit: x.temperature), $0.matchId, "\(shortDay($0.kickoff)) · \($0.title)") },
            w.windiest.map { ("Windiest", wind($0.windGustKph), $0.matchId, "\(shortDay($0.kickoff)) · \($0.title)") },
        ].compactMap { $0 }
        VStack(spacing: 14) {
            ForEach(Array(records.enumerated()), id: \.offset) { _, record in
                let (label, figure, id, game) = record
                Button { x.open(.match(id)) } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        SlabLabel(label)
                        SlabFigure(text: figure, size: 60).padding(.top, 8)
                        Text(game).font(.barlow(14.5, .semibold, relativeTo: .footnote)).underline().foregroundStyle(LF.onBoard)
                            .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true).padding(.top, 10)
                    }
                    .padding(.leading, 22).padding(.trailing, slabCut + 12).padding(.vertical, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .ground(.board)
                    .boardSurface(SlantShape(right: slabCut))
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isLink)
            }
        }
    }
}

/// STAT-3, STAT-14: each age group's games by gender, a row each, the bar as long as its games.
private struct AgeGroups: View {
    let s: Stats

    private struct Gender {
        let label: String
        let color: Color
        let of: (StatsAgeGroupsItem) -> Int
    }

    var body: some View {
        let genders = [
            Gender(label: "Male", color: LF.chalk) { $0.male }, Gender(label: "Female", color: LF.boardAccent) { $0.female },
            Gender(label: "Co-ed", color: LF.roleFourth) { $0.coed }, Gender(label: "Not set", color: LF.roleNone) { $0.notSet },
        ]
        let used = genders.filter { g in s.ageGroups.contains { g.of($0) > 0 } }
        let total = { (a: StatsAgeGroupsItem) in genders.reduce(0) { $0 + $1.of(a) } }
        let most = max(1, s.ageGroups.map(total).max() ?? 1)
        // A caption, not a tab, in the website's words for what's shown (here the games alone).
        Slab(title: "By age group", tag: "Games") {
            if used.count > 1 { Legend(items: used.map { ($0.label, $0.color) }) }
            ForEach(Array(s.ageGroups.enumerated()), id: \.offset) { i, a in
                let sum = total(a)
                let parts = used.filter { $0.of(a) > 0 }
                if i > 0 { SlabRule() }
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(a.ageGroup.uppercased()).font(.display(28, relativeTo: .title2)).foregroundStyle(LF.onBoardStrong).lineLimit(1).minimumScaleFactor(0.6).padding(.trailing, 2)
                        Text(plural(sum, "game").uppercased()).lfLabel(10.5, spacing: 0.1).foregroundStyle(LF.onBoardMuted)
                    }
                    .frame(width: 92, alignment: .leading)
                    GeometryReader { geo in
                        let bar = max(4, (geo.size.width - 70) * CGFloat(sum) / CGFloat(most))
                        HStack(spacing: 10) {
                            HStack(spacing: 2) {
                                ForEach(Array(parts.enumerated()), id: \.offset) { _, g in
                                    Rectangle().fill(g.color).frame(width: max(1, (bar - 2 * CGFloat(parts.count - 1)) * CGFloat(g.of(a)) / CGFloat(max(1, sum))))
                                }
                            }
                            .frame(width: bar, height: 18, alignment: .leading)
                            Text(parts.count > 1 ? parts.map { "\($0.of(a))" }.joined(separator: " + ") : "\(sum)").font(LfFace.display.font(22)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize().padding(.trailing, 2)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .frame(height: 30)
                }
                .frame(minHeight: 56)
                .padding(.vertical, 10)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(a.ageGroup): \(plural(sum, "game"))\(used.count > 1 ? ", " + parts.map { "\($0.of(a)) \($0.label.lowercased())" }.joined(separator: ", ") : "")")
            }
        }
    }
}

/// STAT-3: the referees you work with most as name straps on the grass, each as long as the games together; a saved referee opens their page.
private struct RefereeStraps: View {
    let x: Ctx
    @State private var width: CGFloat = 300

    var body: some View {
        let r = x.s.referees
        let most = max(1, r.top.map(\.games).max() ?? 1)
        VStack(alignment: .leading, spacing: 0) {
            WidthReader(width: $width)
            GrassHead(title: "Referees you work with most", sub: "Games together · \(r.count) on your crews")
            VStack(spacing: 10) {
                ForEach(Array(r.top.enumerated()), id: \.offset) { _, ref in
                    let strap = HStack(spacing: 0) {
                        Text("\(ref.games)").font(LfFace.display.font(28)).foregroundStyle(LF.onBoardStrong).padding(.trailing, 2)
                            .padding(.trailing, 14)
                            .frame(width: 64)
                            .frame(maxHeight: .infinity)
                            .boardSurface(SlantShape(right: 14))
                        Text(ref.name.uppercased()).font(.display(22, relativeTo: .title3)).foregroundStyle(LF.board).lineLimit(2).padding(.trailing, 2)
                            .padding(.leading, 22).padding(.trailing, 28).padding(.vertical, 6)
                            .frame(width: max(120, (width - 58) * CGFloat(ref.games) / CGFloat(most)), alignment: .leading)
                            .frame(maxHeight: .infinity)
                            .background(SlantShape(left: 14, right: 18).fill(LF.chalk))
                            // Tucked 6 pt under the figure's cut, inside the room it was given: drawn
                            // there by an offset, the longest strap was laid out 6 pt wider than the
                            // width read above, widening the page and so the width read, over and over
                            // (SwiftUI cut it short, leaving the page too wide; a layout forced with
                            // the stats already there never finished).
                            .padding(.leading, -6)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: 48)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(ref.name): \(plural(ref.games, "game")) together")
                    if let id = ref.refereeId {
                        Button { x.open(.referee(id)) } label: { strap.contentShape(Rectangle()) }
                            .buttonStyle(PressStyle())
                            .accessibilityAddTraits(.isLink)
                    } else {
                        strap
                    }
                }
            }
            .padding(.top, 20)
        }
    }
}

/// STAT-10: year by year, a row of figures a year on the board.
private struct Years: View {
    let x: Ctx
    @State private var width: CGFloat = 300

    var body: some View {
        let currency = x.s.fees.currency
        let per = max(2, Int((width + 16) / (92 + 16)))
        Slab(title: "Year by year", tag: "Each year in these filters") {
            ForEach(Array(x.s.years.enumerated()), id: \.offset) { i, y in
                let figures: [(String, String, String?)] = [
                    ("Games", "\(y.games)", nil),
                    ("As center", "\(y.asCentre)", percent(y.asCentre, y.games)),
                    ("Distance", y.distanceGames > 0 ? figureAndUnit(formatDistance(y.distanceM, unit: x.unit)).figure : "—", y.distanceGames > 0 ? (x.unit == "mi" ? "mi" : "km") : nil),
                    ("Referees", "\(y.referees)", nil),
                    ("Venues", "\(y.venues)", nil),
                ] + (currency.map { [("Fees", money(y.feesAmount, $0), String?.none)] } ?? [])
                let rows = stride(from: 0, to: figures.count, by: per).map { Array(figures[$0..<min($0 + per, figures.count)]) }
                if i > 0 { SlabRule() }
                VStack(alignment: .leading, spacing: 12) {
                    Text(String(y.year)).font(LfFace.display.font(44)).foregroundStyle(LF.onBoardStrong).accessibilityAddTraits(.isHeader)
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 16) {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, fig in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(fig.0.uppercased()).lfLabel(10.5, spacing: 0.12).foregroundStyle(LF.boardAccent).lineLimit(1).minimumScaleFactor(0.7)
                                    (Text(fig.1).font(LfFace.display.font(30)).foregroundColor(LF.onBoardStrong)
                                        + Text(fig.2.map { " \($0.uppercased())" } ?? "").font(LfFace.display.font(15)).foregroundColor(LF.onBoardMuted))
                                        .lineLimit(1).minimumScaleFactor(0.6).padding(.trailing, 2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            ForEach(0..<(per - row.count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity, maxHeight: 1) }
                        }
                    }
                }
                .padding(.vertical, 16)
                .accessibilityElement(children: .combine)
            }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 - 32 }
    }
}
