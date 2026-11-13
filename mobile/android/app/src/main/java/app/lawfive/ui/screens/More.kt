package app.lawfive.ui.screens

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.PermissionController
import androidx.activity.compose.rememberLauncherForActivityResult
import android.app.ActivityManager
import android.content.ClipData
import android.content.ActivityNotFoundException
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.net.toUri
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.BuildConfig
import app.lawfive.data.ApiException
import app.lawfive.data.Collections
import app.lawfive.data.Devices
import app.lawfive.data.str
import app.lawfive.data.PlanLine
import app.lawfive.data.ScreenSetup
import app.lawfive.data.tryMatchUrl
import app.lawfive.data.tryWatchFor
import app.lawfive.data.json
import app.lawfive.data.planEnd
import app.lawfive.data.planLines
import app.lawfive.schema.AccountPlan
import app.lawfive.schema.ServerMeta
import app.lawfive.schema.UserSettings
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.components.LinkButtonColored
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.instantOf
import app.lawfive.ui.theme.colors
import app.lawfive.ui.timeAgo
import app.lawfive.watch.LinkState
import app.lawfive.watch.LinkStep
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

// More (APP-4, APP-8): the account, the rest of the app, and what stays on the website for now.

fun openWebsite(context: Context, server: String, path: String = "") {
    // The hosted service's web app has its own address; a self-hosted server serves both from one.
    val site = server.trimEnd('/').replace("https://api.lawfive.app", "https://app.lawfive.app")
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("$site$path")))
}

/**
 * DEMO-9: Try a match on lawfive.app with this watch and the account's match screen and team swipes in its
 * address, in the app's own browser view (Custom Tabs), so closing it comes back to LawFive; in the browser
 * where none here opens Custom Tabs. The same address for every server, as nothing about the account goes.
 */
fun openTryMatch(context: Context, watch: String, settings: UserSettings?, toolbar: Color) {
    val uri = tryMatchUrl(watch, ScreenSetup.of(settings?.watchScreen), settings?.teamSwipes ?: "upDown").toUri()
    try {
        if (CustomTabsClient.getPackageName(context, emptyList()) != null) {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(toolbar.toArgb()).build())
                .build().launchUrl(context, uri)
        } else {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri))
        }
    } catch (_: ActivityNotFoundException) {
        // No browser at all: nothing to open it in.
    }
}

/** DEMO-9: the watch Try a match shows: the account's linked watch active most recently (GET /v1/devices lists them so), or a Garmin with none. */
fun tryWatchOf(devices: List<JsonObject>?): String {
    val latest = devices?.firstOrNull { it.str("kind") in Devices.watchKinds }
    return tryWatchFor(latest?.str("kind"), latest?.str("name"))
}

/** SYNC-15: whether Garmin Connect is on this phone, which linking a Garmin from here needs (APP-12). */
fun hasGarminConnect(context: Context): Boolean =
    runCatching { context.packageManager.getPackageInfo("com.garmin.android.apps.connectmobile", 0) }.isSuccess

/** SYNC-15: Link a watch's row in More and Settings offers "from this phone" only where Garmin Connect is. */
fun linkWatchSub(context: Context): String =
    if (hasGarminConnect(context)) "From this phone, or with a code" else "With the code on your watch"

/** WEB-29: Help, LawFive's support page on lawfive.app: questions, and how to reach us. */
const val HELP_URL = "https://lawfive.app/support"

/** Help, the same on the website and both phones: in More and in Settings → About. */
@Composable
fun HelpRow() {
    val context = LocalContext.current
    ListRow("Help", "Questions, and how to reach us", leading = { Avatar(icon = Ph.Help) }, onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, HELP_URL.toUri())) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
}

