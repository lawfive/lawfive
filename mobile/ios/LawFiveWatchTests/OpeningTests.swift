import XCTest
@testable import LawFiveWatch

// WCH-13: the app syncs on opening when it starts or comes back after five minutes away, never mid-match, and not
// with Sync on opening off.
final class OpeningTests: XCTestCase {
    func testStartingSyncs() {
        XCTAssertTrue(Opening.syncs(first: true, away: nil, syncOnOpening: true, matchInProgress: false))
    }

    func testAGlanceDoesNotSync() {
        XCTAssertFalse(Opening.syncs(first: false, away: 20, syncOnOpening: true, matchInProgress: false))
        XCTAssertFalse(Opening.syncs(first: false, away: 299, syncOnOpening: true, matchInProgress: false))
    }

    func testFiveMinutesAwaySyncs() {
        XCTAssertTrue(Opening.syncs(first: false, away: 300, syncOnOpening: true, matchInProgress: false))
        XCTAssertTrue(Opening.syncs(first: false, away: 3 * 3600, syncOnOpening: true, matchInProgress: false))
    }

    func testNeverMidMatch() {
        XCTAssertFalse(Opening.syncs(first: true, away: nil, syncOnOpening: true, matchInProgress: true))
        XCTAssertFalse(Opening.syncs(first: false, away: 3600, syncOnOpening: true, matchInProgress: true))
    }

    func testOffOnlySyncsWithSyncNow() {
        XCTAssertFalse(Opening.syncs(first: true, away: nil, syncOnOpening: false, matchInProgress: false))
        XCTAssertFalse(Opening.syncs(first: false, away: 3600, syncOnOpening: false, matchInProgress: false))
    }
}
