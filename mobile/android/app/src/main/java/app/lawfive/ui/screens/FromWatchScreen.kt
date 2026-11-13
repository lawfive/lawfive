package app.lawfive.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.currentStateAsState
import app.lawfive.AppGraph
import app.lawfive.data.ApiException
import app.lawfive.data.json
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.Referee
import app.lawfive.schema.TrackSummary
import app.lawfive.ui.Official
import app.lawfive.ui.crewInOrder
import app.lawfive.ui.formatDistance
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.instantOf
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.money
import app.lawfive.ui.roleNames
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.pitchStripes
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import java.time.Instant
import java.time.ZoneId

// What came in from the watch (APP-26): after a sync brings played matches from a watch, a summary
// of each, over everything, in the sync screen's layout (APP-16). It takes over from the sync screen
// when that's showing, and otherwise comes up by itself when the app is in front. Tapping a match
// opens it; Done or back closes it, and what was waiting goes.

/** A match report from the watch and its match. */
private data class Arrival(val record: MatchRecord, val match: Match) {
    /** Newest first: by kickoff, else when the first period started. */
    val at: Instant? get() = kickoffAt(match)?.toInstant() ?: instantOf(record.periods.minByOrNull { it.period }?.startedAt)
}

@Composable
fun FromWatchScreen(graph: AppGraph) {
    val scope = rememberCoroutineScope()
    val waiting by graph.fromWatch.waiting.collectAsStateWithLifecycle()
    val progress by graph.syncActivity.state.collectAsStateWithLifecycle()
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val any = waiting.isNotEmpty()
    // Only read while something's waiting.
    val reports by remember(any) { if (any) graph.records.matchRecords else flowOf(null) }.collectAsStateWithLifecycle(null)
    val matches by remember(any) { if (any) graph.records.matches else flowOf(null) }.collectAsStateWithLifecycle(null)
    // Those closed here, until the phone has forgotten them too.
    var closed by remember { mutableStateOf(emptySet<String>()) }
    val arrived = remember(waiting, reports, matches, closed) {
        val byId = matches?.associateBy { it.id } ?: emptyMap()
        reports.orEmpty().filter { it.id in waiting && it.id !in closed }.mapNotNull { r -> r.matchId?.let { byId[it] }?.let { Arrival(r, it) } }
            .sortedByDescending { it.at ?: Instant.EPOCH }
    }
    var open by remember { mutableStateOf(false) }
    // What's shown, kept while it fades out.
    var shown by remember { mutableStateOf(emptyList<Arrival>()) }
    // In front, and not while a sync is moving or the sync screen is up (it hands over when it's done).
    LaunchedEffect(arrived, progress.show, progress.busy, lifecycle) {
        if (arrived.isNotEmpty() && (open || !progress.show && !progress.busy && lifecycle.isAtLeast(Lifecycle.State.RESUMED))) {
            shown = arrived
            open = true
        }
    }
    // A report deleted meanwhile has nothing to show; once none is left, nothing's waiting.
    LaunchedEffect(waiting, reports) {
        val kept = reports ?: return@LaunchedEffect
        if (any && waiting.none { id -> kept.any { it.id == id } }) graph.fromWatch.clear()
    }
    fun close(then: () -> Unit = {}) {
        open = false
        closed = closed + shown.map { it.record.id }
        scope.launch { graph.fromWatch.clear() }
        then()
    }
    AnimatedVisibility(open && shown.isNotEmpty(), enter = fadeIn(), exit = fadeOut()) {
        BackHandler { close() }
        val referees by graph.records.referees.collectAsStateWithLifecycle(emptyList())
        val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
        val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
        val byReferee = remember(referees) { referees.associateBy { it.id } }
        Column(
            Modifier.fillMaxSize().pitchStripes(colors.pitch, colors.pitchStripe).statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Where the sync screen has its tick, so taking over from it moves nothing.
            Box(Modifier.height(112.dp), contentAlignment = Alignment.Center) { Avatar(icon = Ph.Check, size = 56.dp) }
            Text(
                (if (shown.size == 1) "Match from your watch" else "${shown.size} matches from your watch").uppercase(),
                style = MaterialTheme.typography.headlineLarge, color = colors.text, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(6.dp))
            Text("Synced to your account", style = MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(20.dp))
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(shown, key = { it.record.id }) { a ->
                    ArrivalCard(
                        graph, a, competitions.firstOrNull { it.id == a.match.competitionId }?.name, settings?.distanceUnit ?: "km", byReferee,
                    ) { close { graph.pendingMatch.value = a.match.id } }
                }
            }
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Done", { close() }, Modifier.fillMaxWidth())
        }
    }
}

