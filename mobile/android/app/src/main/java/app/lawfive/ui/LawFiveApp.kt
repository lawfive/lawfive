package app.lawfive.ui

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.lawfive.AppGraph
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.screens.CompetitionEditScreen
import app.lawfive.ui.screens.CompetitionsScreen
import app.lawfive.ui.screens.ImportScreen
import app.lawfive.ui.screens.LinkWatchScreen
import app.lawfive.ui.screens.MatchEditScreen
import app.lawfive.ui.screens.ResultEditScreen
import app.lawfive.ui.screens.MatchScreen
import app.lawfive.ui.screens.MatchesScreen
import app.lawfive.ui.screens.MoreScreen
import app.lawfive.ui.screens.RefereeEditScreen
import app.lawfive.ui.screens.RefereeScreen
import app.lawfive.ui.screens.RefereesScreen
import app.lawfive.ui.screens.SettingsScreen
import app.lawfive.ui.screens.SignInScreen
import app.lawfive.ui.screens.TemplateEditScreen
import app.lawfive.ui.screens.TemplatesScreen
import app.lawfive.ui.screens.VenueEditScreen
import app.lawfive.ui.screens.VenueScreen
import app.lawfive.ui.screens.VenuesScreen
import app.lawfive.ui.screens.WaitingScreen
import app.lawfive.ui.theme.colors

// The app's screens: signing in, or the four tabs (APP-4) and what they open.

val LocalGraph = staticCompositionLocalOf<AppGraph> { error("no graph") }
val LocalNav = staticCompositionLocalOf<NavHostController> { error("no nav") }

/** A tab, and the start of the routes it opens (a match, a venue, a referee). */
private data class Tab(val route: String, val label: String, val icon: Ph, val opens: String? = null)

private val tabs = listOf(
    Tab("matches", "Matches", Ph.Matches, "match/"),
    Tab("venues", "Venues", Ph.Venues, "venue/"),
    Tab("referees", "Referees", Ph.Referees, "referee/"),
    // STAT-13: its own tab (the user's choice).
    Tab("stats", "Stats", Ph.Stats),
    Tab("more", "More", Ph.More),
)

@Composable
fun LawFiveApp(graph: AppGraph) {
    val session by graph.session.state.collectAsStateWithLifecycle()
    CompositionLocalProvider(LocalGraph provides graph) {
        Box(Modifier.fillMaxSize().background(colors.pitch)) {
            when {
                !session.signedIn -> SignInScreen()
                session.status == "pending" -> WaitingScreen()
                else -> Box(Modifier.fillMaxSize()) {
                    SignedIn()
                    // APP-16: over everything while a big sync runs.
                    app.lawfive.ui.screens.SyncScreen(graph.syncActivity)
                    // APP-26: what came in from the watch, once a sync has brought it.
                    app.lawfive.ui.screens.FromWatchScreen(graph)
                }
            }
            // A sign-in or invitation link while signed in (APP-13, APP-14): nothing changes without signing out first.
            val link by graph.pendingLink.collectAsStateWithLifecycle()
            if (session.signedIn && link != null) {
                app.lawfive.ui.theme.OnPanel {
                    androidx.compose.material3.AlertDialog(
                        onDismissRequest = { graph.pendingLink.value = null },
                        containerColor = colors.surface,
                        title = { Text("YOU'RE ALREADY SIGNED IN", style = app.lawfive.ui.theme.LfType.display(26.sp, colors.text, 26.sp)) },
                        text = { Text("You're signed in as ${session.email}. To use this ${if (link is app.lawfive.data.AppLink.Invite) "invitation" else "code"}, sign out first.") },
                        confirmButton = { app.lawfive.ui.components.LinkButtonColored("OK", colors.brand) { graph.pendingLink.value = null } },
                    )
                }
            }
            // A band of the board behind the status bar, so what scrolls under it never shows under the clock (WEB-6, WEB-24).
            Box(Modifier.fillMaxWidth().windowInsetsTopHeight(WindowInsets.statusBars).background(colors.board))
        }
    }
}

