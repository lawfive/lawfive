import XCTest
@testable import LawFive

// TRK-14, as Android's TrackReplayTest: the same answers as the web's replay and the schema's pitch.

final class TrackReplayTests: XCTestCase {
    private let replay = TrackReplay(
        track: MatchTrack(
            source: TrackSource(kind: "lawfive"), start: "2026-10-31T10:00:00Z",
            gps: GpsSeries(t: [60_000, 61_000, 62_000, 80_000], lat: [37.0, 37.0001, 37.0002, 37.0003], lon: [-122, -122, -122, -122]),
            heartRate: HeartRateSeries(t: [60_000, 70_000], bpm: [140, 150])
        ),
        // A minute in; ten minutes of play; five off; ten more.
        periods: [
            PeriodPlayed(period: 1, extraTime: false, startedAt: "2026-10-31T10:01:00Z", playedSec: 600),
            PeriodPlayed(period: 2, extraTime: false, startedAt: "2026-10-31T10:16:00Z", playedSec: 600),
        ],
        events: [
            ReplayEvent(type: "caution", team: "away", t: 1_000_000, period: 2, player: 4, goalType: nil),
            ReplayEvent(type: "goal", team: "home", t: 90_000, period: 1, player: 9, goalType: "goal"),
        ]
    )

    // TMR-13: as the web's (web/test/replay.test.ts).
    func testASuspensionIsSkippedAndEventsAfterItCarryOn() {
        let periods = [PeriodPlayed(period: 1, extraTime: false, startedAt: "2026-10-31T10:00:00Z", playedSec: 60, suspended: [PeriodPlayedSuspendedItem(fromSec: 20, lengthSec: 30)])]
        let start = Int(instantOf("2026-10-31T10:00:00Z")!.timeIntervalSince1970 * 1000)
        let spans = playSpans(periods, start: start)
        XCTAssertEqual(spans, [Span(period: 1, from: 0, to: 20_000, played: 0), Span(period: 1, from: 50_000, to: 90_000, played: 20_000)])
        XCTAssertEqual(trackTimeOf(spans, period: 1, periodSec: 10), 10_000)
        XCTAssertEqual(trackTimeOf(spans, period: 1, periodSec: 40), 70_000)
    }

    // TMR-15: on a clock that stops, the period runs for its clock's time and the time it stood still, an event's clock
    // time goes after the stops before it (one at a stop's start at the stop's start), and the replay's clock stands still
    // through a stop, as the web's (schema/src/track.ts).
    func testAStoppingClockTakesInItsStops() {
        let periods = [PeriodPlayed(period: 1, extraTime: false, startedAt: "2026-10-31T10:00:00Z", playedSec: 60, stoppedSec: 30)]
        let start = Int(instantOf("2026-10-31T10:00:00Z")!.timeIntervalSince1970 * 1000)
        XCTAssertEqual(playSpans(periods, start: start), [Span(period: 1, from: 0, to: 90_000, played: 0)])
        let stop = Event.stoppage(EventStoppage(when: "play", period: 1, periodSec: 20, lengthSec: 30))
        let record = MatchRecord(id: "r", version: 1, updatedAt: "", outcome: "completed", periods: periods, score: MatchRecordScore(home: 0, away: 0), stoppingClock: true, events: [stop])
        let stops = clockStopsOf(record)
        XCTAssertEqual(stops, [1: [ClockStop(atSec: 20, lengthSec: 30)]])
        XCTAssertEqual(elapsedOfClock(stops[1], 10), 10)
        XCTAssertEqual(elapsedOfClock(stops[1], 20), 20)
        XCTAssertEqual(elapsedOfClock(stops[1], 40), 70)
        XCTAssertEqual(clockOfElapsed(stops[1], 10), 10)
        XCTAssertEqual(clockOfElapsed(stops[1], 35), 20)
        XCTAssertEqual(clockOfElapsed(stops[1], 70), 40)
        // A clock that runs on has no stops: its times are already the time played.
        var runsOn = record
        runsOn.stoppingClock = nil
        XCTAssertTrue(clockStopsOf(runsOn).isEmpty)
    }

    func testTheTimelineSkipsTheBreak() {
        XCTAssertEqual(replay.length, 1_200_000)
        XCTAssertEqual(replay.trackTimeAt(0), 60_000)
        XCTAssertEqual(replay.trackTimeAt(600_001), 960_001)
        XCTAssertEqual(replay.positionAt(700_000), 600_000)
        XCTAssertEqual(replay.boundaries, [600_000])
    }

    func testAMomentGlidesBetweenFixesAndWaitsOverAGap() {
        let half = replay.at(60_500)
        XCTAssertEqual(half.lat!, 37.00005, accuracy: 1e-9)
        XCTAssertFalse(half.noGps)
        XCTAssertEqual(half.bpm, 140)
        XCTAssertTrue(replay.at(70_000).noGps)
        XCTAssertEqual(replay.at(70_000).lat!, 37.0002, accuracy: 1e-9)
        XCTAssertNil(replay.at(10_000).lat)
    }

