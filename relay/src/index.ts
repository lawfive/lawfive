// LawFive's push relay (PUSH-1 to PUSH-3). Only the app's publisher can send to the store apps, so
// every LawFive server sends through this, and the Firebase keys stay here.
//
//   POST /v1/register   a phone: its Firebase token and server, for a sealed handle
//   POST /v1/send       a server: a handle, an event and a record id; with its key, for a server
//                       SERVER_OVERRIDES gives one (PUSH-7)
//   GET  /health

import { limitsFor, type Env } from "./env.ts";
import { type Fetch, send } from "./fcm.ts";
import { HANDLE_DAYS, open, seal, server } from "./handle.ts";
import type { CounterRequest, Reserved } from "./counter.ts";

export { ServerCounter } from "./counter.ts";

/** PUSH-2: the only things a notification can be about, so nobody can put words on a phone. */
export const EVENT_TYPES = ["weather-risk", "match-changed", "test"];
const MAX_BODY = 4096;
const ID = /^[0-9a-fA-F-]{36}$/;

const answer = (body: object, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

async function readBody(request: Request): Promise<Record<string, unknown> | undefined> {
    const text = await request.text();
    if (text.length > MAX_BODY) {
        return undefined;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {
        return undefined;
    }
}

async function sha256(text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** PUSH-7: whether a send carries the key its server's override names; compared as hashes, in constant time. */
async function keyMatches(request: Request, keySha256: string): Promise<boolean> {
    const key = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!key) {
        return false;
    }
    const sent = await sha256(key);
    let differ = sent.length ^ keySha256.length;
    for (let i = 0; i < sent.length; i++) {
        differ |= sent.charCodeAt(i) ^ (keySha256.charCodeAt(i) || 0);
    }
    return differ === 0;
}

async function hash(text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
    return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function register(request: Request, env: Env) {
    const body = await readBody(request);
    const address = server(body?.server);
    const token = body?.token;
    const platform = body?.platform;
    if (!address || typeof token !== "string" || !token || token.length > 2048 || (platform !== "android" && platform !== "ios")) {
        return answer({ error: "send { token, server, platform: \"android\" or \"ios\" }" }, 400);
    }
    if (limitsFor(env, address).blocked) {
        return answer({ error: "This server can't use the relay." }, 403);
    }
    const expires = Math.floor(Date.now() / 1000) + HANDLE_DAYS * 86_400;
    return answer({ handle: await seal(env.HANDLE_KEY, { token, server: address, platform, expires }), expiresAt: new Date(expires * 1000).toISOString() });
}

async function sendOne(request: Request, env: Env, fetcher: Fetch) {
    if (env.PAUSED === "true") {
        return answer({ error: "The relay is paused." }, 503, { "retry-after": "3600" });
    }
    const body = await readBody(request);
    const type = body?.type;
    const id = body?.id;
    if (typeof body?.handle !== "string" || typeof type !== "string" || !EVENT_TYPES.includes(type) || (id !== undefined && (typeof id !== "string" || !ID.test(id)))) {
        return answer({ error: "send { handle, type, id }, with a known type" }, 400);
    }
    const sealed = await open(env.HANDLE_KEY, body.handle);
    if (!sealed) {
        return answer({ error: "This handle is no longer valid." }, 410);
    }
    const limits = limitsFor(env, sealed.server);
    const counter = env.COUNTERS.get(env.COUNTERS.idFromName(sealed.server));
    const count = (op: CounterRequest) => counter.fetch("https://counter/", { method: "POST", body: JSON.stringify(op) });
    if (limits.blocked) {
        // PUSH-3: noted once a day, so the operator sees a blocked server still trying.
        await count({ op: "blocked", server: sealed.server });
        return answer({ error: "This server can't use the relay." }, 403);
    }
    // PUSH-7: a server with a key only sends with it, so nobody holding its phones' handles can use up its limit.
    if (limits.keySha256 !== undefined && !await keyMatches(request, limits.keySha256)) {
        return answer({ error: "This server's sends need its relay key." }, 401);
    }
    const device = await hash(sealed.token);
    const reserved = await (await count({ op: "reserve", device, deviceDaily: limits.deviceDaily, serverDaily: limits.serverDaily, server: sealed.server })).json() as Reserved;
    if (!reserved.ok) {
        return answer({ error: `Over the ${reserved.limit}'s limit.`, limit: reserved.limit, retryAfter: reserved.retryAfter }, 429, { "retry-after": String(reserved.retryAfter) });
    }
    let sent: Awaited<ReturnType<typeof send>> = "failed";
    try {
        sent = await send(env.FCM_SERVICE_ACCOUNT, sealed, type, id as string | undefined, fetcher);
    } catch (error) {
        console.error("Sending failed:", error instanceof Error ? error.message : "unknown");
    }
    if (sent === "sent") {
        return answer({ sent: true });
    }
    await count({ op: "release", device });
    return sent === "gone" ? answer({ error: "This phone no longer takes notifications." }, 410) : answer({ error: "Firebase didn't take it; try again later." }, 502);
}

export async function handle(request: Request, env: Env, fetcher: Fetch = fetch): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/health") {
        return new Response("ok");
    }
    const route = request.method === "POST" && pathname === "/v1/register" ? "register" : request.method === "POST" && pathname === "/v1/send" ? "send" : undefined;
    if (!route) {
        return answer({ error: "Not found" }, 404);
    }
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const limiter = route === "register" ? env.REGISTER_LIMIT : env.SEND_LIMIT;
    if (limiter && !(await limiter.limit({ key: ip })).success) {
        return answer({ error: "Too many requests from this address.", limit: "address", retryAfter: 60 }, 429, { "retry-after": "60" });
    }
    return route === "register" ? register(request, env) : sendOne(request, env, fetcher);
}

export default { fetch: (request: Request, env: Env) => handle(request, env) };
