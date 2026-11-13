import { PGlite } from "@electric-sql/pglite";
import { endpoints } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { diskStore } from "../src/storage.ts";
import type { Hourly } from "../src/weather/openMeteo.ts";
import { Weather } from "../src/weather/service.ts";
import { checkAnswer } from "./contract.ts";

// The API description (schema/src/endpoints.ts) against the server: the same endpoints, and the
// answers api.test.ts and weather.test.ts don't reach, checked against what it says.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};

/** Three days of wet weather from yesterday, whatever the place. */
function rainy(): Hourly {
    const start = Math.floor(Date.now() / 3_600_000) * 3600 - 86_400;
    const h: Hourly = { time: [], temperature: [], apparent: [], precipitation: [], chance: [], snowfall: [], code: [], gust: [], isDay: [] };
    for (let n = 0; n < 72; n++) {
        h.time.push(start + n * 3600);
        h.temperature.push(14);
        h.apparent.push(12);
        h.precipitation.push(1.5);
        h.chance.push(80);
        h.snowfall.push(0);
        h.code.push(63);
        h.gust.push(30);
        h.isDay.push(1);
    }
    return h;
}

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const weather = new Weather(db, { provider: async (places) => places.map(rainy), dailyLimit: 100 });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { weather, geocoderUrl: "http://localhost:9", files: await diskStore(mkdtempSync(join(tmpdir(), "lawfive-spec-"))) });

async function call(method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, headers: res.headers };
}

before(() => migrate(db, { migrationsFolder }));

describe("API description", () => {
    let token: string;

    test("the server has exactly the endpoints the description lists", () => {
        const described = endpoints.filter((e) => !e.path.startsWith("/v1/auth/")).map((e) => `${e.method.toUpperCase()} ${e.path}`).sort();
        const served = app.routes
            .filter((r) => r.method !== "ALL" && !r.path.startsWith("/v1/auth/"))
            .map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, "{$1}")}`);
        assert.deepEqual([...new Set(served)].sort(), described);
        assert.ok(app.routes.some((r) => r.path === "/v1/auth/*"), "the account endpoints are Better Auth's");
    });

    test("the checks notice an answer that isn't described", () => {
        assert.throws(() => checkAnswer("GET", "/v1/devices", 200, { devices: [], extra: 1 }), /fields the description doesn't/);
        assert.throws(() => checkAnswer("GET", "/v1/devices", 418, {}), /isn't a described answer/);
        assert.throws(() => checkAnswer("GET", "/v1/nowhere", 200, {}), /isn't in schema/);
    });

    test("accounts: sign up, who's signed in, wrong password, sign out", async () => {
        assert.equal((await call("GET", "/v1/auth/get-session")).body, null);
        const up = await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Lee", email: "sam@example.com", password: "correct horse battery" });
        token = up.headers.get("set-auth-token") as string;
        assert.equal((await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Lee", email: "sam@example.com", password: "correct horse battery" })).status, 422);
        assert.equal((await call("GET", "/v1/auth/get-session", token)).body.user.email, "sam@example.com");
        assert.equal((await call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password: "wrong" })).status, 401);
        const other = await call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password: "correct horse battery" });
        const second = other.headers.get("set-auth-token") as string;
        assert.equal((await call("POST", "/v1/auth/sign-out", second, {})).status, 200);
        assert.equal((await call("GET", "/v1/devices", second)).status, 401, "signed out");
    });

    test("linking: a refused code", async () => {
        const code = await call("POST", "/v1/auth/device/code", undefined, { client_id: "lawfive-garmin" });
        assert.equal((await call("POST", "/v1/auth/device/deny", undefined, { userCode: code.body.user_code })).status, 401);
        assert.equal((await call("POST", "/v1/auth/device/deny", token, { userCode: code.body.user_code })).status, 400, "not looked up yet");
        assert.equal((await call("GET", `/v1/auth/device?user_code=${code.body.user_code}`, token)).status, 200);
        assert.equal((await call("POST", "/v1/auth/device/deny", token, { userCode: code.body.user_code })).status, 200);
        assert.equal((await call("GET", "/v1/auth/device?user_code=NOSUCHCD", token)).status, 400);
    });

    test("weather: a match's forecast, in a window and on its own", async () => {
        const venue = example("Venue.complex.json");
        const match = { ...example("Match.planned.json"), kickoff: new Date(Date.now() + 6 * 3_600_000).toISOString() };
        assert.equal((await call("PUT", `/v1/venues/${venue.id}`, token, venue)).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, token, match)).status, 201);
        await weather.run();
        const all = await call("GET", "/v1/weather", token);
        assert.equal(all.body.items.length, 1);
        assert.ok(all.body.items[0].risks.length > 0, "a wet forecast has risks");
        assert.equal((await call("GET", `/v1/weather/${match.id}`, token)).body.condition, "rain");
        assert.equal((await call("GET", "/v1/weather?from=2026-01-01T00:00:00Z&to=2025-01-01T00:00:00Z", token)).status, 400);
        const watch = await call("GET", "/v1/watch/matches", token);
        assert.match(watch.body.matches[0].weather, /° rain$/);
    });

    test("address search: the service not answering", async () => {
        assert.equal((await call("GET", "/v1/geocode?q=969%20Caribbean%20Dr", token)).status, 502);
    });
});
