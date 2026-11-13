package app.lawfive.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.Tip
import app.lawfive.data.TipArt
import app.lawfive.data.chooseTip
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.BarlowCondensed
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch

// Did you know (TIP-1): now and then, one tip on the Matches page.

/** TIP-2: rolled once each time the app is opened, and kept, so a tip doesn't come and go as pages change. */
private object ThisOpening {
    var rolled = false
    var tip: Tip? = null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DidYouKnow(played: Int) {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val session by graph.session.state.collectAsStateWithLifecycle()
    if (!ThisOpening.rolled) {
        ThisOpening.rolled = true
        ThisOpening.tip = chooseTip(session.tipsDone, played)
    }
    val tip = ThisOpening.tip?.takeIf { it.id !in session.tipsDone } ?: return
    var open by remember { mutableStateOf(false) }
    val done = {
        open = false
        scope.launch { graph.session.tipDone(tip.id) }
        Unit
    }
    LfCard(Modifier.padding(bottom = 26.dp)) {
        Column(Modifier.padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TipHead(tip)
            Text(tip.body, style = MaterialTheme.typography.bodyMedium, color = colors.muted)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                app.lawfive.ui.components.LinkButton("Got it", done)
                SecondaryButton("Show me", { open = true })
            }
        }
    }
    if (open) app.lawfive.ui.theme.OnPanel {
        ModalBottomSheet({ open = false }, containerColor = colors.surface) {
            Column(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                TipHead(tip)
                tip.steps.forEachIndexed { i, step ->
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(28.dp).background(colors.brandSoft, CircleShape), contentAlignment = Alignment.Center) {
                            Text("${i + 1}", fontFamily = BarlowCondensed, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = colors.brandStrong)
                        }
                        Text(step, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 3.dp).weight(1f))
                    }
                }
                tip.note?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.muted) }
                PrimaryButton("Got it", done, Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
private fun TipHead(tip: Tip) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        TipPicture(tip.art, 56.dp)
        Column(Modifier.weight(1f)) {
            Text("DID YOU KNOW", fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp, color = colors.brandStrong)
            Text(tip.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

/** A tip's picture: pitch markings, the watch's coin or two cards where it has its own, else a Phosphor icon. */
@Composable
private fun TipPicture(art: TipArt, size: Dp) {
    val c = colors
    Box(Modifier.size(size).background(c.brandSoft, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
        when (art) {
            TipArt.Corners, TipArt.Direction, TipArt.Cards, TipArt.Coin -> Canvas(Modifier.fillMaxSize()) {
                val u = this.size.width / 64f
                val line = Stroke(1.5f * u)
                val faint = c.brandStrong.copy(alpha = 0.55f)
                when (art) {
                    TipArt.Corners -> {
                        pitch(11f, 42f, u, line, faint)
                        drawLine(faint, Offset(32 * u, 15 * u), Offset(32 * u, 49 * u), 1.5f * u)
                        drawCircle(faint, 6 * u, Offset(32 * u, 32 * u), style = line)
                        listOf(11f to 15f, 53f to 15f, 53f to 49f).forEach { (x, y) -> drawCircle(c.brandStrong, 4.5f * u, Offset(x * u, y * u)) }
                        drawCircle(c.brandStrong, 4.5f * u, Offset(11 * u, 49 * u), style = Stroke(2 * u, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2.5f * u, 2 * u))))
                    }
                    TipArt.Direction -> {
                        pitch(9f, 46f, u, line, faint)
                        drawLine(faint, Offset(32 * u, 15 * u), Offset(32 * u, 49 * u), 1.5f * u)
                        drawCircle(c.brandStrong, 2.6f * u, Offset(32 * u, 32 * u))
                        val arrow = 3 * u
                        drawLine(c.brandStrong, Offset(32 * u, 32 * u), Offset(49 * u, 32 * u), arrow, StrokeCap.Round)
                        drawLine(c.brandStrong, Offset(43.5f * u, 26.5f * u), Offset(49.5f * u, 32 * u), arrow, StrokeCap.Round)
                        drawLine(c.brandStrong, Offset(43.5f * u, 37.5f * u), Offset(49.5f * u, 32 * u), arrow, StrokeCap.Round)
                    }
                    TipArt.Cards -> {
                        rotate(-12f, Offset(29 * u, 31 * u)) { card(19f, 17f, u, c.yellow) }
                        rotate(8f, Offset(37 * u, 33 * u)) { card(27f, 19f, u, c.yellow) }
                    }
                    else -> {
                        drawCircle(c.coin, 20 * u, Offset(32 * u, 32 * u))
                        drawCircle(c.coinEdge, 16 * u, Offset(32 * u, 32 * u), style = Stroke(1.2f * u))
                    }
                }
            }
            TipArt.Undo -> PhIcon(Ph.Undo, size = size * 0.5f, tint = c.brandStrong)
            TipArt.Money -> PhIcon(Ph.Money, size = size * 0.5f, tint = c.brandStrong)
            TipArt.Report -> PhIcon(Ph.Report, size = size * 0.5f, tint = c.brandStrong)
            TipArt.Calendar -> PhIcon(Ph.Calendar, size = size * 0.5f, tint = c.brandStrong)
            TipArt.Play -> PhIcon(Ph.Play, size = size * 0.5f, tint = c.brandStrong)
            TipArt.BellOff -> PhIcon(Ph.BellOff, size = size * 0.5f, tint = c.brandStrong)
        }
        if (art == TipArt.Coin) {
            Text("H", fontFamily = BarlowCondensed, fontWeight = FontWeight.Bold, fontSize = 22.sp, color = c.coinInk)
        }
    }
}

private fun DrawScope.pitch(x: Float, width: Float, u: Float, line: Stroke, color: androidx.compose.ui.graphics.Color) {
    drawRoundRect(color, Offset(x * u, 15 * u), Size(width * u, 34 * u), CornerRadius(1.5f * u), style = line)
}

private fun DrawScope.card(x: Float, y: Float, u: Float, color: androidx.compose.ui.graphics.Color) {
    drawRoundRect(color, Offset(x * u, y * u), Size(20 * u, 28 * u), CornerRadius(2.5f * u))
}
