package app.lawfive.wear

import android.app.RemoteInput
import android.view.inputmethod.EditorInfo
import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.input.RemoteInputIntentHelper
import androidx.wear.input.wearableExtender
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.JsonObject
import java.text.DateFormat
import java.util.Date

// The screens before and after a match (UI-15 to UI-20, on a watch that isn't Garmin): a stack of
// pages, Back going down it, and the match screen in place of all of them while a match is on.

sealed interface Page {
    data object Home : Page
    data object Matches : Page
    data object NewMatch : Page
    data object Custom : Page
    data object History : Page
    data object Settings : Page
    data object Screen : Page
    data object Alerts : Page
    data object Controls : Page
    data object Permissions : Page
    data object Account : Page
    data object TimerNames : Page
    data object Quick : Page
    data object About : Page
    data object TeamColors : Page
    data class ColorChoice(val home: Boolean) : Page
    data class Played(val created: Long) : Page
    data class Pitch(val matchId: String?, val created: Long?) : Page
    data object Link : Page
    data object ServerAddress : Page
    data class Planned(val id: String) : Page
    data class Picker(val title: String, val values: List<Pair<Int, String>>, val current: Int, val pick: (Int) -> Unit) : Page
    /** UI-8: two digits, from [min] to [max]. */
    data class Digits(val title: String, val unit: String, val current: Int, val min: Int, val max: Int, val pick: (Int) -> Unit) : Page
}

@Composable
fun LawFiveWatch(button: SharedFlow<Unit>) {
    Pages(button)
    // UI-26: over the home or full-time screen only, never a match being played or a menu in use.
    if (AppState.screenFree && AppState.wantsSyncScreen) AppState.openSyncScreen()
    if (AppState.syncScreen) SyncScreen()
}

@Composable
private fun Pages(button: SharedFlow<Unit>) {
    val saved = AppState.saved
    if (saved.match != null) {
        MatchFlow(button)
        return
    }
    // WCH-7: the first time the app opens, what it asks the system for and why, before any of the system's questions.
    if (!saved.permissionsAsked) {
        Box(Modifier.fillMaxSize()) {
            FirstLaunchPermissions()
            TimeOfDay()
        }
        return
    }
    var stack by remember { mutableStateOf(listOf<Page>(Page.Home)) }
    fun push(page: Page) { stack = stack + page }
    fun pop() { stack = stack.dropLast(1) }
    if (stack.size > 1) BackHandler { pop() }
    Box(Modifier.fillMaxSize().swipeBack()) {
        when (val page = stack.last()) {
            Page.Home -> HomePage(::push)
            Page.Matches -> MatchesPage(::push)
            Page.NewMatch -> NewMatchPage(::push)
            Page.Custom -> CustomPage(::push)
            Page.History -> HistoryPage(::push)
            is Page.Played -> PlayedPage(page.created, ::push)
            is Page.Pitch -> PitchPage(page.matchId, page.created, ::pop)
            Page.Settings -> SettingsPage(::push)
            Page.Screen -> ScreenPage(::push)
            Page.Alerts -> AlertsPage()
            Page.Controls -> ControlsPage()
            Page.Permissions -> PermissionsPage()
            Page.Account -> AccountPage(::push, ::pop)
            Page.TimerNames -> TimerNamesPage()
            Page.Quick -> QuickPage(::push)
            Page.About -> AboutPage()
            Page.TeamColors -> TeamColorsPage(::push)
            is Page.ColorChoice -> ColorChoicePage(page.home, ::pop)
            Page.Link -> LinkPage(::pop)
            Page.ServerAddress -> ServerPage(::pop)
            is Page.Planned -> PlannedPage(page.id, ::push)
            is Page.Picker -> WatchList(page.title) {
                items(page.values) { (value, label) ->
                    MenuRow(label, if (value == page.current) "Chosen" else null) { page.pick(value); pop() }
                }
            }
            is Page.Digits -> DigitsEntry(page.title, page.unit, page.current, page.min, page.max) { page.pick(it); pop() }
        }
        // UI-25: at the top of the menus and lists; at the bottom of the screens that aren't one.
        val page = stack.last()
        TimeOfDay(bottom = page == Page.Link || page == Page.ServerAddress || page is Page.Digits)
    }
}

private fun plannedTitle(m: JsonObject) = m.str("title") ?: "${m.str("home")} v ${m.str("away")}"

