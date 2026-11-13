package app.lawfive.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.lawfive.data.figureAndUnit
import app.lawfive.data.shares
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.colors
import kotlin.math.max

// WEB-24: Stats' graphics in the broadcast stats package, as the website's boardCharts.tsx: a
// head-to-head bar whose parts meet on the kits' diagonal, slanted bars with their values written
// beside them, columns with their values over them, and time split across bands with the shares on
// elbows over a bar. Each is honest: lengths and heights are to scale, and the values are written.

/** A size in dp as sp that doesn't grow with the phone's text size: for figures already sized to their room. */
@Composable
fun fixedSp(dp: Dp): TextUnit = with(LocalDensity.current) { dp.toSp() }

/**
 * Text that steps its size down until it fits the width it has on one line (a big figure, a long
 * word), never under `min`; at the phone's larger text sizes too. Built on the text's own auto size,
 * so it can sit in rows that size to their content.
 */
@Composable
fun FitText(text: String, style: TextStyle, modifier: Modifier = Modifier, min: TextUnit = 12.sp, textAlign: TextAlign? = null, annotated: AnnotatedString? = null) {
    BasicText(
        annotated ?: AnnotatedString(text), modifier,
        style = if (textAlign != null) style.copy(textAlign = textAlign) else style,
        maxLines = 1, softWrap = false, overflow = TextOverflow.Clip,
        autoSize = TextAutoSize.StepBased(minFontSize = min, maxFontSize = style.fontSize, stepSize = 1.sp),
    )
}

/**
 * Words at the largest size up to `style`'s at which each word fits the width on its own line, so
 * they wrap between words but never break one ("SEND-OFFS", "SPRINTING"), at any text size. Built
 * on the text's own auto size, so it can sit in rows that size to their content.
 */
@Composable
fun WordFitText(text: String, style: TextStyle, modifier: Modifier = Modifier, min: TextUnit = 8.sp, textAlign: TextAlign? = null, maxLines: Int = Int.MAX_VALUE, overflow: TextOverflow = TextOverflow.Clip) {
    BasicText(
        text, modifier, style = if (textAlign != null) style.copy(textAlign = textAlign) else style, maxLines = maxLines, overflow = overflow,
        autoSize = WordsFit(min, style, rememberTextMeasurer()),
    )
}

/** The largest size, in half-sp steps, at which the text's longest word fits the width it has (each word measured on its own). */
private data class WordsFit(val min: TextUnit, val style: TextStyle, val measurer: androidx.compose.ui.text.TextMeasurer) : TextAutoSize {
    override fun androidx.compose.foundation.text.modifiers.TextAutoSizeLayoutScope.getFontSize(constraints: androidx.compose.ui.unit.Constraints, text: AnnotatedString): TextUnit {
        val words = text.text.split(" ").filter { it.isNotEmpty() }
        var size = style.fontSize.value
        while (size > min.value) {
            if (words.all { measurer.measure(it, style.copy(fontSize = size.sp), softWrap = false).size.width <= constraints.maxWidth }) return size.sp
            size -= 0.5f
        }
        return min
    }
}

/**
 * A slab's figure (`.slab-figure`): black italic, the unit small beside it ("27.0 MI"), stepping down
 * to fit. `size` is its largest.
 */
@Composable
fun SlabFigure(text: String, size: Dp, modifier: Modifier = Modifier, color: Color = colors.onBoardStrong, textAlign: TextAlign? = null) {
    val (figure, unit) = figureAndUnit(text)
    val sp = fixedSp(size)
    val annotated = buildAnnotatedString {
        append(figure)
        if (unit.isNotEmpty()) withStyle(SpanStyle(fontSize = 0.36.em, letterSpacing = 0.em)) { append(" ${unit.uppercase()}") }
    }
    FitText(text, LfType.display(sp, color, 0.9.em).copy(letterSpacing = (-0.01).em), modifier.padding(end = 2.dp), min = 18.sp, textAlign = textAlign, annotated = annotated)
}

