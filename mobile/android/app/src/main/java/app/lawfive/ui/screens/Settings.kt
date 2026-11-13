package app.lawfive.ui.screens

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.PermissionController
import androidx.activity.compose.rememberLauncherForActivityResult
import android.app.ActivityManager
import android.content.ClipData
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.net.toUri
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.foundation.clickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.BuildConfig
import app.lawfive.data.ApiException
import app.lawfive.data.Devices
import app.lawfive.data.str
import app.lawfive.data.PlanLine
import app.lawfive.data.json
import app.lawfive.data.planEnd
import app.lawfive.data.planLines
import app.lawfive.schema.AccountPlan
import app.lawfive.schema.ServerMeta
import app.lawfive.schema.UserSettings
import app.lawfive.schema.UsualFormat
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.components.LinkButtonColored
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.whenText
import app.lawfive.ui.instantOf
import app.lawfive.ui.roleNamesInFull
import app.lawfive.ui.theme.colors
import app.lawfive.ui.timeAgo
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

// Settings (APP-4), in the groups the website has (the owner's choice, 2026-11-09): You, Your
// watch, Match day, New matches, Units and money, Fitness, Your data and About; then, apart at the
// end, erasing this phone's copy and deleting the account. What only the website does (assignor
// calendars, API keys, webhooks, the server's own settings) stays there.

private val schemes = listOf("ifab" to "Laws of the Game", "ussf" to "United States", "fa" to "England")

/** CAL-3: when the calendar feed's events start, as the website offers it: at kickoff, or every 15 minutes up to 3 hours before. */
private val arriveOptions = listOf(0) + (15..180 step 15)

/** A group of Settings: its heading on the grass and what's in it, as one row of the page, so a link can open the page at it. */
private class Group(val key: String, val title: String, val content: @Composable () -> Unit)

