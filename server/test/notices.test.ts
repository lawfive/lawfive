import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { Notices } from "../src/notices.ts";
import { Push } from "../src/push.ts";
import { checkAnswer } from "./contract.ts";

// Notices of what integrations did (NOTE-1 to NOTE-4): only an API key whose owner asked, only
// matches that haven't kicked off, a burst collected into one notification, a change within a day
// sent at once, and the notice read by the phone. Against PGlite, a made-up relay and a clock.

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const phone = "android; model=Pixel 9; os=17; app=2026.11.2";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("notices", () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const access: AccessSettings = { signUp: "open", adminEmails: [], publicUrl: "https://app.example.com" };
    let clock = Date.parse("2026-11-02T12:00:00Z");
    const sent: { type: string; id: string }[] = [];
    const push = new Push(db, "https://push.example.com", (async (_url: string | URL | Request, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return Response.json({ sent: true });
    }) as typeof fetch);
    const notices = new Notices(db, push, () => clock);
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access, push: true, notices });
    let session: string;
    let quiet: string;
    let refsync: string;
    const venue = crypto.randomUUID();
    const other = crypto.randomUUID();
    const pitch = crypto.randomUUID();

    async function call(method: string, path: string, token: string, body?: unknown, device?: string) {
        const res = await app.request(path, {
            method,
            headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(device ? { "x-lawfive-device": device } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const parsed = await res.json();
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed };
    }
    const at = (ms: number) => new Date(clock + ms).toISOString();
    const match = (overrides: Record<string, unknown> = {}) => ({
        status: "scheduled", kickoff: at(3 * DAY), timeZone: "America/Los_Angeles", format: defaultFormat,
        home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [], venueId: venue, ...overrides,
    });
    /** What went to the phone since last asked, as the notices it points at. */
    async function delivered() {
        await notices.idle();
        const out = [];
        for (const { type, id } of sent.splice(0)) {
            assert.equal(type, "match-changed");
            out.push((await call("GET", `/v1/notices/${id}`, session)).body);
        }
        return out;
    }
    /** Lets the minute of collecting pass, and sends what's due. */
    async function aMinuteLater() {
        await notices.idle();
        clock += 61_000;
        await notices.flush();
    }

    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Sam Reed", email: "sam@example.com", password: "correct-horse-battery" }),
        });
        session = res.headers.get("set-auth-token")!;
        await call("PUT", "/v1/devices/current/push", session, { handle: "v1.phone" }, phone);
        await call("PUT", `/v1/venues/${venue}`, session, { name: "Twin Creeks", pitches: [{ id: pitch, name: "Field 3" }] });
        await call("PUT", `/v1/venues/${other}`, session, { name: "Ortega Park", pitches: [] });
        quiet = (await call("POST", "/v1/api-keys", session, { name: "My script", scopes: ["matches:write"] })).body.key;
        const made = (await call("POST", "/v1/api-keys", session, { name: "RefSync", scopes: ["matches:write"], notify: true })).body;
        assert.equal(made.notify, true);
        refsync = made.key;
        assert.ok((await call("GET", "/v1/meta", session)).body.capabilities.includes("notices"));
    });

    test("a key without notify on, and the person's own saves, say nothing (NOTE-1)", async () => {
        await call("PUT", `/v1/matches/${crypto.randomUUID()}`, quiet, match());
        await call("PUT", `/v1/matches/${crypto.randomUUID()}`, session, match());
        await aMinuteLater();
        assert.deepEqual(await delivered(), []);
    });

    test("a burst of new matches is one notification, soonest first, after a minute (NOTE-2)", async () => {
        const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
        const soonest = at(2 * DAY);
        await call("PUT", `/v1/matches/${ids[0]}`, refsync, match({ kickoff: at(5 * DAY) }));
        await call("PUT", `/v1/matches/${ids[1]}`, refsync, match({ kickoff: soonest, pitchId: pitch }));
        await call("PUT", `/v1/matches/${ids[2]}`, refsync, match({ kickoff: at(9 * DAY), home: { name: "Cobras" } }));
        await notices.flush();
        assert.deepEqual(await delivered(), [], "not before the minute is up");
        // A retry with the same values changes nothing more.
        await call("PUT", `/v1/matches/${ids[0]}`, refsync, match({ kickoff: at(5 * DAY) }));
        await aMinuteLater();
        const [notice, ...more] = await delivered();
        assert.equal(more.length, 0);
        assert.equal(notice.source, "RefSync");
        assert.deepEqual(notice.matches.map((m: { matchId: string }) => m.matchId), [ids[1], ids[0], ids[2]]);
        assert.deepEqual(notice.matches[0], { matchId: ids[1], changes: ["added"], title: "Strikers v Rovers", kickoff: soonest, timeZone: "America/Los_Angeles", venue: "Twin Creeks, Field 3" });
    });

    test("a change within a day goes at once; canceled, then back on (NOTE-2)", async () => {
        const id = crypto.randomUUID();
        await call("PUT", `/v1/matches/${id}`, session, match({ kickoff: at(5 * HOUR) }));
        let m = (await call("GET", `/v1/matches/${id}`, session)).body;
        m = (await call("PUT", `/v1/matches/${id}`, refsync, { ...m, status: "cancelled" })).body;
        const [canceled] = await delivered();
        assert.deepEqual(canceled.matches[0].changes, ["canceled"]);
        await call("PUT", `/v1/matches/${id}`, refsync, { ...m, status: "scheduled" });
        const [backOn] = await delivered();
        assert.deepEqual(backOn.matches[0].changes, ["backOn"]);
    });

    test("a moved kickoff and venue say where it was; notes and fees don't notify (NOTE-2)", async () => {
        const id = crypto.randomUUID();
        let m = (await call("PUT", `/v1/matches/${id}`, session, match({ pitchId: pitch }))).body;
        m = (await call("PUT", `/v1/matches/${id}`, refsync, { ...m, notes: "Bring flags", fee: { amount: 40, currency: "USD", paid: false } })).body;
        await aMinuteLater();
        assert.deepEqual(await delivered(), []);
        const was = m.kickoff;
        m = (await call("PUT", `/v1/matches/${id}`, refsync, { ...m, kickoff: at(4 * DAY) })).body;
        const { pitchId, ...rest } = m;
        await call("PUT", `/v1/matches/${id}`, refsync, { ...rest, venueId: other });
        await aMinuteLater();
        const [notice] = await delivered();
        assert.deepEqual(notice.matches[0].changes, ["kickoff", "venue"]);
        assert.equal(notice.matches[0].previousKickoff, was);
        assert.equal(notice.matches[0].venue, "Ortega Park");
        assert.equal(notice.matches[0].previousVenue, "Twin Creeks, Field 3");
    });

    test("a removed match notifies; one added and removed in a burst doesn't; played matches don't (NOTE-2)", async () => {
        const kept = crypto.randomUUID();
        await call("PUT", `/v1/matches/${kept}`, session, match());
        await call("DELETE", `/v1/matches/${kept}`, refsync);
        const fleeting = crypto.randomUUID();
        await call("PUT", `/v1/matches/${fleeting}`, refsync, match());
        await call("DELETE", `/v1/matches/${fleeting}`, refsync);
        const played = crypto.randomUUID();
        const p = (await call("PUT", `/v1/matches/${played}`, session, match({ status: "played", kickoff: at(-3 * DAY) }))).body;
        await call("PUT", `/v1/matches/${played}`, refsync, { ...p, kickoff: at(-2 * DAY) });
        await aMinuteLater();
        const [notice, ...more] = await delivered();
        assert.equal(more.length, 0);
        assert.deepEqual(notice.matches.map((m: { matchId: string; changes: string[] }) => [m.matchId, m.changes]), [[kept, ["removed"]]]);
    });

    test("notify can be changed later; notices aren't for API keys or other people", async () => {
        const keys = (await call("GET", "/v1/api-keys", session)).body.keys as { id: string; name: string; notify: boolean }[];
        const script = keys.find((k) => k.name === "My script")!;
        assert.equal(script.notify, false);
        assert.equal((await call("PATCH", `/v1/api-keys/${script.id}`, session, { notify: true })).body.notify, true);
        await call("PUT", `/v1/matches/${crypto.randomUUID()}`, quiet, match());
        await aMinuteLater();
        const [notice] = await delivered();
        assert.equal(notice.source, "My script");
        assert.equal((await call("GET", `/v1/notices/${notice.id}`, refsync)).status, 403);
        assert.equal((await call("GET", `/v1/notices/${crypto.randomUUID()}`, session)).status, 404);
    });
});
