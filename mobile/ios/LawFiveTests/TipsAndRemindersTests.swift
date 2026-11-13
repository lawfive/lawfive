import XCTest
@testable import LawFive

final class TipsAndRemindersTests: XCTestCase {
    /// A random that gives these numbers in turn.
    private func rolls(_ numbers: Double...) -> () -> Double {
        var left = numbers
        return { left.removeFirst() }
    }

    func testATipComesUpOnlyWithinItsChance() {
        XCTAssertNil(chooseTip(done: [], played: 5, random: rolls(tipChance)))
        XCTAssertNotNil(chooseTip(done: [], played: 5, random: rolls(tipChance - 0.01, 0)))
    }

    func testDismissedTipsStayAway() {
        let done = Set(tips.map(\.id))
        XCTAssertNil(chooseTip(done: done, played: 5, random: rolls(0)))
    }

    func testSomeTipsWaitForAMatchPlayed() {
        for i in 0..<20 {
            let tip = chooseTip(done: [], played: 0, random: rolls(0, Double(i) / 20))
            XCTAssertEqual(tip?.afterPlaying, false)
        }
    }

    private func match(_ kickoff: Date, status: String = "scheduled") -> Match {
        Match(id: newId(), version: 1, updatedAt: nowString(), status: status, kickoff: isoString(kickoff, zone: .current), format: defaultFormat, home: Team(name: "A"), away: Team(name: "B"), crew: [])
    }

    func testRemindersGoSoonestFirstAndOnlyForAFortnightsScheduledMatches() {
        let now = Date()
        let soon = match(now.addingTimeInterval(3 * 3600))
        let later = match(now.addingTimeInterval(5 * 86_400))
        let tooFar = match(now.addingTimeInterval(20 * 86_400))
        let played = match(now.addingTimeInterval(3 * 3600), status: "played")
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [60, 30]), matches: [later, tooFar, played, soon], venues: [], now: now)
        XCTAssertEqual(plan.count, 4)
        XCTAssertEqual(plan.map(\.at), plan.map(\.at).sorted())
        XCTAssertTrue(plan[0].body.contains("in 60 min"), plan[0].body)
        XCTAssertEqual(plan[0].title, "A v B")
    }

    func testAReminderAlreadyPastIsLeftOut() {
        let now = Date()
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [60, 15]), matches: [match(now.addingTimeInterval(30 * 60))], venues: [], now: now)
        XCTAssertEqual(plan.count, 1)
    }
}

