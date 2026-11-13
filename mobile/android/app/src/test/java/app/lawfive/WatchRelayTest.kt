package app.lawfive

import app.lawfive.watch.WatchRelay
import app.lawfive.watch.WatchTransport
import app.lawfive.watch.fromJson
import app.lawfive.watch.fromLawFive
import app.lawfive.watch.WATCH_APP_ID
import app.lawfive.watch.toJson
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.boolean
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The watch through the phone (APP-7): what the relay answers the watch, with signal and without.

class WatchRelayTest {
    private val server = "https://lawfive.example"

    /** A server that answers from `answers` (null: no signal), and remembers what it was sent. */
    private class FakeServer : WatchTransport {
        var online = true
        /** Tokens the server doesn't know (401), as a made-up watch's would be. */
        val refused = mutableSetOf<String>()
        val sent = mutableListOf<Pair<String, String>>()
        /** What each request carried: a GET's query, else its body. */
        val bodies = mutableListOf<JsonElement?>()
        var matches: JsonElement = JsonObject(mapOf("matches" to JsonArray(listOf(
            JsonObject(mapOf("id" to JsonPrimitive("m1"), "fee" to JsonObject(mapOf("text" to JsonPrimitive("$25"), "paid" to JsonPrimitive(false))))),
        ))))

        override suspend fun send(server: String, method: String, path: String, body: JsonElement?, token: String, device: String): Pair<Int, JsonElement?>? {
            if (!online) return null
            sent += method to path
            bodies += body
            if (token in refused) return 401 to JsonObject(emptyMap())
            return if (method == "GET") 200 to matches else 200 to JsonObject(emptyMap())
        }
    }

    private fun message(id: Int, kind: String, path: String? = null, method: String = "POST", body: JsonObject? = null, server: String = this.server, token: String = "watch-token") =
        JsonObject(buildMap {
            put("lawfive", JsonPrimitive(1))
            put("id", JsonPrimitive(id))
            put("kind", JsonPrimitive(kind))
            put("server", JsonPrimitive(server))
            if (path != null) {
                put("method", JsonPrimitive(method))
                put("path", JsonPrimitive(path))
                put("token", JsonPrimitive(token))
                put("device", JsonPrimitive("garmin; model=006-B3703-00"))
                body?.let { put("body", it) }
            }
        })

    private fun code(answer: JsonObject?) = answer!!["code"]!!.jsonPrimitive.int

    @Test
    fun `hello says whether the phone is signed in to the watch's server`() = runTest {
        val relay = WatchRelay(null, FakeServer(), { server })
        assertEquals(200, code(relay.handle(message(1, "hello"))))
        assertEquals(409, code(relay.handle(message(2, "hello", server = "https://other.example"))))
        assertEquals(200, code(WatchRelay(null, FakeServer(), { "$server/" }).handle(message(3, "hello"))))
        assertEquals(409, code(WatchRelay(null, FakeServer(), { null }).handle(message(4, "hello"))))
        // The hosted service's web address is the same server as its API (the watch's default).
        assertEquals(200, code(WatchRelay(null, FakeServer(), { "https://app.lawfive.app" }).handle(message(6, "hello", server = "https://api.lawfive.app"))))
        // Not LawFive's.
        assertNull(relay.handle(JsonObject(mapOf("id" to JsonPrimitive(5)))))
    }

    @Test
    fun `with signal requests go to the server and the matches are kept for later`() = runTest {
        val fake = FakeServer()
        val relay = WatchRelay(null, fake, { server })
        val answer = relay.handle(message(1, "request", "/v1/watch/matches", "GET", JsonObject(mapOf("limit" to JsonPrimitive(10)))))
        assertEquals(200, code(answer))
        assertEquals("m1", answer!!["data"]!!.jsonObject["matches"]!!.jsonArray[0].jsonObject["id"]!!.jsonPrimitive.content)
        assertEquals(listOf("GET" to "/v1/watch/matches"), fake.sent)
        assertTrue(relay.state.value.watches.single().matches != null)
        // Only the watch's own endpoints, however the path is written (SEC-11).
        for ((n, path) in listOf("/v1/records/matches", "/v1/watch/../account", "/v1/watch/%2e%2e/account", "/v1/watch//x", "/v1/watch/matches?x=1").withIndex()) {
            assertEquals(path, 404, code(relay.handle(message(10 + n, "request", path, "GET"))))
        }
    }

