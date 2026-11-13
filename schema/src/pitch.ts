import type { Match, Venue } from "./records.ts";
import type { MatchRecord } from "./matchRecord.ts";
import { type GpsSeries, type MatchTrack, type PitchOutline, playWindows, trackPath } from "./track.ts";

// The pitch a track was played on, and heatmaps on a drawing of it (TRK-9). Shared by the server
// (the track's pitch, and Stats' heatmap across matches) and the web app (the match page's
// heatmap and adjusting the pitch by hand), so they always agree.
//
// A pitch is held as PitchOutline: the two corners of one touchline and the centre spot. In
// metres around the centre spot it has a length axis u (along the touchline) and a width axis v,
// v being u turned a quarter left, so drawing x along u and y along v (up) is the ground seen
// from above, never mirrored. A referee's diagonal then shows as they ran it.

type Pos = { lat: number; lon: number };

const metresPerDegree = 111_195;
const radians = Math.PI / 180;

/** A pitch in metres: its centre spot, length axis u, width axis v (u turned left), and size. */
export interface PitchFrame {
    centre: Pos;
    /** Metres east per degree of longitude at the centre. */
    eastScale: number;
    u: [number, number];
    v: [number, number];
    lengthM: number;
    widthM: number;
}

function toMetres(centre: Pos, eastScale: number, p: Pos): [number, number] {
    return [(p.lon - centre.lon) * eastScale, (p.lat - centre.lat) * metresPerDegree];
}

export function pitchFrame(pitch: PitchOutline): PitchFrame {
    const { centre } = pitch;
    const eastScale = metresPerDegree * Math.cos(centre.lat * radians);
    const [a, b] = pitch.corners.map((c) => toMetres(centre, eastScale, c));
    const lengthM = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u: [number, number] = lengthM > 0 ? [(b[0] - a[0]) / lengthM, (b[1] - a[1]) / lengthM] : [1, 0];
    const v: [number, number] = [-u[1], u[0]];
    // The touchline is half the width from the centre spot.
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const widthM = 2 * Math.abs(mid[0] * v[0] + mid[1] * v[1]);
    return { centre, eastScale, u, v, lengthM, widthM };
}

/** A position on the pitch: metres from the centre spot along its length and width. */
export function toPitch(frame: PitchFrame, lat: number, lon: number): [number, number] {
    const [e, n] = toMetres(frame.centre, frame.eastScale, { lat, lon });
    return [e * frame.u[0] + n * frame.u[1], e * frame.v[0] + n * frame.v[1]];
}

/** The position of a point on the pitch, metres from the centre spot along its length and width. */
export function fromPitch(frame: PitchFrame, x: number, y: number): Pos {
    const e = x * frame.u[0] + y * frame.v[0];
    const n = x * frame.u[1] + y * frame.v[1];
    return { lat: frame.centre.lat + n / metresPerDegree, lon: frame.centre.lon + e / frame.eastScale };
}

/** A pitch from its centre spot, the bearing of its length (degrees from north) and its size. */
export function pitchOf(centre: Pos, bearingDeg: number, lengthM: number, widthM: number, by: PitchOutline["by"]): PitchOutline {
    const eastScale = metresPerDegree * Math.cos(centre.lat * radians);
    const u: [number, number] = [Math.sin(bearingDeg * radians), Math.cos(bearingDeg * radians)];
    const v: [number, number] = [-u[1], u[0]];
    const at = (x: number, y: number): Pos => ({
        lat: centre.lat + (x * u[1] + y * v[1]) / metresPerDegree,
        lon: centre.lon + (x * u[0] + y * v[0]) / eastScale,
    });
    const round = (p: Pos) => ({ lat: Math.round(p.lat * 1e7) / 1e7, lon: Math.round(p.lon * 1e7) / 1e7 });
    return { corners: [round(at(-lengthM / 2, -widthM / 2)), round(at(lengthM / 2, -widthM / 2))], centre: round(centre), by };
}

