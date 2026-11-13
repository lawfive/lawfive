// A match in progress, for Try a match (DEMO): the seventh copy of the rules, after the Garmin watch's
// Match.mc, Wear OS's MatchEngine.kt and the Apple Watch's MatchEngine.swift, ported from the last, and
// tested with the same shared cases (schema/match-cases, WCH-2). All clocks come from stored start times
// passed in, so the demo can run fast or jump.

export type Phase = "pre" | "ready" | "running" | "break" | "done" | "nextKickoff" | "decide" | "penalties" | "golden" | "suspended";
/** "lightning": TMR-13's 30:00 countdown at zero, one long vibration as VIB-3's. */
/** "sinBinEnd": EVT-12's sin bin over, repeating as VIB-1's until a button is pressed. */
export type Alert = "breakEnd" | "fullTime" | "addedTime" | "breakStart" | "reminder" | "lightning" | "sinBinEnd";
export type Decision = "extraTime" | "penalties" | "endMatch";
export type ClockStyle = "up" | "upEach" | "down";

export const HOME = 0;
export const AWAY = 1;

export const EventType = {
    goal: "G", ownGoal: "GO", penGoal: "GP", dfkGoal: "GF",
    yellow: "Y", red: "R", secondYellow: "Y2",
    /** EVT-15: a team official's caution and send-off, with the role in extra (officialRoles). */
    officialYellow: "TY", officialRed: "TR",
    /** EVT-16. */
    injury: "I",
    stoppage: "S", periodEnd: "E", penScored: "PG", penMissed: "PM",
    /** TMR-14: the match clock and the added time corrected, the change in seconds in extra. */
    clockAdjusted: "CK", addedAdjusted: "CA",
    /** EVT-11: the reason's number in extra. */
    abandon: "A",
    /** TMR-13: play suspended, the reason's number in extra (as an abandonment's), and resumed, the whole seconds suspended in extra. */
    suspended: "SU", resumed: "RS",
    /** EVT-12: a sin bin, its length in seconds in extra; a second for the same number, a send-off, with the length too. */
    sinBin: "SB", secondSinBin: "SB2",
} as const;

/** TMR-13: the reasons play is suspended for, by the numbers an abandonment's have (3, not enough players, isn't one). */
export const suspendReasons = [[0, "Weather"], [1, "Lightning"], [2, "Crowd trouble"], [4, "Other"]] as const;
export const LIGHTNING = 1;
/** TMR-13: the US 30-minute rule, started over by each strike. */
export const lightningWaitMs = 30 * 60 * 1000;

export const EventTime = { beforeKickoff: -1, atBreak: -2, afterFullTime: -3, penalties: -4 } as const;

/** UI-21 to UI-23, TMR-4, TMR-11: the match screen's choices that change the clocks. */
export interface WatchScreen {
    clocks: "one" | "stacked" | "sideBySide";
    mainClock: ClockStyle;
    secondClock: ClockStyle;
    breakClock: "down" | "up";
}

export const defaultWatchScreen: WatchScreen = { clocks: "one", mainClock: "up", secondClock: "down", breakClock: "down" };

/** UI-22: never the same style as the match clock. */
export function secondOf(screen: WatchScreen): ClockStyle {
    return screen.secondClock !== screen.mainClock ? screen.secondClock : screen.mainClock === "down" ? "upEach" : "down";
}

export const isGoal = (type: string) => type === "G" || type === "GO" || type === "GP" || type === "GF";
export const isKick = (type: string) => type === "PG" || type === "PM";
/** EVT-15: a team official's role, by the number the watches keep and upload. */
export const officialRoles = ["Head coach", "Assistant coach", "Other"] as const;
export const isAdjustment = (type: string) => type === "CK" || type === "CA";
/**
 * INP-6: what Undo can take back: goals, cards, injuries and shoot-out kicks; not stoppages or periods' ends.
 * TMR-14: a clock's correction too, but only while its period is being played, as it moves the running clock.
 */
const isUndoable = (type: string, playing: boolean) => isGoal(type) || isKick(type) || ["Y", "Y2", "R", "TY", "TR", "I", "SB", "SB2"].includes(type) || (playing && isAdjustment(type));
/** EVT-12: what sends a player off, so a sin bin running for them ends without a return. */
const isSendOff = (type: string) => type === "R" || type === "Y2" || type === "SB2";
const clamp = (value: number, least: number, most: number) => Math.min(Math.max(value, least), most);

/** TMR-14: a clock's change as the watches show it: "+0:40", "−1:05". */
export function formatChange(sec: number): string {
    return `${sec < 0 ? "\u2212" : "+"}${formatClock(Math.abs(sec) * 1000)}`;
}

/** "23:12": whole seconds, as the watches count up. */
export function formatClock(ms: number): string {
    const total = Math.trunc(ms / 1000);
    return `${Math.trunc(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Counting down, a part second shows as the next whole one, so 0:00 is when it's done. */
export const formatCountdown = (ms: number) => formatClock(ms + 999);

/**
 * INP-3: a period spelled out, for Wear OS's and Apple Watch's game menus, which have the room: "first half", "second
 * quarter", "third period", "extra time 1" ("extra time" when it has one period).
 */
export function periodName(period: number, numPeriods: number, etPeriods = 2): string {
    if (period >= numPeriods) {
        return etPeriods === 1 ? "extra time" : `extra time ${period - numPeriods + 1}`;
    }
    // SET-16: one period is just "period" ("End period" before extra time or penalties).
    if (numPeriods === 1) {
        return "period";
    }
    const nth = ["first", "second", "third", "fourth"][period] ?? `${period + 1}th`;
    return `${nth} ${numPeriods === 2 ? "half" : numPeriods === 4 ? "quarter" : "period"}`;
}

/** UI-3: "1H", "Q1" with four periods, "P1" with three, "ET1"; nothing for a match of one period (SET-16). */
export function periodLabel(period: number, numPeriods: number): string {
    if (period >= numPeriods) {
        return `ET${period - numPeriods + 1}`;
    }
    return numPeriods === 1 ? "" : numPeriods === 2 ? `${period + 1}H` : numPeriods === 4 ? `Q${period + 1}` : `P${period + 1}`;
}

/** The format as the watches' kickoff screen sums it up: "2×45' · HT 15'", and "1×20'" for one period (SET-16). */
export function formatSummary(s: { numPeriods: number; periodSec: number; halftimeSec: number }): string {
    const periods = `${s.numPeriods}×${s.periodSec / 60}'`;
    return s.numPeriods === 1 ? periods : `${periods} · HT ${s.halftimeSec / 60}'`;
}

