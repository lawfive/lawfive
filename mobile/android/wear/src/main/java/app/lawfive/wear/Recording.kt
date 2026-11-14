package app.lawfive.wear

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.concurrent.futures.await
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseEndReason
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.data.LocationAvailability
import androidx.health.services.client.data.WarmUpConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import java.io.File

// WCH-7: the match as a Health Services exercise, soccer, inside the match's foreground service (WCH-5): the heart
// rate, and the location and distance where the watch's soccer exercise measures them. Where it doesn't (a Galaxy
// Watch's soccer has heart rate but no location, speed or distance), the position comes straight from the watch's
// GPS about once a second, and the distance from its positions (DistanceLog), with Record track on or off. Paused between periods and while play is
// suspended (ACT-2, TMR-13), and ended at full time; a canceled match ends it too. Health Services' own calls are
// made one at a time, in the order asked. Health Connect isn't on watches, so the Android phone app saves Wear OS
// matches there (ACT-1).
object Workout {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val calls = Mutex()
    private var client: androidx.health.services.client.ExerciseClient? = null
    private var running = false

    /** Where the exercise is: none, warming up before the first kickoff (ACT-5), or started at it. */
    private enum class Stage { None, Preparing, Started }
    private var stage = Stage.None
    /** ACT-5: the match is set up and its first kickoff hasn't come: the warm-up is wanted. */
    private var warming = false
    /** From the warm-up or the first kickoff until full time or a cancel. */
    private var active = false
    private var appContext: Context? = null

    /** WCH-7: what this watch's soccer exercise measures, once Health Services has said. */
    private var soccer by mutableStateOf<Set<DataType<*, *>>?>(null)
    /** For testing on an emulator, whose soccer has location: the GPS goes straight, as where soccer has none (README). */
    var forceDirectGps = false

    /** The GPS straight, when it's on, and since when, so only a fix taken since says ready (ACT-5). */
    private var gps: LocationManager? = null
    private var gpsSince = 0L

    /** The latest readings, while a period is played. */
    var heartRate: Int? = null
        private set
    /** A position not yet taken into the track and the distance. */
    private var freshFix: Fix? = null
    private var speed: Double? = null
    /** SYNC-7: meters, as the watch's exercise measures them; null where it doesn't, as the track's are used then. */
    var distance: Double? = null
        private set
    /** ACT-5: the GPS has a usable position, for the kickoff screens before the first kickoff. */
    var gpsReady by mutableStateOf(false)
        private set

    /** The heart rate is a body sensor before Wear OS 6, and a health permission from it. */
    val heartRatePermission get() = if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS

    fun hasHeartRate(context: Context) = context.checkSelfPermission(heartRatePermission) == PackageManager.PERMISSION_GRANTED
    fun hasLocation(context: Context) = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    /** ACT-5: there's a sensor to warm up: Health Services warms only the GPS and the heart rate, each with its permission. */
    fun warmsUp(context: Context) = hasHeartRate(context) || hasLocation(context)

    /** The watch has a GPS of its own. */
    private fun hasGps(context: Context) = context.getSystemService(LocationManager::class.java)?.allProviders?.contains(LocationManager.GPS_PROVIDER) == true

    /**
     * ACT-5: a position will come, from soccer's location or the GPS straight; false until Health Services has said
     * what soccer measures, which it does as the warm-up starts.
     */
    fun gpsAvailable(context: Context) = soccer?.let { DataType.LOCATION in it || hasGps(context) } == true

    /**
     * WCH-7: soccer has no location here, so the position comes from the GPS straight: for the track, and for the
     * distance with Record track off too, as the exercise's GPS would be used for it (ACT-5).
     */
    private fun direct(context: Context) = hasLocation(context) && soccer?.contains(DataType.LOCATION) == false && hasGps(context)

    private fun exercise(context: Context) = client ?: HealthServices.getClient(context.applicationContext).exerciseClient.also { client = it }

    /** WCH-7: what soccer measures on this watch, asked once; nothing kept if Health Services couldn't say. */
    private suspend fun soccerTypes(exercise: androidx.health.services.client.ExerciseClient): Set<DataType<*, *>> {
        soccer?.let { return it }
        val capabilities = runCatching { exercise.getCapabilitiesAsync().await() }.getOrNull() ?: return emptySet()
        // A watch without soccer at all has nothing of it.
        val types = runCatching { capabilities.getExerciseTypeCapabilities(ExerciseType.SOCCER).supportedDataTypes }.getOrDefault(emptySet())
        return (if (forceDirectGps) types - setOf(DataType.LOCATION, DataType.SPEED, DataType.DISTANCE_TOTAL) else types).also { soccer = it }
    }