/** The bearing of a pitch's length, in degrees from north (0 to 360). */
export function pitchBearing(frame: PitchFrame): number {
    return ((Math.atan2(frame.u[0], frame.u[1]) / radians) % 360 + 360) % 360;
}

/**
 * The periods' stretches of a track, in milliseconds after its start, leaving out time play was suspended
 * (TMR-13), so a period can have several; the whole track without period times.
 */
export function periodWindowsOf(track: MatchTrack, periods: MatchRecord["periods"] = []): { period: number; from: number; to: number }[] {
    return playWindows(track, periods);
}

function percentile(sorted: number[], share: number): number {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(share * (sorted.length - 1))))];
}

/** Fewer positions than this in the periods and the pitch isn't guessed. */
const minPositions = 120;

/**
 * How far a referee's diagonal runs from the pitch's length. On the standard (left-wing)
 * diagonal, heading for either goal the referee is on the left of the pitch, away from the
 * assistant covering that half: from above, the diagonal runs bottom left to top right, the
 * length turned anticlockwise by about this (the assistants at bottom right and top left).
 */
const diagonalDeg = 27;

/** What a track can't tell by itself: the user's role in the match, and where the venue's pitch is pinned. */
export interface PitchContext {
    role?: Match["role"];
    /** The match's pitch at its venue, when it has a position (a pin on the venue map). */
    pin?: Pos;
    /** Corners walked on the watch that apply to the match (TRK-13, markedCorners). */
    corners?: Pos[];
}

/** Where the referee went in the periods, in metres around the middle of it, and where they stood at each kickoff. */
function cloudOf(track: MatchTrack, periods: MatchRecord["periods"]) {
    const gps = track.gps;
    if (!gps) {
        return undefined;
    }
    const windows = periodWindowsOf(track, periods);
    const { steps } = trackPath(gps);
    const inside = (t: number) => windows.some((w) => t >= w.from && t <= w.to);
    const points = gps.t.flatMap((t, i) => (steps[i] && inside(t) ? [{ lat: gps.lat[i], lon: gps.lon[i] }] : []));
    if (points.length < minPositions) {
        return undefined;
    }
    const lats = points.map((p) => p.lat).sort((a, b) => a - b);
    const lons = points.map((p) => p.lon).sort((a, b) => a - b);
    const origin = { lat: percentile(lats, 0.5), lon: percentile(lons, 0.5) };
    const eastScale = metresPerDegree * Math.cos(origin.lat * radians);
    const start = Date.parse(track.start);
    const kickoffs = periods.filter((p) => p.startedAt).flatMap((p) => {
        const from = Date.parse(p.startedAt as string) - start;
        const i = gps.t.findIndex((t) => t >= from);
        return i >= 0 && gps.t[i] - from <= 20_000 ? [toMetres(origin, eastScale, { lat: gps.lat[i], lon: gps.lon[i] })] : [];
    });
    return { origin, eastScale, xy: points.map((p) => toMetres(origin, eastScale, p)), kickoffs };
}

type Cloud = NonNullable<ReturnType<typeof cloudOf>>;

/** The axes at a bearing: u along it, v turned a quarter left. */
function axes(deg: number) {
    const u = [Math.sin(deg * radians), Math.cos(deg * radians)];
    return { u, v: [-u[1], u[0]] };
}

/** Each point along and across a bearing, sorted. */
function extent(xy: [number, number][], deg: number) {
    const { u, v } = axes(deg);
    const along = xy.map(([e, n]) => e * u[0] + n * u[1]).sort((a, b) => a - b);
    const across = xy.map(([e, n]) => e * v[0] + n * v[1]).sort((a, b) => a - b);
    return { deg, along, across, area: (percentile(along, 0.95) - percentile(along, 0.05)) * (percentile(across, 0.95) - percentile(across, 0.05)) };
}

