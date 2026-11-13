package app.lawfive.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.GenericShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.lawfive.schema.Team
import app.lawfive.ui.parseColour
import app.lawfive.ui.teamName
import app.lawfive.ui.textOn
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.LogoShapes
import app.lawfive.ui.theme.OnBoard
import app.lawfive.ui.theme.colors

// Pitch & Scoreboard's own pieces (WEB-24, DESIGN.md "Components"), as the website draws them: the
// grass and its mowing stripes, the chalk markings (the pitch frame, the halfway line), stadium boards
// with their lit dots, the kits cut on the diagonal, the cards, and the L5 mark (WEB-25).

/** Chalk markings are 3 dp. */
val Line = 3.dp

/** How far the page's words sit in from the screen's edge, and its touchlines (8 dp in, as the website's on phones). */
val PagePad = 21.dp
val Touchline = 8.dp

/**
 * The grass with its mowing stripes: wide, quiet bands (256 dp, the darker one close to the grass),
 * each edge blended over 120 dp, so nothing catches the eye. They stay put as the page scrolls.
 */
fun Modifier.pitchStripes(pitch: Color, stripe: Color): Modifier = drawWithCache {
    val band = 256.dp.toPx()
    val blend = 120.dp.toPx()
    val brush = Brush.verticalGradient(
        0f to stripe, blend / (2 * band) to pitch, 0.5f to pitch, (band + blend) / (2 * band) to stripe, 1f to stripe,
        startY = 0f, endY = 2 * band, tileMode = androidx.compose.ui.graphics.TileMode.Repeated,
    )
    onDrawBehind {
        drawRect(pitch)
        drawRect(brush)
    }
}

/**
 * The pitch frame (DESIGN.md "Shape and surface"): touchlines 8 dp in from the screen's edges, the
 * goal line across the top of a page's first row and the bottom of its last, with a quarter circle
 * at each corner, as a pitch's corner arcs. Drawn from where the list's first and last rows are, so
 * it scrolls with the page; the side lines run on while the ends are off screen.
 */
fun Modifier.pitchFrame(state: LazyListState, line: Color, top: Dp, endKey: Any, foot: Dp = 12.dp): Modifier = drawWithCache {
    val w = Line.toPx()
    val inset = Touchline.toPx() + w / 2
    val arc = 22.dp.toPx()
    val stroke = Stroke(w)
    onDrawBehind {
        val info = state.layoutInfo
        val first = info.visibleItemsInfo.firstOrNull()
        val last = info.visibleItemsInfo.lastOrNull { it.key == endKey }
        val y0 = if (first != null && first.index == 0) first.offset + top.toPx() + w / 2 else -w * 4
        // On a short page the frame still runs to the foot of the screen, as the website's fills the window.
        val y1 = if (last != null) maxOf((last.offset + last.size).toFloat(), size.height - foot.toPx()) - w / 2 else size.height + w * 4
        val left = inset
        val right = size.width - inset
        drawLine(line, Offset(left, y0 - w / 2), Offset(left, y1 + w / 2), w)
        drawLine(line, Offset(right, y0 - w / 2), Offset(right, y1 + w / 2), w)
        if (y0 > -w * 2) {
            drawLine(line, Offset(left, y0), Offset(right, y0), w)
            drawArc(line, 0f, 90f, false, Offset(left - arc, y0 - arc), Size(arc * 2, arc * 2), style = stroke)
            drawArc(line, 90f, 90f, false, Offset(right - arc, y0 - arc), Size(arc * 2, arc * 2), style = stroke)
        }
        if (y1 < size.height + w * 2) {
            drawLine(line, Offset(left, y1), Offset(right, y1), w)
            drawArc(line, 270f, 90f, false, Offset(left - arc, y1 - arc), Size(arc * 2, arc * 2), style = stroke)
            drawArc(line, 180f, 90f, false, Offset(right - arc, y1 - arc), Size(arc * 2, arc * 2), style = stroke)
        }
    }
}

/** Widens a row past the page's padding by `by` each side (the halfway line runs touchline to touchline). */
fun Modifier.bleed(by: Dp): Modifier = layout { measurable, constraints ->
    val extra = by.roundToPx() * 2
    val placeable = measurable.measure(constraints.copy(minWidth = constraints.minWidth + extra, maxWidth = constraints.maxWidth + extra))
    layout(constraints.maxWidth, placeable.height) { placeable.place(-by.roundToPx(), 0) }
}

