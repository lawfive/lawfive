import XCTest
@testable import LawFive

// DEMO-9: Try a match's address, with the same cases as the website's (schema/test/screen.test.ts);
// SYNC-15: the linked watch's words and the match screen in a line.
final class TryMatchTests: XCTestCase {
    private let oneClock = ScreenSetup(clocks: "one", mainClock: "up", secondClock: "down", breakClock: "down", edge: "none", names: true)

    func testTheAddressCarriesTheWatchAndTheMatchScreen() {
        XCTAssertEqual(TryMatch.url(watch: "wearos", screen: oneClock, teamSwipes: "sideways")?.absoluteString,
                       "https://lawfive.app/try?watch=wearos&clocks=one&mainClock=up&secondClock=down&breakClock=down&edge=none&names=true&teamSwipes=sideways")
        // Without team swipes, the page keeps its own.
        XCTAssertEqual(TryMatch.url(watch: "garmin", screen: ScreenSetup(nil))?.absoluteString,
                       "https://lawfive.app/try?watch=garmin&clocks=stacked&mainClock=down&secondClock=up&breakClock=down&edge=time&names=true")
    }

    func testTheSecondClockIsNeverTheMatchClock() {
        let url = TryMatch.url(watch: "apple", screen: ScreenSetup(clocks: "stacked", mainClock: "down", secondClock: "down", names: false), teamSwipes: "upDown")
        XCTAssertEqual(url?.absoluteString,
                       "https://lawfive.app/try?watch=apple&clocks=stacked&mainClock=down&secondClock=upEach&breakClock=down&edge=none&names=false&teamSwipes=upDown")
    }

    func testALinkedWatchIsShownAsItsKindAVenuAsTheVenu() {
        XCTAssertEqual(TryMatch.watch(for: "lawfive-applewatch"), "apple")
        XCTAssertEqual(TryMatch.watch(for: "applewatch"), "apple")
        XCTAssertEqual(TryMatch.watch(for: "wearos", name: "Galaxy Watch4"), "wearos")
        XCTAssertEqual(TryMatch.watch(for: "lawfive-wear", name: "Galaxy Watch4"), "wearos")
        XCTAssertEqual(TryMatch.watch(for: "lawfive-garmin", name: "Garmin Venu 2"), "venu")
        XCTAssertEqual(TryMatch.watch(for: "garmin", name: "Garmin Forerunner 965"), "garmin")
        XCTAssertEqual(TryMatch.watch(for: nil), "garmin")
    }

    func testTheLinkedWatchsWords() {
        let galaxy = LinkedWatch(name: "Galaxy Watch4", watch: "wearos")
        XCTAssertEqual(galaxy.heading, "Galaxy Watch4 is linked")
        XCTAssertEqual(galaxy.called, "Galaxy Watch4")
        XCTAssertTrue(galaxy.line.contains("syncs on its own"))
        XCTAssertEqual(LinkedWatch(name: nil, watch: "garmin").heading, "Your watch is linked")
        XCTAssertTrue(LinkedWatch(name: "Venu 2", watch: "venu").line.contains("through your phone"))
        XCTAssertEqual(LinkedWatch(name: nil, watch: "apple").heading, "Your Apple Watch is linked")
        XCTAssertEqual(LinkedWatch(name: nil, watch: "apple").called, "Apple Watch")
    }

    func testTheMatchScreenInALine() {
        XCTAssertEqual(screenLine(ScreenSetup(nil)), "Two clocks stacked, the time of day, names")
        XCTAssertEqual(screenLine(oneClock), "One clock, names")
        XCTAssertEqual(screenLine(ScreenSetup(clocks: "sideBySide", edge: "ring", names: false)), "Two clocks side by side, the ring, scores only")
    }
}
