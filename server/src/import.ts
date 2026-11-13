import {
    type ImportColumnId, type ImportRow, type ImportedRow, MatchImport, MatchImportFileFields, type MatchImportResult, type Role, collections, defaultFormat, importColumns, scopesAllow, squashColumnName, teamColours,
} from "@lawfive/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { ImportFileError, maxBytes, readImportFile } from "./importFile.ts";
import { saveRecord, uniqueViolation } from "./records.ts";
import { type StorageLimit, tooManyRecords } from "./usage.ts";
import { wallTime, zonedTimestamp } from "./zones.ts";
import { plansOf } from "./plans.ts";

export { wallTime, zonedTimestamp };

// Importing matches from a spreadsheet, CSV or JSON file (IMP-1 to IMP-8). The app reads the file
// into rows of column names and values; this matches each row to a match (its ID column, else its
// match number), finds or adds the venue, competition and referees it names, changes only what the
// row fills in, and checks the result against the schema like any other save. Rows with problems
// are skipped; a dry run saves nothing and says what would happen.
//
//   POST /v1/import/matches   { rows, timeZone?, dateOrder?, dryRun? }
//   POST /v1/import/file      the same, from a file (importFile.ts)

type Data = Record<string, unknown>;
type RoleName = z.infer<typeof Role>;
type Row = z.infer<typeof ImportRow>;
type RowResult = z.infer<typeof ImportedRow>;
type Result = z.infer<typeof MatchImportResult>;
type Column = ImportColumnId;

/** Each column by every heading that means it (lower case, letters and digits only), and by its heading for the problems. */
const columnOf = new Map<string, Column>(importColumns.flatMap((c) => [c.header, c.json, c.id, ...c.names].map((name) => [squashColumnName(name), c.id] as const)));
const columnLabels = Object.fromEntries(importColumns.map((c) => [c.id, c.header])) as Record<Column, string>;
const squash = squashColumnName;

const crewRoles = { referee: "referee", ar1: "ar1", ar2: "ar2", fourth: "fourth" } as const satisfies Partial<Record<Column, RoleName>>;
const roleWords: Record<string, RoleName> = {
    referee: "referee", ref: "referee", r: "referee", centre: "referee", center: "referee", cr: "referee", centrereferee: "referee", centerreferee: "referee",
    ar1: "ar1", ar: "ar1", a1: "ar1", assistant1: "ar1", assistantreferee1: "ar1",
    ar2: "ar2", a2: "ar2", assistant2: "ar2", assistantreferee2: "ar2",
    fourth: "fourth", "4th": "fourth", fourthofficial: "fourth", "4thofficial": "fourth", "4o": "fourth",
};
const statusWords: Record<string, string> = {
    scheduled: "scheduled", upcoming: "scheduled", played: "played", finished: "played", completed: "played", abandoned: "abandoned",
    cancelled: "cancelled", canceled: "cancelled", postponed: "postponed",
};
const genderWords: Record<string, string> = {
    male: "male", m: "male", men: "male", mens: "male", boys: "male", boy: "male",
    female: "female", f: "female", women: "female", womens: "female", girls: "female", girl: "female",
    coed: "coed", mixed: "coed", x: "coed",
};
const yes = new Set(["yes", "y", "true", "1", "paid", "x"]);
const no = new Set(["no", "n", "false", "0", "unpaid", "due"]);
/** Crew values that mean nobody yet. */
const nobody = new Set(["tbd", "tba", "tbc", "none", "na", "", "-"]);

/** The import body, as the endpoint takes it. */
export type ImportBody = z.infer<typeof MatchImport>;

interface Named { id: string; name: string; data: Data }
type Kind = "venue" | "competition" | "referee";

/** What the import knows of the user's records, kept up to date as rows add to them. */
class Library {
    matches = new Map<string, Data>();
    byNumber = new Map<string, string[]>();
    venues = new Map<string, Named>();
    competitions = new Map<string, Named>();
    referees = new Map<string, Named>();
    templates = new Map<string, Named>();
    /** Records rows need added (or a venue with a new pitch) before their matches are saved, with what kind. */
    pending = new Map<string, { type: Kind; data: Data }>();
    created = { venues: [] as string[], competitions: [] as string[], referees: [] as string[] };

