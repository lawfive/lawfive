package app.lawfive.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.Collections
import app.lawfive.data.minuteText
import app.lawfive.data.misconductScheme
import app.lawfive.data.penaltiesOf
import app.lawfive.data.periodSecOf
import app.lawfive.data.periodsFromFormat
import app.lawfive.data.scoreOf
import app.lawfive.data.settleCautions
import app.lawfive.data.withEvents
import app.lawfive.schema.Event
import app.lawfive.schema.EventAbandonment
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventPenaltyKick
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchRecordScore
import app.lawfive.schema.MisconductCode
import app.lawfive.schema.Offender
import app.lawfive.schema.OffenderPlayer
import app.lawfive.schema.OffenderTeamOfficial
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.asPlayed
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.TeamBadge
import app.lawfive.ui.components.UnsavedChanges
import app.lawfive.ui.matchTitle
import app.lawfive.ui.periodName
import app.lawfive.ui.teamName
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch

// Correcting a played match's result (RES-1, RES-5), or entering one for a match refereed without
// the watch (RES-2), as on the website: goals, cards with misconduct codes, the shoot-out and the
// outcome. The score comes from the goals and second cautions are settled by the shared rules
// (data/Result.kt). Stoppages and the watch's other records are kept as they are; the server keeps
// the watch's own recording (RES-3). EVT-12: sin bins as cards, with their length, where the format
// has them (or the result already does).

private val allKinds = listOf("goal" to "Goal", "caution" to "Caution", "sinBin" to "Sin bin", "sendOff" to "Send-off")
private val whoNames = listOf("player" to "Player", "headCoach" to "Head coach", "assistantCoach" to "Assistant coach", "other" to "Team official")
private val goalTypes = listOf("goal" to "Goal", "directFreeKick" to "Direct free kick", "penalty" to "Penalty", "ownGoal" to "Own goal")
private val reasons = listOf("weather" to "Weather", "lightning" to "Lightning", "crowdTrouble" to "Crowd trouble", "notEnoughPlayers" to "Not enough players", "other" to "Other")
private var nextKey = 1

/** One goal or card as the form edits it; `from` keeps what the form doesn't show (a time of day, an official's name). */
private data class ResultRow(
    val key: Int = nextKey++, val kind: String, val whenKey: String, val minute: String = "", val team: String = "home",
    val who: String = "player", val number: String = "", val goalType: String = "goal", val code: String = "", val from: Event? = null,
    /** EVT-12: a sin bin's length. */
    val lengthSec: Int = 600,
    /** Where and at what minute it started, so a minute left alone keeps the watch's exact second. */
    val fromWhen: String? = null, val fromMinute: String? = null,
)

private data class KickRow(val key: Int = nextKey++, val team: String, val scored: Boolean, val number: String = "")

private fun rowOf(m: Match, e: Event): ResultRow? {
    fun whenKey(w: String, p: Long?) = when (w) { "play" -> "play:${p ?: 1}"; "break" -> "break:${p ?: 1}"; "beforeKickoff" -> "before"; else -> "after" }
    fun minute(w: String, p: Long?, s: Long?) = if (w == "play" && p != null && s != null) minuteText(m.format, p.toInt(), s).trimEnd('\'') else ""
    fun card(kind: String, w: String, p: Long?, s: Long?, team: String, offender: Offender, code: MisconductCode?, e: Event, lengthSec: Long = 600) = ResultRow(
        kind = kind, whenKey = whenKey(w, p), minute = minute(w, p, s), team = team, lengthSec = lengthSec.toInt(),
        who = (offender as? OffenderTeamOfficial)?.role ?: "player", number = (offender as? OffenderPlayer)?.number?.toString() ?: "", code = code?.code ?: "", from = e,
        fromWhen = whenKey(w, p), fromMinute = minute(w, p, s),
    )
    return when (e) {
        is EventGoal -> ResultRow(
            kind = "goal", whenKey = whenKey(e.`when`, e.period), minute = minute(e.`when`, e.period, e.periodSec), team = e.team, number = e.player?.toString() ?: "", goalType = e.goalType ?: "goal", from = e,
            fromWhen = whenKey(e.`when`, e.period), fromMinute = minute(e.`when`, e.period, e.periodSec),
        )
        is EventCaution -> card("caution", e.`when`, e.period, e.periodSec, e.team, e.offender, e.misconduct, e)
        is EventSecondCaution -> card("caution", e.`when`, e.period, e.periodSec, e.team, e.offender, e.misconduct, e)
        is EventSendOff -> card("sendOff", e.`when`, e.period, e.periodSec, e.team, e.offender, e.misconduct, e)
        is EventSinBin -> card("sinBin", e.`when`, e.period, e.periodSec, e.team, e.offender, e.misconduct, e, e.lengthSec)
        is EventSecondSinBin -> card("sinBin", e.`when`, e.period, e.periodSec, e.team, e.offender, e.misconduct, e, e.lengthSec)
        else -> null
    }
}

