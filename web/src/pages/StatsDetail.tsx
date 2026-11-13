import { type GamesQuery, misconductDescription } from "@lawfive/schema";
import { type CSSProperties, type MouseEvent, type ReactNode, useState } from "react";
import { Link } from "react-router";
import type { Stats as StatsData } from "../api.ts";
import { BoardColumns, HeadToHead, SlantBars } from "../components/boardCharts.tsx";
import { DataTable, useWidth } from "../components/charts.tsx";
import { DataToggle, Slab, SlabFigure as Figure, figureAndUnit } from "../components/Slab.tsx";
import { bandNames, speedRange } from "../components/TrackSection.tsx";
import { CardShape, FromLink, Icon, lessMotion } from "../components/ui.tsx";
import { formatDistance, formatDuration, formatShortDay, formatShortDistance, formatSpeed, formatTemperature, genderNames, money, roleNames } from "../format.ts";
import type { SettingsValues } from "../settings.ts";
import { type AgeGroupRow, ageGroupRows, axisTicks, busiestGrid, lightStep, percentFigure, ranks, ringFullPerHour, ringShare, runningStretches, shares, spacedLabels } from "../stats.ts";
import { formatWind } from "../weather.ts";

// Stats' In detail (STAT-3, STAT-6 to STAT-10, STAT-15; WEB-24's broadcast stats package), in
// three parts with a small nav: The running (distance by role head to head, longest v shortest as a
// tale of the tape, the running total as a track, fitness as a tracking graphic, your watches), The
// fixtures (busiest times as lit tiles, where as a ranked chalk panel, the weather and temperature,
// the records) and The games (by age group, added time, the misconduct codes, the referees you work
// with as name straps, year by year). Every graphic has its numbers in a table (STAT-3).

export interface CardProps {
    stats: StatsData;
    settings: SettingsValues;
    games: (slice?: Partial<GamesQuery>) => string;
}

export const percent = (part: number, whole: number) => `${whole ? Math.round((part / whole) * 100) : 0}%`;
/** So many a game: one decimal from 1, two under it ("0.8", "0.08"). */
export const rate = (n: number, games: number) => {
    const r = games ? n / games : 0;
    return r >= 1 || r === 0 ? r.toFixed(1) : r.toFixed(2).replace(/0$/, "");
};
/** "1:05", minutes and seconds. */
export const minSec = (sec: number) => `${Math.floor(Math.round(sec) / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
export const monthYear = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
export const monthDate = (month: string) => new Date(`${month}-15T12:00:00`);
/** Metres in the user's unit, so axes step in round miles or kilometres. */
const inUnit = (metres: number, unit: "km" | "mi") => metres / (unit === "mi" ? 1609.344 : 1000);

/** In-page links that scroll smoothly (at once for anyone who asked for less motion) and move focus to where they land. */
function jumpTo(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) {
        return;
    }
    e.preventDefault();
    target.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "start" });
    target.focus({ preventScroll: true });
}

const parts = [
    { id: "the-running", title: "The running" },
    { id: "the-fixtures", title: "The fixtures" },
    { id: "the-games", title: "The games" },
];

/** In detail on the halfway line, its three parts linked from a small nav, each under a heading on the grass. */
export function InDetail(props: CardProps) {
    return (
        <>
            <div className="detail-head">
                <h2>In detail</h2>
                <nav aria-label="In detail">
                    {parts.map((p) => <a key={p.id} href={`#${p.id}`} onClick={(e) => jumpTo(e, p.id)}>{p.title}</a>)}
                </nav>
                <span className="detail-halfway" aria-hidden><span /></span>
            </div>
            <section className="detail-part" aria-labelledby="the-running">
                <h2 className="detail-title" id="the-running" tabIndex={-1}>The running</h2>
                <DistanceByRole {...props} />
                <LongestShortest {...props} />
                <DistanceOverTime {...props} />
                <Fitness {...props} />
                <Watches {...props} />
            </section>
            <section className="detail-part" aria-labelledby="the-fixtures">
                <h2 className="detail-title" id="the-fixtures" tabIndex={-1}>The fixtures</h2>
                <div className="stats-pair wide-left">
                    <Busiest {...props} />
                    <Places {...props} />
                </div>
                <div className="stats-pair">
                    <WeatherSlab {...props} />
                    <Temperatures {...props} />
                </div>
                <Records {...props} />
            </section>
            <section className="detail-part" aria-labelledby="the-games">
                <h2 className="detail-title" id="the-games" tabIndex={-1}>The games</h2>
                <ByAgeGroup {...props} />
                <div className="stats-pair">
                    <AddedTime {...props} />
                    <Misconduct {...props} />
                </div>
                <RefereeStraps {...props} />
                <Years {...props} />
            </section>
        </>
    );
}

const roleWords: Record<string, string> = { referee: "Referee", assistant: "Assistant", fourth: "Fourth official" };

/** STAT-3: the average distance a game in each role, head to head, each figure linked to those games. */
function DistanceByRole({ stats, settings, games }: CardProps) {
    const { byRole } = stats.distance;
    const unit = settings.distanceUnit;
    return (
        <Slab title="Distance by role" tag={unit === "mi" ? "Miles a game" : "Km a game"} cut className="by-role-slab" table={byRole.length > 0 && (
            <DataTable head={["Role", "Games", "Average"]} rows={byRole.map((r) => [roleWords[r.role], r.games, formatDistance(r.averageM, unit)])} />
        )}>
            {byRole.length === 0 ? <p className="slab-empty">No distances in these games yet.</p> : (
                <>
                    <div className="h2h-figures">
                        {byRole.map((r) => (
                            <Link key={r.role} to={games({ role: r.role })} className={`h2h-figure role-${r.role}`} aria-label={`${roleWords[r.role]}: ${formatDistance(r.averageM, unit)} a game, from ${r.games} ${r.games === 1 ? "game" : "games"}`}>
                                <span className="slab-label">{roleWords[r.role]}</span>
                                <Figure text={formatDistance(r.averageM, unit)} className="slab-figure big" />
                                <span className="slab-caption">{r.games} {r.games === 1 ? "game" : "games"}</span>
                            </Link>
                        ))}
                    </div>
                    <HeadToHead className="h2h-bar" parts={byRole.map((r) => ({ key: r.role, value: r.averageM, className: `role-${r.role}` }))} />
                </>
            )}
        </Slab>
    );
}

