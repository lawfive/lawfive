import { z } from "zod";
import { Position, Timestamp } from "./common.ts";
import type { MatchRecord } from "./matchRecord.ts";

// Where the referee went and their heart rate during a match (TRK-1 to TRK-3): one format for
// every source (LawFive's watch apps, RefSix, activity files, phone health apps), each converted
// before upload. Not a synced record: it's big, so it's stored beside its match report and read
// on its own (GET /v1/match-records/{id}/track). The figures are worked out here, on the server
// for the API and in the web app for colouring the map, so they're the same everywhere.

/** Up to 12 hours at one sample a second. */
const maxSamples = 43_200;

const times = z.array(z.int().nonnegative()).max(maxSamples).describe("Milliseconds after the track's start, always increasing.");

/** Every array the same length as t, and t always increasing. */
function checkSeries(series: Record<string, unknown[] | undefined> & { t: number[] }, ctx: z.RefinementCtx) {
    for (const [key, values] of Object.entries(series)) {
        if (values && values.length !== series.t.length) {
            ctx.addIssue({ code: "custom", path: [key], message: `has ${values.length} values, but t has ${series.t.length}` });
        }
    }
    const back = series.t.findIndex((t, i) => i > 0 && t <= series.t[i - 1]);
    if (back > 0) {
        ctx.addIssue({ code: "custom", path: ["t", back], message: "times must always increase (drop or merge samples with the same time)" });
    }
}

export const TrackSourceKind = z
    .enum(["lawfive", "refsix", "fit", "gpx", "tcx", "appleHealth", "healthConnect", "strava", "other"])
    .meta({ id: "TrackSourceKind", description: "lawfive: a LawFive watch app; refsix: imported from RefSix; fit, gpx, tcx: an activity file; appleHealth, healthConnect: a phone's health store; strava: from Strava." });

export const TrackSource = z
    .object({
        kind: TrackSourceKind,
        device: z.string().max(60).optional().describe("What recorded it, for example garmin:venu2."),
        app: z.string().max(60).optional().describe("The app that recorded it, with its version: RefSix 1.9.1."),
    })
    .meta({ id: "TrackSource" });

export const GpsSeries = z
    .object({
        t: times,
        lat: z.array(z.number().min(-90).max(90)).max(maxSamples),
        lon: z.array(z.number().min(-180).max(180)).max(maxSamples),
        accuracyM: z.array(z.number().nonnegative()).max(maxSamples).optional().describe("How far off each position may be, in meters, when the source says."),
        speedMps: z.array(z.number().nonnegative().nullable()).max(maxSamples).optional().describe("The speed the watch measured at each position (m/s), when the source records it (TRK-3); null where it didn't, and the speed then comes from the positions."),
    })
    .superRefine(checkSeries)
    .meta({ id: "GpsSeries", description: "Positions in decimal degrees (WGS 84), one per time; leave out samples without a position." });

export const HeartRateSeries = z
    .object({
        t: times,
        bpm: z.array(z.int().min(20).max(250)).max(maxSamples),
    })
    .superRefine(checkSeries)
    .meta({ id: "HeartRateSeries", description: "Heart rate in beats a minute, one per time." });

export const PitchOutline = z
    .object({
        corners: z.tuple([Position, Position]).describe("The corners at the two ends of one touchline."),
        centre: Position.describe("The center spot."),
        by: z.enum(["referee", "corners", "auto"]).describe("Marked by the referee on the map, from corners walked on the watch (TRK-13), or found automatically."),
    })
    .meta({ id: "PitchOutline", description: "Where the pitch is and which way it lies, for heatmaps (TRK-9)." });

export const MatchTrack = z
    .object({
        source: TrackSource,
        start: Timestamp.describe("The time the series' times count from."),
        gps: GpsSeries.optional(),
        heartRate: HeartRateSeries.optional(),
        pitch: PitchOutline.optional(),
    })
    .refine((track) => track.gps || track.heartRate, { message: "a track needs GPS or heart rate" })
    .meta({ id: "MatchTrack", description: "GPS and heart rate for one match report, each on its own times, kept as recorded (up to about one sample a second)." });

