import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// The quiz's questions (QUIZ-1), through the API, checked against its description.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));
let token: string;

describe("quiz", () => {
    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json", origin: publicUrl }, body: JSON.stringify({ name: "Sam", email: "sam@example.com", password: "a-long-enough-password" }) });
        token = res.headers.get("set-auth-token")!;
    });

    test("signed in, it gives the active questions", async () => {
        const res = await app.request("/v1/quiz", { headers: { authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
        const bank = await res.json() as { language: string; questions: { status: string }[] };
        checkAnswer("GET", "/v1/quiz", 200, bank);
        assert.equal(bank.language, "en");
        assert.ok(bank.questions.length >= 120);
        assert.ok(bank.questions.every((q) => q.status === "active"));
    });

    test("a language with no questions is a 404, and it needs signing in", async () => {
        const missing = await app.request("/v1/quiz?language=zz", { headers: { authorization: `Bearer ${token}` } });
        assert.equal(missing.status, 404);
        checkAnswer("GET", "/v1/quiz", 404, await missing.json());
        assert.equal((await app.request("/v1/quiz?language=../secrets", { headers: { authorization: `Bearer ${token}` } })).status, 404);
        assert.equal((await app.request("/v1/quiz")).status, 401);
    });
});
