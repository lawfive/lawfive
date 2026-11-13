import XCTest
@testable import LawFive

// The owner's choices of 2026-11-09 on the iPhone, as Android's ChoicesTest: the starter formats and
// what a new match starts with (SET-17), the heatmap's ends (TRK-9, the website's cases in
// web/test/pitchEnds.test.ts), Get ready (WEB-32), On your watch (SYNC-14), and linking the paired
// Apple Watch from the phone (decision 4c: the messages and the linker's steps).
@MainActor
final class ChoicesTests: XCTestCase {
    /// The phones' copy of schema's starterFormats, from the repo (the simulator reads the Mac's files).
    private let generated = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../schema/generated/starter-formats.json")

    func testTheStarterFormatsAreSchemasFieldForField() throws {
        struct Shared: Decodable {
            let id: String
            let name: String
            let ageGroups: [String]
            let format: MatchFormat
        }
        let shared = try JSONDecoder().decode([Shared].self, from: Data(contentsOf: generated))
        XCTAssertEqual(shared.map(\.id), starterFormats.map(\.id))
        for (s, k) in zip(shared, starterFormats) {
            XCTAssertEqual(s.name, k.name)
            XCTAssertEqual(s.ageGroups, k.ageGroups)
            XCTAssertEqual(s.format, k.format, s.id)
        }
    }

    func testAMatchsAgeGroupSuggestsItsStarter() {
        XCTAssertEqual(starterFormatFor("U10")?.id, "us-u10")
        XCTAssertEqual(starterFormatFor("u 10")?.id, "us-u10")
        XCTAssertEqual(starterFormatFor("U6")?.id, "us-u8")
        XCTAssertEqual(starterFormatFor("adult")?.id, "adult")
        // TMR-15: high school and college on the stopping clock.
        XCTAssertEqual(starterFormatFor("Varsity")?.id, "us-hs")
        XCTAssertEqual(starterFormatFor("ncaa")?.id, "us-college")
        XCTAssertEqual(starterFormatFor("HS")?.format.stoppingClock, true)
        XCTAssertNil(starterFormatFor("O35"))
        XCTAssertNil(starterFormatFor(nil))
        XCTAssertNil(starterFormatFor(" "))
    }

    func testAFormatIsAStarterWhenItsTheSameCountingTheFieldsSavedBeforeAsTheirDefaults() {
        XCTAssertEqual(starterOf(schemaDefaultFormat)?.id, "adult")
        // The app's own 2×45, saved before golden goal was a field.
        XCTAssertEqual(starterOf(defaultFormat)?.id, "adult")
        var forty = schemaDefaultFormat
        forty.periodSec = 40 * 60
        XCTAssertNil(starterOf(forty))
        var unset = schemaDefaultFormat
        unset.goldenGoal = nil
        unset.breakStoppage = nil
        XCTAssertTrue(sameFormat(schemaDefaultFormat, unset))
        var penalties = schemaDefaultFormat
        penalties.penalties = true
        XCTAssertFalse(sameFormat(schemaDefaultFormat, penalties))
        // TMR-15: saved before the stopping clock, the clock runs on; goals and cards stopping it counts only with it.
        var older = schemaDefaultFormat
        older.stoppingClock = nil
        older.stopForGoalsCards = nil
        XCTAssertTrue(sameFormat(schemaDefaultFormat, older))
        older.stopForGoalsCards = false
        XCTAssertTrue(sameFormat(schemaDefaultFormat, older))
        var stops = schemaDefaultFormat
        stops.stoppingClock = true
        XCTAssertFalse(sameFormat(schemaDefaultFormat, stops))
        var notForGoals = stops
        notForGoals.stopForGoalsCards = false
        XCTAssertFalse(sameFormat(stops, notForGoals))
    }

