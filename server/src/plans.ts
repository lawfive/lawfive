import {
    type AccountPlan, type Plan as PlanView, type PlanHistoryEntry, type PlanLimitName, type PlanLimits, type PlanRefusal, type PlanUsage,
    type PersonPlan, SignUpTrial,
} from "@lawfive/schema";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { wallTime, zonedTimestamp } from "./zones.ts";
import { type Mailer, planEndingMessage, sendQuietly } from "./mail.ts";
import { filesUsed } from "./usage.ts";

// Plans (PLAN-1 to PLAN-9): named sets of limits, and the plan each account is in. An account with
// no row in account_plan is in the default plan. A plan can end, at the end of its last day in the
// account's time zone, and the account then moves to the plan after it (the default unless another
// was chosen): that's how a trial works. Limits are checked by the server where a thing is added,
// with one message shape (PlanRefusal), so the apps only show what they're told. Nothing is taken
// away over a limit: only adding more is refused (PLAN-4).
//
// The per-minute and per-day counts (API key calls, notifications) are kept in memory, as the
// server is one process: a restart starts them again.

type PlanRow = typeof tables.plan.$inferSelect;
type Limits = z.infer<typeof PlanLimits>;
type Usage = z.infer<typeof PlanUsage>;
type Refusal = z.infer<typeof PlanRefusal>;

/** PLAN-1: a new server's first plan, from the limits that were fixed before plans. */
const firstPlan = { code: "standard", name: "Standard", limits: { apiKeys: 20, webhooks: 10 } };
const signUpTrialKey = "signUpTrial";
const day = 86_400_000;
const mb = 1024 * 1024;

/** What an account's in now: a plan that has ended counts as the one after it, even before the loop moves it. */
export interface Effective {
    plan: PlanRow;
    /** None for an account that's always been in the default plan: it's since the account was made. */
    since?: Date;
    endsAt?: Date;
    endsOn?: string;
    then?: PlanRow;
}

export interface PlanOptions {
    /** PLAN-6: email for reminders that a plan ends soon, as it is when they're sent. */
    mailer?: () => Mailer | undefined;
    publicUrl?: string;
    /** ACCOUNT_STORAGE_LIMIT_MB from before plans, for the first plan's storage (SEC-6). */
    firstStorageMb?: () => number | undefined;
}

const words: Record<"matches" | "referees" | "venues" | "devices" | "apiKeys" | "webhooks" | "assignorCalendars", { one: string; many: string; fix: string }> = {
    matches: { one: "match", many: "matches", fix: "Delete some you don't need" },
    referees: { one: "referee", many: "referees", fix: "Delete or merge some" },
    venues: { one: "venue", many: "venues", fix: "Delete or merge some" },
    devices: { one: "watch or phone", many: "watches and phones", fix: "Unlink one in Settings → Devices" },
    apiKeys: { one: "API key", many: "API keys", fix: "Delete one" },
    webhooks: { one: "webhook", many: "webhooks", fix: "Delete one" },
    assignorCalendars: { one: "assignor calendar", many: "assignor calendars", fix: "Remove one" },
};
export type CountedLimit = keyof typeof words;

/** PLAN-4: what to say when a plan's limit stops something being added. */
export function refusal(limit: CountedLimit, allowed: number): Refusal {
    const w = words[limit];
    const error = allowed === 0
        ? `Your plan doesn't include ${w.many}. Ask an admin of this server for a plan that does.`
        : `Your plan allows ${allowed} ${allowed === 1 ? w.one : w.many}. ${w.fix}, or ask an admin of this server for a bigger plan.`;
    return { error, limit, allowed };
}

