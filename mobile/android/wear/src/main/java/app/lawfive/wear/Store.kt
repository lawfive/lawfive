package app.lawfive.wear

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import java.io.File

// What the watch keeps (WCH-3): the match in progress, the downloaded matches, finished matches until the
// server has them, its choices. One small file, written whole and atomically on every change (TMR-8).

val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

@Serializable
data class FeeChange(val matchId: String, val paid: Boolean, val at: Long)

/** UI-24: the match screen as the server takes it and sends it; an older server has only a layout and second clock. */
@Serializable
data class ScreenChange(
    val layout: String, val secondClock: String, val at: Long,
    val clocks: String? = null, val mainClock: String? = null, val breakClock: String? = null, val edge: String? = null, val names: Boolean? = null,
)

@Serializable
data class Finished(val created: Long, val title: String, val home: String, val away: String, val score: List<Int>, val pens: List<Int>? = null, val when_: Long, val sent: Boolean = false,
    /** ET-6: it ended on a golden goal. */
    val golden: Boolean = false,
    /** The planned match it was started from, for Mark pitch (TRK-13). */
    val matchId: String? = null)

/** TRK-13, SYNC-12: a pitch's corners walked on the watch, until the server has them (POST /v1/watch/pitch). */
@Serializable
data class PitchUpload(val matchId: String? = null, val created: Long? = null, val corners: List<List<Int>>, val at: Long)

/** SYNC-6: an unlinked watch's old link, kept until the server it came from has signed it out. */
@Serializable
data class SignOut(val server: String, val token: String)

@Serializable
data class Saved(
    val server: String? = null,
    val token: String? = null,
    val lastSync: Long? = null,
    val serverVersion: String? = null,
    val matches: List<JsonObject> = emptyList(),
    val match: Match? = null,
    val outbox: List<JsonObject> = emptyList(),
    val fees: List<FeeChange> = emptyList(),
    val history: List<Finished> = emptyList(),
    val quick: MatchSetup = MatchSetup(),
    /** Before UI-21's choices: the layout and second clock, read into [chosenScreen] until [screen] is set. */
    val faceLayout: Int = LAYOUT_DEFAULT,
    val secondClock: Int = CLOCK_DOWN,
    val screen: WatchScreen? = null,
    val screenAt: Long = 0,
    val screenChange: ScreenChange? = null,
    val vibeFullTime: Boolean = true,
    val vibeAdded: Boolean = true,
    /** EVT-12: Sin bin over. */
    val vibeSinBin: Boolean = true,
    val vibeBreak: Boolean = true,
    val vibeStoppage: Boolean = true,
    val tapStoppage: Boolean = false,
    /** EVT-14: Card reasons: the misconduct codes listed after a card's number (or role); off for settings saved before it. */
    val cardReasons: Boolean = false,
    /** EVT-14: the account's misconduct scheme, from GET /v1/watch/matches; null before any sync, or from a server before it. */
    val misconductScheme: String? = null,
    /** SET-8: blank for the default name. */
    val stoppageName: String = "",
    val breakName: String = "",
    /** SET-13: the format of the last match started (quick, planned or created). */
    val lastFormat: MatchSetup? = null,
    /** WCH-7: the first launch's permissions screen has been answered (or wasn't needed). */
    val permissionsAsked: Boolean = false,
    /** TRK-7: Record track. */
    val recordTrack: Boolean = true,
    /** TRK-7: finished tracks waiting to go up, oldest first; the last 3 are kept, as on Garmin. */
    val tracks: List<TrackUpload> = emptyList(),
    /** TRK-13: pitches marked, waiting to go up. */
    val pitches: List<PitchUpload> = emptyList(),
    /** SYNC-6: links unlinked without a connection, signed out at the next chance. */
    val signOuts: List<SignOut> = emptyList(),
) {
    /**
     * UI-21: the match screen; one saved before the choices comes from its layout and the quick format's clock.
     * With neither changed from before, or nothing saved, it's the default (UI-24).
     */
    val chosenScreen get() = screen ?: if (faceLayout == LAYOUT_DEFAULT && quick.clockStyle == CLOCK_UP && secondClock == CLOCK_DOWN) {
        WatchScreen.DEFAULT
    } else {
        WatchScreen.fromLayout(faceLayout, quick.clockStyle, secondClock)
    }

    /** SET-8: the timers' names, or their defaults when blank. */
    val stoppageLabel get() = stoppageName.ifBlank { "stoppage" }
    val breakLabel get() = breakName.ifBlank { "break" }
}

class Store(context: Context) {
    private val file = File(context.filesDir, "lawfive.json")

    fun load(): Saved = runCatching { json.decodeFromString<Saved>(file.readText()) }.getOrDefault(Saved())

    fun save(saved: Saved) {
        val temp = File(file.parentFile, "lawfive.json.tmp")
        temp.writeText(json.encodeToString(saved))
        temp.renameTo(file)
    }
}
