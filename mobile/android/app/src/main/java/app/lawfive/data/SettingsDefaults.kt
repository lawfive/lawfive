package app.lawfive.data

import app.lawfive.schema.UserSettings
import java.time.Instant
import java.util.Locale
import java.util.UUID

// An account's settings before it has a record (APP-4, as the website's web/src/settings.ts): the
// phone's language and region choose the units, currency and misconduct codes, and the first change
// makes the record from them, with the phone's time zone (PLAN-9).

object SettingsDefaults {
    /** Regions that use miles for distance. */
    private val milesRegions = setOf("US", "LR", "MM")
    /** Regions that use Fahrenheit. */
    private val fahrenheitRegions = setOf("US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH")
    private val euro = listOf("AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK")
    private val currencyByRegion: Map<String, String> = euro.associateWith { "EUR" } + mapOf(
        "US" to "USD", "CA" to "CAD", "GB" to "GBP", "AU" to "AUD", "NZ" to "NZD", "MX" to "MXN", "BR" to "BRL", "AR" to "ARS", "CL" to "CLP", "CO" to "COP",
        "JP" to "JPY", "KR" to "KRW", "CN" to "CNY", "IN" to "INR", "SG" to "SGD", "HK" to "HKD", "PH" to "PHP", "ID" to "IDR", "MY" to "MYR", "TH" to "THB", "VN" to "VND",
        "ZA" to "ZAR", "NG" to "NGN", "GH" to "GHS", "KE" to "KES", "EG" to "EGP", "AE" to "AED", "SA" to "SAR", "IL" to "ILS", "TR" to "TRY",
        "CH" to "CHF", "SE" to "SEK", "NO" to "NOK", "DK" to "DKK", "PL" to "PLN", "CZ" to "CZK", "HU" to "HUF", "RO" to "RON", "IS" to "ISK",
    )

    /** The locale's region; US when it has none (a phone's language almost always has one). */
    private fun region(locale: Locale): String = locale.country.uppercase().ifEmpty { "US" }

    /** Sensible settings for a phone set to en-US, en-GB, de-DE and so on, with `id` and the given time zone. */
    fun forLocale(locale: Locale = Locale.getDefault(), id: String = UUID.randomUUID().toString(), timeZone: String? = null): UserSettings {
        val r = region(locale)
        return UserSettings(
            id = id, version = 0, updatedAt = Instant.now().toString(),
            currency = currencyByRegion[r] ?: "USD",
            distanceUnit = if (r in milesRegions) "mi" else "km",
            temperatureUnit = if (r in fahrenheitRegions) "f" else "c",
            misconductScheme = when (r) { "US" -> "ussf"; "GB" -> "fa"; else -> "ifab" },
            timeZone = timeZone,
        )
    }

    /**
     * What a settings change saves: on top of the stored record, or, with none yet, on top of
     * `defaults` with the phone's time zone, so the first change makes the record (APP-4).
     */
    fun toSave(existing: UserSettings?, defaults: UserSettings, zone: String, change: (UserSettings) -> UserSettings): UserSettings =
        change(existing ?: defaults.copy(timeZone = defaults.timeZone ?: zone))
}
