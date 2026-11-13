package app.lawfive.watch

import app.lawfive.data.SyncActivity
import app.lawfive.data.json
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.File

// The Garmin watch through the phone (APP-7): the watch's sync requests (SYNC-1 to SYNC-12) arrive
// as messages and go to the server from here, with the watch's own token, so the server sees the
// watch as it always has. Without signal (at the ground) what the watch sends waits in an outbox
// here and the watch is told 202 (kept); it asks for its next matches and gets the ones fetched
// last, with fees it marked since. The outbox goes, oldest first, as soon as there's signal.

/** What the relay keeps between runs: the watches it has heard from and what waits to go. */
@Serializable
data class RelayState(val watches: List<RelayWatch> = emptyList(), val outbox: List<RelayItem> = emptyList())

@Serializable
data class RelayWatch(
    val token: String,
    val device: String,
    val server: String,
    /** The last answer to GET /v1/watch/matches, for when there's no signal. */
    val matches: JsonElement? = null,
    val fetchedAt: Long = 0,
    val seenAt: Long = 0,
)

@Serializable
data class RelayItem(val token: String, val device: String, val server: String, val path: String, val body: JsonElement, val at: Long)

/** A request on the watch's behalf: its status and answer, or null when the server couldn't be reached. */
fun interface WatchTransport {
    suspend fun send(server: String, method: String, path: String, body: JsonElement?, token: String, device: String): Pair<Int, JsonElement?>?
}

