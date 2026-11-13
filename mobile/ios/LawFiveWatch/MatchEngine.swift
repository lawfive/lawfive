import Foundation

// A match in progress (WCH-2): the same rules as the Garmin watch's Match.mc and Wear OS's MatchEngine.kt,
// with the same requirement IDs. All clocks come from stored start times, and the whole state is saved on
// every change, so a match survives the app being closed (TMR-8). Nothing here touches watchOS, so
// tools/test-watch-engine.sh tests it on the Mac.

/// golden (ET-6): a golden goal in extra time, End match or Undo, while the clock runs on. suspended (TMR-13): play
/// stopped for a lightning or weather delay, every clock standing still until Resume. Only append: saved as numbers.
enum Phase: Int, Codable { case pre, ready, running, breakTime, done, nextKickoff, decide, penalties, golden, suspended }
/// lightning: TMR-13's 30:00 countdown at zero, one long vibration as VIB-3's. sinBinEnd: EVT-12's sin bin over,
/// repeating as VIB-1's until a button is pressed.
enum Alert { case breakEnd, fullTime, addedTime, breakStart, reminder, lightning, sinBinEnd }
enum Decision { case extraTime, penalties, endMatch }

let home = 0
let away = 1

enum EventType {
    static let goal = "G", ownGoal = "GO", penGoal = "GP", dfkGoal = "GF"
    static let yellow = "Y", red = "R", secondYellow = "Y2"
    /// EVT-15: a team official's caution and send-off, with the role in extra (officialRoles); EVT-16 an injury.
    static let officialYellow = "TY", officialRed = "TR", injury = "I"
    static let stoppage = "S", periodEnd = "E", penScored = "PG", penMissed = "PM"
    /// TMR-14: the match clock and the added time corrected, the change in seconds in extra.
    static let clockAdjusted = "CK", addedAdjusted = "CA"
    /// EVT-11: the reason's number in extra.
    static let abandon = "A"
    /// TMR-13: play suspended, the reason's number in extra (as an abandonment's), and resumed, the whole seconds suspended in extra.
    static let suspended = "SU", resumed = "RS"
    /// EVT-12: a sin bin, its length in seconds in extra; a second for the same number, a send-off, with the length too.
    static let sinBin = "SB", secondSinBin = "SB2"
}

/// TMR-13: the reasons play is suspended for, by the numbers an abandonment's have (3, not enough players, isn't one).
let suspendReasons: [(Int, String)] = [(0, "Weather"), (1, "Lightning"), (2, "Crowd trouble"), (4, "Other")]
let lightningReason = 1
/// TMR-13: the US 30-minute rule, started over by each strike.
let lightningWaitMs: Int64 = 30 * 60 * 1000

enum EventTime {
    static let beforeKickoff = -1, atBreak = -2, afterFullTime = -3, penalties = -4
}

// TMR-11, as the server's clockStyle numbers.
let clockUp = 0, clockUpEach = 1, clockDown = 2

// UI-21: the match screen's choices, as the Garmin watch numbers them; TMR-4 the break clock's.
let clocksOne = 0, clocksStacked = 1, clocksSideBySide = 2
let edgeNone = 0, edgeRing = 1, edgeTime = 2
let breakDown = 0, breakUp = 1

// The six layouts before UI-21's choices, as older servers and saved matches name them.
let layoutDefault = 0, layoutStacked = 1, layoutMinimal = 2, layoutScoreboard = 3, layoutSideBySide = 4, layoutRing = 5

/// UI-21 to UI-23, TMR-4, TMR-11: the match screen. Left out, a choice is the old layouts' (one clock with names).
struct WatchScreen: Codable, Equatable {
    var clocks = clocksOne
    var mainClock = clockUp
    var secondClock = clockDown
    var breakClock = breakDown
    var edge = edgeNone
    var names = true

    /// UI-22: never the same style as the match clock.
    var second: Int { secondClock != mainClock ? secondClock : (mainClock == clockDown ? clockUpEach : clockDown) }

    /// UI-24: the nearest old layout, for servers from before UI-21's choices.
    var nearestLayout: Int {
        if clocks == clocksStacked { return layoutStacked }
        if clocks == clocksSideBySide { return layoutSideBySide }
        if !names { return layoutMinimal }
        return edge == edgeRing ? layoutRing : layoutDefault
    }

    /// UI-24: what the watch shows until one is chosen: two clocks stacked, the time left over the match time, with the time of day and names.
    static let standard = WatchScreen(clocks: clocksStacked, mainClock: clockDown, secondClock: clockUp, edge: edgeTime)

    /// One of the six old layouts as the choices; Scoreboard was dropped and becomes one clock with names.
    static func fromLayout(_ layout: Int, mainClock: Int, secondClock: Int, breakClock: Int = breakDown) -> WatchScreen {
        WatchScreen(
            clocks: layout == layoutStacked ? clocksStacked : layout == layoutSideBySide ? clocksSideBySide : clocksOne,
            mainClock: mainClock, secondClock: secondClock, breakClock: breakClock,
            edge: layout == layoutRing ? edgeRing : edgeNone, names: layout != layoutMinimal)
    }
}

func isGoal(_ type: String) -> Bool { [EventType.goal, EventType.ownGoal, EventType.penGoal, EventType.dfkGoal].contains(type) }
func isKick(_ type: String) -> Bool { type == EventType.penScored || type == EventType.penMissed }
func isAdjustment(_ type: String) -> Bool { type == EventType.clockAdjusted || type == EventType.addedAdjusted }
/// INP-6: what Undo can take back: goals, cards (a team official's too), injuries and shoot-out kicks; not stoppages or periods' ends.
/// TMR-14: a clock's correction too, but only while its period is being played, as it moves the running clock.
func isUndoable(_ type: String, playing: Bool) -> Bool {
    isGoal(type) || isKick(type) || [EventType.yellow, EventType.secondYellow, EventType.red, EventType.officialYellow, EventType.officialRed, EventType.injury,
                                     EventType.sinBin, EventType.secondSinBin].contains(type)
        || (playing && isAdjustment(type))
}
/// EVT-12: what sends a player off, so a sin bin running for them ends without a return.
func isSendOff(_ type: String) -> Bool { type == EventType.red || type == EventType.secondYellow || type == EventType.secondSinBin }
/// EVT-14: the cards that take a reason: a player's caution, second caution, send-off and sin bins, and a team official's cards.
func isCard(_ type: String) -> Bool {
    [EventType.yellow, EventType.secondYellow, EventType.red, EventType.sinBin, EventType.secondSinBin, EventType.officialYellow, EventType.officialRed].contains(type)
}
/// EVT-14: whether a card's reason comes from the send-offs' codes rather than the cautions'.
func isSendOffCard(_ type: String) -> Bool { type == EventType.red || type == EventType.officialRed }
/// EVT-15: a team official's role, by the number the watches keep and upload.
let officialRoles = ["Head coach", "Assistant coach", "Other"]

func formatClock(_ ms: Int64) -> String {
    let total = ms / 1000
    return "\(total / 60):" + String(format: "%02d", total % 60)
}

func formatCountdown(_ ms: Int64) -> String { formatClock(ms + 999) }

