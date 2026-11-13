import { Id, WebhookInput, WebhookTopic, type Webhook } from "@lawfive/schema";
import { and, desc, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, type LookupFunction, isIP } from "node:net";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { plansOf } from "./plans.ts";
import { onRecordWrite, toRecord, type RecordWrite } from "./records.ts";

// Webhooks (HOOK-1 to HOOK-5): URLs that hear about changes to the user's records. Every committed
// write (records.ts) queues a delivery for each of the user's webhooks on that topic; a delivery is
// a signed JSON POST, retried with growing waits until it gets a 2xx answer or has had five tries.
// schema/src/endpoints.ts describes the endpoints.
//
//   GET    /v1/webhooks                    the user's webhooks
//   POST   /v1/webhooks                    add one (the answer has its secret, shown once)
//   PUT    /v1/webhooks/:id                change one
//   DELETE /v1/webhooks/:id                delete one
//   GET    /v1/webhooks/:id/deliveries     its latest deliveries
//   POST   /v1/webhooks/:id/test           send an example now

type Topic = z.infer<typeof WebhookTopic>;
type Delivery = typeof tables.webhookDelivery.$inferSelect;

export interface WebhookOptions {
    /** Let webhooks reach private and local addresses (a self-hosted server's own network). Off by default (HOOK-4); a function for a setting an admin can change (ADM-2). */
    allowPrivate?: boolean | (() => boolean);
    /** How often due retries are sent; 0 leaves it to the tests. */
    retryEveryMs?: number;
}

const maxAttempts = 5;
/** Waits before each retry: a minute, 5 minutes, half an hour, 2 hours (about 2.6 hours in all). */
const retryWaitsMs = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const keptDeliveries = 50;
const timeoutMs = 10_000;

const notPublic = new BlockList();
for (const [ip, bits] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
    notPublic.addSubnet(ip, bits, "ipv4");
}
// SEC-4: and the ways of writing an IPv4 address inside an IPv6 one that a host may route to it: the
// old IPv4-compatible ::a.b.c.d, IPv4-translated ::ffff:0:a.b.c.d, local NAT64 and Teredo.
for (const [ip, bits] of [
    ["::", 96], ["::1", 128], ["::ffff:0:0:0", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["2001::", 32], ["100::", 64], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) {
    notPublic.addSubnet(ip, bits, "ipv6");
}

/** Whether an address is private, local or otherwise not on the public internet, however it's written. */
export function privateAddress(ip: string): boolean {
    const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4 || isIP(ip) === 4) {
        return notPublic.check(v4 ?? ip, "ipv4");
    }
    const mapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (mapped) {
        const [high, low] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
        return notPublic.check(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, "ipv4");
    }
    return isIP(ip) === 6 ? notPublic.check(ip, "ipv6") : true;
}

/**
 * SEC-4: answers with the address only if it's public, so a name that changes what it points to
 * between the check and the sending (HOOK-4) still can't reach the server's own network.
 */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, options, ((error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => {
        const found = Array.isArray(address) ? address.map((a) => a.address) : [address];
        if (!error && found.some(privateAddress)) {
            callback(new Error("a private address"), "", 0);
            return;
        }
        (callback as (e: NodeJS.ErrnoException | null, a: string | LookupAddress[], f?: number) => void)(error, address, family);
    }) as never);
};

/** Posts a delivery and gives the answer's status. Never follows a redirect, which could lead anywhere. */
function post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal, allowPrivate: boolean): Promise<number> {
    const send = url.startsWith("https:") ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
        const req = send(url, { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, signal, ...(allowPrivate ? {} : { lookup: publicLookup }) }, (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end(body);
    });
}

/** Why a webhook's address can't be used, or undefined when it can (HOOK-4). */
export async function addressProblem(url: string, allowPrivate: boolean): Promise<string | undefined> {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return "not a web address";
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "only http and https addresses";
    }
    if (allowPrivate) {
        return undefined;
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
        return "a private address (this server doesn't send webhooks to its own network)";
    }
    try {
        const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
        if (addresses.some((a) => privateAddress(a.address))) {
            return "a private address (this server doesn't send webhooks to its own network)";
        }
    } catch {
        return "an address that can't be found";
    }
    return undefined;
}

