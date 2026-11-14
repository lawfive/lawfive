import SwiftUI

// The screens before and after a match (UI-15 to UI-20, on a watch that isn't Garmin): the match screen
// takes the place of all of them while a match is on.

@main
struct LawFiveWatchApp: App {
    @State private var state = AppState()
    /// Decision 4c: linking from the paired iPhone.
    @State private var phoneLink = PhoneLink()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            Group {
                if state.match != nil {
                    MatchFlow()
                } else if state.showsPermissions {
                    // WCH-7: once, the first time the app opens, never between Start match and the kickoff.
                    PermissionsPage()
                } else {
                    NavigationStack {
                        HomePage()
                            .onAppear { state.screenFree = true }
                            .onDisappear { state.screenFree = false }
                    }
                    // DATA-8: after Reset LawFive, back to the start.
                    .id(state.resets)
                    // Decision 4c: "Link to {server}?" from the iPhone, over whatever's showing before a match.
                    .fullScreenCover(isPresented: Binding(get: { phoneLink.step != nil }, set: { if !$0 { phoneLink.dismiss() } })) {
                        PhoneLinkScreen(link: phoneLink)
                    }
                }
            }
            .environment(state)
            .onAppear { phoneLink.start(state) }
            .onChange(of: phase, initial: true) { _, now in
                if now == .active { state.sync() }
            }
            // UI-26.
            .onChange(of: state.offersSyncScreen, initial: true) { _, offered in
                if offered { state.openSyncScreen() }
            }
            .fullScreenCover(isPresented: Binding(get: { state.syncScreen }, set: { state.syncScreen = $0 })) {
                SyncScreen().environment(state)
            }
            #if DEBUG
            .onAppear {
                if let what = UserDefaults.standard.string(forKey: "syncScreen") { state.showSyncScreenForTesting(what) }
            }
            #endif
        }
    }
}

private struct WatchList<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(spacing: 5, content: content).padding(.horizontal, 4)
        }
        .navigationTitle(title)
    }
}

/// UI-15.
/// The screen's rounded edge, starting at the top and going clockwise, so it fills as a clock does.
private struct SyncRing: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(radius, min(rect.width, rect.height) / 2)
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - r, y: rect.minY))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.minY + r), radius: r, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        p.addArc(center: CGPoint(x: rect.maxX - r, y: rect.maxY - r), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.maxY - r), radius: r, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        p.addArc(center: CGPoint(x: rect.minX + r, y: rect.minY + r), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        p.closeSubpath()
        return p
    }
}

/// UI-26: matches on their way: a ring for how far it's got and what's going now. Closing it leaves
/// it to carry on. It says when it's done and closes itself; if it stops, it says why.
struct SyncScreen: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let ended = !state.syncing
        let problem = ended ? state.syncProblem : nil
        let total = state.syncTotal
        let sent = state.syncSent
        let fraction = ended && problem == nil ? 1 : total > 0 ? Double(sent) / Double(total) : 0
        GeometryReader { geo in
            let size = geo.size
            let w = size.width
            ZStack {
                SyncRing(radius: w * 0.22).stroke(Color(white: 0.2), lineWidth: w * 0.03).padding(w * 0.02)
                SyncRing(radius: w * 0.22).trim(from: 0, to: fraction).stroke(C.start, style: StrokeStyle(lineWidth: w * 0.03, lineCap: .round)).padding(w * 0.02)
                Text(problem != nil ? "Sync paused" : ended ? "All synced" : "Syncing").font(.barlow(w * 0.11, .semibold)).foregroundStyle(C.text).at(0.5, 0.3, size)
                if let problem {
                    VStack(spacing: 3) {
                        Text(problem)
                        Text("Nothing's lost: it tries again")
                    }
                    .font(.barlow(w * 0.065)).foregroundStyle(C.dim).multilineTextAlignment(.center).padding(.horizontal, w * 0.06).at(0.5, 0.56, size)
                } else if ended {
                    Text(sent == 1 ? "1 match sent" : "\(sent) matches sent").font(.barlow(w * 0.075)).foregroundStyle(C.dim).at(0.5, 0.5, size)
                } else {
                    Text("Sending match").font(.barlow(w * 0.075)).foregroundStyle(C.dim).at(0.5, 0.45, size)
                    Text("\(min(sent + 1, total)) of \(total)").font(.barlow(w * 0.12, .semibold)).foregroundStyle(C.text).at(0.5, 0.6, size)
                }
            }
        }
        .ignoresSafeArea()
        .background(Color.black)
        .contentShape(Rectangle())
        .onTapGesture { if ended { dismiss() } }
        .task(id: ended && problem == nil) {
            guard ended, problem == nil else { return }
            try? await Task.sleep(for: .seconds(3))
            dismiss()
        }
    }
}

struct HomePage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let s = state.saved
        WatchList(title: "LawFive") {
            NavigationLink { if state.linked { MatchesPage() } else { LinkPage() } } label: { RowLabel(label: "Matches", sub: !state.linked ? "Link to sync" : s.matches.first?.title ?? "None coming up", icon: "matches") }.buttonStyle(.plain)
            NavigationLink { NewMatchPage() } label: { RowLabel(label: "New match", sub: "Quick · \(s.quick.summary)", icon: "plus") }.buttonStyle(.plain)
            NavigationLink { HistoryPage() } label: { RowLabel(label: "History", sub: s.history.isEmpty ? "None yet" : "\(s.history.count) kept", icon: "history") }.buttonStyle(.plain)
            NavigationLink { SettingsPage() } label: { RowLabel(label: "Settings", sub: state.linked ? "Linked" : "Not linked", icon: "settings") }.buttonStyle(.plain)
        }
    }
}

