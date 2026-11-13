import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// SYNC-14: which upcoming matches are on which linked watch, from each watch's latest download.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));
const venu2 = { "x-lawfive-device": "garmin; model=006-B3703-00; firmware=12.30; app=2026.10.30" };

async function call(method: string, path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, headers: res.headers };
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const match = (kickoff: string, home: string) => ({
    status: "scheduled", kickoff, home: { name: home }, away: { name: "Rovers" }, crew: [],
    format: { periods: 2, periodSec: 2700, breakSec: 900, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 11, clock: "up", trackStoppage: false, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false },
});

let browser: string;
let watch: string;
const [first, second, third] = [randomUUID(), randomUUID(), randomUUID()];
const onWatches = async () => (await call("GET", "/v1/devices/matches", browser)).body.matches as { matchId: string; name: string; kind: string; since: string; syncedAt: string; upToDate: boolean; deviceId: string }[];
const of = async (id: string) => (await onWatches()).find((m) => m.matchId === id);
const download = (query = "") => call("GET", `/v1/watch/matches${query}`, watch, undefined, venu2);
const save = async (id: string, data: Record<string, unknown>) => {
    const current = await call("GET", `/v1/matches/${id}`, browser);
    const { version, updatedAt, ...rest } = current.status === 200 ? current.body : { version: undefined, updatedAt: undefined };
    const saved = await call("PUT", `/v1/matches/${id}`, browser, { ...rest, ...data, id, ...(version ? { version } : {}) });
    assert.ok(saved.status < 300, JSON.stringify(saved.body));
    return saved;
};

before(async () => {
    await migrate(db, { migrationsFolder });
    const up = await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Lee", email: "sam@example.com", password: "correct horse battery" });
    browser = up.headers.get("set-auth-token")!;
    // A watch's link, as a code approved on the website makes one (SEC-13), without waiting for its polling.
    const signedIn = await call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password: "correct horse battery" }, venu2);
    watch = signedIn.headers.get("set-auth-token")!;
    // The header's token is signed: the session's own token is before the dot.
    const [linked] = await db.update(tables.session).set({ scope: "watch" }).where(eq(tables.session.token, watch.split(".")[0])).returning();
    assert.ok(linked);
    await save(first, match(inDays(1), "Strikers"));
    await save(second, match(inDays(2), "United"));
});

describe("on your watch (SYNC-14)", () => {
    test("nothing until a watch downloads; then each match it got, under the watch's name", async () => {
        assert.deepEqual(await onWatches(), []);
        // The website, or a phone's own session, asking isn't a watch.
        await call("GET", "/v1/watch/matches", browser);
        assert.deepEqual(await onWatches(), []);
        assert.equal((await download()).body.matches.length, 2);
        const list = await onWatches();
        assert.deepEqual(list.map((m) => m.matchId).sort(), [first, second].sort());
        assert.ok(list.every((m) => m.upToDate && m.name === "Garmin Venu 2" && m.kind === "garmin" && m.since === m.syncedAt));
    });

    test("the phone fetching ahead for the watch doesn't count as the watch having them", async () => {
        await save(third, match(inDays(3), "City"));
        assert.equal((await download("?prefetch=true")).body.matches.length, 3);
        assert.equal(await of(third), undefined);
        await download();
        assert.ok((await of(third))?.upToDate);
    });

    test("a change the watch shows makes its copy an older one, until it syncs again", async () => {
        const before = (await of(first))!;
        await save(first, { tags: ["needs AR"] });
        assert.equal((await of(first))!.upToDate, true, "tags aren't on the watch");
        await save(first, { kickoff: inDays(1.5) });
        assert.equal((await of(first))!.upToDate, false);
        await new Promise((resolve) => setTimeout(resolve, 5));
        await download();
        const after = (await of(first))!;
        assert.equal(after.upToDate, true);
        assert.ok(after.since > before.since, "since the new version");
    });

    test("canceled is no longer up to date, and the next download takes it off; a deleted match isn't listed", async () => {
        // The schema's value keeps its old spelling.
        assert.equal((await save(second, { status: "cancelled" })).status, 200);
        assert.equal((await of(second))!.upToDate, false);
        await download();
        assert.equal(await of(second), undefined);
        assert.equal((await call("DELETE", `/v1/matches/${third}`, browser)).status, 200);
        assert.equal(await of(third), undefined);
    });

    test("unlinking the watch clears it", async () => {
        const { deviceId } = (await of(first))!;
        assert.equal((await call("DELETE", `/v1/devices/${deviceId}`, browser)).status, 200);
        assert.deepEqual(await onWatches(), []);
    });
});
