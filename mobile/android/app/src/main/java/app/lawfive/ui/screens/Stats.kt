package app.lawfive.ui.screens

import android.os.SystemClock
import android.text.format.DateFormat
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.layout
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.KeptStats
import app.lawfive.data.RING_FULL_PER_HOUR
import app.lawfive.data.RunGame
import app.lawfive.data.axisTicks
import app.lawfive.data.busiestGrid
import app.lawfive.data.describeWatch
import app.lawfive.data.figureAndUnit
import app.lawfive.data.hasBattery
import app.lawfive.data.lightStep
import app.lawfive.data.periodName
import app.lawfive.data.pitchThirds
import app.lawfive.data.platformLabel
import app.lawfive.data.ranks
import app.lawfive.data.rate
import app.lawfive.data.ringShare
import app.lawfive.data.runningStretches
import app.lawfive.data.spacedLabels
import app.lawfive.data.watchCaption
import app.lawfive.data.watchFigure
import app.lawfive.data.watchesShown
import app.lawfive.schema.Stats
import app.lawfive.schema.StatsWatchesModelsItem
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Band
import app.lawfive.ui.components.Board
import app.lawfive.ui.components.BoardColumn
import app.lawfive.ui.components.BoardColumns
import app.lawfive.ui.components.CardKind
import app.lawfive.ui.components.CardShape
import app.lawfive.ui.components.ElbowBar
import app.lawfive.ui.components.Halfway
import app.lawfive.ui.components.HeadToHead
import app.lawfive.ui.components.Line
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.MintBar
import app.lawfive.ui.components.PagePad
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Refresh
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.Segmented
import app.lawfive.ui.components.Share
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.SlabCut
import app.lawfive.ui.components.SlabFigure
import app.lawfive.ui.components.SlabGround
import app.lawfive.ui.components.SlabLabel
import app.lawfive.ui.components.SlantBar
import app.lawfive.ui.components.SlantBars
import app.lawfive.ui.components.TabCut
import app.lawfive.ui.components.Touchline
import app.lawfive.ui.components.bleed
import app.lawfive.ui.components.boardSurface
import app.lawfive.ui.components.fixedSp
import app.lawfive.ui.components.slantShape
import app.lawfive.ui.formatDistance
import app.lawfive.ui.formatSpeed
import app.lawfive.ui.formatTemperature
import app.lawfive.ui.money
import app.lawfive.ui.surname
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.Mono
import app.lawfive.ui.theme.OnBoard
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.roundToInt

// The Stats tab on the phone (STAT-13, STAT-14, STAT-15), in the website's broadcast stats package
// (WEB-24, the owner's choice on 2026-11-08), from the same GET /v1/stats: the filters on one board
// (When and Role), the games as a huge chalk figure, the roles as slabs as long as their counts, the
// distance on a slab cut on the diagonal, the cards rising out of a slab, the fees, the games a month
// as lamps, who you work with most as a name strap, the ticker and where on the pitch; then In detail
// on the halfway line: the running (distance by role, longest and shortest, the running total as a
// track, fitness, your watches), the fixtures (busiest times turned, where, the weather and its
// records) and the games (age groups, the referees you work with, year by year). As STAT-14 has it,
// the phones leave out added time, discipline's charts and codes, the fees by month and fitness game
// by game; Full stats at the end opens the website. The last answer for each set of filters is kept,
// so it shows without signal, saying when it's from. The arithmetic is the website's
// (data/StatsMath.kt); the slab and its graphics are components (Slab.kt, BoardCharts.kt).

/** "When": all time, the last 12 months, or a year. */
internal fun statsQuery(time: String, role: String?, today: LocalDate): String {
    val parts = mutableListOf<String>()
    when {
        time == "12m" -> parts += "from=${today.minusYears(1).plusDays(1)}"
        time.matches(Regex("\\d{4}")) -> parts += listOf("from=$time-01-01", "to=$time-12-31")
    }
    if (role != null) parts += "role=$role"
    return parts.joinToString("&")
}

/** "25%", a share, rounded. */
internal fun percent(part: Long, whole: Long): String = "${if (whole == 0L) 0 else (part * 100.0 / whole).roundToInt()}%"

/** Temperature bands of 10 °F or 5 °C, as the website's (each band's start, and how many games). */
internal fun temperatureBands(celsius: List<Double>, fahrenheit: Boolean): List<Pair<Int, Int>> {
    if (celsius.isEmpty()) return emptyList()
    val width = if (fahrenheit) 10 else 5
    val values = celsius.map { if (fahrenheit) it * 9 / 5 + 32 else it }
    val band = { v: Double -> Math.floorDiv(kotlin.math.floor(v).toInt(), width) * width }
    return (band(values.min())..band(values.max()) step width).map { b -> b to values.count { band(it) == b } }
}

/** The speed each band starts at, for a sprint speed (TRK-11), as the schema's speedBandsFor. */
private fun bandStarts(sprintKph: Double) = listOf(0.0, 7.0, 13.0, 18.0, 21.0).map { it * sprintKph / 21.0 }

private val bandNames = mapOf("walking" to "Walking", "jogging" to "Jogging", "running" to "Running", "highSpeed" to "High speed", "sprinting" to "Sprinting")
private val roleWords = mapOf("referee" to "Referee", "assistant" to "Assistant", "fourth" to "Fourth official")

/** What every section is given. */
private class Ctx(
    val s: Stats,
    val unit: String,
    val temperature: String,
    val time: String,
    val open: (String) -> Unit,
    val settings: () -> Unit,
    val h24: Boolean,
)

@Composable
fun StatsScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val session by graph.session.state.collectAsStateWithLifecycle()
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    var time by rememberSaveable { mutableStateOf("all") }
    var role by rememberSaveable { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    val query = statsQuery(time, role, java.time.LocalDate.now(app.lawfive.data.AppClock.clock()))
    var shown by remember { mutableStateOf<KeptStats?>(null) }
    var shownFor by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    LaunchedEffect(query, reload) {
        loading = true
        failed = false
        graph.stats.kept(query)?.let { shown = it; shownFor = query }
        try {
            shown = graph.stats.fetch(query)
            shownFor = query
        } catch (_: Exception) {
            failed = true
        }
        loading = false
    }
    val data = shown?.stats
    // Another filter's numbers stay up, faded, while these come (as the website's).
    val stale = shownFor != query
    val status = if (failed && shown != null && !stale) "Offline · from ${shortWhen(shown!!.at)}" else null
    // Sections rise in once as the page arrives; nothing moves after that (WEB-24's motion).
    var arrived by remember { mutableLongStateOf(0L) }
    LaunchedEffect(data != null) { if (data != null && arrived == 0L) arrived = SystemClock.uptimeMillis() }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // The keys in the order they're laid out, so In detail's links can scroll to their parts.
    val order = remember { mutableListOf<String>() }
    val jump = { key: String -> order.indexOf(key).takeIf { it >= 0 }?.let { scope.launch { list.animateScrollToItem(it + 1) } }; Unit }
    val h24 = DateFormat.is24HourFormat(context)
    Screen("Stats", sub = data?.let { describeRange(it) }, status = status, hero = true, refresh = Refresh(loading && shown != null) { reload++ }, state = list) {
        order.clear()
        fun section(key: String, top: Dp = 52.dp, content: @Composable () -> Unit) {
            order += key
            item(key = key) {
                Rise(arrived) { Box(Modifier.padding(top = top).alpha(if (stale) 0.6f else 1f)) { content() } }
            }
        }
        order += "filters"
        item(key = "filters") { Filters(time, role, data?.options?.years ?: emptyList(), { time = it }, { role = it }) }
        when {
            data == null && loading -> item(key = "placeholder") { Placeholder() }
            data == null || (failed && stale) -> item(key = "unreachable") {
                LfCard(Modifier.padding(top = 16.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Can't reach your server", style = MaterialTheme.typography.titleMedium)
                        Text("There are no stats for these filters on this phone yet. Pull down to try again once you have a connection.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                    }
                }
            }
            data.games.total == 0L -> item(key = "none") {
                LfCard(Modifier.padding(top = 16.dp)) {
                    Text(
                        if (data.options.years.isEmpty()) "Stats appear here once you've refereed some matches." else "No games match these filters.",
                        style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp),
                    )
                }
            }
            else -> {
                val x = Ctx(data, settings?.distanceUnit ?: "mi", settings?.temperatureUnit ?: "f", time, { nav.navigate(it) }, { nav.navigate("settings") }, h24)
                val s = data
                section("headline", top = 36.dp) { Headline(s) }
                section("roles", top = 44.dp) { RoleSlabs(s) }
                section("distance") { DistanceSlab(x) }
                section("cards", top = 56.dp) { CardsShown(s) }
                section("fees") { FeesSlab(s) }
                section("months") { MonthsSlab(s) }
                if (s.referees.top.isNotEmpty()) section("most", top = 44.dp) { MostWith(x) }
                section("ticker") { Ticker(x) }
                if (!s.fitness.heatmaps.isNullOrEmpty()) section("pitch") { WhereOnThePitch(x) }
                section("detail", top = 72.dp) { InDetailHead(jump) }
                section("running", top = 12.dp) { PartTitle("The running") }
                section("byRole", top = 28.dp) { DistanceByRole(x) }
                if (s.distance.longest != null && s.distance.shortest != null && s.distance.games >= 2) section("tape") { LongestShortest(x) }
                if (s.distance.overTime.isNotEmpty()) section("overTime") { DistanceOverTime(x) }
                if (s.fitness.games.isNotEmpty()) section("fitness") { Fitness(x) }
                if (watchesShown(s.watches).isNotEmpty()) section("watches") { Watches(s) }
                section("fixtures", top = 44.dp) { PartTitle("The fixtures") }
                if (s.busiest.isNotEmpty()) section("busiest", top = 28.dp) { Busiest(x) }
                section("places", top = if (s.busiest.isNotEmpty()) 52.dp else 28.dp) { Places(x) }
                section("weather") { WeatherSlab(x) }
                if (s.weather.temperaturesC.isNotEmpty()) section("temperature") { Temperatures(x) }
                if (s.weather.hottest != null || s.weather.coldest != null || s.weather.windiest != null) section("records", top = 36.dp) { Records(x) }
                if (s.ageGroups.isNotEmpty() || s.referees.top.isNotEmpty() || s.years.size >= 2) section("games", top = 44.dp) { PartTitle("The games") }
                if (s.ageGroups.isNotEmpty()) section("ages", top = 28.dp) { AgeGroups(s) }
                if (s.referees.top.isNotEmpty()) section("referees", top = 56.dp) { RefereeStraps(x) }
                if (s.years.size >= 2) section("years") { Years(x) }
            }
        }
        order += "website"
        item(key = "website") {
            Column(Modifier.padding(top = 36.dp)) {
                SectionTitle("On the website")
                LfCard {
                    ListRow("Full stats", "Added time, more filters, tables and the CSV", leading = { app.lawfive.ui.components.Avatar(icon = Ph.Stats) }, divider = false,
                        onClick = { openWebsite(context, session.server, "/stats") }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                }
            }
        }
    }
}

/**
 * Lays out a big figure's line as tall as its digits (about 0.7 em) and a little for its offset, as the
 * website's 0.8 line height does, rather than the font's whole ascent, which leaves a gap over it.
 */
private fun Modifier.capHeight(fontSize: Dp) = layout { measurable, constraints ->
    val p = measurable.measure(constraints)
    val baseline = p[androidx.compose.ui.layout.FirstBaseline]
    if (baseline == androidx.compose.ui.layout.AlignmentLine.Unspecified) return@layout layout(p.width, p.height) { p.place(0, 0) }
    // Barlow Condensed's figures stand about 0.7 of the size.
    val size = fontSize.toPx()
    val top = (baseline - size * 0.72f).toInt()
    val height = (size * 0.78f).toInt()
    layout(p.width, height) { p.place(0, -top) }
}

/** A section rises in once if it's there as the page arrives; later ones (and anyone with animations off) just show. */
@Composable
private fun Rise(arrived: Long, content: @Composable () -> Unit) {
    val fresh = remember { arrived == 0L || SystemClock.uptimeMillis() - arrived < 700 }
    val progress = remember { Animatable(if (fresh) 0f else 1f) }
    LaunchedEffect(Unit) { if (fresh) progress.animateTo(1f, tween(450, easing = CubicBezierEasing(0.2f, 0.7f, 0.2f, 1f))) }
    Box(Modifier.graphicsLayer { alpha = progress.value; translationY = (1 - progress.value) * 16.dp.toPx() }) { content() }
}

private val dayFormat get() = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.getDefault())

/** "Aug 17 – Nov 3, 2026", or one day. */
private fun span(s: Stats): String? {
    val first = s.games.first?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    val last = s.games.last?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    return when {
        first == last -> first.format(dayFormat)
        first.year == last.year -> "${first.format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))} – ${last.format(dayFormat)}"
        else -> "${first.format(dayFormat)} – ${last.format(dayFormat)}"
    }
}

/** "13 games · Aug 17 – Nov 3, 2026 · 1 abandoned" under the title. */
private fun describeRange(s: Stats): String =
    listOfNotNull("${s.games.total} ${if (s.games.total == 1L) "game" else "games"}", span(s), if (s.games.abandoned > 0) "${s.games.abandoned} abandoned" else null).joinToString(" · ")

/** When a kept answer came: "9:40 AM" today, else "Nov 1". */
private fun shortWhen(iso: String): String {
    val t = runCatching { Instant.parse(iso).atZone(ZoneId.systemDefault()) }.getOrNull() ?: return "earlier"
    return if (t.toLocalDate() == java.time.LocalDate.now(app.lawfive.data.AppClock.clock())) t.format(DateTimeFormatter.ofPattern("h:mm a", Locale.getDefault())) else t.format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault()))
}

