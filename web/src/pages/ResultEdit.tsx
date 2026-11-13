import { type Event, minuteText, misconductSchemes, penaltiesOf, periodSecOf, periodsFromFormat, scoreOf, settleCautions, withEvents } from "@lawfive/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { type Draft, type Match, type MatchEvent, request, useList, useLookup, useRecord } from "../api.ts";
import { FormActions, useEditor } from "../components/editor.tsx";
import { Icon, KitPanels, Loading, PageHead, Select, SinBinCard, TeamBadge } from "../components/ui.tsx";
import { asPlayed, matchTabTitle, matchTitle, minutes, periodName, teamName } from "../format.ts";
import { useSettings } from "../settings.ts";
import { newId } from "../ids.ts";

// Correcting a played match's result (RES-1), or entering one for a match refereed without the
// watch (RES-2): its goals, cards and shoot-out, with misconduct codes from the match's scheme. The
// score is worked out from the goals, and a second caution to the same player becomes a send-off
// (RES-6), by the rules every app shares (schema/src/result.ts); a second sin bin the same way (EVT-12).
// Stoppages, suspensions and the watch's other events are kept as they are. The server keeps the watch's
// own recording (RES-3).

type Side = "home" | "away";
/** EVT-12: a sin bin, with its length; a second for the same player is settled as a send-off. */
type Kind = "goal" | "caution" | "sendOff" | "sinBin";
type Who = "player" | "headCoach" | "assistantCoach" | "other";
type GoalType = "goal" | "directFreeKick" | "penalty" | "ownGoal";

/** One goal or card as the form edits it: where it happened as a choice, and the minute as typed. */
interface Row {
    key: number;
    kind: Kind;
    /** "before", "play:2", "break:1" or "after". */
    when: string;
    minute: string;
    team: Side;
    who: Who;
    number: string;
    goalType: GoalType;
    code: string;
    /** EVT-12: a sin bin's length in minutes, as typed. */
    lengthMin: string;
    /** What the row came from, so fields the form doesn't show (a time of day, an official's name) stay. */
    from?: MatchEvent;
    /** Where and at what minute it started, so a minute left alone keeps the watch's exact second. */
    fromWhen?: string;
    fromMinute?: string;
}

interface Kick {
    key: number;
    team: Side;
    scored: boolean;
    number: string;
}

const goalTypes: [GoalType, string][] = [["goal", "Goal"], ["directFreeKick", "Direct free kick"], ["penalty", "Penalty"], ["ownGoal", "Own goal"]];
const whoNames: [Who, string][] = [["player", "Player"], ["headCoach", "Head coach"], ["assistantCoach", "Assistant coach"], ["other", "Team official"]];
/** The goals and cards the form edits; everything else is kept as it is. */
const edited = ["goal", "caution", "secondCaution", "sendOff", "sinBin", "secondSinBin"];
const reasons = [["weather", "Weather"], ["lightning", "Lightning"], ["crowdTrouble", "Crowd trouble"], ["notEnoughPlayers", "Not enough players"], ["other", "Other"]] as const;
type Reason = (typeof reasons)[number][0];

let nextKey = 1;

/** EVT-12: a new sin bin's length, the match's format's. */
const sinBinSecOf = (match: Match) => match.format.sinBinSec ?? 600;

function rowOf(match: Match, e: MatchEvent): Row | undefined {
    if (e.type !== "goal" && e.type !== "caution" && e.type !== "secondCaution" && e.type !== "sendOff" && e.type !== "sinBin" && e.type !== "secondSinBin") {
        return undefined;
    }
    const when = e.when === "play" ? `play:${e.period ?? 1}` : e.when === "break" ? `break:${e.period ?? 1}` : e.when === "beforeKickoff" ? "before" : "after";
    const card = e.type !== "goal" ? e : undefined;
    const minute = e.when === "play" && e.period && e.periodSec !== undefined ? minuteText(match.format, e.period, e.periodSec).replace("'", "") : "";
    return {
        key: nextKey++,
        kind: e.type === "goal" ? "goal" : e.type === "sendOff" ? "sendOff" : e.type === "sinBin" || e.type === "secondSinBin" ? "sinBin" : "caution",
        when,
        minute,
        team: e.team,
        who: card?.offender.kind === "teamOfficial" ? card.offender.role : "player",
        number: String((e.type === "goal" ? e.player : card?.offender.kind === "player" ? card.offender.number : undefined) ?? ""),
        goalType: e.type === "goal" ? e.goalType ?? "goal" : "goal",
        code: card?.misconduct?.code ?? "",
        lengthMin: minutes(e.type === "sinBin" || e.type === "secondSinBin" ? e.lengthSec : sinBinSecOf(match)),
        from: e,
        fromWhen: when,
        fromMinute: minute,
    };
}

