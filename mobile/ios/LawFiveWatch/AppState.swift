import Foundation
import Observation
import WatchKit

// The app's one state (WCH-3): what the screens show and what's kept. One small file, written whole and
// atomically on every change, so a match survives the app being closed (TMR-8).

struct FeeChange: Codable, Equatable {
    var matchId: String
    var paid: Bool
    var at: Int64
}

/// UI-24: the match screen as the server takes it and sends it; an older server has only a layout and second clock.
struct ScreenChange: Codable, Equatable {
    var layout: String
    var secondClock: String
    var at: Int64
    var clocks: String?
    var mainClock: String?
    var breakClock: String?
    var edge: String?
    var names: Bool?
}

struct FinishedMatch: Codable, Identifiable {
    var created: Int64
    var home: String
    var away: String
    var score: [Int]
    var pens: [Int]?
    var sent = false
    /// ET-6: it ended on a golden goal.
    var golden: Bool?
    /// The planned match it was started from, for Mark pitch (TRK-13).
    var matchId: String?
    /// UI-17, as on the Garmin watch: the format, the events and the clock it was played with, for its Summary and
    /// Events; the distance; and the fee it had (UI-20). Optional, as matches kept before them don't have them.
    var setup: MatchSetup?
    var events: [MatchEvent]?
    var clockStyle: Int?
    var distanceM: Double?
    var fee: PlannedMatch.Fee?
    var id: Int64 { created }
}

/// TRK-13, SYNC-12: a pitch's corners walked on the watch, until the server has them (POST /v1/watch/pitch).
struct PitchUpload: Codable, Equatable {
    var matchId: String?
    var created: Int64?
    /// [latitude, longitude] in millionths of a degree.
    var corners: [[Int]]
    var at: Int64
}

/// A match as the server sends it for a watch (GET /v1/watch/matches, WatchMatch).
struct PlannedMatch: Codable, Identifiable {
    struct Fee: Codable {
        var text: String
        var paid: Bool
    }
    var id: String
    var kickoff: Int64?
    var title: String
    var name: String?
    var `where`: String?
    var role: String?
    var weather: String?
    var fee: Fee?
    var notes: String?
    var home: String
    var away: String
    var homeName: String
    var awayName: String
    var homeColor: Int
    var awayColor: Int
    var numPeriods: Int
    var periodSec: Int
    var halftimeSec: Int
    var teamSize: Int
    var midBreak: Bool
    var breakLenSec: Int
    var extraTime: Bool
    var etPeriods: Int
    var etPeriodSec: Int
    /// ET-6; servers from before it don't send it.
    var goldenGoal: Bool?
    var penalties: Bool
    var clockStyle: Int
    var trackStoppage: Bool
    var breakStoppage: Bool
    var goalScorers: Bool
    var goalTypes: Bool
    /// EVT-12; servers from before them don't send them (off, 10 minutes).
    var sinBins: Bool?
    var sinBinSec: Int?
    /// TMR-15; servers from before it don't send them (the clock runs on).
    var stoppingClock: Bool?
    var stopForGoalsCards: Bool?
    /// EVT-14: the card reasons' scheme, the competition's or else the account's; servers from before it don't send it.
    var misconductScheme: String?

    var setup: MatchSetup {
        MatchSetup(
            matchId: id, home: home, away: away, homeName: homeName, awayName: awayName, homeColor: homeColor, awayColor: awayColor,
            numPeriods: numPeriods, periodSec: periodSec, halftimeSec: halftimeSec, teamSize: teamSize, midBreak: midBreak, breakLenSec: breakLenSec,
            extraTime: extraTime, etPeriods: etPeriods, etPeriodSec: etPeriodSec, goldenGoal: goldenGoal, penalties: penalties, clockStyle: clockStyle,
            trackStoppage: trackStoppage, breakStoppage: breakStoppage, goalScorers: goalScorers, goalTypes: goalTypes,
            sinBins: sinBins, sinBinSec: sinBinSec, stoppingClock: stoppingClock, stopForGoalsCards: stopForGoalsCards
        )
    }
}

/// SYNC-6: an unlinked watch's old link, kept until the server it came from has signed it out.
struct SignOut: Codable, Equatable {
    var server: String
    var token: String
}

