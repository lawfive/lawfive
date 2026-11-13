import { z } from "zod";
import { Seconds } from "./common.ts";

// The match format: the quick-match fields of docs/MATCH_CONFIG.md. Ranges are the watch's
// (phone settings and Create match, UI-8), so anything sent to a watch can be run on it.

const minutes = (min: number, max: number) => Seconds.min(min * 60).max(max * 60);

export const ClockStyle = z
    .enum(["up", "upEach", "down"])
    .meta({
        id: "ClockStyle",
        description: "up: Match time, counting up through the match (second half 45:00 to 90:00); upEach: Each half from 0; down: Time left in each period (TMR-11).",
    });

export const MatchFormat = z
    .object({
        periods: z.int().min(1).max(4).describe("Periods of normal time: 1 (SET-16, a tournament game of one period) to 4."),
        periodSec: minutes(1, 60),
        breakSec: minutes(0, 30).describe("Between periods, and before and between extra-time periods."),
        halfwayBreak: z.boolean().describe("A break halfway through each period of normal time (TMR-7)."),
        halfwayBreakSec: minutes(0, 15),
        teamSize: z.int().min(1).max(11),
        clock: ClockStyle.describe("No longer chosen per match: the account's match screen sets it (TMR-11). Kept for older apps."),
        trackStoppage: z.boolean(),
        stoppingClock: z.boolean().optional().describe("The clock (TMR-15): true stops the match clock while play is stopped (a stoppage, the halfway break), as US high school (NFHS) and college (NCAA) games keep time, with no added time; it needs trackStoppage. Missing means it runs on, as the Laws have it."),
        stopForGoalsCards: z.boolean().optional().describe("With a stopping clock, recording a goal or a card stops it, until Start/Stop at the restart (TMR-15). Missing means on."),
        breakStoppage: z.boolean().optional().describe("With stoppage tracked, the halfway break's time is added on as stoppage (TMR-12). Missing means on: formats saved before the setting."),
        goalScorers: z.boolean().optional().describe("Ask the scorer's number for each goal (EVT-10). Missing means on: formats saved before this always asked."),
        goalTypes: z.boolean().describe("Ask the goal type (goal, DFK, penalty, own goal) for each goal (EVT-8)."),
        extraTime: z.boolean(),
        extraTimePeriods: z.int().min(1).max(2),
        extraTimePeriodSec: minutes(1, 30),
        goldenGoal: z.boolean().optional().describe("With extra time, a goal in it ends the match, the scoring team winning (ET-6). Missing means off."),
        penalties: z.boolean(),
        sinBins: z.boolean().optional().describe("Temporary dismissals (EVT-12): Sin bin in the watch's team menu, a countdown with the match clock. Missing means off."),
        sinBinSec: minutes(1, 20).optional().describe("A sin bin's length (EVT-12). Missing means 10 minutes."),
    })
    .meta({ id: "MatchFormat", description: "How a match is played: periods, breaks, extra time, penalties and what the watch records." });

export type MatchFormat = z.infer<typeof MatchFormat>;

/** The defaults from docs/MATCH_CONFIG.md, used for a quick match. */
export const defaultFormat: MatchFormat = {
    periods: 2,
    periodSec: 45 * 60,
    breakSec: 15 * 60,
    halfwayBreak: false,
    halfwayBreakSec: 2 * 60,
    teamSize: 11,
    clock: "up",
    trackStoppage: false,
    stoppingClock: false,
    stopForGoalsCards: true,
    breakStoppage: true,
    goalScorers: true,
    goalTypes: false,
    extraTime: false,
    extraTimePeriods: 2,
    extraTimePeriodSec: 15 * 60,
    goldenGoal: false,
    penalties: false,
    sinBins: false,
    sinBinSec: 10 * 60,
};

/** A starter format: one every client offers a new account, as a constant rather than a template it would have to sync or delete. */
export interface StarterFormat {
    /** Stable, for a client to remember which was chosen: "us-u10", "adult". */
    id: string;
    /** As the format picker shows it. */
    name: string;
    /** The age groups (as matches write them) it's for, so a match's age group can suggest it. */
    ageGroups: string[];
    format: MatchFormat;
}

