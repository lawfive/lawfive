package app.lawfive.wear

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// The watch's look (WCH-6): as the Garmin app: white on black, the LawFive green circle behind each
// menu row's Phosphor icon, the match's own colors; Barlow Condensed for figures, as on the phone.

val Barlow = FontFamily(
    Font(R.font.barlow_regular, FontWeight.Normal), Font(R.font.barlow_medium, FontWeight.Medium),
    Font(R.font.barlow_semibold, FontWeight.SemiBold), Font(R.font.barlow_bold, FontWeight.Bold),
)
val BarlowCondensed = FontFamily(Font(R.font.barlow_condensed_bold, FontWeight.Bold))

object C {
    val text = Color.White
    val dim = Color(0xFFAAAAAA)
    val rule = Color(0xFF555555)
    val row = Color(0xFF1D2321)
    val brand = Color(0xFF2FAE7A)
    val start = Color(0xFF00AA44)
    val stoppage = Color(0xFFFF8800)
    val breakBlue = Color(0xFF55AAFF)
    val ringTrack = Color(0xFF2A2A2A)
    val yellow = Color(0xFFF5C400)
    val red = Color(0xFFE5484D)
    val coin = Color(0xFFD9A92C)
    val coinEdge = Color(0xFF8A6508)
    val coinInk = Color(0xFF5F4503)
    /** UI-10: the kit of a team without a color, the board's blank. */
    val blank = Color(0xFF3A403D)
}

fun teamColor(value: Int): Color? = if (value < 0) null else Color(0xFF000000 or value.toLong())
/** UI-10: black or white, whichever has the higher WCAG contrast ratio against the color. */
fun onColor(value: Color): Color = value.luminance().let { if ((it + 0.05f) / 0.05f >= 1.05f / (it + 0.05f)) Color.Black else Color.White }
/** UI-10: a color too dark to stand out from the black screen (contrast below 1.5:1) gets a thin gray edge. */
fun needsOutline(value: Color): Boolean = (value.luminance() + 0.05f) / 0.05f < 1.5f

@Composable
fun T(
    text: String, size: TextUnit = 15.sp, color: Color = C.text, weight: FontWeight = FontWeight.Medium, modifier: Modifier = Modifier, figure: Boolean = false,
    center: Boolean = true, lines: Int = Int.MAX_VALUE,
) {
    BasicText(
        text, modifier,
        style = TextStyle(
            color = color, fontSize = size, fontWeight = if (figure) FontWeight.Bold else weight, fontFamily = if (figure) BarlowCondensed else Barlow,
            textAlign = if (center) TextAlign.Center else TextAlign.Start, fontFeatureSettings = "tnum",
        ),
        maxLines = lines, overflow = TextOverflow.Ellipsis,
    )
}

/**
 * WCH-9: a swipe right goes back, through the same path as the Back key, as the system's own gesture is
 * off for the match screen's swipes. A sideways drag is taken before the rows see it, so it's never a tap.
 */
@Composable
fun Modifier.swipeBack(): Modifier {
    val back = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    val distance = with(LocalDensity.current) { 36.dp.toPx() }
    return pointerInput(back) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            var sideways = false
            var pressed = true
            var dx = 0f
            while (pressed) {
                val change = awaitPointerEvent(PointerEventPass.Initial).changes.firstOrNull { it.id == down.id } ?: break
                val moved = change.position - down.position
                dx = moved.x
                if (abs(moved.x) > viewConfiguration.touchSlop && abs(moved.x) > abs(moved.y)) sideways = true
                if (sideways) change.consume()
                pressed = change.pressed
            }
            if (sideways && dx > distance) back?.onBackPressed()
        }
    }
}

/**
 * UI-25: the time of day as the watch is set to show it: small at the top of menus and lists, which pass
 * under it, and at the very bottom of every other screen, as low as it fits inside the screen's edge.
 */
