import XCTest
@testable import LawFive

// The shared sample data (schema/generated/fixtures, mobile/ios/README.md#snapshot-pictures): the demo account and
// a new one, as the API answers the phones, read from the repository beside this file so a run always
// has the current copy (`pnpm fixtures` in server/ remakes them). The snapshot tests draw from them;
// FixturesTests checks every file decodes with the app's own models and JSON settings.

enum Fixtures {
    /// schema/generated/fixtures, from this file's place in mobile/ios/LawFiveTests.
    static let folder = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "schema/generated/fixtures")

    enum Account: String, CaseIterable {
        case demo
        case newAccount = "new-account"
    }

    static func data(_ path: String) throws -> Data {
        try Data(contentsOf: folder.appending(path: path))
    }

    static func data(_ account: Account, _ file: String) throws -> Data {
        try data("\(account.rawValue)/\(file)")
    }

    /// index.json: the clock and time zone the screens need, the accounts, and the ids a screen wants.
    struct Index: Decodable {
        struct Person: Decodable {
            let name: String
            let email: String
        }

        struct Demo: Decodable {
            let matches: [String: String]
            let trackRecord: String
        }

        let now: String
        let timeZone: String
        let accounts: [String: Person]
        let demo: Demo

        var clock: Date { instantOf(now)! }
        var zone: TimeZone { TimeZone(identifier: timeZone)! }
        func person(_ account: Account) -> Person { accounts[account.rawValue]! }
    }

    static let index: Index = try! jsonDecoder.decode(Index.self, from: data("index.json"))

    /// track.json, as GET /v1/match-records/{id}/track answers.
    struct TrackAnswer: Decodable {
        let track: MatchTrack
        let summary: TrackSummary
        let pitch: PitchOutline
        let heat: Heat
        let updatedAt: String
    }

    struct WeatherAnswer: Decodable {
        let items: [MatchWeather]
    }

    /// Puts an account's records on the phone as the first sync does (`SyncEngine.rowOf` for each
    /// change), with where sync got to stamped at the fixtures' clock.
    @MainActor
    static func load(_ account: Account, into graph: AppGraph) async throws {
        let page = try jsonDecoder.decode(JSONValue.self, from: data(account, "changes.json"))
        let rows = (page["changes"]?.array ?? []).compactMap { change -> RecordRow? in
            guard let collection = change["collection"]?.string, let record = change["record"] else { return nil }
            return SyncEngine.rowOf(collection, record)
        }
        await graph.db.upsert(rows)
        await graph.records.reload()
        graph.session.synced(cursor: page["cursor"]?.int ?? 0, at: index.clock)
    }
}

@MainActor
final class FixturesTests: XCTestCase {
    func testTheIndexDecodesAndItsIdsAreInTheDemo() throws {
        let index = Fixtures.index
        XCTAssertEqual(index.zone.identifier, "America/Los_Angeles")
        XCTAssertEqual(index.clock, ISO8601DateFormatter().date(from: "2026-11-09T16:00:00Z"))
        XCTAssertEqual(Set(index.accounts.keys), Set(Fixtures.Account.allCases.map(\.rawValue)))
        let page = try jsonDecoder.decode(ChangesPage.self, from: Fixtures.data(.demo, "changes.json"))
        let ids = Set(page.changes.map { change -> String in
            switch change {
            case .matches(let c): return c.record.id
            case .matchRecords(let c): return c.record.id
            case .venues(let c): return c.record.id
            case .referees(let c): return c.record.id
            case .competitions(let c): return c.record.id
            case .matchTemplates(let c): return c.record.id
            case .settings(let c): return c.record.id
            case .unknown(let value): XCTFail("a change the app doesn't know: \(value["collection"]?.string ?? "")"); return ""
            }
        })
        for (name, id) in index.demo.matches { XCTAssertTrue(ids.contains(id), "\(name): \(id) isn't in demo/changes.json") }
        XCTAssertTrue(ids.contains(index.demo.trackRecord), "the track's match record")
    }

    func testEveryFileDecodesWithTheAppsModels() throws {
        for account in Fixtures.Account.allCases {
            XCTAssertNoThrow(try jsonDecoder.decode(ChangesPage.self, from: Fixtures.data(account, "changes.json")), "\(account)/changes.json")
            XCTAssertNoThrow(try jsonDecoder.decode(Stats.self, from: Fixtures.data(account, "stats.json")), "\(account)/stats.json")
            XCTAssertNoThrow(try jsonDecoder.decode(Fixtures.WeatherAnswer.self, from: Fixtures.data(account, "weather.json")), "\(account)/weather.json")
        }
        let track = try jsonDecoder.decode(Fixtures.TrackAnswer.self, from: Fixtures.data(.demo, "track.json"))
        XCTAssertNotNil(track.track.gps, "the track has positions")
        XCTAssertFalse(track.heat.total.isEmpty, "and a heatmap")
        // SYNC-14: the demo's linked Venu 2 and what's on it, as OnWatchStore reads them.
        let devices = try jsonDecoder.decode(JSONValue.self, from: Fixtures.data(.demo, "devices.json"))["devices"]?.array ?? []
        XCTAssertEqual(devices.compactMap { $0["name"]?.string }, ["Garmin Venu 2"], "the demo's linked watch")
        let onWatch = try jsonDecoder.decode(JSONValue.self, from: Fixtures.data(.demo, "devices-matches.json"))["matches"]?.decoded(as: [MatchOnWatch].self)
        XCTAssertFalse(onWatch?.isEmpty ?? true, "and the matches on it")
        let files = try FileManager.default.subpathsOfDirectory(atPath: Fixtures.folder.path).filter { $0.hasSuffix(".json") }.sorted()
        XCTAssertEqual(files, ["demo/changes.json", "demo/devices-matches.json", "demo/devices.json", "demo/stats.json", "demo/track.json", "demo/weather.json", "index.json",
                               "new-account/changes.json", "new-account/stats.json", "new-account/weather.json"],
                       "a new fixture file wants a decoding check here")
    }

    /// The way the phone stores and reads them (Records), not just the generated types: no record is dropped.
    func testEveryRecordReachesThePhonesRecords() async throws {
        let graph = AppGraph(defaults: UserDefaults(suiteName: "FixturesTests")!, dbFile: nil, folder: FileManager.default.temporaryDirectory)
        try await Fixtures.load(.demo, into: graph)
        let page = try jsonDecoder.decode(JSONValue.self, from: Fixtures.data(.demo, "changes.json"))
        var counts: [String: Int] = [:]
        for change in page["changes"]?.array ?? [] { counts[change["collection"]?.string ?? "", default: 0] += 1 }
        let r = graph.records
        XCTAssertEqual(r.matches?.count, counts[Collections.matches])
        XCTAssertEqual(r.matchRecords.count, counts[Collections.matchRecords])
        XCTAssertEqual(r.venues?.count, counts[Collections.venues])
        XCTAssertEqual(r.referees?.count, counts[Collections.referees])
        XCTAssertEqual(r.competitions?.count, counts[Collections.competitions])
        XCTAssertEqual(r.templates?.count, counts[Collections.templates])
        XCTAssertEqual(r.settings == nil ? 0 : 1, counts[Collections.settings])
    }
}
