import { PGlite } from "@electric-sql/pglite";
import { importColumns } from "@lawfive/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { parseDate, parseTime, zonedTimestamp } from "../src/import.ts";
import { checkAnswer } from "./contract.ts";

// Importing matches (IMP-1 to IMP-8): reading dates and times, and the endpoint's adds, updates,
// names it adds, problems and dry runs.

describe("reading dates and times", () => {
    test("dates: ISO, or slashes and dots in the order asked", () => {
        assert.equal(parseDate("2026-11-07", "mdy"), "2026-11-07");
        assert.equal(parseDate("11/7/2026", "mdy"), "2026-11-07");
        assert.equal(parseDate("7/11/2026", "dmy"), "2026-11-07");
        assert.equal(parseDate("7.11.26", "dmy"), "2026-11-07");
        assert.equal(parseDate("2/30/2026", "mdy"), undefined);
        assert.equal(parseDate("next Saturday", "mdy"), undefined);
    });

    test("times: 24-hour, AM/PM, with or without minutes", () => {
        assert.equal(parseTime("9:00"), "09:00");
        assert.equal(parseTime("21:30"), "21:30");
        assert.equal(parseTime("2:30 PM"), "14:30");
        assert.equal(parseTime("12:15 am"), "00:15");
        assert.equal(parseTime("9am"), "09:00");
        assert.equal(parseTime("10:00:00"), "10:00");
        assert.equal(parseTime("9"), undefined);
        assert.equal(parseTime("25:00"), undefined);
    });

    test("a local time takes its time zone's offset on that day", () => {
        assert.equal(zonedTimestamp("2026-11-07", "10:00", "America/Los_Angeles"), "2026-11-07T10:00:00-08:00");
        assert.equal(zonedTimestamp("2026-07-04", "10:00", "America/Los_Angeles"), "2026-07-04T10:00:00-07:00");
        assert.equal(zonedTimestamp("2026-07-04", "10:00", "Europe/London"), "2026-07-04T10:00:00+01:00");
        assert.equal(zonedTimestamp("2026-07-04", "10:00", "UTC"), "2026-07-04T10:00:00+00:00");
    });
});

