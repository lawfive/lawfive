import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultFormat } from "@lawfive/schema";
import type { Match, MatchRecord, MatchTrack } from "../src/api.ts";
import { clockAt, eventsOf, positionAt, replayOf, scoreAt, timelineOf, trackTimeAt } from "../src/replay.ts";

// The replay (TRK-10): the timeline skips breaks, the marker glides and waits at gaps, heart rate
// is the nearest reading, and the clock and score follow the match report.

const metresPerDegree = 6_371_008.8 * (Math.PI / 180);
/** Walking north at 1.5 m/s, a point a second, for `seconds`, starting `from` ms into the track. */
function walk(from: number, seconds: number, startLat = 51.5) {
    const t = Array.from({ length: seconds + 1 }, (_, i) => from + i * 1000);
    return { t, lat: t.map((_, i) => startLat + (i * 1.5) / metresPerDegree), lon: t.map(() => -0.12) };
}

const windows = [{ period: 1, from: 0, to: 60_000 }, { period: 2, from: 120_000, to: 180_000 }];
const gps1 = walk(0, 60);
const gps2 = walk(120_000, 60);
const track: MatchTrack = {
    source: { kind: "other" },
    start: "2026-11-07T10:00:00Z",
    gps: { t: [...gps1.t, ...gps2.t], lat: [...gps1.lat, ...gps2.lat], lon: [...gps1.lon, ...gps2.lon] },
    heartRate: { t: [500, 1500, 2500, 130_000], bpm: [120, 130, 140, 160] },
};

test("the timeline plays the periods back to back", () => {
    const timeline = timelineOf(track, windows);
    assert.equal(timeline.length, 120_000);
    assert.equal(trackTimeAt(timeline, 30_000), 30_000);
    assert.equal(trackTimeAt(timeline, 70_000), 130_000, "10 s into the second period");
    assert.equal(positionAt(timeline, 90_000), 60_000, "in the break: the start of the next period");
    assert.equal(positionAt(timeline, 130_000), 70_000);
    const whole = timelineOf(track, [{ period: 0, from: -Infinity, to: Infinity }]);
    assert.deepEqual(whole.spans, [{ period: 0, from: 0, to: 180_000 }], "without period times, the whole recording");
});

test("the marker glides between points, with speed and the nearest heart rate", () => {
    const replay = replayOf(track);
    const half = replay.at(10_500);
    assert.ok(!half.noGps);
    assert.ok(half.position![0] > gps1.lat[10] && half.position![0] < gps1.lat[11], "between the 10th and 11th points");
    assert.ok(Math.abs(half.speedMps! - 1.5) < 0.01);
    assert.equal(half.band, "walking");
    assert.equal(replay.at(1400).bpm, 130);
    assert.equal(replay.at(60_000).bpm, undefined, "no reading within 5 s");
});

test("in a gap the marker waits and says there's no GPS", () => {
    const replay = replayOf(track);
    const gap = replay.at(90_000);
    assert.equal(gap.noGps, true);
    assert.deepEqual(gap.position, replayOf(track).at(60_000).position);
    assert.equal(replay.at(200_000).position, undefined, "after the GPS ends");
});

test("the trail reaches a minute back, fading in steps", () => {
    const pieces = replayOf(track).trail(40_000);
    // The oldest step (into the point at 1 s) is 39 s old: pieces of 30–40, 20–30, 10–20 and 0–10 s.
    assert.equal(pieces.length, 4);
    assert.ok(pieces.every((p) => p.band === "walking"));
    assert.equal(pieces[0].age, 3 / 6);
    assert.equal(pieces.at(-1)!.age, 0);
    assert.deepEqual(replayOf(track).trail(130_000).flatMap((p) => p.points).length > 0, true, "no trail across the break");
    assert.ok(replayOf(track).trail(130_000).every((p) => p.points.every(([lat]) => lat >= gps2.lat[0] - 1e-9)));
});

const match = { format: { ...defaultFormat, periods: 2, periodSec: 60 } } as Match;
const record = {
    events: [
        { type: "goal", when: "play", period: 1, periodSec: 20, team: "home" },
        { type: "caution", when: "play", period: 2, periodSec: 5, team: "away", offender: { kind: "player" } },
        { type: "goal", when: "play", period: 2, periodSec: 30, team: "away" },
        { type: "caution", when: "break", period: 1, team: "away", offender: { kind: "player" } },
        { type: "stoppage", when: "play", period: 1, periodSec: 10, lengthSec: 30 },
    ],
} as MatchRecord;

