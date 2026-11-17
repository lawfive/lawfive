package app.lawfive.data

import app.lawfive.schema.Attachment
import app.lawfive.schema.Match
import app.lawfive.ui.instantOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import java.io.File
import java.io.IOException
import java.time.Duration
import java.time.Instant

// FILE-13: files kept on the phone for a ground without signal. The files of every match in the
// next 3 days (its own, its venue's and its competition's) are fetched when there's signal and
// kept until the match is over, and Keep on this phone keeps any file until it's turned off; at
// most 200 MB, the soonest match's kept first. They're in the app's own storage, left out of the
// phone's backups (backup_rules.xml, data_extraction_rules.xml), and go on signing out. Each
// record's list of files at the last look is kept too, so its Files card shows them without signal.

/** At most this much is kept (FILE-13). */
const val KEEP_BUDGET = 200L * 1024 * 1024

/** How far ahead matches' files are kept. */
val KEEP_AHEAD: Duration = Duration.ofDays(3)

/** A match is over, and its files no longer kept for it, this long after kickoff: the match, its breaks and time to leave. */
val MATCH_OVER_AFTER: Duration = Duration.ofHours(3)

/** Whether a match's files are kept now: it's on (scheduled or postponed), kicking off in the next 3 days, and not over. */
fun keepsFilesFor(m: Match, now: Instant): Boolean {
    val kickoff = instantOf(m.kickoff) ?: return false
    return (m.status == "scheduled" || m.status == "postponed") && kickoff.isAfter(now.minus(MATCH_OVER_AFTER)) && !kickoff.isAfter(now.plus(KEEP_AHEAD))
}

/** A file wanted for a match, and when that match kicks off. */
data class WantedFile(val file: Attachment, val kickoff: Instant)

/**
 * What to keep, in at most `budget` bytes: the files kept with Keep on this phone first, then the
 * matches', soonest match first, so that when there isn't room the latest match's are left off and
 * the ground you're heading to next has its files. A file wanted for several matches counts for the soonest.
 */
fun planKeeping(pinned: List<Attachment>, wanted: List<WantedFile>, budget: Long = KEEP_BUDGET): List<Attachment> {
    val chosen = LinkedHashMap<String, Attachment>()
    var used = 0L
    fun take(a: Attachment) {
        if (a.id !in chosen && used + a.size <= budget) {
            chosen[a.id] = a
            used += a.size
        }
    }
    pinned.forEach(::take)
    wanted.groupBy { it.file.id }.values.map { all -> all.minBy { it.kickoff } }.sortedBy { it.kickoff }.forEach { take(it.file) }
    return chosen.values.toList()
}

/** The key of a record's list: "venue:<id>". */
fun recordKey(recordType: String, recordId: String) = "$recordType:$recordId"

@Serializable
data class KeptFile(val file: Attachment, /** Where it is, under the kept files' folder. */ val path: String)

@Serializable
data class KeptIndex(
    val kept: List<KeptFile> = emptyList(),
    /** Kept until turned off (Keep on this phone), whether or not it's been fetched yet. */
    val pinned: List<Attachment> = emptyList(),
    /** Each record's files at the last look, by recordKey. */
    val lists: Map<String, List<Attachment>> = emptyMap(),
)

/** What the Files cards and Settings show: which files are on the phone, which are kept until turned off, and how much. */
data class KeptState(val kept: Set<String> = emptySet(), val pinned: Set<String> = emptySet(), val bytes: Long = 0, val count: Int = 0)

