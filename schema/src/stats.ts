import { z } from "zod";
import { Id, LocalDate, Role, Timestamp } from "./common.ts";
import { MisconductCode } from "./misconduct.ts";
import type { Event } from "./matchRecord.ts";
import { Gender, type Match } from "./records.ts";
import { SpeedBand } from "./track.ts";

// Stats on the matches a user has refereed (STAT-1 to STAT-12), worked out by the server from
// their matches, match reports, tracks and kept weather (GET /v1/stats), so every app shows the
// same. Games are matches played or abandoned; everything follows the filters in the query, and
// gameMatches decides which games those are, for the stats and for the match list they link to.

/** The role groups the charts use: AR1 and AR2 together. */
export const RoleGroup = z.enum(["referee", "assistant", "fourth", "notSet"]);

export const StatsQuery = z.object({
    from: LocalDate.optional().describe("The first day, in each match's own time zone; none for the first game."),
    to: LocalDate.optional().describe("The last day, inclusive; none for today and on."),
    gender: Gender.optional(),
    competitionId: Id.optional(),
    role: RoleGroup.exclude(["notSet"]).optional().describe("Your role: referee, assistant (AR1 or AR2) or fourth."),
    tag: z.string().max(30).optional().describe("Games with this tag (ignoring case)."),
    venueId: Id.optional(),
});

/** The stats filters, narrowed to one slice of a chart (STAT-11): the games behind a bar or column. */
export const GamesQuery = StatsQuery.extend({
    pitchId: z.union([Id, z.literal("none")]).optional().describe("At this pitch of the venue, or none for games at the venue without a pitch."),
    refereeId: Id.optional().describe("With this saved referee on the crew."),
    refereeName: z.string().max(100).optional().describe("With this name typed in on the crew (ignoring case)."),
    ageGroup: z.string().max(20).optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Kicking off in this month, 2026-04, locally."),
});

export type GamesQuery = z.infer<typeof GamesQuery>;

const count = z.int().nonnegative();

/** A game a figure points at, to link to it. */
const GameRef = z.object({
    matchId: Id,
    kickoff: Timestamp,
    title: z.string().describe("Home v Away, or the match's name."),
    role: Role.optional(),
});

const byRole = { referee: count, assistant: count, fourth: count, notSet: count };
const byGender = { male: count, female: count, coed: count, notSet: count };