@Composable
fun SettingsScreen(at: String? = null) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val session by graph.session.state.collectAsStateWithLifecycle()
    val stored by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val templates by graph.records.templates.collectAsStateWithLifecycle(emptyList())
    // APP-4: with no settings record yet, the phone's defaults are shown, and the first change makes it.
    fun save(change: (UserSettings) -> UserSettings) {
        scope.launch { graph.records.saveSettings(change) }
    }
    var calendar by remember { mutableStateOf<String?>(null) }
    var calendarKnown by remember { mutableStateOf(false) }
    var devices by remember { mutableStateOf<List<JsonObject>?>(null) }
    var meta by remember { mutableStateOf<ServerMeta?>(null) }
    var erasing by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }
    // SEC-7: which sign-out everywhere else is being confirmed: browsers or all.
    var signingOutOthers by remember { mutableStateOf<String?>(null) }
    // SEC-7: the one device whose unlink (or a browser's sign-out) is being confirmed.
    var unlinking by remember { mutableStateOf<JsonObject?>(null) }
    var storage by remember { mutableStateOf<String?>(null) }
    var plan by remember { mutableStateOf<AccountPlan?>(null) }
    val relay by graph.watch.relay.state.collectAsStateWithLifecycle()
    suspend fun loadDevices() {
        devices = runCatching { graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject } }.getOrDefault(devices)
    }
    // What Settings fetches from the server itself, on opening and on a pull (APP-3); what's shown stays without signal.
    suspend fun load() {
        // USR-9: whether a new email waits for its link.
        graph.refreshAccount()
        loadDevices()
        runCatching { graph.api.call("GET", "/v1/calendar").str("url") }.onSuccess { calendar = it }
        calendarKnown = true
        meta = graph.meta() ?: meta
        runCatching { storageLine(graph.api.call("GET", "/v1/account/storage")!!.jsonObject) }.onSuccess { storage = it }
        // PLAN-6: servers from before plans have none, and show storage alone.
        runCatching { json.decodeFromJsonElement(AccountPlan.serializer(), graph.api.call("GET", "/v1/account/plan")!!) }.onSuccess { plan = it }
    }
    LaunchedEffect(Unit) { load() }
    // SEC-7, SYNC-6: the devices again whenever Settings comes back into view, as a watch may have been unlinked on
    // itself or linked meanwhile.
    var opened by remember { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        val job = if (opened) scope.launch { loadDevices() } else null
        opened = true
        onPauseOrDispose { job?.cancel() }
    }
    val refresh = syncRefresh { load() }
    val s = stored
    val watches = devices?.filter { it.str("kind") in Devices.watchKinds }
    val others = devices?.filter { it.str("kind") !in Devices.watchKinds }
    val list = androidx.compose.foundation.lazy.rememberLazyListState()
    val muted = MaterialTheme.typography.bodySmall

    val groups = if (s == null) emptyList() else listOfNotNull(
        // USR-10, USR-9, USR-7, PLAN-9: who you are, and where you're signed in.
        Group("you", "You") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                LfCard {
                    ListRow("Name", session.name, leading = { Avatar(text = app.lawfive.ui.initials(session.name ?: "?")) }, divider = false, onClick = { editing = "name" }, trailing = { PhIcon(Ph.Edit, "Change your name", tint = colors.muted) })
                    ListRow("Email", session.email, leading = { Avatar(icon = Ph.Mail) }, onClick = { editing = "email" }, trailing = { PhIcon(Ph.Edit, "Change your email", tint = colors.muted) })
                    // USR-9: a new address waiting for its link, in amber, with Cancel.
                    session.pendingEmail?.let { waiting ->
                        var canceling by remember { mutableStateOf(false) }
                        var cancelFailed by remember { mutableStateOf(false) }
                        val until = instantOf(session.pendingEmailUntil)?.atZone(java.time.ZoneId.systemDefault())
                        Row(
                            Modifier.fillMaxWidth().background(colors.amberSoft).padding(horizontal = 16.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            PhIcon(Ph.Mail, size = 20.dp, tint = colors.amberText)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("Check $waiting for a link", style = MaterialTheme.typography.titleMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold), color = colors.text)
                                Text(
                                    "Your email changes when you open it" + (until?.let { ", until ${whenText(it, context)}" } ?: "") + ". Until then you sign in with ${session.email}." +
                                        if (cancelFailed) " Couldn't cancel; try again." else "",
                                    style = MaterialTheme.typography.bodySmall, color = colors.text,
                                )
                            }
                            SecondaryButton(if (canceling) "Canceling…" else "Cancel", {
                                canceling = true
                                cancelFailed = false
                                scope.launch {
                                    cancelFailed = runCatching { graph.cancelEmailChange() }.isFailure
                                    canceling = false
                                }
                            }, enabled = !canceling)
                        }
                    }
                    ListRow("Password", "Watches and devices already signed in stay signed in.", leading = { Avatar(icon = Ph.Eye) }, onClick = { editing = "password" }, trailing = { PhIcon(Ph.Edit, "Change your password", tint = colors.muted) })
                    // PLAN-9: where the account is; a plan ends at midnight there. Any zone can be chosen on the website.
                    val here = java.time.ZoneId.systemDefault().id
                    val zone = s.timeZone ?: here
                    ListRow("Time zone", zone.replace("_", " ") + if (zone == here) " · set by your phone" else " · not this phone's", leading = { Avatar(icon = Ph.Clock) })
                    Text(
                        "For games from your assignor's calendar that don't say their time zone, and when a plan ends (at midnight here). Each match keeps its own.",
                        style = muted, color = colors.muted, modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp),
                    )
                    if (zone != here) {
                        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
                            SecondaryButton("Use this phone's (${here.replace("_", " ")})", { save { x -> x.copy(timeZone = here) } })
                        }
                    }
                }
                SectionTitle("Where you're signed in", small = true)
                LfCard {
                    if (others == null) Text("Shown when there's signal.", style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp))
                    // WEB-33: this phone first, then the most recently active; the latest five, with Show all for the rest.
                    var allSessions by remember { mutableStateOf(false) }
                    val sessions = others.orEmpty().sortedWith(compareByDescending<JsonObject> { it["current"]?.toString() == "true" }.thenByDescending { it.str("lastActiveAt") ?: "" })
                    val folds = sessions.size > LATEST_SESSIONS
                    (if (folds && !allSessions) sessions.take(LATEST_SESSIONS) else sessions).forEachIndexed { i, d -> DeviceRow(d, divider = i > 0) { unlinking = d } }
                    if (folds) {
                        ListRow(
                            if (allSessions) "Show fewer" else "Show all (${sessions.size})", onClick = { allSessions = !allSessions },
                            trailing = { PhIcon(Ph.Chevron, size = 18.dp, tint = colors.muted, modifier = if (allSessions) Modifier.rotate(180f) else Modifier) },
                        )
                    }
                    if ((devices?.size ?: 0) > 1) {
                        if (devices!!.any { it.str("kind") == "browser" && it["current"]?.toString() != "true" }) {
                            ListRow("Sign out other browsers", "Watches and phones stay linked", leading = { Avatar(icon = Ph.Globe) }, onClick = { signingOutOthers = "browsers" })
                        }
                        ListRow("Unlink everything else", "If you've lost a device, or think someone else is signed in", leading = { Avatar(icon = Ph.Out, background = colors.surface2, foreground = colors.red) }, onClick = { signingOutOthers = "all" })
                    }
                }
            }
        },
        // The watch: linked ones and linking another, the match screen, team swipes, Health Connect.
        Group("watch", "Your watch") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                LfCard {
                    when {
                        watches == null -> Text("Your linked watches show when there's signal.", style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp))
                        watches.isEmpty() -> Text("No watch is linked yet.", style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(16.dp))
                        else -> watches.forEachIndexed { i, d -> DeviceRow(d, divider = i > 0) { unlinking = d } }
                    }
                    ListRow("Link a watch", linkWatchSub(context), leading = { Avatar(icon = Ph.Plus) }, onClick = { nav.navigate("link") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
                    ListRow("How to get LawFive on your watch", "Which watches, and how to put it on yours", leading = { Avatar(icon = Ph.Help) }, onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, WATCHES_URL.toUri())) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                }
                // UI-24, UI-27: the latest change wins, here, on the website or on a watch. DEMO-9: Try a match is
                // lawfive.app's, in the app's own browser view, with the watch active most recently (a Garmin
                // with none) and this screen in its address.
                LfCard {
                    MatchScreenSummary(s.watchScreen)
                    HorizontalDivider(color = colors.border)
                    val toolbar = colors.board
                    ListRow("Try a match", "On lawfive.app: your watch with this screen. Nothing is saved.", leading = { Avatar(icon = Ph.Play) }, divider = false, onClick = { openTryMatch(context, tryWatchOf(watches), s, toolbar) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                }
                // INP-10: Garmin and Apple watches; a Wear OS watch always swipes sideways, so it's left out with only those.
                if (watches == null || watches.isEmpty() || watches.any { it.str("kind") != "wearos" }) {
                    LfCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            val names = mapOf("upDown" to "Up and down", "sideways" to "Sideways")
                            Choice("Team swipes", s.teamSwipes ?: "upDown", names.keys.toList(), { names[it] ?: "" }, { save { x -> x.copy(teamSwipes = it ?: "upDown") } })
                            Text("On Garmin and Apple watches, how a swipe opens a team's controls: down for home and up for away, or right for home and left for away. Wear OS watches always swipe sideways.", style = muted, color = colors.muted)
                        }
                    }
                }
                // ACT-1, WCH-7: Wear OS matches into Health Connect, which isn't on watches; with a Wear OS watch.
                if (graph.health.available && (watches == null || watches.any { it.str("kind") == "wearos" })) HealthConnectCard()
            }
        },
        // Getting to the ground on time: this phone's reminders, the calendar feed, directions.
        Group("matchday", "Match day") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                RemindersSettings()
                LfCard {
                    val feed = calendar
                    if (feed != null) {
                        ListRow("Your calendar feed", feed, leading = { Avatar(icon = Ph.Calendar) }, divider = false)
                        Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SecondaryButton("Copy", {
                                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("LawFive calendar", feed))
                            }, icon = Ph.Copy)
                            SecondaryButton("Add to Google Calendar", {
                                val webcal = feed.replace(Regex("^https?://"), "webcal://")
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://calendar.google.com/calendar/r?cid=${Uri.encode(webcal)}")))
                            }, icon = Ph.Calendar)
                        }
                        // CAL-3: the feed's own times, once there's a feed to have them.
                        HorizontalDivider(color = colors.border)
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Choice("Events start", s.calendarArriveMin ?: 30, arriveOptions, { m -> if (m == null || m == 0) "At kickoff" else "${beforeText(m)} before" }, { m -> save { x -> x.copy(calendarArriveMin = m ?: 30) } })
                            Text("When your calendar shows you as busy from, for travel and warming up. The description gives the kickoff.", style = muted, color = colors.muted)
                        }
                    } else {
                        ListRow("Your matches in your calendar", if (calendarKnown) "Turn on the calendar feed to subscribe in Google Calendar or another app." else "Shown when there's signal.", leading = { Avatar(icon = Ph.Calendar) }, divider = false)
                        if (calendarKnown) Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 14.dp)) {
                            PrimaryButton("Turn on", {
                                scope.launch { calendar = runCatching { graph.api.call("POST", "/v1/calendar", JsonObject(emptyMap())).str("url") }.getOrNull() }
                            })
                        }
                    }
                }
                // WEB-14: where Directions open, for the account, so the website and phones agree.
                LfCard {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        val names = mapOf("auto" to "Automatic (Google Maps)", "google" to "Google Maps", "apple" to "Apple Maps")
                        Choice("Directions open in", s.mapsApp ?: "auto", names.keys.toList(), { names[it] ?: "" }, { save { x -> x.copy(mapsApp = it ?: "auto") } })
                        Text("On the website, the Android app and the iPhone app. Automatic is Apple Maps in the iPhone app and Google Maps everywhere else.", style = muted, color = colors.muted)
                    }
                }
            }
        },
        // SET-17: what a new match on the form starts with; a competition can have its own codes and template.
        Group("new", "New matches") {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Choice("Usual role", s.usualRole ?: "referee", listOf("referee", "ar1", "ar2", "fourth"), { roleNamesInFull[it] ?: "Referee" }, { r -> save { x -> x.copy(usualRole = r ?: "referee") } })
                    Text("Your role on a new match. Change it on the match when it's different.", style = muted, color = colors.muted)
                    UsualFormatChoice(s.usualFormat, templates) { u -> save { x -> x.copy(usualFormat = u) } }
                    Text(
                        (s.usualFormat?.let { app.lawfive.ui.describeFormat(it.format) } ?: "Not chosen yet: ${app.lawfive.ui.describeFormat(app.lawfive.data.schemaDefaultFormat)}, 11 a side") +
                            ". A new match starts with it, unless its competition has a template; saving a new match makes its format the usual one.",
                        style = muted, color = colors.muted,
                    )
                    Choice("Misconduct codes", s.misconductScheme, schemes.map { it.first }, { id -> schemes.firstOrNull { it.first == id }?.second ?: id ?: "" }, { save { x -> x.copy(misconductScheme = it ?: "ifab") } })
                    Text("The codes for cautions and send-offs. A competition can use a different set.", style = muted, color = colors.muted)
                }
            }
        },
        Group("units", "Units and money") {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Choice("Distance", s.distanceUnit, listOf("km", "mi"), { if (it == "mi") "Miles" else "Kilometers" }, { save { x -> x.copy(distanceUnit = it ?: "km") } })
                    Text("The distance you cover in matches; also rain (inches with miles) and wind.", style = muted, color = colors.muted)
                    Choice("Temperature", s.temperatureUnit, listOf("c", "f"), { if (it == "f") "°F" else "°C" }, { save { x -> x.copy(temperatureUnit = it ?: "c") } })
                    Text("Match-day forecasts.", style = muted, color = colors.muted)
                    Field("Currency", s.currency, { v -> if (v.length == 3 && v.all { it.isLetter() }) save { x -> x.copy(currency = v.uppercase()) } }, supporting = "For new match fees. Each fee keeps its own currency. A three-letter code: USD, GBP, EUR")
                }
                // Get ready's "Your units and time zone" lands here: the zone itself is under You.
                HorizontalDivider(color = colors.border)
                ListRow("Time zone", (s.timeZone ?: java.time.ZoneId.systemDefault().id).replace("_", " ") + ", under You", divider = false, onClick = { scope.launch { list.animateScrollToItem(0) } }, trailing = { PhIcon(Ph.Next, tint = colors.muted, modifier = Modifier.rotate(-90f)) })
            }
        },
        Group("fitness", "Fitness") {
            LfCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OptionalNumberField(
                        "Maximum heart rate", s.maxHeartRate, { v -> if (v == null || v in 100..240) save { x -> x.copy(maxHeartRate = v) } },
                        placeholder = "Not set", supporting = "For the heart-rate zones on match pages. Your highest reading from a hard effort is best; 220 minus your age is a rough guide.",
                    )
                    SprintSpeedField(s.sprintKph, s.distanceUnit ?: "km") { k -> save { x -> x.copy(sprintKph = k) } }
                }
            }
        },
        Group("data", "Your data") {
            LfCard { YourData(plan, storage) { deleting = true } }
        },
        // VER-2: this app's version and the server's.
        Group("about", "About") {
            LfCard {
                ListRow("LawFive for Android", "${BuildConfig.VERSION_NAME} · ${BuildConfig.COMMIT}", leading = { Avatar(icon = Ph.Info) }, divider = false)
                ListRow(
                    "Server", session.server.substringAfter("://").trimEnd('/') + " · " +
                        (meta?.let { m -> m.version?.let { "LawFive $it" + (m.commit?.takeIf { c -> c != "unknown" }?.let { c -> " · $c" } ?: "") } ?: "version unknown" } ?: "its version shows when there's signal"),
                    leading = { Avatar(icon = Ph.Globe) },
                )
                HelpRow()
                // SITE-5: the hosted service's; a self-hosted server has its own, or none.
                if (session.server.endsWith("lawfive.app")) {
                    ListRow("Privacy and terms", "What the hosted service keeps, and the terms for using it", leading = { Avatar(icon = Ph.Report) }, onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, "https://lawfive.app/privacy.html".toUri())) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                }
                ListRow("Data and licenses", "Where the weather, maps and address search come from, and what LawFive is built with", leading = { Avatar(icon = Ph.Note) }, onClick = { nav.navigate("settings/licenses") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
            }
        },
        // APP-11: apart at the end, as it's this phone's alone.
        Group("apart", "") {
            LfCard(Modifier.padding(top = 24.dp)) {
                ListRow("Erase this phone's LawFive data", "Only this phone: signs out and removes everything LawFive keeps here", leading = { Avatar(icon = Ph.Trash, background = colors.surface2, foreground = colors.red) }, divider = false, onClick = { erasing = true })
            }
        },
    )
    // A link to a group (Get ready's Change for the units) opens the page at it.
    // Again once what's fetched has come in, as it changes the heights of the groups above.
    LaunchedEffect(at, groups.size, devices != null, calendarKnown) {
        val index = groups.indexOfFirst { it.key == at }
        // The page's own head comes before the groups: near it first, then exactly by the group's key.
        if (index >= 0) {
            androidx.compose.runtime.snapshotFlow { list.layoutInfo.totalItemsCount }.first { it > groups.size }
            list.scrollToItem(index)
            list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == at }?.let { list.scrollToItem(it.index) }
        }
    }
    Screen("Settings", back = "More", state = list, refresh = refresh) {
        if (s == null) item { app.lawfive.ui.components.LoadingPitch() }
        for (g in groups) {
            item(key = g.key) {
                Column {
                    if (g.title.isNotEmpty()) SectionTitle(g.title)
                    g.content()
                }
            }
        }
    }
    when (editing) {
        "name" -> NameDialog(session.name ?: "") { editing = null }
        "email" -> EmailDialog(session.pendingEmail ?: session.email ?: "") { editing = null }
        "password" -> PasswordDialog { editing = null }
    }
    if (deleting) DeleteAccountDialog(session.email ?: "", session.server.removePrefix("https://")) { deleting = false }
    signingOutOthers?.let { which ->
        val all = which == "all"
        Confirm(
            if (all) "Unlink everything else?" else "Sign out your other browsers?",
            if (all) "Watches stop syncing and other phones sign out until you link them again." else "Watches and phones stay linked.",
            if (all) "Unlink everything" else "Sign out",
            onConfirm = {
                signingOutOthers = null
                scope.launch {
                    runCatching { graph.api.call("POST", "/v1/devices/sign-out-others", JsonObject(mapOf("scope" to JsonPrimitive(which)))) }
                    devices = runCatching { graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject } }.getOrDefault(devices)
                }
            },
            onDismiss = { signingOutOthers = null },
        )
    }
    unlinking?.let { d ->
        val browser = d.str("kind") == "browser"
        val name = d.str("name") ?: ""
        Confirm(
            if (browser) "Sign out $name?" else "Unlink $name?",
            if (d.str("kind") in Devices.watchKinds) "It stops syncing until you link it again." else "It's signed out until you sign in on it again.",
            if (browser) "Sign out" else "Unlink",
            onConfirm = {
                unlinking = null
                scope.launch {
                    runCatching { graph.api.call("DELETE", "/v1/devices/${d.str("id")}") }
                    devices = runCatching { graph.api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject } }.getOrDefault(devices)
                }
            },
            onDismiss = { unlinking = null },
        )
    }
    if (erasing) {
        val waiting = relay.outbox.size
        Confirm(
            "Erase LawFive on this phone?",
            "Signs out, and removes the account's copy, changes not sent yet, reminders and settings from this phone" +
                (if (waiting > 0) ", and $waiting ${if (waiting == 1) "thing" else "things"} the watch left here to upload" else "") +
                ". Your account and what's on the server stay. LawFive then closes.",
            "Erase",
            onConfirm = {
                erasing = false
                scope.launch {
                    graph.signOut()
                    context.getSystemService(ActivityManager::class.java).clearApplicationUserData()
                }
            },
            onDismiss = { erasing = false },
        )
    }
}

