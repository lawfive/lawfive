package app.lawfive.ui.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.AppGraph
import app.lawfive.data.ApiException
import app.lawfive.data.json
import app.lawfive.schema.Attachment
import app.lawfive.schema.Referee
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.initials
import app.lawfive.ui.theme.colors
import coil3.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException

// Photos on matches, venues and referees (APP-5, FILE-1 to FILE-5): from the camera or the
// gallery, made smaller on the phone (2000 px, a 480 px thumbnail, as a JPEG with nothing but the
// picture in it), with captions; a referee's first photo is their picture. Photos need signal.

/** Each referee's picture (their first photo), fetched when signal allows and kept for the session. */
val refereePictures = MutableStateFlow<Map<String, Attachment>>(emptyMap())

suspend fun loadRefereePictures(graph: AppGraph) {
    try {
        val answer = graph.api.call("GET", "/v1/attachments?recordType=referee&first=true")?.jsonObject ?: return
        refereePictures.value = json.decodeFromJsonElement(ListSerializer(Attachment.serializer()), answer["attachments"]!!).associateBy { it.recordId }
    } catch (_: Exception) {
        // Offline, or a server without photos: initials it is.
    }
}

@Composable
fun rememberRefereePictures(): Map<String, Attachment> {
    val graph = LocalGraph.current
    LaunchedEffect(Unit) { loadRefereePictures(graph) }
    val pictures by refereePictures.collectAsStateWithLifecycle()
    return pictures
}

/** A referee's picture, or their initials; round, or with `tile` a square board tile (WEB-28, on the Working together slab). */
@Composable
fun RefereeAvatar(r: Referee, picture: Attachment?, size: androidx.compose.ui.unit.Dp = 38.dp, tile: Boolean = false) {
    val graph = LocalGraph.current
    val shape = if (tile) RoundedCornerShape(4.dp) else CircleShape
    if (picture == null && tile) {
        Box(Modifier.size(size).clip(shape).background(colors.kitBlank), contentAlignment = Alignment.Center) {
            Text(initials(r.name).uppercase(), style = app.lawfive.ui.theme.LfType.word((size.value * 0.36f).sp, colors.onBoardStrong), maxLines = 1)
        }
    } else if (picture == null) {
        Avatar(text = initials(r.name), size = size)
    } else {
        AsyncImage("${graph.api.base()}${picture.thumbUrl}", null, Modifier.size(size).clip(shape), contentScale = ContentScale.Crop)
    }
}

/** A JPEG of the photo at most `edge` pixels on its longest side, turned as the camera held it. */
internal fun shrink(original: Bitmap, edge: Int, quality: Int): Triple<ByteArray, Int, Int> {
    val scale = minOf(1f, edge.toFloat() / maxOf(original.width, original.height))
    val bitmap = if (scale < 1f) Bitmap.createScaledBitmap(original, (original.width * scale).toInt(), (original.height * scale).toInt(), true) else original
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
    return Triple(out.toByteArray(), bitmap.width, bitmap.height)
}

private fun readPhoto(context: Context, uri: Uri): Bitmap {
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, bounds) }
    // Decoded near 2000 px rather than the camera's full size, which a phone may not have memory for.
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2000) sample *= 2
    val bitmap = resolver.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: throw IOException("That photo couldn't be read")
    val rotation = resolver.openInputStream(uri)!!.use {
        when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    }
    return if (rotation == 0f) bitmap else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(rotation) }, true)
}

suspend fun uploadPhoto(graph: AppGraph, context: Context, recordType: String, recordId: String, uri: Uri, room: Long? = null) = withContext(Dispatchers.IO) {
    val photo = readPhoto(context, uri)
    val (full, width, height) = shrink(photo, 2000, 85)
    if (room != null && full.size > room) throw app.lawfive.data.NoRoomForPhoto()
    val (thumb) = shrink(photo, 480, 80)
    val jpeg = "image/jpeg".toMediaType()
    val body = MultipartBody.Builder().setType(MultipartBody.FORM)
        .addFormDataPart("recordType", recordType)
        .addFormDataPart("recordId", recordId)
        .addFormDataPart("width", "$width")
        .addFormDataPart("height", "$height")
        .addFormDataPart("file", "photo.jpg", full.toRequestBody(jpeg))
        .addFormDataPart("thumb", "thumb.jpg", thumb.toRequestBody(jpeg))
        .build()
    graph.api.callRaw("POST", "/v1/attachments", body)
}