/** The event a row stands for, or why it can't be one yet. */
function eventOf(match: Match, row: Row, scheme: string): MatchEvent | string {
    const number = row.number.trim() === "" ? undefined : Number(row.number);
    if (number !== undefined && !(Number.isInteger(number) && number >= 1 && number <= 99)) {
        return "A player's number is 1 to 99.";
    }
    const [place, p] = row.when.split(":");
    const period = p ? Number(p) : undefined;
    let timing: { when: Event["when"]; period?: number; periodSec?: number };
    if (place === "play") {
        const typed = row.minute.trim();
        // A minute left as it was keeps the watch's exact second (22:41, not 22:00).
        const unchanged = row.from && "periodSec" in row.from && row.when === row.fromWhen && typed === row.fromMinute;
        const periodSec = typed === "" ? undefined : unchanged ? row.from!.periodSec : periodSecOf(match.format, period!, typed);
        if (typed !== "" && periodSec === undefined) {
            return `${typed}' isn't in the ${periodName(match.format, period!).toLowerCase()}.`;
        }
        timing = { when: "play", period, ...(periodSec !== undefined ? { periodSec } : {}) };
    } else {
        timing = place === "break" ? { when: "break", period } : { when: place === "before" ? "beforeKickoff" : "afterFullTime" };
    }
    const at = row.from && "at" in row.from && row.from.at ? { at: row.from.at } : {};
    if (row.kind === "goal") {
        if (timing.when !== "play") {
            return "A goal is scored during play.";
        }
        return { type: "goal", ...timing, ...at, team: row.team, ...(number ? { player: number } : {}), ...(row.goalType !== "goal" ? { goalType: row.goalType } : {}) } as MatchEvent;
    }
    if (row.kind === "sinBin") {
        // EVT-12: a player's, in whole minutes as the format's are; a length left as it was keeps the watch's.
        const fromLength = row.from && "lengthSec" in row.from ? row.from.lengthSec : undefined;
        const unchanged = fromLength !== undefined && row.lengthMin === minutes(fromLength);
        const typed = Number(row.lengthMin);
        if (!unchanged && !(row.lengthMin.trim() !== "" && Number.isInteger(typed) && typed >= 1 && typed <= 20)) {
            return "A sin bin is 1 to 20 minutes.";
        }
        const lengthSec = unchanged ? fromLength : typed * 60;
        return { type: "sinBin", ...timing, ...at, team: row.team, offender: { kind: "player", ...(number ? { number } : {}) }, lengthSec, ...(row.code ? { misconduct: { scheme, code: row.code } } : {}) } as MatchEvent;
    }
    const name = row.from && row.from.type !== "goal" && "offender" in row.from && row.from.offender.kind === "teamOfficial" ? row.from.offender.name : undefined;
    const offender = row.who === "player" ? { kind: "player" as const, ...(number ? { number } : {}) } : { kind: "teamOfficial" as const, role: row.who, ...(name ? { name } : {}) };
    return { type: row.kind, ...timing, ...at, team: row.team, offender, ...(row.code ? { misconduct: { scheme, code: row.code } } : {}) } as MatchEvent;
}

export function ResultEdit() {
    const { id } = useParams();
    const match = useRecord("matches", id);
    const records = useList("match-records");
    if (!match.data || !records.data) {
        return <Loading />;
    }
    const record = records.data.find((r) => r.matchId === id);
    // Q-20: its periods named as they were played.
    return <ResultForm match={{ ...match.data, format: asPlayed(match.data.format, record) }} recordId={record?.id} />;
}

