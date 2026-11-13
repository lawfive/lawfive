import type { ScreenSetup } from "@lawfive/schema";
import { secondStyle } from "@lawfive/schema";
import { breakClockTextAt, clockTextAt, formatClock, formatCountdown, periodLabel, stoppagePillAt } from "./match/engine.ts";

// UI-27: what the watch's screen shows at a moment of a match, for the match screen setup's pictures.
// The clock arithmetic is Try a match's engine's (match/engine.ts), and both run the shared cases with
// the watches (WCH-2); only the moments and the drawing are the website's.

type Style = ScreenSetup["mainClock"];

/** A 2 × 45 match with a 15-minute half-time and a 2-minute halfway break: what the pictures show. */
export const previewFormat = { periods: 2, periodSec: 45 * 60, halftimeSec: 15 * 60, breakSec: 2 * 60 };

/** Where a match is: in a period (and what its stoppage and halfway break are doing), or at half-time. */
export interface MatchMoment {
    phase: "running" | "halftime";
    period: number;
    /** Into the period, or into half-time. */
    elapsedMs: number;
    stoppageMs: number;
    stoppageRunning: boolean;
    /**
     * The halfway break: still to come (in this long), due, or running (this long left). It's timed as with
     * stoppage tracked, added on as stoppage and so due at halfway (TMR-7, TMR-12); screenAt brings it forward
     * when stoppage isn't tracked.
     */
    breakDueInMs?: number;
    breakDue?: boolean;
    breakLeftMs?: number;
}

export interface Pill {
    text: string;
    solid: boolean;
}

/** What the screen shows, in words and numbers; the picture draws it. */
export interface ScreenAt {
    phase: "running" | "halftime";
    period: string;
    clock: string;
    second?: string;
    added?: string;
    stoppage?: Pill;
    breakPill?: Pill;
    /** EVT-12: Try a match's sin bin pill, "AWY 7 4:12"; the pictures never have one. */
    sinBin?: string;
    /** TMR-15: Try a match's stopping clock standing still, drawn orange; the pictures' clock runs on (the Laws). */
    stopped?: boolean;
    /** UI-23: how far through the period, 0 to 1; 1 (orange) through added time. */
    progress: number;
    /** TMR-4: half-time's clock, and whether its time is up. */
    breakClock?: string;
    breakOver?: boolean;
}

export { formatClock, formatCountdown, periodLabel } from "./match/engine.ts";

/** TMR-11: the period's time in one of the styles, held at the period's end, as Try a match's engine reads it. */
export function clockText(style: Style, period: number, elapsedMs: number, periodSec = previewFormat.periodSec): string {
    return clockTextAt(style, period * periodSec, periodSec, elapsedMs);
}

/** TMR-4: the break clock, time left or time taken. */
export const breakClockText = breakClockTextAt;

/** The screen at a moment, with the setup's clocks, and stoppage tracked or not (TMR-10). */
export function screenAt(setup: ScreenSetup, m: MatchMoment, tracked: boolean): ScreenAt {
    const f = previewFormat;
    const periodMs = f.periodSec * 1000;
    const period = periodLabel(m.period, f.periods);
    if (m.phase === "halftime") {
        const left = Math.max(f.halftimeSec * 1000 - m.elapsedMs, 0);
        return { phase: "halftime", period, clock: "", progress: 0, breakClock: breakClockText(setup.breakClock, left, f.halftimeSec * 1000), breakOver: left === 0 };
    }
    // TMR-16: from the period's length, the added time left.
    const stoppage = tracked ? stoppagePillAt(m.stoppageMs, m.stoppageRunning, m.elapsedMs, periodMs) : undefined;
    // TMR-7: with no stoppage to add it to, the break is centered on halfway, due half its length earlier.
    const dueInMs = m.breakDueInMs === undefined || tracked ? m.breakDueInMs : m.breakDueInMs - (f.breakSec * 1000) / 2;
    const breakPill = m.breakDue || (dueInMs !== undefined && dueInMs <= 0)
        ? { text: "Break due", solid: true }
        : m.breakLeftMs !== undefined
            ? { text: breakClockText(setup.breakClock, m.breakLeftMs, f.breakSec * 1000), solid: true }
            : dueInMs !== undefined ? { text: formatCountdown(dueInMs), solid: false } : undefined;
    return {
        phase: "running",
        period,
        clock: clockText(setup.mainClock, m.period, m.elapsedMs),
        second: setup.clocks === "one" ? undefined : clockText(secondStyle(setup.mainClock, setup.secondClock), m.period, m.elapsedMs),
        added: m.elapsedMs >= periodMs ? `+${formatClock(m.elapsedMs - periodMs)}` : undefined,
        stoppage,
        breakPill,
        progress: Math.min(m.elapsedMs / periodMs, 1),
    };
}