/** "Tue, Nov 3". */
private fun shortDay(iso: String): String = runCatching { ZonedDateTime.parse(iso).withZoneSameInstant(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault())) }.getOrDefault("")

/** "40 s", or "12 min", as the website's. */
private fun duration(sec: Double): String = if (sec < 59.5) "${sec.roundToInt()} s" else "${(sec / 60).roundToInt()} min"

private fun plural(n: Long, one: String, many: String = "${one}s") = "$n ${if (n == 1L) one else many}"

/** The filters on one board (STAT-13): When and Role, each with its small mint label over its control, which scrolls across. */
@Composable
private fun Filters(time: String, role: String?, years: List<Long>, onTime: (String) -> Unit, onRole: (String?) -> Unit) {
    val choices = listOf("all" to "All time", "12m" to "Last 12 months") + years.map { "$it" to "$it" }
    Board(Modifier.padding(top = 4.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            FilterRow("When") { Segmented(choices, time, onTime, background = colors.boardDots, minHeight = 48.dp) }
            FilterRow("Role") {
                Segmented(listOf<Pair<String?, String>>(null to "All", "referee" to "Referee", "assistant" to "Assistant", "fourth" to "Fourth"), role, onRole, background = colors.boardDots, minHeight = 48.dp)
            }
        }
    }
}

@Composable
private fun FilterRow(label: String, control: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label.uppercase(), style = LfType.label(11.5.sp, colors.boardAccent), modifier = Modifier.semantics { heading() })
        Box(Modifier.horizontalScroll(rememberScrollState())) { control() }
    }
}

/** The filters board's shape, the headline and two slabs as faint shapes while the stats first load (WEB-8), after 0.3 s. */
@Composable
private fun Placeholder() {
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay(300); show = true }
    val grass = colors.chalk.copy(alpha = 0.14f)
    val bar = @Composable { color: Color, width: Float, height: Dp -> Box(Modifier.fillMaxWidth(width).height(height).clip(RoundedCornerShape(4.dp)).background(color)) }
    Column(Modifier.padding(top = 36.dp).alpha(if (show) 1f else 0f).semantics { contentDescription = "Loading the stats" }, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        bar(grass, 0.5f, 14.dp)
        bar(grass, 0.45f, 150.dp)
        for (i in 0..1) {
            Board(Modifier.padding(top = 38.dp)) {
                OnBoard {
                    val faint = colors.onBoard.copy(alpha = 0.12f)
                    Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) { bar(faint, 0.3f, 12.dp); bar(faint, 1f, 150.dp) }
                }
            }
        }
    }
}

/** The games, a huge chalk figure on the grass with the hero offset and a mint bar under it, the dates they span over it. */
@Composable
private fun Headline(s: Stats) {
    val c = colors
    val total = s.games.total
    val density = LocalDensity.current
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        span(s)?.let { Text(it.uppercase(), style = LfType.label(13.sp, c.chalkMuted, 0.16f)) }
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val screen = LocalConfiguration.current.screenWidthDp.dp
            val digits = total.toString().length
            val size = minOf(300.dp, screen * 0.46f, maxWidth / (digits * 0.56f))
            val sp = fixedSp(size)
            // The hero offset: 0.035 em in dark green by day, mint 3 by 2 at night (on phones).
            val offset = with(density) { if (!c.dark) Offset(size.toPx() * 0.035f, size.toPx() * 0.035f) else Offset(3.dp.toPx(), 2.dp.toPx()) }
            Text(
                "$total", style = LfType.display(sp, c.chalk, sp * 0.8f).copy(
                    letterSpacing = (-0.02).em, shadow = Shadow(c.heroShadow, offset, 0f),
                    lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(androidx.compose.ui.text.style.LineHeightStyle.Alignment.Bottom, androidx.compose.ui.text.style.LineHeightStyle.Trim.Both),
                ),
                modifier = Modifier.padding(top = 14.dp, end = 8.dp).capHeight(size), maxLines = 1, softWrap = false,
            )
        }
        MintBar(Modifier.padding(top = 16.dp), fraction = 0.72f, max = 286.dp)
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.Bottom) {
            Text(if (total == 1L) "GAME" else "GAMES", style = LfType.display(38.sp, c.chalk, 38.sp), modifier = Modifier.padding(end = 2.dp))
            Text(if (s.games.abandoned > 0) "${s.games.abandoned} abandoned" else "all completed", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 17.sp), color = c.chalkMuted, modifier = Modifier.padding(bottom = 3.dp))
        }
    }
}

/**
 * STAT-3: the games by role as slabs on the grass, each as long as its count, its name on a board
 * tile and its figure after it; the assistant's split into AR1 and AR2 inside it, written under the name.
 */
