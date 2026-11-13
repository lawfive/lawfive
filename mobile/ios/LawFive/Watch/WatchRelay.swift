import Foundation
import Observation

// The Garmin watch through the phone (IOS-9, as APP-7 and Android's WatchRelay.kt): the watch's sync
// requests arrive as messages and go to the server from here, with the watch's own token, so the
// server sees the watch as it always has. Without signal (at the ground) what the watch sends waits
// in an outbox here and the watch is told 202 (kept); it asks for its next matches and gets the ones
// fetched last, with fees it marked since. The outbox goes, oldest first, as soon as there's signal.

struct RelayWatch: Codable, Equatable {
    var token: String
    var device: String
    var server: String
    /// The last answer to GET /v1/watch/matches, for when there's no signal.
    var matches: JSONValue?
    var fetchedAt: Int64 = 0
    var seenAt: Int64 = 0
}

struct RelayItem: Codable, Equatable {
    let token: String
    let device: String
    let server: String
    let path: String
    let body: JSONValue
    let at: Int64
}

/// What the relay keeps between runs: the watches it has heard from and what waits to go.
struct RelayState: Codable, Equatable {
    var watches: [RelayWatch] = []
    var outbox: [RelayItem] = []
}

/// A request on the watch's behalf: its status and answer, or nil when the server couldn't be reached.
protocol WatchTransport {
    func send(server: String, method: String, path: String, body: JSONValue?, token: String, device: String) async -> (Int, JSONValue?)?
}

@MainActor
@Observable
final class WatchRelay {
    static let matchesPath = "/v1/watch/matches"
    /// As the watch asks (its Sync.MAX_MATCHES).
    static let maxMatches = 10
    static let maxWatches = 5
    /// The watch's Phone.KEPT: kept here until there's signal.
    static let kept = 202
    /// No signal and nothing fetched before: the watch shows "Couldn't reach server".
    static let noSignal = -2

    private(set) var state: RelayState
    /// What the sync screen shows of the watch's matches and tracks (APP-16).
    @ObservationIgnored weak var activity: SyncActivity?
    @ObservationIgnored private let file: URL?
    @ObservationIgnored private let transport: WatchTransport
    /// The server the phone is signed in to, or nil when signed out.
    @ObservationIgnored private let phoneServer: () -> String?
    @ObservationIgnored private let now: () -> Int64
    /// One send at a time (the watch's requests and the phone's sync), so nothing goes twice or out of order.
    @ObservationIgnored private var sendingTail: Task<Void, Never>?