/** The longest and shortest games as a tale of the tape: the two side by side, distance, date, role and the match between them. */
function LongestShortest({ stats, settings }: CardProps) {
    const { longest, shortest, games } = stats.distance;
    if (!longest || !shortest || games < 2) {
        return null;
    }
    const unit = settings.distanceUnit;
    const role = (r?: keyof typeof roleNames) => (r ? (r === "fourth" ? "4th official" : roleNames[r]) : "—");
    const rows: [string, ReactNode, ReactNode][] = [
        ["Distance", <Figure key="l" text={formatDistance(longest.distanceM, unit)} className="slab-figure big" />, <Figure key="s" text={formatDistance(shortest.distanceM, unit)} className="slab-figure big" />],
        ["Date", formatShortDay(longest.kickoff), formatShortDay(shortest.kickoff)],
        ["Role", role(longest.role), role(shortest.role)],
        ["Match", <Link key="l" className="chart-link tape-match" to={`/matches/${longest.matchId}`}>{longest.title}</Link>, <Link key="s" className="chart-link tape-match" to={`/matches/${shortest.matchId}`}>{shortest.title}</Link>],
    ];
    return (
        <Slab title="Longest and shortest" className="tape-slab">
            <div className="tape" role="table" aria-label="Longest and shortest games">
                <div className="tape-head" role="row">
                    <span className="tape-name longest" role="columnheader">Longest</span>
                    <span className="tape-v" aria-hidden>v</span>
                    <span className="tape-name shortest" role="columnheader">Shortest</span>
                </div>
                {rows.map(([label, left, right]) => (
                    <div key={label} className="tape-row" role="row">
                        <span className="tape-cell longest" role="cell">{left}</span>
                        <span className="tape-label" role="rowheader">{label}</span>
                        <span className="tape-cell shortest" role="cell">{right}</span>
                    </div>
                ))}
            </div>
        </Slab>
    );
}

/**
 * STAT-3: the running total as one track, a stretch for each month (or year), each as long as the
 * distance in it, a notch for each game, and the total at the end of each stretch under it.
 */
function DistanceOverTime({ stats, settings }: CardProps) {
    const { overTime } = stats.distance;
    const unit = settings.distanceUnit;
    const [ref, width] = useWidth();
    if (overTime.length === 0) {
        return null;
    }
    const total = overTime[overTime.length - 1].totalM;
    const ticks = axisTicks(inUnit(total, unit));
    const top = ticks[ticks.length - 1];
    const at = (metres: number) => (inUnit(metres, unit) / top) * 100;
    const stretches = runningStretches(overTime);
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    // Labels near an end are aligned to it, so spacing counts from where each one's middle really is.
    const shownEnds = spacedLabels(stretches.map((s) => {
        const pct = at(s.totalM);
        return (pct / 100) * width + (pct > 88 ? -40 : pct < 8 ? 40 : 0);
    }), 84);
    const num = (metres: number) => figureAndUnit(formatDistance(metres, unit))[0];
    const unitWord = unit === "mi" ? "mi" : "km";
    let start = 0;
    return (
        <Slab title="Distance over time" tag="Running total" className="track-slab" table={
            <DataTable head={["Game", "Distance", "Running total"]} rows={overTime.map((d) => [formatShortDay(d.kickoff), formatDistance(d.distanceM, unit), formatDistance(d.totalM, unit)])} />
        }>
            <div className="run-track" ref={ref} role="img" aria-label={`The running total: ${stretches.map((s) => `${s.label}${s.sub ? ` ${s.sub}` : ""} +${formatDistance(s.addedM, unit)}, ${formatDistance(s.totalM, unit)} by ${formatShortDay(s.lastKickoff)}`).join("; ")}.`}>
                <div className="run-axis" aria-hidden>
                    {ticks.map((t, i) => <span key={t} style={{ left: `${(t / top) * 100}%` }}>{t}{i === ticks.length - 1 ? ` ${unitWord}` : ""}</span>)}
                </div>
                <div className="run-bar" aria-hidden>
                    {stretches.map((s, i) => {
                        const from = at(start);
                        start = s.totalM;
                        const span = at(s.totalM) - from;
                        const last = i === stretches.length - 1;
                        const words = `${s.label} +${num(s.addedM)}${last && s.key === thisMonth ? " · so far" : ""}`;
                        return (
                            <span key={s.key} className={`run-stretch${last ? " last" : ""}`} style={{ left: `${from}%`, width: `${span}%` }} title={`${s.label}${s.sub ? ` ${s.sub}` : ""}: +${formatDistance(s.addedM, unit)} in ${s.games} ${s.games === 1 ? "game" : "games"}`}>
                                {(span / 100) * width >= words.length * 7.5 + 16 && <span className="run-words">{words}</span>}
                            </span>
                        );
                    })}
                    {/* A notch at each game, where its distance ends. */}
                    {overTime.slice(0, -1).map((g, i) => <span key={i} className="run-notch" style={{ left: `${at(g.totalM)}%` }} />)}
                </div>
                <div className="run-ends" aria-hidden>
                    {stretches.map((s, i) => shownEnds[i] && (
                        <span key={s.key} className={`${i === stretches.length - 1 ? "last" : ""}${at(s.totalM) > 88 ? " end-right" : at(s.totalM) < 8 ? " end-left" : ""}`} style={{ left: `${at(s.totalM)}%` }}>
                            <b>{num(s.totalM)}{i === stretches.length - 1 ? ` ${unitWord}` : ""}</b>
                            <small>{formatShortDay(s.lastKickoff).replace(/^\w+, /, "")}</small>
                        </span>
                    ))}
                </div>
            </div>
        </Slab>
    );
}

/**
 * STAT-8: fitness as a tracking graphic: the figures, game by game, the time at each speed and in each heart-rate zone.
 * STAT-16: no distance a game here, as Distance's one figure (averageM, over every game with a distance) is the one shown.
 */
