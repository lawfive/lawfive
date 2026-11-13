import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { lockLength, lockoutsOf } from "../src/lockout.ts";
import type { Message } from "../src/mail.ts";
import { checkAnswer } from "./contract.ts";

// SEC-12: wrong passwords per email address, with a lock that grows, and the ways out of it.

const publicUrl = "http://localhost:3000";
const password = "correct horse battery";
const minute = 60_000;

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
await migrate(db, { migrationsFolder });
const sent: Message[] = [];
const access: AccessSettings = { signUp: "open", adminEmails: ["boss@example.com"], publicUrl, mailer: { send: async (m: Message) => void sent.push(m) } };
const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function call(method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, token: res.headers.get("set-auth-token") ?? undefined, retryAfter: res.headers.get("retry-after") };
}
const signIn = (email: string, pw = password) => call("POST", "/v1/auth/sign-in/email", undefined, { email, password: pw });

describe("account lockouts", () => {
    let boss: string;
    let samId: string;

    test("the lock is free for 5 tries, then a minute doubling to at most an hour", () => {
        assert.deepEqual([1, 4, 5, 6, 7, 10, 11, 20].map((n) => lockLength(n) / minute), [0, 0, 1, 2, 4, 32, 60, 60]);
    });

    test("five wrong passwords lock the address, even for the right one", async () => {
        boss = (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "The Boss", email: "boss@example.com", password })).token!;
        samId = (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Lee", email: "sam@example.com", password })).body.user.id;
        for (let i = 0; i < 5; i++) {
            assert.equal((await signIn("sam@example.com", "wrong password")).status, 401);
        }
        const locked = await signIn("Sam@Example.com");
        assert.equal(locked.status, 429);
        assert.equal(locked.body.code, "ACCOUNT_LOCKED");
        assert.match(locked.body.message, /Try again in 1 minute, or reset your password/);
        assert.ok(Number(locked.retryAfter) > 0 && Number(locked.retryAfter) <= 60);
    });

    test("the owner is told once, and admins see the lock", async () => {
        await settle();
        const told = sent.filter((m) => m.subject === "Wrong passwords for your LawFive account");
        assert.deepEqual(told.map((m) => m.to), ["sam@example.com"]);
        const sam = (await call("GET", "/v1/people", boss)).body.people.find((p: { id: string }) => p.id === samId);
        assert.ok(Date.parse(sam.lockedUntil) > Date.now());
    });

    test("an admin's Unlock lets them straight back in", async () => {
        assert.equal((await call("POST", `/v1/people/${samId}/unlock`, undefined, {})).status, 401);
        const unlocked = await call("POST", `/v1/people/${samId}/unlock`, boss, {});
        assert.equal(unlocked.status, 200);
        assert.equal(unlocked.body.lockedUntil, undefined);
        assert.equal((await signIn("sam@example.com")).status, 200);
    });

    test("a password reset ends a lock", async () => {
        for (let i = 0; i < 5; i++) {
            await signIn("sam@example.com", "wrong password");
        }
        assert.equal((await signIn("sam@example.com")).status, 429);
        const link = (await call("POST", `/v1/people/${samId}/reset-link`, boss, {})).body.link as string;
        const token = new URL(link).searchParams.get("token") ?? link.split("/").at(-1);
        assert.equal((await call("POST", "/v1/auth/reset-password", undefined, { token, newPassword: "a brand new password" })).status, 200);
        assert.equal((await signIn("sam@example.com", "a brand new password")).status, 200);
    });

    test("an address with no account locks the same way, and nobody is emailed", async () => {
        const before = sent.length;
        for (let i = 0; i < 5; i++) {
            assert.equal((await signIn("nobody@example.com", "guess")).status, 401);
        }
        assert.equal((await signIn("nobody@example.com", "guess")).body.code, "ACCOUNT_LOCKED");
        await settle();
        assert.equal(sent.length, before);
    });

    test("the lock grows after each one ends, and a day without wrong passwords forgets them", async () => {
        const lockouts = lockoutsOf(db, access);
        const t0 = Date.parse("2026-11-05T12:00:00Z");
        for (let i = 0; i < 5; i++) {
            await lockouts.failed("pat@example.com", t0);
        }
        assert.equal(await lockouts.locked("pat@example.com", t0), 60);
        assert.equal(await lockouts.locked("pat@example.com", t0 + minute), undefined);
        await lockouts.failed("pat@example.com", t0 + minute);
        assert.equal(await lockouts.locked("pat@example.com", t0 + minute), 120);
        // A day later the count starts again: one wrong password is free.
        await lockouts.failed("pat@example.com", t0 + 25 * 60 * minute);
        assert.equal(await lockouts.locked("pat@example.com", t0 + 25 * 60 * minute), undefined);
    });

    test("an address a day past its last wrong password is deleted, not only ignored", async () => {
        const lockouts = lockoutsOf(db, access);
        const t0 = Date.parse("2026-11-12T12:00:00Z");
        await lockouts.failed("old@example.com", t0);
        await lockouts.failed("recent@example.com", t0 + 20 * 60 * minute);
        const kept = async () => (await db.select({ email: tables.signInLock.email }).from(tables.signInLock)).map((r) => r.email);
        await lockouts.forget(t0 + 25 * 60 * minute);
        assert.ok(!(await kept()).includes("old@example.com"));
        assert.ok((await kept()).includes("recent@example.com"));
    });
});
