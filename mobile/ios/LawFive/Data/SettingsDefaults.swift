import Foundation

// The account's settings before it has a record of its own (a new account the website hasn't seen
// yet): the same defaults the website falls back to (web/src/settings.ts), from the phone's region.
// The first change saves them as the account's record, with this phone's time zone (PLAN-9).

enum SettingsDefaults {
    /// Regions that use miles for distance.
    private static let milesRegions: Set<String> = ["US", "LR", "MM"]
    /// Regions that use Fahrenheit.
    private static let fahrenheitRegions: Set<String> = ["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]
    private static let euro = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"]
    private static let currencyByRegion: [String: String] = {
        var map = Dictionary(uniqueKeysWithValues: euro.map { ($0, "EUR") })
        map.merge([
            "US": "USD", "CA": "CAD", "GB": "GBP", "AU": "AUD", "NZ": "NZD", "MX": "MXN", "BR": "BRL", "AR": "ARS", "CL": "CLP", "CO": "COP",
            "JP": "JPY", "KR": "KRW", "CN": "CNY", "IN": "INR", "SG": "SGD", "HK": "HKD", "PH": "PHP", "ID": "IDR", "MY": "MYR", "TH": "THB", "VN": "VND",
            "ZA": "ZAR", "NG": "NGN", "GH": "GHS", "KE": "KES", "EG": "EGP", "AE": "AED", "SA": "SAR", "IL": "ILS", "TR": "TRY",
            "CH": "CHF", "SE": "SEK", "NO": "NOK", "DK": "DKK", "PL": "PLN", "CZ": "CZK", "HU": "HUF", "RO": "RON", "IS": "ISK",
        ]) { a, _ in a }
        return map
    }()

    /// The locale's region, or its language's likeliest (de → DE), as the website's Intl.Locale.maximize.
    static func region(_ locale: Locale) -> String? {
        (locale.region ?? Locale.Language(identifier: locale.language.maximalIdentifier).region)?.identifier.uppercased()
    }

    /// Sensible settings for a locale such as en_US, en_GB or de_DE; one without a region is taken as the US's.
    static func settings(for locale: Locale = .current, id: String = newId(), timeZone: String? = nil) -> UserSettings {
        let r = region(locale) ?? "US"
        return UserSettings(
            id: id, version: 0, updatedAt: nowString(),
            misconductScheme: r == "US" ? "ussf" : r == "GB" ? "fa" : "ifab",
            currency: currencyByRegion[r] ?? "USD",
            distanceUnit: milesRegions.contains(r) ? "mi" : "km",
            temperatureUnit: fahrenheitRegions.contains(r) ? "f" : "c",
            timeZone: timeZone
        )
    }
}
