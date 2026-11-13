import { z } from "zod";

// WCH-2: the match rules' cases, written once as data (schema/match-cases/*.json) and run by every copy
// of the rules: the three watches' engines (Match.mc, MatchEngine.kt, MatchEngine.swift) and the clocks
// the website and phones draw for the match screen setup (watchPreview.ts, WatchPreview.kt,
// WatchPreview.swift). `pnpm generate` writes them out for each language (scripts/generate.ts).
//
// Two kinds:
// - screen: a moment of a 2 × 45 match and what the screen shows then. Every copy runs these; the
//   watches by playing the moment out as steps (screenAsSteps).
// - match: a format, then actions at times, with what's expected after each. The watches run these.

/** "12:34" or "112:05": minutes and seconds from the first kickoff. */
const Time = z.string().regex(/^\d{1,3}:[0-5]\d(\.\d)?$/);
const Team = z.enum(["home", "away"]);
const ClockStyle = z.enum(["up", "upEach", "down"]);

/** The screen's choices that change the clocks (UI-21, TMR-4, TMR-11). */
export const CaseScreen = z.strictObject({
    clocks: z.enum(["one", "stacked", "sideBySide"]).optional(),
    mainClock: ClockStyle.optional(),
    secondClock: ClockStyle.optional(),
    breakClock: z.enum(["down", "up"]).optional(),
});

/** What the screen shows: only the fields given are checked. null means it shows nothing there. */
export const ScreenExpect = z.strictObject({
    clock: z.string().optional(),
    second: z.string().nullable().optional(),
    added: z.string().nullable().optional(),
    /** UI-23: 0 to 1, and 1 through added time. */
    progress: z.number().min(0).max(1).optional(),
    /** The stoppage pill: its time, and whether it's running (solid). */
    stoppage: z.strictObject({ text: z.string(), solid: z.boolean() }).nullable().optional(),
    /** The halfway break's pill: counting down to it (not solid), due, or running. */
    breakPill: z.strictObject({ text: z.string(), solid: z.boolean() }).nullable().optional(),
    /** TMR-4: half-time's clock. */
    breakClock: z.string().optional(),
});

export const ScreenCase = z.strictObject({
    name: z.string(),
    /** The requirements it checks. */
    ids: z.array(z.string()).optional(),
    screen: CaseScreen.optional(),
    /** TMR-10: stoppage tracked (the default) or not. */
    tracked: z.boolean().optional(),
    at: z.strictObject({
        phase: z.enum(["running", "halftime"]),
        period: z.int().min(0).max(1),
        /** Into the period, or into half-time. */
        elapsed: Time,
        /** Stoppage so far, and whether one is running now. */
        stoppage: Time.optional(),
        stoppageRunning: z.boolean().optional(),
        /** TMR-7: the halfway break of the setup's pictures (2 minutes, due at 21:30): to come, due, or running since breakStarted. */
        halfwayBreak: z.enum(["coming", "due", "running"]).optional(),
        breakStarted: Time.optional(),
    }),
    expect: ScreenExpect,
});

/** A match's format, as the watches start one (SET-9); what's left out is the default 2 × 45. */
export const CaseFormat = z.strictObject({
    /** SET-16: one to four. */
    numPeriods: z.int().min(1).max(4).optional(),
    periodSec: z.int().positive().optional(),
    halftimeSec: z.int().nonnegative().optional(),
    midBreak: z.boolean().optional(),
    breakLenSec: z.int().positive().optional(),
    breakStoppage: z.boolean().optional(),
    trackStoppage: z.boolean().optional(),
    /** TMR-15: the clock that stops (trackStoppage goes with it, so it's on whatever's given), and whether a goal or card stops it (on when left out). */
    stoppingClock: z.boolean().optional(),
    stopForGoalsCards: z.boolean().optional(),
    goalScorers: z.boolean().optional(),
    goalTypes: z.boolean().optional(),
    extraTime: z.boolean().optional(),
    etPeriods: z.int().min(1).max(2).optional(),
    etPeriodSec: z.int().positive().optional(),
    goldenGoal: z.boolean().optional(),
    penalties: z.boolean().optional(),
    /** VIB-7: the added time alert's switch, which the match takes from the watch's settings. */
    vibeAdded: z.boolean().optional(),
    /** EVT-12: sin bins, and their length (10 minutes when left out). */
    sinBins: z.boolean().optional(),
    sinBinSec: z.int().min(60).max(1200).optional(),
    /** EVT-12: the sin bin return alert's switch, from the watch's settings. */
    vibeSinBin: z.boolean().optional(),
});