private fun syncLine(): String {
    val s = AppState.saved
    if (AppState.syncing) return "Syncing…"
    AppState.syncProblem?.let { return it }
    val at = s.lastSync ?: return "Not synced yet"
    val minutes = (System.currentTimeMillis() / 1000 - at) / 60
    return when {
        minutes < 1 -> "Synced just now"
        minutes < 60 -> "Synced $minutes min ago"
        else -> "Synced ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at * 1000))}"
    }
}

/** UI-15. */
@Composable
private fun HomePage(push: (Page) -> Unit) {
    ScreenFree()
    val s = AppState.saved
    WatchList("LawFive") {
        item {
            val next = s.matches.firstOrNull()
            MenuRow("Matches", if (!AppState.linked) "Link to get your matches" else next?.let(::plannedTitle) ?: "None coming up", R.drawable.ph_matches) {
                push(if (AppState.linked) Page.Matches else Page.Link)
            }
        }
        item { MenuRow("New match", "Quick · ${formatSummary(s.quick)}", R.drawable.ph_plus) { push(Page.NewMatch) } }
        item { MenuRow("History", if (s.history.isEmpty()) "None yet" else "${s.history.size} kept", R.drawable.ph_history) { push(Page.History) } }
        item { MenuRow("Settings", if (AppState.linked) "Linked" else "Not linked", R.drawable.ph_settings) { push(Page.Settings) } }
    }
}


/** SET-13: "2×45' · HT 15' · ET · Pens · SB 10' · Stop clock", for Same as last. */
private fun fullSummary(f: MatchSetup) = formatSummary(f) + (if (!f.extraTime) "" else if (f.goldenGoal) " · ET GG" else " · ET") + (if (f.penalties) " · Pens" else "") +
    (if (f.sinBins) " · SB ${sinBinLength(f.sinBinSec)}" else "") + if (f.stoppingClock) " · Stop clock" else ""

/** EVT-12: a sin bin's length, "10'", or "1:30" for a length that isn't whole minutes (set on the website). */
private fun sinBinLength(sec: Int) = if (sec % 60 == 0) "${sec / 60}'" else formatClock(sec * 1000L)

/** UI-16. */
@Composable
private fun MatchesPage(push: (Page) -> Unit) {
    val s = AppState.saved
    WatchList("Matches") {
        item { MenuRow("Sync now", syncLine(), R.drawable.ph_sync) { AppState.sync() } }
        if (s.matches.isEmpty()) item { T("No matches coming up", 13.sp, C.dim, modifier = Modifier.padding(top = 10.dp)) }
        items(s.matches) { m ->
            val at = m.int("kickoff")?.let { DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it * 1000L)) }
            MenuRow(plannedTitle(m), at) { push(Page.Planned(m.str("id") ?: "")) }
        }
    }
}

/** A downloaded match's format, as the server sends it (GET /v1/watch/matches). */
internal fun setupOf(m: JsonObject) = MatchSetup(
    matchId = m.str("id"), home = m.str("home") ?: "HOM", away = m.str("away") ?: "AWY",
    homeName = m.str("homeName") ?: "", awayName = m.str("awayName") ?: "",
    homeColor = m.int("homeColor") ?: -1, awayColor = m.int("awayColor") ?: -1,
    numPeriods = m.int("numPeriods") ?: 2, periodSec = m.int("periodSec") ?: 2700, halftimeSec = m.int("halftimeSec") ?: 900,
    teamSize = m.int("teamSize") ?: 11, midBreak = m.bool("midBreak") ?: false, breakLenSec = m.int("breakLenSec") ?: 120,
    extraTime = m.bool("extraTime") ?: false, etPeriods = m.int("etPeriods") ?: 2, etPeriodSec = m.int("etPeriodSec") ?: 900,
    goldenGoal = m.bool("goldenGoal") ?: false,
    penalties = m.bool("penalties") ?: false, clockStyle = m.int("clockStyle") ?: CLOCK_UP, trackStoppage = m.bool("trackStoppage") ?: false,
    breakStoppage = m.bool("breakStoppage") ?: true, goalScorers = m.bool("goalScorers") ?: true, goalTypes = m.bool("goalTypes") ?: false,
    // EVT-12: off and 10 minutes when a server sends neither.
    sinBins = m.bool("sinBins") ?: false, sinBinSec = m.int("sinBinSec") ?: 600,
    // TMR-15: the clock runs on, and goals and cards would stop it, when a server sends neither.
    stoppingClock = m.bool("stoppingClock") ?: false, stopForGoalsCards = m.bool("stopForGoalsCards") ?: true,
    // EVT-14: its competition's scheme, else the account's; a server from before it sends none.
    misconductScheme = m.str("misconductScheme"),
)

