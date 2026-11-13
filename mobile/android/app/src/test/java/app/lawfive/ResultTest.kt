package app.lawfive

import app.lawfive.data.minuteText
import app.lawfive.data.penaltiesOf
import app.lawfive.data.periodSecOf
import app.lawfive.data.periodsFromFormat
import app.lawfive.data.scoreOf
import app.lawfive.data.settleCautions
import app.lawfive.data.withEvents
import app.lawfive.schema.Event
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventClockAdjusted
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventPenaltyKick
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchRecordScore
import app.lawfive.schema.OffenderPlayer
import app.lawfive.schema.OffenderTeamOfficial
import app.lawfive.schema.PeriodPlayed
import app.lawfive.ui.asPlayed
import app.lawfive.ui.periodName
import app.lawfive.schema.EventSuspension
import app.lawfive.ui.screens.clockAdjustedWords
import app.lawfive.ui.screens.suspensionWords
import app.lawfive.ui.screens.sinBinWords
import app.lawfive.ui.describeFormat
import app.lawfive.ui.screens.defaultFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// RES-1 to RES-6: the same cases as the website's (schema/test/result.test.ts).

class ResultTest {
    private fun goal(team: String, period: Long, periodSec: Long) = EventGoal(`when` = "play", team = team, period = period, periodSec = periodSec)
    private fun caution(team: String, number: Int?, periodSec: Long = 600) = EventCaution(`when` = "play", team = team, period = 1, periodSec = periodSec, offender = OffenderPlayer(number = number))

    @Test fun theScoreIsTheGoals() {
        assertEquals(MatchRecordScore(2, 1), scoreOf(listOf(goal("home", 1, 60), goal("away", 2, 120), goal("home", 2, 300), caution("home", 4))))
        assertEquals(MatchRecordScore(0, 0), scoreOf(emptyList()))
    }

    @Test fun aShootOutsScoreIsItsScoredKicks() {
        fun kick(team: String, scored: Boolean) = EventPenaltyKick(`when` = "penalties", team = team, scored = scored)
        val score = penaltiesOf(listOf(kick("home", true), kick("away", false), kick("home", true), kick("away", true)))!!
        assertEquals(2L to 1L, score.home to score.away)
        assertNull(penaltiesOf(listOf(goal("home", 1, 1))))
    }

    @Test fun aSecondCautionIsASendOffAndGoesBackWhenTheFirstGoes() {
        val settled = settleCautions(listOf(caution("home", 7, 300), caution("away", 7, 400), caution("home", 7, 900), caution("home", null, 950), caution("home", null, 960)))
        assertEquals(listOf("caution", "caution", "secondCaution", "caution", "caution"), settled.map { it.type })
        assertEquals(listOf("caution", "caution", "caution"), settleCautions(settled.drop(2)).map { it.type })
    }

    // EVT-12, Q-22: the website's case.
    @Test fun aSecondSinBinIsASendOffGoesBackWhenTheFirstGoesAndDoesntCombineWithACaution() {
        fun sinBin(team: String, number: Int?, periodSec: Long) = EventSinBin(`when` = "play", team = team, period = 1, periodSec = periodSec, offender = OffenderPlayer(number = number), lengthSec = 600)
        val settled = settleCautions(listOf(sinBin("home", 7, 300), caution("home", 7, 400), sinBin("home", 7, 900), sinBin("home", null, 950), sinBin("home", null, 960), caution("home", 7, 1000)))
        assertEquals(listOf("sinBin", "caution", "secondSinBin", "sinBin", "sinBin", "secondCaution"), settled.map { it.type })
        assertEquals(600L, (settled[2] as EventSecondSinBin).lengthSec)
        assertEquals(listOf("sinBin", "sinBin", "sinBin", "caution"), settleCautions(settled.drop(2)).map { it.type })
    }

    @Test fun minutesAsARefereeWritesThem() {
        val f = defaultFormat
        assertEquals(22 * 60L, periodSecOf(f, 1, "23"))
        assertEquals(22 * 60L, periodSecOf(f, 1, "23'"))
        assertEquals(46 * 60L, periodSecOf(f, 1, "45+2"))
        assertEquals(0L, periodSecOf(f, 2, "46"))
        assertEquals(47 * 60L, periodSecOf(f, 2, "90+3'"))
        assertNull(periodSecOf(f, 2, "23"))
        assertNull(periodSecOf(f, 1, "44+1"))
        assertNull(periodSecOf(f, 1, "abc"))
        for ((period, text) in listOf(1 to "23'", 1 to "45+2'", 2 to "46'", 2 to "90+3'")) {
            assertEquals(text, minuteText(f, period, periodSecOf(f, period, text)!!))
        }
        assertEquals("23'", minuteText(f, 1, 22 * 60L + 41))
        val withEt = f.copy(extraTimePeriodSec = 15 * 60)
        assertEquals(4 * 60L, periodSecOf(withEt, 3, "95"))
        assertEquals(15 * 60L, periodSecOf(withEt, 4, "120+1"))
    }

    @Test fun editingEventsPutsThemInOrderAndWorksTheScoreOutAgain() {
        val record = MatchRecord(id = "r", version = 1, updatedAt = "", outcome = "completed", periods = emptyList(), score = MatchRecordScore(9, 9), events = listOf(goal("away", 2, 600), goal("home", 1, 300)))
        val official = EventCaution(`when` = "afterFullTime", team = "away", offender = OffenderTeamOfficial(role = "headCoach"))
        val edited = withEvents(record, record.events + listOf<Event>(caution("home", 3, 100), official))
        assertEquals(MatchRecordScore(1, 1), edited.score)
        assertEquals(listOf("caution", "goal", "goal", "caution"), edited.events.map { it.type })
        assertEquals("afterFullTime", (edited.events.last() as EventCaution).`when`)
    }