describe("POST /v1/import/matches", () => {
    const publicUrl = "https://lawfive.example.com";
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
        const parsed = await res.json();
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed };
    }
    const importRows = (rows: Record<string, unknown>[], extra: Record<string, unknown> = {}, auth = token) =>
        call("POST", "/v1/import/matches", auth, { rows, timeZone: "America/Los_Angeles", ...extra });
    const list = async (collection: string) => (await call("GET", `/v1/${collection}`, token)).body.items;

    const first = {
        "Match number": "BYL-1001", Date: "2026-11-07", Time: "9:00 AM", Home: "Strikers U12", "Home short name": "str", "Home colour": "red",
        Away: "Rovers U12", "Away colour": "#0057b8", Competition: "Bay Youth League", Venue: "Twin Creeks", Pitch: "Field 3",
        "Age group": "U12", Gender: "Boys", Referee: "Alex Morgan", AR1: "Sam Rivera", AR2: "TBD", "Period length (min)": 30, "Half-time (min)": 5,
        Fee: "$40", Paid: "no", Tags: "league; needs AR", "Assigned by": "Dana Whitfield", Shirt: "ignored",
    };

    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Alex Morgan", email: "alex@example.com", password: "correct horse battery" }),
        });
        token = res.headers.get("set-auth-token")!;
    });

    test("a dry run says what would happen and saves nothing", async () => {
        const result = await importRows([first, {}], { dryRun: true });
        assert.equal(result.status, 200);
        assert.equal(result.body.added, 1, "the empty row isn't counted");
        assert.equal(result.body.rows.length, 1);
        assert.equal(result.body.rows[0].title, "Strikers U12 v Rovers U12");
        assert.deepEqual(result.body.created, { venues: ["Twin Creeks"], competitions: ["Bay Youth League"], referees: ["Sam Rivera"] });
        assert.deepEqual(result.body.ignoredColumns, ["Shirt"]);
        assert.equal((await list("matches")).length, 0);
        assert.equal((await list("venues")).length, 0);
    });

    test("an import adds the match and the names it needs, reading every column", async () => {
        const result = await importRows([first]);
        assert.equal(result.body.added, 1);
        const [match] = await list("matches");
        const [venue] = await list("venues");
        const [competition] = await list("competitions");
        const [referee] = await list("referees");
        assert.equal(match.kickoff, "2026-11-07T09:00:00-08:00");
        assert.deepEqual(match.external, { source: "import", id: "BYL-1001" });
        assert.equal(match.assignor, "Dana Whitfield", "SET-15: under one of its other headings");
        assert.deepEqual(match.home, { name: "Strikers U12", alias: "STR", colour: "#D71920" });
        assert.equal(match.away.colour, "#0057B8");
        assert.equal(match.venueId, venue.id);
        assert.deepEqual(venue.pitches.map((p: { name: string }) => p.name), ["Field 3"]);
        assert.equal(match.pitchId, venue.pitches[0].id);
        assert.equal(match.competitionId, competition.id);
        assert.equal(competition.type, "league");
        assert.equal(match.gender, "male");
        assert.equal(match.role, "referee", "your own name in a crew column is your role");
        assert.deepEqual(match.crew, [{ role: "ar1", refereeId: referee.id }], "TBD is nobody");
        assert.equal(match.format.periodSec, 1800);
        assert.equal(match.format.breakSec, 300);
        assert.deepEqual(match.fee, { amount: 40, currency: "USD", paid: false });
        assert.deepEqual(match.tags, ["league", "needs AR"]);
    });

    test("the same match number updates it, changing only what the row fills in", async () => {
        const result = await importRows([{ "match_number": "byl-1001", time: "10:30", paid: "yes", AR2: "Jordan Lee" }]);
        assert.equal(result.body.updated, 1);
        const matches = await list("matches");
        assert.equal(matches.length, 1);
        const [match] = matches;
        assert.equal(match.kickoff, "2026-11-07T10:30:00-08:00", "the date stays; the time changes");
        assert.deepEqual(match.fee, { amount: 40, currency: "USD", paid: true });
        assert.equal(match.home.name, "Strikers U12");
        assert.equal(match.crew.length, 2, "AR1 stays and AR2 joins");
        assert.equal((await list("referees")).length, 2);
        assert.equal((await list("venues")).length, 1, "the venue is found by name, not added again");
    });

    test("the ID column wins over the match number", async () => {
        const [match] = await list("matches");
        const result = await importRows([{ ID: match.id, "Match number": "BYL-2000", Status: "postponed" }]);
        assert.equal(result.body.updated, 1);
        const [updated] = await list("matches");
        assert.equal(updated.status, "postponed");
        assert.equal(updated.external.id, "BYL-2000");
    });

    test("a name typed into a match's crew stays typed when imported again (DATA-5)", async () => {
        const [match] = await list("matches");
        const { updatedAt, deletedAt, ...rest } = match;
        await call("PUT", `/v1/matches/${match.id}`, token, { ...rest, crew: [...match.crew.filter((c: { role: string }) => c.role !== "fourth"), { role: "fourth", name: "Club linesman" }] });
        const result = await importRows([{ ID: match.id, "Fourth official": "club linesman" }]);
        assert.deepEqual(result.body.created.referees, [], "no referee added");
        const [updated] = await list("matches");
        assert.deepEqual(updated.crew.find((c: { role: string }) => c.role === "fourth"), { role: "fourth", name: "Club linesman" });
    });

    test("rows with problems are skipped, naming the column, and the rest import", async () => {
        const result = await importRows([
            { Date: "31/2/2026", Time: "9:00", Home: "A", Away: "B" },
            { Date: "2026-11-14", Time: "9:00", Home: "C", Away: "D", "Home colour": "tartan", Status: "maybe", Periods: 7 },
            { Date: "2026-11-14", Time: "11:00", Home: "E", Away: "F", Template: "Nonexistent", Venue: "Never Made" },
            { Notes: "no date or teams" },
            { "Match number": "BYL-3000", Date: "2026-11-21", Time: "9:00", Home: "G", Away: "H" },
            { "Match number": "BYL-3000", Time: "11:00" },
        ]);
        const [bad, worse, template, empty, added, again] = result.body.rows;
        assert.match(bad.problems[0], /^Date: /);
        assert.ok(worse.problems.some((p: string) => p.startsWith("Home color: ")));
        assert.ok(worse.problems.some((p: string) => p.startsWith("Status: ")));
        assert.ok(worse.problems.some((p: string) => p.startsWith("Periods: ")), "the schema's checks name the column too");
        assert.deepEqual(template.problems, ['Template: there\'s no template called "Nonexistent"']);
        assert.equal(empty.problems.length, 1);
        assert.equal(added.action, "add");
        assert.equal(again.action, "update", "a later row with the same number updates the match the earlier one added");
        assert.equal(result.body.skipped, 4);
        assert.deepEqual(result.body.created.venues, [], "a skipped row adds no names");
        assert.ok(!(await list("venues")).some((v: { name: string }) => v.name === "Never Made"));
        const imported = (await list("matches")).find((m: { external?: { id: string } }) => m.external?.id === "BYL-3000");
        assert.equal(imported.kickoff, "2026-11-21T11:00:00-08:00");
    });

    test("an API key can import, but adds names only with write access to them", async () => {
        const key = (await call("POST", "/v1/api-keys", token, { name: "API import", scopes: ["matches:write"] })).body.key;
        const result = await importRows([
            { Date: "2026-12-05", Time: "9:00", Home: "I", Away: "J", Venue: "Twin Creeks" },
            { Date: "2026-12-05", Time: "11:00", Home: "K", Away: "L", Venue: "Somewhere New" },
        ], {}, key);
        assert.equal(result.body.added, 1, "an existing venue is fine");
        assert.match(result.body.rows[1].problems[0], /^Venue: .*can't add one/);
    });

    test("every heading and JSON key in the column guide is read (IMP-9)", async () => {
        const row = Object.fromEntries(importColumns.flatMap((c) => [[c.header, ""], [c.json, ""]]));
        const result = await importRows([row], { dryRun: true });
        assert.deepEqual(result.body.ignoredColumns, []);
    });

    test("a file is read on the server, with the same check and save as rows (IMP-2, IMP-5)", async () => {
        const examples = new URL("../../web/public/examples/", import.meta.url);
        const send = (name: string, bytes: Uint8Array | string, fields: Record<string, string> = {}) => {
            const form = new FormData();
            form.set("file", new File([bytes as BlobPart], name));
            Object.entries(fields).forEach(([k, v]) => form.set(k, v));
            return app.request("/v1/import/file", { method: "POST", headers: { origin: publicUrl, authorization: `Bearer ${token}` }, body: form });
        };
        const before = (await list("matches")).length;
        for (const name of ["lawfive-matches.csv", "lawfive-matches.xlsx", "lawfive-matches.json"]) {
            const res = await send(name, new Uint8Array(readFileSync(new URL(name, examples))), { dryRun: "true", timeZone: "America/Los_Angeles", dateOrder: "mdy" });
            const body = await res.json();
            checkAnswer("POST", "/v1/import/file", res.status, body);
            assert.equal(res.status, 200, name);
            assert.equal(body.rows.length, 3, name);
            assert.equal(body.skipped, 0, `${name}: ${JSON.stringify(body.rows.flatMap((r: { problems: string[] }) => r.problems))}`);
            assert.equal(body.file.kind, name.endsWith("json") ? "json" : "table");
            assert.deepEqual(body.file.lines, name.endsWith("json") ? [1, 2, 3] : body.file.lines);
        }
        assert.equal((await list("matches")).length, before, "a dry run saves nothing");

        const saved = await (await send("lawfive-matches.csv", new Uint8Array(readFileSync(new URL("lawfive-matches.csv", examples))), { timeZone: "America/Los_Angeles", dateOrder: "mdy" })).json();
        assert.equal(saved.added + saved.updated, 3);
        assert.equal((await list("matches")).length, before + saved.added);

        // Problems with the file come back as words for the person who chose it.
        const problem = async (res: Response) => { assert.equal(res.status, 400); return (await res.json()).error as string; };
        assert.match(await problem(await send("m.json", "{ nope")), /isn't valid JSON/);
        assert.match(await problem(await send("m.csv", "Home,Away\n")), /no matches/);
        assert.match(await problem(await send("m.xls", "x")), /Save it as Excel/);
        assert.match(await problem(await send("big.csv", "x".repeat(6 * 1024 * 1024))), /over 5 MB/);
        const none = new FormData();
        none.set("dryRun", "true");
        assert.match(await problem(await app.request("/v1/import/file", { method: "POST", headers: { origin: publicUrl, authorization: `Bearer ${token}` }, body: none })), /Choose a file/);
    });

    test("the body is checked", async () => {
        assert.equal((await call("POST", "/v1/import/matches", token, { rows: [] })).status, 400);
        assert.equal((await call("POST", "/v1/import/matches", token, { rows: [{ Home: { nested: true } }] })).status, 400);
    });
});
