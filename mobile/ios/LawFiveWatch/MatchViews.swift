import SwiftUI
import WatchKit

// The match (WCH-2, WCH-6): the same phases, layouts (UI-21) and controls as the Garmin watch and Wear OS. Swipe down
// for the home team, up for the away team (INP-1, INP-2), sideways for the game menu (INP-3).

private enum Overlay {
    case gameMenu
    case team(Int)
    case goalType(Int)
    /// EVT-15: a team official's card, then the role.
    case official(Int)
    case officialRole(team: Int, red: Bool)
    case number(team: Int, type: String)
    /// TMR-14: putting the clock (or the added time) right: the minutes, then the seconds, from the value captured
    /// when it was chosen, in whole seconds; the minutes as entered so far.
    case adjustMinutes(added: Bool, captured: Int, minutes: Int)
    case adjustSeconds(added: Bool, captured: Int, minutes: Int)
    /// EVT-5; EVT-12: a second sin bin is a send-off too.
    case secondYellow(team: Int, player: Int, sinBin: Bool)
    /// EVT-14: the card's reason, from the cautions' or the send-offs' codes; then a second yellow's or sin bin's red screen.
    case reason(sendOff: Bool, second: SecondCard?)
    case confirm(question: String, detail: String?, yes: String, danger: Bool, action: () -> Void)
    case events
    case coin
    case direction
    case abandon
    /// TMR-13: why play is suspended.
    case suspend
}

#if DEBUG
/// -menu opens the team menu once, not each time the match comes back.
@MainActor private var debugMenuOpened = false
#endif

/// EVT-5, EVT-12: a second yellow or second sin bin, for the red screen after the reason (EVT-14).
private struct SecondCard {
    let team: Int
    let player: Int
    let sinBin: Bool
}

struct MatchFlow: View {
    @Environment(AppState.self) private var state
    @State private var overlay: Overlay?