/**
 * TMR-7: when the halfway break is due, in seconds into each regular period, or -1 for none. Added on as
 * stoppage (TMR-12; a stopping clock always stops for it, TMR-15), it's due at halfway, as it takes none
 * of the period's time; otherwise it's centered on halfway, due half its length before it.
 */
export function halfwayBreakAtSec(s: Pick<MatchSetup, "midBreak" | "periodSec" | "breakLenSec" | "trackStoppage" | "breakStoppage" | "stoppingClock">): number {
    if (!s.midBreak) {
        return -1;
    }
    const addedOn = (s.trackStoppage || s.stoppingClock) && (s.breakStoppage || s.stoppingClock);
    return addedOn ? Math.trunc(s.periodSec / 2) : Math.max(Math.trunc((s.periodSec - s.breakLenSec) / 2), 0);
}

/** SET-16: a period's label before a time, "1H 23:40", or the time alone for a match of one period. */
export function withPeriod(period: number, numPeriods: number, text: string): string {
    const label = periodLabel(period, numPeriods);
    return label ? `${label} ${text}` : text;
}

/**
 * TMR-11: a period's time in one of the styles, held at the period's end: match time counts on from
 * where the period starts in the match, each half from 0 starts again, and time left counts down.
 */
export function clockTextAt(style: ClockStyle, periodStartSec: number, periodSec: number, elapsedMs: number): string {
    const periodMs = periodSec * 1000;
    const shown = Math.min(elapsedMs, periodMs);
    if (style === "up") {
        return formatClock(periodStartSec * 1000 + shown);
    }
    return style === "down" ? formatCountdown(periodMs - shown) : formatClock(shown);
}

/**
 * UI-2, UI-4, TMR-3, TMR-16: the stoppage pill, solid while a stoppage runs; undefined until there's stoppage time.
 * Before the period's length it shows the total, the added time to signal. From the length it counts down the
 * added time still to play (the total less the time past the length), holding still while a stoppage runs then,
 * reaching 0:00 as the added time alert fires (VIB-7) and showing it for that second; then the time over it, "+0:05".
 */
export function stoppagePillAt(totalMs: number, running: boolean, elapsedMs: number, periodMs: number): { text: string; solid: boolean } | undefined {
    if (!running && totalMs <= 0) {
        return undefined;
    }
    if (elapsedMs < periodMs) {
        return { text: formatClock(totalMs), solid: running };
    }
    const over = elapsedMs - periodMs - totalMs;
    return { text: over >= 1000 ? `+${formatClock(over)}` : formatCountdown(Math.max(-over, 0)), solid: running };
}

/** TMR-4: a break's clock, time left or time taken. */
export function breakClockTextAt(breakClock: WatchScreen["breakClock"], leftMs: number, lengthMs: number): string {
    return breakClock === "up" ? formatClock(lengthMs - leftMs) : formatCountdown(leftMs);
}

export interface MatchEvent {
    type: string;
    team: number;
    period: number;
    seconds: number;
    player?: number;
    extra?: number;
    /** EVT-14: the card's reason, a misconduct code of the match's scheme. */
    reason?: string;
}

/** EVT-14: the events a reason can go to: a player's or a team official's card, or a sin bin. */
export const isCard = (type: string) => ["Y", "Y2", "R", "SB", "SB2", "TY", "TR"].includes(type);

/** What a match is started from (SET-9). */
export interface MatchSetup {
    home: string;
    away: string;
    homeColor: number;
    awayColor: number;
    numPeriods: number;
    periodSec: number;
    halftimeSec: number;
    midBreak: boolean;
    breakLenSec: number;
    extraTime: boolean;
    etPeriods: number;
    etPeriodSec: number;
    /** ET-6: with extra time, a goal in it ends the match. */
    goldenGoal: boolean;
    penalties: boolean;
    trackStoppage: boolean;
    breakStoppage: boolean;
    goalScorers: boolean;
    goalTypes: boolean;
    /** EVT-12: Sin bin in the team menu, for sinBinSec of the match clock. */
    sinBins: boolean;
    sinBinSec: number;
    /** TMR-15: the match clock stops while play does (with stoppage tracked), and a goal or card recorded stops it. */
    stoppingClock: boolean;
    stopForGoalsCards: boolean;
}

export const defaultSetup: MatchSetup = {
    home: "HOM", away: "AWY", homeColor: -1, awayColor: -1, numPeriods: 2, periodSec: 45 * 60, halftimeSec: 15 * 60,
    midBreak: false, breakLenSec: 120, extraTime: false, etPeriods: 2, etPeriodSec: 15 * 60, goldenGoal: false,
    penalties: false, trackStoppage: false, breakStoppage: true, goalScorers: true, goalTypes: false,
    sinBins: false, sinBinSec: 600, stoppingClock: false, stopForGoalsCards: true,
};

export class Match {
    readonly setup: MatchSetup;
    repeatSec = 10;
    reminderSec = 10;
    vibeFullTime = true;
    vibeStoppage = true;
    vibeBreak = true;
    /** VIB-7. */
    vibeAdded = true;
    /** EVT-12: the sin bin return's vibration. */
    vibeSinBin = true;
    /** UI-21: the match screen, fixed at kickoff. */
    screen: WatchScreen = defaultWatchScreen;
    phase: Phase = "pre";
    period = 0;
    kickoff = -1;
    periodStart?: number;
    stoppageMs = 0;
    stoppageStart?: number;
    breakEnd?: number;
    breakIsHalftime = false;
    scheduledBreakDone = false;
    fullTimeAcked = false;
    /** VIB-7: once a period. */
    addedAcked = false;
    /** VIB-1: stoppage tracked, but none when the period's length was reached, so full time repeats. */
    fullTimeRepeats = false;
    breakDue = false;
    breakDueSilenced = false;
    breakEndAlerted = false;
    breakStoppageRunning = false;
    score: [number, number] = [0, 0];
    events: MatchEvent[] = [];
    penFirst = -1;
    penStarted = false;
    startedAt: number[] = [];
    /** ET-7: extra time's own kickoff team, from its toss; -1 until chosen. */
    etKickoff = -1;
    /** ET-6: it ended on a golden goal. */
    endedGolden = false;
    /** TMR-13: while suspended, when it was, why, and when the lightning countdown last started (lightning only). */
    suspendedAt?: number;
    suspendReason = -1;
    lightningFrom?: number;
    lightningAlerted = false;
    /** EVT-12: the sin bins over, waiting for a button for "can return", in the order they ended. */
    sinBinReturns: MatchEvent[] = [];

    private lastRepeat = 0;
    /** EVT-12: the time played at the last tick, so each sin bin's end is announced once. */
    private sinBinCheckedMs = 0;
    private lastReminder = 0;

