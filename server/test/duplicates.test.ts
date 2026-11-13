import assert from "node:assert/strict";
import { test } from "node:test";
import { compareCandidates, compareNames, duplicateGroups, likelyDuplicates, sameAddress, suggestPitches } from "../src/duplicates.ts";

// Finding likely duplicates (DUP-2, DUP-7).

test("names: the same, reordered, with an initial or a middle name, or misspelt", () => {
    assert.deepEqual(compareNames("John Doe", "john  doe"), { score: 1, reasons: ["Same name"] });
    assert.deepEqual(compareNames("John Doe", "Doe, John"), { score: 0.95, reasons: ["Same name, in a different order"] });
    assert.deepEqual(compareNames("José Núñez", "Jose Nunez"), { score: 1, reasons: ["Same name"] });
    assert.equal(compareNames("J. Doe", "John Doe")?.reasons[0], "Same surname and initial");
    assert.equal(compareNames("Doe, J", "John Doe")?.reasons[0], "Same surname and initial");
    assert.equal(compareNames("John Doe", "John Michael Doe")?.reasons[0], "One has a middle name");
    assert.equal(compareNames("Jon Doe", "John Doe")?.reasons[0], "Similar spelling");
    assert.equal(compareNames("John Doe", "Jane Smith"), undefined);
    assert.equal(compareNames("John", "John Smith"), undefined, "one word isn't enough");
    assert.equal(compareNames("J. Smith", "John Doe"), undefined);
});

test("records: email and phone count, other names count, and \"not the same\" is respected", () => {
    const a = { id: "a", names: ["John Doe"], emails: ["john@example.com"], phones: ["+1 (555) 010-0100"] };
    const b = { id: "b", names: ["Johnny"], emails: ["JOHN@example.com "] };
    const c = { id: "c", names: ["Someone"], phones: ["555 010 0100"] };
    const d = { id: "d", names: ["Doe, J", "Jonathan Doe"] };
    assert.deepEqual(compareCandidates(a, b), { score: 1, reasons: ["Same email"] });
    assert.deepEqual(compareCandidates(a, c)?.reasons, ["Same phone number"]);
    assert.ok(compareCandidates(a, d));
    assert.equal(compareCandidates(a, { ...d, distinctFrom: ["a"] }), undefined);
    assert.equal(compareCandidates({ ...a, distinctFrom: ["d"] }, d), undefined);
});

test("one record's likely duplicates, best first; and groups across them all", () => {
    const all = [
        { id: "1", names: ["John Doe"] },
        { id: "2", names: ["Doe, John"] },
        { id: "3", names: ["J. Doe"] },
        { id: "4", names: ["Priya Natarajan"] },
        { id: "5", names: ["Natarajan, Priya"] },
        { id: "6", names: ["Sam Rivera"] },
    ];
    assert.deepEqual(likelyDuplicates(all[0], all).map((m) => m.id), ["2", "3"]);
    const groups = duplicateGroups(all);
    assert.deepEqual(groups.map((g) => g.ids.sort()), [["1", "2", "3"], ["4", "5"]]);
});

test("venues (DUP-7): the same address, within 150 m, or a similar name, worded for places", () => {
    assert.ok(sameAddress("123 Main Street", "123 Main St., Springfield, CA 95000"));
    assert.ok(sameAddress("400 N. Oak Avenue", "400 North Oak Ave"));
    assert.ok(!sameAddress("Main Street", "Main St, Springfield"), "a street alone isn't an address");
    assert.ok(!sameAddress("12 Main St", "123 Main St"));
    const park = { id: "a", names: ["Twin Creeks Sports Complex"], addresses: ["969 Caribbean Dr, Sunnyvale"], positions: [{ lat: 37.4135, lon: -122.0204 }], place: true };
    assert.deepEqual(compareCandidates(park, { id: "b", names: ["Twin Creeks"], place: true }), { score: 0.75, reasons: ["One name is longer"] });
    assert.deepEqual(compareCandidates(park, { id: "c", names: ["Sunnyvale fields"], positions: [{ lat: 37.4140, lon: -122.0210 }], place: true })?.reasons, ["Within 150 m"]);
    assert.equal(compareCandidates(park, { id: "d", names: ["Elsewhere"], positions: [{ lat: 37.42, lon: -122.0204 }], place: true }), undefined, "about 700 m away");
    assert.deepEqual(compareCandidates(park, { id: "e", names: ["TCSC"], addresses: ["969 Caribbean Drive"], place: true })?.reasons, ["Same address"]);
    assert.equal(compareCandidates(park, { id: "f", names: ["Twin Creeks"], place: true, distinctFrom: ["a"] }), undefined);
});

test("a venue merge's pitch suggestions, riskiest first (DUP-7)", () => {
    const at = (lat: number, lon: number) => ({ lat, lon });
    const kept = [{ id: "k1", name: "Field 1", position: at(37.41, -122.02) }, { id: "k3", name: "Field 3", position: at(37.4105, -122.02) }, { id: "k5", name: "Field 5" }];
    const theirs = [
        { id: "t3", name: "Field 3", position: at(37.41055, -122.02) },
        { id: "tA", name: "Field A", position: at(37.41015, -122.02) },
        { id: "t7", name: "Field 7" },
        { id: "t1", name: "field 1", position: at(37.4172, -122.02) },
        { id: "t5", name: "Field 5", position: at(37.41, -122.02) },
        { id: "x7", name: "Field 7" },
    ];
    const s = Object.fromEntries(suggestPitches(kept, theirs).map((x) => [x.id, x]));
    assert.deepEqual(s.t3, { id: "t3", into: "k3", risk: 5, why: "Same name, 6 m apart", metres: 6 });
    assert.deepEqual(s.tA, { id: "tA", into: "k1", risk: 3, why: "Within 17 m of Field 1", metres: 17 });
    assert.deepEqual(s.t1, { id: "t1", risk: 1, why: "Same name as Field 1, 801 m away. Check these are the same venue", metres: 801 });
    assert.deepEqual(s.t5, { id: "t5", into: "k5", risk: 4, why: "Same name as Field 5, with no position to check" });
    assert.equal(s.t7.risk, 1, "two kept from different venues with one name");
    assert.equal(s.x7.why, "Another pitch kept is called Field 7 too");
});
