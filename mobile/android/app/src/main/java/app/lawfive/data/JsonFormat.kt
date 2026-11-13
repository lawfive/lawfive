package app.lawfive.data

import kotlinx.serialization.json.Json

/** How the app reads and writes JSON: fields it doesn't know are ignored, and absent ones left out. */
val json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
    coerceInputValues = true
}
