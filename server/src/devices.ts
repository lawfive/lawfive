import { deviceName, garminModelName } from "@lawfive/schema";
import { PushHandle, SignOutOthers } from "@lawfive/schema";
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { type Db, tables } from "./db/index.ts";

// Where the user is signed in: each session is a device (a browser, a linked watch, later the
// phone apps), listed on the Settings page with Unlink for each.
//
//   GET    /v1/devices        every live session, newest activity first
//   DELETE /v1/devices/:id    signs that device out (its next request gets 401)

type Variables = { userId: string; sessionId?: string };

/**
 * Apps name themselves with this header: "garmin", and from the watch app's later versions what it
 * runs on, "garmin; model=006-B3703-00; firmware=12.30", and then its own version, "; app=2026.10.30" (VER-3).
 */
export const deviceHeader = "x-lawfive-device";
const deviceNames: Record<string, string> = { garmin: "Garmin watch", android: "Android phone", ios: "iPhone", wearos: "Wear OS watch", applewatch: "Apple Watch" };

/** An app's device header read: its kind, the name to show ("Garmin Venu 2"), and the model, firmware and app version it gave. */
export function readDeviceHeader(header: string | undefined): { kind: string; name: string; model?: string; firmware?: string; app?: string } | undefined {
    const [first, ...rest] = (header ?? "").split(";").map((part) => part.trim());
    const kind = first.toLowerCase();
    if (!deviceNames[kind]) {
        return undefined;
    }
    const params = Object.fromEntries(rest.map((part) => part.split("=").map((s) => s.trim())).filter((kv) => kv.length === 2 && kv[1]));
    const model = params.model?.slice(0, 40);
    // The phone apps (APP-2, IOS-1) give their system's version as os; it's kept where a watch's firmware is.
    const firmware = (["android", "ios", "wearos", "applewatch"].includes(kind) ? params.os : params.firmware)?.slice(0, 20);
    const app = params.app?.slice(0, 30);
    // Watches as people know them: "Galaxy Watch4" for SM-R860, "Apple Watch Series 9" for Watch7,3 (STAT-15).
    const name = kind === "garmin" ? (garminModelName(model) ? `Garmin ${garminModelName(model)}` : undefined)
        : kind === "wearos" || kind === "applewatch" ? (model ? deviceName(`${kind}:${model}`) : undefined)
        : ["android", "ios"].includes(kind) ? model : undefined;
    return { kind, name: name ?? deviceNames[kind], ...(model ? { model } : {}), ...(firmware ? { firmware } : {}), ...(app ? { app } : {}) };
}

/**
 * Watches asking to link, by their code, so the Link page can say which watch it is before the
 * user approves it. Codes last 10 minutes; kept in memory, as a restart only loses the name.
 */
const linking = new Map<string, { name: string; expires: number }>();
const codeKey = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function rememberLinkingDevice(userCode: string, header: string | undefined) {
    const device = readDeviceHeader(header);
    const now = Date.now();
    for (const [code, entry] of linking) {
        if (entry.expires < now) {
            linking.delete(code);
        }
    }
    if (device) {
        linking.set(codeKey(userCode), { name: device.name, expires: now + 10 * 60 * 1000 });
    }
}

export function linkingDeviceName(userCode: string): string | undefined {
    const entry = linking.get(codeKey(userCode));
    return entry && entry.expires > Date.now() ? entry.name : undefined;
}

/** Notes which device a session belongs to and when it was last used (at most every five minutes). */
export function trackDevices(db: Db): MiddlewareHandler<{ Variables: Variables }> {
    const lastWrite = new Map<string, number>();
    return async (c, next) => {
        const device = readDeviceHeader(c.req.header(deviceHeader));
        const sessionId = c.var.sessionId;
        const now = Date.now();
        // API keys aren't devices; they show in their own list.
        if (sessionId && device && now - (lastWrite.get(sessionId) ?? 0) > 5 * 60 * 1000) {
            lastWrite.set(sessionId, now);
            const details = { name: device.name, model: device.model ?? null, firmware: device.firmware ?? null, appVersion: device.app ?? null };
            // The name, firmware and app version follow what the device says, so an update shows.
            await db.insert(tables.device)
                .values({ sessionId, kind: device.kind, ...details, lastSeenAt: new Date(now) })
                .onConflictDoUpdate({ target: tables.device.sessionId, set: { ...details, lastSeenAt: new Date(now) } });
        }
        await next();
    };
}

