import XCTest
@testable import LawFive

// The data layer's rules (IOS-3, as Android's DataTest): what a save keeps, how a conflict merges,
// and reading what a newer server sends. Uses the schema's own example files (schema/examples).

final class DataTests: XCTestCase {
    private func example(_ name: String) throws -> JSONValue {
        var dir = URL(fileURLWithPath: #filePath)
        while dir.path != "/" {
            dir.deleteLastPathComponent()
            let file = dir.appendingPathComponent("schema/examples/\(name)")
            if FileManager.default.fileExists(atPath: file.path) { return try jsonDecoder.decode(JSONValue.self, from: Data(contentsOf: file)) }
        }
        throw CocoaError(.fileNoSuchFile)
    }

    private func adding(_ value: JSONValue, _ key: String, _ field: JSONValue) -> JSONValue {
        var fields = value.object ?? [:]
        fields[key] = field
        return .object(fields)
    }

    func testTheExampleRecordsReadAsTheGeneratedTypes() throws {
        let match: Match = try example("Match.planned.json").decoded()
        XCTAssertEqual(match.home.name, "Strikers U12")
        let record: MatchRecord = try example("MatchRecord.full-match.json").decoded()
        XCTAssertTrue(record.events.contains { if case .goal = $0 { return true } else { return false } })
    }

    func testAFieldOrEventKindFromANewerServerDoesNotStopARecordBeingRead() throws {
        let newer = adding(try example("MatchRecord.full-match.json"), "somethingNew", .bool(true))
        let record: MatchRecord = try newer.decoded()
        XCTAssertFalse(record.events.isEmpty)
        let unknown: Event = try JSONValue(text: #"{"type":"varReview","when":"play"}"#).decoded()
        guard case .unknown = unknown else { return XCTFail("a kind this app doesn't know") }
        XCTAssertEqual(unknown.type, "varReview")
    }

    func testAllEveryExampleEventKeepsItsJSONWhenWritten() throws {
        let raw = try example("MatchRecord.full-match.json")
        let record: MatchRecord = try raw.decoded()
        XCTAssertEqual(try JSONValue(encoding: record)["events"]?.array?.count, raw["events"]?.array?.count)
    }

    func testSavingKeepsFieldsThisAppDoesNotKnow() throws {
        let raw = adding(try example("Match.planned.json"), "fromTheFuture", .string("kept"))
        var match: Match = try raw.decoded()
        match.notes = nil
        match.ageGroup = "U13"
        let saved = try Records.patched(raw, match)
        XCTAssertEqual(saved["fromTheFuture"], .string("kept"))
        XCTAssertEqual(saved["ageGroup"], .string("U13"))
        XCTAssertNil(saved["notes"], "a field cleared on the phone is cleared")
    }

    func testAConflictPutsThePhonesChangedFieldsOnTopOfTheNewerCopy() {
        let base: JSONValue = .object(["version": .int(2), "notes": .string("old"), "role": .string("referee"), "ageGroup": .string("U12")])
        let phone: JSONValue = .object(["version": .int(2), "notes": .string("old"), "role": .string("ar1")])
        let server: JSONValue = .object(["version": .int(3), "notes": .string("changed on the website"), "role": .string("referee"), "ageGroup": .string("U12")])
        let merged = SyncEngine.merge(base: base, local: phone, current: server)
        XCTAssertEqual(merged["role"], .string("ar1"))
        XCTAssertEqual(merged["notes"], .string("changed on the website"))
        XCTAssertNil(merged["ageGroup"], "removed on the phone")
        XCTAssertEqual(merged["version"], .int(3))
    }

    func testNamesAndShortNamesAsTheWebAppMakesThem() {
        XCTAssertEqual(initials("84-Van Der Wal, Travis (REG)"), "TV")
        XCTAssertEqual(initials("Sam Rivera"), "SR")
        XCTAssertEqual(teamAlias(Team(name: "Strikers U12"), other: Team(name: "Rovers U12"), home: true), "STR")
        XCTAssertEqual(teamAlias(Team(), other: Team(), home: false), "AWY")
    }

    /// SET-5: the shared cases (schema/short-names.json, here as ShortNameCases.swift), which the server,
    /// the website and Android run too.
    func testShortNamesAsEveryCopyMakesThem() throws {
        struct Case: Decodable { let name: String; let home: Team; let away: Team; let shown: [String] }
        struct Cases: Decodable { let cases: [Case] }
        let cases = try JSONDecoder().decode(Cases.self, from: Data(shortNameCasesJSON.utf8)).cases
        XCTAssertGreaterThan(cases.count, 10)
        for c in cases {
            XCTAssertEqual([teamAlias(c.home, other: c.away, home: true), teamAlias(c.away, other: c.home, home: false)], c.shown, c.name)
        }
    }

    func testTheOutboxAndRecordsSurviveInTheDatabase() async {
        let db = Db(file: nil)
        await db.upsert([RecordRow(collection: "matches", id: "a", json: "{}", version: 2, deleted: false), RecordRow(collection: "matches", id: "b", json: "{}", version: 1, deleted: true)])
        let live = await db.all("matches")
        XCTAssertEqual(live.map(\.id), ["a"], "a deleted one isn't listed")
        await db.upsertOutbox(OutboxRow(collection: "matches", id: "a", op: "put", json: "{}", base: nil, createdAt: 1))
        let keys = await db.pendingKeys()
        XCTAssertEqual(keys, ["matches/a"])
        let row = await db.pending("matches", "a")
        await db.removeOutbox(row!.seq)
        let count = await db.outboxCount()
        XCTAssertEqual(count, 0)
    }

    func testMatchMinutesAsTheWebShowsThem() {
        XCTAssertEqual(matchMinute(defaultFormat, period: 1, periodSec: 22 * 60), "23'")
        XCTAssertEqual(matchMinute(defaultFormat, period: 1, periodSec: 46 * 60 + 10), "45+2'")
        XCTAssertEqual(matchMinute(defaultFormat, period: 2, periodSec: 0), "46'")
        // TMR-15: a stopping clock has no added time, so an event at its length is in its last minute.
        var stops = defaultFormat
        stops.stoppingClock = true
        XCTAssertEqual(matchMinute(stops, period: 1, periodSec: 45 * 60), "45'")
        XCTAssertEqual(matchMinute(stops, period: 2, periodSec: 45 * 60), "90'")
    }

    // FILE-7, as the website's.
    func testStorageWords() {
        let mb = 1_048_576.0
        XCTAssertEqual(storageSize(6 * mb), "6 MB")
        XCTAssertEqual(storageSize(5.86 * mb), "5.9 MB")
        XCTAssertEqual(storageSize(120 * mb), "120 MB")
        XCTAssertEqual(storageSize(1536 * mb), "1.5 GB")
        let nearly = StorageUse(usedBytes: 5.86 * mb, limitBytes: 6 * mb)
        XCTAssertTrue(nearly.nearlyFull)
        XCTAssertFalse(nearly.full)
        XCTAssertEqual(storageUsedLine(nearly), "5.9 MB of 6 MB used")
        XCTAssertEqual(noRoomTitle(3), "3 photos didn't fit.")
        XCTAssertEqual(noRoomText(nearly, admin: true), "You've used 5.9 MB of 6 MB. Delete some photos or tracks to make room.")
        XCTAssertTrue(noRoomText(nearly, admin: false).hasSuffix("or ask an admin of this server for more."))
        XCTAssertFalse(StorageUse(usedBytes: 100 * mb, limitBytes: nil).nearlyFull)
    }

    func testOnlyLawFivesOwnAnswersCount() throws {
        // APP-23: Traefik's 404 while the server restarts isn't the server saying the record has gone.
        let url = URL(string: "https://lawfive.example.com/v1/venues/1")!
        let traefik = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: ["Content-Type": "text/plain; charset=utf-8"]))
        XCTAssertFalse(ServerError.isLawFive(traefik, Data("404 page not found".utf8)))
        let lawFive = try XCTUnwrap(HTTPURLResponse(url: url, statusCode: 404, httpVersion: nil, headerFields: ["LawFive-Version": "2026.11.2"]))
        XCTAssertTrue(ServerError.isLawFive(lawFive, Data()))
        // A server from before the header, known by its JSON error.
        XCTAssertTrue(ServerError.isLawFive(traefik, Data(#"{"error":"not found"}"#.utf8)))
    }
}
