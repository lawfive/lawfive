import { AssignorCalendarChange, AssignorCalendarLink, Id, NewAssignorCalendar, type AssignorCalendar, type AssignorCalendarPreview } from "@lawfive/schema";
import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "../db/index.ts";
import { importMatches } from "../import.ts";
import { asActor } from "../notices.ts";
import { plansOf } from "../plans.ts";
import { tooManyRecords } from "../usage.ts";
import { type CalendarEvent, NotACalendar, parseCalendar } from "./ical.ts";
import { type CalendarFetcher, calendarUrl, fetchCalendar, linkStart } from "./fetch.ts";
import { type EventColumns, type System, readEvent, rulesVersion } from "./rules.ts";

// Assignor calendars (FEED-1 to FEED-10): a referee pastes the private calendar link their assignor
// system gives them, and the server reads it every 30 minutes into their matches, through the
// import (IMP-3), as an integration whose changes can notify their phones (NOTE-1). Each event is
// remembered by its UID with the match it became; an event that hasn't changed changes nothing,
// so what the person edits stays theirs until the assignor changes the game (FEED-6).
//
//   GET    /v1/assignor-calendars             the account's calendars
//   POST   /v1/assignor-calendars/preview     what a link holds, saving nothing
//   POST   /v1/assignor-calendars             connect one, and read it
//   PATCH  /v1/assignor-calendars/:id         rename, notifications, pause or resume, a new link
//   DELETE /v1/assignor-calendars/:id         remove one; its matches stay
//   POST   /v1/assignor-calendars/:id/read    read it now

type Row = typeof tables.assignorCalendar.$inferSelect;
type EventRow = typeof tables.assignorEvent.$inferSelect;
type Out = z.infer<typeof AssignorCalendar>;
type Preview = z.infer<typeof AssignorCalendarPreview>;
type Skipped = Row["skipped"][number];
type Data = Record<string, unknown>;

const READ_EVERY_MS = 30 * 60_000;
/** Up to two minutes later, so a server with many calendars doesn't read them all at once. */
const JITTER_MS = 2 * 60_000;
const GONE_PAUSES_AFTER = 3;
const MOST_EVENTS = 500;
const MOST_SKIPPED = 20;

export interface AssignorCalendarOptions {
    /** The server's AUTH_SECRET, which the links are encrypted with (FEED-2). */
    authSecret: string;
    /** Whether links may reach private and local addresses: the webhooks' setting (HOOK-4). */
    allowPrivate?: () => boolean;
    fetcher?: CalendarFetcher;
    now?: () => number;
    /** A record type was saved, for the weather (WX-2). */
    onChange?: (type: string) => void;
}

/** What the import would get for one event, and what's remembered of it. */
interface Planned {
    key: string;
    event: CalendarEvent & { start: string };
    columns: EventColumns;
    hash: string;
    /** The match it became, or the one already in LawFive it takes on. */
    matchId?: string;
    /** The import row, when there's something to save. */
    row?: Record<string, string>;
    linked?: boolean;
}

/** UID, and RECURRENCE-ID for a repeat's own instance, which shares its UID. */
const keyOf = (e: CalendarEvent) => {
    const recurrence = e.properties.find((p) => p.name === "RECURRENCE-ID")?.value;
    return recurrence ? `${e.uid}#${recurrence}` : e.uid;
};

/** What an event is remembered by: what it says (not when the calendar was made), and the rules it was read with. */
const volatile = new Set(["DTSTAMP", "LAST-MODIFIED", "CREATED", "SEQUENCE"]);
function hashOf(system: System, e: CalendarEvent): string {
    const said = e.properties.filter((p) => !volatile.has(p.name));
    return createHash("sha256").update(JSON.stringify([rulesVersion[system], said])).digest("base64url");
}

/** As the match list would name it: its teams, else its name. */
const titleOf = (c: EventColumns) => (c.home && c.away ? `${c.home} v ${c.away}` : c.name ?? "Home v Away");

export class AssignorCalendars {
    private readonly db: Db;
    private readonly options: AssignorCalendarOptions;
    private readonly cipherKey: Buffer;
    private readonly fetcher: CalendarFetcher;
    private readonly reading = new Set<string>();
    private timer?: ReturnType<typeof setInterval>;

