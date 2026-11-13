import type * as schema from "@lawfive/schema";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { request } from "./api.ts";

// Finding duplicates and previewing merges (DUP-11): the server works it all out, and these pages
// only show it. The preview is asked for again whenever a choice changes; the last answer stays on
// screen while the next comes, and Merge waits for it, so what's merged is always what was shown.

export type Mergeable = "referees" | "venues";
export type DuplicateMember = z.infer<typeof schema.DuplicateMember>;
export type DuplicateGroups = z.infer<typeof schema.DuplicateGroups>;
export type RefereeMergeDraft = z.infer<typeof schema.RefereeMergeDraft>;
export type RefereeMergePreview = z.infer<typeof schema.RefereeMergePreview>;
export type VenueMergeDraft = z.infer<typeof schema.VenueMergeDraft>;
export type VenueMergePreview = z.infer<typeof schema.VenueMergePreview>;

/** Groups of likely duplicates across all of them (Find duplicates). */
export function useDuplicates(collection: Mergeable) {
    return useQuery({ queryKey: ["duplicates", collection], queryFn: () => request<DuplicateGroups>("GET", `/duplicates/${collection}`) });
}

/** The likeliest few for one (Merge with…). */
export function useLikely(collection: Mergeable, id: string) {
    return useQuery({
        queryKey: ["duplicates", collection, id],
        queryFn: async () => (await request<{ likely: DuplicateMember[] }>("GET", `/${collection}/${id}/duplicates`)).likely,
    });
}

/**
 * The preview for the choices so far; none until something is picked. The choices settle a moment
 * before they're sent, so typing a pitch's name asks once, not per key.
 */
export function usePreview<P>(collection: Mergeable, keptId: string, draft: RefereeMergeDraft | VenueMergeDraft) {
    const settled = useSettled(draft);
    const query = useQuery({
        queryKey: ["merge-preview", collection, keptId, settled],
        queryFn: () => request<P>("POST", `/${collection}/${keptId}/merge/preview`, settled),
        enabled: settled.from.length > 0,
        placeholderData: (previous) => previous,
        staleTime: Infinity,
        gcTime: 0,
    });
    // An answer for other choices (kept while the next comes) can't be merged.
    const waiting = JSON.stringify(settled) !== JSON.stringify(draft);
    return { ...query, current: query.isSuccess && !query.isPlaceholderData && !query.isFetching && !waiting };
}

/** Everything a merge or "not the same" changes. */
export async function afterMerging(client: QueryClient, collection: Mergeable) {
    client.removeQueries({ queryKey: ["merge-preview"] });
    await Promise.all([collection, "matches", "duplicates"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** Not the same: each remembers the others, so they aren't suggested together again (DUP-5). */
export function useNotTheSame(collection: Mergeable) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (ids: string[]) => request("POST", `/${collection}/${ids[0]}/not-the-same`, { others: ids.slice(1) }),
        onSettled: () => afterMerging(client, collection),
    });
}

/** A value that settles a moment after it stops changing. */
function useSettled<T>(value: T, ms = 300): T {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(timer);
    }, [JSON.stringify(value)]);
    return settled;
}

/** "also Doe, John · john@example.com · 4 matches": the line under a name. */
export function memberLine(m: DuplicateMember, ...rest: (string | false | undefined)[]): string {
    return [m.aliases.length ? `also ${m.aliases.join(", ")}` : undefined, ...rest].filter(Boolean).join(" · ");
}
