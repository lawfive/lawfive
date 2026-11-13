import assert from "node:assert/strict";
import { test } from "node:test";
import { type MatchRecord, type MatchTrack, findPitch, fromPitch, markedCorners, metresBetween, pitchBearing, pitchFrame, pitchFromCorners, pitchHeat, pitchOf, pitchTurned, summarizeTrack, toPitch, trackPitch } from "../src/index.ts";

// The pitch and heatmaps (TRK-9), on a made-up match: a referee running the diagonal of a
// 100 × 64 m pitch that lies 30° east of north.

const truth = pitchOf({ lat: 51.5, lon: -0.12 }, 30, 100, 64, "referee");
const frame = pitchFrame(truth);

/**
 * Two 20-minute periods at a sample a second: up and down the standard (left-wing) diagonal with
 * some wandering, from a kickoff beside the centre spot. Heading for either goal the referee is on
 * the left of the pitch, so from above the diagonal runs from bottom left to top right.
 */
function diagonalMatch(): { track: MatchTrack; periods: MatchRecord["periods"] } {
    const t: number[] = [];
    const lat: number[] = [];
    const lon: number[] = [];
    const periods: MatchRecord["periods"] = [];
    for (const [p, offsetSec] of [[1, 60], [2, 60 + 1200 + 600]] as const) {
        periods.push({ period: p, extraTime: false, startedAt: new Date(Date.parse("2026-11-07T10:00:00Z") + offsetSec * 1000).toISOString(), playedSec: 1200 });
        for (let s = 0; s < 1200; s++) {
            // Out along the diagonal and back every 80 s, wandering 8 m either side.
            const phase = Math.sin((s / 80) * Math.PI * 2 + (p === 2 ? 1 : 0));
            const x = 35 * phase + 3;
            const y = 15 * phase + 8 * Math.sin(s / 13);
            const at = fromPitch(frame, s === 0 ? 2 : x, s === 0 ? 1 : y);
            t.push((offsetSec + s) * 1000);
            lat.push(at.lat);
            lon.push(at.lon);
        }
    }
    return { track: { source: { kind: "other" }, start: "2026-11-07T10:00:00Z", gps: { t, lat, lon } }, periods };
}

test("a pitch from its corners and centre spot, and positions on it, both ways", () => {
    assert.ok(Math.abs(frame.lengthM - 100) < 0.05 && Math.abs(frame.widthM - 64) < 0.05, `${frame.lengthM} × ${frame.widthM}`);
    assert.ok(Math.abs(pitchBearing(frame) - 30) < 0.01);
    const p = fromPitch(frame, 20, -10);
    const [x, y] = toPitch(frame, p.lat, p.lon);
    assert.ok(Math.abs(x - 20) < 0.01 && Math.abs(y + 10) < 0.01);
    // The corners given are on the touchline at y = -32, so the pitch isn't mirrored.
    const [cx, cy] = toPitch(frame, truth.corners[1].lat, truth.corners[1].lon);
    assert.ok(Math.abs(cx - 50) < 0.05 && Math.abs(cy + 32) < 0.05);
});

test("the pitch is found from the referee's track, near enough to put right by hand", () => {
    const { track, periods } = diagonalMatch();
    const found = findPitch(track, periods)!;
    assert.equal(found.by, "auto");
    const f = pitchFrame(found);
    const off = Math.abs(((pitchBearing(f) - 30) % 180 + 270) % 180 - 90);
    assert.ok(off < 25, `bearing ${pitchBearing(f).toFixed(1)}° is ${off.toFixed(1)}° off`);
    assert.ok(metresBetween(found.centre.lat, found.centre.lon, truth.centre.lat, truth.centre.lon) < 8, "centred on the kickoffs");
    assert.ok(f.lengthM >= 70 && f.lengthM <= 120 && f.widthM < f.lengthM, `${f.lengthM} × ${f.widthM}`);
    assert.equal(findPitch({ ...track, gps: { t: track.gps!.t.slice(0, 50), lat: track.gps!.lat.slice(0, 50), lon: track.gps!.lon.slice(0, 50) } }), undefined, "too little to go on");
});

test("the kickoff team attacks left to right when the kickoff direction is known", () => {
    const { track, periods } = diagonalMatch();
    assert.equal(pitchTurned(truth, track, periods, "referee", undefined), false);
    assert.equal(pitchTurned(truth, track, periods, "referee", { team: "home", bearingDeg: 40 }), false, "along the length: as it lies");
    assert.equal(pitchTurned(truth, track, periods, undefined, { team: "home", bearingDeg: 200 }), true, "the other way: turned half round");
});