@Composable
private fun RoleSlabs(s: Stats) {
    val c = colors
    val r = s.roles
    data class RoleRow(val label: String, val value: Long, val parts: List<Pair<Long, Color>>, val split: String?)
    val rows = listOfNotNull(
        RoleRow("Referee", r.referee, listOf(r.referee to c.chalk), null),
        // Each count kept with its AR, so a narrow tile never leaves a figure on a line alone.
        RoleRow("Assistant", r.ar1 + r.ar2, listOf(r.ar1 to c.boardAccent, r.ar2 to c.roleAr2), if (r.ar1 + r.ar2 > 0) "AR1\u00A0${r.ar1} · AR2\u00A0${r.ar2}" else null),
        RoleRow("4th official", r.fourth, listOf(r.fourth to c.roleFourth), null),
        if (r.notSet > 0) RoleRow("Not set", r.notSet, listOf(r.notSet to c.roleNone), null) else null,
    )
    val most = rows.maxOf { it.value }.coerceAtLeast(1)
    Slab("By role", tag = "Counted in games", ground = SlabGround.Grass) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (row in rows) {
                val words = "${row.label}: ${plural(row.value, "game")}${row.split?.let { ", ${it.replace(" · ", " and ")}" } ?: ""}"
                BoxWithConstraints(Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = words }) {
                    val track = maxWidth - 134.dp + 14.dp
                    val barMax = track - 62.dp
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 54.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(
                            Modifier.width(134.dp).fillMaxHeight().boardSurface(slantShape(right = TabCut)).padding(start = 12.dp, end = 24.dp, top = 5.dp, bottom = 5.dp),
                            verticalArrangement = Arrangement.Center,
                        ) {
                            Text(row.label.uppercase(), style = LfType.word(15.sp, c.onBoard).copy(letterSpacing = 0.06.em, lineHeight = 16.sp))
                            row.split?.let { Text(it, style = LfType.label(10.5.sp, c.boardAccent, 0.04f), modifier = Modifier.padding(top = 4.dp)) }
                        }
                        Row(Modifier.offset(x = (-14).dp).fillMaxHeight(), verticalAlignment = Alignment.CenterVertically) {
                            if (row.value > 0) {
                                val width = maxOf(24.dp, barMax * (row.value.toFloat() / most))
                                RoleBar(row.parts, Modifier.width(width).fillMaxHeight())
                            }
                            Text(
                                "${row.value}", style = LfType.display(fixedSp(42.dp), c.chalk, fixedSp(42.dp)), maxLines = 1, softWrap = false,
                                modifier = Modifier.padding(start = if (row.value > 0) 8.dp else 30.dp, end = 4.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

/** A role's bar: its parts as slanted slabs, each cut on both sides and overlapping on the diagonal. */
@Composable
private fun RoleBar(parts: List<Pair<Long, Color>>, modifier: Modifier) {
    val shown = parts.filter { it.first > 0 }
    Canvas(modifier) {
        val cut = 18.dp.toPx()
        val overlap = 14.dp.toPx()
        val least = 24.dp.toPx()
        val room = size.width + overlap * (shown.size - 1)
        val total = shown.sumOf { it.first }.toFloat()
        val widths = shown.map { max(least, it.first / total * room) }.toMutableList()
        val over = widths.sum() - room
        if (over > 0 && widths.isNotEmpty()) widths[widths.indices.maxBy { widths[it] }] -= over
        var x = 0f
        shown.forEachIndexed { i, (_, color) ->
            val w = widths[i]
            val path = Path().apply { moveTo(x + cut, 0f); lineTo(x + w, 0f); lineTo(x + w - cut, size.height); lineTo(x, size.height); close() }
            drawPath(path, color)
            x += w - overlap
        }
    }
}

/** The distance run on a slab cut on the diagonal: the total huge, then a game's and how many were tracked. */
@Composable
private fun DistanceSlab(x: Ctx) {
    val d = x.s.distance
    val has = d.games > 0
    Slab("Distance", icon = Ph.Distance, cut = true) {
        SlabLabel("Total run")
        SlabFigure(if (has) formatDistance(d.totalM, x.unit) else "—", 72.dp, Modifier.padding(top = 10.dp))
        MintBar(Modifier.padding(top = 12.dp))
        if (!has) Text("No distances in these games yet.", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(top = 14.dp))
        Row(Modifier.padding(top = 26.dp).fillMaxWidth().height(IntrinsicSize.Min)) {
            // STAT-16: the one per-game distance, the server's.
            SlabCell("A game", if (has) formatDistance(d.averageM ?: (d.totalM / d.games), x.unit) else "—", if (has) "from ${d.games} of ${x.s.games.total} games" else "no distances yet", Modifier.weight(1f))
            Box(Modifier.width(2.dp).fillMaxHeight().background(colors.border))
            SlabCell("Tracked", "${d.tracked}", "${if (d.tracked == 1L) "game" else "games"} with a track", Modifier.weight(1f).padding(start = 20.dp))
        }
    }
}

/** A figure in a cell of a slab: a quiet label, the figure, a line under. */
@Composable
private fun SlabCell(label: String, figure: String, caption: String, modifier: Modifier) {
    Column(modifier.padding(end = 8.dp).semantics(mergeDescendants = true) {}) {
        SlabLabel(label, quiet = true)
        SlabFigure(figure, 44.dp, Modifier.padding(top = 8.dp))
        Text(caption, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = colors.text, modifier = Modifier.padding(top = 8.dp))
    }
}

/** A heading on the grass with a line under it ("Cards shown"). */
@Composable
private fun GrassHead(title: String, sub: String?) {
    Column {
        Text(title.uppercase(), style = LfType.display(40.sp, colors.chalk, 36.sp), modifier = Modifier.padding(end = 4.dp).semantics { heading() })
        if (sub != null) Text(sub, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), color = colors.chalkMuted, modifier = Modifier.padding(top = 8.dp))
    }
}

/** WEB-24: the cards shown, three large cards rising out of a board slab cut on the diagonal, each with its count and rate; a fourth for sin bins when there were any (EVT-12). */
@Composable
private fun CardsShown(s: Stats) {
    val d = s.discipline
    val c = colors
    Column {
        GrassHead("Cards shown", if (d.games > 0) "From ${plural(d.games, "match report")}" else null)
        if (d.games == 0L) {
            Text("No match reports in these games, so no cards to count.", style = MaterialTheme.typography.bodyMedium, color = c.chalkMuted, modifier = Modifier.padding(top = 12.dp))
            return@Column
        }
        val items = listOf(
            Triple(CardKind.Yellow, d.cautions, (if (d.cautions == 1L) "Caution" else "Cautions") to "${rate(d.cautions, d.games)} a game"),
            Triple(CardKind.Red, d.sendOffs, (if (d.sendOffs == 1L) "Send-off" else "Send-offs") to "${rate(d.sendOffs, d.games)} a game"),
            Triple(CardKind.Second, d.secondCautions, (if (d.secondCautions == 1L) "Second caution" else "Second cautions") to "Counted in both"),
        ) + listOfNotNull(d.sinBins?.takeIf { it > 0 }?.let { n -> Triple(CardKind.SinBin, n, (if (n == 1L) "Sin bin" else "Sin bins") to "${rate(n, d.games)} a game") })
        // Four cards a step smaller, so they fit a phone's width.
        val narrow = LocalConfiguration.current.screenWidthDp <= 380
        val step = (if (narrow) 1 else 0) + (if (items.size > 3) 1 else 0)
        val cardWidth = listOf(82.dp, 64.dp, 52.dp)[step]
        val cardHeight = listOf(112.dp, 88.dp, 72.dp)[step]
        val figure = listOf(50.dp, 44.dp, 38.dp)[step]
        val rise = listOf(84.dp, 66.dp, 54.dp)[step]
        val words = items.joinToString("; ") { (_, n, w) -> "$n ${w.first.lowercase()}, ${w.second}" }
        Box(Modifier.padding(top = 18.dp).fillMaxWidth().clearAndSetSemantics { contentDescription = "Cards shown: $words" }) {
            Box(Modifier.matchParentSize().padding(top = rise).boardSurface(slantShape(right = SlabCut)))
            Row(Modifier.fillMaxWidth().padding(end = SlabCut + 4.dp, bottom = 26.dp)) {
                items.forEach { (kind, n, w) ->
                    Column(Modifier.weight(1f).padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        CardShape(kind, cardWidth, cardHeight)
                        OnBoard {
                            Text("$n", style = LfType.display(fixedSp(figure), colors.onBoardStrong, fixedSp(46.dp)), modifier = Modifier.padding(top = 14.dp, end = 3.dp), maxLines = 1)
                            app.lawfive.ui.components.WordFitText(w.first.uppercase(), LfType.word(14.sp, colors.onBoard).copy(letterSpacing = 0.04.em, lineHeight = 1.07.em), Modifier.padding(top = 8.dp), textAlign = TextAlign.Center)
                            app.lawfive.ui.components.WordFitText(w.second.uppercase(), LfType.label(10.sp, colors.boardAccent, 0.06f), Modifier.padding(top = 4.dp), textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
}

/** STAT-6, STAT-14: the fees: earned huge, paid against owed head to head, the note on other currencies and the competitions as slanted bars. */
@Composable
private fun FeesSlab(s: Stats) {
    val f = s.fees
    val currency = f.currency
    val c = colors
    Slab("Fees", icon = Ph.Money) {
        if (f.games == 0L || currency == null) {
            Text("No fees in these games${currency?.let { " in $it" } ?: ""}.", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = colors.muted)
            if (f.otherCurrencies.isNotEmpty()) {
                Text("${f.otherCurrencies.joinToString(", ") { "${it.games} in ${it.currency}" }}: change the currency in Settings to see them.", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(top = 12.dp))
            }
            return@Slab
        }
        val m = { amount: Double -> money(amount, currency) }
        SlabLabel("Earned")
        SlabFigure(m(f.earnedAmount), 64.dp, Modifier.padding(top = 10.dp))
        MintBar(Modifier.padding(top = 12.dp))
        Text("${m(f.earnedAmount / f.games)} a game · ${plural(f.games, "game")} with a fee in $currency", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(top = 10.dp))
        Column(Modifier.padding(top = 30.dp).fillMaxWidth().clearAndSetSemantics { contentDescription = "Paid ${m(f.paidAmount)}, owed ${m(f.owedAmount)}" }) {
            Row(Modifier.fillMaxWidth()) {
                Text("PAID", style = LfType.label(12.sp, c.onBoard), modifier = Modifier.weight(1f))
                Text(if (f.owedAmount > 0) "OWED" else "ALL PAID", style = LfType.label(12.sp, c.boardAccent))
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.Bottom) {
                SlabFigure(m(f.paidAmount), 38.dp, Modifier.weight(1f))
                if (f.owedAmount > 0) SlabFigure(m(f.owedAmount), 38.dp, color = c.boardAccent)
            }
            HeadToHead(listOf(Share(f.paidAmount, c.chalk), Share(f.owedAmount, c.boardAccent)), Modifier.padding(top = 10.dp))
        }
        if (f.otherCurrencies.isNotEmpty()) {
            Text("Not included: ${f.otherCurrencies.joinToString(", ") { "${money(it.amount, it.currency)} from ${plural(it.games, "game")}" }}.", style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.5.sp), color = colors.muted, modifier = Modifier.padding(top = 16.dp))
        }
        if (f.competitions.isNotEmpty()) {
            Box(Modifier.padding(top = 26.dp).fillMaxWidth().height(2.dp).background(c.border))
            SlabLabel("By competition", Modifier.padding(top = 22.dp, bottom = 8.dp))
            SlantBars(f.competitions.map { SlantBar(it.name, it.amount, m(it.amount), c.chalk) })
        }
    }
}

/**
 * STAT-3, STAT-14: the games a month for the newest 12 months the filters have, as a form guide: a
 * row a month, a lamp a game in its role's color and unlit lamps up to the busiest month (one bar of
 * the roles past 24 in a month).
 */
@Composable
private fun MonthsSlab(s: Stats) {
    val c = colors
    val months = s.months.takeLast(12)
    data class Role(val label: String, val color: Color, val of: (app.lawfive.schema.StatsMonthsItem) -> Long)
    val roles = listOf(
        Role("Referee", c.chalk) { it.referee }, Role("Assistant", c.boardAccent) { it.assistant },
        Role("Fourth", c.roleFourth) { it.fourth }, Role("Not set", c.roleNone) { it.notSet },
    )
    val used = roles.filter { r -> months.any { r.of(it) > 0 } }
    val total = { m: app.lawfive.schema.StatsMonthsItem -> roles.sumOf { it.of(m) } }
    val most = months.maxOfOrNull(total)?.coerceAtLeast(1) ?: 1
    val lamps = most <= 24
    val thisMonth = java.time.YearMonth.now(app.lawfive.data.AppClock.clock()).toString()
    Slab("Games a month", tag = if (lamps) "Each light is one game" else null) {
        if (s.months.size > 12) Text("The newest 12 months", style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.padding(bottom = 8.dp))
        if (used.size > 1) Legend(used.map { it.label to it.color })
        Column(Modifier.padding(top = 6.dp)) {
            months.forEachIndexed { i, m ->
                val ym = YearMonth.parse(m.month)
                val sum = total(m)
                val soFar = m.month == thisMonth
                val words = "${ym.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault()))}${if (soFar) " so far" else ""}: ${plural(sum, "game")}" +
                    if (used.size > 1) ", " + used.filter { it.of(m) > 0 }.joinToString(", ") { "${it.of(m)} as ${it.label.lowercase()}" } else ""
                if (i > 0) Box(Modifier.fillMaxWidth().height(2.dp).background(c.border))
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(vertical = 6.dp).clearAndSetSemantics { contentDescription = words },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Column(Modifier.width(46.dp)) {
                        Text(ym.format(DateTimeFormatter.ofPattern("MMM", Locale.getDefault())).uppercase(), style = LfType.word(18.sp, c.onBoard).copy(letterSpacing = 0.08.em), maxLines = 1, softWrap = false)
                        if (i == 0 || ym.monthValue == 1) Text("${ym.year}", style = LfType.label(10.sp, c.onBoardMuted, 0.08f), modifier = Modifier.padding(top = 3.dp))
                    }
                    BoxWithConstraints(Modifier.weight(1f)) {
                        val lit = used.flatMap { r -> List(r.of(m).toInt()) { r.color } }
                        if (lamps) {
                            val gap = 3.dp
                            val lamp = minOf(30.dp, (minOf(maxWidth, 34.dp * most.toInt()) - gap * (most.toInt() - 1)) / most.toInt())
                            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                                repeat(most.toInt()) { k -> Box(Modifier.width(lamp).height(26.dp).background(lit.getOrNull(k) ?: c.boardDots)) }
                            }
                        } else {
                            Row(Modifier.fillMaxWidth().height(26.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                used.forEach { r -> if (r.of(m) > 0) Box(Modifier.weight(r.of(m).toFloat()).fillMaxHeight().background(r.color)) }
                                if (most - sum > 0) Box(Modifier.weight((most - sum).toFloat()).fillMaxHeight().background(c.boardDots))
                            }
                        }
                    }
                    Column(Modifier.widthIn(min = 40.dp)) {
                        Text("$sum", style = LfType.display(fixedSp(30.dp), c.onBoardStrong, fixedSp(30.dp)), modifier = Modifier.padding(end = 2.dp))
                        if (soFar) Text("so far", style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, lineHeight = 11.sp), color = c.onBoardMuted)
                    }
                }
            }
        }
    }
}

/** A board's legend: a swatch and a small mono name each. */
@Composable
private fun Legend(items: List<Pair<String, Color>>) {
    @OptIn(ExperimentalLayoutApi::class)
    FlowRow(Modifier.padding(bottom = 4.dp).clearAndSetSemantics {}, horizontalArrangement = Arrangement.spacedBy(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for ((label, color) in items) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(10.dp).background(color))
                Text(label.uppercase(), style = LfType.label(11.sp, colors.muted, 0.1f))
            }
        }
    }
}

/** Who you work with most, as a broadcast's name strap: a mint tag, the surname on chalk, the games together on a strip of the board; a saved referee opens their page. */
@Composable
private fun MostWith(x: Ctx) {
    val most = x.s.referees.top.first()
    val c = colors
    val last = surname(most.name).ifEmpty { most.name }
    val go = most.refereeId?.let { id -> { x.open("referee/$id") } }
    Column(
        Modifier.widthIn(max = 520.dp).fillMaxWidth()
            .then(if (go != null) Modifier.clickable(onClickLabel = "Open ${most.name}", onClick = go) else Modifier)
            .clearAndSetSemantics { contentDescription = "Most with ${most.name}: ${plural(most.games, "game")} together" },
    ) {
        Box(Modifier.height(32.dp).clip(slantShape(right = 14.dp)).background(c.boardAccent).padding(start = 16.dp, end = 30.dp), contentAlignment = Alignment.CenterStart) {
            Text("MOST WITH", style = LfType.label(12.sp, c.board, 0.14f))
        }
        Box(Modifier.fillMaxWidth().clip(slantShape(right = 24.dp)).background(c.chalk).padding(start = 20.dp, end = 44.dp, top = 10.dp, bottom = 6.dp)) {
            Text(last.uppercase(), style = LfType.display(fixedSp(48.dp), c.board, fixedSp(46.dp)), modifier = Modifier.padding(end = 4.dp))
        }
        Row(
            Modifier.padding(start = 18.dp).fillMaxWidth().heightIn(min = 48.dp).boardSurface(slantShape(right = 18.dp)).padding(start = 18.dp, end = 34.dp, top = 8.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OnBoard {
                Column(Modifier.weight(1f)) {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontWeight = FontWeight.Black, fontSize = 28.sp, color = colors.onBoardStrong)) { append("${most.games}") }
                            append(" ${if (most.games == 1L) "GAME" else "GAMES"} TOGETHER")
                        },
                        style = LfType.word(16.sp, colors.onBoard).copy(letterSpacing = 0.06.em),
                    )
                    if (last != most.name) Text(most.name, style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), color = colors.onBoardMuted)
                }
                if (go != null) PhIcon(Ph.Open, size = 20.dp, tint = colors.onBoard)
            }
        }
    }
}

/** The small figures on a strip of the board from touchline to touchline: goals, referees worked with and pitches, under the period's mint tab. It stays still. */
@Composable
private fun Ticker(x: Ctx) {
    val d = x.s.discipline
    val items = listOfNotNull(
        if (d.games > 0) Triple("Goals", d.goals, "${rate(d.goals, d.games)} a game") else null,
        Triple("Referees", x.s.referees.count, "worked with"),
        Triple("Pitches", x.s.places.pitches, "at ${plural(x.s.places.venues, "venue")}"),
    )
    val period = periodName(x.time)
    val c = colors
    Column(
        Modifier.fillMaxWidth().bleed(PagePad - Touchline - Line).background(c.board)
            .then(if (c.dark) Modifier.border(1.dp, c.boardEdge) else Modifier)
            .clearAndSetSemantics { contentDescription = "$period: " + items.joinToString("; ") { (l, v, sub) -> "$l $v, $sub" } },
    ) {
        Box(Modifier.heightIn(min = 36.dp).clip(slantShape(right = 22.dp)).background(c.boardAccent).padding(start = 10.dp, end = 48.dp, top = 6.dp, bottom = 6.dp), contentAlignment = Alignment.CenterStart) {
            Text(period.uppercase(), style = LfType.display(20.sp, c.board, 20.sp), modifier = Modifier.padding(end = 2.dp))
        }
        OnBoard {
            val divider = colors.kitBlank
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 14.dp)) {
                items.forEachIndexed { i, (label, value, sub) ->
                    if (i > 0) Canvas(Modifier.width(10.dp).fillMaxHeight().padding(vertical = 6.dp)) {
                        val skew = size.height * 0.16f
                        drawPath(Path().apply { moveTo(skew + 2.dp.toPx(), 0f); lineTo(skew + 5.dp.toPx(), 0f); lineTo(5.dp.toPx() - 2.dp.toPx(), size.height); lineTo(0f, size.height); close() }, divider)
                    }
                    Column(Modifier.weight(1f).padding(start = if (i > 0) 8.dp else 0.dp, end = 6.dp, top = 6.dp, bottom = 6.dp)) {
                        app.lawfive.ui.components.WordFitText(label.uppercase(), LfType.label(12.sp, colors.boardAccent, 0.14f), min = 7.sp)
                        Text("$value", style = LfType.display(fixedSp(40.dp), colors.onBoardStrong, fixedSp(40.dp)), modifier = Modifier.padding(top = 4.dp, end = 3.dp))
                        Text(sub, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), color = colors.onBoardMuted, modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
        }
    }
}

/** TRK-9: where the periods were spent across the games with GPS, on its slab: Referee or Assistant, the heatmap, and the time in each third lined up with the pitch. */
@Composable
private fun WhereOnThePitch(x: Ctx) {
    val maps = x.s.fitness.heatmaps.orEmpty()
    var role by rememberSaveable { mutableStateOf(maps.first().role) }
    val heat = maps.firstOrNull { it.role == role } ?: maps.first()
    val games = plural(heat.games, "game")
    val asRole = if (heat.role == "referee") "as referee" else "as an assistant"
    val thirds = pitchThirds(heat.cells, heat.cols.toInt(), heat.rows.toInt())
    val c = colors
    Slab("Where on the pitch", tag = "From above") {
        Text("$games with GPS $asRole".uppercase(), style = LfType.display(24.sp, c.onBoardStrong, 24.sp), modifier = Modifier.padding(end = 2.dp))
        Text(
            if (heat.role == "assistant") "The periods, your touchline at the bottom." else "The periods; with the kickoff direction from the watch, the first kickoff team attacks left to right.",
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = c.muted, modifier = Modifier.padding(top = 8.dp),
        )
        if (maps.size > 1) {
            Segmented(maps.map { it.role to if (it.role == "referee") "Referee" else "Assistant" }, heat.role, { role = it }, Modifier.padding(top = 16.dp).fillMaxWidth(), background = c.boardDots, minHeight = 48.dp, fill = true)
        }
        val label = "Where you spent the periods in $games $asRole, on the pitch. Thirds of the length, left to right: ${thirds.length.joinToString("%, ")}%. Of the width, far side to near: ${thirds.width.joinToString("%, ")}%."
        // TRK-9, WEB-24: painted on the grass, on a standard pitch, the thirds lined up with it.
        PitchHeatmap(heat.cols.toInt(), heat.rows.toInt(), heat.cells, x.unit, label, thirds = thirds, modifier = Modifier.padding(top = 20.dp))
    }
}

/** In detail on the halfway line, its three parts linked: each scrolls to its heading. */
@Composable
private fun InDetailHead(jump: (String) -> Unit) {
    Column {
        Text("IN DETAIL", style = LfType.display(46.sp, colors.chalk, 42.sp), modifier = Modifier.padding(end = 4.dp).semantics { heading() })
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(Modifier.padding(top = 6.dp).offset(x = (-8).dp)) {
            for ((key, label) in listOf("running" to "The running", "fixtures" to "The fixtures", "games" to "The games")) {
                Box(Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(4.dp)).clickable(onClickLabel = "Go to $label") { jump(key) }.padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                    Text(label.uppercase(), style = LfType.word(15.sp, colors.chalk))
                }
            }
        }
        Halfway(Modifier.padding(top = 20.dp))
    }
}

/** A part of In detail: its heading on the grass with a faint chalk line on. */
@Composable
private fun PartTitle(title: String) = SectionTitle(title)

/** STAT-3: the average distance a game in each role, head to head. */
@Composable
private fun DistanceByRole(x: Ctx) {
    val byRole = x.s.distance.byRole
    val c = colors
    val colorOf = mapOf("referee" to c.chalk, "assistant" to c.boardAccent, "fourth" to c.roleFourth)
    Slab("Distance by role", tag = if (x.unit == "mi") "Miles a game" else "Km a game", cut = true) {
        if (byRole.isEmpty()) {
            Text("No distances in these games yet.", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = c.muted)
            return@Slab
        }
        byRole.chunked(2).forEachIndexed { row, pair ->
            Row(Modifier.fillMaxWidth().padding(top = if (row > 0) 18.dp else 0.dp), horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                pair.forEachIndexed { i, r ->
                    val color = colorOf[r.role] ?: c.chalk
                    // With two, the second sits at the right, as the head to head runs.
                    val right = byRole.size == 2 && i == 1
                    Column(
                        Modifier.weight(1f).clearAndSetSemantics { contentDescription = "${roleWords[r.role]}: ${formatDistance(r.averageM, x.unit)} a game, from ${plural(r.games, "game")}" },
                        horizontalAlignment = if (right) Alignment.End else Alignment.Start,
                    ) {
                        SlabLabel(roleWords[r.role] ?: r.role, color = color)
                        SlabFigure(formatDistance(r.averageM, x.unit), 44.dp, Modifier.padding(top = 8.dp), color = color, textAlign = if (right) TextAlign.End else null)
                        Text(plural(r.games, "game"), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), color = c.onBoardMuted, modifier = Modifier.padding(top = 6.dp))
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        HeadToHead(byRole.map { Share(it.averageM, colorOf[it.role] ?: c.chalk) }, Modifier.padding(top = 22.dp), height = 28.dp)
    }
}

/** The longest and shortest games as a tale of the tape: the two side by side, distance, date, role and the match, which opens it. */
@Composable
private fun LongestShortest(x: Ctx) {
    val long = x.s.distance.longest!!
    val short = x.s.distance.shortest!!
    val c = colors
    val role = { r: String? -> when (r) { null -> "—"; "fourth" -> "4th official"; else -> roleWords[r] ?: r } }
    Slab("Longest and shortest") {
        Row(Modifier.fillMaxWidth().height(42.dp).clearAndSetSemantics {}) {
            Box(Modifier.weight(1f).fillMaxHeight().clip(slantShape(right = TabCut)).background(c.chalk).padding(start = 14.dp, end = 26.dp), contentAlignment = Alignment.CenterStart) {
                app.lawfive.ui.components.FitText("LONGEST", LfType.display(22.sp, c.board, 1.em), min = 12.sp)
            }
            Box(Modifier.weight(1f).fillMaxHeight().clip(slantShape(left = TabCut)).background(c.boardAccent).padding(start = 26.dp, end = 14.dp), contentAlignment = Alignment.CenterEnd) {
                app.lawfive.ui.components.FitText("SHORTEST", LfType.display(22.sp, c.board, 1.em), min = 12.sp)
            }
        }
        val rows: List<Pair<String, @Composable (Boolean) -> Unit>> = listOf(
            "Distance" to { longest -> SlabFigure(formatDistance(if (longest) long.distanceM else short.distanceM, x.unit), 40.dp, color = if (longest) c.onBoardStrong else c.boardAccent, textAlign = if (longest) null else TextAlign.End) },
            "Date" to { longest -> TapeWords(shortDay(if (longest) long.kickoff else short.kickoff), longest) },
            "Role" to { longest -> TapeWords(role(if (longest) long.role else short.role), longest) },
            "Match" to { longest ->
                val g = if (longest) long.matchId to long.title else short.matchId to short.title
                Text(
                    g.second, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline),
                    color = c.onBoardStrong, textAlign = if (longest) TextAlign.Start else TextAlign.End,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).clickable(onClickLabel = "Open the match") { x.open("match/${g.first}") }.heightIn(min = 48.dp).padding(top = 4.dp, bottom = 4.dp),
                )
            },
        )
        rows.forEachIndexed { i, (label, cell) ->
            Column(Modifier.fillMaxWidth().padding(top = if (i == 0) 8.dp else 0.dp)) {
                if (i > 0) Box(Modifier.fillMaxWidth().height(2.dp).background(c.border))
                Text(label.uppercase(), style = LfType.label(12.sp, c.onBoardMuted, 0.14f), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
                Row(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = if (i == rows.lastIndex) 0.dp else 8.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.weight(1f).padding(end = 8.dp)) { cell(true) }
                    Box(Modifier.weight(1f).padding(start = 8.dp), contentAlignment = Alignment.TopEnd) { cell(false) }
                }
            }
        }
    }
}

@Composable
private fun TapeWords(text: String, left: Boolean) {
    Text(text.uppercase(), style = LfType.word(17.sp, colors.onBoardStrong).copy(letterSpacing = 0.04.em), textAlign = if (left) TextAlign.Start else TextAlign.End, modifier = Modifier.fillMaxWidth())
}

/**
 * STAT-3: the running total as one track, a stretch for each month (or year), each as long as the
 * distance in it, a notch for each game, and the total at the end of each stretch under it; a tap on
 * a stretch says what's in it.
 */
@Composable
private fun DistanceOverTime(x: Ctx) {
    val over = x.s.distance.overTime
    val unit = x.unit
    val per = if (unit == "mi") 1609.344 else 1000.0
    val total = over.last().totalM
    val ticks = axisTicks(total / per)
    val top = ticks.last()
    val stretches = remember(over) { runningStretches(over.map { RunGame(it.kickoff, it.distanceM, it.totalM) }) }
    var picked by remember(over) { mutableStateOf<Int?>(null) }
    val c = colors
    val measurer = rememberTextMeasurer()
    val num = { metres: Double -> figureAndUnit(formatDistance(metres, unit)).first }
    val unitWord = if (unit == "mi") "mi" else "km"
    val thisMonth = java.time.YearMonth.now(app.lawfive.data.AppClock.clock()).toString()
    val endDay = { iso: String -> runCatching { ZonedDateTime.parse(iso).withZoneSameInstant(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())).uppercase() }.getOrDefault("") }
    val describe = { i: Int ->
        val st = stretches[i]
        "${st.label}${st.sub?.let { " $it" } ?: ""}: +${formatDistance(st.addedM, unit)} in ${plural(st.games.toLong(), "game")}, ${formatDistance(st.totalM, unit)} by ${shortDay(st.lastKickoff)}"
    }
    Slab("Distance over time", tag = "Running total") {
        val axisStyle = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = fixedSp(11.dp), color = c.onBoardMuted)
        val wordsStyle = LfType.word(fixedSp(15.dp), c.board).copy(letterSpacing = 0.04.em)
        val endStyle = LfType.display(fixedSp(26.dp), c.onBoardStrong)
        val endLast = endStyle.copy(color = c.boardAccent)
        val dateStyle = TextStyle(fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = fixedSp(10.5.dp), letterSpacing = 0.1.em, color = c.onBoardMuted)
        Canvas(
            Modifier.fillMaxWidth().height(126.dp)
                .semantics { contentDescription = "The running total: " + stretches.indices.joinToString("; ") { describe(it) } + "." }
                .pointerInput(stretches) {
                    detectTapGestures { at ->
                        val k = (at.x / size.width) * top
                        var start = 0.0
                        val i = stretches.indexOfFirst { st -> val end = st.totalM / per; (k >= start && k <= end).also { start = end } }
                        picked = if (i < 0 || i == picked) null else i
                    }
                },
        ) {
            val w = size.width
            val at = { metres: Double -> ((metres / per) / top).toFloat() * w }
            // The axis.
            // The axis's steps, the first at the left and the last (with its unit) at the right; one between that would touch a neighbor is left out.
            val labels = ticks.mapIndexed { i, t ->
                val l = measurer.measure("${if (t == kotlin.math.floor(t)) t.toLong().toString() else t.toString()}${if (i == ticks.lastIndex) " $unitWord" else ""}", axisStyle)
                val px = (t / top).toFloat() * w
                l to when (i) { 0 -> 0f; ticks.lastIndex -> px - l.size.width; else -> px - l.size.width / 2 }
            }
            val gap = 8.dp.toPx()
            var right = Float.NEGATIVE_INFINITY
            labels.forEachIndexed { i, (l, left) ->
                val last = i == labels.lastIndex
                if (last || (left >= right + gap && left + l.size.width <= labels.last().second - gap)) {
                    drawText(l, topLeft = Offset(left, 0f))
                    right = left + l.size.width
                }
            }
            val barTop = 24.dp.toPx()
            val barH = 40.dp.toPx()
            drawRect(c.boardDots, Offset(0f, barTop), Size(w, barH))
            var start = 0.0
            stretches.forEachIndexed { i, st ->
                val x0 = at(start)
                val x1 = at(st.totalM)
                start = st.totalM
                val last = i == stretches.lastIndex
                val dim = picked != null && picked != i
                val fill = (if (last) c.boardAccent else c.chalk).copy(alpha = if (dim) 0.45f else 1f)
                if (last) {
                    val cut = minOf(12.dp.toPx(), x1 - x0)
                    drawPath(Path().apply { moveTo(x0, barTop); lineTo(x1, barTop); lineTo(x1 - cut, barTop + barH); lineTo(x0, barTop + barH); close() }, fill)
                } else {
                    drawRect(fill, Offset(x0, barTop), Size(x1 - x0, barH))
                    drawRect(c.board, Offset(x1 - 3.dp.toPx(), barTop), Size(3.dp.toPx(), barH))
                }
                val words = "${st.label} +${num(st.addedM)}${if (last && st.key == thisMonth) " · so far" else ""}".uppercase()
                val l = measurer.measure(words, wordsStyle)
                if (x1 - x0 >= l.size.width + 20.dp.toPx()) drawText(l, topLeft = Offset(x0 + 10.dp.toPx(), barTop + (barH - l.size.height) / 2))
            }
            // A notch at each game, where its distance ends.
            over.dropLast(1).forEach { g -> drawRect(c.board.copy(alpha = 0.5f), Offset(at(g.totalM) - 1.dp.toPx(), barTop + barH - 8.dp.toPx()), Size(2.dp.toPx(), 8.dp.toPx())) }
            // The ends under it, as many as fit without touching.
            val ends = stretches.map { at(it.totalM) }
            val shown = spacedLabels(ends.map { p -> p + if (p > w * 0.88f) -40.dp.toPx() else if (p < w * 0.08f) 40.dp.toPx() else 0f }, 84.dp.toPx())
            val endTop = barTop + barH
            stretches.forEachIndexed { i, st ->
                if (!shown[i]) return@forEachIndexed
                val last = i == stretches.lastIndex
                val px = ends[i]
                val figure = measurer.measure("${num(st.totalM)}${if (last) " ${unitWord.uppercase()}" else ""}", if (last) endLast else endStyle)
                val date = measurer.measure(endDay(st.lastKickoff), dateStyle)
                val wide = max(figure.size.width, date.size.width).toFloat()
                val left = when { px > w * 0.88f -> px - wide; px < w * 0.08f -> px; else -> px - wide / 2 }
                drawRect(c.onBoard, Offset(px - 1.dp.toPx(), endTop), Size(2.dp.toPx(), 10.dp.toPx()))
                val align = { width: Int -> when { px > w * 0.88f -> left + wide - width; px < w * 0.08f -> left; else -> px - width / 2f } }
                drawText(figure, topLeft = Offset(align(figure.size.width), endTop + 14.dp.toPx()))
                drawText(date, topLeft = Offset(align(date.size.width), endTop + 14.dp.toPx() + figure.size.height + 2.dp.toPx()))
            }
        }
        Text(
            picked?.let { describe(it) } ?: "Tap a stretch to see its games",
            style = MaterialTheme.typography.bodySmall, color = if (picked != null) c.text else c.muted,
            modifier = Modifier.padding(top = 10.dp).heightIn(min = 36.dp).clearAndSetSemantics {},
        )
    }
}

/** STAT-8, STAT-14: fitness as its figures, then the time at each speed and in each heart-rate zone (or the prompt to set a maximum heart rate). */
@Composable
private fun Fitness(x: Ctx) {
    val f = x.s.fitness
    val unit = x.unit
    val c = colors
    val withHeart = f.games.mapNotNull { it.avgBpm }
    val withSprints = f.games.mapNotNull { it.sprints }
    val withSpeed = f.games.mapNotNull { it.topSpeedMps }
    data class Fig(val icon: Ph, val label: String, val text: String, val sub: String)
    val figures = listOfNotNull(
        // STAT-16: a game's distance is one figure, Distance's own (distance.averageM), so it isn't here too.
        if (withHeart.isNotEmpty()) Fig(Ph.Heart, "Heart rate", "${withHeart.average().roundToInt()} bpm", "average") else null,
        if (withSprints.isNotEmpty()) Fig(Ph.Sprint, "Sprints", rate(withSprints.sum(), withSprints.size.toLong()), "a game · ${withSprints.sum()} in all") else null,
        if (withSpeed.isNotEmpty()) Fig(Ph.Speed, "Top speed", formatSpeed(withSpeed.max(), unit), "the fastest in these games") else null,
    )
    Slab("Fitness", icon = Ph.Heart, tag = "${plural(f.games.size.toLong(), "game")} with a track") {
        figures.chunked(2).forEachIndexed { row, pair ->
            if (row > 0) Box(Modifier.padding(vertical = 20.dp).fillMaxWidth().height(2.dp).background(c.border))
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                pair.forEachIndexed { i, fig ->
                    if (i > 0) Box(Modifier.width(2.dp).fillMaxHeight().background(c.border))
                    Column(Modifier.weight(1f).padding(start = if (i > 0) 18.dp else 0.dp, end = 10.dp).semantics(mergeDescendants = true) {}) {
                        SlabLabel(fig.label, icon = fig.icon)
                        SlabFigure(fig.text, 40.dp, Modifier.padding(top = 8.dp))
                        MintBar(Modifier.padding(top = 10.dp), height = 8.dp, fraction = 0.8f, max = 120.dp)
                        Text(fig.sub, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold), modifier = Modifier.padding(top = 10.dp))
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        val bands = f.speedBands
        if (bands != null && bands.any { it.sec > 0 }) {
            FitPart {
                val starts = bandStarts(f.sprintKph ?: 21.0)
                val speed = { kph: Double -> if (unit == "mi") (kph / 1.609344).roundToInt() else kph.roundToInt() }
                val word = if (unit == "mi") "mph" else "km/h"
                val items = bands.mapIndexed { i, b ->
                    val range = when {
                        i == bands.lastIndex -> "${speed(starts[i])} $word and up"
                        i == 0 -> "under ${speed(starts[1])} $word"
                        else -> "${speed(starts[i])}–${speed(starts[i + 1])} $word"
                    }
                    Band(bandNames[b.band] ?: b.band, range, b.sec, c.boardSpeed[i % c.boardSpeed.size])
                }
                SlabLabel("Time in speed bands")
                ElbowBar(items, "Time in speed bands: " + elbowWords(items), Modifier.padding(top = 14.dp))
            }
        }
        val zones = f.zones
        if (zones != null) {
            if (zones.any { it.sec > 0 }) FitPart {
                val items = zones.mapIndexed { i, z ->
                    Band("Zone ${z.zone}", zones.getOrNull(i + 1)?.let { "${z.fromBpm}–${it.fromBpm - 1} bpm" } ?: "${z.fromBpm} bpm and up", z.sec, c.boardZones[i % c.boardZones.size])
                }
                SlabLabel("Heart-rate zones${f.maxHeartRate?.let { " · max $it bpm" } ?: ""}")
                ElbowBar(items, "Time in each heart-rate zone: " + elbowWords(items), Modifier.padding(top = 14.dp), stepped = true)
            }
        } else if (withHeart.isNotEmpty()) {
            FitPart {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(textDecoration = TextDecoration.Underline, color = c.onBoardStrong, fontWeight = FontWeight.SemiBold)) { append("Set your maximum heart rate") }
                        append(" in Settings to see the time in each heart-rate zone.")
                    },
                    style = MaterialTheme.typography.bodyMedium, color = c.muted,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).clickable(onClickLabel = "Open Settings", onClick = x.settings).heightIn(min = 48.dp).padding(vertical = 6.dp),
                )
            }
        }
    }
}

