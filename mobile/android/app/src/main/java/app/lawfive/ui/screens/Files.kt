package app.lawfive.ui.screens

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.AppGraph
import app.lawfive.data.AccountStorage
import app.lawfive.data.ApiException
import app.lawfive.data.FileKind
import app.lawfive.data.MAX_FILE_BYTES
import app.lawfive.data.NoRoomForFile
import app.lawfive.data.PREVIEW_LINES
import app.lawfive.data.Refused
import app.lawfive.data.TextPreview
import app.lawfive.data.describeFile
import app.lawfive.data.fileKind
import app.lawfive.data.fileMimeTypes
import app.lawfive.data.fileName
import app.lawfive.data.json
import app.lawfive.data.keepsEnding
import app.lawfive.data.opensInApp
import app.lawfive.data.refusedTitle
import app.lawfive.data.splitName
import app.lawfive.data.takenLine
import app.lawfive.data.textPreview
import app.lawfive.data.tooBig
import app.lawfive.data.withoutTaken
import app.lawfive.schema.Attachment
import app.lawfive.schema.Competition
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.Field
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.Mono
import app.lawfive.ui.theme.colors
import coil3.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Files on a match, venue or competition (FILE-6 to FILE-13), as the website's Files card: a list
// under Photos (a competition's only attachments), each file with its icon or thumbnail, name, kind
// and size, Share, and in its menu Open with, Keep on this phone, Rename and Delete. Add files takes
// several from the phone's files, or a photo from the camera, each uploading at once, faded until
// it's in, with a thumbnail made here for a photo or a PDF's first page. A tap opens it: a PDF page
// by page, a photo large, CSV and text as text, others in another app. A match also shows its
// competition's files, read-only. What couldn't be added is said once, under the list (FILE-7).

private val kindIcons = mapOf(
    FileKind.PDF to Ph.Pdf, FileKind.XLSX to Ph.Xlsx, FileKind.CSV to Ph.Csv, FileKind.DOCX to Ph.Docx, FileKind.TXT to Ph.Txt, FileKind.PHOTO to Ph.FileImage,
)

/** What the last try couldn't add (FILE-7). */
private class Trouble(val retry: List<Uri>, val noRoom: Int, val refused: List<Refused>)

/** A file picked from the phone, as it's sent: its name, type and bytes. */
private class PickedFile(val name: String, val type: String, val bytes: ByteArray)

