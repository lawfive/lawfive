import { PGlite } from "@electric-sql/pglite";
import { defaultFormat } from "@lawfive/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import * as tables from "../src/db/tables.ts";
import { AssignorCalendars } from "../src/feeds/calendars.ts";
import type { Fetched } from "../src/feeds/fetch.ts";
import { NotACalendar, parseCalendar, zoneOf } from "../src/feeds/ical.ts";
import { readEvent, readSummary } from "../src/feeds/rules.ts";
import { Notices } from "../src/notices.ts";
import { Push } from "../src/push.ts";
import { checkAnswer } from "./contract.ts";

// Assignor calendars (FEED-1 to FEED-10): reading a calendar file, and a link read into matches:
// added, left alone when unchanged, moved, canceled when gone and back on when it returns, never
// bringing back a deleted match, and telling the phones. Against PGlite, a made-up calendar site,
// relay and clock.

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const secretLink = "https://www.arbitersports.com/ical/0f3a9c7e1b2d4e5f";

/** A calendar file as an assignor system writes one, with CRLF line ends. */
const calendarFile = (...events: string[][]) => [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ArbiterSports Calendar//EN", "X-WR-CALNAME:ArbiterSports", "X-WR-TIMEZONE:America/Los_Angeles",
    ...events.flatMap((e) => ["BEGIN:VEVENT", `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, "")}`, ...e, "END:VEVENT"]),
    "END:VCALENDAR",
].join("\r\n");


