import Foundation
import UserNotifications

// PUSH-5, PUSH-6, NOTE-3: the push relay's alert says nothing about a match ("There's an update on a
// match."), with only the kind and an id in its data (PUSH-2). iOS hands it here before showing it:
// this asks the person's own server, with their session, for what happened, and writes it as Android
// does (Shared/PushWords.swift). On any failure (signed out, no signal, the server doesn't have it any
// more), or when iOS's time is up, it shows neutral words. iOS gives an extension about 30 seconds and
// little memory, so it makes a few small requests and keeps nothing.

final class NotificationService: UNNotificationServiceExtension {
    private let lock = NSLock()
    private var handler: ((UNNotificationContent) -> Void)?
    private var fallback: UNNotificationContent?
    private var work: Task<Void, Never>?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        let info = request.content.userInfo
        let kind = info["type"] as? String
        let id = info["id"] as? String
        let neutral = NotificationService.neutral(request.content, kind: kind)
        lock.withLock {
            handler = contentHandler
            fallback = neutral
        }
        guard let kind else { return finish(neutral) }
        work = Task {
            let written = await Writer(kind: kind, id: id).write(into: neutral)
            self.finish(written ?? neutral)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        work?.cancel()
        if let neutral = lock.withLock({ fallback }) { finish(neutral) }
    }

    /// Hands iOS the words once, whichever comes first: the details or the end of iOS's time.
    private func finish(_ content: UNNotificationContent) {
        let done = lock.withLock { () -> ((UNNotificationContent) -> Void)? in
            defer { handler = nil }
            return handler
        }
        done?(content)
    }

    /// The words when the details can't be had: nothing about a match, and a tap opens the app.
    static func neutral(_ original: UNNotificationContent, kind: String?) -> UNMutableNotificationContent {
        let content = (original.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        switch kind {
        case PushKind.test:
            content.title = PushFallback.testTitle
            content.body = PushFallback.testBody
        case PushKind.weatherRisk:
            content.title = PushFallback.title
            content.body = PushFallback.weatherRisk
            content.threadIdentifier = "weather-risks"
        case PushKind.matchChanged:
            content.title = PushFallback.title
            content.body = PushFallback.matchChanged
            content.threadIdentifier = "integrations"
            // NOTE-3: what's new is on the match list.
            content.userInfo["matches"] = true
        default:
            break
        }
        return content
    }
}

/// One push's details, from the person's own server.
private struct Writer {
    let kind: String
    let id: String?

    /// Directions' category, as the app's reminders have it (Reminders.swift's NotificationRouter).
    private static let withPlace = "match-with-place"

    func write(into neutral: UNMutableNotificationContent) async -> UNNotificationContent? {
        guard let id, let server = Server() else { return nil }
        switch kind {
        case PushKind.weatherRisk: return await risk(id, server, neutral)
        case PushKind.matchChanged: return await notice(id, server, neutral)
        default: return nil
        }
    }

    /// PUSH-5: "Weather risk: Strikers v Rovers" over "Storms likely · tomorrow, 9:00 AM". Nothing new
    /// to say if the risk has gone by now, or the match has.
    private func risk(_ id: String, _ server: Server, _ neutral: UNMutableNotificationContent) async -> UNNotificationContent? {
        async let match = server.get("/v1/matches/\(id)", as: Match.self)
        async let weather = server.get("/v1/weather/\(id)", as: MatchWeather.self)
        guard let m = await match, m.deletedAt == nil, let w = await weather, !w.risks.isEmpty else { return nil }
        let content = neutral.mutableCopy() as! UNMutableNotificationContent
        content.title = "Weather risk: \(matchTitle(m))"
        content.body = riskText(w, kickoff: instantOf(m.kickoff), zone: zoneOf(m))
        content.userInfo["match"] = m.id
        if let place = await server.place(of: m) { directions(content, place) }
        return content
    }

    /// NOTE-3: what an integration did, as `noticeWords` says it.
    private func notice(_ id: String, _ server: Server, _ neutral: UNMutableNotificationContent) async -> UNNotificationContent? {
        guard let notice = await server.get("/v1/notices/\(id)", as: MatchNotice.self), let words = noticeWords(notice, time: noticeKickoff) else { return nil }
        let content = neutral.mutableCopy() as! UNMutableNotificationContent
        content.title = words.title
        if let match = words.matchId {
            content.subtitle = notice.source
            content.body = words.text
            content.userInfo["match"] = match
            content.userInfo.removeValue(forKey: "matches")
            if words.directions, let m = await server.get("/v1/matches/\(match)", as: Match.self), let place = await server.place(of: m) { directions(content, place) }
        } else {
            // Several, a line each, as the reminders' day does (IOS-6); a removed match's single line too.
            content.body = words.lines.isEmpty ? words.text : (words.lines.prefix(6) + (words.lines.count > 6 ? ["and \(words.lines.count - 6) more"] : [])).joined(separator: "\n")
            if words.lines.isEmpty { content.subtitle = notice.source }
        }
        // APP-6: a match that's off or moved loses its reminders now; the app's next sync plans any new ones.
        await forgetReminders(of: remindersGone(notice))
        return content
    }

    private func directions(_ content: UNMutableNotificationContent, _ place: Position) {
        content.userInfo["lat"] = place.lat
        content.userInfo["lon"] = place.lon
        content.categoryIdentifier = Writer.withPlace
    }

    /// The match's own reminders (Reminders.swift names them after the match); a day's, for several matches, waits for the app's sync.
    private func forgetReminders(of matches: [String]) async {
        guard !matches.isEmpty else { return }
        let center = UNUserNotificationCenter.current()
        let ids = await center.pendingNotificationRequests().map(\.identifier).filter { id in matches.contains { id.hasPrefix("\($0)-") } }
        if !ids.isEmpty { center.removePendingNotificationRequests(withIdentifiers: ids) }
    }
}

/// The person's own server, signed in as the app is.
private struct Server {
    let address: String
    let device: String
    let token: String

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 20
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    init?() {
        guard let shared = SharedState.read(), let token = Keychain.read() else { return nil }
        var address = shared.server
        while address.hasSuffix("/") { address.removeLast() }
        self.address = address
        device = shared.device
        self.token = token
    }

    /// A record or answer from the API; nil for anything but the server's 2xx with what was asked for.
    func get<T: Decodable>(_ path: String, as type: T.Type) async -> T? {
        guard !Task.isCancelled, let url = URL(string: address + path) else { return nil }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(device, forHTTPHeaderField: "X-LawFive-Device")
        guard let (data, response) = try? await Server.session.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    /// Where the match is: its pitch, else the venue's parking.
    func place(of m: Match) async -> Position? {
        guard let venueId = m.venueId, let venue = await get("/v1/venues/\(venueId)", as: Venue.self) else { return nil }
        return venue.pitches.first { $0.id == m.pitchId }?.position ?? venue.position
    }
}