/** The Files card. On a match, `competition` adds the competition's files under the match's own, read-only. */
@Composable
fun FilesSection(recordType: String, recordId: String, competition: Competition? = null) {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val kept by graph.keptFiles.state.collectAsStateWithLifecycle()
    // FILE-6: offered where the server takes files (it says so); a server from before them takes only photos.
    val offered by produceState<Boolean?>(null) { value = graph.meta()?.capabilities?.contains("files") }
    var files by remember(recordId) { mutableStateOf(graph.keptFiles.listOf(recordType, recordId)) }
    var theirs by remember(competition?.id) { mutableStateOf(competition?.let { graph.keptFiles.listOf("competition", it.id) }) }
    var problem by remember { mutableStateOf<String?>(null) }
    val pending = remember { mutableStateListOf<String>() }
    var trouble by remember { mutableStateOf<Trouble?>(null) }
    var storage by remember { mutableStateOf<AccountStorage?>(null) }
    var admin by remember { mutableStateOf(false) }
    var cameraFile by remember { mutableStateOf<Uri?>(null) }
    var viewing by remember { mutableStateOf<Pair<Attachment, File>?>(null) }
    // A row's own line for a moment: "Opening…", or why it didn't open.
    val notes = remember { mutableStateMapOf<String, String>() }

    suspend fun reload() {
        try {
            val list = graph.keptFiles.fetchList(recordType, recordId)
            files = list
            graph.keptFiles.remember(recordType, recordId, list)
            problem = null
        } catch (e: ApiException) {
            problem = if (e.status == 404) "Files are switched off on this server." else e.message
        } catch (_: IOException) {
            problem = if (files == null) "Files show when there's signal." else null
        }
        competition?.let { c ->
            runCatching { graph.keptFiles.fetchList("competition", c.id) }.getOrNull()?.let {
                theirs = it
                graph.keptFiles.remember("competition", c.id, it)
            }
        }
        storage = runCatching { AccountStorage.from(graph.api.call("GET", "/v1/account/storage")) }.getOrNull() ?: storage
        if (storage?.limitBytes != null) admin = runCatching { graph.api.call("GET", "/v1/account")?.jsonObject?.get("admin")?.toString() == "true" }.getOrDefault(admin)
    }
    LaunchedEffect(recordId, competition?.id, offered) { if (offered != false) reload() }
    if (offered == false) return

    fun add(uris: List<Uri>, camera: Boolean = false) {
        if (uris.isEmpty()) return
        trouble = null
        if (storage?.full == true) {
            trouble = Trouble(uris, uris.size, emptyList())
            return
        }
        scope.launch {
            val names = uris.map { if (camera) photoName() else displayName(context, it) }
            pending.addAll(names)
            val retry = mutableListOf<Uri>()
            val refused = mutableListOf<Refused>()
            var noRoom = 0
            // One at a time, in the order chosen, so they keep that order. Once one hasn't fitted, only
            // those small enough for what's left are sent.
            var room: Long? = null
            uris.forEachIndexed { i, uri ->
                try {
                    uploadFile(graph, context, recordType, recordId, uri, names[i], camera, room)
                    room = null
                } catch (_: NoRoomForFile) {
                    retry += uri
                    noRoom++
                } catch (e: ApiException) {
                    val sizes = e.body?.get("storage")?.let { AccountStorage.from(it) }
                    if (sizes != null) {
                        room = sizes.room
                        retry += uri
                        noRoom++
                    } else {
                        refused += Refused(names[i], e.message ?: "The server refused it.")
                    }
                } catch (e: TooBig) {
                    refused += Refused(names[i], e.message!!)
                } catch (_: IOException) {
                    retry += uri
                    refused += Refused(names[i], "There's no connection: try again with signal.")
                }
                pending.remove(names[i])
            }
            reload()
            trouble = if (noRoom > 0 || refused.isNotEmpty()) Trouble(retry, noRoom, refused) else null
        }
    }
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { add(it) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) cameraFile?.let { add(listOf(it), camera = true) } }

    fun open(a: Attachment) {
        val online = notes[a.id]
        if (online == "Opening…") return
        notes[a.id] = "Opening…"
        scope.launch {
            try {
                val local = graph.keptFiles.fileFor(a)
                notes.remove(a.id)
                if (opensInApp(a)) viewing = a to local else openWith(context, local, a)?.let { notes[a.id] = it }
            } catch (e: ApiException) {
                notes[a.id] = if (e.status == 404) "It's gone: it was deleted." else "It didn't open: ${e.message}"
                if (e.status == 404) reload()
            } catch (_: IOException) {
                // FILE-13: only what's kept opens without signal.
                notes[a.id] = "Opens when there's signal."
            }
        }
    }

    fun share(a: Attachment) {
        scope.launch {
            try {
                shareFile(context, graph.keptFiles.fileFor(a), a)
            } catch (_: IOException) {
                notes[a.id] = "Shares when there's signal."
            }
        }
    }

    fun keep(a: Attachment, on: Boolean) {
        scope.launch {
            val now = graph.keptFiles.keep(a, on, graph.records.matches.first())
            if (on && !now) notes[a.id] = if (problem != null) "Kept once there's signal." else "There's no room to keep it: kept files are at most 200 MB."
        }
    }

    fun takePhoto() {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", File(dir, "photo-${System.currentTimeMillis()}.jpg"))
        cameraFile = uri
        camera.launch(uri)
    }

    SectionTitle("Files")
    LfCard {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            storage?.takeIf { it.nearlyFull }?.let {
                Text(app.lawfive.data.storageUsedLine(it), style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
            val list = files
            if (list == null && problem == null) {
                LoadingPitch(inline = true)
            } else {
                list.orEmpty().forEach { a ->
                    FileRow(a, kept = a.id in kept.kept, pinned = a.id in kept.pinned, note = notes[a.id], readOnly = false,
                        onOpen = { open(a) }, onShare = { share(a) }, onKeep = { keep(a, it) },
                        onOpenWith = { scope.launch { runCatching { openWith(context, graph.keptFiles.fileFor(a), a) }.onSuccess { it?.let { n -> notes[a.id] = n } }.onFailure { notes[a.id] = "Opens when there's signal." } } },
                        onRename = { name ->
                            scope.launch {
                                try {
                                    graph.api.call("PUT", "/v1/attachments/${a.id}", JsonObject(mapOf("name" to JsonPrimitive(name))))
                                } catch (e: IOException) {
                                    notes[a.id] = if (e is ApiException) e.message ?: "It wasn't renamed." else "Renames when there's signal."
                                }
                                reload()
                            }
                        },
                        onDelete = {
                            scope.launch {
                                try {
                                    graph.api.call("DELETE", "/v1/attachments/${a.id}")
                                    graph.keptFiles.forget(a.id)
                                } catch (e: IOException) {
                                    notes[a.id] = if (e is ApiException) e.message ?: "It wasn't deleted." else "Deletes when there's signal."
                                }
                                reload()
                            }
                        },
                    )
                }
                pending.forEach { name -> PendingRow(name) }
                if (storage?.full == true) {
                    AddRow(Ph.Info, "Storage full", "Tap to see why") { trouble = Trouble(emptyList(), 0, emptyList()) }
                } else {
                    AddFilesRow(onPick = { pick.launch(fileMimeTypes) }, onCamera = { takePhoto() })
                }
            }
            problem?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = if (files == null) colors.muted else colors.redText) }
            trouble?.let { t ->
                FileTrouble(t, storage, admin, onRetry = { add(t.retry) }, onDismiss = { trouble = null })
            }
            val fromCompetition = theirs.orEmpty()
            if (competition != null && fromCompetition.isNotEmpty()) {
                // FILE-6: the competition's files, read-only here; they're changed on its page.
                Text(
                    androidx.compose.ui.text.buildAnnotatedString {
                        append("FROM THE COMPETITION · ")
                        withStyle(androidx.compose.ui.text.SpanStyle(color = colors.brandStrong)) { append(competition.name.uppercase()) }
                    },
                    style = LfType.label(11.sp, colors.muted, 0.12f),
                    modifier = Modifier.padding(top = 10.dp).clickable(onClickLabel = "Open the competition") { nav.navigate("competition/${competition.id}") },
                )
                fromCompetition.forEach { a ->
                    FileRow(a, kept = a.id in kept.kept, pinned = a.id in kept.pinned, note = notes[a.id], readOnly = true,
                        onOpen = { open(a) }, onShare = { share(a) }, onKeep = { keep(a, it) },
                        onOpenWith = { scope.launch { runCatching { openWith(context, graph.keptFiles.fileFor(a), a) }.onSuccess { it?.let { n -> notes[a.id] = n } }.onFailure { notes[a.id] = "Opens when there's signal." } } },
                        onRename = {}, onDelete = {})
                }
            }
        }
    }
    viewing?.let { (a, local) ->
        FileViewer(a, local, onShare = { shareFile(context, local, a) }, onOpenWith = { openWith(context, local, a) }, onClose = { viewing = null })
    }
}

