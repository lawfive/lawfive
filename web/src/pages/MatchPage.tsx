import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useParams } from "react-router";
import { type Match, type MatchEvent, type MatchRecord, type Referee, type Venue, useList, useLookup, useRecord, useSave, useSession, useTrack } from "../api.ts";
import { AddTrack, TrackDrop } from "../components/AddTrack.tsx";
import { Photos, RefereeAvatar } from "../components/Photos.tsx";
import { ShareMatch } from "../components/ShareMatch.tsx";
import { TrackSection } from "../components/TrackSection.tsx";
import { matchListLink } from "./Matches.tsx";
import { Fact, Icon, PageHead, SinBinCard, Tags, TeamBadge, CameFrom, FromLink, ContactButtons, KitPanels } from "../components/ui.tsx";
import { WeatherSlab, WeatherStripNote } from "../components/Weather.tsx";
import { asPlayed, clockAdjustedWords, sinBinLength, suspensionWords, crewInOrder, describeFormat, describePlayers, formatDay, formatDistance, formatShortDay, formatTime, formatWhen, watchShortName, matchMinute, matchTabTitle, matchTitle, money, periodName, roleNames, roleNamesInFull, roleNamesShort, teamName, timeParts } from "../format.ts";
import { type Together, describeTogether, useWorkedTogether } from "../history.ts";
import { useDirections, useSettings } from "../settings.ts";
import { useMatchWeather } from "../weather.ts";
import { StatusChip } from "./Matches.tsx";
import { useMatchesOnWatches, useWatchLinked } from "./Devices.tsx";

// One match: the scoreboard, the weather, the details, and (once played) the events the watch recorded
// and, when there's a track, movement and heart rate, which an activity file can add or replace (TRK-8).