struct Saved: Codable {
    var server: String?
    var token: String?
    var lastSync: Int64?
    var matches: [PlannedMatch] = []
    var match: Match?
    /// Finished matches until the server has them, as the JSON to send.
    var outbox: [Data] = []
    var outboxCreated: [Int64] = []
    var fees: [FeeChange] = []
    var history: [FinishedMatch] = []
    var quick = MatchSetup()
    /// Before UI-21's choices: the layout and second clock, read into `chosenScreen` until `screen` is set.
    var faceLayout = layoutDefault
    var secondClock = clockDown
    /// Optional, like the others added later, so a file saved before it still loads.
    var screen: WatchScreen?
    var screenAt: Int64 = 0
    var screenChange: ScreenChange?
    var vibeFullTime = true
    /// VIB-7.
    var vibeAdded: Bool?
    /// EVT-12: Sin bin over; nil is on.
    var vibeSinBin: Bool?
    var vibeBreak = true
    var vibeStoppage = true
    /// VIB-1, VIB-3, VIB-4, VIB-7: how often the repeating alerts repeat, and the stoppage reminder (0 for off), as
    /// the Garmin watch's; nil is 10 s.
    var alertRepeatSec: Int?
    var stoppageReminderSec: Int?
    /// INP-4: in Settings → Controls.
    var tapStoppage = false
    /// INP-10: "sideways" for right to home and left to away, with up for the game menu; otherwise down and up.
    var teamSwipes: String?
    /// EVT-14: Card reasons, in Settings → Controls: the list of codes after a card's number; nil is off.
    var cardReasons: Bool?
    /// INP-12: Touch lock, in Settings → Controls: the system's Water Lock on play's screen; nil is off.
    var touchLock: Bool?
    /// EVT-14: the account's misconduct scheme, from the last sync, for a match with none of its own; nil before any.
    var misconductScheme: String?
    /// SET-8: nil or blank for the default name.
    var stoppageName: String?
    var breakName: String?
    /// SET-13: the format of the last match started (quick, planned or created).
    var lastFormat: MatchSetup?
    /// VER-2.
    var serverVersion: String?
    /// TRK-7: Record track; nil is on.
    var recordTrack: Bool?
    /// ACT-4: a match saved to Apple Health as a soccer workout; nil is on.
    var saveToHealth: Bool?
    /// TRK-7: finished tracks waiting to go up, oldest first; the last 3 are kept, as on Garmin.
    var tracks: [TrackUpload]?
    /// TRK-13: pitches marked, waiting to go up.
    var pitches: [PitchUpload]?
    /// WCH-7: the first launch's screen on what the app asks for, and why, has been answered.
    var permissionsAsked: Bool?
    /// SYNC-6: links unlinked without a connection, signed out at the next chance.
    var signOuts: [SignOut]?

    /// SET-8: the timers' names, or their defaults when blank.
    var stoppageLabel: String { stoppageName.flatMap { $0.isEmpty ? nil : $0 } ?? "stoppage" }
    var breakLabel: String { breakName.flatMap { $0.isEmpty ? nil : $0 } ?? "break" }

    /// UI-21: the match screen; one saved before the choices comes from its layout and the quick format's clock.
    /// With neither changed from before, or nothing saved, it's the default (UI-24).
    var chosenScreen: WatchScreen {
        if let screen { return screen }
        if faceLayout == layoutDefault && quick.clockStyle == clockUp && secondClock == clockDown { return .standard }
        return WatchScreen.fromLayout(faceLayout, mainClock: quick.clockStyle, secondClock: secondClock)
    }
}

private let layoutIds = ["default", "stacked", "minimal", "scoreboard", "sideBySide", "ring"]
private let clockIds = ["up", "upEach", "down"]
private let clocksIds = ["one", "stacked", "sideBySide"]
private let edgeIds = ["none", "ring", "time"]
private let breakIds = ["down", "up"]

/// How many finished matches History keeps.
let historyKept = 30

func nowMs() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
func nowSeconds() -> Int64 { Int64(Date().timeIntervalSince1970) }

@MainActor @Observable
final class AppState {
    private(set) var saved = Saved()
    private(set) var syncing = false
    private(set) var syncProblem: String?
    // UI-26: the sync screen: how many matches this sync is sending, how many have gone, and whether
    // it's up. The home and full-time screens say when it may come up.
    private(set) var syncTotal = 0
    private(set) var syncSent = 0
    var syncScreen = false
    var screenFree = false
    private var syncScreenShown = false
    /// Over the home or full-time screen only, never a match being played or a menu in use.
    var offersSyncScreen: Bool { screenFree && !syncScreenShown && syncTotal > 0 && (syncing || syncProblem == nil) }

    func openSyncScreen() {
        syncScreenShown = true
        syncScreen = true
    }

    func showSyncScreenForTesting(_ what: String) {
        syncTotal = 3
        syncSent = Int(what) ?? 1
        syncing = (Int(what) ?? 3) < 3
        syncProblem = what == "stopped" ? "Can't reach the server" : nil
        syncScreen = true
    }
    /// Goes up whenever the match changes in place, so the screens draw it again.
    private(set) var revision = 0
    private let file = URL.documentsDirectory.appending(path: "lawfive.json")
    private let workout = Workout()
    private let track = TrackLog()
    /// WCH-5: Apple Health said no to workouts, so alerts stop once the screen goes off.
    private(set) var healthRefused = false
    /// TRK-7: the location is only approximate, so the track gets no positions.
    private(set) var locationApproximate = false
    private var ticker: Timer?

    var linked: Bool { saved.token != nil }
    var match: Match? { saved.match }
    var serverUrl: String { saved.server ?? (Bundle.main.object(forInfoDictionaryKey: "LFServer") as? String) ?? "https://api.lawfive.app" }
    var server: Server { Server(base: serverUrl) }
    var version: String { (Bundle.main.object(forInfoDictionaryKey: "LFVersion") as? String) ?? "dev" }

