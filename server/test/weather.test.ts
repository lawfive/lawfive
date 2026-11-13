import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { saveRecord } from "../src/records.ts";
import { watchWeather } from "../src/watch.ts";
import { assess, conditionOf, matchLengthSec } from "../src/weather/assess.ts";
import { type Hourly, type Place, openMeteo, openMeteoHistory } from "../src/weather/openMeteo.ts";
import { Weather, callCost, cellOf, refreshEvery } from "../src/weather/service.ts";

// Weather (WX-1 to WX-8, WX-10): the risk rules, the Open-Meteo client, keeping forecasts fresh
// within the daily allowance, and past weather for played matches, against PGlite and made-up services.

const HOUR = 3600;
const kickoff = Date.UTC(2026, 10, 7, 17) / 1000; // 9:00 in California
const u12 = { ...defaultFormat, periodSec: 30 * 60, breakSec: 5 * 60 }; // 65 minutes

interface Hour {
    temperature?: number;
    apparent?: number;
    rain?: number;
    chance?: number;
    snow?: number;
    code?: number;
    gust?: number;
}

/** Two days of hourly weather either side of kickoff: mild and dry unless `at` says otherwise. */
function hourly(at: (hoursFromKickoff: number) => Hour = () => ({}), around = kickoff): Hourly {
    const h: Hourly = { time: [], temperature: [], apparent: [], precipitation: [], chance: [], snowfall: [], code: [], gust: [], isDay: [] };
    for (let n = -48; n <= 48; n++) {
        const w = at(n);
        h.time.push(around + n * HOUR);
        h.temperature.push(w.temperature ?? 15);
        h.apparent.push(w.apparent ?? w.temperature ?? 14);
        h.precipitation.push(w.rain ?? 0);
        h.chance.push(w.chance ?? 5);
        h.snowfall.push(w.snow ?? 0);
        h.code.push(w.code ?? 1);
        h.gust.push(w.gust ?? 20);
        h.isDay.push(1);
    }
    return h;
}

const kinds = (h: Hourly) => assess(h, kickoff, matchLengthSec(u12))!.risks.map((r) => `${r.kind}:${r.level}`);

describe("risk rules", () => {
    test("weather codes become the conditions apps draw", () => {
        assert.deepEqual([0, 2, 3, 45, 53, 63, 81, 73, 95, 99].map(conditionOf),
            ["clear", "partlyCloudy", "cloudy", "fog", "drizzle", "rain", "rain", "snow", "storm", "storm"]);
    });

    test("a dry, mild match has no risks", () => {
        const w = assess(hourly(), kickoff, matchLengthSec(u12))!;
        assert.deepEqual(w.risks, []);
        assert.equal(w.condition, "clear");
        assert.equal(w.temperatureC, 15);
        assert.equal(w.hours.length, 2, "9:00 and 10:00 for a 65-minute match");
    });

    test("rain the night before means a wet field: half an inch possible, an inch likely", () => {
        assert.deepEqual(kinds(hourly((n) => (n >= -12 && n <= -3 ? { rain: 1.5 } : {}))), ["wetField:possible"]);
        assert.deepEqual(kinds(hourly((n) => (n >= -12 && n <= -3 ? { rain: 3 } : {}))), ["wetField:likely"]);
        // Rain more than a day before has drained away.
        assert.deepEqual(kinds(hourly((n) => (n >= -40 && n <= -30 ? { rain: 3 } : {}))), []);
    });

    test("rain during the match, or a high chance of it", () => {
        assert.deepEqual(kinds(hourly((n) => (n >= 0 && n <= 1 ? { rain: 3, code: 63 } : {}))), ["rain:possible"]);
        assert.deepEqual(kinds(hourly((n) => (n >= 0 && n <= 1 ? { rain: 6, code: 65 } : {}))), ["rain:likely"]);
        assert.deepEqual(kinds(hourly((n) => (n === 1 ? { rain: 0.2, chance: 80, code: 51 } : {}))), ["rain:possible"]);
        const w = assess(hourly((n) => (n === 1 ? { rain: 2, chance: 60, code: 61 } : {})), kickoff, matchLengthSec(u12))!;
        assert.equal(w.condition, "rain");
        assert.equal(w.precipitationChance, 0.6);
        assert.equal(w.hours[0].precipitationMm, 2, "the hour from 9:00 holds the rain reported at 10:00");
    });

    test("thunderstorms, snow and heat", () => {
        assert.deepEqual(kinds(hourly((n) => (n === 1 ? { code: 95, chance: 30 } : {}))), ["storm:possible"]);
        assert.deepEqual(kinds(hourly((n) => (n === 1 ? { code: 95, chance: 60, rain: 1 } : {}))), ["storm:likely"]);
        assert.deepEqual(kinds(hourly((n) => (n === -5 ? { snow: 0.5, code: 73 } : {}))), ["snow:possible"]);
        assert.deepEqual(kinds(hourly((n) => (n >= 0 ? { temperature: 31, apparent: 33 } : {}))), ["heat:possible"]);
        assert.deepEqual(kinds(hourly((n) => (n >= 0 ? { temperature: 36, apparent: 39 } : {}))), ["heat:likely"]);
    });

    test("no weather when the forecast doesn't reach kickoff", () => {
        assert.equal(assess(hourly(), kickoff + 3 * 86_400, 3600), undefined);
        assert.equal(assess(hourly(), kickoff - 3 * 86_400, 3600), undefined);
    });

    test("the watch gets a few characters in the user's unit", () => {
        const w = { ...assess(hourly((n) => (n === 1 ? { rain: 2, code: 61 } : {})), kickoff, 3600)!, matchId: "x", final: false, updatedAt: "", source: "" };
        assert.equal(watchWeather(w, "c"), "15° rain");
        assert.equal(watchWeather(w, "f"), "59° rain");
    });
});

