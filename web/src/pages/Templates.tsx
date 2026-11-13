import { defaultFormat } from "@lawfive/schema";
import { Link, useNavigate, useParams } from "react-router";
import { type Draft, useList } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { FormatFields } from "../components/FormatFields.tsx";
import { ListTools, useListTools } from "../components/ListTools.tsx";
import { EmptyList, Field, Icon, Loading, NumberInput, PageHead, TextInput } from "../components/ui.tsx";
import { describeFormat, money } from "../format.ts";
import { describeCount, useWorkedTogether } from "../history.ts";
import { searchAndSort } from "../search.ts";
import { useSettings } from "../settings.ts";
import { newId } from "../ids.ts";

// Match templates: a reusable format plus defaults for a new match (A-12). Competitions link to
// one, so picking a competition on a match sets its format.

export function Templates() {
    const templates = useList("match-templates");
    const competitions = useList("competitions");
    const together = useWorkedTogether().templates;
    const tools = useListTools();
    const usedBy = (id: string) => (competitions.data ?? []).filter((c) => c.templateId === id).map((c) => c.name);
    const shown = searchAndSort(templates.data ?? [], tools.query, tools.sort,
        (t) => [t.name, describeFormat(t.format), ...usedBy(t.id)], (t) => t.name, (t) => together.get(t.id)?.played ?? 0);
    return (
        <>
            <PageHead title="Templates" hero sub="Formats you use often. Link one to a competition, or start a match from it." actions={<Link to="/templates/new" className="btn btn-primary"><Icon name="plus" />New template</Link>} />
            <ListTools tools={tools} label="templates" placeholder="Search names, formats, competitions…" />
            <div className="card">
                {templates.isLoading && <Loading />}
                {templates.data?.length === 0 && <EmptyList picture="format" title="No templates yet" text="Save a match format once and reuse it for every game played that way." action={{ to: "/templates/new", label: "Add a template" }} />}
                {templates.data?.length !== 0 && templates.isSuccess && shown.length === 0 && <div className="empty">No templates match “{tools.query}”.</div>}
                {shown.map((t) => (
                    <div key={t.id} className="list-row">
                        <div className="avatar"><Icon name="templates" size={18} /></div>
                        <Link to={`/templates/${t.id}`} className="grow">
                            <div className="title">{t.name}</div>
                            <div className="sub">{[describeFormat(t.format), t.defaults.fee && money(t.defaults.fee.amount, t.defaults.fee.currency)].filter(Boolean).join(" · ")}</div>
                            <div className="sub">{[describeCount(together.get(t.id)), usedBy(t.id).length > 0 && `used by ${usedBy(t.id).join(", ")}`].filter(Boolean).join(" · ")}</div>
                        </Link>
                        <Link to={`/matches/new?template=${t.id}`} className="btn">New match</Link>
                    </div>
                ))}
            </div>
        </>
    );
}

export function TemplateEdit() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { settings } = useSettings();
    const editor = useEditor("match-templates", id, (): Draft<"match-templates"> => ({ id: newId(), name: "", format: defaultFormat, defaults: {} }));
    const t = editor.draft;
    if (!t) {
        return <Loading />;
    }
    const set = editor.update;
    const setDefaults = (patch: Partial<typeof t.defaults>) => set({ defaults: { ...t.defaults, ...patch } });
    return (
        <>
            <PageHead back={{ to: "/templates", label: "Templates" }} title={editor.isNew ? "New template" : t.name} tab={editor.isNew ? "New template" : editor.saved?.name} />
            <form className="form" onSubmit={(e) => { e.preventDefault(); editor.save(() => "/templates"); }}>
                <section className="card form-section">
                    <div className="fields">
                        <Field label="Name"><TextInput value={t.name} onChange={(name) => set({ name: name ?? "" })} placeholder="U12 league: 2×30" maxLength={60} /></Field>
                    </div>
                </section>
                <section className="card form-section">
                    <h2>Format</h2>
                    <FormatFields format={t.format} onChange={(format) => set({ format })} />
                </section>
                <section className="card form-section">
                    <h2>Fee</h2>
                    <p className="muted" style={{ marginTop: -6 }}>Filled in when a match uses this template (directly or through its competition) and doesn't have a fee yet.</p>
                    <div className="fields">
                        <Field label="Fee"><NumberInput value={t.defaults.fee?.amount} min={0} step={0.01} onChange={(amount) => setDefaults({ fee: amount === undefined ? undefined : { currency: settings.currency, paid: false, ...t.defaults.fee, amount } })} /></Field>
                    </div>
                </section>
                <FormActions editor={editor} deleteLabel="Delete template" onCancel={() => navigate("/templates")} onDelete={() => editor.remove("/templates")} />
            </form>
        </>
    );
}
