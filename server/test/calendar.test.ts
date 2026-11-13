import { PGlite } from "@electric-sql/pglite";
import type { Match, MatchRecord, Referee, Venue } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { type CalendarData, buildCalendar, foldLine, icsText } from "../src/calendar.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// The calendar feed (CAL-1 to CAL-5): its iCalendar, and its private address.

const publicUrl = "https://lawfive.example.com";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = <T>(file: string) => JSON.parse(readFileSync(`${examples}${file}`, "utf8")) as T;

/** The events' lines, unfolded, by UID. */
function events(ics: string): Map<string, string[]> {
    const lines = ics.replace(/\r\n /g, "").split("\r\n");
    const out = new Map<string, string[]>();
    let current: string[] | undefined;
    for (const line of lines) {
        if (line === "BEGIN:VEVENT") {
            current = [];
        } else if (line === "END:VEVENT" && current) {
            out.set(current.find((l) => l.startsWith("UID:"))!.slice(4), current);
            current = undefined;
        } else {
            current?.push(line);
        }
    }
    return out;
}
const field = (lines: string[], name: string) => lines.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`))?.replace(/^[^:]+:/, "");

describe("iCalendar text", () => {
    test("escapes what TEXT values must", () => {
        assert.equal(icsText("Fields 3, 4; north lot\\gate\nbring water"), "Fields 3\\, 4\\; north lot\\\\gate\\nbring water");
    });

    test("folds at 75 bytes without splitting a character", () => {
        const line = `DESCRIPTION:${"é".repeat(60)}`;
        const folded = foldLine(line).split("\r\n");
        assert.ok(folded.every((l) => Buffer.byteLength(l) <= 75));
        assert.equal(folded.map((l, i) => (i ? l.slice(1) : l)).join(""), line);
        assert.equal(foldLine("SHORT:line"), "SHORT:line");
    });
});

describe("the feed's events", () => {
    const match = example<Match>("Match.planned.json");
    const venue = example<Venue>("Venue.complex.json");
    const ar1 = example<Referee>("Referee.ar.json");
    const data = (over: Partial<CalendarData> = {}): CalendarData => ({
        matches: [match],
        venues: new Map([[venue.id, venue]]),
        competitions: new Map(),
        referees: new Map([[ar1.id, ar1]]),
        reports: new Map(),
        weather: new Map(),
        settings: { currency: "USD", distanceUnit: "mi", temperatureUnit: "f" },
        publicUrl,
        ...over,
    });
    const before = Date.parse("2026-11-01T00:00:00Z");

    test("a match to come: from arriving to the final whistle, with a reminder an hour before kickoff", () => {
        const ics = buildCalendar(data(), before);
        assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
        assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
        const e = events(ics).get(`${match.id}@lawfive`)!;
        // Kickoff 09:00 Pacific (17:00Z); arrive 30 minutes before; 2 × 30 + 5 + 2 × 2 minutes long.
        assert.equal(field(e, "DTSTART"), "20261107T163000Z");
        assert.equal(field(e, "DTEND"), "20261107T180900Z");
        assert.equal(field(e, "SUMMARY"), "Strikers U12 v Rovers U12 · Referee");
        assert.equal(field(e, "LOCATION"), "Twin Creeks Sports Complex\\, Field 3\\, 969 Caribbean Dr\\, Sunnyvale\\, CA 94089");
        assert.equal(field(e, "GEO"), "37.415800;-122.016200");
        assert.equal(field(e, "STATUS"), "CONFIRMED");
        assert.equal(field(e, "SEQUENCE"), String(match.version));
        assert.equal(field(e, "TRIGGER"), "-PT30M", "an hour before kickoff is 30 minutes before arriving");
        const description = field(e, "DESCRIPTION")!.split("\\n");
        assert.deepEqual(description.slice(0, 5), [
            "Strikers U12 v Rovers U12",
            "Kickoff 9:00 AM (arrive by 8:30 AM)",
            "U12 male",
            "You: Referee",
            `Crew: ${ar1.name} (AR1)\\, Jordan Lee (AR2)`,
        ]);
        assert.ok(description.includes("Fee: $40"));
        assert.equal(description.at(-1), `${publicUrl}/matches/${match.id}`);
    });

    test("the arrival time and reminder follow the settings, and 24-hour times outside miles", () => {
        const e = events(buildCalendar(data({ settings: { currency: "EUR", distanceUnit: "km", temperatureUnit: "c", calendarArriveMin: 0, calendarReminderMin: 0 } }), before)).get(`${match.id}@lawfive`)!;
        assert.equal(field(e, "DTSTART"), "20261107T170000Z");
        assert.equal(field(e, "TRIGGER"), undefined, "no reminder");
        assert.ok(field(e, "DESCRIPTION")!.includes("Kickoff 09:00"));
        const late = events(buildCalendar(data({ settings: { currency: "EUR", distanceUnit: "km", temperatureUnit: "c", calendarArriveMin: 45, calendarReminderMin: 1440 } }), before)).get(`${match.id}@lawfive`)!;
        assert.equal(field(late, "TRIGGER"), "-PT1395M", "a day before kickoff");
    });

    test("several reminders, and the day before and the day of at set times in the match's time zone (CAL-3)", () => {
        const settings: CalendarData["settings"] = { currency: "USD", distanceUnit: "mi", temperatureUnit: "f", calendarArriveMin: 30, calendarReminders: [15, 180, 120], calendarDayBefore: "19:00", calendarDayOf: "08:00" };
        const e = events(buildCalendar(data({ settings }), before)).get(`${match.id}@lawfive`)!;
        const triggers = e.filter((l) => l.startsWith("TRIGGER")).map((l) => l.replace(/^[^:]+:/, ""));
        // Kickoff 9:00 AM in Los Angeles (17:00 UTC), the event from 8:30.
        assert.deepEqual(triggers, ["-PT150M", "-PT90M", "PT15M", "20261107T030000Z", "20261107T160000Z"], "3 h, 2 h and 15 min before kickoff; 7 PM the day before; 8 AM that day");
        const early = events(buildCalendar(data({ settings: { ...settings, calendarReminders: [], calendarDayOf: "09:00" } }), before)).get(`${match.id}@lawfive`)!;
        assert.deepEqual(early.filter((l) => l.startsWith("TRIGGER")).map((l) => l.replace(/^[^:]+:/, "")), ["20261107T030000Z"], "no day-of reminder after the event has started");
        const none = events(buildCalendar(data({ settings: { ...settings, calendarReminders: [], calendarDayBefore: undefined, calendarDayOf: undefined } }), before)).get(`${match.id}@lawfive`)!;
        assert.equal(field(none, "TRIGGER"), undefined, "an empty list is no reminders, not the old default");
    });

    test("a played match keeps its score and the weather it was played in, without a reminder", () => {
        const played = { ...match, status: "played" as const };
        const report = { ...example<MatchRecord>("MatchRecord.full-match.json"), matchId: match.id, score: { home: 2, away: 1 } };
        const weather = { matchId: match.id, final: true, condition: "rain" as const, isDay: true, temperatureC: 10, feelsLikeC: 8, precipitationMm: 4, precipitationBeforeMm: 14, hours: [], risks: [{ kind: "wetField" as const, level: "likely" as const, amount: 14 }], updatedAt: "2026-11-07T19:00:00Z", source: "Open-Meteo" };
        const e = events(buildCalendar(data({ matches: [played], reports: new Map([[match.id, report]]), weather: new Map([[match.id, weather]]) }), Date.parse("2026-11-08T00:00:00Z"))).get(`${match.id}@lawfive`)!;
        assert.equal(field(e, "SUMMARY"), "Strikers U12 2–1 Rovers U12 · Referee");
        assert.ok(field(e, "DESCRIPTION")!.includes("Weather: 50°F\\, rain · Wet field likely"));
        assert.equal(field(e, "TRIGGER"), undefined);
    });

    test("a cancelled match stays, marked cancelled, at kickoff", () => {
        const e = events(buildCalendar(data({ matches: [{ ...match, status: "cancelled" }] }), before)).get(`${match.id}@lawfive`)!;
        assert.equal(field(e, "SUMMARY"), "Canceled: Strikers U12 v Rovers U12 · Referee");
        assert.equal(field(e, "STATUS"), "CANCELLED");
        assert.equal(field(e, "TRANSP"), "TRANSPARENT");
        assert.equal(field(e, "DTSTART"), "20261107T170000Z");
        assert.equal(field(e, "TRIGGER"), undefined);
    });

    test("a match without a kickoff isn't in it", () => {
        const { kickoff, ...noKickoff } = match;
        assert.equal(events(buildCalendar(data({ matches: [noKickoff as Match] }), before)).size, 0);
    });
});

describe("the feed's address", () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
    let token: string;

    async function call(method: string, path: string, auth?: string, body?: unknown) {
        const res = await app.request(path, {
            method,
            headers: { origin: publicUrl, "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed, headers: res.headers };
    }

    before(async () => {
        await migrate(db, { migrationsFolder });
        token = (await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Cal", email: "cal@example.com", password: "correct horse battery" })).headers.get("set-auth-token")!;
        const { version, updatedAt, deletedAt, ...match } = example<Match>("Match.planned.json");
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, token, match)).status, 201);
    });

    test("there's none until it's made; then it serves the matches without signing in", async () => {
        assert.equal((await call("GET", "/v1/calendar", token)).status, 404);
        const made = await call("POST", "/v1/calendar", token, {});
        assert.equal(made.status, 201);
        assert.match(made.body.url, /^https:\/\/lawfive\.example\.com\/v1\/calendar\/[\w-]{32}\.ics$/);
        assert.equal(made.body.webcalUrl, made.body.url.replace("https://", "webcal://"));
        const path = new URL(made.body.url).pathname;
        const feed = await call("GET", path);
        assert.equal(feed.status, 200);
        assert.match(feed.headers.get("content-type")!, /^text\/calendar/);
        assert.ok(feed.body.includes("SUMMARY:Strikers U12 v Rovers U12 · Referee"));
        assert.ok((await call("GET", "/v1/calendar", token)).body.lastFetchedAt, "fetching is noted");
    });

    test("a new address stops the old one, and turning it off stops both", async () => {
        const first = new URL((await call("GET", "/v1/calendar", token)).body.url).pathname;
        const second = new URL((await call("POST", "/v1/calendar", token, {})).body.url).pathname;
        assert.notEqual(first, second);
        assert.equal((await call("GET", first)).status, 404);
        assert.equal((await call("GET", second)).status, 200);
        assert.equal((await call("DELETE", "/v1/calendar", token)).status, 200);
        assert.equal((await call("GET", second)).status, 404);
        assert.equal((await call("DELETE", "/v1/calendar", token)).status, 404);
        assert.equal((await call("GET", "/v1/calendar/not-an-ics-file")).status, 404);
    });
});
