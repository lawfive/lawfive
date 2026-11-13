import { PGlite } from "@electric-sql/pglite";
import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccessSettings } from "./access.ts";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { Push, tellNewRisks } from "./push.ts";
import { demoForecasts, linkDemoWatch, seedDemo, seedPlayedWeather } from "./demoData.ts";
import { Notices } from "./notices.ts";
import { AssignorCalendars } from "./feeds/calendars.ts";
import { defaultMaps } from "./config.ts";
import { type Db, migrationsFolder, tables } from "./db/index.ts";
import { ServerSettingsStore } from "./serverSettings.ts";
import { diskStore } from "./storage.ts";
import { openMeteo, openMeteoHistory } from "./weather/openMeteo.ts";
import { Weather } from "./weather/service.ts";

// `pnpm demo`: the server on an in-memory database (PGlite) filled with sample matches, venues and
// referees (demoData.ts), for trying the web UI without Postgres. Start the web UI with `pnpm dev`
// in web/ and sign in as demo@lawfive.dev / lawfive-demo. Everything is lost when it stops. PORT
// and WEB_URL run a second copy beside the first (with API_URL for Vite, see web/README.md).

const port = Number(process.env.PORT || 3000);
const webUrl = process.env.WEB_URL || "http://localhost:5173";
const email = "demo@lawfive.dev";
const password = "lawfive-demo";

const pg = new PGlite();
const db = drizzle(pg, { schema: tables });
await migrate(db, { migrationsFolder });
// New accounts wait for an admin's approval, and the demo account is an admin (USR-1, USR-4).
// Emails are printed rather than sent, so invitations and approvals can be tried here.
const access: AccessSettings = {
    signUp: "approval",
    adminEmails: [email],
    publicUrl: webUrl,
    mailer: { send: async (m) => console.log(`[email to ${m.to}] ${m.subject}${m.action ? `: ${m.action.url}` : ""}`) },
};
const demoSecret = "demo-secret-not-for-real-use-0123456789";
// Settings → Server (ADM-1) works here too; webhooks may reach this computer's own addresses.
access.store = new ServerSettingsStore(db, { ...process.env, WEBHOOK_ALLOW_PRIVATE: process.env.WEBHOOK_ALLOW_PRIVATE || "true" }, demoSecret, webUrl);
await access.store.load();
const auth = createAuth(db, { ...access, authSecret: demoSecret });
const { user } = await auth.api.signUpEmail({ body: { email, password, name: "Alex Morgan" } });
const played = await seedDemo(db, user.id);
// Signing up opened a session no browser holds; without it the Devices list shows only real devices.
await db.delete(tables.session).where(eq(tables.session.userId, user.id));
// ADM-5: the demo is for looking at the app, not for setting a server up.
await db.delete(tables.serverSetting).where(eq(tables.serverSetting.key, "setupPending"));
await seedPeople(db, user.id);

// A satellite layer if one is set up in ../.env (MAP_SATELLITE_URL, see .env.example).
const satellite = process.env.MAP_SATELLITE_URL
    ? { tileUrl: process.env.MAP_SATELLITE_URL, attribution: process.env.MAP_SATELLITE_ATTRIBUTION ?? "" }
    : undefined;
const maps = { ...defaultMaps, ...(satellite ? { satellite } : {}) };

// Weather: made-up forecasts with something to show (rain the night before, a hot afternoon, a
// thunderstorm), the same every time; DEMO_WEATHER=live fetches real ones from Open-Meteo instead.
// Matches imported into the demo get their real past weather (WX-10) unless DEMO_WEATHER=off.
const live = process.env.DEMO_WEATHER === "live";
const weather = new Weather(db, {
    provider: live ? openMeteo("https://api.open-meteo.com") : demoForecasts,
    ...(process.env.DEMO_WEATHER === "off" ? {} : { history: openMeteoHistory("https://archive-api.open-meteo.com") }),
    dailyLimit: 500,
});
// Matches already played keep the weather they had (made up too), before the first run would
// look up their real past weather.
await seedPlayedWeather(db, user.id, played, weather.source);
await weather.run();
// PUSH-5: only when asked, to try notifications against a relay: PUSH_RELAY_URL=https://… pnpm demo
const pushRelay = process.env.PUSH_RELAY_URL;
let notices: Notices | undefined;
if (pushRelay) {
    const push = new Push(db, pushRelay, fetch, process.env.RELAY_KEY);
    access.push = push;
    weather.afterRefresh = (now) => tellNewRisks(db, weather, push, now);
    // NOTE-1: what integrations do to the demo's matches.
    notices = new Notices(db, push);
    notices.start();
}
weather.start();

// FEED-1: assignor calendars, which may be on this computer (a test calendar served locally).
const assignorCalendars = new AssignorCalendars(db, { authSecret: demoSecret, allowPrivate: () => true, onChange: (type) => (type === "match" || type === "venue") && weather.poke() });
assignorCalendars.start();

// Photos go in a temporary folder, gone with the demo's database.
const files = await diskStore(mkdtempSync(join(tmpdir(), "lawfive-demo-")));
const app = createApp(db, auth, { access, geocoderUrl: "https://nominatim.openstreetmap.org", maps, weather, push: !!pushRelay, ...(notices ? { notices } : {}), assignorCalendars, webhooks: { allowPrivate: true }, files });
await linkDemoWatch(db, app, user.id);
serve({ fetch: app.fetch, port }, () => {
    console.log(`LawFive demo server on port ${port}. Run the web UI (pnpm dev in web/) and sign in as ${email} / ${password}`);
});

/**
 * Other people on the server, for the People page: two waiting for approval, two members (one an
 * admin, one who joined with an invitation), and invitations waiting to be used.
 */
async function seedPeople(db: Db, adminId: string) {
    const { user, session, invite } = tables;
    const days = (n: number) => new Date(Date.now() + n * 86_400_000);
    const person = async (name: string, address: string, joined: number, set: { status?: string; role?: string } = {}) => {
        const made = await auth.api.signUpEmail({ body: { email: address, password: randomUUID(), name } });
        await db.update(user).set({ createdAt: days(joined), ...set }).where(eq(user.id, made.user.id));
        // Their sign-up session stands for them having used the app since.
        await db.update(session).set({ updatedAt: days(Math.min(0, joined + 3)) }).where(eq(session.userId, made.user.id));
        return made.user.id;
    };
    await person("Priya Natarajan", "priya@example.com", -120, { status: "active", role: "admin" });
    const sam = await person("Sam Rivera", "sam@example.com", -40, { status: "active" });
    await person("Taylor Brooks", "taylor@example.com", -2);
    await person("Morgan Ellis", "morgan@example.com", 0);
    const token = () => randomUUID().replaceAll("-", "");
    await db.insert(invite).values([
        { id: randomUUID(), token: token(), email: "jordan@example.com", name: "Jordan Lee", createdById: adminId, createdAt: days(-3), expiresAt: days(11), emailedAt: days(-3) },
        { id: randomUUID(), token: token(), createdById: adminId, createdAt: days(-1), expiresAt: days(13) },
        { id: randomUUID(), token: token(), email: "sam@example.com", name: "Sam Rivera", createdById: adminId, createdAt: days(-42), expiresAt: days(-28), usedAt: days(-40), usedById: sam },
    ]);
}
