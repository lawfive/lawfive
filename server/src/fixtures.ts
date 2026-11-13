import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mock } from "node:test";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { migrationsFolder, tables } from "./db/index.ts";
import { type NewId, demoForecasts, linkDemoWatch, seedDemo, seedPlayedWeather } from "./demoData.ts";
import { Weather } from "./weather/service.ts";

// The phones' snapshot tests draw their screens from these: the demo account's data (demoData.ts)
// and a new account's, as the API answers the phones, written to schema/generated/fixtures/ by
// `pnpm fixtures`. The same files every run: a fixed clock and time zone, ids counted per kind, and
// made-up weather, with nothing fetched. server/test/fixtures.test.ts checks they're up to date
// and that every one is what its endpoint describes.

/** The fixtures' "now": Monday 9 November 2026, 08:00 in California. */
export const fixturesNow = "2026-11-09T16:00:00.000Z";
export const fixturesTimeZone = "America/Los_Angeles";

/** The demo account, as on the demo server. */
const demoAccount = { name: "Alex Morgan", email: "demo@lawfive.dev", password: "lawfive-demo" };
const newAccount = { name: "Jamie Park", email: "new@lawfive.dev", password: "lawfive-new-account" };

/** Each kind's ids start with its own number, then count: 00000007-0000-4000-8000-000000000001 is the first match. */
const idKinds = ["settings", "matchTemplate", "competition", "venue", "pitch", "referee", "match", "matchRecord"];