/** WEB-33: how many phones and browsers show before Show all. */
private const val LATEST_SESSIONS = 5

/**
 * A device the account is signed in on (GET /v1/devices): what it is, when it was last active, and its app's version;
 * any but this phone with Unlink (Sign out for a browser), as on the website (SEC-7).
 */
@Composable
private fun DeviceRow(d: JsonObject, divider: Boolean, onUnlink: () -> Unit) {
    val kind = d.str("kind")
    val sub = listOfNotNull(
        if (d["current"]?.toString() == "true") "This phone" else null,
        d.str("lastActiveAt")?.let { instantOf(it) }?.let { "active ${timeAgo(it)}" },
        d.str("firmware")?.let { if (kind == "android") "Android $it" else if (kind == "ios") "iOS $it" else "firmware $it" },
        // VER-3: the LawFive app's version on it.
        d.str("appVersion")?.let { "LawFive $it" },
        // SEC-13: a watch's link, which only syncs matches.
        if (d["watchOnly"]?.toString() == "true") "syncs matches only" else null,
    ).joinToString(" · ")
    ListRow(d.str("name") ?: "", sub, leading = { Avatar(icon = if (kind == "browser") Ph.Globe else if (kind == "android" || kind == "ios") Ph.Phone else Ph.Watch) }, divider = divider, trailing = {
        if (d["current"]?.toString() != "true") SecondaryButton(if (kind == "browser") "Sign out" else "Unlink", onUnlink)
    })
}