/// UI-2, UI-4, TMR-16: the stoppage pill's text and whether it's solid (a stoppage running); nil until there's stoppage
/// time. Before the period's length it shows the total (TMR-3); from the length the added time still to play (the total
/// less the time past the length), held while a stoppage runs then, 0:00 for the second the added time alert fires
/// (VIB-7), then the time over it ("+0:05").
func stoppagePillAt(_ totalMs: Int64, running: Bool, elapsedMs: Int64, periodMs: Int64) -> (text: String, solid: Bool)? {
    if !running && totalMs <= 0 { return nil }
    if elapsedMs < periodMs { return (formatClock(totalMs), running) }
    let over = elapsedMs - periodMs - totalMs
    return (over >= 1000 ? "+" + formatClock(over) : formatCountdown(max(-over, 0)), running)
}

/// TMR-14: a clock's change as the watches show it: "+0:40", "−1:05" (U+2212).
func formatChange(_ sec: Int) -> String { (sec < 0 ? "\u{2212}" : "+") + formatClock(Int64(abs(sec)) * 1000) }

/// INP-3: a period spelled out, for the game menu's rows, as Wear OS's: "first half", "second quarter", "third
/// period", "extra time 1" ("extra time" when it has one period).
func periodName(_ period: Int, _ numPeriods: Int, etPeriods: Int = 2) -> String {
    if period >= numPeriods { return etPeriods == 1 ? "extra time" : "extra time \(period - numPeriods + 1)" }
    // SET-16: one period is just "period" ("End period" before extra time or penalties).
    if numPeriods == 1 { return "period" }
    let nth = ["first", "second", "third", "fourth"]
    let name = period < nth.count ? nth[period] : "\(period + 1)th"
    return name + (numPeriods == 2 ? " half" : numPeriods == 4 ? " quarter" : " period")
}

/// UI-3: "1H", "Q1" with four periods, "P1" with three, "ET1"; nothing for a match of one period (SET-16).
func periodLabel(_ period: Int, _ numPeriods: Int) -> String {
    if period >= numPeriods { return "ET\(period - numPeriods + 1)" }
    if numPeriods == 1 { return "" }
    if numPeriods == 2 { return "\(period + 1)H" }
    if numPeriods == 4 { return "Q\(period + 1)" }
    return "P\(period + 1)"
}

/// SET-16: a period's label before a time, "1H 23:40", or the time alone for a match of one period.
func withPeriod(_ period: Int, _ numPeriods: Int, _ text: String) -> String {
    let label = periodLabel(period, numPeriods)
    return label.isEmpty ? text : "\(label) \(text)"
}

struct MatchEvent: Codable, Equatable {
    var type: String
    var team: Int
    var period: Int
    var seconds: Int
    var player: Int?
    var extra: Int?
    /// EVT-14: the card's misconduct code from the match's scheme ("UB"). Optional, so a match saved before it still loads.
    var reason: String?
}

/// What a match is started from: a downloaded match's format, or Quick match's (SET-9).
struct MatchSetup: Codable, Equatable {
    var matchId: String?
    var home = "HOM"
    var away = "AWY"
    var homeName = ""
    var awayName = ""
    var homeColor = -1
    var awayColor = -1
    var numPeriods = 2
    var periodSec = 45 * 60
    var halftimeSec = 15 * 60
    var teamSize = 11
    var midBreak = false
    var breakLenSec = 120
    var extraTime = false
    var etPeriods = 2
    var etPeriodSec = 15 * 60
    /// ET-6: with extra time, a goal in it ends the match. Optional, so a setup saved before it still loads.
    var goldenGoal: Bool?
    var penalties = false
    var clockStyle = clockUp
    var trackStoppage = false
    var breakStoppage = true
    var goalScorers = true
    var goalTypes = false
    /// SET-8: the stoppage and break timers' names, copied in when the match is created. Optional, so a setup saved before them still loads.
    var stoppageLabel: String?
    var breakLabel: String?
    /// EVT-12: Sin bin in the team menu, for sinBinSec of the match clock. Optional, so a setup saved before them still loads.
    var sinBins: Bool?
    var sinBinSec: Int?
    /// TMR-15: the match clock stops while play does (with stoppage tracked), and a goal or card recorded stops it.
    /// Optional, so a setup saved before them still loads (the clock runs on; goals and cards stop it).
    var stoppingClock: Bool?
    var stopForGoalsCards: Bool?

    var hasSinBins: Bool { sinBins == true }
    /// TMR-15: the clock that stops.
    var stops: Bool { stoppingClock == true }
    /// TMR-15: a goal or card recorded stops a stopping clock.
    var stopsForGoalsCards: Bool { stops && stopForGoalsCards != false }
    var sinBinLength: Int { sinBinSec ?? 600 }

    var stoppageTimer: String { stoppageLabel ?? "stoppage" }
    var breakTimer: String { breakLabel ?? "break" }

    /// "2×45' · HT 15'", and "1×20'" for one period, whose break is only before extra time (SET-16).
    var summary: String {
        let periods = "\(numPeriods)×\(periodSec / 60)'"
        return numPeriods == 1 ? periods : "\(periods) · HT \(halftimeSec / 60)'"
    }
    /// SET-13: "2×45' · HT 15' · ET · Pens", for Same as last.
    var fullSummary: String { summary + (!extraTime ? "" : goldenGoal == true ? " · ET GG" : " · ET") + (penalties ? " · Pens" : "") + (hasSinBins ? " · SB \(sinBinLength / 60)'" : "") + (stops ? " · Stop clock" : "") }

    /// SET-13: only the format, for Same as last: no teams, colors or names.
    var format: MatchSetup {
        MatchSetup(numPeriods: numPeriods, periodSec: periodSec, halftimeSec: halftimeSec, teamSize: teamSize, midBreak: midBreak, breakLenSec: breakLenSec,
                   extraTime: extraTime, etPeriods: etPeriods, etPeriodSec: etPeriodSec, goldenGoal: goldenGoal, penalties: penalties,
                   trackStoppage: trackStoppage, breakStoppage: breakStoppage, goalScorers: goalScorers, goalTypes: goalTypes,
                   sinBins: sinBins, sinBinSec: sinBinSec, stoppingClock: stoppingClock, stopForGoalsCards: stopForGoalsCards)
    }

    /// SET-13: whether two setups have the same format, so New match can leave out Same as last when it's Quick match over again.
    func sameFormat(as other: MatchSetup) -> Bool {
        var (a, b) = (format, other.format)
        (a.goldenGoal, b.goldenGoal) = (a.goldenGoal ?? false, b.goldenGoal ?? false)
        (a.sinBins, b.sinBins) = (a.hasSinBins, b.hasSinBins)
        (a.sinBinSec, b.sinBinSec) = (a.sinBinLength, b.sinBinLength)
        (a.stoppingClock, b.stoppingClock) = (a.stops, b.stops)
        (a.stopForGoalsCards, b.stopForGoalsCards) = (a.stopForGoalsCards != false, b.stopForGoalsCards != false)
        return a == b
    }

    /// Where period `p` starts in the match, in seconds (TMR-11).
    func periodStartSec(_ p: Int) -> Int { p < numPeriods ? p * periodSec : numPeriods * periodSec + (p - numPeriods) * etPeriodSec }

    /// This setup with `format`'s format, keeping its teams and colors.
    func withFormat(_ format: MatchSetup) -> MatchSetup {
        var setup = format
        (setup.home, setup.away, setup.homeName, setup.awayName, setup.homeColor, setup.awayColor) = (home, away, homeName, awayName, homeColor, awayColor)
        return setup
    }
}

extension String {
    /// "Stoppage" for the start of a menu row.
    var capitalized1: String { prefix(1).uppercased() + dropFirst() }
}

