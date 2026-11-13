import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// Correcting a played match's result (RES-1 to RES-4): the server keeps the watch's recording the
// first time it's corrected, notes when, and a watch sending the match again changes nothing.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
await migrate(db, { migrationsFolder });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), {
    access: { signUp: "open", adminEmails: [], publicUrl },
});

async function call(method: string, path: string, token: string | undefined, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed };
}

describe("correcting a result", () => {
    let me: string;
    const matchId = randomUUID();
    let recordId: string;
    const upload = {
        created: 1793520000, matchId, device: "venu2", home: "STR", away: "ROV", homeName: "Strikers", awayName: "Rovers",
        numPeriods: 2, periodSec: 2700, halftimeSec: 900, score: [1, 0], pens: null,
        events: [["G", 0, 0, 312, 9, null], ["Y", 1, 1, 600, 4, null]],
    };
    const strip = ({ id: _i, version: _v, updatedAt: _u, deletedAt: _d, ...rest }: Record<string, unknown>) => rest;

    test("a watch's match arrives uncorrected", async () => {
        const up = await app.request("/v1/auth/sign-up/email", {
            method: "POST", headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Ref", email: "ref@example.com", password: "correct horse battery" }),
        });
        me = up.headers.get("set-auth-token") as string;
        const match = { kickoff: "2026-11-01T17:00:00Z", timeZone: "UTC", status: "scheduled", format: defaultFormat, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [], role: "referee" };
        assert.equal((await call("PUT", `/v1/matches/${matchId}`, me, match)).status, 201);
        const res = await call("POST", "/v1/watch/records", me, upload);
        assert.equal(res.status, 201);
        recordId = res.body.recordId;
        const record = (await call("GET", `/v1/match-records/${recordId}`, me)).body;
        assert.equal(record.editedAt, undefined);
        assert.equal(record.original, undefined);
    });

    test("correcting it keeps what the watch recorded, and notes when (RES-1, RES-3)", async () => {
        const before = (await call("GET", `/v1/match-records/${recordId}`, me)).body;
        const caution = before.events[1];
        const corrected = {
            ...strip(before),
            score: { home: 1, away: 1 },
            events: [before.events[0], { ...caution, misconduct: { scheme: "ussf", code: "UB" } }, { type: "goal", when: "play", team: "away", period: 2, periodSec: 1500, player: 11 }],
            editedAt: "2000-01-01T00:00:00Z", original: { outcome: "completed", score: { home: 9, away: 9 }, events: [] },
        };
        const saved = await call("PUT", `/v1/match-records/${recordId}`, me, { ...corrected, version: before.version });
        assert.equal(saved.status, 200);
        assert.ok(Date.parse(saved.body.editedAt) > Date.now() - 60_000, "the server's own time, not the one sent");
        assert.deepEqual(saved.body.original.score, { home: 1, away: 0 }, "the watch's, not the one sent");
        assert.equal(saved.body.original.events.length, 2);
        assert.equal(saved.body.original.events[1].misconduct, undefined);

        // Correcting again keeps the first recording, not the first correction.
        const again = await call("PUT", `/v1/match-records/${recordId}`, me, { ...strip(saved.body), events: saved.body.events.slice(0, 2), score: { home: 1, away: 0 }, version: saved.body.version });
        assert.deepEqual(again.body.original.events.length, 2);
        assert.equal(again.body.original.events[1].misconduct, undefined);
        assert.equal(again.body.events[1].misconduct.code, "UB");
        // Saving something else on it (as adding a track does) keeps both.
        const unchanged = await call("PUT", `/v1/match-records/${recordId}`, me, { ...strip(again.body), distanceM: 6000, version: again.body.version });
        assert.equal(unchanged.body.editedAt, again.body.editedAt);
        assert.ok(unchanged.body.original);
    });

    test("the watch sending the match again changes nothing (RES-4)", async () => {
        const before = (await call("GET", `/v1/match-records/${recordId}`, me)).body;
        const res = await call("POST", "/v1/watch/records", me, { ...upload, score: [5, 5] });
        assert.equal(res.status, 200);
        assert.equal(res.body.recordId, recordId);
        const after = (await call("GET", `/v1/match-records/${recordId}`, me)).body;
        assert.equal(after.version, before.version);
        assert.deepEqual(after.score, before.score);
    });

    test("putting the watch's recording back clears the correction", async () => {
        const before = (await call("GET", `/v1/match-records/${recordId}`, me)).body;
        const { original } = before;
        const reverted = await call("PUT", `/v1/match-records/${recordId}`, me, { ...strip(before), ...original, version: before.version });
        assert.equal(reverted.body.editedAt, undefined);
        assert.equal(reverted.body.original, undefined);
        assert.equal(reverted.body.events[1].misconduct, undefined);
    });

    test("a result entered without a watch has no recording to keep (RES-2)", async () => {
        const id = randomUUID();
        const entered = { matchId, outcome: "completed", periods: [{ period: 1, extraTime: false, playedSec: 2700 }, { period: 2, extraTime: false, playedSec: 2700 }], score: { home: 2, away: 0 }, events: [] };
        assert.equal((await call("PUT", `/v1/match-records/${id}`, me, entered)).status, 201);
        const fixed = await call("PUT", `/v1/match-records/${id}`, me, { ...entered, score: { home: 2, away: 1 }, version: 1 });
        assert.ok(fixed.body.editedAt);
        assert.equal(fixed.body.original, undefined);
    });
});