    constructor(setup: Partial<MatchSetup> = {}) {
        this.setup = { ...defaultSetup, ...setup };
        // TMR-15: the clock stops with the stoppage clock, so it needs it tracked.
        if (this.setup.stoppingClock) {
            this.setup.trackStoppage = true;
        }
    }

    /** TMR-15: the clock that stops. */
    get stoppingClock() {
        return this.setup.stoppingClock;
    }
    /** TMR-15: the stopping clock standing still, while a stoppage runs (shown in orange). */
    get clockStopped() {
        return this.setup.stoppingClock && this.stoppageStart !== undefined;
    }

    get breakAtSec() {
        return halfwayBreakAtSec(this.setup);
    }
    get isExtraTime() {
        return this.period >= this.setup.numPeriods;
    }
    get currentPeriodSec() {
        return this.isExtraTime ? this.setup.etPeriodSec : this.setup.periodSec;
    }
    get isStoppageActive() {
        return this.stoppageStart !== undefined;
    }
    get isLastPeriod() {
        const s = this.setup;
        return this.isExtraTime ? this.period >= s.numPeriods + s.etPeriods - 1 : this.period >= s.numPeriods - 1;
    }
    get canExtraTime() {
        return this.setup.extraTime && !this.isExtraTime;
    }
    get canPenalties() {
        return this.setup.penalties && this.phase !== "penalties";
    }
    get periodEndsMatch() {
        return this.isLastPeriod && !this.canExtraTime && !this.canPenalties;
    }
    get isHalftime() {
        return this.setup.numPeriods === 2 && this.period === 0;
    }
    /** ET-7: whether the period being played, or about to kick off, is in extra time. */
    private get aboutExtraTime() {
        return this.phase === "nextKickoff" ? this.period + 1 >= this.setup.numPeriods : this.isExtraTime;
    }

    /** The team that kicked off the match, or extra time once it's on (PRE-3, ET-7). */
    get firstKickoff() {
        return this.aboutExtraTime ? this.etKickoff : this.kickoff;
    }
    get kickoffTeamOnScreen() {
        return this.phase === "nextKickoff" ? this.kickoffFor(this.period + 1) : this.kickoff;
    }

    /** TMR-13: every clock stands where it was while play is suspended. */
    private clockNow(now: number) {
        return this.phase === "suspended" && this.suspendedAt !== undefined ? Math.min(now, this.suspendedAt) : now;
    }
    /**
     * The period's time. TMR-15: on a stopping clock, less the time stopped (the stoppage clock), and held at the
     * period's length, as there's no added time.
     */
    matchMs(now: number) {
        if (this.periodStart === undefined) {
            return 0;
        }
        const elapsed = this.clockNow(now) - this.periodStart;
        return this.setup.stoppingClock ? Math.min(elapsed - this.stoppageTotalMs(now), this.currentPeriodSec * 1000) : elapsed;
    }
    stoppageTotalMs(now: number) {
        return this.stoppageMs + (this.stoppageStart === undefined ? 0 : this.clockNow(now) - this.stoppageStart);
    }
    breakRemainingMs(now: number): number | undefined {
        return this.breakEnd === undefined ? undefined : Math.max(this.breakEnd - this.clockNow(now), 0);
    }
    /** TMR-13: how long play has been suspended, counting up; undefined when it isn't. */
    suspendedMs(now: number): number | undefined {
        return this.phase === "suspended" && this.suspendedAt !== undefined ? Math.max(now - this.suspendedAt, 0) : undefined;
    }
    /** TMR-13: for lightning, the 30:00 countdown's time left, held at 0:00; undefined otherwise. */
    lightningLeftMs(now: number): number | undefined {
        return this.phase === "suspended" && this.lightningFrom !== undefined ? Math.max(this.lightningFrom + lightningWaitMs - now, 0) : undefined;
    }
    /** PRE-5; extra time alternates from its own kickoff team (ET-7). */
    kickoffFor(p: number) {
        const extra = p >= this.setup.numPeriods;
        const first = extra ? this.etKickoff : this.kickoff;
        return first < 0 ? -1 : ((extra ? p - this.setup.numPeriods : p) % 2 === 0 ? first : 1 - first);
    }
    periodStartSec(p: number) {
        const s = this.setup;
        return p < s.numPeriods ? p * s.periodSec : s.numPeriods * s.periodSec + (p - s.numPeriods) * s.etPeriodSec;
    }

    /** TMR-11, TMR-2: the clock as shown, and the added time under it once the period's length is reached. */
    clockDisplay(now: number): { clock: string; added?: string } {
        const elapsed = this.matchMs(now);
        const periodMs = this.currentPeriodSec * 1000;
        // TMR-15: a stopping clock has no added time.
        return { clock: this.clockText(this.screen.mainClock, now), ...(elapsed >= periodMs && !this.setup.stoppingClock ? { added: `+${formatClock(elapsed - periodMs)}` } : {}) };
    }

    private clockText(style: ClockStyle, now: number) {
        return clockTextAt(style, this.periodStartSec(this.period), this.currentPeriodSec, this.matchMs(now));
    }

    /** UI-22: never a copy of the main clock. */
    secondClockText(now: number) {
        return this.clockText(secondOf(this.screen), now);
    }

    /** TMR-4: the break clock as shown, time left or time taken; undefined when no break is running. */
    breakClockText(now: number): string | undefined {
        const remaining = this.breakRemainingMs(now);
        if (remaining === undefined) {
            return undefined;
        }
        return breakClockTextAt(this.screen.breakClock, remaining, (this.breakIsHalftime ? this.setup.halftimeSec : this.setup.breakLenSec) * 1000);
    }

    /** UI-2, TMR-16: the stoppage pill, with stoppage tracked: the total, then from the length the added time left. None on a stopping clock (TMR-15). */
    stoppagePill(now: number): { text: string; solid: boolean } | undefined {
        return this.setup.trackStoppage && !this.setup.stoppingClock ? stoppagePillAt(this.stoppageTotalMs(now), this.isStoppageActive, this.matchMs(now), this.currentPeriodSec * 1000) : undefined;
    }

    /** UI-23: from 0 to 1, and 1 through added time. */
    periodProgress(now: number) {
        return Math.min(this.matchMs(now) / (this.currentPeriodSec * 1000), 1);
    }

