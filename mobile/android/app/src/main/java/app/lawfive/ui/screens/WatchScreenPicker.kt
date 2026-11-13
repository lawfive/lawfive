package app.lawfive.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.MatchMoment
import app.lawfive.data.ScreenAt
import app.lawfive.data.ScreenSetup
import app.lawfive.data.momentLabel
import app.lawfive.data.moments
import app.lawfive.data.playAt
import app.lawfive.data.screenAt
import app.lawfive.data.Collections
import app.lawfive.schema.UserSettings
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.WordFitText
import app.lawfive.ui.theme.Barlow
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// UI-27: the match screen setup, as on the website (web/src/pages/MatchScreenSetup.tsx): UI-21's four
// questions a step at a time, then a review to save, under pictures of the screen on a round watch and
// on Apple Watch, drawn from the answers so far at a moment of a match, or played through. UI-24: saved
// for the account. The pictures are drawn as the watches draw them: black in either mode.

private val faceText = Color.White
private val faceDim = Color(0xFFAAAAAA)
private val faceRule = Color(0xFF555555)
private val faceTrack = Color(0xFF2A2A2A)
private val faceRing = Color(0xFF00AA44)
private val faceStoppage = Color(0xFFFF8800)
private val faceBreak = Color(0xFF55AAFF)
private val faceRed = Color(0xFFE5484D)

/** TMR-11: each style named with its example for a 2 × 45 match. */
private val clockStyles = listOf(Triple("up", "Match time", "0 to 90, like TV"), Triple("upEach", "Each half from 0", "0 to 45, then 0 to 45 again"), Triple("down", "Time left", "45 down to 0"))
private val clockChoices = listOf(Triple("one", "One clock", "The match clock, large"), Triple("stacked", "Two, stacked", "A smaller second clock under the first"), Triple("sideBySide", "Two, side by side", "The same size, with a line between"))
private val breakChoices = listOf(Triple("down", "Time left", "Half-time from 15:00 down to 0:00"), Triple("up", "Time taken", "Half-time from 0:00 up to 15:00"))
private val edgeChoices = listOf(
    Triple("ring", "Ring", "Around the edge: fills as the period runs, or empties with Time left. Round watches and Apple Watch."),
    Triple("time", "Time of day", "Small, at the very bottom. Apple Watch always shows its own clock."),
    Triple("none", "Neither", "Just the clocks and the score"),
)
private val nameChoices = listOf(Triple(true, "Team names", "1 HOM/AWY 2 over the clock"), Triple(false, "Scores only", "The scores alone, with a bigger clock"))
private val steps = listOf("Clocks", "How they count", "Ring or time", "Names", "Review")

/** The setup in words: label, value, and the step that asks it. */
private fun screenWords(s: ScreenSetup): List<Triple<String, String, Int>> {
    fun style(id: String) = clockStyles.first { it.first == id }.let { "${it.second} · ${it.third}" }
    return listOfNotNull(
        Triple("Clocks", clockChoices.first { it.first == s.clocks }.second, 0),
        Triple("Match clock", style(s.mainClock), 1),
        if (s.clocks == "one") null else Triple("Second clock", style(s.secondClock), 1),
        Triple("Break clock", breakChoices.first { it.first == s.breakClock }.second, 1),
        Triple("Ring or time", edgeChoices.first { it.first == s.edge }.second, 2),
        Triple("Names", if (s.names) "Team names" else "Scores only", 3),
    )
}

/**
 * The match screen in a line, as the website's (`screenLine` in web/src/pages/MatchScreenSetup.tsx), for
 * what next after linking (SYNC-15): "Two clocks stacked, the time of day, names".
 */
fun screenLine(s: ScreenSetup): String {
    val clocks = when (s.clocks) { "stacked" -> "two clocks stacked"; "sideBySide" -> "two clocks side by side"; else -> "one clock" }
    val edge = when (s.edge) { "ring" -> "the ring"; "time" -> "the time of day"; else -> null }
    return listOfNotNull(clocks, edge, if (s.names) "names" else "scores only").joinToString(", ").replaceFirstChar { it.uppercase() }
}