const starter = (periods: number, minutes: number, breakMinutes: number, teamSize: number, stoppingClock = false): MatchFormat => ({
    ...defaultFormat,
    periods,
    periodSec: minutes * 60,
    breakSec: breakMinutes * 60,
    teamSize,
    // TMR-15: a stopping clock needs stoppage tracked.
    ...(stoppingClock ? { stoppingClock: true, trackStoppage: true } : {}),
});

/**
 * SET-17: the starter formats offered to every account,
 * youngest first, then adult, then high school and college with the stopping clock. Leagues vary, so a
 * referee changes what doesn't fit, or saves their own as a template.
 *
 * Players a side: U.S. Soccer's Player Development Initiatives, small-sided standards, in force from
 * August 2017 (4v4 for U8 and younger, 7v7 for U9 and U10, 9v9 for U11 and U12; 11v11 from U13).
 * Lengths: U8 two 20-minute halves, as the owner's leagues play it (Q-23, 2026-11-10; US Youth
 * Soccer's recommended playing rules have four 10-minute quarters); the rest US Youth Soccer's
 * recommended playing rules (U9 to U10 two 25s, U11 to U12 two 30s, U13 to U14 two 35s, U15 to U16
 * two 40s, as the owner's leagues play it too, U17 to U19 two 45s). Halftime is 5 to 10 minutes (the
 * owner confirmed it, Q-23), so 5 to U12 and 10 from U13.
 * Adult: IFAB's Laws of the Game, Law 7 (two equal halves of 45 minutes, a half-time interval of at
 * most 15 minutes), the same as defaultFormat.
 * High school and college keep time on a clock that stops (TMR-15), with no added time, 11 a side:
 * High school (NFHS): the NFHS Soccer Rules Book, Rule 7-1 (two equal halves of 40 minutes; the halftime
 * interval 10 minutes, which state associations and the coaches' consent can change). College (NCAA):
 * the NCAA Soccer Rules, Rule 7.1 (two periods of 45 minutes) and 7.2.1 (a halftime interval of 15
 * minutes, which may be shortened by the coaches' and officials' consent), its clock stopping for goals,
 * cards, penalty kicks and injuries (6.3.5). Neither has overtime here: NCAA's regular season has none, and
 * the states' NFHS overtimes differ, so a referee turns it on where it's played. Their age groups are the
 * words a match is likely to have for them (the U-ages stay with the youth formats, as club soccer at
 * those ages plays the Laws): HS, Varsity and JV; College and NCAA.
 */
export const starterFormats: StarterFormat[] = [
    { id: "us-u8", name: "U8 · 4v4 · 2×20", ageGroups: ["U6", "U7", "U8"], format: starter(2, 20, 5, 4) },
    { id: "us-u10", name: "U9–U10 · 7v7 · 2×25", ageGroups: ["U9", "U10"], format: starter(2, 25, 5, 7) },
    { id: "us-u12", name: "U11–U12 · 9v9 · 2×30", ageGroups: ["U11", "U12"], format: starter(2, 30, 5, 9) },
    { id: "us-u14", name: "U13–U14 · 11v11 · 2×35", ageGroups: ["U13", "U14"], format: starter(2, 35, 10, 11) },
    { id: "us-u16", name: "U15–U16 · 11v11 · 2×40", ageGroups: ["U15", "U16"], format: starter(2, 40, 10, 11) },
    { id: "us-u19", name: "U17–U19 · 11v11 · 2×45", ageGroups: ["U17", "U18", "U19"], format: starter(2, 45, 10, 11) },
    { id: "adult", name: "Adult · 11v11 · 2×45", ageGroups: ["Adult"], format: { ...defaultFormat } },
    { id: "us-hs", name: "High school (NFHS) · 2×40 · stopping clock", ageGroups: ["HS", "Varsity", "JV"], format: starter(2, 40, 10, 11, true) },
    { id: "us-college", name: "College (NCAA) · 2×45 · stopping clock", ageGroups: ["College", "NCAA"], format: starter(2, 45, 15, 11, true) },
];

/** The starter format for a match's age group ("U10", "u10", "U 10"), if one is for it. */
export function starterFormatFor(ageGroup: string | undefined): StarterFormat | undefined {
    const key = (ageGroup ?? "").replace(/\s+/g, "").toUpperCase();
    return key ? starterFormats.find((s) => s.ageGroups.some((a) => a.toUpperCase() === key)) : undefined;
}