/** The event a row stands for, or what's wrong with it. */
private fun eventOf(m: Match, row: ResultRow, scheme: String): Result<Event> {
    val number = row.number.trim().ifEmpty { null }?.toIntOrNull()
    if (row.number.isNotBlank() && (number == null || number !in 1..99)) return Result.failure(IllegalArgumentException("A player's number is 1 to 99."))
    val place = row.whenKey.substringBefore(':')
    val period = row.whenKey.substringAfter(':', "").toLongOrNull()
    val w = when (place) { "play" -> "play"; "break" -> "break"; "before" -> "beforeKickoff"; else -> "afterFullTime" }
    var periodSec: Long? = null
    // A minute left as it was keeps the watch's exact second (22:41, not 22:00).
    if (place == "play" && row.from != null && row.whenKey == row.fromWhen && row.minute.trim() == row.fromMinute && row.minute.isNotBlank()) {
        periodSec = row.from.periodSecOf
    } else if (place == "play" && row.minute.isNotBlank()) {
        periodSec = periodSecOf(m.format, period!!.toInt(), row.minute)
            ?: return Result.failure(IllegalArgumentException("${row.minute.trim()}' isn't in the ${periodName(m.format, period).lowercase()}."))
    }
    val at = when (val f = row.from) {
        is EventGoal -> f.at; is EventCaution -> f.at; is EventSecondCaution -> f.at; is EventSendOff -> f.at
        is EventSinBin -> f.at; is EventSecondSinBin -> f.at; else -> null
    }
    val p = if (place == "play" || place == "break") period else null
    if (row.kind == "goal") {
        if (w != "play") return Result.failure(IllegalArgumentException("A goal is scored during play."))
        return Result.success(EventGoal(`when` = w, period = p, periodSec = periodSec, at = at, team = row.team, player = number, goalType = row.goalType.takeIf { it != "goal" }))
    }
    val name = when (val f = row.from) { is EventCaution -> f.offender; is EventSecondCaution -> f.offender; is EventSendOff -> f.offender; else -> null }.let { (it as? OffenderTeamOfficial)?.name }
    val offender: Offender = if (row.who == "player") OffenderPlayer(number = number) else OffenderTeamOfficial(role = row.who, name = name)
    val code = row.code.ifEmpty { null }?.let { MisconductCode(scheme = scheme, code = it) }
    // EVT-12: a player's, settled as a second sin bin with the rest (data/Result.kt).
    if (row.kind == "sinBin") return Result.success(EventSinBin(`when` = w, period = p, periodSec = periodSec, at = at, team = row.team, offender = OffenderPlayer(number = number), misconduct = code, lengthSec = row.lengthSec.toLong()))
    return Result.success(
        if (row.kind == "sendOff") EventSendOff(`when` = w, period = p, periodSec = periodSec, at = at, team = row.team, offender = offender, misconduct = code)
        else EventCaution(`when` = w, period = p, periodSec = periodSec, at = at, team = row.team, offender = offender, misconduct = code),
    )
}

