import Foundation
import SwiftUI

// Showing matches as the web app does (web/src/format.ts): team names and colors, kickoffs in the
// match's own time zone, money, distances and match minutes.

/// As officials are shown: short, so a crew fits on a line (WEB-11).
let roleNames = ["referee": "Referee", "ar1": "AR1", "ar2": "AR2", "fourth": "4th"]
/// As a form offers them, where there's room to spell it out.
let roleNamesInFull = roleNames.merging(["fourth": "4th official"]) { $1 }
let roleOrder = ["referee", "ar1", "ar2", "fourth"]
let genderNames = ["male": "Male", "female": "Female", "coed": "Co-ed"]
let genderOrder = ["male", "female", "coed"]

/// The account's units, for temperatures, rain and wind.
struct Units: Equatable {
    var temperature = "c"
    var distance = "km"
}

enum Official {
    case you(role: String)
    case member(role: String, member: CrewMember)

    var role: String {
        switch self {
        case .you(let role), .member(let role, _): return role
        }
    }
}

/// The officials in the usual order, the user in their own place (WEB-11).
func crewInOrder(_ crew: [CrewMember], you: String?) -> [Official] {
    let all = (you.map { [Official.you(role: $0)] } ?? []) + crew.map { Official.member(role: $0.role, member: $0) }
    func rank(_ role: String) -> Int { roleOrder.firstIndex(of: role) ?? -1 }
    return all.enumerated().sorted { a, b in
        rank(a.element.role) == rank(b.element.role) ? a.offset < b.offset : rank(a.element.role) < rank(b.element.role)
    }.map(\.element)
}

/// The roles as one line of officials shows them (WEB-20).
let roleNamesShort = ["referee": "Ref", "ar1": "AR1", "ar2": "AR2", "fourth": "4th"]

struct LineOfficial: Equatable {
    /// referee, ar1, ar2 or fourth.
    let key: String
    let who: String
    let you: Bool
    /// As the line shows it: Ref, AR1, AR2, 4th.
    var role: String { roleNamesShort[key] ?? key }
}

/// WEB-20: the officials as one line reads them, in order: each role with "you", a saved referee's
/// short name or surname, or a name as typed (a club linesman isn't a surname).
func officialsLine(_ m: Match, referee: (String?) -> Referee?) -> [LineOfficial] {
    crewInOrder(m.crew, you: m.role).compactMap { o in
        switch o {
        case .you(let role):
            return LineOfficial(key: role, who: "you", you: true)
        case .member(let role, let member):
            let saved = referee(member.refereeId).map { $0.shortName?.trimmingCharacters(in: .whitespaces).orNil ?? surname($0.name) }
            return (saved ?? member.name).map { LineOfficial(key: role, who: $0, you: false) }
        }
    }
}

private let nameSuffixes: Set<String> = ["jr", "sr", "ii", "iii", "iv"]
private let surnameParticles: Set<String> = ["da", "das", "de", "del", "della", "den", "der", "di", "do", "dos", "du", "la", "le", "ten", "ter", "van", "von"]
private func isSuffix(_ word: String) -> Bool {
    let w = word.lowercased()
    return nameSuffixes.contains(w.hasSuffix(".") ? String(w.dropLast()) : w)
}

