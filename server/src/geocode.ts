import { Hono } from "hono";

// Address lookup for placing venues on the map: GET /v1/geocode?q=<address>. It goes through the
// server rather than from browsers because Nominatim (OpenStreetMap's geocoder, the default)
// asks for an identifiable client and at most one request a second. Results are cached.
// GEOCODER_URL points it at another Nominatim-compatible service, or "off" disables it. Each
// account's searches count against its plan's daily limit (PLAN-11), and at most two of its
// lookups wait in the queue at once.

interface Result {
    name: string;
    lat: number;
    lon: number;
}

const userAgent = "LawFive/0.1 (+https://lawfive.dev)";

/** A plan's daily limit (PLAN-11): counts a search, or says why not and for how long. */
export type SearchLimit = (userId: string) => Promise<{ error: string; retryAfter: number } | undefined>;

/** At most this many of one account's lookups wait their turn at once, so one account can't fill the queue. */
const waitingEach = 2;

/** `geocoderUrl` is a function for a setting an admin can change (ADM-2): none means address search is off. */
export function geocodeApi(geocoderUrl: string | (() => string | undefined), limit?: SearchLimit) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const waiting = new Map<string, number>();
    const cache = new Map<string, Result[]>();
    let queue: Promise<unknown> = Promise.resolve();

    /** Runs lookups one at a time, at least a second apart. */
    const throttled = <T>(task: () => Promise<T>): Promise<T> => {
        const run = queue.then(task);
        queue = run.catch(() => undefined).then(() => new Promise((resolve) => setTimeout(resolve, 1000)));
        return run;
    };

    api.get("/geocode", async (c) => {
        const q = (c.req.query("q") ?? "").trim().replace(/\s+/g, " ");
        if (q.length < 3 || q.length > 200) {
            return c.json({ error: "q must be 3 to 200 characters" }, 400);
        }
        const base = typeof geocoderUrl === "function" ? geocoderUrl() : geocoderUrl;
        if (!base) {
            return c.json({ error: "address search is off on this server" }, 404);
        }
        // A place in the queue is taken before anything is awaited, so searches sent together count.
        const userId = c.var.userId;
        if ((waiting.get(userId) ?? 0) >= waitingEach) {
            return c.json({ error: "Wait for your last search to finish." }, 429, { "retry-after": "2" });
        }
        waiting.set(userId, (waiting.get(userId) ?? 0) + 1);
        try {
            const over = limit && await limit(userId);
            if (over) {
                return c.json({ error: over.error }, 429, { "retry-after": String(over.retryAfter) });
            }
            const key = `${base} ${q.toLowerCase()}`;
            let results = cache.get(key);
            if (!results) {
                const url = `${base.replace(/\/$/, "")}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
                // Unreachable or slow (10 s, so one stuck lookup can't hold the shared queue) counts as not
                // answering, the same as an error status.
                const res = await throttled(() => fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(10_000) })).catch(() => undefined);
                if (!res?.ok) {
                    return c.json({ error: "the address lookup service didn't answer" }, 502);
                }
                const found = (await res.json()) as { display_name: string; lat: string; lon: string }[];
                results = found.map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon) }));
                if (cache.size > 500) {
                    cache.delete(cache.keys().next().value as string);
                }
                cache.set(key, results);
            }
            return c.json({ results });
        } finally {
            const left = (waiting.get(userId) ?? 1) - 1;
            if (left > 0) {
                waiting.set(userId, left);
            } else {
                waiting.delete(userId);
            }
        }
    });

    return api;
}
