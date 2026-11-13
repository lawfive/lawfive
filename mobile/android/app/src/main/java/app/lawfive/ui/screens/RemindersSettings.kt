package app.lawfive.ui.screens

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.lawfive.ReminderSettings
import app.lawfive.ReminderTimes
import app.lawfive.ui.LocalGraph
import app.lawfive.ui.components.Choice
import app.lawfive.ui.components.Confirm
import app.lawfive.ui.components.LfCard
import app.lawfive.ui.components.Ph
import app.lawfive.ui.components.PhIcon
import app.lawfive.ui.components.SecondaryButton
import app.lawfive.ui.components.ToggleRow
import app.lawfive.ui.theme.colors
import kotlinx.coroutines.launch

// The phone's match reminders (APP-6) in Settings: this phone's switch, and the account's times (CAL-3).

/** "45 min", "1 hour", "1 h 15 min". */
fun beforeText(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return if (h == 0) "$m min" else if (m == 0) "$h ${if (h == 1) "hour" else "hours"}" else "$h h $m min"
}

/** Get ready's line once reminders are on: "On: 1 hour and 30 min before kickoff", or the day's ones when there are none before it. */
fun remindersOnText(times: ReminderTimes): String = when {
    times.minutesBefore.isNotEmpty() -> "On: ${times.minutesBefore.sortedDescending().joinToString(" and ") { beforeText(it) }} before kickoff"
    times.dayBefore != null || times.dayOf != null -> "On: ${listOfNotNull(times.dayBefore?.let { "the day before" }, times.dayOf?.let { "the day of" }).joinToString(" and ")}"
    else -> "On, with no times chosen yet"
}

private val times = (6..22).flatMap { h -> listOf("%02d:00".format(h), "%02d:30".format(h)) }

/**
 * APP-28: once reminders are on, asks for Alarms & reminders where it isn't allowed, saying why
 * first, then opens the system's page. Without it, reminders still come, a few minutes late at worst.
 */
@Composable
fun rememberAskForExactAlarms(): () -> Unit {
    val graph = LocalGraph.current
    val context = LocalContext.current
    var explain by remember { mutableStateOf(false) }
    if (explain) {
        Confirm(
            "Reminders on the minute",
            "Android can hold reminders back a few minutes to save battery. Allow LawFive to set alarms and reminders, so yours arrive on the minute.",
            "Allow", danger = false, dismiss = "Not now",
            onConfirm = {
                explain = false
                openExactAlarmSettings(context)
            },
            onDismiss = { explain = false },
        )
    }
    return { if (!graph.reminders.exactAlarms()) explain = true }
}

/** APP-28: the system's Alarms & reminders page for LawFive. */
private fun openExactAlarmSettings(context: android.content.Context) {
    if (Build.VERSION.SDK_INT >= 31) {
        runCatching { context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RemindersSettings() {
    val graph = LocalGraph.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val s by graph.reminders.settings.collectAsStateWithLifecycle(ReminderSettings())
    val t by graph.reminders.times.collectAsStateWithLifecycle(ReminderTimes())
    fun update(next: ReminderSettings) = scope.launch { graph.reminders.update(next) }
    fun updateTimes(next: ReminderTimes) = scope.launch { graph.reminders.updateTimes(next) }
    // APP-28: checked again on coming back, as from the system's page.
    var exact by remember { mutableStateOf(graph.reminders.exactAlarms()) }
    LifecycleResumeEffect(Unit) {
        val now = graph.reminders.exactAlarms()
        if (now != exact) {
            exact = now
            scope.launch { graph.reminders.reschedule() }
        }
        onPauseOrDispose {}
    }
    val askForExact = rememberAskForExactAlarms()
    val turnOn = {
        update(s.copy(enabled = true))
        askForExact()
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) turnOn() }
    // PUSH-5: only where this build and this server can do it.
    val pushOffered by androidx.compose.runtime.produceState(false) { value = graph.push.offered() }
    val noticesOffered by androidx.compose.runtime.produceState(false) { value = graph.push.noticesOffered() }
    val askForRisks = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) update(s.copy(weatherRisks = true)) }
    val askForNotices = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) update(s.copy(integrations = true)) }
    val muted = MaterialTheme.typography.bodySmall
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
            when {
                !on -> update(s.copy(enabled = false))
                Build.VERSION.SDK_INT >= 33 && !graph.reminders.canNotify() -> ask.launch(Manifest.permission.POST_NOTIFICATIONS)
                else -> turnOn()
            }
        }, divider = false)
        if (s.enabled) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // APP-28: without Alarms & reminders they still come, when Android lets them.
                if (!exact) {
                    Text("Reminders may come a few minutes late, as Android holds them back to save battery. Allow alarms and reminders so they arrive on the minute.",
                        style = muted, color = colors.muted)
                    SecondaryButton("Allow", { openExactAlarmSettings(context) }, icon = Ph.Clock)
                }
                Text("Before kickoff", style = MaterialTheme.typography.bodySmall)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (m in t.minutesBefore.sorted()) {
                        // A brand chip with Phosphor's close: tapping it removes the reminder.
                        androidx.compose.material3.InputChip(true, { updateTimes(t.copy(minutesBefore = t.minutesBefore - m)) }, { Text(beforeText(m)) },
                            trailingIcon = { PhIcon(Ph.Close, "Remove", size = 14.dp, tint = colors.brandStrong) },
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
                            border = null,
                            colors = androidx.compose.material3.InputChipDefaults.inputChipColors(
                                selectedContainerColor = colors.brandSoft, selectedLabelColor = colors.brandStrong,
                            ))
                    }
                }
                Choice("Add a reminder", null, ReminderTimes.STEPS.filter { it !in t.minutesBefore }, { it?.let { beforeText(it) } ?: "Choose" }, { m ->
                    if (m != null && t.minutesBefore.size < 12) updateTimes(t.copy(minutesBefore = t.minutesBefore + m))
                })
                Choice("The day before, at", t.dayBefore, times, { it ?: "None" }, { updateTimes(t.copy(dayBefore = it)) }, allowNone = "None")
                Choice("The day of, at", t.dayOf, times, { it ?: "None" }, { updateTimes(t.copy(dayOf = it)) }, allowNone = "None")
                // CAL-3: one set of times for the account.
                Text("These times are your account's: your calendar feed and LawFive on your other phones use them too.", style = muted, color = colors.muted)
            }
        }
    }
    }
}
