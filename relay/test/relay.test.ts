import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { ServerCounter, type CounterStorage } from "../src/counter.ts";
import { forgetAccessToken, message } from "../src/fcm.ts";
import { open, seal, server } from "../src/handle.ts";
import { handle } from "../src/index.ts";
import type { CounterNamespace, Env } from "../src/env.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const HANDLE_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const FCM_SERVICE_ACCOUNT = JSON.stringify({ project_id: "lawfive-test", client_email: "relay@test", private_key: privateKey });
const ID = "6c0a3f7e-5d0b-4a55-9d0e-0f4a1b2c3d4e";

class MemoryStorage implements CounterStorage {
    data = new Map<string, unknown>();
    async get<T>(key: string) { return this.data.get(key) as T | undefined; }
    async put(key: string, value: unknown) { this.data.set(key, value); }
    async deleteAll() { this.data.clear(); }
    alarm?: number;
    async setAlarm(at: number) { this.alarm = at; }
}

function counters(): CounterNamespace {
    const objects = new Map<unknown, ServerCounter>();
    return {
        idFromName: (name) => name,
        get: (id) => {
            if (!objects.has(id)) {
                objects.set(id, new ServerCounter({ storage: new MemoryStorage() }));
            }
            return { fetch: (url, init) => objects.get(id)!.fetch(new Request(url, init)) };
        },
    };
}

const env = (more: Partial<Env> = {}): Env => ({ COUNTERS: counters(), HANDLE_KEY, FCM_SERVICE_ACCOUNT, ...more });

/** Firebase, as the relay calls it: what it was asked, and what it answers. */
function firebase(reply: () => Response = () => Response.json({ name: "sent" })) {
    const sends: { url: string; body: any; auth: string | null }[] = [];
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("oauth2.googleapis.com")) {
            return Response.json({ access_token: "access", expires_in: 3600 });
        }
        sends.push({ url, body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") });
        return reply();
    }) as typeof fetch;
    return { fetcher, sends };
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://push.test${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });

async function handleFor(e: Env, token = "token-1", address = "https://ref.example.com") {
    const res = await handle(post("/v1/register", { token, server: address, platform: "android" }), e);
    assert.equal(res.status, 200);
    return (await res.json() as { handle: string }).handle;
}

describe("handles (PUSH-2)", () => {
    it("hides what they hold, and only this key opens them", async () => {
        const sealed = { token: "secret-token", server: "https://a.example", platform: "android" as const, expires: 2_000_000_000 };
        const h = await seal(HANDLE_KEY, sealed);
        assert.ok(!atob(h.slice(3).replace(/-/g, "+").replace(/_/g, "/")).includes("secret-token"));
        assert.deepEqual(await open(HANDLE_KEY, h, 1_000), sealed);
        assert.equal(await open(btoa(String.fromCharCode(...new Uint8Array(32).fill(9))), h, 1_000), undefined);
    });

    it("refuses altered, expired and junk handles", async () => {
        const h = await seal(HANDLE_KEY, { token: "t", server: "https://a.example", platform: "android", expires: 2_000 });
        const flipped = h.slice(0, -2) + (h.endsWith("A") ? "BB" : "AA");
        assert.equal(await open(HANDLE_KEY, flipped, 1_000), undefined);
        assert.equal(await open(HANDLE_KEY, h, 3_000), undefined);
        for (const junk of ["", "v1.", "v2.abc", "nonsense", "v1.!!!"]) {
            assert.equal(await open(HANDLE_KEY, junk, 1_000), undefined);
        }
    });

    it("spells a server one way, and refuses what isn't one", () => {
        assert.equal(server("HTTPS://Ref.Example.com/"), "https://ref.example.com");
        assert.equal(server("https://example.com/lawfive/"), "https://example.com/lawfive");
        for (const bad of ["ftp://x.example", "not a url", "https://u:p@x.example", 7, undefined]) {
            assert.equal(server(bad), undefined);
        }
    });
});