    func testGoalsCountTowardsTheScoreAndStopTheReplay() {
        XCTAssertEqual(replay.scoreAt(89_000).home, 0)
        XCTAssertEqual(replay.scoreAt(90_000).home, 1)
        XCTAssertEqual(replay.stopBetween(0, 40_000)?.type, "goal")
        XCTAssertNil(replay.stopBetween(40_000, 50_000))
    }

    func testAPitchKeepsItsShapeThroughAMoveATurnAndAResize() {
        let p = PitchFrame.of(37, -122, bearing: 90, lengthM: 100, widthM: 60)
        XCTAssertEqual(p.bearing, 90, accuracy: 1e-6)
        let end = p.fromPitch(x: 50, y: 0)
        XCTAssertEqual(p.toPitch(lat: end.lat, lon: end.lon).x, 50, accuracy: 1e-6)
        XCTAssertEqual(p.moved(lat: 37.001, lon: -122).lengthM, 100, accuracy: 1e-6)
        let far = p.fromPitch(x: 60, y: 0)
        let longer = p.withEnd(lat: far.lat, lon: far.lon)
        XCTAssertEqual(longer.lengthM, 120, accuracy: 1e-6)
        XCTAssertEqual(longer.bearing, 90, accuracy: 1e-6)
        let edge = p.fromPitch(x: 0, y: 40)
        XCTAssertEqual(p.withSide(lat: edge.lat, lon: edge.lon).widthM, 80, accuracy: 1e-6)
        let a = p.fromPitch(x: -50, y: -30)
        let b = p.fromPitch(x: 50, y: -30)
        let back = PitchFrame.from(a: Position(lat: a.lat, lon: a.lon), b: Position(lat: b.lat, lon: b.lon), centre: Position(lat: 37, lon: -122))
        XCTAssertEqual(back.lengthM, 100, accuracy: 1e-6)
        XCTAssertEqual(back.widthM, 60, accuracy: 1e-6)
    }

    // TRK-5: the same bands as schema/src/track.ts gives for these points.
    private func initials(_ bands: [Int?]) -> String {
        bands.map { $0.map { ["wa", "jo", "ru", "hi", "sp"][$0] } ?? "--" }.joined(separator: " ")
    }

    func testSpeedBandsAgreeWithTheSchema() {
        let positions = GpsSeries(
            t: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 29000, 30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000, 38000, 39000],
            lat: [37, 37.000009, 37.000018, 37.000027, 37.000036, 37.000063, 37.0000899, 37.0001169, 37.0001439, 37.0001529, 37.0001619, 37.0001709, 37.0003507, 37.0003597, 37.0003687, 37.0003777, 37.0004227, 37.0004676, 37.0005126, 37.0005576],
            lon: Array(repeating: -122, count: 20)
        )
        XCTAssertEqual(initials(speedBandsOf(positions)), "-- wa wa wa wa jo jo jo wa -- wa wa -- wa wa jo ru hi hi jo")
        let t = (0..<12).map { $0 * 1000 }, lat = (0..<12).map { 37 + Double($0) * 0.00002 }, lon = [Double](repeating: -122, count: 12)
        let measured = GpsSeries(t: t, lat: lat, lon: lon, speedMps: [1, 1, 2.5, 2.5, 4, 4, 5.5, 5.5, 5.5, 1, 1, 1])
        XCTAssertEqual(initials(speedBandsOf(measured)), "-- wa jo jo ru ru hi hi hi wa wa wa")
        XCTAssertEqual(initials(speedBandsOf(measured, sprintKph: 14)), "-- wa ru ru sp sp sp sp sp wa wa wa")
        // A long sprint is a car.
        let long = GpsSeries(t: t, lat: lat, lon: lon, speedMps: [1, 1, 6, 6, 6, 6, 6, 6, 6, 6, 1, 1])
        XCTAssertEqual(initials(speedBandsOf(long)), "-- wa -- -- -- -- -- -- -- -- wa wa")
    }

    func testStretchesAreUnbrokenRunsInsideThePeriods() {
        let track = MatchTrack(source: TrackSource(kind: "lawfive"), start: "2026-10-31T10:00:00Z",
                               gps: GpsSeries(t: (0..<6).map { $0 * 1000 }, lat: (0..<6).map { 37 + Double($0) * 0.00002 }, lon: [Double](repeating: -122, count: 6), speedMps: [1, 1, 1, 2.5, 2.5, 1]))
        let stretches = TrackReplay(track: track, periods: [], events: []).speedStretches()
        XCTAssertEqual(stretches.map(\.band), [0, 1, 0])
        XCTAssertEqual(stretches[0].points.last?.lat, stretches[1].points.first?.lat)
    }
}
