package app.lawfive.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.ReminderSettings
import app.lawfive.data.GetReady
import app.lawfive.data.OnWatchStore
import app.lawfive.data.SettingsDefaults
import app.lawfive.schema.UserSettings
import app.lawfive.schema.UserSettingsGetReady
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.SlabGround
import app.lawfive.ui.components.hardDrop
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.OnPanel
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

// WEB-32: Get ready on Matches, as the website's GetReady.tsx at a phone's width, with Turn on
// reminders in place of Get the phone app. A slab on the grass tagged "N of 5 done" over tile rows:
// the step's number on a board tile, which turns pitch green with a check once it's done; the next
// row to do has the primary button, the buttons under the words sharing the width.

/** What Get ready needs: whether it shows (once what it needs is known), and what's done. */
class GetReadyState(
    val settled: Boolean,
    val show: Boolean,
    val done: GetReady.Done,
    val watches: List<String>,
    val reminders: ReminderSettings,
    val settings: UserSettings,
    val matches: Int,
    val connected: Boolean,
    val feeds: Boolean,
)

/** Get ready's state for Matches, which keeps Did you know back while it shows. */
@Composable
fun rememberGetReady(settings: UserSettings?, matches: Int?): GetReadyState {
    val graph = LocalGraph.current
    val onWatch by graph.onWatch.state.collectAsStateWithLifecycle()
    val reminders by graph.reminders.settings.collectAsStateWithLifecycle(null)
    val feeds by produceState<Boolean?>(null) { value = graph.meta()?.capabilities?.contains("assignor-calendars") ?: false }
    var calendars by remember { mutableStateOf<Int?>(null) }
    val hidden = settings?.getReady?.hidden == true
    LaunchedEffect(Unit) { graph.onWatch.refresh() }
    LaunchedEffect(feeds, hidden) {
        if (feeds == true && !hidden) {
            calendars = runCatching { graph.api.call("GET", "/v1/assignor-calendars")!!.jsonObject["calendars"]!!.jsonArray.size }.getOrDefault(0)
        } else if (feeds == false) calendars = 0
    }
    val zone = java.time.ZoneId.systemDefault().id
    val guess = remember { SettingsDefaults.forLocale() }
    val s = settings ?: guess
    val watches = onWatch.watches?.map(OnWatchStore::watchName) ?: emptyList()
    val r = reminders ?: ReminderSettings()
    val done = GetReady.done(watches.size, r.enabled, s, guess, zone, matches ?: 0, calendars ?: 0)
    // Known either way: hidden, or what it needs has come in (the watches from the last sync with signal).
    val loaded = settings != null && matches != null && reminders != null && onWatch.watches != null && calendars != null
    return GetReadyState(hidden || loaded, loaded && GetReady.shows(s, done), done, watches, r, s, matches ?: 0, (calendars ?: 0) > 0, feeds == true)
}

