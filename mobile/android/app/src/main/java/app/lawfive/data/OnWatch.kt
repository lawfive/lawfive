package app.lawfive.data

import app.lawfive.schema.MatchOnWatch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

// SYNC-14: which matches are on which of the account's watches (GET /v1/devices/matches), fetched
// at each sync with the watches linked (GET /v1/devices), and kept on the phone for when there's
// no signal at the ground. A list the phone gives a Garmin watch without signal isn't known to the
// server until the watch's next online sync.

@Serializable
data class OnWatchSaved(
    val matches: List<MatchOnWatch> = emptyList(),
    /** The names of the account's linked watches, at the last fetch; null before one. */
    val watches: List<String>? = null,
)

class OnWatchStore(private val api: Api, private val file: File) {
    private val _state = MutableStateFlow(load())
    val state: StateFlow<OnWatchSaved> = _state

    /** After a sync: the server's latest; what was kept stays when it doesn't answer. */
    suspend fun refresh() {
        val devices = runCatching { api.call("GET", "/v1/devices")!!.jsonObject["devices"]!!.jsonArray.map { it.jsonObject } }.getOrNull() ?: return
        val watches = devices.filter { it["kind"]?.jsonPrimitive?.contentOrNull in Devices.watchKinds }.mapNotNull { it["name"]?.jsonPrimitive?.contentOrNull }
        // A server from before SYNC-14 has no such list: nothing is on a watch as far as it says.
        val matches = runCatching { api.call("GET", "/v1/devices/matches")?.jsonObject?.get("matches")?.let { json.decodeFromJsonElement(ListSerializer(MatchOnWatch.serializer()), it) } }
            .getOrNull() ?: emptyList()
        _state.value = OnWatchSaved(matches, watches)
        withContext(Dispatchers.IO) { runCatching { file.writeText(json.encodeToString(OnWatchSaved.serializer(), _state.value)) } }
    }

    /** Signed out: another account's watches have no place here. */
    fun clear() {
        _state.value = OnWatchSaved()
        file.delete()
    }

    private fun load(): OnWatchSaved = runCatching { json.decodeFromString(OnWatchSaved.serializer(), file.readText()) }.getOrDefault(OnWatchSaved())

    companion object {
        /** "Venu 2" from "Garmin Venu 2": the watch as its owner calls it, as the website's watchShortName; "Garmin watch" stays whole. */
        fun watchName(name: String): String {
            val short = name.replaceFirst(Regex("^Garmin\\s+"), "")
            return if (short.equals("watch", ignoreCase = true) || short.isBlank()) name else short
        }

        /** A line of the Watch fact, and how it reads: plain, amber (an older version), or muted (not on one). */
        enum class Tone { Plain, Old, None }

        data class Line(val text: String, val tone: Tone)

        /**
         * SYNC-14: what a match's page says, as the website's: a line for each watch that has it, "On
         * your Venu 2 since 8:12 PM" ("since yesterday, 8:12 PM", "since Sat, Nov 7, 8:12 PM"), or "On
         * your Venu 2, an older version: sync the watch"; "Not on a watch yet" while a watch is linked;
         * nothing with no watch linked, or before the first fetch. `time` writes a time of day as the
         * phone does; `day` a date ("Sat, Nov 7").
         */
        fun lines(matchId: String, saved: OnWatchSaved, zone: ZoneId, now: Instant, time: (ZonedDateTime) -> String, day: (ZonedDateTime) -> String): List<Line> {
            if (saved.watches.isNullOrEmpty()) return emptyList()
            val here = saved.matches.filter { it.matchId == matchId }.distinctBy { it.deviceId }
            if (here.isEmpty()) return listOf(Line("Not on a watch yet", Tone.None))
            val today = now.atZone(zone).toLocalDate()
            return here.map { w ->
                val name = watchName(w.name)
                val since = runCatching { Instant.parse(w.since) }.getOrNull()?.atZone(zone)
                when {
                    !w.upToDate -> Line("On your $name, an older version: sync the watch", Tone.Old)
                    since == null -> Line("On your $name", Tone.Plain)
                    else -> {
                        val days = java.time.temporal.ChronoUnit.DAYS.between(today, since.toLocalDate())
                        val whenText = when (days) {
                            0L -> time(since)
                            -1L -> "yesterday, ${time(since)}"
                            1L -> "tomorrow, ${time(since)}"
                            else -> "${day(since)}, ${time(since)}"
                        }
                        Line("On your $name since $whenText", Tone.Plain)
                    }
                }
            }
        }
    }
}
