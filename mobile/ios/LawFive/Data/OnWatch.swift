import Foundation
import Observation

// SYNC-14: which matches are on which of the account's watches (GET /v1/devices/matches), fetched
// at each sync with the watches linked (GET /v1/devices), and kept on the phone for when there's
// no signal at the ground, as Android's OnWatch.kt. A list the phone gives a Garmin watch without
// signal isn't known to the server until the watch's next online sync.

/// What's kept: the matches on watches, and the names of the account's linked watches at the last fetch (nil before one).
struct OnWatchSaved: Codable, Equatable, Sendable {
    var matches: [MatchOnWatch] = []
    var watches: [String]?
}

/// The kinds of device that are watches, as the server names them.
let watchKinds: Set<String> = ["garmin", "wearos", "applewatch"]

@MainActor
@Observable
final class OnWatchStore {
    private(set) var saved: OnWatchSaved
    @ObservationIgnored private let api: Api
    @ObservationIgnored private let file: URL

    init(api: Api, file: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("on-watch.json")) {
        self.api = api
        self.file = file
        saved = (try? Data(contentsOf: file)).flatMap { try? jsonDecoder.decode(OnWatchSaved.self, from: $0) } ?? OnWatchSaved()
    }

    /// After a sync: the server's latest; what was kept stays when it doesn't answer.
    func refresh() async {
        guard let devices = try? await api.call("GET", "/v1/devices")?["devices"]?.array else { return }
        let watches = devices.filter { watchKinds.contains($0["kind"]?.string ?? "") }.compactMap { $0["name"]?.string }
        // A server from before SYNC-14 has no such list: nothing is on a watch as far as it says.
        let matches = (try? await api.call("GET", "/v1/devices/matches")?["matches"]?.decoded(as: [MatchOnWatch].self)) ?? []
        saved = OnWatchSaved(matches: matches, watches: watches)
        if let data = try? jsonEncoder.encode(saved) { try? data.write(to: file, options: .atomic) }
    }

    /// Signed out: another account's watches have no place here.
    func clear() {
        saved = OnWatchSaved()
        try? FileManager.default.removeItem(at: file)
    }

    /// "Venu 2" from "Garmin Venu 2": the watch as its owner calls it, as the website's watchShortName; "Garmin watch" stays whole.
    nonisolated static func watchName(_ name: String) -> String {
        let short = name.replacingOccurrences(of: "^Garmin\\s+", with: "", options: .regularExpression)
        return short.lowercased() == "watch" || short.trimmingCharacters(in: .whitespaces).isEmpty ? name : short
    }

    /// How a line of the Watch fact reads: plain, amber (an older version), or muted (not on one).
    enum Tone: Equatable { case plain, old, none }

    struct Line: Equatable {
        let text: String
        let tone: Tone
    }

    /// SYNC-14: what a match's page says, as the website's: a line for each watch that has it, "On
    /// your Venu 2 since 8:12 PM" ("since yesterday, 8:12 PM", "since Sat, Nov 7, 8:12 PM"), or "On
    /// your Venu 2, an older version: sync the watch"; "Not on a watch yet" while a watch is linked;
    /// nothing with no watch linked, or before the first fetch. `time` writes a time of day as the
    /// phone does; `day` a date ("Sat, Nov 7").
    nonisolated static func lines(_ matchId: String, _ saved: OnWatchSaved, zone: TimeZone, now: Date, time: (Date) -> String, day: (Date) -> String) -> [Line] {
        guard let watches = saved.watches, !watches.isEmpty else { return [] }
        var seen = Set<String>()
        let here = saved.matches.filter { $0.matchId == matchId && seen.insert($0.deviceId).inserted }
        if here.isEmpty { return [Line(text: "Not on a watch yet", tone: .none)] }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let today = calendar.startOfDay(for: now)
        return here.map { w in
            let name = watchName(w.name)
            if !w.upToDate { return Line(text: "On your \(name), an older version: sync the watch", tone: .old) }
            guard let since = instantOf(w.since) else { return Line(text: "On your \(name)", tone: .plain) }
            let days = calendar.dateComponents([.day], from: today, to: calendar.startOfDay(for: since)).day ?? 0
            let when: String
            switch days {
            case 0: when = time(since)
            case -1: when = "yesterday, \(time(since))"
            case 1: when = "tomorrow, \(time(since))"
            default: when = "\(day(since)), \(time(since))"
            }
            return Line(text: "On your \(name) since \(when)", tone: .plain)
        }
    }
}
