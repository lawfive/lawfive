package app.lawfive.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.IntentCompat
import app.lawfive.BuildConfig
import app.lawfive.data.Api
import app.lawfive.data.SessionState
import app.lawfive.data.isLawFive
import app.lawfive.data.json
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import com.garmin.monkeybrains.serialization.MonkeyType
import com.garmin.monkeybrains.serialization.Serializer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException

// The Garmin watch through the phone (APP-7), Connect IQ's side: Garmin's companion SDK hands over
// the LawFive watch app's messages (through Garmin Connect on the phone, which starts this app for
// them when it isn't running, through WatchMessageReceiver), WatchRelay answers them, and the
// answers go back the same way.
// Debug builds can talk to the Connect IQ simulator over adb instead (lawfive.ciq.tethered in
// local.properties; mobile/android/README.md).

/** The watch app's id (watch-garmin/manifest.xml). */
const val WATCH_APP_ID = "96dae5fe5bf34b6997efbd34ec61f984"

/**
 * A watch Garmin Connect knows on this phone, for Link a watch (APP-12); `hasLawFive` is null until
 * it says. Its Garmin part number matches the model in the account's devices list.
 */
data class PhoneWatch(val id: Long, val name: String, val connected: Boolean, val partNumber: String? = null, val hasLawFive: Boolean? = null)

class WatchBridge(private val context: Context, private val api: Api, private val scope: CoroutineScope, account: () -> SessionState?) {
    val relay = WatchRelay(File(context.filesDir, "watch-relay.json"), HttpTransport(api), { account()?.server })
    /** APP-12: linking a watch from this phone. */
    val linker = WatchLinker(api, account, scope, ::sendTo, ::openOnWatch)
    private val _watches = MutableStateFlow<List<PhoneWatch>>(emptyList())
    val watches: StateFlow<List<PhoneWatch>> = _watches
    private val known = mutableMapOf<Long, IQDevice>()
    // The simulator's messages come with no app id, whichever app (or test copy) sent them.
    private val app = IQApp(if (BuildConfig.CIQ_TETHERED) "" else WATCH_APP_ID)
    /** Connect IQ once it's ready; null before, and without Garmin Connect. */
    private val iq = MutableStateFlow<ConnectIQ?>(null)
    /** Messages are answered one at a time, in the order they came, so a match goes before its pitch. */
    private val inbox = Channel<Incoming>(Channel.UNLIMITED)
    /**
     * Messages answered in the last few seconds, as one can arrive by two routes (the SDK's receiver
     * and WatchMessageReceiver). Only recent ones: the watch numbers its messages from 1 each time it starts.
     */
    private val recent = LinkedHashMap<String, Long>()

    /** A message from a watch; `done` is called once it's answered (or skipped). */
    private class Incoming(val device: IQDevice, val message: Any?, val done: (() -> Unit)? = null)

    private val listener = ConnectIQ.IQApplicationEventListener { device, _, messages, status ->
        Log.d(TAG, "SDK: ${messages.size} messages, $status")
        if (status == ConnectIQ.IQMessageStatus.SUCCESS) messages.forEach { inbox.trySend(Incoming(device, it)) }
    }

