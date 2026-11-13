package app.lawfive.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull
import java.io.IOException

// Sync (APP-3): the outbox goes up first, oldest first, then everything changed on the server since
// the last time comes down (GET /v1/changes). A record changed on the server meanwhile gets the
// phone's changed fields put on top of its newer copy and is sent again; a change the server
// refuses is dropped, and said so.

data class SyncStatus(
    val running: Boolean = false,
    /** Why the last sync didn't finish, in words, or null. */
    val problem: String? = null,
    /** Changes the server refused, dropped from the outbox (shown once). */
    val refused: List<String> = emptyList(),
)

class SyncEngine(
    private val api: Api, private val db: LawFiveDb, private val session: Session,
    /** What the sync screen shows (APP-16). */
    private val activity: SyncActivity? = null,
    /** The matches from a watch waiting for their summary (APP-26). */
    private val fromWatch: FromWatch? = null,
    private val onSignedOut: suspend () -> Unit,
) {
    private val mutex = Mutex()
    private val _status = MutableStateFlow(SyncStatus())
    val status: StateFlow<SyncStatus> = _status

    /** Runs a sync unless one is running; true when it all worked. */
    suspend fun sync(): Boolean {
        if (!session.current.signedIn || mutex.isLocked) return false
        return mutex.withLock {
            _status.value = _status.value.copy(running = true, problem = null)
            activity?.syncStarted()
            try {
                push()
                pull()
                _status.value = _status.value.copy(running = false)
                activity?.syncFinished(null)
                true
            } catch (e: ApiException) {
                if (e.status == 401) {
                    onSignedOut()
                } else if (e.status == 403 && e.message?.contains("approval") == true) {
                    session.setStatus("pending")
                }
                _status.value = _status.value.copy(running = false, problem = e.message)
                activity?.syncFinished(e.message ?: "The server didn't answer")
                false
            } catch (e: IOException) {
                _status.value = _status.value.copy(running = false, problem = "No connection to the server")
                activity?.syncFinished("No connection to the server")
                false
            }
        }
    }

    fun clearRefused() {
        _status.value = _status.value.copy(refused = emptyList())
    }

    private suspend fun push() {
        val rows = db.outbox().all()
        for ((i, row) in rows.withIndex()) {
            activity?.pushing(i, rows.size, row.json?.let { runCatching { describe(row.collection, json.parseToJsonElement(it).jsonObject) }.getOrNull() } ?: row.collection.trimEnd('s'))
            when (row.op) {
                "delete" -> {
                    val version = db.records().get(row.collection, row.id)?.version ?: 0
                    try {
                        api.call("DELETE", "/v1/${row.collection}/${row.id}" + if (version > 0) "?version=$version" else "")
                    } catch (e: ApiException) {
                        when (e.status) {
                            404 -> Unit
                            // Changed elsewhere meanwhile: it was deleted on the phone, so it goes anyway.
                            409 -> e.body?.get("current")?.jsonObject?.get("version")?.jsonPrimitive?.longOrNull?.let {
                                api.call("DELETE", "/v1/${row.collection}/${row.id}?version=$it")
                            }
                            else -> throw e
                        }
                    }
                    db.outbox().remove(row.seq)
                    db.records().remove(row.collection, row.id)
                }
                else -> {
                    val local = json.parseToJsonElement(row.json!!).jsonObject
                    val known = db.records().get(row.collection, row.id)?.version ?: 0
                    val saved = try {
                        put(row.collection, row.id, local, known)
                    } catch (e: ApiException) {
                        when {
                            e.status == 409 && e.body?.get("current") is JsonObject -> {
                                // Changed elsewhere: the phone's changes on top of the newer copy.
                                val current = e.body["current"]!!.jsonObject
                                val base = row.base?.let { json.parseToJsonElement(it).jsonObject } ?: JsonObject(emptyMap())
                                val merged = merge(base, local, current)
                                put(row.collection, row.id, merged, current["version"]?.jsonPrimitive?.long ?: 0)
                            }
                            e.status == 400 || e.status == 409 || e.status == 404 -> {
                                // The server won't take it: dropped, and said so.
                                _status.value = _status.value.copy(refused = _status.value.refused + "${describe(row.collection, local)}: ${e.message}")
                                db.records().remove(row.collection, row.id)
                                null
                            }
                            else -> throw e
                        }
                    }
                    db.outbox().remove(row.seq)
                    if (saved != null) store(row.collection, saved)
                }
            }
        }
    }

    private suspend fun put(collection: String, id: String, record: JsonObject, version: Long): JsonObject {
        val body = JsonObject(record.filterKeys { it != "updatedAt" && it != "deletedAt" && it != "version" } + if (version > 0) mapOf("version" to JsonPrimitive(version)) else emptyMap())
        return api.call("PUT", "/v1/$collection/$id", body)!!.jsonObject
    }

    private suspend fun pull() {
        var cursor = session.current.cursor
        // APP-16, APP-26: the first sync after signing in, by its own flag: an empty account's cursor
        // stays at 0 after it, and its own first save mustn't count as its history.
        val first = session.current.firstSync
        while (true) {
            val page = api.call("GET", "/v1/changes?since=$cursor&limit=500")!!.jsonObject
            // A record still waiting in the outbox keeps the phone's copy; the next push merges it.
            val pending = db.outbox().pendingKeys().toSet()
            val rows = page["changes"]!!.jsonArray.mapNotNull { change ->
                val c = change.jsonObject
                val collection = c["collection"]!!.jsonPrimitive.content
                val record = c["record"]!!.jsonObject
                val id = record["id"]!!.jsonPrimitive.content
                if ("$collection/$id" in pending) null else rowOf(collection, record)
            }
            // APP-26: the matches from a watch the phone hadn't had, looked for before they're kept.
            val arrived = page["changes"]!!.jsonArray.map { it.jsonObject }.filter { c ->
                val collection = c["collection"]!!.jsonPrimitive.content
                val record = c["record"]!!.jsonObject
                FromWatch.arrived(collection, record, first) { db.records().get(collection, record["id"]!!.jsonPrimitive.content) != null }
            }.map { it["record"]!!.jsonObject["id"]!!.jsonPrimitive.content }
            db.records().upsert(rows)
            fromWatch?.add(arrived)
            activity?.pulled(
                page["changes"]!!.jsonArray.groupingBy { it.jsonObject["collection"]!!.jsonPrimitive.content }.eachCount(),
                page["changes"]!!.jsonArray.associate { it.jsonObject["collection"]!!.jsonPrimitive.content to describe(it.jsonObject["collection"]!!.jsonPrimitive.content, it.jsonObject["record"]!!.jsonObject) },
                first,
            )
            cursor = page["cursor"]!!.jsonPrimitive.long
            session.synced(cursor, System.currentTimeMillis())
            if (page["more"]?.jsonPrimitive?.booleanOrNull != true) break
        }
        if (first) session.firstSyncDone()
    }

    private suspend fun store(collection: String, record: JsonObject) {
        db.records().upsert(listOf(rowOf(collection, record)))
    }

    private fun rowOf(collection: String, record: JsonObject) = RecordRow(
        collection = collection,
        id = record["id"]!!.jsonPrimitive.content,
        json = record.toString(),
        version = record["version"]?.jsonPrimitive?.longOrNull ?: 0,
        deleted = record["deletedAt"].let { it != null && it !is JsonNull },
    )

    companion object {
        /**
         * The phone's changes on top of a newer copy: each top-level field the phone changed (from
         * `base`, the record before it changed it) takes the phone's value; everything else is the
         * newer copy's.
         */
        fun merge(base: JsonObject, local: JsonObject, current: JsonObject): JsonObject {
            val result = current.toMutableMap()
            for (key in base.keys + local.keys) {
                if (key == "version" || key == "updatedAt" || key == "deletedAt" || key == "id") continue
                if (local[key] != base[key]) {
                    val value = local[key]
                    if (value == null) result.remove(key) else result[key] = value
                }
            }
            return JsonObject(result)
        }

        /** A record in a few words, for saying what wasn't saved. */
        fun describe(collection: String, record: JsonObject): String {
            val name = record["name"].str() ?: listOfNotNull(record["home"].str("name"), record["away"].str("name")).joinToString(" v ").ifEmpty { null }
            return name ?: collection.trimEnd('s')
        }

        private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

        @Suppress("unused")
        private fun JsonElement?.flag(): Boolean = (this as? JsonPrimitive)?.boolean == true
    }
}