// APP-6: the day before and the day of, one notification for the matches it's about, as Android's
// ReminderPlanTest. Friday noon in Los Angeles.
final class ReminderPlanTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-11-13T20:00:00Z")!
    private let la = TimeZone(identifier: "America/Los_Angeles")!

    private func at(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    private func match(_ id: String, _ home: String, _ away: String, _ kickoff: String, status: String = "scheduled", zone: String = "America/Los_Angeles", venue: String? = "park") -> Match {
        Match(id: id, version: 1, updatedAt: "2026-11-09T00:00:00Z", status: status, kickoff: kickoff, timeZone: zone, format: defaultFormat,
              home: Team(name: home), away: Team(name: away), venueId: venue, crew: [])
    }

    private let venues = [Venue(id: "park", version: 1, updatedAt: "2026-11-09T00:00:00Z", name: "Central Park", position: Position(lat: 33.6, lon: -117.6), pitches: [])]
    // Saturday 9:00 AM and 12:30 PM in Los Angeles.
    private lazy var early = match("m1", "Strikers", "Rovers", "2026-11-14T17:00:00Z")
    private lazy var late = match("m2", "Lions", "Tigers", "2026-11-14T20:30:00Z", venue: nil)
    private let days = ReminderTimes(minutesBefore: [], dayBefore: "19:00", dayOf: "08:00")

    func testTheDayBeforeAndTheDayOfComeOnceForTheDaysMatches() {
        let plan = Reminders.plan(days, matches: [late, early], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.at), [at("2026-11-14T03:00:00Z"), at("2026-11-14T16:00:00Z")])
        XCTAssertEqual(plan.map(\.title), ["2 matches tomorrow", "2 matches today"])
        let nine = formatTime(at("2026-11-14T17:00:00Z"), zone: la), half = formatTime(at("2026-11-14T20:30:00Z"), zone: la)
        XCTAssertEqual(plan[0].body, "STR v ROV · \(nine) · Central Park\nLIO v TIG · \(half)")
        XCTAssertEqual(plan[0].match, "m1")
        XCTAssertEqual(plan[0].lat, 33.6, "Directions go to the first match's place")
    }

    func testOneMatchReadsAsItsOwnReminder() {
        let plan = Reminders.plan(days, matches: [early], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.title), ["Strikers v Rovers", "Strikers v Rovers"])
        XCTAssertEqual(plan[0].body, "\(formatTime(at("2026-11-14T17:00:00Z"), zone: la)) in 14 hours · Central Park")
    }

    func testTheDayOfListsOnlyTheMatchesKickingOffAfterIt() {
        let dawn = match("m3", "Owls", "Hawks", "2026-11-14T15:30:00Z")
        let plan = Reminders.plan(days, matches: [early, dawn, late], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.title), ["3 matches tomorrow", "2 matches today"])
        XCTAssertEqual(plan[1].match, "m1")
    }

    func testBeforeKickoffStaysOnePerMatch() {
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [60, 30]), matches: [early, late], venues: venues, now: now)
        XCTAssertEqual(plan.count, 4)
        XCTAssertEqual(Set(plan.map(\.title)), ["Strikers v Rovers", "Lions v Tigers"])
    }

    func testEachMatchsOwnTimeZoneGroupedByTheMomentItLands() {
        let east = match("m4", "Bees", "Wasps", "2026-11-14T14:00:00Z", zone: "America/New_York")
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [], dayBefore: "19:00"), matches: [early, east, late], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.at), [at("2026-11-14T00:00:00Z"), at("2026-11-14T03:00:00Z")])
        XCTAssertEqual(plan.map(\.title), ["Bees v Wasps", "2 matches tomorrow"])
    }

    func testCanceledPostponedAndPastRemindersStayOut() {
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [120, 30], dayBefore: "19:00", dayOf: "08:00"), matches: [
            match("m5", "A", "B", "2026-11-14T18:00:00Z", status: "cancelled"),
            match("m6", "C", "D", "2026-11-14T18:00:00Z", status: "postponed"),
            match("m8", "G", "H", "2026-11-13T21:00:00Z"),
        ], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.at), [at("2026-11-13T20:30:00Z")])
    }

    func testADaysOneLeavesOutAMatchRemindedBeforeKickoffThen() {
        let plan = Reminders.plan(ReminderTimes(minutesBefore: [60], dayOf: "08:00"), matches: [early, late], venues: venues, now: now)
        XCTAssertEqual(plan.map(\.match), ["m1", "m2", "m2"])
        XCTAssertEqual(plan.map(\.at), [at("2026-11-14T16:00:00Z"), at("2026-11-14T16:00:00Z"), at("2026-11-14T19:30:00Z")])
    }

    func testGroupingKeepsMoreWithinTheSixty() {
        // Ten matches on each of six Saturdays: a day's two reminders each, not twenty.
        let saturdays = (0..<6).flatMap { week in (0..<10).map { i in
            match("w\(week)-\(i)", "Home \(i)", "Away \(i)", ISO8601DateFormatter().string(from: at("2026-11-14T16:00:00Z").addingTimeInterval(Double(week) * 7 * 86_400 + Double(i) * 3600)))
        } }
        let plan = Reminders.plan(days, matches: saturdays, venues: venues, now: now)
        XCTAssertEqual(plan.count, 4, "the fortnight's two Saturdays, each with its evening before and its morning")
    }
}

// CAL-3: the phones' times are the account's, as the calendar feed's (as Android's ReminderTimesTest).
final class ReminderTimesTests: XCTestCase {
    private func settings(min: Int? = nil, reminders: [Int]? = nil, before: String? = nil, of: String? = nil) -> UserSettings {
        var s = SettingsDefaults.settings(for: Locale(identifier: "en_US"), id: "s")
        s.calendarReminderMin = min
        s.calendarReminders = reminders
        s.calendarDayBefore = before
        s.calendarDayOf = of
        return s
    }

