package app.lawfive

import android.app.Application
import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.lawfive.data.Api
import app.lawfive.data.HealthSave
import app.lawfive.data.ApiException
import app.lawfive.data.LawFiveDb
import app.lawfive.data.AppLink
import app.lawfive.data.Records
import app.lawfive.data.Session
import app.lawfive.data.SyncActivity
import app.lawfive.data.SyncEngine
import app.lawfive.data.WeatherStore
import app.lawfive.data.json
import app.lawfive.schema.ServerMeta
import app.lawfive.watch.WatchBridge
import app.lawfive.data.str
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.util.concurrent.TimeUnit
import app.lawfive.data.Collections
import app.lawfive.schema.UserSettings

// The app's parts, made once: the session, the API, the phone's database, sync and the records.

class LawFiveApplication : Application(), coil3.SingletonImageLoader.Factory {
    lateinit var graph: AppGraph

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
        graph.push.start()
        graph.watch.start()
        graph.scheduleBackgroundSync()
    }

    /** Photos load with the session's sign-in, through the API's client (APP-5). */
    override fun newImageLoader(context: coil3.PlatformContext): coil3.ImageLoader =
        coil3.ImageLoader.Builder(context)
            .components { add(coil3.network.okhttp.OkHttpNetworkFetcherFactory(callFactory = { graph.api.client })) }
            .build()
}

val Context.graph: AppGraph get() = (applicationContext as LawFiveApplication).graph

