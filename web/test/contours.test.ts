import assert from "node:assert/strict";
import { test } from "node:test";
import { contourLevels, heatContours, march } from "../src/contours.ts";

test("no time on the pitch draws no bands", () => {
    const { paths } = heatContours(new Array(24 * 18).fill(0), 24, 18, 115, 84);
    assert.equal(paths.length, contourLevels.length);
    assert.ok(paths.every((d) => d === ""));
});

test("time in one place draws a closed band at every level, around that place", () => {
    const cols = 24;
    const rows = 18;
    const cells = new Array(cols * rows).fill(0);
    cells[9 * cols + 12] = 600;
    cells[9 * cols + 11] = 300;
    const { paths } = heatContours(cells, cols, rows, 120, 90);
    assert.equal(paths.length, 6);
    for (const d of paths) {
        assert.match(d, /^M[\d.]+ [\d.]+C/);
        assert.ok(d.endsWith("Z"));
        // Every point of every band lies around the hot cells (x 55 to 65, y 45 to 50), within a few cells.
        const numbers = d.match(/-?[\d.]+/g)!.map(Number);
        for (let i = 0; i < numbers.length; i += 2) {
            assert.ok(numbers[i] > 35 && numbers[i] < 85, `x ${numbers[i]}`);
            assert.ok(numbers[i + 1] > 25 && numbers[i + 1] < 70, `y ${numbers[i + 1]}`);
        }
    }
    // Higher levels draw smaller rings.
    assert.ok(paths[5].length <= paths[0].length);
});

test("marching squares closes a ring round a single high point", () => {
    const grid = [
        0, 0, 0,
        0, 1, 0,
        0, 0, 0,
    ];
    const rings = march(grid, 3, 3, 0.5);
    assert.equal(rings.length, 1);
    assert.equal(rings[0].length, 4);
    for (const [x, y] of rings[0]) {
        assert.ok(Math.abs(x - 1) + Math.abs(y - 1) === 0.5);
    }
});

test("a grid draws the bands the phones' copies are checked against", async () => {
    // TRK-9: Android's ContoursTest.kt and the iPhone's ContoursTests.swift check their ports against this case.
    const { default: c } = await import("./contours-case.json", { with: { type: "json" } });
    assert.deepEqual(heatContours(c.cells, c.cols, c.rows, c.w, c.h).paths, c.paths);
});