export const Stats = z
    .object({
        options: z.object({
            years: z.array(z.int()).describe("Years with games, newest first, for the When filter."),
            genders: z.array(Gender).describe("Genders your games have."),
            competitions: z.array(z.object({ id: Id, name: z.string(), season: z.string().optional(), games: count })).describe("Competitions with games, most games first."),
            tags: z.array(z.string()).describe("Tags on your games, alphabetically."),
            venues: z.array(z.object({ id: Id, name: z.string(), games: count })).describe("Venues with games, most games first."),
        }).describe("What the filters can choose from: from all your games, whatever is filtered."),
        games: z.object({
            total: count,
            abandoned: count,
            first: LocalDate.optional(),
            last: LocalDate.optional(),
        }),
        roles: z.object({ referee: count, ar1: count, ar2: count, fourth: count, notSet: count }),
        distance: z.object({
            totalM: z.number().nonnegative(),
            games: count.describe("Games with a distance."),
            tracked: count.describe("Of those, games whose distance comes from a track."),
            averageM: z.number().nonnegative().optional().describe("A game's distance (STAT-16): totalM over games, to the meter; the one per-game distance every page shows. Absent without distances."),
            byRole: z.array(z.object({ role: RoleGroup.exclude(["notSet"]), games: count, averageM: z.number().nonnegative() })),
            longest: GameRef.extend({ distanceM: z.number() }).optional(),
            shortest: GameRef.extend({ distanceM: z.number() }).optional(),
            overTime: z.array(z.object({ matchId: Id, kickoff: Timestamp, distanceM: z.number(), totalM: z.number() })).describe("Each game with a distance, oldest first, with the running total."),
        }),
        months: z.array(z.object({ month: z.string().describe("2026-04"), ...byRole })).describe("Every month from the first game to the last, by role."),
        busiest: z.array(z.object({
            day: z.int().min(0).max(6).describe("0 is Monday."),
            hour: z.int().min(0).max(23).describe("Kickoff hour, local time."),
            games: count,
        })).describe("Only the day and hour pairs with games."),
        ageGroups: z.array(z.object({ ageGroup: z.string(), ...byGender })).describe("Youngest first; games without an age group are left out."),
        places: z.object({
            venues: count,
            pitches: count.describe("Distinct pitches, counting a venue as one when a match has no pitch."),
            top: z.array(z.object({ venueId: Id, pitchId: Id.optional(), venue: z.string(), pitch: z.string().optional(), games: count })).describe("Up to ten, most games first."),
        }),
        referees: z.object({
            count: count.describe("Distinct people on your crews: saved referees, and names typed in."),
            top: z.array(z.object({ refereeId: Id.optional(), name: z.string(), games: count })).describe("Up to ten, most games first."),
        }),
        weather: z.object({
            games: count.describe("Games with weather."),
            rainy: count.describe("1 mm of rain or more from an hour before kickoff to the end."),
            averageTemperatureC: z.number().optional().describe("At kickoff."),
            hottest: GameRef.extend({ temperatureC: z.number() }).optional(),
            coldest: GameRef.extend({ temperatureC: z.number() }).optional(),
            windiest: GameRef.extend({ windGustKph: z.number() }).optional(),
            temperaturesC: z.array(z.number()).describe("Each game's kickoff temperature, for apps to put into bands in their unit."),
        }),
        fees: z.object({
            currency: z.string().optional().describe("The currency the amounts are in: the Settings one."),
            games: count.describe("Games with a fee in that currency."),
            earnedAmount: z.number().nonnegative(),
            paidAmount: z.number().nonnegative(),
            owedAmount: z.number().nonnegative(),
            otherCurrencies: z.array(z.object({ currency: z.string(), games: count, amount: z.number() })).describe("Fees in other currencies, not in the figures above."),
            months: z.array(z.object({ month: z.string(), paidAmount: z.number(), owedAmount: z.number() })).describe("Every month from the first game to the last."),
            competitions: z.array(z.object({ competitionId: Id.optional(), name: z.string(), games: count, amount: z.number() })).describe("Up to ten, most earned first; games without a competition as one."),
        }),
        discipline: z.object({
            games: count.describe("Games with a match report, which the figures come from."),
            cautions: count.describe("Yellow cards: cautions and second cautions."),
            sendOffs: count.describe("Red cards: send-offs, second cautions and second sin bins (EVT-12)."),
            secondCautions: count,
            sinBins: count.optional().describe("Temporary dismissals (EVT-12), second sin bins included; missing from servers before them."),
            goals: count,
            ageGroups: z.array(z.object({ ageGroup: z.string(), games: count, cautions: count, sendOffs: count })).describe("Youngest first."),
            competitions: z.array(z.object({ competitionId: Id.optional(), name: z.string(), games: count, cautions: count, sendOffs: count })).describe("Up to ten, most games first."),
            codes: z.array(z.object({ misconduct: MisconductCode, cautions: count, sendOffs: count })).describe("Up to ten, most used first."),
        }),
        fitness: z.object({
            games: z.array(z.object({
                matchId: Id,
                kickoff: Timestamp,
                distanceM: z.number().optional(),
                avgBpm: z.int().optional(),
                maxBpm: z.int().optional(),
                sprints: count.optional(),
                topSpeedMps: z.number().optional(),
            })).describe("Games with a track, oldest first, with the track's figures (TRK-3)."),
            maxHeartRate: z.int().optional().describe("From Settings; zones only with it."),
            zones: z.array(z.object({ zone: z.int().min(1).max(5), fromBpm: z.int(), sec: z.number().nonnegative() })).optional(),
            speedBands: z.array(z.object({ band: SpeedBand, sec: z.number().nonnegative(), distanceM: z.number().nonnegative() })).optional().describe("Time and distance in each speed band across the games with GPS, slowest first (TRK-9)."),
            sprintKph: z.number().optional().describe("The sprint speed the bands start from (Settings, TRK-11)."),
            heatmaps: z.array(z.object({
                role: z.enum(["referee", "assistant"]).describe("Games as referee (and games with no role), or as an assistant; a fourth official's have none."),
                cols: z.int().positive(),
                rows: z.int().positive(),
                cells: z.array(z.number().nonnegative()).describe("Seconds in each cell, row by row from the top of the drawing (the far touchline), left to right."),
                games: count.describe("Games in it: those with GPS whose pitch is known or could be found."),
            })).optional().describe("Where you spent the periods across the games, one heatmap a role, on a grid over a pitch drawing (its margin included). A referee's games are turned so the first period's kickoff team attacks left to right when the kickoff direction is known; an assistant's so their touchline is at the bottom (TRK-9)"),
        }),
        addedTime: z.object({
            periods: count.describe("Periods counted: of completed games, at most 15 minutes over."),
            averageSec: z.number().nonnegative().optional(),
            byPeriod: z.array(z.object({ period: z.int().min(1), periods: count, averageSec: z.number().nonnegative() })).describe("Regular periods: first half, second half, or each quarter."),
            ageGroups: z.array(z.object({ ageGroup: z.string(), periods: count, averageSec: z.number().nonnegative() })),
            competitions: z.array(z.object({ competitionId: Id.optional(), name: z.string(), periods: count, averageSec: z.number().nonnegative() })).describe("Up to ten, most periods first."),
        }),
        watches: z.object({
            games: count.describe("Games with a match report from a watch that said which watch it was."),
            models: z.array(z.object({
                device: z.string().describe("As the watch reported it, for example garmin:006-B3703-00."),
                name: z.string().describe("As people know it (deviceName): Garmin Venu 2, Galaxy Watch4, Apple Watch Series 9, or the device as given."),
                platform: z.enum(["garmin", "wearos", "applewatch", "other"]),
                games: count,
                batteryGames: count.describe("Of those, games with the battery read at the first kickoff and at full time, which the drain comes from."),
                drainPerHour: z.number().nonnegative().optional().describe("Battery used an hour, in percent: from the first kickoff to full time, over that time, halftime included, averaged over the batteryGames."),
                drainPerGame: z.number().nonnegative().optional().describe("Battery used a game, in percent, averaged over the batteryGames."),
            })).describe("Most games first."),
        }).optional().describe("The watches the games were recorded on and how much battery a match used on each, from the battery readings the watches send with a match. Absent from servers before it, and for an API key that can't read match reports."),
        years: z.array(z.object({
            year: z.int(),
            games: count,
            asCentre: count,
            distanceM: z.number().nonnegative(),
            distanceGames: count,
            referees: count,
            venues: count,
            feesAmount: z.number().nonnegative(),
        })).describe("Each year with games, newest first."),
    })
    .meta({ id: "Stats", description: "Stats on the user's games (STAT-1 to STAT-3), for the filters in the query." });