/** Where a moment is in the match, for Play through: "1H 23:12", "2H 45:00 +1:12", "Half-time 3:00". */
export function momentLabel(m: MatchMoment): string {
    if (m.phase === "halftime") {
        return `Half-time ${formatClock(m.elapsedMs)}`;
    }
    const periodMs = previewFormat.periodSec * 1000;
    const label = `${periodLabel(m.period, previewFormat.periods)} ${clockText("up", m.period, m.elapsedMs)}`;
    return m.elapsedMs > periodMs ? `${label} +${formatClock(m.elapsedMs - periodMs)}` : label;
}

const min = (m: number, s = 0) => (m * 60 + s) * 1000;

/** UI-27's moments, in the order the setup shows them. */
export const moments: { id: string; name: string; stoppage?: boolean; moment: MatchMoment }[] = [
    { id: "first", name: "1st half, 23:12", moment: { phase: "running", period: 0, elapsedMs: min(23, 12), stoppageMs: min(1, 4), stoppageRunning: false } },
    { id: "second", name: "2nd half, 67:40", moment: { phase: "running", period: 1, elapsedMs: min(22, 40), stoppageMs: min(0, 38), stoppageRunning: false } },
    { id: "added", name: "Added time", moment: { phase: "running", period: 1, elapsedMs: min(46, 12), stoppageMs: min(2), stoppageRunning: false } },
    { id: "stoppage", name: "Stoppage running", stoppage: true, moment: { phase: "running", period: 0, elapsedMs: min(31, 5), stoppageMs: min(0, 24), stoppageRunning: true } },
    { id: "paused", name: "Stoppage paused", stoppage: true, moment: { phase: "running", period: 0, elapsedMs: min(33, 40), stoppageMs: min(1, 10), stoppageRunning: false } },
    { id: "coming", name: "Break coming up", moment: { phase: "running", period: 0, elapsedMs: min(12), stoppageMs: 0, stoppageRunning: false, breakDueInMs: min(10, 30) } },
    { id: "due", name: "Break due", moment: { phase: "running", period: 0, elapsedMs: min(22, 40), stoppageMs: min(0, 30), stoppageRunning: false, breakDue: true } },
    { id: "break", name: "Break running", moment: { phase: "running", period: 0, elapsedMs: min(23, 30), stoppageMs: min(1, 10), stoppageRunning: true, breakLeftMs: min(1, 20) } },
    { id: "halftime", name: "Half-time", moment: { phase: "halftime", period: 0, elapsedMs: min(3), stoppageMs: 0, stoppageRunning: false } },
];

/**
 * Play through (UI-27): a whole 2 × 45 match at a point from 0 to 1. The first half has its halfway
 * break due at halfway and taken at 22:50, added on as stoppage (TMR-7, TMR-12), and ends when that's used up at 47:00; then
 * half-time; the second half has a 1:30 stoppage at 30:00 too and ends at 48:30.
 */
export function playAt(at: number): MatchMoment {
    const first = min(47);
    const half = min(15);
    const second = min(48, 30);
    let t = Math.max(0, Math.min(at, 1)) * (first + half + second);
    if (t < first) {
        return halfAt(0, t, []);
    }
    t -= first;
    if (t < half) {
        return { phase: "halftime", period: 0, elapsedMs: t, stoppageMs: 0, stoppageRunning: false };
    }
    return halfAt(1, t - half, [[min(30), min(31, 30)]]);
}

function halfAt(period: number, t: number, stoppages: [number, number][]): MatchMoment {
    const due = min(22, 30);
    const taken = min(22, 50);
    const end = taken + min(2);
    const all: [number, number][] = [[taken, end], ...stoppages];
    const stoppageMs = all.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(t, b) - a), 0);
    const stoppageRunning = all.some(([a, b]) => t >= a && t < b);
    const moment: MatchMoment = { phase: "running", period, elapsedMs: t, stoppageMs, stoppageRunning };
    if (t < due) {
        moment.breakDueInMs = due - t;
    } else if (t < taken) {
        moment.breakDue = true;
    } else if (t < end) {
        moment.breakLeftMs = end - t;
    }
    return moment;
}
