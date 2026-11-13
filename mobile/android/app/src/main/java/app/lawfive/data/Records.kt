package app.lawfive.data

import android.util.Log
import app.lawfive.schema.Competition
import app.lawfive.schema.Match
import app.lawfive.schema.MatchRecord
import app.lawfive.schema.MatchTemplate
import app.lawfive.schema.Referee
import app.lawfive.schema.UserSettings
import app.lawfive.schema.Venue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

// The account's records on the phone, typed (APP-3). Reading decodes the stored JSON into the
// generated types; saving puts the typed record's fields over the stored JSON, so fields this
// version of the app doesn't know are kept, then queues it for the server.

object Collections {
    const val MATCHES = "matches"
    const val MATCH_RECORDS = "match-records"
    const val VENUES = "venues"
    const val REFEREES = "referees"
    const val COMPETITIONS = "competitions"
    const val TEMPLATES = "match-templates"
    const val SETTINGS = "settings"
}

class Records(private val db: LawFiveDb, private val changed: () -> Unit) {
    private fun <T> decode(row: RecordRow, serializer: KSerializer<T>): T? = try {
        json.decodeFromString(serializer, row.json)
    } catch (e: Exception) {
        Log.w("LawFive", "Couldn't read ${row.collection}/${row.id}: ${e.message}")
        null
    }

    fun <T> list(collection: String, serializer: KSerializer<T>): Flow<List<T>> =
        db.records().observe(collection).map { rows -> rows.mapNotNull { decode(it, serializer) } }

    fun <T> one(collection: String, id: String, serializer: KSerializer<T>): Flow<T?> =
        db.records().observeOne(collection, id).map { row -> row?.takeIf { !it.deleted }?.let { decode(it, serializer) } }

    val matches get() = list(Collections.MATCHES, Match.serializer())
    val matchRecords get() = list(Collections.MATCH_RECORDS, MatchRecord.serializer())
    val venues get() = list(Collections.VENUES, Venue.serializer())
    val referees get() = list(Collections.REFEREES, Referee.serializer())
    val competitions get() = list(Collections.COMPETITIONS, Competition.serializer())
    val templates get() = list(Collections.TEMPLATES, MatchTemplate.serializer())
    val settings: Flow<UserSettings?> get() = list(Collections.SETTINGS, UserSettings.serializer()).map { it.firstOrNull() }

    /** APP-4: the defaults for this phone's language until the account has a settings record, kept until the account changes. */
    @Volatile private var defaults = SettingsDefaults.forLocale()
    private val settingsLock = Mutex()

    /** The account's settings, or the phone's defaults (as the website's) while it has none. */
    val settingsOrDefaults: Flow<UserSettings> get() = settings.map { it ?: defaults }

    /**
     * APP-4: saves a change to the settings. With no record yet, the first change makes it from the
     * defaults, with this phone's time zone (PLAN-9). Changes made quickly one after another go in turn.
     */
    suspend fun saveSettings(change: (UserSettings) -> UserSettings) = settingsLock.withLock {
        val next = SettingsDefaults.toSave(settings.first(), defaults, java.time.ZoneId.systemDefault().id, change)
        save(Collections.SETTINGS, next.id, UserSettings.serializer(), next)
    }

    /** Signed out: the next account's defaults get an id of their own, as its record will. */
    fun forgetDefaults() {
        defaults = SettingsDefaults.forLocale()
    }

    /** Saves a record on the phone and queues it for the server. */
    suspend fun <T> save(collection: String, id: String, serializer: KSerializer<T>, value: T) {
        val existing = db.records().get(collection, id)
        val raw = existing?.json?.let { json.parseToJsonElement(it).jsonObject } ?: JsonObject(emptyMap())
        val updated = patched(raw, serializer, value)
        db.records().upsert(listOf(RecordRow(collection, id, updated.toString(), existing?.version ?: 0, deleted = false)))
        val pending = db.outbox().pending(collection, id)
        db.outbox().upsert(
            OutboxRow(
                seq = pending?.seq ?: 0,
                collection = collection,
                id = id,
                op = "put",
                json = updated.toString(),
                // The record as the server last had it, for merging if it changes there meanwhile.
                base = if (pending != null) pending.base else existing?.json,
                createdAt = pending?.createdAt ?: System.currentTimeMillis(),
            ),
        )
        changed()
    }

    /** Deletes a record on the phone and queues the deletion; one never sent just goes. */
    suspend fun delete(collection: String, id: String) {
        val existing = db.records().get(collection, id) ?: return
        db.outbox().removeFor(collection, id)
        if (existing.version == 0L) {
            db.records().remove(collection, id)
        } else {
            db.records().upsert(listOf(existing.copy(deleted = true)))
            db.outbox().upsert(OutboxRow(collection = collection, id = id, op = "delete", json = null, base = null, createdAt = System.currentTimeMillis()))
        }
        changed()
    }

    companion object {
        /** The typed record's fields over the stored JSON: fields the type doesn't know are kept. */
        fun <T> patched(raw: JsonObject, serializer: KSerializer<T>, value: T): JsonObject {
            val known = (0 until serializer.descriptor.elementsCount).map { serializer.descriptor.getElementName(it) }.toSet()
            val encoded = json.encodeToJsonElement(serializer, value).jsonObject
            return JsonObject(raw.filterKeys { it !in known } + encoded)
        }
    }
}
