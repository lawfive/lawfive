import assert from "node:assert/strict";
import { test } from "node:test";
import type { Match } from "../src/api.ts";
import { describeCount, workedTogether } from "../src/history.ts";

test("list rows count matches", () => {
    assert.equal(describeCount({ played: 1, upcoming: 0 }), "1 match");
    assert.equal(describeCount({ played: 4, upcoming: 2 }), "4 matches · 2 coming up");
    assert.equal(describeCount({ played: 0, upcoming: 1 }), "1 coming up");
    assert.equal(describeCount(undefined), "No matches yet");
});

test("a venue's played count is its games: played or abandoned, with a kickoff (STAT-16)", () => {
    const match = (id: string, status: Match["status"], kickoff?: string): Match => ({
        id, version: 1, updatedAt: "2026-11-01T00:00:00Z", status, kickoff, venueId: "v", home: {}, away: {}, crew: [],
        format: { periods: 2, periodSec: 2700, breakSec: 900, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 11, clock: "up", trackStoppage: false, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false },
    } as Match);
    const { venues } = workedTogether([
        match("a", "played", "2026-10-01T17:00:00Z"),
        match("b", "abandoned", "2026-10-08T17:00:00Z"),
        match("c", "played"),
        match("d", "cancelled", "2026-10-15T17:00:00Z"),
        match("e", "scheduled", "2026-12-01T17:00:00Z"),
    ]);
    assert.deepEqual(venues.get("v"), { played: 2, first: "2026-10-01T17:00:00Z", last: "2026-10-08T17:00:00Z", upcoming: 1 });
});
