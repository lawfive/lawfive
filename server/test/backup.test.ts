import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { unzipSync, zipSync, strToU8 } from "fflate";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { diskStore } from "../src/storage.ts";
import { checkAnswer } from "./contract.ts";

// Download everything and restore (DATA-2, DATA-4): an account's records, tracks and photos as a
// zip, and merged back into an account, the newer copy of each record winning.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
let app: ReturnType<typeof createApp>;
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

async function call(method: string, path: string, token: string, body?: unknown) {
    const raw = body instanceof Uint8Array || body instanceof FormData;
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, authorization: `Bearer ${token}`, ...(body === undefined || raw ? {} : { "content-type": "application/json" }), ...(body instanceof Uint8Array ? { "content-type": "application/zip" } : {}) },
        body: body === undefined ? undefined : raw ? body as BodyInit : JSON.stringify(body),
    });
    const type = res.headers.get("content-type") ?? "";
    const parsed = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
    checkAnswer(method, path, res.status, parsed, raw ? undefined : body);
    return { status: res.status, body: parsed, headers: res.headers };
}

async function signUp(email: string) {
    const res = await app.request("/v1/auth/sign-up/email", {
        method: "POST",
        headers: { origin: publicUrl, "content-type": "application/json" },
        body: JSON.stringify({ name: "Backup Tester", email, password: "correct horse battery" }),
    });
    return res.headers.get("set-auth-token") as string;
}

before(async () => {
    await migrate(db, { migrationsFolder });
    const files = await diskStore(mkdtempSync(join(tmpdir(), "lawfive-backup-")));
    app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { files });
});

describe("download everything and restore", () => {
    let alice: string;
    let bob: string;
    let zip: Uint8Array;
    const venue = example("Venue.complex.json");
    const referee = example("Referee.ar.json");
    const match = example("Match.quick.json");
    const record = example("MatchRecord.full-match.json");
    const track = example("MatchTrack.short.json");

    test("everything comes out as one zip", async () => {
        alice = await signUp("alice@example.com");
        assert.equal((await call("PUT", `/v1/venues/${venue.id}`, alice, venue)).status, 201);
        assert.equal((await call("PUT", `/v1/referees/${referee.id}`, alice, referee)).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, alice, match)).status, 201);
        assert.equal((await call("PUT", `/v1/match-records/${record.id}`, alice, record)).status, 201);
        const put = await app.request(`/v1/match-records/${record.id}/track`, {
            method: "PUT", headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${alice}` }, body: JSON.stringify(track),
        });
        assert.equal(put.status, 201);
        const form = new FormData();
        form.set("recordType", "referee");
        form.set("recordId", referee.id);
        form.set("caption", "Headshot");
        form.set("file", new Blob([jpeg]), "photo.jpg");
        assert.equal((await call("POST", "/v1/attachments", alice, form)).status, 201);

        const res = await call("GET", "/v1/export", alice);
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-disposition")!, /attachment; filename="lawfive-export-\d{4}-\d\d-\d\d\.zip"/);
        zip = res.body;
        const files = unzipSync(zip);
        const text = (name: string) => JSON.parse(new TextDecoder().decode(files[name]));
        assert.equal(text("lawfive.json").format, "lawfive-export");
        assert.equal(text("lawfive.json").account.email, "alice@example.com");
        assert.ok(files["README.md"]);
        assert.deepEqual(text("records/venues.json").map((v: { id: string }) => v.id), [venue.id]);
        assert.equal(text("records/matches.json")[0].home.name, match.home.name);
        assert.equal(text(`tracks/${record.id}.json`).source.kind, track.source.kind);
        const [photo] = text("attachments.json");
        assert.equal(photo.caption, "Headshot");
        assert.deepEqual(files[photo.file], jpeg);
    });

    test("restoring into another account adds everything", async () => {
        bob = await signUp("bob@example.com");
        const res = await call("POST", "/v1/restore", bob, zip);
        assert.equal(res.status, 200);
        assert.deepEqual(res.body.records.venues, { added: 1, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.records["match-records"], { added: 1, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.tracks, { added: 1, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.photos, { added: 1, updated: 0, unchanged: 0 });
        assert.deepEqual(res.body.problems, []);
        assert.equal((await call("GET", `/v1/matches/${match.id}`, bob)).body.home.name, match.home.name, "ids kept");
        const photos = await call("GET", `/v1/attachments?recordType=referee&recordId=${referee.id}`, bob);
        assert.equal(photos.body.attachments[0].caption, "Headshot");
        assert.deepEqual((await call("GET", photos.body.attachments[0].url, bob)).body, jpeg);
        assert.equal((await call("GET", `/v1/match-records/${record.id}/track`, bob)).status, 200);
    });

    test("running it again changes nothing, and the account's newer copies stay", async () => {
        const again = await call("POST", "/v1/restore", bob, zip);
        assert.deepEqual(again.body.records.venues, { added: 0, updated: 0, unchanged: 1 });
        assert.deepEqual(again.body.tracks, { added: 0, updated: 0, unchanged: 1 });
        assert.deepEqual(again.body.photos, { added: 0, updated: 0, unchanged: 1 });

        // Alice changes her venue after the export; restoring the old export keeps her change.
        const current = (await call("GET", `/v1/venues/${venue.id}`, alice)).body;
        await call("PUT", `/v1/venues/${venue.id}`, alice, { ...venue, version: current.version, name: "Renamed" });
        const mine = await call("POST", "/v1/restore", alice, zip);
        assert.equal(mine.body.records.venues.unchanged, 1);
        assert.equal((await call("GET", `/v1/venues/${venue.id}`, alice)).body.name, "Renamed");

        // A record deleted before the export was made comes back; one deleted since stays deleted.
        const v = (await call("GET", `/v1/venues/${venue.id}`, bob)).body;
        assert.equal((await call("DELETE", `/v1/venues/${venue.id}?version=${v.version}`, bob)).status, 200);
        assert.equal((await call("POST", "/v1/restore", bob, zip)).body.records.venues.unchanged, 1);
    });

    test("anything else is refused", async () => {
        assert.equal((await call("POST", "/v1/restore", bob, strToU8("not a zip"))).status, 400);
        assert.equal((await call("POST", "/v1/restore", bob, zipSync({ "hello.txt": strToU8("hi") }))).status, 400);
        const broken = zipSync({ "lawfive.json": strToU8(JSON.stringify({ format: "lawfive-export" })), "records/venues.json": strToU8("[{\"name\": 5}]") });
        const res = await call("POST", "/v1/restore", bob, broken);
        assert.equal(res.status, 200);
        assert.match(res.body.problems[0], /isn't valid/);
    });
});
