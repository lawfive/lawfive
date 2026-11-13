package app.lawfive.wear

import android.content.Context
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** How many finished matches History keeps. */
const val HISTORY_KEPT = 30

// The app's one state (WCH-3): the screens and the service that runs the clocks share it.
object AppState {
    private lateinit var store: Store
    private lateinit var server: Server
    private lateinit var context: Context
    private lateinit var track: TrackLog
    /** Goes up each time the app comes to the front, so what the system allows is read again (WCH-7). */
    var resumes by mutableStateOf(0)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    var saved by mutableStateOf(Saved())
        private set
    var syncing by mutableStateOf(false)
        private set
    var syncProblem by mutableStateOf<String?>(null)
        private set
    // UI-26: the sync screen: how many matches this sync is sending, how many have gone, and whether
    // it's up. The home and full-time screens say when it may come up.
    var syncTotal by mutableStateOf(0)
    var syncSent by mutableStateOf(0)
    var syncScreen by mutableStateOf(false)
    var screenFree by mutableStateOf(false)
    private var syncScreenShown by mutableStateOf(false)
    /** Matches are going, or went without the screen getting a chance to say so, and it hasn't come up for this sync yet. */
    val wantsSyncScreen get() = !syncScreenShown && syncTotal > 0 && (syncing || syncProblem == null)

    fun showSyncScreenForTesting(what: String) {
        syncTotal = 3
        syncSent = what.toIntOrNull() ?: 1
        syncing = what.toIntOrNull()?.let { it < 3 } ?: false
        syncProblem = if (what == "stopped") "Can't reach the server" else null
        syncScreen = true
    }

    fun openSyncScreen() {
        syncScreenShown = true
        syncScreen = true
    }
    /** Goes up whenever the match changes in place, so the screens draw it again. */
    var revision by mutableStateOf(0)
        private set

    val linked get() = saved.token != null
    val match get() = saved.match
    val serverUrl get() = saved.server ?: BuildConfig.DEFAULT_SERVER

