import Foundation
import Observation
import UserNotifications

// Match reminders on the phone (IOS-6, as APP-6). Each phone has its own switch, off until turned on,
// so someone using the calendar feed doesn't get two; the times are the account's, shared with the
// calendar feed and the other phones (CAL-3): minutes before kickoff (15-minute steps up to 3 hours,
// several), and the day before and the day of at chosen times, one notification for all the matches
// it's about. Scheduled for the next fortnight's matches, again after every sync, each at its exact
// moment. iOS keeps at most 64 waiting, so the soonest go first.

/// What's this phone's own: whether it reminds.
struct ReminderSettings: Codable, Equatable {
    var enabled = false
    /// The phone's own times from before they were the account's, until the first sync uploads or forgets them.
    var minutesBefore: [Int]?
    var dayBefore: String?
    var dayOf: String?
}

/// APP-6, CAL-3: when reminders go, as the account has them.
struct ReminderTimes: Equatable {
    var minutesBefore = [60]
    /// "19:00", or nil for none.
    var dayBefore: String?
    var dayOf: String?

    /// CAL-3: every 15 minutes up to 3 hours before kickoff.
    static let steps = Array(stride(from: 15, through: 180, by: 15))

    init(minutesBefore: [Int] = [60], dayBefore: String? = nil, dayOf: String? = nil) {
        self.minutesBefore = minutesBefore
        self.dayBefore = dayBefore
        self.dayOf = dayOf
    }

    /// The account's reminders, as the website's Calendar settings show them (CalendarReminders in
    /// web/src/pages/Calendar.tsx): an account that has never chosen several keeps its one reminder (an
    /// hour before when it has none), a day's notice being the evening before at 7:00 PM. As Android's.
    init(_ s: UserSettings?) {
        guard let s else { self.init(); return }
        if s.calendarReminders != nil || s.calendarDayBefore != nil || s.calendarDayOf != nil {
            self.init(minutesBefore: s.calendarReminders ?? [], dayBefore: s.calendarDayBefore, dayOf: s.calendarDayOf)
            return
        }
        let legacy = s.calendarReminderMin ?? 60
        self.init(minutesBefore: ReminderTimes.steps.contains(legacy) ? [legacy] : [], dayBefore: legacy == 1440 ? "19:00" : nil)
    }

    /// Into the account's settings as the website writes them: all three, so a single reminder from before stops applying.
    func into(_ s: inout UserSettings) {
        s.calendarReminders = Array(Set(minutesBefore)).sorted(by: >)
        s.calendarDayBefore = dayBefore
        s.calendarDayOf = dayOf
    }

    /// APP-6: before the times were the account's, each phone kept its own. The first sync after uploads
    /// them when the account has never chosen any (and they were in use here: reminders on, or times other
    /// than the starting ones); otherwise the account's win. Nil: nothing to upload.
    static func toUpload(phone: ReminderTimes?, enabled: Bool, account: UserSettings?) -> ReminderTimes? {
        guard let phone else { return nil }
        let chosen = account.map { $0.calendarReminders != nil || $0.calendarDayBefore != nil || $0.calendarDayOf != nil } ?? false
        return !chosen && (enabled || phone != ReminderTimes()) ? phone : nil
    }
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
    /// The account's settings, whose times these are (CAL-3).
    @ObservationIgnored var account: @MainActor () -> UserSettings? = { nil }

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

    /// The account's times, shared with the calendar feed and the other phones.
    var times: ReminderTimes { ReminderTimes(account()) }

    func canNotify() async -> Bool {
        let status = await center.notificationSettings().authorizationStatus
        return status == .authorized || status == .provisional
    }

