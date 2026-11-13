package app.lawfive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.lawfive.data.json
import app.lawfive.data.str
import app.lawfive.schema.Match
import app.lawfive.schema.MatchWeather
import app.lawfive.schema.Venue
import app.lawfive.ui.components.riskTitle
import app.lawfive.ui.formatTime
import app.lawfive.ui.kickoffAt
import app.lawfive.ui.matchTitle
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Duration
import java.time.Instant
import kotlin.coroutines.resume

// Notifications from the server (PUSH-4, PUSH-5, NOTE-4). The phone gets a Firebase token, swaps it
// at the push relay for a handle only the relay can read, and gives that to its server, while weather
// risks or matches from integrations are turned on. A push says only which match or notice; the phone
// asks its own server for the rest and writes the notification itself (Notices.kt for integrations).

private val Context.pushStore: DataStore<Preferences> by preferencesDataStore("push")

/** What was last registered: a new token, another server or an old handle means registering again. */
internal fun needsRegistering(token: String, server: String, registeredToken: String?, registeredServer: String?, registeredAt: Instant?, now: Instant): Boolean =
    token != registeredToken || server != registeredServer || registeredAt == null || Duration.between(registeredAt, now) > RENEW_AFTER

private val RENEW_AFTER: Duration = Duration.ofDays(30)

/** "Lightning likely, Rain possible": the likeliest first. */
internal fun riskLine(w: MatchWeather): String = w.risks.sortedBy { it.level != "likely" }.joinToString(", ") { riskTitle(it) }

class Push(private val context: Context, private val graph: AppGraph) {
    private object Keys {
        val token = stringPreferencesKey("token")
        val server = stringPreferencesKey("server")
        val at = longPreferencesKey("at")
    }

    /** Not the API's client: that one adds the session's sign-in, which the relay has no business seeing. */
    private val relayClient = OkHttpClient()

    /** This build has a Firebase app to get tokens from. */
    val available: Boolean get() = BuildConfig.FIREBASE_APP_ID.isNotEmpty()

    fun start() {
        if (!available || FirebaseApp.getApps(context).isNotEmpty()) return
        FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
            .setApplicationId(BuildConfig.FIREBASE_APP_ID)
            .setApiKey(BuildConfig.FIREBASE_API_KEY)
            .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
            .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
            .build())
    }

    /** This build and the signed-in server can do it. */
    suspend fun offered(): Boolean = available && graph.session.current.signedIn && graph.meta()?.capabilities?.contains("push") == true

    /** NOTE-4: and the server tells phones what integrations do. */
    suspend fun noticesOffered(): Boolean = offered() && graph.meta()?.capabilities?.contains("notices") == true

    /** Brings the server up to date with what's wanted. Throws if it can't be reached, to be tried again at the next sync. */
    suspend fun refresh() {
        val session = graph.session.current
        if (!available || !session.signedIn) return
        val saved = context.pushStore.data.first()
        val wanted = graph.reminders.settings.first().let { it.weatherRisks || it.integrations }
        if (!wanted || !graph.reminders.canNotify()) {
            if (saved[Keys.at] != null) {
                graph.api.call("PUT", "/v1/devices/current/push", JsonObject(mapOf("handle" to JsonNull)))
                forget()
            }
            return
        }
        if (!offered()) return
        val token = firebaseToken() ?: return
        if (!needsRegistering(token, session.server, saved[Keys.token], saved[Keys.server], saved[Keys.at]?.let(Instant::ofEpochMilli), Instant.now())) return
        val handle = register(token, session.server)
        graph.api.call("PUT", "/v1/devices/current/push", JsonObject(mapOf("handle" to JsonPrimitive(handle))))
        context.pushStore.edit {
            it[Keys.token] = token
            it[Keys.server] = session.server
            it[Keys.at] = Instant.now().toEpochMilli()
        }
    }

    /** Signed out: the session and its handle have gone from the server. */
    suspend fun forget() {
        context.pushStore.edit { it.clear() }
    }

    private suspend fun firebaseToken(): String? = suspendCancellableCoroutine { done ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task -> done.resume(if (task.isSuccessful) task.result else null) }
    }

    private suspend fun register(token: String, server: String): String = withContext(Dispatchers.IO) {
        val body = JsonObject(mapOf("token" to JsonPrimitive(token), "server" to JsonPrimitive(server), "platform" to JsonPrimitive("android")))
        val request = Request.Builder()
            .url("${BuildConfig.PUSH_RELAY.trimEnd('/')}/v1/register")
            .post(json.encodeToString(JsonObject.serializer(), body).toRequestBody("application/json".toMediaType()))
            .build()
        relayClient.newCall(request).execute().use { res ->
            if (!res.isSuccessful) throw IOException("The push relay answered ${res.code}")
            json.parseToJsonElement(res.body.string()).str("handle") ?: throw IOException("The push relay sent no handle")
        }
    }

    companion object {
        const val CHANNEL = "weather-risks"

        fun ensureChannel(context: Context) {
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Weather risks", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
}

/** Firebase's way in, which it starts when a push arrives or the token changes. */
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        graph.scope.launch { runCatching { graph.push.refresh() } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // PUSH-6: an admin's test from Settings → Server, which has nothing to look up.
        if (message.data["type"] == "test") {
            if (!graph.reminders.canNotify()) return
            Push.ensureChannel(this)
            val open = android.app.PendingIntent.getActivity(this, 7302, android.content.Intent(this, MainActivity::class.java), android.app.PendingIntent.FLAG_IMMUTABLE)
            val notification = lawFiveNotification(this, Push.CHANNEL)
                .setContentTitle("Test notification")
                .setContentText("Notifications from your LawFive server are reaching this phone.")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build()
            try {
                NotificationManagerCompat.from(this).notify(7302, notification)
            } catch (_: SecurityException) {
                // Notifications turned off for the app since.
            }
            return
        }
        val id = message.data["id"] ?: return
        // NOTE-4: what an integration did; the id is the server's notice.
        if (message.data["type"] == "match-changed") {
            val work = OneTimeWorkRequestBuilder<NoticeWorker>()
                .setInputData(workDataOf("notice" to id))
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
            WorkManager.getInstance(this).enqueueUniqueWork("notice-$id", ExistingWorkPolicy.KEEP, work)
            return
        }
        if (message.data["type"] != "weather-risk") return
        val work = OneTimeWorkRequestBuilder<RiskWorker>()
            .setInputData(workDataOf("match" to id))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork("risk-$id", ExistingWorkPolicy.REPLACE, work)
    }
}

