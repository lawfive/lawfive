package app.lawfive.data

import app.lawfive.schema.Stats
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import java.io.File
import java.time.Instant

// Stats on the phone (STAT-13): GET /v1/stats for the filters chosen, worked out by the server as
// for the website. The last answer for each set of filters is kept on the phone, with when it came,
// so the Stats tab shows something at a ground without signal.

/** An answer, and when it came. */
@Serializable
data class KeptStats(val at: String, val stats: Stats)

class StatsStore(private val api: Api, private val file: File) {
    private val lock = Mutex()
    private var kept: Map<String, KeptStats>? = null

    /** The last answer for these filters, if there is one. */
    suspend fun kept(query: String): KeptStats? = lock.withLock { all()[query] }

    /** Asks the server, and keeps the answer. Throws when it can't be reached. */
    suspend fun fetch(query: String): KeptStats {
        val body = api.call("GET", "/v1/stats${if (query.isEmpty()) "" else "?$query"}") ?: throw ApiException(0, "No answer", null)
        val answer = KeptStats(AppClock.now().toString(), json.decodeFromJsonElement(Stats.serializer(), body))
        lock.withLock {
            // The newest dozen, which covers the filters anyone flips between.
            val next = (all() + (query to answer)).entries.sortedByDescending { it.value.at }.take(KEEP).associate { it.key to it.value }
            kept = next
            withContext(Dispatchers.IO) { runCatching { file.writeText(json.encodeToString(serializer, next)) } }
        }
        return answer
    }

    /** Signed out: another account's stats have no place here. */
    suspend fun clear() = lock.withLock {
        kept = emptyMap()
        withContext(Dispatchers.IO) { file.delete() }
    }

    private suspend fun all(): Map<String, KeptStats> = kept ?: withContext(Dispatchers.IO) {
        runCatching { json.decodeFromString(serializer, file.readText()) }.getOrDefault(emptyMap())
    }.also { kept = it }

    private companion object {
        const val KEEP = 12
        val serializer = MapSerializer(String.serializer(), KeptStats.serializer())
    }
}
