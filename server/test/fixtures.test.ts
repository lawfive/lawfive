import { ChangesPage } from "@lawfive/schema";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { before, describe, test } from "node:test";
import { fixtureFiles, fixtureSources } from "../src/fixtures.ts";
import { checkAnswer } from "./contract.ts";

// The phones' snapshot fixtures (schema/generated/fixtures/, `pnpm fixtures`): up to date with the
// demo's data and the API, the same every run, and each one what its endpoint describes.

const folder = new URL("../../schema/generated/fixtures/", import.meta.url).pathname;
const onDisk = (dir = ""): string[] => readdirSync(`${folder}${dir}`, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? onDisk(`${dir}${e.name}/`) : [`${dir}${e.name}`]);

describe("the phones' fixtures", () => {
    let files: Record<string, string>;
    before(async () => {
        files = await fixtureFiles();
    });

    test("are up to date (run pnpm fixtures in server/)", () => {
        assert.deepEqual(onDisk().sort(), Object.keys(files).sort(), "files missing from, or stale in, schema/generated/fixtures/");
        for (const [path, content] of Object.entries(files)) {
            assert.equal(readFileSync(`${folder}${path}`, "utf8"), content, `${path} is out of date`);
        }
    });

    test("are the same every run", async () => {
        assert.deepEqual(await fixtureFiles(), files);
    });

    test("are each what their endpoint answers, with nothing undescribed", () => {
        const index = JSON.parse(files["index.json"]);
        for (const [path, { method, path: endpoint }] of Object.entries(fixtureSources)) {
            assert.ok(files[path], `${path} is written`);
            checkAnswer(method.toUpperCase(), endpoint.replace("{id}", index.demo.trackRecord), 200, JSON.parse(files[path]));
        }
    });

    test("the index's ids are the demo's", () => {
        const index = JSON.parse(files["index.json"]);
        const { changes } = ChangesPage.parse(JSON.parse(files["demo/changes.json"])) as { changes: { collection: string; record: { id: string } }[] };
        const ids = (collection: string) => new Set(changes.filter((c) => c.collection === collection).map((c) => c.record.id));
        for (const [name, id] of Object.entries(index.demo.matches)) {
            assert.ok(ids("matches").has(id as string), `${name} is a match`);
        }
        assert.ok(ids("match-records").has(index.demo.trackRecord));
        const track = JSON.parse(files["demo/track.json"]);
        assert.ok(track.heat && track.pitch && track.summary.total.distanceM > 0, "the track has its pitch, heatmap and figures");
        assert.equal(JSON.parse(files["new-account/changes.json"]).changes.length, 0, "a new account has nothing");
    });

    test("are small", () => {
        const bytes = onDisk().reduce((sum, path) => sum + statSync(`${folder}${path}`).size, 0);
        assert.ok(bytes < 1024 * 1024, `${Math.round(bytes / 1024)} KB`);
    });
});
