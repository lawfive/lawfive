import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTip, tipChance, tips } from "../src/tips.ts";

/** A random that gives these numbers in turn. */
const rolls = (...numbers: number[]) => () => numbers.shift()!;

test("a tip comes up only within its chance (TIP-2)", () => {
    assert.equal(chooseTip([], 5, rolls(tipChance)), undefined);
    assert.equal(chooseTip([], 5, rolls(0.99)), undefined);
    assert.equal(chooseTip([], 5, rolls(tipChance - 0.001, 0))?.id, tips[0].id);
    assert.ok(tipChance >= 0.05 && tipChance <= 0.1);
});

test("a dismissed tip doesn't come back, and none is left once all are (TIP-3)", () => {
    assert.equal(chooseTip([tips[0].id], 5, rolls(0, 0))?.id, tips[1].id);
    assert.equal(chooseTip(tips.map((t) => t.id), 5, rolls(0, 0)), undefined);
});

test("tips about a played match wait for one", () => {
    const early = tips.filter((t) => !t.afterPlaying);
    assert.ok(early.length > 0);
    assert.equal(chooseTip(early.map((t) => t.id), 0, rolls(0, 0)), undefined);
    assert.ok(chooseTip(early.map((t) => t.id), 1, rolls(0, 0))?.afterPlaying);
});

test("each tip has its own id", () => {
    assert.equal(new Set(tips.map((t) => t.id)).size, tips.length);
});
