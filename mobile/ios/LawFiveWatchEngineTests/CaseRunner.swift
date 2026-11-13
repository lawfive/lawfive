import Foundation

// WCH-2: the shared match cases (schema/match-cases/*.json, as schema/generated/swift-tests/MatchCases.swift)
// run on this engine: each case's format and screen, then its steps' actions at their times, checking
// what's expected after each. A mismatch names the case, the step and the field.

private func team(_ name: Any?) -> Int { (name as? String) == "away" ? away : home }
private func teamName(_ team: Int) -> Any { team == home ? "home" as Any : team == away ? "away" as Any : NSNull() }
private let phaseNames: [Phase: String] = [.pre: "pre", .ready: "ready", .running: "running", .breakTime: "break", .done: "done",
                                           .nextKickoff: "nextKickoff", .decide: "decide", .penalties: "penalties", .golden: "golden",
                                           .suspended: "suspended"]
private let alertNames: [Alert: String] = [.fullTime: "fullTime", .addedTime: "addedTime", .breakStart: "breakStart", .breakEnd: "breakEnd", .reminder: "reminder",
                                           .lightning: "lightning", .sinBinEnd: "sinBinEnd"]
private let clockStyles = ["up": clockUp, "upEach": clockUpEach, "down": clockDown]

private func setupOf(_ format: [String: Any]) -> MatchSetup {
    var s = MatchSetup()
    if let v = format["numPeriods"] as? Int { s.numPeriods = v }
    if let v = format["periodSec"] as? Int { s.periodSec = v }
    if let v = format["halftimeSec"] as? Int { s.halftimeSec = v }
    if let v = format["midBreak"] as? Bool { s.midBreak = v }
    if let v = format["breakLenSec"] as? Int { s.breakLenSec = v }
    if let v = format["breakStoppage"] as? Bool { s.breakStoppage = v }
    if let v = format["trackStoppage"] as? Bool { s.trackStoppage = v }
    if let v = format["goalScorers"] as? Bool { s.goalScorers = v }
    if let v = format["goalTypes"] as? Bool { s.goalTypes = v }
    if let v = format["extraTime"] as? Bool { s.extraTime = v }
    if let v = format["etPeriods"] as? Int { s.etPeriods = v }
    if let v = format["etPeriodSec"] as? Int { s.etPeriodSec = v }
    if let v = format["goldenGoal"] as? Bool { s.goldenGoal = v }
    if let v = format["penalties"] as? Bool { s.penalties = v }
    if let v = format["sinBins"] as? Bool { s.sinBins = v }
    if let v = format["sinBinSec"] as? Int { s.sinBinSec = v }
    if let v = format["stoppingClock"] as? Bool { s.stoppingClock = v }
    if let v = format["stopForGoalsCards"] as? Bool { s.stopForGoalsCards = v }
    return s
}

private func screenOf(_ screen: [String: Any]) -> WatchScreen {
    var w = WatchScreen()
    if let v = screen["clocks"] as? String { w.clocks = ["one": clocksOne, "stacked": clocksStacked, "sideBySide": clocksSideBySide][v] ?? clocksOne }
    if let v = screen["mainClock"] as? String { w.mainClock = clockStyles[v] ?? clockUp }
    if let v = screen["secondClock"] as? String { w.secondClock = clockStyles[v] ?? clockDown }
    if let v = screen["breakClock"] as? String { w.breakClock = v == "up" ? breakUp : breakDown }
    return w
}

private func act(_ m: Match, _ a: [String: Any], _ now: Int64, _ screen: WatchScreen) {
    switch a["do"] as? String {
    case "kickoff": m.selectKickoff(team(a["team"]))
    case "clearKickoff": m.clearKickoff()
    case "start": m.start(now, screen: screen)
    case "swapKickoff": m.swapKickoff()
    case "endPeriod": m.endPeriod(now)
    case "endHalftime": m.endHalftime()
    case "startNextPeriod": m.startNextPeriod(now)
    case "stoppage": m.toggleStoppage(now)
    case "undo": m.undoLastEvent(now)
    case "restart": m.restart()
    case "startBreak": m.startBreak(now)
    case "skipBreak": m.skipBreak()
    case "endBreakEarly": m.endBreakEarly(now)
    case "chooseExtraTime": m.chooseExtraTime(now)
    case "choosePenalties": m.choosePenalties()
    case "penaltyFirst": m.selectPenaltyFirst(team(a["team"]))
    case "startPenalties": m.startPenalties()
    case "kick": m.recordKick(a["scored"] as? Bool ?? false)
    case "acknowledge": m.acknowledgeAlerts(now)
    case "finish": m.finish(now)
    case "abandon": m.abandon(now, reason: a["reason"] as? Int ?? 0)
    case "undoGoldenGoal": m.undoGoldenGoal()
    case "resetBreak": m.resetBreak()
    case "event": m.addEvent(a["type"] as? String ?? "", team: team(a["team"]), player: a["player"] as? Int, now: now)
    case "official": m.addOfficialCard(red: a["type"] as? String == "R", team: team(a["team"]), role: a["role"] as? Int ?? 2, now: now)
    case "adjustClock": m.adjustClock(a["sec"] as? Int ?? 0, now: now)
    case "adjustAdded": m.adjustAdded(a["sec"] as? Int ?? 0, now: now)
    case "suspend": m.suspend(a["reason"] as? Int ?? 0, now: now)
    case "resume": m.resume(now)
    case "lightningAgain": m.lightningAgain(now)
    // EVT-14: the card's reason, from the list after the number.
    case "reason": m.giveReason(a["code"] as? String ?? "")
    default: check(false, "unknown action \(a)")
    }
}

