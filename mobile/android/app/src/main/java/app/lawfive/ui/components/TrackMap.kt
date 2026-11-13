package app.lawfive.ui.components

import android.graphics.PointF
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.lawfive.schema.ServerMetaMaps
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.theme.colors
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/** A handle to drag on the map (TRK-14). */
data class MapHandle(val id: String, val lat: Double, val lon: Double, val main: Boolean = false)

private fun lines(all: List<List<Pair<Double, Double>>>) = FeatureCollection.fromFeatures(
    all.filter { it.size > 1 }.map { line -> Feature.fromGeometry(LineString.fromLngLats(line.map { Point.fromLngLat(it.second, it.first) })) },
)

private fun stretchLines(stretches: List<app.lawfive.data.SpeedStretch>, bandColors: List<String>) = FeatureCollection.fromFeatures(
    stretches.filter { it.points.size > 1 }.map { s ->
        Feature.fromGeometry(LineString.fromLngLats(s.points.map { Point.fromLngLat(it.second, it.first) })).apply { addStringProperty("color", bandColors[s.band]) }
    },
)

/** A match's track on the map: the route, the pitch, the last minute and the marker while it replays, and the pitch's handles while it's adjusted. */
@Composable
fun TrackMap(
    routes: List<List<Pair<Double, Double>>>,
    pitch: List<List<Pair<Double, Double>>>,
    trail: List<Pair<Double, Double>>,
    marker: Pair<Double, Double>?,
    modifier: Modifier = Modifier,
    /** The route in its speed bands (TRK-5), over the plain route; faint during a replay, as `trail` is in the same colors. */
    speed: List<app.lawfive.data.SpeedStretch> = emptyList(),
    speedTrail: List<app.lawfive.data.SpeedStretch> = emptyList(),
    height: Dp = 300.dp,
    pitchColor: Color = colors.text,
    handles: List<MapHandle> = emptyList(),
    onHandle: (String, Double, Double) -> Unit = { _, _, _ -> },
) { app.lawfive.ui.theme.OnPanel {
    val graph = LocalGraph.current
    val maps by produceState<ServerMetaMaps?>(null) { value = graph.meta()?.maps }
    val dark = colors.dark
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(6.dp)).background(colors.surface2).border(1.dp, colors.border, RoundedCornerShape(6.dp))) {
        // Offline or still asking, or in a preview or the snapshot tests (LocalInspectionMode), which can't draw MapLibre: the placeholder pitch.
        val m = maps?.takeIf { !androidx.compose.ui.platform.LocalInspectionMode.current }
        if (m == null) {
            LoadingPitch(Modifier.align(Alignment.Center))
        } else {
            val styleKey = if (m.style != null) (if (dark && m.style?.darkUrl != null) "dark" else "light") else "raster"
            TrackMapView(m, styleKey, routes, pitch, trail, marker, pitchColor, handles, onHandle, speed, speedTrail)
        }
    }
}
}