function Fitness({ stats, settings }: CardProps) {
    const { fitness } = stats;
    const unit = settings.distanceUnit;
    if (fitness.games.length === 0) {
        return null;
    }
    const avg = (list: number[]) => (list.length ? list.reduce((s, n) => s + n, 0) / list.length : 0);
    const withDistance = fitness.games.filter((g) => g.distanceM !== undefined);
    const withHeart = fitness.games.filter((g) => g.avgBpm !== undefined);
    const withSprints = fitness.games.filter((g) => g.sprints !== undefined);
    const withSpeed = fitness.games.filter((g) => g.topSpeedMps !== undefined);
    const sprints = withSprints.reduce((s, g) => s + g.sprints!, 0);
    const figures = [
        withHeart.length > 0 && { icon: "heart" as const, label: "Heart rate", text: `${Math.round(avg(withHeart.map((g) => g.avgBpm!)))} bpm`, sub: "average" },
        withSprints.length > 0 && { icon: "sprint" as const, label: "Sprints", text: rate(sprints, withSprints.length), sub: `a game · ${sprints} in all` },
        withSpeed.length > 0 && { icon: "speed" as const, label: "Top speed", text: formatSpeed(Math.max(...withSpeed.map((g) => g.topSpeedMps!)), unit), sub: "the fastest in these games" },
    ].filter((f) => f !== false);
    const n = fitness.games.length;
    return (
        <Slab title="Fitness" icon="heart" tag={`${n} ${n === 1 ? "game" : "games"} with a track`} className="fitness-slab">
            <dl className="fit-figures">
                {figures.map((f) => (
                    <div key={f.label}>
                        <dt className="slab-label"><Icon name={f.icon} size={16} />{f.label}</dt>
                        <dd><Figure text={f.text} className="slab-figure big" /><span className="mint-bar" aria-hidden /><span className="slab-caption">{f.sub}</span></dd>
                    </div>
                ))}
            </dl>
            {(withDistance.length > 1 || withHeart.length > 1) && <GameByGame games={fitness.games} unit={unit} />}
            {fitness.speedBands && fitness.speedBands.some((b) => b.sec > 0) && (
                <div className="fit-part">
                    <h3 className="slab-label">Time in speed bands</h3>
                    <ElbowBar label="Time in speed bands" items={fitness.speedBands.map((b) => ({
                        key: b.band, name: bandNames[b.band], sub: speedRange(b.band, unit, fitness.sprintKph ?? 21), sec: b.sec, className: `speed-${b.band}`,
                    }))} />
                    <DataToggle>
                        <DataTable head={["Band", "Speed", "Time", "Distance"]} rows={fitness.speedBands.map((b) => [bandNames[b.band], speedRange(b.band, unit, fitness.sprintKph ?? 21), formatDuration(b.sec), formatShortDistance(b.distanceM, unit)])} />
                    </DataToggle>
                </div>
            )}
            {fitness.zones ? fitness.zones.some((z) => z.sec > 0) && (
                <div className="fit-part">
                    <h3 className="slab-label">Heart-rate zones{fitness.maxHeartRate ? ` · max ${fitness.maxHeartRate} bpm` : ""}</h3>
                    <ElbowBar stepped label="Time in each heart-rate zone" items={fitness.zones.map((z, i) => ({
                        key: String(z.zone), name: `Zone ${z.zone}`, sec: z.sec, className: `zone-${z.zone}`,
                        sub: i + 1 < fitness.zones!.length ? `${z.fromBpm}–${fitness.zones![i + 1].fromBpm - 1} bpm` : `${z.fromBpm} bpm and up`,
                    }))} />
                    <DataToggle>
                        <DataTable head={["Zone", "Heart rate", "Time"]} rows={fitness.zones.map((z, i) => [`Zone ${z.zone}`, i + 1 < fitness.zones!.length ? `${z.fromBpm}–${fitness.zones![i + 1].fromBpm - 1} bpm` : `${z.fromBpm} bpm and up`, formatDuration(z.sec)])} />
                    </DataToggle>
                </div>
            ) : withHeart.length > 0 && (
                <p className="slab-note fit-part"><Link to="/settings#fitness" className="link">Set your maximum heart rate</Link> in Settings to see the time in each heart-rate zone.</p>
            )}
        </Slab>
    );
}

/** Time split across ordered bands: one bar to scale, the shares over it with elbows down to their parts; `stepped` raises each zone a step. */
function ElbowBar({ items, label, stepped = false }: { items: { key: string; name: string; sub: string; sec: number; className: string }[]; label: string; stepped?: boolean }) {
    const pcts = shares(items.map((b) => b.sec));
    const total = items.reduce((s, b) => s + b.sec, 0);
    let from = 0;
    const centers = items.map((b) => {
        const c = from + b.sec / total / 2;
        from += b.sec / total;
        return c * 100;
    });
    return (
        <div className={`elbow${stepped ? " stepped" : ""}`} role="img" aria-label={`${label}: ${items.map((b, i) => `${b.name} ${pcts[i]}%, ${formatDuration(b.sec)}`).join("; ")}`}>
            <ol className="elbow-labels" aria-hidden style={{ "--n": items.length } as CSSProperties}>
                {items.map((b, i) => <li key={b.key}><b>{pcts[i]}%</b><span>{b.name}</span><small>{b.sub}</small></li>)}
            </ol>
            <svg className="elbow-lines" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
                {items.map((b, i) => b.sec > 0 && (
                    <polyline key={b.key} points={`${((i + 0.5) / items.length) * 100},0 ${((i + 0.5) / items.length) * 100},8 ${centers[i]},18 ${centers[i]},24`} />
                ))}
            </svg>
            <div className="elbow-bar" aria-hidden>
                {items.map((b, i) => b.sec > 0 && <span key={b.key} className={b.className} style={{ flexGrow: b.sec, ...(stepped ? { "--step": i + 1 } : {}) } as CSSProperties} title={`${b.name}: ${formatDuration(b.sec)}, ${pcts[i]}%`} />)}
            </div>
        </div>
    );
}