private fun elbowWords(items: List<Band>): String {
    val pcts = app.lawfive.data.shares(items.map { it.sec })
    return items.mapIndexed { i, b -> "${b.name}, ${b.sub}: ${pcts[i]}%, ${duration(b.sec)}" }.joinToString("; ")
}

@Composable
private fun FitPart(content: @Composable () -> Unit) {
    Column(Modifier.padding(top = 28.dp).fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(2.dp).background(colors.border))
        Column(Modifier.padding(top = 22.dp)) { content() }
    }
}

/**
 * STAT-15: the watches the games were recorded on, most used first, two to a row, each drawn flat
 * with its face showing the battery it used an hour as a ring (full at 30% an hour) and the figure.
 */
@Composable
private fun Watches(s: Stats) {
    val models = watchesShown(s.watches)
    val c = colors
    Slab("Your watches", icon = Ph.Watch, tag = "Battery an hour") {
        models.chunked(2).forEachIndexed { row, pair ->
            Row(Modifier.fillMaxWidth().padding(top = if (row > 0) 26.dp else 0.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { m -> WatchItem(m, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        Text(
            "The ring is the battery used an hour, from kickoff to full time: full at ${RING_FULL_PER_HOUR.roundToInt()}% an hour.",
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.5.sp, fontWeight = FontWeight.Normal), color = c.muted, modifier = Modifier.padding(top = 20.dp),
        )
    }
}

@Composable
internal fun WatchItem(m: StatsWatchesModelsItem, modifier: Modifier = Modifier) {
    val c = colors
    Column(modifier.clearAndSetSemantics { contentDescription = describeWatch(m) }, horizontalAlignment = Alignment.CenterHorizontally) {
        WatchDrawing(m, Modifier.fillMaxWidth().widthIn(max = 150.dp))
        // The platform only where the name doesn't already say it; kept as a blank line so the names line up.
        Text(platformLabel(m)?.uppercase() ?: " ", style = LfType.label(12.sp, c.boardAccent, 0.14f), modifier = Modifier.padding(top = 14.dp))
        Text(m.name.uppercase(), style = LfType.display(21.sp, c.onBoardStrong, 21.sp), textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp, end = 2.dp))
        Text("${plural(m.games, "game")} on it", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = c.onBoard, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        Text(watchCaption(m), style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, fontWeight = FontWeight.Medium), color = c.onBoardMuted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
    }
}

/** The watches' own grays (DESIGN.md `--watch-*`), the same day and night. */
private val watchStrap = Color(0xFF1D2321)
private val watchCase = Color(0xFF2F3533)
private val watchCaseEdge = Color(0xFF161A19)
private val watchButton = Color(0xFF59625E)
private val watchDim = Color(0xFFAAAAAA)

/** A watch drawn flat in a real watch's grays (round, or Apple Watch's rounded square), its face the battery used an hour: a ring and the figure. */
@Composable
private fun WatchDrawing(m: StatsWatchesModelsItem, modifier: Modifier) {
    val c = colors
    val share = ringShare(m.drainPerHour)
    val square = m.platform == "applewatch"
    val has = hasBattery(m)
    val measurer = rememberTextMeasurer()
    val figure = watchFigure(m)
    Canvas(modifier.aspectRatio(200f / 264f)) {
        val k = size.width / 200f
        fun r(x: Float, y: Float, w: Float, h: Float, radius: Float, color: Color) = drawRoundRect(color, Offset(x * k, y * k), Size(w * k, h * k), CornerRadius(radius * k))
        val strapX = if (square) 58f else 60f
        val strapW = if (square) 84f else 80f
        r(strapX, 0f, strapW, 70f, 10f, watchStrap)
        r(strapX, 194f, strapW, 70f, 10f, watchStrap)
        val ring = Path()
        if (square) {
            r(172f, 88f, 12f, 34f, 5f, watchButton)
            r(174f, 136f, 8f, 28f, 3f, watchButton)
            r(24f, 52f, 152f, 160f, 42f, watchCase)
            drawRoundRect(watchCaseEdge, Offset(24f * k, 52f * k), Size(152f * k, 160f * k), CornerRadius(42f * k), style = Stroke(3f * k))
            r(36f, 64f, 128f, 136f, 32f, Color.Black)
            // Apple Watch's ring: a rounded rectangle's outline from the middle of its top, clockwise.
            val (cx, cy, w, h, rad) = listOf(100f, 132f, 108f, 116f, 22f)
            val x0 = (cx - w / 2) * k; val y0 = (cy - h / 2) * k; val x1 = (cx + w / 2) * k; val y1 = (cy + h / 2) * k; val rr = rad * k
            ring.moveTo(cx * k, y0)
            ring.lineTo(x1 - rr, y0); ring.arcTo(androidx.compose.ui.geometry.Rect(x1 - 2 * rr, y0, x1, y0 + 2 * rr), -90f, 90f, false)
            ring.lineTo(x1, y1 - rr); ring.arcTo(androidx.compose.ui.geometry.Rect(x1 - 2 * rr, y1 - 2 * rr, x1, y1), 0f, 90f, false)
            ring.lineTo(x0 + rr, y1); ring.arcTo(androidx.compose.ui.geometry.Rect(x0, y1 - 2 * rr, x0 + 2 * rr, y1), 90f, 90f, false)
            ring.lineTo(x0, y0 + rr); ring.arcTo(androidx.compose.ui.geometry.Rect(x0, y0, x0 + 2 * rr, y0 + 2 * rr), 180f, 90f, false)
            ring.close()
        } else {
            r(180f, 96f, 12f, 24f, 4f, watchButton)
            r(180f, 144f, 12f, 24f, 4f, watchButton)
            r(8f, 120f, 12f, 24f, 4f, watchButton)
            drawCircle(watchCase, 86f * k, Offset(100f * k, 132f * k))
            drawCircle(watchCaseEdge, 86f * k, Offset(100f * k, 132f * k), style = Stroke(3f * k))
            drawCircle(Color.Black, 76f * k, Offset(100f * k, 132f * k))
            ring.arcTo(androidx.compose.ui.geometry.Rect(Offset(100f * k, 132f * k), 66f * k), -90f, 359.99f, true)
        }
        drawPath(ring, c.boardDots, style = Stroke(9f * k))
        if (share > 0f) {
            val measure = PathMeasure().apply { setPath(ring, false) }
            val lit = Path()
            measure.getSegment(0f, measure.length * share, lit, true)
            drawPath(lit, c.boardAccent, style = Stroke(9f * k, cap = StrokeCap.Butt))
        }
        // The figure and its word scale with the drawing, as the website's SVG text does.
        val f = measurer.measure(figure, LfType.display((46f * k).toSp(), Color.White))
        val u = measurer.measure(if (has) "AN HOUR" else "NO READINGS", TextStyle(fontFamily = Mono, fontWeight = FontWeight.Bold, fontSize = (10.5f * k).toSp(), letterSpacing = 0.14.em, color = watchDim))
        val block = f.size.height * 0.78f + 4f * k + u.size.height
        val top = 132f * k - block / 2
        drawText(f, topLeft = Offset(100f * k - f.size.width / 2f, top - f.size.height * 0.12f))
        drawText(u, topLeft = Offset(100f * k - u.size.width / 2f, top + f.size.height * 0.78f + 4f * k))
    }
}

private val dayNames = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
private val dayNamesFull = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")

/** A kickoff hour as the phone writes times: "9 AM", or "09:00". */
private fun hourName(h: Int, h24: Boolean) = if (h24) "%02d:00".format(h) else "${if (h % 12 == 0) 12 else h % 12} ${if (h < 12) "AM" else "PM"}"

/** STAT-3, STAT-14: the busiest times as a fixtures grid of lit tiles, turned for a phone: the days across, the kickoff hours down. */
@Composable
private fun Busiest(x: Ctx) {
    val grid = busiestGrid(x.s.busiest.map { Triple(it.day, it.hour, it.games) })
    val c = colors
    Slab("Busiest times", tag = "Games by kickoff") {
        Column(
            Modifier.fillMaxWidth().clearAndSetSemantics {
                contentDescription = "Games by day and kickoff hour, in each match's time zone: " + x.s.busiest.joinToString(", ") { "${dayNamesFull[it.day]} ${hourName(it.hour, x.h24)}, ${it.games}" }
            },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Spacer(Modifier.width(52.dp))
                for (d in dayNames) app.lawfive.ui.components.FitText(d.uppercase(), LfType.word(fixedSp(15.dp), c.onBoard).copy(letterSpacing = 0.02.em), Modifier.weight(1f), min = 9.sp, textAlign = TextAlign.Center)
            }
            for (h in grid.hours) {
                Row(Modifier.height(30.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(hourName(h, x.h24), style = LfType.label(fixedSp(10.dp), c.onBoardMuted, 0.02f), maxLines = 1, softWrap = false, modifier = Modifier.width(52.dp))
                    for (d in 0..6) {
                        val n = grid.at(d, h)
                        val step = lightStep(n, grid.max)
                        Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.Center) {
                            if (step == 0) Box(Modifier.size(4.dp).clip(CircleShape).background(c.onBoardDim.copy(alpha = 0.5f)))
                            else Box(Modifier.fillMaxWidth().fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c.heat[step - 1]), contentAlignment = Alignment.Center) {
                                Text("$n", style = LfType.display(fixedSp(20.dp), if (step <= 3) c.chalk else c.board, fixedSp(20.dp)), maxLines = 1, softWrap = false)
                            }
                        }
                    }
                }
            }
        }
        Row(Modifier.padding(top = 16.dp).fillMaxWidth().clearAndSetSemantics {}, horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
            Text("FEWER", style = LfType.label(11.sp, c.onBoardMuted, 0.08f), modifier = Modifier.padding(end = 8.dp))
            for (step in c.heat) Box(Modifier.padding(horizontal = 1.5.dp).size(16.dp, 12.dp).background(step))
            Text("MORE GAMES", style = LfType.label(11.sp, c.onBoardMuted, 0.08f), modifier = Modifier.padding(start = 8.dp))
        }
    }
}

/** STAT-3: where, as a league table on a chalk panel: the venues and pitches with the most games, ranked (sharing a rank on a tie), each opening its venue. */
@Composable
private fun Places(x: Ctx) {
    val p = x.s.places
    Slab("Where", ground = SlabGround.Panel, tag = "${plural(p.pitches, "pitch", "pitches")} · ${plural(p.venues, "venue")}") {
        val c = colors
        if (p.top.isEmpty()) {
            Text("These games have no venues set.", style = MaterialTheme.typography.bodyLarge, color = c.muted)
            return@Slab
        }
        val most = p.top.maxOf { it.games }.coerceAtLeast(1)
        val rank = ranks(p.top.map { it.games })
        Box(Modifier.fillMaxWidth().height(3.dp).background(c.inkRule))
        p.top.forEachIndexed { i, place ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(c.border))
            Row(
                Modifier.fillMaxWidth().clickable(onClickLabel = "Open ${place.venue}") { x.open("venue/${place.venueId}") }.padding(vertical = 12.dp)
                    .clearAndSetSemantics { contentDescription = "${rank[i]}. ${place.venue}${place.pitch?.let { ", $it" } ?: ""}: ${plural(place.games, "game")}" },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text("${rank[i]}", style = LfType.display(26.sp, c.brand, 26.sp), modifier = Modifier.width(30.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        buildAnnotatedString {
                            append(place.venue)
                            place.pitch?.let { withStyle(SpanStyle(color = c.muted, fontWeight = FontWeight.Medium)) { append(" · $it") } }
                        },
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    )
                    Box(Modifier.padding(top = 8.dp).fillMaxWidth(place.games.toFloat() / most).height(7.dp).background(c.brand))
                }
                Text("${place.games}", style = LfType.display(30.sp, c.text, 30.sp), modifier = Modifier.padding(end = 2.dp))
            }
        }
    }
}

/** STAT-3: what the weather was like: dry against wet games as slanted bars, and the average at kickoff. */
@Composable
private fun WeatherSlab(x: Ctx) {
    val w = x.s.weather
    val c = colors
    Slab("Weather", icon = Ph.Sun, tag = "${w.games} of ${x.s.games.total} games") {
        if (w.games == 0L) {
            Text("No weather for these games yet: it needs the venue or pitch on the map.", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), color = c.muted)
            return@Slab
        }
        SlantBars(listOf(
            SlantBar("Dry", (w.games - w.rainy).toDouble(), "${w.games - w.rainy}", c.chalk, Ph.Sun),
            SlantBar("Rain", w.rainy.toDouble(), "${w.rainy}", c.boardAccent, Ph.CloudRain),
        ))
        Text("Rain: 1 mm or more from an hour before kickoff to the end.", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = c.onBoardMuted, modifier = Modifier.padding(top = 12.dp))
        w.averageTemperatureC?.let { avg ->
            Box(Modifier.padding(top = 18.dp).fillMaxWidth().height(2.dp).background(c.border))
            Row(Modifier.padding(top = 16.dp).fillMaxWidth().semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
                SlabLabel("Average at kickoff", Modifier.weight(1f))
                SlabFigure(formatTemperature(avg, x.temperature), 40.dp)
            }
        }
    }
}

