package app.lawfive.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import app.lawfive.ui.theme.colors

/**
 * Search (APP-17): an X clears it, and the tags in use come up as chips over the list while it has
 * focus and is empty, pushing nothing around. A chosen tag sits in the box with an X of its own.
 * Give its list item a key: above it, rows come and go as you type, and without one Compose would
 * rebuild the field, losing focus and closing the keyboard.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchField(
    query: String,
    onQuery: (String) -> Unit,
    placeholder: String,
    tags: List<String> = emptyList(),
    tag: String? = null,
    onTag: (String?) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    var width by remember { mutableStateOf(0) }
    Box(modifier) {
        Field(
            "Search", query, onQuery,
            modifier = Modifier.onFocusChanged { focused = it.isFocused }.onSizeChanged { width = it.width },
            placeholder = if (tag == null) placeholder else null,
            leading = tag?.let { chosen ->
                {
                    Row(
                        Modifier.padding(start = 8.dp).clip(RoundedCornerShape(8.dp)).background(colors.brandSoft).clickable { onTag(null) }.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(chosen, style = MaterialTheme.typography.labelMedium, color = colors.brandStrong, maxLines = 1)
                        PhIcon(Ph.Close, "Stop filtering by $chosen", size = 13.dp, tint = colors.brandStrong)
                    }
                }
            },
            trailing = {
                if (query.isNotEmpty()) {
                    IconButton({ onQuery("") }) { PhIcon(Ph.Close, "Clear the search", size = 18.dp, tint = colors.muted) }
                } else {
                    PhIcon(Ph.Search, size = 18.dp, tint = colors.muted)
                }
            },
        )
        val choices = tags.filter { it != tag }
        if (focused && query.isEmpty() && tag == null && choices.isNotEmpty()) {
            // Not focusable, so the keyboard stays up and a tap on a chip doesn't take the field's focus.
            val density = LocalDensity.current
            val keyboard = WindowInsets.ime.getBottom(density)
            val gap = with(density) { 6.dp.roundToPx() }
            // Under the box, or over it when the keyboard leaves no room there.
            val place = remember(keyboard, gap) {
                object : PopupPositionProvider {
                    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
                        val below = anchorBounds.bottom + gap
                        val fits = below + popupContentSize.height <= windowSize.height - keyboard
                        return IntOffset(anchorBounds.left, if (fits) below else anchorBounds.top - gap - popupContentSize.height)
                    }
                }
            }
            Popup(popupPositionProvider = place, properties = PopupProperties(focusable = false)) { app.lawfive.ui.theme.OnPanel {
                // A layer over the page (DESIGN.md "Layout shifts"): a panel, so it reads over the grass.
                FlowRow(
                    Modifier.width(with(LocalDensity.current) { width.toDp() }).clip(RoundedCornerShape(6.dp)).background(colors.surface)
                        .border(1.dp, if (colors.dark) colors.panelEdge else colors.border, RoundedCornerShape(6.dp)).padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    choices.forEach { t ->
                        Box(Modifier.clip(RoundedCornerShape(4.dp)).clickable { onTag(t) }) { Chip(t) }
                    }
                }
            } }
        }
    }
}