    init() {
        // Only with the file it belongs to: the keychain outlasts the app, and the server it was for might not be the default.
        if let data = try? Data(contentsOf: file), let loaded = try? JSONDecoder().decode(Saved.self, from: data) {
            saved = loaded
            if saved.token == nil { saved.token = WatchKeychain.read() }
            // DIAG-1: a match already running means the app went away mid-match.
            if let m = saved.match, m.phase != .done, !m.startedAt.isEmpty { m.restarts = (m.restarts ?? 0) + 1 }
        }
        WKInterfaceDevice.current().isBatteryMonitoringEnabled = true
        Match.battery = {
            let level = WKInterfaceDevice.current().batteryLevel
            return level >= 0 ? Int((level * 100).rounded()) : nil
        }
        applyLaunchArguments()
        // R-5: a match that was going on: its workout and track carry on, paused between periods and while
        // suspended (ACT-2, TMR-13).
        if let m = saved.match, m.phase != .done, !m.startedAt.isEmpty, recording {
            workout.recover(paused: m.phase != .running && m.phase != .golden)
            if m.recordTrack != false { track.begin(m.created, now: nowMs()) }
        }
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        sendSignOuts()
    }

    /// For testing on a simulator (simctl launch ... -server URL -screen 0,0,2,0,1,1 -swipes sideways -begin 1 -ago 2700), as Wear OS's debug extras.
    private func applyLaunchArguments() {
        #if DEBUG
        let args = UserDefaults.standard
        if args.string(forKey: "reset") != nil { saved = Saved() }
        if let server = args.string(forKey: "server") { saved.server = server }
        if let token = args.string(forKey: "token") { saved.token = token }
        if let heading = args.string(forKey: "heading").flatMap(Double.init) { Compass.fake = heading }
        if let swipes = args.string(forKey: "swipes") { saved.teamSwipes = swipes }
        // EVT-14: -reasons ussf turns Card reasons on, with that scheme as the account's.
        if let scheme = args.string(forKey: "reasons") {
            saved.cardReasons = true
            saved.misconductScheme = scheme
        }
        // UI-21: "clocks,mainClock,secondClock,breakClock,edge,names" as numbers (names 1 or 0).
        if let v = args.string(forKey: "screen")?.split(separator: ",").compactMap({ Int($0) }), v.count == 6 {
            saved.screen = WatchScreen(clocks: v[0], mainClock: v[1], secondClock: v[2], breakClock: v[3], edge: v[4], names: v[5] == 1)
        }
        if args.string(forKey: "cup") != nil {
            saved.quick = MatchSetup(home: "STR", away: "ROV", homeColor: 0xC62828, awayColor: 0x1565C0, midBreak: true, extraTime: args.string(forKey: "plainEnd") == nil,
                                     goldenGoal: args.string(forKey: "golden") != nil ? true : nil, penalties: args.string(forKey: "plainEnd") == nil, trackStoppage: true)
        }
        if args.string(forKey: "plain") != nil {
            saved.quick = MatchSetup(midBreak: true, trackStoppage: true)
        }
        // SET-16: -periods 1 for a match of one period.
        if let periods = args.string(forKey: "periods").flatMap({ Int($0) }) { saved.quick.numPeriods = periods }
        // INP-12: -touchlock turns Touch lock on (Water Lock in play, with a workout).
        if args.string(forKey: "touchlock") != nil { saved.touchLock = true }
        // TMR-15: -stopclock gives Quick match's format the clock that stops.
        if args.string(forKey: "stopclock") != nil { saved.quick.stoppingClock = true }
        // EVT-12: -sinbins <seconds> turns sin bins on in Quick match's format, with that length.
        let sinBinSec = args.string(forKey: "sinbins").flatMap { Int($0) }
        if let sinBinSec {
            saved.quick.sinBins = true
            saved.quick.sinBinSec = sinBinSec
        }
        if args.string(forKey: "begin") != nil {
            let m = Match(setup: saved.quick, created: nowSeconds())
            m.misconductScheme = Misconduct.scheme(saved.misconductScheme)
            m.selectKickoff(home)
            m.start(nowMs(), screen: saved.chosenScreen)
            m.addEvent(EventType.goal, team: away, player: 9, now: nowMs())
            m.addEvent(EventType.goal, team: away, player: 7, now: nowMs())
            m.addEvent(EventType.goal, team: home, player: 2, now: nowMs())
            // EVT-12: and with -sinbins, two sin bins at the kickoff: -ago past their length brings "can return".
            if sinBinSec != nil {
                m.addEvent(EventType.sinBin, team: away, player: 7, now: nowMs())
                m.addEvent(EventType.sinBin, team: home, player: 4, now: nowMs() + 30_000)
            }
            saved.match = m
        }
        if let phase = args.string(forKey: "phase"), let m = saved.match {
            let at = nowMs()
            m.endPeriod(at)
            if phase != "break" {
                m.endHalftime()
                if phase != "next" {
                    m.startNextPeriod(at)
                    m.endPeriod(at)
                    if phase == "pens" || phase == "kicks" {
                        m.choosePenalties()
                        if phase == "kicks" {
                            m.selectPenaltyFirst(home)
                            m.startPenalties()
                            m.recordKick(true)
                            m.recordKick(false)
                            m.recordKick(true)
                        }
                    }
                    // ET-7: to ET1's kickoff screen, where the new toss's team is chosen.
                    if phase == "et" {
                        m.chooseExtraTime(at)
                        m.endHalftime()
                    }
                    // ET-6: into extra time and a goal, with -golden for a format that has golden goal.
                    if phase == "golden" {
                        m.chooseExtraTime(at)
                        m.endHalftime()
                        m.selectKickoff(home)
                        m.startNextPeriod(at)
                        m.addEvent(EventType.goal, team: home, player: 10, now: at)
                    }
                }
            }
        }
        // UI-11: -kickoff none, home or away: a new match at its kickoff screen, with that team chosen.
        if let pick = args.string(forKey: "kickoff") {
            let m = Match(setup: saved.quick, created: nowSeconds())
            if pick == "home" { m.selectKickoff(home) } else if pick == "away" { m.selectKickoff(away) }
            saved.match = m
        }
        if args.string(forKey: "clear") != nil { saved.match = nil }
        if let ago = args.string(forKey: "ago").flatMap({ Int64($0) }) { saved.match?.periodStart = nowMs() - ago * 1000 }
        if args.string(forKey: "stoppage") != nil { saved.match?.toggleStoppage(nowMs() - 42_000) }
        // TMR-16: -added <seconds> puts that much stoppage on the period (as Adjust added time), for the added time left.
        if let added = args.string(forKey: "added").flatMap({ Int($0) }) { saved.match?.adjustAdded(added, now: nowMs()) }
        if args.string(forKey: "finish") != nil, let m = saved.match {
            m.finish(nowMs())
            matchFinished(m)
        }
        persist()
        #endif
    }

