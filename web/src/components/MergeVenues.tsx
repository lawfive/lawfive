import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Venue, request, useList } from "../api.ts";
import { describeCount } from "../history.ts";
import { type DuplicateMember, type VenueMergeDraft, type VenueMergePreview, afterMerging, memberLine, useLikely, usePreview } from "../merging.ts";
import { Picker } from "./Picker.tsx";
import { Icon } from "./ui.tsx";

// Merging venues (DUP-7, DUP-8): the venues most likely to be the same place first, with why, and
// a search for any other; then what the merged venue will be (the name, and the address where they
// differ), and every pitch of the others with a suggestion filled in, riskiest first: kept as a
// pitch of its own (under a name no other pitch has) or the same as another. The server works all
// of it out (DUP-11), asked again as the choices change; this only shows it.

type PitchRow = VenueMergePreview["pitches"][number];
/** A pitch's choice: the same as another (into), or kept under a name. */
type Choice = PitchRow["choice"];

const venueLine = (v: DuplicateMember) => memberLine(v, v.address, v.pitches ? `${v.pitches} ${v.pitches === 1 ? "pitch" : "pitches"}` : undefined, describeCount(v.matches));

export function MergeVenues({ keep, preselected = [], onClose, onMerged }: { keep: Venue; preselected?: string[]; onClose: () => void; onMerged: (kept: Venue) => void }) {
    const client = useQueryClient();
    const venues = useList("venues").data ?? [];
    const likely = useLikely("venues", keep.id).data ?? [];
    const [selected, setSelected] = useState<string[]>(preselected);
    const [name, setName] = useState<string>();
    const [addressFrom, setAddressFrom] = useState<string>();
    const [choices, setChoices] = useState(new Map<string, Choice>());

    const draft: VenueMergeDraft = { from: selected, name, addressFrom, pitches: [...choices].map(([id, c]) => ({ id, ...c })) };
    const preview = usePreview<VenueMergePreview>("venues", keep.id, draft);
    const shown = selected.length > 0 ? preview.data : undefined;
    // Those found by search, after the likeliest; with their details once the preview has them.
    const reasonsFor = new Map(likely.map((v) => [v.id, v.reasons]));
    const rows: DuplicateMember[] = [
        ...likely,
        ...selected.filter((id) => !reasonsFor.has(id)).map((id) => shown?.venues.find((v) => v.id === id)
            ?? { id, name: venues.find((v) => v.id === id)?.name ?? "", aliases: [], matches: { played: 0, upcoming: 0 } }),
    ];
    const finalName = shown && name && shown.names.includes(name) ? name : shown?.name ?? keep.name;
    const choiceOf = (p: PitchRow) => choices.get(p.id) ?? p.choice;

    const merge = useMutation({
        mutationFn: () => request<{ venue: Venue; merged: number; matchesUpdated: number }>("POST", `/venues/${keep.id}/merge`, preview.data!.merge),
        onSuccess: async (result) => {
            await afterMerging(client, "venues");
            onMerged(result.venue);
        },
    });
    const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    const firstFine = shown?.pitches.findIndex((p) => !p.check) ?? -1;
    const ready = preview.current && !!preview.data?.merge;

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!merge.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal merge-modal merge-venues">
                <Dialog className="modal-dialog">
                    <Heading slot="title">Merge with {keep.name}</Heading>
                    <p className="muted merge-intro">Pick the venues that are the same place as {keep.name}. Their matches move to one venue, and their names are kept as other names, so imports and searches still find them.</p>

                    <h3 className="merge-heading">{likely.length ? "Most likely the same place" : "No likely matches; search for a venue below"}</h3>
                    {rows.length > 0 && (
                        <ul className="merge-list">
                            {rows.map((v) => (
                                <li key={v.id}>
                                    <label className="merge-option">
                                        <input type="checkbox" checked={selected.includes(v.id)} onChange={() => toggle(v.id)} />
                                        <div className="avatar"><Icon name="venues" size={18} /></div>
                                        <span className="grow">
                                            <span className="title">{v.name}</span>
                                            <span className="sub">{venueLine(v)}</span>
                                        </span>
                                        {v.reasons?.map((reason) => <span key={reason} className="chip chip-blue">{reason}</span>)}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="merge-search">
                        <Picker label="Another venue" placeholder="Search all venues…" clearAfterPick value={undefined}
                            items={venues.filter((v) => v.id !== keep.id && !selected.includes(v.id)).map((v) => ({ id: v.id, name: v.name, detail: v.address, also: v.aliases }))}
                            onChange={(id) => id && setSelected((s) => [...s, id])} />
                    </div>

                    {shown && (
                        <div className="merge-preview">
                            <h3 className="merge-heading">The merged venue</h3>
                            <fieldset className="merge-choice">
                                <legend>Name</legend>
                                <div className="merge-values">
                                    {shown.names.map((n) => (
                                        <label key={n} className={`scheme${n === finalName ? " on" : ""}`}>
                                            <input type="radio" name="venue-name" checked={n === finalName} onChange={() => setName(n)} />
                                            <span>{n}</span>
                                        </label>
                                    ))}
                                </div>
                                {shown.names.length > 1 && <small className="muted">The rest are kept as an alias, so searches and imports still find them.</small>}
                            </fieldset>
                            {shown.places.length > 1 && (
                                <fieldset className="merge-choice">
                                    <legend>Address and parking</legend>
                                    <div className="merge-values">
                                        {shown.places.map((v) => {
                                            const on = v.venueId === (addressFrom && shown.places.some((p) => p.venueId === addressFrom) ? addressFrom : shown.addressFrom);
                                            return (
                                                <label key={v.venueId} className={`scheme${on ? " on" : ""}`}>
                                                    <input type="radio" name="venue-address" checked={on} onChange={() => setAddressFrom(v.venueId)} />
                                                    <span>{v.address ?? "No address"}{v.onMap ? "" : " · parking not on the map"}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </fieldset>
                            )}

                            {shown.pitches.length > 0 && (
                                <section className="merge-pitches" aria-label="Pitches">
                                    <h3 className="merge-heading">Pitches</h3>
                                    <p className="muted merge-pitches-intro">
                                        Each pitch from {shown.venues.length === 2 ? shown.venues[1].name : "the other venues"}: the same as one of {keep.name}'s, or kept as a pitch of its own. The ones to check are first.
                                    </p>
                                    <ul className="merge-pitch-list">
                                        {shown.pitches.map((p, i) => (
                                            <PitchChoiceRow key={p.id} pitch={p} divider={i === firstFine && firstFine > 0} choice={choiceOf(p)}
                                                onChange={(c) => setChoices((m) => new Map(m).set(p.id, c))} />
                                        ))}
                                    </ul>
                                    {shown.notes.map((line) => <p key={line} className="muted merge-note">{line}.</p>)}
                                </section>
                            )}

                            <p className="merge-total">
                                <Icon name="merge" size={18} />
                                <span><strong>{describeCount(shown.together)}</strong> together, at one venue.{" "}
                                    <span className="muted">Tags are combined and notes joined. This can't be undone.</span></span>
                            </p>
                        </div>
                    )}
                    {(merge.error ?? preview.error) && <p className="error">{(merge.error ?? preview.error)!.message}</p>}
                    <div className="modal-actions">
                        {!!shown?.problems && <span className="merge-blocked">{shown.problems === 1 ? "1 pitch needs" : `${shown.problems} pitches need`} a look first</span>}
                        <button type="button" className="btn" disabled={merge.isPending} onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={!ready || merge.isPending} onClick={() => merge.mutate()}>
                            <Icon name="merge" />
                            {merge.isPending ? "Merging…" : selected.length ? `Merge ${selected.length + 1} into ${finalName}` : "Merge"}
                        </button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** One pitch of a venue being merged away: what it is, why it's flagged, and the choice. */
function PitchChoiceRow({ pitch, divider, choice, onChange }: { pitch: PitchRow; divider: boolean; choice: Choice; onChange: (choice: Choice) => void }) {
    const value = choice.into ?? "keep";
    return (
        <>
            {divider && <li className="merge-divider" aria-hidden><span>Likely fine</span></li>}
            <li className="merge-pitch">
                <div className="merge-pitch-what">
                    <span className="title">{pitch.name}</span>
                    <span className="sub">
                        {[pitch.venue, pitch.matches === 0 ? "No matches" : `${pitch.matches} ${pitch.matches === 1 ? "match" : "matches"}`, pitch.corners && `corners walked ${pitch.corners === 1 ? "once" : `${pitch.corners} times`}`, pitch.onMap ? undefined : "not on the map"].filter(Boolean).join(" · ")}
                    </span>
                    <span className={`merge-why${pitch.check ? " check" : ""}`}>
                        {pitch.check && <span className="chip chip-amber">Check</span>}
                        {pitch.why}
                    </span>
                </div>
                <div className="merge-pitch-choice">
                    <select className="input" aria-label={`What happens to ${pitch.name}`} value={value}
                        onChange={(e) => onChange(e.target.value === "keep" ? { name: pitch.name } : { into: e.target.value })}>
                        <option value="keep">Keep as a pitch of its own</option>
                        {pitch.targets.map((t) => <option key={t.id} value={t.id}>Same as {t.name}</option>)}
                    </select>
                    {!choice.into && (
                        <input className="input" aria-label={`Name for ${pitch.name}`} value={choice.name ?? pitch.name} maxLength={60} onChange={(e) => onChange({ name: e.target.value })} />
                    )}
                    {pitch.problem && <small className="error">{pitch.problem}</small>}
                </div>
            </li>
        </>
    );
}