/** One file: its picture, name and line, Share, and a menu to open it elsewhere, keep it, and (unless read-only here) rename or delete it. */
@Composable
private fun FileRow(
    a: Attachment, kept: Boolean, pinned: Boolean, note: String?, readOnly: Boolean,
    onOpen: () -> Unit, onShare: () -> Unit, onOpenWith: () -> Unit, onKeep: (Boolean) -> Unit, onRename: (String) -> Unit, onDelete: () -> Unit,
) {
    val graph = LocalGraph.current
    val name = a.fileName
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val kind = fileKind(a.contentType)
    // Share beside the menu where there's room; on a narrow phone it's first in the menu, so the name has the width.
    BoxWithConstraints(Modifier.fillMaxWidth()) {
    val roomy = maxWidth >= 330.dp
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(6.dp)).border(1.dp, colors.border, RoundedCornerShape(6.dp))
            .clickable(onClickLabel = "Open $name", onClick = onOpen).padding(start = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // FILE-12: its kind's icon, under a thumbnail when one was made (a photo, or a PDF added on a phone).
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(4.dp)).background(colors.surface2), contentAlignment = Alignment.Center) {
            PhIcon(kindIcons.getValue(kind), size = 22.dp, tint = colors.brandStrong)
            if (a.hasThumb ?: (kind == FileKind.PHOTO)) {
                AsyncImage("${graph.api.base()}${a.thumbUrl}", null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                note ?: (describeFile(a) + if (kept) " · On this phone" else if (pinned) " · Kept when there's signal" else ""),
                style = MaterialTheme.typography.bodySmall, color = if (note != null && note != "Opening…") colors.amberText else colors.muted,
            )
        }
        if (roomy) IconButton(onShare, Modifier.size(40.dp)) { PhIcon(Ph.Share, "Share $name", size = 18.dp, tint = colors.text) }
        Box {
            IconButton({ menu = true }, Modifier.size(40.dp)) { PhIcon(Ph.More, "More for $name", size = 18.dp, tint = colors.text) }
            app.lawfive.ui.theme.OnPanel {
                DropdownMenu(menu, { menu = false }, containerColor = colors.surface) {
                    if (!roomy) MenuItem(Ph.Share, "Share", "Send it to another app") { menu = false; onShare() }
                    MenuItem(Ph.OpenWith, "Open with", "In another app on this phone") { menu = false; onOpenWith() }
                    if (pinned) MenuItem(Ph.KeepOff, "Stop keeping it", "Kept for the next 3 days' matches only") { menu = false; onKeep(false) }
                    else MenuItem(Ph.Keep, "Keep on this phone", "So it opens without signal") { menu = false; onKeep(true) }
                    if (!readOnly) {
                        MenuItem(Ph.Edit, "Rename", keepsEnding(splitName(name).second)) { menu = false; renaming = true }
                        MenuItem(Ph.Trash, "Delete", "For good", danger = true) { menu = false; deleting = true }
                    }
                }
            }
        }
    }
    }
    if (renaming) RenameDialog(name, onRename = { renaming = false; onRename(it) }, onDismiss = { renaming = false })
    if (deleting) Confirm("Delete $name?", "It can't be got back.", "Delete", onConfirm = { deleting = false; onDelete() }, onDismiss = { deleting = false })
}

