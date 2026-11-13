import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { type Draft, useList } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { History, TogetherFigures } from "../components/History.tsx";
import { MergeReferees } from "../components/MergeReferees.tsx";
import { DuplicateCard, DuplicatesNotice } from "../components/DuplicateHints.tsx";
import { Photos, RefereeAvatar } from "../components/Photos.tsx";
import { ListTools, useListTools } from "../components/ListTools.tsx";
import { EmptyList, Fact, Field, Icon, Loading, PageHead, TagInput, Tags, TextInput, tagsOf, TextArea, useBackTo, ContactButtons } from "../components/ui.tsx";
import { describeCount, useWorkedTogether } from "../history.ts";
import { surname } from "../format.ts";
import { searchAndSort } from "../search.ts";
import { NotThere } from "./Venues.tsx";
import { MatchesWith } from "./Matches.tsx";
import { newId } from "../ids.ts";

// The referees the user works with; finding and merging duplicates is in RefereeDuplicates.tsx
// and components/MergeReferees.tsx (DUP-1 to DUP-6).

export function Referees() {
    const referees = useList("referees");
    const together = useWorkedTogether().referees;
    const back = useBackTo({ to: "/referees", label: "Referees" });
    const { state } = useLocation();
    const tools = useListTools();
    const shown = searchAndSort(referees.data ?? [], tools.query, tools.sort,
        (r) => [r.name, ...(r.aliases ?? []), r.email, r.phone, r.notes, ...(r.tags ?? [])], (r) => r.name, (r) => together.get(r.id)?.played ?? 0);
    return (
        <>
            <PageHead title="Referees" hero sub="The officials you work with." actions={
                <>
                    {(referees.data?.length ?? 0) > 1 && <Link to="/referees/duplicates" className="btn"><Icon name="merge" />Find duplicates</Link>}
                    <Link to="/referees/new" className="btn btn-primary"><Icon name="plus" />Add referee</Link>
                </>
            } />
            <DuplicatesNotice kind="referees" />
            <ListTools tools={tools} label="referees" placeholder="Search names, email, phone, tags…" />
            <div className="card">
                {referees.isLoading && <Loading />}
                {referees.data?.length === 0 && <EmptyList picture="crew" title="No referees yet" text="Save the people you work with, so you can add them to a match and get in touch." action={{ to: "/referees/new", label: "Add a referee" }} />}
                {referees.data?.length !== 0 && referees.isSuccess && shown.length === 0 && <div className="empty">No referees match “{tools.query}”.</div>}
                {shown.map((r) => (
                    // WEB-23: the row opens the profile; the contact buttons beside it are links of their own.
                    <div key={r.id} className="list-row contact-row">
                        <Link to={`/referees/${r.id}`} className="contact-row-main">
                            <RefereeAvatar referee={r} name={r.name} />
                            <div className="grow">
                                <div className="title">{r.name}</div>
                                {(r.notes || r.aliases?.length) && <div className="sub">{r.notes || `Also ${r.aliases!.join(", ")}`}</div>}
                                {/* On a phone, where the column at the right gives way to the contact buttons. */}
                                <div className="sub count-sub">{describeCount(together.get(r.id))}</div>
                            </div>
                            <div className="list-meta">
                                <Tags tags={r.tags} />
                                <span className="muted list-count">{describeCount(together.get(r.id))}</span>
                            </div>
                        </Link>
                        <ContactButtons phone={r.phone} email={r.email} name={r.name} />
                    </div>
                ))}
            </div>
        </>
    );
}

/**
 * A referee's page (APP-4's, on the web too): their picture, how many matches you've worked
 * together, Email, Call and Text, their details, the matches together and photos, with Edit.
 */
