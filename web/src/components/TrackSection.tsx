import { type ClockStop, clockStopsOf, pitchFrame, pitchHeat, pitchTurned, playWindows, speedBandsFor, trackRules } from "@lawfive/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button, FileTrigger } from "react-aria-components";
import { Link } from "react-router";
import { type Match, type MatchRecord, type MatchTrack, type PitchOutline, type TrackSummary, request } from "../api.ts";
import { acceptedTrackTypes } from "../trackFile.ts";
import { formatDistance, formatDuration, formatShortDistance, formatSpeed, formatTime, matchMinute, periodName, sinBinLength, teamAlias, teamName, textOn } from "../format.ts";
import { type ReplayEvent, clockAt, eventsOf, positionAt, replayOf, scoreAt, timelineOf, trackTimeAt } from "../replay.ts";
import type { SettingsValues } from "../settings.ts";
import { useWidth } from "./charts.tsx";
import { PitchHeatmap } from "./PitchHeatmap.tsx";
import { type Side, endsByWayRound, endsLabel, pitchEnds } from "../pitchEnds.ts";
import { Slab, SlabFigure } from "./Slab.tsx";
import { TrackMap } from "./TrackMap.tsx";
import { Icon, TeamBadge, lessMotion } from "./ui.tsx";

// Movement and heart rate on a played match's page (TRK-5): the main figures, the track on a map
// colored by speed, the heart rate through the match with the periods shaded, time in each speed
// band and heart-rate zone (each bar doubles as its legend and table), and each period's figures.
// Every figure comes from the server (TRK-3); the map's colors use the same steps. The map can
// replay the match (TRK-10), and the heart-rate chart and the replay follow each other. A heatmap
// shows where on the pitch the time went (TRK-9), and the pitch can be put right on the map.

const speeds = [10, 30, 60, 120];
const eventNames: Record<ReplayEvent["event"]["type"], string> = { goal: "Goal", caution: "Caution", secondCaution: "Second caution", sendOff: "Send-off", sinBin: "Sin bin", secondSinBin: "Second sin bin" };
const bannerTitles: Record<ReplayEvent["event"]["type"], string> = { goal: "Goal", caution: "Yellow card", secondCaution: "Second yellow", sendOff: "Red card", sinBin: "Sin bin", secondSinBin: "Second sin bin" };
const goalTypes: Record<string, string> = { penalty: "Penalty", ownGoal: "Own goal", directFreeKick: "Free kick" };
/** How long the replay holds on a goal or card, its banner showing (TRK-10). */
const pauseMs: Record<ReplayEvent["event"]["type"], number> = { goal: 3000, caution: 2000, secondCaution: 2000, sendOff: 2000, sinBin: 2000, secondSinBin: 2000 };

export const bandNames: Record<string, string> = { walking: "Walking", jogging: "Jogging", running: "Running", highSpeed: "High speed", sprinting: "Sprinting" };

/**
 * Each period's stretch of the track, in milliseconds after its start, a period suspended part way in two
 * (TMR-13) as the figures have it (schema's playWindows); the whole track without period times.
 */
export function periodWindows(track: MatchTrack, record: MatchRecord) {
    return playWindows(track, record.periods);
}