/** The bearing of the long side of the narrowest box (5th to 95th percentile each way) that holds the cloud. */
function longAxis(xy: [number, number][]): number {
    let best = extent(xy, 0);
    for (let deg = 3; deg < 180; deg += 3) {
        const e = extent(xy, deg);
        if (e.area < best.area) {
            best = e;
        }
    }
    for (let deg = best.deg - 2.5; deg <= best.deg + 2.5; deg += 0.5) {
        const e = extent(xy, deg);
        if (e.area < best.area) {
            best = e;
        }
    }
    const longer = percentile(best.across, 0.95) - percentile(best.across, 0.05) > percentile(best.along, 0.95) - percentile(best.along, 0.05);
    return (best.deg + (longer ? 90 : 0) + 360) % 360;
}

/** A point given along and across a bearing from the cloud's origin, as a position. */
function positionAt(cloud: Cloud, deg: number, along: number, across: number): Pos {
    const { u, v } = axes(deg);
    return {
        lat: cloud.origin.lat + (along * u[1] + across * v[1]) / metresPerDegree,
        lon: cloud.origin.lon + (along * u[0] + across * v[0]) / cloud.eastScale,
    };
}

/**
 * Where the pitch probably is, from where the user went in the periods, by their role
 * (TRK-9). Marked "auto": it can be put right on the match page.
 * - Referee (or no role): the track is a band along the referee's diagonal, so the narrowest box
 *   that holds most of it lies along the diagonal; the pitch's length is that turned back by
 *   diagonalDeg (a referee who ran the other diagonal gets a pitch about twice that far out). It's
 *   centred on where they stood at the kickoffs (the centre circle) when the track has them, else
 *   on the track, and sized from how far they went, as a referee covers about 70% of the length.
 * - Assistant: the track is a strip along one touchline over one half, so the strip's long side is
 *   the touchline, the end where they stood at the kickoffs is the halfway line (else the end
 *   nearer the venue's pin), and the pitch is on the standard diagonal's side: on the assistant's
 *   left as they face the goal line of their half. A reverse diagonal is moved by hand.
 * - Fourth official: they stay by the technical area, which says nothing about the pitch: none.
 */
export function findPitch(track: MatchTrack, periods: MatchRecord["periods"] = [], context: PitchContext = {}): PitchOutline | undefined {
    if (context.role === "fourth") {
        return undefined;
    }
    const cloud = cloudOf(track, periods);
    if (!cloud) {
        return undefined;
    }
    return context.role === "ar1" || context.role === "ar2" ? assistantPitch(cloud, context.pin) : refereePitch(cloud);
}

function refereePitch(cloud: Cloud): PitchOutline {
    const deg = (longAxis(cloud.xy) + diagonalDeg + 360) % 360;
    const { along, across } = extent(cloud.xy, deg);
    const spanAlong = percentile(along, 0.98) - percentile(along, 0.02);
    const spanAcross = percentile(across, 0.98) - percentile(across, 0.02);
    const lengthM = Math.min(120, Math.max(40, spanAlong * 1.4));
    const widthM = Math.min(90, Math.max(25, lengthM * 0.66, spanAcross * 1.2));

    // The centre: the middle of the box, or where the kickoffs were when they're within it.
    const { u, v } = axes(deg);
    let cx = (percentile(along, 0.02) + percentile(along, 0.98)) / 2;
    let cy = (percentile(across, 0.02) + percentile(across, 0.98)) / 2;
    const { kickoffs } = cloud;
    if (kickoffs.length) {
        const kx = kickoffs.reduce((s, [e, n]) => s + e * u[0] + n * u[1], 0) / kickoffs.length;
        const ky = kickoffs.reduce((s, [e, n]) => s + e * v[0] + n * v[1], 0) / kickoffs.length;
        if (Math.abs(kx - cx) < lengthM / 4 && Math.abs(ky - cy) < widthM / 4) {
            [cx, cy] = [kx, ky];
        }
    }
    return pitchOf(positionAt(cloud, deg, cx, cy), deg, Math.round(lengthM), Math.round(widthM), "auto");
}

