import {
    type CollectionName, type Competition, GamesQuery, type Match, type MatchRecord, type MatchTrack, type MatchWeather, type Referee, type Stats, type TrackFigures, type UserSettings,
    type Venue, addedTimeSec, ageGroupOrder, gameMatches, heatGrid, localKickoff, pitchHeat, pitchTurned, roleGroup, speedBands, summarizeTrack, defaultSprintKph,
    markedCorners, readableCollections,
    trackPitch, deviceName, devicePlatform, type WatchPlatform,
} from "@lawfive/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { gunzipSync } from "node:zlib";
import { type Db, tables } from "./db/index.ts";
import { toRecord } from "./records.ts";

// Stats on the user's games (STAT-1 to STAT-12, STAT-15): matches played or abandoned, filtered by the
// query (schema's gameMatches, which the web app's match list uses too), worked out from their
// matches, match reports, tracks and kept weather. schema/src/stats.ts describes the answer.
//
//   GET /v1/stats?from=2026-01-01&to=2026-12-31&gender=female&role=referee...   the stats
//   GET /v1/stats/games.csv?...                                                  the games, as CSV

/**
 * Each track's figures over its report's periods (TRK-3) and its heatmap (TRK-9), kept while
 * neither changes (nor the maximum heart rate): working them out means unzipping and walking
 * thousands of points.
 */
const trackFigures = new Map<string, { figures: TrackFigures; heat?: number[] }>();
const heatRoles = ["referee", "assistant"] as const;

type Counts<K extends string> = Record<K, number>;
const zero = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Counts<K>;
const roleKeys = ["referee", "assistant", "fourth", "notSet"] as const;
const genderKeys = ["male", "female", "coed", "notSet"] as const;
const average = (list: number[]) => (list.length ? Math.round(list.reduce((s, n) => s + n, 0) / list.length) : undefined);
/** Most first, then by name; the first ten. */
const top = <T>(list: T[], size: (t: T) => number, name: (t: T) => string) =>
    list.sort((a, b) => size(b) - size(a) || name(a).localeCompare(name(b))).slice(0, 10);
const byAge = (a: { ageGroup: string }, b: { ageGroup: string }) => {
    const [x, y] = [ageGroupOrder(a.ageGroup), ageGroupOrder(b.ageGroup)];
    return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
};
const personKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Every month from the first to the last, as 2026-04. */
function monthsBetween(first: string | undefined, last: string | undefined): string[] {
    if (!first || !last) {
        return [];
    }
    const out = [];
    let [y, m] = first.split("-").map(Number);
    const [lastY, lastM] = last.split("-").map(Number);
    while (y < lastY || (y === lastY && m <= lastM)) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    }
    return out;
}

interface Game {
    match: Match;
    when: { date: string; hour: number; minute: number; day: number };
    report?: MatchRecord;
    /** The track's figures, when the report has a track. */
    track?: TrackFigures;
    /** Where the referee was, on a grid over the pitch drawing (TRK-9), when the pitch is known or found. */
    heat?: number[];
    /** The track's distance, or the report's own. */
    distanceM?: number;
    weather?: MatchWeather;
}

/**
 * The user's games matching the query, with what stats need about each; and every game, for the
 * filter options. For an API key, `readable` is what its scopes can read (KEY-3): without match
 * records or settings, nothing worked out from them is loaded at all.
 */