/** PUSH-5: asks the server what's forecast, and says so. If the risk has gone by now, nothing shows. */
class RiskWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    /** Only before Android 12, where this work runs as a foreground service for a moment. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        Push.ensureChannel(applicationContext)
        val notification: Notification = lawFiveNotification(applicationContext, Push.CHANNEL)
            .setContentTitle("Checking the forecast")
            .build()
        return ForegroundInfo(FOREGROUND_ID, notification)
    }

    override suspend fun doWork(): Result {
        val graph = applicationContext.graph
        val id = inputData.getString("match") ?: return Result.success()
        if (!graph.session.current.signedIn || !graph.reminders.settings.first().weatherRisks || !graph.reminders.canNotify()) return Result.success()
        runCatching { graph.sync.sync() }
        graph.weather.refresh(force = true)
        val weather = graph.weather.byMatch.value[id]?.takeIf { it.risks.isNotEmpty() } ?: return Result.success()
        val record = graph.db.records().all("matches").firstNotNullOfOrNull { row ->
            runCatching { json.decodeFromString(Match.serializer(), row.json) }.getOrNull()?.takeIf { it.id == id }
        } ?: return Result.success()
        Push.ensureChannel(applicationContext)
        val time = kickoffAt(record)?.let { formatTime(it, applicationContext) }
        val venue = graph.db.records().all("venues").firstNotNullOfOrNull { row ->
            runCatching { json.decodeFromString(Venue.serializer(), row.json) }.getOrNull()?.takeIf { it.id == record.venueId }
        }
        val place = venue?.pitches?.firstOrNull { it.id == record.pitchId }?.position ?: venue?.position
        val notification = matchNotification(applicationContext, Push.CHANNEL, id, "Weather risk: ${matchTitle(record)}", listOfNotNull(riskLine(weather), time).joinToString(" · "), place?.lat, place?.lon, graph.records.settings.first()?.mapsApp)
        try {
            NotificationManagerCompat.from(applicationContext).notify("risk".hashCode() xor id.hashCode(), notification)
        } catch (_: SecurityException) {
            // Notifications turned off for the app since.
        }
        return Result.success()
    }

    private companion object {
        const val FOREGROUND_ID = 7301
    }
}
