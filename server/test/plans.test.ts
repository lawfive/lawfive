import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import type { Message } from "../src/mail.ts";
import { endOfDay, plansOf } from "../src/plans.ts";
import { Push } from "../src/push.ts";
import { checkAnswer } from "./contract.ts";

// Plans and their limits (PLAN-1 to PLAN-9).

const publicUrl = "http://localhost:3000";
const password = "correct horse battery";

async function server() {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const sent: Message[] = [];
    const access: AccessSettings = { signUp: "open", adminEmails: ["boss@example.com"], publicUrl, mailer: { send: async (m: Message) => void sent.push(m) } };
    plansOf(db).configure({ mailer: () => access.mailer, publicUrl });
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access, webhooks: { allowPrivate: true, retryEveryMs: 0 } });

    async function call(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
        const res = await app.request(path, {
            method,
            headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed, token: res.headers.get("set-auth-token") ?? undefined, headers: res.headers };
    }
    const signUp = async (email: string, name: string, invite?: string) => {
        const up = await call("POST", "/v1/auth/sign-up/email", undefined, { name, email, password, ...(invite ? { invite } : {}) });
        return { token: up.token!, id: up.body.user.id as string };
    };
    return { db, call, signUp, sent, plans: plansOf(db) };
}

const match = (title: string) => ({ kickoff: "2026-11-07T10:00:00-08:00", timeZone: "America/Los_Angeles", status: "scheduled", role: "referee", crew: [], tags: [], format: defaultFormat, home: { name: title }, away: { name: "Rovers" } });
const free = { code: "free", name: "Free", limits: { matches: 2, venues: 1, referees: 1, apiKeys: 1, webhooks: 0, devices: 1, apiCallsPerMinute: 3, pushPerDay: 1 } };
const pro = { code: "pro", name: "Pro", limits: { apiKeys: 20, webhooks: 10 } };