/// MenuRow's look, for NavigationLink.
struct RowLabel: View {
    let label: String
    var sub: String?
    var icon: String?
    var swatch: Int?

    var body: some View {
        HStack(spacing: 8) {
            if let icon {
                ZStack {
                    Circle().fill(C.brand)
                    Image("ph_\(icon)").renderingMode(.template).resizable().scaledToFit().frame(width: 17, height: 17).foregroundStyle(.black)
                }
                .frame(width: 27, height: 27)
            }
            if let swatch { Swatch(color: swatch).padding(.trailing, 2) }
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.barlow(15, .semibold)).foregroundStyle(C.text).lineLimit(1)
                if let sub { Text(sub).font(.barlow(12, .regular)).foregroundStyle(C.dim).lineLimit(1) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, minHeight: sub != nil ? 50 : 44)
        .background(C.row, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// UI-16.
struct MatchesPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        WatchList(title: "Matches") {
            MenuRow(label: "Sync now", sub: state.syncLine, icon: "sync") { state.sync() }
            if state.saved.matches.isEmpty {
                Text("No matches coming up").font(.barlow(13)).foregroundStyle(C.dim).padding(.top, 8)
            }
            ForEach(state.saved.matches) { m in
                NavigationLink { PlannedPage(id: m.id) } label: {
                    RowLabel(label: m.title, sub: m.kickoff.map { Date(timeIntervalSince1970: TimeInterval($0)).formatted(date: .abbreviated, time: .shortened) })
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// UI-19: a downloaded match's own screen.
struct PlannedPage: View {
    @Environment(AppState.self) private var state
    let id: String

    var body: some View {
        if let m = state.saved.matches.first(where: { $0.id == id }) {
            WatchList(title: m.title) {
                MenuRow(label: "Start match", sub: m.setup.summary, icon: "play") { state.beginMatch(m.setup) }
                // TRK-13: walking the pitch before the match.
                NavigationLink { PitchView(matchId: m.id, created: nil) } label: { RowLabel(label: "Mark pitch", sub: "Walk its corners", icon: "flag") }.buttonStyle(.plain)
                if let fee = m.fee {
                    ToggleRow(label: "Fee \(fee.text)", sub: fee.paid ? "Paid" : "Not paid yet", on: fee.paid) { state.markPaid(id, paid: $0) }
                }
                ForEach([m.where, m.name, m.role, m.weather, m.notes].compactMap { $0 }, id: \.self) { line in
                    Text(line).font(.barlow(13, .regular)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                }
            }
        }
    }
}

/// SET-4, SET-9, UI-16.
struct NewMatchPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        WatchList(title: "New match") {
            MenuRow(label: "Quick match", sub: state.saved.quick.summary, icon: "quick") { state.beginMatch(state.saved.quick) }
            // SET-13: once a match has been played, starting straight away; not when it's Quick match over again.
            if let last = state.saved.lastFormat, !last.sameFormat(as: state.saved.quick) {
                MenuRow(label: "Same as last", sub: last.summary, icon: "undo") { state.beginMatch(last) }
            }
            NavigationLink { CustomPage() } label: { RowLabel(label: "Custom", sub: "Choose the format", icon: "sliders") }.buttonStyle(.plain)
        }
        // A new Create match each time it's opened from here; leaving it drops what was chosen, as on Garmin.
        .onAppear { state.startDraft() }
    }
}

// UI-21: indexed by the clocks, clock style, break and edge values. TMR-11: each style with its example for a 2 × 45 match.
private let clocksNames = ["One clock", "Two, stacked", "Two, side by side"]
private let clockStyleNames = ["Match time", "Each half from 0", "Time left"]
private let clockStyleHints = ["0 to 90, like TV", "0 to 45, then again", "45 down to 0"]
private let breakNames = ["Time left", "Time taken"]
private let edgeNames = ["Neither", "Ring", "Time of day"]

/// "One clock · Match time · Ring", for Settings.
private func screenSummary(_ w: WatchScreen) -> String {
    "\(clocksNames[w.clocks]) · \(clockStyleNames[w.mainClock])" + (w.edge == edgeNone ? "" : " · \(edgeNames[w.edge])")
}

struct ChoicePage: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let values: [(Int, String)]
    let current: Int
    let pick: (Int) -> Void

    var body: some View {
        WatchList(title: title) {
            ForEach(values, id: \.0) { value, label in
                MenuRow(label: label, sub: value == current ? "Chosen" : nil) {
                    pick(value)
                    dismiss()
                }
            }
        }
    }
}

/// SET-9's rows, in its order, for Create match and Quick match: rows that only matter when a switch is on come
/// straight after it. `set` changes the format being edited as it is when a choice is made.
struct FormatRows: View {
    @Environment(AppState.self) private var state
    let f: MatchSetup
    let set: (@escaping (inout MatchSetup) -> Void) -> Void

    private func minutes(_ title: String, _ range: StrideThrough<Int>, _ current: Int, _ pick: @escaping (Int) -> Void) -> some View {
        NavigationLink { ChoicePage(title: title, values: range.map { ($0, "\($0) min") }, current: current / 60) { pick($0 * 60) } } label: { RowLabel(label: title, sub: "\(current / 60) min") }.buttonStyle(.plain)
    }

    var body: some View {
        // SET-8: the timers' names as they are now.
        let stoppage = state.saved.stoppageLabel
        let brk = state.saved.breakLabel
        NavigationLink { ChoicePage(title: "Periods", values: [(1, "1"), (2, "2"), (3, "3"), (4, "4")], current: f.numPeriods) { v in set { $0.numPeriods = v } } } label: { RowLabel(label: "Periods", sub: "\(f.numPeriods)") }.buttonStyle(.plain)
        minutes("Period length", stride(from: 5, through: 60, by: 5), f.periodSec) { v in set { $0.periodSec = v } }
        // SET-16: one period's break is only before extra time.
        minutes(f.numPeriods == 2 ? "Half-time" : f.numPeriods == 1 ? "Break before ET" : "Between periods", stride(from: 0, through: 30, by: 5), f.halftimeSec) { v in set { $0.halftimeSec = v } }
        NavigationLink { ChoicePage(title: "Team size", values: stride(from: 11, through: 4, by: -1).map { ($0, "\($0)") }, current: f.teamSize) { v in set { $0.teamSize = v } } } label: { RowLabel(label: "Team size", sub: "\(f.teamSize)") }.buttonStyle(.plain)
        // TMR-15: the clock that stops, after team size; it stops with the stoppage clock, so that's on with it and its row
        // left out, as is the break as stoppage's.
        NavigationLink {
            ChoicePage(title: "Clock", values: [(0, "Runs on"), (1, "Stops")], current: f.stops ? 1 : 0) { v in set { $0.stoppingClock = v == 1; if v == 1 { $0.trackStoppage = true } } }
        } label: { RowLabel(label: "Clock", sub: f.stops ? "Stops" : "Runs on") }.buttonStyle(.plain)
        if f.stops {
            ToggleRow(label: "Goals, cards stop", sub: f.stopsForGoalsCards ? "On" : "Off", on: f.stopsForGoalsCards) { v in set { $0.stopForGoalsCards = v } }
        } else {
            ToggleRow(label: "Track \(stoppage)", sub: f.trackStoppage ? "On" : "Off", on: f.trackStoppage) { v in set { $0.trackStoppage = v } }
        }
        ToggleRow(label: "Goal scorers", sub: f.goalScorers ? "Ask for the number" : "Off", on: f.goalScorers) { v in set { $0.goalScorers = v } }
        ToggleRow(label: "Goal types", sub: f.goalTypes ? "DFK, penalty, own goal" : "Off", on: f.goalTypes) { v in set { $0.goalTypes = v } }
        ToggleRow(label: "Extra time", sub: f.extraTime ? "On" : "Off", on: f.extraTime) { v in set { $0.extraTime = v } }
        if f.extraTime {
            NavigationLink { ChoicePage(title: "ET periods", values: [(1, "1"), (2, "2")], current: f.etPeriods) { v in set { $0.etPeriods = v } } } label: { RowLabel(label: "ET periods", sub: "\(f.etPeriods)") }.buttonStyle(.plain)
            minutes("ET period length", stride(from: 5, through: 30, by: 5), f.etPeriodSec) { v in set { $0.etPeriodSec = v } }
            // ET-6.
            ToggleRow(label: "Golden goal", sub: f.goldenGoal == true ? "First ET goal wins" : "Off", on: f.goldenGoal == true) { v in set { $0.goldenGoal = v } }
        }
        ToggleRow(label: "Penalties", sub: f.penalties ? "On" : "Off", on: f.penalties) { v in set { $0.penalties = v } }
        ToggleRow(label: "Halfway \(brk)", sub: f.midBreak ? "At \(formatClock(Int64(f.halfwayBreakAtSec) * 1000))" : "Off", on: f.midBreak) { v in set { $0.midBreak = v } }
        if f.midBreak {
            NavigationLink {
                ChoicePage(title: "\(brk.capitalized1) length", values: stride(from: 30, through: 300, by: 30).map { ($0, formatClock(Int64($0) * 1000)) }, current: f.breakLenSec) { v in set { $0.breakLenSec = v } }
            } label: { RowLabel(label: "\(brk.capitalized1) length", sub: formatClock(Int64(f.breakLenSec) * 1000)) }.buttonStyle(.plain)
            // TMR-12: only with a stoppage clock to add it to; a clock that stops always stops for the break (TMR-15).
            if f.trackStoppage && !f.stops {
                ToggleRow(label: "\(brk.capitalized1) as \(stoppage)", sub: f.breakStoppage ? "Time added on" : "Off", on: f.breakStoppage) { v in set { $0.breakStoppage = v } }
            }
        }
        // EVT-12: Sin bin in the team menu; its length, in minutes, straight after it while it's on.
        ToggleRow(label: "Sin bins", sub: f.hasSinBins ? "In the team menu" : "Off", on: f.hasSinBins) { v in set { $0.sinBins = v } }
        if f.hasSinBins {
            NavigationLink { SinBinLengthPage(current: f.sinBinLength / 60) { v in set { $0.sinBinSec = v * 60 } } } label: {
                RowLabel(label: "Sin bin length", sub: "\(f.sinBinLength / 60) min")
            }
            .buttonStyle(.plain)
        }
    }
}

/// EVT-12: the sin bin's length in minutes, 1 to 20, on the two digits (UI-8).
private struct SinBinLengthPage: View {
    @Environment(\.dismiss) private var dismiss
    let current: Int
    let pick: (Int) -> Void

    var body: some View {
        NumberEntry(title: "Sin bin length", unit: "Minutes, 1 to 20", start: current, minValue: 1, maxValue: 20, none: nil) { entered in
            if let entered { pick(entered) }
            dismiss()
        }
    }
}

/// SET-9, SET-13, SET-14: Create match, from the last match's format, with Same as last on, once there is one.
struct CustomPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let f = state.draft
        let hasLast = state.saved.lastFormat != nil
        let same = hasLast && state.sameAsLast
        WatchList(title: "Create match") {
            if hasLast {
                ToggleRow(label: "Same as last", sub: same ? f.fullSummary : "Change below", on: same) { state.chooseSameAsLast($0) }
            }
            MenuRow(label: "Start match", sub: same ? nil : f.summary, icon: "play") { state.beginMatch(f) }
            if !same {
                FormatRows(f: f) { change in change(&state.draft) }
            }
            // SET-14: last, and shown with Same as last on too, as colors change from match to match.
            NavigationLink { TeamColorsPage() } label: { RowLabel(label: "Team colors", sub: colorsSummary(f)) }.buttonStyle(.plain)
        }
    }

    /// "HOM Red · AWY Blue", or "None" when neither team has one.
    private func colorsSummary(_ f: MatchSetup) -> String {
        f.homeColor < 0 && f.awayColor < 0 ? "None" : "\(f.home) \(colorName(f.homeColor)) · \(f.away) \(colorName(f.awayColor))"
    }
}

/// SET-14.
struct TeamColorsPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let f = state.draft
        WatchList(title: "Team colors") {
            NavigationLink { ColorChoicePage(home: true) } label: { RowLabel(label: "Home team", sub: colorName(f.homeColor), swatch: f.homeColor) }.buttonStyle(.plain)
            NavigationLink { ColorChoicePage(home: false) } label: { RowLabel(label: "Away team", sub: colorName(f.awayColor), swatch: f.awayColor) }.buttonStyle(.plain)
        }
    }
}