/** UI-24, UI-27: Settings' Match screen: the account's screen in pictures and words, and Change. */
@Composable
fun MatchScreenSummary(saved: app.lawfive.schema.WatchScreen?) {
    val setup = ScreenSetup.of(saved)
    val nav = LocalNav.current
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ScreenPreview(setup, compact = true)
        screenWords(setup).forEach { (label, value) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.width(110.dp))
                Text(value, style = MaterialTheme.typography.bodyMedium, color = colors.text)
            }
        }
        SecondaryButton("Change", { nav.navigate("settings/match-screen") }, Modifier.fillMaxWidth(), icon = Ph.Watch)
    }
}

@Composable
fun MatchScreenSetupScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val scope = rememberCoroutineScope()
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    var draft by remember { mutableStateOf<ScreenSetup?>(null) }
    var step by remember { mutableStateOf(0) }
    var saving by remember { mutableStateOf(false) }
    val loaded = settings
    val setup = draft ?: ScreenSetup.of(loaded?.watchScreen)
    fun set(change: (ScreenSetup) -> ScreenSetup) {
        val next = change(setup)
        // UI-22: never the match clock's style.
        draft = if (next.secondClock == next.mainClock) next.copy(secondClock = if (next.mainClock == "down") "upEach" else "down") else next
    }
    fun save() {
        saving = true
        scope.launch {
            val at = java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString()
            // APP-4: the first change on an account without settings makes them.
            graph.records.saveSettings { it.copy(watchScreen = setup.saved(at)) }
            nav.popBackStack()
        }
    }
    val last = steps.size - 1
    Screen("Match screen", sub = "What your watches show while a period runs. It reaches them at their next sync and starts at the next kickoff.", back = "Settings") {
        item { LfCard { ScreenPreview(setup) } }
        item {
            LfCard(Modifier.padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // The steps by name, so what's coming is clear; each can be gone back or ahead to.
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        steps.forEachIndexed { i, name ->
                            Column(
                                Modifier.weight(1f).semantics { selected = i == step }.clip(RoundedCornerShape(4.dp)).clickable(role = Role.Tab) { step = i }.padding(bottom = 2.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(if (i < step) colors.brand else if (i == step) colors.muted else colors.border))
                                Text(name, style = MaterialTheme.typography.labelSmall, color = if (i == step) colors.text else colors.muted, fontWeight = if (i == step) FontWeight.SemiBold else FontWeight.Normal, lineHeight = 14.sp)
                            }
                        }
                    }
                    when (step) {
                        0 -> {
                            Title("How many clocks?")
                            Tiles(clockChoices, setup.clocks) { v -> set { it.copy(clocks = v) } }
                        }
                        1 -> {
                            Title("How does each count?")
                            Text("Stoppage always counts up.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                            Question("Match clock")
                            Tiles(clockStyles, setup.mainClock) { v -> set { it.copy(mainClock = v) } }
                            if (setup.clocks != "one") {
                                Question("Second clock")
                                Tiles(clockStyles.filter { it.first != setup.mainClock }, setup.secondClock) { v -> set { it.copy(secondClock = v) } }
                            }
                            Question("Break clock")
                            Tiles(breakChoices, setup.breakClock) { v -> set { it.copy(breakClock = v) } }
                        }
                        2 -> {
                            Title("Ring or time of day?")
                            Text("At the edge of the screen; one or the other, as there's room for one.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                            Tiles(edgeChoices, setup.edge) { v -> set { it.copy(edge = v) } }
                        }
                        3 -> {
                            Title("Team names, or scores only?")
                            Tiles(nameChoices, setup.names) { v -> set { it.copy(names = v) } }
                        }
                        else -> {
                            Title("Your match screen")
                            screenWords(setup).forEach { (label, value, at) ->
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Column(Modifier.weight(1f)) {
                                        Text(label, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                                        Text(value, style = MaterialTheme.typography.bodyMedium, color = colors.text)
                                    }
                                    Text("Change", style = MaterialTheme.typography.labelLarge, color = colors.brandStrong,
                                        modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable { step = at }.padding(horizontal = 8.dp, vertical = 10.dp))
                                }
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SecondaryButton(if (step == 0) "Cancel" else "Back", { if (step == 0) nav.popBackStack() else step-- }, icon = if (step == 0) null else Ph.Back)
                        Spacer(Modifier.weight(1f))
                        if (step < last) PrimaryButton("Continue", { step++ })
                        else PrimaryButton(if (saving) "Saving…" else "Save for my watches", { save() }, enabled = loaded != null && !saving)
                    }
                }
            }
        }
    }
}

@Composable
private fun Title(text: String) = Text(text, style = MaterialTheme.typography.headlineSmall, color = colors.text)

@Composable
private fun Question(text: String) = Text(text.uppercase(), style = MaterialTheme.typography.labelSmall, color = colors.muted, letterSpacing = 0.8.sp, modifier = Modifier.padding(top = 6.dp))

/** Choices as tiles, as in the quiz: brand-soft with a brand border when chosen. */
@Composable
private fun <T> Tiles(options: List<Triple<T, String, String>>, value: T, onChange: (T) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (id, name, hint) ->
            val on = id == value
            val shape = RoundedCornerShape(10.dp)
            Column(
                Modifier.fillMaxWidth().semantics { selected = on }
                    .clip(shape)
                    .background(if (on) colors.brandSoft else colors.surface2)
                    .border(BorderStroke(if (on) 2.dp else 1.dp, if (on) colors.brand else colors.border), shape)
                    .clickable(role = Role.RadioButton) { onChange(id) }
                    .padding(14.dp),
            ) {
                Text(name, style = MaterialTheme.typography.titleSmall, color = if (on) colors.brandStrong else colors.text)
                Text(hint, style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        }
    }
}

/** UI-27: the pictures, the moments under them, Stoppage tracked and Play through. The account's watches' shapes come first. */
@Composable
fun ScreenPreview(setup: ScreenSetup, compact: Boolean = false) {
    val graph = LocalGraph.current
    var kinds by remember { mutableStateOf<Set<String>>(emptySet()) }
    LaunchedEffect(Unit) {
        kinds = runCatching { graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.mapNotNull { it.jsonObject["kind"]?.jsonPrimitive?.content }.toSet() }.getOrDefault(emptySet())
    }
    val roundYours = "garmin" in kinds || "wearos" in kinds
    val appleYours = "applewatch" in kinds
    val shapes = listOf(Triple(false, "Garmin, Wear OS", roundYours), Triple(true, "Apple Watch", appleYours)).let { if (appleYours && !roundYours) it.reversed() else it }
    var momentId by remember { mutableStateOf("first") }
    var tracked by remember { mutableStateOf(true) }
    var teamColors by remember { mutableStateOf(false) }
    /** Where Play through is, 0 to 1; null while a moment is chosen. */
    var position by remember { mutableStateOf<Float?>(null) }
    var playing by remember { mutableStateOf(false) }
    val shown = moments.filter { tracked || !it.stoppage }
    val chosen = shown.firstOrNull { it.id == momentId } ?: shown.first()
    val moment: MatchMoment = position?.let { playAt(it) } ?: chosen.moment
    val screen = screenAt(setup, moment, tracked)
    // About 30 seconds for the whole match, from where the scrubber is. Keyed on playing, so Pause ends
    // it at once, and a frame that lands after Pause doesn't move it on.
    LaunchedEffect(playing) {
        if (!playing) return@LaunchedEffect
        val from = position?.takeIf { it < 1f } ?: 0f
        val start = withFrameMillis { it } - (from * 30_000).toLong()
        while (playing) {
            val t = withFrameMillis { (it - start) / 30_000f }
            if (!playing) break
            if (t >= 1f) {
                position = 1f
                playing = false
            } else position = t
        }
    }
    Column(Modifier.padding(vertical = if (compact) 0.dp else 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.Bottom) {
            shapes.forEach { (apple, name, yours) ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val width = if (compact) (if (apple) 100.dp else 116.dp) else (if (apple) 124.dp else 146.dp)
                    WatchFace(setup, screen, apple, teamColors, Modifier.width(width).height(if (apple) width * 1.19f else width).semantics { contentDescription = "The match screen on $name" })
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        // A narrow phone with large text squeezes the second watch: its name steps down rather than breaking a word.
                        WordFitText(name, MaterialTheme.typography.bodySmall.copy(color = colors.muted), min = 9.sp, textAlign = TextAlign.Center)
                        if (yours) Chip("Yours", ChipTone.Brand)
                    }
                }
            }
        }
        if (!compact) {
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                shown.forEach { m ->
                    val on = position == null && m.id == chosen.id
                    Text(
                        m.name,
                        Modifier.semantics { selected = on }.clip(RoundedCornerShape(50))
                            .background(if (on) colors.brandSoft else colors.surface2)
                            .border(1.dp, if (on) colors.brand else colors.border, RoundedCornerShape(50))
                            .clickable(role = Role.RadioButton) { playing = false; position = null; momentId = m.id }
                            .padding(horizontal = 11.dp, vertical = 6.dp),
                        color = if (on) colors.brandStrong else colors.muted, fontSize = 13.sp,
                    )
                }
            }
            // Play through: play or pause, a scrubber over the whole match (dragging pauses), and where it is.
            Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(colors.surface).border(1.dp, colors.border, RoundedCornerShape(10.dp))
                        .clickable(role = Role.Button) { playing = !playing }
                        .semantics { contentDescription = if (playing) "Pause" else "Play through" },
                    contentAlignment = Alignment.Center,
                ) { app.lawfive.ui.components.PhIcon(if (playing) Ph.Pause else Ph.Play, size = 18.dp) }
                Slider(
                    value = position ?: 0f, onValueChange = { playing = false; position = it },
                    modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                    colors = SliderDefaults.colors(thumbColor = colors.brand, activeTrackColor = colors.brand, inactiveTrackColor = colors.border),
                )
                Text(position?.let { momentLabel(playAt(it)) } ?: "Play through", style = MaterialTheme.typography.bodySmall,
                    color = if (position == null) colors.muted else colors.text, modifier = Modifier.width(104.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Switch(tracked, { tracked = it }, colors = SwitchDefaults.colors(checkedTrackColor = colors.brand))
                Text("Stoppage tracked", style = MaterialTheme.typography.bodyMedium, color = colors.text, modifier = Modifier.weight(1f))
                Switch(teamColors, { teamColors = it }, colors = SwitchDefaults.colors(checkedTrackColor = colors.brand))
                Text("Team colors", style = MaterialTheme.typography.bodyMedium, color = colors.text)
            }
        }
    }
}

