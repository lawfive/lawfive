import {
    type DuplicateGroups, type DuplicateMember, type LikelyDuplicates, type MatchCount, NotTheSame, RefereeMerge, RefereeMergeDraft, type RefereeMergePreview,
    VenueMerge, VenueMergeDraft, type VenueMergePreview, collections, normaliseName, scopesAllow,
} from "@lawfive/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { moveAttachments } from "./attachments.ts";
import { type DuplicateCandidate, duplicateGroups, likelyDuplicates, suggestPitches } from "./duplicates.ts";
import { quietly } from "./notices.ts";
import { deleteRecord, saveRecord, toRecord } from "./records.ts";

// Finding and merging duplicates (DUP-1 to DUP-11). The server works out everything the apps show
// (DUP-11): the groups and the likeliest, with why; the preview of a merge from the choices so far;
// and the merge itself, checked the same way as the preview, so the website and the phones only
// present it and can't disagree.
//
// Merging: the matches that point at any of them point at the one kept, the rest are deleted, and
// their names become its other names, so stats, counts and the calendar simply add up. Each kind
// of record says how to combine them and how a match moves to the one kept; a venue's pitches are
// each kept or combined into one that's the same, as the user chose. What each merge replaced is
// remembered (merged_id), so a match saved later with an old id is corrected (records.ts,
// correctMergedIds).
//
//   GET  /v1/duplicates/{referees|venues}          the groups (DUP-1, DUP-7)
//   GET  /v1/{referees|venues}/:id/duplicates      the likeliest for one (Merge with…)
//   POST /v1/referees/:id/merge/preview            { from, name?, email?, phone? }
//   POST /v1/venues/:id/merge/preview              { from, name?, addressFrom?, pitches?: [{ id, into? | name? }] }
//   POST /v1/referees/:id/merge                    { from, name, email?, phone? }
//   POST /v1/venues/:id/merge                      { from, name, addressFrom?, pitches: [{ id, into? | name? }] }
//   POST /v1/{referees|venues}/:id/not-the-same    { others } (DUP-5)

type Data = Record<string, unknown>;
type Pitch = { id: string; name: string; aliases?: string[]; position?: { lat: number; lon: number }; markings?: { at: string }[] };
type Match = { status?: string; kickoff?: string; venueId?: string; pitchId?: string; crew?: { refereeId?: string; name?: string }[] };
type Member = z.infer<typeof DuplicateMember>;
type Count = z.infer<typeof MatchCount>;

/** One id a merge replaced: a match pointing at oldId should point at newId (and a pitch's at venueId). */
interface Replaced {
    kind: "venue" | "pitch" | "referee";
    oldId: string;
    newId: string;
    venueId?: string;
}

/** What a merge does: the kept record's data, how a match moves to it, and the ids it replaces. */
interface Plan {
    data: Data;
    relink: (match: Data) => Data | undefined;
    replaced: Replaced[];
}

interface Mergeable {
    /** The record type in the records table. */
    type: "referee" | "venue";
    collection: "referees" | "venues";
    body: z.ZodType<{ from: string[]; name: string }>;
    draft: z.ZodType<{ from: string[] }>;
    /** How the duplicate finder sees one (DUP-2, DUP-7). */
    candidate: (record: Data) => DuplicateCandidate;
    /** One as the apps show it, with its matches. */
    member: (record: Data, matches: Match[]) => Member;
    /** Most matches first, in a group: the one a merge keeps unless the user picks another. */
    weight: (member: Member) => number;
    /** The plan, from the kept record, the others and the user's choices; or a problem with the choices. */
    plan: (kept: Data, others: Data[], body: never) => Plan | string;
    /** What merging would make, from the choices so far (DUP-4, DUP-8). */
    preview: (kept: Data, others: Data[], draft: never, matches: Match[], members: Member[]) => Data;
}

const uniqueBy = <T>(items: T[], key: (item: T) => string) => items.filter((item, i) => items.findIndex((other) => key(other) === key(item)) === i);
const present = (values: unknown[]) => values.filter((v): v is string => typeof v === "string" && v.length > 0);

