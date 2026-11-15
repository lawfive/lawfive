import UserNotifications
import XCTest
@testable import LawFive

// PUSH-4, NOTE-5: when the phone asks the relay for a new handle, and when it tells the server what it
// wants. The cases are Android's PushTest; the iPhone also says whether it wants weather risks, as it
// can't drop one it's sent (PUSH-5).
final class PushTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-11-01T12:00:00Z")!
    private func daysAgo(_ n: Double) -> Date { now.addingTimeInterval(-n * 86_400) }

    func testNothingNewNoNeed() {
        XCTAssertFalse(needsRegistering(token: "t", server: "https://a.example", registeredToken: "t", registeredServer: "https://a.example", registeredAt: daysAgo(29), now: now))
    }

    func testANewTokenRegisters() {
        XCTAssertTrue(needsRegistering(token: "new", server: "https://a.example", registeredToken: "t", registeredServer: "https://a.example", registeredAt: now, now: now))
    }

    func testAnotherServerRegisters() {
        XCTAssertTrue(needsRegistering(token: "t", server: "https://b.example", registeredToken: "t", registeredServer: "https://a.example", registeredAt: now, now: now))
    }

    func testAnOldHandleIsRenewedLongBeforeItExpires() {
        XCTAssertTrue(needsRegistering(token: "t", server: "https://a.example", registeredToken: "t", registeredServer: "https://a.example", registeredAt: daysAgo(31), now: now))
    }

    func testNeverRegisteredRegisters() {
        XCTAssertTrue(needsRegistering(token: "t", server: "https://a.example", registeredToken: nil, registeredServer: nil, registeredAt: nil, now: now))
    }

    private let both = PushWants(notices: true, risks: true)
    private let risksOnly = PushWants(notices: false, risks: true)

    // NOTE-5: the server is told again when matches from integrations are turned on or off.
    func testIntegrationsSwitchedTellsTheServerWithTheSameHandle() {
        XCTAssertEqual(pushStep(needsRegistering: false, handle: "v1.h", wants: both, told: risksOnly), .tell)
        XCTAssertEqual(pushStep(needsRegistering: false, handle: "v1.h", wants: risksOnly, told: both), .tell)
    }

    // PUSH-5: and when weather risks are.
    func testWeatherRisksSwitchedTellsTheServerToo() {
        XCTAssertEqual(pushStep(needsRegistering: false, handle: "v1.h", wants: PushWants(notices: true, risks: false), told: both), .tell)
    }

    func testNothingChangedTellsNothing() {
        XCTAssertEqual(pushStep(needsRegistering: false, handle: "v1.h", wants: both, told: both), .nothing)
    }

    func testNoHandleKeptRegistersAgain() {
        XCTAssertEqual(pushStep(needsRegistering: false, handle: nil, wants: risksOnly, told: nil), .register)
    }

    func testANewTokenStillRegisters() {
        XCTAssertEqual(pushStep(needsRegistering: true, handle: "v1.h", wants: both, told: both), .register)
    }

    /// What an app from before the switches kept still reads, with both off.
    func testOlderSettingsStillRead() throws {
        let old = try jsonDecoder.decode(ReminderSettings.self, from: Data(#"{"enabled":true}"#.utf8))
        XCTAssertEqual(old, ReminderSettings(enabled: true))
        let both = ReminderSettings(enabled: false, weatherRisks: true, integrations: true)
        XCTAssertEqual(try jsonDecoder.decode(ReminderSettings.self, from: jsonEncoder.encode(both)), both)
    }
}

// PUSH-5: what a weather risk's notification says. Friday 6:00 PM in Los Angeles, the evening before
// Saturday's match, as Android's PushTextTest.
final class PushTextTests: XCTestCase {
    private let la = TimeZone(identifier: "America/Los_Angeles")!

    override func setUp() {
        AppClock.fixed = ISO8601DateFormatter().date(from: "2026-11-14T02:00:00Z")
    }

    override func tearDown() {
        AppClock.fixed = nil
    }

    private func weather(_ risks: WeatherRisk...) -> MatchWeather {
        MatchWeather(matchId: "m1", final: false, condition: "cloudy", isDay: true, temperatureC: 20, feelsLikeC: 20, precipitationMm: 0,
                     precipitationBeforeMm: 0, hours: [], risks: risks, updatedAt: "2026-11-14T01:00:00Z", source: "Open-Meteo")
    }

    private let storms = WeatherRisk(kind: "storm", level: "likely")
    private let rain = WeatherRisk(kind: "rain", level: "possible")
    private func at(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    func testARiskSaysWhichDay() throws {
        guard !uses24Hours() else { throw XCTSkip("The cases are on a 12-hour clock") }
        XCTAssertEqual(riskText(weather(storms), kickoff: at("2026-11-14T17:00:00Z"), zone: la), "Storms likely · tomorrow, 9:00 AM")
        XCTAssertEqual(riskText(weather(rain, storms), kickoff: at("2026-11-16T17:00:00Z"), zone: la), "Storms likely, Rain possible · Mon, Nov 16, 9:00 AM")
        XCTAssertEqual(riskText(weather(storms), kickoff: at("2026-11-14T05:00:00Z"), zone: la), "Storms likely · today, 9:00 PM")
    }
}

// NOTE-3: a notice of what an integration did, in words; one match says what happened to it, several
// say how many with a line each. Android's NoticesTest's cases.
final class NoticeWordsTests: XCTestCase {
    private let time: KickoffFormat = { iso, _ in ["2026-11-07T17:00:00Z": "Sat, Nov 7, 9:00 AM", "2026-11-07T19:30:00Z": "Sat, Nov 7, 11:30 AM"][iso] }

    private func item(_ changes: String..., kickoff: String? = "2026-11-07T17:00:00Z", previousKickoff: String? = nil, venue: String? = "Twin Creeks, Field 3",
                      previousVenue: String? = nil, title: String = "Strikers v Rovers") -> MatchNoticeMatchesItem {
        MatchNoticeMatchesItem(matchId: "m-\(title)", changes: changes, title: title, kickoff: kickoff, previousKickoff: previousKickoff, venue: venue, previousVenue: previousVenue)
    }

    private func notice(_ items: MatchNoticeMatchesItem...) -> MatchNotice {
        MatchNotice(id: "n1", source: "RefSync", createdAt: "2026-11-02T12:00:00Z", matches: items)
    }

    func testOneMatchSaysWhatHappenedWhenAndWhere() throws {
        let added = try XCTUnwrap(noticeWords(notice(item("added")), time: time))
        XCTAssertEqual(added.title, "New match: Strikers v Rovers")
        XCTAssertEqual(added.text, "Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3")
        XCTAssertEqual(added.matchId, "m-Strikers v Rovers")
        XCTAssertEqual(noticeWords(notice(item("canceled")), time: time)?.title, "Canceled: Strikers v Rovers")
        XCTAssertEqual(noticeWords(notice(item("postponed")), time: time)?.text, "Was Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3")
        XCTAssertEqual(noticeWords(notice(item("backOn", "kickoff")), time: time)?.title, "Back on: Strikers v Rovers")
    }

    func testAMoveSaysWhatItIsNowAndWasWithDirectionsForANewVenue() throws {
        let moved = try XCTUnwrap(noticeWords(notice(item("kickoff", kickoff: "2026-11-07T19:30:00Z", previousKickoff: "2026-11-07T17:00:00Z")), time: time))
        XCTAssertEqual(moved.title, "Kickoff moved: Strikers v Rovers")
        XCTAssertEqual(moved.text, "Now Sat, Nov 7, 11:30 AM · was Sat, Nov 7, 9:00 AM · Twin Creeks, Field 3")
        XCTAssertFalse(moved.directions)
        let elsewhere = try XCTUnwrap(noticeWords(notice(item("venue", venue: "Ortega Park", previousVenue: "Twin Creeks")), time: time))
        XCTAssertEqual(elsewhere.title, "Venue changed: Strikers v Rovers")
        XCTAssertEqual(elsewhere.text, "Now at Ortega Park · was Twin Creeks · Sat, Nov 7, 9:00 AM")
        XCTAssertTrue(elsewhere.directions)
        let both = try XCTUnwrap(noticeWords(notice(item("kickoff", "venue", kickoff: "2026-11-07T19:30:00Z", previousKickoff: "2026-11-07T17:00:00Z",
                                                        venue: "Ortega Park", previousVenue: "Twin Creeks")), time: time))
        XCTAssertEqual(both.title, "Kickoff and venue changed: Strikers v Rovers")
        XCTAssertEqual(both.text, "Now Sat, Nov 7, 11:30 AM at Ortega Park · was Sat, Nov 7, 9:00 AM at Twin Creeks")
    }

    func testARemovedMatchOpensTheListAsItsGone() throws {
        let removed = try XCTUnwrap(noticeWords(notice(item("removed")), time: time))
        XCTAssertEqual(removed.title, "Removed: Strikers v Rovers")
        XCTAssertNil(removed.matchId)
        XCTAssertFalse(removed.directions)
    }

    func testSeveralSayHowManyWithALineEachAndOpenTheList() throws {
        let added = try XCTUnwrap(noticeWords(notice(item("added"), item("added", title: "Cobras v Rovers"), item("added", title: "Thunder v Galaxy")), time: time))
        XCTAssertEqual(added.title, "RefSync added 3 matches")
        XCTAssertEqual(added.text, "Strikers v Rovers, Sat, Nov 7, 9:00 AM, and 2 more")
        XCTAssertEqual(added.lines, ["Strikers v Rovers, Sat, Nov 7, 9:00 AM", "Cobras v Rovers, Sat, Nov 7, 9:00 AM", "Thunder v Galaxy, Sat, Nov 7, 9:00 AM"])
        XCTAssertNil(added.matchId)
        let mixed = try XCTUnwrap(noticeWords(notice(item("canceled"), item("added", title: "Cobras v Rovers")), time: time))
        XCTAssertEqual(mixed.title, "RefSync changed 2 matches")
        XCTAssertEqual(mixed.lines.first, "Canceled: Strikers v Rovers, Sat, Nov 7, 9:00 AM")
        XCTAssertNil(noticeWords(notice(), time: time))
    }

    /// APP-6: the matches whose own reminders go at once: off, gone or moved, not added or moved elsewhere at the same time.
    func testRemindersGoForMatchesOffOrMoved() {
        let n = notice(item("canceled", title: "A v B"), item("kickoff", title: "C v D"), item("added", title: "E v F"), item("venue", title: "G v H"), item("removed", title: "I v J"))
        XCTAssertEqual(remindersGone(n), ["m-A v B", "m-C v D", "m-I v J"])
    }

    /// The kickoff as a notice says it, in the match's own time zone.
    func testAKickoffIsInTheMatchsTimeZone() throws {
        guard !uses24Hours() else { throw XCTSkip("The case is on a 12-hour clock") }
        AppClock.fixed = ISO8601DateFormatter().date(from: "2026-11-02T12:00:00Z")
        defer { AppClock.fixed = nil }
        XCTAssertEqual(noticeKickoff("2026-11-07T17:00:00Z", "America/Los_Angeles"), "Sat, Nov 7, 9:00 AM")
        XCTAssertEqual(noticeKickoff("2026-11-07T17:00:00.000Z", "Europe/London"), "Sat, Nov 7, 5:00 PM")
    }
}

// PUSH-5, NOTE-3: a tapped notification from the server opens its match, or the match list.
@MainActor
final class NotificationTapTests: XCTestCase {
    func testTheTargetComesFromTheExtensionsWords() {
        XCTAssertEqual(NotificationRouter.target(["type": "weather-risk", "id": "m1", "match": "m1"]), "m1")
        XCTAssertEqual(NotificationRouter.target(["type": "match-changed", "id": "n1", "matches": true]), "")
        XCTAssertNil(NotificationRouter.target(["type": "test"]))
        // A reminder's (APP-6).
        XCTAssertEqual(NotificationRouter.target(["match": "m2"]), "m2")
    }
}