export function MatchPage() {
    const { id } = useParams();
    const match = useRecord("matches", id);
    const records = useList("match-records");
    const venues = useLookup("venues");
    const competitions = useLookup("competitions");
    const referees = useLookup("referees");
    const { settings } = useSettings();
    const weather = useMatchWeather(id);
    const together = useWorkedTogether();
    const record = records.data?.find((r) => r.matchId === id);
    const track = useTrack(record?.id);
    const [trackFile, setTrackFile] = useState<File>();
    // RES-3: the watch's own recording in place of the corrected one.
    const [asRecorded, setAsRecorded] = useState(false);

    if (!match.data) {
        return match.isError ? <p className="muted">This match doesn't exist.</p> : <MatchPlaceholder />;
    }
    // Q-20: its periods named as they were played.
    const m = { ...match.data, format: asPlayed(match.data.format, record) };
    // The track's distance when there is one (TRK-3), so it agrees with the figures below.
    const distanceM = track.data?.summary.total.distanceM ?? record?.distanceM;
    const venue = m.venueId ? venues.get(m.venueId) : undefined;
    const pitch = venue?.pitches.find((p) => p.id === m.pitchId);
    const position = pitch?.position ?? venue?.position;
    const competition = m.competitionId ? competitions.get(m.competitionId) : undefined;

    return (
        <CameFrom.Provider value={{ to: location.pathname, label: `Match · ${m.name ?? matchTitle(m)}` }}>
            <div className="match-page">
                <PageHead
                    back={{ to: matchListLink(), label: "Matches" }}
                    title={m.name ?? matchTitle(m)}
                    tab={matchTabTitle(m)}
                    sub={[competition?.name, m.kickoff && `${formatDay(m.kickoff)}, ${formatTime(m.kickoff)}`].filter(Boolean).join(" · ")}
                    actions={
                        <>
                            {record && <Link to={`/matches/${m.id}/report`} className="btn"><Icon name="report" />Report</Link>}
                            <ShareMatch matchId={m.id} />
                            <Link to={`/matches/${m.id}/edit`} className="btn"><Icon name="edit" />Edit</Link>
                        </>
                    }
                />

                <Scoreboard match={m} record={record} distance={distanceM !== undefined ? formatDistance(distanceM, settings.distanceUnit) : undefined} />
                {/* WX-5, WEB-28: the weather on a slab under the scoreboard, its details a tap away; the note about a missing forecast stays a line between chalk rules. */}
                {weather.weather
                    ? <WeatherSlab weather={weather.weather} settings={settings} />
                    : weather.enabled && !weather.isLoading && <NoForecast match={m} hasPlace={position !== undefined} venueId={venue?.id} />}

                {/* WEB-24: the match's details on their panel (the venue among them, as on the mockup), the events
                    down the halfway line beside it, then the officials and photos under the panel; on a phone
                    the panel comes first. */}
                <div className={`match-body section${record ? "" : " before-result"}`}>
                    <section className="card facts-panel corner-arcs" aria-labelledby="facts-title">
                        <h2 id="facts-title">The match</h2>
                        <MatchFigures match={m} />
                        <dl className="facts">
                            {venue ? <VenueFact venue={venue} pitchName={pitch?.name} position={position} together={together.venues.get(venue.id)} />
                                : !m.venueId && <Fact icon="venues" label="Venue"><span className="muted">None set</span></Fact>}
                            {!record && <OnYourWatch match={m} />}
                            {m.role && <Fact icon="role" label="Your role"><span className="chip chip-brand">{roleNames[m.role]}</span></Fact>}
                            {describePlayers(m) && <Fact icon="referees" label="Players">{describePlayers(m)}</Fact>}
                            <Fact icon="clock" label="Format">{describeFormat(m.format)}</Fact>
                            {m.fee && (
                                <Fact icon="money" label="Fee">
                                    <span className="row">{money(m.fee.amount, m.fee.currency)} {m.fee.paid ? <span className="chip chip-brand">Paid</span> : <span className="chip chip-amber">Not paid</span>}</span>
                                </Fact>
                            )}
                            {record && (m.notes || m.outlook) && <Fact icon="note" label="Notes"><span className="notes-text">{m.notes ?? m.outlook}</span></Fact>}
                            {m.tags?.length ? <Fact icon="tag" label="Tags"><span className="row"><Tags tags={m.tags} /></span></Fact> : null}
                            {m.assignor && <Fact icon="assignor" label="Assignor">{m.assignor}</Fact>}
                            {m.external && <Fact icon="hash" label="Match number">{m.external.id} <span className="muted">({m.external.source})</span></Fact>}
                        </dl>
                    </section>
                    <div className="match-events">
                        {record ? (
                            <Events match={m} record={asRecorded && record.original ? { ...record, ...record.original } : record}
                                action={<Link to={`/matches/${m.id}/result`} className="btn btn-sm"><Icon name="edit" size={15} />Edit result</Link>}
                                note={record.editedAt && <EditedNote record={record} asRecorded={asRecorded} setAsRecorded={setAsRecorded} />} />
                        ) : (
                            <section className="match-notes" aria-labelledby="notes-title">
                                <div className="events-head"><h2 id="notes-title">Notes</h2></div>
                                <div className="card card-pad">
                                    {m.notes || m.outlook ? (
                                        <>
                                            {m.outlook && <p className="notes-text" style={{ marginTop: 0 }}><strong>What to expect.</strong> {m.outlook}</p>}
                                            {m.notes && <p className="notes-text" style={{ margin: 0 }}>{m.notes}</p>}
                                        </>
                                    ) : <span className="muted">No notes.</span>}
                                    <p className="muted notes-after">
                                        Goals, cards and stoppages appear here after the match, once your watch has synced.
                                    </p>
                                    {/* RES-2: refereed without the watch, the result can be entered here. */}
                                    {records.isSuccess && (m.status === "played" || m.status === "abandoned" || (m.kickoff && Date.parse(m.kickoff) < Date.now())) && (
                                        <Link to={`/matches/${m.id}/result`} className="btn" style={{ marginTop: 12 }}><Icon name="plus" />Add result</Link>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>
                    <Officials match={m} referees={referees} together={together.referees} />
                    <div className="match-photos"><Photos recordType="match" recordId={m.id} /></div>
                </div>

                {record && track.isLoading && <TrackPlaceholder />}
                {record && track.data && <TrackSection match={m} record={record} track={track.data.track} summary={track.data.summary} pitch={track.data.pitch} settings={settings} onReplace={setTrackFile} />}
                {(record ? track.data === null : m.status === "played" && records.isSuccess) && <TrackDrop onFile={setTrackFile} />}
                {trackFile && (
                    <AddTrack file={trackFile} match={m} record={record} existing={track.data ?? undefined} settings={settings} onClose={() => setTrackFile(undefined)} />
                )}
            </div>
        </CameFrom.Provider>
    );
}

/**
 * SYNC-14: whether an upcoming match is on a watch: "On your Venu 2 since 8:12 PM", "On your Venu 2,
 * an older version: sync the watch", or, with a watch linked, "Not on a watch yet". Nothing with no
 * watch linked (Get ready covers that), or once the match is past what a watch downloads.
 */
function OnYourWatch({ match }: { match: Match }) {
    // A watch downloads scheduled matches from three hours before their kickoff on (SYNC-3).
    const upcoming = match.status === "scheduled" && (!match.kickoff || Date.parse(match.kickoff) > Date.now() - 3 * 3_600_000);
    const linked = useWatchLinked();
    const onWatches = useMatchesOnWatches(upcoming && linked === true);
    if (!upcoming || !linked || !onWatches.isSuccess) {
        return null;
    }
    const here = onWatches.data.filter((w) => w.matchId === match.id);
    return (
        <Fact icon="watch" label="Watch">
            {here.length === 0 ? <span className="muted">Not on a watch yet</span> : (
                <span className="on-watch">
                    {here.map((w) => (
                        <span key={w.deviceId} className={w.upToDate ? undefined : "on-watch-old"}>
                            {w.upToDate
                                ? `On your ${watchShortName(w.name)} since ${formatWhen(w.since)}`
                                : `On your ${watchShortName(w.name)}, an older version: sync the watch`}
                        </span>
                    ))}
                </span>
            )}
        </Fact>
    );
}

/**
 * WEB-24: the scoreboard, a stadium board: what state the match is in and when, then each team's
 * kit with its score beside it (the side that lost dimmed), or the kickoff between them before it's
 * played, then a foot with penalties, a golden goal and how far you ran.
 */
export function Scoreboard({ match, record, distance }: { match: Match; record?: MatchRecord; distance?: string }) {
    const when = match.kickoff ? `${formatShortDay(match.kickoff)} · ${formatTime(match.kickoff)}` : "Time to be set";
    const status = record ? (record.outcome === "abandoned" ? "Abandoned" : "Full time")
        : match.status === "postponed" ? "Postponed" : match.status === "cancelled" ? "Canceled" : match.status === "abandoned" ? "Abandoned" : "Kickoff";
    const { home, away } = record?.score ?? { home: 0, away: 0 };
    const pens = record?.penalties;
    const lost = (side: "home" | "away") => {
        const [us, them] = side === "home" ? [home, away] : [away, home];
        return us < them || (us === them && pens !== undefined && (side === "home" ? pens.home < pens.away : pens.away < pens.home));
    };
    const [time, period] = match.kickoff ? timeParts(match.kickoff) : ["", undefined];
    const foot = [
        pens && `${pens.home}–${pens.away} on penalties`,
        record?.goldenGoal && "On a golden goal",
        distance && `You covered ${distance}`,
    ].filter(Boolean);
    return (
        <section className={`scoreboard-area${record ? " played" : ""}`} aria-label="Scoreboard">
            <div className="board scoreboard">
                <div className="board-head">
                    <span className="board-label">{status}</span>
                    <span>{when}</span>
                </div>
                {record ? (
                    <div className="score-rows" role="img" aria-label={`${teamName(match.home, "home")} ${home}, ${teamName(match.away, "away")} ${away}${pens ? `, ${pens.home}–${pens.away} on penalties` : ""}`}>
                        <KitPanels home={match.home} away={match.away} labels size="large" middle={
                            <span className="score-digits">
                                <span className={lost("home") ? "lost" : ""}>{home}</span>
                                <span className="score-dash">–</span>
                                <span className={lost("away") ? "lost" : ""}>{away}</span>
                            </span>
                        } />
                    </div>
                ) : (
                    <KitPanels home={match.home} away={match.away} labels size="large" middle={
                        match.kickoff ? <span className="score-kickoff">{time}{period && <small>{period}</small>}</span> : <span className="score-kickoff no-time">v</span>
                    } />
                )}
                {foot.length > 0 && <div className="board-foot">{foot.map((f, i) => <span key={i}>{f}</span>)}</div>}
            </div>
        </section>
    );
}

/** WEB-24: the match's figures across the top of its panel: kickoff, fee and periods, as the board does them. */
function MatchFigures({ match }: { match: Match }) {
    const [time, period] = match.kickoff ? timeParts(match.kickoff) : [undefined, undefined];
    const minutes = Math.round(match.format.periodSec / 60);
    const periods = match.format.periods === 2 ? "Halves" : "Periods";
    return (
        <div className="panel-figures">
            <div><span>Kickoff</span><b>{time ?? "—"}{period && <small>{period}</small>}</b></div>
            {match.fee && <div><span>Fee</span><b>{money(match.fee.amount, match.fee.currency)}</b></div>}
            <div><span>{periods}</span><b>{match.format.periods}×{minutes}</b></div>
        </div>
    );
}

/** Why an upcoming match has no forecast yet, and what to do about it. */
function NoForecast({ match, hasPlace, venueId }: { match: Match; hasPlace: boolean; venueId?: string }) {
    if (match.status !== "scheduled" || !match.kickoff || new Date(match.kickoff).getTime() < Date.now()) {
        return null;
    }
    const days = (new Date(match.kickoff).getTime() - Date.now()) / 86_400_000;
    return (
        <WeatherStripNote>
            {!hasPlace ? (
                venueId
                    ? <>No forecast: <FromLink to={`/venues/${venueId}`}>place the venue on its map</FromLink> to get one.</>
                    : <>No forecast: choose a venue (with its place on the map) to get one.</>
            ) : days > 15 ? "The forecast appears about two weeks before kickoff." : "Getting the forecast…"}
        </WeatherStripNote>
    );
}

/**
 * WEB-24: where the match is, a row of The match's panel as on the mockup: the venue (to its page),
 * the pitch and address, how often you've refereed there, and Directions.
 */
function VenueFact({ venue, pitchName, position, together }: { venue: Venue; pitchName?: string; position?: { lat: number; lon: number }; together?: Together }) {
    const directions = useDirections();
    return (
        <Fact icon="venues" label="Venue">
            <span className="venue-fact">
                <FromLink to={`/venues/${venue.id}`} className="venue-fact-name">{venue.name}</FromLink>
                {(pitchName || venue.address) && <span className="venue-fact-where">{[pitchName, venue.address].filter(Boolean).join(" · ")}</span>}
                <span className="venue-fact-history">{describeTogether(together, "here")}</span>
                {(position || venue.address) && (
                    <a className="btn btn-sm venue-fact-go" href={directions(position ?? venue.address!)} target="_blank" rel="noreferrer">
                        <Icon name="directions" size={15} />Directions
                    </a>
                )}
            </span>
        </Fact>
    );
}

const sweep = (i: number) => ({ "--i": i }) as CSSProperties;

/**
 * The match page while it loads (WEB-8): faint shapes where the title, scoreboard and cards will
 * be, swept, shown once loading has taken 0.3 s.
 */
function MatchPlaceholder() {
    return (
        <div className="placeholder-appear" role="status" aria-label="Loading the match">
            <div aria-hidden>
                <span className="placeholder-bar back-placeholder" />
                <div className="page-head">
                    <div className="grow">
                        <span className="placeholder-bar title-placeholder" />
                        <span className="placeholder-bar page-sub-placeholder" />
                    </div>
                </div>
                <div className="board scoreboard scoreboard-placeholder sweep" style={sweep(0)}>
                    <span className="placeholder-bar" style={{ width: 160 }} />
                    <span className="placeholder-bar score-placeholder" />
                </div>
                <div className="two-col section">
                    {[1, 2].map((i) => (
                        <div key={i} className="card chart-card sweep" style={sweep(i)}>
                            <span className="placeholder-bar" style={{ width: "35%" }} />
                            {[90, 75, 82, 60].map((w, j) => <span key={j} className="placeholder-bar" style={{ width: `${w}%` }} />)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Where Movement and heart rate will be, while its track loads after the rest of the page. */
function TrackPlaceholder() {
    return (
        <section className="section placeholder-appear" role="status" aria-label="Loading the track">
            <div aria-hidden>
                <span className="placeholder-bar" style={{ width: 200, height: 14, marginBottom: 14 }} />
                {/* WEB-28: where the figures' slab will be. */}
                <div className="board stats-board-placeholder track-slab-placeholder sweep" style={sweep(0)}>
                    <span className="placeholder-bar" style={{ width: "24%" }} />
                    <span className="placeholder-bar value-placeholder" />
                    <span className="placeholder-bar value-placeholder" />
                </div>
                <div className="two-col track-cols">
                    {[0, 1].map((i) => (
                        <div key={i} className="card chart-card sweep" style={sweep(i + 1)}>
                            <span className="placeholder-bar" style={{ width: "40%" }} />
                            <span className="placeholder-bar chart-placeholder" />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

/**
 * WEB-24: the officials on the grass, a row each in the usual order: the role on a board tile, then a
 * chalk panel with the name (to their page), how often you've worked together and how to reach them;
 * your own row has the green "You".
 */
function Officials({ match, referees, together }: { match: Match; referees: Map<string, Referee>; together: Map<string, Together> }) {
    const session = useSession();
    const crew = crewInOrder(match.crew, match.crew.length ? match.role : undefined);
    return (
        <section className="officials" aria-labelledby="officials-title">
            <div className="events-head"><h2 id="officials-title">Officials</h2></div>
            {crew.length === 0 ? <p className="muted officials-none">No other officials listed.</p> : (
                <ul className="tile-rows">
                    {crew.map((o, i) => {
                        const tile = <span className="row-tile" aria-hidden>{roleNamesShort[o.role]}</span>;
                        const role = <span className="visually-hidden">{roleNamesInFull[o.role]}: </span>;
                        if (o.you) {
                            return (
                                <li key={i} className="tile-row you">
                                    {tile}
                                    <span className="row-main">
                                        <span className="row-who"><span className="row-name">{role}{session.data?.user.name ?? "You"}</span></span>
                                        <span className="chip chip-brand row-you">You</span>
                                    </span>
                                </li>
                            );
                        }
                        const c = o.member;
                        const referee = c.refereeId ? referees.get(c.refereeId) : undefined;
                        const name = referee?.name ?? c.name ?? "Unknown";
                        return (
                            <li key={i} className={`tile-row${referee ? " linked" : ""}`}>
                                {tile}
                                <span className="row-main">
                                    <RefereeAvatar referee={referee} name={name} photoOnly />
                                    <span className="row-who">
                                        <span className="row-name">{role}{referee ? <FromLink to={`/referees/${referee.id}`} className="row-link">{name}</FromLink> : name}</span>
                                        <span className="row-sub">{referee ? describeTogether(together.get(referee.id), "together") : "Not a saved referee"}</span>
                                    </span>
                                    {referee && <ContactButtons phone={referee.phone} email={referee.email} name={name} />}
                                    {referee && <span className="row-go" aria-hidden><Icon name="next" size={20} /></span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * WEB-24: the match's events on the grass: a heading, the two kits as a strip, then the timeline
 * down the halfway line, home's events on its left and away's on its right.
 */
export function Events({ match, record, action, note }: { match: Match; record: MatchRecord; action?: ReactNode; note?: ReactNode }) {
    return (
        <section className="events" aria-labelledby="events-title">
            <div className="events-head">
                <h2 id="events-title">Events</h2>
                {action}
            </div>
            <div className="board events-kits" aria-hidden><KitPanels home={match.home} away={match.away} size="small" /></div>
            <Timeline match={match} record={record} />
            {note}
        </section>
    );
}

/** Every period played, with its events (or none), then anything after full time and the shoot-out, and the final score. */
export function Timeline({ match, record }: { match: Match; record: MatchRecord }) {
    const items: React.ReactNode[] = [];
    // TMR-15: on a clock that stops, the minutes are the clock's, and its stoppages are where it stood still.
    const stopping = record.stoppingClock === true || match.format.stoppingClock === true;
    const format = stopping ? { ...match.format, stoppingClock: true } : match.format;
    if (stopping) {
        items.push(<li key="clock" className="no-events"><span className="muted">The clock stopped when play stopped: the minutes are the clock's</span></li>);
    }
    const events = record.events.filter((e) => e.type !== "penaltyKick" && e.type !== "periodEnd");
    const scores = scoreAfterEachGoal(record.events);
    const placed = new Set<MatchEvent>();
    const group = (label: string, list: MatchEvent[], always = false) => {
        if (list.length === 0 && !always) {
            return;
        }
        items.push(<li key={`s${items.length}`} className="divider"><span>{label}</span></li>);
        if (list.length === 0) {
            items.push(<li key={`e${items.length}`} className="no-events"><span className="muted">No events</span></li>);
        }
        for (const event of list) {
            placed.add(event);
            const minute = event.when === "play" && event.period && event.periodSec !== undefined ? matchMinute(format, event.period, event.periodSec) : "";
            const side = "team" in event ? event.team : undefined;
            const body = (
                <span className="event-body">
                    {event.type === "goal" ? <GoalScore score={scores.get(event)!} /> : eventIcon(event)}
                    <span className="event-text">{describeEvent(match, event, side !== undefined, stopping)}</span>
                </span>
            );
            items.push(
                <li key={`e${items.length}`} className={`event ${side ?? "neutral"}`}>
                    <span className="event-side home-side">{side === "home" && body}</span>
                    <span className={`minute${minute ? "" : " none"}`}>{minute}</span>
                    <span className="event-side away-side">{side !== "home" && body}</span>
                </li>,
            );
        }
    };

    const periods = periodsPlayed(match, record);
    group("Before kickoff", events.filter((e) => e.when === "beforeKickoff"));
    for (const period of periods) {
        group(periodName(match.format, period), events.filter((e) => e.when === "play" && e.period === period), true);
        group(breakName(match, period), events.filter((e) => e.when === "break" && e.period === period));
    }
    group("After full time", events.filter((e) => e.when === "afterFullTime"));
    group("Other", events.filter((e) => !placed.has(e) && e.when !== "penalties"));

    const kicks = record.events.filter((e) => e.type === "penaltyKick");
    if (kicks.length) {
        items.push(<li key="s-pens" className="divider"><span>Penalties</span></li>);
        items.push(
            <li key="pens" className="event pens">
                {(["home", "away"] as const).map((side) => (
                    <span key={side} className={`event-side ${side}-side`}>
                        <span className="pen-row" aria-label={`${teamName(match[side], side)}: ${kicks.filter((k) => "team" in k && k.team === side && "scored" in k && k.scored).length} scored`}>
                            {kicks.filter((k) => "team" in k && k.team === side).map((k, j) => (
                                <span key={j} className={`pen ${"scored" in k && k.scored ? "scored" : "missed"}`} title={"scored" in k && k.scored ? "Scored" : "Missed"} />
                            ))}
                        </span>
                    </span>
                ))}
            </li>,
        );
    }
    const { home, away } = record.score;
    items.push(
        <li key="final" className="final">
            <span>{record.outcome === "abandoned" ? "Abandoned" : "Full time"}</span>
            <b>{home}–{away}{record.penalties && <small> ({record.penalties.home}–{record.penalties.away} p)</small>}</b>
        </li>,
    );
    return <ol className="timeline">{items}</ol>;
}

/** RES-3: a corrected result says so; the watch's recording can be shown, or put back. */
function EditedNote({ record, asRecorded, setAsRecorded }: { record: MatchRecord; asRecorded: boolean; setAsRecorded: (on: boolean) => void }) {
    const save = useSave("match-records");
    const revert = () => {
        if (!record.original || !confirm("Put back what the watch recorded? Your corrections to the goals, cards and outcome go.")) {
            return;
        }
        const { updatedAt: _u, deletedAt: _d, editedAt: _e, original, ...rest } = record;
        save.mutate({ ...rest, ...original }, { onSuccess: () => setAsRecorded(false) });
    };
    return (
        <div className="edited-note">
            <Icon name="edit" size={15} />
            <span>{asRecorded ? "As the watch recorded it" : `Edited after the match, ${formatShortDay(record.editedAt!)}`}</span>
            {record.original && (
                <>
                    <button type="button" className="link-button" onClick={() => setAsRecorded(!asRecorded)}>{asRecorded ? "Show the corrected result" : "Show as recorded"}</button>
                    <button type="button" className="link-button" disabled={save.isPending} onClick={revert}>Put back the watch's</button>
                </>
            )}
            {save.error && <span className="error">{save.error.message}</span>}
        </div>
    );
}

/** The periods the watch says were played, or the format's (and any an event mentions). */
function periodsPlayed(match: Match, record: MatchRecord): number[] {
    const listed = record.periods.map((p) => p.period);
    const fromFormat = Array.from({ length: match.format.periods }, (_, i) => i + 1);
    const fromEvents = record.events.flatMap((e) => (e.when === "play" && e.period ? [e.period] : []));
    return [...new Set([...(listed.length ? listed : fromFormat), ...fromEvents])].sort((a, b) => a - b);
}

/** The break after a period: half-time halfway through normal time, otherwise just a break. */
function breakName(match: Match, period: number): string {
    const { periods } = match.format;
    return period === periods / 2 ? "Half-time" : period === periods ? "Before extra time" : "Break";
}

interface ScoreAfter { home: number; away: number; team: "home" | "away" }

/** The score after each goal ("2–1"), shown beside it in place of an icon. */
function scoreAfterEachGoal(events: MatchEvent[]): Map<MatchEvent, ScoreAfter> {
    const score = { home: 0, away: 0 };
    const after = new Map<MatchEvent, ScoreAfter>();
    for (const event of events) {
        if (event.type === "goal") {
            score[event.team] += 1;
            after.set(event, { ...score, team: event.team });
        }
    }
    return after;
}

/** WEB-24: the score after a goal, the side that scored lit and the rest dimmed, as on the board. */
function GoalScore({ score }: { score: ScoreAfter }) {
    return (
        <span className="event-score" aria-label={`${score.home}–${score.away}`}>
            <span className={score.team === "home" ? "" : "dim"}>{score.home}</span>
            <span className="dim">–</span>
            <span className={score.team === "away" ? "" : "dim"}>{score.away}</span>
        </span>
    );
}

function eventIcon(event: MatchEvent) {
    switch (event.type) {
        case "caution": return <span className="card-icon yellow" />;
        case "secondCaution": return <span className="card-icon second" />;
        case "sendOff": return <span className="card-icon red" />;
        // EVT-12: the card shown, with the hourglass of the time off on it.
        case "sinBin": return <SinBinCard />;
        case "secondSinBin": return <SinBinCard second />;
        case "stoppage": return <Icon name="pause" size={18} />;
        case "injury": return <Icon name="injury" size={18} />;
        case "clockAdjusted": return <Icon name="clockAdjusted" size={18} />;
        case "suspension": return <Icon name="pause" size={18} />;
        case "abandonment": return <Icon name="flag" size={18} />;
        default: return null;
    }
}

const goalTypeNames = { goal: "Goal", directFreeKick: "DFK goal", penalty: "Penalty goal", ownGoal: "Own goal" } as const;
const officialNames = { headCoach: "Head coach", assistantCoach: "Assistant coach", other: "Team official" } as const;
const reasonNames = { weather: "weather", lightning: "lightning", crowdTrouble: "crowd trouble", notEnoughPlayers: "not enough players", other: "other reasons" } as const;

function describeEvent(match: Match, event: MatchEvent, onSide = false, stoppingClock = false) {
    // The team on its color, as on the scoreboard, then its name; on the timeline's sides (WEB-24)
    // the side says which team, so the name is only read out.
    const team = (side: "home" | "away") => onSide
        ? <span className="visually-hidden"> {teamName(match[side], side)}</span>
        : <span className="event-team"><TeamBadge teams={match} side={side} small /><strong>{teamName(match[side], side)}</strong></span>;
    const number = (n?: number) => (n ? ` #${n}` : "");
    switch (event.type) {
        case "goal":
            return <>{goalTypeNames[event.goalType ?? "goal"]} {team(event.team)}{number(event.player)}</>;
        case "caution":
        case "secondCaution":
        case "sendOff": {
            const label = { caution: "Caution", secondCaution: "Second caution, sent off", sendOff: "Sent off" }[event.type];
            const who = event.offender.kind === "player" ? number(event.offender.number) : ` ${officialNames[event.offender.role]}`;
            return <>{label} {team(event.team)}{who}{event.misconduct && <span className="chip code">{event.misconduct.code}</span>}</>;
        }
        case "sinBin":
        case "secondSinBin": {
            // EVT-12: "Sin bin #7 · 10 min"; a second for the same player is a send-off, as a second caution is, so no length.
            const who = event.offender.kind === "player" ? number(event.offender.number) : ` ${officialNames[event.offender.role]}`;
            const length = event.type === "sinBin" && <span className="muted"> · {sinBinLength(event.lengthSec)}</span>;
            return <>{event.type === "sinBin" ? "Sin bin" : "Second sin bin, sent off"} {team(event.team)}{who}{length}{event.misconduct && <span className="chip code">{event.misconduct.code}</span>}</>;
        }
        case "stoppage":
            // TMR-15: a stopping clock's stoppage added nothing: the clock stood still.
            return <span className="muted">{stoppingClock ? "Clock stopped" : "Stoppage"}, {Math.floor(event.lengthSec / 60)}:{String(event.lengthSec % 60).padStart(2, "0")}{stoppingClock ? "" : " added"}</span>;
        case "injury":
            return <>Injury {team(event.team)}{number(event.player)}{event.lengthSec ? <span className="muted"> · play stopped {Math.round(event.lengthSec / 60)} min</span> : null}</>;
        case "clockAdjusted":
            // TMR-14.
            return <span className="muted">{clockAdjustedWords(event)}</span>;
        case "suspension":
            // TMR-13: "Suspended 34:12 · Lightning", as on the phones.
            return <>{suspensionWords(event)}{event.note && <span className="muted"> · {event.note}</span>}</>;
        case "abandonment":
            return <strong>Match abandoned ({reasonNames[event.reason]})</strong>;
        default:
            return null;
    }
}
