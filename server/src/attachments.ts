import { Attachment as AttachmentSchema, AttachmentChange, AttachmentKind, AttachmentRecordType, AttachmentUpload, Id, attachmentCollections, scopesAllow } from "@lawfive/schema";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { type ContentType, checkFile, cleanName, contentDisposition, endings, imageType, textCharset } from "./fileTypes.ts";
import { plansOf } from "./plans.ts";
import { onRecordWrite } from "./records.ts";
import type { FileStore } from "./storage.ts";
import { type StorageLimit, filesUsed, noRoomFor } from "./usage.ts";
import { attachmentEvent } from "./webhooks.ts";

export { imageType } from "./fileTypes.ts";

// Attachments (FILE-1 to FILE-15): photos on matches, venues and referees, and files (documents,
// or photos kept as files) on matches, venues and competitions. The rows say what each is and
// where it sits among its record's photos or files; the files are in the file store
// (storage.ts). Deleting a record or an account deletes its files too. An API key reaches them
// through their record's collection (FILE-14), and webhooks on the record's topic hear of
// changes (FILE-15). schema/src/endpoints.ts describes the endpoints.
//
//   GET    /v1/attachments?recordType=…[&recordId=…][&kind=…][&first=true]
//   POST   /v1/attachments              upload one (multipart/form-data)
//   PUT    /v1/attachments/:id          caption, name, or move it
//   PUT    /v1/attachments/:id/file     a new file in its place: a photo cropped or turned (FILE-8)
//   DELETE /v1/attachments/:id
//   GET    /v1/attachments/:id/file     the file (a download, but for a photo: FILE-11)
//   GET    /v1/attachments/:id/thumb    its small version

type Row = typeof tables.attachment.$inferSelect;
type Attachment = z.infer<typeof AttachmentSchema>;
type RecordType = z.infer<typeof AttachmentRecordType>;
type Kind = z.infer<typeof AttachmentKind>;

const mb = 1024 * 1024;
/** The server's own most for a photo (FILE-2) and for a file (FILE-9); a plan can only lower them. */
const maxPhotoBytes = 10 * mb;
const maxFileBytes = 20 * mb;
const maxThumbBytes = mb;
/** A record's photos and files are counted apart (FILE-1, FILE-6). */
const maxPerRecord: Record<Kind, number> = { photo: 30, file: 20 };
/** Which records have which (FILE-6): competitions have files alone, referees photos alone. */
const holds: Record<Kind, Set<RecordType>> = { photo: new Set(["match", "venue", "referee"]), file: new Set(["match", "venue", "competition"]) };
const recordTypes = new Set<string>(AttachmentRecordType.options);
const sizeText = (bytes: number) => `${Math.round((bytes / mb) * 10) / 10} MB`;

const stores = new WeakMap<Db, FileStore>();

function attachmentOut(row: Row): Attachment {
    // FILE-8: a file put in an attachment's place has keys of its own, and the addresses say which,
    // as browsers and the apps keep a file by its address for good.
    const version = row.fileKey.slice(row.fileKey.indexOf("/") + 1).split(".")[1];
    const v = version ? `?v=${version}` : "";
    return {
        id: row.id,
        recordType: row.recordType as RecordType,
        recordId: row.recordId,
        kind: row.kind as Kind,
        contentType: row.contentType as Attachment["contentType"],
        ...(row.name ? { name: row.name } : {}),
        size: row.size,
        ...(row.width ? { width: row.width } : {}),
        ...(row.height ? { height: row.height } : {}),
        ...(row.caption ? { caption: row.caption } : {}),
        position: row.position,
        createdAt: row.createdAt.toISOString(),
        url: `/v1/attachments/${row.id}/file${v}`,
        thumbUrl: `/v1/attachments/${row.id}/thumb${v}`,
        hasThumb: !!row.thumbKey || row.contentType.startsWith("image/"),
    };
}

/** FILE-15: webhooks on the record's topic hear of it, with the attachment and not its file. */
function announce(db: Db, action: "created" | "updated" | "deleted", rows: Row[]) {
    for (const row of rows) {
        attachmentEvent(db, row.userId, row.recordType, action, attachmentOut(row));
    }
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
    const moved: Row[] = [];
    for (const [i, row] of moving.entries()) {
        moved.push(...await db.update(attachment).set({ recordId: to, position: next + i }).where(eq(attachment.id, row.id)).returning());
    }
    announce(db, "updated", moved);
}

