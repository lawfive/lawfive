import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { checkAnswer } from "./contract.ts";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

// ADM-7: what Docker's healthcheck asks.
test("health follows the database, and nothing else", async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access: AccessSettings = { signUp: "open", adminEmails: [], publicUrl: "https://app.example.com" };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
    const up = await app.request("/health");
    assert.equal(up.status, 200);
    assert.equal(await up.text(), "ok");
    checkAnswer("GET", "/health", 200, "ok");
    await pg.close();
    const down = await app.request("/health");
    assert.equal(down.status, 503);
    assert.equal(await down.text(), "database unavailable");
    checkAnswer("GET", "/health", 503, "database unavailable");
});
