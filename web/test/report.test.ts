import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultFormat } from "@lawfive/schema";
import type { Match, MatchRecord } from "../src/api.ts";
import { type ReportData, reportRows, reportText } from "../src/report.ts";

// DATA-6: the match report's rows and text.

const match = { id: "m1", home: { name: "United U12" }, away: { name: "Strikers U12" }, format: { ...defaultFormat, periods: 2, periodSec: 1800 } } as unknown as Match;
const play = (period: number, periodSec: number) => ({ when: "play" as const, period, periodSec });

function data(events: MatchRecord["events"]): ReportData {
    const record = { id: "r1", matchId: "m1", score: { home: 1, away: 0 }, outcome: "fullTime", events } as unknown as MatchRecord;
    return { match, record, officials: [{ role: "Referee", name: "Alex Morgan" }] };
}

// EVT-16: injuries listed after the cards, with how long play was stopped when the watch timed it.
test("injuries in the report, only when there were any", () => {
    const report = data([
        { type: "caution", ...play(1, 600), team: "home", offender: { kind: "player", number: 5 } },
        { type: "injury", ...play(2, 420), team: "away", player: 3, lengthSec: 90 },
        { type: "injury", ...play(2, 900), team: "home", note: "Ankle" },
    ] as MatchRecord["events"]);
    const { injuries } = reportRows(report);
    assert.deepEqual(injuries.map((i) => [i.minute, i.team, i.player, i.stopped, i.note]), [
        ["38'", "Strikers U12", "#3", "1:30", ""],
        ["46'", "United U12", "Player", "", "Ankle"],
    ]);
    const text = reportText(report);
    assert.match(text, /Cautions and send-offs\n11' {2}United U12 {2}#5 {2}Caution\n\nInjuries\n38' {2}Strikers U12 {2}#3 {2}Play stopped 1:30\n46' {2}United U12 {2}Player: Ankle\n$/);

    const none = reportText(data([]));
    assert.doesNotMatch(none, /Injuries/);
});

// TMR-13, TMR-14: the suspensions and the clock's corrections after the result, each only when there were any;
// a card without a number (or 0, EVT-3) says "Player", and a team official's has the name. Android's ReportTest and
// the iPhone's ReportTests check the same.
test("suspensions, clock corrections and cards without a number in the report", () => {
    const text = reportText(data([
        { type: "clockAdjusted", ...play(1, 700), clock: "match", changeSec: 40 },
        { type: "caution", ...play(1, 1140), team: "away", offender: { kind: "player" } },
        { type: "suspension", ...play(1, 1740), reason: "lightning", lengthSec: 2052, note: "Storm cell" },
        { type: "caution", ...play(2, 60), team: "home", offender: { kind: "player", number: 0 } },
        { type: "sendOff", ...play(2, 300), team: "away", offender: { kind: "teamOfficial", role: "headCoach", name: "Pat Lee" } },
        { type: "clockAdjusted", ...play(2, 600), clock: "added", changeSec: -65 },
    ] as MatchRecord["events"]));
    assert.match(text, /Result: United U12 1 – 0 Strikers U12, full time\n\nSuspended\n30' {2}Suspended 34:12 · Lightning: Storm cell\n\nClock\n12' {2}Clock adjusted \+0:40\n41' {2}Added time adjusted −1:05\n\nGoals\nNone\n\nCautions and send-offs\n20' {2}Strikers U12 {2}Player {2}Caution\n32' {2}United U12 {2}Player {2}Caution\n36' {2}Strikers U12 {2}Head coach Pat Lee {2}Send-off\n$/);

    const none = reportText(data([]));
    assert.doesNotMatch(none, /Suspended|Clock/);
});

// TMR-15: on a clock that stops the Clock lines say so first, and a minute at the length has no added time. Android's
// ReportTest and the iPhone's ReportTests check the same.
test("a stopping clock in the report", () => {
    const report = data([{ type: "caution", ...play(1, 1800), team: "home", offender: { kind: "player", number: 5 } }] as MatchRecord["events"]);
    const text = reportText({ ...report, record: { ...report.record, stoppingClock: true } });
    assert.match(text, /\n\nClock\nStopped when play stopped \(the minutes are the clock's\)\n\nGoals\n/);
    assert.match(text, /30' {2}United U12 {2}#5 {2}Caution/);
    assert.match(reportText(report), /30\+1' {2}United U12/);
});

// DATA-6: the match number and assignor (SET-15) under the venue, the abandonment (EVT-11) after the result, a goal's
// kind, and a card's code with what it means in its scheme ("UB (Unsporting behavior)"; a code the scheme doesn't know
// on its own). Android's ReportTest and the iPhone's ReportTests check the same.
test("assignor, abandonment, goal kinds and codes with their meaning in the report", () => {
    const record = {
        id: "r1", matchId: "m1", score: { home: 1, away: 0 }, outcome: "abandoned",
        events: [
            { type: "goal", ...play(1, 300), team: "home", player: 9, goalType: "penalty" },
            { type: "caution", ...play(1, 600), team: "away", offender: { kind: "player", number: 4 }, misconduct: { scheme: "ussf", code: "UB" } },
            { type: "sendOff", ...play(1, 1200), team: "home", offender: { kind: "player", number: 2 }, misconduct: { scheme: "ussf", code: "SFP" } },
            { type: "caution", ...play(1, 1500), team: "away", offender: { kind: "player", number: 7 }, misconduct: { scheme: "ussf", code: "ZZ" } },
            { type: "abandonment", ...play(2, 1320), reason: "weather", note: "Hail" },
        ],
    } as unknown as MatchRecord;
    const text = reportText({ match: { ...match, external: { source: "manual", id: "4471" }, assignor: "Dana Ruiz" } as Match, record, officials: [{ role: "Referee", name: "Alex Morgan" }] });
    assert.match(text, /\nMatch number: 4471\nAssignor: Dana Ruiz\n\nOfficials\n/);
    assert.match(text, /Result: United U12 1 – 0 Strikers U12, abandoned\nAbandoned 53': Hail\n\nGoals\n6' {2}United U12 {2}#9 {2}Penalty\n\nCautions and send-offs\n11' {2}Strikers U12 {2}#4 {2}Caution {2}UB \(Unsporting behavior\)\n21' {2}United U12 {2}#2 {2}Send-off {2}SFP \(Serious foul play\)\n26' {2}Strikers U12 {2}#7 {2}Caution {2}ZZ\n$/);

    assert.doesNotMatch(reportText(data([])), /Assignor|Abandoned/);
});

// RES-1: a result corrected after the match says so on the result line, as the printable page's score does; one as the
// watch recorded it doesn't. Android's ReportTest and the iPhone's ReportTests check the same.
test("a result corrected after the match in the report", () => {
    const report = data([]);
    assert.match(reportText({ ...report, record: { ...report.record, editedAt: "2026-11-08T10:00:00Z" } }), /\nResult: United U12 1 – 0 Strikers U12, full time, corrected after the match\n\nGoals\n/);
    assert.doesNotMatch(reportText(report), /corrected/);
});