    /** Runs Health Services' calls in order, so a match canceled at once ends the warm-up it just asked for. */
    private fun call(block: suspend () -> Unit) {
        scope.launch { calls.withLock { runCatching { block() } } }
    }

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            // ACT-5: a warm-up the watch ended. Kept too long before kickoff, it starts again; taken over by another
            // app's workout, or its permission gone, nothing warms up now.
            val state = update.exerciseStateInfo
            if (state.state.isEnded && stage == Stage.Preparing && state.endReason != ExerciseEndReason.USER_END) {
                stage = Stage.None
                val context = appContext
                if (state.endReason == ExerciseEndReason.AUTO_END_PREPARE_EXPIRED && warming && context != null) prepare(context)
                else if (gps == null) gpsReady = false
            }
            update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.let { if (running) heartRate = it.value.toInt() }
            update.latestMetrics.getData(DataType.SPEED).lastOrNull()?.let { speed = it.value }
            update.latestMetrics.getData(DataType.LOCATION).lastOrNull()?.let {
                freshFix = Fix(it.value.latitude, it.value.longitude, speed, null)
                gpsReady = true
            }
            update.latestMetrics.getData(DataType.DISTANCE_TOTAL)?.let { distance = it.total }
        }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {}
        // ACT-5: searching until the GPS has a position, from the watch or through the phone.
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {
            if (availability is LocationAvailability) {
                gpsReady = availability == LocationAvailability.ACQUIRED_TETHERED || availability == LocationAvailability.ACQUIRED_UNTETHERED
            }
        }
    }

    /** WCH-7: the GPS straight, about once a second, for a watch whose soccer has no location. */
    private val listener = object : LocationListener {
        override fun onLocationChanged(fix: Location) = took(fix)
        override fun onProviderDisabled(provider: String) { gpsReady = false }
        override fun onProviderEnabled(provider: String) {}
    }

    private fun took(fix: Location) {
        if (!fix.hasAccuracy()) return
        val accuracy = fix.accuracy.toDouble()
        // ACT-5: ready while the latest fix, taken since the GPS started, is within 25 m, as on the Apple Watch.
        gpsReady = accuracy <= GPS_USABLE_M && fix.elapsedRealtimeNanos >= gpsSince
        // TRK-7: a fix within 65 m goes into the track, as on the Apple Watch; worse is somewhere else. Its speed is the
        // GPS's own, when it has one.
        if (accuracy <= TRACK_USABLE_M) freshFix = Fix(fix.latitude, fix.longitude, if (fix.hasSpeed()) fix.speed.toDouble() else null, accuracy)
    }

    /**
     * WCH-7: the watch's GPS provider rather than the fused one: the fused one may take the phone's position, which
     * stays at the side of the pitch, and the GPS gives each fix's accuracy and its own speed. From the match's
     * foreground service, which has the location type with the permission, so it goes on with the screen off.
     */
    @SuppressLint("MissingPermission") // direct() has checked it.
    private fun startGps(context: Context) {
        if (gps != null || !active || !direct(context)) return
        val manager = context.getSystemService(LocationManager::class.java) ?: return
        gpsSince = SystemClock.elapsedRealtimeNanos()
        gpsReady = false
        runCatching { manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper()) }.onSuccess { gps = manager }
    }

    private fun stopGps() {
        gps?.removeUpdates(listener)
        gps = null
    }

    /**
     * ACT-5: from the match's setup ("Who kicks off?") until the first kickoff, the GPS and the heart rate warm up, as
     * Health Services prepares the soccer exercise, so the track has a position from the first second; where soccer has
     * no location, the GPS starts straight. Called again after the app started (R-5) and after
     * Restart match (PRE-6). Only with a permission for one of them, as Health Services refuses it otherwise; the
     * match's foreground service keeps it going with the screen off.
     */
    fun prepare(context: Context) {
        if (!warmsUp(context)) return
        warming = true
        active = true
        appContext = context.applicationContext
        val exercise = exercise(context)
        call {
            if (!warming) return@call
            val supported = soccerTypes(exercise)
            startGps(context)
            if (stage != Stage.None) return@call
            val info = exercise.getCurrentExerciseInfoAsync().await()
            exercise.setUpdateCallback(callback)
            // Before the first kickoff nothing is kept: an exercise started before the app started again goes, as Health
            // Services won't prepare while this app has one. A warm-up from before isn't counted, and goes on as asked again.
            if (info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) runCatching { exercise.endExerciseAsync().await() }
            val warmed = buildSet<DeltaDataType<*, *>> {
                if (hasHeartRate(context)) add(DataType.HEART_RATE_BPM)
                if (hasLocation(context)) add(DataType.LOCATION)
            }.filter { it in supported }.toSet()
            if (warmed.isEmpty()) return@call
            exercise.prepareExerciseAsync(WarmUpConfig(ExerciseType.SOCCER, warmed)).await()
            stage = Stage.Preparing
        }
    }

    /**
     * A period is being played: the exercise starts at the first kickoff ([first]; from its warm-up, ACT-5, when there
     * was one), carries on after a break, or is picked up after the app started again (R-5). The GPS straight, where
     * it's used, starts if it hadn't.
     */
    fun run(context: Context, first: Boolean) {
        running = true
        warming = false
        active = true
        val exercise = exercise(context)
        call {
            val supported = soccerTypes(exercise)
            startGps(context)
            val info = exercise.getCurrentExerciseInfoAsync().await()
            exercise.setUpdateCallback(callback)
            val owned = info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS
            // At the first kickoff the exercise always starts afresh, whatever an app started again left (R-5).
            if (!first && (stage == Stage.Started || (stage == Stage.None && owned))) {
                if (owned) {
                    stage = Stage.Started
                    exercise.resumeExerciseAsync().await()
                }
            } else {
                val wanted = buildSet<DataType<*, *>> {
                    if (hasHeartRate(context)) add(DataType.HEART_RATE_BPM)
                    if (hasLocation(context)) { add(DataType.LOCATION); add(DataType.SPEED) }
                    add(DataType.DISTANCE_TOTAL)
                }.filter { it in supported }.toSet()
                val config = ExerciseConfig.builder(ExerciseType.SOCCER).setDataTypes(wanted)
                    .setIsAutoPauseAndResumeEnabled(false).setIsGpsEnabled(DataType.LOCATION in wanted).build()
                exercise.startExerciseAsync(config).await()
                stage = Stage.Started
            }
        }
    }

    /**
     * Between periods, and while play is suspended (ACT-2, TMR-13). The GPS straight stays on, as the exercise's does,
     * so the next kickoff has a position at once; nothing is taken from it until then.
     */
    fun pause() {
        running = false
        heartRate = null
        freshFix = null
        val exercise = client ?: return
        call { if (stage == Stage.Started) exercise.pauseExerciseAsync().await() }
    }

    /**
     * R-5: a match that came back between periods or suspended (TMR-13) after the app started again: the exercise it
     * left running or paused is picked up and kept paused, as it would be at a break (ACT-2), until the next period or
     * Resume runs it again. The GPS straight, where it's used, starts again.
     */
    fun holdPaused(context: Context) {
        running = false
        heartRate = null
        active = true
        val exercise = exercise(context)
        call {
            soccerTypes(exercise)
            startGps(context)
            val info = exercise.getCurrentExerciseInfoAsync().await()
            if (info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) {
                stage = Stage.Started
                exercise.setUpdateCallback(callback)
                exercise.pauseExerciseAsync().await()
            }
        }
    }

    /** Full time or a canceled match, and a canceled warm-up before kickoff (ACT-5), which turns the sensors off. */
    fun end() {
        running = false
        heartRate = null
        freshFix = null
        distance = null
        gpsReady = false
        warming = false
        active = false
        stopGps()
        val exercise = client ?: return
        call {
            stage = Stage.None
            // Whatever this app has, also one left from before the app started again; it fails harmlessly with none.
            exercise.endExerciseAsync().await()
        }
    }

    /** The position measured since the last sample, if any. */
    fun takeFix(): Fix? = freshFix.also { freshFix = null }
}

