import { eq, sql } from "drizzle-orm";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { NameChange, findEndpoint, scopesAllow } from "@lawfive/schema";
import { openApiDocument } from "@lawfive/schema/generate";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { type AccessSettings, accessApi, currentSetupCode, currentSignUp, emailConfirmApi, inviteLookupApi, serverIsEmpty, setupApi, setupPending } from "./access.ts";
import { apiKeysApi, checkKey, keyPrefix } from "./apiKeys.ts";
import { appSignInApi, appSignInPublicApi } from "./appSignIn.ts";
import { attachmentsApi } from "./attachments.ts";
import { backupApi } from "./backup.ts";
import type { Auth } from "./auth.ts";
import { calendarApi, calendarFeedApi } from "./calendar.ts";
import { type MapSettings, type ServerVersion, defaultMaps } from "./config.ts";
import { type Db, tables } from "./db/index.ts";
import { deviceHeader, devicesApi, linkingDeviceName, readDeviceHeader, rememberLinkingDevice, trackDevices } from "./devices.ts";
import { type WebhookOptions, webhooksApi } from "./webhooks.ts";
import { AssignorCalendars, assignorCalendarsApi } from "./feeds/calendars.ts";
import { geocodeApi } from "./geocode.ts";
import { importApi } from "./import.ts";
import { type Trusts, clientIp, clientIpHeader, rateLimit } from "./limits.ts";
import { lockoutsOf } from "./lockout.ts";
import { mergeApi } from "./merge.ts";
import { plansOf } from "./plans.ts";
import { recordsApi } from "./records.ts";
import { shareApi, sharedMatchApi } from "./share.ts";
import { quizApi } from "./quiz.ts";
import { statsApi } from "./stats.ts";
import { type Notices, asActor, noticesApi } from "./notices.ts";
import type { FileStore } from "./storage.ts";
import { tracksApi } from "./tracks.ts";
import { watchApi, watchCopiesApi } from "./watch.ts";
import { weatherApi } from "./weather/api.ts";
import type { Weather } from "./weather/service.ts";

// The HTTP app. The API is under /v1 so a later API version can sit beside it; everything else
// is the web UI (web/, built to web/dist), when the server is given its folder.

export interface AppOptions {
    /** The built web UI to serve, if any. */
    webRoot?: string;
    maps?: MapSettings;
    geocoderUrl?: string;
    /** Forecasts for matches; the caller starts its refreshing. */
    weather?: Weather;
    /** Notifications through the push relay (PUSH-4), unless switched off. */
    push?: boolean;
    /** What integrations did to people's matches, for their phones (NOTE-1); the caller starts its sending. */
    notices?: Notices;
    /** Sign-up, admins and email (USR-1 to USR-5); the same as the auth's. Open sign-up and no admins when left out. */
    access?: AccessSettings;
    /** Webhooks (HOOK-4): whether they may reach private addresses, and how often retries go out. */
    webhooks?: WebhookOptions;
    /** Where uploaded photos are kept (FILE-4); without one, there are no attachments. */
    files?: FileStore;
    /** This build's version (VER-1), for GET /v1/meta and the watch. */
    version?: ServerVersion;
    /** The header a proxy in front of this one sets to the visitor's address (TRUSTED_IP_HEADER, SEC-2). */
    trustedIpHeader?: string;
    /** The proxies whose word on the visitor's address is believed (TRUSTED_PROXIES, SEC-14); none by default. */
    trustedProxies?: { trusts: Trusts; entries: string[] };
    /** Reading assignors' calendar links (FEED-1); the caller starts its reading. Made here, with a secret of its own, when left out. */
    assignorCalendars?: AssignorCalendars;
}

/** SEC-3: the largest request but a restore, which streams to disk with its own limit. Uploads have smaller ones. */
const maxRequestBytes = 32 * 1024 * 1024;

/** SEC-13: what a watch's link may use besides /v1/watch/: signing out, and its own session. */
const watchAuthPaths = new Set(["/v1/auth/sign-out", "/v1/auth/get-session"]);
const watchOnlyMessage = "A watch's link only syncs matches; sign in on the website or the phone app for this.";