/** SET-17: a format to choose from: as last saved, a starter, or a template's. */
private data class UsualOption(val id: String, val label: String, val format: app.lawfive.schema.MatchFormat, val templateId: String? = null, val starterId: String? = null)

/** SET-17: the usual format, as the website's: As last saved (while it's none of the others), the starter formats, then the templates. */
@Composable
private fun UsualFormatChoice(usual: UsualFormat?, templates: List<app.lawfive.schema.MatchTemplate>, onChange: (UsualFormat) -> Unit) {
    val choice = app.lawfive.data.usualFormatChoice(usual, templates)
    val options = listOfNotNull(if (choice.id == "last") UsualOption("last", choice.name, usual!!.format) else null) +
        app.lawfive.data.starterFormats.map { UsualOption("starter:${it.id}", it.name, it.format, starterId = it.id) }
    val own = templates.sortedBy { it.name.lowercase() }
    val shown = if (choice.id == "unset") "Choose a format…" else choice.name
    fun pick(o: UsualOption) {
        if (o.id != choice.id && o.id != "last") onChange(UsualFormat(format = o.format, templateId = o.templateId, starterId = o.starterId, changedAt = now()))
    }
    Choice("Usual format", UsualOption(choice.id, shown, usual?.format ?: app.lawfive.data.schemaDefaultFormat), options, { it?.label ?: shown }, { o -> if (o != null) pick(o) },
        // The templates under their own label, as the website marks each "Your template".
        extra = if (own.isEmpty()) null else { close ->
            Text("YOUR TEMPLATES", style = MaterialTheme.typography.titleSmall, color = colors.muted, modifier = Modifier.padding(start = 12.dp, top = 10.dp, bottom = 4.dp))
            for (t in own) androidx.compose.material3.DropdownMenuItem({ Text(t.name) }, { close(); pick(UsualOption("template:${t.id}", t.name, t.format, templateId = t.id)) })
        })
}