/** What an uploaded file is, or why it isn't taken, for a photo (FILE-2) or a file (FILE-9). */
async function typeOf(kind: Kind, bytes: Uint8Array, name: string): Promise<{ contentType: ContentType } | { refused: string }> {
    if (kind === "photo") {
        const image = imageType(bytes);
        return image ? { contentType: image } : { refused: "Add a photo: a JPEG, PNG or WebP." };
    }
    return checkFile(bytes, name);
}

/**
 * Whether a photo or file from an export can go on a record of this kind, checked as an upload is
 * (DATA-4, FILE-9): what it is, or why it isn't taken.
 */
export async function restorable(kind: Kind, recordType: string, bytes: Uint8Array, name: string): Promise<{ contentType: ContentType; name?: string } | { refused: string }> {
    if (!holds[kind].has(recordType as RecordType)) {
        return { refused: `a ${recordType} has no ${kind}s` };
    }
    const type = await typeOf(kind, bytes, name);
    if ("refused" in type) {
        return type;
    }
    if (bytes.byteLength > (kind === "photo" ? maxPhotoBytes : maxFileBytes)) {
        return { refused: `it's over ${sizeText(kind === "photo" ? maxPhotoBytes : maxFileBytes)}` };
    }
    return kind === "file" ? { ...type, name: cleanName(name, type.contentType) || `File.${endings[type.contentType]}` } : type;
}

/** How many of a kind a record can have (FILE-1, FILE-6). */
export const mostOnARecord = maxPerRecord;