    /// Asks the first time; false if the phone says no.
    func askToNotify() async -> Bool {
        (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    func update(_ next: ReminderSettings, matches: [Match], venues: [Venue]) {
        save(next)
        reschedule(matches: matches, venues: venues)
    }

    private func save(_ next: ReminderSettings) {
        settings = next
        defaults.set(try? jsonEncoder.encode(next), forKey: "reminders")
    }

    /// APP-6: the phone's own times from before, if it has them, to upload once (`ReminderTimes.toUpload`), and then forgotten.
    func takePhoneTimes() -> (times: ReminderTimes, enabled: Bool)? {
        guard let minutes = settings.minutesBefore else { return nil }
        let phone = ReminderTimes(minutesBefore: Array(Array(Set(minutes.filter(ReminderTimes.steps.contains))).sorted().prefix(12)),
                                  dayBefore: settings.dayBefore, dayOf: settings.dayOf)
        save(ReminderSettings(enabled: settings.enabled))
        return (phone, settings.enabled)
    }

    /// Every reminder for the next fortnight's scheduled matches, from scratch.
    func reschedule(matches: [Match], venues: [Venue]) {
        center.removeAllPendingNotificationRequests()
        guard settings.enabled else { return }
        for planned in Reminders.plan(times, matches: matches, venues: venues, now: Date()).prefix(Reminders.limit) {
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
    /// Before kickoff, one for each match. The day before and the day of (in each match's time zone, CAL-3), one for
    /// every match whose reminder lands at that moment: "2 matches tomorrow" over a line for each, the day of's only
    /// for matches kicking off after it, and leaving out a match with a reminder before kickoff at that very moment.
    nonisolated static func plan(_ t: ReminderTimes, matches: [Match], venues: [Venue], now: Date) -> [PlannedReminder] {
        let horizon = now.addingTimeInterval(14 * 86_400)
        var all: [PlannedReminder] = []
        /// The day's reminders, by when they go: tomorrow or today, and the matches with when they kick off.
        var days: [String: (at: Date, word: String, matches: [(match: Match, kickoff: Date, venue: Venue?)])] = [:]
        for m in matches where m.status == "scheduled" {
            guard let kickoff = instantOf(m.kickoff), kickoff > now, kickoff < horizon else { continue }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zoneOf(m)
            func on(_ day: Date, at time: String) -> Date? {
                let parts = time.split(separator: ":").compactMap { Int($0) }
                guard parts.count == 2 else { return nil }
                return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
            }
            let before = Set(t.minutesBefore.map { kickoff.addingTimeInterval(TimeInterval(-$0 * 60)) }).filter { $0 > now }
            let venue = venues.first { $0.id == m.venueId }
            for at in before {
                all.append(single(m, kickoff: kickoff, venue: venue, at: at))
            }
            var dayTimes: [(String, Date)] = []
            if let time = t.dayBefore, let dayBefore = calendar.date(byAdding: .day, value: -1, to: kickoff), let at = on(dayBefore, at: time) { dayTimes.append(("tomorrow", at)) }
            // The day of: only if it's before kickoff.
            if let time = t.dayOf, let at = on(kickoff, at: time), at < kickoff { dayTimes.append(("today", at)) }
            for (word, at) in dayTimes where at > now && !before.contains(at) {
                days["\(word)-\(Int(at.timeIntervalSince1970))", default: (at, word, [])].matches.append((m, kickoff, venue))
            }
        }
        for (key, day) in days {
            let at = day.at
            let list = day.matches.sorted { $0.kickoff < $1.kickoff }
            let first = list[0]
            guard list.count > 1 else {
                all.append(single(first.match, kickoff: first.kickoff, venue: first.venue, at: at))
                continue
            }
            let lines = list.map { e in
                ["\(teamAlias(e.match.home, other: e.match.away, home: true)) v \(teamAlias(e.match.away, other: e.match.home, home: false))",
                 formatTime(e.kickoff, zone: zoneOf(e.match)), e.venue?.name].compactMap { $0 }.joined(separator: " · ")
            }
            let place = first.venue?.pitches.first { $0.id == first.match.pitchId }?.position ?? first.venue?.position
            all.append(PlannedReminder(id: "day-\(key)", at: at, title: "\(list.count) matches \(day.word)", body: lines.joined(separator: "\n"),
                                       match: first.match.id, lat: place?.lat, lon: place?.lon))
        }
        return all.sorted { $0.at != $1.at ? $0.at < $1.at : $0.id < $1.id }
    }

    /// One match's reminder: "9:00 AM in 5 hours · Central Park".
    nonisolated private static func single(_ m: Match, kickoff: Date, venue: Venue?, at: Date) -> PlannedReminder {
        let left = kickoff.timeIntervalSince(at)
        let when: String
        if left < 90 * 60 { when = "in \(max(Int((left + 30) / 60), 1)) min" }
        else if left < 20 * 3600 { when = "in \(Int((left / 3600).rounded())) hours" }
        else { when = "tomorrow" }
        let time = formatTime(kickoff, zone: zoneOf(m))
        let body = ["\(time) \(when)", venue?.name].compactMap { $0 }.joined(separator: " · ")
        let place = venue?.pitches.first { $0.id == m.pitchId }?.position ?? venue?.position
        return PlannedReminder(id: "\(m.id)-\(Int(at.timeIntervalSince1970))", at: at, title: matchTitle(m), body: body, match: m.id, lat: place?.lat, lon: place?.lon)
    }
}