/** Matches as one count: played (and the latest), and coming up. */
function countMatches(matches: Match[], at: (m: Match) => boolean): Count {
    const count: Count = { played: 0, upcoming: 0 };
    for (const m of matches) {
        if (!at(m)) {
            continue;
        }
        if (m.status === "played") {
            count.played++;
            if (m.kickoff && (!count.last || new Date(m.kickoff) > new Date(count.last))) {
                count.last = m.kickoff;
            }
        } else if (m.status === "scheduled") {
            count.upcoming++;
        }
    }
    return count;
}

/** Every name of theirs, once each, the kept one's first; and the chosen one when it's among them, else the kept one's. */
function namesOf(all: Data[], chosen: string | undefined) {
    const names = uniqueBy(all.flatMap((r) => [r.name as string, ...((r.aliases as string[] | undefined) ?? [])]), normaliseName);
    const name = (chosen && names.find((n) => n === chosen)) || (all[0].name as string);
    return { names, name };
}

/** The details any two records combine the same way: the name kept and the rest as other names, tags, notes, who they're not. */
function common(all: Data[], name: string, maxAliases: number): Data | string {
    const names = all.flatMap((r) => [r.name as string, ...((r.aliases as string[] | undefined) ?? [])]);
    if (!names.some((n) => normaliseName(n) === normaliseName(name))) {
        return "name: choose one of their names";
    }
    const tags = uniqueBy(all.flatMap((r) => (r.tags as string[] | undefined) ?? []), (t) => t.toLowerCase()).slice(0, 20);
    const notes = uniqueBy(all.map((r) => (r.notes as string | undefined)?.trim() ?? "").filter(Boolean), (n) => n).join("\n\n").slice(0, 2000);
    const ids = new Set(all.map((r) => r.id as string));
    const distinctFrom = [...new Set(all.flatMap((r) => (r.distinctFrom as string[] | undefined) ?? []))].filter((id) => !ids.has(id));
    const aliases = uniqueBy(names.filter((n) => normaliseName(n) !== normaliseName(name)), normaliseName).slice(0, maxAliases);
    return { name, ...(aliases.length ? { aliases } : {}), ...(notes ? { notes } : {}), ...(tags.length ? { tags } : {}), ...(distinctFrom.length ? { distinctFrom } : {}) };
}

/** Whether a match's crew names one of the referees, by id or typed in under one of their names. */
const crewNames = (ids: Set<string>, names: Set<string>) => (m: Match) =>
    (m.crew ?? []).some((c) => (c.refereeId ? ids.has(c.refereeId) : c.name !== undefined && names.has(normaliseName(c.name))));