describe("registering", () => {
    it("gives a handle lasting 90 days", async () => {
        const res = await handle(post("/v1/register", { token: "t", server: "https://a.example/", platform: "ios" }), env());
        const body = await res.json() as { handle: string; expiresAt: string };
        const sealed = await open(HANDLE_KEY, body.handle);
        assert.equal(sealed?.server, "https://a.example");
        assert.equal(sealed?.platform, "ios");
        const days = (new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000;
        assert.ok(days > 89.9 && days <= 90);
    });

    it("refuses bad requests and blocked servers", async () => {
        for (const bad of [{}, { token: "t", server: "nope", platform: "android" }, { token: "t", server: "https://a.example", platform: "web" }, { token: "x".repeat(2049), server: "https://a.example", platform: "android" }, "not json"]) {
            assert.equal((await handle(post("/v1/register", bad), env())).status, 400);
        }
        const blocked = env({ SERVER_OVERRIDES: JSON.stringify({ "https://bad.example": { blocked: true } }) });
        assert.equal((await handle(post("/v1/register", { token: "t", server: "https://bad.example", platform: "android" }), blocked)).status, 403);
    });
});

describe("sending", () => {
    beforeEach(forgetAccessToken);

    it("sends only the event and record to Firebase, signed in", async () => {
        const e = env();
        const fb = firebase();
        const res = await handle(post("/v1/send", { handle: await handleFor(e), type: "weather-risk", id: ID }), e, fb.fetcher);
        assert.equal(res.status, 200);
        assert.equal(fb.sends.length, 1);
        assert.match(fb.sends[0].url, /projects\/lawfive-test\/messages:send$/);
        assert.equal(fb.sends[0].auth, "Bearer access");
        assert.deepEqual(fb.sends[0].body.message.data, { type: "weather-risk", id: ID });
        assert.equal(fb.sends[0].body.message.token, "token-1");
        assert.equal(fb.sends[0].body.message.android.priority, "HIGH");
    });

    it("takes a test, with no record (PUSH-6)", async () => {
        const e = env();
        const fb = firebase();
        const res = await handle(post("/v1/send", { handle: await handleFor(e), type: "test" }), e, fb.fetcher);
        assert.equal(res.status, 200);
        assert.deepEqual(fb.sends[0].body.message.data, { type: "test" });
    });

    it("gives the iPhone words that say nothing about the match", () => {
        const m = message({ token: "t", server: "https://a.example", platform: "ios", expires: 1 }, "weather-risk", ID).message as any;
        assert.equal(m.apns.payload.aps["mutable-content"], 1);
        assert.deepEqual(m.data, { type: "weather-risk", id: ID });
        assert.equal(m.android, undefined);
    });

    it("can't be made to carry anything but a known event and an id", async () => {
        const e = env();
        const fb = firebase();
        const h = await handleFor(e);
        for (const bad of [{ handle: h, type: "free-text", id: ID }, { handle: h, type: "weather-risk", id: "buy things at example.com" }, { handle: h }, { type: "weather-risk" }]) {
            assert.equal((await handle(post("/v1/send", bad), e, fb.fetcher)).status, 400);
        }
        assert.equal((await handle(post("/v1/send", "x".repeat(5000)), e, fb.fetcher)).status, 400);
        // Anything else in the body goes nowhere.
        await handle(post("/v1/send", { handle: h, type: "weather-risk", id: ID, title: "Hello", body: "Spam" }), e, fb.fetcher);
        assert.equal(JSON.stringify(fb.sends).includes("Spam"), false);
    });

    it("says a bad handle or dead token is gone, so the server forgets it", async () => {
        const e = env();
        const dead = firebase(() => Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }));
        assert.equal((await handle(post("/v1/send", { handle: "v1.junk", type: "weather-risk" }), e, dead.fetcher)).status, 410);
        assert.equal((await handle(post("/v1/send", { handle: await handleFor(e), type: "weather-risk" }), e, dead.fetcher)).status, 410);
    });

    it("refuses a blocked server and stops when paused", async () => {
        const open_ = env();
        const h = await handleFor(open_);
        const fb = firebase();
        const blocked = { ...open_, SERVER_OVERRIDES: JSON.stringify({ "https://ref.example.com": { blocked: true } }) };
        assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk" }), blocked, fb.fetcher)).status, 403);
        assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk" }), { ...open_, PAUSED: "true" }, fb.fetcher)).status, 503);
        assert.equal(fb.sends.length, 0);
    });

    it("needs a server's key when its override gives one, and only then (PUSH-7)", async () => {
        const key = "a-long-random-relay-key-for-the-hosted-server";
        const keySha256 = createHash("sha256").update(key).digest("hex");
        const e = env({ SERVER_OVERRIDES: JSON.stringify({ "https://hosted.example": { dailyLimit: 5000, keySha256: keySha256.toUpperCase() } }) });
        const fb = firebase();
        const hosted = await handleFor(e, "token-1", "https://hosted.example");
        const send = (headers: Record<string, string> = {}) => handle(post("/v1/send", { handle: hosted, type: "weather-risk", id: ID }, headers), e, fb.fetcher);
        const refused = await send();
        assert.equal(refused.status, 401);
        assert.match((await refused.json() as { error: string }).error, /relay key/);
        assert.equal((await send({ authorization: "Bearer not-the-key" })).status, 401);
        assert.equal((await send({ authorization: key })).status, 401, "a bearer header, not the key alone");
        assert.equal(fb.sends.length, 0, "nothing sent, nothing counted");
        assert.equal((await send({ authorization: `Bearer ${key}` })).status, 200);
        // A self-hosted server not in the overrides is unaffected, with a key or without one.
        const own = await handleFor(e, "token-2", "https://ref.example.com");
        assert.equal((await handle(post("/v1/send", { handle: own, type: "weather-risk", id: ID }), e, fb.fetcher)).status, 200);
        assert.equal((await handle(post("/v1/send", { handle: own, type: "weather-risk", id: ID }, { authorization: "Bearer whatever" }), e, fb.fetcher)).status, 200);
        // A hash that can't be anyone's key closes the server rather than opening it.
        const broken = env({ SERVER_OVERRIDES: JSON.stringify({ "https://hosted.example": { keySha256: "" } }) });
        const h = await handleFor(broken, "token-1", "https://hosted.example");
        assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk", id: ID }, { authorization: `Bearer ${key}` }), broken, fb.fetcher)).status, 401);
    });

    it("answers 429 when an address sends too much", async () => {
        const e = env({ SEND_LIMIT: { limit: async () => ({ success: false }) } });
        const res = await handle(post("/v1/send", { handle: "x", type: "weather-risk" }), e);
        assert.equal(res.status, 429);
        assert.equal((await res.json() as { limit: string }).limit, "address");
    });
});

