import { PGlite } from "@electric-sql/pglite";
import { zipSync } from "fflate";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { ImportFileError, readImportFile } from "../src/importFile.ts";
import { ServerSettingsStore } from "../src/serverSettings.ts";
import { diskStore } from "../src/storage.ts";
import { addressProblem, privateAddress, publicLookup } from "../src/webhooks.ts";
import { plansOf } from "../src/plans.ts";
import { trustedProxies, visitorOf } from "../src/limits.ts";

// SEC-1 to SEC-4: what the server does to protect itself and the people using it.

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

async function server(publicUrl = "https://app.example.com", trustedIpHeader?: string) {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl };
    return createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters", rateLimit: true }), {
        access, ...(trustedIpHeader ? { trustedIpHeader } : {}),
    });
}
const post = (body: string, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "content-type": "application/json", ...headers }, body });

test("SEC-1: every answer says what browsers may do with it", async () => {
    const app = await server();
    const res = await app.request("/v1/meta");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.match(res.headers.get("strict-transport-security")!, /max-age/);
    const csp = res.headers.get("content-security-policy")!;
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal((await (await server("http://localhost:3000")).request("/v1/meta")).headers.get("strict-transport-security"), null);
});

test("APP-23: every answer, errors and sign-in's included, says it's LawFive's", async () => {
    const app = await server();
    const answers = [
        await app.request("/v1/meta"),
        await app.request("/v1/venues/0b6f6b8e-6c0e-4c3e-9d1a-2f4f8f0f0f0f"),
        await app.request("/nothing-here"),
        await app.request("/v1/auth/sign-in/email", post(JSON.stringify({ email: "a@example.com", password: "wrong-password" }))),
    ];
    assert.deepEqual(answers.map((r) => r.status), [200, 401, 404, 401]);
    for (const res of answers) {
        assert.equal(res.headers.get("lawfive-version"), "dev");
    }
});

test("SEC-2: wrong passwords are limited per visitor, whatever they say about themselves", async () => {
    const app = await server();
    // A new address each time, so the per-account lock (SEC-12) stays out of it.
    let n = 0;
    const tryOnce = (forwarded: string) => app.request("/v1/auth/sign-in/email", post(JSON.stringify({ email: `a${n++}@example.com`, password: "wrong-password" }), { "x-forwarded-for": forwarded }));
    for (let i = 0; i < 10; i++) {
        assert.equal((await tryOnce("203.0.113.9")).status, 401);
    }
    assert.equal((await tryOnce("203.0.113.9")).status, 429);
    // Writing another address before the proxy's own changes nothing.
    assert.equal((await tryOnce("198.51.100.1, 203.0.113.9")).status, 429);
    // Someone else isn't locked out by it.
    assert.equal((await tryOnce("203.0.113.10")).status, 401);
    // A header of ours sent from outside is ignored.
    const res = await app.request("/v1/auth/sign-in/email", post(JSON.stringify({ email: "b@example.com", password: "wrong-password" }), { "x-forwarded-for": "203.0.113.9", "x-lawfive-client-ip": "203.0.113.77" }));
    assert.equal(res.status, 429);
});

test("SEC-2: a second proxy's header names the visitor when the server is told to read it", async () => {
    const app = await server("https://app.example.com", "CF-Connecting-IP");
    const tryOnce = (visitor: string) => app.request("/v1/app-sign-in/check", post(JSON.stringify({ code: "BCDFGHJK" }), { "x-forwarded-for": "172.70.0.1", "cf-connecting-ip": visitor }));
    for (let i = 0; i < 20; i++) {
        assert.equal((await tryOnce("203.0.113.20")).status, 404);
    }
    assert.equal((await tryOnce("203.0.113.20")).status, 429);
    assert.equal((await tryOnce("203.0.113.21")).status, 404, "same proxy, another visitor");
});

