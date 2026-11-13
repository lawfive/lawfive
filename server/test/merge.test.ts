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

// Merging referees (DUP-3, DUP-4, DUP-6) and venues (DUP-7): matches move to the one kept, so
// counts and stats add up; names become other names; details are combined; a venue's pitches are
// kept or combined as chosen; later imports find them by those names; and a match saved later
// with an id a merge replaced is corrected.

describe("POST /v1/referees/{id}/merge", () => {
    const publicUrl = "https://lawfive.example.com";
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
    let token: string;
    const john = crypto.randomUUID();
    const doe = crypto.randomUUID();
    const sam = crypto.randomUUID();

    async function call(method: string, path: string, body?: unknown, auth = token) {
        const res = await app.request(path, {
            method,
            headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${auth}` },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const parsed = await res.json();
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed };
    }
    const match = (n: number, crew: unknown[]) => call("PUT", `/v1/matches/${crypto.randomUUID()}`, {
        status: "played", kickoff: `2026-10-${String(n + 1).padStart(2, "0")}T17:00:00Z`, format: defaultFormat,
        home: { name: `Home ${n}` }, away: { name: `Away ${n}` }, role: "referee", crew,
    });

    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Alex Morgan", email: "alex@example.com", password: "correct horse battery" }),
        });
        token = res.headers.get("set-auth-token")!;
        await call("PUT", `/v1/referees/${john}`, { name: "John Doe", email: "john@example.com", tags: ["mentor"], notes: "Prefers AR1." });
        await call("PUT", `/v1/referees/${doe}`, { name: "Doe, John", shortName: "JD", email: "jd@league.org", phone: "555 0100", tags: ["Mentor", "u12"], distinctFrom: [sam] });
        await call("PUT", `/v1/referees/${sam}`, { name: "Sam Rivera" });
        for (let n = 0; n < 4; n++) {
            await match(n, [{ role: "ar1", refereeId: john }]);
        }
        for (let n = 4; n < 7; n++) {
            await match(n, [{ role: "ar2", refereeId: doe }, { role: "ar1", refereeId: sam }]);
        }
        await match(7, [{ role: "ar1", name: "doe, john" }]);
    });

    test("the name must be one of theirs, and the referees must exist", async () => {
        assert.equal((await call("POST", `/v1/referees/${john}/merge`, { from: [doe], name: "Someone Else" })).status, 400);
        assert.equal((await call("POST", `/v1/referees/${john}/merge`, { from: [john], name: "John Doe" })).status, 400);
        assert.equal((await call("POST", `/v1/referees/${john}/merge`, { from: [crypto.randomUUID()], name: "John Doe" })).status, 404);
    });

    test("duplicates are found, and a merge previewed, by the server (DUP-11)", async () => {
        const { groups, of } = (await call("GET", "/v1/duplicates/referees")).body;
        assert.equal(of, 3);
        assert.deepEqual(groups.map((g: { members: { id: string }[] }) => g.members.map((m) => m.id)), [[john, doe]], "most matches first; Sam isn't like either");
        assert.deepEqual(groups[0].reasons, ["Same name, in a different order"]);
        assert.deepEqual(groups[0].members[0].matches, { played: 4, upcoming: 0, last: "2026-10-04T17:00:00Z" });
        const { likely } = (await call("GET", `/v1/referees/${john}/duplicates`)).body;
        assert.deepEqual(likely.map((m: { id: string; reasons: string[] }) => [m.id, m.reasons]), [[doe, ["Same name, in a different order"]]]);
        assert.equal((await call("GET", `/v1/referees/${crypto.randomUUID()}/duplicates`)).status, 404);

        const preview = (await call("POST", `/v1/referees/${john}/merge/preview`, { from: [doe] })).body;
        assert.deepEqual(preview.names, ["John Doe", "Doe, John"]);
        assert.equal(preview.name, "John Doe");
        assert.deepEqual([preview.emails, preview.email, preview.phones, preview.phone], [["john@example.com", "jd@league.org"], "john@example.com", ["555 0100"], "555 0100"]);
        assert.deepEqual(preview.together, { played: 8, upcoming: 0, last: "2026-10-08T17:00:00Z" }, "4 + 3 + 1 typed in");
        assert.deepEqual(preview.referees.map((r: { id: string; reasons?: string[] }) => [r.id, r.reasons]), [[john, undefined], [doe, ["Same name, in a different order"]]]);
        const chosen = (await call("POST", `/v1/referees/${john}/merge/preview`, { from: [doe], name: "Doe, John", email: "jd@league.org" })).body;
        assert.deepEqual(chosen.merge, { from: [doe], name: "Doe, John", email: "jd@league.org", phone: "555 0100" });
        assert.equal((await call("POST", `/v1/referees/${john}/merge/preview`, { from: [doe], name: "Nobody" })).body.name, "John Doe", "a name not theirs falls back");
        assert.equal((await call("POST", `/v1/referees/${john}/merge/preview`, { from: [john] })).status, 400);
    });

    test("merging moves the matches, keeps the old name, and combines the details", async () => {
        const result = await call("POST", `/v1/referees/${john}/merge`, { from: [doe], name: "John Doe", email: "jd@league.org" });
        assert.equal(result.status, 200);
        assert.equal(result.body.merged, 1);
        assert.equal(result.body.matchesUpdated, 4, "3 that named Doe, John, and 1 with the name typed in");
        const kept = result.body.referee;
        assert.equal(kept.name, "John Doe");
        assert.deepEqual(kept.aliases, ["Doe, John"]);
        assert.equal(kept.email, "jd@league.org", "the chosen email");
        assert.equal(kept.phone, "555 0100", "filled from the other");
        assert.equal(kept.shortName, "JD", "the short name, from the other");
        assert.deepEqual(kept.tags, ["mentor", "u12"]);
        assert.equal(kept.notes, "Prefers AR1.");
        assert.deepEqual(kept.distinctFrom, [sam]);
        assert.ok((await call("GET", `/v1/referees/${doe}`)).body.deletedAt, "the other is deleted");

        const matches = (await call("GET", "/v1/matches")).body.items as { crew: { refereeId?: string }[] }[];
        assert.equal(matches.filter((m) => m.crew.some((c) => c.refereeId === john)).length, 8);
        assert.ok(!matches.some((m) => m.crew.some((c) => c.refereeId === doe)));
        const { referees } = (await call("GET", "/v1/stats")).body;
        assert.deepEqual(referees.top[0], { refereeId: john, name: "John Doe", games: 8 }, "4 + 3 + 1 together");
    });

    test("an import finds the referee by a merged-away name", async () => {
        const result = await call("POST", "/v1/import/matches", { rows: [{ Date: "2026-11-07", Time: "9:00", Home: "A", Away: "B", AR1: "Doe, John" }] });
        assert.deepEqual(result.body.created.referees, []);
        const added = (await call("GET", `/v1/matches/${result.body.rows[0].matchId}`)).body;
        assert.deepEqual(added.crew, [{ role: "ar1", refereeId: john }]);
    });

    test("an API key needs matches:write as well", async () => {
        const key = (await call("POST", "/v1/api-keys", { name: "Referees only", scopes: ["referees:write"] })).body.key;
        assert.equal((await call("POST", `/v1/referees/${john}/merge`, { from: [sam], name: "John Doe" }, key)).status, 403);
    });

    test("not the same person is remembered by each, in one request (DUP-5)", async () => {
        const pat = crypto.randomUUID();
        const lee = crypto.randomUUID();
        await call("PUT", `/v1/referees/${pat}`, { name: "Pat Lee" });
        await call("PUT", `/v1/referees/${lee}`, { name: "Lee, Pat" });
        const pairs = async () => (await call("GET", "/v1/duplicates/referees")).body.groups.filter((g: { members: { id: string }[] }) => g.members.some((m) => m.id === pat)).length;
        assert.equal(await pairs(), 1);
        assert.equal((await call("POST", `/v1/referees/${pat}/not-the-same`, { others: [crypto.randomUUID()] })).status, 404);
        assert.equal((await call("POST", `/v1/referees/${pat}/not-the-same`, { others: [lee] })).status, 200);
        assert.equal(await pairs(), 0);
        assert.deepEqual((await call("GET", `/v1/referees/${lee}`)).body.distinctFrom, [pat]);
    });

    test("a match saved later naming a merged referee names the one kept", async () => {
        const later = await match(9, [{ role: "ar1", refereeId: doe }]);
        assert.deepEqual(later.body.crew, [{ role: "ar1", refereeId: john }]);
    });
});

describe("POST /v1/venues/{id}/merge", () => {
    const publicUrl = "https://lawfive.example.com";
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl };
    const app = createApp(db, createAuth(db, { ...access, authSecret: "test-secret-that-is-at-least-32-characters" }), { access });
    let token: string;
    const id = () => crypto.randomUUID();
    const twin = id();
    const creeks = id();
    const other = id();
    const pitch = { one: id(), three: id(), theirThree: id(), a: id(), seven: id(), theirOne: id() };
    const at = (lat: number, lon: number) => ({ lat, lon });
    const marking = (day: number) => ({ at: `2026-0${day}-01T10:00:00Z`, corners: [at(37.41, -122.02), at(37.4101, -122.02), at(37.41, -122.0199)] });
    const matchAt = { one: id(), theirThree: id(), a: id(), seven: id(), theirOne: id(), none: id() };

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
    const match = (matchId: string, venueId: string, pitchId?: string) => call("PUT", `/v1/matches/${matchId}`, {
        status: "scheduled", kickoff: "2026-11-07T17:00:00Z", format: defaultFormat, home: { name: "Strikers" }, away: { name: "Rovers" }, crew: [],
        venueId, ...(pitchId ? { pitchId } : {}),
    });

    before(async () => {
        await migrate(db, { migrationsFolder });
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Alex Morgan", email: "alex@example.com", password: "correct horse battery" }),
        });
        token = res.headers.get("set-auth-token")!;
        await call("PUT", `/v1/venues/${twin}`, {
            name: "Twin Creeks", tags: ["turf"], pitches: [
                { id: pitch.one, name: "Field 1", position: at(37.4100, -122.0200) },
                { id: pitch.three, name: "Field 3", markings: [marking(3)] },
            ],
        });
        await call("PUT", `/v1/venues/${creeks}`, {
            name: "Twin Creeks Sports Complex", address: "969 Caribbean Dr, Sunnyvale", position: at(37.4135, -122.0204), notes: "Gate code 1234", tags: ["Turf", "lights"],
            pitches: [
                { id: pitch.theirThree, name: "Field 3", position: at(37.4110, -122.0210), markings: [marking(1), marking(5)] },
                { id: pitch.a, name: "Field A", aliases: ["Pitch A"] },
                { id: pitch.seven, name: "Field 7" },
                { id: pitch.theirOne, name: "Field 1" },
            ],
        });
        await call("PUT", `/v1/venues/${other}`, { name: "Ortega Park", pitches: [] });
        await match(matchAt.one, twin, pitch.one);
        await match(matchAt.theirThree, creeks, pitch.theirThree);
        await match(matchAt.a, creeks, pitch.a);
        await match(matchAt.seven, creeks, pitch.seven);
        await match(matchAt.theirOne, creeks, pitch.theirOne);
        await match(matchAt.none, creeks);
    });

    const choices = {
        from: [creeks], name: "Twin Creeks", addressFrom: creeks,
        pitches: [
            { id: pitch.theirThree, into: pitch.three },
            { id: pitch.a, into: pitch.one },
            { id: pitch.seven, name: "Field 7" },
            { id: pitch.theirOne, name: "Field 1 (north)" },
        ],
    };

    test("every pitch needs a choice, kept pitches need their own names, and combining needs a pitch that's kept", async () => {
        const error = async (body: unknown) => (await call("POST", `/v1/venues/${twin}/merge`, body)).body.error as string;
        assert.match(await error({ ...choices, pitches: choices.pitches.slice(1) }), /say what happens to Field 3/);
        assert.match(await error({ ...choices, pitches: [...choices.pitches.slice(0, 3), { id: pitch.theirOne, name: "field 1" }] }), /Another pitch has this name/);
        assert.match(await error({ ...choices, pitches: [...choices.pitches.slice(0, 3), { id: pitch.theirOne, into: pitch.theirThree }] }), /isn't kept/, "not one that's itself combined");
        assert.match(await error({ ...choices, pitches: [...choices.pitches.slice(0, 3), { id: pitch.theirOne, into: crypto.randomUUID() }] }), /isn't kept/);
        assert.match(await error({ ...choices, name: "Somewhere Else" }), /choose one of their names/);
        assert.match(await error({ ...choices, addressFrom: other }), /addressFrom/);
        assert.equal((await call("POST", `/v1/venues/${twin}/merge`, { ...choices, from: [twin] })).status, 400);
    });

    test("the preview suggests every pitch, riskiest first, and shows problems as choices change (DUP-8, DUP-11)", async () => {
        const groups = (await call("GET", "/v1/duplicates/venues")).body.groups;
        assert.deepEqual(groups.map((g: { members: { id: string }[] }) => g.members.map((m) => m.id)), [[creeks, twin]], "most matches first");
        assert.ok(groups[0].reasons.includes("One name is longer"));
        const preview = async (draft: object) => (await call("POST", `/v1/venues/${twin}/merge/preview`, { from: [creeks], ...draft })).body;

        const suggested = await preview({});
        assert.deepEqual(suggested.names, ["Twin Creeks", "Twin Creeks Sports Complex"]);
        assert.deepEqual(suggested.places, [{ venueId: creeks, address: "969 Caribbean Dr, Sunnyvale", onMap: true }]);
        assert.equal(suggested.addressFrom, creeks);
        type Row = { id: string; check: boolean; choice: object; problem?: string; targets: { name: string }[] };
        assert.deepEqual(suggested.pitches.map((p: Row) => [p.id, p.check, p.choice]), [
            [pitch.theirThree, true, { into: pitch.three }],
            [pitch.theirOne, true, { into: pitch.one }],
            [pitch.a, false, { name: "Field A" }],
            [pitch.seven, false, { name: "Field 7" }],
        ], "the riskiest first, then more matches and corners walked");
        assert.equal(suggested.pitches[0].why, "Same name as Field 3, with no position to check");
        assert.deepEqual(suggested.pitches[0].targets.map((t: { name: string }) => t.name), ["Field 1", "Field 3", "Field A", "Field 7"]);
        assert.deepEqual([suggested.problems, suggested.together], [0, { played: 0, upcoming: 6 }]);
        assert.deepEqual(suggested.merge, {
            from: [creeks], name: "Twin Creeks", pitches: [
                { id: pitch.theirThree, into: pitch.three }, { id: pitch.theirOne, into: pitch.one }, { id: pitch.a, name: "Field A" }, { id: pitch.seven, name: "Field 7" },
            ],
        });

        const clashing = await preview({ pitches: [{ id: pitch.theirOne, name: "field 3" }, { id: pitch.a, into: pitch.theirThree }, { id: pitch.seven, name: " " }] });
        assert.deepEqual(clashing.pitches.map((p: Row) => p.id), suggested.pitches.map((p: Row) => p.id), "rows stay put while choices change");
        const problems = Object.fromEntries(clashing.pitches.map((p: Row) => [p.id, p.problem]));
        assert.equal(problems[pitch.theirOne], "Another pitch has this name; choose a new one");
        assert.equal(problems[pitch.a], "That pitch isn't kept; choose another", "not one that's itself combined");
        assert.equal(problems[pitch.seven], "Give it a name");
        assert.equal(clashing.problems, 3);
        assert.equal(clashing.merge, undefined, "nothing to merge while pitches need a look");

        const key = (await call("POST", "/v1/api-keys", { name: "Venues", scopes: ["venues:read"] })).body.key;
        const asKey = await app.request(`/v1/venues/${twin}/merge/preview`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ from: [creeks] }) });
        assert.equal(asKey.status, 403, "the counts need matches:read");
    });

    test("a merge sent with a preview's problems is refused", async () => {
        const result = await call("POST", `/v1/venues/${twin}/merge`, { ...choices, pitches: [...choices.pitches.slice(0, 3), { id: pitch.theirOne, name: "Field 3" }] });
        assert.equal(result.status, 400);
        assert.equal(result.body.error, "pitches: Field 1: Another pitch has this name; choose a new one");
    });

    test("merging moves the matches to the kept venue and the chosen pitches, and combines the pitches", async () => {
        const result = await call("POST", `/v1/venues/${twin}/merge`, choices);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.merged, 1);
        assert.equal(result.body.matchesUpdated, 5);
        const kept = result.body.venue;
        assert.equal(kept.name, "Twin Creeks");
        assert.deepEqual(kept.aliases, ["Twin Creeks Sports Complex"]);
        assert.equal(kept.address, "969 Caribbean Dr, Sunnyvale");
        assert.deepEqual(kept.position, at(37.4135, -122.0204));
        assert.deepEqual(kept.tags, ["turf", "lights"]);
        assert.equal(kept.notes, "Gate code 1234");
        const byId = new Map(kept.pitches.map((p: { id: string }) => [p.id, p]));
        assert.deepEqual([...byId.keys()], [pitch.one, pitch.three, pitch.seven, pitch.theirOne], "the kept venue's pitches, then those kept");
        const three = byId.get(pitch.three) as { aliases?: string[]; position?: unknown; markings: { at: string }[] };
        assert.equal(three.aliases, undefined, "the same name isn't another name");
        assert.deepEqual(three.position, at(37.4110, -122.0210), "a missing position is filled in");
        assert.deepEqual(three.markings.map((m) => m.at.slice(0, 7)), ["2026-01", "2026-03", "2026-05"], "corners walked, in date order");
        assert.deepEqual((byId.get(pitch.one) as { aliases: string[] }).aliases, ["Field A", "Pitch A"]);
        assert.equal((byId.get(pitch.theirOne) as { name: string }).name, "Field 1 (north)");
        assert.ok((await call("GET", `/v1/venues/${creeks}`)).body.deletedAt);

        const where = async (matchId: string) => {
            const m = (await call("GET", `/v1/matches/${matchId}`)).body;
            return [m.venueId, m.pitchId];
        };
        assert.deepEqual(await where(matchAt.one), [twin, pitch.one]);
        assert.deepEqual(await where(matchAt.theirThree), [twin, pitch.three]);
        assert.deepEqual(await where(matchAt.a), [twin, pitch.one]);
        assert.deepEqual(await where(matchAt.seven), [twin, pitch.seven]);
        assert.deepEqual(await where(matchAt.theirOne), [twin, pitch.theirOne]);
        assert.deepEqual(await where(matchAt.none), [twin, undefined]);
    });

    test("a match saved later with the merged venue's or a combined pitch's id is corrected", async () => {
        assert.deepEqual([(await match(id(), creeks)).body.venueId], [twin]);
        const saved = (await match(id(), creeks, pitch.a)).body;
        assert.deepEqual([saved.venueId, saved.pitchId], [twin, pitch.one]);
        const kept = (await match(id(), creeks, pitch.seven)).body;
        assert.deepEqual([kept.venueId, kept.pitchId], [twin, pitch.seven], "a pitch kept keeps its id");
    });

    test("a later merge carries the earlier one along", async () => {
        const result = await call("POST", `/v1/venues/${other}/merge`, { from: [twin], name: "Ortega Park", pitches: [pitch.one, pitch.three, pitch.seven, pitch.theirOne].map((p, i) => ({ id: p, name: `Field ${i + 10}` })) });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        const saved = (await match(id(), creeks, pitch.a)).body;
        assert.deepEqual([saved.venueId, saved.pitchId], [other, pitch.one], "creeks went to twin, which went to Ortega Park");
    });

    test("not the same venue is remembered by each (DUP-7)", async () => {
        const palms = id();
        const palmsPark = id();
        await call("PUT", `/v1/venues/${palms}`, { name: "Las Palmas", pitches: [] });
        await call("PUT", `/v1/venues/${palmsPark}`, { name: "Las Palmas Park", pitches: [] });
        const likely = async () => (await call("GET", `/v1/venues/${palms}/duplicates`)).body.likely.map((v: { id: string }) => v.id);
        assert.deepEqual(await likely(), [palmsPark]);
        assert.equal((await call("POST", `/v1/venues/${palms}/not-the-same`, { others: [palms] })).status, 400);
        assert.equal((await call("POST", `/v1/venues/${palms}/not-the-same`, { others: [palmsPark] })).status, 200);
        assert.deepEqual(await likely(), []);
    });

    test("an import finds the venue and pitch by their other names", async () => {
        const result = await call("POST", "/v1/import/matches", { rows: [{ Date: "2026-11-14", Time: "9:00", Home: "A", Away: "B", Venue: "twin creeks sports complex", Pitch: "Pitch A" }] });
        assert.deepEqual(result.body.created.venues, []);
        const added = (await call("GET", `/v1/matches/${result.body.rows[0].matchId}`)).body;
        assert.deepEqual([added.venueId, added.pitchId], [other, pitch.one]);
    });
});
