import Foundation
import Observation

// Stats on the phone (STAT-13): GET /v1/stats for the filters chosen, worked out by the server as
// for the website. The last answer for each set of filters is kept on the phone, with when it came,
// so the Stats tab shows something at a ground without signal.

/// An answer, and when it came.
struct KeptStats: Codable, Sendable {
    var at: Date
    var stats: Stats
}

@MainActor
final class StatsStore {
    private let api: Api
    private let file: URL
    private var kept: [String: KeptStats]?

    init(api: Api, file: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("stats.json")) {
        self.api = api
        self.file = file
    }

    /// The last answer for these filters, if there is one.
    func kept(_ query: String) -> KeptStats? { all()[query] }

    /// Asks the server, and keeps the answer. Throws when it can't be reached.
    func fetch(_ query: String) async throws -> KeptStats {
        guard let body = try await api.call("GET", "/v1/stats\(query.isEmpty ? "" : "?\(query)")") else { throw URLError(.badServerResponse) }
        let answer = KeptStats(at: Date(), stats: try body.decoded(as: Stats.self))
        var next = all()
        next[query] = answer
        // The newest dozen, which covers the filters anyone flips between.
        next = Dictionary(uniqueKeysWithValues: next.sorted { $0.value.at > $1.value.at }.prefix(12).map { ($0.key, $0.value) })
        kept = next
        if let data = try? jsonEncoder.encode(next) { try? data.write(to: file, options: .atomic) }
        return answer
    }

    /// Signed out: another account's stats have no place here.
    func clear() {
        kept = [:]
        try? FileManager.default.removeItem(at: file)
    }

    private func all() -> [String: KeptStats] {
        if let kept { return kept }
        let loaded = (try? Data(contentsOf: file)).flatMap { try? jsonDecoder.decode([String: KeptStats].self, from: $0) } ?? [:]
        kept = loaded
        return loaded
    }
}
