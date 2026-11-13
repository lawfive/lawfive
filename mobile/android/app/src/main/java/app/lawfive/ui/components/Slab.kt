package app.lawfive.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.OnBoard
import app.lawfive.ui.theme.OnPanel
import app.lawfive.ui.theme.colors

// WEB-24: the slab, the broadcast stats package's section (DESIGN.md "Slab"), as the website's
// `Slab` at a phone's width: a section as a broadcast's caption over its graphic. A chalk title tab
// in black italic capitals, its right edge cut on the kits' diagonal, overlapping the slab's top-left
// corner, with a mint tag beside it saying what's counted; under them the slab: the board by default,
// a chalk panel with corner arcs for dense lists (its tab then a strip of the board), or the grass.
// Made for Stats first; since WEB-28 also a match's track figures and heatmap, its weather, a venue's
// and a referee's figures and the quiz's score.

/** What a slab sits on. */
enum class SlabGround { Board, Panel, Grass }

/** The kits' diagonal on phones: a tab's cut, and a figure slab's right edge. */
val TabCut = 18.dp
val SlabCut = 26.dp

/**
 * A shape cut on the diagonal: its top edge starts `left` in and its bottom edge ends `right` short,
 * as the website's clip-paths (a title tab: right only; the mint tag: both; a cut slab: right).
 */
fun slantShape(left: Dp = 0.dp, right: Dp = 0.dp): Shape = SlantShape(left, right)

private data class SlantShape(val left: Dp, val right: Dp) : Shape {
    override fun createOutline(size: androidx.compose.ui.geometry.Size, layoutDirection: androidx.compose.ui.unit.LayoutDirection, density: androidx.compose.ui.unit.Density): androidx.compose.ui.graphics.Outline {
        val l = with(density) { left.toPx() }.coerceAtMost(size.width)
        val r = with(density) { right.toPx() }.coerceAtMost(size.width)
        val path = androidx.compose.ui.graphics.Path().apply { moveTo(l, 0f); lineTo(size.width, 0f); lineTo(size.width - r, size.height); lineTo(0f, size.height); close() }
        return androidx.compose.ui.graphics.Outline.Generic(path)
    }
}

/** The board as a surface of any shape: near black, by day a hard drop and a deep soft shadow, at night a 1 dp lighter edge round the shape. */
@Composable
fun Modifier.boardSurface(shape: Shape): Modifier {
    val c = colors
    return this
        .then(if (!c.dark) Modifier.hardDrop(Color.Black.copy(alpha = 0.3f), shape).shadow(14.dp, shape, ambientColor = Color.Black, spotColor = Color.Black) else Modifier)
        .clip(shape)
        .background(c.board)
        .then(if (c.dark) Modifier.border(1.dp, c.boardEdge, shape) else Modifier)
}

/**
 * A slab (DESIGN.md "Slab"): `title` in the tab (a heading for TalkBack), an optional Phosphor `icon`
 * before it and a mint `tag` beside it (what's counted: "Games", "Km a game"; the two share the width
 * and wrap when they don't fit side by side). `cut` cuts the slab's right edge on the diagonal, for
 * figures; it clips, so not for anything with menus. What's inside takes the ground's colors.
 */
@Composable
fun Slab(
    title: String,
    modifier: Modifier = Modifier,
    tag: String? = null,
    icon: Ph? = null,
    ground: SlabGround = SlabGround.Board,
    cut: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val faceShape = if (cut) slantShape(right = SlabCut) else RoundedCornerShape(6.dp)
    Layout(
        modifier = modifier.fillMaxWidth(),
        content = {
            SlabTab(title, tag, icon, onBoard = ground == SlabGround.Panel)
            when (ground) {
                SlabGround.Board -> Column(Modifier.fillMaxWidth().boardSurface(faceShape)) {
                    OnBoard {
                        Column(Modifier.fillMaxWidth().padding(start = 16.dp, top = 40.dp, bottom = 20.dp, end = if (cut) SlabCut + 10.dp else 16.dp), content = content)
                    }
                }
                SlabGround.Panel -> OnPanel {
                    val p = colors
                    val shape = RoundedCornerShape(6.dp)
                    Column(
                        Modifier.fillMaxWidth().hardDrop(p.panelShadow, shape).clip(shape).background(p.surface)
                            .then(if (p.dark) Modifier.border(1.dp, p.panelEdge, shape) else Modifier)
                            .cornerArcs(p.brand)
                            .padding(start = 16.dp, top = 40.dp, bottom = 18.dp, end = 16.dp),
                        content = content,
                    )
                }
                SlabGround.Grass -> Column(Modifier.fillMaxWidth(), content = content)
            }
        },
    ) { measurables, constraints ->
        val overhang = 6.dp.roundToPx()
        val width = constraints.maxWidth
        val tab = measurables[0].measure(Constraints(maxWidth = width + overhang))
        val body = measurables[1].measure(constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity))
        // The tab hangs over the slab's top-left corner, half its height over the top; on the grass it sits above.
        val bodyY = if (ground == SlabGround.Grass) tab.height + 14.dp.roundToPx() else (tab.height - 19.dp.roundToPx()).coerceAtLeast(0)
        layout(width, bodyY + body.height) {
            body.place(0, bodyY)
            tab.place(-overhang, 0)
        }
    }
}