/** Your data: a copy of everything (the zip the website gives, which any LawFive server can restore), importing matches, and what the plan allows. */
@Composable
private fun YourData(plan: AccountPlan?, storage: String?, onDelete: () -> Unit) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val saveAs = rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.CreateDocument("application/zip")) { uri ->
        if (uri != null) {
            saving = true
            saved = false
            problem = null
            scope.launch {
                try {
                    val out = context.contentResolver.openOutputStream(uri) ?: throw java.io.IOException("No file")
                    out.use { graph.api.download("/v1/export", it) }
                    saved = true
                } catch (_: java.io.IOException) {
                    problem = "That didn't finish. Try again with a connection."
                }
                saving = false
            }
        }
    }
    ListRow(
        if (saving) "Getting your copy…" else "Download everything",
        problem ?: if (saved) "Saved. It can be restored on any LawFive server." else "Everything in your account as one zip: a backup, or for moving to another server",
        leading = { Avatar(icon = if (saved) Ph.Check else Ph.Download) }, divider = false, onClick = { if (!saving) saveAs.launch("lawfive-export.zip") },
    )
    // On the website, which reads the zip: the phone has no file to give it more than once.
    ListRow("Restore from an export", "On the website: adds what an export has that this account doesn't", leading = { Avatar(icon = Ph.Upload) },
        onClick = { openWebsite(context, graph.session.current.server, "/settings#data") }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
    ListRow("Import matches", "From a spreadsheet or JSON file", leading = { Avatar(icon = Ph.Matches) }, onClick = { nav.navigate("import") }, trailing = { PhIcon(Ph.Next, tint = colors.muted) })
    if (plan != null) PlanRows(plan)
    else storage?.let { ListRow("Photos and tracks", it, leading = { Avatar(icon = Ph.Photos) }) }
    // APP-21.
    ListRow("Delete your account", "Your matches, venues, referees, tracks and everything else, for good.", leading = { Avatar(icon = Ph.Trash, background = colors.surface2, foreground = colors.red) }, onClick = onDelete)
}

/** USR-10: your name, with the same rule as signing up. */
@Composable
private fun NameDialog(current: String, close: () -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(current) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val trimmed = name.trim()
    AccountDialog("Change your name", null, busy, close) {
        Field("Name", name, { name = it.take(100); problem = null }, supporting = "Your phones and watches show it the next time they sync.")
        problem?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
        DialogButtons(if (busy) "Saving…" else "Change name", enabled = trimmed.isNotEmpty() && trimmed != current && !busy, close = close) {
            busy = true
            scope.launch {
                try {
                    graph.changeName(trimmed)
                    close()
                } catch (e: ApiException) {
                    problem = if (e.status == 400) "A name is 1 to 100 characters." else e.message
                } catch (_: java.io.IOException) {
                    problem = "Couldn't reach the server. Try again with a connection."
                }
                busy = false
            }
        }
    }
}