    var body: some View {
        if let match = state.match {
            let _ = state.revision
            Group {
                switch overlay {
                case nil: main(match)
                case .gameMenu: back { GameMenu(match: match, revision: state.revision, close: { overlay = nil }, open: { overlay = $0 }) }
                case .team(let team): back { teamMenu(match, team) }
                case .goalType(let team): back { goalTypeMenu(match, team) }
                case .official(let team): back { officialMenu(match, team) }
                case .officialRole(let team, let red): back { officialRoleMenu(match, team, red: red) }
                case .number(let team, let type):
                    back {
                        NumberEntry(title: title(type, match.teamName(team)), type: type) { player in
                            let second = record(type, team, player)
                            let red = second && player != nil ? SecondCard(team: team, player: player!, sinBin: type == EventType.sinBin) : nil
                            // EVT-14: with Card reasons on, the card's reason comes next, before a send-off's red screen.
                            if state.saved.cardReasons == true && [EventType.yellow, EventType.red, EventType.sinBin].contains(type) {
                                overlay = .reason(sendOff: type == EventType.red, second: red)
                            } else {
                                overlay = afterReason(red)
                            }
                        }
                    }
                case .adjustMinutes(let added, let captured, let minutes):
                    back {
                        NumberEntry(title: added ? "Added time" : "Adjust clock", unit: added ? "Minutes" : adjustUnit("Minutes", match),
                                    start: minutes, none: nil) { entered in
                            overlay = .adjustSeconds(added: added, captured: captured, minutes: entered ?? 0)
                        }
                    }
                case .adjustSeconds(let added, let captured, let minutes):
                    back {
                        NumberEntry(title: added ? "Added time" : "Adjust clock", unit: added ? "Seconds" : adjustUnit("Seconds", match),
                                    start: captured % 60, maxValue: 59, none: nil) { entered in
                            adjusted(added: added, captured: captured, to: minutes * 60 + (entered ?? 0))
                        }
                    }
                case .secondYellow(let team, let player, let sinBin):
                    // EVT-5: a full red screen and a strong vibration; EVT-12: for a second sin bin too.
                    Button { overlay = nil } label: {
                        VStack(spacing: 3) {
                            Text(sinBin ? "Second sin bin" : "Second yellow").font(.barlow(18, .semibold))
                            Text("#\(player) \(match.teamName(team))").font(.barlow(16))
                            Text("Send off").font(.figure(28))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(C.red)
                    }
                    .buttonStyle(TapOnly())
                    .ignoresSafeArea()
                    .onAppear { Haptics.sendOff() }
                case .confirm(let question, let detail, let yes, let danger, let action):
                    ConfirmScreen(question: question, detail: detail, yes: yes, danger: danger, onYes: {
                        action()
                        overlay = nil
                    }, onNo: { overlay = nil })
                case .reason(let sendOff, let second): back { reasonMenu(match, sendOff: sendOff, second: second) }
                case .events: back { eventsList(match) }
                case .coin: back { CoinToss() }
                case .direction: back { DirectionScreen(match: match) { overlay = nil } }
                case .abandon: back { abandonReasons(match) }
                case .suspend: back { suspendReasonMenu(match) }
                }
            }
            .simultaneousGesture(overlay == nil ? nil : swipeBack)
        }
    }

    /// WCH-9: a swipe right leaves an overlay, as the X does; the match screen has its own swipes.
    private var swipeBack: some Gesture {
        DragGesture(minimumDistance: 22).onEnded { drag in
            if drag.translation.width > abs(drag.translation.height) { overlay = backTarget }
        }
    }

    /// The coin toss opens from the game menu, so it goes back there; everything else, to the match.
    private var backTarget: Overlay? {
        if case .coin = overlay { return .gameMenu }
        if case .direction = overlay { return .gameMenu }
        if case .abandon = overlay { return .gameMenu }
        if case .suspend = overlay { return .gameMenu }
        // TMR-14: from the seconds back to the minutes, as entered.
        if case .adjustSeconds(let added, let captured, let minutes) = overlay { return .adjustMinutes(added: added, captured: captured, minutes: minutes) }
        // EVT-14: Back is No reason: the card stands, and a send-off's red screen still comes.
        if case .reason(_, let second) = overlay { return afterReason(second) }
        return nil
    }

    private func back<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        NavigationStack {
            content()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { overlay = backTarget } label: { Image(systemName: "xmark") }
                            .accessibilityLabel("Back")
                    }
                }
        }
    }

    @ViewBuilder private func main(_ match: Match) -> some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let now = Int64(context.date.timeIntervalSince1970 * 1000)
            GeometryReader { geo in
                ZStack {
                    Color.black
                    switch match.phase {
                    case .pre, .ready, .nextKickoff: KickoffScreen(match: match, size: geo.size, revision: state.revision)
                    case .running: RunningScreen(match: match, now: now, size: geo.size)
                    case .breakTime: BreakScreen(match: match, now: now, size: geo.size)
                    case .suspended: SuspendedScreen(match: match, now: now, size: geo.size)
                    case .decide: DecideScreen(match: match, revision: state.revision) { overlay = $0 }
                    case .penalties: PenaltiesScreen(match: match, size: geo.size, revision: state.revision)
                    case .golden: GoldenScreen(match: match, size: geo.size, revision: state.revision)
                    case .done: FullTimeScreen(match: match, size: geo.size, revision: state.revision) { overlay = .events }
                        .onAppear { state.screenFree = true }
                        .onDisappear { state.screenFree = false }
                    }
                    // EVT-12: a sin bin over, over play's screen until a tap (VIB-6); swipes still open the menus, as with VIB-1's alerts.
                    if match.phase == .running || match.phase == .golden, let back = match.sinBinReturns.first {
                        SinBinReturnScreen(match: match, event: back, more: match.sinBinReturns.count - 1, size: geo.size)
                            .onTapGesture { state.changeMatch { $0.acknowledgeAlerts(nowMs()) } }
                    }
                }
            }
        }
        .ignoresSafeArea()
        .toolbar(.hidden, for: .navigationBar)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 22).onEnded { drag in
            let t = drag.translation
            let upDown = abs(t.height) > abs(t.width)
            // INP-10: sideways, a swipe right opens home and left away, and up the game menu (down nothing).
            if state.saved.teamSwipes == "sideways" {
                if !upDown {
                    overlay = .team(t.width > 0 ? home : away)
                } else if t.height < 0 {
                    overlay = .gameMenu
                }
            } else if upDown {
                overlay = .team(t.height > 0 ? home : away)
            } else {
                overlay = .gameMenu
            }
        })
        .onTapGesture {
            let at = nowMs()
            var handled = false
            state.changeMatch { handled = $0.acknowledgeAlerts(at) }
            if !handled && match.phase == .running && state.saved.tapStoppage { state.changeMatch { $0.toggleStoppage(at) } }
        }
        // INP-12: Touch lock is the system's Water Lock, turned on as play's screen shows: at each kickoff, on resuming,
        // and back from a menu or the number entry. Turning the Digital Crown turns it off until then.
        .onAppear {
            waterLock(match)
            #if DEBUG
            // UI-10: -menu home or away opens that team's menu, to see its kit.
            if !debugMenuOpened, let team = UserDefaults.standard.string(forKey: "menu") {
                debugMenuOpened = true
                overlay = .team(team == "away" ? away : home)
            }
            #endif
        }
        .onChange(of: match.phase) { waterLock(match) }
    }

    /// INP-12: watchOS turns Water Lock on only for an app in front with a workout running (WCH-7); otherwise it does nothing.
    private func waterLock(_ match: Match) {
        guard state.saved.touchLock == true, match.phase == .running else { return }
        let device = WKInterfaceDevice.current()
        if !device.isWaterLockEnabled { device.enableWaterLock() }
    }

    @discardableResult private func record(_ type: String, _ team: Int, _ player: Int?) -> Bool {
        var second = false
        state.changeMatch { second = $0.addEvent(type, team: team, player: player, now: nowMs()) }
        Haptics.tick()
        return second
    }

    /// TMR-14: the value entered against the one captured; nothing changed goes back to the match, otherwise Adjust or No.
    private func adjusted(added: Bool, captured: Int, to value: Int) {
        let change = value - captured
        if change == 0 {
            overlay = nil
            return
        }
        overlay = .confirm(question: "\(added ? "Added time" : "Clock") \(formatChange(change))?", detail: "To \(formatClock(Int64(value) * 1000))", yes: "Adjust", danger: false) {
            state.changeMatch { m in
                if added { m.adjustAdded(change, now: nowMs()) } else { m.adjustClock(change, now: nowMs()) }
            }
            Haptics.tick()
        }
    }

    private func title(_ type: String, _ team: String) -> String {
        switch type {
        case EventType.yellow: return "Yellow \(team)"
        case EventType.red: return "Red \(team)"
        case EventType.injury: return "Injury \(team)"
        case EventType.sinBin: return "Sin bin \(team)"
        default: return "Goal \(team)"
        }
    }

    private func teamMenu(_ match: Match, _ team: Int) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                // UI-10: the team as its own kit, cut on the side that meets the other team, as on the other watches.
                Kit(name: match.teamName(team), color: match.teamColor(team), size: 15, home: team == home)
                if match.phase == .running {
                    MenuRow(label: "Goal") {
                        if match.setup.goalTypes {
                            overlay = .goalType(team)
                        } else if match.setup.goalScorers {
                            overlay = .number(team: team, type: EventType.goal)
                        } else {
                            record(EventType.goal, team, nil)
                            overlay = nil
                        }
                    }
                }
                // EVT-12: with sin bins in the format, above Yellow card (the owner's order), in the cards' yellow on the dark
                // band so it isn't taken for Yellow card; not once the clock has nothing left to run.
                if match.setup.hasSinBins && match.phase != .penalties && match.phase != .done {
                    MenuRow(label: "Sin bin", textColor: C.yellow) { overlay = .number(team: team, type: EventType.sinBin) }
                }
                MenuRow(label: "Yellow card", fill: C.yellow, textColor: .black) { overlay = .number(team: team, type: EventType.yellow) }
                MenuRow(label: "Red card", fill: C.red, textColor: .white) { overlay = .number(team: team, type: EventType.red) }
                // EVT-15, EVT-16: a team official's card after the players', then an injury.
                MenuRow(label: "Team official") { overlay = .official(team) }
                MenuRow(label: "Injury") { overlay = .number(team: team, type: EventType.injury) }
            }
        }
    }

    /// EVT-15: the card for a team official, in the cards' colors.
    private func officialMenu(_ match: Match, _ team: Int) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                Kit(name: match.teamName(team), color: match.teamColor(team), size: 15, home: team == home)
                MenuRow(label: "Yellow card", fill: C.yellow, textColor: .black) { overlay = .officialRole(team: team, red: false) }
                MenuRow(label: "Red card", fill: C.red, textColor: .white) { overlay = .officialRole(team: team, red: true) }
            }
        }
        .navigationTitle("Official")
    }

    /// EVT-15: who it was for, in place of a player's number.
    private func officialRoleMenu(_ match: Match, _ team: Int, red: Bool) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                ForEach(Array(officialRoles.enumerated()), id: \.offset) { role, label in
                    MenuRow(label: label) {
                        state.changeMatch { $0.addOfficialCard(red: red, team: team, role: role, now: nowMs()) }
                        Haptics.tick()
                        overlay = state.saved.cardReasons == true ? .reason(sendOff: red, second: nil) : nil
                    }
                }
            }
        }
        .navigationTitle("\(red ? "Red" : "Yellow") \(match.teamName(team))")
    }

    /// EVT-14: what comes after the reason: the red screen for a second yellow or sin bin, else the match.
    private func afterReason(_ second: SecondCard?) -> Overlay? {
        second.map { .secondYellow(team: $0.team, player: $0.player, sinBin: $0.sinBin) }
    }

    /// EVT-14: the card is recorded; its reason is chosen from the match's scheme, No reason first (Back is the same).
    private func reasonMenu(_ match: Match, sendOff: Bool, second: SecondCard?) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                MenuRow(label: "No reason") { overlay = afterReason(second) }
                ForEach(Misconduct.codes(Misconduct.scheme(match.misconductScheme), sendOff: sendOff), id: \.code) { code, meaning in
                    MenuRow(label: code, sub: meaning) {
                        state.changeMatch { $0.giveReason(code) }
                        Haptics.tick()
                        overlay = afterReason(second)
                    }
                }
            }
        }
        .navigationTitle("Reason")
    }

    private func goalTypeMenu(_ match: Match, _ team: Int) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                ForEach([(EventType.goal, "Goal"), (EventType.dfkGoal, "Direct free kick"), (EventType.penGoal, "Penalty"), (EventType.ownGoal, "Own goal")], id: \.0) { type, label in
                    MenuRow(label: label) {
                        if match.setup.goalScorers && type != EventType.ownGoal {
                            overlay = .number(team: team, type: type)
                        } else {
                            record(type, team, nil)
                            overlay = nil
                        }
                    }
                }
            }
        }
        .navigationTitle("Goal")
    }

    /// EVT-11: why, then Yes or No.
    private func abandonReasons(_ match: Match) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                ForEach(Array(abandonReasonNames.enumerated()), id: \.offset) { reason, label in
                    MenuRow(label: label) {
                        overlay = .confirm(question: "Abandon match?", detail: "\(label), \(match.score[0])-\(match.score[1]) stands", yes: "Abandon", danger: true) {
                            state.changeMatch { $0.abandon(nowMs(), reason: reason) }
                        }
                    }
                }
            }
        }
        .navigationTitle("Why?")
    }

    /// TMR-13: why, as an abandonment's reasons but for Not enough players; choosing one suspends at once, with
    /// no Yes or No, as Resume takes a mistake back. The clocks stop as it's chosen.
    private func suspendReasonMenu(_ match: Match) -> some View {
        ScrollView {
            VStack(spacing: 5) {
                ForEach(suspendReasons, id: \.0) { reason, label in
                    MenuRow(label: label) {
                        state.changeMatch { $0.suspend(reason, now: nowMs()) }
                        Haptics.tick()
                        overlay = nil
                    }
                }
            }
        }
        .navigationTitle("Suspend match")
    }

    private func eventsList(_ match: Match) -> some View {
        let shown = listedEvents(match.events)
        return ScrollView {
            VStack(spacing: 5) {
                if shown.isEmpty { Text("None recorded").font(.barlow(13)).foregroundStyle(C.dim) }
                ForEach(Array(shown.enumerated()), id: \.offset) { _, e in
                    RowLabel(label: describe(e, match), sub: eventTime(e, match))
                }
            }
        }
        .navigationTitle("Events")
    }
}