/** TRK-7: a fix within this is taken from the GPS straight, as on the Apple Watch. */
private const val TRACK_USABLE_M = 65.0

/** A position in degrees, with the speed in m/s and the accuracy in meters when the watch gives them. */
class Fix(val lat: Double, val lon: Double, val speed: Double?, val accuracy: Double?)

/**
 * TRK-7: the referee's GPS and heart rate about once a second during the periods, packed as the Garmin
 * watch packs them (TrackPacking.kt) and kept as files, a chunk each, until the server has them. The
 * chunk being filled is saved every 30 samples, so a restarted app loses at most that.
 */
class TrackLog(context: Context) {
    @Serializable
    private data class Current(val created: Long, val start: Long, val chunks: Int = 0, val chunk: TrackChunk = TrackChunk())

    private val folder = File(context.filesDir, "tracks")
    private val stateFile get() = File(folder, "current.json")
    private var current: Current? = null

    private fun chunkFile(created: Long, index: Int) = File(folder, "$created-$index.txt")

    /** Starts the track at the match's kickoff, or picks it up after the app started again. */
    fun begin(created: Long, now: Long) {
        if (resume(created)) return
        current = Current(created, now / 1000)
        save()
    }

    private fun resume(created: Long): Boolean {
        if (current?.created == created) return true
        val saved = runCatching { json.decodeFromString<Current>(stateFile.readText()) }.getOrNull() ?: return false
        if (saved.created != created) return false
        current = saved
        return true
    }