@Composable
private fun TrackMapView(
    maps: ServerMetaMaps,
    styleKey: String,
    routes: List<List<Pair<Double, Double>>>,
    pitch: List<List<Pair<Double, Double>>>,
    trail: List<Pair<Double, Double>>,
    marker: Pair<Double, Double>?,
    pitchColor: Color,
    handles: List<MapHandle>,
    onHandle: (String, Double, Double) -> Unit,
    speed: List<app.lawfive.data.SpeedStretch>,
    speedTrail: List<app.lawfive.data.SpeedStretch>,
) {
    val bandColors = colors.speed.map { String.format("#%06X", it.toArgb() and 0xFFFFFF) }
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val brand = colors.brand.toArgb()
    val outline = pitchColor.toArgb()
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var style by remember { mutableStateOf<Style?>(null) }
    // Bumped as the map moves, to keep the handles on their places.
    var moved by remember { mutableIntStateOf(0) }
    val view = remember {
        MapLibre.getInstance(context)
        MapView(context, MapLibreMapOptions.createFromAttributes(context).textureMode(true)).apply {
            onCreate(null)
            setOnTouchListener { v, _ -> v.parent?.requestDisallowInterceptTouchEvent(true); false }
            getMapAsync { m ->
                m.uiSettings.isRotateGesturesEnabled = false
                m.uiSettings.isTiltGesturesEnabled = false
                m.addOnCameraMoveListener { moved++ }
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
            loaded.addSource(GeoJsonSource("route"))
            loaded.addSource(GeoJsonSource("pitch"))
            loaded.addSource(GeoJsonSource("trail"))
            loaded.addSource(GeoJsonSource("marker"))
            loaded.addLayer(LineLayer("pitch-line", "pitch").withProperties(PropertyFactory.lineColor(outline), PropertyFactory.lineWidth(1.5f), PropertyFactory.lineOpacity(0.8f)))
            loaded.addLayer(LineLayer("route-line", "route").withProperties(PropertyFactory.lineColor(brand), PropertyFactory.lineWidth(2f), PropertyFactory.lineOpacity(0.45f)))
            loaded.addSource(GeoJsonSource("speed"))
            loaded.addSource(GeoJsonSource("speed-trail"))
            loaded.addLayer(LineLayer("speed-line", "speed").withProperties(PropertyFactory.lineColor(org.maplibre.android.style.expressions.Expression.get("color")), PropertyFactory.lineWidth(2.5f)))
            loaded.addLayer(LineLayer("trail-line", "trail").withProperties(PropertyFactory.lineColor(brand), PropertyFactory.lineWidth(4f)))
            loaded.addLayer(LineLayer("speed-trail-line", "speed-trail").withProperties(PropertyFactory.lineColor(org.maplibre.android.style.expressions.Expression.get("color")), PropertyFactory.lineWidth(4f)))
            loaded.addLayer(
                CircleLayer("marker-dot", "marker").withProperties(
                    PropertyFactory.circleColor(brand), PropertyFactory.circleRadius(7f),
                    PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE), PropertyFactory.circleStrokeWidth(2f),
                ),
            )
            style = loaded
        }
    }
    LaunchedEffect(style, routes) { style?.getSourceAs<GeoJsonSource>("route")?.setGeoJson(lines(routes)) }
    LaunchedEffect(style, pitch) { style?.getSourceAs<GeoJsonSource>("pitch")?.setGeoJson(lines(pitch)) }
    LaunchedEffect(style, trail) { style?.getSourceAs<GeoJsonSource>("trail")?.setGeoJson(lines(listOf(trail))) }
    LaunchedEffect(style, speed, bandColors) { style?.getSourceAs<GeoJsonSource>("speed")?.setGeoJson(stretchLines(speed, bandColors)) }
    LaunchedEffect(style, speedTrail, bandColors) { style?.getSourceAs<GeoJsonSource>("speed-trail")?.setGeoJson(stretchLines(speedTrail, bandColors)) }
    // The full track goes faint under a replay's trail (TRK-10).
    val replaying = marker != null
    LaunchedEffect(style, replaying) { style?.getLayerAs<LineLayer>("speed-line")?.setProperties(PropertyFactory.lineOpacity(if (replaying) 0.3f else 1f)) }
    LaunchedEffect(style, marker) {
        style?.getSourceAs<GeoJsonSource>("marker")?.setGeoJson(
            FeatureCollection.fromFeatures(listOfNotNull(marker?.let { Feature.fromGeometry(Point.fromLngLat(it.second, it.first)) })),
        )
    }
    // Fitted to the route and the pitch once, when the map is up.
    var fitted by remember { mutableStateOf(false) }
    LaunchedEffect(map, routes, pitch) {
        val m = map ?: return@LaunchedEffect
        val points = (routes + pitch).flatten()
        if (fitted || points.size < 2) return@LaunchedEffect
        val bounds = LatLngBounds.Builder().apply { points.forEach { include(LatLng(it.first, it.second)) } }.build()
        m.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, (28 * context.resources.displayMetrics.density).toInt()))
        fitted = true
        moved++
    }
    Box(Modifier.fillMaxSize()) {
        AndroidView({ view }, Modifier.fillMaxSize())
        val m = map
        if (m != null) {
            val latest by rememberUpdatedState(onHandle)
            val size = with(LocalDensity.current) { 34.dp.toPx() }
            handles.forEach { h ->
                moved // Read, so they follow the map.
                val at = m.projection.toScreenLocation(LatLng(h.lat, h.lon))
                val id = rememberUpdatedState(h.id)
                val current = rememberUpdatedState(Offset(at.x, at.y))
                Box(
                    Modifier.offset { IntOffset((at.x - size / 2).toInt(), (at.y - size / 2).toInt()) }.size(34.dp)
                        .clip(CircleShape).background(if (h.main) colors.brand else Color.White).border(3.dp, if (h.main) Color.White else colors.brand, CircleShape)
                        .pointerInput(h.id) {
                            detectDragGestures { change, drag ->
                                change.consume()
                                val next = current.value + drag
                                val ll = m.projection.fromScreenLocation(PointF(next.x, next.y))
                                latest(id.value, ll.latitude, ll.longitude)
                            }
                        },
                )
            }
        }
    }
}
