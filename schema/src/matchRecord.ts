import { z } from "zod";
import { Id, Seconds, Side, Timestamp, syncFields } from "./common.ts";
import { MisconductCode } from "./misconduct.ts";

// What a watch uploads after a match: when each period was played, every event, and the result.
// The watch keeps its own short codes (G, Y2, ...) and converts to these when it syncs.

/**
 * When an event happened. During play, `period` and `periodSec` (seconds since that period's
 * kickoff, so it doesn't depend on the clock style); cards can also come before kickoff, at a
 * break or after full time (EVT-7); shoot-out kicks are in "penalties".
 */
const timing = {
    when: z.enum(["play", "beforeKickoff", "break", "afterFullTime", "penalties"]),
    period: z.int().min(1).optional().describe("1-based; extra-time periods follow the normal ones."),
    periodSec: Seconds.optional().describe("Seconds since the period's kickoff, including stoppage; only during play."),
    at: Timestamp.optional().describe("Wall-clock time, when the device knows it."),
};

const PlayerNumber = z.int().min(1).max(99);

export const GoalType = z.enum(["goal", "directFreeKick", "penalty", "ownGoal"]).meta({ id: "GoalType" });

export const TeamOfficialRole = z.enum(["headCoach", "assistantCoach", "other"]).meta({ id: "TeamOfficialRole" });

/** Who a card was shown to: a player (number optional, as on the watch) or a team official. */
export const Offender = z
    .discriminatedUnion("kind", [
        z.object({ kind: z.literal("player"), number: PlayerNumber.optional() }),
        z.object({ kind: z.literal("teamOfficial"), role: TeamOfficialRole, name: z.string().max(100).optional() }),
    ])
    .meta({ id: "Offender" });

const card = {
    ...timing,
    team: Side,
    offender: Offender,
    misconduct: MisconductCode.optional().describe("For a second caution, the reason for the second caution."),
};

export const AbandonReason = z
    .enum(["weather", "lightning", "crowdTrouble", "notEnoughPlayers", "other"])
    .meta({ id: "AbandonReason" });

export const Event = z
    .discriminatedUnion("type", [
        z.object({
            type: z.literal("goal"),
            ...timing,
            team: Side.describe("The team the goal counts for; for an own goal, the player is from the other team."),
            player: PlayerNumber.optional(),
            goalType: GoalType.optional().describe("When the match records goal types (EVT-8)."),
        }),
        z.object({ type: z.literal("caution"), ...card }),
        z.object({ type: z.literal("secondCaution"), ...card }).describe("Counts as a send-off (EVT-5)."),
        z.object({ type: z.literal("sendOff"), ...card }),
        z.object({
            type: z.literal("sinBin"),
            ...card,
            lengthSec: Seconds.describe("How long the player was to be off, from the format (EVT-12)."),
        }).describe("A temporary dismissal (EVT-12): the player off for lengthSec of the match clock."),
        z.object({ type: z.literal("secondSinBin"), ...card, lengthSec: Seconds }).describe("A second sin bin for the same numbered player, which counts as a send-off (EVT-12)."),
        z.object({
            type: z.literal("stoppage"),
            ...timing,
            lengthSec: Seconds,
        }).describe("Time added for a stoppage, when stoppage is tracked (EVT-4); periodSec is when it began. With a stopping clock (TMR-15), how long the clock stood still from periodSec, adding nothing."),
        z.object({ type: z.literal("periodEnd"), ...timing }),
        z.object({
            type: z.literal("penaltyKick"),
            ...timing,
            team: Side,
            scored: z.boolean(),
            player: PlayerNumber.optional(),
        }),
        z.object({
            type: z.literal("injury"),
            ...timing,
            team: Side,
            player: PlayerNumber.optional(),
            lengthSec: Seconds.optional().describe("How long play was stopped."),
            note: z.string().max(500).optional(),
        }),
        z.object({
            type: z.literal("suspension"),
            ...timing,
            reason: AbandonReason.exclude(["notEnoughPlayers"]),
            lengthSec: Seconds.optional().describe("How long until play resumed; absent if it never did (an abandonment follows)."),
            note: z.string().max(500).optional(),
        }).describe("Play stopped for a while, for example a lightning delay, and the match continued."),
        z.object({
            type: z.literal("clockAdjusted"),
            ...timing,
            clock: z.enum(["match", "added"]).describe("What was corrected: the match clock (the period's time) or the added time (the stoppage total)."),
            changeSec: z.int().min(-6000).max(6000).describe("How far it moved, in seconds: forward (more time played, or more added) or back (negative)."),
        }).describe("The referee corrected a clock during play (TMR-14); periodSec is the period's time just after. Events before it keep their times, and the added-time stats leave a period with its match clock corrected out (STAT-9)."),
        z.object({
            type: z.literal("abandonment"),
            ...timing,
            reason: AbandonReason,
            note: z.string().max(500).optional(),
        }).describe("The match was abandoned; the score at that point is kept."),
    ])
    .meta({ id: "Event" });