/** Game by game: each game's distance as a column (the longest in mint), and its average heart rate as a line under them, on one time line. */
function GameByGame({ games, unit }: { games: StatsData["fitness"]["games"]; unit: "km" | "mi" }) {
    const [ref, width] = useWidth();
    const [hover, setHover] = useState<number>();
    const left = 36;
    const right = 8;
    const plotW = Math.max(width - left - right, 10);
    const slot = plotW / games.length;
    const bar = Math.max(1, Math.min(18, slot * 0.6));
    const x = (i: number) => left + slot * i + slot / 2;
    const hasDistance = games.some((g) => g.distanceM !== undefined);
    const hasHeart = games.some((g) => g.avgBpm !== undefined);
    const dTop = 24;
    const dHeight = hasDistance ? 120 : 0;
    const hTop = dTop + dHeight + (hasDistance ? 34 : 0);
    const hHeight = hasHeart ? 76 : 0;
    const height = hTop + hHeight + 26;
    const distances = games.map((g) => (g.distanceM === undefined ? undefined : inUnit(g.distanceM, unit)));
    const dTicks = axisTicks(Math.max(...distances.map((d) => d ?? 0), 0.1));
    const dMax = dTicks[dTicks.length - 1];
    const dy = (v: number) => dTop + dHeight - (v / dMax) * dHeight;
    const longest = distances.reduce<number>((best, d, i) => (d !== undefined && (best < 0 || d > distances[best]!) ? i : best), -1);
    const bpms = games.flatMap((g) => (g.avgBpm === undefined ? [] : [g.avgBpm]));
    const hLow = Math.floor((Math.min(...bpms, 200) - 4) / 10) * 10;
    const hHigh = Math.ceil((Math.max(...bpms, 0) + 4) / 10) * 10;
    const hTicks = hHigh - hLow > 30 ? [hLow, Math.round((hLow + hHigh) / 20) * 10, hHigh] : [hLow, hHigh];
    const hy = (v: number) => hTop + hHeight - ((v - hLow) / Math.max(hHigh - hLow, 1)) * hHeight;
    const line = games.map((g, i) => (g.avgBpm === undefined ? "" : `${i && games[i - 1].avgBpm !== undefined ? "L" : "M"}${x(i).toFixed(1)},${hy(g.avgBpm).toFixed(1)}`)).join("");
    // The month under the first game of each, as many as fit.
    const firsts = games.map((g, i) => (i === 0 || new Date(g.kickoff).getMonth() !== new Date(games[i - 1].kickoff).getMonth() ? i : -1)).filter((i) => i >= 0);
    const firstShown = spacedLabels(firsts.map(x), 40);
    const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });
    const g = hover === undefined ? undefined : games[hover];
    const unitWord = unit === "mi" ? "mi" : "km";
    return (
        <div className="fit-part">
            <div className="slab-label-row">
                <h3 className="slab-label">Game by game</h3>
                <ul className="board-legend">
                    {hasDistance && <li><span className="legend-swatch tall role-referee" />Distance, {unitWord}</li>}
                    {hasHeart && <li><span className="legend-line" />Heart rate, bpm</li>}
                </ul>
            </div>
            <div className="game-chart" ref={ref}>
                {width > 0 && (
                    <svg width={width} height={height} role="img" tabIndex={0}
                        aria-label={`Each game: ${hasDistance ? `distance from ${Math.min(...distances.filter((d) => d !== undefined).map(Number)).toFixed(1)} to ${Math.max(...distances.map((d) => d ?? 0)).toFixed(1)} ${unitWord}` : ""}${hasDistance && hasHeart ? "; " : ""}${hasHeart ? `average heart rate from ${Math.min(...bpms)} to ${Math.max(...bpms)} bpm` : ""}. Arrow keys step through the games.`}
                        onPointerMove={(e) => setHover(Math.min(games.length - 1, Math.max(0, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - left) / slot))))}
                        onPointerLeave={() => setHover(undefined)} onBlur={() => setHover(undefined)}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                                e.preventDefault();
                                setHover((h) => Math.min(games.length - 1, Math.max(0, (h ?? (e.key === "ArrowLeft" ? games.length : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
                            }
                        }}>
                        {hasDistance && dTicks.map((t) => (
                            <g key={`d${t}`}>
                                <line className="chart-grid" x1={left} x2={left + plotW} y1={dy(t)} y2={dy(t)} />
                                <text className="game-axis" x={left - 8} y={dy(t) + 4} textAnchor="end">{t}</text>
                            </g>
                        ))}
                        {hasDistance && distances.map((d, i) => d !== undefined && (
                            <rect key={i} className={`game-col${i === longest ? " longest" : ""}${hover === i ? " on" : ""}`} x={x(i) - bar / 2} y={dy(d)} width={bar} height={Math.max(dy(0) - dy(d), 1)} />
                        ))}
                        {hasDistance && longest >= 0 && <text className="game-best" x={Math.min(Math.max(x(longest), left + 16), left + plotW - 16)} y={dy(distances[longest]!) - 7} textAnchor="middle">{distances[longest]!.toFixed(1)}</text>}
                        {hasHeart && hTicks.map((t) => (
                            <g key={`h${t}`}>
                                <line className="chart-grid" x1={left} x2={left + plotW} y1={hy(t)} y2={hy(t)} />
                                <text className="game-axis" x={left - 8} y={hy(t) + 4} textAnchor="end">{t}</text>
                            </g>
                        ))}
                        {hasHeart && <path className="game-hr" d={line} />}
                        {hasHeart && slot >= 6 && games.map((gm, i) => gm.avgBpm !== undefined && <circle key={i} className="game-hr-dot" cx={x(i)} cy={hy(gm.avgBpm)} r={hover === i ? 4.5 : 3} />)}
                        {firsts.map((i, k) => firstShown[k] && (
                            <g key={i}>
                                <line className="game-month-tick" x1={x(i) - slot / 2} x2={x(i) - slot / 2} y1={dTop} y2={hTop + hHeight} />
                                <text className="game-month" x={x(i) - slot / 2 + 4} y={height - 6}>{monthName.format(new Date(games[i].kickoff))}</text>
                            </g>
                        ))}
                        {hover !== undefined && <line className="chart-crosshair" x1={x(hover)} x2={x(hover)} y1={dTop} y2={hTop + hHeight} />}
                    </svg>
                )}
                {g && hover !== undefined && (
                    <div className={`chart-tip ${x(hover) > width / 2 ? "tip-left" : "tip-right"}`} style={{ left: x(hover), top: dTop }}>
                        <strong>{formatShortDay(g.kickoff)}</strong>
                        {g.distanceM !== undefined && <div>{formatDistance(g.distanceM, unit)}</div>}
                        {g.avgBpm !== undefined && <div>{g.avgBpm} bpm average{g.maxBpm ? `, ${g.maxBpm} highest` : ""}</div>}
                        {g.sprints !== undefined && <div>{g.sprints} {g.sprints === 1 ? "sprint" : "sprints"}</div>}
                    </div>
                )}
            </div>
            <DataToggle>
                <DataTable head={["Game", "Distance", "Average heart rate", "Highest", "Sprints", "Top speed"]} rows={games.map((gm) => [
                    <Link key="g" className="chart-link" to={`/matches/${gm.matchId}`}>{formatShortDay(gm.kickoff)}</Link>,
                    gm.distanceM === undefined ? "—" : formatDistance(gm.distanceM, unit), gm.avgBpm ? `${gm.avgBpm} bpm` : "—", gm.maxBpm ? `${gm.maxBpm} bpm` : "—", gm.sprints ?? "—",
                    gm.topSpeedMps === undefined ? "—" : formatSpeed(gm.topSpeedMps, unit),
                ])} />
            </DataToggle>
        </div>
    );
}

