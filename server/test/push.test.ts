import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { Push, newRisks, tellNewRisks } from "../src/push.ts";
import { saveRecord } from "../src/records.ts";
import { Weather } from "../src/weather/service.ts";
import type { Hourly } from "../src/weather/openMeteo.ts";
import { checkAnswer } from "./contract.ts";

// Notifications through the push relay (PUSH-4, PUSH-5), against PGlite and a made-up relay.

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const phone = "android; model=Pixel 9; os=17; app=2026.11.1";
const MATCH = "11111111-1111-4111-8111-111111111111";
const VENUE = "22222222-2222-4222-8222-222222222222";
const NOW = new Date(Date.UTC(2026, 10, 5, 12));
const KICKOFF = Date.UTC(2026, 10, 7, 17) / 1000;

/** Hours around kickoff, mild unless it's stormy. */
function forecast(storm: () => boolean): Hourly {
    const h: Hourly = { time: [], temperature: [], apparent: [], precipitation: [], chance: [], snowfall: [], code: [], gust: [], isDay: [] };
    for (let n = -72; n <= 72; n++) {
        h.time.push(KICKOFF + n * 3600);
        h.temperature.push(15);
        h.apparent.push(14);
        h.precipitation.push(0);
        h.chance.push(5);
        h.snowfall.push(0);
        h.code.push(storm() ? 95 : 1);
        h.gust.push(20);
        h.isDay.push(1);
    }
    return h;
}

async function server() {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access: AccessSettings = { signUp: "open", adminEmails: [], publicUrl: "https://app.example.com" };
    const state = { storm: true };
    const weather = new Weather(db, { source: "Test", dailyLimit: 1000, provider: async (places) => places.map(() => forecast(() => state.storm)) });
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access, weather, push: true });
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
    const account = async (email: string) => {
        const res = await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Reed", email, password: "correct-horse-battery" });
        return { token: res.token!, userId: res.body.user.id as string };
    };
    return { db, call, account, weather, state };
}

/** A made-up relay: what it was sent, and how it answers. */
function relay(answer: () => Response = () => Response.json({ sent: true })) {
    const sent: { url: string; body: { handle: string; type: string; id: string } }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
        sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return answer();
    }) as typeof fetch;
    return { sent, fetcher };
}

const plan = async (s: Awaited<ReturnType<typeof server>>, userId: string, kickoff = KICKOFF) => {
    await saveRecord(s.db, userId, "venue", VENUE, { name: "North Field", position: { lat: 34, lon: -118 }, pitches: [] }, undefined);
    await saveRecord(s.db, userId, "match", MATCH, {
        status: "scheduled", kickoff: new Date(kickoff * 1000).toISOString(), timeZone: "America/Los_Angeles", format: defaultFormat,
        home: { name: "Strikers", shortName: "STR" }, away: { name: "Rovers", shortName: "ROV" }, venueId: VENUE, referees: [], attachments: [],
    }, undefined);
};