    // TMR-14: a clock corrected on the watch is kept as it is, in its place, as a stoppage is.
    @Test fun editingKeepsAClockAdjustedInItsPlace() {
        val adjusted = EventClockAdjusted(`when` = "play", period = 2, periodSec = 535, clock = "match", changeSec = -65)
        val record = MatchRecord(id = "r", version = 1, updatedAt = "", outcome = "completed", periods = emptyList(), score = MatchRecordScore(0, 0),
            events = listOf(goal("home", 1, 300), adjusted, goal("away", 2, 900)))
        val edited = withEvents(record, listOf(goal("away", 2, 900), adjusted, goal("home", 1, 300), goal("home", 2, 100)))
        assertEquals(listOf("goal", "goal", "clockAdjusted", "goal"), edited.events.map { it.type })
        assertEquals(adjusted, edited.events[2])
    }

    // TMR-14: on the match page, in muted words with a true minus.
    @Test fun aClockAdjustedInWords() {
        assertEquals("Clock adjusted +0:40", clockAdjustedWords(EventClockAdjusted(`when` = "play", clock = "match", changeSec = 40)))
        assertEquals("Added time adjusted \u22121:05", clockAdjustedWords(EventClockAdjusted(`when` = "play", clock = "added", changeSec = -65)))
        assertEquals("Clock adjusted +12:00", clockAdjustedWords(EventClockAdjusted(`when` = "play", clock = "match", changeSec = 720)))
    }

    // TMR-13: as on the website (web/test/format.test.ts).
    @Test fun aSuspensionInWords() {
        assertEquals("Suspended 34:12 · Lightning", suspensionWords(EventSuspension(`when` = "play", reason = "lightning", lengthSec = 2052)))
        assertEquals("Suspended · Crowd trouble", suspensionWords(EventSuspension(`when` = "play", reason = "crowdTrouble")))
        assertEquals("Suspended 5:00 · Weather · Hail", suspensionWords(EventSuspension(`when` = "play", reason = "weather", lengthSec = 300, note = "Hail")))
    }

    // EVT-12: a sin bin in words, and the format's summary.
    @Test fun aSinBinInWords() {
        assertEquals("Sin bin #7 · 10 min", sinBinWords(EventSinBin(`when` = "play", team = "away", offender = OffenderPlayer(number = 7), lengthSec = 600)))
        assertEquals("Sin bin · 5 min", sinBinWords(EventSinBin(`when` = "play", team = "away", offender = OffenderPlayer(), lengthSec = 300)))
        assertEquals("2 × 45 min · 15 min break · 10 min sin bins", describeFormat(defaultFormat.copy(sinBins = true, sinBinSec = 600)))
        assertEquals("2 × 45 min · 15 min break", describeFormat(defaultFormat.copy(sinBins = false, sinBinSec = 600)))
        // SET-16: as the website's.
        assertEquals("1 × 20 min", describeFormat(defaultFormat.copy(periods = 1, periodSec = 1200)))
    }

    // TMR-15: a clock that stops in words, and its minutes with no added time.
    @Test fun aStoppingClockInWords() {
        val stops = defaultFormat.copy(periodSec = 2400, breakSec = 600, stoppingClock = true, trackStoppage = true)
        assertEquals("2 × 40 min · 10 min break · stopping clock", describeFormat(stops))
        assertEquals("40'", app.lawfive.ui.matchMinute(stops, 1, 2400))
        assertEquals("80'", app.lawfive.ui.matchMinute(stops, 2, 2400))
        assertEquals("23'", app.lawfive.ui.matchMinute(stops, 1, 1330))
        assertEquals("40+1'", app.lawfive.ui.matchMinute(stops.copy(stoppingClock = false), 1, 2400))
    }

    @Test fun aResultEnteredWithoutAWatchHasTheFormatsPeriods() {
        assertEquals(listOf(1L to 2700L, 2L to 2700L), periodsFromFormat(defaultFormat).map { it.period to it.playedSec })
    }

    // Q-20: the same cases as the website's (web/test/format.test.ts).
    @Test fun periodsAreNamedAsTheMatchWasPlayed() {
        fun played(outcome: String, normal: Int, extra: Int = 0) = MatchRecord(id = "r", version = 1, updatedAt = "2026-11-09T00:00:00Z", outcome = outcome,
            periods = (1..normal + extra).map { PeriodPlayed(period = it.toLong(), extraTime = it > normal, playedSec = 900) }, score = MatchRecordScore(0, 0), events = emptyList())
        val halves = defaultFormat.copy(periods = 2)
        val quarters = defaultFormat.copy(periods = 4)
        assertEquals("Period 3", periodName(asPlayed(halves, played("completed", 4)), 3))
        assertEquals(halves, asPlayed(halves, played("completed", 2, 2)))
        assertEquals("Extra time 1", periodName(halves, 3))
        assertEquals(2, asPlayed(quarters, played("completed", 2)).periods)
        assertEquals(4, asPlayed(quarters, played("abandoned", 2)).periods)
        assertEquals(halves, asPlayed(halves, null))
        // SET-16: a whole match of one period is a match of one period; abandoned in the first half, still halves.
        val one = asPlayed(halves, played("completed", 1, 1))
        assertEquals(1, one.periods)
        assertEquals("Regular time", periodName(one, 1))
        assertEquals("Extra time 1", periodName(one, 2))
        assertEquals(halves, asPlayed(halves, played("abandoned", 1)))
    }
}
