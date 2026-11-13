import Foundation

// WCH-2: what's particular to the Apple Watch's engine, run on the Mac by tools/test-watch-engine.sh, as
// it needs nothing of watchOS; the match's rules themselves are the shared cases (CaseRunner.swift).

var failures = 0
var checks = 0
func check(_ ok: Bool, _ what: String, line: Int = #line) {
    checks += 1
    if !ok {
        failures += 1
        print("FAILED line \(line): \(what)")
    }
}
func equal<T: Equatable>(_ a: T, _ b: T, _ what: String = "", line: Int = #line) {
    check(a == b, "\(what) expected \(b), got \(a)", line: line)
}

let t0: Int64 = 1_800_000_000_000
func at(_ start: Int64, _ min: Int, _ sec: Int = 0) -> Int64 { start + Int64(min * 60 + sec) * 1000 }
func ready(_ setup: MatchSetup = MatchSetup()) -> Match {
    let m = Match(setup: setup, created: t0 / 1000)
    m.selectKickoff(home)
    return m
}
func started(_ setup: MatchSetup = MatchSetup()) -> Match {
    let m = ready(setup)
    // TMR-11: the match clock comes from the match screen at kickoff; the setup's style stands in for it here.
    m.start(t0, screen: WatchScreen(mainClock: setup.clockStyle))
    return m
}
func setup(_ change: (inout MatchSetup) -> Void) -> MatchSetup {
    var s = MatchSetup()
    change(&s)
    return s
}

// PRE-8: as MatchTests.mc's testKickoffDirection.
do {
    func near(_ a: Double?, _ b: Double) -> Bool { a.map { abs($0 - b) < 0.001 } ?? false }
    let m = Match(setup: MatchSetup(), created: 1)
    m.selectKickoff(home)
    check(m.attackHeading(1) == nil, "nothing until recorded")
    m.setKickoffHeading(.pi / 2)
    m.start(t0, screen: WatchScreen())
    check(m.canRecordDirection, "can still record during the first period")
    m.endPeriod(at(t0, 46, 0))
    m.endHalftime()
    check(near(m.attackHeading(1), .pi / 2), "the other team kicks off the second half attacking the same way")
    m.selectKickoff(home)
    check(near(m.attackHeading(1), 3 * .pi / 2), "the first team kicking off again attacks the other way")
    m.startNextPeriod(at(t0, 61, 0))
    check(!m.canRecordDirection, "not recorded after the first period")
    check(m.attackHeading(2) == nil, "no arrow for extra time until it's recorded")
}
// ET-7: as MatchTests.mc's testExtraTimeFlow and testKickoffDirection: extra time's own toss and direction.
do {
    let m = started(setup { $0.extraTime = true; $0.penalties = true })
    m.setKickoffHeading(.pi / 2)
    m.endPeriod(at(t0, 45))
    m.endHalftime()
    m.startNextPeriod(at(t0, 60))
    m.endPeriod(at(t0, 105))
    m.chooseExtraTime(at(t0, 105))
    equal(m.kickoffFor(2), -1, "before extra time it's down to the toss")
    m.endHalftime()
    equal(m.kickoffTeamOnScreen, -1, "no ET1 kickoff team yet")
    check(!m.canRecordDirection, "not before ET1's kickoff team is chosen")
    m.startNextPeriod(at(t0, 120))
    equal(m.phase, .nextKickoff, "ET1 waits for its kickoff team")
    m.selectKickoff(away)
    equal(m.kickoffTeamOnScreen, away)
    equal(m.kickoff, home, "the match's own kickoff team is kept")
    check(m.canRecordDirection, "on ET1's kickoff screen")
    check(!m.hasDirection, "extra time's not saved yet")
    m.setKickoffHeading(0) // AWY attacks north in ET1
    check(m.hasDirection, "extra time's saved")
    check(abs((m.homeHeading ?? 0) - .pi / 2) < 0.001, "the match's own direction is kept")
    m.startNextPeriod(at(t0, 120))
    equal(m.firstKickoff, away, "Change kickoff names the ET1 team")
    check(m.canRecordDirection, "during ET1")
    m.endPeriod(at(t0, 135))
    equal(m.kickoffFor(3), home, "the other team kicks off ET2")
    m.endHalftime()
    equal(m.kickoffTeamOnScreen, home)
    check(abs(cos(m.attackHeading(3) ?? .pi) - 1) < 0.001, "ends changed: HOM attacks north in ET2")
    check(!m.canRecordDirection, "not after ET1")
    m.startNextPeriod(at(t0, 140))
    m.swapKickoff() // HOM took the ET1 kickoff after all
    equal(m.etKickoff, home, "the ET1 kickoff team changes")
    equal(m.kickoff, home, "not the match's")
    // A match saved before ET-7 still loads.
    let saved = try! JSONEncoder().encode(m)
    var json = try! JSONSerialization.jsonObject(with: saved) as! [String: Any]
    json["etKickoff"] = nil
    json["etHomeHeading"] = nil
    check((try? JSONDecoder().decode(Match.self, from: JSONSerialization.data(withJSONObject: json))) != nil, "loads without them")
}
// DIAG-1: the battery at each kickoff and end.
do {
    Match.battery = { 80 }
    let m = started(setup { _ in })
    m.endPeriod(at(t0, 45, 0))
    check(m.batteryLog == [[0, 0, 80], [0, 1, 80]], "battery at kickoff and period end")
    Match.battery = { nil }
}

