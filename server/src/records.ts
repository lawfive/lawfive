import { type CollectionName, Id, type MatchRecord, collections, readableCollections, resultFields, sameResult } from "@lawfive/schema";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { type Db, tables } from "./db/index.ts";
import { type StorageLimit, tooManyRecords } from "./usage.ts";
import { plansOf } from "./plans.ts";

// The records API: one collection per record type (collections in schema/), all stored in the
// records table. schema/src/endpoints.ts describes the endpoints.
//
//   GET    /v1/<collection>          the user's records (not deleted)
//   GET    /v1/<collection>/:id      one record, deleted or not
//   PUT    /v1/<collection>/:id      create (no version) or update (the version last seen; 409 if it changed)
//   DELETE /v1/<collection>/:id      mark deleted (?version=n to check it hasn't changed)
//   GET    /v1/changes?since=<seq>   every record written after <seq>, for sync
//
// IDs are made by the client, so a record created offline keeps its ID when it reaches the server.

const collectionOf = Object.fromEntries(Object.entries(collections).map(([name, { type }]) => [type, name])) as Record<string, CollectionName>;

type Row = typeof tables.records.$inferSelect;

/** A stored row as the API returns it: the schema's record, sync fields included. */
export function toRecord(row: Row) {
    return {
        ...row.data,
        id: row.id,
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        ...(row.deletedAt ? { deletedAt: row.deletedAt.toISOString() } : {}),
    };
}

/** The unique index a write broke, if it broke one. */
export function uniqueViolation(error: unknown): string | undefined {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
        const { code, constraint, constraint_name } = e as { code?: string; constraint?: string; constraint_name?: string };
        if (code === "23505") {
            return constraint ?? constraint_name ?? e.message;
        }
    }
    return undefined;
}

const uniqueMessages: Record<string, string> = {
    records_external: "another match already has this external ID",
    records_settings: "settings already exist for this account; update them instead",
};

/** A record written: created, changed or deleted (for webhooks, HOOK-1). */
export interface RecordWrite {
    userId: string;
    type: string;
    action: "created" | "updated" | "deleted";
    row: Row;
    /** The record as it was before, unless it's new (or was deleted): for saying what changed (NOTE-2). */
    previous?: Record<string, unknown>;
}

/** Who hears of every committed write, by database (so test apps sharing a process don't mix). */
const writeListeners = new WeakMap<Db, ((write: RecordWrite) => void)[]>();

export function onRecordWrite(db: Db, listener: (write: RecordWrite) => void) {
    writeListeners.set(db, [...(writeListeners.get(db) ?? []), listener]);
}

function written(db: Db, write: RecordWrite) {
    for (const listener of writeListeners.get(db) ?? []) {
        listener(write);
    }
}

type SaveResult =
    | { status: 200 | 201; row: Row }
    | { status: 409; error: string; row?: Row };

/**
 * A match being saved with an id a merge replaced (DUP-7), from a phone that was offline during
 * it: the venue, pitch and crew point at where they went.
 */
async function correctMergedIds(db: Db, userId: string, match: Record<string, unknown>): Promise<Record<string, unknown>> {
    const crew = (match.crew as { refereeId?: string }[] | undefined) ?? [];
    const ids = [match.venueId, match.pitchId, ...crew.map((c) => c.refereeId)].filter((id): id is string => typeof id === "string");
    if (!ids.length) {
        return match;
    }
    const { mergedId } = tables;
    const found = await db.select().from(mergedId).where(and(eq(mergedId.userId, userId), inArray(mergedId.oldId, ids)));
    if (!found.length) {
        return match;
    }
    const to = new Map(found.map((r) => [r.oldId, r]));
    const pitch = to.get(match.pitchId as string);
    const venue = to.get(match.venueId as string);
    return {
        ...match,
        ...(venue?.kind === "venue" ? { venueId: venue.newId } : {}),
        ...(pitch?.kind === "pitch" ? { pitchId: pitch.newId, venueId: pitch.venueId ?? venue?.newId ?? match.venueId } : {}),
        ...(match.crew ? {
            crew: crew.map((c) => {
                const referee = c.refereeId ? to.get(c.refereeId) : undefined;
                return referee?.kind === "referee" ? { ...c, refereeId: referee.newId } : c;
            }),
        } : {}),
    };
}

/**
 * Creates or updates one record. `version` is the version the client last saw (none when
 * creating); "any" overwrites whatever is there, for uploads that are the latest truth by
 * definition (a watch re-sending a match record). Throws on a unique index; see uniqueViolation.
 */
