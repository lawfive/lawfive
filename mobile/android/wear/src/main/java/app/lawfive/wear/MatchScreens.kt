package app.lawfive.wear

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharedFlow
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.random.Random

// The match (WCH-2, WCH-6): the same phases, layouts (UI-21) and controls as the Garmin watch. Swipe right for
// the home team, left for the away team, up or Back for the game menu (INP-10: a swipe down from the top opens
// the watch's quick settings, so Wear OS always swipes sideways).

private sealed interface Overlay {
    data object GameMenu : Overlay
    data class Team(val team: Int) : Overlay
    data class GoalType(val team: Int) : Overlay
    /** EVT-15: a team official's card, then the role. */
    data class Official(val team: Int) : Overlay
    data class OfficialRole(val team: Int, val red: Boolean) : Overlay
    data class Number(val team: Int, val type: String) : Overlay
    /** EVT-5; EVT-12: a second sin bin's too. */
    data class SecondYellow(val team: Int, val player: Int, val sinBin: Boolean = false) : Overlay
    /** EVT-14: the card's reason, with Card reasons on: the cautions' codes or the send-offs', then [next] (a second yellow's red screen). */
    data class Reason(val team: Int, val sendOff: Boolean, val next: Overlay? = null) : Overlay
    /**
     * TMR-14: Adjust clock (or added time): the period's time (or the stoppage total) in whole seconds when it
     * was chosen, then its minutes, then its seconds; the minutes entered are kept going back from the seconds.
     */
    data class AdjustMinutes(val added: Boolean, val captured: Int, val minutes: Int = minOf(captured / 60, 99)) : Overlay
    data class AdjustSeconds(val added: Boolean, val captured: Int, val minutes: Int) : Overlay
    data class Confirm(val question: String, val detail: String?, val yes: String, val danger: Boolean, val action: () -> Unit) : Overlay
    data object Events : Overlay
    data object Coin : Overlay
    data object Abandon : Overlay
    /** TMR-13: Suspend match's reasons. */
    data object Suspend : Overlay
    data object Direction : Overlay
}