    init(file: URL?, transport: WatchTransport, phoneServer: @escaping () -> String?, now: @escaping () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }) {
        self.file = file
        self.transport = transport
        self.phoneServer = phoneServer
        self.now = now
        state = file.flatMap { try? Data(contentsOf: $0) }.flatMap { try? jsonDecoder.decode(RelayState.self, from: $0) } ?? RelayState()
    }

    /// The same server, the hosted service's two addresses (its API and its web app) being one.
    nonisolated static func same(_ a: String, _ b: String) -> Bool { canonical(a) == canonical(b) }

    private nonisolated static func canonical(_ url: String) -> String {
        var u = url.trimmingCharacters(in: .whitespaces).lowercased()
        while u.hasSuffix("/") { u.removeLast() }
        return u.replacingOccurrences(of: "https://app.lawfive.app", with: "https://api.lawfive.app")
    }

    /// The answer to one message from the watch, or nil when it isn't one of LawFive's.
    func handle(_ message: JSONValue) async -> JSONValue? {
        guard message["lawfive"]?.intValue == 1 else { return nil }
        let id = message["id"] ?? .null
        let server = message["server"]?.string
        let mine = server != nil && phoneServer().map { WatchRelay.same($0, server!) } == true
        switch message["kind"]?.string {
        // Signed in to another server (or not at all): the watch goes straight to its own.
        case "hello": return answer(id, mine ? 200 : 409)
        case "request": return mine ? await request(id, server!, message) : answer(id, 409)
        default: return nil
        }
    }

    private func request(_ id: JSONValue, _ server: String, _ message: JSONValue) async -> JSONValue {
        let method = message["method"]?.string ?? "GET"
        let path = message["path"]?.string ?? ""
        guard let token = message["token"]?.string else { return answer(id, 401) }
        let device = message["device"]?.string ?? "garmin"
        // Only the watch's own endpoints go through here, as on Android: no query, no dots, no other prefix.
        guard path.range(of: "^/v1/watch/[A-Za-z0-9-]+(/[A-Za-z0-9-]+)*$", options: .regularExpression) != nil else { return answer(id, 404) }
        let body = message["body"].flatMap { $0 == .null ? nil : $0 }
        remember(token, device, server)
        if method == "POST" { report(path, body, sent: false) }
        let result: (Int, JSONValue?)? = await oneAtATime { [self] in
            // What waits goes first, so a pitch never overtakes the match it's for.
            await sendWaiting(token) ? await transport.send(server: server, method: method, path: path, body: body, token: token, device: device) : nil
        }
        if let (code, data) = result {
            if method == "POST" { report(path, body, sent: true) }
            if method == "GET" && path == WatchRelay.matchesPath && code == 200 { cache(token, data) }
            if code == 401 { forget(token) }
            return answer(id, code, data)
        }
        if method == "POST" {
            report(path, body, sent: false, kept: true)
            update { $0.outbox.append(RelayItem(token: token, device: device, server: server, path: path, body: body ?? .object([:]), at: now())) }
            return answer(id, WatchRelay.kept)
        }
        if path == WatchRelay.matchesPath, let cached = state.watches.first(where: { $0.token == token })?.matches {
            return answer(id, 200, withQueuedFees(token, cached))
        }
        return answer(id, WatchRelay.noSignal)
    }

    /// Runs after whatever's sending now.
    private func oneAtATime<T: Sendable>(_ work: @escaping @MainActor () async -> T) async -> T {
        let before = sendingTail
        let task = Task { @MainActor in
            await before?.value
            return await work()
        }
        sendingTail = Task { @MainActor in _ = await task.value }
        return await task.value
    }

    /// Sends what waits for one watch (or every watch), oldest first. False when something is still
    /// waiting because the server couldn't be reached.
    private func sendWaiting(_ token: String? = nil) async -> Bool {
        while let next = state.outbox.first(where: { token == nil || $0.token == token }) {
            report(next.path, next.body, sent: false)
            guard let result = await transport.send(server: next.server, method: "POST", path: next.path, body: next.body, token: next.token, device: next.device) else { return false }
            // Server trouble: try again later.
            if result.0 >= 500 { return false }
            if result.0 == 401 {
                // The watch was unlinked: what it sent has nowhere to go.
                forget(next.token)
            } else {
                // Kept, or one the server won't take (as the watch drops those).
                report(next.path, next.body, sent: true)
                update { s in
                    if let i = s.outbox.firstIndex(of: next) { s.outbox.remove(at: i) }
                }
            }
        }
        return true
    }

    /// APP-16: a match or a piece of its track, as it goes. Fees, the pitch and the like are too small to mention.
    private func report(_ path: String, _ body: JSONValue?, sent: Bool, kept: Bool = false) {
        guard let b = body, let created = b["created"]?.intValue else { return }
        if path == "/v1/watch/records" {
            let home = b["homeName"]?.string ?? b["home"]?.string ?? "Home"
            let away = b["awayName"]?.string ?? b["away"]?.string ?? "Away"
            activity?.watchMatch(created: created, title: "\(home) v \(away)", sent: sent, kept: kept)
        } else if path == "/v1/watch/tracks", sent || kept, let index = b["index"]?.intValue, let count = b["count"]?.intValue {
            activity?.watchTrack(created: created, index: index, count: count, kept: kept)
        }
    }

    /// After the phone syncs: what waits goes, and each watch's next matches are fetched for later,
    /// marked as fetched ahead (SYNC-14's prefetch), so the server doesn't take them for being on the
    /// watch until the watch itself asks.
    func refresh() async {
        await oneAtATime { [self] in
            _ = await sendWaiting()
            guard let phone = phoneServer() else { return }
            for w in state.watches where WatchRelay.same(w.server, phone) {
                guard let result = await transport.send(server: w.server, method: "GET", path: WatchRelay.matchesPath, body: .object(["limit": .int(WatchRelay.maxMatches), "prefetch": .string("true")]), token: w.token, device: w.device) else { return }
                if result.0 == 200 { cache(w.token, result.1) }
                if result.0 == 401 { forget(w.token) }
            }
        }
    }

    /// Fee changes still waiting, on the matches answered from the last fetch (SYNC-11).
    private func withQueuedFees(_ token: String, _ matches: JSONValue) -> JSONValue {
        var paid: [String: Bool] = [:]
        for item in state.outbox where item.token == token && item.path == "/v1/watch/fee" {
            if let id = item.body["matchId"]?.string, let p = item.body["paid"]?.bool { paid[id] = p }
        }
        guard !paid.isEmpty, case .object(var root) = matches, case .array(let list)? = root["matches"] else { return matches }
        root["matches"] = .array(list.map { m in
            guard case .object(var match) = m, case .object(var fee)? = match["fee"], let id = match["id"]?.string, let change = paid[id] else { return m }
            fee["paid"] = .bool(change)
            match["fee"] = .object(fee)
            return .object(match)
        })
        return .object(root)
    }

    private func remember(_ token: String, _ device: String, _ server: String) {
        update { s in
            var watch = s.watches.first { $0.token == token } ?? RelayWatch(token: token, device: device, server: server)
            watch.device = device
            watch.server = server
            watch.seenAt = now()
            s.watches = [watch] + s.watches.filter { $0.token != token }.prefix(WatchRelay.maxWatches - 1)
        }
    }

    private func cache(_ token: String, _ data: JSONValue?) {
        update { s in
            for i in s.watches.indices where s.watches[i].token == token {
                s.watches[i].matches = data
                s.watches[i].fetchedAt = now()
            }
        }
    }

    /// APP-21: the account's gone, so what its watches left here has nowhere to go.
    func forgetEverything() {
        update { $0 = RelayState() }
    }

    private func forget(_ token: String) {
        update { s in
            s.watches.removeAll { $0.token == token }
            s.outbox.removeAll { $0.token == token }
        }
    }

    private func update(_ change: (inout RelayState) -> Void) {
        change(&state)
        guard let file else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        // The watch's token is in here, so it stays on this device and out of backups (SEC-5).
        try? jsonEncoder.encode(state).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var resource = file
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? resource.setResourceValues(values)
    }

    private func answer(_ id: JSONValue, _ code: Int, _ data: JSONValue? = nil) -> JSONValue {
        var out: [String: JSONValue] = ["lawfive": .int(1), "id": id, "code": .int(code)]
        if let data { out["data"] = data }
        return .object(out)
    }
}