export type MatchTrack = z.infer<typeof MatchTrack>;
export type GpsSeries = z.infer<typeof GpsSeries>;
export type HeartRateSeries = z.infer<typeof HeartRateSeries>;
export type PitchOutline = z.infer<typeof PitchOutline>;

// The figures (TRK-3).

export const SpeedBand = z
    .enum(["walking", "jogging", "running", "highSpeed", "sprinting"])
    .meta({ id: "SpeedBand", description: "With the default sprint speed: walking under 7 km/h; jogging 7–13; running 13–18; highSpeed 18–21; sprinting 21 and over. A user's own sprint speed scales them all (TRK-11)." });

export type SpeedBand = z.infer<typeof SpeedBand>;

/** Where sprinting starts unless the user sets their own (TRK-11). */
export const defaultSprintKph = 21;

/** Each band and the speed it starts at, slowest first, with the default sprint speed. */
export const speedBands: { band: SpeedBand; fromKph: number }[] = [
    { band: "walking", fromKph: 0 },
    { band: "jogging", fromKph: 7 },
    { band: "running", fromKph: 13 },
    { band: "highSpeed", fromKph: 18 },
    { band: "sprinting", fromKph: 21 },
];

/** The bands for a sprint speed (TRK-11): each starts at the same share of it as by default (jogging at a third, running at 13/21, high speed at 6/7). */
export function speedBandsFor(sprintKph: number = defaultSprintKph): { band: SpeedBand; fromKph: number }[] {
    return speedBands.map(({ band, fromKph }) => ({ band, fromKph: (fromKph * sprintKph) / defaultSprintKph }));
}

/** The rules for which steps count, and what a sprint is. */
export const trackRules = {
    /**
     * Points further apart than this are a gap (a paused recording), not a step. Garmin's smart
     * recording logs a point every 1 to 10 s, so anything shorter loses real running (TRK-8).
     */
    gapMs: 15_000,
    /** Faster than any referee (36 km/h): a GPS error, or a period left running on the drive home. */
    maxSpeedMps: 10,
    /**
     * Covering more than travelSpeedMps on average over travelWindowMs is travel, not refereeing
     * (120 m in 30 s): a period left running in the car park. No real match in the RefSix
     * tracks came near it; a car did, at 20–30 km/h with stops.
     */
    travelWindowMs: 30_000,
    travelSpeedMps: 4,
    /**
     * This fast for sprintMaxSec or more is travel. It stays at the default sprint speed whatever
     * the user's (TRK-11), so a lower sprint speed never turns a long run into a drive.
     */
    travelSprintKph: defaultSprintKph,
    /** A sprint is at least this long at sprinting speed... */
    sprintMinSec: 2,
    /** ...and shorter than this: longer is a car (the longest sprint in the RefSix tracks was 5 s). */
    sprintMaxSec: 6,
    /** Heart-rate zones 1 to 5 start at these shares of the maximum heart rate. */
    zoneFrom: [0.5, 0.6, 0.7, 0.8, 0.9],
};

const TrackFigures = z.object({
    distanceM: z.number().nonnegative().optional().describe("The GPS figures (distance, top speed, sprints, speed bands) are left out where the track has no GPS, for example before the watch had a fix."),
    topSpeedMps: z.number().nonnegative().optional().describe("The watch's own speed when the track has it, otherwise from positions averaged over 3 seconds."),
    sprints: z.int().nonnegative().optional().describe("At sprinting speed (21 km/h or more by default, TRK-11) for 2 to 6 seconds."),
    speedBands: z.array(z.object({ band: SpeedBand, sec: z.number().nonnegative(), distanceM: z.number().nonnegative() })).optional().describe("Time and distance in each band, slowest first."),
    avgBpm: z.int().optional(),
    maxBpm: z.int().optional(),
    zones: z.array(z.object({ zone: z.int().min(1).max(5), fromBpm: z.int(), sec: z.number().nonnegative() })).optional().describe("Time in each heart-rate zone; only with a maximum heart rate in the user's settings."),
});

