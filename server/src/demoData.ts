import { Competition, Match, MatchRecord, MatchTemplate, Referee, UserSettings, Venue, defaultFormat, demoTrack, summarizeTrack, type MatchFormat } from "@lawfive/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { z } from "zod";
import type { createApp } from "./app.ts";
import { type Db, tables } from "./db/index.ts";
import { saveRecord } from "./records.ts";
import { assess, matchLengthSec } from "./weather/assess.ts";
import type { ForecastProvider, Hourly } from "./weather/openMeteo.ts";

// The demo account's sample data: its matches, venues, referees and the rest, with made-up weather.
// The demo server (demo.ts) fills its in-memory database with it, and so do the phones' fixtures
// (fixtures.ts, `pnpm fixtures`), with ids and a clock of their own so they're the same every run.
// Kickoffs are days from today, in the computer's time zone.

/** A new record's id; `kind` is the record type, or "pitch". */
export type NewId = (kind: string) => string;

/** A match played, for its weather. */
export interface Played { matchId: string; kickoff: string; format: MatchFormat }

/**
 * SYNC-14: a Venu 2 linked to the demo account, which downloaded its next matches this morning; the
 * next match was changed since, so it shows as an older version on the watch. The fixtures give its
 * link an id and token of their own, so it's the same every run.
 */
export async function linkDemoWatch(db: Db, app: Pick<ReturnType<typeof createApp>, "request">, userId: string,
    link: { sessionId: string; token: string } = { sessionId: randomUUID(), token: randomUUID().replaceAll("-", "") }) {
    const { sessionId, token } = link;
    const linked = new Date(Date.now() - 30 * 86_400_000);
    const synced = new Date(Date.now() - 4 * 3_600_000);
    await db.insert(tables.session).values({ id: sessionId, token, userId, scope: "watch", expiresAt: new Date(Date.now() + 60 * 86_400_000), createdAt: linked, updatedAt: synced });
    const res = await app.request("/v1/watch/matches", { headers: { authorization: `Bearer ${token}`, "x-lawfive-device": "garmin; model=006-B3703-00; firmware=19.05; app=2026.11.9" } });
    const next = ((await res.json()) as { matches: { id: string }[] }).matches[0];
    await db.update(tables.watchCopy).set({ since: synced, syncedAt: synced }).where(eq(tables.watchCopy.sessionId, sessionId));
    await db.update(tables.device).set({ lastSeenAt: synced }).where(eq(tables.device.sessionId, sessionId));
    await db.update(tables.session).set({ updatedAt: synced }).where(eq(tables.session.id, sessionId));
    if (next) {
        const [row] = await db.select().from(tables.records).where(eq(tables.records.id, next.id));
        await saveRecord(db, userId, "match", next.id, { ...row.data, notes: `${row.data.notes ? `${row.data.notes} ` : ""}Moved to the far pitch.` }, "any");
    }
}

/** Made-up weather for the matches already played, as if looked up when they were played. */
export async function seedPlayedWeather(db: Db, userId: string, played: Played[], source: string) {
    for (const { matchId, kickoff, format } of played) {
        const start = new Date(kickoff).getTime() / 1000;
        const assessed = assess(demoHourly(start - 2 * 86_400, start + 86_400), start, matchLengthSec(format));
        if (assessed) {
            const data = { matchId, final: true, ...assessed, updatedAt: kickoff, source };
            await db.insert(tables.matchWeather).values({ userId, matchId, kickoff: new Date(kickoff), data });
        }
    }
}

/** Days from today (local time) and the hour, for the made-up weather. */
function dayAndHour(t: number): [number, number] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(t * 1000);
    return [Math.floor((t * 1000 - today.getTime()) / 86_400_000), d.getHours()];
}