/// WEB-20: a referee's surname, guessed from their name as a schedule writes it: "Sam Rivera",
/// "Rivera, Sam", with a grade in brackets or after a dash, Jr. or III after it, or "de la" before it.
/// A name it can't make sense of comes back whole.
func surname(_ name: String) -> String {
    // A grade or level in brackets, or after a spaced dash or bar.
    let unbracketed = name.replacingOccurrences(of: #"\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?"#, with: " ", options: .regularExpression)
    let plain = unbracketed.range(of: #"\s[-–—|]\s"#, options: .regularExpression).map { String(unbracketed[..<$0.lowerBound]) } ?? unbracketed
    let parts = plain.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    // "Rivera, Sam": the part before the comma, unless all that follows is a suffix ("Sam Rivera, Jr.").
    let listed = parts.count > 1 && !parts.dropFirst().allSatisfy(isSuffix)
    var words = (parts.first ?? "").split(whereSeparator: \.isWhitespace).map(String.init)
    while words.count > 1, isSuffix(words.last!) { words.removeLast() }
    var from = listed ? 0 : words.count - 1
    while from > 1, surnameParticles.contains(words[from - 1]) { from -= 1 }
    let found = words.dropFirst(max(from, 0)).joined(separator: " ")
    return found.isEmpty ? name.trimmingCharacters(in: .whitespaces) : found
}

func teamName(_ team: Team, home: Bool) -> String { team.name ?? (home ? "Home" : "Away") }

func matchTitle(_ m: Match) -> String { "\(teamName(m.home, home: true)) v \(teamName(m.away, home: false))" }

/// RES-8: what Delete match? says goes with it: its report, and its track when it has one (`track`
/// nil: not known yet, or no signal). The website's words (format.ts, deleteMatchMessage).
func deleteMatchMessage(report: Bool, track: Bool?) -> String {
    let goes = "It goes from LawFive, on every device"
    guard report else { return "\(goes)." }
    let withTrack = switch track {
    case true?: " and track"
    case false?: ""
    case nil: " and any track"
    }
    return "\(goes), with its report\(withTrack)."
}

/// SET-5: a name's words: letters and digits, split at spaces, underscores and punctuation.
private func words(_ name: String) -> [String] {
    name.split(whereSeparator: { !($0.isLetter || $0.isNumber) }).map(String.init)
}

private func firstThree(_ name: String) -> String? {
    let three = String(words(name).joined().prefix(3)).uppercased()
    return three.isEmpty ? nil : three
}

/// SET-5: short names for a pair of teams (schema/src/shortNames.ts, the website's and the server's):
/// the first three letters or digits of each name; when those are the same, the words the names start
/// with in common are skipped, so L84_Roach and L84_Smith become ROA and SMI.
func suggestAliases(_ homeName: String?, _ awayName: String?) -> (home: String?, away: String?) {
    let simple = (home: firstThree(homeName ?? ""), away: firstThree(awayName ?? ""))
    guard simple.home != nil, simple.home == simple.away else { return simple }
    let home = words(homeName ?? ""), away = words(awayName ?? "")
    var shared = 0
    while shared < home.count, shared < away.count, home[shared].lowercased() == away[shared].lowercased() { shared += 1 }
    let distinct = (home: firstThree(home.dropFirst(shared).joined(separator: " ")) ?? simple.home,
                    away: firstThree(away.dropFirst(shared).joined(separator: " ")) ?? simple.away)
    return distinct.home != distinct.away ? distinct : simple
}

/// The watch's short name (SET-5): the one typed, else from both teams' names (suggestAliases), else HOM/AWY.
func teamAlias(_ team: Team, other: Team, home: Bool) -> String {
    if let alias = team.alias, !alias.isEmpty { return alias }
    let suggested = home ? suggestAliases(team.name, other.name).home : suggestAliases(other.name, team.name).away
    return suggested ?? (home ? "HOM" : "AWY")
}

func describePlayers(_ m: Match) -> String {
    [m.ageGroup, m.gender.flatMap { genderNames[$0] }].compactMap { $0 }.joined(separator: " · ")
}

struct RGB: Equatable {
    let r, g, b: Double
    var color: Color { Color(red: r, green: g, blue: b) }
}

func parseColor(_ hex: String?) -> RGB? {
    guard var h = hex else { return nil }
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
    return RGB(r: Double((v >> 16) & 0xFF) / 255, g: Double((v >> 8) & 0xFF) / 255, b: Double(v & 0xFF) / 255)
}

/// WEB-19: a color as `#RRGGBB` in sRGB, as the watch and the website read it. Apple's picker can
/// give Display P3 colors outside sRGB; they're converted and clamped to the nearest it has.
func hexString(_ color: CGColor) -> String? {
    guard let srgb = CGColorSpace(name: CGColorSpace.sRGB),
          let c = color.converted(to: srgb, intent: .relativeColorimetric, options: nil)?.components, c.count >= 3 else { return nil }
    let byte = { (v: CGFloat) in Int((min(max(v, 0), 1) * 255).rounded()) }
    return String(format: "#%02X%02X%02X", byte(c[0]), byte(c[1]), byte(c[2]))
}

private func luminance(_ c: RGB) -> Double {
    func lin(_ v: Double) -> Double { v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/// Black or white text, whichever contrasts more with the color (as on the watch).
func textOn(_ c: RGB) -> Color {
    let l = luminance(c)
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? .black : .white
}

/// A kit that would vanish against the page: dark ones in dark mode, light ones in light mode.
func kitVanishes(_ c: RGB, dark: Bool) -> Bool { dark ? luminance(c) < 0.02 : luminance(c) > 0.8 }

/// Two letters for an avatar; assignor names like "84-Van Der Wal, Travis (REG)" give TV.
func initials(_ name: String) -> String {
    let plain = name.replacingOccurrences(of: "\\(.*?\\)", with: "", options: .regularExpression)
        .replacingOccurrences(of: "^[^\\p{L}]+", with: "", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    let parts = plain.split(separator: ",", omittingEmptySubsequences: false).map { part in
        part.split(whereSeparator: \.isWhitespace).map(String.init).filter { $0.contains(where: \.isLetter) }
    }
    guard let first = parts.first else { return "?" }
    let words = parts.count > 1 && !parts[1].isEmpty ? [parts[1][0], first.first ?? ""] : first
    let picked = words.count > 1 ? [words[0], words[words.count - 1]] : words
    let letters = picked.compactMap { $0.first(where: \.isLetter) }
    return letters.isEmpty ? "?" : String(letters).uppercased()
}

func zoneOf(_ m: Match) -> TimeZone { m.timeZone.flatMap { TimeZone(identifier: $0) } ?? .current }

private let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
private let isoPlain = ISO8601DateFormatter()

func instantOf(_ iso: String?) -> Date? {
    guard let iso else { return nil }
    return isoPlain.date(from: iso) ?? isoFractional.date(from: iso)
}

/// An ISO timestamp with its zone's offset, as the server stores a kickoff.
func isoString(_ date: Date, zone: TimeZone) -> String {
    let f = ISO8601DateFormatter()
    f.timeZone = zone
    f.formatOptions = [.withInternetDateTime]
    return f.string(from: date)
}

func nowString() -> String { isoFractional.string(from: Date()) }

/// The time the screens show things against ("Tomorrow", "in 2 days", the countdown): the real clock,
/// or the fixtures' fixed one in the snapshot tests (mobile/ios/README.md#snapshot-pictures).
enum AppClock {
    nonisolated(unsafe) static var fixed: Date?
    static var now: Date { fixed ?? Date() }
}

private var formatters: [String: DateFormatter] = [:]

private func formatter(_ pattern: String, _ zone: TimeZone) -> DateFormatter {
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
func formatTime(_ t: Date, zone: TimeZone) -> String { formatter(uses24Hours() ? "HH:mm" : "h:mm a", zone).string(from: t) }

/// The time in two parts for a fixture board: "9:00" and "AM" (none on a 24-hour clock).
func timeParts(_ t: Date, zone: TimeZone) -> (time: String, ampm: String?) {
    uses24Hours() ? (formatter("HH:mm", zone).string(from: t), nil)
        : (formatter("h:mm", zone).string(from: t), formatter("a", zone).string(from: t).uppercased())
}

private func dayDifference(_ t: Date, zone: TimeZone) -> Int {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c.dateComponents([.day], from: c.startOfDay(for: AppClock.now), to: c.startOfDay(for: t)).day ?? 0
}

private func sameYear(_ t: Date, zone: TimeZone) -> Bool {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    return c.component(.year, from: t) == c.component(.year, from: AppClock.now)
}

/// "Today", "Tomorrow", "Yesterday", else "Saturday 7 November".
func formatDay(_ t: Date, zone: TimeZone) -> String {
    switch dayDifference(t, zone: zone) {
    case 0: return "Today"
    case 1: return "Tomorrow"
    case -1: return "Yesterday"
    default: return formatter(sameYear(t, zone: zone) ? "EEEE, MMMM d" : "EEEE, MMMM d, yyyy", zone).string(from: t)
    }
}

/// The day over the date in capitals ("TUE" over "NOV 10"), or "TODAY" alone, as on the boards (WEB-24).
func dayOverDate(_ t: Date, zone: TimeZone) -> [String] {
    if dayDifference(t, zone: zone) == 0 { return ["TODAY"] }
    return [formatter("EEE", zone).string(from: t).uppercased(), formatter(sameYear(t, zone: zone) ? "MMM d" : "MMM d yyyy", zone).string(from: t).uppercased()]
}

/// A played match's date on its row: the day ("SUN", with the year when it isn't this one) and "NOV 3".
func playedDay(_ t: Date, zone: TimeZone) -> (String, String) {
    (formatter(sameYear(t, zone: zone) ? "EEE" : "EEE yyyy", zone).string(from: t).uppercased(), formatter("MMM d", zone).string(from: t).uppercased())
}

/// "Sat, Nov 7" (with the year when it isn't this one).
func formatShortDay(_ t: Date, zone: TimeZone) -> String {
    if dayDifference(t, zone: zone) == 0 { return "Today" }
    return formatter(sameYear(t, zone: zone) ? "EEE, MMM d" : "EEE, MMM d, yyyy", zone).string(from: t)
}

func formatFullDate(_ t: Date, zone: TimeZone) -> String {
    let f = DateFormatter()
    f.timeZone = zone
    f.dateStyle = .full
    f.timeStyle = .none
    return f.string(from: t)
}

/// "just now", "5 min ago", "3 h ago", "2 days ago", then the date.
func timeAgo(_ at: Date, now: Date = AppClock.now) -> String {
    let minutes = Int(now.timeIntervalSince(at) / 60)
    if minutes < 2 { return "just now" }
    if minutes < 60 { return "\(minutes) min ago" }
    if minutes < 48 * 60 { return "\(minutes / 60) h ago" }
    if minutes < 14 * 24 * 60 { return "\(minutes / (24 * 60)) days ago" }
    return formatter("MMM d", .current).string(from: at)
}

func money(_ amount: Double, _ currency: String) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = currency
    let whole = amount.truncatingRemainder(dividingBy: 1) == 0
    f.maximumFractionDigits = whole ? 0 : 2
    f.minimumFractionDigits = whole ? 0 : 2
    return f.string(from: NSNumber(value: amount)) ?? "\(amount) \(currency)"
}

func minutesText(_ sec: Int) -> String { sec % 60 == 0 ? "\(sec / 60)" : String(format: "%.1f", Double(sec) / 60) }

/// "2 × 45 min, 15 min break" and the switches that are on; one period has no break but before extra time (SET-16).
func describeFormat(_ f: MatchFormat) -> String {
    var parts = ["\(f.periods) × \(minutesText(f.periodSec)) min"]
    if f.periods > 1 || f.extraTime { parts.append("\(minutesText(f.breakSec)) min break") }
    // TMR-15: "2 × 40 min · 10 min break · stopping clock".
    if f.stoppingClock == true { parts.append("stopping clock") }
    if f.extraTime { parts.append("ET \(f.extraTimePeriods) × \(minutesText(f.extraTimePeriodSec))\(f.goldenGoal == true ? ", golden goal" : "")") }
    if f.penalties { parts.append("penalties") }
    if f.halfwayBreak { parts.append("\(minutesText(f.halfwayBreakSec)) min halfway break") }
    // EVT-12: as the website's, "10 min sin bins".
    if f.sinBins == true { parts.append("\(minutesText(f.sinBinSec ?? 10 * 60)) min sin bins") }
    return parts.joined(separator: " · ")
}

/// 23', or 45+2' in added time. TMR-15: a stopping clock has no added time, so its minute stops at the length's ("40'").
func matchMinute(_ f: MatchFormat, period: Int, periodSec: Int) -> String {
    let regular = period <= f.periods
    let length = regular ? f.periodSec : f.extraTimePeriodSec
    let start = regular ? (period - 1) * f.periodSec : f.periods * f.periodSec + (period - f.periods - 1) * f.extraTimePeriodSec
    let lengthMin = length / 60
    let minute = f.stoppingClock == true ? min(periodSec / 60 + 1, lengthMin) : periodSec / 60 + 1
    return minute > lengthMin ? "\((start + length) / 60)+\(minute - lengthMin)'" : "\(start / 60 + minute)'"
}

/// Q-20: the format as the match was played, for naming and timing its periods, as the website's
/// asPlayed: as many periods of normal time as the watch recorded, when that differs from the plan
/// (more than planned, or a whole match of fewer). An abandoned match's missing periods leave the plan's.
func asPlayed(_ f: MatchFormat, _ record: MatchRecord?) -> MatchFormat {
    let normal = record?.periods.filter { !$0.extraTime }.count ?? 0
    let differs = record?.outcome == "completed" ? normal != f.periods : normal > f.periods
    guard (1...4).contains(normal), differs else { return f }
    var played = f
    played.periods = normal
    return played
}

/// The match with its periods as they were played (Q-20), for showing; saving keeps its own format.
func asPlayed(match: Match, _ record: MatchRecord?) -> Match {
    var m = match
    m.format = asPlayed(match.format, record)
    return m
}

func periodName(_ f: MatchFormat, period: Int) -> String {
    if period > f.periods { return "Extra time \(period - f.periods)" }
    if f.periods == 2 { return period == 1 ? "First half" : "Second half" }
    // SET-16: a match of one period, beside "Extra time 1" when it has some.
    return f.periods == 1 ? "Regular time" : "Period \(period)"
}

func formatDistance(_ metres: Double, unit: String) -> String {
    unit == "mi" ? String(format: "%.1f mi", metres / 1609.344) : String(format: "%.1f km", metres / 1000)
}

/// A pitch's length or width (TRK-9): whole metres, or whole yards where distances are in miles, as the website's formatPitchSize.
func formatPitchSize(_ metres: Double, unit: String) -> String {
    unit == "mi" ? "\(Int((metres / 0.9144).rounded())) yd" : "\(Int(metres.rounded())) m"
}

func formatSpeed(_ mps: Double, unit: String) -> String {
    unit == "mi" ? String(format: "%.1f mph", mps * 2.236936) : String(format: "%.1f km/h", mps * 3.6)
}

/// TRK-11, WEB-28: under the sprints, what counts as one: "21 km/h or faster, 2 s or more", as the
/// website's, with its figures kept with their units and "2 s or more" on one line, so it wraps after
/// the comma rather than leaving a word alone.
func sprintsCaption(_ sprintKph: Double, unit: String) -> String {
    let speed = unit == "mi" ? "\(Int((sprintKph / 1.609344).rounded()))\u{00A0}mph" : "\(Int(sprintKph.rounded()))\u{00A0}km/h"
    return "\(speed) or faster, 2\u{00A0}s\u{00A0}or\u{00A0}more"
}

/// A kickoff with the zone it's shown in (the match's own).
struct PlayedKickoff: Equatable {
    let at: Date
    let zone: TimeZone
}

/// WEB-28: how much you've worked with a referee or at a venue, as the website's history.ts: the matches
/// played (with the first and last kickoffs) and those coming up.
struct WorkedTogether: Equatable {
    var played = 0
    var first: PlayedKickoff?
    var last: PlayedKickoff?
    var upcoming = 0
}

/// STAT-16: whether a match counts as a game: played or abandoned, with a kickoff (schema's isGame).
/// The one rule for every count of games: Stats', the match list's "played", and a venue's,
/// referee's, competition's and template's.
func isGame(_ m: Match) -> Bool { (m.status == "played" || m.status == "abandoned") && m.kickoff != nil }

func workedTogether(_ matches: [Match]) -> WorkedTogether {
    var t = WorkedTogether()
    for m in matches {
        if isGame(m) {
            t.played += 1
            if let at = instantOf(m.kickoff) {
                let k = PlayedKickoff(at: at, zone: zoneOf(m))
                if t.first.map({ at < $0.at }) ?? true { t.first = k }
                if t.last.map({ at > $0.at }) ?? true { t.last = k }
            }
        } else if m.status == "scheduled" {
            t.upcoming += 1
        }
    }
    return t
}

/// A record's slab's tag: "Since Sep 2026", the month of the first game (kept on one line); none
/// before one, as a caption with nothing to say (as the website's).
func sinceTag(_ t: WorkedTogether, locale: Locale = .current) -> String? {
    guard let first = t.first else { return nil }
    let f = DateFormatter()
    f.locale = locale
    f.timeZone = first.zone
    f.dateFormat = "MMM yyyy"
    return "Since " + f.string(from: first.at).replacingOccurrences(of: " ", with: "\u{00A0}")
}

func formatTemperature(_ celsius: Double, unit: String) -> String {
    unit == "f" ? "\(Int((celsius * 9 / 5 + 32).rounded()))°F" : "\(Int(celsius.rounded()))°C"
}

/// "54°", the short form for lists.
func formatDegrees(_ celsius: Double, unit: String) -> String { "\(Int((unit == "f" ? celsius * 9 / 5 + 32 : celsius).rounded()))°" }

/// Rain in millimeters, or inches for accounts set to miles.
func formatRain(_ mm: Double, distance: String) -> String {
    if distance == "mi" {
        let inches = mm / 25.4
        return String(format: inches < 0.1 ? "%.2f in" : "%.1f in", inches)
    }
    return mm < 10 ? String(format: "%.1f mm", mm) : "\(Int(mm.rounded())) mm"
}

/// Wind in km/h, or mph for accounts set to miles.
func formatWind(_ kph: Double, distance: String) -> String {
    distance == "mi" ? "\(Int((kph / 1.609344).rounded())) mph" : "\(Int(kph.rounded())) km/h"
}

/// Directions from where the user is to a place or an address (WEB-14), in the maps app chosen in
/// Settings: Apple Maps (automatic on iPhone), or Google Maps, whose link opens its app when it's
/// installed and Safari when it isn't.
func directionsURL(to place: String, app: String?) -> URL? {
    let at = place.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&+=?#"))) ?? place
    return URL(string: app == "google" ? "https://www.google.com/maps/dir/?api=1&destination=\(at)" : "https://maps.apple.com/?daddr=\(at)")
}

func directionsURL(lat: Double, lon: Double, app: String?) -> URL? { directionsURL(to: "\(lat),\(lon)", app: app) }

/// Where a venue goes on an overview map: its parking spot, else its first placed pitch.
func venuePosition(_ v: Venue) -> Position? { v.position ?? v.pitches.lazy.compactMap(\.position).first }

/// Upcoming: scheduled or postponed, kicking off today or later (or not yet given a time).
func isUpcoming(_ m: Match) -> Bool {
    guard m.status == "scheduled" || m.status == "postponed" else { return false }
    guard let kickoff = instantOf(m.kickoff) else { return true }
    return kickoff >= Calendar.current.startOfDay(for: AppClock.now)
}

let defaultFormat = MatchFormat(
    periods: 2, periodSec: 45 * 60, breakSec: 15 * 60, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 11, clock: "up",
    trackStoppage: false, breakStoppage: true, goalScorers: true, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 15 * 60, penalties: false,
    sinBins: false, sinBinSec: 10 * 60
)

extension String {
    /// Text in a field, or nil when it's empty.
    var orNil: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }

    /// A comma-separated field as its parts, or nil when there are none.
    var commaList: [String]? {
        let list = split(separator: ",").compactMap { String($0).orNil }
        return list.isEmpty ? nil : list
    }
}

/// Each id's count (MatchCount, the API's, as the server counts for duplicates): how much a venue or
/// referee has been in the matches (APP-19), as the web's lists count it; a match counts once for
/// each id `ids` gives.
func matchCounts(_ matches: [Match], ids: (Match) -> [String]) -> [String: MatchCount] {
    var counts: [String: MatchCount] = [:]
    for m in matches {
        for id in Set(ids(m)) {
            // STAT-16: games, as Stats counts them.
            if isGame(m) { counts[id, default: MatchCount(played: 0, upcoming: 0)].played += 1 }
            if m.status == "scheduled" { counts[id, default: MatchCount(played: 0, upcoming: 0)].upcoming += 1 }
        }
    }
    return counts
}

/// "12 matches · 2 coming up", "1 match", or "No matches yet".
func describeCount(_ c: MatchCount?) -> String {
    let parts = [
        (c?.played ?? 0) > 0 ? "\(c!.played) \(c!.played == 1 ? "match" : "matches")" : nil,
        (c?.upcoming ?? 0) > 0 ? "\(c!.upcoming) coming up" : nil,
    ].compactMap { $0 }
    return parts.isEmpty ? "No matches yet" : parts.joined(separator: " · ")
}