/**
 * One action, as the watch's controls do it. Events take a type (G, GO, GP, GF, Y, R; Y2 comes from a
 * second Y; I an injury, EVT-16; SB a sin bin, EVT-12, SB2 from a second SB for the same number) and a team, with an optional player number; a team official's card
 * (EVT-15) takes Y or R, the team and the official's role, and is recorded as TY or TR with the role in
 * extra; kicks are scored or missed; a clock is adjusted by a number of seconds (TMR-14); play is suspended
 * for a reason, recorded as SU with the reason in extra, and resumed, recorded as RS with the seconds
 * suspended in extra (TMR-13); a reason goes to the most recent card (EVT-14); and the app is closed and opened
 * again (reopen), the match saved and read back as the watch does when it starts (TMR-8).
 */
export const CaseAction = z.union([
    z.enum([
        "start", "clearKickoff", "swapKickoff", "endPeriod", "endHalftime", "startNextPeriod", "stoppage",
        "undo", "restart", "startBreak", "skipBreak", "endBreakEarly", "chooseExtraTime", "choosePenalties",
        "startPenalties", "acknowledge", "finish", "undoGoldenGoal", "resetBreak",
        // TMR-13: play carries on from where it stopped; the lightning countdown starts over.
        "resume", "lightningAgain",
        // TMR-8: the app closed and opened again, the match read back from what was saved.
        "reopen",
    ]),
    z.strictObject({ kickoff: Team }),
    z.strictObject({ penaltyFirst: Team }),
    /** EVT-3: player 0 is 00 on the entry, which records no number. */
    z.strictObject({ event: z.enum(["G", "GO", "GP", "GF", "Y", "R", "I", "SB"]), team: Team, player: z.int().nonnegative().optional() }),
    z.strictObject({ official: z.enum(["Y", "R"]), team: Team, role: z.enum(["headCoach", "assistantCoach", "other"]) }),
    z.strictObject({ kick: z.enum(["scored", "missed"]) }),
    /** TMR-14: Adjust clock and Adjust added time, by the change in seconds (negative for back), recorded as CK and CA. */
    z.strictObject({ adjustClock: z.int() }),
    z.strictObject({ adjustAdded: z.int() }),
    z.strictObject({ abandon: z.int().min(0).max(4) }),
    /** TMR-13: Suspend match, with the reason numbered as an abandonment's (0 weather, 1 lightning, 2 crowd trouble, 4 other). */
    z.strictObject({ suspend: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(4)]) }),
    /** EVT-14: the card's reason, chosen from the list after the number: it goes to the most recent card (Y, Y2, R, SB, SB2, TY, TR), replacing one given before. */
    z.strictObject({ reason: z.string().min(1).max(12) }),
]);

const Phase = z.enum(["pre", "ready", "running", "break", "done", "nextKickoff", "decide", "penalties", "golden", "suspended"]);

