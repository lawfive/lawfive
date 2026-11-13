import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// Tracks (TRK-1 to TRK-4): uploaded for a match report, fetched with figures over its periods,
// replaced and deleted; API keys need match-records access.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));

async function call(method: string, path: string, token: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed };
}

/** Two minutes of a period, as the example match report's first period: running north at 2 m/s, heart rate climbing. */
function trackFor(kickoff: string) {
    const start = new Date(Date.parse(kickoff) - 60_000).toISOString();
    const t = Array.from({ length: 180 }, (_, i) => i * 1000);
    return {
        source: { kind: "lawfive", device: "garmin:venu2" },
        start,
        gps: { t, lat: t.map((ms) => 33.6 + (ms / 1000) * 2 / 111_195), lon: t.map(() => -117.6) },
        heartRate: { t, bpm: t.map((ms) => (ms < 60_000 ? 100 : 150)) },
    };
}

before(() => migrate(db, { migrationsFolder }));

describe("tracks", () => {
    let session: string;
    const record = example("MatchRecord.full-match.json");
    const path = `/v1/match-records/${record.id}/track`;
    const track = trackFor(record.periods[0].startedAt);

    test("a match report's track is stored, with figures over its periods", async () => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Track Tester", email: "tracks@example.com", password: "correct horse battery" }),
        });
        session = res.headers.get("set-auth-token") as string;
        assert.equal((await call("PUT", path, session, track)).status, 404, "no match report yet");
        assert.equal((await call("PUT", `/v1/match-records/${record.id}`, session, record)).status, 201);
        assert.equal((await call("GET", path, session)).status, 404, "no track yet");

        const stored = await call("PUT", path, session, track);
        assert.equal(stored.status, 201);
        // The first minute is before kickoff, so only the points from 60 s to 179 s count: 119 steps of 2 m, at 150 bpm.
        assert.equal(stored.body.summary.covers, "periods");
        assert.equal(stored.body.summary.total.distanceM, 238);
        assert.equal(stored.body.summary.total.avgBpm, 150);
        assert.deepEqual(stored.body.summary.periods.map((p: { period: number }) => p.period), [1, 2]);
        assert.equal(stored.body.summary.periods[1].distanceM, undefined, "the track ends before the second period");

        const fetched = await call("GET", path, session);
        assert.deepEqual(fetched.body.track, track, "comes back as sent");
        assert.deepEqual(fetched.body.summary, stored.body.summary);
        assert.equal(fetched.body.summary.total.zones, undefined, "no zones without a maximum heart rate");
    });

    test("zones follow the maximum heart rate in Settings", async () => {
        const settings = { ...example("UserSettings.json"), maxHeartRate: 180 };
        assert.equal((await call("PUT", `/v1/settings/${settings.id}`, session, settings)).status, 201);
        const { body } = await call("GET", path, session);
        assert.equal(body.summary.maxHeartRate, 180);
        // 150 is 83% of 180: zone 4.
        assert.deepEqual(body.summary.total.zones.map((z: { sec: number }) => Math.round(z.sec)), [0, 0, 0, 120, 0]);
    });

    test("the speed bands follow the sprint speed in Settings (TRK-11)", async () => {
        const before = (await call("GET", path, session)).body.summary;
        assert.equal(before.sprintKph, 21);
        const settings = { ...example("UserSettings.json"), maxHeartRate: 180, sprintKph: 15 };
        const saved = await call("GET", `/v1/settings/${settings.id}`, session);
        assert.equal((await call("PUT", `/v1/settings/${settings.id}`, session, { ...settings, version: saved.body.version })).status, 200);
        const after = (await call("GET", path, session)).body.summary;
        assert.equal(after.sprintKph, 15);
        const sec = (s: { speedBands: { band: string; sec: number }[] }, band: string) => s.speedBands.find((b) => b.band === band)!.sec;
        assert.ok(sec(after.total, "sprinting") >= sec(before.total, "sprinting"), "a lower sprint speed puts at least as much time in sprinting");
        assert.equal(after.total.distanceM, before.total.distanceM, "distance doesn't change");
    });

    test("the pitch is found from the track, and can be marked by hand (TRK-9)", async () => {
        const found = (await call("GET", path, session)).body;
        assert.equal(found.pitch.by, "auto", "found from where the referee went");
        assert.equal(found.track.pitch, undefined, "not stored");
        // For the phone apps, the heatmap's grid comes with it; its cells hold the periods' time.
        assert.ok(found.heat.cols > 0 && found.heat.rows > 0 && found.heat.total.length === found.heat.cols * found.heat.rows);
        assert.ok(found.heat.total.reduce((a: number, b: number) => a + b, 0) > 0);
        const pitch = { corners: [{ lat: 33.6, lon: -117.6 }, { lat: 33.6009, lon: -117.6 }], centre: { lat: 33.60045, lon: -117.59965 } };
        const marked = await call("PUT", `${path}/pitch`, session, { ...pitch, by: "auto" });
        assert.equal(marked.status, 200);
        assert.deepEqual(marked.body.pitch, { ...pitch, by: "referee" }, "always marked by the referee");
        const after = (await call("GET", path, session)).body;
        assert.deepEqual(after.track.pitch, { ...pitch, by: "referee" });
        assert.deepEqual(after.pitch, after.track.pitch);
        assert.equal((await call("PUT", `${path}/pitch`, session, { centre: pitch.centre })).status, 400);
        const cleared = await call("DELETE", `${path}/pitch`, session);
        assert.equal(cleared.body.pitch.by, "auto", "back to the one found");
        assert.equal((await call("GET", path, session)).body.track.pitch, undefined);
        assert.equal((await call("PUT", `/v1/match-records/00000000-0000-4000-8000-000000000000/track/pitch`, session, pitch)).status, 404);

        // A fourth official stays by the technical area: no pitch is found for them.
        const match = example("Match.quick.json");
        assert.equal(match.id, record.matchId);
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, session, { ...match, role: "fourth" })).status, 201);
        assert.equal((await call("GET", path, session)).body.pitch, undefined, "no pitch for a fourth official");
        assert.equal((await call("GET", path, session)).body.heat, undefined, "nor a heatmap");
        const saved = (await call("GET", `/v1/matches/${match.id}`, session)).body;
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, session, { ...saved, role: "referee" })).status, 200);
        assert.equal((await call("GET", path, session)).body.pitch.by, "auto");
    });

    test("uploading again replaces it; bad tracks are refused", async () => {
        const heartOnly = { source: { kind: "refsix" }, start: track.start, heartRate: track.heartRate };
        assert.equal((await call("PUT", path, session, heartOnly)).status, 200);
        const { body } = await call("GET", path, session);
        assert.equal(body.track.gps, undefined);
        assert.equal(body.summary.total.distanceM, undefined);

        const uneven = await call("PUT", path, session, { ...track, gps: { ...track.gps, lon: [0] } });
        assert.equal(uneven.status, 400);
        assert.deepEqual(uneven.body.issues.map((i: { path: string[] }) => i.path.join(".")), ["gps.lon"]);
        assert.equal((await call("PUT", path, session, { source: { kind: "other" }, start: track.start })).status, 400, "needs GPS or heart rate");
    });

    test("API keys need match-records access", async () => {
        const reader = (await call("POST", "/v1/api-keys", session, { name: "Read reports", scopes: ["match-records:read"] })).body.key;
        const other = (await call("POST", "/v1/api-keys", session, { name: "Matches only", scopes: ["matches:write"] })).body.key;
        assert.equal((await call("GET", path, reader)).status, 200);
        assert.match((await call("PUT", path, reader, track)).body.error, /match-records:write/);
        assert.match((await call("GET", path, other)).body.error, /match-records:read/);
    });

    test("deleting it leaves the match report; other accounts can't see it", async () => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Someone Else", email: "else@example.com", password: "correct horse battery" }),
        });
        const stranger = res.headers.get("set-auth-token") as string;
        assert.equal((await call("GET", path, stranger)).status, 404);
        assert.equal((await call("DELETE", path, stranger)).status, 404);
        assert.equal((await call("DELETE", path, session)).status, 200);
        assert.equal((await call("GET", path, session)).status, 404);
        assert.equal((await call("DELETE", path, session)).status, 404);
        assert.equal((await call("GET", `/v1/match-records/${record.id}`, session)).status, 200);
    });
});
