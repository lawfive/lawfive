import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultFormat, starterFormats } from "@lawfive/schema";
import type { MatchTemplate } from "../src/api.ts";
import { formatChoiceOf, newMatchStart, sameFormat, suggestedStarter, usualChanged, usualFormatChoice, usualFormatFrom } from "../src/newMatch.ts";
import { watchShortName } from "../src/format.ts";

const u10 = starterFormats.find((s) => s.id === "us-u10")!;
const league: MatchTemplate = { id: "t1", version: 1, updatedAt: "2026-11-01T00:00:00Z", name: "U12 league", format: { ...defaultFormat, periodSec: 30 * 60, teamSize: 9 }, defaults: {} } as MatchTemplate;
const at = new Date("2026-11-09T20:00:00Z");

test("a new match starts with the usual role and format, a template winning (SET-17)", () => {
    assert.deepEqual(newMatchStart({}), { role: "referee", format: defaultFormat });
    assert.deepEqual(newMatchStart({ usualRole: "ar1", usualFormat: { format: u10.format, starterId: u10.id, changedAt: at.toISOString() } }), { role: "ar1", format: u10.format });
    assert.equal(newMatchStart({ usualFormat: { format: u10.format, changedAt: at.toISOString() } }, league).format, league.format);
});

test("a format missing a newer switch is the same as one with its default", () => {
    const { breakStoppage: _b, goalScorers: _g, goldenGoal: _gg, ...older } = defaultFormat;
    assert.ok(sameFormat(older, defaultFormat));
    assert.ok(!sameFormat(defaultFormat, { ...defaultFormat, periodSec: 40 * 60 }));
});

// EVT-12: saved before sin bins is off, and with them off their length doesn't count.
test("a format saved before sin bins has them off", () => {
    const { sinBins: _s, sinBinSec: _l, ...older } = defaultFormat;
    assert.ok(sameFormat(older, defaultFormat));
    assert.ok(sameFormat({ ...defaultFormat, sinBinSec: 5 * 60 }, defaultFormat));
    assert.ok(!sameFormat({ ...defaultFormat, sinBins: true }, defaultFormat));
    assert.ok(!sameFormat({ ...defaultFormat, sinBins: true, sinBinSec: 5 * 60 }, { ...defaultFormat, sinBins: true }));
    assert.ok(sameFormat({ ...older, sinBins: true }, { ...defaultFormat, sinBins: true }), "10 minutes when missing");
});

test("the format's choice: its template, the usual one, a starter, or your own", () => {
    const usual = usualFormatFrom(u10.format, { id: `starter:${u10.id}`, name: u10.name, starter: u10 }, at);
    assert.deepEqual(usual, { format: u10.format, starterId: "us-u10", changedAt: at.toISOString() });
    assert.equal(formatChoiceOf(league.format, { templateId: "t1", templates: [league] }).id, "template:t1");
    assert.equal(formatChoiceOf(u10.format, { usual, templates: [league] }).id, "starter:us-u10");
    assert.equal(formatChoiceOf(defaultFormat, { templates: [] }).id, "starter:adult");
    const own = { ...defaultFormat, periodSec: 38 * 60 };
    assert.equal(formatChoiceOf(own, { templates: [] }).id, "none");
    // Saved from the form, then offered as "Your usual".
    const saved = usualFormatFrom(own, formatChoiceOf(own, { templates: [] }), at);
    assert.deepEqual(saved, { format: own, changedAt: at.toISOString() });
    assert.equal(formatChoiceOf(own, { usual: saved, templates: [] }).id, "last");
    assert.equal(usualFormatChoice(saved, []).name, "As last saved");
    assert.equal(usualFormatChoice(undefined, []).id, "none");
    // A starter changed since isn't that starter any more.
    assert.equal(usualFormatChoice({ ...usual, format: own }, []).id, "last");
});

test("saving the same usual format again changes nothing", () => {
    const usual = usualFormatFrom(u10.format, { id: `starter:${u10.id}`, name: u10.name, starter: u10 }, at);
    assert.ok(usualChanged(undefined, usual));
    assert.ok(!usualChanged(usual, { ...usual, changedAt: new Date().toISOString() }));
    assert.ok(usualChanged(usual, { format: u10.format, changedAt: at.toISOString() }));
});

test("an age group suggests its starter format, unless the match has it", () => {
    assert.equal(suggestedStarter("u 10", defaultFormat)?.id, "us-u10");
    assert.equal(suggestedStarter("U10", u10.format), undefined);
    assert.equal(suggestedStarter("O35", defaultFormat), undefined);
    assert.equal(suggestedStarter(undefined, defaultFormat), undefined);
});

test("a watch is named as \"On your Venu 2\" reads (SYNC-14)", () => {
    assert.equal(watchShortName("Garmin Venu 2"), "Venu 2");
    assert.equal(watchShortName("Garmin watch"), "Garmin watch");
    assert.equal(watchShortName("Galaxy Watch4"), "Galaxy Watch4");
});
