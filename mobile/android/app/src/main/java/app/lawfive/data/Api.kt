package app.lawfive.data

import android.os.Build
import app.lawfive.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

// Talking to a LawFive server (schema/generated/API.md): JSON in and out, the session's token as a
// bearer, and the X-LawFive-Device header that names this phone in the website's devices list.

/** A request that got an answer other than 2xx from LawFive: its status and the server's words. */
class ApiException(val status: Int, message: String, val body: JsonObject?) : IOException(message)

/**
 * APP-23: whether an answer is the LawFive server's own, which says so in a LawFive-Version header
 * (a server from before it is known by its JSON). Anything else, such as a proxy's 404 or 502 while
 * the server restarts, counts as not reaching the server, so nothing is dropped or signed out over it.
 */
fun isLawFive(headers: okhttp3.Headers, body: JsonElement?): Boolean = headers["LawFive-Version"] != null || body is JsonObject

/** The same, for an answer whose body hasn't been read yet. */
fun isLawFive(res: okhttp3.Response): Boolean =
    isLawFive(res.headers, runCatching { json.parseToJsonElement(res.peekBody(4096).string()) }.getOrNull())

/** Not LawFive's answer (APP-23): as if the server couldn't be reached. */
fun notLawFive(status: Int) = IOException("Something in front of the server answered $status")

/** "android; model=Pixel 9 Pro; os=17; app=2026.10.30" (APP-2, VER-3): the server names the device from it. */
val deviceHeader: String by lazy { "android; model=${Build.MODEL.replace(";", " ")}; os=${Build.VERSION.RELEASE}; app=${BuildConfig.VERSION_NAME}" }

class Api(private val session: Session) {
    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val token = session.current.token
            val request = chain.request().newBuilder()
            // The watch's own header on requests made for it (APP-7), else this phone's.
            if (chain.request().header("X-LawFive-Device") == null) request.header("X-LawFive-Device", deviceHeader)
            if (token != null && chain.request().header("Authorization") == null) {
                request.header("Authorization", "Bearer $token")
            }
            chain.proceed(request.build())
        }
        .build()

    private val jsonType = "application/json".toMediaType()

    /** The server's address without a trailing slash. */
    fun base(server: String = session.current.server) = server.trimEnd('/')

    /** A request to the API; the answer's JSON, or null for an empty one. Throws ApiException or IOException. */
    suspend fun call(method: String, path: String, body: JsonElement? = null, server: String? = null): JsonElement? =
        callRaw(method, path, body?.let { json.encodeToString(JsonElement.serializer(), it).toRequestBody(jsonType) }, server).first

    /** The same, with the response's headers, for signing in. */
    suspend fun callRaw(method: String, path: String, body: RequestBody? = null, server: String? = null): Pair<JsonElement?, okhttp3.Headers> =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("${base(server ?: session.current.server)}$path")
                .method(method, body ?: if (method == "POST" || method == "PUT") ByteArray(0).toRequestBody(jsonType) else null)
                .build()
            client.newCall(request).execute().use { res ->
                val text = res.body.string()
                val parsed = if (text.isNotBlank() && res.header("content-type")?.contains("json") == true) runCatching { json.parseToJsonElement(text) }.getOrNull() else null
                if (!res.isSuccessful) {
                    if (!isLawFive(res.headers, parsed)) throw notLawFive(res.code)
                    val obj = parsed as? JsonObject
                    // Sign-in and linking errors (Better Auth's) give a code in error and the words in error_description.
                    val message = listOf("error_description", "error", "message").firstNotNullOfOrNull { obj?.get(it)?.jsonPrimitive?.contentOrNull } ?: "The server answered ${res.code}"
                    throw ApiException(res.code, message, obj)
                }
                parsed to res.headers
            }
        }

    /** A file from the API (the account's export), written to `out` as it arrives. */
    suspend fun download(path: String, out: java.io.OutputStream) = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("${base()}$path").build()
        client.newCall(request).execute().use { res ->
            if (!res.isSuccessful) throw if (isLawFive(res)) ApiException(res.code, "The server answered ${res.code}", null) else notLawFive(res.code)
            res.body.byteStream().copyTo(out)
        }
        Unit
    }

    /** Bytes from the API (photos), with the session's sign-in. */
    suspend fun bytes(path: String): ByteArray = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("${base()}$path").build()
        client.newCall(request).execute().use { res ->
            if (!res.isSuccessful) throw if (isLawFive(res)) ApiException(res.code, "The server answered ${res.code}", null) else notLawFive(res.code)
            res.body.bytes()
        }
    }
}

/** A JSON object's string field, or null. */
fun JsonElement?.str(key: String): String? = (this as? JsonObject)?.get(key)?.jsonPrimitive?.contentOrNull

fun JsonElement?.obj(): JsonObject? = this as? JsonObject

fun JsonElement.asObject(): JsonObject = jsonObject
