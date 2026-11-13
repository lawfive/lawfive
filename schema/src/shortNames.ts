// SET-5: a team's short name, the up-to-4 characters the watch shows: the one typed for the match,
// else one suggested from the pair of names, else HOM/AWY. One rule for the server's watch download,
// the website, Try a match and both phones (their ports, shortNames in Format.kt and Format.swift, run
// the cases in schema/short-names.json too). Only a typed short name is stored, so the suggestion
// follows the names however they change (the form, the API, an import or a calendar feed).

type Side = "home" | "away";
type TeamNames = { name?: string; alias?: string };

/** A name's words: letters and digits, split at spaces, underscores and punctuation. */
function words(name: string): string[] {
    return name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function firstThree(name: string): string {
    return words(name).join("").slice(0, 3).toUpperCase();
}

/**
 * Short names for a pair of teams: the first three letters or digits of each name. When those
 * are the same, the words the names start with in common are skipped, so "L84_Roach" and
 * "L84_Smith" become ROA and SMI, and "Strikers U12" and "Strikers U14" become U12 and U14.
 */
export function suggestAliases(homeName: string | undefined, awayName: string | undefined): { home?: string; away?: string } {
    const simple = { home: firstThree(homeName ?? "") || undefined, away: firstThree(awayName ?? "") || undefined };
    if (!simple.home || simple.home !== simple.away) {
        return simple;
    }
    const home = words(homeName ?? "");
    const away = words(awayName ?? "");
    let shared = 0;
    while (shared < home.length && shared < away.length && home[shared].toLowerCase() === away[shared].toLowerCase()) {
        shared++;
    }
    const distinct = {
        home: firstThree(home.slice(shared).join(" ")) || simple.home,
        away: firstThree(away.slice(shared).join(" ")) || simple.away,
    };
    return distinct.home !== distinct.away ? distinct : simple;
}

/** HOM or AWY: a team's short name with no name and none typed (SET-3). */
export function defaultShortName(side: Side): string {
    return side === "home" ? "HOM" : "AWY";
}

/** The short name a team shows (SET-5): its typed alias, else the pair's suggestion, else HOM/AWY. */
export function shortName(teams: { home: TeamNames; away: TeamNames }, side: Side): string {
    return teams[side].alias || suggestAliases(teams.home.name, teams.away.name)[side] || defaultShortName(side);
}
