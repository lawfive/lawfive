import type { AttachmentContentType } from "@lawfive/schema";
import type { z } from "zod";
import { openZip } from "./zipFile.ts";

// What an attachment's file is (FILE-2, FILE-9), worked out from its bytes and never from its name or
// the type the sender says, and the name it's kept and downloaded under (FILE-10, FILE-11). Only
// what's listed is taken: photos (JPEG, PNG, WebP), PDF, XLSX, CSV, DOCX and plain text. Everything
// else is refused with what it is, so the message can say why.

export type ContentType = z.infer<typeof AttachmentContentType>;
export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const docx = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Each kind's ending, the one a name is given (FILE-10). */
export const endings: Record<ContentType, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
    [xlsx]: "xlsx", "text/csv": "csv", [docx]: "docx", "text/plain": "txt",
};
/** Other endings that already say what a file is. */
const sameEndings: Record<string, ContentType> = { jpeg: "image/jpeg" };
/** In people's words, for "the name says PDF, but it isn't one". */
const kindNames: Record<ContentType, string> = {
    "image/jpeg": "a JPEG", "image/png": "a PNG", "image/webp": "a WebP", "application/pdf": "a PDF",
    [xlsx]: "an Excel spreadsheet", "text/csv": "a CSV file", [docx]: "a Word document", "text/plain": "a text file",
};

export const takenKinds = "PDF, spreadsheets (XLSX, CSV), Word documents (DOCX), text (TXT) and photos (JPEG, PNG, WebP)";
const refusedBecause = (what: string) => `${what} LawFive keeps ${takenKinds}.`;

/** What an image file is, from its first bytes: only JPEG, PNG and WebP are taken (FILE-2). */
export function imageType(bytes: Uint8Array): ImageType | undefined {
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

/** A name's ending, lowercased, without the dot: "pdf"; "" when it has none. */
function endingOf(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Whether bytes are text: no NUL or other control characters but tabs, line ends and form feeds. */
function isText(bytes: Uint8Array): boolean {
    for (const b of bytes) {
        if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) {
            return false;
        }
        if (b === 0x7f) {
            return false;
        }
    }
    return true;
}

/** Text as imports read it: UTF-8, or else the older Windows encoding spreadsheets may save in. */
export function textCharset(bytes: Uint8Array): "utf-8" | "windows-1252" {
    try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return "utf-8";
    } catch {
        return "windows-1252";
    }
}

/** What a zip that says it's an Office file really is (SEC-3: its directory is checked against the file before anything is read). */
async function officeType(bytes: Uint8Array): Promise<ContentType | "macros" | "office" | "archive" | "damaged"> {
    let zip;
    try {
        zip = await openZip(bytes, 1024 * 1024);
    } catch {
        return "damaged";
    }
    try {
        const names = [...zip.entries.keys()];
        // A spreadsheet or document with macros keeps them in vbaProject.bin (.xlsm, .docm and their templates).
        if (names.some((n) => /(^|\/)vba(Project\.bin|Data\.xml)$/i.test(n))) {
            return "macros";
        }
        let types: string;
        try {
            const read = await zip.read("[Content_Types].xml");
            if (!read) {
                return "archive";
            }
            types = new TextDecoder().decode(read);
        } catch {
            return "damaged";
        }
        if (/macroEnabled/i.test(types)) {
            return "macros";
        }
        if (types.includes("spreadsheetml.sheet.main+xml") && names.some((n) => n.startsWith("xl/"))) {
            return xlsx;
        }
        if (types.includes("wordprocessingml.document.main+xml") && names.some((n) => n.startsWith("word/"))) {
            return docx;
        }
        // PowerPoint, templates, OpenDocument and the rest.
        return "office";
    } finally {
        await zip.close();
    }
}

/** Starts with these bytes. */
const startsWith = (bytes: Uint8Array, ...start: number[]) => start.every((b, i) => bytes[i] === b);
const startsWithText = (bytes: Uint8Array, text: string) => startsWith(bytes, ...[...text].map((c) => c.charCodeAt(0)));