/** STAT-3: games in each band of kickoff temperature, as columns to scale with their counts over them. */
@Composable
private fun Temperatures(x: Ctx) {
    val f = x.temperature == "f"
    val bands = temperatureBands(x.s.weather.temperaturesC, f)
    val name = { from: Int -> if (f) "${from}s °F" else "$from–${from + 4} °C" }
    Slab("Temperature", icon = Ph.Thermometer, tag = "At kickoff, ${if (f) "°F" else "°C"}") {
        val columns = bands.map { (from, n) -> BoardColumn(if (f) "${from}s" else "$from°", n.toDouble(), "$n", "${plural(n.toLong(), "game")} at ${name(from)}") }
        BoardColumns(columns, colors.chalk, "Games by the temperature at kickoff: " + columns.joinToString("; ") { it.describe })
    }
}

/** The weather's records, three boards cut on the diagonal: the hottest, coldest and windiest games, each opening its match. */
@Composable
private fun Records(x: Ctx) {
    val w = x.s.weather
    val wind = { kph: Double -> if (x.unit == "mi") "${(kph / 1.609344).roundToInt()} mph gusts" else "${kph.roundToInt()} km/h gusts" }
    val records = listOfNotNull(
        w.hottest?.let { Triple("Hottest", formatTemperature(it.temperatureC, x.temperature), it.matchId to "${shortDay(it.kickoff)} · ${it.title}") },
        w.coldest?.let { Triple("Coldest", formatTemperature(it.temperatureC, x.temperature), it.matchId to "${shortDay(it.kickoff)} · ${it.title}") },
        w.windiest?.let { Triple("Windiest", wind(it.windGustKph), it.matchId to "${shortDay(it.kickoff)} · ${it.title}") },
    )
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        for ((label, figure, game) in records) {
            Column(
                Modifier.fillMaxWidth().boardSurface(slantShape(right = SlabCut)).clickable(onClickLabel = "Open the match") { x.open("match/${game.first}") }
                    .padding(start = 22.dp, end = SlabCut + 12.dp, top = 20.dp, bottom = 20.dp)
                    .semantics(mergeDescendants = true) {},
            ) {
                OnBoard {
                    SlabLabel(label)
                    SlabFigure(figure, 60.dp, Modifier.padding(top = 8.dp))
                    Text(game.second, style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline), color = colors.onBoard, modifier = Modifier.padding(top = 10.dp))
                }
            }
        }
    }
}

