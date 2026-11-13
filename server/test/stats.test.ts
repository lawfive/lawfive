import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// Stats (STAT-1 to STAT-12, STAT-15): a handful of games with known answers, through the API (checked
// against its description), with each filter, and the CSV export.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }));
let token: string;

async function call(method: string, path: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed };
}

const id = (n: number) => `5c0a1e2b-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { venue: id(1), other: id(2), sam: id(3), league: id(4), cup: id(5), pitch: id(6) };
const format = { ...defaultFormat, periods: 2, periodSec: 1800, breakSec: 300 };

/** A game: when (UTC), role, gender, age group, competition, crew, distance, status. */
interface Game {
    n: number;
    kickoff: string;
    role: string;
    gender?: string;
    ageGroup: string;
    competitionId: string;
    venueId?: string;
    pitchId?: string;
    crew: { role: string; refereeId?: string; name?: string }[];
    distanceM?: number;
    status?: string;
    fee?: { amount: number; currency: string; paid: boolean };
    tags?: string[];
    /** Seconds each period ran (the format's are 30 minutes). */
    played?: number[];
    events?: unknown[];
    /** The watch that recorded it (STAT-15), when each period kicked off, and its battery (DIAG-1): [period, at, percent]. */
    device?: string;
    started?: string[];
    battery?: [number, "kickoff" | "end", number][];
}
const card = (type: string, code?: string) => ({ type, when: "play", period: 1, periodSec: 600, team: "home", offender: { kind: "player" }, ...(code ? { misconduct: { scheme: "ussf", code } } : {}) });
const games: Game[] = [
    // Saturdays at 9:00 in Los Angeles (16:00 UTC in October, 17:00 in November and December).
    { n: 10, kickoff: "2025-10-04T16:00:00Z", role: "referee", gender: "female", ageGroup: "U12", competitionId: ids.league, pitchId: ids.pitch, crew: [{ role: "ar1", refereeId: ids.sam }], distanceM: 6000,
        fee: { amount: 40, currency: "USD", paid: true }, tags: ["League"], played: [1920, 2040], events: [card("caution", "UB"), card("caution", "DT"), card("secondCaution", "UB")],
        // 71 minutes from kickoff to full time, halftime's five included: 12% used.
        device: "garmin:006-B3703-00", started: ["2025-10-04T16:00:00Z", "2025-10-04T16:37:00Z"], battery: [[1, "kickoff", 90], [1, "end", 84], [2, "kickoff", 84], [2, "end", 78]] },
    { n: 11, kickoff: "2025-10-11T16:00:00Z", role: "ar1", gender: "female", ageGroup: "U10", competitionId: ids.league, crew: [{ role: "referee", refereeId: ids.sam }, { role: "ar2", name: "Club linesman" }], distanceM: 3000,
        fee: { amount: 25, currency: "USD", paid: false }, tags: ["league", "girls"], played: [1860, 1800], events: [card("sendOff", "VC")],
        // A Venu 2 sold elsewhere, with its own part number: 66 minutes, 11% used.
        device: "garmin:006-B3950-00", started: ["2025-10-11T16:00:00Z", "2025-10-11T16:36:00Z"], battery: [[1, "kickoff", 80], [2, "end", 69]] },
    { n: 12, kickoff: "2025-12-06T17:00:00Z", role: "ar2", gender: "male", ageGroup: "U12", competitionId: ids.cup, crew: [{ role: "referee", name: "club LINESMAN" }],
        fee: { amount: 30, currency: "EUR", paid: false }, played: [1800, 3300],
        // Charged at halftime: no drain to count.
        device: "applewatch:Watch7,3", started: ["2025-12-06T17:00:00Z", "2025-12-06T17:35:00Z"], battery: [[1, "kickoff", 50], [2, "end", 60]] },
    { n: 13, kickoff: "2026-03-07T17:00:00Z", role: "referee", gender: "male", ageGroup: "O35", competitionId: ids.cup, venueId: ids.other, crew: [], distanceM: 9000, status: "abandoned",
        // Abandoned mid-period, so no reading at its end.
        device: "wearos:SM-R860", started: ["2026-03-07T17:00:00Z"], battery: [[1, "kickoff", 95]] },
    { n: 14, kickoff: "2026-03-08T00:30:00Z", role: "fourth", ageGroup: "U8", competitionId: ids.league, crew: [{ role: "referee", refereeId: ids.sam }],
        // A watch that didn't say which.
        device: "garmin", started: ["2026-03-08T00:30:00Z"], battery: [[1, "kickoff", 70], [1, "end", 60]] },
];

before(async () => {
    await migrate(db, { migrationsFolder });
    const res = await app.request("/v1/auth/sign-up/email", {
        method: "POST",
        headers: { origin: publicUrl, "content-type": "application/json" },
        body: JSON.stringify({ name: "Stats Tester", email: "stats@example.com", password: "correct horse battery" }),
    });
    token = res.headers.get("set-auth-token") as string;
    await call("PUT", `/v1/venues/${ids.venue}`, { name: "Twin Creeks", position: { lat: 37.41, lon: -122.02 }, pitches: [{ id: ids.pitch, name: "Field 3" }] });
    await call("PUT", `/v1/venues/${ids.other}`, { name: "Ortega Park", pitches: [] });
    await call("PUT", `/v1/referees/${ids.sam}`, { name: "Sam Rivera" });
    await call("PUT", `/v1/competitions/${ids.league}`, { name: "Bay Youth League", type: "league", season: "2025-26" });
    await call("PUT", `/v1/competitions/${ids.cup}`, { name: "Harvest Cup", type: "tournament" });
    for (const g of games) {
        const { n, distanceM, played, events, device, started, battery, ...match } = g;
        await call("PUT", `/v1/matches/${id(n)}`, {
            status: "played", timeZone: "America/Los_Angeles", format, home: { name: `Home ${n}` }, away: { name: `Away ${n}` },
            venueId: ids.venue, ...match,
        });
        await call("PUT", `/v1/match-records/${id(n + 100)}`, {
            matchId: id(n), outcome: match.status === "abandoned" ? "abandoned" : "completed", score: { home: 1, away: 0 }, events: events ?? [],
            periods: (played ?? [1800]).map((sec, i) => ({ period: i + 1, extraTime: false, ...(started?.[i] ? { startedAt: started[i] } : {}), playedSec: sec })), ...(distanceM ? { distanceM } : {}),
            ...(device ? { device } : {}), ...(battery ? { diagnostics: { battery: battery.map(([period, at, percent]) => ({ period, at, percent })) } } : {}),
        });
    }
    await call("PUT", `/v1/settings/${id(30)}`, { misconductScheme: "ussf", currency: "USD", distanceUnit: "mi", temperatureUnit: "f" });
    // A scheduled match doesn't count.
    await call("PUT", `/v1/matches/${id(20)}`, { status: "scheduled", kickoff: "2026-11-07T17:00:00Z", timeZone: "America/Los_Angeles", format, home: {}, away: {}, crew: [] });
    // Weather kept for two games.
    const [user] = await db.select().from(tables.user);
    const weather = (n: number, temperatureC: number, precipitationMm: number, windGustKph: number) => ({
        userId: user.id, matchId: id(n), kickoff: new Date(games.find((g) => g.n === n)!.kickoff),
        data: { matchId: id(n), final: true, condition: "clear" as const, isDay: true, temperatureC, feelsLikeC: temperatureC, precipitationMm, precipitationBeforeMm: 0, windGustKph, hours: [], risks: [], updatedAt: "2026-01-01T00:00:00Z", source: "Open-Meteo" },
    });
    await db.insert(tables.matchWeather).values([weather(10, 24, 0, 20), weather(12, 6, 4, 45)]);
});

describe("stats", () => {
    test("everything, unfiltered", async () => {
        const { body } = await call("GET", "/v1/stats");
        assert.deepEqual(body.games, { total: 5, abandoned: 1, first: "2025-10-04", last: "2026-03-07" });
        assert.deepEqual(body.roles, { referee: 2, ar1: 1, ar2: 1, fourth: 1, notSet: 0 });
        assert.deepEqual(body.options.years, [2026, 2025]);
        assert.deepEqual(body.options.genders, ["male", "female"]);
        assert.deepEqual(body.options.competitions.map((c: { name: string; games: number }) => [c.name, c.games]), [["Bay Youth League", 3], ["Harvest Cup", 2]]);
    });

    test("distance: totals, by role, longest and shortest, running total", async () => {
        const { distance } = (await call("GET", "/v1/stats")).body;
        assert.equal(distance.totalM, 18000);
        assert.equal(distance.games, 3);
        // STAT-16: the one per-game distance, over every game with a distance.
        assert.equal(distance.averageM, 6000);
        assert.deepEqual(distance.byRole, [{ role: "referee", games: 2, averageM: 7500 }, { role: "assistant", games: 1, averageM: 3000 }]);
        assert.equal(distance.longest.matchId, id(13));
        assert.equal(distance.longest.title, "Home 13 v Away 13");
        assert.equal(distance.shortest.distanceM, 3000);
        assert.deepEqual(distance.overTime.map((d: { totalM: number }) => d.totalM), [6000, 9000, 18000]);
    });

    test("months, busiest times and age groups, in the match's own time zone", async () => {
        const { body } = await call("GET", "/v1/stats");
        assert.deepEqual(body.months.map((m: { month: string }) => m.month), ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
        assert.deepEqual(body.months[0], { month: "2025-10", referee: 1, assistant: 1, fourth: 0, notSet: 0 });
        // 00:30 UTC on Sunday 8 March is 16:30 on Saturday 7 March in Los Angeles.
        assert.deepEqual(body.busiest, [{ day: 5, hour: 9, games: 4 }, { day: 5, hour: 16, games: 1 }]);
        assert.deepEqual(body.ageGroups.map((a: { ageGroup: string }) => a.ageGroup), ["U8", "U10", "U12", "O35"]);
        assert.deepEqual(body.ageGroups[2], { ageGroup: "U12", male: 1, female: 1, coed: 0, notSet: 0 });
    });

    test("places and referees", async () => {
        const { places, referees } = (await call("GET", "/v1/stats")).body;
        assert.equal(places.venues, 2);
        assert.equal(places.pitches, 3, "Field 3, Twin Creeks without a pitch, and Ortega Park");
        assert.deepEqual(places.top[0], { venueId: ids.venue, venue: "Twin Creeks", games: 3 });
        assert.equal(referees.count, 2, "Sam, and the club linesman (named twice, in different cases)");
        assert.deepEqual(referees.top, [{ refereeId: ids.sam, name: "Sam Rivera", games: 3 }, { name: "Club linesman", games: 2 }]);
    });

    test("weather from the kept weather", async () => {
        const { weather } = (await call("GET", "/v1/stats")).body;
        assert.equal(weather.games, 2);
        assert.equal(weather.rainy, 1);
        assert.equal(weather.averageTemperatureC, 15);
        assert.equal(weather.hottest.matchId, id(10));
        assert.equal(weather.coldest.temperatureC, 6);
        assert.equal(weather.windiest.windGustKph, 45);
        assert.deepEqual(weather.temperaturesC, [24, 6]);
    });

    test("filters: dates, gender and competition", async () => {
        assert.equal((await call("GET", "/v1/stats?from=2026-01-01&to=2026-12-31")).body.games.total, 2);
        assert.equal((await call("GET", "/v1/stats?to=2026-03-07")).body.games.total, 5, "the evening game is on the 7th locally");
        const female = (await call("GET", "/v1/stats?gender=female")).body;
        assert.equal(female.games.total, 2);
        assert.deepEqual(female.options.years, [2026, 2025], "options are from every game");
        assert.equal((await call("GET", `/v1/stats?competitionId=${ids.cup}`)).body.games.total, 2);
        assert.equal((await call("GET", "/v1/stats?gender=other")).status, 400);
        assert.equal((await call("GET", "/v1/stats?from=yesterday")).status, 400);
    });

    test("fees, in the Settings currency, with other currencies apart (STAT-6)", async () => {
        const { fees, years } = (await call("GET", "/v1/stats")).body;
        assert.deepEqual([fees.currency, fees.games, fees.earnedAmount, fees.paidAmount, fees.owedAmount], ["USD", 2, 65, 40, 25]);
        assert.deepEqual(fees.otherCurrencies, [{ currency: "EUR", games: 1, amount: 30 }]);
        assert.deepEqual(fees.months[0], { month: "2025-10", paidAmount: 40, owedAmount: 25 });
        assert.deepEqual(fees.competitions, [{ competitionId: ids.league, name: "Bay Youth League", games: 2, amount: 65 }]);
        assert.deepEqual(years.map((y: { year: number; feesAmount: number }) => [y.year, y.feesAmount]), [[2026, 0], [2025, 65]]);
    });

    test("discipline: cards, second cautions counted as both, codes (STAT-7)", async () => {
        const { discipline } = (await call("GET", "/v1/stats")).body;
        assert.deepEqual([discipline.games, discipline.cautions, discipline.sendOffs, discipline.secondCautions, discipline.goals], [5, 3, 2, 1, 5]);
        assert.deepEqual(discipline.codes.map((c: { misconduct: { code: string }; cautions: number; sendOffs: number }) => [c.misconduct.code, c.cautions, c.sendOffs]),
            [["UB", 2, 0], ["DT", 1, 0], ["VC", 0, 1]]);
        assert.deepEqual(discipline.ageGroups.find((a: { ageGroup: string }) => a.ageGroup === "U12"), { ageGroup: "U12", games: 2, cautions: 3, sendOffs: 1 });
    });

    test("added time: over each period's length, leaving out abandoned games and periods left running (STAT-9)", async () => {
        const { addedTime } = (await call("GET", "/v1/stats")).body;
        // 10: 120 and 240; 11: 60 and 0; 12: 0 and (25 min over: left out); 14: 0. The abandoned 13 doesn't count.
        assert.equal(addedTime.periods, 6);
        assert.equal(addedTime.averageSec, 70);
        assert.deepEqual(addedTime.byPeriod, [{ period: 1, periods: 4, averageSec: 45 }, { period: 2, periods: 2, averageSec: 120 }]);
    });

    test("year by year (STAT-10)", async () => {
        const { years } = (await call("GET", "/v1/stats")).body;
        assert.deepEqual(years[1], { year: 2025, games: 3, asCentre: 1, distanceM: 9000, distanceGames: 2, referees: 2, venues: 1, feesAmount: 65 });
    });

    test("role, tag and venue filters (STAT-5)", async () => {
        assert.equal((await call("GET", "/v1/stats?role=assistant")).body.games.total, 2);
        const tagged = (await call("GET", "/v1/stats?tag=LEAGUE")).body;
        assert.equal(tagged.games.total, 2, "tags ignore case");
        assert.deepEqual(tagged.options.tags, ["girls", "League"]);
        assert.equal((await call("GET", `/v1/stats?venueId=${ids.other}`)).body.games.total, 1);
        assert.equal((await call("GET", "/v1/stats?role=notSet")).status, 400);
    });

    test("the games as CSV, with a chart's slice (STAT-11, STAT-12)", async () => {
        const res = await app.request(`/v1/stats/games.csv?refereeName=${encodeURIComponent("Club Linesman")}`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
        assert.match(res.headers.get("content-type") ?? "", /text\/csv/);
        assert.match(res.headers.get("content-disposition") ?? "", /attachment/);
        const lines = (await res.text()).trim().split("\r\n");
        assert.equal(lines.length, 3, "a header and the two games with the club linesman");
        assert.ok(lines[0].startsWith("Date,Kickoff,Competition,Home,Away,Score,Role"));
        assert.equal(lines[1], "2025-10-11,09:00,Bay Youth League,Home 11,Away 11,1-0,ar1,Twin Creeks,,U10,female,3000,,,,0,1,60,25,USD,no");
        checkAnswer("GET", "/v1/stats/games.csv", 200, "csv");
        const slice = await app.request(`/v1/stats/games.csv?venueId=${ids.venue}&pitchId=none&month=2025-12`, { headers: { authorization: `Bearer ${token}` } });
        assert.equal((await slice.text()).trim().split("\r\n").length, 2);
    });

    test("your watches: games on each, and the battery a match used, an hour and a game (STAT-15)", async () => {
        const { watches } = (await call("GET", "/v1/stats")).body;
        assert.equal(watches.games, 4, "the games from a watch that said which");
        assert.deepEqual(watches.models, [
            // Both Venu 2s as one; 23% over 137 minutes, and 11.5 a game.
            { device: "garmin:006-B3703-00", name: "Garmin Venu 2", platform: "garmin", games: 2, batteryGames: 2, drainPerHour: 10.1, drainPerGame: 11.5 },
            { device: "applewatch:Watch7,3", name: "Apple Watch Series 9", platform: "applewatch", games: 1, batteryGames: 0 },
            { device: "wearos:SM-R860", name: "Galaxy Watch4", platform: "wearos", games: 1, batteryGames: 0 },
        ]);
        const assisting = (await call("GET", "/v1/stats?role=assistant")).body.watches;
        assert.deepEqual(assisting.models.map((m: { name: string; games: number; drainPerHour?: number; drainPerGame?: number }) => [m.name, m.games, m.drainPerHour, m.drainPerGame]),
            [["Apple Watch Series 9", 1, undefined, undefined], ["Garmin Venu 2", 1, 10, 11]], "the page's filters apply; as many games each, by name");
        assert.deepEqual((await call("GET", "/v1/stats?from=2030-01-01")).body.watches, { games: 0, models: [] });
    });

    test("no games, no figures", async () => {
        const { body } = await call("GET", "/v1/stats?from=2030-01-01");
        assert.equal(body.games.total, 0);
        assert.deepEqual(body.months, []);
        assert.equal(body.distance.longest, undefined);
        assert.equal(body.weather.averageTemperatureC, undefined);
        assert.deepEqual(body.fees.months, []);
        assert.equal(body.addedTime.averageSec, undefined);
        assert.deepEqual(body.years, []);
    });

    test("an API key reads only what its scopes allow (KEY-3)", async () => {
        const as = async (scopes: string[], path = "/v1/stats") => {
            const key = (await call("POST", "/v1/api-keys", { name: `Stats ${scopes.length}`, scopes })).body.key;
            const saved = token;
            token = key;
            try {
                return await call("GET", path);
            } finally {
                token = saved;
            }
        };
        assert.match((await as(["venues:read"])).body.error, /needs matches:read/);

        const everything = (await call("GET", "/v1/stats")).body;
        const all = (await as(["matches:read", "match-records:read", "venues:read", "referees:read", "competitions:read", "settings:read"])).body;
        assert.deepEqual(all, everything, "a key that can read it all gets what a session does");

        const narrow = (await as(["matches:read"])).body;
        assert.equal(narrow.games.total, everything.games.total);
        assert.deepEqual(narrow.months, everything.months);
        assert.deepEqual(narrow.weather, everything.weather, "weather needs only matches:read");
        assert.deepEqual(narrow.fees.months, everything.fees.months);
        // Counts stay; names of what it can't read don't.
        assert.equal(narrow.places.venues, everything.places.venues);
        assert.equal(narrow.referees.count, everything.referees.count);
        for (const list of [narrow.options.venues, narrow.options.competitions, narrow.places.top, narrow.referees.top, narrow.fees.competitions, narrow.discipline.competitions, narrow.addedTime.competitions]) {
            assert.deepEqual(list, []);
        }
        // Nothing from match reports or settings.
        assert.equal(narrow.distance.games, 0);
        assert.equal(narrow.distance.averageM, undefined);
        assert.equal(narrow.discipline.games, 0);
        assert.equal(narrow.addedTime.periods, 0);
        assert.deepEqual(narrow.fitness.games, []);
        assert.equal(narrow.watches, undefined, "nor which watch recorded them (STAT-15)");
        assert.equal((await as(["matches:read", "match-records:read"])).body.watches.games, 4);
        assert.ok(!JSON.stringify(narrow).includes("Sam Rivera") && !JSON.stringify(narrow).includes("Twin Creeks") && !JSON.stringify(narrow).includes("Harvest Cup"));

        const csv = await app.request("/v1/stats/games.csv", { headers: { authorization: `Bearer ${(await call("POST", "/v1/api-keys", { name: "CSV", scopes: ["matches:read"] })).body.key}` } });
        assert.equal(csv.status, 200);
        const row = (await csv.text()).trim().split("\r\n")[2];
        assert.equal(row, "2025-10-11,09:00,,Home 11,Away 11,,ar1,,,U10,female,,,,,,,,25,USD,no", "no competition, venue, score, distance, cards or added time");
    });
});
