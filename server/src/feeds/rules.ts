import type { AssignorSystem } from "@lawfive/schema";
import type { z } from "zod";
import type { CalendarEvent } from "./ical.ts";

// What an assignor calendar's event becomes (FEED-5): the import's columns (IMP-3), so the feed
// saves matches the way a file does. Every system is read with Other's rules until it has its own
// (written from a real event, FEED-12), which then read the kept events again.

export type System = z.infer<typeof AssignorSystem>;

/** The import columns an event fills in; notes only on a new match, so the person's own stay theirs (FEED-6). */
export interface EventColumns {
    kickoff: string;
    timeZone?: string;
    home?: string;
    away?: string;
    /** The person's position, as the import's Role column takes it. */
    role?: "referee" | "ar1" | "ar2" | "fourth";
    name?: string;
    venue?: string;
    venueAddress?: string;
    pitch?: string;
    ageGroup?: string;
    gender?: string;
    /** The system's own number for the game, the match number (IMP-3). */
    number?: string;
    notes?: string;
}

export const systemNames: Record<System, string> = {
    arbiter: "ArbiterSports", assignr: "Assignr", horizon: "HorizonWebRef", reftown: "RefTown", gotsport: "GotSport", spordle: "Spordle", other: "Other",
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Positions as schedules write them before a game ("Center: Lincoln vs East", "AR1: United vs Rovers"). */
const positions: Record<string, NonNullable<EventColumns["role"]>> = {
    center: "referee", centre: "referee", referee: "referee", ref: "referee", cr: "referee", "center referee": "referee", "centre referee": "referee",
    ar: "ar1", ar1: "ar1", "ar 1": "ar1", ar2: "ar2", "ar 2": "ar2", assistant: "ar1", "assistant referee": "ar1", "assistant 1": "ar1", "assistant 2": "ar2",
    "4th": "fourth", fourth: "fourth", "4th official": "fourth", "fourth official": "fourth",
};

/**
 * What a summary says, written the way schedules write a game: a position and a division before
 * colons ("Center: U12 Girls: …"), then the teams, "Strikers v Rovers", "vs" or "vs.", or
 * "Rovers @ Strikers" (away at home). The division is kept as the match's name; with no one clear
 * way to read the teams, everything but the position is the name.
 */
export function readSummary(summary: string): { home?: string; away?: string; role?: EventColumns["role"]; name?: string } {
    const parts = oneLine(summary).split(/:\s+/).filter(Boolean);
    const game = parts.pop() ?? "";
    let role: EventColumns["role"];
    const before: string[] = [];
    for (const part of parts) {
        const position = positions[part.toLowerCase().replace(/\.$/, "")];
        position && !role ? (role = position) : before.push(part);
    }
    const split = game.split(/\s+(v|vs\.?|versus|@)\s+/i).map((p) => p.trim());
    const teams = split.length === 3 && split[0] && split[2] && split[0].length <= 60 && split[2].length <= 60
        ? (split[1] === "@" ? { home: split[2], away: split[0] } : { home: split[0], away: split[2] })
        : undefined;
    const name = (teams ? before : [...before, game]).join(": ");
    return { ...teams, ...(role ? { role } : {}), ...(name ? { name: clip(name, 100) } : {}) };
}

/**
 * Other's rules: the position, division and teams from the summary when it names them plainly,
 * else the summary as the match's name; the location's first part as the venue (the rest is usually its address); the
 * description as notes.
 */
function other(event: CalendarEvent & { start: string }): EventColumns {
    const said = readSummary(event.summary);
    const venue = oneLine(event.location.split(/,|\n/)[0] ?? "");
    const notes = event.description.trim();
    return {
        kickoff: event.start,
        ...(event.timeZone ? { timeZone: event.timeZone } : {}),
        ...said,
        ...(venue ? { venue: clip(venue, 100) } : {}),
        ...(notes ? { notes: clip(notes, 2000) } : {}),
    };
}

/** A description written as "Key: Value" lines, by key in lower case; and the lines that aren't. */
function fieldsOf(description: string): { fields: Map<string, string>; rest: string[] } {
    const fields = new Map<string, string>();
    const rest: string[] = [];
    for (const line of description.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const m = line.match(/^([A-Za-z][A-Za-z #]{0,30}):\s*(.*)$/);
        m && m[2] ? fields.set(m[1].trim().toLowerCase(), m[2].trim()) : rest.push(line);
    }
    return { fields, rest };
}

/**
 * ArbiterSports, from a real calendar (a team's on ArbiterLive, 2026-11-06): the description is
 * "Sport: Boys-Soccer", "Level: Varsity-3", "Team: …", "Site: …" (the venue) and "Subsite: …" (the
 * pitch); LOCATION is the street address; the UID is "G-" and Arbiter's game number; times are UTC.
 * A team's title is from its side, "Varsity-3 Boys-Soccer @ Opponent" away or "vs Opponent" at home,
 * with the team in Team. What's missing falls back to Other's rules, as an official's calendar may
 * write the game differently.
 */
function arbiter(event: CalendarEvent & { start: string }): EventColumns {
    const columns = other(event);
    const { fields, rest } = fieldsOf(event.description);
    const used = new Set(["sport", "level", "team", "site", "subsite"]);
    const team = fields.get("team");
    const side = oneLine(event.summary).match(/^(.*?)\s+(@|vs\.?|v)\s+(.+)$/i);
    if (team && side) {
        const opponent = side[3].trim();
        const [home, away] = side[2] === "@" ? [opponent, team] : [team, opponent];
        Object.assign(columns, { home: clip(home, 60), away: clip(away, 60) });
        delete columns.name;
    }
    const site = fields.get("site");
    if (site) {
        columns.venue = clip(site, 100);
        const address = oneLine(event.location).replace(/\s+,/g, ",");
        if (address) {
            columns.venueAddress = clip(address, 300);
        }
    }
    const subsite = fields.get("subsite");
    if (subsite) {
        columns.pitch = clip(subsite, 60);
    }
    const level = fields.get("level");
    if (level) {
        columns.ageGroup = clip(level, 30);
    }
    const sport = fields.get("sport")?.match(/^(boys|girls|men|women|coed|co-ed|mixed)\b/i)?.[1];
    if (sport) {
        columns.gender = sport.replace("-", "");
    }
    const game = event.uid.match(/^G-(\d+)$/)?.[1];
    if (game) {
        columns.number = game;
    }
    const notes = [...[...fields].filter(([k]) => !used.has(k)).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`), ...rest].join("\n");
    notes ? (columns.notes = clip(notes, 2000)) : delete columns.notes;
    return columns;
}

const rules: Record<System, (event: CalendarEvent & { start: string }) => EventColumns> = {
    arbiter, assignr: other, horizon: other, reftown: other, gotsport: other, spordle: other, other,
};

/**
 * Each system's rules' version, part of what an event is remembered by: raising one when its rules
 * change makes the next read save every event of that system's calendars again, from the kept
 * text, as though the assignor had changed them (FEED-5).
 */
export const rulesVersion: Record<System, number> = { arbiter: 2, assignr: 1, horizon: 1, reftown: 1, gotsport: 1, spordle: 1, other: 1 };

export function readEvent(system: System, event: CalendarEvent & { start: string }): EventColumns {
    return rules[system](event);
}
