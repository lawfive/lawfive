import Foundation

// SET-17: the starter formats every account is offered, LawFive's own rather than templates (nothing
// to sync or delete), copied from schema/src/format.ts's starterFormats (its phones' copy is
// schema/generated/starter-formats.json, which StarterFormatsTests checks this against), and what a
// new match on the form starts with: its competition's template, else the usual format, else 2×45.
// As Android's StarterFormats.kt and the website's newMatch.ts.

/// A starter format: its stable id ("us-u10"), its name as the picker shows it, and the age groups it's for.
struct StarterFormat: Equatable {
    let id: String
    let name: String
    let ageGroups: [String]
    let format: MatchFormat
}

/// The defaults of docs/MATCH_CONFIG.md, as schema's defaultFormat: two halves of 45 minutes, 11 a side.
let schemaDefaultFormat = MatchFormat(
    periods: 2, periodSec: 45 * 60, breakSec: 15 * 60, halfwayBreak: false, halfwayBreakSec: 2 * 60, teamSize: 11, clock: "up",
    trackStoppage: false, stoppingClock: false, stopForGoalsCards: true, breakStoppage: true, goalScorers: true, goalTypes: false, extraTime: false, extraTimePeriods: 2,
    extraTimePeriodSec: 15 * 60, goldenGoal: false, penalties: false, sinBins: false, sinBinSec: 10 * 60
)

private func starter(_ periods: Int, _ minutes: Int, _ breakMinutes: Int, _ teamSize: Int, stoppingClock: Bool = false) -> MatchFormat {
    var f = schemaDefaultFormat
    f.periods = periods
    f.periodSec = minutes * 60
    f.breakSec = breakMinutes * 60
    f.teamSize = teamSize
    // TMR-15: a stopping clock needs stoppage tracked.
    if stoppingClock {
        f.stoppingClock = true
        f.trackStoppage = true
    }
    return f
}

/// SET-17: youngest first, then adult, then high school and college with the stopping clock (sources in schema/src/format.ts).
let starterFormats = [
    StarterFormat(id: "us-u8", name: "U8 · 4v4 · 2×20", ageGroups: ["U6", "U7", "U8"], format: starter(2, 20, 5, 4)),
    StarterFormat(id: "us-u10", name: "U9–U10 · 7v7 · 2×25", ageGroups: ["U9", "U10"], format: starter(2, 25, 5, 7)),
    StarterFormat(id: "us-u12", name: "U11–U12 · 9v9 · 2×30", ageGroups: ["U11", "U12"], format: starter(2, 30, 5, 9)),
    StarterFormat(id: "us-u14", name: "U13–U14 · 11v11 · 2×35", ageGroups: ["U13", "U14"], format: starter(2, 35, 10, 11)),
    StarterFormat(id: "us-u16", name: "U15–U16 · 11v11 · 2×40", ageGroups: ["U15", "U16"], format: starter(2, 40, 10, 11)),
    StarterFormat(id: "us-u19", name: "U17–U19 · 11v11 · 2×45", ageGroups: ["U17", "U18", "U19"], format: starter(2, 45, 10, 11)),
    StarterFormat(id: "adult", name: "Adult · 11v11 · 2×45", ageGroups: ["Adult"], format: schemaDefaultFormat),
    StarterFormat(id: "us-hs", name: "High school (NFHS) · 2×40 · stopping clock", ageGroups: ["HS", "Varsity", "JV"], format: starter(2, 40, 10, 11, stoppingClock: true)),
    StarterFormat(id: "us-college", name: "College (NCAA) · 2×45 · stopping clock", ageGroups: ["College", "NCAA"], format: starter(2, 45, 15, 11, stoppingClock: true)),
]

/// The starter format for a match's age group ("U10", "u10", "U 10"), if one is for it.
func starterFormatFor(_ ageGroup: String?) -> StarterFormat? {
    let key = (ageGroup ?? "").replacingOccurrences(of: "\\s+", with: "", options: .regularExpression).uppercased()
    guard !key.isEmpty else { return nil }
    return starterFormats.first { $0.ageGroups.contains { $0.uppercased() == key } }
}

