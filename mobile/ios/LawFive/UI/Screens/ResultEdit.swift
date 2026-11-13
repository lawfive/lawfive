import SwiftUI

// Correcting a played match's result (RES-1, RES-5), or entering one for a match refereed without
// the watch (RES-2), as on the website and Android: goals, cards with misconduct codes, the shoot-out
// and the outcome, and sin bins with their length (EVT-12). The score comes from the goals, and second
// cautions and second sin bins are settled by the shared rules (Data/Result.swift). Stoppages and the
// watch's other records are kept as they are; the server keeps the watch's own recording (RES-3).

private let kinds: [(String, String)] = [("goal", "Goal"), ("caution", "Caution"), ("sendOff", "Send-off"), ("sinBin", "Sin bin")]
private let whoNames: [(String, String)] = [("player", "Player"), ("headCoach", "Head coach"), ("assistantCoach", "Assistant coach"), ("other", "Team official")]
private let goalTypes: [(String, String)] = [("goal", "Goal"), ("directFreeKick", "Direct free kick"), ("penalty", "Penalty"), ("ownGoal", "Own goal")]
private let reasons: [(String, String)] = [("weather", "Weather"), ("lightning", "Lightning"), ("crowdTrouble", "Crowd trouble"), ("notEnoughPlayers", "Not enough players"), ("other", "Other")]

/// One goal or card as the form edits it; `from` keeps what the form doesn't show (a time of day, an official's name).
private struct ResultRow: Identifiable, Hashable {
    let id = UUID()
    var kind: String
    var when: String
    var minute = ""
    var team = "home"
    var who = "player"
    var number = ""
    var goalType = "goal"
    var code = ""
    /// EVT-12: a sin bin's length.
    var lengthSec = 10 * 60
    var from: Event?
    /// Where and at what minute it started, so a minute left alone keeps the watch's exact second.
    var fromWhen: String?
    var fromMinute: String?
}

private struct KickRow: Identifiable, Hashable {
    let id = UUID()
    var team: String
    var scored = true
    var number = ""
}

private struct RowProblem: Error { let text: String }

private func rowOf(_ m: Match, _ e: Event) -> ResultRow? {
    func whenKey(_ w: String, _ p: Int?) -> String {
        switch w { case "play": return "play:\(p ?? 1)"; case "break": return "break:\(p ?? 1)"; case "beforeKickoff": return "before"; default: return "after" }
    }
    func minute(_ w: String, _ p: Int?, _ s: Int?) -> String {
        guard w == "play", let p, let s else { return "" }
        return String(minuteText(m.format, period: p, periodSec: s).dropLast())
    }
    func card(_ kind: String, _ w: String, _ p: Int?, _ s: Int?, _ team: String, _ offender: Offender, _ code: MisconductCode?) -> ResultRow {
        var row = ResultRow(kind: kind, when: whenKey(w, p), minute: minute(w, p, s), team: team, code: code?.code ?? "", from: e, fromWhen: whenKey(w, p), fromMinute: minute(w, p, s))
        switch offender {
        case .player(let p): row.number = p.number.map(String.init) ?? ""
        case .teamOfficial(let o): row.who = o.role
        case .unknown: break
        }
        return row
    }
    switch e {
    case .goal(let g):
        return ResultRow(kind: "goal", when: whenKey(g.when, g.period), minute: minute(g.when, g.period, g.periodSec), team: g.team, number: g.player.map(String.init) ?? "", goalType: g.goalType ?? "goal", from: e,
                         fromWhen: whenKey(g.when, g.period), fromMinute: minute(g.when, g.period, g.periodSec))
    case .caution(let c): return card("caution", c.when, c.period, c.periodSec, c.team, c.offender, c.misconduct)
    case .secondCaution(let c): return card("caution", c.when, c.period, c.periodSec, c.team, c.offender, c.misconduct)
    case .sendOff(let c): return card("sendOff", c.when, c.period, c.periodSec, c.team, c.offender, c.misconduct)
    case .sinBin(let c):
        var row = card("sinBin", c.when, c.period, c.periodSec, c.team, c.offender, c.misconduct)
        row.lengthSec = c.lengthSec
        return row
    case .secondSinBin(let c):
        var row = card("sinBin", c.when, c.period, c.periodSec, c.team, c.offender, c.misconduct)
        row.lengthSec = c.lengthSec
        return row
    default: return nil
    }
}

