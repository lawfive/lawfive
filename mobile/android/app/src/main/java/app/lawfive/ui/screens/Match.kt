package app.lawfive.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.Collections
import app.lawfive.data.json
import app.lawfive.data.misconductScheme
import app.lawfive.data.str
import app.lawfive.schema.Event
import app.lawfive.schema.EventAbandonment
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventClockAdjusted
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventInjury
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.EventStoppage
import app.lawfive.schema.EventSuspension
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import java.time.ZonedDateTime
import app.lawfive.schema.MatchRecordPenalties
import app.lawfive.schema.MatchRecordScore
import app.lawfive.ui.asPlayed
import app.lawfive.ui.instantOf
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.LinkButtonColored
import app.lawfive.schema.MatchWeather
import app.lawfive.schema.MisconductCode
import app.lawfive.schema.MisconductScheme
import app.lawfive.schema.Offender
import app.lawfive.schema.OffenderPlayer
import app.lawfive.schema.OffenderTeamOfficial
import app.lawfive.schema.TrackSummary
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.Official
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.Fact
import app.lawfive.ui.components.FactsCard
import app.lawfive.ui.components.IconAction
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.WeatherSlab
import app.lawfive.ui.components.Units
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.TeamBadge
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.crewInOrder
import app.lawfive.ui.describeFormat
import app.lawfive.ui.describePlayers
import app.lawfive.ui.directionsUri
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.formatDistance
import app.lawfive.ui.formatFullDate
import app.lawfive.ui.formatSpeed
import app.lawfive.ui.formatTemperature
import app.lawfive.ui.formatTime
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.matchMinute
import app.lawfive.ui.matchTitle
import app.lawfive.ui.money
import app.lawfive.ui.periodName
import app.lawfive.ui.roleNames
import app.lawfive.ui.teamAlias
import app.lawfive.ui.teamName
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.Board
import app.lawfive.ui.components.BoardHead
import app.lawfive.ui.components.Facts
import app.lawfive.ui.components.KitPanels
import app.lawfive.ui.components.KitSize
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.cornerArcs
import app.lawfive.ui.components.dots
import app.lawfive.ui.components.hardDrop
import app.lawfive.ui.components.kitColor
import app.lawfive.ui.components.kitText
import app.lawfive.ui.roleNamesInFull
import app.lawfive.ui.roleNamesShort
import app.lawfive.ui.timeParts
import app.lawfive.ui.theme.LfType
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

// One match (APP-4): the scoreboard and weather, the fee with its Paid switch, the details, the
// crew, the events once played, the track's figures, photos, and sharing the report or a link.

