package app.lawfive.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lawfive.data.HEAT_MARGIN_LENGTH
import app.lawfive.data.HEAT_MARGIN_WIDTH
import app.lawfive.data.SmoothRing
import app.lawfive.data.Thirds
import app.lawfive.data.heatContours
import app.lawfive.data.thirdStep
import app.lawfive.schema.MatchFormat
import app.lawfive.ui.components.Slab
import app.lawfive.ui.components.FitText
import app.lawfive.ui.components.Segmented
import app.lawfive.ui.components.fixedSp
import app.lawfive.ui.formatPitchSize
import app.lawfive.ui.periodName
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.colors
import kotlinx.serialization.Serializable
import kotlin.math.acos
import kotlin.math.min

// Where on the pitch (TRK-9, WEB-24), as the website's PitchHeatmap draws it, "painted on the grass":
// the time in each cell of the grid the server sends with the track (turned as the match page turns
// it) as six contour bands rising from the grass's green to pale mint (data/Contours.kt, the
// website's contours.ts), under the pitch's chalk markings (scaled from Law 1's) with a thin dark
// edge so they hold on the palest band, the pitch's length and width marked outside the lines, on
// the board; for the match or one period. Always the ground seen from above, never mirrored.

@Serializable
data class Heat(val cols: Int, val rows: Int, val lengthM: Double, val widthM: Double, val total: List<Double>, val periods: List<HeatPeriod> = emptyList())

@Serializable
data class HeatPeriod(val period: Int, val cells: List<Double>)

/** TRK-9: a row under the drawing: the team attacking from the left goal line and from the right, and the periods it's for ("1st half", "P1, P3"). */
data class HeatEnds(val label: String, val left: app.lawfive.schema.Team, val leftHome: Boolean, val right: app.lawfive.schema.Team, val rightHome: Boolean)

/**
 * A match's heatmap on its slab (WEB-28: Where on the pitch, From above, not cut, as Stats'):
 * the periods to choose from (Match, then each), the painted pitch, and which way a team attacked
 * (`attacks`, for the period chosen or the match) beside the key.
 */
@Composable
fun HeatmapCard(heat: Heat, format: MatchFormat?, unit: String, ends: (period: Int?) -> List<HeatEnds> = { emptyList() }, attacks: (period: Int?) -> String?) {
    var period by remember { mutableStateOf<Int?>(null) }
    val cells = period?.let { p -> heat.periods.firstOrNull { it.period == p }?.cells } ?: heat.total
    Slab("Where on the pitch", tag = "From above") {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (format != null && heat.periods.size > 1) {
                // On the narrowest phones the periods share the board's width, "Second half" over two lines in its button, as on the website.
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val narrow = maxWidth < 300.dp
                    Segmented(
                        listOf<Pair<Int?, String>>(null to "Match") + heat.periods.map { it.period to shortPeriodName(format, it.period) }, period, { period = it },
                        if (narrow) Modifier.fillMaxWidth() else Modifier, fill = narrow, wrap = narrow,
                    )
                }
            }
            val described = "Where you spent ${period?.let { p -> format?.let { "the ${periodName(it, p.toLong()).lowercase()}" } } ?: "the match"}, on the pitch"
            PitchHeatmap(heat.cols, heat.rows, cells, unit, described, heat.lengthM, heat.widthM, attacks(period), ends = ends(period))
        }
    }
}

/** On phones "Period 1" is P1 and "Extra time 1" ET1, so the choices fit; halves stay as they are. */
private fun shortPeriodName(format: MatchFormat, period: Int): String = when {
    period > format.periods -> "ET${period - format.periods}"
    format.periods == 2 -> periodName(format, period.toLong())
    else -> "P$period"
}

/** A standard pitch (Law 1), which the markings are scaled from; Stats draws on one. */
private const val STANDARD_LENGTH = 105.0
private const val STANDARD_WIDTH = 68.0

/** Room above and to the left of the drawing for the dimensions, and beyond it on the right and below, in metres. */
private const val ROOM = 9.0

