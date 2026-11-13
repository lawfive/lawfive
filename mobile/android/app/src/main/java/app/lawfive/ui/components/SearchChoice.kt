package app.lawfive.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch
import java.text.Normalizer

// APP-22: a venue, competition or referee, chosen from a list that can be long: search it, or make a
// new one from what's typed, as the website's picker does (WEB-12).

/** For comparing names: no case or accents, so "jose" finds "José". */
internal fun foldName(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

/** The options whose name, or another name for them, holds what's typed; all of them with nothing typed. */
internal fun <T> searchOptions(options: List<T>, typed: String, names: (T) -> List<String>): List<T> {
    val query = foldName(typed)
    return if (query.isEmpty()) options else options.filter { o -> names(o).any { foldName(it).contains(query) } }
}

/** Whether what's typed could be a new one: something's typed, and nothing is already called that. */
internal fun <T> canCreate(options: List<T>, typed: String, names: (T) -> List<String>): Boolean {
    val query = foldName(typed)
    return query.isNotEmpty() && options.none { o -> names(o).any { foldName(it) == query } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> SearchChoice(
    label: String,
    value: T?,
    options: List<T>,
    name: (T) -> String,
    onChange: (T?) -> Unit,
    modifier: Modifier = Modifier,
    /** What the field says with nothing chosen. */
    empty: String = "None",
    allowNone: Boolean = true,
    otherNames: (T) -> List<String> = { emptyList() },
    /** "New venue", offered as: New venue "<typed>". */
    createLabel: String? = null,
    onCreate: (suspend (String) -> T)? = null,
    /** Instead of onCreate: the list closes and this is given what's typed, to ask for more first (a new venue's address, WEB-12). */
    onCreateAsk: ((String) -> Unit)? = null,
    /** "Just this match:", offered as: Just this match: "<typed>". */
    textLabel: String? = null,
    onUseText: ((String) -> Unit)? = null,
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier.fillMaxWidth()) {
        Field(label, value?.let(name) ?: empty, {}, trailing = { PhIcon(Ph.Chevron, size = 18.dp, tint = colors.muted) })
        // Over the field, so a tap anywhere on it opens the list.
        Box(Modifier.matchParentSize().padding(top = 8.dp).clip(RoundedCornerShape(9.dp)).clickable { open = true })
    }
    if (!open) return

    var typed by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val names = { o: T -> listOf(name(o)) + otherNames(o) }
    val found = searchOptions(options, typed, names)
    val text = typed.trim()
    fun close() { open = false }
    // No dragging the sheet: scrolling past the end of the list would otherwise pull it down and close it.
    app.lawfive.ui.theme.OnPanel { ModalBottomSheet({ close() }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), sheetGesturesEnabled = false, dragHandle = null, containerColor = colors.surface) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(0.92f).imePadding().padding(start = 16.dp, end = 16.dp, top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                LinkButton("Cancel") { close() }
            }
            Field("Search", typed, { typed = it }, Modifier.focusRequester(focus), leading = { PhIcon(Ph.Search, size = 18.dp, tint = colors.muted) })
            LazyColumn(Modifier.weight(1f)) {
                if (allowNone && typed.isBlank()) {
                    item { OptionRow("None", value == null, muted = true) { onChange(null); close() } }
                }
                items(found.size) { i ->
                    val o = found[i]
                    OptionRow(name(o), o == value) { onChange(o); close() }
                }
                if ((onCreate != null || onCreateAsk != null) && createLabel != null && canCreate(options, typed, names)) {
                    item {
                        OptionRow("$createLabel \"$text\"", false, icon = Ph.Plus) {
                            if (onCreateAsk != null) {
                                close()
                                onCreateAsk(text)
                            } else if (!creating && onCreate != null) {
                                creating = true
                                scope.launch {
                                    onChange(onCreate(text))
                                    close()
                                }
                            }
                        }
                    }
                }
                if (onUseText != null && textLabel != null && text.isNotEmpty()) {
                    item { OptionRow("$textLabel \"$text\"", false) { onUseText(text); close() } }
                }
                if (found.isEmpty() && onCreate == null && onCreateAsk == null && onUseText == null) {
                    item { Text("Nothing called that.", color = colors.muted, modifier = Modifier.padding(vertical = 14.dp)) }
                }
            }
        }
    } }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
}

@Composable
private fun OptionRow(text: String, chosen: Boolean, muted: Boolean = false, icon: Ph? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(onClick = onClick).padding(vertical = 13.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (icon != null) PhIcon(icon, size = 18.dp, tint = colors.brandStrong)
        Text(text, Modifier.weight(1f), color = if (icon != null) colors.brandStrong else if (muted) colors.muted else colors.text)
        if (chosen) PhIcon(Ph.Check, "Chosen", size = 18.dp, tint = colors.brandStrong)
    }
}
