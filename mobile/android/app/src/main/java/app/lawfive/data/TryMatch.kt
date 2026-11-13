package app.lawfive.data

import java.net.URLEncoder

// DEMO-9: lawfive.app's Try a match from an address: the watch and the match screen in it, under the
// API's names, the same as the website's (tryMatchUrl and tryWatchFor in schema/src/screen.ts), tested
// with the same cases. Opened from Link a watch once one is linked (SYNC-15) and from Settings → Match screen.

/** DEMO-9: the watches Try a match draws: a five-button Garmin, a Venu, Wear OS or Apple Watch. */
val tryWatches = listOf("garmin", "venu", "wearos", "apple")

/** DEMO-9: lawfive.app's Try a match, which needs no sign-in; the same for every server, self-hosted too. */
const val TRY_MATCH_SITE = "https://lawfive.app/try"

/** DEMO-9: which watch Try a match shows for a linked one, from its kind (or the app that linked it) and its name. */
fun tryWatchFor(kind: String?, name: String? = null): String = when (kind) {
    "applewatch", "lawfive-applewatch" -> "apple"
    "wearos", "lawfive-wear" -> "wearos"
    else -> if (name?.contains("venu", ignoreCase = true) == true) "venu" else "garmin"
}

/** DEMO-9: Try a match's address with the watch and the match screen in it, under the API's names; nothing else. */
fun tryMatchUrl(watch: String, screen: ScreenSetup, teamSwipes: String? = null, base: String = TRY_MATCH_SITE): String {
    val params = listOfNotNull(
        "watch" to watch,
        "clocks" to screen.clocks,
        "mainClock" to screen.mainClock,
        // UI-22: never the match clock.
        "secondClock" to secondStyle(screen.mainClock, screen.secondClock),
        "breakClock" to screen.breakClock,
        "edge" to screen.edge,
        "names" to screen.names.toString(),
        teamSwipes?.let { "teamSwipes" to it },
    )
    return base + "?" + params.joinToString("&") { (k, v) -> "$k=${URLEncoder.encode(v, Charsets.UTF_8)}" }
}
