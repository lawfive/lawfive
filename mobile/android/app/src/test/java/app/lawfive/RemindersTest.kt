package app.lawfive

import java.time.Duration
import org.junit.Assert.assertEquals
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