// ET-6 and EVT-7, beyond the shared cases: a golden goal and a card after full time survive saving,
// golden goal needs extra time, and a setup saved before golden goal still loads.
do {
    let m = started(setup { $0.extraTime = true; $0.goldenGoal = true })
    m.endPeriod(at(t0, 45))
    m.endHalftime()
    m.startNextPeriod(at(t0, 60))
    m.endPeriod(at(t0, 105))
    m.chooseExtraTime(at(t0, 105))
    m.endHalftime()
    m.selectKickoff(home)
    m.startNextPeriod(at(t0, 120))
    m.addEvent(EventType.goal, team: home, player: 10, now: at(t0, 125))
    let restored = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(m))
    equal(restored.phase, .golden, "kept if the app closes")
    check(!Match(setup: setup { $0.goldenGoal = true }, created: 0).goldenGoal, "only with extra time")
    let old = try! JSONDecoder().decode(MatchSetup.self, from: Data(#"{"home":"HOM","away":"AWY","homeName":"","awayName":"","homeColor":-1,"awayColor":-1,"numPeriods":2,"periodSec":2700,"halftimeSec":900,"teamSize":11,"midBreak":false,"breakLenSec":120,"extraTime":true,"etPeriods":2,"etPeriodSec":900,"penalties":false,"clockStyle":0,"trackStoppage":false,"breakStoppage":true,"goalScorers":true,"goalTypes":false}"#.utf8))
    check(old.goldenGoal == nil, "an old setup has none")
    let done = started()
    done.finish(at(t0, 45))
    done.addEvent(EventType.red, team: home, player: 2, now: at(t0, 50))
    let copy = try JSONDecoder().decode(Match.self, from: JSONEncoder().encode(done))
    equal(copy.events, done.events, "survives saving")
    equal(copy.phase, done.phase)
}
// TMR-14 and TMR-8: a clock and added time put right survive the app closing, and Undo still takes them back.
do {
    let m = started(setup { $0.trackStoppage = true })
    m.adjustClock(40, now: at(t0, 20))
    m.adjustAdded(30, now: at(t0, 21))
    let restored = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(m))
    equal(restored.clockDisplay(at(t0, 25)).clock, "25:40", "the clock as corrected")
    equal(restored.stoppageTotalMs(at(t0, 25)), 30_000, "the added time as corrected")
    equal(restored.events.map(\.type), [EventType.clockAdjusted, EventType.addedAdjusted])
    restored.undoLastEvent(at(t0, 26))
    restored.undoLastEvent(at(t0, 26))
    equal(restored.clockDisplay(at(t0, 26)).clock, "26:00", "both undone")
    equal(restored.stoppageTotalMs(at(t0, 26)), 0)
    equal(formatChange(40), "+0:40")
    equal(formatChange(-65), "\u{2212}1:05")
    equal(formatChange(720), "+12:00")
}
// TMR-13 and TMR-8: a match saved while suspended for lightning, with a card given then, loads still suspended,
// with its reason, its countdown and its clock where play stopped; Resume carries on from there.
do {
    let m = started(setup { $0.trackStoppage = true })
    m.toggleStoppage(at(t0, 19, 30))
    check(m.suspend(lightningReason, now: at(t0, 20)), "suspended")
    m.addEvent(EventType.yellow, team: away, player: 4, now: at(t0, 22))
    let restored = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(m))
    equal(restored.phase, .suspended, "still suspended")
    equal(restored.suspendReason, lightningReason, "for lightning")
    check(restored.isLightning, "lightning")
    equal(restored.lightningLeftMs(at(t0, 30)), 20 * 60 * 1000, "the countdown runs on")
    equal(restored.suspendedMs(at(t0, 30)), 10 * 60 * 1000)
    equal(restored.clockDisplay(at(t0, 30)).clock, "20:00", "the clock where play stopped")
    equal(restored.stoppageTotalMs(at(t0, 30)), 30_000, "the stoppage clock too")
    equal(restored.events.map(\.type), [EventType.suspended, EventType.yellow])
    equal(restored.events.last?.seconds, 20 * 60, "the card at the time play stopped")
    equal(restored.lastUndoableEvent?.type, EventType.yellow, "the card can be undone")
    restored.lightningAgain(at(t0, 40))
    equal(restored.lightningLeftMs(at(t0, 40)), 30 * 60 * 1000, "Lightning again starts it over")
    equal(restored.tick(at(t0, 70)), .lightning, "one vibration at 0:00")
    let again = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(restored))
    equal(again.tick(at(t0, 71)), nil, "and not again after a restore")
    again.resume(at(t0, 75))
    equal(again.phase, .running)
    equal(again.clockDisplay(at(t0, 76)).clock, "21:00", "carries on from where it stopped")
    equal(again.events.last, MatchEvent(type: EventType.resumed, team: -1, period: 0, seconds: 20 * 60, player: nil, extra: 55 * 60))
    check(again.suspendReason == nil && again.suspendedMs(at(t0, 76)) == nil && again.lightningLeftMs(at(t0, 76)) == nil, "the suspension cleared")
    // A match saved before TMR-13 still loads, not suspended.
    var json = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(started())) as! [String: Any]
    json.removeValue(forKey: "suspendedAt")
    check((try? JSONDecoder().decode(Match.self, from: JSONSerialization.data(withJSONObject: json)))?.suspendedMs(at(t0, 1)) == nil, "loads without them")
}
// EVT-12 and TMR-8: sin bins saved and restored: one waiting to return still waits, and none is announced again;
// two given at once with no number both wait, as the website's do; undo of an earlier event keeps the right one waiting.
do {
    let m = started(setup { $0.sinBins = true; $0.sinBinSec = 120 })
    check(m.addEvent(EventType.sinBin, team: away, player: nil, now: at(t0, 1)) == false, "a first sin bin isn't a send-off")
    m.addEvent(EventType.sinBin, team: away, player: 0, now: at(t0, 1))
    m.addEvent(EventType.sinBin, team: home, player: 8, now: at(t0, 2))
    equal(m.sinBinPill(at(t0, 2)), "AWY 1:00 +2")
    equal(m.sinBinPill(at(t0, 2), withTeam: false), "1:00 +2", "the team left out when three pills don't fit")
    equal(m.tick(at(t0, 3)), .sinBinEnd)
    equal(m.sinBinReturns.count, 2, "both with no number wait")
    equal(m.sinBinReturnText(), "AWY can return")
    let restored = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(m))
    equal(restored.sinBinReturns.count, 2, "still waiting after a restore")
    equal(restored.sinBinPill(at(t0, 3)), "HOM 8 1:00")
    restored.acknowledgeAlerts(at(t0, 3, 5))
    check(restored.sinBinReturns.isEmpty, "a button lets them go")
    equal(restored.tick(at(t0, 3, 10)), nil, "and they aren't announced again")
    equal(restored.tick(at(t0, 4)), .sinBinEnd, "the next one's end")
    equal(restored.sinBinReturnText(), "HOM #8 can return")
    // ET-6: a golden goal taken back from before the one waiting: the one waiting is still the right one.
    let n = started(setup { $0.sinBins = true; $0.sinBinSec = 60; $0.extraTime = true; $0.goldenGoal = true; $0.numPeriods = 1 })
    n.endPeriod(at(t0, 45))
    n.chooseExtraTime(at(t0, 45))
    n.endHalftime()
    n.selectKickoff(away)
    n.startNextPeriod(at(t0, 50))
    n.addEvent(EventType.goal, team: home, player: nil, now: at(t0, 51))
    equal(n.phase, .golden)
    n.addEvent(EventType.sinBin, team: away, player: 3, now: at(t0, 52))
    n.addEvent(EventType.sinBin, team: away, player: 6, now: at(t0, 52, 30))
    equal(n.tick(at(t0, 53)), .sinBinEnd, "in golden goal's play too")
    n.undoGoldenGoal()
    equal(n.sinBinReturnText(), "AWY #3 can return", "the goal taken back leaves the right one waiting")
    equal(n.sinBinReturns.count, 1)
    check(n.addEvent(EventType.sinBin, team: away, player: 6, now: at(t0, 53, 10)), "a second sin bin is a send-off, as a second yellow")
    equal(n.events.last?.type, EventType.secondSinBin)
    n.undoLastEvent(at(t0, 53, 10))
    n.undoLastEvent(at(t0, 53, 10))
    check(n.sinBinReturns.count == 1 && n.events.count == 2, "the second sin bin, then #6's sin bin taken back; #3 still waits")
    n.undoLastEvent(at(t0, 53, 10))
    check(n.sinBinReturns.isEmpty, "#3's taken back too")
    // SET-13: Same as last carries both, and its line says so.
    var played = MatchSetup(home: "STR")
    (played.sinBins, played.sinBinSec) = (true, 600)
    equal(played.format.fullSummary, "2×45' · HT 15' · SB 10'")
    check(!played.format.sameFormat(as: MatchSetup()), "sin bins on differs")
    check(MatchSetup(sinBins: false, sinBinSec: 600).sameFormat(as: MatchSetup()), "off and 10 minutes is an older setup's none")
    // A setup saved before them loads with them off, and Sin bin records nothing.
    var json = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(MatchSetup())) as! [String: Any]
    json.removeValue(forKey: "sinBins")
    let old = try! JSONDecoder().decode(MatchSetup.self, from: JSONSerialization.data(withJSONObject: json))
    check(!old.hasSinBins && old.sinBinLength == 600, "off, 10 minutes")
}
// UI-21, UI-24: the six old layouts as the choices, and the nearest one back.
do {
    equal(WatchScreen.fromLayout(layoutRing, mainClock: clockUp, secondClock: clockDown), WatchScreen(edge: edgeRing))
    check(!WatchScreen.fromLayout(layoutMinimal, mainClock: clockUp, secondClock: clockDown).names, "minimal: scores only")
    equal(WatchScreen.fromLayout(layoutScoreboard, mainClock: clockUp, secondClock: clockDown), WatchScreen())
    equal(WatchScreen(clocks: clocksSideBySide, edge: edgeRing).nearestLayout, layoutSideBySide)
    equal(WatchScreen(edge: edgeRing, names: false).nearestLayout, layoutMinimal)
    equal(WatchScreen(edge: edgeTime).nearestLayout, layoutDefault)
    // UI-24: until one is chosen, two clocks stacked, the time left over the match time, with the time of day.
    equal(WatchScreen.standard, WatchScreen(clocks: clocksStacked, mainClock: clockDown, secondClock: clockUp, breakClock: breakDown, edge: edgeTime, names: true))
    let old = ready(setup { $0.clockStyle = clockDown })
    old.faceLayout = layoutStacked
    equal(old.shown.clocks, clocksStacked)
    equal(old.clockStyle, clockDown)
}
// SET-13: Same as last carries the format, not the teams, colors or timer names; turning it back on keeps the colors chosen.
do {
    var played = MatchSetup(home: "STR", away: "ROV", homeColor: 0xD71920, numPeriods: 4, periodSec: 600, extraTime: true, goldenGoal: true, penalties: true, trackStoppage: true, goalTypes: true)
    played.stoppageLabel = "water"
    let last = played.format
    equal(last.home, "HOM")
    equal(last.homeColor, -1)
    equal(last.stoppageTimer, "stoppage")
    equal(last.numPeriods, 4)
    equal(last.periodSec, 600)
    check(last.extraTime && last.goldenGoal == true && last.penalties && last.trackStoppage && last.goalTypes, "the format's switches")
    equal(last.fullSummary, "4×10' · HT 15' · ET GG · Pens")
    // SET-16: one period has no break to sum up, and no label.
    equal(MatchSetup(numPeriods: 1, periodSec: 1200).summary, "1×20'")
    equal(periodName(0, 1), "period")
    equal(withPeriod(0, 1, "12:00"), "12:00")
    equal(withPeriod(0, 2, "12:00"), "1H 12:00")
    let draft = MatchSetup(homeColor: 0x0057B8).withFormat(last)
    equal(draft.homeColor, 0x0057B8)
    equal(draft.numPeriods, 4)
}
// SET-13: New match leaves out Same as last when it's Quick match over again, whatever the teams and colors.
do {
    let quick = MatchSetup()
    check(MatchSetup(home: "STR", homeColor: 0xD71920).format.sameFormat(as: quick), "same format, other teams: the same")
    check(MatchSetup(goldenGoal: false).sameFormat(as: quick), "golden goal off is the same as an older setup's none")
    check(!MatchSetup(trackStoppage: true).sameFormat(as: quick), "a switch differs")
    check(!MatchSetup(periodSec: 40 * 60).sameFormat(as: quick), "the period length differs")
}