    @Test
    fun `without signal what the watch sends is kept and goes first when there's signal`() = runTest {
        val fake = FakeServer()
        val relay = WatchRelay(null, fake, { server })
        relay.handle(message(1, "request", "/v1/watch/matches", "GET"))
        fake.online = false
        assertEquals(202, code(relay.handle(message(2, "request", "/v1/watch/records", body = JsonObject(mapOf("created" to JsonPrimitive(1)))))))
        assertEquals(202, code(relay.handle(message(3, "request", "/v1/watch/fee",
            body = JsonObject(mapOf("matchId" to JsonPrimitive("m1"), "paid" to JsonPrimitive(true)))))))
        assertEquals(2, relay.state.value.outbox.size)
        // The next matches from the last fetch, with the fee marked since.
        val matches = relay.handle(message(4, "request", "/v1/watch/matches", "GET"))
        assertEquals(200, code(matches))
        assertTrue(matches!!["data"]!!.jsonObject["matches"]!!.jsonArray[0].jsonObject["fee"]!!.jsonObject["paid"]!!.jsonPrimitive.boolean)
        // Signal again: what waits goes first, in order, then the new request.
        fake.online = true
        fake.sent.clear()
        relay.handle(message(5, "request", "/v1/watch/pitch", body = JsonObject(emptyMap())))
        assertEquals(listOf("POST" to "/v1/watch/records", "POST" to "/v1/watch/fee", "POST" to "/v1/watch/pitch"), fake.sent)
        assertTrue(relay.state.value.outbox.isEmpty())
    }

    @Test
    fun `the phone's sync sends what waits and fetches the watch's next matches`() = runTest {
        val fake = FakeServer()
        val relay = WatchRelay(null, fake, { server })
        fake.online = false
        relay.handle(message(1, "request", "/v1/watch/fee", body = JsonObject(mapOf("matchId" to JsonPrimitive("m1"), "paid" to JsonPrimitive(true)))))
        fake.online = true
        relay.refresh()
        assertEquals(listOf("POST" to "/v1/watch/fee", "GET" to "/v1/watch/matches"), fake.sent)
        assertTrue(relay.state.value.outbox.isEmpty())
        assertTrue(relay.state.value.watches.single().fetchedAt > 0)
    }

    @Test
    fun `the phone's fetch ahead says so, and the watch's own doesn't`() = runTest {
        val fake = FakeServer()
        val relay = WatchRelay(null, fake, { server })
        relay.handle(message(1, "request", "/v1/watch/matches", "GET", JsonObject(mapOf("limit" to JsonPrimitive(10)))))
        relay.refresh()
        // SYNC-14: only the watch's own download counts as the matches being on it.
        assertEquals(listOf("GET" to "/v1/watch/matches", "GET" to "/v1/watch/matches"), fake.sent)
        assertNull((fake.bodies[0] as JsonObject)["prefetch"])
        assertEquals("true", (fake.bodies[1] as JsonObject)["prefetch"]!!.jsonPrimitive.content)
    }

    @Test
    fun `without signal or a fetch before the watch hears it couldn't reach the server`() = runTest {
        val fake = FakeServer().apply { online = false }
        assertEquals(WatchRelay.NO_SIGNAL, code(WatchRelay(null, fake, { server }).handle(message(1, "request", "/v1/watch/matches", "GET"))))
    }

    @Test
    fun `messages convert between the SDK's values and JSON`() {
        val fromWatch = hashMapOf<Any, Any?>("id" to 3, "body" to hashMapOf("created" to 1_780_000_000L, "corners" to listOf(listOf(37_512_345, -122_312_345))), "x" to null)
        val asJson = toJson(fromWatch).jsonObject
        assertEquals(1_780_000_000L, asJson["body"]!!.jsonObject["created"]!!.jsonPrimitive.content.toLong())
        @Suppress("UNCHECKED_CAST")
        val back = fromJson(asJson) as Map<String, Any?>
        assertEquals(3, back["id"])
        // Whole numbers that fit go to the watch as Integer (Monkey C's Number).
        assertEquals(1_780_000_000, (back["body"] as Map<*, *>)["created"])
        assertTrue(back.containsKey("x"))
    }

