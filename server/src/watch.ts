import { type ClockStyle, type Competition, Match, MatchFormat, type MatchWeather, MatchRecord, type Referee, type UserSettings, Venue, WatchFeeChange, type WatchMatch, WatchScreenChange, WatchPitchMarking, WatchTrackChunk, WatchUpload, misconductSchemes, nearestLayout, savedScreen, screenSetup, shortName } from "@lawfive/schema";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { deviceHeader, readDeviceHeader } from "./devices.ts";
import { saveRecord, toRecord, uniqueViolation } from "./records.ts";
import { assembleWatchTrack, unreadableChunk } from "./watchTrack.ts";
import type { Weather } from "./weather/service.ts";

// What a Garmin watch uses, shaped for it: watches have little memory (768 KB for the whole app),
// so they download a few matches already in the form they start a match from, and upload a match
// as they saved it; the server does the converting. WatchMatch and WatchUpload in schema/ describe both.
//
//   GET  /v1/watch/matches?limit=10   the next scheduled matches (at most 10), soonest first
//   POST /v1/watch/records            a finished match from the watch; stored as a match record,
//                                     linked to its planned match or, for a quick match, to a new one
//   POST /v1/watch/tracks             a chunk of the track the watch recorded during it (TRK-7)

const roleNames = { referee: "Referee", ar1: "AR1", ar2: "AR2", fourth: "4th official" } as const;

function colour(hex: string | undefined): number {
    return hex ? Number.parseInt(hex.slice(1), 16) : -1;
}

const conditionWords: Record<MatchWeather["condition"], string> = {
    clear: "sunny", partlyCloudy: "some sun", cloudy: "cloudy", fog: "fog", drizzle: "drizzle", rain: "rain", snow: "snow", storm: "storms",
};

/** The forecast in a few characters for the watch's match list, "54° rain" (WX-7). */
export function watchWeather(weather: MatchWeather, unit: UserSettings["temperatureUnit"]): string {
    const degrees = unit === "f" ? weather.temperatureC * 9 / 5 + 32 : weather.temperatureC;
    const words = weather.condition === "clear" && !weather.isDay ? "clear" : conditionWords[weather.condition];
    return `${Math.round(degrees)}° ${words}`;
}

/** "$25", "£30", "€40.50": a fee as the watch shows it. */
export function feeText(amount: number, currency: string): string {
    const cents = Math.round(amount * 100) % 100 !== 0;
    try {
        return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 }).format(amount);
    } catch {
        return `${amount} ${currency}`;
    }
}

const crewOrder = ["referee", "ar1", "ar2", "fourth"] as const;
/** Notes are shortened for the watch's memory. */
const watchNotesLength = 300;

/**
 * A match as the watch starts one (Settings.matchSetup's keys), plus what it shows in its list and
 * on the match's own screen (UI-19): the fee, the other officials and the notes. With the account's
 * match clock (TMR-11) when it has chosen one, for watch builds that still take it from the match,
 * and the codes for a card's reason (EVT-14): the competition's, else the account's.
 */
export function toWatchMatch(match: Match, venue?: Venue, competition?: Competition, weather?: string, referees = new Map<string, Referee>(), clock?: z.infer<typeof ClockStyle>, scheme = "ifab"): z.infer<typeof WatchMatch> {
    const f = match.format;
    const pitch = venue?.pitches.find((p) => p.id === match.pitchId);
    // SET-5: the short names the website and phones show: the typed ones, else from both names.
    const home = shortName(match, "home");
    const away = shortName(match, "away");
    return {
        id: match.id,
        kickoff: match.kickoff ? Math.floor(new Date(match.kickoff).getTime() / 1000) : null,
        title: `${home} v ${away}`,
        name: match.name ?? competition?.name ?? null,
        where: [venue?.name, pitch?.name].filter(Boolean).join(", ") || null,
        role: match.role ? roleNames[match.role] : null,
        weather: weather ?? null,
        fee: match.fee ? { text: feeText(match.fee.amount, match.fee.currency), paid: match.fee.paid } : null,
        crew: [...match.crew].sort((a, b) => crewOrder.indexOf(a.role) - crewOrder.indexOf(b.role)).flatMap((c) => {
            const name = (c.refereeId ? referees.get(c.refereeId)?.name : undefined) ?? c.name;
            return name ? [[roleNames[c.role], name] as [string, string]] : [];
        }),
        notes: match.notes ? (match.notes.length > watchNotesLength ? `${match.notes.slice(0, watchNotesLength - 1).trimEnd()}…` : match.notes) : null,
        home, away,
        homeName: match.home.name ?? "",
        awayName: match.away.name ?? "",
        homeColor: colour(match.home.colour),
        awayColor: colour(match.away.colour),
        numPeriods: f.periods,
        periodSec: f.periodSec,
        halftimeSec: f.breakSec,
        teamSize: f.teamSize,
        midBreak: f.halfwayBreak,
        breakLenSec: f.halfwayBreakSec,
        extraTime: f.extraTime,
        etPeriods: f.extraTimePeriods,
        etPeriodSec: f.extraTimePeriodSec,
        goldenGoal: f.extraTime && (f.goldenGoal ?? false),
        penalties: f.penalties,
        clockStyle: ({ up: 0, upEach: 1, down: 2 } as const)[clock ?? f.clock],
        // TMR-15: a stopping clock needs stoppage tracked, so it's sent on with it.
        trackStoppage: f.trackStoppage || (f.stoppingClock ?? false),
        stoppingClock: f.stoppingClock ?? false,
        stopForGoalsCards: f.stopForGoalsCards ?? true,
        breakStoppage: f.breakStoppage ?? true,
        goalScorers: f.goalScorers ?? true,
        goalTypes: f.goalTypes,
        // EVT-12: off for formats saved before sin bins.
        sinBins: f.sinBins ?? false,
        sinBinSec: f.sinBinSec ?? 600,
        misconductScheme: competition?.misconductScheme ?? scheme,
    };
}