/** The watch's screen, as web/src/components/WatchFace.tsx draws it: slots at fractions of the height, sizes of the width. */
@Composable
fun WatchFace(setup: ScreenSetup, screen: ScreenAt, apple: Boolean, teamColors: Boolean = false, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val time = remember { java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date()) }
    // UI-25: Apple Watch's own clock is always there; on the others the time is an edge choice.
    val edge = if (apple && setup.edge == "time") "none" else setup.edge
    Canvas(modifier) {
        val u = size.width / 100f
        val h = size.height / u
        fun y(f: Float) = f * h * u
        fun put(text: String, x: Float, fy: Float, size: Float, color: Color = faceText, figure: Boolean = false, weight: FontWeight = FontWeight.SemiBold) =
            label(measurer, text, x * u, y(fy), size * u, color, figure, weight)
        val corner = if (apple) CornerRadius(22 * u) else CornerRadius(50 * u)
        drawRoundRect(Color.Black, cornerRadius = corner)
        if (apple) put(time, 78f, 0.075f, 7f)
        // UI-10: with Team colors on, the demo's teams in their colors; otherwise a quick match's HOM and AWY.
        val home = if (teamColors) "STR" to teamRed else "HOM" to faceBlank
        val away = if (teamColors) "ROV" to teamBlue else "AWY" to faceBlank
        // "1 HOM/AWY 2": the kits with the scores outside them, as the watches draw it.
        fun scoreLine(at: Float) {
            val size = 8.2f * u
            val half = kits(measurer, home.first to home.second, away.first to away.second, y(at), size)
            labelEnd(measurer, "1", 50 * u - half - 2.2f * u, y(at), size)
            labelStart(measurer, "2", 50 * u + half + 2.2f * u, y(at), size)
        }
        if (screen.halftime) {
            // UI-25: at the very bottom of every screen but the menus.
            if (!apple) put(time, 50f, 0.945f, 5f, faceDim, weight = FontWeight.Medium)
            put("HALF-TIME", if (apple) 30f else 50f, if (apple) 0.075f else 0.13f, 5.2f, faceDim, weight = FontWeight.Medium)
            scoreLine(if (apple) 0.25f else 0.27f)
            put(screen.breakClock ?: "", 50f, if (apple) 0.44f else 0.46f, 20f, if (screen.breakOver) faceRed else faceBreak, figure = true)
            put("Kickoff: ${away.first}", 50f, 0.62f, 5.6f, faceDim, weight = FontWeight.Medium)
            drawRoundRect(faceRing, Offset(25 * u, y(0.78f) - 6.5f * u), Size(50 * u, 13 * u), CornerRadius(6.5f * u))
            put("End HT", 50f, 0.78f, 6.5f)
            return@Canvas
        }
        if (edge == "ring") ring(apple, screen.progress, setup.mainClock == "down", u, h)
        if (setup.names) {
            put(screen.period, 50f, 0.12f, 5.8f, faceDim, weight = FontWeight.Medium)
            scoreLine(0.25f)
        } else {
            put(screen.period, 50f, 0.10f, 5.8f, faceDim, weight = FontWeight.Medium)
            // UI-21: scores only, the scores are the kits.
            kits(measurer, "1" to home.second, "2" to away.second, y(0.21f), 8.6f * u)
        }
        val long = screen.clock.length > 5
        if (setup.clocks == "sideBySide") {
            val size = if (long) 14.5f else 17.5f
            put(screen.clock, 27f, 0.5f, size, figure = true)
            drawLine(faceRule, Offset(50 * u, y(0.5f) - h * 0.08f * u), Offset(50 * u, y(0.5f) + h * 0.08f * u), strokeWidth = 0.6f * u)
            put(screen.second ?: "", 73f, 0.5f, size, figure = true)
        } else {
            put(screen.clock, 50f, 0.5f, if (setup.names) (if (long) 24f else 29f) else if (long) 28f else if (setup.clocks == "stacked") 30f else 33f, figure = true)
        }
        if (screen.added != null) put(screen.added, 50f, 0.69f, 9f, faceStoppage)
        else if (setup.clocks == "stacked") put(screen.second ?: "", 50f, 0.69f, 10f, faceDim)
        pills(measurer, listOfNotNull(screen.stoppage?.let { Triple(it.text, it.solid, faceStoppage) }, screen.breakPill?.let { Triple(it.text, it.solid, faceBreak) }),
            y(if (apple) 0.84f else 0.835f), (if (apple) 7.8f else 7.5f) * u, u)
        if (edge == "time") put(time, 50f, 0.945f, 5f, faceDim, weight = FontWeight.Medium)
    }
}

