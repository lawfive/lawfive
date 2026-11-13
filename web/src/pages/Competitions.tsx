import { Link, useNavigate, useParams } from "react-router";
import { type Competition, type Draft, useList } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { ListTools, useListTools } from "../components/ListTools.tsx";
import { Picker } from "../components/Picker.tsx";
import { EmptyList, Field, Icon, Loading, PageHead, Select, TextInput, TextArea } from "../components/ui.tsx";
import { describeFormat } from "../format.ts";
import { describeCount, useWorkedTogether } from "../history.ts";
import { searchAndSort } from "../search.ts";
import { newId } from "../ids.ts";

// Competitions: one per competition per season (A-6), with an optional misconduct scheme (A-8).

const types: [Competition["type"], string][] = [["league", "League"], ["tournament", "Tournament"], ["cup", "Cup"], ["friendly", "Friendly"]];
const schemes: [string, string][] = [["ifab", "Laws of the Game"], ["ussf", "United States"], ["fa", "England"]];

export function Competitions() {
    const competitions = useList("competitions");
    const templates = useList("match-templates");
    const together = useWorkedTogether().competitions;
    const tools = useListTools();
    const templateName = (id?: string) => templates.data?.find((t) => t.id === id)?.name;
    const typeName = (c: Competition) => types.find(([t]) => t === c.type)?.[1];
    const shown = searchAndSort(competitions.data ?? [], tools.query, tools.sort,
        (c) => [c.name, c.organiser, typeName(c), c.season, c.ageGroup, c.level, templateName(c.templateId), c.notes], (c) => c.name, (c) => together.get(c.id)?.played ?? 0);
    return (
        <>
            <PageHead title="Competitions" hero sub="Leagues, cups and tournaments, one per season." actions={<Link to="/competitions/new" className="btn btn-primary"><Icon name="plus" />New competition</Link>} />
            <ListTools tools={tools} label="competitions" placeholder="Search names, organizers, seasons, age groups…" />
            <div className="card">
                {competitions.isLoading && <Loading />}
                {competitions.data?.length === 0 && <EmptyList picture="bracket" title="No competitions yet" text="Keep each league or cup together, and let it set the format of its matches." action={{ to: "/competitions/new", label: "Add a competition" }} />}
                {competitions.data?.length !== 0 && competitions.isSuccess && shown.length === 0 && <div className="empty">No competitions match “{tools.query}”.</div>}
                {shown.map((c) => (
                    <Link key={c.id} to={`/competitions/${c.id}`} className="list-row">
                        <div className="avatar"><Icon name="competitions" size={18} /></div>
                        <div className="grow">
                            <div className="title">{c.name}</div>
                            <div className="sub">{[typeName(c), c.season, c.ageGroup, c.level, templateName(c.templateId)].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="list-meta">
                            <span className="muted list-count">{describeCount(together.get(c.id))}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </>
    );
}

export function CompetitionEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const templates = useList("match-templates");
    const editor = useEditor("competitions", id, (): Draft<"competitions"> => ({ id: newId(), name: "", type: "league" }));
    const c = editor.draft;
    if (!c) {
        return <Loading />;
    }
    const set = editor.update;
    return (
        <>
            <PageHead back={{ to: "/competitions", label: "Competitions" }} title={editor.isNew ? "New competition" : c.name} tab={editor.isNew ? "New competition" : editor.saved?.name} />
            <form className="form" onSubmit={(e) => { e.preventDefault(); editor.save(() => "/competitions"); }}>
                <section className="card form-section">
                    <div className="fields">
                        <Field label="Name"><TextInput value={c.name} onChange={(name) => set({ name: name ?? "" })} maxLength={100} /></Field>
                        <Field label="Type"><Select value={c.type} onChange={(type) => set({ type: type ?? "league" })} options={types} /></Field>
                        <Field label="Organizer"><TextInput value={c.organiser} onChange={(organiser) => set({ organiser })} /></Field>
                        <Field label="Season" info="Each season is its own competition, because teams and divisions change from year to year."><TextInput value={c.season} onChange={(season) => set({ season })} placeholder="2026-27" /></Field>
                        <Field label="Starts"><input className="input" type="date" value={c.startDate ?? ""} onChange={(e) => set({ startDate: e.target.value || undefined })} /></Field>
                        <Field label="Ends"><input className="input" type="date" value={c.endDate ?? ""} onChange={(e) => set({ endDate: e.target.value || undefined })} /></Field>
                        <Field label="Age group"><TextInput value={c.ageGroup} onChange={(ageGroup) => set({ ageGroup })} placeholder="U12" /></Field>
                        <Field label="Level"><TextInput value={c.level} onChange={(level) => set({ level })} placeholder="Gold, Division 1…" /></Field>
                        <Field label="Match template" info="The format for this competition's matches. Picking the competition on a match sets this format, and the template's fee if the match has none.">
                            <Picker label="Match template" value={c.templateId} onChange={(templateId) => set({ templateId })}
                                items={(templates.data ?? []).map((t) => ({ id: t.id, name: t.name, detail: describeFormat(t.format) }))} />
                        </Field>
                        <Field label="Misconduct codes" info="The codes for cautions and send-offs in your match reports (UB, DT, SFP… or C1–C7, S1–S7 in England). Leave it on your default unless this competition uses a different set."><Select value={c.misconductScheme} empty="Your default" onChange={(misconductScheme) => set({ misconductScheme })} options={schemes} /></Field>
                        <Field label="Notes" wide><TextArea value={c.notes ?? ""} onChange={(value) => set({ notes: value || undefined })} /></Field>
                    </div>
                </section>
                <FormActions editor={editor} deleteLabel="Delete competition" onCancel={() => navigate("/competitions")} onDelete={() => editor.remove("/competitions")} />
            </form>
        </>
    );
}