export function attachmentsApi(db: Db, store: FileStore, storageLimit?: StorageLimit) {
    const { attachment, records } = tables;
    stores.set(db, store);

    // A deleted match, venue, referee or competition takes its attachments with it (FILE-3).
    onRecordWrite(db, (write) => {
        if (write.action !== "deleted" || !recordTypes.has(write.type)) {
            return;
        }
        void (async () => {
            const removed = await db.delete(attachment)
                .where(and(eq(attachment.userId, write.userId), eq(attachment.recordType, write.type), eq(attachment.recordId, write.row.id)))
                .returning();
            await removeFiles(store, removed);
            announce(db, "deleted", removed);
        })().catch((e) => console.error("attachments", e));
    });

    const api = new Hono<{ Variables: { userId: string; keyScopes?: string[] } }>();
    const mine = (userId: string, id: string) => and(eq(attachment.userId, userId), eq(attachment.id, id));
    const ofRecord = (userId: string, recordType: string, recordId: string, kind?: string) =>
        and(eq(attachment.userId, userId), eq(attachment.recordType, recordType), eq(attachment.recordId, recordId), kind ? eq(attachment.kind, kind) : undefined);
    const issue = (path: string, message: string) => ({ error: message, issues: [{ code: "custom", path: [path], message }] });
    const tooBig = { maxSize: maxFileBytes + maxThumbBytes + 64 * 1024, onError: (c: { json: (body: unknown, status: 400) => Response }) => c.json(issue("file", `The file is too big: at most ${sizeText(maxFileBytes)}.`), 400) };
    /** FILE-14: what an API key lacks to reach a record's attachments, if anything. */
    const keyNeeds = (scopes: string[] | undefined, recordType: string, level: "read" | "write") => {
        const need = `${attachmentCollections[recordType as RecordType]}:${level}`;
        return scopes && !scopesAllow(scopes, need) ? { error: `this API key needs ${need}` } : undefined;
    };
    /** The account's attachment by id, or undefined when it isn't theirs. */
    const find = async (userId: string, id: string | undefined) => {
        const checked = Id.safeParse(id);
        return checked.success ? (await db.select().from(attachment).where(mine(userId, checked.data)))[0] : undefined;
    };
    /** The most a photo or file may be on the account's plan (PLAN-2), and the words for going over it. */
    const largest = async (userId: string, kind: Kind) => {
        const serverMost = kind === "photo" ? maxPhotoBytes : maxFileBytes;
        const most = await plansOf(db).largest(userId, kind === "photo" ? "photoMb" : "attachmentMb", serverMost);
        return { most, refusal: `The ${kind} is too big: at most ${sizeText(most)}${most < serverMost ? " on your plan" : ""}.` };
    };
    const checkThumb = (thumb: Uint8Array | undefined) => !thumb || (!!imageType(thumb) && thumb.byteLength <= maxThumbBytes);
    const noRoom = async (userId: string, message: string) =>
        // FILE-7: so the apps can say how much is used.
        ({ ...issue("file", message), storage: { usedBytes: await filesUsed(db, userId), limitBytes: await storageLimit?.(userId) } });

    api.get("/attachments", async (c) => {
        const recordType = AttachmentRecordType.safeParse(c.req.query("recordType"));
        const recordId = c.req.query("recordId");
        const checkedId = recordId === undefined ? undefined : Id.safeParse(recordId);
        const kind = c.req.query("kind") ?? "photo";
        if (!recordType.success || (checkedId && !checkedId.success) || !["photo", "file", "all"].includes(kind)) {
            return c.json({ error: "recordType should be match, venue, referee or competition, recordId a record's id, and kind photo, file or all" }, 400);
        }
        const refused = keyNeeds(c.var.keyScopes, recordType.data, "read");
        if (refused) {
            return c.json(refused, 403);
        }
        const first = c.req.query("first") === "true";
        // Without kind, only photos, as servers had before files (and a referee's picture is a photo).
        const where = and(
            eq(attachment.userId, c.var.userId), eq(attachment.recordType, recordType.data),
            checkedId?.success ? eq(attachment.recordId, checkedId.data) : undefined,
            first ? eq(attachment.kind, "photo") : kind === "all" ? undefined : eq(attachment.kind, kind),
        );
        const order = [asc(attachment.recordId), asc(attachment.position), asc(attachment.createdAt)];
        const rows = first
            ? await db.selectDistinctOn([attachment.recordId]).from(attachment).where(where).orderBy(...order)
            : await db.select().from(attachment).where(where).orderBy(...order);
        return c.json({ attachments: rows.map(attachmentOut) });
    });

    api.post("/attachments", bodyLimit(tooBig), async (c) => {
        const form = await c.req.parseBody().catch(() => undefined);
        if (!form) {
            return c.json({ error: "send the file as multipart/form-data" }, 400);
        }
        const fields = AttachmentUpload.safeParse(Object.fromEntries(Object.entries(form).filter(([, v]) => typeof v === "string")));
        if (!fields.success) {
            return c.json({ error: "invalid upload", issues: fields.error.issues }, 400);
        }
        const { recordType, recordId, caption, width, height } = fields.data;
        const userId = c.var.userId;
        const refused = keyNeeds(c.var.keyScopes, recordType, "write");
        if (refused) {
            return c.json(refused, 403);
        }
        const file = form.file instanceof File ? new Uint8Array(await form.file.arrayBuffer()) : undefined;
        const thumb = form.thumb instanceof File ? new Uint8Array(await form.thumb.arrayBuffer()) : undefined;
        if (!file) {
            return c.json(issue("file", "Add a file: a photo, PDF, spreadsheet, Word document or text."), 400);
        }
        // Left out, a JPEG, PNG or WebP is a photo where photos go; anything else is a file.
        const kind: Kind = fields.data.kind ?? (holds.photo.has(recordType) && imageType(file) ? "photo" : "file");
        if (!holds[kind].has(recordType)) {
            return c.json(issue("kind", kind === "photo" ? `A ${recordType} has files, not photos.` : `A ${recordType} has photos, not files.`), 400);
        }
        const given = fields.data.name ?? (form.file instanceof File ? form.file.name : "");
        const type = await typeOf(kind, file, given);
        if ("refused" in type) {
            return c.json(issue("file", type.refused), 400);
        }
        const { contentType } = type;
        // PLAN-2: the plan's largest photo or file, within the server's own.
        const { most, refusal } = await largest(userId, kind);
        if (file.byteLength > most) {
            return c.json(issue("file", refusal), 400);
        }
        if (!checkThumb(thumb)) {
            return c.json(issue("thumb", "The thumbnail should be a JPEG, PNG or WebP of at most 1 MB."), 400);
        }
        const [record] = await db.select({ id: records.id }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, recordType), eq(records.id, recordId), isNull(records.deletedAt)));
        if (!record) {
            return c.json({ error: `no such ${recordType}: save it first` }, 404);
        }
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(attachment).where(ofRecord(userId, recordType, recordId, kind));
        const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${attachment.position}) + 1, 0)::int` }).from(attachment).where(ofRecord(userId, recordType, recordId, kind));
        if (count >= maxPerRecord[kind]) {
            return c.json({ error: `A ${recordType} can have at most ${maxPerRecord[kind]} ${kind}s.` }, 400);
        }
        const adding = file.byteLength + (thumb?.byteLength ?? 0);
        const full = await noRoomFor(db, userId, adding, storageLimit);
        if (full) {
            return c.json(await noRoom(userId, full), 400);
        }
        // FILE-10: a file keeps the name it was added with, cleaned; photos have captions instead.
        const name = kind === "file" ? cleanName(given, contentType) || `File.${endings[contentType]}` : undefined;
        const id = randomUUID();
        const fileKey = `${userId}/${id}`;
        const thumbKey = thumb ? `${fileKey}.thumb` : undefined;
        await store.put(fileKey, file, contentType);
        if (thumb && thumbKey) {
            await store.put(thumbKey, thumb, imageType(thumb)!);
        }
        const [row] = await db.insert(attachment).values({
            id, userId, recordType, recordId, kind, contentType, name, size: file.byteLength, thumbSize: thumb?.byteLength, width, height,
            caption: caption?.trim() || undefined, position: next, fileKey, thumbKey, createdAt: new Date(),
        }).returning();
        announce(db, "created", [row]);
        return c.json(attachmentOut(row), 201);
    });

    api.put("/attachments/:id", async (c) => {
        const body = AttachmentChange.safeParse(await c.req.json().catch(() => undefined));
        const row = await find(c.var.userId, c.req.param("id"));
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const refused = keyNeeds(c.var.keyScopes, row.recordType, "write");
        if (refused) {
            return c.json(refused, 403);
        }
        if (!body.success) {
            return c.json({ error: "invalid change", issues: body.error.issues }, 400);
        }
        const { caption, name, position } = body.data;
        // FILE-10: renamed, it's cleaned as an upload is and keeps its ending.
        const newName = name === undefined ? undefined : cleanName(name, row.contentType as ContentType);
        if (newName !== undefined && (row.kind !== "file" || !newName)) {
            return c.json(issue("name", row.kind === "file" ? "Give the file a name." : "Photos have captions, not names."), 400);
        }
        await db.transaction(async (tx) => {
            if (caption !== undefined) {
                await tx.update(attachment).set({ caption: caption?.trim() || null }).where(eq(attachment.id, row.id));
            }
            if (newName !== undefined) {
                await tx.update(attachment).set({ name: newName }).where(eq(attachment.id, row.id));
            }
            if (position !== undefined) {
                // Taken out and put back at its new place; the record's others of its kind are numbered again from 0.
                const order = (await tx.select({ id: attachment.id }).from(attachment)
                    .where(ofRecord(row.userId, row.recordType, row.recordId, row.kind))
                    .orderBy(asc(attachment.position), asc(attachment.createdAt))).map((a) => a.id).filter((a) => a !== row.id);
                order.splice(Math.min(position, order.length), 0, row.id);
                for (const [i, each] of order.entries()) {
                    await tx.update(attachment).set({ position: i }).where(eq(attachment.id, each));
                }
            }
        });
        const [changed] = await db.select().from(attachment).where(eq(attachment.id, row.id));
        announce(db, "updated", [changed]);
        return c.json(attachmentOut(changed));
    });

    // FILE-8: the app crops or turns a photo itself and sends the result, with its thumbnail; it
    // keeps its place, caption and id, and the old files go. A file can be replaced the same way.
    api.put("/attachments/:id/file", bodyLimit(tooBig), async (c) => {
        const row = await find(c.var.userId, c.req.param("id"));
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const refused = keyNeeds(c.var.keyScopes, row.recordType, "write");
        if (refused) {
            return c.json(refused, 403);
        }
        const kind = row.kind as Kind;
        const form = await c.req.parseBody().catch(() => undefined);
        const file = form?.file instanceof File ? new Uint8Array(await form.file.arrayBuffer()) : undefined;
        const thumb = form?.thumb instanceof File ? new Uint8Array(await form.thumb.arrayBuffer()) : undefined;
        const given = form?.file instanceof File && form.file.name !== "blob" ? form.file.name : row.name ?? "";
        const type = file ? await typeOf(kind, file, given) : undefined;
        if (!file || !type || "refused" in type) {
            return c.json(issue("file", type && "refused" in type ? type.refused : kind === "photo" ? "Send the photo: a JPEG, PNG or WebP." : "Send the file."), 400);
        }
        const { contentType } = type;
        const { most, refusal } = await largest(c.var.userId, kind);
        if (file.byteLength > most) {
            return c.json(issue("file", refusal), 400);
        }
        if (!checkThumb(thumb)) {
            return c.json(issue("thumb", "The thumbnail should be a JPEG, PNG or WebP of at most 1 MB."), 400);
        }
        const dimension = (v: unknown) => (typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : undefined);
        const growth = file.byteLength + (thumb?.byteLength ?? 0) - row.size - (row.thumbSize ?? 0);
        const full = growth > 0 && await noRoomFor(db, c.var.userId, growth, storageLimit);
        if (full) {
            return c.json(await noRoom(c.var.userId, full), 400);
        }
        const fileKey = `${row.userId}/${row.id}.${randomUUID().slice(0, 8)}`;
        const thumbKey = thumb ? `${fileKey}.thumb` : null;
        await store.put(fileKey, file, contentType);
        if (thumb && thumbKey) {
            await store.put(thumbKey, thumb, imageType(thumb)!);
        }
        const [changed] = await db.update(attachment).set({
            fileKey, thumbKey, contentType, size: file.byteLength, thumbSize: thumb?.byteLength ?? null,
            // A file keeps its name, with the ending of what it now is.
            name: row.name ? cleanName(row.name, contentType) || row.name : row.name,
            width: dimension(form?.width) ?? null, height: dimension(form?.height) ?? null,
        }).where(eq(attachment.id, row.id)).returning();
        await removeFiles(store, [row]);
        announce(db, "updated", [changed]);
        return c.json(attachmentOut(changed));
    });

    api.delete("/attachments/:id", async (c) => {
        const row = await find(c.var.userId, c.req.param("id"));
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const refused = keyNeeds(c.var.keyScopes, row.recordType, "write");
        if (refused) {
            return c.json(refused, 403);
        }
        const removed = await db.delete(attachment).where(mine(c.var.userId, row.id)).returning();
        await removeFiles(store, removed);
        announce(db, "deleted", removed);
        return c.json({ ok: true as const });
    });

    // FILE-11: what's sent never runs at the server's address: its checked type, nosniff, a
    // sandbox, and every file but a photo as a download with its name.
    const headers = (type: string, disposition?: string) => ({
        "content-type": type,
        // An attachment's files never change, so browsers keep them; private, as they're the user's own.
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        ...(disposition ? { "content-disposition": disposition } : {}),
    });

    api.get("/attachments/:id/file", async (c) => {
        const row = await find(c.var.userId, c.req.param("id"));
        const refused = row && keyNeeds(c.var.keyScopes, row.recordType, "read");
        if (refused) {
            return c.json(refused, 403);
        }
        const bytes = row && await store.get(row.fileKey);
        if (!row || !bytes) {
            return c.json({ error: "not found" }, 404);
        }
        const image = imageType(bytes);
        const type = row.contentType as ContentType;
        // A photo is checked again as it goes; anything else is what it was found to be when it came.
        if (type.startsWith("image/") ? image !== type : !(type in endings) || !!image) {
            return c.json({ error: "not found" }, 404);
        }
        const name = row.name ?? (cleanName(row.caption ?? "", type) || `Photo.${endings[type]}`);
        const shown = !!image && c.req.query("download") !== "1";
        return c.body(bytes as Uint8Array<ArrayBuffer>, 200, headers(
            type.startsWith("text/") ? `${type}; charset=${textCharset(bytes)}` : type,
            contentDisposition(shown ? "inline" : "attachment", name),
        ));
    });

    api.get("/attachments/:id/thumb", async (c) => {
        const row = await find(c.var.userId, c.req.param("id"));
        const refused = row && keyNeeds(c.var.keyScopes, row.recordType, "read");
        if (refused) {
            return c.json(refused, 403);
        }
        // A photo without a thumbnail is its own; a file other than a photo has none (FILE-12).
        const key = row && (row.thumbKey ?? (row.contentType.startsWith("image/") ? row.fileKey : undefined));
        const bytes = key && await store.get(key);
        const type = bytes && imageType(bytes);
        if (!bytes || !type) {
            return c.json({ error: "not found" }, 404);
        }
        return c.body(bytes as Uint8Array<ArrayBuffer>, 200, headers(type));
    });

    return api;
}