/** UI-23: the ring, filling clockwise from 12 o'clock, or emptying when the match clock counts down; full orange in added time. */
private fun DrawScope.ring(apple: Boolean, progress: Float, down: Boolean, u: Float, h: Float) {
    val pen = 2.7f * u
    val inset = pen / 2
    val path = Path()
    if (apple) {
        val r = 22 * u - inset
        val right = size.width - inset
        val bottom = h * u - inset
        path.moveTo(size.width / 2, inset)
        path.lineTo(right - r, inset)
        path.arcTo(androidx.compose.ui.geometry.Rect(right - 2 * r, inset, right, inset + 2 * r), -90f, 90f, false)
        path.lineTo(right, bottom - r)
        path.arcTo(androidx.compose.ui.geometry.Rect(right - 2 * r, bottom - 2 * r, right, bottom), 0f, 90f, false)
        path.lineTo(inset + r, bottom)
        path.arcTo(androidx.compose.ui.geometry.Rect(inset, bottom - 2 * r, inset + 2 * r, bottom), 90f, 90f, false)
        path.lineTo(inset, inset + r)
        path.arcTo(androidx.compose.ui.geometry.Rect(inset, inset, inset + 2 * r, inset + 2 * r), 180f, 90f, false)
        path.close()
    } else {
        path.addArc(androidx.compose.ui.geometry.Rect(inset, inset, size.width - inset, size.width - inset), -90f, 359.99f)
    }
    val done = progress >= 1f
    drawPath(path, if (done) faceStoppage else faceTrack, style = Stroke(pen))
    if (done || (!down && progress <= 0f)) return
    val measure = PathMeasure().apply { setPath(path, false) }
    val part = Path()
    val length = measure.length
    if (down) measure.getSegment(progress * length, length, part) else measure.getSegment(0f, progress * length, part)
    drawPath(part, faceRing, style = Stroke(pen))
}

