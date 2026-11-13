package app.lawfive.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.io.File

// What came in from the watch (APP-26): played matches a sync brought that the phone hadn't had,
// recorded on a watch, however they came (a Garmin through this phone, or a watch syncing by itself).
// They wait here, kept on the phone, until the summary showing them is closed, so a sync in the
// background or the app closing in between doesn't lose them.

class FromWatch(private val file: File?) {
    private val lock = Mutex()
    private val _waiting = MutableStateFlow(load())
    /** The match reports waiting to be shown, by id. */
    val waiting: StateFlow<List<String>> = _waiting

    suspend fun add(ids: List<String>) {
        if (ids.isEmpty()) return
        lock.withLock {
            _waiting.value = (_waiting.value + ids).distinct()
            save()
        }
    }

    /** Done, a match opened from it, or signed out. */
    suspend fun clear() = lock.withLock {
        _waiting.value = emptyList()
        save()
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        file ?: return@withContext
        runCatching { if (_waiting.value.isEmpty()) file.delete() else file.writeText(json.encodeToString(serializer, _waiting.value)) }
    }

    private fun load(): List<String> =
        file?.let { runCatching { json.decodeFromString(serializer, it.readText()) }.getOrNull() } ?: emptyList()

    companion object {
        private val serializer = ListSerializer(String.serializer())

        /**
         * A change that's a match from a watch: a match report with the watch that recorded it,
         * which the phone didn't have (`had`: a row before this page, asked last). Not on the first
         * sync after signing in (that's the account's history); a result entered on the website or a
         * phone has no `device`, and a correction or a watch sending a match again (RES-4) was had.
         */
        suspend fun arrived(collection: String, record: JsonObject, first: Boolean, had: suspend () -> Boolean): Boolean {
            if (first || collection != Collections.MATCH_RECORDS) return false
            if (record["deletedAt"].let { it != null && it !is JsonNull }) return false
            val device = (record["device"] as? JsonPrimitive)?.takeIf { it.isString }?.content
            return !device.isNullOrBlank() && !had()
        }
    }
}
