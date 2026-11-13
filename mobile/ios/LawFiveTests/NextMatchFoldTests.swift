import XCTest
@testable import LawFive

// WEB-27: the next match folds to a strip, kept with the account's settings; open when not set.
final class NextMatchFoldTests: XCTestCase {
    private let settings = UserSettings(id: "s1", version: 3, updatedAt: "2026-11-08T00:00:00Z", misconductScheme: "ifab", currency: "USD", distanceUnit: "mi", temperatureUnit: "f")

    func testOpenUntilChosen() {
        XCTAssertFalse(nextMatchFolded(nil))
        XCTAssertFalse(nextMatchFolded(settings))
        var folded = settings
        folded.nextMatchCollapsed = true
        XCTAssertTrue(nextMatchFolded(folded))
        folded.nextMatchCollapsed = false
        XCTAssertFalse(nextMatchFolded(folded))
    }

    func testSavedWithTheOtherSettings() throws {
        // Saved as Settings saves: the choice over the stored record, keeping what this app doesn't know.
        let raw = try JSONValue(text: #"{"id":"s1","version":3,"updatedAt":"2026-11-08T00:00:00Z","misconductScheme":"ifab","currency":"USD","distanceUnit":"mi","temperatureUnit":"f","futureField":"kept"}"#)
        var changed: UserSettings = try raw.decoded()
        changed.nextMatchCollapsed = true
        let saved = try Records.patched(raw, changed)
        XCTAssertEqual(saved["nextMatchCollapsed"], .bool(true))
        XCTAssertEqual(saved["futureField"], .string("kept"))
        XCTAssertEqual(saved["distanceUnit"], .string("mi"))
        XCTAssertTrue(nextMatchFolded(try saved.decoded()))
    }

    func testTheStripsCountdownAsTheWebsites() {
        func strip(_ seconds: Int) -> [String] { stripCountdown(seconds).map { "\($0.0)\($0.1)" } }
        XCTAssertEqual(strip(86_400 + 23 * 3600 + 8 * 60), ["1D", "23H", "08M"])
        XCTAssertEqual(strip(3 * 3600 + 5 * 60 + 30), ["3H", "05M"])
        XCTAssertEqual(strip(2 * 86_400 + 7 * 60), ["2D", "00H", "07M"])
        XCTAssertEqual(strip(45 * 60), ["45M"])
        XCTAssertEqual(strip(59), [])
        XCTAssertEqual(strip(0), [])
    }

    func testTheCountdownSpoken() {
        XCTAssertEqual(kickoffSpoken(86_400 + 23 * 3600 + 8 * 60), "Kickoff in 1 day 23 hrs 8 min")
        XCTAssertEqual(kickoffSpoken(2 * 86_400 + 3600), "Kickoff in 2 days 1 hr 0 min")
        XCTAssertEqual(kickoffSpoken(0), "Kickoff in 0 min")
    }
}
