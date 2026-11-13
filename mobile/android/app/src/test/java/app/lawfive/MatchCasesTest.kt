package app.lawfive

import app.lawfive.cases.MATCH_CASES_JSON
import app.lawfive.data.MatchMoment
import app.lawfive.data.Pill
import app.lawfive.data.ScreenSetup
import app.lawfive.data.screenAt
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.float
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Test

// WCH-2, UI-27: the match screen setup's pictures read the clocks as the watches do, by the shared
// screen cases (schema/match-cases/screen.json), which the watches' engines run too.
class MatchCasesTest {
    // The pictures' halfway break: 2 minutes, timed as added on as stoppage, so due at halfway, 22:30 (TMR-7).
    private val breakDue = (22 * 60 + 30) * 1000L
    private val breakLength = 2 * 60 * 1000L

    private fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.contentOrNull

    @Test fun screenCases() {
        val cases = Json.parseToJsonElement(MATCH_CASES_JSON).jsonObject["screen"]!!.jsonArray
        for (element in cases) {
            val c = element.jsonObject
            val name = c.text("name")
            val screen = c["screen"]!!.jsonObject
            val setup = ScreenSetup().let { d ->
                d.copy(clocks = screen.text("clocks") ?: d.clocks, mainClock = screen.text("mainClock") ?: d.mainClock,
                    secondClock = screen.text("secondClock") ?: d.secondClock, breakClock = screen.text("breakClock") ?: d.breakClock)
            }
            val at = c["at"]!!.jsonObject
            val elapsed = at["elapsed"]!!.jsonPrimitive.long
            val moment = MatchMoment(
                halftime = at.text("phase") == "halftime", period = at["period"]!!.jsonPrimitive.long.toInt(), elapsedMs = elapsed,
                stoppageMs = at["stoppage"]!!.jsonPrimitive.long, stoppageRunning = at["stoppageRunning"]!!.jsonPrimitive.boolean,
                breakDueInMs = if (at.text("halfwayBreak") == "coming") breakDue - elapsed else null,
                breakDue = at.text("halfwayBreak") == "due",
                breakLeftMs = if (at.text("halfwayBreak") == "running") breakLength - (elapsed - at["breakStarted"]!!.jsonPrimitive.long) else null,
            )
            val shown = screenAt(setup, moment, c["tracked"]!!.jsonPrimitive.boolean)
            fun pill(p: Pill?) = p?.let { "${it.text} ${it.solid}" }
            fun pillOf(e: kotlinx.serialization.json.JsonElement) = (e as? JsonObject)?.let { "${it.text("text")} ${it["solid"]!!.jsonPrimitive.boolean}" }
            for ((key, expected) in c["expect"]!!.jsonObject) {
                val what = "$name: $key"
                when (key) {
                    "clock" -> assertEquals(what, expected.jsonPrimitive.content, shown.clock)
                    "second" -> assertEquals(what, if (expected is JsonNull) null else expected.jsonPrimitive.content, shown.second)
                    "added" -> assertEquals(what, if (expected is JsonNull) null else expected.jsonPrimitive.content, shown.added)
                    "progress" -> assertEquals(what, expected.jsonPrimitive.float, shown.progress, 0.0001f)
                    "breakClock" -> assertEquals(what, expected.jsonPrimitive.content, shown.breakClock)
                    "stoppage" -> assertEquals(what, pillOf(expected), pill(shown.stoppage))
                    "breakPill" -> assertEquals(what, pillOf(expected), pill(shown.breakPill))
                    else -> throw AssertionError("$what: not something the pictures show")
                }
            }
        }
    }
}