    constructor(db: Db, options: AssignorCalendarOptions) {
        this.db = db;
        this.options = options;
        this.cipherKey = createHash("sha256").update(`lawfive assignor calendars:${options.authSecret}`).digest();
        this.fetcher = options.fetcher ?? fetchCalendar;
    }

    private now() {
        return this.options.now?.() ?? Date.now();
    }

    private allowPrivate() {
        return this.options.allowPrivate?.() ?? false;
    }

    /** Reads the calendars that are due every minute (FEED-3). */
    start(everyMs = 60_000) {
        this.timer = setInterval(() => void this.readDue().catch((e: unknown) => console.error("Reading assignor calendars failed:", e)), everyMs);
        this.timer.unref();
    }

    stop() {
        clearInterval(this.timer);
    }

    async readDue() {
        const { assignorCalendar } = tables;
        const due = await this.db.select().from(assignorCalendar)
            .where(and(eq(assignorCalendar.active, true), lte(assignorCalendar.nextReadAt, new Date(this.now()))))
            .orderBy(asc(assignorCalendar.nextReadAt)).limit(20);
        for (const row of due) {
            await this.read(row);
        }
    }

    private encrypt(text: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.cipherKey, iv);
        const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
        return `enc:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
    }

    /** The link, or undefined when AUTH_SECRET changed since it was saved. */
    private decrypt(stored: string): string | undefined {
        try {
            const raw = Buffer.from(stored.replace(/^enc:/, ""), "base64");
            const decipher = createDecipheriv("aes-256-gcm", this.cipherKey, raw.subarray(0, 12));
            decipher.setAuthTag(raw.subarray(12, 28));
            return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
        } catch {
            return undefined;
        }
    }

    /** The account's time zone, for times a calendar writes with none (FEED-4). */
    private async zoneOf(userId: string): Promise<string> {
        const { records } = tables;
        const [settings] = await this.db.select({ data: records.data }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "settings"), isNull(records.deletedAt)));
        return (settings?.data.timeZone as string | undefined) ?? "UTC";
    }

    /** Fetches and reads a link, or says why it can't be. */
    private async load(url: string, userId: string, conditional?: Pick<Row, "etag" | "lastModified">) {
        const fetched = await this.fetcher(url, { allowPrivate: this.allowPrivate(), ...(conditional?.etag ? { etag: conditional.etag } : {}), ...(conditional?.lastModified ? { lastModified: conditional.lastModified } : {}) });
        if (fetched.status !== "ok") {
            return fetched;
        }
        try {
            const calendar = parseCalendar(fetched.body, await this.zoneOf(userId));
            return { status: "ok" as const, calendar, etag: fetched.etag, lastModified: fetched.lastModified };
        } catch (e) {
            if (e instanceof NotACalendar) {
                return { status: "gone" as const, problem: `The link doesn't give a calendar: ${e.message}` };
            }
            throw e;
        }
    }

    /**
     * Works out what each event does to the account's matches (FEED-5 to FEED-7) and, unless it's a
     * preview, saves it. `calendar` is undefined for a preview of a link not yet connected.
     */
    private async sync(userId: string, system: System, events: CalendarEvent[], calendar: Row | undefined, dryRun: boolean) {
        const { assignorEvent, assignorCalendar, records } = tables;
        const now = this.now();
        const skipped: Skipped[] = [];
        const remembered = new Map<string, EventRow>(calendar
            ? (await this.db.select().from(assignorEvent).where(eq(assignorEvent.calendarId, calendar.id))).map((e) => [e.uid, e])
            : []);

        // The games still to come, soonest first, as many as are read.
        const seen = new Set<string>();
        const coming: (CalendarEvent & { start: string })[] = [];
        const canceledKeys = new Set<string>();
        for (const e of events) {
            if (e.allDay) {
                continue;
            }
            const key = keyOf(e);
            if (!e.uid) {
                skipped.push({ title: e.summary || "An event", ...(e.start ? { kickoff: e.start } : {}), reason: "It has no UID, so it couldn't be told apart from the others." });
                continue;
            }
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            if (!e.start) {
                skipped.push({ title: e.summary || "An event", reason: "Its start time couldn't be read." });
                continue;
            }
            if (Date.parse(e.start) <= now) {
                continue;
            }
            if (e.canceled) {
                canceledKeys.add(key);
                continue;
            }
            coming.push(e as CalendarEvent & { start: string });
        }
        coming.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
        const read = coming.slice(0, MOST_EVENTS);

        // The account's matches, and which are already some calendar's.
        const matchRows = await this.db.select({ id: records.id, data: records.data, deletedAt: records.deletedAt }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "match")));
        const matches = new Map(matchRows.filter((m) => !m.deletedAt).map((m) => [m.id, m.data]));
        const mine = await this.db.select({ id: assignorCalendar.id }).from(assignorCalendar).where(eq(assignorCalendar.userId, userId));
        const taken = new Set(mine.length
            ? (await this.db.select({ matchId: assignorEvent.matchId }).from(assignorEvent).where(inArray(assignorEvent.calendarId, mine.map((c) => c.id)))).map((e) => e.matchId)
            : []);
        const atKickoff = new Map<number, string>();
        for (const [id, data] of matches) {
            const status = data.status as string;
            if (typeof data.kickoff === "string" && !taken.has(id) && (status === "scheduled" || status === "postponed")) {
                atKickoff.set(Date.parse(data.kickoff), id);
            }
        }

        // FEED-4: a game written in UTC, with no zone of its own, is in the account's.
        const zone = await this.zoneOf(userId);
        const planned: Planned[] = [];
        for (const event of read) {
            const key = keyOf(event);
            const said = readEvent(system, event);
            const columns = { ...said, timeZone: said.timeZone ?? zone };
            const hash = hashOf(system, event);
            const before = remembered.get(key);
            const p: Planned = { key, event, columns, hash };
            planned.push(p);
            if (before) {
                p.matchId = before.matchId;
                const match = matches.get(before.matchId);
                // Deleted in LawFive stays deleted; a played match is never changed (FEED-6).
                if (!match || match.status === "played" || match.status === "abandoned") {
                    continue;
                }
                const backOn = before.canceled && match.status === "cancelled";
                if (before.hash === hash && !backOn) {
                    continue;
                }
                const { notes, ...changed } = columns;
                p.row = { id: before.matchId, ...(before.hash === hash ? {} : changed), ...(backOn ? { status: "scheduled" } : {}) };
                continue;
            }
            const existing = atKickoff.get(Date.parse(event.start));
            if (existing) {
                // Already in LawFive, typed in or imported: the calendar takes it on as it is (FEED-5).
                atKickoff.delete(Date.parse(event.start));
                p.matchId = existing;
                p.linked = true;
                continue;
            }
            p.row = { ...columns };
        }

        // Gone from the calendar, or canceled in it, before kickoff: canceled here (FEED-7).
        const cancels: EventRow[] = [];
        const present = new Set(planned.map((p) => p.key));
        for (const [key, before] of remembered) {
            const gone = !present.has(key) && (canceledKeys.has(key) || !seen.has(key));
            const match = matches.get(before.matchId);
            if (gone && !before.canceled && before.kickoff.getTime() > now && match?.status === "scheduled") {
                cancels.push(before);
            }
        }

        const cancelRows = cancels.map((c) => ({ id: c.matchId, status: "cancelled" }));
        const rowsNow = () => [...planned.flatMap((p) => (p.row ? [p.row] : [])), ...cancelRows];
        let rows = rowsNow();
        let result: Awaited<ReturnType<typeof importMatches>> | undefined;
        if (rows.length) {
            const check = await importMatches(this.db, userId, { rows, timeZone: zone, dryRun: true }, undefined, undefined, system);
            result = check;
            if (!dryRun && calendar) {
                // PLAN-4, SEC-6: over the plan's matches or venues, or an account that's full, only changes are saved.
                const plans = plansOf(this.db);
                const over = check.added > 0 || check.created.venues.length > 0
                    ? await plans.refuse(userId, "matches", check.added) ?? await plans.refuse(userId, "venues", check.created.venues.length)
                    : undefined;
                const full = check.added > 0 && await tooManyRecords(this.db, userId, (id) => plans.storageBytes(id));
                const refusal = over?.error ?? (full ? "This account has as many records as it can keep." : undefined);
                if (refusal) {
                    for (const p of planned.filter((p) => p.row && !p.row.id)) {
                        skipped.push({ title: titleOf(p.columns), kickoff: p.event.start, reason: refusal });
                        delete p.row;
                    }
                    rows = rowsNow();
                }
                const actor = { keyId: calendar.id, keyName: calendar.name, notify: calendar.notify };
                result = rows.length ? await asActor(actor, () => importMatches(this.db, userId, { rows, timeZone: zone }, undefined, this.options.onChange, system)) : undefined;
            }
        }

        // Each row's outcome, by its place in what was sent.
        const outcome = new Map<Record<string, string>, NonNullable<typeof result>["rows"][number]>();
        result?.rows.forEach((r) => outcome.set(rows[r.row - 1], r));
        let added = 0;
        let updated = 0;
        for (const p of planned) {
            const r = p.row && outcome.get(p.row);
            if (r && r.action === "skip") {
                skipped.push({ title: titleOf(p.columns), kickoff: p.event.start, reason: r.problems.join("; ") });
                continue;
            }
            if (r) {
                p.matchId = r.matchId;
                r.action === "add" ? added++ : updated++;
            }
        }
        const canceled = cancelRows.filter((r) => outcome.get(r)?.action === "update").length;

        if (!dryRun && calendar) {
            const at = new Date(now);
            const keep = planned.filter((p) => p.matchId && !(p.row && outcome.get(p.row)?.action === "skip"));
            for (const p of keep) {
                const values = {
                    matchId: p.matchId!, raw: p.event.properties.map((x) => ({ ...x, value: x.value.slice(0, 4000) })), hash: p.hash,
                    kickoff: new Date(p.event.start), canceled: false, seenAt: at,
                };
                await this.db.insert(assignorEvent).values({ calendarId: calendar.id, uid: p.key, ...values })
                    .onConflictDoUpdate({ target: [assignorEvent.calendarId, assignorEvent.uid], set: values });
            }
            for (const c of cancels.filter((_, i) => outcome.get(cancelRows[i])?.action === "update")) {
                await this.db.update(assignorEvent).set({ canceled: true }).where(and(eq(assignorEvent.calendarId, calendar.id), eq(assignorEvent.uid, c.uid)));
            }
        }
        return { planned, games: read.length, added, updated, canceled, skipped: skipped.slice(0, MOST_SKIPPED) };
    }

    /** Reads one calendar now, or saves one just fetched, and notes how it went (FEED-3, FEED-9). */
    async read(row: Row, fetched?: Awaited<ReturnType<AssignorCalendars["load"]>>): Promise<Row> {
        const { assignorCalendar } = tables;
        if (this.reading.has(row.id)) {
            return row;
        }
        this.reading.add(row.id);
        try {
            const now = this.now();
            const next = new Date(now + READ_EVERY_MS + Math.floor(Math.random() * JITTER_MS));
            const url = this.decrypt(row.url);
            if (!url) {
                const [paused] = await this.db.update(assignorCalendar).set({
                    active: false, stoppedAt: new Date(now), lastReadAt: new Date(now), nextReadAt: next,
                    problem: "This server's AUTH_SECRET changed, so the link can't be read. Paste it again.",
                }).where(eq(assignorCalendar.id, row.id)).returning();
                return paused ?? row;
            }
            const loaded = fetched ?? await this.load(url, row.userId, row);
            let set: Partial<Row>;
            if (loaded.status === "ok") {
                const done = await this.sync(row.userId, row.system as System, loaded.calendar.events, row, false);
                set = {
                    lastResult: { games: done.games, added: done.added, updated: done.updated, canceled: done.canceled },
                    skipped: done.skipped, problem: null, failures: 0, etag: loaded.etag ?? null, lastModified: loaded.lastModified ?? null,
                    ...(done.added + done.updated + done.canceled > 0 ? { lastChangedAt: new Date(now) } : {}),
                };
            } else if (loaded.status === "unchanged") {
                set = { problem: null, failures: 0 };
            } else if (loaded.status === "gone") {
                const failures = row.failures + 1;
                set = { problem: loaded.problem, failures, ...(failures >= GONE_PAUSES_AFTER ? { active: false, stoppedAt: new Date(now) } : {}) };
            } else {
                set = { problem: loaded.problem };
            }
            const [saved] = await this.db.update(assignorCalendar).set({ ...set, lastReadAt: new Date(now), nextReadAt: next })
                .where(eq(assignorCalendar.id, row.id)).returning();
            return saved ?? row;
        } finally {
            this.reading.delete(row.id);
        }
    }

    /** What a link holds, saving nothing (FEED-1). */
    async preview(userId: string, link: z.infer<typeof AssignorCalendarLink>): Promise<Preview | { refused: string }> {
        const url = calendarUrl(link.url, this.allowPrivate());
        if ("problem" in url) {
            return { refused: url.problem };
        }
        const loaded = await this.load(url.url, userId);
        if (loaded.status !== "ok") {
            return { refused: loaded.status === "unchanged" ? "It didn't answer with a calendar." : loaded.problem };
        }
        const done = await this.sync(userId, link.system, loaded.calendar.events, undefined, true);
        const games = done.planned;
        return {
            ...(loaded.calendar.name ? { calendarName: loaded.calendar.name } : {}),
            games: games.length,
            ...(games.length ? { from: games[0].event.start, to: games.at(-1)!.event.start } : {}),
            inLawFive: games.filter((p) => p.linked).length,
            first: games.slice(0, 3).map((p) => ({
                title: titleOf(p.columns), kickoff: p.columns.kickoff,
                ...(p.columns.timeZone ? { timeZone: p.columns.timeZone } : {}), ...(p.columns.venue ? { venue: p.columns.venue } : {}),
                inLawFive: !!p.linked,
            })),
            skipped: done.skipped,
        };
    }

    /** Connects a calendar and reads it straight away. */
    async connect(userId: string, input: z.infer<typeof NewAssignorCalendar>): Promise<Row | { refused: string }> {
        const url = calendarUrl(input.url, this.allowPrivate());
        if ("problem" in url) {
            return { refused: url.problem };
        }
        const loaded = await this.load(url.url, userId);
        if (loaded.status !== "ok") {
            return { refused: loaded.status === "unchanged" ? "It didn't answer with a calendar." : loaded.problem };
        }
        const now = new Date(this.now());
        const [row] = await this.db.insert(tables.assignorCalendar).values({
            id: randomUUID(), userId, name: input.name, system: input.system, url: this.encrypt(url.url), link: linkStart(url.url),
            notify: input.notify ?? true, active: true, createdAt: now, nextReadAt: now,
        }).returning();
        return this.read(row, loaded);
    }

    async change(userId: string, id: string, change: z.infer<typeof AssignorCalendarChange>): Promise<Row | { refused: string } | undefined> {
        const { assignorCalendar } = tables;
        const [row] = await this.db.select().from(assignorCalendar).where(and(eq(assignorCalendar.id, id), eq(assignorCalendar.userId, userId)));
        if (!row) {
            return undefined;
        }
        const set: Partial<Row> = {};
        if (change.url !== undefined) {
            const url = calendarUrl(change.url, this.allowPrivate());
            if ("problem" in url) {
                return { refused: url.problem };
            }
            Object.assign(set, { url: this.encrypt(url.url), link: linkStart(url.url), etag: null, lastModified: null, failures: 0, stoppedAt: null, problem: null, active: change.active ?? true });
        }
        if (change.name !== undefined) {
            set.name = change.name;
        }
        if (change.notify !== undefined) {
            set.notify = change.notify;
        }
        if (change.active !== undefined) {
            set.active = change.active;
            if (change.active) {
                Object.assign(set, { failures: 0, stoppedAt: null });
            }
        }
        const [saved] = await this.db.update(assignorCalendar).set(set).where(eq(assignorCalendar.id, id)).returning();
        // A new link, or resumed: read it straight away.
        const readNow = (change.url !== undefined || (change.active === true && !row.active)) && saved.active;
        return readNow ? this.read(saved) : saved;
    }

    async remove(userId: string, id: string): Promise<boolean> {
        const { assignorCalendar } = tables;
        const removed = await this.db.delete(assignorCalendar).where(and(eq(assignorCalendar.id, id), eq(assignorCalendar.userId, userId))).returning({ id: assignorCalendar.id });
        return removed.length > 0;
    }

    async list(userId: string): Promise<Row[]> {
        const { assignorCalendar } = tables;
        return this.db.select().from(assignorCalendar).where(eq(assignorCalendar.userId, userId)).orderBy(asc(assignorCalendar.createdAt));
    }

    async readNow(userId: string, id: string): Promise<Row | undefined> {
        const { assignorCalendar } = tables;
        const [row] = await this.db.select().from(assignorCalendar).where(and(eq(assignorCalendar.id, id), eq(assignorCalendar.userId, userId)));
        if (!row) {
            return undefined;
        }
        return row.active ? this.read(row) : row;
    }
}

