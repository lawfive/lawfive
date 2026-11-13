package app.lawfive

import app.lawfive.data.json
import app.lawfive.schema.EventAbandonment
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventClockAdjusted
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventInjury
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSuspension
import app.lawfive.schema.ExternalRef
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchRecordScore
import app.lawfive.schema.MisconductCode
import app.lawfive.schema.MisconductScheme
import app.lawfive.schema.OffenderPlayer
import app.lawfive.schema.OffenderTeamOfficial
import app.lawfive.schema.Team
import app.lawfive.ui.screens.defaultFormat
import app.lawfive.ui.screens.reportText
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// DATA-6: the match report as text, as the website's (web/test/report.test.ts).
class ReportTest {
    private val match = Match(id = "m1", version = 1, updatedAt = "2026-11-03T00:00:00Z", status = "played", format = defaultFormat, home = Team(name = "United U12"), away = Team(name = "Strikers U12"), crew = emptyList())

    // The schemes as the app bundles them, from schema/misconduct/ (build.gradle.kts).
    private fun scheme(id: String): MisconductScheme? = File("../../../schema/misconduct/$id.json").takeIf { it.exists() }?.let { json.decodeFromString(MisconductScheme.serializer(), it.readText()) }

    private fun report(vararg events: app.lawfive.schema.Event, m: Match = match, outcome: String = "completed", editedAt: String? = null, use24Hour: Boolean = false) = reportText(m,
        MatchRecord(id = "r", version = 1, updatedAt = "", outcome = outcome, periods = emptyList(), score = MatchRecordScore(1, 0), events = events.toList(), editedAt = editedAt),
        null, null, null, "Alex Morgan", emptyMap(), use24Hour, ::scheme)

    // EVT-16: after the cards, with how long play was stopped when the watch timed it; none, no heading.
    @Test fun injuriesAfterTheCardsOnlyWhenThereWereAny() {
        val text = report(
            EventCaution(`when` = "play", team = "home", period = 1, periodSec = 600, offender = OffenderPlayer(number = 5)),
            EventInjury(`when` = "play", team = "away", period = 2, periodSec = 420, player = 3, lengthSec = 90),
            EventInjury(`when` = "play", team = "home", period = 2, periodSec = 900, note = "Ankle"),
        )
        assertTrue(text, text.endsWith("Cautions and send-offs\n11'  United U12  #5  Caution\n\nInjuries\n53'  Strikers U12  #3  Play stopped 1:30\n61'  United U12  Player: Ankle\n"))
        assertFalse(report().contains("Injuries"))
    }

    // TMR-15: on a clock that stops, the Clock lines say so first, and a minute at the length has no added time, as the website's.
    @Test fun aStoppingClockSaysSo() {
        val stopping = match.copy(format = defaultFormat.copy(stoppingClock = true, trackStoppage = true))
        val text = report(EventCaution(`when` = "play", team = "home", period = 1, periodSec = 2700, offender = OffenderPlayer(number = 5)), m = stopping)
        assertTrue(text, text.contains("\n\nClock\nStopped when play stopped (the minutes are the clock's)\n\nGoals\n"))
        assertTrue(text, text.contains("45'  United U12  #5  Caution"))
        assertFalse(report().contains("Stopped when play stopped"))
    }

