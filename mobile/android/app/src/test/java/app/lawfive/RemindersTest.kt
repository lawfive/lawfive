package app.lawfive

import app.lawfive.schema.Match
import app.lawfive.schema.Position
import app.lawfive.schema.Team
import app.lawfive.schema.UserSettings
import app.lawfive.schema.Venue
import app.lawfive.ui.screens.defaultFormat
import java.time.Duration
import java.time.Instant
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

// APP-6: close to kickoff a reminder counts down live, so its words leave out how long is left.
class RemindersTest {
    @Test
    fun `close to kickoff the countdown says how long is left`() {
        assertEquals("11:30 AM · Central Park", reminderText("11:30 AM", "Central Park", Duration.ofMinutes(45)))
        assertEquals("11:30 AM · Central Park", reminderText("11:30 AM", "Central Park", Duration.ofHours(3)))
        assertEquals("11:30 AM", reminderText("11:30 AM", "", Duration.ofMinutes(15)))
    }

    @Test
    fun `further off it says so in words`() {
        assertEquals("11:30 AM in 5 hours · Central Park", reminderText("11:30 AM", "Central Park", Duration.ofMinutes(4 * 60 + 40)))
        assertEquals("11:30 AM tomorrow · Central Park", reminderText("11:30 AM", "Central Park", Duration.ofHours(22)))
        assertEquals("11:30 AM tomorrow", reminderText("11:30 AM", null, Duration.ofHours(22)))
    }
}

// APP-6: the day before and the day of, one notification for the matches it's about. Friday noon in Los Angeles.
class ReminderPlanTest {
    private val now: Instant = Instant.parse("2026-11-13T20:00:00Z")

    @Before fun us() {
        Locale.setDefault(Locale.US)
    }

    private fun match(id: String, home: String, away: String, kickoff: String, status: String = "scheduled", zone: String = "America/Los_Angeles", venue: String? = "park") = Match(
        id = id, version = 0, updatedAt = "2026-11-09T00:00:00Z", status = status, format = defaultFormat,
        home = Team(name = home), away = Team(name = away), crew = emptyList(), kickoff = kickoff, timeZone = zone, venueId = venue,
    )

    private val venues = mapOf(
        "park" to Venue(id = "park", version = 0, updatedAt = "2026-11-09T00:00:00Z", name = "Central Park", position = Position(33.6, -117.6), pitches = emptyList()),
    )

    // Saturday 9:00 AM and 12:30 PM in Los Angeles.
    private val early = match("m1", "Strikers", "Rovers", "2026-11-14T17:00:00Z")
    private val late = match("m2", "Lions", "Tigers", "2026-11-14T20:30:00Z", venue = null)
    private val days = ReminderTimes(emptyList(), dayBefore = "19:00", dayOf = "08:00")

    @Test
    fun `the day before and the day of come once for the day's matches`() {
        val plan = planReminders(days, listOf(late, early), venues, now)
        assertEquals(2, plan.size)
        val (eve, morning) = plan
        assertEquals(Instant.parse("2026-11-14T03:00:00Z"), eve.at)
        assertEquals(ReminderDay.BEFORE, eve.day)
        assertEquals(listOf("m1", "m2"), eve.matches.map { it.id })
        assertEquals(Instant.parse("2026-11-14T16:00:00Z"), morning.at)
        assertEquals(ReminderDay.OF, morning.day)

        val note = ReminderNote.of(eve, use24Hour = false)
        assertEquals("2 matches tomorrow", note.title)
        assertEquals(listOf("STR v ROV · 9:00 AM · Central Park", "LIO v TIG · 12:30 PM"), note.lines)
        assertEquals("m1", note.match)
        assertEquals("Directions go to the first match's place", 33.6, note.lat!!, 0.0)
        assertEquals("it leaves the shade at the last kickoff", Instant.parse("2026-11-14T20:30:00Z"), note.kickoff)
        assertEquals(listOf("STR v ROV · 09:00 · Central Park", "LIO v TIG · 12:30"), ReminderNote.of(eve, use24Hour = true).lines)
        assertEquals("2 matches today", ReminderNote.of(morning, use24Hour = false).title)
    }

    @Test
    fun `one match reads as its own reminder`() {
        val note = ReminderNote.of(planReminders(days, listOf(early), venues, now).first(), use24Hour = false)
        assertEquals("Strikers v Rovers", note.title)
        assertEquals("9:00 AM", note.time)
        assertEquals("Central Park", note.where)
        assertEquals(emptyList<String>(), note.lines)
    }

    @Test
    fun `the day of lists only the matches kicking off after it`() {
        val dawn = match("m3", "Owls", "Hawks", "2026-11-14T15:30:00Z")
        val plan = planReminders(days, listOf(early, dawn, late), venues, now)
        val morning = plan.single { it.day == ReminderDay.OF }
        assertEquals(listOf("m1", "m2"), morning.matches.map { it.id })
        assertEquals(listOf("m3", "m1", "m2"), plan.single { it.day == ReminderDay.BEFORE }.matches.map { it.id })
    }