/** UI-19: a downloaded match's own screen. */
@Composable
private fun PlannedPage(id: String, push: (Page) -> Unit) {
    val m = AppState.saved.matches.firstOrNull { it.str("id") == id } ?: return
    WatchList(plannedTitle(m)) {
        item { MenuRow("Start match", formatSummary(setupOf(m)), R.drawable.ph_play) { AppState.beginMatch(setupOf(m)) } }
        // TRK-13: walking the pitch before the match.
        item { MenuRow("Mark pitch", "Walk its corners", R.drawable.ph_flag) { push(Page.Pitch(id, null)) } }
        (m["fee"] as? JsonObject)?.let { fee ->
            item { ToggleRow("Fee ${fee.str("text") ?: ""}", fee.bool("paid") == true, if (fee.bool("paid") == true) "Paid" else "Not paid yet") { paid -> AppState.markPaid(id, paid) } }
        }
        listOf(m.str("where"), m.str("name"), m.str("role"), m.str("weather"), m.str("notes")).filterNotNull().forEach { line ->
            item { T(line, 13.sp, C.dim, FontWeight.Normal, Modifier.padding(horizontal = 8.dp, vertical = 1.dp)) }
        }
    }
}

/** SET-4, SET-9, UI-16. */
@Composable
private fun NewMatchPage(push: (Page) -> Unit) {
    val quick = AppState.saved.quick
    val last = AppState.saved.lastFormat
    WatchList("New match") {
        item { MenuRow("Quick match", formatSummary(quick), R.drawable.ph_quick) { AppState.beginMatch(quick) } }
        // SET-13: once a match has been played, starting straight away; not when it's Quick match over again.
        if (last != null && !last.sameFormat(quick)) item { MenuRow("Same as last", formatSummary(last), R.drawable.ph_undo) { AppState.beginMatch(last) } }
        item { MenuRow("Custom", "Choose the format", R.drawable.ph_sliders) { AppState.startDraft(); push(Page.Custom) } }
    }
}

/**
 * SET-9's rows, in its order, for Create match and Quick match: rows that only matter when a switch is
 * on come straight after it. [set] changes the format being edited as it is when a choice is made.
 */