/** A calendar as the API shows it: never its link, only the start of it (FEED-2). */
export function calendarOut(row: Row): Out {
    return {
        id: row.id,
        name: row.name,
        system: row.system as System,
        link: row.link,
        notify: row.notify,
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        ...(row.lastReadAt ? { lastReadAt: row.lastReadAt.toISOString() } : {}),
        ...(row.lastChangedAt ? { lastChangedAt: row.lastChangedAt.toISOString() } : {}),
        ...(row.lastResult ? { lastResult: row.lastResult } : {}),
        ...(row.problem ? { problem: row.problem } : {}),
        ...(row.stoppedAt ? { stoppedAt: row.stoppedAt.toISOString() } : {}),
        skipped: row.skipped,
    };
}

export function assignorCalendarsApi(db: Db, calendars: AssignorCalendars) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const invalid = (message: string) => ({ error: message, issues: [{ code: "custom", path: ["url"], message }] });

    api.get("/assignor-calendars", async (c) => c.json({ calendars: (await calendars.list(c.var.userId)).map(calendarOut) }));

    api.post("/assignor-calendars/preview", async (c) => {
        const body = AssignorCalendarLink.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid calendar link", issues: body.error.issues }, 400);
        }
        const preview = await calendars.preview(c.var.userId, body.data);
        return "refused" in preview ? c.json(invalid(`That link can't be used: ${preview.refused}`), 400) : c.json(preview);
    });

    api.post("/assignor-calendars", async (c) => {
        const body = NewAssignorCalendar.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid assignor calendar", issues: body.error.issues }, 400);
        }
        // FEED-10: as many as the account's plan allows.
        const over = await plansOf(db).refuse(c.var.userId, "assignorCalendars");
        if (over) {
            return c.json(over, 403);
        }
        const row = await calendars.connect(c.var.userId, body.data);
        return "refused" in row ? c.json(invalid(`That link can't be used: ${row.refused}`), 400) : c.json(calendarOut(row), 201);
    });

    api.patch("/assignor-calendars/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const body = AssignorCalendarChange.safeParse(await c.req.json().catch(() => undefined));
        if (!id.success) {
            return c.json({ error: "not found" }, 404);
        }
        if (!body.success) {
            return c.json({ error: "invalid change", issues: body.error.issues }, 400);
        }
        const row = await calendars.change(c.var.userId, id.data, body.data);
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        return "refused" in row ? c.json(invalid(`That link can't be used: ${row.refused}`), 400) : c.json(calendarOut(row));
    });

    api.delete("/assignor-calendars/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        return id.success && await calendars.remove(c.var.userId, id.data) ? c.json({ ok: true as const }) : c.json({ error: "not found" }, 404);
    });

    api.post("/assignor-calendars/:id/read", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const row = id.success ? await calendars.readNow(c.var.userId, id.data) : undefined;
        return row ? c.json(calendarOut(row)) : c.json({ error: "not found" }, 404);
    });

    return api;
}