private class Step(val key: String, val title: String, val done: Boolean, val line: @Composable () -> Unit, val actions: @Composable (lead: Boolean, modifier: Modifier) -> Unit)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun GetReadyList(ready: GetReadyState) {
    if (!ready.show) return
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val zone = java.time.ZoneId.systemDefault().id
    fun keep(change: (UserSettingsGetReady) -> UserSettingsGetReady) {
        scope.launch { graph.records.saveSettings { s -> s.copy(getReady = change(s.getReady ?: UserSettingsGetReady())) } }
    }
    val turnOn = { scope.launch { graph.reminders.update(ready.reminders.copy(enabled = true)) }; Unit }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) turnOn() }
    val d = ready.done
    val muted = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 19.sp)
    val steps = listOf(
        Step("watch", "Link your watch", d.watch, {
            if (ready.watches.isNotEmpty()) Text("Linked: ${ready.watches.joinToString(", ")}", style = muted, color = colors.muted)
            else Text(
                buildAnnotatedString {
                    append("Your next matches go to it, and each one you referee comes back here with every goal and card. Not on your watch yet? ")
                    withLink(LinkAnnotation.Url(WATCHES_URL, TextLinkStyles(SpanStyle(color = colors.brandStrong, fontWeight = FontWeight.Bold, textDecoration = TextDecoration.Underline)))) { append("How to get it") }
                },
                style = muted, color = colors.muted,
            )
        }) { lead, m -> StepButton("Link a watch", Ph.Watch, lead, m) { nav.navigate("link") } },
        Step("reminders", "Turn on reminders", d.reminders, {
            Text(
                if (ready.reminders.enabled) "On: ${ready.reminders.minutesBefore.sortedDescending().joinToString(" and ") { beforeText(it) }} before kickoff"
                else "A notification on this phone before each kickoff, with the venue and directions.",
                style = muted, color = colors.muted,
            )
        }) { lead, m ->
            StepButton("Turn on", Ph.Bell, lead, m) {
                if (Build.VERSION.SDK_INT >= 33 && !graph.reminders.canNotify()) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else turnOn()
            }
        },
        Step("units", "Your units and time zone", d.units, {
            val line = GetReady.unitsLine(ready.settings, zone)
            Text(if (d.units) line else "$line, guessed from this phone.", style = muted, color = colors.muted)
        }) { lead, m ->
            SecondaryButton("Change", { nav.navigate("settings?at=units") }, m)
            StepButton("They're right", Ph.Check, lead, m) { keep { it.copy(unitsConfirmed = true) } }
        },
        Step("games", "Bring in your games", d.games, {
            val n = ready.matches
            val count = "$n ${if (n == 1) "match" else "matches"}"
            Text(
                when {
                    ready.connected -> "Your assignor's calendar is connected" + if (n > 0) ": $count" else ""
                    n > 0 -> "$count so far"
                    ready.feeds -> "Connect your assignor's calendar and your games come in by themselves, kept up to date. Or add one yourself."
                    else -> "Add your next game, or import a season's schedule from a spreadsheet."
                },
                style = muted, color = colors.muted,
            )
        }) { lead, m ->
            // The phone doesn't keep assignor calendars itself: they're added on the website.
            if (ready.feeds) SecondaryButton("Connect a calendar", { openWebsite(context, graph.session.current.server, "/settings#assignor-calendars") }, m, icon = Ph.Calendar)
            else SecondaryButton("Import", { nav.navigate("import") }, m, icon = Ph.Upload)
            StepButton("Add a match", Ph.Plus, lead, m) { nav.navigate("match/new") }
        },
        Step("screen", "Choose your match screen", d.screen, {
            Text(
                if (ready.settings.watchScreen != null) "Chosen. Change it any time in Settings."
                else "What your watch shows while a match runs: which clocks, the time of day and the team names.",
                style = muted, color = colors.muted,
            )
        }) { lead, m -> StepButton("Choose", Ph.Watch, lead, m) { nav.navigate("settings/match-screen") } },
    )
    val lead = steps.first { !it.done }.key
    Slab("Get ready", tag = "${d.count} of ${steps.size} done", ground = SlabGround.Grass, modifier = Modifier.padding(top = 8.dp, bottom = 26.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            steps.forEachIndexed { i, s -> StepRow(i + 1, s, s.key == lead) }
        }
        // As the website's foot: Hide this list in chalk, then the note; both start at the rows' edge, the note under it where they don't fit.
        FlowRow(Modifier.padding(top = 6.dp), itemVerticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            androidx.compose.material3.TextButton(
                { keep { it.copy(hidden = true) } }, Modifier.heightIn(min = 44.dp),
                shape = RoundedCornerShape(6.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            ) { Text("HIDE THIS LIST", color = colors.text, style = MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp)) }
            Text("Everything here is in Settings and More too.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
        }
    }
}

/** The next step's own button is the primary one; the rest are outlines. */
@Composable
private fun StepButton(text: String, icon: Ph, lead: Boolean, modifier: Modifier, onClick: () -> Unit) {
    if (lead) PrimaryButton(text, onClick, modifier, icon = icon) else SecondaryButton(text, onClick, modifier, icon = icon)
}

/** A row: the step's number on a board tile (pitch green with a check once done), then a panel with its name, what it's for or what's done, and its buttons. */
@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun StepRow(number: Int, s: Step, lead: Boolean) {
    val c = colors
    val shape = RoundedCornerShape(4.dp)
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 72.dp).hardDrop(c.panelShadow, shape).clip(shape)) {
        // Done, the tile turns pitch green (the panel's brand, whatever ground the list is on).
        OnPanel {
            val p = colors
            Box(
                Modifier.width(52.dp).fillMaxHeight().background(if (s.done) p.brand else c.board)
                    .then(if (c.dark && !s.done) Modifier.border(1.dp, c.boardEdge, RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp)) else Modifier),
                contentAlignment = Alignment.Center,
            ) {
                if (s.done) PhIcon(Ph.Check, size = 26.dp, tint = p.onBrand)
                else Text("$number", style = LfType.display(28.sp, c.onBoard, 28.sp), maxLines = 1)
            }
        }
        OnPanel {
            Column(
                Modifier.weight(1f).fillMaxHeight().background(colors.surface)
                    .then(if (colors.dark) Modifier.border(1.dp, colors.panelEdge, RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)) else Modifier)
                    .padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.semantics(mergeDescendants = true) { stateDescription = if (s.done) "Done" else "To do" }, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(s.title, style = MaterialTheme.typography.titleMedium.copy(fontSize = 17.sp, fontWeight = FontWeight.ExtraBold), color = if (s.done) colors.muted else colors.text)
                    s.line()
                }
                // Sharing the width where there's room for both, else one under the other, so a button's words are never cut.
                // (By the screen's width: the row's height comes from its intrinsics, which BoxWithConstraints can't give.)
                if (!s.done) {
                    if (androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp >= 460) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { s.actions(lead, Modifier.weight(1f)) }
                    else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) { s.actions(lead, Modifier.fillMaxWidth()) }
                }
            }
        }
    }
}