/** A match as it came in: the team-sheet row's teams and score, then a muted line for each thing it has. */
@Composable
private fun ArrivalCard(graph: AppGraph, a: Arrival, competition: String?, unit: String, referees: Map<String, Referee>, onClick: () -> Unit) {
    val r = a.record
    val m = a.match
    // Whether it has a track, as the match's page finds out: null until the server says (or offline).
    var hasTrack by remember(r.id) { mutableStateOf<Boolean?>(null) }
    var track by remember(r.id) { mutableStateOf<TrackSummary?>(null) }
    LaunchedEffect(r.id) {
        try {
            val body = graph.api.call("GET", "/v1/match-records/${r.id}/track")?.jsonObject
            track = body?.get("summary")?.let { runCatching { json.decodeFromJsonElement(TrackSummary.serializer(), it) }.getOrNull() }
            hasTrack = body != null
        } catch (e: ApiException) {
            if (e.status == 404) hasTrack = false
        } catch (_: Exception) {
            // Offline: the track's line waits for the match's page.
        }
    }
    val day = kickoffAt(m) ?: a.at?.atZone(ZoneId.systemDefault())
    val played = r.periods.sumOf { it.playedSec }
    val lines = listOf(
        listOfNotNull(day?.let { formatShortDay(it) }, competition, m.role?.let { roleNames[it] ?: it }).joinToString(" · "),
        goalsAndCards(r),
        listOfNotNull(
            r.distanceM?.let { formatDistance(it, unit) },
            played.takeIf { it > 0 }?.let { "${(it + 30) / 60} min" },
            hasTrack?.let { if (it) "Track in" else "No track" },
        ).joinToString(" · "),
        listOfNotNull(track?.total?.avgBpm?.let { "$it avg" }, track?.total?.maxBpm?.let { "$it max" }).joinToString(" · ").ifEmpty { null }?.let { "Heart rate $it" },
        m.fee?.let { "${money(it.amount, it.currency)} · ${if (it.paid) "Paid" else "Not paid"}" },
        crewInOrder(m.crew, null).mapNotNull { o -> (o as? Official.Member)?.member?.let { c -> c.refereeId?.let { referees[it]?.name } ?: c.name }?.trim()?.ifEmpty { null } }
            .joinToString(", ").ifEmpty { null }?.let { "Crew: $it" },
    ).mapNotNull { it?.ifEmpty { null } }
    LfCard(onClick = onClick) {
        Row(Modifier.height(IntrinsicSize.Min)) {
            KitStripe(m)
            Column(Modifier.weight(1f).padding(start = 12.dp, end = 14.dp, top = 12.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                ScoreLine(a, true)
                ScoreLine(a, false)
                r.penalties?.let { Text("${it.home}–${it.away} on penalties", style = MaterialTheme.typography.bodySmall) }
                Spacer(Modifier.height(2.dp))
                for (line in lines) Text(line, style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        }
    }
}

/** A team and its goals, as the team-sheet row shows them: the loser's score muted. */
@Composable
private fun ScoreLine(a: Arrival, home: Boolean) {
    val score = a.record.score
    val mine = if (home) score.home else score.away
    val theirs = if (home) score.away else score.home
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f)) { TeamLine(a.match, home) }
        Text("$mine", fontFamily = BarlowCondensed, fontWeight = FontWeight.Bold, fontSize = 22.sp, color = if (theirs > mine) colors.muted else colors.text)
    }
}

/**
 * APP-26: "4 goals · 2 cautions · 1 send-off", leaving out what there's none of, or "No goals or
 * cards". Counted as Stats counts them (STAT-7): a second caution is a caution and a send-off; a
 * second sin bin a sin bin and a send-off (EVT-12).
 */
fun goalsAndCards(r: MatchRecord): String {
    val second = r.events.count { it is EventSecondCaution }
    fun counted(n: Long, one: String, many: String) = n.takeIf { it > 0 }?.let { "$it ${if (it == 1L) one else many}" }
    return listOfNotNull(
        counted(r.score.home + r.score.away, "goal", "goals"),
        counted((r.events.count { it is EventCaution } + second).toLong(), "caution", "cautions"),
        counted((r.events.count { it is EventSendOff || it is EventSecondSinBin } + second).toLong(), "send-off", "send-offs"),
        counted(r.events.count { it is EventSinBin || it is EventSecondSinBin }.toLong(), "sin bin", "sin bins"),
    ).joinToString(" · ").ifEmpty { "No goals or cards" }
}