/** USR-7, USR-9: a new email, with the password; on a server that can email, it waits for the link sent to it. */
@Composable
private fun EmailDialog(current: String, close: () -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf(current) }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    val canEmail by androidx.compose.runtime.produceState(false) { value = graph.meta()?.capabilities?.contains("email") == true }
    AccountDialog("Change your email", null, busy, close) {
        Field("New email", email, { email = it; problem = null }, keyboard = KeyboardType.Email,
            supporting = if (canEmail) "We'll email it a link. Your email changes when you open it, within 24 hours." else "You sign in with it from now on.")
        Field("Your password", password, { password = it; problem = null }, password = true)
        problem?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
        DialogButtons(if (busy) "Saving…" else "Change email", enabled = email.isNotBlank() && password.isNotEmpty() && email.trim() != current && !busy, close = close) {
            busy = true
            scope.launch {
                try {
                    // USR-9: with a link emailed, You shows the change waiting.
                    graph.changeEmail(email, password)
                    close()
                } catch (e: ApiException) {
                    problem = if (e.body?.containsKey("issues") == true) "That email address doesn't look right." else e.message?.replaceFirstChar { it.uppercase() }
                } catch (_: java.io.IOException) {
                    problem = "Couldn't reach the server. Try again with a connection."
                }
                busy = false
            }
        }
    }
}

/** USR-7: a new password, with the current one. */
@Composable
private fun PasswordDialog(close: () -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var again by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    if (done) {
        AccountDialog("Password changed", "Use it next time you sign in. Watches and devices already signed in stay signed in.", false, close) {
            DialogButtons("Done", close = null) { close() }
        }
        return
    }
    val mismatch = again.isNotEmpty() && again != next
    AccountDialog("Change your password", null, busy, close) {
        Field("Current password", current, { current = it; problem = null }, password = true)
        Field("New password", next, { next = it.take(128); problem = null }, password = true, supporting = "At least 8 characters")
        Field("New password again", again, { again = it.take(128) }, password = true, supporting = if (mismatch) "The two don't match." else null)
        problem?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
        DialogButtons(if (busy) "Saving…" else "Change password", enabled = current.isNotEmpty() && next.length >= 8 && again == next && !busy, close = close) {
            busy = true
            scope.launch {
                try {
                    graph.changePassword(current, next)
                    done = true
                } catch (e: ApiException) {
                    problem = if (e.body?.get("code")?.toString()?.contains("INVALID_PASSWORD") == true) "Your current password isn't right." else e.message?.replaceFirstChar { it.uppercase() }
                } catch (_: java.io.IOException) {
                    problem = "Couldn't reach the server. Try again with a connection."
                }
                busy = false
            }
        }
    }
}

/** A dialog for the account (a chalk panel, the title in black italic capitals), closed by a tap beside it unless it's busy. */
@Composable
private fun AccountDialog(title: String, text: String?, busy: Boolean, close: () -> Unit, content: @Composable () -> Unit) {
    app.lawfive.ui.theme.OnPanel {
        androidx.compose.ui.window.Dialog(onDismissRequest = { if (!busy) close() }) {
            Column(
                Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(6.dp))
                    // At night, the panel's edge, as Material's dialogs have it: it parts the dialog from the dimmed page.
                    .then(if (colors.dark) Modifier.border(1.dp, colors.panelEdge, RoundedCornerShape(6.dp)) else Modifier)
                    .verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(title.uppercase(), style = MaterialTheme.typography.headlineSmall, color = colors.text)
                text?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.muted) }
                content()
            }
        }
    }
}

