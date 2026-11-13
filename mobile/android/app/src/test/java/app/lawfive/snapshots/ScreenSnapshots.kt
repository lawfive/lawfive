package app.lawfive.snapshots

import android.app.Application
import android.content.ComponentName
import android.content.res.Configuration
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.lawfive.AppGraph
import app.lawfive.ReminderSettings
import app.lawfive.data.AppClock
import app.lawfive.data.quizAnswerIsRight
import app.lawfive.data.quizPool
import app.lawfive.data.quizVerdict
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.screens.Attempt
import app.lawfive.ui.screens.Kept
import app.lawfive.ui.screens.MatchEditScreen
import app.lawfive.ui.screens.MatchScreen
import app.lawfive.ui.screens.MatchesScreen
import app.lawfive.ui.screens.QuizScreen
import app.lawfive.ui.screens.SettingsScreen
import app.lawfive.ui.screens.StatsScreen
import app.lawfive.ui.theme.LawFiveTheme
import app.lawfive.ui.theme.colors
import com.github.takahirom.roborazzi.captureScreenRoboImage
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.time.Instant
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil
import kotlin.random.Random

// Snapshot tests (mobile/android/README.md#snapshot-tests): the screens the reviews keep checking, drawn by
// Android's own code on Robolectric from the shared fixtures, in light and dark, at 412 and 320 dp,
// and at font scale 1.0 and 1.3. For review: every picture is written each run (to
// mobile/android/build/snapshots/, as {screen}__{width}-{theme}-{text}.png) and none is compared, so
// nothing here fails over a picture. Each page is drawn whole, as tall as its content.
//
// One test, not one per screen: the app's DataStore files are made once a process, so one app and
// one graph serve every screen (the demo's, then a new account's).

/** The app without its start-up (push, the Garmin watch, background sync): the test makes its own graph. */
class SnapshotApp : Application()

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(application = SnapshotApp::class)
class ScreenSnapshots {
    @get:Rule
    val compose = createEmptyComposeRule()

    data class Variant(val width: Int, val dark: Boolean, val large: Boolean) {
        val fontScale get() = if (large) 1.3f else 1f
        val name get() = "$width-${if (dark) "dark" else "light"}-${if (large) "large" else "1x"}"
        /** The phone's own height, the least a picture is: a Pixel 9 Pro's, or a small phone's. */
        val minHeight get() = if (width >= 412) 915 else 675
    }

    private val variants = listOf(412, 320).flatMap { w -> listOf(false, true).flatMap { dark -> listOf(false, true).map { Variant(w, dark, it) } } }
    private val out = File(System.getProperty("lawfive.snapshots") ?: "build/snapshots")
    private val only = System.getProperty("lawfive.snapshots.only")?.split(",")?.map { it.trim() }?.filter { it.isNotEmpty() }?.toSet()
    private val index = Json.parseToJsonElement(fixture("index.json")).jsonObject
    private val now = index["now"]!!.jsonPrimitive.content
    private val ids = index["demo"]!!.jsonObject["matches"]!!.jsonObject
    private val server by lazy { FakeServer(now) }
    private val app: Application by lazy { ApplicationProvider.getApplicationContext() }
    private lateinit var graph: AppGraph
    private val timings = mutableListOf<String>()

    @After
    fun stop() {
        AppClock.fixed = null
        server.close()
    }

