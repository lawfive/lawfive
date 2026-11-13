import Foundation
import Observation
import UserNotifications

// Match reminders on the phone (IOS-6, as APP-6): their own settings, off until turned on, so someone
// using the calendar feed doesn't get two; minutes before kickoff (15-minute steps up to 3 hours,
// several), the day before and the day of at chosen times, as the calendar's (CAL-3). Scheduled for
// the next fortnight's matches, again after every sync. iOS keeps at most 64 waiting, so the soonest go first.

struct ReminderSettings: Codable, Equatable {
    var enabled = false
    var minutesBefore = [60]
    /// "19:00", or nil for none.
    var dayBefore: String?
    var dayOf: String?
}

struct PlannedReminder: Equatable {
    let id: String
    let at: Date
    let title: String
    let body: String
    /// APP-6: the match a tap opens, and where Directions goes, if it has a place.
    var match: String = ""
    var lat: Double?
    var lon: Double?
}

/// APP-6: a tapped reminder opens its match, and Directions opens the map. iOS hands these over here, even
/// when the tap is what started the app, so it's set up before the app has finished launching.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate, @unchecked Sendable {
    static let category = "match-with-place"
    static let directions = "directions"
    /// A tap that started the app can arrive before the app is ready, so it waits here.
    private var waiting: String?
    @MainActor var openMatch: (@MainActor (String) -> Void)? {
        didSet {
            if let id = waiting, let openMatch {
                waiting = nil
                openMatch(id)
            }
        }
    }
    /// Directions in the maps app chosen in Settings (WEB-14).
    var openDirections: (@MainActor (Double, Double) -> Void)?

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        if response.actionIdentifier == NotificationRouter.directions {
            if let lat = info["lat"] as? Double, let lon = info["lon"] as? Double {
                await openDirections?(lat, lon)
            }
        } else if response.actionIdentifier == UNNotificationDefaultActionIdentifier, let match = info["match"] as? String {
            await MainActor.run {
                if let openMatch { openMatch(match) } else { waiting = match }
            }
        }
    }
}

@MainActor
@Observable
final class Reminders {
    private(set) var settings: ReminderSettings
    @ObservationIgnored private let center = UNUserNotificationCenter.current()
    static let limit = 60

    @ObservationIgnored let router = NotificationRouter()
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        center.delegate = router
        center.setNotificationCategories([UNNotificationCategory(
            identifier: NotificationRouter.category,
            actions: [UNNotificationAction(identifier: NotificationRouter.directions, title: "Directions", options: [.foreground])],
            intentIdentifiers: [],
        )])
        settings = defaults.data(forKey: "reminders").flatMap { try? jsonDecoder.decode(ReminderSettings.self, from: $0) } ?? ReminderSettings()
    }

    func canNotify() async -> Bool {
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional
    }

    /// Asks the first time; false if the phone says no.
    func askToNotify() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func update(_ next: ReminderSettings, matches: [Match], venues: [Venue]) {
        settings = next
        defaults.set(try? jsonEncoder.encode(next), forKey: "reminders")
        reschedule(matches: matches, venues: venues)
    }

    /// Every reminder for the next fortnight's scheduled matches, from scratch.
    func reschedule(matches: [Match], venues: [Venue]) {
        center.removeAllPendingNotificationRequests()
        guard settings.enabled else { return }
        for planned in Reminders.plan(settings, matches: matches, venues: venues, now: Date()).prefix(Reminders.limit) {
            let content = UNMutableNotificationContent()
            content.title = planned.title
            content.body = planned.body
            content.sound = .default
            content.userInfo = ["match": planned.match]
            if let lat = planned.lat, let lon = planned.lon {
                content.userInfo["lat"] = lat
                content.userInfo["lon"] = lon
                content.categoryIdentifier = NotificationRouter.category
            }
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: planned.at)
            center.add(UNNotificationRequest(identifier: planned.id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)))
        }
    }

    /// When each reminder goes, soonest first. On iOS the words are written now, as nothing of the app runs when it shows.
    nonisolated static func plan(_ s: ReminderSettings, matches: [Match], venues: [Venue], now: Date) -> [PlannedReminder] {
        let horizon = now.addingTimeInterval(14 * 86_400)
        var all: [PlannedReminder] = []
        for m in matches where m.status == "scheduled" {
            guard let kickoff = instantOf(m.kickoff), kickoff > now, kickoff < horizon else { continue }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zoneOf(m)
            func on(_ day: Date, at time: String) -> Date? {
                let parts = time.split(separator: ":").compactMap { Int($0) }
                guard parts.count == 2 else { return nil }
                return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
            }
            var times = s.minutesBefore.map { kickoff.addingTimeInterval(TimeInterval(-$0 * 60)) }
            if let time = s.dayBefore, let dayBefore = calendar.date(byAdding: .day, value: -1, to: kickoff), let at = on(dayBefore, at: time) { times.append(at) }
            // The day of: only if it's before kickoff.
            if let time = s.dayOf, let at = on(kickoff, at: time), at < kickoff { times.append(at) }
            let venue = venues.first { $0.id == m.venueId }
            let where_ = venue?.name
            let place = venue?.pitches.first { $0.id == m.pitchId }?.position ?? venue?.position
            for at in Set(times) where at > now {
                let left = kickoff.timeIntervalSince(at)
                let when: String
                if left < 90 * 60 { when = "in \(max(Int((left + 30) / 60), 1)) min" }
                else if left < 20 * 3600 { when = "in \(Int((left / 3600).rounded())) hours" }
                else { when = "tomorrow" }
                let time = formatTime(kickoff, zone: zoneOf(m))
                let body = [when.isEmpty ? time : "\(time) \(when)", where_].compactMap { $0 }.joined(separator: " · ")
                all.append(PlannedReminder(id: "\(m.id)-\(Int(at.timeIntervalSince1970))", at: at, title: matchTitle(m), body: body, match: m.id, lat: place?.lat, lon: place?.lon))
            }
        }
        return all.sorted { $0.at < $1.at }
    }
}