export function RefereePage() {
    const { id } = useParams();
    const referees = useList("referees");
    const matches = useList("matches");
    const together = useWorkedTogether().referees;
    const back = useBackTo({ to: "/referees", label: "Referees" });
    const { state } = useLocation();
    const [merging, setMerging] = useState<string[]>();
    const r = referees.data?.find((x) => x.id === id);
    if (!r) {
        return referees.isLoading ? <Loading /> : <NotThere what="referee" back={{ to: "/referees", label: "Referees" }} />;
    }
    const t = together.get(r.id);
    return (
        <>
            <PageHead back={back} title={r.name}
                sub={r.aliases?.length ? `Also ${r.aliases.join(", ")}` : undefined}
                actions={<Link to={`/referees/${r.id}/edit`} state={state} className="btn"><Icon name="edit" />Edit</Link>} />
            <DuplicateCard kind="referees" id={r.id} onMerge={setMerging} />
            {merging && <MergeReferees keep={r} preselected={merging} onClose={() => setMerging(undefined)} onMerged={() => setMerging(undefined)} />}
            <div className="two-col">
                <div className="stack">
                    {/* WEB-28: their picture and how much you've worked together on a slab, then how to reach them. */}
                    <TogetherFigures name={r.name} together={t} where="together" aside={<RefereeAvatar referee={r} name={r.name} large />} />
                    {(r.email || r.phone) && (
                        <div className="row profile-contact">
                            {r.email && <a className="btn" href={`mailto:${r.email}`}><Icon name="mail" />Email</a>}
                            {r.phone && <a className="btn" href={`tel:${r.phone}`}><Icon name="call" />Call</a>}
                            {r.phone && <a className="btn" href={`sms:${r.phone}`}><Icon name="message" />Text</a>}
                        </div>
                    )}
                    <MatchesWith title="Matches together" name={r.name} matches={(matches.data ?? []).filter((m) => m.crew.some((c) => c.refereeId === r.id))} none="No matches together yet." />
                </div>
                <div className="stack">
                    {(r.phone || r.email || r.tags?.length || r.notes) && (
                        <dl className="facts" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
                            {r.phone && <Fact icon="phone" label="Phone">{r.phone}</Fact>}
                            {r.email && <Fact icon="mail" label="Email">{r.email}</Fact>}
                            {r.tags?.length ? <Fact icon="tag" label="Tags"><span className="row"><Tags tags={r.tags} /></span></Fact> : null}
                            {r.notes && <Fact icon="note" label="Notes"><span className="notes-text">{r.notes}</span></Fact>}
                        </dl>
                    )}
                    <Photos recordType="referee" recordId={r.id} />
                </div>
            </div>
        </>
    );
}

export function RefereeEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { state } = useLocation();
    const editor = useEditor("referees", id, (): Draft<"referees"> => ({ id: newId(), name: "" }));
    const refereeTags = tagsOf(useList("referees").data);
    const together = useWorkedTogether();
    const [merging, setMerging] = useState(false);
    const r = editor.draft;
    if (!r) {
        return <Loading />;
    }
    const set = editor.update;
    return (
        <>
            <PageHead back={editor.isNew ? { to: "/referees", label: "Referees" } : { to: `/referees/${r.id}`, label: `Referee · ${r.name}`, state }} title={editor.isNew ? "Add referee" : "Edit referee"} tab={editor.isNew ? "Add referee" : editor.saved && `Edit ${editor.saved.name}`}
                sub={!editor.isNew && <History name={r.name} together={together.referees.get(r.id)} where="together" />}
                actions={!editor.isNew && editor.saved && <button type="button" className="btn" onClick={() => setMerging(true)}><Icon name="merge" />Merge with…</button>} />
            {merging && editor.saved && (
                <MergeReferees keep={editor.saved} onClose={() => setMerging(false)}
                    onMerged={(kept) => { setMerging(false); editor.reset(kept); }} />
            )}
            <form className="form" onSubmit={(e) => { e.preventDefault(); editor.save((saved) => `/referees/${saved.id}`); }}>
                <section className="card form-section">
                    <div className="fields">
                        <Field label="Name"><TextInput value={r.name} onChange={(name) => set({ name: name ?? "" })} maxLength={100} /></Field>
                        <Field label="Shown as" info="What the officials line on match cards calls them. Left empty, it's their surname as worked out from the name, shown in the box; type your own when that's wrong.">
                            <TextInput value={r.shortName} onChange={(shortName) => set({ shortName })} placeholder={surname(r.name)} maxLength={30} />
                        </Field>
                        <Field label="Email"><TextInput type="email" value={r.email} onChange={(email) => set({ email })} /></Field>
                        <Field label="Phone"><TextInput type="tel" value={r.phone} onChange={(phone) => set({ phone })} maxLength={30} /></Field>
                        <Field label="Tags"><TagInput tags={r.tags} onChange={(tags) => set({ tags })} suggestions={refereeTags} /></Field>
                        <Field label="Other names" info="Other ways their name is written, such as in a league's or assignor's schedule (Doe, John). Imports and searches find them by these too; merging adds the merged referees' names here.">
                            <TagInput names tags={r.aliases} onChange={(aliases) => set({ aliases })} />
                        </Field>
                        <Field label="Notes" wide><TextArea value={r.notes ?? ""} onChange={(value) => set({ notes: value || undefined })} /></Field>
                    </div>
                </section>
                <Photos recordType="referee" recordId={editor.isNew ? undefined : r.id} inForm />
                <FormActions editor={editor} deleteLabel="Delete referee" onCancel={() => navigate(editor.isNew ? "/referees" : `/referees/${r.id}`, { state })} onDelete={() => editor.remove("/referees")} />
            </form>
        </>
    );
}
