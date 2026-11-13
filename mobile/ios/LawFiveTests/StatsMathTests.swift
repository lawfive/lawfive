import XCTest
@testable import LawFive

// WEB-24, STAT-3, STAT-15: the phone's Stats works out what the website's does (web/src/stats.ts, and
// the same cases as web/test/stats.test.ts and Android's StatsMathTest), and Your watches' states.
final class StatsMathTests: XCTestCase {
    func testSharesAddUpTo100() {
        XCTAssertEqual(shares([1, 1, 1]), [34, 33, 33])
        XCTAssertEqual(shares([31, 38, 20, 8, 3]), [31, 38, 20, 8, 3])
        XCTAssertEqual(shares([0, 0]), [0, 0])
        XCTAssertEqual(shares([7, 2, 2, 5]).reduce(0, +), 100)
        // The demo's speed bands: walking takes the rounding's spare point, as on the website.
        XCTAssertEqual(shares([7260, 587, 63, 18, 9]), [92, 7, 1, 0, 0])
    }

    func testRanksShareAPlaceOnATieAndTheNextSkips() {
        XCTAssertEqual(ranks([12, 9, 6, 6, 5]), [1, 2, 3, 3, 5])
        XCTAssertEqual(ranks([3, 3, 3]), [1, 1, 1])
        XCTAssertEqual(ranks([]), [])
    }

    func testThePitchsThirdsCountTheTimeBeyondTheLinesToTheThirdBesideIt() {
        let cols = 24
        let rows = 18
        var cells = Array(repeating: 0.0, count: cols * rows)
        // The far left column (beyond the goal line) and the bottom row (beyond the near touchline).
        cells[9 * cols] = 60
        cells[(rows - 1) * cols + 12] = 30
        cells[9 * cols + 12] = 10
        let t = pitchThirds(cells, cols: cols, rows: rows)
        XCTAssertEqual(t.length, [60, 40, 0])
        XCTAssertEqual(t.width, [0, 70, 30])
        // A third's shade: two thirds of the time is the palest of the six.
        XCTAssertEqual(thirdStep(67), 6)
        XCTAssertEqual(thirdStep(0), 1)
        XCTAssertEqual(thirdStep(26), 3)
    }

    func testTheRunningTotalRunsInMonthsOrYearsOverALongSpan() {
        let utc = TimeZone(identifier: "UTC")!
        let games = [
            RunGame(kickoff: "2026-08-20T17:00:00Z", distanceM: 8000, totalM: 8000),
            RunGame(kickoff: "2026-08-27T17:00:00Z", distanceM: 7000, totalM: 15000),
            RunGame(kickoff: "2026-09-03T17:00:00Z", distanceM: 9000, totalM: 24000),
        ]
        let months = runningStretches(games, zone: utc)
        XCTAssertEqual(months.count, 2)
        XCTAssertEqual(months.map(\.addedM), [15000, 9000])
        XCTAssertEqual(months.map(\.totalM), [15000, 24000])
        XCTAssertEqual(months.map(\.games), [2, 1])
        XCTAssertEqual(months[0].sub, "2026")
        XCTAssertNil(months[1].sub)
        XCTAssertEqual(months[1].lastKickoff, "2026-09-03T17:00:00Z")
        let years = runningStretches(games + [RunGame(kickoff: "2027-12-01T17:00:00Z", distanceM: 1000, totalM: 25000)], zone: utc, maxMonths: 3)
        XCTAssertEqual(years.map(\.label), ["2026", "2027"])
    }

    func testAxisTicksEndCloseAboveTheTop() {
        XCTAssertEqual(axisTicks(226), [0, 50, 100, 150, 200, 250])
        XCTAssertEqual(axisTicks(312.5), [0, 100, 200, 300, 400])
        XCTAssertEqual(axisTicks(11.4), [0, 2.5, 5, 7.5, 10, 12.5])
        XCTAssertEqual(axisTicks(0), [0, 1])
    }

    func testLabelsAlongALineKeepTheirDistanceTheLastAlwaysShown() {
        XCTAssertEqual(spacedLabels([10, 40, 120, 130], gap: 50), [true, false, false, true])
        XCTAssertEqual(spacedLabels([0, 100, 200], gap: 50), [true, true, true])
    }

    func testBusiestTimesSpanTheHoursWithGamesLitByShareOfTheBusiest() {
        let grid = busiestGrid([(day: 5, hour: 9, games: 6), (day: 6, hour: 11, games: 1)])
        XCTAssertEqual(grid.hours, [9, 10, 11])
        XCTAssertEqual(grid.at(5, 9), 6)
        XCTAssertEqual(grid.at(0, 10), 0)
        XCTAssertEqual(lightStep(6, 6), 6)
        XCTAssertEqual(lightStep(1, 6), 1)
        XCTAssertEqual(lightStep(0, 6), 0)
        XCTAssertTrue(busiestGrid([]).hours.isEmpty)
    }

    func testAWatchsRingIsTheBatteryAnHourOnA30PercentScaleAndFullPastIt() {
        XCTAssertEqual(ringShare(15), 0.5)
        XCTAssertEqual(ringShare(45), 1)
        XCTAssertEqual(ringShare(nil), 0)
        XCTAssertEqual(percentFigure(8.64), "8.6%")
        XCTAssertEqual(percentFigure(17.4), "17%")
        XCTAssertEqual(percentFigure(9.96), "10%")
        XCTAssertEqual(percentFigure(3), "3%")
    }