export const TrackSummary = z
    .object({
        covers: z.enum(["periods", "track"]).describe("periods: only the periods played, from the match report's period start times; track: the whole track (the report has no start times)."),
        total: TrackFigures,
        periods: z.array(TrackFigures.extend({ period: z.int().min(1) })).describe("Each period with a start time; empty when covers is track."),
        maxHeartRate: z.int().optional().describe("The maximum heart rate the zones are worked out from (Settings)."),
        sprintKph: z.number().describe("The sprint speed the speed bands and sprints are worked out from (Settings, TRK-11; 21 by default)."),
    })
    .meta({ id: "TrackSummary", description: "What the server works out from a track (TRK-3): GPS figures when it has GPS, heart-rate figures when it has heart rate." });

export type TrackSummary = z.infer<typeof TrackSummary>;
export type TrackFigures = z.infer<typeof TrackFigures>;

const earthRadiusM = 6_371_008.8;
const radians = Math.PI / 180;

/** Metres between two positions; flat-earth maths, accurate to centimetres over a pitch. */
export function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const x = (lon2 - lon1) * radians * Math.cos(((lat1 + lat2) / 2) * radians);
    const y = (lat2 - lat1) * radians;
    return Math.hypot(x, y) * earthRadiusM;
}

export function bandOf(speedMps: number, sprintKph: number = defaultSprintKph): SpeedBand {
    const kph = speedMps * 3.6;
    return speedBandsFor(sprintKph).findLast((b) => kph >= b.fromKph)?.band ?? "walking";
}

/** A step from one GPS point to the next that counts (TRK-3). */
export interface TrackStep {
    sec: number;
    metres: number;
    /**
     * The speed the watch measured at the step's end, when the track has it; otherwise from
     * positions averaged over 3 seconds, so GPS jitter doesn't look like running.
     */
    speedMps: number;
    band: SpeedBand;
}

