import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLookup } from "../api.ts";
import { MergeVenues } from "../components/MergeVenues.tsx";
import { Icon, Loading, PageHead, Pitch } from "../components/ui.tsx";
import { describeCount } from "../history.ts";
import { memberLine, useDuplicates, useNotTheSame } from "../merging.ts";

// Looking for duplicates across all venues (DUP-7): groups that are probably one place, with why,
// as the server finds them (DUP-11); merge a group (choosing which are in it, or adding any other),
// or say they're different places so they aren't flagged again.

export function VenueDuplicates() {
    const navigate = useNavigate();
    const venues = useLookup("venues");
    const duplicates = useDuplicates("venues");
    const distinct = useNotTheSame("venues");
    const [merging, setMerging] = useState<{ keep: string; others: string[] }>();
    const groups = duplicates.data?.groups ?? [];
    const keep = merging && venues.get(merging.keep);

    return (
        <>
            <PageHead back={{ to: "/venues", label: "Venues" }} title="Duplicate venues"
                sub="Venues that are probably the same place under different names (Twin Creeks and Twin Creeks Sports Complex), at the same address, or within 150 m of each other. Merging keeps their matches together and their names as other names." />
            {duplicates.isLoading && <Loading />}
            {duplicates.error && <p className="error">{duplicates.error.message}</p>}
            {duplicates.isSuccess && groups.length === 0 && (
                <div className="card empty pitch-empty">
                    <Pitch />
                    <h2>No likely duplicates</h2>
                    <p className="muted">None of your {duplicates.data.of} venues look like the same place. To merge two anyway, open one, choose Edit, then Merge with.</p>
                    <Link to="/venues" className="btn">Back to venues</Link>
                </div>
            )}
            <div className="stack">
                {groups.map((group) => (
                    <section key={group.members.map((v) => v.id).join()} className="card duplicate-group">
                        <div className="duplicate-head">
                            <strong>Probably the same place</strong>
                            {group.reasons.map((reason) => <span key={reason} className="chip chip-blue">{reason}</span>)}
                        </div>
                        {group.members.map((v) => (
                            <Link key={v.id} to={`/venues/${v.id}`} className="list-row">
                                <div className="avatar"><Icon name="venues" size={18} /></div>
                                <div className="grow">
                                    <div className="title">{v.name}</div>
                                    <div className="sub">
                                        {memberLine(v, v.address, v.pitches ? `${v.pitches} ${v.pitches === 1 ? "pitch" : "pitches"}` : undefined) || "No address or pitches"}
                                    </div>
                                </div>
                                <span className="muted list-count">{describeCount(v.matches)}</span>
                            </Link>
                        ))}
                        <div className="duplicate-actions">
                            <button type="button" className="btn btn-ghost" disabled={distinct.isPending} onClick={() => distinct.mutate(group.members.map((v) => v.id))}>
                                {group.members.length === 2 ? "Not the same venue" : "Not the same venues"}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => setMerging({ keep: group.members[0].id, others: group.members.slice(1).map((v) => v.id) })}>
                                <Icon name="merge" />Merge…
                            </button>
                        </div>
                    </section>
                ))}
            </div>
            {distinct.error && <p className="error">{distinct.error.message}</p>}
            {merging && keep && (
                <MergeVenues keep={keep} preselected={merging.others} onClose={() => setMerging(undefined)}
                    onMerged={() => {
                        setMerging(undefined);
                        if (groups.length <= 1) {
                            navigate("/venues");
                        }
                    }} />
            )}
        </>
    );
}
