import type * as schema from "@lawfive/schema";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { ApiError, request } from "./api.ts";
import { storageSize } from "./format.ts";
import { type Attachment, thumbnailOf } from "./photos.ts";

// Files on matches, venues and competitions (FILE-6 to FILE-12): PDFs, spreadsheets, Word
// documents, text and photos, sent as they are (a photo gets a thumbnail made here, a PDF none:
// the website has no PDF reader). The server checks what each is, names it, and sends every file
// but a photo as a download (FILE-11).

export type FileOwner = Exclude<z.infer<typeof schema.AttachmentRecordType>, "referee">;
type ContentType = z.infer<typeof schema.AttachmentContentType>;

/** The server's own most for a file (FILE-9); a plan may allow less, which the server says. */
export const maxFileBytes = 20 * 1024 * 1024;
/** What the file picker offers: the kinds the server takes. */
export const fileAccept = ".pdf,.xlsx,.csv,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,text/csv,text/plain,image/jpeg,image/png,image/webp";
/** How many lines of a CSV or text file are shown (FILE-12). */
export const previewLines = 200;

export type FileKind = "pdf" | "xlsx" | "csv" | "docx" | "txt" | "photo";

const kinds: Record<ContentType, FileKind> = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/csv": "csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "image/jpeg": "photo",
    "image/png": "photo",
    "image/webp": "photo",
};

/** What a file is, for its icon and its line. */
export function fileKind(file: Pick<Attachment, "contentType">): FileKind {
    return kinds[file.contentType] ?? "txt";
}

export const kindLabels: Record<FileKind, string> = { pdf: "PDF", xlsx: "Spreadsheet", csv: "CSV", docx: "Word", txt: "Text", photo: "Photo" };

/** "PDF · 1.2 MB": its kind and size, as the list shows them. */
export function describeFile(file: Pick<Attachment, "contentType" | "size">): string {
    const kb = file.size / 1024;
    const size = kb < 1 ? `${file.size} bytes` : kb < 1000 ? `${Math.max(1, Math.round(kb))} KB` : storageSize(file.size);
    return `${kindLabels[fileKind(file)]} · ${size}`;
}

/** Whether it can be looked at here: a photo large, CSV and text as text (FILE-12). */
export function canLookAt(file: Pick<Attachment, "contentType">): boolean {
    const kind = fileKind(file);
    return kind === "photo" || kind === "csv" || kind === "txt";
}

/**
 * Where to download it from: with download=1, so a photo is a download too, and the name the
 * server gives it is kept even when the website and the API are at different addresses (FILE-11).
 */
export function downloadUrl(file: Pick<Attachment, "url">): string {
    return `${file.url}${file.url.includes("?") ? "&" : "?"}download=1`;
}

/** A record's files, in order. */
export function useFiles(recordType: FileOwner, recordId: string | undefined) {
    return useQuery({
        queryKey: ["attachments", recordType, recordId, "file"],
        enabled: recordId !== undefined,
        queryFn: async () => (await request<{ attachments: Attachment[] }>("GET", `/attachments?recordType=${recordType}&recordId=${recordId}&kind=file`)).attachments,
    });
}

/** FILE-7: known not to fit before it's sent, once the server has refused another. */
export class NoRoomForFile extends Error {}

/** Uploads a file as it is, with a thumbnail when it's a photo. With `room`, one bigger than that isn't sent. */
export async function uploadFile(recordType: FileOwner, recordId: string, file: File, room?: number): Promise<Attachment> {
    if (file.size > maxFileBytes) {
        throw new Error(`${file.name} is too big: at most ${storageSize(maxFileBytes)}.`);
    }
    if (room !== undefined && file.size > room) {
        throw new NoRoomForFile();
    }
    const form = new FormData();
    form.set("recordType", recordType);
    form.set("recordId", recordId);
    form.set("kind", "file");
    form.set("name", file.name);
    form.set("file", file, file.name);
    if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
        // A thumbnail for the list; one that can't be made leaves the file's icon.
        const thumb = await thumbnailOf(file).catch(() => undefined);
        if (thumb) {
            form.set("thumb", thumb, "thumb.jpg");
        }
    }
    const res = await fetch("/v1/attachments", { method: "POST", credentials: "include", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new ApiError(res.status, data);
    }
    return data as Attachment;
}

export interface TextPreview {
    lines: string[];
    /** Whether there's more than is shown. */
    more: boolean;
}

/** The first lines of a CSV or text file, in the encoding the server says it's in, never as a page (FILE-12). */
export async function readTextPreview(file: Pick<Attachment, "url">): Promise<TextPreview> {
    const res = await fetch(file.url, { credentials: "include" });
    if (!res.ok) {
        throw new Error("This file couldn't be opened. Try again, or download it.");
    }
    const charset = res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
    const text = new TextDecoder(charset).decode(await res.arrayBuffer()).replace(/^﻿/, "");
    const lines = text.split(/\r\n|\r|\n/);
    if (lines.at(-1) === "") {
        lines.pop();
    }
    return { lines: lines.slice(0, previewLines), more: lines.length > previewLines };
}
