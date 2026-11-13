import { starterFormats } from "@lawfive/schema";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { type Draft, type Gender, type Match, type Role, type Team, useList, useLookup, useTrack } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { FormatFields } from "../components/FormatFields.tsx";
import { Picker } from "../components/Picker.tsx";
import { QuickCreate, type QuickKind } from "../components/QuickCreate.tsx";
import { ColourMenu, Field, InfoTip, KitPanels, Loading, NumberInput, PageHead, Select, SuggestInput, TagInput, TextInput, Toggle, TextArea, lessMotion } from "../components/ui.tsx";
import { deleteMatchMessage, describeFormat, genderNames, matchTabTitle, matchTitle, nameOrKickoffNeeded, needsNameOrKickoff, roleNamesInFull, roleOrder, suggestAliases } from "../format.ts";
import { formatChoiceOf, newMatchStart, suggestedStarter, usualChanged, usualFormatChoice, usualFormatFrom } from "../newMatch.ts";
import { saveSettings, useSettings } from "../settings.ts";
import { matchListLink } from "./Matches.tsx";
import { newId } from "../ids.ts";

// Creating or editing a match. A new one starts with the usual role and format (SET-17): the format
// from a template passed as ?template=<id>, else the usual format, else 2×45. Format sits beside the
// kickoff, offering the usual format, the starter formats and the templates, and a typed age group
// suggests its starter. Picking a competition sets the format from the competition's template; either
// way the template's fee fills the match's when it has none. Saving a new match makes its format the
// usual one. Venues, competitions and referees can be created from their pickers without leaving the form.

const roleOptions = Object.entries(roleNamesInFull) as [Role, string][];

/** A record being created from a picker, and what to do with its id once it exists. */
interface Creating {
    kind: QuickKind;
    name: string;
    then: (id: string) => void;
}

export function MatchEdit() {
    const { id } = useParams();
    const templates = useList("match-templates");
    const settings = useList("settings");
    // A new match starts from the settings and templates, so it waits for them (not long: they're usually cached).
    if (id === undefined && (!templates.isFetched || !settings.isFetched)) {
        return <Loading />;
    }
    return <MatchForm id={id} />;
}

