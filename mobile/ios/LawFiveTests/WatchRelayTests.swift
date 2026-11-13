import ConnectIQ
import XCTest
@testable import LawFive

// IOS-9, as Android's WatchRelayTest: the same messages, with and without signal.
@MainActor
final class WatchRelayTests: XCTestCase {
    private let server = "https://lawfive.example"

    private final class FakeServer: WatchTransport, @unchecked Sendable {
        var online = true
        var sent: [String] = []
        /// What each request carried: a GET's query, else its body.
        var bodies: [JSONValue?] = []
        var matches: JSONValue = .object(["matches": .array([.object(["id": .string("m1"), "fee": .object(["text": .string("$25"), "paid": .bool(false)])])])])

        func send(server: String, method: String, path: String, body: JSONValue?, token: String, device: String) async -> (Int, JSONValue?)? {
            guard online else { return nil }
            sent.append("\(method) \(path)")
            bodies.append(body)
            return method == "GET" ? (200, matches) : (200, .object([:]))
        }
    }

    private func message(_ id: Int, _ kind: String, _ path: String? = nil, method: String = "POST", body: JSONValue? = nil, server: String? = nil) -> JSONValue {
        var out: [String: JSONValue] = ["lawfive": .int(1), "id": .int(id), "kind": .string(kind), "server": .string(server ?? self.server)]
        if let path {
            out["method"] = .string(method)
            out["path"] = .string(path)
            out["token"] = .string("watch-token")
            out["device"] = .string("garmin; model=006-B3703-00")
            if let body { out["body"] = body }
        }
        return .object(out)
    }

    private func code(_ answer: JSONValue?) -> Int? { answer?["code"]?.intValue }

    func testHelloSaysWhetherThePhoneIsOnTheWatchsServer() async {
        let relay = WatchRelay(file: nil, transport: FakeServer(), phoneServer: { [server] in server })
        let a = await relay.handle(message(1, "hello"))
        XCTAssertEqual(code(a), 200)
        let b = await relay.handle(message(2, "hello", server: "https://other.example"))
        XCTAssertEqual(code(b), 409)
        let c = await WatchRelay(file: nil, transport: FakeServer(), phoneServer: { nil }).handle(message(3, "hello"))
        XCTAssertEqual(code(c), 409)
        let d = await WatchRelay(file: nil, transport: FakeServer(), phoneServer: { "https://app.lawfive.app" }).handle(message(4, "hello", server: "https://api.lawfive.app/"))
        XCTAssertEqual(code(d), 200, "the hosted service's web address is the same server as its API")
        let none = await relay.handle(.object(["id": .int(5)]))
        XCTAssertNil(none)
    }

    func testThePhonesFetchAheadSaysSoAndTheWatchsOwnDoesnt() async {
        let fake = FakeServer()
        let relay = WatchRelay(file: nil, transport: fake, phoneServer: { [server] in server })
        _ = await relay.handle(message(1, "request", "/v1/watch/matches", method: "GET", body: .object(["limit": .int(10)])))
        await relay.refresh()
        // SYNC-14: only the watch's own download counts as the matches being on it.
        XCTAssertEqual(fake.sent, ["GET /v1/watch/matches", "GET /v1/watch/matches"])
        XCTAssertNil(fake.bodies[0]?["prefetch"])
        XCTAssertEqual(fake.bodies[1]?["prefetch"]?.string, "true")
    }

    func testWithSignalRequestsGoToTheServer() async {
        let fake = FakeServer()
        let relay = WatchRelay(file: nil, transport: fake, phoneServer: { [server] in server })
        let answer = await relay.handle(message(1, "request", "/v1/watch/matches", method: "GET", body: .object(["limit": .int(10)])))
        XCTAssertEqual(code(answer), 200)
        XCTAssertEqual(fake.sent, ["GET /v1/watch/matches"])
        XCTAssertNotNil(relay.state.watches.first?.matches)
        let other = await relay.handle(message(2, "request", "/v1/records/matches", method: "GET"))
        XCTAssertEqual(code(other), 404, "only the watch's own endpoints")
    }

