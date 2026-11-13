package app.lawfive.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.lawfive.R
import app.lawfive.schema.Team
import app.lawfive.ui.initials
import app.lawfive.ui.kitVanishes
import app.lawfive.ui.parseColour
import app.lawfive.ui.teamAlias
import app.lawfive.ui.textOn
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import app.lawfive.ui.theme.LfType
import app.lawfive.ui.theme.OnPanel
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.em

// The building blocks (DESIGN.md "Components"), as the web app has them.

/** Phosphor icons (regular), by the web app's names (tools/icons.mts makes the drawables). */
enum class Ph(@DrawableRes val res: Int) {
    Matches(R.drawable.ph_matches), Templates(R.drawable.ph_templates), Venues(R.drawable.ph_venues), Referees(R.drawable.ph_referees),
    Competitions(R.drawable.ph_competitions), People(R.drawable.ph_people), Plus(R.drawable.ph_plus), Back(R.drawable.ph_back),
    Next(R.drawable.ph_next), Chevron(R.drawable.ph_chevron), Close(R.drawable.ph_close), Edit(R.drawable.ph_edit), Trash(R.drawable.ph_trash),
    Pause(R.drawable.ph_pause), Injury(R.drawable.ph_injury), Flag(R.drawable.ph_flag), Out(R.drawable.ph_out), Search(R.drawable.ph_search),
    Map(R.drawable.ph_map), Pin(R.drawable.ph_pin), Watch(R.drawable.ph_watch), Settings(R.drawable.ph_settings), More(R.drawable.ph_more),
    Check(R.drawable.ph_check), Stats(R.drawable.ph_stats), Quiz(R.drawable.ph_quiz), Restart(R.drawable.ph_restart), Download(R.drawable.ph_download), Play(R.drawable.ph_play), Mail(R.drawable.ph_mail),
    Qr(R.drawable.ph_qr), Mobile(R.drawable.ph_mobile), Undo(R.drawable.ph_undo), Link(R.drawable.ph_link), Copy(R.drawable.ph_copy), Share(R.drawable.ph_share), Clock(R.drawable.ph_clock), Calendar(R.drawable.ph_calendar),
    Info(R.drawable.ph_info), Help(R.drawable.ph_help), Hourglass(R.drawable.ph_hourglass), Merge(R.drawable.ph_merge), Upload(R.drawable.ph_upload), Report(R.drawable.ph_report), Camera(R.drawable.ph_camera),
    Photos(R.drawable.ph_photos), Portrait(R.drawable.ph_portrait), Phone(R.drawable.ph_phone), Globe(R.drawable.ph_globe), Plan(R.drawable.ph_plan),
    Directions(R.drawable.ph_directions), Bell(R.drawable.ph_bell), BellOff(R.drawable.ph_bell_off), Sync(R.drawable.ph_sync), Eye(R.drawable.ph_eye), EyeOff(R.drawable.ph_eye_off),
    Money(R.drawable.ph_money), Sun(R.drawable.ph_sun), Moon(R.drawable.ph_moon), Cloud(R.drawable.ph_cloud), CloudSun(R.drawable.ph_cloud_sun),
    CloudMoon(R.drawable.ph_cloud_moon), CloudRain(R.drawable.ph_cloud_rain), CloudSnow(R.drawable.ph_cloud_snow), CloudFog(R.drawable.ph_cloud_fog),
    CloudLightning(R.drawable.ph_cloud_lightning), Wind(R.drawable.ph_wind), Thermometer(R.drawable.ph_thermometer),
    Tag(R.drawable.ph_tag), Hash(R.drawable.ph_hash), Note(R.drawable.ph_note), Role(R.drawable.ph_role), Message(R.drawable.ph_message),
    Assignor(R.drawable.ph_assignor), Palette(R.drawable.ph_palette), Crop(R.drawable.ph_crop), Turn(R.drawable.ph_turn),
    Distance(R.drawable.ph_distance), Heart(R.drawable.ph_heart), Sprint(R.drawable.ph_sprint), Speed(R.drawable.ph_speed), Open(R.drawable.ph_open),
}

