import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import { Hono } from "hono";
import { geocodeApi } from "../src/geocode.ts";

// PLAN-11: each search counts against the plan, and one account can't fill the shared queue.

const geocoder = createServer((_req, res) => {
    setTimeout(() => res.end(JSON.stringify([{ display_name: "Somewhere", lat: "37.4", lon: "-122.0" }])), 300);
});
await new Promise<void>((resolve) => geocoder.listen(0, resolve));
after(() => geocoder.close());

test("a plan's refusal is passed on, and at most two of one account's searches wait at once", async () => {
    const counted: string[] = [];
    const app = new Hono<{ Variables: { userId: string } }>();
    app.use(async (c, next) => {
        c.set("userId", c.req.header("x-user") ?? "");
        await next();
    });
    app.route("/", geocodeApi(`http://localhost:${(geocoder.address() as AddressInfo).port}`, async (userId) => {
        counted.push(userId);
        return userId === "over" ? { error: "Your plan allows 2 address searches a day.", retryAfter: 60 } : undefined;
    }));
    const search = (user: string, q: string) => app.request(`/geocode?q=${encodeURIComponent(q)}`, { headers: { "x-user": user } });

    const refused = await search("over", "1 Main St");
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get("retry-after"), "60");
    assert.match((await refused.json()).error, /2 address searches a day/);

    const three = await Promise.all([search("sam", "1 First St"), search("sam", "2 Second St"), search("sam", "3 Third St")]);
    assert.deepEqual(three.map((r) => r.status).sort(), [200, 200, 429]);
    assert.equal((await search("pat", "4 Fourth St")).status, 200, "another account isn't held up");
    assert.equal((await search("sam", "5 Fifth St")).status, 200, "once one finishes, another can wait");
    assert.equal(counted.filter((u) => u === "sam").length, 3, "the one refused for waiting isn't counted");
});
