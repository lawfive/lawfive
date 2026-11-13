import Foundation
@testable import LawFive

// A server for the snapshot tests: the API's answers from the fixtures, so the screens fetch what
// they fetch (the weather, a match's track, Stats, Get ready's lists) through the app's own Api and
// stores, with no network. Writes, and anything the fixtures don't hold, get the server's 404.

final class FixtureServer: URLProtocol {
    /// The server's address for an account; its answers are that account's.
    static func address(_ account: Fixtures.Account) -> String { "https://\(account.rawValue).fixtures.invalid" }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let account = Fixtures.Account.allCases.first { url.host == "\($0.rawValue).fixtures.invalid" } ?? .demo
        let (status, body) = FixtureServer.answer(request.httpMethod ?? "GET", url.path, account: account)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "application/json", "LawFive-Version": "fixtures"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

    private static func json(_ value: Any) -> Data { try! JSONSerialization.data(withJSONObject: value) }
    private static let missing = (404, json(["error": "Not in the fixtures"]))

    static func answer(_ method: String, _ path: String, account: Fixtures.Account) -> (Int, Data) {
        guard method == "GET" else { return missing }
        let file = { (name: String) in (try? Fixtures.data(account, name)).map { (200, $0) } ?? missing }
        switch path {
        case "/v1/meta":
            // As the demo server's (server/src/app.ts), with its weather.
            return (200, json(["product": "LawFive", "apiVersion": 1, "capabilities": [
                "accounts", "records", "quiz", "changes", "tracks", "stats", "devices", "link", "watch", "people", "invites",
                "calendar", "import", "merging", "plans", "assignor-calendars", "weather",
            ]]))
        case "/v1/changes": return file("changes.json")
        case "/v1/stats": return file("stats.json")
        case "/v1/weather": return file("weather.json")
        // The account's linked watches and what's on them (SYNC-14): the demo's Venu 2; a new account has none.
        case "/v1/devices", "/v1/devices/matches":
            guard account == .demo else { return (200, json([path.hasSuffix("matches") ? "matches" : "devices": []])) }
            return file(path.hasSuffix("matches") ? "devices-matches.json" : "devices.json")
        case "/v1/assignor-calendars": return (200, json(["calendars": []]))
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
        if account == .demo, path == "/v1/match-records/\(Fixtures.index.demo.trackRecord)/track" {
            return file("track.json")
        }
        return missing
    }
}