    noteNumber(id: string, number: string) {
        const key = number.toLowerCase();
        const ids = this.byNumber.get(key) ?? [];
        if (!ids.includes(id)) {
            this.byNumber.set(key, [...ids, id]);
        }
    }
}

async function loadLibrary(db: Db, userId: string): Promise<{ library: Library; currency: string; userName: string }> {
    const { records, user } = tables;
    const rows = await db.select().from(records)
        .where(and(eq(records.userId, userId), isNull(records.deletedAt), inArray(records.type, ["match", "venue", "competition", "referee", "matchTemplate", "settings"])));
    const library = new Library();
    let currency = "USD";
    for (const row of rows) {
        const data = row.data as Data;
        const named = { id: row.id, name: String(data.name ?? ""), data };
        switch (row.type) {
            case "match": {
                library.matches.set(row.id, data);
                const external = data.external as { id: string } | undefined;
                if (external) {
                    library.noteNumber(row.id, external.id);
                }
                break;
            }
            case "venue":
                // By its other names too (DUP-7), so a merged-away name finds the venue kept; a
                // venue's own name wins over another's other name.
                library.venues.set(named.name.toLowerCase(), named);
                for (const name of (data.aliases as string[] | undefined) ?? []) {
                    if (!library.venues.has(name.toLowerCase())) {
                        library.venues.set(name.toLowerCase(), named);
                    }
                }
                break;
            case "competition": library.competitions.set(named.name.toLowerCase(), named); break;
            case "referee":
                // By their name and any other names (DUP-6), so a merged-away name finds the referee kept.
                for (const name of [named.name, ...((data.aliases as string[] | undefined) ?? [])]) {
                    library.referees.set(name.toLowerCase(), named);
                }
                break;
            case "matchTemplate": library.templates.set(named.name.toLowerCase(), named); break;
            case "settings": currency = String(data.currency ?? currency); break;
        }
    }
    const [me] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
    return { library, currency, userName: me?.name ?? "" };
}

/** The row's values by column, trimmed, leaving out empty ones; and the columns it didn't know. */
function readRow(row: Row): { values: Partial<Record<Column, string>>; unknown: string[] } {
    const values: Partial<Record<Column, string>> = {};
    const unknown: string[] = [];
    for (const [name, value] of Object.entries(row)) {
        const column = columnOf.get(squash(name));
        if (!column) {
            unknown.push(name);
            continue;
        }
        const text = value === null || value === undefined ? "" : String(value).trim();
        if (text !== "") {
            values[column] = text;
        }
    }
    return { values, unknown };
}