struct ColorChoicePage: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let home: Bool

    var body: some View {
        let current = home ? state.draft.homeColor : state.draft.awayColor
        WatchList(title: home ? "Home color" : "Away color") {
            ForEach(teamColorChoices, id: \.0) { value, name in
                MenuRow(label: name, sub: value == current ? "Chosen" : nil, swatch: value) {
                    if home { state.draft.homeColor = value } else { state.draft.awayColor = value }
                    dismiss()
                }
            }
        }
    }
}

/// UI-17: Quick match's format, with Create match's rows, kept as it's changed.
struct QuickPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        WatchList(title: "Quick match") {
            FormatRows(f: state.saved.quick) { change in state.update { change(&$0.quick) } }
        }
    }
}

/// UI-17, SET-8: the stoppage and break timers' names, typed on the watch; a blank name is the default.
struct TimerNamesPage: View {
    @Environment(AppState.self) private var state
    @State private var stoppage = ""
    @State private var brk = ""

    var body: some View {
        let s = state.saved
        WatchList(title: "Timer names") {
            TimerNameField(label: "Stoppage timer", text: $stoppage, current: s.stoppageLabel) { name in state.update { $0.stoppageName = name } }
            TimerNameField(label: "Break timer", text: $brk, current: s.breakLabel) { name in state.update { $0.breakName = name } }
            if !(s.stoppageName ?? "").isEmpty || !(s.breakName ?? "").isEmpty {
                MenuRow(label: "Use the defaults", sub: "stoppage · break") {
                    state.update { s in
                        s.stoppageName = nil
                        s.breakName = nil
                    }
                }
            }
        }
    }
}