test("goals and cards in track time, and the score at a moment", () => {
    const events = eventsOf(record, windows, Date.parse(track.start));
    assert.deepEqual(events.map((e) => [e.event.type, e.t]), [["goal", 20_000], ["caution", 125_000], ["goal", 150_000]], "only goals and cards during play");
    assert.deepEqual(scoreAt(events, 19_000), { home: 0, away: 0 });
    assert.deepEqual(scoreAt(events, 151_000), { home: 1, away: 1 });
});

// EVT-12: sin bins are marked and held on as the other cards are; an injury isn't.
test("sin bins on the replay's timeline", () => {
    const binned = {
        events: [
            { type: "sinBin", when: "play", period: 1, periodSec: 40, team: "home", offender: { kind: "player", number: 6 }, lengthSec: 600 },
            { type: "injury", when: "play", period: 2, periodSec: 10, team: "away" },
            { type: "secondSinBin", when: "play", period: 2, periodSec: 20, team: "home", offender: { kind: "player", number: 6 } },
        ],
    } as MatchRecord;
    assert.deepEqual(eventsOf(binned, windows, Date.parse(track.start)).map((e) => [e.event.type, e.t]), [["sinBin", 40_000], ["secondSinBin", 140_000]]);
});

test("the match clock", () => {
    assert.equal(clockAt(match, windows, 30_000), "1' · First half");
    assert.equal(clockAt(match, windows, 90_000), undefined, "at half-time");
});

// TMR-13: a period suspended part way plays as two stretches, the delay skipped as a break is, with the clock and the events after it as the watch had them.
test("a suspension is skipped, and the clock and events after it carry on from where play stopped", () => {
    const suspended = [{ period: 1, from: 0, to: 20_000, played: 0 }, { period: 1, from: 50_000, to: 90_000, played: 20_000 }];
    const timeline = timelineOf(track, suspended);
    assert.equal(timeline.length, 60_000);
    assert.equal(trackTimeAt(timeline, 25_000), 55_000, "5 s after the resume");
    const record = {
        events: [
            { type: "goal", when: "play", period: 1, periodSec: 10, team: "home" },
            { type: "suspension", when: "play", period: 1, periodSec: 20, reason: "lightning", lengthSec: 30 },
            { type: "goal", when: "play", period: 1, periodSec: 40, team: "away" },
        ],
    } as MatchRecord;
    assert.deepEqual(eventsOf(record, suspended, Date.parse(track.start)).map((e) => e.t), [10_000, 70_000]);
    const minutes = { format: { ...defaultFormat, periods: 2, periodSec: 120 } } as Match;
    assert.equal(clockAt(minutes, suspended, 85_000), "1' · First half", "55 s of play, the delay left out");
    assert.equal(clockAt(minutes, suspended, 30_000), undefined, "while suspended");
});

// TMR-15: on a clock that stops, events record the clock's time, so each goes after the time it stood still before it,
// one at a stop's start (the goal that stopped it) at that start; the replay's clock stands still through the stops.
test("a stopping clock: events after its stops, and the clock standing still through them", () => {
    const one = [{ period: 1, from: 0, to: 600_000, played: 0 }];
    const record = {
        stoppingClock: true,
        events: [
            { type: "goal", when: "play", period: 1, periodSec: 90, team: "home" },
            { type: "stoppage", when: "play", period: 1, periodSec: 90, lengthSec: 60 },
            { type: "caution", when: "play", period: 1, periodSec: 150, team: "away", offender: { kind: "player", number: 4 } },
            { type: "stoppage", when: "play", period: 1, periodSec: 150, lengthSec: 120 },
            { type: "goal", when: "play", period: 1, periodSec: 170, team: "away" },
        ],
    } as MatchRecord;
    assert.deepEqual(eventsOf(record, one, Date.parse(track.start)).map((e) => e.t), [90_000, 210_000, 350_000]);
    const stops = new Map([[1, [{ atSec: 90, lengthSec: 60 }, { atSec: 150, lengthSec: 120 }]]]);
    const minutes = { format: { ...defaultFormat, periods: 2, periodSec: 600, stoppingClock: true } } as Match;
    assert.equal(clockAt(minutes, one, 120_000, stops), "2' · First half", "standing still at 1:30");
    assert.equal(clockAt(minutes, one, 200_000, stops), "3' · First half", "2:20 on the clock");
    assert.equal(clockAt(minutes, one, 250_000, stops), "3' · First half", "standing still at 2:30");
    assert.equal(clockAt(minutes, one, 400_000, stops), "4' · First half", "3:40 on the clock");
    assert.equal(clockAt(minutes, one, 400_000), "7' · First half", "without its stops, the time since kickoff");
});