/** Why a file of a kind that's known but not taken is refused, from its first bytes (it isn't text). */
function knownRefusal(bytes: Uint8Array): string | undefined {
    if (startsWith(bytes, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) {
        return refusedBecause("Older Office files (.xls, .doc) aren't taken, as they can carry macros: save it as .xlsx or .docx.");
    }
    if (startsWithText(bytes, "MZ") || startsWithText(bytes, "\x7fELF") || startsWith(bytes, 0xcf, 0xfa, 0xed, 0xfe) || startsWith(bytes, 0xce, 0xfa, 0xed, 0xfe) || startsWith(bytes, 0xca, 0xfe, 0xba, 0xbe)) {
        return refusedBecause("Programs aren't taken.");
    }
    if (startsWith(bytes, 0x1f, 0x8b) || startsWith(bytes, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c) || startsWithText(bytes, "Rar!") || startsWith(bytes, 0x42, 0x5a, 0x68) || startsWith(bytes, 0xfd, 0x37, 0x7a, 0x58, 0x5a)) {
        return refusedBecause("Archives aren't taken.");
    }
    if (startsWithText(bytes, "GIF8")) {
        return refusedBecause("GIF images aren't taken.");
    }
    const brand = String.fromCharCode(...bytes.subarray(4, 12));
    if (/^ftyp(heic|heix|hevc|mif1|msf1|avif)/.test(brand)) {
        return refusedBecause("HEIC and AVIF photos aren't taken: save it as a JPEG.");
    }
    return undefined;
}

export type FileCheck = { contentType: ContentType } | { refused: string };

/**
 * What a file is (FILE-9), from its bytes; its name only tells CSV from plain text, and is checked
 * against what the bytes are so a disguised file is refused.
 */
export async function checkFile(bytes: Uint8Array, name: string): Promise<FileCheck> {
    if (bytes.byteLength === 0) {
        return { refused: "That file is empty." };
    }
    const ending = endingOf(name);
    const said = (Object.entries(endings).find(([, e]) => e === ending)?.[0] ?? sameEndings[ending]) as ContentType | undefined;
    const notWhatItSays = said && { refused: refusedBecause(`That file's name says it's ${kindNames[said]}, but it isn't one.`) };
    const image = imageType(bytes);
    if (image) {
        return { contentType: image };
    }
    if (startsWithText(bytes, "%PDF-")) {
        return { contentType: "application/pdf" };
    }
    if (startsWithText(bytes, "PK\x03\x04")) {
        const type = await officeType(bytes);
        switch (type) {
            case "macros":
                return { refused: refusedBecause("Spreadsheets and documents with macros (.xlsm, .docm) aren't taken: save it as .xlsx or .docx without them.") };
            case "office":
                return { refused: refusedBecause("That kind of Office file isn't taken.") };
            case "archive":
                return { refused: refusedBecause("Zip files and other archives aren't taken.") };
            case "damaged":
                return notWhatItSays || { refused: refusedBecause("That file is damaged, or an archive.") };
            default:
                return { contentType: type };
        }
    }
    if (isText(bytes)) {
        // A web page, SVG or XML renamed as text is still refused, whatever it would be served as.
        const text = new TextDecoder(textCharset(bytes)).decode(bytes.subarray(0, 4096)).replace(/^\uFEFF/, "").trimStart();
        if (/^<[!?a-z/]/i.test(text)) {
            return { refused: refusedBecause("Web pages, SVG and XML files aren't taken.") };
        }
        if (ending === "csv") {
            return { contentType: "text/csv" };
        }
        if (ending === "txt" || ending === "text" || ending === "") {
            return { contentType: "text/plain" };
        }
        return notWhatItSays || { refused: refusedBecause(`.${ending} files aren't taken.`) };
    }
    const known = knownRefusal(bytes);
    if (known) {
        return { refused: known };
    }
    return notWhatItSays || { refused: refusedBecause("That kind of file isn't taken.") };
}

/** Folders, control characters, and the invisible ones that change direction or hide (U+202E and the like, zero widths, the BOM). */
const unwanted = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cn}]/gu;

export const maxNameLength = 120;

/**
 * A file's name as it's kept (FILE-10): no folders, no control or direction characters (so
 * "invoice\u202Efdp.exe" can't pass for a PDF), at most 120 characters, and ending in what the file
 * really is. Empty when nothing's left of it.
 */
export function cleanName(given: string, contentType: ContentType): string {
    const ending = endings[contentType];
    let name = (given.split(/[/\\]/).at(-1) ?? "").normalize("NFC").replace(unwanted, "").replace(/\s+/g, " ").trim()
        // A leading dot would hide it on some computers.
        .replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");
    const current = endingOf(name);
    // An ending that names a kind LawFive takes goes (its own, or a wrong one); any other stays before the real one.
    if (Object.values(endings).includes(current) || sameEndings[current]) {
        name = name.slice(0, name.length - current.length - 1).replace(/[.\s]+$/, "");
    }
    if (!name) {
        return "";
    }
    const keep = Array.from(name).slice(0, maxNameLength - ending.length - 1).join("").replace(/[.\s]+$/, "");
    return `${keep}.${ending}`;
}

/** Content-Disposition with a name (FILE-11): ASCII for old browsers, and filename* in UTF-8. */
export function contentDisposition(how: "attachment" | "inline", name: string): string {
    const ascii = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\%;]/g, "_");
    const utf8 = encodeURIComponent(name).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${how}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