/// A timer's name, with the system's text entry.
private struct TimerNameField: View {
    let label: String
    @Binding var text: String
    let current: String
    let save: (String?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.barlow(12, .regular)).foregroundStyle(C.dim).padding(.leading, 10)
            TextField(current, text: $text)
                .font(.barlow(15, .semibold))
                .onSubmit {
                    let typed = String(text.trimmingCharacters(in: .whitespaces).prefix(16))
                    save(typed.isEmpty ? nil : typed)
                    text = ""
                }
        }
    }
}

/// VER-2: the app's version and the server's; DATA-8: Reset LawFive, last.
struct AboutPage: View {
    @Environment(AppState.self) private var state
    @State private var confirming = false

    var body: some View {
        let s = state.saved
        if state.resetting {
            Text("Resetting…").font(.barlow(15)).foregroundStyle(C.dim)
        } else if confirming {
            ConfirmScreen(question: "Reset LawFive?", detail: "Erases matches, history and the link. Settings stay.", yes: "Reset", danger: true, onYes: {
                confirming = false
                Task { await state.reset() }
            }, onNo: { confirming = false })
        } else {
            WatchList(title: "About") {
                RowLabel(label: "LawFive for Apple Watch", sub: "Version \(state.version)")
                RowLabel(label: "Server", sub: state.serverUrl.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                if let version = s.serverVersion { RowLabel(label: "Server version", sub: version) }
                RowLabel(label: "History", sub: "\(s.history.count) of \(historyKept) matches kept")
                RowLabel(label: "Open source", sub: "lawfive.dev")
                MenuRow(label: "Reset LawFive", sub: "Erase everything here") { confirming = true }
            }
        }
    }
}

private func sentLine(_ h: FinishedMatch, linked: Bool) -> String { h.sent ? "Sent" : linked ? "Waiting to send" : "Not sent" }

private func playedTitle(_ h: FinishedMatch) -> String {
    let pens = h.pens.map { " (\($0[0])-\($0[1]))" } ?? (h.golden == true ? " (GG)" : "")
    return "\(h.home) \(h.score[0])-\(h.score[1])\(pens) \(h.away)"
}

/// UI-17, UI-20: a played match from History, as on the Garmin watch: whether it's on LawFive, its Summary and Events,
/// the fee's Paid toggle, Mark pitch (TRK-13) and Remove from watch.
struct PlayedPage: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    let created: Int64
    @State private var removing = false