final class Match: Codable {
    let setup: MatchSetup
    let created: Int64
    var repeatSec = 10
    var reminderSec = 10
    var vibeFullTime = true
    var vibeStoppage = true
    var vibeBreak = true
    /// VIB-7. Optional, so a match saved before it still loads.
    var vibeAdded: Bool?
    /// EVT-12: the sin bin return's vibration. Optional, so a match saved before it still loads.
    var vibeSinBin: Bool?
    /// Matches saved before UI-21's choices: their layout and second clock, read into `shown`.
    var faceLayout = layoutDefault
    var secondClock = clockDown
    /// UI-21: the match screen, fixed at kickoff. Optional, so a match saved before it still loads.
    var screen: WatchScreen?
    var phase = Phase.pre
    var period = 0
    var kickoff = -1
    var periodStart: Int64?
    var stoppageMs: Int64 = 0
    var stoppageStart: Int64?
    var breakEnd: Int64?
    var breakIsHalftime = false
    var scheduledBreakDone = false
    var fullTimeAcked = false
    /// VIB-7: once a period.
    var addedAcked: Bool?
    /// VIB-1: stoppage tracked, but none when the period's length was reached, so full time repeats.
    var fullTimeRepeats: Bool?
    var breakDue = false
    var breakDueSilenced = false
    var breakEndAlerted = false
    var breakStoppageRunning = false
    var score = [0, 0]
    var events: [MatchEvent] = []
    var penFirst = -1
    var penStarted = false
    var startedAt: [Int64] = []
    // DIAG-1: [period, 0 kickoff or 1 its end, percent], and times the app started again mid-match.
    // Optional, so a match saved before these still loads.
    var batteryLog: [[Int]]?
    var restarts: Int?
    // PRE-8: the compass heading (radians) of the goal the home team attacks in the first period.
    var homeHeading: Double?
    // ET-7: a new toss decides extra time: the team kicking off ET1 (nil until chosen) and the heading of
    // the goal the home team attacks in ET1, kept apart from the above. Optional, so a match saved before
    // them still loads.
    var etKickoff: Int?
    var etHomeHeading: Double?
    /// ET-6: it ended on a golden goal. Optional, so a match saved before it still loads.
    var endedGolden: Bool?
    /// TRK-7: whether this match keeps a track, from Record track when it was set up; nil is yes.
    var recordTrack: Bool?
    /// SYNC-7: how far the referee ran, in meters, set at full time.
    var distanceM: Double?
    // DIAG-1: the track's samples, those without a GPS fix, and seconds from kickoff to the first fix.
    var gpsSamples: Int?
    var gpsMissed: Int?
    var gpsFirstFixSec: Int?
    /// TMR-13: while suspended, when it was, why, and when the lightning countdown last started (lightning only).
    /// Optional, so a match saved before them still loads.
    var suspendedAt: Int64?
    var suspendReason: Int?
    var lightningFrom: Int64?
    var lightningAlerted: Bool?
    /// EVT-12: the sin bins over, waiting for a button for "can return", in the order they ended, by their place in
    /// events; and the time played at the last tick, so each one's end is announced once. Saved, so a restart
    /// neither loses one nor announces it again. Optional, so a match saved before them still loads.
    private(set) var sinBinWaiting: [Int]?
    private var sinBinCheckedMs: Int64?
    /// EVT-14: the misconduct scheme the card reasons are listed from ("ifab", "ussf", "fa"), fixed when the match is
    /// begun: the planned match's, else the account's. Optional, so a match saved before it still loads (IFAB's).
    var misconductScheme: String?
    /// DIAG-1: one track sample, and whether it had a GPS fix.
    func noteGps(_ hadFix: Bool, now: Int64) {
        gpsSamples = (gpsSamples ?? 0) + 1
        if !hadFix {
            gpsMissed = (gpsMissed ?? 0) + 1
        } else if gpsFirstFixSec == nil, let first = startedAt.first {
            gpsFirstFixSec = max(Int(now / 1000 - first), 0)
        }
    }

    /// The watch's battery in percent, set by the app: the rules know nothing of watchOS.
    nonisolated(unsafe) static var battery: () -> Int? = { nil }

    // Alert timing only matters while the app is running, so it isn't saved.
    private var lastRepeat: Int64 = 0
    private var lastReminder: Int64 = 0

    private enum CodingKeys: String, CodingKey {
        case setup, created, repeatSec, reminderSec, vibeFullTime, vibeStoppage, vibeBreak, vibeAdded, faceLayout, secondClock, screen, phase, period, kickoff, periodStart, stoppageMs, stoppageStart
        case breakEnd, breakIsHalftime, scheduledBreakDone, fullTimeAcked, addedAcked, fullTimeRepeats, breakDue, breakDueSilenced, breakEndAlerted, breakStoppageRunning, score, events, penFirst, penStarted, startedAt, batteryLog, restarts, homeHeading, etKickoff, etHomeHeading, endedGolden
        case recordTrack, distanceM, gpsSamples, gpsMissed, gpsFirstFixSec
        case suspendedAt, suspendReason, lightningFrom, lightningAlerted
        case vibeSinBin, sinBinWaiting, sinBinCheckedMs
        case misconductScheme
    }

    init(setup: MatchSetup, created: Int64) {
        var setup = setup
        // TMR-15: the clock stops with the stoppage clock, so it needs it tracked.
        if setup.stops { setup.trackStoppage = true }
        self.setup = setup
        self.created = created
    }

    /// TMR-15: the stopping clock standing still, while a stoppage runs (shown in orange).
    var clockStopped: Bool { setup.stops && stoppageStart != nil }

    // TMR-7: centered on halfway, so due half the break's length before it.
    var breakAtSec: Int { setup.midBreak ? max((setup.periodSec - setup.breakLenSec) / 2, 0) : -1 }
    var isExtraTime: Bool { period >= setup.numPeriods }
    var currentPeriodSec: Int { isExtraTime ? setup.etPeriodSec : setup.periodSec }
    var isStoppageActive: Bool { stoppageStart != nil }
    var isLastPeriod: Bool { isExtraTime ? period >= setup.numPeriods + setup.etPeriods - 1 : period >= setup.numPeriods - 1 }
    var canExtraTime: Bool { setup.extraTime && !isExtraTime }
    var canPenalties: Bool { setup.penalties && phase != .penalties }
    var periodEndsMatch: Bool { isLastPeriod && !canExtraTime && !canPenalties }
    var isHalftime: Bool { setup.numPeriods == 2 && period == 0 }
    /// ET-7: whether the period being played, or about to kick off, is in extra time.
    private var aboutExtraTime: Bool { phase == .nextKickoff ? period + 1 >= setup.numPeriods : isExtraTime }

    /// The team that kicked off the match, or extra time once it's on (PRE-3, ET-7).
    var firstKickoff: Int { aboutExtraTime ? etKickoff ?? -1 : kickoff }

    /// PRE-8: once the kickoff team is chosen, until the end of the first period; ET-7: again for ET1.
    var canRecordDirection: Bool {
        if phase == .nextKickoff { return period + 1 == setup.numPeriods && (etKickoff ?? -1) >= 0 }
        return phase == .ready || (phase == .running && (period == 0 || period == setup.numPeriods))
    }
    var hasDirection: Bool { (aboutExtraTime ? etHomeHeading : homeHeading) != nil }

    /// PRE-8: the referee faced the goal the current kickoff team attacks in the first period (or ET1, ET-7).
    func setKickoffHeading(_ heading: Double) {
        let home = normalizeHeading(firstKickoff == away ? heading + .pi : heading)
        if aboutExtraTime { etHomeHeading = home } else { homeHeading = home }
    }

