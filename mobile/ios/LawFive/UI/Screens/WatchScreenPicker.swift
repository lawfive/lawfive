import SwiftUI

// UI-27: the match screen setup, as on the website and Android: UI-21's four questions a step at a time,
// then a review to save, under pictures of the screen on a round watch and on Apple Watch, drawn from the
// answers so far at a moment of a match, or played through. UI-24: saved for the account. The pictures
// are drawn as the watches draw them: black in either mode.

private enum Face {
    static let text = Color.white
    static let dim = Color(white: 0.667)
    static let rule = Color(white: 0.333)
    static let track = Color(white: 0.165)
    static let ring = Color(red: 0, green: 0.667, blue: 0.267)
    static let stoppage = Color(red: 1, green: 0.533, blue: 0)
    static let breakBlue = Color(red: 0.333, green: 0.667, blue: 1)
    static let red = Color(red: 0.898, green: 0.282, blue: 0.302)
    static let teamRed = Color(red: 0.776, green: 0.157, blue: 0.157)
    static let teamBlue = Color(red: 0.082, green: 0.396, blue: 0.753)
    /// UI-10: the kit of a team without a color, the board's blank.
    static let kitBlank = Color(red: 0x3A / 255, green: 0x40 / 255, blue: 0x3D / 255)
}

/// TMR-11: each style named with its example for a 2 × 45 match.
private let clockStyles = [("up", "Match time", "0 to 90, like TV"), ("upEach", "Each half from 0", "0 to 45, then 0 to 45 again"), ("down", "Time left", "45 down to 0")]
private let clockChoices = [("one", "One clock", "The match clock, large"), ("stacked", "Two, stacked", "A smaller second clock under the first"), ("sideBySide", "Two, side by side", "The same size, with a line between")]
private let breakChoices = [("down", "Time left", "Half-time from 15:00 down to 0:00"), ("up", "Time taken", "Half-time from 0:00 up to 15:00")]
private let edgeChoices = [
    ("ring", "Ring", "Around the edge: fills as the period runs, or empties with Time left. Round watches and Apple Watch."),
    ("time", "Time of day", "Small, at the very bottom. Apple Watch always shows its own clock."),
    ("none", "Neither", "Just the clocks and the score"),
]
private let nameChoices = [(true, "Team names", "1 HOM/AWY 2 over the clock"), (false, "Scores only", "The scores alone, with a bigger clock")]
private let steps = ["Clocks", "How they count", "Ring or time", "Names", "Review"]

/// The setup in words: label, value, and the step that asks it.
private func screenWords(_ s: ScreenSetup) -> [(label: String, value: String, step: Int)] {
    func style(_ id: String) -> String { clockStyles.first { $0.0 == id }.map { "\($0.1) · \($0.2)" } ?? id }
    var words: [(String, String, Int)] = [("Clocks", clockChoices.first { $0.0 == s.clocks }?.1 ?? "", 0), ("Match clock", style(s.mainClock), 1)]
    if s.clocks != "one" { words.append(("Second clock", style(s.secondClock), 1)) }
    words += [
        ("Break clock", breakChoices.first { $0.0 == s.breakClock }?.1 ?? "", 1),
        ("Ring or time", edgeChoices.first { $0.0 == s.edge }?.1 ?? "", 2),
        ("Names", s.names ? "Team names" : "Scores only", 3),
    ]
    return words.map { (label: $0.0, value: $0.1, step: $0.2) }
}

/// The match screen in a line, as the website's screenLine: "Two clocks stacked, the time of day, names"
/// (SYNC-15's Your match screen).
func screenLine(_ s: ScreenSetup) -> String {
    let clocks = ["one": "one clock", "stacked": "two clocks stacked", "sideBySide": "two clocks side by side"][s.clocks] ?? "one clock"
    let edge = ["ring": "the ring", "time": "the time of day"][s.edge]
    let line = [clocks, edge, s.names ? "names" : "scores only"].compactMap { $0 }.joined(separator: ", ")
    return line.prefix(1).uppercased() + line.dropFirst()
}

