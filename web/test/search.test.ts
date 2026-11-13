import assert from "node:assert/strict";
import { test } from "node:test";
import type { Match } from "../src/api.ts";
import { formatDistance, formatTemperature, officialsLine, surname } from "../src/format.ts";
import { defaultSettings } from "../src/settings.ts";
import { matchesSearch, searchAndSort } from "../src/search.ts";

const match = {
    id: "m1", version: 1, updatedAt: "2026-10-27T00:00:00Z", status: "scheduled",
    home: { name: "Strikers U12", alias: "STR" }, away: { name: "Rovers U12" },
    format: {} as Match["format"], crew: [{ role: "ar1", refereeId: "r1" }, { role: "ar2", name: "Club linesman" }],
    competitionId: "c1", venueId: "v1", pitchId: "p3", tags: ["needs AR"], ageGroup: "U12", gender: "female",
    external: { source: "csv", id: "BYL-1142" }, assignor: "Dana Whitfield", role: "referee",
} as Match;
const ctx = {
    competitions: new Map([["c1", { name: "Bay Youth League" }]]),
    venues: new Map([["v1", { name: "Twin Creeks", pitches: [{ id: "p3", name: "Field 3" }] }]]),
    referees: new Map([["r1", { name: "Sam Rivera" }]]),
} as never;

test("search finds a match by most of its fields", () => {
    for (const q of ["strikers", "STR", "rovers", "bay youth", "twin creeks", "field 3", "sam", "linesman", "needs ar", "BYL-1142", "whitfield", "u12", "female", "scheduled", "referee"]) {
        assert.ok(matchesSearch(match, ctx, q), q);
    }
});

test("every word must match, in any order", () => {
    assert.ok(matchesSearch(match, ctx, "rivera strikers"));
    assert.ok(!matchesSearch(match, ctx, "strikers galaxy"));
    assert.ok(matchesSearch(match, ctx, "   "));
});

test("accents and case don't matter", () => {
    const m = { ...match, home: { name: "Atlético Juárez" } } as Match;
    assert.ok(matchesSearch(m, ctx, "atletico juarez"));
});

test("WEB-20: the officials line, in order, with surnames, typed names and you", () => {
    const referees = new Map([["r1", { name: "Sam  Rivera " }], ["r2", { name: "Pelé" }]]);
    const line = (m: Partial<Match>) => officialsLine({ crew: [], ...m } as Match, referees).map((o) => `${o.role} ${o.who}`).join(" · ");
    assert.equal(line(match), "Ref you · AR1 Rivera · AR2 Club linesman");
    assert.equal(line({ role: "ar2", crew: [{ role: "fourth", refereeId: "r2" }, { role: "referee", name: "Ana Ruiz" }] }), "Ref Ana Ruiz · AR2 you · 4th Pelé");
    assert.equal(line({ crew: [{ role: "ar1", refereeId: "gone" }] }), "", "a referee no longer saved is left out");
    assert.equal(line({}), "");
    const named = new Map([["r1", { name: "Samuel Rivera", shortName: " Sammy " }]]);
    assert.equal(officialsLine({ crew: [{ role: "referee", refereeId: "r1" }] } as Match, named)[0].who, "Sammy", "a short name of their own comes first");
});

test("WEB-20: surnames from names as schedules write them", () => {
    const cases: [string, string][] = [
        ["Sam Rivera", "Rivera"], ["Sam  Rivera ", "Rivera"], ["Pelé", "Pelé"], ["Mary-Kate Smith-Jones", "Smith-Jones"],
        ["Sam Rivera (Grade 7)", "Rivera"], ["Sam Rivera [USSF 8]", "Rivera"], ["Sam Rivera (Grade", "Rivera"], ["Sam Rivera - Grade 7", "Rivera"],
        ["Rivera, Sam", "Rivera"], ["Rivera, Sam (Grade 7)", "Rivera"], ["RIVERA, SAM", "RIVERA"],
        ["Sam Rivera Jr.", "Rivera"], ["Sam Rivera, Jr.", "Rivera"], ["Sam Rivera III", "Rivera"], ["Rivera Jr., Sam", "Rivera"],
        ["Maria de la Cruz", "de la Cruz"], ["de la Cruz, Maria", "de la Cruz"], ["Ludwig van Beethoven", "van Beethoven"], ["Van Morrison", "Morrison"],
        ["(Grade 7)", "(Grade 7)"], ["  ", ""],
    ];
    for (const [name, expected] of cases) {
        assert.equal(surname(name), expected, name);
    }
});

test("distance and temperature in the user's units", () => {
    assert.equal(formatDistance(9150, "mi"), "5.7 mi");
    assert.equal(formatDistance(9150, "km"), "9.2 km");
    assert.equal(formatTemperature(12, "c"), "12°C");
    assert.equal(formatTemperature(12, "f"), "54°F");
});

test("new accounts get settings from the browser's language", () => {
    assert.deepEqual(defaultSettings("en-US"), { currency: "USD", distanceUnit: "mi", temperatureUnit: "f", misconductScheme: "ussf" });
    assert.deepEqual(defaultSettings("en-GB"), { currency: "GBP", distanceUnit: "km", temperatureUnit: "c", misconductScheme: "fa" });
    assert.deepEqual(defaultSettings("de"), { currency: "EUR", distanceUnit: "km", temperatureUnit: "c", misconductScheme: "ifab" });
    assert.deepEqual(defaultSettings("es-MX"), { currency: "MXN", distanceUnit: "km", temperatureUnit: "c", misconductScheme: "ifab" });
    assert.equal(defaultSettings("not a locale").currency, "USD");
});

test("lists: every word must match, most matches first by default, ties by name", () => {
    const items = [
        { name: "Twin Creeks", city: "Sunnyvale", n: 2 },
        { name: "Baylands Park", city: "Sunnyvale", n: 5 },
        { name: "Ortega Park", city: "Mountain View", n: 2 },
        { name: "Field 10", city: "Ávila", n: 0 },
        { name: "Field 9", city: "Ávila", n: 0 },
    ];
    const run = (query: string, sort: Parameters<typeof searchAndSort>[2]) =>
        searchAndSort(items, query, sort, (i) => [i.name, i.city], (i) => i.name, (i) => i.n).map((i) => i.name);
    assert.deepEqual(run("", "matches-desc"), ["Baylands Park", "Ortega Park", "Twin Creeks", "Field 9", "Field 10"]);
    assert.deepEqual(run("", "matches-asc"), ["Field 9", "Field 10", "Ortega Park", "Twin Creeks", "Baylands Park"]);
    assert.deepEqual(run("", "name-asc"), ["Baylands Park", "Field 9", "Field 10", "Ortega Park", "Twin Creeks"]);
    assert.deepEqual(run("", "name-desc"), ["Twin Creeks", "Ortega Park", "Field 10", "Field 9", "Baylands Park"]);
    assert.deepEqual(run("park sunny", "name-asc"), ["Baylands Park"]);
    assert.deepEqual(run("avila", "name-asc"), ["Field 9", "Field 10"], "accents are ignored");
});
