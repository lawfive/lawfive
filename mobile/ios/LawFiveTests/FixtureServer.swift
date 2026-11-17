import Foundation
@testable import LawFive

// A server for the snapshot tests: the API's answers from the fixtures, so the screens fetch what
// they fetch (the weather, a match's track, Stats, Get ready's lists) through the app's own Api and
// stores, with no network. Writes, and anything the fixtures don't hold, get the server's 404.

final class FixtureServer: URLProtocol {
    /// The server's address for an account; its answers are that account's. With `push`, it offers
    /// notifications from the server as the hosted one does (PUSH-5, NOTE-4), under /push.
    static func address(_ account: Fixtures.Account, push: Bool = false) -> String { "https://\(account.rawValue).fixtures.invalid" + (push ? "/push" : "") }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let account = Fixtures.Account.allCases.first { url.host == "\($0.rawValue).fixtures.invalid" } ?? .demo
        let push = url.path.hasPrefix("/push/")
        let query = Dictionary((URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let (status, body) = FixtureServer.answer(request.httpMethod ?? "GET", push ? String(url.path.dropFirst(5)) : url.path, account: account, push: push, query: query)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json", "LawFive-Version": "fixtures"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    private static let missing = (404, json(["error": "Not in the fixtures"]))

    /// Every file of the account's (the demo's three lists, FILE-6), as the API gives them.
    static func files(_ account: Fixtures.Account) -> [[String: Any]] {
        guard account == .demo else { return [] }
        return ["venue", "competition", "match"].flatMap { kind -> [[String: Any]] in
            guard let data = try? Fixtures.data(account, "files-\(kind).json"), let list = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
            return list["attachments"] as? [[String: Any]] ?? []
        }
    }

    static func answer(_ method: String, _ path: String, account: Fixtures.Account, push: Bool = false, query: [String: String] = [:]) -> (Int, Data) {
        guard method == "GET" else { return missing }
        let file = { (name: String) in (try? Fixtures.data(account, name)).map { (200, $0) } ?? missing }
        switch path {
        case "/v1/meta":
            // As the demo server's (server/src/app.ts), with its weather.
            var meta: [String: Any] = ["product": "LawFive", "apiVersion": 1, "capabilities": [
                "accounts", "records", "quiz", "changes", "tracks", "stats", "devices", "link", "watch", "people", "invites",
                "calendar", "import", "merging", "plans", "assignor-calendars", "weather", "attachments", "files",
            ] + (push ? ["push", "notices"] : [])]
            // Whole, maps too, so the app reads what it offers (GET /v1/meta as ServerMeta) for notifications' switches.
            if push { meta["maps"] = ["tileUrl": "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "attribution": "OpenStreetMap"] }
            return (200, json(meta))
        case "/v1/changes": return file("changes.json")
        case "/v1/stats": return file("stats.json")
        case "/v1/weather": return file("weather.json")
        // The account's linked watches and what's on them (SYNC-14): the demo's Venu 2; a new account has none.
        case "/v1/devices", "/v1/devices/matches":
            guard account == .demo else { return (200, json([path.hasSuffix("matches") ? "matches" : "devices": []])) }
            return file(path.hasSuffix("matches") ? "devices-matches.json" : "devices.json")
        case "/v1/assignor-calendars": return (200, json(["calendars": []]))
        // FILE-6: a record's files with kind=file (or all); no photos (the fixtures have none).
        case "/v1/attachments":
            let found = query["kind"] == "file" || query["kind"] == "all"
                ? files(account).filter { $0["recordType"] as? String == query["recordType"] && (query["recordId"] == nil || $0["recordId"] as? String == query["recordId"]) } : []
            return (200, json(["attachments": found]))
        default:
            break
        }
        if path.hasPrefix("/v1/weather/") {
            let id = String(path.dropFirst("/v1/weather/".count))
            guard let data = try? Fixtures.data(account, "weather.json"),
                  let items = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let item = (items["items"] as? [[String: Any]])?.first(where: { $0["matchId"] as? String == id }) else { return missing }
            return (200, json(item))
        }
        // A file's bytes, as long as it says, for keeping (FILE-13); its contents aren't drawn.
        if path.hasPrefix("/v1/attachments/"), path.hasSuffix("/file"), let f = files(account).first(where: { $0["url"] as? String == path }), let size = f["size"] as? Int {
            return (200, Data(repeating: UInt8(ascii: "x"), count: size))
        }
        if account == .demo, path == "/v1/match-records/\(Fixtures.index.demo.trackRecord)/track" {
            return file("track.json")
        }
        return missing
    }
}