/** STAT-3, STAT-14: each age group's games by gender, a row each, the bar as long as its games. */
@Composable
private fun AgeGroups(s: Stats) {
    val c = colors
    data class Gender(val label: String, val color: Color, val of: (app.lawfive.schema.StatsAgeGroupsItem) -> Long)
    val genders = listOf(
        Gender("Male", c.chalk) { it.male }, Gender("Female", c.boardAccent) { it.female },
        Gender("Co-ed", c.roleFourth) { it.coed }, Gender("Not set", c.roleNone) { it.notSet },
    )
    val used = genders.filter { g -> s.ageGroups.any { g.of(it) > 0 } }
    val total = { a: app.lawfive.schema.StatsAgeGroupsItem -> genders.sumOf { it.of(a) } }
    val most = s.ageGroups.maxOf(total).coerceAtLeast(1)
    // A caption, not a tab, in the website's words for what's shown ("Games, added time and cards"; here the games alone).
    Slab("By age group", tag = "Games") {
        if (used.size > 1) Legend(used.map { it.label to it.color })
        s.ageGroups.forEachIndexed { i, a ->
            val sum = total(a)
            val parts = used.filter { it.of(a) > 0 }
            if (i > 0) Box(Modifier.fillMaxWidth().height(2.dp).background(c.border))
            Row(
                Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 10.dp)
                    .clearAndSetSemantics { contentDescription = "${a.ageGroup}: ${plural(sum, "game")}${if (used.size > 1) ", " + parts.joinToString(", ") { "${it.of(a)} ${it.label.lowercase()}" } else ""}" },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.width(92.dp)) {
                    Text(a.ageGroup.uppercase(), style = LfType.display(28.sp, c.onBoardStrong, 28.sp), modifier = Modifier.padding(end = 2.dp))
                    Text(plural(sum, "game").uppercase(), style = LfType.label(10.5.sp, c.onBoardMuted, 0.1f), modifier = Modifier.padding(top = 3.dp))
                }
                BoxWithConstraints(Modifier.weight(1f)) {
                    val bar = maxOf(4.dp, (maxWidth - 70.dp) * (sum.toFloat() / most))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.width(bar).height(18.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            parts.forEach { g -> Box(Modifier.weight(g.of(a).toFloat()).fillMaxHeight().background(g.color)) }
                        }
                        Text(if (parts.size > 1) parts.joinToString(" + ") { "${it.of(a)}" } else "$sum", style = LfType.display(fixedSp(22.dp), c.onBoardStrong, fixedSp(22.dp)), maxLines = 1, softWrap = false, modifier = Modifier.padding(end = 2.dp))
                    }
                }
            }
        }
    }
}

