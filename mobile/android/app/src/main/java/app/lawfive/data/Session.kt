package app.lawfive.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.runBlocking

// Who's signed in, to which server (APP-2), and where sync got to (APP-3). Kept in the app's own
// storage, which only the app can read.

private val Context.sessionStore: DataStore<Preferences> by preferencesDataStore("session")

data class SessionState(
    val server: String = "",
    val token: String? = null,
    val userId: String? = null,
    val name: String? = null,
    val email: String? = null,
    /** active, pending (waiting for approval) or suspended. */
    val status: String = "active",
    val cursor: Long = 0,
    val lastSync: Long = 0,
    /**
     * APP-16, APP-26: the first sync after signing in hasn't finished yet. Set at sign-in and cleared
     * once a sync has brought everything down, even nothing (an empty account), so a later sync's
     * changes, such as the account's own first save, aren't taken for its history.
     */
    val firstSync: Boolean = false,
    /** The tips dismissed on this phone (TIP-3); they stay through signing out. */
    val tipsDone: Set<String> = emptySet(),
    /** USR-9: a new email waiting for its owner to follow the link sent to it, and until when (an ISO time). */
    val pendingEmail: String? = null,
    val pendingEmailUntil: String? = null,
) {
    val signedIn: Boolean get() = token != null
}

class Session(private val store: DataStore<Preferences>, scope: CoroutineScope) {
    constructor(context: Context, scope: CoroutineScope) : this(context.sessionStore, scope)

    private object Keys {
        val server = stringPreferencesKey("server")
        val token = stringPreferencesKey("token")
        val userId = stringPreferencesKey("userId")
        val name = stringPreferencesKey("name")
        val email = stringPreferencesKey("email")
        val status = stringPreferencesKey("status")
        val cursor = longPreferencesKey("cursor")
        val lastSync = longPreferencesKey("lastSync")
        val firstSync = booleanPreferencesKey("firstSync")
        val tipsDone = stringSetPreferencesKey("tipsDone")
        val pendingEmail = stringPreferencesKey("pendingEmail")
        val pendingEmailUntil = stringPreferencesKey("pendingEmailUntil")
    }

    private fun read(p: Preferences) = SessionState(
        server = p[Keys.server] ?: "",
        token = p[Keys.token],
        userId = p[Keys.userId],
        name = p[Keys.name],
        email = p[Keys.email],
        status = p[Keys.status] ?: "active",
        cursor = p[Keys.cursor] ?: 0,
        lastSync = p[Keys.lastSync] ?: 0,
        firstSync = p[Keys.firstSync] ?: false,
        tipsDone = p[Keys.tipsDone] ?: emptySet(),
        pendingEmail = p[Keys.pendingEmail],
        pendingEmailUntil = p[Keys.pendingEmailUntil],
    )

    /** Read once at start, so the first screen knows straight away whether anyone is signed in. */
    val state: StateFlow<SessionState> = store.data.map(::read)
        .stateIn(scope, SharingStarted.Eagerly, runBlocking { read(store.data.first()) })

    val current: SessionState get() = state.value

    suspend fun signedIn(server: String, token: String, userId: String, name: String, email: String, status: String) {
        store.edit {
            it[Keys.server] = server
            it[Keys.token] = token
            it[Keys.userId] = userId
            it[Keys.name] = name
            it[Keys.email] = email
            it[Keys.status] = status
            it[Keys.cursor] = 0
            it[Keys.lastSync] = 0
            it[Keys.firstSync] = true
            it.remove(Keys.pendingEmail)
            it.remove(Keys.pendingEmailUntil)
        }
    }

    /** The first sync after signing in has finished. */
    suspend fun firstSyncDone() {
        store.edit { it.remove(Keys.firstSync) }
    }

    suspend fun setStatus(status: String, name: String? = null, email: String? = null) {
        store.edit {
            it[Keys.status] = status
            name?.let { n -> it[Keys.name] = n }
            email?.let { e -> it[Keys.email] = e }
        }
    }

    /** USR-9, USR-10: the account as GET /v1/account (or a change to it) gave it: its name, email and any new email waiting. */
    suspend fun setAccount(name: String?, email: String?, pendingEmail: String?, pendingEmailUntil: String?) {
        store.edit {
            name?.let { n -> it[Keys.name] = n }
            email?.let { e -> it[Keys.email] = e }
            if (pendingEmail != null && pendingEmailUntil != null) {
                it[Keys.pendingEmail] = pendingEmail
                it[Keys.pendingEmailUntil] = pendingEmailUntil
            } else {
                it.remove(Keys.pendingEmail)
                it.remove(Keys.pendingEmailUntil)
            }
        }
    }

    suspend fun setServer(server: String) {
        store.edit { it[Keys.server] = server }
    }

    suspend fun synced(cursor: Long, at: Long) {
        store.edit {
            it[Keys.cursor] = cursor
            it[Keys.lastSync] = at
        }
    }

    suspend fun tipDone(id: String) {
        store.edit { it[Keys.tipsDone] = (it[Keys.tipsDone] ?: emptySet()) + id }
    }

    /** Signed out: the token and where sync got to go; the server stays for signing in again. */
    suspend fun signedOut() {
        store.edit {
            it.remove(Keys.token)
            it.remove(Keys.userId)
            it.remove(Keys.name)
            it.remove(Keys.email)
            it.remove(Keys.status)
            it.remove(Keys.pendingEmail)
            it.remove(Keys.pendingEmailUntil)
            it[Keys.cursor] = 0
            it[Keys.lastSync] = 0
            it.remove(Keys.firstSync)
        }
    }
}