    /// PRE-8: teams change ends each period; extra time counts the same way from its own toss (ET-7).
    func attackHeading(_ p: Int) -> Double? {
        let extra = p >= setup.numPeriods
        guard let heading = extra ? etHomeHeading : homeHeading else { return nil }
        let flip = (kickoffFor(p) == away) != ((extra ? p - setup.numPeriods : p) % 2 == 1)
        return flip ? normalizeHeading(heading + .pi) : heading
    }

    var kickoffTeamOnScreen: Int { phase == .nextKickoff ? kickoffFor(period + 1) : kickoff }

    func teamName(_ team: Int) -> String { team == home ? setup.home : setup.away }
    func teamColor(_ team: Int) -> Int { team == home ? setup.homeColor : setup.awayColor }
    /// TMR-13: every clock stands where it was while play is suspended.
    private func clockNow(_ now: Int64) -> Int64 {
        if phase == .suspended, let at = suspendedAt { return min(now, at) }
        return now
    }
    /// The period's time. TMR-15: on a stopping clock, less the time stopped (the stoppage clock), and held at the
    /// period's length, as there's no added time.
    func matchMs(_ now: Int64) -> Int64 {
        guard let start = periodStart else { return 0 }
        let elapsed = clockNow(now) - start
        return setup.stops ? min(elapsed - stoppageTotalMs(now), Int64(currentPeriodSec) * 1000) : elapsed
    }
    func stoppageTotalMs(_ now: Int64) -> Int64 { stoppageMs + (stoppageStart.map { clockNow(now) - $0 } ?? 0) }
    func breakRemainingMs(_ now: Int64) -> Int64? { breakEnd.map { max($0 - clockNow(now), 0) } }
    /// TMR-13: how long play has been suspended, counting up; nil when it isn't.
    func suspendedMs(_ now: Int64) -> Int64? {
        guard phase == .suspended, let at = suspendedAt else { return nil }
        return max(now - at, 0)
    }
    /// TMR-13: for lightning, the 30:00 countdown's time left, held at 0:00; nil otherwise.
    func lightningLeftMs(_ now: Int64) -> Int64? {
        guard phase == .suspended, let from = lightningFrom else { return nil }
        return max(from + lightningWaitMs - now, 0)
    }
    var isLightning: Bool { phase == .suspended && suspendReason == lightningReason }
    /// PRE-5; extra time alternates from its own kickoff team (ET-7).
    func kickoffFor(_ p: Int) -> Int {
        let extra = p >= setup.numPeriods
        let first = extra ? etKickoff ?? -1 : kickoff
        return first < 0 ? -1 : ((extra ? p - setup.numPeriods : p) % 2 == 0 ? first : 1 - first)
    }
    func periodStartSec(_ p: Int) -> Int { setup.periodStartSec(p) }

    /// TMR-11, TMR-2: the clock as shown, and the added time under it once the period's length is reached.
    func clockDisplay(_ now: Int64) -> (clock: String, added: String?) {
        let elapsed = matchMs(now)
        let periodMs = Int64(currentPeriodSec) * 1000
        // TMR-15: a stopping clock has no added time.
        return (clockText(clockStyle, now), elapsed >= periodMs && !setup.stops ? "+" + formatClock(elapsed - periodMs) : nil)
    }

    /// UI-2, TMR-16: the stoppage pill, with stoppage tracked: the total, then from the length the added time left. None on
    /// a stopping clock (TMR-15).
    func stoppagePill(_ now: Int64) -> (text: String, solid: Bool)? {
        setup.trackStoppage && !setup.stops ? stoppagePillAt(stoppageTotalMs(now), running: isStoppageActive, elapsedMs: matchMs(now), periodMs: Int64(currentPeriodSec) * 1000) : nil
    }

    /// UI-21: the match screen; a match saved before the choices has its layout's.
    var shown: WatchScreen { screen ?? WatchScreen.fromLayout(faceLayout, mainClock: setup.clockStyle, secondClock: secondClock) }

    /// TMR-11: taken from the match screen at kickoff.
    var clockStyle: Int { shown.mainClock }

    private func clockText(_ style: Int, _ now: Int64) -> String {
        let periodMs = Int64(currentPeriodSec) * 1000
        let shown = min(matchMs(now), periodMs)
        if style == clockUp { return formatClock(Int64(periodStartSec(period)) * 1000 + shown) }
        if style == clockDown { return formatCountdown(periodMs - shown) }
        return formatClock(shown)
    }

    /// UI-22: never a copy of the main clock.
    func secondClockText(_ now: Int64) -> String { clockText(shown.second, now) }

    /// TMR-4: the break clock as shown, time left or time taken; nil when no break is running.
    func breakClockText(_ now: Int64) -> String? {
        guard let remaining = breakRemainingMs(now) else { return nil }
        if shown.breakClock != breakUp { return formatCountdown(remaining) }
        let length = Int64(breakIsHalftime ? setup.halftimeSec : setup.breakLenSec) * 1000
        return formatClock(length - remaining)
    }

    /// UI-23: from 0 to 1, and 1 through added time.
    func periodProgress(_ now: Int64) -> Double { min(Double(matchMs(now)) / Double(currentPeriodSec * 1000), 1) }

    /// VIB-1: the period's length reached, and its alert not yet answered (with stoppage tracked, not yet given).
    private func fullTimeDue(_ now: Int64) -> Bool { phase == .running && vibeFullTime && !fullTimeAcked && matchMs(now) >= Int64(currentPeriodSec) * 1000 }
    /// VIB-1: full time repeats until a button without stoppage tracked, and with it when there was no stoppage time at the
    /// length (no added time alert would follow); otherwise it's one vibration as added time starts.
    private func fullTimeAlertActive(_ now: Int64) -> Bool { (!setup.trackStoppage || fullTimeRepeats == true) && fullTimeDue(now) }
    /// VIB-7: with stoppage tracked, once the period's length and its added time (the stoppage total) have both passed.
    private func addedAlertActive(_ now: Int64) -> Bool {
        // TMR-15: none on a stopping clock, which has no added time.
        guard phase == .running, setup.trackStoppage, !setup.stops, vibeAdded ?? true, !(addedAcked ?? false) else { return false }
        let added = stoppageTotalMs(now)
        return added > 0 && matchMs(now) >= Int64(currentPeriodSec) * 1000 + added
    }
    private var breakDueAlertActive: Bool { phase == .running && vibeBreak && breakDue && !breakDueSilenced }
    /// EVT-12: a sin bin over, during play, with its vibration on.
    private var sinBinAlertActive: Bool { (phase == .running || phase == .golden) && (vibeSinBin ?? true) && !(sinBinWaiting ?? []).isEmpty }
    func hasActiveAlert(_ now: Int64) -> Bool { fullTimeAlertActive(now) || addedAlertActive(now) || breakDueAlertActive || sinBinAlertActive }

    /// UI-12: from 30 s before the period's time is up until it's ended, and while a break is due.
    func wantsScreenOn(_ now: Int64) -> Bool { phase == .running && (breakDue || matchMs(now) >= Int64(currentPeriodSec) * 1000 - 30_000) }

    /// VIB-6: silences repeating alerts; true if there was one.
    @discardableResult func acknowledgeAlerts(_ now: Int64) -> Bool {
        // EVT-12: "can return" waits for a button even with its vibration off.
        if !hasActiveAlert(now) && sinBinReturns.isEmpty { return false }
        sinBinWaiting = []
        if fullTimeAlertActive(now) { fullTimeAcked = true }
        if addedAlertActive(now) { addedAcked = true }
        if breakDueAlertActive { breakDueSilenced = true }
        return true
    }

