import Foundation

// WEB-32: Get ready, on Matches for an account that hasn't set up yet, as the website's
// GetReady.tsx and Android's GetReady.kt: five rows that tick themselves, until they're all done or
// it's hidden. On the phone, Turn on reminders takes the place of Get the phone app. Hide this list
// and They're right are kept with the account's settings (settings.getReady), so they follow it to
// the website and other phones.

enum GetReady {
    /// "Los Angeles time", from America/Los_Angeles.
    static func zoneName(_ zone: String) -> String {
        "\((zone.split(separator: "/").last.map(String.init) ?? zone).replacingOccurrences(of: "_", with: " ")) time"
    }

    /// "Miles, °F, USD and Los Angeles time".
    static func unitsLine(_ settings: UserSettings, phoneZone: String) -> String {
        "\(settings.distanceUnit == "mi" ? "Miles" : "Kilometers"), °\(settings.temperatureUnit.uppercased()), \(settings.currency) and \(zoneName(settings.timeZone ?? phoneZone))"
    }

    /// Whether the units or time zone are other than this phone would have guessed: someone chose them.
    static func unitsChosen(_ settings: UserSettings, guess: UserSettings, phoneZone: String) -> Bool {
        settings.distanceUnit != guess.distanceUnit || settings.temperatureUnit != guess.temperatureUnit
            || settings.currency != guess.currency || (settings.timeZone != nil && settings.timeZone != phoneZone)
    }

    /// What's done: the five rows, in order.
    struct Done: Equatable {
        var watch: Bool
        var reminders: Bool
        var units: Bool
        var games: Bool
        var screen: Bool
        var all: Bool { watch && reminders && units && games && screen }
        var count: Int { [watch, reminders, units, games, screen].filter { $0 }.count }
    }

    static func done(watches: Int, remindersOn: Bool, settings: UserSettings, guess: UserSettings, phoneZone: String, matches: Int, calendars: Int) -> Done {
        Done(
            watch: watches > 0,
            reminders: remindersOn,
            units: settings.getReady?.unitsConfirmed == true || unitsChosen(settings, guess: guess, phoneZone: phoneZone),
            games: matches > 0 || calendars > 0,
            screen: settings.watchScreen != nil
        )
    }

    /// Whether it shows: not hidden, and something's still to do.
    static func shows(_ settings: UserSettings, _ done: Done) -> Bool { settings.getReady?.hidden != true && !done.all }
}