export async function saveRecord(db: Db, userId: string, type: string, id: string, data: Record<string, unknown>, version: number | undefined | "any"): Promise<SaveResult> {
    const { records } = tables;
    const byId = and(eq(records.userId, userId), eq(records.id, id));
    const nextSeq = sql`nextval('record_seq')`;
    if (type === "match") {
        data = await correctMergedIds(db, userId, data);
    }
    let previous: Record<string, unknown> | undefined;
    const result = await db.transaction(async (tx): Promise<SaveResult> => {
        // One writer per user at a time, so sequence numbers commit in order and GET /changes
        // never skips a record.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
        const [existing] = await tx.select().from(records).where(byId);
        previous = existing && !existing.deletedAt ? existing.data : undefined;
        if (!existing) {
            const [row] = await tx.insert(records)
                .values({ userId, id, type, version: 1, seq: nextSeq, updatedAt: new Date(), data })
                .returning();
            return { status: 201, row };
        }
        if (existing.type !== type) {
            return { status: 409, error: "this id belongs to another kind of record" };
        }
        if (version !== "any" && version !== existing.version) {
            return { status: 409, error: "the record has changed since you last saw it", row: existing };
        }
        const [row] = await tx.update(records)
            .set({ version: existing.version + 1, seq: nextSeq, updatedAt: new Date(), deletedAt: null, data })
            .where(byId)
            .returning();
        return { status: 200, row };
    });
    if (result.status !== 409) {
        written(db, { userId, type, action: result.status === 201 ? "created" : "updated", row: result.row, ...(previous ? { previous } : {}) });
    }
    return result;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * RES-8 (Q-21): a deleted match takes its match reports with it, marked deleted like any record so
 * every device drops them at its next sync, and their tracks, which aren't synced, are removed. A
 * match brought back later doesn't bring them back. Returns the reports it marked.
 */
async function deleteReportsOf(tx: Tx, userId: string, matchId: string): Promise<Row[]> {
    const { records, matchTrack } = tables;
    // Ids are compared in lower case: the column is a uuid, but the report's matchId is the text a device sent.
    const ofMatch = and(eq(records.userId, userId), eq(records.type, "matchRecord"), sql`lower(${records.data}->>'matchId') = ${matchId.toLowerCase()}`);
    const now = new Date();
    const marked = await tx.update(records)
        .set({ version: sql`${records.version} + 1`, seq: sql`nextval('record_seq')`, updatedAt: now, deletedAt: now })
        .where(and(ofMatch, isNull(records.deletedAt)))
        .returning();
    // Every report of the match's, including one deleted on its own before (whose track stayed).
    const reports = await tx.select({ id: records.id }).from(records).where(ofMatch);
    if (reports.length) {
        await tx.delete(matchTrack).where(and(eq(matchTrack.userId, userId), inArray(matchTrack.matchRecordId, reports.map((r) => r.id))));
    }
    return marked;
}

/**
 * Marks one record deleted (kept as a marker, so other devices learn of it). `version`, when given,
 * is the version the client last saw: 409 if it changed. Deleting a deleted record is fine. A match
 * takes its reports and their tracks with it (RES-8), each report marked deleted too.
 */
export async function deleteRecord(db: Db, userId: string, type: string, id: string, version?: number): Promise<{ status: 200; row: Row } | { status: 404 } | { status: 409; row: Row }> {
    const { records } = tables;
    const byId = and(eq(records.userId, userId), eq(records.id, id));
    let deleted: Row | undefined;
    let reports: Row[] = [];
    const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
        const [existing] = await tx.select().from(records).where(and(byId, eq(records.type, type)));
        if (!existing) {
            return { status: 404 } as const;
        }
        if (version !== undefined && version !== existing.version) {
            return { status: 409, row: existing } as const;
        }
        // Also when the match was already deleted, so deleting it again tidies what an older server left.
        if (type === "match") {
            reports = await deleteReportsOf(tx, userId, id);
        }
        if (existing.deletedAt) {
            return { status: 200, row: existing } as const;
        }
        const [row] = await tx.update(records)
            .set({ version: existing.version + 1, seq: sql`nextval('record_seq')`, updatedAt: new Date(), deletedAt: new Date() })
            .where(byId)
            .returning();
        deleted = row;
        return { status: 200, row } as const;
    });
    for (const report of reports) {
        written(db, { userId, type: "matchRecord", action: "deleted", row: report, previous: report.data });
    }
    if (deleted) {
        written(db, { userId, type, action: "deleted", row: deleted, previous: deleted.data });
    }
    return result;
}

/**
 * RES-1, RES-3: a match report saved over one that's already there. The server keeps the books: when
 * its result changes it notes when (editedAt), and the first time a watch's recording is corrected it
 * keeps that recording (original). Putting the recording back, as Revert does, clears both. What a
 * client sends for either is ignored.
 */
export async function corrected(db: Db, userId: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { editedAt: _e, original: _o, ...rest } = data;
    const [row] = await db.select().from(tables.records).where(and(eq(tables.records.userId, userId), eq(tables.records.id, id), eq(tables.records.type, "matchRecord")));
    if (!row) {
        return rest;
    }
    const before = row.data as MatchRecord;
    const original = before.original ?? (before.device ? resultFields(before) : undefined);
    const now = rest as unknown as MatchRecord;
    if (original && sameResult(now, original)) {
        return rest;
    }
    if (sameResult(now, before)) {
        return { ...rest, ...(before.editedAt ? { editedAt: before.editedAt } : {}), ...(before.original ? { original: before.original } : {}) };
    }
    return { ...rest, editedAt: new Date().toISOString(), ...(original ? { original } : {}) };
}

