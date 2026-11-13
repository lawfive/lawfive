package app.lawfive.snapshots

import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

// The API as the phone would find it, answered from the shared fixtures (schema/generated/fixtures),
// inside the test on 127.0.0.1: the screens get their data through the app's own sync, stores and
// requests, as on a phone, with nothing reaching a real server. The account answered is the token's.

/** A fixture file, from the test resources (schema/generated/fixtures). */
fun fixture(path: String): String =
    requireNotNull(FakeServer::class.java.getResource("/$path")) { "no fixture $path (schema/generated/fixtures)" }.readText()

class FakeServer(private val now: String) : AutoCloseable {
    private val server = MockWebServer()
    private val index = Json.parseToJsonElement(fixture("index.json")).jsonObject
    private val trackRecord = index["demo"]!!.jsonObject["trackRecord"]!!.jsonPrimitive.content
    /** What screens asked for that the fixtures don't have, for the run's log. */
    val missing = sortedSetOf<String>()

    val url: String get() = server.url("/").toString().trimEnd('/')

    init {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = answer(request)
        }
        server.start()
    }

    override fun close() = server.close()

    private fun account(request: RecordedRequest) = if (request.headers["Authorization"] == "Bearer new-account") "new-account" else "demo"

    private fun answer(request: RecordedRequest): MockResponse {
        val account = account(request)
        val path = request.url.encodedPath
        val since = request.url.queryParameter("since")
        if (request.method != "GET") return notFound(request)
        return when {
            path == "/v1/meta" -> ok(meta())
            path == "/v1/account" -> ok(buildJsonObject {
                put("id", "user-$account")
                put("name", index["accounts"]!!.jsonObject[account]!!.jsonObject["name"]!!.jsonPrimitive.content)
                put("email", index["accounts"]!!.jsonObject[account]!!.jsonObject["email"]!!.jsonPrimitive.content)
                put("status", "active")
            }.toString())
            // Everything at the first sync; nothing new after.
            path == "/v1/changes" -> if (since == null || since == "0") ok(fixture("$account/changes.json"))
                else ok("""{"changes":[],"cursor":$since,"more":false}""")
            path == "/v1/stats" -> ok(fixture("$account/stats.json"))
            path == "/v1/weather" -> ok(fixture("$account/weather.json"))
            path.startsWith("/v1/weather/") -> {
                val id = path.removePrefix("/v1/weather/")
                Json.parseToJsonElement(fixture("$account/weather.json")).jsonObject["items"]!!.jsonArray
                    .firstOrNull { it.jsonObject["matchId"]?.jsonPrimitive?.content == id }?.let { ok(it.toString()) } ?: notFound(request, quiet = true)
            }
            path == "/v1/match-records/$trackRecord/track" && account == "demo" -> ok(fixture("demo/track.json"))
            // The phone asking, then the account's linked watches (the demo's Venu 2; a new account has none).
            path == "/v1/devices" -> ok(buildJsonObject {
                put("devices", buildJsonArray {
                    add(buildJsonObject {
                        put("id", "device-1"); put("kind", "android"); put("name", "Google Pixel 9 Pro"); put("firmware", "17")
                        put("appVersion", "2026.11.09"); put("linkedAt", now); put("lastActiveAt", now); put("current", true)
                    })
                    if (account == "demo") Json.parseToJsonElement(fixture("demo/devices.json")).jsonObject["devices"]!!.jsonArray.forEach { add(it) }
                })
            }.toString())
            // SYNC-14: what's on the demo's watch.
            path == "/v1/devices/matches" -> if (account == "demo") ok(fixture("demo/devices-matches.json")) else ok("""{"matches":[]}""")
            path == "/v1/assignor-calendars" -> ok("""{"calendars":[]}""")
            path == "/v1/attachments" -> ok("""{"attachments":[]}""")
            // The quiz built in is the server's own (schema/quiz); the plan, storage and calendar feed
            // aren't in the fixtures, so those screens show what a server without them would.
            else -> notFound(request)
        }
    }

    /** As the demo server describes itself, with weather on. The maps aren't drawn (LocalInspectionMode). */
    private fun meta() = buildJsonObject {
        put("product", "LawFive")
        put("apiVersion", 1)
        put("apiUrl", url)
        put("publicUrl", url)
        put("version", "2026.11.09")
        put("capabilities", JsonArray(listOf(
            "accounts", "records", "quiz", "changes", "tracks", "stats", "devices", "link", "watch", "people", "invites",
            "calendar", "import", "merging", "plans", "assignor-calendars", "weather",
        ).map(::JsonPrimitive)))
        put("maps", buildJsonObject {
            put("tileUrl", "https://tiles.invalid/{z}/{x}/{y}.png")
            put("attribution", "Map tiles")
        })
        put("weather", buildJsonObject { put("source", "Open-Meteo") })
        put("signUp", "open")
    }.toString()

    private fun ok(body: String) = MockResponse.Builder()
        .code(200).addHeader("Content-Type", "application/json").addHeader("LawFive-Version", "1").body(body).build()

    private fun notFound(request: RecordedRequest, quiet: Boolean = false): MockResponse {
        if (!quiet) synchronized(missing) { missing += "${request.method} ${request.url.encodedPath}" }
        return MockResponse.Builder().code(404).addHeader("Content-Type", "application/json").addHeader("LawFive-Version", "1")
            .body("""{"error":"Not found"}""").build()
    }
}
