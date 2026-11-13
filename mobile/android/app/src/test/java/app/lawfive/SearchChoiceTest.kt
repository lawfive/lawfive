package app.lawfive

import app.lawfive.ui.components.canCreate
import app.lawfive.ui.components.foldName
import app.lawfive.ui.components.searchOptions
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// APP-22: searching a long list of referees or venues, and when "New..." is offered.
class SearchChoiceTest {
    private data class Person(val name: String, val aliases: List<String> = emptyList())
    private val people = listOf(Person("84-Henderson, Melissa (REG)"), Person("José Ruiz", listOf("Pepe")), Person("630-Foster, Brady"))
    private val names = { p: Person -> listOf(p.name) + p.aliases }

    @Test fun nothingTypedShowsEveryone() = assertEquals(3, searchOptions(people, "  ", names).size)

    @Test fun findsPartOfANameAnyCase() = assertEquals(listOf(people[0]), searchOptions(people, "hender", names))

    @Test fun ignoresAccents() {
        assertEquals("jose", foldName("  JOSÉ "))
        assertEquals(listOf(people[1]), searchOptions(people, "jose", names))
    }

    @Test fun findsAnotherName() = assertEquals(listOf(people[1]), searchOptions(people, "pepe", names))

    @Test fun offersNewOnlyForANewName() {
        assertTrue(canCreate(people, "Sam Rivera", names))
        assertTrue(canCreate(people, "Henderson", names))
        assertFalse(canCreate(people, "  ", names))
        assertFalse(canCreate(people, "josé ruiz", names))
        assertFalse(canCreate(people, "PEPE", names))
    }
}
