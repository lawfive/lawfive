import XCTest
@testable import LawFive

// RES-1 to RES-6: the same cases as the website's (schema/test/result.test.ts) and Android's ResultTest.
final class ResultTests: XCTestCase {
    private func goal(_ team: String, _ period: Int, _ sec: Int) -> Event { .goal(EventGoal(when: "play", period: period, periodSec: sec, team: team)) }
    private func caution(_ team: String, _ number: Int?, _ sec: Int = 600) -> Event {
        .caution(EventCaution(when: "play", period: 1, periodSec: sec, team: team, offender: .player(OffenderPlayer(number: number))))
    }

    func testTheScoreIsTheGoals() {
        XCTAssertEqual(scoreOf([goal("home", 1, 60), goal("away", 2, 120), goal("home", 2, 300), caution("home", 4)]), MatchRecordScore(home: 2, away: 1))
        XCTAssertEqual(scoreOf([]), MatchRecordScore(home: 0, away: 0))
    }

    func testAShootOutsScoreIsItsScoredKicks() {
        func kick(_ team: String, _ scored: Bool) -> Event { .penaltyKick(EventPenaltyKick(when: "penalties", team: team, scored: scored)) }
        XCTAssertEqual(penaltiesOf([kick("home", true), kick("away", false), kick("home", true), kick("away", true)]), MatchRecordPenalties(home: 2, away: 1))
        XCTAssertNil(penaltiesOf([goal("home", 1, 1)]))
    }

    func testASecondCautionIsASendOffAndGoesBackWhenTheFirstGoes() {
        let settled = settleCautions([caution("home", 7, 300), caution("away", 7, 400), caution("home", 7, 900), caution("home", nil, 950), caution("home", nil, 960)])
        XCTAssertEqual(settled.map(\.type), ["caution", "caution", "secondCaution", "caution", "caution"])
        XCTAssertEqual(settleCautions(Array(settled.dropFirst(2))).map(\.type), ["caution", "caution", "caution"])
    }

    // EVT-12, Q-22: schema/test/result.test.ts's sin bin case.
    func testASecondSinBinIsASendOffGoesBackWhenTheFirstGoesAndDoesntCombineWithACaution() {
        func sinBin(_ team: String, _ number: Int?, _ sec: Int) -> Event {
            .sinBin(EventSinBin(when: "play", period: 1, periodSec: sec, team: team, offender: .player(OffenderPlayer(number: number)), lengthSec: 600))
        }
        let settled = settleCautions([sinBin("home", 7, 300), caution("home", 7, 400), sinBin("home", 7, 900), sinBin("home", nil, 950), sinBin("home", nil, 960), caution("home", 7, 1000)])
        XCTAssertEqual(settled.map(\.type), ["sinBin", "caution", "secondSinBin", "sinBin", "sinBin", "secondCaution"])
        guard case .secondSinBin(let second) = settled[2] else { return XCTFail("not a second sin bin") }
        XCTAssertEqual(second.lengthSec, 600)
        XCTAssertEqual(settleCautions(Array(settled.dropFirst(2))).map(\.type), ["sinBin", "sinBin", "sinBin", "caution"], "the first deleted")
    }

    // EVT-12: a sin bin reads in with its length, as the match page shows it, and a format with sin bins says so.
    func testASinBinReadsAsThePageShowsIt() throws {
        let json = #"{"type":"sinBin","when":"play","period":1,"periodSec":754,"team":"away","offender":{"kind":"player","number":7},"lengthSec":600}"#
        let e = try JSONDecoder().decode(Event.self, from: Data(json.utf8))
        guard case .sinBin(let s) = e else { return XCTFail("not read as a sin bin") }
        XCTAssertEqual(e.whenText, "play")
        XCTAssertEqual(e.secondsIntoPeriod, 754)
        XCTAssertEqual(sinBinWords(s), "Sin bin #7 · 10 min")
        XCTAssertEqual(sinBinWords(EventSinBin(when: "break", period: 1, team: "home", offender: .player(OffenderPlayer()), lengthSec: 300)), "Sin bin · 5 min")
        var f = schemaDefaultFormat
        XCTAssertEqual(describeFormat(f), "2 × 45 min · 15 min break")
        f.sinBins = true
        XCTAssertEqual(describeFormat(f), "2 × 45 min · 15 min break · 10 min sin bins")
        f.sinBinSec = nil
        XCTAssertEqual(describeFormat(f), "2 × 45 min · 15 min break · 10 min sin bins")
        // TMR-15: after the break.
        f.stoppingClock = true
        XCTAssertEqual(describeFormat(f), "2 × 45 min · 15 min break · stopping clock · 10 min sin bins")
        // A format saved before sin bins is the same as one with them off.
        var older = schemaDefaultFormat
        older.sinBins = nil
        older.sinBinSec = nil
        XCTAssertTrue(sameFormat(older, schemaDefaultFormat))
    }