@Composable
fun MatchScreen(id: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val match by remember(id) { graph.records.one(Collections.MATCHES, id, Match.serializer()) }.collectAsStateWithLifecycle(null)
    val reports by graph.records.matchRecords.collectAsStateWithLifecycle(emptyList())
    val venues by graph.records.venues.collectAsStateWithLifecycle(emptyList())
    val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
    val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val session by graph.session.state.collectAsStateWithLifecycle()
    val stored = match ?: run {
        Screen("Match", back = "Matches") { item { LoadingPitch() } }
        return
    }
    val record = reports.firstOrNull { it.matchId == id }
    // Q-20: its periods named as they were played; saving the match keeps its own format.
    val m = stored.copy(format = asPlayed(stored.format, record))
    val venue = venues.firstOrNull { it.id == m.venueId }
    val pitch = venue?.pitches?.firstOrNull { it.id == m.pitchId }
    val position = pitch?.position ?: venue?.position
    val competition = competitions.firstOrNull { it.id == m.competitionId }
    val kickoff = kickoffAt(m)
    var weather by remember(id) { mutableStateOf<MatchWeather?>(null) }
    // What the phone kept (WX-9), shown until (or without signal, instead of) the latest.
    val storedWeather by graph.weather.byMatch.collectAsStateWithLifecycle()
    var track by remember(id) { mutableStateOf<TrackSummary?>(null) }
    var heat by remember(id) { mutableStateOf<Heat?>(null) }
    // TRK-14: all of it, for the map, replay and heart rate; again when the pitch changes.
    var trackBody by remember(id) { mutableStateOf<JsonObject?>(null) }
    var trackTurn by remember(id) { mutableStateOf(0) }
    // RES-3: showing the watch's own recording, and putting it back.
    var asRecorded by remember(id) { mutableStateOf(false) }
    var reverting by remember(id) { mutableStateOf(false) }
    val zone = kickoff?.zone ?: java.time.ZoneId.systemDefault()
    LaunchedEffect(id) {
        weather = runCatching { graph.api.call("GET", "/v1/weather/$id")?.let { json.decodeFromJsonElement(MatchWeather.serializer(), it) } }.getOrNull()
    }
    // TRK-14: a track that couldn't be fetched (no signal, or the server out of reach) is asked for again
    // after the next sync that reaches the server (its lastSync); a pull to refresh is one.
    var trackMissed by remember(id) { mutableStateOf(false) }
    LaunchedEffect(record?.id, trackTurn) {
        val answer = record?.let { r -> runCatching { graph.api.call("GET", "/v1/match-records/${r.id}/track")?.jsonObject } }
        val failed = answer?.exceptionOrNull()
        if (failed is kotlinx.coroutines.CancellationException) throw failed
        // The server's own answer (404: no track) is final; not reaching it isn't, and what's shown stays.
        trackMissed = failed != null && failed !is app.lawfive.data.ApiException
        if (trackMissed) return@LaunchedEffect
        val body = answer?.getOrNull()
        track = body?.get("summary")?.let { runCatching { json.decodeFromJsonElement(TrackSummary.serializer(), it) }.getOrNull() }
        heat = body?.get("heat")?.let { runCatching { json.decodeFromJsonElement(Heat.serializer(), it) }.getOrNull() }
        trackBody = body
    }
    LaunchedEffect(session.lastSync) { if (trackMissed) trackTurn++ }
    val unit = settings?.distanceUnit ?: "km"
    // SYNC-14: whether an upcoming match is on the account's watches, as of the last sync with signal: a
    // scheduled match until three hours after its kickoff (what a watch downloads, SYNC-3), and no report yet.
    val onWatch by graph.onWatch.state.collectAsStateWithLifecycle()
    val watchWindow = m.status == "scheduled" && record == null && (kickoff == null || kickoff.toInstant().isAfter(app.lawfive.data.AppClock.now().minus(java.time.Duration.ofHours(3))))
    val onWatchLines = if (!watchWindow) emptyList() else app.lawfive.data.OnWatchStore.lines(
        m.id, onWatch, java.time.ZoneId.systemDefault(), app.lawfive.data.AppClock.now(), { formatTime(it, context) }, { formatShortDay(it) },
    )

    fun share(text: String, subject: String) {
        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, text), null))
    }

    Screen(
        title = m.name ?: matchTitle(m),
        // The kickoff is in the scoreboard until the match is played; then the day goes here.
        sub = listOfNotNull(competition?.name, kickoff?.takeIf { record != null }?.let { formatShortDay(it) }).joinToString(" · ").ifEmpty { null },
        back = "Matches",
        label = "Match · ${m.name ?: matchTitle(m)}",
        actions = { IconAction(Ph.Edit, "Edit") { nav.navigate("match/$id/edit") } },
        refresh = syncRefresh(),
    ) {
        // The page's actions under its title, as large chalk outlines (WEB-24).
        item {
            androidx.compose.foundation.layout.FlowRow(Modifier.padding(bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (record != null) {
                    SecondaryButton("Report", {
                        // DATA-6: the match's name when it has no competition, as the website's MatchReport.tsx; the kickoff as the phone tells the time.
                        share(reportText(m, record, competition?.name ?: m.name?.takeIf { m.competitionId == null }, venue?.name, pitch?.name, session.name ?: "You", referees.associateBy { it.id }, android.text.format.DateFormat.is24HourFormat(context)) { misconductScheme(context, it) }, "Match report: ${matchTitle(m)}")
                    }, icon = Ph.Report)
                }
                SecondaryButton("Share link", {
                    scope.launch {
                        val url = runCatching { graph.api.call("POST", "/v1/matches/${m.id}/share", JsonObject(emptyMap())).str("url") }.getOrNull()
                        if (url != null) share(url, matchTitle(m))
                    }
                }, icon = Ph.Share)
                if (position != null) {
                    SecondaryButton("Directions", { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(directionsUri(position.lat, position.lon, settings?.mapsApp)))) }, icon = Ph.Directions)
                }
            }
        }
        item { Scoreboard(m, record, track?.total?.distanceM ?: record?.distanceM, unit) }
        // WX-9, WX-5, WEB-28: on a slab under the scoreboard, its details a tap away.
        (weather ?: storedWeather[m.id])?.let { w ->
            item { Box(Modifier.padding(top = 30.dp)) { WeatherSlab(w, Units(settings?.temperatureUnit ?: "c", settings?.distanceUnit ?: "km")) } }
        }
        // The match (WEB-24): a chalk panel with the pitch's corners: the kickoff, fee and periods as
        // figures between heavy rules, then the details, the fee with its Paid switch last.
        item {
            Box(Modifier.padding(top = 24.dp)) {
                MatchPanel(m, kickoff, listOfNotNull(
                    (venue?.name)?.let { Fact(Ph.Venues, "Venue", listOfNotNull(it, pitch?.name).joinToString(", ")) },
                    m.role?.let { Fact(Ph.Role, "Your role", roleNames[it] ?: it, tone = ChipTone.Brand) },
                    onWatchLines.takeIf { it.isNotEmpty() }?.let { lines ->
                        Fact(Ph.Watch, "Watch", "", lines = lines.map { l ->
                            app.lawfive.ui.components.FactLine(l.text, when (l.tone) { app.lawfive.data.OnWatchStore.Companion.Tone.Old -> ChipTone.Amber; app.lawfive.data.OnWatchStore.Companion.Tone.None -> ChipTone.Plain; else -> null })
                        })
                    },
                    describePlayers(m).ifEmpty { null }?.let { Fact(Ph.Referees, "Players", it) },
                    Fact(Ph.Clock, "Format", describeFormat(m.format)),
                    kickoff?.let { Fact(Ph.Calendar, "Date", formatFullDate(it)) },
                    m.outlook?.let { Fact(Ph.Info, "What to expect", it) },
                    m.tags?.takeIf { it.isNotEmpty() }?.let { Fact(Ph.Tag, "Tags", it.joinToString(", ")) },
                    m.assignor?.let { Fact(Ph.Assignor, "Assignor", it) },
                    m.external?.let { Fact(Ph.Hash, "Match number", "${it.id} (${it.source})") },
                    m.notes?.let { Fact(Ph.Note, "Notes", it) },
                )) {
                    m.fee?.let { fee ->
                        HorizontalDivider(color = colors.border, modifier = Modifier.padding(horizontal = 16.dp))
                        ToggleRow("Fee ${money(fee.amount, fee.currency)}", if (fee.paid) "Paid" else "Not paid yet", fee.paid, { paid ->
                            scope.launch { graph.records.save(Collections.MATCHES, m.id, Match.serializer(), stored.copy(fee = fee.copy(paid = paid))) }
                        }, divider = false)
                    }
                }
            }
        }
        if (record != null) {
            item { SectionTitle("Events", action = { SecondaryButton("Edit result", { nav.navigate("match/$id/result") }, icon = Ph.Edit, modifier = Modifier.height(38.dp)) }) }
            item {
                // RES-3: the watch's own recording in place of the corrected one.
                val shown = if (asRecorded) record.original?.let { o -> record.copy(outcome = o.outcome, events = o.events) } ?: record else record
                Timeline(m, shown)
                if (record.editedAt != null) {
                    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (asRecorded) "As the watch recorded it" else "Edited after the match, ${record.editedAt?.let { instantOf(it) }?.let { formatShortDay(it.atZone(zone)) } ?: ""}",
                            style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        if (record.original != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                LinkButtonColored(if (asRecorded) "Show the corrected result" else "Show as recorded", colors.brand) { asRecorded = !asRecorded }
                                LinkButtonColored("Put back the watch's", colors.brand) { reverting = true }
                            }
                        }
                    }
                }
            }
        } else if (m.status == "played" || m.status == "abandoned" || (kickoff != null && kickoff.isBefore(java.time.ZonedDateTime.now(app.lawfive.data.AppClock.clock())))) {
            // RES-2: refereed without the watch, the result can be entered here.
            item { Box(Modifier.padding(top = 18.dp)) { PrimaryButton("Add result", { nav.navigate("match/$id/result") }, icon = Ph.Plus) } }
        }
        item { SectionTitle("Officials") }
        item {
            val pictures = rememberRefereePictures()
            val officials = crewInOrder(m.crew, m.role)
            if (officials.isEmpty()) Text("No officials listed.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (o in officials) {
                    when (o) {
                        is Official.You -> TileRow(roleNamesShort[o.role] ?: o.role, session.name ?: "You", roleNamesInFull[o.role], you = true)
                        is Official.Member -> {
                            val referee = o.member.refereeId?.let { rid -> referees.firstOrNull { it.id == rid } }
                            val name = referee?.name ?: o.member.name ?: "Unknown"
                            TileRow(
                                roleNamesShort[o.role] ?: o.role, name, roleNamesInFull[o.role],
                                trailing = if (referee != null) { { app.lawfive.ui.components.ContactButtons(referee.phone, referee.email, name) } } else null,
                                onClick = referee?.let { r -> { nav.navigate("referee/${r.id}") } },
                            )
                        }
                    }
                }
            }
        }
        track?.let { t ->
            item { SectionTitle("Your track") }
            item { Box(Modifier.padding(top = 6.dp)) { TrackFigures(t, unit) } }
        }
        val r = record
        val b = trackBody
        if (r != null && b != null) trackSection(m, r, b, unit) { trackTurn++ }
        heat?.let { hm ->
            item {
                // WEB-28: on its slab, whose tab is its heading. TRK-9: as the website says it: an assistant's
                // touchline at the bottom; as referee, with the kickoff direction from the watch, which way the
                // first kickoff team attacked (teams change ends each period of normal time; extra time has its own toss).
                val assistant = m.role == "ar1" || m.role == "ar2"
                val direction = record?.kickoffDirection
                val kicker = direction?.let { d -> if (d.team == "home") teamAlias(m.home, m.away, true) else teamAlias(m.away, m.home, false) }
                // TRK-9: under the drawing, each end's team, so a period's own line would say it twice.
                val ends = remember(m, record, trackBody) { record?.let { heatEndsOf(m, it, trackBody) } ?: { _: Int? -> emptyList<HeatEnds>() } }
                Box(Modifier.padding(top = 30.dp)) { HeatmapCard(hm, m.format, unit, ends) { period ->
                    when {
                        assistant -> "Your touchline at the bottom"
                        kicker == null || period != null -> null
                        // The arrow kept with its word, never on a line alone.
                        else -> "$kicker kicked off attacking\u00A0→"
                    }
                } }
            }
        }
        item { androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 8.dp)); PhotosSection("match", m.id) }
    }
    val original = record?.original
    if (reverting && record != null && original != null) {
        Confirm("Put back the watch's?", "What the watch recorded comes back, and your corrections to the goals, cards and outcome go.", "Put back", onConfirm = {
            reverting = false
            asRecorded = false
            scope.launch {
                // The server sees the watch's recording and clears the correction (RES-3).
                graph.records.save(Collections.MATCH_RECORDS, record.id, MatchRecord.serializer(), record.copy(
                    outcome = original.outcome, events = original.events, goldenGoal = original.goldenGoal,
                    score = MatchRecordScore(original.score.home, original.score.away), penalties = original.penalties?.let { MatchRecordPenalties(it.home, it.away) },
                ))
                graph.requestSync(0)
            }
        }, onDismiss = { reverting = false })
    }
}