function ResultForm({ match, recordId }: { match: Match; recordId?: string }) {
    const navigate = useNavigate();
    const client = useQueryClient();
    const { settings } = useSettings();
    const competitions = useLookup("competitions");
    const scheme = (match.competitionId && competitions.get(match.competitionId)?.misconductScheme) || settings.misconductScheme;
    const codes = misconductSchemes[scheme];
    const editor = useEditor("match-records", recordId, (): Draft<"match-records"> => ({
        id: newId(), matchId: match.id, outcome: "completed", periods: periodsFromFormat(match.format), score: { home: 0, away: 0 }, events: [],
    }));
    const [rows, setRows] = useState<Row[]>();
    const [kicks, setKicks] = useState<Kick[]>();
    const [problem, setProblem] = useState<string>();
    const draft = editor.draft;
    if (!draft) {
        return <Loading />;
    }
    if (!rows || !kicks) {
        setRows(draft.events.flatMap((e) => rowOf(match, e) ?? []));
        setKicks(draft.events.flatMap((e) => (e.type === "penaltyKick" ? [{ key: nextKey++, team: e.team, scored: e.scored, number: String(e.player ?? "") }] : [])));
        return <Loading />;
    }

    const periods = [...new Set([...draft.periods.map((p) => p.period), ...periodsFromFormat(match.format).map((p) => p.period)])].sort((a, b) => a - b);
    const last = periods.at(-1) ?? match.format.periods;
    const whenOptions: [string, string][] = [
        ["before", "Before kickoff"],
        ...periods.flatMap((p): [string, string][] => [
            [`play:${p}`, periodName(match.format, p)],
            ...(p < last ? [[`break:${p}`, p === match.format.periods / 2 ? "Half-time" : "Break"] as [string, string]] : []),
        ]),
        ["after", "After full time"],
    ];
    const built = rows.map((r) => eventOf(match, r, scheme));
    const kept = draft.events.filter((e) => !edited.includes(e.type) && e.type !== "penaltyKick");
    const kickEvents = kicks.map((k): MatchEvent => ({ type: "penaltyKick", when: "penalties", team: k.team, scored: k.scored, ...(Number(k.number) >= 1 && Number(k.number) <= 99 ? { player: Number(k.number) } : {}) }));
    const valid = built.filter((b): b is MatchEvent => typeof b !== "string");
    // The live picture: the score from the goals, and which cautions and sin bins are second ones.
    const score = scoreOf(valid);
    const settledTypes = new Map<Row, string>();
    const settled = settleCautions(valid);
    rows.forEach((r, i) => typeof built[i] !== "string" && settledTypes.set(r, settled[valid.indexOf(built[i] as MatchEvent)].type));
    const penalties = penaltiesOf(kickEvents);
    const abandonment = draft.events.find((e) => e.type === "abandonment");

    const change = (row: Row, patch: Partial<Row>) => setRows(rows.map((r) => (r === row ? { ...r, ...patch } : r)));
    const add = (kind: Kind) => setRows([...rows, {
        key: nextKey++, kind, when: `play:${periods[0] ?? 1}`, minute: "", team: "home", who: "player", number: "", goalType: "goal", code: "", lengthMin: minutes(sinBinSecOf(match)),
    }]);
    // EVT-12: sin bins where the format has them, or the match already does.
    const sinBins = match.format.sinBins === true || rows.some((r) => r.kind === "sinBin");
    const kinds: [Kind, string][] = [["goal", "Goal"], ["caution", "Caution"], ...(sinBins ? [["sinBin", "Sin bin"] as [Kind, string]] : []), ["sendOff", "Send-off"]];
    const setOutcome = (outcome: "completed" | "abandoned", reason: Reason = "weather") => {
        const events = draft.events.filter((e) => e.type !== "abandonment");
        editor.update({
            outcome,
            events: outcome === "abandoned" ? [...events, { type: "abandonment", when: "play", period: last, reason } as MatchEvent] : events,
        });
    };

    const save = async () => {
        const wrong = built.find((b): b is string => typeof b === "string");
        if (wrong) {
            // The row says what's wrong; the foot, beside Save, says where to look.
            setProblem("Fix the goal or card marked in red first.");
            return;
        }
        setProblem(undefined);
        editor.save(() => `/matches/${match.id}`, (d) => withEvents(d, [...kept, ...valid, ...kickEvents]));
        // A match given a result without the watch has been played (RES-2), as a watch's upload says.
        if (editor.isNew && match.status === "scheduled") {
            const { updatedAt: _u, deletedAt: _d, ...rest } = match;
            await request("PUT", `/matches/${match.id}`, { ...rest, status: draft.outcome === "abandoned" ? "abandoned" : "played" }).catch(() => undefined);
            void client.invalidateQueries({ queryKey: ["matches"] });
        }
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <PageHead back={{ to: `/matches/${match.id}`, label: matchTitle(match) }} title={editor.isNew ? "Add result" : "Edit result"} tab={`${editor.isNew ? "Add result" : "Edit result"} · ${matchTabTitle(match)}`}
                sub={editor.isNew ? "For a match refereed without the watch." : "Corrections to what the watch recorded. The watch's own recording is kept, and can be put back."} />
            <div className="stack">
                {/* WEB-24: the score from the goals below, on the board between the two kits, as the match page's scoreboard. */}
                <div className="board scoreboard result-score">
                    <div className="board-head">
                        <span className="board-label">Result</span>
                        <span>From the goals below</span>
                    </div>
                    <div className="score-rows">
                    <KitPanels home={match.home} away={match.away} labels size="large" middle={
                        <span className="score-digits" aria-live="polite" aria-label={`${teamName(match.home, "home")} ${score.home}, ${teamName(match.away, "away")} ${score.away}`}>
                            <span>{score.home}</span><span className="score-dash">–</span><span>{score.away}</span>
                        </span>
                    } />
                    </div>
                    {penalties && <div className="board-foot"><span>{penalties.home}–{penalties.away} on penalties</span></div>}
                </div>

                <div className="card form-section">
                    <h2>Goals and cards</h2>
                    {rows.length === 0 && <p className="muted" style={{ marginTop: -6 }}>None yet. Add each goal and card; a goal with no minute or number still counts.</p>}
                    <div className="result-rows">
                        {rows.map((row, i) => {
                            const settledType = settledTypes.get(row);
                            const wrong = typeof built[i] === "string" ? built[i] as string : undefined;
                            const play = row.when.startsWith("play:");
                            return (
                                <div key={row.key} className={`result-row${wrong ? " has-problem" : ""}`}>
                                    <div className="result-row-head">
                                        <span className="result-kind">
                                            {/* A card shows its color; a goal, as on the timeline, needs no picture. */}
                                            {row.kind === "sinBin" ? <SinBinCard second={settledType === "secondSinBin"} />
                                                : row.kind !== "goal" && <span className={`card-icon ${settledType === "secondCaution" ? "second" : row.kind === "sendOff" ? "red" : "yellow"}`} />}
                                            <Select<Kind> value={row.kind} onChange={(kind) => kind && change(row, { kind, code: "", ...(kind === "sinBin" ? { who: "player" as const } : {}) })}
                                                options={kinds} />
                                        </span>
                                        <div className="segmented small" role="radiogroup" aria-label="Team">
                                            {(["home", "away"] as const).map((side) => (
                                                <button key={side} type="button" role="radio" aria-checked={row.team === side} className={row.team === side ? "on" : ""} onClick={() => change(row, { team: side })}>
                                                    <TeamBadge teams={match} side={side} small />
                                                </button>
                                            ))}
                                        </div>
                                        <button type="button" className="btn btn-icon btn-ghost" aria-label="Remove" onClick={() => setRows(rows.filter((r) => r !== row))}><Icon name="trash" size={17} /></button>
                                    </div>
                                    <div className="result-row-fields">
                                        <label className="field"><span>When</span>
                                            <Select value={row.when} onChange={(when) => when && change(row, { when })} options={row.kind === "goal" ? whenOptions.filter(([v]) => v.startsWith("play:")) : whenOptions} />
                                        </label>
                                        {play && (
                                            <label className="field"><span>Minute</span>
                                                <input className="input" inputMode="numeric" value={row.minute} placeholder="23 or 45+2" aria-invalid={wrong?.includes("isn't in") || undefined}
                                                    onChange={(e) => change(row, { minute: e.target.value })} />
                                            </label>
                                        )}
                                        {row.kind !== "goal" && row.kind !== "sinBin" && (
                                            <label className="field"><span>Who</span>
                                                <Select<Who> value={row.who} onChange={(who) => who && change(row, { who })} options={whoNames} />
                                            </label>
                                        )}
                                        {(row.kind === "goal" || row.who === "player") && (
                                            <label className="field"><span>Number</span>
                                                <input className="input" inputMode="numeric" maxLength={2} value={row.number} placeholder="None" onChange={(e) => change(row, { number: e.target.value.replace(/\D/g, "") })} />
                                            </label>
                                        )}
                                        {row.kind === "sinBin" && (
                                            <label className="field"><span>Length (min)</span>
                                                <input className="input" inputMode="numeric" maxLength={4} value={row.lengthMin} aria-invalid={wrong?.includes("sin bin") || undefined}
                                                    onChange={(e) => change(row, { lengthMin: e.target.value.replace(/[^\d.]/g, "") })} />
                                            </label>
                                        )}
                                        {row.kind === "goal" ? (
                                            <label className="field"><span>Type</span>
                                                <Select<GoalType> value={row.goalType} onChange={(goalType) => goalType && change(row, { goalType })} options={goalTypes} />
                                            </label>
                                        ) : codes && (
                                            <label className="field result-code"><span>Code ({codes.name})</span>
                                                <Select value={row.code || undefined} empty="None"
                                                    onChange={(code) => change(row, { code: code ?? "" })}
                                                    options={(settledType === "secondCaution" ? [{ code: codes.secondCaution, description: "Second caution" }, ...codes.cautions] : row.kind === "caution" || row.kind === "sinBin" ? codes.cautions : codes.sendOffs)
                                                        .map((c) => [c.code, `${c.code} · ${c.description}`] as [string, string])} />
                                            </label>
                                        )}
                                    </div>
                                    {settledType === "secondCaution" && <p className="result-note">Second caution to this player: it counts as a send-off.</p>}
                                    {settledType === "secondSinBin" && <p className="result-note">Second sin bin for this player: it counts as a send-off.</p>}
                                    {wrong && <p className="error" style={{ margin: "6px 0 0" }}>{wrong}</p>}
                                </div>
                            );
                        })}
                    </div>
                    <div className="row result-add" style={{ marginTop: 12 }}>
                        <button type="button" className="btn" onClick={() => add("goal")}><Icon name="plus" />Goal</button>
                        <button type="button" className="btn" onClick={() => add("caution")}><Icon name="plus" />Caution</button>
                        {sinBins && <button type="button" className="btn" onClick={() => add("sinBin")}><Icon name="plus" />Sin bin</button>}
                        <button type="button" className="btn" onClick={() => add("sendOff")}><Icon name="plus" />Send-off</button>
                    </div>
                </div>

                <div className="card form-section">
                    <h2>Penalties</h2>
                    {kicks.length === 0 && <p className="muted" style={{ marginTop: -6 }}>Only for a match decided by a shoot-out.</p>}
                    <div className="kick-rows">
                        {kicks.map((k, i) => (
                            <div key={k.key} className="kick-row">
                                <span className="muted kick-order">{i + 1}</span>
                                <div className="segmented small" role="radiogroup" aria-label="Team">
                                    {(["home", "away"] as const).map((side) => (
                                        <button key={side} type="button" role="radio" aria-checked={k.team === side} className={k.team === side ? "on" : ""}
                                            onClick={() => setKicks(kicks.map((x) => (x === k ? { ...x, team: side } : x)))}><TeamBadge teams={match} side={side} small /></button>
                                    ))}
                                </div>
                                <div className="segmented small" role="radiogroup" aria-label="Kick">
                                    <button type="button" role="radio" aria-checked={k.scored} className={k.scored ? "on" : ""} onClick={() => setKicks(kicks.map((x) => (x === k ? { ...x, scored: true } : x)))}>Scored</button>
                                    <button type="button" role="radio" aria-checked={!k.scored} className={!k.scored ? "on" : ""} onClick={() => setKicks(kicks.map((x) => (x === k ? { ...x, scored: false } : x)))}>Missed</button>
                                </div>
                                <input className="input kick-number" inputMode="numeric" maxLength={2} aria-label="Number" placeholder="No." value={k.number}
                                    onChange={(e) => setKicks(kicks.map((x) => (x === k ? { ...x, number: e.target.value.replace(/\D/g, "") } : x)))} />
                                <button type="button" className="btn btn-icon btn-ghost" aria-label="Remove" onClick={() => setKicks(kicks.filter((x) => x !== k))}><Icon name="trash" size={17} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="row" style={{ marginTop: 10 }}>
                        <button type="button" className="btn" onClick={() => setKicks([...kicks, { key: nextKey++, team: kicks.length % 2 === 0 ? "home" : "away", scored: true, number: "" }])}>
                            <Icon name="plus" />Kick
                        </button>
                    </div>
                </div>

                <div className="card form-section">
                    <h2>Outcome</h2>
                    <div className="fields">
                        <label className="field"><span>The match</span>
                            <Select<"completed" | "abandoned"> value={draft.outcome} onChange={(o) => o && setOutcome(o)} options={[["completed", "Played to full time"], ["abandoned", "Abandoned"]]} />
                        </label>
                        {draft.outcome === "abandoned" && (
                            <label className="field"><span>Why</span>
                                <Select<Reason> value={abandonment?.type === "abandonment" ? abandonment.reason : "weather"} onChange={(r) => r && setOutcome("abandoned", r)} options={reasons.map(([v, l]) => [v, l])} />
                            </label>
                        )}
                    </div>
                </div>

                {problem && <p className="error">{problem}</p>}
                <FormActions editor={editor} onCancel={() => navigate(`/matches/${match.id}`)} />
            </div>
        </form>
    );
}
