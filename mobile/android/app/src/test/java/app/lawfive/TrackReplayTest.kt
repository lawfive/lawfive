package app.lawfive

import app.lawfive.data.PitchFrame
import app.lawfive.data.ReplayEvent
import app.lawfive.data.TrackReplay
import app.lawfive.schema.GpsSeries
import app.lawfive.schema.HeartRateSeries
import app.lawfive.schema.MatchTrack
import app.lawfive.schema.PeriodPlayed
import app.lawfive.schema.TrackSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// TRK-14: the same answers as the web's replay and the schema's pitch.

class TrackReplayTest {
    private val goal = ReplayEvent("goal", "home", 90_000, 1, 30, 9, "goal")
    private val card = ReplayEvent("caution", "away", 1_000_000, 2, 100, 4, null)
    private val replay = TrackReplay(
        MatchTrack(
            source = TrackSource(kind = "lawfive"), start = "2026-10-31T10:00:00Z",
            gps = GpsSeries(t = listOf(60_000, 61_000, 62_000, 80_000), lat = listOf(37.0, 37.0001, 37.0002, 37.0003), lon = listOf(-122.0, -122.0, -122.0, -122.0)),
            heartRate = HeartRateSeries(t = listOf(60_000, 70_000), bpm = listOf(140, 150)),
        ),
        // A minute in; ten minutes of play; five off; ten more.
        listOf(
            PeriodPlayed(period = 1, extraTime = false, startedAt = "2026-10-31T10:01:00Z", playedSec = 600),
            PeriodPlayed(period = 2, extraTime = false, startedAt = "2026-10-31T10:16:00Z", playedSec = 600),
        ),
        listOf(card, goal),
    )

    // TMR-13: as the web's (web/test/replay.test.ts).
    @Test fun `a suspension is skipped, and events after it carry on from where play stopped`() {
        val spans = app.lawfive.data.playSpans(
            listOf(PeriodPlayed(period = 1, extraTime = false, startedAt = "2026-10-31T10:00:00Z", playedSec = 60, suspended = listOf(app.lawfive.schema.PeriodPlayedSuspendedItem(fromSec = 20, lengthSec = 30)))),
            app.lawfive.data.instantMs("2026-10-31T10:00:00Z"),
        )
        assertEquals(listOf(app.lawfive.data.Span(1, 0, 20_000, 0), app.lawfive.data.Span(1, 50_000, 90_000, 20_000)), spans)
        assertEquals(10_000L, app.lawfive.data.trackTimeOf(spans, 1, 10))
        assertEquals(70_000L, app.lawfive.data.trackTimeOf(spans, 1, 40))
    }

    // TMR-15: a clock that stops, as the web's (schema/src/track.ts): the period runs for its clock and its stops, an event
    // at a stop's clock time goes at the stop's start, and the clock stands still through each stop.
    @Test fun `a stopping clock's events go after its stops, and its clock stands still through them`() {
        val stoppage = { at: Long, length: Long -> app.lawfive.schema.EventStoppage(`when` = "play", period = 1, periodSec = at, lengthSec = length) }
        val record = app.lawfive.schema.MatchRecord(
            id = "r", version = 1, updatedAt = "", outcome = "completed", stoppingClock = true,
            periods = listOf(PeriodPlayed(period = 1, extraTime = false, startedAt = "2026-10-31T10:00:00Z", playedSec = 2400, stoppedSec = 90)),
            score = app.lawfive.schema.MatchRecordScore(0, 0), events = listOf(stoppage(600, 60), stoppage(300, 30)),
        )
        val stops = app.lawfive.data.clockStopsOf(record)
        assertEquals(listOf(app.lawfive.data.ClockStop(300, 30), app.lawfive.data.ClockStop(600, 60)), stops[1])
        assertEquals(emptyMap<Long, List<app.lawfive.data.ClockStop>>(), app.lawfive.data.clockStopsOf(record.copy(stoppingClock = null)))
        val spans = app.lawfive.data.playSpans(record.periods, app.lawfive.data.instantMs("2026-10-31T10:00:00Z"))
        assertEquals(listOf(app.lawfive.data.Span(1, 0, 2_490_000, 0)), spans)
        assertEquals(200L, app.lawfive.data.elapsedOfClock(stops[1], 200))
        assertEquals(300L, app.lawfive.data.elapsedOfClock(stops[1], 300))
        assertEquals(630L, app.lawfive.data.elapsedOfClock(stops[1], 600))
        assertEquals(1030L, app.lawfive.data.elapsedOfClock(stops[1], 940))
        assertEquals(300L, app.lawfive.data.clockOfElapsed(stops[1], 315))
        assertEquals(305L, app.lawfive.data.clockOfElapsed(stops[1], 335))
        assertEquals(600L, app.lawfive.data.clockOfElapsed(stops[1], 650))
        assertEquals(940L, app.lawfive.data.clockOfElapsed(stops[1], 1030))
        assertEquals(500L, app.lawfive.data.clockOfElapsed(null, 500))
    }

    @Test fun `the timeline skips the break`() {
        assertEquals(1_200_000L, replay.length)
        assertEquals(60_000L, replay.trackTimeAt(0))
        assertEquals(960_001L, replay.trackTimeAt(600_000 + 1))
        // In the break: the start of the next period.
        assertEquals(600_000L, replay.positionAt(700_000))
        assertEquals(listOf(600_000L), replay.boundaries)
    }

    @Test fun `a moment glides between fixes and waits over a gap`() {
        val half = replay.at(60_500)
        assertEquals(37.00005, half.lat!!, 1e-9)
        assertEquals(false, half.noGps)
        assertEquals(140, half.bpm)
        assertTrue(replay.at(70_000).noGps)
        assertEquals(37.0002, replay.at(70_000).lat!!, 1e-9)
        assertNull(replay.at(10_000).lat)
    }

