import type { Match, MatchWeather, Venue } from "@lawfive/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { type Db, tables } from "../db/index.ts";
import { toRecord } from "../records.ts";
import { assess, matchLengthSec } from "./assess.ts";
import type { ForecastProvider, HistoryProvider, Hourly, Place } from "./openMeteo.ts";

// Keeping forecasts fresh without using up the weather service's allowance (WX-2):
//
// - Forecasts are kept by place, not by match: positions are rounded to squares about 5 km
//   across, so every match at a sports complex (anyone's) shares one forecast.
// - Only places with a scheduled match in the next 16 days are fetched, and how often depends on
//   how soon the next one is: every 2 hours within 2 days, every 6 within a week, daily beyond.
// - A run every 15 minutes fetches all the places that are due, up to 50 in one request, and
//   stops for the day at WEATHER_DAILY_LIMIT calls. Saving a match or venue starts a run soon,
//   so a new match gets its forecast within a minute.
// - Once a match is over, the weather it was played in is kept with it (WX-6).
// - A played match without kept weather (imported, or entered afterwards) gets it from the
//   weather service's history, a few each run, within the same daily limit (WX-10).
//
// Apps never call the weather service: they ask this server (GET /v1/weather).

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BATCH = 50;
const AHEAD_DAYS = 16;
/** Past matches looked up in one run: Open-Meteo allows 600 calls a minute. */
const HISTORY_BATCH = 100;

export interface WeatherOptions {
    provider: ForecastProvider;
    /** Past weather for played matches that have none kept; none to leave them without. */
    history?: HistoryProvider;
    /** Calls a day at most, as the weather service counts them. */
    dailyLimit: number;
    /** Whose data it is, shown beside it. */
    source?: string;
}

/** The square a position falls in, about 5 km across, and its middle. */
export function cellOf(p: Place): { key: string; lat: number; lon: number } {
    const lat = Math.round(p.lat * 20) / 20;
    const lon = Math.round(p.lon * 20) / 20;
    return { key: `${lat.toFixed(2)},${lon.toFixed(2)}`, lat, lon };
}

/** How long a place's forecast is kept before it's fetched again, by how soon its next match is. */
export function refreshEvery(untilKickoffMs: number): number {
    if (untilKickoffMs <= 2 * DAY_MS) {
        return 2 * HOUR_MS;
    }
    return untilKickoffMs <= 7 * DAY_MS ? 6 * HOUR_MS : DAY_MS;
}

/** What one place costs: Open-Meteo counts a request covering more than two weeks as more than one call. */
export function callCost(days: number): number {
    return Math.max(1, (days + 1) / 14);
}

interface Planned {
    userId: string;
    match: Match;
    place?: Place;
    kickoffMs: number;
    endMs: number;
}

export class Weather {
    readonly source: string;
    private readonly db: Db;
    /** None while weather is off (ADM-2: an admin can switch it, or change its service, while the server runs). */
    private options?: WeatherOptions;
    private running?: Promise<{ fetched: number }>;
    private soon?: NodeJS.Timeout;
    private timer?: NodeJS.Timeout;
    private budget = { day: "", used: 0 };
    /** Past matches whose weather couldn't be found, and when, so they're tried again a day later. */
    private readonly missed = new Map<string, number>();
    /** PUSH-5: after each refresh, as forecasts and the matches may have changed. */
    afterRefresh?: (now: Date) => Promise<void>;

    constructor(db: Db, options?: WeatherOptions) {
        this.db = db;
        this.options = options;
        this.source = options?.source ?? "Open-Meteo";
    }

    get enabled(): boolean {
        return this.options !== undefined;
    }

    /** New settings (ADM-2): another service, key or limit, or none to switch weather off; a refresh follows. */
    configure(options: WeatherOptions | undefined) {
        this.options = options;
        if (options) {
            this.poke(1000);
        }
    }

