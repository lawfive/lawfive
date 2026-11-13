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
        let plan = Reminders.plan(ReminderSettings(enabled: true, minutesBefore: [60, 30]), matches: [later, tooFar, played, soon], venues: [], now: now)
        XCTAssertEqual(plan.count, 4)
        XCTAssertEqual(plan.map(\.at), plan.map(\.at).sorted())
        XCTAssertTrue(plan[0].body.contains("in 60 min"), plan[0].body)
        XCTAssertEqual(plan[0].title, "A v B")
    }

    func testAReminderAlreadyPastIsLeftOut() {
        let now = Date()
        let plan = Reminders.plan(ReminderSettings(enabled: true, minutesBefore: [60, 15]), matches: [match(now.addingTimeInterval(30 * 60))], venues: [], now: now)
        XCTAssertEqual(plan.count, 1)
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
