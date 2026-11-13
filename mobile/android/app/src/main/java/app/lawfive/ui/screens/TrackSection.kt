package app.lawfive.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lawfive.data.PitchFrame
import app.lawfive.data.ReplayEvent
import app.lawfive.data.TrackReplay
import app.lawfive.data.instantMs
import app.lawfive.data.json
import app.lawfive.schema.EventCaution
import app.lawfive.schema.EventGoal
import app.lawfive.schema.EventSecondCaution
import app.lawfive.schema.EventSecondSinBin
import app.lawfive.schema.EventSendOff
import app.lawfive.schema.EventSinBin
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchTrack
import app.lawfive.schema.PitchOutline
import app.lawfive.schema.Position
import app.lawfive.schema.TrackSummary
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.MintBar
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.SlabFigure
import app.lawfive.ui.components.SlabLabel
import app.lawfive.ui.components.SlabRow
import app.lawfive.ui.components.MapHandle
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.Segmented
import app.lawfive.ui.components.TrackMap
import app.lawfive.ui.formatDistance
import app.lawfive.ui.formatSpeed
import app.lawfive.ui.sprintsCaption
import app.lawfive.ui.matchMinute
import app.lawfive.ui.parseColour
import app.lawfive.ui.periodName
import app.lawfive.ui.teamAlias
import app.lawfive.ui.teamName
import app.lawfive.ui.textOn
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.withFrameMillis
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

// A match's track on the phone (TRK-14), as the web's: the route and the pitch on a map, the replay with
// its clock, score and goals and cards, adjusting the pitch by hand, and the heart rate chart and zones.

private val speeds = listOf(10, 30, 60, 120)
internal val zonesLight = listOf(0xFFF29A6C, 0xFFEA7440, 0xFFD0561F, 0xFFA8441A, 0xFF7C3112).map { Color(it) }
internal val zonesDark = listOf(0xFF8A3311, 0xFFB8481A, 0xFFD95926, 0xFFEC8257, 0xFFF4A77F).map { Color(it) }

/** The record's goals and cards in track time; on a clock that stops (TMR-15) each goes after the time it stood still before it. */
private fun eventsOf(record: MatchRecord, spans: List<app.lawfive.data.Span>, start: Long): List<ReplayEvent> {
    val stops = app.lawfive.data.clockStopsOf(record)
    return record.events.mapNotNull { e ->
    data class Parts(val type: String, val team: String, val period: Long?, val sec: Long?, val at: String?, val player: Long?, val goalType: String?, val whenText: String, val lengthSec: Long? = null)
    val p = when (e) {
        is EventGoal -> Parts("goal", e.team, e.period, e.periodSec, e.at, e.player?.toLong(), e.goalType, e.`when`)
        is EventCaution -> Parts("caution", e.team, e.period, e.periodSec, e.at, null, null, e.`when`)
        is EventSecondCaution -> Parts("secondCaution", e.team, e.period, e.periodSec, e.at, null, null, e.`when`)
        is EventSendOff -> Parts("sendOff", e.team, e.period, e.periodSec, e.at, null, null, e.`when`)
        // EVT-12: sin bins too, as the website's replay.ts.
        is EventSinBin -> Parts("sinBin", e.team, e.period, e.periodSec, e.at, null, null, e.`when`, e.lengthSec)
        is EventSecondSinBin -> Parts("secondSinBin", e.team, e.period, e.periodSec, e.at, null, null, e.`when`)
        else -> return@mapNotNull null
    }
    if (p.whenText != "play") return@mapNotNull null
    // TMR-13: after a suspension, in the period's later stretch.
    val inPlay = p.sec?.let { app.lawfive.data.trackTimeOf(spans, p.period, app.lawfive.data.elapsedOfClock(stops[p.period], it)) }
    val t = inPlay ?: p.at?.let { instantMs(it) - start } ?: return@mapNotNull null
    ReplayEvent(p.type, p.team, t, p.period ?: 0, p.sec, p.player, p.goalType, p.lengthSec)
    }
}