describe("Open-Meteo", () => {
    let requested: URL | undefined;
    const fake = createServer((req, res) => {
        requested = new URL(req.url ?? "", "http://x");
        const lats = requested.searchParams.get("latitude")!.split(",");
        const one = { hourly: { time: [kickoff], temperature_2m: [12.5], apparent_temperature: [11], precipitation: [0.4], precipitation_probability: [null], snowfall: [0], weather_code: [61], wind_gusts_10m: [20], is_day: [1] } };
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(lats.length === 1 ? one : lats.map(() => one)));
    });
    let url: string;
    before(async () => {
        await new Promise<void>((resolve) => fake.listen(0, resolve));
        url = `http://localhost:${(fake.address() as AddressInfo).port}`;
    });
    after(() => fake.close());

    test("one request for several places, with at most ten values", async () => {
        const got = await openMeteo(url)([{ lat: 37.4, lon: -122 }, { lat: 51.5, lon: -0.1 }], 8);
        assert.equal(got.length, 2);
        assert.equal(requested!.searchParams.get("latitude"), "37.4,51.5");
        assert.equal(requested!.searchParams.get("forecast_days"), "8");
        assert.equal(requested!.searchParams.get("past_days"), "1");
        assert.ok(requested!.searchParams.get("hourly")!.split(",").length <= 10);
        assert.equal(requested!.searchParams.get("apikey"), null);
        assert.deepEqual(got[0].temperature, [12.5]);
        assert.deepEqual(got[0].chance, [null]);
    });

    test("one place comes back as an object; a key is passed on", async () => {
        const got = await openMeteo(url, "secret")([{ lat: 37.4, lon: -122 }], 16);
        assert.equal(got.length, 1);
        assert.equal(requested!.searchParams.get("apikey"), "secret");
    });

    test("past weather: one place between two dates (WX-10)", async () => {
        const got = await openMeteoHistory(url)({ lat: 37.4, lon: -122 }, "2026-04-10", "2026-04-11");
        assert.equal(requested!.pathname, "/v1/archive");
        assert.equal(requested!.searchParams.get("start_date"), "2026-04-10");
        assert.equal(requested!.searchParams.get("end_date"), "2026-04-11");
        assert.deepEqual(got.temperature, [12.5]);
    });
});