/**
 * The scoreboard (WEB-24): a board: Full time (or the status, or Kickoff) in mint with the day and
 * time; on a phone each team a row, its kit with its score beside it on the board (the side that lost
 * dimmed), or the kickoff time large on the dots before the match; a foot with penalties, a golden
 * goal and how far you ran.
 */
@Composable
private fun Scoreboard(m: Match, record: MatchRecord?, distance: Double?, unit: String) {
    val context = LocalContext.current
    val kickoff = kickoffAt(m)
    val c = colors
    val label = when {
        record != null -> if (record.outcome == "abandoned") "Abandoned" else "Full time"
        m.status == "postponed" -> "Postponed"
        m.status == "cancelled" -> "Canceled"
        m.status == "abandoned" -> "Abandoned"
        m.status == "played" -> "Played"
        else -> "Kickoff"
    }
    Board {
        BoardHead(label, kickoff?.let { "${formatShortDay(it)} · ${formatTime(it, context)}" } ?: "Time to be set", Modifier.padding(bottom = 12.dp))
        if (record == null && kickoff != null) {
            val (time, ampm) = timeParts(kickoff, context)
            Row(Modifier.fillMaxWidth().dots(c.boardDots).padding(vertical = 10.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.Bottom) {
                Text(time, style = LfType.display(68.sp, c.onBoardStrong, 62.sp))
                if (ampm != null) Text(ampm, style = LfType.display(22.sp, c.onBoardStrong), modifier = Modifier.padding(start = 6.dp, bottom = 8.dp))
            }
        }
        val pens = record?.penalties
        fun lost(home: Boolean): Boolean {
            val r = record ?: return false
            val (us, them) = if (home) r.score.home to r.score.away else r.score.away to r.score.home
            return us < them || (us == them && pens != null && (if (home) pens.home < pens.away else pens.away < pens.home))
        }
        val cutPx = with(androidx.compose.ui.platform.LocalDensity.current) { 14.dp.toPx() }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (home in listOf(true, false)) {
                val team = if (home) m.home else m.away
                val kit = kitColor(team)
                val ink = kitText(kit)
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 84.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(
                        Modifier.weight(1f).fillMaxHeight().clip(androidx.compose.foundation.shape.GenericShape { size, _ ->
                            moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width - cutPx, size.height); lineTo(0f, size.height); close()
                        }).background(kit).padding(start = 14.dp, end = 26.dp, top = 12.dp, bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                    ) {
                        Text(if (home) "HOME" else "AWAY", style = LfType.label(10.5.sp, ink.copy(alpha = 0.85f), 0.16f))
                        Text(teamName(team, home).uppercase(), style = LfType.display(26.sp, ink, 25.sp), maxLines = 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                    if (record != null) {
                        val score = if (home) record.score.home else record.score.away
                        Text("$score", style = LfType.display(88.sp, if (lost(home)) c.onBoardDim else c.onBoardStrong, 80.sp), textAlign = TextAlign.Center, modifier = Modifier.width(108.dp).padding(end = 8.dp))
                    } else {
                        Box(Modifier.width(18.dp))
                    }
                }
            }
        }
        val foot = listOfNotNull(
            pens?.let { "${it.home}–${it.away} on penalties" },
            if (record?.goldenGoal == true) "On a golden goal" else null,
            distance?.takeIf { record != null }?.let { "You covered ${formatDistance(it, unit)}" },
        )
        if (foot.isNotEmpty()) {
            Text(foot.joinToString(" · ").uppercase(), style = LfType.label(11.sp, c.onBoardMuted, 0.1f), modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp))
        } else Box(Modifier.height(12.dp))
    }
}

