import assert from "node:assert/strict";
import { test } from "node:test";
import type { Match } from "../src/api.ts";
import { defaultFormat, starterFormatFor } from "@lawfive/schema";
import { asPlayed, clockAdjustedWords, colourName, darkOnWatch, deleteMatchMessage, describeFormat, describePlayers, formatPitchSize, formatShortDay, formatTime, formatWhen, initials, matchMinute, matchTabTitle, needsNameOrKickoff, periodName, sinBinLength, suggestAliases, suspensionWords, teamAlias, textOn } from "../src/format.ts";

// EVT-12: the format's summary says so when it has sin bins, and a sin bin's length reads in minutes.
test("sin bins in the format's summary, and a sin bin's length", () => {
    assert.equal(describeFormat(defaultFormat), "2 × 45 min · 15 min break");
    // SET-16: one period's break is only before extra time.
    assert.equal(describeFormat({ ...defaultFormat, periods: 1, periodSec: 1200 }), "1 × 20 min");
    assert.equal(describeFormat({ ...defaultFormat, periods: 1, periodSec: 1200, breakSec: 300, extraTime: true, extraTimePeriods: 1, extraTimePeriodSec: 300 }), "1 × 20 min · 5 min break · ET 1 × 5");
    assert.equal(describeFormat({ ...defaultFormat, sinBins: true }), "2 × 45 min · 15 min break · 10 min sin bins");
    assert.equal(describeFormat({ ...defaultFormat, sinBins: true, sinBinSec: 300 }), "2 × 45 min · 15 min break · 5 min sin bins");
    assert.equal(sinBinLength(600), "10 min");
    assert.equal(sinBinLength(450), "7.5 min");
});

// TMR-14: in the same words as the phones' match pages.
test("a clock corrected during play reads with its change, signed", () => {
    assert.equal(clockAdjustedWords({ clock: "match", changeSec: 40 }), "Clock adjusted +0:40");
    assert.equal(clockAdjustedWords({ clock: "added", changeSec: -65 }), "Added time adjusted −1:05");
    assert.equal(clockAdjustedWords({ clock: "match", changeSec: 720 }), "Clock adjusted +12:00");
});

// TMR-13: in the same words as the phones' match pages (which add the note the same way, " · Hail").
test("a suspension reads with how long it was, and why", () => {
    assert.equal(suspensionWords({ reason: "lightning", lengthSec: 2052 }), "Suspended 34:12 · Lightning");
    assert.equal(suspensionWords({ reason: "crowdTrouble" }), "Suspended · Crowd trouble");
    assert.equal(suspensionWords({ reason: "weather", lengthSec: 300 }), "Suspended 5:00 · Weather");
    assert.equal(suspensionWords({ reason: "other", lengthSec: 61 }), "Suspended 1:01 · Other reason");
});

test("short names are the first three letters or digits", () => {
    assert.deepEqual(suggestAliases("Strikers U12", "Rovers U12"), { home: "STR", away: "ROV" });
    assert.deepEqual(suggestAliases("St. Louis City", "FC Dallas"), { home: "STL", away: "FCD" });
    assert.deepEqual(suggestAliases("Strikers", undefined), { home: "STR", away: undefined });
    assert.deepEqual(suggestAliases("", ""), { home: undefined, away: undefined });
});

test("when they'd be the same, the words the names share are skipped", () => {
    assert.deepEqual(suggestAliases("L84_Roach", "L84_Smith"), { home: "ROA", away: "SMI" });
    assert.deepEqual(suggestAliases("l84 roach", "L84-Smith"), { home: "ROA", away: "SMI" });
    assert.deepEqual(suggestAliases("Strikers U12", "Strikers U14"), { home: "U12", away: "U14" });
    assert.deepEqual(suggestAliases("Galaxy SC", "Galaxy United"), { home: "SC", away: "UNI" });
    assert.deepEqual(suggestAliases("Rovers", "Rovers Reserves"), { home: "ROV", away: "RES" });
});

test("names that can't be told apart keep the plain short names", () => {
    assert.deepEqual(suggestAliases("United", "United"), { home: "UNI", away: "UNI" });
});