describe("past weather for played matches (WX-10)", () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const asked: { place: Place; from: string; to: string }[] = [];
    let answer = (): Hourly => hourly((n) => (n >= 0 && n <= 1 ? { rain: 3, temperature: 31, apparent: 33 } : {}));
    const weather = new Weather(db, {
        dailyLimit: 10,
        provider: async (places) => places.map(() => hourly()),
        history: async (place, from, to) => {
            asked.push({ place, from, to });
            return answer();
        },
    });
    const ids = {
        venue: "9b1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b40",
        played: "9b1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b41",
        scheduled: "9b1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b42",
        noPlace: "9b1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b43",
        recent: "9b1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b44",
    };
    const match = (status: string, venueId: string | undefined) => ({
        status, kickoff: new Date(kickoff * 1000).toISOString(), format: u12, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [],
        ...(venueId ? { venueId } : {}),
    });
    const later = new Date((kickoff + 30 * 86_400) * 1000);

    before(async () => {
        await migrate(db, { migrationsFolder });
        await db.insert(tables.user).values({ id: "u1", name: "Ref", email: "ref@example.com" });
        await saveRecord(db, "u1", "venue", ids.venue, { name: "Twin Creeks", position: { lat: 37.4136, lon: -122.0167 }, pitches: [] }, undefined);
        await saveRecord(db, "u1", "match", ids.played, match("played", ids.venue), undefined);
        await saveRecord(db, "u1", "match", ids.scheduled, match("scheduled", ids.venue), undefined);
        await saveRecord(db, "u1", "match", ids.noPlace, match("played", undefined), undefined);
    });

    test("a played match without weather gets the weather it was played in, once", async () => {
        await weather.run(later);
        assert.equal(asked.length, 1, "only the played match with a place");
        assert.deepEqual(asked[0], { place: { lat: 37.4136, lon: -122.0167 }, from: "2026-11-06", to: "2026-11-07" });
        const kept = await weather.forMatch("u1", ids.played, later);
        assert.equal(kept!.final, true);
        assert.equal(kept!.temperatureC, 31);
        assert.deepEqual(kept!.risks.map((r) => r.kind), ["rain", "heat"]);
        await weather.run(new Date(later.getTime() + 3_600_000));
        assert.equal(asked.length, 1, "kept, so not asked again");
    });

    test("weather that can't be found is tried again a day later, not every run", async () => {
        await saveRecord(db, "u1", "match", ids.recent, { ...match("played", ids.venue), kickoff: new Date((kickoff + 2 * 86_400) * 1000).toISOString() }, undefined);
        answer = () => hourly(() => ({}), kickoff - 30 * 86_400); // the service has nothing for that day
        await weather.run(later);
        await weather.run(new Date(later.getTime() + 3_600_000));
        assert.equal(asked.length, 2, "asked once, then left for a day");
        answer = () => hourly(() => ({}), kickoff + 2 * 86_400);
        await weather.run(new Date(later.getTime() + 25 * 3_600_000));
        assert.equal(asked.length, 3);
        assert.equal((await weather.forMatch("u1", ids.recent, later))?.final, true);
    });
});

