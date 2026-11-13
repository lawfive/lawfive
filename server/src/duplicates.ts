import { metresBetween, normaliseName } from "@lawfive/schema";

// Finding records that are probably the same thing under different names (DUP-2): "John Doe" and
// "Doe, John", "J. Doe", "Jon Doe", or two with the same email or phone; for venues (DUP-7), the
// same address, places within 150 m, or similar names. It works on a small description of each
// record (names, emails, phones, addresses, positions, the ones it's known not to be). Only the
// server runs it (DUP-11), so the website and the phones flag the same pairs.

export interface DuplicateCandidate {
    id: string;
    /** Its name first, then any other names it goes by. */
    names: string[];
    emails?: (string | undefined)[];
    phones?: (string | undefined)[];
    /** A venue's address. */
    addresses?: (string | undefined)[];
    /** A venue's parking spot and pitches. */
    positions?: { lat: number; lon: number }[];
    /** A place (a venue), whose names are compared as places' rather than people's. */
    place?: boolean;
    /** Records the user said it isn't. */
    distinctFrom?: string[];
}

export interface DuplicateReason {
    /** 0 to 1: how sure. */
    score: number;
    /** Why, in a few words: "Same email", "Same name, in a different order". */
    reasons: string[];
}

export interface DuplicatePair extends DuplicateReason {
    a: string;
    b: string;
}

const digits = (phone: string) => phone.replace(/\D/g, "").slice(-10);

// The usual short forms in addresses, so "123 Main Street" and "123 Main St" are the same.
const addressWords: Record<string, string> = {
    street: "st", avenue: "ave", road: "rd", drive: "dr", boulevard: "blvd", lane: "ln", court: "ct", place: "pl", parkway: "pkwy",
    highway: "hwy", terrace: "ter", circle: "cir", way: "wy", north: "n", south: "s", east: "e", west: "w", suite: "ste",
};

/** An address as it's compared: as a name, with the usual short forms. */
export function normaliseAddress(address: string): string {
    return normaliseName(address).split(" ").map((word) => addressWords[word] ?? word).join(" ");
}

/** Whether two addresses are the same: equal, or one is the other with more after it (the town, the zip code). */
export function sameAddress(first: string, second: string): boolean {
    const a = normaliseAddress(first);
    const b = normaliseAddress(second);
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    // At least a number and a street, so "Main St" alone doesn't match every address on it.
    if (short.split(" ").length < 2 || !/\d/.test(short)) {
        return false;
    }
    return long === short || long.startsWith(`${short} `);
}

/** How close two venues are taken to be the same place. */
export const sameVenueMetres = 150;

function editDistance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return row[b.length];
}

/** How alike two names are, and why; a place's reasons are worded for places. */
export function compareNames(first: string, second: string, place = false): DuplicateReason | undefined {
    const a = normaliseName(first);
    const b = normaliseName(second);
    if (!a || !b) {
        return undefined;
    }
    if (a === b) {
        return { score: 1, reasons: ["Same name"] };
    }
    const ta = a.split(" ");
    const tb = b.split(" ");
    const sorted = (t: string[]) => [...t].sort().join(" ");
    if (sorted(ta) === sorted(tb)) {
        return { score: 0.95, reasons: ["Same name, in a different order"] };
    }
    // Every word of the shorter name is in the longer one, whole or as an initial ("J Doe", "John Q Doe").
    const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
    if (short.length >= 2) {
        const left = [...long];
        let initials = 0;
        let whole = 0;
        const all = short.every((word) => {
            let at = left.indexOf(word);
            if (at >= 0) {
                whole += word.length > 1 ? 1 : 0;
            } else {
                at = left.findIndex((other) => (word.length === 1 && other.startsWith(word)) || (other.length === 1 && word.startsWith(other)));
                initials += at >= 0 ? 1 : 0;
            }
            if (at < 0) {
                return false;
            }
            left.splice(at, 1);
            return true;
        });
        if (all && whole >= 1) {
            if (initials > 0) {
                return { score: left.length ? 0.7 : 0.8, reasons: [place ? "Similar name" : "Same surname and initial"] };
            }
            return { score: 0.75, reasons: [place ? "One name is longer" : "One has a middle name"] };
        }
    }
    const sa = sorted(ta);
    const sb = sorted(tb);
    const longest = Math.max(sa.length, sb.length);
    if (Math.min(sa.length, sb.length) >= 5 && 1 - editDistance(sa, sb) / longest >= 0.85) {
        return { score: 0.7, reasons: ["Similar spelling"] };
    }
    return undefined;
}