const platformNames: Record<string, string> = { garmin: "Garmin", wearos: "Wear OS", applewatch: "Apple Watch", other: "Watch" };

/**
 * STAT-15: the watches the games were recorded on, most used first, each drawn flat with its face
 * showing the battery it used an hour as a ring (full at 30% an hour) and the figure.
 */
function Watches({ stats }: CardProps) {
    const watches = stats.watches;
    if (!watches || watches.models.length === 0) {
        return null;
    }
    const models = [...watches.models].sort((a, b) => b.games - a.games);
    return (
        <Slab title="Your watches" icon="watch" tag="Battery an hour" className="watches-slab" table={
            <DataTable head={["Watch", "Games", "With battery readings", "An hour", "A game"]} rows={models.map((m) => [
                m.name, m.games, m.batteryGames, m.drainPerHour === undefined ? "—" : `${percentFigure(m.drainPerHour)} an hour`, m.drainPerGame === undefined ? "—" : `${percentFigure(m.drainPerGame)} a game`,
            ])} />
        }>
            <ul className="watch-list">
                {models.map((m) => (
                    <li key={m.device}>
                        <WatchDrawing model={m} />
                        <div className="watch-words">
                            {/* The platform only where the name doesn't already say it (Wear OS over Galaxy Watch4,
                                not Garmin over Garmin Venu 2); kept as a blank line so the names line up. */}
                            {m.name.toLowerCase().startsWith(platformNames[m.platform].toLowerCase())
                                ? <span className="slab-label" aria-hidden="true">{" "}</span>
                                : <span className="slab-label">{platformNames[m.platform]}</span>}
                            <b className="watch-name">{m.name}</b>
                            <span className="watch-games">{m.games} {m.games === 1 ? "game" : "games"} on it</span>
                            <span className="slab-caption">{m.drainPerGame !== undefined && m.batteryGames > 0
                                ? `${percentFigure(m.drainPerGame)} a game, from ${m.batteryGames} ${m.batteryGames === 1 ? "game" : "games"}`
                                : "No battery readings yet"}</span>
                        </div>
                    </li>
                ))}
            </ul>
            <p className="slab-note watch-scale">The ring is the battery used an hour, from kickoff to full time: full at {ringFullPerHour}% an hour.</p>
        </Slab>
    );
}

/** A watch drawn flat in a real watch's grays (round, or Apple Watch's rounded square), its face the battery used an hour: a ring and the figure. */
function WatchDrawing({ model }: { model: NonNullable<StatsData["watches"]>["models"][number] }) {
    const share = ringShare(model.drainPerHour);
    const square = model.platform === "applewatch";
    const has = model.drainPerHour !== undefined && model.batteryGames > 0;
    const figure = has ? percentFigure(model.drainPerHour!) : "—";
    // The ring as one path, starting at twelve o'clock, so its dash shows the share whatever the shape.
    const ring = square
        ? roundedRing(100, 132, 108, 116, 22)
        : "M100 66 a66 66 0 1 1 0 132 a66 66 0 1 1 0 -132";
    return (
        <svg className="watch-drawing" viewBox="0 0 200 264" role="img"
            aria-label={has ? `${model.name}: ${figure} of the battery an hour${(model.drainPerHour ?? 0) > ringFullPerHour ? ", past the ring's scale" : ""}` : `${model.name}: no battery readings yet`}>
            <rect className="watch-strap" x={square ? 58 : 60} y={0} width={square ? 84 : 80} height={70} rx={10} />
            <rect className="watch-strap" x={square ? 58 : 60} y={194} width={square ? 84 : 80} height={70} rx={10} />
            {square ? (
                <>
                    <rect className="watch-button" x={172} y={88} width={12} height={34} rx={5} />
                    <rect className="watch-button" x={174} y={136} width={8} height={28} rx={3} />
                    <rect className="watch-case" x={24} y={52} width={152} height={160} rx={42} />
                    <rect className="watch-face" x={36} y={64} width={128} height={136} rx={32} />
                </>
            ) : (
                <>
                    <rect className="watch-button" x={180} y={96} width={12} height={24} rx={4} />
                    <rect className="watch-button" x={180} y={144} width={12} height={24} rx={4} />
                    <rect className="watch-button" x={8} y={120} width={12} height={24} rx={4} />
                    <circle className="watch-case" cx={100} cy={132} r={86} />
                    <circle className="watch-face" cx={100} cy={132} r={76} />
                </>
            )}
            <path className="watch-track" d={ring} pathLength={100} />
            {share > 0 && <path className="watch-ring" d={ring} pathLength={100} strokeDasharray={`${share * 100} 100`} />}
            <text className="watch-figure" x={100} y={has ? 140 : 144} textAnchor="middle">{figure}</text>
            <text className="watch-unit" x={100} y={has ? 162 : 166} textAnchor="middle">{has ? "AN HOUR" : "NO READINGS"}</text>
        </svg>
    );
}

/** A rounded rectangle's outline from the middle of its top, clockwise: for Apple Watch's ring. */
function roundedRing(cx: number, cy: number, w: number, h: number, r: number): string {
    const [x0, y0, x1, y1] = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    return `M${cx} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z`;
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayNamesFull = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hourName = (h: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2026, 0, 1, h));

/** STAT-3: the busiest times as a fixtures grid of lit tiles, the kickoff hours across (turned on a narrow slab: the days across, as on the phones). */
function Busiest({ stats }: CardProps) {
    const grid = busiestGrid(stats.busiest);
    if (grid.hours.length === 0) {
        return null;
    }
    const days = [0, 1, 2, 3, 4, 5, 6];
    const cell = (day: number, hour: number) => {
        const n = grid.games(day, hour);
        const step = lightStep(n, grid.max);
        return <span key={`${day}:${hour}`} className={step ? `busy-tile busy-${step}` : "busy-dot"} title={`${dayNamesFull[day]} ${hourName(hour)}: ${n} ${n === 1 ? "game" : "games"}`}>{n > 0 ? n : ""}</span>;
    };
    return (
        <Slab title="Busiest times" tag="Games by kickoff" className="busy-slab" table={
            <DataTable head={["Day", "Kickoff", "Games"]} rows={stats.busiest.map((b) => [dayNamesFull[b.day], hourName(b.hour), b.games])} />
        }>
            <div className={grid.hours.length > 13 ? "busy many" : "busy"} role="img" aria-label={`Games by day and kickoff hour, in each match's time zone: ${stats.busiest.map((b) => `${dayNamesFull[b.day]} ${hourName(b.hour)} ${b.games}`).join(", ")}`}>
                <div className="busy-grid busy-wide" aria-hidden style={{ "--cols": grid.hours.length } as CSSProperties}>
                    <span />
                    {grid.hours.map((h) => <span key={h} className="busy-hour">{hourName(h)}</span>)}
                    {days.map((d) => [<span key={`d${d}`} className="busy-day">{dayNames[d]}</span>, ...grid.hours.map((h) => cell(d, h))])}
                </div>
                <div className="busy-grid busy-tall" aria-hidden>
                    <span />
                    {days.map((d) => <span key={d} className="busy-day">{dayNames[d]}</span>)}
                    {grid.hours.map((h) => [<span key={`h${h}`} className="busy-hour">{hourName(h)}</span>, ...days.map((d) => cell(d, h))])}
                </div>
                <p className="busy-key" aria-hidden>Fewer{[1, 2, 3, 4, 5, 6].map((s) => <span key={s} className={`busy-${s}`} />)}More games</p>
            </div>
        </Slab>
    );
}

