package app.lawfive.data

import app.lawfive.schema.MatchFormat
import app.lawfive.schema.Match
import app.lawfive.schema.MatchTemplate
import app.lawfive.schema.UsualFormat

// SET-17: the starter formats every account is offered, LawFive's own rather than templates (nothing
// to sync or delete), copied from schema/src/format.ts's starterFormats (its phones' copy is
// schema/generated/starter-formats.json, which StarterFormatsTest checks this against), and what a
// new match on the form starts with: its competition's template, else the usual format, else 2×45.

/** A starter format: its stable id ("us-u10"), its name as the picker shows it, and the age groups it's for. */
data class StarterFormat(val id: String, val name: String, val ageGroups: List<String>, val format: MatchFormat)

/** The defaults of docs/MATCH_CONFIG.md, as schema's defaultFormat: two halves of 45 minutes, 11 a side. */
val schemaDefaultFormat = MatchFormat(
    periods = 2, periodSec = 45 * 60, breakSec = 15 * 60, halfwayBreak = false, halfwayBreakSec = 2 * 60, teamSize = 11, clock = "up",
    trackStoppage = false, stoppingClock = false, stopForGoalsCards = true, breakStoppage = true, goalScorers = true, goalTypes = false, extraTime = false, extraTimePeriods = 2,
    extraTimePeriodSec = 15 * 60, goldenGoal = false, penalties = false, sinBins = false, sinBinSec = 10 * 60,
)

private fun starter(periods: Int, minutes: Int, breakMinutes: Int, teamSize: Int, stoppingClock: Boolean = false) =
    schemaDefaultFormat.copy(periods = periods, periodSec = minutes * 60, breakSec = breakMinutes * 60, teamSize = teamSize).let {
        // TMR-15: a stopping clock needs stoppage tracked.
        if (stoppingClock) it.copy(stoppingClock = true, trackStoppage = true) else it
    }

/** SET-17: youngest first, then adult, then high school and college with the stopping clock (TMR-15; sources in schema/src/format.ts). */
val starterFormats = listOf(
    StarterFormat("us-u8", "U8 · 4v4 · 2×20", listOf("U6", "U7", "U8"), starter(2, 20, 5, 4)),
    StarterFormat("us-u10", "U9–U10 · 7v7 · 2×25", listOf("U9", "U10"), starter(2, 25, 5, 7)),
    StarterFormat("us-u12", "U11–U12 · 9v9 · 2×30", listOf("U11", "U12"), starter(2, 30, 5, 9)),
    StarterFormat("us-u14", "U13–U14 · 11v11 · 2×35", listOf("U13", "U14"), starter(2, 35, 10, 11)),
    StarterFormat("us-u16", "U15–U16 · 11v11 · 2×40", listOf("U15", "U16"), starter(2, 40, 10, 11)),
    StarterFormat("us-u19", "U17–U19 · 11v11 · 2×45", listOf("U17", "U18", "U19"), starter(2, 45, 10, 11)),
    StarterFormat("adult", "Adult · 11v11 · 2×45", listOf("Adult"), schemaDefaultFormat),
    StarterFormat("us-hs", "High school (NFHS) · 2×40 · stopping clock", listOf("HS", "Varsity", "JV"), starter(2, 40, 10, 11, stoppingClock = true)),
    StarterFormat("us-college", "College (NCAA) · 2×45 · stopping clock", listOf("College", "NCAA"), starter(2, 45, 15, 11, stoppingClock = true)),
)

/** The starter format for a match's age group ("U10", "u10", "U 10"), if one is for it. */
fun starterFormatFor(ageGroup: String?): StarterFormat? {
    val key = (ageGroup ?: "").replace(Regex("\\s+"), "").uppercase()
    return if (key.isEmpty()) null else starterFormats.firstOrNull { s -> s.ageGroups.any { it.uppercase() == key } }
}

/**
 * A format with what's missing filled in as the schema reads it (formats saved before a field): breakStoppage and goalScorers on,
 * goldenGoal and sin bins off, a sin bin 10 minutes, its length counting only with sin bins on (EVT-12), the clock running on and
 * goals and cards stopping it when it stops (TMR-15), as the website's.
 */
