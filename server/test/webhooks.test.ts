import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { type IncomingHttpHeaders, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { addressProblem, privateAddress } from "../src/webhooks.ts";
import { checkAnswer } from "./contract.ts";

// Webhooks (HOOK-1 to HOOK-5): changes to records are POSTed, signed, to the user's webhooks on
// their topics; failures wait for a retry; Send test sends an example straight away.

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
// Private addresses allowed, as the receiver is on this machine; retries left to the test.
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { webhooks: { allowPrivate: true, retryEveryMs: 0 } });

async function call(method: string, path: string, token: string, body?: unknown) {
    const res = await app.request(path, {
        method,
        headers: { origin: publicUrl, "content-type": "application/json", authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = await res.json();
    checkAnswer(method, path, res.status, parsed, body);
    return { status: res.status, body: parsed };
}

/** A receiver on this machine: what it's sent, and the status it answers with. */
const received: { headers: IncomingHttpHeaders; body: string }[] = [];
let answer = 200;
const receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.writeHead(answer).end();
    });
});

async function waitFor(count: number) {
    for (let i = 0; i < 100 && received.length < count; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(received.length, count, `expected ${count} deliveries`);
}

before(async () => {
    await migrate(db, { migrationsFolder });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
});
after(() => receiver.close());

describe("webhooks", () => {
    let session: string;
    let hookUrl: string;
    let secret: string;
    let hookId: string;
    const matchId = "6d1c9b5e-4f3a-4b2c-9d8e-7f6a5b4c3d2e";
    const match = {
        status: "scheduled", kickoff: "2026-11-07T09:00:00-08:00", home: { name: "Strikers U12" }, away: { name: "Rovers U12" }, crew: [],
        format: { periods: 2, periodSec: 1800, breakSec: 300, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 9, clock: "up", trackStoppage: false, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false },
    };

    test("a webhook is added for some topics, its secret shown once", async () => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify({ name: "Hook Tester", email: "hooks@example.com", password: "correct horse battery" }),
        });
        session = res.headers.get("set-auth-token") as string;
        hookUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/lawfive`;
        const made = await call("POST", "/v1/webhooks", session, { url: hookUrl, topics: ["match", "matchRecord"] });
        assert.equal(made.status, 201);
        assert.match(made.body.secret, /^whsec_/);
        secret = made.body.secret;
        hookId = made.body.id;
        const list = await call("GET", "/v1/webhooks", session);
        assert.deepEqual(list.body.webhooks.map((w: { url: string; topics: string[] }) => [w.url, w.topics]), [[hookUrl, ["match", "matchRecord"]]]);
        assert.equal(list.body.webhooks[0].secret, undefined, "not shown again");
        assert.equal((await call("POST", "/v1/webhooks", session, { url: "ftp://example.com", topics: ["match"] })).status, 400);
        assert.equal((await call("POST", "/v1/webhooks", session, { url: hookUrl, topics: [] })).status, 400, "at least one topic");
    });

    test("a change to a match is sent, signed, as it's made; others' topics aren't", async () => {
        assert.equal((await call("PUT", `/v1/matches/${matchId}`, session, match)).status, 201);
        await waitFor(1);
        const [first] = received;
        const payload = JSON.parse(first.body);
        assert.equal(payload.event, "match.created");
        assert.equal(payload.data.id, matchId);
        assert.equal(payload.data.home.name, "Strikers U12");
        assert.equal(first.headers["x-lawfive-event"], "match.created");
        assert.equal(first.headers["x-lawfive-delivery"], payload.id);
        // The receiver checks the signature with the secret.
        const [, t, v1] = (first.headers["x-lawfive-signature"] as string).match(/^t=(\d+),v1=([0-9a-f]{64})$/)!;
        assert.equal(v1, createHmac("sha256", secret).update(`${t}.${first.body}`).digest("hex"));

        assert.equal((await call("PUT", `/v1/matches/${matchId}`, session, { ...match, version: 1, status: "postponed" })).status, 200);
        await waitFor(2);
        assert.equal(JSON.parse(received[1].body).event, "match.updated");
        assert.equal(JSON.parse(received[1].body).data.status, "postponed");

        const venue = await call("PUT", "/v1/venues/7e2d1c0b-5a4f-4e3d-8c2b-1a0f9e8d7c6b", session, { name: "Twin Creeks", pitches: [] });
        assert.equal(venue.status, 201);
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(received.length, 2, "venues aren't this webhook's topic");

        assert.equal((await call("DELETE", `/v1/matches/${matchId}?version=2`, session)).status, 200);
        await waitFor(3);
        const deleted = JSON.parse(received[2].body);
        assert.equal(deleted.event, "match.deleted");
        assert.deepEqual(Object.keys(deleted.data).sort(), ["deletedAt", "id", "version"]);
    });

    test("a failed delivery waits for a retry; deliveries are listed", async () => {
        answer = 500;
        await call("PUT", `/v1/matches/${matchId}`, session, { ...match, version: 3 });
        await waitFor(4);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const { body } = await call("GET", `/v1/webhooks/${hookId}/deliveries`, session);
        const [latest] = body.deliveries;
        assert.equal(latest.status, "pending", "to be tried again");
        assert.equal(latest.attempts, 1);
        assert.equal(latest.responseCode, 500);
        assert.equal(body.deliveries.length, 4);
        assert.equal((await call("GET", "/v1/webhooks", session)).body.webhooks[0].lastDelivery.status, "pending");
        answer = 200;
    });

    test("Send test sends an example now and says how it went", async () => {
        const res = await call("POST", `/v1/webhooks/${hookId}/test`, session, { topic: "referee" });
        assert.equal(res.status, 200);
        assert.equal(res.body.delivery.status, "delivered");
        assert.equal(res.body.delivery.responseCode, 200);
        assert.equal(res.body.delivery.test, true);
        assert.equal(res.body.payload.test, true);
        assert.equal(res.body.payload.event, "referee.updated");
        assert.equal(res.body.payload.data.name, "Sam Rivera", "a made-up referee: the account has none");
        assert.equal(JSON.parse(received.at(-1)!.body).id, res.body.delivery.id);
    });

    test("paused and deleted webhooks get nothing", async () => {
        const paused = await call("PUT", `/v1/webhooks/${hookId}`, session, { url: hookUrl, topics: ["match"], active: false });
        assert.equal(paused.body.active, false);
        const before = received.length;
        await call("PUT", `/v1/matches/${matchId}`, session, { ...match, version: 4 });
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(received.length, before);
        assert.equal((await call("DELETE", `/v1/webhooks/${hookId}`, session)).status, 200);
        assert.equal((await call("GET", "/v1/webhooks", session)).body.webhooks.length, 0);
    });

    test("private and local addresses are refused unless the server allows them (HOOK-4)", async () => {
        for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.20.0.5", "169.254.169.254", "::1", "fd12::1", "::ffff:10.0.0.1", "::7f00:1", "::ffff:0:a00:1", "64:ff9b:1::a00:1", "2001::1"]) {
            assert.ok(privateAddress(ip), ip);
        }
        for (const ip of ["8.8.8.8", "93.184.216.34", "2606:4700::1111"]) {
            assert.ok(!privateAddress(ip), ip);
        }
        assert.match((await addressProblem("http://192.168.0.10/hook", false))!, /private/);
        assert.match((await addressProblem("http://localhost:8080/", false))!, /private/);
        assert.equal(await addressProblem("http://192.168.0.10/hook", true), undefined);
        assert.match((await addressProblem("file:///etc/passwd", true))!, /http/);
    });
});