class WatchRelay(
    private val file: File?,
    private val transport: WatchTransport,
    /** The server the phone is signed in to, or null when signed out. */
    private val phoneServer: () -> String?,
    private val now: () -> Long = System::currentTimeMillis,
) {
    /** What the sync screen shows of the watch's matches and tracks (APP-16). */
    var activity: SyncActivity? = null
    /** A match from the watch reached the server: the phone fetches it, for its summary (APP-26). */
    var matchSent: (() -> Unit)? = null
    private val mutex = Mutex()
    /** One send at a time (the watch's requests and the phone's sync), so nothing goes twice or out of order. */
    private val sending = Mutex()
    private val _state = MutableStateFlow(load())
    val state: StateFlow<RelayState> = _state

    /** The answer to one message from the watch, or null when it isn't one of LawFive's. */
    suspend fun handle(message: JsonObject): JsonObject? {
        if (message["lawfive"]?.jsonPrimitive?.longOrNull != 1L) return null
        val id = message["id"] ?: JsonNull
        val server = message.text("server")
        val mine = server != null && phoneServer()?.let { same(it, server) } == true
        return when (message.text("kind")) {
            // Signed in to another server (or not at all): the watch goes straight to its own.
            "hello" -> answer(id, if (mine) 200 else 409)
            "request" -> if (!mine) answer(id, 409) else request(id, server!!, message)
            else -> null
        }
    }

    private suspend fun request(id: JsonElement, server: String, message: JsonObject): JsonObject {
        val method = message.text("method") ?: "GET"
        val path = message.text("path") ?: ""
        val token = message.text("token") ?: return answer(id, 401)
        val device = message.text("device") ?: "garmin"
        // Only the watch's own endpoints go through here, written plainly (SEC-11): no dots or escapes that
        // would turn into another path once the address is made.
        if (!watchPath.matches(path)) return answer(id, 404)
        val body = message["body"]?.takeUnless { it is JsonNull }
        if (method == "POST") report(path, body, sent = false)
        val result = sending.withLock {
            // What waits goes first, so a pitch never overtakes the match it's for.
            if (sendWaiting(token)) transport.send(server, method, path, body, token, device) else null
        }
        if (result != null) {
            val (code, data) = result
            // APP-7: a watch is remembered (for its matches, and a place in the five) only once the server has
            // taken its token, so a message that only claims to be a watch's can't push a real one out.
            if (code in 200..299) remember(token, device, server)
            if (method == "POST") report(path, body, sent = true)
            if (method == "GET" && path == MATCHES && code == 200) cache(token, data)
            if (code == 401) forget(token)
            return answer(id, code, data)
        }
        return if (method == "POST") {
            val item = RelayItem(token, device, server, path, body ?: JsonObject(emptyMap()), now())
            // Far bigger than anything the watch sends: not kept here, so the watch keeps it and tries again.
            if (json.encodeToString(JsonElement.serializer(), item.body).length > MAX_ITEM_CHARS) return answer(id, NO_SIGNAL)
            report(path, body, sent = false, kept = true)
            mutex.withLock { update { it.copy(outbox = capped(it.outbox + item, it.watches)) } }
            answer(id, KEPT)
        } else {
            val cached = _state.value.watches.firstOrNull { it.token == token }?.matches
            if (path == MATCHES && cached != null) answer(id, 200, withQueuedFees(token, cached)) else answer(id, NO_SIGNAL)
        }
    }

    /**
     * Sends what waits for one watch (or every watch), oldest first. False when something is
     * still waiting because the server couldn't be reached.
     */
    private suspend fun sendWaiting(token: String? = null): Boolean {
        while (true) {
            val next = _state.value.outbox.firstOrNull { token == null || it.token == token } ?: return true
            report(next.path, next.body, sent = false)
            val result = transport.send(next.server, "POST", next.path, next.body, next.token, next.device) ?: return false
            when {
                // Server trouble: try again later.
                result.first >= 500 -> return false
                // The watch was unlinked: what it sent has nowhere to go.
                result.first == 401 -> forget(next.token)
                // Kept, or one the server won't take (as the watch drops those).
                else -> {
                    if (result.first in 200..299) remember(next.token, next.device, next.server)
                    report(next.path, next.body, sent = true)
                    mutex.withLock { update { it.copy(outbox = it.outbox - next) } }
                }
            }
        }
    }

    /** APP-16: a match or a piece of its track, as it goes. Fees, the pitch and the like are too small to mention. */
    private fun report(path: String, body: JsonElement?, sent: Boolean, kept: Boolean = false) {
        val b = body as? JsonObject ?: return
        val created = b["created"]?.jsonPrimitive?.longOrNull ?: return
        when (path) {
            RECORDS -> {
                val home = b.text("homeName") ?: b.text("home") ?: "Home"
                val away = b.text("awayName") ?: b.text("away") ?: "Away"
                activity?.watchMatch(created, "$home v $away", sent, kept)
                if (sent) matchSent?.invoke()
            }
            TRACKS -> {
                val index = b["index"]?.jsonPrimitive?.longOrNull?.toInt() ?: return
                val count = b["count"]?.jsonPrimitive?.longOrNull?.toInt() ?: return
                if (sent || kept) activity?.watchTrack(created, index, count, kept)
            }
        }
    }

    /**
     * After the phone syncs: what waits goes, and each watch's next matches are fetched for later,
     * marked as fetched ahead (SYNC-14's prefetch), so the server doesn't take them for being on the
     * watch until the watch itself asks.
     */
    suspend fun refresh() = sending.withLock {
        sendWaiting()
        val phone = phoneServer() ?: return@withLock
        for (w in _state.value.watches.filter { same(it.server, phone) }) {
            val query = JsonObject(mapOf("limit" to JsonPrimitive(MAX_MATCHES), "prefetch" to JsonPrimitive("true")))
            val result = transport.send(w.server, "GET", MATCHES, query, w.token, w.device) ?: return@withLock
            when (result.first) {
                200 -> cache(w.token, result.second)
                401 -> forget(w.token)
            }
        }
    }

    /** Fee changes still waiting, on the matches answered from the last fetch (SYNC-11). */
    private fun withQueuedFees(token: String, matches: JsonElement): JsonElement {
        val paid = _state.value.outbox.filter { it.token == token && it.path == "/v1/watch/fee" }
            .mapNotNull { item -> (item.body as? JsonObject)?.let { b -> b.text("matchId")?.let { it to b["paid"]?.jsonPrimitive?.booleanOrNull } } }
            .toMap()
        if (paid.isEmpty()) return matches
        val root = matches as? JsonObject ?: return matches
        val list = root["matches"] as? JsonArray ?: return matches
        return JsonObject(root + ("matches" to JsonArray(list.map { m ->
            val match = m as? JsonObject
            val fee = match?.get("fee") as? JsonObject
            val change = match?.text("id")?.let { paid[it] }
            if (fee != null && change != null) JsonObject(match + ("fee" to JsonObject(fee + ("paid" to JsonPrimitive(change))))) else m
        })))
    }

    private suspend fun remember(token: String, device: String, server: String) = mutex.withLock {
        update { s ->
            val known = s.watches.firstOrNull { it.token == token }
            val watch = (known ?: RelayWatch(token, device, server)).copy(device = device, server = server, seenAt = now())
            s.copy(watches = listOf(watch) + s.watches.filter { it.token != token }.take(MAX_WATCHES - 1))
        }
    }

    /**
     * APP-7: the outbox at most [MAX_OUTBOX] long. Beyond it, what goes first is what matters least: anything
     * from a token the server has never taken, then a track's piece before anything else and a match record
     * last of all (so a record never goes before its track), oldest first within each.
     */
    private fun capped(outbox: List<RelayItem>, watches: List<RelayWatch>): List<RelayItem> {
        if (outbox.size <= MAX_OUTBOX) return outbox
        val known = watches.map { it.token }.toSet()
        fun rank(item: RelayItem) = when (item.path) { TRACKS -> 0; RECORDS -> 2; else -> 1 }
        val dropped = outbox.withIndex()
            .sortedWith(compareBy({ it.value.token in known }, { rank(it.value) }, { it.value.at }, { it.index }))
            .take(outbox.size - MAX_OUTBOX).map { it.index }.toSet()
        return outbox.filterIndexed { i, _ -> i !in dropped }
    }

    private suspend fun cache(token: String, data: JsonElement?) = mutex.withLock {
        update { s -> s.copy(watches = s.watches.map { if (it.token == token) it.copy(matches = data, fetchedAt = now()) else it }) }
    }

    /** APP-21: the account's gone, so what its watches left here has nowhere to go. */
    suspend fun forgetEverything() = mutex.withLock {
        update { RelayState() }
    }

    private suspend fun forget(token: String) = mutex.withLock {
        update { s -> s.copy(watches = s.watches.filter { it.token != token }, outbox = s.outbox.filter { it.token != token }) }
    }

    private fun update(change: (RelayState) -> RelayState) {
        val next = change(_state.value)
        _state.value = next
        file?.let { f ->
            f.parentFile?.mkdirs()
            val temp = File(f.path + ".new")
            temp.writeText(json.encodeToString(RelayState.serializer(), next))
            temp.renameTo(f)
        }
    }

    private fun load(): RelayState =
        file?.takeIf { it.exists() }?.let { runCatching { json.decodeFromString(RelayState.serializer(), it.readText()) }.getOrNull() } ?: RelayState()

    private fun answer(id: JsonElement, code: Int, data: JsonElement? = null) =
        JsonObject(buildMap {
            put("lawfive", JsonPrimitive(1))
            put("id", id)
            put("code", JsonPrimitive(code))
            if (data != null) put("data", data)
        })

    companion object {
        const val MATCHES = "/v1/watch/matches"
        const val RECORDS = "/v1/watch/records"
        const val TRACKS = "/v1/watch/tracks"
        /** The watch's own endpoints: /v1/watch/ and plain letters, digits, hyphens and slashes. */
        private val watchPath = Regex("^/v1/watch/[A-Za-z0-9-]+(/[A-Za-z0-9-]+)*$")
        /** As the watch asks (its Sync.MAX_MATCHES). */
        const val MAX_MATCHES = 10
        const val MAX_WATCHES = 5
        /**
         * What the outbox holds at most. A Garmin watch keeps up to 10 matches and hands each to the phone as it's
         * sent (TRK-7), with its track in five-minute pieces: about 25 for a 90-minute match, 35 with extra time.
         * 500 is a whole tournament day or two without signal, about 3 MB.
         */
        const val MAX_OUTBOX = 500
        /** A message's body the outbox keeps at most: a track's piece is about 4 KB, a match record less. */
        const val MAX_ITEM_CHARS = 64 * 1024
        /** The watch's Phone.KEPT: kept here until there's signal. */
        const val KEPT = 202
        /** No signal and nothing fetched before: the watch shows "Couldn't reach server". */
        const val NO_SIGNAL = -2

        /** The same server, the hosted service's two addresses (its API and its web app) being one. */
        fun same(a: String, b: String) = canonical(a) == canonical(b)

        private fun canonical(url: String) = url.trim().trimEnd('/').lowercase().replace("https://app.lawfive.app", "https://api.lawfive.app")
    }
}

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull

/** A message from the watch (Monkey C values as the Connect IQ SDK gives them) as JSON. */
fun toJson(value: Any?): JsonElement = when (value) {
    null -> JsonNull
    is Map<*, *> -> JsonObject(value.entries.associate { (k, v) -> k.toString() to toJson(v) })
    is List<*> -> JsonArray(value.map(::toJson))
    is Array<*> -> JsonArray(value.map(::toJson))
    is Boolean -> JsonPrimitive(value)
    is Number -> JsonPrimitive(value)
    is Char -> JsonPrimitive(value.toString())
    else -> JsonPrimitive(value.toString())
}

/** JSON as values the SDK sends to the watch: whole numbers as Integer (Monkey C's Number) when they fit. */
fun fromJson(value: JsonElement): Any? = when (value) {
    is JsonNull -> null
    is JsonObject -> HashMap<String, Any?>().apply { value.forEach { (k, v) -> put(k, fromJson(v)) } }
    is JsonArray -> ArrayList(value.map(::fromJson))
    is JsonPrimitive -> when {
        value.isString -> value.content
        value.booleanOrNull != null -> value.booleanOrNull
        value.longOrNull != null -> value.longOrNull!!.let { if (it in Int.MIN_VALUE..Int.MAX_VALUE) it.toInt() else it }
        else -> value.doubleOrNull
    }
}