/** A finished match as the watch saved it (Match.toDict and History.entryFor), with its planned match's id. */
type WatchUpload = z.infer<typeof WatchUpload>;

const sides = ["home", "away"] as const;
/** The reasons a watch abandons for, by the number it sends (EVT-11). */
const abandonReasons = ["weather", "lightning", "crowdTrouble", "notEnoughPlayers", "other"] as const;
const goalTypes: Record<string, "goal" | "ownGoal" | "penalty" | "directFreeKick" | undefined> = { G: undefined, GO: "ownGoal", GP: "penalty", GF: "directFreeKick" };
/**
 * EVT-14: the cards' reasons the watch sent beside the events, by the card's index: kept only when the code
 * is its scheme's for that kind of card (a caution's for Y, SB, SB2 and TY, also the second caution's code for
 * Y2; a send-off's for R and TR), so a code can't land on the wrong card or come from an unknown scheme.
 */
function cardReasons(upload: WatchUpload) {
    const scheme = upload.misconduct ? misconductSchemes[upload.misconduct.scheme] : undefined;
    const codes = new Map(scheme ? upload.misconduct!.codes : []);
    return (index: number, type: string): { misconduct?: { scheme: string; code: string } } => {
        const code = codes.get(index);
        if (!scheme || !code) {
            return {};
        }
        const sendOff = type === "R" || type === "TR";
        const allowed = sendOff ? scheme.sendOffs.some((c) => c.code === code)
            : scheme.cautions.some((c) => c.code === code) || (type === "Y2" && code === scheme.secondCaution);
        return allowed ? { misconduct: { scheme: scheme.id, code } } : {};
    };
}

/** A team official's role, by the number a watch sends in extra (EVT-15). */
const officialRoles = ["headCoach", "assistantCoach", "other"] as const;

/**
 * EVT-16: the length of the stoppage running when an injury was recorded in play: the one an injury starts
 * begins with it, and one already running began before it. The watch saves a stoppage when it ends, after
 * the injury. A second's slack, as each is rounded down to whole seconds.
 */
function stoppageAt(events: WatchUpload["events"], period0: number, seconds: number): number | undefined {
    const stoppage = events.find(([code, , period, start, , length]) => code === "S" && period === period0 && start <= seconds + 1 && start + (length ?? 0) >= seconds - 1);
    return stoppage ? Math.max(0, stoppage[5] ?? 0) : undefined;
}

/** TMR-13: the reasons a watch suspends for, numbered as abandonReasons; 3 (not enough players) isn't one. */
const suspendReasons: Record<number, "weather" | "lightning" | "crowdTrouble" | "other"> = { 0: "weather", 1: "lightning", 2: "crowdTrouble", 4: "other" };

/**
 * TMR-13: the stretches of each period play was suspended, from the watch's SU and RS pairs, on the clock of day
 * from the period's kickoff: the period's time where it stopped, less the clock's corrections before it (TMR-14,
 * which move the period's time but not the kickoff), plus the suspensions before it in the period.
 */
function suspensionsOf(events: WatchUpload["events"], stoppingClock = false): Map<number, { fromSec: number; lengthSec: number }[]> {
    const byPeriod = new Map<number, { fromSec: number; lengthSec: number }[]>();
    for (const [i, [code, , period0, seconds, , extra]] of events.entries()) {
        if (code !== "RS" || seconds < 0 || !extra || extra <= 0) {
            continue;
        }
        const earlier = events.slice(0, i);
        const corrected = earlier.reduce((sum, [c, , p, s, , x]) => sum + (c === "CK" && p === period0 && s >= 0 ? x ?? 0 : 0), 0);
        // TMR-15: a stopping clock stood still for the stoppages before it, which the clock of day didn't.
        const stopped = stoppingClock ? stoppedBefore(events, period0, seconds) : 0;
        const stretches = byPeriod.get(period0 + 1) ?? [];
        const before = stretches.reduce((sum, s) => sum + s.lengthSec, 0);
        stretches.push({ fromSec: Math.max(0, seconds - corrected + stopped + before), lengthSec: extra });
        byPeriod.set(period0 + 1, stretches);
    }
    return byPeriod;
}

