import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { Table, eq, getTableColumns, is } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";

// APP-21, IOS-10: deleting an account, as the phones ask for it, leaves nothing of it in any table,
// and doesn't touch anyone else's. The stores require it, and a new table should fail here if it's missed.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));
const password = "a-long-enough-password";

async function call(method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, token: res.headers.get("set-auth-token") ?? undefined, body: await res.json().catch(() => undefined) as any };
}

const signUp = async (email: string) => (await call("POST", "/v1/auth/sign-up/email", undefined, { name: email, email, password })).token!;
const id = (n: number) => `6c0a1e2b-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Rows of this user in every table that says whose it is. */
async function rowsOf(userId: string) {
    const found: Record<string, number> = {};
    for (const [name, table] of Object.entries(tables) as [string, any][]) {
        if (!is(table, Table)) {
            continue;
        }
        const columns = getTableColumns(table) as Record<string, any>;
        const column = name === "user" ? columns.id : columns.userId;
        if (column) {
            const rows = await db.select().from(table).where(eq(column, userId));
            if (rows.length) {
                found[name] = rows.length;
            }
        }
    }
    return found;
}

describe("deleting an account", () => {
    let admin: string;
    let token: string;
    let other: string;
    let userId: string;
    let otherId: string;

    before(async () => {
        await migrate(db, { migrationsFolder });
        // The first account is the server's admin, who can't delete theirs while others depend on it.
        admin = await signUp("boss@example.com");
        token = await signUp("sam@example.com");
        other = await signUp("lee@example.com");
        userId = (await call("GET", "/v1/account", token)).body.id;
        otherId = (await call("GET", "/v1/account", other)).body.id;
        const match = { kickoff: "2026-11-07T10:00:00-08:00", timeZone: "America/Los_Angeles", status: "played", role: "referee", crew: [], tags: [], format: defaultFormat, home: { name: "Strikers" }, away: { name: "Rovers" } };
        const mine = await call("PUT", `/v1/matches/${id(1)}`, token, match);
        assert.equal(mine.status, 201, JSON.stringify(mine.body));
        assert.equal((await call("PUT", `/v1/venues/${id(2)}`, token, { name: "Twin Creeks", pitches: [] })).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${id(3)}`, other, match)).status, 201);
    });

    test("a wrong password changes nothing", async () => {
        assert.equal((await call("POST", "/v1/account/delete", token, { password: "not it" })).status, 400);
        assert.equal((await call("GET", "/v1/account", token)).status, 200);
    });

    test("the server's only admin is told why, and nothing changes", async () => {
        const refused = await call("POST", "/v1/account/delete", admin, { password });
        assert.equal(refused.status, 409);
        assert.match(refused.body.error, /only admin/);
        assert.equal((await call("GET", "/v1/account", admin)).status, 200);
    });

    test("the right one leaves nothing of it, signs it out, and leaves others alone", async () => {
        assert.ok(Object.keys(await rowsOf(userId)).length >= 3, "it has rows to delete");
        // A wrong password, kept by address rather than by account (SEC-12).
        assert.equal((await call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password: "not it" })).status, 401);
        const locksOfSam = () => db.select().from(tables.signInLock).where(eq(tables.signInLock.email, "sam@example.com"));
        assert.equal((await locksOfSam()).length, 1);
        assert.equal((await call("POST", "/v1/account/delete", token, { password })).status, 200);
        assert.deepEqual(await rowsOf(userId), {});
        assert.deepEqual(await locksOfSam(), [], "its address's wrong passwords go too");
        assert.equal((await call("GET", "/v1/account", token)).status, 401);
        assert.equal((await call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password })).status, 401);
        assert.ok(Object.keys(await rowsOf(otherId)).length >= 3);
        assert.equal((await call("GET", `/v1/matches/${id(3)}`, other)).status, 200);
    });
});
