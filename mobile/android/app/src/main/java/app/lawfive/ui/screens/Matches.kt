package app.lawfive.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.schema.Competition
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.Referee
import app.lawfive.schema.Venue
import app.lawfive.schema.UserSettings
import app.lawfive.data.Collections
import app.lawfive.schema.MatchWeather
import app.lawfive.ui.components.Refresh
import app.lawfive.ui.components.RiskBadge
import app.lawfive.ui.components.RiskBadges
import app.lawfive.ui.components.Units
import app.lawfive.ui.components.WeatherBrief
import app.lawfive.ui.components.WeatherIcon
import app.lawfive.ui.formatTemperature
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.EmptyPicture
import app.lawfive.ui.components.EmptyState
import app.lawfive.ui.components.NoResults
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.Gap
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SearchField
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.Segmented
import app.lawfive.ui.components.TeamBadge
import app.lawfive.ui.describePlayers
import app.lawfive.ui.directionsUri
import app.lawfive.ui.formatDay
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.instantOf
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.kitVanishes
import app.lawfive.ui.money
import app.lawfive.ui.parseColour
import app.lawfive.ui.roleNames
import app.lawfive.ui.teamName
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.Board
import app.lawfive.ui.components.BoardHead
import app.lawfive.ui.components.ChalkRule
import app.lawfive.ui.components.KitPanels
import app.lawfive.ui.components.KitSize
import app.lawfive.ui.components.Line
import app.lawfive.ui.components.PagePad
import app.lawfive.ui.components.Touchline
import app.lawfive.ui.components.bleed
import app.lawfive.ui.components.dots
import app.lawfive.ui.theme.LfType
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.em
import androidx.compose.foundation.layout.widthIn
import app.lawfive.ui.timeAgo
import app.lawfive.ui.timeParts
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import app.lawfive.ui.roleNamesInFull
import app.lawfive.ui.officialsLine
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.draw.rotate
import app.lawfive.ui.matchTitle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString

// Matches (APP-4, as WEB-2 and WEB-3): the next match, the week's figures, then the list, upcoming
// or past, searchable, each a team-sheet row.

/** Upcoming: scheduled or postponed, kicking off today or later (or not yet given a time). */
fun isUpcoming(m: Match): Boolean {
    val startOfToday = java.time.LocalDate.now(app.lawfive.data.AppClock.clock()).atStartOfDay(ZoneId.systemDefault()).toInstant()
    val kickoff = instantOf(m.kickoff)
    return (m.status == "scheduled" || m.status == "postponed") && (kickoff == null || !kickoff.isBefore(startOfToday))
}