function assistantPitch(cloud: Cloud, pin: Pos | undefined): PitchOutline {
    const deg = longAxis(cloud.xy);
    const { along, across } = extent(cloud.xy, deg);
    const { u } = axes(deg);
    // The strip runs from the halfway line to the goal line: half the length, and a little more for
    // the stretch an assistant rarely reaches.
    const [from, to] = [percentile(along, 0.02), percentile(along, 0.98)];
    const lengthM = Math.min(120, Math.max(40, (to - from) * 2.1));
    const widthM = Math.min(90, Math.max(25, lengthM * 0.66));
    const touchline = percentile(across, 0.5);
    const pinAt = pin && toMetres(cloud.origin, cloud.eastScale, pin);
    const pinAlong = pinAt && pinAt[0] * u[0] + pinAt[1] * u[1];
    // The halfway line: where they stood at the kickoffs, else the end nearer the pin.
    const { kickoffs } = cloud;
    const kickoffAlong = kickoffs.length ? kickoffs.reduce((s, [e, n]) => s + e * u[0] + n * u[1], 0) / kickoffs.length : pinAlong;
    const halfway = kickoffAlong === undefined || Math.abs(kickoffAlong - to) < Math.abs(kickoffAlong - from) ? to : from;
    // TRK-9: the pitch lies on the standard diagonal's side (the owner, 2026-11-09): facing the goal
    // line of their half, an assistant has the pitch on their left, as they run the right-hand
    // touchline. A reverse diagonal is rare and is moved by hand.
    // Across (v) is along (u) turned to the left, so the pitch is on +v when they face +u.
    const side = halfway === to ? -1 : 1;
    return pitchOf(positionAt(cloud, deg, halfway, touchline + (side * widthM) / 2), deg, Math.round(lengthM), Math.round(widthM), "auto");
}

/** The track's pitch: the one it has (marked by the user, or from RefSix), else one found from it. */
export function trackPitch(track: MatchTrack, periods: MatchRecord["periods"] = [], context: PitchContext = {}): PitchOutline | undefined {
    if (track.pitch) {
        return track.pitch;
    }
    const found = findPitch(track, periods, context);
    return (context.corners && pitchFromCorners(context.corners, found)) || found;
}

/**
 * TRK-13: the corners walked on the watch that apply to a match: those marked for it, else its
 * pitch's latest marking from before it kicked off (fields move between seasons, so a marking
 * never applies to earlier matches).
 */
export function markedCorners(match: Pick<Match, "kickoff" | "pitchId" | "pitchMarking">, venue?: Pick<Venue, "pitches">): Pos[] | undefined {
    if (match.pitchMarking) {
        return match.pitchMarking.corners;
    }
    const kickoff = match.kickoff ? Date.parse(match.kickoff) : NaN;
    const markings = venue?.pitches.find((p) => p.id === match.pitchId)?.markings ?? [];
    return markings.filter((m) => Date.parse(m.at) <= kickoff).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1)?.corners;
}

/**
 * TRK-13: a pitch from two to four of its corners, the more the better. Four: the rectangle
 * that fits them (their middle, the direction of the long sides, the average length and width).
 * Three: the corner nearest a right angle sits between the other two, and the fourth completes
 * the rectangle. Two: one side, its direction and length; which side and the other measurement
 * come from `found` (the pitch found from the track), without which there's none.
 */
