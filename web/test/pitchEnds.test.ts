import assert from "node:assert/strict";
import { test } from "node:test";
import { endsByWayRound, pitchEnds } from "../src/pitchEnds.ts";

// TRK-9: which team attacks from each end of the heatmap, per period.

const east: [number, number] = [1, 0];

test("a referee's drawing is turned so the first kickoff team attacks left to right in the first period", () => {
    // Kicking off toward the east on a pitch running east: drawn as it lies.
    assert.deepEqual(pitchEnds(2, { team: "home", bearingDeg: 90 }, east, false), [
        { period: 1, left: "home", right: "away" },
        { period: 2, left: "away", right: "home" },
    ]);
    // Toward the west: the drawing is turned, and the kickoff team is still on the left.
    assert.deepEqual(pitchEnds(2, { team: "away", bearingDeg: 270 }, east, true)[0], { period: 1, left: "away", right: "home" });
});

test("teams change ends every period", () => {
    const ends = pitchEnds(4, { team: "home", bearingDeg: 80 }, east, false);
    assert.deepEqual(ends.map((e) => e.left), ["home", "away", "home", "away"]);
    assert.deepEqual(ends.map((e) => e.right), ["away", "home", "away", "home"]);
});

test("an assistant's drawing, turned for their touchline, can put the kickoff team on the right", () => {
    // Kicking off toward the east, with the drawing turned so the assistant's touchline is at the bottom.
    assert.deepEqual(pitchEnds(2, { team: "home", bearingDeg: 100 }, east, true)[0], { period: 1, left: "away", right: "home" });
    // A pitch running north: a kickoff toward the north attacks the right end as drawn.
    assert.deepEqual(pitchEnds(2, { team: "away", bearingDeg: 10 }, [0, 1], false)[0], { period: 1, left: "away", right: "home" });
});

test("without the kickoff direction there are no ends to name", () => {
    assert.deepEqual(pitchEnds(2, undefined, east, false), []);
});

test("the whole match groups the periods by which way round they were played", () => {
    const halves = pitchEnds(2, { team: "home", bearingDeg: 90 }, east, false);
    assert.deepEqual(endsByWayRound(halves, 2), [
        { label: "1st half", left: "home", right: "away" },
        { label: "2nd half", left: "away", right: "home" },
    ]);
    const quarters = pitchEnds(4, { team: "away", bearingDeg: 90 }, east, false);
    assert.deepEqual(endsByWayRound(quarters, 4).map((r) => r.label), ["P1, P3", "P2, P4"]);
    assert.deepEqual(endsByWayRound(pitchEnds(3, { team: "home", bearingDeg: 90 }, east, false), 3).map((r) => r.label), ["P1, P3", "P2"]);
});