@Composable
fun MatchesScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    // Null until the phone's database first answers: loading, not "no matches".
    val loaded by graph.records.matches.collectAsStateWithLifecycle(null)
    val matches = loaded ?: emptyList()
    val reports by graph.records.matchRecords.collectAsStateWithLifecycle(emptyList())
    val venues by graph.records.venues.collectAsStateWithLifecycle(emptyList())
    val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    var past by rememberSaveable { mutableStateOf(false) }
    // Whether a watch is linked, for the empty list's words, as of the last sync with signal; not known counts as not.
    val onWatch by graph.onWatch.state.collectAsStateWithLifecycle()
    val watchLinked = !onWatch.watches.isNullOrEmpty()
    // WEB-32: Get ready, until it's all done or hidden; it took the place of the watch prompt.
    val getReady = rememberGetReady(if (loaded == null) null else settings, loaded?.size)
    var query by rememberSaveable { mutableStateOf("") }
    // WX-9: the weather beside each match, as on the web; Past fetches the last year's when first shown.
    val weather by graph.weather.byMatch.collectAsStateWithLifecycle()
    LaunchedEffect(past) { graph.weather.refresh(past) }
    // Recent (WEB-26) shows past matches under Upcoming, so their weather is wanted there too.
    LaunchedEffect(Unit) { graph.weather.refresh(past = true) }
    val units = Units(settings?.temperatureUnit ?: "c", settings?.distanceUnit ?: "km")

    val venueById = venues.associateBy { it.id }
    val competitionById = competitions.associateBy { it.id }
    val refereeById = referees.associateBy { it.id }
    val reportFor = reports.filter { it.matchId != null }.associateBy { it.matchId!! }
    // APP-17: the tag chosen as a filter, and the tags to choose from.
    var tag by rememberSaveable { mutableStateOf<String?>(null) }
    val allTags = matches.flatMap { it.tags ?: emptyList() }.distinct().sortedBy { it.lowercase() }
    val found = matches.filter { (tag == null || it.tags?.contains(tag) == true) && matchesSearch(it, query, venueById, competitionById, refereeById) }
    val shown = found.filter { isUpcoming(it) != past }.sortedWith(compareBy<Match> { it.kickoff ?: "9999" }.let { if (past) it.reversed() else it })
    // WEB-26: under the upcoming list, the last few played, then the way into all of them.
    val pastAll = matches.filter { !isUpcoming(it) }.sortedByDescending { it.kickoff ?: "" }
    val recent = if (!past && query.isEmpty() && tag == null) pastAll.take(3) else emptyList()
    val now = app.lawfive.data.AppClock.now()
    val next = matches.filter { it.status == "scheduled" && (instantOf(it.kickoff)?.isAfter(now) == true) }.minByOrNull { it.kickoff!! }
    val weekAhead = now.plus(Duration.ofDays(7))
    val thisWeek = matches.count { isUpcoming(it) && it.status == "scheduled" && instantOf(it.kickoff)?.isBefore(weekAhead) == true }
    val unpaid = matches.filter { it.fee != null && !it.fee!!.paid && it.status != "cancelled" && !isUpcoming(it) }
    val owed = unpaid.sumOf { it.fee!!.amount }
    // STAT-16: the one rule for counting games, as Stats counts them.
    val played = matches.count { app.lawfive.ui.isGame(it) }
    // WEB-27: the next match folded to a strip or open, kept with the account's settings (open when not
    // set). A tap shows it at once and saves it as Settings does, so it waits in the outbox offline; the
    // stored choice takes over again once it's saved, or when another device changes it.
    val scope = rememberCoroutineScope()
    val storedFold = nextMatchFolded(settings)
    var fold by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(storedFold) { fold = null }
    val folded = fold ?: storedFold
    val toggleFold: () -> Unit = {
        fold = !folded
        scope.launch { graph.records.saveSettings { it.copy(nextMatchCollapsed = !folded) } }
    }

    Screen(
        title = "Matches",
        hero = true,
        status = syncLine(short = true),
        add = "Add a match" to { nav.navigate("match/new") },
        refresh = syncRefresh(),
    ) {
        if (next != null && query.isEmpty() && tag == null) {
            item(key = "next") { NextMatch(next, venueById[next.venueId], competitionById[next.competitionId]?.name, weather[next.id], units, refereeById, folded, toggleFold) }
        }
        val front = query.isEmpty() && tag == null
        if (front && matches.isNotEmpty()) {
            // WEB-2, WEB-24: the figures as the board's second line, large chalk figures between chalk
            // rules, then the halfway line before the list.
            item(key = "facts") {
                Column(Modifier.padding(top = if (next != null) 30.dp else 0.dp)) {
                    app.lawfive.ui.components.ChalkFigures(listOf(
                        "$thisWeek" to "next 7 days",
                        money(owed, unpaid.firstOrNull()?.fee?.currency ?: settings?.currency ?: "USD") to (if (unpaid.isEmpty()) "fees owed" else "owed · ${unpaid.size}"),
                        "$played" to "played",
                    ))
                }
            }
        }
        // WEB-32: Get ready, under the figures, before the halfway line.
        if (front && getReady.show) {
            item(key = "ready") { Box(Modifier.padding(top = if (matches.isNotEmpty()) 30.dp else 0.dp)) { GetReadyList(getReady) } }
        }
        // With no matches, the empty list's center circle is the halfway line.
        if (front && matches.isNotEmpty()) {
            item(key = "halfway") { app.lawfive.ui.components.Halfway(Modifier.padding(top = if (getReady.show) 4.dp else 30.dp, bottom = 30.dp)) }
        }
        // Did you know waits while Get ready shows, and until it's known whether it will.
        if (loaded != null && front && getReady.settled && !getReady.show) {
            item(key = "tip") { DidYouKnow(played) }
        }
        // Search and the tabs once there's something to search; a key, so the search box stays the same
        // field as the rows above it go (APP-17).
        if (loaded == null || matches.isNotEmpty()) item(key = "search") {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 4.dp)) {
                Segmented(listOf(false to "Upcoming", true to "Past"), past, { past = it })
                SearchField(query, { query = it }, "Teams, venues, officials, tags", allTags, tag, { tag = it })
            }
        }
        // A heading on the grass names the list, with how many in small capitals (WEB-24).
        if (shown.isNotEmpty()) {
            item(key = "head") { ListHead(if (past) "Past" else "Upcoming", "${shown.size} ${if (shown.size == 1) "match" else "matches"}") }
        }
        item(key = "state") {
            // WEB-17, WEB-24: what's empty sits on the grass, not in a card.
            Column {
                if (loaded == null) {
                    app.lawfive.ui.components.LoadingPitch()
                } else if (shown.isEmpty()) {
                    val elsewhere = found.size - shown.size
                    val other: @Composable () -> Unit = {
                        // Recent's own button leads to the past matches, when it's there.
                        if (elsewhere > 0 && recent.isEmpty()) SecondaryButton("$elsewhere in ${if (past) "upcoming" else "past"} matches", { past = !past })
                    }
                    if (query.isNotEmpty() || tag != null) {
                        NoResults("No ${if (past) "past" else "upcoming"} matches match \"${if (query.isNotEmpty()) query else tag}\"", other)
                    } else {
                        // WEB-17: as the web's. It promises the watch only once one is linked, and offers to link one until then.
                        val upcomingText = if (watchLinked) "Add a game once and it's on your watch and phone, ready for kickoff." else "Add a game once and it's ready for kickoff. Link your watch to have it there too."
                        EmptyState(EmptyPicture.Center, if (past) "No past matches yet" else "Nothing coming up", if (past) "Games you've finished, with the score, the cards and how far you ran." else upcomingText) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                // WEB-32: none of its own while Get ready above offers the same (Add a match, Import, Link your watch), so a new account sees each once.
                                if (!getReady.show) {
                                    if (!past) PrimaryButton("Add a match", { nav.navigate("match/new") }, icon = Ph.Plus)
                                    SecondaryButton("Import matches", { nav.navigate("import") }, icon = Ph.Upload)
                                    if (!past && !watchLinked) SecondaryButton("Link your watch", { nav.navigate("link") }, icon = Ph.Watch)
                                }
                                other()
                            }
                        }
                    }
                }
            }
        }
        items(shown, key = { it.id }) { m ->
            MatchRow(m, reportFor[m.id], venueById[m.venueId]?.name, competitionById[m.competitionId]?.name, weather[m.id], units, refereeById) { nav.navigate("match/${m.id}") }
        }
        if (recent.isNotEmpty()) {
            item(key = "recent-head") {
                ListHead("Recent", if (recent.size < pastAll.size) "The last ${recent.size} of ${pastAll.size}" else "${recent.size} ${if (recent.size == 1) "match" else "matches"}")
            }
            items(recent, key = { "recent-" + it.id }) { m ->
                MatchRow(m, reportFor[m.id], venueById[m.venueId]?.name, competitionById[m.competitionId]?.name, weather[m.id], units, refereeById) { nav.navigate("match/${m.id}") }
            }
            item(key = "recent-all") {
                Box(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 8.dp), contentAlignment = Alignment.Center) {
                    BigOutline(if (pastAll.size == 1) "The past match" else "All ${pastAll.size} past matches", Ph.Next, trailing = true, hug = true) { past = true }
                }
            }
        }
    }
}

