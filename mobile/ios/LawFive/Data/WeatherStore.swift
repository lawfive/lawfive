import Foundation
import Observation

// Match weather (WX-9, as the web's WX-5): GET /v1/weather for the upcoming matches (the server's
// window: the last month and the next 16 days) and, when Past is shown, the last year. Kept on the
// phone, so the forecast fetched at home is still there at a ground without signal.

@MainActor
@Observable
final class WeatherStore {
    private(set) var byMatch: [String: MatchWeather] = [:]
    @ObservationIgnored private var fetchedAt: [Bool: Date] = [:]
    @ObservationIgnored private let api: Api
    @ObservationIgnored private let file: URL
    @ObservationIgnored private let hasWeather: () async -> Bool

    init(api: Api, file: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("weather.json"), hasWeather: @escaping () async -> Bool) {
        self.api = api
        self.hasWeather = hasWeather
        self.file = file
        if let data = try? Data(contentsOf: file), let items = try? jsonDecoder.decode([MatchWeather].self, from: data) {
            byMatch = Dictionary(items.map { ($0.matchId, $0) }, uniquingKeysWith: { _, b in b })
        }
    }

    /// Fetches the upcoming (or past) weather, unless it was fetched in the last 10 minutes.
    func refresh(past: Bool = false, force: Bool = false) async {
        if !force, let last = fetchedAt[past], Date().timeIntervalSince(last) < 600 { return }
        guard await hasWeather() else { return }
        var range = ""
        if past {
            let f = ISO8601DateFormatter()
            range = "?from=\(f.string(from: Date().addingTimeInterval(-365 * 86_400)))&to=\(f.string(from: Date()))"
        }
        guard let answer = try? await api.call("GET", "/v1/weather\(range)"), let items = try? answer["items"]?.decoded(as: [MatchWeather].self) else { return }
        fetchedAt[past] = Date()
        for w in items { byMatch[w.matchId] = w }
        if let data = try? jsonEncoder.encode(Array(byMatch.values)) { try? data.write(to: file, options: .atomic) }
    }

    /// Signed out: another account's weather has no place here.
    func clear() {
        fetchedAt = [:]
        byMatch = [:]
        try? FileManager.default.removeItem(at: file)
    }
}