// SET-5: the same rule as the watch's download (schema's shortName, with the cases the phones run too).
test("a team's short name: the typed one, else from both names, else HOM/AWY", () => {
    const l84 = { home: { name: "L84-HENDERSON_M" }, away: { name: "L84-DE ANGELIS_K" } };
    assert.equal(teamAlias(l84, "home"), "HEN");
    assert.equal(teamAlias(l84, "away"), "DEA");
    assert.equal(teamAlias({ home: { name: "Riverside FC" }, away: {} }, "home"), "RIV");
    assert.equal(teamAlias({ home: { alias: "RVR", name: "Riverside FC" }, away: { name: "Riverbank" } }, "home"), "RVR");
    assert.equal(teamAlias({ home: {}, away: {} }, "away"), "AWY");
});

test("players: age group and gender, either or both", () => {
    assert.equal(describePlayers({ ageGroup: "U12", gender: "female" }), "U12 · Female");
    assert.equal(describePlayers({ gender: "coed" }), "Co-ed");
    assert.equal(describePlayers({ ageGroup: "O35" }), "O35");
    assert.equal(describePlayers({}), "");
});

test("colours: names from the watch's list, and black or white text", () => {
    assert.equal(colourName("#d71920"), "Red");
    assert.equal(colourName("#123456"), "Custom");
    assert.equal(colourName(undefined), "None");
    assert.equal(textOn("#FFD100"), "#000000");
    assert.equal(textOn("#0057B8"), "#FFFFFF");
});

test("a kit too dark for the watch's black screen gets an edge, the board's blank doesn't (UI-10)", () => {
    assert.equal(darkOnWatch("#000000"), true);
    assert.equal(darkOnWatch("#1a1a1a"), true);
    assert.equal(darkOnWatch("#3a403d"), false);
    assert.equal(darkOnWatch("#0057B8"), false);
});

test("initials skip region numbers and grades, and read \"Surname, First\" the right way round", () => {
    assert.equal(initials("84-Van Der Wal, Travis (REG)"), "TV");
    assert.equal(initials("84-Call, Daniel (REG)"), "DC");
    assert.equal(initials("Sam Rivera"), "SR");
    assert.equal(initials("Priya"), "P");
    assert.equal(initials("Mary Ann de la Cruz"), "MC");
    assert.equal(initials(""), "?");
});

test("a match's tab names its teams, or its own name, then its day (WEB-22)", () => {
    const kickoff = "2026-11-07T18:30:00Z";
    const match = { home: { name: "Rovers" }, away: { name: "Strikers" }, kickoff } as Match;
    const day = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(kickoff));
    assert.equal(matchTabTitle(match), `Rovers v Strikers · ${day}`);
    assert.equal(matchTabTitle({ ...match, name: "Cup final" }), `Cup final · ${day}`);
    assert.equal(matchTabTitle({ ...match, kickoff: undefined }), "Rovers v Strikers");
});

test("a pitch's size is in whole metres, or whole yards with miles (TRK-9, WEB-24)", () => {
    assert.equal(formatPitchSize(105, "km"), "105 m");
    assert.equal(formatPitchSize(68, "km"), "68 m");
    assert.equal(formatPitchSize(63.6, "km"), "64 m");
    assert.equal(formatPitchSize(105, "mi"), "115 yd");
    assert.equal(formatPitchSize(68, "mi"), "74 yd");
    assert.equal(formatPitchSize(91.44, "mi"), "100 yd");
});

test("a match needs a team name or a kickoff to be saved (WEB-30)", () => {
    const blank = { home: {}, away: {} };
    assert.equal(needsNameOrKickoff(blank), true);
    assert.equal(needsNameOrKickoff({ home: { name: "  " }, away: {} }), true);
    assert.equal(needsNameOrKickoff({ home: { name: "Strikers" }, away: {} }), false);
    assert.equal(needsNameOrKickoff({ home: {}, away: { name: "Rovers" } }), false);
    assert.equal(needsNameOrKickoff({ ...blank, kickoff: "2026-11-14T17:00:00Z" }), false);
    // Emptied while editing one that had a name: no.
    assert.equal(needsNameOrKickoff(blank, { home: { name: "Strikers" }, away: {} }), true);
    // One saved blank before (a watch's quick match) can still be saved as it is.
    assert.equal(needsNameOrKickoff(blank, blank), false);
});

