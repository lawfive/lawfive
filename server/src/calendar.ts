import type { CalendarFeed, Competition, Match, MatchRecord, MatchWeather, Referee, Role, UserSettings, Venue } from "@lawfive/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { wallTime, zonedTimestamp } from "./zones.ts";
import { toRecord } from "./records.ts";
import { matchLengthSec } from "./weather/assess.ts";
import type { Weather } from "./weather/service.ts";

// The calendar feed (CAL-1 to CAL-5): a private address calendar apps subscribe to, with the
// user's matches as events. Each event blocks the time from arriving (CAL-3) to the final
// whistle and says who, where, the crew, the fee and the weather; played matches keep their
// score and cancelled ones stay, marked cancelled (CAL-4). The address's token is its only key.
//
//   GET    /v1/calendar               the feed's address (404 when there's none)
//   POST   /v1/calendar               make it, or a new address in place of the old one
//   DELETE /v1/calendar               turn it off
//   GET    /v1/calendar/:token.ics    the feed itself, without signing in

/** CAL-3's defaults, when the settings don't say. */
export const defaultArriveMin = 30;
export const defaultReminderMin = 60;

const roleNames: Record<z.infer<typeof Role>, string> = { referee: "Referee", ar1: "AR1", ar2: "AR2", fourth: "4th official" };
const genderNames = { male: "male", female: "female", coed: "co-ed" } as const;
const conditionNames: Record<MatchWeather["condition"], string> = {
    clear: "sunny", partlyCloudy: "partly cloudy", cloudy: "cloudy", fog: "fog", drizzle: "drizzle", rain: "rain", snow: "snow", storm: "thunderstorms",
};
const riskNames: Record<MatchWeather["risks"][number]["kind"], string> = { wetField: "Wet field", rain: "Rain", storm: "Storms", snow: "Snow", heat: "Heat" };

// iCalendar (RFC 5545) text.