/** How likely two records are the same, and why; undefined when they aren't alike (or the user said they aren't). */
export function compareCandidates(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateReason | undefined {
    if (a.id === b.id || a.distinctFrom?.includes(b.id) || b.distinctFrom?.includes(a.id)) {
        return undefined;
    }
    let score = 0;
    const reasons: string[] = [];
    const note = (found: DuplicateReason | undefined) => {
        if (found) {
            score = Math.max(score, found.score);
            found.reasons.forEach((r) => reasons.includes(r) || reasons.push(r));
        }
    };
    const emails = (c: DuplicateCandidate) => (c.emails ?? []).filter((e): e is string => !!e).map((e) => e.trim().toLowerCase());
    if (emails(a).some((e) => emails(b).includes(e))) {
        note({ score: 1, reasons: ["Same email"] });
    }
    const phones = (c: DuplicateCandidate) => (c.phones ?? []).filter((p): p is string => !!p).map(digits).filter((p) => p.length >= 7);
    if (phones(a).some((p) => phones(b).includes(p))) {
        note({ score: 0.95, reasons: ["Same phone number"] });
    }
    const addresses = (c: DuplicateCandidate) => (c.addresses ?? []).filter((x): x is string => !!x);
    if (addresses(a).some((x) => addresses(b).some((y) => sameAddress(x, y)))) {
        note({ score: 1, reasons: ["Same address"] });
    }
    if ((a.positions ?? []).some((x) => (b.positions ?? []).some((y) => metresBetween(x.lat, x.lon, y.lat, y.lon) <= sameVenueMetres))) {
        note({ score: 0.9, reasons: [`Within ${sameVenueMetres} m`] });
    }
    // The best pairing of any of their names; reasons from that pairing only.
    let best: DuplicateReason | undefined;
    for (const x of a.names) {
        for (const y of b.names) {
            const found = compareNames(x, y, a.place || b.place);
            if (found && (!best || found.score > best.score)) {
                best = found;
            }
        }
    }
    note(best);
    return score > 0 ? { score, reasons } : undefined;
}

/** For one record: the others most likely to be the same, best first (DUP-2). */
export function likelyDuplicates(of: DuplicateCandidate, all: DuplicateCandidate[], limit = 5): (DuplicateReason & { id: string })[] {
    return all
        .flatMap((other) => {
            const found = compareCandidates(of, other);
            return found ? [{ id: other.id, ...found }] : [];
        })
        .sort((x, y) => y.score - x.score)
        .slice(0, limit);
}

/** Across all records: groups that are probably one thing, the surest first, with the pairs that link each (DUP-2). */
export function duplicateGroups(all: DuplicateCandidate[], minScore = 0.7): { ids: string[]; pairs: DuplicatePair[] }[] {
    const pairs: DuplicatePair[] = [];
    for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
            const found = compareCandidates(all[i], all[j]);
            if (found && found.score >= minScore) {
                pairs.push({ a: all[i].id, b: all[j].id, ...found });
            }
        }
    }
    const parent = new Map<string, string>();
    const root = (id: string): string => {
        const p = parent.get(id) ?? id;
        return p === id ? id : root(p);
    };
    for (const { a, b } of pairs) {
        parent.set(root(a), root(b));
    }
    const groups = new Map<string, { ids: string[]; pairs: DuplicatePair[] }>();
    for (const pair of pairs) {
        const key = root(pair.a);
        const group = groups.get(key) ?? { ids: [], pairs: [] };
        group.pairs.push(pair);
        [pair.a, pair.b].forEach((id) => group.ids.includes(id) || group.ids.push(id));
        groups.set(key, group);
    }
    const best = (g: { pairs: DuplicatePair[] }) => Math.max(...g.pairs.map((p) => p.score));
    return [...groups.values()].sort((x, y) => best(y) - best(x));
}

/** How close two pitches with different names are taken to be the same one (DUP-7). */
export const samePitchMetres = 30;

interface PitchLike {
    id: string;
    name: string;
    aliases?: string[];
    position?: { lat: number; lon: number };
}

/**
 * What a venue merge's preview suggests for a pitch of a venue being merged away (DUP-7), and how
 * much could go wrong, 1 (look first) to 6 (likely fine), so the riskiest show first:
 * 1, needs a new name: the same name as a kept pitch, but more than 30 m away, so it's kept;
 * 3, the same as one by position alone; 4, by name, with no position to check; 5, by name and
 * position; 6, nothing similar, so it's kept as it is.
 */
export interface PitchSuggestion {
    id: string;
    /** The kept venue's pitch it's probably the same as; none to keep it. */
    into?: string;
    risk: 1 | 3 | 4 | 5 | 6;
    /** Why, in a few words. */
    why: string;
    /** Its distance from the pitch it's compared with, when both are placed. */
    metres?: number;
}

const pitchNames = (p: PitchLike) => [p.name, ...(p.aliases ?? [])].map(normaliseName);

/** For each pitch of the venues being merged away, what the preview suggests (DUP-7). */
export function suggestPitches(kept: PitchLike[], theirs: PitchLike[]): PitchSuggestion[] {
    const apart = (a: PitchLike, b: PitchLike) => (a.position && b.position ? Math.round(metresBetween(a.position.lat, a.position.lon, b.position.lat, b.position.lon)) : undefined);
    const suggestions = theirs.map((p): PitchSuggestion => {
        const named = kept.find((q) => pitchNames(q).some((n) => pitchNames(p).includes(n)));
        if (named) {
            const metres = apart(p, named);
            if (metres === undefined) {
                return { id: p.id, into: named.id, risk: 4, why: `Same name as ${named.name}, with no position to check` };
            }
            if (metres <= samePitchMetres) {
                return { id: p.id, into: named.id, risk: 5, why: `Same name, ${metres} m apart`, metres };
            }
            const far = metres > sameVenueMetres ? ". Check these are the same venue" : "";
            return { id: p.id, risk: 1, why: `Same name as ${named.name}, ${formatMetres(metres)} away${far}`, metres };
        }
        const near = kept.flatMap((q) => {
            const metres = apart(p, q);
            return metres !== undefined && metres <= samePitchMetres ? [{ q, metres }] : [];
        }).sort((a, b) => a.metres - b.metres)[0];
        if (near) {
            return { id: p.id, into: near.q.id, risk: 3, why: `Within ${near.metres} m of ${near.q.name}`, metres: near.metres };
        }
        return { id: p.id, risk: 6, why: "Nothing similar" };
    });
    // Two pitches kept from different venues can share a name too.
    for (const s of suggestions) {
        const p = theirs.find((x) => x.id === s.id)!;
        if (!s.into && s.risk !== 1 && suggestions.some((o) => o !== s && !o.into && normaliseName(theirs.find((x) => x.id === o.id)!.name) === normaliseName(p.name))) {
            Object.assign(s, { risk: 1, why: `Another pitch kept is called ${p.name} too` });
        }
    }
    return suggestions;
}

const formatMetres = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`);
