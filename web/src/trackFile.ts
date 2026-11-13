import { MatchTrack } from "@lawfive/schema";
import type { MatchFormat, MatchRecord } from "./api.ts";

// Reading an activity file for a match's track (TRK-8), in the browser: FIT (as Garmin Connect's
// Export Original gives it, zipped or not), GPX or TCX, converted into LawFive's track format
// before upload (TRK-2). Also where the recording was paused, since the LawFive watch app pauses
// at half-time (ACT-2): a match without a match report gets its periods from those stretches.

export type TrackFileKind = "fit" | "gpx" | "tcx";

export interface TrackFile {
    kind: TrackFileKind;
    track: MatchTrack;
    /** When the recording ran, split where it was paused (or stopped logging for a minute or more). */
    stretches: { from: number; to: number }[];
    /** What recorded it, for people: Venu 2. */
    deviceName?: string;
}

/** One moment as a file records it, before conversion. */
interface Sample {
    at: number;
    lat?: number;
    lon?: number;
    bpm?: number;
    /** The speed the watch measured (m/s), which the figures prefer to positions (TRK-3). */
    speed?: number;
}

const maxBytes = 25 * 1024 * 1024;
/** No samples for this long is a pause, in files that don't say when they were paused. */
const pauseMs = 60_000;

export const acceptedTrackTypes = [".fit", ".gpx", ".tcx", ".zip", "application/gpx+xml", "application/vnd.garmin.tcx+xml", "application/zip"];

export async function readTrackFile(file: File): Promise<TrackFile> {
    if (file.size > maxBytes) {
        throw new Error("That file is over 25 MB, too big for one match.");
    }
    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    if (isZip(bytes)) {
        bytes = await unzipActivity(bytes);
    }
    if (isFit(bytes)) {
        return fromFit(bytes);
    }
    const text = new TextDecoder().decode(bytes.subarray(0, 4096));
    if (/<gpx[\s>]/.test(text)) {
        return fromGpx(new TextDecoder().decode(bytes));
    }
    if (/<TrainingCenterDatabase[\s>]/.test(text)) {
        return fromTcx(new TextDecoder().decode(bytes));
    }
    throw new Error("That isn't a FIT, GPX or TCX file. In Garmin Connect, open the activity and use Export Original (FIT), Export to GPX or Export to TCX.");
}

const isFit = (bytes: Uint8Array) => bytes.length > 12 && String.fromCharCode(...bytes.subarray(8, 12)) === ".FIT";
const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** The activity file inside a zip (Garmin Connect's Export Original), from its central directory. */
async function unzipActivity(zip: Uint8Array): Promise<Uint8Array> {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let end = zip.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) {
        end--;
    }
    if (end < 0) {
        throw new Error("That zip file couldn't be read.");
    }
    let at = view.getUint32(end + 16, true);
    for (let n = view.getUint16(end + 10, true); n > 0; n--) {
        const method = view.getUint16(at + 10, true);
        const size = view.getUint32(at + 20, true);
        const nameLength = view.getUint16(at + 28, true);
        const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
        const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)).toLowerCase();
        const local = view.getUint32(at + 42, true);
        at += 46 + skip;
        if (!/\.(fit|gpx|tcx)$/.test(name)) {
            continue;
        }
        const from = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = zip.subarray(from, from + size);
        if (method === 0) {
            return data;
        }
        if (method === 8) {
            const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        throw new Error("That zip file is compressed in a way that can't be read here; unzip it and add the file inside.");
    }
    throw new Error("There's no FIT, GPX or TCX file in that zip.");
}