    func testANewMatchStartsWithTheUsualFormatElse2x45AndSavingOneLeavesItsFormatAsTheUsual() {
        XCTAssertEqual(startingFormat(nil, templates: []).format, schemaDefaultFormat)
        XCTAssertNil(startingFormat(nil, templates: []).templateId)
        let league = MatchTemplate(id: "t1", version: 1, updatedAt: "2026-11-01T00:00:00Z", name: "League", format: starterFormats[1].format, defaults: MatchTemplateDefaults())
        let usual = UsualFormat(format: league.format, templateId: "t1", changedAt: "2026-11-01T00:00:00Z")
        XCTAssertEqual(startingFormat(usual, templates: [league]).templateId, "t1")
        // The template since deleted: its format stays, without its name.
        XCTAssertEqual(startingFormat(usual, templates: []).format, league.format)
        XCTAssertNil(startingFormat(usual, templates: []).templateId)

        // Which choice a format is, and the usual one it leaves: the starter or template only while unchanged.
        let u12 = starterFormats[2].format
        XCTAssertEqual(formatChoiceOf(u12, templateId: nil, usual: nil, templates: [league]).id, "starter:us-u12")
        XCTAssertEqual(formatChoiceOf(league.format, templateId: "t1", usual: nil, templates: [league]).id, "template:t1")
        var eight = u12
        eight.teamSize = 8
        XCTAssertEqual(formatChoiceOf(eight, templateId: nil, usual: nil, templates: [league]).id, "none")
        let custom = UsualFormat(format: eight, changedAt: "2026-11-01T00:00:00Z")
        XCTAssertEqual(formatChoiceOf(custom.format, templateId: nil, usual: custom, templates: []).name, "Your usual")
        XCTAssertEqual(usualFormatChoice(custom, templates: []).name, "As last saved")
        XCTAssertEqual(usualFormatChoice(nil, templates: []).name, "Not chosen yet")
        let saved = usualFormatFrom(u12, choice: formatChoiceOf(u12, templateId: nil, usual: nil, templates: []), now: "2026-11-09T00:00:00Z")
        XCTAssertEqual(saved.starterId, "us-u12")
        XCTAssertNil(usualFormatFrom(custom.format, choice: formatChoiceOf(custom.format, templateId: nil, usual: nil, templates: []), now: "2026-11-09T00:00:00Z").starterId)
        // Saved again with the same format, nothing changes, so the settings aren't touched.
        var later = saved
        later.changedAt = "2026-11-10T00:00:00Z"
        XCTAssertFalse(usualChanged(saved, later))
        XCTAssertTrue(usualChanged(nil, saved))
        var other = saved
        other.format = custom.format
        other.starterId = nil
        XCTAssertTrue(usualChanged(saved, other))
        // The age group suggests its starter only when the format differs.
        XCTAssertEqual(suggestedStarter("U10", format: schemaDefaultFormat)?.id, "us-u10")
        XCTAssertNil(suggestedStarter("U10", format: starterFormats[1].format))
    }

    // TRK-9, the website's cases (web/test/pitchEnds.test.ts) on a pitch running east.
    private let ux = 1.0
    private let uy = 0.0

    func testARefereesDrawingIsTurnedSoTheFirstKickoffTeamAttacksLeftToRightInTheFirstPeriod() {
        // Kicking off toward the east on a pitch running east: drawn as it lies.
        XCTAssertEqual(pitchEnds(periods: 2, team: "home", bearingDeg: 90, ux: ux, uy: uy, turned: false), [PeriodEnds(period: 1, left: "home", right: "away"), PeriodEnds(period: 2, left: "away", right: "home")])
        // Toward the west: the drawing is turned, and the kickoff team is still on the left.
        XCTAssertEqual(pitchEnds(periods: 2, team: "away", bearingDeg: 270, ux: ux, uy: uy, turned: true).first, PeriodEnds(period: 1, left: "away", right: "home"))
        XCTAssertTrue(pitchTurned(role: "referee", acrossInPeriods: [], bearingDeg: 270, ux: ux, uy: uy))
        XCTAssertFalse(pitchTurned(role: "referee", acrossInPeriods: [], bearingDeg: 90, ux: ux, uy: uy))
    }

    func testTeamsChangeEndsEveryPeriod() {
        let ends = pitchEnds(periods: 4, team: "home", bearingDeg: 80, ux: ux, uy: uy, turned: false)
        XCTAssertEqual(ends.map(\.left), ["home", "away", "home", "away"])
        XCTAssertEqual(ends.map(\.right), ["away", "home", "away", "home"])
    }

