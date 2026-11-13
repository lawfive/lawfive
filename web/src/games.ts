import { GamesQuery } from "@lawfive/schema";
import type { Competition, Referee, Venue } from "./api.ts";
import { genderNames } from "./format.ts";

// Click through from the Stats page to the match list (STAT-11): the stats filters and a chart's
// slice travel in the match list's address, and schema's gameMatches picks the same games there.

const keys = Object.keys(GamesQuery.shape) as (keyof GamesQuery)[];

/** The match list's address showing exactly these games. */
export function gamesLink(query: GamesQuery): string {
    const params = new URLSearchParams({ show: "past" });
    for (const key of keys) {
        if (query[key] !== undefined) {
            params.set(key, String(query[key]));
        }
    }
    return `/matches?${params}`;
}

/** The games filters in an address, when there are any (and they're valid). */
export function gamesQueryFrom(params: URLSearchParams): GamesQuery | undefined {
    const raw = Object.fromEntries(keys.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])));
    if (Object.keys(raw).length === 0) {
        return undefined;
    }
    const parsed = GamesQuery.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
}

/** The filters as words, for the match list's banner: "Female", "U12", "Twin Creeks · Field 3". */
export function describeGames(q: GamesQuery, lookup: { venues: Map<string, Venue>; competitions: Map<string, Competition>; referees: Map<string, Referee> }): string[] {
    const day = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
    const date = (d: string) => day.format(new Date(`${d}T12:00:00`));
    const venue = q.venueId ? lookup.venues.get(q.venueId) : undefined;
    const pitch = q.pitchId && q.pitchId !== "none" ? venue?.pitches.find((p) => p.id === q.pitchId)?.name : undefined;
    const roles = { referee: "As referee", assistant: "As assistant", fourth: "As fourth official" };
    return [
        q.from && q.to ? `${date(q.from)} – ${date(q.to)}` : q.from ? `From ${date(q.from)}` : q.to ? `Until ${date(q.to)}` : undefined,
        q.month && new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(`${q.month}-15T12:00:00`)),
        q.gender && genderNames[q.gender],
        q.competitionId && (lookup.competitions.get(q.competitionId)?.name ?? "A competition"),
        q.role && roles[q.role],
        q.tag && `Tagged ${q.tag}`,
        venue && (pitch ? `${venue.name} · ${pitch}` : q.pitchId === "none" ? `${venue.name} (no pitch set)` : venue.name),
        q.ageGroup,
        q.refereeId && `With ${lookup.referees.get(q.refereeId)?.name ?? "a referee"}`,
        q.refereeName && `With ${q.refereeName}`,
    ].filter((x): x is string => Boolean(x));
}