private func typeName(_ type: String) -> String {
    switch type {
    case EventType.goal: return "Goal"
    case EventType.ownGoal: return "Own goal"
    case EventType.penGoal: return "Penalty goal"
    case EventType.dfkGoal: return "DFK goal"
    case EventType.yellow: return "Yellow"
    case EventType.red: return "Red"
    case EventType.secondYellow: return "2nd yellow"
    case EventType.sinBin: return "Sin bin"
    case EventType.secondSinBin: return "2nd sin bin"
    case EventType.officialYellow: return "Yellow"
    case EventType.officialRed: return "Red"
    case EventType.injury: return "Injury"
    case EventType.penScored: return "Pen scored"
    case EventType.penMissed: return "Pen missed"
    case EventType.clockAdjusted: return "Clock"
    case EventType.addedAdjusted: return "Added time"
    default: return type
    }
}

/// EVT-11: the numbers are what the server reads.
private let abandonReasonNames = ["Weather", "Lightning", "Crowd trouble", "Not enough players", "Other"]

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

private func describe(_ e: MatchEvent, _ m: Match) -> String { describeEvent(e, home: m.setup.home, away: m.setup.away) }

private func eventTime(_ e: MatchEvent, _ m: Match) -> String { eventWhen(e, setup: m.setup, clockStyle: m.clockStyle) }

/// "Goal HOM #9", "Yellow HOM #4 UB" (EVT-14), "Yellow HOM head coach" (EVT-15), "Injury AWY #4" (EVT-16), "Clock +0:40" (TMR-14), "Suspended, lightning"
/// (TMR-13), "Sin bin AWY #7" and "2nd sin bin AWY #7" (EVT-12), for the event lists at full time and in History (UI-17).
func describeEvent(_ e: MatchEvent, home: String, away: String) -> String {
    if e.type == EventType.abandon { return "Abandoned: \(abandonReasonNames[safe: e.extra ?? -1] ?? "Other")" }
    // TMR-13: "Suspended, lightning", "Resumed after 30:00".
    if e.type == EventType.suspended { return "Suspended, \((abandonReasonNames[safe: e.extra ?? -1] ?? "Other").lowercased())" }
    if e.type == EventType.resumed { return "Resumed after \(formatClock(Int64(e.extra ?? 0) * 1000))" }
    if isAdjustment(e.type) { return "\(typeName(e.type)) \(formatChange(e.extra ?? 0))" }
    let official = e.type == EventType.officialYellow || e.type == EventType.officialRed ? " \(officialWords[safe: e.extra ?? 2] ?? officialWords[2])" : ""
    // EVT-14: a card's reason after its number, "Yellow HOM #4 UB".
    return "\(typeName(e.type)) \(e.team == 0 ? home : away)\(official)" + (e.player.map { " #\($0)" } ?? "") + (e.reason.map { " \($0)" } ?? "")
}

/// TMR-14: "Minutes into 1H"; "Minutes played" in a match of one period, which has no label (SET-16).
private func adjustUnit(_ what: String, _ m: Match) -> String {
    let label = periodLabel(m.period, m.setup.numPeriods)
    return label.isEmpty ? "\(what) played" : "\(what) into \(label)"
}

/// ET-1: "After 2H" over the choices; "Full time" after a match's one period (SET-16).
private func afterTitle(_ m: Match) -> String {
    let label = periodLabel(m.period, m.setup.numPeriods)
    return label.isEmpty ? "Full time" : "After \(label)"
}

/// EVT-15: a team official in an event's words, by role.
private let officialWords = ["head coach", "assistant coach", "team official"]

/// "1H 23:14" (match time with a clock counting up through the match, TMR-11), or when outside play.
func eventWhen(_ e: MatchEvent, setup: MatchSetup, clockStyle: Int) -> String {
    switch e.seconds {
    case EventTime.beforeKickoff: return "Before kickoff"
    case EventTime.atBreak: return "At the break"
    case EventTime.afterFullTime: return "After full time"
    case EventTime.penalties: return "Shoot-out"
    default:
        let base = clockStyle == clockUp ? setup.periodStartSec(e.period) : 0
        return withPeriod(e.period, setup.numPeriods, formatClock(Int64(base + e.seconds) * 1000))
    }
}

/// The events a list shows: goals, cards, kicks, clock corrections (TMR-14), suspensions (TMR-13) and an abandonment; not
/// stoppages or periods' ends.
func listedEvents(_ events: [MatchEvent]) -> [MatchEvent] {
    events.filter { $0.type != EventType.stoppage && $0.type != EventType.periodEnd }
}

/// Places things at fractions of the screen (UI-1).
extension View {
    func at(_ x: CGFloat = 0.5, _ y: CGFloat, _ size: CGSize) -> some View { position(x: size.width * x, y: size.height * y) }
}

/// "0 HOM/AWY 2": UI-10's two kits, the scores outside them.
private struct ScoreLine: View {
    let match: Match
    var scores: [Int]?
    let textSize: CGFloat