/** STAT-3: where, as a league table on a chalk panel: the venues and pitches with the most games, ranked, each opening its games. */
function Places({ stats, games }: CardProps) {
    const { top, pitches, venues } = stats.places;
    const most = Math.max(...top.map((p) => p.games), 1);
    const rank = ranks(top.map((p) => p.games));
    return (
        <Slab title="Where" ground="panel" tag={`${pitches} ${pitches === 1 ? "pitch" : "pitches"} · ${venues} ${venues === 1 ? "venue" : "venues"}`} className="where-slab" table={top.length > 0 && (
            <DataTable head={["Venue", "Pitch", "Games"]} rows={top.map((p) => [<FromLink key="v" to={`/venues/${p.venueId}`} className="chart-link">{p.venue}</FromLink>, p.pitch ?? "—", p.games])} />
        )}>
            {top.length === 0 ? <p className="slab-empty">These games have no venues set.</p> : (
                <ol className="league">
                    {top.map((p, i) => (
                        <li key={`${p.venueId}:${p.pitchId ?? ""}`}>
                            <span className="league-rank">{rank[i]}</span>
                            <span className="league-name">
                                <Link className="chart-link" to={games({ venueId: p.venueId, pitchId: p.pitchId ?? "none" })}>{p.venue}{p.pitch && <span className="muted"> · {p.pitch}</span>}</Link>
                                <span className="league-bar" style={{ "--share": p.games / most } as CSSProperties} aria-hidden />
                            </span>
                            <b className="league-games">{p.games}</b>
                        </li>
                    ))}
                </ol>
            )}
        </Slab>
    );
}

/** STAT-3: what the weather was like: dry against wet games as slanted bars, and the average at kickoff. */
function WeatherSlab({ stats, settings }: CardProps) {
    const { weather, games } = stats;
    return (
        <Slab title="Weather" icon="sun" tag={`${weather.games} of ${games.total} games`} className="weather-slab" table={weather.games > 0 && (
            <DataTable head={["", "Games", "Share"]} rows={[
                ["Dry", weather.games - weather.rainy, percent(weather.games - weather.rainy, weather.games)],
                ["Rain", weather.rainy, percent(weather.rainy, weather.games)],
                ...(weather.averageTemperatureC !== undefined ? [["Average at kickoff", formatTemperature(weather.averageTemperatureC, settings.temperatureUnit), ""]] : []),
            ]} />
        )}>
            {weather.games === 0 ? <p className="slab-empty">No weather for these games yet: it needs the venue or pitch on the map.</p> : (
                <>
                    <SlantBars rows={[
                        { key: "dry", label: <><Icon name="sun" size={18} />Dry</>, value: weather.games - weather.rainy, display: weather.games - weather.rainy },
                        { key: "rain", label: <><Icon name="rain" size={18} />Rain</>, value: weather.rainy, display: weather.rainy, className: "slant-mint" },
                    ]} />
                    <p className="slab-caption weather-rain-note">Rain: 1 mm or more from an hour before kickoff to the end.</p>
                    {weather.averageTemperatureC !== undefined && (
                        <div className="weather-average">
                            <span className="slab-label">Average at kickoff</span>
                            <Figure text={formatTemperature(weather.averageTemperatureC, settings.temperatureUnit)} className="slab-figure big" />
                        </div>
                    )}
                </>
            )}
        </Slab>
    );
}

/** STAT-3: games in each band of kickoff temperature, as columns to scale with their counts over them. */
function Temperatures({ stats, settings }: CardProps) {
    const f = settings.temperatureUnit === "f";
    const width = f ? 10 : 5;
    const values = stats.weather.temperaturesC.map((c) => (f ? c * 9 / 5 + 32 : c));
    if (values.length === 0) {
        return null;
    }
    const low = Math.floor(Math.min(...values) / width) * width;
    const high = Math.floor(Math.max(...values) / width) * width;
    const bands: { from: number; games: number }[] = [];
    for (let b = low; b <= high; b += width) {
        bands.push({ from: b, games: values.filter((v) => Math.floor(v / width) * width === b).length });
    }
    const name = (from: number) => (f ? `${from}s °F` : `${from}–${from + width - 1} °C`);
    return (
        <Slab title="Temperature" icon="temperature" tag={`At kickoff, ${f ? "°F" : "°C"}`} className="temperature-slab"
            table={<DataTable head={["Temperature", "Games"]} rows={bands.map((b) => [name(b.from), b.games])} />}>
            <BoardColumns label="Games by the temperature at kickoff" height={170} columns={bands.map((b) => ({
                key: String(b.from), label: f ? `${b.from}s` : `${b.from}°`, describe: `${b.games} ${b.games === 1 ? "game" : "games"} at ${name(b.from)}`,
                parts: [{ key: "games", value: b.games, className: "role-referee" }],
            }))} />
        </Slab>
    );
}

/** The weather's records, three slabs cut on the diagonal: the hottest, coldest and windiest games, each linked. */
function Records({ stats, settings }: CardProps) {
    const { hottest, coldest, windiest } = stats.weather;
    const records = [
        hottest && { key: "hottest", label: "Hottest", text: formatTemperature(hottest.temperatureC, settings.temperatureUnit), game: hottest },
        coldest && { key: "coldest", label: "Coldest", text: formatTemperature(coldest.temperatureC, settings.temperatureUnit), game: coldest },
        windiest && { key: "windiest", label: "Windiest", text: `${formatWind(windiest.windGustKph, settings.distanceUnit)} gusts`, game: windiest },
    ].filter((r) => r !== undefined);
    if (records.length === 0) {
        return null;
    }
    return (
        <section className="records" aria-label="The weather's records">
            {records.map((r) => (
                <div key={r.key} className="record board">
                    <span className="slab-label">{r.label}</span>
                    <Figure text={r.text} className="slab-figure big" />
                    <Link to={`/matches/${r.game.matchId}`} className="chart-link record-game">{formatShortDay(r.game.kickoff)} · {r.game.title}</Link>
                </div>
            ))}
        </section>
    );
}