const referees: Mergeable = {
    type: "referee",
    collection: "referees",
    body: RefereeMerge,
    draft: RefereeMergeDraft,
    candidate: (r) => ({
        id: r.id as string, names: [r.name as string, ...((r.aliases as string[] | undefined) ?? [])],
        emails: [r.email as string | undefined], phones: [r.phone as string | undefined], distinctFrom: r.distinctFrom as string[] | undefined,
    }),
    member: (r, matches) => ({
        id: r.id as string, name: r.name as string, aliases: (r.aliases as string[] | undefined) ?? [],
        ...(r.email ? { email: r.email as string } : {}), ...(r.phone ? { phone: r.phone as string } : {}),
        matches: countMatches(matches, (m) => (m.crew ?? []).some((c) => c.refereeId === r.id)),
    }),
    weight: (m) => m.matches.played,
    plan(kept, others, body: z.infer<typeof RefereeMerge>) {
        const all = [kept, ...others];
        const data = common(all, body.name, 50);
        if (typeof data === "string") {
            return data;
        }
        const pick = (field: "email" | "phone", chosen: string | undefined) => chosen ?? all.map((r) => r[field] as string | undefined).find(Boolean);
        const email = pick("email", body.email);
        const phone = pick("phone", body.phone);
        // WEB-20: the kept one's short name, else one of the others'.
        const shortName = all.map((r) => r.shortName as string | undefined).find(Boolean);
        Object.assign(data, email ? { email } : {}, phone ? { phone } : {}, shortName ? { shortName } : {});
        const keptId = kept.id as string;
        const from = new Set(others.map((r) => r.id as string));
        // Crew typed in as one of its names is linked too.
        const names = new Set([body.name, ...((data.aliases as string[] | undefined) ?? [])].map(normaliseName));
        return {
            data,
            relink(match) {
                let changed = false;
                const crew = (match.crew as { role: string; refereeId?: string; name?: string }[]).map((c) => {
                    if ((c.refereeId && from.has(c.refereeId)) || (!c.refereeId && c.name && names.has(normaliseName(c.name)))) {
                        changed = true;
                        return { role: c.role, refereeId: keptId };
                    }
                    return c;
                });
                return changed ? { ...match, crew } : undefined;
            },
            replaced: [...from].map((oldId) => ({ kind: "referee", oldId, newId: keptId })),
        };
    },
    preview(kept, others, draft: z.infer<typeof RefereeMergeDraft>, matches, members): z.infer<typeof RefereeMergePreview> {
        const all = [kept, ...others];
        const { names, name } = namesOf(all, draft.name);
        // A choice from a referee since unticked falls back to the first there is.
        const choose = (field: "email" | "phone", chosen: string | undefined) => {
            const values = uniqueBy(present(all.map((r) => r[field])), normaliseName);
            return { values, value: values.find((v) => v === chosen) ?? values[0] };
        };
        const email = choose("email", draft.email);
        const phone = choose("phone", draft.phone);
        return {
            referees: members, names, name, emails: email.values, ...(email.value ? { email: email.value } : {}), phones: phone.values, ...(phone.value ? { phone: phone.value } : {}),
            together: countMatches(matches, crewNames(new Set(all.map((r) => r.id as string)), new Set(names.map(normaliseName)))),
            merge: { from: draft.from, name, ...(email.value ? { email: email.value } : {}), ...(phone.value ? { phone: phone.value } : {}) },
        };
    },
};

/** A pitch's choice in a venue merge: the same as another (into), or kept under a name. */
type PitchChoice = { into?: string; name?: string };

/**
 * The pitches the merged venue keeps, under the names they'll have, and what's wrong with each
 * choice of the others' pitches (DUP-8). The preview shows these problems and the merge refuses
 * them, so the two agree.
 */
function checkPitches(kept: Pitch[], theirs: Pitch[], choiceOf: (p: Pitch) => PitchChoice) {
    const staying = [
        ...kept.map((p) => ({ id: p.id, name: p.name })),
        ...theirs.filter((p) => !choiceOf(p).into).map((p) => ({ id: p.id, name: (choiceOf(p).name ?? p.name).trim() })),
    ];
    const problems = new Map<string, string>();
    for (const p of theirs) {
        const c = choiceOf(p);
        if (c.into) {
            if (c.into === p.id || !staying.some((s) => s.id === c.into)) {
                problems.set(p.id, "That pitch isn't kept; choose another");
            }
            continue;
        }
        const name = (c.name ?? p.name).trim();
        if (!name) {
            problems.set(p.id, "Give it a name");
        } else if (staying.some((s) => s.id !== p.id && normaliseName(s.name) === normaliseName(name))) {
            problems.set(p.id, "Another pitch has this name; choose a new one");
        }
    }
    return { staying, problems };
}

const corners = (p: Pitch) => p.markings?.length ?? 0;
/** A venue's address and parking, as they're compared to choose between them. */
const placeKey = (v: Data) => `${(v.address as string | undefined) ?? ""}|${JSON.stringify(v.position ?? null)}`;