    @Test
    fun screens() {
        val started = System.nanoTime()
        // The fixtures' moment and place: 08:00 on Monday 9 November 2026 in Los Angeles.
        AppClock.fixed = Instant.parse(now)
        TimeZone.setDefault(TimeZone.getTimeZone(index["timeZone"]!!.jsonPrimitive.content))
        Locale.setDefault(Locale.US)
        shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
        out.mkdirs()
        graph = AppGraph(app)

        signIn(graph, "demo")
        snap("matches", wait = "Rovers U12", foot = 120) { MatchesScreen() }
        snap("match-played", wait = "Where you went") { MatchScreen(ids["withTrack"]!!.jsonPrimitive.content) }
        // APP-6: with this phone's reminders on, so their times show; off again for the screens after.
        snap("settings", wait = "Where you're signed in", setup = { runBlocking { graph.reminders.save(ReminderSettings(enabled = true)) } }) { SettingsScreen() }
        runBlocking { graph.reminders.save(ReminderSettings()) }
        snap("match-form", wait = "Fee and notes", foot = 130) { MatchEditScreen(null) }
        snap("stats", wait = "Where on the pitch") { StatsScreen() }
        val bank = graph.quiz.local()
        val questions = quizPool(bank, "easy").take(10)
        // Three answered, the third wrongly, as it shows with its explanations.
        val right = { i: Int -> questions[i].options.filter { it.correct }.map { it.id } }
        val wrong = { i: Int -> listOf(questions[i].options.first { !it.correct }.id) }
        snap("quiz", wait = "Question 3 of 10", setup = { Kept.attempt = Attempt("easy", questions, index = 2, answers = listOf(right(0), wrong(1), wrong(2))) }) { QuizScreen() }
        // Seven of ten right.
        val answers = questions.indices.map { if (it in setOf(1, 4, 8)) wrong(it) else right(it) }
        check(questions.indices.count { quizAnswerIsRight(questions[it], answers[it]) } == 7)
        snap("quiz-result", wait = "Go again", setup = { Kept.attempt = Attempt("easy", questions, index = 9, answers = answers, verdict = quizVerdict(0.7, Random(1))) }) { QuizScreen() }
        Kept.attempt = null

        // A new account: nothing yet, so Get ready.
        runBlocking { graph.forgetAccount() }
        signIn(graph, "new-account")
        snap("matches-new", wait = "Get ready", foot = 120) { MatchesScreen() }

        println("snapshots: ${timings.size} pictures in ${(System.nanoTime() - started) / 1_000_000_000} s, in ${out.absolutePath}")
        if (server.missing.isNotEmpty()) println("snapshots: asked for but not in the fixtures: ${server.missing.joinToString()}")
    }

    /** Signs in to the fake server as that account and syncs, as a phone's first sync does. */
    private fun signIn(graph: AppGraph, account: String) = runBlocking {
        val who = index["accounts"]!!.jsonObject[account]!!.jsonObject
        graph.session.signedIn(server.url, account, "user-$account", who["name"]!!.jsonPrimitive.content, who["email"]!!.jsonPrimitive.content, "active")
        // The session's state follows its store a moment later, and a sync asked for by a screen may be running.
        withTimeout(TIMEOUT_MS) { graph.session.state.first { it.token == account } }
        var synced = false
        for (i in 1..20) {
            graph.sync.status.first { !it.running }
            synced = graph.sync.sync()
            if (synced) break
            delay(100)
        }
        check(synced) { "the first sync failed: ${graph.sync.status.value.problem}" }
        graph.weather.refresh(force = true)
        graph.weather.refresh(past = true, force = true)
        graph.onWatch.refresh()
    }

    /**
     * Draws a screen in every variant: once in a very tall window to find how far its content goes,
     * then again in a window that tall (at least the phone's), so a form's bottom bar and the add
     * button sit where they would on a phone that tall. `foot` is what the page has under its last
     * row (the frame's goal line and the room left for a bottom bar or add button).
     */
    private fun snap(key: String, wait: String, foot: Int = 60, setup: () -> Unit = {}, screen: @Composable () -> Unit) {
        if (only != null && key !in only) return
        for (v in variants) {
            val started = System.nanoTime()
            // A page that comes near the window's foot is measured again in one twice as tall.
            var tall = TALL
            var content: Float
            while (true) {
                setup()
                content = draw(v, tall, wait, screen) { contentBottom(tall) }
                if (content < tall - 1000 || tall >= TALLEST) break
                tall *= 2
            }
            val height = minOf(maxOf(v.minHeight, ceil(content + foot).toInt()), TALLEST)
            setup()
            draw(v, height, wait, screen) { captureScreenRoboImage(File(out, "${key}__${v.name}.png").path) }
            timings += "$key ${v.name}: ${height} dp, ${(System.nanoTime() - started) / 1_000_000} ms"
            println("snapshots: ${timings.last()}")
        }
    }

    /**
     * Drawn again once if what it waits for never showed: the played match's map and heart rate now
     * and then don't come up in Robolectric although the track has arrived (not yet understood; the
     * page's other rows draw), and a second try draws them. A page that never shows it still fails.
     */
    private fun <T> draw(v: Variant, height: Int, wait: String, screen: @Composable () -> Unit, then: () -> T): T =
        try {
            drawOnce(v, height, wait, screen, then)
        } catch (e: AssertionError) {
            println("snapshots: ${v.name} drawn again: ${e.message?.take(80)}")
            drawOnce(v, height, wait, screen, then)
        }