/** TMR-15: how long a stopping clock stood still in a period before a time on it (the stoppages that began before it). */
function stoppedBefore(events: WatchUpload["events"], period0: number, seconds = Infinity): number {
    return events.reduce((sum, [c, , p, s, , x]) => sum + (c === "S" && p === period0 && s >= 0 && s < seconds ? Math.max(0, x ?? 0) : 0), 0);
}

/** The watch's times outside play (Match.mc SECONDS_*). */
const whenFor: Record<number, "beforeKickoff" | "break" | "afterFullTime" | "penalties"> = { [-1]: "beforeKickoff", [-2]: "break", [-3]: "afterFullTime", [-4]: "penalties" };

/** A UUID that's always the same for the same text, so re-uploading a match updates it. */
export function stableId(text: string): string {
    const h = createHash("sha1").update(`lawfive:${text}`).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const hex = h.subarray(0, 16).toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The match record (and, for a quick match, the match) for an upload, as schema data. */
/**
 * Which LawFive watch app sent a request, from its X-LawFive-Device header (VER-3): "wearos" or
 * "applewatch", or "garmin" for anything else, as Garmin's uploads may come through the phone app (APP-7).
 */
export function watchKind(header: string | undefined): "garmin" | "wearos" | "applewatch" {
    const kind = readDeviceHeader(header)?.kind;
    return kind === "wearos" || kind === "applewatch" ? kind : "garmin";
}

/**
 * Q-20: the format a planned match was played in, from what the watch ran: only what the upload says,
 * so an older watch that leaves a field out keeps the plan's.
 */
export function asPlayed(upload: WatchUpload): Partial<MatchFormat> {
    return {
        periods: upload.numPeriods,
        periodSec: upload.periodSec,
        breakSec: upload.halftimeSec,
        ...(upload.breakAtSec !== undefined ? { halfwayBreak: upload.breakAtSec >= 0 } : {}),
        ...(upload.breakLenSec !== undefined ? { halfwayBreakSec: upload.breakLenSec } : {}),
        ...(upload.extraTime !== undefined ? { extraTime: upload.extraTime } : {}),
        ...(upload.etPeriods !== undefined ? { extraTimePeriods: upload.etPeriods } : {}),
        ...(upload.etPeriodSec !== undefined ? { extraTimePeriodSec: upload.etPeriodSec } : {}),
        ...(upload.goldenGoal !== undefined ? { goldenGoal: upload.goldenGoal } : {}),
        ...(upload.penalties !== undefined ? { penalties: upload.penalties } : {}),
        // TMR-15: a stopping clock goes with stoppage tracked.
        ...(upload.stoppingClock !== undefined ? { stoppingClock: upload.stoppingClock, ...(upload.stoppingClock ? { trackStoppage: true } : {}) } : {}),
        ...(upload.stoppingClock && upload.stopForGoalsCards !== undefined ? { stopForGoalsCards: upload.stopForGoalsCards } : {}),
        ...(upload.sinBins !== undefined ? { sinBins: upload.sinBins } : {}),
        ...(upload.sinBins && upload.sinBinSec !== undefined ? { sinBinSec: Math.min(1200, Math.max(60, upload.sinBinSec)) } : {}),
    };
}

export function fromWatchUpload(upload: WatchUpload, userId: string, kind: ReturnType<typeof watchKind> = "garmin") {
    const events: z.input<typeof MatchRecord>["events"] = [];
    const reasonOf = cardReasons(upload);
    const playedSec = new Map<number, number>();
    for (const [index, [code, team, period0, seconds, player, extra]] of upload.events.entries()) {
        const side = team === 0 || team === 1 ? sides[team] : undefined;
        const timing = seconds >= 0
            ? { when: "play" as const, period: period0 + 1, periodSec: seconds }
            : { when: whenFor[seconds] ?? "play", ...(seconds === -4 ? {} : { period: period0 + 1 }) };
        const number = player !== null && player > 0 && player < 100 ? player : undefined;
        if (code in goalTypes && side) {
            events.push({ type: "goal", ...timing, team: side, ...(number ? { player: number } : {}), ...(goalTypes[code] ? { goalType: goalTypes[code] } : {}) });
        } else if ((code === "Y" || code === "Y2" || code === "R") && side) {
            const type = code === "Y" ? "caution" : code === "Y2" ? "secondCaution" : "sendOff";
            events.push({ type, ...timing, team: side, offender: { kind: "player", ...(number ? { number } : {}) }, ...reasonOf(index, code) });
        } else if ((code === "SB" || code === "SB2") && side) {
            // EVT-12: a sin bin, with its length in extra; a second for the same number is a send-off.
            const lengthSec = Math.max(0, extra ?? 600);
            events.push({ type: code === "SB" ? "sinBin" : "secondSinBin", ...timing, team: side, offender: { kind: "player", ...(number ? { number } : {}) }, lengthSec, ...reasonOf(index, code) });
        } else if ((code === "TY" || code === "TR") && side) {
            // EVT-15: a team official's card, with the role in extra.
            events.push({ type: code === "TY" ? "caution" : "sendOff", ...timing, team: side, offender: { kind: "teamOfficial", role: officialRoles[extra ?? -1] ?? "other" }, ...reasonOf(index, code) });
        } else if (code === "I" && side) {
            // EVT-16: how long play was stopped is the stoppage running at it, when stoppage was tracked.
            const lengthSec = seconds >= 0 ? stoppageAt(upload.events, period0, seconds) : undefined;
            events.push({ type: "injury", ...timing, team: side, ...(number ? { player: number } : {}), ...(lengthSec !== undefined ? { lengthSec } : {}) });
        } else if ((code === "CK" || code === "CA") && seconds >= 0 && extra) {
            // TMR-14: a clock corrected during play, by the change in extra.
            const changeSec = Math.max(-6000, Math.min(6000, extra));
            events.push({ type: "clockAdjusted", ...timing, clock: code === "CK" ? "match" : "added", changeSec });
        } else if (code === "S") {
            events.push({ type: "stoppage", ...timing, lengthSec: Math.max(0, extra ?? 0) });
        } else if (code === "E") {
            events.push({ type: "periodEnd", ...timing });
            if (seconds >= 0) {
                playedSec.set(period0 + 1, seconds);
            }
        } else if (code === "SU" && seconds >= 0) {
            // TMR-13: its length is the RS that follows it in the period, if play resumed (none when abandoned while suspended).
            const resumed = upload.events.slice(index + 1).find(([c, , p]) => (c === "RS" || c === "SU") && p === period0);
            const lengthSec = resumed?.[0] === "RS" && (resumed[5] ?? 0) >= 0 ? resumed[5] ?? 0 : undefined;
            events.push({ type: "suspension", ...timing, reason: suspendReasons[extra ?? -1] ?? "other", ...(lengthSec !== undefined ? { lengthSec } : {}) });
        } else if (code === "A") {
            // EVT-11: the score at that point is kept.
            events.push({ type: "abandonment", ...timing, reason: abandonReasons[extra ?? -1] ?? "other" });
        } else if ((code === "PG" || code === "PM") && side) {
            events.push({ type: "penaltyKick", when: "penalties", team: side, scored: code === "PG" });
        }
    }
    // When each period kicked off, for the track's figures (TRK-3).
    const startedAt = (period: number) => {
        const sec = upload.startedAt?.[period - 1];
        return sec ? { startedAt: new Date(sec * 1000).toISOString() } : {};
    };
    // PRE-8: the watch keeps where home attacked; the record says where the kickoff team did.
    const kickoffTeam = upload.kickoff === 0 || upload.kickoff === 1 ? sides[upload.kickoff] : undefined;
    const homeDeg = typeof upload.homeHeading === "number" ? ((upload.homeHeading * 180 / Math.PI) % 360 + 360) % 360 : undefined;
    const bearing = homeDeg === undefined ? undefined : Math.round(((kickoffTeam === "away" ? homeDeg + 180 : homeDeg) % 360) * 10) / 10;
    const kickoffDirection = kickoffTeam && bearing !== undefined ? { kickoffDirection: { team: kickoffTeam, bearingDeg: bearing % 360 } } : {};
    // DIAG-1: what fits the record is kept; a reading it can't use is left out.
    const d = upload.diagnostics;
    const battery = (d?.battery ?? []).filter(([period, at, percent]) => period >= 0 && (at === 0 || at === 1) && percent >= 0 && percent <= 100)
        .map(([period, at, percent]) => ({ period: period + 1, at: at === 0 ? "kickoff" as const : "end" as const, percent }));
    const { battery: _, ...others } = d ?? {};
    const diagnostics = d ? { diagnostics: { ...others, ...(battery.length ? { battery } : {}) } } : {};
    const abandoned = upload.events.some(([code]) => code === "A");
    const stopping = upload.stoppingClock === true;
    const suspended = suspensionsOf(upload.events, stopping);
    const record = {
        matchId: upload.matchId ?? stableId(`${userId}:match:${upload.created}`),
        device: upload.device ? `${kind}:${upload.device}` : kind,
        outcome: abandoned ? "abandoned" as const : "completed" as const,
        periods: [...playedSec].sort(([a], [b]) => a - b).map(([period, sec]) => ({
            period, extraTime: period > upload.numPeriods, ...startedAt(period), playedSec: sec,
            // TMR-15: the period ran for its clock's time and the time the clock stood still.
            ...(stopping ? { stoppedSec: stoppedBefore(upload.events, period - 1) } : {}),
            ...(suspended.get(period)?.length ? { suspended: suspended.get(period)!.slice(0, 20) } : {}),
        })),
        score: { home: upload.score[0], away: upload.score[1] },
        ...(upload.pens ? { penalties: { home: upload.pens[0], away: upload.pens[1] } } : {}),
        ...(upload.golden ? { goldenGoal: true } : {}),
        ...(stopping ? { stoppingClock: true } : {}),
        ...(upload.distanceM ? { distanceM: Math.round(upload.distanceM) } : {}),
        ...kickoffDirection,
        events,
        ...diagnostics,
    };
    const hex = (n: number | undefined) => (n !== undefined && n >= 0 ? `#${n.toString(16).padStart(6, "0").toUpperCase()}` : undefined);
    // SET-5: the watch's short name is kept only when it isn't the one its names give anyway (HOM with
    // no name, STR for Strikers), so the match's short names follow a name typed in later.
    const names = { home: { name: upload.homeName || undefined }, away: { name: upload.awayName || undefined } };
    const team = (side: "home" | "away", short: string, colour: number | undefined) => ({
        ...(names[side].name ? { name: names[side].name } : {}), ...(short && short !== shortName(names, side) ? { alias: short } : {}), ...(hex(colour) ? { colour: hex(colour) } : {}),
    });
    // A quick match started on the watch has no planned match: make one from what the watch knew.
    const quickMatch = upload.matchId ? undefined : {
        status: abandoned ? "abandoned" as const : "played" as const,
        kickoff: new Date(upload.created * 1000).toISOString(),
        home: team("home", upload.home, upload.homeColor),
        away: team("away", upload.away, upload.awayColor),
        crew: [],
        format: {
            periods: Math.min(4, Math.max(2, upload.numPeriods)),
            periodSec: upload.periodSec,
            breakSec: upload.halftimeSec,
            halfwayBreak: (upload.breakAtSec ?? -1) >= 0,
            halfwayBreakSec: upload.breakLenSec ?? 120,
            teamSize: upload.teamSize ?? 11,
            clock: (["up", "upEach", "down"] as const)[upload.clockStyle ?? 0] ?? "up",
            trackStoppage: (upload.trackStoppage ?? false) || stopping,
            ...(stopping ? { stoppingClock: true, stopForGoalsCards: upload.stopForGoalsCards ?? true } : {}),
            // Watches from before TMR-12 didn't add the break.
            breakStoppage: upload.breakStoppage ?? false,
            // Watches from before EVT-10 always asked.
            goalScorers: upload.goalScorers ?? true,
            goalTypes: upload.goalTypes ?? false,
            extraTime: upload.extraTime ?? false,
            extraTimePeriods: upload.etPeriods ?? 2,
            extraTimePeriodSec: upload.etPeriodSec ?? 900,
            goldenGoal: upload.goldenGoal ?? false,
            penalties: upload.penalties ?? false,
            sinBins: upload.sinBins ?? false,
            sinBinSec: Math.min(1200, Math.max(60, upload.sinBinSec ?? 600)),
        },
    };
    return { recordId: stableId(`${userId}:record:${upload.created}`), record, quickMatch };
}

/** Schema data without the sync fields, checked against the schema. */
function checked<T extends z.ZodObject>(schema: T, id: string, data: object): Record<string, unknown> {
    const { id: _, version, updatedAt, ...rest } = schema.parse({ ...data, id, version: 1, updatedAt: new Date().toISOString() }) as Record<string, unknown>;
    return rest;
}

/**
 * SYNC-14: what a watch shows of a match, as a fingerprint, leaving out its forecast and the
 * account's match clock and misconduct codes (EVT-14), which change without the match changing.
 */
export function watchFingerprint(match: z.infer<typeof WatchMatch>): string {
    const { weather: _weather, clockStyle: _clock, misconductScheme: _scheme, ...shown } = match;
    return createHash("sha256").update(JSON.stringify(shown)).digest("hex").slice(0, 32);
}

/** The venues, competitions and referees matches name, for making their watch form. */
async function relatedTo(db: Db, userId: string, matches: Match[]) {
    const { records } = tables;
    const related = [...new Set(matches.flatMap((m) => [m.venueId, m.competitionId, ...m.crew.map((c) => c.refereeId)]).filter((x): x is string => !!x))];
    const lookups = related.length
        ? await db.select().from(records).where(and(eq(records.userId, userId), inArray(records.id, related)))
        : [];
    const byId = new Map(lookups.map((r) => [r.id, toRecord(r)]));
    const referees = new Map(lookups.filter((r) => r.type === "referee").map((r) => [r.id, toRecord(r) as Referee]));
    return (m: Match, weather?: string, clock?: z.infer<typeof ClockStyle>, scheme?: string) => toWatchMatch(m,
        m.venueId ? byId.get(m.venueId) as Venue | undefined : undefined,
        m.competitionId ? byId.get(m.competitionId) as Competition | undefined : undefined,
        weather, referees, clock, scheme);
}

/** SYNC-14: a watch's download replaces what it had, so its matches are now these (Sync.mc keeps the list it's given). */
async function noteDownload(db: Db, userId: string, sessionId: string, matches: z.infer<typeof WatchMatch>[], now = new Date()) {
    const { watchCopy } = tables;
    await db.transaction(async (tx) => {
        const before = new Map((await tx.select().from(watchCopy).where(eq(watchCopy.sessionId, sessionId))).map((r) => [r.matchId, r]));
        await tx.delete(watchCopy).where(eq(watchCopy.sessionId, sessionId));
        if (matches.length) {
            await tx.insert(watchCopy).values(matches.map((m) => {
                const fingerprint = watchFingerprint(m);
                const had = before.get(m.id);
                return { sessionId, userId, matchId: m.id, fingerprint, since: had?.fingerprint === fingerprint ? had.since : now, syncedAt: now };
            })).onConflictDoNothing();
        }
    });
}

export function watchApi(db: Db, weather?: Weather, version?: string) {
    const api = new Hono<{ Variables: { userId: string; sessionId?: string; watchLink?: boolean } }>();
    const { records } = tables;

    api.get("/watch/matches", async (c) => {
        const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 10) || 10, 1), 10);
        const userId = c.var.userId;
        // Matches from three hours ago on, so one that's about to start (or running late) is still there.
        const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
        // Compared as times, not text: kickoffs carry their own UTC offsets.
        const kickoff = sql`(${records.data}->>'kickoff')::timestamptz`;
        const rows = await db.select().from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "match"), sql`${records.deletedAt} is null`,
                sql`${records.data}->>'status' = 'scheduled'`, sql`${kickoff} >= ${since.toISOString()}::timestamptz`))
            .orderBy(asc(kickoff))
            .limit(limit);
        const matches = rows.map((r) => toRecord(r) as Match);
        const watchForm = await relatedTo(db, userId, matches);
        const forecasts = new Map<string, string>();
        const [settings] = await db.select().from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "settings"), sql`${records.deletedAt} is null`));
        if (weather && matches.length) {
            const unit = (settings?.data.temperatureUnit as UserSettings["temperatureUnit"] | undefined) ?? "c";
            for (const w of await weather.forUser(userId, since, new Date(Date.now() + 17 * 86_400_000))) {
                forecasts.set(w.matchId, watchWeather(w, unit));
            }
        }
        const saved = settings?.data.watchScreen as UserSettings["watchScreen"];
        const screen = saved && screenSetup(saved);
        // EVT-14: the account's codes, for a card's reason; a planned match carries its competition's.
        const scheme = (settings?.data.misconductScheme as string | undefined) ?? "ifab";
        const sent = matches.map((m) => watchForm(m, forecasts.get(m.id), screen?.mainClock, scheme));
        // SYNC-14: a watch's link asking, itself or through the phone app; not the phone fetching ahead.
        if (c.var.watchLink && c.var.sessionId && c.req.query("prefetch") !== "true") {
            await noteDownload(db, userId, c.var.sessionId, sent);
        }
        return c.json({
            matches: sent,
            // VER-3: for the watch's About screen.
            ...(version ? { serverVersion: version } : {}),
            // UI-24: in the form the watch sends it, as it has no way to read a timestamp's text; with
            // the nearest old layout for builds from before UI-21's choices.
            ...(saved && screen ? { screen: { layout: nearestLayout(screen), ...screen, at: Math.floor(Date.parse(saved.changedAt) / 1000) } } : {}),
            // INP-10: how swipes open the team controls on Garmin and Apple watches, once it's set.
            ...(settings?.data.teamSwipes ? { teamSwipes: settings.data.teamSwipes as UserSettings["teamSwipes"] } : {}),
            misconductScheme: scheme,
        });
    });

    // UI-24: Settings > Match screen on the watch, sent at its next sync. The latest change wins,
    // here as on the website and the phones.
    api.post("/watch/screen", async (c) => {
        const body = WatchScreenChange.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid match screen", issues: body.error.issues }, 400);
        }
        const [row] = await db.select().from(records)
            .where(and(eq(records.userId, c.var.userId), eq(records.type, "settings"), sql`${records.deletedAt} is null`));
        const settings = row && toRecord(row) as UserSettings & { deletedAt?: string };
        const changedAt = new Date(body.data.at * 1000).toISOString();
        if (!settings || (settings.watchScreen && Date.parse(settings.watchScreen.changedAt) >= body.data.at * 1000)) {
            return c.json({ applied: false });
        }
        const { id, version: _version, updatedAt, deletedAt, ...data } = settings;
        // A build from before UI-21's choices sends only a layout and second clock: how the match and
        // break clocks count stay as the account had them, or as those builds count when it had none.
        const { at: _at, ...sent } = body.data;
        const kept = settings.watchScreen ? screenSetup(settings.watchScreen) : { mainClock: "up" as const, breakClock: "down" as const };
        const setup = screenSetup(sent.clocks ? { ...sent, changedAt } : { ...sent, mainClock: kept.mainClock, breakClock: kept.breakClock, changedAt });
        await saveRecord(db, c.var.userId, "settings", id, { ...data, watchScreen: savedScreen(setup, changedAt) }, "any");
        return c.json({ applied: true });
    });

    // SYNC-11: the Paid toggle on the watch's match screen, sent at its next sync. Only whether the
    // fee is paid changes, and not if the match was changed after the toggle (the latest change wins).
    api.post("/watch/fee", async (c) => {
        const body = WatchFeeChange.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid fee change", issues: body.error.issues }, 400);
        }
        const userId = c.var.userId;
        const [row] = await db.select().from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "match"), eq(records.id, body.data.matchId), sql`${records.deletedAt} is null`));
        const match = row && toRecord(row) as Match;
        if (!match?.fee) {
            return c.json({ error: "no such match, or it has no fee" }, 404);
        }
        if (row.updatedAt.getTime() > body.data.at * 1000 || match.fee.paid === body.data.paid) {
            return c.json({ paid: match.fee.paid, applied: match.fee.paid === body.data.paid });
        }
        const { id, version, updatedAt, deletedAt, ...data } = match as Match & { deletedAt?: string };
        await saveRecord(db, userId, "match", match.id, { ...data, fee: { ...match.fee, paid: body.data.paid } }, "any");
        return c.json({ paid: body.data.paid, applied: true });
    });

    // SYNC-12: pitch corners walked on the watch (TRK-13), kept with the match and, when it has a
    // venue's pitch, with that pitch for its matches from then on.
    api.post("/watch/pitch", async (c) => {
        const body = WatchPitchMarking.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success || (!body.data.matchId && !body.data.created)) {
            return c.json({ error: "invalid pitch corners", ...(body.success ? {} : { issues: body.error.issues }) }, 400);
        }
        const userId = c.var.userId;
        const matchId = body.data.matchId ?? stableId(`${userId}:match:${body.data.created}`);
        const [row] = await db.select().from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "match"), eq(records.id, matchId), sql`${records.deletedAt} is null`));
        if (!row) {
            return c.json({ error: "no such match" }, 404);
        }
        const marking = { corners: body.data.corners.map(([lat, lon]) => ({ lat: lat / 1e6, lon: lon / 1e6 })), at: new Date(body.data.at * 1000).toISOString() };
        const { id, version, updatedAt, deletedAt, ...match } = toRecord(row) as Match & { deletedAt?: string };
        await saveRecord(db, userId, "match", id, { ...match, pitchMarking: marking }, "any");
        const [venueRow] = match.venueId && match.pitchId ? await db.select().from(records)
            .where(and(eq(records.userId, userId), eq(records.type, "venue"), eq(records.id, match.venueId), sql`${records.deletedAt} is null`)) : [];
        const venue = venueRow && toRecord(venueRow) as Venue & { deletedAt?: string };
        const pitch = venue?.pitches.find((p) => p.id === match.pitchId);
        if (venue && pitch) {
            // A marking again for the same match replaces its earlier one; the latest 20 are kept.
            const markings = [...(pitch.markings ?? []).filter((m) => m.at !== (match.pitchMarking?.at ?? "")), marking]
                .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-20);
            const { id: venueId, version: _v, updatedAt: _u, deletedAt: _d, ...rest } = venue;
            await saveRecord(db, userId, "venue", venueId, { ...rest, pitches: venue.pitches.map((p) => (p.id === pitch.id ? { ...p, markings } : p)) }, "any");
        }
        return c.json({ ok: true as const, pitch: Boolean(venue && pitch) });
    });

    api.post("/watch/records", async (c) => {
        const body = WatchUpload.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid upload", issues: body.error.issues }, 400);
        }
        const userId = c.var.userId;
        const { recordId, record, quickMatch } = fromWatchUpload(body.data, userId, watchKind(c.req.header(deviceHeader)));
        // RES-4: a result the referee has corrected since stays as they left it; the watch is told
        // it's saved, so it stops sending it. So does one deleted since, with its match or on its own
        // (RES-8): sent again, it doesn't come back, nor bring its match back.
        const [kept] = await db.select().from(records).where(and(eq(records.userId, userId), eq(records.id, recordId), eq(records.type, "matchRecord")));
        if (kept && (kept.deletedAt || (kept.data as MatchRecord).editedAt)) {
            return c.json({ recordId, matchId: (kept.data as MatchRecord).matchId ?? record.matchId }, 200);
        }
        try {
            if (quickMatch) {
                await saveRecord(db, userId, "match", record.matchId, checked(Match, record.matchId, quickMatch), "any");
            } else {
                // The planned match has now been played, in the format the watch played it in (Q-20): what
                // was played is what happened, so its periods are named from it everywhere. A format the
                // schema can't hold (a watch's single period) leaves the plan's. A match deleted before its
                // first result arrived comes back played, so a result is never kept without its match (RES-8).
                const [planned] = await db.select().from(records).where(and(eq(records.userId, userId), eq(records.id, record.matchId)));
                if (planned && planned.type === "match" && (planned.data.status === "scheduled" || planned.deletedAt)) {
                    const played = MatchFormat.safeParse({ ...(planned.data as Match).format, ...asPlayed(body.data) });
                    await saveRecord(db, userId, "match", planned.id, {
                        ...planned.data,
                        status: record.outcome === "abandoned" ? "abandoned" : "played",
                        ...(played.success ? { format: played.data } : {}),
                    }, "any");
                }
            }
            const saved = await saveRecord(db, userId, "matchRecord", recordId, checked(MatchRecord, recordId, record), "any");
            if (saved.status === 409) {
                return c.json({ error: saved.error }, 409);
            }
            // TRK-7: its track may have arrived first.
            await assembleWatchTrack(db, userId, body.data.created, recordId);
            return c.json({ recordId, matchId: record.matchId }, saved.status);
        } catch (error) {
            if (uniqueViolation(error)) {
                return c.json({ error: "this would duplicate another record" }, 409);
            }
            throw error;
        }
    });

    api.post("/watch/tracks", async (c) => {
        const body = WatchTrackChunk.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid track chunk", issues: body.error.issues }, 400);
        }
        const chunk = body.data;
        const problem = unreadableChunk(chunk.data);
        if (problem) {
            return c.json({ error: "invalid track chunk", issues: [{ code: "custom", path: ["data"], message: problem }] }, 400);
        }
        const userId = c.var.userId;
        const { watchTrackChunk } = tables;
        // The watch app with the model, "wearos:SM-R860", as the record has it.
        const device = chunk.device ? `${watchKind(c.req.header(deviceHeader))}:${chunk.device}` : null;
        const row = { userId, created: chunk.created, index: chunk.index, count: chunk.count, start: chunk.start, device, data: chunk.data, receivedAt: new Date() };
        await db.insert(watchTrackChunk).values(row).onConflictDoUpdate({
            target: [watchTrackChunk.userId, watchTrackChunk.created, watchTrackChunk.index],
            set: { count: row.count, start: row.start, device: row.device, data: row.data, receivedAt: row.receivedAt },
        });
        return c.json(await assembleWatchTrack(db, userId, chunk.created, stableId(`${userId}:record:${chunk.created}`)), 200);
    });

    return api;
}

