// Reading a file to import matches from (IMP-2), for POST /v1/import/file, so the web app, the phone
// apps and the API all read files the same way: CSV (commas, semicolons or tabs, as spreadsheets save
// it), Excel (.xlsx, its Matches sheet or else the first) or JSON (a list of objects, or { matches: [...] }).
// The result is rows of column names and values for importMatches, which does the rest.

import { Unzip, UnzipInflate, zipSync } from "fflate";
import readSheets from "read-excel-file/node";

export type ImportValue = string | number | boolean | null;

export interface ImportFile {
    rows: Record<string, ImportValue>[];
    /** Where each row is in the file, for showing problems: its line (CSV and Excel) or item number (JSON). */
    lines: number[];
    kind: "table" | "json";
}

/** A file that can't be imported, and why, in words for the person who chose it. */
export class ImportFileError extends Error {}

export const maxRows = 1000;
export const maxBytes = 5 * 1024 * 1024;

/** SEC-3: an .xlsx is a zip, and a small one can open out to fill the server's memory. */
export const maxUnzippedBytes = 100 * 1024 * 1024;

/**
 * SEC-3: an .xlsx opened here, counting what each part really opens out to rather than the sizes the
 * file claims (which whoever made it chose), and stopping past maxUnzippedBytes. It's fed a little at a
 * time, as deflate can open out a thousandfold. Only what was counted goes on to the spreadsheet reader,
 * zipped again without compression: undefined when it's too big, "unreadable" when it isn't a zip.
 */
function openedXlsx(bytes: Uint8Array): Uint8Array | undefined | "unreadable" {
    const files: Record<string, Uint8Array[]> = {};
    let total = 0;
    let tooBig = false;
    let failed = false;
    const unzip = new Unzip((file) => {
        const parts: Uint8Array[] = [];
        files[file.name] = parts;
        file.ondata = (error, data) => {
            if (error) {
                failed = true;
                return;
            }
            total += data.length;
            if (total > maxUnzippedBytes) {
                tooBig = true;
                file.terminate();
                return;
            }
            parts.push(data);
        };
        file.start();
    });
    unzip.register(UnzipInflate);
    const step = 4096;
    try {
        for (let at = 0; at < bytes.length && !tooBig && !failed; at += step) {
            unzip.push(bytes.subarray(at, at + step), at + step >= bytes.length);
        }
    } catch {
        failed = true;
    }
    if (tooBig) {
        return undefined;
    }
    if (failed || Object.keys(files).length === 0) {
        return "unreadable";
    }
    const joined = (parts: Uint8Array[]) => {
        const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
        let at = 0;
        for (const p of parts) {
            all.set(p, at);
            at += p.length;
        }
        return all;
    };
    return zipSync(Object.fromEntries(Object.entries(files).filter(([name]) => !name.endsWith("/")).map(([name, parts]) => [name, joined(parts)])), { level: 0 });
}

/** Spreadsheets on Windows may save CSV in the older Western encoding rather than UTF-8. */
function textOf(bytes: Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder("windows-1252").decode(bytes);
    }
}

export async function readImportFile(fileName: string, contentType: string, bytes: Uint8Array): Promise<ImportFile> {
    if (bytes.byteLength > maxBytes) {
        throw new ImportFileError("That file is over 5 MB. Split it into smaller files.");
    }
    const name = fileName.toLowerCase();
    let result: ImportFile;
    if (name.endsWith(".xlsx") || contentType.includes("spreadsheetml")) {
        // The sheet called Matches, else the first that isn't the example's column guide.
        const opened = openedXlsx(bytes);
        if (opened === undefined) {
            throw new ImportFileError("That Excel file is too big once opened. Split it into smaller files.");
        }
        let sheets;
        try {
            if (opened === "unreadable") {
                throw new Error("not a zip");
            }
            sheets = await readSheets(Buffer.from(opened));
        } catch {
            throw new ImportFileError("That Excel file couldn't be read. Open it and save it again as .xlsx, or as CSV.");
        }
        const sheet = sheets.find((s) => s.sheet.toLowerCase() === "matches") ?? sheets.find((s) => s.sheet.toLowerCase() !== "columns") ?? sheets[0];
        result = fromTable((sheet?.data ?? []).map((row) => row.map(cellValue)));
    } else if (name.endsWith(".json") || contentType === "application/json") {
        result = fromJson(textOf(bytes));
    } else if (name.endsWith(".xls") || name.endsWith(".numbers") || name.endsWith(".ods")) {
        throw new ImportFileError("Save it as Excel (.xlsx) or CSV first: this kind of spreadsheet can't be read here.");
    } else {
        result = fromTable(parseCsv(textOf(bytes)));
    }
    if (result.rows.length === 0) {
        throw new ImportFileError("There are no matches in that file: it needs a row of column names, then a row for each match.");
    }
    if (result.rows.length > maxRows) {
        throw new ImportFileError(`That file has ${result.rows.length} rows; import up to ${maxRows} at a time.`);
    }
    return result;
}

