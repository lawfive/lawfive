package app.lawfive.ui

import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import android.text.format.DateFormat
import androidx.compose.ui.graphics.Color
import app.lawfive.schema.CrewMember
import app.lawfive.schema.Match
import app.lawfive.schema.MatchFormat
import app.lawfive.schema.Referee
import app.lawfive.schema.Team
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.temporal.ChronoUnit
import java.util.Currency
import java.util.Locale

// Showing matches as the web app does (web/src/format.ts): team names and colors, kickoffs in the
// match's own time zone, money, distances and match minutes.

/** As officials are shown: short, so a crew fits on a line (WEB-11). */
val roleNames = mapOf("referee" to "Referee", "ar1" to "AR1", "ar2" to "AR2", "fourth" to "4th")
/** As a form offers them, where there's room to spell it out. */
val roleNamesInFull = roleNames + ("fourth" to "4th official")
private val roleOrder = listOf("referee", "ar1", "ar2", "fourth")
val genderNames = mapOf("male" to "Male", "female" to "Female", "coed" to "Co-ed")

sealed interface Official {
    val role: String
    data class You(override val role: String) : Official
    data class Member(override val role: String, val member: CrewMember) : Official
}

/** The officials in the usual order, the user in their own place (WEB-11). */
fun crewInOrder(crew: List<CrewMember>, you: String?): List<Official> {
    val all = (if (you != null) listOf<Official>(Official.You(you)) else emptyList()) + crew.map { Official.Member(it.role, it) }
    return all.withIndex().sortedWith(compareBy({ roleOrder.indexOf(it.value.role) }, { it.index })).map { it.value }
}

/** The roles as one line of officials shows them (WEB-20). */
val roleNamesShort = mapOf("referee" to "Ref", "ar1" to "AR1", "ar2" to "AR2", "fourth" to "4th")

/** One official on the line: [key] is referee, ar1, ar2 or fourth. */
data class LineOfficial(val key: String, val who: String, val you: Boolean) {
    /** As the line shows it: Ref, AR1, AR2, 4th. */
    val role get() = roleNamesShort[key] ?: key
}

/**
 * WEB-20: the officials as one line reads them, in order: each role with "you", a saved referee's
 * surname, or a name as typed (a club linesman isn't a surname).
 */
fun officialsLine(m: Match, referee: (String?) -> Referee?): List<LineOfficial> =
    crewInOrder(m.crew, m.role).mapNotNull { o ->
        when (o) {
            is Official.You -> LineOfficial(o.role, "you", true)
            is Official.Member -> (referee(o.member.refereeId)?.let { it.shortName?.trim()?.ifEmpty { null } ?: surname(it.name) } ?: o.member.name)?.let { LineOfficial(o.role, it, false) }
        }
    }

private val nameSuffixes = setOf("jr", "sr", "ii", "iii", "iv")
private val surnameParticles = setOf("da", "das", "de", "del", "della", "den", "der", "di", "do", "dos", "du", "la", "le", "ten", "ter", "van", "von")
private fun isSuffix(word: String) = word.lowercase().removeSuffix(".") in nameSuffixes

/**
 * WEB-20: a referee's surname, guessed from their name as a schedule writes it: "Sam Rivera",
 * "Rivera, Sam", with a grade in brackets or after a dash, Jr. or III after it, or "de la" before it.
 * A name it can't make sense of comes back whole.
 */
fun surname(name: String): String {
    // A grade or level in brackets, or after a spaced dash or bar.
    val plain = name.replace(Regex("""\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?"""), " ").split(Regex("""\s[-–—|]\s"""))[0]
    val parts = plain.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    // "Rivera, Sam": the part before the comma, unless all that follows is a suffix ("Sam Rivera, Jr.").
    val listed = parts.size > 1 && !parts.drop(1).all(::isSuffix)
    val words = (parts.firstOrNull() ?: "").split(Regex("\\s+")).filter { it.isNotEmpty() }.toMutableList()
    while (words.size > 1 && isSuffix(words.last())) words.removeAt(words.lastIndex)
    var from = if (listed) 0 else words.size - 1
    while (from > 1 && words[from - 1] in surnameParticles) from--
    return words.drop(maxOf(from, 0)).joinToString(" ").ifEmpty { name.trim() }
}

fun teamName(team: Team, home: Boolean) = team.name ?: if (home) "Home" else "Away"

fun matchTitle(m: Match) = "${teamName(m.home, true)} v ${teamName(m.away, false)}"

/**
 * RES-8: what Delete match? says goes with it: its report, and its track when it has one (`track`
 * null: not known yet, or no signal). The website's words (format.ts, deleteMatchMessage).
 */