    /// The file has everything but the session's token, which is in the keychain (WCH-4).
    private var keptToken: String?

    private func persist() {
        if saved.token != keptToken {
            WatchKeychain.write(saved.token)
            keptToken = saved.token
        }
        var plain = saved
        plain.token = nil
        if let data = try? JSONEncoder().encode(plain) { try? data.write(to: file, options: .atomic) }
    }

    func update(_ change: (inout Saved) -> Void) {
        change(&saved)
        persist()
    }

    /// A change to the match in progress, saved at once (TMR-8).
    func changeMatch(_ change: (Match) -> Void) {
        guard let m = saved.match else { return }
        let before = m.phase
        let wasPlayed = !m.startedAt.isEmpty
        change(m)
        revision += 1
        persist()
        // PRE-6: Restart match goes back to the kickoff, and the recording so far goes, as on Garmin.
        if wasPlayed, m.startedAt.isEmpty {
            if recording { workout.finish(save: false) }
            track.discard(m.created)
        }
        follow(m)
        if before != .done && m.phase == .done {
            // SYNC-7: the distance, before the workout closes.
            if let distance = workout.distance { m.distanceM = distance }
            if recording { workout.finish(save: saved.saveToHealth ?? true) }
            if m.recordTrack != false, let finished = track.finish(m.created) { queueTrack(finished) }
            matchFinished(m)
        } else if m.phase == .done {
            refreshFinished(m)
        }
    }

    func beginMatch(_ setup: MatchSetup) {
        // WCH-7: the questions were asked at first launch (askPermissions), never between Start match and kickoff.
        if recording {
            healthRefused = workout.refused
            locationApproximate = workout.approximate
        }
        // SET-8: the names as they are now, kept with the match.
        var named = setup
        named.stoppageLabel = saved.stoppageLabel
        named.breakLabel = saved.breakLabel
        let m = Match(setup: named, created: nowSeconds())
        m.recordTrack = saved.recordTrack ?? true
        m.vibeFullTime = saved.vibeFullTime
        m.vibeAdded = saved.vibeAdded ?? true
        m.vibeSinBin = saved.vibeSinBin ?? true
        m.vibeBreak = saved.vibeBreak
        m.vibeStoppage = saved.vibeStoppage
        m.repeatSec = saved.alertRepeatSec ?? 10
        m.reminderSec = saved.stoppageReminderSec ?? 10
        // EVT-14: the planned match's scheme (its competition's), else the account's; a quick or created match has the account's.
        let planned = setup.matchId.flatMap { id in saved.matches.first { $0.id == id } }
        m.misconductScheme = Misconduct.scheme(planned?.misconductScheme ?? saved.misconductScheme)
        update { s in
            s.match = m
            s.lastFormat = setup.format
        }
    }

    // MARK: Create match (SET-9, SET-13, SET-14): the match being set up, not kept

    var draft = MatchSetup()
    var sameAsLast = false

    /// A new Create match: the last match's format with Same as last on, or Quick match's before the first match.
    func startDraft() {
        draft = saved.lastFormat ?? saved.quick.format
        sameAsLast = saved.lastFormat != nil
    }

    func chooseSameAsLast(_ on: Bool) {
        sameAsLast = on
        // Back to exactly the last format, whatever was changed while it was off.
        if on, let last = saved.lastFormat { draft = draft.withFormat(last) }
    }

    // MARK: Reset LawFive (DATA-8)

    private(set) var resetting = false
    /// Goes up with each reset, so the screens start again at the top.
    private(set) var resets = 0