/** STAT-3: the referees you work with most as name straps on the grass, each as long as the games together; a saved referee opens their page. */
@Composable
private fun RefereeStraps(x: Ctx) {
    val r = x.s.referees
    val c = colors
    val most = r.top.maxOf { it.games }.coerceAtLeast(1)
    Column {
        GrassHead("Referees you work with most", "Games together · ${r.count} on your crews")
        Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            for (ref in r.top) {
                val go = ref.refereeId?.let { id -> { x.open("referee/$id") } }
                BoxWithConstraints(
                    Modifier.fillMaxWidth().then(if (go != null) Modifier.clickable(onClickLabel = "Open ${ref.name}", onClick = go) else Modifier)
                        .clearAndSetSemantics { contentDescription = "${ref.name}: ${plural(ref.games, "game")} together" },
                ) {
                    val bar = maxOf(120.dp, (maxWidth - 58.dp) * (ref.games.toFloat() / most))
                    Row(Modifier.height(IntrinsicSize.Min).heightIn(min = 48.dp)) {
                        Box(Modifier.width(64.dp).fillMaxHeight().boardSurface(slantShape(right = 14.dp)).padding(end = 14.dp), contentAlignment = Alignment.Center) {
                            Text("${ref.games}", style = LfType.display(fixedSp(28.dp), c.onBoardStrong, fixedSp(28.dp)), modifier = Modifier.padding(end = 2.dp))
                        }
                        Box(
                            Modifier.offset(x = (-6).dp).width(bar).fillMaxHeight().clip(slantShape(left = 14.dp, right = 18.dp)).background(c.chalk)
                                .padding(start = 22.dp, end = 28.dp, top = 6.dp, bottom = 6.dp),
                            contentAlignment = Alignment.CenterStart,
                        ) {
                            Text(ref.name.uppercase(), style = LfType.display(22.sp, c.board, 22.sp), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(end = 2.dp))
                        }
                    }
                }
            }
        }
    }
}