/** A list's heading on the grass, with how many (or which) in small capitals beside it (WEB-24). */
@Composable
private fun ListHead(title: String, count: String) {
    Row(Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 14.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(title.uppercase(), style = LfType.display(44.sp, colors.text, 40.sp))
        Text(count.uppercase(), style = LfType.label(13.sp, colors.muted, 0.1f), modifier = Modifier.padding(bottom = 5.dp))
    }
}

private fun matchesSearch(m: Match, query: String, venues: Map<String, Venue>, competitions: Map<String, Competition>, referees: Map<String, Referee>): Boolean {
    if (query.isBlank()) return true
    val haystack = listOfNotNull(
        m.name, m.home.name, m.home.alias, m.away.name, m.away.alias, m.ageGroup, m.notes, m.external?.id, m.assignor,
        venues[m.venueId]?.name, competitions[m.competitionId]?.name, *(m.tags ?: emptyList()).toTypedArray(),
        *m.crew.mapNotNull { c -> c.refereeId?.let { referees[it]?.name } ?: c.name }.toTypedArray(),
    ).joinToString(" ").lowercase()
    return query.lowercase().split(" ").filter { it.isNotBlank() }.all { it in haystack }
}

/**
 * Pulling a tab's first page, or a match's, down syncs (APP-3). The indicator shows for that sync
 * only, long enough to see; syncs the app starts itself show in the status line ("Syncing…"). A sync
 * that worked gets a confirm tap and a check by the status for a moment (the match page has no
 * status, so just the tap). `also` runs after the sync, for a page with more of its own to fetch (Settings).
 */
@Composable
fun syncRefresh(also: suspend () -> Unit = {}): Refresh {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var pulled by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    LaunchedEffect(done) {
        if (done) {
            delay(2_000)
            done = false
        }
    }
    return Refresh(pulled, done) {
        pulled = true
        done = false
        scope.launch {
            val started = System.currentTimeMillis()
            try {
                graph.syncNow()
                also()
                delay(600 - (System.currentTimeMillis() - started))
                if (graph.sync.status.value.problem == null) {
                    done = true
                    haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                }
            } finally {
                pulled = false
            }
        }
    }
}

/**
 * "Synced 2 min ago", "Syncing…", "3 changes waiting · 2 from the watch waiting · no connection".
 * `short` is for the top right of a tab's first page: "Synced 2 min ago" or "Syncing…", and a second
 * line only when something waits or went wrong ("3 waiting · Offline").
 */
@Composable
fun syncLine(short: Boolean = false): String {
    val graph = LocalGraph.current
    val session by graph.session.state.collectAsStateWithLifecycle()
    val status by graph.sync.status.collectAsStateWithLifecycle()
    val waiting by graph.db.outbox().count().collectAsStateWithLifecycle(0)
    val relay by graph.watch.relay.state.collectAsStateWithLifecycle()
    var tick by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            tick++
        }
    }
    @Suppress("UNUSED_EXPRESSION") tick
    val problem = status.problem.takeIf { !status.running }
    if (short) {
        val ago = when {
            status.running -> "Syncing…"
            session.lastSync > 0 -> "Synced ${timeAgo(Instant.ofEpochMilli(session.lastSync))}"
            else -> "Not synced yet"
        }
        val more = listOfNotNull(
            (waiting + relay.outbox.size).takeIf { it > 0 }?.let { "$it waiting" },
            problem?.let { if (it.startsWith("No connection")) "Offline" else "Failed" },
        )
        return if (more.isEmpty()) ago else ago + "\n" + more.joinToString(" · ")
    }
    val parts = mutableListOf<String>()
    parts += when {
        status.running -> "Syncing…"
        session.lastSync > 0 -> "Synced ${timeAgo(Instant.ofEpochMilli(session.lastSync))}"
        else -> "Not synced yet"
    }
    if (waiting > 0) parts += "$waiting ${if (waiting == 1) "change" else "changes"} waiting"
    // APP-7: what the watch sent without signal.
    if (relay.outbox.isNotEmpty()) parts += "${relay.outbox.size} from the watch waiting"
    if (problem != null) parts += problem.replaceFirstChar { it.lowercase() }
    return parts.joinToString(" · ")
}