/** The halfway line, touchline to touchline, with the center spot: it divides a page's halves. */
@Composable
fun Halfway(modifier: Modifier = Modifier) {
    val line = colors.chalkLine
    Canvas(modifier.fillMaxWidth().bleed(PagePad - Touchline - Line).height(16.dp)) {
        val y = size.height / 2
        drawLine(line, Offset(0f, y), Offset(size.width, y), Line.toPx())
        drawCircle(line, 8.dp.toPx(), Offset(size.width / 2, y))
    }
}

/** A heavy chalk rule (3 dp), as between a board's figures on the grass. */
@Composable
fun ChalkRule(modifier: Modifier = Modifier, color: Color = colors.chalkLine) {
    Box(modifier.fillMaxWidth().height(Line).background(color))
}

/** The lit-dot matrix behind a board's biggest figures: 1.3 dp dots every 7 dp. */
fun Modifier.dots(color: Color): Modifier = drawWithCache {
    val step = 7.dp.toPx()
    val r = 1.3.dp.toPx()
    val start = 3.dp.toPx()
    val path = Path()
    var y = start
    while (y < size.height + step) {
        var x = start
        while (x < size.width + step) {
            path.addOval(Rect(Offset(x, y), r))
            x += step
        }
        y += step
    }
    onDrawBehind { drawPath(path, color) }
}

/**
 * A hard drop under a surface (`offset` straight down, no blur): a panel's by day, a primary
 * button's. Drawn behind, outside the surface's own clip.
 */
fun Modifier.hardDrop(color: Color, shape: Shape, offset: Dp = 3.dp): Modifier = if (color.alpha == 0f) this else drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    translate(top = offset.toPx()) { drawOutline(outline, color) }
}

/**
 * A stadium board (DESIGN.md "Boards"): near black, 6 dp corners, a deep drop by day and a 1 dp
 * lighter edge at night; what's in it takes the board's colors.
 */
@Composable
fun Board(modifier: Modifier = Modifier, shadow: Boolean = true, content: @Composable ColumnScope.() -> Unit) {
    val c = colors
    val shape = RoundedCornerShape(6.dp)
    Column(
        modifier
            .fillMaxWidth()
            .then(if (shadow && !c.dark) Modifier.hardDrop(Color.Black.copy(alpha = 0.3f), shape).shadow(14.dp, shape, ambientColor = Color.Black, spotColor = Color.Black) else Modifier)
            .clip(shape)
            .background(c.board)
            .then(if (c.dark) Modifier.border(1.dp, c.boardEdge, shape) else Modifier),
    ) { OnBoard { Column { content() } } }
}

/** A board's head: the mint label on the left, small muted words on the right, then anything else (a caret). */
@Composable
fun BoardHead(label: String, about: String? = null, modifier: Modifier = Modifier, trailing: (@Composable RowScope.() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(label.uppercase(), style = LfType.label(11.sp, colors.boardAccent), maxLines = 1)
        Text(about?.uppercase() ?: "", style = LfType.label(11.sp, colors.onBoardMuted), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f), textAlign = TextAlign.End)
        trailing?.invoke(this)
    }
}

/** A team's kit color, or the board's blank kit for a team with none. */
@Composable
fun kitColor(team: Team): Color = parseColour(team.colour) ?: colors.kitBlank

/** A kit panel's words: black or white by contrast, as on the watch. */
fun kitText(kit: Color): Color = textOn(kit)

private fun homeCut(cut: Float) = GenericShape { size, _ ->
    moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width - cut, size.height); lineTo(0f, size.height); close()
}

private fun awayCut(cut: Float) = GenericShape { size, _ ->
    moveTo(cut, 0f); lineTo(size.width, 0f); lineTo(size.width, size.height); lineTo(0f, size.height); close()
}

enum class KitSize { Small, Normal, Large }

/**
 * The two kits side by side (WEB-24, `KitPanels`): home on the left, each a panel in its color with
 * the name in black italic capitals in black or white by contrast, cut on the diagonal where they
 * meet; something can sit on the board between them (the score, the kickoff). A name never sets
 * larger than 22% of its panel's width, so a long word steps down rather than breaking.
 */