// TRK-7: samples packed as the Garmin watch packs them (MatchTests.mc's testTrackSampleText and testTrackChunksAndUpload).
do {
    equal(TrackChunk.encode(dt: 10, lat: 51500000, lon: -120000, lastLat: nil, lastLon: nil, speed: 345, hr: 142), ",51500000,-120000,345,142;")
    equal(TrackChunk.encode(dt: 10, lat: 51500003, lon: -120005, lastLat: 51500000, lastLon: -120000, speed: 120, hr: 141), ",3,-5,120,141;")
    equal(TrackChunk.encode(dt: 12, lat: nil, lon: nil, lastLat: 51500003, lastLon: -120005, speed: nil, hr: 140), "12,,,,140;")
    equal(TrackChunk.encode(dt: 10, lat: 51500004, lon: -120005, lastLat: 51500003, lastLon: -120005, speed: nil, hr: nil), ",1,0;")
    var chunk = TrackChunk()
    for i in 0..<TrackChunk.samples { chunk.add(tDs: i * 10, lat: 51500000 + i, lon: -120000, speed: 300, hr: 140) }
    check(chunk.isFull, "full at 300 samples")
    equal(String(chunk.text.prefix(23)), "0,51500000,-120000,300,")
    var next = TrackChunk()
    next.add(tDs: 3000, lat: 51500300, lon: -120000, speed: 300, hr: 140)
    equal(next.text, "3000,51500300,-120000,300,140;")
    check(!next.add(tDs: 3010, lat: nil, lon: nil, speed: nil, hr: nil), "nothing to keep")
    check(!next.add(tDs: 3000, lat: 51500301, lon: -120000, speed: nil, hr: nil), "no later than the last")
}