/// UI-24, UI-27: Settings' Match screen: the account's screen in pictures and words, and Change.
struct MatchScreenSummary: View {
    @Environment(Nav.self) private var nav
    let saved: WatchScreen?

    var body: some View {
        let setup = ScreenSetup(saved)
        VStack(alignment: .leading, spacing: 12) {
            ScreenPreview(setup: setup, compact: true).frame(maxWidth: .infinity)
            ForEach(screenWords(setup), id: \.label) { w in
                HStack(alignment: .firstTextBaseline) {
                    Text(w.label).font(.lfBodySmall).foregroundStyle(LF.muted).frame(width: 110, alignment: .leading)
                    Text(w.value).font(.lfBodyMedium).foregroundStyle(LF.text)
                }
            }
            SecondaryButton("Change", icon: .watch, wide: true) { nav.push(.matchScreen) }
        }
    }
}

struct MatchScreenSetupScreen: View {
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var draft: ScreenSetup?
    @State private var step = 0
    @State private var saving = false

    private var setup: ScreenSetup { draft ?? ScreenSetup(graph.records.settings?.watchScreen) }

    private func set(_ change: (inout ScreenSetup) -> Void) {
        var next = setup
        change(&next)
        // UI-22: never the match clock's style.
        if next.secondClock == next.mainClock { next.secondClock = next.mainClock == "down" ? "upEach" : "down" }
        draft = next
    }

    private func save() {
        saving = true
        let screen = setup.saved(at: ISO8601DateFormatter().string(from: Date()))
        Task {
            // A new account without a settings record gets one with this (Records.saveSettings).
            await graph.records.saveSettings { $0.watchScreen = screen }
            dismiss()
        }
    }

    var body: some View {
        let last = steps.count - 1
        Page("Match screen", sub: "What your watches show while a period runs. It reaches them at their next sync and starts at the next kickoff.", large: false) {
            LfCard { ScreenPreview(setup: setup).padding(.vertical, 16) }
            LfCard(padding: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    // The steps by name, so what's coming is clear; each can be gone back or ahead to.
                    HStack(alignment: .top, spacing: 4) {
                        ForEach(steps.indices, id: \.self) { i in
                            Button { step = i } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Capsule().fill(i < step ? LF.brand : i == step ? LF.muted : LF.border).frame(height: 6)
                                    Text(steps[i]).font(i == step ? .lfLabelSmall : .barlow(11, relativeTo: .caption2))
                                        .foregroundStyle(i == step ? LF.text : LF.muted).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(i == step ? .isSelected : [])
                        }
                    }
                    switch step {
                    case 0:
                        title("How many clocks?")
                        Tiles(options: clockChoices, value: setup.clocks) { v in set { $0.clocks = v } }
                    case 1:
                        title("How does each count?")
                        Text("Stoppage always counts up.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                        question("Match clock")
                        Tiles(options: clockStyles, value: setup.mainClock) { v in set { $0.mainClock = v } }
                        if setup.clocks != "one" {
                            question("Second clock")
                            Tiles(options: clockStyles.filter { $0.0 != setup.mainClock }, value: setup.secondClock) { v in set { $0.secondClock = v } }
                        }
                        question("Break clock")
                        Tiles(options: breakChoices, value: setup.breakClock) { v in set { $0.breakClock = v } }
                    case 2:
                        title("Ring or time of day?")
                        Text("At the edge of the screen; one or the other, as there's room for one.").font(.lfBodyMedium).foregroundStyle(LF.muted)
                        Tiles(options: edgeChoices, value: setup.edge) { v in set { $0.edge = v } }
                    case 3:
                        title("Team names, or scores only?")
                        Tiles(options: nameChoices, value: setup.names) { v in set { $0.names = v } }
                    default:
                        title("Your match screen")
                        ForEach(screenWords(setup), id: \.label) { w in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(w.label).font(.lfBodySmall).foregroundStyle(LF.muted)
                                    Text(w.value).font(.lfBodyMedium).foregroundStyle(LF.text)
                                }
                                Spacer()
                                Button("Change") { step = w.step }.font(.lfLabelLarge).foregroundStyle(LF.brandStrong)
                            }
                        }
                    }
                    HStack {
                        SecondaryButton(step == 0 ? "Cancel" : "Back", icon: step == 0 ? nil : .back) { if step == 0 { dismiss() } else { step -= 1 } }
                        Spacer()
                        if step < last {
                            PrimaryButton("Continue") { step += 1 }
                        } else {
                            PrimaryButton(saving ? "Saving…" : "Save for my watches", enabled: !saving) { save() }
                        }
                    }
                }
            }
            .padding(.top, 12)
        }
    }

    private func title(_ text: String) -> some View { Text(text).font(.lfHeadlineSmall).foregroundStyle(LF.text) }
    private func question(_ text: String) -> some View { Text(text.uppercased()).font(.lfLabelSmall).tracking(0.8).foregroundStyle(LF.muted).padding(.top, 6) }
}