export function pitchFromCorners(corners: Pos[], found?: PitchOutline): PitchOutline | undefined {
    if (corners.length < 2) {
        return undefined;
    }
    const mid = { lat: corners.reduce((s, c) => s + c.lat, 0) / corners.length, lon: corners.reduce((s, c) => s + c.lon, 0) / corners.length };
    const eastScale = metresPerDegree * Math.cos(mid.lat * radians);
    const toPos = ([x, y]: [number, number]): Pos => ({ lat: mid.lat + y / metresPerDegree, lon: mid.lon + x / eastScale });
    const bearingOf = ([x, y]: [number, number]) => Math.atan2(x, y) / radians;
    let pts = corners.map((c) => toMetres(mid, eastScale, c));

    if (pts.length === 2) {
        if (!found) {
            return undefined;
        }
        const frame = pitchFrame(found);
        const [p, q] = pts;
        const sideM = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (sideM < 5) {
            return undefined;
        }
        const dir: [number, number] = [(q[0] - p[0]) / sideM, (q[1] - p[1]) / sideM];
        const normal: [number, number] = [-dir[1], dir[0]];
        // The pitch lies on the side of this edge the found pitch's centre is on.
        const c = toMetres(mid, eastScale, found.centre);
        const side = c[0] * normal[0] + c[1] * normal[1] < 0 ? -1 : 1;
        const touchline = Math.abs(dir[0] * frame.u[0] + dir[1] * frame.u[1]) >= Math.abs(dir[0] * frame.v[0] + dir[1] * frame.v[1]);
        const lengthM = touchline ? sideM : frame.lengthM;
        const widthM = touchline ? frame.widthM : sideM;
        const half = (touchline ? widthM : lengthM) / 2;
        const centre = toPos([normal[0] * side * half, normal[1] * side * half]);
        return pitchOf(centre, bearingOf(touchline ? dir : normal), lengthM, widthM, "corners");
    }

    if (pts.length === 3) {
        let corner = 0;
        let best = Infinity;
        for (let i = 0; i < 3; i++) {
            const a = pts[(i + 1) % 3];
            const b = pts[(i + 2) % 3];
            const u = [a[0] - pts[i][0], a[1] - pts[i][1]];
            const v = [b[0] - pts[i][0], b[1] - pts[i][1]];
            const cos = Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1);
            if (cos < best) {
                best = cos;
                corner = i;
            }
        }
        const [b, a, c] = [pts[corner], pts[(corner + 1) % 3], pts[(corner + 2) % 3]];
        pts = [a, b, c, [a[0] + c[0] - b[0], a[1] + c[1] - b[1]]];
    }

    // Four: in order round their middle, then the long sides and the short ones.
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
    const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
    const sides = pts.map((p, i) => {
        const q = pts[(i + 1) % 4];
        return [q[0] - p[0], q[1] - p[1]] as [number, number];
    });
    const lengths = sides.map(([x, y]) => Math.hypot(x, y));
    const long = lengths[0] + lengths[2] >= lengths[1] + lengths[3] ? 0 : 1;
    // Opposite sides run opposite ways round the loop, so their difference is twice the direction.
    const along: [number, number] = [sides[long][0] - sides[long + 2][0], sides[long][1] - sides[long + 2][1]];
    const lengthM = (lengths[long] + lengths[long + 2]) / 2;
    const widthM = (lengths[1 - long] + lengths[3 - long]) / 2;
    if (lengthM < 5 || widthM < 5) {
        return undefined;
    }
    return pitchOf(toPos([cx, cy]), bearingOf(along), lengthM, widthM, "corners");
}

/**
 * Whether to draw the pitch turned half round (TRK-9). For a referee, with the kickoff direction
 * known (PRE-8), the first period's kickoff team attacks left to right; without it the pitch is
 * drawn as it lies, as a diagonal looks the same either way round. For an assistant, their
 * touchline goes at the bottom, which on the standard diagonal puts their half on the right.
 */