/** Escapes a TEXT value: backslashes, semicolons, commas and line breaks. */
export function icsText(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 bytes (UTF-8), continuing with a space, never inside a character. */
export function foldLine(line: string): string {
    const out: string[] = [];
    let current = "";
    let bytes = 0;
    for (const ch of line) {
        const size = Buffer.byteLength(ch);
        if (bytes + size > 75) {
            out.push(current);
            current = " ";
            bytes = 1;
        }
        current += ch;
        bytes += size;
    }
    out.push(current);
    return out.join("\r\n");
}

/** 20261107T170000Z. */
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 durations: -PT30M, PT15M, PT0S. */
function duration(minutes: number): string {
    if (minutes === 0) {
        return "PT0S";
    }
    const sign = minutes < 0 ? "-" : "";
    const m = Math.abs(minutes);
    return m % 1440 === 0 ? `${sign}P${m / 1440}D` : m % 60 === 0 ? `${sign}PT${m / 60}H` : `${sign}PT${m}M`;
}

export interface CalendarData {
    matches: Match[];
    venues: Map<string, Venue>;
    competitions: Map<string, Competition>;
    referees: Map<string, Referee>;
    /** By match id. */
    reports: Map<string, MatchRecord>;
    /** By match id: the forecast for upcoming matches, the weather played in for past ones. */
    weather: Map<string, MatchWeather>;
    settings?: Pick<UserSettings, "currency" | "distanceUnit" | "temperatureUnit" | "calendarArriveMin" | "calendarReminderMin" | "calendarReminders" | "calendarDayBefore" | "calendarDayOf">;
    publicUrl: string;
}

/** The feed: one event per match with a kickoff, soonest first. */
export function buildCalendar(data: CalendarData, now = Date.now()): string {
    const arrive = data.settings?.calendarArriveMin ?? defaultArriveMin;
    // CAL-3: the reminders before kickoff; accounts from before several reminders keep their one.
    const s = data.settings;
    const several = s?.calendarReminders !== undefined || s?.calendarDayBefore !== undefined || s?.calendarDayOf !== undefined;
    const reminders = several ? (s?.calendarReminders ?? []) : [s?.calendarReminderMin ?? defaultReminderMin].filter((m) => m > 0);
    // Times the way the user reads them: 12-hour for accounts in miles (the US), 24-hour otherwise.
    const locale = data.settings?.distanceUnit === "mi" ? "en-US" : "en-GB";
    const degrees = (c: number) => `${Math.round(data.settings?.temperatureUnit === "f" ? c * 9 / 5 + 32 : c)}°${data.settings?.temperatureUnit === "f" ? "F" : "C"}`;

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LawFive//Calendar feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:LawFive matches",
        "X-WR-CALDESC:Your matches from LawFive",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ];
    const matches = data.matches.filter((m) => m.kickoff).sort((a, b) => a.kickoff!.localeCompare(b.kickoff!));
    for (const match of matches) {
        const kickoff = Date.parse(match.kickoff!);
        const venue = match.venueId ? data.venues.get(match.venueId) : undefined;
        const pitch = venue?.pitches.find((p) => p.id === match.pitchId);
        const competition = match.competitionId ? data.competitions.get(match.competitionId) : undefined;
        const report = data.reports.get(match.id);
        const weather = data.weather.get(match.id);
        const home = match.home.name ?? "Home";
        const away = match.away.name ?? "Away";
        const off = match.status === "cancelled" || match.status === "postponed";
        // 9:00 AM or 09:00 (with a plain space: some calendar apps show a narrow one as a box).
        const time = (ms: number) => new Intl.DateTimeFormat(locale, { hour: locale === "en-US" ? "numeric" : "2-digit", minute: "2-digit", timeZone: match.timeZone ?? "UTC" })
            .format(ms).replace(/\s/g, " ");

        // The title: the teams (with the score once it's played), its state, and the user's role.
        const score = report && (match.status === "played" || match.status === "abandoned")
            ? `${home} ${report.score.home}–${report.score.away} ${away}${report.penalties ? ` (${report.penalties.home}–${report.penalties.away} pens)` : report.goldenGoal ? " (golden goal)" : ""}`
            : `${home} v ${away}`;
        const prefix = { cancelled: "Canceled: ", postponed: "Postponed: ", abandoned: "Abandoned: ", played: "", scheduled: "" }[match.status];
        const summary = `${prefix}${score}${match.role ? ` · ${roleNames[match.role]}` : ""}`;

        // The description: the details a referee needs on the day, one to a line.
        const crew = match.crew.map((c) => {
            const name = c.refereeId ? data.referees.get(c.refereeId)?.name : c.name;
            return name ? `${name} (${roleNames[c.role]})` : undefined;
        }).filter(Boolean);
        const players = [match.ageGroup, match.gender && genderNames[match.gender]].filter(Boolean).join(" ");
        const details = [
            match.name,
            arrive > 0 && !off ? `Kickoff ${time(kickoff)} (arrive by ${time(kickoff - arrive * 60_000)})` : `Kickoff ${time(kickoff)}`,
            [competition?.name, players].filter(Boolean).join(" · ") || undefined,
            match.role ? `You: ${roleNames[match.role]}` : undefined,
            crew.length ? `Crew: ${crew.join(", ")}` : undefined,
            match.assignor ? `Assignor: ${match.assignor}` : undefined,
            match.fee ? `Fee: ${new Intl.NumberFormat(locale, { style: "currency", currency: match.fee.currency, maximumFractionDigits: match.fee.amount % 1 === 0 ? 0 : 2 }).format(match.fee.amount)}${match.fee.paid ? " (paid)" : ""}` : undefined,
            weather ? `${weather.final ? "Weather" : "Forecast"}: ${degrees(weather.temperatureC)}, ${weather.condition === "clear" && !weather.isDay ? "clear" : conditionNames[weather.condition]}${weather.risks.length ? ` · ${weather.risks.map((r) => `${riskNames[r.kind]} ${r.level}`).join(", ")}` : ""}` : undefined,
            match.notes ? `\n${match.notes}` : undefined,
            `\n${data.publicUrl}/matches/${match.id}`,
        ].filter((line): line is string => Boolean(line));
        const location = venue ? [venue.name, pitch?.name, venue.address].filter(Boolean).join(", ") : undefined;
        const position = pitch?.position ?? venue?.position;

        lines.push(
            "BEGIN:VEVENT",
            `UID:${match.id}@lawfive`,
            `DTSTAMP:${utc(Date.parse(match.updatedAt))}`,
            `LAST-MODIFIED:${utc(Date.parse(match.updatedAt))}`,
            `SEQUENCE:${match.version}`,
            `DTSTART:${utc(kickoff - (off ? 0 : arrive) * 60_000)}`,
            `DTEND:${utc(kickoff + matchLengthSec(match.format) * 1000)}`,
            `SUMMARY:${icsText(summary)}`,
            `DESCRIPTION:${icsText(details.join("\n"))}`,
            ...(location ? [`LOCATION:${icsText(location)}`] : []),
            ...(position ? [`GEO:${position.lat.toFixed(6)};${position.lon.toFixed(6)}`] : []),
            `URL:${data.publicUrl}/matches/${match.id}`,
            `STATUS:${off ? "CANCELLED" : "CONFIRMED"}`,
            `TRANSP:${off ? "TRANSPARENT" : "OPAQUE"}`,
        );
        // Reminders (CAL-3), for matches still to come: each so long before kickoff (relative to the
        // event's start, which is the arrival time), and at set times the day before and the day of.
        if (match.status === "scheduled" && kickoff > now) {
            const alarm = (trigger: string) => lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(summary)}`, trigger, "END:VALARM");
            for (const minutes of [...new Set(reminders)].sort((a, b) => b - a)) {
                alarm(`TRIGGER:${duration(arrive - minutes)}`);
            }
            const zone = match.timeZone ?? "UTC";
            const day = wallTime(match.kickoff!, zone).date;
            const dayBefore = new Date(Date.parse(`${day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
            for (const [date, time] of [[dayBefore, s?.calendarDayBefore], [day, s?.calendarDayOf]] as const) {
                const at = time ? Date.parse(zonedTimestamp(date, time, zone)) : NaN;
                // Only before the event starts: a 7 AM match has no "day of at 8:00" reminder.
                if (at < kickoff - arrive * 60_000) {
                    alarm(`TRIGGER;VALUE=DATE-TIME:${utc(at)}`);
                }
            }
        }
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Everything the feed shows for a user. */
async function loadCalendar(db: Db, userId: string, publicUrl: string, weather?: Weather): Promise<CalendarData> {
    const { records, matchWeather } = tables;
    const rows = await db.select().from(records).where(and(eq(records.userId, userId), isNull(records.deletedAt),
        inArray(records.type, ["match", "matchRecord", "venue", "referee", "competition", "settings"])));
    const of = <T>(type: string) => rows.filter((r) => r.type === type).map((r) => toRecord(r) as T);
    const matches = of<Match>("match");
    const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((r) => [r.id, r]));

    // The weather played in, kept once a match is over, while it still kicks off then; and the
    // forecast for the next couple of weeks.
    const kickoffs = new Map(matches.filter((m) => m.kickoff).map((m) => [m.id, Date.parse(m.kickoff!)]));
    const kept = await db.select().from(matchWeather).where(eq(matchWeather.userId, userId));
    const forecastWeather = new Map(kept.filter((w) => kickoffs.get(w.matchId) === w.kickoff.getTime()).map((w) => [w.matchId, w.data]));
    if (weather) {
        const now = Date.now();
        for (const w of await weather.forUser(userId, new Date(now - 3 * 3_600_000), new Date(now + 17 * 86_400_000))) {
            forecastWeather.set(w.matchId, w);
        }
    }
    return {
        matches,
        venues: byId(of<Venue>("venue")),
        competitions: byId(of<Competition>("competition")),
        referees: byId(of<Referee>("referee")),
        reports: new Map(of<MatchRecord>("matchRecord").filter((r) => r.matchId).map((r) => [r.matchId!, r])),
        weather: forecastWeather,
        settings: of<UserSettings>("settings")[0],
        publicUrl,
    };
}

type FeedRow = typeof tables.calendarFeed.$inferSelect;

function toFeed(row: FeedRow, publicUrl: string): z.infer<typeof CalendarFeed> {
    const url = `${publicUrl}/v1/calendar/${row.token}.ics`;
    return {
        url,
        webcalUrl: url.replace(/^https?:\/\//, "webcal://"),
        createdAt: row.createdAt.toISOString(),
        ...(row.lastFetchedAt ? { lastFetchedAt: row.lastFetchedAt.toISOString() } : {}),
    };
}

/** GET /v1/calendar/:token.ics, which calendar apps fetch without signing in (app.ts mounts it before the sign-in check). */
export function calendarFeedApi(db: Db, publicUrl: string, weather?: Weather) {
    const api = new Hono();
    const { calendarFeed } = tables;
    api.get("/calendar/:file", async (c) => {
        const token = c.req.param("file").match(/^([\w-]{20,100})\.ics$/)?.[1];
        const [feed] = token ? await db.select().from(calendarFeed).where(eq(calendarFeed.token, token)) : [];
        if (!feed) {
            return c.json({ error: "no calendar has this address: it was replaced or turned off" }, 404);
        }
        const [owner] = await db.select({ status: tables.user.status }).from(tables.user).where(eq(tables.user.id, feed.userId));
        if (owner?.status === "suspended") {
            return c.json({ error: "this calendar's account is suspended" }, 403);
        }
        const now = new Date();
        if (!feed.lastFetchedAt || now.getTime() - feed.lastFetchedAt.getTime() > 3_600_000) {
            await db.update(calendarFeed).set({ lastFetchedAt: now }).where(eq(calendarFeed.userId, feed.userId));
        }
        const body = buildCalendar(await loadCalendar(db, feed.userId, publicUrl, weather), now.getTime());
        return c.body(body, 200, {
            "content-type": "text/calendar; charset=utf-8",
            "content-disposition": "inline; filename=\"lawfive.ics\"",
            "cache-control": "private, max-age=300",
        });
    });
    return api;
}

export function calendarApi(db: Db, publicUrl: string) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const { calendarFeed } = tables;

    api.get("/calendar", async (c) => {
        const [row] = await db.select().from(calendarFeed).where(eq(calendarFeed.userId, c.var.userId));
        return row ? c.json(toFeed(row, publicUrl)) : c.json({ error: "there's no calendar feed yet" }, 404);
    });

    api.post("/calendar", async (c) => {
        const values = { userId: c.var.userId, token: randomBytes(24).toString("base64url"), createdAt: new Date(), lastFetchedAt: null };
        const [row] = await db.insert(calendarFeed).values(values).onConflictDoUpdate({ target: calendarFeed.userId, set: values }).returning();
        return c.json(toFeed(row, publicUrl), 201);
    });

    api.delete("/calendar", async (c) => {
        const removed = await db.delete(calendarFeed).where(eq(calendarFeed.userId, c.var.userId)).returning({ userId: calendarFeed.userId });
        return removed.length ? c.json({ ok: true }) : c.json({ error: "there's no calendar feed" }, 404);
    });

    return api;
}
