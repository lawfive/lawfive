import assert from "node:assert/strict";
import { test } from "node:test";
import { breakClockText, clockText, formatCountdown, momentLabel, playAt } from "../src/watchPreview.ts";

// UI-27: what's particular to the setup's pictures. The clocks themselves are checked by the shared
// screen cases (matchCases.test.ts), as on the watches.

const at = (m: number, s = 0) => (m * 60 + s) * 1000;
const running = (elapsedMs: number, period = 0) => ({ phase: "running" as const, period, elapsedMs, stoppageMs: 0, stoppageRunning: false });

test("the break clock's text, counting down or up (TMR-4)", () => {
    assert.equal(breakClockText("down", at(1, 30), at(2)), "1:30");
    assert.equal(breakClockText("up", at(1, 30), at(2)), "0:30");
    assert.equal(breakClockText("up", 0, at(2)), "2:00");
    assert.equal(formatCountdown(0), "0:00");
    assert.equal(clockText("down", 0, at(47, 5)), "0:00");
});

test("play through runs a whole match", () => {
    assert.equal(playAt(0).elapsedMs, 0);
    assert.equal(playAt(0).breakDueInMs, at(22, 30), "added on as stoppage, the break is due at halfway (TMR-7)");
    const firstEnd = at(47) / at(110, 30);
    assert.equal(playAt(firstEnd - 0.0001).phase, "running");
    assert.equal(playAt(firstEnd + 0.001).phase, "halftime");
    assert.equal(playAt(1).period, 1);
    assert.equal(playAt(1).stoppageMs, at(3, 30), "the halfway break and a stoppage");
    assert.equal(momentLabel(running(at(23, 12))), "1H 23:12");
    assert.equal(momentLabel(running(at(46, 12), 1)), "2H 90:00 +1:12");
    assert.equal(momentLabel({ ...running(at(3)), phase: "halftime" }), "Half-time 3:00");
});