    /** VIB-1: the period's length reached, and its alert not yet answered (with stoppage tracked, not yet given). */
    private fullTimeDue(now: number) {
        return this.phase === "running" && this.vibeFullTime && !this.fullTimeAcked && this.matchMs(now) >= this.currentPeriodSec * 1000;
    }
    /**
     * VIB-1: full time repeats until a button without stoppage tracked, and with it when there was no stoppage time at the
     * length (no added time alert would follow); otherwise it's one vibration as added time starts.
     */
    private fullTimeAlertActive(now: number) {
        return (!this.setup.trackStoppage || this.fullTimeRepeats) && this.fullTimeDue(now);
    }
    /** VIB-7: with stoppage tracked, once the period's length and its added time (the stoppage total) have both passed. */
    private addedAlertActive(now: number) {
        // TMR-15: none on a stopping clock, which has no added time.
        if (this.phase !== "running" || !this.setup.trackStoppage || this.setup.stoppingClock || !this.vibeAdded || this.addedAcked) {
            return false;
        }
        const added = this.stoppageTotalMs(now);
        return added > 0 && this.matchMs(now) >= this.currentPeriodSec * 1000 + added;
    }
    private get breakDueAlertActive() {
        return this.phase === "running" && this.vibeBreak && this.breakDue && !this.breakDueSilenced;
    }
    /** EVT-12: a sin bin over, during play, with its vibration on. */
    private get sinBinAlertActive() {
        return (this.phase === "running" || this.phase === "golden") && this.vibeSinBin && this.sinBinReturns.length > 0;
    }
    hasActiveAlert(now: number) {
        return this.fullTimeAlertActive(now) || this.addedAlertActive(now) || this.breakDueAlertActive || this.sinBinAlertActive;
    }

    /** UI-12: from 30 s before the period's time is up until it's ended, and while a break is due. */
    wantsScreenOn(now: number) {
        return this.phase === "running" && (this.breakDue || this.matchMs(now) >= this.currentPeriodSec * 1000 - 30_000);
    }

    /** VIB-6: silences repeating alerts; true if there was one. */
    acknowledgeAlerts(now: number) {
        // EVT-12: "can return" waits for a button even with its vibration off.
        if (!this.hasActiveAlert(now) && this.sinBinReturns.length === 0) {
            return false;
        }
        this.sinBinReturns = [];
        if (this.fullTimeAlertActive(now)) {
            this.fullTimeAcked = true;
        }
        if (this.addedAlertActive(now)) {
            this.addedAcked = true;
        }
        if (this.breakDueAlertActive) {
            this.breakDueSilenced = true;
        }
        return true;
    }

    /** Every second: makes scheduled breaks due, and says which vibration is due, at most one. */
    tick(now: number): Alert | undefined {
        // TMR-13: while suspended every clock stands still; only the lightning countdown runs, with one vibration at zero.
        if (this.phase === "suspended") {
            if (this.lightningFrom !== undefined && !this.lightningAlerted && now >= this.lightningFrom + lightningWaitMs) {
                this.lightningAlerted = true;
                return this.vibeBreak ? "lightning" : undefined;
            }
            return undefined;
        }
        if (this.phase === "running") {
            this.makeBreakDue(now);
        }
        this.checkSinBins(now);
        const end = this.breakEnd;
        if (end !== undefined && !this.breakEndAlerted && now >= end) {
            this.breakEndAlerted = true;
            if (!this.breakIsHalftime) {
                this.breakEnd = undefined;
                if (this.breakStoppageRunning) {
                    this.closeStoppage(end);
                }
            }
            return this.vibeBreak ? "breakEnd" : undefined;
        }
        // VIB-1: with stoppage tracked, decided as the length is reached: with stoppage time, full time vibrates once with
        // nothing to answer, so the next press starts a stoppage; with none, it repeats until a press, as no added time alert
        // follows, and stands for that alert this period, so a stoppage started after it brings no other.
        // TMR-15: a stopping clock has no added time to follow, so its full time always repeats.
        if (this.setup.trackStoppage && !this.fullTimeRepeats && this.fullTimeDue(now)) {
            if (this.stoppageTotalMs(now) > 0 && !this.setup.stoppingClock) {
                this.fullTimeAcked = true;
                return "fullTime";
            }
            this.fullTimeRepeats = true;
            this.addedAcked = true;
        }
        if (this.hasActiveAlert(now)) {
            if (now - this.lastRepeat >= this.repeatSec * 1000) {
                this.lastRepeat = now;
                // VIB-7 comes after full time, so it's the news when both are waiting; a sin bin over is newer still (EVT-12).
                return this.sinBinAlertActive ? "sinBinEnd" : this.addedAlertActive(now) ? "addedTime" : this.fullTimeAlertActive(now) ? "fullTime" : "breakStart";
            }
            return undefined;
        }
        // TMR-12: no reminders for the stoppage a break started: the break clock is running.
        if (this.phase === "running" && this.isStoppageActive && !this.breakStoppageRunning && this.vibeStoppage && this.reminderSec > 0
            && now - this.lastReminder >= this.reminderSec * 1000) {
            this.lastReminder = now;
            return "reminder";
        }
        return undefined;
    }

    /**
     * EVT-12: the time played in the match so far, by the match clock: each ended period's time (its E event), and
     * the period being played (stood still while suspended). Breaks add nothing, so a sin bin waits through them.
     */
    playedMs(now: number) {
        const inPlay = this.phase === "running" || this.phase === "golden" || this.phase === "suspended";
        return this.endedMs(() => true) + (inPlay ? this.matchMs(now) : 0);
    }

    private endedMs(which: (period: number) => boolean) {
        return this.events.reduce((sum, e) => sum + (e.type === EventType.periodEnd && e.seconds >= 0 && which(e.period) ? e.seconds * 1000 : 0), 0);
    }

    /**
     * EVT-12: the stoppage so far in the match (TMR-10): each one recorded (S, its length in extra) and the one running,
     * stood still while suspended. None without stoppage tracked.
     */
    private stoppedMs(now: number) {
        // TMR-15: a stopping clock has already stood still for them.
        if (this.setup.stoppingClock) {
            return 0;
        }
        const recorded = this.events.reduce((sum, e) => sum + (e.type === EventType.stoppage ? (e.extra ?? 0) * 1000 : 0), 0);
        return recorded + (this.stoppageStart === undefined ? 0 : this.clockNow(now) - this.stoppageStart);
    }

    /**
     * EVT-12: the sin bins' clock: the time played less the stoppage in it, so a sin bin holds while a stoppage runs, as
     * IFAB's guidance adds the time lost in one (the owner's choice, 2026-11-10).
     */
    private sinBinClockMs(now: number) {
        return this.playedMs(now) - this.stoppedMs(now);
    }