describe("keeping forecasts fresh", () => {
    test("places are squares about 5 km across", () => {
        assert.equal(cellOf({ lat: 37.4149, lon: -122.0181 }).key, "37.40,-122.00");
        assert.equal(cellOf({ lat: 37.4176, lon: -121.9997 }).key, "37.40,-122.00");
        assert.equal(cellOf({ lat: 37.4400, lon: -122.0181 }).key, "37.45,-122.00");
    });

    test("the nearer the match, the more often", () => {
        assert.equal(refreshEvery(20 * HOUR * 1000), 2 * HOUR * 1000);
        assert.equal(refreshEvery(4 * 86_400_000), 6 * HOUR * 1000);
        assert.equal(refreshEvery(12 * 86_400_000), 24 * HOUR * 1000);
        assert.equal(callCost(8), 1);
        assert.ok(callCost(16) > 1 && callCost(16) < 1.3);
    });

    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const now = new Date((kickoff - 20 * HOUR) * 1000);
    const calls: { places: Place[]; days: number }[] = [];
    let forecast = hourly((n) => (n >= -12 && n <= -3 ? { rain: 2 } : {}));
    const weather = new Weather(db, {
        dailyLimit: 3,
        provider: async (places, days) => {
            calls.push({ places, days });
            return places.map(() => forecast);
        },
    });
    const ids = {
        venue: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b40",
        far: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b41",
        a: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b42",
        b: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b43",
        c: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b44",
        noPlace: "8a1d5a3e-31a4-4d5e-9b0c-2f8d7e6a5b45",
    };
    const match = (venueId: string | undefined, at: number) => ({
        status: "scheduled", kickoff: new Date(at * 1000).toISOString(), format: u12, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [],
        ...(venueId ? { venueId } : {}),
    });

    before(async () => {
        await migrate(db, { migrationsFolder });
        await db.insert(tables.user).values({ id: "u1", name: "Ref", email: "ref@example.com" });
        await saveRecord(db, "u1", "venue", ids.venue, { name: "Twin Creeks", position: { lat: 37.4136, lon: -122.0167 }, pitches: [] }, undefined);
        await saveRecord(db, "u1", "venue", ids.far, { name: "Elsewhere", position: { lat: 51.5, lon: -0.12 }, pitches: [] }, undefined);
        await saveRecord(db, "u1", "match", ids.a, match(ids.venue, kickoff), undefined);
        await saveRecord(db, "u1", "match", ids.b, match(ids.venue, kickoff + 3 * HOUR), undefined);
        await saveRecord(db, "u1", "match", ids.noPlace, match(undefined, kickoff), undefined);
    });

    test("matches at one place share a forecast, fetched once", async () => {
        assert.deepEqual(await weather.run(now), { fetched: 1 });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].places.length, 1);
        assert.equal(calls[0].days, 8, "nothing more than a week ahead");
        const items = await weather.forUser("u1", new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 5 * 86_400_000), now);
        assert.deepEqual(items.map((w) => w.matchId).sort(), [ids.a, ids.b], "not the match with no venue");
        const a = items.find((w) => w.matchId === ids.a)!;
        assert.equal(a.final, false);
        assert.deepEqual(a.risks.map((r) => r.kind), ["wetField"]);
        assert.equal(a.source, "Open-Meteo");
    });

    test("not fetched again until due, then refreshed", async () => {
        assert.deepEqual(await weather.run(new Date(now.getTime() + HOUR * 1000)), { fetched: 0 });
        assert.deepEqual(await weather.run(new Date(now.getTime() + 2 * HOUR * 1000)), { fetched: 1 });
        assert.equal(calls.length, 2);
    });

    test("never more than the daily limit", async () => {
        await saveRecord(db, "u1", "match", ids.c, match(ids.far, kickoff + 10 * 86_400), undefined);
        const later = new Date(now.getTime() + 2.5 * HOUR * 1000);
        assert.deepEqual(await weather.run(later), { fetched: 0 }, "two calls used today; sixteen days for one more place costs more than the one left");
        const tomorrow = new Date(Date.UTC(2026, 10, 7, 0, 30));
        assert.deepEqual(await weather.run(tomorrow), { fetched: 1 }, "a new day (UTC)");
        assert.equal(calls.at(-1)!.days, 16, "the match ten days out needs a longer forecast");
    });

    test("a match that's over keeps the weather it was played in", async () => {
        const afterwards = new Date((kickoff + 2 * HOUR) * 1000);
        await weather.run(afterwards);
        forecast = hourly(); // a later forecast says it was dry after all
        const [kept] = await db.select().from(tables.matchWeather);
        assert.equal(kept.matchId, ids.a);
        const a = await weather.forMatch("u1", ids.a, afterwards);
        assert.equal(a!.final, true);
        assert.deepEqual(a!.risks.map((r) => r.kind), ["wetField"]);
        // Moved to another day, it's a forecast again.
        await saveRecord(db, "u1", "match", ids.a, match(ids.venue, kickoff + 2 * 86_400), "any");
        assert.equal((await weather.forMatch("u1", ids.a, afterwards))?.final ?? false, false);
    });

    test("the API: signed in, the user's own matches", async () => {
        const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl: "http://localhost:3000", signUp: "open" }), { weather });
        const meta = await (await app.request("/v1/meta")).json();
        assert.ok(meta.capabilities.includes("weather"));
        assert.equal(meta.weather.source, "Open-Meteo");
        assert.equal((await app.request("/v1/weather")).status, 401);
        const signUp = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: "http://localhost:3000", "content-type": "application/json" },
            body: JSON.stringify({ email: "other@example.com", password: "correct horse battery", name: "Other" }),
        });
        const auth = { authorization: `Bearer ${signUp.headers.get("set-auth-token")}` };
        const mine = await app.request("/v1/weather", { headers: auth });
        assert.equal(mine.status, 200);
        assert.deepEqual((await mine.json()).items, [], "another user's matches aren't theirs");
        assert.equal((await app.request(`/v1/weather/${ids.b}`, { headers: auth })).status, 404);
        assert.equal((await app.request("/v1/weather?from=soon", { headers: auth })).status, 400);
    });
});