/// What the engine shows for an expected field, as the cases write it.
private func shown(_ m: Match, _ key: String, _ now: Int64, alert: Alert?) -> Any {
    switch key {
    case "clock": return m.clockDisplay(now).clock
    case "added": return m.clockDisplay(now).added ?? NSNull()
    case "second": return m.shown.clocks == clocksOne ? NSNull() : m.secondClockText(now)
    case "progress": return m.periodProgress(now)
    case "breakClock": return m.breakClockText(now) ?? NSNull()
    case "phase": return phaseNames[m.phase] ?? "?"
    case "period": return m.period
    case "score": return m.score
    case "kickoff": return m.firstKickoff < 0 ? NSNull() : teamName(m.firstKickoff)
    case "kickoffOnScreen": return m.kickoffTeamOnScreen < 0 ? NSNull() : teamName(m.kickoffTeamOnScreen)
    case "events": return m.events.count
    case "alert": return alert.flatMap { alertNames[$0] } ?? NSNull()
    case "alerting": return m.hasActiveAlert(now)
    case "breakDue": return m.breakDue
    case "stoppageRunning": return m.isStoppageActive
    // TMR-15.
    case "clockStopped": return m.clockStopped
    // TMR-16.
    case "stoppage": return m.stoppagePill(now).map { ["text": $0.text, "solid": $0.solid] as NSDictionary } ?? NSNull()
    case "pens": return m.penaltyScore() ?? NSNull()
    case "endedGolden": return m.endedGolden == true
    case "abandoned": return m.isAbandoned
    case "periodLabel": return periodLabel(m.period, m.setup.numPeriods)
    case "stoppageMs": return Int(m.stoppageTotalMs(now))
    case "breakStoppageRunning": return m.breakStoppageRunning
    case "breakLeftMs": return m.breakRemainingMs(now).map { Int($0) } ?? NSNull()
    case "suspendedMs": return m.suspendedMs(now).map { Int($0) } ?? NSNull()
    case "lightningLeftMs": return m.lightningLeftMs(now).map { Int($0) } ?? NSNull()
    case "breakDueInMs": return m.breakDueInMs(now).map { Int($0) } ?? NSNull()
    case "screenOn": return m.wantsScreenOn(now)
    case "decision": return ["extraTime", "penalties", "endMatch"][[Decision.extraTime, .penalties, .endMatch].firstIndex(of: m.recommendedDecision)!]
    case "nextKicker": return teamName(m.nextKicker())
    case "penaltyWinner": return m.penaltyWinner() < 0 ? NSNull() : teamName(m.penaltyWinner())
    case "goldenWinner": return m.goldenWinner() < 0 ? NSNull() : teamName(m.goldenWinner())
    case "sinBinPill": return m.sinBinPill(now) ?? NSNull()
    case "sinBins": return m.runningSinBins(now).count
    case "reasons": return m.cardReasons().map { [$0.index, $0.code] as [Any] } as NSArray
    case "sinBinReturn": return m.sinBinReturns.first.map { ["team": teamName($0.team), "player": $0.player ?? NSNull()] as NSDictionary } ?? NSNull()
    default: return "(\(key) isn't checked on Apple Watch)"
    }
}

private func same(_ a: Any, _ b: Any) -> Bool {
    if a is NSNull || b is NSNull { return a is NSNull && b is NSNull }
    if let x = a as? Double, let y = b as? NSNumber { return abs(x - y.doubleValue) < 0.0001 }
    return (a as AnyObject).isEqual(b)
}

/// TMR-8: the match encoded and decoded as AppState saves and loads it when the app starts again.
private func reopened(_ m: Match) -> Match {
    try! JSONDecoder().decode(Match.self, from: JSONEncoder().encode(m))
}

func runMatchCases() {
    let cases = (try! JSONSerialization.jsonObject(with: Data(matchCasesJSON.utf8)) as! [String: Any])["match"] as! [[String: Any]]
    for c in cases {
        let name = c["name"] as! String
        let screen = screenOf(c["screen"] as? [String: Any] ?? [:])
        let format = c["format"] as? [String: Any] ?? [:]
        var m = Match(setup: setupOf(format), created: t0 / 1000)
        if let v = format["vibeAdded"] as? Bool { m.vibeAdded = v }
        if let v = format["vibeSinBin"] as? Bool { m.vibeSinBin = v }
        for (i, step) in (c["steps"] as! [[String: Any]]).enumerated() {
            let now = t0 + Int64(step["at"] as! Int)
            for a in step["do"] as? [[String: Any]] ?? [] {
                // TMR-8: the app closed and opened again, the match read back as AppState saves it.
                if a["do"] as? String == "reopen" { m = reopened(m) } else { act(m, a, now, screen) }
            }
            guard let expect = step["expect"] as? [String: Any] else { continue }
            // A tick fires what's due at this time, before the rest is read.
            let alert = expect["alert"] != nil ? m.tick(now) : nil
            for (key, expected) in expect.sorted(by: { $0.key < $1.key }) {
                let value = shown(m, key, now, alert: alert)
                if key == "last" {
                    let e = expected as! [String: Any]
                    guard let last = m.events.last else { check(false, "\(name) › step \(i + 1): no events"); continue }
                    let got: [String: Any] = ["type": last.type, "team": last.team < 0 ? NSNull() : teamName(last.team), "seconds": last.seconds, "player": last.player ?? NSNull(), "extra": last.extra ?? NSNull(), "reason": last.reason ?? NSNull()]
                    for (k, v) in e { check(same(got[k] ?? NSNull(), v), "\(name) › step \(i + 1): last.\(k) expected \(v), got \(got[k] ?? "nothing")") }
                } else if key == "breakPill" {
                    // The pictures' own.
                } else {
                    check(same(value, expected), "\(name) › step \(i + 1): \(key) expected \(expected), got \(value)")
                }
            }
        }
    }
}
