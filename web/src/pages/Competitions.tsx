import { Link, useLocation, useNavigate, useParams } from "react-router";
import { type Competition, type Draft, useList } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { Files } from "../components/Files.tsx";
import { ListTools, useListTools } from "../components/ListTools.tsx";
import { Picker } from "../components/Picker.tsx";
import { EmptyList, Fact, Field, Icon, Loading, PageHead, Select, TextInput, TextArea, useBackTo } from "../components/ui.tsx";
import { describeFormat } from "../format.ts";
import { describeCount, useWorkedTogether } from "../history.ts";
import { searchAndSort } from "../search.ts";
import { newId } from "../ids.ts";
import { MatchesWith } from "./Matches.tsx";
import { NotThere } from "./Venues.tsx";

// Competitions: one per competition per season (the data model in ARCHITECTURE.md), with an optional misconduct
// scheme for the cards' reasons (EVT-14). Each has its page (WEB-34): its details, its matches and its
// files (FILE-6), which its matches show too; Edit opens the form.

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

/** "Nov 14 – 15, 2026": when it runs, from its first and last days (dates without a time zone). */
function describeDates(start?: string, end?: string): string | undefined {
    const day = (d: string) => new Date(`${d}T12:00:00`);
    const format = (d: string, options: Intl.DateTimeFormatOptions) => day(d).toLocaleDateString(undefined, options);
    if (start && end) {
        return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).formatRange(day(start), day(end));
    }
    const one = start ?? end;
    return one && `${start ? "From" : "Until"} ${format(one, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** WEB-34: a competition's page: what it is, its matches, and its files. */
export function CompetitionPage() {
    const { id } = useParams();
    const competitions = useList("competitions");
    const matches = useList("matches");
    const templates = useList("match-templates");
    const back = useBackTo({ to: "/competitions", label: "Competitions" });
    const { state } = useLocation();
    const c = competitions.data?.find((x) => x.id === id);
    if (!c) {
        return competitions.isLoading ? <Loading /> : <NotThere what="competition" back={{ to: "/competitions", label: "Competitions" }} />;
    }
    const template = templates.data?.find((t) => t.id === c.templateId);
    const dates = describeDates(c.startDate, c.endDate);
    const scheme = schemes.find(([s]) => s === c.misconductScheme)?.[1];
    return (
        <>
            <PageHead back={back} title={c.name}
                sub={[types.find(([t]) => t === c.type)?.[1], c.season, c.ageGroup, c.level, c.organiser].filter(Boolean).join(" · ")}
                actions={<Link to={`/competitions/${c.id}/edit`} state={state} className="btn"><Icon name="edit" />Edit</Link>} />
            <div className="two-col">
                <div className="stack">
                    <MatchesWith title="Matches" name={c.name} matches={(matches.data ?? []).filter((m) => m.competitionId === c.id)} none="No matches in this competition yet." />
                </div>
                <div className="stack">
                    {(dates || template || scheme || c.notes) && (
                        <dl className="facts" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
                            {dates && <Fact icon="calendar" label="Dates">{dates}</Fact>}
                            {template && <Fact icon="templates" label="Match template">{template.name} <span className="muted">· {describeFormat(template.format)}</span></Fact>}
                            {scheme && <Fact icon="report" label="Misconduct codes">{scheme}</Fact>}
                            {c.notes && <Fact icon="note" label="Notes"><span className="notes-text">{c.notes}</span></Fact>}
                        </dl>
                    )}
                    <Files recordType="competition" recordId={c.id} />
                </div>
            </div>
        </>
    );
}

export function CompetitionEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const templates = useList("match-templates");
    const { state } = useLocation();
    const editor = useEditor("competitions", id, (): Draft<"competitions"> => ({ id: newId(), name: "", type: "league" }));
    const c = editor.draft;
    if (!c) {
        return <Loading />;
    }
    const set = editor.update;
    // WEB-34: editing comes from the competition's page and goes back to it.
    const page = { to: `/competitions/${c.id}`, label: `Competition · ${editor.saved?.name ?? c.name}`, state };
    return (
        <>
            <PageHead back={editor.isNew ? { to: "/competitions", label: "Competitions" } : page} title={editor.isNew ? "New competition" : "Edit competition"} tab={editor.isNew ? "New competition" : editor.saved && `Edit ${editor.saved.name}`} />
            <form className="form" onSubmit={(e) => { e.preventDefault(); editor.save((saved) => `/competitions/${saved.id}`); }}>
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
                <FormActions editor={editor} deleteLabel="Delete competition" onCancel={() => navigate(editor.isNew ? "/competitions" : `/competitions/${c.id}`, { state })} onDelete={() => editor.remove("/competitions")} />
            </form>
        </>
    );
}
