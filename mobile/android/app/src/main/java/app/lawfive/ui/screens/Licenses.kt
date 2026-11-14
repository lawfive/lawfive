package app.lawfive.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import app.lawfive.data.Bundled
import app.lawfive.data.Credited
import app.lawfive.data.LicenseParagraph
import app.lawfive.data.Licenses
import app.lawfive.ui.LocalNav
import app.lawfive.ui.components.Chip
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.ListRow
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.Screen
import app.lawfive.ui.components.SectionTitle
import app.lawfive.ui.components.hardDrop
import app.lawfive.ui.theme.OnPanel
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// WX-12: Data and licenses' Full license texts: every library the app and its Wear OS app bundle,
// and the fonts and icons, each opening its copyright and license in full (data/Licenses.kt).

@Composable
private fun bundled(): Bundled? {
    val context = LocalContext.current
    val loaded by produceState<Bundled?>(null) { value = withContext(Dispatchers.IO) { Licenses.load(context.applicationContext) } }
    return loaded
}

/** Its makers, its version (or the phone's and the watch's), and whether it's only in the Wear OS app. */
private fun Credited.line(): String? =
    listOfNotNull(by, versions.joinToString(", ").ifEmpty { null }, if (watchOnly) "Wear OS app" else null).joinToString(" · ").ifEmpty { null }

@Composable
fun LicenseTextsScreen() {
    val nav = LocalNav.current
    val all = bundled()
    @Composable
    fun Rows(list: List<Credited>) {
        LfCard {
            list.forEachIndexed { i, c ->
                ListRow(c.name, c.line(), divider = i > 0, onClick = { nav.navigate("settings/licenses/texts/${Uri.encode(c.id)}") }, trailing = {
                    c.licenses.firstOrNull()?.let { Chip(it.short) }
                })
            }
        }
    }
    Screen("Full license texts", sub = "Each font, icon set and library in the app and its Wear OS app, with its copyright and license.", back = "Data and licenses") {
        if (all != null) {
            item { SectionTitle("Fonts and icons") }
            item { Rows(all.works) }
            item { SectionTitle("Libraries") }
            item { Rows(all.libraries) }
        }
    }
}

@Composable
fun LicenseScreen(id: String) {
    val context = LocalContext.current
    val c = bundled()?.find(id)
    fun open(url: String) = context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
    Screen(c?.name ?: "License", sub = c?.line(), back = "Full license texts") {
        if (c == null) return@Screen
        c.website?.let { site ->
            item {
                LfCard {
                    ListRow("Website", site.substringAfter("://").substringBefore('#').substringBefore('?').trimEnd('/'), divider = false, onClick = { open(site) }, trailing = { PhIcon(Ph.Link, tint = colors.muted) })
                }
            }
        }
        c.notice?.let { notice ->
            item { SectionTitle("Notice") }
            panelText(Licenses.paragraphs(notice))
        }
        c.licenses.forEachIndexed { i, license ->
            item { SectionTitle(if (c.licenses.size > 1) "License ${i + 1}" else "License") }
            if (license.text != null) {
                panelText(listOf(LicenseParagraph(license.name, heading = true)) + Licenses.paragraphs(license.text))
            } else {
                // Terms kept on the web (Garmin's, Google's), not a text to copy.
                item {
                    LfCard {
                        ListRow(license.name, license.url?.let { "Its terms are at ${it.toUri().host ?: it}" } ?: "Its terms come with the library", divider = false,
                            onClick = license.url?.let { url -> { open(url) } }, trailing = if (license.url != null) { { PhIcon(Ph.Link, tint = colors.muted) } } else null)
                    }
                }
            }
        }
    }
}

/**
 * A long text on a chalk panel a paragraph at a time, so a long license (MapLibre's, with every part it
 * includes) scrolls without laying out all at once: each paragraph is a piece of one panel, the first
 * with its top corners, the last with its bottom ones and the panel's drop.
 */
private fun LazyListScope.panelText(paragraphs: List<LicenseParagraph>) {
    itemsIndexed(paragraphs) { i, p ->
        PanelPiece(first = i == 0, last = i == paragraphs.lastIndex) {
            Text(
                p.text,
                style = if (p.heading) MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold) else MaterialTheme.typography.bodyMedium,
                color = colors.text,
                modifier = if (p.heading) Modifier.semantics { heading() } else Modifier,
            )
        }
    }
}

@Composable
private fun PanelPiece(first: Boolean, last: Boolean, content: @Composable () -> Unit) {
    OnPanel {
        val c = colors
        val r = 6.dp
        val shape = RoundedCornerShape(if (first) r else 0.dp, if (first) r else 0.dp, if (last) r else 0.dp, if (last) r else 0.dp)
        Box(
            Modifier
                .fillMaxWidth()
                .then(if (last) Modifier.hardDrop(c.panelShadow, shape) else Modifier)
                .clip(shape)
                .background(c.surface)
                .then(if (c.dark) Modifier.panelEdge(c.panelEdge, first, last) else Modifier)
                .padding(start = 16.dp, end = 16.dp, top = if (first) 16.dp else 0.dp, bottom = if (last) 16.dp else 12.dp),
        ) { content() }
    }
}

/** The panel's 1 dp edge at night, on a piece of it: the sides, and the rounded end where the piece is one. */
private fun Modifier.panelEdge(color: Color, first: Boolean, last: Boolean) = drawBehind {
    val w = 1.dp.toPx()
    val past = 24.dp.toPx()
    val top = if (first) w / 2 else -past
    val bottom = if (last) size.height - w / 2 else size.height + past
    drawRoundRect(color, Offset(w / 2, top), Size(size.width - w, bottom - top), CornerRadius(6.dp.toPx() - w / 2), style = Stroke(w))
}