    /// Every second: makes scheduled breaks due, and says which vibration is due, at most one.
    func tick(_ now: Int64) -> Alert? {
        // TMR-13: while suspended every clock stands still; only the lightning countdown runs, with one vibration at zero.
        if phase == .suspended {
            if let from = lightningFrom, lightningAlerted != true, now >= from + lightningWaitMs {
                lightningAlerted = true
                return vibeBreak ? .lightning : nil
            }
            return nil
        }
        if phase == .running { makeBreakDue(now) }
        checkSinBins(now)
        if let end = breakEnd, !breakEndAlerted, now >= end {
            breakEndAlerted = true
            if !breakIsHalftime {
                breakEnd = nil
                if breakStoppageRunning { closeStoppage(end) }
            }
            return vibeBreak ? .breakEnd : nil
        }
        // VIB-1: with stoppage tracked, decided as the length is reached: with stoppage time, full time vibrates once with
        // nothing to answer, so the next press starts a stoppage; with none, it repeats until a press, as no added time alert
        // follows, and stands for that alert this period, so a stoppage started after it brings no other.
        // TMR-15: a stopping clock has no added time to follow, so its full time always repeats.
        if setup.trackStoppage && fullTimeRepeats != true && fullTimeDue(now) {
            if stoppageTotalMs(now) > 0 && !setup.stops {
                fullTimeAcked = true
                return .fullTime
            }
            fullTimeRepeats = true
            addedAcked = true
        }
        if hasActiveAlert(now) {
            if now - lastRepeat >= Int64(repeatSec) * 1000 {
                lastRepeat = now
                // VIB-7 comes after full time, so it's the news when both are waiting; a sin bin over is newer still (EVT-12).
                return sinBinAlertActive ? .sinBinEnd : addedAlertActive(now) ? .addedTime : fullTimeAlertActive(now) ? .fullTime : .breakStart
            }
            return nil
        }
        // TMR-12: no reminders for the stoppage a break started: the break clock is running.
        if phase == .running && isStoppageActive && !breakStoppageRunning && vibeStoppage && reminderSec > 0 && now - lastReminder >= Int64(reminderSec) * 1000 {
            lastReminder = now
            return .reminder
        }
        return nil
    }

    /// EVT-12: the time played in the match so far, by the match clock: each ended period's time (its E event), and
    /// the period being played (stood still while suspended). Breaks add nothing, so a sin bin waits through them.
    func playedMs(_ now: Int64) -> Int64 {
        let inPlay = phase == .running || phase == .golden || phase == .suspended
        return endedMs { _ in true } + (inPlay ? matchMs(now) : 0)
    }

    private func endedMs(_ which: (Int) -> Bool) -> Int64 {
        events.reduce(0) { $0 + ($1.type == EventType.periodEnd && $1.seconds >= 0 && which($1.period) ? Int64($1.seconds) * 1000 : 0) }
    }

    /// EVT-12: the stoppages recorded (S, their length in extra), TMR-10; none without stoppage tracked.
    private func stoppedMs(_ list: ArraySlice<MatchEvent>) -> Int64 {
        list.reduce(0) { $0 + ($1.type == EventType.stoppage ? Int64($1.extra ?? 0) * 1000 : 0) }
    }
    /// EVT-12: the stoppage running, stood still while suspended.
    private func runningStoppageMs(_ now: Int64) -> Int64 { stoppageStart.map { clockNow(now) - $0 } ?? 0 }

    /// EVT-12: the sin bins' clock: the time played less the stoppage in it, so a sin bin holds while a stoppage runs, as
    /// IFAB's guidance adds the time lost in one (the owner's choice, 2026-11-10).
    /// TMR-15: a stopping clock has already stood still for the stoppages, so its time played is the sin bins' clock.
    private func sinBinClockMs(_ now: Int64) -> Int64 { setup.stops ? playedMs(now) : playedMs(now) - stoppedMs(events[...]) - runningStoppageMs(now) }

    /// EVT-12: the sin bins' clock when the one at `index` in events began: the time played then (before kickoff 0:00,
    /// at a break the end of the period before), less the stoppage before it, and of a stoppage running then, the part
    /// before it.
    private func sinBinFromMs(_ index: Int, _ now: Int64) -> Int64 {
        let e = events[index]
        let before = endedMs { $0 < e.period }
        let played = before + (e.seconds >= 0 ? Int64(e.seconds) * 1000 : e.seconds == EventTime.atBreak ? endedMs { $0 == e.period } : 0)
        // TMR-15: the clock stood still for the stoppages, so the time played is the sin bins' clock.
        if setup.stops { return played }
        var stopped = stoppedMs(events[..<index])
        if e.seconds >= 0 {
            // Given during a stoppage: the first one recorded after it, if it started before it, or the one running now.
            if let next = events[(index + 1)...].first(where: { $0.type == EventType.stoppage }) {
                if next.period == e.period { stopped += clamp(Int64(e.seconds - next.seconds) * 1000, Int64(next.extra ?? 0) * 1000) }
            } else if let start = stoppageStart, let kickoff = periodStart, period == e.period {
                stopped += clamp(Int64(e.seconds) * 1000 - (start - kickoff), runningStoppageMs(now))
            }
        }
        return played - stopped
    }

    /// A value from 0 to `most`.
    private func clamp(_ value: Int64, _ most: Int64) -> Int64 { min(max(value, 0), most) }

    /// EVT-12: the time left of the sin bin at `index` in events, by the sin bins' clock, from its length down to 0.
    private func sinBinLeftMs(_ index: Int, _ now: Int64) -> Int64 {
        let length = Int64(events[index].extra ?? 0) * 1000
        return clamp(length - (sinBinClockMs(now) - sinBinFromMs(index, now)), length)
    }

    /// EVT-12: sin bins not ended by the player being sent off after it (a red, a second yellow or a second sin
    /// bin), with their places in events.
    private func liveSinBins() -> [(index: Int, event: MatchEvent)] {
        events.indices.filter { i in
            let e = events[i]
            return e.type == EventType.sinBin
                && !(e.player != nil && events[(i + 1)...].contains { isSendOff($0.type) && $0.team == e.team && $0.player == e.player })
        }.map { ($0, events[$0]) }
    }

    /// EVT-12: the sin bins counting down, the one ending first first (ties in the order they were given).
    func runningSinBins(_ now: Int64) -> [MatchEvent] { runningSinBinsTimed(now).map(\.e) }

    /// EVT-12: the same, each with its time left.
    private func runningSinBinsTimed(_ now: Int64) -> [(e: MatchEvent, left: Int64)] {
        let timed: [(order: Int, e: MatchEvent, left: Int64)] = liveSinBins().enumerated().map { ($0.offset, $0.element.event, sinBinLeftMs($0.element.index, now)) }
        return timed.filter { $0.left > 0 }
            .sorted { $0.left != $1.left ? $0.left < $1.left : $0.order < $1.order }
            .map { ($0.e, $0.left) }
    }

    /// EVT-12: the sin bins over, waiting for "can return", in the order they ended.
    var sinBinReturns: [MatchEvent] { (sinBinWaiting ?? []).compactMap { events.indices.contains($0) ? events[$0] : nil } }

    /// EVT-12, UI-1: the sin bin pill, "AWY 7 4:12" for the one ending first, "+1" after it for each other; nil for
    /// none. Without the team, "7 4:12 +1", for when three pills don't fit.
    func sinBinPill(_ now: Int64, withTeam: Bool = true) -> String? {
        let running = runningSinBinsTimed(now)
        guard let first = running.first else { return nil }
        let more = running.count > 1 ? " +\(running.count - 1)" : ""
        let team = withTeam ? teamName(first.e.team) + " " : ""
        return team + (first.e.player.map { "\($0) " } ?? "") + formatCountdown(first.left) + more
    }