private fun LazyListScope.formatRows(f: MatchSetup, push: (Page) -> Unit, set: ((MatchSetup) -> MatchSetup) -> Unit) {
    // SET-8: the timers' names as they are now.
    val stoppage = AppState.saved.stoppageLabel
    val brk = AppState.saved.breakLabel
    fun minutes(title: String, range: IntProgression, current: Int, pick: (Int) -> Unit) =
        push(Page.Picker(title, range.map { it to "$it min" }, current / 60) { pick(it * 60) })
    item { MenuRow("Periods", "${f.numPeriods}") { push(Page.Picker("Periods", listOf(1 to "1", 2 to "2", 3 to "3", 4 to "4"), f.numPeriods) { v -> set { it.copy(numPeriods = v) } }) } }
    item { MenuRow("Period length", "${f.periodSec / 60} min") { minutes("Period length", 5..60 step 5, f.periodSec) { v -> set { it.copy(periodSec = v) } } } }
    // SET-16: one period's break is only before extra time.
    val breakName = when (f.numPeriods) { 2 -> "Half-time"; 1 -> "Break before ET"; else -> "Between periods" }
    item { MenuRow(breakName, "${f.halftimeSec / 60} min") { minutes(breakName, 0..30 step 5, f.halftimeSec) { v -> set { it.copy(halftimeSec = v) } } } }
    item { MenuRow("Team size", "${f.teamSize}") { push(Page.Picker("Team size", (11 downTo 4).map { it to "$it" }, f.teamSize) { v -> set { it.copy(teamSize = v) } }) } }
    // TMR-15: the clock that stops, with stoppage tracking going with it (so its row is left out), and whether goals and cards stop it.
    item {
        MenuRow("Clock", if (f.stoppingClock) "Stops" else "Runs on") {
            push(Page.Picker("Clock", listOf(0 to "Runs on", 1 to "Stops"), if (f.stoppingClock) 1 else 0) { v -> set { it.copy(stoppingClock = v == 1, trackStoppage = it.trackStoppage || v == 1) } })
        }
    }
    if (f.stoppingClock) {
        item { ToggleRow("Goals, cards stop", f.stopForGoalsCards, if (f.stopForGoalsCards) "Stop the clock" else "Off") { v -> set { it.copy(stopForGoalsCards = v) } } }
    } else {
        item { ToggleRow("Track $stoppage", f.trackStoppage, if (f.trackStoppage) "On" else "Off") { v -> set { it.copy(trackStoppage = v) } } }
    }
    item { ToggleRow("Goal scorers", f.goalScorers, if (f.goalScorers) "Ask for the number" else "Off") { v -> set { it.copy(goalScorers = v) } } }
    item { ToggleRow("Goal types", f.goalTypes, if (f.goalTypes) "DFK, penalty, own goal" else "Off") { v -> set { it.copy(goalTypes = v) } } }
    item { ToggleRow("Extra time", f.extraTime, if (f.extraTime) "On" else "Off") { v -> set { it.copy(extraTime = v) } } }
    if (f.extraTime) {
        item { MenuRow("ET periods", "${f.etPeriods}") { push(Page.Picker("ET periods", listOf(1 to "1", 2 to "2"), f.etPeriods) { v -> set { it.copy(etPeriods = v) } }) } }
        item { MenuRow("ET period length", "${f.etPeriodSec / 60} min") { minutes("ET period length", 5..30 step 5, f.etPeriodSec) { v -> set { it.copy(etPeriodSec = v) } } } }
        // ET-6.
        item { ToggleRow("Golden goal", f.goldenGoal, if (f.goldenGoal) "First ET goal wins" else "Off") { v -> set { it.copy(goldenGoal = v) } } }
    }
    item { ToggleRow("Penalties", f.penalties, if (f.penalties) "On" else "Off") { v -> set { it.copy(penalties = v) } } }
    item { ToggleRow("Halfway $brk", f.midBreak, if (f.midBreak) "At ${formatClock((f.periodSec - f.breakLenSec) / 2 * 1000L)}" else "Off") { v -> set { it.copy(midBreak = v) } } }
    if (f.midBreak) {
        item { MenuRow("${brk.capitalized()} length", formatClock(f.breakLenSec * 1000L)) {
            push(Page.Picker("${brk.capitalized()} length", (30..300 step 30).map { it to formatClock(it * 1000L) }, f.breakLenSec) { v -> set { it.copy(breakLenSec = v) } })
        } }
        // TMR-12: only with a stoppage clock to add it to; a stopping clock stops for the break anyway (TMR-15).
        if (f.trackStoppage && !f.stoppingClock) item { ToggleRow("${brk.capitalized()} as $stoppage", f.breakStoppage, if (f.breakStoppage) "Time added on" else "Off") { v -> set { it.copy(breakStoppage = v) } } }
    }
    // EVT-12: Sin bin in the team menu, and its length straight after, in minutes on two digits (UI-8).
    val binMinutes = if (f.sinBinSec % 60 == 0) "${f.sinBinSec / 60} min" else formatClock(f.sinBinSec * 1000L)
    item { ToggleRow("Sin bins", f.sinBins, if (f.sinBins) "In the team menu" else "Off") { v -> set { it.copy(sinBins = v) } } }
    if (f.sinBins) {
        item {
            MenuRow("Sin bin length", binMinutes) {
                push(Page.Digits("Sin bin length", "Minutes, 1 to 20", (f.sinBinSec / 60).coerceIn(1, 20), 1, 20) { v -> set { it.copy(sinBinSec = v * 60) } })
            }
        }
    }
}

/** SET-9, SET-13, SET-14: Create match, from the last match's format, with Same as last on, once there is one. */
@Composable
private fun CustomPage(push: (Page) -> Unit) {
    val f = AppState.draft
    val hasLast = AppState.saved.lastFormat != null
    val same = hasLast && AppState.sameAsLast
    WatchList("Create match") {
        if (hasLast) item { ToggleRow("Same as last", same, if (same) fullSummary(f) else "Change below") { AppState.chooseSameAsLast(it) } }
        item { MenuRow("Start match", if (same) null else formatSummary(f), R.drawable.ph_play) { AppState.beginMatch(f) } }
        if (!same) formatRows(f, push) { change -> AppState.draft = change(AppState.draft) }
        // SET-14: last, and shown with Same as last on too, as colors change from match to match.
        item { MenuRow("Team colors", colorsSummary(f)) { push(Page.TeamColors) } }
    }
}