@Composable
fun ResultEditScreen(matchId: String) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val match by remember(matchId) { graph.records.one(Collections.MATCHES, matchId, Match.serializer()) }.collectAsStateWithLifecycle(null)
    val reports by graph.records.matchRecords.collectAsStateWithLifecycle(null)
    val competitions by graph.records.competitions.collectAsStateWithLifecycle(emptyList())
    val settings by graph.records.settingsOrDefaults.collectAsStateWithLifecycle(null)
    val stored = match
    val all = reports
    if (stored == null || all == null) {
        Screen("Result", back = "Match") { item { LoadingPitch() } }
        return
    }
    val saved = remember(all.isNotEmpty()) { all.firstOrNull { it.matchId == matchId } }
    // Q-20: its periods named as they were played (a new result has none, so it's the plan's).
    val m = stored.copy(format = asPlayed(stored.format, saved))
    val isNew = saved == null
    val record = remember(saved?.id) {
        saved ?: MatchRecord(id = newId(), version = 0, updatedAt = now(), matchId = matchId, outcome = "completed", periods = periodsFromFormat(m.format), score = MatchRecordScore(0, 0), events = emptyList())
    }
    val schemeId = m.competitionId?.let { id -> competitions.firstOrNull { it.id == id }?.misconductScheme } ?: settings?.misconductScheme ?: "ifab"
    val scheme = remember(schemeId) { misconductScheme(context, schemeId) }
    var rows by remember(record.id) { mutableStateOf(record.events.mapNotNull { rowOf(m, it) }) }
    var kicks by remember(record.id) { mutableStateOf(record.events.filterIsInstance<EventPenaltyKick>().map { KickRow(team = it.team, scored = it.scored, number = it.player?.toString() ?: "") }) }
    var outcome by remember(record.id) { mutableStateOf(record.outcome) }
    var reason by remember(record.id) { mutableStateOf(record.events.filterIsInstance<EventAbandonment>().firstOrNull()?.reason ?: "weather") }
    var problem by remember { mutableStateOf<String?>(null) }
    val start = remember(record.id) { listOf(rows, kicks, outcome, reason) }
    UnsavedChanges(listOf(rows, kicks, outcome, reason) != start) // APP-18

    val periods = (record.periods.map { it.period.toInt() } + (1..m.format.periods)).distinct().sorted()
    val last = periods.lastOrNull() ?: m.format.periods
    val whenOptions = listOf("before" to "Before kickoff") + periods.flatMap { p ->
        listOf("play:$p" to periodName(m.format, p.toLong())) + if (p < last) listOf("break:$p" to if (p == m.format.periods / 2) "Half-time" else "Break") else emptyList()
    } + listOf("after" to "After full time")
    val built = rows.map { eventOf(m, it, schemeId) }
    val valid = built.mapNotNull { it.getOrNull() }
    val score = scoreOf(valid)
    val settledTypes = settleCautions(valid).map { it.type }
    val kinds = allKinds.filter { it.first != "sinBin" || m.format.sinBins == true || rows.any { r -> r.kind == "sinBin" } }
    val sinBinSec = m.format.sinBinSec ?: 600
    val kickEvents: List<Event> = kicks.map { k -> EventPenaltyKick(`when` = "penalties", team = k.team, scored = k.scored, player = k.number.toIntOrNull()?.takeIf { it in 1..99 }) }
    val penalties = penaltiesOf(kickEvents)

    fun change(row: ResultRow, edit: (ResultRow) -> ResultRow) { rows = rows.map { if (it.key == row.key) edit(it) else it } }

    Screen(if (isNew) "Add result" else "Edit result", back = matchTitle(m),
        bottomBar = {
            FormActions(canSave = true, onSave = {
                if (built.any { it.isFailure }) {
                    problem = "Fix the goal or card marked in red first."
                    return@FormActions
                }
                problem = null
                val kept = record.events.filter {
                    it !is EventGoal && it !is EventCaution && it !is EventSecondCaution && it !is EventSendOff && it !is EventSinBin && it !is EventSecondSinBin && it !is EventPenaltyKick && it !is EventAbandonment
                }
                val abandonment: List<Event> = if (outcome == "abandoned") listOf(
                    record.events.filterIsInstance<EventAbandonment>().firstOrNull()?.copy(reason = reason) ?: EventAbandonment(`when` = "play", period = last.toLong(), reason = reason),
                ) else emptyList()
                val result = withEvents(record.copy(outcome = outcome), kept + valid + kickEvents + abandonment)
                scope.launch {
                    graph.records.save(Collections.MATCH_RECORDS, result.id, MatchRecord.serializer(), result)
                    // RES-2: a match given a result without the watch has been played.
                    if (isNew && m.status == "scheduled") graph.records.save(Collections.MATCHES, m.id, Match.serializer(), m.copy(status = if (outcome == "abandoned") "abandoned" else "played"))
                    graph.requestSync(0)
                    nav.popBackStack()
                }
            }, deleteLabel = null, onDelete = {})
        },
    ) {
        item {
            Text(
                if (isNew) "For a match refereed without the watch." else "Corrections to what the watch recorded. The watch's own recording is kept, and can be put back.",
                style = MaterialTheme.typography.bodyMedium, color = colors.muted, modifier = Modifier.padding(bottom = 12.dp),
            )
        }
        // RES-1, WEB-24: the board's scoreboard: Result and "From the goals below", the kits with the score between them.
        item {
            app.lawfive.ui.components.Board {
                app.lawfive.ui.components.BoardHead("Result", "From the goals below", Modifier.padding(bottom = 10.dp))
                app.lawfive.ui.components.KitPanels(m.home, m.away, middleWidth = 110.dp, middle = {
                    Column(Modifier.padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${score.home}–${score.away}", style = app.lawfive.ui.theme.LfType.display(46.sp, colors.onBoardStrong, 46.sp))
                        penalties?.let { Text("${it.home}–${it.away} pens", style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), color = colors.onBoardMuted) }
                    }
                })
                Box(Modifier.height(10.dp))
            }
        }
        item { SectionTitle("Goals and cards") }
        if (rows.isEmpty()) item { Text("None yet. Add each goal and card; a goal with no minute or number still counts.", style = MaterialTheme.typography.bodyMedium, color = colors.muted) }
        rows.forEachIndexed { i, row ->
            item(key = row.key) {
                val wrong = built[i].exceptionOrNull()?.message
                val settled = built[i].getOrNull()?.let { settledTypes.getOrNull(valid.indexOf(it)) }
                LfCard(Modifier.padding(bottom = 10.dp).let { if (wrong != null) it.border(2.dp, colors.redText, RoundedCornerShape(6.dp)) else it }) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            // EVT-12: a sin bin as its card with the hourglass, as on the timeline.
                            if (row.kind == "sinBin") app.lawfive.ui.components.CardShape(if (settled == "secondSinBin") app.lawfive.ui.components.CardKind.SecondSinBin else app.lawfive.ui.components.CardKind.SinBin, 13.dp, 18.dp)
                            else if (row.kind != "goal") CardMark(if (settled == "secondCaution") "second" else row.kind)
                            Choice("", row.kind, kinds.map { it.first }, { k -> kinds.firstOrNull { it.first == k }?.second ?: "" }, { k ->
                                // EVT-12: a sin bin is a player's.
                                change(row) { it.copy(kind = k ?: it.kind, code = "", who = if (k == "sinBin") "player" else it.who) }
                            }, Modifier.weight(1f))
                            TeamToggle(m, row.team) { t -> change(row) { it.copy(team = t) } }
                            androidx.compose.material3.IconButton({ rows = rows.filter { it.key != row.key } }) { PhIcon(Ph.Trash, "Remove", tint = colors.muted) }
                        }
                        val options = if (row.kind == "goal") whenOptions.filter { it.first.startsWith("play:") } else whenOptions
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Choice("When", row.whenKey, options.map { it.first }, { w -> options.firstOrNull { it.first == w }?.second ?: "" }, { w -> change(row) { it.copy(whenKey = w ?: it.whenKey) } }, Modifier.weight(1f))
                            if (row.whenKey.startsWith("play:")) Field("Minute", row.minute, { v -> change(row) { it.copy(minute = v) } }, Modifier.weight(1f), placeholder = "23 or 45+2", keyboard = KeyboardType.Text)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (row.kind != "goal" && row.kind != "sinBin") Choice("Who", row.who, whoNames.map { it.first }, { w -> whoNames.firstOrNull { it.first == w }?.second ?: "" }, { w -> change(row) { it.copy(who = w ?: "player") } }, Modifier.weight(1f))
                            if (row.kind == "goal" || row.who == "player") Field("Number", row.number, { v -> change(row) { it.copy(number = v.filter(Char::isDigit).take(2)) } }, Modifier.weight(1f), placeholder = "None", keyboard = KeyboardType.Number)
                            if (row.kind == "sinBin") WholeMinutesField("Length (min)", row.lengthSec, 1, 20, { v -> change(row) { it.copy(lengthSec = v) } }, Modifier.weight(1f))
                            if (row.kind == "goal") Choice("Type", row.goalType, goalTypes.map { it.first }, { g -> goalTypes.firstOrNull { it.first == g }?.second ?: "" }, { g -> change(row) { it.copy(goalType = g ?: "goal") } }, Modifier.weight(1f))
                        }
                        if (row.kind != "goal" && scheme != null) {
                            val codes = when {
                                settled == "secondCaution" -> listOf(scheme.secondCaution to "Second caution") + scheme.cautions.map { it.code to it.description }
                                row.kind == "caution" || row.kind == "sinBin" -> scheme.cautions.map { it.code to it.description }
                                else -> scheme.sendOffs.map { it.code to it.description }
                            }
                            Choice("Code (${scheme.name})", row.code.ifEmpty { null }, codes.map { it.first }, { c -> c?.let { code -> "$code · ${codes.firstOrNull { it.first == code }?.second ?: ""}" } ?: "None" },
                                { c -> change(row) { it.copy(code = c ?: "") } }, allowNone = "None")
                        }
                        if (settled == "secondCaution") Text("Second caution to this player: it counts as a send-off.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        if (settled == "secondSinBin") Text("Second sin bin for this player: it counts as a send-off.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                        wrong?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
                    }
                }
            }
        }
        item {
            @OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
            androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((kind, label) in kinds) SecondaryButton(label, { rows = rows + ResultRow(kind = kind, whenKey = "play:${periods.firstOrNull() ?: 1}", lengthSec = sinBinSec) }, icon = Ph.Plus)
            }
        }
        item { SectionTitle("Penalties") }
        item {
            LfCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (kicks.isEmpty()) Text("Only for a match decided by a shoot-out.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                    kicks.forEachIndexed { i, k ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${i + 1}", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                            TeamToggle(m, k.team) { t -> kicks = kicks.map { if (it.key == k.key) it.copy(team = t) else it } }
                            Choice("", k.scored, listOf(true, false), { if (it == true) "Scored" else "Missed" }, { s -> kicks = kicks.map { if (it.key == k.key) it.copy(scored = s ?: true) else it } }, Modifier.weight(1f))
                            Field("No.", k.number, { v -> kicks = kicks.map { if (it.key == k.key) it.copy(number = v.filter(Char::isDigit).take(2)) else it } }, Modifier.weight(0.7f), keyboard = KeyboardType.Number)
                            androidx.compose.material3.IconButton({ kicks = kicks.filter { it.key != k.key } }) { PhIcon(Ph.Trash, "Remove", tint = colors.muted) }
                        }
                    }
                    SecondaryButton("Kick", { kicks = kicks + KickRow(team = if (kicks.size % 2 == 0) "home" else "away", scored = true) }, icon = Ph.Plus)
                }
            }
        }
        item { SectionTitle("Outcome") }
        item {
            LfCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Choice("The match", outcome, listOf("completed", "abandoned"), { if (it == "abandoned") "Abandoned" else "Played to full time" }, { outcome = it ?: "completed" })
                    if (outcome == "abandoned") Choice("Why", reason, reasons.map { it.first }, { r -> reasons.firstOrNull { it.first == r }?.second ?: "" }, { reason = it ?: "weather" })
                }
            }
        }
        problem?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.redText, modifier = Modifier.padding(top = 10.dp)) } }
    }
}

/** A card's color, as on the timeline: yellow, red, or both for a second caution. */
@Composable
private fun CardMark(kind: String) {
    val shape = RoundedCornerShape(2.dp)
    val base = Modifier.size(11.dp, 15.dp).clip(shape)
    when (kind) {
        "second" -> Box(base.background(Brush.linearGradient(0.5f to colors.yellow, 0.5f to colors.red)))
        "sendOff" -> Box(base.background(colors.red))
        else -> Box(base.background(colors.yellow))
    }
}

/** Home or away, the other team faded so which it is reads at a glance. */
@Composable
private fun TeamToggle(m: Match, team: String, onChange: (String) -> Unit) {
    Row(Modifier.clip(RoundedCornerShape(10.dp)).background(colors.surface2).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (side in listOf("home", "away")) {
            val on = team == side
            Box(
                Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) colors.surface else colors.surface2).clickable { onChange(side) }.padding(horizontal = 6.dp, vertical = 4.dp).alpha(if (on) 1f else 0.35f),
            ) { TeamBadge(if (side == "home") m.home else m.away, if (side == "home") m.away else m.home, side == "home") }
        }
    }
}
