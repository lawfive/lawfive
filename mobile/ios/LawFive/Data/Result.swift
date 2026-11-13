import Foundation

// Correcting a result (RES-1 to RES-6): the website's rules (schema/src/result.ts), tested with the
// same cases (ResultTests). The score is the goals, a second caution to the same player is a send-off,
// and a minute is written as a referee writes it.

extension Event {
    /// Where it happened: beforeKickoff, play, break, afterFullTime or penalties.
    var whenText: String {
        switch self {
        case .goal(let e): return e.when
        case .caution(let e): return e.when
        case .secondCaution(let e): return e.when
        case .sendOff(let e): return e.when
        case .sinBin(let e): return e.when
        case .secondSinBin(let e): return e.when
        case .stoppage(let e): return e.when
        case .periodEnd(let e): return e.when
        case .penaltyKick(let e): return e.when
        case .injury(let e): return e.when
        case .suspension(let e): return e.when
        case .clockAdjusted(let e): return e.when
        case .abandonment(let e): return e.when
        case .unknown(let v): return v["when"]?.string ?? "play"
        }
    }
    var periodNumber: Int? {
        switch self {
        case .goal(let e): return e.period
        case .caution(let e): return e.period
        case .secondCaution(let e): return e.period
        case .sendOff(let e): return e.period
        case .sinBin(let e): return e.period
        case .secondSinBin(let e): return e.period
        case .stoppage(let e): return e.period
        case .periodEnd(let e): return e.period
        case .penaltyKick(let e): return e.period
        case .injury(let e): return e.period
        case .suspension(let e): return e.period
        case .clockAdjusted(let e): return e.period
        case .abandonment(let e): return e.period
        case .unknown: return nil
        }
    }
    var secondsIntoPeriod: Int? {
        switch self {
        case .goal(let e): return e.periodSec
        case .caution(let e): return e.periodSec
        case .secondCaution(let e): return e.periodSec
        case .sendOff(let e): return e.periodSec
        case .sinBin(let e): return e.periodSec
        case .secondSinBin(let e): return e.periodSec
        case .stoppage(let e): return e.periodSec
        case .periodEnd(let e): return e.periodSec
        case .penaltyKick(let e): return e.periodSec
        case .injury(let e): return e.periodSec
        case .suspension(let e): return e.periodSec
        case .clockAdjusted(let e): return e.periodSec
        case .abandonment(let e): return e.periodSec
        case .unknown: return nil
        }
    }
}

/// RES-1: the score is the goals.
func scoreOf(_ events: [Event]) -> MatchRecordScore {
    var score = MatchRecordScore(home: 0, away: 0)
    for case .goal(let g) in events {
        if g.team == "home" { score.home += 1 } else { score.away += 1 }
    }
    return score
}

/// The shoot-out's score from its kicks, or nil when there wasn't one.
func penaltiesOf(_ events: [Event]) -> MatchRecordPenalties? {
    var kicks = 0
    var score = MatchRecordPenalties(home: 0, away: 0)
    for case .penaltyKick(let k) in events {
        kicks += 1
        if k.scored { if k.team == "home" { score.home += 1 } else { score.away += 1 } }
    }
    return kicks == 0 ? nil : score
}

/// RES-6: a second caution to the same numbered player of the same team is a second caution; one that's no longer second is a caution.
/// EVT-12: sin bins the same way, on their own: a second sin bin for the same number is a second sin bin (a
/// send-off), one no longer second goes back to a sin bin; a sin bin and a caution don't combine (Q-22).
func settleCautions(_ events: [Event]) -> [Event] {
    var cautioned = Set<String>()
    var binned = Set<String>()
    return events.map { e in
        switch e {
        case .sinBin(let c):
            guard case .player(let p) = c.offender, let number = p.number else { return e }
            if binned.insert("\(c.team) \(number)").inserted { return e }
            return .secondSinBin(EventSecondSinBin(when: c.when, period: c.period, periodSec: c.periodSec, at: c.at, team: c.team, offender: c.offender, misconduct: c.misconduct, lengthSec: c.lengthSec))
        case .secondSinBin(let c):
            guard case .player(let p) = c.offender, let number = p.number else { return e }
            if !binned.insert("\(c.team) \(number)").inserted { return e }
            return .sinBin(EventSinBin(when: c.when, period: c.period, periodSec: c.periodSec, at: c.at, team: c.team, offender: c.offender, misconduct: c.misconduct, lengthSec: c.lengthSec))
        case .caution(let c):
            guard case .player(let p) = c.offender, let number = p.number else { return e }
            if cautioned.insert("\(c.team) \(number)").inserted { return e }
            return .secondCaution(EventSecondCaution(when: c.when, period: c.period, periodSec: c.periodSec, at: c.at, team: c.team, offender: c.offender, misconduct: c.misconduct))
        case .secondCaution(let c):
            guard case .player(let p) = c.offender, let number = p.number else { return e }
            if !cautioned.insert("\(c.team) \(number)").inserted { return e }
            return .caution(EventCaution(when: c.when, period: c.period, periodSec: c.periodSec, at: c.at, team: c.team, offender: c.offender, misconduct: c.misconduct))
        default:
            return e
        }
    }
}