/** The steps (as trackSteps) and each point's position averaged with its neighbours, which the speeds use and a replay moves along (TRK-10). */
export function trackPath(gps: GpsSeries, sprintKph: number = defaultSprintKph): { steps: (TrackStep | undefined)[]; positions: [number, number][] } {
    const { t, lat, lon } = gps;
    const n = t.length;
    const raw = (i: number) => metresBetween(lat[i - 1], lon[i - 1], lat[i], lon[i]);
    const counts = t.map((_, i) => {
        const dt = i > 0 ? t[i] - t[i - 1] : 0;
        return dt > 0 && dt <= trackRules.gapMs && raw(i) / (dt / 1000) <= trackRules.maxSpeedMps;
    });
    // Travel: every step in a window (at least two thirds full) that covers too much ground.
    const travel = new Set<number>();
    let from = 0;
    let metres = 0;
    for (let i = 1; i < n; i++) {
        metres += counts[i] ? raw(i) : 0;
        while (t[i] - t[from] > trackRules.travelWindowMs) {
            from++;
            metres -= counts[from] ? raw(from) : 0;
        }
        const sec = (t[i] - t[from]) / 1000;
        if (sec * 1000 >= (trackRules.travelWindowMs * 2) / 3 && metres / sec > trackRules.travelSpeedMps) {
            for (let k = from + 1; k <= i; k++) {
                travel.add(k);
            }
        }
    }
    for (const k of travel) {
        counts[k] = false;
    }
    // Each point averaged with the neighbours it has a counted step to, so a bad point doesn't
    // pull its neighbours with it.
    const smooth = t.map((_, i) => {
        const near = [i, ...(counts[i] ? [i - 1] : []), ...(i + 1 < n && counts[i + 1] ? [i + 1] : [])];
        return [near.reduce((s, j) => s + lat[j], 0) / near.length, near.reduce((s, j) => s + lon[j], 0) / near.length] as [number, number];
    });
    const steps = t.map((_, i): TrackStep | undefined => {
        if (!counts[i]) {
            return undefined;
        }
        const sec = (t[i] - t[i - 1]) / 1000;
        // The watch's own speed (GPS Doppler, steadied with its motion sensors) beats positions
        // logged seconds apart: on a smart-recording match the positions alone made walking look
        // like 30 km/h sprints (TRK-3).
        const measured = gps.speedMps?.[i];
        const speedMps = Math.min(measured ?? metresBetween(smooth[i - 1][0], smooth[i - 1][1], smooth[i][0], smooth[i][1]) / sec, trackRules.maxSpeedMps);
        return { sec, metres: raw(i), speedMps, band: bandOf(speedMps, sprintKph) };
    });
    // Sprinting for too long is travel too (at the fixed travel speed, not the user's sprint speed).
    let run: number[] = [];
    const endRun = () => {
        if (run.reduce((sec, k) => sec + (steps[k]?.sec ?? 0), 0) >= trackRules.sprintMaxSec) {
            for (const k of run) {
                steps[k] = undefined;
            }
        }
        run = [];
    };
    for (const [i, step] of steps.entries()) {
        if (step && step.speedMps * 3.6 >= trackRules.travelSprintKph) {
            run.push(i);
        } else {
            endRun();
        }
    }
    endRun();
    return { steps, positions: smooth };
}

/**
 * The step into each GPS point from the one before (index i is the step from i - 1 to i), or
 * undefined where there's no step: the first point, gaps, steps faster than any referee, and travel.
 */
export function trackSteps(gps: GpsSeries, sprintKph: number = defaultSprintKph): (TrackStep | undefined)[] {
    return trackPath(gps, sprintKph).steps;
}

/** Running totals for one stretch of the match. */
class Tally {
    /** Time in counted steps: none means no GPS figures for this stretch (no fix yet, say). */
    stepSec = 0;
    distanceM = 0;
    topSpeedMps = 0;
    sprints = 0;
    bandSec = new Map<SpeedBand, number>();
    bandM = new Map<SpeedBand, number>();
    hrSec = 0;
    hrBeats = 0;
    maxBpm = 0;
    zoneSec = [0, 0, 0, 0, 0];

    add(other: Tally) {
        this.stepSec += other.stepSec;
        this.distanceM += other.distanceM;
        this.topSpeedMps = Math.max(this.topSpeedMps, other.topSpeedMps);
        this.sprints += other.sprints;
        for (const { band } of speedBands) {
            this.bandSec.set(band, (this.bandSec.get(band) ?? 0) + (other.bandSec.get(band) ?? 0));
            this.bandM.set(band, (this.bandM.get(band) ?? 0) + (other.bandM.get(band) ?? 0));
        }
        this.hrSec += other.hrSec;
        this.hrBeats += other.hrBeats;
        this.maxBpm = Math.max(this.maxBpm, other.maxBpm);
        this.zoneSec = this.zoneSec.map((s, i) => s + other.zoneSec[i]);
    }

    figures(hasGps: boolean, hasHeartRate: boolean, maxHeartRate: number | undefined): TrackFigures {
        const round1 = (x: number) => Math.round(x * 10) / 10;
        return {
            ...(hasGps && this.stepSec > 0 ? {
                distanceM: Math.round(this.distanceM),
                topSpeedMps: Math.round(this.topSpeedMps * 100) / 100,
                sprints: this.sprints,
                speedBands: speedBands.map(({ band }) => ({ band, sec: round1(this.bandSec.get(band) ?? 0), distanceM: Math.round(this.bandM.get(band) ?? 0) })),
            } : {}),
            ...(hasHeartRate && this.hrSec > 0 ? {
                avgBpm: Math.round(this.hrBeats / this.hrSec),
                maxBpm: this.maxBpm,
                ...(maxHeartRate ? {
                    zones: trackRules.zoneFrom.map((share, i) => ({ zone: i + 1, fromBpm: Math.round(share * maxHeartRate), sec: round1(this.zoneSec[i]) })),
                } : {}),
            } : {}),
        };
    }
}