    @Test
    fun `before kickoff stays one per match`() {
        val plan = planReminders(ReminderTimes(listOf(60, 30)), listOf(early, late), venues, now)
        assertEquals(4, plan.size)
        assertEquals(plan.map { it.at }, plan.map { it.at }.sorted())
        plan.forEach { assertEquals(1, it.matches.size); assertNull(it.day) }
    }

    @Test
    fun `each match's own time zone, grouped by the moment it lands`() {
        // 9:00 AM Saturday in New York: its 7:00 PM the evening before is three hours before Los Angeles's.
        val east = match("m4", "Bees", "Wasps", "2026-11-14T14:00:00Z", zone = "America/New_York")
        val plan = planReminders(days.copy(dayOf = null), listOf(early, east, late), venues, now)
        assertEquals(listOf(listOf("m4"), listOf("m1", "m2")), plan.map { p -> p.matches.map { it.id } })
        assertEquals(Instant.parse("2026-11-14T00:00:00Z"), plan[0].at)
    }

    @Test
    fun `canceled, postponed, past and far-off matches stay out, as do reminders already gone`() {
        val canceled = match("m5", "A", "B", "2026-11-14T18:00:00Z", status = "cancelled")
        val postponed = match("m6", "C", "D", "2026-11-14T18:00:00Z", status = "postponed")
        val farOff = match("m7", "E", "F", "2026-12-14T18:00:00Z")
        val soon = match("m8", "G", "H", "2026-11-13T21:00:00Z")
        val plan = planReminders(ReminderTimes(listOf(120, 30), "19:00", "08:00"), listOf(canceled, postponed, farOff, soon), venues, now)
        // Only 30 minutes before the match an hour from now: its 2 hours before, the day before and the day of have gone.
        assertEquals(listOf(Instant.parse("2026-11-13T20:30:00Z")), plan.map { it.at })
    }

    @Test
    fun `a day's one leaves out a match reminded before kickoff at that moment`() {
        // An hour before 9:00 AM is 8:00 AM, the day of's time: that match's own reminder says it.
        val plan = planReminders(ReminderTimes(listOf(60), dayOf = "08:00"), listOf(early, late), venues, now)
        assertEquals(listOf(listOf("m1"), listOf("m2"), listOf("m2")), plan.map { p -> p.matches.map { it.id } })
        assertEquals(listOf(null, ReminderDay.OF, null), plan.map { it.day })
    }
}

// CAL-3: the phones' times are the account's, as the calendar feed's.
class ReminderTimesTest {
    private fun settings(min: Int? = null, reminders: List<Int>? = null, before: String? = null, of: String? = null) = UserSettings(
        id = "s", version = 1, updatedAt = "2026-11-09T00:00:00Z", misconductScheme = "ussf", currency = "USD", distanceUnit = "mi", temperatureUnit = "f",
        calendarReminderMin = min, calendarReminders = reminders, calendarDayBefore = before, calendarDayOf = of,
    )

    @Test
    fun `an hour before when nothing is chosen`() {
        assertEquals(ReminderTimes(listOf(60)), ReminderTimes.of(null))
        assertEquals(ReminderTimes(listOf(60)), ReminderTimes.of(settings()))
    }

    @Test
    fun `an account's one reminder from before, as the website shows it`() {
        assertEquals(ReminderTimes(listOf(30)), ReminderTimes.of(settings(min = 30)))
        assertEquals(ReminderTimes(emptyList()), ReminderTimes.of(settings(min = 0)))
        assertEquals(ReminderTimes(emptyList(), dayBefore = "19:00"), ReminderTimes.of(settings(min = 1440)))
        assertEquals("several chosen: the one from before no longer counts", ReminderTimes(emptyList(), dayOf = "08:00"), ReminderTimes.of(settings(min = 30, of = "08:00")))
        assertEquals(ReminderTimes(listOf(90, 15), "19:30"), ReminderTimes.of(settings(reminders = listOf(90, 15), before = "19:30")))
    }

    @Test
    fun `saved as the website saves them, all three`() {
        val saved = ReminderTimes(listOf(15, 90, 15), null, "07:30").into(settings(min = 30, before = "19:00"))
        assertEquals(listOf(90, 15), saved.calendarReminders)
        assertNull(saved.calendarDayBefore)
        assertEquals("07:30", saved.calendarDayOf)
        assertEquals(ReminderTimes(listOf(90, 15), null, "07:30"), ReminderTimes.of(saved))
    }

    @Test
    fun `the phone's own times go up once, only to an account without any`() {
        val phone = ReminderTimes(listOf(45), "20:00")
        assertEquals(phone, timesToUpload(phone, enabled = true, account = settings()))
        assertEquals(phone, timesToUpload(phone, enabled = false, account = null))
        assertEquals("the one from before doesn't count as chosen", phone, timesToUpload(phone, enabled = true, account = settings(min = 30)))
        assertNull("the account's win", timesToUpload(phone, enabled = true, account = settings(reminders = listOf(60))))
        assertNull(timesToUpload(phone, enabled = true, account = settings(of = "08:00")))
        assertNull("never saved here", timesToUpload(null, enabled = true, account = settings()))
        assertNull("the starting ones, never used", timesToUpload(ReminderTimes(), enabled = false, account = settings(min = 30)))
        assertEquals(ReminderTimes(), timesToUpload(ReminderTimes(), enabled = true, account = settings(min = 30)))
    }
}
