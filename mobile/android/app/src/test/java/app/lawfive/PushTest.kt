package app.lawfive

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant

// PUSH-4: when the phone asks the relay for a new handle.
class PushTest {
    private val now: Instant = Instant.parse("2026-11-01T12:00:00Z")

    @Test fun nothingNewNoNeed() {
        assertFalse(needsRegistering("t", "https://a.example", "t", "https://a.example", now.minus(Duration.ofDays(29)), now))
    }

    @Test fun aNewTokenRegisters() {
        assertTrue(needsRegistering("new", "https://a.example", "t", "https://a.example", now, now))
    }

    @Test fun anotherServerRegisters() {
        assertTrue(needsRegistering("t", "https://b.example", "t", "https://a.example", now, now))
    }

    @Test fun anOldHandleIsRenewedLongBeforeItExpires() {
        assertTrue(needsRegistering("t", "https://a.example", "t", "https://a.example", now.minus(Duration.ofDays(31)), now))
    }

    @Test fun neverRegisteredRegisters() {
        assertTrue(needsRegistering("t", "https://a.example", null, null, null, now))
    }
}