// Decision 4c: linking from the paired iPhone (PhoneLinkRules.swift), as the Garmin's PhoneLink.mc.
do {
    func offer(_ id: Int, _ server: String = "https://lawfive.example.com", until: Double? = nil) -> [String: Any] {
        var m: [String: Any] = ["lawfive": 1, "kind": "offer", "id": id, "server": server, "account": "Sam Rivera"]
        if let until { m["until"] = until }
        return m
    }
    var r = PhoneLinkRules()
    equal(r.receive(offer(7), now: 100, inMatch: false), [], "an offer asks, with nothing sent yet")
    equal(r.step, .asking, "Link to …?")
    equal(r.offer, PhoneOffer(id: 7, server: "https://lawfive.example.com", account: "Sam Rivera"))
    equal(r.receive(offer(7), now: 104, inMatch: false), [], "the same offer again changes nothing")
    equal(r.answer(yes: true, now: 105), [.reply(kind: "accept", id: 7)], "yes answers accept")
    equal(r.step, .linking)
    equal(r.receive(offer(8), now: 106, inMatch: false), [], "a new offer while linking waits")
    equal(r.offer?.id, 7)
    // SEC-5: only the server said yes to, for the offer answered.
    equal(r.receive(["lawfive": 1, "kind": "link", "id": 7, "server": "https://elsewhere.example.com", "token": "t"], now: 107, inMatch: false), [], "another server's token is refused")
    equal(r.receive(["lawfive": 1, "kind": "link", "id": 6, "server": "https://lawfive.example.com", "token": "t"], now: 107, inMatch: false), [], "another offer's token is refused")
    equal(r.receive(["lawfive": 1, "kind": "link", "id": 7, "server": "https://lawfive.example.com", "token": "t"], now: 108, inMatch: false),
          [.keep(server: "https://lawfive.example.com", token: "t"), .reply(kind: "linked", id: 7)], "the token is kept and the phone told")
    equal(r.step, .linked)
    check(r.offer == nil, "the offer is done")

    var no = PhoneLinkRules()
    _ = no.receive(offer(3), now: 0, inMatch: false)
    equal(no.answer(yes: false, now: 1), [.reply(kind: "decline", id: 3)], "no answers decline")
    check(no.step == nil && no.offer == nil, "and the question goes")

    var busy = PhoneLinkRules()
    equal(busy.receive(offer(4), now: 0, inMatch: true), [.reply(kind: "busy", id: 4)], "not in the middle of a match")
    check(busy.step == nil, "no question during a match")
    equal(busy.receive(offer(5, until: 50), now: 60, inMatch: false), [], "an offer that lapsed while LawFive was closed is let go")
    check(busy.step == nil, "no question for it")

    var slow = PhoneLinkRules()
    _ = slow.receive(offer(9), now: 0, inMatch: false)
    _ = slow.answer(yes: true, now: 1)
    slow.tick(now: 1 + PhoneLinkRules.waitSeconds + 1)
    equal(slow.step, .problem("The phone didn't answer"), "no token in time")

    var failed = PhoneLinkRules()
    _ = failed.receive(offer(2), now: 0, inMatch: false)
    _ = failed.answer(yes: true, now: 1)
    _ = failed.receive(["lawfive": 1, "kind": "failed", "id": 2, "message": "Couldn't link"], now: 2, inMatch: false)
    equal(failed.step, .problem("Couldn't link"), "the phone's reason")
    equal(PhoneLinkRules.host("https://lawfive.example.com"), "lawfive.example.com")
}