@Composable
fun MatchFlow(button: SharedFlow<Unit>) {
    val context = LocalContext.current
    var overlay by remember { mutableStateOf<Overlay?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(250)
        }
    }
    val match = AppState.match ?: return
    KeepScreenOn(match.wantsScreenOn(now))
    LaunchedEffect(match.phase) { if (match.phase != Phase.Done && match.periodStart != null) MatchService.start(context) }
    // INP-4: the other button acknowledges an alert first, then starts and ends a stoppage.
    LaunchedEffect(Unit) {
        button.collect {
            val m = AppState.match ?: return@collect
            val at = System.currentTimeMillis()
            // EVT-12: "can return" on the golden goal screen too.
            if (m.phase != Phase.Running && !(m.phase == Phase.Golden && m.sinBinReturns.isNotEmpty())) return@collect
            var handled = false
            AppState.changeMatch { handled = acknowledgeAlerts(at) }
            if (!handled && m.phase == Phase.Running) AppState.changeMatch { if (setup.tracked) toggleStoppage(at) else if (breakDue) startBreak(at) }
            Haptics.tick(context)
        }
    }

    Box(if (overlay != null) Modifier.fillMaxSize().swipeBack() else Modifier.fillMaxSize()) {
        when (val o = overlay) {
            null -> {
                // VIB-6: Back silences a repeating alert and opens the game menu in the same press.
                BackHandler {
                    val at = System.currentTimeMillis()
                    AppState.changeMatch { acknowledgeAlerts(at) }
                    overlay = Overlay.GameMenu
                }
                // EVT-12: a sin bin over, during play: "can return" until a button or a tap, which does nothing else (VIB-6).
                if ((match.phase == Phase.Running || match.phase == Phase.Golden) && match.sinBinReturns.isNotEmpty()) {
                    SinBinReturnScreen(match) {
                        val at = System.currentTimeMillis()
                        AppState.changeMatch { acknowledgeAlerts(at) }
                    }
                } else Gestures(
                    onHome = { overlay = Overlay.Team(HOME) }, onAway = { overlay = Overlay.Team(AWAY) }, onMenu = { overlay = Overlay.GameMenu },
                    onTap = {
                        val at = System.currentTimeMillis()
                        var handled = false
                        AppState.changeMatch { handled = acknowledgeAlerts(at) }
                        if (!handled && match.phase == Phase.Running && AppState.saved.tapStoppage) AppState.changeMatch { toggleStoppage(at) }
                    },
                ) {
                    when (match.phase) {
                        Phase.Pre, Phase.Ready, Phase.NextKickoff -> KickoffScreen(match)
                        Phase.Running -> RunningScreen(match, now)
                        Phase.Break -> BreakScreen(match, now)
                        Phase.Decide -> DecideScreen(match) { overlay = it }
                        Phase.Penalties -> PenaltiesScreen(match)
                        Phase.Golden -> GoldenScreen(match)
                        Phase.Suspended -> SuspendedScreen(match, now)
                        Phase.Done -> FullTimeScreen(match) { overlay = Overlay.Events }
                    }
                }
            }
            Overlay.GameMenu -> {
                BackHandler { overlay = null }
                GameMenu(match, now, close = { overlay = null }, open = { overlay = it })
            }
            is Overlay.Team -> {
                BackHandler { overlay = null }
                WatchList(match.teamName(o.team), o.team, match.teamColor(o.team)) {
                    if (match.phase == Phase.Running) {
                        item {
                            MenuRow("Goal") {
                                overlay = when {
                                    match.setup.goalTypes -> Overlay.GoalType(o.team)
                                    match.setup.goalScorers -> Overlay.Number(o.team, EVENT_GOAL)
                                    else -> { record(context, EVENT_GOAL, o.team, null); null }
                                }
                            }
                        }
                    }
                    // EVT-12: with sin bins in the format, while the clock has time left to run, above Yellow card (the
                    // owner's order); yellow on the dark band, so it isn't taken for Yellow card.
                    if (match.setup.sinBins && match.phase != Phase.Penalties && match.phase != Phase.Done) {
                        item { MenuRow("Sin bin", textColor = C.yellow) { overlay = Overlay.Number(o.team, EVENT_SIN_BIN) } }
                    }
                    item { MenuRow("Yellow card", fill = C.yellow, textColor = Color.Black) { overlay = Overlay.Number(o.team, EVENT_YELLOW) } }
                    item { MenuRow("Red card", fill = C.red, textColor = Color.White) { overlay = Overlay.Number(o.team, EVENT_RED) } }
                    // EVT-15, EVT-16: a team official's card after the players', then an injury.
                    item { MenuRow("Team official") { overlay = Overlay.Official(o.team) } }
                    item { MenuRow("Injury") { overlay = Overlay.Number(o.team, EVENT_INJURY) } }
                }
            }
            is Overlay.Official -> {
                BackHandler { overlay = null }
                WatchList("Official ${match.teamName(o.team)}", o.team, match.teamColor(o.team)) {
                    item { MenuRow("Yellow card", fill = C.yellow, textColor = Color.Black) { overlay = Overlay.OfficialRole(o.team, red = false) } }
                    item { MenuRow("Red card", fill = C.red, textColor = Color.White) { overlay = Overlay.OfficialRole(o.team, red = true) } }
                }
            }
            is Overlay.OfficialRole -> {
                // EVT-15: who it was for, in place of a player's number.
                BackHandler { overlay = null }
                WatchList("${if (o.red) "Red" else "Yellow"} ${match.teamName(o.team)}", o.team, match.teamColor(o.team)) {
                    officialRoles.forEachIndexed { role, label ->
                        item {
                            MenuRow(label) {
                                val at = System.currentTimeMillis()
                                AppState.changeMatch { addOfficialCard(o.red, o.team, role, at) }
                                Haptics.tick(context)
                                overlay = reasonOr(o.team, o.red, null)
                            }
                        }
                    }
                }
            }
            is Overlay.GoalType -> {
                BackHandler { overlay = null }
                WatchList("Goal ${match.teamName(o.team)}", o.team, match.teamColor(o.team)) {
                    listOf(EVENT_GOAL to "Goal", EVENT_DFK_GOAL to "Direct free kick", EVENT_PEN_GOAL to "Penalty", EVENT_OWN_GOAL to "Own goal").forEach { (type, label) ->
                        item {
                            MenuRow(label) {
                                overlay = if (match.setup.goalScorers && type != EVENT_OWN_GOAL) Overlay.Number(o.team, type) else { record(context, type, o.team, null); null }
                            }
                        }
                    }
                }
            }
            is Overlay.Number -> {
                BackHandler { overlay = null }
                NumberEntry(numberTitle(o.type, match.teamName(o.team)), o.type, onDone = { player ->
                    val second = record(context, o.type, o.team, player)
                    val next = if (second && player != null) Overlay.SecondYellow(o.team, player, o.type == EVENT_SIN_BIN) else null
                    // EVT-14: a card's reason before the send-off screen; goals and injuries never ask.
                    overlay = if (o.type == EVENT_YELLOW || o.type == EVENT_SIN_BIN || o.type == EVENT_RED) reasonOr(o.team, o.type == EVENT_RED, next) else next
                })
            }
            is Overlay.Reason -> {
                // EVT-14: the card is already recorded; No reason or Back gives it none.
                BackHandler { overlay = o.next }
                WatchList("Reason", o.team, match.teamColor(o.team)) {
                    item { MenuRow("No reason") { overlay = o.next } }
                    Misconduct.codes(match.misconductScheme, o.sendOff).forEach { (code, meaning) ->
                        item {
                            MenuRow(code, meaning) {
                                AppState.changeMatch { giveReason(code) }
                                Haptics.tick(context)
                                overlay = o.next
                            }
                        }
                    }
                }
            }
            is Overlay.AdjustMinutes -> {
                BackHandler { overlay = null }
                key(o) {
                    DigitsEntry(adjustTitle(o.added), if (o.added) "Minutes" else adjustUnit("Minutes", match), o.minutes) { minutes ->
                        overlay = Overlay.AdjustSeconds(o.added, o.captured, minutes)
                    }
                }
            }
            is Overlay.AdjustSeconds -> {
                // TMR-14: Back goes to the minutes, as entered.
                BackHandler { overlay = Overlay.AdjustMinutes(o.added, o.captured, o.minutes) }
                key(o) {
                    DigitsEntry(adjustTitle(o.added), if (o.added) "Seconds" else adjustUnit("Seconds", match), o.captured % 60, max = 59) { seconds ->
                        val entered = o.minutes * 60 + seconds
                        val change = entered - o.captured
                        // Nothing changed: back to the match, with nothing recorded.
                        overlay = if (change == 0) null else Overlay.Confirm(
                            "${if (o.added) "Added time" else "Clock"} ${formatChange(change)}?", "To ${formatClock(entered * 1000L)}", "Adjust", false,
                        ) {
                            val at = System.currentTimeMillis()
                            AppState.changeMatch { if (o.added) adjustAdded(change, at) else adjustClock(change, at) }
                            Haptics.tick(context)
                        }
                    }
                }
            }
            is Overlay.SecondYellow -> {
                // EVT-5: a full red screen and a strong vibration; EVT-12: for a second sin bin too.
                LaunchedEffect(Unit) { Haptics.sendOff(context) }
                BackHandler { overlay = null }
                Column(Modifier.fillMaxSize().background(C.red).clickable { overlay = null }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    T(if (o.sinBin) "Second sin bin" else "Second yellow", 18.sp, weight = FontWeight.Bold)
                    T("#${o.player} ${match.teamName(o.team)}", 16.sp)
                    Spacer(Modifier.height(4.dp))
                    T("Send off", 26.sp, figure = true)
                }
            }
            is Overlay.Confirm -> {
                BackHandler { overlay = null }
                ConfirmScreen(o.question, o.detail, o.yes, o.danger, onYes = { o.action(); overlay = null }, onNo = { overlay = null })
            }
            Overlay.Coin -> {
                BackHandler { overlay = Overlay.GameMenu }
                CoinToss()
            }
            Overlay.Abandon -> {
                BackHandler { overlay = Overlay.GameMenu }
                WatchList("Why?") {
                    abandonReasons.forEachIndexed { reason, label ->
                        item {
                            MenuRow(label) {
                                val score = "${match.score[0]}-${match.score[1]}"
                                overlay = Overlay.Confirm("Abandon match?", "$label, $score stands", "Abandon", true) {
                                    AppState.changeMatch { abandon(System.currentTimeMillis(), reason) }
                                }
                            }
                        }
                    }
                }
            }
            Overlay.Suspend -> {
                // TMR-13: a reason suspends at once, with no question: Resume puts a mistake right.
                BackHandler { overlay = Overlay.GameMenu }
                WatchList("Suspend match") {
                    suspendReasons.forEach { (reason, label) ->
                        item {
                            MenuRow(label) {
                                val at = System.currentTimeMillis()
                                AppState.changeMatch { suspend(reason, at) }
                                Haptics.tick(context)
                                overlay = null
                            }
                        }
                    }
                }
            }
            Overlay.Direction -> {
                BackHandler { overlay = Overlay.GameMenu }
                DirectionScreen(match) { overlay = null }
            }
            Overlay.Events -> {
                BackHandler { overlay = null }
                WatchList("Events") {
                    val shown = match.events.filter { it.type != EVENT_STOPPAGE && it.type != EVENT_PERIOD_END }
                    if (shown.isEmpty()) item { T("None recorded", 13.sp, C.dim) }
                    items(shown) { e -> MenuRow(describe(e, match), eventTime(e, match)) {} }
                }
            }
        }
        // UI-25: at the top of the menus and lists, and at the bottom of the other screens but the running match.
        val menu = overlay == Overlay.GameMenu || overlay is Overlay.Team || overlay is Overlay.GoalType || overlay is Overlay.Official ||
            overlay is Overlay.OfficialRole || overlay is Overlay.Reason || overlay == Overlay.Events || overlay == Overlay.Abandon || overlay == Overlay.Suspend
        if (menu) TimeOfDay() else if (overlay != null || match.phase != Phase.Running) TimeOfDay(bottom = true)
    }
}

/** EVT-14: the Reason list, with Card reasons on, and [next] after it; [next] straight away with it off. */
private fun reasonOr(team: Int, sendOff: Boolean, next: Overlay?): Overlay? = if (AppState.saved.cardReasons) Overlay.Reason(team, sendOff, next) else next

private fun record(context: android.content.Context, type: String, team: Int, player: Int?): Boolean {
    var second = false
    val at = System.currentTimeMillis()
    AppState.changeMatch { second = addEvent(type, team, player, at) }
    Haptics.tick(context)
    return second
}

private fun numberTitle(type: String, team: String) = when (type) {
    EVENT_YELLOW -> "Yellow $team"
    EVENT_SIN_BIN -> "Sin bin $team"
    EVENT_RED -> "Red $team"
    EVENT_INJURY -> "Injury $team"
    else -> "Goal $team"
}

/** TMR-14: the two-digit entries' title. */
private fun adjustTitle(added: Boolean) = if (added) "Added time" else "Adjust clock"

/** TMR-14: "Minutes into 1H"; "Minutes played" in a match of one period, which has no label (SET-16). */
private fun adjustUnit(what: String, m: Match) = periodLabel(m.period, m.setup.numPeriods).let { if (it.isEmpty()) "$what played" else "$what into $it" }

