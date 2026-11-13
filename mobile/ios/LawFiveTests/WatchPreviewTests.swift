import XCTest
@testable import LawFive

// UI-27: what's particular to the setup's pictures (the clocks are checked by the shared screen cases,
// MatchCasesTests). UI-21, UI-24: setups saved before the choices.
final class WatchPreviewTests: XCTestCase {
    private func at(_ m: Int, _ s: Int = 0) -> Int64 { Int64(m * 60 + s) * 1000 }
    private func running(_ elapsedMs: Int64, period: Int = 0) -> MatchMoment { MatchMoment(period: period, elapsedMs: elapsedMs) }

    // What's particular to the pictures; the clocks themselves are checked by the shared screen cases (MatchCasesTests).
    func testBreakClockText() {
        XCTAssertEqual(WatchPreview.breakClockText("down", at(1, 30), at(2)), "1:30")
        XCTAssertEqual(WatchPreview.breakClockText("up", at(1, 30), at(2)), "0:30")
        XCTAssertEqual(WatchPreview.clockText("down", 0, at(47, 5)), "0:00")
    }

    func testPlayThrough() {
        XCTAssertEqual(WatchPreview.playAt(0).breakDueInMs, at(22, 30))
        XCTAssertTrue(WatchPreview.playAt(0.5).halftime)
        XCTAssertEqual(WatchPreview.playAt(1).period, 1)
        XCTAssertEqual(WatchPreview.playAt(1).stoppageMs, at(3, 30))
        XCTAssertEqual(WatchPreview.momentLabel(running(at(23, 12))), "1H 23:12")
        XCTAssertEqual(WatchPreview.momentLabel(running(at(46, 12), period: 1)), "2H 90:00 +1:12")
        XCTAssertEqual(WatchPreview.momentLabel(MatchMoment(halftime: true, elapsedMs: at(3))), "Half-time 3:00")
    }

    func testDefaultScreen() {
        XCTAssertEqual(ScreenSetup(nil), ScreenSetup(clocks: "stacked", mainClock: "down", secondClock: "up", breakClock: "down", edge: "time", names: true))
    }

    func testOldSetups() {
        let when = "2026-11-03T12:00:00Z"
        XCTAssertEqual(ScreenSetup(WatchScreen(layout: "ring", secondClock: "down", changedAt: when)), ScreenSetup(edge: "ring"))
        XCTAssertFalse(ScreenSetup(WatchScreen(layout: "minimal", secondClock: "down", changedAt: when)).names)
        XCTAssertEqual(ScreenSetup(WatchScreen(layout: "scoreboard", secondClock: "down", changedAt: when)), ScreenSetup())
        let saved = ScreenSetup(clocks: "sideBySide", mainClock: "down", secondClock: "down", edge: "ring").saved(at: when)
        XCTAssertEqual(saved.layout, "sideBySide")
        XCTAssertEqual(saved.secondClock, "upEach")
        XCTAssertEqual(ScreenSetup(edge: "ring", names: false).nearestLayout, "minimal")
    }
}