/** A part of a whole: how much, and its color. */
data class Share(val value: Double, val color: Color)

/** Parts of a whole side by side, each as long as its share (at least 20 dp), meeting on the diagonal: paid v owed, referee v assistant. Drawn only; the words are the caller's. */
@Composable
fun HeadToHead(parts: List<Share>, modifier: Modifier = Modifier, height: Dp = 32.dp) {
    val shown = parts.filter { it.value > 0 }
    Canvas(modifier.fillMaxWidth().height(height).clearAndSetSemantics {}) {
        if (shown.isEmpty()) return@Canvas
        val cut = 14.dp.toPx()
        val overlap = 10.dp.toPx()
        val least = 20.dp.toPx()
        val room = size.width + overlap * (shown.size - 1)
        val total = shown.sumOf { it.value }
        val widths = shown.map { max(least, (it.value / total * room).toFloat()) }.toMutableList()
        // What the least widths added comes off the widest.
        val over = widths.sum() - room
        if (over > 0) widths[widths.indices.maxBy { widths[it] }] -= over
        var x = 0f
        shown.forEachIndexed { i, p ->
            val x0 = x
            val x1 = x + widths[i]
            val first = i == 0
            val last = i == shown.lastIndex
            val path = Path().apply {
                moveTo(if (first) x0 else x0 + cut, 0f)
                lineTo(x1, 0f)
                lineTo(if (last) x1 else x1 - cut, size.height)
                lineTo(x0, size.height)
                close()
            }
            drawPath(path, p.color)
            x = x1 - overlap
        }
    }
}

/** A row of slanted bars: its label (with an icon), how much, how it's written, its color. */
data class SlantBar(val label: String, val value: Double, val display: String, val color: Color, val icon: Ph? = null)

/** Slanted bars, a row each, as the website's at a phone's width: the label over its bar, the bar to scale, its value in black italic beside it. */
@Composable
fun SlantBars(rows: List<SlantBar>, modifier: Modifier = Modifier) {
    val most = rows.maxOfOrNull { it.value }?.takeIf { it > 0 } ?: 1.0
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (r in rows) {
            Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (r.icon != null) PhIcon(r.icon, size = 18.dp, tint = colors.muted)
                    Text(r.label, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
                }
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val bar = (maxWidth - 96.dp) * (r.value / most).toFloat()
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.width(if (bar < 14.dp) 14.dp else bar).height(18.dp).clip(slantShape(left = 12.dp, right = 12.dp)).background(r.color))
                        Text(r.display, style = LfType.display(26.sp, colors.onBoardStrong, 26.sp), maxLines = 1, softWrap = false, modifier = Modifier.padding(end = 2.dp))
                    }
                }
            }
        }
    }
}

/** A column: its label under it, its value written over it, how much, and itself in words. */
data class BoardColumn(val label: String, val value: Double, val display: String, val describe: String)

/**
 * Columns to scale on the board with their values over them and labels under (the website's
 * `BoardColumns`); a tap on one says what's in it above them, as the phones have no hover (STAT-13).
 */
