import { type CollectionName, MatchTrack, type RestoreResult, collections } from "@lawfive/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync } from "node:zlib";
import type { z } from "zod";
import { fileStoreOf, imageType } from "./attachments.ts";
import { type Db, tables } from "./db/index.ts";
import { saveRecord, toRecord, uniqueViolation } from "./records.ts";
import { saveTrack } from "./tracks.ts";
import { openZip } from "./zipFile.ts";
import { type StorageLimit, noRoomFor } from "./usage.ts";
import { plansOf } from "./plans.ts";

// Download everything and restore (DATA-2, DATA-4): the whole account as one zip, made as it's
// sent so it starts at once and never sits in memory; and merging such a zip back into an
// account, the newer copy of each record winning. schema/src/endpoints.ts describes the endpoints.
//
//   GET  /v1/export    the zip
//   POST /v1/restore   merge one in (the zip is the body)

type Result = z.infer<typeof RestoreResult>;
type Entry = { name: string; data: Uint8Array; store?: boolean };

const format = "lawfive-export";
const maxRestoreBytes = 2 * 1024 * 1024 * 1024;
/** Restored in this order, so what a match points at is there before it. */
const order: CollectionName[] = ["settings", "venues", "competitions", "referees", "match-templates", "matches", "match-records"];
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const readme = `# A LawFive export

Everything in a LawFive account: made by Settings → Account → Download everything, and put back
into an account (this one or another, on any LawFive server) with Restore from an export, which
keeps the newer copy of anything the account already has.

- \`lawfive.json\`: what this is, when it was made and from which account.
- \`records/<collection>.json\`: each an array of records, as the LawFive API gives them
  (matches, match-records, venues, referees, competitions, match-templates, settings). The API
  reference describes every field: https://lawfive.dev
- \`tracks/<match record id>.json\`: GPS and heart rate for a match report, in LawFive's track format.
- \`attachments.json\`: the photos on matches, venues and referees, with captions and order;
  the files are in \`attachments/\`, with \`.thumb\` beside the small versions.

Not included: API keys, webhooks, the calendar feed's address, linked watches and share links,
which are made again where they're needed.
`;

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