/** `onChange` hears of every write (by record type), for work that follows it such as fetching a forecast. */
export function recordsApi(db: Db, onChange?: (type: string) => void, storageLimit?: StorageLimit) {
    const api = new Hono<{ Variables: { userId: string; keyScopes?: string[] } }>();
    const { records } = tables;

    api.get("/changes", async (c) => {
        const since = Number(c.req.query("since") ?? 0);
        const limit = Math.min(Number(c.req.query("limit") ?? 500), 1000);
        if (!Number.isInteger(since) || since < 0 || !Number.isInteger(limit) || limit < 1) {
            return c.json({ error: "since and limit must be whole numbers" }, 400);
        }
        // An API key sees only the collections it can read (KEY-3).
        const readable = c.var.keyScopes && readableCollections(c.var.keyScopes).map((name) => collections[name].type);
        const rows = await db.select().from(records)
            .where(and(eq(records.userId, c.var.userId), gt(records.seq, since), readable ? inArray(records.type, readable) : undefined))
            .orderBy(asc(records.seq))
            .limit(limit + 1);
        const page = rows.slice(0, limit);
        return c.json({
            changes: page.map((row) => ({ collection: collectionOf[row.type], record: toRecord(row) })),
            cursor: page.at(-1)?.seq ?? since,
            more: rows.length > limit,
        });
    });

    for (const collection of Object.keys(collections) as CollectionName[]) {
        const { type, input } = collections[collection];
        const byId = (userId: string, id: string) => and(eq(records.userId, userId), eq(records.id, id));

        api.get(`/${collection}`, async (c) => {
            const rows = await db.select().from(records)
                .where(and(eq(records.userId, c.var.userId), eq(records.type, type), isNull(records.deletedAt)))
                .orderBy(asc(records.seq));
            return c.json({ items: rows.map(toRecord) });
        });

        api.get(`/${collection}/:id`, async (c) => {
            const id = Id.safeParse(c.req.param("id"));
            if (!id.success) {
                return c.json({ error: "not found" }, 404);
            }
            const [row] = await db.select().from(records).where(and(byId(c.var.userId, id.data), eq(records.type, type)));
            return row ? c.json(toRecord(row)) : c.json({ error: "not found" }, 404);
        });

        api.put(`/${collection}/:id`, async (c) => {
            const id = Id.safeParse(c.req.param("id"));
            const body = input.safeParse(await c.req.json().catch(() => undefined));
            if (!id.success) {
                return c.json({ error: "the id must be a UUID" }, 400);
            }
            if (!body.success) {
                return c.json({ error: "invalid record", issues: body.error.issues }, 400);
            }
            const { id: bodyId, version, ...data } = body.data;
            if (bodyId !== undefined && bodyId !== id.data) {
                return c.json({ error: "the id in the body doesn't match the URL" }, 400);
            }
            if (await tooManyRecords(db, c.var.userId, storageLimit)) {
                const [known] = await db.select({ id: records.id }).from(records).where(byId(c.var.userId, id.data));
                if (!known) {
                    return c.json({ error: "This account has as many records as it can keep. Delete some first." }, 409);
                }
            }
            // PLAN-4: a new match, referee or venue (or a deleted one brought back) within the plan.
            const counted = collection === "matches" || collection === "referees" || collection === "venues" ? collection : undefined;
            if (counted) {
                const [known] = await db.select({ deletedAt: records.deletedAt }).from(records).where(byId(c.var.userId, id.data));
                const over = (!known || known.deletedAt) && await plansOf(db).refuse(c.var.userId, counted);
                if (over) {
                    return c.json(over, 403);
                }
            }
            try {
                const saving = type === "matchRecord" ? await corrected(db, c.var.userId, id.data, data) : data;
                const result = await saveRecord(db, c.var.userId, type, id.data, saving, version as number | undefined);
                if (result.status === 409) {
                    return c.json({ error: result.error, ...(result.row ? { current: toRecord(result.row) } : {}) }, 409);
                }
                onChange?.(type);
                return c.json(toRecord(result.row), result.status);
            } catch (error) {
                const index = uniqueViolation(error);
                if (index) {
                    const known = Object.keys(uniqueMessages).find((name) => index.includes(name));
                    return c.json({ error: known ? uniqueMessages[known] : "this would duplicate another record" }, 409);
                }
                throw error;
            }
        });

        api.delete(`/${collection}/:id`, async (c) => {
            const id = Id.safeParse(c.req.param("id"));
            const version = c.req.query("version");
            if (!id.success) {
                return c.json({ error: "not found" }, 404);
            }
            const result = await deleteRecord(db, c.var.userId, type, id.data, version === undefined ? undefined : Number(version));
            if (result.status === 404) {
                return c.json({ error: "not found" }, 404);
            }
            if (result.status === 409) {
                return c.json({ error: "the record has changed since you last saw it", current: toRecord(result.row) }, 409);
            }
            onChange?.(type);
            return c.json(toRecord(result.row));
        });
    }

    return api;
}
