import assert from "node:assert/strict";
import { test } from "node:test";
import { type Event, defaultFormat, minuteText, penaltiesOf, periodSecOf, periodsFromFormat, sameResult, scoreOf, settleCautions, withEvents } from "../src/index.ts";

// Correcting a result (RES-1 to RES-6). The phones' copies (Result.kt, Result.swift) are tested
// with these same cases.

const goal = (team: "home" | "away", period: number, periodSec: number): Event => ({ type: "goal", when: "play", team, period, periodSec });
const caution = (team: "home" | "away", number: number | undefined, periodSec = 600): Event => ({ type: "caution", when: "play", team, period: 1, periodSec, offender: { kind: "player", ...(number ? { number } : {}) } });

test("the score is the goals", () => {
    assert.deepEqual(scoreOf([goal("home", 1, 60), goal("away", 2, 120), goal("home", 2, 300), caution("home", 4)]), { home: 2, away: 1 });
    assert.deepEqual(scoreOf([]), { home: 0, away: 0 });
});

test("a shoot-out's score is its scored kicks", () => {
    const kick = (team: "home" | "away", scored: boolean): Event => ({ type: "penaltyKick", when: "penalties", team, scored });
    assert.deepEqual(penaltiesOf([kick("home", true), kick("away", false), kick("home", true), kick("away", true)]), { home: 2, away: 1 });
    assert.equal(penaltiesOf([goal("home", 1, 1)]), undefined);
});

test("a second caution to the same player is a send-off, and goes back when the first goes", () => {
    const settled = settleCautions([caution("home", 7, 300), caution("away", 7, 400), caution("home", 7, 900), caution("home", undefined, 950), caution("home", undefined, 960)]);
    assert.deepEqual(settled.map((e) => e.type), ["caution", "caution", "secondCaution", "caution", "caution"]);
    assert.deepEqual(settleCautions(settled.slice(2)).map((e) => e.type), ["caution", "caution", "caution"], "the first deleted");
});

// EVT-12, Q-22: the phones' copies are tested with this case too.
test("a second sin bin to the same player is a send-off, goes back when the first goes, and doesn't combine with a caution", () => {
    const sinBin = (team: "home" | "away", number: number | undefined, periodSec: number): Event => ({ type: "sinBin", when: "play", team, period: 1, periodSec, offender: { kind: "player", ...(number ? { number } : {}) }, lengthSec: 600 });
    const settled = settleCautions([sinBin("home", 7, 300), caution("home", 7, 400), sinBin("home", 7, 900), sinBin("home", undefined, 950), sinBin("home", undefined, 960), caution("home", 7, 1000)]);
    assert.deepEqual(settled.map((e) => e.type), ["sinBin", "caution", "secondSinBin", "sinBin", "sinBin", "secondCaution"]);
    assert.equal((settled[2] as Extract<Event, { type: "secondSinBin" }>).lengthSec, 600);
    assert.deepEqual(settleCautions(settled.slice(2)).map((e) => e.type), ["sinBin", "sinBin", "sinBin", "caution"], "the first deleted");
});

test("minutes as a referee writes them", () => {
    const f = defaultFormat; // 2 × 45
    assert.equal(periodSecOf(f, 1, "23"), 22 * 60);
    assert.equal(periodSecOf(f, 1, "23'"), 22 * 60);
    assert.equal(periodSecOf(f, 1, "45+2"), 46 * 60);
    assert.equal(periodSecOf(f, 2, "46"), 0);
    assert.equal(periodSecOf(f, 2, "90+3'"), 47 * 60);
    assert.equal(periodSecOf(f, 2, "23"), undefined, "not in the second half");
    assert.equal(periodSecOf(f, 1, "44+1"), undefined, "added time only after the last minute");
    assert.equal(periodSecOf(f, 1, "abc"), undefined);
    for (const [period, text] of [[1, "23'"], [1, "45+2'"], [2, "46'"], [2, "90+3'"]] as const) {
        assert.equal(minuteText(f, period, periodSecOf(f, period, text)!), text, text);
    }
    // A watch's second, 22:41 into the first half, shows as the 23rd minute.
    assert.equal(minuteText(f, 1, 22 * 60 + 41), "23'");
    const withEt = { ...f, extraTimePeriodSec: 15 * 60 };
    assert.equal(periodSecOf(withEt, 3, "95"), 4 * 60);
    assert.equal(periodSecOf(withEt, 4, "120+1"), 15 * 60);
});

test("editing events puts them in order and works the score out again", () => {
    const record = { outcome: "completed" as const, score: { home: 9, away: 9 }, events: [goal("away", 2, 600), goal("home", 1, 300)] };
    const edited = withEvents(record, [...record.events, caution("home", 3, 100), { type: "caution", when: "afterFullTime", team: "away", offender: { kind: "teamOfficial", role: "headCoach" } } as Event]);
    assert.deepEqual(edited.score, { home: 1, away: 1 });
    assert.deepEqual(edited.events.map((e) => `${e.type} ${e.when} ${"period" in e ? e.period : ""}`), ["caution play 1", "goal play 1", "goal play 2", "caution afterFullTime "]);
});

test("a result is the same whatever order its fields were written in", () => {
    const a = { outcome: "completed" as const, score: { home: 1, away: 0 }, events: [goal("home", 1, 60)] };
    const b = { events: [{ periodSec: 60, period: 1, team: "home", when: "play", type: "goal" } as Event], score: { away: 0, home: 1 }, outcome: "completed" as const };
    assert.ok(sameResult(a, b));
    assert.ok(!sameResult(a, { ...a, events: [] }));
});

test("a result entered without a watch has the format's periods", () => {
    assert.deepEqual(periodsFromFormat(defaultFormat), [{ period: 1, extraTime: false, playedSec: 2700 }, { period: 2, extraTime: false, playedSec: 2700 }]);
});
