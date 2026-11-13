package app.lawfive.data

import app.lawfive.schema.AccountPlan
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// The account's plan and what it's using (PLAN-6), in the same words as the website's Settings. The
// server checks the limits; this only says what they are.

/** One limit: its name, what's used ("3"), what's allowed ("of 50", or "at most 120"), and how full. */
data class PlanLine(val label: String, val figure: String, val of: String?, val share: Double?)

private fun sizeOf(mb: Double): String =
    if (mb >= 1024) "${trim(mb / 1024)} GB" else "${trim(mb)} MB"

private fun trim(n: Double): String {
    val rounded = Math.round(n * 10) / 10.0
    return if (rounded % 1.0 == 0.0) "${rounded.toLong()}" else "$rounded"
}

private fun count(n: Long) = String.format(Locale.US, "%,d", n)

/** The limits the plan sets, and storage always, as it's what fills up. */
fun planLines(plan: AccountPlan): List<PlanLine> {
    val l = plan.limits
    val u = plan.usage
    fun counted(label: String, allowed: Int?, used: Long): PlanLine? = allowed?.let {
        PlanLine(label, count(used), if (it == 0) "of none" else "of ${count(it.toLong())}", if (it == 0) 1.0 else minOf(1.0, used.toDouble() / it))
    }
    fun most(label: String, allowed: Int?, mb: Boolean = false): PlanLine? = allowed?.let {
        PlanLine(label, if (it == 0) "None" else if (mb) sizeOf(it.toDouble()) else count(it.toLong()), if (it == 0) null else "at most", null)
    }
    return listOfNotNull(
        counted("Matches", l.matches, u.matches),
        counted("Referees", l.referees, u.referees),
        counted("Venues", l.venues, u.venues),
        PlanLine("Photos and tracks", sizeOf(u.storageMb), l.storageMb?.let { "of ${sizeOf(it.toDouble())}" }, l.storageMb?.let { if (it == 0) 1.0 else minOf(1.0, u.storageMb / it) }),
        most("Largest photo", l.photoMb, mb = true),
        most("Largest file", l.fileMb, mb = true),
        counted("Watches and phones", l.devices, u.devices),
        counted("Notifications today", l.pushPerDay, u.pushPerDay),
        counted("API keys", l.apiKeys, u.apiKeys),
        most("API requests a minute", l.apiCallsPerMinute),
        counted("API requests today", l.apiCallsPerDay, u.apiCallsPerDay),
        counted("Webhooks", l.webhooks, u.webhooks),
        // PLAN-11: older servers don't count them.
        counted("Address searches today", l.addressSearchesPerDay, u.addressSearchesPerDay ?: 0),
    )
}

/** "Until Sun, Nov 8, then Free", or null for a plan that doesn't end. */
fun planEnd(plan: AccountPlan, today: LocalDate = java.time.LocalDate.now(AppClock.clock())): String? {
    val day = (plan.endsOn ?: plan.endsAt?.take(10))?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: return null
    val pattern = if (day.year == today.year) "EEE, MMM d" else "EEE, MMM d, yyyy"
    return "Until ${day.format(DateTimeFormatter.ofPattern(pattern, Locale.US))}${plan.then?.let { ", then ${it.name}" } ?: ""}"
}
