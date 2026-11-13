import type { MatchFormat } from "./format.ts";
import type { Event, MatchRecord } from "./matchRecord.ts";

// Correcting a played match's result, or entering one without a watch (RES-1 to RES-6): the rules
// every app follows when the referee edits the events, so the score always agrees with the goals and
// a second caution is always a send-off. The phones keep copies (Result.kt, Result.swift), tested
// with the same cases (schema/test/result.test.ts).

type Score = { home: number; away: number };
export type ResultFields = Pick<MatchRecord, "outcome" | "score" | "penalties" | "goldenGoal" | "events">;

/** The parts of a record a correction can change (RES-3), with nothing else. */
export function resultFields(record: ResultFields): ResultFields {
    return {
        outcome: record.outcome,
        score: record.score,
        ...(record.penalties ? { penalties: record.penalties } : {}),
        ...(record.goldenGoal !== undefined ? { goldenGoal: record.goldenGoal } : {}),
        events: record.events,
    };
}

/** Whether two results are the same, whatever order their fields were written in. */
export function sameResult(a: ResultFields, b: ResultFields): boolean {
    const canonical = (value: unknown): unknown => Array.isArray(value)
        ? value.map(canonical)
        : value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => [k, canonical(v)]))
            : value;
    return JSON.stringify(canonical(resultFields(a))) === JSON.stringify(canonical(resultFields(b)));
}

/** RES-1: the score is the goals, never typed on its own, so the two can't disagree. */
export function scoreOf(events: Event[]): Score {
    const score = { home: 0, away: 0 };
    for (const e of events) {
        if (e.type === "goal") {
            score[e.team] += 1;
        }
    }
    return score;
}

/** The shoot-out's score from its kicks, or undefined when there wasn't one. */
export function penaltiesOf(events: Event[]): Score | undefined {
    const kicks = events.filter((e) => e.type === "penaltyKick");
    if (!kicks.length) {
        return undefined;
    }
    const score = { home: 0, away: 0 };
    for (const k of kicks) {
        if (k.type === "penaltyKick" && k.scored) {
            score[k.team] += 1;
        }
    }
    return score;
}

/**
 * RES-6 (EVT-5): a second caution to the same numbered player of the same team, in event order, is
 * a second caution, which counts as a send-off; one that's no longer second (the first was deleted)
 * goes back to being a caution. Cards with no number, and team officials', are left as they are.
 * EVT-12: sin bins the same way, on their own: a second sin bin for the same number is a second sin bin
 * (a send-off), and one no longer second goes back to a sin bin; a sin bin and a caution don't combine (Q-22).
 */
export function settleCautions(events: Event[]): Event[] {
    const cautioned = new Set<string>();
    const binned = new Set<string>();
    return events.map((e) => {
        const caution = e.type === "caution" || e.type === "secondCaution";
        const sinBin = e.type === "sinBin" || e.type === "secondSinBin";
        if ((!caution && !sinBin) || e.offender.kind !== "player" || !e.offender.number) {
            return e;
        }
        const who = `${e.team} ${e.offender.number}`;
        const seen = caution ? cautioned : binned;
        const second = seen.has(who);
        seen.add(who);
        const type = caution ? (second ? "secondCaution" : "caution") : second ? "secondSinBin" : "sinBin";
        return type === e.type ? e : ({ ...e, type } as Event);
    });
}

/** The minute a period starts at, and its length, in whole minutes. */
function periodSpan(format: MatchFormat, period: number): { start: number; length: number } {
    const regular = period <= format.periods;
    const length = (regular ? format.periodSec : format.extraTimePeriodSec) / 60;
    const start = regular
        ? (period - 1) * format.periodSec / 60
        : format.periods * format.periodSec / 60 + (period - format.periods - 1) * format.extraTimePeriodSec / 60;
    return { start, length };
}

/**
 * RES-1: a minute as a referee writes it, "23" or "45+2" (an apostrophe allowed), to seconds into
 * the period, so the match page shows it back as written. Undefined when it isn't in that period.
 */
export function periodSecOf(format: MatchFormat, period: number, text: string): number | undefined {
    const parsed = text.trim().replace(/['’]$/, "").match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
    if (!parsed) {
        return undefined;
    }
    const { start, length } = periodSpan(format, period);
    const minute = Number(parsed[1]);
    if (parsed[2] !== undefined) {
        // Added time: "45+2" only after the period's last minute.
        const added = Number(parsed[2]);
        return minute === start + length && added >= 1 ? (length + added - 1) * 60 : undefined;
    }
    const into = minute - start;
    return into >= 1 && into <= length ? (into - 1) * 60 : undefined;
}

/** The minute an event shows as, "23'" or "45+2'": the inverse of periodSecOf. */
export function minuteText(format: MatchFormat, period: number, periodSec: number): string {
    const { start, length } = periodSpan(format, period);
    const minute = Math.floor(periodSec / 60) + 1;
    return minute > length ? `${start + length}+${minute - length}'` : `${start + minute}'`;
}

/**
 * RES-1: a result after editing its events: the cautions settled, the events in the order they
 * happened, and the score and shoot-out worked out from them.
 */
export function withEvents<R extends ResultFields>(record: R, events: Event[]): R {
    const order = (e: Event) => ({ beforeKickoff: 0, play: 1, break: 1, afterFullTime: 2, penalties: 3 })[e.when];
    const sorted = events
        .map((e, i) => ({ e, i }))
        .sort((a, b) => order(a.e) - order(b.e)
            || (a.e.when === "play" || a.e.when === "break" ? (a.e.period ?? 0) - (b.e.period ?? 0) || (a.e.when === "break" ? 1 : 0) - (b.e.when === "break" ? 1 : 0) || (a.e.periodSec ?? 0) - (b.e.periodSec ?? 0) : 0)
            || a.i - b.i)
        .map(({ e }) => e);
    const settled = settleCautions(sorted);
    const penalties = penaltiesOf(settled);
    const { penalties: _old, ...rest } = record;
    return { ...rest, events: settled, score: scoreOf(settled), ...(penalties ? { penalties } : {}) } as R;
}

/** RES-2: the periods of a match entered without a watch, from its format. */
export function periodsFromFormat(format: MatchFormat): MatchRecord["periods"] {
    return Array.from({ length: format.periods }, (_, i) => ({ period: i + 1, extraTime: false, playedSec: format.periodSec }));
}
