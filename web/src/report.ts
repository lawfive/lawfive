import { misconductDescription } from "@lawfive/schema";
import type { Match, MatchEvent, MatchRecord } from "./api.ts";
import { clockAdjustedWords, matchMinute, sinBinLength, suspensionWords, teamName } from "./format.ts";

// The match report (DATA-6): what league forms ask for (match, officials, score, goals, each
// caution and send-off with number, minute and code, and each injury), as rows for the printable
// page and as text to paste into a league's or assignor's form. The phones' text (reportText in
// Android's Match.kt and the iPhone's Match.swift) says the same, line for line.

export interface ReportData {
    match: Match;
    record: MatchRecord;
    competition?: string;
    venue?: string;
    pitch?: string;
    /** The officials in order, the user included: "Referee", "Alex Morgan". */
    officials: { role: string; name: string }[];
}

export interface ReportGoal {
    minute: string;
    team: string;
    player: string;
    kind: string;
}

export interface ReportCard {
    minute: string;
    team: string;
    offender: string;
    card: string;
    code: string;
    description: string;
}

/** EVT-16: an injury, with how long play was stopped for it when the watch timed the stoppage. */
export interface ReportInjury {
    minute: string;
    team: string;
    player: string;
    /** "1:30", or "" when not timed. */
    stopped: string;
    note: string;
}

/** "Saturday, November 7, 2026" (with ", 9:00 AM" when asked), in the match's own time zone. */
export function fullDate(iso: string, timeZone?: string, withTime = false): string {
    const zone = timeZone ? { timeZone } : {};
    const date = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", ...zone }).format(new Date(iso));
    return withTime ? `${date}, ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", ...zone }).format(new Date(iso))}` : date;
}

/** TMR-15: the format the minutes are read with: the record says when the clock stopped, whatever the format says now. */
export function timedFormat(match: Match, record: { stoppingClock?: boolean }): Match["format"] {
    return record.stoppingClock ? { ...match.format, stoppingClock: true } : match.format;
}

/** When an event happened, as a report gives it: the match minute, or when outside play. */
function when(match: Match, e: MatchEvent, stoppingClock = false): string {
    if (e.when === "play" && e.period && e.periodSec !== undefined) {
        return matchMinute(timedFormat(match, { stoppingClock }), e.period, e.periodSec);
    }
    return { beforeKickoff: "Before kickoff", break: "During a break", afterFullTime: "After full time", penalties: "Shoot-out", play: "" }[e.when];
}

const goalKinds = { goal: "", directFreeKick: "Direct free kick", penalty: "Penalty", ownGoal: "Own goal" } as const;
const cardNames = { caution: "Caution", secondCaution: "Second caution (sent off)", sendOff: "Send-off" } as const;
const officialRoles = { headCoach: "Head coach", assistantCoach: "Assistant coach", other: "Team official" } as const;

/**
 * TMR-14: the clock's corrections during play, "12'  Clock adjusted +0:40", so the report says the times were corrected.
 * TMR-15: first, that the clock stopped when play stopped, as on the iPhone's report.
 */
export function clockLines(data: ReportData): string[] {
    const stopping = data.record.stoppingClock || data.match.format.stoppingClock ? ["Stopped when play stopped (the minutes are the clock's)"] : [];
    return [...stopping, ...data.record.events.flatMap((e) => (e.type === "clockAdjusted" ? [`${when(data.match, e, data.record.stoppingClock)}  ${clockAdjustedWords(e)}`] : []))];
}

/** TMR-13: the match suspended and resumed, "30'  Suspended 34:12 · Lightning", so the report says play stopped and for how long. */
export function suspensionLines(data: ReportData): string[] {
    return data.record.events.flatMap((e) => (e.type === "suspension" ? [`${when(data.match, e, data.record.stoppingClock)}  ${suspensionWords(e)}${e.note ? `: ${e.note}` : ""}`] : []));
}