/** What's expected after a step: only the fields given are checked. */
export const MatchExpect = ScreenExpect.extend({
    phase: Phase.optional(),
    /** The period, from 0. */
    period: z.int().nonnegative().optional(),
    score: z.tuple([z.int(), z.int()]).optional(),
    /** The team that kicked off the match, or extra time once it's on (PRE-3, ET-7); null before it's chosen. */
    kickoff: Team.nullable().optional(),
    /** The team the kickoff screen shows (PRE-6). */
    kickoffOnScreen: Team.nullable().optional(),
    /** How many events, and the last one's type, team, seconds (or before kickoff -1, at a break -2, after full time -3, in the shoot-out -4) and player. */
    events: z.int().nonnegative().optional(),
    last: z.strictObject({
        type: z.string(),
        team: Team.nullable().optional(),
        seconds: z.int().optional(),
        player: z.int().nullable().optional(),
        /** A stoppage's length in seconds, an abandonment's or suspension's reason, a team official's role (0 head coach, 1 assistant coach, 2 other), a clock's change (TMR-14), or the seconds play was suspended (RS, TMR-13). */
        extra: z.int().nullable().optional(),
        /** EVT-14: the card's reason, null for none. */
        reason: z.string().nullable().optional(),
    }).optional(),
    /** EVT-14: the cards' reasons as the upload sends them beside the events: [the card's index in events, its code]. */
    reasons: z.array(z.tuple([z.int().nonnegative(), z.string()])).optional(),
    /** What a tick at this time fires (VIB-1 to VIB-7), or null for nothing. */
    alert: z.enum(["fullTime", "addedTime", "breakStart", "breakEnd", "reminder", "lightning", "sinBinEnd"]).nullable().optional(),
    /** Whether an alert is still going (repeating until acknowledged). */
    alerting: z.boolean().optional(),
    breakDue: z.boolean().optional(),
    stoppageRunning: z.boolean().optional(),
    /** TMR-15: the stopping clock standing still (shown in orange). */
    clockStopped: z.boolean().optional(),
    /** The shoot-out's score. */
    pens: z.tuple([z.int(), z.int()]).nullable().optional(),
    /** ET-6: it ended on a golden goal. */
    endedGolden: z.boolean().optional(),
    /** EVT-11. */
    abandoned: z.boolean().optional(),
    /** UI-3: "1H", "Q3", "ET1". */
    periodLabel: z.string().optional(),
    /** Stoppage so far this period, and whether the halfway break's own is running (TMR-12), in milliseconds. */
    stoppageMs: z.int().nonnegative().optional(),
    breakStoppageRunning: z.boolean().optional(),
    /** TMR-7: the halfway break's time left once started, and how long until it's due; null for none. */
    breakLeftMs: z.int().nonnegative().nullable().optional(),
    breakDueInMs: z.int().nonnegative().nullable().optional(),
    /** UI-12: the screen kept on. */
    screenOn: z.boolean().optional(),
    /** ET-1: what the decide screen offers first. */
    decision: z.enum(["extraTime", "penalties", "endMatch"]).optional(),
    /** ET-3: who kicks next, and who's won the shoot-out (null while it's open). */
    nextKicker: Team.optional(),
    penaltyWinner: Team.nullable().optional(),
    /** ET-6: who scored the golden goal, null for none. */
    goldenWinner: Team.nullable().optional(),
    /** TMR-13: how long play has been suspended, and the lightning countdown's time left; null when not suspended, or not for lightning. */
    suspendedMs: z.int().nonnegative().nullable().optional(),
    lightningLeftMs: z.int().nonnegative().nullable().optional(),
    /** EVT-12: the sin bin pill ("AWY 7 4:12", "+1" after it with more than one), null for none; how many are counting down; and the first waiting for "can return", null for none. */
    sinBinPill: z.string().nullable().optional(),
    sinBins: z.int().nonnegative().optional(),
    sinBinReturn: z.strictObject({ team: Team, player: z.int().nullable() }).nullable().optional(),
});

export const MatchStep = z.strictObject({
    /** When, from the first kickoff (or for actions before it, from when the match was set up). */
    at: Time,
    do: z.union([CaseAction, z.array(CaseAction)]).optional(),
    expect: MatchExpect.optional(),
});

export const MatchCase = z.strictObject({
    name: z.string(),
    ids: z.array(z.string()).optional(),
    format: CaseFormat.optional(),
    screen: CaseScreen.optional(),
    steps: z.array(MatchStep).min(1),
});

export const MatchCaseFile = z.strictObject({
    $comment: z.string().optional(),
    screen: z.array(ScreenCase).optional(),
    match: z.array(MatchCase).optional(),
});

export type ScreenCase = z.infer<typeof ScreenCase>;
export type MatchCase = z.infer<typeof MatchCase>;
export type MatchStep = z.infer<typeof MatchStep>;

/** "12:34" as milliseconds; a tenth of a second after it as "12:34.1". */
export function caseMs(time: string): number {
    const [min, sec] = time.split(":");
    return Math.round((Number(min) * 60 + Number(sec)) * 1000);
}