test("a moment near now reads as a sentence carries it", () => {
    const now = new Date(2026, 10, 9, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 12).toISOString();
    assert.equal(formatWhen(at(9, 20), now), formatTime(at(9, 20)));
    assert.equal(formatWhen(at(8, 20), now), `yesterday, ${formatTime(at(8, 20))}`);
    assert.equal(formatWhen(at(10, 9), now), `tomorrow, ${formatTime(at(10, 9))}`);
    assert.equal(formatWhen(at(5, 9), now), `${formatShortDay(at(5, 9))}, ${formatTime(at(5, 9))}`);
});

test("periods are named as the match was played, not as planned (Q-20)", () => {
    const halves = { periods: 2 } as Match["format"];
    const normal = (n: number, et = 0) => [...Array.from({ length: n }, () => ({ extraTime: false })), ...Array.from({ length: et }, () => ({ extraTime: true }))];
    // Planned as two halves, played as four periods: they're periods 1 to 4, not two of extra time.
    const four = asPlayed(halves, { outcome: "completed", periods: normal(4) });
    assert.equal(periodName(four, 3), "Period 3");
    // Played as planned, with extra time: unchanged.
    assert.equal(asPlayed(halves, { outcome: "completed", periods: normal(2, 2) }), halves);
    assert.equal(periodName(halves, 3), "Extra time 1");
    // Planned as quarters, played as halves to full time.
    assert.equal(asPlayed({ periods: 4 } as Match["format"], { outcome: "completed", periods: normal(2) }).periods, 2);
    // Abandoned after two quarters: still quarters.
    assert.equal(asPlayed({ periods: 4 } as Match["format"], { outcome: "abandoned", periods: normal(2) }).periods, 4);
    // Nothing recorded: the plan's.
    assert.equal(asPlayed(halves), halves);
    // SET-16: a whole match of one period is a match of one period, its regular time named so.
    const one = asPlayed(halves, { outcome: "completed", periods: normal(1, 1) });
    assert.equal(one.periods, 1);
    assert.equal(periodName(one, 1), "Regular time");
    assert.equal(periodName(one, 2), "Extra time 1");
    // Abandoned in the first half: still halves.
    assert.equal(asPlayed(halves, { outcome: "abandoned", periods: normal(1) }), halves);
});

test("deleting a match says what goes with it (RES-8)", () => {
    assert.equal(deleteMatchMessage(false), "It goes from LawFive, on every device.");
    assert.equal(deleteMatchMessage(true, true), "It goes from LawFive, on every device, with its report and track.");
    assert.equal(deleteMatchMessage(true, false), "It goes from LawFive, on every device, with its report.");
    // Not known yet (or no signal, on a phone).
    assert.equal(deleteMatchMessage(true), "It goes from LawFive, on every device, with its report and any track.");
});

// TMR-15, SET-17: the stopping clock's starters, found by the age groups high school and college write, said in the summary;
// with no added time, an event at the length is in its last minute.
test("a stopping clock: its starters, its summary, and no added time in the minute", () => {
    const hs = starterFormatFor("Varsity");
    assert.equal(hs?.id, "us-hs");
    assert.equal(starterFormatFor("ncaa")?.name, "College (NCAA) · 2×45 · stopping clock");
    assert.equal(describeFormat(hs!.format), "2 × 40 min · 10 min break · stopping clock");
    assert.equal(hs!.format.trackStoppage, true, "a stopping clock needs stoppage tracked");
    assert.equal(matchMinute(hs!.format, 1, 2400), "40'");
    assert.equal(matchMinute(hs!.format, 2, 2399), "80'");
    assert.equal(matchMinute({ ...hs!.format, stoppingClock: false }, 1, 2400), "40+1'");
});