/** The match (WEB-24): a chalk panel with the pitch's corners: its title, the kickoff, fee and periods as figures between heavy rules, then the facts. */
@Composable
private fun MatchPanel(m: Match, kickoff: ZonedDateTime?, facts: List<Fact>, more: @Composable () -> Unit) {
    val context = LocalContext.current
    LfCard {
        val c = colors
        Column(Modifier.cornerArcs(c.brand)) {
            Text("THE MATCH", style = LfType.display(30.sp, c.text, 30.sp), modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 20.dp, bottom = 12.dp))
            val periods = if (m.format.periods == 2) "Halves" else "Periods"
            val figures = listOfNotNull(
                kickoff?.let { k -> "Kickoff" to timeParts(k, context) },
                m.fee?.let { "Fee" to (money(it.amount, it.currency) to null) },
                periods to ("${m.format.periods}×${m.format.periodSec / 60}" to null),
            )
            Column(Modifier.padding(horizontal = 16.dp)) {
                Box(Modifier.fillMaxWidth().height(3.dp).background(c.text))
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                    figures.forEachIndexed { i, (label, value) ->
                        if (i > 0) Box(Modifier.width(3.dp).fillMaxHeight().background(c.text))
                        Column(Modifier.weight(1f).padding(start = if (i == 0) 0.dp else 10.dp, end = 6.dp, top = 10.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(label.uppercase(), style = LfType.label(10.5.sp, c.muted, 0.12f), maxLines = 1)
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(value.first, style = LfType.display(28.sp, c.text, 28.sp), maxLines = 1, softWrap = false)
                                value.second?.let { Text(it, style = LfType.display(12.sp, c.text), modifier = Modifier.padding(start = 2.dp, bottom = 3.dp)) }
                            }
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(3.dp).background(c.text))
            }
            Facts(facts, Modifier.padding(top = 6.dp))
            more()
            Box(Modifier.height(10.dp))
        }
    }
}

/**
 * A tile row (DESIGN.md "Tile rows"): a board tile at the left with what identifies the row in black
 * italic capitals (REF, AR1), then a chalk panel with the name and a muted line; your own row's green
 * You, a saved referee's Call, Text and Email; the whole row opening their page.
 */