    /// Everything the app keeps goes (the link, matches, history, what waits to send, the chosen server),
    /// but not the settings. A linked watch signs out on the server first, so the devices lists drop it,
    /// for a few seconds at most. watchOS has no closing an app, so it goes back to the start.
    func reset() async {
        resetting = true
        // SYNC-6: a sign-out that doesn't get through is kept, so the server still drops it later.
        var left: SignOut?
        if let token = saved.token {
            let server = server
            let signOut = Task { () -> Bool in
                do { _ = try await server.post("/v1/auth/sign-out", token: token, body: nil) } catch is ServerRefused {} catch { return false }
                return true
            }
            let limit = Task {
                try? await Task.sleep(for: .seconds(8))
                signOut.cancel()
            }
            if await !signOut.value { left = SignOut(server: serverUrl, token: token) }
            limit.cancel()
        }
        let s = saved
        var kept = Saved()
        kept.quick = s.quick
        kept.faceLayout = s.faceLayout
        kept.secondClock = s.secondClock
        kept.screen = s.screen
        kept.screenAt = s.screenAt
        kept.vibeFullTime = s.vibeFullTime
        kept.vibeAdded = s.vibeAdded
        kept.vibeSinBin = s.vibeSinBin
        kept.vibeBreak = s.vibeBreak
        kept.vibeStoppage = s.vibeStoppage
        kept.alertRepeatSec = s.alertRepeatSec
        kept.stoppageReminderSec = s.stoppageReminderSec
        kept.permissionsAsked = s.permissionsAsked
        kept.tapStoppage = s.tapStoppage
        kept.teamSwipes = s.teamSwipes
        kept.cardReasons = s.cardReasons
        kept.touchLock = s.touchLock
        kept.stoppageName = s.stoppageName
        kept.breakName = s.breakName
        kept.recordTrack = s.recordTrack
        kept.saveToHealth = s.saveToHealth
        kept.signOuts = (s.signOuts ?? []) + (left.map { [$0] } ?? [])
        track.eraseAll()
        update { $0 = kept }
        resetting = false
        resets += 1
    }

    func clearMatch() {
        if let m = saved.match, m.phase != .done {
            // Canceled: nothing of it is kept.
            if recording { workout.finish(save: false) }
            track.discard(m.created)
        }
        update { $0.match = nil }
    }

    // MARK: Recording (WCH-7, TRK-7)

    /// Off for the UI tests (-noWorkout), as Apple Health's question would cover the screen.
    private var recording: Bool {
        #if DEBUG
        return !UserDefaults.standard.bool(forKey: "noWorkout")
        #else
        return true
        #endif
    }

    /// The workout runs while a period is played, and pauses between them (ACT-2) and while play is suspended (TMR-13).
    private func follow(_ m: Match) {
        guard recording else { return }
        switch m.phase {
        case .running, .golden:
            workout.run()
            if m.recordTrack != false { track.begin(m.created, now: nowMs()) }
        case .breakTime, .nextKickoff, .decide, .penalties, .suspended:
            workout.pause()
        case .pre, .ready, .done:
            break
        }
    }

    /// Newest last; beyond 3, the oldest goes with its chunks, as on Garmin.
    private func queueTrack(_ finished: TrackUpload) {
        update { s in
            var queued = (s.tracks ?? []).filter { $0.created != finished.created } + [finished]
            while queued.count > 3 {
                let old = queued.removeFirst()
                track.delete(old.created, from: old.next, to: old.count)
            }
            s.tracks = queued
        }
    }

    /// Every second: fires what's due; saved only when something changed, as most ticks change nothing.
    private func tick() {
        guard let m = saved.match else { return }
        // Before the kickoff, as the location's question is answered.
        if m.phase == .pre, recording, m.recordTrack != false, workout.approximate != locationApproximate { locationApproximate = workout.approximate }
        // TMR-13: the lightning countdown's vibration is saved, so it comes once; VIB-1: full time's one vibration with
        // stoppage tracked too, and whether it repeats.
        let before = [m.breakDue, m.scheduledBreakDone, m.breakEndAlerted, m.isStoppageActive, m.lightningAlerted == true, m.fullTimeAcked, m.fullTimeRepeats == true]
        let breakBefore = m.breakEnd
        // EVT-12: a sin bin over is saved, so "can return" survives a restart.
        let returnsBefore = m.sinBinWaiting
        let now = nowMs()
        if let alert = m.tick(now) { Haptics.play(alert) }
        // TRK-7: a sample a second while play goes on.
        if recording, m.recordTrack != false, m.phase == .running || m.phase == .golden,
           let hadFix = track.sample(m.created, now: now, location: workout.location, heartRate: workout.heartRate) {
            m.noteGps(hadFix, now: now)
        }
        if before != [m.breakDue, m.scheduledBreakDone, m.breakEndAlerted, m.isStoppageActive, m.lightningAlerted == true, m.fullTimeAcked, m.fullTimeRepeats == true] || breakBefore != m.breakEnd
            || returnsBefore != m.sinBinWaiting {
            revision += 1
            persist()
        }
    }