    var body: some View {
        if let h = state.saved.history.first(where: { $0.created == created }) {
            if removing {
                // Removing one that hasn't reached LawFive loses it for good, so it says so.
                ConfirmScreen(question: h.sent ? "Remove from watch?" : "Not sent to LawFive", detail: h.sent ? "It stays on LawFive" : "Remove it anyway? It will be lost",
                              yes: "Remove", danger: true, onYes: {
                    removing = false
                    state.removeFinished(created)
                    dismiss()
                }, onNo: { removing = false })
            } else {
                WatchList(title: playedTitle(h)) {
                    Text(h.sent ? "Sent to LawFive" : state.linked ? "Waiting to send" : "On this watch only · Link to send it")
                        .font(.barlow(13, .regular)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                    if h.setup != nil {
                        NavigationLink { SummaryPage(created: created) } label: { RowLabel(label: "Summary", sub: playedWhen(h)) }.buttonStyle(.plain)
                        NavigationLink { PlayedEventsPage(created: created) } label: { RowLabel(label: "Events", sub: eventsCount(h)) }.buttonStyle(.plain)
                    }
                    if let fee = h.fee, let id = h.matchId {
                        ToggleRow(label: "Fee \(fee.text)", sub: fee.paid ? "Paid" : "Not paid yet", on: fee.paid) { state.markPaid(id, paid: $0) }
                    }
                    NavigationLink { PitchView(matchId: h.matchId, created: h.created) } label: { RowLabel(label: "Mark pitch", sub: "Walk its corners", icon: "flag") }.buttonStyle(.plain)
                    MenuRow(label: "Remove from watch") { removing = true }
                }
            }
        }
    }

    private func eventsCount(_ h: FinishedMatch) -> String {
        let n = listedEvents(h.events ?? []).count
        return n == 0 ? "None recorded" : n == 1 ? "1 event" : "\(n) events"
    }
}

/// "Sat Nov 7", when it was played.
private func playedWhen(_ h: FinishedMatch) -> String {
    Date(timeIntervalSince1970: TimeInterval(h.created)).formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
}

/// UI-17: a finished match at a glance, as the Garmin watch's: the score, each period played with what was added, the
/// cards and the distance.
struct SummaryPage: View {
    @Environment(AppState.self) private var state
    let created: Int64

    var body: some View {
        if let h = state.saved.history.first(where: { $0.created == created }), let setup = h.setup {
            let events = h.events ?? []
            let ends = events.filter { $0.type == EventType.periodEnd && $0.seconds >= 0 }
            // As in the website's Stats: a second caution is one of each, and team officials' cards count (EVT-15); a second
            // sin bin is a send-off, and sin bins are counted on their own (EVT-12).
            let yellow = events.filter { [EventType.yellow, EventType.secondYellow, EventType.officialYellow].contains($0.type) }.count
            let red = events.filter { [EventType.red, EventType.secondYellow, EventType.officialRed, EventType.secondSinBin].contains($0.type) }.count
            let binned = events.filter { $0.type == EventType.sinBin || $0.type == EventType.secondSinBin }.count
            WatchList(title: "Summary") {
                RowLabel(label: "Score", sub: "\(h.home) \(h.score[0])-\(h.score[1]) \(h.away)" + (h.pens.map { " · \($0[0])-\($0[1]) pens" } ?? "") + (h.golden == true ? " · golden goal" : ""))
                ForEach(Array(ends.enumerated()), id: \.offset) { _, e in
                    let length = e.period < setup.numPeriods ? setup.periodSec : setup.etPeriodSec
                    RowLabel(label: periodName(e.period, setup.numPeriods, etPeriods: setup.etPeriods).capitalized1,
                             sub: "Played \(formatClock(Int64(e.seconds) * 1000))" + (e.seconds > length ? " · +\(formatClock(Int64(e.seconds - length) * 1000))" : ""))
                }
                RowLabel(label: "Cards", sub: (yellow == 1 ? "1 caution" : "\(yellow) cautions") + " · " + (red == 1 ? "1 send-off" : "\(red) send-offs"))
                if binned > 0 { RowLabel(label: "Sin bins", sub: binned == 1 ? "1 sin bin" : "\(binned) sin bins") }
                if let distance = h.distanceM, distance > 0 {
                    RowLabel(label: "Distance", sub: Measurement(value: distance, unit: UnitLength.meters).formatted(.measurement(width: .abbreviated, usage: .road, numberFormatStyle: .number.precision(.fractionLength(1)))))
                }
            }
        }
    }
}

/// UI-17: the events of a finished match, the same list as at full time.
struct PlayedEventsPage: View {
    @Environment(AppState.self) private var state
    let created: Int64

