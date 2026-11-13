import type { MatchNotice, MatchNoticeChange as Change } from "@lawfive/schema";
import { and, desc, eq, inArray, isNull, lt, lte } from "drizzle-orm";
import { Hono } from "hono";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import type { NoticeState } from "./db/tables.ts";
import type { Push } from "./push.ts";
import { onRecordWrite, type RecordWrite } from "./records.ts";

// Notices (NOTE-1 to NOTE-4): when an API key whose owner asked to hear of it adds a match, or
// cancels, postpones, moves or removes one that hasn't kicked off, their phones are told. A key's
// changes are collected for about a minute and sent as one notification (so 30 matches added use
// one of the day's 25, PUSH-1), except a change to a match kicking off within a day, which goes at
// once. The push is the relay's match-changed event with the notice's id; the phone fetches the
// notice and writes the words (PUSH-2). Saves made by the person themselves never notify.
//
//   GET /v1/notices/:id   a notice, for the phone

type Data = Record<string, unknown>;
type Notice = z.infer<typeof MatchNotice>;
type MatchNoticeChange = z.infer<typeof Change>;

/** Who's making the request, when it's an API key (set in app.ts), so a save can tell. */
export interface Actor {
    keyId: string;
    keyName: string;
    notify: boolean;
}

const actors = new AsyncLocalStorage<Actor>();

/** Runs a request as an API key, so the saves it makes know who made them. */
export function asActor<T>(actor: Actor, run: () => Promise<T>): Promise<T> {
    return actors.run(actor, run);
}

/** Runs saves that aren't news, such as a merge moving matches to the same place under another id. */
export function quietly<T>(run: () => Promise<T>): Promise<T> {
    return actors.exit(run);
}

const COLLECT_MS = 60_000;
const URGENT_MS = 24 * 3_600_000;
const KEEP_MS = 30 * 86_400_000;

const title = (m: Data) => (m.name as string | undefined) ?? `${(m.home as { name?: string })?.name ?? "Home"} v ${(m.away as { name?: string })?.name ?? "Away"}`;

/** What a notice keeps of a match. */
export function noticeState(m: Data): NoticeState {
    const pick = (key: string) => (typeof m[key] === "string" ? { [key]: m[key] as string } : {});
    return { title: title(m), status: String(m.status ?? "scheduled"), ...pick("kickoff"), ...pick("timeZone"), ...pick("venueId"), ...pick("pitchId") };
}

/** What changed between a match's state before and after, most important first (NOTE-2); none to say nothing. */
export function noticeChanges(before: NoticeState | undefined, after: NoticeState | undefined): MatchNoticeChange[] {
    if (!before) {
        return after?.status === "scheduled" ? ["added"] : [];
    }
    if (!after) {
        return before.status === "cancelled" ? [] : ["removed"];
    }
    if (after.status === "cancelled") {
        return before.status === "cancelled" ? [] : ["canceled"];
    }
    if (after.status === "postponed") {
        return before.status === "postponed" ? [] : ["postponed"];
    }
    if (after.status !== "scheduled") {
        return [];
    }
    const changes: MatchNoticeChange[] = [];
    if (before.status === "cancelled" || before.status === "postponed") {
        changes.push("backOn");
    }
    if (before.kickoff && after.kickoff && Date.parse(before.kickoff) !== Date.parse(after.kickoff)) {
        changes.push("kickoff");
    }
    if (before.venueId !== after.venueId || before.pitchId !== after.pitchId) {
        changes.push("venue");
    }
    return changes;
}

/** Whether a match is still to come: notices are only for matches that haven't kicked off. */
function upcoming(state: NoticeState | undefined, now: number) {
    return !!state?.kickoff && Date.parse(state.kickoff) > now && state.status !== "played" && state.status !== "abandoned";
}

export class Notices {
    private readonly db: Db;
    private readonly push: Push;
    private readonly now: () => number;
    /** One at a time, so a burst of saves adds to one notice in order. */
    private queue: Promise<void> = Promise.resolve();
    private timer?: ReturnType<typeof setInterval>;

    constructor(db: Db, push: Push, now: () => number = Date.now) {
        this.db = db;
        this.push = push;
        this.now = now;
        onRecordWrite(db, (write) => this.heard(write));
    }

    /** Sends the notices that are due every few seconds. */
    start(everyMs = 10_000) {
        this.timer = setInterval(() => void this.flush().catch((e: unknown) => console.error("Sending notices failed:", e)), everyMs);
        this.timer.unref();
    }

    stop() {
        clearInterval(this.timer);
    }

    /** When what's been heard so far is written down (for tests). */
    idle(): Promise<void> {
        return this.queue;
    }

    private heard(write: RecordWrite) {
        const actor = actors.getStore();
        if (!actor?.notify || write.type !== "match") {
            return;
        }
        const now = this.now();
        this.queue = this.queue.then(() => this.record(write, actor, now)).catch((e: unknown) => console.error("Keeping a notice failed:", e));
    }