describe("a phone's handle (PUSH-4)", () => {
    test("is kept with its session, and can be taken away", async () => {
        const s = await server();
        const { token } = await s.account("a@example.com");
        assert.ok((await s.call("GET", "/v1/meta")).body.capabilities.includes("push"));
        assert.equal((await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.abc" }, phone)).status, 200);
        const [row] = await s.db.select().from(tables.device);
        assert.equal(row.pushHandle, "v1.abc");
        assert.equal(row.kind, "android");
        assert.equal((await s.call("PUT", "/v1/devices/current/push", token, { handle: null }, phone)).status, 200);
        assert.equal((await s.db.select().from(tables.device))[0].pushHandle, null);
    });

    test("needs a device, and a handle of the right shape", async () => {
        const s = await server();
        const { token } = await s.account("b@example.com");
        assert.equal((await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.abc" })).status, 400);
        assert.equal((await s.call("PUT", "/v1/devices/current/push", token, { handle: 7 }, phone)).status, 400);
        assert.equal((await s.call("PUT", "/v1/devices/current/push", undefined, { handle: "x" }, phone)).status, 401);
    });

    test("goes when the phone signs out", async () => {
        const s = await server();
        const { token } = await s.account("c@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.abc" }, phone);
        await s.call("POST", "/v1/auth/sign-out", token, {}, phone);
        assert.equal((await s.db.select().from(tables.device)).length, 0);
    });
});

describe("sending (PUSH-1, PUSH-2)", () => {
    test("sends each phone only the event and id", async () => {
        const s = await server();
        const { token, userId } = await s.account("d@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        const r = relay();
        assert.equal(await new Push(s.db, "https://relay.test/", r.fetcher).notify(userId, "weather-risk", MATCH), 1);
        assert.deepEqual(r.sent, [{ url: "https://relay.test/v1/send", body: { handle: "v1.one", type: "weather-risk", id: MATCH } }]);
    });

    test("forgets a handle the relay says is dead", async () => {
        const s = await server();
        const { token, userId } = await s.account("e@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.dead" }, phone);
        const r = relay(() => Response.json({ error: "gone" }, { status: 410 }));
        assert.equal(await new Push(s.db, "https://relay.test", r.fetcher).notify(userId, "weather-risk", MATCH), 0);
        assert.equal((await s.db.select().from(tables.device))[0].pushHandle, null);
    });

    test("stops at the server's limit until it lifts, and skips only a device at its own", async () => {
        const s = await server();
        const { token, userId } = await s.account("f@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        const now = NOW.getTime();
        const full = relay(() => Response.json({ limit: "server", retryAfter: 100 }, { status: 429 }));
        const push = new Push(s.db, "https://relay.test", full.fetcher);
        assert.equal(await push.notify(userId, "weather-risk", MATCH, now), 0);
        assert.equal(await push.notify(userId, "weather-risk", MATCH, now + 50_000), 0);
        assert.equal(full.sent.length, 1);
        await push.notify(userId, "weather-risk", MATCH, now + 101_000);
        assert.equal(full.sent.length, 2);

        const device = relay(() => Response.json({ limit: "device", retryAfter: 100 }, { status: 429 }));
        const other = new Push(s.db, "https://relay.test", device.fetcher);
        await other.notify(userId, "weather-risk", MATCH, now);
        await other.notify(userId, "weather-risk", MATCH, now + 50_000);
        assert.equal(device.sent.length, 1);
        assert.equal((await s.db.select().from(tables.device))[0].pushHandle, "v1.one");
    });

    test("sends its RELAY_KEY when it has one, and holds off when the relay refuses it (PUSH-7)", async () => {
        const s = await server();
        const { token, userId } = await s.account("k@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        const headers: (string | null)[] = [];
        const answer = { status: 200 };
        const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
            headers.push(new Headers(init?.headers).get("authorization"));
            return answer.status === 200 ? Response.json({ sent: true }) : Response.json({ error: "This server's sends need its relay key." }, { status: answer.status });
        }) as typeof fetch;
        const now = NOW.getTime();
        assert.equal(await new Push(s.db, "https://relay.test", fetcher, "the-key").notify(userId, "weather-risk", MATCH, now), 1);
        assert.equal(await new Push(s.db, "https://relay.test", fetcher).notify(userId, "weather-risk", MATCH, now), 1);
        assert.deepEqual(headers, ["Bearer the-key", null], "no key, no header");
        answer.status = 401;
        const refused = new Push(s.db, "https://relay.test", fetcher, "an-old-key");
        assert.equal(await refused.notify(userId, "weather-risk", MATCH, now), 0);
        assert.equal(await refused.notify(userId, "weather-risk", MATCH, now + 30 * 60_000), 0);
        assert.equal(headers.length, 3, "nothing more tried within the hour");
        await refused.notify(userId, "weather-risk", MATCH, now + 61 * 60_000);
        assert.equal(headers.length, 4);
    });

    test("doesn't throw when the relay is down", async () => {
        const s = await server();
        const { token, userId } = await s.account("g@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        const down = (async () => { throw new Error("no route"); }) as typeof fetch;
        assert.equal(await new Push(s.db, "https://relay.test", down).notify(userId, "weather-risk", MATCH), 0);
    });
});

describe("an admin's test (PUSH-6)", () => {
    async function admin(answer?: () => Response, relayOn = true) {
        const pg = new PGlite();
        const db = drizzle(pg, { schema: tables });
        await migrate(db, { migrationsFolder });
        const r = relay(answer);
        const access: AccessSettings = { signUp: "open", adminEmails: [], publicUrl: "https://app.example.com", ...(relayOn ? { push: new Push(db, "https://relay.test", r.fetcher) } : {}) };
        const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access, push: relayOn });
        const call = async (method: string, path: string, token?: string, body?: unknown, device?: string) => {
            const res = await app.request(path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(device ? { "x-lawfive-device": device } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
            const text = await res.text();
            const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
            checkAnswer(method, path, res.status, parsed, body);
            return { status: res.status, body: parsed, token: res.headers.get("set-auth-token") ?? undefined };
        };
        const account = async (email: string) => (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Sam Reed", email, password: "correct-horse-battery" })).token!;
        return { r, call, account };
    }

    test("sends to the admin's own phones, with no record", async () => {
        const s = await admin();
        const token = await s.account("boss@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.mine" }, phone);
        const res = await s.call("POST", "/v1/server-settings/test-push", token);
        assert.equal(res.status, 200);
        assert.equal(res.body.sent, 1);
        assert.deepEqual(s.r.sent[0].body, { handle: "v1.mine", type: "test" });
    });

    test("says when no phone has them on, or they're off on the server", async () => {
        const s = await admin();
        const res = await s.call("POST", "/v1/server-settings/test-push", await s.account("boss@example.com"));
        assert.equal(res.status, 409);
        assert.match(res.body.error, /Tell me about weather risks/);
        const off = await admin(undefined, false);
        const offRes = await off.call("POST", "/v1/server-settings/test-push", await off.account("boss@example.com"));
        assert.equal(offRes.status, 409);
        assert.match(offRes.body.error, /PUSH_RELAY_URL=off/);
    });

    test("says why when the relay doesn't take it", async () => {
        const s = await admin(() => Response.json({ error: "blocked" }, { status: 403 }));
        const token = await s.account("boss@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.mine" }, phone);
        const res = await s.call("POST", "/v1/server-settings/test-push", token);
        assert.equal(res.status, 502);
        assert.match(res.body.error, /blocked this server/);
    });

    test("isn't for everyone", async () => {
        const s = await admin();
        await s.account("boss@example.com");
        const res = await s.call("POST", "/v1/server-settings/test-push", await s.account("other@example.com"));
        assert.equal(res.status, 403);
        assert.equal(s.r.sent.length, 0);
    });
});

describe("new weather risks (PUSH-5)", () => {
    test("what counts as new", () => {
        const possible = { kind: "lightning", level: "possible", amount: 1 } as never;
        const likely = { kind: "lightning", level: "likely", amount: 1 } as never;
        assert.deepEqual(newRisks([possible], []), ["lightning:possible"]);
        assert.deepEqual(newRisks([possible], ["lightning:possible"]), []);
        assert.deepEqual(newRisks([likely], ["lightning:possible"]), ["lightning:likely"]);
        assert.deepEqual(newRisks([possible], ["lightning:likely"]), []);
    });

    test("tells a phone once", async () => {
        const s = await server();
        const { token, userId } = await s.account("h@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        await plan(s, userId);
        await s.weather.run(NOW);
        const r = relay();
        const push = new Push(s.db, "https://relay.test", r.fetcher);
        await tellNewRisks(s.db, s.weather, push, NOW);
        assert.equal(r.sent.length, 1);
        assert.equal(r.sent[0].body.id, MATCH);
        assert.equal(r.sent[0].body.type, "weather-risk");
        await tellNewRisks(s.db, s.weather, push, NOW);
        assert.equal(r.sent.length, 1);
    });

    test("tries again if no phone took it", async () => {
        const s = await server();
        const { token, userId } = await s.account("i@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        await plan(s, userId);
        await s.weather.run(NOW);
        const down = relay(() => new Response("no", { status: 502 }));
        await tellNewRisks(s.db, s.weather, new Push(s.db, "https://relay.test", down.fetcher), NOW);
        assert.equal((await s.db.select().from(tables.riskAlert)).length, 0);
        const up = relay();
        await tellNewRisks(s.db, s.weather, new Push(s.db, "https://relay.test", up.fetcher), NOW);
        assert.equal(up.sent.length, 1);
    });

    test("leaves out matches too far ahead, and people without a phone taking them", async () => {
        const s = await server();
        const { userId } = await s.account("j@example.com");
        await plan(s, userId);
        await s.weather.run(NOW);
        const r = relay();
        await tellNewRisks(s.db, s.weather, new Push(s.db, "https://relay.test", r.fetcher), NOW);
        assert.equal(r.sent.length, 0);

        const far = await server();
        const other = await far.account("k@example.com");
        await far.call("PUT", "/v1/devices/current/push", other.token, { handle: "v1.one" }, phone);
        await plan(far, other.userId);
        await far.weather.run(NOW);
        const early = new Date(KICKOFF * 1000 - 4 * 86_400_000);
        await tellNewRisks(far.db, far.weather, new Push(far.db, "https://relay.test", r.fetcher), early);
        assert.equal(r.sent.length, 0);
    });

    test("starts again for a match moved to another day", async () => {
        const s = await server();
        const { token, userId } = await s.account("l@example.com");
        await s.call("PUT", "/v1/devices/current/push", token, { handle: "v1.one" }, phone);
        await plan(s, userId);
        await s.weather.run(NOW);
        const r = relay();
        const push = new Push(s.db, "https://relay.test", r.fetcher);
        await tellNewRisks(s.db, s.weather, push, NOW);
        await s.db.update(tables.riskAlert).set({ kickoff: new Date(0) }).where(eq(tables.riskAlert.userId, userId));
        await tellNewRisks(s.db, s.weather, push, NOW);
        assert.equal(r.sent.length, 2);
    });
});