private fun typeName(type: String) = when (type) {
    EVENT_GOAL -> "Goal"; EVENT_OWN_GOAL -> "Own goal"; EVENT_PEN_GOAL -> "Penalty goal"; EVENT_DFK_GOAL -> "DFK goal"
    EVENT_YELLOW, EVENT_OFFICIAL_YELLOW -> "Yellow"; EVENT_RED, EVENT_OFFICIAL_RED -> "Red"; EVENT_SECOND_YELLOW -> "2nd yellow"
    EVENT_INJURY -> "Injury"
    // EVT-12: "Sin bin AWY #7", "2nd sin bin AWY #7" (a send-off).
    EVENT_SIN_BIN -> "Sin bin"; EVENT_SECOND_SIN_BIN -> "2nd sin bin"
    EVENT_PEN_SCORED -> "Pen scored"; EVENT_PEN_MISSED -> "Pen missed"; else -> type
}

/** EVT-15: a team official in an event's words, by role. */
private val officialWords = listOf("head coach", "assistant coach", "team official")

/**
 * "Goal HOM #9", "Yellow HOM head coach" (EVT-15), "Injury AWY #4" (EVT-16), "Clock +0:40" (TMR-14),
 * "Suspended, lightning" and "Resumed after 30:00" (TMR-13).
 */
private fun describe(e: MatchEvent, m: Match) =
    suspensionWords(e) ?: if (e.type == EVENT_ABANDON) "Abandoned: ${abandonReasons.getOrElse(e.extra ?: -1) { "other" }}"
    else if (e.type == EVENT_CLOCK_ADJUSTED) "Clock ${formatChange(e.extra ?: 0)}"
    else if (e.type == EVENT_ADDED_ADJUSTED) "Added time ${formatChange(e.extra ?: 0)}"
    else "${typeName(e.type)} ${m.teamName(e.team)}" +
        (if (e.type == EVENT_OFFICIAL_YELLOW || e.type == EVENT_OFFICIAL_RED) " ${officialWords.getOrElse(e.extra ?: 2) { officialWords[2] }}" else "") +
        (e.player?.let { " #$it" } ?: "") +
        // EVT-14: "Yellow HOM #4 UB".
        (e.reason?.let { " $it" } ?: "")

/** EVT-11: the numbers are what the server reads. */
private val abandonReasons = listOf("Weather", "Lightning", "Crowd trouble", "Not enough players", "Other")

private fun eventTime(e: MatchEvent, m: Match) = when (e.seconds) {
    SECONDS_BEFORE_KICKOFF -> "Before kickoff"
    SECONDS_AT_BREAK -> "At the break"
    SECONDS_AFTER_FULL_TIME -> "After full time"
    SECONDS_PENALTIES -> "Shoot-out"
    else -> {
        val base = if (m.clockStyle == CLOCK_UP) m.periodStartSec(e.period) else 0
        withPeriod(e.period, m.setup.numPeriods, formatClock((base + e.seconds) * 1000L))
    }
}

/** INP-10: one swipe, read when the finger lifts, so a slow drag still counts; a swipe down does nothing. */
@Composable
private fun Gestures(onHome: () -> Unit, onAway: () -> Unit, onMenu: () -> Unit, onTap: () -> Unit, content: @Composable () -> Unit) {
    val threshold = with(LocalDensity.current) { 36.dp.toPx() }
    Box(
        Modifier.fillMaxSize().background(Color.Black)
            .pointerInput(Unit) {
                var total = Offset.Zero
                detectDragGestures(
                    onDragStart = { total = Offset.Zero },
                    onDragEnd = {
                        if (abs(total.x) >= abs(total.y) && abs(total.x) > threshold) {
                            if (total.x > 0) onHome() else onAway()
                        } else if (-total.y > threshold) {
                            onMenu()
                        }
                    },
                ) { _, drag -> total += drag }
            }
            .pointerInput(Unit) { detectTapGestures { onTap() } },
    ) { content() }
}

/** Centered at a fraction of the screen's height, and of its width (UI-1). */
@Composable
internal fun BoxWithConstraintsScope.At(y: Float, x: Float = 0.5f, content: @Composable () -> Unit) {
    val width = maxWidth
    val height = maxHeight
    Layout(content, Modifier.fillMaxSize()) { measurables, constraints ->
        val placeables = measurables.map { it.measure(constraints.copy(minWidth = 0, minHeight = 0)) }
        layout(constraints.maxWidth, constraints.maxHeight) {
            placeables.forEach { p ->
                p.place((width.roundToPx() * x).toInt() - p.width / 2, (height.roundToPx() * y).toInt() - p.height / 2)
            }
        }
    }
}

@Composable internal fun BoxWithConstraintsScope.fraction(f: Float): TextUnit = with(LocalDensity.current) { (maxWidth * f).toSp() }

/**
 * "0 HOM/AWY 2": UI-10's two kits with the scores outside them. UI-11: with [select], a tap on either half chooses that
 * team, and the chosen one has the white dot above its kit.
 */
@Composable
private fun BoxWithConstraintsScope.ScoreLine(m: Match, y: Float, scores: List<Int> = m.score, selected: Int = -2, select: ((Int) -> Unit)? = null) {
    val size = fraction(0.082f)
    val tap = if (select == null) Modifier else Modifier.padding(vertical = 12.dp).pointerInput(select) {
        detectTapGestures { select(if (it.x < this.size.width / 2) HOME else AWAY) }
    }
    At(y) {
        Row(tap, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            T("${scores[HOME]}", size, weight = FontWeight.SemiBold)
            KitPair(listOf(m.teamName(HOME), m.teamName(AWAY)), listOf(m.teamColor(HOME), m.teamColor(AWAY)), size, chosen = if (select != null) selected else -1)
            T("${scores[AWAY]}", size, weight = FontWeight.SemiBold)
        }
    }
}

/** PRE-1, PRE-2, PRE-7, UI-13. */
@Composable
private fun KickoffScreen(m: Match) {
    AppState.revision // The match changes in place: this draws it again when it does.
    Face {
        val next = m.phase == Phase.NextKickoff
        val s = m.setup
        val title = if (next) periodLabel(m.period + 1, s.numPeriods) + " kickoff" else formatSummary(s)
        At(0.16f) { T(title, fraction(0.058f), C.dim) }
        ScoreLine(m, 0.36f, selected = m.kickoffTeamOnScreen, select = { team ->
            if (m.phase == Phase.Ready && m.kickoff == team) AppState.changeMatch { clearKickoff() } else AppState.changeMatch { selectKickoff(team) }
        })
        if (m.phase == Phase.Pre) {
            At(0.62f) { T("Who kicks off?", fraction(0.072f)) }
        } else if (m.kickoffTeamOnScreen < 0) {
            // ET-7: a new toss decides who kicks off extra time.
            At(0.62f) { T("Who kicks off?", fraction(0.072f)) }
        } else {
            if (next) KickoffArrow(m)
            At(if (next) 0.62f else 0.66f) {
                // INP-8: only the button starts it.
                PillButton("Start", width = maxWidth * 0.52f) {
                    val at = System.currentTimeMillis()
                    val saved = AppState.saved
                    AppState.changeMatch { if (phase == Phase.Ready) start(at, saved.chosenScreen) else startNextPeriod(at) }
                }
            }
        }
    }
}

@Composable
private fun DirectionRow(m: Match, open: () -> Unit) {
    MenuRow("Kickoff direction", if (m.hasDirection) "Saved" else "Face the goal", onClick = open)
}

/** PRE-8: an arrow towards the goal the next period's kickoff team attacks, turning with the watch. Not on
 *  ET1's own kickoff screen, where it's recorded (ET-7). */
@Composable
private fun BoxWithConstraintsScope.KickoffArrow(m: Match) {
    if (m.period + 1 == m.setup.numPeriods) return
    val target = m.attackHeading(m.period + 1) ?: return
    val heading = rememberHeading()
    if (heading == null) {
        At(0.83f) { T("No compass reading", fraction(0.05f), C.dim) }
        return
    }
    val team = m.kickoffFor(m.period + 1)
    val color = teamColor(m.teamColor(team))?.takeIf { it.luminance() in 0.08f..0.9f } ?: Color.White
    Canvas(Modifier.fillMaxSize()) { drawDirectionArrow(Offset(size.width / 2, size.height * 0.79f), size.height * 0.05f, target - heading, color) }
    At(0.90f) { T("${m.teamName(team)} attacks", fraction(0.048f), C.dim) }
}