/// The event a row stands for, or what's wrong with it.
private func eventOf(_ m: Match, _ row: ResultRow, scheme: String) -> Result<Event, RowProblem> {
    let typed = row.number.trimmingCharacters(in: .whitespaces)
    let number = Int(typed)
    if !typed.isEmpty, !(1...99).contains(number ?? 0) { return .failure(RowProblem(text: "A player's number is 1 to 99.")) }
    let parts = row.when.split(separator: ":")
    let place = String(parts[0])
    let period = parts.count > 1 ? Int(parts[1]) : nil
    let w = ["play": "play", "break": "break", "before": "beforeKickoff"][place] ?? "afterFullTime"
    var periodSec: Int?
    let minute = row.minute.trimmingCharacters(in: .whitespaces)
    if place == "play", !minute.isEmpty, let from = row.from, row.when == row.fromWhen, minute == row.fromMinute {
        // A minute left as it was keeps the watch's exact second (22:41, not 22:00).
        periodSec = from.secondsIntoPeriod
    } else if place == "play", !minute.isEmpty {
        guard let s = periodSecOf(m.format, period: period ?? 1, text: minute) else {
            return .failure(RowProblem(text: "\(minute)' isn't in the \(periodName(m.format, period: period ?? 1).lowercased())."))
        }
        periodSec = s
    }
    let p = place == "play" || place == "break" ? period : nil
    var at: Timestamp?
    var officialName: String?
    switch row.from {
    case .goal(let g): at = g.at
    case .caution(let c): at = c.at; if case .teamOfficial(let o) = c.offender { officialName = o.name }
    case .secondCaution(let c): at = c.at; if case .teamOfficial(let o) = c.offender { officialName = o.name }
    case .sendOff(let c): at = c.at; if case .teamOfficial(let o) = c.offender { officialName = o.name }
    case .sinBin(let c): at = c.at
    case .secondSinBin(let c): at = c.at
    default: break
    }
    if row.kind == "goal" {
        guard w == "play" else { return .failure(RowProblem(text: "A goal is scored during play.")) }
        return .success(.goal(EventGoal(when: w, period: p, periodSec: periodSec, at: at, team: row.team, player: number, goalType: row.goalType == "goal" ? nil : row.goalType)))
    }
    let code = row.code.isEmpty ? nil : MisconductCode(scheme: scheme, code: row.code)
    if row.kind == "sinBin" {
        // EVT-12: a player's; settled as a second sin bin when it is one.
        return .success(.sinBin(EventSinBin(when: w, period: p, periodSec: periodSec, at: at, team: row.team, offender: .player(OffenderPlayer(number: number)), misconduct: code, lengthSec: row.lengthSec)))
    }
    let offender: Offender = row.who == "player" ? .player(OffenderPlayer(number: number)) : .teamOfficial(OffenderTeamOfficial(role: row.who, name: officialName))
    if row.kind == "sendOff" {
        return .success(.sendOff(EventSendOff(when: w, period: p, periodSec: periodSec, at: at, team: row.team, offender: offender, misconduct: code)))
    }
    return .success(.caution(EventCaution(when: w, period: p, periodSec: periodSec, at: at, team: row.team, offender: offender, misconduct: code)))
}

struct ResultEditScreen: View {
    let matchId: String
    @Environment(AppGraph.self) private var graph
    @Environment(\.dismiss) private var dismiss
    @State private var loaded = false
    @State private var record: MatchRecord?
    @State private var isNew = false
    @State private var rows: [ResultRow] = []
    @State private var kicks: [KickRow] = []
    @State private var outcome = "completed"
    @State private var reason = "weather"
    @State private var problem: String?

    var body: some View {
        if let stored = graph.records.match(matchId) {
            // Q-20: its periods named as they were played (a new result has none, so it's the plan's).
            let m = asPlayed(match: stored, graph.records.matchRecords.first { $0.matchId == matchId })
            form(m).onAppear { load(m) }
        } else {
            Page("Result", large: false) { LoadingPitch() }
        }
    }

