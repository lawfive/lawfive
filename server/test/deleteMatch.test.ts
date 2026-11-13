import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { unzipSync, zipSync } from "fflate";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// RES-8 (Q-21): deleting a match deletes its match report and track, the report marked deleted so
// phones drop it at their next sync; nothing brings them back without the match. And the cleanup
// that ships with it (drizzle/0023), which tidies the reports and tracks older servers left behind.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};
const cleanup = readFileSync(new URL("../drizzle/0023_reports_of_deleted_matches.sql", import.meta.url), "utf8");

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));

async function call(method: string, path: string, token: string, body?: unknown) {
    const raw = body instanceof Uint8Array;
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, authorization: `Bearer ${token}`, "content-type": raw ? "application/zip" : "application/json" },
        body: body === undefined ? undefined : raw ? body as BodyInit : JSON.stringify(body),
    });
    const type = res.headers.get("content-type") ?? "";
    const parsed = type.includes("json") ? await res.json() : new Uint8Array(await res.arrayBuffer());
    checkAnswer(method, path, res.status, parsed, raw ? undefined : body);
    return { status: res.status, body: parsed };
}

async function signUp(email: string) {
    const res = await app.request("/v1/auth/sign-up/email", {
        method: "POST",
        headers: { origin: publicUrl, "content-type": "application/json" },
        body: JSON.stringify({ name: "Delete Tester", email, password: "correct horse battery" }),
    });
    return res.headers.get("set-auth-token") as string;
}

const tracksOf = async (userId?: string) => (await db.select({ id: tables.matchTrack.matchRecordId }).from(tables.matchTrack)
    .where(userId ? eq(tables.matchTrack.userId, userId) : undefined)).map((t) => t.id).sort();

before(() => migrate(db, { migrationsFolder }));