    /** Once a second while a period is played: whether it had a GPS fix (DIAG-1), or null when it took no sample. */
    fun sample(created: Long, now: Long, fix: Fix?, heartRate: Int?): Boolean? {
        if (!resume(created)) return null
        val track = current ?: return null
        val lat = fix?.lat?.let { Math.round(it * 1_000_000).toInt() }
        val lon = fix?.lon?.let { Math.round(it * 1_000_000).toInt() }
        val speed = fix?.speed?.takeIf { it >= 0 }?.let { Math.round(it * 100).toInt() }
        val tDs = ((now - track.start * 1000) / 100).toInt()
        val chunk = track.chunk.add(tDs, lat, lon, speed, heartRate) ?: return lat != null
        current = track.copy(chunk = chunk)
        if (chunk.isFull) writeChunk() else if (chunk.count % 30 == 0) save()
        return lat != null
    }

    /** Full time: the last chunk is written, and the track is what's to send. */
    fun finish(created: Long): TrackUpload? {
        if (!resume(created)) return null
        writeChunk()
        val track = current ?: return null
        current = null
        stateFile.delete()
        return if (track.chunks > 0) TrackUpload(created, track.start, track.chunks) else null
    }

    /** A canceled match: its track goes too. */
    fun discard(created: Long) {
        if (!resume(created)) return
        val track = current ?: return
        delete(created, 0, track.chunks)
        current = null
        stateFile.delete()
    }

    fun chunk(created: Long, index: Int): String? = chunkFile(created, index).takeIf { it.exists() }?.readText()

    fun delete(created: Long, from: Int, to: Int) {
        for (index in from until to) chunkFile(created, index).delete()
    }

    /** DATA-8: every track on the watch. */
    fun eraseAll() {
        current = null
        folder.deleteRecursively()
    }

    private fun writeChunk() {
        val track = current ?: return
        if (track.chunk.count == 0) return
        folder.mkdirs()
        runCatching { chunkFile(track.created, track.chunks).writeText(track.chunk.text) }.onFailure { return }
        current = track.copy(chunks = track.chunks + 1, chunk = TrackChunk())
        save()
    }

    private fun save() {
        val track = current ?: return
        folder.mkdirs()
        val temp = File(folder, "current.json.tmp")
        runCatching {
            temp.writeText(json.encodeToString(track))
            temp.renameTo(stateFile)
        }
    }
}

/**
 * SYNC-7: the distance covered, from the positions taken during play (Covered), for a watch whose exercise doesn't
 * measure it (WCH-7), with Record track on or off. Saved every 30 positions, as the track is, so a restarted app
 * loses at most that.
 */
class DistanceLog(context: Context) {
    @Serializable
    private data class Current(val created: Long, val start: Long, val covered: Covered = Covered(), val count: Int = 0)

    private val file = File(context.filesDir, "distance.json")
    private var current: Current? = null

    private fun resume(created: Long): Boolean {
        if (current?.created == created) return true
        val saved = runCatching { json.decodeFromString<Current>(file.readText()) }.getOrNull() ?: return false
        if (saved.created != created) return false
        current = saved
        return true
    }

    /** At the match's kickoff, or picked up after the app started again. */
    fun begin(created: Long, now: Long) {
        if (resume(created)) return
        current = Current(created, now / 1000)
        save()
    }

    /** A position taken in a period. */
    fun add(created: Long, now: Long, fix: Fix) {
        if (!resume(created)) return
        val d = current ?: return
        val tDs = ((now - d.start * 1000) / 100).toInt()
        val next = d.copy(covered = d.covered.add(tDs, Math.round(fix.lat * 1_000_000).toInt(), Math.round(fix.lon * 1_000_000).toInt(), fix.accuracy), count = d.count + 1)
        current = next
        if (next.count % 30 == 0) save()
    }

    /** Full time: meters covered, or null with no position taken; either way it's done with. */
    fun finish(created: Long): Double? {
        val meters = if (resume(created)) current?.covered?.takeIf { it.lastTDs != null }?.meters else null
        discard()
        return meters
    }

    /** A canceled or restarted match, Reset LawFive (DATA-8), and full time. */
    fun discard() {
        current = null
        file.delete()
    }

    private fun save() {
        val d = current ?: return
        val temp = File(file.parentFile, "distance.json.tmp")
        runCatching {
            temp.writeText(json.encodeToString(d))
            temp.renameTo(file)
        }
    }
}
