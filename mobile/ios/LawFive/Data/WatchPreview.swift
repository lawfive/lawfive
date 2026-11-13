import Foundation

// UI-21 to UI-24, UI-27: the match screen's choices, and what the screen shows at a moment of a match,
// for the setup's pictures. The same as the website's (schema/src/screen.ts, web/src/watchPreview.ts) and
// Android's, and the clock readings the watches' own rules, tested with the same cases.

/// The account's match screen, complete. Left out, a choice is the old layouts' (one clock with names).
struct ScreenSetup: Equatable {
    var clocks = "one"
    var mainClock = "up"
    var secondClock = "down"
    var breakClock = "down"
    var edge = "none"
    var names = true

    /// UI-24: the nearest of the six old layouts, for watch builds that only know those.
    var nearestLayout: String {
        if clocks == "stacked" { return "stacked" }
        if clocks == "sideBySide" { return "sideBySide" }
        if !names { return "minimal" }
        return edge == "ring" ? "ring" : "default"
    }

    /// As it's saved in the account's settings.
    func saved(at changedAt: String) -> WatchScreen {
        WatchScreen(layout: nearestLayout, secondClock: WatchPreview.secondStyle(mainClock, secondClock), clocks: clocks, mainClock: mainClock,
                    breakClock: breakClock, edge: edge, names: names, changedAt: changedAt)
    }

    /// UI-24: what watches show until one is chosen: two clocks stacked, the time left over the match time, with the time of day and names.
    static let standard = ScreenSetup(clocks: "stacked", mainClock: "down", secondClock: "up", edge: "time")

    /// From a saved setup of any age: fields it lacks come from its layout; Scoreboard was dropped.
    init(_ saved: WatchScreen?) {
        guard let saved else {
            self = .standard
            return
        }
        let main = saved.mainClock ?? "up"
        clocks = saved.clocks ?? (saved.layout == "stacked" ? "stacked" : saved.layout == "sideBySide" ? "sideBySide" : "one")
        mainClock = main
        secondClock = WatchPreview.secondStyle(main, saved.secondClock)
        breakClock = saved.breakClock ?? "down"
        edge = saved.edge ?? (saved.layout == "ring" ? "ring" : "none")
        names = saved.names ?? (saved.layout != "minimal")
    }

    init(clocks: String = "one", mainClock: String = "up", secondClock: String = "down", breakClock: String = "down", edge: String = "none", names: Bool = true) {
        self.clocks = clocks
        self.mainClock = mainClock
        self.secondClock = secondClock
        self.breakClock = breakClock
        self.edge = edge
        self.names = names
    }
}

struct MatchMoment: Equatable {
    var halftime = false
    var period = 0
    var elapsedMs: Int64
    var stoppageMs: Int64 = 0
    var stoppageRunning = false
    var breakDueInMs: Int64?
    var breakDue = false
    var breakLeftMs: Int64?
}

struct ScreenPill: Equatable {
    var text: String
    var solid: Bool
}

/// What the screen shows; the picture draws it.
struct ScreenAt: Equatable {
    var halftime: Bool
    var period: String
    var clock: String
    var second: String?
    var added: String?
    var stoppage: ScreenPill?
    var breakPill: ScreenPill?
    var progress: Double = 0
    var breakClock: String?
    var breakOver = false
}

enum WatchPreview {
    /// A 2 × 45 match with a 15-minute half-time and a 2-minute halfway break: what the pictures show.
    static let periods = 2, periodSec = 45 * 60, halftimeSec = 15 * 60, breakSec = 2 * 60

    /// UI-22: the second clock is never a copy of the match clock.
    static func secondStyle(_ main: String, _ second: String) -> String { second != main ? second : main == "down" ? "upEach" : "down" }