describe("deleting a match", () => {
    let me: string;
    const match = example("Match.quick.json");
    const record = example("MatchRecord.full-match.json");
    const track = example("MatchTrack.short.json");
    // Another played match, which deleting the first leaves as it is.
    const other = { ...match, id: randomUUID() };
    const otherRecord = { ...record, id: randomUUID(), matchId: other.id };
    let exported: Uint8Array;

    test("takes its report and track with it, and the phones hear of both", async () => {
        me = await signUp("deleter@example.com");
        for (const [m, r] of [[match, record], [other, otherRecord]]) {
            assert.equal((await call("PUT", `/v1/matches/${m.id}`, me, m)).status, 201);
            assert.equal((await call("PUT", `/v1/match-records/${r.id}`, me, r)).status, 201);
            assert.equal((await call("PUT", `/v1/match-records/${r.id}/track`, me, track)).status, 201);
        }
        const storageBefore = (await call("GET", "/v1/account/storage", me)).body.usedBytes;
        exported = (await call("GET", "/v1/export", me)).body;
        // What a phone has seen so far.
        const { cursor } = (await call("GET", "/v1/changes?since=0", me)).body;

        assert.equal((await call("DELETE", `/v1/matches/${match.id}`, me)).status, 200);

        const changes = (await call("GET", `/v1/changes?since=${cursor}`, me)).body.changes as { collection: string; record: { id: string; deletedAt?: string } }[];
        const tombstone = (collection: string, id: string) => changes.find((c) => c.collection === collection && c.record.id === id);
        assert.ok(tombstone("matches", match.id)?.record.deletedAt, "the match, marked deleted");
        assert.ok(tombstone("match-records", record.id)?.record.deletedAt, "its report, marked deleted too");
        assert.equal(changes.length, 2, "nothing else changed");

        const report = (await call("GET", `/v1/match-records/${record.id}`, me)).body;
        assert.ok(report.deletedAt);
        assert.deepEqual((await call("GET", "/v1/match-records", me)).body.items.map((r: { id: string }) => r.id), [otherRecord.id]);
        assert.equal((await call("GET", `/v1/match-records/${record.id}/track`, me)).status, 404, "its track is gone");
        assert.equal((await call("GET", `/v1/match-records/${otherRecord.id}/track`, me)).status, 200, "the other match's stays");
        const storageAfter = (await call("GET", "/v1/account/storage", me)).body.usedBytes;
        assert.ok(storageAfter < storageBefore && storageAfter > 0, "the track no longer counts toward storage");

        // Download everything has neither.
        const files = unzipSync((await call("GET", "/v1/export", me)).body);
        const text = (name: string) => JSON.parse(new TextDecoder().decode(files[name]));
        assert.deepEqual(text("records/match-records.json").map((r: { id: string }) => r.id), [otherRecord.id]);
        assert.equal(files[`tracks/${record.id}.json`], undefined);
        assert.ok(files[`tracks/${otherRecord.id}.json`]);

        // Deleting it again is fine, and changes nothing more.
        assert.equal((await call("DELETE", `/v1/matches/${match.id}`, me)).status, 200);
        assert.equal((await call("GET", `/v1/match-records/${record.id}`, me)).body.version, report.version);
    });

    test("a watch sending it again doesn't bring the report or the match back", async () => {
        const watchMatch = randomUUID();
        const scheduled = { kickoff: "2026-11-01T17:00:00Z", timeZone: "UTC", status: "scheduled", format: defaultFormat, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [], role: "referee" };
        assert.equal((await call("PUT", `/v1/matches/${watchMatch}`, me, scheduled)).status, 201);
        const upload = {
            created: 1793520000, matchId: watchMatch, device: "venu2", home: "STR", away: "ROV", homeName: "Strikers", awayName: "Rovers",
            numPeriods: 2, periodSec: 2700, halftimeSec: 900, score: [1, 0], pens: null, events: [["G", 0, 0, 312, 9, null]],
        };
        const sent = await call("POST", "/v1/watch/records", me, upload);
        assert.equal(sent.status, 201);
        assert.equal((await call("DELETE", `/v1/matches/${watchMatch}`, me)).status, 200);

        const again = await call("POST", "/v1/watch/records", me, { ...upload, score: [2, 0] });
        assert.equal(again.status, 200, "told it's saved, so it stops sending it");
        assert.equal(again.body.recordId, sent.body.recordId);
        assert.ok((await call("GET", `/v1/match-records/${sent.body.recordId}`, me)).body.deletedAt);
        assert.ok((await call("GET", `/v1/matches/${watchMatch}`, me)).body.deletedAt);

        // A quick match, deleted, sent again: the same.
        const quick = await call("POST", "/v1/watch/records", me, { ...upload, created: 1793600000, matchId: null });
        assert.equal(quick.status, 201);
        assert.equal((await call("DELETE", `/v1/matches/${quick.body.matchId}`, me)).status, 200);
        assert.equal((await call("POST", "/v1/watch/records", me, { ...upload, created: 1793600000, matchId: null })).status, 200);
        assert.ok((await call("GET", `/v1/matches/${quick.body.matchId}`, me)).body.deletedAt);
        assert.ok((await call("GET", `/v1/match-records/${quick.body.recordId}`, me)).body.deletedAt);
    });

    test("a match deleted before its result arrives comes back played, with it", async () => {
        const deletedFirst = randomUUID();
        const postponed = { kickoff: "2026-11-02T17:00:00Z", timeZone: "UTC", status: "postponed", format: defaultFormat, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [], role: "referee" };
        assert.equal((await call("PUT", `/v1/matches/${deletedFirst}`, me, postponed)).status, 201);
        assert.equal((await call("DELETE", `/v1/matches/${deletedFirst}`, me)).status, 200);
        const sent = await call("POST", "/v1/watch/records", me, {
            created: 1793700000, matchId: deletedFirst, device: "venu2", home: "STR", away: "ROV",
            numPeriods: 2, periodSec: 2700, halftimeSec: 900, score: [0, 0], pens: null, events: [],
        });
        assert.equal(sent.status, 201);
        const back = (await call("GET", `/v1/matches/${deletedFirst}`, me)).body;
        assert.equal(back.deletedAt, undefined);
        assert.equal(back.status, "played");
        assert.equal((await call("GET", `/v1/match-records/${sent.body.recordId}`, me)).body.deletedAt, undefined);
    });

    test("restoring an export from before leaves them deleted, and a report without its match isn't restored", async () => {
        const restored = await call("POST", "/v1/restore", me, exported);
        assert.equal(restored.status, 200);
        assert.ok((await call("GET", `/v1/matches/${match.id}`, me)).body.deletedAt, "deleted after the export, so it stays deleted");
        assert.ok((await call("GET", `/v1/match-records/${record.id}`, me)).body.deletedAt);
        assert.equal((await call("GET", `/v1/match-records/${record.id}/track`, me)).status, 404);

        // An export (as one made before RES-8 could be) with a report whose match isn't in it.
        const fresh = await signUp("fresh@example.com");
        const files = unzipSync(exported);
        const matches = JSON.parse(new TextDecoder().decode(files["records/matches.json"])) as { id: string }[];
        files["records/matches.json"] = new TextEncoder().encode(JSON.stringify(matches.filter((m) => m.id !== match.id)));
        const into = await call("POST", "/v1/restore", fresh, zipSync(files));
        assert.deepEqual(into.body.records["match-records"], { added: 1, updated: 0, unchanged: 1 });
        assert.deepEqual(into.body.tracks, { added: 1, updated: 0, unchanged: 0 }, "only the other report's track");
        assert.equal((await call("GET", `/v1/match-records/${record.id}`, fresh)).status, 404);
        assert.equal((await call("GET", `/v1/match-records/${otherRecord.id}`, fresh)).status, 200);
    });
});