/**
 * The pitch painted on the grass (TRK-9, WEB-24): the ground with flat mowing stripes, the time as
 * contour bands, the chalk markings, the length along the top and the width down the left outside
 * the lines (in metres, or yards with miles), and the key under it (LESS, the ground and the six
 * bands, MORE TIME) with `attacks` on its left. With `thirds` (Stats), the share of the time in each
 * third of the length under the pitch and of the width beside it, lined up with its thirds.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PitchHeatmap(
    cols: Int, rows: Int, cells: List<Double>, unit: String, described: String,
    lengthM: Double = STANDARD_LENGTH, widthM: Double = STANDARD_WIDTH, attacks: String? = null, thirds: Thirds? = null,
    modifier: Modifier = Modifier,
    /** TRK-9: under the drawing, each end's team at its goal line, a row for each way round. */
    ends: List<HeatEnds> = emptyList(),
) {
    val c = colors
    val paint = c.contour
    // The drawing in metres: the pitch with its margins (wider beyond the touchlines, where
    // assistants run), the room for the dimensions above and to the left.
    val w = lengthM * (1 + 2 * HEAT_MARGIN_LENGTH)
    val h = widthM * (1 + 2 * HEAT_MARGIN_WIDTH)
    val viewW = w + ROOM + 1
    val viewH = h + ROOM + 1
    val left = lengthM * HEAT_MARGIN_LENGTH
    val top = widthM * HEAT_MARGIN_WIDTH
    val bands = remember(cells, cols, rows, w, h) { heatContours(cells, cols, rows, w, h) }
    Column(modifier.fillMaxWidth()) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val narrow = maxWidth < 300.dp
            val side = if (thirds == null) 0.dp else if (narrow) 42.dp else 52.dp
            val gap = if (thirds == null) 0.dp else 8.dp
            val drawingW = maxWidth - side - gap
            val k = drawingW / viewW.toFloat()
            val drawingH = k * viewH.toFloat()
            Column {
                Row {
                    // The dimensions' figures fit the room beside the lines: 14 dp, smaller on a narrow drawing.
                    val figure = (k * (ROOM * 0.8).toFloat()).coerceIn(10.dp, 14.dp)
                    PitchDrawing(Modifier.width(drawingW).height(drawingH).semantics { contentDescription = described }, lengthM, widthM, w, h, viewW, bands, unit, figure)
                    if (thirds != null) {
                        Spacer(Modifier.width(gap))
                        Box(Modifier.width(side).height(drawingH).clearAndSetSemantics {}) {
                            FitText("ACROSS", LfType.label(9.5.sp, c.onBoardMuted, 0.08f), Modifier.fillMaxWidth().offset(y = k * (ROOM + top).toFloat() - 18.dp), min = 7.sp, textAlign = TextAlign.Center)
                            Column(Modifier.offset(y = k * (ROOM + top).toFloat()).height(k * widthM.toFloat())) {
                                thirds.width.forEachIndexed { i, share -> Third(share, i > 0, vertical = true, narrow, Modifier.weight(1f)) }
                            }
                        }
                    }
                }
                if (thirds != null) {
                    val start = k * (ROOM + left).toFloat()
                    val length = k * lengthM.toFloat()
                    Row(Modifier.padding(start = start, top = 10.dp).width(length).height(38.dp).clearAndSetSemantics {}) {
                        thirds.length.forEachIndexed { i, share -> Third(share, i > 0, vertical = false, narrow, Modifier.weight(1f)) }
                    }
                    FitText(
                        "TIME IN EACH THIRD OF THE LENGTH", LfType.label(9.5.sp, c.onBoardMuted, 0.08f),
                        Modifier.padding(start = start, top = 8.dp).width(length).clearAndSetSemantics {}, min = 7.sp, textAlign = TextAlign.Center,
                    )
                }
                if (ends.isNotEmpty()) {
                    // Under the drawing, each end at its goal line, as the website's.
                    Column(Modifier.padding(start = k * (ROOM + left).toFloat(), top = 8.dp).width(k * lengthM.toFloat()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        for (e in ends) PitchEndsRow(e)
                    }
                }
            }
        }
        // The key: which way a team attacked on the left, LESS, the ground and the six bands, MORE TIME on the right.
        // Beside each other where the words' longest word fits beside the key, else the words over the key; the
        // bands narrow before LESS or MORE TIME would be cut (320 dp at the larger text sizes).
        val keyStyle = LfType.label(11.sp, c.muted, 0.08f)
        val attackStyle = TextStyle(fontFamily = app.lawfive.ui.theme.Barlow, fontWeight = FontWeight.SemiBold, fontSize = 13.5.sp, lineHeight = 18.sp)
        val measurer = rememberTextMeasurer()
        val density = androidx.compose.ui.platform.LocalDensity.current
        val labels = with(density) { (measurer.measure("LESS", keyStyle).size.width + measurer.measure("MORE TIME", keyStyle).size.width).toDp() }
        val longestWord = with(density) { (attacks?.split(" ")?.maxOfOrNull { measurer.measure(it, attackStyle).size.width } ?: 0).toDp() }
        BoxWithConstraints(Modifier.padding(top = 12.dp).fillMaxWidth()) {
            val bandsRoom = 15.dp * 7 + 2.dp * 6
            val beside = attacks == null || maxWidth - (labels + 20.dp + bandsRoom) - 14.dp >= longestWord + 4.dp
            val band = ((maxWidth - labels - 20.dp - 2.dp * 6) / 7).coerceIn(6.dp, 15.dp)
            val key = @Composable { m: Modifier ->
                Row(m.clearAndSetSemantics {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("LESS", style = keyStyle, maxLines = 1, softWrap = false)
                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        for (b in listOf(paint.ground) + paint.bands) {
                            Box(Modifier.size(band, 12.dp).background(b).border(1.dp, Color.Black.copy(alpha = 0.18f)))
                        }
                    }
                    Text("MORE TIME", style = keyStyle, maxLines = 1, softWrap = false)
                }
            }
            val words = @Composable { m: Modifier ->
                if (attacks != null) Text(attacks, style = attackStyle, color = c.text, modifier = m)
            }
            if (beside) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.End)) {
                if (attacks != null) words(Modifier.weight(1f))
                key(Modifier)
            } else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                words(Modifier)
                key(Modifier.align(Alignment.End))
            }
        }
    }
}