@Composable
fun BoardColumns(columns: List<BoardColumn>, color: Color, summary: String, modifier: Modifier = Modifier, height: Dp = 150.dp) {
    var picked by remember(columns) { mutableStateOf<Int?>(null) }
    val most = columns.maxOfOrNull { it.value }?.takeIf { it > 0 } ?: 1.0
    Column(modifier.fillMaxWidth()) {
        Text(
            picked?.let { columns[it].describe } ?: "Tap a column to see what's in it",
            style = MaterialTheme.typography.bodySmall, color = if (picked != null) colors.text else colors.muted,
            maxLines = 2, modifier = Modifier.heightIn(min = 36.dp).padding(bottom = 4.dp).clearAndSetSemantics {},
        )
        Row(Modifier.fillMaxWidth().semantics { contentDescription = summary }, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.Bottom) {
            columns.forEachIndexed { i, col ->
                Column(
                    Modifier.weight(1f).clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                        .background(if (picked == i) colors.surface2 else Color.Transparent)
                        .clickable(onClickLabel = "Say what's in it") { picked = if (picked == i) null else i }
                        .padding(top = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(col.display, style = LfType.display(22.sp, colors.onBoardStrong, 22.sp), maxLines = 1, softWrap = false, modifier = Modifier.padding(bottom = 5.dp))
                    Box(Modifier.columnWidth().height(height * (col.value / most).toFloat()).background(color))
                    Text(col.label.uppercase(), style = LfType.word(16.sp, colors.onBoard), maxLines = 1, softWrap = false, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                }
            }
        }
    }
}

/** A band of time: its name, a line under it (a speed or a heart rate), how long, its color. */
data class Band(val name: String, val sub: String, val sec: Double, val color: Color)

/**
 * Time split across ordered bands (the website's elbow bar): one bar to scale, the shares over it in
 * columns with elbows down to their parts; `stepped` raises each zone a step, as heart-rate zones.
 */
@Composable
fun ElbowBar(bands: List<Band>, summary: String, modifier: Modifier = Modifier, stepped: Boolean = false) {
    val pcts = shares(bands.map { it.sec })
    val total = bands.sumOf { it.sec }.takeIf { it > 0 } ?: 1.0
    val line = colors.onBoardDim
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    BoxWithConstraints(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = summary }) {
        // One size for every share and one for every name, the largest at which each fits its column, so a long word never breaks.
        val column = (constraints.maxWidth - with(density) { 4.dp.roundToPx() } * (bands.size - 1)) / bands.size.coerceAtLeast(1)
        var figure = fixedSp(28.dp)
        while (figure > 14.sp && pcts.any { measurer.measure("$it%", LfType.display(figure)).size.width > column }) figure *= 0.92f
        var word = 14.sp
        while (word > 7.sp && bands.any { b -> b.name.uppercase().split(" ").any { measurer.measure(it, LfType.word(word)).size.width > column } }) word *= 0.92f
        Column(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                bands.forEachIndexed { i, b ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${pcts[i]}%", style = LfType.display(figure, colors.onBoardStrong, figure), maxLines = 1, softWrap = false)
                        Text(b.name.uppercase(), style = LfType.word(word, colors.onBoard).copy(lineHeight = word * 1.05f), textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                    }
                }
            }
            Canvas(Modifier.fillMaxWidth().height(28.dp)) {
                var from = 0.0
                bands.forEachIndexed { i, b ->
                    val center = (from + b.sec / total / 2).toFloat() * size.width
                    from += b.sec / total
                    if (b.sec <= 0) return@forEachIndexed
                    val top = (i + 0.5f) / bands.size * size.width
                    val path = Path().apply {
                        moveTo(top, 0f); lineTo(top, size.height * 8 / 24); lineTo(center, size.height * 18 / 24); lineTo(center, size.height)
                    }
                    drawPath(path, line, style = androidx.compose.ui.graphics.drawscope.Stroke(1.5.dp.toPx()))
                }
            }
            val barHeight = if (stepped) 84.dp else 36.dp
            Row(Modifier.fillMaxWidth().height(barHeight), horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
                bands.forEachIndexed { i, b ->
                    if (b.sec > 0) {
                        Box(
                            Modifier.weight(b.sec.toFloat()).widthIn(min = 3.dp)
                                .height(if (stepped) barHeight * (0.2f + (i + 1) * 0.16f) else barHeight).background(b.color),
                        )
                    }
                }
            }
        }
    }
}

/** A column is 76% of its slot, and never wider than 56 dp. */
private fun Modifier.columnWidth() = layout { measurable, constraints ->
    val width = minOf((constraints.maxWidth * 0.76f).toInt(), 56.dp.roundToPx())
    val placeable = measurable.measure(constraints.copy(minWidth = width, maxWidth = width))
    layout(width, placeable.height) { placeable.place(0, 0) }
}
