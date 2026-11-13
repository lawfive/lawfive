import XCTest
@testable import LawFive

// APP-16, as Android's SyncActivityTest: the sync screen comes up for big syncs only, says what's
// moving, and gets out of the way.

@MainActor
final class SyncActivityTests: XCTestCase {
    private var now = Date(timeIntervalSince1970: 1_000_000)
    private func make() -> SyncActivity { SyncActivity { [unowned self] in self.now } }

    func testAnEverydaySyncStaysQuiet() {
        let a = make()
        a.syncStarted()
        a.pushing(done: 0, total: 2, name: "UTD v STR")
        a.pulled(counts: ["matches": 3], lastName: ["matches": "UTD v STR"], first: false)
        a.syncFinished(problem: nil)
        XCTAssertFalse(a.show)
    }

    func testTheFirstSyncShowsByKindOfRecordThenGoes() {
        let a = make()
        a.syncStarted()
        a.pulled(counts: ["matches": 2], lastName: ["matches": "UTD v STR"], first: true)
        a.pulled(counts: ["matches": 3, "venues": 1], lastName: [:], first: false)
        XCTAssertTrue(a.show)
        XCTAssertEqual(a.rows.first { $0.title == "Matches" }?.detail, "5")
        XCTAssertEqual(a.rows.first { $0.title == "Venues" }?.detail, "1")
        a.syncFinished(problem: nil)
        now += SyncActivity.quiet / 2
        a.tick()
        XCTAssertFalse(a.finished)
        now += SyncActivity.quiet
        a.tick()
        XCTAssertTrue(a.finished)
        XCTAssertTrue(a.rows.allSatisfy(\.done))
        now += SyncActivity.closeAfter
        a.tick()
        XCTAssertFalse(a.show)
        XCTAssertTrue(a.rows.isEmpty)
    }

    func testHidingCarriesOnOutOfSight() {
        let a = make()
        a.syncStarted()
        a.pulled(counts: ["matches": 30], lastName: [:], first: false)
        a.hide()
        a.pulled(counts: ["matches": 30], lastName: [:], first: false)
        XCTAssertFalse(a.show)
        XCTAssertEqual(a.rows.first?.detail, "60")
        a.syncFinished(problem: nil)
        now += SyncActivity.quiet
        a.tick()
        XCTAssertFalse(a.show)
        a.syncStarted()
        a.pulled(counts: ["venues": 25], lastName: [:], first: false)
        XCTAssertTrue(a.show, "the next one shows")
        XCTAssertEqual(a.rows.count, 1)
    }

    func testAProblemStaysUntilItsClosed() {
        let a = make()
        a.syncStarted()
        a.pulled(counts: ["matches": 2], lastName: [:], first: true)
        a.syncFinished(problem: "No connection to the server")
        XCTAssertEqual(a.problem, "No connection to the server")
        now += 100
        a.tick()
        XCTAssertTrue(a.show)
        a.close()
        XCTAssertNil(a.problem)
        XCTAssertFalse(a.show)
    }
}