@Composable
fun PhIcon(icon: Ph, contentDescription: String? = null, size: Dp = 20.dp, tint: Color = colors.text, modifier: Modifier = Modifier) {
    Icon(painterResource(icon.res), contentDescription, modifier.size(size), tint = tint)
}

/**
 * A chalk panel (DESIGN.md "Panels"): chalk with ink by day, a dark slab with a 1 dp edge at night,
 * 6 dp corners and a hard 3 dp drop by day; what's in it takes the panel's colors.
 */
@Composable
fun LfCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    OnPanel {
        val c = colors
        val shape = RoundedCornerShape(6.dp)
        Column(
            modifier
                .fillMaxWidth()
                .hardDrop(c.panelShadow, shape)
                .clip(shape)
                .background(c.surface)
                .then(if (c.dark) Modifier.border(1.dp, c.panelEdge, shape) else Modifier)
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
            content = content,
        )
    }
}

/** A fact on a page: an icon, a small label and the value; a value with `tone` shows as a chip (your role). `wide` is kept for callers; each fact takes its own row. */
data class Fact(val icon: Ph, val label: String, val value: String, val wide: Boolean = false, val tone: ChipTone? = null, val lines: List<FactLine>? = null)

/** A line of a fact with several (the Watch fact, SYNC-14): plain, amber for something to do, or muted. */
data class FactLine(val text: String, val tone: ChipTone? = null)

/** Facts in a chalk panel (a match's, a venue's, a referee's). */
@Composable
fun FactsCard(facts: List<Fact>) {
    LfCard { Facts(facts) }
}

/**
 * A page's facts as rows divided by hairlines (DESIGN.md "Facts"): a muted icon beside a small
 * JetBrains Mono label over its value, so the value has the panel's width, as the website's on a phone.
 */
@Composable
fun Facts(facts: List<Fact>, modifier: Modifier = Modifier, divideFirst: Boolean = false) {
    Column(modifier) {
        facts.forEachIndexed { i, f ->
            if (i > 0 || divideFirst) HorizontalDivider(color = colors.border, modifier = Modifier.padding(horizontal = 16.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.Top) {
                PhIcon(f.icon, size = 18.dp, tint = colors.muted, modifier = Modifier.padding(top = 1.dp))
                Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(f.label.uppercase(), style = LfType.label(11.sp, colors.muted, 0.12f))
                    if (f.lines != null) for (l in f.lines) Text(
                        l.text, style = androidx.compose.material3.MaterialTheme.typography.bodyLarge.copy(fontWeight = if (l.tone == ChipTone.Plain) FontWeight.Normal else FontWeight.SemiBold),
                        color = when (l.tone) { ChipTone.Amber -> colors.amberText; ChipTone.Plain -> colors.muted; else -> colors.text },
                    )
                    else if (f.tone != null) Chip(f.value, f.tone)
                    else Text(f.value, style = androidx.compose.material3.MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold))
                }
            }
        }
    }
}

/**
 * A section's heading on the grass (DESIGN.md "A group's label"): black italic capitals in chalk with
 * a faint chalk line running on from them to the edge, any action at the right. `small` is a section
 * inside a form: small JetBrains Mono capitals.
 */
@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, small: Boolean = false, action: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(top = if (small) 20.dp else 26.dp, bottom = if (small) 8.dp else 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (small) {
            Text(text.uppercase(), style = androidx.compose.material3.MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        } else {
            Text(text.uppercase(), style = LfType.display(26.sp, colors.text, 26.sp), modifier = Modifier.padding(end = 12.dp))
            Box(Modifier.weight(1f).height(3.dp).background(colors.chalkFaint))
        }
        if (action != null) Box(Modifier.padding(start = 12.dp)) { action() }
    }
}