extension JSONValue {
    /// A whole number, as the watch's ids and times are.
    var intValue: Int? {
        switch self {
        case .int(let n): return n
        case .double(let n) where n == n.rounded() && abs(n) < 9e15: return Int(n)
        default: return nil
        }
    }
}

/// A message from the watch (as the Connect IQ SDK gives it: NSDictionary, NSArray, NSNumber, NSString) as JSON.
func watchValueToJson(_ value: Any?) -> JSONValue {
    switch value {
    case nil, is NSNull: return .null
    case let v as NSNumber:
        // A Bool comes as an NSNumber too.
        if CFGetTypeID(v) == CFBooleanGetTypeID() { return .bool(v.boolValue) }
        if CFNumberIsFloatType(v) { return .double(v.doubleValue) }
        return .int(v.intValue)
    case let v as String: return .string(v)
    case let v as [Any?]: return .array(v.map(watchValueToJson))
    case let v as NSDictionary:
        var out: [String: JSONValue] = [:]
        for (k, x) in v { out["\(k)"] = watchValueToJson(x) }
        return .object(out)
    default: return .string("\(value!)")
    }
}

/// JSON as values the SDK sends to the watch: whole numbers as integers (Monkey C's Number) when they fit.
func jsonToWatchValue(_ value: JSONValue) -> Any {
    switch value {
    case .null: return NSNull()
    case .bool(let v): return NSNumber(value: v)
    case .string(let v): return v
    case .array(let v): return v.map(jsonToWatchValue)
    case .object(let v): return v.mapValues(jsonToWatchValue)
    case .int(let v):
        return abs(v) <= Int(Int32.max) ? NSNumber(value: Int32(v)) : NSNumber(value: Int64(v))
    case .double(let v):
        return NSNumber(value: v)
    }
}