    private func matchFinished(_ m: Match) {
        update { s in
            if let body = uploadFor(m) {
                s.outbox.append(body)
                s.outboxCreated.append(m.created)
            }
            // UI-20: the fee the planned match had, which a fee paid later changes here too.
            let fee = m.setup.matchId.flatMap { id in s.matches.first { $0.id == id }?.fee }
            s.history.insert(FinishedMatch(created: m.created, home: m.setup.home, away: m.setup.away, score: m.score, pens: m.penaltyScore(), golden: m.endedGolden,
                                           matchId: m.setup.matchId, setup: m.setup, events: m.events, clockStyle: m.clockStyle, distanceM: m.distanceM, fee: fee), at: 0)
            s.history = Array(s.history.prefix(historyKept))
        }
        sync()
    }

    /// Cards given after full time belong in the record too (EVT-7).
    private func refreshFinished(_ m: Match) {
        update { s in
            if let i = s.outboxCreated.firstIndex(of: m.created) {
                s.outbox.remove(at: i)
                s.outboxCreated.remove(at: i)
            }
            if let body = uploadFor(m) {
                s.outbox.append(body)
                s.outboxCreated.append(m.created)
            }
            if let i = s.history.firstIndex(where: { $0.created == m.created }) {
                s.history[i].sent = false
                // EVT-7: a card after full time shows in History's Events too.
                s.history[i].events = m.events
            }
        }
    }

    /// POST /v1/watch/records.
    private func uploadFor(_ m: Match) -> Data? {
        let s = m.setup
        var body: [String: Any] = [
            "created": m.created, "device": Server.hardwareModel, "home": s.home, "away": s.away, "homeName": s.homeName, "awayName": s.awayName,
            "homeColor": s.homeColor, "awayColor": s.awayColor, "numPeriods": s.numPeriods, "periodSec": s.periodSec, "halftimeSec": s.halftimeSec,
            "teamSize": s.teamSize, "breakAtSec": m.breakAtSec, "breakLenSec": s.breakLenSec, "extraTime": s.extraTime, "etPeriods": s.etPeriods,
            "etPeriodSec": s.etPeriodSec, "goldenGoal": m.goldenGoal, "penalties": s.penalties, "clockStyle": m.clockStyle, "trackStoppage": s.trackStoppage, "breakStoppage": s.breakStoppage,
            "goalScorers": s.goalScorers, "goalTypes": s.goalTypes, "sinBins": s.hasSinBins, "sinBinSec": s.sinBinLength,
            // TMR-15: every event's seconds are then the clock's, which stood still during the stoppages.
            "stoppingClock": s.stops, "stopForGoalsCards": s.stopForGoalsCards != false, "score": m.score, "startedAt": m.startedAt, "kickoff": m.kickoff,
            "events": m.events.map { e -> [Any] in [e.type, e.team, e.period, e.seconds, e.player as Any? ?? NSNull(), e.extra as Any? ?? NSNull()] },
        ]
        if let id = s.matchId { body["matchId"] = id }
        // DIAG-1.
        body["diagnostics"] = [
            "battery": m.batteryLog ?? [], "app": String(version.prefix(40)), "firmware": String(WKInterfaceDevice.current().systemVersion.prefix(40)), "restarts": m.restarts ?? 0,
            "gpsSamples": m.gpsSamples ?? 0, "gpsMissed": m.gpsMissed ?? 0,
        ].merging(m.gpsFirstFixSec.map { ["gpsFirstFixSec": $0] } ?? [:]) { a, _ in a } as [String: Any]
        // SYNC-7.
        if let distance = m.distanceM { body["distanceM"] = Int(distance.rounded()) }
        if let pens = m.penaltyScore() { body["pens"] = pens }
        if m.endedGolden == true { body["golden"] = true }
        if let heading = m.homeHeading { body["homeHeading"] = heading } // PRE-8, for heatmaps (TRK-9).
        // EVT-14: the cards' reasons beside the events, only when there are any.
        if let misconduct = m.misconductUpload { body["misconduct"] = misconduct }
        return try? JSONSerialization.data(withJSONObject: body)
    }

    // MARK: The match screen (UI-21, UI-24)

    func chooseScreen(_ change: (inout WatchScreen) -> Void) {
        let at = nowSeconds()
        var chosen = saved.chosenScreen
        change(&chosen)
        let sent = ScreenChange(layout: layoutIds[chosen.nearestLayout], secondClock: clockIds[chosen.second], at: at,
                                clocks: clocksIds[chosen.clocks], mainClock: clockIds[chosen.mainClock], breakClock: breakIds[chosen.breakClock],
                                edge: edgeIds[chosen.edge], names: chosen.names)
        update { s in
            s.screen = chosen
            s.screenAt = at
            s.screenChange = sent
        }
        sync()
    }

    /// UI-24: the account's choice, if it's newer than this watch's and readable. An older server sends only a layout and second clock: how the clocks count stays.
    private func applyScreen(_ screen: ScreenChange?) {
        guard let screen, screen.at > saved.screenAt, let layout = layoutIds.firstIndex(of: screen.layout), let second = clockIds.firstIndex(of: screen.secondClock) else { return }
        let current = saved.chosenScreen
        var chosen = WatchScreen.fromLayout(layout, mainClock: current.mainClock, secondClock: second, breakClock: current.breakClock)
        if let clocks = screen.clocks {
            guard let c = clocksIds.firstIndex(of: clocks), let main = screen.mainClock.flatMap({ clockIds.firstIndex(of: $0) }),
                  let brk = screen.breakClock.flatMap({ breakIds.firstIndex(of: $0) }), let edge = screen.edge.flatMap({ edgeIds.firstIndex(of: $0) }),
                  let names = screen.names else { return }
            chosen = WatchScreen(clocks: c, mainClock: main, secondClock: second, breakClock: brk, edge: edge, names: names)
        }
        update { s in
            s.screen = chosen
            s.screenAt = screen.at
        }
    }