/** A row in a card: an avatar or icon, a title, a muted line, and something on the right. */
@Composable
fun ListRow(
    title: String,
    sub: String? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    divider: Boolean = true,
    onClick: (() -> Unit)? = null,
) {
    Column {
        if (divider) HorizontalDivider(color = colors.border, thickness = 1.dp)
        Row(
            Modifier
                .fillMaxWidth()
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .padding(horizontal = 16.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            leading?.invoke()
            Column(Modifier.weight(1f)) {
                Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                // Whole, however narrow the phone or large its text: a setting's line says what it does.
                if (sub != null) Text(sub, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
            }
            trailing?.invoke(this)
        }
    }
}

/**
 * An avatar (DESIGN.md "Avatars"): initials in condensed capitals on the board's near black, round; a
 * record's icon on a board tile with the panel's corners.
 */
@Composable
fun Avatar(text: String? = null, icon: Ph? = null, background: Color = colors.board, foreground: Color = colors.onBoard, size: Dp = 38.dp) {
    val shape = if (icon != null) RoundedCornerShape(6.dp) else CircleShape
    val c = colors
    Box(
        Modifier.size(size).clip(shape).background(background).then(if (c.dark && background == c.board) Modifier.border(1.dp, c.boardEdge, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        // Initials and icon grow with it (15 sp and 19 dp in the usual 38 dp).
        if (icon != null) PhIcon(icon, size = size * 0.5f, tint = foreground)
        else Text(text?.uppercase() ?: "", style = LfType.word((size.value * 0.4f).sp, foreground), maxLines = 1)
    }
}

@Composable
fun NameAvatar(name: String) = Avatar(text = initials(name))

enum class ChipTone { Plain, Brand, Amber, Red, Blue }

/** A small painted tag (DESIGN.md "Chips"): 4 dp corners, condensed bold capitals, always panel-colored so it reads on the grass too. */
@Composable
fun Chip(text: String, tone: ChipTone = ChipTone.Plain, modifier: Modifier = Modifier) {
    OnPanel {
        val (bg, fg) = when (tone) {
            ChipTone.Plain -> colors.surface2 to colors.muted
            ChipTone.Brand -> colors.brand to colors.onBrand
            ChipTone.Amber -> colors.amberSoft to colors.amberText
            ChipTone.Red -> colors.redSoft to colors.redText
            ChipTone.Blue -> colors.blueSoft to colors.blueText
        }
        Text(
            text.uppercase(),
            modifier
                .clip(RoundedCornerShape(4.dp))
                .background(bg)
                .then(if (tone == ChipTone.Plain) Modifier.border(1.dp, colors.border, RoundedCornerShape(4.dp)) else Modifier)
                .padding(horizontal = 7.dp, vertical = 2.dp),
            style = LfType.word(13.sp, fg, FontWeight.Bold),
            maxLines = 1,
        )
    }
}

/** The team's short name on its color, as on the watch (SET-5: from both teams' names when none was typed). */
@Composable
fun TeamBadge(team: Team, other: Team, home: Boolean, large: Boolean = false) {
    val colour = parseColour(team.colour)
    val bg = colour ?: colors.surface2
    val fg = colour?.let { textOn(it) } ?: colors.text
    val edge = colour == null || kitVanishes(colour, colors.dark)
    Box(
        Modifier
            .widthIn(min = if (large) 64.dp else 42.dp)
            .height(if (large) 36.dp else 24.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(bg)
            .then(if (edge) Modifier.border(1.dp, colors.border, RoundedCornerShape(4.dp)) else Modifier)
            .padding(horizontal = if (large) 10.dp else 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(teamAlias(team, other, home), color = fg, fontFamily = BarlowCondensed, fontWeight = FontWeight.ExtraBold, fontStyle = FontStyle.Italic, fontSize = if (large) 19.sp else 15.sp, letterSpacing = 0.04.em, maxLines = 1)
    }
}

/**
 * The one that does it (DESIGN.md "Buttons"): a slab in the brand color with a hard 3 dp board-black
 * drop, its words the board's (condensed extra-bold capitals): chalk with board words on the grass,
 * green with white on a panel. `danger` is the one red button.
 */
@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: Ph? = null, enabled: Boolean = true, danger: Boolean = false) {
    val shape = RoundedCornerShape(6.dp)
    val container = if (danger) colors.redStrong else colors.brand
    val content = if (danger) Color.White else colors.onBrand
    Button(
        onClick, modifier.height(44.dp).then(if (enabled) Modifier.hardDrop(colors.board, shape) else Modifier), enabled = enabled, shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = container, contentColor = content,
            disabledContainerColor = colors.surface2, disabledContentColor = colors.muted,
        ),
        contentPadding = PaddingValues(horizontal = 16.dp),
    ) {
        if (icon != null) {
            PhIcon(icon, size = 18.dp, tint = if (!enabled) colors.muted else content)
            Spacer(Modifier.width(7.dp))
        }
        ButtonWords(text)
    }
}

/**
 * A button's words on one line, stepping down in size where the button is too narrow for them (a
 * phone at its larger text sizes, 320 dp wide), so a word is never cut.
 */
@Composable
private fun ButtonWords(text: String) {
    val style = androidx.compose.material3.MaterialTheme.typography.labelLarge
    Text(
        text.uppercase(), style = style, maxLines = 1, softWrap = false,
        autoSize = androidx.compose.foundation.text.TextAutoSize.StepBased(minFontSize = 10.sp, maxFontSize = style.fontSize, stepSize = 0.5.sp),
    )
}

/** A plain button: a 2 dp outline in the field color (a chalk outline on the grass), the board's words. */
@Composable
fun SecondaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: Ph? = null, enabled: Boolean = true, danger: Boolean = false) {
    OutlinedButton(
        onClick, modifier.height(44.dp), enabled = enabled, shape = RoundedCornerShape(6.dp),
        border = BorderStroke(2.dp, if (enabled) colors.borderInput else colors.border),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = colors.field, contentColor = if (danger) colors.redText else colors.text, disabledContentColor = colors.muted),
        contentPadding = PaddingValues(horizontal = 14.dp),
    ) {
        if (icon != null) {
            PhIcon(icon, size = 18.dp, tint = if (!enabled) colors.muted else if (danger) colors.redText else colors.text)
            Spacer(Modifier.width(7.dp))
        }
        ButtonWords(text)
    }
}

/** A ghost button: the board's words in the brand color, no outline. */
@Composable
fun LinkButton(text: String, onClick: () -> Unit) {
    TextButton(onClick, contentPadding = PaddingValues(horizontal = 6.dp), shape = RoundedCornerShape(6.dp)) {
        Text(text.uppercase(), color = colors.brand, style = androidx.compose.material3.MaterialTheme.typography.labelLarge.copy(fontSize = 16.sp))
    }
}

/** An empty list: its picture, faint, behind what it's for and a way to add the first (WEB-4, WEB-17). */
@Composable
fun EmptyState(picture: EmptyPicture, title: String, text: String, action: (@Composable () -> Unit)? = null) {
    val c = colors
    if (c.ground == app.lawfive.ui.theme.Ground.Grass) {
        // WEB-17, WEB-24: on the grass, the message inside the center circle in chalk, the circle large
        // enough to hold it, and the halfway line running out from it to the touchlines, stopping at it
        // so no chalk runs through the words.
        // On a narrow phone or at the larger text sizes the words alone go in the circle, the circle growing
        // to hold them, and the buttons under it on the grass, so no chalk crosses a word or a button.
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxWidth().padding(vertical = 18.dp), contentAlignment = Alignment.Center) {
            val diameter = if (maxWidth < 360.dp) maxWidth else 360.dp
            val inside = maxWidth >= 360.dp && androidx.compose.ui.platform.LocalDensity.current.fontScale <= 1.15f
            val density = androidx.compose.ui.platform.LocalDensity.current
            var words by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
            val held = with(density) { kotlin.math.hypot(words.width / 2f, words.height / 2f).toDp() } + 10.dp
            val radius = if (inside || held < diameter / 2) diameter / 2 else held
            val line = c.chalkLine
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = radius * 2), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.matchParentSize().bleed(PagePad - Touchline - Line)) {
                        val r = radius.toPx() - Line.toPx() / 2
                        drawCircle(line, r, center, style = Stroke(Line.toPx()))
                        if (center.x - r > 0f) {
                            drawLine(line, Offset(0f, center.y), Offset(center.x - r, center.y), Line.toPx())
                            drawLine(line, Offset(center.x + r, center.y), Offset(size.width, center.y), Line.toPx())
                        }
                    }
                    Column(
                        Modifier.widthIn(max = diameter * 0.74f).padding(vertical = 24.dp).onSizeChanged { words = it },
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        if (picture != EmptyPicture.Center) {
                            Canvas(Modifier.padding(bottom = 2.dp).size(96.dp, 74.dp)) { drawEmptyPicture(picture, c.chalk.copy(alpha = 0.55f)) }
                        }
                        Text(title.uppercase(), style = LfType.display(30.sp, c.text, 29.sp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        Text(text, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = c.chalk.copy(alpha = 0.8f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        if (action != null && inside) {
                            Box(Modifier.padding(top = 8.dp)) { action() }
                        }
                    }
                }
                if (action != null && !inside) {
                    Box(Modifier.padding(top = 14.dp)) { action() }
                }
            }
        }
        return
    }
    val line = colors.brand.copy(alpha = if (colors.dark) 0.12f else 0.09f)
    Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = 240.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.matchParentSize()) {
            val r = size.minDimension * 0.32f
            drawCircle(line, r, center, style = Stroke(2.dp.toPx()))
            drawLine(line, Offset(0f, center.y), Offset(size.width, center.y), 2.dp.toPx())
            drawCircle(line, 4.dp.toPx(), center)
        }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (picture != EmptyPicture.Center) {
                val ink = colors.brand.copy(alpha = if (colors.dark) 0.55f else 0.45f)
                Canvas(Modifier.padding(bottom = 6.dp).size(120.dp, 93.dp)) { drawEmptyPicture(picture, ink) }
            }
            Text(title.uppercase(), style = LfType.display(24.sp, colors.text), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Text(text, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.widthIn(max = 320.dp))
            if (action != null) {
                Box(Modifier.padding(top = 10.dp)) { action() }
            }
        }
    }
}