    var body: some View {
        let s = scores ?? match.score
        HStack(spacing: Kit.height(textSize) * 0.35) {
            Text("\(s[home])").font(.barlow(textSize, .semibold)).foregroundStyle(C.text)
            HStack(spacing: Kit.meet(textSize)) {
                ForEach([home, away], id: \.self) { team in
                    Kit(name: match.teamName(team), color: match.teamColor(team), size: textSize, home: team == home, widest: [match.teamName(home), match.teamName(away)])
                }
            }
            Text("\(s[away])").font(.barlow(textSize, .semibold)).foregroundStyle(C.text)
        }
        .fixedSize()
    }
}

/// UI-11: the kits to tap, the chosen team with a white dot above its kit and nothing else; before a choice, no dot.
private struct TeamChoice: View {
    let match: Match
    let selected: Int
    let textSize: CGFloat
    let pick: (Int) -> Void

    var body: some View {
        HStack(spacing: Kit.height(textSize) * 0.35) {
            Text("\(match.score[home])").font(.barlow(textSize, .semibold)).foregroundStyle(C.text)
            HStack(spacing: Kit.meet(textSize)) {
                ForEach([home, away], id: \.self) { team in
                    Button { pick(team) } label: {
                        Kit(name: match.teamName(team), color: match.teamColor(team), size: textSize, home: team == home,
                            widest: [match.teamName(home), match.teamName(away)], dot: selected == team)
                    }
                    .buttonStyle(TapOnly())
                }
            }
            Text("\(match.score[away])").font(.barlow(textSize, .semibold)).foregroundStyle(C.text)
        }
        .fixedSize()
    }
}

/// PRE-1, PRE-2, PRE-7, UI-13.
private struct KickoffScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let size: CGSize
    /// The match changes in place: a new value here draws it again.
    let revision: Int

    var body: some View {
        let next = match.phase == .nextKickoff
        let w = size.width
        ZStack {
            Text(next ? periodLabel(match.period + 1, match.setup.numPeriods) + " kickoff" : match.setup.summary).font(.barlow(w * 0.062)).foregroundStyle(C.dim).at(0.5, 0.14, size)
            TeamChoice(match: match, selected: match.kickoffTeamOnScreen, textSize: w * 0.085) { team in
                if match.phase == .ready && match.kickoff == team {
                    state.changeMatch { $0.clearKickoff() }
                } else {
                    state.changeMatch { $0.selectKickoff(team) }
                }
            }
            .at(0.5, 0.35, size)
            if match.phase == .pre {
                Text("Who kicks off?").font(.barlow(w * 0.08)).foregroundStyle(C.text).at(0.5, 0.62, size)
                // WCH-5: without the workout, nothing keeps the match running once the screen goes off.
                // TRK-7: an approximate location gives the track no positions.
                if state.healthRefused || state.locationApproximate {
                    Text(state.healthRefused ? "Alerts stop with the screen off: allow Health for LawFive in Settings" : "No track without Precise Location: turn it on for LawFive in Settings")
                        .font(.barlow(w * 0.055)).foregroundStyle(C.stoppage).multilineTextAlignment(.center)
                        .frame(width: w * 0.8).at(0.5, 0.8, size)
                }
            } else if match.kickoffTeamOnScreen < 0 {
                // ET-7: a new toss decides who kicks off extra time.
                Text("Who kicks off?").font(.barlow(w * 0.08)).foregroundStyle(C.text).at(0.5, 0.62, size)
            } else {
                // INP-8: only the button starts it.
                PillButton(label: "Start", width: w * 0.56) {
                    let at = nowMs()
                    let saved = state.saved
                    state.changeMatch { m in
                        if m.phase == .ready { m.start(at, screen: saved.chosenScreen) } else { m.startNextPeriod(at) }
                    }
                }
                .frame(width: w * 0.56)
                .at(0.5, next ? 0.64 : 0.68, size)
                // PRE-8; not on ET1's own kickoff screen, where it's recorded (ET-7).
                if next, match.period + 1 != match.setup.numPeriods, let target = match.attackHeading(match.period + 1) {
                    KickoffArrow(match: match, target: target, size: size)
                }
            }
        }
    }
}

/// UI-1, UI-21: fixed slots, built from the match screen's choices. Added time and the pills are in the same place in all of them,
/// and the ring at the edge moves nothing. UI-25: the time of day is the system's own here, always shown, so the edge is only ever the ring.
private struct RunningScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let now: Int64
    let size: CGSize

    var body: some View {
        let w = size.width
        let (clock, added) = match.clockDisplay(now)
        let screen = match.shown
        let label = periodLabel(match.period, match.setup.numPeriods)
        // TMR-15: a stopping clock standing still shows in orange, as the stoppage clock does.
        let stopped = match.clockStopped
        ZStack {
            if screen.edge == edgeRing { PeriodRing(progress: match.periodProgress(now), down: match.clockStyle == clockDown, lineWidth: w * 0.03) }
            if screen.names {
                Text(label).font(.barlow(w * 0.062)).foregroundStyle(C.dim).at(0.5, 0.12, size)
                ScoreLine(match: match, textSize: w * 0.085).at(0.5, 0.25, size)
            } else {
                Text(label).font(.barlow(w * 0.062)).foregroundStyle(C.dim).at(0.5, 0.10, size)
                // UI-21: scores only, the scores are the kits (UI-10).
                let scores = ["\(match.score[home])", "\(match.score[away])"]
                HStack(spacing: Kit.meet(w * 0.09)) {
                    Kit(name: scores[home], color: match.setup.homeColor, size: w * 0.09, home: true, widest: scores)
                    Kit(name: scores[away], color: match.setup.awayColor, size: w * 0.09, home: false, widest: scores)
                }
                .fixedSize()
                .at(0.5, 0.21, size)
            }
            if screen.clocks == clocksSideBySide {
                let figure = w * (clock.count > 5 ? 0.145 : 0.175)
                big(clock, figure).at(0.27, 0.50, size)
                Divider(height: size.height * 0.14).at(0.5, 0.50, size)
                big(match.secondClockText(now), figure).at(0.73, 0.50, size)
            } else if !screen.names {
                // Scores only: the largest clock that fits, leaving room for a stacked second clock.
                big(clock, w * (clock.count > 5 ? 0.30 : screen.clocks == clocksStacked ? 0.32 : 0.36)).at(0.5, 0.50, size)
            } else {
                big(clock, w * (clock.count > 5 ? 0.25 : 0.31)).at(0.5, 0.50, size)
            }
            if let added {
                Text(added).font(.barlow(w * 0.095, .semibold)).foregroundStyle(C.stoppage).at(0.5, 0.69, size)
            } else if screen.clocks == clocksStacked {
                Text(match.secondClockText(now)).font(.barlow(w * 0.105, .semibold)).foregroundStyle(stopped ? C.stoppage : C.dim).monospacedDigit().at(0.5, 0.69, size)
            }
            TimerPills(match: match, now: now, textSize: w * 0.078, width: w * 0.96).at(0.5, 0.84, size)
        }
    }

    private func big(_ text: String, _ size: CGFloat) -> some View {
        Text(text).font(.figure(size)).monospacedDigit().foregroundStyle(match.clockStopped ? C.stoppage : C.text).lineLimit(1).fixedSize()
    }
}

/// The thin line between the team names and between side-by-side clocks, drawn alike (UI-21).
private struct Divider: View {
    let height: CGFloat