@Composable
fun TimeOfDay(bottom: Boolean = false) {
    val context = LocalContext.current
    val format = remember { android.text.format.DateFormat.getTimeFormat(context) }
    var text by remember { mutableStateOf(format.format(java.util.Date())) }
    LaunchedEffect(Unit) {
        while (true) {
            text = format.format(java.util.Date())
            delay(5_000)
        }
    }
    if (bottom) {
        val round = androidx.compose.ui.platform.LocalConfiguration.current.isScreenRound
        val size = (androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp * 0.05f).sp
        androidx.compose.ui.layout.Layout({ T(text, size, C.dim, FontWeight.Medium, lines = 1) }, Modifier.fillMaxSize()) { measurables, constraints ->
            val p = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
            val w = constraints.maxWidth
            val h = constraints.maxHeight
            val margin = h * 0.012f + 1
            // The text's lower corners just inside the circle; the line's descent may hang below.
            val edge = if (round) {
                val r = h / 2f - margin
                val half = p.width / 2f
                h / 2f + kotlin.math.sqrt(r * r - half * half)
            } else h - margin
            layout(w, h) { p.place((w - p.width) / 2, (edge - p.height * 0.82f).toInt()) }
        }
        return
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Box(Modifier.padding(top = 6.dp).background(Color.Black, RoundedCornerShape(8.dp)).padding(horizontal = 6.dp)) {
            T(text, 12.sp, C.dim, FontWeight.Medium, lines = 1)
        }
    }
}

/** A scrolling list for a round screen, turned by the crown or bezel too, with room at top and bottom. */
@Composable
fun WatchList(title: String? = null, titleTeam: Int = -1, titleColor: Int = -1, content: LazyListScope.() -> Unit) {
    val state = rememberLazyListState()
    val focus = remember { FocusRequester() }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { focus.requestFocus() }
    LazyColumn(
        Modifier.fillMaxSize().background(Color.Black)
            .onRotaryScrollEvent { scope.launch { state.scrollBy(it.verticalScrollPixels) }; true }
            .focusRequester(focus).focusable(),
        state = state, contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 28.dp, bottom = 44.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp), horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (title != null) {
            // UI-10: a team's menus have it as a lone kit, cut on the side that meets the other team.
            item { if (titleTeam >= 0) Kit(title, titleColor, titleTeam, 16.sp, Modifier.padding(bottom = 4.dp)) else T(title, 16.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp), lines = 2) }
        }
        content()
    }
}

/** A menu row: an optional icon on a green circle (UI-18) or a team color's swatch (SET-14), a label and a muted line. */
@Composable
fun MenuRow(label: String, sub: String? = null, icon: Int? = null, fill: Color? = null, textColor: Color = C.text, swatch: Int? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(if (sub != null) 54.dp else 48.dp).background(fill ?: C.row, RoundedCornerShape(24.dp))
            // Far enough in that the label clears a round screen's curve on the lower rows.
            .clickable(onClick = onClick).padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Box(Modifier.size(28.dp).background(C.brand, CircleShape), contentAlignment = Alignment.Center) {
                Image(painterResource(icon), null, Modifier.size(18.dp), colorFilter = ColorFilter.tint(Color.Black))
            }
            Spacer(Modifier.width(9.dp))
        }
        if (swatch != null) {
            Swatch(swatch)
            Spacer(Modifier.width(10.dp))
        }
        Column(Modifier.weight(1f)) {
            T(label, 14.5.sp, textColor, FontWeight.SemiBold, center = false, lines = 1)
            if (sub != null) T(sub, 12.sp, if (fill != null) textColor else C.dim, FontWeight.Normal, center = false, lines = 1)
        }
    }
}

/** SET-14: a team color's square, outlined so black shows; None is the outline with a slash. */
@Composable
fun Swatch(color: Int) {
    val shape = RoundedCornerShape(5.dp)
    Box(Modifier.size(22.dp).background(teamColor(color) ?: Color.Transparent, shape).border(1.5.dp, C.dim, shape).drawBehind {
        if (color < 0) drawLine(C.dim, Offset(size.width * 0.2f, size.height * 0.8f), Offset(size.width * 0.8f, size.height * 0.2f), 1.5.dp.toPx())
    })
}

/** SET-14: the colors Create match offers, the same as the Garmin watch's; any other is the phone's own. */
val teamColorChoices = listOf(-1 to "None", 0x000000 to "Black", 0xFFFFFF to "White", 0xD71920 to "Red", 0xFF7A00 to "Orange", 0xFFD100 to "Yellow", 0x00A651 to "Green", 0x0057B8 to "Blue", 0x6A2C91 to "Purple")

fun colorName(color: Int) = teamColorChoices.firstOrNull { it.first == color }?.second ?: "Custom"

@Composable
fun ToggleRow(label: String, on: Boolean, sub: String? = null, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(if (sub != null) 54.dp else 48.dp).background(C.row, RoundedCornerShape(24.dp))
            .clickable { onChange(!on) }.padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            T(label, 14.5.sp, weight = FontWeight.SemiBold, center = false, lines = 1)
            if (sub != null) T(sub, 12.sp, C.dim, FontWeight.Normal, center = false, lines = 1)
        }
        Box(Modifier.width(34.dp).height(20.dp).background(if (on) C.brand else C.rule, RoundedCornerShape(10.dp)).padding(3.dp), contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(14.dp).background(Color.White, CircleShape))
        }
    }
}

