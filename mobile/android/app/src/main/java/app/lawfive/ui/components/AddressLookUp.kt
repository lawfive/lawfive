package app.lawfive.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import app.lawfive.AppGraph
import app.lawfive.data.ApiException
import app.lawfive.data.json
import app.lawfive.schema.Place
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.theme.colors
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.jsonObject
import kotlin.math.abs

// Looking up a venue's address and placing it on the map, as the website's AddressLookUp.tsx: the
// venue form's Find on map, and (WEB-12) a new venue made from the match form, which does the same
// so the match gets its forecast and directions from the start.

/** The address search, choosing for itself when it finds one place; `onChoose` places the venue. */
class AddressLookUp internal constructor(private val graph: AppGraph, private val onChoose: () -> (Place) -> Unit) {
    /** Whether this server has an address search (ADM-1). */
    var available by mutableStateOf(false)
        internal set
    var looking by mutableStateOf(false)
        private set
    /** The places found, while there's more than one to choose from (or none). */
    var found by mutableStateOf<List<Place>?>(null)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    /** Looks the address up; one place found is chosen straight away and returned. */
    suspend fun lookUp(address: String): Place? {
        looking = true
        error = null
        val answer = runCatching { graph.api.call("GET", "/v1/geocode?q=${java.net.URLEncoder.encode(address.trim(), "UTF-8")}") }
        looking = false
        val places = answer.getOrNull()?.jsonObject?.get("results")?.let { runCatching { json.decodeFromJsonElement(ListSerializer(Place.serializer()), it) }.getOrNull() }
        if (places == null) {
            // PLAN-11: the plan's searches for today, or the service not answering; the pin still works.
            found = null
            error = (answer.exceptionOrNull() as? ApiException)?.message ?: "The address search didn't answer."
            return null
        }
        val once = distinctPlaces(places)
        if (once.size == 1) {
            choose(once[0])
            return once[0]
        }
        found = once
        return null
    }

    fun choose(place: Place) {
        onChoose()(place)
        found = null
    }

    fun clear() {
        found = null
        error = null
    }

    companion object {
        /** The same place can come back twice under one name, a few meters apart; it's offered once. */
        fun distinctPlaces(places: List<Place>): List<Place> =
            places.filterIndexed { i, p -> places.indexOfFirst { q -> q.name == p.name && abs(q.lat - p.lat) < 0.002 && abs(q.lon - p.lon) < 0.002 } == i }
    }
}

@Composable
fun rememberAddressLookUp(onChoose: (Place) -> Unit): AddressLookUp {
    val graph = LocalGraph.current
    val latest by rememberUpdatedState(onChoose)
    val search = remember { AddressLookUp(graph) { latest } }
    LaunchedEffect(Unit) { search.available = graph.meta()?.capabilities?.contains("geocode") == true }
    return search
}

/** What the search found, under the address: the places to choose from, or why there are none. `instead` says what to do then. */
@Composable
fun FoundPlaces(search: AddressLookUp, instead: String) {
    val error = search.error
    val found = search.found
    if (error == null && found == null) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (error != null) {
            Text(if (error.contains("by hand") || error.contains("map", ignoreCase = true)) error else "$error $instead", style = MaterialTheme.typography.bodyMedium, color = colors.redText)
        }
        if (found != null) {
            if (found.isEmpty()) Text("Nothing found for that address. $instead", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            if (found.size > 1) {
                Text("Which one is it?", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                found.forEach { p ->
                    Text(p.name, Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).clickable { search.choose(p) }.padding(vertical = 8.dp),
                        style = MaterialTheme.typography.bodyMedium, color = colors.brand)
                }
            }
        }
    }
}