    func testAnAssistantsDrawingTurnedForTheirTouchlineCanPutTheKickoffTeamOnTheRight() {
        XCTAssertEqual(pitchEnds(periods: 2, team: "home", bearingDeg: 100, ux: ux, uy: uy, turned: true).first, PeriodEnds(period: 1, left: "away", right: "home"))
        // A pitch running north: a kickoff toward the north attacks the right end as drawn.
        XCTAssertEqual(pitchEnds(periods: 2, team: "away", bearingDeg: 10, ux: 0, uy: 1, turned: false).first, PeriodEnds(period: 1, left: "away", right: "home"))
        // Their touchline is the side they were on in the periods.
        XCTAssertTrue(pitchTurned(role: "ar1", acrossInPeriods: [30, 31, -2], bearingDeg: 90, ux: ux, uy: uy))
        XCTAssertFalse(pitchTurned(role: "ar2", acrossInPeriods: [-30, -31], bearingDeg: 90, ux: ux, uy: uy))
    }

    func testWithoutTheKickoffDirectionThereAreNoEndsToName() {
        XCTAssertEqual(pitchEnds(periods: 2, team: nil, bearingDeg: nil, ux: ux, uy: uy, turned: false), [])
    }

    func testTheWholeMatchGroupsThePeriodsByWhichWayRoundTheyWerePlayed() {
        let halves = pitchEnds(periods: 2, team: "home", bearingDeg: 90, ux: ux, uy: uy, turned: false)
        XCTAssertEqual(endsByWayRound(halves, periods: 2), [EndsRow(label: "1st half", left: "home", right: "away"), EndsRow(label: "2nd half", left: "away", right: "home")])
        XCTAssertEqual(endsByWayRound(pitchEnds(periods: 4, team: "away", bearingDeg: 90, ux: ux, uy: uy, turned: false), periods: 4).map(\.label), ["P1, P3", "P2, P4"])
        XCTAssertEqual(endsByWayRound(pitchEnds(periods: 3, team: "home", bearingDeg: 90, ux: ux, uy: uy, turned: false), periods: 3).map(\.label), ["P1, P3", "P2"])
    }

    private let us = SettingsDefaults.settings(for: Locale(identifier: "en_US"), id: "s")

    func testGetReadySaysWhatWasGuessedInTheWebsitesWords() {
        XCTAssertEqual(GetReady.zoneName("America/Los_Angeles"), "Los Angeles time")
        XCTAssertEqual(GetReady.unitsLine(us, phoneZone: "America/Los_Angeles"), "Miles, °F, USD and Los Angeles time")
        XCTAssertEqual(GetReady.unitsLine(SettingsDefaults.settings(for: Locale(identifier: "en_GB"), id: "s"), phoneZone: "Europe/London"), "Kilometers, °C, GBP and London time")
    }

    func testTheUnitsAreDoneOnceTheyreConfirmedOrChosenOtherThanThePhoneGuessed() {
        let zone = "America/Los_Angeles"
        XCTAssertFalse(GetReady.unitsChosen(us, guess: us, phoneZone: zone))
        var km = us
        km.distanceUnit = "km"
        XCTAssertTrue(GetReady.unitsChosen(km, guess: us, phoneZone: zone))
        var denver = us
        denver.timeZone = "America/Denver"
        XCTAssertTrue(GetReady.unitsChosen(denver, guess: us, phoneZone: zone))
        var here = us
        here.timeZone = zone
        XCTAssertFalse(GetReady.unitsChosen(here, guess: us, phoneZone: zone))
        XCTAssertFalse(GetReady.done(watches: 0, remindersOn: false, settings: us, guess: us, phoneZone: zone, matches: 0, calendars: 0).units)
        var confirmed = us
        confirmed.getReady = UserSettingsGetReady(unitsConfirmed: true)
        XCTAssertTrue(GetReady.done(watches: 0, remindersOn: false, settings: confirmed, guess: us, phoneZone: zone, matches: 0, calendars: 0).units)
    }