    func testWithoutSignalWhatTheWatchSendsIsKeptAndGoesFirst() async {
        let fake = FakeServer()
        let relay = WatchRelay(file: nil, transport: fake, phoneServer: { [server] in server })
        _ = await relay.handle(message(1, "request", "/v1/watch/matches", method: "GET"))
        fake.online = false
        let record = await relay.handle(message(2, "request", "/v1/watch/records", body: .object(["created": .int(1)])))
        XCTAssertEqual(code(record), 202)
        let fee = await relay.handle(message(3, "request", "/v1/watch/fee", body: .object(["matchId": .string("m1"), "paid": .bool(true)])))
        XCTAssertEqual(code(fee), 202)
        XCTAssertEqual(relay.state.outbox.count, 2)
        let matches = await relay.handle(message(4, "request", "/v1/watch/matches", method: "GET"))
        XCTAssertEqual(code(matches), 200, "from the last fetch")
        if case .array(let list)? = matches?["data"]?["matches"] {
            XCTAssertEqual(list[0]["fee"]?["paid"]?.bool, true, "with the fee marked since")
        } else { XCTFail("no matches") }
        fake.online = true
        fake.sent = []
        _ = await relay.handle(message(5, "request", "/v1/watch/pitch", body: .object([:])))
        XCTAssertEqual(fake.sent, ["POST /v1/watch/records", "POST /v1/watch/fee", "POST /v1/watch/pitch"])
        XCTAssertTrue(relay.state.outbox.isEmpty)
    }

    func testThePhonesSyncSendsWhatWaitsAndFetchesTheNextMatches() async {
        let fake = FakeServer()
        let relay = WatchRelay(file: nil, transport: fake, phoneServer: { [server] in server })
        fake.online = false
        _ = await relay.handle(message(1, "request", "/v1/watch/fee", body: .object(["matchId": .string("m1"), "paid": .bool(true)])))
        fake.online = true
        await relay.refresh()
        XCTAssertEqual(fake.sent, ["POST /v1/watch/fee", "GET /v1/watch/matches"])
        XCTAssertTrue(relay.state.outbox.isEmpty)
        XCTAssertGreaterThan(relay.state.watches.first?.fetchedAt ?? 0, 0)
    }

    func testWithoutSignalOrAFetchBeforeTheWatchHearsSo() async {
        let fake = FakeServer()
        fake.online = false
        let answer = await WatchRelay(file: nil, transport: fake, phoneServer: { [server] in server }).handle(message(1, "request", "/v1/watch/matches", method: "GET"))
        XCTAssertEqual(code(answer), WatchRelay.noSignal)
    }

    func testMessagesConvertBetweenTheSDKsValuesAndJSON() {
        let fromWatch: NSDictionary = ["id": NSNumber(value: 3), "flag": NSNumber(value: true), "x": NSNumber(value: 1.5), "body": ["created": NSNumber(value: 1_780_000_000), "corners": [[NSNumber(value: 37_512_345), NSNull()]]]]
        let json = watchValueToJson(fromWatch)
        XCTAssertEqual(json["id"], .int(3))
        XCTAssertEqual(json["flag"], .bool(true))
        XCTAssertEqual(json["x"], .double(1.5))
        XCTAssertEqual(json["body"]?["created"], .int(1_780_000_000))
        let back = jsonToWatchValue(.object(["big": .int(5_000_000_000), "small": .int(7), "yes": .bool(true), "none": .null])) as? [String: Any]
        XCTAssertEqual((back?["small"] as? NSNumber)?.int32Value, 7)
        XCTAssertEqual((back?["big"] as? NSNumber)?.int64Value, 5_000_000_000)
        XCTAssertTrue(back?["none"] is NSNull)
    }
}

// IOS-9: Garmin's SDK uses Bluetooth, so it stays off until someone has shared a watch.
@MainActor
final class WatchBridgeTests: XCTestCase {
    private func bridge() -> WatchBridge {
        WatchBridge(api: Api(session: SessionStore(defaults: UserDefaults(suiteName: "WatchBridgeTests")!))) { nil }
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: WatchBridge.savedKey)
    }

    func testNoSharedWatchKeepsTheSDKOff() {
        UserDefaults.standard.removeObject(forKey: WatchBridge.savedKey)
        let bridge = bridge()
        bridge.start()
        XCTAssertFalse(bridge.sdkStarted)
    }

    func testAnEmptyListKeepsTheSDKOff() throws {
        UserDefaults.standard.set(try NSKeyedArchiver.archivedData(withRootObject: [IQDevice](), requiringSecureCoding: true), forKey: WatchBridge.savedKey)
        let bridge = bridge()
        bridge.start()
        XCTAssertFalse(bridge.sdkStarted)
    }

    func testASharedWatchStartsTheSDK() throws {
        let watch = IQDevice(id: UUID(), modelName: "venu2", friendlyName: "Venu 2")!
        UserDefaults.standard.set(try NSKeyedArchiver.archivedData(withRootObject: [watch], requiringSecureCoding: true), forKey: WatchBridge.savedKey)
        let bridge = bridge()
        bridge.start()
        XCTAssertTrue(bridge.sdkStarted)
        XCTAssertEqual(bridge.watches.map(\.name), ["Venu 2"])
    }
}
