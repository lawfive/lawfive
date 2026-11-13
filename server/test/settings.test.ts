import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AccessSettings } from "../src/access.ts";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { type Db, migrationsFolder, tables } from "../src/db/index.ts";
import type { Message } from "../src/mail.ts";
import { ServerSettingsStore } from "../src/serverSettings.ts";
import { Weather } from "../src/weather/service.ts";
import { checkAnswer } from "./contract.ts";

// Server settings admins change in the web app (ADM-1 to ADM-4): set in the environment, fixed
// there; otherwise changeable, taking effect straight away; secrets stored encrypted and never
// sent back.

const publicUrl = "http://localhost:3000";
const password = "correct horse battery";
const authSecret = "test-secret-that-is-at-least-32-characters";

async function server(env: Record<string, string> = {}) {
    const pg = new PGlite();
    const db = drizzle(pg, { schema: tables });
    await migrate(db, { migrationsFolder });
    const store = new ServerSettingsStore(db, env, authSecret, publicUrl);
    await store.load();
    const sent: Message[] = [];
    // As main.ts does: a mailer while email is set up (here one that keeps what it's given).
    const mailerFor = () => (store.mail() ? { send: async (m: Message) => void sent.push(m) } : undefined);
    const access: AccessSettings = { signUp: (env.SIGN_UP as AccessSettings["signUp"]) || "open", signUpFixed: !!env.SIGN_UP, adminEmails: ["boss@example.com"], publicUrl, mailer: mailerFor(), store };
    const weather = new Weather(db, store.weather() ? { provider: async () => [], dailyLimit: 10 } : undefined);
    store.onChange(() => {
        access.mailer = mailerFor();
        weather.configure(store.weather() ? { provider: async () => [], dailyLimit: 10 } : undefined);
    });
    // As main.ts does: auth reads the mailer as it is when it sends.
    const auth = createAuth(db, {
        signUp: access.signUp, signUpFixed: access.signUpFixed, adminEmails: access.adminEmails, publicUrl, authSecret,
        get mailer() {
            return access.mailer;
        },
    });
    const app = createApp(db, auth, { access, weather });

    async function call(method: string, path: string, token?: string, body?: unknown) {
        const res = await app.request(path, {
            method,
            headers: { origin: publicUrl, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text;
        checkAnswer(method, path, res.status, parsed, body);
        return { status: res.status, body: parsed };
    }
    const signUp = async (email: string, name: string) => {
        const res = await app.request("/v1/auth/sign-up/email", {
            method: "POST", headers: { origin: publicUrl, "content-type": "application/json" }, body: JSON.stringify({ name, email, password }),
        });
        return res.headers.get("set-auth-token")!;
    };
    const setting = async (token: string, key: string) =>
        (await call("GET", "/v1/server-settings", token)).body.settings.find((s: { key: string }) => s.key === key);
    return { db, call, signUp, setting, sent };
}

describe("settings an admin changes", async () => {
    const s = await server();
    const boss = await s.signUp("boss@example.com", "The Boss");
    const kim = await s.signUp("kim@example.com", "Kim Park");

    test("only admins see and change them", async () => {
        assert.equal((await s.call("GET", "/v1/server-settings", kim)).status, 403);
        assert.equal((await s.call("PUT", "/v1/server-settings", kim, { mailFrom: "x" })).status, 403);
        assert.deepEqual(await s.setting(boss, "geocoderUrl"), { key: "geocoderUrl", env: "GEOCODER_URL", source: "default" });
    });

    test("email set up in the web app works straight away; its address is stored encrypted and never sent back", async () => {
        assert.equal((await s.call("POST", "/v1/server-settings/test-email", boss)).status, 409, "no email yet");
        assert.ok(!(await s.call("GET", "/v1/meta")).body.capabilities.includes("email"));
        const put = await s.call("PUT", "/v1/server-settings", boss, { smtpUrl: "smtp://lawfive:hunter2@mail.example.com:587", mailFrom: "LawFive <ref@example.com>" });
        assert.equal(put.status, 200);
        assert.deepEqual(await s.setting(boss, "smtpUrl"), { key: "smtpUrl", env: "SMTP_URL", source: "admin", secret: true, set: true });
        assert.equal((await s.setting(boss, "mailFrom")).value, "LawFive <ref@example.com>");
        const [row] = await s.db.select().from(tables.serverSetting).where(eq(tables.serverSetting.key, "smtpUrl"));
        assert.ok(String(row.value).startsWith("enc:") && !String(row.value).includes("hunter2"), "encrypted");
        assert.ok((await s.call("GET", "/v1/meta")).body.capabilities.includes("email"));
        const test = await s.call("POST", "/v1/server-settings/test-email", boss);
        assert.equal(test.status, 200);
        assert.equal(test.body.to, "boss@example.com");
        assert.equal(s.sent.at(-1)?.subject, "LawFive can send email");
        // Cleared: back to no email.
        await s.call("PUT", "/v1/server-settings", boss, { smtpUrl: null });
        assert.ok(!(await s.call("GET", "/v1/meta")).body.capabilities.includes("email"));
    });

    test("a number or true/false comes back as postgres.js hands it over", async () => {
        const fresh = await server();
        // postgres.js and Drizzle both parse jsonb, so "16" reaches the store as 16 (PGlite doesn't).
        await fresh.db.insert(tables.serverSetting).values([
            { key: "webhookAllowPrivate", value: true }, { key: "weatherDailyLimit", value: 500 },
        ]);
        const store = new ServerSettingsStore(fresh.db, {}, authSecret, publicUrl);
        await store.load();
        const shown = (key: string) => store.describe().find((d) => d.key === key);
        assert.equal(shown("webhookAllowPrivate")?.value, "true");
        assert.equal(shown("weatherDailyLimit")?.value, "500");
    });

    test("a value a setting doesn't take changes nothing", async () => {
        const bad = await s.call("PUT", "/v1/server-settings", boss, { mapSatelliteUrl: "https://tiles.example.com/{z}/{x}/{y}.jpg", weatherDailyLimit: "lots" });
        assert.equal(bad.status, 400);
        assert.match(bad.body.error, /WEATHER_DAILY_LIMIT/);
        assert.equal((await s.call("GET", "/v1/meta")).body.maps.satellite, undefined, "the good one wasn't kept either");
    });

    test("maps, address search, weather and sign-up follow as they're set", async () => {
        await s.call("PUT", "/v1/server-settings", boss, {
            mapSatelliteUrl: "https://tiles.example.com/{z}/{x}/{y}.jpg", mapSatelliteAttribution: "Example", geocoderUrl: "off", weatherUrl: "off", signUp: "approval",
        });
        const meta = (await s.call("GET", "/v1/meta")).body;
        assert.equal(meta.maps.satellite.tileUrl, "https://tiles.example.com/{z}/{x}/{y}.jpg");
        assert.ok(!meta.capabilities.includes("geocode"));
        assert.ok(!meta.capabilities.includes("weather"));
        assert.equal(meta.signUp, "approval");
        assert.equal((await s.call("GET", "/v1/geocode?q=Twin Creeks", boss)).status, 404);
        await s.call("PUT", "/v1/server-settings", boss, { weatherUrl: null });
        assert.ok((await s.call("GET", "/v1/meta")).body.capabilities.includes("weather"), "back on: the default service");
    });

    test("a new AUTH_SECRET can't read the secrets, which count as unset", async () => {
        await s.call("PUT", "/v1/server-settings", boss, { weatherApiKey: "secret-key" });
        const other = new ServerSettingsStore(s.db as Db, {}, "another-secret-that-is-at-least-32-characters", publicUrl);
        await other.load();
        assert.equal(other.weather()?.apiKey, undefined);
    });
});

describe("settings the environment sets", async () => {
    const s = await server({ SMTP_URL: "smtp://env@mail.example.com", SIGN_UP: "closed", GEOCODER_URL: "off" });
    // ADMIN_EMAILS can sign up when SIGN_UP=closed.
    const boss = await s.signUp("boss@example.com", "The Boss");

    test("are shown as fixed, secrets still not sent back, and can't be changed", async () => {
        assert.deepEqual(await s.setting(boss, "smtpUrl"), { key: "smtpUrl", env: "SMTP_URL", source: "environment", secret: true, set: true });
        assert.deepEqual(await s.setting(boss, "signUp"), { key: "signUp", env: "SIGN_UP", source: "environment", value: "closed" });
        const smtp = await s.call("PUT", "/v1/server-settings", boss, { smtpUrl: "smtp://other@mail.example.com" });
        assert.equal(smtp.status, 400);
        assert.match(smtp.body.error, /SMTP_URL is set on the server/);
        assert.equal((await s.call("PUT", "/v1/server-settings", boss, { signUp: "open" })).status, 400);
        assert.equal((await s.call("GET", "/v1/meta")).body.signUp, "closed");
        assert.ok((await s.call("GET", "/v1/meta")).body.capabilities.includes("email"));
    });
});

describe("what follows the settings", async () => {
    test("password resets and approval emails start when email is set up, without a restart", async () => {
        const s = await server();
        const boss = await s.signUp("boss@example.com", "The Boss");
        const reset = () => s.call("POST", "/v1/auth/request-password-reset", undefined, { email: "boss@example.com" });
        assert.equal((await reset()).status, 400, "no email yet");
        await s.call("PUT", "/v1/server-settings", boss, { smtpUrl: "smtp://lawfive:hunter2@mail.example.com", signUp: "approval" });
        assert.equal((await reset()).status, 200);
        await s.signUp("kim@example.com", "Kim Park");
        await new Promise((resolve) => setTimeout(resolve, 20));
        assert.ok(s.sent.some((m) => m.to === "boss@example.com" && m.action?.url.endsWith("/people")), "the admin is told someone is waiting");
    });

    test("SIGN_UP beats a choice stored before it was set", async () => {
        const s = await server({ SIGN_UP: "closed" });
        await s.db.insert(tables.serverSetting).values({ key: "signUp", value: "open" });
        assert.equal((await s.call("GET", "/v1/meta")).body.signUp, "closed");
        assert.ok(await s.signUp("first@example.com", "The First"), "a new server's first account is always made (USR-8)");
        assert.equal(await s.signUp("stranger@example.com", "A Stranger"), null, "no account");
    });
});
