import type { Competition, Match, Referee, Venue } from "./api.ts";
import { genderNames, roleNames, roleNamesInFull } from "./format.ts";

// Searching matches: every word typed must appear somewhere in the match (teams, short names,
// competition, venue and pitch, officials, tags, notes, match number, assignor, age group, gender, status,
// role), ignoring case and accents.

export interface SearchContext {
    competitions: Map<string, Competition>;
    venues: Map<string, Venue>;
    referees: Map<string, Referee>;
}

export function fold(text: string): string {
    return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function searchText(match: Match, ctx: SearchContext): string {
    const venue = match.venueId ? ctx.venues.get(match.venueId) : undefined;
    const parts = [
        match.name, match.home.name, match.home.alias, match.away.name, match.away.alias,
        match.competitionId && ctx.competitions.get(match.competitionId)?.name,
        venue?.name, venue?.pitches.find((p) => p.id === match.pitchId)?.name,
        ...match.crew.flatMap((c) => (c.refereeId ? [ctx.referees.get(c.refereeId)?.name, ...(ctx.referees.get(c.refereeId)?.aliases ?? [])] : [c.name])),
        ...(match.tags ?? []),
        match.notes, match.outlook, match.external?.id, match.assignor, match.ageGroup,
        match.gender && genderNames[match.gender], match.status, match.role && roleNames[match.role], match.role && roleNamesInFull[match.role],
    ];
    return fold(parts.filter(Boolean).join(" "));
}

export function matchesSearch(match: Match, ctx: SearchContext, query: string): boolean {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
        return true;
    }
    const text = searchText(match, ctx);
    return words.every((w) => text.includes(w));
}

// The other lists (venues, referees, competitions, templates): the same word search over a few
// fields, sorted by how many matches each has had or by name.

export type ListSort = "matches-desc" | "matches-asc" | "name-asc" | "name-desc";
export const listSorts: [ListSort, string][] = [
    ["matches-desc", "Most matches"],
    ["matches-asc", "Fewest matches"],
    ["name-asc", "Name A–Z"],
    ["name-desc", "Name Z–A"],
];

const byName = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** The items whose fields contain every word of the query, in the chosen order (ties by name). */
export function searchAndSort<T>(items: T[], query: string, sort: ListSort, fields: (item: T) => (string | undefined)[], name: (item: T) => string, count: (item: T) => number): T[] {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const found = words.length ? items.filter((item) => {
        const text = fold(fields(item).filter(Boolean).join(" "));
        return words.every((w) => text.includes(w));
    }) : items;
    const names = (a: T, b: T) => byName.compare(name(a), name(b));
    const compare: Record<ListSort, (a: T, b: T) => number> = {
        "matches-desc": (a, b) => count(b) - count(a) || names(a, b),
        "matches-asc": (a, b) => count(a) - count(b) || names(a, b),
        "name-asc": names,
        "name-desc": (a, b) => names(b, a),
    };
    return [...found].sort(compare[sort]);
}