/** t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">, as receivers check it. */
export function signature(secret: string, body: string, at: number): string {
    const t = Math.floor(at / 1000);
    return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** A webhook as the API shows it. */
function webhookOut(row: typeof tables.webhook.$inferSelect, last?: Delivery): z.infer<typeof Webhook> {
    return {
        id: row.id,
        url: row.url,
        topics: row.topics as Topic[],
        active: row.active,
        createdAt: row.createdAt.toISOString(),
        ...(last ? { lastDelivery: { at: (last.deliveredAt ?? last.createdAt).toISOString(), status: last.status as "pending", ...(last.responseCode !== null ? { responseCode: last.responseCode } : {}) } } : {}),
    };
}

function deliveryOut(d: Delivery) {
    return {
        id: d.id,
        event: d.event,
        status: d.status as "pending" | "delivered" | "failed",
        attempts: d.attempts,
        ...(d.responseCode !== null ? { responseCode: d.responseCode } : {}),
        ...(d.error ? { error: d.error } : {}),
        test: d.test,
        createdAt: d.createdAt.toISOString(),
        ...(d.deliveredAt ? { deliveredAt: d.deliveredAt.toISOString() } : {}),
    };
}

/** What a delivery says about a record: all of it, or for a deletion, which one went. */
function payloadData(write: Pick<RecordWrite, "action" | "row">): Record<string, unknown> {
    const record = toRecord(write.row) as Record<string, unknown>;
    return write.action === "deleted" ? { id: record.id, version: record.version, deletedAt: record.deletedAt } : record;
}

/** Example records for Send test, when the account has none of the topic. */
const examples: Record<Topic, Record<string, unknown>> = {
    match: { id: "00000000-0000-4000-8000-000000000001", status: "scheduled", kickoff: "2026-11-07T09:00:00-08:00", home: { name: "Strikers U12", alias: "STR" }, away: { name: "Rovers U12", alias: "ROV" }, role: "referee" },
    matchRecord: { id: "00000000-0000-4000-8000-000000000002", matchId: "00000000-0000-4000-8000-000000000001", outcome: "completed", score: { home: 2, away: 1 }, periods: [], events: [] },
    venue: { id: "00000000-0000-4000-8000-000000000003", name: "Twin Creeks Sports Complex", pitches: [] },
    referee: { id: "00000000-0000-4000-8000-000000000004", name: "Sam Rivera" },
    competition: { id: "00000000-0000-4000-8000-000000000005", name: "Bay Youth League", type: "league" },
    matchTemplate: { id: "00000000-0000-4000-8000-000000000006", name: "U12: 2×30" },
};

export function webhooksApi(db: Db, options: WebhookOptions = {}) {
    const { webhook, webhookDelivery, records } = tables;
    const allowPrivate = () => (typeof options.allowPrivate === "function" ? options.allowPrivate() : options.allowPrivate ?? false);
    let sending = false;

    /** Sends one delivery and records how it went; retried later unless delivered or out of tries. */
    async function send(d: Delivery, url: string, secret: string): Promise<Delivery> {
        const body = JSON.stringify(d.payload);
        const attempts = d.attempts + 1;
        let responseCode: number | null = null;
        let error: string | null = null;
        const problem = await addressProblem(url, allowPrivate());
        if (problem) {
            error = `Not sent: ${problem}`;
        } else {
            try {
                responseCode = await post(url, {
                    "content-type": "application/json",
                    "user-agent": "LawFive-Webhooks/1",
                    "x-lawfive-event": d.event,
                    "x-lawfive-delivery": d.id,
                    "x-lawfive-signature": signature(secret, body, Date.now()),
                }, body, AbortSignal.timeout(timeoutMs), allowPrivate());
            } catch (e) {
                error = ["TimeoutError", "AbortError"].includes((e as Error).name) ? `No answer in ${timeoutMs / 1000} s` : `Couldn't connect: ${(e as Error).message}`.slice(0, 200);
            }
        }
        const delivered = responseCode !== null && responseCode >= 200 && responseCode < 300;
        const giveUp = !delivered && (d.test || attempts >= maxAttempts);
        const [row] = await db.update(webhookDelivery).set({
            attempts,
            responseCode,
            error,
            status: delivered ? "delivered" : giveUp ? "failed" : "pending",
            deliveredAt: delivered ? new Date() : null,
            nextAttemptAt: delivered || giveUp ? null : new Date(Date.now() + retryWaitsMs[Math.min(attempts - 1, retryWaitsMs.length - 1)]),
        }).where(eq(webhookDelivery.id, d.id)).returning();
        return row;
    }

    /** Sends every delivery that's due, a few at a time. */
    async function sendDue() {
        if (sending) {
            return;
        }
        sending = true;
        try {
            for (;;) {
                const due = await db.select({ d: webhookDelivery, url: webhook.url, secret: webhook.secret })
                    .from(webhookDelivery).innerJoin(webhook, eq(webhook.id, webhookDelivery.webhookId))
                    .where(and(eq(webhookDelivery.status, "pending"), lte(webhookDelivery.nextAttemptAt, new Date())))
                    .orderBy(webhookDelivery.createdAt).limit(10);
                if (!due.length) {
                    break;
                }
                await Promise.all(due.map(({ d, url, secret }) => send(d, url, secret)));
            }
        } finally {
            sending = false;
        }
    }

    /** Keeps a webhook's latest deliveries. */
    async function prune(webhookId: string) {
        const keep = db.select({ id: webhookDelivery.id }).from(webhookDelivery).where(eq(webhookDelivery.webhookId, webhookId))
            .orderBy(desc(webhookDelivery.createdAt)).limit(keptDeliveries);
        await db.delete(webhookDelivery).where(and(eq(webhookDelivery.webhookId, webhookId), notInArray(webhookDelivery.id, keep)));
    }

    // HOOK-1: every committed change to a record queues a delivery for each webhook on its topic.
    onRecordWrite(db, (write) => {
        if (!(WebhookTopic.options as string[]).includes(write.type)) {
            return;
        }
        void (async () => {
            const hooks = await db.select().from(webhook)
                .where(and(eq(webhook.userId, write.userId), eq(webhook.active, true), sql`${webhook.topics} ? ${write.type}`));
            if (!hooks.length) {
                return;
            }
            const event = `${write.type}.${write.action}`;
            const now = new Date();
            const data = payloadData(write);
            await db.insert(webhookDelivery).values(hooks.map((h) => {
                // The delivery's id is in its payload too, so a receiver can tell a retry from a new change.
                const id = randomUUID();
                return { id, webhookId: h.id, event, status: "pending", attempts: 0, test: false, nextAttemptAt: now, createdAt: now, payload: { id, event, createdAt: now.toISOString(), data } };
            }));
            await Promise.all(hooks.map((h) => prune(h.id)));
            await sendDue();
        })().catch((e) => console.error("webhook", e));
    });
    if (options.retryEveryMs !== 0) {
        setInterval(() => void sendDue().catch((e) => console.error("webhook", e)), options.retryEveryMs ?? 30_000).unref();
    }

    const api = new Hono<{ Variables: { userId: string } }>();
    const mine = (userId: string, id: string) => and(eq(webhook.userId, userId), eq(webhook.id, id));
    const invalid = (c: { json: (body: unknown, status: 400) => Response }, message: string) =>
        c.json({ error: message, issues: [{ code: "custom", path: ["url"], message }] }, 400);

    api.get("/webhooks", async (c) => {
        const hooks = await db.select().from(webhook).where(eq(webhook.userId, c.var.userId)).orderBy(desc(webhook.createdAt));
        const latest = hooks.length
            ? await db.selectDistinctOn([webhookDelivery.webhookId]).from(webhookDelivery)
                .where(inArray(webhookDelivery.webhookId, hooks.map((h) => h.id)))
                .orderBy(webhookDelivery.webhookId, desc(webhookDelivery.createdAt))
            : [];
        const last = new Map(latest.map((d) => [d.webhookId, d]));
        return c.json({ webhooks: hooks.map((h) => webhookOut(h, last.get(h.id))) });
    });

    api.post("/webhooks", async (c) => {
        const body = WebhookInput.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid webhook", issues: body.error.issues }, 400);
        }
        // PLAN-2: as many as the account's plan allows.
        const over = await plansOf(db).refuse(c.var.userId, "webhooks");
        if (over) {
            return c.json(over, 403);
        }
        const problem = await addressProblem(body.data.url, allowPrivate());
        if (problem) {
            return invalid(c, `That address can't be used: ${problem}.`);
        }
        const secret = `whsec_${randomBytes(24).toString("base64url")}`;
        const [row] = await db.insert(webhook).values({
            id: randomUUID(), userId: c.var.userId, url: body.data.url, topics: [...new Set(body.data.topics)],
            secret, active: body.data.active ?? true, createdAt: new Date(),
        }).returning();
        return c.json({ ...webhookOut(row), secret }, 201);
    });

    api.put("/webhooks/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const body = WebhookInput.safeParse(await c.req.json().catch(() => undefined));
        if (!id.success) {
            return c.json({ error: "not found" }, 404);
        }
        if (!body.success) {
            return c.json({ error: "invalid webhook", issues: body.error.issues }, 400);
        }
        const problem = await addressProblem(body.data.url, allowPrivate());
        if (problem) {
            return invalid(c, `That address can't be used: ${problem}.`);
        }
        const [row] = await db.update(webhook)
            .set({ url: body.data.url, topics: [...new Set(body.data.topics)], active: body.data.active ?? true })
            .where(mine(c.var.userId, id.data)).returning();
        return row ? c.json(webhookOut(row)) : c.json({ error: "not found" }, 404);
    });

    api.delete("/webhooks/:id", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const removed = id.success ? await db.delete(webhook).where(mine(c.var.userId, id.data)).returning({ id: webhook.id }) : [];
        return removed.length ? c.json({ ok: true as const }) : c.json({ error: "not found" }, 404);
    });

    api.get("/webhooks/:id/deliveries", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const [hook] = id.success ? await db.select({ id: webhook.id }).from(webhook).where(mine(c.var.userId, id.data)) : [];
        if (!hook) {
            return c.json({ error: "not found" }, 404);
        }
        const rows = await db.select().from(webhookDelivery).where(eq(webhookDelivery.webhookId, hook.id))
            .orderBy(desc(webhookDelivery.createdAt)).limit(keptDeliveries);
        return c.json({ deliveries: rows.map(deliveryOut) });
    });

    // HOOK-3: an example delivery now, once, with how it went.
    api.post("/webhooks/:id/test", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const [hook] = id.success ? await db.select().from(webhook).where(mine(c.var.userId, id.data)) : [];
        if (!hook) {
            return c.json({ error: "not found" }, 404);
        }
        const asked = WebhookTopic.safeParse((await c.req.json().catch(() => ({})) as { topic?: unknown }).topic ?? "match");
        const topic: Topic = asked.success ? asked.data : "match";
        // The account's latest record of the topic, else a made-up one.
        const [latest] = await db.select().from(records)
            .where(and(eq(records.userId, c.var.userId), eq(records.type, topic), sql`${records.deletedAt} is null`))
            .orderBy(desc(records.updatedAt)).limit(1);
        const now = new Date();
        const deliveryId = randomUUID();
        const event = `${topic}.updated`;
        const payload = { id: deliveryId, event, createdAt: now.toISOString(), test: true, data: latest ? payloadData({ action: "updated", row: latest }) : examples[topic] };
        const [queued] = await db.insert(webhookDelivery).values({
            id: deliveryId, webhookId: hook.id, event, payload, status: "pending", attempts: 0, test: true, nextAttemptAt: null, createdAt: now,
        }).returning();
        const started = Date.now();
        const sent = await send(queued, hook.url, hook.secret);
        await prune(hook.id);
        return c.json({ delivery: deliveryOut(sent), payload, durationMs: Date.now() - started });
    });

    return api;
}
