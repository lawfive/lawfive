package app.lawfive.ui.screens

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.lawfive.schema.Attachment
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

// Cropping and turning a photo (FILE-8), as on the website: the whole photo with a frame to drag and
// its corners to pull, darker outside it, and a quarter turn. On a referee's first photo a faint
// circle in the frame shows what their picture will be. Saving sends the cropped photo in place of
// the old one; it can't be uncropped afterward.

/** A part of the photo, as fractions of its width and height once turned. */
private data class Frame(val x: Float = 0f, val y: Float = 0f, val w: Float = 1f, val h: Float = 1f)

private enum class Grab { Move, NW, NE, SW, SE }

private const val LEAST = 0.08f

private fun dragged(start: Frame, grab: Grab, dx: Float, dy: Float): Frame {
    if (grab == Grab.Move) return start.copy(x = (start.x + dx).coerceIn(0f, 1 - start.w), y = (start.y + dy).coerceIn(0f, 1 - start.h))
    var (x, y, w, h) = start
    if (grab == Grab.NW || grab == Grab.SW) {
        val nx = (x + dx).coerceIn(0f, x + w - LEAST); w += x - nx; x = nx
    } else {
        w = (w + dx).coerceIn(LEAST, 1 - x)
    }
    if (grab == Grab.NW || grab == Grab.NE) {
        val ny = (y + dy).coerceIn(0f, y + h - LEAST); h += y - ny; y = ny
    } else {
        h = (h + dy).coerceIn(LEAST, 1 - y)
    }
    return Frame(x, y, w, h)
}

private fun turned(bitmap: Bitmap, quarters: Int): Bitmap =
    if (quarters == 0) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(90f * quarters) }, true)