    func testAnHourBeforeWhenNothingIsChosen() {
        XCTAssertEqual(ReminderTimes(nil), ReminderTimes(minutesBefore: [60]))
        XCTAssertEqual(ReminderTimes(settings()), ReminderTimes(minutesBefore: [60]))
    }

    func testAnAccountsOneReminderFromBefore() {
        XCTAssertEqual(ReminderTimes(settings(min: 30)), ReminderTimes(minutesBefore: [30]))
        XCTAssertEqual(ReminderTimes(settings(min: 0)), ReminderTimes(minutesBefore: []))
        XCTAssertEqual(ReminderTimes(settings(min: 1440)), ReminderTimes(minutesBefore: [], dayBefore: "19:00"))
        XCTAssertEqual(ReminderTimes(settings(min: 30, of: "08:00")), ReminderTimes(minutesBefore: [], dayOf: "08:00"))
        XCTAssertEqual(ReminderTimes(settings(reminders: [90, 15], before: "19:30")), ReminderTimes(minutesBefore: [90, 15], dayBefore: "19:30"))
    }

    func testSavedAsTheWebsiteSavesThemAllThree() {
        var s = settings(min: 30, before: "19:00")
        ReminderTimes(minutesBefore: [15, 90, 15], dayBefore: nil, dayOf: "07:30").into(&s)
        XCTAssertEqual(s.calendarReminders, [90, 15])
        XCTAssertNil(s.calendarDayBefore)
        XCTAssertEqual(s.calendarDayOf, "07:30")
    }

    func testThePhonesOwnTimesGoUpOnceOnlyToAnAccountWithoutAny() {
        let phone = ReminderTimes(minutesBefore: [45], dayBefore: "20:00")
        XCTAssertEqual(ReminderTimes.toUpload(phone: phone, enabled: true, account: settings()), phone)
        XCTAssertEqual(ReminderTimes.toUpload(phone: phone, enabled: false, account: nil), phone)
        XCTAssertEqual(ReminderTimes.toUpload(phone: phone, enabled: true, account: settings(min: 30)), phone)
        XCTAssertNil(ReminderTimes.toUpload(phone: phone, enabled: true, account: settings(reminders: [60])))
        XCTAssertNil(ReminderTimes.toUpload(phone: phone, enabled: true, account: settings(of: "08:00")))
        XCTAssertNil(ReminderTimes.toUpload(phone: nil, enabled: true, account: settings()))
        XCTAssertNil(ReminderTimes.toUpload(phone: ReminderTimes(), enabled: false, account: settings(min: 30)))
    }
}

// APP-22: searching a long list of referees or venues, and when "New..." is offered, as Android's cases.
final class SearchChoiceTests: XCTestCase {
    private let people = [
        SearchOption(id: "1", name: "84-Henderson, Melissa (REG)"),
        SearchOption(id: "2", name: "José Ruiz", otherNames: ["Pepe"]),
        SearchOption(id: "3", name: "630-Foster, Brady"),
    ]

    func testNothingTypedShowsEveryone() { XCTAssertEqual(searchOptions(people, typed: "  ").count, 3) }

    func testFindsPartOfANameAnyCase() { XCTAssertEqual(searchOptions(people, typed: "hender").map(\.id), ["1"]) }

    func testIgnoresAccents() {
        XCTAssertEqual(foldName("  JOSÉ "), "jose")
        XCTAssertEqual(searchOptions(people, typed: "jose").map(\.id), ["2"])
    }

    func testFindsAnotherName() { XCTAssertEqual(searchOptions(people, typed: "pepe").map(\.id), ["2"]) }

    func testOffersNewOnlyForANewName() {
        XCTAssertTrue(canCreate(people, typed: "Sam Rivera"))
        XCTAssertTrue(canCreate(people, typed: "Henderson"))
        XCTAssertFalse(canCreate(people, typed: "  "))
        XCTAssertFalse(canCreate(people, typed: "josé ruiz"))
        XCTAssertFalse(canCreate(people, typed: "PEPE"))
    }
}