    /**
     * EVT-12: the sin bins' clock when one began: the time played then (before kickoff 0:00, at a break the end of the
     * period before), less the stoppage before it, and of a stoppage running then, the part before it.
     */
    private sinBinFromMs(e: MatchEvent, now: number) {
        const before = this.endedMs((p) => p < e.period);
        const played = before + (e.seconds >= 0 ? e.seconds * 1000 : e.seconds === EventTime.atBreak ? this.endedMs((p) => p === e.period) : 0);
        const index = this.events.indexOf(e);
        let stopped = this.events.slice(0, index).reduce((sum, s) => sum + (s.type === EventType.stoppage ? (s.extra ?? 0) * 1000 : 0), 0);
        if (this.setup.stoppingClock) {
            // TMR-15: the clock stood still for the stoppages, so the time played is the sin bins' clock.
            return played;
        }
        if (e.seconds >= 0) {
            // Given during a stoppage: the first one recorded after it, if it started before it, or the one running now.
            const next = this.events.slice(index + 1).find((s) => s.type === EventType.stoppage);
            if (next) {
                stopped += next.period === e.period ? clamp((e.seconds - next.seconds) * 1000, 0, (next.extra ?? 0) * 1000) : 0;
            } else if (this.stoppageStart !== undefined && this.periodStart !== undefined && this.period === e.period) {
                stopped += clamp(e.seconds * 1000 - (this.stoppageStart - this.periodStart), 0, this.clockNow(now) - this.stoppageStart);
            }
        }
        return played - stopped;
    }

    /** EVT-12: a sin bin's time left, by the sin bins' clock, from its length down to 0. */
    sinBinLeftMs(e: MatchEvent, now: number) {
        const length = (e.extra ?? 0) * 1000;
        return clamp(length - (this.sinBinClockMs(now) - this.sinBinFromMs(e, now)), 0, length);
    }

    /** EVT-12: sin bins not ended by the player being sent off after it (a red, a second yellow or a second sin bin). */
    private liveSinBins() {
        return this.events.filter((e, i) => e.type === EventType.sinBin
            && !(e.player !== undefined && this.events.slice(i + 1).some((later) => isSendOff(later.type) && later.team === e.team && later.player === e.player)));
    }

    /** EVT-12: the sin bins counting down, the one ending first first. */
    runningSinBins(now: number) {
        return this.liveSinBins().map((e) => ({ e, left: this.sinBinLeftMs(e, now) })).filter((s) => s.left > 0)
            .sort((a, b) => a.left - b.left).map((s) => s.e);
    }

    teamCode(team: number) {
        return team === AWAY ? this.setup.away : this.setup.home;
    }

    /** EVT-12, UI-1: the sin bin pill, "AWY 7 4:12" for the one ending first, "+1" after it for each other; undefined for none. */
    sinBinPill(now: number): string | undefined {
        const running = this.runningSinBins(now);
        if (running.length === 0) {
            return undefined;
        }
        const first = running[0];
        const more = running.length > 1 ? ` +${running.length - 1}` : "";
        return `${this.teamCode(first.team)} ${first.player !== undefined ? `${first.player} ` : ""}${formatCountdown(this.sinBinLeftMs(first, now))}${more}`;
    }

    /** EVT-12: "AWY #7 can return", for the first sin bin over; undefined for none. */
    sinBinReturnText(): string | undefined {
        const e = this.sinBinReturns[0];
        return e && `${this.teamCode(e.team)}${e.player !== undefined ? ` #${e.player}` : ""} can return`;
    }

    /** EVT-12: each sin bin's end, announced once, when the sin bins' clock reaches it. */
    private checkSinBins(now: number) {
        const clock = this.sinBinClockMs(now);
        for (const e of this.liveSinBins()) {
            const end = this.sinBinFromMs(e, now) + (e.extra ?? 0) * 1000;
            if (this.sinBinCheckedMs < end && end <= clock && !this.sinBinReturns.includes(e)) {
                this.sinBinReturns.push(e);
                this.lastRepeat = 0;
            }
        }
        this.sinBinCheckedMs = clock;
    }

    private makeBreakDue(now: number) {
        if (this.scheduledBreakDone || this.periodStart === undefined || this.breakAtSec < 0 || this.setup.breakLenSec <= 0 || this.isExtraTime) {
            return;
        }
        if (this.matchMs(now) < this.breakAtSec * 1000) {
            return;
        }
        this.scheduledBreakDone = true;
        this.breakDue = true;
        this.breakDueSilenced = false;
        this.lastRepeat = 0;
    }

    /** UI-4: time until the break is due, or undefined when none is still to come this period. */
    breakDueInMs(now: number): number | undefined {
        if (this.phase !== "running" || this.scheduledBreakDone || this.periodStart === undefined || this.breakAtSec < 0 || this.setup.breakLenSec <= 0 || this.isExtraTime) {
            return undefined;
        }
        return Math.max(this.breakAtSec * 1000 - this.matchMs(now), 0);
    }

    /** TMR-7: the referee accepts the due break. */
    startBreak(now: number) {
        if (this.phase !== "running" || !this.breakDue) {
            return;
        }
        this.breakDue = false;
        this.breakIsHalftime = false;
        this.breakEnd = now + this.setup.breakLenSec * 1000;
        this.breakEndAlerted = false;
        // TMR-12: its time is added on, as a stoppage that ends with the break. TMR-15: a stopping clock stops for it, whatever the setting.
        if (this.setup.trackStoppage && (this.setup.breakStoppage || this.setup.stoppingClock) && this.stoppageStart === undefined) {
            this.stoppageStart = now;
            this.breakStoppageRunning = true;
        }
    }

    skipBreak() {
        this.breakDue = false;
    }

    /** TMR-7: ends a running halfway break early; the time it took counts as stoppage (TMR-12). */
    endBreakEarly(now: number) {
        if (this.phase === "running" && this.breakEnd !== undefined) {
            this.breakEnd = undefined;
            if (this.breakStoppageRunning) {
                this.closeStoppage(now);
            }
        }
    }

    /** TMR-7: a break started by mistake: it's due again, and counts for nothing. */
    resetBreak() {
        if (this.phase === "running" && this.breakEnd !== undefined) {
            this.breakEnd = undefined;
            this.breakDue = true;
            this.breakDueSilenced = true;
            if (this.breakStoppageRunning) {
                this.stoppageStart = undefined;
                this.breakStoppageRunning = false;
            }
        }
    }

    selectKickoff(team: number) {
        if (this.phase === "pre" || this.phase === "ready") {
            this.kickoff = team;
            this.phase = "ready";
        } else if (this.phase === "nextKickoff") {
            const next = this.period + 1;
            if (next >= this.setup.numPeriods) {
                this.etKickoff = (next - this.setup.numPeriods) % 2 === 0 ? team : 1 - team;
            } else {
                this.kickoff = next % 2 === 0 ? team : 1 - team;
            }
        }
    }

