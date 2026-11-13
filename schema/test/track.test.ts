import assert from "node:assert/strict";
import { test } from "node:test";
import { MatchTrack, type MatchRecord, bandOf, clockOfElapsed, clockStopsOf, elapsedOfClock, playWindows, speedBandsFor, summarizeTrack, trackSteps } from "../src/index.ts";

// Tracks (TRK-1) and their figures (TRK-3), on made-up tracks whose answers are known.

const metresPerDegree = 6_371_008.8 * (Math.PI / 180);

/** A track running due north, one point a second, at each speed given (m/s) for one second. */
function run(speeds: number[], from = { lat: 51.5, lon: -0.12 }) {
    const t = [0];
    const lat = [from.lat];
    for (const [i, v] of speeds.entries()) {
        t.push((i + 1) * 1000);
        lat.push(lat[i] + v / metresPerDegree);
    }
    return { t, lat, lon: lat.map(() => from.lon) };
}

const base = { source: { kind: "other" as const }, start: "2026-11-07T10:00:00Z" };

test("a track needs GPS or heart rate, series of one length, and increasing times", () => {
    assert.ok(MatchTrack.safeParse({ ...base, heartRate: { t: [0, 1000], bpm: [100, 110] } }).success);
    assert.equal(MatchTrack.safeParse(base).success, false);
    const uneven = MatchTrack.safeParse({ ...base, gps: { t: [0, 1000], lat: [51.5], lon: [0, 0] } });
    assert.deepEqual(uneven.error?.issues.map((i) => i.path.join(".")), ["gps.lat"]);
    const repeated = MatchTrack.safeParse({ ...base, heartRate: { t: [0, 1000, 1000], bpm: [100, 110, 111] } });
    assert.deepEqual(repeated.error?.issues.map((i) => i.path.join(".")), ["heartRate.t.2"]);
});

test("speed bands", () => {
    assert.equal(bandOf(1), "walking");
    assert.equal(bandOf(7 / 3.6), "jogging");
    assert.equal(bandOf(15 / 3.6), "running");
    assert.equal(bandOf(20 / 3.6), "highSpeed");
    assert.equal(bandOf(21 / 3.6), "sprinting");
});

test("a user's sprint speed scales every band (TRK-11)", () => {
    assert.deepEqual(speedBandsFor(24).map((b) => Math.round(b.fromKph * 10) / 10), [0, 8, 14.9, 20.6, 24]);
    assert.deepEqual(speedBandsFor().map((b) => b.fromKph), [0, 7, 13, 18, 21]);
    assert.equal(bandOf(21 / 3.6, 24), "highSpeed");
    assert.equal(bandOf(18 / 3.6, 18), "sprinting");
});

test("a lower sprint speed counts more sprints, and never turns a long run into travel", () => {
    // 5 s at 19 km/h, then 10 s at 19 km/h: a sprint each with 18 km/h sprints, none with 21.
    const speeds = [...Array(10).fill(1.5), ...Array(5).fill(19 / 3.6), ...Array(10).fill(1.5), ...Array(10).fill(19 / 3.6), ...Array(10).fill(1.5)];
    const track = { ...base, gps: run(speeds) };
    assert.equal(summarizeTrack(track).total.sprints, 0);
    const own = summarizeTrack(track, [], undefined, 18);
    assert.equal(own.total.sprints, 2);
    assert.equal(own.sprintKph, 18);
    assert.equal(own.total.distanceM, summarizeTrack(track).total.distanceM, "the long run still counts");
});

test("distance is the sum of the steps, and each band gets its time and distance", () => {
    const speeds = [...Array(60).fill(1.5), ...Array(30).fill(2.5), ...Array(6).fill(6.5)];
    const { total, covers, periods } = summarizeTrack({ ...base, gps: run(speeds) });
    assert.equal(covers, "track");
    assert.deepEqual(periods, []);
    assert.equal(total.distanceM, 60 * 1.5 + 30 * 2.5 + 6 * 6.5);
    const band = Object.fromEntries(total.speedBands!.map((b) => [b.band, b]));
    // Averaging over 3 s blurs each change of speed across a step or two.
    assert.ok(Math.abs(band.walking.sec - 60) <= 1 && Math.abs(band.jogging.sec - 30) <= 1, JSON.stringify(band));
    assert.ok(band.sprinting.sec >= 4);
    assert.equal(total.sprints, 1);
    assert.equal(total.topSpeedMps, 6.5);
    assert.equal(total.avgBpm, undefined, "no heart rate, no heart-rate figures");
});

test("gaps and impossible jumps don't count", () => {
    const gps = run(Array(20).fill(2));
    // A 30 s pause in the recording after point 10, and a 200 m GPS error at point 15.
    gps.t = gps.t.map((t, i) => (i > 10 ? t + 30_000 : t));
    gps.lat[15] += 200 / metresPerDegree;
    const steps = trackSteps(gps);
    assert.equal(steps[0], undefined);
    assert.equal(steps[11], undefined, "the gap");
    assert.equal(steps[15], undefined, "into the bad point");
    assert.equal(steps[16], undefined, "out of it");
    assert.ok(steps[14]!.speedMps < 3, "the bad point doesn't drag its neighbours' speed up");
    assert.equal(summarizeTrack({ ...base, gps }).total.distanceM, 2 * 17);
});

