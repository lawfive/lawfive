import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// API keys (KEY-1 to KEY-4): made and deleted by a signed-in session, each limited to the
// collections it was given.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { geocoderUrl: "http://localhost:9" });

async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, headers: res.headers };
}

async function signUp(email: string) {
    const res = await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Key Tester", email, password: "correct horse battery" });
    return res.headers.get("set-auth-token") as string;
}

before(() => migrate(db, { migrationsFolder }));

describe("API keys", () => {
    let session: string;
    let writer: { id: string; key: string };
    let reader: string;
    const match = example("Match.planned.json");
    const venue = example("Venue.complex.json");

    test("a signed-in session makes keys; the key is shown once", async () => {
        session = await signUp("keys@example.com");
        const made = await call("POST", "/v1/api-keys", session, { name: "RefSix import", scopes: ["matches:write", "match-records:write"] });
        assert.equal(made.status, 201);
        assert.match(made.body.key, /^lf_[A-Za-z0-9_-]{43}$/);
        assert.ok(made.body.key.startsWith(made.body.prefix));
        writer = made.body;
        reader = (await call("POST", "/v1/api-keys", session, { name: "Read venues", scopes: ["venues:read"], expiresInDays: 30 })).body.key;
        const list = await call("GET", "/v1/api-keys", session);
        assert.deepEqual(list.body.keys.map((k: { name: string }) => k.name), ["Read venues", "RefSix import"]);
        assert.ok(list.body.keys.every((k: object) => !("key" in k)), "listed keys don't include the key");
        assert.ok(list.body.keys[0].expiresAt);
    });

    test("bad requests are refused", async () => {
        assert.equal((await call("POST", "/v1/api-keys", session, { name: "", scopes: ["matches:read"] })).status, 400);
        assert.equal((await call("POST", "/v1/api-keys", session, { name: "x", scopes: [] })).status, 400);
        assert.equal((await call("POST", "/v1/api-keys", session, { name: "x", scopes: ["devices:write"] })).status, 400);
    });

    test("a key reads and writes what it was given, and nothing else", async () => {
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, writer.key, match)).status, 201);
        assert.equal((await call("GET", "/v1/matches", writer.key)).body.items.length, 1);
        const venues = await call("GET", "/v1/venues", writer.key);
        assert.equal(venues.status, 403);
        assert.match(venues.body.error, /venues:read/);
        assert.equal((await call("PUT", `/v1/venues/${venue.id}`, session, venue)).status, 201);
        assert.equal((await call("GET", `/v1/venues/${venue.id}`, reader)).status, 200, "read access reads");
        assert.match((await call("PUT", `/v1/venues/${venue.id}`, reader, { ...venue, version: 1 })).body.error, /venues:write/, "but doesn't write");
        assert.equal((await call("GET", "/v1/geocode?q=Main%20Street", reader)).status, 403, "address search needs venues:write");
    });

    test("keys can't manage devices or keys, or act as a watch", async () => {
        for (const [method, path] of [["GET", "/v1/devices"], ["GET", "/v1/api-keys"], ["DELETE", `/v1/api-keys/${writer.id}`], ["GET", "/v1/watch/matches"]] as const) {
            const res = await call(method, path, writer.key);
            assert.equal(res.status, 403, `${method} ${path}`);
            assert.match(res.body.error, /sign in instead/);
        }
        assert.equal((await call("POST", "/v1/api-keys", writer.key, { name: "escalate", scopes: ["settings:write"] })).status, 403);
    });

    test("sync with a key includes only the collections it can read", async () => {
        const mine = await call("GET", "/v1/changes", writer.key);
        assert.deepEqual([...new Set(mine.body.changes.map((ch: { collection: string }) => ch.collection))], ["matches"]);
        const all = await call("GET", "/v1/changes", session);
        assert.ok(all.body.changes.some((ch: { collection: string }) => ch.collection === "venues"));
    });

    test("a key isn't a device, and notes when it was last used", async () => {
        await call("GET", "/v1/matches", writer.key, undefined, { "x-lawfive-device": "garmin" });
        const devices = await call("GET", "/v1/devices", session);
        assert.ok(devices.body.devices.every((d: { kind: string }) => d.kind === "browser"));
        const [row] = await db.select().from(tables.apiKey).where(eq(tables.apiKey.id, writer.id));
        assert.ok(row.lastUsedAt);
    });

    test("unknown, expired and deleted keys are refused", async () => {
        assert.match((await call("GET", "/v1/matches", "lf_nope")).body.error, /isn't valid/);
        await db.update(tables.apiKey).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(tables.apiKey.hash, (await db.select().from(tables.apiKey).where(eq(tables.apiKey.name, "Read venues")))[0].hash));
        const expired = await call("GET", `/v1/venues/${venue.id}`, reader);
        assert.equal(expired.status, 401);
        assert.match(expired.body.error, /expired/);
        const other = await signUp("other@example.com");
        assert.equal((await call("DELETE", `/v1/api-keys/${writer.id}`, other)).status, 404, "not theirs to delete");
        assert.equal((await call("DELETE", `/v1/api-keys/${writer.id}`, session)).status, 200);
        assert.equal((await call("GET", "/v1/matches", writer.key)).status, 401, "deleted keys stop working");
    });

    test("at most 20 keys, the first plan's limit (PLAN-1)", async () => {
        const have = (await call("GET", "/v1/api-keys", session)).body.keys.length;
        for (let i = have; i < 20; i++) {
            assert.equal((await call("POST", "/v1/api-keys", session, { name: `key ${i}`, scopes: ["matches:read"] })).status, 201);
        }
        const over = await call("POST", "/v1/api-keys", session, { name: "one too many", scopes: ["matches:read"] });
        assert.equal(over.status, 403);
        assert.equal(over.body.limit, "apiKeys");
        assert.equal(over.body.allowed, 20);
        assert.match(over.body.error, /Your plan allows 20 API keys/);
    });
});