    @Test
    fun `a watch is remembered only once the server takes its token`() = runTest {
        val fake = FakeServer().apply { refused += "made-up" }
        val relay = WatchRelay(null, fake, { server })
        assertEquals(401, code(relay.handle(message(1, "request", "/v1/watch/matches", "GET", token = "made-up"))))
        assertTrue(relay.state.value.watches.isEmpty())
        // Kept without signal, but not remembered until it goes and the server takes it.
        fake.online = false
        assertEquals(202, code(relay.handle(message(2, "request", "/v1/watch/records", body = JsonObject(mapOf("created" to JsonPrimitive(1)))))))
        assertTrue(relay.state.value.watches.isEmpty())
        fake.online = true
        relay.refresh()
        assertEquals("watch-token", relay.state.value.watches.single().token)
        assertTrue(relay.state.value.watches.single().fetchedAt > 0)
    }

    @Test
    fun `the outbox is capped, dropping a stranger's first, then tracks, never a record before its track`() = runTest {
        val fake = FakeServer()
        val relay = WatchRelay(null, fake, { server })
        relay.handle(message(1, "request", "/v1/watch/matches", "GET"))
        fake.online = false
        fun track(i: Int) = JsonObject(mapOf("created" to JsonPrimitive(1), "index" to JsonPrimitive(i), "count" to JsonPrimitive(WatchRelay.MAX_OUTBOX)))
        relay.handle(message(2, "request", "/v1/watch/records", body = JsonObject(mapOf("created" to JsonPrimitive(1)))))
        relay.handle(message(3, "request", "/v1/watch/records", body = JsonObject(mapOf("created" to JsonPrimitive(2))), token = "stranger"))
        for (i in 0 until WatchRelay.MAX_OUTBOX - 1) relay.handle(message(10 + i, "request", "/v1/watch/tracks", body = track(i)))
        val outbox = relay.state.value.outbox
        assertEquals(WatchRelay.MAX_OUTBOX, outbox.size)
        // The token no server has taken goes first.
        assertTrue(outbox.none { it.token == "stranger" })
        // Then the oldest track piece, while the match it's for stays, first in line.
        relay.handle(message(9999, "request", "/v1/watch/tracks", body = track(9999)))
        val next = relay.state.value.outbox
        assertEquals(WatchRelay.MAX_OUTBOX, next.size)
        assertEquals("/v1/watch/records", next.first().path)
        assertEquals(1, next.count { it.path == "/v1/watch/records" })
        assertEquals(1, (next[1].body as JsonObject)["index"]!!.jsonPrimitive.int)
        assertEquals(9999, (next.last().body as JsonObject)["index"]!!.jsonPrimitive.int)
    }

    @Test
    fun `a body far bigger than a watch's isn't kept, so the watch keeps it`() = runTest {
        val relay = WatchRelay(null, FakeServer().apply { online = false }, { server })
        val huge = JsonObject(mapOf("created" to JsonPrimitive(1), "x" to JsonPrimitive("x".repeat(WatchRelay.MAX_ITEM_CHARS))))
        assertEquals(WatchRelay.NO_SIGNAL, code(relay.handle(message(1, "request", "/v1/watch/records", body = huge))))
        assertTrue(relay.state.value.outbox.isEmpty())
    }

    @Test
    fun `only messages naming LawFive's watch app are answered`() {
        // Garmin Connect names the app; the id may come with hyphens or in capitals.
        assertTrue(fromLawFive(WATCH_APP_ID, tethered = false))
        assertTrue(fromLawFive("96DAE5FE-5BF3-4B69-97EF-BD34EC61F984", tethered = false))
        // Another app on the phone, naming no app or another one.
        assertFalse(fromLawFive(null, tethered = false))
        assertFalse(fromLawFive("", tethered = false))
        assertFalse(fromLawFive("0123456789abcdef0123456789abcdef", tethered = false))
        // The Connect IQ simulator names none, in a tethered debug build only.
        assertTrue(fromLawFive("", tethered = true))
        assertTrue(fromLawFive(null, tethered = true))
    }
}
