package app.lawfive.data

import app.lawfive.schema.MatchWeather
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import java.io.File
import java.time.Duration
import java.time.Instant

// Match weather (WX-9, as the web's WX-5): GET /v1/weather for the upcoming matches (the server's
// window: the last month and the next 16 days) and, when Past is shown, the last year. Kept on the
// phone, so the forecast fetched at home is still there at a ground without signal.

class WeatherStore(private val api: Api, private val file: File, private val hasWeather: suspend () -> Boolean) {
    private val _byMatch = MutableStateFlow(load())
    val byMatch: StateFlow<Map<String, MatchWeather>> = _byMatch
    private val fetchedAt = mutableMapOf<Boolean, Instant>()

    /** Fetches the upcoming (or past) weather, unless it was fetched in the last 10 minutes. */
    suspend fun refresh(past: Boolean = false, force: Boolean = false) {
        val last = fetchedAt[past]
        if (!force && last != null && Duration.between(last, Instant.now()) < FRESH) return
        if (!hasWeather()) return
        val range = if (past) "?from=${Instant.now().minus(Duration.ofDays(365))}&to=${Instant.now()}" else ""
        val items = runCatching {
            api.call("GET", "/v1/weather$range")?.jsonObject?.get("items")?.let { json.decodeFromJsonElement(ListSerializer(MatchWeather.serializer()), it) }
        }.getOrNull() ?: return
        fetchedAt[past] = Instant.now()
        _byMatch.value = _byMatch.value + items.associateBy { it.matchId }
        save()
    }

    /** Signed out: another account's weather has no place here. */
    fun clear() {
        fetchedAt.clear()
        _byMatch.value = emptyMap()
        file.delete()
    }

    private suspend fun save() = withContext(Dispatchers.IO) {
        runCatching { file.writeText(json.encodeToString(ListSerializer(MatchWeather.serializer()), _byMatch.value.values.toList())) }
    }

    private fun load(): Map<String, MatchWeather> =
        runCatching { json.decodeFromString(ListSerializer(MatchWeather.serializer()), file.readText()).associateBy { it.matchId } }.getOrDefault(emptyMap())

    private companion object {
        val FRESH: Duration = Duration.ofMinutes(10)
    }
}