/** TRK-9: a row of the ends: the left team's short name on its color with an arrow to the right, the periods, and the right team's with an arrow to the left. */
@Composable
private fun PitchEndsRow(e: HeatEnds) {
    val left = app.lawfive.ui.teamAlias(e.left, e.right, e.leftHome)
    val right = app.lawfive.ui.teamAlias(e.right, e.left, e.rightHome)
    Row(
        Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "${e.label}: $left attacking left to right, $right attacking right to left" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The teams keep their size at each goal line; the periods between them step down to fit.
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            app.lawfive.ui.components.TeamBadge(e.left, e.right, e.leftHome)
            app.lawfive.ui.components.PhIcon(app.lawfive.ui.components.Ph.Open, size = 18.dp, tint = colors.text)
        }
        FitText(e.label.uppercase(), LfType.label(11.sp, colors.muted, 0.08f), Modifier.weight(1f).padding(horizontal = 6.dp), min = 7.sp, textAlign = TextAlign.Center)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            // Phosphor's ArrowLeft is ArrowRight turned round.
            app.lawfive.ui.components.PhIcon(app.lawfive.ui.components.Ph.Open, size = 18.dp, tint = colors.text, modifier = Modifier.rotate(180f))
            app.lawfive.ui.components.TeamBadge(e.right, e.left, e.rightHome)
        }
    }
}