    private func load(_ m: Match) {
        guard !loaded else { return }
        let saved = graph.records.matchRecords.first { $0.matchId == matchId }
        isNew = saved == nil
        let r = saved ?? MatchRecord(id: newId(), version: 0, updatedAt: nowString(), matchId: matchId, outcome: "completed", periods: periodsFromFormat(m.format), score: MatchRecordScore(home: 0, away: 0), events: [])
        record = r
        rows = r.events.compactMap { rowOf(m, $0) }
        kicks = r.events.compactMap { if case .penaltyKick(let k) = $0 { return KickRow(team: k.team, scored: k.scored, number: k.player.map(String.init) ?? "") } else { return nil } }
        outcome = r.outcome
        reason = r.events.compactMap { if case .abandonment(let a) = $0 { return a.reason } else { return nil } }.first ?? "weather"
        loaded = true
    }

    private func schemeId(_ m: Match) -> String {
        graph.records.competition(m.competitionId)?.misconductScheme ?? graph.records.effectiveSettings.misconductScheme
    }

    @ViewBuilder
    private func form(_ m: Match) -> some View {
        let scheme = schemeId(m)
        let codes = misconductScheme(scheme)
        let built = rows.map { eventOf(m, $0, scheme: scheme) }
        // EVT-12: Sin bin is offered when the format has sin bins, or the result already has one.
        let offered = m.format.sinBins == true || rows.contains { $0.kind == "sinBin" } ? kinds : kinds.filter { $0.0 != "sinBin" }
        let sinBinSec = m.format.sinBinSec ?? 10 * 60
        let valid = built.compactMap { try? $0.get() }
        let score = scoreOf(valid)
        let settled = settleCautions(valid).map(\.type)
        let kickEvents: [Event] = kicks.map { .penaltyKick(EventPenaltyKick(when: "penalties", team: $0.team, scored: $0.scored, player: Int($0.number).flatMap { (1...99).contains($0) ? $0 : nil })) }
        let penalties = penaltiesOf(kickEvents)
        let periods = Array(Set((record?.periods.map(\.period) ?? []) + Array(1...max(1, m.format.periods)))).sorted()
        let last = periods.last ?? m.format.periods
        let whenOptions: [(String, String)] = [("before", "Before kickoff")] + periods.flatMap { p in
            [("play:\(p)", periodName(m.format, period: p))] + (p < last ? [("break:\(p)", p == m.format.periods / 2 ? "Half-time" : "Break")] : [])
        } + [("after", "After full time")]
        FormPage(title: isNew ? "Add result" : "Edit result", loaded: loaded, snapshot: "\(rows)|\(kicks)|\(outcome)|\(reason)", save: { save(m, built: built, valid: valid, kicks: kickEvents, last: last) }) {
            Text(isNew ? "For a match refereed without the watch." : "Corrections to what the watch recorded. The watch's own recording is kept, and can be put back.")
                .font(.lfBodyMedium).foregroundStyle(LF.muted).padding(.top, 8)
            // RES-1, WEB-24: the board's scoreboard: Result and "From the goals below", the kits with the score between them.
            Board {
                BoardHead("Result", about: "From the goals below").padding(.bottom, 10)
                KitPanels(home: m.home, away: m.away, middleWidth: 110, hasMiddle: true) {
                    VStack(spacing: 0) {
                        Text("\(score.home)–\(score.away)").font(.display(46)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize()
                        if let penalties { Text("\(penalties.home)–\(penalties.away) pens").font(.barlow(11, .medium)).foregroundStyle(LF.onBoardMuted) }
                    }
                    .padding(.horizontal, 8)
                }
                Color.clear.frame(height: 10)
            }
            .accessibilityElement(children: .combine)
            .padding(.top, 14)
            SectionTitle("Goals and cards")
            if rows.isEmpty {
                Text("None yet. Add each goal and card; a goal with no minute or number still counts.").font(.lfBodyMedium).foregroundStyle(LF.muted)
            }
            ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                let wrong: String? = { if case .failure(let p) = built[i] { return p.text } else { return nil } }()
                let settledType: String? = (try? built[i].get()).flatMap { e in valid.firstIndex(of: e).map { settled[$0] } }
                rowCard(m, i: i, row: row, kinds: offered, whenOptions: whenOptions, codes: codes, settledType: settledType, wrong: wrong)
            }
            Flow(spacing: 8) {
                ForEach(offered, id: \.0) { kind, label in
                    SecondaryButton(label, icon: .plus) { rows.append(ResultRow(kind: kind, when: "play:\(periods.first ?? 1)", lengthSec: sinBinSec)) }
                        .accessibilityLabel("Add a \(label.lowercased())")
                }
            }
            SectionTitle("Penalties")
            LfCard(padding: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    if kicks.isEmpty { Text("Only for a match decided by a shoot-out.").font(.lfBodyMedium).foregroundStyle(LF.muted) }
                    ForEach(Array(kicks.enumerated()), id: \.element.id) { i, k in
                        HStack(spacing: 8) {
                            Text("\(i + 1)").font(.lfBodySmall).foregroundStyle(LF.muted).frame(width: 16)
                            TeamToggle(m: m, team: k.team) { kicks[i].team = $0 }
                            Choice("", value: k.scored, options: [true, false], text: { $0 == true ? "Scored" : "Missed" }) { kicks[i].scored = $0 ?? true }
                            Field("No.", text: Binding(get: { kicks[i].number }, set: { kicks[i].number = String($0.filter(\.isNumber).prefix(2)) }), keyboard: .numberPad).frame(width: 64)
                            Button { kicks.remove(at: i) } label: { PhIcon(.trash, size: 18, tint: LF.muted) }.accessibilityLabel("Remove")
                        }
                    }
                    SecondaryButton("Kick", icon: .plus) { kicks.append(KickRow(team: kicks.count % 2 == 0 ? "home" : "away")) }
                }
            }
            SectionTitle("Outcome")
            LfCard(padding: 12) {
                VStack(spacing: 8) {
                    Choice("The match", value: outcome, options: ["completed", "abandoned"], text: { $0 == "abandoned" ? "Abandoned" : "Played to full time" }) { outcome = $0 ?? "completed" }
                    if outcome == "abandoned" {
                        Choice("Why", value: reason, options: reasons.map(\.0), text: { r in reasons.first { $0.0 == r }?.1 ?? "" }) { reason = $0 ?? "weather" }
                    }
                }
            }
            if let problem { Text(problem).font(.lfBodyMedium).foregroundStyle(LF.redText).padding(.top, 10) }
        }
    }

    private func rowCard(_ m: Match, i: Int, row: ResultRow, kinds: [(String, String)], whenOptions: [(String, String)], codes: MisconductScheme?, settledType: String?, wrong: String?) -> some View {
        let options = row.kind == "goal" ? whenOptions.filter { $0.0.hasPrefix("play:") } : whenOptions
        return LfCard(padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    if row.kind != "goal" { CardMark(kind: settledType == "secondCaution" || settledType == "secondSinBin" ? "second" : row.kind) }
                    Choice("", value: row.kind, options: kinds.map(\.0), text: { k in kinds.first { $0.0 == k }?.1 ?? "" }) { k in
                        rows[i].kind = k ?? row.kind
                        rows[i].code = ""
                        // EVT-12: a sin bin is a player's, for the format's length unless changed.
                        if rows[i].kind == "sinBin", row.kind != "sinBin" {
                            rows[i].who = "player"
                            rows[i].lengthSec = m.format.sinBinSec ?? 10 * 60
                        }
                    }
                    TeamToggle(m: m, team: row.team) { rows[i].team = $0 }
                    Button { rows.remove(at: i) } label: { PhIcon(.trash, size: 18, tint: LF.muted) }.accessibilityLabel("Remove")
                }
                HStack(alignment: .top, spacing: 8) {
                    Choice("When", value: row.when, options: options.map(\.0), text: { w in options.first { $0.0 == w }?.1 ?? "" }) { rows[i].when = $0 ?? row.when }
                    if row.when.hasPrefix("play:") {
                        Field("Minute", text: Binding(get: { rows[i].minute }, set: { rows[i].minute = $0 }), placeholder: "23 or 45+2", keyboard: .numbersAndPunctuation)
                    }
                }
                HStack(alignment: .top, spacing: 8) {
                    if row.kind != "goal" && row.kind != "sinBin" {
                        Choice("Who", value: row.who, options: whoNames.map(\.0), text: { w in whoNames.first { $0.0 == w }?.1 ?? "" }) { rows[i].who = $0 ?? "player" }
                    }
                    if row.kind == "goal" || row.kind == "sinBin" || row.who == "player" {
                        Field("Number", text: Binding(get: { rows[i].number }, set: { rows[i].number = String($0.filter(\.isNumber).prefix(2)) }), placeholder: "None", keyboard: .numberPad)
                    }
                    if row.kind == "sinBin" {
                        NumberField("Length (min)", value: row.lengthSec / 60) { if let v = $0 { rows[i].lengthSec = min(max(v, 1), 20) * 60 } }
                    }
                    if row.kind == "goal" {
                        Choice("Type", value: row.goalType, options: goalTypes.map(\.0), text: { g in goalTypes.first { $0.0 == g }?.1 ?? "" }) { rows[i].goalType = $0 ?? "goal" }
                    }
                }
                if row.kind != "goal", let codes {
                    let list: [(String, String)] = settledType == "secondCaution"
                        ? [(codes.secondCaution, "Second caution")] + codes.cautions.map { ($0.code, $0.description) }
                        : row.kind == "caution" || row.kind == "sinBin" ? codes.cautions.map { ($0.code, $0.description) } : codes.sendOffs.map { ($0.code, $0.description) }
                    Choice("Code (\(codes.name))", value: row.code.isEmpty ? nil : row.code, options: list.map(\.0), allowNone: "None",
                           text: { c in c.map { code in "\(code) · \(list.first { $0.0 == code }?.1 ?? "")" } ?? "None" }) { rows[i].code = $0 ?? "" }
                }
                if settledType == "secondCaution" {
                    Text("Second caution to this player: it counts as a send-off.").font(.lfBodySmall).foregroundStyle(LF.muted)
                }
                if settledType == "secondSinBin" {
                    Text("Second sin bin to this player: it counts as a send-off.").font(.lfBodySmall).foregroundStyle(LF.muted)
                }
                if let wrong { Text(wrong).font(.lfBodySmall).foregroundStyle(LF.redText) }
            }
        }
        .overlay { if wrong != nil { RoundedRectangle(cornerRadius: 6).stroke(LF.redText, lineWidth: 1) } }
        .padding(.bottom, 10)
    }

    private func save(_ m: Match, built: [Result<Event, RowProblem>], valid: [Event], kicks: [Event], last: Int) {
        guard var r = record else { return }
        if built.contains(where: { if case .failure = $0 { return true } else { return false } }) {
            problem = "Fix the goal or card marked in red first."
            return
        }
        problem = nil
        let kept = r.events.filter { !["goal", "caution", "secondCaution", "sendOff", "sinBin", "secondSinBin", "penaltyKick", "abandonment"].contains($0.type) }
        var abandonment: [Event] = []
        if outcome == "abandoned" {
            let earlier = r.events.compactMap { if case .abandonment(let a) = $0 { return a } else { return nil } }.first
            var a = earlier ?? EventAbandonment(when: "play", period: last, reason: reason)
            a.reason = reason
            abandonment = [.abandonment(a)]
        }
        r.outcome = outcome
        let result = withEvents(r, kept + valid + kicks + abandonment)
        Task {
            await graph.records.save(Collections.matchRecords, id: result.id, result)
            // RES-2: a match given a result without the watch has been played.
            if isNew, m.status == "scheduled" {
                var played = m
                played.status = outcome == "abandoned" ? "abandoned" : "played"
                await graph.records.save(Collections.matches, id: played.id, played)
            }
            graph.requestSync(delay: 0)
            dismiss()
        }
    }
}