export function createApp(db: Db, auth: Auth, options: AppOptions = {}) {
    const app = new Hono();

    // SEC-1: what browsers may do with these pages. Map tiles, and their styles and fonts, come from
    // whichever provider an admin chooses (ADM-2); scripts come only from here. The referrer stays
    // the browser's default, as OpenStreetMap's tiles ask for one, and it's only ever this server's name.
    const https = (options.access?.publicUrl ?? "").startsWith("https:");
    const version = options.version?.version ?? "dev";
    app.use(async (c, next) => {
        await next();
        // APP-23: every answer says it's LawFive's, so the apps can tell it from a proxy's own error page.
        c.header("lawfive-version", version);
        c.header("x-content-type-options", "nosniff");
        c.header("x-frame-options", "DENY");
        c.header("referrer-policy", "strict-origin-when-cross-origin");
        c.header("permissions-policy", "geolocation=(self), camera=(self), microphone=()");
        if (https) {
            c.header("strict-transport-security", "max-age=15552000");
        }
        // Attachments set a stricter one of their own.
        if (!c.res.headers.has("content-security-policy")) {
            c.header("content-security-policy", [
                "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https: http:",
                "font-src 'self' data:", "connect-src 'self' https: http:", "worker-src 'self' blob:", "child-src blob:",
                "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
            ].join("; "));
        }
    });
    const sizeLimit = bodyLimit({ maxSize: maxRequestBytes, onError: (c) => c.json({ error: "That's too much to send at once." }, 413) });
    app.use("/v1/*", async (c, next) => (c.req.path === "/v1/restore" ? next() : sizeLimit(c, next)));

    // SEC-2: limits on what works without signing in, or tries a password.
    const ipOf = (c: Parameters<typeof clientIp>[0]) => clientIp(c, options.trustedIpHeader, options.trustedProxies?.trusts);
    const minute = 60_000;
    app.use("/v1/app-sign-in/check", rateLimit(20, minute, ipOf));
    app.use("/v1/app-sign-in/redeem", rateLimit(20, minute, ipOf));
    app.use("/v1/invite/*", rateLimit(30, minute, ipOf));
    app.use("/v1/setup/check", rateLimit(10, 15 * minute, ipOf));
    app.use("/v1/shared/*", rateLimit(120, minute, ipOf));
    app.use("/v1/calendar/*", rateLimit(60, minute, ipOf));
    app.use("/v1/openapi.json", rateLimit(60, minute, ipOf));
    app.use("/v1/account/email", rateLimit(10, 15 * minute, ipOf));
    app.use("/v1/account/email/confirm", rateLimit(20, 15 * minute, ipOf));
    app.use("/v1/account/delete", rateLimit(10, 15 * minute, ipOf));
    /** The request as Better Auth gets it, saying who's asking in the one way it believes. */
    const authHandler = (c: Parameters<typeof clientIp>[0]) => {
        const headers = new Headers(c.req.raw.headers);
        headers.set(clientIpHeader, ipOf(c));
        return auth.handler(new Request(c.req.raw, { headers }));
    };

    // API version and capabilities, so apps can adapt to older self-hosted servers; the map tiles
    // to use, so a self-hosted server can choose its own provider; and the services whose data is
    // shown, to credit them (the web UI's Data and licences page).
    const { weather } = options;
    const access: AccessSettings = options.access ?? { signUp: "open", adminEmails: [], publicUrl: "http://localhost:3000" };
    // SEC-14: for Settings → Server, so an admin can check the server sees visitors as themselves.
    access.network = (c) => ({
        yourAddress: ipOf(c),
        trustedProxies: options.trustedProxies?.entries ?? [],
        ...(options.trustedIpHeader ? { trustedIpHeader: options.trustedIpHeader } : {}),
    });
    // ADM-2: with the settings store, maps and address search follow what an admin sets, as it's set.
    const store = access.store;
    const maps = () => store?.maps() ?? options.maps ?? defaultMaps;
    const geocoderUrl = () => (store ? store.geocoderUrl() : options.geocoderUrl);
    const ownUrl = access.apiUrl ?? access.publicUrl;
    // PLAN-1 to PLAN-9: what each account may use.
    const plans = plansOf(db);
    const lockouts = lockoutsOf(db, access);
    const meta = () => {
        const geocoder = geocoderUrl();
        const weatherOn = weather?.enabled ?? false;
        return {
            product: "LawFive",
            apiVersion: 1,
            apiUrl: ownUrl,
            openApiUrl: `${ownUrl.replace(/\/+$/, "")}/v1/openapi.json`,
            publicUrl: access.publicUrl,
            ...(options.version ?? {}),
            capabilities: [
                "accounts", "records", "quiz", "changes", "tracks", "stats", "devices", "link", "watch", "people", "invites", "calendar", "import", "merging", "plans", "assignor-calendars",
                ...(options.push ? ["push"] : []), ...(options.notices ? ["notices"] : []), ...(options.files ? ["attachments"] : []), ...(access.mailer ? ["email"] : []), ...(geocoder ? ["geocode"] : []), ...(weatherOn ? ["weather"] : []),
            ],
            maps: maps(),
            ...(geocoder ? { geocoder: { url: geocoder } } : {}),
            ...(weatherOn && weather ? { weather: { source: weather.source } } : {}),
        };
    };

    // USR-8, ADM-5: a new server opens on setting it up.
    const firstRun = async () => {
        if (await serverIsEmpty(db)) {
            return { firstAccount: true as const, ...(await currentSetupCode(db, access) ? { setupCodeNeeded: true as const } : {}) };
        }
        return await setupPending(db) ? { setupPending: true as const } : {};
    };

    // ADM-7: for Docker's healthcheck. Only what nothing works without: the database. A weather, email
    // or relay outage isn't a reason to take the server out of service.
    app.get("/health", async (c) => {
        const ready = await Promise.race([
            db.execute(sql`select 1`).then(() => true, () => false),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000).unref()),
        ]);
        return ready ? c.text("ok") : c.text("database unavailable", 503);
    });
    // Who can sign up, email, maps, address search and weather can change in the web app (USR-7,
    // ADM-2), so it's all looked up each time.
    app.get("/v1/meta", async (c) => c.json({ ...meta(), signUp: await currentSignUp(db, access), ...await firstRun() }));
    // AGT-3: public like the docs, and made once, on first asking, as nothing in it changes while the server runs.
    let openApi: string | undefined;
    app.get("/v1/openapi.json", compress(), (c) => {
        openApi ??= JSON.stringify(openApiDocument({ url: ownUrl.replace(/\/+$/, ""), version: options.version?.version }));
        return c.body(openApi, 200, { "content-type": "application/json", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" });
    });
    // USR-7: a reset by email only while the server can send one (an admin can set email up or
    // take it away while it runs, ADM-1), as Better Auth would say with no email at all.
    app.post("/v1/auth/request-password-reset", async (c, next) => {
        if (!access.mailer) {
            return c.json({ code: "RESET_PASSWORD_DISABLED", message: "Reset password isn't enabled" }, 400);
        }
        await next();
    });
    // An account waiting for approval can't link a watch (USR-4), nor one over its plan's watches and phones (PLAN-7).
    app.post("/v1/auth/device/approve", async (c, next) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if ((session?.user as { status?: string } | undefined)?.status === "pending") {
            return c.json({ message: "Your account is waiting for approval.", code: "ACCOUNT_PENDING" }, 403);
        }
        const full = session && await plans.refuse(session.user.id, "devices");
        if (full) {
            return c.json({ message: full.error, code: "DEVICE_LIMIT" }, 403);
        }
        await next();
    });
    // PLAN-7: a phone signing in counts as a device, so a plan's limit can refuse it; the session
    // just made is taken away again. Browsers don't count.
    // SEC-12: a locked address is refused before its password is even checked, and a wrong one counts.
    app.post("/v1/auth/sign-in/email", async (c) => {
        const email = (await c.req.raw.clone().json().catch(() => undefined) as { email?: unknown } | undefined)?.email;
        const address = typeof email === "string" ? email : undefined;
        const locked = address && await lockouts.locked(address);
        if (locked) {
            const minutes = Math.ceil(locked / 60);
            return c.json({
                code: "ACCOUNT_LOCKED",
                message: `Too many wrong passwords for this account. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`,
            }, 429, { "retry-after": String(locked) });
        }
        const res = await authHandler(c);
        if (address && res.status === 401) {
            await lockouts.failed(address);
        } else if (address && res.ok) {
            await lockouts.clear(address);
        }
        if (!res.ok || !readDeviceHeader(c.req.header(deviceHeader))) {
            return res;
        }
        const body = await res.clone().json().catch(() => undefined) as { token?: string; user?: { id?: string } } | undefined;
        const full = body?.user?.id && await plans.refuse(body.user.id, "devices");
        if (full && body?.token) {
            await db.delete(tables.session).where(eq(tables.session.token, body.token));
            return c.json({ message: full.error, code: "DEVICE_LIMIT" }, 403);
        }
        return res;
    });
    // SEC-12: a new password, from an emailed link or an admin's, unlocks the account.
    app.post("/v1/auth/reset-password", async (c) => {
        const token = (await c.req.raw.clone().json().catch(() => undefined) as { token?: unknown } | undefined)?.token;
        const [owner] = typeof token === "string"
            ? await db.select({ email: tables.user.email }).from(tables.verification)
                .innerJoin(tables.user, eq(tables.user.id, tables.verification.value))
                .where(eq(tables.verification.identifier, `reset-password:${token}`))
            : [];
        const res = await authHandler(c);
        if (res.ok && owner) {
            await lockouts.clear(owner.email);
        }
        return res;
    });
    // Linking a watch: note which watch asked for a code, and say so when the Link page looks the code up.
    app.post("/v1/auth/device/code", async (c) => {
        const res = await authHandler(c);
        const body = res.ok ? await res.clone().json().catch(() => undefined) as { user_code?: string } | undefined : undefined;
        if (body?.user_code) {
            rememberLinkingDevice(body.user_code, c.req.header(deviceHeader));
        }
        return res;
    });
    // SEC-13: the session a watch's code becomes reaches only the watch's endpoints.
    app.post("/v1/auth/device/token", async (c) => {
        const res = await authHandler(c);
        const body = res.ok ? await res.clone().json().catch(() => undefined) as { access_token?: string } | undefined : undefined;
        if (body?.access_token) {
            await db.update(tables.session).set({ scope: "watch" }).where(eq(tables.session.token, body.access_token));
        }
        return res;
    });
    app.get("/v1/auth/device", async (c) => {
        const res = await authHandler(c);
        const name = linkingDeviceName(c.req.query("user_code") ?? "");
        if (!res.ok || !name) {
            return res;
        }
        const body = await res.json() as Record<string, unknown>;
        const headers = new Headers(res.headers);
        headers.delete("content-length");
        return new Response(JSON.stringify({ ...body, device_name: name }), { status: res.status, headers });
    });
    // USR-10: Better Auth's update-user changes the name and nothing else (not image, nor the role
    // and status it already refuses); the name's rule is access.ts's, as at sign-up.
    // SEC-13: of the account endpoints, a watch's link may only sign out or read its own session.
    const watchLinkAsking = async (c: Context) => {
        if (!c.req.header("authorization") || watchAuthPaths.has(c.req.path)) {
            return false;
        }
        const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
        return (session?.session as { scope?: string } | undefined)?.scope === "watch";
    };
    app.post("/v1/auth/update-user", async (c, next) => {
        if (await watchLinkAsking(c)) {
            return c.json({ code: "WATCH_ONLY", message: watchOnlyMessage }, 403);
        }
        const body = NameChange.safeParse(await c.req.raw.clone().json().catch(() => undefined));
        if (!body.success) {
            return c.json({ code: "INVALID_NAME", message: "Send { name }: 1 to 100 characters." }, 400);
        }
        await next();
    });
    app.on(["GET", "POST"], "/v1/auth/*", async (c) => {
        if (await watchLinkAsking(c)) {
            return c.json({ code: "WATCH_ONLY", message: watchOnlyMessage }, 403);
        }
        return authHandler(c);
    });
    // Without signing in: an invitation, for its page (USR-3), a phone's sign-in code (APP-13), and the calendar feed, whose address is its key (CAL-1).
    app.route("/v1", inviteLookupApi(db));
    app.route("/v1", emailConfirmApi(db, access));
    app.route("/v1", setupApi(db, access));
    app.route("/v1", appSignInPublicApi(db, auth));
    app.route("/v1", calendarFeedApi(db, access.publicUrl, weather));
    app.route("/v1", sharedMatchApi(db));

    // Signed in with a session (browsers, apps, linked watches), or an API key (KEY-1). A key
    // only reaches the endpoints whose description gives a scope it has (KEY-3); every other
    // endpoint, including any added later, is closed to keys.
    const api = new Hono<{ Variables: { userId: string; sessionId?: string; watchLink?: boolean; keyScopes?: string[] } }>();
    const ownOrigins = new Set([access.publicUrl, access.apiUrl].filter((u): u is string => !!u).map((u) => new URL(u).origin));
    api.use(async (c, next) => {
        const bearer = c.req.header("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
        if (bearer?.startsWith(keyPrefix)) {
            const found = await checkKey(db, bearer);
            if ("error" in found) {
                return c.json({ error: found.error }, 401);
            }
            const need = findEndpoint(c.req.method, c.req.path)?.keyScope;
            if (!need || !scopesAllow(found.key.scopes, need)) {
                return c.json({ error: need ? `this API key needs ${need}` : "API keys can't use this; sign in instead" }, 403);
            }
            // PLAN-8: all the account's keys together, a minute and a day.
            const over = await plans.apiCall(found.key.userId);
            if (over) {
                return c.json({ error: over.error }, 429, { "retry-after": String(over.retryAfter) });
            }
            c.set("userId", found.key.userId);
            c.set("keyScopes", found.key.scopes);
            // The saves it makes know it was this key, for notices (NOTE-1).
            await asActor({ keyId: found.key.id, keyName: found.key.name, notify: found.key.notify }, next);
            return;
        }
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) {
            return c.json({ error: "sign in first" }, 401);
        }
        // An account waiting for approval sees only itself (USR-4).
        if ((session.user as { status?: string }).status === "pending" && c.req.path !== "/v1/account") {
            return c.json({ error: "your account is waiting for approval" }, 403);
        }
        // SEC-9: a change made with the browser's cookie must come from this server's own website, not a
        // page elsewhere (a sibling subdomain, say) that the cookie would follow. Apps send a bearer
        // token instead, and tools no Origin at all.
        if (!c.req.header("authorization") && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
            const origin = c.req.header("origin");
            if (origin && !ownOrigins.has(origin)) {
                return c.json({ error: "this change has to come from this server's own website" }, 403);
            }
        }
        // SEC-13: a watch's link syncs matches and nothing else.
        if ((session.session as { scope?: string }).scope === "watch" && !c.req.path.startsWith("/v1/watch/")) {
            return c.json({ error: watchOnlyMessage }, 403);
        }
        c.set("userId", session.user.id);
        c.set("sessionId", session.session.id);
        c.set("watchLink", (session.session as { scope?: string }).scope === "watch");
        await next();
    });
    api.use(trackDevices(db));
    // A new or moved match, or a venue placed on the map, gets its forecast soon after (WX-2).
    const storageLimit = (userId: string) => plans.storageBytes(userId);
    const recordsChanged = (type: string) => (type === "match" || type === "venue") && weather?.poke();
    api.route("/", recordsApi(db, recordsChanged, storageLimit));
    api.route("/", importApi(db, recordsChanged, storageLimit));
    api.route("/", mergeApi(db, recordsChanged));
    api.route("/", tracksApi(db, storageLimit));
    api.route("/", webhooksApi(db, store ? { ...options.webhooks, allowPrivate: () => store.webhookAllowPrivate() } : options.webhooks));
    // FEED-1: a server that wasn't given one (the tests) still offers them; its links last while it runs.
    const assignorCalendars = options.assignorCalendars ?? new AssignorCalendars(db, {
        authSecret: randomBytes(32).toString("hex"), onChange: (type) => void recordsChanged(type),
        allowPrivate: () => {
            const allow = options.webhooks?.allowPrivate;
            return store ? store.webhookAllowPrivate() : typeof allow === "function" ? allow() : allow ?? false;
        },
    });
    api.route("/", assignorCalendarsApi(db, assignorCalendars));
    api.route("/", shareApi(db, access.publicUrl));
    api.route("/", backupApi(db, storageLimit));
    if (options.files) {
        api.route("/", attachmentsApi(db, options.files, storageLimit));
    }
    api.route("/", statsApi(db));
    api.route("/", noticesApi(options.notices));
    api.route("/", quizApi());
    api.route("/", devicesApi(db));
    api.route("/", appSignInApi(db, access));
    api.route("/", apiKeysApi(db));
    api.route("/", accessApi(db, access, auth, storageLimit));
    api.route("/", calendarApi(db, access.publicUrl));
    api.route("/", watchApi(db, weather, options.version?.version));
    api.route("/", watchCopiesApi(db));
    if (weather) {
        api.route("/", weatherApi(weather));
    }
    if (store || options.geocoderUrl) {
        api.route("/", geocodeApi(geocoderUrl, (userId) => plans.addressSearch(userId)));
    }
    app.route("/v1", api);

    if (options.webRoot) {
        // The web UI: its files, and index.html for any other page so the browser's router takes over.
        const root = relative(process.cwd(), options.webRoot);
        const index = readFileSync(`${options.webRoot}/index.html`, "utf8");
        app.use("/*", serveStatic({ root }));
        app.get("*", (c) => {
            if (c.req.path.startsWith("/v1/")) {
                return c.json({ error: "not found" }, 404);
            }
            // A shared match's page (DATA-7) is public but kept out of search engines.
            return c.html(index, 200, c.req.path.startsWith("/s/") ? { "x-robots-tag": "noindex, nofollow" } : {});
        });
    }

    app.onError((error, c) => {
        console.error(error);
        return c.json({ error: "something went wrong on the server" }, 500);
    });
    return app;
}
