import assert from "node:assert/strict";
import { test } from "node:test";
import { caseMs } from "../src/matchCases.ts";
import { readMatchCases, screenAsSteps } from "../src/matchCasesGenerate.ts";

// WCH-2: the match cases fit their schema (a typo fails here, not in a watch's test run), and a screen
// case plays out on the watches as a kickoff, the periods and its stoppage.

test("every match case file fits the schema, with unique names", () => {
    const { screen, match } = readMatchCases();
    assert.ok(screen.length > 0 && match.length >= 0);
    const names = [...screen.map((c) => c.name), ...match.map((c) => c.name)];
    assert.equal(new Set(names).size, names.length, "names are unique, so a failure says which");
    for (const c of match) {
        const times = c.steps.map((s) => caseMs(s.at));
        assert.deepEqual(times, [...times].sort((a, b) => a - b), `${c.name}: steps in time order`);
    }
});

test("a screen case as a watch's steps", () => {
    const steps = screenAsSteps({ name: "x", at: { phase: "running", period: 1, elapsed: "22:40", stoppage: "1:04" }, expect: { clock: "67:40", stoppage: { text: "1:04", solid: false } } })!;
    assert.deepEqual(steps.steps.map((s) => s.at), ["0:00", "45:00", "60:00", "81:35", "82:39", "82:40"]);
    assert.deepEqual(steps.steps.at(-1)!.expect, { clock: "67:40" }, "the pills are the pictures' own");
    assert.equal(screenAsSteps({ name: "y", at: { phase: "running", period: 0, elapsed: "1:00" }, expect: { breakPill: null } }), undefined);
});