async function loadGames(db: Db, userId: string, query: GamesQuery, readable?: ReadonlySet<CollectionName>) {
    const { records, matchTrack, matchWeather } = tables;
    const can = (collection: CollectionName) => !readable || readable.has(collection);
    const types = ["match", "venue", "referee", "competition", ...(can("match-records") ? ["matchRecord"] : []), ...(can("settings") ? ["settings"] : [])];
    const rows = await db.select().from(records).where(and(eq(records.userId, userId), isNull(records.deletedAt), inArray(records.type, types)));
    const of = <T>(type: string) => rows.filter((r) => r.type === type).map((r) => ({ row: r, record: toRecord(r) as T }));
    const venues = new Map(of<Venue>("venue").map(({ record }) => [record.id, record]));
    const referees = new Map(of<Referee>("referee").map(({ record }) => [record.id, record]));
    const competitions = new Map(of<Competition>("competition").map(({ record }) => [record.id, record]));
    const settings = of<UserSettings>("settings")[0]?.record;
    const reports = new Map(of<MatchRecord>("matchRecord").filter(({ record }) => record.matchId).map(({ row, record }) => [record.matchId!, { version: row.version, record }]));

    const all = of<Match>("match").map(({ record }) => record).filter((m) => gameMatches(m, {}));
    const matched = all.filter((m) => gameMatches(m, query)).sort((a, b) => a.kickoff!.localeCompare(b.kickoff!));

    // Track figures, from the cache or worked out now.
    const reportIds = matched.flatMap((m) => reports.get(m.id)?.record.id ?? []);
    const tracks = reportIds.length
        ? await db.select({ id: matchTrack.matchRecordId, updatedAt: matchTrack.updatedAt }).from(matchTrack)
            .where(and(eq(matchTrack.userId, userId), inArray(matchTrack.matchRecordId, reportIds)))
        : [];
    const byReportId = new Map([...reports.values()].map((r) => [r.record.id, r]));
    // TRK-9: the pitch is found by the user's role and the venue's pin for the match's pitch, or
    // placed from corners walked on the watch (TRK-13).
    const matchesById = new Map(all.map((m) => [m.id, m]));
    const contextOf = (reportId: string) => {
        const match = matchesById.get(byReportId.get(reportId)!.record.matchId!);
        const venue = match?.venueId ? venues.get(match.venueId) : undefined;
        const pin = venue?.pitches.find((p) => p.id === match!.pitchId)?.position;
        const corners = match && markedCorners(match, venue);
        return { ...(match?.role ? { role: match.role } : {}), ...(pin ? { pin } : {}), ...(corners ? { corners } : {}) };
    };
    const keyOf = (reportId: string, updated: Date) => {
        const { role, pin, corners } = contextOf(reportId);
        return `${reportId}:${updated.getTime()}:${byReportId.get(reportId)!.version}:${settings?.maxHeartRate ?? ""}:${settings?.sprintKph ?? ""}:${role ?? ""}:${pin ? `${pin.lat},${pin.lon}` : ""}:${corners ? corners.map((c) => `${c.lat},${c.lon}`).join(";") : ""}`;
    };
    const trackKeys = new Map(tracks.map((t) => [t.id, keyOf(t.id, t.updatedAt)]));
    const missing = tracks.filter((t) => !trackFigures.has(trackKeys.get(t.id)!));
    if (missing.length) {
        if (trackFigures.size > 50_000) {
            trackFigures.clear();
        }
        const loaded = await db.select().from(matchTrack).where(and(eq(matchTrack.userId, userId), inArray(matchTrack.matchRecordId, missing.map((t) => t.id))));
        for (const row of loaded) {
            const track = JSON.parse(gunzipSync(row.data).toString("utf8")) as MatchTrack;
            const report = byReportId.get(row.matchRecordId)!.record;
            const context = contextOf(row.matchRecordId);
            const pitch = trackPitch(track, report.periods, context);
            const heat = pitch && pitchHeat(track, report.periods, pitch, pitchTurned(pitch, track, report.periods, context.role, report.kickoffDirection))?.total;
            trackFigures.set(keyOf(row.matchRecordId, row.updatedAt), {
                figures: summarizeTrack(track, report.periods, settings?.maxHeartRate, settings?.sprintKph).total,
                ...(heat ? { heat } : {}),
            });
        }
    }

    // Kept weather counts only while the match still kicks off when it was worked out for.
    const weatherRows = matched.length
        ? await db.select().from(matchWeather).where(and(eq(matchWeather.userId, userId), inArray(matchWeather.matchId, matched.map((m) => m.id))))
        : [];
    const kickoffs = new Map(matched.map((m) => [m.id, Date.parse(m.kickoff!)]));
    const weather = new Map(weatherRows.filter((w) => kickoffs.get(w.matchId) === w.kickoff.getTime()).map((w) => [w.matchId, w.data as MatchWeather]));

    const games: Game[] = matched.map((match) => {
        const report = reports.get(match.id)?.record;
        const key = report && trackKeys.get(report.id);
        const cached = key ? trackFigures.get(key) : undefined;
        const track = cached?.figures;
        return {
            match,
            when: localKickoff(match.kickoff!, match.timeZone),
            ...(report ? { report } : {}),
            ...(track ? { track } : {}),
            ...(cached?.heat ? { heat: cached.heat } : {}),
            distanceM: track?.distanceM ?? report?.distanceM,
            ...(weather.has(match.id) ? { weather: weather.get(match.id) } : {}),
        };
    });
    return { all, games, venues, referees, competitions, settings, reportsRead: can("match-records") };
}

