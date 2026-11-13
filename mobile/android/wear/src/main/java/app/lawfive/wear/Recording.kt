package app.lawfive.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.concurrent.futures.await
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.io.File

// WCH-7: the match as a Health Services exercise, soccer, inside the match's foreground service (WCH-5):
// the heart rate, the location and the distance as the watch measures them. Paused between periods and while
// play is suspended (ACT-2, TMR-13), and ended at full time; a canceled match ends it too. Health Connect isn't
// on watches, so the Android phone app saves Wear OS matches there (ACT-1).
object Workout {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var client: androidx.health.services.client.ExerciseClient? = null
    private var running = false
    private var started = false

    /** The latest readings, while a period is played. */
    var heartRate: Int? = null
        private set
    /** A position not yet taken into the track: [latitude, longitude] in degrees, and the speed in m/s. */
    private var freshFix: Pair<DoubleArray, Double?>? = null
    private var speed: Double? = null
    /** SYNC-7: meters, as the watch measures them. */
    var distance: Double? = null
        private set

    /** The heart rate is a body sensor before Wear OS 6, and a health permission from it. */
    val heartRatePermission get() = if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS

    fun hasHeartRate(context: Context) = context.checkSelfPermission(heartRatePermission) == PackageManager.PERMISSION_GRANTED
    fun hasLocation(context: Context) = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            update.latestMetrics.getData(DataType.HEART_RATE_BPM).lastOrNull()?.let { if (running) heartRate = it.value.toInt() }
            update.latestMetrics.getData(DataType.SPEED).lastOrNull()?.let { speed = it.value }
            update.latestMetrics.getData(DataType.LOCATION).lastOrNull()?.let { freshFix = doubleArrayOf(it.value.latitude, it.value.longitude) to speed }
            update.latestMetrics.getData(DataType.DISTANCE_TOTAL)?.let { distance = it.total }
        }
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {}
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    /** A period is being played: the exercise starts, carries on after a break, or is picked up after the app started again (R-5). */
    fun run(context: Context) {
        running = true
        val exercise = client ?: HealthServices.getClient(context.applicationContext).exerciseClient.also { client = it }
        scope.launch {
            runCatching {
                val info = exercise.getCurrentExerciseInfoAsync().await()
                exercise.setUpdateCallback(callback)
                if (info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) {
                    started = true
                    exercise.resumeExerciseAsync().await()
                } else if (!started) {
                    val supported = exercise.getCapabilitiesAsync().await().getExerciseTypeCapabilities(ExerciseType.SOCCER).supportedDataTypes
                    val wanted = buildSet<DataType<*, *>> {
                        if (hasHeartRate(context)) add(DataType.HEART_RATE_BPM)
                        if (hasLocation(context)) { add(DataType.LOCATION); add(DataType.SPEED) }
                        add(DataType.DISTANCE_TOTAL)
                    }.filter { it in supported }.toSet()
                    val config = ExerciseConfig.builder(ExerciseType.SOCCER).setDataTypes(wanted)
                        .setIsAutoPauseAndResumeEnabled(false).setIsGpsEnabled(DataType.LOCATION in wanted).build()
                    exercise.startExerciseAsync(config).await()
                    started = true
                }
            }
        }
    }

    /** Between periods, and while play is suspended (ACT-2, TMR-13). */
    fun pause() {
        running = false
        heartRate = null
        val exercise = client ?: return
        if (started) scope.launch { runCatching { exercise.pauseExerciseAsync().await() } }
    }

    /**
     * TMR-13: a match that came back suspended after the app started again (R-5): the exercise it left running or
     * paused is picked up and kept paused, as it would be at a break (ACT-2), until Resume runs it again.
     */
    fun holdPaused(context: Context) {
        running = false
        heartRate = null
        val exercise = client ?: HealthServices.getClient(context.applicationContext).exerciseClient.also { client = it }
        scope.launch {
            runCatching {
                val info = exercise.getCurrentExerciseInfoAsync().await()
                if (info.exerciseTrackedStatus == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) {
                    started = true
                    exercise.setUpdateCallback(callback)
                    exercise.pauseExerciseAsync().await()
                }
            }
        }
    }

    /** Full time or a canceled match. */
    fun end() {
        running = false
        heartRate = null
        freshFix = null
        val exercise = client ?: return
        if (started) scope.launch { runCatching { exercise.endExerciseAsync().await() } }
        started = false
        distance = null
    }

    /** The position measured since the last sample, if any: latitude and longitude, and the speed. */
    fun takeFix(): Pair<DoubleArray, Double?>? = freshFix.also { freshFix = null }
}

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
    fun sample(created: Long, now: Long, fix: Pair<DoubleArray, Double?>?, heartRate: Int?): Boolean? {
        if (!resume(created)) return null
        val track = current ?: return null
        val lat = fix?.first?.get(0)?.let { Math.round(it * 1_000_000).toInt() }
        val lon = fix?.first?.get(1)?.let { Math.round(it * 1_000_000).toInt() }
        val speed = fix?.second?.takeIf { it >= 0 }?.let { Math.round(it * 100).toInt() }
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