/** The photos card: thumbnails ending in Add photos (camera or gallery); a tap opens one large. */
@Composable
fun PhotosSection(recordType: String, recordId: String) {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var photos by remember { mutableStateOf<List<Attachment>?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    var uploading by remember { mutableIntStateOf(0) }
    var open by remember { mutableStateOf<Int?>(null) }
    var cameraFile by remember { mutableStateOf<Uri?>(null) }
    var storage by remember { mutableStateOf<app.lawfive.data.AccountStorage?>(null) }
    var admin by remember { mutableStateOf(false) }
    // FILE-7: how many didn't fit, once they've been tried; null when there's nothing to say.
    var noRoom by remember { mutableStateOf<Int?>(null) }

    suspend fun loadStorage() {
        storage = runCatching { app.lawfive.data.AccountStorage.from(graph.api.call("GET", "/v1/account/storage")) }.getOrNull() ?: storage
        if (storage?.limitBytes != null) admin = runCatching { graph.api.call("GET", "/v1/account")?.jsonObject?.get("admin")?.toString() == "true" }.getOrDefault(admin)
    }

    suspend fun reload() {
        try {
            val answer = graph.api.call("GET", "/v1/attachments?recordType=$recordType&recordId=$recordId")!!.jsonObject
            photos = json.decodeFromJsonElement(ListSerializer(Attachment.serializer()), answer["attachments"]!!)
            problem = null
        } catch (e: ApiException) {
            problem = if (e.status == 404) "Photos are switched off on this server." else e.message
        } catch (e: IOException) {
            problem = "Photos show when there's signal."
        }
        if (recordType == "referee") loadRefereePictures(graph)
        loadStorage()
    }
    LaunchedEffect(recordId) { reload() }

    fun add(uris: List<Uri>) {
        if (uris.isEmpty()) return
        noRoom = null
        if (storage?.full == true) {
            noRoom = uris.size
            return
        }
        scope.launch {
            uploading += uris.size
            var refused = 0
            // Once one hasn't fitted, only those small enough for what's left are sent.
            var room: Long? = null
            for (uri in uris) {
                try {
                    uploadPhoto(graph, context, recordType, recordId, uri, room)
                    room = null
                } catch (_: app.lawfive.data.NoRoomForPhoto) {
                    refused++
                } catch (e: Exception) {
                    val sizes = (e as? ApiException)?.body?.get("storage")?.let { app.lawfive.data.AccountStorage.from(it) }
                    if (sizes != null) {
                        refused++
                        room = sizes.room
                    } else {
                        problem = if (e is IOException && e !is ApiException) "No connection: the photo wasn't added." else e.message
                    }
                }
                uploading--
            }
            reload()
            if (refused > 0) noRoom = refused
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { add(it) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraFile?.let { add(listOf(it)) } }

    fun takePhoto() {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        cameraFile = uri
        camera.launch(uri)
    }

    SectionTitle("Photos")
    LfCard {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            storage?.takeIf { it.nearlyFull }?.let {
                Text(app.lawfive.data.storageUsedLine(it), style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
            val list = photos ?: emptyList()
            // FILE-1, as the web's: square photos, then a dashed Add photos tile (or uploading ones, faded).
            val tiles: List<Attachment?> = list + List(uploading) { null } + listOf(null)
            tiles.chunked(3).forEachIndexed { row, three ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    three.forEachIndexed { i, a ->
                        val index = row * 3 + i
                        val tile = Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(9.dp))
                        when {
                            a != null -> Box(tile.border(1.dp, colors.border, RoundedCornerShape(9.dp)).clickable { open = index }) {
                                AsyncImage("${graph.api.base()}${a.thumbUrl}", a.caption, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                if (recordType == "referee" && index == 0) Box(Modifier.align(Alignment.BottomStart).padding(6.dp)) { Chip("Picture") }
                            }
                            index < tiles.size - 1 -> Box(tile.background(colors.surface2), contentAlignment = Alignment.Center) {
                                Text("Uploading…", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                            }
                            storage?.full == true -> StorageFullTile(tile) { noRoom = 0 }
                            else -> AddPhotosTile(tile, onCamera = { takePhoto() }, onPick = { pick.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) })
                        }
                    }
                    repeat(3 - three.size) { Box(Modifier.weight(1f)) }
                }
            }
            if (problem != null) Text(problem!!, style = MaterialTheme.typography.bodySmall, color = if (photos == null) colors.muted else colors.redText)
            val fit = noRoom
            val sizes = storage
            if (fit != null && sizes?.limitBytes != null) {
                NoRoomNotice(fit, sizes, admin, onDismiss = { noRoom = null })
            }
        }
    }
    val list = photos
    if (open != null && list != null && open!! < list.size) {
        PhotoViewer(list, open!!, recordType, onIndex = { open = it }, onClose = { open = null }, onChanged = { scope.launch { reload() } })
    }
}

/** FILE-7: says what's used and what to do about it, in place of the tile that can't hold a sentence. */
@Composable
private fun NoRoomNotice(noRoom: Int, storage: app.lawfive.data.AccountStorage, admin: Boolean, onDismiss: () -> Unit) {
    val graph = LocalGraph.current
    val context = LocalContext.current
    Row(Modifier.fillMaxWidth().background(colors.amberSoft, RoundedCornerShape(10.dp)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PhIcon(Ph.Info, size = 18.dp, tint = colors.amberText)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(app.lawfive.data.noRoomTitle(noRoom), style = MaterialTheme.typography.titleSmall, color = colors.text)
            Text(app.lawfive.data.noRoomText(storage, admin), style = MaterialTheme.typography.bodySmall, color = colors.text)
            if (admin) {
                Text(
                    "Change the limit", style = MaterialTheme.typography.labelLarge, color = colors.brandStrong,
                    modifier = Modifier.clickable { openWebsite(context, graph.session.current.server, "/settings/server/plans") },
                )
            }
        }
        Box(Modifier.clickable(onClick = onDismiss)) { PhIcon(Ph.Close, "Dismiss", size = 18.dp, tint = colors.muted) }
    }
}

/** FILE-7: in place of Add photos when there's no room at all; a tap says why. */
@Composable
private fun StorageFullTile(modifier: Modifier, onClick: () -> Unit) {
    val dash = colors.muted.copy(alpha = 0.55f)
    Box(
        modifier.background(colors.surface2)
            .drawBehind {
                drawRoundRect(
                    dash, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
                    cornerRadius = CornerRadius(9.dp.toPx()),
                )
            }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PhIcon(Ph.Info, size = 24.dp, tint = colors.muted)
            Text("Storage full", style = MaterialTheme.typography.labelLarge, color = colors.muted)
        }
    }
}

/** The dashed Add photos tile (as the web's), offering the camera or the phone's photos. */
@Composable
private fun AddPhotosTile(modifier: Modifier, onCamera: () -> Unit, onPick: () -> Unit) {
    var choosing by remember { mutableStateOf(false) }
    val dash = colors.muted.copy(alpha = 0.55f)
    Box(
        modifier.background(colors.surface2)
            .drawBehind {
                drawRoundRect(
                    dash, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
                    cornerRadius = CornerRadius(9.dp.toPx()),
                )
            }
            .clickable { choosing = true },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            PhIcon(Ph.Camera, size = 24.dp, tint = colors.muted)
            Text("Add photos", style = MaterialTheme.typography.labelLarge, color = colors.muted)
        }
        app.lawfive.ui.theme.OnPanel {
            DropdownMenu(choosing, { choosing = false }, containerColor = colors.surface) {
                DropdownMenuItem({ Text("Take a photo") }, { choosing = false; onCamera() }, leadingIcon = { PhIcon(Ph.Camera, size = 18.dp, tint = colors.text) })
                DropdownMenuItem({ Text("From the phone") }, { choosing = false; onPick() }, leadingIcon = { PhIcon(Ph.Photos, size = 18.dp, tint = colors.text) })
            }
        }
    }
}

@Composable
private fun PhotoViewer(photos: List<Attachment>, index: Int, recordType: String, onIndex: (Int) -> Unit, onClose: () -> Unit, onChanged: () -> Unit) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val photo = photos[index]
    var caption by remember(photo.id) { mutableStateOf(photo.caption ?: "") }
    var deleting by remember { mutableStateOf(false) }
    // FILE-8: cropping it, with their picture's circle on a referee's first photo.
    var cropping by remember { mutableStateOf(false) }
    fun change(body: JsonObject, then: () -> Unit = {}) {
        scope.launch {
            try {
                graph.api.call("PUT", "/v1/attachments/${photo.id}", body)
                onChanged()
                then()
            } catch (_: Exception) {
                // Left as it was; the next look shows what the server has.
            }
        }
    }
    fun saveCaption() {
        if (caption.trim() != (photo.caption ?: "")) change(JsonObject(mapOf("caption" to (caption.trim().ifEmpty { null }?.let { JsonPrimitive(it) } ?: JsonNull))))
    }
    // The photo on the board's near-black stage, as the website's viewer.
    app.lawfive.ui.theme.OnBoard { Dialog(onDismissRequest = { saveCaption(); onClose() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(colors.board).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Photo ${index + 1} of ${photos.size}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                androidx.compose.material3.IconButton({ saveCaption(); onClose() }) { PhIcon(Ph.Close, "Close") }
            }
            Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(androidx.compose.ui.graphics.Color(0xFF0D100F)), contentAlignment = Alignment.Center) {
                AsyncImage("${graph.api.base()}${photo.url}", photo.caption, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                if (photos.size > 1) {
                    Row(Modifier.fillMaxWidth().padding(8.dp).align(Alignment.Center), horizontalArrangement = Arrangement.SpaceBetween) {
                        StepButton(Ph.Back, "Previous photo") { saveCaption(); onIndex((index - 1 + photos.size) % photos.size) }
                        StepButton(Ph.Next, "Next photo") { saveCaption(); onIndex((index + 1) % photos.size) }
                    }
                }
            }
            Field("Caption", caption, { caption = it }, placeholder = "Add a caption")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (index > 0) {
                    SecondaryButton(if (recordType == "referee") "Make their picture" else "Move to first", {
                        change(JsonObject(mapOf("position" to JsonPrimitive(0)))) { onIndex(0) }
                    }, icon = if (recordType == "referee") Ph.Portrait else Ph.Photos)
                }
                SecondaryButton("Crop", { cropping = true }, icon = Ph.Crop)
                androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                SecondaryButton("Delete", { deleting = true }, icon = Ph.Trash, danger = true)
            }
        }
    } }
    if (cropping) {
        CropPhoto(photo, circle = recordType == "referee" && index == 0) { changed ->
            cropping = false
            if (changed) onChanged()
        }
    }
    if (deleting) {
        Confirm("Delete this photo?", "It can't be got back.", "Delete", onConfirm = {
            deleting = false
            scope.launch {
                try {
                    graph.api.call("DELETE", "/v1/attachments/${photo.id}")
                } catch (_: Exception) {
                }
                onChanged()
                if (photos.size == 1) onClose() else onIndex(minOf(index, photos.size - 2))
            }
        }, onDismiss = { deleting = false })
    }
}

@Composable
private fun StepButton(icon: Ph, description: String, onClick: () -> Unit) {
    Box(Modifier.size(42.dp).clip(CircleShape).background(androidx.compose.ui.graphics.Color(0x73000000)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        PhIcon(icon, description, tint = androidx.compose.ui.graphics.Color.White)
    }
}