/**
 * The battery a game used, and over how long (STAT-15): from the reading at the first period's
 * kickoff to the one at the last period's end (DIAG-1), over the time from the first kickoff to
 * full time, halftime included, so short games and long ones compare fairly. Undefined without
 * both readings and both times. A rise (the watch charged mid-match, or a reading that's off)
 * isn't a drain at all, so the game is left out rather than counted as none.
 */
function batteryUsed(report: MatchRecord): { percent: number; hours: number } | undefined {
    const periods = report.periods.toSorted((a, b) => a.period - b.period);
    const [first, last] = [periods[0], periods.at(-1)];
    const battery = report.diagnostics?.battery ?? [];
    const start = first && battery.find((b) => b.period === first.period && b.at === "kickoff");
    const end = last && battery.find((b) => b.period === last.period && b.at === "end");
    if (!start || !end || !first.startedAt || !last.startedAt) {
        return undefined;
    }
    const hours = (Date.parse(last.startedAt) + last.playedSec * 1000 - Date.parse(first.startedAt)) / 3_600_000;
    const percent = start.percent - end.percent;
    return percent >= 0 && hours > 0 ? { percent, hours } : undefined;
}

/** STAT-15: the watches the games were recorded on, most games first, with the battery a match used on each. */
function watchesOf(games: Game[]): NonNullable<Stats["watches"]> {
    const models = new Map<string, { devices: Map<string, number>; name: string; platform: WatchPlatform; games: number; used: { percent: number; hours: number }[] }>();
    for (const { report } of games) {
        // A report from a watch that said which it was ("garmin:006-B3703-00"), not a bare "garmin"
        // from one that didn't, nor a result entered on the website or imported.
        const device = report?.device?.trim();
        if (!device || !device.includes(":")) {
            continue;
        }
        const [platform, name] = [devicePlatform(device), deviceName(device)];
        // Regional versions of a watch (and an Apple Watch's sizes) are one model, as people know it.
        const key = `${platform}:${name}`;
        const entry = models.get(key) ?? { devices: new Map<string, number>(), name, platform, games: 0, used: [] as { percent: number; hours: number }[] };
        entry.games++;
        entry.devices.set(device, (entry.devices.get(device) ?? 0) + 1);
        const used = batteryUsed(report!);
        if (used) {
            entry.used.push(used);
        }
        models.set(key, entry);
    }
    const tenth = (n: number) => Math.round(n * 10) / 10;
    const list = [...models.values()].map((m) => {
        const percent = m.used.reduce((s, u) => s + u.percent, 0);
        const hours = m.used.reduce((s, u) => s + u.hours, 0);
        return {
            // The one it was most often reported as.
            device: [...m.devices].sort(([a, x], [b, y]) => y - x || a.localeCompare(b))[0][0],
            name: m.name,
            platform: m.platform,
            games: m.games,
            batteryGames: m.used.length,
            // Over all the time of those games together, so a game's few minutes don't count as much as another's two hours.
            ...(m.used.length ? { drainPerHour: tenth(percent / hours), drainPerGame: tenth(percent / m.used.length) } : {}),
        };
    }).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
    return { games: list.reduce((s, m) => s + m.games, 0), models: list };
}

/** The people on a game's crew, once each: saved referees by id, typed-in names by name. */
function crewOf(match: Match, referees: Map<string, Referee>) {
    const out = new Map<string, { refereeId?: string; name: string }>();
    for (const member of match.crew) {
        const saved = member.refereeId ? referees.get(member.refereeId) : undefined;
        const name = saved?.name ?? member.name;
        if (name) {
            out.set(saved ? `id:${saved.id}` : `name:${personKey(name)}`, { ...(saved ? { refereeId: saved.id } : {}), name });
        }
    }
    return out;
}

const title = (m: Match) => m.name ?? `${m.home.name ?? "Home"} v ${m.away.name ?? "Away"}`;