@Composable
fun MoreScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val session by graph.session.state.collectAsStateWithLifecycle()
    var signingOut by remember { mutableStateOf(false) }
    // DEMO-9: for Try a match, the account's match screen and its watches (when there's signal).
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    var devices by remember { mutableStateOf<List<JsonObject>?>(null) }
    LaunchedEffect(Unit) {
        devices = runCatching { graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject } }.getOrNull()
    }
    Screen("More", sub = syncLine()) {
        // Who's signed in is a board (WEB-24): the initials in a chalk circle, the name in black italic
        // capitals, the email, and Sign out in words.
        item {
            app.lawfive.ui.components.Board {
                // On a narrow phone or at the larger text sizes, Sign out goes under the email, leaving the name its room.
                val config = androidx.compose.ui.platform.LocalConfiguration.current
                val under = config.screenWidthDp < 360 || config.fontScale > 1.15f
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 14.dp, bottom = if (under) 4.dp else 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Avatar(text = app.lawfive.ui.initials(session.name ?: "?"), background = colors.onBoard, foreground = colors.board, size = 46.dp)
                    Column(Modifier.weight(1f)) {
                        // Whole at any width: the name wraps between words, and a word too long for the board, or the
                        // email, steps down to fit (wrapping only past the smallest size).
                        app.lawfive.ui.components.WordFitText((session.name ?: "").uppercase(), app.lawfive.ui.theme.LfType.display(26.sp, colors.onBoardStrong, 26.sp), min = 16.sp)
                        session.email?.let { app.lawfive.ui.components.WordFitText(it, MaterialTheme.typography.bodySmall, Modifier.padding(top = 4.dp), min = 10.sp) }
                        if (under) Box(Modifier.offset(x = (-6).dp)) { app.lawfive.ui.components.LinkButton("Sign out") { signingOut = true } }
                    }
                    if (!under) app.lawfive.ui.components.LinkButton("Sign out") { signingOut = true }
                }
            }
        }
        // WEB-31: the website's More groups (moreGroups), divided as Settings' are: the places of their
        // own with Settings among them, then getting set up and help. The phone has no admin pages;
        // admins use the website's.
        item {
            Column(Modifier.padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                LfCard {
                    ListRow("Competitions", "Leagues, cups and tournaments", leading = { Avatar(icon = Ph.Competitions) }, divider = false, onClick = { nav.navigate("competitions") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                    ListRow("Templates", "Formats you use often", leading = { Avatar(icon = Ph.Templates) }, onClick = { nav.navigate("templates") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                    // QUIZ-7.
                    ListRow("Quiz", "How well do you know the Laws of the Game?", leading = { Avatar(icon = Ph.Quiz) }, onClick = { nav.navigate("quiz") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                    // DEMO-9: lawfive.app's, as the phone hasn't its own, with the account's watch and match screen.
                    val toolbar = colors.board
                    ListRow("Try a match", "The watch app, on lawfive.app", leading = { Avatar(icon = Ph.Play) }, onClick = { openTryMatch(context, tryWatchOf(devices), settings, toolbar) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                    ListRow("Settings", "Units, your watch, calendars and your account", leading = { Avatar(icon = Ph.Settings) }, onClick = { nav.navigate("settings") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                }
                LfCard {
                    ListRow("Link a watch", linkWatchSub(context), leading = { Avatar(icon = Ph.Watch) }, divider = false, onClick = { nav.navigate("link") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                    HelpRow()
                }
            }
        }
    }
    if (signingOut) {
        Confirm("Sign out?", "The account's copy on this phone goes; changes not sent yet are lost.", "Sign out", onConfirm = {
            signingOut = false
            scope.launch { graph.signOut() }
        }, onDismiss = { signingOut = false })
    }
}


/** How to get a watch's code, in the words each watch shows, the same on the website and both phones. */
const val LINK_STEPS = "On your watch, open LawFive and go to Settings → Account → Link account. On a Garmin, then choose Get a code. The watch shows an eight-character code."

/** lawfive.dev's Watches page: which watches, and how to get LawFive on one. */
const val WATCHES_URL = "https://lawfive.dev/apps/watches/"

/**
 * Link a watch: the watches on this phone, linked from here with a press on the watch (APP-12,
 * SYNC-13); or the code any watch shows, looked up, then approved (SYNC-1).
 */
@Composable
fun LinkWatchScreen() {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // SYNC-15: without Garmin Connect the code comes first and there's no Garmin section; looked at again on
    // coming back, as it may just have been installed.
    var garminConnect by remember { mutableStateOf(hasGarminConnect(context)) }
    LifecycleResumeEffect(Unit) {
        garminConnect = hasGarminConnect(context)
        onPauseOrDispose {}
    }
    val watches by graph.watch.watches.collectAsStateWithLifecycle()
    val linking by graph.watch.linker.state.collectAsStateWithLifecycle()
    // The models of the watches linked to this account (GET /v1/devices), to say which of these are.
    var linkedModels by remember { mutableStateOf<Set<String>>(emptySet()) }
    LaunchedEffect(Unit) { graph.watch.refreshWatches() }
    LaunchedEffect(linking?.step) {
        linkedModels = runCatching {
            graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject }
                .filter { it.str("kind") == "garmin" }.mapNotNull { it.str("model") }.toSet()
        }.getOrDefault(linkedModels)
    }
    // Kept while the match screen setup is open from what next (SYNC-15), so coming back finds it linked.
    var code by rememberSaveable { mutableStateOf("") }
    var device by rememberSaveable { mutableStateOf<String?>(null) }
    // SYNC-15: the app asking to link (client_id: lawfive-garmin, lawfive-wear or lawfive-applewatch), for what it does now.
    var client by rememberSaveable { mutableStateOf<String?>(null) }
    var checked by rememberSaveable { mutableStateOf<String?>(null) }
    var done by rememberSaveable { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val clean = code.uppercase().filter { it.isLetterOrDigit() }
    val sub = if (garminConnect) "Link a Garmin from this phone, or any watch with the code it shows." else "Link any watch with the code it shows."
    Screen("Link a watch", sub = sub, back = "More") {
        if (garminConnect) item { SectionTitle("Garmin, from this phone") }
        if (garminConnect) item {
            LfCard {
                if (watches.isEmpty()) {
                    Text(
                        "Garmin watches paired with this phone show here. For Wear OS, Apple Watch or a watch not paired with this phone, use a code below.",
                        style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp),
                    )
                }
                watches.forEachIndexed { i, w ->
                    val linked = w.partNumber != null && w.partNumber in linkedModels
                    val sub = when {
                        linked -> "Linked to your account" + if (!w.connected) " · not connected" else ""
                        !w.connected -> "Not connected"
                        w.hasLawFive == false -> "LawFive isn't on it yet"
                        w.hasLawFive == true -> "Connected · LawFive is on it"
                        else -> "Connected"
                    }
                    ListRow(w.name, sub, leading = { Avatar(icon = Ph.Watch) }, divider = i > 0, trailing = {
                        if (w.connected && w.hasLawFive != false && linking?.watch != w.id) {
                            if (linked) SecondaryButton("Link again", { graph.watch.linker.offer(w.id) }) else PrimaryButton("Link", { graph.watch.linker.offer(w.id) })
                        }
                    })
                    if (w.hasLawFive == false) {
                        // Installing from the Connect IQ Store comes once LawFive is listed there.
                        Text(
                            "Install LawFive on the watch first. Until it's in Garmin's Connect IQ Store, it's installed from a computer (lawfive.dev).",
                            style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp),
                        )
                    }
                    linking?.takeIf { it.watch == w.id }?.let { state ->
                        LinkProgress(w.name, state, onRetry = { graph.watch.linker.offer(w.id) }, onDone = { graph.watch.linker.dismiss() })
                    }
                }
            }
        }
        item { SectionTitle("With a code") }
        item {
            LfCard {
                if (done) {
                    Linked(device, client) {
                        done = false
                        checked = null
                        code = ""
                        device = null
                        client = null
                    }
                } else Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    when {
                        checked != null -> {
                            Text(device?.let { "Link this $it?" } ?: "Link this watch?", style = MaterialTheme.typography.titleLarge)
                            Text("It will download your matches and upload the ones you referee.", style = MaterialTheme.typography.bodyMedium)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PrimaryButton("Link", {
                                    scope.launch {
                                        try {
                                            graph.api.call("POST", "/v1/auth/device/approve", JsonObject(mapOf("userCode" to JsonPrimitive(checked!!))))
                                            done = true
                                        } catch (e: Exception) {
                                            problem = e.message
                                        }
                                    }
                                })
                                SecondaryButton("Cancel", {
                                    scope.launch {
                                        runCatching { graph.api.call("POST", "/v1/auth/device/deny", JsonObject(mapOf("userCode" to JsonPrimitive(checked!!)))) }
                                        checked = null
                                        code = ""
                                    }
                                })
                            }
                        }
                        else -> {
                            Text(LINK_STEPS, style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                            Field("Code", code, { code = it.uppercase().take(9); problem = null }, placeholder = "XXXX-XXXX", keyboard = KeyboardType.Ascii, mono = true)
                            PrimaryButton("Next", {
                                scope.launch {
                                    try {
                                        val answer = graph.api.call("GET", "/v1/auth/device?user_code=$clean")
                                        if (answer.str("status") != "pending") throw ApiException(400, "That code has expired or been used. Get a new one on the watch.", null)
                                        device = answer.str("device_name")
                                        client = answer.str("client_id")
                                        checked = clean
                                    } catch (e: ApiException) {
                                        problem = if (e.status == 400 || e.status == 404) "That code isn't right, or it has expired. Check the watch." else e.message
                                    } catch (e: Exception) {
                                        problem = "No connection to the server."
                                    }
                                }
                            }, enabled = clean.length >= 8)
                        }
                    }
                    problem?.let { Text(it, color = colors.redText, style = MaterialTheme.typography.bodyMedium) }
                }
            }
        }
        // SYNC-15: a Garmin links from here once Garmin Connect is on the phone.
        if (!garminConnect) item {
            Text(
                "Have a Garmin? Install Garmin Connect and it links from here.",
                style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.fillMaxWidth().padding(top = 14.dp, start = 4.dp, end = 4.dp),
            )
        }
        // The watch app first: which watches, and how to get LawFive on one.
        item {
            Row(Modifier.fillMaxWidth().padding(top = 14.dp, start = 4.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Don't have LawFive on your watch yet?", style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.weight(1f, fill = false))
                app.lawfive.ui.components.LinkButton("How to get it") { context.startActivity(Intent(Intent.ACTION_VIEW, WATCHES_URL.toUri())) }
            }
        }
    }
}

/** Linking a watch from this phone (APP-12): the steps, where it has got to, and what to do next. */
@Composable
private fun LinkProgress(name: String, state: LinkState, onRetry: () -> Unit, onDone: () -> Unit) {
    val host = LocalGraph.current.session.current.server.substringAfter("://").trimEnd('/')
    Column(Modifier.fillMaxWidth().background(colors.surface2)) {
        HorizontalDivider(color = colors.border)
        // SYNC-15: the same what next as a code's; a watch linked from here is a Garmin.
        if (state.step == LinkStep.Linked) Linked(name, "garmin", onDone)
        else Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when (state.step) {
                LinkStep.Offering, LinkStep.Linking -> {
                    val linking = state.step == LinkStep.Linking
                    LinkStepRow(1, "Open LawFive on your $name", "The watch asks to open it; say yes there.", done = linking)
                    LinkStepRow(2, "Press Start", "When it asks \"Link to $host?\"", done = linking)
                    LinkStepRow(3, "Linked", "Your matches go to the watch.", done = false, current = linking)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LoadingPitch(inline = true)
                        Text(
                            if (linking) "Linking…" else "Waiting for your $name…",
                            style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.weight(1f).padding(start = 10.dp),
                        )
                        if (!linking) LinkButtonColored("Cancel", colors.muted, onDone)
                    }
                }
                else -> {
                    val (title, text) = when (state.step) {
                        LinkStep.Declined -> "Not linked" to "The watch said no."
                        LinkStep.Busy -> "The watch is in a match" to "Link it after the match."
                        LinkStep.NoAnswer -> "The watch didn't answer" to "Open LawFive on the watch, then try again. Keep it near the phone."
                        else -> "Couldn't link" to (state.message ?: "Something went wrong.")
                    }
                    Row(verticalAlignment = Alignment.Top) {
                        Avatar(icon = Ph.Info, background = colors.redSoft, foreground = colors.red, size = 34.dp)
                        Column(Modifier.padding(start = 12.dp)) {
                            Text(title, style = MaterialTheme.typography.titleMedium)
                            Text(text, style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        PrimaryButton("Try again", onRetry, icon = Ph.Sync)
                        SecondaryButton("Cancel", onDone)
                    }
                }
            }
        }
    }
}

/** One step of linking: a numbered circle (a tick once done), what to do, and a muted line. */
@Composable
private fun LinkStepRow(number: Int, title: String, sub: String, done: Boolean, current: Boolean = !done) {
    Row(verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(26.dp).clip(CircleShape)
                .background(if (done) colors.brand else if (current) colors.brandSoft else colors.surface)
                .border(1.dp, if (done || current) Color.Transparent else colors.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (done) PhIcon(Ph.Check, size = 15.dp, tint = colors.onBrand)
            else Text("$number", style = MaterialTheme.typography.labelLarge, color = if (current) colors.brandStrong else colors.muted)
        }
        Column(Modifier.padding(start = 12.dp, top = 2.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = if (done || current) colors.text else colors.muted)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
    }
}

/**
 * SYNC-15: a watch just linked, by its code or from this phone: a large tick and "{watch} is linked", what it
 * does now for its kind (only a Garmin syncs through the phone, APP-7), then Next: the match screen with Set
 * it up, and Try a match on that watch with it (DEMO-9); then Done.
 */
@Composable
private fun Linked(device: String?, kind: String?, onDone: () -> Unit) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val watch = tryWatchFor(kind, device)
    val toolbar = colors.board
    val setUp = { nav.navigate("settings/match-screen") }
    val tryIt = { openTryMatch(context, watch, settings, toolbar) }
    Column(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(colors.brandSoft), contentAlignment = Alignment.Center) {
                PhIcon(Ph.Check, size = 32.dp, tint = colors.brandStrong)
            }
            Text(device?.let { "$it is linked" } ?: "Your watch is linked", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center)
            Text(
                if (watch == "garmin" || watch == "venu") "It's downloading your next matches. It syncs through your phone when it's nearby, even with no signal at the field."
                else "It's downloading your next matches. It syncs on its own whenever it's online, so a match you finish with no signal goes up once it's back.",
                style = MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = TextAlign.Center,
            )
        }
        Text("NEXT", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 6.dp))
        ListRow(
            "Your match screen", settings?.let { screenLine(ScreenSetup.of(it.watchScreen)) },
            leading = { Avatar(icon = Ph.Watch) }, onClick = setUp, trailing = { SecondaryButton("Set it up", setUp) },
        )
        ListRow(
            "Try a match on your ${device ?: "watch"}", "See how a match runs on it, with your match screen. Nothing is saved.",
            leading = { Avatar(icon = Ph.Play) }, onClick = tryIt, trailing = { SecondaryButton("Try it", tryIt) },
        )
        HorizontalDivider(color = colors.border)
        PrimaryButton("Done", onDone, Modifier.fillMaxWidth().padding(16.dp))
    }
}