@Composable
private fun TileRow(tile: String, name: String, sub: String?, you: Boolean = false, trailing: (@Composable () -> Unit)? = null, onClick: (() -> Unit)? = null) {
    val c = colors
    val shape = RoundedCornerShape(4.dp)
    Row(
        Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = 60.dp).hardDrop(c.panelShadow, shape).clip(shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
    ) {
        Box(Modifier.width(60.dp).fillMaxHeight().background(c.board).then(if (c.dark) Modifier.border(1.dp, c.boardEdge, androidx.compose.foundation.shape.RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp)) else Modifier), contentAlignment = Alignment.Center) {
            Text(tile.uppercase(), style = LfType.display(22.sp, c.onBoard, 22.sp), maxLines = 1)
        }
        app.lawfive.ui.theme.OnPanel {
            Row(
                Modifier.weight(1f).fillMaxHeight().background(colors.surface).then(if (colors.dark) Modifier.border(1.dp, colors.panelEdge, androidx.compose.foundation.shape.RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)) else Modifier)
                    .padding(start = 14.dp, end = 10.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text(name, style = MaterialTheme.typography.titleMedium.copy(fontSize = 17.sp, fontWeight = FontWeight.ExtraBold), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    sub?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                }
                if (you) Chip("You", ChipTone.Brand)
                trailing?.invoke()
            }
        }
    }
}

/**
 * The events (WEB-24): the kits as a thin strip with the first period's chalk band hanging from it,
 * then the timeline down a chalk halfway line: home's events on its left, away's on its right, the
 * minute in a board-black circle ringed in chalk on the line, a goal as the score after it (the side
 * that scored in chalk), a card as a tilted card, neutral events on the right in muted words; each
 * later period a chalk band; the end on the board ("Full time 3–1").
 */
@Composable
private fun Timeline(m: Match, r: MatchRecord) {
    val c = colors
    val events = r.events.filter { it !is app.lawfive.schema.EventPenaltyKick && it !is app.lawfive.schema.EventPeriodEnd }
    val periods = (r.periods.map { it.period } + events.mapNotNull { e -> periodOf(e) }).ifEmpty { (1..m.format.periods).map { it.toLong() } }.distinct().sorted()
    var score = 0 to 0
    val scores = mutableMapOf<Event, Pair<Int, Int>>()
    for (e in r.events) if (e is EventGoal) {
        score = if (e.team == "home") score.copy(first = score.first + 1) else score.copy(second = score.second + 1)
        scores[e] = score
    }
    Column {
        Box(Modifier.clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))) {
            KitPanels(m.home, m.away, size = KitSize.Small, lines = 1)
        }
        var first = true
        @Composable
        fun Group(label: String, list: List<Event>, always: Boolean = false) {
            if (list.isEmpty() && !always) return
            Band(label, top = first)
            first = false
            if (list.isEmpty()) {
                TimelineLine { Text("No events", style = MaterialTheme.typography.bodySmall, color = c.muted, modifier = Modifier.padding(vertical = 10.dp)) }
            } else {
                TimelineLine { Column(Modifier.padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { for (e in list) EventLine(m, e, scores[e], r.stoppingClock == true) } }
            }
        }
        Group("Before kickoff", events.filter { whenOf(it) == "beforeKickoff" })
        for (p in periods) {
            Group(periodName(m.format, p), events.filter { whenOf(it) == "play" && periodOf(it) == p }, always = true)
            Group(if (p.toInt() == m.format.periods / 2) "Half-time" else "Break", events.filter { whenOf(it) == "break" && periodOf(it) == p })
        }
        Group("After full time", events.filter { whenOf(it) == "afterFullTime" })
        val kicks = r.events.filterIsInstance<app.lawfive.schema.EventPenaltyKick>()
        if (kicks.isNotEmpty()) {
            Band("Penalties", top = false)
            TimelineLine {
                Column(Modifier.padding(vertical = 10.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (side in listOf("home", "away")) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.background(c.pitch).padding(end = 6.dp)) {
                            TeamBadge(if (side == "home") m.home else m.away, if (side == "home") m.away else m.home, side == "home")
                            for (k in kicks.filter { it.team == side }) Box(Modifier.size(12.dp).clip(RoundedCornerShape(6.dp)).background(if (k.scored) c.chalk else c.red))
                        }
                    }
                }
            }
        }
        // The end on the board.
        Board(shadow = false) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text((if (r.outcome == "abandoned") "Abandoned" else "Full time").uppercase(), style = LfType.display(24.sp, colors.onBoardStrong), modifier = Modifier.weight(1f))
                Text("${r.score.home}–${r.score.away}", style = LfType.display(44.sp, colors.onBoardStrong, 44.sp))
            }
        }
    }
}

/** A period's band: a chalk strip as wide as the kits, its name in black italic capitals. */
@Composable
private fun Band(label: String, top: Boolean) {
    app.lawfive.ui.theme.OnPanel {
        Text(
            label.uppercase(), style = LfType.display(20.sp, colors.brandStrong, 22.sp),
            modifier = Modifier.fillMaxWidth().then(if (top) Modifier else Modifier.clip(RoundedCornerShape(4.dp))).background(colors.surface).padding(horizontal = 14.dp, vertical = 8.dp),
        )
    }
}

/** What runs down the chalk halfway line between two bands. */
@Composable
private fun TimelineLine(content: @Composable () -> Unit) {
    val line = colors.chalkLine
    Box(Modifier.fillMaxWidth().drawBehind { drawLine(line, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), 3.dp.toPx()) }, contentAlignment = Alignment.Center) {
        content()
    }
}