/** A date as YYYY-MM-DD: ISO, or with slashes, dots or dashes in the given order. */
export function parseDate(text: string, order: "dmy" | "mdy"): string | undefined {
    let y: number, m: number, d: number;
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const other = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (iso) {
        [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    } else if (other) {
        const [a, b] = [Number(other[1]), Number(other[2])];
        [d, m] = order === "dmy" ? [a, b] : [b, a];
        y = Number(other[3]) + (other[3].length === 2 ? 2000 : 0);
    } else {
        return undefined;
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        return undefined;
    }
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A time of day as HH:MM: 9:00, 09:00, 21:30, 9:30 pm, 9pm, 9.30. */
export function parseTime(text: string): string | undefined {
    const match = text.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(a|p)?\.?\s*m?\.?$/);
    if (!match || (match[2] === undefined && match[3] === undefined)) {
        return undefined;
    }
    let hours = Number(match[1]);
    const minutes = Number(match[2] ?? 0);
    if (match[3]) {
        if (hours < 1 || hours > 12) {
            return undefined;
        }
        hours = (hours % 12) + (match[3] === "p" ? 12 : 0);
    }
    if (hours > 23 || minutes > 59) {
        return undefined;
    }
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const validTimeZone = (zone: string) => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
};

/** A colour as #RRGGBB, from hex (with or without #) or one of the watch's colour names. */
function parseColour(text: string): string | undefined {
    const named = teamColours.find((c) => c.name.toLowerCase() === text.toLowerCase());
    if (named) {
        return named.hex;
    }
    const hex = text.replace(/^#/, "");
    return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : undefined;
}

/** A money amount: 40, 40.50, $1,200, 40,50 (a comma before two digits at the end is the decimal point). */
function parseAmount(text: string): number | undefined {
    let digits = text.replace(/[^\d.,-]/g, "");
    if (digits.includes(",") && digits.includes(".")) {
        digits = digits.replace(/,/g, "");
    } else if (/,\d{1,2}$/.test(digits)) {
        digits = digits.replace(",", ".");
    } else {
        digits = digits.replace(/,/g, "");
    }
    const amount = Number(digits);
    return digits !== "" && Number.isFinite(amount) ? amount : undefined;
}

const parseNumber = (text: string) => (/^-?\d+(\.\d+)?$/.test(text.replace(",", ".")) ? Number(text.replace(",", ".")) : undefined);

/** Schema paths, named as the file's columns, for the problems. */
const pathLabels: Record<string, string> = {
    kickoff: "Date and time", timeZone: "Time zone", status: "Status", name: "Match name", ageGroup: "Age group", gender: "Gender", role: "Role",
    "home.name": "Home", "home.alias": "Home short name", "home.colour": "Home color", "away.name": "Away", "away.alias": "Away short name", "away.colour": "Away color",
    "format.periods": "Periods", "format.periodSec": "Period length", "format.breakSec": "Half-time", "format.teamSize": "Team size",
    "fee.amount": "Fee", "fee.currency": "Currency", "external.id": "Match number", assignor: "Assignor", tags: "Tags", notes: "Notes", outlook: "Outlook", crew: "Crew",
};

interface Context {
    library: Library;
    currency: string;
    userName: string;
    timeZone: string;
    dateOrder: "dmy" | "mdy";
    /** Kinds of record an API key can't add (no write access); none for a signed-in session. */
    cantAdd: Set<string>;
    /** Where new match numbers come from: "import", or an assignor system for its calendar (FEED-5). */
    source: string;
}

interface Planned {
    result: RowResult;
    /** The match to save, when the row has no problems. */
    match?: { id: string; data: Data };
}

/** Works out what one row does, without saving anything. */
function planRow(index: number, values: Partial<Record<Column, string>>, ctx: Context): Planned {
    const { library } = ctx;
    const problems: string[] = [];
    const problem = (column: Column, text: string) => problems.push(`${columnLabels[column]}: ${text}`);

    // Which match: the ID column, else the match number (IMP-3).
    let id: string | undefined;
    let existing: Data | undefined;
    if (values.id) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(values.id)) {
            problem("id", "isn't a LawFive match ID");
        } else {
            id = values.id.toLowerCase();
            existing = library.matches.get(id);
        }
    } else if (values.number) {
        const ids = library.byNumber.get(values.number.toLowerCase()) ?? [];
        if (ids.length > 1) {
            problem("number", `${ids.length} of your matches have this number`);
        } else if (ids.length === 1) {
            id = ids[0];
            existing = library.matches.get(id);
        }
    }
    if (!existing && !values.home && !values.away && !values.date && !values.kickoff) {
        problems.push("A new match needs at least a date or its teams");
    }
    id ??= crypto.randomUUID();

    const match: Data = existing
        ? structuredClone(existing)
        : { status: "scheduled", format: defaultFormat, home: {}, away: {}, crew: [] };
    const team = (side: "home" | "away") => match[side] as { name?: string; alias?: string; colour?: string };

    // A name that needs a record: an existing one (or one an earlier row added), else a new one,
    // which joins the library only if the row is imported. A venue's new pitch is the same.
    const adds: { kind: Kind; named: Named }[] = [];
    const pitchesAdded = new Map<string, { venue: Named; data: Data; label: string }>();
    /** Venues already there given an address they didn't have, which aren't new venues for the plan's limit. */
    const addressed = new Map<string, { venue: Named; data: Data }>();
    const venueById = (venueId: unknown) => [...library.venues.values(), ...adds.filter((a) => a.kind === "venue").map((a) => a.named)].find((v) => v.id === venueId);
    const find = (kind: Kind, name: string, column: Column, extra: Data = {}): string | undefined => {
        const found = library[`${kind}s`].get(name.toLowerCase()) ?? adds.find((a) => a.kind === kind && a.named.name.toLowerCase() === name.toLowerCase())?.named;
        if (found) {
            return found.id;
        }
        if (ctx.cantAdd.has(kind)) {
            problem(column, `there's no ${kind} called "${name}", and this API key can't add one`);
            return undefined;
        }
        const named = { id: crypto.randomUUID(), name, data: { name, ...extra } };
        adds.push({ kind, named });
        return named.id;
    };

    if (values.status) {
        const status = statusWords[squash(values.status)];
        status ? (match.status = status) : problem("status", `"${values.status}" isn't scheduled, played, abandoned, canceled or postponed`);
    }
    if (values.number) {
        const external = match.external as { source: string; id: string } | undefined;
        if (external?.id !== values.number) {
            match.external = { source: external?.source ?? ctx.source, id: values.number };
        }
    }

    // Kickoff: a full timestamp, or a date and time in the row's time zone, the match's, or the app's (IMP-6).
    let zone = (match.timeZone as string | undefined) ?? ctx.timeZone;
    if (values.timeZone) {
        validTimeZone(values.timeZone) ? (match.timeZone = zone = values.timeZone) : problem("timeZone", `"${values.timeZone}" isn't a time zone name like America/Los_Angeles`);
    }
    if (values.kickoff) {
        const withOffset = /(z|[+-]\d{2}:?\d{2})$/i.test(values.kickoff) && !Number.isNaN(Date.parse(values.kickoff));
        const local = values.kickoff.match(/^(\d{4}-\d{2}-\d{2})[t ](\d{1,2}:\d{2})(?::\d{2})?$/i);
        if (withOffset) {
            match.kickoff = new Date(values.kickoff).toISOString().replace(/\.\d{3}Z$/, "Z");
        } else if (local) {
            match.kickoff = zonedTimestamp(local[1], parseTime(local[2]) ?? local[2], zone);
        } else {
            problem("kickoff", `"${values.kickoff}" isn't a date and time like 2026-11-07 10:00`);
        }
    } else if (values.date || values.time) {
        const before = typeof match.kickoff === "string" ? wallTime(match.kickoff, zone) : undefined;
        const date = values.date ? parseDate(values.date, ctx.dateOrder) : before?.date;
        const time = values.time ? parseTime(values.time) : before?.time;
        if (values.date && !date) {
            problem("date", `"${values.date}" isn't a date like 2026-11-07`);
        } else if (values.time && !time) {
            problem("time", `"${values.time}" isn't a time like 10:00 or 2:30 PM`);
        } else if (!date) {
            problem("date", "a time needs a date");
        } else if (!time) {
            problem("time", "a date needs a kickoff time");
        } else {
            match.kickoff = zonedTimestamp(date, time, zone);
        }
    }

    for (const side of ["home", "away"] as const) {
        const [name, short, colour] = side === "home" ? (["home", "homeShort", "homeColour"] as const) : (["away", "awayShort", "awayColour"] as const);
        if (values[name]) {
            team(side).name = values[name];
        }
        if (values[short]) {
            team(side).alias = values[short]!.toUpperCase();
        }
        if (values[colour]) {
            const hex = parseColour(values[colour]!);
            hex ? (team(side).colour = hex) : problem(colour, `"${values[colour]}" isn't a color like #D71920 or one of the watch's (${teamColours.map((c) => c.name.toLowerCase()).join(", ")})`);
        }
    }

    if (values.name) {
        match.name = values.name;
    }
    if (values.ageGroup) {
        match.ageGroup = values.ageGroup;
    }
    if (values.gender) {
        const gender = genderWords[squash(values.gender)];
        gender ? (match.gender = gender) : problem("gender", `"${values.gender}" isn't male, female or co-ed`);
    }
    if (values.notes) {
        match.notes = values.notes;
    }
    if (values.outlook) {
        match.outlook = values.outlook;
    }
    if (values.assignor) {
        match.assignor = values.assignor;
    }
    if (values.tags) {
        const tags = values.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean);
        match.tags = tags.filter((t, i) => tags.findIndex((u) => u.toLowerCase() === t.toLowerCase()) === i);
    }

    // The competition, then the format: a Template column, else the competition's template for a new match.
    let competitionTemplate: Named | undefined;
    if (values.competition) {
        const competitionId = find("competition", values.competition, "competition", { type: "league" });
        if (competitionId) {
            match.competitionId = competitionId;
            const competition = [...library.competitions.values()].find((c) => c.id === competitionId);
            competitionTemplate = [...library.templates.values()].find((t) => t.id === competition?.data.templateId);
        }
    }
    const template = values.template ? library.templates.get(values.template.toLowerCase()) : !existing ? competitionTemplate : undefined;
    if (values.template && !template) {
        problem("template", `there's no template called "${values.template}"`);
    }
    if (template) {
        match.format = structuredClone(template.data.format);
        match.templateId = template.id;
        const fee = (template.data.defaults as { fee?: Data } | undefined)?.fee;
        if (fee && !existing && !match.fee) {
            match.fee = structuredClone(fee);
        }
    }
    const format = (match.format = { ...(match.format as Data) });
    for (const [column, key, scale] of [["periods", "periods", 1], ["periodLength", "periodSec", 60], ["halfTime", "breakSec", 60], ["teamSize", "teamSize", 1]] as const) {
        if (values[column]) {
            const n = parseNumber(values[column]!);
            n === undefined ? problem(column, `"${values[column]}" isn't a number`) : (format[key] = Math.round(n * scale));
        }
    }

    // The venue and pitch: a new pitch is added to the venue (IMP-4).
    if (values.venue) {
        const venueId = find("venue", values.venue, "venue", { pitches: [] });
        if (venueId && venueId !== match.venueId) {
            match.venueId = venueId;
            delete match.pitchId;
        }
    }
    if (values.venueAddress) {
        const venue = venueById(match.venueId);
        if (!venue) {
            problem("venueAddress", "needs a venue");
        } else if (!venue.data.address) {
            const address = values.venueAddress.slice(0, 300);
            const added = adds.find((a) => a.named === venue);
            if (added) {
                added.named.data = { ...added.named.data, address };
            } else {
                addressed.set(venue.id, { venue, data: { ...venue.data, address } });
            }
        }
    }
    if (values.pitch) {
        const venue = venueById(match.venueId);
        if (!venue) {
            problem("pitch", "needs a venue");
        } else {
            const base = addressed.get(venue.id)?.data ?? venue.data;
            const pitches = base.pitches as { id: string; name: string; aliases?: string[] }[];
            let pitch = pitches.find((p) => [p.name, ...(p.aliases ?? [])].some((n) => n.toLowerCase() === values.pitch!.toLowerCase()));
            if (!pitch) {
                pitch = { id: crypto.randomUUID(), name: values.pitch };
                const data = { ...base, pitches: [...pitches, pitch] };
                const added = adds.find((a) => a.named === venue);
                if (added) {
                    added.named.data = data;
                } else {
                    addressed.delete(venue.id);
                    pitchesAdded.set(venue.id, { venue, data, label: `${venue.name}: ${values.pitch}` });
                }
            }
            match.pitchId = pitch.id;
        }
    }

    // Your role and the crew: a crew column with your own name is your role (IMP-7).
    let role = match.role as RoleName | undefined;
    if (values.role) {
        const found = roleWords[squash(values.role)];
        found ? (role = found) : problem("role", `"${values.role}" isn't referee, AR1, AR2 or fourth official`);
    }
    const me = ctx.userName.trim().toLowerCase();
    const named = (Object.keys(crewRoles) as (keyof typeof crewRoles)[]).filter((column) => values[column] !== undefined);
    if (!values.role && me) {
        const mine = named.find((column) => values[column]!.toLowerCase() === me);
        if (mine) {
            role = crewRoles[mine];
        }
    }
    if (role) {
        match.role = role;
    }
    if (named.length > 0 || values.role) {
        const changed = new Set<RoleName>(named.map((column) => crewRoles[column]));
        const crew = (match.crew as { role: RoleName }[]).filter((c) => !changed.has(c.role) && c.role !== role);
        for (const column of named) {
            const name = values[column]!;
            if (crewRoles[column] === role || nobody.has(name.toLowerCase()) || name.toLowerCase() === me) {
                continue;
            }
            // DATA-5: the same name typed in for this role before (not a saved referee) stays as it is,
            // so a LawFive spreadsheet imported again adds no referees.
            const typed = (match.crew as { role: RoleName; name?: string; refereeId?: string }[])
                .find((c) => c.role === crewRoles[column] && !c.refereeId && c.name?.toLowerCase() === name.toLowerCase());
            if (typed) {
                crew.push(typed);
                continue;
            }
            const refereeId = find("referee", name, column);
            if (refereeId) {
                crew.push({ role: crewRoles[column], refereeId } as { role: RoleName });
            }
        }
        const order: RoleName[] = ["referee", "ar1", "ar2", "fourth"];
        match.crew = crew.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    }

    // The fee: an amount, currency and paid, each changing only itself (IMP-7).
    const fee = match.fee as { amount: number; currency: string; paid: boolean } | undefined;
    if (values.fee || values.currency || values.paid) {
        const amount = values.fee ? parseAmount(values.fee) : fee?.amount;
        const currency = values.currency?.toUpperCase() ?? fee?.currency ?? ctx.currency;
        const paidText = values.paid?.toLowerCase();
        const paid = paidText === undefined ? fee?.paid ?? false : yes.has(paidText) ? true : no.has(paidText) ? false : undefined;
        if (values.fee && amount === undefined) {
            problem("fee", `"${values.fee}" isn't an amount`);
        } else if (amount === undefined) {
            problem("fee", `${values.currency ? "a currency" : "paid"} needs a fee`);
        } else if (paid === undefined) {
            problem("paid", `"${values.paid}" isn't yes or no`);
        } else {
            match.fee = { amount, currency, paid };
        }
    }

    // Then the same checks as any other save.
    const checked = collections.matches.input.safeParse(match);
    if (!checked.success) {
        for (const issue of checked.error.issues) {
            const path = issue.path.join(".");
            const label = pathLabels[path] ?? pathLabels[issue.path.slice(0, 2).join(".")] ?? pathLabels[String(issue.path[0])] ?? path;
            problems.push(`${label}: ${issue.message}`);
        }
    }

    const home = team("home").name ?? "Home";
    const away = team("away").name ?? "Away";
    const result: RowResult = {
        row: index,
        action: problems.length ? "skip" : existing ? "update" : "add",
        matchId: id,
        title: `${home} v ${away}`,
        ...(typeof match.kickoff === "string" ? { kickoff: match.kickoff } : {}),
        problems,
    };
    if (problems.length) {
        return { result };
    }
    // Later rows see this one and what it adds: a second row with the same number updates it.
    for (const { kind, named } of adds) {
        library[`${kind}s`].set(named.name.toLowerCase(), named);
        library.pending.set(named.id, { type: kind, data: named.data });
        library.created[`${kind}s`].push(named.name);
    }
    for (const { venue, data, label } of pitchesAdded.values()) {
        venue.data = data;
        library.pending.set(venue.id, { type: "venue", data });
        library.created.venues.push(label);
    }
    for (const { venue, data } of addressed.values()) {
        venue.data = data;
        library.pending.set(venue.id, { type: "venue", data });
    }
    library.matches.set(id, match);
    if (values.number) {
        library.noteNumber(id, values.number);
    }
    return { result, match: { id, data: match } };
}