@Composable
fun KitPanels(
    home: Team, away: Team, modifier: Modifier = Modifier, size: KitSize = KitSize.Normal, labels: Boolean = false,
    lines: Int = 2,
    /** About how wide what sits between the kits is, so the names can size to what's left. */
    middleWidth: Dp = 96.dp,
    middle: (@Composable () -> Unit)? = null,
) {
    val density = LocalDensity.current
    val cut = when (size) { KitSize.Small -> 14.dp; KitSize.Normal -> 22.dp; KitSize.Large -> 18.dp }
    val minHeight = when (size) { KitSize.Small -> 40.dp; KitSize.Normal -> 64.dp; KitSize.Large -> 76.dp }
    val nameSize = when (size) { KitSize.Small -> 19.sp; KitSize.Normal -> 24.sp; KitSize.Large -> 26.sp }
    val cutPx = with(density) { cut.toPx() }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        // Each kit's name never sets larger than 22% of what its panel holds, so a long word steps down.
        val kitWidth = (maxWidth - (if (middle != null) middleWidth else 0.dp)) / 2
        val fit = with(density) { ((kitWidth - cut - 24.dp) * 0.22f).toSp() }
        // Not under 14 sp here: a name that still doesn't fit steps down word by word (Kit), then takes a second line.
        val name = if (fit < 14.sp) 14.sp else if (fit < nameSize) fit else nameSize
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).heightIn(min = minHeight)) {
            Kit(home, true, homeCut(cutPx), cut, name, labels, lines, Modifier.weight(1f).fillMaxHeight())
            if (middle != null) {
                Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.Center) { middle() }
            }
            Kit(
                away, false, awayCut(cutPx), cut, name, labels, lines,
                Modifier.weight(1f).fillMaxHeight().then(if (middle == null) Modifier.layout { m, c ->
                    // Without anything between them, the away kit tucks under the diagonal, a 7 dp board gap between.
                    val tuck = (cut - 7.dp).roundToPx()
                    val p = m.measure(c.copy(minWidth = c.minWidth + tuck, maxWidth = c.maxWidth + tuck))
                    layout(c.maxWidth, p.height) { p.place(-tuck, 0) }
                } else Modifier),
            )
        }
    }
}