test("a car park drive with the period still running is travel, not running", () => {
    // Walking, 40 s at 25 km/h with a stop in the middle, walking.
    const speeds = [...Array(60).fill(1.5), ...Array(20).fill(7), ...Array(5).fill(0), ...Array(20).fill(7), ...Array(60).fill(1.5)];
    const { total } = summarizeTrack({ ...base, gps: run(speeds) });
    assert.equal(total.sprints, 0);
    assert.ok(total.topSpeedMps! < 2, `top speed ${total.topSpeedMps}`);
    assert.ok(total.distanceM! < 120 * 1.5 + 1, `distance ${total.distanceM}`);
});

test("a sprint is at least 2 seconds at sprinting speed", () => {
    const burst = (n: number) => [...Array(10).fill(1), ...Array(n).fill(7), ...Array(10).fill(1)];
    // Averaging softens the edges: 1 s flat out averages below sprinting speed.
    assert.equal(summarizeTrack({ ...base, gps: run(burst(1)) }).total.sprints, 0);
    assert.equal(summarizeTrack({ ...base, gps: run([...burst(4), ...burst(4)]) }).total.sprints, 2);
    assert.equal(summarizeTrack({ ...base, gps: run(burst(8)) }).total.sprints, 0, "8 s flat out is a car");
});

test("the watch's own speed, when the track has it, beats speeds from positions", () => {
    // Positions a few seconds apart that jitter 7 m sideways on 1 s steps (running, by position),
    // while the watch says a steady walk.
    const t: number[] = [];
    const lat: number[] = [];
    const lon: number[] = [];
    for (let i = 0; i < 40; i++) {
        t.push(i * 4000 + (i % 2) * 3000);
        lat.push(51.5 + (i * 4) / metresPerDegree);
        lon.push(-0.12 + ((i % 2) * 7) / metresPerDegree / Math.cos(51.5 * (Math.PI / 180)));
    }
    const fromPositions = summarizeTrack({ ...base, gps: { t, lat, lon } });
    assert.ok(fromPositions.total.topSpeedMps! > 13 / 3.6, `top speed ${fromPositions.total.topSpeedMps}`);
    const measured = summarizeTrack({ ...base, gps: { t, lat, lon, speedMps: t.map(() => 1.4) } });
    assert.equal(measured.total.topSpeedMps, 1.4);
    assert.equal(measured.total.sprints, 0);
    assert.deepEqual(measured.total.speedBands!.filter((b) => b.sec > 0).map((b) => b.band), ["walking"]);
    assert.equal(measured.total.distanceM, fromPositions.total.distanceM, "distance still comes from the positions");
    // A sprint the watch measured counts like one from positions.
    const sprint = summarizeTrack({ ...base, gps: { ...run(Array(20).fill(1)), speedMps: [...Array(10).fill(1), 6.5, 6.5, 6.5, ...Array(8).fill(1)] } });
    assert.equal(sprint.total.sprints, 1);
    assert.equal(MatchTrack.safeParse({ ...base, gps: { t: [0, 1000], lat: [51.5, 51.5], lon: [0, 0], speedMps: [1] } }).success, false, "one speed for each position");
    // Where the watch gave no speed, that step's comes from the positions.
    const gaps = summarizeTrack({ ...base, gps: { t, lat, lon, speedMps: t.map((_, i) => (i === 20 ? null : 1.4)) } });
    assert.ok(gaps.total.topSpeedMps! > 1.4, "the gap uses the positions' speed");
    assert.equal(MatchTrack.safeParse({ ...base, gps: { t, lat, lon, speedMps: t.map((_, i) => (i === 20 ? null : 1.4)) } }).success, true);
});