/** WEB-17: the picture above an empty list's words, as the web's (`EmptyPictures` in ui.tsx), with the same coordinates. Matches have only the lines behind. */
enum class EmptyPicture { Center, Venue, Crew, Bracket, Format }

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawEmptyPicture(picture: EmptyPicture, line: Color) {
    val stroke = Stroke(1.4.dp.toPx())
    val k = size.width / 180f
    val at = { x: Float, y: Float -> Offset((x - 10f) * k, (y - 30f) * k) }
    val path = androidx.compose.ui.graphics.Path()
    val lines = { points: FloatArray ->
        path.moveTo(at(points[0], points[1]).x, at(points[0], points[1]).y)
        for (i in 2 until points.size step 2) path.lineTo(at(points[i], points[i + 1]).x, at(points[i], points[i + 1]).y)
    }
    val spot = { x: Float, y: Float, r: Float -> drawCircle(line, r * k, at(x, y)) }
    when (picture) {
        EmptyPicture.Venue -> {
            lines(floatArrayOf(20f, 45f, 180f, 45f, 180f, 155f, 20f, 155f, 20f, 45f))
            lines(floatArrayOf(100f, 45f, 100f, 155f))
            lines(floatArrayOf(20f, 75f, 44f, 75f, 44f, 125f, 20f, 125f))
            lines(floatArrayOf(180f, 75f, 156f, 75f, 156f, 125f, 180f, 125f))
            drawCircle(line, 18f * k, at(100f, 100f), style = stroke)
            // The maps' teardrop pin.
            val pin = at(130f, 60f)
            val r = 20f * k
            lines(floatArrayOf(130f, 92f, 114.7f, 72.9f))
            path.arcTo(androidx.compose.ui.geometry.Rect(pin, r), 140f, 260f, false)
            path.lineTo(at(130f, 92f).x, at(130f, 92f).y)
            spot(130f, 60f, 5f)
        }
        EmptyPicture.Crew -> {
            lines(floatArrayOf(20f, 45f, 180f, 45f, 180f, 155f, 20f, 155f, 20f, 45f))
            lines(floatArrayOf(100f, 45f, 100f, 155f))
            lines(floatArrayOf(60f, 155f, 140f, 45f))
            spot(100f, 100f, 7f)
            spot(140f, 45f, 5f)
            spot(60f, 155f, 5f)
        }
        EmptyPicture.Bracket -> {
            lines(floatArrayOf(30f, 40f, 70f, 40f, 70f, 80f, 30f, 80f))
            lines(floatArrayOf(30f, 120f, 70f, 120f, 70f, 160f, 30f, 160f))
            lines(floatArrayOf(70f, 60f, 110f, 60f, 110f, 140f, 70f, 140f))
            lines(floatArrayOf(110f, 100f, 170f, 100f))
            spot(170f, 100f, 5f)
        }
        EmptyPicture.Format -> {
            lines(floatArrayOf(20f, 80f, 90f, 80f, 90f, 120f, 20f, 120f, 20f, 80f))
            lines(floatArrayOf(110f, 80f, 180f, 80f, 180f, 120f, 110f, 120f, 110f, 80f))
            lines(floatArrayOf(90f, 100f, 110f, 100f))
            for (x in listOf(20f, 55f, 90f, 110f, 145f, 180f)) lines(floatArrayOf(x, 130f, x, 136f))
        }
        EmptyPicture.Center -> {}
    }
    drawPath(path, line, style = stroke)
}

