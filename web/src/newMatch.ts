import { type MatchFormat, type StarterFormat, defaultFormat, starterFormatFor, starterFormats } from "@lawfive/schema";
import type { MatchTemplate, UserSettings } from "./api.ts";

// SET-17: where a new match on the form starts (its competition's template's format, else the usual
// format, else 2×45), which of the format choices a format is, and the usual format a saved match
// leaves behind. The same rules as the phones' forms.

export type UsualFormat = NonNullable<UserSettings["usualFormat"]>;

/**
 * Two formats the same, counting a missing optional switch as its default (breakStoppage and goalScorers on, goldenGoal
 * and sinBins off, sinBinSec 10 minutes). EVT-12: with sin bins off, their length doesn't count. TMR-15: missing means the
 * clock runs on, and goals and cards stopping it only counts with a stopping clock.
 */
export function sameFormat(a: MatchFormat, b: MatchFormat): boolean {
    const full = (f: MatchFormat) => ({
        ...f, breakStoppage: f.breakStoppage ?? true, goalScorers: f.goalScorers ?? true, goldenGoal: f.goldenGoal ?? false,
        sinBins: f.sinBins ?? false, sinBinSec: f.sinBins ? (f.sinBinSec ?? 600) : 600,
        stoppingClock: f.stoppingClock ?? false, stopForGoalsCards: f.stoppingClock ? (f.stopForGoalsCards ?? true) : true,
    });
    const x = full(a);
    const y = full(b);
    return (Object.keys(x) as (keyof MatchFormat)[]).every((k) => x[k] === y[k]) && Object.keys(y).length === Object.keys(x).length;
}

/** A new match's role and format: a template asked for (?template=) or its competition's wins, then the usual format, then 2×45. */
export function newMatchStart(settings: Pick<UserSettings, "usualRole" | "usualFormat">, template?: Pick<MatchTemplate, "format">): { role: NonNullable<UserSettings["usualRole"]>; format: MatchFormat } {
    return {
        role: settings.usualRole ?? "referee",
        format: template?.format ?? settings.usualFormat?.format ?? defaultFormat,
    };
}

/** One of the format choices: the usual one as last saved, a starter format or a template. */
export interface FormatChoice {
    /** "last", "starter:us-u10", "template:<id>", or "none" when it's none of them. */
    id: string;
    name: string;
    starter?: StarterFormat;
    template?: MatchTemplate;
}

const starterChoice = (s: StarterFormat): FormatChoice => ({ id: `starter:${s.id}`, name: s.name, starter: s });
const templateChoice = (t: MatchTemplate): FormatChoice => ({ id: `template:${t.id}`, name: t.name, template: t });

/** What Settings → New matches shows as the usual format: the starter or template it came from while unchanged, else "As last saved". */
export function usualFormatChoice(usual: UsualFormat | undefined, templates: MatchTemplate[]): FormatChoice {
    if (!usual) {
        return { id: "none", name: "Not chosen yet" };
    }
    const starter = starterFormats.find((s) => s.id === usual.starterId && sameFormat(s.format, usual.format));
    if (starter) {
        return starterChoice(starter);
    }
    const template = templates.find((t) => t.id === usual.templateId && sameFormat(t.format, usual.format));
    return template ? templateChoice(template) : { id: "last", name: "As last saved" };
}

/**
 * Which choice a match's format is, for the form's Format: its own template while unchanged, the
 * usual format's source, then any starter or template with the same format; "none" when it's been
 * changed by hand.
 */
export function formatChoiceOf(format: MatchFormat, { templateId, usual, templates }: { templateId?: string; usual?: UsualFormat; templates: MatchTemplate[] }): FormatChoice {
    const own = templates.find((t) => t.id === templateId && sameFormat(t.format, format));
    if (own) {
        return templateChoice(own);
    }
    if (usual && sameFormat(usual.format, format)) {
        const choice = usualFormatChoice(usual, templates);
        return choice.id === "last" ? { id: "last", name: "Your usual" } : choice;
    }
    const starter = starterFormats.find((s) => sameFormat(s.format, format));
    if (starter) {
        return starterChoice(starter);
    }
    const template = templates.find((t) => sameFormat(t.format, format));
    return template ? templateChoice(template) : { id: "none", name: "Your own" };
}

/** The usual format a match saved from the form leaves (SET-17), with the starter or template it came from while unchanged. */
export function usualFormatFrom(format: MatchFormat, choice: FormatChoice, now: Date = new Date()): UsualFormat {
    return {
        format,
        ...(choice.starter ? { starterId: choice.starter.id } : {}),
        ...(choice.template ? { templateId: choice.template.id } : {}),
        changedAt: now.toISOString(),
    };
}

/** Whether saving this usual format would change anything, so a match saved with the same one doesn't touch the settings. */
export function usualChanged(before: UsualFormat | undefined, after: UsualFormat): boolean {
    return !before || !sameFormat(before.format, after.format) || before.starterId !== after.starterId || before.templateId !== after.templateId;
}

/** The starter format a match's age group suggests (U10: U9–U10 · 7v7 · 2×25), unless the match has that format already. */
export function suggestedStarter(ageGroup: string | undefined, format: MatchFormat): StarterFormat | undefined {
    const starter = starterFormatFor(ageGroup);
    return starter && !sameFormat(starter.format, format) ? starter : undefined;
}
