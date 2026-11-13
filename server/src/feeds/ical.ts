import { zonedTimestamp } from "../zones.ts";

// Reading an iCalendar file (RFC 5545) for assignor calendars (FEED-4), without a library: the
// format is small, and only events are wanted. Lines are unfolded, text unescaped, and each event's
// start read as UTC, in its TZID, or (floating) in the calendar's own zone or the account's.
// All-day events are skipped, and repeating ones read as their first time only.

/** One property as the calendar wrote it: SUMMARY, its parameters, and its value (unescaped for text). */
export interface Property {
    name: string;
    params: Record<string, string>;
    value: string;
}

export interface CalendarEvent {
    uid: string;
    summary: string;
    description: string;
    location: string;
    /** The kickoff as an ISO timestamp, and the time zone it was written in when there was one. */
    start?: string;
    timeZone?: string;
    allDay: boolean;
    canceled: boolean;
    /** Every property, for keeping (FEED-5). */
    properties: Property[];
}

export interface Calendar {
    name?: string;
    timeZone?: string;
    events: CalendarEvent[];
}

export class NotACalendar extends Error {}

const textProperties = new Set(["SUMMARY", "DESCRIPTION", "LOCATION", "COMMENT", "CATEGORIES", "X-WR-CALNAME", "X-WR-CALDESC"]);

/** \n, \N, \, \; and \\ as what they stand for. */
function unescape(text: string): string {
    return text.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** A content line, NAME;PARAM=VALUE;PARAM="QUOTED":value, split at the first colon outside quotes. */
function parseLine(line: string): Property | undefined {
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "\"") {
            quoted = !quoted;
        } else if (line[i] === ":" && !quoted) {
            colon = i;
            break;
        }
    }
    if (colon <= 0) {
        return undefined;
    }
    const [name, ...paramParts] = line.slice(0, colon).match(/(?:[^;"]|"[^"]*")+/g) ?? [];
    if (!name) {
        return undefined;
    }
    const params: Record<string, string> = {};
    for (const part of paramParts) {
        const eq = part.indexOf("=");
        if (eq > 0) {
            params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
        }
    }
    const upper = name.toUpperCase();
    const raw = line.slice(colon + 1);
    return { name: upper, params, value: textProperties.has(upper) ? unescape(raw) : raw };
}

// The Windows names Outlook and Exchange write as TZID, for the zones referees are most likely in.
const windowsZones: Record<string, string> = {
    "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago", "Mountain Standard Time": "America/Denver",
    "US Mountain Standard Time": "America/Phoenix", "Pacific Standard Time": "America/Los_Angeles", "Alaskan Standard Time": "America/Anchorage",
    "Hawaiian Standard Time": "Pacific/Honolulu", "Atlantic Standard Time": "America/Halifax", "Newfoundland Standard Time": "America/St_Johns",
    "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik", "W. Europe Standard Time": "Europe/Berlin",
    "Romance Standard Time": "Europe/Paris", "Central Europe Standard Time": "Europe/Budapest", "E. Australia Standard Time": "Australia/Brisbane",
    "AUS Eastern Standard Time": "Australia/Sydney", "New Zealand Standard Time": "Pacific/Auckland", "UTC": "UTC",
};

const knownZone = (zone: string) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
};

/** An IANA time zone for a TZID: as it is, a Windows name, or the end of a path some calendars write ("/mozilla.org/…/America/New_York"). */
export function zoneOf(tzid: string | undefined): string | undefined {
    if (!tzid) {
        return undefined;
    }
    const name = tzid.trim();
    if (windowsZones[name]) {
        return windowsZones[name];
    }
    const parts = name.split("/").filter(Boolean);
    for (let take = Math.min(3, parts.length); take >= 1; take--) {
        const candidate = parts.slice(-take).join("/");
        if (knownZone(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/** A DTSTART as an ISO timestamp, and whether it's a whole day; undefined when it can't be read. */
function readStart(p: Property, calendarZone: string | undefined, fallbackZone: string): { start?: string; timeZone?: string; allDay: boolean } {
    const value = p.value.trim();
    if (p.params.VALUE?.toUpperCase() === "DATE" || /^\d{8}$/.test(value)) {
        return { allDay: true };
    }
    const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i);
    if (!m) {
        return { allDay: false };
    }
    const [, y, mo, d, h, mi, , utc] = m;
    const date = `${y}-${mo}-${d}`;
    const time = `${h}:${mi}`;
    if (utc) {
        const iso = `${date}T${time}:00Z`;
        return Number.isNaN(Date.parse(iso)) ? { allDay: false } : { start: iso, ...(calendarZone ? { timeZone: calendarZone } : {}), allDay: false };
    }
    const zone = zoneOf(p.params.TZID) ?? calendarZone ?? fallbackZone;
    return { start: zonedTimestamp(date, time, zone), timeZone: zone, allDay: false };
}

/**
 * Reads a calendar's events. `fallbackZone` is for times written with no zone at all, when the
 * calendar doesn't name one either: the account's.
 */
export function parseCalendar(text: string, fallbackZone = "UTC"): Calendar {
    const unfolded = text.replace(/^﻿/, "").replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "");
    const lines = unfolded.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length || lines[0].trim().toUpperCase() !== "BEGIN:VCALENDAR") {
        throw new NotACalendar("It isn't a calendar file (it doesn't start with BEGIN:VCALENDAR).");
    }
    const calendar: Calendar = { events: [] };
    const blocks: Property[][] = [];
    /** The components we're inside, innermost last; only a VEVENT's own properties are kept. */
    const stack: string[] = [];
    let current: Property[] | undefined;
    for (const line of lines) {
        const p = parseLine(line);
        if (!p) {
            continue;
        }
        if (p.name === "BEGIN") {
            stack.push(p.value.trim().toUpperCase());
            if (stack.at(-1) === "VEVENT" && stack.length === 2) {
                current = [];
            }
            continue;
        }
        if (p.name === "END") {
            if (stack.pop() === "VEVENT" && current && stack.length === 1) {
                blocks.push(current);
                current = undefined;
            }
            continue;
        }
        if (stack.length === 1) {
            if (p.name === "X-WR-CALNAME") {
                calendar.name = p.value.trim() || undefined;
            } else if (p.name === "X-WR-TIMEZONE") {
                calendar.timeZone = zoneOf(p.value);
            }
        } else if (current && stack.length === 2) {
            current.push(p);
        }
    }
    for (const props of blocks) {
        const get = (name: string) => props.find((p) => p.name === name);
        const dtstart = get("DTSTART");
        const start = dtstart ? readStart(dtstart, calendar.timeZone, fallbackZone) : { allDay: false };
        calendar.events.push({
            uid: get("UID")?.value.trim() ?? "",
            summary: get("SUMMARY")?.value.trim() ?? "",
            description: get("DESCRIPTION")?.value.trim() ?? "",
            location: get("LOCATION")?.value.trim() ?? "",
            ...start,
            canceled: get("STATUS")?.value.trim().toUpperCase() === "CANCELLED",
            properties: props,
        });
    }
    return calendar;
}
