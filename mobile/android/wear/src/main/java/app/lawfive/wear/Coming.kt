package app.lawfive.wear

import kotlinx.serialization.json.JsonObject

// The downloaded matches (SYNC-3) and, among them, canceled and postponed ones still to kick off (SYNC-16): listed
// in Matches, marked, until their kickoff, but never counted or offered as coming up. No Android here, for the tests.

/** SYNC-3, SYNC-16: the next 10, with canceled and postponed ones still to kick off among them. */
const val MATCHES_PATH = "/v1/watch/matches?limit=10&canceled=true"

/** SYNC-16: "Canceled" or "Postponed" for a match that won't be played as planned; null for a scheduled one. */
fun offLabel(m: JsonObject): String? = when (m.str("status")) {
    null -> null
    "postponed" -> "Postponed"
    else -> "Canceled"
}

/** SYNC-16: what the start confirmation says of it. */
fun offDetail(m: JsonObject): String? = offLabel(m)?.let { "This match was ${it.lowercase()}" }

/** SYNC-16: a scheduled match, with no status. */
fun scheduled(m: JsonObject) = m.str("status") == null

/**
 * UI-16, SYNC-16: what Matches lists: the scheduled matches as before, and a canceled or postponed one until its
 * kickoff has passed (the watch may not sync again before then). [now] in seconds.
 */
fun listed(matches: List<JsonObject>, now: Long): List<JsonObject> =
    matches.filter { scheduled(it) || (it.int("kickoff")?.let { k -> k > now } ?: false) }

/** UI-15, SYNC-16: the matches coming up, scheduled ones only. */
fun coming(matches: List<JsonObject>): List<JsonObject> = matches.filter(::scheduled)

/** UI-15: the start menu's Matches line, as the Garmin's: "3 coming up", the last sync's problem in its place, or "Link to sync". */
fun matchesSummary(linked: Boolean, problem: String?, matches: List<JsonObject>): String {
    if (!linked) return "Link to sync"
    if (problem != null) return problem
    val count = coming(matches).size
    return if (count == 0) "None yet" else "$count coming up"
}