/** UI-26: on this screen the sync screen may come up. */
@Composable
fun ScreenFree() {
    androidx.compose.runtime.DisposableEffect(Unit) {
        AppState.screenFree = true
        onDispose { AppState.screenFree = false }
    }
}

/**
 * UI-26: matches on their way: a ring for how far it's got and what's going now. Swiping back leaves
 * it to carry on. It says when it's done and closes itself; if it stops, it says why.
 */
@Composable
fun SyncScreen() {
    val close = { AppState.syncScreen = false }
    BackHandler(onBack = close)
    val ended = !AppState.syncing
    val problem = if (ended) AppState.syncProblem else null
    val total = AppState.syncTotal
    val sent = AppState.syncSent
    LaunchedEffect(ended, problem) {
        if (ended && problem == null) {
            delay(3000)
            close()
        }
    }
    val context = LocalContext.current
    val time = remember { android.text.format.DateFormat.getTimeFormat(context).format(java.util.Date()) }
    Box(Modifier.fillMaxSize().background(Color.Black).clickable(enabled = ended, onClick = close)) {
        Face {
            At(0.14f) { T(time, fraction(0.05f), C.dim) }
            At(0.3f) { T(if (problem != null) "Sync paused" else if (ended) "All synced" else "Syncing", fraction(0.085f), C.text, FontWeight.SemiBold) }
            if (problem != null) {
                At(0.47f) { T(problem, fraction(0.052f), C.dim) }
                At(0.58f) { T("Nothing's lost: it tries again", fraction(0.05f), C.dim) }
            } else if (ended) {
                At(0.5f) { T(if (sent == 1) "1 match sent" else "$sent matches sent", fraction(0.058f), C.dim) }
            } else {
                At(0.44f) { T("Sending match", fraction(0.058f), C.dim) }
                At(0.57f) { T("${minOf(sent + 1, total)} of $total", fraction(0.095f), C.text, FontWeight.SemiBold) }
            }
            At(0.78f) { T(if (ended) "Tap to close" else "Swipe: it keeps going", fraction(0.05f), C.dim) }
        }
        Canvas(Modifier.fillMaxSize()) {
            val thick = size.minDimension * 0.03f
            val inset = thick / 2 + 2.dp.toPx()
            val box = Size(size.width - 2 * inset, size.height - 2 * inset)
            drawArc(Color(0xFF333333), 0f, 360f, false, Offset(inset, inset), box, style = Stroke(thick))
            val fraction = if (ended && problem == null) 1f else if (total > 0) sent.toFloat() / total else 0f
            if (fraction > 0) drawArc(C.start, -90f, 360 * fraction, false, Offset(inset, inset), box, style = Stroke(thick))
        }
    }
}

/** PRE-8: "Face the goal HOM attacks", with what that looks like, the live reading and Save. */
@Composable
private fun DirectionScreen(m: Match, done: () -> Unit) {
    val context = LocalContext.current
    val heading = rememberHeading()
    // A dark kit wouldn't show on the black screen.
    val kit = m.teamColor(m.firstKickoff).takeIf { c -> c >= 0 && ((c shr 16) and 0xFF) + ((c shr 8) and 0xFF) + (c and 0xFF) > 120 }?.let(::teamColor)
    Face {
        At(0.155f) { T("Face the goal", fraction(0.07f), C.text, FontWeight.SemiBold) }
        At(0.235f) { T("${m.teamName(m.firstKickoff)} attacks", fraction(0.07f), kit ?: C.text, FontWeight.Bold) }
        Canvas(Modifier.fillMaxSize()) { drawDirectionView(heading != null, kit) }
        At(0.668f) { T(heading?.let { Compass.describe(it) } ?: "No compass reading", fraction(0.052f), if (heading != null) C.text else C.dim) }
        if (heading != null) {
            At(0.8f) {
                PillButton("Save", width = maxWidth * 0.5f) {
                    AppState.changeMatch { setKickoffHeading(heading) }
                    Haptics.tick(context)
                    done()
                }
            }
        } else {
            At(0.8f) { T("Swipe right to skip", fraction(0.05f), C.dim) }
        }
    }
}

/**
 * PRE-8: what you see when you do this right: the goal ahead, your arm in front of you with the
 * watch on it, and a line from its 12 o'clock to the goal, the same on every watch. In units of a
 * 416-pixel-tall screen.
 */
private fun DrawScope.drawDirectionView(on: Boolean, kit: Color?) {
    val u = size.height / 416f
    val c = size.width / 2
    val goalLine = 154 * u
    val wrist = size.height * 0.565f
    val radius = 25 * u
    val ink = if (on) Color.White else Color(0xFF777777)
    fun polygon(vararg points: Pair<Float, Float>) = Path().apply {
        moveTo(c + points[0].first * u, points[0].second)
        points.drop(1).forEach { lineTo(c + it.first * u, it.second) }
        close()
    }
    fun line(x1: Float, y1: Float, x2: Float, y2: Float, color: Color, width: Float) =
        drawLine(color, Offset(c + x1 * u, y1), Offset(c + x2 * u, y2), width * u)

    // The pitch running away from you, with the goal line and six-yard box.
    drawPath(polygon(-75f to goalLine, 75f to goalLine, 300f to wrist + 60 * u, -300f to wrist + 60 * u), Color(0xFF12402C))
    line(-75f, goalLine, 75f, goalLine, Color.White, 2f)
    line(-48f, goalLine, -66f, goalLine + 16 * u, Color.White.copy(alpha = 0.7f), 2f)
    line(-66f, goalLine + 16 * u, 66f, goalLine + 16 * u, Color.White.copy(alpha = 0.7f), 2f)
    line(66f, goalLine + 16 * u, 48f, goalLine, Color.White.copy(alpha = 0.7f), 2f)
    // The goal, its net in the kit's color.
    val top = goalLine - 26 * u
    val net = kit ?: Color.White
    listOf(-18f, 0f, 18f).forEach { line(it, top, it, goalLine, net, 1.5f) }
    line(-36f, goalLine - 13 * u, 36f, goalLine - 13 * u, net, 1.5f)
    line(-36f, goalLine, -36f, top, Color.White, 4f)
    line(-36f, top, 36f, top, Color.White, 4f)
    line(36f, top, 36f, goalLine, Color.White, 4f)
    // The line from 12 o'clock to the goal.
    drawLine(
        ink, Offset(c, wrist - radius - 6 * u), Offset(c, goalLine + 32 * u), 3 * u,
        pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6 * u, 5 * u)),
    )
    val tip = goalLine + 20 * u
    drawPath(polygon(0f to tip, 11f to tip + 16 * u, -11f to tip + 16 * u), ink)
    // The arm, the hand and the strap.
    val skin = Color(0xFF9AA09C)
    drawPath(polygon(-240f to wrist - 30 * u, 34f to wrist - 17 * u, 34f to wrist + 17 * u, -240f to wrist + 34 * u), skin)
    drawRoundRect(skin, Offset(c + 28 * u, wrist - 20 * u), Size(50 * u, 40 * u), CornerRadius(17 * u))
    drawRect(Color(0xFF2A2D2B), Offset(c - 15 * u, wrist - 24 * u), Size(30 * u, 48 * u))
    // The watch.
    drawCircle(Color.Black, radius, Offset(c, wrist))
    drawCircle(ink, radius, Offset(c, wrist), style = Stroke(3 * u))
    drawLine(ink, Offset(c, wrist - radius + 3 * u), Offset(c, wrist - radius * 0.35f), 3 * u)
}

