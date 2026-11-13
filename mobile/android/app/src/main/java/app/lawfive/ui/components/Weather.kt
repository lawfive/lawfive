package app.lawfive.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.ui.unit.em
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lawfive.schema.MatchWeather
import app.lawfive.schema.WeatherRisk
import app.lawfive.ui.formatTemperature
import app.lawfive.ui.instantOf
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.OnPanel
import app.lawfive.ui.timeAgo
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

// Weather on screen (WX-9, as the web's WX-5): Phosphor's weather icons (a clear day's sun and a
// storm in amber), the risk badges with their reasons, the brief beside a match in lists, and the
// match page's weather slab with its details (WEB-28).

/** The account's units, for temperatures, rain and wind. */
data class Units(val temperature: String = "c", val distance: String = "km")

/** DESIGN.md: a clear day's sun and a storm are amber; the rest take the text color. */
/** A clear day's sun and a storm: the ground's amber (darker on a chalk panel so the icon reads), as the website's --weather-amber. */
@Composable
private fun weatherAmber() = colors.weatherAmber

fun weatherIcon(condition: String, day: Boolean): Ph = when (condition) {
    "clear" -> if (day) Ph.Sun else Ph.Moon
    "partlyCloudy" -> if (day) Ph.CloudSun else Ph.CloudMoon
    "cloudy" -> Ph.Cloud
    "fog" -> Ph.CloudFog
    "drizzle", "rain" -> Ph.CloudRain
    "snow" -> Ph.CloudSnow
    "storm" -> Ph.CloudLightning
    else -> Ph.Cloud
}

fun conditionName(condition: String, day: Boolean = true): String = if (condition == "clear" && !day) "Clear" else mapOf(
    "clear" to "Sunny", "partlyCloudy" to "Partly cloudy", "cloudy" to "Cloudy", "fog" to "Fog",
    "drizzle" to "Drizzle", "rain" to "Rain", "snow" to "Snow", "storm" to "Thunderstorms",
)[condition] ?: condition

private val riskNames = mapOf("wetField" to "Wet field", "rain" to "Rain", "storm" to "Storms", "snow" to "Snow", "heat" to "Heat")
private val riskIcons = mapOf("wetField" to "rain", "rain" to "rain", "storm" to "storm", "snow" to "snow", "heat" to "clear")

fun riskName(kind: String) = riskNames[kind] ?: kind

/** "Rain likely", "Heat possible". */
fun riskTitle(r: WeatherRisk) = "${riskName(r.kind)} ${r.level}"

/** Rain in millimetres, or inches for accounts set to miles. */
fun formatRain(mm: Double, distance: String): String = if (distance == "mi") {
    val inches = mm / 25.4
    if (inches < 0.1) "%.2f in".format(inches) else "%.1f in".format(inches)
} else if (mm < 10) "%.1f mm".format(mm) else "${mm.roundToInt()} mm"

/** Wind in km/h, or mph for accounts set to miles. */
fun formatWind(kph: Double, distance: String) = if (distance == "mi") "${(kph / 1.609344).roundToInt()} mph" else "${kph.roundToInt()} km/h"

/** "54°", the short form for lists. */
fun formatDegrees(celsius: Double, unit: String) = "${(if (unit == "f") celsius * 9 / 5 + 32 else celsius).roundToInt()}°"

/** Why the badge is there, in a sentence or two, in the account's units. */
fun explainRisk(r: WeatherRisk, units: Units, final: Boolean): String {
    val amount = r.amount ?: 0.0
    return when (r.kind) {
        "wetField" -> "${formatRain(amount, units.distance)} of rain ${if (final) "fell" else "is forecast"} in the 24 hours before kickoff. " +
            "Many parks close grass fields after about ${formatRain(12.0, units.distance)}; check with the league or the field's owner."
        "rain" -> "${formatRain(amount, units.distance)} of rain ${if (final) "fell" else "is expected"} from an hour before kickoff to the end of the match."
        "storm" -> "Thunderstorms ${if (final) "were" else "are"} forecast during the match or the hour before. " +
            "Play stops at the first thunder or lightning, usually until 30 minutes after the last."
        "snow" -> "${if (amount < 1) "Some" else "${amount.roundToInt()} cm of"} snow ${if (final) "fell" else "is forecast"} before or during the match."
        "heat" -> "It ${if (final) "felt" else "will feel"} like ${formatTemperature(amount, units.temperature)} during the match. Plan water (hydration) breaks."
        else -> riskTitle(r)
    }
}