describe("daily limits (PUSH-1)", () => {
    const NOON = Date.UTC(2026, 10, 1, 12, 0, 0);
    const reserve = (c: ServerCounter, device: string, now: number, deviceDaily = 25, serverDaily = 250) =>
        c.fetch(new Request("https://c/", { method: "POST", body: JSON.stringify({ op: "reserve", device, deviceDaily, serverDaily, now }) })).then((r) => r.json()) as Promise<any>;
    const release = (c: ServerCounter, device: string, now: number) =>
        c.fetch(new Request("https://c/", { method: "POST", body: JSON.stringify({ op: "release", device, now }) }));
    /** Spread out, so the per-minute limits don't come into it. */
    const fresh = () => new ServerCounter({ storage: new MemoryStorage() });

    it("stops a device at its limit, leaving others alone", async () => {
        const c = fresh();
        for (let i = 0; i < 25; i++) {
            assert.equal((await reserve(c, "a", NOON + i * 60_000)).ok, true);
        }
        const over = await reserve(c, "a", NOON + 30 * 60_000);
        assert.equal(over.ok, false);
        assert.equal(over.limit, "device");
        assert.equal(over.retryAfter, 11.5 * 3600);
        assert.equal((await reserve(c, "b", NOON + 31 * 60_000)).ok, true);
    });

    it("stops the whole server at its limit", async () => {
        const c = fresh();
        for (let i = 0; i < 3; i++) {
            assert.equal((await reserve(c, `d${i}`, NOON + i * 60_000, 25, 3)).ok, true);
        }
        const over = await reserve(c, "new", NOON + 5 * 60_000, 25, 3);
        assert.equal(over.limit, "server");
    });

    it("logs a server reaching its limit, and a blocked server trying, once a day (PUSH-3)", async (t) => {
        const lines: string[] = [];
        t.mock.method(console, "log", (line: string) => lines.push(line));
        const c = fresh();
        const send = (now: number) => c.fetch(new Request("https://c/", { method: "POST", body: JSON.stringify({ op: "reserve", device: "a", deviceDaily: 25, serverDaily: 1, server: "https://ref.example.com", now }) }));
        await send(NOON);
        await send(NOON + 60_000);
        await send(NOON + 120_000);
        assert.deepEqual(lines, ["https://ref.example.com reached its daily limit of 1 notifications"]);
        await send(Date.UTC(2026, 10, 2, 9));
        await send(Date.UTC(2026, 10, 2, 10));
        assert.equal(lines.length, 2, "again the next day");

        const e = env({ SERVER_OVERRIDES: JSON.stringify({ "https://ref.example.com": { blocked: true } }) });
        const h = await handleFor(env());
        for (let i = 0; i < 3; i++) {
            assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk" }), e, firebase().fetcher)).status, 403);
        }
        assert.equal(lines.filter((l) => l === "https://ref.example.com is blocked, and tried to send a notification").length, 1);
        assert.ok(!lines.some((l) => l.includes("token")), "never a phone");
    });

    it("starts again at midnight UTC", async () => {
        const c = fresh();
        for (let i = 0; i < 25; i++) {
            await reserve(c, "a", NOON + i * 60_000);
        }
        assert.equal((await reserve(c, "a", NOON + 60 * 60_000)).ok, false);
        assert.equal((await reserve(c, "a", Date.UTC(2026, 10, 2, 0, 0, 1))).ok, true);
    });

    it("clears everything after midnight, even if the server goes quiet", async () => {
        const storage = new MemoryStorage();
        const c = new ServerCounter({ storage });
        await reserve(c, "a", NOON);
        assert.ok(storage.data.has("d:a"));
        assert.ok(storage.alarm! > Date.UTC(2026, 10, 2) && storage.alarm! < Date.UTC(2026, 10, 2, 0, 5));
        await c.alarm();
        assert.equal(storage.data.size, 0);
    });

    it("limits each minute too", async () => {
        const c = fresh();
        for (let i = 0; i < 5; i++) {
            assert.equal((await reserve(c, "a", NOON)).ok, true);
        }
        const over = await reserve(c, "a", NOON + 1000);
        assert.equal(over.limit, "device");
        assert.equal(over.retryAfter, 59);
        assert.equal((await reserve(c, "a", NOON + 60_000)).ok, true);
        const busy = fresh();
        for (let i = 0; i < 120; i++) {
            assert.equal((await reserve(busy, `d${i}`, NOON)).ok, true);
        }
        assert.equal((await reserve(busy, "another", NOON)).limit, "server");
    });

    it("gives the place back when Firebase didn't take it", async () => {
        const c = fresh();
        for (let i = 0; i < 25; i++) {
            await reserve(c, "a", NOON + i * 60_000);
            await release(c, "a", NOON + i * 60_000);
        }
        assert.equal((await reserve(c, "a", NOON + 40 * 60_000)).ok, true);
    });

    it("doesn't count failed sends through the relay, and uses the defaults and settings", async () => {
        const e = env({ DEVICE_DAILY_LIMIT: "1" });
        const h = await handleFor(e);
        forgetAccessToken();
        const down = firebase(() => new Response("oops", { status: 500 }));
        for (let i = 0; i < 2; i++) {
            assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk" }), e, down.fetcher)).status, 502);
        }
        const up = firebase();
        assert.equal((await handle(post("/v1/send", { handle: h, type: "weather-risk" }), e, up.fetcher)).status, 200);
        const over = await handle(post("/v1/send", { handle: h, type: "weather-risk" }), e, up.fetcher);
        assert.equal(over.status, 429);
        assert.ok(Number(over.headers.get("retry-after")) > 0);
        assert.equal((await over.json() as { limit: string }).limit, "device");
    });

    it("counts one phone however many handles it has, and gives a named server its own limit", async () => {
        const e = env({ DEVICE_DAILY_LIMIT: "1", SERVER_OVERRIDES: JSON.stringify({ "https://hosted.example": { dailyLimit: 0 } }) });
        const up = firebase();
        forgetAccessToken();
        assert.equal((await handle(post("/v1/send", { handle: await handleFor(e, "same"), type: "weather-risk" }), e, up.fetcher)).status, 200);
        assert.equal((await handle(post("/v1/send", { handle: await handleFor(e, "same"), type: "weather-risk" }), e, up.fetcher)).status, 429);
        const hosted = await handle(post("/v1/send", { handle: await handleFor(e, "t", "https://hosted.example"), type: "weather-risk" }), e, up.fetcher);
        assert.equal((await hosted.json() as { limit: string }).limit, "server");
    });

    it("ignores a mistyped setting", async () => {
        const e = env({ SERVER_DAILY_LIMIT: "lots", SERVER_OVERRIDES: "{oops" });
        const up = firebase();
        forgetAccessToken();
        assert.equal((await handle(post("/v1/send", { handle: await handleFor(e), type: "weather-risk" }), e, up.fetcher)).status, 200);
    });
});

it("answers health and nothing else", async () => {
    assert.equal(await (await handle(new Request("https://push.test/health"), env())).text(), "ok");
    assert.equal((await handle(new Request("https://push.test/anything"), env())).status, 404);
});
