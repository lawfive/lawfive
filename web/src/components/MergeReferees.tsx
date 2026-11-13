import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Referee, request, useList } from "../api.ts";
import { describeCount } from "../history.ts";
import { type DuplicateMember, type RefereeMergePreview, afterMerging, memberLine, useLikely, usePreview } from "../merging.ts";
import { Picker } from "./Picker.tsx";
import { Icon } from "./ui.tsx";
import { RefereeAvatar } from "./Photos.tsx";

// Merging referees (DUP-1 to DUP-4): the ones most likely to be the same person first, with why,
// and a search for anyone else; then what the merged referee will be (the name, and the email or
// phone where they differ) and how many matches together that makes, before anything changes. The
// server works it out (DUP-11), asked again as the choices change; this only shows it.

export function MergeReferees({ keep, preselected = [], onClose, onMerged }: { keep: Referee; preselected?: string[]; onClose: () => void; onMerged: (kept: Referee) => void }) {
    const client = useQueryClient();
    const referees = useList("referees").data ?? [];
    const likely = useLikely("referees", keep.id).data ?? [];
    const [selected, setSelected] = useState<string[]>(preselected);
    const [name, setName] = useState<string>();
    const [email, setEmail] = useState<string>();
    const [phone, setPhone] = useState<string>();

    const preview = usePreview<RefereeMergePreview>("referees", keep.id, { from: selected, name, email, phone });
    const shown = selected.length > 0 ? preview.data : undefined;
    const reasonsFor = new Map(likely.map((r) => [r.id, r.reasons]));
    const rows: DuplicateMember[] = [
        ...likely,
        ...selected.filter((id) => !reasonsFor.has(id)).map((id) => shown?.referees.find((r) => r.id === id)
            ?? { id, name: referees.find((r) => r.id === id)?.name ?? "", aliases: [], matches: { played: 0, upcoming: 0 } }),
    ];
    // A choice from a referee since unticked falls back to the server's.
    const pick = (values: string[] | undefined, chosen: string | undefined, fallback: string | undefined) => (chosen && values?.includes(chosen) ? chosen : fallback);
    const finalName = pick(shown?.names, name, shown?.name) ?? keep.name;
    const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const merge = useMutation({
        mutationFn: () => request<{ referee: Referee; merged: number; matchesUpdated: number }>("POST", `/referees/${keep.id}/merge`, preview.data!.merge),
        onSuccess: async (result) => {
            await afterMerging(client, "referees");
            onMerged(result.referee);
        },
    });

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!merge.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal merge-modal">
                <Dialog className="modal-dialog">
                    <Heading slot="title">Merge with {keep.name}</Heading>
                    <p className="muted merge-intro">Pick the referees who are the same person as {keep.name}. Their matches move to one referee, and their names are kept as other names, so imports and searches still find them.</p>

                    <h3 className="merge-heading">{likely.length ? "Most likely the same person" : "No likely matches; search for someone below"}</h3>
                    {rows.length > 0 && (
                        <ul className="merge-list">
                            {rows.map((r) => {
                                const record = referees.find((x) => x.id === r.id);
                                return (
                                    <li key={r.id}>
                                        <label className="merge-option">
                                            <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                                            {record && <RefereeAvatar referee={record} name={r.name} />}
                                            <span className="grow">
                                                <span className="title">{r.name}</span>
                                                <span className="sub">{memberLine(r, r.email, r.phone, describeCount(r.matches))}</span>
                                            </span>
                                            {r.reasons?.map((reason) => <span key={reason} className="chip chip-blue">{reason}</span>)}
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <div className="merge-search">
                        <Picker label="Another referee" placeholder="Search all referees…" clearAfterPick value={undefined}
                            items={referees.filter((r) => r.id !== keep.id && !selected.includes(r.id)).map((r) => ({ id: r.id, name: r.name, detail: r.email, also: r.aliases }))}
                            onChange={(id) => id && setSelected((s) => [...s, id])} />
                    </div>

                    {shown && (
                        <div className="merge-preview">
                            <h3 className="merge-heading">The merged referee</h3>
                            <Choice label="Name" values={shown.names} value={finalName} onChange={setName} hint="The rest are kept as an alias, so searches and imports still find them." />
                            {shown.emails.length > 1 && <Choice label="Email" values={shown.emails} value={pick(shown.emails, email, shown.email)!} onChange={setEmail} />}
                            {shown.phones.length > 1 && <Choice label="Phone" values={shown.phones} value={pick(shown.phones, phone, shown.phone)!} onChange={setPhone} />}
                            <p className="merge-total">
                                <Icon name="merge" size={18} />
                                <span><strong>{describeCount(shown.together)}</strong> together, as one referee.{" "}
                                    <span className="muted">Tags are combined and notes joined. This can't be undone.</span></span>
                            </p>
                        </div>
                    )}
                    {(merge.error ?? preview.error) && <p className="error">{(merge.error ?? preview.error)!.message}</p>}
                    <div className="modal-actions">
                        <button type="button" className="btn" disabled={merge.isPending} onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={!preview.current || selected.length === 0 || merge.isPending} onClick={() => merge.mutate()}>
                            <Icon name="merge" />
                            {merge.isPending ? "Merging…" : selected.length ? `Merge ${selected.length + 1} into ${finalName}` : "Merge"}
                        </button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** One of the merged referee's details, where the referees differ: pick which to keep. */
function Choice({ label, values, value, onChange, hint }: { label: string; values: string[]; value: string; onChange: (value: string) => void; hint?: string }) {
    return (
        <fieldset className="merge-choice">
            <legend>{label}</legend>
            <div className="merge-values">
                {values.map((v) => (
                    <label key={v} className={`scheme${v === value ? " on" : ""}`}>
                        <input type="radio" name={label} checked={v === value} onChange={() => onChange(v)} />
                        <span>{v}</span>
                    </label>
                ))}
            </div>
            {hint && values.length > 1 && <small className="muted">{hint}</small>}
        </fieldset>
    );
}
