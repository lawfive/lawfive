package app.lawfive.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.graphics.createBitmap
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.lawfive.schema.ServerMetaMaps
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.theme.colors
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point

// Maps of venues (APP-4), as the web's VenueMap: pins for where you park (P) and each pitch (1, 2,
// 3…), or one per venue on the Venues tab. The map comes from the server's settings (/v1/meta), so a
// self-hosted server can use its own provider: a vector map (OpenFreeMap's by default, with its
// dark style in dark mode) or raster tiles, and a Map / Satellite switch when it has imagery.

data class MapPin(
    val id: String,
    val lat: Double,
    val lon: Double,
    val kind: Kind,
    /** Text on the pin: P, a pitch number; none on a venue's. */
    val mark: String = "",
) {
    enum class Kind { Parking, Pitch, Venue }
}

private const val SOURCE = "pins"
private const val LAYER = "pins"
/** Parking's blue on the web's pins. */
private const val PARKING_BLUE = 0xFF1D5FA8.toInt()

/**
 * The map, with `pins` on it, fitted to them when first shown and when `fitKey` changes. A tap on
 * a pin calls onPinClick; a tap elsewhere onPick (to place the active pin).
 */
@Composable
fun VenueMap(
    pins: List<MapPin>,
    modifier: Modifier = Modifier,
    height: Dp = 280.dp,
    activeId: String? = null,
    fitKey: Any? = Unit,
    onPick: ((Double, Double) -> Unit)? = null,
    onPinClick: ((String) -> Unit)? = null,
) { app.lawfive.ui.theme.OnPanel {
    val graph = LocalGraph.current
    val maps by produceState<ServerMetaMaps?>(null) { value = graph.meta()?.maps }
    var satellite by rememberSaveable { mutableStateOf(false) }
    val dark = colors.dark
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(6.dp)).background(colors.surface2).border(1.dp, colors.border, RoundedCornerShape(6.dp))) {
        // In a preview or the snapshot tests (LocalInspectionMode), which can't draw MapLibre, the placeholder too.
        val m = maps?.takeIf { !androidx.compose.ui.platform.LocalInspectionMode.current }
        if (m == null) {
            // Offline, or still asking the server: the placeholder pitch, as the web's map shows under its tiles.
            LoadingPitch(Modifier.align(Alignment.Center))
        } else {
            val styleKey = when {
                satellite && m.satellite != null -> "satellite"
                m.style != null -> if (dark && m.style?.darkUrl != null) "dark" else "light"
                else -> "raster"
            }
            MapLibreView(m, styleKey, pins, activeId, fitKey, onPick, onPinClick)
            m.satellite?.let {
                Segmented(listOf(false to "Map", true to "Satellite"), satellite, { satellite = it }, Modifier.align(Alignment.TopEnd).padding(8.dp))
            }
        }
    }
}
}

@Composable
private fun MapLibreView(
    maps: ServerMetaMaps,
    styleKey: String,
    pins: List<MapPin>,
    activeId: String?,
    fitKey: Any?,
    onPick: ((Double, Double) -> Unit)?,
    onPinClick: ((String) -> Unit)?,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val brand = colors.brand.toArgb()
    val ring = colors.yellow.toArgb()
    val pick by rememberUpdatedState(onPick)
    val pinClick by rememberUpdatedState(onPinClick)
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var style by remember { mutableStateOf<Style?>(null) }
    val view = remember {
        MapLibre.getInstance(context)
        // A TextureView, so the map clips to its card's corners and scrolls with the page.
        MapView(context, MapLibreMapOptions.createFromAttributes(context).textureMode(true)).apply {
            onCreate(null)
            // The map takes its own drags, so the page doesn't scroll from under a finger panning it.
            setOnTouchListener { v, _ -> v.parent?.requestDisallowInterceptTouchEvent(true); false }
            getMapAsync { m ->
                m.uiSettings.isRotateGesturesEnabled = false
                m.uiSettings.isTiltGesturesEnabled = false
                m.addOnMapClickListener { at ->
                    val hit = m.queryRenderedFeatures(m.projection.toScreenLocation(at), LAYER).firstOrNull()?.getStringProperty("id")
                    when {
                        hit != null && pinClick != null -> pinClick?.invoke(hit)
                        pick != null -> pick?.invoke(round(at.latitude), round(at.longitude))
                        else -> return@addOnMapClickListener false
                    }
                    true
                }
                map = m
            }
        }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> view.onStart()
                Lifecycle.Event.ON_RESUME -> view.onResume()
                Lifecycle.Event.ON_PAUSE -> view.onPause()
                Lifecycle.Event.ON_STOP -> view.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            view.onPause()
            view.onStop()
            view.onDestroy()
        }
    }
    LaunchedEffect(map, styleKey) {
        val m = map ?: return@LaunchedEffect
        style = null
        m.setStyle(styleFor(maps, styleKey)) { loaded ->
            loaded.addSource(GeoJsonSource(SOURCE))
            loaded.addLayer(
                SymbolLayer(LAYER, SOURCE).withProperties(
                    PropertyFactory.iconImage(Expression.get("icon")),
                    PropertyFactory.iconAnchor(Property.ICON_ANCHOR_BOTTOM),
                    PropertyFactory.iconAllowOverlap(true),
                    PropertyFactory.iconIgnorePlacement(true),
                ),
            )
            style = loaded
        }
    }
    // The pins, drawn as images so they need no fonts from the map's style.
    LaunchedEffect(style, pins, activeId, brand) {
        val s = style ?: return@LaunchedEffect
        val features = pins.map { pin ->
            val icon = "pin-${pin.kind}-${pin.mark}-${pin.id == activeId}"
            if (s.getImage(icon) == null) s.addImage(icon, pinBitmap(context, if (pin.kind == MapPin.Kind.Parking) PARKING_BLUE else brand, pin.mark, if (pin.id == activeId) ring else null))
            Feature.fromGeometry(Point.fromLngLat(pin.lon, pin.lat)).apply {
                addStringProperty("icon", icon)
                addStringProperty("id", pin.id)
            }
        }
        s.getSourceAs<GeoJsonSource>(SOURCE)?.setGeoJson(FeatureCollection.fromFeatures(features))
    }
    // Fitted to the pins once the map is up, and again when asked (an address just found).
    var fitted by remember { mutableStateOf<Any?>(null) }
    LaunchedEffect(map, fitKey, pins.isNotEmpty()) {
        val m = map ?: return@LaunchedEffect
        if (fitted == fitKey && fitted != null) return@LaunchedEffect
        when {
            pins.size == 1 -> m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(pins[0].lat, pins[0].lon), 16.0))
            pins.size > 1 -> {
                val bounds = LatLngBounds.Builder().apply { pins.forEach { include(LatLng(it.lat, it.lon)) } }.build()
                m.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, (48 * context.resources.displayMetrics.density).toInt()))
                if (m.cameraPosition.zoom > 17) m.moveCamera(CameraUpdateFactory.zoomTo(17.0))
            }
            else -> return@LaunchedEffect
        }
        fitted = fitKey
    }
    AndroidView({ view }, Modifier.fillMaxWidth())
}

