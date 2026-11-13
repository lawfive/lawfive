package app.lawfive.data

import app.lawfive.schema.UserSettings

// WEB-32: Get ready, on Matches for an account that hasn't set up yet, as the website's
// GetReady.tsx: five rows that tick themselves, until they're all done or it's hidden. On the phone,
// Turn on reminders takes the place of Get the phone app. Hide this list and They're right are kept
// with the account's settings (settings.getReady), so they follow it to the website and other phones.

object GetReady {
    /** "Los Angeles time", from America/Los_Angeles. */
    fun zoneName(zone: String): String = "${zone.substringAfterLast('/').replace('_', ' ')} time"

    /** "Miles, °F, USD and Los Angeles time". */
    fun unitsLine(settings: UserSettings, phoneZone: String): String =
        "${if (settings.distanceUnit == "mi") "Miles" else "Kilometers"}, °${settings.temperatureUnit.uppercase()}, ${settings.currency} and ${zoneName(settings.timeZone ?: phoneZone)}"

    /** Whether the units or time zone are other than this phone would have guessed: someone chose them. */
    fun unitsChosen(settings: UserSettings, guess: UserSettings, phoneZone: String): Boolean =
        settings.distanceUnit != guess.distanceUnit || settings.temperatureUnit != guess.temperatureUnit ||
            settings.currency != guess.currency || (settings.timeZone != null && settings.timeZone != phoneZone)

    /** What's done: the five rows, in order. */
    data class Done(val watch: Boolean, val reminders: Boolean, val units: Boolean, val games: Boolean, val screen: Boolean) {
        val all: Boolean get() = watch && reminders && units && games && screen
        val count: Int get() = listOf(watch, reminders, units, games, screen).count { it }
    }

    fun done(watches: Int, remindersOn: Boolean, settings: UserSettings, guess: UserSettings, phoneZone: String, matches: Int, calendars: Int): Done = Done(
        watch = watches > 0,
        reminders = remindersOn,
        units = settings.getReady?.unitsConfirmed == true || unitsChosen(settings, guess, phoneZone),
        games = matches > 0 || calendars > 0,
        screen = settings.watchScreen != null,
    )

    /** Whether it shows: not hidden, and something's still to do. */
    fun shows(settings: UserSettings, done: Done): Boolean = settings.getReady?.hidden != true && !done.all
}