/// A card's color, as on the timeline: yellow (a sin bin's too), red, or both for a second caution or second sin bin.
private struct CardMark: View {
    let kind: String
    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(kind == "second" ? AnyShapeStyle(LinearGradient(stops: [.init(color: LF.yellow, location: 0.5), .init(color: LF.red, location: 0.5)], startPoint: .topLeading, endPoint: .bottomTrailing))
                  : AnyShapeStyle(kind == "sendOff" ? LF.red : LF.yellow))
            .frame(width: 11, height: 15)
    }
}

/// Home or away, the other team faded so which it is reads at a glance.
private struct TeamToggle: View {
    let m: Match
    let team: String
    let onChange: (String) -> Void
    var body: some View {
        HStack(spacing: 2) {
            ForEach(["home", "away"], id: \.self) { side in
                let on = team == side
                Button { onChange(side) } label: {
                    TeamBadge(team: side == "home" ? m.home : m.away, other: side == "home" ? m.away : m.home, home: side == "home")
                        .opacity(on ? 1 : 0.35)
                        .padding(.horizontal, 6).padding(.vertical, 4)
                        .background(on ? LF.surface : LF.surface2, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(teamName(side == "home" ? m.home : m.away, home: side == "home"))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(LF.surface2, in: RoundedRectangle(cornerRadius: 6))
    }
}