    @Test fun `goals count towards the score and stop the replay`() {
        assertEquals(0 to 0, replay.scoreAt(89_000))
        assertEquals(1 to 0, replay.scoreAt(90_000))
        assertEquals("goal", replay.stopBetween(0, 40_000)?.type)
        assertNull(replay.stopBetween(40_000, 50_000))
    }

    @Test fun `a pitch keeps its shape through a move, a turn and a resize`() {
        val p = PitchFrame.of(37.0, -122.0, 90.0, 100.0, 60.0)
        assertEquals(90.0, p.bearing, 1e-6)
        val (endLat, endLon) = p.fromPitch(50.0, 0.0)
        val (x, y) = p.toPitch(endLat, endLon)
        assertEquals(50.0, x, 1e-6)
        assertEquals(0.0, y, 1e-6)
        assertEquals(100.0, p.movedTo(37.001, -122.0).lengthM, 1e-6)
        val longer = p.withEnd(p.fromPitch(60.0, 0.0).first, p.fromPitch(60.0, 0.0).second)
        assertEquals(120.0, longer.lengthM, 1e-6)
        assertEquals(90.0, longer.bearing, 1e-6)
        val wider = p.withSide(p.fromPitch(0.0, 40.0).first, p.fromPitch(0.0, 40.0).second)
        assertEquals(80.0, wider.widthM, 1e-6)
        val a = p.fromPitch(-50.0, -30.0)
        val b = p.fromPitch(50.0, -30.0)
        val back = PitchFrame.from(a.first, a.second, b.first, b.second, 37.0, -122.0)
        assertEquals(100.0, back.lengthM, 1e-6)
        assertEquals(60.0, back.widthM, 1e-6)
    }

    @Test fun `counts as the web does, busiest first`() {
        val match = { status: String, venue: String -> app.lawfive.schema.Match(id = "$status$venue", version = 0, updatedAt = "2026-10-31T10:00:00Z", status = status, format = app.lawfive.ui.screens.defaultFormat, home = app.lawfive.schema.Team(), away = app.lawfive.schema.Team(), crew = emptyList(), venueId = venue, kickoff = "2026-10-01T10:00:00Z") }
        // STAT-16: games are played or abandoned with a kickoff.
        val counts = app.lawfive.ui.matchCounts(listOf(match("played", "a"), match("scheduled", "a"), match("cancelled", "a"), match("played", "b"), match("played", "b"))) { listOfNotNull(it.venueId) }
        assertEquals("1 match · 1 coming up", app.lawfive.ui.describeCount(counts["a"]))
        assertEquals("2 matches", app.lawfive.ui.describeCount(counts["b"]))
        assertEquals("No matches yet", app.lawfive.ui.describeCount(counts["c"]))
        val order = listOf("a", "c", "b").sortedWith(app.lawfive.ui.mostMatchesFirst(counts, { it }, { it }))
        assertEquals(listOf("b", "a", "c"), order)
    }

    // TRK-5: the same bands as schema/src/track.ts gives for these points.
    private fun initials(bands: List<Int?>) = bands.joinToString(" ") { if (it == null) "--" else listOf("wa", "jo", "ru", "hi", "sp")[it] }

    @Test fun speedBandsAgreeWithTheSchema() {
        val positions = GpsSeries(
            t = listOf(0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 29000, 30000, 31000, 32000, 33000, 34000, 35000, 36000, 37000, 38000, 39000),
            lat = listOf(37.0, 37.000009, 37.000018, 37.000027, 37.000036, 37.000063, 37.0000899, 37.0001169, 37.0001439, 37.0001529, 37.0001619, 37.0001709, 37.0003507, 37.0003597, 37.0003687, 37.0003777, 37.0004227, 37.0004676, 37.0005126, 37.0005576),
            lon = List(20) { -122.0 },
        )
        assertEquals("-- wa wa wa wa jo jo jo wa -- wa wa -- wa wa jo ru hi hi jo", initials(app.lawfive.data.speedBandsOf(positions)))
        val measured = GpsSeries(t = List(12) { it * 1000L }, lat = List(12) { 37 + it * 0.00002 }, lon = List(12) { -122.0 }, speedMps = listOf(1.0, 1.0, 2.5, 2.5, 4.0, 4.0, 5.5, 5.5, 5.5, 1.0, 1.0, 1.0))
        assertEquals("-- wa jo jo ru ru hi hi hi wa wa wa", initials(app.lawfive.data.speedBandsOf(measured)))
        assertEquals("-- wa ru ru sp sp sp sp sp wa wa wa", initials(app.lawfive.data.speedBandsOf(measured, 14.0)))
        // A long sprint is a car.
        val long = measured.copy(speedMps = listOf(1.0, 1.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 6.0, 1.0, 1.0))
        assertEquals("-- wa -- -- -- -- -- -- -- -- wa wa", initials(app.lawfive.data.speedBandsOf(long)))
    }

    @Test fun stretchesAreUnbrokenRunsInsideThePeriods() {
        val track = MatchTrack(
            source = TrackSource(kind = "lawfive"), start = "2026-10-31T10:00:00Z",
            gps = GpsSeries(t = List(6) { it * 1000L }, lat = List(6) { 37 + it * 0.00002 }, lon = List(6) { -122.0 }, speedMps = listOf(1.0, 1.0, 1.0, 2.5, 2.5, 1.0)),
        )
        val stretches = TrackReplay(track, emptyList(), emptyList()).speedStretches()
        assertEquals(listOf(0, 1, 0), stretches.map { it.band })
        assertEquals(stretches[0].points.last(), stretches[1].points.first())
    }
}