const venues: Mergeable = {
    type: "venue",
    collection: "venues",
    body: VenueMerge,
    draft: VenueMergeDraft,
    candidate: (v) => ({
        id: v.id as string, names: [v.name as string, ...((v.aliases as string[] | undefined) ?? [])], addresses: [v.address as string | undefined],
        place: true, distinctFrom: v.distinctFrom as string[] | undefined,
        positions: [v.position, ...(v.pitches as Pitch[]).map((p) => p.position)].filter((p): p is { lat: number; lon: number } => !!p),
    }),
    member: (v, matches) => ({
        id: v.id as string, name: v.name as string, aliases: (v.aliases as string[] | undefined) ?? [],
        ...(v.address ? { address: v.address as string } : {}), pitches: (v.pitches as Pitch[]).length,
        matches: countMatches(matches, (m) => m.venueId === v.id),
    }),
    weight: (m) => m.matches.played + m.matches.upcoming,
    plan(kept, others, body: z.infer<typeof VenueMerge>) {
        const all = [kept, ...others];
        const data = common(all, body.name, 50);
        if (typeof data === "string") {
            return data;
        }
        const keptId = kept.id as string;
        if (body.addressFrom && !all.some((v) => v.id === body.addressFrom)) {
            return "addressFrom: choose one of the venues being merged";
        }
        // The chosen venue's address and parking; an empty one is filled from the others.
        const source = all.find((v) => v.id === body.addressFrom) ?? kept;
        const address = (source.address as string | undefined) ?? all.map((v) => v.address as string | undefined).find(Boolean);
        const position = source.position ?? all.map((v) => v.position).find(Boolean);
        Object.assign(data, address ? { address } : {}, position ? { position } : {});

        // Every pitch of the others, once: kept (with a name no other pitch has) or combined.
        const theirs = others.flatMap((v) => (v.pitches as Pitch[]).map((p) => ({ ...p })));
        const choices = new Map(body.pitches.map((c) => [c.id, c]));
        if (choices.size !== body.pitches.length) {
            return "pitches: each pitch can be listed once";
        }
        const missing = theirs.filter((p) => !choices.has(p.id));
        if (missing.length || choices.size !== theirs.length) {
            return missing.length ? `pitches: say what happens to ${missing.map((p) => p.name).join(", ")}` : "pitches: a pitch listed isn't one of the venues being merged";
        }
        const { problems } = checkPitches(kept.pitches as Pitch[], theirs, (p) => choices.get(p.id)!);
        const problem = theirs.find((p) => problems.has(p.id));
        if (problem) {
            return `pitches: ${problem.name}: ${problems.get(problem.id)}`;
        }
        const pitches: Pitch[] = (kept.pitches as Pitch[]).map((p) => ({ ...p }));
        for (const p of theirs) {
            const choice = choices.get(p.id)!;
            if (!choice.into) {
                pitches.push({ ...p, name: choice.name?.trim() || p.name });
            }
        }
        const into = new Map<string, string>();
        for (const p of theirs) {
            const target = choices.get(p.id)!.into;
            if (!target) {
                continue;
            }
            const keeper = pitches.find((q) => q.id === target)!;
            into.set(p.id, target);
            // Its corners walked join the kept pitch's in date order, the newest 20 (TRK-13).
            const markings = [...(keeper.markings ?? []), ...(p.markings ?? [])].sort((a, b) => a.at.localeCompare(b.at)).slice(-20);
            const aliases = uniqueBy([...(keeper.aliases ?? []), p.name, ...(p.aliases ?? [])].filter((n) => normaliseName(n) !== normaliseName(keeper.name)), normaliseName).slice(0, 20);
            Object.assign(keeper, markings.length ? { markings } : {}, aliases.length ? { aliases } : {}, !keeper.position && p.position ? { position: p.position } : {});
        }
        data.pitches = pitches;

        const from = new Set(others.map((v) => v.id as string));
        return {
            data,
            relink(match) {
                const pitchId = match.pitchId as string | undefined;
                if (!from.has(match.venueId as string) && !(pitchId && into.has(pitchId))) {
                    return undefined;
                }
                return { ...match, venueId: keptId, ...(pitchId ? { pitchId: into.get(pitchId) ?? pitchId } : {}) };
            },
            replaced: [
                ...[...from].map((oldId): Replaced => ({ kind: "venue", oldId, newId: keptId })),
                ...[...into].map(([oldId, newId]): Replaced => ({ kind: "pitch", oldId, newId, venueId: keptId })),
            ],
        };
    },
    preview(kept, others, draft: z.infer<typeof VenueMergeDraft>, matches, members): z.infer<typeof VenueMergePreview> {
        const all = [kept, ...others];
        const { names, name } = namesOf(all, draft.name);
        // Where they differ, the address and parking come from one venue; a venue since unticked falls back to the first.
        const places = uniqueBy(all.filter((v) => v.address || v.position), placeKey);
        const addressFrom = places.find((v) => v.id === draft.addressFrom)?.id as string | undefined ?? places[0]?.id as string | undefined;

        // Their pitches, riskiest first; then more matches and corners walked first, as a mistake
        // there costs more. From the venues alone, so rows never move while choices change.
        const keptPitches = kept.pitches as Pitch[];
        const theirs = others.flatMap((v) => (v.pitches as Pitch[]).map((pitch) => ({ pitch, venue: v.name as string })));
        const suggested = new Map(suggestPitches(keptPitches, theirs.map((t) => t.pitch)).map((s) => [s.id, s]));
        const matchCount = (id: string) => matches.filter((m) => m.pitchId === id).length;
        const weight = (p: Pitch) => matchCount(p.id) + corners(p);
        theirs.sort((a, b) => suggested.get(a.pitch.id)!.risk - suggested.get(b.pitch.id)!.risk || weight(b.pitch) - weight(a.pitch));

        const chosen = new Map((draft.pitches ?? []).map((c) => [c.id, c]));
        const choiceOf = (p: Pitch): PitchChoice => {
            const c = chosen.get(p.id);
            if (c?.into) {
                return { into: c.into };
            }
            if (c?.name !== undefined) {
                return { name: c.name };
            }
            const into = suggested.get(p.id)?.into;
            return into ? { into } : { name: p.name };
        };
        const { staying, problems } = checkPitches(keptPitches, theirs.map((t) => t.pitch), choiceOf);

        // A pitch keeps its newest 20 corners walked (TRK-13); combining can take it over.
        const notes = staying.flatMap((s) => {
            const into = [...keptPitches, ...theirs.map((t) => t.pitch)].filter((p) => p.id === s.id || choiceOf(p).into === s.id);
            const total = into.reduce((n, p) => n + corners(p), 0);
            return total > 20 ? [`${s.name} would have ${total} corners walked; the oldest ${total - 20} go`] : [];
        });
        const ids = new Set(all.map((v) => v.id as string));
        return {
            venues: members, names, name,
            places: places.map((v) => ({ venueId: v.id as string, ...(v.address ? { address: v.address as string } : {}), onMap: !!v.position })),
            ...(addressFrom ? { addressFrom } : {}),
            pitches: theirs.map(({ pitch, venue }) => {
                const s = suggested.get(pitch.id)!;
                const problem = problems.get(pitch.id);
                return {
                    id: pitch.id, name: pitch.name, ...(others.length > 1 ? { venue } : {}),
                    matches: matchCount(pitch.id), corners: corners(pitch), onMap: !!pitch.position,
                    check: s.risk <= 4, why: s.why, choice: choiceOf(pitch),
                    targets: staying.filter((t) => t.id !== pitch.id),
                    ...(problem ? { problem } : {}),
                };
            }),
            notes, problems: problems.size,
            together: countMatches(matches, (m) => !!m.venueId && ids.has(m.venueId)),
            ...(problems.size ? {} : {
                merge: {
                    from: draft.from, name, ...(places.length > 1 && addressFrom ? { addressFrom } : {}),
                    pitches: theirs.map(({ pitch }) => {
                        const c = choiceOf(pitch);
                        return c.into ? { id: pitch.id, into: c.into } : { id: pitch.id, name: (c.name ?? pitch.name).trim() };
                    }),
                },
            }),
        };
    },
};