/** "HOM Red · AWY Blue", or "None" when neither team has one. */
private fun colorsSummary(f: MatchSetup) =
    if (f.homeColor < 0 && f.awayColor < 0) "None" else "${f.home} ${colorName(f.homeColor)} · ${f.away} ${colorName(f.awayColor)}"

/** SET-14. */
@Composable
private fun TeamColorsPage(push: (Page) -> Unit) {
    val f = AppState.draft
    WatchList("Team colors") {
        item { MenuRow("Home team", colorName(f.homeColor), swatch = f.homeColor) { push(Page.ColorChoice(home = true)) } }
        item { MenuRow("Away team", colorName(f.awayColor), swatch = f.awayColor) { push(Page.ColorChoice(home = false)) } }
    }
}

@Composable
private fun ColorChoicePage(home: Boolean, pop: () -> Unit) {
    val f = AppState.draft
    val current = if (home) f.homeColor else f.awayColor
    WatchList(if (home) "Home color" else "Away color") {
        items(teamColorChoices) { (value, name) ->
            MenuRow(name, if (value == current) "Chosen" else null, swatch = value) {
                AppState.draft = if (home) AppState.draft.copy(homeColor = value) else AppState.draft.copy(awayColor = value)
                pop()
            }
        }
    }
}

/** UI-17: Quick match's format, with Create match's rows, kept as it's changed. */
@Composable
private fun QuickPage(push: (Page) -> Unit) {
    WatchList("Quick match") {
        formatRows(AppState.saved.quick, push) { change -> AppState.update { it.copy(quick = change(it.quick)) } }
    }
}

private fun playedTitle(h: Finished): String {
    val pens = h.pens?.let { " (${it[0]}-${it[1]})" } ?: if (h.golden) " (GG)" else ""
    return "${h.home} ${h.score[0]}-${h.score[1]}$pens ${h.away}"
}

private fun sentLine(h: Finished) = if (h.sent) "Sent" else if (AppState.linked) "Waiting to send" else "Not sent"

@Composable
private fun HistoryPage(push: (Page) -> Unit) {
    val s = AppState.saved
    WatchList("History") {
        if (s.history.isEmpty()) item { T("Finished matches show here", 13.sp, C.dim, modifier = Modifier.padding(top = 10.dp)) }
        items(s.history) { h -> MenuRow(playedTitle(h), sentLine(h)) { push(Page.Played(h.created)) } }
    }
}

/** UI-17, UI-20: a played match from History, with Mark pitch (TRK-13). */
@Composable
private fun PlayedPage(created: Long, push: (Page) -> Unit) {
    val h = AppState.saved.history.firstOrNull { it.created == created } ?: return
    WatchList(playedTitle(h)) {
        item { T(sentLine(h), 13.sp, C.dim, FontWeight.Normal, Modifier.padding(bottom = 4.dp)) }
        item { MenuRow("Mark pitch", "Walk its corners", R.drawable.ph_flag) { push(Page.Pitch(h.matchId, h.created)) } }
    }
}

/** UI-17. */
@Composable
private fun SettingsPage(push: (Page) -> Unit) {
    val s = AppState.saved
    val context = LocalContext.current
    val resumes = AppState.resumes
    val missing = remember(resumes) { missingAsks(context) }
    WatchList("Settings") {
        item { MenuRow("Account", if (AppState.linked) syncLine() else "Not linked", R.drawable.ph_account) { push(Page.Account) } }
        item { MenuRow("Alerts", listOf(s.vibeFullTime, s.vibeAdded, s.vibeSinBin, s.vibeBreak, s.vibeStoppage).count { it }.let { if (it == 5) "All on" else if (it == 0) "All off" else "$it of 5 on" }, R.drawable.ph_alerts) { push(Page.Alerts) } }
        // UI-17: how the match is run by hand, apart from what it vibrates for.
        item { MenuRow("Controls", "Tap for ${s.stoppageLabel}: ${if (s.tapStoppage) "on" else "off"}", R.drawable.ph_controls) { push(Page.Controls) } }
        // TRK-7: linked or not, as a watch linked later sends its tracks too.
        item { ToggleRow("Record track", s.recordTrack, trackLine(s.recordTrack)) { v -> AppState.update { it.copy(recordTrack = v) } } }
        item { MenuRow("Match screen", screenSummary(s.chosenScreen), R.drawable.ph_watch) { push(Page.Screen) } }
        item { MenuRow("Timer names", "${s.stoppageLabel.capitalized()} · ${s.breakLabel}", R.drawable.ph_text) { push(Page.TimerNames) } }
        item { MenuRow("Quick match", formatSummary(s.quick), R.drawable.ph_quick) { push(Page.Quick) } }
        // WCH-7: only while something's refused, so it's easy to find again.
        if (missing.isNotEmpty()) item { MenuRow("Permissions", if (missing.size == 1) "${missing[0].name} not allowed" else "${missing.size} not allowed", R.drawable.ph_permissions) { push(Page.Permissions) } }
        item { MenuRow("About", "LawFive for Wear OS", R.drawable.ph_info) { push(Page.About) } }
    }
}