class KeptFiles(
    /** The kept files and their index, in files/kept-files (left out of backups). */
    private val folder: File,
    /** Files opened but not kept, in the cache, for opening, sharing and Open with. */
    private val opened: File,
    private val api: Api,
) {
    private val lock = Mutex()
    private val indexFile = File(folder, "index.json")
    private var index = load()
    private val _state = MutableStateFlow(stateOf(index))
    val state: StateFlow<KeptState> = _state

    private fun load(): KeptIndex = runCatching { json.decodeFromString(KeptIndex.serializer(), indexFile.readText()) }.getOrNull() ?: KeptIndex()

    private fun stateOf(i: KeptIndex) = KeptState(i.kept.map { it.file.id }.toSet(), i.pinned.map { it.id }.toSet(), i.kept.sumOf { it.file.size }, i.kept.size)

    private fun save(next: KeptIndex) {
        index = next
        folder.mkdirs()
        val tmp = File(folder, "index.json.tmp")
        tmp.writeText(json.encodeToString(KeptIndex.serializer(), next))
        tmp.renameTo(indexFile)
        _state.value = stateOf(next)
    }

    /** A record's files at the last look, for its card without signal. */
    fun listOf(recordType: String, recordId: String): List<Attachment>? = index.lists[recordKey(recordType, recordId)]

    /** A record's files as just fetched. */
    suspend fun remember(recordType: String, recordId: String, files: List<Attachment>) = lock.withLock {
        withContext(Dispatchers.IO) { save(index.copy(lists = index.lists + (recordKey(recordType, recordId) to files))) }
    }

    /** The kept copy of this version of the file, if there is one. */
    fun keptCopy(a: Attachment): File? =
        index.kept.firstOrNull { it.file.id == a.id && it.file.url == a.url }?.let { File(folder, it.path) }?.takeIf { it.isFile }

    /** A record's files from the server (FILE-6): files only, so a server from before files, which gives its photos, gives none. */
    suspend fun fetchList(recordType: String, recordId: String): List<Attachment> {
        val answer = api.call("GET", "/v1/attachments?recordType=$recordType&recordId=$recordId&kind=file")!!.jsonObject
        return json.decodeFromJsonElement(ListSerializer(Attachment.serializer()), answer["attachments"]!!).filter { it.kind == "file" }
    }

    /** The file on the phone to open or share: its kept copy, or fetched now. Throws IOException without signal. */
    suspend fun fileFor(a: Attachment): File = keptCopy(a) ?: withContext(Dispatchers.IO) {
        val dir = File(opened, "${a.id}-${a.url.hashCode().toUInt()}")
        val file = File(dir, safeName(a.fileName))
        if (!file.isFile) {
            dir.mkdirs()
            fetchTo(a, file)
        }
        file
    }

    /** Keep on this phone, or stop: true when it's now kept (false when there's no room or no signal; a pinned one is fetched at the next look). */
    suspend fun keep(a: Attachment, on: Boolean, matches: List<Match>): Boolean {
        lock.withLock {
            withContext(Dispatchers.IO) {
                save(index.copy(pinned = index.pinned.filter { it.id != a.id } + if (on) listOf(a) else emptyList()))
            }
        }
        refresh(matches, fetchLists = false)
        return a.id in state.value.kept
    }

    /** A file deleted, or no longer this version: its kept copy goes. */
    suspend fun forget(id: String) = lock.withLock {
        withContext(Dispatchers.IO) {
            index.kept.filter { it.file.id == id }.forEach { File(folder, it.path).parentFile?.deleteRecursively() }
            save(index.copy(kept = index.kept.filter { it.file.id != id }, pinned = index.pinned.filter { it.id != id },
                lists = index.lists.mapValues { (_, l) -> l.filter { it.id != id } }))
        }
    }

    /**
     * When there's signal (after a sync): each wanted record's files fetched again, then the files of
     * the next 3 days' matches and those kept until turned off fetched, and the rest let go. Without
     * signal it stops, keeping what it has. With `fetchLists` false, only the lists already known are used.
     */
    suspend fun refresh(matches: List<Match>, fetchLists: Boolean = true) = lock.withLock {
        withContext(Dispatchers.IO) {
            val now = AppClock.now()
            val soon = matches.filter { keepsFilesFor(it, now) }
            fun recordsOf(m: Match) = listOfNotNull("match" to m.id, m.venueId?.let { "venue" to it }, m.competitionId?.let { "competition" to it })
            val records = (soon.flatMap(::recordsOf) + index.pinned.map { it.recordType to it.recordId }).distinct()
            var lists = index.lists
            if (fetchLists) {
                for ((type, id) in records) {
                    try {
                        lists = lists + (recordKey(type, id) to fetchList(type, id))
                    } catch (e: ApiException) {
                        // Gone (deleted) or not taken on this server: nothing to keep for it.
                        if (e.status == 404 || e.status == 400) lists = lists + (recordKey(type, id) to emptyList())
                    } catch (_: IOException) {
                        return@withContext
                    }
                }
            }
            // Pinned files as the server has them now; one gone from its record's list was deleted.
            val pinned = index.pinned.mapNotNull { p -> lists[recordKey(p.recordType, p.recordId)]?.let { l -> l.firstOrNull { it.id == p.id } } ?: p.takeIf { !fetchLists } }
            val wanted = soon.flatMap { m -> val kickoff = instantOf(m.kickoff)!!; recordsOf(m).flatMap { (t, id) -> lists[recordKey(t, id)].orEmpty() }.map { WantedFile(it, kickoff) } }
            val plan = planKeeping(pinned, wanted)
            val planned = plan.map { it.id }.toSet()
            // Let go first, so what's fetched fits.
            index.kept.filter { k -> k.file.id !in planned || plan.first { it.id == k.file.id }.url != k.file.url }.forEach { File(folder, it.path).parentFile?.deleteRecursively() }
            var kept = index.kept.filter { k -> k.file.id in planned && plan.first { it.id == k.file.id }.url == k.file.url && File(folder, k.path).isFile }
            save(index.copy(kept = kept, pinned = pinned, lists = lists))
            for (a in plan) {
                if (kept.any { it.file.id == a.id }) continue
                val path = "${a.id}/${safeName(a.fileName)}"
                val file = File(folder, path)
                try {
                    file.parentFile?.mkdirs()
                    fetchTo(a, file)
                } catch (_: IOException) {
                    file.parentFile?.deleteRecursively()
                    break
                }
                kept = kept + KeptFile(a, path)
                save(index.copy(kept = kept))
            }
        }
    }

    /** Remove kept files (Settings): every kept file goes, and Keep on this phone is off for each; the next 3 days' come back at the next look. */
    suspend fun removeAll() = lock.withLock {
        withContext(Dispatchers.IO) {
            index.kept.forEach { File(folder, it.path).parentFile?.deleteRecursively() }
            opened.deleteRecursively()
            save(index.copy(kept = emptyList(), pinned = emptyList()))
        }
    }

    /** Signing out: everything goes, the lists too. */
    suspend fun clear() = lock.withLock {
        withContext(Dispatchers.IO) {
            folder.deleteRecursively()
            opened.deleteRecursively()
            index = KeptIndex()
            _state.value = KeptState()
        }
    }

    private suspend fun fetchTo(a: Attachment, file: File) {
        val tmp = File(file.parentFile, "${file.name}.part")
        try {
            tmp.outputStream().use { api.download(a.url, it) }
            if (!tmp.renameTo(file)) throw IOException("The file couldn't be kept")
        } finally {
            tmp.delete()
        }
    }

    /** The name a file is saved under, so another app shows it: the server's, made safe for a file system. */
    private fun safeName(name: String) = name.replace(Regex("[/\\\\:*?\"<>|\\u0000-\\u001f]"), "_").trimStart('.').ifEmpty { "File" }
}