/** The day after a date ("2026-12-02" → "2026-12-03"). */
const addDays = (date: string, days: number) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** PLAN-9: the moment a plan whose last day is `date` ends, in a time zone. */
export function endOfDay(date: string, timeZone: string): Date {
    return new Date(zonedTimestamp(addDays(date, 1), "00:00", timeZone));
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

const instances = new WeakMap<Db, Plans>();

/** The one Plans for a database, so the API, sign-up and notifications share its counts. */
export function plansOf(db: Db): Plans {
    let plans = instances.get(db);
    if (!plans) {
        plans = new Plans(db);
        instances.set(db, plans);
    }
    return plans;
}

export class Plans {
    private readonly db: Db;
    private options: PlanOptions = {};
    private cached?: Promise<PlanRow[]>;
    private readonly minute = new Map<string, { ends: number; calls: number }>();
    private readonly today = new Map<string, { day: string; calls: number; push: number; searches: number }>();
    private timer?: ReturnType<typeof setInterval>;

    constructor(db: Db) {
        this.db = db;
    }

    configure(options: PlanOptions): void {
        this.options = { ...this.options, ...options };
    }

    /** Every plan, by name; a new server's first plan is made on first asking. */
    all(): Promise<PlanRow[]> {
        this.cached ??= this.load().catch((error: unknown) => {
            this.cached = undefined;
            throw error;
        });
        return this.cached;
    }

    private async load(): Promise<PlanRow[]> {
        const { plan, serverSetting } = tables;
        let rows = await this.db.select().from(plan).orderBy(asc(sql`lower(${plan.name})`));
        if (rows.length === 0) {
            // SEC-6's storage limit, from the environment or what an admin set before plans.
            const [stored] = await this.db.select().from(serverSetting).where(eq(serverSetting.key, "accountStorageLimitMb"));
            const storageMb = this.options.firstStorageMb?.() ?? (Number(stored?.value) > 0 ? Number(stored?.value) : undefined);
            await this.db.insert(plan).values({
                id: randomUUID(), ...firstPlan, limits: { ...firstPlan.limits, ...(storageMb ? { storageMb } : {}) }, isDefault: true,
            }).onConflictDoNothing();
            rows = await this.db.select().from(plan).orderBy(asc(sql`lower(${plan.name})`));
        }
        return rows;
    }

    /** After a plan changes. */
    forget(): void {
        this.cached = undefined;
    }

    async byCode(code: string): Promise<PlanRow | undefined> {
        return (await this.all()).find((p) => p.code === code);
    }

    async defaultPlan(): Promise<PlanRow> {
        const rows = await this.all();
        return rows.find((p) => p.isDefault) ?? rows[0];
    }

    /** The account's time zone (PLAN-9), from its settings; UTC until it has one. */
    async timeZone(userId: string): Promise<string> {
        const { records } = tables;
        const [row] = await this.db.select({ data: records.data }).from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "settings"), isNull(records.deletedAt)));
        const zone = row?.data.timeZone;
        if (typeof zone === "string") {
            try {
                new Intl.DateTimeFormat("en-US", { timeZone: zone });
                return zone;
            } catch {
                // Not one this server knows.
            }
        }
        return "UTC";
    }

    private async effective(rows: (typeof tables.accountPlan.$inferSelect)[], ids: string[], now: Date): Promise<Map<string, Effective>> {
        const plans = await this.all();
        const fallback = await this.defaultPlan();
        const byId = new Map(plans.map((p) => [p.id, p]));
        const found = new Map(rows.map((r) => [r.userId, r]));
        return new Map(ids.map((id) => {
            const row = found.get(id);
            if (!row) {
                return [id, { plan: fallback }];
            }
            const then = (row.thenPlanId && byId.get(row.thenPlanId)) || fallback;
            if (row.endsAt && row.endsAt <= now) {
                return [id, { plan: then, since: row.endsAt }];
            }
            return [id, {
                plan: byId.get(row.planId) ?? fallback,
                since: row.since,
                ...(row.endsAt ? { endsAt: row.endsAt, then, ...(row.endsOn ? { endsOn: row.endsOn } : {}) } : {}),
            }];
        }));
    }

    /** The plan an account is in now. */
    async of(userId: string, now = new Date()): Promise<Effective> {
        const rows = await this.db.select().from(tables.accountPlan).where(eq(tables.accountPlan.userId, userId));
        return (await this.effective(rows, [userId], now)).get(userId)!;
    }

    async ofMany(userIds: string[], now = new Date()): Promise<Map<string, Effective>> {
        const rows = userIds.length ? await this.db.select().from(tables.accountPlan).where(inArray(tables.accountPlan.userId, userIds)) : [];
        return this.effective(rows, userIds, now);
    }

    async limits(userId: string): Promise<Limits> {
        return (await this.of(userId)).plan.limits as Limits;
    }

    /** SEC-6: how much the account may keep, in bytes; none for no limit. */
    async storageBytes(userId: string): Promise<number | undefined> {
        const most = (await this.limits(userId)).storageMb;
        return most === undefined ? undefined : most * mb;
    }

    /** The largest photo or file the account may send: the plan's, within the server's own most. */
    async largest(userId: string, limit: "photoMb" | "fileMb", serverMost: number): Promise<number> {
        const most = (await this.limits(userId))[limit];
        return most === undefined ? serverMost : Math.min(most * mb, serverMost);
    }

    private async counted(userId: string, limit: CountedLimit): Promise<number> {
        const { apiKey, assignorCalendar, device, records, session, webhook } = tables;
        const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
        switch (limit) {
            case "matches":
            case "referees":
            case "venues": {
                const type = limit === "matches" ? "match" : limit === "referees" ? "referee" : "venue";
                return n(await this.db.select({ n: count() }).from(records).where(and(eq(records.userId, userId), eq(records.type, type), isNull(records.deletedAt))));
            }
            case "devices":
                // PLAN-7: sessions that named themselves as a watch or phone (browsers never do).
                return n(await this.db.select({ n: count() }).from(session).innerJoin(device, eq(device.sessionId, session.id))
                    .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date()))));
            case "apiKeys":
                return n(await this.db.select({ n: count() }).from(apiKey).where(eq(apiKey.userId, userId)));
            case "webhooks":
                return n(await this.db.select({ n: count() }).from(webhook).where(eq(webhook.userId, userId)));
            case "assignorCalendars":
                return n(await this.db.select({ n: count() }).from(assignorCalendar).where(eq(assignorCalendar.userId, userId)));
        }
    }

    /** PLAN-4: whether `adding` more fits the plan; the refusal to send when not. */
    async refuse(userId: string, limit: CountedLimit, adding = 1): Promise<Refusal | undefined> {
        const allowed = (await this.limits(userId))[limit];
        if (allowed === undefined || adding <= 0) {
            return undefined;
        }
        return (await this.counted(userId, limit)) + adding > allowed ? refusal(limit, allowed) : undefined;
    }

    private todayOf(userId: string, now: number) {
        const today = utcDay(now);
        let entry = this.today.get(userId);
        if (!entry || entry.day !== today) {
            entry = { day: today, calls: 0, push: 0, searches: 0 };
            this.today.set(userId, entry);
        }
        if (this.today.size > 50_000) {
            for (const [key, value] of this.today) {
                if (value.day !== today) {
                    this.today.delete(key);
                }
            }
        }
        return entry;
    }

    /**
     * PLAN-8: counts a request made with one of the account's API keys, or says it's over the
     * plan's limit a minute or a day, and how many seconds until it can try again.
     */
    async apiCall(userId: string, now = Date.now()): Promise<{ error: string; retryAfter: number } | undefined> {
        const limits = await this.limits(userId);
        let minute = this.minute.get(userId);
        if (!minute || minute.ends <= now) {
            minute = { ends: now + 60_000, calls: 0 };
            this.minute.set(userId, minute);
        }
        const today = this.todayOf(userId, now);
        if (limits.apiCallsPerMinute !== undefined && minute.calls >= limits.apiCallsPerMinute) {
            return { error: `Your plan allows ${limits.apiCallsPerMinute} API requests a minute, from all your keys together. Wait a little and try again.`, retryAfter: Math.ceil((minute.ends - now) / 1000) };
        }
        if (limits.apiCallsPerDay !== undefined && today.calls >= limits.apiCallsPerDay) {
            const midnight = Date.parse(`${addDays(today.day, 1)}T00:00:00Z`);
            return { error: `Your plan allows ${limits.apiCallsPerDay} API requests a day, from all your keys together. Try again after midnight UTC.`, retryAfter: Math.ceil((midnight - now) / 1000) };
        }
        minute.calls++;
        today.calls++;
        if (this.minute.size > 50_000) {
            for (const [key, value] of this.minute) {
                if (value.ends <= now) {
                    this.minute.delete(key);
                }
            }
        }
        return undefined;
    }

    /** PLAN-11: counts an address search, or says the plan's daily limit is reached, and how many seconds until midnight UTC. */
    async addressSearch(userId: string, now = Date.now()): Promise<{ error: string; retryAfter: number } | undefined> {
        const most = (await this.limits(userId)).addressSearchesPerDay;
        const today = this.todayOf(userId, now);
        if (most !== undefined && today.searches >= most) {
            const midnight = Date.parse(`${addDays(today.day, 1)}T00:00:00Z`);
            return { error: `Your plan allows ${most} address searches a day. You can still place the venue on the map by hand.`, retryAfter: Math.ceil((midnight - now) / 1000) };
        }
        today.searches++;
        return undefined;
    }

    /** PLAN-8: whether the account's plan lets another notification go today. */
    async pushAllowed(userId: string, now = Date.now()): Promise<boolean> {
        const most = (await this.limits(userId)).pushPerDay;
        return most === undefined || this.todayOf(userId, now).push < most;
    }

    pushSent(userId: string, now = Date.now()): void {
        this.todayOf(userId, now).push++;
    }

    /** PLAN-6: how much of each limit the account is using. */
    async usage(userId: string, now = Date.now()): Promise<Usage> {
        const today = this.todayOf(userId, now);
        const [matches, referees, venues, devices, apiKeys, webhooks, assignorCalendars, bytes] = await Promise.all([
            this.counted(userId, "matches"), this.counted(userId, "referees"), this.counted(userId, "venues"), this.counted(userId, "devices"),
            this.counted(userId, "apiKeys"), this.counted(userId, "webhooks"), this.counted(userId, "assignorCalendars"), filesUsed(this.db, userId),
        ]);
        return { matches, referees, venues, storageMb: Math.round((bytes / mb) * 10) / 10, devices, pushPerDay: today.push, apiKeys, apiCallsPerDay: today.calls, webhooks, assignorCalendars, addressSearchesPerDay: today.searches };
    }

    /** GET /v1/account/plan. */
    async accountView(userId: string): Promise<z.infer<typeof AccountPlan>> {
        const current = await this.of(userId);
        const since = current.since ?? (await this.db.select({ at: tables.user.createdAt }).from(tables.user).where(eq(tables.user.id, userId)))[0]?.at ?? new Date();
        return {
            plan: { code: current.plan.code, name: current.plan.name },
            limits: current.plan.limits as Limits,
            since: since.toISOString(),
            ...(current.endsAt ? { endsAt: current.endsAt.toISOString() } : {}),
            ...(current.endsOn ? { endsOn: current.endsOn } : {}),
            ...(current.then ? { then: { code: current.then.code, name: current.then.name } } : {}),
            usage: await this.usage(userId),
        };
    }

    /** As the People page shows it (PLAN-3). */
    static personView(current: Effective): z.infer<typeof PersonPlan> {
        return {
            code: current.plan.code,
            name: current.plan.name,
            ...(current.endsAt ? { endsAt: current.endsAt.toISOString() } : {}),
            ...(current.endsOn ? { endsOn: current.endsOn } : {}),
            ...(current.then ? { then: { code: current.then.code, name: current.then.name } } : {}),
        };
    }

    /** The account's local date `days` from now (PLAN-5), for a trial's last day. */
    async dayFromNow(userId: string, days: number, now = new Date()): Promise<string> {
        return addDays(wallTime(now.toISOString(), await this.timeZone(userId)).date, days);
    }

    /**
     * PLAN-3, PLAN-5: puts an account in a plan, until the end of `endsOn` in its time zone when
     * given, then `then` (the default when none); kept in the history.
     */
    async set(userId: string, to: PlanRow, options: { endsOn?: string; then?: PlanRow; reason: z.infer<typeof PlanHistoryEntry>["reason"]; by?: string }, now = new Date()): Promise<void> {
        const before = await this.of(userId, now);
        const endsAt = options.endsOn ? endOfDay(options.endsOn, await this.timeZone(userId)) : undefined;
        const since = before.plan.id === to.id && before.since ? before.since : now;
        const row = { planId: to.id, since, endsAt: endsAt ?? null, endsOn: endsAt ? options.endsOn! : null, thenPlanId: endsAt && options.then ? options.then.id : null, reminded: null };
        await this.db.insert(tables.accountPlan).values({ userId, ...row })
            .onConflictDoUpdate({ target: tables.accountPlan.userId, set: row });
        await this.db.insert(tables.planChange).values({
            id: randomUUID(), userId, fromCode: before.plan.code, fromName: before.plan.name, toCode: to.code, toName: to.name,
            reason: options.reason, byName: options.by ?? null, endsAt: endsAt ?? null, at: now,
        });
    }

    async history(userId: string): Promise<z.infer<typeof PlanHistoryEntry>[]> {
        const { planChange } = tables;
        const rows = await this.db.select().from(planChange).where(eq(planChange.userId, userId)).orderBy(desc(planChange.at));
        return rows.map((r) => ({
            ...(r.fromCode && r.fromName ? { from: { code: r.fromCode, name: r.fromName } } : {}),
            to: { code: r.toCode, name: r.toName },
            at: r.at.toISOString(),
            reason: r.reason as z.infer<typeof PlanHistoryEntry>["reason"],
            ...(r.byName ? { by: r.byName } : {}),
            ...(r.endsAt ? { endsAt: r.endsAt.toISOString() } : {}),
        }));
    }

    /** PLAN-5: the sign-up trial, by the plan's id so a new code doesn't break it. */
    async signUpTrial(): Promise<{ plan: PlanRow; days: number } | undefined> {
        const [row] = await this.db.select().from(tables.serverSetting).where(eq(tables.serverSetting.key, signUpTrialKey));
        const stored = row?.value as { planId?: string; days?: number } | undefined;
        const plan = stored?.planId ? (await this.all()).find((p) => p.id === stored.planId) : undefined;
        return plan && stored?.days ? { plan, days: stored.days } : undefined;
    }

    async setSignUpTrial(trial: { plan: PlanRow; days: number } | null): Promise<void> {
        const { serverSetting } = tables;
        if (!trial) {
            await this.db.delete(serverSetting).where(eq(serverSetting.key, signUpTrialKey));
            return;
        }
        const value = { planId: trial.plan.id, days: trial.days };
        await this.db.insert(serverSetting).values({ key: signUpTrialKey, value }).onConflictDoUpdate({ target: serverSetting.key, set: { value, updatedAt: new Date() } });
    }

    async setDefault(to: PlanRow): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.update(tables.plan).set({ isDefault: false }).where(eq(tables.plan.isDefault, true));
            await tx.update(tables.plan).set({ isDefault: true }).where(eq(tables.plan.id, to.id));
        });
        this.forget();
    }

    /** GET /v1/plans: each with how many are in it, and whether anything refers to it. */
    async view(now = new Date()): Promise<{ plans: z.infer<typeof PlanView>[]; signUpTrial?: z.infer<typeof SignUpTrial> }> {
        const { accountPlan, invite, user } = tables;
        const plans = await this.all();
        const fallback = await this.defaultPlan();
        const rows = await this.db.select().from(accountPlan);
        const [{ n: accounts }] = await this.db.select({ n: count() }).from(user);
        const current = await this.effective(rows, rows.map((r) => r.userId), now);
        const people = new Map<string, number>();
        for (const e of current.values()) {
            people.set(e.plan.id, (people.get(e.plan.id) ?? 0) + 1);
        }
        people.set(fallback.id, (people.get(fallback.id) ?? 0) + Number(accounts) - rows.length);
        const after = new Set(rows.filter((r) => r.endsAt && r.endsAt > now && r.thenPlanId).map((r) => r.thenPlanId));
        const invited = new Set((await this.db.select({ planId: invite.planId }).from(invite)
            .where(and(isNotNull(invite.planId), isNull(invite.usedAt), gt(invite.expiresAt, now)))).map((r) => r.planId));
        const trial = await this.signUpTrial();
        return {
            plans: plans.map((p) => {
                const n = people.get(p.id) ?? 0;
                return {
                    code: p.code, name: p.name, limits: p.limits as Limits, default: p.isDefault, people: n,
                    inUse: n > 0 || p.isDefault || after.has(p.id) || invited.has(p.id) || trial?.plan.id === p.id,
                };
            }),
            ...(trial ? { signUpTrial: { plan: trial.plan.code, days: trial.days } } : {}),
        };
    }

    /** PLAN-5: moves accounts whose plan has ended to the plan after it. */
    async endDue(now = new Date()): Promise<number> {
        const { accountPlan, planChange } = tables;
        const due = await this.db.select().from(accountPlan).where(and(isNotNull(accountPlan.endsAt), lte(accountPlan.endsAt, now)));
        const plans = await this.all();
        const fallback = await this.defaultPlan();
        for (const row of due) {
            const from = plans.find((p) => p.id === row.planId) ?? fallback;
            const to = (row.thenPlanId && plans.find((p) => p.id === row.thenPlanId)) || fallback;
            const moved = await this.db.update(accountPlan)
                .set({ planId: to.id, since: row.endsAt!, endsAt: null, endsOn: null, thenPlanId: null, reminded: null })
                .where(and(eq(accountPlan.userId, row.userId), eq(accountPlan.endsAt, row.endsAt!)))
                .returning({ userId: accountPlan.userId });
            if (moved.length) {
                await this.db.insert(planChange).values({
                    id: randomUUID(), userId: row.userId, fromCode: from.code, fromName: from.name, toCode: to.code, toName: to.name, reason: "ended", at: row.endsAt!,
                });
            }
        }
        return due.length;
    }

    /** PLAN-6: emails a week and a day before a plan ends, when the server can send email. */
    async remind(now = new Date()): Promise<number> {
        const mailer = this.options.mailer?.();
        if (!mailer) {
            return 0;
        }
        const { accountPlan, user } = tables;
        const soon = await this.db.select({ row: accountPlan, email: user.email, name: user.name }).from(accountPlan)
            .innerJoin(user, eq(user.id, accountPlan.userId))
            .where(and(gt(accountPlan.endsAt, now), lte(accountPlan.endsAt, new Date(now.getTime() + 7 * day)), eq(user.status, "active")));
        const plans = await this.all();
        const fallback = await this.defaultPlan();
        let sent = 0;
        for (const { row, email, name } of soon) {
            const daysLeft = Math.ceil((row.endsAt!.getTime() - now.getTime()) / day);
            const due = daysLeft <= 1 ? 1 : 7;
            if (row.reminded !== null && row.reminded <= due) {
                continue;
            }
            const plan = plans.find((p) => p.id === row.planId) ?? fallback;
            const then = (row.thenPlanId && plans.find((p) => p.id === row.thenPlanId)) || fallback;
            await this.db.update(accountPlan).set({ reminded: due }).where(eq(accountPlan.userId, row.userId));
            sendQuietly(mailer, planEndingMessage(email, name, plan.name, then.name, row.endsOn ?? row.endsAt!.toISOString().slice(0, 10), daysLeft, `${this.options.publicUrl ?? ""}/settings`));
            sent++;
        }
        return sent;
    }

    start(everyMs = 60_000): void {
        const tick = async () => {
            await this.endDue();
            await this.remind();
        };
        this.timer = setInterval(() => void tick().catch((e: unknown) => console.error("Plans:", e)), everyMs);
        this.timer.unref();
    }

    stop(): void {
        clearInterval(this.timer);
    }
}

export type { PlanLimitName };