@Composable
private fun MenuItem(icon: Ph, title: String, sub: String, danger: Boolean = false, onClick: () -> Unit) {
    DropdownMenuItem(
        {
            Column {
                Text(title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold), color = if (danger) colors.redText else colors.text)
                Text(sub, style = MaterialTheme.typography.bodySmall, color = colors.muted)
            }
        },
        onClick, leadingIcon = { PhIcon(icon, size = 18.dp, tint = if (danger) colors.redText else colors.text) },
    )
}

/** FILE-10: a new name; the file keeps its ending. */
@Composable
private fun RenameDialog(name: String, onRename: (String) -> Unit, onDismiss: () -> Unit) {
    val (base, ending) = splitName(name)
    var draft by remember { mutableStateOf(base) }
    app.lawfive.ui.theme.OnPanel {
        AlertDialog(
            onDismissRequest = onDismiss, containerColor = colors.surface,
            title = { Text("Rename") },
            text = {
                Field("Name", draft, { draft = it.take(120) }, supporting = keepsEnding(ending) + ".",
                    trailing = if (ending.isEmpty()) null else ({ Text(ending, color = colors.muted, modifier = Modifier.padding(end = 12.dp)) }))
            },
            confirmButton = {
                TextButton({ if (draft.trim().isNotEmpty() && draft.trim() != base) onRename("${draft.trim()}$ending") else onDismiss() }, enabled = draft.isNotBlank()) {
                    Text("Rename", color = colors.brandStrong)
                }
            },
            dismissButton = { TextButton(onDismiss) { Text("Cancel", color = colors.text) } },
        )
    }
}

@Composable
private fun PendingRow(name: String) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).alpha(0.55f).clip(RoundedCornerShape(6.dp)).border(1.dp, colors.border, RoundedCornerShape(6.dp))
            .padding(8.dp).semantics(mergeDescendants = true) { contentDescription = "Uploading $name" },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(4.dp)).background(colors.surface2), contentAlignment = Alignment.Center) {
            PhIcon(Ph.Upload, size = 22.dp, tint = colors.muted)
        }
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("Uploading…", style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
    }
}