describe("the cleanup of reports left by deleted matches (drizzle/0023)", () => {
    const users = ["cleanup-a", "cleanup-b"];
    const ids = {
        liveMatch: randomUUID(), deletedMatch: randomUUID(), missingMatch: randomUUID(),
        kept: randomUUID(), keptUpper: randomUUID(), noMatch: randomUUID(),
        orphan: randomUUID(), orphanMissing: randomUUID(), orphanDeleted: randomUUID(), otherAccount: randomUUID(),
    };

    async function insert(userId: string, id: string, type: string, data: Record<string, unknown>, deleted = false) {
        await db.insert(tables.records).values({
            userId, id, type, version: 1, seq: sql`nextval('record_seq')`, updatedAt: new Date(), deletedAt: deleted ? new Date() : null, data,
        });
    }
    const report = (matchId?: string) => ({ ...(matchId ? { matchId } : {}), outcome: "completed", periods: [], score: { home: 0, away: 0 }, events: [] });
    const rowsOf = async () => Object.fromEntries((await db.select().from(tables.records).where(eq(tables.records.type, "matchRecord")))
        .map((r) => [r.id, { version: r.version, seq: r.seq, deleted: !!r.deletedAt }]));

    test("deletes the reports and tracks of deleted and missing matches, and nothing else", async () => {
        const [a, b] = users;
        for (const id of users) {
            await db.insert(tables.user).values({ id, name: id, email: `${id}@example.com` });
        }
        await insert(a, ids.liveMatch, "match", { status: "played" });
        await insert(a, ids.deletedMatch, "match", { status: "played" }, true);
        await insert(a, ids.kept, "matchRecord", report(ids.liveMatch));
        await insert(a, ids.keptUpper, "matchRecord", report(ids.liveMatch.toUpperCase()));
        await insert(a, ids.noMatch, "matchRecord", report());
        await insert(a, ids.orphan, "matchRecord", report(ids.deletedMatch));
        await insert(a, ids.orphanMissing, "matchRecord", report(ids.missingMatch));
        // Deleted on its own before, its track kept: its match is deleted now, so the track goes.
        await insert(a, ids.orphanDeleted, "matchRecord", report(ids.deletedMatch), true);
        // Another account's report can't belong to this account's match.
        await insert(b, ids.otherAccount, "matchRecord", report(ids.liveMatch));
        for (const [userId, id] of [[a, ids.kept], [a, ids.keptUpper], [a, ids.noMatch], [a, ids.orphan], [a, ids.orphanMissing], [a, ids.orphanDeleted], [b, ids.otherAccount]]) {
            await db.insert(tables.matchTrack).values({ userId, matchRecordId: id, source: "lawfive", data: Buffer.from("track"), updatedAt: new Date() });
        }
        const before = await rowsOf();
        const [{ last }] = (await db.execute(sql`select last_value::bigint as last from record_seq`)).rows as { last: number }[];

        await pg.exec(cleanup);

        const after = await rowsOf();
        for (const id of [ids.kept, ids.keptUpper, ids.noMatch]) {
            assert.deepEqual(after[id], before[id], "a report of a live match, or of none, is left as it was");
        }
        for (const id of [ids.orphan, ids.orphanMissing, ids.otherAccount]) {
            assert.equal(after[id].deleted, true);
            assert.equal(after[id].version, before[id].version + 1, "a new version");
            assert.ok(after[id].seq > Number(last), "and a new sync number, so phones hear of it");
        }
        assert.deepEqual(after[ids.orphanDeleted], before[ids.orphanDeleted], "already deleted: marked again it isn't");
        assert.deepEqual(await tracksOf(a), [ids.kept, ids.keptUpper, ids.noMatch].sort());
        assert.deepEqual(await tracksOf(b), []);
        const [live] = await db.select().from(tables.records).where(and(eq(tables.records.userId, a), eq(tables.records.id, ids.liveMatch)));
        assert.equal(live.deletedAt, null, "matches aren't touched");

        // Run again (it's in a migration, so it runs once; but if it ran again), it changes nothing.
        await pg.exec(cleanup);
        assert.deepEqual(await rowsOf(), after);
    });

    test("ran once when the server updated: migrations record it", async () => {
        const [row] = (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)).rows as { n: number }[];
        const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { tag: string }[] };
        assert.equal(row.n, journal.entries.length);
        assert.ok(journal.entries.some((e) => e.tag === "0023_reports_of_deleted_matches"));
    });
});
