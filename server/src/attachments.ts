import { Attachment as AttachmentSchema, AttachmentChange, AttachmentRecordType, AttachmentUpload, Id } from "@lawfive/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { plansOf } from "./plans.ts";
import { onRecordWrite } from "./records.ts";
import type { FileStore } from "./storage.ts";
import { type StorageLimit, filesUsed, noRoomFor } from "./usage.ts";

// Attachments (FILE-1 to FILE-5): photos on matches, venues and referees. The rows say what each
// is and where it sits among its record's others; the files are in the file store (storage.ts).
// Deleting a record or an account deletes its files too. schema/src/endpoints.ts describes the
// endpoints.
//
//   GET    /v1/attachments?recordType=…[&recordId=…][&first=true]
//   POST   /v1/attachments              upload one (multipart/form-data)
//   PUT    /v1/attachments/:id          caption, or move it
//   PUT    /v1/attachments/:id/file     a new file in its place, cropped or turned (FILE-8)
//   DELETE /v1/attachments/:id
//   GET    /v1/attachments/:id/file     the image
//   GET    /v1/attachments/:id/thumb    its small version

type Row = typeof tables.attachment.$inferSelect;
type Attachment = z.infer<typeof AttachmentSchema>;
type RecordType = z.infer<typeof AttachmentRecordType>;

const maxFileBytes = 10 * 1024 * 1024;
const maxThumbBytes = 1024 * 1024;
const maxPerRecord = 30;
const recordTypes = new Set<string>(AttachmentRecordType.options);

const stores = new WeakMap<Db, FileStore>();

/** What an image file is, from its first bytes: only JPEG, PNG and WebP are taken (FILE-2). */
export function imageType(bytes: Uint8Array): Attachment["contentType"] | undefined {
    const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return "image/jpeg";
    }
    if (text(0, 8) === "\x89PNG\r\n\x1a\n") {
        return "image/png";
    }
    if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") {
        return "image/webp";
    }
    return undefined;
}

function attachmentOut(row: Row): Attachment {
    // FILE-8: a file put in an attachment's place has keys of its own, and the addresses say which,
    // as browsers and the apps keep a file by its address for good.
    const version = row.fileKey.slice(row.fileKey.indexOf("/") + 1).split(".")[1];
    const v = version ? `?v=${version}` : "";
    return {
        id: row.id,
        recordType: row.recordType as RecordType,
        recordId: row.recordId,
        contentType: row.contentType as Attachment["contentType"],
        size: row.size,
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
        ...(row.caption ? { caption: row.caption } : {}),
        position: row.position,
        createdAt: row.createdAt.toISOString(),
        url: `/v1/attachments/${row.id}/file${v}`,
        thumbUrl: `/v1/attachments/${row.id}/thumb${v}`,
    };
}

async function removeFiles(store: FileStore, rows: Pick<Row, "fileKey" | "thumbKey">[]) {
    for (const row of rows) {
        await store.delete(row.fileKey);
        if (row.thumbKey) {
            await store.delete(row.thumbKey);
        }
    }
}

/** The file store attachments are kept in, when the server has one. */
export function fileStoreOf(db: Db): FileStore | undefined {
    return stores.get(db);
}

/** Deletes every file an account has, before the account goes (its rows go with it). */
export async function deleteAccountFiles(db: Db, userId: string) {
    const store = stores.get(db);
    if (store) {
        await removeFiles(store, await db.select().from(tables.attachment).where(eq(tables.attachment.userId, userId)));
    }
}