/** A dashed row, as the website's Add files. */
@Composable
private fun AddRow(icon: Ph, title: String, sub: String, onClick: () -> Unit) {
    val dash = colors.muted.copy(alpha = 0.55f)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(6.dp)).background(colors.surface2)
            .drawBehind {
                drawRoundRect(dash, style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))), cornerRadius = CornerRadius(6.dp.toPx()))
            }
            .clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        PhIcon(icon, size = 20.dp, tint = colors.muted)
        Column {
            Text(title, style = MaterialTheme.typography.labelLarge, color = colors.text)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = colors.muted)
        }
    }
}

/** Add files: from the phone's files, or a photo from the camera. */
@Composable
private fun AddFilesRow(onPick: () -> Unit, onCamera: () -> Unit) {
    var choosing by remember { mutableStateOf(false) }
    Box {
        AddRow(Ph.AddFiles, "Add files", "PDF, spreadsheets, Word, text or photos, up to 20 MB each") { choosing = true }
        app.lawfive.ui.theme.OnPanel {
            DropdownMenu(choosing, { choosing = false }, containerColor = colors.surface) {
                DropdownMenuItem({ Text("From the phone's files") }, { choosing = false; onPick() }, leadingIcon = { PhIcon(Ph.AddFiles, size = 18.dp, tint = colors.text) })
                DropdownMenuItem({ Text("Take a photo") }, { choosing = false; onCamera() }, leadingIcon = { PhIcon(Ph.Camera, size = 18.dp, tint = colors.text) })
            }
        }
    }
}

/** FILE-7: what couldn't be added, said once under the list, each file with why, and what's taken said once. */
@Composable
private fun FileTrouble(t: Trouble, storage: AccountStorage?, admin: Boolean, onRetry: () -> Unit, onDismiss: () -> Unit) {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val taken = takenLine(t.refused)
    val refused = withoutTaken(t.refused)
    Row(Modifier.fillMaxWidth().padding(top = 4.dp).background(colors.amberSoft, RoundedCornerShape(6.dp)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PhIcon(Ph.Info, size = 18.dp, tint = colors.amberText)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if ((t.noRoom > 0 || refused.isEmpty()) && storage?.limitBytes != null) {
                Text(app.lawfive.data.noRoomTitle(t.noRoom, "file"), style = MaterialTheme.typography.titleSmall, color = colors.text)
                Text(app.lawfive.data.noRoomText(storage, admin), style = MaterialTheme.typography.bodySmall, color = colors.text)
                if (admin) {
                    Text("Change the limit", style = MaterialTheme.typography.labelLarge, color = colors.brandStrong,
                        modifier = Modifier.clickable { openWebsite(context, graph.session.current.server, "/settings/server/plans") })
                }
            }
            if (refused.isNotEmpty()) {
                Text(refusedTitle(refused), style = MaterialTheme.typography.titleSmall, color = colors.text)
                if (refused.size == 1) Text(refused[0].why, style = MaterialTheme.typography.bodySmall, color = colors.text)
                else refused.forEach { Text("${it.name}: ${it.why}", style = MaterialTheme.typography.bodySmall, color = colors.text) }
            }
            taken?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.text) }
            if (t.retry.isNotEmpty()) SecondaryButton("Try again", onRetry)
        }
        Box(Modifier.clickable(onClick = onDismiss)) { PhIcon(Ph.Close, "Dismiss", size = 18.dp, tint = colors.muted) }
    }
}

/** A PDF page by page with zoom, a photo large, or a CSV or text file's first lines in the monospaced font (FILE-12, FILE-13), on the board. */
@Composable
private fun FileViewer(a: Attachment, local: File, onShare: () -> Unit, onOpenWith: () -> String?, onClose: () -> Unit) {
    val kind = fileKind(a.contentType)
    var note by remember { mutableStateOf<String?>(null) }
    val text by produceState<TextPreview?>(null, local) {
        if (kind == FileKind.CSV || kind == FileKind.TXT) value = withContext(Dispatchers.IO) { textPreview(local.readBytes()) }
    }
    app.lawfive.ui.theme.OnBoard {
        Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Column(Modifier.fillMaxSize().background(colors.board).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(a.fileName, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    IconButton(onClose) { PhIcon(Ph.Close, "Close") }
                }
                Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Color(0xFF0D100F))) {
                    when (kind) {
                        FileKind.PDF -> PdfPages(local) { note = it }
                        FileKind.PHOTO -> AsyncImage(local, a.fileName, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        else -> TextLines(text, wrap = kind == FileKind.TXT, name = a.fileName)
                    }
                }
                val line = note ?: if (text?.more == true) "The first $PREVIEW_LINES lines · ${describeFile(a)}" else describeFile(a)
                Text(line, style = MaterialTheme.typography.bodySmall, color = colors.muted)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SecondaryButton("Share", onShare, icon = Ph.Share)
                    SecondaryButton("Open with", { note = onOpenWith() }, icon = Ph.OpenWith)
                }
            }
        }
    }
}