    /// EVT-12: "AWY #7 can return", for the first sin bin over; nil for none.
    func sinBinReturnText() -> String? {
        guard let e = sinBinReturns.first else { return nil }
        return teamName(e.team) + (e.player.map { " #\($0)" } ?? "") + " can return"
    }

    /// EVT-12: each sin bin's end, announced once, when the sin bins' clock reaches it.
    private func checkSinBins(_ now: Int64) {
        let clock = sinBinClockMs(now)
        var waiting = sinBinWaiting ?? []
        for (index, e) in liveSinBins() {
            let end = sinBinFromMs(index, now) + Int64(e.extra ?? 0) * 1000
            if (sinBinCheckedMs ?? 0) < end && end <= clock && !waiting.contains(index) {
                waiting.append(index)
                lastRepeat = 0
            }
        }
        if waiting != (sinBinWaiting ?? []) { sinBinWaiting = waiting }
        sinBinCheckedMs = clock
    }

    /// EVT-12: an event taken out of events: one waiting for its return no longer waits, and the others' places follow.
    private func removeEvent(at index: Int) {
        events.remove(at: index)
        guard let waiting = sinBinWaiting else { return }
        sinBinWaiting = waiting.filter { $0 != index }.map { $0 > index ? $0 - 1 : $0 }
    }

    private func makeBreakDue(_ now: Int64) {
        if scheduledBreakDone || periodStart == nil || breakAtSec < 0 || setup.breakLenSec <= 0 || isExtraTime { return }
        if matchMs(now) < Int64(breakAtSec) * 1000 { return }
        scheduledBreakDone = true
        breakDue = true
        breakDueSilenced = false
        lastRepeat = 0
    }

    /// UI-4: time until the break is due, or nil when none is still to come this period.
    func breakDueInMs(_ now: Int64) -> Int64? {
        if phase != .running || scheduledBreakDone || periodStart == nil || breakAtSec < 0 || setup.breakLenSec <= 0 || isExtraTime { return nil }
        return max(Int64(breakAtSec) * 1000 - matchMs(now), 0)
    }

    /// TMR-7: the referee accepts the due break.
    func startBreak(_ now: Int64) {
        if phase != .running || !breakDue { return }
        breakDue = false
        breakIsHalftime = false
        breakEnd = now + Int64(setup.breakLenSec) * 1000
        breakEndAlerted = false
        // TMR-12: its time is added on, as a stoppage that ends with the break. TMR-15: a stopping clock stops for it, whatever the setting.
        if setup.trackStoppage && (setup.breakStoppage || setup.stops) && stoppageStart == nil {
            stoppageStart = now
            breakStoppageRunning = true
        }
    }

    func skipBreak() { breakDue = false }

    /// TMR-7: ends a running halfway break early; the time it took counts as stoppage (TMR-12).
    func endBreakEarly(_ now: Int64) {
        if phase == .running, breakEnd != nil {
            breakEnd = nil
            if breakStoppageRunning { closeStoppage(now) }
        }
    }

    /// TMR-7: a break started by mistake: it's due again, and counts for nothing.
    func resetBreak() {
        if phase == .running, breakEnd != nil {
            breakEnd = nil
            breakDue = true
            breakDueSilenced = true
            if breakStoppageRunning {
                stoppageStart = nil
                breakStoppageRunning = false
            }
        }
    }

    func selectKickoff(_ team: Int) {
        if phase == .pre || phase == .ready {
            kickoff = team
            phase = .ready
        } else if phase == .nextKickoff {
            let next = period + 1
            if next >= setup.numPeriods {
                etKickoff = (next - setup.numPeriods) % 2 == 0 ? team : 1 - team
            } else {
                kickoff = next % 2 == 0 ? team : 1 - team
            }
        }
    }

    /// PRE-3.
    func clearKickoff() {
        if phase == .ready {
            kickoff = -1
            phase = .pre
        }
    }

    /// PRE-3: fix a wrongly chosen team after the match has started (in extra time, its own, ET-7).
    func swapKickoff() {
        if aboutExtraTime {
            if let team = etKickoff, team >= 0 { etKickoff = 1 - team }
        } else if kickoff >= 0 {
            kickoff = 1 - kickoff
        }
    }

    /// PRE-6: back to kickoff after an accidental start, in the first period only. Cards given before kickoff stay.
    func restart() {
        if phase != .running || period != 0 { return }
        beginPeriod(0)
        periodStart = nil
        phase = .ready
        score = [0, 0]
        events = events.filter { $0.seconds == EventTime.beforeKickoff }
        startedAt = []
        sinBinWaiting = []
        sinBinCheckedMs = 0
    }

    private func noteBattery(_ at: Int) {
        guard let percent = Match.battery(), (batteryLog?.count ?? 0) < 24 else { return }
        batteryLog = (batteryLog ?? []) + [[period, at, percent]]
    }

    /// UI-21, TMR-11: the match screen is fixed here, so it doesn't change during the match.
    func start(_ now: Int64, screen chosen: WatchScreen) {
        if phase != .ready { return }
        period = 0
        screen = chosen
        beginPeriod(now)
        startedAt = [now / 1000]
        noteBattery(0)
        phase = .running
    }

    private func beginPeriod(_ now: Int64) {
        periodStart = now
        stoppageMs = 0
        stoppageStart = nil
        breakStoppageRunning = false
        breakEnd = nil
        breakIsHalftime = false
        scheduledBreakDone = false
        fullTimeAcked = false
        addedAcked = false
        fullTimeRepeats = false
        breakDue = false
        breakDueSilenced = false
        breakEndAlerted = false
        lastRepeat = 0
    }

    /// TMR-10: only when tracked.
    func toggleStoppage(_ now: Int64) {
        if phase != .running || !setup.trackStoppage { return }
        if stoppageStart == nil {
            stoppageStart = now
            lastReminder = now
        } else {
            closeStoppage(now)
        }
    }

    private func closeStoppage(_ now: Int64) {
        guard let start = stoppageStart else { return }
        // The period's time it began at: on a stopping clock (TMR-15), where the clock stood still.
        let seconds = Int(matchMs(start) / 1000)
        let duration = now - start
        stoppageMs += duration
        stoppageStart = nil
        breakStoppageRunning = false
        events.append(MatchEvent(type: EventType.stoppage, team: -1, period: period, seconds: seconds, player: nil, extra: Int(duration / 1000)))
    }

    /// EVT-16, TMR-15: a stoppage started by an event, as Start/Stop starts one, unless one is running.
    private func stopFor(_ now: Int64) {
        if phase == .running && setup.trackStoppage && stoppageStart == nil {
            stoppageStart = now
            lastReminder = now
        }
    }