    // TMR-13, TMR-14: the suspensions and the clock's corrections after the result, each only when there were any;
    // a card without a number (or 0, EVT-3) says "Player", and a team official's has the name, as the website's.
    @Test fun suspensionsClockCorrectionsAndCardsWithoutANumber() {
        val text = report(
            EventClockAdjusted(`when` = "play", period = 1, periodSec = 700, clock = "match", changeSec = 40),
            EventCaution(`when` = "play", team = "away", period = 1, periodSec = 1140, offender = OffenderPlayer()),
            EventSuspension(`when` = "play", period = 1, periodSec = 1740, reason = "lightning", lengthSec = 2052, note = "Storm cell"),
            EventCaution(`when` = "play", team = "home", period = 2, periodSec = 60, offender = OffenderPlayer(number = 0)),
            EventSendOff(`when` = "play", team = "away", period = 2, periodSec = 300, offender = OffenderTeamOfficial(role = "headCoach", name = "Pat Lee")),
            EventClockAdjusted(`when` = "play", period = 2, periodSec = 600, clock = "added", changeSec = -65),
        )
        assertTrue(text, text.endsWith("Result: United U12 1 – 0 Strikers U12, full time\n\nSuspended\n30'  Suspended 34:12 · Lightning: Storm cell\n\nClock\n12'  Clock adjusted +0:40\n56'  Added time adjusted −1:05\n\nGoals\nNone\n\nCautions and send-offs\n20'  Strikers U12  Player  Caution\n47'  United U12  Player  Caution\n51'  Strikers U12  Head coach Pat Lee  Send-off\n"))
        val none = report()
        assertFalse(none.contains("Suspended") || none.contains("Clock"))
    }

    // DATA-6: the match number and assignor (SET-15) under the venue, the abandonment (EVT-11) after the result, a goal's
    // kind, and a card's code with what it means in its scheme; a code the scheme doesn't know on its own. As the website's.
    @Test fun assignorAbandonmentGoalKindsAndCodesWithTheirMeaning() {
        val text = report(
            EventGoal(`when` = "play", team = "home", period = 1, periodSec = 300, player = 9, goalType = "penalty"),
            EventCaution(`when` = "play", team = "away", period = 1, periodSec = 600, offender = OffenderPlayer(number = 4), misconduct = MisconductCode("ussf", "UB")),
            EventSendOff(`when` = "play", team = "home", period = 1, periodSec = 1200, offender = OffenderPlayer(number = 2), misconduct = MisconductCode("ussf", "SFP")),
            EventCaution(`when` = "play", team = "away", period = 1, periodSec = 1500, offender = OffenderPlayer(number = 7), misconduct = MisconductCode("ussf", "ZZ")),
            EventAbandonment(`when` = "play", period = 2, periodSec = 1320, reason = "weather", note = "Hail"),
            m = match.copy(external = ExternalRef(source = "manual", id = "4471"), assignor = "Dana Ruiz"), outcome = "abandoned",
        )
        assertTrue(text, text.contains("\nMatch number: 4471\nAssignor: Dana Ruiz\n\nOfficials\n"))
        assertTrue(text, text.endsWith("Result: United U12 1 – 0 Strikers U12, abandoned\nAbandoned 68': Hail\n\nGoals\n6'  United U12  #9  Penalty\n\nCautions and send-offs\n11'  Strikers U12  #4  Caution  UB (Unsporting behavior)\n21'  United U12  #2  Send-off  SFP (Serious foul play)\n26'  Strikers U12  #7  Caution  ZZ\n"))
        val none = report()
        assertFalse(none.contains("Assignor") || none.contains("Abandoned"))
    }

    // RES-1: a result corrected after the match says so on the result line, as the website's printable page and text.
    @Test fun aResultCorrectedAfterTheMatch() {
        val text = report(editedAt = "2026-11-08T10:00:00Z")
        assertTrue(text, text.contains("\nResult: United U12 1 – 0 Strikers U12, full time, corrected after the match\n\nGoals\n"))
        assertFalse(report().contains("corrected"))
    }

    // DATA-6: the kickoff's time as the phone tells the time, "13:30" on a 24-hour clock and "1:30 PM" on a 12-hour one,
    // in the match's own time zone.
    @Test fun theKickoffFollowsThePhones24HourSetting() {
        val m = match.copy(kickoff = "2026-11-07T21:30:00Z", timeZone = "America/Los_Angeles")
        val twentyFour = report(m = m, use24Hour = true)
        assertTrue(twentyFour, twentyFour.contains(", 13:30\n"))
        val twelve = report(m = m)
        assertTrue(twelve, twelve.contains(", 1:30 ") && !twelve.contains("13:30"))
    }
}