@Composable
private fun SignedIn() {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route ?: "matches"
    // A match, venue or referee belongs to its list's tab; everything else to More.
    val tab = tabs.firstOrNull { t -> route == t.route || route.startsWith("${t.route}/") || (t.opens != null && route.startsWith(t.opens)) } ?: tabs.first { it.route == "more" }
    val guard = remember { app.lawfive.ui.components.LeaveGuard() }
    // A notification tapped (APP-6, PUSH-5): its match, asking first if a form has changes.
    val graph = LocalGraph.current
    val openMatch by graph.pendingMatch.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(openMatch) {
        val id = openMatch ?: return@LaunchedEffect
        graph.pendingMatch.value = null
        guard.leave { nav.navigate("match/$id") { launchSingleTop = true } }
    }
    CompositionLocalProvider(LocalNav provides nav, app.lawfive.ui.components.LocalLeaveGuard provides guard) {
        app.lawfive.ui.components.LeavePrompt(guard)
        Scaffold(
            containerColor = colors.pitch,
            // Each screen keeps clear of the status bar itself; the tab bar of the navigation bar.
            contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
            bottomBar = {
                // WEB-24: the board is the tab bar along the bottom, condensed capitals under 22 dp
                // icons, the tab you're on in white with a chalk bar along its top edge.
                TabBar(tab) { t ->
                    guard.leave {
                        if (t == tab) {
                            // The tab already open: back to its first page.
                            nav.popBackStack(t.route, inclusive = false)
                        } else {
                            nav.navigate(t.route) {
                                popUpTo("matches") { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                }
            },
        ) { padding ->
            NavHost(
                // Above the keyboard (edge to edge, so the window doesn't resize for it): the page's list
                // shrinks and a field being typed in is scrolled into view. The tab bar's height, which
                // the keyboard covers anyway, isn't counted twice.
                nav, startDestination = "matches", modifier = Modifier.padding(padding).consumeWindowInsets(padding).imePadding(),
                // The back gesture crossfades, following the finger, as moving between pages does
                // (Navigation's own shrinks the page into a card).
                predictivePopEnterTransition = { fadeIn(tween(FADE_MS)) },
                predictivePopExitTransition = { fadeOut(tween(FADE_MS)) },
            ) {
                composable("matches") { MatchesScreen() }
                composable("match/new") { MatchEditScreen(null) }
                composable("match/{id}") { MatchScreen(it.arguments!!.getString("id")!!) }
                composable("match/{id}/edit") { MatchEditScreen(it.arguments!!.getString("id")!!) }
                composable("match/{id}/result") { ResultEditScreen(it.arguments!!.getString("id")!!) }
                composable("venues") { VenuesScreen() }
                composable("venue/new") { VenueEditScreen(null) }
                composable("venue/{id}") { VenueScreen(it.arguments!!.getString("id")!!) }
                composable("venue/{id}/edit") { VenueEditScreen(it.arguments!!.getString("id")!!) }
                composable("referees") { RefereesScreen() }
                composable("referee/new") { RefereeEditScreen(null) }
                composable("referee/{id}") { RefereeScreen(it.arguments!!.getString("id")!!) }
                composable("referee/{id}/edit") { RefereeEditScreen(it.arguments!!.getString("id")!!) }
                // Finding duplicates and merging (DUP-12): under the tab they're from.
                for (kind in app.lawfive.data.MergeKind.entries) {
                    composable("${kind.collection}/duplicates") { app.lawfive.ui.screens.DuplicatesScreen(kind) }
                    composable("${kind.collection}/merge/{id}?with={with}", listOf(androidx.navigation.navArgument("with") { defaultValue = "" })) {
                        app.lawfive.ui.screens.MergePickScreen(kind, it.arguments!!.getString("id")!!, it.arguments!!.getString("with")!!.split(",").filter { s -> s.isNotBlank() })
                    }
                    composable("${kind.collection}/merge/{id}/review?from={from}", listOf(androidx.navigation.navArgument("from") { defaultValue = "" })) {
                        app.lawfive.ui.screens.MergeReviewScreen(kind, it.arguments!!.getString("id")!!, it.arguments!!.getString("from")!!.split(",").filter { s -> s.isNotBlank() })
                    }
                }
                composable("stats") { app.lawfive.ui.screens.StatsScreen() }
                composable("more") { MoreScreen() }
                composable("quiz") { app.lawfive.ui.screens.QuizScreen() }
                composable("competitions") { CompetitionsScreen() }
                composable("competition/new") { CompetitionEditScreen(null) }
                composable("competition/{id}") { CompetitionEditScreen(it.arguments!!.getString("id")!!) }
                composable("templates") { TemplatesScreen() }
                composable("template/new") { TemplateEditScreen(null) }
                composable("template/{id}") { TemplateEditScreen(it.arguments!!.getString("id")!!) }
                composable("import") { ImportScreen() }
                // Get ready's Change opens it at a group (WEB-32).
                composable("settings?at={at}", listOf(androidx.navigation.navArgument("at") { defaultValue = "" })) { SettingsScreen(it.arguments?.getString("at")?.ifEmpty { null }) }
                composable("settings/licenses") { app.lawfive.ui.screens.LicensesScreen() }
                composable("settings/match-screen") { app.lawfive.ui.screens.MatchScreenSetupScreen() }
                composable("link") { LinkWatchScreen() }
            }
        }
    }
}

@Composable
private fun TabBar(current: Tab, onSelect: (Tab) -> Unit) {
    app.lawfive.ui.theme.OnBoard {
        val c = colors
        androidx.compose.foundation.layout.Column(Modifier.fillMaxWidth().background(c.board)) {
            if (c.dark) Box(Modifier.fillMaxWidth().height(1.dp).background(c.boardEdge))
            androidx.compose.foundation.layout.Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 4.dp).selectableGroup(),
            ) {
                for (t in tabs) {
                    val on = t == current
                    val tint = if (on) c.onBoardStrong else c.onBoardMuted
                    androidx.compose.foundation.layout.Column(
                        Modifier.weight(1f)
                            .selectable(selected = on, role = androidx.compose.ui.semantics.Role.Tab, onClick = { onSelect(t) })
                            .drawBehind { if (on) drawRect(c.onBoardStrong, topLeft = androidx.compose.ui.geometry.Offset(size.width * 0.1f, 0f), size = androidx.compose.ui.geometry.Size(size.width * 0.8f, 3.dp.toPx())) }
                            .padding(top = 11.dp, bottom = 9.dp),
                        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(3.dp),
                    ) {
                        PhIcon(t.icon, size = 22.dp, tint = tint)
                        // Smaller rather than cut short at the phone's larger text sizes ("REFEREES" on a narrow phone).
                        app.lawfive.ui.components.FitText(t.label.uppercase(), app.lawfive.ui.theme.LfType.word(13.sp, tint, if (on) androidx.compose.ui.text.font.FontWeight.ExtraBold else androidx.compose.ui.text.font.FontWeight.Bold), Modifier.padding(horizontal = 3.dp), min = 9.sp)
                    }
                }
            }
        }
    }
}

/** Navigation's fade between pages. */
private const val FADE_MS = 300
