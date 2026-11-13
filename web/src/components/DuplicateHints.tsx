import { Link } from "react-router";
import { type Mergeable, useDuplicates, useNotTheSame } from "../merging.ts";
import { Icon } from "./ui.tsx";

// Likely duplicates where they're seen (DUP-13): a line at the top of the Venues and Referees lists,
// and a card on a venue's or referee's page naming the ones it's probably the same as. Both use the
// server's groups (DUP-11), so they agree with Find duplicates; neither shows when there are none.

const many = { venues: "venues", referees: "referees" };

/** "2 venues look like duplicates · Review", over the list. */
export function DuplicatesNotice({ kind }: { kind: Mergeable }) {
    const groups = useDuplicates(kind).data?.groups ?? [];
    const count = groups.reduce((n, g) => n + g.members.length, 0);
    if (!count) {
        return null;
    }
    return (
        <div className="dup-notice">
            <Icon name="merge" size={18} />
            <span className="grow">{count} {many[kind]} look like duplicates</span>
            <Link to={`/${kind}/duplicates`}>Review</Link>
        </div>
    );
}

/** On a venue's or referee's page: the ones it's probably the same as, with why, Merge… and Not the same. */
export function DuplicateCard({ kind, id, onMerge }: { kind: Mergeable; id: string; onMerge: (others: string[]) => void }) {
    const group = useDuplicates(kind).data?.groups.find((g) => g.members.some((m) => m.id === id));
    const distinct = useNotTheSame(kind);
    if (!group) {
        return null;
    }
    const others = group.members.filter((m) => m.id !== id);
    const one = kind === "venues" ? "venue" : "person";
    return (
        <section className="card dup-card" aria-label="Likely duplicate">
            <div className="dup-card-head">
                <Icon name="merge" size={18} />
                <strong>Probably the same as {others.map((m) => m.name).join(" and ")}</strong>
            </div>
            <div className="row">{group.reasons.map((reason) => <span key={reason} className="chip chip-blue">{reason}</span>)}</div>
            {distinct.error && <p className="error">{distinct.error.message}</p>}
            <div className="dup-card-actions">
                <button type="button" className="btn" disabled={distinct.isPending} onClick={() => distinct.mutate(group.members.map((m) => m.id))}>
                    {others.length === 1 ? `Not the same ${one}` : `Not the same ${kind === "venues" ? "venues" : "people"}`}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => onMerge(others.map((m) => m.id))}><Icon name="merge" />Merge…</button>
            </div>
        </section>
    );
}