/** An arrow centered on `at`, turned `angle` radians clockwise from straight up. */
private fun DrawScope.drawDirectionArrow(at: Offset, arrow: Float, angle: Float, color: Color) {
    rotate(Math.toDegrees(angle.toDouble()).toFloat(), at) {
        val path = Path().apply {
            moveTo(at.x, at.y - arrow)
            lineTo(at.x + 0.6f * arrow, at.y - 0.1f * arrow)
            lineTo(at.x + 0.22f * arrow, at.y - 0.15f * arrow)
            lineTo(at.x + 0.22f * arrow, at.y + arrow)
            lineTo(at.x - 0.22f * arrow, at.y + arrow)
            lineTo(at.x - 0.22f * arrow, at.y - 0.15f * arrow)
            lineTo(at.x - 0.6f * arrow, at.y - 0.1f * arrow)
            close()
        }
        drawPath(path, color)
    }
}

/** UI-1, UI-21: fixed slots, built from the match screen's choices. Added time and the pills are in the same place in all of them, and the ring or time at the edge moves nothing. */
@Composable
private fun RunningScreen(m: Match, now: Long) {
    Face {
        val w = m.shown
        val round = LocalConfiguration.current.isScreenRound
        // UI-23: square screens have no ring; they show the time instead.
        val edge = if (w.edge == EDGE_RING && !round) EDGE_TIME else w.edge
        val (clock, added) = m.clockDisplay(now)
        // TMR-15: a stopping clock standing still is shown in the stoppage's orange.
        val tint = if (m.clockStopped) C.stoppage else C.text
        if (edge == EDGE_RING) PeriodRing(m, now)
        if (w.names) {
            At(0.12f) { T(periodLabel(m.period, m.setup.numPeriods), fraction(0.058f), C.dim) }
            ScoreLine(m, 0.25f)
        } else {
            At(0.10f) { T(periodLabel(m.period, m.setup.numPeriods), fraction(0.058f), C.dim) }
            // UI-21: scores only, the scores are the kits (UI-10).
            At(0.21f) { KitPair(m.score.map { "$it" }, listOf(m.teamColor(HOME), m.teamColor(AWAY)), fraction(0.086f)) }
        }
        when {
            w.clocks == CLOCKS_SIDE_BY_SIDE -> {
                val size = fraction(if (clock.length > 5) 0.145f else 0.175f)
                At(0.50f, 0.27f) { T(clock, size, tint, figure = true, lines = 1) }
                At(0.50f) { Divider(maxHeight * 0.16f) }
                At(0.50f, 0.73f) { T(m.secondClockText(now), size, figure = true, lines = 1) }
            }
            // Scores only: the largest clock that fits, leaving room for a stacked second clock.
            !w.names -> At(0.50f) { T(clock, fraction(if (clock.length > 5) 0.28f else if (w.clocks == CLOCKS_STACKED) 0.3f else 0.33f), tint, figure = true, lines = 1) }
            else -> At(0.50f) { T(clock, fraction(if (clock.length > 5) 0.24f else 0.29f), tint, figure = true, lines = 1) }
        }
        if (added != null) {
            At(0.69f) { T(added, fraction(0.09f), C.stoppage, FontWeight.SemiBold) }
        } else if (w.clocks == CLOCKS_STACKED) {
            At(0.69f) { T(m.secondClockText(now), fraction(0.1f), C.dim, FontWeight.SemiBold) }
        }
        TimerPills(m, now)
        if (edge == EDGE_TIME) TimeOfDay(bottom = true)
    }
}

/** The thin line between the team names and between side-by-side clocks, drawn alike (UI-21). */
@Composable
private fun Divider(height: androidx.compose.ui.unit.Dp) = Box(Modifier.width(1.5.dp).height(height).background(C.rule))

/** UI-23: following the match clock, filling as the period runs when it counts up, emptying when it counts down; round screens only. */
@Composable
private fun PeriodRing(m: Match, now: Long) {
    val progress = m.periodProgress(now)
    val down = m.clockStyle == CLOCK_DOWN
    Canvas(Modifier.fillMaxSize()) {
        val pen = size.width * 0.027f
        val arc = Size(size.width - pen, size.height - pen)
        val at = Offset(pen / 2, pen / 2)
        drawArc(if (progress < 1f) C.ringTrack else C.stoppage, 0f, 360f, false, at, arc, style = Stroke(pen))
        when {
            progress >= 1f -> {}
            down -> drawArc(C.start, -90f + 360f * progress, 360f * (1 - progress), false, at, arc, style = Stroke(pen))
            progress > 0.0001f -> drawArc(C.start, -90f, 360f * progress, false, at, arc, style = Stroke(pen))
        }
    }
}

/** UI-2, UI-4, TMR-7, TMR-16; EVT-12's sin bin pill last. */
@Composable
private fun BoxWithConstraintsScope.TimerPills(m: Match, now: Long) {
    // TMR-16: from the period's length, the added time left.
    val stoppage = m.stoppagePill(now)
    val remaining = m.breakRemainingMs(now)
    val dueIn = m.breakDueInMs(now)
    val breakText = when {
        // SET-8, UI-5: the timers' names, as the match was created with them.
        m.breakDue -> "${m.setup.breakLabel.capitalized()} due"
        remaining != null -> m.breakClockText(now)
        dueIn != null -> formatCountdown(dueIn)
        else -> null
    }
    val fullSinBin = m.sinBinPill(now)
    if (stoppage == null && breakText == null && fullSinBin == null) return
    var step = pillSteps.first()
    var sinBin = fullSinBin
    if (fullSinBin != null) {
        // EVT-12: the row steps its font, padding and gaps down until it fits inside the screen's edge; then the sin
        // bin's pill drops its team.
        val fit = rememberPillFit()
        val row = listOfNotNull(stoppage?.text, breakText, fullSinBin)
        step = pillSteps.firstOrNull { fit(row, it) } ?: pillSteps.last()
        if (!fit(row, step)) sinBin = m.sinBinPill(now, team = false)
    }
    val size = fraction(step.size)
    At(0.835f) {
        Row(horizontalArrangement = Arrangement.spacedBy(step.gap)) {
            stoppage?.let { Pill(it.text, C.stoppage, it.solid, size, step.pad) }
            if (breakText != null) {
                Pill(breakText, C.breakBlue, remaining != null || m.breakDue, size, step.pad, if (m.breakDue) ({ AppState.changeMatch { startBreak(System.currentTimeMillis()) } }) else null)
            }
            // EVT-12: outlined in the cards' yellow, never solid, as it isn't a timer the referee runs.
            sinBin?.let { Pill(it, C.yellow, false, size, step.pad) }
        }
    }
}

/** UI-1: the pill row's font (a fraction of the screen's width), each pill's side padding and the gap between them. */
private data class PillStep(val size: Float, val pad: Dp, val gap: Dp)

/** EVT-12: the first is the row as it always was; the rest only for a row with the sin bin's pill that doesn't fit. */
private val pillSteps = listOf(PillStep(0.075f, 9.dp, 6.dp), PillStep(0.066f, 7.dp, 5.dp), PillStep(0.058f, 6.dp, 4.dp), PillStep(0.052f, 5.dp, 3.dp))

/**
 * EVT-12, UI-1: whether a row of pills with these texts fits across the screen at the pill row's height, inside a
 * round screen's edge at the pills' lower corners.
 */