    /** PRE-3. */
    clearKickoff() {
        if (this.phase === "ready") {
            this.kickoff = -1;
            this.phase = "pre";
        }
    }

    /** PRE-3: fix a wrongly chosen team after the match has started (in extra time, its own, ET-7). */
    swapKickoff() {
        if (this.aboutExtraTime) {
            if (this.etKickoff >= 0) {
                this.etKickoff = 1 - this.etKickoff;
            }
        } else if (this.kickoff >= 0) {
            this.kickoff = 1 - this.kickoff;
        }
    }

    /** PRE-6: back to kickoff after an accidental start, in the first period only. Cards given before kickoff stay. */
    restart() {
        if (this.phase !== "running" || this.period !== 0) {
            return;
        }
        this.beginPeriod(0);
        this.periodStart = undefined;
        this.phase = "ready";
        this.score = [0, 0];
        this.events = this.events.filter((e) => e.seconds === EventTime.beforeKickoff);
        this.startedAt = [];
        this.sinBinReturns = [];
        this.sinBinCheckedMs = 0;
    }

    /** UI-21, TMR-11: the match screen is fixed here, so it doesn't change during the match. */
    start(now: number, screen: WatchScreen = defaultWatchScreen) {
        if (this.phase !== "ready") {
            return;
        }
        this.period = 0;
        this.screen = screen;
        this.beginPeriod(now);
        this.startedAt = [Math.trunc(now / 1000)];
        this.phase = "running";
    }

    private beginPeriod(now: number) {
        this.periodStart = now;
        this.stoppageMs = 0;
        this.stoppageStart = undefined;
        this.breakStoppageRunning = false;
        this.breakEnd = undefined;
        this.breakIsHalftime = false;
        this.scheduledBreakDone = false;
        this.fullTimeAcked = false;
        this.addedAcked = false;
        this.fullTimeRepeats = false;
        this.breakDue = false;
        this.breakDueSilenced = false;
        this.breakEndAlerted = false;
        this.lastRepeat = 0;
    }

    /** TMR-10: only when tracked. */
    toggleStoppage(now: number) {
        if (this.phase !== "running" || !this.setup.trackStoppage) {
            return;
        }
        if (this.stoppageStart === undefined) {
            this.stoppageStart = now;
            this.lastReminder = now;
        } else {
            this.closeStoppage(now);
        }
    }

    private closeStoppage(now: number) {
        const start = this.stoppageStart;
        if (start === undefined) {
            return;
        }
        // The period's time it began at: on a stopping clock (TMR-15), where the clock stood still.
        const seconds = Math.trunc(this.matchMs(start) / 1000);
        const duration = now - start;
        this.stoppageMs += duration;
        this.stoppageStart = undefined;
        this.breakStoppageRunning = false;
        this.events.push({ type: EventType.stoppage, team: -1, period: this.period, seconds, extra: Math.trunc(duration / 1000) });
    }

    /** EVT-16, TMR-15: a stoppage started by an event, as Start/Stop starts one, unless one is running. */
    private stopFor(now: number) {
        if (this.phase === "running" && this.setup.trackStoppage && this.stoppageStart === undefined) {
            this.stoppageStart = now;
            this.lastReminder = now;
        }
    }

    /** TMR-15: a goal or card recorded stops a stopping clock, when it's set to. */
    private get stopsForGoalsCards() {
        return this.setup.stoppingClock && this.setup.stopForGoalsCards;
    }

    /** EVT-1, EVT-5, EVT-7: goals during play, cards at any time. True when it's a second yellow. */
    addEvent(type: string, team: number, given: number | undefined, now: number) {
        if (isGoal(type) && this.phase !== "running") {
            return false;
        }
        // EVT-12: only with sin bins on, and not once the clock has nothing left to run (the shoot-out, after full time).
        const sinBin = type === EventType.sinBin;
        if (sinBin && (!this.setup.sinBins || this.phase === "penalties" || this.phase === "done")) {
            return false;
        }
        // EVT-3: 00 on the entry is no number.
        const player = given === 0 ? undefined : given;
        // EVT-5; EVT-12: a second sin bin is a send-off too; a sin bin and a caution don't combine (Q-22).
        const second = (type === EventType.yellow || sinBin) && player !== undefined && this.events.some((e) => e.type === type && e.team === team && e.player === player);
        const recorded = second ? (sinBin ? EventType.secondSinBin : EventType.secondYellow) : type;
        this.events.push({ type: recorded, team, period: this.period, seconds: this.eventSeconds(now), ...(player !== undefined ? { player } : {}), ...(sinBin ? { extra: this.setup.sinBinSec } : {}) });
        // EVT-16: an injury in play starts the stoppage, as Start/Stop does, unless one is running; at a break it has none.
        // TMR-15: so does a goal or card on a stopping clock, Start/Stop starting it again at the restart.
        if (recorded === EventType.injury || (this.stopsForGoalsCards && (isGoal(recorded) || isCard(recorded)))) {
            this.stopFor(now);
        }
        if (isGoal(recorded)) {
            this.score[team] += 1;
            // ET-6: the first goal in extra time wins it; End match or Undo comes next.
            if (this.goldenGoal && this.isExtraTime) {
                this.phase = "golden";
            }
        }
        return second;
    }

    /**
     * EVT-15: a team official's caution or send-off, at any time as a player's card (EVT-7), with the role
     * (officialRoles) in extra. It never makes a second yellow: officials aren't matched by number.
     */
    addOfficialCard(red: boolean, team: number, role: number, now: number) {
        this.events.push({ type: red ? EventType.officialRed : EventType.officialYellow, team, period: this.period, seconds: this.eventSeconds(now), extra: role });
        // TMR-15: a card stops a stopping clock.
        if (this.stopsForGoalsCards) {
            this.stopFor(now);
        }
    }

    /** EVT-14: the card's reason, chosen after the number: it goes to the most recent card, replacing one given before. */
    giveReason(code: string) {
        const card = this.events.findLast((e) => isCard(e.type));
        if (card) {
            card.reason = code;
        }
    }

    /** EVT-14: the reasons as the upload sends them beside the events: [the card's index in events, its code]. */
    cardReasons(): [number, string][] {
        return this.events.flatMap((e, i) => (e.reason ? [[i, e.reason] as [number, string]] : []));
    }