const kinds = [referees, venues];

/**
 * Remembers what a merge replaced. Anything that pointed at a record now merged away points at
 * where it went instead, so a later merge of the kept one carries the earlier ones along.
 */
async function remember(db: Db, userId: string, replaced: Replaced[]) {
    const { mergedId } = tables;
    for (const r of replaced) {
        await db.update(mergedId).set({ newId: r.newId, ...(r.venueId ? { venueId: r.venueId } : {}) })
            .where(and(eq(mergedId.userId, userId), eq(mergedId.newId, r.oldId)));
        if (r.kind === "venue") {
            await db.update(mergedId).set({ venueId: r.newId }).where(and(eq(mergedId.userId, userId), eq(mergedId.venueId, r.oldId)));
        }
        await db.insert(mergedId).values({ userId, ...r }).onConflictDoUpdate({ target: [mergedId.userId, mergedId.oldId], set: { kind: r.kind, newId: r.newId, venueId: r.venueId ?? null } });
    }
}

export function mergeApi(db: Db, onChange?: (type: string) => void) {
    const api = new Hono<{ Variables: { userId: string; keyScopes?: string[] } }>();
    const { records } = tables;
    const live = (userId: string, type: string) => and(eq(records.userId, userId), eq(records.type, type), isNull(records.deletedAt));
    const withId = (row: { id: string; data: unknown }) => ({ ...(row.data as Data), id: row.id });
    const all = async (userId: string, type: string) => (await db.select().from(records).where(live(userId, type))).map(withId);
    const matchesOf = async (userId: string) => (await db.select().from(records).where(live(userId, "match"))).map((r) => r.data as Match);
    /** The counts come from matches, so a key needs to read those too. */
    const keyNeeds = (scopes: string[] | undefined, scope: string) => !!scopes && !scopesAllow(scopes, scope);

    /** The kept record and the others, in the order asked; or the error to answer with. */
    async function chosen(userId: string, kind: Mergeable, keptId: string, from: string[]): Promise<{ error: string; status: 400 | 404 } | { kept: Data; others: Data[] }> {
        if (from.includes(keptId)) {
            return { error: `a ${kind.type} can't be merged into itself`, status: 400 };
        }
        const rows = await db.select().from(records).where(and(live(userId, kind.type), inArray(records.id, [keptId, ...from])));
        const kept = rows.find((r) => r.id === keptId);
        if (!kept || rows.length !== from.length + 1) {
            return { error: kept ? `a ${kind.type} to merge doesn't exist` : "not found", status: 404 };
        }
        // In the order asked, so "the first that has one" means the same each time.
        return { kept: withId(kept), others: from.map((id) => withId(rows.find((r) => r.id === id)!)) };
    }

    for (const kind of kinds) {
        const one = kind.type;

        api.get(`/duplicates/${kind.collection}`, async (c) => {
            if (keyNeeds(c.var.keyScopes, "matches:read")) {
                return c.json({ error: "this API key needs matches:read too" }, 403);
            }
            const [list, matches] = await Promise.all([all(c.var.userId, kind.type), matchesOf(c.var.userId)]);
            const byId = new Map(list.map((r) => [r.id as string, r]));
            const groups = duplicateGroups(list.map(kind.candidate)).map((group) => ({
                reasons: [...new Set(group.pairs.flatMap((p) => p.reasons))],
                members: group.ids.map((id) => kind.member(byId.get(id)!, matches)).sort((a, b) => kind.weight(b) - kind.weight(a)),
            }));
            return c.json({ groups, of: list.length } satisfies z.infer<typeof DuplicateGroups>);
        });

        api.get(`/${kind.collection}/:id/duplicates`, async (c) => {
            if (keyNeeds(c.var.keyScopes, "matches:read")) {
                return c.json({ error: "this API key needs matches:read too" }, 403);
            }
            const [list, matches] = await Promise.all([all(c.var.userId, kind.type), matchesOf(c.var.userId)]);
            const of = list.find((r) => r.id === c.req.param("id"));
            if (!of) {
                return c.json({ error: "not found" }, 404);
            }
            const likely = likelyDuplicates(kind.candidate(of), list.filter((r) => r !== of).map(kind.candidate), 6)
                .map((found) => ({ ...kind.member(list.find((r) => r.id === found.id)!, matches), reasons: found.reasons }));
            return c.json({ likely } satisfies z.infer<typeof LikelyDuplicates>);
        });

        api.post(`/${kind.collection}/:id/merge/preview`, async (c) => {
            if (keyNeeds(c.var.keyScopes, "matches:read")) {
                return c.json({ error: "this API key needs matches:read too" }, 403);
            }
            const draft = kind.draft.safeParse(await c.req.json().catch(() => undefined));
            if (!draft.success) {
                return c.json({ error: "invalid merge", issues: draft.error.issues }, 400);
            }
            const userId = c.var.userId;
            const found = await chosen(userId, kind, c.req.param("id"), [...new Set(draft.data.from)]);
            if ("error" in found) {
                return c.json({ error: found.error }, found.status);
            }
            const [list, matches] = await Promise.all([all(userId, kind.type), matchesOf(userId)]);
            // Each with why, when it's among the likeliest for the one kept.
            const reasons = new Map(likelyDuplicates(kind.candidate(found.kept), list.filter((r) => r.id !== found.kept.id).map(kind.candidate), list.length)
                .map((f) => [f.id, f.reasons]));
            const members = [found.kept, ...found.others].map((r) => {
                const why = reasons.get(r.id as string);
                return { ...kind.member(r, matches), ...(why ? { reasons: why } : {}) };
            });
            return c.json(kind.preview(found.kept, found.others, { ...draft.data, from: found.others.map((r) => r.id) } as never, matches, members));
        });

        api.post(`/${kind.collection}/:id/merge`, async (c) => {
            if (keyNeeds(c.var.keyScopes, "matches:write")) {
                return c.json({ error: "this API key needs matches:write too" }, 403);
            }
            const body = kind.body.safeParse(await c.req.json().catch(() => undefined));
            if (!body.success) {
                return c.json({ error: "invalid merge", issues: body.error.issues }, 400);
            }
            const userId = c.var.userId;
            const keptId = c.req.param("id");
            const from = [...new Set(body.data.from)];
            const found = await chosen(userId, kind, keptId, from);
            if ("error" in found) {
                return c.json({ error: found.error }, found.status);
            }
            const plan = kind.plan(found.kept, found.others, body.data as never);
            if (typeof plan === "string") {
                return c.json({ error: plan }, 400);
            }
            const checked = collections[kind.collection].input.safeParse(plan.data);
            if (!checked.success) {
                return c.json({ error: `the merged ${one} isn't valid`, issues: checked.error.issues }, 400);
            }

            // The kept record first, so a match never points at a pitch that isn't there yet; then
            // the matches, so nothing points at a deleted record; then the rest.
            const saved = await saveRecord(db, userId, kind.type, keptId, plan.data, "any");
            if (saved.status === 409) {
                return c.json({ error: saved.error }, 409);
            }
            const matches = await db.select().from(records).where(live(userId, "match"));
            let matchesUpdated = 0;
            for (const match of matches) {
                const relinked = plan.relink(match.data as Data);
                if (relinked) {
                    // The same place under the kept id isn't news for the person (NOTE-2).
                    await quietly(() => saveRecord(db, userId, "match", match.id, relinked, "any"));
                    matchesUpdated++;
                }
            }
            await remember(db, userId, plan.replaced);
            // Their photos move to the one kept (FILE-3) before they're deleted, which would delete them.
            await moveAttachments(db, userId, kind.type, from, keptId);
            for (const id of from) {
                await deleteRecord(db, userId, kind.type, id);
            }
            onChange?.(kind.type);
            if (matchesUpdated) {
                onChange?.("match");
            }
            return c.json({ [one]: toRecord(saved.row), merged: from.length, matchesUpdated });
        });

        // Not the same (DUP-5): each remembers the others, in one request, so it can't half-finish
        // as separate saves could.
        api.post(`/${kind.collection}/:id/not-the-same`, async (c) => {
            const body = NotTheSame.safeParse(await c.req.json().catch(() => undefined));
            if (!body.success) {
                return c.json({ error: "invalid request", issues: body.error.issues }, 400);
            }
            const userId = c.var.userId;
            const found = await chosen(userId, kind, c.req.param("id"), [...new Set(body.data.others)]);
            if ("error" in found) {
                return c.json({ error: found.error.replace("merged into itself", "different from itself") }, found.status);
            }
            const group: Data[] = [found.kept, ...found.others];
            const ids = group.map((r) => r.id as string);
            for (const record of group) {
                const { id, ...data } = record;
                const distinctFrom = [...new Set([...((data.distinctFrom as string[] | undefined) ?? []), ...ids.filter((other) => other !== id)])].slice(-500);
                await saveRecord(db, userId, kind.type, id as string, { ...data, distinctFrom }, "any");
            }
            onChange?.(kind.type);
            return c.json({ ok: true as const });
        });
    }
    return api;
}
