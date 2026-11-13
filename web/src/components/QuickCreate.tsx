import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Competition, type Place, ApiError, useSave } from "../api.ts";
import { FoundPlaces, useAddressLookUp } from "./AddressLookUp.tsx";
import { Field, Icon, Select, TextInput } from "./ui.tsx";
import { newId } from "../ids.ts";

// Creating a venue, competition or referee without leaving the match form: the essentials here,
// the rest (pitches, notes) later on its own page. A venue's address is looked up and the venue
// placed on its map, as the venue form's Find on map does (WEB-12), so the match gets its forecast
// and directions from the start.

export type QuickKind = "venues" | "competitions" | "referees";

const titles: Record<QuickKind, string> = { venues: "New venue", competitions: "New competition", referees: "New referee" };

export function QuickCreate({ kind, name, onClose, onCreated }: { kind: QuickKind; name: string; onClose: () => void; onCreated: (id: string) => void }) {
    const [draft, setDraft] = useState<Record<string, string | undefined>>({ name, type: "league" });
    const [placed, setPlaced] = useState<Place>();
    /** The address last looked up, so Create doesn't look the same one up twice. */
    const [searched, setSearched] = useState<string>();
    /** Create was pressed while the search had several places to choose from: choosing one creates it. */
    const [creating, setCreating] = useState(false);
    const save = useSave(kind);
    const search = useAddressLookUp((place) => {
        setPlaced(place);
        if (creating) {
            submitWith(place);
        }
    });
    const set = (key: string) => (value: string | undefined) => setDraft((d) => ({ ...d, [key]: value }));
    const setAddress = (address: string | undefined) => {
        set("address")(address);
        setPlaced(undefined);
        setCreating(false);
        search.clear();
    };
    const dirty = draft.name !== name || !!draft.address || !!draft.season || !!draft.email || !!draft.phone;

    const submitWith = (place: Place | undefined) => {
        const id = newId();
        const base = { id, name: draft.name ?? "" };
        const record =
            kind === "venues" ? { ...base, address: draft.address, pitches: [], ...(place ? { position: { lat: place.lat, lon: place.lon } } : {}) }
            : kind === "competitions" ? { ...base, type: (draft.type ?? "league") as Competition["type"], season: draft.season }
            : { ...base, email: draft.email, phone: draft.phone };
        // The three kinds share one save hook; the server checks each against its schema.
        save.mutate(record as never, { onSuccess: () => onCreated(id) });
    };
    const submit = async () => {
        const address = draft.address?.trim();
        if (kind === "venues" && address && !placed && search.available && searched !== address) {
            // Looked up first, as Find on map would be: one place is used straight away; with
            // several, choosing one creates the venue; with none, Create again makes it unplaced.
            setSearched(address);
            const place = await search.lookUp(address);
            if (place) {
                submitWith(place);
            } else {
                setCreating(true);
            }
            return;
        }
        submitWith(placed);
    };
    const error = save.error instanceof ApiError && save.error.body.issues
        ? save.error.body.issues.map((i) => `${i.path.join(" › ")}: ${i.message}`).join("; ")
        : save.error?.message;
    // Looked up, and not placed (nothing found, or a place not chosen): Create makes it without one.
    const unplaced = kind === "venues" && !!draft.address && !placed && searched === draft.address.trim() && !search.looking;

    return (
        // Typing isn't lost to Escape or a click beside the dialog; Cancel still closes it.
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!dirty} isKeyboardDismissDisabled={dirty} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                        <Heading slot="title">{titles[kind]}</Heading>
                        <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                            <Field label="Name"><TextInput value={draft.name} onChange={set("name")} maxLength={100} /></Field>
                            {kind === "venues" && (
                                <Field label="Address" info="Usually where you park. It's looked up and the venue placed on the map, for the match's forecast and directions. Place the pitches themselves from the Venues page.">
                                    <div className="row" style={{ flexWrap: "nowrap" }}>
                                        <div className="grow"><TextInput value={draft.address} onChange={setAddress} /></div>
                                        {search.available && (
                                            <button type="button" className="btn" disabled={!draft.address?.trim() || search.looking}
                                                onClick={() => { const a = draft.address!.trim(); setSearched(a); void search.lookUp(a); }}>
                                                <Icon name="search" />{search.looking ? "Looking…" : "Find on map"}
                                            </button>
                                        )}
                                    </div>
                                    {placed && (
                                        <div className="found found-placed">
                                            <span><Icon name="check" size={16} />On the map at {placed.name}</span>
                                        </div>
                                    )}
                                    <FoundPlaces search={search} instead="Create it anyway, and place it from the Venues page." />
                                </Field>
                            )}
                            {kind === "competitions" && (
                                <>
                                    <Field label="Type">
                                        <Select value={draft.type} onChange={set("type")} options={[["league", "League"], ["tournament", "Tournament"], ["cup", "Cup"], ["friendly", "Friendly"]]} />
                                    </Field>
                                    <Field label="Season"><TextInput value={draft.season} onChange={set("season")} placeholder="2026-27" /></Field>
                                </>
                            )}
                            {kind === "referees" && (
                                <>
                                    <Field label="Email"><TextInput type="email" value={draft.email} onChange={set("email")} /></Field>
                                    <Field label="Phone"><TextInput type="tel" value={draft.phone} onChange={set("phone")} /></Field>
                                </>
                            )}
                        </div>
                        {error && <p className="error">{error}</p>}
                        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                            <button type="button" className="btn" onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={save.isPending || search.looking || !draft.name}>
                                {search.looking ? "Looking…" : unplaced ? "Create without the map" : "Create"}
                            </button>
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