private fun DrawScope.pills(measurer: TextMeasurer, pills: List<Triple<String, Boolean, Color>>, y: Float, size: Float, u: Float) {
    if (pills.isEmpty()) return
    val gap = 2 * u
    val height = size * 1.45f
    val style = { color: Color -> TextStyle(fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontSize = (size / density / fontScale).sp, color = color) }
    val widths = pills.map { (text) -> measurer.measure(text, style(Color.White)).size.width + size * 1.2f }
    var x = (this.size.width - widths.sum() - gap * (pills.size - 1)) / 2
    pills.forEachIndexed { i, (text, solid, color) ->
        val topLeft = Offset(x, y - height / 2)
        if (solid) drawRoundRect(color, topLeft, Size(widths[i], height), CornerRadius(height / 2))
        else drawRoundRect(color, topLeft, Size(widths[i], height), CornerRadius(height / 2), style = Stroke(0.8f * u))
        val result = measurer.measure(text, style(if (solid) Color.Black else color))
        drawText(result, topLeft = Offset(x + (widths[i] - result.size.width) / 2, y - result.size.height / 2f))
        x += widths[i] + gap
    }
}

private fun DrawScope.label(measurer: TextMeasurer, text: String, x: Float, y: Float, size: Float, color: Color, figure: Boolean, weight: FontWeight) {
    val result = measurer.measure(text, faceStyle(size, color, figure, weight), softWrap = false)
    drawText(result, topLeft = Offset(x - result.size.width / 2f, y - result.size.height / 2f))
}