    var body: some View { Rectangle().fill(C.rule).frame(width: 1.5, height: height) }
}

/// UI-23: following the edge of Apple Watch's rounded screen, from the top, clockwise: filling as the period runs, or emptying
/// when the match clock counts down.
private struct PeriodRing: View {
    let progress: Double
    let down: Bool
    let lineWidth: CGFloat

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 46, style: .continuous)
        ZStack {
            shape.stroke(progress < 1 ? C.ringTrack : C.stoppage, lineWidth: lineWidth).padding(lineWidth / 2)
            if progress < 1 && (down || progress > 0) {
                TopStartRoundedRect(cornerRadius: 46).trim(from: down ? progress : 0, to: down ? 1 : progress)
                    .stroke(C.start, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                    .padding(lineWidth / 2)
            }
        }
    }
}

/// A rounded rectangle whose path starts at the middle of the top edge, so a trim fills from 12 o'clock.
private struct TopStartRoundedRect: Shape {
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = min(cornerRadius, min(rect.width, rect.height) / 2)
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

/// UI-2, UI-4, TMR-7; EVT-12's sin bin pill last, outlined in the cards' yellow. With three, the row steps its font down
/// to fit the screen, and then the sin bin pill drops its team.
private struct TimerPills: View {
    @Environment(AppState.self) private var state
    let match: Match
    let now: Int64
    let textSize: CGFloat
    /// EVT-12: the room the row has across the screen, where it sits low on the rounded screen.
    let width: CGFloat

    var body: some View {
        // TMR-16: from the period's length, the added time left.
        let stoppage = match.stoppagePill(now)
        let remaining = match.breakRemainingMs(now)
        let dueIn = match.breakDueInMs(now)
        // SET-8, UI-5: the timers' names, as the match was created with them.
        let breakText = match.breakDue ? "\(match.setup.breakTimer.capitalized1) due" : match.breakClockText(now) ?? dueIn.map(formatCountdown)
        let sinBin = match.sinBinPill(now)
        if sinBin == nil {
            // With no sin bin, exactly as before (the match screen pictures on the website and phones are this).
            row(stoppage: stoppage, breakText: breakText, breakRunning: remaining != nil, sinBin: nil, size: textSize)
        } else {
            ViewThatFits(in: .horizontal) {
                row(stoppage: stoppage, breakText: breakText, breakRunning: remaining != nil, sinBin: sinBin, size: textSize)
                row(stoppage: stoppage, breakText: breakText, breakRunning: remaining != nil, sinBin: sinBin, size: textSize * 0.88)
                row(stoppage: stoppage, breakText: breakText, breakRunning: remaining != nil, sinBin: sinBin, size: textSize * 0.78)
                row(stoppage: stoppage, breakText: breakText, breakRunning: remaining != nil, sinBin: match.sinBinPill(now, withTeam: false), size: textSize * 0.78)
            }
            .frame(width: width)
        }
    }

    private func row(stoppage: (text: String, solid: Bool)?, breakText: String?, breakRunning: Bool, sinBin: String?, size: CGFloat) -> some View {
        HStack(spacing: sinBin == nil ? 5 : 4) {
            if let stoppage { pill(stoppage.text, C.stoppage, stoppage.solid, size) }
            if let breakText {
                if match.breakDue {
                    Button { state.changeMatch { $0.startBreak(nowMs()) } } label: { pill(breakText, C.breakBlue, true, size) }.buttonStyle(TapOnly())
                } else {
                    pill(breakText, C.breakBlue, breakRunning, size)
                }
            }
            if let sinBin { pill(sinBin, C.yellow, false, size) }
        }
        .fixedSize()
    }

    @ViewBuilder private func pill(_ text: String, _ color: Color, _ solid: Bool, _ textSize: CGFloat) -> some View {
        let label = Text(text).font(.barlow(textSize, .semibold)).monospacedDigit().foregroundStyle(solid ? .black : color).lineLimit(1)
            .padding(.horizontal, textSize < self.textSize ? 6 : 8).padding(.vertical, 2)
        if solid {
            label.background(color, in: Capsule())
        } else {
            label.overlay(Capsule().strokeBorder(color, lineWidth: 1.5))
        }
    }
}

private struct BreakScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let now: Int64
    let size: CGSize

    var body: some View {
        let w = size.width
        let remaining = match.breakRemainingMs(now) ?? 0
        // ET-7: before extra time it's down to the new toss.
        let team = match.kickoffFor(match.period + 1)
        ZStack {
            Text(match.isHalftime ? "HALF-TIME" : "BREAK").font(.barlow(w * 0.055)).foregroundStyle(C.dim).at(0.5, 0.11, size)
            ScoreLine(match: match, textSize: w * 0.085).at(0.5, 0.25, size)
            // TMR-4: time left or time taken, red once the break's length is up.
            Text(match.breakClockText(now) ?? "0:00").font(.figure(w * 0.22)).monospacedDigit().foregroundStyle(remaining > 0 ? C.breakBlue : C.red).at(0.5, 0.44, size)
            Text(team >= 0 ? "Kickoff: \(match.teamName(team))" : "New toss for kickoff").font(.barlow(w * 0.062)).foregroundStyle(C.dim).at(0.5, 0.60, size)
            PillButton(label: match.isHalftime ? "End half-time" : "End break", width: w * 0.66) { state.changeMatch { $0.endHalftime() } }.frame(width: w * 0.66).at(0.5, 0.78, size)
        }
    }
}

/// EVT-12: a sin bin over: black, the team as its own kit (UI-10) and the number large, "can return" in the Start green, and
/// "+1" when more are waiting. A tap lets it go (VIB-6).
private struct SinBinReturnScreen: View {
    let match: Match
    let event: MatchEvent
    let more: Int
    let size: CGSize

    var body: some View {
        let w = size.width
        ZStack {
            Color.black
            VStack(spacing: w * 0.02) {
                HStack(spacing: w * 0.04) {
                    Kit(name: match.teamName(event.team), color: match.teamColor(event.team), size: w * 0.13, home: event.team == home)
                    if let player = event.player { Text("#\(player)").font(.figure(w * 0.3)).foregroundStyle(C.text).monospacedDigit() }
                }
                Text("can return").font(.barlow(w * 0.1, .semibold)).foregroundStyle(C.start)
                if more > 0 { Text("+\(more)").font(.barlow(w * 0.07)).foregroundStyle(C.dim) }
            }
        }
        .contentShape(Rectangle())
    }
}

/// TMR-13: as the break screen: for lightning the 30:00 countdown in the break clock's blue, green at 0:00, with the
/// time suspended under it; otherwise the time suspended counting up, with the reason. Only the pill resumes (INP-8).
private struct SuspendedScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let now: Int64
    let size: CGSize

    var body: some View {
        let w = size.width
        let suspended = match.suspendedMs(now) ?? 0
        let left = match.lightningLeftMs(now)
        ZStack {
            Text(left != nil ? "LIGHTNING" : "SUSPENDED").font(.barlow(w * 0.055)).foregroundStyle(C.dim).at(0.5, 0.11, size)
            ScoreLine(match: match, textSize: w * 0.085).at(0.5, 0.25, size)
            Group {
                if let left {
                    Text(formatCountdown(left)).foregroundStyle(left > 0 ? C.breakBlue : C.start)
                } else {
                    Text(formatClock(suspended)).foregroundStyle(C.text)
                }
            }
            .font(.figure(w * 0.22)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7).at(0.5, 0.44, size)
            Text(left != nil ? "Suspended \(formatClock(suspended))" : suspendedWhy(match.suspendReason))
                .font(.barlow(w * 0.062)).monospacedDigit().foregroundStyle(C.dim).at(0.5, 0.60, size)
            PillButton(label: "Resume", width: w * 0.66) { state.changeMatch { $0.resume(nowMs()) } }.frame(width: w * 0.66).at(0.5, 0.78, size)
        }
    }

    private func suspendedWhy(_ reason: Int?) -> String {
        switch reason {
        case 0: return "Weather"
        case 2: return "Crowd trouble"
        default: return "Other reason"
        }
    }
}