/** A CSV or text file's first lines as text, never as a page: CSV scrolls both ways, text wraps. */
@Composable
private fun TextLines(text: TextPreview?, wrap: Boolean, name: String) {
    when {
        text == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingPitch(inline = true) }
        text.lines.isEmpty() -> Text("This file is empty.", color = colors.muted, modifier = Modifier.padding(12.dp))
        else -> {
            val body = text.lines.joinToString("\n")
            val style = MaterialTheme.typography.bodySmall.copy(fontFamily = Mono, fontSize = 13.sp, lineHeight = 19.sp)
            Box(Modifier.fillMaxSize().background(colors.surface2).verticalScroll(rememberScrollState()).then(if (wrap) Modifier else Modifier.horizontalScroll(rememberScrollState())).padding(12.dp)
                .semantics { contentDescription = "The first lines of $name" }) {
                Text(body, style = style, color = colors.text, softWrap = wrap)
            }
        }
    }
}

/** The pages of a PDF, drawn by the phone's own renderer as they scroll into view; pinch to zoom, double-tap to go back. */
@Composable
private fun PdfPages(file: File, onProblem: (String) -> Unit) {
    val document = remember(file) { runCatching { PdfDocument(file) }.onFailure { onProblem("This PDF can't be shown here: try Open with.") }.getOrNull() }
    androidx.compose.runtime.DisposableEffect(document) { onDispose { document?.close() } }
    if (document == null) return
    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }
    BoxWithConstraints(
        Modifier.fillMaxSize()
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { scale = 1f; offsetX = 0f; offsetY = 0f }) }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    do {
                        val event = awaitPointerEvent()
                        // Two fingers zoom and move it; one scrolls the pages.
                        if (event.changes.size > 1) {
                            scale = (scale * event.calculateZoom()).coerceIn(1f, 5f)
                            val pan = event.calculatePan()
                            val maxX = size.width * (scale - 1) / 2
                            val maxY = size.height * (scale - 1) / 2
                            offsetX = (offsetX + pan.x).coerceIn(-maxX, maxX)
                            offsetY = (offsetY + pan.y).coerceIn(-maxY, maxY)
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            },
    ) {
        val widthPx = with(LocalDensity.current) { maxWidth.roundToPx() }
        LazyColumn(
            Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = offsetX; translationY = offsetY },
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(document.pages.size) { i ->
                val (w, h) = document.pages[i]
                // Drawn at twice the width, so it stays sharp zoomed in a little.
                val bitmap by produceState<Bitmap?>(null, i, widthPx) { value = document.render(i, widthPx * 2) }
                Box(Modifier.fillMaxWidth().aspectRatio(w.toFloat() / h).background(Color.White).semantics { contentDescription = "Page ${i + 1} of ${document.pages.size}" }) {
                    bitmap?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize()) }
                }
            }
        }
    }
}

/** A PDF open for drawing; PdfRenderer draws one page at a time, so its pages are drawn in turn. */
private class PdfDocument(file: File) {
    private val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer = PdfRenderer(descriptor)
    private val lock = Mutex()
    private var closed = false
    /** Each page's size in points. */
    val pages: List<Pair<Int, Int>> = (0 until renderer.pageCount).map { i -> renderer.openPage(i).use { it.width to it.height } }

    suspend fun render(index: Int, width: Int): Bitmap? = lock.withLock {
        if (closed) return@withLock null
        withContext(Dispatchers.IO) { renderer.openPage(index).use { drawPage(it, width) } }
    }

    fun close() {
        // After any drawing under way.
        kotlinx.coroutines.runBlocking { lock.withLock { closed = true; renderer.close(); descriptor.close() } }
    }
}