export async function fromFit(bytes: Uint8Array): Promise<TrackFile> {
    const { default: FitParser, getFitGarminProductDisplayName, getFitGarminProductName } = await import("fit-file-parser");
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    let fit: Awaited<ReturnType<InstanceType<typeof FitParser>["parseAsync"]>>;
    try {
        fit = await new FitParser({ force: true, mode: "list" }).parseAsync(buffer);
    } catch {
        throw new Error("That FIT file couldn't be read.");
    }
    const samples = (fit.records ?? []).flatMap((r): Sample[] => (r.timestamp ? [{
        at: new Date(r.timestamp).getTime(), lat: r.position_lat, lon: r.position_long, bpm: r.heart_rate, speed: r.enhanced_speed ?? r.speed,
    }] : []));
    // The timer's starts and stops say exactly when it was paused.
    const stretches: TrackFile["stretches"] = [];
    let running: number | undefined;
    for (const e of fit.events ?? []) {
        const at = e.timestamp ? new Date(e.timestamp).getTime() : undefined;
        if (e.event !== "timer" || at === undefined) {
            continue;
        }
        if (e.event_type === "start" && running === undefined) {
            running = at;
        } else if (String(e.event_type).startsWith("stop") && running !== undefined) {
            stretches.push({ from: running, to: at });
            running = undefined;
        }
    }
    if (running !== undefined && samples.length) {
        stretches.push({ from: running, to: samples.at(-1)!.at });
    }
    const id = fit.file_ids?.[0];
    const product = id?.manufacturer === "garmin" ? getFitGarminProductName(id.product) : undefined;
    const device = id?.manufacturer ? [id.manufacturer, product ?? id.product_name].filter(Boolean).join(":") : undefined;
    const deviceName = (id?.manufacturer === "garmin" ? getFitGarminProductDisplayName(id.product) : undefined) ?? id?.product_name;
    return { ...convert("fit", samples, device, stretches.length ? stretches : undefined), ...(deviceName ? { deviceName } : {}) };
}

/** A tag's text inside some XML, whatever its namespace prefix. */
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>\\s*([^<]*?)\\s*</`))?.[1];
const number = (text: string | undefined) => (text === undefined || text === "" ? undefined : Number(text));

export function fromGpx(xml: string): TrackFile {
    const samples: Sample[] = [];
    for (const [, attributes, inside] of xml.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)) {
        const at = Date.parse(tag(inside, "time") ?? "");
        if (Number.isFinite(at)) {
            samples.push({
                at,
                lat: number(attributes.match(/\blat\s*=\s*["']([^"']+)/)?.[1]),
                lon: number(attributes.match(/\blon\s*=\s*["']([^"']+)/)?.[1]),
                bpm: number(tag(inside, "hr") ?? tag(inside, "heartrate")),
                speed: number(tag(inside, "speed")),
            });
        }
    }
    return convert("gpx", samples);
}

export function fromTcx(xml: string): TrackFile {
    const samples: Sample[] = [];
    for (const [, inside] of xml.matchAll(/<Trackpoint\b[^>]*>([\s\S]*?)<\/Trackpoint>/g)) {
        const at = Date.parse(tag(inside, "Time") ?? "");
        const heart = inside.match(/<HeartRateBpm\b[^>]*>([\s\S]*?)<\/HeartRateBpm>/)?.[1];
        if (Number.isFinite(at)) {
            samples.push({
                at,
                lat: number(tag(inside, "LatitudeDegrees")),
                lon: number(tag(inside, "LongitudeDegrees")),
                bpm: number(heart && tag(heart, "Value")),
                speed: number(tag(inside, "Speed")),
            });
        }
    }
    const creator = xml.match(/<Creator\b[^>]*>([\s\S]*?)<\/Creator>/)?.[1];
    const deviceName = creator ? tag(creator, "Name") : undefined;
    return { ...convert("tcx", samples, deviceName), ...(deviceName ? { deviceName } : {}) };
}

/** Samples into a track: positions and heart rate as two series, one sample a time (the last, where several share it). */
function convert(kind: TrackFileKind, all: Sample[], device?: string, stretches?: TrackFile["stretches"]): TrackFile {
    const samples = all.filter((s) => Number.isFinite(s.at)).sort((a, b) => a.at - b.at);
    const gps = series(samples.filter((s) => isPosition(s.lat, s.lon)), (s) => [s.lat!, s.lon!, s.speed] as const);
    // The watch's speed where it gave one; the figures work out the rest from positions (TRK-3).
    const measured = (v: number | undefined) => v !== undefined && Number.isFinite(v) && v >= 0;
    const hasSpeed = gps.values.some(([, , v]) => measured(v));
    const heart = series(samples.filter((s) => s.bpm !== undefined && s.bpm >= 20 && s.bpm <= 250), (s) => Math.round(s.bpm!));
    if (!gps.t.length && !heart.t.length) {
        throw new Error("That file has no positions or heart rate in it.");
    }
    const start = Math.min(gps.t[0] ?? Infinity, heart.t[0] ?? Infinity);
    const longest = Math.max(gps.t.length, heart.t.length);
    if (longest > 43_200) {
        throw new Error("That recording is longer than a match can hold (12 hours at a sample a second).");
    }
    const track: MatchTrack = {
        source: { kind, ...(device ? { device: device.slice(0, 60) } : {}) },
        start: new Date(start).toISOString(),
        ...(gps.t.length ? { gps: {
            t: gps.t.map((t) => t - start), lat: gps.values.map((v) => v[0]), lon: gps.values.map((v) => v[1]),
            ...(hasSpeed ? { speedMps: gps.values.map(([, , v]) => (measured(v) ? Math.round(v! * 1000) / 1000 : null)) } : {}),
        } } : {}),
        ...(heart.t.length ? { heartRate: { t: heart.t.map((t) => t - start), bpm: heart.values } } : {}),
    };
    const checked = MatchTrack.safeParse(track);
    if (!checked.success) {
        throw new Error(`That file couldn't be turned into a track: ${checked.error.issues[0]?.message ?? "it isn't valid"}.`);
    }
    return { kind, track, stretches: stretches ?? gapStretches(samples.map((s) => s.at)) };
}

