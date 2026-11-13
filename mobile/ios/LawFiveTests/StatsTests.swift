import XCTest
@testable import LawFive

// STAT-13: the phone's Stats filters and figures, as the website and Android work them out.
final class StatsTests: XCTestCase {
    func testFiltersBecomeTheQuery() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let today = calendar.date(from: DateComponents(year: 2026, month: 11, day: 2, hour: 12))!
        XCTAssertEqual(statsQuery(time: "all", role: nil, today: today, calendar: calendar), "")
        XCTAssertEqual(statsQuery(time: "12m", role: nil, today: today, calendar: calendar), "from=2025-11-03")
        XCTAssertEqual(statsQuery(time: "2025", role: "assistant", today: today, calendar: calendar), "from=2025-01-01&to=2025-12-31&role=assistant")
    }

    func testShares() {
        XCTAssertEqual(percent(1, 3), "33%")
        XCTAssertEqual(percent(0, 0), "0%")
    }

    func testTemperatureBands() {
        XCTAssertEqual(temperatureBands([16, 18, 28], fahrenheit: true).map { [$0.0, $0.1] }, [[60, 2], [70, 0], [80, 1]])
        XCTAssertEqual(temperatureBands([-0.5, 3], fahrenheit: false).map { [$0.0, $0.1] }, [[-5, 1], [0, 1]])
    }
}
