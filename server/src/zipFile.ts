import { type FileHandle, open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

// Reading a zip file one entry at a time from disk, so restoring an export (DATA-4) never holds
// the whole thing in memory; and the same for one already in memory, to see what an uploaded
// spreadsheet or Word document holds (FILE-9). Stored and deflated entries; not ZIP64 (fflate,
// which writes the exports, doesn't make it either).

export interface ZipEntry {
    name: string;
    method: number;
    compressedSize: number;
    size: number;
    localOffset: number;
}

export interface ZipReader {
    entries: Map<string, ZipEntry>;
    read(name: string): Promise<Uint8Array | undefined>;
    close(): Promise<void>;
}

/** Where a zip's bytes are read from: a file on disk, or memory. */
interface Source {
    size: number;
    readAt(position: number, length: number): Promise<Buffer>;
    close(): Promise<void>;
}

async function fileSource(path: string): Promise<Source> {
    const file: FileHandle = await open(path, "r");
    try {
        const { size } = await file.stat();
        return {
            size,
            async readAt(position, length) {
                const buffer = Buffer.alloc(length);
                const { bytesRead } = await file.read(buffer, 0, length, position);
                return buffer.subarray(0, bytesRead);
            },
            close: () => file.close(),
        };
    } catch (e) {
        await file.close();
        throw e;
    }
}

function bytesSource(bytes: Uint8Array): Source {
    const all = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
        size: all.length,
        readAt: async (position, length) => all.subarray(Math.max(0, position), Math.max(0, position) + length),
        close: async () => {},
    };
}

/** Opens a zip file (a path on disk, or its bytes), or throws when it isn't one. */
export async function openZip(from: string | Uint8Array, maxEntryBytes = 64 * 1024 * 1024): Promise<ZipReader> {
    const file = typeof from === "string" ? await fileSource(from) : bytesSource(from);
    try {
        const { size } = file;
        // The end-of-central-directory record is in the last 22 bytes, or before a comment of up to 64 KB.
        const tailLength = Math.min(size, 22 + 65_535);
        const tail = await file.readAt(size - tailLength, tailLength);
        let end = -1;
        for (let i = tail.length - 22; i >= 0; i--) {
            if (tail.readUInt32LE(i) === 0x06054b50) {
                end = i;
                break;
            }
        }
        if (end < 0) {
            throw new Error("not a zip file");
        }
        const count = tail.readUInt16LE(end + 10);
        const dirSize = tail.readUInt32LE(end + 12);
        const dirOffset = tail.readUInt32LE(end + 16);
        // SEC-3: the file says how much to read, so it's checked against the file before any memory is set aside.
        if (dirOffset + dirSize > size) {
            throw new Error("the zip's directory is damaged");
        }
        const dir = await file.readAt(dirOffset, dirSize);
        const entries = new Map<string, ZipEntry>();
        for (let at = 0, i = 0; i < count; i++) {
            if (dir.readUInt32LE(at) !== 0x02014b50) {
                throw new Error("the zip's directory is damaged");
            }
            const nameLength = dir.readUInt16LE(at + 28);
            const entry = {
                method: dir.readUInt16LE(at + 10),
                compressedSize: dir.readUInt32LE(at + 20),
                size: dir.readUInt32LE(at + 24),
                localOffset: dir.readUInt32LE(at + 42),
                name: dir.toString("utf8", at + 46, at + 46 + nameLength),
            };
            // SEC-3: what the directory says each entry takes is checked against the file too.
            if (entry.localOffset + 30 + entry.compressedSize > size) {
                throw new Error("the zip's directory is damaged");
            }
            entries.set(entry.name, entry);
            at += 46 + nameLength + dir.readUInt16LE(at + 30) + dir.readUInt16LE(at + 32);
        }
        return {
            entries,
            async read(name) {
                const entry = entries.get(name);
                if (!entry) {
                    return undefined;
                }
                if (entry.size > maxEntryBytes || entry.compressedSize > maxEntryBytes) {
                    throw new Error(`${name} is too big`);
                }
                const local = await file.readAt(entry.localOffset, 30);
                if (local.readUInt32LE(0) !== 0x04034b50) {
                    throw new Error(`${name} is damaged`);
                }
                const start = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
                const data = await file.readAt(start, entry.compressedSize);
                if (entry.method === 0) {
                    return new Uint8Array(data);
                }
                if (entry.method === 8) {
                    return new Uint8Array(inflateRawSync(data, { maxOutputLength: maxEntryBytes }));
                }
                throw new Error(`${name} is compressed in a way that isn't supported`);
            },
            close: () => file.close(),
        };
    } catch (e) {
        await file.close();
        throw e;
    }
}