test("SEC-14: only listed proxies are believed about who's asking", () => {
    const none = trustedProxies(undefined).trusts;
    // With nothing listed, a proxy's word is ignored: everyone behind it is the proxy.
    assert.equal(visitorOf("172.18.0.3", "203.0.113.9", undefined, none), "172.18.0.3");
    assert.equal(visitorOf("::ffff:172.18.0.3", "203.0.113.9", undefined, none), "::ffff:172.18.0.3");
    const docker = trustedProxies("172.18.0.0/16, 2001:db8::/32").trusts;
    assert.equal(visitorOf("172.18.0.3", "203.0.113.9", undefined, docker), "203.0.113.9");
    assert.equal(visitorOf("::ffff:172.18.0.3", "203.0.113.9", undefined, docker), "203.0.113.9", "an IPv4 proxy seen through IPv6");
    assert.equal(visitorOf("2001:db8::7", "203.0.113.9", undefined, docker), "203.0.113.9");
    assert.equal(visitorOf("10.0.0.5", "203.0.113.9", undefined, docker), "10.0.0.5", "a proxy that isn't listed");
    // Whatever the visitor writes at the left, the last address a listed proxy didn't add is theirs.
    assert.equal(visitorOf("172.18.0.3", "1.2.3.4, 203.0.113.9", undefined, docker), "203.0.113.9");
    assert.equal(visitorOf("172.18.0.3", "1.2.3.4, 203.0.113.9, 172.18.0.9", undefined, docker), "203.0.113.9", "through two listed proxies");
    assert.equal(visitorOf("172.18.0.3", "not-an-address, 203.0.113.9", undefined, docker), "203.0.113.9");
    assert.equal(visitorOf("172.18.0.3", undefined, "198.51.100.4", docker), "198.51.100.4", "TRUSTED_IP_HEADER from a listed proxy");
    assert.equal(visitorOf("203.0.113.50", undefined, "198.51.100.4", docker), "203.0.113.50", "and ignored from anyone else");
    const privately = trustedProxies("private").trusts;
    assert.equal(visitorOf("10.1.2.3", "203.0.113.9", undefined, privately), "203.0.113.9", "private trusts every private range, as before");
    // (203.0.113.0/24 and its kind are documentation ranges, which count as private.)
    assert.equal(visitorOf("8.8.8.8", "198.51.100.4", undefined, privately), "8.8.8.8");
    assert.equal(visitorOf("172.18.0.4", undefined, undefined, trustedProxies("172.18.0.4").trusts), "172.18.0.4", "a proxy that adds nothing");
    for (const bad of ["172.18.0.0/33", "proxy.local", "10.0.0.0/8/1", "fd00::/129", "10.0.0.0/x"]) {
        assert.throws(() => trustedProxies(bad), new RegExp(`"${bad.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`), bad);
    }
});

