import { isGame } from "@lawfive/schema";
import { useMemo } from "react";
import { type Match, useList } from "./api.ts";
import { formatShortDay } from "./format.ts";

// How much the user has worked with each saved referee, at each venue, in each competition and
// with each template: games (played or abandoned with a kickoff, STAT-16, the same rule as Stats),
// the latest of them, and how many are coming up.
// For the match page, the crew popover on the match list, and the other lists and their pages.

export interface Together {
    played: number;
    /** The earliest played match's kickoff. */
    first?: string;
    /** The latest played match's kickoff. */
    last?: string;
    upcoming: number;
}

export function workedTogether(matches: Match[]) {
    const referees = new Map<string, Together>();
    const venues = new Map<string, Together>();
    const competitions = new Map<string, Together>();
    const templates = new Map<string, Together>();
    const add = (map: Map<string, Together>, id: string, m: Match) => {
        const t = map.get(id) ?? { played: 0, upcoming: 0 };
        if (isGame(m)) {
            t.played++;
            if (m.kickoff && (!t.last || new Date(m.kickoff) > new Date(t.last))) {
                t.last = m.kickoff;
            }
            if (m.kickoff && (!t.first || new Date(m.kickoff) < new Date(t.first))) {
                t.first = m.kickoff;
            }
        } else if (m.status === "scheduled") {
            t.upcoming++;
        }
        map.set(id, t);
    };
    for (const m of matches) {
        for (const id of new Set(m.crew.map((c) => c.refereeId).filter((x): x is string => !!x))) {
            add(referees, id, m);
        }
        for (const [map, id] of [[venues, m.venueId], [competitions, m.competitionId], [templates, m.templateId]] as const) {
            if (id) {
                add(map, id, m);
            }
        }
    }
    return { referees, venues, competitions, templates };
}

export function useWorkedTogether() {
    const matches = useList("matches");
    return useMemo(() => workedTogether(matches.data ?? []), [matches.data]);
}

/** "12 matches together · last Oct 25", or "No matches here yet · 1 coming up". */
export function describeTogether(t: Together | undefined, where: "together" | "here"): string {
    const played = t?.played ?? 0;
    const parts = [
        played === 0 ? `No matches ${where} yet` : `${played} ${played === 1 ? "match" : "matches"} ${where}`,
        t?.last && `last ${formatShortDay(t.last)}`,
        t?.upcoming && `${t.upcoming} coming up`,
    ];
    return parts.filter(Boolean).join(" · ");
}

/** For a list row: "12 matches · 2 coming up", "1 match", or "No matches yet". */
export function describeCount(t: Together | undefined): string {
    const parts = [t?.played && `${t.played} ${t.played === 1 ? "match" : "matches"}`, t?.upcoming && `${t.upcoming} coming up`].filter(Boolean);
    return parts.join(" · ") || "No matches yet";
}