    // MARK: Mark pitch (TRK-13)

    /// Two to four corners, [latitude, longitude] in degrees, for a planned match by its id or a quick one by when it started.
    func queuePitch(matchId: String?, created: Int64?, corners: [[Double]]) {
        guard corners.count >= 2 else { return }
        let upload = PitchUpload(matchId: matchId, created: matchId == nil ? created : nil,
                                 corners: corners.map { [Int(($0[0] * 1_000_000).rounded()), Int(($0[1] * 1_000_000).rounded())] }, at: nowSeconds())
        update { s in s.pitches = (s.pitches ?? []).filter { $0.matchId != upload.matchId || $0.created != upload.created } + [upload] }
        sync()
    }

    // MARK: Fees (SYNC-11)

    func markPaid(_ id: String, paid: Bool) {
        update { s in
            if let i = s.matches.firstIndex(where: { $0.id == id }) { s.matches[i].fee?.paid = paid }
            // UI-20: marked from History, or before the game; both show it.
            for i in s.history.indices where s.history[i].matchId == id { s.history[i].fee?.paid = paid }
            s.fees.removeAll { $0.matchId == id }
            s.fees.append(FeeChange(matchId: id, paid: paid, at: nowSeconds()))
        }
        sync()
    }

    // MARK: History (UI-17)

    /// Remove from watch: the match, and anything of it still waiting to send (it's lost if it hadn't gone).
    func removeFinished(_ created: Int64) {
        if let queued = saved.tracks?.first(where: { $0.created == created }) { track.delete(created, from: queued.next, to: queued.count) }
        update { s in
            s.history.removeAll { $0.created == created }
            if let i = s.outboxCreated.firstIndex(of: created) {
                s.outbox.remove(at: i)
                s.outboxCreated.remove(at: i)
            }
            s.tracks?.removeAll { $0.created == created }
            s.pitches?.removeAll { $0.created == created && $0.matchId == nil }
        }
    }

    // MARK: Permissions at first launch (WCH-7)

    /// The first time the app opens, before any match: LawFive's own screen on what it asks for and why, while
    /// Apple Health's or the location's question is still to come. Not for the UI tests' -noWorkout.
    var showsPermissions: Bool { recording && saved.permissionsAsked != true }

    /// Continue: Apple Health's question, then the location's. Returns what was refused, for the screen to say.
    func askPermissions() async -> (health: Bool, location: Bool) {
        await workout.ask()
        // The location's answer comes on its own; give it a moment before saying what's off.
        for _ in 0..<60 where workout.locationUndecided { try? await Task.sleep(for: .milliseconds(500)) }
        healthRefused = workout.refused
        locationApproximate = workout.approximate
        return (healthRefused, workout.locationRefused)
    }

    func finishPermissions() { update { $0.permissionsAsked = true } }

    // MARK: Sync (SYNC-3, SYNC-4, SYNC-6)

    func linkWith(_ token: String) {
        update { $0.token = token }
        sync()
    }

    func setServer(_ url: String?) { update { $0.server = url } }

    /// SYNC-6: forgets the account and its matches. The watch signs out on the server, so the devices lists drop it;
    /// without a connection the old link waits in `signOuts` until there is one. Not when the server already
    /// refused it (`signOut` false).
    func unlink(signOut: Bool = true) {
        let old = saved.token.map { SignOut(server: serverUrl, token: $0) }
        update { s in
            s.token = nil
            s.matches = []
            s.lastSync = nil
            s.screenChange = nil
            s.screenAt = 0
            if signOut, let old { s.signOuts = (s.signOuts ?? []) + [old] }
        }
        sendSignOuts()
    }

    private var signingOut = false

    /// SYNC-6: the old links waiting, each to the server it came from; gone once that server answers, kept while it can't be reached.
    private func sendSignOuts() {
        guard !signingOut, !(saved.signOuts ?? []).isEmpty else { return }
        signingOut = true
        Task {
            defer { signingOut = false }
            for old in saved.signOuts ?? [] {
                do { _ = try await Server(base: old.server).post("/v1/auth/sign-out", token: old.token, body: nil) } catch is ServerRefused {} catch { return }
                update { s in s.signOuts = (s.signOuts ?? []).filter { $0 != old } }
            }
        }
    }