test("SEC-14: admins can see how the server sees them", async () => {
    const app = await server();
    const up = await app.request("/v1/auth/sign-up/email", post(JSON.stringify({ name: "Admin", email: "admin@example.com", password: "correct horse battery" })));
    const token = up.headers.get("set-auth-token");
    const res = await app.request("/v1/server-settings/network", { headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9" } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { yourAddress: "203.0.113.9", trustedProxies: [] });
});

test("SEC-3: a request too big to be real is refused before it's read", async () => {
    const app = await server();
    const res = await app.request("/v1/app-sign-in/check", post("x".repeat(33 * 1024 * 1024)));
    assert.equal(res.status, 413);
});

test("SEC-3: an .xlsx that opens out to gigabytes isn't opened", async () => {
    const bomb = zipSync({ "xl/worksheets/sheet1.xml": new Uint8Array(150 * 1024 * 1024) }, { level: 1 });
    assert.ok(bomb.byteLength < 5 * 1024 * 1024);
    await assert.rejects(readImportFile("matches.xlsx", "", bomb), (e) => e instanceof ImportFileError && /too big/.test(e.message));
});

test("SEC-4: a private address can't be reached however it's written", async () => {
    for (const ip of ["::ffff:7f00:1", "::ffff:a00:1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "fe80::1", "100.64.0.1", "0.0.0.0"]) {
        assert.ok(privateAddress(ip), ip);
    }
    for (const ip of ["8.8.8.8", "::ffff:808:808", "2606:4700::1111"]) {
        assert.ok(!privateAddress(ip), ip);
    }
    // As the URL parser rewrites it.
    assert.match((await addressProblem("http://[::ffff:127.0.0.1]/hook", false))!, /private/);
    // A name that turns out private when it's connected to.
    const error = await new Promise<Error | null>((resolve) => publicLookup("localhost", { all: true }, (e) => resolve(e)));
    assert.match(error!.message, /private/);
});

async function accounts() {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl: "https://app.example.com" };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
    const call = async (method: string, path: string, token?: string, body?: unknown, device?: string) => {
        const res = await app.request(path, {
            method,
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { "x-lawfive-device": device } : {}) },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const text = await res.text();
        return { status: res.status, body: JSON.parse(text || "null"), token: res.headers.get("set-auth-token") ?? undefined };
    };
    return { call };
}

test("SEC-7: signing out everywhere else, browsers only or everything", async () => {
    const { call } = await accounts();
    const email = "sam@example.com";
    const password = "correct-horse-battery";
    const here = (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam", email, password })).token!;
    const signIn = async (device?: string) => (await call("POST", "/v1/auth/sign-in/email", undefined, { email, password }, device)).token!;
    const browser = await signIn();
    const watch = await signIn();
    // A session becomes a device the first time it says what it is.
    assert.equal((await call("GET", "/v1/devices", watch, undefined, "garmin")).status, 200);
    const other = (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Lee", email: "lee@example.com", password })).token!;

    assert.equal((await call("POST", "/v1/devices/sign-out-others", here, { scope: "everyone" })).status, 400);
    assert.equal((await call("POST", "/v1/devices/sign-out-others", here, { scope: "browsers" })).body.signedOut, 1);
    assert.equal((await call("GET", "/v1/devices", browser)).status, 401, "the other browser is out");
    assert.equal((await call("GET", "/v1/devices", watch)).status, 200, "the watch stays linked");
    assert.equal((await call("GET", "/v1/devices", here)).status, 200, "and so does this one");

    assert.equal((await call("POST", "/v1/devices/sign-out-others", here, { scope: "all" })).body.signedOut, 1);
    assert.equal((await call("GET", "/v1/devices", watch)).status, 401, "the watch is unlinked");
    assert.equal((await call("GET", "/v1/devices", here)).status, 200);
    assert.equal((await call("GET", "/v1/devices", other)).status, 200, "someone else's account isn't touched");
});

test("SEC-6: a storage limit refuses what a person adds, and shows what's used", async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const secret = "test-secret-that-is-at-least-32-characters";
    const publicUrl = "https://app.example.com";
    // From before plans: the first plan's storage (PLAN-1).
    plansOf(db).configure({ firstStorageMb: () => 1 });
    const store = new ServerSettingsStore(db, {}, secret, publicUrl);
    await store.load();
    const access = { signUp: "open" as const, adminEmails: [], publicUrl, store };
    const files = await diskStore(mkdtempSync(join(tmpdir(), "lawfive-storage-")));
    const app = createApp(db, createAuth(db, { ...access, authSecret: secret }), { access, files });
    const signUp = await app.request("/v1/auth/sign-up/email", post(JSON.stringify({ name: "Sam", email: "sam@example.com", password: "correct-horse-battery" })));
    const headers = { authorization: `Bearer ${signUp.headers.get("set-auth-token")}` };
    const venue = randomUUID();
    assert.equal((await app.request(`/v1/venues/${venue}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ name: "Ortega Park", pitches: [] }) })).status, 201);
    const photo = (kb: number) => {
        const form = new FormData();
        const bytes = new Uint8Array(kb * 1024);
        bytes.set([0xff, 0xd8, 0xff]);
        form.set("file", new File([bytes], "photo.jpg", { type: "image/jpeg" }));
        form.set("recordType", "venue");
        form.set("recordId", venue);
        return app.request("/v1/attachments", { method: "POST", headers, body: form });
    };
    const storage = async () => (await app.request("/v1/account/storage", { headers })).json();
    assert.deepEqual(await storage(), { usedBytes: 0, limitBytes: 1024 * 1024 });
    assert.equal((await photo(800)).status, 201);
    assert.equal((await storage()).usedBytes, 800 * 1024);
    const refused = await photo(400);
    assert.equal(refused.status, 400);
    const answer = await refused.json();
    assert.match(answer.error, /storage is full/);
    assert.deepEqual(answer.storage, { usedBytes: 800 * 1024, limitBytes: 1024 * 1024 });
    // Records aren't files: the account still works.
    assert.equal((await app.request(`/v1/venues/${randomUUID()}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ name: "Baylands Park", pitches: [] }) })).status, 201);
});

test("SEC-9: a change made with the browser's cookie must come from the server's own website", async () => {
    const app = await server();
    const own = "https://app.example.com";
    const up = await app.request("/v1/auth/sign-up/email", post(JSON.stringify({ name: "Kim", email: "kim@example.com", password: "correct horse battery" }), { origin: own }));
    assert.equal(up.status, 200);
    const cookie = up.headers.get("set-cookie")!.split(";")[0];
    const token = up.headers.get("set-auth-token")!;
    const venue = (origin?: string, auth?: string) => app.request(`/v1/venues/${randomUUID()}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(auth ? { authorization: `Bearer ${auth}` } : { cookie }) },
        body: JSON.stringify({ name: "Central Park", pitches: [] }),
    });
    assert.equal((await venue("https://evil.example.com")).status, 403, "another site's page, with the cookie");
    assert.equal((await venue("https://lawfive.example.com.evil.net")).status, 403);
    assert.equal((await venue(own)).status, 201, "the server's own website");
    assert.equal((await venue()).status, 201, "a tool, which sends no Origin");
    assert.equal((await venue("https://evil.example.com", token)).status, 201, "a bearer token isn't sent by browsers on their own");
    const read = await app.request("/v1/venues", { headers: { cookie, origin: "https://evil.example.com" } });
    assert.equal(read.status, 200, "reading isn't a change");
});
