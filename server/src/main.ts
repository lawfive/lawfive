import { serve } from "@hono/node-server";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { newSetupCode, serverIsEmpty } from "./access.ts";
import { createApp } from "./app.ts";
import type { AccessSettings } from "./access.ts";
import { createAuth } from "./auth.ts";
import { configFromEnv } from "./config.ts";
import { migrationsFolder, tables } from "./db/index.ts";
import { ServerSettingsStore } from "./serverSettings.ts";
import { type FileStore, diskStore, parseS3Url, s3Store } from "./storage.ts";
import { smtpMailer } from "./mail.ts";
import { Push, tellNewRisks } from "./push.ts";
import { Notices } from "./notices.ts";
import { openMeteo, openMeteoHistory } from "./weather/openMeteo.ts";
import { Weather, type WeatherOptions } from "./weather/service.ts";
import { plansOf } from "./plans.ts";
import { lockoutsOf } from "./lockout.ts";
import { trustedProxies } from "./limits.ts";
import { AssignorCalendars } from "./feeds/calendars.ts";

// Starts the server: brings the database up to date, then listens on PORT.

const config = configFromEnv();
const client = postgres(config.databaseUrl);
const db = drizzle(client, { schema: tables });

await migrate(db, { migrationsFolder });
// ADM-1: the settings an admin can change in the web app, unless the environment sets them.
const settings = new ServerSettingsStore(db, process.env, config.authSecret, config.publicUrl);
await settings.load();
const weatherOptions = (): WeatherOptions | undefined => {
    const w = settings.weather();
    return w ? {
        provider: openMeteo(w.url, w.apiKey),
        ...(w.historyUrl ? { history: openMeteoHistory(w.historyUrl, w.apiKey) } : {}),
        dailyLimit: w.dailyLimit,
    } : undefined;
};
const weather = new Weather(db, weatherOptions());
weather.start();
// Uploaded photos (FILE-4). If the folder can't be written to, the server runs without them.
let files: FileStore | undefined;
try {
    files = config.s3Url ? s3Store(parseS3Url(config.s3Url)) : await diskStore(config.uploadsDir);
    console.log(`Photos are kept in ${files.where}`);
} catch (e) {
    console.error(`Photos are switched off: ${(e as Error).message}`);
}
const webRoot = process.env.WEB_ROOT ?? new URL("../../web/dist", import.meta.url).pathname;
const mail = settings.mail();
const access: AccessSettings = {
    // The environment's, or the default: what an admin chose is read each time (currentSignUp).
    signUp: config.signUp,
    signUpFixed: !!process.env.SIGN_UP,
    adminEmails: config.adminEmails,
    publicUrl: config.publicUrl,
    ...(config.apiUrl ? { apiUrl: config.apiUrl } : {}),
    ...(mail ? { mailer: smtpMailer(mail) } : {}),
    store: settings,
};
// An admin's change takes effect straight away: a new mailer, weather service, or none.
settings.onChange(() => {
    const now = settings.mail();
    access.mailer = now ? smtpMailer(now) : undefined;
    weather.configure(weatherOptions());
});
// ADM-5, SEC-8: an empty server asks for a code from these logs, so whoever reaches it first can't
// take it, ADMIN_EMAILS or not; and so does one emptied while it runs.
access.makeSetupCode = () => {
    const code = newSetupCode();
    console.log(`\n  This server has no accounts. Open ${config.publicUrl} to set it up, with this code:\n\n      ${code}\n\n  A new code is made each time the server starts, until the first account exists.\n`);
    return code;
};
if (await serverIsEmpty(db)) {
    access.setupCode = access.makeSetupCode();
}
// The reset email reads the mailer as it is when it's sent.
const auth = createAuth(db, {
    signUp: access.signUp, signUpFixed: access.signUpFixed, adminEmails: access.adminEmails, publicUrl: access.publicUrl, authSecret: config.authSecret,
    get mailer() {
        return access.mailer;
    },
    // One code for the wizard and the sign-up, made when needed (currentSetupCode).
    get setupCode() {
        return access.setupCode;
    },
    set setupCode(code) {
        access.setupCode = code;
    },
    makeSetupCode: access.makeSetupCode,
});
// PLAN-1 to PLAN-6: plans end on time, with reminders; the first plan takes ACCOUNT_STORAGE_LIMIT_MB from before plans.
const plans = plansOf(db);
plans.configure({
    mailer: () => access.mailer,
    publicUrl: config.publicUrl,
    firstStorageMb: () => Number(process.env.ACCOUNT_STORAGE_LIMIT_MB) > 0 ? Number(process.env.ACCOUNT_STORAGE_LIMIT_MB) : undefined,
});
plans.start();
// SEC-12: wrong passwords a day old are deleted, not only ignored, as the privacy policy says.
const lockouts = lockoutsOf(db, access);
const forgetLocks = () => void lockouts.forget().catch((e: unknown) => console.error("Sign-in locks:", e));
forgetLocks();
const forgetLocksTimer = setInterval(forgetLocks, 60 * 60_000);
// PUSH-4, PUSH-5: notifications go through the relay, as only the app's publisher can reach the store apps.
let notices: Notices | undefined;
if (config.pushRelayUrl) {
    const push = new Push(db, config.pushRelayUrl, fetch, config.relayKey);
    access.push = push;
    weather.afterRefresh = (now) => tellNewRisks(db, weather, push, now);
    // NOTE-1: what integrations do to people's matches.
    notices = new Notices(db, push);
    notices.start();
}
// FEED-1 to FEED-9: assignors' calendar links, read every 30 minutes; a match saved gets its forecast (WX-2).
const assignorCalendars = new AssignorCalendars(db, {
    authSecret: config.authSecret,
    allowPrivate: () => settings.webhookAllowPrivate(),
    onChange: (type) => (type === "match" || type === "venue") && weather.poke(),
});
assignorCalendars.start();
const app = createApp(db, auth, {
    access,
    push: !!config.pushRelayUrl,
    ...(notices ? { notices } : {}),
    assignorCalendars,
    webRoot: existsSync(webRoot) ? webRoot : undefined,
    weather,
    files,
    version: config.version,
    ...(process.env.TRUSTED_IP_HEADER ? { trustedIpHeader: process.env.TRUSTED_IP_HEADER } : {}),
    trustedProxies: trustedProxies(process.env.TRUSTED_PROXIES),
});
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`LawFive server ${config.version.version} (${config.version.commit}) listening on port ${info.port} (${config.publicUrl})`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        weather?.stop();
        notices?.stop();
        assignorCalendars.stop();
        plans.stop();
        clearInterval(forgetLocksTimer);
        server.close();
        void client.end().then(() => process.exit(0));
    });
}