// EVT-14: the card's reason kept through saving and restoring, and the upload's misconduct beside the events.
do {
    let m = started()
    m.misconductScheme = "ussf"
    check(m.misconductUpload == nil, "no misconduct without a reason")
    m.addEvent(EventType.yellow, team: home, player: 4, now: at(t0, 10))
    check(m.misconductUpload == nil, "a card without a reason sends none")
    m.giveReason("UB")
    m.addEvent(EventType.goal, team: away, player: 9, now: at(t0, 12))
    m.giveReason("DT")
    equal(m.events[0].reason, "DT", "the reason goes to the card, past a goal, and replaces the one before")
    equal(m.events[1].reason, nil, "a goal never takes one")
    let restored = try! JSONDecoder().decode(Match.self, from: try! JSONEncoder().encode(m))
    equal(restored.events[0].reason, "DT", "kept when saved and restored")
    equal(restored.misconductScheme, "ussf", "the match's scheme kept")
    let upload = restored.misconductUpload ?? [:]
    equal(upload["scheme"] as? String, "ussf")
    equal((upload["codes"] as? [[Any]])?.count, 1)
    equal((upload["codes"] as? [[Any]])?.first?.first as? Int, 0)
    equal((upload["codes"] as? [[Any]])?.first?.last as? String, "DT")
    let json = String(data: try! JSONSerialization.data(withJSONObject: upload, options: .sortedKeys), encoding: .utf8)
    equal(json, #"{"codes":[[0,"DT"]],"scheme":"ussf"}"#)
    // A match saved before EVT-14: no reasons, and IFAB's scheme.
    let old = try! JSONDecoder().decode(Match.self, from: Data(#"{"setup":{"home":"HOM","away":"AWY","homeName":"","awayName":"","homeColor":-1,"awayColor":-1,"numPeriods":2,"periodSec":2700,"halftimeSec":900,"teamSize":11,"midBreak":false,"breakLenSec":120,"extraTime":false,"etPeriods":2,"etPeriodSec":900,"penalties":false,"clockStyle":0,"trackStoppage":false,"breakStoppage":true,"goalScorers":true,"goalTypes":false},"created":1,"repeatSec":10,"reminderSec":10,"vibeFullTime":true,"vibeStoppage":true,"vibeBreak":true,"faceLayout":0,"secondClock":2,"phase":2,"period":0,"kickoff":0,"stoppageMs":0,"breakIsHalftime":false,"scheduledBreakDone":false,"fullTimeAcked":false,"breakDue":false,"breakDueSilenced":false,"breakEndAlerted":false,"breakStoppageRunning":false,"score":[0,0],"events":[{"type":"Y","team":0,"period":0,"seconds":60,"player":4}],"penFirst":-1,"penStarted":false,"startedAt":[1]}"#.utf8))
    equal(old.events[0].reason, nil, "an event saved before reasons has none")
    old.giveReason("PI")
    equal(old.misconductUpload?["scheme"] as? String, "ifab", "a match saved before the scheme sends IFAB's")
    // The codes on the list: the cautions' for Y, Y2, SB, SB2 and TY; the send-offs' for R and TR.
    check(isSendOffCard(EventType.red) && isSendOffCard(EventType.officialRed), "send-offs' list")
    check(![EventType.yellow, EventType.secondYellow, EventType.sinBin, EventType.secondSinBin, EventType.officialYellow].contains(where: isSendOffCard), "cautions' list")
}

// WCH-2: the shared cases (CaseRunner.swift).
runMatchCases()

print("\(checks) checks, \(failures) failed")
exit(failures == 0 ? 0 : 1)