/** Plans every row, then (unless it's a dry run) saves what they add and the matches. */
export async function importMatches(db: Db, userId: string, body: ImportBody, keyScopes: string[] | undefined, onChange?: (type: string) => void, source = "import"): Promise<Result> {
    const { library, currency, userName } = await loadLibrary(db, userId);
    const cantAdd = new Set(keyScopes ? (["venue", "competition", "referee"] as const).filter((kind) => !scopesAllow(keyScopes, `${kind}s:write`)) : []);
    const ctx: Context = { library, currency, userName, timeZone: body.timeZone && validTimeZone(body.timeZone) ? body.timeZone : "UTC", dateOrder: body.dateOrder ?? "mdy", cantAdd, source };
    const ignored = new Set<string>();
    const results: RowResult[] = [];
    const types = new Set<string>();

    for (const [i, row] of body.rows.entries()) {
        const { values, unknown } = readRow(row);
        unknown.forEach((name) => ignored.add(name));
        if (Object.keys(values).length === 0) {
            continue;
        }
        const planned = planRow(i + 1, values, ctx);
        if (planned.match && !body.dryRun) {
            try {
                for (const [id, { type, data }] of library.pending) {
                    const collection = type === "venue" ? "venues" : type === "competition" ? "competitions" : "referees";
                    const parsed = collections[collection].input.parse(data);
                    await saveRecord(db, userId, type, id, parsed as Data, "any");
                    types.add(type);
                }
                library.pending.clear();
                const saved = await saveRecord(db, userId, "match", planned.match.id, planned.match.data, "any");
                if (saved.status === 409) {
                    throw new Error(saved.error);
                }
                types.add("match");
            } catch (error) {
                const index = uniqueViolation(error);
                planned.result.action = "skip";
                planned.result.problems.push(index?.includes("records_external") ? "Match number: another of your matches has it" : error instanceof Error ? error.message : "it couldn't be saved");
                library.matches.delete(planned.match.id);
            }
        }
        results.push(planned.result);
    }
    types.forEach((type) => onChange?.(type));
    const count = (action: RowResult["action"]) => results.filter((r) => r.action === action).length;
    return {
        rows: results,
        added: count("add"),
        updated: count("update"),
        skipped: count("skip"),
        created: library.created,
        ignoredColumns: [...ignored],
    };
}