@Composable
fun WeatherIcon(condition: String, day: Boolean, size: Dp = 20.dp, tint: Color? = null) {
    val amber = (condition == "clear" && day) || condition == "storm"
    PhIcon(weatherIcon(condition, day), conditionName(condition, day), size = size, tint = tint ?: if (amber) weatherAmber() else colors.text)
}

/** "☁ 54°" under a match's kickoff in lists. */
@Composable
fun WeatherBrief(w: MatchWeather, units: Units, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        WeatherIcon(w.condition, w.isDay, size = 17.dp)
        Text(formatDegrees(w.temperatureC, units.temperature), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

/** One risk as a badge (amber possible, red likely); tap for the reason. */
@Composable
fun RiskBadge(r: WeatherRisk, w: MatchWeather, units: Units) {
    var open by remember { mutableStateOf(false) }
    val likely = r.level == "likely"
    // A chip (DESIGN.md "Chips"): panel-colored wherever it sits, so it reads on the grass and the board.
    OnPanel {
        Row(
            Modifier.clip(RoundedCornerShape(4.dp)).background(if (likely) colors.redSoft else colors.amberSoft).clickable { open = true }
                .padding(horizontal = 7.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            val fg = if (likely) colors.redText else colors.amberText
            WeatherIcon(riskIcons[r.kind] ?: "rain", true, size = 13.dp, tint = fg)
            Text(riskName(r.kind).uppercase(), style = LfType.word(13.sp, fg, FontWeight.Bold))
        }
    }
    if (open) OnPanel {
        AlertDialog(
            onDismissRequest = { open = false },
            containerColor = colors.surface,
            title = { Text(riskTitle(r).uppercase(), style = LfType.display(26.sp, colors.text, 26.sp)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(explainRisk(r, units, w.final), style = MaterialTheme.typography.bodyMedium)
                    Text(sourceLine(w), style = MaterialTheme.typography.bodySmall, color = colors.muted)
                }
            },
            confirmButton = { LinkButtonColored("OK", colors.brand) { open = false } },
        )
    }
}

@Composable
fun RiskBadges(w: MatchWeather, units: Units, modifier: Modifier = Modifier) {
    if (w.risks.isEmpty()) return
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (r in w.risks) RiskBadge(r, w, units)
    }
}

private fun sourceLine(w: MatchWeather) =
    if (w.final) "The weather when the match was played · ${w.source}"
    else "Forecast updated ${instantOf(w.updatedAt)?.let { timeAgo(it) } ?: ""} · ${w.source}"

/**
 * The match page's weather (WX-5) under the scoreboard, on a slab (WEB-28) titled Forecast (or
 * Weather) and tagged At kickoff, not cut, as Details and the badges open more: the icon and the
 * temperature large with the condition, then feels like, the chance of rain (or, played, the rain
 * that fell) and the gusts as rows, each label beside its figure, and along its foot the risk badges
 * and Details (hour by hour, the risks spelled out, when it was updated, the credit).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WeatherSlab(w: MatchWeather, units: Units) {
    var details by remember { mutableStateOf(false) }
    // A temperature stays whole, as the large one; other units sit small beside their figure.
    data class Figure(val label: String, val value: String, val whole: Boolean = false)
    val figures = listOfNotNull(
        Figure("Feels like", formatTemperature(w.feelsLikeC, units.temperature), whole = true),
        w.precipitationChance?.takeIf { !w.final }?.let { Figure("Chance of rain", "${(it * 100).roundToInt()}%") },
        if (w.final) Figure("Rain", if (w.precipitationMm > 0) formatRain(w.precipitationMm, units.distance) else "None") else null,
        w.windGustKph?.let { Figure("Gusts", formatWind(it, units.distance)) },
    )
    Slab(if (w.final) "Weather" else "Forecast", tag = "At kickoff") {
        Column(Modifier.semantics(mergeDescendants = true) {}) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                WeatherIcon(w.condition, w.isDay, size = 44.dp)
                FitText(formatTemperature(w.temperatureC, units.temperature), LfType.display(fixedSp(56.dp), colors.onBoardStrong, 0.9.em), Modifier.padding(end = 2.dp), min = 28.sp)
            }
            Text(conditionName(w.condition, w.isDay), style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold), color = colors.text, modifier = Modifier.padding(top = 6.dp))
        }
        Column(Modifier.padding(top = 18.dp)) {
            for (f in figures) SlabRow(f.label, f.value, whole = f.whole)
        }
        SlabRule()
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            RiskBadges(w, units, Modifier.weight(1f).padding(end = 12.dp))
            if (w.risks.isEmpty()) Spacer(Modifier.weight(1f))
            Row(
                Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(4.dp)).clickable(onClickLabel = "Open the details") { details = true }.padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("DETAILS", style = LfType.word(15.sp, colors.text))
                PhIcon(Ph.Chevron, size = 14.dp, tint = colors.text, modifier = Modifier.padding(start = 2.dp))
            }
        }
    }
    if (details) OnPanel {
        ModalBottomSheet({ details = false }, containerColor = colors.surface) {
            WeatherDetails(w, units)
        }
    }
}

/** What Details opens: the facts, hour by hour, the risks spelled out, and the credit (WX-8). */
@Composable
private fun WeatherDetails(w: MatchWeather, units: Units) {
    val context = LocalContext.current
    val hour = DateTimeFormatter.ofPattern(if (android.text.format.DateFormat.is24HourFormat(context)) "HH:mm" else "h a")
    val facts = listOfNotNull(
        w.precipitationChance?.takeIf { !w.final }?.let { "${(it * 100).roundToInt()}% chance of rain" },
        w.precipitationMm.takeIf { it > 0 }?.let { "${formatRain(it, units.distance)} of rain during the match" },
        if (w.precipitationBeforeMm > 0) "${formatRain(w.precipitationBeforeMm, units.distance)} of rain in the 24 hours before" else "No rain in the 24 hours before",
        w.windGustKph?.let { "Gusts to ${formatWind(it, units.distance)}" },
    )
    Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            WeatherIcon(w.condition, w.isDay, size = 34.dp)
            Column {
                Text(if (w.final) "THE WEATHER" else "THE FORECAST", style = MaterialTheme.typography.headlineSmall)
                Text("${formatTemperature(w.temperatureC, units.temperature)} · ${conditionName(w.condition, w.isDay)} at kickoff", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            for (f in facts) Text("· $f", style = MaterialTheme.typography.bodyMedium)
        }
        if (w.hours.size > 1) {
            LfCard {
                Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 12.dp, horizontal = 6.dp)) {
                    for (h in w.hours) {
                        Column(Modifier.width(64.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(instantOf(h.time)?.atZone(ZoneId.systemDefault())?.format(hour) ?: "", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                            WeatherIcon(h.condition, h.isDay, size = 22.dp)
                            Text(formatDegrees(h.temperatureC, units.temperature), fontFamily = BarlowCondensed, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                            Text(
                                if (h.precipitationMm >= 0.1) formatRain(h.precipitationMm, units.distance)
                                else h.precipitationChance?.takeIf { !w.final }?.let { "${(it * 100).roundToInt()}%" } ?: "–",
                                style = MaterialTheme.typography.bodySmall, color = colors.muted,
                            )
                        }
                    }
                }
            }
        }
        if (w.risks.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                for (r in w.risks) {
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        Box(Modifier.width(3.dp).fillMaxHeight().clip(RoundedCornerShape(2.dp)).background(if (r.level == "likely") colors.red else colors.amberText))
                        Column(Modifier.padding(start = 10.dp)) {
                            Text(riskTitle(r), style = MaterialTheme.typography.titleMedium)
                            Text(explainRisk(r, units, w.final), style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = colors.border)
        Text(
            (if (w.final) "The weather when the match was played" else "Forecast updated ${instantOf(w.updatedAt)?.let { timeAgo(it) } ?: ""}; it changes as kickoff gets closer") +
                " · Weather by ${w.source}",
            style = MaterialTheme.typography.bodySmall, color = colors.muted,
        )
    }
}