    func testRatesAreWrittenAsTheWebsites() {
        XCTAssertEqual(rate(5, 13), "0.38")
        XCTAssertEqual(rate(2, 13), "0.15")
        XCTAssertEqual(rate(4, 5), "0.8")
        XCTAssertEqual(rate(26, 13), "2.0")
        XCTAssertEqual(rate(0, 13), "0.0")
        XCTAssertEqual(rate(3, 0), "0.0")
        XCTAssertEqual(figureAndUnit("27.0 mi").figure, "27.0")
        XCTAssertEqual(figureAndUnit("27.0 mi").unit, "mi")
        XCTAssertEqual(figureAndUnit("34 mph gusts").unit, "mph gusts")
        XCTAssertEqual(figureAndUnit("64°F").unit, "°F")
        XCTAssertEqual(figureAndUnit("—").figure, "—")
        XCTAssertEqual(figureAndUnit("—").unit, "")
        XCTAssertEqual(periodName("all"), "All time")
        XCTAssertEqual(periodName("12m"), "Last 12 months")
        XCTAssertEqual(periodName("2025"), "2025")
    }

    private func watch(_ name: String, _ platform: String, _ games: Int, _ batteryGames: Int, _ perHour: Double? = nil, _ perGame: Double? = nil) -> StatsWatchesModelsItem {
        StatsWatchesModelsItem(device: "\(platform):x", name: name, platform: platform, games: games, batteryGames: batteryGames, drainPerHour: perHour, drainPerGame: perGame)
    }

    func testYourWatchesNameThePlatformOnlyWhereTheNameDoesnt() {
        XCTAssertNil(platformLabel(watch("Garmin Venu 2", "garmin", 6, 3)))
        XCTAssertNil(platformLabel(watch("Apple Watch Series 9", "applewatch", 2, 2)))
        XCTAssertEqual(platformLabel(watch("Galaxy Watch4", "wearos", 2, 2)), "Wear OS")
        XCTAssertEqual(platformLabel(watch("Pixel Watch", "other", 1, 0)), "Watch")
    }

    func testAWatchWithReadingsShowsItsBatteryOneWithoutSaysSo() {
        let venu = watch("Garmin Venu 2", "garmin", 6, 3, 9.9, 15.9)
        XCTAssertTrue(hasBattery(venu))
        XCTAssertEqual(watchFigure(venu), "9.9%")
        XCTAssertEqual(watchCaption(venu), "16% a game, from 3 games")
        XCTAssertEqual(describeWatch(venu), "Garmin Venu 2: 9.9% of the battery an hour; 6 games on it; 16% a game, from 3 games")
        // With Role = Assistant in the demo: the Venu 2's one game has no readings.
        let none = watch("Garmin Venu 2", "garmin", 1, 0)
        XCTAssertFalse(hasBattery(none))
        XCTAssertEqual(watchFigure(none), "—")
        XCTAssertEqual(watchCaption(none), "No battery readings yet")
        XCTAssertEqual(describeWatch(none), "Garmin Venu 2: no battery readings yet; 1 game on it")
        let one = watch("Galaxy Watch4", "wearos", 1, 1, 40, 27)
        XCTAssertEqual(watchCaption(one), "27% a game, from 1 game")
        XCTAssertTrue(describeWatch(one).hasPrefix("Wear OS Galaxy Watch4: 40% of the battery an hour, past the ring's scale"))
    }

    func testTheWatchesComeMostUsedFirstAndNotAtAllFromAnOlderServer() {
        let shown = watchesShown(StatsWatches(games: 9, models: [watch("Galaxy Watch4", "wearos", 2, 2), watch("Garmin Venu 2", "garmin", 6, 3), watch("Apple Watch", "applewatch", 1, 0)]))
        XCTAssertEqual(shown.map(\.name), ["Garmin Venu 2", "Galaxy Watch4", "Apple Watch"])
        XCTAssertTrue(watchesShown(nil).isEmpty)
        XCTAssertTrue(watchesShown(StatsWatches(games: 0, models: [])).isEmpty)
    }

    func testAnAnswerWithoutWatchesFromAServerBeforeThemStillReads() throws {
        let old = """
        {"options":{"years":[],"genders":[],"competitions":[],"tags":[],"venues":[]},"games":{"total":0,"abandoned":0},
        "roles":{"referee":0,"ar1":0,"ar2":0,"fourth":0,"notSet":0},"distance":{"totalM":0,"games":0,"tracked":0,"byRole":[],"overTime":[]},
        "months":[],"busiest":[],"ageGroups":[],"places":{"venues":0,"pitches":0,"top":[]},"referees":{"count":0,"top":[]},
        "weather":{"games":0,"rainy":0,"temperaturesC":[]},"fees":{"games":0,"earnedAmount":0,"paidAmount":0,"owedAmount":0,"otherCurrencies":[],"months":[],"competitions":[]},
        "discipline":{"games":0,"cautions":0,"sendOffs":0,"secondCautions":0,"goals":0,"ageGroups":[],"competitions":[],"codes":[]},
        "fitness":{"games":[]},"addedTime":{"periods":0,"byPeriod":[],"ageGroups":[],"competitions":[]},"years":[]}
        """
        let stats = try jsonDecoder.decode(Stats.self, from: Data(old.utf8))
        XCTAssertNil(stats.watches)
        XCTAssertTrue(watchesShown(stats.watches).isEmpty)
    }
}