/** The day over the date in capitals ("TUE" over "NOV 10"), or "TODAY" alone, as on the boards. */
private fun dayOverDate(t: java.time.ZonedDateTime): List<String> =
    if (formatDay(t) == "Today") listOf("TODAY")
    else listOf(
        t.format(java.time.format.DateTimeFormatter.ofPattern("EEE", java.util.Locale.getDefault())).uppercase(),
        t.format(java.time.format.DateTimeFormatter.ofPattern(if (t.year == java.time.LocalDate.now(app.lawfive.data.AppClock.clock()).year) "MMM d" else "MMM d yyyy", java.util.Locale.getDefault())).uppercase(),
    )

/**
 * The next match (WEB-2, WEB-24): a board in the penalty area (its chalk lines running to the left
 * touchline): Next match in mint and the competition, the day beside the kickoff time large on the lit
 * dots, the two kits with HOME and AWAY; the venue and officials under it on the grass. Then the
 * countdown as a stadium clock on a board of its own, the forecast and your fee as figures between
 * chalk rules, the risk badges, and Directions and Open the match as large chalk outlines. A caret at the
 * board's right folds it all to one strip of the board, and opens it again (WEB-27).
 */
@Composable
private fun NextMatch(m: Match, venue: Venue?, competition: String?, weather: MatchWeather?, units: Units, referees: Map<String, Referee>, folded: Boolean, onFold: () -> Unit) {
    val mapsApp = app.lawfive.ui.rememberMapsApp()
    val nav = LocalNav.current
    val context = LocalContext.current
    val kickoff = kickoffAt(m) ?: return
    var now by remember { mutableStateOf(app.lawfive.data.AppClock.now()) }
    LaunchedEffect(m.kickoff) {
        while (true) {
            now = app.lawfive.data.AppClock.now()
            delay(20_000)
        }
    }
    val left = Duration.between(now, kickoff.toInstant()).coerceAtLeast(Duration.ZERO)
    val (time, ampm) = timeParts(kickoff, context)
    val pitch = venue?.pitches?.firstOrNull { it.id == m.pitchId }
    val position = pitch?.position ?: venue?.position
    val c = colors
    val open = { nav.navigate("match/${m.id}") }
    val toLine = Modifier.bleed(PagePad - Touchline - Line)
    val label = if (formatDay(kickoff) == "Today") "Today" else "Next match"
    // WEB-27: folding and opening crossfade while the list eases to the new height. Compose scales its
    // animations by the system's animator duration, so with Remove animations on it simply changes.
    AnimatedContent(
        folded, label = "next match",
        transitionSpec = { fadeIn(tween(220, delayMillis = 90)) togetherWith fadeOut(tween(90)) using SizeTransform(clip = false) },
    ) { strip ->
        if (strip) NextStrip(m, kickoff, label, left, time, ampm, open, onFold) else Column {
            // The penalty area: open to the touchlines on a phone, its lines above and below.
            ChalkRule(toLine)
            Column(Modifier.padding(top = 22.dp, bottom = 20.dp)) {
                Box {
                    Board(Modifier.clickable(onClickLabel = "Open the match", onClick = open)) {
                        // Room at the right of the head for the caret (WEB-27).
                        BoardHead(label, listOfNotNull(m.name ?: competition, describePlayers(m).ifEmpty { null }).joinToString(" · "), Modifier.padding(end = 30.dp))
                        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().dots(c.boardDots)) {
                            // The time takes what the board has beside the day, so "12:30 PM" fits at every width.
                            val fit = with(androidx.compose.ui.platform.LocalDensity.current) { ((maxWidth - 104.dp) / 2.6f).toSp() }
                            val size = if (fit < 92.sp) fit else 92.sp
                            Row(Modifier.padding(start = 14.dp, end = 14.dp, top = 6.dp, bottom = 12.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(Modifier.padding(bottom = size.value.dp * 0.12f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    for (line in dayOverDate(kickoff)) Text(line, style = LfType.display(24.sp, c.onBoard, 21.sp), maxLines = 1, softWrap = false)
                                }
                                Row(verticalAlignment = Alignment.Bottom) {
                                    Text(time, style = LfType.display(size, c.onBoardStrong, size * 0.84f), maxLines = 1, softWrap = false)
                                    if (ampm != null) Text(ampm, style = LfType.display(size * 0.28f, c.onBoardStrong), modifier = Modifier.padding(start = 4.dp, bottom = size.value.dp * 0.08f), maxLines = 1)
                                }
                            }
                        }
                        KitPanels(m.home, m.away, size = KitSize.Large, labels = true)
                    }
                FoldCaret(folded = false, onFold, Modifier.align(Alignment.TopEnd))
                }
                Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (venue != null) {
                        NextFact(Ph.Venues, "Venue") {
                            Text(
                                buildAnnotatedString {
                                    withStyle(SpanStyle(fontWeight = FontWeight.Bold, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)) { append(venue.name) }
                                    pitch?.name?.let { withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append(" · $it") } }
                                },
                                style = MaterialTheme.typography.bodyLarge, color = c.text,
                            )
                            venue.address?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = c.muted) }
                        }
                    }
                    if (officialsLine(m) { id -> id?.let { referees[it] } }.isNotEmpty()) {
                        NextFact(Ph.Referees, "Officials") { OfficialsLine(m, referees, 16, strong = true) }
                    }
                }
            }
            ChalkRule(toLine)
            Gap(28)
            // The countdown as a stadium clock: each unit a lit cell on the dots, mint colons between them.
            Countdown(left)
            if (weather != null || m.fee != null) {
                Row(Modifier.fillMaxWidth().padding(top = 18.dp).height(IntrinsicSize.Min)) {
                    weather?.let { w ->
                        Column(Modifier.weight(1f).drawBehind { drawLine(c.chalkLine, androidx.compose.ui.geometry.Offset(0f, 1.5.dp.toPx()), androidx.compose.ui.geometry.Offset(size.width, 1.5.dp.toPx()), 3.dp.toPx()) }.padding(top = 14.dp, end = 12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                WeatherIcon(w.condition, w.isDay, size = 28.dp)
                                Text(formatTemperature(w.temperatureC, units.temperature), style = LfType.display(36.sp, c.text, 36.sp))
                            }
                            Text(app.lawfive.ui.components.conditionName(w.condition, w.isDay), style = MaterialTheme.typography.bodyMedium, color = c.muted)
                        }
                    }
                    if (weather != null && m.fee != null) Box(Modifier.width(Line).fillMaxHeight().background(c.chalkLine))
                    m.fee?.let { fee ->
                        Column(Modifier.weight(1f).drawBehind { drawLine(c.chalkLine, androidx.compose.ui.geometry.Offset(0f, 1.5.dp.toPx()), androidx.compose.ui.geometry.Offset(size.width, 1.5.dp.toPx()), 3.dp.toPx()) }.padding(top = 14.dp, start = if (weather != null) 16.dp else 0.dp)) {
                            Text(money(fee.amount, fee.currency), style = LfType.display(36.sp, c.text, 36.sp), maxLines = 1)
                            Text("Your fee", style = MaterialTheme.typography.bodyMedium, color = c.muted)
                        }
                    }
                }
            }
            weather?.takeIf { !it.final }?.let { RiskBadges(it, units, Modifier.padding(top = 16.dp)) }
            Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (position != null) {
                    BigOutline("Directions", Ph.Directions) { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(directionsUri(position.lat, position.lon, mapsApp)))) }
                }
                BigOutline("Open the match", Ph.Next, trailing = true, modifier = Modifier.fillMaxWidth(), onClick = open)
            }
        }
    }
}