    static func formatClock(_ ms: Int64) -> String {
        let total = max(ms, 0) / 1000
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    static func formatCountdown(_ ms: Int64) -> String { formatClock(ms + 999) }

    /// UI-2, TMR-16: the stoppage pill, as the watches' engines have it: the total until the period's length, then the
    /// added time still to play (0:00 for the second the added time alert fires), then the time over it ("+0:05").
    static func stoppagePill(_ totalMs: Int64, running: Bool, elapsedMs: Int64, periodMs: Int64) -> ScreenPill? {
        if !running && totalMs <= 0 { return nil }
        if elapsedMs < periodMs { return ScreenPill(text: formatClock(totalMs), solid: running) }
        let over = elapsedMs - periodMs - totalMs
        return ScreenPill(text: over >= 1000 ? "+" + formatClock(over) : formatCountdown(max(-over, 0)), solid: running)
    }

    /// UI-3.
    static func periodLabel(_ period: Int, _ count: Int) -> String {
        if period >= count { return "ET\(period - count + 1)" }
        if count == 2 { return "\(period + 1)H" }
        return count == 4 ? "Q\(period + 1)" : "P\(period + 1)"
    }

    /// TMR-11: the period's time in one of the styles, held at the period's end.
    static func clockText(_ style: String, _ period: Int, _ elapsedMs: Int64, periodSec: Int = periodSec) -> String {
        let periodMs = Int64(periodSec) * 1000
        let shown = min(elapsedMs, periodMs)
        if style == "up" { return formatClock(Int64(period) * periodMs + shown) }
        return style == "down" ? formatCountdown(periodMs - shown) : formatClock(shown)
    }

    /// TMR-4: time left or time taken.
    static func breakClockText(_ breakClock: String, _ leftMs: Int64, _ lengthMs: Int64) -> String {
        breakClock == "up" ? formatClock(lengthMs - leftMs) : formatCountdown(leftMs)
    }

    static func screenAt(_ setup: ScreenSetup, _ m: MatchMoment, tracked: Bool) -> ScreenAt {
        let periodMs = Int64(periodSec) * 1000
        let label = periodLabel(m.period, periods)
        if m.halftime {
            let length = Int64(halftimeSec) * 1000
            let left = max(length - m.elapsedMs, 0)
            return ScreenAt(halftime: true, period: label, clock: "", breakClock: breakClockText(setup.breakClock, left, length), breakOver: left == 0)
        }
        var breakPill: ScreenPill?
        if m.breakDue {
            breakPill = ScreenPill(text: "Break due", solid: true)
        } else if let left = m.breakLeftMs {
            breakPill = ScreenPill(text: breakClockText(setup.breakClock, left, Int64(breakSec) * 1000), solid: true)
        } else if let dueIn = m.breakDueInMs {
            breakPill = ScreenPill(text: formatCountdown(dueIn), solid: false)
        }
        return ScreenAt(
            halftime: false,
            period: label,
            clock: clockText(setup.mainClock, m.period, m.elapsedMs),
            second: setup.clocks == "one" ? nil : clockText(secondStyle(setup.mainClock, setup.secondClock), m.period, m.elapsedMs),
            added: m.elapsedMs >= periodMs ? "+" + formatClock(m.elapsedMs - periodMs) : nil,
            stoppage: tracked ? stoppagePill(m.stoppageMs, running: m.stoppageRunning, elapsedMs: m.elapsedMs, periodMs: periodMs) : nil,
            breakPill: breakPill,
            progress: min(Double(m.elapsedMs) / Double(periodMs), 1)
        )
    }

    /// Where a moment is in the match, for Play through: "1H 23:12", "2H 90:00 +1:12", "Half-time 3:00".
    static func momentLabel(_ m: MatchMoment) -> String {
        if m.halftime { return "Half-time " + formatClock(m.elapsedMs) }
        let periodMs = Int64(periodSec) * 1000
        let label = periodLabel(m.period, periods) + " " + clockText("up", m.period, m.elapsedMs)
        return m.elapsedMs > periodMs ? label + " +" + formatClock(m.elapsedMs - periodMs) : label
    }

    private static func mins(_ m: Int, _ s: Int = 0) -> Int64 { Int64(m * 60 + s) * 1000 }

    /// UI-27's moments, in the order the setup shows them; `stoppage` ones go when stoppage isn't tracked.
    static let moments: [(id: String, name: String, moment: MatchMoment, stoppage: Bool)] = [
        ("first", "1st half, 23:12", MatchMoment(elapsedMs: mins(23, 12), stoppageMs: mins(1, 4)), false),
        ("second", "2nd half, 67:40", MatchMoment(period: 1, elapsedMs: mins(22, 40), stoppageMs: mins(0, 38)), false),
        ("added", "Added time", MatchMoment(period: 1, elapsedMs: mins(46, 12), stoppageMs: mins(2)), false),
        ("stoppage", "Stoppage running", MatchMoment(elapsedMs: mins(31, 5), stoppageMs: mins(0, 24), stoppageRunning: true), true),
        ("paused", "Stoppage paused", MatchMoment(elapsedMs: mins(33, 40), stoppageMs: mins(1, 10)), true),
        ("coming", "Break coming up", MatchMoment(elapsedMs: mins(12), breakDueInMs: mins(9, 30)), false),
        ("due", "Break due", MatchMoment(elapsedMs: mins(21, 40), stoppageMs: mins(0, 30), breakDue: true), false),
        ("break", "Break running", MatchMoment(elapsedMs: mins(22, 30), stoppageMs: mins(1, 10), stoppageRunning: true, breakLeftMs: mins(1, 20)), false),
        ("halftime", "Half-time", MatchMoment(halftime: true, elapsedMs: mins(3)), false),
    ]

    /// Play through (UI-27): a whole 2 × 45 match at a point from 0 to 1, as the website's: the halfway break
    /// taken at 21:50 and added on (TMR-12), the first half ending at 47:00, half-time, and a second half with
    /// a 1:30 stoppage at 30:00 too, ending at 48:30.
    static func playAt(_ at: Double) -> MatchMoment {
        let first = mins(47), half = mins(15), second = mins(48, 30)
        var t = Int64(min(max(at, 0), 1) * Double(first + half + second))
        if t < first { return halfAt(0, t, []) }
        t -= first
        if t < half { return MatchMoment(halftime: true, elapsedMs: t) }
        return halfAt(1, t - half, [(mins(30), mins(31, 30))])
    }

    private static func halfAt(_ period: Int, _ t: Int64, _ stoppages: [(Int64, Int64)]) -> MatchMoment {
        let due = mins(21, 30), taken = mins(21, 50), end = taken + mins(2)
        let all = [(taken, end)] + stoppages
        return MatchMoment(
            period: period, elapsedMs: t,
            stoppageMs: all.reduce(0) { $0 + max(0, min(t, $1.1) - $1.0) },
            stoppageRunning: all.contains { t >= $0.0 && t < $0.1 },
            breakDueInMs: t < due ? due - t : nil,
            breakDue: t >= due && t < taken,
            breakLeftMs: t >= taken && t < end ? end - t : nil
        )
    }
}