export type Stats = z.infer<typeof Stats>;
export type StatsQuery = z.infer<typeof StatsQuery>;
export type RoleGroup = z.infer<typeof RoleGroup>;

/** The group a role falls in. */
export function roleGroup(role: z.infer<typeof Role> | undefined): RoleGroup {
    return role === "ar1" || role === "ar2" ? "assistant" : role ?? "notSet";
}

/** Sorting key for age groups: U8 before U10 before U19, then other youth groups, then adult ones (O30, Adult). */
export function ageGroupOrder(ageGroup: string): [number, number, string] {
    const under = ageGroup.match(/^U\s?(\d+)/i);
    if (under) {
        return [0, Number(under[1]), ageGroup];
    }
    const over = ageGroup.match(/^O\s?(\d+)/i);
    return over ? [2, Number(over[1]), ageGroup] : [1, 0, ageGroup];
}

/** A kickoff's date (YYYY-MM-DD), hour, minute and weekday (0 is Monday) in the match's own time zone. */
export function localKickoff(kickoff: string, timeZone: string | undefined): { date: string; hour: number; minute: number; day: number } {
    const zone = timeZone ?? "UTC";
    let format = kickoffFormats.get(zone);
    if (!format) {
        const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" };
        try {
            format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone });
        } catch {
            format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
        }
        kickoffFormats.set(zone, format);
    }
    const parts = Object.fromEntries(format.formatToParts(new Date(kickoff)).map((p) => [p.type, p.value]));
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday),
    };
}

const kickoffFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * Whether a match counts as a game: played or abandoned, with a kickoff (STAT-1). STAT-16: the one
 * rule for every count of games, Stats' and the match list's "played" alike.
 */
export function isGame(match: Match): boolean {
    return (match.status === "played" || match.status === "abandoned") && match.kickoff !== undefined;
}

/** Whether a game matches the stats filters and, for click through, a chart's slice (STAT-11). */
export function gameMatches(match: Match, q: GamesQuery): boolean {
    if (!isGame(match)) {
        return false;
    }
    const date = localKickoff(match.kickoff!, match.timeZone).date;
    const name = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
    return (!q.from || date >= q.from)
        && (!q.to || date <= q.to)
        && (!q.month || date.startsWith(`${q.month}-`))
        && (!q.gender || match.gender === q.gender)
        && (!q.competitionId || match.competitionId === q.competitionId)
        && (!q.role || roleGroup(match.role) === q.role)
        && (!q.tag || (match.tags ?? []).some((t) => name(t) === name(q.tag!)))
        && (!q.venueId || match.venueId === q.venueId)
        && (!q.pitchId || (q.pitchId === "none" ? !match.pitchId : match.pitchId === q.pitchId))
        && (!q.ageGroup || match.ageGroup === q.ageGroup)
        && (!q.refereeId || match.crew.some((c) => c.refereeId === q.refereeId))
        && (!q.refereeName || match.crew.some((c) => !c.refereeId && c.name !== undefined && name(c.name) === name(q.refereeName!)));
}

/**
 * Added time in a period: how long it ran beyond its set length, or undefined when it doesn't count (STAT-9): a
 * period left running, or one whose match clock was corrected during play (TMR-14), as its time played is the
 * corrected clock's. A correction of the added time alone leaves the time played as it was, so that period counts.
 * A match on a clock that stops (TMR-15) has no added time, so none of its periods count.
 */
export function addedTimeSec(match: Match, period: { period: number; extraTime: boolean; playedSec: number }, events: readonly Event[] = [], stoppingClock = false): number | undefined {
    if (stoppingClock || match.format.stoppingClock) {
        return undefined;
    }
    if (events.some((e) => e.type === "clockAdjusted" && e.clock === "match" && e.period === period.period)) {
        return undefined;
    }
    const length = period.extraTime ? match.format.extraTimePeriodSec : match.format.periodSec;
    const added = period.playedSec - length;
    // A period left running after the final whistle isn't added time.
    return added > 15 * 60 ? undefined : Math.max(0, added);
}
