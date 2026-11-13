package app.lawfive.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.data.SyncActivity
import app.lawfive.data.SyncProgress
import app.lawfive.data.SyncRow
import app.lawfive.ui.components.Avatar
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.LoadingPitch
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PrimaryButton
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.theme.colors
import app.lawfive.ui.components.pitchStripes

/** APP-16: a big sync, in full: what's moving and how far it's got, with the way back to the app. */
@Composable
fun SyncScreen(activity: SyncActivity) {
    val progress by activity.state.collectAsStateWithLifecycle()
    AnimatedVisibility(progress.show, enter = fadeIn(), exit = fadeOut()) {
        BackHandler { if (progress.finished) activity.close() else activity.hide() }
        Column(
            Modifier.fillMaxSize().pitchStripes(colors.pitch, colors.pitchStripe).statusBarsPadding().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // The same height whichever shows, so nothing moves when it finishes.
            Box(Modifier.height(112.dp), contentAlignment = Alignment.Center) {
                when {
                    progress.problem != null -> Avatar(icon = Ph.Info, background = colors.panel, foreground = colors.red, size = 56.dp)
                    progress.finished -> Avatar(icon = Ph.Check, size = 56.dp)
                    else -> LoadingPitch()
                }
            }
            Text(title(progress).uppercase(), style = MaterialTheme.typography.headlineLarge, color = colors.text, textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(line(progress), style = MaterialTheme.typography.bodyMedium, color = colors.muted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(20.dp))
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                item {
                    LfCard {
                        progress.rows.forEachIndexed { i, row ->
                            if (i > 0) HorizontalDivider(color = colors.border)
                            ProgressRow(row)
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            if (progress.finished) {
                PrimaryButton("Done", { activity.close() }, Modifier.fillMaxWidth())
            } else {
                SecondaryButton("Keep using LawFive", { activity.hide() }, Modifier.fillMaxWidth())
            }
        }
    }
}

private fun title(p: SyncProgress) = when {
    p.problem != null -> "Sync paused"
    p.finished -> "All synced"
    p.fromWatch -> "Syncing your watch"
    else -> "Syncing your matches"
}

private fun line(p: SyncProgress) = when {
    p.problem != null -> "${p.problem}. What's left goes by itself as soon as it can."
    p.finished -> "Everything's on your phone and the server."
    else -> "This carries on if you keep using the app."
}

@Composable
private fun ProgressRow(row: SyncRow) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Start) {
        Box(Modifier.width(34.dp), contentAlignment = Alignment.Center) {
            if (row.done) Avatar(icon = Ph.Check, size = 26.dp) else LoadingPitch(inline = true)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(row.title, style = MaterialTheme.typography.titleMedium, color = colors.text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            row.detail?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
    }
}