    var body: some View {
        if let h = state.saved.history.first(where: { $0.created == created }), let setup = h.setup {
            let shown = listedEvents(h.events ?? [])
            WatchList(title: "Events") {
                if shown.isEmpty { Text("None recorded").font(.barlow(13)).foregroundStyle(C.dim) }
                ForEach(Array(shown.enumerated()), id: \.offset) { _, e in
                    RowLabel(label: describeEvent(e, home: h.home, away: h.away), sub: eventWhen(e, setup: setup, clockStyle: h.clockStyle ?? clockUp))
                }
            }
        }
    }
}

struct HistoryPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        WatchList(title: "History") {
            if state.saved.history.isEmpty {
                Text("Finished matches show here").font(.barlow(13)).foregroundStyle(C.dim).multilineTextAlignment(.center).padding(.top, 8)
            }
            ForEach(state.saved.history) { h in
                NavigationLink { PlayedPage(created: h.created) } label: { RowLabel(label: playedTitle(h), sub: sentLine(h, linked: state.linked)) }.buttonStyle(.plain)
            }
        }
    }
}

/// UI-17.
struct SettingsPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let s = state.saved
        let alerts = [s.vibeFullTime, s.vibeAdded ?? true, s.vibeSinBin ?? true, s.vibeBreak, s.vibeStoppage]
        let on = alerts.filter { $0 }.count
        WatchList(title: "Settings") {
            NavigationLink { AccountPage() } label: { RowLabel(label: "Account", sub: state.linked ? state.syncLine : "Not linked", icon: "account") }.buttonStyle(.plain)
            NavigationLink { AlertsPage() } label: { RowLabel(label: "Alerts", sub: on == alerts.count ? "All on" : on == 0 ? "All off" : "\(on) of \(alerts.count) on", icon: "alerts") }.buttonStyle(.plain)
            // UI-17: how the match is run by hand, apart from what it vibrates for.
            NavigationLink { ControlsPage() } label: { RowLabel(label: "Controls", sub: s.touchLock == true ? "Touch lock on" : "Tap for \(s.stoppageLabel): \(s.tapStoppage ? "on" : "off")", icon: "controls") }.buttonStyle(.plain)
            // TRK-7, ACT-4: recording switches, not account matters, so here rather than in Account; linked or not, as a
            // watch linked later sends its tracks too.
            ToggleRow(label: "Record track", sub: "GPS and heart rate", on: s.recordTrack ?? true) { v in state.update { $0.recordTrack = v } }
            ToggleRow(label: "Save to Health", sub: "As a soccer workout", on: s.saveToHealth ?? true) { v in state.update { $0.saveToHealth = v } }
            NavigationLink { ScreenPage() } label: { RowLabel(label: "Match screen", sub: screenSummary(s.chosenScreen), icon: "watch") }.buttonStyle(.plain)
            NavigationLink { TimerNamesPage() } label: { RowLabel(label: "Timer names", sub: "\(s.stoppageLabel.capitalized1) · \(s.breakLabel)", icon: "text") }.buttonStyle(.plain)
            NavigationLink { QuickPage() } label: { RowLabel(label: "Quick match", sub: s.quick.summary, icon: "quick") }.buttonStyle(.plain)
            NavigationLink { AboutPage() } label: { RowLabel(label: "About", sub: "LawFive for Apple Watch", icon: "info") }.buttonStyle(.plain)
        }
    }
}

/// UI-21 to UI-24, TMR-4, TMR-11.
struct ScreenPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let w = state.saved.chosenScreen
        let styles = { (skip: Int) in (0...2).filter { $0 != skip }.map { ($0, clockStyleNames[$0]) } }
        WatchList(title: "Match screen") {
            NavigationLink { ChoicePage(title: "Clocks", values: clocksNames.enumerated().map { ($0.offset, $0.element) }, current: w.clocks) { v in state.chooseScreen { $0.clocks = v } } } label: { RowLabel(label: "Clocks", sub: clocksNames[w.clocks]) }.buttonStyle(.plain)
            NavigationLink { ChoicePage(title: "Match clock", values: styles(-1), current: w.mainClock) { v in state.chooseScreen { $0.mainClock = v } } } label: { RowLabel(label: "Match clock", sub: "\(clockStyleNames[w.mainClock]): \(clockStyleHints[w.mainClock])") }.buttonStyle(.plain)
            NavigationLink { ChoicePage(title: "Second clock", values: styles(w.mainClock), current: w.second) { v in state.chooseScreen { $0.secondClock = v } } } label: { RowLabel(label: "Second clock", sub: w.clocks == clocksOne ? "With two clocks" : clockStyleNames[w.second]) }.buttonStyle(.plain)
            NavigationLink { ChoicePage(title: "Break clock", values: breakNames.enumerated().map { ($0.offset, $0.element) }, current: w.breakClock) { v in state.chooseScreen { $0.breakClock = v } } } label: { RowLabel(label: "Break clock", sub: breakNames[w.breakClock]) }.buttonStyle(.plain)
            // UI-25: Apple Watch always shows its own clock, so the time of day is for the account's other watches.
            NavigationLink { ChoicePage(title: "Ring or time", values: [edgeRing, edgeTime, edgeNone].map { ($0, edgeNames[$0]) }, current: w.edge) { v in state.chooseScreen { $0.edge = v } } } label: { RowLabel(label: "Ring or time", sub: w.edge == edgeTime ? "Time of day · the watch's own here" : edgeNames[w.edge]) }.buttonStyle(.plain)
            ToggleRow(label: "Team names", sub: w.names ? "Over the clock" : "Scores only", on: w.names) { v in state.chooseScreen { $0.names = v } }
        }
    }
}