    func sync() {
        sendSignOuts()
        guard let token = saved.token, !syncing else { return }
        syncing = true
        syncProblem = nil
        if !saved.outbox.isEmpty {
            syncTotal = saved.outbox.count
            syncSent = 0
            syncScreenShown = false
        }
        let server = server
        Task {
            defer { syncing = false }
            do {
                while let body = saved.outbox.first {
                    _ = try await server.post("/v1/watch/records", token: token, body: body)
                    syncSent += 1
                    let created = saved.outboxCreated.first
                    update { s in
                        s.outbox.removeFirst()
                        s.outboxCreated.removeFirst()
                        if let i = s.history.firstIndex(where: { $0.created == created }) { s.history[i].sent = true }
                    }
                }
                // TRK-7: the tracks of matches sent, a chunk a request, oldest first.
                while let next = saved.tracks?.first {
                    if next.next >= next.count {
                        update { $0.tracks?.removeFirst() }
                        continue
                    }
                    do {
                        if let data = track.chunk(next.created, next.next) {
                            let chunk: [String: Any] = ["created": next.created, "start": next.start, "index": next.next, "count": next.count,
                                                        "device": Server.hardwareModel, "data": data]
                            _ = try await server.post("/v1/watch/tracks", token: token, body: try JSONSerialization.data(withJSONObject: chunk))
                        }
                    } catch let e as ServerRefused where e.status == 404 {
                        // A server from before tracks, or the match was deleted: the track has nowhere to go.
                        track.delete(next.created, from: next.next, to: next.count)
                        update { $0.tracks?.removeFirst() }
                        continue
                    } catch let e as ServerRefused where e.status == 400 {
                        // A chunk the server can't take: on to the next.
                    }
                    track.delete(next.created, from: next.next, to: next.next + 1)
                    update { $0.tracks?[0].next += 1 }
                }
                // SYNC-12: after the matches, so a quick match is there to take its pitch.
                for pitch in saved.pitches ?? [] {
                    do {
                        _ = try await server.post("/v1/watch/pitch", token: token, body: try JSONEncoder().encode(pitch))
                    } catch let e as ServerRefused where e.status == 400 || e.status == 404 {
                        // The match has gone, or the server can't take it: nothing to do.
                    }
                    update { s in s.pitches?.removeAll { $0 == pitch } }
                }
                for fee in saved.fees {
                    do {
                        _ = try await server.post("/v1/watch/fee", token: token, body: try JSONEncoder().encode(fee))
                    } catch let e as ServerRefused where e.status != 401 {
                        // The match has gone: nothing to do.
                    }
                    update { s in s.fees.removeAll { $0 == fee } }
                }
                if let change = saved.screenChange {
                    do {
                        _ = try await server.post("/v1/watch/screen", token: token, body: try JSONEncoder().encode(change))
                    } catch let e as ServerRefused where e.status != 401 {
                        // A server from before it.
                    }
                    update { $0.screenChange = nil }
                }
                struct Answer: Decodable {
                    var matches: [PlannedMatch]
                    var screen: ScreenChange?
                    var teamSwipes: String?
                    var serverVersion: String?
                    /// EVT-14: the account's scheme; servers from before it don't send it.
                    var misconductScheme: String?
                }
                let answer = try JSONDecoder().decode(Answer.self, from: try await server.get("/v1/watch/matches?limit=10", token: token))
                update { s in
                    s.matches = answer.matches
                    s.lastSync = nowSeconds()
                    if let swipes = answer.teamSwipes { s.teamSwipes = swipes }
                    if let scheme = answer.misconductScheme { s.misconductScheme = scheme }
                    if let version = answer.serverVersion { s.serverVersion = version }
                }
                applyScreen(answer.screen)
            } catch let e as ServerRefused {
                if e.status == 401 {
                    unlink(signOut: false)
                    syncProblem = "Unlinked; link again"
                } else {
                    syncProblem = "The server said no (\(e.status))"
                }
            } catch {
                syncProblem = "Can't reach the server"
            }
        }
    }

    var syncLine: String {
        if syncing { return "Syncing…" }
        if let syncProblem { return syncProblem }
        guard let at = saved.lastSync else { return "Not synced yet" }
        let minutes = (nowSeconds() - at) / 60
        if minutes < 1 { return "Synced just now" }
        if minutes < 60 { return "Synced \(minutes) min ago" }
        return "Synced \(Date(timeIntervalSince1970: TimeInterval(at)).formatted(date: .omitted, time: .shortened))"
    }
}

/// VIB-1 to VIB-7: watchOS's own haptics, the closest to the watch's patterns.
enum Haptics {
    static func play(_ alert: Alert) {
        switch alert {
        case .fullTime: WKInterfaceDevice.current().play(.notification)
        // VIB-7: the closest to four quick pulses, and unlike full time's.
        case .addedTime: WKInterfaceDevice.current().play(.failure)
        // TMR-13: the lightning countdown at 0:00, as a break's end (VIB-3).
        case .breakStart, .breakEnd, .lightning: WKInterfaceDevice.current().play(.retry)
        case .reminder: WKInterfaceDevice.current().play(.click)
        // EVT-12: three short, firm taps, a pattern of its own in VIB-5's family (watchOS has no custom patterns).
        case .sinBinEnd:
            for i in 0..<3 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3 * Double(i)) { WKInterfaceDevice.current().play(.start) }
            }
        }
    }
    static func tick() { WKInterfaceDevice.current().play(.click) }
    static func sendOff() { WKInterfaceDevice.current().play(.failure) }
}