@Composable
private fun BoxWithConstraintsScope.rememberPillFit(): (List<String>, PillStep) -> Boolean {
    val measurer = androidx.compose.ui.text.rememberTextMeasurer()
    val density = LocalDensity.current
    val round = LocalConfiguration.current.isScreenRound
    val w = with(density) { maxWidth.toPx() }
    val h = with(density) { maxHeight.toPx() }
    return { texts, step ->
        with(density) {
            val style = androidx.compose.ui.text.TextStyle(fontSize = (maxWidth * step.size).toSp(), fontFamily = Barlow, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum")
            val measured = texts.map { measurer.measure(it, style).size }
            // Each pill's padding and outline, and the gaps between them.
            val width = measured.sumOf { it.width } + texts.size * (step.pad * 2 + 3.dp).toPx() + (texts.size - 1) * step.gap.toPx()
            val lower = h * 0.835f + (measured.maxOf { it.height } + 4.dp.toPx()) / 2 - h / 2
            val r = minOf(w, h) / 2 - 2.dp.toPx()
            val room = if (round) 2 * kotlin.math.sqrt(maxOf(r * r - lower * lower, 0f)) else w - 12.dp.toPx()
            width <= room
        }
    }
}

/**
 * EVT-12: a sin bin over, over the running screen until a button or a tap (VIB-6): the team as its lone kit (UI-10), the
 * number large, "can return" in LawFive's green, and how many more are waiting.
 */
@Composable
private fun SinBinReturnScreen(m: Match, acknowledge: () -> Unit) {
    val e = m.sinBinReturns.firstOrNull() ?: return
    val more = m.sinBinReturns.size - 1
    Face(Modifier.clickable(onClick = acknowledge)) {
        val player = e.player
        if (player != null) {
            At(0.29f) { Kit(m.teamName(e.team), m.teamColor(e.team), e.team, fraction(0.09f)) }
            At(0.47f) { T("#$player", fraction(0.25f), figure = true, lines = 1) }
        } else {
            At(0.42f) { Kit(m.teamName(e.team), m.teamColor(e.team), e.team, fraction(0.15f)) }
        }
        At(0.665f) { T("can return", fraction(0.09f), C.start, FontWeight.SemiBold, lines = 1) }
        if (more > 0) At(0.77f) { T("+$more", fraction(0.065f), C.dim, FontWeight.SemiBold, lines = 1) }
    }
}

@Composable
private fun Pill(text: String, color: Color, solid: Boolean, size: TextUnit, pad: Dp, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(50)
    Box(
        Modifier.then(if (solid) Modifier.background(color, shape) else Modifier.border(1.5.dp, color, shape))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = pad, vertical = 2.dp),
    ) { T(text, size, if (solid) Color.Black else color, FontWeight.SemiBold, lines = 1) }
}

@Composable
private fun BreakScreen(m: Match, now: Long) {
    Face {
        val remaining = m.breakRemainingMs(now) ?: 0L
        At(0.13f) { T(if (m.isHalftime) "HALF-TIME" else "BREAK", fraction(0.052f), C.dim) }
        ScoreLine(m, 0.27f)
        // TMR-4: time left or time taken, red once the break's length is up.
        At(0.46f) { T(m.breakClockText(now) ?: "0:00", fraction(0.2f), if (remaining > 0) C.breakBlue else C.red, figure = true, lines = 1) }
        // ET-7: before extra time it's down to the new toss.
        val team = m.kickoffFor(m.period + 1)
        At(0.62f) { T(if (team >= 0) "Kickoff: ${m.teamName(team)}" else "New toss for kickoff", fraction(0.056f), C.dim, lines = 1) }
        At(0.78f) { PillButton(if (m.isHalftime) "End half-time" else "End break", width = maxWidth * 0.6f) { AppState.changeMatch { endHalftime() } } }
    }
}

/**
 * TMR-13: play suspended, laid out as the break screen: LIGHTNING (or SUSPENDED), the score, the lightning rule's
 * 30:00 countdown in the break clock's blue, green at 0:00 (for any other reason the time suspended, counting up),
 * a line under it, and Resume where End half-time is (INP-8: only the pill resumes).
 */
@Composable
private fun SuspendedScreen(m: Match, now: Long) {
    Face {
        val lightning = m.suspendReason == LIGHTNING
        val suspended = formatClock(m.suspendedMs(now) ?: 0L)
        val left = m.lightningLeftMs(now)
        At(0.13f) { T(if (lightning) "LIGHTNING" else "SUSPENDED", fraction(0.052f), C.dim) }
        ScoreLine(m, 0.27f)
        At(0.46f) {
            if (left != null) T(formatCountdown(left), fraction(0.2f), if (left > 0) C.breakBlue else C.start, figure = true, lines = 1)
            else T(suspended, fraction(0.2f), figure = true, lines = 1)
        }
        val line = if (lightning) "Suspended $suspended" else when (m.suspendReason) { 0 -> "Weather"; 2 -> "Crowd trouble"; else -> "Other reason" }
        At(0.62f) { T(line, fraction(0.056f), C.dim, lines = 1) }
        At(0.78f) { PillButton("Resume", width = maxWidth * 0.6f) { AppState.changeMatch { resume(System.currentTimeMillis()) } } }
    }
}

/** ET-1: the recommended choice stands out. */
@Composable
private fun DecideScreen(m: Match, open: (Overlay) -> Unit) {
    AppState.revision // The match changes in place: this draws it again when it does.
    val recommended = m.recommendedDecision()
    // SET-16: after a match's one period, it's full time.
    val after = periodLabel(m.period, m.setup.numPeriods).let { if (it.isEmpty()) "Full time" else "After $it" }
    WatchList("$after: ${m.score[HOME]}-${m.score[AWAY]}") {
        if (m.canExtraTime) item { MenuRow("Extra time", fill = if (recommended == Decision.ExtraTime) C.start else null) { AppState.changeMatch { chooseExtraTime(System.currentTimeMillis()) } } }
        if (m.canPenalties) item { MenuRow("Penalties", fill = if (recommended == Decision.Penalties) C.start else null) { AppState.changeMatch { choosePenalties() } } }
        item {
            MenuRow("End match", fill = if (recommended == Decision.EndMatch) C.start else null) {
                open(Overlay.Confirm("End match?", null, "End match", false) { AppState.changeMatch { finish(System.currentTimeMillis()) } })
            }
        }
    }
}

/** ET-3, ET-4. */
@Composable
private fun PenaltiesScreen(m: Match) {
    AppState.revision // The match changes in place: this draws it again when it does.
    Face {
        At(0.13f) { T("PENALTIES", fraction(0.052f), C.dim) }
        if (!m.penStarted) {
            ScoreLine(m, 0.36f, selected = m.penFirst, select = { team -> AppState.changeMatch { selectPenaltyFirst(team) } })
            if (m.penFirst < 0) At(0.62f) { T("Who kicks first?", fraction(0.072f)) }
            else At(0.66f) { PillButton("Start", width = maxWidth * 0.52f) { AppState.changeMatch { startPenalties() } } }
            return@Face
        }
        ScoreLine(m, 0.25f, scores = listOf(m.penaltyGoals(HOME), m.penaltyGoals(AWAY)))
        At(0.37f) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                KickDots(m.kickResults(HOME))
                KickDots(m.kickResults(AWAY))
            }
        }
        val winner = m.penaltyWinner()
        if (winner >= 0) {
            At(0.53f) { T("${m.teamName(winner)} win", fraction(0.09f), weight = FontWeight.SemiBold) }
            At(0.74f) { PillButton("End match", width = maxWidth * 0.52f) { AppState.changeMatch { finish(System.currentTimeMillis()) } } }
            return@Face
        }
        val kicker = m.nextKicker()
        At(0.52f) { T("Kick ${m.penaltyKicks(kicker) + 1}: ${m.teamName(kicker)}", fraction(0.075f), lines = 1) }
        val half = maxWidth * 0.4f
        At(0.74f) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PillButton("Scored", width = half) { AppState.changeMatch { recordKick(true) } }
                PillButton("Missed", C.red, width = half) { AppState.changeMatch { recordKick(false) } }
            }
        }
    }
}

/** ET-6: a golden goal: the winner, then End match or Undo. The clock runs on underneath. */
@Composable
private fun GoldenScreen(m: Match) {
    AppState.revision // The match changes in place: this draws it again when it does.
    val context = LocalContext.current
    Face {
        At(0.13f) { T("GOLDEN GOAL", fraction(0.052f), C.dim) }
        ScoreLine(m, 0.3f)
        m.goldenWinner().takeIf { it >= 0 }?.let { winner -> At(0.5f) { T("${m.teamName(winner)} win", fraction(0.09f), weight = FontWeight.SemiBold) } }
        val half = maxWidth * 0.4f
        At(0.72f) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                PillButton("End match", width = half) { AppState.changeMatch { finish(System.currentTimeMillis()) } }
                PillButton("Undo", C.rule, width = half) {
                    AppState.changeMatch { undoGoldenGoal() }
                    Haptics.tick(context)
                }
            }
        }
    }
}

