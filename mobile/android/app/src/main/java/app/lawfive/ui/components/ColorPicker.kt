package app.lawfive.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.lawfive.schema.Team
import app.lawfive.ui.hexToHsv
import app.lawfive.ui.hsvToHex
import app.lawfive.ui.normalHex
import app.lawfive.ui.parseColour
import app.lawfive.ui.theme.colors

// WEB-19: a team's custom color. Android has no color picker of its own, so this is LawFive's: kit
// shades to tap, a saturation and brightness area for a hue, and the hex, with the team's badge
// showing the result. The website and iPhone use the browser's and Apple's.

/** Common kit colors beyond the watch's eight, to start from. */
private val kitShades = listOf(
    "#1F2A44" to "Navy", "#2E4FA3" to "Royal blue", "#6CACE4" to "Sky blue", "#00827F" to "Teal", "#1F5130" to "Forest green", "#8DC63F" to "Lime",
    "#C99A2E" to "Gold", "#7A1F2B" to "Maroon", "#E6609A" to "Pink", "#6B4226" to "Brown", "#A7A9AC" to "Silver", "#3D4146" to "Charcoal",
)

private val hues = listOf(0f, 60f, 120f, 180f, 240f, 300f, 360f).map { Color.hsv(it % 360f, 1f, 1f) }

@Composable
fun CustomColorDialog(team: Team, other: Team, home: Boolean, onDone: (String) -> Unit, onDismiss: () -> Unit) {
    val start = team.colour?.let { hexToHsv(it) } ?: Triple(150f, 0.6f, 0.6f)
    var hue by remember { mutableFloatStateOf(start.first) }
    var saturation by remember { mutableFloatStateOf(start.second) }
    var value by remember { mutableFloatStateOf(start.third) }
    val hex = hsvToHex(hue, saturation, value)
    // What's in the hex box: the color as it moves, or what's being typed until it's a whole color.
    var typed by remember { mutableStateOf<String?>(null) }
    val set = { h: String ->
        hexToHsv(h)?.let { (a, b, c) -> hue = a; saturation = b; value = c }
        Unit
    }

    app.lawfive.ui.theme.OnPanel { AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.surface,
        title = { Text("TEAM COLOR", style = MaterialTheme.typography.headlineSmall) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TeamBadge(team.copy(colour = hex), other, home, large = true)
                    Text(hex, fontFamily = app.lawfive.ui.theme.Mono, color = colors.muted, style = MaterialTheme.typography.bodyMedium)
                }
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (row in kitShades.chunked(6)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            for ((shade, name) in row) {
                                val on = shade == hex
                                Box(
                                    Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(8.dp)).background(parseColour(shade)!!)
                                        .border(if (on) 2.dp else 1.dp, if (on) colors.brand else colors.border, RoundedCornerShape(8.dp))
                                        .clickable(onClickLabel = name) { typed = null; set(shade) }
                                        .semantics { contentDescription = name },
                                )
                            }
                        }
                    }
                }
                // Saturation across, brightness down, for the hue below.
                Box(
                    Modifier.fillMaxWidth().height(150.dp).clip(RoundedCornerShape(10.dp))
                        .background(Brush.horizontalGradient(listOf(Color.White, Color.hsv(hue % 360f, 1f, 1f))))
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black)))
                        .border(1.dp, colors.border, RoundedCornerShape(10.dp))
                        .semantics { contentDescription = "Saturation and brightness" }
                        .pointerInput(Unit) {
                            fun at(p: Offset) {
                                typed = null
                                saturation = (p.x / size.width).coerceIn(0f, 1f)
                                value = 1f - (p.y / size.height).coerceIn(0f, 1f)
                            }
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                at(down.position)
                                drag(down.id) { at(it.position); it.consume() }
                            }
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        val c = Offset(saturation * size.width, (1f - value) * size.height)
                        drawCircle(Color.Black.copy(alpha = 0.35f), 9.dp.toPx(), c, style = Stroke(4.dp.toPx()))
                        drawCircle(Color.White, 9.dp.toPx(), c, style = Stroke(2.dp.toPx()))
                    }
                }
                Box(
                    Modifier.fillMaxWidth().height(26.dp).clip(RoundedCornerShape(13.dp)).background(Brush.horizontalGradient(hues))
                        .semantics { contentDescription = "Hue" }
                        .pointerInput(Unit) {
                            fun at(p: Offset) {
                                typed = null
                                hue = (p.x / size.width).coerceIn(0f, 1f) * 359.9f
                            }
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                at(down.position)
                                drag(down.id) { at(it.position); it.consume() }
                            }
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        val x = (hue / 360f) * size.width
                        val r = size.height / 2
                        drawCircle(Color.Black.copy(alpha = 0.35f), r - 1.dp.toPx(), Offset(x.coerceIn(r, size.width - r), r), style = Stroke(4.dp.toPx()))
                        drawCircle(Color.White, r - 1.dp.toPx(), Offset(x.coerceIn(r, size.width - r), r), style = Stroke(2.dp.toPx()))
                    }
                }
                Field("Hex", typed ?: hex, { text ->
                    typed = text
                    normalHex(text)?.let(set)
                }, placeholder = "#2A9D8F", mono = true)
            }
        },
        confirmButton = { LinkButtonColored("Use color", colors.brand) { onDone(hex) } },
        dismissButton = { LinkButtonColored("Cancel", colors.muted, onDismiss) },
    ) }
}

/** A team's color: None, the watch's eight with swatches, then Custom (WEB-19), which opens the picker. */
@Composable
fun TeamColorChoice(team: Team, other: Team, home: Boolean, eight: List<Pair<String, String>>, onChange: (String?) -> Unit, modifier: Modifier = Modifier) {
    var picking by remember { mutableStateOf(false) }
    val custom = team.colour?.takeIf { hex -> eight.none { it.first.equals(hex, true) } }?.uppercase()
    Choice(
        "Color", team.colour, eight.map { it.first },
        { hex -> eight.firstOrNull { it.first.equals(hex, true) }?.second ?: if (hex == null) "None" else "Custom" },
        onChange, modifier, allowNone = "None", swatch = { parseColour(it) },
        extra = { close ->
            DropdownMenuItem(
                { Text(if (custom != null) "Custom $custom" else "Custom…") }, { close(); picking = true },
                leadingIcon = { custom?.let { parseColour(it) }?.let { ColorSwatch(it) } ?: PhIcon(Ph.Palette, size = 18.dp, tint = colors.muted) },
            )
        },
    )
    if (picking) {
        CustomColorDialog(team, other, home, onDone = { onChange(it); picking = false }, onDismiss = { picking = false })
    }
}