@Composable
private fun EventLine(m: Match, e: Event, score: Pair<Int, Int>?, stoppingClock: Boolean = false) {
    val c = colors
    val minute = if (whenOf(e) == "play" && periodOf(e) != null && periodSecOf(e) != null) matchMinute(m.format, periodOf(e)!!, periodSecOf(e)!!) else ""
    val side = when (e) {
        is EventGoal -> e.team; is EventCaution -> e.team; is EventSecondCaution -> e.team; is EventSendOff -> e.team; is EventInjury -> e.team
        is EventSinBin -> e.team; is EventSecondSinBin -> e.team
        else -> null
    }
    val code = when (e) {
        is EventCaution -> e.misconduct?.code; is EventSecondCaution -> e.misconduct?.code; is EventSendOff -> e.misconduct?.code
        is EventSinBin -> e.misconduct?.code; is EventSecondSinBin -> e.misconduct?.code; else -> null
    }
    val words = when (e) {
        is EventGoal -> "${goalTypeNames[e.goalType ?: "goal"]}${shirt(e.player)?.let { " $it" } ?: ""}"
        is EventCaution -> "Caution${who(e.offender).let { if (it.isEmpty()) "" else " $it" }}"
        is EventSecondCaution -> "Second caution${who(e.offender).let { if (it.isEmpty()) "" else " $it" }}"
        is EventSendOff -> "Sent off${who(e.offender).let { if (it.isEmpty()) "" else " $it" }}"
        is EventSinBin -> sinBinWords(e)
        is EventSecondSinBin -> "Second sin bin${who(e.offender).let { if (it.isEmpty()) "" else " $it" }}"
        // TMR-15: on a clock that stops, a stoppage adds nothing: the clock stood still.
        is EventStoppage -> if (stoppingClock) "Clock stopped, ${e.lengthSec / 60}:${"%02d".format(e.lengthSec % 60)}" else "Stoppage, ${e.lengthSec / 60}:${"%02d".format(e.lengthSec % 60)} added"
        is EventInjury -> "Injury${shirt(e.player)?.let { " $it" } ?: ""}"
        is EventClockAdjusted -> clockAdjustedWords(e)
        is EventSuspension -> suspensionWords(e)
        is EventAbandonment -> "Match abandoned"
        else -> return
    }
    // For screen readers, the whole line as one sentence, with the team.
    val team = side?.let { teamName(if (it == "home") m.home else m.away, it == "home") }
    val spoken = listOfNotNull(minute.ifEmpty { null }, words, team, code, score?.let { "${it.first}–${it.second}" }).joinToString(", ")
    val home = side == "home"
    @Composable
    fun What(alignEnd: Boolean) {
        Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            when (e) {
                is EventGoal -> {
                    val (h, a) = score ?: (0 to 0)
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(color = if (home) c.chalk else c.chalkMuted)) { append("$h") }
                            withStyle(SpanStyle(color = c.chalkMuted)) { append("–") }
                            withStyle(SpanStyle(color = if (!home) c.chalk else c.chalkMuted)) { append("$a") }
                        },
                        style = LfType.display(38.sp, c.chalk, 36.sp),
                    )
                    Text(words, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), color = c.chalk)
                }
                is EventCaution, is EventSecondCaution, is EventSendOff, is EventSinBin, is EventSecondSinBin -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val kind = when (e) {
                        is EventCaution -> app.lawfive.ui.components.CardKind.Yellow
                        // EVT-12: with the hourglass, as the website's.
                        is EventSinBin -> app.lawfive.ui.components.CardKind.SinBin
                        is EventSecondSinBin -> app.lawfive.ui.components.CardKind.SecondSinBin
                        is EventSecondCaution -> app.lawfive.ui.components.CardKind.Second
                        else -> app.lawfive.ui.components.CardKind.Red
                    }
                    val card = @Composable { app.lawfive.ui.components.CardShape(kind, 22.dp, 30.dp) }
                    val text = @Composable {
                        Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(words, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), color = c.chalk)
                            code?.let { Chip(it) }
                        }
                    }
                    if (alignEnd) { text(); card() } else { card(); text() }
                }
                else -> Text(words, style = MaterialTheme.typography.bodySmall, color = c.chalkMuted, textAlign = if (alignEnd) TextAlign.End else TextAlign.Start)
            }
        }
    }
    Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) { contentDescription = spoken }, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).padding(end = 12.dp), contentAlignment = Alignment.CenterEnd) { if (home) What(true) }
        Box(
            Modifier.size(42.dp).clip(androidx.compose.foundation.shape.CircleShape).background(c.board).border(2.dp, c.chalkLine, androidx.compose.foundation.shape.CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text(minute.ifEmpty { "·" }, style = LfType.word(if (minute.length > 4) 11.sp else 14.sp, c.onBoardStrong), maxLines = 1) }
        Box(Modifier.weight(1f).padding(start = 12.dp), contentAlignment = Alignment.CenterStart) { if (!home) What(false) }
    }
}

private fun whenOf(e: Event): String? = when (e) {
    is EventGoal -> e.`when`; is EventCaution -> e.`when`; is EventSecondCaution -> e.`when`; is EventSendOff -> e.`when`
    is EventSinBin -> e.`when`; is EventSecondSinBin -> e.`when`
    is EventStoppage -> e.`when`; is EventInjury -> e.`when`; is EventSuspension -> e.`when`; is EventAbandonment -> e.`when`
    is EventClockAdjusted -> e.`when`
    else -> null
}