@Composable
private fun KickDots(results: List<Boolean>) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        results.takeLast(6).forEach { Box(Modifier.size(7.dp).background(if (it) C.start else C.red, CircleShape)) }
        if (results.isEmpty()) Box(Modifier.size(7.dp).border(1.dp, C.rule, CircleShape))
    }
}

@Composable
private fun FullTimeScreen(m: Match, events: () -> Unit) {
    ScreenFree()
    AppState.revision // The match changes in place: this draws it again when it does.
    val sent = AppState.saved.history.firstOrNull { it.created == m.created }?.sent == true
    Face {
        At(0.14f) { T(if (m.isAbandoned) "ABANDONED" else "FULL TIME", fraction(0.052f), C.dim) }
        ScoreLine(m, 0.28f)
        val pens = m.penaltyScore()
        if (pens != null) At(0.38f) { T("${pens[0]}-${pens[1]} on penalties", fraction(0.062f), C.dim) }
        else if (m.endedGolden) At(0.38f) { T("On a golden goal", fraction(0.062f), C.dim) }
        // SYNC-4: unlinked, it's kept and goes once linked, in the Garmin watch's History words, on two lines.
        val twoLines = !sent && !AppState.linked
        At(if (twoLines) 0.45f else 0.47f) { T("Match saved", fraction(0.072f), C.brand, FontWeight.SemiBold) }
        At(if (twoLines) 0.54f else 0.55f) {
            T(if (sent) "Sent to LawFive" else if (AppState.linked) "Waiting to send" else "On this watch only\nLink to send it", fraction(0.052f), C.dim, lines = 2)
        }
        At(0.72f) { PillButton("Done", width = maxWidth * 0.5f) { AppState.clearMatch() } }
        val eventsSize = fraction(0.058f)
        At(0.89f) { Box(Modifier.clickable(onClick = events).padding(6.dp)) { T("Events", eventsSize, C.brand, FontWeight.SemiBold) } }
    }
}

/**
 * INP-3, UI-7. During play (INP-3): the period's end first, as it's done every match (but for a due break's Start,
 * TMR-7), then stoppage and the break,
 * Undo (this period's events only, INP-6), the kickoff's corrections, and Restart, Suspend and Abandon last (TMR-13).
 * While suspended: Resume first, Lightning again, the cards, Undo and Abandon. Before kickoff and at the breaks: Coin
 * toss first (PRE-9), then the kickoff screen's own rows, the cards, and the way out.
 */
@Composable
private fun GameMenu(m: Match, now: Long, close: () -> Unit, open: (Overlay) -> Unit) {
    AppState.revision // The match changes in place: this draws it again when it does.
    val context = LocalContext.current
    fun act(change: Match.() -> Unit) {
        AppState.changeMatch(change)
        Haptics.tick(context)
        close()
    }
    val n = m.setup.numPeriods
    val endLabel = if (m.periodEndsMatch) "End match" else "End ${periodName(m.period, n, m.setup.etPeriods)}"
    val endPeriod = { open(Overlay.Confirm("$endLabel?", null, endLabel, false) { AppState.changeMatch { endPeriod(System.currentTimeMillis()) } }) }
    val endMatch = { open(Overlay.Confirm("End match?", null, "End match", false) { AppState.changeMatch { finish(System.currentTimeMillis()) } }) }
    val undoRow: LazyListScope.() -> Unit = {
        // INP-6: only this period's; with none, no row.
        m.lastUndoableEvent()?.let { last ->
            item {
                MenuRow("Undo last event", describe(last, m)) {
                    open(Overlay.Confirm("Undo?", describe(last, m), "Undo", true) {
                        val at = System.currentTimeMillis()
                        AppState.changeMatch { undoLastEvent(at) }
                    })
                }
            }
        }
    }
    val abandonRow: LazyListScope.() -> Unit = {
        // EVT-11: once it's under way, and last, as it can't be taken back.
        item { MenuRow("Abandon match", "Keeps the score") { open(Overlay.Abandon) } }
    }
    WatchList("Game") {
        if (m.phase == Phase.Running) {
            // INP-3, TMR-7: a due halfway break's Start leads, as it's what the menu is opened for then.
            if (m.breakDue) item { MenuRow("Start ${m.setup.breakLabel}", formatClock(m.setup.breakLenSec * 1000L)) { act { startBreak(System.currentTimeMillis()) } } }
            item { MenuRow(endLabel, m.clockDisplay(now).first, onClick = endPeriod) }
            // TMR-15: on a stopping clock, the stoppage stops and starts the clock, so it's named that way.
            val stoppageRow = if (m.setup.stoppingClock) (if (m.isStoppageActive) "Start clock" else "Stop clock") else (if (m.isStoppageActive) "End " else "Start ") + m.setup.stoppageLabel
            if (m.setup.tracked) item { MenuRow(stoppageRow) { act { toggleStoppage(System.currentTimeMillis()) } } }
            if (m.breakDue) item { MenuRow("Skip ${m.setup.breakLabel}") { act { skipBreak() } } }
            m.breakRemainingMs(now)?.let { left ->
                item { MenuRow("End ${m.setup.breakLabel}", "${formatCountdown(left)} left") { act { endBreakEarly(System.currentTimeMillis()) } } }
                // TMR-7: Reset is out of the menu for now (the user's choice); the rest of it stays, to bring back.
                // item { MenuRow("Reset break", "Started by mistake") { act { resetBreak() } } }
            }
            undoRow()
            // TMR-14: correcting the clock, during play only: the period's time from its kickoff, added time included.
            item {
                MenuRow("Adjust clock", withPeriod(m.period, n, formatClock(m.matchMs(now)))) {
                    open(Overlay.AdjustMinutes(false, (m.matchMs(System.currentTimeMillis()) / 1000).toInt()))
                }
            }
            // TMR-15: a stopping clock has no added time.
            if (m.setup.tracked && !m.setup.stoppingClock) {
                item {
                    MenuRow("Adjust added time", formatClock(m.stoppageTotalMs(now))) {
                        open(Overlay.AdjustMinutes(true, (m.stoppageTotalMs(System.currentTimeMillis()) / 1000).toInt()))
                    }
                }
            }
            // PRE-3: named as the first kickoff (or ET1's), not the current period's, which can be the other team.
            val kickoffOf = if (m.isExtraTime) "ET1 kickoff" else "First kickoff"
            item {
                MenuRow("Change kickoff", "$kickoffOf: ${m.teamName(m.firstKickoff)}") {
                    open(Overlay.Confirm("Change kickoff?", "$kickoffOf to ${m.teamName(1 - m.firstKickoff)}", "Change", false) { AppState.changeMatch { swapKickoff() } })
                }
            }
            // PRE-8, only on a watch with a compass (WCH-10).
            if (m.canRecordDirection && Compass.available(context)) item { DirectionRow(m) { open(Overlay.Direction) } }
            if (m.period == 0) {
                item {
                    MenuRow("Restart match", "Back to kickoff") {
                        open(Overlay.Confirm("Restart match?", "Clock and events are cleared", "Restart", true) { AppState.changeMatch { restart() } })
                    }
                }
            }
            // TMR-13: before Abandon, as a delay usually ends in play going on.
            item { MenuRow("Suspend match", "Lightning, weather") { open(Overlay.Suspend) } }
            abandonRow()
            return@WatchList
        }
        // TMR-13: while suspended, Resume first, then what can happen during the delay (EVT-7), and Abandon last.
        if (m.phase == Phase.Suspended) {
            item { MenuRow("Resume match") { act { resume(System.currentTimeMillis()) } } }
            if (m.suspendReason == LIGHTNING) item { MenuRow("Lightning again", "Back to 30:00") { act { lightningAgain(System.currentTimeMillis()) } } }
            item { MenuRow("Card for ${m.setup.home}") { open(Overlay.Team(HOME)) } }
            item { MenuRow("Card for ${m.setup.away}") { open(Overlay.Team(AWAY)) } }
            undoRow()
            abandonRow()
            return@WatchList
        }
        // PRE-8, only on a watch with a compass (WCH-10); ET-7: on ET1's kickoff screen too, once its team is chosen.
        // On a kickoff screen it's what the menu is opened for, so it comes first (the owner's order).
        if ((m.phase == Phase.Ready || m.phase == Phase.NextKickoff) && m.canRecordDirection && Compass.available(context)) item { DirectionRow(m) { open(Overlay.Direction) } }
        // PRE-9: wherever a real toss happens: before kickoff, before extra time and before a shoot-out.
        // Next after Kickoff direction, or first where that isn't shown.
        val beforeExtraTime = m.phase == Phase.NextKickoff && m.period + 1 == n
        if (m.phase == Phase.Pre || m.phase == Phase.Ready || beforeExtraTime || (m.phase == Phase.Penalties && !m.penStarted)) {
            item { MenuRow("Coin toss") { open(Overlay.Coin) } }
        }
        when (m.phase) {
            Phase.Break -> item { MenuRow(if (m.isHalftime) "End half-time" else "End break") { act { endHalftime() } } }
            Phase.NextKickoff -> if (m.kickoffTeamOnScreen >= 0) item { MenuRow("Start ${periodName(m.period + 1, n, m.setup.etPeriods)}") { act { startNextPeriod(System.currentTimeMillis()) } } }
            else -> Unit
        }
        // EVT-7: where people look for them, as swipes aren't obvious at a break.
        if (m.phase == Phase.Pre || m.phase == Phase.Ready || m.phase == Phase.NextKickoff || m.phase == Phase.Penalties || m.phase == Phase.Break || m.phase == Phase.Decide) {
            item { MenuRow("Card for ${m.setup.home}") { open(Overlay.Team(HOME)) } }
            item { MenuRow("Card for ${m.setup.away}") { open(Overlay.Team(AWAY)) } }
        }
        undoRow()
        if (m.phase == Phase.Break || m.phase == Phase.NextKickoff || m.phase == Phase.Decide || m.phase == Phase.Penalties || m.phase == Phase.Golden) {
            item { MenuRow("End match", onClick = endMatch) }
        } else if (m.phase != Phase.Done) {
            item { MenuRow("Cancel match") { open(Overlay.Confirm("Cancel match?", "Nothing is saved", "Cancel match", true) { AppState.clearMatch() }) } }
        }
        if (m.phase == Phase.Break || m.phase == Phase.NextKickoff || m.phase == Phase.Decide || m.phase == Phase.Penalties) abandonRow()
    }
}

