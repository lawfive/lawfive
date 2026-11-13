package app.lawfive.data

import android.content.Context
import androidx.core.content.edit
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseRoute
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Length
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.Instant

/**
 * ACT-1, WCH-7: Health Connect isn't on watches, so a match refereed with the Wear OS watch is saved
 * there from the phone, once synced: a soccer exercise with its route, heart rate and distance from the
 * watch's track. Only Wear OS matches: Garmin's go to Garmin Connect, and an Apple Watch's to Apple
 * Health. On unless switched off in Settings; each match once, under its record's id, so a second save
 * replaces the first rather than adding to it.
 */
class HealthSave(context: Context, private val api: Api, private val db: LawFiveDb) {
    private val context = context.applicationContext
    private val prefs = context.getSharedPreferences("health", Context.MODE_PRIVATE)
    private val _on = MutableStateFlow(prefs.getBoolean("on", true))
    val on: StateFlow<Boolean> = _on

    val permissions = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
        HealthPermission.getWritePermission(DistanceRecord::class),
        HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE,
    )

    /** Health Connect is on this phone (built in from Android 14, an app before). */
    val available get() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    suspend fun allowed(): Boolean = available && HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions()
        .containsAll(permissions - HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE)

    fun setOn(on: Boolean) {
        prefs.edit { putBoolean("on", on) }
        _on.value = on
    }

    /** After a sync: the Wear OS matches not saved yet. A match without a track yet is tried again next time. */
    suspend fun saveNew() {
        if (!_on.value || !allowed()) return
        val client = HealthConnectClient.getOrCreate(context)
        val route = HealthPermission.PERMISSION_WRITE_EXERCISE_ROUTE in client.permissionController.getGrantedPermissions()
        val saved = prefs.getStringSet("saved", emptySet())!!.toMutableSet()
        for (row in db.records().all(Collections.MATCH_RECORDS)) {
            if (row.id in saved) continue
            val record = runCatching { json.parseToJsonElement(row.json).jsonObject }.getOrNull() ?: continue
            if (record.text("device")?.startsWith("wearos:") != true) continue
            val track = runCatching { api.call("GET", "/v1/match-records/${row.id}/track")?.jsonObject?.get("track")?.jsonObject }.getOrNull()
            val match = record.text("matchId")?.let { db.records().get(Collections.MATCHES, it) }?.let { runCatching { json.parseToJsonElement(it.json).jsonObject }.getOrNull() }
            if (save(client, row.id, record, match, track, route)) {
                saved += row.id
                prefs.edit { putStringSet("saved", saved) }
            }
        }
    }

    /** Forgets what was saved, for signing out (Health Connect keeps its copies). */
    fun forget() = prefs.edit { remove("saved") }

    private suspend fun save(client: HealthConnectClient, id: String, record: JsonObject, match: JsonObject?, track: JsonObject?, withRoute: Boolean): Boolean {
        val records = records(id, record, match, track, withRoute) ?: return false
        return runCatching { client.insertRecords(records) }.isSuccess
    }

    companion object {
        /** The exercise, heart rate and distance for a Wear OS match, or null when it has no played time. */
        fun records(id: String, record: JsonObject, match: JsonObject?, track: JsonObject?, withRoute: Boolean, zone: java.time.ZoneId = java.time.ZoneId.systemDefault()): List<Record>? {
            val periods = (record["periods"] as? kotlinx.serialization.json.JsonArray)?.map { it.jsonObject } ?: return null
            val first = periods.firstOrNull()?.text("startedAt")?.let(Instant::parse) ?: return null
            val last = periods.last()
            val end = (last.text("startedAt")?.let(Instant::parse) ?: first).plusSeconds(last["playedSec"]?.jsonPrimitive?.longOrNull ?: 0)
            if (!end.isAfter(first)) return null
            val start = track?.text("start")?.let(Instant::parse) ?: first
            val device = Device(type = Device.TYPE_WATCH, model = record.text("device")?.substringAfter(":"))
            fun meta(kind: String) = Metadata.autoRecorded(device = device, clientRecordId = "$id-$kind", clientRecordVersion = 1)
            val offset = zone.rules.getOffset(first)

            val gps = track?.get("gps")?.jsonObject
            val locations = if (!withRoute || gps == null) emptyList() else {
                val t = gps["t"]!!.jsonArray
                val lat = gps["lat"]!!.jsonArray
                val lon = gps["lon"]!!.jsonArray
                t.indices.mapNotNull { i ->
                    val la = lat[i].jsonPrimitive.doubleOrNull ?: return@mapNotNull null
                    val lo = lon[i].jsonPrimitive.doubleOrNull ?: return@mapNotNull null
                    val at = start.plusMillis(t[i].jsonPrimitive.longOrNull ?: return@mapNotNull null)
                    if (at.isBefore(first) || at.isAfter(end)) null else ExerciseRoute.Location(time = at, latitude = la, longitude = lo)
                }
            }
            // "Ref Strikers U12 v Rovers U12", as the Garmin watch names its activity (ACT-1).
            fun team(side: String) = match?.get(side)?.let { it as? JsonObject }?.let { it.text("name") ?: it.text("alias") }
            val title = "Ref ${team("home") ?: "HOM"} v ${team("away") ?: "AWY"}"
            val records = buildList {
                add(ExerciseSessionRecord(
                    startTime = first, startZoneOffset = offset, endTime = end, endZoneOffset = offset,
                    exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_SOCCER, title = title, metadata = meta("session"),
                    exerciseRoute = locations.takeIf { it.size >= 2 }?.let(::ExerciseRoute),
                ))
                val hr = track?.get("heartRate")?.jsonObject
                if (hr != null) {
                    val t = hr["t"]!!.jsonArray
                    val bpm = hr["bpm"]!!.jsonArray
                    val samples = t.indices.mapNotNull { i ->
                        val at = start.plusMillis(t[i].jsonPrimitive.longOrNull ?: return@mapNotNull null)
                        val beats = bpm[i].jsonPrimitive.intOrNull?.toLong()?.takeIf { it in 1..300 } ?: return@mapNotNull null
                        if (at.isBefore(first) || at.isAfter(end)) null else HeartRateRecord.Sample(at, beats)
                    }
                    if (samples.isNotEmpty()) add(HeartRateRecord(first, offset, end, offset, samples, meta("heart")))
                }
                record["distanceM"]?.jsonPrimitive?.doubleOrNull?.takeIf { it > 0 }?.let {
                    add(DistanceRecord(first, offset, end, offset, Length.meters(it), meta("distance")))
                }
            }
            return records
        }

        private fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.contentOrNull
    }
}