private fun periodOf(e: Event): Long? = when (e) {
    is EventGoal -> e.period; is EventCaution -> e.period; is EventSecondCaution -> e.period; is EventSendOff -> e.period
    is EventSinBin -> e.period; is EventSecondSinBin -> e.period
    is EventStoppage -> e.period; is EventInjury -> e.period; is EventSuspension -> e.period; is EventAbandonment -> e.period
    is EventClockAdjusted -> e.period
    else -> null
}

private fun periodSecOf(e: Event): Long? = when (e) {
    is EventGoal -> e.periodSec; is EventCaution -> e.periodSec; is EventSecondCaution -> e.periodSec; is EventSendOff -> e.periodSec
    is EventSinBin -> e.periodSec; is EventSecondSinBin -> e.periodSec
    is EventStoppage -> e.periodSec; is EventInjury -> e.periodSec; is EventSuspension -> e.periodSec; is EventAbandonment -> e.periodSec
    is EventClockAdjusted -> e.periodSec
    else -> null
}

/** TMR-14: a clock corrected on the watch, in muted words as a stoppage: "Clock adjusted +0:40", "Added time adjusted −1:05". */
internal fun clockAdjustedWords(e: EventClockAdjusted): String {
    val change = kotlin.math.abs(e.changeSec)
    return "${if (e.clock == "added") "Added time" else "Clock"} adjusted ${if (e.changeSec < 0) "\u2212" else "+"}${change / 60}:${"%02d".format(change % 60)}"
}

/** EVT-12: a sin bin with its player and length, "Sin bin #7 · 10 min" ("Sin bin · 10 min" with no number). */
internal fun sinBinWords(e: EventSinBin): String =
    "Sin bin${who(e.offender).let { if (it.isEmpty()) "" else " $it" }} · ${app.lawfive.ui.minutes(e.lengthSec.toInt())} min"

private val suspensionReasons = mapOf("weather" to "Weather", "lightning" to "Lightning", "crowdTrouble" to "Crowd trouble", "other" to "Other reason")

/** TMR-13: play suspended on the watch and resumed, "Suspended 30:00 · Lightning"; without a length when it never resumed. */
internal fun suspensionWords(e: EventSuspension): String {
    val length = e.lengthSec?.let { " ${it / 60}:${"%02d".format(it % 60)}" } ?: ""
    val note = e.note?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""
    return "Suspended$length · ${suspensionReasons[e.reason] ?: "Other reason"}$note"
}

private val goalTypeNames = mapOf("goal" to "Goal", "directFreeKick" to "DFK goal", "penalty" to "Penalty goal", "ownGoal" to "Own goal")
/** DATA-6: a goal's kind in the report, as the website's report.ts (goalKinds); a plain goal says nothing. */
private val reportGoalKinds = mapOf("directFreeKick" to "Direct free kick", "penalty" to "Penalty", "ownGoal" to "Own goal")
private val officialNames = mapOf("headCoach" to "Head coach", "assistantCoach" to "Assistant coach", "other" to "Team official")

/** EVT-3: a player's number, "#7"; none (or 0, as the website's `!number`) when the watch recorded none. */
private fun shirt(n: Int?): String? = n?.takeIf { it > 0 }?.let { "#$it" }

private fun who(o: Offender): String = when (o) {
    is OffenderPlayer -> shirt(o.number) ?: ""
    is OffenderTeamOfficial -> officialNames[o.role] ?: "Team official"
    else -> ""
}

/** DATA-6: who a card was for in the report, as the website's report.ts: "#5", "Player" without a number, "Head coach Pat Lee". */
private fun reportWho(o: Offender): String = when (o) {
    is OffenderPlayer -> shirt(o.number) ?: "Player"
    is OffenderTeamOfficial -> listOfNotNull(officialNames[o.role] ?: "Team official", o.name?.ifEmpty { null }).joinToString(" ")
    else -> ""
}

/**
 * The match report as text (DATA-6), for the share sheet: what league forms ask for, as the website's report.ts.
 * [use24Hour] is the phone's 12/24-hour setting (DateFormat.is24HourFormat), for the kickoff's time, as the rest of the app tells it;
 * [schemes] gives a misconduct scheme by its id, for what a card's code means.
 */