export const PeriodPlayed = z
    .object({
        period: z.int().min(1),
        extraTime: z.boolean(),
        startedAt: Timestamp.optional(),
        playedSec: Seconds.describe("From kickoff to the end of the period, including added time; time play was suspended is left out (TMR-13). With a stopping clock (TMR-15), the clock's time, so the period's length."),
        stoppedSec: Seconds.optional().describe("With a stopping clock (TMR-15), how long the clock stood still in the period (its stoppages): the period ran for playedSec plus this, and any suspensions."),
        suspended: z.array(z.object({
            fromSec: Seconds.describe("Seconds of wall-clock time after startedAt."),
            lengthSec: Seconds,
        })).max(20).optional().describe("When play was suspended in the period and resumed (TMR-13), on the clock of day from startedAt: the period ran for playedSec plus these. The track's figures leave them out (TRK-3)."),
    })
    .meta({ id: "PeriodPlayed" });

const Score = z.object({ home: z.int().nonnegative(), away: z.int().nonnegative() });

export const MatchDiagnostics = z
    .object({
        battery: z.array(z.object({
            period: z.int().min(1),
            at: z.enum(["kickoff", "end"]),
            percent: z.number().min(0).max(100),
        })).optional().describe("The watch's battery at each period's kickoff and end, so the last is full time."),
        app: z.string().max(40).optional().describe("The version of LawFive that recorded it."),
        firmware: z.string().max(40).optional().describe("The watch's own software."),
        gpsFirstFixSec: z.int().nonnegative().optional().describe("Seconds from kickoff to the first GPS fix."),
        gpsSamples: z.int().nonnegative().optional().describe("Track samples taken."),
        gpsMissed: z.int().nonnegative().optional().describe("Of those, how many had no GPS fix."),
        restarts: z.int().nonnegative().optional().describe("How many times the app started again mid-match."),
    })
    .meta({ id: "MatchDiagnostics", description: "How the recording went, for tracing problems. Never on a shared match's page." });

/** RES-3: the parts of a record a correction can change, as the watch sent them. */
export const RecordedResult = z
    .object({
        outcome: z.enum(["completed", "abandoned"]),
        score: Score,
        penalties: Score.optional(),
        goldenGoal: z.boolean().optional(),
        events: z.array(Event),
    })
    .meta({ id: "RecordedResult", description: "A match's result as the watch recorded it, before any correction (RES-3)." });

export const MatchRecord = z
    .object({
        ...syncFields,
        matchId: Id.optional().describe("The planned match; absent for a quick match started on the watch, for which the server makes a match."),
        device: z.string().max(60).optional().describe("What recorded it: the watch app and the watch, for example garmin:006-B3703-00 (a Garmin part number), wearos:SM-R860 (the model) or applewatch:Watch7,3 (the hardware identifier; applewatch:Apple Watch from apps before it)."),
        outcome: z.enum(["completed", "abandoned"]),
        periods: z.array(PeriodPlayed),
        score: Score,
        penalties: Score.optional().describe("Shoot-out score, when there was one."),
        goldenGoal: z.boolean().optional().describe("The match ended on a golden goal in extra time (ET-6): the team that scored it won."),
        stoppingClock: z.boolean().optional().describe("The match was played on a clock that stops (TMR-15), as US high school and college games are: events' times are the clock's, its stoppages are when it stood still, and there was no added time, so the added-time stats leave the match out (STAT-9)."),
        distanceM: z.number().nonnegative().optional().describe("Distance the referee covered during the match, in meters, from the watch's GPS."),
        kickoffDirection: z.object({
            team: z.enum(["home", "away"]).describe("The team that kicked off the first period."),
            bearingDeg: z.number().min(0).lt(360).describe("The compass bearing of the goal it attacked, in degrees from true north."),
        }).optional().describe("Which way the first period's kickoff team attacked, when the referee recorded it on the watch (PRE-8); heatmaps use it (TRK-9)."),
        events: z.array(Event),
        diagnostics: MatchDiagnostics.optional().describe("How the recording went (DIAG-1)."),
        editedAt: Timestamp.optional().describe("When its result was last corrected after the match (RES-1); set by the server whenever the outcome, score, shoot-out, golden goal or events change. A watch's later upload of the same match then changes nothing (RES-4)."),
        original: RecordedResult.optional().describe("The result exactly as the watch first sent it, kept by the server the first time it's corrected (RES-3), so it can be shown or put back. Absent for results entered without a watch."),
    })
    .meta({ id: "MatchRecord", description: "What happened in a match, as recorded on a watch, or entered or corrected afterward (RES)." });

export type Event = z.infer<typeof Event>;
export type MatchRecord = z.infer<typeof MatchRecord>;
