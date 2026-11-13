import assert from "node:assert/strict";
import { test } from "node:test";
import { type Match, addedTimeSec, ageGroupOrder, defaultFormat, gameMatches, localKickoff } from "../src/index.ts";

// Which games count and match the filters (STAT-1, STAT-5, STAT-11): shared by the server's stats
// and the web app's match list, so both agree.

const match = (over: Partial<Match> = {}): Match => ({
    id: "5c0a1e2b-0000-4000-8000-000000000001", version: 1, updatedAt: "2026-01-01T00:00:00Z",
    status: "played", kickoff: "2026-03-08T00:30:00Z", timeZone: "America/Los_Angeles", format: defaultFormat,
    home: {}, away: {}, crew: [], ...over,
} as Match);

test("games are played or abandoned matches with a kickoff", () => {
    assert.ok(gameMatches(match(), {}));
    assert.ok(gameMatches(match({ status: "abandoned" }), {}));
    assert.ok(!gameMatches(match({ status: "scheduled" }), {}));
    assert.ok(!gameMatches(match({ kickoff: undefined }), {}));
});

test("dates and months are the match's own", () => {
    // 00:30 UTC on 8 March is 16:30 on 7 March in Los Angeles.
    assert.deepEqual(localKickoff("2026-03-08T00:30:00Z", "America/Los_Angeles"), { date: "2026-03-07", hour: 16, minute: 30, day: 5 });
    assert.ok(gameMatches(match(), { to: "2026-03-07", month: "2026-03" }));
    assert.ok(!gameMatches(match(), { from: "2026-03-08" }));
    assert.equal(localKickoff("2026-03-08T00:30:00Z", "Not/AZone").date, "2026-03-08", "an unknown zone counts as UTC");
});

test("role, tag, venue, pitch, age group and crew", () => {
    const m = match({ role: "ar2", tags: ["League"], venueId: "5c0a1e2b-0000-4000-8000-000000000002", ageGroup: "U12",
        crew: [{ role: "referee", refereeId: "5c0a1e2b-0000-4000-8000-000000000003" }, { role: "ar1", name: "Club  Linesman" }] });
    assert.ok(gameMatches(m, { role: "assistant", tag: "league", ageGroup: "U12", pitchId: "none" }));
    assert.ok(!gameMatches(m, { role: "referee" }));
    assert.ok(gameMatches(m, { refereeId: "5c0a1e2b-0000-4000-8000-000000000003" }));
    assert.ok(gameMatches(m, { refereeName: "club linesman" }), "names ignore case and spacing");
    assert.ok(!gameMatches(m, { pitchId: "5c0a1e2b-0000-4000-8000-000000000004" }));
});

test("added time leaves out periods left running", () => {
    const m = match({ format: { ...defaultFormat, periodSec: 1800, extraTimePeriodSec: 900 } });
    assert.equal(addedTimeSec(m, { period: 1, extraTime: false, playedSec: 1950 }), 150);
    assert.equal(addedTimeSec(m, { period: 1, extraTime: false, playedSec: 1700 }), 0, "ended early: none added");
    assert.equal(addedTimeSec(m, { period: 3, extraTime: true, playedSec: 960 }), 60);
    assert.equal(addedTimeSec(m, { period: 2, extraTime: false, playedSec: 1800 + 16 * 60 }), undefined);
});

// TMR-15: a clock that stops has no added time, by its format or by its record.
test("added time leaves out matches on a clock that stops", () => {
    const m = match({ format: { ...defaultFormat, periodSec: 1800 } });
    assert.equal(addedTimeSec(m, { period: 1, extraTime: false, playedSec: 1800 }, [], true), undefined);
    assert.equal(addedTimeSec(match({ format: { ...defaultFormat, stoppingClock: true } }), { period: 1, extraTime: false, playedSec: 2700 }), undefined);
    assert.equal(addedTimeSec(m, { period: 1, extraTime: false, playedSec: 1860 }), 60);
});

test("age groups sort youngest first, then adult ones", () => {
    const sorted = ["O35", "U12", "Adult", "U8", "U10"].sort((a, b) => {
        const [x, y] = [ageGroupOrder(a), ageGroupOrder(b)];
        return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
    });
    assert.deepEqual(sorted, ["U8", "U10", "U12", "Adult", "O35"]);
});
