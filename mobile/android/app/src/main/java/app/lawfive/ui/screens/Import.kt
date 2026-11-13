package app.lawfive.ui.screens

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.lawfive.data.ApiException
import app.lawfive.schema.ImportedRow
import app.lawfive.schema.MatchImportFileResult
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.ChipTone
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.formatShortDay
import app.lawfive.ui.formatTime
import app.lawfive.ui.instantOf
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.time.ZoneId
import java.util.Locale
import java.util.TimeZone

// Importing matches on the phone (IMP-10): the server reads the file (IMP-2), and every row is
// checked before anything is saved (IMP-5), as on the website.

private val decoder = Json { ignoreUnknownKeys = true }

private val fileTypes = arrayOf(
    "text/csv", "text/comma-separated-values", "text/tab-separated-values", "text/plain", "application/json",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/csv", "application/vnd.ms-excel",
)

private class Picked(val name: String, val type: String?, val bytes: ByteArray)

/** How this phone writes dates (7/11/2026 is 7 November in most places, 11 July in the US). */
private fun dateOrder(): String {
    val pattern = (DateFormat.getDateInstance(DateFormat.SHORT, Locale.getDefault()) as? SimpleDateFormat)?.toPattern()?.lowercase() ?: return "mdy"
    return if (pattern.indexOf('d') < pattern.indexOf('m')) "dmy" else "mdy"
}