test("with period start times, only the periods count, each on its own", () => {
    // 10 min warming up at 1 m/s, a 10-minute period at 2 m/s, 5 min break at 1 m/s, a 10-minute period at 3 m/s.
    const speeds = [...Array(600).fill(1), ...Array(600).fill(2), ...Array(300).fill(1), ...Array(600).fill(3)];
    const periods: MatchRecord["periods"] = [
        { period: 1, extraTime: false, startedAt: "2026-11-07T10:10:00Z", playedSec: 600 },
        { period: 2, extraTime: false, startedAt: "2026-11-07T10:25:00Z", playedSec: 600 },
    ];
    const heartRate = { t: speeds.map((_, i) => i * 1000), bpm: speeds.map((v) => 90 + v * 30) };
    const summary = summarizeTrack({ ...base, gps: run(speeds), heartRate }, periods, 190);
    assert.equal(summary.covers, "periods");
    assert.deepEqual(summary.periods.map((p) => [p.period, p.distanceM, p.avgBpm, p.maxBpm]), [[1, 1200, 150, 150], [2, 1800, 180, 180]]);
    assert.equal(summary.total.distanceM, 3000);
    assert.equal(summary.total.avgBpm, 165);
    // 150 bpm is 79% of 190 (zone 3, from 133), 180 is 95% (zone 5, from 171).
    assert.deepEqual(summary.total.zones!.map((z) => [z.zone, z.fromBpm, Math.round(z.sec)]), [[1, 95, 0], [2, 114, 0], [3, 133, 600], [4, 152, 0], [5, 171, 600]]);
    assert.equal(summary.maxHeartRate, 190);

    // Without GPS in the first period (no fix yet), that period has no GPS figures.
    const late = summarizeTrack({ ...base, gps: { ...run(speeds), t: run(speeds).t.map((t) => t + 1_300_000) } }, periods);
    assert.equal(late.periods[0].distanceM, undefined);
    assert.ok(late.periods[1].distanceM! > 0);
});

// TMR-13: a period suspended part way through counts its play either side, not the walk off the field and back.
test("time play was suspended is left out of its period", () => {
    // 5 min of play at 2 m/s, a 5-minute suspension walking at 1 m/s, then 5 more minutes of play at 2 m/s.
    const speeds = [...Array(300).fill(2), ...Array(300).fill(1), ...Array(300).fill(2)];
    const periods: MatchRecord["periods"] = [
        { period: 1, extraTime: false, startedAt: "2026-11-07T10:00:00Z", playedSec: 600, suspended: [{ fromSec: 300, lengthSec: 300 }] },
    ];
    const heartRate = { t: speeds.map((_, i) => i * 1000), bpm: speeds.map((v) => 90 + v * 30) };
    const summary = summarizeTrack({ ...base, gps: run(speeds), heartRate }, periods);
    assert.deepEqual(summary.periods.map((p) => [p.period, p.distanceM, p.avgBpm]), [[1, 1200, 150]]);
    assert.equal(summary.total.distanceM, 1200);
    assert.ok(summary.total.speedBands!.find((b) => b.band === "walking")!.sec < 10, "play is at 7.2 km/h, and the walk at 3.6 is left out");
    // Without the stretch, the period would end 5 minutes early and count the walk.
    const { suspended: _, ...plain } = periods[0];
    assert.equal(summarizeTrack({ ...base, gps: run(speeds) }, [plain]).total.distanceM, 900);
});

// TMR-15: on a clock that stops, the period ran for its clock's time and the time it stood still, the referee on the
// field all along; the replay turns the clock's times into times since kickoff and back with the stops.
test("a stopping clock's period takes in its stops, and its times map through them", () => {
    const speeds = Array(900).fill(2);
    const periods: MatchRecord["periods"] = [{ period: 1, extraTime: false, startedAt: "2026-11-07T10:00:00Z", playedSec: 600, stoppedSec: 300 }];
    assert.equal(summarizeTrack({ ...base, gps: run(speeds) }, periods).total.distanceM, 1800);
    assert.deepEqual(playWindows({ ...base, gps: run(speeds) }, periods), [{ period: 1, from: 0, to: 900_000, played: 0 }]);
    const record = {
        stoppingClock: true,
        events: [
            { type: "stoppage", when: "play", period: 1, periodSec: 200, lengthSec: 100 },
            { type: "stoppage", when: "play", period: 1, periodSec: 100, lengthSec: 200 },
            { type: "stoppage", when: "break", period: 1, lengthSec: 50 },
        ],
    } as MatchRecord;
    const stops = clockStopsOf(record).get(1);
    assert.deepEqual(stops, [{ atSec: 100, lengthSec: 200 }, { atSec: 200, lengthSec: 100 }], "in the clock's order, only in play");
    assert.equal(elapsedOfClock(stops, 100), 100, "at a stop's start");
    assert.equal(elapsedOfClock(stops, 150), 350);
    assert.equal(elapsedOfClock(stops, 250), 550);
    assert.equal(clockOfElapsed(stops, 200), 100, "standing still");
    assert.equal(clockOfElapsed(stops, 350), 150);
    assert.equal(clockOfElapsed(stops, 450), 200, "standing still again");
    assert.equal(clockOfElapsed(stops, 550), 250);
    assert.equal(clockStopsOf({ ...record, stoppingClock: undefined }).size, 0, "a clock that runs on has none");
});

test("heart rate without a maximum has no zones", () => {
    const summary = summarizeTrack({ ...base, heartRate: { t: [0, 1000, 2000], bpm: [100, 120, 140] } });
    assert.equal(summary.total.avgBpm, 120);
    assert.equal(summary.total.maxBpm, 140);
    assert.equal(summary.total.zones, undefined);
    assert.equal(summary.total.distanceM, undefined, "no GPS, no GPS figures");
});