/** A page drawn on white at `width` pixels across. */
private fun drawPage(page: PdfRenderer.Page, width: Int): Bitmap {
    val height = (width.toFloat() * page.height / page.width).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    bitmap.eraseColor(AndroidColor.WHITE)
    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
    return bitmap
}

/** FILE-12: a PDF's first page as a 480-pixel JPEG thumbnail, by the phone's own renderer; null when it can't be drawn. */
private fun pdfThumbnail(context: Context, uri: Uri): ByteArray? = runCatching {
    context.contentResolver.openFileDescriptor(uri, "r")!!.use { fd ->
        PdfRenderer(fd).use { r ->
            r.openPage(0).use { page ->
                val wide = page.width >= page.height
                val bitmap = drawPage(page, if (wide) 480 else (480f * page.width / page.height).toInt().coerceAtLeast(1))
                shrink(bitmap, 480, 80).first
            }
        }
    }
}.getOrNull()

/** Bigger than the server ever takes, so not sent. */
private class TooBig(message: String) : Exception(message)

/** The name the phone's file has. */
private fun displayName(context: Context, uri: Uri): String =
    runCatching { context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } }.getOrNull()
        ?: uri.lastPathSegment?.substringAfterLast('/') ?: "File"

/** A photo taken for Files: "Photo 2026-11-09 08.00.jpg". */
private fun photoName() = "Photo ${LocalDateTime.now(app.lawfive.data.AppClock.clock()).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH.mm", Locale.US))}.jpg"

/**
 * Uploads a file as it is (FILE-9), with a thumbnail when it's a photo or a PDF (FILE-12). A photo
 * from the camera is made smaller first, as photos are, so where it was taken doesn't go with it
 * (FILE-2). With `room`, one bigger than that isn't sent.
 */
private suspend fun uploadFile(graph: AppGraph, context: Context, recordType: String, recordId: String, uri: Uri, name: String, camera: Boolean, room: Long?) = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val picked = if (camera) {
        val photo = readPhoto(context, uri)
        PickedFile(name, "image/jpeg", shrink(photo, 2000, 85).first)
    } else {
        val size = runCatching { resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null } }.getOrNull()
        if (size != null && size > MAX_FILE_BYTES) throw TooBig(tooBig(name))
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IOException("That file couldn't be read")
        if (bytes.size > MAX_FILE_BYTES) throw TooBig(tooBig(name))
        PickedFile(name, resolver.getType(uri) ?: "application/octet-stream", bytes)
    }
    if (room != null && picked.bytes.size > room) throw NoRoomForFile()
    val thumb = when {
        picked.type.startsWith("image/") -> runCatching { shrink(readPhoto(context, uri), 480, 80).first }.getOrNull()
        picked.type == "application/pdf" || name.endsWith(".pdf", ignoreCase = true) -> pdfThumbnail(context, uri)
        else -> null
    }
    val body = MultipartBody.Builder().setType(MultipartBody.FORM)
        .addFormDataPart("recordType", recordType)
        .addFormDataPart("recordId", recordId)
        .addFormDataPart("kind", "file")
        .addFormDataPart("name", picked.name)
        .addFormDataPart("file", picked.name, picked.bytes.toRequestBody(picked.type.toMediaType()))
        .apply { thumb?.let { addFormDataPart("thumb", "thumb.jpg", it.toRequestBody("image/jpeg".toMediaType())) } }
        .build()
    graph.api.callRaw("POST", "/v1/attachments", body)
}

/** The file to another app, through the FileProvider. */
private fun contentUri(context: Context, file: File): Uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)

/** FILE-13: Open with: an app on the phone that can show it. Null when one opened, else why not. */
fun openWith(context: Context, file: File, a: Attachment): String? {
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(contentUri(context, file), a.contentType).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    return try {
        context.startActivity(intent)
        null
    } catch (_: ActivityNotFoundException) {
        "No app on this phone opens ${fileKind(a.contentType).label} files."
    }
}

/** FILE-13: Share sends the file to another app. */
fun shareFile(context: Context, file: File, a: Attachment) {
    val uri = contentUri(context, file)
    val intent = Intent(Intent.ACTION_SEND).setType(a.contentType).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    intent.clipData = ClipData.newRawUri(a.fileName, uri)
    context.startActivity(Intent.createChooser(intent, "Share ${a.fileName}"))
}