@Composable
fun CropPhoto(photo: Attachment, circle: Boolean, onClose: (changed: Boolean) -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    var original by remember { mutableStateOf<Bitmap?>(null) }
    var quarters by remember { mutableIntStateOf(0) }
    var frame by remember { mutableStateOf(Frame()) }
    var saving by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(photo.url) {
        original = runCatching { withContext(Dispatchers.IO) { graph.api.bytes(photo.url).let { BitmapFactory.decodeByteArray(it, 0, it.size) } } }.getOrNull()
        if (original == null) problem = "The photo couldn't be opened."
    }
    val shown = remember(original, quarters) { original?.let { turned(it, quarters) } }
    val unchanged = quarters == 0 && frame == Frame()

    fun save() {
        val whole = shown ?: return
        saving = true
        problem = null
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val left = (frame.x * whole.width).toInt()
                    val top = (frame.y * whole.height).toInt()
                    val cropped = Bitmap.createBitmap(whole, left, top, (frame.w * whole.width).toInt().coerceIn(1, whole.width - left), (frame.h * whole.height).toInt().coerceIn(1, whole.height - top))
                    val (full, width, height) = shrink(cropped, 2000, 85)
                    val (thumb) = shrink(cropped, 480, 80)
                    val jpeg = "image/jpeg".toMediaType()
                    val body = MultipartBody.Builder().setType(MultipartBody.FORM)
                        .addFormDataPart("width", "$width").addFormDataPart("height", "$height")
                        .addFormDataPart("file", "photo.jpg", full.toRequestBody(jpeg))
                        .addFormDataPart("thumb", "thumb.jpg", thumb.toRequestBody(jpeg))
                        .build()
                    graph.api.callRaw("PUT", "/v1/attachments/${photo.id}/file", body)
                }
                onClose(true)
            } catch (e: Exception) {
                problem = e.message ?: "The photo couldn't be saved."
                saving = false
            }
        }
    }

    app.lawfive.ui.theme.OnBoard { Dialog(onDismissRequest = { if (!saving) onClose(false) }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(colors.board).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Crop photo", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                androidx.compose.material3.IconButton({ if (!saving) onClose(false) }) { PhIcon(Ph.Close, "Close") }
            }
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0xFF0D100F)), contentAlignment = Alignment.Center) {
                val bitmap = shown
                if (bitmap == null) {
                    Text(if (problem == null) "Opening…" else "", color = Color.White)
                } else {
                    // The photo fitted to the space, and the frame over it in the same pixels.
                    val density = LocalDensity.current
                    val room = with(density) { Size(maxWidth.toPx(), maxHeight.toPx()) }
                    val scale = minOf(room.width / bitmap.width, room.height / bitmap.height)
                    val fit = Size(bitmap.width * scale, bitmap.height * scale)
                    val corner = with(density) { 28.dp.toPx() }
                    Box(Modifier.size(with(density) { fit.width.toDp() }, with(density) { fit.height.toDp() })) {
                        Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                        var grab by remember { mutableStateOf(Grab.Move) }
                        var start by remember { mutableStateOf(Frame()) }
                        var moved by remember { mutableStateOf(Offset.Zero) }
                        Canvas(
                            Modifier.fillMaxSize()
                                .semantics { contentDescription = "The part to keep: drag it, or pull its corners" }
                                .pointerInput(fit) {
                                    detectDragGestures(
                                        onDragStart = { at ->
                                            val f = frame
                                            val corners = mapOf(
                                                Grab.NW to Offset(f.x * fit.width, f.y * fit.height), Grab.NE to Offset((f.x + f.w) * fit.width, f.y * fit.height),
                                                Grab.SW to Offset(f.x * fit.width, (f.y + f.h) * fit.height), Grab.SE to Offset((f.x + f.w) * fit.width, (f.y + f.h) * fit.height),
                                            )
                                            grab = corners.entries.minByOrNull { (it.value - at).getDistance() }?.takeIf { (it.value - at).getDistance() < corner }?.key ?: Grab.Move
                                            start = f
                                            moved = Offset.Zero
                                        },
                                        onDrag = { change, amount ->
                                            change.consume()
                                            moved += amount
                                            frame = dragged(start, grab, moved.x / fit.width, moved.y / fit.height)
                                        },
                                    )
                                },
                        ) {
                            val l = frame.x * size.width
                            val t = frame.y * size.height
                            val r = (frame.x + frame.w) * size.width
                            val b = (frame.y + frame.h) * size.height
                            val shade = Color(0x8C000000)
                            drawRect(shade, Offset.Zero, Size(size.width, t))
                            drawRect(shade, Offset(0f, b), Size(size.width, size.height - b))
                            drawRect(shade, Offset(0f, t), Size(l, b - t))
                            drawRect(shade, Offset(r, t), Size(size.width - r, b - t))
                            drawRect(Color.White, Offset(l, t), Size(r - l, b - t), style = Stroke(2.dp.toPx()))
                            val arm = 18.dp.toPx()
                            val thick = 4.dp.toPx()
                            for ((cx, cy, sx, sy) in listOf(listOf(l, t, 1f, 1f), listOf(r, t, -1f, 1f), listOf(l, b, 1f, -1f), listOf(r, b, -1f, -1f))) {
                                drawLine(Color.White, Offset(cx, cy), Offset(cx + sx * arm, cy), thick)
                                drawLine(Color.White, Offset(cx, cy), Offset(cx, cy + sy * arm), thick)
                            }
                            if (circle) {
                                // Their picture: the middle of the photo, round; white dashes on a soft dark edge.
                                val radius = minOf(r - l, b - t) / 2
                                val middle = Offset((l + r) / 2, (t + b) / 2)
                                drawCircle(Color(0x4D000000), radius, middle, style = Stroke(3.dp.toPx()))
                                drawCircle(Color(0xE6FFFFFF), radius, middle, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))))
                            }
                        }
                    }
                }
            }
            if (circle) Text("The circle is their picture: the middle of the photo, round.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
            problem?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.redText) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                SecondaryButton("Turn", {
                    // The frame turns with the photo.
                    frame = Frame(1 - frame.y - frame.h, frame.x, frame.h, frame.w)
                    quarters = (quarters + 1) % 4
                }, icon = Ph.Turn, enabled = shown != null && !saving)
                SecondaryButton("Reset", { frame = Frame(); quarters = 0 }, enabled = !unchanged && !saving)
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                PrimaryButton(if (saving) "Saving…" else "Save", { save() }, enabled = !unchanged && !saving && shown != null)
            }
        }
    } }
}
