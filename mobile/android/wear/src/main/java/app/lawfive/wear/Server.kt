package app.lawfive.wear

import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

// WCH-4: straight to the server, over the watch's own connection (through the phone, Wi-Fi or LTE, as
// the system finds), with the same API as the Garmin watch. No bridge through the phone app.

const val CLIENT_ID = "lawfive-wear"

class ServerRefused(val status: Int, val body: JsonObject?) : Exception("HTTP $status")

fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.intOrNull
fun JsonObject.bool(key: String): Boolean? = (this[key] as? JsonPrimitive)?.booleanOrNull
fun JsonObject.withFeePaid(paid: Boolean): JsonObject {
    val fee = this["fee"] as? JsonObject ?: return this
    return JsonObject(this + ("fee" to JsonObject(fee + ("paid" to JsonPrimitive(paid)))))
}

/**
 * "wearos; model=Pixel Watch 3; os=16; app=2026.10.31" (VER-3): the server names the device from it. Read when first
 * sent, so the unit tests can use this file's JSON helpers without Android.
 */
private val deviceHeader by lazy { "wearos; model=${Build.MODEL.replace(";", " ")}; os=${Build.VERSION.RELEASE}; app=${BuildConfig.VERSION_NAME}" }

class Server(private val base: () -> String) {
    private val client = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(40, TimeUnit.SECONDS).build()
    private val type = "application/json".toMediaType()

    private suspend fun call(method: String, path: String, token: String?, body: JsonElement?): JsonObject = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(base().trimEnd('/') + path)
            .header("X-LawFive-Device", deviceHeader)
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .method(method, if (method == "GET") null else (body?.toString() ?: "{}").toRequestBody(type))
            .build()
        client.newCall(request).execute().use { res ->
            val text = res.body.string()
            val parsed = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull()
            // APP-23: only the server's own answer (its LawFive-Version header, or an older one's JSON)
            // counts; a proxy's 404 or 502 while it restarts is as if it couldn't be reached, so nothing is dropped.
            if (!res.isSuccessful && res.header("LawFive-Version") == null && parsed == null) throw IOException("Something in front of the server answered ${res.code}")
            if (!res.isSuccessful) throw ServerRefused(res.code, parsed)
            parsed ?: JsonObject(emptyMap())
        }
    }

    suspend fun get(path: String, token: String?) = call("GET", path, token, null)
    suspend fun post(path: String, token: String?, body: JsonElement?) = call("POST", path, token, body)

    /** SYNC-1: a code to enter on the website. */
    suspend fun deviceCode() = post("/v1/auth/device/code", null, buildJsonObject { put("client_id", CLIENT_ID) })

    suspend fun deviceToken(deviceCode: String) = post("/v1/auth/device/token", null, buildJsonObject {
        put("grant_type", "urn:ietf:params:oauth:grant-type:device_code")
        put("device_code", deviceCode)
        put("client_id", CLIENT_ID)
    })
}