/** The title tab and its tag, side by side, wrapping their words when the two don't fit across. */
@Composable
private fun SlabTab(title: String, tag: String?, icon: Ph?, onBoard: Boolean) {
    val c = colors
    val tabBack = if (onBoard) c.board else c.chalk
    val tabInk = if (onBoard) c.onBoardStrong else c.board
    val titleShape = slantShape(right = TabCut)
    val tagShape = slantShape(left = TabCut, right = TabCut)
    Layout(
        content = {
            Row(
                Modifier.shadow(5.dp, titleShape).background(tabBack).heightIn(min = 38.dp)
                    .padding(start = 12.dp, end = 30.dp, top = 4.dp, bottom = 4.dp).semantics { heading() },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) PhIcon(icon, size = 19.dp, tint = tabInk)
                Text(title.uppercase(), style = LfType.display(22.sp, tabInk, 22.sp), overflow = TextOverflow.Clip)
            }
            if (tag != null) {
                Box(
                    Modifier.shadow(5.dp, tagShape).background(c.boardAccent).heightIn(min = 38.dp).padding(start = 26.dp, end = 24.dp, top = 4.dp, bottom = 4.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text(tag.uppercase(), style = LfType.label(10.5.sp, c.board, 0.08f))
                }
            }
        },
    ) { measurables, constraints ->
        val width = constraints.maxWidth
        val overlap = 14.dp.roundToPx()
        val titleWant = measurables[0].maxIntrinsicWidth(Constraints.Infinity)
        if (measurables.size == 1) {
            val t = measurables[0].measure(Constraints(maxWidth = width))
            return@Layout layout(t.width, t.height) { t.place(0, 0) }
        }
        val tagWant = measurables[1].maxIntrinsicWidth(Constraints.Infinity)
        // A word never breaks: each is at least as wide as its longest word.
        val titleMin = measurables[0].minIntrinsicWidth(Constraints.Infinity)
        val tagMin = measurables[1].minIntrinsicWidth(Constraints.Infinity)
        val room = width + overlap
        // Side by side while both fit; else the title keeps its line where it can and the tag wraps;
        // when even that doesn't fit, the tag goes under the title.
        val titleW = if (titleWant + tagWant <= room) titleWant
            else minOf(width, maxOf(titleMin, minOf(titleWant, room - minOf(tagWant, 96.dp.roundToPx()))))
        val tagW = minOf(tagWant, room - titleW)
        // The tag wraps within the title's height (two lines fit a one-line tab); were it to make the tab taller, it goes under instead.
        val tallest = maxOf(measurables[1].minIntrinsicHeight(tagWant), measurables[0].minIntrinsicHeight(titleW))
        if (tagW < tagMin || measurables[1].minIntrinsicHeight(tagW) > tallest) {
            val t = measurables[0].measure(Constraints(minWidth = titleW, maxWidth = titleW))
            val g = measurables[1].measure(Constraints(maxWidth = width))
            return@Layout layout(maxOf(t.width, g.width), t.height + g.height) {
                g.place(0, t.height)
                t.place(0, 0)
            }
        }
        val h = maxOf(measurables[0].minIntrinsicHeight(titleW), measurables[1].minIntrinsicHeight(tagW))
        val t = measurables[0].measure(Constraints.fixed(titleW, h))
        val g = measurables[1].measure(Constraints.fixed(tagW, h))
        layout(titleW + tagW - overlap, t.height) {
            g.place(titleW - overlap, 0)
            t.place(0, 0)
        }
    }
}

/** A small mint label on a slab (pitch green on a panel), or muted with `quiet`. */
@Composable
fun SlabLabel(text: String, modifier: Modifier = Modifier, quiet: Boolean = false, icon: Ph? = null, color: Color? = null) {
    val c = colors
    val tint = color ?: if (quiet) c.muted else if (c.ground == app.lawfive.ui.theme.Ground.Panel) c.brand else c.boardAccent
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (icon != null) PhIcon(icon, size = 16.dp, tint = tint)
        WordFitText(text.uppercase(), LfType.label(12.sp, tint, 0.14f))
    }
}

/** The mint bar under a slab's figure, its ends cut on the slant. */
@Composable
fun MintBar(modifier: Modifier = Modifier, height: Dp = 12.dp, fraction: Float = 0.7f, max: Dp = 330.dp) {
    Box(modifier.fillMaxWidth(fraction).widthIn(max = max).height(height).clip(slantShape(left = 5.dp, right = 5.dp)).background(colors.boardAccent))
}

/** A rule across a slab between its figures, in the board's own rule color. */
@Composable
fun SlabRule(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(2.dp).background(colors.border))
}

/**
 * WEB-28: a figure as a row of a slab at a phone's width: a rule over it, the quiet label on the
 * left and the figure on the right with its unit small (or `whole`, as a temperature stays), and an
 * optional caption under it on the right. Read as one by TalkBack.
 */
@Composable
fun SlabRow(label: String, figure: String, modifier: Modifier = Modifier, caption: String? = null, size: Dp = 32.dp, whole: Boolean = false) {
    Column(modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        SlabRule()
        Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = if (caption == null) 8.dp else 2.dp), verticalAlignment = Alignment.CenterVertically) {
            SlabLabel(label, Modifier.weight(1f).padding(end = 12.dp), quiet = true)
            if (whole) FitText(figure, LfType.display(fixedSp(size), colors.onBoardStrong, 0.9.em).copy(letterSpacing = (-0.01).em), Modifier.padding(end = 2.dp), min = 18.sp)
            else SlabFigure(figure, size)
        }
        if (caption != null) {
            // Balanced lines, so a short last word doesn't sit alone ("2 s or / more").
            Text(caption, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium, lineBreak = LineBreak.Heading), color = colors.muted, textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth().padding(start = 24.dp, bottom = 8.dp))
        }
    }
}