fun deleteMatchMessage(report: Boolean, track: Boolean?): String {
    val goes = "It goes from LawFive, on every device"
    if (!report) return "$goes."
    return "$goes, with its report${when (track) { true -> " and track"; false -> ""; null -> " and any track" }}."
}

/** SET-5: a name's words: letters and digits, split at spaces, underscores and punctuation. */
private val notWord = Regex("[^\\p{L}\\p{N}]+")

private fun words(name: String) = name.split(notWord).filter { it.isNotEmpty() }

private fun firstThree(name: String) = words(name).joinToString("").take(3).uppercase().ifEmpty { null }

/**
 * SET-5: short names for a pair of teams (schema/src/shortNames.ts, the website's and the server's):
 * the first three letters or digits of each name; when those are the same, the words the names start
 * with in common are skipped, so L84_Roach and L84_Smith become ROA and SMI.
 */
fun suggestAliases(homeName: String?, awayName: String?): Pair<String?, String?> {
    val simple = firstThree(homeName ?: "") to firstThree(awayName ?: "")
    if (simple.first == null || simple.first != simple.second) return simple
    val home = words(homeName ?: "")
    val away = words(awayName ?: "")
    var shared = 0
    while (shared < home.size && shared < away.size && home[shared].lowercase() == away[shared].lowercase()) shared++
    val distinct = (firstThree(home.drop(shared).joinToString(" ")) ?: simple.first) to (firstThree(away.drop(shared).joinToString(" ")) ?: simple.second)
    return if (distinct.first != distinct.second) distinct else simple
}

/** The watch's short name (SET-5): the one typed, else from both teams' names (suggestAliases), else HOM/AWY. */
fun teamAlias(team: Team, other: Team, home: Boolean): String {
    team.alias?.ifEmpty { null }?.let { return it }
    val suggested = if (home) suggestAliases(team.name, other.name).first else suggestAliases(other.name, team.name).second
    return suggested ?: if (home) "HOM" else "AWY"
}

fun describePlayers(m: Match) = listOfNotNull(m.ageGroup, m.gender?.let { genderNames[it] }).joinToString(" · ")

fun parseColour(hex: String?): Color? = hex?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

/** WEB-19: a hex color as typed, with or without its #, as #RRGGBB; null if it isn't one. */
fun normalHex(text: String): String? = text.trim().removePrefix("#").takeIf { Regex("^[0-9A-Fa-f]{6}$").matches(it) }?.let { "#${it.uppercase()}" }

/** WEB-19: a hue (0 to 360) with saturation and brightness (0 to 1) as #RRGGBB. */
fun hsvToHex(hue: Float, saturation: Float, value: Float): String {
    val c = value * saturation
    val h = ((hue % 360f) + 360f) % 360f / 60f
    val x = c * (1 - kotlin.math.abs(h % 2 - 1))
    val (r, g, b) = when (h.toInt()) {
        0 -> Triple(c, x, 0f)
        1 -> Triple(x, c, 0f)
        2 -> Triple(0f, c, x)
        3 -> Triple(0f, x, c)
        4 -> Triple(x, 0f, c)
        else -> Triple(c, 0f, x)
    }
    val m = value - c
    fun byte(v: Float) = Math.round((v + m) * 255).coerceIn(0, 255)
    return "#%02X%02X%02X".format(byte(r), byte(g), byte(b))
}

/** WEB-19: #RRGGBB as its hue (0 to 360), saturation and brightness (0 to 1); null if it isn't a color. */
fun hexToHsv(hex: String): Triple<Float, Float, Float>? {
    val c = parseColour(normalHex(hex)) ?: return null
    val max = maxOf(c.red, c.green, c.blue)
    val d = max - minOf(c.red, c.green, c.blue)
    val hue = when {
        d == 0f -> 0f
        max == c.red -> 60 * (((c.green - c.blue) / d) % 6)
        max == c.green -> 60 * ((c.blue - c.red) / d + 2)
        else -> 60 * ((c.red - c.green) / d + 4)
    }
    return Triple((hue + 360) % 360, if (max == 0f) 0f else d / max, max)
}

private fun luminance(c: Color): Double {
    fun lin(v: Float) = if (v <= 0.04045f) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
    return 0.2126 * lin(c.red) + 0.7152 * lin(c.green) + 0.0722 * lin(c.blue)
}

/** Black or white text, whichever contrasts more with the color (as on the watch). */
fun textOn(c: Color): Color {
    val l = luminance(c)
    return if ((l + 0.05) / 0.05 >= 1.05 / (l + 0.05)) Color.Black else Color.White
}