/// A format with what's missing filled in as the schema reads it (formats saved before a field): breakStoppage and goalScorers on, goldenGoal, sinBins and the stopping clock off.
private func normal(_ f: MatchFormat) -> MatchFormat {
    var n = f
    n.breakStoppage = f.breakStoppage ?? true
    n.goalScorers = f.goalScorers ?? true
    n.goldenGoal = f.goldenGoal ?? false
    // EVT-12: missing means off, and 10 minutes; with sin bins off, their length doesn't count.
    n.sinBins = f.sinBins ?? false
    n.sinBinSec = n.sinBins == true ? (f.sinBinSec ?? 10 * 60) : 10 * 60
    // TMR-15: missing means the clock runs on, and goals and cards stopping it (which only counts with a stopping clock).
    n.stoppingClock = f.stoppingClock ?? false
    n.stopForGoalsCards = n.stoppingClock == true ? (f.stopForGoalsCards ?? true) : true
    return n
}

/// Whether two formats are the same, as the website's sameFormat (web/src/newMatch.ts).
func sameFormat(_ a: MatchFormat, _ b: MatchFormat) -> Bool { normal(a) == normal(b) }

/// The starter format this is, unchanged, if it is one.
func starterOf(_ format: MatchFormat) -> StarterFormat? { starterFormats.first { sameFormat($0.format, format) } }

/// What a new match's format starts as (SET-17): the usual format when there is one, else 2×45; a competition's template takes over when one's chosen.
func startingFormat(_ usual: UsualFormat?, templates: [MatchTemplate]) -> (format: MatchFormat, templateId: String?) {
    guard let usual else { return (schemaDefaultFormat, nil) }
    // A template since deleted, or changed since, leaves its format, without its name.
    let template = usual.templateId.flatMap { id in templates.contains { $0.id == id && sameFormat($0.format, usual.format) } ? id : nil }
    return (usual.format, template)
}

/// One of the format choices, as the website's FormatChoice: the usual one as last saved ("last"), a
/// starter format, a template, "none" (Your own) when it's none of them, or "unset" (Settings' Not chosen yet).
struct FormatChoice: Equatable {
    let id: String
    let name: String
    var starter: StarterFormat?
    var template: MatchTemplate?
}

private func starterChoice(_ s: StarterFormat) -> FormatChoice { FormatChoice(id: "starter:\(s.id)", name: s.name, starter: s) }
private func templateChoice(_ t: MatchTemplate) -> FormatChoice { FormatChoice(id: "template:\(t.id)", name: t.name, template: t) }

/// What Settings → New matches shows as the usual format: the starter or template it came from while unchanged, else "As last saved".
func usualFormatChoice(_ usual: UsualFormat?, templates: [MatchTemplate]) -> FormatChoice {
    guard let usual else { return FormatChoice(id: "unset", name: "Not chosen yet") }
    if let s = starterFormats.first(where: { $0.id == usual.starterId && sameFormat($0.format, usual.format) }) { return starterChoice(s) }
    if let t = templates.first(where: { $0.id == usual.templateId && sameFormat($0.format, usual.format) }) { return templateChoice(t) }
    return FormatChoice(id: "last", name: "As last saved")
}

/// Which choice a match's format is, for the form's Format: its own template while unchanged, the
/// usual format's source, then any starter or template with the same format; "none" (Your own) when
/// it's been changed by hand.
func formatChoiceOf(_ format: MatchFormat, templateId: String?, usual: UsualFormat?, templates: [MatchTemplate]) -> FormatChoice {
    if let t = templates.first(where: { $0.id == templateId && sameFormat($0.format, format) }) { return templateChoice(t) }
    if let usual, sameFormat(usual.format, format) {
        let choice = usualFormatChoice(usual, templates: templates)
        return choice.id == "last" ? FormatChoice(id: "last", name: "Your usual") : choice
    }
    if let s = starterOf(format) { return starterChoice(s) }
    if let t = templates.first(where: { sameFormat($0.format, format) }) { return templateChoice(t) }
    return FormatChoice(id: "none", name: "Your own")
}

/// The usual format a match saved from the form leaves (SET-17), with the starter or template it came from while unchanged.
func usualFormatFrom(_ format: MatchFormat, choice: FormatChoice, now: String) -> UsualFormat {
    UsualFormat(format: format, templateId: choice.template?.id, starterId: choice.starter?.id, changedAt: now)
}

/// Whether saving this usual format would change anything, so a match saved with the same one doesn't touch the settings.
func usualChanged(_ before: UsualFormat?, _ after: UsualFormat) -> Bool {
    guard let before else { return true }
    return !sameFormat(before.format, after.format) || before.starterId != after.starterId || before.templateId != after.templateId
}

/// The starter format a match's age group suggests (U10: U9–U10 · 7v7 · 2×25), unless the match has that format already.
func suggestedStarter(_ ageGroup: String?, format: MatchFormat) -> StarterFormat? {
    starterFormatFor(ageGroup).flatMap { sameFormat($0.format, format) ? nil : $0 }
}