/** The match's track, once it's loaded; `reload` after the pitch changes, as the heatmap follows it. */
fun LazyListScope.trackSection(m: Match, record: MatchRecord, body: JsonObject, unit: String, reload: () -> Unit) {
    val track = runCatching { body["track"]?.let { json.decodeFromJsonElement<MatchTrack>(it) } }.getOrNull() ?: return
    val summary = runCatching { body["summary"]?.let { json.decodeFromJsonElement<TrackSummary>(it) } }.getOrNull() ?: return
    val outline = runCatching { body["pitch"]?.let { json.decodeFromJsonElement<PitchOutline>(it) } }.getOrNull()
    if (track.gps != null) {
        item(key = "track-map") { MapAndReplay(m, record, track, outline, unit, summary.sprintKph, reload) }
    }
    if (track.heartRate != null && (track.heartRate?.t?.size ?: 0) > 1) {
        item(key = "track-hr") { HeartRateCard(m, record, track, summary) }
    }
}

/**
 * WEB-28: the track's figures as the website's The running: on a slab cut on the diagonal, tagged The
 * periods (or Whole recording without period start times), the first (the distance) huge over its
 * mint bar, the rest as rows, each label beside its figure, as the website's at a phone's width.
 */
@Composable
fun TrackFigures(t: TrackSummary, unit: String) {
    data class Figure(val label: String, val value: String, val caption: String? = null)
    val figures = listOfNotNull(
        t.total.distanceM?.let { Figure("Distance", formatDistance(it, unit)) },
        t.total.topSpeedMps?.let { Figure("Top speed", formatSpeed(it, unit)) },
        t.total.sprints?.let { Figure("Sprints", "$it", sprintsCaption(t.sprintKph, unit)) },
        t.total.avgBpm?.let { Figure("Average heart rate", "$it bpm") },
        t.total.maxBpm?.let { Figure("Highest heart rate", "$it bpm") },
    )
    val lead = figures.firstOrNull() ?: return
    Slab("The running", tag = if (t.covers == "track") "Whole recording" else "Playing time only", icon = Ph.Sprint, cut = true) {
        Column(Modifier.semantics(mergeDescendants = true) {}) {
            SlabLabel(lead.label)
            SlabFigure(lead.value, 72.dp, Modifier.padding(top = 10.dp))
        }
        MintBar(Modifier.padding(top = 12.dp, bottom = 18.dp))
        for (f in figures.drop(1)) SlabRow(f.label, f.value, caption = f.caption)
        if (t.covers == "track") {
            Text(
                "This match report has no period start times, so the figures cover the whole recording, breaks included.",
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = colors.muted,
                modifier = Modifier.padding(top = if (figures.size > 1) 8.dp else 4.dp),
            )
        }
    }
}

private fun frameOf(p: PitchOutline): PitchFrame? = runCatching {
    val corners = p.corners.map { json.decodeFromJsonElement<Position>(it) }
    PitchFrame.from(corners[0].lat, corners[0].lon, corners[1].lat, corners[1].lon, p.centre.lat, p.centre.lon)
}.getOrNull()

/**
 * TRK-9: who attacked from each end of the heatmap, as the website's TrackSection works it out from
 * the track the server sent (its pitch, and for an assistant where they were in the periods): for the
 * match, a row for each way round; for one period of normal time, its row; none for extra time, or
 * without the kickoff direction from the watch.
 */
fun heatEndsOf(m: Match, record: MatchRecord, body: JsonObject?): (Int?) -> List<HeatEnds> {
    val none: (Int?) -> List<HeatEnds> = { emptyList() }
    val direction = record.kickoffDirection ?: return none
    val outline = runCatching { body?.get("pitch")?.let { json.decodeFromJsonElement<PitchOutline>(it) } }.getOrNull() ?: return none
    val frame = frameOf(outline) ?: return none
    val assistant = m.role == "ar1" || m.role == "ar2"
    val across = if (!assistant) emptyList() else runCatching {
        val track = body?.get("track")?.let { json.decodeFromJsonElement<MatchTrack>(it) }
        val gps = track?.gps ?: return@runCatching emptyList()
        val start = instantMs(track.start)
        // The periods' windows on the track's clock, as schema's periodWindowsOf, without time play was suspended (TMR-13); the whole track without start times.
        val windows = app.lawfive.data.playSpans(record.periods, start).map { it.from to it.to }
        gps.t.indices.filter { i -> windows.isEmpty() || windows.any { (from, to) -> gps.t[i] in from..to } }.map { i -> frame.toPitch(gps.lat[i], gps.lon[i]).second }
    }.getOrDefault(emptyList())
    val turned = app.lawfive.data.pitchTurned(m.role, across, direction.bearingDeg, frame.ux, frame.uy)
    val periods = m.format.periods
    val ends = app.lawfive.data.pitchEnds(periods, direction.team, direction.bearingDeg, frame.ux, frame.uy, turned)
    fun team(side: String) = if (side == "home") m.home else m.away
    return { period ->
        val rows = if (period == null) app.lawfive.data.endsByWayRound(ends, periods)
            else ends.filter { it.period == period }.map { app.lawfive.data.EndsRow(app.lawfive.data.endsLabel(it.period, periods), it.left, it.right) }
        rows.map { HeatEnds(it.label, team(it.left), it.left == "home", team(it.right), it.right == "home") }
    }
}

