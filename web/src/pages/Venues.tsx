import { Suspense, lazy, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { type Draft, type Venue, useList } from "../api.ts";
import { FoundPlaces, useAddressLookUp } from "../components/AddressLookUp.tsx";
import { FormActions, useEditor } from "../components/editor.tsx";
import { History, TogetherFigures } from "../components/History.tsx";
import { Photos } from "../components/Photos.tsx";
import { ListTools, useListTools } from "../components/ListTools.tsx";
import { EmptyList, Fact, Field, Icon, Loading, MapPlaceholder, PageHead, TagInput, Tags, TextInput, tagsOf, TextArea, useBackTo } from "../components/ui.tsx";
import type { Pin } from "../components/VenueMap.tsx";
import { formatShortDay } from "../format.ts";
import { useDirections } from "../settings.ts";
import { describeCount, useWorkedTogether } from "../history.ts";
import { searchAndSort } from "../search.ts";
import { MatchesWith } from "./Matches.tsx";
import { MergeVenues } from "../components/MergeVenues.tsx";
import { DuplicateCard, DuplicatesNotice } from "../components/DuplicateHints.tsx";
import { newId } from "../ids.ts";

// The map library is large, so it loads only when a venue page needs it.
const LazyMap = lazy(() => import("../components/VenueMap.tsx").then((m) => ({ default: m.VenueMap })));
const VenueMap = (props: React.ComponentProps<typeof LazyMap>) => (
    <Suspense fallback={<MapPlaceholder height={props.height ?? 320} />}><LazyMap {...props} /></Suspense>
);

// Venues: an address (often where you park) and named pitches, each with its own GPS position,
// placed on a map. Finding and merging duplicates is in VenueDuplicates.tsx and
// components/MergeVenues.tsx (DUP-7).

/** Where a venue goes on an overview map: its parking spot, else its first placed pitch. */
function venuePosition(v: Venue) {
    return v.position ?? v.pitches.find((p) => p.position)?.position;
}

export function Venues() {
    const venues = useList("venues");
    const together = useWorkedTogether().venues;
    const back = useBackTo({ to: "/venues", label: "Venues" });
    const { state } = useLocation();
    const tools = useListTools();
    const navigate = useNavigate();
    const shown = searchAndSort(venues.data ?? [], tools.query, tools.sort,
        (v) => [v.name, ...(v.aliases ?? []), v.address, v.notes, ...v.pitches.flatMap((p) => [p.name, ...(p.aliases ?? [])]), ...(v.tags ?? [])], (v) => v.name, (v) => together.get(v.id)?.played ?? 0);
    const pins: Pin[] = shown.flatMap((v) => {
        const at = venuePosition(v);
        return at ? [{ id: v.id, lat: at.lat, lon: at.lon, label: v.name, kind: "venue" as const, onClick: () => navigate(`/venues/${v.id}`) }] : [];
    });
    return (
        <>
            <PageHead title="Venues" hero actions={
                <>
                    {(venues.data?.length ?? 0) > 1 && <Link to="/venues/duplicates" className="btn"><Icon name="merge" />Find duplicates</Link>}
                    <Link to="/venues/new" className="btn btn-primary"><Icon name="plus" />New venue</Link>
                </>
            } />
            <DuplicatesNotice kind="venues" />
            {pins.length > 0 && <div className="card section-map"><VenueMap pins={pins} height={300} /></div>}
            <ListTools tools={tools} label="venues" placeholder="Search names, addresses, pitches, tags…" />
            <div className="card">
                {venues.isLoading && <Loading />}
                {venues.data?.length === 0 && <EmptyList picture="venue" title="No venues yet" text="Save a ground once to keep its address, parking and pitches at hand." action={{ to: "/venues/new", label: "Add a venue" }} />}
                {venues.data?.length !== 0 && venues.isSuccess && shown.length === 0 && <div className="empty">No venues match “{tools.query}”.</div>}
                {shown.map((v) => (
                    <Link key={v.id} to={`/venues/${v.id}`} className="list-row">
                        <div className="avatar"><Icon name="venues" size={18} /></div>
                        <div className="grow">
                            <div className="title">{v.name}</div>
                            <div className="sub">{[v.address, v.pitches.length && `${v.pitches.length} ${v.pitches.length === 1 ? "pitch" : "pitches"}`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="list-meta">
                            <Tags tags={v.tags} />
                            {!venuePosition(v) && <span className="chip chip-amber">Not on the map</span>}
                            <span className="muted list-count">{describeCount(together.get(v.id))}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </>
    );
}

/**
 * A venue's page (APP-4's, on the web too): its map, Directions, pitches, tags and notes, the
 * matches there and photos, with Edit for the form.
 */
export function VenuePage() {
    const { id } = useParams();
    const venues = useList("venues");
    const matches = useList("matches");
    const together = useWorkedTogether().venues;
    const back = useBackTo({ to: "/venues", label: "Venues" });
    const { state } = useLocation();
    const [merging, setMerging] = useState<string[]>();
    const directions = useDirections();
    const v = venues.data?.find((x) => x.id === id);
    if (!v) {
        return venues.isLoading ? <Loading /> : <NotThere what="venue" back={{ to: "/venues", label: "Venues" }} />;
    }
    const position = venuePosition(v);
    const pins: Pin[] = [
        ...(v.position ? [{ id: PARKING, ...v.position, label: "Parking", kind: "parking" as const, mark: "P" }] : []),
        ...v.pitches.flatMap((p, i) => (p.position ? [{ id: p.id, ...p.position, label: p.name, kind: "pitch" as const, mark: String(i + 1) }] : [])),
    ];
    return (
        <>
            <PageHead back={back} title={v.name}
                sub={<>{v.aliases?.length ? <>Also {v.aliases.join(", ")} · </> : null}{v.address}</>}
                actions={
                    <>
                        {(position || v.address) && <a className="btn" href={directions(position ?? v.address!)} target="_blank" rel="noreferrer"><Icon name="directions" />Directions</a>}
                        <Link to={`/venues/${v.id}/edit`} state={state} className="btn"><Icon name="edit" />Edit</Link>
                    </>
                } />
            <DuplicateCard kind="venues" id={v.id} onMerge={setMerging} />
            <TogetherFigures name={v.name} together={together.get(v.id)} where="here" extra={{ label: "Pitches", value: String(v.pitches.length), sub: v.pitches.length ? `${v.pitches.filter((p) => p.position).length} on the map` : "None yet" }} />
            {merging && <MergeVenues keep={v} preselected={merging} onClose={() => setMerging(undefined)} onMerged={() => setMerging(undefined)} />}
            <div className="two-col">
                <div className="stack">
                    {pins.length > 0 && <div className="card section-map map-frame"><VenueMap pins={pins} height={320} /></div>}
                    <MatchesWith title="Matches here" name={v.name} matches={(matches.data ?? []).filter((m) => m.venueId === v.id)} none="No matches here yet." />
                </div>
                <div className="stack">
                    {/* WEB-24: the pitches on the grass, each numbered on a board tile as its pin is on the map. */}
                    {v.pitches.length > 0 && (
                        <section aria-labelledby="pitches-title">
                            <div className="events-head"><h2 id="pitches-title">Pitches</h2></div>
                            <ul className="tile-rows">
                                {v.pitches.map((p, i) => (
                                    <li className="tile-row" key={p.id}>
                                        <span className="row-tile" aria-hidden>{i + 1}</span>
                                        <span className="row-main">
                                            <span className="row-who">
                                                <span className="row-name"><span className="visually-hidden">Pitch {i + 1}: </span>{p.name}</span>
                                                <span className="row-sub">
                                                    {p.aliases?.length ? <>Also {p.aliases.join(", ")} · </> : null}
                                                    {p.position ? "On the map" : "Not on the map yet"}
                                                    {p.markings?.length ? <> · Corners walked {formatShortDay(p.markings.at(-1)!.at)}</> : null}
                                                </span>
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                    {(v.tags?.length || v.notes) && (
                        <dl className="facts" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
                            {v.tags?.length ? <Fact icon="tag" label="Tags"><span className="row"><Tags tags={v.tags} /></span></Fact> : null}
                            {v.notes && <Fact icon="note" label="Notes"><span className="notes-text">{v.notes}</span></Fact>}
                        </dl>
                    )}
                    <Photos recordType="venue" recordId={v.id} />
                </div>
            </div>
        </>
    );
}

/** A venue or referee that has gone (deleted elsewhere), or a link to one that never was. */
export function NotThere({ what, back }: { what: string; back: { to: string; label: string } }) {
    return (
        <>
            <PageHead back={back} title={`No such ${what}`} />
            <div className="card"><div className="empty">This {what} isn't in your account: it may have been deleted.</div></div>
        </>
    );
}

const PARKING = "parking";

export function VenueEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { state } = useLocation();
    const editor = useEditor("venues", id, (): Draft<"venues"> => ({ id: newId(), name: "", pitches: [] }));
    const venueTags = tagsOf(useList("venues").data);
    const together = useWorkedTogether();
    const [placing, setPlacing] = useState<string>(PARKING);
    const [center, setCenter] = useState<{ lat: number; lon: number }>();
    const [merging, setMerging] = useState(false);
    const mapSection = useRef<HTMLElement>(null);
    const search = useAddressLookUp((p) => {
        editor.update({ position: { lat: p.lat, lon: p.lon } });
        setCenter({ lat: p.lat, lon: p.lon });
    });
    const v = editor.draft;
    if (!v) {
        return <Loading />;
    }
    const set = editor.update;
    const setPitch = (pitchId: string, patch: Partial<Venue["pitches"][number]>) => set({ pitches: v.pitches.map((p) => (p.id === pitchId ? { ...p, ...patch } : p)) });
    const place = (target: string, lat: number, lon: number) => (target === PARKING ? set({ position: { lat, lon } }) : setPitch(target, { position: { lat, lon } }));

    // Place chooses the pitch on the map and brings the map into view, as it's above the list.
    const placeOnMap = (pitchId: string) => {
        setPlacing(pitchId);
        mapSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const addPitch = () => {
        const pitch = { id: newId(), name: `Field ${v.pitches.length + 1}` };
        set({ pitches: [...v.pitches, pitch] });
        setPlacing(pitch.id);
    };

    const pins: Pin[] = [
        ...(v.position ? [{ id: PARKING, ...v.position, label: "Parking", kind: "parking" as const, mark: "P" }] : []),
        ...v.pitches.flatMap((p, i) => (p.position ? [{ id: p.id, ...p.position, label: p.name, kind: "pitch" as const, mark: String(i + 1) }] : [])),
    ];
    const targets = [{ id: PARKING, name: "Parking", mark: "P", placed: Boolean(v.position) }, ...v.pitches.map((p, i) => ({ id: p.id, name: p.name, mark: String(i + 1), placed: Boolean(p.position) }))];

    return (
        <>
            <PageHead back={editor.isNew ? { to: "/venues", label: "Venues" } : { to: `/venues/${v.id}`, label: `Venue · ${v.name}`, state }} title={editor.isNew ? "New venue" : "Edit venue"} tab={editor.isNew ? "New venue" : editor.saved && `Edit ${editor.saved.name}`}
                sub={!editor.isNew && <History name={v.name} together={together.venues.get(v.id)} where="here" />}
                actions={!editor.isNew && editor.saved && <button type="button" className="btn" onClick={() => setMerging(true)}><Icon name="merge" />Merge with…</button>} />
            {merging && editor.saved && (
                <MergeVenues keep={editor.saved} onClose={() => setMerging(false)}
                    onMerged={(kept) => { setMerging(false); editor.reset(kept); }} />
            )}
            <form className="form" onSubmit={(e) => { e.preventDefault(); editor.save((saved) => `/venues/${saved.id}`); }}>
                <section className="card form-section">
                    <h2>Venue</h2>
                    <div className="fields">
                        <Field label="Name"><TextInput value={v.name} onChange={(name) => set({ name: name ?? "" })} maxLength={100} /></Field>
                        <Field label="Address" wide info="Usually where you park. The pitches can be some way off, so each one gets its own spot on the map below.">
                            <div className="row" style={{ flexWrap: "nowrap" }}>
                                <div className="grow"><TextInput value={v.address} onChange={(address) => set({ address })} /></div>
                                {search.available && (
                                    <button type="button" className="btn" disabled={!v.address || search.looking} onClick={() => v.address && void search.lookUp(v.address)}>
                                        <Icon name="search" />{search.looking ? "Looking…" : "Find on map"}
                                    </button>
                                )}
                            </div>
                            <FoundPlaces search={search} instead="Place the pin on the map instead." />
                        </Field>
                        <Field label="Tags"><TagInput tags={v.tags} onChange={(tags) => set({ tags })} suggestions={venueTags} /></Field>
                        <Field label="Other names" info="Other ways its name is written, such as in a league's or assignor's schedule. Imports and searches find it by these too; merging adds the merged venues' names here.">
                            <TagInput names tags={v.aliases} onChange={(aliases) => set({ aliases })} />
                        </Field>
                        <Field label="Notes" wide><TextArea value={v.notes ?? ""} placeholder="Parking, toilets, lightning policy…" onChange={(value) => set({ notes: value || undefined })} /></Field>
                    </div>
                </section>

                <section className="card form-section" ref={mapSection}>
                    <h2>Map</h2>
                    <p className="muted" style={{ marginTop: -6 }}>Choose what to place, then click the map. Drag a pin to move it.</p>
                    <div className="place-targets">
                        {targets.map((t) => (
                            <button type="button" key={t.id} className={`chip place-target${placing === t.id ? " chip-brand" : ""}`} onClick={() => setPlacing(t.id)}>
                                <span className={`mini-pin ${t.id === PARKING ? "parking" : "pitch"}`}>{t.mark}</span>
                                {t.name}{!t.placed && <span className="muted"> · not placed</span>}
                            </button>
                        ))}
                    </div>
                    <VenueMap pins={pins} height={380} activeId={placing} center={center}
                        onPick={(lat, lon) => place(placing, lat, lon)} onMove={place} />
                </section>

                <section className="card form-section">
                    <h2>Pitches</h2>
                    <div className="list-editor">
                        {v.pitches.map((p, i) => (
                            <div className="item pitch" key={p.id}>
                                <span className="mini-pin pitch">{i + 1}</span>
                                <div className="pitch-name"><Field label="Name"><TextInput value={p.name} onChange={(name) => setPitch(p.id, { name: name ?? "" })} /></Field></div>
                                <div className="pitch-aliases">
                                    <Field label="Other names" info="Other ways this pitch is written in schedules (Field A, Pitch 3). Imports find it by these too.">
                                        <TagInput names tags={p.aliases} onChange={(aliases) => setPitch(p.id, { aliases })} />
                                    </Field>
                                </div>
                                <span className="muted coords">
                                    {p.position ? `${p.position.lat.toFixed(5)}, ${p.position.lon.toFixed(5)}` : "Not on the map yet"}
                                    {/* TRK-13: corners walked on the watch, used for this pitch's matches from then on. */}
                                    {p.markings?.length ? (
                                        <span className="pitch-marked">
                                            {" · "}Corners walked {formatShortDay(p.markings.at(-1)!.at)}
                                            <button type="button" className="link-button" onClick={() => confirm("Forget the corners walked for this pitch? Its later matches go back to the pitch found from each track.") && setPitch(p.id, { markings: undefined })}>Forget</button>
                                        </span>
                                    ) : null}
                                </span>
                                <div className="row pitch-actions">
                                    <button type="button" className="btn" onClick={() => placeOnMap(p.id)}><Icon name="pin" />Place</button>
                                    <button type="button" className="btn btn-ghost" onClick={() => set({ pitches: v.pitches.filter((x) => x.id !== p.id) })}>Remove</button>
                                </div>
                            </div>
                        ))}
                        <div><button type="button" className="btn" onClick={addPitch}>Add a pitch</button></div>
                    </div>
                </section>
                <Photos recordType="venue" recordId={editor.isNew ? undefined : v.id} inForm />
                <FormActions editor={editor} deleteLabel="Delete venue" onCancel={() => navigate(editor.isNew ? "/venues" : `/venues/${v.id}`, { state })} onDelete={() => editor.remove("/venues")} />
            </form>
        </>
    );
}