function buildStats(loaded: Awaited<ReturnType<typeof loadGames>>): Stats {
    const { all, games, venues, referees, competitions, settings, reportsRead } = loaded;
    const ref = (m: Match) => ({ matchId: m.id, kickoff: m.kickoff!, title: title(m), ...(m.role ? { role: m.role } : {}) });
    const competitionName = (id: string | undefined) => (id && competitions.get(id)?.name) || "No competition";
    const monthKeys = monthsBetween(games[0]?.when.date, games.at(-1)?.when.date);

    const roles = { referee: 0, ar1: 0, ar2: 0, fourth: 0, notSet: 0 };
    const months = new Map(monthKeys.map((m) => [m, zero(roleKeys)]));
    const busiest = new Map<string, number>();
    const ageGroups = new Map<string, Counts<(typeof genderKeys)[number]>>();
    const places = new Map<string, { venueId: string; pitchId?: string; venue: string; pitch?: string; games: number }>();
    const people = new Map<string, { refereeId?: string; name: string; games: number }>();
    for (const { match, when } of games) {
        roles[match.role ?? "notSet"]++;
        months.get(when.date.slice(0, 7))![roleGroup(match.role)]++;
        busiest.set(`${when.day}:${when.hour}`, (busiest.get(`${when.day}:${when.hour}`) ?? 0) + 1);
        if (match.ageGroup) {
            const ages = ageGroups.get(match.ageGroup) ?? zero(genderKeys);
            ages[match.gender ?? "notSet"]++;
            ageGroups.set(match.ageGroup, ages);
        }
        const venue = match.venueId ? venues.get(match.venueId) : undefined;
        if (venue) {
            const pitch = venue.pitches.find((p) => p.id === match.pitchId);
            const key = `${venue.id}:${pitch?.id ?? ""}`;
            const place = places.get(key) ?? { venueId: venue.id, ...(pitch ? { pitchId: pitch.id, pitch: pitch.name } : {}), venue: venue.name, games: 0 };
            place.games++;
            places.set(key, place);
        }
        for (const [key, person] of crewOf(match, referees)) {
            const entry = people.get(key) ?? { ...person, games: 0 };
            entry.games++;
            people.set(key, entry);
        }
    }

    // Distance.
    const withDistance = games.filter((g) => g.distanceM !== undefined);
    const byLength = withDistance.toSorted((a, b) => b.distanceM! - a.distanceM!);
    let running = 0;

    // Weather.
    const weathered = games.filter((g) => g.weather);
    const extreme = (value: (w: MatchWeather) => number | undefined, more: boolean) => {
        let best: { match: Match; value: number } | undefined;
        for (const { match, weather } of weathered) {
            const v = value(weather!);
            if (v !== undefined && (!best || (more ? v > best.value : v < best.value))) {
                best = { match, value: v };
            }
        }
        return best;
    };
    const hottest = extreme((w) => w.temperatureC, true);
    const coldest = extreme((w) => w.temperatureC, false);
    const windiest = extreme((w) => w.windGustKph, true);

    // Fees (STAT-6), in the Settings currency.
    const currency = settings?.currency ?? games.find((g) => g.match.fee)?.match.fee?.currency;
    const feeGames = games.filter((g) => g.match.fee && g.match.fee.currency === currency);
    const feeMonths = new Map(monthKeys.map((m) => [m, { paidAmount: 0, owedAmount: 0 }]));
    const feeCompetitions = new Map<string, { competitionId?: string; name: string; games: number; amount: number }>();
    const others = new Map<string, { currency: string; games: number; amount: number }>();
    for (const { match, when } of games) {
        const fee = match.fee;
        if (!fee) {
            continue;
        }
        if (fee.currency !== currency) {
            const other = others.get(fee.currency) ?? { currency: fee.currency, games: 0, amount: 0 };
            other.games++;
            other.amount += fee.amount;
            others.set(fee.currency, other);
            continue;
        }
        feeMonths.get(when.date.slice(0, 7))![fee.paid ? "paidAmount" : "owedAmount"] += fee.amount;
        const key = match.competitionId ?? "";
        const entry = feeCompetitions.get(key) ?? { ...(match.competitionId ? { competitionId: match.competitionId } : {}), name: competitionName(match.competitionId), games: 0, amount: 0 };
        entry.games++;
        entry.amount += fee.amount;
        feeCompetitions.set(key, entry);
    }
    const sumFees = (paid?: boolean) => feeGames.filter((g) => paid === undefined || g.match.fee!.paid === paid).reduce((s, g) => s + g.match.fee!.amount, 0);

    // Discipline (STAT-7), from the match reports' events.
    const reported = games.filter((g) => g.report);
    const cardsOf = (r: MatchRecord) => {
        const count = (type: string) => r.events.filter((e) => e.type === type).length;
        const second = count("secondCaution");
        // EVT-12: a second sin bin is a send-off; every sin bin counts as one.
        const secondSinBins = count("secondSinBin");
        return { cautions: count("caution") + second, sendOffs: count("sendOff") + second + secondSinBins, second, sinBins: count("sinBin") + secondSinBins };
    };
    const discipline = { games: reported.length, cautions: 0, sendOffs: 0, secondCautions: 0, sinBins: 0, goals: 0 };
    const disciplineAges = new Map<string, { ageGroup: string; games: number; cautions: number; sendOffs: number }>();
    const disciplineCompetitions = new Map<string, { competitionId?: string; name: string; games: number; cautions: number; sendOffs: number }>();
    const codes = new Map<string, { misconduct: NonNullable<Extract<MatchRecord["events"][number], { type: "caution" }>["misconduct"]>; cautions: number; sendOffs: number }>();
    for (const { match, report } of reported) {
        const cards = cardsOf(report!);
        discipline.cautions += cards.cautions;
        discipline.sendOffs += cards.sendOffs;
        discipline.secondCautions += cards.second;
        discipline.sinBins += cards.sinBins;
        discipline.goals += report!.score.home + report!.score.away;
        const add = <T extends { games: number; cautions: number; sendOffs: number }>(map: Map<string, T>, key: string, fresh: () => T) => {
            const entry = map.get(key) ?? fresh();
            entry.games++;
            entry.cautions += cards.cautions;
            entry.sendOffs += cards.sendOffs;
            map.set(key, entry);
        };
        if (match.ageGroup) {
            add(disciplineAges, match.ageGroup, () => ({ ageGroup: match.ageGroup!, games: 0, cautions: 0, sendOffs: 0 }));
        }
        add(disciplineCompetitions, match.competitionId ?? "", () => ({ ...(match.competitionId ? { competitionId: match.competitionId } : {}), name: competitionName(match.competitionId), games: 0, cautions: 0, sendOffs: 0 }));
        for (const e of report!.events) {
            if ((e.type === "caution" || e.type === "secondCaution" || e.type === "sendOff") && e.misconduct) {
                const key = `${e.misconduct.scheme}:${e.misconduct.code}`;
                const entry = codes.get(key) ?? { misconduct: e.misconduct, cautions: 0, sendOffs: 0 };
                entry[e.type === "sendOff" ? "sendOffs" : "cautions"]++;
                codes.set(key, entry);
            }
        }
    }

    // Fitness (STAT-8), from the tracks.
    const tracked = games.filter((g) => g.track);
    const zones = settings?.maxHeartRate
        ? tracked.reduce<{ zone: number; fromBpm: number; sec: number }[] | undefined>((sum, { track }) => {
            if (!track!.zones) {
                return sum;
            }
            return track!.zones.map((z, i) => ({ ...z, sec: Math.round(((sum?.[i]?.sec ?? 0) + z.sec) * 10) / 10 }));
        }, undefined)
        : undefined;

    // Across the games (TRK-9): time and distance in each speed band, and where on the pitch.
    const banded = tracked.filter((g) => g.track!.speedBands);
    const bandTotals = banded.length
        ? speedBands.map(({ band }) => {
            const of = banded.map((g) => g.track!.speedBands!.find((b) => b.band === band));
            return { band, sec: Math.round(of.reduce((s, b) => s + (b?.sec ?? 0), 0)), distanceM: Math.round(of.reduce((s, b) => s + (b?.distanceM ?? 0), 0)) };
        })
        : undefined;
    // One heatmap a role: a referee's diagonal and an assistant's touchline don't add up. Games
    // without a role count as refereeing; a fourth official's have no pitch.
    const heatmaps = heatRoles.flatMap((role) => {
        const heated = tracked.filter((g) => g.heat && (roleGroup(g.match.role) === role || (role === "referee" && !g.match.role)));
        return heated.length
            ? [{ role, cols: heatGrid.cols, rows: heatGrid.rows, games: heated.length, cells: heated.reduce((sum, g) => sum.map((s, i) => s + g.heat![i]), new Array<number>(heatGrid.cols * heatGrid.rows).fill(0)).map((s) => Math.round(s)) }]
            : [];
    });

    // Added time (STAT-9): completed games' periods, none on a clock that stops (TMR-15).
    const added: { match: Match; period: number; extraTime: boolean; sec: number }[] = games
        .filter((g) => g.report && g.report.outcome === "completed")
        .flatMap(({ match, report }) => report!.periods.flatMap((p) => {
            const sec = addedTimeSec(match, p, report!.events, report!.stoppingClock);
            return sec === undefined ? [] : [{ match, period: p.period, extraTime: p.extraTime, sec }];
        }));
    const group = <K extends string | number>(list: typeof added, key: (a: (typeof added)[number]) => K | undefined) => {
        const out = new Map<K, number[]>();
        for (const a of list) {
            const k = key(a);
            if (k !== undefined) {
                out.set(k, [...(out.get(k) ?? []), a.sec]);
            }
        }
        return out;
    };

    // Year by year (STAT-10).
    const years = [...new Set(games.map((g) => Number(g.when.date.slice(0, 4))))].sort((a, b) => b - a).map((year) => {
        const inYear = games.filter((g) => g.when.date.startsWith(`${year}-`));
        const people = new Set(inYear.flatMap((g) => [...crewOf(g.match, referees).keys()]));
        return {
            year,
            games: inYear.length,
            asCentre: inYear.filter((g) => g.match.role === "referee").length,
            distanceM: Math.round(inYear.reduce((s, g) => s + (g.distanceM ?? 0), 0)),
            distanceGames: inYear.filter((g) => g.distanceM !== undefined).length,
            referees: people.size,
            venues: new Set(inYear.flatMap((g) => g.match.venueId ?? [])).size,
            feesAmount: inYear.reduce((s, g) => s + (g.match.fee && g.match.fee.currency === currency ? g.match.fee.amount : 0), 0),
        };
    });

    const countBy = <T>(list: Match[], key: (m: Match) => T | undefined) => {
        const out = new Map<T, number>();
        for (const m of list) {
            const k = key(m);
            if (k !== undefined) {
                out.set(k, (out.get(k) ?? 0) + 1);
            }
        }
        return out;
    };

    return {
        options: {
            years: [...new Set(all.map((m) => Number(localKickoff(m.kickoff!, m.timeZone).date.slice(0, 4))))].sort((a, b) => b - a),
            genders: (["male", "female", "coed"] as const).filter((g) => all.some((m) => m.gender === g)),
            competitions: [...countBy(all, (m) => m.competitionId && competitions.get(m.competitionId) ? m.competitionId : undefined)]
                .map(([id, n]) => { const c = competitions.get(id)!; return { id, name: c.name, ...(c.season ? { season: c.season } : {}), games: n }; })
                .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
            // Tags differing only in case are one, spelled as first seen.
            tags: [...all.flatMap((m) => m.tags ?? []).reduce((seen, t) => (seen.has(t.toLowerCase()) ? seen : seen.set(t.toLowerCase(), t)), new Map<string, string>()).values()]
                .sort((a, b) => a.localeCompare(b)),
            venues: [...countBy(all, (m) => m.venueId && venues.get(m.venueId) ? m.venueId : undefined)]
                .map(([id, n]) => ({ id, name: venues.get(id)!.name, games: n }))
                .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)),
        },
        games: {
            total: games.length,
            abandoned: games.filter((g) => g.match.status === "abandoned").length,
            ...(games.length ? { first: games[0].when.date, last: games.at(-1)!.when.date } : {}),
        },
        roles,
        distance: {
            totalM: Math.round(withDistance.reduce((s, g) => s + g.distanceM!, 0)),
            games: withDistance.length,
            tracked: withDistance.filter((g) => g.track?.distanceM !== undefined).length,
            // STAT-16: the one per-game distance, over every game with one, tracked or from the watch's report.
            ...(withDistance.length ? { averageM: average(withDistance.map((g) => g.distanceM!)) } : {}),
            byRole: (["referee", "assistant", "fourth"] as const).flatMap((role) => {
                const list = withDistance.filter((g) => roleGroup(g.match.role) === role).map((g) => g.distanceM!);
                return list.length ? [{ role, games: list.length, averageM: average(list)! }] : [];
            }),
            ...(byLength.length ? {
                longest: { ...ref(byLength[0].match), distanceM: byLength[0].distanceM! },
                shortest: { ...ref(byLength.at(-1)!.match), distanceM: byLength.at(-1)!.distanceM! },
            } : {}),
            overTime: withDistance.map((g) => ({ matchId: g.match.id, kickoff: g.match.kickoff!, distanceM: g.distanceM!, totalM: Math.round((running += g.distanceM!)) })),
        },
        months: [...months].map(([month, counts]) => ({ month, ...counts })),
        busiest: [...busiest].map(([key, n]) => {
            const [day, hour] = key.split(":").map(Number);
            return { day, hour, games: n };
        }).sort((a, b) => a.day - b.day || a.hour - b.hour),
        ageGroups: [...ageGroups].map(([ageGroup, counts]) => ({ ageGroup, ...counts })).sort(byAge),
        places: {
            venues: new Set([...places.values()].map((p) => p.venueId)).size,
            pitches: places.size,
            top: top([...places.values()], (p) => p.games, (p) => p.venue),
        },
        referees: { count: people.size, top: top([...people.values()], (p) => p.games, (p) => p.name) },
        weather: {
            games: weathered.length,
            rainy: weathered.filter((g) => g.weather!.precipitationMm >= 1).length,
            ...(weathered.length ? { averageTemperatureC: Math.round((weathered.reduce((s, g) => s + g.weather!.temperatureC, 0) / weathered.length) * 10) / 10 } : {}),
            ...(hottest ? { hottest: { ...ref(hottest.match), temperatureC: hottest.value } } : {}),
            ...(coldest ? { coldest: { ...ref(coldest.match), temperatureC: coldest.value } } : {}),
            ...(windiest ? { windiest: { ...ref(windiest.match), windGustKph: windiest.value } } : {}),
            temperaturesC: weathered.map((g) => g.weather!.temperatureC),
        },
        fees: {
            ...(currency ? { currency } : {}),
            games: feeGames.length,
            earnedAmount: sumFees(),
            paidAmount: sumFees(true),
            owedAmount: sumFees(false),
            otherCurrencies: [...others.values()],
            months: feeGames.length ? [...feeMonths].map(([month, amounts]) => ({ month, ...amounts })) : [],
            competitions: top([...feeCompetitions.values()], (c) => c.amount, (c) => c.name),
        },
        discipline: {
            ...discipline,
            ageGroups: [...disciplineAges.values()].sort(byAge),
            competitions: top([...disciplineCompetitions.values()], (c) => c.games, (c) => c.name),
            codes: top([...codes.values()], (c) => c.cautions + c.sendOffs, (c) => c.misconduct.code),
        },
        fitness: {
            games: tracked.map(({ match, track }) => ({
                matchId: match.id,
                kickoff: match.kickoff!,
                ...(track!.distanceM !== undefined ? { distanceM: track!.distanceM } : {}),
                ...(track!.avgBpm !== undefined ? { avgBpm: track!.avgBpm, maxBpm: track!.maxBpm } : {}),
                ...(track!.sprints !== undefined ? { sprints: track!.sprints, topSpeedMps: track!.topSpeedMps } : {}),
            })),
            ...(settings?.maxHeartRate ? { maxHeartRate: settings.maxHeartRate } : {}),
            ...(zones ? { zones } : {}),
            ...(bandTotals ? { speedBands: bandTotals, sprintKph: settings?.sprintKph ?? defaultSprintKph } : {}),
            ...(heatmaps.length ? { heatmaps } : {}),
        },
        addedTime: {
            periods: added.length,
            ...(added.length ? { averageSec: average(added.map((a) => a.sec)) } : {}),
            byPeriod: [...group(added.filter((a) => !a.extraTime), (a) => a.period)].sort(([a], [b]) => a - b)
                .map(([period, list]) => ({ period, periods: list.length, averageSec: average(list)! })),
            ageGroups: [...group(added, (a) => a.match.ageGroup)].map(([ageGroup, list]) => ({ ageGroup, periods: list.length, averageSec: average(list)! })).sort(byAge),
            competitions: top([...group(added, (a) => a.match.competitionId ?? "")].map(([id, list]) => ({
                ...(id ? { competitionId: id } : {}), name: competitionName(id || undefined), periods: list.length, averageSec: average(list)!,
            })), (c) => c.periods, (c) => c.name),
        },
        // Not for an API key that can't read match reports (KEY-3, STAT-4).
        ...(reportsRead ? { watches: watchesOf(games) } : {}),
        years,
    };
}

