import { useState } from "react";
import { useParams } from "react-router";
import { useList, useLookup, useRecord, useSession } from "../api.ts";
import { Icon, Loading, PageHead } from "../components/ui.tsx";
import { asPlayed, crewInOrder, matchTabTitle, matchTitle, roleNames, teamName } from "../format.ts";
import { type ReportData, clockLines, fullDate, reportRows, reportText, resultLine, suspensionLines } from "../report.ts";

// The match report (DATA-6): a page laid out for printing (or saving as PDF from the browser's
// print), with Copy as text for pasting into a league's or assignor's form.

export function MatchReport() {
    const { id } = useParams();
    const match = useRecord("matches", id);
    const records = useList("match-records");
    const venues = useLookup("venues");
    const competitions = useLookup("competitions");
    const referees = useLookup("referees");
    const session = useSession();
    const [copied, setCopied] = useState(false);
    const record = records.data?.find((r) => r.matchId === id);

    if (!match.data || !records.isSuccess) {
        return match.isError ? <p className="muted">This match doesn't exist.</p> : <Loading />;
    }
    // Q-20: its periods named as they were played.
    const m = { ...match.data, format: asPlayed(match.data.format, record) };
    if (!record) {
        return (
            <>
                <PageHead back={{ to: `/matches/${m.id}`, label: `Match · ${m.name ?? matchTitle(m)}` }} title="Match report" tab={`Report · ${matchTabTitle(m)}`} />
                <p className="muted">There's a report once the match has been played and your watch has synced it.</p>
            </>
        );
    }
    const venue = m.venueId ? venues.get(m.venueId) : undefined;
    const you = session.data?.user.name ?? "You";
    const data: ReportData = {
        match: m,
        record,
        competition: m.competitionId ? competitions.get(m.competitionId)?.name : m.name,
        venue: venue?.name,
        pitch: venue?.pitches.find((p) => p.id === m.pitchId)?.name,
        officials: crewInOrder(m.crew, m.role).map((o) => ({
            role: roleNames[o.role],
            name: o.you ? you : (o.member.refereeId ? referees.get(o.member.refereeId)?.name : undefined) ?? o.member.name ?? "Unknown",
        })),
    };
    const { goals, cards, injuries } = reportRows(data);
    const copy = async () => {
        await navigator.clipboard.writeText(reportText(data));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <PageHead back={{ to: `/matches/${m.id}`, label: `Match · ${m.name ?? matchTitle(m)}` }} title="Match report" tab={`Report · ${matchTabTitle(m)}`} actions={
                <>
                    <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy as text"}</button>
                    <button type="button" className="btn btn-primary" onClick={() => window.print()}><Icon name="download" />Print or save as PDF</button>
                </>
            } />
            <article className="card report">
                <header className="report-head">
                    <div>
                        <div className="report-kicker">Match report</div>
                        <h2>{teamName(m.home, "home")} v {teamName(m.away, "away")}</h2>
                        {data.competition && <div className="muted">{data.competition}</div>}
                    </div>
                    <div className="report-score">
                        {record.score.home} – {record.score.away}
                        <small>{record.outcome === "abandoned" ? "Abandoned" : "Full time"}{record.penalties && ` · ${record.penalties.home}–${record.penalties.away} on penalties`}{record.goldenGoal && " · golden goal"}{record.editedAt && " · corrected after the match"}</small>
                    </div>
                </header>
                <dl className="report-facts">
                    {m.kickoff && <div><dt>Date</dt><dd>{fullDate(m.kickoff, m.timeZone, true)}</dd></div>}
                    {(data.venue || data.pitch) && <div><dt>Venue</dt><dd>{[data.venue, data.pitch].filter(Boolean).join(", ")}</dd></div>}
                    {m.external && <div><dt>Match number</dt><dd>{m.external.id}</dd></div>}
                    {m.assignor && <div><dt>Assignor</dt><dd>{m.assignor}</dd></div>}
                    <div><dt>Officials</dt><dd>{data.officials.map((o) => <div key={o.role}>{o.role}: {o.name}</div>)}</dd></div>
                    <div><dt>Result</dt><dd>{resultLine(data)}</dd></div>
                    {/* TMR-13: play suspended, and for how long. */}
                    {suspensionLines(data).length > 0 && <div><dt>Suspended</dt><dd>{suspensionLines(data).map((line) => <div key={line}>{line}</div>)}</dd></div>}
                    {/* TMR-14: the clock corrected during play. */}
                    {clockLines(data).length > 0 && <div><dt>Clock</dt><dd>{clockLines(data).map((line) => <div key={line}>{line}</div>)}</dd></div>}
                </dl>

                <h3 className="report-section">Goals</h3>
                {goals.length ? (
                    <table className="data-table report-table">
                        <thead><tr><th scope="col">Minute</th><th scope="col">Team</th><th scope="col">Player</th><th scope="col">How</th></tr></thead>
                        <tbody>{goals.map((g, i) => <tr key={i}><td>{g.minute}</td><td>{g.team}</td><td>{g.player}</td><td>{g.kind}</td></tr>)}</tbody>
                    </table>
                ) : <p className="muted">None.</p>}

                <h3 className="report-section">Cautions and send-offs</h3>
                {cards.length ? (
                    <table className="data-table report-table">
                        <thead><tr><th scope="col">Minute</th><th scope="col">Team</th><th scope="col">Player</th><th scope="col">Card</th><th scope="col">Code</th></tr></thead>
                        <tbody>
                            {cards.map((c, i) => (
                                <tr key={i}>
                                    <td>{c.minute}</td><td>{c.team}</td><td>{c.offender}</td><td>{c.card}</td>
                                    <td>{c.code && <><strong>{c.code}</strong>{c.description && <span className="muted"> {c.description}</span>}</>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : <p className="muted">None.</p>}

                {/* EVT-16: only when there were any. */}
                {injuries.length > 0 && (
                    <>
                        <h3 className="report-section">Injuries</h3>
                        <table className="data-table report-table">
                            <thead><tr><th scope="col">Minute</th><th scope="col">Team</th><th scope="col">Player</th><th scope="col">Play stopped</th></tr></thead>
                            <tbody>
                                {injuries.map((inj, i) => (
                                    <tr key={i}>
                                        <td>{inj.minute}</td><td>{inj.team}</td><td>{inj.player}</td>
                                        <td>{inj.stopped}{inj.note && <span className="muted">{inj.stopped ? " · " : ""}{inj.note}</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </>
                )}

                <h3 className="report-section">Notes</h3>
                {m.notes ? <p className="notes-text">{m.notes}</p> : <p className="muted no-print">No notes. Add the written account of any send-off to the match's notes (Edit), and it appears here.</p>}
            </article>
        </>
    );
}