/**
 * WEB-27: the next match folded to one strip of the board, as the website's on a phone: Next match (or
 * Today) in mint across from the countdown, then the day over the date beside the kickoff time across
 * from the teams' badges; the whole strip opens the match, and the caret at its right opens the board.
 */
@Composable
private fun NextStrip(m: Match, kickoff: java.time.ZonedDateTime, label: String, left: Duration, time: String, ampm: String?, open: () -> Unit, onFold: () -> Unit) {
    val c = colors
    val day = dayOverDate(kickoff)
    val spoken = "$label, ${matchTitle(m)}, ${formatDay(kickoff)} at $time${ampm?.let { " $it" } ?: ""}. ${kickoffSpoken(left)}"
    Board {
        androidx.compose.foundation.layout.BoxWithConstraints {
        // A strip under 340 dp (a 320 dp phone) steps down a size, as the website's does, so "12:30 PM" and both badges fit.
        val narrow = maxWidth < 340.dp
        val count = if (narrow) 19.sp else 22.sp
        val clock = if (narrow) 24.sp else 30.sp
        val gap = if (narrow) 8.dp else 12.dp
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                Modifier.weight(1f).clickable(onClickLabel = "Open the match", onClick = open)
                    .semantics(mergeDescendants = true) { contentDescription = spoken }
                    .padding(start = if (narrow) 14.dp else 16.dp, top = 14.dp, bottom = 14.dp, end = 4.dp),
                verticalArrangement = Arrangement.spacedBy(if (narrow) 10.dp else 12.dp),
            ) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap)) {
                    Text(label.uppercase(), style = LfType.label(11.sp, c.boardAccent), maxLines = 1, modifier = Modifier.weight(1f))
                    val parts = stripCountdown(left)
                    if (parts.isEmpty()) Text("KICKOFF", style = LfType.display(count, c.onBoardStrong, count), maxLines = 1)
                    else Row(horizontalArrangement = Arrangement.spacedBy(if (narrow) 4.dp else 6.dp), verticalAlignment = Alignment.Bottom) {
                        for ((n, unit) in parts) {
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(n, style = LfType.display(count, c.onBoardStrong, count), maxLines = 1, softWrap = false)
                                Text(unit, style = LfType.label(11.sp, c.onBoardMuted, 0f), modifier = Modifier.padding(start = 2.dp, bottom = 1.dp), maxLines = 1)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap)) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(gap)) {
                        // The day over the date, as on the open board; today, the label says so.
                        if (day.size > 1) Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            for (line in day) Text(line, style = LfType.display(if (narrow) 14.sp else 17.sp, c.onBoard, if (narrow) 13.5.sp else 16.sp), maxLines = 1, softWrap = false)
                        }
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(time, style = LfType.display(clock, c.onBoardStrong, clock * 0.93f), maxLines = 1, softWrap = false)
                            if (ampm != null) Text(ampm, style = LfType.display(clock * 0.45f, c.onBoardStrong), modifier = Modifier.padding(start = 2.dp, bottom = 2.dp), maxLines = 1)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(if (narrow) 4.dp else 6.dp)) {
                        TeamBadge(m.home, m.away, true)
                        TeamBadge(m.away, m.home, false)
                    }
                }
            }
            FoldCaret(folded = true, onFold, Modifier.padding(end = 4.dp))
        }
        }
    }
}