struct AlertsPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let s = state.saved
        WatchList(title: "Alerts") {
            ToggleRow(label: "Full time", sub: "End of each period", on: s.vibeFullTime) { v in state.update { $0.vibeFullTime = v } }
            ToggleRow(label: "Added time", sub: "Vibrate when it's used up", on: s.vibeAdded ?? true) { v in state.update { $0.vibeAdded = v } }
            // EVT-12: the sin bin's end, repeating until a tap.
            ToggleRow(label: "Sin bin over", sub: "Vibrate when one can return", on: s.vibeSinBin ?? true) { v in state.update { $0.vibeSinBin = v } }
            ToggleRow(label: "Breaks", sub: "When due and over", on: s.vibeBreak) { v in state.update { $0.vibeBreak = v } }
            ToggleRow(label: "Stoppage", sub: "Remind while it runs", on: s.vibeStoppage) { v in state.update { $0.vibeStoppage = v } }
            // VIB-3, as on the Garmin watch: the same choices and defaults.
            let remind = s.stoppageReminderSec ?? 10
            NavigationLink {
                ChoicePage(title: "Remind every", values: [0, 10, 20, 30, 60].map { ($0, $0 == 0 ? "Off" : "\($0) s") }, current: remind) { v in state.update { $0.stoppageReminderSec = v } }
            } label: { RowLabel(label: "Remind every", sub: remind == 0 ? "Off" : "\(remind) s") }.buttonStyle(.plain)
            // VIB-1, VIB-4, VIB-7: how often a repeating alert repeats until it's answered.
            let repeatEvery = s.alertRepeatSec ?? 10
            NavigationLink {
                ChoicePage(title: "Repeat every", values: [5, 10, 15, 20, 30].map { ($0, "\($0) s") }, current: repeatEvery) { v in state.update { $0.alertRepeatSec = v } }
            } label: { RowLabel(label: "Repeat alerts every", sub: "\(repeatEvery) s") }.buttonStyle(.plain)
        }
    }
}

/// UI-17, INP-4: how the match is run by hand. Team swipes are the account's (INP-10), not the watch's, so only Tap for
/// stoppage, Card reasons (EVT-14) and Touch lock (INP-12) are here.
struct ControlsPage: View {
    @Environment(AppState.self) private var state

    var body: some View {
        let s = state.saved
        WatchList(title: "Controls") {
            ToggleRow(label: "Tap for \(s.stoppageLabel)", sub: "Tap the screen to start and end it", on: s.tapStoppage) { v in state.update { $0.tapStoppage = v } }
            // EVT-14: the list of misconduct codes after a card's number (or an official's role); off by default.
            ToggleRow(label: "Card reasons", sub: s.cardReasons == true ? "Ask after the number" : "Off", on: s.cardReasons == true) { v in state.update { $0.cardReasons = v } }
            // INP-12: the system's Water Lock whenever play's screen shows; the Digital Crown turns it off.
            ToggleRow(label: "Touch lock", sub: s.touchLock == true ? "Water Lock in play; the crown unlocks" : "Off", on: s.touchLock == true) { v in state.update { $0.touchLock = v } }
        }
    }
}

struct AccountPage: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var confirming = false
    @State private var address = ""
    @State private var refused = false

    private var host: String { state.serverUrl.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "") }

    var body: some View {
        if confirming {
            ConfirmScreen(question: "Unlink this watch?", detail: "Matches waiting to send stay", danger: true, onYes: {
                state.unlink()
                confirming = false
                dismiss()
            }, onNo: { confirming = false })
        } else {
            WatchList(title: "Account") {
                if state.linked {
                    MenuRow(label: "Sync now", sub: state.syncLine, icon: "sync") { state.sync() }
                    MenuRow(label: "Unlink", sub: host) { confirming = true }
                } else {
                    NavigationLink { LinkPage() } label: { RowLabel(label: "Link account", sub: "Get a code", icon: "link") }.buttonStyle(.plain)
                    // SYNC-9: a self-hosted server's address, with the system's text entry.
                    if refused { Text("It needs https://").font(.barlow(12)).foregroundStyle(C.red) }
                    TextField("Server: \(host)", text: $address)
                        .font(.barlow(13))
                        .onSubmit {
                            let typed = address.trimmingCharacters(in: .whitespaces)
                            let full = typed.isEmpty ? nil : typed.contains("://") ? typed : "https://" + typed
                            // WCH-4: the session's token never goes over plain http, except from a debug build to a test server.
                            #if DEBUG
                            state.setServer(full)
                            address = ""
                            #else
                            if full == nil || full!.hasPrefix("https://") {
                                state.setServer(full)
                                address = ""
                            } else {
                                refused = true
                            }
                            #endif
                        }
                }
                // UI-17: Record track and Save to Health are in Settings itself.
            }
        }
    }
}