/** A kit that would vanish against the page: dark ones in dark mode, light ones in light mode. */
fun kitVanishes(c: Color, dark: Boolean): Boolean = if (dark) luminance(c) < 0.02 else luminance(c) > 0.8

/** Two letters for an avatar; assignor names like "84-Van Der Wal, Travis (REG)" give TV. */
fun initials(name: String): String {
    val plain = name.replace(Regex("\\(.*?\\)"), "").replace(Regex("^[^\\p{L}]+"), "").trim()
    val parts = plain.split(",").map { p -> p.trim().split(Regex("\\s+")).filter { w -> w.any { it.isLetter() } } }
    val words = if (parts.size > 1 && parts[1].isNotEmpty()) listOf(parts[1][0], parts[0].firstOrNull() ?: "") else parts[0]
    val picked = if (words.size > 1) listOf(words.first(), words.last()) else words
    return picked.mapNotNull { w -> w.firstOrNull { it.isLetter() } }.joinToString("").uppercase().ifEmpty { "?" }
}

fun zoneOf(m: Match): ZoneId = m.timeZone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()

fun kickoffAt(m: Match): ZonedDateTime? = m.kickoff?.let { runCatching { ZonedDateTime.parse(it).withZoneSameInstant(zoneOf(m)) }.getOrNull() }

fun instantOf(iso: String?): Instant? = iso?.let { runCatching { ZonedDateTime.parse(it).toInstant() }.getOrNull() ?: runCatching { Instant.parse(it) }.getOrNull() }

/** "9:00 AM" or "09:00", as the phone is set. */
fun formatTime(t: ZonedDateTime, context: android.content.Context): String = formatTime(t, DateFormat.is24HourFormat(context))

/** "9:00 AM", or "09:00" on a 24-hour clock: for code without a Context, such as the match report's text (DATA-6). */
fun formatTime(t: ZonedDateTime, use24Hour: Boolean): String =
    t.format(DateTimeFormatter.ofPattern(if (use24Hour) "HH:mm" else "h:mm a", Locale.getDefault()))

/** The time in two parts for a fixture board: "9:00" and "AM" (none on a 24-hour clock). */
fun timeParts(t: ZonedDateTime, context: android.content.Context): Pair<String, String?> =
    if (DateFormat.is24HourFormat(context)) t.format(DateTimeFormatter.ofPattern("HH:mm")) to null
    else t.format(DateTimeFormatter.ofPattern("h:mm")) to t.format(DateTimeFormatter.ofPattern("a", Locale.getDefault())).uppercase()

/** "Today", "Tomorrow", "Yesterday", else "Saturday 7 November". */
fun formatDay(t: ZonedDateTime): String {
    val days = ChronoUnit.DAYS.between(java.time.LocalDate.now(app.lawfive.data.AppClock.clock(t.zone)), t.toLocalDate())
    return when (days) {
        0L -> "Today"
        1L -> "Tomorrow"
        -1L -> "Yesterday"
        else -> t.format(DateTimeFormatter.ofPattern(if (t.year == java.time.LocalDate.now(app.lawfive.data.AppClock.clock()).year) "EEEE, MMMM d" else "EEEE, MMMM d, yyyy", Locale.getDefault()))
    }
}

/**
 * A time as the website's formatWhen: "8:12 PM", "yesterday, 8:12 PM", "tomorrow, 8:12 PM" or "Sat, Nov 7, 8:12 PM".
 * PUSH-5: a notification, read some time after it came, says "today, 8:12 PM" too.
 */
fun whenText(t: ZonedDateTime, use24Hour: Boolean, today: Boolean = false): String {
    val days = ChronoUnit.DAYS.between(LocalDate.now(app.lawfive.data.AppClock.clock(t.zone)), t.toLocalDate())
    val time = formatTime(t, use24Hour)
    return when (days) { 0L -> if (today) "today, $time" else time; -1L -> "yesterday, $time"; 1L -> "tomorrow, $time"; else -> "${formatShortDay(t)}, $time" }
}

fun whenText(t: ZonedDateTime, context: android.content.Context, today: Boolean = false): String = whenText(t, DateFormat.is24HourFormat(context), today)

/** "Sat, Nov 7" (with the year when it isn't this one). */
fun formatShortDay(t: ZonedDateTime): String {
    val days = ChronoUnit.DAYS.between(java.time.LocalDate.now(app.lawfive.data.AppClock.clock(t.zone)), t.toLocalDate())
    if (days == 0L) return "Today"
    return t.format(DateTimeFormatter.ofPattern(if (t.year == java.time.LocalDate.now(app.lawfive.data.AppClock.clock()).year) "EEE, MMM d" else "EEE, MMM d, yyyy", Locale.getDefault()))
}