    /// EVT-1, EVT-5, EVT-7: goals during play, cards at any time. True when it's a second yellow, or a second sin bin (EVT-12).
    @discardableResult func addEvent(_ type: String, team: Int, player given: Int?, now: Int64) -> Bool {
        if isGoal(type) && phase != .running { return false }
        // EVT-12: only with sin bins on, and not once the clock has nothing left to run (the shoot-out, after full time).
        let sinBin = type == EventType.sinBin
        if sinBin && (!setup.hasSinBins || phase == .penalties || phase == .done) { return false }
        // EVT-3: 00 on the entry is no number.
        let player = given == 0 ? nil : given
        // EVT-5; EVT-12: a second sin bin is a send-off too; a sin bin and a caution don't combine (Q-22).
        let second = (type == EventType.yellow || sinBin) && player != nil && events.contains { $0.type == type && $0.team == team && $0.player == player }
        let recorded = second ? (sinBin ? EventType.secondSinBin : EventType.secondYellow) : type
        events.append(MatchEvent(type: recorded, team: team, period: period, seconds: eventSeconds(now), player: player, extra: sinBin ? setup.sinBinLength : nil))
        if isGoal(recorded) {
            score[team] += 1
            // ET-6: the first goal in extra time wins it; End match or Undo comes next.
            if goldenGoal && isExtraTime { phase = .golden }
        }
        // EVT-16: an injury in play starts the stoppage, as Start/Stop does, unless one is running; at a break it has none.
        // TMR-15: so does a goal or card on a stopping clock, Start/Stop starting it again at the restart.
        if recorded == EventType.injury || (setup.stopsForGoalsCards && (isGoal(recorded) || isCard(recorded))) { stopFor(now) }
        return second
    }

    /// EVT-14: the most recent card's reason, replacing one given before; nothing when there's no card. A stoppage or
    /// a goal since doesn't matter: the reason goes to the card.
    func giveReason(_ code: String) {
        guard let index = events.lastIndex(where: { isCard($0.type) }) else { return }
        events[index].reason = code
    }

    /// EVT-14: [the card's place in events, its code] for each card with a reason, in order; worked out when asked, so
    /// a card undone takes its reason with it and the ones after keep theirs at their new places.
    func cardReasons() -> [(index: Int, code: String)] {
        events.enumerated().compactMap { i, e in e.reason.map { (i, $0) } }
    }

    /// EVT-14: the upload's "misconduct", beside the events (a server from before it takes their six fields as a strict
    /// tuple): the match's scheme and its reasons; nil when no card has one.
    var misconductUpload: [String: Any]? {
        let reasons = cardReasons()
        if reasons.isEmpty { return nil }
        return ["scheme": misconductScheme ?? "ifab", "codes": reasons.map { [$0.index, $0.code] as [Any] }]
    }

    /// EVT-15: a team official's caution or send-off, at any time as a player's card (EVT-7), with the role
    /// (officialRoles) in extra. It never makes a second yellow: officials aren't matched by number.
    func addOfficialCard(red: Bool, team: Int, role: Int, now: Int64) {
        events.append(MatchEvent(type: red ? EventType.officialRed : EventType.officialYellow, team: team, period: period, seconds: eventSeconds(now), player: nil, extra: role))
        // TMR-15: a card stops a stopping clock.
        if setup.stopsForGoalsCards { stopFor(now) }
    }

    /// TMR-14: Adjust clock, during play: the period's clock moves by whole seconds (forward for a clock started
    /// late), by moving the period's kickoff time, so every clock style, the halfway break and the alerts follow.
    /// Never before the kickoff. Events already recorded keep their times. Recorded as CK at the new time, with
    /// the change; false when nothing changed. Saved with the match as any change is (TMR-8).
    @discardableResult func adjustClock(_ changeSec: Int, now: Int64) -> Bool {
        guard phase == .running, periodStart != nil else { return false }
        let change = max(changeSec, -Int(matchMs(now) / 1000))
        if change == 0 { return false }
        shiftClock(change, now)
        events.append(MatchEvent(type: EventType.clockAdjusted, team: -1, period: period, seconds: Int(matchMs(now) / 1000), player: nil, extra: change))
        return true
    }

    private func shiftClock(_ change: Int, _ now: Int64) {
        guard let start = periodStart else { return }
        periodStart = start - Int64(change) * 1000
        let elapsed = matchMs(now)
        // The alerts and the halfway break come again when the clock is put back before them.
        if elapsed < Int64(currentPeriodSec) * 1000 {
            fullTimeAcked = false
            // VIB-1: decided again when the length is reached again.
            fullTimeRepeats = false
        }
        rearmAdded(now)
        if breakDue && breakAtSec >= 0 && elapsed < Int64(breakAtSec) * 1000 {
            breakDue = false
            breakDueSilenced = false
            scheduledBreakDone = false
        }
    }

    private func rearmAdded(_ now: Int64) {
        if matchMs(now) < Int64(currentPeriodSec) * 1000 + stoppageTotalMs(now) { addedAcked = false }
    }

    /// TMR-14: Adjust added time, with stoppage tracked: the stoppage total moves by whole seconds, for a stoppage
    /// started or ended late; never below 0:00. A stoppage running carries on. Recorded as CA, with the change.
    @discardableResult func adjustAdded(_ changeSec: Int, now: Int64) -> Bool {
        // TMR-15: a stopping clock has no added time.
        guard phase == .running, setup.trackStoppage, !setup.stops else { return false }
        let change = max(changeSec, -Int(stoppageTotalMs(now) / 1000))
        if change == 0 { return false }
        shiftAdded(change, now)
        events.append(MatchEvent(type: EventType.addedAdjusted, team: -1, period: period, seconds: eventSeconds(now), player: nil, extra: change))
        return true
    }

    private func shiftAdded(_ change: Int, _ now: Int64) {
        stoppageMs += Int64(change) * 1000
        // Taken back further than the stoppages before the running one: the running one is shorter.
        if stoppageMs < 0, let start = stoppageStart { stoppageStart = min(start - stoppageMs, now) }
        stoppageMs = max(stoppageMs, 0)
        rearmAdded(now)
    }

    /// ET-6: only with extra time.
    var goldenGoal: Bool { setup.extraTime && setup.goldenGoal == true }

    private func eventSeconds(_ now: Int64) -> Int {
        switch phase {
        // TMR-13: a card while suspended is at the time play stopped.
        case .running, .golden, .suspended: return Int(matchMs(now) / 1000)
        case .pre, .ready: return EventTime.beforeKickoff
        case .done: return EventTime.afterFullTime
        case .penalties: return EventTime.penalties
        default: return EventTime.atBreak
        }
    }

    /// INP-6: the most recent goal, card or shoot-out kick, only while it's in the current period: while
    /// play runs, recorded since this period's kickoff; at a break, in the period just ended or the break
    /// itself. An earlier period's event can't be undone (nil), so the game menu leaves Undo out.
    var lastUndoableEvent: MatchEvent? {
        let playing = phase == .running || phase == .golden
        // TMR-13: while suspended, as during play, but not a clock's correction.
        let inPlay = playing || phase == .suspended
        guard let event = events.last(where: { isUndoable($0.type, playing: playing) }) else { return nil }
        if event.period != period || (inPlay && event.seconds < 0) { return nil }
        return event
    }

    func undoLastEvent(_ now: Int64) {
        guard let event = lastUndoableEvent, let index = events.lastIndex(of: event) else { return }
        // TMR-14: a correction taken back moves the clock back by its change.
        if event.type == EventType.clockAdjusted {
            shiftClock(-(event.extra ?? 0), now)
        } else if event.type == EventType.addedAdjusted {
            shiftAdded(-(event.extra ?? 0), now)
        }
        if isGoal(event.type) {
            score[event.team] -= 1
            // ET-6: the golden goal taken back, so play goes on.
            if phase == .golden { phase = .running }
        }
        // EVT-12: a sin bin taken back no longer waits for its return.
        removeEvent(at: index)
    }

    /// ET-6: the team whose golden goal won (or wins, while End match is offered), or -1.
    func goldenWinner() -> Int {
        guard phase == .golden || endedGolden == true else { return -1 }
        return events.last { isGoal($0.type) }?.team ?? -1
    }