// UI-21: indexed by the CLOCKS_, CLOCK_, BREAK_ and EDGE_ values.
private val clocksNames = listOf("One clock", "Two, stacked", "Two, side by side")
/** TMR-11: with the example for a 2 × 45 match. */
val clockStyleNames = listOf("Match time", "Each half from 0", "Time left")
private val clockStyleHints = listOf("0 to 90, like TV", "0 to 45, then again", "45 down to 0")
private val breakNames = listOf("Time left", "Time taken")
private val edgeNames = listOf("Neither", "Ring", "Time of day")

/** "One clock · Match time · Ring", for Settings. */
private fun screenSummary(w: WatchScreen) = "${clocksNames[w.clocks]} · ${clockStyleNames[w.mainClock]}" + if (w.edge == EDGE_NONE) "" else " · ${edgeNames[w.edge]}"

/** UI-21 to UI-24, TMR-4, TMR-11. */
@Composable
private fun ScreenPage(push: (Page) -> Unit) {
    val w = AppState.saved.chosenScreen
    val round = LocalConfiguration.current.isScreenRound
    fun styles(skip: Int = -1) = (0..2).filter { it != skip }.map { it to clockStyleNames[it] }
    WatchList("Match screen") {
        item { MenuRow("Clocks", clocksNames[w.clocks]) { push(Page.Picker("Clocks", clocksNames.mapIndexed { i, n -> i to n }, w.clocks) { v -> AppState.chooseScreen { it.copy(clocks = v) } }) } }
        item { MenuRow("Match clock", "${clockStyleNames[w.mainClock]}: ${clockStyleHints[w.mainClock]}") { push(Page.Picker("Match clock", styles(), w.mainClock) { v -> AppState.chooseScreen { it.copy(mainClock = v) } }) } }
        item { MenuRow("Second clock", if (w.clocks == CLOCKS_ONE) "With two clocks" else clockStyleNames[w.second]) { push(Page.Picker("Second clock", styles(w.mainClock), w.second) { v -> AppState.chooseScreen { it.copy(secondClock = v) } }) } }
        item { MenuRow("Break clock", breakNames[w.breakClock]) { push(Page.Picker("Break clock", breakNames.mapIndexed { i, n -> i to n }, w.breakClock) { v -> AppState.chooseScreen { it.copy(breakClock = v) } }) } }
        // UI-23: a square watch shows the time where the ring would be.
        item { MenuRow("Ring or time", if (!round && w.edge == EDGE_RING) "Ring · time on this watch" else edgeNames[w.edge]) {
            push(Page.Picker("Ring or time", listOf(EDGE_RING, EDGE_TIME, EDGE_NONE).map { it to edgeNames[it] }, w.edge) { v -> AppState.chooseScreen { it.copy(edge = v) } })
        } }
        item { ToggleRow("Team names", w.names, if (w.names) "Over the clock" else "Scores only") { v -> AppState.chooseScreen { it.copy(names = v) } } }
    }
}

@Composable
private fun AlertsPage() {
    val s = AppState.saved
    WatchList("Alerts") {
        item { ToggleRow("Full time", s.vibeFullTime, "End of each period") { v -> AppState.update { it.copy(vibeFullTime = v) } } }
        item { ToggleRow("Added time", s.vibeAdded, "Vibrate when it's used up") { v -> AppState.update { it.copy(vibeAdded = v) } } }
        // EVT-12: until a button, as full time's.
        item { ToggleRow("Sin bin over", s.vibeSinBin, "When a player can return") { v -> AppState.update { it.copy(vibeSinBin = v) } } }
        item { ToggleRow("Breaks", s.vibeBreak, "When due and over") { v -> AppState.update { it.copy(vibeBreak = v) } } }
        item { ToggleRow("Stoppage", s.vibeStoppage, "Remind while it runs") { v -> AppState.update { it.copy(vibeStoppage = v) } } }
    }
}

