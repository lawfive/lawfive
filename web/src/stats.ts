import { ageGroupOrder, heatGrid } from "@lawfive/schema";

// The Stats page's arithmetic (STAT-3, WEB-24), kept apart from its drawing so it can be tested:
// shares that add up to 100, ranks with ties, the pitch's thirds under the heatmap, the running
// total as stretches of a track, the age groups' rows, the busiest times' grid and the watches' rings.

/** Whole percentages of a total that add up to 100 (largest remainder), or all 0 with nothing. */
export function shares(values: number[]): number[] {
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0) {
        return values.map(() => 0);
    }
    const exact = values.map((v) => (v / total) * 100);
    const out = exact.map(Math.floor);
    let left = 100 - out.reduce((s, v) => s + v, 0);
    const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
    for (const [, i] of order) {
        if (left <= 0) {
            break;
        }
        out[i] += 1;
        left -= 1;
    }
    return out;
}

/** Ranks as a league table gives them: equal values share a rank and the next skips (1, 2, 3, 3, 5). Values come sorted, most first. */
export function ranks(values: number[]): number[] {
    return values.map((v, i) => (i > 0 && v === values[i - 1] ? values.indexOf(v) + 1 : i + 1));
}

/**
 * TRK-9: the time in each third of the pitch's length (left, middle, right) and width (far side,
 * middle, near side), as whole percentages, from the heatmap's grid, which runs past the lines: time
 * beyond a goal line or touchline counts to the third it's beside, so an assistant's touchline counts.
 */
export function pitchThirds(cells: number[], cols: number, rows: number): { length: number[]; width: number[] } {
    const length = [0, 0, 0];
    const width = [0, 0, 0];
    // The drawing's size as shares of the pitch: the pitch is 1 × 1, with the margins around it.
    const w = 1 + 2 * heatGrid.marginLength;
    const h = 1 + 2 * heatGrid.marginWidth;
    const third = (at: number) => Math.min(2, Math.max(0, Math.floor(at * 3)));
    cells.forEach((sec, i) => {
        const x = ((i % cols) + 0.5) * (w / cols) - heatGrid.marginLength;
        const y = (Math.floor(i / cols) + 0.5) * (h / rows) - heatGrid.marginWidth;
        length[third(x)] += sec;
        width[third(y)] += sec;
    });
    return { length: shares(length), width: shares(width) };
}

/** A stretch of the running total's track: a month (or a year, for a long span) of games. */
export interface Stretch {
    key: string;
    /** "Aug", or "2026" for a year. */
    label: string;
    /** The year under the first stretch and each January's. */
    sub?: string;
    addedM: number;
    /** The running total at the stretch's last game. */
    totalM: number;
    /** That game's kickoff. */
    lastKickoff: string;
    games: number;
}

/**
 * The running total of distance as stretches (STAT-3): a month each, or a year each when the games
 * span more than `maxMonths` months, so a long career doesn't make slivers. Months by the browser's calendar.
 */
export function runningStretches(overTime: { kickoff: string; distanceM: number; totalM: number }[], maxMonths = 14): Stretch[] {
    const month = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const index = (iso: string) => new Date(iso).getFullYear() * 12 + new Date(iso).getMonth();
    const byYear = overTime.length > 0 && index(overTime[overTime.length - 1].kickoff) - index(overTime[0].kickoff) + 1 > maxMonths;
    const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
    const out: Stretch[] = [];
    for (const g of overTime) {
        const key = byYear ? month(g.kickoff).slice(0, 4) : month(g.kickoff);
        const last = out[out.length - 1];
        if (last && last.key === key) {
            last.addedM += g.distanceM;
            last.totalM = g.totalM;
            last.lastKickoff = g.kickoff;
            last.games += 1;
        } else {
            const d = new Date(g.kickoff);
            out.push({
                key,
                label: byYear ? key : monthName.format(d),
                ...(!byYear && (out.length === 0 || d.getMonth() === 0) ? { sub: String(d.getFullYear()) } : {}),
                addedM: g.distanceM, totalM: g.totalM, lastKickoff: g.kickoff, games: 1,
            });
        }
    }
    return out;
}

