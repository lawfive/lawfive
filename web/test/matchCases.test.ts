import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ScreenSetup } from "@lawfive/schema";
import { AWAY, HOME, Match, type WatchScreen, defaultWatchScreen, periodLabel } from "../src/match/engine.ts";
import { type MatchMoment, screenAt } from "../src/watchPreview.ts";

// WCH-2, UI-27: the match screen setup's pictures read the clocks as the watches do, by the shared
// screen cases (schema/match-cases/screen.json), which the watches' engines run too.

interface MatchCase {
    name: string;
    format: Record<string, unknown>;
    screen: Partial<WatchScreen>;
    steps: { at: number; do: Record<string, unknown>[]; expect?: Record<string, unknown> }[];
}

interface ScreenCase {
    name: string;
    screen: Partial<ScreenSetup>;
    tracked: boolean;
    at: { phase: "running" | "halftime"; period: number; elapsed: number; stoppage: number; stoppageRunning: boolean; halfwayBreak?: "coming" | "due" | "running"; breakStarted?: number };
    expect: Record<string, unknown>;
}

const all = JSON.parse(readFileSync(new URL("../../schema/generated/match-cases.json", import.meta.url), "utf8")) as { screen: ScreenCase[]; match: MatchCase[] };
const cases = all.screen;
// The pictures' halfway break: 2 minutes, due at 21:30 (watchPreview.ts's playAt).
const breakDue = (21 * 60 + 30) * 1000;
const breakLength = 2 * 60 * 1000;
// What a case leaves out of its screen: one clock counting up, as the watches' runners have it.
const caseScreen: ScreenSetup = { clocks: "one", mainClock: "up", secondClock: "down", breakClock: "down", edge: "none", names: true };

for (const c of cases) {
    test(`screen › ${c.name}`, () => {
        const moment: MatchMoment = { phase: c.at.phase, period: c.at.period, elapsedMs: c.at.elapsed, stoppageMs: c.at.stoppage, stoppageRunning: c.at.stoppageRunning };
        if (c.at.halfwayBreak === "coming") {
            moment.breakDueInMs = breakDue - c.at.elapsed;
        } else if (c.at.halfwayBreak === "due") {
            moment.breakDue = true;
        } else if (c.at.halfwayBreak === "running") {
            moment.breakLeftMs = breakLength - (c.at.elapsed - (c.at.breakStarted ?? 0));
        }
        const shown = screenAt({ ...caseScreen, ...c.screen }, moment, c.tracked) as unknown as Record<string, unknown>;
        for (const [key, expected] of Object.entries(c.expect)) {
            assert.deepEqual(shown[key] ?? null, expected, key);
        }
    });
}

// DEMO, WCH-2: Try a match's engine (src/match/engine.ts) plays every match case, as the watches do.
const team = (name: unknown) => (name === "away" ? AWAY : HOME);
const teamName = (t: number) => (t === HOME ? "home" : t === AWAY ? "away" : null);
const t0 = 1_800_000_000_000;

function act(m: Match, a: Record<string, unknown>, now: number, screen: WatchScreen) {
    switch (a.do) {
        case "kickoff": return m.selectKickoff(team(a.team));
        case "clearKickoff": return m.clearKickoff();
        case "start": return m.start(now, screen);
        case "swapKickoff": return m.swapKickoff();
        case "endPeriod": return m.endPeriod(now);
        case "endHalftime": return m.endHalftime();
        case "startNextPeriod": return m.startNextPeriod(now);
        case "stoppage": return m.toggleStoppage(now);
        case "undo": return m.undoLastEvent(now);
        case "restart": return m.restart();
        case "startBreak": return m.startBreak(now);
        case "skipBreak": return m.skipBreak();
        case "endBreakEarly": return m.endBreakEarly(now);
        case "resetBreak": return m.resetBreak();
        case "chooseExtraTime": return m.chooseExtraTime(now);
        case "choosePenalties": return m.choosePenalties();
        case "penaltyFirst": return m.selectPenaltyFirst(team(a.team));
        case "startPenalties": return m.startPenalties();
        case "kick": return m.recordKick(a.scored === true);
        case "acknowledge": return m.acknowledgeAlerts(now);
        case "finish": return m.finish(now);
        case "abandon": return m.abandon(now, a.reason as number);
        case "undoGoldenGoal": return m.undoGoldenGoal();
        case "event": return m.addEvent(a.type as string, team(a.team), a.player as number | undefined, now);
        case "official": return m.addOfficialCard(a.type === "R", team(a.team), a.role as number, now);
        case "adjustClock": return m.adjustClock(a.sec as number, now);
        case "adjustAdded": return m.adjustAdded(a.sec as number, now);
        case "suspend": return m.suspend(a.reason as number, now);
        case "resume": return m.resume(now);
        case "lightningAgain": return m.lightningAgain(now);
        case "reason": return m.giveReason(a.code as string);
        default: throw new Error(`unknown action ${JSON.stringify(a)}`);
    }
}