fun reportText(m: Match, r: MatchRecord, competition: String?, venue: String?, pitch: String?, you: String, referees: Map<String, app.lawfive.schema.Referee>, use24Hour: Boolean, schemes: (String) -> MisconductScheme?): String {
    val kickoff = kickoffAt(m)
    fun team(side: String) = teamName(if (side == "home") m.home else m.away, side == "home")
    // TMR-15: the record says when the clock stopped, whatever the format says now.
    val timed = if (r.stoppingClock == true) m.format.copy(stoppingClock = true) else m.format
    fun minute(e: Event): String = if (whenOf(e) == "play" && periodOf(e) != null && periodSecOf(e) != null) matchMinute(timed, periodOf(e)!!, periodSecOf(e)!!)
        else mapOf("beforeKickoff" to "Before kickoff", "break" to "During a break", "afterFullTime" to "After full time", "penalties" to "Shoot-out")[whenOf(e)] ?: ""
    val lines = mutableListOf("MATCH REPORT")
    competition?.let { lines += it }
    lines += "${team("home")} v ${team("away")}"
    // The date and kickoff, "Saturday, November 7, 2026, 9:00 AM" (13:30 on a 24-hour phone), in the match's own time zone, as the website's.
    kickoff?.let { lines += "${formatFullDate(it)}, ${formatTime(it, use24Hour)}" }
    listOfNotNull(venue, pitch).joinToString(", ").ifEmpty { null }?.let { lines += it }
    m.external?.let { lines += "Match number: ${it.id}" }
    m.assignor?.let { lines += "Assignor: $it" }
    lines += ""
    lines += "Officials"
    for (o in crewInOrder(m.crew, m.role)) {
        lines += "${roleNames[o.role]}: " + when (o) {
            is Official.You -> you
            is Official.Member -> o.member.refereeId?.let { referees[it]?.name } ?: o.member.name ?: "Unknown"
        }
    }
    lines += ""
    lines += "Result: ${team("home")} ${r.score.home} – ${r.score.away} ${team("away")}, ${if (r.outcome == "abandoned") "abandoned" else "full time"}" +
        (r.penalties?.let { " (${it.home}–${it.away} on penalties)" } ?: if (r.goldenGoal == true) " (golden goal)" else "") +
        // RES-1: a result corrected after the match says so, as the website's printable page and text.
        (if (r.editedAt != null) ", corrected after the match" else "")
    // EVT-11: when the match was abandoned, "Abandoned 67': note", as the website's.
    r.events.filterIsInstance<EventAbandonment>().firstOrNull()?.let { a -> lines += "Abandoned ${minute(a)}" + (a.note?.ifEmpty { null }?.let { ": $it" } ?: "") }
    // TMR-13: the match suspended and resumed, "30'  Suspended 34:12 · Lightning: note", only when it was, as the website's report.ts (suspensionLines).
    val suspensions = r.events.filterIsInstance<EventSuspension>()
    if (suspensions.isNotEmpty()) {
        lines += ""
        lines += "Suspended"
        for (s in suspensions) lines += "${minute(s)}  ${suspensionWords(s.copy(note = null))}" + (s.note?.ifEmpty { null }?.let { ": $it" } ?: "")
    }
    // TMR-14: the clock's corrections during play, "12'  Clock adjusted +0:40", so the report says the times were corrected (clockLines).
    // TMR-15: first, that the clock stopped when play stopped, so its minutes are the clock's, with no added time.
    val adjustments = r.events.filterIsInstance<EventClockAdjusted>()
    val stopping = r.stoppingClock == true || m.format.stoppingClock == true
    if (adjustments.isNotEmpty() || stopping) {
        lines += ""
        lines += "Clock"
        if (stopping) lines += "Stopped when play stopped (the minutes are the clock's)"
        for (a in adjustments) lines += "${minute(a)}  ${clockAdjustedWords(a)}"
    }
    lines += ""
    lines += "Goals"
    val goals = r.events.filterIsInstance<EventGoal>()
    if (goals.isEmpty()) lines += "None"
    for (g in goals) lines += listOf(minute(g), team(g.team), shirt(g.player), g.goalType?.let { reportGoalKinds[it] }).filterNotNull().joinToString("  ")
    lines += ""
    lines += "Cautions and send-offs"
    val cards = r.events.filter { it is EventCaution || it is EventSecondCaution || it is EventSendOff || it is EventSinBin || it is EventSecondSinBin }
    if (cards.isEmpty()) lines += "None"
    // A code with what it means, "UB (Unsporting behavior)", when its scheme ships with LawFive (misconductDescription); each scheme read once.
    val read = mutableMapOf<String, MisconductScheme?>()
    fun codeWords(code: MisconductCode?): String? = code?.let { c ->
        val scheme = read.getOrPut(c.scheme) { schemes(c.scheme) }
        val description = scheme?.cautions?.firstOrNull { it.code == c.code }?.description ?: scheme?.sendOffs?.firstOrNull { it.code == c.code }?.description
        c.code + (description?.let { " ($it)" } ?: "")
    }
    for (c in cards) {
        val (kind, side, offender, code) = when (c) {
            is EventCaution -> listOf("Caution", c.team, reportWho(c.offender), codeWords(c.misconduct))
            is EventSecondCaution -> listOf("Second caution (sent off)", c.team, reportWho(c.offender), codeWords(c.misconduct))
            is EventSendOff -> listOf("Send-off", c.team, reportWho(c.offender), codeWords(c.misconduct))
            // EVT-12.
            is EventSinBin -> listOf("Sin bin (${app.lawfive.ui.minutes(c.lengthSec.toInt())} min)", c.team, reportWho(c.offender), codeWords(c.misconduct))
            is EventSecondSinBin -> listOf("Second sin bin (sent off)", c.team, reportWho(c.offender), codeWords(c.misconduct))
            else -> listOf("", "", "", null)
        }
        lines += listOfNotNull(minute(c), team(side!!), offender?.ifEmpty { null }, kind, code).joinToString("  ")
    }
    // EVT-16: injuries, only when there were any, as the website's report.ts (injuryLine).
    val injuries = r.events.filterIsInstance<EventInjury>()
    if (injuries.isNotEmpty()) {
        lines += ""
        lines += "Injuries"
        for (i in injuries) {
            val stopped = i.lengthSec?.takeIf { it > 0 }?.let { "Play stopped ${it / 60}:${(it % 60).toString().padStart(2, '0')}" }
            lines += listOfNotNull(minute(i), team(i.team), shirt(i.player) ?: "Player", stopped).joinToString("  ") + (i.note?.ifEmpty { null }?.let { ": $it" } ?: "")
        }
    }
    m.notes?.let { lines += ""; lines += "Notes"; lines += it }
    return lines.joinToString("\n") + "\n"
}
