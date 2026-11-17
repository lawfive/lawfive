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
    private lateinit var distance: DistanceLog
    /** Goes up each time the app comes to the front, so what the system allows is read again (WCH-7). */
    var resumes by mutableStateOf(0)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    var saved by mutableStateOf(Saved())
        private set
    var syncing by mutableStateOf(false)
        private set
    var syncProblem by mutableStateOf<String?>(null)
        private set
    // UI-16, UI-26: this sync's steps, as the Garmin's: the matches and track chunks it's sending (the whole way, so the
    // ring only goes forward), how many have gone, the step going now ("Sending track", "3 of 18"), and the line for
    // Sync now ("Sending track 3 of 18…", "Getting matches…"). The sync screen comes up for one that sends anything.
    var syncStepsTotal by mutableStateOf(0)
    var syncStepsDone by mutableStateOf(0)
    var syncMatchesSent by mutableStateOf(0)
    var syncStepLabel by mutableStateOf("")
    var syncStepCount by mutableStateOf("")
    var syncProgress by mutableStateOf<String?>(null)
        private set
    var syncScreen by mutableStateOf(false)
    var screenFree by mutableStateOf(false)
    private var syncScreenShown by mutableStateOf(false)
    /** Matches or tracks are going, or went without the screen getting a chance to say so, and it hasn't come up for this sync yet. */
    val wantsSyncScreen get() = !syncScreenShown && syncStepsTotal > 0 && (syncing || syncProblem == null)

    private fun step(label: String, number: Int, total: Int) {
        syncStepLabel = label
        syncStepCount = "$number of $total"
        syncProgress = "$label $number of $total…"
    }

    /** "1" or "2" of 3 matches, "track" (a match, then 3 of 18 chunks), or "stopped". */
    fun showSyncScreenForTesting(what: String) {
        val track = what == "track"
        syncStepsTotal = if (track) 19 else 3
        syncStepsDone = if (track) 3 else what.toIntOrNull() ?: 1
        syncMatchesSent = if (track) 1 else syncStepsDone
        if (track) step("Sending track", 3, 18) else step("Sending match", minOf(syncStepsDone + 1, 3), 3)
        syncing = track || (what.toIntOrNull()?.let { it < 3 } ?: false)
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
        distance = DistanceLog(context.applicationContext)
        saved = store.load()
        // EVT-12: the sin bins waiting for "can return" are the match's own events again.
        saved.match?.restored()
        battery = { (context.getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager)?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 } }
        // DIAG-1: a match already running means the app went away mid-match.
        saved.match?.let { if (it.phase != Phase.Done && it.startedAt.isNotEmpty()) it.restarts += 1 }
        // R-5: the recording goes on as the match left it: a match still being set up warms the GPS up again (ACT-5), one
        // in a period records again, and one between periods or suspended keeps its exercise paused until the next
        // period or Resume (ACT-2, TMR-13).
        saved.match?.takeIf { it.phase != Phase.Done }?.let { m ->
            when {
                beforeFirstKickoff(m) -> Workout.prepare(this.context)
                m.phase == Phase.Running || m.phase == Phase.Golden -> Workout.run(this.context, first = false)
                m.startedAt.isNotEmpty() -> Workout.holdPaused(this.context)
            }
        }
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
            distance.discard()
            // ACT-5: back before the first kickoff, so the GPS warms up again for it.
            Workout.prepare(context)
        }
        follow(m, first = !wasPlayed && m.startedAt.isNotEmpty())
        if (before != Phase.Done && m.phase == Phase.Done) {
            // SYNC-7: the distance, before the exercise ends: the watch's own measure, else the one from its positions
            // where the watch's soccer exercise doesn't measure it (WCH-7).
            val fromFixes = distance.finish(m.created)
            (Workout.distance ?: fromFixes)?.let { m.distanceM = it }
            Workout.end()
            if (m.recordTrack) track.finish(m.created)?.let(::queueTrack)
            matchFinished(m)
        } else if (m.phase == Phase.Done) refreshFinished(m)
    }

    // ---- Recording (WCH-7, TRK-7) ----

    /** ACT-5: set up, at "Who kicks off?" or Start, and not yet kicked off; Restart match comes back here (PRE-6). */
    fun beforeFirstKickoff(m: Match) = m.startedAt.isEmpty() && (m.phase == Phase.Pre || m.phase == Phase.Ready)

    /**
     * ACT-5: the kickoff screens say whether the GPS is ready only when the match will record a position: a track, the
     * location allowed, and a GPS to give it, through the soccer exercise or straight (WCH-7).
     */
    fun showsGps(m: Match) = beforeFirstKickoff(m) && m.recordTrack && Workout.hasLocation(context) && Workout.gpsAvailable(context)

    /**
     * WCH-5: the match's foreground service runs from the first kickoff, or from the setup when the GPS or the heart
     * rate warm up for it (ACT-5): Health Services wants the warm-up in a foreground service, so it goes on with the
     * screen off.
     */
    fun wantsService(m: Match) = m.phase != Phase.Done && (m.periodStart != null || (beforeFirstKickoff(m) && Workout.warmsUp(context)))

    /**
     * The exercise runs while a period is played, and pauses between them and while play is suspended (ACT-2, TMR-13).
     * [first]: the match has just kicked off, so the exercise starts, from its warm-up (ACT-5).
     */
    private fun follow(m: Match, first: Boolean) {
        when (m.phase) {
            Phase.Running, Phase.Golden -> {
                Workout.run(context, first)
                if (m.recordTrack) track.begin(m.created, System.currentTimeMillis())
                distance.begin(m.created, System.currentTimeMillis())
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
        if (m.phase == Phase.Running || m.phase == Phase.Golden) {
            val fix = Workout.takeFix()
            // SYNC-7: the distance from the positions, with Record track on or off (WCH-7).
            fix?.let { distance.add(m.created, now, it) }
            // TRK-7: a sample a second while play goes on.
            if (m.recordTrack) track.sample(m.created, now, fix, Workout.heartRate)?.let { m.noteGps(it, now) }
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
            // VIB-5: Repeat alerts every and Remind every, as they are now.
            repeatSec = s.alertRepeatSec, reminderSec = s.stoppageReminderSec,
            recordTrack = s.recordTrack,
            // EVT-14: the planned match's scheme, else the account's (a quick or created match), else IFAB's.
            misconductScheme = Misconduct.scheme(setup.misconductScheme ?: s.misconductScheme),
        )
        update { it.copy(match = m, lastFormat = setup.format()) }
        // ACT-5: the GPS and the heart rate start warming up now, at "Who kicks off?", not at kickoff.
        Workout.prepare(context)
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
            distance.discard()
            update {
                Saved(
                    quick = s.quick, faceLayout = s.faceLayout, secondClock = s.secondClock, screen = s.screen, screenAt = s.screenAt,
                    vibeFullTime = s.vibeFullTime, vibeAdded = s.vibeAdded, vibeBreak = s.vibeBreak, vibeStoppage = s.vibeStoppage, vibeSinBin = s.vibeSinBin,
                    alertRepeatSec = s.alertRepeatSec, stoppageReminderSec = s.stoppageReminderSec, syncOnOpen = s.syncOnOpen,
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
            distance.discard()
        }
        update { it.copy(match = null) }
    }

    private fun title(m: Match) = "${m.setup.home} v ${m.setup.away}"

    /**
     * For testing on an emulator (SYNC-17): a finished match an hour old whose upload LawFive refuses, as a record it
     * can't read, first in the outbox, so the next sync gives it up and carries on with the rest.
     */
    fun queueRefusedForTesting() {
        val created = System.currentTimeMillis() / 1000 - 3600
        // Kept as History keeps it, so its status row can send it again, and be refused again (UI-17).
        val upload = buildJsonObject { put("created", created); put("home", "REF"); put("away", "USD") }
        update { s ->
            s.copy(
                outbox = listOf(upload) + s.outbox,
                history = (listOf(Finished(created, "REF v USD", "REF", "USD", listOf(0, 0), when_ = created, upload = upload)) + s.history).take(HISTORY_KEPT),
            )
        }
    }

    /** SYNC-4: a finished match still waiting in the outbox; one LawFive refused has left it (SYNC-17). */
    fun isQueued(created: Long) = saved.outbox.any { it.isFor(created) }

    private fun JsonObject.isFor(created: Long) = this["created"]?.toString() == created.toString()

    private fun matchFinished(m: Match) {
        val upload = uploadFor(m)
        update {
            // UI-20: the fee the planned match had, which a fee paid later changes here too.
            val fee = m.setup.matchId?.let { id -> it.matches.firstOrNull { p -> p.str("id") == id } }?.let { p -> p["fee"] as? JsonObject }
                ?.let { f -> FinishedFee(f.str("text") ?: "", f.bool("paid") == true) }
            val finished = Finished(
                m.created, title(m), m.setup.home, m.setup.away, m.score.toList(), m.penaltyScore(), System.currentTimeMillis() / 1000,
                golden = m.endedGolden, matchId = m.setup.matchId,
                // UI-17: what its Summary and Events show, as on the Garmin watch, and the match as it's uploaded (SYNC-4).
                setup = m.setup, events = m.events.toList(), clockStyle = m.clockStyle, distanceM = m.distanceM, fee = fee, upload = upload,
                track = it.tracks.any { t -> t.created == m.created },
            )
            it.copy(outbox = it.outbox + upload, history = (listOf(finished) + it.history).take(HISTORY_KEPT))
        }
        sync()
    }

    /** Cards given after full time belong in the record too (EVT-7), and in History's Events. */
    private fun refreshFinished(m: Match) {
        val upload = uploadFor(m)
        update { s ->
            s.copy(
                outbox = s.outbox.filterNot { it.isFor(m.created) } + upload,
                history = s.history.map { if (it.created == m.created) it.copy(score = m.score.toList(), sent = false, events = m.events.toList(), upload = upload) else it },
            )
        }
    }

    // ---- History (UI-17) ----

    /**
     * UI-17, SYNC-4: the status row's press, as on the Garmin watch: one no longer waiting (refused by LawFive, say) is
     * queued again from History's copy, then a sync sends it, with its track and anything else waiting.
     */
    fun sendNow(created: Long) {
        val h = saved.history.firstOrNull { it.created == created } ?: return
        if (syncing) return
        if (!isQueued(created) && !h.sent) {
            // One kept before History held the whole match has nothing to send.
            val upload = h.upload ?: return
            update { it.copy(outbox = it.outbox + upload) }
        }
        sync()
    }

    /** Remove from watch: the match, and anything of it still waiting to send (it's lost if it hadn't gone). */
    fun removeFinished(created: Long) {
        saved.tracks.firstOrNull { it.created == created }?.let { track.delete(created, it.next, it.count) }
        update { s ->
            s.copy(
                history = s.history.filterNot { it.created == created },
                outbox = s.outbox.filterNot { it.isFor(created) },
                tracks = s.tracks.filterNot { it.created == created },
                pitches = s.pitches.filterNot { it.created == created && it.matchId == null },
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

    /** TRK-13: the corners marked for a planned match, or for a quick one by when it started, still to send; 0 for none. */
    fun pitchCorners(matchId: String?, created: Long?): Int =
        saved.pitches.firstOrNull { if (matchId != null) it.matchId == matchId else it.matchId == null && it.created == created }?.corners?.size ?: 0

    // ---- Fees (SYNC-11) ----

    fun markPaid(matchId: String, paid: Boolean) {
        val at = System.currentTimeMillis() / 1000
        update { s ->
            s.copy(
                matches = s.matches.map { m -> if (m.str("id") == matchId) m.withFeePaid(paid) else m },
                // UI-20: marked from History, or before the game; both show it.
                history = s.history.map { h -> if (h.matchId == matchId && h.fee != null) h.copy(fee = h.fee.copy(paid = paid)) else h },
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

    // ---- Opening (WCH-13) ----

    private var openedBefore = false
    private var leftFrontAt: Long? = null

    /**
     * WCH-13: at the front again. Opening (starting, or back after five minutes away) syncs with Sync on opening on and
     * no match in progress (SYNC-3); a glance doesn't, though an old link still signs out (SYNC-6).
     */
    fun cameToFront() {
        val now = android.os.SystemClock.elapsedRealtime()
        val away = leftFrontAt?.let { now - it }
        val first = !openedBefore
        openedBefore = true
        leftFrontAt = null
        val inProgress = saved.match?.let { it.phase != Phase.Done } ?: false
        if (Opening.syncs(first, away, saved.syncOnOpen, inProgress)) sync() else sendSignOuts()
    }

    fun leftFront() {
        if (leftFrontAt == null) leftFrontAt = android.os.SystemClock.elapsedRealtime()
    }

    /** SYNC-5: "2 matches, 1 track", or null with nothing waiting. */
    val waitingLine: String? get() {
        val matches = saved.outbox.size
        val tracks = saved.tracks.size
        return listOfNotNull(
            if (matches == 0) null else if (matches == 1) "1 match" else "$matches matches",
            if (tracks == 0) null else if (tracks == 1) "1 track" else "$tracks tracks",
        ).joinToString(", ").ifEmpty { null }
    }

    fun sync(done: (() -> Unit)? = null) {
        sendSignOuts()
        val token = saved.token ?: run { done?.invoke(); return }
        if (syncing) { done?.invoke(); return }
        syncing = true
        syncProblem = null
        var matchesTotal = saved.outbox.size
        var chunksTotal = saved.tracks.sumOf { maxOf(0, it.count - it.next) }
        var chunksSent = 0
        syncStepsTotal = matchesTotal + chunksTotal
        syncStepsDone = 0
        syncMatchesSent = 0
        syncProgress = null
        if (syncStepsTotal > 0) syncScreenShown = false
        scope.launch {
            try {
                for (upload in saved.outbox) {
                    step("Sending match", syncMatchesSent + 1, maxOf(matchesTotal, syncMatchesSent + 1))
                    val refused = runCatching { server.post("/v1/watch/records", token, upload) }.exceptionOrNull()
                    if (refused is ServerRefused && refused.status == 400) {
                        // SYNC-4, SYNC-17: LawFive itself can't take this one; giving it up lets the others through.
                        // History keeps it, no longer waiting ("Not on LawFive").
                        matchesTotal--
                        syncStepsTotal--
                        update { s -> s.copy(outbox = s.outbox - upload) }
                        continue
                    }
                    if (refused != null) throw refused
                    syncMatchesSent++
                    syncStepsDone++
                    // UI-17: History says when it went.
                    val at = System.currentTimeMillis() / 1000
                    update { s -> s.copy(outbox = s.outbox - upload, history = s.history.map { if (it.created.toString() == upload["created"].toString()) it.copy(sent = true, sentAt = at) else it }) }
                }
                // TRK-7: the tracks of matches sent, a chunk a request, oldest first.
                while (true) {
                    val next = saved.tracks.firstOrNull() ?: break
                    if (next.next >= next.count) {
                        update { it.copy(tracks = it.tracks.drop(1)) }
                        continue
                    }
                    step("Sending track", chunksSent + 1, maxOf(chunksTotal, chunksSent + 1))
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
                        chunksTotal -= next.count - next.next
                        syncStepsTotal -= next.count - next.next
                        update { it.copy(tracks = it.tracks.drop(1)) }
                        continue
                    }
                    // A chunk the server can't take goes, so the rest can follow; anything else is tried again later.
                    if (result != null && !(result is ServerRefused && result.status == 400)) throw result
                    chunksSent++
                    syncStepsDone++
                    track.delete(next.created, next.next, next.next + 1)
                    update { s -> s.copy(tracks = s.tracks.mapIndexed { i, t -> if (i == 0) t.copy(next = t.next + 1) else t }) }
                }
                // SYNC-12: after the matches, so a quick match is there to take its pitch.
                for (pitch in saved.pitches) {
                    syncProgress = "Sending pitch…"
                    runCatching { server.post("/v1/watch/pitch", token, json.encodeToJsonElement(PitchUpload.serializer(), pitch)) }
                        .onFailure { if (!(it is ServerRefused && (it.status == 400 || it.status == 404))) throw it }
                    update { s -> s.copy(pitches = s.pitches - pitch) }
                }
                for (fee in saved.fees) {
                    syncProgress = "Sending fee…"
                    runCatching { server.post("/v1/watch/fee", token, json.encodeToJsonElement(FeeChange.serializer(), fee)) }
                        .onFailure { if (it !is ServerRefused) throw it }
                    update { s -> s.copy(fees = s.fees - fee) }
                }
                saved.screenChange?.let { change ->
                    runCatching { server.post("/v1/watch/screen", token, json.encodeToJsonElement(ScreenChange.serializer(), change)) }
                        .onFailure { if (it !is ServerRefused) throw it }
                    update { it.copy(screenChange = null) }
                }
                // SYNC-16: canceled and postponed matches still to kick off come too, marked with their status.
                syncProgress = "Getting matches…"
                val answer = server.get(MATCHES_PATH, token)
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
                syncProgress = null
                done?.invoke()
            }
        }
    }
}