private fun pitchLines(f: PitchFrame) = listOf(f.outline().let { it + it.first() }, f.halfway())

@Composable
private fun MapAndReplay(m: Match, record: MatchRecord, track: MatchTrack, outline: PitchOutline?, unit: String, sprintKph: Double, reload: () -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val replay = remember(track, record) {
        val start = instantMs(track.start)
        TrackReplay(track, record.periods, eventsOf(record, app.lawfive.data.playSpans(record.periods, start), start), sprintKph, app.lawfive.data.clockStopsOf(record))
    }
    val routes = remember(replay) { replay.routes() }
    val speedLines = remember(replay) { replay.speedStretches() }
    var position by remember(replay) { mutableStateOf<Long?>(null) }
    var playing by remember(replay) { mutableStateOf(false) }
    var speed by remember { mutableIntStateOf(30) }
    var holdUntil by remember { mutableLongStateOf(0L) }
    var banner by remember { mutableStateOf<ReplayEvent?>(null) }
    // TRK-9: adjusting the pitch on the map, then saving it or going back to the one found.
    val saved = remember(outline) { outline?.let(::frameOf) }
    var adjusting by remember(outline) { mutableStateOf<PitchFrame?>(null) }
    var saving by remember { mutableStateOf(false) }

    LaunchedEffect(playing, speed, replay) {
        if (!playing) return@LaunchedEffect
        var last = withFrameMillis { it }
        while (true) {
            val now = withFrameMillis { it }
            val ms = min(now - last, 250)
            last = now
            if (now < holdUntil) continue
            banner = null
            val from = position ?: 0
            val next = min(from + ms * speed, replay.length)
            // Reaching a goal or card: stop on it, and hold there with its banner.
            val stop = replay.stopBetween(from, next)
            if (stop != null) {
                position = replay.positionAt(stop.t)
                banner = stop
                holdUntil = now + if (stop.goal) TrackReplay.HOLD_GOAL_MS else TrackReplay.HOLD_CARD_MS
            } else {
                position = next
                if (next >= replay.length) {
                    playing = false
                    return@LaunchedEffect
                }
            }
        }
    }

    val cursor = position?.let(replay::trackTimeAt)
    val moment = cursor?.let(replay::at)
    val shownPitch = adjusting ?: saved
    SectionTitle("Where you went")
    LfCard {
        Box {
            TrackMap(
                routes = routes,
                pitch = shownPitch?.let(::pitchLines) ?: emptyList(),
                trail = if (speedLines.isEmpty()) cursor?.let(replay::trail) ?: emptyList() else emptyList(),
                speed = speedLines,
                speedTrail = cursor?.let(replay::trailStretches) ?: emptyList(),
                marker = moment?.takeIf { it.lat != null }?.let { it.lat!! to it.lon!! },
                pitchColor = if (adjusting != null) colors.brand else colors.text,
                handles = adjusting?.let { f ->
                    val end = f.fromPitch(f.lengthM / 2, 0.0)
                    val side = f.fromPitch(0.0, f.widthM / 2)
                    listOf(MapHandle("move", f.centreLat, f.centreLon, true), MapHandle("end", end.first, end.second), MapHandle("side", side.first, side.second))
                } ?: emptyList(),
                onHandle = { id, lat, lon ->
                    adjusting = adjusting?.let { f ->
                        when (id) {
                            "move" -> f.movedTo(lat, lon)
                            "end" -> f.withEnd(lat, lon)
                            else -> f.withSide(lat, lon)
                        }
                    }
                },
            )
            if (cursor != null && adjusting == null) {
                val score = replay.scoreAt(cursor)
                val span = replay.spanAt(cursor)
                Column(Modifier.padding(8.dp).clip(RoundedCornerShape(8.dp)).background(colors.surface.copy(alpha = 0.92f)).padding(horizontal = 10.dp, vertical = 6.dp)) {
                    span?.let { Text("${matchMinute(m.format, it.period, replay.clockSecAt(it, cursor))} · ${periodName(m.format, it.period)}", style = MaterialTheme.typography.labelSmall, color = colors.muted) }
                    Text("${teamAlias(m.home, m.away, true)} ${score.first}–${score.second} ${teamAlias(m.away, m.home, false)}", style = MaterialTheme.typography.titleSmall, color = colors.text)
                    val parts = listOfNotNull(moment?.bpm?.let { "$it bpm" }, moment?.speedMps?.let { formatSpeed(it, unit) })
                    if (parts.isNotEmpty()) Text(parts.joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = colors.muted)
                    if (moment?.noGps == true) Text("No GPS here", style = MaterialTheme.typography.labelSmall, color = colors.muted)
                }
                banner?.let { e -> Banner(m, replay, e, Modifier.align(Alignment.BottomCenter).padding(10.dp)) }
            }
        }
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (speedLines.isNotEmpty() && adjusting == null) SpeedLegend()
            if (adjusting != null) {
                Text("Drag the middle to move the pitch, the end of a goal line to turn it and change its length, the side to change its width.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PrimaryButton(if (saving) "Saving…" else "Save pitch", {
                        val f = adjusting ?: return@PrimaryButton
                        saving = true
                        scope.launch {
                            val c = f.fromPitch(-f.lengthM / 2, -f.widthM / 2)
                            val d = f.fromPitch(f.lengthM / 2, -f.widthM / 2)
                            val sent = runCatching {
                                graph.api.call("PUT", "/v1/match-records/${record.id}/track/pitch", buildJsonObject {
                                    putJsonArray("corners") {
                                        add(json.encodeToJsonElement(Position(c.first, c.second)))
                                        add(json.encodeToJsonElement(Position(d.first, d.second)))
                                    }
                                    put("centre", json.encodeToJsonElement(Position(f.centreLat, f.centreLon)))
                                })
                            }
                            saving = false
                            if (sent.isSuccess) {
                                adjusting = null
                                reload()
                            }
                        }
                    }, enabled = !saving)
                    SecondaryButton("Cancel", { adjusting = null })
                    if (outline?.by == "referee") {
                        SecondaryButton("Use the one found", {
                            scope.launch {
                                runCatching { graph.api.call("DELETE", "/v1/match-records/${record.id}/track/pitch") }
                                adjusting = null
                                reload()
                            }
                        })
                    }
                }
            } else {
                ReplayControls(replay, position, playing, speed, mapOf("home" to parseColour(m.home.colour), "away" to parseColour(m.away.colour)), onPlay = {
                    if (!playing && (position ?: 0) >= replay.length) position = 0
                    playing = !playing
                    if (position == null) position = 0
                }, onSeek = {
                    position = it
                    banner = null
                    holdUntil = 0
                }, onSpeed = { speed = it }, onStop = {
                    playing = false
                    position = null
                    banner = null
                }, describe = { e -> eventWords(m, replay, e) })
                if (saved != null || routes.isNotEmpty()) {
                    val first = routes.firstOrNull()?.firstOrNull()
                    val start = saved ?: first?.let { PitchFrame.of(it.first, it.second, 0.0, 100.0, 64.0) }
                    if (start != null) {
                        Row(
                            Modifier.clip(RoundedCornerShape(8.dp)).pointerInput(start) { detectTapGestures { playing = false; position = null; adjusting = start } }.padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            PhIcon(Ph.Pin, size = 14.dp, tint = colors.brandStrong)
                            Text(if (saved == null) "Mark the pitch on the map" else "Adjust the pitch on the map", style = MaterialTheme.typography.labelMedium, color = colors.brandStrong)
                        }
                    }
                }
            }
        }
    }
}