export function backupApi(db: Db, storageLimit?: StorageLimit) {
    const { records, matchTrack, attachment, user } = tables;
    const api = new Hono<{ Variables: { userId: string } }>();
    /** SEC-3: accounts with a restore under way; one at a time each, as each can take up to 2 GB of disk. */
    const restoring = new Set<string>();

    /** What goes in the zip, one file at a time, so photos are read only as they're sent. */
    async function* entriesFor(userId: string): AsyncGenerator<Entry> {
        const [account] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
        const rows = await db.select().from(records).where(and(eq(records.userId, userId), isNull(records.deletedAt)));
        const photos = await db.select().from(attachment).where(eq(attachment.userId, userId));
        yield { name: "lawfive.json", data: json({ format, version: 1, exportedAt: new Date().toISOString(), account }) };
        yield { name: "README.md", data: strToU8(readme) };
        for (const [collection, { type }] of Object.entries(collections)) {
            yield { name: `records/${collection}.json`, data: json(rows.filter((r) => r.type === type).map(toRecord)) };
        }
        // The tracks of the reports in it: one whose report was deleted on its own isn't (RES-8).
        const reportIds = new Set(rows.filter((r) => r.type === "matchRecord").map((r) => r.id));
        const tracks = await db.select({ id: matchTrack.matchRecordId }).from(matchTrack).where(eq(matchTrack.userId, userId));
        for (const { id } of tracks.filter((t) => reportIds.has(t.id))) {
            const [row] = await db.select().from(matchTrack).where(and(eq(matchTrack.userId, userId), eq(matchTrack.matchRecordId, id)));
            yield { name: `tracks/${id}.json`, data: new Uint8Array(gunzipSync(row.data)) };
        }
        yield {
            name: "attachments.json",
            data: json(photos.map((a) => ({
                id: a.id, recordType: a.recordType, recordId: a.recordId, contentType: a.contentType, size: a.size,
                width: a.width ?? undefined, height: a.height ?? undefined, caption: a.caption ?? undefined, position: a.position,
                createdAt: a.createdAt.toISOString(), file: `attachments/${a.id}.${extensions[a.contentType]}`,
                ...(a.thumbKey ? { thumb: `attachments/${a.id}.thumb.jpg` } : {}),
            }))),
        };
        const store = fileStoreOf(db);
        for (const a of store ? photos : []) {
            const file = await store!.get(a.fileKey);
            if (file) {
                yield { name: `attachments/${a.id}.${extensions[a.contentType]}`, data: file, store: true };
            }
            const thumb = a.thumbKey ? await store!.get(a.thumbKey) : undefined;
            if (thumb) {
                yield { name: `attachments/${a.id}.thumb.jpg`, data: thumb, store: true };
            }
        }
    }

    api.get("/export", (c) => {
        const entries = entriesFor(c.var.userId);
        let zip: Zip;
        // Pulled a file at a time as the download goes, so the zip never sits in memory.
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                zip = new Zip((error, chunk, final) => {
                    if (error) {
                        controller.error(error);
                        return;
                    }
                    controller.enqueue(chunk);
                    if (final) {
                        controller.close();
                    }
                });
            },
            async pull() {
                const next = await entries.next();
                if (next.done) {
                    zip.end();
                    return;
                }
                const { name, data, store } = next.value;
                // Photos are already compressed; everything else is text.
                const file = store ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
                zip.add(file);
                file.push(data, true);
            },
            cancel() {
                void entries.return(undefined);
            },
        }, { highWaterMark: 1 });
        const day = new Date().toISOString().slice(0, 10);
        return c.body(body, 200, {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="lawfive-export-${day}.zip"`,
            "cache-control": "no-store",
        });
    });

    api.post("/restore", async (c) => {
        if (!c.req.raw.body) {
            return c.json({ error: "send the export's zip as the body" }, 400);
        }
        if (restoring.has(c.var.userId)) {
            return c.json({ error: "A restore is already under way. Wait for it to finish." }, 409);
        }
        restoring.add(c.var.userId);
        const dir = await mkdtemp(join(tmpdir(), "lawfive-restore-"));
        const path = join(dir, "export.zip");
        try {
            // Saved to disk as it arrives, then read a file at a time. PLAN-2: within the plan's largest file.
            const largest = await plansOf(db).largest(c.var.userId, "fileMb", maxRestoreBytes);
            let received = 0;
            const counted = Readable.fromWeb(c.req.raw.body as import("node:stream/web").ReadableStream).on("data", (chunk: Buffer) => {
                received += chunk.length;
                if (received > largest) {
                    counted.destroy(new Error("too big"));
                }
            });
            try {
                await pipeline(counted, createWriteStream(path));
            } catch {
                const most = largest < maxRestoreBytes ? `${Math.round(largest / (1024 * 1024))} MB on your plan` : "2 GB";
                return c.json({ error: received > largest ? `The export is too big: at most ${most}.` : "The upload didn't finish." }, 400);
            }
            let zip;
            try {
                zip = await openZip(path);
            } catch {
                return c.json({ error: "That isn't a LawFive export: it isn't a zip file." }, 400);
            }
            try {
                const about = JSON.parse(new TextDecoder().decode(await zip.read("lawfive.json") ?? new Uint8Array()) || "{}");
                if (about.format !== format) {
                    return c.json({ error: "That isn't a LawFive export: it has no lawfive.json." }, 400);
                }
                return c.json(await restore(c.var.userId, (name) => zip.read(name)));
            } finally {
                await zip.close();
            }
        } finally {
            restoring.delete(c.var.userId);
            await rm(dir, { recursive: true, force: true });
        }
    });

    async function restore(userId: string, read: (name: string) => Promise<Uint8Array | undefined>): Promise<Result> {
        const result: Result = { records: {}, tracks: { added: 0, updated: 0, unchanged: 0 }, photos: { added: 0, updated: 0, unchanged: 0 }, problems: [] };
        const problem = (text: string) => result.problems.length < 50 && result.problems.push(text);
        const parse = async (name: string) => {
            const data = await read(name);
            try {
                return data ? JSON.parse(new TextDecoder().decode(data)) as unknown : undefined;
            } catch {
                problem(`${name} isn't valid JSON`);
                return undefined;
            }
        };

        for (const collection of order) {
            const { type, input } = collections[collection];
            const count = { added: 0, updated: 0, unchanged: 0 };
            result.records[collection] = count;
            const list = await parse(`records/${collection}.json`);
            for (const item of Array.isArray(list) ? list : []) {
                const { updatedAt: _u, deletedAt: _d, ...given } = (item ?? {}) as Record<string, unknown>;
                const parsed = input.safeParse(given);
                if (!parsed.success) {
                    problem(`A record in ${collection} isn't valid: ${parsed.error.issues[0]?.message}`);
                    continue;
                }
                const { id: givenId, version: _, ...data } = parsed.data as Record<string, unknown> & { id?: string; version?: number };
                // RES-8: a report whose match the account doesn't have, or has deleted, is left alone, so a
                // report is never kept without its match (an export from before RES-8 can hold such reports).
                if (collection === "match-records" && typeof data.matchId === "string") {
                    const [match] = await db.select({ id: records.id }).from(records)
                        .where(and(eq(records.userId, userId), eq(records.type, "match"), eq(records.id, data.matchId.toLowerCase()), isNull(records.deletedAt)));
                    if (!match) {
                        count.unchanged++;
                        continue;
                    }
                }
                const exportedAt = Date.parse(String((item as { updatedAt?: string }).updatedAt ?? ""));
                // One settings record an account: the export's settings update this account's own.
                const [existing] = collection === "settings"
                    ? await db.select().from(records).where(and(eq(records.userId, userId), eq(records.type, "settings"), isNull(records.deletedAt)))
                    : await db.select().from(records).where(and(eq(records.userId, userId), eq(records.id, String(givenId))));
                const id = existing?.id ?? String(givenId ?? randomUUID());
                if (existing && existing.type !== type) {
                    problem(`${collection} ${id}: the account has another kind of record with this id`);
                    continue;
                }
                // The account's copy was changed later (or deleted later): it stays.
                const accountChanged = existing && (existing.deletedAt ?? existing.updatedAt).getTime();
                if (existing && accountChanged && Number.isFinite(exportedAt) && accountChanged >= exportedAt) {
                    count.unchanged++;
                    continue;
                }
                // PLAN-4: a match, referee or venue the account doesn't have, within its plan.
                const counted = collection === "matches" || collection === "referees" || collection === "venues" ? collection : undefined;
                const over = counted && (!existing || existing.deletedAt) && await plansOf(db).refuse(userId, counted);
                if (over) {
                    problem(`${collection} ${id} wasn't restored: ${over.error}`);
                    continue;
                }
                try {
                    const saved = await saveRecord(db, userId, type, id, data, "any");
                    if (saved.status === 409) {
                        problem(`${collection} ${id}: ${saved.error}`);
                    } else {
                        count[saved.status === 201 ? "added" : "updated"]++;
                    }
                } catch (e) {
                    const constraint = uniqueViolation(e);
                    if (!constraint) {
                        throw e;
                    }
                    problem(`${collection} ${id}: ${constraint === "records_external" ? "another match has the same match number" : "it clashes with a record the account has"}`);
                }
            }
        }

        // Tracks for match reports that have none.
        const reports = await db.select({ id: records.id }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "matchRecord"), isNull(records.deletedAt)));
        const withTrack = new Set((await db.select({ id: tables.matchTrack.matchRecordId }).from(tables.matchTrack).where(eq(tables.matchTrack.userId, userId))).map((t) => t.id));
        for (const { id } of reports) {
            const track = await parse(`tracks/${id}.json`);
            if (!track) {
                continue;
            }
            if (withTrack.has(id)) {
                result.tracks.unchanged++;
                continue;
            }
            const checked = MatchTrack.safeParse(track);
            if (!checked.success) {
                problem(`The track for match report ${id} isn't valid`);
                continue;
            }
            await saveTrack(db, userId, id, checked.data);
            result.tracks.added++;
        }

        // Photos the account doesn't have, on records it does.
        const store = fileStoreOf(db);
        const photos = await parse("attachments.json");
        for (const p of Array.isArray(photos) ? photos as Record<string, unknown>[] : []) {
            if (!store) {
                problem("This server keeps no photos, so the export's photos weren't restored");
                break;
            }
            const recordType = String(p.recordType);
            const recordId = String(p.recordId);
            const [mine] = typeof p.id === "string" ? await db.select({ id: attachment.id, userId: attachment.userId }).from(attachment).where(eq(attachment.id, p.id)) : [];
            const created = Date.parse(String(p.createdAt));
            // Already here: by its id, or (restored before under a new id) the same photo on the same record.
            const [same] = Number.isFinite(created) ? await db.select({ id: attachment.id }).from(attachment).where(and(
                eq(attachment.userId, userId), eq(attachment.recordType, recordType), eq(attachment.recordId, recordId),
                eq(attachment.createdAt, new Date(created)), eq(attachment.size, Number(p.size)),
            )) : [];
            if (mine?.userId === userId || same) {
                result.photos.unchanged++;
                continue;
            }
            const [record] = await db.select({ id: records.id }).from(records)
                .where(and(eq(records.userId, userId), eq(records.type, recordType), eq(records.id, recordId), isNull(records.deletedAt)));
            const file = typeof p.file === "string" ? await read(p.file) : undefined;
            const contentType = file && imageType(file);
            if (!record || !file || !contentType) {
                problem(`A photo on ${recordType} ${recordId} couldn't be restored`);
                continue;
            }
            if (await noRoomFor(db, userId, file.byteLength, storageLimit)) {
                problem(`A photo on ${recordType} ${recordId} wasn't restored: this account's storage is full`);
                continue;
            }
            const thumb = typeof p.thumb === "string" ? await read(p.thumb) : undefined;
            // Its id, unless another account on this server has a photo with it.
            const id = mine ? randomUUID() : String(p.id);
            const fileKey = `${userId}/${id}`;
            await store.put(fileKey, file, contentType);
            const thumbKey = thumb && imageType(thumb) ? `${fileKey}.thumb` : undefined;
            if (thumb && thumbKey) {
                await store.put(thumbKey, thumb, imageType(thumb)!);
            }
            await db.insert(attachment).values({
                id, userId, recordType, recordId, contentType, size: file.byteLength,
                width: typeof p.width === "number" ? p.width : undefined, height: typeof p.height === "number" ? p.height : undefined,
                caption: typeof p.caption === "string" ? p.caption : undefined, position: typeof p.position === "number" ? p.position : 0,
                fileKey, thumbKey, createdAt: Number.isFinite(created) ? new Date(created) : new Date(),
            });
            result.photos.added++;
        }
        return result;
    }

    return api;
}