/** Round steps from 0 to at least max, four or five of them, ending close above it (0, 50 … 250 for 226). */
export function axisTicks(max: number): number[] {
    if (max <= 0) {
        return [0, 1];
    }
    const raw = max / 5;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
    const out = [0];
    while (out[out.length - 1] < max - step * 0.001) {
        out.push(Math.round((out[out.length - 1] + step) * 1000) / 1000);
    }
    return out;
}

/** Which labels along a line fit without touching: the first and last always, others where there's `gap` between. */
export function spacedLabels(positions: number[], gap: number): boolean[] {
    const shown = positions.map(() => false);
    if (positions.length === 0) {
        return shown;
    }
    const last = positions.length - 1;
    shown[last] = true;
    let previous = -Infinity;
    for (let i = 0; i < last; i++) {
        if (positions[i] - previous >= gap && positions[last] - positions[i] >= gap) {
            shown[i] = true;
            previous = positions[i];
        }
    }
    return shown;
}

/** An age group's row in By age group: its games by gender, its added time and its cards. */
export interface AgeGroupRow {
    ageGroup: string;
    games?: { male: number; female: number; coed: number; notSet: number; total: number };
    addedTime?: { periods: number; averageSec: number };
    cards?: { games: number; cautions: number; sendOffs: number; perGame: number };
}

/** The age groups from the games, added time and discipline lists as one list, youngest first. */
export function ageGroupRows(stats: {
    ageGroups: { ageGroup: string; male: number; female: number; coed: number; notSet: number }[];
    addedTime: { ageGroups: { ageGroup: string; periods: number; averageSec: number }[] };
    discipline: { ageGroups: { ageGroup: string; games: number; cautions: number; sendOffs: number }[] };
}): AgeGroupRow[] {
    const rows = new Map<string, AgeGroupRow>();
    const row = (ageGroup: string) => rows.get(ageGroup) ?? rows.set(ageGroup, { ageGroup }).get(ageGroup)!;
    for (const a of stats.ageGroups) {
        row(a.ageGroup).games = { male: a.male, female: a.female, coed: a.coed, notSet: a.notSet, total: a.male + a.female + a.coed + a.notSet };
    }
    for (const a of stats.addedTime.ageGroups) {
        row(a.ageGroup).addedTime = { periods: a.periods, averageSec: a.averageSec };
    }
    for (const a of stats.discipline.ageGroups) {
        row(a.ageGroup).cards = { games: a.games, cautions: a.cautions, sendOffs: a.sendOffs, perGame: a.games ? (a.cautions + a.sendOffs) / a.games : 0 };
    }
    const compare = (a: string, b: string) => {
        const [x, y] = [ageGroupOrder(a), ageGroupOrder(b)];
        return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]);
    };
    return [...rows.values()].sort((a, b) => compare(a.ageGroup, b.ageGroup));
}

/** The busiest times as a grid: every day, and the kickoff hours from the earliest to the latest with games. */
export function busiestGrid(cells: { day: number; hour: number; games: number }[]): { hours: number[]; games: (day: number, hour: number) => number; max: number } {
    if (cells.length === 0) {
        return { hours: [], games: () => 0, max: 0 };
    }
    const from = Math.min(...cells.map((c) => c.hour));
    const to = Math.max(...cells.map((c) => c.hour));
    const at = new Map(cells.map((c) => [`${c.day}:${c.hour}`, c.games]));
    return {
        hours: Array.from({ length: to - from + 1 }, (_, i) => from + i),
        games: (day, hour) => at.get(`${day}:${hour}`) ?? 0,
        max: Math.max(...cells.map((c) => c.games)),
    };
}

/** Six steps of light, by share of the busiest: 0 for none. */
export function lightStep(games: number, max: number): number {
    return games <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(6, Math.ceil((games / max) * 6)));
}

/** STAT-15: the scale of a watch's ring, the battery used an hour, full at 30% an hour. */
export const ringFullPerHour = 30;

/** How much of a watch's ring is lit for its battery used an hour: 0 to 1, full at the top of the scale (and past it). */
export function ringShare(drainPerHour: number | undefined): number {
    return drainPerHour === undefined ? 0 : Math.min(1, Math.max(0, drainPerHour / ringFullPerHour));
}

/** "9%" or "2.5%": whole percents from 10, one decimal under it, as battery figures are read. */
export function percentFigure(value: number): string {
    return value >= 9.95 ? `${Math.round(value)}%` : `${Math.round(value * 10) / 10}%`;
}
