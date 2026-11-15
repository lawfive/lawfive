import Foundation

// Notifications from the server in words (PUSH-5, PUSH-6, NOTE-3), as Android's Push.kt and Notices.kt
// word them: the push says only which match or notice (PUSH-2), and the notification service
// extension asks the person's own server for the rest and writes these. The app's tests check them on
// Android's cases (PushTests).

/// The push's kinds, as the relay sends them in the data's `type`.
enum PushKind {
    static let weatherRisk = "weather-risk"
    static let matchChanged = "match-changed"
    static let test = "test"
}

/// A notice in words: one match says what happened to it; several say how many, with a line each.
struct NoticeWords: Equatable {
    let title: String
    let text: String
    /// One line a match, when there are several.
    let lines: [String]
    /// The match a tap opens; none opens the match list.
    let matchId: String?
    /// A Directions button, for a match moved to another venue that's still on.
    let directions: Bool
}

/// "Sat, Nov 7, 9:00 AM", in the match's own time zone: an ISO time and the zone's name.
typealias KickoffFormat = (_ iso: String, _ timeZone: String?) -> String?

/// NOTE-3: "Sat, Nov 7, 9:00 AM" in the match's time zone, or the phone's when it has none.
func noticeKickoff(_ iso: String, _ timeZone: String?) -> String? {
    guard let t = instantOf(iso) else { return nil }
    let zone = timeZone.flatMap { TimeZone(identifier: $0) } ?? .current
    return "\(formatShortDay(t, zone: zone)), \(formatTime(t, zone: zone))"
}

/// What happened to one match, as a notification's title says it: "Kickoff moved: Strikers v Rovers".
func headline(_ m: MatchNoticeMatchesItem) -> String {
    let c = m.changes
    let what: String
    if c.contains(MatchNoticeChange.added) { what = "New match" }
    else if c.contains(MatchNoticeChange.removed) { what = "Removed" }
    else if c.contains(MatchNoticeChange.canceled) { what = "Canceled" }
    else if c.contains(MatchNoticeChange.postponed) { what = "Postponed" }
    else if c.contains(MatchNoticeChange.backOn) { what = "Back on" }
    else if c.contains(MatchNoticeChange.kickoff) && c.contains(MatchNoticeChange.venue) { what = "Kickoff and venue changed" }
    else if c.contains(MatchNoticeChange.kickoff) { what = "Kickoff moved" }
    else { what = "Venue changed" }
    return "\(what): \(m.title)"
}

/// The rest: when and where it is now, and what it was when that's what changed.
func detail(_ m: MatchNoticeMatchesItem, time: KickoffFormat) -> String {
    let c = m.changes
    let kickoff = m.kickoff.flatMap { time($0, m.timeZone) }
    let before = m.previousKickoff.flatMap { time($0, m.timeZone) }
    let moved = c.contains(MatchNoticeChange.kickoff) && !c.contains(MatchNoticeChange.backOn)
    let elsewhere = c.contains(MatchNoticeChange.venue) && !c.contains(MatchNoticeChange.backOn)
    let parts: [String?]
    if c.contains(MatchNoticeChange.postponed) {
        parts = [kickoff.map { "Was \($0)" }, m.venue]
    } else if moved && elsewhere {
        let was = ([before.map { "was \($0)" } ?? "was", m.previousVenue.map { "at \($0)" }].compactMap { $0 }).joined(separator: " ")
        parts = [([kickoff.map { "Now \($0)" } ?? "Now", m.venue.map { "at \($0)" }].compactMap { $0 }).joined(separator: " "), was == "was" ? nil : was]
    } else if moved {
        parts = [kickoff.map { "Now \($0)" }, before.map { "was \($0)" }, m.venue]
    } else if elsewhere {
        parts = [m.venue.map { "Now at \($0)" }, m.previousVenue.map { "was \($0)" }, kickoff]
    } else {
        parts = [kickoff, m.venue]
    }
    return parts.compactMap { $0 }.joined(separator: " · ")
}

/// NOTE-3: a notice in words; nil when nothing in it changed.
func noticeWords(_ notice: MatchNotice, time: KickoffFormat) -> NoticeWords? {
    let matches = notice.matches.filter { !$0.changes.isEmpty }
    if matches.count == 1, let one = matches.first {
        let gone = one.changes.contains(MatchNoticeChange.removed)
        let off = gone || one.changes.contains(MatchNoticeChange.canceled) || one.changes.contains(MatchNoticeChange.postponed)
        return NoticeWords(title: headline(one), text: detail(one, time: time), lines: [], matchId: gone ? nil : one.matchId,
                           directions: !off && one.changes.contains(MatchNoticeChange.venue))
    }
    guard !matches.isEmpty else { return nil }
    let allAdded = matches.allSatisfy { $0.changes.contains(MatchNoticeChange.added) }
    let title = "\(notice.source) \(allAdded ? "added" : "changed") \(matches.count) matches"
    let lines = matches.map { m in [allAdded ? m.title : headline(m), m.kickoff.flatMap { time($0, m.timeZone) }].compactMap { $0 }.joined(separator: ", ") }
    return NoticeWords(title: title, text: lines[0] + (lines.count > 1 ? ", and \(lines.count - 1) more" : ""), lines: lines, matchId: nil, directions: false)
}

/// NOTE-3: matches whose reminders no longer hold: off, gone, or kicking off at another time.
func remindersGone(_ notice: MatchNotice) -> [String] {
    let off = [MatchNoticeChange.canceled, MatchNoticeChange.postponed, MatchNoticeChange.removed, MatchNoticeChange.kickoff]
    return notice.matches.filter { m in m.changes.contains { off.contains($0) } }.map(\.matchId)
}

/// "Storms likely, Rain possible": the likeliest first.
func riskLine(_ w: MatchWeather) -> String {
    (w.risks.filter { $0.level == "likely" } + w.risks.filter { $0.level != "likely" }).map(riskTitle).joined(separator: ", ")
}

/// PUSH-5: under the match's name, "Storms likely · tomorrow, 9:00 AM", or "Mon, Nov 16, 9:00 AM" further off, in the match's time zone.
func riskText(_ w: MatchWeather, kickoff: Date?, zone: TimeZone) -> String {
    [riskLine(w), kickoff.map { whenText($0, zone: zone, today: true) }].compactMap { $0 }.joined(separator: " · ")
}

/// The words a notification keeps when its details can't be had (no signal, signed out, or the server
/// doesn't have them any more), saying nothing about a match, as the relay's own placeholder does.
enum PushFallback {
    static let title = "LawFive"
    static let weatherRisk = "The forecast for one of your matches has changed. Open LawFive to see it."
    static let matchChanged = "An integration changed your matches. Open LawFive to see what's new."
    static let other = "There's an update on a match."
    /// PUSH-6: an admin's test, which has nothing to look up.
    static let testTitle = "Test notification"
    static let testBody = "Notifications from your LawFive server are reaching this phone."
}