function MatchForm({ id }: { id: string | undefined }) {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const client = useQueryClient();
    const templates = useList("match-templates");
    const venues = useList("venues");
    const competitions = useList("competitions");
    const referees = useList("referees");
    // Tags and assignors already on other matches, offered while adding one (WEB-12, SET-15).
    const allMatches = useList("matches").data ?? [];
    const matchTags = [...new Set(allMatches.flatMap((x) => x.tags ?? []))].sort();
    const assignors = [...new Set(allMatches.flatMap((x) => (x.assignor ? [x.assignor] : [])))].sort((a, b) => a.localeCompare(b));
    const venueById = useLookup("venues");
    // RES-8: deleting the match takes its report and track, so Delete match? says so.
    const report = useList("match-records").data?.find((r) => id !== undefined && r.matchId === id);
    const track = useTrack(report?.id);
    const [creating, setCreating] = useState<Creating>();
    const { settings } = useSettings();
    // WEB-30: Save was pressed with nothing to tell the match by.
    const [blankTried, setBlankTried] = useState(false);
    const teamsRef = useRef<HTMLElement>(null);

    const editor = useEditor("matches", id, (): Draft<"matches"> => {
        // SET-17: the usual role, and the asked-for template's format, else the usual format, else 2×45.
        const template = templates.data?.find((x) => x.id === params.get("template"));
        const start = newMatchStart(settings, template);
        return {
            id: newId(), status: "scheduled", role: start.role, format: start.format, home: {}, away: {}, crew: [],
            ...(template ? { templateId: template.id, fee: template.defaults.fee } : {}),
        };
    });

    const m = editor.draft;
    if (!m) {
        return <Loading />;
    }
    const set = editor.update;
    const blank = needsNameOrKickoff(m, editor.saved);
    const setTeam = (side: "home" | "away", change: Partial<Team>) => set({ [side]: clean({ ...m[side], ...change }) } as Partial<Match>);
    // SET-5: the short names made from both team names, shown until one is typed; only a typed one is
    // saved, so the rest follow the names wherever they change later (an import, a calendar, the API).
    const suggested = suggestAliases(m.home.name, m.away.name);
    const setAlias = (side: "home" | "away", alias: string | undefined) => setTeam(side, { alias: alias?.toUpperCase() });
    /** The template's format, and its fee where the match has none. */
    const fromTemplate = (templateId: string | undefined): Partial<Match> => {
        const t = templates.data?.find((x) => x.id === templateId);
        return t ? { format: t.format, templateId: t.id, fee: m.fee ?? t.defaults.fee } : {};
    };
    const applyTemplate = (templateId: string | undefined) => set(fromTemplate(templateId));
    const pitches = m.venueId ? venueById.get(m.venueId)?.pitches ?? [] : [];
    const create = (kind: QuickKind, then: (id: string) => void) => (name: string) => setCreating({ kind, name, then });
    /** A competition sets the format from its template, and its age group if the match has none. */
    const pickCompetition = (competitionId: string | undefined) => {
        const c = competitions.data?.find((x) => x.id === competitionId);
        set({ competitionId, ageGroup: m.ageGroup ?? c?.ageGroup, ...fromTemplate(c?.templateId) });
    };
    const template = templates.data?.find((t) => t.id === m.templateId);
    const templateCompetition = competitions.data?.find((c) => c.id === m.competitionId && c.templateId === m.templateId);
    // SET-17: which of the choices the format is, and the starter a typed age group suggests.
    const formatChoice = formatChoiceOf(m.format, { templateId: m.templateId, usual: settings.usualFormat, templates: templates.data ?? [] });
    const suggestion = suggestedStarter(m.ageGroup, m.format);
    const usualChoice = settings.usualFormat && usualFormatChoice(settings.usualFormat, templates.data ?? []);
    const formatItems = [
        // The usual format by its own name when it's a starter's or a template's, which are in the list anyway.
        ...(usualChoice?.id === "last" ? [{ id: "last", name: "Your usual", detail: describeFormat(settings.usualFormat!.format) }] : []),
        ...starterFormats.map((x) => ({ id: `starter:${x.id}`, name: x.name, detail: describeFormat(x.format) })),
        ...(templates.data ?? []).map((t) => ({ id: `template:${t.id}`, name: t.name, detail: `Your template · ${describeFormat(t.format)}` })),
    ];
    const pickFormat = (choiceId: string | undefined) => {
        const starter = starterFormats.find((x) => `starter:${x.id}` === choiceId);
        if (starter) {
            set({ format: starter.format, templateId: undefined });
        } else if (choiceId === "last" && settings.usualFormat) {
            set({ format: settings.usualFormat.format, templateId: undefined });
        } else if (choiceId?.startsWith("template:")) {
            applyTemplate(choiceId.slice("template:".length));
        }
    };
    const setCrew = (i: number, patch: Partial<Match["crew"][number]>) => set({ crew: m.crew.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

    return (
        <>
            <PageHead
                back={editor.isNew ? { to: matchListLink(), label: "Matches" } : { to: `/matches/${m.id}`, label: `Match · ${m.name ?? matchTitle(m as Match)}` }}
                title={editor.isNew ? "New match" : "Edit match"}
                tab={editor.saved && `Edit ${matchTabTitle(editor.saved)}`}
            />
            <form className="form" onSubmit={(e) => { e.preventDefault(); if (blank) { setBlankTried(true); teamsRef.current?.scrollIntoView({ block: "start", behavior: lessMotion() ? "auto" : "smooth" }); return; } editor.save((saved) => {
                // SET-17: a new match saved from the form makes its format the usual one (once it's saved).
                const usual = usualFormatFrom(saved.format, formatChoiceOf(saved.format, { templateId: saved.templateId, usual: settings.usualFormat, templates: templates.data ?? [] }));
                if (editor.isNew && usualChanged(settings.usualFormat, usual)) {
                    void saveSettings(client, { usualFormat: usual });
                }
                return `/matches/${saved.id}`;
            }, (d) => ({
                ...d,
                // SET-5: only a typed short name is saved; one left empty follows the names, as the placeholder shows.
                home: clean({ ...d.home, alias: d.home.alias?.trim() || undefined }),
                away: clean({ ...d.away, alias: d.away.alias?.trim() || undefined }),
                crew: d.crew.filter((c) => c.refereeId || c.name),
                assignor: d.assignor?.trim() || undefined,
            })); }}>
                <section className="card form-section" ref={teamsRef}>
                    <h2>Teams</h2>
                    {blank && blankTried && <p className="error form-problem" role="alert">{nameOrKickoffNeeded}</p>}
                    {/* Placed on a grid; the order here is the Tab order: a team's name, short name and color, home then away. */}
                    <div className="teams-grid">
                        <span className="teams-head head-name" style={{ gridColumn: 2, gridRow: 1 }}>Team name</span>
                        <span className="teams-head head-alias" style={{ gridColumn: 3, gridRow: 1 }}>
                            {/* "Alias" where the column is too narrow for "Short name" (phones). */}
                            <span className="head-long">Short name</span><span className="head-short">Alias</span>
                            <InfoTip label="Short name">Up to 4 letters, shown on the watch on the team's color. Left empty, it's made from the team names and follows them when they change; when both would start the same (L84_Roach, L84_Smith), it skips the shared part (ROA, SMI). One you type stays.</InfoTip>
                        </span>
                        <span className="teams-head head-colour" style={{ gridColumn: 4, gridRow: 1 }}>
                            Color
                            <InfoTip label="Color">The team's main shirt color. The watch shows the short name on it, in black or white, whichever is easier to read.</InfoTip>
                        </span>
                        <span className="teams-side side-home" style={{ gridColumn: 1, gridRow: 2 }}>Home</span>
                        <span className="teams-side side-away" style={{ gridColumn: 1, gridRow: 3 }}>Away</span>
                        {(["home", "away"] as const).map((side, i) => (
                            <Fragment key={side}>
                                <div className={`cell-name-${side}`} style={{ gridColumn: 2, gridRow: i + 2 }}>
                                    <input className="input" aria-label={`${side === "home" ? "Home" : "Away"} team name`} value={m[side].name ?? ""} maxLength={60}
                                        placeholder={side === "home" ? "Home team" : "Away team"} onChange={(e) => setTeam(side, { name: e.target.value || undefined })} />
                                </div>
                                <div className={`cell-alias-${side}`} style={{ gridColumn: 3, gridRow: i + 2 }}>
                                    <input className="input alias-input" aria-label={`${side === "home" ? "Home" : "Away"} short name`} value={m[side].alias ?? ""} maxLength={4}
                                        placeholder={suggested[side] ?? (side === "home" ? "HOM" : "AWY")} onChange={(e) => setAlias(side, e.target.value || undefined)} />
                                </div>
                                <div className={`cell-colour-${side}`} style={{ gridColumn: 4, gridRow: i + 2 }}>
                                    <ColourMenu teams={m} side={side} label={`${side === "home" ? "Home" : "Away"} color`} onChange={(colour) => setTeam(side, { colour })} />
                                </div>
                            </Fragment>
                        ))}
                    </div>
                    {/* WEB-24: the two kits as they'll show on the match's boards, following the names and colors. */}
                    <div className="board kits-preview" aria-hidden><KitPanels home={m.home} away={m.away} size="small" /></div>
                    <div className="fields" style={{ marginTop: 18, maxWidth: 720 }}>
                        <Field label="Gender">
                            <Select value={m.gender} empty="Not set" onChange={(gender) => set({ gender })} options={Object.entries(genderNames) as [Gender, string][]} />
                        </Field>
                        <Field label="Age group" info="As the league writes it: U12, U19, Adult, O35. Filled in from the competition when it has one.">
                            <TextInput value={m.ageGroup} onChange={(ageGroup) => set({ ageGroup })} placeholder="U12, Adult, O35" maxLength={30} />
                        </Field>
                    </div>
                </section>

                <section className="card form-section">
                    <h2>When and where</h2>
                    <div className="fields">
                        <Field label="Kickoff">
                            <input className="input" type="datetime-local" value={m.kickoff ? toLocalInput(m.kickoff) : ""}
                                onChange={(e) => set({ kickoff: e.target.value ? new Date(e.target.value).toISOString() : undefined, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })} />
                        </Field>
                        {/* SET-17: beside the kickoff, the format's choices; the details are under Format below. Its line
                            always takes its place, so the age group's suggestion doesn't move the form. */}
                        <Field label="Format" info="Your usual format, LawFive's starter formats for US youth and adult games, or one of your templates. Change the details under Format, further down.">
                            <Picker label="Format" value={formatChoice.id === "none" ? undefined : formatChoice.id} items={formatItems} clearable={false}
                                placeholder="Your own" onChange={pickFormat} />
                            <small className="format-line">
                                {suggestion
                                    ? <>For {m.ageGroup?.trim()}: {suggestion.name} <button type="button" className="link-button" onClick={() => pickFormat(`starter:${suggestion.id}`)}>Use it</button></>
                                    : describeFormat(m.format)}
                            </small>
                        </Field>
                        <Field label="Status">
                            <Select value={m.status} onChange={(status) => set({ status: status ?? "scheduled" })}
                                options={[["scheduled", "Scheduled"], ["played", "Played"], ["postponed", "Postponed"], ["cancelled", "Canceled"], ["abandoned", "Abandoned"]]} />
                        </Field>
                        <Field label="Venue">
                            <Picker label="Venue" value={m.venueId} onChange={(venueId) => set({ venueId, pitchId: undefined })}
                                items={(venues.data ?? []).map((v) => ({ id: v.id, name: v.name, detail: v.address, also: v.aliases }))}
                                createLabel="New venue" onCreate={create("venues", (venueId) => set({ venueId, pitchId: undefined }))} />
                        </Field>
                        <Field label="Pitch">
                            <Select value={m.pitchId} empty={pitches.length ? "Any" : "—"} onChange={(pitchId) => set({ pitchId })} options={pitches.map((p) => [p.id, p.name])} />
                        </Field>
                        <Field label="Competition">
                            <Picker label="Competition" value={m.competitionId} onChange={pickCompetition}
                                items={(competitions.data ?? []).map((c) => ({ id: c.id, name: c.name, detail: [c.season, c.level].filter(Boolean).join(" · ") }))}
                                createLabel="New competition" onCreate={create("competitions", pickCompetition)} />
                        </Field>
                    </div>
                </section>

                {/* WEB-21: what the match is called and filed under. */}
                <section className="card form-section">
                    <h2>Details</h2>
                    <div className="fields">
                        <Field label="Match name" info="Optional, for matches with a name of their own: a cup final, a showcase game.">
                            <TextInput value={m.name} onChange={(name) => set({ name })} placeholder="Cup semi-final" maxLength={100} />
                        </Field>
                        <Field label="Match number" info="The match's number in the assignor's system or the league's schedule. Importing a file with the same number updates this match instead of adding a copy.">
                            <TextInput value={m.external?.id} onChange={(extId) => set({ external: extId ? { source: m.external?.source ?? "manual", id: extId } : undefined })} />
                        </Field>
                        <Field label="Assignor" info="Who assigned you the match: a person, or the assigning group. Filled in when the match comes from an import or an integration.">
                            <SuggestInput value={m.assignor} onChange={(assignor) => set({ assignor })} suggestions={assignors} label="Assignors you've had" maxLength={100} />
                        </Field>
                        <Field label="Tags" info="Your own labels, such as “indoor” or “needs AR”. Filter the match list by them.">
                            <TagInput tags={m.tags} onChange={(tags) => set({ tags })} suggestions={matchTags} />
                        </Field>
                    </div>
                </section>

                <section className="card form-section">
                    <h2>Officials</h2>
                    <div className="fields" style={{ marginBottom: 14 }}>
                        <Field label="Your role" info="New matches start with your usual role, from Settings → New matches."><Select value={m.role} empty="Not set" onChange={(role) => set({ role })} options={roleOptions} /></Field>
                    </div>
                    <div className="list-editor">
                        {m.crew.map((c, i) => (
                            <div className="item crew" key={i}>
                                <Field label="Role"><Select value={c.role} onChange={(role) => setCrew(i, { role: role ?? "ar1" })} options={roleOptions} /></Field>
                                <Field label="Official" info="Pick someone you've saved, add them as a new referee, or just type a name for this match (a club linesman, say).">
                                    {c.refereeId || !c.name ? (
                                        <Picker label="Official" value={c.refereeId} onChange={(refereeId) => setCrew(i, { refereeId, name: undefined })}
                                            items={(referees.data ?? []).map((r) => ({ id: r.id, name: r.name, detail: r.email, also: r.aliases }))}
                                            createLabel="New referee" onCreate={create("referees", (refereeId) => setCrew(i, { refereeId, name: undefined }))}
                                            textLabel="Just this match:" onUseText={(name) => setCrew(i, { name, refereeId: undefined })} />
                                    ) : (
                                        <div className="row">
                                            <div className="grow"><TextInput value={c.name} onChange={(name) => setCrew(i, { name })} /></div>
                                            <button type="button" className="btn btn-ghost" onClick={() => setCrew(i, { name: undefined })}>Pick saved</button>
                                        </div>
                                    )}
                                </Field>
                                <button type="button" className="btn btn-ghost" onClick={() => set({ crew: m.crew.filter((_, j) => j !== i) })}>Remove</button>
                            </div>
                        ))}
                        <div><button type="button" className="btn" onClick={() => {
                            // The first role nobody has yet, the user included, as the phones do.
                            const taken = [...m.crew.map((c) => c.role), ...(m.role ? [m.role] : [])];
                            set({ crew: [...m.crew, { role: roleOrder.find((r) => !taken.includes(r)) ?? "ar1" }] });
                        }}>Add an official</button></div>
                    </div>
                </section>

                <section className="card form-section">
                    <h2 style={{ marginBottom: 4 }}>Format</h2>
                    <p className="muted form-section-note">
                        {template && formatChoice.template ? <>From {templateCompetition ? <>{templateCompetition.name} ({template.name})</> : <>the template {template.name}</>}. Changes here apply to this match only.</>
                            : formatChoice.id === "none" ? "Your own, for this match."
                            : <>{formatChoice.name}. Changes here apply to this match only.</>}
                    </p>
                    <FormatFields format={m.format} onChange={(format) => set({ format })} />
                </section>

                <section className="card form-section">
                    <h2>Fee and notes</h2>
                    <div className="fields">
                        <Field label="Fee">
                            <div className="row">
                                <div style={{ width: 110 }}><NumberInput value={m.fee?.amount} min={0} step={0.01} onChange={(amount) => set({ fee: amount === undefined ? undefined : { currency: settings.currency, paid: false, ...m.fee, amount } })} /></div>
                                <div style={{ width: 84 }}><TextInput value={m.fee?.currency ?? settings.currency} maxLength={3} onChange={(currency) => m.fee && set({ fee: { ...m.fee, currency: (currency ?? settings.currency).toUpperCase() } })} /></div>
                                {m.fee && <Toggle label="Paid" checked={m.fee.paid} onChange={(paid) => m.fee && set({ fee: { ...m.fee, paid } })} />}
                            </div>
                        </Field>
                        <Field label="What to expect" wide info="How competitive it'll be, the teams' strengths, history between them.">
                            <TextArea value={m.outlook ?? ""} placeholder="Top of the table meets second." onChange={(value) => set({ outlook: value || undefined })} />
                        </Field>
                        <Field label="Notes" wide><TextArea value={m.notes ?? ""} onChange={(value) => set({ notes: value || undefined })} /></Field>
                    </div>
                </section>

                <FormActions editor={editor} deleteLabel="Delete match" deleteMessage={deleteMatchMessage(!!report, track.data === undefined ? undefined : !!track.data)}
                    onCancel={() => navigate(editor.isNew ? "/matches" : `/matches/${m.id}`)}
                    onDelete={() => editor.remove("/matches")} />
            </form>
            {creating && (
                <QuickCreate kind={creating.kind} name={creating.name} onClose={() => setCreating(undefined)}
                    onCreated={(newId) => { creating.then(newId); setCreating(undefined); }} />
            )}
        </>
    );
}

/** Leaves out empty fields, so a team with nothing set is {}. */
function clean<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== "")) as T;
}

function toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