function stableIds(): NewId {
    const counts = new Map<string, number>();
    return (kind) => {
        const k = idKinds.indexOf(kind) + 1;
        if (k === 0) {
            throw new Error(`No id kind for ${kind}`);
        }
        const n = (counts.get(kind) ?? 0) + 1;
        counts.set(kind, n);
        return `${k.toString(16).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
    };
}

/** Which endpoint each file is the answer of, for the test to check it against the description. */
export const fixtureSources: Record<string, { method: "get"; path: string }> = {
    "demo/changes.json": { method: "get", path: "/v1/changes" },
    "demo/stats.json": { method: "get", path: "/v1/stats" },
    "demo/weather.json": { method: "get", path: "/v1/weather" },
    "demo/track.json": { method: "get", path: "/v1/match-records/{id}/track" },
    "demo/devices.json": { method: "get", path: "/v1/devices" },
    "demo/devices-matches.json": { method: "get", path: "/v1/devices/matches" },
    "new-account/changes.json": { method: "get", path: "/v1/changes" },
    "new-account/stats.json": { method: "get", path: "/v1/stats" },
    "new-account/weather.json": { method: "get", path: "/v1/weather" },
};

type Json = Record<string, any>;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The files, by path in schema/generated/fixtures/. */
export async function fixtureFiles(): Promise<Record<string, string>> {
    const zone = process.env.TZ;
    process.env.TZ = fixturesTimeZone;
    mock.timers.enable({ apis: ["Date"], now: Date.parse(fixturesNow) });
    try {
        return await build();
    } finally {
        mock.timers.reset();
        if (zone === undefined) {
            delete process.env.TZ;
        } else {
            process.env.TZ = zone;
        }
    }
}

async function build(): Promise<Record<string, string>> {
    const publicUrl = "http://localhost:3000";
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const access = { signUp: "open" as const, adminEmails: [], publicUrl };
    const auth = createAuth(db, { ...access, authSecret: "fixtures-secret-not-for-real-use-0123456789" });
    const weather = new Weather(db, { provider: demoForecasts, dailyLimit: 500 });
    const app = createApp(db, auth, { access, weather });

    const signUp = async (account: typeof demoAccount) => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST",
            headers: { origin: publicUrl, "content-type": "application/json" },
            body: JSON.stringify(account),
        });
        const body = (await res.json()) as { user: { id: string } };
        return { userId: body.user.id, token: res.headers.get("set-auth-token") as string };
    };
    const get = async (token: string, path: string, status = 200): Promise<Json> => {
        const res = await app.request(path, { headers: { origin: publicUrl, authorization: `Bearer ${token}` } });
        if (res.status !== status) {
            throw new Error(`GET ${path} answered ${res.status}: ${await res.text()}`);
        }
        return res.json() as Promise<Json>;
    };

    const demo = await signUp(demoAccount);
    const played = await seedDemo(db, demo.userId, stableIds());
    await seedPlayedWeather(db, demo.userId, played, weather.source);
    // The demo's linked Venu 2 (SYNC-14), with a link of its own so its id is the same every run.
    await linkDemoWatch(db, app, demo.userId, { sessionId: "watch-link-venu2", token: "fixtures-watch-token-not-for-real-use" });
    await weather.run();
    const fresh = await signUp(newAccount);

    const files: Record<string, Json> = {};
    for (const [folder, { token }] of [["demo", demo], ["new-account", fresh]] as const) {
        const changes = await get(token, "/v1/changes?since=0&limit=1000");
        if (changes.more) {
            throw new Error("More than one page of changes");
        }
        files[`${folder}/changes.json`] = changes;
        files[`${folder}/stats.json`] = await get(token, "/v1/stats");
        files[`${folder}/weather.json`] = await get(token, "/v1/weather");
    }

    // One match's track: the first refereed match played with one, for its map, heatmap and figures.
    const records = (kind: string) => (files["demo/changes.json"].changes as Json[]).filter((c) => c.collection === kind).map((c) => c.record);
    const matches = records("matches");
    const matchReports = records("match-records");
    let tracked: { match: Json; record: Json } | undefined;
    for (const record of matchReports) {
        const match = matches.find((m) => m.id === record.matchId);
        if (match?.role === "referee" && (await app.request(`/v1/match-records/${record.id}/track`, { headers: { authorization: `Bearer ${demo.token}` } })).status === 200) {
            tracked = { match, record };
            break;
        }
    }
    if (!tracked) {
        throw new Error("No refereed match with a track in the demo");
    }
    files["demo/track.json"] = await get(demo.token, `/v1/match-records/${tracked.record.id}/track`);
    // The linked watches and what's on them (SYNC-14). Not the session these were fetched with: the
    // phones add themselves, as the device asking.
    const devices = await get(demo.token, "/v1/devices");
    files["demo/devices.json"] = { devices: (devices.devices as Json[]).filter((d) => !d.current) };
    files["demo/devices-matches.json"] = await get(demo.token, "/v1/devices/matches");
    await pg.close();

    const index = fixtureIndex(matches, matchReports, tracked);
    const out: Record<string, string> = { "index.json": json(index), "README.md": readme(matches, matchReports, tracked) };
    for (const [path, value] of Object.entries(files)) {
        out[path] = json(value);
    }
    return out;
}

const kickoffOf = (m: Json) => Date.parse(m.kickoff);

/** The ids a screen wants, picked out by what the matches are, so they stay right as the demo changes. */
function fixtureIndex(matches: Json[], reports: Json[], tracked: { match: Json; record: Json }) {
    const now = Date.parse(fixturesNow);
    const reportOf = (m: Json) => reports.find((r) => r.matchId === m.id);
    const upcoming = matches.filter((m) => m.status === "scheduled" && kickoffOf(m) > now).sort((a, b) => kickoffOf(a) - kickoffOf(b));
    const playedOnes = matches.filter((m) => m.status === "played").sort((a, b) => kickoffOf(b) - kickoffOf(a));
    const pick = (found: Json | undefined, what: string) => {
        if (!found) {
            throw new Error(`No ${what} in the demo`);
        }
        return found.id as string;
    };
    return {
        now: fixturesNow,
        timeZone: fixturesTimeZone,
        accounts: {
            demo: { name: demoAccount.name, email: demoAccount.email },
            "new-account": { name: newAccount.name, email: newAccount.email },
        },
        demo: {
            matches: {
                next: pick(upcoming[0], "upcoming match"),
                nextAsAssistant: pick(upcoming.find((m) => m.role === "ar1" || m.role === "ar2"), "upcoming match as an assistant"),
                postponed: pick(matches.find((m) => m.status === "postponed"), "postponed match"),
                canceled: pick(matches.find((m) => m.status === "cancelled"), "canceled match"),
                withTrack: tracked.match.id as string,
                lastPlayed: pick(playedOnes[0], "played match"),
                penalties: pick(matches.find((m) => reportOf(m)?.penalties), "match decided on penalties"),
                goldenGoal: pick(matches.find((m) => reportOf(m)?.goldenGoal), "match won on a golden goal"),
                sendOff: pick(matches.find((m) => reportOf(m)?.events.some((e: Json) => e.type === "sendOff")), "match with a send-off"),
                abandoned: pick(matches.find((m) => m.status === "abandoned"), "abandoned match"),
            },
            trackRecord: tracked.record.id as string,
        },
    };
}

function readme(matches: Json[], reports: Json[], tracked: { match: Json; record: Json }): string {
    // By hand rather than with Intl, whose words and spaces change with Node's version. The clock's
    // time zone is set while this runs, so local time is California's.
    const two = (n: number) => String(n).padStart(2, "0");
    const day = (iso: string) => {
        const d = new Date(iso);
        return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
    };
    const rows = [...matches].sort((a, b) => kickoffOf(a) - kickoffOf(b)).map((m) => {
        const report = reports.find((r) => r.matchId === m.id);
        const score = report ? ` ${report.score.home}-${report.score.away}${report.penalties ? ` (${report.penalties.home}-${report.penalties.away} pens)` : ""}` : "";
        const notes = [m.name, m.id === tracked.match.id ? "track: `demo/track.json`" : undefined].filter(Boolean).join("; ");
        return `| \`${m.id}\` | ${day(m.kickoff)} | ${m.home.name} v ${m.away.name}${score} | ${m.status} | ${m.role} | ${notes} |`;
    });
    return `# Fixtures for the phones' snapshot tests

The demo account's data and a new account's, exactly as the API answers the phones, for the Android
and iPhone snapshot tests to draw screens from (each phone README's snapshot section). Both phones decode the
same files with the generated models (\`schema/generated/kotlin\`, \`schema/generated/swift\`), so
they draw the same data, as the website's screenshots do from the demo.

Generated: don't edit. After changing the demo's data (\`server/src/demoData.ts\`) or what an
endpoint answers, run \`pnpm fixtures\` in \`server/\`; its \`pnpm test\` fails while these are out of
date, and checks each file against its endpoint in \`schema/src/endpoints.ts\`. \`pnpm generate\` in
\`schema/\` leaves this folder alone.

They're the same every run: the clock is fixed at ${fixturesNow} (08:00 on Monday 9 November 2026
in ${fixturesTimeZone}), kickoffs are days from then in that time zone, the weather is made up, and
each kind of record's ids count from 1 with the kind's own first part (\`00000007-…\` for matches).
Screens that say "today" or "in 2 days" need the same clock and time zone: \`now\` and \`timeZone\`
in \`index.json\`.

| File | What it is | Decode as | For |
|---|---|---|---|
| \`index.json\` | The clock and time zone, the accounts' names, and the ids a screen wants (the next match, the one with a track, a postponed one, …) | plain JSON | every screen |
| \`demo/changes.json\` | \`GET /v1/changes?since=0\`: every record, as the first sync after signing in gets it (settings, match templates, competitions, venues with pitches, referees, matches, match records with their events) | \`ChangesPage\` | Matches and Get ready, a match, the match form, Venues, Referees, Competitions, Settings |
| \`demo/stats.json\` | \`GET /v1/stats\`, no filters | \`Stats\` | Stats |
| \`demo/weather.json\` | \`GET /v1/weather\`: forecasts for the matches coming up, and the weather kept for those played | \`{ items: [MatchWeather] }\` | Matches and Get ready, a match |
| \`demo/track.json\` | \`GET /v1/match-records/${tracked.record.id}/track\`: the track, its figures, the pitch and the heatmap | \`{ track: MatchTrack, summary: TrackSummary, pitch: PitchOutline, heat, updatedAt }\` | a match: map, heatmap, replay, heart rate, figures |
| \`new-account/changes.json\` | The same for an account just made: nothing yet, so the phones' own defaults apply | \`ChangesPage\` | first run, empty Matches, Settings's defaults |
| \`new-account/stats.json\` | Stats with no games | \`Stats\` | empty Stats |
| \`new-account/weather.json\` | No weather | \`{ items: [MatchWeather] }\` | empty Matches |

The demo's account is ${demoAccount.name} (${demoAccount.email}); the new one is ${newAccount.name}
(${newAccount.email}). The account itself (\`GET /v1/account\`) isn't here: its id is made at sign-up,
so it would change every run.

## The demo's matches

| Id | Kickoff (${fixturesTimeZone}) | Match | Status | Role | Notes |
|---|---|---|---|---|---|
${rows.join("\n")}
`;
}

/** `pnpm fixtures`: writes the files, replacing the folder. */
if (import.meta.main) {
    const folder = new URL("../../schema/generated/fixtures/", import.meta.url).pathname;
    const files = await fixtureFiles();
    rmSync(folder, { recursive: true, force: true });
    let bytes = 0;
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(`${folder}${path.slice(0, path.lastIndexOf("/") + 1)}`, { recursive: true });
        writeFileSync(`${folder}${path}`, content);
        bytes += Buffer.byteLength(content);
    }
    console.log(`Wrote ${Object.keys(files).length} files (${Math.round(bytes / 1024)} KB) to schema/generated/fixtures/`);
}