private fun eventWords(m: Match, replay: TrackReplay, e: ReplayEvent): String {
    val team = teamName(if (e.team == "home") m.home else m.away, e.team == "home")
    val what = when (e.type) {
        "goal" -> "Goal"
        "caution" -> "Yellow card"
        "secondCaution" -> "Second yellow"
        "sinBin" -> "Sin bin"
        "secondSinBin" -> "Second sin bin"
        else -> "Red card"
    }
    val minute = replay.spanAt(e.t)?.let { matchMinute(m.format, it.period, replay.clockSecAt(it, e.t)) }
    return listOfNotNull(minute, what, team).joinToString(" · ")
}

@Composable
private fun Banner(m: Match, replay: TrackReplay, e: ReplayEvent, modifier: Modifier) {
    // A goal in the team's color; a team without one gets the page's own box, with a brand edge.
    val kit = if (e.goal) parseColour((if (e.team == "home") m.home else m.away).colour) else null
    val fill = when {
        e.goal -> kit ?: colors.surface
        e.yellow -> colors.yellow
        else -> colors.red
    }
    val ink = when {
        kit != null -> textOn(kit)
        e.goal -> colors.text
        e.yellow -> Color.Black
        else -> Color.White
    }
    val score = replay.scoreAt(e.t)
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).background(fill)
            // So a white or map-colored kit still has an edge, and the plain box looks like a goal.
            .then(if (e.goal) Modifier.border(if (kit == null) 2.dp else 1.dp, if (kit == null) colors.brand else ink.copy(alpha = 0.25f), shape) else Modifier)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        val title = when (e.type) {
            "goal" -> when (e.goalType) {
                "penalty" -> "Goal · Penalty"
                "ownGoal" -> "Goal · Own goal"
                "directFreeKick" -> "Goal · Free kick"
                else -> "Goal"
            }
            "caution" -> "Yellow card"
            "secondCaution" -> "Second yellow"
            "sinBin" -> "Sin bin"
            "secondSinBin" -> "Second sin bin"
            else -> "Red card"
        }
        Text(title, color = ink, fontFamily = BarlowCondensed, fontWeight = FontWeight.Bold, fontSize = 22.sp)
        val team = teamName(if (e.team == "home") m.home else m.away, e.team == "home")
        // EVT-12: how long a sin bin is; a second sin bin is a send-off, so none.
        val length = if (e.type == "sinBin") e.lengthSec?.let { "${app.lawfive.ui.minutes(it.toInt())} min" } else null
        Text(listOfNotNull(team, e.player?.let { "#$it" }, if (e.goal) "${teamAlias(m.home, m.away, true)} ${score.first}–${score.second} ${teamAlias(m.away, m.home, false)}" else null, length).joinToString(" · "), color = ink, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun SpeedLegend() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("Walking", style = MaterialTheme.typography.labelSmall, color = colors.muted)
        colors.speed.forEach { Box(Modifier.width(18.dp).height(5.dp).background(it, androidx.compose.foundation.shape.RoundedCornerShape(2.dp))) }
        Text("Sprinting", style = MaterialTheme.typography.labelSmall, color = colors.muted)
    }
}