    /**
     * TMR-14: Adjust clock, during play: the period's clock moves by whole seconds (forward for a clock started
     * late), by moving the period's kickoff time, so every clock style, the halfway break and the alerts follow.
     * Never before the kickoff. Events already recorded keep their times. Recorded as CK at the new time, with the
     * change; false when nothing changed.
     */
    adjustClock(changeSec: number, now: number) {
        if (this.phase !== "running" || this.periodStart === undefined) {
            return false;
        }
        const change = Math.max(Math.trunc(changeSec), -Math.trunc(this.matchMs(now) / 1000));
        if (change === 0) {
            return false;
        }
        this.shiftClock(change, now);
        this.events.push({ type: EventType.clockAdjusted, team: -1, period: this.period, seconds: Math.trunc(this.matchMs(now) / 1000), extra: change });
        return true;
    }

    private shiftClock(change: number, now: number) {
        this.periodStart = this.periodStart! - change * 1000;
        const elapsed = this.matchMs(now);
        // The alerts and the halfway break come again when the clock is put back before them.
        if (elapsed < this.currentPeriodSec * 1000) {
            this.fullTimeAcked = false;
            // VIB-1: decided again when the length is reached again.
            this.fullTimeRepeats = false;
        }
        this.rearmAdded(now);
        if (this.breakDue && this.breakAtSec >= 0 && elapsed < this.breakAtSec * 1000) {
            this.breakDue = false;
            this.breakDueSilenced = false;
            this.scheduledBreakDone = false;
        }
    }

    private rearmAdded(now: number) {
        if (this.matchMs(now) < this.currentPeriodSec * 1000 + this.stoppageTotalMs(now)) {
            this.addedAcked = false;
        }
    }

    /**
     * TMR-14: Adjust added time, with stoppage tracked: the stoppage total moves by whole seconds, for a stoppage
     * started or ended late; never below 0:00. A stoppage running carries on. Recorded as CA, with the change.
     */
    adjustAdded(changeSec: number, now: number) {
        // TMR-15: a stopping clock has no added time.
        if (this.phase !== "running" || !this.setup.trackStoppage || this.setup.stoppingClock) {
            return false;
        }
        const change = Math.max(Math.trunc(changeSec), -Math.trunc(this.stoppageTotalMs(now) / 1000));
        if (change === 0) {
            return false;
        }
        this.shiftAdded(change, now);
        this.events.push({ type: EventType.addedAdjusted, team: -1, period: this.period, seconds: this.eventSeconds(now), extra: change });
        return true;
    }

    private shiftAdded(change: number, now: number) {
        this.stoppageMs += change * 1000;
        // Taken back further than the stoppages before the running one: the running one is shorter.
        if (this.stoppageMs < 0 && this.stoppageStart !== undefined) {
            this.stoppageStart = Math.min(this.stoppageStart - this.stoppageMs, now);
        }
        this.stoppageMs = Math.max(this.stoppageMs, 0);
        this.rearmAdded(now);
    }

    /** ET-6: only with extra time. */
    get goldenGoal() {
        return this.setup.extraTime && this.setup.goldenGoal;
    }

    private eventSeconds(now: number) {
        switch (this.phase) {
            case "running":
            case "golden":
            // TMR-13: a card while suspended is at the time play stopped.
            case "suspended":
                return Math.trunc(this.matchMs(now) / 1000);
            case "pre":
            case "ready":
                return EventTime.beforeKickoff;
            case "done":
                return EventTime.afterFullTime;
            case "penalties":
                return EventTime.penalties;
            default:
                return EventTime.atBreak;
        }
    }

    /**
     * INP-6: the most recent goal, card or shoot-out kick, only while it's in the current period: while play
     * runs, recorded since this period's kickoff; at a break, in the period just ended or the break itself. An
     * earlier period's event can't be undone (undefined), so the game menu leaves Undo out.
     */
    get lastUndoableEvent(): MatchEvent | undefined {
        const playing = this.phase === "running" || this.phase === "golden";
        // TMR-13: while suspended, as during play, but not a clock's correction.
        const inPlay = playing || this.phase === "suspended";
        const event = this.events.findLast((e) => isUndoable(e.type, playing));
        if (!event || event.period !== this.period || (inPlay && event.seconds < 0)) {
            return undefined;
        }
        return event;
    }

    undoLastEvent(now = Date.now()) {
        const event = this.lastUndoableEvent;
        if (!event) {
            return;
        }
        // TMR-14: a correction taken back moves the clock back by its change.
        if (event.type === EventType.clockAdjusted) {
            this.shiftClock(-(event.extra ?? 0), now);
        } else if (event.type === EventType.addedAdjusted) {
            this.shiftAdded(-(event.extra ?? 0), now);
        }
        if (isGoal(event.type)) {
            this.score[event.team] -= 1;
            // ET-6: the golden goal taken back, so play goes on.
            if (this.phase === "golden") {
                this.phase = "running";
            }
        }
        this.events.splice(this.events.lastIndexOf(event), 1);
        // EVT-12: a sin bin taken back no longer waits for its return.
        this.sinBinReturns = this.sinBinReturns.filter((e) => e !== event);
    }

    /** ET-6: the team whose golden goal won (or wins, while End match is offered), or -1. */
    goldenWinner() {
        if (this.phase !== "golden" && !this.endedGolden) {
            return -1;
        }
        return this.events.findLast((e) => isGoal(e.type))?.team ?? -1;
    }

    /** ET-6: Undo on the golden goal screen: that goal goes, even with a card given since, and the period carries on. */
    undoGoldenGoal() {
        if (this.phase !== "golden") {
            return;
        }
        const index = this.events.findLastIndex((e) => isGoal(e.type));
        if (index >= 0) {
            this.score[this.events[index].team] -= 1;
            this.events.splice(index, 1);
        }
        this.phase = "running";
    }

    /** TMR-5, TMR-6. True when it ended the match. */
    endPeriod(now: number) {
        if (this.phase !== "running") {
            return false;
        }
        if (this.periodEndsMatch) {
            this.finish(now);
            return true;
        }
        this.closeStoppage(now);
        this.events.push({ type: EventType.periodEnd, team: -1, period: this.period, seconds: Math.trunc(this.matchMs(now) / 1000) });
        this.breakDue = false;
        if (this.isLastPeriod) {
            this.phase = "decide";
            this.breakEnd = undefined;
        } else {
            this.beginBreak(now);
        }
        return false;
    }

    private beginBreak(now: number) {
        this.phase = "break";
        this.breakIsHalftime = true;
        this.breakEnd = now + this.setup.halftimeSec * 1000;
        this.breakEndAlerted = this.setup.halftimeSec <= 0;
    }

    /** ET-1: extra time or penalties when level, otherwise the end. */
    get recommendedDecision(): Decision {
        if (this.score[HOME] === this.score[AWAY]) {
            if (this.canExtraTime) {
                return "extraTime";
            }
            if (this.canPenalties) {
                return "penalties";
            }
        }
        return "endMatch";
    }

