import assert from "node:assert/strict";
import { test } from "node:test";
import { ageGroupRows, axisTicks, busiestGrid, lightStep, percentFigure, pitchThirds, ranks, ringShare, runningStretches, shares, spacedLabels } from "../src/stats.ts";

test("shares add up to 100", () => {
    assert.deepEqual(shares([1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(shares([31, 38, 20, 8, 3]), [31, 38, 20, 8, 3]);
    assert.deepEqual(shares([0, 0]), [0, 0]);
    assert.equal(shares([7, 2, 2, 5]).reduce((s, v) => s + v, 0), 100);
});

test("ranks share a place on a tie, and the next skips", () => {
    assert.deepEqual(ranks([12, 9, 6, 6, 5]), [1, 2, 3, 3, 5]);
    assert.deepEqual(ranks([3, 3, 3]), [1, 1, 1]);
    assert.deepEqual(ranks([]), []);
});

test("the pitch's thirds count the time beyond the lines to the third beside it", () => {
    const cols = 24;
    const rows = 18;
    const cells = new Array(cols * rows).fill(0);
    // The far left column (beyond the goal line) and the bottom row (beyond the near touchline).
    cells[9 * cols] = 60;
    cells[(rows - 1) * cols + 12] = 30;
    cells[9 * cols + 12] = 10;
    const t = pitchThirds(cells, cols, rows);
    assert.deepEqual(t.length, [60, 40, 0]);
    assert.deepEqual(t.width, [0, 70, 30]);
    assert.equal(t.length.reduce((s, v) => s + v, 0), 100);
});

test("the running total runs in months, or years over a long span", () => {
    const games = [
        { kickoff: "2026-08-20T17:00:00Z", distanceM: 8000, totalM: 8000 },
        { kickoff: "2026-08-27T17:00:00Z", distanceM: 7000, totalM: 15000 },
        { kickoff: "2026-09-03T17:00:00Z", distanceM: 9000, totalM: 24000 },
    ];
    const months = runningStretches(games);
    assert.equal(months.length, 2);
    assert.deepEqual(months.map((s) => [s.addedM, s.totalM, s.games]), [[15000, 15000, 2], [9000, 24000, 1]]);
    assert.equal(months[0].sub, "2026");
    assert.equal(months[1].sub, undefined);
    const years = runningStretches([...games, { kickoff: "2027-12-01T17:00:00Z", distanceM: 1000, totalM: 25000 }], 3);
    assert.deepEqual(years.map((s) => s.label), ["2026", "2027"]);
});

test("axis ticks end close above the top", () => {
    assert.deepEqual(axisTicks(226), [0, 50, 100, 150, 200, 250]);
    assert.deepEqual(axisTicks(312.5), [0, 100, 200, 300, 400]);
    assert.deepEqual(axisTicks(11.4), [0, 2.5, 5, 7.5, 10, 12.5]);
    assert.deepEqual(axisTicks(0), [0, 1]);
});

test("labels along a line keep their distance, the last always shown", () => {
    assert.deepEqual(spacedLabels([10, 40, 120, 130], 50), [true, false, false, true]);
    assert.deepEqual(spacedLabels([0, 100, 200], 50), [true, true, true]);
});

test("age groups merge games, added time and cards, youngest first", () => {
    const rows = ageGroupRows({
        ageGroups: [{ ageGroup: "U12", male: 2, female: 1, coed: 0, notSet: 0 }, { ageGroup: "Adult", male: 1, female: 0, coed: 0, notSet: 0 }],
        addedTime: { ageGroups: [{ ageGroup: "U9", periods: 4, averageSec: 30 }, { ageGroup: "U12", periods: 6, averageSec: 70 }] },
        discipline: { ageGroups: [{ ageGroup: "U12", games: 3, cautions: 2, sendOffs: 1 }] },
    });
    assert.deepEqual(rows.map((r) => r.ageGroup), ["U9", "U12", "Adult"]);
    assert.equal(rows[1].games?.total, 3);
    assert.equal(rows[1].cards?.perGame, 1);
    assert.equal(rows[0].games, undefined);
});

test("busiest times span the hours with games, lit by share of the busiest", () => {
    const grid = busiestGrid([{ day: 5, hour: 9, games: 6 }, { day: 6, hour: 11, games: 1 }]);
    assert.deepEqual(grid.hours, [9, 10, 11]);
    assert.equal(grid.games(5, 9), 6);
    assert.equal(grid.games(0, 10), 0);
    assert.equal(lightStep(6, 6), 6);
    assert.equal(lightStep(1, 6), 1);
    assert.equal(lightStep(0, 6), 0);
});

test("a watch's ring is the battery an hour on a 30% scale, and full past it", () => {
    assert.equal(ringShare(15), 0.5);
    assert.equal(ringShare(45), 1);
    assert.equal(ringShare(undefined), 0);
    assert.equal(percentFigure(8.64), "8.6%");
    assert.equal(percentFigure(17.4), "17%");
    assert.equal(percentFigure(9.96), "10%");
});