/// SYNC-1: a code for the website; approved there, the watch gets its token.
struct LinkPage: View {
    @Environment(AppState.self) private var state
    @Environment(\.dismiss) private var dismiss
    @State private var code: String?
    @State private var address = ""
    @State private var problem: String?
    @State private var attempt = 0

    var body: some View {
        VStack(spacing: 2) {
            if let problem {
                Text(problem).font(.barlow(16, .semibold)).foregroundStyle(C.red).multilineTextAlignment(.center)
                PillButton(label: "Try again") { attempt += 1 }.padding(.top, 8)
            } else if let code {
                // SYNC-1: the website, or Link a watch in either phone app, takes the code.
                Text("Enter this code at").font(.barlow(13)).foregroundStyle(C.dim)
                Text(address).font(.barlow(13, .semibold)).multilineTextAlignment(.center).foregroundStyle(C.text)
                Text(code).font(.figure(28)).foregroundStyle(C.brand).lineLimit(1).minimumScaleFactor(0.7).padding(.vertical, 6)
                Text("or in the LawFive phone app").font(.barlow(13)).foregroundStyle(C.dim).multilineTextAlignment(.center)
                Text("Waiting…").font(.barlow(12, .regular)).foregroundStyle(C.dim)
            } else {
                Text("Getting a code…").font(.barlow(15)).foregroundStyle(C.dim)
            }
        }
        .padding(.horizontal, 6)
        .task(id: attempt) { await link() }
    }

    private func link() async {
        problem = nil
        code = nil
        do {
            let answer = try await state.server.deviceCode()
            let user = answer.user_code
            code = user.count == 8 ? user.prefix(4) + "-" + user.suffix(4) : user
            address = (answer.verification_uri ?? state.serverUrl + "/link").replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
            let ends = Date().addingTimeInterval(TimeInterval(answer.expires_in ?? 600))
            while Date() < ends, !Task.isCancelled {
                try await Task.sleep(for: .seconds(answer.interval ?? 5))
                if let token = try await state.server.deviceToken(answer.device_code) {
                    state.linkWith(token)
                    dismiss()
                    return
                }
            }
            problem = "Code expired"
        } catch let e as ServerRefused {
            problem = e.error == "access_denied" ? "Not linked" : "Code expired"
        } catch is CancellationError {
        } catch {
            problem = "Can't reach the server"
        }
    }
}

/// WCH-7: the first time the app opens, LawFive's own words on what it asks for and why, then Continue brings Apple
/// Health's question and the location's. Refused, the match still runs; the screen says what's lost and where to turn
/// it back on.
struct PermissionsPage: View {
    @Environment(AppState.self) private var state
    @State private var asking = false
    @State private var refused: (health: Bool, location: Bool)?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                if let refused {
                    Text("The match still runs").font(.barlow(17, .semibold)).foregroundStyle(C.text)
                    if refused.health { Text("Without Health, alerts stop when the screen goes off, and no heart rate is kept.").font(.barlow(13, .regular)).foregroundStyle(C.dim) }
                    if refused.location { Text("Without location, there's no track of your match.").font(.barlow(13, .regular)).foregroundStyle(C.dim) }
                    Text("Turn them on in the watch's Settings, under Privacy & Security.").font(.barlow(13, .regular)).foregroundStyle(C.text)
                    PillButton(label: "Done") { state.finishPermissions() }.padding(.top, 4)
                } else {
                    Text("Before your first match").font(.barlow(17, .semibold)).foregroundStyle(C.text)
                    reason(icon: "location", title: "Location", text: "Your track on the pitch")
                    reason(icon: "heart", title: "Heart rate and Health", text: "The match runs as a workout, so alerts vibrate with the screen off, and your heart rate is kept")
                    Text("Apple asks next. Say no and the match still runs.").font(.barlow(12, .regular)).foregroundStyle(C.dim)
                    PillButton(label: asking ? "Asking…" : "Continue") {
                        guard !asking else { return }
                        asking = true
                        Task {
                            let answer = await state.askPermissions()
                            asking = false
                            if answer.health || answer.location { refused = answer } else { state.finishPermissions() }
                        }
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.horizontal, 6)
        }
        #if DEBUG
        // For a picture of the refused page (-refused), without Apple's questions.
        .onAppear { if UserDefaults.standard.string(forKey: "refused") != nil { refused = (true, true) } }
        #endif
    }

    private func reason(icon: String, title: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            ZStack {
                Circle().fill(C.brand)
                Image("ph_\(icon)").renderingMode(.template).resizable().scaledToFit().frame(width: 15, height: 15).foregroundStyle(.black)
            }
            .frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 0) {
                Text(title).font(.barlow(14, .semibold)).foregroundStyle(C.text)
                Text(text).font(.barlow(12, .regular)).foregroundStyle(C.dim).fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
