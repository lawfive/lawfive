package app.lawfive.wear

/**
 * WCH-13: what counts as the app opening, for Sync on opening (UI-16). Wear OS keeps an app in the background and
 * closes it on its own, so opening is starting, or coming back to the front after five minutes or more away; a glance
 * at the watch isn't. Never with a match in progress (SYNC-3): full time sends the match itself.
 */
object Opening {
    const val AWAY_MS = 5 * 60 * 1000L

    /** Whether to sync now the app is at the front: [first] when it has just started, else [awayMs] away. */
    fun syncs(first: Boolean, awayMs: Long?, syncOnOpening: Boolean, matchInProgress: Boolean): Boolean {
        if (!syncOnOpening || matchInProgress) return false
        return first || (awayMs ?: 0) >= AWAY_MS
    }
}