/// Choices as tiles, as in the quiz: brand-soft with a brand border when chosen.
private struct Tiles<T: Hashable>: View {
    let options: [(T, String, String)]
    let value: T
    let onChange: (T) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(options, id: \.0) { id, name, hint in
                let on = id == value
                Button { onChange(id) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(.lfTitleSmall).foregroundStyle(on ? LF.brandStrong : LF.text)
                        Text(hint).font(.lfBodySmall).foregroundStyle(LF.muted).multilineTextAlignment(.leading)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(on ? LF.brandSoft : LF.surface2, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(on ? LF.brand : LF.border, lineWidth: on ? 2 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
                .sensoryFeedback(.selection, trigger: on)
            }
        }
    }
}

/// UI-27: the pictures, the moments under them, Stoppage tracked, Team colors, and Play through with its scrubber.
/// The account's watches' shapes come first.
struct ScreenPreview: View {
    @Environment(AppGraph.self) private var graph
    let setup: ScreenSetup
    var compact = false
    @State private var kinds: Set<String> = []
    @State private var momentId = "first"
    @State private var tracked = true
    @State private var teamColors = false
    /// Where Play through is, 0 to 1; nil while a moment is chosen.
    @State private var position: Double?
    /// While playing: when it would have started, had it played from 0, so it carries on from the scrubber.
    @State private var playStart: Date?

    private func at(_ now: Date) -> Double? {
        playStart.map { min(now.timeIntervalSince($0) / 30, 1) } ?? position
    }

    private func pause() {
        position = at(Date())
        playStart = nil
    }

    private func play() {
        let from = position.flatMap { $0 < 1 ? $0 : nil } ?? 0
        position = from
        playStart = Date().addingTimeInterval(-from * 30)
    }

