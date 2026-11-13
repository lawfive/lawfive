import { type ApiKey, ApiKeyChange, NewApiKey } from "@lawfive/schema";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { plansOf } from "./plans.ts";

// API keys for scripts and integrations (KEY-1 to KEY-4). A key is "lf_" and 43 random characters;
// the server keeps only its SHA-256 (the key is random enough that a slow hash adds nothing) and
// its first characters. Only a signed-in session manages keys; app.ts checks a key's scopes
// against the endpoint it calls.
//
//   GET    /v1/api-keys        the account's keys, newest first
//   POST   /v1/api-keys        make one; the answer has the key, shown only this once
//   PATCH  /v1/api-keys/:id    whether it notifies the user's phones (NOTE-1)
//   DELETE /v1/api-keys/:id    delete one; it stops working straight away

export const keyPrefix = "lf_";

type Row = typeof tables.apiKey.$inferSelect;

const hashOf = (key: string) => createHash("sha256").update(key).digest("hex");

function toApiKey(row: Row): z.infer<typeof ApiKey> {
    return {
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes: row.scopes,
        createdAt: row.createdAt.toISOString(),
        ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
        ...(row.expiresAt ? { expiresAt: row.expiresAt.toISOString() } : {}),
        notify: row.notify,
    };
}

export type KeyCheck = { key: { id: string; userId: string; name: string; scopes: string[]; notify: boolean } } | { error: string };

/** Finds the key a request carries, noting when it was used (at most every five minutes). */
export async function checkKey(db: Db, key: string, now = new Date()): Promise<KeyCheck> {
    const [row] = await db.select().from(tables.apiKey).where(eq(tables.apiKey.hash, hashOf(key)));
    if (!row) {
        return { error: "this API key isn't valid: it was deleted, or it's mistyped" };
    }
    if (row.expiresAt && row.expiresAt <= now) {
        return { error: "this API key has expired" };
    }
    const [owner] = await db.select({ status: tables.user.status }).from(tables.user).where(eq(tables.user.id, row.userId));
    if (owner?.status === "suspended") {
        return { error: "this API key's account is suspended" };
    }
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
        await db.update(tables.apiKey).set({ lastUsedAt: now }).where(eq(tables.apiKey.id, row.id));
    }
    return { key: { id: row.id, userId: row.userId, name: row.name, scopes: row.scopes, notify: row.notify } };
}

export function apiKeysApi(db: Db) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const { apiKey } = tables;

    api.get("/api-keys", async (c) => {
        const rows = await db.select().from(apiKey).where(eq(apiKey.userId, c.var.userId)).orderBy(desc(apiKey.createdAt));
        return c.json({ keys: rows.map(toApiKey) });
    });

    api.post("/api-keys", async (c) => {
        const body = NewApiKey.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid API key", issues: body.error.issues }, 400);
        }
        // PLAN-2: as many as the account's plan allows.
        const over = await plansOf(db).refuse(c.var.userId, "apiKeys");
        if (over) {
            return c.json(over, 403);
        }
        const key = keyPrefix + randomBytes(32).toString("base64url");
        const now = new Date();
        const { name, scopes, expiresInDays, notify } = body.data;
        const [row] = await db.insert(apiKey).values({
            id: randomUUID(),
            userId: c.var.userId,
            name,
            prefix: key.slice(0, keyPrefix.length + 8),
            hash: hashOf(key),
            scopes: [...new Set(scopes)],
            createdAt: now,
            expiresAt: expiresInDays ? new Date(now.getTime() + expiresInDays * 86_400_000) : null,
            notify: notify ?? false,
        }).returning();
        return c.json({ ...toApiKey(row), key }, 201);
    });

    api.patch("/api-keys/:id", async (c) => {
        const id = c.req.param("id");
        const body = ApiKeyChange.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid change", issues: body.error.issues }, 400);
        }
        const [row] = /^[0-9a-f-]{36}$/i.test(id)
            ? await db.update(apiKey).set({ notify: body.data.notify }).where(and(eq(apiKey.id, id), eq(apiKey.userId, c.var.userId))).returning()
            : [];
        return row ? c.json(toApiKey(row)) : c.json({ error: "not found" }, 404);
    });

    api.delete("/api-keys/:id", async (c) => {
        const id = c.req.param("id");
        const removed = /^[0-9a-f-]{36}$/i.test(id)
            ? await db.delete(apiKey).where(and(eq(apiKey.id, id), eq(apiKey.userId, c.var.userId))).returning({ id: apiKey.id })
            : [];
        return removed.length ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
    });

    return api;
}
