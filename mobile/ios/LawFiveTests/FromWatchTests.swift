import XCTest
@testable import LawFive

// APP-26, as Android's FromWatchTest: which synced match reports count as come in from a watch, how
// the summary counts goals and cards, and that the waiting ones are kept until it closes.

@MainActor
final class FromWatchTests: XCTestCase {
    private func change(_ id: String, collection: String = "match-records", device: String? = "apple:watch", deleted: Bool = false) -> JSONValue {
        var record: [String: JSONValue] = ["id": .string(id), "version": .int(1)]
        if let device { record["device"] = .string(device) }
        if deleted { record["deletedAt"] = .string("2026-11-06T10:00:00Z") }
        return .object(["collection": .string(collection), "record": .object(record)])
    }

    func testANewPlayedMatchFromAWatchCounts() {
        XCTAssertEqual(SyncEngine.fromWatch([change("r1"), change("r2", device: "garmin:venu2")], first: false, known: []), ["r1", "r2"])
    }

    func testNotOnTheFirstSyncAfterSigningIn() {
        XCTAssertEqual(SyncEngine.fromWatch([change("r1")], first: true, known: []), [])
    }

    func testNotOneThePhoneAlreadyHad() {
        // A watch sending a match again (RES-4), or a result corrected on the phone.
        XCTAssertEqual(SyncEngine.fromWatch([change("r1"), change("r2")], first: false, known: ["r1"]), ["r2"])
    }

    func testNotADeletedOne() {
        XCTAssertEqual(SyncEngine.fromWatch([change("r1", deleted: true)], first: false, known: []), [])
        let restored: JSONValue = .object(["collection": .string("match-records"), "record": .object(["id": .string("r2"), "device": .string("apple:watch"), "deletedAt": .null])])
        XCTAssertEqual(SyncEngine.fromWatch([restored], first: false, known: []), ["r2"])
    }

    func testNotAResultEnteredWithoutAWatch() {
        XCTAssertEqual(SyncEngine.fromWatch([change("r1", device: nil), change("r2", device: "")], first: false, known: []), [])
    }

    func testOnlyMatchReports() {
        XCTAssertEqual(SyncEngine.fromWatch([change("m1", collection: "matches")], first: false, known: []), [])
    }

    private func record(score: (Int, Int), events: [String]) throws -> MatchRecord {
        let list = events.map { #"{"type":"\#($0)","when":"play","period":1,"periodSec":60,"team":"home","offender":{"kind":"player","number":4},"lengthSec":600}"# }
        let json = #"{"id":"r1","version":1,"updatedAt":"2026-11-06T10:00:00Z","outcome":"completed","periods":[{"period":1,"extraTime":false,"playedSec":2700},{"period":2,"extraTime":false,"playedSec":2950}],"score":{"home":\#(score.0),"away":\#(score.1)},"events":[\#(list.joined(separator: ","))]}"#
        return try JSONValue(text: json).decoded()
    }

    func testGoalsAndCardsCounted() throws {
        XCTAssertEqual(describeCards(try record(score: (3, 1), events: ["caution", "caution", "sendOff"])), "4 goals · 2 cautions · 1 send-off")
        XCTAssertEqual(describeCards(try record(score: (1, 0), events: ["caution"])), "1 goal · 1 caution")
        XCTAssertEqual(describeCards(try record(score: (0, 0), events: ["sendOff", "sendOff"])), "2 send-offs")
        XCTAssertEqual(describeCards(try record(score: (0, 0), events: [])), "No goals or cards")
        // A second caution is a caution and a send-off, as Stats count it.
        XCTAssertEqual(describeCards(try record(score: (2, 2), events: ["caution", "secondCaution"])), "4 goals · 2 cautions · 1 send-off")
        // EVT-12: a second sin bin is a sin bin and a send-off, as Stats count it.
        XCTAssertEqual(describeCards(try record(score: (1, 0), events: ["caution", "sinBin", "secondSinBin"])), "1 goal · 1 caution · 2 sin bins · 1 send-off")
    }

    func testTimePlayedInMinutes() throws {
        XCTAssertEqual(minutesPlayed(try record(score: (0, 0), events: [])), 94)
    }

    func testNewestFirst() throws {
        var older = try record(score: (0, 0), events: [])
        older.id = "old"
        older.periods[0].startedAt = "2026-11-01T10:00:00Z"
        older.matchId = "m-old"
        var newer = older
        newer.id = "new"
        newer.matchId = "m-new"
        newer.periods[0].startedAt = "2026-11-05T10:00:00Z"
        var early = older
        early.id = "early"
        early.matchId = "m-early"
        let match = { (id: String) -> Match in Match(id: id, version: 1, updatedAt: "2026-11-06T10:00:00Z", status: "played", format: defaultFormat, home: Team(), away: Team(), crew: []) }
        let shown = fromWatchMatches(["old", "new", "gone", "early"], records: [older, newer, early], matches: [match("m-old"), match("m-new")])
        XCTAssertEqual(shown.map(\.id), ["new", "old"], "newest first; only the ones the phone has, once their match is here too")
    }

    func testTheWaitingOnesAreKeptUntilTheSummaryCloses() {
        // The session's keychain is the app's own (the tests run in it): what's signed in there stays.
        let token = Keychain.read()
        defer { Keychain.write(token) }
        let suite = "FromWatchTests"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defaults.set(true, forKey: "installed")
        let session = SessionStore(defaults: defaults)
        session.cameFromWatch(["r1"])
        session.cameFromWatch(["r1", "r2"])
        XCTAssertEqual(session.fromWatch, ["r1", "r2"])
        // The app closed and opened again.
        XCTAssertEqual(SessionStore(defaults: defaults).fromWatch, ["r1", "r2"])
        session.shownFromWatch(["r1"])
        XCTAssertEqual(SessionStore(defaults: defaults).fromWatch, ["r2"], "one deleted before it was shown")
        session.shownFromWatch()
        XCTAssertEqual(SessionStore(defaults: defaults).fromWatch, [], "Done, or a match tapped")
        session.cameFromWatch(["r3"])
        session.signedOut()
        XCTAssertEqual(SessionStore(defaults: defaults).fromWatch, [], "signing out forgets them")
        defaults.removePersistentDomain(forName: suite)
    }

    func testThePullFindsThemBeforeStoringThePage() async {
        // The phone's database before the page: r1 is here already, so only r2 is new.
        let db = Db(file: nil)
        await db.upsert([RecordRow(collection: "match-records", id: "r1", json: "{}", version: 1, deleted: false)])
        let known = await SyncEngine.knownReports([change("r1"), change("r2"), change("r1", collection: "matches")], db: db)
        XCTAssertEqual(known, ["r1"])
        XCTAssertEqual(SyncEngine.fromWatch([change("r1"), change("r2")], first: false, known: known), ["r2"])
    }
}