    var body: some View {
        let roundYours = kinds.contains("garmin") || kinds.contains("wearos")
        let appleYours = kinds.contains("applewatch")
        let shapes = appleYours && !roundYours ? [(true, "Apple Watch", true), (false, "Garmin, Wear OS", false)] : [(false, "Garmin, Wear OS", roundYours), (true, "Apple Watch", appleYours)]
        let shown = WatchPreview.moments.filter { tracked || !$0.stoppage }
        let chosen = shown.first { $0.id == momentId } ?? shown[0]
        TimelineView(.animation(paused: playStart == nil)) { timeline in
            let now = at(timeline.date)
            let moment = now.map { WatchPreview.playAt($0) } ?? chosen.moment
            let screen = WatchPreview.screenAt(setup, moment, tracked: tracked)
            VStack(spacing: 12) {
                HStack(alignment: .bottom, spacing: 18) {
                    ForEach(shapes, id: \.1) { apple, name, yours in
                        VStack(spacing: 6) {
                            let width: CGFloat = compact ? (apple ? 100 : 116) : (apple ? 124 : 146)
                            WatchFace(setup: setup, screen: screen, apple: apple, teamColors: teamColors)
                                .frame(width: width, height: apple ? width * 1.19 : width)
                                .accessibilityLabel("The match screen on \(name)")
                            HStack(spacing: 6) {
                                Text(name).font(.lfBodySmall).foregroundStyle(LF.muted)
                                if yours { Chip("Yours", tone: .brand) }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                if !compact {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(shown, id: \.id) { m in
                                let on = now == nil && m.id == chosen.id
                                Button { playStart = nil; position = nil; momentId = m.id } label: {
                                    Text(m.name).font(.lfBodySmall).foregroundStyle(on ? LF.brandStrong : LF.muted)
                                        .padding(.horizontal, 11).padding(.vertical, 6)
                                        .background(on ? LF.brandSoft : LF.surface2, in: Capsule())
                                        .overlay(Capsule().strokeBorder(on ? LF.brand : LF.border))
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(on ? .isSelected : [])
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    // Play through: play or pause, a scrubber over the whole match (dragging pauses), and where it is.
                    HStack(spacing: 10) {
                        Button { if playStart == nil { play() } else { pause() } } label: {
                            PhIcon(playStart == nil ? .play : .pause, size: 18)
                                .frame(width: 40, height: 40)
                                .background(LF.surface, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(LF.border))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(playStart == nil ? "Play through" : "Pause")
                        Slider(value: Binding(get: { now ?? 0 }, set: { playStart = nil; position = $0 })).tint(LF.brand)
                        Text(now.map { WatchPreview.momentLabel(WatchPreview.playAt($0)) } ?? "Play through")
                            .font(.lfBodySmall).monospacedDigit().foregroundStyle(now == nil ? LF.muted : LF.text)
                            .frame(width: 104, alignment: .trailing)
                    }
                    .padding(.horizontal, 16)
                    .onChange(of: (now ?? 0) >= 1) { _, done in if done && playStart != nil { pause() } }
                    HStack(spacing: 20) {
                        Toggle("Stoppage tracked", isOn: $tracked).font(.lfBodyMedium).tint(LF.brand).fixedSize()
                        Toggle("Team colors", isOn: $teamColors).font(.lfBodyMedium).tint(LF.brand).fixedSize()
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
        .task {
            let list = (try? await graph.api.call("GET", "/v1/devices")?["devices"]?.array) ?? []
            kinds = Set(list.compactMap { $0["kind"]?.string })
        }
    }
}

/// The watch's screen, as web/src/components/WatchFace.tsx draws it: slots at fractions of the height, sizes of the width.
struct WatchFace: View {
    let setup: ScreenSetup
    let screen: ScreenAt
    let apple: Bool
    var teamColors = false

    var body: some View {
        let time = Date().formatted(date: .omitted, time: .shortened)
        // UI-25: Apple Watch's own clock is always there; on the others the time is an edge choice.
        let edge = apple && setup.edge == "time" ? "none" : setup.edge
        Canvas { context, size in
            let u = size.width / 100
            let h = size.height / u
            func y(_ f: Double) -> CGFloat { f * h * u }
            func put(_ text: String, _ x: CGFloat, _ fy: Double, _ s: CGFloat, _ color: Color = Face.text, figure: Bool = false, weight: String = "SemiBold", anchor: UnitPoint = .center) {
                let font: Font = figure ? .custom("BarlowCondensed-Bold", fixedSize: s * u) : .custom("Barlow-\(weight)", fixedSize: s * u)
                context.draw(Text(text).font(font).foregroundStyle(color), at: CGPoint(x: x * u, y: y(fy)), anchor: anchor)
            }
            let shape = apple ? Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 22 * u, style: .continuous) : Path(ellipseIn: CGRect(origin: .zero, size: size))
            context.fill(shape, with: .color(.black))
            if apple { put(time, 86, 0.075, 7, anchor: .trailing) }
            // UI-10: with Team colors on, the demo's teams in their colors; otherwise a quick match's HOM and AWY.
            let home: (String, Color?) = teamColors ? ("STR", Face.teamRed) : ("HOM", nil)
            let away: (String, Color?) = teamColors ? ("ROV", Face.teamBlue) : ("AWY", nil)
            /// UI-10: the two teams (or scores) as kits of one width, the wider name's with room either side, cut on one
            /// diagonal where they meet, leaning as "/", each name upright in the middle of its part; returns the outer edges.
            func kits(_ names: (String, String), _ fy: Double, _ s: CGFloat) -> (CGFloat, CGFloat) {
                let ink = [names.0, names.1].map { context.resolve(Text($0).font(.custom("Barlow-SemiBold", fixedSize: s * u)).foregroundStyle(Face.text)) }
                let widest = ink.map { $0.measure(in: CGSize(width: 1000, height: 1000)).width / u }.max() ?? 0
                // As the watch's Kit: 1.3 times the text tall, the cut 0.21 of that either way of the middle, a 0.11 gap.
                let h = s * 1.3, d = h * 0.21, gap = h * 0.11
                let width = widest + h * 0.7 + d
                let top = y(fy) - h / 2 * u, bottom = y(fy) + h / 2 * u
                let homeRight = 50 + d - gap / 2, awayLeft = 50 - d + gap / 2
                let homeLeft = homeRight - width, awayRight = awayLeft + width
                func px(_ x: CGFloat) -> CGFloat { x * u }
                let homeKit = Path { p in
                    p.move(to: CGPoint(x: px(homeLeft), y: top))
                    p.addLine(to: CGPoint(x: px(homeRight), y: top))
                    p.addLine(to: CGPoint(x: px(homeRight - 2 * d), y: bottom))
                    p.addLine(to: CGPoint(x: px(homeLeft), y: bottom))
                    p.closeSubpath()
                }
                let awayKit = Path { p in
                    p.move(to: CGPoint(x: px(awayLeft + 2 * d), y: top))
                    p.addLine(to: CGPoint(x: px(awayRight), y: top))
                    p.addLine(to: CGPoint(x: px(awayRight), y: bottom))
                    p.addLine(to: CGPoint(x: px(awayLeft), y: bottom))
                    p.closeSubpath()
                }
                context.fill(homeKit, with: .color(home.1 ?? Face.kitBlank))
                context.fill(awayKit, with: .color(away.1 ?? Face.kitBlank))
                // The demo's red and blue and the blank all take white words.
                context.draw(ink[0], at: CGPoint(x: px(homeLeft + (width - d) / 2), y: y(fy)), anchor: .center)
                context.draw(ink[1], at: CGPoint(x: px(awayRight - (width - d) / 2), y: y(fy)), anchor: .center)
                return (homeLeft, awayRight)
            }
            func scoreLine(_ at: Double) {
                let (left, right) = kits((home.0, away.0), at, 8.3)
                put("1", left - 3.8, at, 8.3, anchor: .trailing)
                put("2", right + 3.8, at, 8.3, anchor: .leading)
            }
            if screen.halftime {
                // UI-25: at the very bottom of every screen but the menus.
                if !apple { put(time, 50, 0.945, 5, Face.dim, weight: "Medium") }
                put("HALF-TIME", apple ? 30 : 50, apple ? 0.075 : 0.13, 5.2, Face.dim, weight: "Medium")
                scoreLine(apple ? 0.25 : 0.27)
                put(screen.breakClock ?? "", 50, apple ? 0.44 : 0.46, 20, screen.breakOver ? Face.red : Face.breakBlue, figure: true)
                put("Kickoff: \(away.0)", 50, 0.62, 5.6, Face.dim, weight: "Medium")
                context.fill(Path(roundedRect: CGRect(x: 25 * u, y: y(0.78) - 6.5 * u, width: 50 * u, height: 13 * u), cornerRadius: 6.5 * u), with: .color(Face.ring))
                put("End HT", 50, 0.78, 6.5)
                return
            }
            if edge == "ring" { ring(context, size: size, u: u) }
            if setup.names {
                put(screen.period, 50, 0.12, 5.8, Face.dim, weight: "Medium")
                scoreLine(0.25)
            } else {
                put(screen.period, 50, 0.10, 5.8, Face.dim, weight: "Medium")
                // UI-21: scores only, the scores are the kits (UI-10).
                _ = kits(("1", "2"), 0.21, 9)
            }
            let long = screen.clock.count > 5
            if setup.clocks == "sideBySide" {
                let s: CGFloat = long ? 14.5 : 17.5
                put(screen.clock, 27, 0.5, s, figure: true)
                context.stroke(Path { $0.move(to: CGPoint(x: 50 * u, y: y(0.5) - h * 0.08 * u)); $0.addLine(to: CGPoint(x: 50 * u, y: y(0.5) + h * 0.08 * u)) }, with: .color(Face.rule), lineWidth: 0.6 * u)
                put(screen.second ?? "", 73, 0.5, s, figure: true)
            } else {
                put(screen.clock, 50, 0.5, setup.names ? (long ? 24 : 29) : long ? 28 : setup.clocks == "stacked" ? 30 : 33, figure: true)
            }
            if let added = screen.added {
                put(added, 50, 0.69, 9, Face.stoppage)
            } else if setup.clocks == "stacked" {
                put(screen.second ?? "", 50, 0.69, 10, Face.dim)
            }
            pills(context, y: y(apple ? 0.84 : 0.835), s: (apple ? 7.8 : 7.5) * u, u: u, width: size.width)
            if edge == "time" { put(time, 50, 0.945, 5, Face.dim, weight: "Medium") }
        }
    }

    /// UI-23: the ring, filling clockwise from 12 o'clock, or emptying when the match clock counts down; full orange in added time.
    private func ring(_ context: GraphicsContext, size: CGSize, u: CGFloat) {
        let pen = 2.7 * u
        let rect = CGRect(origin: .zero, size: size).insetBy(dx: pen / 2, dy: pen / 2)
        var path = Path()
        if apple {
            let r = 22 * u - pen / 2
            path.move(to: CGPoint(x: rect.midX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
            path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
            path.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
            path.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
            path.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            path.closeSubpath()
        } else {
            path.addArc(center: CGPoint(x: rect.midX, y: rect.midY), radius: rect.width / 2, startAngle: .degrees(-90), endAngle: .degrees(269.99), clockwise: false)
        }
        let p = screen.progress
        let done = p >= 1
        context.stroke(path, with: .color(done ? Face.stoppage : Face.track), lineWidth: pen)
        let down = setup.mainClock == "down"
        if done || (!down && p <= 0) { return }
        context.stroke(path.trimmedPath(from: down ? p : 0, to: down ? 1 : p), with: .color(Face.ring), lineWidth: pen)
    }

    private func pills(_ context: GraphicsContext, y: CGFloat, s: CGFloat, u: CGFloat, width: CGFloat) {
        let list = [screen.stoppage.map { ($0, Face.stoppage) }, screen.breakPill.map { ($0, Face.breakBlue) }].compactMap { $0 }
        if list.isEmpty { return }
        let gap = 2 * u
        let height = s * 1.45
        let resolved = list.map { pill, color in context.resolve(Text(pill.text).font(.custom("Barlow-SemiBold", fixedSize: s)).foregroundStyle(pill.solid ? Color.black : color)) }
        let widths = resolved.map { $0.measure(in: CGSize(width: 1000, height: 1000)).width + s * 1.2 }
        var x = (width - widths.reduce(0, +) - gap * CGFloat(list.count - 1)) / 2
        for (i, (pill, color)) in list.enumerated() {
            let box = Path(roundedRect: CGRect(x: x, y: y - height / 2, width: widths[i], height: height), cornerRadius: height / 2)
            if pill.solid { context.fill(box, with: .color(color)) } else { context.stroke(box, with: .color(color), lineWidth: 0.8 * u) }
            context.draw(resolved[i], at: CGPoint(x: x + widths[i] / 2, y: y), anchor: .center)
            x += widths[i] + gap
        }
    }
}