    fun start() {
        scope.launch {
            for (incoming in inbox) {
                try {
                    answer(incoming.device, incoming.message)
                } finally {
                    incoming.done?.invoke()
                }
            }
        }
        // The simulator's messages arrive as a broadcast inside this app, which the SDK's own
        // receiver doesn't get on Android 17, so a debug build with the simulator reads them itself.
        if (BuildConfig.CIQ_TETHERED) {
            ContextCompat.registerReceiver(context, object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) = receive(intent)
            }, IntentFilter(ConnectIQ.INCOMING_MESSAGE), ContextCompat.RECEIVER_EXPORTED)
        }
        val type = if (BuildConfig.CIQ_TETHERED) ConnectIQ.IQConnectType.TETHERED else ConnectIQ.IQConnectType.WIRELESS
        val instance = ConnectIQ.getInstance(context, type)
        // No dialogs from the SDK (about installing Garmin Connect): without it, the watch isn't in use.
        // Messages come as broadcasts, not through the SDK's binding service (registerAppToUseBinderService):
        // Garmin Connect never binds to it on a Pixel 9 Pro (Android 17), and registering for it stops the broadcasts.
        instance.initialize(context, false, object : ConnectIQ.ConnectIQListener {
            override fun onSdkReady() {
                runCatching { instance.registerForAppEvents(listener) }
                runCatching { instance.knownDevices.forEach { instance.registerForAppEvents(it, app, listener) } }
                    .onFailure { Log.i(TAG, "No watches yet", it) }
                iq.value = instance
                refreshWatches()
            }

            override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus) {
                Log.i(TAG, "Connect IQ isn't available: $status")
                iq.value = null
            }

            override fun onSdkShutDown() {
                iq.value = null
            }
        })
    }

    /**
     * A message broadcast to this app: Garmin Connect's (through WatchMessageReceiver, which also
     * starts the app when it isn't running) or the simulator's. `done` is called once it's answered.
     */
    fun receive(intent: Intent, done: (() -> Unit)? = null) {
        val payload = intent.getByteArrayExtra(ConnectIQ.EXTRA_PAYLOAD)
        val device = IntentCompat.getParcelableExtra(intent, ConnectIQ.EXTRA_REMOTE_DEVICE, IQDevice::class.java)
        val from = IntentCompat.getParcelableExtra(intent, ConnectIQ.EXTRA_REMOTE_APPLICATION, IQApp::class.java)?.applicationId
        val ours = fromLawFive(from, BuildConfig.CIQ_TETHERED)
        Log.d(TAG, "Broadcast: ${payload?.size} bytes from app $from on ${device?.deviceIdentifier}${if (ours) "" else " (not LawFive's)"}")
        val messages = if (payload != null && device != null && ours) {
            runCatching { Serializer.deserialize(payload).map(::unwrap) }.onFailure { Log.w(TAG, "Couldn't read the watch's message", it) }.getOrNull()
        } else null
        if (device == null || messages.isNullOrEmpty()) {
            done?.invoke()
            return
        }
        messages.forEachIndexed { i, m -> inbox.trySend(Incoming(device, m, done.takeIf { i == messages.lastIndex })) }
    }

    private suspend fun answer(device: IQDevice, message: Any?) {
        val body = toJson(message) as? JsonObject ?: return
        val key = "${device.deviceIdentifier}:${body["id"]}"
        val now = System.currentTimeMillis()
        recent.entries.removeAll { now - it.value > DUPLICATE_MS }
        if (key in recent) return
        recent[key] = now
        Log.d(TAG, "From ${device.deviceIdentifier}: ${body["kind"]} ${body["path"] ?: ""}")
        // APP-12: the watch answering this phone's offer to link it.
        if (linker.onMessage(device.deviceIdentifier, body)) return
        val answer = runCatching { relay.handle(body) }.onFailure { Log.w(TAG, "Couldn't answer the watch", it) }.getOrNull() ?: return
        reply(device, answer)
    }

    /**
     * The watches Garmin Connect knows, whether each is connected and has LawFive (for Link a watch),
     * also in the log (`adb logcat -s LawFiveWatch`).
     */
    fun refreshWatches() {
        val instance = iq.value ?: return
        runCatching {
            val devices = instance.knownDevices
            if (devices.isEmpty()) Log.i(TAG, "Connect IQ knows no watches")
            known.clear()
            devices.forEach { known[it.deviceIdentifier] = it }
            _watches.value = devices.map { device ->
                val status = runCatching { instance.getDeviceStatus(device) }.getOrNull()
                Log.i(TAG, "Watch ${device.friendlyName} (${device.deviceIdentifier}): $status")
                instance.getApplicationInfo(app.applicationId, device, object : ConnectIQ.IQApplicationInfoListener {
                    override fun onApplicationInfoReceived(info: IQApp) {
                        Log.i(TAG, "LawFive ${info.version()} is on ${device.friendlyName}")
                        hasLawFive(device.deviceIdentifier, true)
                    }

                    override fun onApplicationNotInstalled(id: String) {
                        Log.i(TAG, "LawFive isn't on ${device.friendlyName}")
                        hasLawFive(device.deviceIdentifier, false)
                    }
                })
                PhoneWatch(device.deviceIdentifier, device.friendlyName ?: "Garmin watch", status == IQDevice.IQDeviceStatus.CONNECTED,
                    runCatching { instance.getDevicePartNumber(device) }.getOrNull(),
                    _watches.value.firstOrNull { it.id == device.deviceIdentifier }?.hasLawFive)
            }
        }.onFailure { Log.i(TAG, "Couldn't list the watches", it) }
    }

    private fun hasLawFive(id: Long, yes: Boolean) {
        _watches.value = _watches.value.map { if (it.id == id) it.copy(hasLawFive = yes) else it }
    }

    /** APP-12: a message to a watch this phone knows. */
    private fun sendTo(id: Long, message: JsonObject) {
        val device = known[id] ?: return
        scope.launch { reply(device, message) }
    }

    /** APP-12: asks the watch to open LawFive (it asks its wearer), so it hears the offer. */
    private fun openOnWatch(id: Long) {
        val device = known[id] ?: return
        val instance = iq.value ?: return
        runCatching { instance.openApplication(device, app) { _, _, status -> Log.i(TAG, "Open LawFive on the watch: $status") } }
            .onFailure { Log.i(TAG, "Couldn't ask the watch to open LawFive", it) }
    }

    /** The answer goes back once Connect IQ is ready (the app may have just been started for the message). */
    private suspend fun reply(device: IQDevice, answer: JsonObject) {
        val instance = withTimeoutOrNull(READY_MS) { iq.filterNotNull().first() }
        if (instance == null) {
            Log.w(TAG, "Connect IQ wasn't ready to answer the watch")
            return
        }
        runCatching {
            instance.sendMessage(device, app, fromJson(answer)) { _, _, status ->
                if (status != ConnectIQ.IQMessageStatus.SUCCESS) Log.w(TAG, "The watch didn't get the answer: $status")
            }
        }.onFailure { Log.w(TAG, "Couldn't answer the watch", it) }
    }

    private companion object {
        const val TAG = "LawFiveWatch"
        const val DUPLICATE_MS = 5_000L
        const val READY_MS = 5_000L
    }
}

/** Requests with the watch's token and device header, as the watch would make them itself. */
private class HttpTransport(private val api: Api) : WatchTransport {
    private val jsonType = "application/json".toMediaType()

    override suspend fun send(server: String, method: String, path: String, body: JsonElement?, token: String, device: String): Pair<Int, JsonElement?>? =
        withContext(Dispatchers.IO) {
            val base = "${server.trimEnd('/')}$path".toHttpUrlOrNull() ?: return@withContext 404 to null
            val url = if (method == "GET" && body is JsonObject) {
                base.newBuilder().apply { body.forEach { (k, v) -> addQueryParameter(k, (v as? JsonPrimitive)?.contentOrNull ?: v.toString()) } }.build()
            } else base
            val request = Request.Builder().url(url)
                .header("Authorization", "Bearer $token")
                .header("X-LawFive-Device", device)
                .method(method, if (method == "GET") null else json.encodeToString(JsonElement.serializer(), body ?: JsonObject(emptyMap())).toRequestBody(jsonType))
                .build()
            try {
                api.client.newCall(request).execute().use { res ->
                    val text = res.body.string()
                    val parsed = if (text.isNotBlank()) runCatching { json.parseToJsonElement(text) }.getOrNull() else null
                    // APP-23: a proxy's answer is no answer, so what the watch sent is kept for later.
                    if (!res.isSuccessful && !isLawFive(res.headers, parsed)) null else res.code to parsed
                }
            } catch (_: IOException) {
                null
            }
        }
}

/**
 * Whether a broadcast message is from LawFive's watch app, by the app id it names (EXTRA_REMOTE_APPLICATION).
 * Garmin Connect always names it (the SDK's own receiver reads it unchecked); the receiver is exported for
 * Garmin Connect, so a message naming none, or another app, is someone else's and isn't answered or kept. The
 * Connect IQ simulator names an empty one, so only a tethered debug build takes a message without an id.
 */
internal fun fromLawFive(from: String?, tethered: Boolean): Boolean =
    if (tethered) from.isNullOrEmpty() else from != null && from.replace("-", "").equals(WATCH_APP_ID, ignoreCase = true)

/** The SDK's decoded Monkey C values as plain Java ones (its containers hold more of them). */
private fun unwrap(value: Any?): Any? = when (value) {
    is MonkeyType<*> -> unwrap(value.toJava())
    is Map<*, *> -> HashMap<Any?, Any?>().apply { value.forEach { (k, v) -> put(unwrap(k), unwrap(v)) } }
    is List<*> -> value.map(::unwrap)
    else -> value
}