/// ET-1: the recommended choice stands out.
private struct DecideScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let revision: Int
    let open: (Overlay) -> Void

    var body: some View {
        let recommended = match.recommendedDecision
        ScrollView {
            VStack(spacing: 5) {
                Text("\(afterTitle(match)): \(match.score[home])-\(match.score[away])").font(.barlow(14, .semibold)).foregroundStyle(C.text).padding(.top, 8)
                if match.canExtraTime { MenuRow(label: "Extra time", fill: recommended == .extraTime ? C.start : nil) { state.changeMatch { $0.chooseExtraTime(nowMs()) } } }
                if match.canPenalties { MenuRow(label: "Penalties", fill: recommended == .penalties ? C.start : nil) { state.changeMatch { $0.choosePenalties() } } }
                MenuRow(label: "End match", fill: recommended == .endMatch ? C.start : nil) {
                    open(.confirm(question: "End match?", detail: nil, yes: "End match", danger: false) { state.changeMatch { $0.finish(nowMs()) } })
                }
            }
            .padding(.horizontal, 6)
        }
    }
}

/// ET-3, ET-4.
/// ET-6: a golden goal: the winner, then End match or Undo. The clock runs on underneath.
private struct GoldenScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let size: CGSize
    let revision: Int

    var body: some View {
        let w = size.width
        ZStack {
            Text("GOLDEN GOAL").font(.barlow(w * 0.055)).foregroundStyle(C.dim).at(0.5, 0.11, size)
            ScoreLine(match: match, textSize: w * 0.085).at(0.5, 0.28, size)
            let winner = match.goldenWinner()
            if winner >= 0 {
                Text("\(match.teamName(winner)) win").font(.barlow(w * 0.1, .semibold)).foregroundStyle(C.text).at(0.5, 0.5, size)
            }
            HStack(spacing: 5) {
                PillButton(label: "End match") { state.changeMatch { $0.finish(nowMs()) } }
                PillButton(label: "Undo", color: C.rule) { state.changeMatch { $0.undoGoldenGoal() } }
            }
            .frame(width: w * 0.92)
            .at(0.5, 0.74, size)
        }
    }
}

private struct PenaltiesScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let size: CGSize
    let revision: Int

    var body: some View {
        let w = size.width
        ZStack {
            Text("PENALTIES").font(.barlow(w * 0.055)).foregroundStyle(C.dim).at(0.5, 0.11, size)
            if !match.penStarted {
                TeamChoice(match: match, selected: match.penFirst, textSize: w * 0.085) { team in state.changeMatch { $0.selectPenaltyFirst(team) } }.at(0.5, 0.35, size)
                if match.penFirst < 0 {
                    Text("Who kicks first?").font(.barlow(w * 0.08)).foregroundStyle(C.text).at(0.5, 0.62, size)
                } else {
                    PillButton(label: "Start", width: w * 0.56) { state.changeMatch { $0.startPenalties() } }.frame(width: w * 0.56).at(0.5, 0.68, size)
                }
            } else {
                ScoreLine(match: match, scores: [match.penaltyGoals(home), match.penaltyGoals(away)], textSize: w * 0.085).at(0.5, 0.24, size)
                HStack(spacing: 14) {
                    dots(match.kickResults(home))
                    dots(match.kickResults(away))
                }
                .at(0.5, 0.36, size)
                let winner = match.penaltyWinner()
                if winner >= 0 {
                    Text("\(match.teamName(winner)) win").font(.barlow(w * 0.1, .semibold)).foregroundStyle(C.text).at(0.5, 0.52, size)
                    PillButton(label: "End match", width: w * 0.6) { state.changeMatch { $0.finish(nowMs()) } }.frame(width: w * 0.6).at(0.5, 0.76, size)
                } else {
                    let kicker = match.nextKicker()
                    Text("Kick \(match.penaltyKicks(kicker) + 1): \(match.teamName(kicker))").font(.barlow(w * 0.08)).foregroundStyle(C.text).at(0.5, 0.50, size)
                    HStack(spacing: 5) {
                        PillButton(label: "Scored") { state.changeMatch { $0.recordKick(true) } }
                        PillButton(label: "Missed", color: C.red) { state.changeMatch { $0.recordKick(false) } }
                    }
                    .frame(width: w * 0.92)
                    .at(0.5, 0.74, size)
                }
            }
        }
    }

    private func dots(_ results: [Bool]) -> some View {
        HStack(spacing: 3) {
            ForEach(Array(results.suffix(6).enumerated()), id: \.offset) { _, scored in Circle().fill(scored ? C.start : C.red).frame(width: 7, height: 7) }
            if results.isEmpty { Circle().stroke(C.rule, lineWidth: 1).frame(width: 7, height: 7) }
        }
    }
}

private struct FullTimeScreen: View {
    @Environment(AppState.self) private var state
    let match: Match
    let size: CGSize
    let revision: Int
    let events: () -> Void

    var body: some View {
        let w = size.width
        let sent = state.saved.history.first { $0.created == match.created }?.sent == true
        ZStack {
            Text(match.isAbandoned ? "ABANDONED" : "FULL TIME").font(.barlow(w * 0.055)).foregroundStyle(C.dim).at(0.5, 0.11, size)
            ScoreLine(match: match, textSize: w * 0.085).at(0.5, 0.25, size)
            if let p = match.penaltyScore() {
                Text("\(p[0])-\(p[1]) on penalties").font(.barlow(w * 0.065)).foregroundStyle(C.dim).at(0.5, 0.35, size)
            } else if match.endedGolden == true {
                Text("On a golden goal").font(.barlow(w * 0.065)).foregroundStyle(C.dim).at(0.5, 0.35, size)
            }
            // SYNC-4: unlinked, it's kept and goes once linked, in the Garmin watch's History words, on two lines.
            let unlinked = !sent && !state.linked
            Text("Match saved").font(.barlow(w * 0.08, .semibold)).foregroundStyle(C.brand).at(0.5, unlinked ? 0.43 : 0.45, size)
            Text(sent ? "Sent to LawFive" : state.linked ? "Waiting to send" : "On this watch only\nLink to send it").font(.barlow(w * 0.058)).foregroundStyle(C.dim)
                .multilineTextAlignment(.center).at(0.5, unlinked ? 0.535 : 0.54, size)
            PillButton(label: "Done", width: w * 0.56) { state.clearMatch() }.frame(width: w * 0.56).at(0.5, 0.71, size)
            Button(action: events) { Text("Events").font(.barlow(w * 0.065, .semibold)).foregroundStyle(C.brand).padding(6) }.buttonStyle(TapOnly()).at(0.5, 0.88, size)
        }
    }
}