/** Made-up hourly weather around the demo's matches, by day from today. */
function demoHourly(from: number, to: number): Hourly {
    const h: Hourly = { time: [], temperature: [], apparent: [], precipitation: [], chance: [], snowfall: [], code: [], gust: [], isDay: [] };
    for (let t = Math.floor(from / 3600) * 3600; t <= to; t += 3600) {
        const [day, hour] = dayAndHour(t);
        const daylight = hour >= 7 && hour <= 18;
        const warmth = Math.max(0, Math.sin((Math.PI * (hour - 6)) / 14));
        let temperature = 11 + 8 * warmth;
        let code = daylight ? 2 : 0;
        let rain = 0;
        let chance = 10;
        let gust = 18;
        // Rain through the night before day 2, easing off by late morning.
        if ((day === 1 && hour >= 20) || (day === 2 && hour <= 6)) {
            [code, rain, chance] = [63, 1.5, 90];
        } else if (day === 2 && hour >= 7 && hour <= 10) {
            [code, rain, chance] = [61, 1.2, 75];
        } else if (day === 2 && hour === 11) {
            [code, rain, chance] = [51, 0.3, 55];
        } else if (day === 2 || day === -6) {
            code = 3;
        } else if (day === 3 || day === -5) {
            // A hot, clear afternoon.
            temperature += day === 3 ? 15 : 4;
            code = 0;
        } else if ((day === 9 || day === -13) && hour >= 9 && hour <= 12) {
            [code, rain, chance, gust] = [95, 4, 80, 55];
        } else if (day === 5) {
            [code, rain, chance] = [80, 2, 70];
        }
        h.time.push(t);
        h.temperature.push(Math.round(temperature * 10) / 10);
        h.apparent.push(Math.round((temperature + (temperature > 25 ? 3 : -1)) * 10) / 10);
        h.precipitation.push(rain);
        h.chance.push(chance);
        h.snowfall.push(0);
        h.code.push(code);
        h.gust.push(gust);
        h.isDay.push(daylight ? 1 : 0);
    }
    return h;
}


/** Every place gets the same made-up weather (the demo's venues are all in Sunnyvale). */
export async function demoForecasts(...[places, days]: Parameters<ForecastProvider>): ReturnType<ForecastProvider> {
    const now = Date.now() / 1000;
    return places.map(() => demoHourly(now - 86_400, now + days * 86_400));
}

