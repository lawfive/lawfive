package app.lawfive.data

import java.time.Clock
import java.time.Instant
import java.time.ZoneId

/**
 * The time the screens go by ("Today", "in 2 days", the next match's countdown, this month's
 * stats): the phone's own clock. The snapshot tests stop it at the shared fixtures' moment
 * (mobile/android/README.md#snapshot-tests), so their pictures say the same every run; nothing in the app sets it.
 */
object AppClock {
    @Volatile
    internal var fixed: Instant? = null

    fun now(): Instant = fixed ?: Instant.now()

    /** For java.time's now(clock): in the phone's time zone, or `zone`. */
    fun clock(zone: ZoneId = ZoneId.systemDefault()): Clock = fixed?.let { Clock.fixed(it, zone) } ?: Clock.system(zone)
}