/// INP-3, UI-7.
private struct GameMenu: View {
    @Environment(AppState.self) private var state
    let match: Match
    let revision: Int
    let close: () -> Void
    let open: (Overlay) -> Void

    private func act(_ change: @escaping (Match) -> Void) {
        state.changeMatch(change)
        Haptics.tick()
        close()
    }

    var body: some View {
        let m = match
        let now = nowMs()
        // INP-3: spelled out, as the row has room ("End first half"; Garmin keeps "End 1st half" on its narrow rows).
        let endLabel = m.periodEndsMatch ? "End match" : "End \(periodName(m.period, m.setup.numPeriods, etPeriods: m.setup.etPeriods))"
        let endPeriod = { open(.confirm(question: "\(endLabel)?", detail: nil, yes: endLabel, danger: false) { state.changeMatch { $0.endPeriod(nowMs()) } }) }
        ScrollView {
            VStack(spacing: 5) {
                if m.phase == .running {
                    // INP-3: during play, the period's end first, as it's done every match; then stoppage and the halfway
                    // break; Undo (this period's events only, INP-6); the kickoff's corrections; Restart, Suspend (TMR-13)
                    // and Abandon last.
                    MenuRow(label: endLabel, sub: m.clockDisplay(now).clock, action: endPeriod)
                    // TMR-15: with a stopping clock, the stoppage is the clock standing still.
                    if m.setup.stops {
                        MenuRow(label: m.isStoppageActive ? "Start clock" : "Stop clock") { act { $0.toggleStoppage(nowMs()) } }
                    } else if m.setup.trackStoppage {
                        MenuRow(label: (m.isStoppageActive ? "End " : "Start ") + m.setup.stoppageTimer) { act { $0.toggleStoppage(nowMs()) } }
                    }
                    if m.breakDue {
                        MenuRow(label: "Start \(m.setup.breakTimer)", sub: formatClock(Int64(m.setup.breakLenSec) * 1000)) { act { $0.startBreak(nowMs()) } }
                        MenuRow(label: "Skip \(m.setup.breakTimer)") { act { $0.skipBreak() } }
                    }
                    if let left = m.breakRemainingMs(now) {
                        MenuRow(label: "End \(m.setup.breakTimer)", sub: "\(formatCountdown(left)) left") { act { $0.endBreakEarly(nowMs()) } }
                        // TMR-7: Reset is out of the menu for now (the user's choice); the rest of it stays, to bring back.
                        // MenuRow(label: "Reset break", sub: "Started by mistake") { act { $0.resetBreak() } }
                    }
                    undoRow(m)
                    // TMR-14: putting the clock right, from the period's time now counted from its kickoff, and with stoppage
                    // tracked the added time, from its total now.
                    MenuRow(label: "Adjust clock", sub: withPeriod(m.period, m.setup.numPeriods, formatClock(m.matchMs(now)))) {
                        let at = Int(m.matchMs(nowMs()) / 1000)
                        open(.adjustMinutes(added: false, captured: at, minutes: min(at / 60, 99)))
                    }
                    // TMR-15: a stopping clock has no added time.
                    if m.setup.trackStoppage && !m.setup.stops {
                        MenuRow(label: "Adjust added time", sub: formatClock(m.stoppageTotalMs(now))) {
                            let total = Int(m.stoppageTotalMs(nowMs()) / 1000)
                            open(.adjustMinutes(added: true, captured: total, minutes: min(total / 60, 99)))
                        }
                    }
                    // PRE-3: named as the first kickoff (or ET1's), not the current period's, which can be the other team.
                    let kickoffOf = m.isExtraTime ? "ET1 kickoff" : "First kickoff"
                    MenuRow(label: "Change kickoff", sub: "\(kickoffOf): \(m.teamName(m.firstKickoff))") {
                        open(.confirm(question: "Change kickoff?", detail: "\(kickoffOf) to \(m.teamName(1 - m.firstKickoff))", yes: "Change", danger: false) { state.changeMatch { $0.swapKickoff() } })
                    }
                    if m.canRecordDirection && Compass.available {
                        MenuRow(label: "Kickoff direction", sub: m.hasDirection ? "Saved" : "Face the goal") { open(.direction) }
                    }
                    if m.period == 0 {
                        MenuRow(label: "Restart match", sub: "Back to kickoff") {
                            open(.confirm(question: "Restart match?", detail: "Clock and events are cleared", yes: "Restart", danger: true) { state.changeMatch { $0.restart() } })
                        }
                    }
                    // TMR-13: for a lightning or weather delay, after which play carries on.
                    MenuRow(label: "Suspend match", sub: "Lightning, weather") { open(.suspend) }
                    // EVT-11: last, as it can't be taken back.
                    MenuRow(label: "Abandon match", sub: "Keeps the score") { open(.abandon) }
                } else if m.phase == .suspended {
                    // TMR-13: Resume first, as it's what the menu is opened for; the cards, as at a break (EVT-7); Undo
                    // (this period's, never the suspension, INP-6); Abandon last, as it can't be taken back (EVT-11).
                    MenuRow(label: "Resume match") { act { $0.resume(nowMs()) } }
                    if m.isLightning { MenuRow(label: "Lightning again", sub: "Back to 30:00") { act { $0.lightningAgain(nowMs()) } } }
                    MenuRow(label: "Card for \(m.setup.home)") { open(.team(home)) }
                    MenuRow(label: "Card for \(m.setup.away)") { open(.team(away)) }
                    undoRow(m)
                    MenuRow(label: "Abandon match", sub: "Keeps the score") { open(.abandon) }
                } else {
                    // PRE-8, only on a watch with a compass (WCH-10); ET-7: on ET1's kickoff screen too, once its team is chosen.
                    // On a kickoff screen it's what the menu is opened for, so it comes first (the owner's order).
                    if [.ready, .nextKickoff].contains(m.phase) && m.canRecordDirection && Compass.available {
                        MenuRow(label: "Kickoff direction", sub: m.hasDirection ? "Saved" : "Face the goal") { open(.direction) }
                    }
                    // PRE-9: wherever a real toss happens: before kickoff, before extra time and before a shoot-out.
                    // Next after Kickoff direction, or first where that isn't shown.
                    if [.pre, .ready].contains(m.phase) || (m.phase == .nextKickoff && m.period + 1 == m.setup.numPeriods) || (m.phase == .penalties && !m.penStarted) {
                        MenuRow(label: "Coin toss") { open(.coin) }
                    }
                    if m.phase == .breakTime {
                        MenuRow(label: m.isHalftime ? "End half-time" : "End break") { act { $0.endHalftime() } }
                    } else if m.phase == .nextKickoff && m.kickoffTeamOnScreen >= 0 {
                        MenuRow(label: "Start \(periodName(m.period + 1, m.setup.numPeriods, etPeriods: m.setup.etPeriods))") { act { $0.startNextPeriod(nowMs()) } }
                    }
                    // EVT-7: where people look for them, as swipes aren't obvious at a break.
                    if [.pre, .ready, .nextKickoff, .penalties, .breakTime, .decide].contains(m.phase) {
                        MenuRow(label: "Card for \(m.setup.home)") { open(.team(home)) }
                        MenuRow(label: "Card for \(m.setup.away)") { open(.team(away)) }
                    }
                    undoRow(m)
                    if [.breakTime, .nextKickoff, .decide, .penalties, .golden].contains(m.phase) {
                        MenuRow(label: "End match") { open(.confirm(question: "End match?", detail: nil, yes: "End match", danger: false) { state.changeMatch { $0.finish(nowMs()) } }) }
                    } else if m.phase != .done {
                        MenuRow(label: "Cancel match") { open(.confirm(question: "Cancel match?", detail: "Nothing is saved", yes: "Cancel match", danger: true) { state.clearMatch() }) }
                    }
                    // EVT-11: once it's under way, and last, as it can't be taken back.
                    if [.breakTime, .nextKickoff, .decide, .penalties].contains(m.phase) {
                        MenuRow(label: "Abandon match", sub: "Keeps the score") { open(.abandon) }
                    }
                }
            }
        }
        .navigationTitle("Game")
    }