fun formatFullDate(t: ZonedDateTime): String = t.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL))

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
fun timeAgo(at: Instant, now: Instant = app.lawfive.data.AppClock.now()): String {
    val minutes = Duration.between(at, now).toMinutes()
    return when {
        minutes < 2 -> "just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 48 * 60 -> "${minutes / 60} h ago"
        minutes < 14 * 24 * 60 -> "${minutes / (24 * 60)} days ago"
        else -> at.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))
    }
}

fun money(amount: Double, currency: String): String {
    val f = NumberFormat.getCurrencyInstance()
    runCatching { f.currency = Currency.getInstance(currency) }
    f.maximumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
    f.minimumFractionDigits = if (amount % 1.0 == 0.0) 0 else 2
    return f.format(amount)
}

fun minutes(sec: Int): String = if (sec % 60 == 0) "${sec / 60}" else String.format(Locale.getDefault(), "%.1f", sec / 60.0)

/** "2 × 45 min, 15 min break" and the switches that are on; one period has no break but before extra time (SET-16). */
fun describeFormat(f: MatchFormat): String {
    val parts = mutableListOf("${f.periods} × ${minutes(f.periodSec)} min")
    if (f.periods > 1 || f.extraTime) parts += "${minutes(f.breakSec)} min break"
    // TMR-15: as the website's.
    if (f.stoppingClock == true) parts += "stopping clock"
    if (f.extraTime) parts += "ET ${f.extraTimePeriods} × ${minutes(f.extraTimePeriodSec)}" + if (f.goldenGoal == true) ", golden goal" else ""
    if (f.penalties) parts += "penalties"
    if (f.halfwayBreak) parts += "${minutes(f.halfwayBreakSec)} min halfway break"
    // EVT-12: as the website's.
    if (f.sinBins == true) parts += "${minutes(f.sinBinSec ?: 600)} min sin bins"
    return parts.joinToString(" · ")
}

/** 23', or 45+2' in added time; a clock that stops has none, so its length's minute is the last (TMR-15). */
fun matchMinute(f: MatchFormat, period: Long, periodSec: Long): String {
    val regular = period <= f.periods
    val length = if (regular) f.periodSec else f.extraTimePeriodSec
    val start = if (regular) (period - 1) * f.periodSec else f.periods.toLong() * f.periodSec + (period - f.periods - 1) * f.extraTimePeriodSec
    val lengthMin = length / 60
    val minute = (periodSec / 60 + 1).let { if (f.stoppingClock == true) minOf(it, lengthMin.toLong()) else it }
    return if (minute > lengthMin) "${(start + length) / 60}+${minute - lengthMin}'" else "${start / 60 + minute}'"
}

/**
 * Q-20: the format as the match was played, for naming and timing its periods, as the website's
 * asPlayed: as many periods of normal time as the watch recorded, when that differs from the plan
 * (more than planned, or a whole match of fewer). An abandoned match's missing periods leave the plan's.
 */
fun asPlayed(f: MatchFormat, record: app.lawfive.schema.MatchRecord?): MatchFormat {
    val normal = record?.periods?.count { !it.extraTime } ?: 0
    val differs = if (record?.outcome == "completed") normal != f.periods else normal > f.periods
    return if (normal in 1..4 && differs) f.copy(periods = normal) else f
}

fun periodName(f: MatchFormat, period: Long): String = when {
    period > f.periods -> "Extra time ${period - f.periods}"
    f.periods == 2 -> if (period == 1L) "First half" else "Second half"
    // SET-16: a match of one period, beside "Extra time 1" when it has some.
    f.periods == 1 -> "Regular time"
    else -> "Period $period"
}

fun formatDistance(metres: Double, unit: String) =
    if (unit == "mi") String.format(Locale.getDefault(), "%.1f mi", metres / 1609.344) else String.format(Locale.getDefault(), "%.1f km", metres / 1000)

/** A pitch's length or width (TRK-9): whole metres, or whole yards where distances are in miles, as the website's formatPitchSize. */
fun formatPitchSize(metres: Double, unit: String) =
    if (unit == "mi") "${Math.round(metres / 0.9144)} yd" else "${Math.round(metres)} m"

fun formatSpeed(mps: Double, unit: String) =
    if (unit == "mi") String.format(Locale.getDefault(), "%.1f mph", mps * 2.236936) else String.format(Locale.getDefault(), "%.1f km/h", mps * 3.6)