/**
 * WEB-27: the caret that folds the next match to a strip (pointing up, at the top right of the open
 * board, in line with its label) and opens it again (pointing down, at the strip's right): a 48 dp
 * button named as the website's, with whether the board is open as its state.
 */
@Composable
private fun FoldCaret(folded: Boolean, onFold: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier.size(48.dp).clip(RoundedCornerShape(6.dp))
            .clickable(role = Role.Button, onClick = onFold)
            .semantics {
                contentDescription = if (folded) "Show the next match" else "Fold the next match to a strip"
                stateDescription = if (folded) "Collapsed" else "Expanded"
            },
        // On the open board the caret sits level with the head's label, above the box's middle.
        contentAlignment = if (folded) Alignment.Center else Alignment.TopCenter,
    ) {
        PhIcon(
            Ph.Chevron, size = 18.dp, tint = colors.onBoardMuted,
            modifier = if (folded) Modifier else Modifier.padding(top = 11.dp).rotate(180f),
        )
    }
}

/** WEB-27: whether the next match is folded to a strip: the account's setting, open when it isn't set. */
fun nextMatchFolded(settings: UserSettings?): Boolean = settings?.nextMatchCollapsed ?: false

/** The countdown to kickoff (WEB-24): days when there are any, hours (after days), then minutes, each with its word and plural. */
fun kickoffUnits(left: Duration): List<Pair<Long, Pair<String, String>>> =
    listOf(left.toDays() to ("day" to "days"), left.toHoursPart().toLong() to ("hr" to "hrs"), left.toMinutesPart().toLong() to ("min" to "min"))
        .dropWhile { it.first == 0L && it.second.first != "min" }

/** The countdown as a screen reader says it: "Kickoff in 1 day 3 hrs 5 min". */
fun kickoffSpoken(left: Duration): String =
    "Kickoff in " + kickoffUnits(left).joinToString(" ") { (n, w) -> "$n ${if (n == 1L) w.first else w.second}" }

/**
 * WEB-27: the folded strip's countdown, as the website's: each figure with its unit's letter ("1" "D",
 * "03" "H", "08" "M"), two figures after the first; nothing once it's kickoff.
 */
fun stripCountdown(left: Duration): List<Pair<String, String>> =
    if (left.toMinutes() <= 0L) emptyList()
    else kickoffUnits(left).mapIndexed { i, (n, w) -> (if (i > 0) "%02d".format(n) else "$n") to w.first.first().uppercase() }

/** A large chalk outline (3 dp), as the next match's Directions and Open the match. A trailing icon
 *  sits at the far end, unless [hug] keeps it beside the words (All past matches, under Recent). */
@Composable
private fun BigOutline(text: String, icon: Ph, modifier: Modifier = Modifier, trailing: Boolean = false, hug: Boolean = false, onClick: () -> Unit) {
    val shape = RoundedCornerShape(6.dp)
    Row(
        modifier.height(48.dp).clip(shape).border(Line, colors.borderInput, shape).clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (!trailing) PhIcon(icon, size = 20.dp, tint = colors.text)
        Text(text.uppercase(), style = LfType.word(18.sp, colors.text), modifier = if (trailing && !hug) Modifier.weight(1f) else Modifier)
        if (trailing) PhIcon(icon, size = 20.dp, tint = colors.text)
    }
}

/** A line under the next match's board: an icon, a small label, then what it says. */
@Composable
private fun NextFact(icon: Ph, label: String, content: @Composable () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        PhIcon(icon, size = 22.dp, tint = colors.text, modifier = Modifier.padding(top = 1.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(label.uppercase(), style = LfType.label(11.5.sp, colors.muted))
            content()
        }
    }
}