/** "Chrome on macOS" from a browser's user agent; good enough to recognise your own devices. */
export function describeUserAgent(ua: string | null): string {
    if (!ua) {
        return "Unknown device";
    }
    const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : undefined;
    const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : undefined;
    if (browser && os) {
        return `${browser} on ${os}`;
    }
    return browser ?? os ?? "Unknown device";
}

export function devicesApi(db: Db) {
    const api = new Hono<{ Variables: Variables }>();
    const { session, device } = tables;

    api.get("/devices", async (c) => {
        const rows = await db
            .select({ id: session.id, scope: session.scope, createdAt: session.createdAt, updatedAt: session.updatedAt, userAgent: session.userAgent, kind: device.kind, name: device.name, model: device.model, firmware: device.firmware, appVersion: device.appVersion, lastSeenAt: device.lastSeenAt })
            .from(session)
            .leftJoin(device, eq(device.sessionId, session.id))
            .where(and(eq(session.userId, c.var.userId), gt(session.expiresAt, new Date())))
            .orderBy(desc(session.updatedAt));
        const devices = rows.map((r) => {
            const lastActive = [r.lastSeenAt, r.updatedAt].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0];
            return {
                id: r.id,
                kind: r.kind ?? "browser",
                name: r.name ?? describeUserAgent(r.userAgent),
                ...(r.model ? { model: r.model } : {}),
                ...(r.firmware ? { firmware: r.firmware } : {}),
                ...(r.appVersion ? { appVersion: r.appVersion } : {}),
                linkedAt: r.createdAt.toISOString(),
                lastActiveAt: lastActive.toISOString(),
                current: r.id === c.var.sessionId,
                ...(r.scope === "watch" ? { watchOnly: true } : {}),
            };
        });
        devices.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
        return c.json({ devices });
    });

    // PUSH-4: with the session, so signing out takes it away too. The device's row may not be
    // written yet, as that happens at most every five minutes.
    api.put("/devices/current/push", async (c) => {
        const body = PushHandle.safeParse(await c.req.json().catch(() => undefined));
        const named = readDeviceHeader(c.req.header(deviceHeader));
        const sessionId = c.var.sessionId;
        if (!body.success || !named || !sessionId) {
            return c.json({ error: "send { handle }, with an X-LawFive-Device header" }, 400);
        }
        const { handle: pushHandle } = body.data;
        await db.insert(device)
            .values({ sessionId, kind: named.kind, name: named.name, model: named.model ?? null, firmware: named.firmware ?? null, appVersion: named.app ?? null, lastSeenAt: new Date(), pushHandle })
            .onConflictDoUpdate({ target: device.sessionId, set: { pushHandle } });
        return c.json({ ok: true as const });
    });

    // SEC-7: everywhere but here; "browsers" leaves watches and phones linked. They're the sessions
    // that have never named themselves as a device.
    api.post("/devices/sign-out-others", async (c) => {
        const body = SignOutOthers.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "send { scope: \"browsers\" } or { scope: \"all\" }" }, 400);
        }
        const others = and(eq(session.userId, c.var.userId), ne(session.id, c.var.sessionId ?? ""));
        const ids = body.data.scope === "all"
            ? await db.select({ id: session.id }).from(session).where(others)
            : await db.select({ id: session.id }).from(session).leftJoin(device, eq(device.sessionId, session.id)).where(and(others, isNull(device.sessionId)));
        if (ids.length) {
            await db.delete(session).where(inArray(session.id, ids.map((s) => s.id)));
        }
        return c.json({ signedOut: ids.length });
    });

    api.delete("/devices/:id", async (c) => {
        const removed = await db.delete(session)
            .where(and(eq(session.id, c.req.param("id")), eq(session.userId, c.var.userId)))
            .returning({ id: session.id });
        return removed.length ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
    });

    return api;
}