/** SYNC-14: GET /v1/devices/matches, which matches are on which linked watch, for the account's own apps. */
export function watchCopiesApi(db: Db) {
    const api = new Hono<{ Variables: { userId: string } }>();
    api.get("/devices/matches", async (c) => {
        const userId = c.var.userId;
        const { watchCopy, session, device, records } = tables;
        const copies = await db.select({ copy: watchCopy, kind: device.kind, name: device.name }).from(watchCopy)
            .innerJoin(session, eq(session.id, watchCopy.sessionId))
            .leftJoin(device, eq(device.sessionId, watchCopy.sessionId))
            .where(and(eq(watchCopy.userId, userId), gt(session.expiresAt, new Date())));
        const ids = [...new Set(copies.map((r) => r.copy.matchId))];
        const rows = ids.length
            ? await db.select().from(records).where(and(eq(records.userId, userId), eq(records.type, "match"), inArray(records.id, ids), isNull(records.deletedAt)))
            : [];
        const matches = new Map(rows.map((r) => [r.id, toRecord(r) as Match]));
        const watchForm = await relatedTo(db, userId, [...matches.values()]);
        const now = new Map([...matches.values()].map((m) => [m.id, watchFingerprint(watchForm(m))]));
        const list = copies.filter((r) => matches.has(r.copy.matchId)).map(({ copy, kind, name }) => ({
            matchId: copy.matchId,
            deviceId: copy.sessionId,
            kind: kind ?? "watch",
            name: name ?? "Watch",
            since: copy.since.toISOString(),
            syncedAt: copy.syncedAt.toISOString(),
            upToDate: matches.get(copy.matchId)!.status === "scheduled" && now.get(copy.matchId) === copy.fingerprint,
        })).sort((a, b) => b.syncedAt.localeCompare(a.syncedAt) || a.matchId.localeCompare(b.matchId));
        return c.json({ matches: list });
    });
    return api;
}