/** The stadium clock (WEB-24): days (when there are any), hours and minutes, each a lit cell, two figures after the first. */
@Composable
private fun Countdown(left: Duration) {
    val c = colors
    val units = kickoffUnits(left)
    val minutes = left.toMinutes()
    val spoken = kickoffSpoken(left)
    Board {
        Column(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 12.dp).semantics(mergeDescendants = true) { contentDescription = spoken }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (minutes == 0L) "KICKOFF" else "STARTS IN", style = LfType.label(11.5.sp, c.boardAccent, 0.16f))
            androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
                val fit = with(androidx.compose.ui.platform.LocalDensity.current) { ((maxWidth - 8.dp) / 5.6f).toSp() }
                val size = if (fit > 60.sp) 60.sp else if (fit < 28.sp) 28.sp else fit
                Row(verticalAlignment = Alignment.Top) {
                    units.forEachIndexed { i, (n, words) ->
                        if (i > 0) Text(":", style = LfType.display(size * 0.62f, c.boardAccent), modifier = Modifier.padding(horizontal = 4.dp, vertical = size.value.dp * 0.22f))
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            val cell = RoundedCornerShape(4.dp)
                            Text(
                                if (i > 0) "%02d".format(n) else "$n",
                                style = LfType.display(size, c.onBoardStrong, size * 0.9f), textAlign = TextAlign.Center, maxLines = 1, softWrap = false,
                                modifier = Modifier.clip(cell).background(androidx.compose.ui.graphics.lerp(c.board, Color.Black, 0.18f)).dots(c.boardDots)
                                    .border(1.dp, c.boardRule, cell).widthIn(min = size.value.dp * 1.32f).padding(start = 4.dp, end = 8.dp, top = 6.dp, bottom = 2.dp),
                            )
                            Text((if (n == 1L) words.first else words.second).uppercase(), style = LfType.label(11.sp, c.onBoardMuted))
                        }
                    }
                }
            }
        }
    }
}

/**
 * WEB-20: the officials on one line, the roles in small capitals, "you" in brand green; cut with an
 * ellipsis when it doesn't fit. Nothing when there's nobody to show.
 */
@Composable
private fun OfficialsLine(m: Match, referees: Map<String, Referee>, size: Int = 13, modifier: Modifier = Modifier, strong: Boolean = false) {
    val officials = officialsLine(m) { id -> id?.let { referees[it] } }
    if (officials.isEmpty()) return
    val line = buildAnnotatedString {
        officials.forEachIndexed { i, o ->
            if (i > 0) append(" · ")
            withStyle(SpanStyle(fontFamily = app.lawfive.ui.theme.Mono, fontSize = (size - 3).sp, fontWeight = FontWeight.Bold, letterSpacing = 0.08.em, color = colors.muted)) { append(o.role.uppercase()) }
            append(" ")
            if (o.you) withStyle(SpanStyle(color = if (strong) colors.text else colors.brandStrong, fontWeight = FontWeight.Bold, textDecoration = if (strong) androidx.compose.ui.text.style.TextDecoration.Underline else null)) { append(o.who) }
            else withStyle(SpanStyle(fontWeight = if (strong) FontWeight.Bold else FontWeight.Medium)) { append(o.who) }
        }
    }
    Text(
        line, modifier.semantics { contentDescription = officials.joinToString(", ") { "${roleNamesInFull[it.key] ?: it.role} ${it.who}" } },
        color = if (strong) colors.text else colors.muted, fontSize = size.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
    )
}

@Composable
fun TeamLine(m: Match, home: Boolean) {
    val team = if (home) m.home else m.away
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        TeamBadge(team, if (home) m.away else m.home, home)
        Text(teamName(team, home), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * A match row (WEB-3, WEB-24): a stadium board for each match: the kickoff along its top like a
 * fixture board (the day over the date, the time large; a played match's date instead) with the
 * weather; the two kits, the score between them once played (the side that lost dimmed); then a chalk
 * panel with where and what, the officials line, and on the right a figure (the fee before, the
 * distance once played), the cards shown, status chips, risk badges and Fee due.
 */
@Composable
fun MatchRow(m: Match, report: MatchRecord?, venue: String?, competition: String?, weather: MatchWeather? = null, units: Units = Units(), referees: Map<String, Referee> = emptyMap(), onClick: () -> Unit) {
    val context = LocalContext.current
    val kickoff = kickoffAt(m)
    val c = colors
    Box(Modifier.padding(bottom = 12.dp)) {
        Board(Modifier.clickable(onClick = onClick)) {
            Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (kickoff == null) {
                    Text("TIME TBC", style = LfType.label(12.sp, c.onBoardMuted, 0.1f))
                } else if (report != null || m.status == "played") {
                    Text(kickoff.format(java.time.format.DateTimeFormatter.ofPattern(if (kickoff.year == java.time.LocalDate.now(app.lawfive.data.AppClock.clock()).year) "EEE" else "EEE yyyy", java.util.Locale.getDefault())).uppercase(), style = LfType.label(12.sp, c.onBoardMuted, 0.1f))
                    Text(kickoff.format(java.time.format.DateTimeFormatter.ofPattern("MMM d", java.util.Locale.getDefault())).uppercase(), style = LfType.display(32.sp, c.onBoardStrong, 30.sp))
                } else {
                    val day = dayOverDate(kickoff)
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        for (line in day) Text(line, style = LfType.label(12.sp, if (day.size == 1) c.boardAccent else c.onBoardMuted, 0.1f), maxLines = 1)
                    }
                    val (time, ampm) = timeParts(kickoff, context)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(time, style = LfType.display(36.sp, c.onBoardStrong, 32.sp), maxLines = 1)
                        if (ampm != null) Text(ampm, style = LfType.display(15.sp, c.onBoardStrong), modifier = Modifier.padding(start = 2.dp, bottom = 3.dp))
                    }
                }
                Spacer(Modifier.weight(1f))
                // WX-9: the icon and temperature, as on the web.
                weather?.let { WeatherBrief(it, units) }
            }
            KitPanels(m.home, m.away, middleWidth = 104.dp, middle = report?.let { r -> { RowScore(r) } })
            app.lawfive.ui.theme.OnPanel {
                Row(Modifier.fillMaxWidth().background(colors.surface).padding(horizontal = 14.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        val what = m.name ?: competition
                        if (venue != null || what != null) {
                            Text(
                                buildAnnotatedString {
                                    venue?.let { withStyle(SpanStyle(color = colors.text, fontWeight = FontWeight.SemiBold, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)) { append(it) } }
                                    if (venue != null && what != null) append(" · ")
                                    what?.let { append(it) }
                                },
                                style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 19.sp), color = colors.muted, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        OfficialsLine(m, referees)
                    }
                    Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        val figure = if (report != null) report.distanceM?.let { app.lawfive.ui.formatDistance(it, units.distance) }
                            else m.fee?.takeIf { m.status == "scheduled" }?.let { money(it.amount, it.currency) }
                        figure?.let { Text(it, style = LfType.display(30.sp, colors.text, 30.sp), maxLines = 1) }
                        report?.let { CardCounts(it) }
                        if (report == null) StatusChip(m, role = false)
                        weather?.takeIf { !it.final && m.status == "scheduled" }?.let { w -> for (r in w.risks) RiskBadge(r, w, units) }
                        if (m.fee != null && !m.fee!!.paid && m.status == "played") Chip("Fee due", ChipTone.Amber)
                    }
                }
            }
        }
    }
}

