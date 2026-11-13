package app.lawfive

import app.lawfive.data.EndsRow
import app.lawfive.data.GetReady
import app.lawfive.data.OnWatchSaved
import app.lawfive.data.OnWatchStore
import app.lawfive.data.PeriodEnds
import app.lawfive.data.SettingsDefaults
import app.lawfive.data.endsByWayRound
import app.lawfive.data.json
import app.lawfive.data.pitchEnds
import app.lawfive.data.pitchTurned
import app.lawfive.data.sameFormat
import app.lawfive.data.schemaDefaultFormat
import app.lawfive.data.starterFormatFor
import app.lawfive.data.starterFormats
import app.lawfive.data.starterOf
import app.lawfive.data.startingFormat
import app.lawfive.data.formatChoiceOf
import app.lawfive.data.suggestedStarter
import app.lawfive.data.usualChanged
import app.lawfive.data.usualFormatChoice
import app.lawfive.data.usualFormatFrom
import app.lawfive.schema.Match
import app.lawfive.schema.MatchFormat
import app.lawfive.schema.MatchOnWatch
import app.lawfive.schema.MatchTemplate
import app.lawfive.schema.Team
import app.lawfive.schema.UserSettingsGetReady
import app.lawfive.schema.UsualFormat
import app.lawfive.schema.WatchScreen
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

// The owner's choices of 2026-11-09 on the phone: the starter formats and what a new match starts
// with (SET-17), the heatmap's ends (TRK-9, the website's cases in web/test/pitchEnds.test.ts),
// Get ready (WEB-32) and On your watch (SYNC-14).
class ChoicesTest {
    /** The phones' copy of schema's starterFormats, from the repo (as remote.sh copies schema/ beside mobile/). */
    private val generated = File("../../../schema/generated/starter-formats.json")

    @Test
    fun `the starter formats are schema's, field for field`() {
        val shared = json.parseToJsonElement(generated.readText()).jsonArray.map { it.jsonObject }
        assertEquals(shared.map { it["id"]!!.jsonPrimitive.content }, starterFormats.map { it.id })
        for ((s, k) in shared.zip(starterFormats)) {
            assertEquals(s["name"]!!.jsonPrimitive.content, k.name)
            assertEquals(s["ageGroups"]!!.jsonArray.map { it.jsonPrimitive.content }, k.ageGroups)
            assertEquals(json.decodeFromJsonElement(MatchFormat.serializer(), s["format"] as JsonObject), k.format)
        }
    }

    @Test
    fun `a match's age group suggests its starter`() {
        assertEquals("us-u10", starterFormatFor("U10")?.id)
        assertEquals("us-u10", starterFormatFor("u 10")?.id)
        assertEquals("us-u8", starterFormatFor("U6")?.id)
        assertEquals("adult", starterFormatFor("adult")?.id)
        // TMR-15: high school and college, with the stopping clock.
        assertEquals("us-hs", starterFormatFor("Varsity")?.id)
        assertEquals("us-college", starterFormatFor("ncaa")?.id)
        assertEquals(true, starterFormatFor("JV")?.format?.stoppingClock)
        assertNull(starterFormatFor("O35"))
        assertNull(starterFormatFor(null))
        assertNull(starterFormatFor(" "))
    }