export function pitchTurned(pitch: PitchOutline, track: MatchTrack, periods: MatchRecord["periods"], role: Match["role"], kickoffDirection: MatchRecord["kickoffDirection"]): boolean {
    const frame = pitchFrame(pitch);
    if (role === "ar1" || role === "ar2") {
        const cloud = track.gps ? periodPositions(track, periods) : [];
        const y = cloud.reduce((s, [lat, lon]) => s + toPitch(frame, lat, lon)[1], 0);
        return y > 0;
    }
    if (!kickoffDirection) {
        return false;
    }
    const b = kickoffDirection.bearingDeg * radians;
    return Math.sin(b) * frame.u[0] + Math.cos(b) * frame.u[1] < 0;
}

/** The track's positions in the periods. */
function periodPositions(track: MatchTrack, periods: MatchRecord["periods"]): [number, number][] {
    const gps = track.gps!;
    const windows = periodWindowsOf(track, periods);
    return gps.t.flatMap((t, i) => (windows.some((w) => t >= w.from && t <= w.to) ? [[gps.lat[i], gps.lon[i]] as [number, number]] : []));
}

/**
 * Heatmap cells: lengthways cols, widthways rows, over the pitch and a margin beyond it (shares of
 * the length and width). The margin beyond the touchlines is wider, as assistants run just outside them.
 */
export const heatGrid = { cols: 24, rows: 18, marginLength: 0.05, marginWidth: 0.12 };

export interface PitchHeat {
    cols: number;
    rows: number;
    /** Seconds in each cell, row by row from the top of the drawing (the far touchline), left to right. */
    total: number[];
    periods: { period: number; cells: number[] }[];
}

/**
 * Where the referee spent the periods, as seconds in each cell of a grid over the pitch drawing,
 * turned as pitchTurned says. Cells are shares of the pitch, so pitches of any size add up (Stats).
 * Each counted step's time goes to the cell it ends in; positions well off the pitch are left out.
 */
export function pitchHeat(track: MatchTrack, periods: MatchRecord["periods"], pitch: PitchOutline, turned: boolean): PitchHeat | undefined {
    const gps: GpsSeries | undefined = track.gps;
    if (!gps) {
        return undefined;
    }
    const { cols, rows, marginLength, marginWidth } = heatGrid;
    const frame = pitchFrame(pitch);
    const windows = periodWindowsOf(track, periods);
    const { steps, positions } = trackPath(gps);
    const total = new Array<number>(cols * rows).fill(0);
    // One grid a period, however many stretches it was played in (TMR-13).
    const grids = new Map<number, number[]>();
    const byPeriod = windows.map((w) => {
        const cells = grids.get(w.period) ?? new Array<number>(cols * rows).fill(0);
        grids.set(w.period, cells);
        return { period: w.period, cells };
    });
    for (const [i, step] of steps.entries()) {
        const w = step ? windows.findIndex((win) => gps.t[i - 1] >= win.from && gps.t[i] <= win.to) : -1;
        if (!step || w < 0) {
            continue;
        }
        let [x, y] = toPitch(frame, positions[i][0], positions[i][1]);
        if (turned) {
            [x, y] = [-x, -y];
        }
        // 0 to 1 across the drawing (with its margin), y from the top.
        const fx = (x / frame.lengthM + 0.5 + marginLength) / (1 + 2 * marginLength);
        const fy = (0.5 - y / frame.widthM + marginWidth) / (1 + 2 * marginWidth);
        if (fx < -0.05 || fx > 1.05 || fy < -0.05 || fy > 1.05) {
            continue;
        }
        const col = Math.min(cols - 1, Math.max(0, Math.floor(fx * cols)));
        const row = Math.min(rows - 1, Math.max(0, Math.floor(fy * rows)));
        total[row * cols + col] += step.sec;
        byPeriod[w].cells[row * cols + col] += step.sec;
    }
    const round = (cells: number[]) => cells.map((s) => Math.round(s * 10) / 10);
    return { cols, rows, total: round(total), periods: windows[0].period ? [...grids].map(([period, cells]) => ({ period, cells: round(cells) })) : [] };
}