    /** Refreshes every 15 minutes from now on, starting shortly. */
    start(everyMs = 15 * 60 * 1000) {
        this.timer = setInterval(() => this.runLogged(), everyMs);
        this.timer.unref();
        this.poke();
    }

    stop() {
        clearInterval(this.timer);
        clearTimeout(this.soon);
    }

    /** A match or venue changed: refresh in a few seconds (several changes together make one run). */
    poke(delayMs = 5000) {
        clearTimeout(this.soon);
        this.soon = setTimeout(() => this.runLogged(), delayMs);
        this.soon.unref();
    }

    private runLogged() {
        this.run().catch((error) => console.error("Weather refresh failed:", error));
    }

    /** Fetches the forecasts that are due and keeps the weather of matches just played. One run at a time. */
    run(now = new Date()): Promise<{ fetched: number }> {
        if (!this.options) {
            return Promise.resolve({ fetched: 0 });
        }
        this.running ??= this.refresh(now).finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    /** Calls left today. */
    remaining(now = new Date()): number {
        const day = now.toISOString().slice(0, 10);
        if (this.budget.day !== day) {
            this.budget = { day, used: 0 };
        }
        return (this.options?.dailyLimit ?? 0) - this.budget.used;
    }

    private async refresh(now: Date): Promise<{ fetched: number }> {
        const options = this.options;
        if (!options) {
            return { fetched: 0 };
        }
        const { weatherForecast } = tables;
        const t = now.getTime();
        const planned = await this.planned(new Date(t - 2 * DAY_MS), new Date(t + AHEAD_DAYS * DAY_MS));

        // Places with a scheduled match still to finish, and how soon and how far ahead.
        const places = new Map<string, Place & { soonest: number; latest: number }>();
        for (const p of planned) {
            if (!p.place || p.match.status !== "scheduled" || p.endMs < t) {
                continue;
            }
            const cell = cellOf(p.place);
            const known = places.get(cell.key);
            places.set(cell.key, {
                lat: cell.lat,
                lon: cell.lon,
                soonest: Math.min(known?.soonest ?? Infinity, p.kickoffMs),
                latest: Math.max(known?.latest ?? 0, p.kickoffMs),
            });
        }
        const keys = [...places.keys()];
        const fetchedAt = new Map(
            (keys.length ? await this.db.select({ cell: weatherForecast.cell, fetchedAt: weatherForecast.fetchedAt }).from(weatherForecast).where(inArray(weatherForecast.cell, keys)) : [])
                .map((r) => [r.cell, r.fetchedAt.getTime()]),
        );
        const due = [...places]
            .filter(([key, place]) => (fetchedAt.get(key) ?? 0) + refreshEvery(place.soonest - t) <= t)
            .sort(([, a], [, b]) => a.soonest - b.soonest);

        // A week ahead (8 days) costs less than 16, so places with nothing further out ask for less.
        let fetched = 0;
        for (const days of [8, AHEAD_DAYS]) {
            const group = due.filter(([, place]) => (place.latest - t <= 7 * DAY_MS) === (days === 8));
            for (let i = 0; i < group.length; i += BATCH) {
                const affordable = Math.floor(this.remaining(now) / callCost(days));
                const batch = group.slice(i, i + Math.min(BATCH, affordable));
                if (batch.length === 0) {
                    break;
                }
                const forecasts = await options.provider(batch.map(([, p]) => ({ lat: p.lat, lon: p.lon })), days);
                this.budget.used += batch.length * callCost(days);
                for (const [j, [cell, place]] of batch.entries()) {
                    const row = { cell, lat: place.lat, lon: place.lon, fetchedAt: now, hourly: forecasts[j] };
                    await this.db.insert(weatherForecast).values(row).onConflictDoUpdate({ target: weatherForecast.cell, set: row });
                }
                fetched += batch.length;
            }
        }

        // Matches just played keep the weather they were played in.
        const ended = planned.filter((p) => p.place && p.endMs <= t);
        if (ended.length) {
            await this.compute(ended, now);
        }
        await this.backfill(now);

        // Places nobody has a match at any more.
        await this.db.delete(weatherForecast).where(lt(weatherForecast.fetchedAt, new Date(t - 3 * DAY_MS)));
        await this.afterRefresh?.(now).catch((error: unknown) => console.error("Weather alerts failed:", error));
        return { fetched };
    }

    /**
     * Played and abandoned matches (anyone's) that ended over a day ago with a place but no kept
     * weather get it from the weather service's history (WX-10), a call each.
     */
    private async backfill(now: Date) {
        const history = this.options?.history;
        if (!history) {
            return;
        }
        const t = now.getTime();
        const candidates = (await this.planned(undefined, new Date(t - DAY_MS)))
            .filter((p) => p.place && (p.match.status === "played" || p.match.status === "abandoned") && p.endMs <= t - DAY_MS)
            .filter((p) => (this.missed.get(`${p.userId}:${p.match.id}`) ?? 0) + DAY_MS <= t);
        if (candidates.length === 0) {
            return;
        }
        const { matchWeather } = tables;
        const kept = new Set<string>();
        for (const userId of new Set(candidates.map((p) => p.userId))) {
            const ids = candidates.filter((p) => p.userId === userId).map((p) => p.match.id);
            for (const row of await this.db.select({ matchId: matchWeather.matchId, kickoff: matchWeather.kickoff }).from(matchWeather)
                .where(and(eq(matchWeather.userId, userId), inArray(matchWeather.matchId, ids)))) {
                kept.add(`${userId}:${row.matchId}:${row.kickoff.getTime()}`);
            }
        }
        const due = candidates.filter((p) => !kept.has(`${p.userId}:${p.match.id}:${p.kickoffMs}`)).slice(0, HISTORY_BATCH);
        const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
        for (const p of due) {
            if (this.remaining(now) < 1) {
                return;
            }
            this.budget.used++;
            // From the day before (rain the day before counts, WX-4) to the end.
            const hourly = await history(p.place!, date(p.kickoffMs - DAY_MS), date(p.endMs)).catch((error: unknown) => {
                console.error(`Past weather for match ${p.match.id} failed:`, error);
                return undefined;
            });
            const assessed = hourly && assess(hourly, p.kickoffMs / 1000, (p.endMs - p.kickoffMs) / 1000);
            if (!assessed) {
                this.missed.set(`${p.userId}:${p.match.id}`, t);
                continue;
            }
            const data: MatchWeather = { matchId: p.match.id, final: true, ...assessed, updatedAt: now.toISOString(), source: this.source };
            const row = { userId: p.userId, matchId: p.match.id, kickoff: new Date(p.kickoffMs), data };
            await this.db.insert(matchWeather).values(row).onConflictDoUpdate({ target: [matchWeather.userId, matchWeather.matchId], set: row });
        }
    }

    /** The weather for a user's matches kicking off between two times, where there is any. */
    /** Nothing while weather is off, so the apps, the watch and the calendar show none. */
    async forUser(userId: string, from: Date, to: Date, now = new Date()): Promise<MatchWeather[]> {
        if (!this.options) {
            return [];
        }
        return this.compute(await this.planned(from, to, { userId }), now);
    }

    async forMatch(userId: string, matchId: string, now = new Date()): Promise<MatchWeather | undefined> {
        if (!this.options) {
            return undefined;
        }
        const planned = await this.planned(undefined, undefined, { userId, matchId });
        return (await this.compute(planned, now))[0];
    }

    /** PUSH-5: the weather of one person's scheduled matches still to kick off before a time, with when each kicks off. */
    async upcoming(userId: string, until: Date, now = new Date()): Promise<{ weather: MatchWeather; kickoff: Date }[]> {
        if (!this.options) {
            return [];
        }
        const planned = (await this.planned(now, until, { userId })).filter((p) => p.match.status === "scheduled");
        const kickoffs = new Map(planned.map((p) => [p.match.id, new Date(p.kickoffMs)]));
        return (await this.compute(planned, now)).map((weather) => ({ weather, kickoff: kickoffs.get(weather.matchId)! }));
    }

    /** Works out each match's weather from its place's forecast; keeps it once the match is over. */
    private async compute(planned: Planned[], now: Date): Promise<MatchWeather[]> {
        const { matchWeather, weatherForecast } = tables;
        const withPlace = planned.filter((p) => p.place);
        if (withPlace.length === 0) {
            return [];
        }
        const kept = new Map<string, { kickoff: Date; data: MatchWeather }>();
        for (const userId of new Set(withPlace.map((p) => p.userId))) {
            const ids = withPlace.filter((p) => p.userId === userId).map((p) => p.match.id);
            const rows = await this.db.select().from(matchWeather).where(and(eq(matchWeather.userId, userId), inArray(matchWeather.matchId, ids)));
            for (const row of rows) {
                kept.set(`${userId}:${row.matchId}`, row);
            }
        }
        const cells = [...new Set(withPlace.map((p) => cellOf(p.place!).key))];
        const forecasts = new Map(
            (await this.db.select().from(weatherForecast).where(inArray(weatherForecast.cell, cells))).map((r) => [r.cell, r]),
        );

        const result: MatchWeather[] = [];
        for (const p of withPlace) {
            const keptRow = kept.get(`${p.userId}:${p.match.id}`);
            if (keptRow && keptRow.kickoff.getTime() === p.kickoffMs) {
                result.push(keptRow.data);
                continue;
            }
            const forecast = forecasts.get(cellOf(p.place!).key);
            const assessed = forecast && assess(forecast.hourly as Hourly, p.kickoffMs / 1000, (p.endMs - p.kickoffMs) / 1000);
            if (!forecast || !assessed) {
                continue;
            }
            const over = p.endMs <= now.getTime();
            const weather: MatchWeather = { matchId: p.match.id, final: over, ...assessed, updatedAt: forecast.fetchedAt.toISOString(), source: this.source };
            if (over) {
                const row = { userId: p.userId, matchId: p.match.id, kickoff: new Date(p.kickoffMs), data: weather };
                await this.db.insert(matchWeather).values(row).onConflictDoUpdate({ target: [matchWeather.userId, matchWeather.matchId], set: row });
            }
            result.push(weather);
        }
        return result;
    }

    /** Matches (everyone's, or one user's) kicking off between two times, with where they're played. */
    private async planned(from?: Date, to?: Date, only: { userId?: string; matchId?: string } = {}): Promise<Planned[]> {
        const { records } = tables;
        const kickoff = sql`(${records.data}->>'kickoff')::timestamptz`;
        const rows = await this.db.select().from(records).where(and(
            eq(records.type, "match"),
            sql`${records.deletedAt} is null`,
            sql`${records.data}->>'kickoff' is not null`,
            from ? sql`${kickoff} >= ${from.toISOString()}::timestamptz` : undefined,
            to ? sql`${kickoff} <= ${to.toISOString()}::timestamptz` : undefined,
            only.userId ? eq(records.userId, only.userId) : undefined,
            only.matchId ? eq(records.id, only.matchId) : undefined,
        ));
        const venueIds = [...new Set(rows.map((r) => r.data.venueId).filter((id): id is string => typeof id === "string"))];
        const venues = new Map(
            (venueIds.length ? await this.db.select().from(records).where(and(eq(records.type, "venue"), inArray(records.id, venueIds))) : [])
                .map((r) => [`${r.userId}:${r.id}`, toRecord(r) as Venue]),
        );
        return rows.map((row) => {
            const match = toRecord(row) as Match;
            const venue = match.venueId ? venues.get(`${row.userId}:${match.venueId}`) : undefined;
            const pitch = venue?.pitches.find((p) => p.id === match.pitchId);
            const kickoffMs = new Date(match.kickoff!).getTime();
            return { userId: row.userId, match, place: pitch?.position ?? venue?.position, kickoffMs, endMs: kickoffMs + matchLengthSec(match.format) * 1000 };
        });
    }
}
