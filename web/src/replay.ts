import { type ClockStop, type SpeedBand, type TrackStep, clockOfElapsed, clockStopsOf, elapsedOfClock, trackPath, trackRules } from "@lawfive/schema";
import type { Match, MatchEvent, MatchRecord, MatchTrack } from "./api.ts";
import { matchMinute, periodName } from "./format.ts";

// The match page's replay (TRK-10): where the referee was at any moment of the match, their heart
// rate and speed, the trail behind them, and the clock, score and events at that moment. Times
// are milliseconds after the track's start, as in the track itself.

/**
 * A stretch of the track the replay plays: a period, or the whole recording without period times. A period
 * suspended part way (TMR-13) has a stretch either side, the later one starting `played` ms into the period.
 */
export interface Span {
    period: number;
    from: number;
    to: number;
    played?: number;
}

/** TMR-13: the stretch of its period an event's time falls in, and so its track time; the first stretch without one that holds it. */
function trackTimeOf(windows: Span[], period: number | undefined, periodSec: number): number | undefined {
    const spans = windows.filter((w) => w.period === period && Number.isFinite(w.from));
    const ms = periodSec * 1000;
    const span = spans.find((w) => ms >= (w.played ?? 0) && ms <= (w.played ?? 0) + (w.to - w.from)) ?? spans[0];
    return span && span.from + ms - (span.played ?? 0);
}

/** The replay's timeline: the spans back to back, so breaks (and anything after full time) are skipped. */
export interface Timeline {
    spans: Span[];
    /** Milliseconds of play in all. */
    length: number;
}

export function timelineOf(track: MatchTrack, windows: Span[]): Timeline {
    const timed = windows.filter((w) => Number.isFinite(w.from));
    let spans = timed;
    if (spans.length === 0) {
        const times = [track.gps?.t ?? [], track.heartRate?.t ?? []].flatMap((t) => (t.length ? [t[0], t[t.length - 1]] : []));
        spans = times.length ? [{ period: 0, from: Math.min(...times), to: Math.max(...times) }] : [];
    }
    return { spans, length: spans.reduce((sum, s) => sum + (s.to - s.from), 0) };
}

/** The track time at a point along the timeline (0 to length). */
export function trackTimeAt(timeline: Timeline, position: number): number {
    let left = Math.max(0, Math.min(position, timeline.length));
    for (const span of timeline.spans) {
        const length = span.to - span.from;
        if (left <= length) {
            return span.from + left;
        }
        left -= length;
    }
    return timeline.spans.at(-1)?.to ?? 0;
}

/** Where a track time falls along the timeline; in a break, the start of the next period. */
export function positionAt(timeline: Timeline, t: number): number {
    let before = 0;
    for (const span of timeline.spans) {
        if (t < span.from) {
            return before;
        }
        if (t <= span.to) {
            return before + (t - span.from);
        }
        before += span.to - span.from;
    }
    return timeline.length;
}

/** The last index whose time is at or before t, or -1. */
function indexAt(times: number[], t: number): number {
    let lo = 0;
    let hi = times.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
            found = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return found;
}

/** The referee at one moment. */
export interface Moment {
    /** Where, gliding between samples; none before the GPS starts or after it ends. */
    position?: [number, number];
    /** No GPS here (a gap or a bad point): the position is the last good one. */
    noGps: boolean;
    speedMps?: number;
    band?: SpeedBand;
    bpm?: number;
}

/** A piece of the trail: points in one speed band, and how long ago (0 now, 1 a minute ago). */
export interface TrailPiece {
    band: SpeedBand;
    age: number;
    points: [number, number][];
}

/** How far back the trail reaches. */
export const trailMs = 60_000;

export interface Replay {
    at(t: number): Moment;
    trail(t: number): TrailPiece[];
}

