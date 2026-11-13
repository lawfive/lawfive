import Foundation

// The account's plan and what it's using (PLAN-6), in the same words as the website's Settings and
// the Android app. The server checks the limits; this only says what they are.

/// One limit: its name, what's used ("3"), what's allowed ("of 50", or "at most" before the figure), and how full.
struct PlanLine: Equatable {
    let label: String
    let figure: String
    let of: String?
    let share: Double?
}

private func trim(_ n: Double) -> String {
    let rounded = (n * 10).rounded() / 10
    return rounded.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(rounded)) : String(rounded)
}

private func sizeOf(_ mb: Double) -> String { mb >= 1024 ? "\(trim(mb / 1024)) GB" : "\(trim(mb)) MB" }

private func count(_ n: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_US")
    return f.string(from: NSNumber(value: n)) ?? String(n)
}

/// The limits the plan sets, and storage always, as it's what fills up.
func planLines(_ plan: AccountPlan) -> [PlanLine] {
    let l = plan.limits
    let u = plan.usage
    func counted(_ label: String, _ allowed: Int?, _ used: Int) -> PlanLine? {
        guard let allowed else { return nil }
        return PlanLine(label: label, figure: count(used), of: allowed == 0 ? "of none" : "of \(count(allowed))", share: allowed == 0 ? 1 : min(1, Double(used) / Double(allowed)))
    }
    func most(_ label: String, _ allowed: Int?, mb: Bool = false) -> PlanLine? {
        guard let allowed else { return nil }
        return PlanLine(label: label, figure: allowed == 0 ? "None" : mb ? sizeOf(Double(allowed)) : count(allowed), of: allowed == 0 ? nil : "at most", share: nil)
    }
    let storage = PlanLine(label: "Photos and tracks", figure: sizeOf(u.storageMb), of: l.storageMb.map { "of \(sizeOf(Double($0)))" },
                           share: l.storageMb.map { $0 == 0 ? 1 : min(1, u.storageMb / Double($0)) })
    return [
        counted("Matches", l.matches, u.matches),
        counted("Referees", l.referees, u.referees),
        counted("Venues", l.venues, u.venues),
        storage,
        most("Largest photo", l.photoMb, mb: true),
        most("Largest file", l.fileMb, mb: true),
        counted("Watches and phones", l.devices, u.devices),
        counted("Notifications today", l.pushPerDay, u.pushPerDay),
        counted("API keys", l.apiKeys, u.apiKeys),
        most("API requests a minute", l.apiCallsPerMinute),
        counted("API requests today", l.apiCallsPerDay, u.apiCallsPerDay),
        counted("Webhooks", l.webhooks, u.webhooks),
        // PLAN-11: older servers don't count them.
        counted("Address searches today", l.addressSearchesPerDay, u.addressSearchesPerDay ?? 0),
    ].compactMap { $0 }
}

/// "Until Sun, Nov 8, then Free", or nil for a plan that doesn't end.
func planEnd(_ plan: AccountPlan, today: Date = AppClock.now) -> String? {
    guard let text = plan.endsOn ?? plan.endsAt.map({ String($0.prefix(10)) }) else { return nil }
    let parse = DateFormatter()
    parse.locale = Locale(identifier: "en_US_POSIX")
    parse.timeZone = TimeZone(identifier: "UTC")
    parse.dateFormat = "yyyy-MM-dd"
    guard let day = parse.date(from: text) else { return nil }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC")!
    let show = DateFormatter()
    show.locale = Locale(identifier: "en_US")
    show.timeZone = TimeZone(identifier: "UTC")
    show.dateFormat = calendar.component(.year, from: day) == Calendar.current.component(.year, from: today) ? "EEE, MMM d" : "EEE, MMM d, yyyy"
    return "Until \(show.string(from: day))" + (plan.then.map { ", then \($0.name)" } ?? "")
}