/** A level's rings as one path on the canvas (`at` places a point in metres), filled even-odd so a ring inside another is a hole. */
private fun ringsPath(rings: List<SmoothRing>, at: (Double, Double) -> Offset): Path = Path().apply {
    fillType = PathFillType.EvenOdd
    for (ring in rings) {
        at(ring.start.x, ring.start.y).let { moveTo(it.x, it.y) }
        for (cu in ring.curves) {
            val a = at(cu.c1.x, cu.c1.y)
            val b = at(cu.c2.x, cu.c2.y)
            val e = at(cu.to.x, cu.to.y)
            cubicTo(a.x, a.y, b.x, b.y, e.x, e.y)
        }
        close()
    }
}

/** The drawing itself, in metres scaled to fit: the grass, the bands, the markings and the dimensions. */
@Composable
private fun PitchDrawing(modifier: Modifier, lengthM: Double, widthM: Double, w: Double, h: Double, viewW: Double, bands: List<List<SmoothRing>>, unit: String, figure: Dp) {
    val c = colors
    val paint = c.contour
    val measurer = rememberTextMeasurer()
    val dimStyle = TextStyle(fontFamily = BarlowCondensed, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic, fontSize = fixedSp(figure), color = c.text)
    val dimText = c.text
    val label = c.surface
    Canvas(modifier) {
        val k = (size.width / viewW).toFloat()
        val left = (lengthM * HEAT_MARGIN_LENGTH).toFloat()
        val top = (widthM * HEAT_MARGIN_WIDTH).toFloat()
        val length = lengthM.toFloat()
        val width = widthM.toFloat()
        val scale = min(lengthM / STANDARD_LENGTH, widthM / STANDARD_WIDTH).toFloat()
        val cx = left + length / 2
        val cy = top + width / 2
        val r = 9.15f * scale
        // Everything in metres from the drawing's top left; the dimensions sit in the room above and to the left.
        fun x(m: Float) = (ROOM.toFloat() + m) * k
        fun y(m: Float) = (ROOM.toFloat() + m) * k
        val ground = RoundRect(Rect(x(0f), y(0f), x(w.toFloat()), y(h.toFloat())), CornerRadius(k))
        val clip = Path().apply { addRoundRect(ground) }
        drawPath(clip, paint.ground)
        clipPath(clip) {
            // Flat mowing stripes, a tenth of the drawing's length each.
            val stripe = w.toFloat() / 10
            for (i in 0 until 5) drawRect(paint.stripe, Offset(x((2 * i + 1) * stripe), y(0f)), Size(stripe * k, h.toFloat() * k))
            val placed = bands.map { rings -> ringsPath(rings) { mx, my -> Offset(x(mx.toFloat()), y(my.toFloat())) } }
            placed.forEachIndexed { i, band -> drawPath(band, paint.bands[i]) }
            val edge = Stroke(0.8.dp.toPx())
            for (band in placed) drawPath(band, paint.line.copy(alpha = 0.5f), style = edge)
        }
        // The markings as one path, so the dark edge under them and the chalk over them match.
        val markings = Path().apply {
            addRect(Rect(x(left), y(top), x(left + length), y(top + width)))
            moveTo(x(cx), y(top)); lineTo(x(cx), y(top + width))
            addOval(Rect(Offset(x(cx), y(cy)), r * k))
            for ((depth, span) in listOf(16.5f to 40.32f, 5.5f to 18.32f)) {
                val d = depth * scale
                val s = min(span * scale, width)
                moveTo(x(left), y(top + (width - s) / 2)); lineTo(x(left + d), y(top + (width - s) / 2)); lineTo(x(left + d), y(top + (width + s) / 2)); lineTo(x(left), y(top + (width + s) / 2))
                moveTo(x(left + length), y(top + (width - s) / 2)); lineTo(x(left + length - d), y(top + (width - s) / 2)); lineTo(x(left + length - d), y(top + (width + s) / 2)); lineTo(x(left + length), y(top + (width + s) / 2))
            }
            // The arcs at the penalty areas (the D), outside the areas only.
            val dx = 5.5f * scale
            if (dx < r) {
                val turn = Math.toDegrees(acos((dx / r).toDouble())).toFloat()
                arcTo(Rect(Offset(x(left + 11 * scale), y(cy)), r * k), -turn, 2 * turn, true)
                arcTo(Rect(Offset(x(left + length - 11 * scale), y(cy)), r * k), 180 + turn, -2 * turn, true)
            }
        }
        drawPath(markings, paint.case.copy(alpha = 0.38f), style = Stroke(3.4.dp.toPx(), join = StrokeJoin.Round))
        drawPath(markings, c.chalk.copy(alpha = paint.chalk), style = Stroke(1.7.dp.toPx()))
        val spot = c.chalk.copy(alpha = paint.chalk)
        drawCircle(spot, 0.65f * k, Offset(x(cx), y(cy)))
        drawCircle(spot, 0.5f * k, Offset(x(left + 11 * scale), y(cy)))
        drawCircle(spot, 0.5f * k, Offset(x(left + length - 11 * scale), y(cy)))
        // The dimensions, outside the lines: the length along the top, the width down the left.
        val dimsAt = -5f
        val tick = 1.6f
        val line = Stroke(1.dp.toPx())
        val dims = Path().apply {
            moveTo(x(left), y(top)); lineTo(x(left), y(dimsAt - tick))
            moveTo(x(left + length), y(top)); lineTo(x(left + length), y(dimsAt - tick))
            moveTo(x(left), y(dimsAt)); lineTo(x(left + length), y(dimsAt))
            moveTo(x(left), y(top)); lineTo(x(dimsAt - tick), y(top))
            moveTo(x(left), y(top + width)); lineTo(x(dimsAt - tick), y(top + width))
            moveTo(x(dimsAt), y(top)); lineTo(x(dimsAt), y(top + width))
        }
        drawPath(dims, dimText.copy(alpha = 0.6f), style = line)
        val ticks = Path().apply {
            for ((tx, ty) in listOf(left to dimsAt, left + length to dimsAt, dimsAt to top, dimsAt to top + width)) {
                moveTo(x(tx - tick), y(ty + tick)); lineTo(x(tx + tick), y(ty - tick))
            }
        }
        drawPath(ticks, dimText, style = Stroke(1.6.dp.toPx()))
        val pad = 8.dp.toPx()
        fun figure(text: String, at: Offset, turned: Boolean) {
            val laid = measurer.measure(text, dimStyle)
            val tw = laid.size.width.toFloat()
            val th = laid.size.height.toFloat()
            rotate(if (turned) -90f else 0f, at) {
                drawRect(label, Offset(at.x - tw / 2 - pad, at.y - th / 2), Size(tw + 2 * pad, th))
                drawText(laid, topLeft = Offset(at.x - tw / 2, at.y - th / 2))
            }
        }
        figure(formatPitchSize(lengthM, unit), Offset(x(cx), y(dimsAt)), false)
        figure(formatPitchSize(widthM, unit), Offset(x(dimsAt), y(cy)), true)
    }
}

/**
 * A third's share in the heatmap's own bands, a board line between it and the one before: chalk
 * figures, board-black on the three palest bands by day (at night the bands are dim, so all chalk).
 */
@Composable
private fun Third(share: Int, rule: Boolean, vertical: Boolean, narrow: Boolean, modifier: Modifier) {
    val step = thirdStep(share)
    val c = colors
    val size: Dp = if (narrow) 16.dp else 20.dp
    Box(
        modifier.then(if (vertical) Modifier.fillMaxWidth() else Modifier.fillMaxHeight())
            .then(if (rule) Modifier.padding(start = if (vertical) 0.dp else 3.dp, top = if (vertical) 3.dp else 0.dp) else Modifier)
            .background(c.contour.bands[step - 1]),
        contentAlignment = Alignment.Center,
    ) {
        val ink = if (step >= 4 && !c.dark) Color(0xFF0E1311) else c.chalk
        Text("$share%", style = LfType.display(fixedSp(size), ink, fixedSp(size)), maxLines = 1, softWrap = false, modifier = Modifier.padding(end = 1.dp))
    }
}