/** UI-8: two digits; tap the top or bottom of one to change it, or turn the crown. */
@Composable
private fun NumberEntry(title: String, type: String, onDone: (Int?) -> Unit) {
    var tens by remember { mutableStateOf(0) }
    var ones by remember { mutableStateOf(0) }
    DigitsLayout(title, "Player number", when (type) { EVENT_YELLOW, EVENT_SIN_BIN -> C.yellow; EVENT_RED -> C.red; else -> null }, tens, ones, { tens = it }, { ones = it }) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PillButton("None", C.row, width = 62.dp) { onDone(null) }
            // EVT-3: 00 is no number, as None is.
            PillButton("OK", width = 62.dp) { onDone((tens * 10 + ones).takeIf { it > 0 }) }
        }
    }
}

/**
 * UI-8, TMR-14: two digits for a value from [min] to [max], starting at [start], with a green OK, dimmed (and doing
 * nothing) outside them. 00 is a real value here, so there's no None. EVT-12's sin bin length uses it too.
 */
@Composable
internal fun DigitsEntry(title: String, unit: String, start: Int, min: Int = 0, max: Int = 99, onDone: (Int) -> Unit) {
    var tens by remember { mutableStateOf(start / 10 % 10) }
    var ones by remember { mutableStateOf(start % 10) }
    val value = tens * 10 + ones
    DigitsLayout(title, unit, null, tens, ones, { tens = it }, { ones = it }) {
        if (value in min..max) PillButton("OK", width = 96.dp) { onDone(value) }
        else PillButton("OK", C.start.copy(alpha = 0.3f), C.dim, width = 96.dp) {}
    }
}

@Composable
private fun DigitsLayout(
    title: String, unit: String, swatch: Color?, tens: Int, ones: Int, setTens: (Int) -> Unit, setOnes: (Int) -> Unit, buttons: @Composable () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(Color.Black).padding(horizontal = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            swatch?.let { Box(Modifier.size(9.dp, 13.dp).background(it, RoundedCornerShape(1.5.dp))) }
            T(title, 14.sp, weight = FontWeight.SemiBold, lines = 1)
        }
        T(unit, 12.sp, C.dim, FontWeight.Normal, lines = 1)
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Digit(tens, setTens)
            Digit(ones, setOnes)
        }
        Spacer(Modifier.height(6.dp))
        buttons()
    }
}

@Composable
private fun Digit(value: Int, set: (Int) -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(44.dp, 22.dp).clickable { set((value + 1) % 10) }, contentAlignment = Alignment.Center) { Arrow(up = true) }
        Box(Modifier.size(44.dp, 44.dp).background(C.row, RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) { T("$value", 30.sp, figure = true) }
        Box(Modifier.size(44.dp, 22.dp).clickable { set((value + 9) % 10) }, contentAlignment = Alignment.Center) { Arrow(up = false) }
    }
}

@Composable
private fun Arrow(up: Boolean) {
    Canvas(Modifier.size(11.dp, 7.dp)) {
        val path = Path().apply {
            moveTo(0f, if (up) size.height else 0f)
            lineTo(size.width, if (up) size.height else 0f)
            lineTo(size.width / 2, if (up) 0f else size.height)
            close()
        }
        drawPath(path, C.dim)
    }
}

/** PRE-9: tap to flip. It turns over a few times, then lands, with a tap on the wrist. */
@Composable
private fun CoinToss() {
    val context = LocalContext.current
    var flips by remember { mutableStateOf(0) }
    var heads by remember { mutableStateOf(true) }
    var result by remember { mutableStateOf<String?>(null) }
    val turn = remember { Animatable(0f) }
    LaunchedEffect(flips) {
        if (flips == 0) return@LaunchedEffect
        result = null
        val landsHeads = Random.nextBoolean()
        turn.snapTo(0f)
        turn.animateTo(if (landsHeads) 6f else 7f, tween(1200, easing = FastOutSlowInEasing))
        heads = landsHeads
        result = if (landsHeads) "Heads" else "Tails"
        Haptics.tick(context)
    }
    Face {
        val flip = turn.value
        val showingHeads = if (flips == 0) heads else (flip + 0.5f).toInt() % 2 == 0
        val squash = abs(cos(flip * PI.toFloat()))
        Box(
            Modifier.align(Alignment.Center).size(maxWidth * 0.46f)
                .graphicsLayer { scaleY = maxOf(squash, 0.06f) }
                .background(C.coin, CircleShape).border(3.dp, C.coinEdge, CircleShape)
                .clickable { flips++ },
            contentAlignment = Alignment.Center,
        ) { T(if (showingHeads) "H" else "T", 40.sp, C.coinInk, figure = true) }
        val line = result ?: if (flips == 0) "Tap to flip" else " "
        val top = maxHeight * 0.13f
        val bottomY = maxHeight * 0.82f
        Box(Modifier.align(Alignment.TopCenter).offset(y = top)) { T("COIN TOSS", 13.sp, C.dim) }
        Box(Modifier.align(Alignment.TopCenter).offset(y = bottomY - 12.dp)) { T(line, if (result != null) 20.sp else 14.sp, if (result != null) C.text else C.dim, FontWeight.SemiBold) }
    }
}
