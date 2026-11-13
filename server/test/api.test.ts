import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { readDeviceHeader } from "../src/devices.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";
import { addedTimeSec } from "@lawfive/schema";

// The API against PGlite (Postgres in-process), from sign-up to sync.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const collections: Record<string, string> = {
    Match: "matches",
    MatchTemplate: "match-templates",
    MatchRecord: "match-records",
    Venue: "venues",
    Competition: "competitions",
    Referee: "referees",
    UserSettings: "settings",
};

/** An example record from schema/examples, without the fields the server sets. */
function example(file: string): Record<string, unknown> {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
}

// A stand-in for Nominatim, counting requests so the cache can be checked.
let geocoderRequests = 0;
const geocoder = createServer((req, res) => {
    geocoderRequests++;
    const q = new URL(req.url ?? "", "http://x").searchParams.get("q");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ display_name: `${q}, Sunnyvale`, lat: "37.41", lon: "-122.01" }]));
});

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, token?: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await app.request(path, {
        method,
        headers: {
            origin: publicUrl,
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, headers: res.headers };
}

async function signUp(email: string): Promise<string> {
    const res = await call("POST", "/v1/auth/sign-up/email", undefined, { email, password: "correct horse battery", name: "Test Ref" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const token = res.headers.get("set-auth-token");
    assert.ok(token, "sign-up returns a bearer token");
    return token;
}

before(async () => {
    await migrate(db, { migrationsFolder });
    await new Promise<void>((resolve) => geocoder.listen(0, resolve));
    const geocoderUrl = `http://localhost:${(geocoder.address() as AddressInfo).port}`;
    app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { geocoderUrl, version: { version: "2026.10.30", commit: "f5de635" } });
});

after(() => geocoder.close());

describe("server", () => {
    let alice: string;
    let bob: string;
    const match = example("Match.planned.json");
    const matchId = match.id as string;

    test("health and meta need no sign-in", async () => {
        assert.equal((await call("GET", "/health")).body, "ok");
        const meta = await call("GET", "/v1/meta");
        assert.equal(meta.body.apiVersion, 1);
        assert.equal(meta.body.version, "2026.10.30", "the server's version (VER-1)");
        assert.equal(meta.body.commit, "f5de635");
        assert.match(meta.body.maps.tileUrl, /\{z\}/, "map tiles are configurable");
        assert.equal(meta.body.maps.satellite, undefined, "satellite only when a provider is set up");
        assert.ok(meta.body.capabilities.includes("geocode"));
    });

    test("records need a signed-in user", async () => {
        assert.equal((await call("GET", "/v1/matches")).status, 401);
        assert.equal((await call("GET", "/v1/matches", "not-a-token")).status, 401);
    });

    test("users can sign up", async () => {
        alice = await signUp("alice@example.com");
        bob = await signUp("bob@example.com");
    });

    test("apps can sign in without a browser Origin header", async () => {
        const res = await app.request("/v1/auth/sign-in/email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email: "alice@example.com", password: "correct horse battery" }),
        });
        assert.equal(res.status, 200);
        const token = res.headers.get("set-auth-token");
        assert.ok(token);
        assert.equal((await call("GET", "/v1/matches", token)).status, 200);
    });

    test("every example record can be stored and read back unchanged", async () => {
        for (const file of readdirSync(examples)) {
            const collection = collections[file.split(".")[0]];
            if (!collection) {
                continue;
            }
            const record = example(file);
            const put = await call("PUT", `/v1/${collection}/${record.id}`, alice, record);
            assert.equal(put.status, 201, `${file}: ${JSON.stringify(put.body)}`);
            assert.equal(put.body.version, 1);
            const got = await call("GET", `/v1/${collection}/${record.id}`, alice);
            const { version, updatedAt, ...stored } = got.body;
            assert.deepEqual(stored, record, file);
        }
        const list = await call("GET", "/v1/matches", alice);
        assert.equal(list.body.items.length, 2);
    });

    test("an update needs the version last seen", async () => {
        const changed = { ...match, notes: "Bring the spare whistle.", version: 1 };
        const ok = await call("PUT", `/v1/matches/${matchId}`, alice, changed);
        assert.equal(ok.status, 200);
        assert.equal(ok.body.version, 2);
        const stale = await call("PUT", `/v1/matches/${matchId}`, alice, { ...match, notes: "Older edit", version: 1 });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.current.notes, "Bring the spare whistle.");
    });

    test("invalid records are rejected with the problems listed", async () => {
        const res = await call("PUT", `/v1/matches/${matchId}`, alice, { ...match, version: 2, status: "maybe" });
        assert.equal(res.status, 400);
        assert.equal(res.body.issues[0].path[0], "status");
        assert.equal((await call("PUT", "/v1/matches/not-a-uuid", alice, match)).status, 400);
        const otherId = "7a1c6a3e-2a4b-4c55-9d1e-0f6b8c2d3e4f";
        assert.equal((await call("PUT", `/v1/matches/${otherId}`, alice, match)).status, 400, "id in body must match the URL");
    });

    test("an id can't be reused for another kind of record", async () => {
        const res = await call("PUT", `/v1/venues/${matchId}`, alice, { ...example("Venue.complex.json"), id: matchId });
        assert.equal(res.status, 409);
    });

    test("a match's external ID is unique per user and source", async () => {
        const copy = { ...match, id: "1b6f3d52-8c7e-4a1f-9b2d-5e4c3a2b1f0e" };
        assert.equal((await call("PUT", `/v1/matches/${copy.id}`, alice, copy)).status, 409);
        const otherSource = { ...copy, external: { source: "manual", id: "BYL-2026-1142" } };
        assert.equal((await call("PUT", `/v1/matches/${copy.id}`, alice, otherSource)).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${matchId}`, bob, match)).status, 201, "another user can use it");
    });

    test("one settings record per user", async () => {
        const second = { ...example("UserSettings.json"), id: "0c7d2b9e-6f1a-4e3b-8a5d-9c2e4f6b1a7d" };
        const res = await call("PUT", `/v1/settings/${second.id}`, alice, second);
        assert.equal(res.status, 409);
        assert.match(res.body.error, /settings already exist/);
        assert.equal((await call("PUT", `/v1/settings/${second.id}`, bob, second)).status, 201, "each user has their own");
    });

    test("users only see their own records", async () => {
        const bobsMatch = await call("GET", `/v1/matches/${matchId}`, bob);
        assert.equal(bobsMatch.body.version, 1, "bob's own copy, not alice's");
        const venue = example("Venue.complex.json");
        assert.equal((await call("GET", `/v1/venues/${venue.id}`, bob)).status, 404);
        assert.equal((await call("GET", "/v1/venues", bob)).body.items.length, 0);
    });

    test("a watch downloads its next matches in its own shape", async () => {
        const soon = { ...match, id: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", kickoff: new Date(Date.now() + 86_400_000).toISOString(), external: undefined };
        assert.equal((await call("PUT", `/v1/matches/${soon.id}`, bob, soon)).status, 201);
        const res = await call("GET", "/v1/watch/matches", bob);
        assert.equal(res.status, 200);
        assert.equal(res.body.serverVersion, "2026.10.30", "for the watch's About screen (VER-3)");
        const next = res.body.matches.find((m: { id: string }) => m.id === soon.id);
        assert.ok(next, "tomorrow's match is there");
        assert.equal(next.title, "STR v ROV");
        assert.equal(next.homeColor, 0xC8102E);
        assert.equal(next.periodSec, 30 * 60);
        assert.equal(next.midBreak, true);
        assert.equal(next.sinBins, false, "off for a format saved before sin bins (EVT-12)");
        assert.equal(next.sinBinSec, 600);
        assert.equal(next.clockStyle, 2, "count down");
        assert.equal(next.goldenGoal, false, "ET-6: off unless switched on, with extra time");
        assert.equal(next.kickoff, Math.floor(new Date(soon.kickoff).getTime() / 1000));
        assert.ok(!res.body.matches.some((m: { id: string }) => m.id === "00000000-0000-0000-0000-000000000000"));
        const pastOnly = await call("GET", "/v1/watch/matches?limit=50", bob);
        assert.ok(pastOnly.body.matches.length <= 10, "never more than ten");
        // UI-19: the fee, the other officials (a saved referee Bob doesn't have is left out) and the notes.
        assert.deepEqual(next.fee, { text: "$40", paid: false });
        assert.deepEqual(next.crew, [["AR2", "Jordan Lee"]]);
        assert.equal(next.notes, match.notes);
    });

    test("the watch's Paid toggle marks the fee paid, unless the match changed since (SYNC-11)", async () => {
        const soonId = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
        const now = Math.floor(Date.now() / 1000) + 5;
        const paid = await call("POST", "/v1/watch/fee", bob, { matchId: soonId, paid: true, at: now });
        assert.deepEqual(paid.body, { paid: true, applied: true });
        const saved = (await call("GET", `/v1/matches/${soonId}`, bob)).body;
        assert.equal(saved.fee.paid, true);
        assert.equal(saved.fee.amount, 40, "nothing else changes");
        // A toggle made before the website's last change loses to it.
        const stale = await call("POST", "/v1/watch/fee", bob, { matchId: soonId, paid: false, at: now - 3600 });
        assert.deepEqual(stale.body, { paid: true, applied: false });
        assert.equal((await call("POST", "/v1/watch/fee", bob, { matchId: "00000000-0000-4000-8000-000000000000", paid: true, at: now })).status, 404);
        assert.equal((await call("POST", "/v1/watch/fee", bob, { matchId: soonId })).status, 400);
        // Back as it was, for the tests after this.
        assert.deepEqual((await call("POST", "/v1/watch/fee", bob, { matchId: soonId, paid: false, at: now + 60 })).body, { paid: false, applied: true });
    });

    test("the match screen: the latest change wins, on the watch, the website or a phone (UI-24)", async () => {
        const chosen = async () => (await call("GET", "/v1/watch/matches", bob)).body.screen;
        const now = Math.floor(Date.now() / 1000);
        const id = (await call("GET", "/v1/settings", bob)).body.items[0].id;
        assert.equal(await chosen(), undefined, "not until it's chosen");
        const one = { clocks: "one", mainClock: "up", breakClock: "down", edge: "ring", names: true };

        // From a watch build from before UI-21's choices, then in the form a watch reads.
        assert.deepEqual((await call("POST", "/v1/watch/screen", bob, { layout: "ring", secondClock: "up", at: now })).body, { applied: true });
        assert.deepEqual(await chosen(), { layout: "ring", secondClock: "down", ...one, at: now }, "never the match clock's style (UI-22)");
        const saved = (await call("GET", `/v1/settings/${id}`, bob)).body;
        assert.equal(saved.watchScreen.layout, "ring");
        assert.equal(saved.watchScreen.edge, "ring");
        assert.equal(saved.currency, "USD", "nothing else changes");

        // A change on the website wins over an older one from the watch, and a newer one over it.
        const changedAt = new Date((now + 60) * 1000).toISOString();
        const { updatedAt: _u, ...draft } = saved;
        const web = { layout: "minimal", secondClock: "upEach", clocks: "stacked", mainClock: "down", breakClock: "up", edge: "time", names: false, changedAt };
        assert.equal((await call("PUT", `/v1/settings/${id}`, bob, { ...draft, watchScreen: web })).status, 200);
        assert.deepEqual((await call("POST", "/v1/watch/screen", bob, { layout: "ring", secondClock: "up", at: now + 30 })).body, { applied: false });
        // The nearest old layout is worked out again, whatever the website saved.
        assert.deepEqual(await chosen(), { layout: "stacked", secondClock: "upEach", clocks: "stacked", mainClock: "down", breakClock: "up", edge: "time", names: false, at: now + 60 });
        // TMR-11: older watch builds get the account's match clock with each planned match.
        const listed = (await call("GET", "/v1/watch/matches", bob)).body.matches;
        assert.ok(listed.length > 0 && listed.every((m: { clockStyle: number }) => m.clockStyle === 2));

        // An older build changes the clocks it knows about and leaves how they count alone.
        assert.deepEqual((await call("POST", "/v1/watch/screen", bob, { layout: "sideBySide", secondClock: "up", at: now + 90 })).body, { applied: true });
        assert.deepEqual(await chosen(), { layout: "sideBySide", secondClock: "up", clocks: "sideBySide", mainClock: "down", breakClock: "up", edge: "none", names: true, at: now + 90 });
        // A newer one sends everything.
        const watch = { layout: "default", secondClock: "down", clocks: "one", mainClock: "upEach", breakClock: "down", edge: "time", names: true, at: now + 120 };
        assert.deepEqual((await call("POST", "/v1/watch/screen", bob, watch)).body, { applied: true });
        assert.deepEqual(await chosen(), watch);
        assert.equal((await call("POST", "/v1/watch/screen", bob, { layout: "sideways", secondClock: "up", at: now + 150 })).status, 400);
        assert.equal((await call("POST", "/v1/watch/screen", bob, { ...watch, edge: "glow", at: now + 150 })).status, 400);
    });

    test("the team swipes go to the watches once they're set (INP-10)", async () => {
        const swipes = async () => (await call("GET", "/v1/watch/matches", bob)).body.teamSwipes;
        assert.equal(await swipes(), undefined, "not until they're set");
        const { updatedAt: _u, ...draft } = (await call("GET", "/v1/settings", bob)).body.items[0];
        assert.equal((await call("PUT", `/v1/settings/${draft.id}`, bob, { ...draft, teamSwipes: "sideways" })).status, 200);
        assert.equal(await swipes(), "sideways");
        assert.equal((await call("PUT", `/v1/settings/${draft.id}`, bob, { ...draft, teamSwipes: "diagonal" })).status, 400);
    });

    // EVT-14.
    test("the account's misconduct codes go to the watch, with each match's (its competition's, else the account's)", async () => {
        const body = (await call("GET", "/v1/watch/matches", bob)).body;
        const { items: [settings] } = (await call("GET", "/v1/settings", bob)).body;
        assert.equal(body.misconductScheme, settings.misconductScheme);
        assert.ok(body.matches.length > 0);
        for (const m of body.matches) {
            assert.ok(["ifab", "ussf", "fa"].includes(m.misconductScheme), `${m.id}: ${m.misconductScheme}`);
        }
        const { updatedAt: _u, ...draft } = settings;
        assert.equal((await call("PUT", `/v1/settings/${draft.id}`, bob, { ...draft, misconductScheme: "fa" })).status, 200);
        const after = (await call("GET", "/v1/watch/matches", bob)).body;
        assert.equal(after.misconductScheme, "fa");
        assert.ok(after.matches.some((m: { misconductScheme: string }) => m.misconductScheme === "fa"), "a match without a competition's own takes the account's");
        const { updatedAt: _v, ...changed } = (await call("GET", "/v1/settings", bob)).body.items[0];
        assert.equal((await call("PUT", `/v1/settings/${draft.id}`, bob, { ...changed, misconductScheme: settings.misconductScheme })).status, 200);
    });

    test("pitch corners from the watch are kept with the match and its venue's pitch (SYNC-12, TRK-13)", async () => {
        const soonId = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
        const venue = example("Venue.complex.json");
        assert.equal((await call("PUT", `/v1/venues/${venue.id}`, bob, venue)).status, 201);
        const corners = [[37_500_123, -122_300_123], [37_500_923, -122_300_123], [37_500_923, -122_299_401]];
        const at = Math.floor(Date.now() / 1000);
        const res = await call("POST", "/v1/watch/pitch", bob, { matchId: soonId, corners, at });
        assert.deepEqual(res.body, { ok: true, pitch: true });
        const saved = (await call("GET", `/v1/matches/${soonId}`, bob)).body;
        assert.deepEqual(saved.pitchMarking.corners[0], { lat: 37.500123, lon: -122.300123 }, "to the millionth of a degree");
        assert.equal(saved.fee.amount, 40, "nothing else changes");
        const pitchOf = async () => (await call("GET", `/v1/venues/${venue.id}`, bob)).body.pitches.find((p: { id: string }) => p.id === saved.pitchId);
        assert.equal((await pitchOf()).markings.length, 1);
        // Marked again for the same match: it replaces the first, on the match and the pitch.
        await call("POST", "/v1/watch/pitch", bob, { matchId: soonId, corners: corners.slice(0, 2), at: at + 60 });
        assert.equal((await pitchOf()).markings.length, 1);
        assert.equal((await pitchOf()).markings[0].corners.length, 2);
        assert.equal((await call("POST", "/v1/watch/pitch", bob, { created: 1, corners, at })).status, 404, "no quick match started then");
        assert.equal((await call("POST", "/v1/watch/pitch", bob, { corners, at })).status, 400, "which match?");
        assert.equal((await call("POST", "/v1/watch/pitch", bob, { matchId: soonId, corners: corners.slice(0, 1), at })).status, 400, "two at least");
    });

    // EVT-11.
    test("a watch uploads an abandoned match, with its reason and the score as it stood", async () => {
        const res = await call("POST", "/v1/watch/records", bob, {
            created: 1793600123, device: "venu2", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, teamSize: 9, breakAtSec: 840, breakLenSec: 120,
            extraTime: false, etPeriods: 2, etPeriodSec: 900, penalties: false, clockStyle: 2, trackStoppage: true, goalScorers: true, goalTypes: false,
            score: [1, 0], pens: null,
            events: [["G", 0, 0, 300, 9, null], ["E", -1, 0, 1200, null, null], ["A", -1, 0, 1200, null, 1]],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = await call("GET", `/v1/match-records/${res.body.recordId}`, bob);
        assert.equal(record.body.outcome, "abandoned");
        assert.deepEqual(record.body.score, { home: 1, away: 0 });
        assert.deepEqual(record.body.events.at(-1), { type: "abandonment", when: "play", period: 1, periodSec: 1200, reason: "lightning" });
        assert.equal((await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body.status, "abandoned");
    });

    // EVT-15, EVT-16.
    test("a watch uploads team officials' cards with their roles, and injuries with how long play stopped", async () => {
        const res = await call("POST", "/v1/watch/records", bob, {
            created: 1793600456, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, trackStoppage: true, score: [0, 0], pens: null,
            events: [
                ["TY", 1, 0, -1, null, 1],
                ["TY", 0, 0, 300, null, 0],
                // An injury that started the stoppage, saved when it ended; then one while a stoppage ran.
                ["I", 0, 0, 600, 7, null],
                ["S", -1, 0, 600, null, 95],
                ["S", -1, 0, 800, null, 60],
                ["I", 1, 0, 830, null, null],
                ["E", -1, 0, 1850, null, null],
                ["I", 1, 0, -2, 4, null],
                ["TR", 0, 0, -2, null, 0],
                ["TR", 1, 1, 400, null, 2],
                ["TR", 1, 1, 500, null, 9],
                // Without stoppage tracked, or not running at it, play's stop isn't known.
                ["I", 0, 1, 700, 11, null],
                ["E", -1, 1, 1800, null, null],
            ],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const events = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body.events;
        assert.deepEqual(events[0], { type: "caution", when: "beforeKickoff", period: 1, team: "away", offender: { kind: "teamOfficial", role: "assistantCoach" } });
        assert.deepEqual(events[1], { type: "caution", when: "play", period: 1, periodSec: 300, team: "home", offender: { kind: "teamOfficial", role: "headCoach" } });
        assert.deepEqual(events[2], { type: "injury", when: "play", period: 1, periodSec: 600, team: "home", player: 7, lengthSec: 95 });
        assert.deepEqual(events[5], { type: "injury", when: "play", period: 1, periodSec: 830, team: "away", lengthSec: 60 });
        assert.deepEqual(events[7], { type: "injury", when: "break", period: 1, team: "away", player: 4 });
        assert.deepEqual(events[8], { type: "sendOff", when: "break", period: 1, team: "home", offender: { kind: "teamOfficial", role: "headCoach" } });
        assert.deepEqual(events[9].offender, { kind: "teamOfficial", role: "other" });
        assert.deepEqual(events[10].offender, { kind: "teamOfficial", role: "other" }, "a role it doesn't know");
        assert.deepEqual(events[11], { type: "injury", when: "play", period: 2, periodSec: 700, team: "home", player: 11 });
    });

    // EVT-12, STAT-7.
    test("a watch uploads sin bins with their length, a second for the same number as a send-off, and the quick match keeps sin bins on", async () => {
        const res = await call("POST", "/v1/watch/records", bob, {
            created: 1793600789, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 2400, halftimeSec: 600, sinBins: true, sinBinSec: 300, score: [0, 0], pens: null,
            events: [
                ["SB", 1, 0, -1, 4, 300],
                ["SB", 0, 0, 600, 7, 300],
                ["Y", 0, 0, 700, 7, null],
                ["SB2", 0, 0, 900, 7, 300],
                ["E", -1, 0, 2400, null, null],
                ["SB", 1, 0, -2, null, 300],
                ["E", -1, 1, 2400, null, null],
            ],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const events = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body.events;
        assert.deepEqual(events[0], { type: "sinBin", when: "beforeKickoff", period: 1, team: "away", offender: { kind: "player", number: 4 }, lengthSec: 300 });
        assert.deepEqual(events[1], { type: "sinBin", when: "play", period: 1, periodSec: 600, team: "home", offender: { kind: "player", number: 7 }, lengthSec: 300 });
        assert.equal(events[2].type, "caution", "a sin bin and a caution don't combine");
        assert.deepEqual(events[3], { type: "secondSinBin", when: "play", period: 1, periodSec: 900, team: "home", offender: { kind: "player", number: 7 }, lengthSec: 300 });
        assert.deepEqual(events[5], { type: "sinBin", when: "break", period: 1, team: "away", offender: { kind: "player" }, lengthSec: 300 });
        const match = (await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body;
        assert.equal(match.format.sinBins, true);
        assert.equal(match.format.sinBinSec, 300);
    });

    // TMR-15, STAT-9.
    test("a stopping clock: the record says so, each period's stops are kept for the track, a suspension sits after them, and the quick match keeps it", async () => {
        const kickoff = 1793602000;
        const res = await call("POST", "/v1/watch/records", bob, {
            created: kickoff - 60, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 2400, halftimeSec: 600, trackStoppage: true, stoppingClock: true, stopForGoalsCards: false, score: [1, 0], pens: null,
            startedAt: [kickoff, kickoff + 3600],
            events: [
                ["G", 0, 0, 600, 9, null],
                ["S", -1, 0, 600, null, 45],
                ["I", 1, 0, 900, 4, null],
                ["S", -1, 0, 900, null, 120],
                ["SU", -1, 0, 1200, null, 1],
                ["RS", -1, 0, 1200, null, 1800],
                ["E", -1, 0, 2400, null, null],
                ["E", -1, 1, 2400, null, null],
            ],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body;
        assert.equal(record.stoppingClock, true);
        assert.deepEqual(record.events[1], { type: "stoppage", when: "play", period: 1, periodSec: 600, lengthSec: 45 });
        assert.equal(record.events[2].lengthSec, 120, "the injury's stop, from where the clock stood still");
        assert.equal(record.periods[0].playedSec, 2400, "the clock's time");
        assert.equal(record.periods[0].stoppedSec, 165);
        assert.deepEqual(record.periods[0].suspended, [{ fromSec: 1200 + 165, lengthSec: 1800 }], "on the clock of day, after the stops");
        assert.equal(record.periods[1].stoppedSec, 0);
        const match = (await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body;
        assert.equal(match.format.stoppingClock, true);
        assert.equal(match.format.stopForGoalsCards, false);
        assert.equal(match.format.trackStoppage, true);
        // The watch gets it back on a planned match, with stoppage tracked whatever the format says.
        const planned = { ...match, id: "5c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e", status: "scheduled", kickoff: new Date(Date.now() + 2 * 86_400_000).toISOString(), format: { ...match.format, trackStoppage: false }, version: undefined, updatedAt: undefined };
        assert.equal((await call("PUT", `/v1/matches/${planned.id}`, bob, planned)).status, 201);
        const next = (await call("GET", "/v1/watch/matches", bob)).body.matches.find((m: { id: string }) => m.id === planned.id);
        assert.equal(next.stoppingClock, true);
        assert.equal(next.stopForGoalsCards, false);
        assert.equal(next.trackStoppage, true);
    });

    // EVT-14.
    test("a watch uploads the cards' reasons beside the events, keeping only a code of its scheme for that kind of card", async () => {
        const upload = (misconduct: unknown, created: number) => call("POST", "/v1/watch/records", bob, {
            created, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 2400, halftimeSec: 600, sinBins: true, sinBinSec: 600, score: [1, 0], pens: null,
            events: [
                ["Y", 0, 0, 300, 4, null],
                ["G", 0, 0, 400, 9, null],
                ["Y2", 0, 0, 500, 4, null],
                ["R", 1, 0, 600, 8, null],
                ["SB", 1, 0, 700, 5, 600],
                ["TY", 1, 0, 800, null, 0],
                ["TR", 0, 0, 900, null, 2],
                ["Y", 1, 0, 1000, 6, null],
                ["R", 1, 0, 1100, 3, null],
            ],
            misconduct,
        });
        const res = await upload({ scheme: "ussf", codes: [[0, "UB"], [1, "DT"], [2, "DT"], [3, "SFP"], [4, "PI"], [5, "DT"], [6, "AL"], [7, "SFP"], [8, "UB"], [42, "UB"]] }, 1793601001);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const events = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body.events;
        const code = (i: number) => events[i].misconduct;
        assert.deepEqual(code(0), { scheme: "ussf", code: "UB" });
        assert.equal(code(1), undefined, "a goal has no reason");
        assert.deepEqual(code(2), { scheme: "ussf", code: "DT" }, "a second caution's is the second caution's reason");
        assert.deepEqual(code(3), { scheme: "ussf", code: "SFP" });
        assert.deepEqual(code(4), { scheme: "ussf", code: "PI" }, "a sin bin takes a caution's code");
        assert.deepEqual(code(5), { scheme: "ussf", code: "DT" });
        assert.deepEqual(code(6), { scheme: "ussf", code: "AL" });
        assert.equal(code(7), undefined, "a send-off's code on a caution is left out");
        assert.equal(code(8), undefined, "a caution's code on a send-off is left out");
        assert.equal(events.length, 9);

        // An unknown scheme's codes, or a misconduct the server can't read, are left out and the match kept.
        for (const [misconduct, created] of [[{ scheme: "mars", codes: [[0, "UB"]] }, 1793601002], [{ scheme: "ussf", codes: "UB" }, 1793601003]] as const) {
            const kept = await upload(misconduct, created);
            assert.equal(kept.status, 201, JSON.stringify(kept.body));
            const saved = (await call("GET", `/v1/match-records/${kept.body.recordId}`, bob)).body.events;
            assert.ok(saved.every((e: { misconduct?: unknown }) => e.misconduct === undefined));
        }
    });

    // TMR-14, STAT-9.
    test("a watch uploads the clock's corrections, and added time leaves out a period with its match clock corrected", async () => {
        const res = await call("POST", "/v1/watch/records", bob, {
            created: 1793600999, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, trackStoppage: true, score: [0, 0], pens: null,
            events: [
                ["CK", -1, 0, 640, null, 40],
                ["CA", -1, 0, 900, null, -65],
                ["E", -1, 0, 1920, null, null],
                ["CA", -1, 1, 300, null, 30],
                ["CK", -1, 1, 400, null, 0],
                ["E", -1, 1, 1890, null, null],
            ],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body;
        assert.deepEqual(record.events[0], { type: "clockAdjusted", when: "play", period: 1, periodSec: 640, clock: "match", changeSec: 40 });
        assert.deepEqual(record.events[1], { type: "clockAdjusted", when: "play", period: 1, periodSec: 900, clock: "added", changeSec: -65 });
        assert.deepEqual(record.events[3], { type: "clockAdjusted", when: "play", period: 2, periodSec: 300, clock: "added", changeSec: 30 });
        assert.equal(record.events.length, 5, "a change of nothing is left out");
        // Only the second half's added time counts: the first's match clock was corrected, while added time's own correction doesn't change the time played.
        const match = (await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body;
        assert.equal(addedTimeSec(match, record.periods[0], record.events), undefined);
        assert.equal(addedTimeSec(match, record.periods[1], record.events), 90);
    });

    // TMR-13: SU and RS as the record's suspension, with its length; the period's stretches suspended for the track (TRK-3).
    test("a watch uploads a suspension and its resume, and one abandoned while suspended", async () => {
        const created = 1793601999;
        const res = await call("POST", "/v1/watch/records", bob, {
            created, device: "fr965", home: "STR", away: "ROV", homeName: "", awayName: "", homeColor: -1, awayColor: -1,
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, score: [0, 0], pens: null, startedAt: [created + 60, created + 4000],
            events: [
                ["CK", -1, 0, 100, null, 40],
                ["SU", -1, 0, 600, null, 1],
                ["Y", 1, 0, 600, 4, null],
                ["RS", -1, 0, 600, null, 1800],
                ["SU", -1, 0, 900, null, 0],
                ["RS", -1, 0, 900, null, 300],
                ["E", -1, 0, 1800, null, null],
                ["SU", -1, 1, 1200, null, 2],
                ["E", -1, 1, 1200, null, null],
                ["A", -1, 1, 1200, null, 2],
            ],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body;
        const suspensions = record.events.filter((e: { type: string }) => e.type === "suspension");
        assert.deepEqual(suspensions, [
            { type: "suspension", when: "play", period: 1, periodSec: 600, reason: "lightning", lengthSec: 1800 },
            { type: "suspension", when: "play", period: 1, periodSec: 900, reason: "weather", lengthSec: 300 },
            { type: "suspension", when: "play", period: 2, periodSec: 1200, reason: "crowdTrouble" },
        ]);
        assert.equal(record.events.length, 8, "the resumes are in their suspensions");
        assert.equal(record.outcome, "abandoned");
        // On the clock of day from kickoff: the clock's correction moved the period's time 40 s on, and the first suspension came before the second.
        assert.deepEqual(record.periods[0], { period: 1, extraTime: false, startedAt: new Date((created + 60) * 1000).toISOString(), playedSec: 1800, suspended: [{ fromSec: 560, lengthSec: 1800 }, { fromSec: 2660, lengthSec: 300 }] });
        assert.equal(record.periods[1].suspended, undefined, "never resumed");
    });

    test("a watch uploads a finished match, converted to a match record", async () => {
        const soonId = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
        const upload = {
            created: 1793520000, matchId: soonId, device: "venu2",
            home: "STR", away: "ROV", homeName: "Strikers U12", awayName: "Rovers U12", homeColor: 0xC8102E, awayColor: -1,
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, teamSize: 9, breakAtSec: 840, breakLenSec: 120,
            extraTime: false, etPeriods: 2, etPeriodSec: 900, penalties: false, clockStyle: 2, trackStoppage: true, goalTypes: true,
            score: [2, 1], pens: null, distanceM: 5630.4,
            diagnostics: { app: "2026.10.31", gpsSamples: 90, gpsMissed: 3, restarts: 1, battery: [[0, 0, 88], [1, 1, 71.5], [0, 7, 50], [0, 0, 400]] },
            events: [
                ["Y", 1, 0, -1, 4, null],
                ["G", 0, 0, 312, 9, null],
                ["S", -1, 0, 900, null, 75],
                ["GP", 1, 0, 1500, 10, null],
                ["E", -1, 0, 1845, null, null],
                ["Y", 0, 0, -2, null, null],
                ["GO", 0, 1, 640, 5, null],
                ["Y2", 1, 1, 1200, 4, null],
                ["E", -1, 1, 1830, null, null],
                ["R", 1, 1, -3, 7, null],
            ],
        };
        const res = await call("POST", "/v1/watch/records", bob, upload);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.matchId, soonId);
        const record = await call("GET", `/v1/match-records/${res.body.recordId}`, bob);
        assert.equal(record.body.device, "garmin:venu2");
        // DIAG-1: as the record says it, and anything unusable left out rather than the match refused.
        assert.deepEqual(record.body.diagnostics, { app: "2026.10.31", gpsSamples: 90, gpsMissed: 3, restarts: 1, battery: [{ period: 1, at: "kickoff", percent: 88 }, { period: 2, at: "end", percent: 71.5 }] });
        assert.deepEqual(record.body.score, { home: 2, away: 1 });
        assert.equal(record.body.distanceM, 5630);
        assert.deepEqual(record.body.periods, [{ period: 1, extraTime: false, playedSec: 1845 }, { period: 2, extraTime: false, playedSec: 1830 }]);
        const types = record.body.events.map((e: { type: string; when: string }) => `${e.type}:${e.when}`);
        assert.deepEqual(types, ["caution:beforeKickoff", "goal:play", "stoppage:play", "goal:play", "periodEnd:play", "caution:break", "goal:play", "secondCaution:play", "periodEnd:play", "sendOff:afterFullTime"]);
        assert.deepEqual(record.body.events[1], { type: "goal", when: "play", period: 1, periodSec: 312, team: "home", player: 9 });
        assert.equal(record.body.events[3].goalType, "penalty");
        assert.equal(record.body.events[6].goalType, "ownGoal");
        assert.deepEqual(record.body.events[2], { type: "stoppage", when: "play", period: 1, periodSec: 900, lengthSec: 75 });
        assert.deepEqual(record.body.events[5].offender, { kind: "player" }, "no number");
        assert.equal((await call("GET", `/v1/matches/${soonId}`, bob)).body.status, "played", "the planned match is now played");

        const again = await call("POST", "/v1/watch/records", bob, { ...upload, score: [3, 1] });
        assert.equal(again.status, 200, "sending it again updates the same record");
        assert.equal(again.body.recordId, res.body.recordId);

        const quick = await call("POST", "/v1/watch/records", bob, { ...upload, created: 1793600000, matchId: null, homeName: "", awayName: "" });
        assert.equal(quick.status, 201);
        const made = await call("GET", `/v1/matches/${quick.body.matchId}`, bob);
        assert.equal(made.body.status, "played");
        assert.deepEqual(made.body.home, { alias: "STR", colour: "#C8102E" });
        assert.equal(made.body.format.clock, "down");
        assert.equal((await call("POST", "/v1/watch/records", bob, { events: [] })).status, 400);
    });

    test("a planned match takes the format the watch played it in (Q-20)", async () => {
        const kickoff = new Date(Date.now() + 2 * 86_400_000).toISOString();
        const planned = { ...match, id: "9b1e6c2a-4d3f-4e5a-8b7c-1d2e3f4a5b6c", kickoff, external: undefined, format: { ...(match.format as object), periods: 2, periodSec: 1800, breakSec: 300, halfwayBreak: true, halfwayBreakSec: 120 } };
        assert.equal((await call("PUT", `/v1/matches/${planned.id}`, bob, planned)).status, 201);
        // Played as four periods of 15 minutes, by a watch that doesn't say whether it had a halfway break.
        const upload = { created: 1793810000, matchId: planned.id, home: "HOM", away: "AWY", numPeriods: 4, periodSec: 900, halftimeSec: 300, score: [1, 0], events: [["G", 0, 2, 120, 9, null]] };
        assert.equal((await call("POST", "/v1/watch/records", bob, upload)).status, 201);
        const played = (await call("GET", `/v1/matches/${planned.id}`, bob)).body;
        assert.equal(played.status, "played");
        assert.equal(played.format.periods, 4);
        assert.equal(played.format.periodSec, 900);
        assert.equal(played.format.halfwayBreak, true, "what the watch didn't say stays as planned");

        // A format the schema can't hold leaves the plan's, and the match is still played.
        const single = { ...planned, id: "0c2f7d3b-5e4a-4f6b-9c8d-2e3f4a5b6c7d" };
        assert.equal((await call("PUT", `/v1/matches/${single.id}`, bob, single)).status, 201);
        assert.equal((await call("POST", "/v1/watch/records", bob, { ...upload, created: 1793810500, matchId: single.id, numPeriods: 5 })).status, 201);
        const kept = (await call("GET", `/v1/matches/${single.id}`, bob)).body;
        assert.equal(kept.status, "played");
        assert.equal(kept.format.periods, 2);

        // SET-16: one period is a format it holds.
        const one = { ...planned, id: "1d3e8c4a-6f5b-4a7c-8d9e-3f4a5b6c7d8e" };
        assert.equal((await call("PUT", `/v1/matches/${one.id}`, bob, one)).status, 201);
        assert.equal((await call("POST", "/v1/watch/records", bob, { ...upload, created: 1793810600, matchId: one.id, numPeriods: 1, periodSec: 1200 })).status, 201);
        assert.equal((await call("GET", `/v1/matches/${one.id}`, bob)).body.format.periods, 1);
    });

    test("Record goal scorers goes to the watch and comes back from it, and missing means on (EVT-10)", async () => {
        const kickoff = new Date(Date.now() + 2 * 86_400_000).toISOString();
        const planned = { ...match, kickoff, external: undefined };
        const off = { ...planned, id: "8c1d2e3f-4a5b-4c6d-8e7f-901a2b3c4d5e", format: { ...(match.format as object), goalScorers: false } };
        const unset = { ...planned, id: "9d2e3f4a-5b6c-4d7e-8f90-1a2b3c4d5e6f", format: { ...(match.format as object), goalScorers: undefined } };
        assert.equal((await call("PUT", `/v1/matches/${off.id}`, bob, off)).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${unset.id}`, bob, unset)).status, 201);
        assert.equal((await call("GET", `/v1/matches/${off.id}`, bob)).body.format.goalScorers, false, "the API keeps it");

        const { matches } = (await call("GET", "/v1/watch/matches", bob)).body;
        const scorers = (id: string) => matches.find((m: { id: string }) => m.id === id).goalScorers;
        assert.equal(scorers(off.id), false);
        assert.equal(scorers(unset.id), true, "a format saved before the setting still asks");

        // A quick match gets its format from what the watch uploads.
        const upload = {
            matchId: null, device: "venu2", home: "HOM", away: "AWY", homeName: "", awayName: "",
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, score: [1, 0], events: [["G", 0, 0, 312, null, null]],
        };
        const uploaded = async (fields: object) => {
            const res = await call("POST", "/v1/watch/records", bob, { ...upload, ...fields });
            assert.equal(res.status, 201, JSON.stringify(res.body));
            return (await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body.format.goalScorers;
        };
        assert.equal(await uploaded({ created: 1793710000, goalScorers: false }), false);
        assert.equal(await uploaded({ created: 1793710100 }), true, "a watch from before the setting always asked");
    });

    // ET-6.
    test("a quick match ended on a golden goal keeps it, and the format says so", async () => {
        const res = await call("POST", "/v1/watch/records", bob, {
            created: 1793720000, matchId: null, device: "fr965", home: "HOM", away: "AWY",
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, extraTime: true, etPeriods: 2, etPeriodSec: 600, goldenGoal: true, penalties: true,
            score: [2, 1], pens: null, golden: true,
            events: [["G", 0, 0, 600, null, null], ["G", 1, 1, 900, null, null], ["E", -1, 0, 1800, null, null], ["E", -1, 1, 1800, null, null],
                ["G", 0, 2, 412, null, null], ["E", -1, 2, 413, null, null]],
        });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body;
        assert.equal(record.goldenGoal, true);
        assert.equal(record.penalties, undefined);
        assert.deepEqual(record.periods.at(-1), { period: 3, extraTime: true, playedSec: 413 });
        assert.equal((await call("GET", `/v1/matches/${res.body.matchId}`, bob)).body.format.goldenGoal, true);
        const plain = await call("POST", "/v1/watch/records", bob, { created: 1793720100, matchId: null, home: "HOM", away: "AWY", numPeriods: 2, periodSec: 1800, halftimeSec: 300, score: [0, 0], events: [] });
        assert.equal((await call("GET", `/v1/match-records/${plain.body.recordId}`, bob)).body.goldenGoal, undefined, "only when it happened");
        assert.equal((await call("GET", `/v1/matches/${plain.body.matchId}`, bob)).body.format.goldenGoal, false, "a watch from before it didn't have it");
    });

    test("a watch sends its track in chunks, which become the match report's track (TRK-7)", async () => {
        const created = 1793700000;
        const upload = {
            created, matchId: null, device: "venu2", home: "HOM", away: "AWY",
            numPeriods: 2, periodSec: 1800, halftimeSec: 300, score: [0, 0], pens: null,
            startedAt: [created + 60, created + 2400], kickoff: 1, homeHeading: Math.PI / 2,
            events: [["E", -1, 0, 1800, null, null], ["E", -1, 1, 1800, null, null]],
        };
        // A minute north at about 3 m/s from the first kickoff, as TrackLog.mc packs it: whole
        // position first, then changes; heart rate every sample; the second chunk starts whole again.
        const step = (i: number) => `,27,0,300,${140 + (i % 5)};`;
        const first = `600,51500000,-120000,300,140;${Array.from({ length: 29 }, (_, i) => step(i)).join("")}`;
        const second = `900,51500810,-120000,300,141;${Array.from({ length: 29 }, (_, i) => step(i)).join("")}12,,,,150;`;
        const chunk = (index: number, data: string) => ({ created, start: created + 60, index, count: 2, device: "venu2", data });

        const early = await call("POST", "/v1/watch/tracks", bob, chunk(1, second));
        assert.deepEqual(early.body, { received: 1, count: 2, track: "waiting" }, "the second chunk can come first");
        const both = await call("POST", "/v1/watch/tracks", bob, chunk(0, first));
        assert.deepEqual(both.body, { received: 2, count: 2, track: "waiting" }, "waiting for the match");
        const res = await call("POST", "/v1/watch/records", bob, upload);
        assert.equal(res.status, 201);

        const record = await call("GET", `/v1/match-records/${res.body.recordId}`, bob);
        assert.deepEqual(record.body.periods.map((p: { startedAt?: string }) => p.startedAt),
            [new Date((created + 60) * 1000).toISOString(), new Date((created + 2400) * 1000).toISOString()], "kickoff times kept");
        assert.deepEqual(record.body.kickoffDirection, { team: "away", bearingDeg: 270 }, "away kicked off, attacking west");

        const track = await call("GET", `/v1/match-records/${res.body.recordId}/track`, bob);
        assert.equal(track.status, 200, "the chunks became the track");
        assert.deepEqual(track.body.track.source, { kind: "lawfive", device: "garmin:venu2", app: "LawFive for Garmin" });
        assert.equal(track.body.track.start, new Date((created + 60) * 1000).toISOString());
        const gps = track.body.track.gps;
        assert.equal(gps.t.length, 60);
        assert.deepEqual(gps.t.slice(0, 3), [60_000, 61_000, 62_000], "a minute after the track start, then a second apart");
        assert.equal(gps.t[30], 90_000, "the second chunk counts from the start");
        assert.equal(gps.lat[30], 51.50081);
        assert.equal(gps.speedMps[0], 3);
        assert.equal(track.body.track.heartRate.t.length, 61, "heart rate without a position counts too");
        assert.ok(Math.abs(track.body.summary.total.distanceM - 59 * 3) < 3, `about 177 m, got ${track.body.summary.total.distanceM}`);

        const again = await call("POST", "/v1/watch/tracks", bob, chunk(0, first));
        assert.deepEqual(again.body, { received: 1, count: 2, track: "waiting" }, "a fresh set of chunks for the same match");
        const kept = await call("POST", "/v1/watch/tracks", bob, chunk(1, second));
        assert.equal(kept.body.track, "kept", "a match report with a track keeps it");

        const bad = await call("POST", "/v1/watch/tracks", bob, chunk(0, "1,2,x;"));
        assert.equal(bad.status, 400);
        assert.equal((await call("POST", "/v1/watch/tracks", bob, { ...chunk(2, first) })).status, 400, "index beyond count");
    });

    test("a Wear OS watch's or Apple Watch's match and track say which app recorded them (WCH-7)", async () => {
        const wear = { "x-lawfive-device": "wearos; model=SM-R860; os=16; app=2026.11.5" };
        const created = 1793710777;
        const upload = { created, matchId: null, device: "SM-R860", home: "HOM", away: "AWY", numPeriods: 2, periodSec: 1800, halftimeSec: 300, score: [0, 0], events: [], distanceM: 180 };
        const res = await call("POST", "/v1/watch/records", bob, upload, wear);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        const record = (await call("GET", `/v1/match-records/${res.body.recordId}`, bob)).body;
        assert.equal(record.device, "wearos:SM-R860");
        assert.equal(record.distanceM, 180);
        const sent = await call("POST", "/v1/watch/tracks", bob, { created, start: created + 60, index: 0, count: 1, device: "SM-R860", data: "600,51500000,-120000,300,140;,27,0,300,141;" }, wear);
        assert.equal(sent.body.track, "saved");
        const track = await call("GET", `/v1/match-records/${res.body.recordId}/track`, bob);
        assert.deepEqual(track.body.track.source, { kind: "lawfive", device: "wearos:SM-R860", app: "LawFive for Wear OS" });

        const relayed = await call("POST", "/v1/watch/records", bob, { ...upload, created: created + 1, device: "venu2" }, { "x-lawfive-device": "android; model=Pixel 9 Pro; os=17" });
        assert.equal((await call("GET", `/v1/match-records/${relayed.body.recordId}`, bob)).body.device, "garmin:venu2", "a Garmin's through the phone app stays a Garmin's");
    });

    test("deleting keeps a marker so other devices hear about it", async () => {
        const res = await call("DELETE", `/v1/matches/${matchId}?version=1`, alice);
        assert.equal(res.status, 409, "alice's match is at version 2");
        const del = await call("DELETE", `/v1/matches/${matchId}?version=2`, alice);
        assert.equal(del.status, 200);
        assert.ok(del.body.deletedAt);
        const list = await call("GET", "/v1/matches", alice);
        assert.ok(!list.body.items.some((m: { id: string }) => m.id === matchId));
        assert.ok((await call("GET", `/v1/matches/${matchId}`, alice)).body.deletedAt);
    });

    test("address lookup needs sign-in and caches answers", async () => {
        assert.equal((await call("GET", "/v1/geocode?q=969%20Caribbean%20Dr")).status, 401);
        assert.equal((await call("GET", "/v1/geocode?q=a", alice)).status, 400);
        const first = await call("GET", "/v1/geocode?q=969%20Caribbean%20Dr", alice);
        assert.equal(first.status, 200);
        assert.deepEqual(first.body.results[0], { name: "969 Caribbean Dr, Sunnyvale", lat: 37.41, lon: -122.01 });
        await call("GET", "/v1/geocode?q=969%20caribbean%20dr", alice);
        assert.equal(geocoderRequests, 1, "the second lookup came from the cache");
    });

    test("a watch links with a code approved on the website, and can be unlinked", async () => {
        const unknown = await call("POST", "/v1/auth/device/code", undefined, { client_id: "someone-else" });
        assert.equal(unknown.status, 400, "only known apps can ask for a code");

        // The watch says which it is, so the Link page can name it before it's approved.
        const venu2 = { "x-lawfive-device": "garmin; model=006-B3703-00; firmware=12.30; app=2026.10.30" };
        const code = await call("POST", "/v1/auth/device/code", undefined, { client_id: "lawfive-garmin" }, venu2);
        assert.equal(code.status, 200, JSON.stringify(code.body));
        assert.match(code.body.user_code, /^[BCDFGHJKLMNPQRSTVWXZ2-9]{8}$/, "eight unambiguous characters");
        assert.equal(code.body.verification_uri, `${publicUrl}/link`);
        const poll = () => call("POST", "/v1/auth/device/token", undefined,
            { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: code.body.device_code, client_id: "lawfive-garmin" });

        const waiting = await poll();
        assert.equal(waiting.status, 400);
        assert.equal(waiting.body.error, "authorization_pending");

        const check = await call("GET", `/v1/auth/device?user_code=${code.body.user_code}`, alice);
        assert.equal(check.status, 200, JSON.stringify(check.body));
        assert.equal(check.body.device_name, "Garmin Venu 2", "the Link page knows which watch is asking");
        const approve = await call("POST", "/v1/auth/device/approve", alice, { userCode: code.body.user_code });
        assert.equal(approve.status, 200, JSON.stringify(approve.body));
        await new Promise((resolve) => setTimeout(resolve, 5100)); // the polling interval
        const granted = await poll();
        assert.equal(granted.status, 200, JSON.stringify(granted.body));
        const watch = granted.body.access_token as string;

        const res = await app.request("/v1/watch/matches", { headers: { authorization: `Bearer ${watch}`, ...venu2 } });
        assert.equal(res.status, 200, "the watch is signed in as alice");
        // SEC-13: and reaches nothing but the watch's endpoints.
        const asWatch = (path: string, method = "GET", body?: unknown) => app.request(path, {
            method, headers: { authorization: `Bearer ${watch}`, "content-type": "application/json", ...venu2 }, body: body === undefined ? undefined : JSON.stringify(body),
        });
        for (const path of ["/v1/matches", "/v1/account", "/v1/devices", "/v1/api-keys", "/v1/export"]) {
            const refused = await asWatch(path);
            assert.equal(refused.status, 403, path);
            assert.match((await refused.json()).error, /only syncs matches/);
        }
        for (const [path, method] of [["/v1/auth/list-sessions", "GET"], ["/v1/auth/revoke-sessions", "POST"], ["/v1/auth/update-user", "POST"], ["/v1/auth/device/approve", "POST"]]) {
            const refused = await asWatch(path, method, method === "GET" ? undefined : {});
            assert.equal(refused.status, 403, path);
            assert.equal((await refused.json()).code, "WATCH_ONLY", path);
        }
        assert.equal((await asWatch("/v1/auth/get-session")).status, 200, "it can read its own session");

        const devices = await call("GET", "/v1/devices", alice);
        const garmin = devices.body.devices.find((d: { kind: string }) => d.kind === "garmin");
        assert.equal(garmin?.name, "Garmin Venu 2");
        assert.equal(garmin?.model, "006-B3703-00");
        assert.equal(garmin?.firmware, "12.30");
        assert.equal(garmin?.appVersion, "2026.10.30", "the watch app's version (VER-3)");
        assert.equal(garmin?.watchOnly, true, "shown as only syncing matches (SEC-13)");
        assert.equal(devices.body.devices.find((d: { current: boolean }) => d.current)?.watchOnly, undefined, "a browser isn't");
        assert.deepEqual(readDeviceHeader("garmin"), { kind: "garmin", name: "Garmin watch" }, "a watch from before it said which");
        assert.equal(readDeviceHeader("garmin; model=006-X")?.name, "Garmin watch", "a model LawFive doesn't know");
        // APP-2: the phone app names its model and Android version.
        assert.deepEqual(readDeviceHeader("android; model=Pixel 9 Pro; os=17"), { kind: "android", name: "Pixel 9 Pro", model: "Pixel 9 Pro", firmware: "17" });
        assert.equal(readDeviceHeader("android; model=Pixel 9 Pro; os=17; app=2026.10.30.2")?.app, "2026.10.30.2", "the app's own version (VER-3)");
        assert.equal(readDeviceHeader("android")?.name, "Android phone");
        // IOS-2: and the iPhone app its iOS version.
        assert.deepEqual(readDeviceHeader("ios; model=iPhone; os=17.0"), { kind: "ios", name: "iPhone", model: "iPhone", firmware: "17.0" });
        assert.equal(readDeviceHeader("something-else"), undefined);
        // STAT-15: watches as people know them.
        assert.equal(readDeviceHeader("wearos; model=SM-R860; os=16")?.name, "Galaxy Watch4");
        assert.equal(readDeviceHeader("wearos; model=sdk_gwear_arm64; os=16")?.name, "sdk_gwear_arm64", "a Wear OS watch it doesn't know, as it says");
        assert.equal(readDeviceHeader("applewatch; model=Watch7,3; os=26.0")?.name, "Apple Watch Series 9");
        assert.equal(readDeviceHeader("applewatch; model=Apple Watch; os=11.0")?.name, "Apple Watch", "an older app's");
        assert.ok(devices.body.devices.some((d: { current: boolean }) => d.current), "this browser is marked");
        assert.equal((await call("DELETE", `/v1/devices/${garmin.id}`, bob)).status, 404, "not bob's to unlink");
        assert.equal((await call("DELETE", `/v1/devices/${garmin.id}`, alice)).status, 200);
        const after = await app.request("/v1/matches", { headers: { authorization: `Bearer ${watch}` } });
        assert.equal(after.status, 401, "an unlinked watch is signed out");
    });

    test("changes come in order, in pages, with deletions", async () => {
        const all = await call("GET", "/v1/changes?since=0&limit=1000", alice);
        assert.equal(all.body.more, false);
        const page1 = await call("GET", "/v1/changes?since=0&limit=5", alice);
        assert.equal(page1.body.changes.length, 5);
        assert.equal(page1.body.more, true);
        const page2 = await call("GET", `/v1/changes?since=${page1.body.cursor}&limit=1000`, alice);
        assert.equal(page1.body.changes.length + page2.body.changes.length, all.body.changes.length);
        const last = all.body.changes.at(-1);
        assert.equal(last.collection, "matches");
        assert.equal(last.record.id, matchId);
        assert.ok(last.record.deletedAt, "the deletion is the latest change");
        const ids = all.body.changes.map((c: { record: { id: string } }) => c.record.id);
        assert.equal(new Set(ids).size, ids.length, "each record appears once, at its latest state");
        const nothingNew = await call("GET", `/v1/changes?since=${all.body.cursor}`, alice);
        assert.deepEqual(nothingNew.body, { changes: [], cursor: all.body.cursor, more: false });
        assert.equal((await call("GET", "/v1/changes?since=-1", alice)).status, 400);
    });
});