/** UI-17, INP-4: the match's controls, apart from the alerts. */
@Composable
private fun ControlsPage() {
    val s = AppState.saved
    WatchList("Controls") {
        item { ToggleRow("Tap for ${s.stoppageLabel}", s.tapStoppage, "Tap starts and ends it") { v -> AppState.update { it.copy(tapStoppage = v) } } }
        // EVT-14: the misconduct codes after a card's number (or a team official's role).
        item { ToggleRow("Card reasons", s.cardReasons, if (s.cardReasons) "Ask after the number" else "Off") { v -> AppState.update { it.copy(cardReasons = v) } } }
    }
}

/** WCH-7: what Record track records, and what it can't without its permissions (PERM-1). */
@Composable
private fun trackLine(on: Boolean): String {
    if (!on) return "Off"
    val context = LocalContext.current
    val location = Workout.hasLocation(context)
    val heart = Workout.hasHeartRate(context)
    return when {
        location && heart -> "GPS and heart rate"
        location -> "GPS · no heart rate"
        heart -> "Heart rate · no GPS"
        else -> "No GPS or heart rate"
    }
}

@Composable
private fun AccountPage(push: (Page) -> Unit, pop: () -> Unit) {
    var confirming by remember { mutableStateOf(false) }
    if (confirming) {
        ConfirmScreen("Unlink this watch?", "Matches waiting to send stay", danger = true, onYes = { AppState.unlink(); confirming = false; pop() }, onNo = { confirming = false })
        return
    }
    WatchList("Account") {
        if (AppState.linked) {
            item { MenuRow("Sync now", syncLine(), R.drawable.ph_sync) { AppState.sync() } }
            item { MenuRow("Unlink", AppState.serverUrl.removePrefix("https://").removePrefix("http://")) { confirming = true } }
        } else {
            item { MenuRow("Link account", "Get a code", R.drawable.ph_link) { push(Page.Link) } }
            item { MenuRow("Server", AppState.serverUrl.removePrefix("https://").removePrefix("http://")) { push(Page.ServerAddress) } }
        }
    }
}

/**
 * The watch's own text entry (RemoteInput), which shows the text as it's typed on every keyboard;
 * Samsung's covers a text field in the app and shows nothing until it closes. Returns what opens it.
 */
@Composable
private fun rememberTextEntry(label: String, typed: (String) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data ?: return@rememberLauncherForActivityResult
        RemoteInput.getResultsFromIntent(data)?.getCharSequence(TEXT_INPUT)?.let { typed(it.toString().trim()) }
    }
    return {
        val input = RemoteInput.Builder(TEXT_INPUT).setLabel(label)
            .wearableExtender { setEmojisAllowed(false); setInputActionType(EditorInfo.IME_ACTION_DONE) }
            .build()
        launcher.launch(RemoteInputIntentHelper.createActionRemoteInputIntent().also { RemoteInputIntentHelper.putRemoteInputsExtra(it, listOf(input)) })
    }
}

/** UI-17, SET-8: the stoppage and break timers' names, typed on the watch; a blank name is the default. */
@Composable
private fun TimerNamesPage() {
    val s = AppState.saved
    val typeStoppage = rememberTextEntry("Stoppage timer") { name -> AppState.update { it.copy(stoppageName = name.take(16)) } }
    val typeBreak = rememberTextEntry("Break timer") { name -> AppState.update { it.copy(breakName = name.take(16)) } }
    WatchList("Timer names") {
        item { MenuRow("Stoppage timer", s.stoppageLabel) { typeStoppage() } }
        item { MenuRow("Break timer", s.breakLabel) { typeBreak() } }
        if (s.stoppageName.isNotBlank() || s.breakName.isNotBlank()) {
            item { MenuRow("Use the defaults", "stoppage · break") { AppState.update { it.copy(stoppageName = "", breakName = "") } } }
        }
    }
}

/** VER-2: the app's version and the server's; DATA-8: Reset LawFive, last. */
@Composable
private fun AboutPage() {
    val s = AppState.saved
    val activity = LocalContext.current as? Activity
    var confirming by remember { mutableStateOf(false) }
    if (AppState.resetting) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) { T("Resetting…", 15.sp, C.dim) }
        return
    }
    if (confirming) {
        ConfirmScreen("Reset LawFive?", "Erases matches, history and the link. Settings stay.", yes = "Reset", danger = true,
            onYes = { confirming = false; AppState.reset { activity?.finishAndRemoveTask() } }, onNo = { confirming = false })
        return
    }
    WatchList("About") {
        item { MenuRow("LawFive for Wear OS", "Version ${BuildConfig.VERSION_NAME}") {} }
        item { MenuRow("Server", AppState.serverUrl.removePrefix("https://").removePrefix("http://")) {} }
        s.serverVersion?.let { item { MenuRow("Server version", it) {} } }
        item { MenuRow("History", "${s.history.size} of $HISTORY_KEPT matches kept") {} }
        item { MenuRow("Open source", "lawfive.dev") {} }
        item { MenuRow("Reset LawFive", "Erase everything here") { confirming = true } }
    }
}

