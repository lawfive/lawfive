import XCTest
@testable import LawFiveWatch

// SYNC-16: canceled and postponed matches in the watch's list until their kickoff, never counted as coming up.

final class PlannedMatchesTests: XCTestCase {
    private let now: Int64 = 1_790_000_000

    /// A match as GET /v1/watch/matches sends it (WatchMatch), with a status when it has one.
    static func match(_ id: String, kickoff: Int64?, status: String? = nil) throws -> PlannedMatch {
        var json: [String: Any] = [
            "id": id, "title": "STR v ROV \(id)", "name": NSNull(), "where": "Twin Creeks, Field 3", "role": "Referee", "weather": NSNull(),
            "home": "STR", "away": "ROV", "homeName": "Strikers", "awayName": "Rovers", "homeColor": 0xD71920, "awayColor": 0x0057B8,
            "numPeriods": 2, "periodSec": 2700, "halftimeSec": 900, "teamSize": 11, "midBreak": false, "breakLenSec": 120,
            "extraTime": false, "etPeriods": 2, "etPeriodSec": 900, "goldenGoal": false, "penalties": false, "clockStyle": 0,
            "trackStoppage": true, "breakStoppage": false, "goalScorers": false, "goalTypes": false, "sinBins": false, "sinBinSec": 600,
        ]
        json["kickoff"] = kickoff ?? NSNull()
        if let status { json["status"] = status }
        return try JSONDecoder().decode(PlannedMatch.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testTheWatchAsksForCanceledAndPostponedMatches() throws {
        let query = try XCTUnwrap(URLComponents(string: "https://lawfive.example" + AppState.matchesRequest)?.queryItems)
        XCTAssertEqual(query.first { $0.name == "canceled" }?.value, "true")
        XCTAssertEqual(query.first { $0.name == "limit" }?.value, "10")
    }

    func testTheStatusIsReadAndSaysWhatTheListAndTheQuestionShow() throws {
        let scheduled = try Self.match("a", kickoff: now + 3600)
        XCTAssertNil(scheduled.status)
        XCTAssertFalse(scheduled.calledOff)
        XCTAssertNil(scheduled.statusWord)
        let canceled = try Self.match("b", kickoff: now + 3600, status: "cancelled")
        XCTAssertTrue(canceled.calledOff)
        XCTAssertEqual(canceled.statusWord, "Canceled")
        XCTAssertEqual(canceled.statusDetail, "This match was canceled")
        let postponed = try Self.match("c", kickoff: now + 3600, status: "postponed")
        XCTAssertEqual(postponed.statusWord, "Postponed")
        XCTAssertEqual(postponed.statusDetail, "This match was postponed")
    }

    func testACanceledMatchIsListedUntilItsKickoff() throws {
        let matches = [
            try Self.match("running", kickoff: now - 1800),
            try Self.match("gone", kickoff: now - 60, status: "cancelled"),
            try Self.match("canceled", kickoff: now + 600, status: "cancelled"),
            try Self.match("next", kickoff: now + 3600),
            try Self.match("postponed", kickoff: now + 7200, status: "postponed"),
        ]
        // A scheduled match keeps today's rules: listed even once it's kicked off. A canceled one goes at its kickoff.
        XCTAssertEqual(matches.listed(now: now).map(\.id), ["running", "canceled", "next", "postponed"])
        XCTAssertEqual(matches.listed(now: now + 600).map(\.id), ["running", "next", "postponed"], "gone at its kickoff")
        XCTAssertEqual(matches.listed(now: now + 7200).map(\.id), ["running", "next"])
    }

    func testOnlyScheduledMatchesAreComingUp() throws {
        let matches = [
            try Self.match("canceled", kickoff: now + 600, status: "cancelled"),
            try Self.match("next", kickoff: now + 3600),
            try Self.match("postponed", kickoff: now + 7200, status: "postponed"),
            try Self.match("later", kickoff: now + 86_400),
        ]
        // UI-15: the start menu's next match is the next scheduled one.
        XCTAssertEqual(matches.comingUp.map(\.id), ["next", "later"])
        XCTAssertEqual(matches.comingUp.first?.title, "STR v ROV next")
        XCTAssertTrue([try Self.match("x", kickoff: now + 60, status: "postponed")].comingUp.isEmpty)
        // UI-15: the start menu's line counts them, gives way to the last sync's problem, and says how to get matches unlinked.
        XCTAssertEqual(matches.summary(linked: true, problem: nil), "2 coming up")
        XCTAssertEqual([try Self.match("x", kickoff: now + 60, status: "postponed")].summary(linked: true, problem: nil), "None yet")
        XCTAssertEqual(matches.summary(linked: true, problem: "Can't reach the server"), "Can't reach the server")
        XCTAssertEqual(matches.summary(linked: false, problem: nil), "Link to sync")
    }

    func testStartingACanceledMatchIsAMatchLikeAnyOther() throws {
        let canceled = try Self.match("b", kickoff: now + 3600, status: "cancelled")
        let scheduled = try Self.match("b", kickoff: now + 3600)
        XCTAssertEqual(canceled.setup.matchId, "b")
        XCTAssertTrue(canceled.setup.sameFormat(as: scheduled.setup))
        XCTAssertEqual(canceled.setup.homeName, scheduled.setup.homeName)
    }
}
