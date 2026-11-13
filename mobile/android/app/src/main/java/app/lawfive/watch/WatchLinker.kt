package app.lawfive.watch

import app.lawfive.data.Api
import app.lawfive.data.ApiException
import app.lawfive.data.SessionState
import app.lawfive.data.isLawFive
import app.lawfive.data.json
import app.lawfive.data.notLawFive
import app.lawfive.data.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

// The phone linking a watch (APP-12, SYNC-13), so nobody types a server address or a code on it.
// The watch is offered this phone's server and account (again every few seconds until it answers);
// when it says yes, with which watch it is, the phone links it as the website's Link page would:
// it asks for a code in the watch's name, approves it with its own session and collects the
// watch's own token, then sends the server and the token. The watch's side is
// watch-garmin/source/PhoneLink.mc, which lists the messages.

enum class LinkStep { Offering, Linking, Linked, Declined, Busy, NoAnswer, Failed }

/** Where linking a watch has got to, for the Link a watch screen. */
data class LinkState(val watch: Long, val step: LinkStep, val message: String? = null)

class WatchLinker(
    private val api: Api,
    private val account: () -> SessionState?,
    private val scope: CoroutineScope,
    /** Sends a message to a watch (by its Connect IQ id). */
    private val send: (Long, JsonObject) -> Unit,
    /** Asks the watch to open LawFive, so it hears the offer. */
    private val open: (Long) -> Unit,
) {
    private val _state = MutableStateFlow<LinkState?>(null)
    val state: StateFlow<LinkState?> = _state
    private var job: Job? = null
    /** Offers are numbered from the time, so one made after the app restarts never repeats an earlier number. */
    private var offerId = (System.currentTimeMillis() / 1000 % 1_000_000).toInt()

    fun offer(watch: Long) {
        val me = account() ?: return
        val id = ++offerId
        val message = message("offer", id, "server" to me.server.trimEnd('/'), "account" to (me.name ?: me.email ?: ""))
        job?.cancel()
        _state.value = LinkState(watch, LinkStep.Offering)
        open(watch)
        job = scope.launch {
            val start = System.currentTimeMillis()
            var prompts = 1
            while (_state.value?.step == LinkStep.Offering && System.currentTimeMillis() - start < OFFER_MS) {
                send(watch, message)
                delay(RESEND_MS)
                // The watch asks its wearer to open LawFive again, in case the first ask was missed or not shown.
                if (System.currentTimeMillis() - start > prompts * PROMPT_MS) {
                    prompts++
                    open(watch)
                }
            }
            if (_state.value?.step == LinkStep.Offering) _state.value = LinkState(watch, LinkStep.NoAnswer)
        }
    }

    fun dismiss() {
        job?.cancel()
        _state.value = null
    }

    /** The watch's answers to an offer; false when the message isn't one of them. */
    fun onMessage(watch: Long, body: JsonObject): Boolean {
        val kind = body.str("kind") ?: return false
        if (kind !in setOf("accept", "decline", "busy", "linked")) return false
        val current = _state.value
        // Only the answer to the latest offer, from the watch it went to.
        if (current == null || current.watch != watch || body["id"]?.jsonPrimitive?.intOrNull != offerId) return true
        when (kind) {
            "decline" -> finish(watch, LinkStep.Declined)
            "busy" -> finish(watch, LinkStep.Busy)
            "linked" -> finish(watch, LinkStep.Linked)
            "accept" -> if (current.step == LinkStep.Offering) {
                job?.cancel()
                _state.value = LinkState(watch, LinkStep.Linking)
                val id = offerId
                job = scope.launch { link(watch, id, body.str("device") ?: "garmin") }
            }
        }
        return true
    }

    private fun finish(watch: Long, step: LinkStep, message: String? = null) {
        job?.cancel()
        _state.value = LinkState(watch, step, message)
    }

    private suspend fun link(watch: Long, id: Int, device: String) {
        val server = account()?.server?.trimEnd('/') ?: return finish(watch, LinkStep.Failed, "Signed out")
        try {
            val token = watchToken(device)
            send(watch, message("link", id, "server" to server, "token" to token))
            // The watch says "linked" once it has kept the token.
            delay(LINKED_MS)
            if (_state.value?.step == LinkStep.Linking) finish(watch, LinkStep.Failed, "The watch didn't say it was linked. Check it, and try again if it isn't.")
        } catch (e: IOException) {
            send(watch, message("failed", id, "message" to "Couldn't link"))
            finish(watch, LinkStep.Failed, if (e is ApiException) e.message else "No connection to the server.")
        }
    }

    /**
     * A token for the watch, as SYNC-1 gets one: a code asked for in the watch's name (its device
     * header, so the server names it), looked up and approved with this phone's session, then collected.
     */
    private suspend fun watchToken(device: String): String {
        val code = post("/v1/auth/device/code", JsonObject(mapOf("client_id" to JsonPrimitive(CLIENT_ID))), device).second
        val userCode = code.str("user_code") ?: throw ApiException(0, "The server didn't give a code", null)
        val deviceCode = code.str("device_code") ?: throw ApiException(0, "The server didn't give a code", null)
        var intervalMs = ((code as? JsonObject)?.get("interval")?.jsonPrimitive?.intOrNull ?: 5) * 1000L
        // Looked up first, as the Link page does: that ties the code to this account, which approving needs.
        api.call("GET", "/v1/auth/device?user_code=$userCode")
        api.call("POST", "/v1/auth/device/approve", JsonObject(mapOf("userCode" to JsonPrimitive(userCode))))
        repeat(TOKEN_TRIES) {
            // The server wants the interval between asks, from when the code was given.
            delay(intervalMs + 300)
            val (status, answer) = post(
                "/v1/auth/device/token",
                JsonObject(mapOf(
                    "grant_type" to JsonPrimitive("urn:ietf:params:oauth:grant-type:device_code"),
                    "device_code" to JsonPrimitive(deviceCode),
                    "client_id" to JsonPrimitive(CLIENT_ID),
                )),
                device,
                throwOnError = false,
            )
            if (status == 200) return answer.str("access_token") ?: throw ApiException(0, "The server didn't give the watch a token", null)
            when (answer.str("error")) {
                "authorization_pending" -> {}
                "slow_down" -> intervalMs += 5000
                else -> throw ApiException(status, answer.str("error_description") ?: "The server didn't link the watch", null)
            }
        }
        throw ApiException(0, "The server didn't finish linking the watch", null)
    }

    /** A POST in the watch's name (its device header). */
    private suspend fun post(path: String, body: JsonObject, device: String, throwOnError: Boolean = true): Pair<Int, JsonElement?> =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("${api.base()}$path")
                .header("X-LawFive-Device", device)
                .post(json.encodeToString(JsonElement.serializer(), body).toRequestBody("application/json".toMediaType()))
                .build()
            api.client.newCall(request).execute().use { res ->
                val text = res.body.string()
                val answer = if (text.isNotBlank()) runCatching { json.parseToJsonElement(text) }.getOrNull() else null
                if (!res.isSuccessful && !isLawFive(res.headers, answer)) throw notLawFive(res.code)
                if (!res.isSuccessful && throwOnError) throw ApiException(res.code, answer.str("message") ?: "The server answered ${res.code}", null)
                res.code to answer
            }
        }

    private fun message(kind: String, id: Int, vararg fields: Pair<String, String>) =
        JsonObject(mapOf("lawfive" to JsonPrimitive(1), "kind" to JsonPrimitive(kind), "id" to JsonPrimitive(id)) + fields.map { (k, v) -> k to JsonPrimitive(v) })

    private companion object {
        const val CLIENT_ID = "lawfive-garmin"
        /** How long the offer stands (someone may need to open LawFive on the watch first). */
        const val OFFER_MS = 60_000L
        const val RESEND_MS = 4_000L
        /** How often the watch is asked again to open LawFive while the offer stands. */
        const val PROMPT_MS = 20_000L
        const val LINKED_MS = 20_000L
        const val TOKEN_TRIES = 6
    }
}
