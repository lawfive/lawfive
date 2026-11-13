import { type Account, AccountName, type AccountStatus, EmailChange, EmailConfirmation, type Invite, type InviteLookup, type NetworkView, NewInvite, type Person, PlanChange, PlanInput, PlanSettings, ServerSettings, SignUpMode as SignUpModes } from "@lawfive/schema";
import { APIError } from "better-auth/api";
import { and, desc, eq, gt, inArray, isNull, like, max, ne, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { z } from "zod";
import type { Auth } from "./auth.ts";
import type { SignUpMode } from "./config.ts";
import { deleteAccountFiles } from "./attachments.ts";
import { type Db, tables } from "./db/index.ts";
import { type Mailer, approvedMessage, confirmEmailMessage, emailChangedMessage, inviteMessage, sendQuietly, testMessage, waitingMessage } from "./mail.ts";
import type { ServerSettingsStore, SettingKey } from "./serverSettings.ts";
import { type StorageLimit, filesUsed } from "./usage.ts";
import type { Push } from "./push.ts";
import { Plans, plansOf } from "./plans.ts";
import { lockKey, lockoutsOf } from "./lockout.ts";

// Who can use the server (USR-1 to USR-7). Admins (role "admin", or an address in ADMIN_EMAILS)
// invite people and approve new accounts. Sign-up is open, needs an admin's approval, or is
// closed; an invitation link makes an account whatever the setting. An account waiting for
// approval can sign in but only reach GET /v1/account (app.ts keeps it out of everything else).
// A suspended account can't sign in at all. People change their own email or delete their
// account with their password; admins make reset links for those who forgot it.
//
//   GET    /v1/account                 the signed-in account: status, admin
//   PUT    /v1/account/email           change its email (a link to the new one first, when the server can email, USR-9)
//   DELETE /v1/account/email           cancel a change waiting for its link
//   POST   /v1/account/email/confirm   the link followed (no sign-in)
//   POST   /v1/account/delete          delete it, and everything in it
//   GET    /v1/people                  everyone (admins)
//   POST   /v1/people/:id/approve      approve an account waiting for it
//   POST   /v1/people/:id/decline      delete an account waiting for approval
//   PUT    /v1/people/:id/admin        make or stop being an admin
//   PUT    /v1/people/:id/suspended    suspend an account, or undo it
//   POST   /v1/people/:id/reset-link   a link for choosing a new password
//   DELETE /v1/people/:id              delete an account, and everything in it
//   GET    /v1/server-settings         the settings an admin can change (ADM-1), and where each comes from
//   PUT    /v1/server-settings         change them (not those the environment sets)
//   GET    /v1/server-settings/network  the address the server sees the admin at, and TRUSTED_PROXIES (SEC-14)
//   POST   /v1/server-settings/test-email   email the admin through the settings in use (ADM-4)
//   POST   /v1/server-settings/test-push    a notification to the admin's phones (PUSH-6)
//   GET    /v1/invites                 the invitations (admins)
//   POST   /v1/invites                 invite someone, optionally by email
//   DELETE /v1/invites/:id             cancel an unused invitation
//   GET    /v1/invite/:token           look an invitation up (no sign-in), for the invitation page
//   GET    /v1/account/plan            the account's plan, when it ends, and what it's using (PLAN-6)
//   PUT    /v1/people/:id/plan         put an account in a plan, until a day (PLAN-3, PLAN-5)
//   GET    /v1/people/:id/plan-history its plans so far
//   GET    /v1/plans                   the plans (PLAN-1), POST to make one
//   PUT    /v1/plans/:code             change one; DELETE one nothing refers to
//   PUT    /v1/plan-settings           the default plan and the sign-up trial

export interface AccessSettings {
    /** Notifications through the push relay (PUSH-4), for an admin's test (PUSH-6). */
    push?: Push;
    signUp: SignUpMode;
    /** SIGN_UP is set in the environment, which then fixes it (ADM-1); otherwise signUp is the default. */
    signUpFixed?: boolean;
    /** Lower case. */
    adminEmails: string[];
    publicUrl: string;
    /** The address apps use for the API, when it isn't publicUrl (API_URL, APP-13). */
    apiUrl?: string;
    /** As it is now: main.ts replaces it when an admin changes the email settings. */
    /** SEC-14: how the server sees the admin asking, for Settings → Server (set by app.ts). */
    network?: (c: Context) => z.infer<typeof NetworkView>;
    mailer?: Mailer;
    /** ADM-5: asked for before a new server's first account; main.ts makes one while the server is empty. */
    setupCode?: string;
    /** ADM-5: makes, logs and keeps a new code, for a server that's become empty since it started (main.ts). */
    makeSetupCode?: () => string;
    /** The settings admins change in the web app (ADM-1); without it, only sign-up is changeable. */
    store?: ServerSettingsStore;
}

/** How long an invitation works. */
export const inviteDays = 14;
/** How long a reset link an admin makes works; an emailed one works for an hour (auth.ts). */
export const resetLinkHours = 24;

type UserRow = typeof tables.user.$inferSelect;
type InviteRow = typeof tables.invite.$inferSelect;

export function isAdmin(user: Pick<UserRow, "email" | "role">, settings: Pick<AccessSettings, "adminEmails">): boolean {
    return user.role === "admin" || settings.adminEmails.includes(user.email.toLowerCase());
}

const inviteLink = (settings: AccessSettings, token: string) => `${settings.publicUrl}/invite/${token}`;
/** The web app's page for choosing a new password, for an emailed link (auth.ts) or an admin's. */
export const resetLink = (settings: Pick<AccessSettings, "publicUrl">, token: string) => `${settings.publicUrl}/reset-password/${token}`;

/** Who can sign up now: SIGN_UP when the environment sets it (ADM-1), else what an admin chose (USR-7), else open. */
const setupPendingKey = "setupPending";
const setupCodeLetters = "BCDFGHJKLMNPQRSTVWXZ23456789";

/** ADM-5: a code for a new server's logs, 12 characters without look-alikes, as XXXX-XXXX-XXXX. */
export function newSetupCode(): string {
    const letters = Array.from({ length: 12 }, () => setupCodeLetters[randomInt(setupCodeLetters.length)]);
    return [letters.slice(0, 4), letters.slice(4, 8), letters.slice(8)].map((part) => part.join("")).join("-");
}

const plainCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

function setupCodeMatches(code: string, typed: unknown): boolean {
    if (typeof typed !== "string") {
        return false;
    }
    const a = Buffer.from(plainCode(code));
    const b = Buffer.from(plainCode(typed));
    return a.length === b.length && timingSafeEqual(a, b);
}

/** ADM-5: the first account hasn't finished or skipped setting the server up. */
export async function setupPending(db: Db): Promise<boolean> {
    const [row] = await db.select({ key: tables.serverSetting.key }).from(tables.serverSetting).where(eq(tables.serverSetting.key, setupPendingKey));
    return !!row;
}

/**
 * ADM-5, SEC-8: the code an empty server's first account needs, or undefined when it has accounts (or,
 * in tests, makes no codes). A server emptied since it started gets a new one, so an account deleted
 * down to none doesn't leave the server for whoever comes next.
 */
export async function currentSetupCode(db: Db, settings: Pick<AccessSettings, "setupCode" | "makeSetupCode">): Promise<string | undefined> {
    if (!await serverIsEmpty(db)) {
        return undefined;
    }
    if (!settings.setupCode && settings.makeSetupCode) {
        settings.setupCode = settings.makeSetupCode();
    }
    return settings.setupCode;
}

/** ADM-5, without signing in: is this the code, so the wizard can say before asking for the rest. */
export function setupApi(db: Db, settings: Pick<AccessSettings, "setupCode" | "makeSetupCode">) {
    const api = new Hono();
    api.post("/setup/check", async (c) => {
        const code = await currentSetupCode(db, settings);
        if (!code) {
            return c.json({ error: "This server is already set up." }, 404);
        }
        const body = await c.req.json().catch(() => undefined) as { code?: unknown } | undefined;
        if (!setupCodeMatches(code, body?.code)) {
            return c.json({ error: "That setup code isn't right. It's in the server's logs." }, 400);
        }
        return c.json({ ok: true });
    });
    return api;
}

/** USR-8: nobody has an account on this server yet. */
export async function serverIsEmpty(db: Db): Promise<boolean> {
    const [row] = await db.select({ id: tables.user.id }).from(tables.user).limit(1);
    return !row;
}

export async function currentSignUp(db: Db, settings: Pick<AccessSettings, "signUp" | "signUpFixed">): Promise<SignUpMode> {
    if (settings.signUpFixed) {
        return settings.signUp;
    }
    const [row] = await db.select().from(tables.serverSetting).where(eq(tables.serverSetting.key, "signUp"));
    const chosen = SignUpModes.safeParse(row?.value);
    return chosen.success ? chosen.data : settings.signUp;
}

/** An invitation that can still be used, or why not. */
async function findInvite(db: Db, token: string, now = new Date()): Promise<{ invite: InviteRow } | { error: "missing" | "used" | "expired" }> {
    const [row] = token.length > 10 && token.length < 100 ? await db.select().from(tables.invite).where(eq(tables.invite.token, token)) : [];
    if (!row) {
        return { error: "missing" };
    }
    if (row.usedAt) {
        return { error: "used" };
    }
    return row.expiresAt <= now ? { error: "expired" } : { invite: row };
}

/** The admins' addresses, to tell them someone is waiting. */
async function adminAddresses(db: Db, settings: AccessSettings): Promise<string[]> {
    const rows = await db.select({ email: tables.user.email, role: tables.user.role }).from(tables.user).where(eq(tables.user.status, "active"));
    return rows.filter((r) => isAdmin(r, settings)).map((r) => r.email);
}

/** USR-10: an account's name, trimmed, or a refusal Better Auth passes on. */
function checkedName(name: unknown): string {
    const checked = AccountName.safeParse(name);
    if (!checked.success) {
        throw new APIError("BAD_REQUEST", { message: "A name needs 1 to 100 characters.", code: "INVALID_NAME" });
    }
    return checked.data;
}

/**
 * Better Auth's database hooks (auth.ts): whether a new account may be made, and whether it
 * starts active or waiting for approval (the invitation's token comes in the sign-up body); and
 * that a suspended account can't sign in.
 */
export function accountHooks(db: Db, settings: AccessSettings) {
    const tokenOf = (ctx: { body?: unknown } | null | undefined) => {
        const token = (ctx?.body as { invite?: unknown } | undefined)?.invite;
        return typeof token === "string" && token ? token : undefined;
    };
    return {
        user: {
            create: {
                before: async (made: { email: string } & Record<string, unknown>, ctx?: { body?: unknown } | null) => {
                    // USR-10: the same name rule as changing it later.
                    const user = { ...made, name: checkedName(made.name) };
                    const email = user.email.toLowerCase();
                    const token = tokenOf(ctx);
                    if (token) {
                        const found = await findInvite(db, token);
                        if ("error" in found) {
                            throw new APIError("BAD_REQUEST", {
                                message: found.error === "missing" ? "This invitation link isn't valid. Ask for a new one." : `This invitation has ${found.error === "used" ? "already been used" : "expired"}. Ask for a new one.`,
                                code: "INVITE_INVALID",
                            });
                        }
                        if (found.invite.email && found.invite.email !== email) {
                            throw new APIError("BAD_REQUEST", { message: `This invitation is for ${found.invite.email}.`, code: "INVITE_EMAIL_MISMATCH" });
                        }
                        // SEC-8: claimed in one step, so two sign-ups at once can't both use it.
                        const [claimed] = await db.update(tables.invite).set({ usedAt: new Date() })
                            .where(and(eq(tables.invite.token, token), isNull(tables.invite.usedAt))).returning({ id: tables.invite.id });
                        if (!claimed) {
                            throw new APIError("BAD_REQUEST", { message: "This invitation has already been used. Ask for a new one.", code: "INVITE_INVALID" });
                        }
                        return { data: { ...user, status: "active" } };
                    }
                    // USR-8: a new server's first account can always be made, and runs the server. ADM-5,
                    // SEC-8: but only by whoever can read the server's logs, ADMIN_EMAILS or not, as
                    // typing an address proves nothing about who's typing it.
                    if (await serverIsEmpty(db)) {
                        const code = await currentSetupCode(db, settings);
                        if (code && !setupCodeMatches(code, (ctx?.body as { setupCode?: unknown } | undefined)?.setupCode)) {
                            throw new APIError("BAD_REQUEST", { message: "That setup code isn't right. It's in the server's logs.", code: "SETUP_CODE" });
                        }
                        return { data: { ...user, status: "active", role: "admin" } };
                    }
                    const mode = await currentSignUp(db, settings);
                    // SEC-8: an address ADMIN_EMAILS lists makes an admin, so an account for it without an
                    // invitation waits for an admin to say it's theirs, whatever SIGN_UP says.
                    if (settings.adminEmails.includes(email)) {
                        if (mode === "closed") {
                            throw new APIError("BAD_REQUEST", { message: "New accounts on this server are by invitation only.", code: "SIGN_UP_CLOSED" });
                        }
                        return { data: { ...user, status: "pending" } };
                    }
                    if (mode === "open") {
                        return { data: { ...user, status: "active" } };
                    }
                    if (mode === "approval") {
                        return { data: { ...user, status: "pending" } };
                    }
                    throw new APIError("BAD_REQUEST", { message: "New accounts on this server are by invitation only.", code: "SIGN_UP_CLOSED" });
                },
                after: async (user: { id: string; name: string; email: string } & Record<string, unknown>, ctx?: { body?: unknown } | null) => {
                    // ADM-5: the first account goes on to set the server up.
                    const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(tables.user);
                    if (count === 1) {
                        await db.insert(tables.serverSetting).values({ key: setupPendingKey, value: true }).onConflictDoNothing();
                    }
                    const token = tokenOf(ctx);
                    // The invitation was claimed before the account was made; now it says by whom.
                    const [used] = token
                        ? await db.update(tables.invite).set({ usedById: user.id })
                            .where(and(eq(tables.invite.token, token), isNull(tables.invite.usedById))).returning()
                        : [];
                    // PLAN-5: the invitation's plan, else the sign-up trial, else simply the default.
                    const plans = plansOf(db);
                    const invited = used?.planId ? (await plans.all()).find((p) => p.id === used.planId) : undefined;
                    const trial = invited ? undefined : await plans.signUpTrial();
                    const joins = invited ?? trial?.plan;
                    const days = invited ? used?.planDays ?? undefined : trial?.days;
                    if (joins) {
                        await plans.set(user.id, joins, { ...(days ? { endsOn: await plans.dayFromNow(user.id, days) } : {}), reason: invited ? "invite" : "sign-up" });
                    }
                    if (user.status === "pending") {
                        for (const to of await adminAddresses(db, settings)) {
                            sendQuietly(settings.mailer, waitingMessage(to, user, `${settings.publicUrl}/people`));
                        }
                    }
                },
            },
            // USR-10: a name changed (Better Auth's update-user, which app.ts opens to the name only).
            update: {
                before: async (data: Record<string, unknown>) => (data.name === undefined ? undefined : { data: { ...data, name: checkedName(data.name) } }),
            },
        },
        session: {
            create: {
                before: async (session: { userId: string }) => {
                    const [row] = await db.select({ status: tables.user.status }).from(tables.user).where(eq(tables.user.id, session.userId));
                    if (row?.status === "suspended") {
                        throw new APIError("FORBIDDEN", { message: "This account is suspended. Ask an admin of this server.", code: "ACCOUNT_SUSPENDED" });
                    }
                },
            },
        },
    };
}

/** GET /v1/invite/:token, which works without signing in (app.ts mounts it before the sign-in check). */
export function inviteLookupApi(db: Db) {
    const api = new Hono();
    api.get("/invite/:token", async (c) => {
        const found = await findInvite(db, c.req.param("token"));
        if ("error" in found) {
            return found.error === "missing"
                ? c.json({ error: "This invitation link isn't valid: it may be mistyped, or it was canceled." }, 404)
                : c.json({ error: found.error === "used" ? "This invitation has already been used." : "This invitation has expired." }, 410);
        }
        const { invite } = found;
        const [by] = await db.select({ name: tables.user.name }).from(tables.user).where(eq(tables.user.id, invite.createdById));
        const lookup: z.infer<typeof InviteLookup> = {
            ...(invite.email ? { email: invite.email } : {}),
            ...(invite.name ? { name: invite.name } : {}),
            invitedBy: by?.name ?? "An admin",
            expiresAt: invite.expiresAt.toISOString(),
        };
        return c.json(lookup);
    });
    return api;
}

const statusOf = (row: UserRow): z.infer<typeof AccountStatus> => (row.status === "pending" || row.status === "suspended" ? row.status : "active");

/** USR-9: how long the link to a new address works. */
export const emailChangeHours = 24;
const emailChangePrefix = "change-email:";
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** USR-9: an email change waiting for its link, kept in Better Auth's verification table by the token's hash. */
interface PendingEmail { userId: string; from: string; email: string }

/** The account's change of email waiting for its link, if one is and it still works. */
async function pendingEmailOf(db: Db, userId: string, now = new Date()): Promise<{ email: string; until: Date } | undefined> {
    const { verification } = tables;
    const [row] = await db.select().from(verification)
        .where(and(like(verification.identifier, `${emailChangePrefix}%`), sql`(${verification.value})::jsonb->>'userId' = ${userId}`, gt(verification.expiresAt, now)))
        .orderBy(desc(verification.expiresAt)).limit(1);
    return row ? { email: (JSON.parse(row.value) as PendingEmail).email, until: row.expiresAt } : undefined;
}

async function cancelPendingEmail(db: Db, userId: string) {
    const { verification } = tables;
    await db.delete(verification).where(and(like(verification.identifier, `${emailChangePrefix}%`), sql`(${verification.value})::jsonb->>'userId' = ${userId}`));
}

/** The web app's page for the link to a new address. */
const confirmEmailLink = (settings: Pick<AccessSettings, "publicUrl">, token: string) => `${settings.publicUrl}/confirm-email/${token}`;

/** Why an address can't become an account's, or undefined when it can (USR-7). */
async function emailRefusal(db: Db, settings: Pick<AccessSettings, "adminEmails">, row: UserRow, email: string): Promise<string | undefined> {
    if (settings.adminEmails.includes(row.email.toLowerCase())) {
        return "the server's ADMIN_EMAILS setting has your address, so it can't be changed here";
    }
    // An address in ADMIN_EMAILS would make the account an admin.
    if (settings.adminEmails.includes(email)) {
        return "that address is reserved by the server's settings";
    }
    if (email !== row.email && (await db.select({ id: tables.user.id }).from(tables.user).where(eq(tables.user.email, email))).length) {
        return `${email} already has an account`;
    }
    return undefined;
}

/**
 * POST /v1/account/email/confirm, without signing in (app.ts mounts it before the sign-in check): the
 * link emailed to a new address followed (USR-9), once. It changes the address only; nobody is signed in.
 */
export function emailConfirmApi(db: Db, settings: AccessSettings) {
    const api = new Hono();
    api.post("/account/email/confirm", async (c) => {
        const body = EmailConfirmation.safeParse(await c.req.json().catch(() => undefined));
        const gone = () => c.json({ error: "This link doesn't work any more: it was used, canceled or replaced by a newer one, or it has expired. Change your email again in Settings." }, 400);
        if (!body.success) {
            return gone();
        }
        const { verification, user } = tables;
        // Taken in one step, so it works once even when followed twice at once.
        const [taken] = await db.delete(verification).where(eq(verification.identifier, `${emailChangePrefix}${tokenHash(body.data.token)}`)).returning();
        if (!taken || taken.expiresAt <= new Date()) {
            return gone();
        }
        const pending = JSON.parse(taken.value) as PendingEmail;
        const [row] = await db.select().from(user).where(eq(user.id, pending.userId));
        // The account changed its address another way meanwhile, or is gone.
        if (!row || row.email !== pending.from) {
            return gone();
        }
        const refused = await emailRefusal(db, settings, row, pending.email);
        if (refused) {
            return c.json({ error: refused }, 409);
        }
        await db.update(user).set({ email: pending.email, emailVerified: true, updatedAt: new Date() }).where(eq(user.id, row.id));
        await cancelPendingEmail(db, row.id);
        sendQuietly(settings.mailer, emailChangedMessage(row.email, row.name, pending.email, `${settings.publicUrl}/settings`));
        return c.json({ email: pending.email });
    });
    return api;
}

export function accessApi(db: Db, settings: AccessSettings, auth: Auth, storageLimit?: StorageLimit) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const { user, invite, session } = tables;
    const lockouts = lockoutsOf(db, settings);

    const me = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];
    const toAccount = async (row: UserRow): Promise<z.infer<typeof Account>> => {
        const pending = await pendingEmailOf(db, row.id);
        return {
            id: row.id, name: row.name, email: row.email, status: statusOf(row), admin: isAdmin(row, settings),
            ...(pending ? { pendingEmail: pending.email, pendingEmailUntil: pending.until.toISOString() } : {}),
        };
    };
    const fromSetting = (row: UserRow) => settings.adminEmails.includes(row.email.toLowerCase());

    /** Whether a password is the account's, checked as signing in checks it. */
    async function passwordMatches(userId: string, password: string): Promise<boolean> {
        const context = await auth.$context;
        const credential = (await context.internalAdapter.findAccounts(userId)).find((a) => a.providerId === "credential");
        return !!credential?.password && await context.password.verify({ hash: credential.password, password });
    }

    api.get("/account", async (c) => c.json(await toAccount(await me(c.var.userId))));

    api.get("/account/plan", async (c) => c.json(await plans.accountView(c.var.userId)));

    api.get("/account/storage", async (c) => {
        const limitBytes = await storageLimit?.(c.var.userId);
        return c.json({ usedBytes: await filesUsed(db, c.var.userId), ...(limitBytes ? { limitBytes } : {}) });
    });

    api.put("/account/email", async (c) => {
        const body = EmailChange.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid email", issues: body.error.issues }, 400);
        }
        const row = await me(c.var.userId);
        const email = body.data.email.toLowerCase();
        if (!(await passwordMatches(row.id, body.data.password))) {
            return c.json({ error: "that password isn't right" }, 400);
        }
        const refused = await emailRefusal(db, settings, row, email);
        if (refused) {
            return c.json({ error: refused }, 409);
        }
        // Asking for the address it has drops a change waiting for its link.
        if (email === row.email) {
            await cancelPendingEmail(db, row.id);
            return c.json(await toAccount(row));
        }
        // USR-9: with email, the new address proves it's theirs first; one change waits at a time.
        if (settings.mailer) {
            await cancelPendingEmail(db, row.id);
            const token = randomBytes(24).toString("base64url");
            const now = new Date();
            const pending: PendingEmail = { userId: row.id, from: row.email, email };
            await db.insert(tables.verification).values({
                id: randomUUID(), identifier: `${emailChangePrefix}${tokenHash(token)}`, value: JSON.stringify(pending),
                expiresAt: new Date(now.getTime() + emailChangeHours * 3_600_000), createdAt: now, updatedAt: now,
            });
            sendQuietly(settings.mailer, confirmEmailMessage(email, row.name, confirmEmailLink(settings, token)));
            return c.json(await toAccount(row), 202);
        }
        // Without email, as before USR-9: the password is the only proof.
        const [updated] = await db.update(user).set({ email, updatedAt: new Date() }).where(eq(user.id, row.id)).returning();
        return c.json(await toAccount(updated));
    });

    api.delete("/account/email", async (c) => {
        await cancelPendingEmail(db, c.var.userId);
        return c.json(await toAccount(await me(c.var.userId)));
    });

    api.post("/account/delete", async (c) => {
        const body = await c.req.json().catch(() => undefined) as { password?: unknown } | undefined;
        const row = await me(c.var.userId);
        if (typeof body?.password !== "string" || !(await passwordMatches(row.id, body.password))) {
            return c.json({ error: "that password isn't right" }, 400);
        }
        // The server keeps a way in for an admin: another admin, or an address in ADMIN_EMAILS that can sign up.
        if (isAdmin(row, settings)) {
            const others = await db.select().from(user).where(ne(user.id, row.id));
            const anotherAdmin = others.some((o) => o.status === "active" && isAdmin(o, settings))
                || settings.adminEmails.some((e) => e !== row.email.toLowerCase() && !others.some((o) => o.email.toLowerCase() === e));
            if (others.length && !anotherAdmin) {
                return c.json({ error: "you're this server's only admin: make someone else an admin first" }, 409);
            }
        }
        await deleteAccountFiles(db, row.id);
        await db.delete(user).where(eq(user.id, row.id));
        // SEC-12: and its address's wrong passwords, which aren't tied to the account by id.
        await lockouts.clear(row.email);
        return c.json({ ok: true });
    });

    // Everything below is for admins. The check is on each route: middleware on a sub-app
    // mounted at "/" would run for every route registered after it.
    const onlyAdmins = createMiddleware<{ Variables: { userId: string } }>(async (c, next) => {
        const row = await me(c.var.userId);
        if (!row || row.status !== "active" || !isAdmin(row, settings)) {
            return c.json({ error: "only admins can do this" }, 403);
        }
        await next();
    });

    /** People as admins see them; invitedBy and lastActiveAt looked up for the rows given. */
    const plans = plansOf(db);
    const people = async (rows: UserRow[]): Promise<z.infer<typeof Person>[]> => {
        const ids = rows.map((r) => r.id);
        const planOf = await plans.ofMany(ids);
        const locks = await lockouts.lockedUntil(rows.map((r) => r.email));
        const active = ids.length
            ? await db.select({ userId: session.userId, at: max(session.updatedAt) }).from(session).where(inArray(session.userId, ids)).groupBy(session.userId)
            : [];
        const lastActive = new Map(active.map((a) => [a.userId, a.at]));
        const invites = ids.length
            ? await db.select({ usedById: invite.usedById, by: user.name }).from(invite).innerJoin(user, eq(user.id, invite.createdById)).where(inArray(invite.usedById, ids))
            : [];
        const invitedBy = new Map(invites.map((i) => [i.usedById, i.by]));
        return rows.map((r) => {
            const at = lastActive.get(r.id);
            const by = invitedBy.get(r.id);
            const lockedUntil = locks.get(lockKey(r.email));
            return {
                id: r.id,
                name: r.name,
                email: r.email,
                status: statusOf(r),
                admin: isAdmin(r, settings),
                adminFromSetting: fromSetting(r),
                joinedAt: r.createdAt.toISOString(),
                ...(at ? { lastActiveAt: at.toISOString() } : {}),
                ...(by ? { invitedBy: by } : {}),
                plan: Plans.personView(planOf.get(r.id)!),
                ...(lockedUntil ? { lockedUntil: lockedUntil.toISOString() } : {}),
            };
        });
    };

    api.get("/people", onlyAdmins, async (c) => {
        const rows = await db.select().from(user).orderBy(sql`${user.status} = 'pending' desc`, sql`lower(${user.name})`);
        return c.json({ people: await people(rows) });
    });

    api.post("/people/:id/approve", onlyAdmins, async (c) => {
        const before = await me(c.req.param("id"));
        if (!before) {
            return c.json({ error: "no such account" }, 404);
        }
        if (before.status !== "pending") {
            return c.json((await people([before]))[0]);
        }
        const [row] = await db.update(user).set({ status: "active", updatedAt: new Date() }).where(eq(user.id, before.id)).returning();
        sendQuietly(settings.mailer, approvedMessage(row.email, row.name, settings.publicUrl));
        return c.json((await people([row]))[0]);
    });

    api.post("/people/:id/decline", onlyAdmins, async (c) => {
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        if (row.status !== "pending") {
            return c.json({ error: "only accounts waiting for approval can be declined" }, 409);
        }
        await db.delete(user).where(and(eq(user.id, row.id), eq(user.status, "pending")));
        await lockouts.clear(row.email);
        return c.json({ ok: true });
    });

    api.put("/people/:id/admin", onlyAdmins, async (c) => {
        const body = await c.req.json().catch(() => undefined) as { admin?: unknown } | undefined;
        if (typeof body?.admin !== "boolean") {
            return c.json({ error: "send { admin: true } or { admin: false }" }, 400);
        }
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        if (row.id === c.var.userId) {
            return c.json({ error: "you can't change your own admin access; ask another admin" }, 409);
        }
        if (row.status === "pending") {
            return c.json({ error: "approve the account first" }, 409);
        }
        if (!body.admin && settings.adminEmails.includes(row.email.toLowerCase())) {
            return c.json({ error: "the server's ADMIN_EMAILS setting makes this account an admin" }, 409);
        }
        const [updated] = await db.update(user).set({ role: body.admin ? "admin" : "user", updatedAt: new Date() }).where(eq(user.id, row.id)).returning();
        return c.json((await people([updated]))[0]);
    });

    api.put("/people/:id/suspended", onlyAdmins, async (c) => {
        const body = await c.req.json().catch(() => undefined) as { suspended?: unknown } | undefined;
        if (typeof body?.suspended !== "boolean") {
            return c.json({ error: "send { suspended: true } or { suspended: false }" }, 400);
        }
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        if (row.id === c.var.userId) {
            return c.json({ error: "you can't suspend your own account" }, 409);
        }
        if (row.status === "pending") {
            return c.json({ error: "decline it instead: it's waiting for approval" }, 409);
        }
        if (fromSetting(row)) {
            return c.json({ error: "the server's ADMIN_EMAILS setting makes this account an admin" }, 409);
        }
        const [updated] = await db.update(user).set({ status: body.suspended ? "suspended" : "active", updatedAt: new Date() }).where(eq(user.id, row.id)).returning();
        if (body.suspended) {
            await db.delete(session).where(eq(session.userId, row.id));
        }
        return c.json((await people([updated]))[0]);
    });

    // SEC-12: signing in again straight away, after too many wrong passwords.
    api.post("/people/:id/unlock", onlyAdmins, async (c) => {
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        await lockouts.clear(row.email);
        return c.json((await people([row]))[0]);
    });

    api.post("/people/:id/reset-link", onlyAdmins, async (c) => {
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        if (row.id === c.var.userId) {
            return c.json({ error: "change your own password in Settings" }, 409);
        }
        if (row.status === "pending") {
            return c.json({ error: "approve the account first" }, 409);
        }
        // The same kind of token as an emailed link, so the same page and endpoint take it.
        const token = randomBytes(24).toString("base64url");
        const expiresAt = new Date(Date.now() + resetLinkHours * 3_600_000);
        await (await auth.$context).internalAdapter.createVerificationValue({ identifier: `reset-password:${token}`, value: row.id, expiresAt });
        return c.json({ link: resetLink(settings, token), expiresAt: expiresAt.toISOString() }, 201);
    });

    api.put("/people/:id/plan", onlyAdmins, async (c) => {
        const body = PlanChange.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid plan", issues: body.error.issues }, 400);
        }
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        const to = await plans.byCode(body.data.plan);
        const then = body.data.then ? await plans.byCode(body.data.then) : undefined;
        if (!to || (body.data.then && !then)) {
            return c.json({ error: `There's no plan ${!to ? body.data.plan : body.data.then}.` }, 400);
        }
        if (body.data.endsOn && body.data.endsOn < await plans.dayFromNow(row.id, 0)) {
            return c.json({ error: "That day has passed." }, 400);
        }
        const by = await me(c.var.userId);
        await plans.set(row.id, to, { ...(body.data.endsOn ? { endsOn: body.data.endsOn } : {}), ...(then ? { then } : {}), reason: "admin", by: by.name });
        return c.json((await people([row]))[0]);
    });

    api.get("/people/:id/plan-history", onlyAdmins, async (c) => {
        const row = await me(c.req.param("id"));
        return row ? c.json({ changes: await plans.history(row.id) }) : c.json({ error: "no such account" }, 404);
    });

    // PLAN-1: the plans themselves.
    const planIn = async (c: { req: { json: () => Promise<unknown> } }) => PlanInput.safeParse(await c.req.json().catch(() => undefined));
    const planOut = async (code: string) => (await plans.view()).plans.find((p) => p.code === code)!;
    const codeTaken = (error: unknown) => String((error as { cause?: { constraint_name?: string } })?.cause?.constraint_name ?? (error as Error)?.message ?? "").includes("plan_code");

    api.get("/plans", onlyAdmins, async (c) => c.json(await plans.view()));

    api.post("/plans", onlyAdmins, async (c) => {
        const body = await planIn(c);
        if (!body.success) {
            return c.json({ error: "invalid plan", issues: body.error.issues }, 400);
        }
        if (await plans.byCode(body.data.code)) {
            return c.json({ error: `Another plan's code is ${body.data.code}.` }, 409);
        }
        try {
            await db.insert(tables.plan).values({ id: randomUUID(), ...body.data, isDefault: false });
        } catch (error) {
            if (codeTaken(error)) {
                return c.json({ error: `Another plan's code is ${body.data.code}.` }, 409);
            }
            throw error;
        }
        plans.forget();
        return c.json(await planOut(body.data.code), 201);
    });

    api.put("/plans/:code", onlyAdmins, async (c) => {
        const body = await planIn(c);
        if (!body.success) {
            return c.json({ error: "invalid plan", issues: body.error.issues }, 400);
        }
        const existing = await plans.byCode(c.req.param("code"));
        if (!existing) {
            return c.json({ error: "no such plan" }, 404);
        }
        const clash = await plans.byCode(body.data.code);
        if (clash && clash.id !== existing.id) {
            return c.json({ error: `Another plan's code is ${body.data.code}.` }, 409);
        }
        await db.update(tables.plan).set(body.data).where(eq(tables.plan.id, existing.id));
        plans.forget();
        return c.json(await planOut(body.data.code));
    });

    api.delete("/plans/:code", onlyAdmins, async (c) => {
        const found = (await plans.view()).plans.find((p) => p.code === c.req.param("code"));
        if (!found) {
            return c.json({ error: "no such plan" }, 404);
        }
        if (found.inUse) {
            return c.json({ error: found.default ? "It's the default plan: make another the default first." : "It's in use: move its accounts to another plan first." }, 409);
        }
        await db.delete(tables.plan).where(eq(tables.plan.code, found.code));
        plans.forget();
        return c.json({ ok: true });
    });

    api.put("/plan-settings", onlyAdmins, async (c) => {
        const body = PlanSettings.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid plan settings", issues: body.error.issues }, 400);
        }
        const chosen = body.data.default ? await plans.byCode(body.data.default) : undefined;
        const trial = body.data.signUpTrial ? await plans.byCode(body.data.signUpTrial.plan) : undefined;
        if ((body.data.default && !chosen) || (body.data.signUpTrial && !trial)) {
            return c.json({ error: `There's no plan ${body.data.default && !chosen ? body.data.default : body.data.signUpTrial?.plan}.` }, 400);
        }
        if (chosen) {
            await plans.setDefault(chosen);
        }
        if (body.data.signUpTrial !== undefined) {
            await plans.setSignUpTrial(trial && body.data.signUpTrial ? { plan: trial, days: body.data.signUpTrial.days } : null);
        }
        return c.json(await plans.view());
    });

    api.delete("/people/:id", onlyAdmins, async (c) => {
        const row = await me(c.req.param("id"));
        if (!row) {
            return c.json({ error: "no such account" }, 404);
        }
        if (row.id === c.var.userId) {
            return c.json({ error: "delete your own account in Settings" }, 409);
        }
        if (fromSetting(row)) {
            return c.json({ error: "the server's ADMIN_EMAILS setting makes this account an admin" }, 409);
        }
        await deleteAccountFiles(db, row.id);
        await db.delete(user).where(eq(user.id, row.id));
        await lockouts.clear(row.email);
        return c.json({ ok: true });
    });

    /** The settings as the admin page shows them; without a store (tests, the demo), only sign-up. */
    const settingsView = async () => settings.store?.describe() ?? [{
        key: "signUp", env: "SIGN_UP", source: settings.signUpFixed ? "environment" : "default", value: await currentSignUp(db, settings),
    }];

    // ADM-5: setting the server up is finished, or skipped.
    api.post("/setup/finish", onlyAdmins, async (c) => {
        await db.delete(tables.serverSetting).where(eq(tables.serverSetting.key, setupPendingKey));
        return c.json({ ok: true });
    });

    api.get("/server-settings", onlyAdmins, async (c) => c.json({ settings: await settingsView() }));
    api.get("/server-settings/network", onlyAdmins, (c) => c.json(settings.network?.(c) ?? { yourAddress: "unknown", trustedProxies: [] }));

    api.put("/server-settings", onlyAdmins, async (c) => {
        const body = ServerSettings.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid settings", issues: body.error.issues }, 400);
        }
        const changes = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)) as Partial<Record<SettingKey, string | null>>;
        if (settings.store) {
            const refused = await settings.store.update(changes);
            if (refused) {
                return c.json({ error: refused.error }, 400);
            }
        } else if (changes.signUp !== undefined) {
            if (settings.signUpFixed) {
                return c.json({ error: "SIGN_UP is set on the server, so it can't be changed here." }, 400);
            }
            const { serverSetting } = tables;
            if (changes.signUp) {
                await db.insert(serverSetting).values({ key: "signUp", value: changes.signUp })
                    .onConflictDoUpdate({ target: serverSetting.key, set: { value: changes.signUp, updatedAt: new Date() } });
            } else {
                await db.delete(serverSetting).where(eq(serverSetting.key, "signUp"));
            }
        }
        return c.json({ settings: await settingsView() });
    });

    // ADM-4: does email work? Sent to the admin asking, and the SMTP server's own words if not.
    api.post("/server-settings/test-email", onlyAdmins, async (c) => {
        const row = await me(c.var.userId);
        const mailer = settings.mailer;
        if (!row || !mailer) {
            return c.json({ error: "Email isn't set up: add an SMTP server first." }, 409);
        }
        try {
            await mailer.send(testMessage(row.email, row.name, settings.publicUrl));
            return c.json({ to: row.email });
        } catch (error) {
            return c.json({ error: `The SMTP server didn't take it: ${error instanceof Error ? error.message : String(error)}` }, 502);
        }
    });

    // PUSH-6: do notifications reach a phone? Sent to the admin's own, and why not if they don't.
    api.post("/server-settings/test-push", onlyAdmins, async (c) => {
        const { push } = settings;
        if (!push) {
            return c.json({ error: "Notifications are off on this server (PUSH_RELAY_URL=off)." }, 409);
        }
        const result = await push.test(c.var.userId);
        if (result.phones === 0) {
            return c.json({ error: "None of your phones has notifications on. In the Android app, turn on Tell me about weather risks in Settings, then try again." }, 409);
        }
        if (result.sent === 0) {
            return c.json({ error: result.problem ?? "The push relay didn't take it. Try again in a moment." }, 502);
        }
        return c.json({ sent: result.sent });
    });

    let planNames = new Map<string, { code: string; name: string }>();
    const toInvite = (row: InviteRow, names: Map<string, string>): z.infer<typeof Invite> => ({
        id: row.id,
        ...(row.email ? { email: row.email } : {}),
        ...(row.name ? { name: row.name } : {}),
        link: inviteLink(settings, row.token),
        createdBy: names.get(row.createdById) ?? "An admin",
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ...(row.usedAt ? { usedAt: row.usedAt.toISOString() } : {}),
        ...(row.usedById && names.has(row.usedById) ? { usedBy: names.get(row.usedById) } : {}),
        ...(row.emailedAt ? { emailedAt: row.emailedAt.toISOString() } : {}),
        ...(row.planId && planNames.has(row.planId) ? { plan: planNames.get(row.planId)! } : {}),
        ...(row.planId && row.planDays ? { planDays: row.planDays } : {}),
    });
    const namesFor = async (rows: InviteRow[]) => {
        planNames = new Map((await plans.all()).map((p) => [p.id, { code: p.code, name: p.name }]));
        const ids = [...new Set(rows.flatMap((r) => [r.createdById, ...(r.usedById ? [r.usedById] : [])]))];
        const found = ids.length ? await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids)) : [];
        return new Map(found.map((u) => [u.id, u.name]));
    };

    api.get("/invites", onlyAdmins, async (c) => {
        const since = new Date(Date.now() - 90 * 86_400_000);
        const rows = await db.select().from(invite).where(gt(invite.createdAt, since)).orderBy(desc(invite.createdAt));
        const names = await namesFor(rows);
        return c.json({ invites: rows.map((r) => toInvite(r, names)) });
    });

    api.post("/invites", onlyAdmins, async (c) => {
        const body = NewInvite.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid invitation", issues: body.error.issues }, 400);
        }
        const email = body.data.email?.toLowerCase();
        if (email && (await db.select({ id: user.id }).from(user).where(eq(user.email, email))).length) {
            return c.json({ error: `${email} already has an account` }, 409);
        }
        const joins = body.data.plan ? await plans.byCode(body.data.plan) : undefined;
        if (body.data.plan && !joins) {
            return c.json({ error: `There's no plan ${body.data.plan}.` }, 400);
        }
        const now = new Date();
        const [row] = await db.insert(invite).values({
            id: randomUUID(),
            token: randomBytes(24).toString("base64url"),
            email: email ?? null,
            name: body.data.name ?? null,
            createdById: c.var.userId,
            createdAt: now,
            expiresAt: new Date(now.getTime() + inviteDays * 86_400_000),
            planId: joins?.id ?? null,
            planDays: joins ? body.data.planDays ?? null : null,
        }).returning();
        let emailed = false;
        let saved = row;
        if (body.data.send && email && settings.mailer) {
            const from = await me(c.var.userId);
            try {
                await settings.mailer.send(inviteMessage(email, row.name ?? undefined, from.name, inviteLink(settings, row.token), inviteDays));
                emailed = true;
                [saved] = await db.update(invite).set({ emailedAt: new Date() }).where(eq(invite.id, row.id)).returning();
            } catch (error) {
                console.error(`Couldn't email the invitation to ${email}: ${error instanceof Error ? error.message : error}`);
            }
        }
        return c.json({ invite: toInvite(saved, await namesFor([saved])), emailed }, 201);
    });

    api.delete("/invites/:id", onlyAdmins, async (c) => {
        const id = c.req.param("id");
        const removed = /^[0-9a-f-]{36}$/i.test(id)
            ? await db.delete(invite).where(and(eq(invite.id, id), isNull(invite.usedAt))).returning({ id: invite.id })
            : [];
        return removed.length ? c.json({ ok: true }) : c.json({ error: "no such invitation, or it was used" }, 404);
    });

    return api;
}
