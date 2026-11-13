import XCTest
@testable import LawFive

// DATA-6: the match report as text, as the website's (web/test/report.test.ts) and Android's.
final class ReportTests: XCTestCase {
    private let match = Match(id: "m1", version: 1, updatedAt: "2026-11-03T00:00:00Z", status: "played", format: defaultFormat, home: Team(name: "United U12"), away: Team(name: "Strikers U12"), crew: [])

    private func report(_ events: [Event], match m: Match? = nil, outcome: String = "completed", editedAt: String? = nil) -> String {
        var record = MatchRecord(id: "r", version: 1, updatedAt: "", outcome: outcome, periods: [], score: MatchRecordScore(home: 1, away: 0), events: events)
        record.editedAt = editedAt
        return reportText(m ?? match, record, competition: nil, venue: nil, pitch: nil, you: "Alex Morgan", referees: [])
    }

    // EVT-16: after the cards, with how long play was stopped when the watch timed it; none, no heading.
    func testInjuriesAfterTheCardsOnlyWhenThereWereAny() {
        let text = report([
            .caution(EventCaution(when: "play", period: 1, periodSec: 600, team: "home", offender: .player(OffenderPlayer(number: 5)))),
            .injury(EventInjury(when: "play", period: 2, periodSec: 420, team: "away", player: 3, lengthSec: 90)),
            .injury(EventInjury(when: "play", period: 2, periodSec: 900, team: "home", note: "Ankle")),
        ])
        XCTAssertTrue(text.hasSuffix("Cautions and send-offs\n11'  United U12  #5  Caution\n\nInjuries\n53'  Strikers U12  #3  Play stopped 1:30\n61'  United U12  Player: Ankle\n"), text)
        XCTAssertFalse(report([]).contains("Injuries"))
    }

    // TMR-13, TMR-14: the suspensions and the clock's corrections after the result, each only when there were any;
    // a card without a number (or 0, EVT-3) says "Player", and a team official's has the name, as the website's.
    func testSuspensionsClockCorrectionsAndCardsWithoutANumber() {
        let text = report([
            .clockAdjusted(EventClockAdjusted(when: "play", period: 1, periodSec: 700, clock: "match", changeSec: 40)),
            .caution(EventCaution(when: "play", period: 1, periodSec: 1140, team: "away", offender: .player(OffenderPlayer()))),
            .suspension(EventSuspension(when: "play", period: 1, periodSec: 1740, reason: "lightning", lengthSec: 2052, note: "Storm cell")),
            .caution(EventCaution(when: "play", period: 2, periodSec: 60, team: "home", offender: .player(OffenderPlayer(number: 0)))),
            .sendOff(EventSendOff(when: "play", period: 2, periodSec: 300, team: "away", offender: .teamOfficial(OffenderTeamOfficial(role: "headCoach", name: "Pat Lee")))),
            .clockAdjusted(EventClockAdjusted(when: "play", period: 2, periodSec: 600, clock: "added", changeSec: -65)),
        ])
        XCTAssertTrue(text.hasSuffix("Result: United U12 1 – 0 Strikers U12, full time\n\nSuspended\n30'  Suspended 34:12 · Lightning: Storm cell\n\nClock\n12'  Clock adjusted +0:40\n56'  Added time adjusted \u{2212}1:05\n\nGoals\nNone\n\nCautions and send-offs\n20'  Strikers U12  Player  Caution\n47'  United U12  Player  Caution\n51'  Strikers U12  Head coach Pat Lee  Send-off\n"), text)
        let none = report([])
        XCTAssertFalse(none.contains("Suspended") || none.contains("Clock"))
    }

    // TMR-15: on a clock that stops, the report says so under the result, and an event at the length is in its last minute.
    func testAStoppingClockSaysSoAndItsMinutesAreTheClocks() {
        var stopping = match
        stopping.format.stoppingClock = true
        stopping.format.trackStoppage = true
        let text = report([.goal(EventGoal(when: "play", period: 2, periodSec: 45 * 60, team: "home", player: 9))], match: stopping)
        XCTAssertTrue(text.contains("\nClock\nStopped when play stopped (the minutes are the clock's)\n"), text)
        XCTAssertTrue(text.contains("90'  United U12  #9"), text)
        XCTAssertFalse(report([]).contains("stopped when play stopped"))
    }

    // DATA-6: the match number and assignor (SET-15) under the venue, the abandonment (EVT-11) after the result, a goal's
    // kind, and a card's code with what it means in its scheme (the bundled misconduct-ussf.json); a code the scheme
    // doesn't know on its own. As the website's.
    func testAssignorAbandonmentGoalKindsAndCodesWithTheirMeaning() {
        var assigned = match
        assigned.external = ExternalRef(source: "manual", id: "4471")
        assigned.assignor = "Dana Ruiz"
        let text = report([
            .goal(EventGoal(when: "play", period: 1, periodSec: 300, team: "home", player: 9, goalType: "penalty")),
            .caution(EventCaution(when: "play", period: 1, periodSec: 600, team: "away", offender: .player(OffenderPlayer(number: 4)), misconduct: MisconductCode(scheme: "ussf", code: "UB"))),
            .sendOff(EventSendOff(when: "play", period: 1, periodSec: 1200, team: "home", offender: .player(OffenderPlayer(number: 2)), misconduct: MisconductCode(scheme: "ussf", code: "SFP"))),
            .caution(EventCaution(when: "play", period: 1, periodSec: 1500, team: "away", offender: .player(OffenderPlayer(number: 7)), misconduct: MisconductCode(scheme: "ussf", code: "ZZ"))),
            .abandonment(EventAbandonment(when: "play", period: 2, periodSec: 1320, reason: "weather", note: "Hail")),
        ], match: assigned, outcome: "abandoned")
        XCTAssertTrue(text.contains("\nMatch number: 4471\nAssignor: Dana Ruiz\n\nOfficials\n"), text)
        XCTAssertTrue(text.hasSuffix("Result: United U12 1 – 0 Strikers U12, abandoned\nAbandoned 68': Hail\n\nGoals\n6'  United U12  #9  Penalty\n\nCautions and send-offs\n11'  Strikers U12  #4  Caution  UB (Unsporting behavior)\n21'  United U12  #2  Send-off  SFP (Serious foul play)\n26'  Strikers U12  #7  Caution  ZZ\n"), text)
        let none = report([])
        XCTAssertFalse(none.contains("Assignor") || none.contains("Abandoned"))
    }

    // RES-1: a result corrected after the match says so on the result line, as the website's printable page and text.
    func testAResultCorrectedAfterTheMatch() {
        let text = report([], editedAt: "2026-11-08T10:00:00Z")
        XCTAssertTrue(text.contains("\nResult: United U12 1 – 0 Strikers U12, full time, corrected after the match\n\nGoals\n"), text)
        XCTAssertFalse(report([]).contains("corrected"))
    }
}