/** A search that found nothing: plain, as it needs no explaining (WEB-17). */
@Composable
fun NoResults(message: String, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(message, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        action?.invoke()
    }
}

/** The loading pitch (WEB-9): a small pitch marked out over and over in brand green; `inline` is the small one, for a row. */
@Composable
fun LoadingPitch(modifier: Modifier = Modifier, inline: Boolean = false) {
    val t by rememberInfiniteTransition(label = "pitch").animateFloat(0f, 1f, infiniteRepeatable(tween(1400), RepeatMode.Restart), label = "mark")
    val c = colors.brand.copy(alpha = if (inline) 0.6f else 0.35f)
    Box(if (inline) modifier else modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Canvas(if (inline) Modifier.size(30.dp, 19.dp) else Modifier.size(76.dp, 48.dp)) {
            val stroke = Stroke(2.dp.toPx())
            if (t > 0.05f) drawRect(c, style = stroke)
            if (t > 0.3f) drawLine(c, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height), 2.dp.toPx())
            if (t > 0.55f) drawCircle(c, size.height * 0.2f, center, style = stroke)
        }
    }
}

/**
 * WEB-23: a referee's phone and email as Call, Text and Email, joined in one group of icons, rather
 * than the number and address themselves, which only their profile shows.
 */
@Composable
fun ContactButtons(phone: String?, email: String?, name: String) {
    if (phone == null && email == null) return
    val context = androidx.compose.ui.platform.LocalContext.current
    val dial = phone?.filter { it.isDigit() || it == '+' }
    val buttons = listOfNotNull(
        dial?.let { Triple(Ph.Phone, "Call $name") { context.startActivity(android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$it"))) } },
        dial?.let { Triple(Ph.Message, "Text $name") { context.startActivity(android.content.Intent(android.content.Intent.ACTION_SENDTO, android.net.Uri.parse("smsto:$it"))) } },
        email?.let { Triple(Ph.Mail, "Email $name") { context.startActivity(android.content.Intent(android.content.Intent.ACTION_SENDTO, android.net.Uri.parse("mailto:$it"))) } },
    )
    val shape = RoundedCornerShape(6.dp)
    Row(Modifier.clip(shape).border(1.dp, colors.borderInput, shape).background(colors.field)) {
        buttons.forEachIndexed { i, (icon, label, open) ->
            if (i > 0) Box(Modifier.width(1.dp).height(40.dp).background(colors.borderInput))
            Box(Modifier.size(42.dp, 40.dp).clickable(onClickLabel = label, onClick = open), contentAlignment = Alignment.Center) {
                PhIcon(icon, label, size = 19.dp, tint = colors.brandStrong)
            }
        }
    }
}