    @Test
    fun `a format is a starter when it's the same, counting the fields saved before as their defaults`() {
        assertEquals("adult", starterOf(schemaDefaultFormat)?.id)
        // The app's own 2×45, saved before golden goal was a field.
        assertEquals("adult", starterOf(app.lawfive.ui.screens.defaultFormat)?.id)
        assertNull(starterOf(schemaDefaultFormat.copy(periodSec = 40 * 60)))
        assertTrue(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(goldenGoal = null, breakStoppage = null)))
        // EVT-12: saved before sin bins, it has them off at 10 minutes.
        assertTrue(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(sinBins = null, sinBinSec = null)))
        assertFalse(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(sinBins = true)))
        // With sin bins off, their length doesn't count (web/src/newMatch.ts).
        assertTrue(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(sinBinSec = 5 * 60)))
        assertFalse(sameFormat(schemaDefaultFormat.copy(sinBins = true), schemaDefaultFormat.copy(sinBins = true, sinBinSec = 5 * 60)))
        assertFalse(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(penalties = true)))
        // TMR-15: saved before the stopping clock, the clock runs on.
        assertTrue(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(stoppingClock = null, stopForGoalsCards = null)))
        assertFalse(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(stoppingClock = true)))
        // Goals and cards stopping it only counts with a stopping clock, as the website's and the iPhone's.
        assertTrue(sameFormat(schemaDefaultFormat, schemaDefaultFormat.copy(stopForGoalsCards = false)))
        assertFalse(sameFormat(schemaDefaultFormat.copy(stoppingClock = true), schemaDefaultFormat.copy(stoppingClock = true, stopForGoalsCards = false)))
    }

    @Test
    fun `a new match starts with the usual format, else 2x45, and saving one leaves its format as the usual`() {
        assertEquals(schemaDefaultFormat to null, startingFormat(null, emptyList()))
        val league = MatchTemplate(id = "t1", version = 1, updatedAt = "2026-11-01T00:00:00Z", name = "League", format = starterFormats[1].format, defaults = app.lawfive.schema.MatchTemplateDefaults())
        val usual = UsualFormat(format = league.format, templateId = "t1", changedAt = "2026-11-01T00:00:00Z")
        assertEquals(league.format to "t1", startingFormat(usual, listOf(league)))
        // The template since deleted: its format stays, without its name.
        assertEquals(league.format to null, startingFormat(usual, emptyList()))

        // Which choice a format is, and the usual one it leaves: the starter or template only while unchanged.
        val u12 = starterFormats[2].format
        assertEquals("starter:us-u12", formatChoiceOf(u12, null, null, listOf(league)).id)
        assertEquals("template:t1", formatChoiceOf(league.format, "t1", null, listOf(league)).id)
        assertEquals("none", formatChoiceOf(u12.copy(teamSize = 8), null, null, listOf(league)).id)
        val custom = UsualFormat(format = u12.copy(teamSize = 8), changedAt = "2026-11-01T00:00:00Z")
        assertEquals("Your usual", formatChoiceOf(custom.format, null, custom, emptyList()).name)
        assertEquals("As last saved", usualFormatChoice(custom, emptyList()).name)
        assertEquals("Not chosen yet", usualFormatChoice(null, emptyList()).name)
        val saved = usualFormatFrom(u12, formatChoiceOf(u12, null, null, emptyList()), "2026-11-09T00:00:00Z")
        assertEquals("us-u12", saved.starterId)
        assertNull(usualFormatFrom(custom.format, formatChoiceOf(custom.format, null, null, emptyList()), "2026-11-09T00:00:00Z").starterId)
        // Saved again with the same format, nothing changes, so the settings aren't touched.
        assertFalse(usualChanged(saved, saved.copy(changedAt = "2026-11-10T00:00:00Z")))
        assertTrue(usualChanged(null, saved))
        assertTrue(usualChanged(saved, saved.copy(format = custom.format, starterId = null)))
        // The age group suggests its starter only when the format differs.
        assertEquals("us-u10", suggestedStarter("U10", schemaDefaultFormat)?.id)
        assertNull(suggestedStarter("U10", starterFormats[1].format))
    }

    private val ux = 1.0
    private val uy = 0.0

    @Test
    fun `a referee's drawing is turned so the first kickoff team attacks left to right in the first period`() {
        // Kicking off toward the east on a pitch running east: drawn as it lies.
        assertEquals(listOf(PeriodEnds(1, "home", "away"), PeriodEnds(2, "away", "home")), pitchEnds(2, "home", 90.0, ux, uy, false))
        // Toward the west: the drawing is turned, and the kickoff team is still on the left.
        assertEquals(PeriodEnds(1, "away", "home"), pitchEnds(2, "away", 270.0, ux, uy, true)[0])
        assertTrue(pitchTurned("referee", emptyList(), 270.0, ux, uy))
        assertFalse(pitchTurned("referee", emptyList(), 90.0, ux, uy))
    }

    @Test
    fun `teams change ends every period`() {
        val ends = pitchEnds(4, "home", 80.0, ux, uy, false)
        assertEquals(listOf("home", "away", "home", "away"), ends.map { it.left })
        assertEquals(listOf("away", "home", "away", "home"), ends.map { it.right })
    }

    @Test
    fun `an assistant's drawing, turned for their touchline, can put the kickoff team on the right`() {
        assertEquals(PeriodEnds(1, "away", "home"), pitchEnds(2, "home", 100.0, ux, uy, true)[0])
        // A pitch running north: a kickoff toward the north attacks the right end as drawn.
        assertEquals(PeriodEnds(1, "away", "home"), pitchEnds(2, "away", 10.0, 0.0, 1.0, false)[0])
        // Their touchline is the side they were on in the periods.
        assertTrue(pitchTurned("ar1", listOf(30.0, 31.0, -2.0), 90.0, ux, uy))
        assertFalse(pitchTurned("ar2", listOf(-30.0, -31.0), 90.0, ux, uy))
    }

    @Test
    fun `without the kickoff direction there are no ends to name`() {
        assertEquals(emptyList<PeriodEnds>(), pitchEnds(2, null, null, ux, uy, false))
    }

    @Test
    fun `the whole match groups the periods by which way round they were played`() {
        val halves = pitchEnds(2, "home", 90.0, ux, uy, false)
        assertEquals(listOf(EndsRow("1st half", "home", "away"), EndsRow("2nd half", "away", "home")), endsByWayRound(halves, 2))
        assertEquals(listOf("P1, P3", "P2, P4"), endsByWayRound(pitchEnds(4, "away", 90.0, ux, uy, false), 4).map { it.label })
        assertEquals(listOf("P1, P3", "P2"), endsByWayRound(pitchEnds(3, "home", 90.0, ux, uy, false), 3).map { it.label })
    }

    private val us = SettingsDefaults.forLocale(Locale.US, id = "s")

    @Test
    fun `get ready says what was guessed, in the website's words`() {
        assertEquals("Los Angeles time", GetReady.zoneName("America/Los_Angeles"))
        assertEquals("Miles, °F, USD and Los Angeles time", GetReady.unitsLine(us, "America/Los_Angeles"))
        assertEquals("Kilometers, °C, GBP and London time", GetReady.unitsLine(SettingsDefaults.forLocale(Locale.UK, id = "s"), "Europe/London"))
    }

    @Test
    fun `the units are done once they're confirmed, or chosen other than the phone guessed`() {
        val zone = "America/Los_Angeles"
        assertFalse(GetReady.unitsChosen(us, us, zone))
        assertTrue(GetReady.unitsChosen(us.copy(distanceUnit = "km"), us, zone))
        assertTrue(GetReady.unitsChosen(us.copy(timeZone = "America/Denver"), us, zone))
        assertFalse(GetReady.unitsChosen(us.copy(timeZone = zone), us, zone))
        assertFalse(GetReady.done(0, false, us, us, zone, 0, 0).units)
        assertTrue(GetReady.done(0, false, us.copy(getReady = UserSettingsGetReady(unitsConfirmed = true)), us, zone, 0, 0).units)
    }

    @Test
    fun `get ready ticks each row itself, and goes once they're all done or it's hidden`() {
        val zone = "America/Los_Angeles"
        val none = GetReady.done(0, false, us, us, zone, 0, 0)
        assertEquals(0, none.count)
        assertTrue(GetReady.shows(us, none))
        assertFalse(GetReady.shows(us.copy(getReady = UserSettingsGetReady(hidden = true)), none))
        // An assignor calendar brings the games in, even before its first match.
        assertTrue(GetReady.done(0, false, us, us, zone, 0, 1).games)
        val chosen = us.copy(watchScreen = WatchScreen(layout = "ring", secondClock = "down", changedAt = "2026-11-03T12:00:00Z"), getReady = UserSettingsGetReady(unitsConfirmed = true))
        val all = GetReady.done(1, true, chosen, us, zone, 3, 0)
        assertEquals(5, all.count)
        assertFalse(GetReady.shows(chosen, all))
    }

    private fun onWatch(match: String, upToDate: Boolean, since: String, name: String = "Garmin Venu 2", device: String = "d1") =
        MatchOnWatch(matchId = match, deviceId = device, kind = "garmin", name = name, since = since, syncedAt = since, upToDate = upToDate)

    @Test
    fun `on your watch, in the requirement's words`() {
        val la = ZoneId.of("America/Los_Angeles")
        val now = Instant.parse("2026-11-10T05:00:00Z") // 9 PM on Nov 9 in Los Angeles
        val time = { t: java.time.ZonedDateTime -> t.format(java.time.format.DateTimeFormatter.ofPattern("h:mm a", Locale.US)) }
        val day = { t: java.time.ZonedDateTime -> t.format(java.time.format.DateTimeFormatter.ofPattern("EEE, MMM d", Locale.US)) }
        val saved = OnWatchSaved(listOf(onWatch("m1", true, "2026-11-10T04:12:00Z"), onWatch("m2", false, "2026-11-08T04:12:00Z"), onWatch("m3", true, "2026-11-08T04:12:00Z")), listOf("Garmin Venu 2"))
        fun text(m: String, s: OnWatchSaved = saved) = OnWatchStore.lines(m, s, la, now, time, day).map { it.text }
        assertEquals(listOf("On your Venu 2 since 8:12 PM"), text("m1"))
        assertEquals(listOf("On your Venu 2, an older version: sync the watch"), text("m2"))
        assertEquals(OnWatchStore.Companion.Tone.Old, OnWatchStore.lines("m2", saved, la, now, time, day).single().tone)
        assertEquals(listOf("On your Venu 2 since Sat, Nov 7, 8:12 PM"), text("m3"))
        assertEquals(listOf("On your Venu 2 since yesterday, 8:12 PM"), text("m5", OnWatchSaved(listOf(onWatch("m5", true, "2026-11-09T04:12:00Z")), listOf("Garmin Venu 2"))))
        assertEquals(listOf("Not on a watch yet"), text("m4"))
        // No watch linked, or not fetched yet: nothing to say.
        assertEquals(emptyList<String>(), text("m4", OnWatchSaved(emptyList(), emptyList())))
        assertEquals(emptyList<String>(), text("m1", OnWatchSaved(saved.matches, null)))
        assertEquals("Galaxy Watch4", OnWatchStore.watchName("Galaxy Watch4"))
        assertEquals("Garmin watch", OnWatchStore.watchName("Garmin watch"))
        // What's kept reads back as it was written.
        assertEquals(saved, json.decodeFromString(OnWatchSaved.serializer(), json.encodeToString(OnWatchSaved.serializer(), saved)))
        assertEquals(3, json.decodeFromString(ListSerializer(MatchOnWatch.serializer()), json.encodeToString(ListSerializer(MatchOnWatch.serializer()), saved.matches)).size)
    }
}