const isPosition = (lat?: number, lon?: number) => lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);

function series<T>(samples: Sample[], value: (s: Sample) => T) {
    const t: number[] = [];
    const values: T[] = [];
    for (const s of samples) {
        // Times are whole milliseconds; a second sample at the same time replaces the first.
        const at = Math.round(s.at);
        if (t.at(-1) === at) {
            values[values.length - 1] = value(s);
        } else {
            t.push(at);
            values.push(value(s));
        }
    }
    return { t, values };
}

/** Stretches of a recording, split wherever nothing was logged for a minute or more. */
function gapStretches(times: number[]): TrackFile["stretches"] {
    const stretches: TrackFile["stretches"] = [];
    for (const at of times) {
        const last = stretches.at(-1);
        if (last && at - last.to < pauseMs) {
            last.to = at;
        } else {
            stretches.push({ from: at, to: at });
        }
    }
    return stretches;
}

/**
 * The periods a recording's stretches stand for, for a match without a match report: each stretch
 * of two minutes or more is a period, in order, and those past the format's periods are extra time.
 * None when it was never paused, so the figures cover the whole track (TRK-3).
 */
export function periodsFromStretches(stretches: TrackFile["stretches"], format: MatchFormat): MatchRecord["periods"] {
    const played = stretches.filter((s) => s.to - s.from >= 2 * 60_000);
    if (played.length < 2) {
        return [];
    }
    return played.map((s, i) => ({
        period: i + 1,
        extraTime: i >= format.periods,
        startedAt: new Date(s.from).toISOString(),
        playedSec: Math.round((s.to - s.from) / 1000),
    }));
}

/** When the recording ran: its first and last sample. */
export function recordingSpan(track: MatchTrack): { from: number; to: number } {
    const start = Date.parse(track.start);
    const last = Math.max(track.gps?.t.at(-1) ?? 0, track.heartRate?.t.at(-1) ?? 0);
    return { from: start, to: start + last };
}

/** Whether a kickoff falls in a recording, or up to an hour before it began (a late kickoff, or a late start on the watch). */
export function kickoffInRecording(track: MatchTrack, kickoff: string | undefined): boolean {
    if (!kickoff) {
        return true;
    }
    const { from, to } = recordingSpan(track);
    const at = Date.parse(kickoff);
    return at >= from - 60 * 60_000 && at <= to;
}
