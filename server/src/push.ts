import type { WeatherRisk } from "@lawfive/schema";
import { and, eq, gt, isNotNull, lt } from "drizzle-orm";
import { type Db, tables } from "./db/index.ts";
import { plansOf } from "./plans.ts";
import type { Weather } from "./weather/service.ts";

// Notifications through the push relay (PUSH-1 to PUSH-5, PUSH-7; relay/). The server sends only an event and
// a record's id: the phone asks this server for the details and writes the notification itself.

export type PushEvent = "weather-risk" | "match-changed" | "test";

type Fetch = typeof fetch;

export class Push {
    private readonly db: Db;
    private readonly url: string;
    private readonly fetcher: Fetch;
    /** PUSH-1: over the server's limit, nothing is tried until it lifts. */
    private pausedUntil = 0;
    /** Devices over their own limit, until when. */
    private readonly skipped = new Map<string, number>();
    /** Why the last send didn't go, for a test to say (PUSH-6). */
    private problem?: string;

    /** PUSH-7: this server's key at the relay (RELAY_KEY), for a server the relay gives one. */
    private readonly key?: string;

    constructor(db: Db, relayUrl: string, fetcher: Fetch = fetch, key?: string) {
        this.db = db;
        this.url = relayUrl.replace(/\/+$/, "");
        this.fetcher = fetcher;
        this.key = key || undefined;
    }

    private phones(userId: string, now: number) {
        const { device, session } = tables;
        return this.db.select({ sessionId: device.sessionId, handle: device.pushHandle }).from(device)
            .innerJoin(session, eq(session.id, device.sessionId))
            .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date(now)), isNotNull(device.pushHandle)));
    }

    /** PUSH-6: a test to a person's own phones: how many took it, and if none did, why. */
    async test(userId: string, now = Date.now()): Promise<{ phones: number; sent: number; problem?: string }> {
        const phones = await this.phones(userId, now);
        this.problem = undefined;
        let sent = 0;
        for (const phone of phones) {
            if (phone.handle && await this.sendOne(phone.sessionId, phone.handle, "test", undefined, now)) {
                sent++;
            }
        }
        return { phones: phones.length, sent, ...(sent === 0 && this.problem ? { problem: this.problem } : {}) };
    }

    /**
     * Tells each of a person's phones; how many the relay took. A failure is logged, never thrown.
     * PLAN-8: over the account's plan for the day, nothing is sent, as if no phone took it.
     */
    async notify(userId: string, type: PushEvent, id: string, now = Date.now()): Promise<number> {
        const plans = plansOf(this.db);
        if (now < this.pausedUntil || !await plans.pushAllowed(userId, now)) {
            return 0;
        }
        const phones = await this.phones(userId, now);
        let sent = 0;
        for (const phone of phones) {
            if (phone.handle && await this.sendOne(phone.sessionId, phone.handle, type, id, now)) {
                sent++;
            }
        }
        if (sent > 0) {
            plans.pushSent(userId, now);
        }
        return sent;
    }

    private async sendOne(sessionId: string, handle: string, type: PushEvent, id: string | undefined, now: number): Promise<boolean> {
        if (now < this.pausedUntil || now < (this.skipped.get(sessionId) ?? 0)) {
            this.problem = `Over the push relay's limit until ${new Date(Math.max(this.pausedUntil, this.skipped.get(sessionId) ?? 0)).toISOString()}.`;
            return false;
        }
        const res = await this.fetcher(`${this.url}/v1/send`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(this.key ? { authorization: `Bearer ${this.key}` } : {}) },
            body: JSON.stringify({ handle, type, id }),
            signal: AbortSignal.timeout(15_000),
        }).catch((error: unknown) => {
            console.error("The push relay can't be reached:", error instanceof Error ? error.message : error);
            this.problem = "The push relay can't be reached from this server.";
            return undefined;
        });
        if (res?.ok) {
            this.skipped.delete(sessionId);
            return true;
        }
        if (res?.status === 410) {
            await this.db.update(tables.device).set({ pushHandle: null }).where(eq(tables.device.sessionId, sessionId));
            this.problem = "This phone's registration has run out. Open the app, which registers it again.";
        } else if (res?.status === 429) {
            const body = await res.json().catch(() => ({})) as { limit?: string; retryAfter?: number };
            const until = now + Math.max(1, body.retryAfter ?? 60) * 1000;
            this.problem = `Over the push relay's ${body.limit ?? ""} limit until ${new Date(until).toISOString()}.`.replace("  ", " ");
            if (body.limit === "server" || body.limit === "address") {
                this.pausedUntil = until;
                console.warn(`Over the push relay's ${body.limit} limit; no notifications until ${new Date(until).toISOString()}`);
            } else {
                this.skipped.set(sessionId, until);
            }
        } else if (res?.status === 401) {
            // PUSH-7: the relay wants this server's key, and this isn't it; nothing would go until it's fixed.
            this.pausedUntil = now + 3_600_000;
            this.problem = this.key ? "The push relay didn't take this server's RELAY_KEY." : "The push relay needs this server's key: set RELAY_KEY.";
            console.error(`${this.problem} No notifications for an hour.`);
        } else if (res) {
            console.error(`The push relay answered ${res.status}`);
            this.problem = res.status === 403 ? "The push relay has blocked this server." : `The push relay answered ${res.status}. Try again in a moment.`;
        }
        return false;
    }
}

const RISK_AHEAD_MS = 3 * 86_400_000;
const FORGET_AFTER_MS = 30 * 86_400_000;

/** What's new in these risks: not told before, and "possible" isn't news once it's been "likely". */
export function newRisks(risks: WeatherRisk[], told: string[]): string[] {
    return risks
        .filter((r) => !told.includes(`${r.kind}:${r.level}`) && !(r.level === "possible" && told.includes(`${r.kind}:likely`)))
        .map((r) => `${r.kind}:${r.level}`);
}

/**
 * PUSH-5: after a weather refresh, each person whose phone takes notifications hears of new risks to
 * their matches in the next few days. Only what a phone took counts as told, so a relay that's down
 * or a limit reached means trying again at the next refresh.
 */
export async function tellNewRisks(db: Db, weather: Weather, push: Push, now = new Date()) {
    const { device, riskAlert, session } = tables;
    const people = await db.selectDistinct({ userId: session.userId }).from(device)
        .innerJoin(session, eq(session.id, device.sessionId))
        .where(and(isNotNull(device.pushHandle), gt(session.expiresAt, now)));
    for (const { userId } of people) {
        const upcoming = await weather.upcoming(userId, new Date(now.getTime() + RISK_AHEAD_MS), now);
        const earlier = new Map((await db.select().from(riskAlert).where(eq(riskAlert.userId, userId))).map((r) => [r.matchId, r]));
        for (const { weather: w, kickoff } of upcoming) {
            const known = earlier.get(w.matchId);
            const told = known && known.kickoff.getTime() === kickoff.getTime() ? known.told : [];
            const fresh = newRisks(w.risks, told);
            if (fresh.length === 0 || await push.notify(userId, "weather-risk", w.matchId, now.getTime()) === 0) {
                continue;
            }
            const row = { kickoff, told: [...told, ...fresh], updatedAt: now };
            await db.insert(riskAlert).values({ userId, matchId: w.matchId, ...row })
                .onConflictDoUpdate({ target: [riskAlert.userId, riskAlert.matchId], set: row });
        }
    }
    await db.delete(riskAlert).where(lt(riskAlert.updatedAt, new Date(now.getTime() - FORGET_AFTER_MS)));
}