@Composable
private fun ReplayControls(replay: TrackReplay, position: Long?, playing: Boolean, speed: Int, kits: Map<String, androidx.compose.ui.graphics.Color?>, onPlay: () -> Unit, onSeek: (Long) -> Unit, onSpeed: (Int) -> Unit, onStop: () -> Unit, describe: (ReplayEvent) -> String) {
    val length = max(replay.length, 1).toFloat()
    val eventColors = mapOf("goal" to colors.brand, "caution" to colors.yellow, "secondCaution" to colors.red, "sendOff" to colors.red, "sinBin" to colors.yellow, "secondSinBin" to colors.red)
    val sinBinWaist = colors.onYellow
    val muted = colors.border
    val goalRing = colors.text
    val goalGreen = colors.brand
    val density = LocalDensity.current
    var picked by remember { mutableStateOf<ReplayEvent?>(null) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        if (position == null) {
            PrimaryButton("Replay", onPlay, icon = Ph.Play)
        } else {
            SecondaryButton(if (playing) "Pause" else "Play", onPlay, icon = if (playing) Ph.Pause else Ph.Play)
        }
        Column(Modifier.weight(1f)) {
            // The goals and cards above the scrubber: a tap goes to the nearest.
            Canvas(
                Modifier.fillMaxWidth().height(14.dp).pointerInput(replay) {
                    detectTapGestures { at ->
                        val fraction = at.x / size.width
                        val near = replay.events.minByOrNull { abs(replay.positionAt(it.t) / length - fraction) }
                        if (near != null && abs(replay.positionAt(near.t) / length - fraction) * size.width < with(density) { 18.dp.toPx() }) {
                            picked = near
                            onSeek(replay.positionAt(near.t))
                        }
                    }
                },
            ) {
                replay.boundaries.forEach { b ->
                    val x = b / length * size.width
                    drawLine(muted, Offset(x, 0f), Offset(x, size.height), 2f)
                }
                replay.events.forEach { e ->
                    val x = replay.positionAt(e.t) / length * size.width
                    // TRK-15: a goal is round, in its team's color with a ring for white and black kits; a card is upright.
                    if (e.goal) {
                        drawCircle(goalRing, 5.5.dp.toPx(), Offset(x, 7.dp.toPx()))
                        drawCircle(kits[e.team] ?: goalGreen, 4.dp.toPx(), Offset(x, 7.dp.toPx()))
                    } else {
                        drawRoundRect(eventColors[e.type] ?: muted, Offset(x - 3.dp.toPx(), 2.dp.toPx()), Size(6.dp.toPx(), 10.dp.toPx()), CornerRadius(2.dp.toPx()))
                        // EVT-12: a sin bin is the yellow mark with a dark waist, as its card carries the hourglass (the website's .tick-sinBin).
                        if (e.type == "sinBin") drawRect(sinBinWaist, Offset(x - 3.dp.toPx(), 5.8.dp.toPx()), Size(6.dp.toPx(), 2.4.dp.toPx()))
                    }
                }
            }
            Slider(
                value = (position ?: 0).toFloat(), onValueChange = { picked = null; onSeek(it.toLong()) }, valueRange = 0f..length,
                colors = SliderDefaults.colors(thumbColor = colors.brand, activeTrackColor = colors.brand, inactiveTrackColor = colors.surface2),
                modifier = Modifier.height(28.dp),
            )
        }
    }
    picked?.let { Text(describe(it), style = MaterialTheme.typography.bodySmall, color = colors.muted) }
    // The hint on a line of its own, so the speeds never squeeze it into a column at large text sizes.
    if (position == null) Text("Plays the periods, skipping breaks", style = MaterialTheme.typography.bodySmall, color = colors.muted)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Spacer(Modifier.weight(1f))
        Segmented(speeds.map { it to "$it×" }, speed, onSpeed)
        if (position != null) SecondaryButton("Stop", onStop)
    }
}

