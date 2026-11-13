// TRK-9: the direction of play on a match's heatmap. With the kickoff direction from the watch
// (PRE-8), each period of normal time names the team attacking from each end of the drawing: the
// team defending the left goal line attacks left to right, the other right to left. Teams change
// ends every period, so odd periods are the first period's way round and even ones the other.
// Extra time has its own toss, which the record doesn't carry, so it gets none. The drawing is the
// ground seen from above, never mirrored; only which way round it's drawn changes (pitchTurned).

export type Side = "home" | "away";

export interface PeriodEnds {
    period: number;
    /** The team attacking from the left end, left to right. */
    left: Side;
    /** The team attacking from the right end, right to left. */
    right: Side;
}

/**
 * Who attacks from each end in each period of normal time, on a drawing whose length runs along
 * `u` (east and north, from pitchFrame), turned end to end when `turned` (pitchTurned).
 */
export function pitchEnds(periods: number, direction: { team: Side; bearingDeg: number } | undefined, u: [number, number], turned: boolean): PeriodEnds[] {
    if (!direction || periods < 1) {
        return [];
    }
    const b = (direction.bearingDeg * Math.PI) / 180;
    // Along the pitch's length, toward the end drawn on the right before any turn.
    const along = Math.sin(b) * u[0] + Math.cos(b) * u[1];
    const kickerAttacksRight = (along >= 0) !== turned;
    const other: Side = direction.team === "home" ? "away" : "home";
    return Array.from({ length: periods }, (_, i) => {
        const asFirst = i % 2 === 0;
        const kickerLeft = kickerAttacksRight === asFirst;
        return { period: i + 1, left: kickerLeft ? direction.team : other, right: kickerLeft ? other : direction.team };
    });
}

/**
 * The Match view's rows: the periods grouped by which way round they were played, the first
 * period's first, each with what to call them ("1st half", "P1, P3").
 */
export function endsByWayRound(ends: PeriodEnds[], periods: number): { label: string; left: Side; right: Side }[] {
    const name = (p: number) => endsLabel(p, periods);
    return [0, 1].flatMap((parity) => {
        const group = ends.filter((e) => (e.period - 1) % 2 === parity);
        return group.length ? [{ label: group.map((e) => name(e.period)).join(", "), left: group[0].left, right: group[0].right }] : [];
    });
}

/** A period's name under the halfway line: "1st half", "2nd half", or P1 to P4. */
export function endsLabel(period: number, periods: number): string {
    return periods === 2 ? (period === 1 ? "1st half" : "2nd half") : `P${period}`;
}