/** The server's vector style, or its raster tiles (the map without a style, or satellite) as a style. */
internal fun styleFor(maps: ServerMetaMaps, key: String): Style.Builder = when (key) {
    "light" -> Style.Builder().fromUri(maps.style!!.url)
    "dark" -> Style.Builder().fromUri(maps.style!!.darkUrl!!)
    else -> {
        val (url, attribution) = if (key == "satellite") maps.satellite!!.tileUrl to maps.satellite!!.attribution else maps.tileUrl to maps.attribution
        val source = JsonObject(mapOf(
            "type" to JsonPrimitive("raster"), "tiles" to JsonArray(listOf(JsonPrimitive(url))), "tileSize" to JsonPrimitive(256),
            "maxzoom" to JsonPrimitive(19), "attribution" to JsonPrimitive(attribution),
        ))
        val style = JsonObject(mapOf(
            "version" to JsonPrimitive(8),
            "sources" to JsonObject(mapOf("tiles" to source)),
            "layers" to JsonArray(listOf(JsonObject(mapOf("id" to JsonPrimitive("tiles"), "type" to JsonPrimitive("raster"), "source" to JsonPrimitive("tiles"))))),
        ))
        Style.Builder().fromJson(style.toString())
    }
}

/** The web's pin: a teardrop in white outline with its mark, and a yellow ring when it's the one being placed. */
private fun pinBitmap(context: Context, fill: Int, mark: String, ring: Int?): Bitmap {
    val d = context.resources.displayMetrics.density
    val r = 14f * d
    val stroke = 2f * d
    val pad = 3f * d
    val w = (2 * (r + stroke + pad)).toInt()
    val h = (w + 10 * d).toInt()
    val bitmap = createBitmap(w, h)
    val canvas = android.graphics.Canvas(bitmap)
    val cx = w / 2f
    val cy = r + stroke + pad
    val tear = Path().apply { addCircle(cx, cy, r, Path.Direction.CW) }
    tear.op(Path().apply {
        moveTo(cx - r * 0.7f, cy + r * 0.7f)
        lineTo(cx, h - stroke)
        lineTo(cx + r * 0.7f, cy + r * 0.7f)
        close()
    }, Path.Op.UNION)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    if (ring != null) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = stroke + 2 * pad
        paint.color = ring
        canvas.drawPath(tear, paint)
    }
    paint.style = Paint.Style.FILL
    paint.color = fill
    canvas.drawPath(tear, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = stroke
    paint.color = android.graphics.Color.WHITE
    canvas.drawPath(tear, paint)
    if (mark.isNotEmpty()) {
        paint.style = Paint.Style.FILL
        paint.textSize = 13f * d
        paint.typeface = Typeface.DEFAULT_BOLD
        paint.textAlign = Paint.Align.CENTER
        canvas.drawText(mark, cx, cy - (paint.descent() + paint.ascent()) / 2, paint)
    }
    return bitmap
}

/** Six decimals (about 10 cm), as the web rounds a placed pin. */
private fun round(x: Double) = Math.round(x * 1e6) / 1e6