    fun start(context: Context) {
        if (::store.isInitialized) return
        store = Store(context.applicationContext)
        server = Server { serverUrl }
        this.context = context.applicationContext
        track = TrackLog(context.applicationContext)
        saved = store.load()
        // EVT-12: the sin bins waiting for "can return" are the match's own events again.
        saved.match?.restored()
        battery = { (context.getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager)?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 } }
        // DIAG-1: a match already running means the app went away mid-match.
        saved.match?.let { if (it.phase != Phase.Done && it.startedAt.isNotEmpty()) it.restarts += 1 }
        // TMR-13, ACT-2: a match that comes back suspended keeps its exercise paused until Resume.
        if (saved.match?.phase == Phase.Suspended) Workout.holdPaused(this.context)
        sendSignOuts()
    }

    fun update(change: (Saved) -> Saved) {
        saved = change(saved)
        store.save(saved)
    }

    /** A change to the match in progress, saved at once (TMR-8). */
    fun changeMatch(change: Match.() -> Unit) {
        val m = saved.match ?: return
        val before = m.phase
        val wasPlayed = m.startedAt.isNotEmpty()
        m.change()
        revision++
        store.save(saved)
        // PRE-6: Restart match goes back to the kickoff, and the recording so far goes, as on Garmin.
        if (wasPlayed && m.startedAt.isEmpty()) {
            Workout.end()
            track.discard(m.created)
        }
        follow(m)
        if (before != Phase.Done && m.phase == Phase.Done) {
            // SYNC-7: the distance, before the exercise ends.
            Workout.distance?.let { m.distanceM = it }
            Workout.end()
            if (m.recordTrack) track.finish(m.created)?.let(::queueTrack)
            matchFinished(m)
        } else if (m.phase == Phase.Done) refreshFinished(m)
    }

    // ---- Recording (WCH-7, TRK-7) ----

    /** The exercise runs while a period is played, and pauses between them and while play is suspended (ACT-2, TMR-13). */
    private fun follow(m: Match) {
        when (m.phase) {
            Phase.Running, Phase.Golden -> {
                Workout.run(context)
                if (m.recordTrack) track.begin(m.created, System.currentTimeMillis())
            }
            Phase.Break, Phase.NextKickoff, Phase.Decide, Phase.Penalties, Phase.Suspended -> Workout.pause()
            else -> Unit
        }
    }

    /** Newest last; beyond 3, the oldest goes with its chunks, as on Garmin. */
    private fun queueTrack(finished: TrackUpload) = update { s ->
        val queued = (s.tracks.filter { it.created != finished.created } + finished).toMutableList()
        while (queued.size > 3) queued.removeAt(0).let { track.delete(it.created, it.next, it.count) }
        s.copy(tracks = queued)
    }

    /** Every second, from the service: saved only when something changed, as most ticks change nothing. */
    fun tickMatch(now: Long): Alert? {
        val m = saved.match ?: return null
        // VIB-1: full time's one vibration with stoppage tracked is saved, so it comes once, and so is whether it repeats.
        val before = listOf(m.breakDue, m.scheduledBreakDone, m.breakEnd, m.breakEndAlerted, m.stoppageStart, m.lightningAlerted, m.sinBinReturns.size, m.fullTimeAcked, m.fullTimeRepeats)
        val alert = m.tick(now)
        // TRK-7: a sample a second while play goes on.
        if (m.recordTrack && (m.phase == Phase.Running || m.phase == Phase.Golden)) {
            track.sample(m.created, now, Workout.takeFix(), Workout.heartRate)?.let { m.noteGps(it, now) }
        }
        if (before != listOf(m.breakDue, m.scheduledBreakDone, m.breakEnd, m.breakEndAlerted, m.stoppageStart, m.lightningAlerted, m.sinBinReturns.size, m.fullTimeAcked, m.fullTimeRepeats)) {
            revision++
            store.save(saved)
        }
        return alert
    }

    fun beginMatch(setup: MatchSetup) {
        val s = saved
        val m = Match(
            // SET-8: the names as they are now, kept with the match.
            setup.copy(stoppageLabel = s.stoppageLabel, breakLabel = s.breakLabel), created = System.currentTimeMillis() / 1000,
            vibeFullTime = s.vibeFullTime, vibeBreak = s.vibeBreak, vibeStoppage = s.vibeStoppage, vibeAdded = s.vibeAdded, vibeSinBin = s.vibeSinBin,
            recordTrack = s.recordTrack,
            // EVT-14: the planned match's scheme, else the account's (a quick or created match), else IFAB's.
            misconductScheme = Misconduct.scheme(setup.misconductScheme ?: s.misconductScheme),
        )
        update { it.copy(match = m, lastFormat = setup.format()) }
    }

    // ---- Create match (SET-9, SET-13, SET-14): the match being set up, not kept ----

    var draft by mutableStateOf(MatchSetup())
    var sameAsLast by mutableStateOf(false)

    /** A new Create match: the last match's format with Same as last on, or Quick match's before the first match. */
    fun startDraft() {
        val last = saved.lastFormat
        draft = last ?: saved.quick.format()
        sameAsLast = last != null
    }

    fun chooseSameAsLast(on: Boolean) {
        sameAsLast = on
        // Back to exactly the last format, whatever was changed while it was off.
        if (on) saved.lastFormat?.let { draft = draft.withFormat(it) }
    }

    // ---- Reset LawFive (DATA-8) ----

    var resetting by mutableStateOf(false)
        private set

    /**
     * Everything the app keeps goes (the link, matches, history, what waits to send, the chosen server),
     * but not the settings. A linked watch signs out on the server first, so the devices lists drop it,
     * for a few seconds at most.
     */
    fun reset(done: () -> Unit) {
        resetting = true
        scope.launch {
            // SYNC-6: a sign-out that doesn't get through is kept, so the server still drops it later.
            val left = saved.token?.let { token ->
                val result = withTimeoutOrNull(8_000) { runCatching { server.post("/v1/auth/sign-out", token, null) }.exceptionOrNull() }
                if (result == null || result is ServerRefused) null else SignOut(serverUrl, token)
            }
            val s = saved
            track.eraseAll()
            update {
                Saved(
                    quick = s.quick, faceLayout = s.faceLayout, secondClock = s.secondClock, screen = s.screen, screenAt = s.screenAt,
                    vibeFullTime = s.vibeFullTime, vibeAdded = s.vibeAdded, vibeBreak = s.vibeBreak, vibeStoppage = s.vibeStoppage, vibeSinBin = s.vibeSinBin,
                    tapStoppage = s.tapStoppage, cardReasons = s.cardReasons, stoppageName = s.stoppageName, breakName = s.breakName, recordTrack = s.recordTrack,
                    signOuts = s.signOuts + listOfNotNull(left),
                )
            }
            withContext(Dispatchers.Main) {
                resetting = false
                done()
            }
        }
    }

    fun clearMatch() {
        saved.match?.takeIf { it.phase != Phase.Done }?.let {
            // Canceled: nothing of it is kept.
            Workout.end()
            track.discard(it.created)
        }
        update { it.copy(match = null) }
    }

    private fun title(m: Match) = "${m.setup.home} v ${m.setup.away}"

    private fun matchFinished(m: Match) {
        update {
            it.copy(
                outbox = it.outbox + uploadFor(m),
                history = (listOf(Finished(m.created, title(m), m.setup.home, m.setup.away, m.score.toList(), m.penaltyScore(), System.currentTimeMillis() / 1000, golden = m.endedGolden, matchId = m.setup.matchId)) + it.history).take(HISTORY_KEPT),
            )
        }
        sync()
    }

    /** Cards given after full time belong in the record too (EVT-7). */
    private fun refreshFinished(m: Match) {
        update { s ->
            s.copy(
                outbox = s.outbox.filterNot { it["created"]?.toString() == m.created.toString() } + uploadFor(m),
                history = s.history.map { if (it.created == m.created) it.copy(score = m.score.toList(), sent = false) else it },
            )
        }
    }

    /** POST /v1/watch/records. */
    private fun uploadFor(m: Match): JsonObject = buildJsonObject {
        val setup = m.setup
        put("created", m.created)
        setup.matchId?.let { put("matchId", it) }
        put("device", Build.MODEL.take(40))
        put("home", setup.home); put("away", setup.away)
        put("homeName", setup.homeName); put("awayName", setup.awayName)
        put("homeColor", setup.homeColor); put("awayColor", setup.awayColor)
        put("numPeriods", setup.numPeriods); put("periodSec", setup.periodSec); put("halftimeSec", setup.halftimeSec)
        put("teamSize", setup.teamSize); put("breakAtSec", m.breakAtSec); put("breakLenSec", setup.breakLenSec)
        put("extraTime", setup.extraTime); put("etPeriods", setup.etPeriods); put("etPeriodSec", setup.etPeriodSec); put("goldenGoal", m.goldenGoal)
        put("penalties", setup.penalties); put("clockStyle", m.clockStyle); put("trackStoppage", setup.tracked)
        put("breakStoppage", setup.breakStoppage); put("goalScorers", setup.goalScorers); put("goalTypes", setup.goalTypes)
        // EVT-12, as goldenGoal is.
        put("sinBins", setup.sinBins); put("sinBinSec", setup.sinBinSec)
        // TMR-15.
        put("stoppingClock", setup.stoppingClock); put("stopForGoalsCards", setup.stopForGoalsCards)
        put("score", JsonArray(m.score.map { JsonPrimitive(it) }))
        m.penaltyScore()?.let { p -> put("pens", JsonArray(p.map { JsonPrimitive(it) })) }
        if (m.endedGolden) put("golden", true)
        put("startedAt", JsonArray(m.startedAt.map { JsonPrimitive(it) }))
        put("kickoff", m.kickoff)
        m.homeHeading?.let { put("homeHeading", it) } // PRE-8, for heatmaps (TRK-9).
        m.distanceM?.let { put("distanceM", Math.round(it)) } // SYNC-7.
        // DIAG-1.
        put("diagnostics", buildJsonObject {
            put("battery", JsonArray(m.batteryLog.map { b -> JsonArray(b.map { JsonPrimitive(it) }) }))
            put("app", BuildConfig.VERSION_NAME.take(40))
            put("firmware", Build.VERSION.RELEASE.take(40))
            put("restarts", m.restarts)
            put("gpsSamples", m.gpsSamples)
            put("gpsMissed", m.gpsMissed)
            m.gpsFirstFixSec?.let { put("gpsFirstFixSec", it) }
        })
        put("events", JsonArray(m.events.map { e ->
            JsonArray(listOf(JsonPrimitive(e.type), JsonPrimitive(e.team), JsonPrimitive(e.period), JsonPrimitive(e.seconds), e.player?.let { JsonPrimitive(it) } ?: JsonNull, e.extra?.let { JsonPrimitive(it) } ?: JsonNull))
        }))
        // EVT-14: the cards' reasons beside the events, only when there are any.
        m.misconductUpload()?.let { put("misconduct", it) }
    }

    // ---- The match screen (UI-21, UI-24) ----

    private val layoutIds = listOf("default", "stacked", "minimal", "scoreboard", "sideBySide", "ring")
    private val clockIds = listOf("up", "upEach", "down")
    private val clocksIds = listOf("one", "stacked", "sideBySide")
    private val edgeIds = listOf("none", "ring", "time")
    private val breakIds = listOf("down", "up")

    fun chooseScreen(change: (WatchScreen) -> WatchScreen) {
        val at = System.currentTimeMillis() / 1000
        val chosen = change(saved.chosenScreen)
        val sent = ScreenChange(
            layoutIds[chosen.nearestLayout], clockIds[chosen.second], at,
            clocksIds[chosen.clocks], clockIds[chosen.mainClock], breakIds[chosen.breakClock], edgeIds[chosen.edge], chosen.names,
        )
        update { it.copy(screen = chosen, screenAt = at, screenChange = sent) }
        sync()
    }

    /** UI-24: the account's choice, if it's newer than this watch's and readable. An older server sends only a layout and second clock: how the clocks count stays. */
    private fun applyScreen(screen: ScreenChange?) {
        if (screen == null || screen.at <= saved.screenAt) return
        val layout = layoutIds.indexOf(screen.layout)
        val second = clockIds.indexOf(screen.secondClock)
        if (layout < 0 || second < 0) return
        val current = saved.chosenScreen
        val chosen = if (screen.clocks == null) {
            WatchScreen.fromLayout(layout, current.mainClock, second, current.breakClock)
        } else {
            val clocks = clocksIds.indexOf(screen.clocks)
            val main = clockIds.indexOf(screen.mainClock)
            val brk = breakIds.indexOf(screen.breakClock)
            val edge = edgeIds.indexOf(screen.edge)
            if (clocks < 0 || main < 0 || brk < 0 || edge < 0 || screen.names == null) return
            WatchScreen(clocks, main, second, brk, edge, screen.names)
        }
        update { it.copy(screen = chosen, screenAt = screen.at) }
    }

    // ---- Mark pitch (TRK-13) ----

    /** Two to four corners, [latitude, longitude] in degrees, for a planned match by its id or a quick one by when it started. */
    fun queuePitch(matchId: String?, created: Long?, corners: List<DoubleArray>) {
        if (corners.size < 2) return
        val upload = PitchUpload(matchId, if (matchId == null) created else null, corners.map { listOf(Math.round(it[0] * 1_000_000).toInt(), Math.round(it[1] * 1_000_000).toInt()) }, System.currentTimeMillis() / 1000)
        update { s -> s.copy(pitches = s.pitches.filterNot { it.matchId == upload.matchId && it.created == upload.created } + upload) }
        sync()
    }

    // ---- Fees (SYNC-11) ----

    fun markPaid(matchId: String, paid: Boolean) {
        val at = System.currentTimeMillis() / 1000
        update { s ->
            s.copy(
                matches = s.matches.map { m -> if (m.str("id") == matchId) m.withFeePaid(paid) else m },
                fees = s.fees.filterNot { it.matchId == matchId } + FeeChange(matchId, paid, at),
            )
        }
        sync()
    }

    // ---- Sync (SYNC-3, SYNC-4, SYNC-6) ----

    fun linkWith(token: String) {
        update { it.copy(token = token) }
        sync()
    }

    fun setServer(url: String?) = update { it.copy(server = url) }

    /**
     * SYNC-6: forgets the account and its matches. The watch signs out on the server, so the devices lists drop it;
     * without a connection the old link waits in [Saved.signOuts] until there is one. Not when the server already
     * refused it ([signOut] false).
     */
    fun unlink(signOut: Boolean = true) {
        val token = saved.token
        update {
            it.copy(
                token = null, matches = emptyList(), lastSync = null, screenChange = null, screenAt = 0, misconductScheme = null,
                signOuts = if (signOut && token != null) it.signOuts + SignOut(serverUrl, token) else it.signOuts,
            )
        }
        sendSignOuts()
    }

    private var signingOut = false

    /** SYNC-6: the old links waiting, each to the server it came from; gone once that server answers, kept while it can't be reached. */
    private fun sendSignOuts() {
        if (signingOut || saved.signOuts.isEmpty()) return
        signingOut = true
        scope.launch {
            try {
                for (old in saved.signOuts) {
                    runCatching { Server { old.server }.post("/v1/auth/sign-out", old.token, null) }
                        .onFailure { if (it !is ServerRefused) return@launch }
                    update { it.copy(signOuts = it.signOuts - old) }
                }
            } finally {
                signingOut = false
            }
        }
    }

    fun deviceFlow() = server

    fun sync(done: (() -> Unit)? = null) {
        sendSignOuts()
        val token = saved.token ?: run { done?.invoke(); return }
        if (syncing) { done?.invoke(); return }
        syncing = true
        syncProblem = null
        if (saved.outbox.isNotEmpty()) {
            syncTotal = saved.outbox.size
            syncSent = 0
            syncScreenShown = false
        }
        scope.launch {
            try {
                for (upload in saved.outbox) {
                    server.post("/v1/watch/records", token, upload)
                    syncSent++
                    update { s -> s.copy(outbox = s.outbox - upload, history = s.history.map { if (it.created.toString() == upload["created"].toString()) it.copy(sent = true) else it }) }
                }
                // TRK-7: the tracks of matches sent, a chunk a request, oldest first.
                while (true) {
                    val next = saved.tracks.firstOrNull() ?: break
                    if (next.next >= next.count) {
                        update { it.copy(tracks = it.tracks.drop(1)) }
                        continue
                    }
                    val data = track.chunk(next.created, next.next)
                    val result = if (data == null) null else runCatching {
                        server.post("/v1/watch/tracks", token, buildJsonObject {
                            put("created", next.created); put("start", next.start); put("index", next.next); put("count", next.count)
                            put("device", Build.MODEL.take(40)); put("data", data)
                        })
                    }.exceptionOrNull()
                    if (result is ServerRefused && result.status == 404) {
                        // A server from before tracks, or the match was deleted: the track has nowhere to go.
                        track.delete(next.created, next.next, next.count)
                        update { it.copy(tracks = it.tracks.drop(1)) }
                        continue
                    }
                    // A chunk the server can't take goes, so the rest can follow; anything else is tried again later.
                    if (result != null && !(result is ServerRefused && result.status == 400)) throw result
                    track.delete(next.created, next.next, next.next + 1)
                    update { s -> s.copy(tracks = s.tracks.mapIndexed { i, t -> if (i == 0) t.copy(next = t.next + 1) else t }) }
                }
                // SYNC-12: after the matches, so a quick match is there to take its pitch.
                for (pitch in saved.pitches) {
                    runCatching { server.post("/v1/watch/pitch", token, json.encodeToJsonElement(PitchUpload.serializer(), pitch)) }
                        .onFailure { if (!(it is ServerRefused && (it.status == 400 || it.status == 404))) throw it }
                    update { s -> s.copy(pitches = s.pitches - pitch) }
                }
                for (fee in saved.fees) {
                    runCatching { server.post("/v1/watch/fee", token, json.encodeToJsonElement(FeeChange.serializer(), fee)) }
                        .onFailure { if (it !is ServerRefused) throw it }
                    update { s -> s.copy(fees = s.fees - fee) }
                }
                saved.screenChange?.let { change ->
                    runCatching { server.post("/v1/watch/screen", token, json.encodeToJsonElement(ScreenChange.serializer(), change)) }
                        .onFailure { if (it !is ServerRefused) throw it }
                    update { it.copy(screenChange = null) }
                }
                val answer = server.get("/v1/watch/matches?limit=10", token)
                update { s ->
                    s.copy(
                        matches = (answer["matches"] as? JsonArray)?.map { it as JsonObject } ?: emptyList(),
                        serverVersion = answer.str("serverVersion") ?: s.serverVersion,
                        // EVT-14: the account's scheme, for quick and created matches; kept when a server sends none.
                        misconductScheme = answer.str("misconductScheme") ?: s.misconductScheme,
                        lastSync = System.currentTimeMillis() / 1000,
                    )
                }
                answer["screen"]?.let { applyScreen(runCatching { json.decodeFromJsonElement(ScreenChange.serializer(), it) }.getOrNull()) }
            } catch (e: ServerRefused) {
                if (e.status == 401) {
                    unlink(signOut = false)
                    syncProblem = "Unlinked; link again"
                } else {
                    syncProblem = "The server said no (${e.status})"
                }
            } catch (_: Exception) {
                syncProblem = "Can't reach the server"
            } finally {
                syncing = false
                done?.invoke()
            }
        }
    }
}