/** Moves the attachments of merged records onto the one kept (DUP-3), after its own. */
export async function moveAttachments(db: Db, userId: string, recordType: RecordType, from: string[], to: string) {
    const { attachment } = tables;
    const moving = await db.select().from(attachment)
        .where(and(eq(attachment.userId, userId), eq(attachment.recordType, recordType), inArray(attachment.recordId, from)))
        .orderBy(asc(attachment.recordId), asc(attachment.position));
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${attachment.position}) + 1, 0)::int` }).from(attachment)
        .where(and(eq(attachment.userId, userId), eq(attachment.recordType, recordType), eq(attachment.recordId, to)));
    for (const [i, row] of moving.entries()) {
        await db.update(attachment).set({ recordId: to, position: next + i }).where(eq(attachment.id, row.id));
    }
}

export function attachmentsApi(db: Db, store: FileStore, storageLimit?: StorageLimit) {
    const { attachment, records } = tables;
    stores.set(db, store);

    // A deleted match, venue or referee takes its attachments with it (FILE-3).
    onRecordWrite(db, (write) => {
        if (write.action !== "deleted" || !recordTypes.has(write.type)) {
            return;
        }
        void (async () => {
            const removed = await db.delete(attachment)
                .where(and(eq(attachment.userId, write.userId), eq(attachment.recordType, write.type), eq(attachment.recordId, write.row.id)))
                .returning();
            await removeFiles(store, removed);
        })().catch((e) => console.error("attachments", e));
    });

    const api = new Hono<{ Variables: { userId: string } }>();
    const mine = (userId: string, id: string) => and(eq(attachment.userId, userId), eq(attachment.id, id));
    const ofRecord = (userId: string, recordType: string, recordId: string) =>
        and(eq(attachment.userId, userId), eq(attachment.recordType, recordType), eq(attachment.recordId, recordId));
    const issue = (path: string, message: string) => ({ error: message, issues: [{ code: "custom", path: [path], message }] });

    api.get("/attachments", async (c) => {
        const recordType = AttachmentRecordType.safeParse(c.req.query("recordType"));
        const recordId = c.req.query("recordId");
        const checkedId = recordId === undefined ? undefined : Id.safeParse(recordId);
        if (!recordType.success || (checkedId && !checkedId.success)) {
            return c.json({ error: "recordType should be match, venue or referee, and recordId a record's id" }, 400);
        }
        const where = and(
            eq(attachment.userId, c.var.userId), eq(attachment.recordType, recordType.data),
            checkedId?.success ? eq(attachment.recordId, checkedId.data) : undefined,
        );
        const order = [asc(attachment.recordId), asc(attachment.position), asc(attachment.createdAt)];
        const rows = c.req.query("first") === "true"
            ? await db.selectDistinctOn([attachment.recordId]).from(attachment).where(where).orderBy(...order)
            : await db.select().from(attachment).where(where).orderBy(...order);
        return c.json({ attachments: rows.map(attachmentOut) });
    });

    api.post("/attachments", bodyLimit({ maxSize: maxFileBytes + maxThumbBytes + 64 * 1024, onError: (c) => c.json(issue("file", "The photo is too big: at most 10 MB."), 400) }), async (c) => {
        const form = await c.req.parseBody().catch(() => undefined);
        if (!form) {
            return c.json({ error: "send the photo as multipart/form-data" }, 400);
        }
        const fields = AttachmentUpload.safeParse(Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === "string")));
        if (!fields.success) {
            return c.json({ error: "invalid upload", issues: fields.error.issues }, 400);
        }
        const file = form.file instanceof File ? new Uint8Array(await form.file.arrayBuffer()) : undefined;
        const thumb = form.thumb instanceof File ? new Uint8Array(await form.thumb.arrayBuffer()) : undefined;
        const contentType = file && imageType(file);
        if (!file || !contentType) {
            return c.json(issue("file", "Add a photo: a JPEG, PNG or WebP."), 400);
        }
        // PLAN-2: the plan's largest photo, within the server's own.
        const largest = await plansOf(db).largest(c.var.userId, "photoMb", maxFileBytes);
        if (file.byteLength > largest) {
            return c.json(issue("file", `The photo is too big: at most ${Math.round((largest / (1024 * 1024)) * 10) / 10} MB${largest < maxFileBytes ? " on your plan" : ""}.`), 400);
        }
        if (thumb && (!imageType(thumb) || thumb.byteLength > maxThumbBytes)) {
            return c.json(issue("thumb", "The thumbnail should be a JPEG, PNG or WebP of at most 1 MB."), 400);
        }
        const { recordType, recordId, caption, width, height } = fields.data;
        const userId = c.var.userId;
        const [record] = await db.select({ id: records.id }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, recordType), eq(records.id, recordId), isNull(records.deletedAt)));
        if (!record) {
            return c.json({ error: `no such ${recordType}: save it first` }, 404);
        }
        const [{ count, next }] = await db.select({ count: sql<number>`count(*)::int`, next: sql<number>`coalesce(max(${attachment.position}) + 1, 0)::int` })
            .from(attachment).where(ofRecord(userId, recordType, recordId));
        if (count >= maxPerRecord) {
            return c.json({ error: `A ${recordType} can have at most ${maxPerRecord} photos.` }, 400);
        }
        const full = await noRoomFor(db, userId, file.byteLength, storageLimit);
        if (full) {
            // FILE-7: so the apps can say how much is used.
            return c.json({ ...issue("file", full), storage: { usedBytes: await filesUsed(db, userId), limitBytes: await storageLimit?.(userId) } }, 400);
        }
        const id = randomUUID();
        const fileKey = `${userId}/${id}`;
        const thumbKey = thumb ? `${fileKey}.thumb` : undefined;
        await store.put(fileKey, file, contentType);
        if (thumb && thumbKey) {
            await store.put(thumbKey, thumb, imageType(thumb)!);
        }
        const [row] = await db.insert(attachment).values({
            id, userId, recordType, recordId, contentType, size: file.byteLength, width, height,
            caption: caption?.trim() || undefined, position: next, fileKey, thumbKey, createdAt: new Date(),
        }).returning();
        return c.json(attachmentOut(row), 201);
    });

    api.put("/attachments/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const body = AttachmentChange.safeParse(await c.req.json().catch(() => undefined));
        if (!id.success) {
            return c.json({ error: "not found" }, 404);
        }
        if (!body.success) {
            return c.json({ error: "invalid change", issues: body.error.issues }, 400);
        }
        const [row] = await db.select().from(attachment).where(mine(c.var.userId, id.data));
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const { caption, position } = body.data;
        await db.transaction(async (tx) => {
            if (caption !== undefined) {
                await tx.update(attachment).set({ caption: caption?.trim() || null }).where(eq(attachment.id, row.id));
            }
            if (position !== undefined) {
                // Taken out and put back at its new place; the record's others are numbered again from 0.
                const order = (await tx.select({ id: attachment.id }).from(attachment)
                    .where(ofRecord(row.userId, row.recordType, row.recordId))
                    .orderBy(asc(attachment.position), asc(attachment.createdAt))).map((a) => a.id).filter((a) => a !== row.id);
                order.splice(Math.min(position, order.length), 0, row.id);
                for (const [i, each] of order.entries()) {
                    await tx.update(attachment).set({ position: i }).where(eq(attachment.id, each));
                }
            }
        });
        const [changed] = await db.select().from(attachment).where(eq(attachment.id, row.id));
        return c.json(attachmentOut(changed));
    });

    // FILE-8: the app crops or turns a photo itself and sends the result, with its thumbnail; it
    // keeps its place, caption and id, and the old files go.
    api.put("/attachments/:id/file", bodyLimit({ maxSize: maxFileBytes + maxThumbBytes + 64 * 1024, onError: (c) => c.json(issue("file", "The photo is too big: at most 10 MB."), 400) }), async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const [row] = id.success ? await db.select().from(attachment).where(mine(c.var.userId, id.data)) : [];
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const form = await c.req.parseBody().catch(() => undefined);
        const file = form?.file instanceof File ? new Uint8Array(await form.file.arrayBuffer()) : undefined;
        const thumb = form?.thumb instanceof File ? new Uint8Array(await form.thumb.arrayBuffer()) : undefined;
        const contentType = file && imageType(file);
        if (!file || !contentType) {
            return c.json(issue("file", "Send the photo: a JPEG, PNG or WebP."), 400);
        }
        const largest = await plansOf(db).largest(c.var.userId, "photoMb", maxFileBytes);
        if (file.byteLength > largest) {
            return c.json(issue("file", `The photo is too big: at most ${Math.round((largest / (1024 * 1024)) * 10) / 10} MB${largest < maxFileBytes ? " on your plan" : ""}.`), 400);
        }
        if (thumb && (!imageType(thumb) || thumb.byteLength > maxThumbBytes)) {
            return c.json(issue("thumb", "The thumbnail should be a JPEG, PNG or WebP of at most 1 MB."), 400);
        }
        const dimension = (v: unknown) => (typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : undefined);
        const full = file.byteLength > row.size && await noRoomFor(db, c.var.userId, file.byteLength - row.size, storageLimit);
        if (full) {
            return c.json({ ...issue("file", full), storage: { usedBytes: await filesUsed(db, c.var.userId), limitBytes: await storageLimit?.(c.var.userId) } }, 400);
        }
        const fileKey = `${row.userId}/${row.id}.${randomUUID().slice(0, 8)}`;
        const thumbKey = thumb ? `${fileKey}.thumb` : null;
        await store.put(fileKey, file, contentType);
        if (thumb && thumbKey) {
            await store.put(thumbKey, thumb, imageType(thumb)!);
        }
        const [changed] = await db.update(attachment).set({
            fileKey, thumbKey, contentType, size: file.byteLength, width: dimension(form?.width) ?? null, height: dimension(form?.height) ?? null,
        }).where(eq(attachment.id, row.id)).returning();
        await removeFiles(store, [row]);
        return c.json(attachmentOut(changed));
    });

    api.delete("/attachments/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const removed = id.success ? await db.delete(attachment).where(mine(c.var.userId, id.data)).returning() : [];
        if (!removed.length) {
            return c.json({ error: "not found" }, 404);
        }
        await removeFiles(store, removed);
        return c.json({ ok: true as const });
    });

    for (const which of ["file", "thumb"] as const) {
        api.get(`/attachments/:id/${which}`, async (c) => {
            const id = Id.safeParse(c.req.param("id"));
            const [row] = id.success ? await db.select().from(attachment).where(mine(c.var.userId, id.data)) : [];
            const bytes = row && await store.get(which === "thumb" && row.thumbKey ? row.thumbKey : row.fileKey);
            const type = bytes && imageType(bytes);
            if (!bytes || !type) {
                return c.json({ error: "not found" }, 404);
            }
            return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
                "content-type": type,
                // An attachment's files never change, so browsers keep them; private, as they're the user's own.
                "cache-control": "private, max-age=31536000, immutable",
                "x-content-type-options": "nosniff",
                "content-security-policy": "default-src 'none'; sandbox",
            });
        });
    }

    return api;
}
