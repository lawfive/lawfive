import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { z } from "zod";
import * as schema from "../src/index.ts";
import { generatedFiles } from "../src/generate.ts";

const root = new URL("..", import.meta.url).pathname;
const readJson = (path: string): unknown => JSON.parse(readFileSync(`${root}${path}`, "utf8"));
const schemas = schema as unknown as Record<string, z.ZodType>;

// Examples are named <Schema>.<description>.json and must parse with that schema.
const examples = readdirSync(`${root}examples`).filter((f) => f.endsWith(".json"));

for (const file of examples) {
    test(`example ${file} matches ${file.split(".")[0]}`, () => {
        const name = file.split(".")[0];
        assert.ok(schemas[name], `no schema named ${name}`);
        const result = schemas[name].safeParse(readJson(`examples/${file}`));
        assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues, null, 2));
    });
}

const schemes = new Map(
    readdirSync(`${root}misconduct`).map((f) => {
        const scheme = schema.MisconductScheme.parse(readJson(`misconduct/${f}`));
        return [scheme.id, scheme] as const;
    }),
);

test("every misconduct scheme file has its descriptions loaded", () => {
    const files = readdirSync(`${root}misconduct`).map((f) => f.replace(/\.json$/, "")).sort();
    assert.deepEqual(Object.keys(schema.misconductSchemes).sort(), files, "import new files in src/misconduct.ts");
    assert.equal(schema.misconductDescription({ scheme: "ussf", code: "UB" }), "Unsporting behavior");
});

test("misconduct schemes are named after their files and have unique codes", () => {
    assert.deepEqual([...schemes.keys()].sort(), ["fa", "ifab", "ussf"]);
    for (const [id, scheme] of schemes) {
        const codes = [...scheme.cautions, ...scheme.sendOffs].map((c) => c.code);
        assert.equal(new Set(codes).size, codes.length, `${id} repeats a code`);
        assert.ok(scheme.sendOffs.some((c) => c.code === scheme.secondCaution), `${id} secondCaution isn't a send-off code`);
        // EVT-14: the watches list each code with a few words.
        for (const c of [...scheme.cautions, ...scheme.sendOffs]) {
            assert.ok(c.short && c.short.length <= 22, `${id} ${c.code} needs a short meaning for the watches`);
        }
    }
});

test("cards in the examples use codes from the right list of a known scheme", () => {
    for (const file of examples.filter((f) => f.startsWith("MatchRecord."))) {
        const record = schema.MatchRecord.parse(readJson(`examples/${file}`));
        for (const event of record.events) {
            if (!("misconduct" in event) || !event.misconduct) {
                continue;
            }
            const scheme = schemes.get(event.misconduct.scheme);
            assert.ok(scheme, `${file}: unknown scheme ${event.misconduct.scheme}`);
            const list = event.type === "sendOff" ? scheme.sendOffs : scheme.cautions;
            assert.ok(list.some((c) => c.code === event.misconduct?.code), `${file}: ${event.misconduct.code} isn't a ${event.type} code`);
        }
    }
});

test("the default format is valid and matches MATCH_CONFIG.md", () => {
    const format = schema.MatchFormat.parse(schema.defaultFormat);
    assert.equal(format.periods, 2);
    assert.equal(format.periodSec, 45 * 60);
    assert.equal(format.breakSec, 15 * 60);
    assert.equal(format.trackStoppage, false);
});

test("formats outside the watch's ranges are rejected", () => {
    const bad = (change: object) => !schema.MatchFormat.safeParse({ ...schema.defaultFormat, ...change }).success;
    assert.ok(bad({ periods: 5 }));
    assert.ok(bad({ periodSec: 61 * 60 }));
    assert.ok(bad({ teamSize: 12 }));
    assert.ok(bad({ extraTimePeriods: 3 }));
    assert.ok(bad({ clock: "sideways" }));
});

test("a crew member needs a saved referee or a name", () => {
    assert.ok(!schema.CrewMember.safeParse({ role: "ar1" }).success);
    assert.ok(schema.CrewMember.safeParse({ role: "ar1", name: "Jordan Lee" }).success);
});

test("tags are unique ignoring case", () => {
    assert.ok(schema.Tags.safeParse(["indoor", "needs AR"]).success);
    assert.ok(!schema.Tags.safeParse(["Indoor", "indoor"]).success);
    assert.ok(!schema.Tags.safeParse([""]).success);
});

test("events are checked by type", () => {
    const ok = (event: object) => schema.Event.safeParse(event).success;
    assert.ok(ok({ type: "goal", when: "play", period: 1, periodSec: 60, team: "home" }));
    assert.ok(!ok({ type: "goal", when: "play", period: 1, periodSec: 60 }), "a goal needs a team");
    assert.ok(!ok({ type: "goal", when: "play", team: "home", player: 0 }), "player numbers start at 1");
    assert.ok(!ok({ type: "suspension", when: "play", reason: "notEnoughPlayers" }), "not a suspension reason");
    assert.ok(!ok({ type: "caution", when: "play", team: "home", offender: { kind: "teamOfficial" } }), "an official needs a role");
});