    private async record(write: RecordWrite, actor: Actor, now: number) {
        const before = write.previous ? noticeState(write.previous) : undefined;
        const after = write.action === "deleted" ? undefined : noticeState(write.row.data);
        if (!(before ? upcoming(before, now) : upcoming(after, now)) || noticeChanges(before, after).length === 0) {
            return;
        }
        const { matchNotice } = tables;
        const matchId = write.row.id;
        const soonest = Math.min(...[before, after].flatMap((s) => (s?.kickoff ? [Date.parse(s.kickoff)] : [])));
        if (soonest - now < URGENT_MS) {
            await this.db.insert(matchNotice).values({
                id: randomUUID(), userId: write.userId, keyId: actor.keyId, source: actor.keyName,
                matches: { [matchId]: { ...(before ? { before } : {}), ...(after ? { after } : {}) } }, urgent: true, sendAt: new Date(now),
            });
            await this.flush(now);
            return;
        }
        const [open] = await this.db.select().from(matchNotice)
            .where(and(eq(matchNotice.userId, write.userId), eq(matchNotice.keyId, actor.keyId), eq(matchNotice.urgent, false), isNull(matchNotice.sentAt)))
            .orderBy(desc(matchNotice.createdAt)).limit(1);
        if (!open) {
            await this.db.insert(matchNotice).values({
                id: randomUUID(), userId: write.userId, keyId: actor.keyId, source: actor.keyName,
                matches: { [matchId]: { ...(before ? { before } : {}), ...(after ? { after } : {}) } }, urgent: false, sendAt: new Date(now + COLLECT_MS),
            });
            return;
        }
        // Several changes to one match in the burst say how it went from the first to the last.
        const matches = { ...open.matches };
        const first = matchId in matches ? matches[matchId].before : before;
        matches[matchId] = { ...(first ? { before: first } : {}), ...(after ? { after } : {}) };
        await this.db.update(matchNotice).set({ matches }).where(eq(matchNotice.id, open.id));
    }

    /** Sends the notices that are due: each one notification to the person's phones. */
    async flush(now = this.now()) {
        const { matchNotice } = tables;
        const due = await this.db.update(matchNotice).set({ sentAt: new Date(now) })
            .where(and(isNull(matchNotice.sentAt), lte(matchNotice.sendAt, new Date(now))))
            .returning();
        for (const notice of due.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime())) {
            if (Object.values(notice.matches).some((m) => noticeChanges(m.before, m.after).length > 0)) {
                await this.push.notify(notice.userId, "match-changed", notice.id, now);
            }
        }
        await this.db.delete(matchNotice).where(lt(matchNotice.createdAt, new Date(now - KEEP_MS)));
    }

    /** A notice as the phone reads it, with the venues named; undefined when it isn't theirs. */
    async get(userId: string, id: string): Promise<Notice | undefined> {
        const { matchNotice, records } = tables;
        const [row] = /^[0-9a-f-]{36}$/i.test(id)
            ? await this.db.select().from(matchNotice).where(and(eq(matchNotice.id, id), eq(matchNotice.userId, userId)))
            : [];
        if (!row) {
            return undefined;
        }
        const entries = Object.entries(row.matches).flatMap(([matchId, m]) => {
            const changes = noticeChanges(m.before, m.after);
            return changes.length ? [{ matchId, changes, ...m }] : [];
        });
        const venueIds = [...new Set(entries.flatMap((e) => [e.before?.venueId, e.after?.venueId]).filter((v): v is string => !!v))];
        const venues = venueIds.length
            ? new Map((await this.db.select().from(records).where(and(eq(records.userId, userId), inArray(records.id, venueIds)))).map((r) => [r.id, r.data]))
            : new Map<string, Data>();
        const where = (s: NoticeState | undefined) => {
            const venue = s?.venueId ? venues.get(s.venueId) : undefined;
            if (!venue) {
                return undefined;
            }
            const pitch = (venue.pitches as { id: string; name: string }[] | undefined)?.find((p) => p.id === s!.pitchId);
            return [venue.name as string, pitch?.name].filter(Boolean).join(", ");
        };
        const matches = entries.map(({ matchId, changes, before, after }) => {
            const now = after ?? before!;
            const venue = where(now);
            const previousVenue = changes.includes("venue") ? where(before) : undefined;
            return {
                matchId, changes, title: now.title,
                ...(now.kickoff ? { kickoff: now.kickoff } : {}),
                ...(changes.includes("kickoff") && before?.kickoff ? { previousKickoff: before.kickoff } : {}),
                ...(now.timeZone ? { timeZone: now.timeZone } : {}),
                ...(venue ? { venue } : {}),
                ...(previousVenue ? { previousVenue } : {}),
            };
        }).sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
        return { id: row.id, source: row.source, createdAt: row.createdAt.toISOString(), matches };
    }
}

export function noticesApi(notices: Notices | undefined) {
    const api = new Hono<{ Variables: { userId: string } }>();
    api.get("/notices/:id", async (c) => {
        const notice = await notices?.get(c.var.userId, c.req.param("id"));
        return notice ? c.json(notice) : c.json({ error: "not found" }, 404);
    });
    return api;
}