    /// ET-6: Undo on the golden goal screen: that goal goes, even with a card given since, and the period carries on.
    func undoGoldenGoal() {
        guard phase == .golden else { return }
        if let index = events.lastIndex(where: { isGoal($0.type) }) {
            score[events[index].team] -= 1
            removeEvent(at: index)
        }
        phase = .running
    }

    /// TMR-5, TMR-6. True when it ended the match.
    @discardableResult func endPeriod(_ now: Int64) -> Bool {
        if phase != .running { return false }
        if periodEndsMatch {
            finish(now)
            return true
        }
        closeStoppage(now)
        events.append(MatchEvent(type: EventType.periodEnd, team: -1, period: period, seconds: Int(matchMs(now) / 1000), player: nil, extra: nil))
        noteBattery(1)
        breakDue = false
        if isLastPeriod {
            phase = .decide
            breakEnd = nil
        } else {
            beginBreak(now)
        }
        return false
    }

    private func beginBreak(_ now: Int64) {
        phase = .breakTime
        breakIsHalftime = true
        breakEnd = now + Int64(setup.halftimeSec) * 1000
        breakEndAlerted = setup.halftimeSec <= 0
    }

    /// ET-1: extra time or penalties when level, otherwise the end.
    var recommendedDecision: Decision {
        if score[home] == score[away] {
            if canExtraTime { return .extraTime }
            if canPenalties { return .penalties }
        }
        return .endMatch
    }

    func chooseExtraTime(_ now: Int64) {
        if phase == .decide && canExtraTime { beginBreak(now) }
    }

    func choosePenalties() {
        if phase == .decide && canPenalties {
            phase = .penalties
            penFirst = -1
            penStarted = false
        }
    }

    func selectPenaltyFirst(_ team: Int) {
        if phase == .penalties && !penStarted { penFirst = team }
    }

    func startPenalties() {
        if phase == .penalties && !penStarted && penFirst >= 0 { penStarted = true }
    }

    func nextKicker() -> Int {
        let first = penFirst < 0 ? home : penFirst
        return penaltyKicks(first) == penaltyKicks(1 - first) ? first : 1 - first
    }

    func recordKick(_ scored: Bool) {
        if phase != .penalties || !penStarted || penaltyWinner() >= 0 { return }
        events.append(MatchEvent(type: scored ? EventType.penScored : EventType.penMissed, team: nextKicker(), period: period, seconds: EventTime.penalties, player: nil, extra: nil))
    }

    func penaltyKicks(_ team: Int) -> Int { events.filter { $0.team == team && isKick($0.type) }.count }
    func penaltyGoals(_ team: Int) -> Int { events.filter { $0.team == team && $0.type == EventType.penScored }.count }
    func kickResults(_ team: Int) -> [Bool] { events.filter { $0.team == team && isKick($0.type) }.map { $0.type == EventType.penScored } }

    /// ET-4: the winner, or -1 while undecided.
    func penaltyWinner() -> Int {
        let goals = [penaltyGoals(home), penaltyGoals(away)]
        let kicks = [penaltyKicks(home), penaltyKicks(away)]
        if kicks[home] <= 5 && kicks[away] <= 5 {
            for team in 0...1 where goals[team] > goals[1 - team] + 5 - kicks[1 - team] { return team }
        } else if kicks[home] == kicks[away] && goals[home] != goals[away] {
            return goals[home] > goals[away] ? home : away
        }
        return -1
    }

    func penaltyScore() -> [Int]? {
        penFirst < 0 && penaltyKicks(home) == 0 && penaltyKicks(away) == 0 ? nil : [penaltyGoals(home), penaltyGoals(away)]
    }

    func endHalftime() {
        if phase != .breakTime { return }
        phase = .nextKickoff
        breakEnd = nil
        breakIsHalftime = false
    }

    func startNextPeriod(_ now: Int64) {
        // ET-7: ET1 waits for its kickoff team.
        if phase != .nextKickoff || kickoffFor(period + 1) < 0 { return }
        period += 1
        beginPeriod(now)
        startedAt.append(now / 1000)
        noteBattery(0)
        phase = .running
    }

    /// EVT-11: ended for good here, with the score as it stands.
    func abandon(_ now: Int64, reason: Int) { finish(now, abandonReason: reason) }

    var isAbandoned: Bool { events.contains { $0.type == EventType.abandon } }

    func finish(_ now: Int64, abandonReason: Int? = nil) {
        if phase == .done { return }
        var seconds = phase == .penalties ? EventTime.penalties : EventTime.atBreak
        // ET-6: End match after a golden goal, not an abandonment from its screen.
        endedGolden = phase == .golden && abandonReason == nil
        if phase == .running || phase == .golden || phase == .suspended {
            // TMR-13: abandoned while suspended, the period ends where play stopped.
            closeStoppage(clockNow(now))
            seconds = Int(matchMs(now) / 1000)
            events.append(MatchEvent(type: EventType.periodEnd, team: -1, period: period, seconds: seconds))
            noteBattery(1)
        }
        if let abandonReason {
            events.append(MatchEvent(type: EventType.abandon, team: -1, period: period, seconds: seconds, player: nil, extra: abandonReason))
        }
        phase = .done
        breakEnd = nil
        clearSuspension()
    }

    /// TMR-13: Suspend match, during play, for a lightning or weather delay: every clock stops where it is (the
    /// match clock, the stoppage clock, a running halfway break) until Resume. Recorded as SU at the period's
    /// time, with the reason (suspendReasons) in extra. For lightning, a 30:00 countdown starts.
    @discardableResult func suspend(_ reason: Int, now: Int64) -> Bool {
        guard phase == .running, suspendReasons.contains(where: { $0.0 == reason }) else { return false }
        events.append(MatchEvent(type: EventType.suspended, team: -1, period: period, seconds: eventSeconds(now), player: nil, extra: reason))
        phase = .suspended
        suspendedAt = now
        suspendReason = reason
        lightningFrom = reason == lightningReason ? now : nil
        lightningAlerted = false
        return true
    }

    /// TMR-13: Lightning again, while suspended for lightning: the 30:00 countdown starts over.
    func lightningAgain(_ now: Int64) {
        guard isLightning else { return }
        lightningFrom = now
        lightningAlerted = false
    }

    /// TMR-13: Resume: the period carries on from where it stopped, every clock moved on by the time suspended,
    /// so it's neither played time nor added time. Recorded as RS at the same period's time, with the whole
    /// seconds suspended in extra. The period's startedAt (for the track) stays as it was.
    func resume(_ now: Int64) {
        guard phase == .suspended, let at = suspendedAt else { return }
        let shift = max(now - at, 0)
        periodStart = periodStart.map { $0 + shift }
        stoppageStart = stoppageStart.map { $0 + shift }
        breakEnd = breakEnd.map { $0 + shift }
        lastReminder += shift
        phase = .running
        clearSuspension()
        events.append(MatchEvent(type: EventType.resumed, team: -1, period: period, seconds: Int(matchMs(now) / 1000), player: nil, extra: Int(shift / 1000)))
    }

    private func clearSuspension() {
        suspendedAt = nil
        suspendReason = nil
        lightningFrom = nil
        lightningAlerted = nil
    }
}

/// A heading in radians in the range 0 to 2π.
func normalizeHeading(_ heading: Double) -> Double {
    let full = 2 * Double.pi
    return (heading.truncatingRemainder(dividingBy: full) + full).truncatingRemainder(dividingBy: full)
}
