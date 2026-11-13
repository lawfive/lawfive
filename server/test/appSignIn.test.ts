import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { checkAnswer } from "./contract.ts";

// Signing in on the phone with a code the web app shows (APP-13).

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const publicUrl = "https://app.example.com";
const password = "correct-horse-battery";
const phone = "android; model=Pixel 9; os=17; app=2026.10.30";

async function server(extra: Partial<AccessSettings> = {}) {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access: AccessSettings = { signUp: "open", adminEmails: [], publicUrl, ...extra };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });

    async function call(method: string, path: string, token?: string, body?: unknown, device?: string) {
        const res = await app.request(path, {
            method,
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { "x-lawfive-device": device } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed, token: res.headers.get("set-auth-token") ?? undefined };
    }
    const account = async (email: string) => (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Reed", email, password })).token!;
    return { db, call, account };
}

test("a code signs a phone in once, as its own device", async () => {
    const s = await server();
    const web = await s.account("sam@example.com");
    const made = await s.call("POST", "/v1/app-sign-in", web);
    assert.equal(made.status, 201);
    assert.match(made.body.code, /^[A-Z2-9]{8}$/);
    assert.equal(made.body.link, `${publicUrl}/get-app#${made.body.code}`);
    assert.equal(made.body.appLink, `lawfive://sign-in?server=${encodeURIComponent(publicUrl)}&code=${made.body.code}`);
    assert.equal((await s.call("GET", `/v1/app-sign-in/${made.body.id}`, web)).body.status, "waiting");

    // Looking it up says whose it is and doesn't use it up; typed any way, it's the same code.
    const typed = `${made.body.code.slice(0, 4).toLowerCase()}-${made.body.code.slice(4).toLowerCase()}`;
    const check = await s.call("POST", "/v1/app-sign-in/check", undefined, { code: typed });
    assert.equal(check.status, 200);
    assert.equal(check.body.email, "sam@example.com");

    const redeemed = await s.call("POST", "/v1/app-sign-in/redeem", undefined, { code: typed }, phone);
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.user.email, "sam@example.com");

    // The token works, and the phone shows under Devices with its name.
    const account = await s.call("GET", "/v1/account", redeemed.body.token, undefined, phone);
    assert.equal(account.status, 200);
    const { devices } = (await s.call("GET", "/v1/devices", web)).body;
    assert.equal(devices.length, 2);
    assert.ok(devices.some((d: { kind: string; name: string }) => d.kind === "android" && d.name === "Pixel 9"));

    // The web app hears which phone used it.
    assert.deepEqual((await s.call("GET", `/v1/app-sign-in/${made.body.id}`, web)).body, { status: "used", deviceName: "Pixel 9" });

    // Once only.
    assert.equal((await s.call("POST", "/v1/app-sign-in/check", undefined, { code: made.body.code })).status, 410);
    assert.equal((await s.call("POST", "/v1/app-sign-in/redeem", undefined, { code: made.body.code })).status, 410);
});

test("only one of two requests at once gets the session", async () => {
    const s = await server();
    const web = await s.account("sam@example.com");
    const { code } = (await s.call("POST", "/v1/app-sign-in", web)).body;
    const answers = await Promise.all([1, 2, 3].map(() => s.call("POST", "/v1/app-sign-in/redeem", undefined, { code })));
    assert.equal(answers.filter((a) => a.status === 200).length, 1);
});

test("an expired code doesn't work, and a new code clears it away", async () => {
    const s = await server();
    const web = await s.account("sam@example.com");
    const { id, code } = (await s.call("POST", "/v1/app-sign-in", web)).body;
    await s.db.update(tables.appSignIn).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(tables.appSignIn.id, id));
    assert.equal((await s.call("POST", "/v1/app-sign-in/check", undefined, { code })).status, 410);
    assert.equal((await s.call("POST", "/v1/app-sign-in/redeem", undefined, { code })).status, 410);
    assert.equal((await s.call("GET", `/v1/app-sign-in/${id}`, web)).body.status, "expired");
    await s.call("POST", "/v1/app-sign-in", web);
    assert.equal((await s.call("GET", `/v1/app-sign-in/${id}`, web)).status, 404);
});

test("wrong codes, others' codes, and who can make them", async () => {
    const s = await server();
    const web = await s.account("sam@example.com");
    const other = await s.account("alex@example.com");
    assert.equal((await s.call("POST", "/v1/app-sign-in/check", undefined, { code: "BCDFGHJK" })).status, 404);
    assert.equal((await s.call("POST", "/v1/app-sign-in/redeem", undefined, { code: "BCDFGHJK" })).status, 404);
    assert.equal((await s.call("POST", "/v1/app-sign-in")).status, 401);
    const { id } = (await s.call("POST", "/v1/app-sign-in", web)).body;
    assert.equal((await s.call("GET", `/v1/app-sign-in/${id}`, other)).status, 404);
    assert.equal((await s.call("GET", `/v1/app-sign-in/${id}`)).status, 401);
});

test("a suspended account's code doesn't sign it in", async () => {
    const s = await server();
    const web = await s.account("sam@example.com");
    const { code } = (await s.call("POST", "/v1/app-sign-in", web)).body;
    await s.db.update(tables.user).set({ status: "suspended" }).where(eq(tables.user.email, "sam@example.com"));
    assert.equal((await s.call("POST", "/v1/app-sign-in/redeem", undefined, { code })).status, 403);
});

test("API_URL is the address phones are given; the QR code stays on the web app's", async () => {
    const s = await server({ apiUrl: "https://api.example.com" });
    const web = await s.account("sam@example.com");
    const { body } = await s.call("POST", "/v1/app-sign-in", web);
    assert.equal(body.server, "https://api.example.com");
    assert.ok(body.link.startsWith(`${publicUrl}/get-app#`));
    assert.ok(body.appLink.includes(encodeURIComponent("https://api.example.com")));
    assert.equal((await s.call("GET", "/v1/meta")).body.apiUrl, "https://api.example.com");
});
