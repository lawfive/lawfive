import XCTest
@testable import LawFive

// WEB-28: a venue's and a referee's slab, as the website's history.ts works it out: the matches played
// with the first and last, those coming up, and the tag naming the first one's month; and the line
// under the track's sprints.
final class TogetherTests: XCTestCase {
    private func match(_ status: String, _ kickoff: String?) -> Match {
        var m = Match(id: "m\(kickoff ?? "")\(status)", version: 1, updatedAt: "2026-11-08T00:00:00Z", status: status, format: defaultFormat, home: Team(), away: Team(), crew: [])
        m.kickoff = kickoff
        m.timeZone = "America/Los_Angeles"
        return m
    }

    func testGamesTheFirstAndLastOfThemAndWhatsComingUp() {
        let t = workedTogether([
            match("played", "2026-10-04T16:00:00Z"),
            match("played", "2026-09-12T17:00:00Z"),
            match("abandoned", "2026-11-02T18:00:00Z"),
            match("scheduled", "2026-11-14T17:00:00Z"),
            match("scheduled", nil),
            match("cancelled", "2026-08-01T17:00:00Z"),
            // STAT-16: no kickoff, so not a game, as Stats counts them.
            match("played", nil),
        ])
        XCTAssertEqual(t.played, 3)
        XCTAssertEqual(t.upcoming, 2)
        XCTAssertEqual(t.first?.at, instantOf("2026-09-12T17:00:00Z"))
        XCTAssertEqual(t.last?.at, instantOf("2026-11-02T18:00:00Z"))
        XCTAssertEqual(t.first?.zone.identifier, "America/Los_Angeles")
    }

    func testTheTagNamesTheFirstMatchsMonthInItsOwnTimeZoneOnOneLine() {
        let us = Locale(identifier: "en_US")
        // 03:00 on October 1 in UTC is still September 30 in Los Angeles.
        XCTAssertEqual(sinceTag(workedTogether([match("played", "2026-10-01T03:00:00Z")]), locale: us), "Since Sep\u{00A0}2026")
        // Before a first game, no tag: a caption with nothing to say (as the website's).
        XCTAssertNil(sinceTag(workedTogether([match("scheduled", "2026-11-14T17:00:00Z")]), locale: us))
        XCTAssertNil(sinceTag(WorkedTogether(), locale: us))
    }

    func testOneRuleForAGameTheMatchListsPlayedAndTheVenuesAndRefereesCountsAlike() {
        XCTAssertTrue(isGame(match("played", "2026-10-04T16:00:00Z")))
        XCTAssertTrue(isGame(match("abandoned", "2026-10-04T16:00:00Z")))
        XCTAssertFalse(isGame(match("played", nil)))
        XCTAssertFalse(isGame(match("cancelled", "2026-10-04T16:00:00Z")))
        let counts = matchCounts([match("played", "2026-10-04T16:00:00Z"), match("abandoned", "2026-10-05T16:00:00Z"), match("played", nil), match("scheduled", "2026-11-14T17:00:00Z")]) { _ in ["v1"] }
        XCTAssertEqual(counts["v1"]?.played, 2)
        XCTAssertEqual(counts["v1"]?.upcoming, 1)
    }

    func testNothingYet() {
        let t = workedTogether([])
        XCTAssertEqual(t.played, 0)
        XCTAssertEqual(t.upcoming, 0)
        XCTAssertNil(t.first)
    }

    func testWhatCountsAsASprintInTheAccountsUnits() {
        XCTAssertEqual(sprintsCaption(21, unit: "km"), "21\u{00A0}km/h or faster, 2\u{00A0}s\u{00A0}or\u{00A0}more")
        XCTAssertEqual(sprintsCaption(21, unit: "mi"), "13\u{00A0}mph or faster, 2\u{00A0}s\u{00A0}or\u{00A0}more")
    }
}