/** The score on the board between the kits, home first, the side that lost dimmed (on penalties when level), a shoot-out small under it. */
@Composable
private fun RowScore(r: MatchRecord) {
    val c = colors
    val (home, away) = r.score.home to r.score.away
    val pens = r.penalties
    fun lost(homeSide: Boolean): Boolean {
        val (us, them) = if (homeSide) home to away else away to home
        return us < them || (us == them && pens != null && (if (homeSide) pens.home < pens.away else pens.away < pens.home))
    }
    Column(Modifier.padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("$home", style = LfType.display(46.sp, if (lost(true)) c.onBoardDim else c.onBoardStrong, 46.sp))
            Text("–", style = LfType.display(28.sp, c.onBoardDim), modifier = Modifier.padding(horizontal = 3.dp))
            Text("$away", style = LfType.display(46.sp, if (lost(false)) c.onBoardDim else c.onBoardStrong, 46.sp))
        }
        pens?.let { Text("${it.home}–${it.away} pens", style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), color = c.onBoardMuted) }
    }
}

/** Cards shown (WEB-5): the card shapes with how many, yellow then red. */
@Composable
private fun CardCounts(r: MatchRecord) {
    val yellow = r.events.count { it is app.lawfive.schema.EventCaution }
    // EVT-12: a second sin bin is a send-off.
    val red = r.events.count { it is app.lawfive.schema.EventSendOff || it is app.lawfive.schema.EventSecondCaution || it is app.lawfive.schema.EventSecondSinBin }
    if (yellow == 0 && red == 0) return
    Row(
        Modifier.semantics(mergeDescendants = true) { contentDescription = "$yellow ${if (yellow == 1) "caution" else "cautions"}, $red ${if (red == 1) "send-off" else "send-offs"}" },
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically,
    ) {
        for ((kind, n) in listOf(app.lawfive.ui.components.CardKind.Yellow to yellow, app.lawfive.ui.components.CardKind.Red to red)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                app.lawfive.ui.components.CardShape(kind, 13.dp, 18.dp)
                Text("$n", style = LfType.word(19.sp, colors.text))
            }
        }
    }
}

@Composable
fun StatusChip(m: Match, role: Boolean = true) {
    when (m.status) {
        // A row leaves the user's role to its officials line (WEB-20).
        "scheduled" -> if (role) m.role?.let { Chip(roleNames[it] ?: it, ChipTone.Brand) }
        "played" -> Chip("Played", ChipTone.Plain)
        "abandoned" -> Chip("Abandoned", ChipTone.Red)
        "cancelled" -> Chip("Canceled", ChipTone.Red)
        "postponed" -> Chip("Postponed", ChipTone.Amber)
        else -> Chip(m.status)
    }
}

/** The two kits down the row's left edge, home over away (WEB-3). */
@Composable
fun KitStripe(m: Match) {
    val dark = colors.dark
    val edge = colors.border
    val none = colors.surface2
    Canvas(Modifier.width(6.dp).fillMaxHeight()) {
        val half = size.height / 2
        for ((i, hex) in listOf(m.home.colour, m.away.colour).withIndex()) {
            val c = parseColour(hex)
            drawRect(c ?: none, topLeft = androidx.compose.ui.geometry.Offset(0f, i * half), size = androidx.compose.ui.geometry.Size(size.width, half))
            if (c != null && kitVanishes(c, dark)) {
                drawRect(edge, topLeft = androidx.compose.ui.geometry.Offset(size.width - 1f, i * half), size = androidx.compose.ui.geometry.Size(1f, half))
            }
        }
    }
}

@Suppress("unused")
@Composable
private fun RowDivider() = HorizontalDivider(color = colors.border)

@Suppress("unused")
private fun Modifier.dot() = this.size(6.dp).clip(RoundedCornerShape(3.dp))