export function importApi(db: Db, onChange?: (type: string) => void, storageLimit?: StorageLimit) {
    const api = new Hono<{ Variables: { userId: string; keyScopes?: string[] } }>();
    // SEC-6: a limit set and the account already as full as it gets.
    const refuseWhenFull = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
        if (await tooManyRecords(db, c.var.userId, storageLimit)) {
            return c.json({ error: "This account has as many records as it can keep. Delete some first." }, 409);
        }
        await next();
    });
    // PLAN-4: what an import would add, within the plan's matches, venues and referees; checked on a
    // dry run too, so the preview says so before anything is saved. Nothing is saved when it's over.
    const withinPlan = async (userId: string, body: ImportBody, keyScopes: string[] | undefined) => {
        const plan = await plansOf(db).limits(userId);
        if (plan.matches === undefined && plan.venues === undefined && plan.referees === undefined) {
            return { refused: undefined, preview: undefined };
        }
        const preview = await importMatches(db, userId, { ...body, dryRun: true }, keyScopes);
        const plans = plansOf(db);
        const refused = await plans.refuse(userId, "matches", preview.added)
            ?? await plans.refuse(userId, "venues", preview.created.venues.length)
            ?? await plans.refuse(userId, "referees", preview.created.referees.length);
        return { refused, preview };
    };
    const runImport = async (userId: string, body: ImportBody, keyScopes: string[] | undefined) => {
        const { refused, preview } = await withinPlan(userId, body, keyScopes);
        if (refused) {
            return { refused };
        }
        return { result: body.dryRun && preview ? preview : await importMatches(db, userId, body, keyScopes, onChange) };
    };
    api.post("/import/matches", refuseWhenFull, async (c) => {
        const body = MatchImport.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid import", issues: body.error.issues }, 400);
        }
        const done = await runImport(c.var.userId, body.data, c.var.keyScopes);
        return done.refused ? c.json(done.refused, 403) : c.json(done.result);
    });
    // IMP-2: the same import from a file, read here so every client reads files the same way.
    api.post("/import/file", refuseWhenFull, bodyLimit({ maxSize: maxBytes + 64 * 1024, onError: (c) => c.json({ error: "That file is over 5 MB. Split it into smaller files." }, 400) }), async (c) => {
        const form = await c.req.parseBody().catch(() => undefined);
        if (!form) {
            return c.json({ error: "send the file as multipart/form-data" }, 400);
        }
        const fields = MatchImportFileFields.safeParse(Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === "string")));
        if (!fields.success) {
            return c.json({ error: "invalid import", issues: fields.error.issues }, 400);
        }
        if (!(form.file instanceof File)) {
            return c.json({ error: "Choose a file: CSV, Excel (.xlsx) or JSON." }, 400);
        }
        // PLAN-2: the plan's largest file, within the server's own.
        const largest = await plansOf(db).largest(c.var.userId, "fileMb", maxBytes);
        if (form.file.size > largest) {
            return c.json({ error: `That file is over ${Math.round((largest / (1024 * 1024)) * 10) / 10} MB${largest < maxBytes ? ", your plan's most" : ""}. Split it into smaller files.` }, 400);
        }
        let read;
        try {
            read = await readImportFile(form.file.name, form.file.type, new Uint8Array(await form.file.arrayBuffer()));
        } catch (error) {
            if (error instanceof ImportFileError) {
                return c.json({ error: error.message }, 400);
            }
            throw error;
        }
        const { dryRun, ...options } = fields.data;
        const done = await runImport(c.var.userId, { ...options, rows: read.rows, dryRun: dryRun === "true" }, c.var.keyScopes);
        return done.refused ? c.json(done.refused, 403) : c.json({ ...done.result, file: { kind: read.kind, lines: read.lines } });
    });
    return api;
}