/** An assistant's match: up and down the touchline at y = -32.5 over the right half (as on the standard diagonal), from the halfway line at each kickoff. */
function assistantMatch(touchlineY = -32.5): { track: MatchTrack; periods: MatchRecord["periods"] } {
    const t: number[] = [];
    const lat: number[] = [];
    const lon: number[] = [];
    const periods: MatchRecord["periods"] = [];
    for (const [p, offsetSec] of [[1, 60], [2, 60 + 1200 + 600]] as const) {
        periods.push({ period: p, extraTime: false, startedAt: new Date(Date.parse("2026-11-07T10:00:00Z") + offsetSec * 1000).toISOString(), playedSec: 1200 });
        for (let s = 0; s < 1200; s++) {
            // From the halfway line towards the goal line and back, mostly in the middle of the half.
            const x = s === 0 ? 1 : 24 + 22 * Math.sin((s / 70) * Math.PI * 2 + p);
            const at = fromPitch(frame, x, touchlineY + Math.sin(s / 9) * 0.8);
            t.push((offsetSec + s) * 1000);
            lat.push(at.lat);
            lon.push(at.lon);
        }
    }
    return { track: { source: { kind: "other" }, start: "2026-11-07T10:00:00Z", gps: { t, lat, lon } }, periods };
}

test("an assistant's pitch is found from their touchline; a fourth official's isn't", () => {
    const { track, periods } = assistantMatch();
    const found = findPitch(track, periods, { role: "ar1", pin: truth.centre })!;
    const f = pitchFrame(found);
    const off = Math.abs(((pitchBearing(f) - 30) % 180 + 270) % 180 - 90);
    assert.ok(off < 5, `bearing ${pitchBearing(f).toFixed(1)}° is ${off.toFixed(1)}° off`);
    const miss = metresBetween(found.centre.lat, found.centre.lon, truth.centre.lat, truth.centre.lon);
    assert.ok(miss < 15, `centre ${miss.toFixed(1)} m off: on the pin's side of the touchline, at the halfway end`);
    // As a referee's, it would be turned off the touchline.
    const asReferee = pitchFrame(findPitch(track, periods)!);
    assert.ok(Math.abs(((pitchBearing(asReferee) - 30) % 180 + 270) % 180 - 90) > 15);
    assert.equal(findPitch(track, periods, { role: "fourth" }), undefined);
});

test("an assistant's pitch is on the standard diagonal's side, with or without a pin", () => {
    // Running the bottom touchline over the right half, facing the right goal line: the pitch is on their left.
    const { track, periods } = assistantMatch();
    for (const pin of [undefined, fromPitch(frame, 0, -65)]) {
        const found = findPitch(track, periods, { role: "ar1", pin })!;
        const miss = metresBetween(found.centre.lat, found.centre.lon, truth.centre.lat, truth.centre.lon);
        assert.ok(miss < 15, `${pin ? "a pin beyond the touchline" : "no pin"}: centre ${miss.toFixed(1)} m off`);
    }
});

test("an assistant's touchline goes at the bottom of the drawing", () => {
    const bottom = assistantMatch(-32.5);
    assert.equal(pitchTurned(truth, bottom.track, bottom.periods, "ar2", { team: "home", bearingDeg: 200 }), false, "as it lies, whatever the kickoff direction");
    const top = assistantMatch(32.5);
    assert.equal(pitchTurned(truth, top.track, top.periods, "ar1", undefined), true, "the far touchline: turned half round");
});

test("the heatmap holds the periods' time, along the diagonal as it was run", () => {
    const { track, periods } = diagonalMatch();
    const heat = pitchHeat(track, periods, truth, false)!;
    const sum = (cells: number[]) => cells.reduce((s, x) => s + x, 0);
    const moving = summarizeTrack(track, periods).total.speedBands!.reduce((s, b) => s + b.sec, 0);
    assert.ok(Math.abs(sum(heat.total) - moving) < 1, `${sum(heat.total)} s against ${moving} s`);
    assert.deepEqual(heat.periods.map((p) => p.period), [1, 2]);
    assert.ok(Math.abs(sum(heat.periods[0].cells) + sum(heat.periods[1].cells) - sum(heat.total)) < 1);
    // Bottom left to top right (rows count from the top).
    const quarter = (cells: number[], right: boolean, top: boolean) => sum(cells.filter((_, i) => {
        const col = i % heat.cols;
        const row = Math.floor(i / heat.cols);
        return (col >= heat.cols / 2) === right && (row < heat.rows / 2) === top;
    }));
    const along = quarter(heat.total, true, true) + quarter(heat.total, false, false);
    const against = quarter(heat.total, false, true) + quarter(heat.total, true, false);
    assert.ok(along > against * 3, `${along} along the diagonal, ${against} off it`);
    // Turned half round, a diagonal still runs the same way: the drawing is never mirrored.
    const turned = pitchHeat(track, periods, truth, true)!;
    assert.ok(quarter(turned.total, true, true) + quarter(turned.total, false, false) > against * 3);
    assert.deepEqual(turned.total, [...heat.total].reverse(), "the same cells, turned");
});

