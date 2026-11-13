import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { zipSync } from "fflate";
import { maxUnzippedBytes, parseCsv, readImportFile as read } from "../src/importFile.ts";

const file = (name: string, text: string | Uint8Array, type = "") => ({ name, type, bytes: typeof text === "string" ? new TextEncoder().encode(text) : text });
const readImportFile = (f: ReturnType<typeof file>) => read(f.name, f.type, f.bytes);

test("CSV: quotes, quotes inside quotes, line breaks inside quotes, and any line ending", () => {
    assert.deepEqual(parseCsv('a,b,c\r\n1,"two, too","say ""hi"""\n3,"line\nbreak",\r\n'), [
        ["a", "b", "c"],
        ["1", "two, too", 'say "hi"'],
        ["3", "line\nbreak", ""],
    ]);
});

test("CSV saved with semicolons or tabs, as spreadsheets in many countries do", () => {
    assert.deepEqual(parseCsv("Home;Away;Fee\nA;B;40,50"), [["Home", "Away", "Fee"], ["A", "B", "40,50"]]);
    assert.deepEqual(parseCsv("Home\tAway\nA\tB"), [["Home", "Away"], ["A", "B"]]);
});

test("rows are keyed by the column names, skipping blank lines, with their place in the file", async () => {
    const read = await readImportFile(file("m.csv", "﻿\nHome,Away\n\nStrikers,Rovers\n,\nThunder,Galaxy\n"));
    assert.deepEqual(read.rows, [{ Home: "Strikers", Away: "Rovers" }, { Home: "Thunder", Away: "Galaxy" }]);
    assert.deepEqual(read.lines, [4, 6]);
});

test("JSON: a list, or { matches }, with nested objects and lists flattened", async () => {
    const read = await readImportFile(file("m.json", JSON.stringify({ matches: [{ home: { name: "Strikers", colour: "red" }, tags: ["league", "U12"], fee: 40 }] })));
    assert.deepEqual(read.rows, [{ "home name": "Strikers", "home colour": "red", tags: "league, U12", fee: 40 }]);
    await assert.rejects(readImportFile(file("m.json", "{ nope")), /isn't valid JSON/);
    await assert.rejects(readImportFile(file("m.json", '{"a":1}')), /list of matches/);
});

test("the example CSV and JSON read to the same rows", async () => {
    const examples = new URL("../../web/public/examples/", import.meta.url);
    const csv = await readImportFile(file("e.csv", readFileSync(new URL("lawfive-matches.csv", examples), "utf8")));
    const json = await readImportFile(file("e.json", readFileSync(new URL("lawfive-matches.json", examples), "utf8")));
    assert.equal(csv.rows.length, 3);
    assert.equal(json.rows.length, 3);
    assert.equal(csv.rows[0]["Home"], json.rows[0].home);
    assert.equal(csv.rows[2]["Match number"], json.rows[2].matchNumber);
});

test("an empty or unreadable file says why", async () => {
    await assert.rejects(readImportFile(file("m.csv", "Home,Away\n")), /no matches/);
    await assert.rejects(readImportFile(file("m.xls", "")), /Save it as Excel \(\.xlsx\) or CSV/);
});

test("the example Excel file reads to the same rows, from its Matches sheet", async () => {
    const examples = new URL("../../web/public/examples/", import.meta.url);
    const excel = await readImportFile(file("e.xlsx", new Uint8Array(readFileSync(new URL("lawfive-matches.xlsx", examples)))));
    const json = await readImportFile(file("e.json", readFileSync(new URL("lawfive-matches.json", examples), "utf8")));
    assert.equal(excel.kind, "table");
    assert.equal(excel.rows.length, json.rows.length);
    assert.equal(excel.rows[0]["Home"], json.rows[0].home);
});

test("a CSV saved in the older Windows encoding keeps its accents", async () => {
    const csv = await readImportFile(file("m.csv", Uint8Array.from([...Buffer.from("Home,Away\nM"), 0xfc, ...Buffer.from("nchen,Rovers\n")])));
    assert.equal(csv.rows[0].Home, "München");
});

test("a damaged Excel file says what to do", async () => {
    await assert.rejects(readImportFile(file("m.xlsx", "not a spreadsheet")), /couldn't be read/);
});

test("SEC-3: an Excel file that opens out too far is refused, whatever sizes it claims", async () => {
    // A small file of nothing but zeros, which says it opens out to 1,000 bytes.
    const zip = zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(maxUnzippedBytes + 1024 * 1024) }, { level: 9 });
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    for (let at = 0; at + 4 <= zip.length; at++) {
        const sig = view.getUint32(at, true);
        if (sig === 0x04034b50) {
            view.setUint32(at + 22, 1000, true);
        } else if (sig === 0x02014b50) {
            view.setUint32(at + 24, 1000, true);
        }
    }
    assert.ok(zip.length < 1024 * 1024, "small to send");
    await assert.rejects(readImportFile(file("big.xlsx", zip)), /too big once opened/);
});
