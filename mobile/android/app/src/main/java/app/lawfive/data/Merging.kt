package app.lawfive.data

import app.lawfive.schema.DuplicateGroups
import app.lawfive.schema.DuplicateMember
import app.lawfive.schema.LikelyDuplicates
import app.lawfive.schema.NotTheSame
import app.lawfive.schema.RefereeMerge
import app.lawfive.schema.RefereeMergeDraft
import app.lawfive.schema.RefereeMergePreview
import app.lawfive.schema.VenueMerge
import app.lawfive.schema.VenueMergeDraft
import app.lawfive.schema.VenueMergePreview
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.JsonElement

// Finding duplicates and merging them (DUP-11, DUP-12): the server works it all out (the groups,
// the likeliest, the preview of a merge from the choices so far) and the phone only shows it, so
// the website and both phones always agree. It needs a connection; only the last groups are kept,
// for the run, so the hints show at once.

/** What can be merged, by its collection in the API. */
enum class MergeKind(val collection: String) { Venues("venues"), Referees("referees") }

class Merging(private val api: Api) {
    /** The last groups for each, so the hints on the lists and pages show at once (DUP-13). */
    private val kept = mutableMapOf<MergeKind, DuplicateGroups>()

    fun kept(kind: MergeKind): DuplicateGroups? = kept[kind]

    private suspend fun <T> ask(serializer: KSerializer<T>, method: String, path: String, body: JsonElement? = null): T =
        json.decodeFromJsonElement(serializer, api.call(method, path, body) ?: throw ApiException(0, "No answer", null))

    /** Groups of likely duplicates across all of them (Find duplicates). */
    suspend fun duplicates(kind: MergeKind): DuplicateGroups =
        ask(DuplicateGroups.serializer(), "GET", "/v1/duplicates/${kind.collection}").also { kept[kind] = it }

    /** The likeliest few for one (Merge with…). */
    suspend fun likely(kind: MergeKind, id: String): List<DuplicateMember> = ask(LikelyDuplicates.serializer(), "GET", "/v1/${kind.collection}/$id/duplicates").likely

    suspend fun preview(id: String, draft: VenueMergeDraft): VenueMergePreview =
        ask(VenueMergePreview.serializer(), "POST", "/v1/venues/$id/merge/preview", json.encodeToJsonElement(VenueMergeDraft.serializer(), draft))

    suspend fun preview(id: String, draft: RefereeMergeDraft): RefereeMergePreview =
        ask(RefereeMergePreview.serializer(), "POST", "/v1/referees/$id/merge/preview", json.encodeToJsonElement(RefereeMergeDraft.serializer(), draft))

    /** Merges exactly what a preview showed: its merge, sent back. */
    suspend fun merge(id: String, merge: VenueMerge) {
        api.call("POST", "/v1/venues/$id/merge", json.encodeToJsonElement(VenueMerge.serializer(), merge))
    }

    suspend fun merge(id: String, merge: RefereeMerge) {
        api.call("POST", "/v1/referees/$id/merge", json.encodeToJsonElement(RefereeMerge.serializer(), merge))
    }

    /** Not the same (DUP-5): each remembers the others, so they aren't suggested together again. */
    suspend fun notTheSame(kind: MergeKind, ids: List<String>) {
        api.call("POST", "/v1/${kind.collection}/${ids.first()}/not-the-same", json.encodeToJsonElement(NotTheSame.serializer(), NotTheSame(ids.drop(1))))
    }
}