const genderParts = [
    { key: "male" as const, label: genderNames.male, className: "gender-male" },
    { key: "female" as const, label: genderNames.female, className: "gender-female" },
    { key: "coed" as const, label: genderNames.coed, className: "gender-coed" },
    { key: "notSet" as const, label: "Not set", className: "gender-notSet" },
];

/** STAT-3, STAT-7, STAT-9: each age group's games by gender, its added time and its cards a game, a row each, side by side. */
function ByAgeGroup({ stats, games }: CardProps) {
    const rows = ageGroupRows(stats);
    if (rows.length === 0) {
        return null;
    }
    const showGames = rows.some((r) => r.games);
    const showAdded = rows.some((r) => r.addedTime);
    const showCards = rows.some((r) => r.cards);
    const usedGenders = genderParts.filter((g) => rows.some((r) => (r.games?.[g.key] ?? 0) > 0));
    const mostGames = Math.max(...rows.map((r) => r.games?.total ?? 0), 1);
    const mostAdded = Math.max(...rows.map((r) => r.addedTime?.averageSec ?? 0), 1);
    const mostCards = Math.max(...rows.map((r) => r.cards?.perGame ?? 0), 0.1);
    // A caption, not a row of tabs: "Games, added time and cards".
    const counted = [showGames && "games", showAdded && "added time", showCards && "cards"].filter((t): t is string => !!t);
    const tag = counted.length ? `${counted.length > 1 ? `${counted.slice(0, -1).join(", ")} and ${counted.at(-1)}` : counted[0]}`.replace(/^./, (c) => c.toUpperCase()) : undefined;
    const total = (r: AgeGroupRow) => r.games?.total ?? r.cards?.games;
    return (
        <Slab title="By age group" tag={tag} className="ages-slab" table={
            <DataTable head={["Age group", ...usedGenders.map((g) => g.label), ...(showGames ? ["Games"] : []), ...(showAdded ? ["Added time a period", "Periods"] : []), ...(showCards ? ["Cautions", "Send-offs", "Cards a game"] : [])]}
                rows={rows.map((r) => [
                    r.ageGroup, ...usedGenders.map((g) => r.games?.[g.key] ?? 0), ...(showGames ? [r.games?.total ?? 0] : []),
                    ...(showAdded ? [r.addedTime ? minSec(r.addedTime.averageSec) : "—", r.addedTime?.periods ?? 0] : []),
                    ...(showCards ? [r.cards?.cautions ?? 0, r.cards?.sendOffs ?? 0, r.cards ? r.cards.perGame.toFixed(1) : "—"] : []),
                ])} />
        }>
            {showGames && usedGenders.length > 1 && <ul className="board-legend ages-legend">{usedGenders.map((g) => <li key={g.key}><span className={`legend-swatch ${g.className}`} />{g.label}</li>)}</ul>}
            <div className="ages" role="table" aria-label="By age group" style={{ "--cols": [showGames, showAdded, showCards].filter(Boolean).length } as CSSProperties}>
                <div className="ages-row ages-head" role="row">
                    <span role="columnheader" className="ages-group-head"><span className="visually-hidden">Age group</span></span>
                    {showGames && <span role="columnheader" className="ages-col-head">Age groups<small>{usedGenders.length > 1 ? "Games, by gender" : "Games"}</small></span>}
                    {showAdded && <span role="columnheader" className="ages-col-head">Added time<small>A period, min:sec</small></span>}
                    {showCards && <span role="columnheader" className="ages-col-head">Discipline<small>Cards a game</small></span>}
                </div>
                {rows.map((r) => (
                    <div key={r.ageGroup} className="ages-row" role="row">
                        <span role="rowheader" className="ages-group">
                            <Link to={games({ ageGroup: r.ageGroup })} className="chart-link">{r.ageGroup}</Link>
                            {total(r) !== undefined && <small>{total(r)} {total(r) === 1 ? "game" : "games"}</small>}
                        </span>
                        {showGames && (
                            <span role="cell" className="ages-cell" data-label="Games">
                                {r.games ? (
                                    <span className="ages-bar-row">
                                        <span className="ages-bar" style={{ "--share": r.games.total / mostGames } as CSSProperties}>
                                            {usedGenders.map((g) => (r.games![g.key] > 0) && <span key={g.key} className={g.className} style={{ flexGrow: r.games![g.key] }} title={`${g.label}: ${r.games![g.key]}`} />)}
                                        </span>
                                        <b>{usedGenders.length > 1 ? usedGenders.filter((g) => r.games![g.key] > 0).map((g) => r.games![g.key]).join(" + ") : r.games.total}</b>
                                    </span>
                                ) : <span className="muted">—</span>}
                            </span>
                        )}
                        {showAdded && (
                            <span role="cell" className="ages-cell" data-label="Added time">
                                {r.addedTime ? (
                                    <span className="ages-bar-row">
                                        <span className="ages-bar" style={{ "--share": r.addedTime.averageSec / mostAdded } as CSSProperties}><span className="role-assistant" style={{ flexGrow: 1 }} /></span>
                                        <b>{minSec(r.addedTime.averageSec)}</b>
                                    </span>
                                ) : <span className="muted">—</span>}
                            </span>
                        )}
                        {showCards && (
                            <span role="cell" className="ages-cell" data-label="Cards a game">
                                {r.cards ? (
                                    <span className="ages-bar-row">
                                        <span className="ages-bar" style={{ "--share": r.cards.perGame / mostCards } as CSSProperties}>
                                            {r.cards.cautions > 0 && <span className="card-yellow" style={{ flexGrow: r.cards.cautions }} />}
                                            {r.cards.sendOffs > 0 && <span className="card-red" style={{ flexGrow: r.cards.sendOffs }} />}
                                        </span>
                                        <b>{r.cards.perGame.toFixed(1)}</b>
                                    </span>
                                ) : <span className="muted">—</span>}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </Slab>
    );
}

/** STAT-9: added time as the fourth official's board: the average a period on the dots, then the halves (or periods) head to head. */
function AddedTime({ stats }: CardProps) {
    const { addedTime } = stats;
    if (addedTime.periods === 0) {
        return null;
    }
    const twoHalves = addedTime.byPeriod.length === 2;
    const periodLabel = (p: number) => (twoHalves ? (p === 1 ? "First half" : "Second half") : `Period ${p}`);
    return (
        <Slab title="Added time" icon="timer" tag={`${addedTime.periods} periods`} className="added-slab" table={
            <DataTable head={["", "Periods", "Average"]} rows={[
                ["All", addedTime.periods, minSec(addedTime.averageSec ?? 0)],
                ...addedTime.byPeriod.map((p) => [periodLabel(p.period), p.periods, minSec(p.averageSec)]),
                ...addedTime.ageGroups.map((a) => [a.ageGroup, a.periods, minSec(a.averageSec)]),
                ...addedTime.competitions.map((c) => [c.name, c.periods, minSec(c.averageSec)]),
            ]} />
        }>
            <div className="added-board dots">
                <b className="added-figure">{minSec(addedTime.averageSec ?? 0)}</b>
                <span className="added-words">A period, on average</span>
            </div>
            {addedTime.byPeriod.length > 0 && (
                <div className={`added-periods n-${addedTime.byPeriod.length}`}>
                    <div className="added-period-figures">
                        {addedTime.byPeriod.map((p, i) => (
                            <div key={p.period} className={i % 2 ? "role-assistant" : "role-referee"}>
                                <span className="slab-label quiet">{periodLabel(p.period)}</span>
                                <b>{minSec(p.averageSec)}</b>
                            </div>
                        ))}
                    </div>
                    {twoHalves && <HeadToHead parts={addedTime.byPeriod.map((p, i) => ({ key: String(p.period), value: p.averageSec, className: i % 2 ? "role-assistant" : "role-referee" }))} />}
                </div>
            )}
            <p className="slab-note">Time played beyond each period's set length; periods more than 15 minutes over don't count.</p>
        </Slab>
    );
}

/** STAT-7: the misconduct codes used most, a dense list on a chalk panel: the card, the code and what it means, a bar and the count. */
function Misconduct({ stats }: CardProps) {
    const { codes, games } = stats.discipline;
    if (games === 0 || codes.length === 0) {
        return null;
    }
    const most = Math.max(...codes.map((c) => c.cautions + c.sendOffs), 1);
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    return (
        <Slab title="Misconduct" ground="panel" tag="Codes used most" className="codes-slab" table={
            <DataTable head={["Code", "Meaning", "Cautions", "Send-offs"]} rows={codes.map((c) => [c.misconduct.code, misconductDescription(c.misconduct) ?? "—", c.cautions, c.sendOffs])} />
        }>
            <ol className="codes">
                {codes.map((c) => {
                    const total = c.cautions + c.sendOffs;
                    return (
                        <li key={`${c.misconduct.scheme}:${c.misconduct.code}`}>
                            <span className="codes-cards" aria-hidden>{c.cautions > 0 && <CardShape colour="yellow" />}{c.sendOffs > 0 && <CardShape colour="red" />}</span>
                            <span className="codes-name">
                                <span><b>{c.misconduct.code}</b>{misconductDescription(c.misconduct) && <> · {misconductDescription(c.misconduct)}</>}</span>
                                <span className="codes-bar" style={{ "--share": total / most } as CSSProperties} aria-hidden />
                                {c.cautions > 0 && c.sendOffs > 0 && <small className="muted">{count(c.cautions, "caution", "cautions")}, {count(c.sendOffs, "send-off", "send-offs")}</small>}
                            </span>
                            <b className="codes-count" aria-label={[c.cautions && count(c.cautions, "caution", "cautions"), c.sendOffs && count(c.sendOffs, "send-off", "send-offs")].filter(Boolean).join(", ")}>{total}</b>
                        </li>
                    );
                })}
            </ol>
        </Slab>
    );
}

/** STAT-3: the referees you work with most as name straps on the grass, each as long as the games together, opening those games. */
function RefereeStraps({ stats, games }: CardProps) {
    const { top, count } = stats.referees;
    if (top.length === 0) {
        return null;
    }
    const most = Math.max(...top.map((r) => r.games), 1);
    return (
        <section className="straps-section" aria-labelledby="straps-title">
            <div className="grass-head">
                <h2 className="grass-title" id="straps-title">Referees you work with most</h2>
                <p>Games together · {count} on your crews</p>
            </div>
            <ol className="straps">
                {top.map((r) => (
                    <li key={r.refereeId ?? r.name}>
                        <Link to={games(r.refereeId ? { refereeId: r.refereeId } : { refereeName: r.name })} className="strap" style={{ "--share": r.games / most } as CSSProperties}
                            aria-label={`${r.name}: ${r.games} ${r.games === 1 ? "game" : "games"} together`}>
                            <b className="strap-count" aria-hidden>{r.games}</b>
                            <span className="strap-bar" aria-hidden><span>{r.name}</span></span>
                        </Link>
                    </li>
                ))}
            </ol>
            <DataToggle>
                <DataTable head={["Referee", "Games together"]} rows={top.map((r) => [r.refereeId ? <FromLink key="r" to={`/referees/${r.refereeId}`} className="chart-link">{r.name}</FromLink> : r.name, r.games])} />
            </DataToggle>
        </section>
    );
}

/** STAT-10: year by year, a row of figures a year on the board. */
function Years({ stats, settings }: CardProps) {
    const unit = settings.distanceUnit;
    const currency = stats.fees.currency;
    if (stats.years.length < 2) {
        return null;
    }
    return (
        <Slab title="Year by year" tag="Each year in these filters" className="years-slab">
            <ol className="years">
                {stats.years.map((y) => (
                    <li key={y.year}>
                        <b className="years-year">{y.year}</b>
                        <dl>
                            <div><dt>Games</dt><dd>{y.games}</dd></div>
                            <div><dt>As center</dt><dd>{y.asCentre}<small>{percent(y.asCentre, y.games)}</small></dd></div>
                            <div><dt>Distance</dt><dd>{y.distanceGames ? figureAndUnit(formatDistance(y.distanceM, unit))[0] : "—"}{y.distanceGames > 0 && <small>{unit === "mi" ? "mi" : "km"}</small>}</dd></div>
                            <div><dt>Referees</dt><dd>{y.referees}</dd></div>
                            <div><dt>Venues</dt><dd>{y.venues}</dd></div>
                            {currency && <div><dt>Fees</dt><dd>{money(y.feesAmount, currency)}</dd></div>}
                        </dl>
                    </li>
                ))}
            </ol>
        </Slab>
    );
}