function shown(m: Match, key: string, now: number, alert: string | undefined): unknown {
    const nullable = (v: unknown) => v ?? null;
    switch (key) {
        case "clock": return m.clockDisplay(now).clock;
        case "added": return nullable(m.clockDisplay(now).added);
        case "second": return m.screen.clocks === "one" ? null : m.secondClockText(now);
        case "progress": return m.periodProgress(now);
        case "breakClock": return nullable(m.breakClockText(now));
        case "phase": return m.phase;
        case "period": return m.period;
        case "score": return m.score;
        case "kickoff": return teamName(m.firstKickoff);
        case "kickoffOnScreen": return teamName(m.kickoffTeamOnScreen);
        case "events": return m.events.length;
        case "alert": return nullable(alert);
        case "alerting": return m.hasActiveAlert(now);
        case "breakDue": return m.breakDue;
        case "stoppageRunning": return m.isStoppageActive;
        case "clockStopped": return m.clockStopped;
        case "stoppage": return nullable(m.stoppagePill(now));
        case "pens": return nullable(m.penaltyScore());
        case "endedGolden": return m.endedGolden;
        case "abandoned": return m.isAbandoned;
        case "periodLabel": return periodLabel(m.period, m.setup.numPeriods);
        case "stoppageMs": return m.stoppageTotalMs(now);
        case "breakStoppageRunning": return m.breakStoppageRunning;
        case "breakLeftMs": return nullable(m.breakRemainingMs(now));
        case "breakDueInMs": return nullable(m.breakDueInMs(now));
        case "screenOn": return m.wantsScreenOn(now);
        case "decision": return m.recommendedDecision;
        case "nextKicker": return teamName(m.nextKicker());
        case "penaltyWinner": return teamName(m.penaltyWinner());
        case "goldenWinner": return teamName(m.goldenWinner());
        case "suspendedMs": return nullable(m.suspendedMs(now));
        case "lightningLeftMs": return nullable(m.lightningLeftMs(now));
        case "sinBinPill": return nullable(m.sinBinPill(now));
        case "sinBins": return m.runningSinBins(now).length;
        case "sinBinReturn": {
            const e = m.sinBinReturns[0];
            return e ? { team: teamName(e.team), player: e.player ?? null } : null;
        }
        case "last": {
            const e = m.events.at(-1);
            return e && { type: e.type, team: teamName(e.team), seconds: e.seconds, player: e.player ?? null, extra: e.extra ?? null, reason: e.reason ?? null };
        }
        case "reasons": return m.cardReasons();
        default: return `(${key} isn't checked on the website)`;
    }
}

/**
 * TMR-8: the app closed and opened again. Try a match keeps nothing, so the engine is copied field by field, as
 * the watches read back what they saved: nothing it needs may live outside its fields.
 */
function reopened(m: Match): Match {
    return Object.assign(new Match(m.setup), structuredClone({ ...m }));
}

for (const c of all.match) {
    test(`match › ${c.name}`, () => {
        const { vibeAdded, vibeSinBin, ...format } = c.format;
        let m = new Match(format);
        if (vibeAdded === false) {
            m.vibeAdded = false;
        }
        if (vibeSinBin === false) {
            m.vibeSinBin = false;
        }
        const screen = { ...defaultWatchScreen, ...c.screen };
        c.steps.forEach((step, i) => {
            const now = t0 + step.at;
            for (const a of step.do) {
                if (a.do === "reopen") {
                    m = reopened(m);
                } else {
                    act(m, a, now, screen);
                }
            }
            if (!step.expect) {
                return;
            }
            // A tick fires what's due at this time, before the rest is read.
            const alert = "alert" in step.expect ? m.tick(now) : undefined;
            for (const [key, expected] of Object.entries(step.expect)) {
                if (key === "breakPill") {
                    continue; // The pictures' own: the engine has no halfway break pill.
                }
                const value = shown(m, key, now, alert);
                if (key === "last") {
                    for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
                        assert.deepEqual((value as Record<string, unknown> | undefined)?.[k], v, `step ${i + 1}: last.${k}`);
                    }
                } else if (typeof expected === "number" && typeof value === "number") {
                    assert.ok(Math.abs(value - expected) < 0.0001, `step ${i + 1}: ${key} expected ${expected}, got ${value}`);
                } else {
                    assert.deepEqual(value, expected, `step ${i + 1}: ${key}`);
                }
            }
        });
    });
}