class AppGraph(private val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val session = Session(context, scope)
    val api = Api(session)
    val quiz = app.lawfive.data.QuizStore(context, api)
    val db = LawFiveDb.open(context)
    /** What's syncing, for the sync screen (APP-16). */
    val syncActivity = SyncActivity()
    /** The matches from a watch waiting for their summary (APP-26). */
    val fromWatch = app.lawfive.data.FromWatch(File(context.filesDir, "from-watch.json"))
    val sync = SyncEngine(api, db, session, syncActivity, fromWatch) { forgetAccount() }
    val health = HealthSave(context, api, db)
    val records = Records(db) { requestSync() }
    val reminders = Reminders(context)
    /** Notifications from the server, through the push relay (PUSH-4, PUSH-5). */
    val push = Push(context, this)
    /** The Garmin watch's sync through this phone (APP-7). */
    val watch = WatchBridge(context, api, scope) { session.current.takeIf { it.signedIn } }
    /** Match weather (WX-9). */
    val weather = WeatherStore(api, File(context.filesDir, "weather.json")) { meta()?.capabilities?.contains("weather") == true }
    /** Stats, with the last answer for each set of filters (STAT-13). */
    val stats = app.lawfive.data.StatsStore(api, File(context.filesDir, "stats.json"))
    val merging = app.lawfive.data.Merging(api)
    /** Which matches are on which watch (SYNC-14), kept for when there's no signal. */
    val onWatch = app.lawfive.data.OnWatchStore(api, File(context.filesDir, "on-watch.json"))

    /** A notification tapped: the match to open once the app is showing (PUSH-5, APP-6). */
    val pendingMatch = MutableStateFlow<String?>(null)

    private var pendingSync: Job? = null

    init {
        watch.relay.activity = syncActivity
        // APP-26: a match the watch handed over comes down to the phone, so the sync screen can become its summary.
        watch.relay.matchSent = { requestSync() }
        syncActivity.handOver = { fromWatch.waiting.value.isNotEmpty() }
        scope.launch {
            while (true) {
                delay(1000)
                syncActivity.tick()
            }
        }
    }

    /** A sync soon: changes made one after another go together. */
    fun requestSync(delayMs: Long = 1500) {
        pendingSync?.cancel()
        pendingSync = scope.launch {
            delay(delayMs)
            syncAndRefresh()
        }
    }

    /**
     * A sync now, returning once it's done, for pulling a page down (APP-3). One already running is
     * waited for first. It runs in the app's scope, so leaving the page doesn't stop it halfway.
     */
    suspend fun syncNow() {
        pendingSync?.cancel()
        scope.launch {
            sync.status.first { !it.running }
            syncAndRefresh()
        }.also { pendingSync = it }.join()
    }

    private suspend fun syncAndRefresh() {
        if (sync.sync()) {
            fillTimeZone()
            reminders.reschedule()
            watch.relay.refresh()
            onWatch.refresh()
            weather.refresh()
            runCatching { push.refresh() }
            runCatching { health.saveNew() }
        }
    }

    /**
     * PLAN-9: an account's time zone comes from the first browser or phone that signs in. Only on a
     * server with plans: an older one drops the field, and filling it in again would sync forever.
     */
    private suspend fun fillTimeZone() {
        val settings = records.settings.first() ?: return
        if (settings.timeZone == null && meta()?.capabilities?.contains("plans") == true) {
            runCatching { records.save(Collections.SETTINGS, settings.id, UserSettings.serializer(), settings.copy(timeZone = java.time.ZoneId.systemDefault().id)) }
        }
    }

    fun scheduleBackgroundSync() {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(30, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** GET /v1/meta: the server's name for itself, or why it isn't a LawFive server. */
    suspend fun checkServer(server: String): String {
        val meta = api.call("GET", "/v1/meta", server = server)?.jsonObject
        return if (meta.str("product") == "LawFive") server else throw ApiException(0, "That isn't a LawFive server", null)
    }

    private var serverMeta: ServerMeta? = null

    /** The server's description (its maps, what it offers), fetched once a run; null offline. */
    suspend fun meta(): ServerMeta? = serverMeta
        ?: runCatching { api.call("GET", "/v1/meta")?.let { json.decodeFromJsonElement(ServerMeta.serializer(), it) } }.getOrNull()?.also { serverMeta = it }

    /** Whether the server finds duplicates and previews merges (DUP-11); servers from before it don't. */
    suspend fun mergingOffered(): Boolean = meta()?.capabilities?.contains("merging") == true

    /** A QR code or lawfive:// link waiting for the sign-in screen (APP-13, APP-14). */
    val pendingLink = MutableStateFlow<AppLink?>(null)

    /** The address a link's server wants apps to use (API_URL, which may differ from the web app's): it's asked, as checkServer does. */
    suspend fun apiServer(server: String): String {
        val meta = api.call("GET", "/v1/meta", server = server)?.jsonObject
        if (meta.str("product") != "LawFive") throw ApiException(0, "That isn't a LawFive server", null)
        return meta.str("apiUrl")?.let { AppLink.serverOf(it, BuildConfig.DEBUG) } ?: server
    }

    /**
     * APP-2: the page on a server's website where accounts are made (its publicUrl's /signup, from
     * GET /v1/meta), or null when it doesn't say where its website is or takes no new accounts.
     */
    suspend fun signUpPage(server: String): String? = website(server).signUp

    /** A server's website, from GET /v1/meta's publicUrl: where its accounts are made (APP-2), unless it takes no new ones, and where a forgotten password is reset (USR-7). */
    data class Website(val signUp: String?, val forgotPassword: String?)

    suspend fun website(server: String): Website {
        val meta = api.call("GET", "/v1/meta", server = server)?.jsonObject
        if (meta.str("product") != "LawFive") return Website(null, null)
        val site = meta.str("publicUrl")?.trimEnd('/')?.takeIf { it.startsWith("https://") || it.startsWith("http://") } ?: return Website(null, null)
        return Website(if (meta.str("signUp") == "closed") null else "$site/signup", "$site/forgot-password")
    }

    /** Whose a sign-in code is (APP-13): their name and email, for the phone to ask first. */
    suspend fun checkCode(server: String, code: String): Pair<String, String> {
        val body = JsonObject(mapOf("code" to JsonPrimitive(code)))
        val answer = api.call("POST", "/v1/app-sign-in/check", body, server)
        return (answer.str("name") ?: "") to (answer.str("email") ?: "")
    }

    /** Signs in with a code (APP-13): the server gives this phone a session of its own. */
    suspend fun signInWithCode(server: String, code: String) {
        val answer = api.call("POST", "/v1/app-sign-in/redeem", JsonObject(mapOf("code" to JsonPrimitive(code))), server)
        val token = answer.str("token") ?: throw ApiException(0, "The server didn't sign you in", null)
        finishSignIn(server, token, answer?.jsonObject?.get("user")?.jsonObject, "")
    }

    /** Looks an invitation up (APP-14): who it's from, and the name and address it's for. */
    suspend fun lookUpInvite(server: String, token: String) = api.call("GET", "/v1/invite/$token", server = server)

    /** Makes an account with an invitation (APP-14) and signs in with it. */
    suspend fun signUpWithInvite(server: String, invite: String, name: String, email: String, password: String) {
        val body = JsonObject(mapOf("name" to JsonPrimitive(name), "email" to JsonPrimitive(email), "password" to JsonPrimitive(password), "invite" to JsonPrimitive(invite)))
            .toString().toRequestBody("application/json".toMediaType())
        val (answer, headers) = api.callRaw("POST", "/v1/auth/sign-up/email", body, server)
        val token = headers["set-auth-token"] ?: throw ApiException(0, "The server didn't sign you in", null)
        finishSignIn(server, token, answer?.jsonObject?.get("user")?.jsonObject, email)
    }

    /** Signs in with email and password (APP-2); the token comes back in set-auth-token. */
    suspend fun signIn(server: String, email: String, password: String) {
        val body = JsonObject(mapOf("email" to JsonPrimitive(email.trim()), "password" to JsonPrimitive(password)))
            .toString().toRequestBody("application/json".toMediaType())
        val (answer, headers) = api.callRaw("POST", "/v1/auth/sign-in/email", body, server)
        val token = headers["set-auth-token"] ?: throw ApiException(0, "The server didn't sign you in", null)
        finishSignIn(server, token, answer?.jsonObject?.get("user")?.jsonObject, email)
    }

    private suspend fun finishSignIn(server: String, token: String, user: JsonObject?, email: String) {
        serverMeta = null
        records.forgetDefaults()
        db.records().clear()
        db.outbox().clear()
        session.signedIn(server, token, user.str("id") ?: "", user.str("name") ?: "", user.str("email") ?: email, user.str("status") ?: "active")
        refreshAccount()
        requestSync(0)
    }

    /** The account's status (waiting for approval, suspended) and name. */
    suspend fun refreshAccount() {
        try {
            val account = api.call("GET", "/v1/account")?.jsonObject
            val was = session.current.status
            val status = account.str("status") ?: "active"
            session.setStatus(status, account.str("name"), account.str("email"))
            session.setAccount(account.str("name"), account.str("email"), account.str("pendingEmail"), account.str("pendingEmailUntil"))
            // APP-2: just approved (Check again on the waiting page): sync now, so the first look at
            // Matches isn't the sync that failed while the account waited.
            if (was != "active" && status == "active") requestSync(0)
        } catch (e: ApiException) {
            if (e.status == 401) forgetAccount()
        } catch (_: Exception) {
            // Offline: keep what we knew.
        }
    }

    /** USR-10: a new name for the account, with the same rule as signing up (1 to 100 characters, trimmed). Throws what the server said. */
    suspend fun changeName(name: String) {
        api.call("POST", "/v1/auth/update-user", JsonObject(mapOf("name" to JsonPrimitive(name.trim()))))
        session.setStatus(session.current.status, name.trim())
        refreshAccount()
    }

    /**
     * USR-7, USR-9: a new email, with the password. On a server that can send email the address waits
     * for its owner to follow the link sent to it (true); without, it changes straight away (false).
     */
    suspend fun changeEmail(email: String, password: String): Boolean {
        val answer = api.call("PUT", "/v1/account/email", JsonObject(mapOf("email" to JsonPrimitive(email.trim()), "password" to JsonPrimitive(password))))?.jsonObject
        session.setAccount(answer.str("name"), answer.str("email"), answer.str("pendingEmail"), answer.str("pendingEmailUntil"))
        return answer.str("pendingEmail") != null
    }

    /** USR-9: the link sent to a new address stops working, and the email stays as it is. */
    suspend fun cancelEmailChange() {
        val answer = api.call("DELETE", "/v1/account/email")?.jsonObject
        session.setAccount(answer.str("name"), answer.str("email"), answer.str("pendingEmail"), answer.str("pendingEmailUntil"))
    }

    /** USR-7: a new password, with the current one. Other devices stay signed in. */
    suspend fun changePassword(current: String, next: String) {
        api.call("POST", "/v1/auth/change-password", JsonObject(mapOf("currentPassword" to JsonPrimitive(current), "newPassword" to JsonPrimitive(next))))
    }

    suspend fun signOut() {
        try {
            api.call("POST", "/v1/auth/sign-out", JsonObject(emptyMap()))
        } catch (_: Exception) {
            // Signed out on the phone whatever the server says.
        }
        forgetAccount()
    }

    /**
     * APP-21: deletes the account on its server, with the password; then everything of it here goes
     * too. Throws what the server said (a wrong password, or the server's only admin) with nothing changed.
     */
    suspend fun deleteAccount(password: String) {
        api.call("POST", "/v1/account/delete", kotlinx.serialization.json.buildJsonObject { put("password", JsonPrimitive(password)) })
        watch.relay.forgetEverything()
        forgetAccount()
        reminders.reschedule()
    }

    /** The account's copy and the session go (signed out, or the session ended elsewhere). */
    suspend fun forgetAccount() {
        session.signedOut()
        pendingMatch.value = null
        push.forget()
        weather.clear()
        stats.clear()
        onWatch.clear()
        health.forget()
        fromWatch.clear()
        records.forgetDefaults()
        db.records().clear()
        db.outbox().clear()
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val graph = applicationContext.graph
        return if (graph.sync.sync()) {
            graph.reminders.reschedule()
            graph.watch.relay.refresh()
            graph.onWatch.refresh()
            runCatching { graph.push.refresh() }
            runCatching { graph.health.saveNew() }
            Result.success()
        } else {
            Result.retry()
        }
    }
}

@Suppress("unused")
private fun JsonObject.toJsonString(): String = json.encodeToString(JsonObject.serializer(), this)