/** STAT-10: year by year, a row of figures a year on the board. */
@Composable
private fun Years(x: Ctx) {
    val currency = x.s.fees.currency
    val c = colors
    Slab("Year by year", tag = "Each year in these filters") {
        x.s.years.forEachIndexed { i, y ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(2.dp).background(c.border))
            val figures = listOfNotNull(
                "Games" to ("${y.games}" to null),
                "As center" to ("${y.asCentre}" to percent(y.asCentre, y.games)),
                "Distance" to (if (y.distanceGames > 0) figureAndUnit(formatDistance(y.distanceM, x.unit)).first to (if (x.unit == "mi") "mi" else "km") else "—" to null),
                "Referees" to ("${y.referees}" to null),
                "Venues" to ("${y.venues}" to null),
                currency?.let { "Fees" to (money(y.feesAmount, it) to null) },
            )
            Column(Modifier.fillMaxWidth().padding(vertical = 16.dp).semantics(mergeDescendants = true) {}) {
                Text("${y.year}", style = LfType.display(44.sp, c.onBoardStrong, 44.sp), modifier = Modifier.semantics { heading() })
                BoxWithConstraints(Modifier.padding(top = 12.dp).fillMaxWidth()) {
                    val per = max(2, ((maxWidth + 16.dp) / (92.dp + 16.dp)).toInt())
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        figures.chunked(per).forEach { row ->
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                row.forEach { (label, value) ->
                                    Column(Modifier.weight(1f)) {
                                        Text(label.uppercase(), style = LfType.label(10.5.sp, c.boardAccent, 0.12f), maxLines = 1)
                                        Text(
                                            buildAnnotatedString {
                                                append(value.first)
                                                value.second?.let { withStyle(SpanStyle(fontSize = 15.sp, color = c.onBoardMuted)) { append(" ${it.uppercase()}") } }
                                            },
                                            style = LfType.display(fixedSp(30.dp), c.onBoardStrong, fixedSp(30.dp)), maxLines = 1, softWrap = false, modifier = Modifier.padding(top = 4.dp, end = 2.dp),
                                        )
                                    }
                                }
                                repeat(per - row.size) { Spacer(Modifier.weight(1f)) }
                            }
                        }
                    }
                }
            }
        }
    }
}