    /// INP-6: only for an event in the current period; with none, no row.
    @ViewBuilder private func undoRow(_ m: Match) -> some View {
        if let last = m.lastUndoableEvent {
            MenuRow(label: "Undo last event", sub: describe(last, m)) {
                open(.confirm(question: "Undo?", detail: describe(last, m), yes: "Undo", danger: true) { state.changeMatch { $0.undoLastEvent(nowMs()) } })
            }
        }
    }
}

/// UI-8: two digits; the one being set has a white outline. Turning the Digital Crown changes it, as do the arrows above
/// and below either digit; tapping a digit (or its arrows) makes it the one being set.
struct NumberEntry: View {
    let title: String
    let type: String
    let unit: String
    /// OK is dimmed above it (TMR-14's seconds: 59), and below minValue (EVT-12's sin bin length: 1 to 20 minutes).
    let maxValue: Int
    let minValue: Int
    /// The gray pill for no number; nil where 00 is a value (TMR-14), so OK stands alone.
    let none: String?
    let done: (Int?) -> Void
    @State private var tens: Int
    @State private var ones: Int
    /// 0 for the tens, 1 for the ones.
    @State private var active = 0
    @State private var crown: Double
    @FocusState private var focused: Bool

    init(title: String, type: String = "", unit: String = "Player number", start: Int = 0, minValue: Int = 0, maxValue: Int = 99, none: String? = "None", done: @escaping (Int?) -> Void) {
        (self.title, self.type, self.unit, self.minValue, self.maxValue, self.none, self.done) = (title, type, unit, minValue, maxValue, none, done)
        _tens = State(initialValue: start / 10 % 10)
        _ones = State(initialValue: start % 10)
        _crown = State(initialValue: Double(start / 10 % 10))
    }

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 4) {
                if type == EventType.yellow || type == EventType.red || type == EventType.sinBin {
                    RoundedRectangle(cornerRadius: 1.5).fill(type == EventType.red ? C.red : C.yellow).frame(width: 8, height: 12)
                }
                Text(title).font(.barlow(13, .semibold)).foregroundStyle(C.text).lineLimit(1)
            }
            Text(unit).font(.barlow(11)).foregroundStyle(C.dim).lineLimit(1)
            HStack(spacing: 8) {
                digit($tens, 0)
                digit($ones, 1)
            }
            HStack(spacing: 5) {
                if let none { PillButton(label: none, color: C.row) { done(nil) } }
                let value = tens * 10 + ones
                // EVT-3: for a player, 00 is no number, as None is.
                let outside = value > maxValue || value < minValue
                PillButton(label: "OK") { done(none != nil && value == 0 ? nil : value) }
                    .disabled(outside)
                    .opacity(outside ? 0.4 : 1)
            }
            .padding(.top, 2)
        }
        // The crown turns the digit being set, round from 9 to 0, a click a step.
        .focusable()
        .focused($focused)
        .digitalCrownRotation($crown, from: 0, through: 9, by: 1, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { _, value in
            let digit = ((Int(value.rounded()) % 10) + 10) % 10
            if active == 0 { tens = digit } else { ones = digit }
        }
        .onAppear { focused = true }
    }

    /// Makes `which` the digit being set, with the crown starting from its value.
    private func choose(_ which: Int) {
        active = which
        crown = Double(which == 0 ? tens : ones)
    }

    private func digit(_ value: Binding<Int>, _ which: Int) -> some View {
        VStack(spacing: 0) {
            Button {
                value.wrappedValue = (value.wrappedValue + 1) % 10
                choose(which)
            } label: {
                Triangle().fill(active == which ? C.text : C.dim).frame(width: 12, height: 7).frame(width: 44, height: 18).contentShape(Rectangle())
            }
            .buttonStyle(TapOnly())
            .accessibilityLabel(which == 0 ? "Tens up" : "Ones up")
            Text("\(value.wrappedValue)").font(.figure(28)).foregroundStyle(C.text).frame(width: 44, height: 38)
                .background(C.row, in: RoundedRectangle(cornerRadius: 8))
                .overlay { if active == which { RoundedRectangle(cornerRadius: 8).stroke(.white, lineWidth: 2) } }
                .contentShape(Rectangle())
                .onTapGesture { choose(which) }
                .accessibilityLabel(which == 0 ? "Tens" : "Ones")
                .accessibilityValue("\(value.wrappedValue)")
            Button {
                value.wrappedValue = (value.wrappedValue + 9) % 10
                choose(which)
            } label: {
                Triangle().fill(active == which ? C.text : C.dim).rotationEffect(.degrees(180)).frame(width: 12, height: 7).frame(width: 44, height: 18).contentShape(Rectangle())
            }
            .buttonStyle(TapOnly())
            .accessibilityLabel(which == 0 ? "Tens down" : "Ones down")
        }
    }
}

private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.midX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.closeSubpath()
        return p
    }
}

/// PRE-9: tap to flip. It turns over a few times, then lands, with a tap on the wrist.
private struct CoinToss: View {
    @State private var turns = 0.0
    @State private var heads = true
    @State private var result: String?
    @State private var flipping = false

    var body: some View {
        VStack(spacing: 8) {
            Button(action: flip) {
                ZStack {
                    Circle().fill(C.coin)
                    Circle().strokeBorder(C.coinEdge, lineWidth: 3)
                    Text(heads ? "H" : "T").font(.figure(40)).foregroundStyle(C.coinInk)
                }
                .frame(width: 90, height: 90)
                .rotation3DEffect(.degrees(turns), axis: (x: 1, y: 0, z: 0))
            }
            .buttonStyle(TapOnly())
            .accessibilityLabel("Flip the coin")
            Text(result ?? "Tap to flip").font(.barlow(result == nil ? 14 : 20, .semibold)).foregroundStyle(result == nil ? C.dim : C.text)
        }
        .navigationTitle("Coin toss")
    }

    private func flip() {
        guard !flipping else { return }
        flipping = true
        result = nil
        let landsHeads = Bool.random()
        withAnimation(.easeOut(duration: 1.2)) { turns += 360 * 3 }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            heads = landsHeads
            result = landsHeads ? "Heads" : "Tails"
            flipping = false
            Haptics.tick()
        }
    }
}
