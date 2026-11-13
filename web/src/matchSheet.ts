import { importColumns } from "@lawfive/schema";
import type { Competition, Match, MatchTemplate, Referee, Venue } from "./api.ts";

// Matches as a spreadsheet (DATA-5): the match list as narrowed, in Import's columns (IMP-2), so
// a file edited and imported again updates the same matches by their LawFive ID.

interface Lookups {
    venues: Map<string, Venue>;
    competitions: Map<string, Competition>;
    referees: Map<string, Referee>;
    templates: Map<string, MatchTemplate>;
}

/** Kickoff is left out: Date, Time and Time zone say the same, as a spreadsheet holds them. */
const columns = importColumns.filter((c) => c.id !== "kickoff");
const roles = { referee: "referee", ar1: "AR1", ar2: "AR2", fourth: "fourth official" } as const;
const genders = { male: "male", female: "female", coed: "co-ed" } as const;

/** The day and 24-hour time of a kickoff in its own time zone: ["2026-11-07", "14:30"]. */
function localParts(iso: string, timeZone: string): [string, string] {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
    return [`${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}`];
}

/** One row a match, by column id. */
function row(m: Match, look: Lookups): Record<string, string | number | undefined> {
    const zone = m.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const [date, time] = m.kickoff ? localParts(m.kickoff, zone) : [undefined, undefined];
    const venue = m.venueId ? look.venues.get(m.venueId) : undefined;
    const crew = (role: string) => {
        const member = m.crew.find((c) => c.role === role);
        return member && ((member.refereeId ? look.referees.get(member.refereeId)?.name : undefined) ?? member.name);
    };
    return {
        id: m.id,
        number: m.external?.id,
        assignor: m.assignor,
        status: m.status,
        date,
        time,
        timeZone: m.kickoff ? zone : undefined,
        home: m.home.name,
        homeShort: m.home.alias,
        homeColour: m.home.colour,
        away: m.away.name,
        awayShort: m.away.alias,
        awayColour: m.away.colour,
        competition: m.competitionId ? look.competitions.get(m.competitionId)?.name : undefined,
        venue: venue?.name,
        venueAddress: venue?.address,
        pitch: venue?.pitches.find((p) => p.id === m.pitchId)?.name,
        name: m.name,
        ageGroup: m.ageGroup,
        gender: m.gender && genders[m.gender],
        role: m.role && roles[m.role],
        referee: crew("referee"),
        ar1: crew("ar1"),
        ar2: crew("ar2"),
        fourth: crew("fourth"),
        template: m.templateId ? look.templates.get(m.templateId)?.name : undefined,
        periods: m.format.periods,
        periodLength: m.format.periodSec / 60,
        halfTime: m.format.breakSec / 60,
        teamSize: m.format.teamSize,
        fee: m.fee?.amount,
        currency: m.fee?.currency,
        paid: m.fee ? (m.fee.paid ? "yes" : "no") : undefined,
        tags: m.tags?.join(", "),
        notes: m.notes,
        outlook: m.outlook,
    };
}

const csvField = (value: string | number | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (ext: string) => `lawfive-matches-${new Date().toISOString().slice(0, 10)}.${ext}`;

export function downloadMatchesCsv(matches: Match[], look: Lookups) {
    const lines = [columns.map((c) => c.header), ...matches.map((m) => { const r = row(m, look); return columns.map((c) => r[c.id]); })];
    // With a byte-order mark, so Excel reads accented names right.
    save(new Blob([`﻿${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), fileName("csv"));
}

export async function downloadMatchesXlsx(matches: Match[], look: Lookups) {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const data = [
        columns.map((c) => ({ value: c.header, fontWeight: "bold" as const })),
        ...matches.map((m) => {
            const r = row(m, look);
            return columns.map((c) => {
                const value = r[c.id];
                return value === undefined || value === "" ? null : { value };
            });
        }),
    ];
    const blob = await writeXlsxFile(data as never, {
        sheet: "Matches",
        columns: columns.map((c) => ({ width: Math.max(10, c.header.length + 2) })),
        stickyRowsCount: 1,
    }).toBlob();
    save(blob, fileName("xlsx"));
}