/** Fills an account with the demo's records and tracks; the matches played, for their weather. */
export async function seedDemo(db: Db, userId: string, newId: NewId = () => randomUUID()): Promise<Played[]> {
    const updatedAt = new Date().toISOString();
    const put = async <T extends z.ZodType>(type: string, schema: T, value: Omit<z.input<T>, "id" | "version" | "updatedAt">, id = newId(type)) => {
        const record = schema.parse({ ...value, id, version: 1, updatedAt }) as Record<string, unknown>;
        const { id: _, version, updatedAt: __, ...data } = record;
        await db.insert(tables.records).values({ userId, id, type, version: 1, seq: sql`nextval('record_seq')`, updatedAt: new Date(), data });
        return id;
    };
    const day = (offset: number, hour: number, minute = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
    };

    // What a US browser would have set at sign-up
    await put("settings", UserSettings, { misconductScheme: "ussf", currency: "USD", distanceUnit: "mi", temperatureUnit: "f", maxHeartRate: 188 });

    // Formats
    const u12: MatchFormat = { ...defaultFormat, periods: 2, periodSec: 30 * 60, breakSec: 5 * 60, halfwayBreak: true, teamSize: 9, clock: "down" };
    const u14: MatchFormat = { ...defaultFormat, periodSec: 35 * 60, breakSec: 10 * 60, teamSize: 11 };
    const adult: MatchFormat = { ...defaultFormat, trackStoppage: true, goalTypes: true };
    const cup: MatchFormat = { ...adult, extraTime: true, penalties: true };

    // Templates, then the competitions that use them, venues, referees
    const u12Template = await put("matchTemplate", MatchTemplate, { name: "U12 league: 2×30", format: u12, defaults: { fee: { amount: 40, currency: "USD", paid: false } } });
    const u14Template = await put("matchTemplate", MatchTemplate, { name: "U14: 2×35", format: u14, defaults: { fee: { amount: 55, currency: "USD", paid: false } } });
    const adultTemplate = await put("matchTemplate", MatchTemplate, { name: "Adult 2×45", format: adult, defaults: { fee: { amount: 70, currency: "USD", paid: false } } });
    const cupTemplate = await put("matchTemplate", MatchTemplate, { name: "Cup: extra time and penalties", format: cup, defaults: {} });

    const byl = await put("competition", Competition, { name: "Bay Youth League U12 Boys", organiser: "Bay Youth League", type: "league", season: "2026-27", ageGroup: "U12", level: "Gold", templateId: u12Template, misconductScheme: "ussf" });
    const ncp = await put("competition", Competition, { name: "NorCal Premier U14 Girls", organiser: "NorCal Premier", type: "league", season: "2026-27", ageGroup: "U14", level: "Premier", templateId: u14Template });
    const sun = await put("competition", Competition, { name: "Peninsula Sunday League", type: "league", season: "2026", level: "Division 1", templateId: adultTemplate });
    const cupId = await put("competition", Competition, { name: "Harvest Cup", type: "tournament", season: "2026", startDate: "2026-11-14", endDate: "2026-11-15", templateId: cupTemplate });

    const pitch = (name: string, lat: number, lon: number) => ({ id: newId("pitch"), name, position: { lat, lon } });
    const twinPitches = [pitch("Field 1", 37.4149, -122.0181), pitch("Field 3", 37.4158, -122.0162), pitch("Field 4", 37.4161, -122.0155)];
    const twin = await put("venue", Venue, { name: "Twin Creeks Sports Complex", address: "969 Caribbean Dr, Sunnyvale, CA 94089", position: { lat: 37.4136, lon: -122.0167 }, pitches: twinPitches, notes: "Park in the north lot; fields 3 and 4 are past the snack bar.", tags: ["turf"] });
    const ortegaPitches = [pitch("Main field", 37.3829, -122.0095)];
    const ortega = await put("venue", Venue, { name: "Ortega Park", address: "636 Harrow Way, Sunnyvale, CA 94087", pitches: ortegaPitches, tags: ["grass"] });
    const baylandsPitches = [pitch("Field A", 37.4176, -121.9997), pitch("Field B", 37.4181, -121.9989)];
    const baylands = await put("venue", Venue, { name: "Baylands Park", address: "999 E Caribbean Dr, Sunnyvale, CA 94089", pitches: baylandsPitches, notes: "No shade; bring water. Lightning policy: 30 minutes after the last strike." });

    // Twin Creeks again, as another league's schedule writes it, with its own pitches: for finding
    // and merging duplicate venues (DUP-7). Field 3 is the same pitch, Field A is Field 1 under
    // another name, Field 7 isn't placed, and its Field 1 is across the road, so needs a new name.
    const twinAgainPitches = [pitch("Field 3", 37.41583, -122.01622), pitch("Field A", 37.41495, -122.01815), { id: newId("pitch"), name: "Field 7" }, pitch("Field 1", 37.4213, -122.0181)];
    const twinAgain = await put("venue", Venue, { name: "Twin Creeks", address: "969 Caribbean Drive, Sunnyvale", pitches: twinAgainPitches, tags: ["lights"] });

    const sam = await put("referee", Referee, { name: "Sam Rivera", email: "sam@example.com", phone: "+1 555 0100", tags: ["mentor"] });
    const jordan = await put("referee", Referee, { name: "Jordan Lee", email: "jordan@example.com" });
    const priya = await put("referee", Referee, { name: "Priya Natarajan", phone: "+1 555 0142", tags: ["assessor"] });
    await put("referee", Referee, { name: "Chris O'Neill", notes: "Prefers the AR1 flag." });
    // The same Sam, as another league's schedule writes him: for finding and merging duplicates (DUP-1).
    const rivera = await put("referee", Referee, { name: "Rivera, Sam", email: "srivera@baylandsyouth.org" });

    // Matches: coming up
    const team = (name: string, alias: string, colour?: string) => ({ name, alias, ...(colour ? { colour } : {}) });
    const usd = (amount: number, paid = false) => ({ amount, currency: "USD", paid });
    const tz = "America/Los_Angeles";
    await put("match", Match, { status: "scheduled", kickoff: day(2, 9), timeZone: tz, format: u12, home: team("Strikers U12", "STR", "#D71920"), away: team("Rovers U12", "ROV", "#0057B8"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: twin, pitchId: twinPitches[1].id, assignor: "Dana Whitfield", role: "referee", crew: [{ role: "ar1", refereeId: sam }, { role: "ar2", name: "Club linesman" }], outlook: "Top of the table; last meeting was 4-3.", fee: usd(40), external: { source: "csv", id: "BYL-2026-1142" }, tags: ["league"] });
    await put("match", Match, { status: "scheduled", kickoff: day(2, 11, 30), timeZone: tz, format: u14, home: team("Thunder FC", "THU", "#FFD100"), away: team("Galaxy SC", "GAL", "#6A2C91"), gender: "female", ageGroup: "U14", competitionId: ncp, venueId: twin, pitchId: twinPitches[0].id, role: "ar1", crew: [{ role: "referee", refereeId: priya }, { role: "ar2", refereeId: jordan }], fee: usd(35) });
    await put("match", Match, { status: "scheduled", kickoff: day(3, 14), timeZone: tz, format: adult, home: team("Old Boys", "OBS", "#000000"), away: team("Athletic", "ATH", "#FFFFFF"), gender: "male", ageGroup: "O35", competitionId: sun, venueId: ortega, pitchId: ortegaPitches[0].id, role: "referee", crew: [{ role: "ar1", refereeId: jordan }, { role: "ar2", refereeId: sam }], notes: "Bring the spare whistle and the coin.", fee: usd(70), tags: ["needs AR"] });
    await put("match", Match, { status: "scheduled", kickoff: day(8, 10), timeZone: tz, format: u12, home: team("Cobras U12", "COB", "#1B7F3B"), away: team("Strikers U12", "STR", "#D71920"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: twinAgain, pitchId: twinAgainPitches[0].id, assignor: "Dana Whitfield", role: "ar1", crew: [{ role: "referee", refereeId: rivera }], fee: usd(30) });
    await put("match", Match, { status: "scheduled", kickoff: day(16, 9), timeZone: tz, format: u12, home: team("Rovers U12", "ROV", "#0057B8"), away: team("Cobras U12", "COB", "#1B7F3B"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: twinAgain, pitchId: twinAgainPitches[1].id, assignor: "Dana Whitfield", role: "referee", crew: [], fee: usd(40) });
    await put("match", Match, { status: "scheduled", kickoff: day(9, 10), timeZone: tz, format: u12, home: team("Rovers U12", "ROV", "#0057B8"), away: team("United U12", "UTD", "#00A651"), competitionId: byl, venueId: baylands, pitchId: baylandsPitches[0].id, assignor: "Dana Whitfield", role: "referee", crew: [{ role: "ar1", refereeId: rivera }], fee: usd(40) });
    await put("match", Match, { status: "scheduled", kickoff: day(16, 8, 30), timeZone: tz, name: "Harvest Cup semi-final", format: cup, home: team("Dynamo", "DYN", "#FF7A00"), away: team("City", "CTY", "#0057B8"), gender: "coed", ageGroup: "Adult", competitionId: cupId, venueId: twin, pitchId: twinPitches[2].id, assignor: "Marcus Bell", role: "fourth", crew: [{ role: "referee", refereeId: sam }], fee: usd(25), tags: ["tournament"] });
    await put("match", Match, { status: "postponed", kickoff: day(5, 9), timeZone: tz, format: u14, home: team("Galaxy SC", "GAL", "#6A2C91"), away: team("Strikers U14", "STR", "#D71920"), competitionId: ncp, venueId: baylands, role: "referee", crew: [], notes: "Field closed; new date to come." });

    // Matches: played, with what the watch recorded
    const played: Played[] = [];
    const play = async (
        match: Omit<z.input<typeof Match>, "id" | "version" | "updatedAt" | "status">,
        record: Omit<z.input<typeof MatchRecord>, "id" | "version" | "updatedAt" | "matchId">,
        trackAt?: { lat: number; lon: number },
        assistant = false,
    ) => {
        const matchId = await put("match", Match, { ...match, status: record.outcome === "abandoned" ? "abandoned" : "played" });
        const device = record.device ?? watches.venu2;
        // A track around the pitch given (TRK-1), with the report's distance worked out from it.
        const track = trackAt && demoTrack(trackAt, record.periods, assistant, undefined, device);
        const distanceM = track ? summarizeTrack(track, record.periods).total.distanceM : record.distanceM;
        const recordId = await put("matchRecord", MatchRecord, { ...record, distanceM, matchId, device });
        if (track) {
            await db.insert(tables.matchTrack).values({ userId, matchRecordId: recordId, source: track.source.kind, data: gzipSync(JSON.stringify(track)), updatedAt: new Date() });
        }
        played.push({ matchId, kickoff: match.kickoff!, format: match.format });
    };
    const P = (number: number) => ({ kind: "player" as const, number });
    const ussf = (code: string) => ({ scheme: "ussf", code });
    // STAT-15: the watches the matches were recorded on, as the server keeps them, mostly a Venu 2.
    const watches = { venu2: "garmin:006-B3703-00", fr965: "garmin:006-B4315-00", series9: "applewatch:Watch7,3", galaxy4: "wearos:SM-R870" };
    /**
     * The periods, kicking off at the times given on the day `offset` from today, on the watch given,
     * with its battery at each period's kickoff and end (DIAG-1) when `battery` is given: starting at
     * that percent and going down that much an hour from the first kickoff, halftime included (a
     * Venu 2 near 10% an hour, a Forerunner 965, with a bigger battery, near 6, an Apple Watch or
     * Galaxy Watch near 20). Garmins read tenths, the others whole percents. An abandoned match has
     * no reading at its end; matches from before the watch read its battery have none at all.
     */
    const onWatch = (device: string, offset: number, starts: [number, number][], playedSec: number[],
        battery?: [percent: number, perHour: number], { extraTimeFrom = 2, abandoned = false } = {}) => {
        const periods = playedSec.map((sec, i) => ({ period: i + 1, extraTime: i >= extraTimeFrom, startedAt: day(offset, ...starts[i]), playedSec: sec }));
        if (!battery) {
            return { device, periods };
        }
        const [percent, perHour] = battery;
        const first = Date.parse(periods[0].startedAt);
        const step = device.startsWith("garmin:") ? 10 : 1;
        const at = (t: number) => Math.round((percent - (perHour * (t - first)) / 3_600_000) * step) / step;
        const readings = periods.flatMap((p) => {
            const kickoff = Date.parse(p.startedAt);
            return [{ period: p.period, at: "kickoff" as const, percent: at(kickoff) }, { period: p.period, at: "end" as const, percent: at(kickoff + p.playedSec * 1000) }];
        });
        return { device, periods, diagnostics: { battery: abandoned ? readings.slice(0, -1) : readings } };
    };

    await play(
        { kickoff: day(-5, 9), timeZone: tz, format: { ...u12, sinBins: true, sinBinSec: 600 }, home: team("United U12", "UTD", "#00A651"), away: team("Strikers U12", "STR", "#D71920"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: twin, pitchId: twinPitches[1].id, role: "referee", crew: [{ role: "ar1", refereeId: jordan }], fee: usd(40, true) },
        { outcome: "completed", ...onWatch(watches.venu2, -5, [[9, 1], [9, 37]], [1812, 1835], [84, 9.6]), score: { home: 3, away: 1 },
          // PRE-8: United kicked off attacking up Field 3, toward its north-northeast goal (TRK-9's ends).
          kickoffDirection: { team: "home", bearingDeg: 30 }, events: [
            // TMR-14: the watch started late, so the clock went on 40 seconds.
            { type: "clockAdjusted", when: "play", period: 1, periodSec: 95, clock: "match", changeSec: 40 },
            { type: "goal", when: "play", period: 1, periodSec: 420, team: "home", player: 9 },
            { type: "caution", when: "play", period: 1, periodSec: 1105, team: "away", offender: P(5), misconduct: ussf("UB") },
            { type: "goal", when: "play", period: 1, periodSec: 1530, team: "away", player: 11 },
            { type: "periodEnd", when: "play", period: 1, periodSec: 1812 },
            { type: "goal", when: "play", period: 2, periodSec: 300, team: "home", player: 7 },
            // EVT-12: a league with sin bins; the same player's second is a send-off.
            { type: "sinBin", when: "play", period: 2, periodSec: 540, team: "away", offender: P(6), misconduct: ussf("DT"), lengthSec: 600 },
            { type: "injury", when: "play", period: 2, periodSec: 960, team: "away", player: 3, lengthSec: 90 },
            { type: "secondSinBin", when: "play", period: 2, periodSec: 1450, team: "away", offender: P(6), misconduct: ussf("DT"), lengthSec: 600 },
            { type: "goal", when: "play", period: 2, periodSec: 1700, team: "home", player: 9 },
            { type: "periodEnd", when: "play", period: 2, periodSec: 1835 },
        ] },
        twinPitches[1].position,
    );
    await play(
        { kickoff: day(-6, 14), timeZone: tz, format: adult, home: team("Athletic", "ATH", "#FFFFFF"), away: team("Rangers", "RAN", "#0057B8"), competitionId: sun, venueId: ortega, role: "referee", crew: [{ role: "ar1", refereeId: sam }, { role: "ar2", refereeId: jordan }], fee: usd(70) },
        { outcome: "completed", ...onWatch(watches.venu2, -6, [[14, 2], [15, 4]], [2820, 2955], [93, 10.8]), score: { home: 2, away: 2 }, distanceM: 9150, events: [
            { type: "caution", when: "beforeKickoff", team: "away", offender: { kind: "teamOfficial", role: "headCoach" }, misconduct: ussf("DT") },
            { type: "goal", when: "play", period: 1, periodSec: 754, team: "home", player: 9, goalType: "goal" },
            { type: "stoppage", when: "play", period: 1, periodSec: 1210, lengthSec: 95 },
            { type: "caution", when: "play", period: 1, periodSec: 1630, team: "away", offender: P(4), misconduct: ussf("UB") },
            { type: "goal", when: "play", period: 1, periodSec: 2512, team: "away", player: 10, goalType: "directFreeKick" },
            { type: "periodEnd", when: "play", period: 1, periodSec: 2820 },
            { type: "goal", when: "play", period: 2, periodSec: 600, team: "home", player: 9, goalType: "penalty" },
            { type: "secondCaution", when: "play", period: 2, periodSec: 1500, team: "away", offender: P(4), misconduct: ussf("DT") },
            { type: "goal", when: "play", period: 2, periodSec: 2300, team: "away", player: 5, goalType: "ownGoal" },
            { type: "sendOff", when: "play", period: 2, periodSec: 2510, team: "home", offender: P(3), misconduct: ussf("DGF") },
            { type: "periodEnd", when: "play", period: 2, periodSec: 2955 },
        ] },
    );
    await play(
        { kickoff: day(-12, 16), timeZone: tz, name: "Harvest Cup quarter-final", format: cup, home: team("City", "CTY", "#0057B8"), away: team("Wanderers", "WAN", "#FFD100"), competitionId: cupId, venueId: twin, role: "referee", crew: [{ role: "ar1", refereeId: priya }], fee: usd(25, true) },
        { outcome: "completed", ...onWatch(watches.fr965, -12, [[16, 1], [17, 2], [17, 56], [18, 13]], [2760, 2905, 915, 960], [81.5, 6.1]), score: { home: 1, away: 1 }, penalties: { home: 4, away: 3 }, distanceM: 11980, events: [
            { type: "goal", when: "play", period: 1, periodSec: 1320, team: "away", player: 8 },
            { type: "periodEnd", when: "play", period: 1, periodSec: 2760 },
            { type: "goal", when: "play", period: 2, periodSec: 2650, team: "home", player: 14 },
            { type: "periodEnd", when: "play", period: 2, periodSec: 2905 },
            { type: "periodEnd", when: "play", period: 3, periodSec: 915 },
            { type: "periodEnd", when: "play", period: 4, periodSec: 960 },
            ...([["home", true], ["away", true], ["home", false], ["away", true], ["home", true], ["away", false], ["home", true], ["away", true], ["home", true], ["away", false]] as const)
                .map(([team, scored]) => ({ type: "penaltyKick" as const, when: "penalties" as const, team, scored })),
        ] },
    );
    // ET-6: won in extra time on a golden goal.
    await play(
        { kickoff: day(-12, 13), timeZone: tz, name: "Harvest Cup quarter-final", format: { ...cup, goldenGoal: true }, home: team("Dynamo", "DYN", "#FF7A00"), away: team("Athletic", "ATH", "#FFFFFF"), competitionId: cupId, venueId: twin, role: "referee", crew: [{ role: "ar1", refereeId: priya }], fee: usd(25, true) },
        { outcome: "completed", ...onWatch(watches.fr965, -12, [[13, 1], [14, 2], [14, 55]], [2760, 2880, 412], [97, 5.7]), score: { home: 2, away: 1 }, goldenGoal: true, distanceM: 10140, events: [
            { type: "goal", when: "play", period: 1, periodSec: 900, team: "home", player: 7 },
            { type: "periodEnd", when: "play", period: 1, periodSec: 2760 },
            { type: "goal", when: "play", period: 2, periodSec: 1500, team: "away", player: 11 },
            { type: "periodEnd", when: "play", period: 2, periodSec: 2880 },
            { type: "goal", when: "play", period: 3, periodSec: 412, team: "home", player: 9 },
            { type: "periodEnd", when: "play", period: 3, periodSec: 412 },
        ] },
    );
    await play(
        { kickoff: day(-13, 9), timeZone: tz, format: u12, home: team("Rovers U12", "ROV", "#0057B8"), away: team("Strikers U12", "STR", "#D71920"), competitionId: byl, venueId: baylands, pitchId: baylandsPitches[1].id, role: "referee", crew: [], fee: usd(40, true) },
        { outcome: "abandoned", ...onWatch(watches.venu2, -13, [[9, 1]], [1500], [88, 10], { abandoned: true }), score: { home: 1, away: 0 }, distanceM: 3420, events: [
            { type: "goal", when: "play", period: 1, periodSec: 400, team: "home", player: 11 },
            { type: "suspension", when: "play", period: 1, periodSec: 1100, reason: "lightning", lengthSec: 1800, note: "Lightning seen; 30-minute wait" },
            { type: "suspension", when: "play", period: 1, periodSec: 1500, reason: "lightning", note: "Second strike within 10 miles" },
            { type: "abandonment", when: "play", period: 1, periodSec: 1500, reason: "lightning" },
        ] },
    );
    // An assistant's match with a track (TRK-9): the pitch is found from the touchline and Field 1's pin.
    await play(
        { kickoff: day(-8, 10), timeZone: tz, format: u14, home: team("Thunder FC", "THU", "#FFD100"), away: team("Galaxy SC", "GAL", "#6A2C91"), gender: "female", ageGroup: "U14", competitionId: ncp, venueId: twin, pitchId: twinPitches[0].id, role: "ar1", crew: [{ role: "referee", refereeId: priya }, { role: "ar2", refereeId: jordan }], fee: usd(35, true) },
        { outcome: "completed", ...onWatch(watches.series9, -8, [[10, 1], [10, 47]], [2130, 2160], [96, 19.5]), score: { home: 0, away: 2 }, events: [
            { type: "goal", when: "play", period: 1, periodSec: 1290, team: "away", player: 10 },
            { type: "periodEnd", when: "play", period: 1, periodSec: 2130 },
            { type: "goal", when: "play", period: 2, periodSec: 600, team: "away", player: 8 },
            { type: "periodEnd", when: "play", period: 2, periodSec: 2160 },
        ] },
        twinPitches[0].position,
        true,
    );
    // Earlier in the season, on other watches too (STAT-15); the oldest from before the watch read its battery.
    const goal = (period: number, periodSec: number, team: "home" | "away", player: number) => ({ type: "goal" as const, when: "play" as const, period, periodSec, team, player });
    const ends = (periods: { period: number; playedSec: number }[]) => periods.map((p) => ({ type: "periodEnd" as const, when: "play" as const, period: p.period, periodSec: p.playedSec }));
    const earlier: [Parameters<typeof play>[0], ReturnType<typeof onWatch>, Parameters<typeof play>[1]["events"]][] = [
        [{ kickoff: day(-20, 10), timeZone: tz, format: u14, home: team("Galaxy SC", "GAL", "#6A2C91"), away: team("Thunder FC", "THU", "#FFD100"), gender: "female", ageGroup: "U14", competitionId: ncp, venueId: baylands, pitchId: baylandsPitches[0].id, role: "referee", crew: [{ role: "ar1", refereeId: jordan }], fee: usd(55, true) },
            onWatch(watches.galaxy4, -20, [[10, 1], [10, 48]], [2165, 2190], [91, 21]), [goal(1, 1630, "home", 7), goal(2, 840, "away", 10)]],
        [{ kickoff: day(-27, 14), timeZone: tz, format: adult, home: team("Rangers", "RAN", "#0057B8"), away: team("Old Boys", "OBS", "#000000"), gender: "male", ageGroup: "O35", competitionId: sun, venueId: ortega, pitchId: ortegaPitches[0].id, role: "referee", crew: [{ role: "ar1", refereeId: sam }], fee: usd(70, true) },
            onWatch(watches.series9, -27, [[14, 1], [15, 3]], [2790, 2880], [100, 17.5]), [goal(1, 2210, "away", 9), { type: "caution", when: "play", period: 2, periodSec: 1400, team: "home", offender: P(6), misconduct: ussf("UB") }]],
        [{ kickoff: day(-34, 9), timeZone: tz, format: u12, home: team("Cobras U12", "COB", "#1B7F3B"), away: team("Rovers U12", "ROV", "#0057B8"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: twin, pitchId: twinPitches[2].id, role: "referee", crew: [], fee: usd(40, true) },
            onWatch(watches.galaxy4, -34, [[9, 1], [9, 37]], [1810, 1820], [88, 23]), [goal(1, 610, "home", 9), goal(2, 1200, "home", 11), goal(2, 1500, "away", 4)]],
        [{ kickoff: day(-41, 14), timeZone: tz, format: adult, home: team("Athletic", "ATH", "#FFFFFF"), away: team("Old Boys", "OBS", "#000000"), gender: "male", ageGroup: "O35", competitionId: sun, venueId: ortega, pitchId: ortegaPitches[0].id, role: "referee", crew: [{ role: "ar1", refereeId: jordan }, { role: "ar2", refereeId: priya }], fee: usd(70, true) },
            onWatch(watches.venu2, -41, [[14, 2], [15, 4]], [2850, 2940], [97, 9.2]), [goal(2, 2700, "home", 10)]],
        [{ kickoff: day(-55, 11, 30), timeZone: tz, format: u14, home: team("Thunder FC", "THU", "#FFD100"), away: team("Strikers U14", "STR", "#D71920"), gender: "female", ageGroup: "U14", competitionId: ncp, venueId: twin, pitchId: twinPitches[0].id, role: "ar2", crew: [{ role: "referee", refereeId: priya }], fee: usd(35, true) },
            onWatch(watches.venu2, -55, [[11, 31], [12, 18]], [2130, 2145]), [goal(1, 900, "home", 8)]],
        [{ kickoff: day(-69, 9), timeZone: tz, format: u12, home: team("Rovers U12", "ROV", "#0057B8"), away: team("Cobras U12", "COB", "#1B7F3B"), gender: "male", ageGroup: "U12", competitionId: byl, venueId: baylands, pitchId: baylandsPitches[1].id, role: "referee", crew: [{ role: "ar1", refereeId: sam }], fee: usd(40, true) },
            onWatch(watches.venu2, -69, [[9, 1], [9, 37]], [1800, 1830]), [goal(1, 1250, "away", 9), goal(2, 300, "home", 7)]],
        [{ kickoff: day(-83, 14), timeZone: tz, format: adult, home: team("Rangers", "RAN", "#0057B8"), away: team("Athletic", "ATH", "#FFFFFF"), gender: "male", ageGroup: "O35", competitionId: sun, venueId: ortega, pitchId: ortegaPitches[0].id, role: "referee", crew: [{ role: "ar1", refereeId: sam }, { role: "ar2", refereeId: jordan }], fee: usd(70, true) },
            onWatch(watches.fr965, -83, [[14, 1], [15, 2]], [2760, 2820]), []],
    ];
    for (const [match, recording, events] of earlier) {
        const score = { home: events.filter((e) => e.type === "goal" && e.team === "home").length, away: events.filter((e) => e.type === "goal" && e.team === "away").length };
        const when = (e: (typeof events)[number]) => e as { period: number; periodSec: number };
        await play(match, { outcome: "completed", ...recording, score, events: [...events, ...ends(recording.periods)].sort((a, b) => when(a).period - when(b).period || when(a).periodSec - when(b).periodSec) });
    }
    await put("match", Match, { status: "cancelled", kickoff: day(-20, 10), timeZone: tz, format: u14, home: team("Thunder FC", "THU", "#FFD100"), away: team("Strikers U14", "STR", "#D71920"), competitionId: ncp, venueId: ortega, role: "ar2", crew: [], notes: "Away team forfeited." });
    return played;
}
