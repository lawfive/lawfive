package app.lawfive.ui.screens

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.ReminderSettings
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch

// The phone's match reminders (APP-6), in Settings.

/** "45 min", "1 hour", "1 h 15 min". */
fun beforeText(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return if (h == 0) "$m min" else if (m == 0) "$h ${if (h == 1) "hour" else "hours"}" else "$h h $m min"
}

private val times = (6..22).flatMap { h -> listOf("%02d:00".format(h), "%02d:30".format(h)) }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RemindersSettings() {
    val graph = LocalGraph.current
    val scope = rememberCoroutineScope()
    val s by graph.reminders.settings.collectAsStateWithLifecycle(ReminderSettings())
    fun update(next: ReminderSettings) = scope.launch { graph.reminders.update(next) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) update(s.copy(enabled = true)) }
    // PUSH-5: only where this build and this server can do it.
    val pushOffered by androidx.compose.runtime.produceState(false) { value = graph.push.offered() }
    val noticesOffered by androidx.compose.runtime.produceState(false) { value = graph.push.noticesOffered() }
    val askForRisks = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) update(s.copy(weatherRisks = true)) }
    val askForNotices = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) update(s.copy(integrations = true)) }
    // Two cards need space between them, as they share one item of the list.
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    if (pushOffered) {
        LfCard {
            ToggleRow("Tell me about weather risks", "A notification when the forecast shows a new risk to a match in the next 3 days", s.weatherRisks, { on ->
                if (on && Build.VERSION.SDK_INT >= 33 && !graph.reminders.canNotify()) askForRisks.launch(Manifest.permission.POST_NOTIFICATIONS) else update(s.copy(weatherRisks = on))
            }, divider = false)
            // NOTE-4: only for API keys set to notify, on the website.
            if (noticesOffered) {
                ToggleRow("Tell me about matches from integrations", "When the app that sends your assignments adds, cancels or moves a match", s.integrations, { on ->
                    if (on && Build.VERSION.SDK_INT >= 33 && !graph.reminders.canNotify()) askForNotices.launch(Manifest.permission.POST_NOTIFICATIONS) else update(s.copy(integrations = on))
                })
            }
        }
    }
    LfCard {
        ToggleRow("Remind me of matches", "Notifications on this phone, as well as or instead of your calendar's", s.enabled, { on ->
            if (on && Build.VERSION.SDK_INT >= 33 && !graph.reminders.canNotify()) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else update(s.copy(enabled = on))
        }, divider = false)
        if (s.enabled) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Before kickoff", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (m in s.minutesBefore.sorted()) {
                        // A brand chip with Phosphor's close: tapping it removes the reminder.
                        androidx.compose.material3.InputChip(true, { update(s.copy(minutesBefore = s.minutesBefore - m)) }, { Text(beforeText(m)) },
                            trailingIcon = { PhIcon(Ph.Close, "Remove", size = 14.dp, tint = colors.brandStrong) },
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
                            border = null,
                            colors = androidx.compose.material3.InputChipDefaults.inputChipColors(
                                selectedContainerColor = colors.brandSoft, selectedLabelColor = colors.brandStrong,
                            ))
                    }
                }
                Choice("Add a reminder", null, (15..180 step 15).filter { it !in s.minutesBefore }, { it?.let { beforeText(it) } ?: "Choose" }, { m ->
                    if (m != null && s.minutesBefore.size < 12) update(s.copy(minutesBefore = s.minutesBefore + m))
                })
                Choice("The day before, at", s.dayBefore, times, { it ?: "None" }, { update(s.copy(dayBefore = it)) }, allowNone = "None")
                Choice("The day of, at", s.dayOf, times, { it ?: "None" }, { update(s.copy(dayOf = it)) }, allowNone = "None")
            }
        }
    }
    }
}