    func testGetReadyTicksEachRowItselfAndGoesOnceTheyreAllDoneOrItsHidden() {
        let zone = "America/Los_Angeles"
        let none = GetReady.done(watches: 0, remindersOn: false, settings: us, guess: us, phoneZone: zone, matches: 0, calendars: 0)
        XCTAssertEqual(none.count, 0)
        XCTAssertTrue(GetReady.shows(us, none))
        var hidden = us
        hidden.getReady = UserSettingsGetReady(hidden: true)
        XCTAssertFalse(GetReady.shows(hidden, none))
        // An assignor calendar brings the games in, even before its first match.
        XCTAssertTrue(GetReady.done(watches: 0, remindersOn: false, settings: us, guess: us, phoneZone: zone, matches: 0, calendars: 1).games)
        var chosen = us
        chosen.watchScreen = WatchScreen(layout: "ring", secondClock: "down", changedAt: "2026-11-03T12:00:00Z")
        chosen.getReady = UserSettingsGetReady(unitsConfirmed: true)
        let all = GetReady.done(watches: 1, remindersOn: true, settings: chosen, guess: us, phoneZone: zone, matches: 3, calendars: 0)
        XCTAssertEqual(all.count, 5)
        XCTAssertFalse(GetReady.shows(chosen, all))
    }

    private func onWatch(_ match: String, _ upToDate: Bool, _ since: String, name: String = "Garmin Venu 2", device: String = "d1") -> MatchOnWatch {
        MatchOnWatch(matchId: match, deviceId: device, kind: "garmin", name: name, since: since, syncedAt: since, upToDate: upToDate)
    }

    func testOnYourWatchInTheRequirementsWords() throws {
        let la = TimeZone(identifier: "America/Los_Angeles")!
        let now = instantOf("2026-11-10T05:00:00Z")! // 9 PM on Nov 9 in Los Angeles
        func formatter(_ pattern: String) -> DateFormatter {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US")
            f.timeZone = la
            f.dateFormat = pattern
            return f
        }
        let time = { (d: Date) in formatter("h:mm a").string(from: d) }
        let day = { (d: Date) in formatter("EEE, MMM d").string(from: d) }
        let saved = OnWatchSaved(matches: [onWatch("m1", true, "2026-11-10T04:12:00Z"), onWatch("m2", false, "2026-11-08T04:12:00Z"), onWatch("m3", true, "2026-11-08T04:12:00Z")], watches: ["Garmin Venu 2"])
        func text(_ m: String, _ s: OnWatchSaved? = nil) -> [String] { OnWatchStore.lines(m, s ?? saved, zone: la, now: now, time: time, day: day).map(\.text) }
        XCTAssertEqual(text("m1"), ["On your Venu 2 since 8:12 PM"])
        XCTAssertEqual(text("m2"), ["On your Venu 2, an older version: sync the watch"])
        XCTAssertEqual(OnWatchStore.lines("m2", saved, zone: la, now: now, time: time, day: day).first?.tone, .old)
        XCTAssertEqual(text("m3"), ["On your Venu 2 since Sat, Nov 7, 8:12 PM"])
        XCTAssertEqual(text("m5", OnWatchSaved(matches: [onWatch("m5", true, "2026-11-09T04:12:00Z")], watches: ["Garmin Venu 2"])), ["On your Venu 2 since yesterday, 8:12 PM"])
        XCTAssertEqual(text("m4"), ["Not on a watch yet"])
        // No watch linked, or not fetched yet: nothing to say.
        XCTAssertEqual(text("m4", OnWatchSaved(matches: [], watches: [])), [])
        XCTAssertEqual(text("m1", OnWatchSaved(matches: saved.matches, watches: nil)), [])
        XCTAssertEqual(OnWatchStore.watchName("Galaxy Watch4"), "Galaxy Watch4")
        XCTAssertEqual(OnWatchStore.watchName("Garmin watch"), "Garmin watch")
        // What's kept reads back as it was written.
        XCTAssertEqual(try jsonDecoder.decode(OnWatchSaved.self, from: jsonEncoder.encode(saved)), saved)
    }

    // Decision 4c: linking the paired Apple Watch from the phone.

