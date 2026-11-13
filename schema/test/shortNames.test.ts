import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { shortName, suggestAliases } from "../src/index.ts";

// SET-5: one rule for a team's short name, shared by the server, the website and Try a match; the
// phones run the same cases (short-names.json) against their ports.

type Case = { name: string; home: { name?: string; alias?: string }; away: { name?: string; alias?: string }; shown: [string, string] };
const { cases } = JSON.parse(readFileSync(new URL("../short-names.json", import.meta.url), "utf8")) as { cases: Case[] };

test("the shared cases: a typed short name, else the pair's suggestion, else HOM/AWY", () => {
    assert.ok(cases.length > 10);
    for (const c of cases) {
        assert.deepEqual([shortName(c, "home"), shortName(c, "away")], c.shown, c.name);
    }
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
    assert.deepEqual(suggestAliases("L84-HENDERSON_M", "L84-DE ANGELIS_K"), { home: "HEN", away: "DEA" });
    assert.deepEqual(suggestAliases("Strikers U12", "Strikers U14"), { home: "U12", away: "U14" });
    assert.deepEqual(suggestAliases("Galaxy SC", "Galaxy United"), { home: "SC", away: "UNI" });
    assert.deepEqual(suggestAliases("Rovers", "Rovers Reserves"), { home: "ROV", away: "RES" });
});

test("names that can't be told apart keep the plain short names", () => {
    assert.deepEqual(suggestAliases("United", "United"), { home: "UNI", away: "UNI" });
});