/** SYNC-9: a self-hosted server's address. */
@Composable
private fun ServerPage(pop: () -> Unit) {
    var text by remember { mutableStateOf(AppState.saved.server ?: "") }
    var refused by remember { mutableStateOf(false) }
    val type = rememberTextEntry("Server address") { text = it; refused = false }
    Column(Modifier.fillMaxSize().padding(horizontal = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        T("Server address", 14.sp, weight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().background(C.row, RoundedCornerShape(12.dp)).clickable { type() }.padding(10.dp)) {
            if (text.isEmpty()) T("Tap to type", 14.sp, C.dim, FontWeight.Normal) else T(text, 14.sp, weight = FontWeight.Normal)
        }
        T(if (refused) "It needs https://" else "Empty for LawFive's own", 12.sp, if (refused) C.red else C.dim, FontWeight.Normal, Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(10.dp))
        PillButton("Save") {
            val address = text.ifBlank { null }?.let { if (it.contains("://")) it else "https://$it" }
            // WCH-4: the session's token never goes over plain http, except from a debug build to a test server.
            if (address != null && !address.startsWith("https://") && !BuildConfig.DEBUG) {
                refused = true
            } else {
                AppState.setServer(address)
                pop()
            }
        }
    }
}

/** SYNC-1: a code for the website; approved there, the watch gets its token. */
@Composable
private fun LinkPage(pop: () -> Unit) {
    var code by remember { mutableStateOf<String?>(null) }
    var address by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    LaunchedEffect(attempt) {
        problem = null
        code = null
        try {
            val answer = AppState.deviceFlow().deviceCode()
            val user = answer.str("user_code") ?: ""
            code = if (user.length == 8) user.take(4) + "-" + user.drop(4) else user
            address = (answer.str("verification_uri") ?: (AppState.serverUrl + "/link")).removePrefix("https://").removePrefix("http://")
            val device = answer.str("device_code") ?: ""
            val interval = (answer.int("interval") ?: 5) * 1000L
            val ends = System.currentTimeMillis() + (answer.int("expires_in") ?: 600) * 1000L
            while (System.currentTimeMillis() < ends) {
                delay(interval)
                try {
                    val token = AppState.deviceFlow().deviceToken(device).str("access_token")
                    if (token != null) {
                        AppState.linkWith(token)
                        pop()
                        return@LaunchedEffect
                    }
                } catch (e: ServerRefused) {
                    when (e.body?.str("error")) {
                        "authorization_pending", "slow_down", null -> Unit
                        "access_denied" -> { problem = "Not linked"; return@LaunchedEffect }
                        else -> { problem = "Code expired"; return@LaunchedEffect }
                    }
                }
            }
            problem = "Code expired"
        } catch (_: Exception) {
            problem = "Can't reach the server"
        }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        val shown = code
        if (problem != null) {
            T(problem!!, 16.sp, C.red, FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            PillButton("Try again") { attempt++ }
        } else if (shown == null) {
            T("Getting a code…", 15.sp, C.dim)
        } else {
            // SYNC-1: the website, or Link a watch in either phone app, takes the code.
            T("Enter this code at", 13.sp, C.dim)
            T(address, 13.sp, weight = FontWeight.SemiBold, lines = 2)
            Spacer(Modifier.height(8.dp))
            T(shown, 26.sp, C.brand, figure = true, lines = 1)
            Spacer(Modifier.height(8.dp))
            T("or in the LawFive phone app", 13.sp, C.dim)
            T("Waiting…", 12.sp, C.dim, FontWeight.Normal)
        }
    }
}

/** UI-12: while the match wants it, the screen stays on. */
@Composable
fun KeepScreenOn(on: Boolean) {
    val activity = LocalContext.current as? MainActivity
    LaunchedEffect(on) { activity?.keepScreenOn(on) }
}

private const val TEXT_INPUT = "text"