    private fun <T> drawOnce(v: Variant, height: Int, wait: String, screen: @Composable () -> Unit, then: () -> T): T {
        RuntimeEnvironment.setQualifiers("en-rUS-w${v.width}dp-h${height}dp-${if (v.dark) "night" else "notnight"}-xhdpi")
        RuntimeEnvironment.setFontScale(v.fontScale)
        val scenario = ActivityScenario.launch(ComponentActivity::class.java)
        try {
            scenario.onActivity { it.setContent { Page(v) { screen() } } }
            try {
                compose.waitUntil(TIMEOUT_MS) { compose.onAllNodesWithText(wait, substring = true, ignoreCase = true).fetchSemanticsNodes().isNotEmpty() }
            } catch (e: androidx.compose.ui.test.ComposeTimeoutException) {
                // What the page showed instead, to see why.
                captureScreenRoboImage(File(out, "failed__${v.name}.png").path)
                throw AssertionError("\"$wait\" never showed; the page said: ${texts(compose.onRoot(useUnmergedTree = true).fetchSemanticsNode()).joinToString(" | ")}", e)
            }
            settle()
            return then()
        } finally {
            scenario.close()
        }
    }

    /** Until what's on the page stops changing: data arriving from the database and the fake server. */
    private fun settle() {
        var last = ""
        var same = 0
        val until = System.currentTimeMillis() + TIMEOUT_MS
        while (same < 4 && System.currentTimeMillis() < until) {
            compose.waitForIdle()
            val now = describe(compose.onRoot(useUnmergedTree = true).fetchSemanticsNode())
            if (now == last) same++ else { same = 0; last = now }
            Thread.sleep(60)
        }
        compose.waitForIdle()
    }

    private fun texts(node: SemanticsNode): List<String> =
        (node.config.getOrNull(SemanticsProperties.Text)?.map { it.text } ?: emptyList()) + node.children.flatMap { texts(it) }

    private fun describe(node: SemanticsNode): String =
        node.boundsInRoot.toString() + (node.config.getOrNull(SemanticsProperties.Text)?.joinToString() ?: "") +
            node.children.joinToString("|", "[", "]") { describe(it) }

    /** In dp: the bottom of the lowest thing on the page, leaving out what's pinned to the window's foot. */
    private fun contentBottom(window: Int): Float {
        val root = compose.onRoot(useUnmergedTree = true).fetchSemanticsNode()
        val density = root.layoutInfo.density.density
        val limit = (window - 400) * density
        var lowest = 0f
        fun walk(n: SemanticsNode) {
            val b = n.boundsInRoot
            if (b.height < root.boundsInRoot.height * 0.8f && b.bottom < limit && b.bottom > lowest) lowest = b.bottom
            n.children.forEach(::walk)
        }
        walk(root)
        return lowest / density
    }

    /** The screen as LawFiveApp hosts it, in a NavHost of its own; maps as placeholders (LocalInspectionMode). */
    @Composable
    private fun Page(v: Variant, screen: @Composable () -> Unit) {
        // The font scale through the configuration, as a phone's setting arrives (with Android 14's
        // nonlinear scaling), whatever Robolectric's own setting does.
        val base = LocalContext.current
        val scaled = remember(v) { base.createConfigurationContext(Configuration(base.resources.configuration).apply { fontScale = v.fontScale }) }
        CompositionLocalProvider(
            LocalInspectionMode provides true,
            LocalDensity provides Density(scaled),
            LocalConfiguration provides scaled.resources.configuration,
        ) {
            LawFiveTheme(dark = v.dark) {
                val nav = rememberNavController()
                CompositionLocalProvider(LocalGraph provides graph, LocalNav provides nav) {
                    Box(Modifier.fillMaxSize().background(colors.pitch)) {
                        NavHost(nav, startDestination = "screen") { composable("screen") { screen() } }
                    }
                }
            }
        }
    }

    private companion object {
        /** The first window's height, in dp, to measure a page in; doubled for a longer page, to the tallest. */
        const val TALL = 6000
        const val TALLEST = 24000
        /** How long a page's content may take to arrive: the played match's track takes over 15 s while the rest of the suite runs alongside. */
        const val TIMEOUT_MS = 60_000L
    }
}