/**
 * The stretches of a track in play, in milliseconds after its start: each period's from its kickoff
 * for its time played, split where play was suspended (TMR-13), so a period can have several. The
 * whole track, as period 0, when the report has no period start times. `played` is how far into the
 * period's play (ms) a stretch starts: 0, or after a suspension the time played before it. On a clock
 * that stops (TMR-15) the period ran for its clock's time and the time it stood still (stoppedSec), when
 * the referee was still on the field, so the stretch takes in both and `played` counts both.
 */
export function playWindows(track: MatchTrack, periods: MatchRecord["periods"] = []): { period: number; from: number; to: number; played: number }[] {
    const start = Date.parse(track.start);
    const timed = periods.filter((p) => p.startedAt);
    if (!timed.length) {
        return [{ period: 0, from: -Infinity, to: Infinity, played: 0 }];
    }
    return timed.flatMap((p) => {
        const kickoff = Date.parse(p.startedAt as string) - start;
        const gaps = [...(p.suspended ?? [])].sort((a, b) => a.fromSec - b.fromSec);
        const end = kickoff + (p.playedSec + (p.stoppedSec ?? 0) + gaps.reduce((sum, g) => sum + g.lengthSec, 0)) * 1000;
        const windows: { period: number; from: number; to: number; played: number }[] = [];
        let from = kickoff;
        let played = 0;
        for (const gap of gaps) {
            const at = Math.min(Math.max(kickoff + gap.fromSec * 1000, from), end);
            if (at > from) {
                windows.push({ period: p.period, from, to: at, played });
                played += at - from;
            }
            from = Math.min(at + gap.lengthSec * 1000, end);
        }
        windows.push({ period: p.period, from, to: end, played });
        return windows;
    });
}

/** TMR-15: where a stopping clock stood still in a period: from the clock's time, for how long. */
export interface ClockStop {
    atSec: number;
    lengthSec: number;
}

/**
 * TMR-15: the stops of a match on a clock that stops, by period, from its record's stoppages, in the order they
 * came; none (an empty map) for a match on a clock that runs on, whose events' times are already the time played.
 */
export function clockStopsOf(record: Pick<MatchRecord, "stoppingClock" | "events">): Map<number, ClockStop[]> {
    const stops = new Map<number, ClockStop[]>();
    if (!record.stoppingClock) {
        return stops;
    }
    for (const e of record.events) {
        if (e.type === "stoppage" && e.when === "play" && e.period !== undefined && e.periodSec !== undefined) {
            stops.set(e.period, [...(stops.get(e.period) ?? []), { atSec: e.periodSec, lengthSec: e.lengthSec }]);
        }
    }
    for (const list of stops.values()) {
        list.sort((a, b) => a.atSec - b.atSec);
    }
    return stops;
}

/**
 * TMR-15: a stopping clock's time in a period as the time since its kickoff (leaving out suspensions, as `played`
 * does): the clock's time and every stop before it. An event at the clock's time a stop began (the goal that
 * stopped it, a card while it stood still) goes at the stop's start.
 */
export function elapsedOfClock(stops: readonly ClockStop[] | undefined, clockSec: number): number {
    return clockSec + (stops ?? []).reduce((sum, s) => sum + (s.atSec < clockSec ? s.lengthSec : 0), 0);
}