describe("plans", async () => {
    const s = await server();
    const boss = await s.signUp("boss@example.com", "The Boss");
    const sam = await s.signUp("sam@example.com", "Sam Lee");
    const venue = { name: "Twin Creeks", pitches: [] };

    test("a new server starts with one plan, the default, with the limits from before (PLAN-1)", async () => {
        const plans = await s.call("GET", "/v1/plans", boss.token);
        assert.deepEqual(plans.body.plans, [{ code: "standard", name: "Standard", limits: { apiKeys: 20, webhooks: 10 }, default: true, people: 2, inUse: true }]);
        assert.equal((await s.call("GET", "/v1/plans", sam.token)).status, 403, "only admins");
        const mine = await s.call("GET", "/v1/account/plan", sam.token);
        assert.equal(mine.body.plan.code, "standard");
        assert.equal(mine.body.endsAt, undefined);
        assert.equal(mine.body.usage.apiKeys, 0);
    });

    test("admins make plans, each with a code that's unique", async () => {
        assert.equal((await s.call("POST", "/v1/plans", boss.token, free)).status, 201);
        assert.equal((await s.call("POST", "/v1/plans", boss.token, pro)).status, 201);
        assert.equal((await s.call("POST", "/v1/plans", boss.token, { ...pro, name: "Another" })).status, 409);
        assert.equal((await s.call("POST", "/v1/plans", boss.token, { ...pro, code: "Not A Code" })).status, 400);
        const renamed = await s.call("PUT", "/v1/plans/pro", boss.token, { ...pro, name: "Pro plan" });
        assert.equal(renamed.body.name, "Pro plan");
        assert.equal((await s.call("PUT", "/v1/plans/pro", boss.token, { ...pro, code: "free" })).status, 409);
        assert.equal((await s.call("PUT", "/v1/plans/missing", boss.token, pro)).status, 404);
    });

    test("an account put in a plan gets its limits; over them, adding is refused but nothing is lost (PLAN-3, PLAN-4)", async () => {
        for (let i = 0; i < 3; i++) {
            assert.equal((await s.call("PUT", `/v1/matches/${randomUUID()}`, sam.token, match(`Strikers ${i}`))).status, 201);
        }
        const put = await s.call("PUT", `/v1/people/${sam.id}/plan`, boss.token, { plan: "free" });
        assert.equal(put.status, 200);
        assert.equal(put.body.plan.code, "free");
        // Three matches kept on a plan of two: still there, but no more.
        assert.equal((await s.call("GET", "/v1/matches", sam.token)).body.items.length, 3);
        const over = await s.call("PUT", `/v1/matches/${randomUUID()}`, sam.token, match("One more"));
        assert.equal(over.status, 403);
        assert.equal(over.body.limit, "matches");
        assert.equal(over.body.allowed, 2);
        assert.match(over.body.error, /Your plan allows 2 matches/);
        // Changing one that's there still works.
        const first = (await s.call("GET", "/v1/matches", sam.token)).body.items[0];
        assert.equal((await s.call("PUT", `/v1/matches/${first.id}`, sam.token, { ...match("Renamed"), version: first.version })).status, 200);
        // Venues: one allowed.
        assert.equal((await s.call("PUT", `/v1/venues/${randomUUID()}`, sam.token, venue)).status, 201);
        assert.equal((await s.call("PUT", `/v1/venues/${randomUUID()}`, sam.token, { ...venue, name: "Ortega Park" })).status, 403);
        // Webhooks: none at all.
        const hook = await s.call("POST", "/v1/webhooks", sam.token, { url: "http://127.0.0.1:9/hook", topics: ["match"] });
        assert.equal(hook.status, 403);
        assert.match(hook.body.error, /doesn't include webhooks/);
    });

    test("an import adding more than the plan allows saves nothing, and a dry run says so first", async () => {
        const rows = [{ Date: "2026-12-05", Time: "09:00", Home: "Strikers", Away: "Rovers", Venue: "Ortega Park" }];
        const dry = await s.call("POST", "/v1/import/matches", sam.token, { rows, dryRun: true });
        assert.equal(dry.status, 403);
        assert.equal(dry.body.limit, "matches");
        const before = (await s.call("GET", "/v1/matches", sam.token)).body.items.length;
        assert.equal((await s.call("POST", "/v1/import/matches", sam.token, { rows })).status, 403);
        assert.equal((await s.call("GET", "/v1/matches", sam.token)).body.items.length, before);
    });

    test("API keys: as many as the plan allows, and their calls a minute for all of them together (PLAN-8)", async () => {
        const key = await s.call("POST", "/v1/api-keys", sam.token, { name: "Sync", scopes: ["matches:read"] });
        assert.equal(key.status, 201);
        assert.equal((await s.call("POST", "/v1/api-keys", sam.token, { name: "Another", scopes: ["matches:read"] })).status, 403);
        for (let i = 0; i < 3; i++) {
            assert.equal((await s.call("GET", "/v1/matches", key.body.key)).status, 200);
        }
        const over = await s.call("GET", "/v1/matches", key.body.key);
        assert.equal(over.status, 429);
        assert.ok(Number(over.headers.get("retry-after")) > 0);
        assert.match(over.body.error, /3 API requests a minute/);
        assert.equal((await s.call("GET", "/v1/account/plan", sam.token)).body.usage.apiCallsPerDay, 3, "the refused one isn't counted");
    });

    test("address searches: as many a day as the plan allows, counted in Settings (PLAN-11)", async () => {
        const now = Date.parse("2026-11-05T20:00:00Z");
        const limited = { ...free, limits: { ...free.limits, addressSearchesPerDay: 2 } };
        assert.equal((await s.call("PUT", "/v1/plans/free", boss.token, limited)).status, 200);
        assert.equal(await s.plans.addressSearch(sam.id, now), undefined);
        assert.equal(await s.plans.addressSearch(sam.id, now), undefined);
        const over = await s.plans.addressSearch(sam.id, now);
        assert.match(over?.error ?? "", /2 address searches a day\. You can still place the venue on the map by hand/);
        assert.equal(over?.retryAfter, 4 * 3600, "until midnight UTC");
        assert.equal(await s.plans.addressSearch(sam.id, Date.parse("2026-11-06T00:00:01Z")), undefined, "a new day");
        assert.equal(await s.plans.addressSearch(boss.id, now), undefined, "another plan, no limit");
        assert.equal((await s.call("PUT", "/v1/plans/free", boss.token, free)).status, 200);
    });

    test("devices: a phone signing in past the plan's watches and phones is refused, browsers aren't (PLAN-7)", async () => {
        const phone = { "x-lawfive-device": "android; model=Pixel 9; os=16" };
        const first = await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password }, phone);
        assert.equal(first.status, 200);
        // Its device row is written on its first request.
        await s.call("GET", "/v1/account", first.token, undefined, phone);
        const second = await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password }, { "x-lawfive-device": "ios; model=iPhone; os=27" });
        assert.equal(second.status, 403);
        assert.equal(second.body.code, "DEVICE_LIMIT");
        assert.match(second.body.message, /Unlink one in Settings → Devices/);
        const devices = await s.call("GET", "/v1/devices", sam.token);
        assert.equal(devices.body.devices.filter((d: { kind: string }) => d.kind !== "browser").length, 1, "the refused phone's session is gone");
        assert.equal((await s.call("POST", "/v1/auth/sign-in/email", undefined, { email: "sam@example.com", password })).status, 200, "a browser still signs in");
        const link = await s.call("POST", "/v1/auth/device/approve", sam.token, { userCode: "BCDFGHJK" });
        assert.equal(link.status, 403);
        assert.equal(link.body.code, "DEVICE_LIMIT");
    });

    test("notifications: no more a day than the plan allows (PLAN-8)", async () => {
        const handled: string[] = [];
        const push = new Push(s.db, "https://relay.example.com", (async (_url: string, init: { body: string }) => {
            handled.push(init.body);
            return new Response("{}", { status: 200 });
        }) as unknown as typeof fetch);
        const [phone] = await s.db.select().from(tables.device);
        await s.db.update(tables.device).set({ pushHandle: "handle" }).where(eq(tables.device.sessionId, phone.sessionId));
        assert.equal(await push.notify(sam.id, "match-changed", randomUUID()), 1);
        assert.equal(await push.notify(sam.id, "match-changed", randomUUID()), 0, "the second today isn't sent");
        assert.equal(handled.length, 1);
        assert.equal((await s.call("GET", "/v1/account/plan", sam.token)).body.usage.pushPerDay, 1);
    });

    test("a plan with an end: until the end of its last day where the person is, then the plan after it (PLAN-5, PLAN-9)", async () => {
        await s.call("PUT", `/v1/settings/${randomUUID()}`, sam.token, { misconductScheme: "us-soccer", currency: "USD", distanceUnit: "mi", temperatureUnit: "f", timeZone: "America/Los_Angeles" });
        const tomorrow = await s.plans.dayFromNow(sam.id, 1);
        const put = await s.call("PUT", `/v1/people/${sam.id}/plan`, boss.token, { plan: "pro", endsOn: tomorrow, then: "free" });
        assert.equal(put.body.plan.code, "pro");
        assert.equal(put.body.plan.endsOn, tomorrow);
        assert.equal(put.body.plan.endsAt, endOfDay(tomorrow, "America/Los_Angeles").toISOString());
        assert.equal(put.body.plan.then.code, "free");
        assert.equal((await s.call("PUT", `/v1/people/${sam.id}/plan`, boss.token, { plan: "pro", endsOn: "2020-01-01" })).status, 400, "a day that's passed");
        // On Pro: a second webhook is fine.
        assert.equal((await s.call("POST", "/v1/webhooks", sam.token, { url: "http://127.0.0.1:9/hook", topics: ["match"] })).status, 201);
        const mine = await s.call("GET", "/v1/account/plan", sam.token);
        assert.equal(mine.body.then.code, "free");
        // A reminder a day before, once.
        assert.equal(await s.plans.remind(), 1);
        assert.equal(await s.plans.remind(), 0);
        assert.match(s.sent.at(-1)!.subject, /Your Pro plan plan ends (tomorrow|in 2 days)/);
        // Past its end it counts as Free at once, and the loop moves it.
        const after = new Date(Date.parse(put.body.plan.endsAt) + 1000);
        assert.equal((await s.plans.of(sam.id, after)).plan.code, "free");
        assert.equal(await s.plans.endDue(after), 1);
        const [row] = await s.db.select().from(tables.accountPlan).where(eq(tables.accountPlan.userId, sam.id));
        assert.equal(row.endsAt, null);
        const history = await s.call("GET", `/v1/people/${sam.id}/plan-history`, boss.token);
        assert.deepEqual(history.body.changes.map((c: { reason: string; to: { code: string } }) => `${c.reason}:${c.to.code}`), ["ended:free", "admin:pro", "admin:free"]);
        assert.equal(history.body.changes[1].by, "The Boss");
    });

    test("an invitation can carry a plan for some days; the sign-up trial covers everyone else (PLAN-5)", async () => {
        const invite = await s.call("POST", "/v1/invites", boss.token, { name: "Ana", plan: "pro", planDays: 30 });
        assert.deepEqual(invite.body.invite.plan, { code: "pro", name: "Pro plan" });
        assert.equal(invite.body.invite.planDays, 30);
        const token = invite.body.invite.link.split("/").at(-1);
        const ana = await s.signUp("ana@example.com", "Ana", token);
        const hers = await s.call("GET", "/v1/account/plan", ana.token);
        assert.equal(hers.body.plan.code, "pro");
        assert.equal(hers.body.endsOn, await s.plans.dayFromNow(ana.id, 30));
        assert.equal(hers.body.then.code, "standard");

        const trial = await s.call("PUT", "/v1/plan-settings", boss.token, { signUpTrial: { plan: "pro", days: 14 } });
        assert.deepEqual(trial.body.signUpTrial, { plan: "pro", days: 14 });
        const lee = await s.signUp("lee@example.com", "Lee");
        const his = await s.call("GET", "/v1/account/plan", lee.token);
        assert.equal(his.body.plan.code, "pro");
        assert.equal(his.body.endsOn, await s.plans.dayFromNow(lee.id, 14));
    });

    test("the default changes; a plan in use can't be deleted (PLAN-1)", async () => {
        assert.equal((await s.call("DELETE", "/v1/plans/pro", boss.token)).status, 409, "the sign-up trial and invitations use it");
        await s.call("PUT", "/v1/plan-settings", boss.token, { signUpTrial: null });
        const changed = await s.call("PUT", "/v1/plan-settings", boss.token, { default: "free" });
        assert.deepEqual(changed.body.plans.filter((p: { default: boolean }) => p.default).map((p: { code: string }) => p.code), ["free"]);
        assert.equal((await s.call("PUT", "/v1/plan-settings", boss.token, { default: "nothing" })).status, 400);
        assert.equal((await s.call("POST", "/v1/plans", boss.token, { code: "spare", name: "Spare", limits: {} })).status, 201);
        assert.equal((await s.call("DELETE", "/v1/plans/spare", boss.token)).status, 200);
        assert.equal((await s.call("DELETE", "/v1/plans/free", boss.token)).status, 409);
    });
});

describe("a plan's last day", () => {
    test("ends at midnight where the person is, across a clock change", () => {
        assert.equal(endOfDay("2026-12-02", "America/Los_Angeles").toISOString(), "2026-12-03T08:00:00.000Z");
        assert.equal(endOfDay("2026-07-04", "America/Los_Angeles").toISOString(), "2026-07-05T07:00:00.000Z");
        assert.equal(endOfDay("2026-12-02", "UTC").toISOString(), "2026-12-03T00:00:00.000Z");
    });
});
