import Foundation

// What the app and its notification service extension (PUSH-5, NOTE-3) both say: a match's name, its
// kickoff and the weather's risks, as the web app does (web/src/format.ts). The rest of the app's
// words are in LawFive/UI/Format.swift.

func teamName(_ team: Team, home: Bool) -> String { team.name ?? (home ? "Home" : "Away") }

func matchTitle(_ m: Match) -> String { "\(teamName(m.home, home: true)) v \(teamName(m.away, home: false))" }

/// The match's own time zone, or the phone's when it has none.
func zoneOf(_ m: Match) -> TimeZone { m.timeZone.flatMap { TimeZone(identifier: $0) } ?? .current }

let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
private let isoPlain = ISO8601DateFormatter()

func instantOf(_ iso: String?) -> Date? {
    guard let iso else { return nil }
    return isoPlain.date(from: iso) ?? isoFractional.date(from: iso)
}

/// The time the screens show things against ("Tomorrow", "in 2 days", the countdown): the real clock,
/// or the fixtures' fixed one in the snapshot tests (mobile/ios/README.md#snapshot-pictures).
enum AppClock {
    nonisolated(unsafe) static var fixed: Date?
    static var now: Date { fixed ?? Date() }
}

nonisolated(unsafe) private var formatters: [String: DateFormatter] = [:]

/// A date formatter for a pattern in a time zone, made once.
func cachedFormatter(_ pattern: String, _ zone: TimeZone) -> DateFormatter {
    let key = "\(pattern)|\(zone.identifier)"
    if let f = formatters[key] { return f }
    let f = DateFormatter()
    f.locale = .current
    f.timeZone = zone
    f.dateFormat = pattern
    formatters[key] = f
    return f
}

func uses24Hours() -> Bool { !(DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: .current) ?? "").contains("a") }

/// "9:00 AM" or "09:00", as the phone is set.
func formatTime(_ t: Date, zone: TimeZone) -> String { cachedFormatter(uses24Hours() ? "HH:mm" : "h:mm a", zone).string(from: t) }

func dayDifference(_ t: Date, zone: TimeZone) -> Int {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c.dateComponents([.day], from: c.startOfDay(for: AppClock.now), to: c.startOfDay(for: t)).day ?? 0
}

func sameYear(_ t: Date, zone: TimeZone) -> Bool {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c.component(.year, from: t) == c.component(.year, from: AppClock.now)
}

/// "Sat, Nov 7" (with the year when it isn't this one).
func formatShortDay(_ t: Date, zone: TimeZone) -> String {
    if dayDifference(t, zone: zone) == 0 { return "Today" }
    return cachedFormatter(sameYear(t, zone: zone) ? "EEE, MMM d" : "EEE, MMM d, yyyy", zone).string(from: t)
}

/// A time as the website's formatWhen: "8:12 PM", "yesterday, 8:12 PM", "tomorrow, 8:12 PM" or "Sat, Nov 7, 8:12 PM";
/// with `today`, "today, 8:12 PM" rather than the time alone, as a notification says it (PUSH-5).
func whenText(_ t: Date, zone: TimeZone = .current, now: Date = AppClock.now, today: Bool = false) -> String {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    let days = c.dateComponents([.day], from: c.startOfDay(for: now), to: c.startOfDay(for: t)).day ?? 0
    let time = formatTime(t, zone: zone)
    switch days {
    case 0: return today ? "today, \(time)" : time
    case -1: return "yesterday, \(time)"
    case 1: return "tomorrow, \(time)"
    default: return "\(formatShortDay(t, zone: zone)), \(time)"
    }
}

private let riskNames = ["wetField": "Wet field", "rain": "Rain", "storm": "Storms", "snow": "Snow", "heat": "Heat"]

func riskName(_ kind: String) -> String { riskNames[kind] ?? kind }

/// "Rain likely", "Heat possible".
func riskTitle(_ r: WeatherRisk) -> String { "\(riskName(r.kind)) \(r.level)" }