    chooseExtraTime(now: number) {
        if (this.phase === "decide" && this.canExtraTime) {
            this.beginBreak(now);
        }
    }

    choosePenalties() {
        if (this.phase === "decide" && this.canPenalties) {
            this.phase = "penalties";
            this.penFirst = -1;
            this.penStarted = false;
        }
    }

    selectPenaltyFirst(team: number) {
        if (this.phase === "penalties" && !this.penStarted) {
            this.penFirst = team;
        }
    }

    startPenalties() {
        if (this.phase === "penalties" && !this.penStarted && this.penFirst >= 0) {
            this.penStarted = true;
        }
    }

    nextKicker() {
        const first = this.penFirst < 0 ? HOME : this.penFirst;
        return this.penaltyKicks(first) === this.penaltyKicks(1 - first) ? first : 1 - first;
    }

    recordKick(scored: boolean) {
        if (this.phase !== "penalties" || !this.penStarted || this.penaltyWinner() >= 0) {
            return;
        }
        this.events.push({ type: scored ? EventType.penScored : EventType.penMissed, team: this.nextKicker(), period: this.period, seconds: EventTime.penalties });
    }

    penaltyKicks(team: number) {
        return this.events.filter((e) => e.team === team && isKick(e.type)).length;
    }
    penaltyGoals(team: number) {
        return this.events.filter((e) => e.team === team && e.type === EventType.penScored).length;
    }
    kickResults(team: number) {
        return this.events.filter((e) => e.team === team && isKick(e.type)).map((e) => e.type === EventType.penScored);
    }

    /** ET-4: the winner, or -1 while undecided. */
    penaltyWinner() {
        const goals = [this.penaltyGoals(HOME), this.penaltyGoals(AWAY)];
        const kicks = [this.penaltyKicks(HOME), this.penaltyKicks(AWAY)];
        if (kicks[HOME] <= 5 && kicks[AWAY] <= 5) {
            for (const team of [HOME, AWAY]) {
                if (goals[team] > goals[1 - team] + 5 - kicks[1 - team]) {
                    return team;
                }
            }
        } else if (kicks[HOME] === kicks[AWAY] && goals[HOME] !== goals[AWAY]) {
            return goals[HOME] > goals[AWAY] ? HOME : AWAY;
        }
        return -1;
    }

    penaltyScore(): [number, number] | undefined {
        return this.penFirst < 0 && this.penaltyKicks(HOME) === 0 && this.penaltyKicks(AWAY) === 0 ? undefined : [this.penaltyGoals(HOME), this.penaltyGoals(AWAY)];
    }

    endHalftime() {
        if (this.phase !== "break") {
            return;
        }
        this.phase = "nextKickoff";
        this.breakEnd = undefined;
        this.breakIsHalftime = false;
    }

    startNextPeriod(now: number) {
        // ET-7: ET1 waits for its kickoff team.
        if (this.phase !== "nextKickoff" || this.kickoffFor(this.period + 1) < 0) {
            return;
        }
        this.period += 1;
        this.beginPeriod(now);
        this.startedAt.push(Math.trunc(now / 1000));
        this.phase = "running";
    }

    /** EVT-11: ended for good here, with the score as it stands. */
    abandon(now: number, reason: number) {
        this.finish(now, reason);
    }

    get isAbandoned() {
        return this.events.some((e) => e.type === EventType.abandon);
    }

    finish(now: number, abandonReason?: number) {
        if (this.phase === "done") {
            return;
        }
        let seconds: number = this.phase === "penalties" ? EventTime.penalties : EventTime.atBreak;
        // ET-6: End match after a golden goal, not an abandonment from its screen.
        this.endedGolden = this.phase === "golden" && abandonReason === undefined;
        if (this.phase === "running" || this.phase === "golden" || this.phase === "suspended") {
            // TMR-13: abandoned while suspended, the period ends where play stopped.
            this.closeStoppage(this.clockNow(now));
            seconds = Math.trunc(this.matchMs(now) / 1000);
            this.events.push({ type: EventType.periodEnd, team: -1, period: this.period, seconds });
        }
        if (abandonReason !== undefined) {
            this.events.push({ type: EventType.abandon, team: -1, period: this.period, seconds, extra: abandonReason });
        }
        this.phase = "done";
        this.breakEnd = undefined;
        this.clearSuspension();
    }

    /**
     * TMR-13: Suspend match, during play, for a lightning or weather delay: every clock stops where it is (the
     * match clock, the stoppage clock, a running halfway break) until Resume. Recorded as SU at the period's
     * time, with the reason (suspendReasons) in extra. For lightning, a 30:00 countdown starts.
     */
    suspend(reason: number, now: number) {
        if (this.phase !== "running" || !suspendReasons.some(([n]) => n === reason)) {
            return false;
        }
        this.events.push({ type: EventType.suspended, team: -1, period: this.period, seconds: this.eventSeconds(now), extra: reason });
        this.phase = "suspended";
        this.suspendedAt = now;
        this.suspendReason = reason;
        this.lightningFrom = reason === LIGHTNING ? now : undefined;
        this.lightningAlerted = false;
        return true;
    }

    /** TMR-13: Lightning again, while suspended for lightning: the 30:00 countdown starts over. */
    lightningAgain(now: number) {
        if (this.phase === "suspended" && this.suspendReason === LIGHTNING) {
            this.lightningFrom = now;
            this.lightningAlerted = false;
        }
    }

    /**
     * TMR-13: Resume: the period carries on from where it stopped, every clock moved on by the time suspended,
     * so it's neither played time nor added time. Recorded as RS at the same period's time, with the whole
     * seconds suspended in extra.
     */
    resume(now: number) {
        if (this.phase !== "suspended" || this.suspendedAt === undefined) {
            return;
        }
        const shift = Math.max(now - this.suspendedAt, 0);
        if (this.periodStart !== undefined) {
            this.periodStart += shift;
        }
        if (this.stoppageStart !== undefined) {
            this.stoppageStart += shift;
        }
        if (this.breakEnd !== undefined) {
            this.breakEnd += shift;
        }
        this.lastReminder += shift;
        this.phase = "running";
        this.clearSuspension();
        this.events.push({ type: EventType.resumed, team: -1, period: this.period, seconds: Math.trunc(this.matchMs(now) / 1000), extra: Math.trunc(shift / 1000) });
    }

    private clearSuspension() {
        this.suspendedAt = undefined;
        this.suspendReason = -1;
        this.lightningFrom = undefined;
        this.lightningAlerted = false;
    }
}