test("generated files are up to date (run pnpm generate)", () => {
    const files = generatedFiles();
    assert.ok(Object.keys(files).length > 10);
    for (const [path, content] of Object.entries(files)) {
        assert.equal(readFileSync(`${root}${path}`, "utf8"), content, `${path} is out of date`);
    }
    for (const folder of ["json-schema", "agents"]) {
        const onDisk = readdirSync(`${root}generated/${folder}`).map((f) => `generated/${folder}/${f}`);
        assert.deepEqual(onDisk.sort(), Object.keys(files).filter((p) => p.includes(`/${folder}/`)).sort(), "stale files in generated/");
    }
});

test("the pages for AI agents hang together (AGT-1)", () => {
    const files = generatedFiles();
    const pages = Object.entries(files).filter(([path]) => path.startsWith("generated/agents/")).map(([path, text]): [string, string] => [path.split("/").at(-1) as string, text]);
    const byName = new Map(pages);
    assert.ok(byName.has("llms.txt") && byName.has("overview.md") && byName.has("data-model.md"));
    const slug = (heading: string) => heading.toLowerCase().replace(/[^a-z0-9 -]/g, "").replaceAll(" ", "-");
    for (const [name, text] of pages) {
        assert.doesNotMatch(text, /\b(?!UTF-|ISO-|RFC-|SHA-|HMAC-|BYL-)[A-Z]{2,5}-\d+\b/, `${name} has a requirement ID`);
        assert.doesNotMatch(text, /\]\(json-schema\/|\]\(\.\.\//, `${name} links outside the published pages`);
        for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
            if (/^https?:/.test(target)) {
                const local = target.match(/^https:\/\/lawfive\.dev\/agents\/(.+)$/)?.[1];
                assert.ok(!local || byName.has(local), `${name}: no page ${target}`);
                continue;
            }
            const [file, hash] = target.split("#");
            const into = file ? byName.get(file) : text;
            assert.ok(into, `${name}: no page ${file}`);
            if (hash) {
                const anchors = [...(into as string).matchAll(/^#+ (.+)$/gm)].map((m) => slug(m[1]));
                assert.ok(anchors.includes(hash), `${name}: no section ${target}`);
            }
        }
    }
    for (const [name, text] of pages) {
        if (name !== "data-model.md" && name !== "llms.txt") assert.ok(text.length < 50_000, `${name} is ${text.length} characters: too much for one fetch`);
    }
});

test("docs/requirements/importing.md's import columns table is up to date (run pnpm generate)", () => {
    const requirements = readFileSync(`${root}../docs/requirements/importing.md`, "utf8");
    assert.equal(schema.withImportColumns(requirements), requirements, "the table differs from schema/src/importColumns.ts");
});

test("the API description hangs together", () => {
    const doc = JSON.parse(generatedFiles()["generated/openapi.json"]);
    const refs = JSON.stringify(doc).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g);
    for (const [, id] of refs) {
        assert.ok(doc.components.schemas[id], `${id} is referred to but not defined`);
    }
    const operations = Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods as object).map(([method, op]) => ({ path, method, ...op })));
    const ids = operations.map((op) => op.operationId);
    assert.equal(new Set(ids).size, ids.length, "operation ids are unique");
    for (const op of operations) {
        const inPath = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        const declared = (op.parameters ?? []).filter((p: { in: string }) => p.in === "path").map((p: { name: string }) => p.name).sort();
        assert.deepEqual(declared, inPath, `${op.method} ${op.path}: path parameters`);
        assert.ok(Object.keys(op.responses).some((status) => status.startsWith("2")), `${op.method} ${op.path} has a success answer`);
    }
});

test("record inputs leave out what the server sets", () => {
    for (const [name, c] of Object.entries(schema.collections)) {
        assert.ok(!("updatedAt" in c.input.shape) && !("deletedAt" in c.input.shape), name);
        assert.ok(c.input.shape.version.safeParse(undefined).success, `${name}: version is optional`);
    }
});

test("SET-17: the starter formats are valid formats, with unique ids, and age groups suggest them", () => {
    assert.equal(new Set(schema.starterFormats.map((s) => s.id)).size, schema.starterFormats.length);
    for (const s of schema.starterFormats) {
        assert.ok(schema.MatchFormat.safeParse(s.format).success, s.id);
        assert.ok(s.name.length <= 60, `${s.id}'s name fits a template's`);
    }
    assert.equal(schema.starterFormatFor("u10")?.format.periodSec, 25 * 60);
    // Q-23: U8 as the owner's leagues play it, two halves of 20 minutes with 5 at halftime.
    const u8 = schema.starterFormatFor("U 8")?.format;
    assert.deepEqual([u8?.periods, u8?.periodSec, u8?.breakSec, u8?.teamSize], [2, 20 * 60, 5 * 60, 4]);
    assert.equal(schema.starterFormatFor("U12")?.format.teamSize, 9);
    assert.equal(schema.starterFormatFor("O35"), undefined);
    assert.deepEqual(schema.starterFormatFor("Adult")?.format, schema.defaultFormat);
});

test("SET-17: the usual role and format are optional settings", () => {
    const base = readJson("examples/UserSettings.json") as Record<string, unknown>;
    const usual = { ...base, usualRole: "ar1", usualFormat: { format: schema.starterFormats[1].format, starterId: "us-u10", changedAt: "2026-11-09T18:00:00-08:00" } };
    assert.ok(schema.UserSettings.safeParse(usual).success);
    assert.ok(!schema.UserSettings.safeParse({ ...base, usualRole: "linesman" }).success);
});