@Composable
private fun HeartRateCard(m: Match, record: MatchRecord, track: MatchTrack, summary: TrackSummary) {
    val hr = track.heartRate ?: return
    val start = remember(track) { instantMs(track.start) }
    // TMR-13: a period suspended part way is two bands.
    val windows = remember(record, start) { app.lawfive.data.playSpans(record.periods, start) }
    // TMR-15: a stopping clock's minute stands still through its stops.
    val clockStops = remember(record) { app.lawfive.data.clockStopsOf(record) }
    val x0 = max(hr.t.first(), (windows.firstOrNull()?.from ?: hr.t.first()) - 60_000)
    val x1 = min(hr.t.last(), (windows.lastOrNull()?.to ?: hr.t.last()) + 60_000)
    // A point every so often: each the average of the readings in its slice of time.
    val points = remember(hr, x0, x1) {
        val n = 160
        val slice = max(1.0, (x1 - x0).toDouble() / n)
        val sums = DoubleArray(n)
        val counts = IntArray(n)
        hr.t.forEachIndexed { i, t ->
            val k = floor((t - x0) / slice).toInt()
            if (k in 0 until n) {
                sums[k] += hr.bpm[i].toDouble()
                counts[k]++
            }
        }
        (0 until n).map { k -> if (counts[k] > 0) (x0 + (k + 0.5) * slice) to sums[k] / counts[k] else null }
    }
    val shown = points.filterNotNull().map { it.second }
    if (shown.isEmpty() || x1 <= x0) return
    val lo = max(40.0, floor((shown.min() - 5) / 10) * 10)
    val hi = ceil((shown.max() + 5) / 10) * 10
    val step = if (hi - lo > 60) 20 else 10
    var at by remember { mutableStateOf<Int?>(null) }
    val line = if (colors.dark) zonesDark[3] else zonesLight[2]
    val grid = colors.border
    val band = colors.surface2
    val ink = colors.brand
    SectionTitle("Heart rate")
    LfCard {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            val point = at?.let { points.getOrNull(it) }
            val time = point?.first?.toLong()
            val period = time?.let { t -> windows.firstOrNull { t in it.from..it.to } }
            Text(
                if (point != null) "${point.second.toInt()} bpm" + (period?.let { " · ${matchMinute(m.format, it.period, app.lawfive.data.clockOfElapsed(clockStops[it.period], (time - it.from + it.played) / 1000))} · ${periodName(m.format, it.period)}" } ?: "")
                else "Touch the chart to read it",
                style = MaterialTheme.typography.bodySmall, color = colors.muted,
            )
            Row {
                Column(Modifier.width(30.dp).height(150.dp), verticalArrangement = Arrangement.SpaceBetween) {
                    var v = hi.toInt()
                    while (v >= lo.toInt()) {
                        Text("$v", style = MaterialTheme.typography.labelSmall, color = colors.muted)
                        v -= step
                    }
                }
                Canvas(
                    Modifier.weight(1f).height(150.dp).pointerInput(points) {
                        detectDragGestures(
                            onDragStart = { o -> at = (o.x / size.width * points.size).toInt().coerceIn(0, points.size - 1) },
                            onDragEnd = { at = null }, onDragCancel = { at = null },
                        ) { change, _ -> at = (change.position.x / size.width * points.size).toInt().coerceIn(0, points.size - 1) }
                    },
                ) {
                    val x = { t: Double -> ((t - x0) / (x1 - x0)).toFloat() * size.width }
                    val y = { b: Double -> ((1 - (b - lo) / (hi - lo)) * size.height).toFloat() }
                    windows.forEach { w -> drawRect(band, Offset(x(w.from.toDouble()), 0f), Size(x(w.to.toDouble()) - x(w.from.toDouble()), size.height)) }
                    var v = hi
                    while (v >= lo) {
                        drawLine(grid, Offset(0f, y(v)), Offset(size.width, y(v)), 1f)
                        v -= step
                    }
                    val path = Path()
                    var pen = false
                    points.forEach { p ->
                        if (p == null) {
                            pen = false
                        } else {
                            if (pen) path.lineTo(x(p.first), y(p.second)) else path.moveTo(x(p.first), y(p.second))
                            pen = true
                        }
                    }
                    drawPath(path, line, style = Stroke(1.5.dp.toPx()))
                    point?.let {
                        drawLine(ink, Offset(x(it.first), 0f), Offset(x(it.first), size.height), 2f)
                        drawCircle(ink, 4.dp.toPx(), Offset(x(it.first), y(it.second)))
                    }
                }
            }
            summary.total.zones?.takeIf { z -> z.any { it.sec > 0 } }?.let { zones ->
                val total = zones.sumOf { it.sec }
                val ramp = if (colors.dark) zonesDark else zonesLight
                Text("Time in each zone", style = MaterialTheme.typography.labelMedium, color = colors.text)
                Row(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp))) {
                    zones.forEachIndexed { i, z -> if (z.sec > 0) Box(Modifier.weight((z.sec / total).toFloat()).fillMaxHeight().background(ramp[i % ramp.size])) }
                }
                zones.forEachIndexed { i, z ->
                    val to = zones.getOrNull(i + 1)?.fromBpm?.let { "–${it - 1} bpm" } ?: " bpm and up"
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(RoundedCornerShape(2.dp)).background(ramp[i % ramp.size]))
                        Spacer(Modifier.width(8.dp))
                        Text("Zone ${z.zone}", style = MaterialTheme.typography.bodySmall, color = colors.text)
                        Text(" ${z.fromBpm}$to", style = MaterialTheme.typography.bodySmall, color = colors.muted, modifier = Modifier.weight(1f))
                        Text(if (z.sec >= 60) "${(z.sec / 60).toInt()} min" else "${z.sec.toInt()} s", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                    }
                }
            }
        }
    }
}