export function TrackSection({ match, record, track, summary, pitch, settings, onReplace, readOnly }: {
    match: Match;
    record: MatchRecord;
    track: MatchTrack;
    summary: TrackSummary;
    /** The track's pitch, or one found from it (TRK-9). */
    pitch?: PitchOutline;
    settings: SettingsValues;
    /** A new activity file to replace the track with (TRK-8). */
    onReplace?: (file: File) => void;
    /** On a shared match's page (DATA-7): nothing to change, and nothing to set in Settings. */
    readOnly?: boolean;
}) {
    const windows = useMemo(() => periodWindows(track, record), [track, record]);
    const { total } = summary;
    const unit = settings.distanceUnit;
    const hasGps = total.distanceM !== undefined;
    const hasHeart = total.avgBpm !== undefined;
    const minutes = (from: number) => (from - (Number.isFinite(windows[0].from) ? windows[0].from : 0)) / 60_000;

    // The replay (TRK-10): a position along the timeline (periods back to back), or none until it's
    // started; the heart-rate chart's crosshair shows a moment too while the replay isn't playing.
    const start = Date.parse(track.start);
    const { sprintKph } = summary;
    const replay = useMemo(() => replayOf(track, sprintKph), [track, sprintKph]);
    const timeline = useMemo(() => timelineOf(track, windows), [track, windows]);
    const events = useMemo(() => eventsOf(record, windows, start), [record, windows, start]);
    // TMR-15: a stopping clock's minute stands still through its stops.
    const clockStops = useMemo(() => clockStopsOf(record), [record]);
    const [position, setPosition] = useState<number>();
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(30);
    const [chartAt, setChartAt] = useState<number>();
    const [fullscreen, setFullscreen] = useState(false);
    const cursor = (!playing && chartAt !== undefined) ? chartAt : position === undefined ? undefined : trackTimeAt(timeline, position);
    const stops = useMemo(() => events.map((e) => ({ at: positionAt(timeline, e.t), ms: pauseMs[e.event.type] })), [events, timeline]);
    usePlayback(playing, speed, timeline.length, setPosition, stops);
    useEffect(() => {
        if (playing && position !== undefined && position >= timeline.length) {
            setPlaying(false);
        }
    }, [playing, position, timeline.length]);
    useEffect(() => {
        if (!fullscreen) {
            return;
        }
        const close = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
        document.addEventListener("keydown", close);
        document.body.classList.add("no-scroll");
        return () => {
            document.removeEventListener("keydown", close);
            document.body.classList.remove("no-scroll");
        };
    }, [fullscreen]);

    // TRK-9: adjusting the pitch on the map, then saving it (or going back to the one found).
    const client = useQueryClient();
    const [adjusting, setAdjusting] = useState<PitchOutline>();
    const savePitch = useMutation({
        mutationFn: (marked: PitchOutline | null) => marked
            ? request("PUT", `/match-records/${record.id}/track/pitch`, { corners: marked.corners, centre: marked.centre })
            : request("DELETE", `/match-records/${record.id}/track/pitch`),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ["track", record.id] }), client.invalidateQueries({ queryKey: ["stats"] })]);
            setAdjusting(undefined);
        },
    });
    // The map is above the heatmap, maybe off screen: take the user to it, with its handles showing.
    const mapCard = useRef<HTMLDivElement>(null);
    const startAdjusting = () => {
        setPlaying(false);
        setPosition(undefined);
        setAdjusting(pitch);
        requestAnimationFrame(() => mapCard.current?.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "center" }));
    };

    const moment = cursor === undefined ? undefined : replay.at(cursor);
    const zoneFrom = summary.maxHeartRate ? trackRules.zoneFrom.map((share) => share * summary.maxHeartRate!) : [];
    const zone = moment?.bpm === undefined ? -1 : zoneFrom.findLastIndex((from) => moment.bpm! >= from);
    const clock = cursor === undefined ? undefined : clockAt(match, windows, cursor, clockStops);
    const score = cursor === undefined ? undefined : scoreAt(events, cursor);
    // The latest goal or card, for a few seconds after the replay passes it. While playing, its
    // banner shows only while the replay holds on it, so it's gone as the marker moves on.
    const latest = cursor === undefined ? undefined : events.filter((e) => e.t <= cursor && cursor - e.t <= Math.max(60_000, speed * 2500)).at(-1);
    const holding = position !== undefined && stops.some((s) => s.at === position);
    const recent = playing && !holding ? undefined : latest;
    const describeEvent = (e: ReplayEvent) => {
        const side = e.event.team;
        return `${eventNames[e.event.type]} · ${clockAt(match, windows, e.t, clockStops)?.split(" · ")[0] ?? ""} · ${teamAlias(match, side)}`;
    };
    const goal = recent?.event.type === "goal";
    const [speedValue, speedUnit] = moment?.speedMps === undefined || moment.noGps ? ["—", unit === "mi" ? "mph" : "km/h"] : formatSpeed(moment.speedMps, unit).split(" ");
    const overlay = cursor !== undefined && (
        <div className="replay-panel">
            <div className="replay-panel-top">
                <span className="replay-clock">{clock ?? "Break"}</span>
                {score && <span className={`replay-score${goal ? " flash" : ""}`}>{teamAlias(match, "home")} {score.home}–{score.away} {teamAlias(match, "away")}</span>}
            </div>
            <div className="replay-figures">
                {track.heartRate && (
                    <div>
                        <span className="replay-big">{moment?.bpm ?? "—"}</span><span className="replay-unit">bpm</span>
                        {zone >= 0 && <span className="replay-zone"><span className={`band-swatch zone-${zone + 1}`} />Zone {zone + 1}</span>}
                    </div>
                )}
                <div><span className="replay-big">{speedValue}</span><span className="replay-unit">{speedUnit}</span></div>
            </div>
            {moment && (moment.noGps || !moment.position) && <div className="replay-nogps">No GPS here</div>}
        </div>
    );
    const banner = recent && (() => {
        const e = recent.event;
        const side = e.team;
        const team = side === "home" ? match.home : match.away;
        const kit = e.type === "goal" ? team.colour : undefined;
        const goalType = e.type === "goal" && e.goalType && e.goalType !== "goal" ? goalTypes[e.goalType] : undefined;
        return (
            // A goal in the team's color; a team without one keeps the page's own box, with a brand edge.
            <div key={`${e.type}-${recent.t}`} className={`replay-banner banner-${e.type}${kit ? " banner-kit" : ""}`} role="status"
                style={kit ? { background: kit, color: textOn(kit) } : undefined}>
                <div className="banner-title">{bannerTitles[e.type]}</div>
                <div className="banner-team">{!kit && <TeamBadge teams={match} side={side} small />}{teamName(team, side)}{goalType && <span className="muted"> · {goalType}</span>}</div>
                <div className="banner-detail">
                    {e.type === "goal" && score && <strong>{teamAlias(match, "home")} {score.home} – {score.away} {teamAlias(match, "away")}</strong>}
                    {/* EVT-12: a sin bin's says how long the player is off; a second sin bin is a send-off, so none. */}
                    <span className="muted">{[clockAt(match, windows, recent.t, clockStops)?.split(" · ")[0], e.type === "sinBin" && sinBinLength(e.lengthSec)].filter(Boolean).join(" · ")}</span>
                </div>
            </div>
        );
    })();

    const figures = [
        hasGps && { label: "Distance", value: formatDistance(total.distanceM!, unit) },
        hasGps && { label: "Top speed", value: formatSpeed(total.topSpeedMps!, unit) },
        hasGps && { label: "Sprints", value: String(total.sprints), sub: `${speedRange("sprinting", unit, sprintKph).replace(" and up", " or faster")}, 2 s or more` },
        hasHeart && { label: "Average heart rate", value: `${total.avgBpm} bpm` },
        hasHeart && { label: "Highest heart rate", value: `${total.maxBpm} bpm` },
    ].filter((f) => f !== false);

    return (
        <section className="section">
            <div className="section-head">
                <h2>Your track</h2>
                {onReplace && (
                    <FileTrigger acceptedFileTypes={acceptedTrackTypes} onSelect={(files) => files?.[0] && onReplace(files[0])}>
                        <Button className="btn btn-ghost"><Icon name="upload" />Replace from a file</Button>
                    </FileTrigger>
                )}
            </div>
            {/* WEB-28: the track's figures on a slab cut on the diagonal, the first (the distance) huge, the rest in cells. */}
            <Slab title="The running" icon="sprint" tag={summary.covers === "track" ? "Whole recording" : "Playing time only"} cut level={3} className="track-slab">
                <dl className="track-figures">
                    {figures.map((f, i) => (
                        <div key={f.label} className={i === 0 ? "track-lead" : "slab-cell"}>
                            <dt className={i === 0 ? "slab-label" : "slab-label quiet"}>{f.label}</dt>
                            <dd>
                                <SlabFigure text={f.value} className={i === 0 ? "slab-figure huge" : "slab-figure"} />
                                {i === 0 && <span className="mint-bar" aria-hidden />}
                                {f.sub && <span className="slab-caption">{f.sub}</span>}
                            </dd>
                        </div>
                    ))}
                </dl>
                {summary.covers === "track" && (
                    <p className="slab-note">This match report has no period start times, so the figures cover the whole recording, breaks included.</p>
                )}
            </Slab>

            <div className="two-col track-cols">
                {track.gps && hasGps && (
                    <div ref={mapCard} className={`card${fullscreen ? " track-fullscreen" : ""}${adjusting ? " adjusting-pitch" : ""}`}>
                        {/* TRK-9: the pitch is moved on this map, so it's offered here too (the owner, 2026-11-09). */}
                        {pitch && !readOnly && !adjusting && !fullscreen ? (
                            <div className="card-title-row">
                                <h3 className="card-title">Where you went</h3>
                                <button type="button" className="link-button" onClick={startAdjusting}><Icon name="edit" size={14} />Adjust the pitch</button>
                            </div>
                        ) : <h3 className="card-title">Where you went</h3>}
                        <div className="card-body">
                            <TrackMap track={track} pitch={pitch} adjusting={adjusting && { pitch: adjusting, onChange: setAdjusting }}
                                windows={windows} sprintKph={sprintKph} moment={moment} overlay={overlay} banner={banner}
                                pulse={goal && recent ? `goal-${recent.t}` : undefined}
                                trail={position !== undefined && cursor !== undefined ? replay.trail(cursor) : undefined}
                                replaying={position !== undefined} fullscreen={fullscreen} />
                            {adjusting && (
                                <div className="pitch-adjust">
                                    <p className="muted">Drag the middle to move the pitch, the end of a goal line to turn it and set its length, and the middle of a touchline for its width.</p>
                                    <div className="row">
                                        <button type="button" className="btn btn-primary" disabled={savePitch.isPending} onClick={() => savePitch.mutate(adjusting)}>{savePitch.isPending ? "Saving…" : "Save pitch"}</button>
                                        <button type="button" className="btn" disabled={savePitch.isPending} onClick={() => setAdjusting(undefined)}>Cancel</button>
                                        {pitch?.by === "referee" && track.pitch && (
                                            <button type="button" className="btn btn-ghost" disabled={savePitch.isPending} onClick={() => savePitch.mutate(null)}>Undo my changes</button>
                                        )}
                                    </div>
                                    {savePitch.error && <p className="error">{savePitch.error.message}</p>}
                                </div>
                            )}
                            {timeline.length > 0 && !adjusting && (
                                <ReplayControls timeline={timeline} position={position} playing={playing} speed={speed} clock={clock}
                                    strip={track.heartRate && (position !== undefined || fullscreen) && (
                                        <HeartStrip track={track} timeline={timeline} position={position ?? 0} zoneFrom={zoneFrom} onSeek={setPosition} />
                                    )}
                                    events={events} describeEvent={describeEvent} kits={{ home: match.home.colour, away: match.away.colour }} fullscreen={fullscreen}
                                    onPlay={() => {
                                        if (position === undefined || position >= timeline.length) {
                                            setPosition(0);
                                        }
                                        setPlaying(!playing);
                                    }}
                                    onSeek={setPosition} onSpeed={setSpeed} onFullscreen={() => setFullscreen(!fullscreen)}
                                    onStop={() => {
                                        setPlaying(false);
                                        setPosition(undefined);
                                    }} />
                            )}
                            {!fullscreen && <BandBar label="Time at each speed" items={total.speedBands!.map((b) => ({
                                key: b.band,
                                name: bandNames[b.band],
                                className: `speed-${b.band}`,
                                sec: b.sec,
                                detail: formatShortDistance(b.distanceM, unit),
                                range: speedRange(b.band, unit, sprintKph),
                            }))} />}
                        </div>
                    </div>
                )}
                {track.heartRate && hasHeart && (
                    <div className="card">
                        <h3 className="card-title">Heart rate</h3>
                        <div className="card-body">
                            <HeartRateChart track={track} windows={windows} match={match} clockStops={clockStops} minutes={minutes} cursor={cursor}
                                onCursor={setChartAt} onPick={(t) => setPosition(positionAt(timeline, t))} />
                            {total.zones ? (
                                <BandBar label="Time in each zone" items={total.zones.map((z, i) => ({
                                    key: String(z.zone),
                                    name: `Zone ${z.zone}`,
                                    className: `zone-${z.zone}`,
                                    sec: z.sec,
                                    range: i + 1 < total.zones!.length ? `${z.fromBpm}–${total.zones![i + 1].fromBpm - 1} bpm` : `${z.fromBpm} bpm and up`,
                                }))} />
                            ) : !readOnly && (
                                <p className="muted track-note">
                                    <Link to="/settings#fitness" className="link">Set your maximum heart rate</Link> in Settings to see the time in each heart-rate zone.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {track.gps && hasGps && match.role !== "fourth" && (
                <PitchCard match={match} record={record} track={track} pitch={pitch} adjusting={!!adjusting} onAdjust={readOnly ? undefined : startAdjusting} unit={unit} />
            )}

            {summary.periods.length > 1 && (
                <div className="card track-periods">
                    <h3 className="card-title">Each period</h3>
                    <div className="card-body table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th scope="col">Period</th>
                                    {hasGps && <><th scope="col">Distance <span className="unit">{unit}</span></th><th scope="col">Top speed <span className="unit">{unit === "mi" ? "mph" : "km/h"}</span></th><th scope="col">Sprints</th></>}
                                    {hasHeart && <><th scope="col">Avg <span className="unit">bpm</span></th><th scope="col">Max <span className="unit">bpm</span></th></>}
                                </tr>
                            </thead>
                            <tbody>
                                {summary.periods.map((p) => (
                                    <tr key={p.period}>
                                        <th scope="row">{periodName(match.format, p.period)}</th>
                                        {hasGps && (p.distanceM === undefined
                                            ? <><td>—</td><td>—</td><td>—</td></>
                                            : <><td>{number(formatDistance(p.distanceM, unit))}</td><td>{number(formatSpeed(p.topSpeedMps ?? 0, unit))}</td><td>{p.sprints}</td></>)}
                                        {hasHeart && <><td>{p.avgBpm ?? "—"}</td><td>{p.maxBpm ?? "—"}</td></>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </section>
    );
}

/**
 * TRK-9: where the time went, on a drawing of the pitch, for the match or one period. A referee's
 * is turned so the first kickoff team attacks left to right when the watch recorded the kickoff
 * direction; an assistant's so their touchline is at the bottom. Not shown for a fourth official.
 */
function PitchCard({ match, record, track, pitch, adjusting, onAdjust, unit }: {
    match: Match;
    record: MatchRecord;
    track: MatchTrack;
    pitch?: PitchOutline;
    adjusting: boolean;
    /** Not on a shared match's page. */
    onAdjust?: () => void;
    /** The person's distance unit, for the pitch's size. */
    unit: "km" | "mi";
}) {
    const [period, setPeriod] = useState<number>();
    const direction = record.kickoffDirection;
    const heat = useMemo(() => {
        if (!pitch) {
            return undefined;
        }
        const frame = pitchFrame(pitch);
        const turned = pitchTurned(pitch, track, record.periods, match.role, direction);
        const grid = pitchHeat(track, record.periods, pitch, turned);
        // Who attacked from each end, each period of normal time, when the watch recorded the direction.
        return grid && { ...grid, lengthM: frame.lengthM, widthM: frame.widthM, ends: pitchEnds(match.format.periods, direction, frame.u, turned) };
    }, [track, record.periods, pitch, match.role, match.format.periods, direction]);
    const assistant = match.role === "ar1" || match.role === "ar2";
    const shown = period === undefined ? heat?.total : heat?.periods.find((p) => p.period === period)?.cells;
    // Teams change ends each period of normal time; extra time has its own toss.
    const kicker = direction && teamAlias(match, direction.team);
    // The ends name each period's teams (TRK-9), so a period's own line would say it twice.
    const attacks = assistant ? "Your touchline at the bottom"
        : !direction || period !== undefined ? undefined
        : `${kicker} kicked off attacking →`;
    const endRows = !heat?.ends.length ? undefined
        : period === undefined ? endsByWayRound(heat.ends, match.format.periods)
        : heat.ends.filter((e) => e.period === period).map((e) => ({ ...e, label: endsLabel(e.period, match.format.periods) }));
    const ends = endRows?.map((r) => ({
        label: r.label,
        left: <PitchEnd teams={match} side={r.left} toward="right" />,
        right: <PitchEnd teams={match} side={r.right} toward="left" />,
    }));
    return (
        // WEB-28: on a slab as Stats' Where on the pitch is, not cut, as each cell has its tip.
        <Slab title="Where on the pitch" tag="From above" level={3} className="track-pitch">
            {heat && heat.periods.length > 1 && (
                <div className="track-pitch-head">
                    <div className="segmented" role="group" aria-label="Period">
                        <button type="button" className={period === undefined ? "on" : ""} onClick={() => setPeriod(undefined)}>Match</button>
                        {heat.periods.map((p) => (
                            <button key={p.period} type="button" className={period === p.period ? "on" : ""} onClick={() => setPeriod(p.period)} aria-label={periodName(match.format, p.period)}>
                                {/* On phones "Period 1" is P1 and "Extra time 1" ET1, so the buttons fit; halves stay as they are. */}
                                <span className="name-long">{periodName(match.format, p.period)}</span>
                                <span className="name-short">{shortPeriodName(match.format, p.period)}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="track-pitch-body">
                {heat && shown ? (
                    <PitchHeatmap cells={shown} cols={heat.cols} rows={heat.rows} lengthM={heat.lengthM} widthM={heat.widthM} attacks={attacks} unit={unit} ends={ends}
                        label={`Where you spent ${period === undefined ? "the match" : `the ${periodName(match.format, period).toLowerCase()}`}, on the pitch`} />
                ) : (
                    <p className="muted">There's too little GPS in the periods to find the pitch.</p>
                )}
                {pitch && onAdjust && (
                    <p className="muted track-note pitch-note">
                        {pitch.by === "referee" ? "The pitch is where you marked it."
                            : pitch.by === "corners" ? "The pitch is from the corners you walked on your watch."
                            : assistant ? "The pitch was found from your touchline, on the standard diagonal, so it may be a little off, or on the other side if you ran a reverse diagonal."
                            : "The pitch was found from your track, so it may be a little off."}
                        {" "}
                        {!adjusting && <button type="button" className="link-button" onClick={onAdjust}><Icon name="edit" size={14} />Adjust it on the map</button>}
                    </p>
                )}
            </div>
        </Slab>
    );
}

/** TRK-9: a team at its end of the heatmap, its short name on its color and an arrow the way it attacked. */
function PitchEnd({ teams, side, toward }: { teams: Pick<Match, "home" | "away">; side: Side; toward: "left" | "right" }) {
    const arrow = <Icon name={toward === "right" ? "attacksRight" : "attacksLeft"} size={18} />;
    return (
        <span className="pitch-end">
            {toward === "left" && arrow}
            <TeamBadge teams={teams} side={side} />
            {toward === "right" && arrow}
            <span className="visually-hidden">attacking {toward === "right" ? "left to right" : "right to left"}</span>
        </span>
    );
}

/** A period's name where room is short: P1 to P4 and ET1, ET2; halves keep theirs. */
function shortPeriodName(format: Match["format"], period: number): string {
    if (period > format.periods) {
        return `ET${period - format.periods}`;
    }
    return format.periods === 2 ? periodName(format, period) : `P${period}`;
}

/** The number of "2.0 mi" or "11.5 mph", for a column whose header gives the unit. */
const number = (formatted: string) => formatted.split(" ")[0];

/** "7–13 km/h", in the user's unit, for their sprint speed (TRK-11). */
export function speedRange(band: string, unit: "km" | "mi", sprintKph: number): string {
    const speedBands = speedBandsFor(sprintKph);
    const i = speedBands.findIndex((b) => b.band === band);
    const convert = (kph: number) => Math.round(unit === "mi" ? kph / 1.609344 : kph);
    const label = unit === "mi" ? "mph" : "km/h";
    const from = speedBands[i].fromKph;
    const next = speedBands[i + 1]?.fromKph;
    return next === undefined ? `${convert(from)} ${label} and up` : from === 0 ? `under ${convert(next)} ${label}` : `${convert(from)}–${convert(next)} ${label}`;
}

/**
 * Moves the replay along while it plays: smoothly, or a step a second for people who've asked
 * their system for less motion. It holds for a moment on each goal and card (stops, as timeline
 * positions, each with how long), and stops at the end of the timeline.
 */
function usePlayback(playing: boolean, speed: number, length: number, setPosition: (update: (p: number | undefined) => number) => void, stops: { at: number; ms: number }[]) {
    useEffect(() => {
        if (!playing) {
            return;
        }
        let holdUntil = 0;
        const advance = (ms: number) => {
            const now = performance.now();
            if (now < holdUntil) {
                return;
            }
            setPosition((p) => {
                const from = p ?? 0;
                const next = Math.min(from + ms * speed, length);
                // Reaching a goal or card: stop on it, and hold there.
                const stop = stops.find((s) => s.at > from && s.at <= next);
                if (stop !== undefined) {
                    holdUntil = now + stop.ms;
                    return stop.at;
                }
                return next;
            });
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            const timer = setInterval(() => advance(1000), 1000);
            return () => clearInterval(timer);
        }
        let last = performance.now();
        let frame = requestAnimationFrame(function tick(now) {
            advance(Math.min(now - last, 250));
            last = now;
            frame = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(frame);
    }, [playing, speed, length, setPosition, stops]);
}

function ReplayControls({ timeline, position, playing, speed, clock, events, describeEvent, kits, fullscreen, strip, onPlay, onSeek, onSpeed, onFullscreen, onStop }: {
    timeline: ReturnType<typeof timelineOf>;
    /** The heart-rate strip, above the scrubber. */
    strip?: ReactNode;
    position: number | undefined;
    playing: boolean;
    speed: number;
    clock: string | undefined;
    events: ReplayEvent[];
    describeEvent: (e: ReplayEvent) => string;
    /** Each team's color, for its goals (TRK-15). */
    kits: { home?: string; away?: string };
    fullscreen: boolean;
    onPlay: () => void;
    onSeek: (position: number) => void;
    onSpeed: (speed: number) => void;
    onFullscreen: () => void;
    onStop: () => void;
}) {
    const percent = (t: number) => (positionAt(timeline, t) / timeline.length) * 100;
    // TRK-15: a goal in its team's color.
    const goalKit = (e: ReplayEvent) => {
        const kit = e.event.type === "goal" ? kits[e.event.team] : undefined;
        return kit ? ({ "--kit": kit } as CSSProperties) : undefined;
    };
    // Where each period after the first starts along the timeline.
    let before = 0;
    const boundaries = timeline.spans.map((s) => {
        const at = before;
        before += s.to - s.from;
        return at;
    }).slice(1);
    return (
        <div className="replay-controls">
            <div className="replay-row">
            <button type="button" className={`btn${position === undefined ? " btn-primary" : ""}`} onClick={onPlay} aria-label={playing ? "Pause the replay" : "Play the replay"}>
                <Icon name={playing ? "pause" : "play"} size={16} />{position === undefined ? "Replay" : null}
            </button>
            <div className="replay-track">
            {strip}
            <div className="replay-scrub">
                <input type="range" min={0} max={timeline.length} step={1000} value={position ?? 0} aria-label="Replay position" aria-valuetext={clock ?? "Not started"}
                    onChange={(e) => onSeek(Number(e.target.value))} />
                {boundaries.map((b) => <span key={b} className="replay-boundary" style={{ left: `${(b / timeline.length) * 100}%` }} />)}
                {events.map((e) => (
                    <button key={`${e.event.type}-${e.t}`} type="button" className={`replay-tick tick-${e.event.type}`} style={{ left: `${percent(e.t)}%`, ...goalKit(e) }}
                        title={describeEvent(e)} aria-label={`Jump to: ${describeEvent(e)}`} onClick={() => onSeek(positionAt(timeline, e.t))} />
                ))}
            </div>
            </div>
            </div>
            <div className="replay-row replay-options">
            <span className="muted replay-status" title={position === undefined ? "Plays the periods, skipping breaks" : undefined}>{position === undefined ? "Plays the periods, skipping breaks" : clock ?? "Break"}</span>
            <select className="input replay-speed" aria-label="Replay speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))}>
                {speeds.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
            {position !== undefined && <button type="button" className="btn btn-ghost" onClick={onStop} aria-label="Stop the replay">Stop</button>}
            <button type="button" className="btn btn-ghost" onClick={onFullscreen} aria-label={fullscreen ? "Leave full screen" : "Full screen"}>
                <Icon name={fullscreen ? "shrink" : "expand"} size={16} />
            </button>
            </div>
        </div>
    );
}

const strip = { height: 46, pad: 8 };

/**
 * Heart rate along the replay's timeline, small, above the scrubber (TRK-10): the zones shaded
 * behind it, the periods marked, a dot at the replay's moment; a click jumps there.
 */
function HeartStrip({ track, timeline, position, zoneFrom, onSeek }: {
    track: MatchTrack;
    timeline: ReturnType<typeof timelineOf>;
    position: number;
    zoneFrom: number[];
    onSeek: (position: number) => void;
}) {
    const [ref, width] = useWidth();
    const { t, bpm } = track.heartRate!;
    const plotWidth = Math.max(width - 2 * strip.pad, 10);
    const view = useMemo(() => {
        const n = Math.max(20, Math.floor(plotWidth / 2));
        const sums = new Array<number>(n).fill(0);
        const counts = new Array<number>(n).fill(0);
        for (const [i, time] of t.entries()) {
            if (!timeline.spans.some((s) => time >= s.from && time <= s.to)) {
                continue;
            }
            const k = Math.min(n - 1, Math.floor((positionAt(timeline, time) / timeline.length) * n));
            sums[k] += bpm[i];
            counts[k]++;
        }
        const points = sums.map((sum, k) => (counts[k] ? sum / counts[k] : undefined));
        const known = points.filter((p) => p !== undefined);
        return { n, points, lo: Math.min(...known) - 5, hi: Math.max(...known) + 5 };
    }, [t, bpm, timeline, plotWidth]);
    if (view.points.every((p) => p === undefined)) {
        return null;
    }
    const x = (k: number) => strip.pad + ((k + 0.5) / view.n) * plotWidth;
    const y = (b: number) => 3 + (1 - (b - view.lo) / (view.hi - view.lo)) * (strip.height - 6);
    let path = "";
    let pen = false;
    for (const [k, b] of view.points.entries()) {
        if (b === undefined) {
            pen = false;
            continue;
        }
        path += `${pen ? "L" : "M"}${x(k).toFixed(1)},${y(b).toFixed(1)}`;
        pen = true;
    }
    const now = Math.min(view.n - 1, Math.floor((position / timeline.length) * view.n));
    const nowBpm = view.points[now];
    let before = 0;
    const boundaries = timeline.spans.map((s) => {
        const at = before;
        before += s.to - s.from;
        return at;
    }).slice(1);
    return (
        <div className="heart-strip" ref={ref}>
            {width > 0 && (
                <svg width={width} height={strip.height} aria-hidden="true"
                    onClick={(e) => onSeek(Math.max(0, Math.min(1, (e.clientX - e.currentTarget.getBoundingClientRect().left - strip.pad) / plotWidth)) * timeline.length)}>
                    {zoneFrom.map((from, i) => {
                        const top = i + 1 < zoneFrom.length ? zoneFrom[i + 1] : view.hi;
                        const [y0, y1] = [y(Math.max(from, view.lo)), y(Math.min(top, view.hi))];
                        return y0 > y1 && <rect key={i} className={`strip-zone zone-${i + 1}`} x={strip.pad} width={plotWidth} y={y1} height={y0 - y1} />;
                    })}
                    {boundaries.map((b) => <line key={b} className="strip-boundary" x1={strip.pad + (b / timeline.length) * plotWidth} x2={strip.pad + (b / timeline.length) * plotWidth} y1={0} y2={strip.height} />)}
                    <path className="hr-line" d={path} />
                    {nowBpm !== undefined && <circle className="hr-dot" cx={x(now)} cy={y(nowBpm)} r={4} />}
                </svg>
            )}
        </div>
    );
}

export interface BandItem { key: string; name: string; className: string; sec: number; detail?: string; range: string }

/** Time split across ordered bands: one bar, with a legend below that gives every value (so it's also the table). */
export function BandBar({ label, items }: { label: string; items: BandItem[] }) {
    const [hover, setHover] = useState<BandItem>();
    const total = items.reduce((s, b) => s + b.sec, 0);
    if (total === 0) {
        return null;
    }
    return (
        <div className="band-block">
            <div className="band-label">{label}</div>
            <div className="band-bar" role="img" aria-label={`${label}: ${items.map((b) => `${b.name} ${formatDuration(b.sec)}`).join(", ")}`}>
                {items.filter((b) => b.sec > 0).map((b) => (
                    <div key={b.key} className={`band-seg ${b.className}${hover?.key === b.key ? " on" : ""}`} style={{ flexGrow: b.sec }}
                        onPointerEnter={() => setHover(b)} onPointerLeave={() => setHover(undefined)} />
                ))}
                {hover && (
                    <div className="chart-tip band-tip">
                        <strong>{formatDuration(hover.sec)}</strong> {Math.round((hover.sec / total) * 100)}%
                        <div>{hover.name}, {hover.range}</div>
                    </div>
                )}
            </div>
            <ul className="band-legend">
                {items.map((b) => (
                    <li key={b.key} className={hover?.key === b.key ? "on" : ""}>
                        <span className={`band-swatch ${b.className}`} />
                        <span className="band-name">{b.name} <span className="muted">{b.range}</span></span>
                        <span className="band-value">{formatDuration(b.sec)}{b.detail && <span className="muted"> · {b.detail}</span>}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const chart = { height: 190, top: 22, bottom: 22, left: 34, right: 8 };

/** Heart rate through the match: one line, the periods shaded and named, a crosshair that reads out any moment. */
function HeartRateChart({ track, windows, match, clockStops, minutes, cursor, onCursor, onPick }: {
    track: MatchTrack;
    windows: { period: number; from: number; to: number; played?: number }[];
    match: Match;
    /** TMR-15: where a stopping clock stood still, by period. */
    clockStops: Map<number, ClockStop[]>;
    minutes: (t: number) => number;
    /** The replay's moment, shown when the pointer isn't on the chart. */
    cursor?: number;
    /** The moment under the pointer, for the map's marker (TRK-10). */
    onCursor?: (t: number | undefined) => void;
    /** A click: start the replay from there. */
    onPick?: (t: number) => void;
}) {
    const [ref, width] = useWidth();
    const [at, setAtState] = useState<number>();
    const { t, bpm } = track.heartRate!;
    const start = Date.parse(track.start);

    const view = useMemo(() => {
        const timed = windows.filter((w) => Number.isFinite(w.from));
        // From a minute before the first kickoff to a minute after the end, within the recording.
        const x0 = Math.max(t[0], timed.length ? timed[0].from - 60_000 : t[0]);
        const x1 = Math.min(t[t.length - 1], timed.length ? timed[timed.length - 1].to + 60_000 : t[t.length - 1]);
        const plotWidth = Math.max(width - chart.left - chart.right, 10);
        // About one point every 2 pixels: each the average of the readings in its slice of time.
        const n = Math.max(20, Math.floor(plotWidth / 2));
        const slice = (x1 - x0) / n;
        const sums = new Array<number>(n).fill(0);
        const counts = new Array<number>(n).fill(0);
        for (const [i, time] of t.entries()) {
            const k = Math.floor((time - x0) / slice);
            if (k >= 0 && k < n) {
                sums[k] += bpm[i];
                counts[k]++;
            }
        }
        const points = sums.map((s, k) => (counts[k] ? { t: x0 + (k + 0.5) * slice, bpm: s / counts[k] } : undefined));
        const shown = points.filter((p) => p !== undefined).map((p) => p.bpm);
        const lo = Math.max(40, Math.floor((Math.min(...shown) - 5) / 10) * 10);
        const hi = Math.ceil((Math.max(...shown) + 5) / 10) * 10;
        return { x0, x1, points, lo, hi, plotWidth };
    }, [t, bpm, windows, width]);

    const plotHeight = chart.height - chart.top - chart.bottom;
    const x = (time: number) => chart.left + ((time - view.x0) / (view.x1 - view.x0)) * view.plotWidth;
    const y = (beats: number) => chart.top + (1 - (beats - view.lo) / (view.hi - view.lo)) * plotHeight;

    let path = "";
    let pen = false;
    for (const p of view.points) {
        if (!p) {
            pen = false;
            continue;
        }
        path += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`;
        pen = true;
    }
    const step = view.hi - view.lo > 60 ? 20 : 10;
    const yTicks: number[] = [];
    for (let v = Math.ceil(view.lo / step) * step; v <= view.hi; v += step) {
        yTicks.push(v);
    }
    // Clock times every 15 minutes (every 30 when narrow).
    const every = (width < 420 ? 30 : 15) * 60_000;
    const xTicks: number[] = [];
    for (let abs = Math.ceil((start + view.x0) / every) * every; abs <= start + view.x1; abs += every) {
        xTicks.push(abs - start);
    }

    const setAt = (k: number | undefined) => {
        setAtState(k);
        onCursor?.(k === undefined ? undefined : view.points[k]?.t);
    };
    const point = at === undefined ? undefined : view.points[at];
    // The replay's moment, as the nearest slice with readings.
    const following = at === undefined && cursor !== undefined && cursor >= view.x0 && cursor <= view.x1
        ? view.points[Math.min(view.points.length - 1, Math.floor(((cursor - view.x0) / (view.x1 - view.x0)) * view.points.length))]
        : undefined;
    const describe = (time: number): ReactNode => {
        const w = windows.find((w) => time >= w.from && time < w.to);
        if (w && w.period > 0) {
            // TMR-15: a stopping clock's minute stands still through its stops.
            return clockAt(match, [w], time, clockStops);
        }
        const clock = formatTime(new Date(start + time).toISOString());
        // TMR-13: between two stretches of the same period, play was suspended.
        const before = windows.findLast((w) => w.to <= time);
        if (before && before.period > 0 && windows.some((w) => w.period === before.period && w.from > time)) {
            return `Suspended · ${clock}`;
        }
        return windows[0].period > 0 && time < windows[0].from ? `Before kickoff · ${clock}` : windows[0].period > 0 && time >= windows[windows.length - 1].to ? `After full time · ${clock}` : windows[0].period > 0 ? `Break · ${clock}` : `${Math.round(minutes(time))} min · ${clock}`;
    };
    const pick = (clientX: number, rect: DOMRect) => {
        const k = Math.round(((clientX - rect.left - chart.left) / view.plotWidth) * view.points.length - 0.5);
        const clamped = Math.min(view.points.length - 1, Math.max(0, k));
        // The nearest slice with readings, so the crosshair never lands on a gap.
        for (let d = 0; d < view.points.length; d++) {
            for (const k2 of [clamped - d, clamped + d]) {
                if (view.points[k2]) {
                    return k2;
                }
            }
        }
        return undefined;
    };

    return (
        <div className="hr-chart" ref={ref}>
            {width > 0 && (
                <svg width={width} height={chart.height} role="img" tabIndex={0}
                    aria-label={`Heart rate from ${Math.round(Math.min(...view.points.filter((p) => p).map((p) => p!.bpm)))} to ${Math.round(Math.max(...view.points.filter((p) => p).map((p) => p!.bpm)))} bpm`}
                    onPointerMove={(e) => setAt(pick(e.clientX, e.currentTarget.getBoundingClientRect()))}
                    onClick={() => point && onPick?.(point.t)}
                    onPointerLeave={() => setAt(undefined)}
                    onBlur={() => setAt(undefined)}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                            e.preventDefault();
                            const from = at ?? (e.key === "ArrowLeft" ? view.points.length : -1);
                            const dir = e.key === "ArrowLeft" ? -1 : 1;
                            let k = from + dir;
                            while (k >= 0 && k < view.points.length && !view.points[k]) {
                                k += dir;
                            }
                            if (k >= 0 && k < view.points.length) {
                                setAt(k);
                            }
                        }
                    }}>
                    {windows.filter((w) => w.period > 0).map((w, i, all) => {
                        const [left, right] = [Math.max(x(w.from), chart.left), Math.min(x(w.to), chart.left + view.plotWidth)];
                        // TMR-13: a period suspended part way is two bands, named once.
                        const first = all.findIndex((o) => o.period === w.period) === i;
                        return right > left && (
                            <g key={`${w.period}:${w.from}`}>
                                <rect className="hr-period" x={left} y={chart.top} width={right - left} height={plotHeight} />
                                {first && right - left > 64 && <text className="chart-label" x={left + 4} y={chart.top - 7}>{periodName(match.format, w.period)}</text>}
                            </g>
                        );
                    })}
                    {yTicks.map((v) => (
                        <g key={v}>
                            <line className="chart-grid" x1={chart.left} x2={chart.left + view.plotWidth} y1={y(v)} y2={y(v)} />
                            <text className="chart-label" x={chart.left - 6} y={y(v) + 4} textAnchor="end">{v}</text>
                        </g>
                    ))}
                    {xTicks.map((tick) => (
                        <text key={tick} className="chart-label" x={x(tick)} y={chart.height - 6} textAnchor="middle">{formatTime(new Date(start + tick).toISOString())}</text>
                    ))}
                    <path className="hr-line" d={path} />
                    {point && (
                        <>
                            <line className="chart-crosshair" x1={x(point.t)} x2={x(point.t)} y1={chart.top} y2={chart.top + plotHeight} />
                            <circle className="hr-dot" cx={x(point.t)} cy={y(point.bpm)} r={4} />
                        </>
                    )}
                    {!point && cursor !== undefined && cursor >= view.x0 && cursor <= view.x1 && (
                        <>
                            <line className="chart-crosshair" x1={x(cursor)} x2={x(cursor)} y1={chart.top} y2={chart.top + plotHeight} />
                            {following && <circle className="hr-dot" cx={x(cursor)} cy={y(following.bpm)} r={4} />}
                        </>
                    )}
                </svg>
            )}
            {point && (
                <div className={`chart-tip ${x(point.t) > width / 2 ? "tip-left" : "tip-right"}`} style={{ left: x(point.t), top: chart.top + 4 }}>
                    <strong>{Math.round(point.bpm)} bpm</strong>
                    <div>{describe(point.t)}</div>
                </div>
            )}
        </div>
    );
}