private val teamRed = Color(0xFFC62828)
private val teamBlue = Color(0xFF1565C0)

private val faceBlank = Color(0xFF3A403D)

/**
 * UI-10: the two teams as kits, as the watches draw them: the same width (the wider name's, with room either side),
 * a little apart either side of the middle and cut on one diagonal leaning as "/", 0.21 of the height either way;
 * each name upright in the middle of its part, black or white by contrast. Returns how far out they reach from the middle.
 */
private fun DrawScope.kits(measurer: TextMeasurer, home: Pair<String, Color>, away: Pair<String, Color>, y: Float, size: Float): Float {
    val h = size * 1.28f
    val d = h * 0.21f
    val gap = h * 0.11f
    val texts = listOf(home, away).map { (text, fill) -> measurer.measure(text, faceStyle(size, onKit(fill), false, FontWeight.SemiBold), softWrap = false) }
    val width = texts.maxOf { it.size.width } + h * 0.72f
    val mid = this.size.width / 2
    val top = y - h / 2
    val bottom = y + h / 2
    val shapes = listOf(
        Path().apply { moveTo(mid - gap / 2 - width, top); lineTo(mid - gap / 2 + d, top); lineTo(mid - gap / 2 - d, bottom); lineTo(mid - gap / 2 - width, bottom); close() },
        Path().apply { moveTo(mid + gap / 2 + d, top); lineTo(mid + gap / 2 + width, top); lineTo(mid + gap / 2 + width, bottom); lineTo(mid + gap / 2 - d, bottom); close() },
    )
    listOf(home, away).forEachIndexed { i, (_, fill) ->
        drawPath(shapes[i], fill)
        val center = if (i == 0) mid - gap / 2 - width / 2 else mid + gap / 2 + width / 2
        drawText(texts[i], topLeft = Offset(center - texts[i].size.width / 2f, y - texts[i].size.height / 2f))
    }
    return gap / 2 + width
}

/** UI-10: black or white, whichever has the higher WCAG contrast ratio against the kit. */
private fun onKit(fill: Color): Color = fill.luminance().let { if ((it + 0.05f) / 0.05f >= 1.05f / (it + 0.05f)) Color.Black else faceText }

private fun DrawScope.labelEnd(measurer: TextMeasurer, text: String, x: Float, y: Float, size: Float) {
    val result = measurer.measure(text, faceStyle(size, faceText, false, FontWeight.SemiBold), softWrap = false)
    drawText(result, topLeft = Offset(x - result.size.width, y - result.size.height / 2f))
}

private fun DrawScope.labelStart(measurer: TextMeasurer, text: String, x: Float, y: Float, size: Float) {
    val result = measurer.measure(text, faceStyle(size, faceText, false, FontWeight.SemiBold), softWrap = false)
    drawText(result, topLeft = Offset(x, y - result.size.height / 2f))
}

private fun DrawScope.faceStyle(size: Float, color: Color, figure: Boolean, weight: FontWeight) = TextStyle(
    fontFamily = if (figure) BarlowCondensed else Barlow, fontWeight = if (figure) FontWeight.Bold else weight,
    fontSize = (size / density / fontScale).sp, color = color,
)