// TRK-13: corners walked on the watch, a few metres out as GPS is.

/** The real pitch's corners, each nudged as a GPS fix would be. */
const walked = [[-50, -32, 1.5, -1], [50, -32, -1, 2], [50, 32, 2, 1], [-50, 32, -1.5, -2]].map(([x, y, ex, ey]) => fromPitch(frame, x + ex, y + ey));

const apart = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => metresBetween(a.lat, a.lon, b.lat, b.lon);

function near(pitch: ReturnType<typeof pitchFromCorners>, metres: number, degrees: number, what: string) {
    assert.ok(pitch, what);
    const f = pitchFrame(pitch);
    assert.ok(apart(pitch.centre, truth.centre) < metres, `${what}: centre ${apart(pitch.centre, truth.centre).toFixed(1)} m off`);
    // A pitch's length points either way along it.
    const off = Math.abs((((pitchBearing(f) - 30) % 180) + 270) % 180 - 90);
    assert.ok(off < degrees, `${what}: ${off.toFixed(1)}° off`);
    assert.ok(Math.abs(f.lengthM - 100) < metres * 2 && Math.abs(f.widthM - 64) < metres * 2, `${what}: ${f.lengthM.toFixed(1)} × ${f.widthM.toFixed(1)}`);
    assert.equal(pitch.by, "corners");
}

test("four corners, in any order, make the rectangle that fits them best", () => {
    near(pitchFromCorners(walked), 1.5, 2, "four");
    near(pitchFromCorners([walked[2], walked[0], walked[3], walked[1]]), 1.5, 2, "shuffled");
});

test("three corners: the one nearest a right angle is between the others", () => {
    near(pitchFromCorners([walked[0], walked[1], walked[2]]), 3, 3, "three");
    near(pitchFromCorners([walked[3], walked[1], walked[0]]), 3, 3, "three, another order");
});

test("two corners are one side, the rest from the pitch found from the track", () => {
    // Found from the track: a few metres and degrees out, and a little small.
    const found = pitchOf(fromPitch(frame, 6, -4), 35, 92, 58, "auto");
    const touchline = pitchFromCorners([walked[0], walked[1]], found)!;
    assert.ok(Math.abs(pitchFrame(touchline).lengthM - 100) < 4, "the touchline's length is walked");
    assert.equal(Math.round(pitchFrame(touchline).widthM), 58, "the width is the found pitch's");
    assert.ok(Math.abs((((pitchBearing(pitchFrame(touchline)) - 30) % 180) + 270) % 180 - 90) < 3, "turned as walked, not as found");
    assert.ok(apart(touchline.centre, truth.centre) < 6, "on the side the found pitch is on");
    const goalLine = pitchFromCorners([walked[1], walked[2]], found)!;
    assert.ok(Math.abs(pitchFrame(goalLine).widthM - 64) < 4, "a goal line gives the width");
    assert.equal(Math.round(pitchFrame(goalLine).lengthM), 92, "and the length is the found pitch's");
    assert.equal(pitchFromCorners([walked[0], walked[1]]), undefined, "without a found pitch, two aren't enough");
});

test("a track's pitch: adjusted on the map, else from corners, else found", () => {
    const { track, periods } = diagonalMatch();
    assert.equal(trackPitch(track, periods)?.by, "auto");
    assert.equal(trackPitch(track, periods, { corners: walked })?.by, "corners");
    assert.equal(trackPitch({ ...track, pitch: truth }, periods, { corners: walked })?.by, "referee");
});

test("a pitch's corners apply to matches from when they were marked on (fields move)", () => {
    const pitchId = "6b1f5c7e-2a4d-4c3b-9e8f-1a2b3c4d5e6f";
    const marking = (at: string, lat: number) => ({ corners: [{ lat, lon: 0 }, { lat, lon: 0.001 }], at });
    const venue = { pitches: [{ id: pitchId, name: "Field 1", markings: [marking("2026-03-01T10:00:00Z", 1), marking("2026-09-01T10:00:00Z", 2)] }] };
    const at = (kickoff: string) => markedCorners({ kickoff, pitchId }, venue)?.[0].lat;
    assert.equal(at("2026-02-01T10:00:00Z"), undefined, "before any marking");
    assert.equal(at("2026-05-01T10:00:00Z"), 1, "the spring marking");
    assert.equal(at("2026-10-01T10:00:00Z"), 2, "the autumn one takes over");
    const own = marking("2026-04-01T10:00:00Z", 3);
    assert.equal(markedCorners({ kickoff: "2026-04-01T09:00:00Z", pitchId, pitchMarking: own }, venue)?.[0].lat, 3, "a match's own marking first");
});
