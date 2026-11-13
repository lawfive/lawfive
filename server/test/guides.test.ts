import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { before, describe, test } from "node:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { signature } from "../src/webhooks.ts";
import { checkAnswer } from "./contract.ts";

// The worked examples for AI agents and integrations (AGT-2) run as written against the server, with
// an API key limited to what each guide says it needs; and each server describes itself (AGT-3).

const publicUrl = "http://localhost:3000";
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
const app = createApp(db, createAuth(db, { authSecret: "test-secret-that-is-at-least-32-characters", publicUrl, signUp: "open" }), { version: { version: "2030.1.2", commit: "abc1234" } });
const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<any>;

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

/** A guide's code, with what the test wants back, as a function its fetch and key are handed to. */
function guide(file: string, returning: string) {
    const text = readFileSync(new URL(`../../schema/guides/${file}.md`, import.meta.url), "utf8");
    const code = [...text.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n")
        .replace(/^import (\{[^}]+\}) from ("[^"]+");$/gm, "const $1 = await import($2);");
    return (key: string) => new AsyncFunction("fetch", "process", `${code}\nreturn ${returning};`)(
        (url: string, init?: RequestInit) => app.request(url, init),
        { env: { LAWFIVE_URL: publicUrl, LAWFIVE_KEY: key } },
    );
}

before(() => migrate(db, { migrationsFolder }));

describe("worked examples", () => {
    let session: string;
    const keyFor = async (...scopes: string[]) => {
        const made = await call("POST", "/v1/api-keys", session, { name: "Guide", scopes });
        assert.equal(made.status, 201);
        return made.body.key as string;
    };
    const ids = { venue: crypto.randomUUID(), referee: crypto.randomUUID(), match: crypto.randomUUID(), gone: crypto.randomUUID() };
    const format = { periods: 2, periodSec: 2700, breakSec: 900, halfwayBreak: false, halfwayBreakSec: 120, teamSize: 11, clock: "up", trackStoppage: false, breakStoppage: true, goalScorers: true, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false };

    before(async () => {
        const up = await call("POST", "/v1/auth/sign-up/email", undefined, { name: "Guide Reader", email: "guides@example.com", password: "correct horse battery" });
        session = up.headers.get("set-auth-token") as string;
        await call("PUT", `/v1/venues/${ids.venue}`, session, { name: "Memorial Park", pitches: [] });
        await call("PUT", `/v1/referees/${ids.referee}`, session, { name: "Alex Kim" });
        await call("PUT", `/v1/matches/${ids.match}`, session, {
            status: "scheduled", kickoff: "2099-01-01T10:00:00-08:00", home: { name: "Strikers" }, away: { name: "Rovers" }, venueId: ids.venue, format,
            crew: [{ role: "ar1", refereeId: ids.referee }, { role: "ar2", name: "Jordan Lee" }],
        });
        await call("PUT", `/v1/matches/${ids.gone}`, session, { status: "scheduled", home: {}, away: {}, crew: [], format });
        await call("DELETE", `/v1/matches/${ids.gone}`, session);
    });

    test("read matches with their venues and officials, on just the access it names", async () => {
        const run = guide("read-matches", "upcoming");
        const upcoming = await run(await keyFor("matches:read", "venues:read", "referees:read"));
        assert.deepEqual(upcoming, [{
            id: ids.match, title: "Strikers v Rovers", kickoff: "2099-01-01T10:00:00-08:00", venue: "Memorial Park",
            crew: [{ role: "ar1", name: "Alex Kim" }, { role: "ar2", name: "Jordan Lee" }],
        }]);
        await assert.rejects(run(await keyFor("matches:read")), /403/);
    });

    test("keep a copy up to date: deleted records go, and only what the key can read comes", async () => {
        const { copy, cursor } = await guide("keep-in-sync", "{ copy, cursor }")(await keyFor("matches:read"));
        assert.deepEqual([...copy.keys()], [`matches/${ids.match}`]);
        assert.ok(cursor > 0);
    });

    test("save a record: create, change, then delete", async () => {
        const key = await keyFor("matches:read", "matches:write");
        const { created, updated, deleted } = await guide("save-a-record", "{ created, updated, deleted }")(key);
        assert.equal(created.status, 201);
        assert.equal(updated.status, 200);
        assert.equal(updated.body.notes, "Bring spare flags.");
        assert.equal(updated.body.version, 2);
        assert.equal(deleted.status, 200);
        assert.ok(deleted.body.deletedAt);
    });

    test("save a record: a change someone else got to first is tried again on what they saved", async () => {
        const key = await keyFor("matches:read", "matches:write");
        const { update } = await guide("save-a-record", "{ update }")(key);
        await update(ids.match, (match: Record<string, unknown>) => ({ ...match, notes: "Someone else's change" }));
        let tries = 0;
        const saved = await update(ids.match, (match: Record<string, unknown>) => {
            tries++;
            return tries === 1 ? { ...match, version: 1 } : { ...match, outlook: "Fixed on the retry" };
        });
        assert.equal(tries, 2);
        assert.equal(saved.status, 200);
        assert.equal(saved.body.outlook, "Fixed on the retry");
        assert.equal(saved.body.notes, "Someone else's change", "kept what they saved");
    });

    test("receive webhooks: a good signature acts once, and a bad or old one is refused", async () => {
        const { handleDelivery } = await guide("receive-webhooks", "{ handleDelivery }")("");
        const secret = "whsec_test";
        const body = JSON.stringify({ id: "delivery-1", event: "match.updated", data: { id: ids.match } });
        const now = Math.floor(Date.now() / 1000);
        const header = (at: number, key = secret, text = body) => signature(key, text, at * 1000);
        const acted: string[] = [];
        const act = (event: string) => acted.push(event);
        assert.equal(handleDelivery(body, header(now), secret, act), 200);
        assert.equal(handleDelivery(body, header(now), secret, act), 200);
        assert.deepEqual(acted, ["match.updated"], "a repeat is ignored");
        assert.equal(handleDelivery(body, header(now, "whsec_other"), secret, act), 401);
        assert.equal(handleDelivery(body, header(now - 3600), secret, act), 401);
        assert.equal(handleDelivery(body, undefined, secret, act), 401);
        assert.equal(handleDelivery(`${body} `, header(now), secret, act), 401);
    });
});

describe("a server's own description", () => {
    test("is public, says which server and version it is, and is listed in the meta", async () => {
        const res = await app.request("/v1/openapi.json");
        assert.equal(res.status, 200);
        assert.match(res.headers.get("cache-control") ?? "", /public/);
        const doc = await res.json();
        checkAnswer("GET", "/v1/openapi.json", 200, doc);
        assert.deepEqual(doc.servers, [{ url: publicUrl, description: "This server" }]);
        assert.equal(doc.info.version, "2030.1.2");
        assert.ok(doc.paths["/v1/openapi.json"].get);
        assert.ok(doc.paths["/v1/matches"].get);
        const meta = await (await app.request("/v1/meta")).json();
        assert.equal(meta.openApiUrl, `${publicUrl}/v1/openapi.json`);
    });

    test("comes compressed to a client that can take it", async () => {
        const res = await app.request("/v1/openapi.json", { headers: { "accept-encoding": "gzip" } });
        assert.equal(res.headers.get("content-encoding"), "gzip");
        const raw = Buffer.from(await res.arrayBuffer());
        assert.ok(raw.length < 150_000, `${raw.length} bytes`);
        assert.equal(JSON.parse(gunzipSync(raw).toString("utf8")).openapi, "3.1.0");
    });
});