@Composable
private fun Kit(team: Team, home: Boolean, shape: Shape, cut: Dp, nameSize: TextUnit, labels: Boolean, lines: Int, modifier: Modifier) {
    val kit = kitColor(team)
    val ink = kitText(kit)
    Box(
        modifier.clip(shape).background(kit)
            .padding(start = if (home) 14.dp else cut + 10.dp, end = if (home) cut + 8.dp else 14.dp, top = 8.dp, bottom = 8.dp),
        contentAlignment = if (home) Alignment.CenterStart else Alignment.CenterEnd,
    ) {
        Column(horizontalAlignment = if (home) Alignment.Start else Alignment.End, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            if (labels) Text(if (home) "HOME" else "AWAY", style = LfType.label(10.5.sp, ink.copy(alpha = 0.85f), 0.16f))
            // A word never breaks ("THUNDER" beside a score at 320 dp and large text): the name steps down
            // until its longest word fits the panel, wrapping between words.
            WordFitText(
                teamName(team, home).uppercase(), LfType.display(nameSize, ink, 0.92.em),
                min = 9.sp, textAlign = if (home) TextAlign.Start else TextAlign.End, maxLines = lines, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * A card as shown: yellow, red, or the half-and-half second caution, tilted as if just shown, with a
 * real shadow. EVT-12, as the website's: a sin bin is the yellow card with Phosphor's hourglass of the
 * time off on it in dark ink; a second sin bin the half-and-half, the hourglass smaller in its yellow corner.
 */
enum class CardKind { Yellow, Red, Second, SinBin, SecondSinBin }

@Composable
fun CardShape(kind: CardKind, width: Dp = 11.dp, height: Dp = 15.dp, modifier: Modifier = Modifier) {
    val c = colors
    val tilt = when (kind) { CardKind.Yellow, CardKind.SinBin -> -8f; CardKind.Red -> 5f; CardKind.Second, CardKind.SecondSinBin -> -3f }
    val shape = RoundedCornerShape(width * 0.12f)
    Box(
        modifier.size(width, height).rotate(tilt).shadow(if (width > 20.dp) 6.dp else 2.dp, shape).clip(shape)
            .drawBehind {
                when (kind) {
                    CardKind.Yellow, CardKind.SinBin -> drawRect(c.yellow)
                    CardKind.Red -> drawRect(c.red)
                    CardKind.Second, CardKind.SecondSinBin -> {
                        drawRect(c.red)
                        val p = Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(0f, size.height); close() }
                        drawPath(p, c.yellow)
                    }
                }
            },
        contentAlignment = if (kind == CardKind.SecondSinBin) Alignment.TopStart else Alignment.Center,
    ) {
        when (kind) {
            CardKind.SinBin -> PhIcon(Ph.Hourglass, null, size = width * 0.6f, tint = c.onYellow)
            CardKind.SecondSinBin -> PhIcon(Ph.Hourglass, null, size = width * 0.45f, tint = c.onYellow, modifier = Modifier.padding(start = width * 0.1f, top = width * 0.1f))
            else -> {}
        }
    }
}

private val markL = PathParser().parsePathString(LogoShapes.L).toPath()
private val markFive = PathParser().parsePathString(LogoShapes.FIVE).toPath()
private val markFold = PathParser().parsePathString(LogoShapes.FOLD).toPath()
private val logoLine = PathParser().parsePathString(LogoShapes.LINE).toPath()

/**
 * The L5 mark (WEB-25), its colors from where it sits: chalk and mint on a board, all chalk on the
 * grass, ink and pitch green on a panel by day (chalk and mint at night). `height` sets its size.
 */
@Composable
fun LogoMark(height: Dp, modifier: Modifier = Modifier, l: Color? = null, five: Color? = null, fold: Boolean = height >= 24.dp) {
    val c = colors
    val lColor = l ?: c.text
    val fiveColor = five ?: when (c.ground) {
        app.lawfive.ui.theme.Ground.Board -> c.boardAccent
        app.lawfive.ui.theme.Ground.Grass -> c.chalk
        app.lawfive.ui.theme.Ground.Panel -> c.brand
    }
    val foldColor = if (c.ground == app.lawfive.ui.theme.Ground.Board) Color(LogoShapes.BOARD_FOLD) else lerp(fiveColor, Color.Black, 0.38f)
    Canvas(modifier.size(height * (LogoShapes.WIDTH / LogoShapes.HEIGHT), height)) {
        val k = size.height / LogoShapes.HEIGHT
        scale(k, k, pivot = Offset.Zero) {
            drawPath(markL, lColor)
            drawPath(markFive, fiveColor)
            if (fold && c.ground != app.lawfive.ui.theme.Ground.Grass) drawPath(markFold, foldColor)
        }
    }
}

private fun lerp(a: Color, b: Color, t: Float) = androidx.compose.ui.graphics.lerp(a, b, t)

/** The lockup (WEB-25): the mark beside LAWFIVE in black italic, a tapered line in the 5's color under the name. */
@Composable
fun Logo(fontSize: TextUnit = 40.sp, modifier: Modifier = Modifier) {
    val c = colors
    val density = LocalDensity.current
    val em = with(density) { fontSize.toDp() }
    val five = when (c.ground) {
        app.lawfive.ui.theme.Ground.Board -> c.boardAccent
        app.lawfive.ui.theme.Ground.Grass -> c.chalk
        app.lawfive.ui.theme.Ground.Panel -> c.brand
    }
    Row(modifier.semantics { contentDescription = "LawFive" }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(em * 0.24f)) {
        LogoMark(em * 0.95f, five = five)
        Column(Modifier.width(IntrinsicSize.Max), verticalArrangement = Arrangement.spacedBy(em * 0.08f)) {
            Text("LAWFIVE", style = LfType.display(fontSize, c.text, fontSize * 0.8f), modifier = Modifier.padding(end = em * 0.04f))
            Canvas(Modifier.fillMaxWidth().height(em * 0.12f)) {
                scale(size.width / 200f, size.height / 10f, pivot = Offset.Zero) { drawPath(logoLine, five) }
            }
        }
    }
}

/** A figure and the words under it, between chalk rules (the next match's figures). */
@Composable
fun ChalkFigures(figures: List<Pair<String, String>>, modifier: Modifier = Modifier, size: TextUnit = 40.sp) {
    val line = colors.chalkLine
    Column(modifier.fillMaxWidth()) {
        ChalkRule()
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            figures.forEachIndexed { i, (figure, words) ->
                if (i > 0) Box(Modifier.width(Line).fillMaxHeight().background(line))
                Column(Modifier.weight(1f).padding(start = if (i == 0) 2.dp else 12.dp, end = 6.dp, top = 12.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(figure, style = LfType.display(size, colors.text, size * 0.9f), maxLines = 1, overflow = TextOverflow.Clip, softWrap = false)
                    Text(words, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold), maxLines = 2)
                }
            }
        }
        ChalkRule()
    }
}

/** A panel's pitch corners: four quarter arcs in the brand green (DESIGN.md "Panels", `.corner-arcs`). */
fun Modifier.cornerArcs(color: Color, radius: Dp = 18.dp): Modifier = drawBehind {
    val r = radius.toPx()
    val w = 2.dp.toPx()
    val stroke = Stroke(w)
    val d = Size(r * 2 - w, r * 2 - w)
    drawArc(color, 0f, 90f, false, Offset(-r + w / 2, -r + w / 2), d, style = stroke)
    drawArc(color, 90f, 90f, false, Offset(size.width - r + w / 2, -r + w / 2), d, style = stroke)
    drawArc(color, 270f, 90f, false, Offset(-r + w / 2, size.height - r + w / 2), d, style = stroke)
    drawArc(color, 180f, 90f, false, Offset(size.width - r + w / 2, size.height - r + w / 2), d, style = stroke)
}