/** Two games as ArbiterSports writes a team's calendar (the layout of a real one, 2026-11-06; the schools and places made up). */
const arbiterTeam = [
    "BEGIN:VCALENDAR", "PRODID:-//ArbiterSports Calendar//EN", "VERSION:2.0", "X-WR-CALNAME: ArbiterSports",
    "BEGIN:VEVENT", "SUMMARY;LANGUAGE=en-us:Varsity-3 Boys-Soccer @ Harbor View High School", "CLASS:PUBLIC", "DTSTAMP:20261106T220720Z",
    "DTSTART:20261119T020000Z", "DTEND:20261119T033000Z", "UID:G-104000001", "LOCATION: 100 Ocean Ave, Seaside California  92600",
    "DESCRIPTION:Sport: Boys-Soccer\\nLevel: Varsity-3\\nTeam: Canyon Ridge High School\\nSite: Harbor View HS\\nSubsite: Stadium\\n", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY;LANGUAGE=en-us:Varsity-3 Boys-Soccer vs Mesa Verde High School", "CLASS:PUBLIC", "DTSTAMP:20261106T220720Z",
    "DTSTART:20261219T011500Z", "DTEND:20261219T024500Z", "UID:G-104000002", "LOCATION: 2500 Ridge Drive, Canyon Ridge California  92691",
    "DESCRIPTION:Sport: Boys-Soccer\\nLevel: Varsity-3\\nTeam: Canyon Ridge High School\\nSite: Canyon Ridge HS\\nSubsite: Football Stadium\\n", "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

describe("reading a calendar file (FEED-4)", () => {
    test("folded lines, escaped text, time zones, and what's skipped", () => {
        const calendar = parseCalendar([
            "BEGIN:VCALENDAR", "X-WR-CALNAME:Bay Youth", "X-WR-TIMEZONE:America/Los_Angeles",
            "BEGIN:VEVENT", "UID:a1", "DTSTART;TZID=America/New_York:20261107T090000",
            "SUMMARY:U12 Girls: Strikers v Rovers\\, Game 4",
            "DESCRIPTION:Position: AR1\\nFee: $40\\; paid on the day",
            " (cash)",
            "LOCATION:Twin Creeks Sports Complex\\, 969 Caribbean Dr\\, Sunnyvale",
            "BEGIN:VALARM", "TRIGGER:-PT1H", "DESCRIPTION:Reminder", "END:VALARM",
            "END:VEVENT",
            "BEGIN:VEVENT", "UID:a2", "DTSTART:20261108T170000Z", "SUMMARY:Utc", "STATUS:CANCELLED", "END:VEVENT",
            "BEGIN:VEVENT", "UID:a3", "DTSTART;VALUE=DATE:20261109", "SUMMARY:Unavailable", "END:VEVENT",
            "BEGIN:VEVENT", "UID:a4", "DTSTART:20261110T100000", "SUMMARY:Floating", "END:VEVENT",
            "BEGIN:VEVENT", "UID:a5", "DTSTART;TZID=\"Pacific Standard Time\":20261111T100000", "SUMMARY:Outlook", "END:VEVENT",
            "END:VCALENDAR",
        ].join("\n"));
        assert.equal(calendar.name, "Bay Youth");
        const [first, utc, allDay, floating, outlook] = calendar.events;
        assert.equal(first.start, "2026-11-07T09:00:00-05:00");
        assert.equal(first.timeZone, "America/New_York");
        assert.equal(first.summary, "U12 Girls: Strikers v Rovers, Game 4");
        assert.equal(first.description, "Position: AR1\nFee: $40; paid on the day(cash)", "folded and unescaped");
        assert.equal(first.location, "Twin Creeks Sports Complex, 969 Caribbean Dr, Sunnyvale");
        assert.ok(!first.properties.some((p) => p.name === "TRIGGER"), "an alarm's properties aren't the event's");
        assert.equal(utc.start, "2026-11-08T17:00:00Z");
        assert.equal(utc.canceled, true);
        assert.equal(allDay.allDay, true);
        assert.equal(floating.start, "2026-11-10T10:00:00-08:00", "a time with no zone is in the calendar's");
        assert.equal(outlook.start, "2026-11-11T10:00:00-08:00", "a Windows zone name");
        assert.equal(zoneOf("/mozilla.org/20050126_1/Europe/London"), "Europe/London");
        assert.throws(() => parseCalendar("<html>Sign in</html>"), NotACalendar);
    });

    test("ArbiterSports' own rules: the team, the site and subsite, the level and the game number (FEED-12)", () => {
        const [away, home] = parseCalendar(arbiterTeam).events as (ReturnType<typeof parseCalendar>["events"][number] & { start: string })[];
        assert.deepEqual(readEvent("arbiter", away), {
            kickoff: "2026-11-19T02:00:00Z", home: "Harbor View High School", away: "Canyon Ridge High School",
            venue: "Harbor View HS", venueAddress: "100 Ocean Ave, Seaside California 92600", pitch: "Stadium", ageGroup: "Varsity-3", gender: "Boys", number: "104000001",
        });
        assert.deepEqual([readEvent("arbiter", home).home, readEvent("arbiter", home).away], ["Canyon Ridge High School", "Mesa Verde High School"], "vs: at home");
        assert.equal(readEvent("other", away).home, "Harbor View High School", "Other's rules read only the title");
    });

    test("the position, division and teams in a game's title, when it names them plainly (FEED-5)", () => {
        assert.deepEqual(readSummary("U12 Girls: Strikers v Rovers"), { home: "Strikers", away: "Rovers", name: "U12 Girls" });
        assert.deepEqual(readSummary("Cobras vs. Hawks"), { home: "Cobras", away: "Hawks" });
        assert.deepEqual(readSummary("Rovers @ Strikers"), { home: "Strikers", away: "Rovers" }, "away at home");
        assert.deepEqual(readSummary("Center: Lincoln vs East"), { home: "Lincoln", away: "East", role: "referee" });
        assert.deepEqual(readSummary("AR1: U14 Boys: United vs Rovers"), { home: "United", away: "Rovers", role: "ar1", name: "U14 Boys" });
        assert.deepEqual(readSummary("Center: U16 Cup QF"), { role: "referee", name: "U16 Cup QF" }, "a position, and no teams");
        assert.deepEqual(readSummary("Strikers v Rovers @ Twin Creeks"), { name: "Strikers v Rovers @ Twin Creeks" }, "more than one way to read it");
        assert.deepEqual(readSummary("Referee clinic"), { name: "Referee clinic" });
    });
});

describe("assignor calendars", () => {
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
    /** What the calendar's site answers next, and the links it was asked for. */
    let answer: Fetched = { status: "ok", body: "" };
    const asked: string[] = [];
    const calendars = new AssignorCalendars(db, {
        authSecret: "test-secret-that-is-at-least-32-characters",
        now: () => clock,
        fetcher: async (url) => {
            asked.push(url);
            return answer;
        },
    });
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access, push: true, notices, assignorCalendars: calendars });
    let session: string;
    let calendarId: string;
    const typedIn = crypto.randomUUID();

    async function call(method: string, path: string, body?: unknown, device?: string) {
        const res = await app.request(path, {
            method,
            headers: { "content-type": "application/json", authorization: `Bearer ${session}`, ...(device ? { "x-lawfive-device": device } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const parsed = await res.json();
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed };
    }
    const serve = (...events: string[][]) => {
        answer = { status: "ok", body: calendarFile(...events) };
    };
    const game = (uid: string, start: string, summary: string, more: string[] = []) => [`UID:${uid}`, `DTSTART;TZID=America/Los_Angeles:${start}`, `SUMMARY:${summary}`, ...more];
    const first = game("g1@arbitersports.com", "20261107T090000", "U12 Girls: Strikers v Rovers", ["LOCATION:Twin Creeks Sports Complex, Sunnyvale", "DESCRIPTION:Position: Referee"]);
    const second = game("g2@arbitersports.com", "20261108T143000", "U14 Boys: Cobras v Hawks", ["LOCATION:Ortega Park"]);
    const already = game("g3@arbitersports.com", "20261114T100000", "U10 Coed: Lions v Tigers");
    const played = game("g0@arbitersports.com", "20261101T090000", "Last week");
    const matches = async () => (await call("GET", "/v1/matches")).body.items as { id: string; name?: string; home: { name?: string }; away: { name?: string }; status: string; kickoff?: string; notes?: string; venueId?: string; deletedAt?: string }[];
    const byName = async (name: string) => (await matches()).find((m) => m.name === name)!;
    const readNow = async () => (await call("POST", `/v1/assignor-calendars/${calendarId}/read`)).body;

    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Sam Reed", email: "sam@example.com", password: "correct-horse-battery" }),
        });
        session = res.headers.get("set-auth-token")!;
        await call("PUT", "/v1/devices/current/push", { handle: "v1.phone" }, "android; model=Pixel 9; os=17; app=2026.11.6");
        // A match the person typed in already, at the same kickoff as one of the calendar's.
        await call("PUT", `/v1/matches/${typedIn}`, {
            status: "scheduled", kickoff: "2026-11-14T10:00:00-08:00", timeZone: "America/Los_Angeles", format: defaultFormat,
            home: { name: "Lions" }, away: { name: "Tigers" }, crew: [],
        });
        assert.ok((await call("GET", "/v1/meta")).body.capabilities.includes("assignor-calendars"));
    });

    test("a preview says what the link holds and saves nothing (FEED-1)", async () => {
        serve(first, second, already, played);
        const { status, body } = await call("POST", "/v1/assignor-calendars/preview", { url: secretLink.replace("https://", "webcal://"), system: "arbiter" });
        assert.equal(status, 200);
        assert.equal(asked.at(-1), secretLink, "webcal is read as https");
        assert.equal(body.calendarName, "ArbiterSports");
        assert.equal(body.games, 3, "the game already played isn't one");
        assert.equal(body.inLawFive, 1);
        assert.equal(body.from, "2026-11-07T09:00:00-08:00");
        assert.deepEqual(body.first[0], { title: "Strikers v Rovers", kickoff: "2026-11-07T09:00:00-08:00", timeZone: "America/Los_Angeles", venue: "Twin Creeks Sports Complex", inLawFive: false });
        assert.equal(body.first[2].inLawFive, true);
        assert.equal((await matches()).length, 1);
    });

    test("a link that isn't a calendar, or isn't https, is refused", async () => {
        answer = { status: "ok", body: "<html>Sign in to Arbiter</html>" };
        assert.equal((await call("POST", "/v1/assignor-calendars/preview", { url: secretLink, system: "arbiter" })).status, 400);
        assert.equal((await call("POST", "/v1/assignor-calendars/preview", { url: "ftp://example.com/cal.ics", system: "other" })).status, 400);
    });

    test("connecting adds the games and takes on the one already there; the link never comes back (FEED-2, FEED-5)", async () => {
        serve(first, second, already, played);
        const { status, body } = await call("POST", "/v1/assignor-calendars", { url: secretLink, system: "arbiter", name: "Arbiter: NorCal" });
        assert.equal(status, 201, JSON.stringify(body));
        calendarId = body.id;
        assert.equal(body.link, "https://www.arbitersports.com/…");
        assert.equal(body.notify, true, "notifies by default (FEED-8)");
        assert.deepEqual(body.lastResult, { games: 3, added: 2, updated: 0, canceled: 0 });
        assert.ok(!JSON.stringify((await call("GET", "/v1/assignor-calendars")).body).includes("0f3a9c7e"));
        const [stored] = await db.select().from(tables.assignorCalendar).where(eq(tables.assignorCalendar.id, calendarId));
        assert.ok(stored.url.startsWith("enc:") && !stored.url.includes("0f3a9c7e"), "kept encrypted");

        const added = await byName("U12 Girls");
        assert.equal(added.status, "scheduled");
        assert.deepEqual([added.home.name, added.away.name], ["Strikers", "Rovers"]);
        assert.equal(added.kickoff, "2026-11-07T17:00:00Z", "9 AM in Los Angeles");
        assert.equal(added.notes, "Position: Referee");
        const venues = (await call("GET", "/v1/venues")).body.items as { id: string; name: string }[];
        assert.equal(venues.find((v) => v.id === added.venueId)?.name, "Twin Creeks Sports Complex");
        const lions = (await matches()).find((m) => m.id === typedIn)!;
        assert.equal(lions.name, undefined, "the match already there is taken on as it is");
        assert.equal((await matches()).length, 3);
    });

    test("its new matches reach the phones under its name (FEED-8)", async () => {
        await notices.idle();
        clock += 61_000;
        await notices.flush();
        const [notice, ...more] = sent.splice(0);
        assert.equal(more.length, 0);
        const read = (await call("GET", `/v1/notices/${notice.id}`)).body;
        assert.equal(read.source, "Arbiter: NorCal");
        assert.equal(read.matches.length, 2);
    });

    test("a read that finds nothing changed leaves the person's edits alone (FEED-6)", async () => {
        const mine = await byName("U14 Boys");
        const { deletedAt, ...rest } = (await call("GET", `/v1/matches/${mine.id}`)).body;
        await call("PUT", `/v1/matches/${mine.id}`, { ...rest, notes: "Bring the spare flags", home: { name: "Cobras", alias: "COB" } });
        const after = await readNow();
        assert.deepEqual(after.lastResult, { games: 3, added: 0, updated: 0, canceled: 0 });
        const kept = (await call("GET", `/v1/matches/${mine.id}`)).body;
        assert.equal(kept.notes, "Bring the spare flags");
        assert.equal(kept.home.alias, "COB");
    });

    test("a moved game moves; the person's notes stay theirs (FEED-6)", async () => {
        serve(first, game("g2@arbitersports.com", "20261108T160000", "U14 Boys: Cobras v Hawks", ["LOCATION:Ortega Park", "DESCRIPTION:Moved to 4 PM"]), already);
        const after = await readNow();
        assert.deepEqual(after.lastResult, { games: 3, added: 0, updated: 1, canceled: 0 });
        const moved = await byName("U14 Boys");
        assert.equal(moved.kickoff, "2026-11-09T00:00:00Z", "4 PM in Los Angeles");
        assert.equal(moved.notes, "Bring the spare flags");
    });

    test("gone before kickoff is canceled, and back on when it returns (FEED-7)", async () => {
        serve(first, already);
        assert.equal((await readNow()).lastResult.canceled, 1);
        assert.equal((await byName("U14 Boys")).status, "cancelled");
        assert.equal((await readNow()).lastResult.canceled, 0, "canceled once");
        serve(first, game("g2@arbitersports.com", "20261108T160000", "U14 Boys: Cobras v Hawks", ["LOCATION:Ortega Park", "DESCRIPTION:Moved to 4 PM"]), already);
        assert.equal((await readNow()).lastResult.updated, 1);
        assert.equal((await byName("U14 Boys")).status, "scheduled");
    });

    test("a match deleted in LawFive stays deleted, even when its game changes (FEED-6)", async () => {
        const gone = await byName("U12 Girls");
        await call("DELETE", `/v1/matches/${gone.id}`);
        serve(game("g1@arbitersports.com", "20261107T100000", "U12 Girls: Strikers v Rovers"), already);
        const after = await readNow();
        assert.equal(after.lastResult.added, 0);
        assert.ok(!(await matches()).some((m) => m.name === "U12 Girls"));
    });

    test("a link that stops working is paused after three reads, and a new link starts it again (FEED-9)", async () => {
        answer = { status: "gone", problem: "The link stopped working: the calendar isn't there any more (404)." };
        await readNow();
        await readNow();
        assert.equal((await readNow()).active, false);
        const paused = (await call("GET", "/v1/assignor-calendars")).body.calendars[0];
        assert.equal(paused.active, false);
        assert.ok(paused.stoppedAt && paused.problem.includes("404"));
        // Due or not, a paused calendar isn't read.
        clock += DAY;
        const before = asked.length;
        await calendars.readDue();
        assert.equal(asked.length, before);
        serve(already);
        const resumed = (await call("PATCH", `/v1/assignor-calendars/${calendarId}`, { url: "https://www.arbitersports.com/ical/new-link" })).body;
        assert.equal(resumed.active, true);
        assert.equal(resumed.problem, undefined);
        assert.equal(asked.at(-1), "https://www.arbitersports.com/ical/new-link");
    });

    test("an ArbiterSports calendar's games come in with their venue's address and pitch, number, and the account's time zone (FEED-12)", async () => {
        await call("PUT", "/v1/settings/" + crypto.randomUUID(), { timeZone: "America/Los_Angeles", currency: "USD", distanceUnit: "mi", temperatureUnit: "f", misconductScheme: "ussf" });
        answer = { status: "ok", body: arbiterTeam };
        const made = (await call("POST", "/v1/assignor-calendars", { url: "https://www2.arbitersports.com/iCal/Team/schedule.ics?id=x", system: "arbiter", name: "Canyon Ridge" })).body;
        assert.deepEqual(made.lastResult, { games: 2, added: 2, updated: 0, canceled: 0 });
        const away = (await matches()).find((m) => m.home.name === "Harbor View High School")! as Record<string, any>;
        assert.equal(away.away.name, "Canyon Ridge High School");
        assert.deepEqual(away.external, { source: "arbiter", id: "104000001" });
        assert.equal(away.timeZone, "America/Los_Angeles", "UTC times take the account's zone");
        assert.equal(away.ageGroup, "Varsity-3");
        assert.equal(away.gender, "male");
        const venue = (await call("GET", `/v1/venues/${away.venueId}`)).body;
        assert.equal(venue.name, "Harbor View HS");
        assert.equal(venue.address, "100 Ocean Ave, Seaside California 92600");
        assert.equal(venue.pitches.find((p: { id: string }) => p.id === away.pitchId)?.name, "Stadium");
        await call("DELETE", `/v1/assignor-calendars/${made.id}`);
    });

    test("removing it keeps its matches (FEED-1)", async () => {
        const count = (await matches()).length;
        assert.equal((await call("DELETE", `/v1/assignor-calendars/${calendarId}`)).status, 200);
        assert.equal((await matches()).length, count);
        assert.deepEqual((await call("GET", "/v1/assignor-calendars")).body.calendars, []);
        assert.equal((await db.select().from(tables.assignorEvent)).length, 0);
    });
});
