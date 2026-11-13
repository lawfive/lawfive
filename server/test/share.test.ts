import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { checkAnswer } from "./contract.ts";

// Share links (DATA-7): a match's public page by a token, off until turned on, replaced or turned
// off by its owner, never showing the notes, fee, crew, contacts or names.

const publicUrl = "http://localhost:3000";
const examples = new URL("../../schema/examples/", import.meta.url).pathname;
const example = (file: string) => {
    const { version, updatedAt, deletedAt, ...rest } = JSON.parse(readFileSync(`${examples}${file}`, "utf8"));
    return rest;
};

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), {
    access: { signUp: "open", adminEmails: [], publicUrl },
});

async function call(method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed, headers: res.headers };
}

before(() => migrate(db, { migrationsFolder }));

describe("share links", () => {
    let session: string;
    const match = { ...example("Match.planned.json"), assignor: "Pat Rivera" };
    const venue = example("Venue.complex.json");
    const competition = example("Competition.league.json");
    const record = example("MatchRecord.full-match.json");
    let url: string;

    test("a match isn't shared until it's turned on", async () => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Share Tester", email: "share@example.com", password: "correct horse battery" }),
        });
        session = res.headers.get("set-auth-token") as string;
        assert.equal((await call("PUT", `/v1/venues/${venue.id}`, session, venue)).status, 201);
        assert.equal((await call("PUT", `/v1/competitions/${competition.id}`, session, competition)).status, 201);
        assert.equal((await call("PUT", `/v1/matches/${match.id}`, session, { ...match, competitionId: competition.id, venueId: venue.id, pitchId: venue.pitches[0].id })).status, 201);
        // A team official's name and an injury note, which a shared page leaves out.
        const events = record.events.map((e: { offender?: { kind: string } }) => (e.offender?.kind === "teamOfficial" ? { ...e, offender: { ...e.offender, name: "Pat Coach" } } : e));
        assert.equal((await call("PUT", `/v1/match-records/${record.id}`, session, { ...record, matchId: match.id, events })).status, 201);
        assert.equal((await call("GET", `/v1/matches/${match.id}/share`, session)).status, 404);
    });

    test("turning it on makes a link anyone can open, without the private parts", async () => {
        const made = await call("POST", `/v1/matches/${match.id}/share`, session);
        assert.equal(made.status, 201);
        url = made.body.url;
        assert.match(url, /^http:\/\/localhost:3000\/s\/[\w-]{32}$/);
        assert.equal((await call("GET", `/v1/matches/${match.id}/share`, session)).body.url, url);

        const token = url.split("/s/")[1];
        const shared = await call("GET", `/v1/shared/${token}`);
        assert.equal(shared.status, 200);
        assert.equal(shared.headers.get("x-robots-tag"), "noindex, nofollow");
        const { match: m, record: r } = shared.body;
        assert.equal(m.home.name, match.home.name);
        for (const hidden of ["notes", "outlook", "fee", "tags", "external", "venueId", "pitchId", "competitionId", "assignor", "templateId"]) {
            assert.equal(m[hidden], undefined, hidden);
        }
        assert.deepEqual(m.crew, []);
        assert.equal(shared.body.venue, venue.name);
        assert.equal(shared.body.pitch, venue.pitches[0].name);
        assert.equal(shared.body.competition, competition.name);
        assert.deepEqual(r.score, record.score);
        assert.ok(!JSON.stringify(r).includes("Pat Coach"), "no team official's name");
        assert.ok(!JSON.stringify(r).includes("Ankle"), "no notes on events");
        assert.equal(r.diagnostics, undefined, "no diagnostics");
        assert.equal(shared.body.track, false);
        assert.equal((await call("GET", `/v1/shared/${token}/track`)).status, 404);
    });

    test("its track is shared with its figures", async () => {
        const track = example("MatchTrack.short.json");
        const put = await app.request(`/v1/match-records/${record.id}/track`, {
            method: "PUT",
            headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${session}` },
            body: JSON.stringify(track),
        });
        assert.equal(put.status, 201);
        const token = url.split("/s/")[1];
        assert.equal((await call("GET", `/v1/shared/${token}`)).body.track, true);
        const shared = await call("GET", `/v1/shared/${token}/track`);
        assert.equal(shared.status, 200);
        assert.ok(shared.body.summary.total);
    });

    test("a new address stops the old one; turning it off or deleting the match stops it too", async () => {
        const old = url.split("/s/")[1];
        const renewed = await call("POST", `/v1/matches/${match.id}/share`, session);
        assert.notEqual(renewed.body.url, url);
        assert.equal((await call("GET", `/v1/shared/${old}`)).status, 404);
        const token = renewed.body.url.split("/s/")[1];
        assert.equal((await call("GET", `/v1/shared/${token}`)).status, 200);

        assert.equal((await call("DELETE", `/v1/matches/${match.id}/share`, session)).status, 200);
        assert.equal((await call("GET", `/v1/shared/${token}`)).status, 404);

        const again = (await call("POST", `/v1/matches/${match.id}/share`, session)).body.url.split("/s/")[1];
        const current = (await call("GET", `/v1/matches/${match.id}`, session)).body;
        assert.equal((await call("DELETE", `/v1/matches/${match.id}?version=${current.version}`, session)).status, 200);
        assert.equal((await call("GET", `/v1/shared/${again}`)).status, 404);
        assert.equal((await call("GET", "/v1/shared/not-a-real-token")).status, 404);
    });
});