/** A spreadsheet cell as the import reads it: dates as 2026-11-07, times as 09:00, both as 2026-11-07 09:00. */
function cellValue(value: unknown): ImportValue {
    if (value instanceof Date) {
        const pad = (n: number) => String(n).padStart(2, "0");
        const time = `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`;
        // A time on its own is stored as a fraction of a day from 1899.
        if (value.getUTCFullYear() < 1901) {
            return time;
        }
        const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
        return time === "00:00" ? date : `${date} ${time}`;
    }
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

/** A table's first non-empty row is the column names; each later non-empty row a match. */
function fromTable(table: ImportValue[][]): ImportFile {
    const empty = (row: ImportValue[]) => row.every((v) => v === null || String(v).trim() === "");
    const headerAt = table.findIndex((row) => !empty(row));
    if (headerAt < 0) {
        return { rows: [], lines: [], kind: "table" };
    }
    const headers = table[headerAt].map((h) => (h === null ? "" : String(h).trim()));
    const rows: ImportFile["rows"] = [];
    const lines: number[] = [];
    table.slice(headerAt + 1).forEach((row, i) => {
        if (empty(row)) {
            return;
        }
        const values: Record<string, ImportValue> = {};
        headers.forEach((header, column) => {
            if (header && !(header in values)) {
                values[header] = row[column] ?? null;
            }
        });
        rows.push(values);
        lines.push(headerAt + i + 2);
    });
    return { rows, lines, kind: "table" };
}

/** A list of objects; an object one level down becomes columns like "home name", and a list becomes "a, b". */
function fromJson(text: string): ImportFile {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text.replace(/^﻿/, ""));
    } catch {
        throw new ImportFileError("That isn't valid JSON.");
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as { matches?: unknown; rows?: unknown })?.matches ?? (parsed as { rows?: unknown })?.rows;
    if (!Array.isArray(list)) {
        throw new ImportFileError("The JSON needs to be a list of matches, or an object with a \"matches\" list.");
    }
    const rows = list.map((item, i) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
            throw new ImportFileError(`Item ${i + 1} in the JSON isn't an object of columns and values.`);
        }
        const values: Record<string, ImportValue> = {};
        for (const [key, value] of Object.entries(item)) {
            if (Array.isArray(value)) {
                values[key] = value.join(", ");
            } else if (typeof value === "object" && value !== null) {
                for (const [inner, v] of Object.entries(value)) {
                    values[`${key} ${inner}`] = typeof v === "object" ? null : (v as ImportValue);
                }
            } else {
                values[key] = value as ImportValue;
            }
        }
        return values;
    });
    return { rows, lines: rows.map((_, i) => i + 1), kind: "json" };
}

/** CSV as spreadsheets save it: quoted fields (with "" for a quote), any line endings, and commas, semicolons or tabs between fields. */
export function parseCsv(text: string): string[][] {
    const body = text.replace(/^﻿/, "");
    const firstLine = body.slice(0, body.search(/\r?\n|$/));
    const delimiter = [",", ";", "\t"].reduce((best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best), ",");
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quoted) {
            if (c === "\"" && body[i + 1] === "\"") {
                field += "\"";
                i++;
            } else if (c === "\"") {
                quoted = false;
            } else {
                field += c;
            }
        } else if (c === "\"" && field === "") {
            quoted = true;
        } else if (c === delimiter) {
            row.push(field);
            field = "";
        } else if (c === "\n" || c === "\r") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            if (c === "\r" && body[i + 1] === "\n") {
                i++;
            }
        } else {
            field += c;
        }
    }
    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