/** "1:30": minutes and seconds, as a stoppage's length is written. */
function minutesAndSeconds(sec: number): string {
    const whole = Math.round(sec);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function reportRows(data: ReportData): { goals: ReportGoal[]; cards: ReportCard[]; injuries: ReportInjury[] } {
    const { match, record } = data;
    const side = (s: "home" | "away") => teamName(match[s], s);
    const goals: ReportGoal[] = [];
    const cards: ReportCard[] = [];
    const injuries: ReportInjury[] = [];
    for (const e of record.events) {
        if (e.type === "goal") {
            goals.push({ minute: when(match, e, record.stoppingClock), team: side(e.team), player: e.player ? `#${e.player}` : "", kind: goalKinds[e.goalType ?? "goal"] });
        } else if (e.type === "caution" || e.type === "secondCaution" || e.type === "sendOff" || e.type === "sinBin" || e.type === "secondSinBin") {
            cards.push({
                minute: when(match, e, record.stoppingClock),
                team: side(e.team),
                offender: e.offender.kind === "player" ? (e.offender.number ? `#${e.offender.number}` : "Player") : [officialRoles[e.offender.role], e.offender.name].filter(Boolean).join(" "),
                // EVT-12: "Sin bin (10 min)", and a second one as the send-off it is.
                card: e.type === "sinBin" ? `Sin bin (${sinBinLength(e.lengthSec)})` : e.type === "secondSinBin" ? "Second sin bin (sent off)" : cardNames[e.type],
                code: e.misconduct?.code ?? "",
                description: e.misconduct ? misconductDescription(e.misconduct) ?? "" : "",
            });
        } else if (e.type === "injury") {
            // EVT-16.
            injuries.push({ minute: when(match, e, record.stoppingClock), team: side(e.team), player: e.player ? `#${e.player}` : "Player", stopped: e.lengthSec ? minutesAndSeconds(e.lengthSec) : "", note: e.note ?? "" });
        }
    }
    return { goals, cards, injuries };
}

/** The result line: "Strikers U12 3 – 2 Rovers U12, full time (4–3 on penalties)", or "(golden goal)" (ET-6). */
export function resultLine(data: ReportData): string {
    const { match, record } = data;
    const pens = record.penalties ? ` (${record.penalties.home}–${record.penalties.away} on penalties)` : record.goldenGoal ? " (golden goal)" : "";
    return `${teamName(match.home, "home")} ${record.score.home} – ${record.score.away} ${teamName(match.away, "away")}, ${record.outcome === "abandoned" ? "abandoned" : "full time"}${pens}`;
}

/** "47'  Strikers U12  #3  Play stopped 1:30: note", as the text report lists an injury. */
export function injuryLine(i: ReportInjury): string {
    return [i.minute, i.team, i.player, i.stopped && `Play stopped ${i.stopped}`].filter(Boolean).join("  ") + (i.note ? `: ${i.note}` : "");
}

/** The whole report as plain text, to paste into a form or an email. */
export function reportText(data: ReportData): string {
    const { match } = data;
    const { goals, cards, injuries } = reportRows(data);
    const abandoned = data.record.events.find((e) => e.type === "abandonment");
    const lines = [
        "MATCH REPORT",
        ...(data.competition ? [data.competition] : []),
        `${teamName(match.home, "home")} v ${teamName(match.away, "away")}`,
        ...(match.kickoff ? [fullDate(match.kickoff, match.timeZone, true)] : []),
        ...([data.venue, data.pitch].some(Boolean) ? [[data.venue, data.pitch].filter(Boolean).join(", ")] : []),
        ...(match.external ? [`Match number: ${match.external.id}`] : []),
        // SET-15: who assigned it, as the printed page and the phones' text.
        ...(match.assignor ? [`Assignor: ${match.assignor}`] : []),
        "",
        "Officials",
        ...data.officials.map((o) => `${o.role}: ${o.name}`),
        "",
        // RES-1: a result corrected after the match says so, as the printable page's score does.
        `Result: ${resultLine(data)}${data.record.editedAt ? ", corrected after the match" : ""}`,
        ...(abandoned && abandoned.type === "abandonment" ? [`Abandoned ${when(match, abandoned, data.record.stoppingClock)}${abandoned.note ? `: ${abandoned.note}` : ""}`] : []),
        ...(suspensionLines(data).length ? ["", "Suspended", ...suspensionLines(data)] : []),
        ...(clockLines(data).length ? ["", "Clock", ...clockLines(data)] : []),
        "",
        "Goals",
        ...(goals.length ? goals.map((g) => [g.minute, g.team, g.player, g.kind].filter(Boolean).join("  ")) : ["None"]),
        "",
        "Cautions and send-offs",
        ...(cards.length ? cards.map((c) => [c.minute, c.team, c.offender, c.card, c.code && `${c.code}${c.description ? ` (${c.description})` : ""}`].filter(Boolean).join("  ")) : ["None"]),
        // EVT-16: only when there were any, as for the suspensions.
        ...(injuries.length ? ["", "Injuries", ...injuries.map(injuryLine)] : []),
    ];
    if (match.notes) {
        lines.push("", "Notes", match.notes);
    }
    return `${lines.join("\n")}\n`;
}
