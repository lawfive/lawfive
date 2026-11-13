import { AppSignInCode } from "@lawfive/schema";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { AccessSettings } from "./access.ts";
import { type Auth, generateUserCode } from "./auth.ts";
import { type Db, tables } from "./db/index.ts";
import { deviceHeader, readDeviceHeader } from "./devices.ts";
import { plansOf } from "./plans.ts";

// Signing in on the phone without typing a password (APP-13): the web app, signed in, shows a code
// as a QR code and in letters. It lasts two minutes and works once; the phone looks it up to ask
// "Sign in as Sam?", then swaps it for a session of its own, which shows under Devices like any other.
//
//   POST   /v1/app-sign-in             a new code for this account
//   GET    /v1/app-sign-in/:id         whether a phone has used it yet
//   POST   /v1/app-sign-in/check       whose a code is (no sign-in)
//   POST   /v1/app-sign-in/redeem      swap a code for a session (no sign-in)

export const appSignInSeconds = 120;

const { appSignIn, device, user } = tables;

/** Upper case, letters and digits only: "wdjb-mjht" and "WDJB MJHT" both become WDJBMJHT. */
const normalise = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

type Row = typeof appSignIn.$inferSelect;

/** A code that can still be used, or which error to answer with. */
async function find(db: Db, text: string): Promise<{ row: Row } | { status: 404 | 410; error: string }> {
    const [row] = await db.select().from(appSignIn).where(eq(appSignIn.code, normalise(text)));
    if (!row) {
        return { status: 404, error: "That code doesn't match. Check it and try again." };
    }
    return row.usedAt || row.expiresAt <= new Date()
        ? { status: 410, error: "That code has expired. Show a new one in the web app." }
        : { row };
}

/** The two that work without signing in (app.ts mounts them before the sign-in check). */
export function appSignInPublicApi(db: Db, auth: Auth) {
    const api = new Hono();

    api.post("/app-sign-in/check", async (c) => {
        const body = AppSignInCode.safeParse(await c.req.json().catch(() => undefined));
        const found = body.success ? await find(db, body.data.code) : ({ status: 404, error: "That code doesn't match. Check it and try again." } as const);
        if ("error" in found) {
            return c.json({ error: found.error }, found.status);
        }
        const [owner] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, found.row.userId));
        return c.json({ name: owner.name, email: owner.email, expiresAt: found.row.expiresAt.toISOString() });
    });

    api.post("/app-sign-in/redeem", async (c) => {
        const body = AppSignInCode.safeParse(await c.req.json().catch(() => undefined));
        const found = body.success ? await find(db, body.data.code) : ({ status: 404, error: "That code doesn't match. Check it and try again." } as const);
        if ("error" in found) {
            return c.json({ error: found.error }, found.status);
        }
        const [owner] = await db.select().from(user).where(eq(user.id, found.row.userId));
        // Suspended after the code was made: the code stays unused, and can't be used.
        if (owner.status === "suspended") {
            return c.json({ error: "This account is suspended. Ask an admin of this server." }, 403);
        }
        const named = readDeviceHeader(c.req.header(deviceHeader));
        // PLAN-7: a phone is a device, within the plan's watches and phones.
        const full = named && await plansOf(db).refuse(owner.id, "devices");
        if (full) {
            return c.json(full, 403);
        }
        // Only one request can take it, even if two arrive together.
        const [taken] = await db.update(appSignIn)
            .set({ usedAt: new Date(), deviceName: named?.name ?? null })
            .where(and(eq(appSignIn.id, found.row.id), isNull(appSignIn.usedAt), gt(appSignIn.expiresAt, new Date())))
            .returning({ id: appSignIn.id });
        if (!taken) {
            return c.json({ error: "That code has expired. Show a new one in the web app." }, 410);
        }
        const context = await auth.$context;
        const session = await context.internalAdapter.createSession(owner.id);
        if (named) {
            await db.insert(device).values({
                sessionId: session.id, kind: named.kind, name: named.name, model: named.model ?? null,
                firmware: named.firmware ?? null, appVersion: named.app ?? null, lastSeenAt: new Date(),
            });
        }
        return c.json({ token: session.token, user: { id: owner.id, name: owner.name, email: owner.email, status: owner.status } });
    });

    return api;
}

export function appSignInApi(db: Db, access: AccessSettings) {
    const api = new Hono<{ Variables: { userId: string } }>();

    api.post("/app-sign-in", async (c) => {
        const now = new Date();
        // Nothing keeps a code once it's past use.
        await db.delete(appSignIn).where(lt(appSignIn.expiresAt, now));
        const row = { id: randomUUID(), code: generateUserCode(), userId: c.var.userId, createdAt: now, expiresAt: new Date(now.getTime() + appSignInSeconds * 1000) };
        await db.insert(appSignIn).values(row);
        const server = access.apiUrl ?? access.publicUrl;
        return c.json({
            id: row.id,
            code: row.code,
            // In a fragment, so the code never reaches a server's logs if a camera opens the page.
            link: `${access.publicUrl}/get-app#${row.code}`,
            appLink: `lawfive://sign-in?server=${encodeURIComponent(server)}&code=${row.code}`,
            server,
            expiresAt: row.expiresAt.toISOString(),
        }, 201);
    });

    api.get("/app-sign-in/:id", async (c) => {
        const id = c.req.param("id");
        const [row] = /^[0-9a-f-]{36}$/i.test(id)
            ? await db.select().from(appSignIn).where(and(eq(appSignIn.id, id), eq(appSignIn.userId, c.var.userId)))
            : [];
        if (!row) {
            return c.json({ error: "not found" }, 404);
        }
        const status = row.usedAt ? "used" : row.expiresAt <= new Date() ? "expired" : "waiting";
        return c.json({ status, ...(row.deviceName ? { deviceName: row.deviceName } : {}) });
    });

    return api;
}