    func testAnAppleWatchMessageIsTheGarminsJSONUnderLawFiveAndAnOfferSaysWhenItLapses() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let offer: JSONValue = .object(["lawfive": .int(1), "kind": .string("offer"), "id": .int(7), "server": .string("https://lawfive.example"), "account": .string("Sam Rivera")])
        let wrapped = AppleWatchLink.wrap(offer, now: now)
        XCTAssertEqual(Array(wrapped.keys), ["lawfive"])
        let inside = try JSONValue(text: XCTUnwrap(wrapped["lawfive"] as? String))
        XCTAssertEqual(inside["kind"]?.string, "offer")
        XCTAssertEqual(inside["server"]?.string, "https://lawfive.example")
        XCTAssertEqual(inside["until"]?.double, 1_800_000_060)
        let link: JSONValue = .object(["lawfive": .int(1), "kind": .string("link"), "id": .int(7), "server": .string("https://lawfive.example"), "token": .string("t")])
        XCTAssertNil(try JSONValue(text: XCTUnwrap(AppleWatchLink.wrap(link, now: now)["lawfive"] as? String))["until"], "only an offer lapses")
        // The watch's answer, as PhoneLink.swift sends it.
        let answer = AppleWatchLink.unwrap(["lawfive": #"{"lawfive":1,"kind":"accept","id":7,"device":"applewatch; model=Watch7,3; os=11.0; app=dev"}"#])
        XCTAssertEqual(answer?["kind"]?.string, "accept")
        XCTAssertEqual(answer?["id"]?.intValue, 7)
        XCTAssertNil(AppleWatchLink.unwrap(["other": "x"]))
        XCTAssertNil(AppleWatchLink.unwrap(["lawfive": #"{"kind":"accept"}"#]), "not LawFive's without its mark")
    }

    func testTheLinkerOffersAndFollowsTheWatchsAnswers() async throws {
        let token = Keychain.read()
        defer { Keychain.write(token) }
        let suite = "ChoicesTests"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defaults.set(true, forKey: "installed")
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = SessionStore(defaults: defaults)
        // Nothing listens here, so asking for the watch's token fails at once.
        session.setServer("http://127.0.0.1:9")
        var sent: [JSONValue] = []
        let watch = AppleWatchLink.watchId
        let linker = WatchLinker(api: Api(session: session), clientId: "lawfive-applewatch", account: { ("http://127.0.0.1:9/", "Sam Rivera") }, send: { _, m in sent.append(m) }, open: { _ in })
        linker.offer(watch)
        XCTAssertEqual(linker.state?.step, .offering)
        for _ in 0..<20 where sent.isEmpty { try await Task.sleep(for: .milliseconds(50)) }
        let offer = try XCTUnwrap(sent.first)
        XCTAssertEqual(offer["lawfive"]?.intValue, 1)
        XCTAssertEqual(offer["kind"]?.string, "offer")
        XCTAssertEqual(offer["server"]?.string, "http://127.0.0.1:9", "without the trailing slash")
        XCTAssertEqual(offer["account"]?.string, "Sam Rivera")
        let id = try XCTUnwrap(offer["id"]?.intValue)

        // Another offer's answer, or another watch's, changes nothing.
        XCTAssertTrue(linker.onMessage(watch: watch, body: .object(["lawfive": .int(1), "kind": .string("decline"), "id": .int(id - 1)])))
        XCTAssertEqual(linker.state?.step, .offering)
        XCTAssertTrue(linker.onMessage(watch: UUID(), body: .object(["lawfive": .int(1), "kind": .string("decline"), "id": .int(id)])))
        XCTAssertEqual(linker.state?.step, .offering)
        XCTAssertFalse(linker.onMessage(watch: watch, body: .object(["lawfive": .int(1), "kind": .string("request"), "id": .int(id)])), "not one of the answers")
        XCTAssertTrue(linker.onMessage(watch: watch, body: .object(["lawfive": .int(1), "kind": .string("decline"), "id": .int(id)])))
        XCTAssertEqual(linker.state?.step, .declined)

        // Yes, but the server can't be reached: the watch is told, and the phone says why.
        linker.offer(watch)
        for _ in 0..<20 where sent.count < 2 || sent.last?["kind"]?.string != "offer" { try await Task.sleep(for: .milliseconds(50)) }
        let second = try XCTUnwrap(sent.last?["id"]?.intValue)
        XCTAssertNotEqual(second, id, "each offer has its own number")
        _ = linker.onMessage(watch: watch, body: .object(["lawfive": .int(1), "kind": .string("accept"), "id": .int(second), "device": .string("applewatch; model=Watch7,3; os=11.0; app=dev")]))
        XCTAssertEqual(linker.state?.step, .linking)
        for _ in 0..<100 where linker.state?.step == .linking { try await Task.sleep(for: .milliseconds(50)) }
        XCTAssertEqual(linker.state?.step, .failed)
        XCTAssertEqual(sent.last?["kind"]?.string, "failed")
        XCTAssertEqual(sent.last?["id"]?.intValue, second)
        linker.dismiss()
        XCTAssertNil(linker.state)
    }
}
