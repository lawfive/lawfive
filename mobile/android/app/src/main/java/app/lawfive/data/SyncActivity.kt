package app.lawfive.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// What's syncing, item by item (APP-16), for the screen that shows it. It only comes up for a big
// sync: a watch handing over matches and tracks, the first sync after signing in, or a lot of
// changes at once. Everyday syncs stay in their few words at the top of the page (APP-3).

data class SyncRow(val key: String, val title: String, val detail: String? = null, val done: Boolean = false)

data class SyncProgress(
    val show: Boolean = false,
    val rows: List<SyncRow> = emptyList(),
    val finished: Boolean = false,
    /** Why it stopped, in words: it carries on by itself when it can. */
    val problem: String? = null,
    val fromWatch: Boolean = false,
) {
    /** Something's moving, shown or out of sight: the summary of what came in from the watch waits (APP-26). */
    val busy: Boolean get() = rows.isNotEmpty() && !finished
}

class SyncActivity(private val clock: () -> Long = System::currentTimeMillis) {
    private val _state = MutableStateFlow(SyncProgress())
    val state: StateFlow<SyncProgress> = _state

    /** APP-26: matches from a watch are waiting, so it becomes their summary when it's done. */
    var handOver: () -> Boolean = { false }

    private var syncing = false
    private var hidden = false
    private var lastActive = 0L
    private var finishedAt = 0L
    private val pulled = mutableMapOf<String, Int>()
    private val watchMatches = mutableMapOf<Long, String>()

    private fun put(row: SyncRow, big: Boolean = true, fromWatch: Boolean = false) {
        lastActive = clock()
        val s = _state.value
        // Something new after the last one finished is a new sync.
        val rows = if (s.finished) emptyList() else s.rows
        if (s.finished) hidden = false
        _state.value = s.copy(
            show = (s.show && !s.finished || big) && !hidden,
            rows = if (rows.any { it.key == row.key }) rows.map { if (it.key == row.key) row else it } else rows + row,
            finished = false,
            problem = null,
            fromWatch = s.fromWatch && !s.finished || fromWatch,
        )
    }

    /** A match from the watch; `sent` when the server has it, `kept` when it waits on this phone for signal. */
    fun watchMatch(created: Long, title: String, sent: Boolean, kept: Boolean = false) {
        watchMatches[created] = title
        val detail = if (kept) "Kept on this phone until there's signal" else if (sent) "Match sent" else "Sending the match"
        put(SyncRow("watch:$created", title, detail, done = sent || kept), fromWatch = true)
    }

    /** A chunk of a match's track from the watch. */
    fun watchTrack(created: Long, index: Int, count: Int, kept: Boolean = false) {
        val detail = if (kept) "Track kept on this phone until there's signal" else "Track: ${index + 1} of $count"
        put(SyncRow("watch:$created", watchMatches[created] ?: "Match from your watch", detail, done = kept || index + 1 >= count), fromWatch = true)
    }

    fun syncStarted() {
        syncing = true
        lastActive = clock()
        pulled.clear()
    }

    fun pushing(done: Int, total: Int, name: String) {
        if (total < BIG) return
        put(SyncRow("push", "Your changes", if (done >= total) "$total sent" else "${done + 1} of $total · $name", done = done >= total))
    }

    /** A page of changes came down. `big` once it's the first sync, or a lot at once. */
    fun pulled(counts: Map<String, Int>, lastName: Map<String, String>, first: Boolean) {
        val big = first && counts.isNotEmpty() || counts.values.sum() >= BIG
        for (collection in counts.keys) pulled[collection] = (pulled[collection] ?: 0) + (counts[collection] ?: 0)
        // Most interesting first, and in the same order every time.
        for ((collection, name) in names) {
            val total = pulled[collection]?.takeIf { collection in counts } ?: continue
            // A report has no name of its own.
            val latest = lastName[collection].takeIf { collection != "match-records" }
            put(SyncRow("pull:$collection", name, listOfNotNull("$total", latest).joinToString(" · ")), big = big)
        }
    }

    fun syncFinished(problem: String?) {
        syncing = false
        lastActive = clock()
        val s = _state.value
        if (problem != null && s.show) {
            finishedAt = clock()
            _state.value = s.copy(finished = true, problem = problem)
        }
    }

    /** Called every second: done once nothing has moved for a little while, and gone a little after. */
    fun tick() {
        val s = _state.value
        val now = clock()
        if (s.rows.isEmpty()) return
        if (!s.finished) {
            // Only a watch has pauses that aren't the end.
            if (!syncing && now - lastActive >= if (s.fromWatch) QUIET_MS else SETTLE_MS) {
                // APP-26: the summary of what came in from the watch takes over from All synced.
                if (handOver()) return close()
                finishedAt = now
                _state.value = s.copy(finished = true, rows = s.rows.map { it.copy(done = true) })
            }
        } else if (s.problem == null && now - finishedAt >= CLOSE_MS) {
            close()
        }
    }

    /** Keep using the app: it carries on, out of sight. */
    fun hide() {
        hidden = true
        _state.value = _state.value.copy(show = false)
    }

    fun close() {
        hidden = false
        pulled.clear()
        _state.value = SyncProgress()
    }

    companion object {
        /** How many things at once count as a big sync. */
        const val BIG = 10
        /** The watch sends a piece at a time, so a pause isn't the end until it's this long. */
        const val QUIET_MS = 8_000L
        const val SETTLE_MS = 1_000L
        const val CLOSE_MS = 4_000L
        private val names = mapOf(
            "matches" to "Matches", "match-records" to "Match reports", "referees" to "Referees", "venues" to "Venues",
            "competitions" to "Competitions", "match-templates" to "Templates",
        )
    }
}