private fun MatchFormat.normal() = copy(breakStoppage = breakStoppage ?: true, goalScorers = goalScorers ?: true, goldenGoal = goldenGoal ?: false, sinBins = sinBins ?: false, sinBinSec = if (sinBins == true) sinBinSec ?: 10 * 60 else 10 * 60,
    // TMR-15: missing means the clock runs on; goals and cards stopping it only counts with a stopping clock.
    stoppingClock = stoppingClock ?: false, stopForGoalsCards = if (stoppingClock == true) stopForGoalsCards ?: true else true)

/** Whether two formats are the same, as the website's sameFormat (web/src/newMatch.ts). */
fun sameFormat(a: MatchFormat, b: MatchFormat): Boolean = a.normal() == b.normal()

/** The starter format this is, unchanged, if it is one. */
fun starterOf(format: MatchFormat): StarterFormat? = starterFormats.firstOrNull { sameFormat(it.format, format) }

/** What a new match's format starts as (SET-17): the usual format when there is one, else 2×45; a competition's template takes over when one's chosen. */
fun startingFormat(usual: UsualFormat?, templates: List<MatchTemplate>): Pair<MatchFormat, String?> {
    if (usual == null) return schemaDefaultFormat to null
    // A template since deleted, or changed since, leaves its format, without its name.
    val template = usual.templateId?.takeIf { id -> templates.any { it.id == id && sameFormat(it.format, usual.format) } }
    return usual.format to template
}

/**
 * One of the format choices, as the website's FormatChoice: the usual one as last saved ("last"), a
 * starter format, a template, "none" (Your own) when it's none of them, or "unset" (Settings' Not chosen yet).
 */
data class FormatChoice(val id: String, val name: String, val starter: StarterFormat? = null, val template: MatchTemplate? = null)

private fun starterChoice(s: StarterFormat) = FormatChoice("starter:${s.id}", s.name, starter = s)
private fun templateChoice(t: MatchTemplate) = FormatChoice("template:${t.id}", t.name, template = t)

/** What Settings → New matches shows as the usual format: the starter or template it came from while unchanged, else "As last saved". */
fun usualFormatChoice(usual: UsualFormat?, templates: List<MatchTemplate>): FormatChoice {
    if (usual == null) return FormatChoice("unset", "Not chosen yet")
    starterFormats.firstOrNull { it.id == usual.starterId && sameFormat(it.format, usual.format) }?.let { return starterChoice(it) }
    templates.firstOrNull { it.id == usual.templateId && sameFormat(it.format, usual.format) }?.let { return templateChoice(it) }
    return FormatChoice("last", "As last saved")
}

/**
 * Which choice a match's format is, for the form's Format: its own template while unchanged, the
 * usual format's source, then any starter or template with the same format; "none" (Your own) when
 * it's been changed by hand.
 */
fun formatChoiceOf(format: MatchFormat, templateId: String?, usual: UsualFormat?, templates: List<MatchTemplate>): FormatChoice {
    templates.firstOrNull { it.id == templateId && sameFormat(it.format, format) }?.let { return templateChoice(it) }
    if (usual != null && sameFormat(usual.format, format)) {
        val choice = usualFormatChoice(usual, templates)
        return if (choice.id == "last") FormatChoice("last", "Your usual") else choice
    }
    starterOf(format)?.let { return starterChoice(it) }
    templates.firstOrNull { sameFormat(it.format, format) }?.let { return templateChoice(it) }
    return FormatChoice("none", "Your own")
}

/** The usual format a match saved from the form leaves (SET-17), with the starter or template it came from while unchanged. */
fun usualFormatFrom(format: MatchFormat, choice: FormatChoice, now: String): UsualFormat =
    UsualFormat(format = format, templateId = choice.template?.id, starterId = choice.starter?.id, changedAt = now)

/** Whether saving this usual format would change anything, so a match saved with the same one doesn't touch the settings. */
fun usualChanged(before: UsualFormat?, after: UsualFormat): Boolean =
    before == null || !sameFormat(before.format, after.format) || before.starterId != after.starterId || before.templateId != after.templateId

/** The starter format a match's age group suggests (U10: U9–U10 · 7v7 · 2×25), unless the match has that format already. */
fun suggestedStarter(ageGroup: String?, format: MatchFormat): StarterFormat? =
    starterFormatFor(ageGroup)?.takeIf { !sameFormat(it.format, format) }