/** Cancel and the dialog's own button, at its foot; the button goes under Cancel where both don't fit. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun DialogButtons(text: String, enabled: Boolean = true, close: (() -> Unit)?, onClick: () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        close?.let { SecondaryButton("Cancel", it) }
        PrimaryButton(text, onClick, enabled = enabled)
    }
}

/** Data and licenses (WX-8), as the website's: where the data comes from (following what this server uses), LawFive's own, and what the app is built with. */
@Composable
fun LicensesScreen() {
    val graph = LocalGraph.current
    val context = LocalContext.current
    var meta by remember { mutableStateOf<ServerMeta?>(null) }
    LaunchedEffect(Unit) { meta = graph.meta() }
    data class Credit(val name: String, val url: String, val what: String, val licence: Pair<String, String>? = null)
    val mit = "MIT" to "https://opensource.org/license/mit"
    val apache = "Apache 2.0" to "https://www.apache.org/licenses/LICENSE-2.0"
    val odbl = "ODbL" to "https://opendatacommons.org/licenses/odbl/"
    val ofl = "SIL Open Font License 1.1" to "https://openfontlicense.org"
    // Only the words of a provider's credit, which comes as HTML from the server's settings.
    fun words(html: String) = androidx.core.text.HtmlCompat.fromHtml(html, androidx.core.text.HtmlCompat.FROM_HTML_MODE_COMPACT).toString().trim()
    val data = meta?.let { m ->
        listOfNotNull(
            m.weather?.let { Credit("Open-Meteo", "https://open-meteo.com", "Weather forecasts for matches, from national weather services' models", "CC BY 4.0" to "https://creativecommons.org/licenses/by/4.0/") },
            m.maps.style?.let { st -> Credit("Map", if (st.url.contains("openfreemap.org")) "https://openfreemap.org" else st.url.toUri().let { "${it.scheme}://${it.host}" }, words(st.attribution), if (st.url.contains("openfreemap.org")) odbl else null) }
                ?: Credit("Map", "https://www.openstreetmap.org/copyright", words(m.maps.attribution), if (m.maps.tileUrl.contains("openstreetmap.org")) odbl else null),
            m.geocoder?.let { g ->
                val nominatim = g.url.contains("nominatim.openstreetmap.org")
                Credit(if (nominatim) "Nominatim" else (g.url.toUri().host ?: g.url), if (nominatim) "https://nominatim.org" else g.url, "Address search for venues, with data © OpenStreetMap contributors", odbl)
            },
        )
    }
    val software = listOf(
        Credit("Jetpack Compose and AndroidX", "https://developer.android.com/jetpack", "The app's screens, navigation, its database (Room), background sync (WorkManager) and settings", apache),
        Credit("Health Connect", "https://developer.android.com/health-and-fitness/guides/health-connect", "Saving Wear OS matches as workouts", apache),
        Credit("Kotlin and kotlinx", "https://kotlinlang.org", "The language, coroutines and reading JSON", apache),
        Credit("OkHttp", "https://square.github.io/okhttp/", "Talking to the server", apache),
        Credit("Coil", "https://coil-kt.github.io/coil/", "Loading photos", apache),
        Credit("MapLibre Native", "https://maplibre.org", "Drawing maps", "BSD 2-Clause" to "https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md"),
        Credit("Garmin Connect IQ Mobile SDK", "https://developer.garmin.com/connect-iq/", "Syncing a Garmin watch through this phone", "Garmin's license" to "https://developer.garmin.com/connect-iq/sdk/"),
        Credit("Google code scanner and Firebase Cloud Messaging", "https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner", "Scanning a sign-in code, and notifications from the server", "Google's terms" to "https://developers.google.com/terms"),
        Credit("Phosphor Icons", "https://phosphoricons.com", "The icons", mit),
        Credit("Barlow and Barlow Condensed", "https://github.com/jpt/barlow", "The typeface for text and headings", ofl),
        Credit("JetBrains Mono", "https://www.jetbrains.com/lp/mono/", "The typeface for codes and addresses", ofl),
    )
    fun open(url: String) = context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
    @Composable
    fun Credits(credits: List<Credit>) {
        LfCard {
            credits.forEachIndexed { i, c ->
                ListRow(c.name, c.what, divider = i > 0, onClick = { open(c.url) }, trailing = {
                    c.licence?.let { (name, url) -> app.lawfive.ui.components.Chip(name, modifier = Modifier.clickable(onClickLabel = "The license") { open(url) }) }
                })
            }
        }
    }
    Screen("Data and licenses", sub = "Where LawFive's data comes from, and what it's built with.", back = "Settings") {
        item { SectionTitle("Data") }
        item { if (data == null) Text("Shown when there's signal.", style = MaterialTheme.typography.bodyMedium, color = colors.muted) else Credits(data) }
        item { SectionTitle("LawFive") }
        item {
            LfCard {
                ListRow("Open source", "LawFive is open source, and you can run your own server. The code and its license are at lawfive.dev.", divider = false, onClick = { open("https://lawfive.dev") }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
            }
        }
        item { SectionTitle("Built with") }
        item { Credits(software) }
    }
}

/**
 * PLAN-6: the plan, when it ends, and how much of each limit is used, two to a row as on the
 * website's phone width; only what a referee uses on the phone (photos and tracks, watches and
 * phones), as API keys and webhooks are the website's.
 */
@Composable
private fun PlanRows(plan: AccountPlan) {
    ListRow("Plan: ${plan.plan.name}", planEnd(plan)?.let { "${it.replaceFirstChar { c -> c.uppercase() }}. Nothing in your account is lost then; only adding more over its limits stops." } ?: "What your account can use on this server. Ask an admin of this server to change it.", leading = { Avatar(icon = Ph.Plan) })
    val lines = planLines(plan).filter { !it.label.contains("API", ignoreCase = true) && !it.label.contains("webhook", ignoreCase = true) }
    if (lines.isNotEmpty()) {
        HorizontalDivider(color = colors.border)
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            lines.chunked(2).forEach { pair ->
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    pair.forEach { PlanFigure(it, Modifier.weight(1f)) }
                    if (pair.size == 1) Box(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun PlanFigure(line: PlanLine, modifier: Modifier) {
    Column(modifier) {
        Text(line.label, style = MaterialTheme.typography.labelMedium, color = colors.muted)
        Row(verticalAlignment = Alignment.Bottom) {
            if (line.of == "at most") Text("at most ", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(bottom = 2.dp))
            Text(line.figure, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 20.sp, lineHeight = 24.sp))
            if (line.of != null && line.of != "at most") Text(" ${line.of}", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.padding(bottom = 2.dp))
        }
        line.share?.let { share ->
            Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(5.dp).clip(CircleShape).background(colors.border)) {
                Box(Modifier.fillMaxWidth(share.toFloat()).height(5.dp).clip(CircleShape).background(if (share >= 1) colors.red else if (share >= 0.8) colors.yellow else colors.brand))
            }
        }
    }
}

/** SEC-6: "120 MB of 2.0 GB". */
private fun storageLine(storage: JsonObject): String {
    val sizes = app.lawfive.data.AccountStorage.from(storage)
    val used = app.lawfive.data.storageSize(sizes?.usedBytes ?: 0)
    return sizes?.limitBytes?.let { "$used of ${app.lawfive.data.storageSize(it)}" } ?: used
}

/**
 * Sprint speed (TRK-11), in the unit the user reads speeds in, as on the web; kept in km/h whichever.
 * Empty goes back to the default.
 */
@Composable
private fun SprintSpeedField(kph: Double?, unit: String, onChange: (Double?) -> Unit) {
    val perKph = if (unit == "mi") 1 / 1.609344 else 1.0
    val label = if (unit == "mi") "mph" else "km/h"
    fun shown(value: Double): String {
        val rounded = Math.round(value * perKph * 10) / 10.0
        return if (rounded % 1.0 == 0.0) "${rounded.toLong()}" else "$rounded"
    }
    var text by remember(kph, unit) { mutableStateOf(kph?.let(::shown) ?: "") }
    val typed = text.replace(",", ".").toDoubleOrNull()
    val asKph = typed?.let { Math.round(it / perKph * 10) / 10.0 }
    val valid = text.isBlank() || (asKph != null && asKph in 15.0..35.0)
    Field(
        "Sprint speed ($label)", text,
        { t ->
            text = t.filter { it.isDigit() || it == '.' || it == ',' }.take(5)
            val number = text.replace(",", ".").toDoubleOrNull()?.let { Math.round(it / perKph * 10) / 10.0 }
            if (text.isBlank()) onChange(null) else if (number != null && number in 15.0..35.0) onChange(number)
        },
        placeholder = shown(21.0), keyboard = KeyboardType.Decimal,
        supporting = if (valid) "Where sprinting starts in your match figures" + (if (text.isBlank()) "; ${shown(21.0)} $label unless you set it" else "") else "Between ${shown(15.0)} and ${shown(35.0)} $label",
    )
}

/** One thing the account's deletion takes with it (APP-21). */
@Composable
private fun DeleteLine(icon: Ph, text: String) {
    androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        PhIcon(icon, size = 18.dp, tint = colors.muted)
        androidx.compose.foundation.layout.Spacer(Modifier.width(10.dp))
        Text(text, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.text)
    }
}

/**
 * APP-21: says exactly what goes, offers a copy first, and asks for the password, as the web does
 * (USR-7). Nothing can be deleted while the copy is still coming.
 */
@Composable
private fun DeleteAccountDialog(email: String, server: String, close: () -> Unit) {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var saveProblem by remember { mutableStateOf<String?>(null) }
    val saveAs = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.CreateDocument("application/zip"),
    ) { uri ->
        if (uri != null) {
            saving = true
            saved = false
            saveProblem = null
            scope.launch {
                try {
                    val out = context.contentResolver.openOutputStream(uri) ?: throw java.io.IOException("No file")
                    out.use { graph.api.download("/v1/export", it) }
                    saved = true
                } catch (_: java.io.IOException) {
                    saveProblem = "That didn't finish. Try again with a connection."
                }
                saving = false
            }
        }
    }
    app.lawfive.ui.theme.OnPanel { androidx.compose.ui.window.Dialog(onDismissRequest = { if (!busy && !saving) close() }) {
        androidx.compose.foundation.layout.Column(
            Modifier.fillMaxWidth().background(colors.surface, androidx.compose.foundation.shape.RoundedCornerShape(6.dp))
                .then(if (colors.dark) Modifier.border(1.dp, colors.panelEdge, androidx.compose.foundation.shape.RoundedCornerShape(6.dp)) else Modifier)
                .verticalScroll(androidx.compose.foundation.rememberScrollState()).padding(20.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
        ) {
            androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp)) {
                Text("DELETE YOUR ACCOUNT?", style = androidx.compose.material3.MaterialTheme.typography.headlineSmall, color = colors.text)
                Text("$email on $server. This can't be undone.", style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.muted)
            }
            androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                DeleteLine(Ph.Matches, "Matches, match reports and tracks")
                DeleteLine(Ph.Photos, "Photos, venues and referees")
                DeleteLine(Ph.Competitions, "Competitions, templates and settings")
                DeleteLine(Ph.Watch, "Phones and watches get signed out")
            }
            androidx.compose.foundation.layout.Column(
                Modifier.fillMaxWidth().background(colors.surface2, androidx.compose.foundation.shape.RoundedCornerShape(10.dp)).padding(12.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp),
            ) {
                androidx.compose.foundation.layout.Column {
                    Text("Keep a copy first", style = androidx.compose.material3.MaterialTheme.typography.titleSmall, color = colors.text)
                    Text(
                        saveProblem ?: if (saved) "Saved. It can be restored on any LawFive server." else "One zip of everything, which can be restored on any LawFive server.",
                        style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                        color = if (saveProblem != null) colors.redText else colors.muted,
                    )
                }
                SecondaryButton(
                    if (saving) "Getting your copy…" else if (saved) "Download again" else "Download my data",
                    { saveAs.launch("lawfive-export.zip") }, Modifier.fillMaxWidth(), icon = if (saved) Ph.Check else Ph.Download, enabled = !saving && !busy,
                )
            }
            Field("Your password, to confirm", password, { password = it; problem = null }, password = true)
            problem?.let { Text(it, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = colors.redText) }
            androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                PrimaryButton(if (busy) "Deleting…" else "Delete my account", {
                    busy = true
                    problem = null
                    scope.launch {
                        try {
                            graph.deleteAccount(password)
                        } catch (e: app.lawfive.data.ApiException) {
                            // The server's own words, such as being its only admin.
                            problem = e.message?.replaceFirstChar { it.uppercase() }
                        } catch (_: java.io.IOException) {
                            problem = "Couldn't reach the server, so nothing was deleted. Try again with a connection."
                        }
                        busy = false
                    }
                }, Modifier.fillMaxWidth(), icon = Ph.Trash, enabled = password.isNotEmpty() && !busy && !saving, danger = true)
                SecondaryButton("Keep my account", close, Modifier.fillMaxWidth(), enabled = !busy && !saving)
            }
        }
    } }
}

/** ACT-1, WCH-7: a Wear OS match saved to Health Connect as a soccer exercise, once it's synced; on unless switched off. */
@Composable
private fun HealthConnectCard() {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val on by graph.health.on.collectAsStateWithLifecycle()
    var allowed by remember { mutableStateOf<Boolean?>(null) }
    val ask = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        allowed = granted.containsAll(graph.health.permissions - HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE)
        if (allowed == true) scope.launch { runCatching { graph.health.saveNew() } }
    }
    LaunchedEffect(on) { allowed = graph.health.allowed() }
    LfCard {
        ToggleRow("Save Wear OS matches", "As soccer exercises, with the route and heart rate", on, { graph.health.setOn(it); if (it) ask.launch(graph.health.permissions) }, divider = on && allowed == false)
        if (on && allowed == false) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Health Connect hasn't been allowed yet, so nothing is saved.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                SecondaryButton("Allow in Health Connect", { ask.launch(graph.health.permissions) })
            }
        }
    }
}