private suspend fun readPicked(context: Context, uri: Uri): Picked = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val name = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "matches.csv"
    val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IllegalStateException("That file couldn't be opened.")
    Picked(name, resolver.getType(uri), bytes)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ImportScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var picked by remember { mutableStateOf<Picked?>(null) }
    var preview by remember { mutableStateOf<MatchImportFileResult?>(null) }
    var done by remember { mutableStateOf<MatchImportFileResult?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }

    suspend fun send(file: Picked, dryRun: Boolean): MatchImportFileResult {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("timeZone", TimeZone.getDefault().id)
            .addFormDataPart("dateOrder", dateOrder())
            .addFormDataPart("dryRun", "$dryRun")
            .addFormDataPart("file", file.name, file.bytes.toRequestBody(file.type?.toMediaTypeOrNull()))
            .build()
        val (answer) = graph.api.callRaw("POST", "/v1/import/file", body)
        return decoder.decodeFromJsonElement(MatchImportFileResult.serializer(), answer!!)
    }
    fun failure(e: Exception) = when (e) {
        is ApiException -> e.message ?: "The server couldn't read that file."
        is IllegalStateException -> e.message ?: "That file couldn't be opened."
        else -> "Couldn't reach the server. Importing needs a connection."
    }
    fun startOver() {
        picked = null; preview = null; done = null; problem = null
    }
    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            startOver()
            busy = "Reading and checking…"
            try {
                val file = readPicked(context, uri)
                picked = file
                preview = send(file, true)
            } catch (e: Exception) {
                picked = null
                problem = failure(e)
            }
            busy = null
        }
    }

    val checked = preview
    val finished = done
    Screen("Import matches", back = "More") {
        when {
            busy != null -> item {
                LfCard {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        LoadingPitch()
                        Text(busy ?: "", Modifier.padding(bottom = 16.dp), style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                    }
                }
            }
            finished != null -> {
                item {
                    LfCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(describeDone(finished), style = MaterialTheme.typography.titleMedium, color = colors.text)
                            if (finished.skipped > 0) {
                                Text("${finished.skipped} ${if (finished.skipped == 1L) "row was" else "rows were"} skipped.", style = MaterialTheme.typography.bodyMedium, color = colors.muted)
                            }
                        }
                    }
                }
                if (finished.skipped > 0) item { ImportRows(finished, onlyProblems = true) }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SecondaryButton("Import another file", { startOver() })
                        PrimaryButton("Done", { nav.popBackStack() })
                    }
                }
            }
            checked != null -> {
                item {
                    LfCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(picked?.name ?: "", style = MaterialTheme.typography.titleMedium, color = colors.text)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                if (checked.added > 0) Chip("${checked.added} new", ChipTone.Brand)
                                if (checked.updated > 0) Chip("${checked.updated} ${if (checked.updated == 1L) "update" else "updates"}", ChipTone.Blue)
                                if (checked.skipped > 0) Chip("${checked.skipped} with problems", ChipTone.Red)
                            }
                            val adds = listOf("venues" to checked.created.venues, "competitions" to checked.created.competitions, "referees" to checked.created.referees).filter { it.second.isNotEmpty() }
                            if (adds.isNotEmpty()) {
                                Text(
                                    "Also adds " + adds.joinToString("; ") { (kind, names) -> "$kind: ${names.joinToString(", ")}" } + ". They're matched by name, so check the spelling.",
                                    style = MaterialTheme.typography.bodySmall, color = colors.muted,
                                )
                            }
                            if (checked.ignoredColumns.isNotEmpty()) {
                                Text("Columns it doesn't know, and skips: ${checked.ignoredColumns.joinToString(", ")}.", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                            }
                        }
                    }
                }
                item { ImportRows(checked, onlyProblems = false) }
                problem?.let { item { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.redText) } }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SecondaryButton("Choose another", { startOver() })
                        val count = checked.added + checked.updated
                        if (count > 0) {
                            PrimaryButton("Import $count ${if (count == 1L) "match" else "matches"}", {
                                val file = picked ?: return@PrimaryButton
                                scope.launch {
                                    busy = "Importing…"
                                    problem = null
                                    try {
                                        done = send(file, false)
                                        graph.requestSync(0)
                                    } catch (e: Exception) {
                                        problem = failure(e)
                                    }
                                    busy = null
                                }
                            }, icon = Ph.Upload)
                        }
                    }
                }
            }
            else -> {
                item {
                    LfCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                "Add matches from a spreadsheet or a JSON file, one match a row. A row with the match number of a match you already have updates it. Nothing is saved until you've checked every row.",
                                style = MaterialTheme.typography.bodyMedium, color = colors.muted,
                            )
                            PrimaryButton("Choose a file", { chooser.launch(fileTypes) }, Modifier.fillMaxWidth(), icon = Ph.Upload)
                            Text("CSV, Excel (.xlsx) or JSON, up to 1000 matches", style = MaterialTheme.typography.bodySmall, color = colors.muted)
                            problem?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = colors.redText) }
                        }
                    }
                }
                item { SectionTitle("Start from an example") }
                item {
                    LfCard {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                val server = graph.session.current.server
                                SecondaryButton("CSV", { openWebsite(context, server, "/examples/lawfive-matches.csv") }, icon = Ph.Download)
                                SecondaryButton("Excel", { openWebsite(context, server, "/examples/lawfive-matches.xlsx") }, icon = Ph.Download)
                                SecondaryButton("JSON", { openWebsite(context, server, "/examples/lawfive-matches.json") }, icon = Ph.Download)
                                SecondaryButton("What each column means", { openWebsite(context, server, "/matches/import/columns") }, icon = Ph.Info)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun describeDone(done: MatchImportFileResult): String {
    val parts = listOfNotNull(
        done.added.takeIf { it > 0 }?.let { "added $it ${if (it == 1L) "match" else "matches"}" },
        done.updated.takeIf { it > 0 }?.let { "updated $it ${if (it == 1L) "match" else "matches"}" },
    )
    return if (parts.isEmpty()) "Nothing was imported." else "Done: ${parts.joinToString(" and ")}."
}

/** Every row: where it is in the file, the match, what happens to it, and any problems. */
@Composable
private fun ImportRows(result: MatchImportFileResult, onlyProblems: Boolean) {
    val rows = if (onlyProblems) result.rows.filter { it.action == "skip" } else result.rows
    val word = if (result.file.kind == "json") "Item" else "Row"
    LfCard {
        rows.forEachIndexed { i, row ->
            if (i > 0) HorizontalDivider(color = colors.border)
            ImportRowLine(row, "$word ${result.file.lines.getOrNull((row.row - 1).toInt()) ?: row.row}")
        }
    }
}

@Composable
private fun ImportRowLine(row: ImportedRow, place: String) {
    val context = LocalContext.current
    val kickoff = row.kickoff?.let { instantOf(it) }?.atZone(ZoneId.systemDefault())
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(place, style = MaterialTheme.typography.labelSmall, color = colors.muted)
            Text(row.title ?: "No teams", style = MaterialTheme.typography.bodyLarge, color = colors.text)
            kickoff?.let { Text("${formatShortDay(it)}, ${formatTime(it, context)}", style = MaterialTheme.typography.bodySmall, color = colors.muted) }
            row.problems.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.redText) }
        }
        Spacer(Modifier.width(10.dp))
        when (row.action) {
            "add" -> Chip("New", ChipTone.Brand)
            "update" -> Chip("Update", ChipTone.Blue)
            else -> Chip("Skipped", ChipTone.Red)
        }
    }
}
