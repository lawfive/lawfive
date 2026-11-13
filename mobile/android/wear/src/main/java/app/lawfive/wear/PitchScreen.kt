package app.lawfive.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** How long each corner's position is averaged over, as on Garmin. */
private const val AVERAGE_MS = 5000L
/** Fixes within this are used (Garmin's "usable"); within GOOD_M it says good. */
private const val USABLE_M = 25f
private const val GOOD_M = 10f

/**
 * TRK-13: walk to each corner and tap; a few seconds of GPS there are averaged into it. Two to four
 * corners, in any order: after the second, leaving saves them, and the fourth saves them straight away.
 * They go to LawFive at the next sync (SYNC-12), as on Garmin (Pitch.mc).
 */
@Composable
fun PitchPage(matchId: String?, created: Long?, pop: () -> Unit) {
    val context = LocalContext.current
    val corners = remember { mutableStateListOf<DoubleArray>() }
    var accuracy by remember { mutableStateOf<Float?>(null) }
    var sampling by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }
    val sum = remember { doubleArrayOf(0.0, 0.0) }
    var count by remember { mutableStateOf(0) }
    var allowed by remember { mutableStateOf(context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it }

    fun save() {
        if (saved) return
        saved = true
        AppState.queuePitch(matchId, created, corners.toList())
    }

    LaunchedEffect(Unit) { if (!allowed) ask.launch(Manifest.permission.ACCESS_FINE_LOCATION) }
    DisposableEffect(allowed) {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val listener = LocationListener { fix: Location ->
            accuracy = fix.accuracy
            if (sampling && fix.accuracy <= USABLE_M) {
                sum[0] += fix.latitude
                sum[1] += fix.longitude
                count += 1
            }
        }
        if (allowed) runCatching { manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, listener, Looper.getMainLooper()) }
        onDispose {
            manager.removeUpdates(listener)
            // However it's left, by Back or a swipe, two or more corners are kept.
            save()
        }
    }
    LaunchedEffect(sampling) {
        if (!sampling) return@LaunchedEffect
        delay(AVERAGE_MS)
        sampling = false
        if (count == 0) {
            message = "No GPS fix: try again"
        } else {
            corners.add(doubleArrayOf(sum[0] / count, sum[1] / count))
            Haptics.tick(context)
            if (corners.size >= 4) {
                save()
                pop()
            }
        }
    }
    BackHandler { save(); pop() }

    fun mark() {
        if (sampling || corners.size >= 4) return
        if (!allowed) { ask.launch(Manifest.permission.ACCESS_FINE_LOCATION); return }
        if ((accuracy ?: Float.MAX_VALUE) > USABLE_M) { message = "Waiting for GPS"; return }
        sum[0] = 0.0; sum[1] = 0.0; count = 0
        message = null
        sampling = true
    }

    val done = corners.size
    Face(Modifier.clickable(remember { MutableInteractionSource() }, null) { mark() }) {
        At(0.21f) { T(if (done >= 4) "Pitch marked" else "Corner ${done + 1}", fraction(0.07f)) }
        At(0.42f) {
            // A small pitch with its corners: the marked ones filled in green.
            Canvas(Modifier.size(maxWidth * 0.36f, maxWidth * 0.36f * 0.62f)) {
                val line = Stroke(2.dp.toPx())
                drawRect(C.dim, style = line)
                drawLine(C.dim, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), 2.dp.toPx())
                val spots = listOf(Offset(0f, 0f), Offset(size.width, 0f), Offset(size.width, size.height), Offset(0f, size.height))
                spots.forEachIndexed { i, spot ->
                    if (i < done) drawCircle(C.start, 7.dp.toPx(), spot)
                    else drawCircle(if (i == done && sampling) Color.White else C.rule, 5.dp.toPx(), spot)
                }
            }
        }
        At(0.62f) { T(message ?: if (!allowed) "Allow location to mark corners" else if (sampling) "Hold still…" else "Stand on a corner, then tap", fraction(0.045f), lines = 2) }
        val a = accuracy
        At(0.71f) {
            T(
                if (a == null) "Finding GPS…" else if (a <= GOOD_M) "GPS good" else if (a <= USABLE_M) "GPS usable" else "GPS poor",
                fraction(0.045f), if (a != null && a <= GOOD_M) C.start else if (a != null && a <= USABLE_M) C.yellow else C.dim,
            )
        }
        At(0.81f) { T(if (done >= 2) "Back saves $done corners" else "Back to leave", fraction(0.045f), C.dim) }
    }
}