/** UI-13: the large green button. */
@Composable
fun PillButton(label: String, color: Color = C.start, textColor: Color = Color.White, width: Dp = 120.dp, onClick: () -> Unit) {
    Box(Modifier.width(width).height(44.dp).background(color, RoundedCornerShape(22.dp)).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        T(label, 16.sp, textColor, FontWeight.SemiBold, lines = 1)
    }
}

/** UI-7. */
@Composable
fun ConfirmScreen(question: String, detail: String? = null, yes: String = "Yes", danger: Boolean = false, onYes: () -> Unit, onNo: () -> Unit) {
    Column(Modifier.fillMaxSize().background(Color.Black).padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        T(question, 18.sp, weight = FontWeight.SemiBold)
        if (detail != null) T(detail, 13.sp, C.dim, FontWeight.Normal, Modifier.padding(top = 4.dp))
        Spacer(Modifier.height(14.dp))
        PillButton(yes, if (danger) C.red else C.start, onClick = onYes)
        Spacer(Modifier.height(6.dp))
        PillButton("No", C.row, onClick = onNo)
    }
}

/** The screen's own size, to place things as fractions of it, as the Garmin watch does (UI-1). */
@Composable
fun Face(modifier: Modifier = Modifier, content: @Composable BoxWithConstraintsScope.() -> Unit) {
    BoxWithConstraints(modifier.fillMaxSize().background(Color.Black), content = content)
}

/** UI-10: how far a kit's cut leans either way of its edge, as a share of its height. */
const val KIT_SLANT = 0.21f

/**
 * UI-10: a kit, a box with the edge that meets the other team (home's right, away's left) cut on one diagonal
 * leaning as "/": 0.21 of its height past the box at the top and short of it at the bottom. Two side by side,
 * a little apart, share the one diagonal.
 */
class KitShape(private val team: Int) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val d = size.height * KIT_SLANT
        val path = Path().apply {
            if (team == AWAY) {
                moveTo(d, 0f); lineTo(size.width, 0f); lineTo(size.width, size.height); lineTo(-d, size.height)
            } else {
                moveTo(0f, 0f); lineTo(size.width + d, 0f); lineTo(size.width - d, size.height); lineTo(0f, size.height)
            }
            close()
        }
        return Outline.Generic(path)
    }
}

/** UI-10: a kit's height for its text size: the mockups' 46 for 36. */
@Composable
fun kitHeight(size: TextUnit): Dp = with(LocalDensity.current) { size.toDp() * 1.28f }

/**
 * UI-10: a team (or its score) as its kit: its color, or the board's blank without one, the name upright in the
 * middle in black or white, a thin gray edge on a color too dark for the screen. [team] says which edge is cut.
 * UI-11: [dot] puts the white dot above it, over the name, for the team chosen to kick off.
 */
@Composable
fun Kit(name: String, color: Int, team: Int, size: TextUnit, modifier: Modifier = Modifier, dot: Boolean = false) {
    val fill = teamColor(color) ?: C.blank
    val shape = KitShape(team)
    val height = kitHeight(size)
    Box(
        modifier.height(height)
            .drawBehind { if (dot) drawCircle(Color.White, this.size.height * 0.17f, Offset(this.size.width / 2, -this.size.height * 0.37f)) }
            .background(fill, shape)
            .then(if (needsOutline(fill)) Modifier.border(1.dp, C.dim, shape) else Modifier)
            .padding(horizontal = height * 0.36f),
        contentAlignment = Alignment.Center,
    ) { T(name, size, onColor(fill), FontWeight.SemiBold, lines = 1) }
}

/** UI-10: the two teams as kits of the same width (the wider's), cut on the one diagonal between them. */
@Composable
fun KitPair(names: List<String>, colors: List<Int>, size: TextUnit, chosen: Int = -1) {
    Row(Modifier.width(IntrinsicSize.Max), horizontalArrangement = Arrangement.spacedBy(kitHeight(size) * 0.11f)) {
        Kit(names[HOME], colors[HOME], HOME, size, Modifier.weight(1f), dot = chosen == HOME)
        Kit(names[AWAY], colors[AWAY], AWAY, size, Modifier.weight(1f), dot = chosen == AWAY)
    }
}