export function replayOf(track: MatchTrack, sprintKph?: number): Replay {
    const gps = track.gps;
    const path = gps ? trackPath(gps, sprintKph) : undefined;
    const hr = track.heartRate;
    const step = (i: number): TrackStep | undefined => path?.steps[i];

    const at = (t: number): Moment => {
        let bpm: number | undefined;
        if (hr && hr.t.length) {
            // The nearest reading, unless the recording had a gap there.
            const i = indexAt(hr.t, t);
            const near = [i, i + 1].filter((j) => j >= 0 && j < hr.t.length).sort((a, b) => Math.abs(hr.t[a] - t) - Math.abs(hr.t[b] - t))[0];
            if (near !== undefined && Math.abs(hr.t[near] - t) <= trackRules.gapMs) {
                bpm = hr.bpm[near];
            }
        }
        if (!gps || !path || gps.t.length === 0 || t < gps.t[0] || t > gps.t[gps.t.length - 1]) {
            return { noGps: true, bpm };
        }
        const i = indexAt(gps.t, t);
        const next = step(i + 1);
        if (i + 1 >= gps.t.length || !next) {
            // The last point, or a step that doesn't count: wait at the last good position.
            return { position: path.positions[i], noGps: i + 1 < gps.t.length, bpm };
        }
        const f = (t - gps.t[i]) / (gps.t[i + 1] - gps.t[i]);
        const [a, b] = [path.positions[i], path.positions[i + 1]];
        return { position: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], noGps: false, speedMps: next.speedMps, band: next.band, bpm };
    };

    const trail = (t: number): TrailPiece[] => {
        if (!gps || !path) {
            return [];
        }
        const end = indexAt(gps.t, t);
        const pieces: TrailPiece[] = [];
        let piece: TrailPiece | undefined;
        for (let i = Math.max(1, indexAt(gps.t, t - trailMs) + 1); i <= end; i++) {
            const s = step(i);
            if (!s) {
                piece = undefined;
                continue;
            }
            // Ages in sixths, so the trail fades in steps.
            const age = Math.min(5, Math.floor(((t - gps.t[i]) / trailMs) * 6)) / 6;
            if (!piece || piece.band !== s.band || piece.age !== age) {
                piece = { band: s.band, age, points: [path.positions[i - 1]] };
                pieces.push(piece);
            }
            piece.points.push(path.positions[i]);
        }
        // Up to the marker itself.
        const now = at(t);
        if (piece && now.position && !now.noGps) {
            piece.points.push(now.position);
        }
        return pieces;
    };

    return { at, trail };
}

/** What the replay marks and holds on: goals and cards, sin bins among them (EVT-12). */
const replayed = ["goal", "caution", "secondCaution", "sendOff", "sinBin", "secondSinBin"] as const;
type Replayed = (typeof replayed)[number];

/** A goal or card (a sin bin too), and when it happened in track time. */
export interface ReplayEvent {
    event: Extract<MatchEvent, { type: Replayed }>;
    t: number;
}

const isReplayed = (event: MatchEvent): event is ReplayEvent["event"] => (replayed as readonly string[]).includes(event.type);

/**
 * The match report's goals and cards (sin bins too) that happened during play, in track time, in order. On a clock
 * that stops (TMR-15) their times are the clock's, so each goes after the time it stood still before it.
 */
export function eventsOf(record: MatchRecord, windows: Span[], start: number): ReplayEvent[] {
    const out: ReplayEvent[] = [];
    const stops = clockStopsOf(record);
    for (const event of record.events) {
        if (!isReplayed(event)) {
            continue;
        }
        const periodSec = event.periodSec === undefined ? undefined : event.period !== undefined ? elapsedOfClock(stops.get(event.period), event.periodSec) : event.periodSec;
        const inPlay = periodSec !== undefined ? trackTimeOf(windows, event.period, periodSec) : undefined;
        const t = inPlay ?? (event.at ? Date.parse(event.at) - start : undefined);
        if (t !== undefined && event.when === "play") {
            out.push({ event, t });
        }
    }
    return out.sort((a, b) => a.t - b.t);
}

/** The score at a moment, from the goals before it. */
export function scoreAt(events: ReplayEvent[], t: number): { home: number; away: number } {
    const score = { home: 0, away: 0 };
    for (const { event, t: when } of events) {
        if (event.type === "goal" && when <= t) {
            score[event.team]++;
        }
    }
    return score;
}

/**
 * "23' · First half", or nothing outside the periods (or without period times). On a clock that stops (TMR-15),
 * the clock's minute, standing still through its stops (clockStopsOf).
 */
export function clockAt(match: Match, windows: Span[], t: number, stops?: Map<number, ClockStop[]>): string | undefined {
    const span = windows.find((w) => w.period > 0 && t >= w.from && t <= w.to);
    if (!span) {
        return undefined;
    }
    const elapsed = Math.floor((t - span.from + (span.played ?? 0)) / 1000);
    const clock = stops?.size ? clockOfElapsed(stops.get(span.period), elapsed) : elapsed;
    return `${matchMinute(match.format, span.period, clock)} · ${periodName(match.format, span.period)}`;
}
