import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLookup } from "../api.ts";
import { MergeReferees } from "../components/MergeReferees.tsx";
import { Icon, Loading, PageHead, Pitch } from "../components/ui.tsx";
import { describeCount } from "../history.ts";
import { memberLine, useDuplicates, useNotTheSame } from "../merging.ts";
import { RefereeAvatar } from "../components/Photos.tsx";

// Looking for duplicates across all referees (DUP-1, DUP-2, DUP-5): groups that are probably one
// person, with why, as the server finds them (DUP-11); merge a group (choosing who's in it, or
// adding anyone else), or say they're different people so they aren't flagged again.

export function RefereeDuplicates() {
    const navigate = useNavigate();
    const referees = useLookup("referees");
    const duplicates = useDuplicates("referees");
    const distinct = useNotTheSame("referees");
    const [merging, setMerging] = useState<{ keep: string; others: string[] }>();
    const groups = duplicates.data?.groups ?? [];
    const keep = merging && referees.get(merging.keep);

    return (
        <>
            <PageHead back={{ to: "/referees", label: "Referees" }} title="Duplicate referees"
                sub="Referees who are probably the same person under different names (Doe, John and John Doe, J. Doe), or with the same email or phone. Merging keeps their matches together and their names as other names." />
            {duplicates.isLoading && <Loading />}
            {duplicates.error && <p className="error">{duplicates.error.message}</p>}
            {duplicates.isSuccess && groups.length === 0 && (
                <div className="card empty pitch-empty">
                    <Pitch />
                    <h2>No likely duplicates</h2>
                    <p className="muted">None of your {duplicates.data.of} referees look like the same person. To merge two anyway, open one and choose Merge with.</p>
                    <Link to="/referees" className="btn">Back to referees</Link>
                </div>
            )}
            <div className="stack">
                {groups.map((group) => (
                    <section key={group.members.map((r) => r.id).join()} className="card duplicate-group">
                        <div className="duplicate-head">
                            <strong>Probably the same person</strong>
                            {group.reasons.map((reason) => <span key={reason} className="chip chip-blue">{reason}</span>)}
                        </div>
                        {group.members.map((r) => {
                            const record = referees.get(r.id);
                            return (
                                <Link key={r.id} to={`/referees/${r.id}`} className="list-row">
                                    {record && <RefereeAvatar referee={record} name={r.name} />}
                                    <div className="grow">
                                        <div className="title">{r.name}</div>
                                        <div className="sub">{memberLine(r, r.email, r.phone) || "No contact details"}</div>
                                    </div>
                                    <span className="muted list-count">{describeCount(r.matches)}</span>
                                </Link>
                            );
                        })}
                        <div className="duplicate-actions">
                            <button type="button" className="btn btn-ghost" disabled={distinct.isPending} onClick={() => distinct.mutate(group.members.map((r) => r.id))}>
                                {group.members.length === 2 ? "Not the same person" : "Not the same people"}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={() => setMerging({ keep: group.members[0].id, others: group.members.slice(1).map((r) => r.id) })}>
                                <Icon name="merge" />Merge…
                            </button>
                        </div>
                    </section>
                ))}
            </div>
            {distinct.error && <p className="error">{distinct.error.message}</p>}
            {merging && keep && (
                <MergeReferees keep={keep} preselected={merging.others} onClose={() => setMerging(undefined)}
                    onMerged={() => {
                        setMerging(undefined);
                        if (groups.length <= 1) {
                            navigate("/referees");
                        }
                    }} />
            )}
        </>
    );
}