private func span(_ format: MatchFormat, _ period: Int) -> (start: Int, length: Int) {
    let regular = period <= format.periods
    let length = (regular ? format.periodSec : format.extraTimePeriodSec) / 60
    let start = regular ? (period - 1) * format.periodSec / 60
        : format.periods * format.periodSec / 60 + (period - format.periods - 1) * format.extraTimePeriodSec / 60
    return (start, length)
}

/// RES-1: "23" or "45+2" (an apostrophe allowed) to seconds into the period, or nil when it isn't in it.
func periodSecOf(_ format: MatchFormat, period: Int, text: String) -> Int? {
    var typed = text.trimmingCharacters(in: .whitespaces)
    while typed.hasSuffix("'") || typed.hasSuffix("’") { typed.removeLast() }
    let parts = typed.split(separator: "+", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
    guard parts.count <= 2, let minute = Int(parts[0]), parts[0].count <= 3, parts[0].allSatisfy(\.isNumber) else { return nil }
    let (start, length) = span(format, period)
    if parts.count == 2 {
        guard let added = Int(parts[1]), parts[1].count <= 2, parts[1].allSatisfy(\.isNumber) else { return nil }
        return minute == start + length && added >= 1 ? (length + added - 1) * 60 : nil
    }
    let into = minute - start
    return into >= 1 && into <= length ? (into - 1) * 60 : nil
}

/// The minute an event shows as, "23'" or "45+2'".
func minuteText(_ format: MatchFormat, period: Int, periodSec: Int) -> String {
    let (start, length) = span(format, period)
    let minute = periodSec / 60 + 1
    return minute > length ? "\(start + length)+\(minute - length)'" : "\(start + minute)'"
}

/// RES-1: a result after editing its events: in order, cautions settled, the score and shoot-out from them.
func withEvents(_ record: MatchRecord, _ events: [Event]) -> MatchRecord {
    let order = ["beforeKickoff": 0, "play": 1, "break": 1, "afterFullTime": 2, "penalties": 3]
    func key(_ e: Event) -> [Int] {
        let w = e.whenText
        let inPeriod = w == "play" || w == "break"
        return [order[w] ?? 1, inPeriod ? e.periodNumber ?? 0 : 0, w == "break" ? 1 : 0, w == "play" ? e.secondsIntoPeriod ?? 0 : 0]
    }
    let sorted = events.enumerated().sorted { a, b in
        let (ka, kb) = (key(a.element), key(b.element))
        return ka == kb ? a.offset < b.offset : ka.lexicographicallyPrecedes(kb)
    }.map(\.element)
    let settled = settleCautions(sorted)
    var result = record
    result.events = settled
    result.score = scoreOf(settled)
    result.penalties = penaltiesOf(settled)
    return result
}

/// RES-2: the periods of a match entered without a watch, from its format.
func periodsFromFormat(_ format: MatchFormat) -> [PeriodPlayed] {
    (1...max(1, format.periods)).map { PeriodPlayed(period: $0, extraTime: false, playedSec: format.periodSec) }
}

/// RES-1: a misconduct scheme's codes, bundled from schema/misconduct/ (pnpm generate copies them); nil for one the app doesn't know.
func misconductScheme(_ id: String) -> MisconductScheme? {
    guard let url = Bundle.main.url(forResource: "misconduct-\(id)", withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(MisconductScheme.self, from: data)
}
