package app.lawfive

import app.lawfive.schema.CrewMember
import app.lawfive.schema.Match
import app.lawfive.schema.Referee
import app.lawfive.schema.Team
import app.lawfive.ui.officialsLine
import app.lawfive.ui.surname
import app.lawfive.ui.screens.defaultFormat
import org.junit.Assert.assertEquals
import org.junit.Test

// WEB-20: the officials on one line, as the website's next match and the phones' rows show them.
class OfficialsLineTest {
    private val referees = mapOf(
        "r1" to Referee(id = "r1", version = 1, updatedAt = "2026-11-03T00:00:00Z", name = "Sam  Rivera "),
        "r2" to Referee(id = "r2", version = 1, updatedAt = "2026-11-03T00:00:00Z", name = "Pelé"),
        "r3" to Referee(id = "r3", version = 1, updatedAt = "2026-11-03T00:00:00Z", name = "Samuel Rivera", shortName = " Sammy "),
    )

    private fun line(role: String?, crew: List<CrewMember>): String {
        val m = Match(id = "m1", version = 1, updatedAt = "2026-11-03T00:00:00Z", status = "scheduled", format = defaultFormat, home = Team(), away = Team(), crew = crew, role = role)
        return officialsLine(m) { id -> id?.let { referees[it] } }.joinToString(" · ") { "${it.role} ${it.who}" }
    }

    @Test
    fun `in order, with surnames, typed names and you`() {
        assertEquals("Ref you · AR1 Rivera · AR2 Club linesman", line("referee", listOf(CrewMember(role = "ar2", name = "Club linesman"), CrewMember(role = "ar1", refereeId = "r1"))))
        assertEquals("Ref Ana Ruiz · AR2 you · 4th Pelé", line("ar2", listOf(CrewMember(role = "fourth", refereeId = "r2"), CrewMember(role = "referee", name = "Ana Ruiz"))))
    }

    @Test
    fun `a short name of their own comes first`() {
        assertEquals("Ref Sammy", line(null, listOf(CrewMember(role = "referee", refereeId = "r3"))))
    }

    @Test
    fun `surnames from names as schedules write them`() {
        val cases = listOf(
            "Sam Rivera" to "Rivera", "Sam  Rivera " to "Rivera", "Pelé" to "Pelé", "Mary-Kate Smith-Jones" to "Smith-Jones",
            "Sam Rivera (Grade 7)" to "Rivera", "Sam Rivera [USSF 8]" to "Rivera", "Sam Rivera (Grade" to "Rivera", "Sam Rivera - Grade 7" to "Rivera",
            "Rivera, Sam" to "Rivera", "Rivera, Sam (Grade 7)" to "Rivera", "RIVERA, SAM" to "RIVERA",
            "Sam Rivera Jr." to "Rivera", "Sam Rivera, Jr." to "Rivera", "Sam Rivera III" to "Rivera", "Rivera Jr., Sam" to "Rivera",
            "Maria de la Cruz" to "de la Cruz", "de la Cruz, Maria" to "de la Cruz", "Ludwig van Beethoven" to "van Beethoven", "Van Morrison" to "Morrison",
            "(Grade 7)" to "(Grade 7)", "  " to "",
        )
        for ((name, expected) in cases) assertEquals(name, expected, surname(name))
    }

    @Test
    fun `nobody to show`() {
        assertEquals("", line(null, emptyList()))
        assertEquals("a referee no longer saved is left out", "", line(null, listOf(CrewMember(role = "ar1", refereeId = "gone"))))
    }
}