/** A CSV field: quoted when it needs to be, and never read as a formula by a spreadsheet. */
function csvField(value: string | number | boolean | undefined): string {
    if (value === undefined) {
        return "";
    }
    let text = String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(loaded: Awaited<ReturnType<typeof loadGames>>): string {
    const { games, venues, competitions } = loaded;
    const head = ["Date", "Kickoff", "Competition", "Home", "Away", "Score", "Role", "Venue", "Pitch", "Age group", "Gender", "Distance (m)", "Average heart rate",
        "Kickoff temperature (°C)", "Rain (mm)", "Cautions", "Send-offs", "Added time (s)", "Fee", "Currency", "Paid"];
    const lines: (string | number)[][] = [head];
    for (const { match, when, report, track, distanceM, weather } of games) {
        const venue = match.venueId ? venues.get(match.venueId) : undefined;
        const events = report?.events ?? [];
        const second = events.filter((e) => e.type === "secondCaution").length;
        const added = report?.outcome === "completed" ? report.periods.map((p) => addedTimeSec(match, p, report.events)).filter((s) => s !== undefined) : [];
        lines.push([
            when.date,
            `${String(when.hour).padStart(2, "0")}:${String(when.minute).padStart(2, "0")}`,
            match.competitionId ? competitions.get(match.competitionId)?.name ?? "" : "",
            match.home.name ?? "Home",
            match.away.name ?? "Away",
            report ? `${report.score.home}-${report.score.away}` : "",
            match.role ?? "",
            venue?.name ?? "",
            venue?.pitches.find((p) => p.id === match.pitchId)?.name ?? "",
            match.ageGroup ?? "",
            match.gender ?? "",
            distanceM === undefined ? "" : Math.round(distanceM),
            track?.avgBpm ?? "",
            weather?.temperatureC ?? "",
            weather?.precipitationMm ?? "",
            report ? events.filter((e) => e.type === "caution").length + second : "",
            report ? events.filter((e) => e.type === "sendOff" || e.type === "secondSinBin").length + second : "",
            added.length ? added.reduce((s, n) => s + n, 0) : "",
            match.fee?.amount ?? "",
            match.fee?.currency ?? "",
            match.fee ? (match.fee.paid ? "yes" : "no") : "",
        ]);
    }
    return lines.map((row) => row.map((v) => csvField(v)).join(",")).join("\r\n") + "\r\n";
}

/**
 * Stats for an API key whose scopes can't read venues, referees or competitions: the lists that
 * name them are left empty, while the counts stay (KEY-3).
 */
function withoutNames(stats: Stats, readable: ReadonlySet<CollectionName>): Stats {
    const venues = readable.has("venues");
    const competitions = readable.has("competitions");
    return {
        ...stats,
        options: { ...stats.options, venues: venues ? stats.options.venues : [], competitions: competitions ? stats.options.competitions : [] },
        places: { ...stats.places, top: venues ? stats.places.top : [] },
        referees: { ...stats.referees, top: readable.has("referees") ? stats.referees.top : [] },
        fees: { ...stats.fees, competitions: competitions ? stats.fees.competitions : [] },
        discipline: { ...stats.discipline, competitions: competitions ? stats.discipline.competitions : [] },
        addedTime: { ...stats.addedTime, competitions: competitions ? stats.addedTime.competitions : [] },
    };
}

export function statsApi(db: Db) {
    const api = new Hono<{ Variables: { userId: string; keyScopes?: string[] } }>();
    const parse = (query: Record<string, string>) => GamesQuery.safeParse(query);
    // What an API key can read; everything, signed in.
    const readableBy = (scopes: string[] | undefined) => (scopes ? new Set(readableCollections(scopes)) : undefined);

    api.get("/stats", async (c) => {
        const query = parse(c.req.query());
        if (!query.success) {
            return c.json({ error: "a filter isn't valid: from and to are dates (2026-01-31), gender male, female or coed, role referee, assistant or fourth, ids UUIDs" }, 400);
        }
        const { from, to, gender, competitionId, role, tag, venueId } = query.data;
        const filters = Object.fromEntries(Object.entries({ from, to, gender, competitionId, role, tag, venueId }).filter(([, v]) => v !== undefined));
        const readable = readableBy(c.var.keyScopes);
        const stats = buildStats(await loadGames(db, c.var.userId, filters, readable));
        return c.json(readable ? withoutNames(stats, readable) : stats);
    });

    api.get("/stats/games.csv", async (c) => {
        const query = parse(c.req.query());
        if (!query.success) {
            return c.json({ error: "a filter isn't valid" }, 400);
        }
        const readable = readableBy(c.var.keyScopes);
        const loaded = await loadGames(db, c.var.userId, query.data, readable);
        // The venue, pitch and competition columns stay empty for a key that can't read them.
        const csv = buildCsv({
            ...loaded,
            venues: !readable || readable.has("venues") ? loaded.venues : new Map(),
            competitions: !readable || readable.has("competitions") ? loaded.competitions : new Map(),
        });
        return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="lawfive-games.csv"' });
    });

    return api;
}
