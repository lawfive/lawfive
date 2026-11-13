import { Id } from "@lawfive/schema";
import { Hono } from "hono";
import type { Weather } from "./service.ts";

// The weather for the signed-in user's matches (WX-5), worked out from the forecasts this server
// keeps; apps never call the weather service themselves.
//
//   GET /v1/weather?from=<time>&to=<time>   matches kicking off between the two (by default the
//                                           last 30 days and the next 16), where there is weather
//   GET /v1/weather/:matchId                one match's weather, or 404 when there's none

const DAY_MS = 86_400_000;

export function weatherApi(weather: Weather) {
    const api = new Hono<{ Variables: { userId: string } }>();

    api.get("/weather", async (c) => {
        const now = Date.now();
        const time = (name: string, fallback: number) => {
            const value = c.req.query(name);
            return value === undefined ? new Date(fallback) : new Date(value);
        };
        const from = time("from", now - 30 * DAY_MS);
        const to = time("to", now + 17 * DAY_MS);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from || to.getTime() - from.getTime() > 400 * DAY_MS) {
            return c.json({ error: "from and to must be times (ISO 8601), at most 400 days apart" }, 400);
        }
        return c.json({ items: await weather.forUser(c.var.userId, from, to) });
    });

    api.get("/weather/:matchId", async (c) => {
        const id = Id.safeParse(c.req.param("matchId"));
        const found = id.success ? await weather.forMatch(c.var.userId, id.data) : undefined;
        return found ? c.json(found) : c.json({ error: "no weather for this match" }, 404);
    });

    return api;
}