    func testMinutesAsARefereeWritesThem() {
        let f = defaultFormat
        XCTAssertEqual(periodSecOf(f, period: 1, text: "23"), 22 * 60)
        XCTAssertEqual(periodSecOf(f, period: 1, text: "23'"), 22 * 60)
        XCTAssertEqual(periodSecOf(f, period: 1, text: "45+2"), 46 * 60)
        XCTAssertEqual(periodSecOf(f, period: 2, text: "46"), 0)
        XCTAssertEqual(periodSecOf(f, period: 2, text: "90+3'"), 47 * 60)
        XCTAssertNil(periodSecOf(f, period: 2, text: "23"))
        XCTAssertNil(periodSecOf(f, period: 1, text: "44+1"))
        XCTAssertNil(periodSecOf(f, period: 1, text: "abc"))
        for (period, text) in [(1, "23'"), (1, "45+2'"), (2, "46'"), (2, "90+3'")] {
            XCTAssertEqual(minuteText(f, period: period, periodSec: periodSecOf(f, period: period, text: text)!), text)
        }
        XCTAssertEqual(minuteText(f, period: 1, periodSec: 22 * 60 + 41), "23'")
        var withEt = f
        withEt.extraTimePeriodSec = 15 * 60
        XCTAssertEqual(periodSecOf(withEt, period: 3, text: "95"), 4 * 60)
        XCTAssertEqual(periodSecOf(withEt, period: 4, text: "120+1"), 15 * 60)
    }

    func testEditingEventsPutsThemInOrderAndWorksTheScoreOutAgain() {
        let record = MatchRecord(id: "r", version: 1, updatedAt: "", outcome: "completed", periods: [], score: MatchRecordScore(home: 9, away: 9), events: [goal("away", 2, 600), goal("home", 1, 300)])
        let official = Event.caution(EventCaution(when: "afterFullTime", team: "away", offender: .teamOfficial(OffenderTeamOfficial(role: "headCoach"))))
        let edited = withEvents(record, record.events + [caution("home", 3, 100), official])
        XCTAssertEqual(edited.score, MatchRecordScore(home: 1, away: 1))
        XCTAssertEqual(edited.events.map(\.type), ["caution", "goal", "goal", "caution"])
        XCTAssertEqual(edited.events.last?.whenText, "afterFullTime")
    }

    func testAResultEnteredWithoutAWatchHasTheFormatsPeriods() {
        XCTAssertEqual(periodsFromFormat(defaultFormat).map { [$0.period, $0.playedSec] }, [[1, 2700], [2, 2700]])
    }

    func testTheSchemesAreBundled() {
        XCTAssertEqual(misconductScheme("ussf")?.cautions.first?.code, "UB")
        XCTAssertNil(misconductScheme("nowhere"))
    }

    // Q-20: the same cases as the website's (web/test/format.test.ts).
    func testPeriodsAreNamedAsTheMatchWasPlayed() {
        func played(_ outcome: String, _ normal: Int, _ extra: Int = 0) -> MatchRecord {
            MatchRecord(id: "r", version: 1, updatedAt: "2026-11-09T00:00:00Z", outcome: outcome,
                        periods: (1...(normal + extra)).map { PeriodPlayed(period: $0, extraTime: $0 > normal, playedSec: 900) },
                        score: MatchRecordScore(home: 0, away: 0), events: [])
        }
        var halves = defaultFormat; halves.periods = 2
        var quarters = defaultFormat; quarters.periods = 4
        XCTAssertEqual(periodName(asPlayed(halves, played("completed", 4)), period: 3), "Period 3")
        XCTAssertEqual(asPlayed(halves, played("completed", 2, 2)), halves)
        XCTAssertEqual(periodName(halves, period: 3), "Extra time 1")
        XCTAssertEqual(asPlayed(quarters, played("completed", 2)).periods, 2)
        XCTAssertEqual(asPlayed(quarters, played("abandoned", 2)).periods, 4)
        XCTAssertEqual(asPlayed(halves, nil), halves)
        // SET-16: a whole match of one period is a match of one period; abandoned in the first half, still halves.
        let one = asPlayed(halves, played("completed", 1, 1))
        XCTAssertEqual(one.periods, 1)
        XCTAssertEqual(periodName(one, period: 1), "Regular time")
        XCTAssertEqual(periodName(one, period: 2), "Extra time 1")
        XCTAssertEqual(asPlayed(halves, played("abandoned", 1)), halves)
    }

    // TMR-14: a clock corrected on the watch reads in, keeps its place in the period, and reads as the match page shows it.
    func testAClockCorrectionReadsAsThePageShowsIt() throws {
        let json = #"{"type":"clockAdjusted","when":"play","period":2,"periodSec":1240,"clock":"match","changeSec":40}"#
        let e = try JSONDecoder().decode(Event.self, from: Data(json.utf8))
        guard case .clockAdjusted(let c) = e else { return XCTFail("not read as a clock correction") }
        XCTAssertEqual(e.whenText, "play")
        XCTAssertEqual(e.periodNumber, 2)
        XCTAssertEqual(e.secondsIntoPeriod, 1240)
        XCTAssertEqual(clockAdjustedWords(c), "Clock adjusted +0:40")
        XCTAssertEqual(clockAdjustedWords(EventClockAdjusted(when: "play", clock: "added", changeSec: -65)), "Added time adjusted \u{2212}1:05")
        XCTAssertEqual(clockAdjustedWords(EventClockAdjusted(when: "play", clock: "match", changeSec: 720)), "Clock adjusted +12:00")
    }

    // TMR-13: as on the website (web/test/format.test.ts).
    func testASuspensionInWords() {
        XCTAssertEqual(suspensionWords(EventSuspension(when: "play", reason: "lightning", lengthSec: 2052)), "Suspended 34:12 · Lightning")
        XCTAssertEqual(suspensionWords(EventSuspension(when: "play", reason: "crowdTrouble")), "Suspended · Crowd trouble")
        XCTAssertEqual(suspensionWords(EventSuspension(when: "play", reason: "weather", lengthSec: 300, note: "Hail")), "Suspended 5:00 · Weather · Hail")
    }
}
