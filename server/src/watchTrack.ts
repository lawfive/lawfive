import { MatchTrack } from "@lawfive/schema";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { type Db, tables } from "./db/index.ts";
import { saveTrack } from "./tracks.ts";

// The track a watch recorded (TRK-7): sent after the match a chunk at a time (POST
// /v1/watch/tracks), each chunk text packed as watch-garmin/source/TrackLog.mc describes. Once
// every chunk and the match report are in, the chunks become its track and are deleted.

type Gps = { t: number[]; lat: number[]; lon: number[]; speed: (number | undefined)[] };

/** Chunks that never completed are dropped after this long. */
const staleMs = 30 * 86_400_000;

/**
 * One chunk's samples, appended to the series. Throws on text that isn't samples. Samples that
 * can't go in a track (times out of order, positions or heart rates out of range) are skipped.
 */
function decodeChunk(text: string, gps: Gps, bpm: { t: number[]; bpm: number[] }) {
    let tenths = 0;
    let lat: number | undefined;
    let lon: number | undefined;
    for (const sample of text.split(";")) {
        if (!sample) {
            continue;
        }
        const fields = sample.split(",");
        if (fields.length > 5 || fields.some((f) => f !== "" && !/^-?\d+$/.test(f))) {
            throw new Error(`not a sample: "${sample.slice(0, 40)}"`);
        }
        const [dt, dlat, dlon, cmps, hr] = fields.map((f) => (f === "" || f === undefined ? undefined : Number(f)));
        tenths += dt ?? 10;
        const t = tenths * 100;
        if (dlat !== undefined && dlon !== undefined) {
            lat = lat === undefined ? dlat : lat + dlat;
            lon = lon === undefined ? dlon : lon + dlon;
            const [y, x] = [lat / 1e6, lon / 1e6];
            const fresh = gps.t.length === 0 || t > gps.t[gps.t.length - 1];
            if (fresh && Math.abs(y) <= 90 && Math.abs(x) <= 180 && !(y === 0 && x === 0)) {
                gps.t.push(t);
                gps.lat.push(y);
                gps.lon.push(x);
                gps.speed.push(cmps !== undefined && cmps >= 0 ? cmps / 100 : undefined);
            }
        }
        if (hr !== undefined && hr >= 20 && hr <= 250 && (bpm.t.length === 0 || t > bpm.t[bpm.t.length - 1])) {
            bpm.t.push(t);
            bpm.bpm.push(hr);
        }
    }
}

/** Checks a chunk's text reads as samples; the reason when it doesn't. */
export function unreadableChunk(text: string): string | undefined {
    try {
        decodeChunk(text, { t: [], lat: [], lon: [], speed: [] }, { t: [], bpm: [] });
        return undefined;
    } catch (error) {
        return (error as Error).message;
    }
}

const appNames: Record<string, string> = { garmin: "LawFive for Garmin", wearos: "LawFive for Wear OS", applewatch: "LawFive for Apple Watch" };

/** "garmin:venu2"; a chunk kept from before the app's name was added to it has the model alone, from a Garmin. */
function watchDevice(device: string): string {
    return device.includes(":") ? device : `garmin:${device}`;
}

/** A whole track from its chunks, in order. */
export function decodeWatchTrack(chunks: string[], startSec: number, device?: string): MatchTrack {
    const gps: Gps = { t: [], lat: [], lon: [], speed: [] };
    const heartRate = { t: [] as number[], bpm: [] as number[] };
    for (const chunk of chunks) {
        decodeChunk(chunk, gps, heartRate);
    }
    // The watch's own speed where it gave one (TRK-3); the others come from the positions.
    const speeds = gps.speed.some((v) => v !== undefined) ? { speedMps: gps.speed.map((v) => v ?? null) } : {};
    return {
        source: { kind: "lawfive", ...(device ? { device: watchDevice(device) } : {}), app: appNames[watchDevice(device ?? "garmin").split(":")[0]] ?? "LawFive for Garmin" },
        start: new Date(startSec * 1000).toISOString(),
        ...(gps.t.length ? { gps: { t: gps.t, lat: gps.lat, lon: gps.lon, ...speeds } } : {}),
        ...(heartRate.t.length ? { heartRate } : {}),
    } as MatchTrack;
}

/**
 * Turns a watch's chunks into the match report's track once they're all in and the match report
 * is there. A match report that already has a track (from a file, say) keeps it.
 */
export async function assembleWatchTrack(db: Db, userId: string, created: number, recordId: string): Promise<{ received: number; count: number; track: "waiting" | "saved" | "kept" | "dropped" }> {
    const { watchTrackChunk: chunks, matchTrack, records } = tables;
    const mine = and(eq(chunks.userId, userId), eq(chunks.created, created));
    await db.delete(chunks).where(and(eq(chunks.userId, userId), lt(chunks.receivedAt, new Date(Date.now() - staleMs))));
    const rows = await db.select().from(chunks).where(mine).orderBy(asc(chunks.index));
    const count = rows.length ? rows[rows.length - 1].count : 0;
    const complete = rows.length > 0 && rows.length === count && rows.every((r, i) => r.index === i && r.count === count);
    if (!complete) {
        return { received: rows.length, count, track: "waiting" };
    }
    const [record] = await db.select({ id: records.id }).from(records)
        .where(and(eq(records.userId, userId), eq(records.id, recordId), eq(records.type, "matchRecord"), isNull(records.deletedAt)));
    if (!record) {
        return { received: rows.length, count, track: "waiting" };
    }
    const [existing] = await db.select({ source: matchTrack.source }).from(matchTrack)
        .where(and(eq(matchTrack.userId, userId), eq(matchTrack.matchRecordId, recordId)));
    let track: "saved" | "kept" | "dropped" = "kept";
    if (!existing) {
        const parsed = MatchTrack.safeParse(decodeWatchTrack(rows.map((r) => r.data), rows[0].start, rows[0].device ?? undefined));
        track = parsed.success ? "saved" : "dropped";
        if (parsed.success) {
            await saveTrack(db, userId, recordId, parsed.data);
        }
    }
    await db.delete(chunks).where(mine);
    return { received: rows.length, count, track };
}