/** TRK-11, WEB-28: under the sprints, what counts as one: "21 km/h or faster, 2 s or more", as the website's. */
fun sprintsCaption(sprintKph: Double, unit: String) =
    if (unit == "mi") "${Math.round(sprintKph / 1.609344)} mph or faster, 2 s or more" else "${Math.round(sprintKph)} km/h or faster, 2 s or more"

/**
 * WEB-28: how much you've worked with a referee or at a venue, as the website's history.ts: the
 * matches played (with the first and last kickoffs) and those coming up.
 */
data class Together(val played: Int = 0, val first: ZonedDateTime? = null, val last: ZonedDateTime? = null, val upcoming: Int = 0)

/**
 * STAT-16: whether a match counts as a game: played or abandoned, with a kickoff (schema's isGame).
 * The one rule for every count of games: Stats', the match list's "played", and a venue's,
 * referee's, competition's and template's.
 */
fun isGame(m: Match): Boolean = (m.status == "played" || m.status == "abandoned") && m.kickoff != null

fun togetherOf(matches: List<Match>): Together = matches.fold(Together()) { t, m ->
    when {
        isGame(m) -> {
            val at = kickoffAt(m)
            t.copy(
                played = t.played + 1,
                first = if (at != null && (t.first == null || at.isBefore(t.first))) at else t.first,
                last = if (at != null && (t.last == null || at.isAfter(t.last))) at else t.last,
            )
        }
        m.status == "scheduled" -> t.copy(upcoming = t.upcoming + 1)
        else -> t
    }
}

/** A record's slab's tag: "Since Sep 2026", the month of the first game (kept on one line); none before one, as a caption with nothing to say. */
fun sinceTag(t: Together, locale: Locale = Locale.getDefault()): String? =
    t.first?.let { "Since ${it.format(DateTimeFormatter.ofPattern("MMM yyyy", locale)).replace(' ', '\u00A0')}" }

fun formatTemperature(celsius: Double, unit: String) =
    if (unit == "f") "${Math.round(celsius * 9 / 5 + 32)}°F" else "${Math.round(celsius)}°C"

/**
 * Directions from where the user is to a place or an address (WEB-14), in the maps app chosen in
 * Settings: Apple Maps, or Google Maps (automatic on Android), whose link opens its app when it's
 * installed and the browser when it isn't.
 */
fun directionsUri(to: String, mapsApp: String?): String {
    val at = java.net.URLEncoder.encode(to, "UTF-8").replace("+", "%20").replace("%2C", ",")
    return if (mapsApp == "apple") "https://maps.apple.com/?daddr=$at" else "https://www.google.com/maps/dir/?api=1&destination=$at"
}

fun directionsUri(lat: Double, lon: Double, mapsApp: String?): String = directionsUri("$lat,$lon", mapsApp)

/** The maps app chosen in Settings for Directions (WEB-14); null is automatic. */
@androidx.compose.runtime.Composable
fun rememberMapsApp(): String? {
    val settings by LocalGraph.current.records.settings.collectAsStateWithLifecycle(null)
    return settings?.mapsApp
}

/** How much a venue or referee has been in the matches (APP-19), as the web's lists count it. */
data class MatchCount(val played: Int = 0, val upcoming: Int = 0)

/** Each id's count; a match counts once for each id `idsOf` gives. */
fun matchCounts(matches: List<app.lawfive.schema.Match>, idsOf: (app.lawfive.schema.Match) -> List<String>): Map<String, MatchCount> {
    val counts = mutableMapOf<String, MatchCount>()
    for (m in matches) {
        for (id in idsOf(m).distinct()) {
            val c = counts[id] ?: MatchCount()
            counts[id] = when {
                isGame(m) -> c.copy(played = c.played + 1)
                m.status == "scheduled" -> c.copy(upcoming = c.upcoming + 1)
                else -> c
            }
        }
    }
    return counts
}

/** "12 matches · 2 coming up", "1 match", or "No matches yet". */
fun describeCount(c: MatchCount?): String =
    listOfNotNull(
        c?.played?.takeIf { it > 0 }?.let { "$it ${if (it == 1) "match" else "matches"}" },
        c?.upcoming?.takeIf { it > 0 }?.let { "$it coming up" },
    ).joinToString(" · ").ifEmpty { "No matches yet" }

/** The most played first; ties, and those with none, by name. */
fun <T> mostMatchesFirst(counts: Map<String, MatchCount>, id: (T) -> String, name: (T) -> String): Comparator<T> =
    compareByDescending<T> { counts[id(it)]?.played ?: 0 }.thenBy { name(it).lowercase() }