/** TMR-15: the other way: the clock's time at a time since the period's kickoff, standing still through each stop. */
export function clockOfElapsed(stops: readonly ClockStop[] | undefined, elapsedSec: number): number {
    let stopped = 0;
    for (const s of stops ?? []) {
        const from = s.atSec + stopped;
        if (elapsedSec < from) {
            break;
        }
        if (elapsedSec < from + s.lengthSec) {
            return s.atSec;
        }
        stopped += s.lengthSec;
    }
    return elapsedSec - stopped;
}

/**
 * The figures for a track (TRK-3), over the periods played when the match report gives their
 * start times, otherwise over the whole track. Time play was suspended is left out (TMR-13).
 */
export function summarizeTrack(track: MatchTrack, periods: MatchRecord["periods"] = [], maxHeartRate?: number, sprintKph: number = defaultSprintKph): TrackSummary {
    const timed = periods.filter((p) => p.startedAt);
    const windows = playWindows(track, periods);
    // One tally a period, however many stretches it was played in.
    const periodTallies = new Map<number, Tally>();
    const tallies = windows.map((w) => {
        const tally = periodTallies.get(w.period) ?? new Tally();
        periodTallies.set(w.period, tally);
        return tally;
    });

    if (track.gps) {
        const { t } = track.gps;
        const steps = trackSteps(track.gps, sprintKph);
        for (const [w, { from, to }] of windows.entries()) {
            const tally = tallies[w];
            let sprintSec = 0;
            const endSprint = () => {
                if (sprintSec >= trackRules.sprintMinSec) {
                    tally.sprints++;
                }
                sprintSec = 0;
            };
            for (const [i, step] of steps.entries()) {
                if (!step || t[i - 1] < from || t[i] > to) {
                    endSprint();
                    continue;
                }
                tally.stepSec += step.sec;
                tally.distanceM += step.metres;
                tally.topSpeedMps = Math.max(tally.topSpeedMps, step.speedMps);
                tally.bandSec.set(step.band, (tally.bandSec.get(step.band) ?? 0) + step.sec);
                tally.bandM.set(step.band, (tally.bandM.get(step.band) ?? 0) + step.metres);
                if (step.band === "sprinting") {
                    sprintSec += step.sec;
                } else {
                    endSprint();
                }
            }
            endSprint();
        }
    }

    if (track.heartRate) {
        const { t, bpm } = track.heartRate;
        const zoneFrom = maxHeartRate ? trackRules.zoneFrom.map((share) => share * maxHeartRate) : [];
        for (const [i, beats] of bpm.entries()) {
            // Each sample stands for the time until the next one (the last, the time since the one before).
            const gap = i + 1 < t.length ? t[i + 1] - t[i] : i > 0 ? t[i] - t[i - 1] : 1000;
            const sec = Math.min(gap, trackRules.gapMs) / 1000;
            const w = windows.findIndex(({ from, to }) => t[i] >= from && t[i] < to);
            if (w < 0) {
                continue;
            }
            const tally = tallies[w];
            tally.hrSec += sec;
            tally.hrBeats += beats * sec;
            tally.maxBpm = Math.max(tally.maxBpm, beats);
            const zone = zoneFrom.findLastIndex((from) => beats >= from);
            if (zone >= 0) {
                tally.zoneSec[zone] += sec;
            }
        }
    }

    const total = new Tally();
    for (const tally of periodTallies.values()) {
        total.add(tally);
    }
    const hasGps = !!track.gps?.t.length;
    const hasHeartRate = !!track.heartRate?.t.length;
    return {
        covers: timed.length ? "periods" : "track",
        total: total.figures(hasGps, hasHeartRate, maxHeartRate),
        periods: timed.length ? [...periodTallies].map(([period, tally]) => ({ period, ...tally.figures(hasGps, hasHeartRate, maxHeartRate) })) : [],
        ...(maxHeartRate ? { maxHeartRate } : {}),
        sprintKph,
    };
}
