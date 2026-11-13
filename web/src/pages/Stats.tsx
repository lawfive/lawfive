import type { GamesQuery } from "@lawfive/schema";
import { type CSSProperties, useId, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { type Stats as StatsData, type StatsQuery, useStats } from "../api.ts";
import { DataTable, StackedColumns, type Series } from "../components/charts.tsx";
import { BoardColumns, HeadToHead, SlantBars } from "../components/boardCharts.tsx";
import { PitchHeatmap } from "../components/PitchHeatmap.tsx";
import { DataToggle, Slab, figureAndUnit } from "../components/Slab.tsx";
import { CardShape, CountUp, Icon, PageHead } from "../components/ui.tsx";
import { formatDistance, genderNames, money, roleNames, surname } from "../format.ts";
import { gamesLink } from "../games.ts";
import { useSettings } from "../settings.ts";
import { pitchThirds } from "../stats.ts";
import { type CardProps, InDetail, monthDate, monthYear, percent, rate } from "./StatsDetail.tsx";

// The Stats tab (STAT-1 to STAT-15), in the broadcast stats package (WEB-24, the owner's choice on
// 2026-11-08): the filters on one board (kept in the address), the games as a huge chalk figure, the
// roles as slabs as long as their counts, the distance on a slab cut on the diagonal, the cards
// rising out of a slab, the fees, the games a month as lamps, who you work with most as a name strap,
// a ticker of the small figures and where on the pitch; then In detail (StatsDetail.tsx). All from
// GET /v1/stats for the filters chosen. Roles, months, venues, referees and age groups link to the
// match list showing just those games (STAT-11); Export downloads them as CSV (STAT-12).

/** A date as YYYY-MM-DD, by the browser's calendar. */
function isoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The filters in the address, as the API's query (STAT-1, STAT-5). */
function useFilters() {
    const [params, setParams] = useSearchParams();
    const when = params.get("when") ?? "all";
    const set = (changes: Record<string, string | undefined>) => {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === "") {
                next.delete(key);
            } else {
                next.set(key, value);
            }
        }
        setParams(next, { replace: true });
    };
    const query: StatsQuery = {};
    if (when === "12m") {
        const start = new Date();
        start.setFullYear(start.getFullYear() - 1);
        start.setDate(start.getDate() + 1);
        query.from = isoDate(start);
    } else if (/^\d{4}$/.test(when)) {
        query.from = `${when}-01-01`;
        query.to = `${when}-12-31`;
    } else if (when === "custom") {
        query.from = params.get("from") || undefined;
        query.to = params.get("to") || undefined;
    }
    const gender = params.get("gender");
    if (gender === "male" || gender === "female" || gender === "coed") {
        query.gender = gender;
    }
    const role = params.get("role");
    if (role === "referee" || role === "assistant" || role === "fourth") {
        query.role = role;
    }
    for (const [param, key] of [["competition", "competitionId"], ["tag", "tag"], ["venue", "venueId"]] as const) {
        const value = params.get(param);
        if (value) {
            query[key] = value;
        }
    }
    return { when, query, set, from: params.get("from") ?? "", to: params.get("to") ?? "" };
}

export function Stats() {
    const filters = useFilters();
    const stats = useStats(filters.query);
    const { settings } = useSettings();
    const data = stats.data;
    const exportParams = new URLSearchParams(Object.entries(filters.query).filter((e): e is [string, string] => e[1] !== undefined));
    /** The match list for these filters, narrowed to a slice. */
    const games = (slice: Partial<GamesQuery> = {}) => gamesLink({ ...filters.query, ...slice });
    const props: CardProps = { stats: data!, settings, games };

    return (
        <>
            <PageHead title="Stats" hero sub={data ? describeRange(data) : !stats.isError && <span className="placeholder-bar placeholder-appear page-sub-placeholder" />} actions={data && data.games.total > 0 && (
                <a className="btn" href={`/v1/stats/games.csv${exportParams.size ? `?${exportParams}` : ""}`} download><Icon name="download" />Export CSV</a>
            )} />
            {data && <Filters stats={data} filters={filters} />}
            {!data && !stats.isError && <StatsPlaceholder />}
            {stats.isError && <p className="error">Couldn't load the stats.</p>}
            {data && data.games.total === 0 && (
                <div className="card empty" style={{ marginTop: 16 }}>
                    {data.options.years.length ? "No games match these filters." : "Stats appear here once you've refereed some matches."}
                </div>
            )}
            {data && data.games.total > 0 && (
                // While new filters load, the last figures stay up, faded (WEB-8).
                <div className={stats.isPlaceholderData ? "stats-body loading" : "stats-body"} aria-busy={stats.isPlaceholderData || undefined}>
                    <div className="stats-open">
                        <Headline {...props} />
                        <RoleSlabs {...props} />
                    </div>
                    <DistanceSlab {...props} />
                    <CardsShown {...props} />
                    <FeesSlab {...props} />
                    <div className="stats-pair wide-left months-pair">
                        <MonthsSlab {...props} />
                        <MostWith {...props} />
                    </div>
                    <Ticker {...props} period={periodName(filters.when)} />
                    <WhereOnThePitch {...props} />
                    <InDetail {...props} />
                </div>
            )}
        </>
    );
}

/** The filters board, the headline and the first slabs as faint shapes while the stats first load (WEB-8). */
function StatsPlaceholder() {
    const sweep = (i: number) => ({ "--i": i }) as CSSProperties;
    return (
        <div className="placeholder-appear" role="status" aria-label="Loading the stats">
            <div className="board stats-filters stats-filters-placeholder" aria-hidden>
                <span className="placeholder-bar segmented-placeholder" />
                <span className="placeholder-bar segmented-placeholder" />
            </div>
            <div className="stats-open" aria-hidden>
                <div className="headline-placeholder"><span className="placeholder-bar" style={{ width: "50%" }} /><span className="placeholder-bar hero-placeholder" /></div>
                <div className="board stats-board-placeholder sweep" style={sweep(0)}>
                    <span className="placeholder-bar" style={{ width: "30%" }} />
                    <span className="placeholder-bar value-placeholder" />
                    <span className="placeholder-bar value-placeholder" />
                </div>
            </div>
            {[1, 2].map((i) => (
                <div key={i} className="board stats-board-placeholder slab-placeholder sweep" style={sweep(i)} aria-hidden>
                    <span className="placeholder-bar" style={{ width: "24%" }} />
                    <span className="placeholder-bar chart-placeholder" />
                </div>
            ))}
        </div>
    );
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const dayOf = (d: string) => dayFormat.format(new Date(`${d}T12:00:00`));

/** "38 games · Aug 16 – Nov 9, 2026 · 1 abandoned" under the title. */
function describeRange(stats: StatsData): string {
    const { total, first, last, abandoned } = stats.games;
    const games = `${total} ${total === 1 ? "game" : "games"}`;
    return [games, first && last && (first === last ? dayOf(first) : dayFormat.formatRange(new Date(`${first}T12:00:00`), new Date(`${last}T12:00:00`))), abandoned > 0 && `${abandoned} abandoned`]
        .filter(Boolean).join(" · ");
}

/** What the filters cover, for the ticker's tab. */
function periodName(when: string): string {
    return when === "all" ? "All time" : when === "12m" ? "Last 12 months" : /^\d{4}$/.test(when) ? when : "These dates";
}

/** STAT-1, STAT-5: the filters on one board, each with its small label; on a phone the labels sit over their controls. */
function Filters({ stats, filters }: { stats: StatsData; filters: ReturnType<typeof useFilters> }) {
    const { when, set, query } = filters;
    const id = useId();
    const choices: [string, string][] = [["all", "All time"], ["12m", "Last 12 months"], ...stats.options.years.map((y): [string, string] => [String(y), String(y)]), ["custom", "Custom"]];
    return (
        <section className="board stats-filters" aria-label="Filters">
            <div className="filter-row">
                <div className="filter filter-when">
                    <span className="filter-label" id={`${id}-when`}>When</span>
                    <div className="segmented when-segmented" role="group" aria-labelledby={`${id}-when`}>
                        {choices.map(([value, label]) => (
                            <button key={value} type="button" className={when === value ? "on" : ""} aria-pressed={when === value}
                                onClick={() => set({ when: value === "all" ? undefined : value, ...(value === "custom" ? {} : { from: undefined, to: undefined }) })}>
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="filter">
                    <span className="filter-label" id={`${id}-role`}>Role</span>
                    <div className="segmented" role="group" aria-labelledby={`${id}-role`}>
                        {([[undefined, "All"], ["referee", "Referee"], ["assistant", "Assistant"], ["fourth", "Fourth"]] as const).map(([value, label]) => (
                            <button key={label} type="button" className={query.role === value ? "on" : ""} aria-pressed={query.role === value} onClick={() => set({ role: value })}>{label}</button>
                        ))}
                    </div>
                </div>
            </div>
            {when === "custom" && (
                <div className="filter-row">
                    <label className="filter"><span className="filter-label">From</span><input className="input" type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></label>
                    <label className="filter"><span className="filter-label">To</span><input className="input" type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /></label>
                </div>
            )}
            {(stats.options.genders.length > 0 || stats.options.competitions.length > 0 || stats.options.venues.length > 0 || stats.options.tags.length > 0) && (
                <div className="filter-row">
                    {stats.options.genders.length > 0 && (
                        <div className="filter">
                            <span className="filter-label" id={`${id}-gender`}>Gender</span>
                            <div className="segmented" role="group" aria-labelledby={`${id}-gender`}>
                                <button type="button" className={query.gender ? "" : "on"} aria-pressed={!query.gender} onClick={() => set({ gender: undefined })}>All</button>
                                {stats.options.genders.map((g) => (
                                    <button key={g} type="button" className={query.gender === g ? "on" : ""} aria-pressed={query.gender === g} onClick={() => set({ gender: g })}>{genderNames[g]}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {stats.options.competitions.length > 0 && (
                        <label className="filter filter-select">
                            <span className="filter-label">Competition</span>
                            <select className="input" value={query.competitionId ?? ""} onChange={(e) => set({ competition: e.target.value || undefined })}>
                                <option value="">All</option>
                                {stats.options.competitions.map((c) => <option key={c.id} value={c.id}>{c.name}{c.season ? ` (${c.season})` : ""} · {c.games}</option>)}
                            </select>
                        </label>
                    )}
                    {stats.options.venues.length > 0 && (
                        <label className="filter filter-select">
                            <span className="filter-label">Venue</span>
                            <select className="input" value={query.venueId ?? ""} onChange={(e) => set({ venue: e.target.value || undefined })}>
                                <option value="">All</option>
                                {stats.options.venues.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.games}</option>)}
                            </select>
                        </label>
                    )}
                    {stats.options.tags.length > 0 && (
                        <label className="filter filter-select">
                            <span className="filter-label">Tag</span>
                            <select className="input" value={query.tag ?? ""} onChange={(e) => set({ tag: e.target.value || undefined })}>
                                <option value="">All</option>
                                {stats.options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </label>
                    )}
                </div>
            )}
        </section>
    );
}

/** The games, a huge chalk figure on the grass with the hero offset and a mint bar under it, the dates they span over it. */
function Headline({ stats }: CardProps) {
    const { total, abandoned, first, last } = stats.games;
    const span = first && last ? (first === last ? dayOf(first) : dayFormat.formatRange(new Date(`${first}T12:00:00`), new Date(`${last}T12:00:00`))) : undefined;
    return (
        <section className="stats-headline">
            <h2>
                {span && <span className="headline-when">{span}</span>}
                <span className="headline-figure" style={{ "--digits": String(total).length } as CSSProperties}><CountUp value={total} /></span>
                <span className="mint-bar headline-bar" aria-hidden />
                <span className="headline-unit">{total === 1 ? "Game" : "Games"}<small>{abandoned ? `${abandoned} abandoned` : "all completed"}</small></span>
            </h2>
        </section>
    );
}

/**
 * STAT-3: the games by role as slabs on the grass, each as long as its count, its name on a board
 * tile and its figure after it; the assistant's split into AR1 and AR2 inside it. Each opens those
 * games (STAT-11).
 */
function RoleSlabs({ stats, games: link }: CardProps) {
    const { roles, games } = stats;
    const assistant = roles.ar1 + roles.ar2;
    const rows: { key: string; label: string; value: number; to?: string; split?: { key: string; label: string; value: number }[] }[] = [
        { key: "referee", label: "Referee", value: roles.referee, to: link({ role: "referee" }) },
        { key: "assistant", label: "Assistant", value: assistant, to: link({ role: "assistant" }), split: [{ key: "ar1", label: "AR1", value: roles.ar1 }, { key: "ar2", label: "AR2", value: roles.ar2 }] },
        { key: "fourth", label: "4th official", value: roles.fourth, to: link({ role: "fourth" }) },
        ...(roles.notSet ? [{ key: "notSet", label: "Not set", value: roles.notSet }] : []),
    ];
    const most = Math.max(...rows.map((r) => r.value), 1);
    return (
        <Slab ground="grass" title="By role" tag="Counted in games" className="role-section" table={
            <DataTable head={["Role", "Games", "Share"]} rows={(["referee", "ar1", "ar2", "fourth"] as const).map((r) => [roleNames[r], roles[r], percent(roles[r], games.total)])
                .concat(roles.notSet ? [["Not set", roles.notSet, percent(roles.notSet, games.total)]] : [])} />
        }>
            <ol className="role-slabs">
                {rows.map((r) => {
                    // The split is written inside the bar when each part has room, else under the role's name.
                    const inside = r.split !== undefined && r.split.every((s) => s.value === 0 || s.value / most >= 0.22);
                    const splitWords = r.split && r.value > 0 ? r.split.map((s) => `${s.label} ${s.value}`).join(" · ") : undefined;
                    const content = (
                        <>
                            <span className="role-slab-name">{r.label}{splitWords && <small className={inside ? "split-under" : "split-under always"}>{splitWords}</small>}</span>
                            <span className="role-slab-track">
                                {r.value > 0 && (
                                    <span className="role-slab-bar" style={{ "--share": r.value / most } as CSSProperties}>
                                        {(r.split ?? [{ key: r.key, label: "", value: r.value }]).filter((s) => s.value > 0).map((s) => (
                                            <span key={s.key} className={`role-part role-${s.key}`} style={{ flexGrow: s.value }}>{inside && <span className="role-split">{s.label} · {s.value}</span>}</span>
                                        ))}
                                    </span>
                                )}
                                <b className="role-slab-figure"><CountUp value={r.value} /></b>
                            </span>
                        </>
                    );
                    const label = `${r.label}: ${r.value} ${r.value === 1 ? "game" : "games"}${r.split && r.value > 0 ? `, ${r.split.map((s) => `${s.label} ${s.value}`).join(" and ")}` : ""}`;
                    return (
                        <li key={r.key}>
                            {r.to && r.value > 0 ? <Link className="role-slab" to={r.to} aria-label={label}>{content}</Link> : <div className="role-slab" role="img" aria-label={label}>{content}</div>}
                        </li>
                    );
                })}
            </ol>
        </Slab>
    );
}

/** The distance run on a slab cut on the diagonal: the total huge, then a game's and how many were tracked. */
function DistanceSlab({ stats, settings }: CardProps) {
    const { distance, games } = stats;
    const unit = settings.distanceUnit;
    const [figure, unitLabel] = distance.games ? figureAndUnit(formatDistance(distance.totalM, unit)) : ["—", ""];
    // STAT-16: a game's distance is one figure everywhere, the server's average over every game with one.
    const [each, eachUnit] = distance.averageM !== undefined ? figureAndUnit(formatDistance(distance.averageM, unit)) : ["—", ""];
    return (
        <Slab title="Distance" icon="distance" cut className="distance-slab">
            <div className="distance-grid">
                <div className="distance-total">
                    <span className="slab-label">Total run</span>
                    <p className="slab-figure huge">{figure}{unitLabel && <small>{unitLabel}</small>}</p>
                    <span className="mint-bar" aria-hidden />
                    {!distance.games && <p className="slab-note">No distances in these games yet.</p>}
                </div>
                <div className="slab-cell">
                    <span className="slab-label quiet">A game</span>
                    <p className="slab-figure">{each}{eachUnit && <small>{eachUnit}</small>}</p>
                    <span className="slab-caption">{distance.games ? `from ${distance.games} of ${games.total} games` : "no distances yet"}</span>
                </div>
                <div className="slab-cell">
                    <span className="slab-label quiet">Tracked</span>
                    <p className="slab-figure">{distance.tracked}</p>
                    <span className="slab-caption">{distance.tracked === 1 ? "game" : "games"} with a track</span>
                </div>
            </div>
        </Slab>
    );
}

/** WEB-24: the cards shown, three large cards (four with sin bins, EVT-12) rising out of a board slab, each with its count, and where they came from in the table. */
function CardsShown({ stats, games: link }: CardProps) {
    const d = stats.discipline;
    const titleId = useId();
    const items = [
        { colour: "yellow" as const, value: d.cautions, name: d.cautions === 1 ? "Caution" : "Cautions", note: `${rate(d.cautions, d.games)} a game` },
        { colour: "red" as const, value: d.sendOffs, name: d.sendOffs === 1 ? "Send-off" : "Send-offs", note: `${rate(d.sendOffs, d.games)} a game` },
        { colour: "second" as const, value: d.secondCautions, name: d.secondCautions === 1 ? "Second caution" : "Second cautions", note: "Counted in both" },
        // EVT-12: a fourth card, only when there have been any; a second sin bin is in the send-offs too.
        ...(d.sinBins ? [{ colour: "yellow" as const, sinBin: true, value: d.sinBins, name: d.sinBins === 1 ? "Sin bin" : "Sin bins", note: `${rate(d.sinBins, d.games)} a game` }] : []),
    ];
    return (
        <section className="cards-section" aria-labelledby={titleId}>
            <div className="grass-head">
                <h2 className="grass-title" id={titleId}>Cards shown</h2>
                {d.games > 0 && <p>From {d.games} match {d.games === 1 ? "report" : "reports"}</p>}
            </div>
            {d.games === 0 ? <p className="muted">No match reports in these games, so no cards to count.</p> : (
                <>
                    <div className="cards-stage">
                        <span className="cards-slab" aria-hidden />
                        <ul className={`cards-row${items.length > 3 ? " four" : ""}`}>
                            {items.map((c, i) => (
                                <li key={"sinBin" in c ? "sinBin" : c.colour}>
                                    <CardShape colour={c.colour} huge order={i} sinBin={"sinBin" in c} />
                                    <div className="cards-figure">
                                        <b><CountUp value={c.value} /></b>
                                        <span>{c.name}</span>
                                        <small>{c.note}</small>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <DataToggle>
                        <DataTable head={["", "Games", "Cautions", "Send-offs", ...(d.sinBins ? ["Sin bins"] : []), "Goals"]} rows={[
                            ["All", d.games, d.cautions, d.sendOffs, ...(d.sinBins ? [d.sinBins] : []), d.goals],
                            ...d.competitions.map((c) => [c.competitionId ? <Link key="c" className="chart-link" to={link({ competitionId: c.competitionId })}>{c.name}</Link> : c.name, c.games, c.cautions, c.sendOffs, ...(d.sinBins ? [""] : []), ""]),
                        ]} />
                    </DataToggle>
                </>
            )}
        </section>
    );
}

const feeSeries: Series[] = [
    { key: "paid", label: "Paid", className: "fee-paid" },
    { key: "owed", label: "Owed", className: "fee-owed" },
];

/** STAT-6: the fees: earned huge, then paid against owed as a head-to-head bar; the competitions as slanted bars and the months as columns. */
function FeesSlab({ stats, games: link }: CardProps) {
    const { fees } = stats;
    const others = fees.otherCurrencies.length > 0 && <p className="slab-note">Not included: {fees.otherCurrencies.map((o) => `${money(o.amount, o.currency)} from ${o.games} ${o.games === 1 ? "game" : "games"}`).join(", ")}.</p>;
    if (fees.games === 0 || !fees.currency) {
        return (
            <Slab title="Fees" icon="money" className="fees-slab">
                <p className="slab-empty">No fees in these games{fees.currency ? ` in ${fees.currency}` : ""}.</p>
                {fees.otherCurrencies.length > 0 && <p className="slab-note">{fees.otherCurrencies.map((o) => `${o.games} in ${o.currency}`).join(", ")}: change the currency in <Link className="link" to="/settings">Settings</Link> to see them.</p>}
            </Slab>
        );
    }
    const m = (amount: number) => money(amount, fees.currency!);
    return (
        <Slab title="Fees" icon="money" className="fees-slab" table={
            <DataTable head={["", "Paid", "Owed"]} rows={[
                ...fees.months.map((f) => [monthYear.format(monthDate(f.month)), m(f.paidAmount), m(f.owedAmount)]),
                ["All", m(fees.paidAmount), m(fees.owedAmount)],
            ]} />
        }>
            <div className="fees-grid">
                <div className="fees-main">
                    <span className="slab-label">Earned</span>
                    <p className="slab-figure huge fees-figure">{m(fees.earnedAmount)}</p>
                    <span className="mint-bar" aria-hidden />
                    <p className="slab-caption">{m(fees.earnedAmount / fees.games)} a game · {fees.games} {fees.games === 1 ? "game" : "games"} with a fee in {fees.currency}</p>
                    <div className="paid-owed" role="img" aria-label={`Paid ${m(fees.paidAmount)}, owed ${m(fees.owedAmount)}`}>
                        <div className="paid-owed-labels" aria-hidden><span>Paid</span><span className="owed">{fees.owedAmount > 0 ? "Owed" : "All paid"}</span></div>
                        <div className="paid-owed-figures" aria-hidden><b>{m(fees.paidAmount)}</b>{fees.owedAmount > 0 && <b className="owed">{m(fees.owedAmount)}</b>}</div>
                        <HeadToHead parts={[{ key: "paid", value: fees.paidAmount, className: "fee-paid" }, { key: "owed", value: fees.owedAmount, className: "fee-owed" }]} />
                    </div>
                    {others}
                </div>
                <div className="fees-side">
                    {fees.competitions.length > 0 && (
                        <>
                            <h3 className="slab-label">By competition</h3>
                            <SlantBars rows={fees.competitions.map((c) => ({
                                key: c.competitionId ?? "none",
                                label: c.name,
                                value: c.amount,
                                display: m(c.amount),
                                to: c.competitionId ? link({ competitionId: c.competitionId }) : undefined,
                                describe: `${m(c.amount)} from ${c.games} ${c.games === 1 ? "game" : "games"}`,
                            }))} />
                        </>
                    )}
                    {fees.months.length > 0 && (
                        <>
                            <div className="slab-label-row">
                                <h3 className="slab-label">By month</h3>
                                {fees.owedAmount > 0 && <ul className="board-legend">{feeSeries.map((s) => <li key={s.key}><span className={`legend-swatch ${s.className}`} />{s.label}</li>)}</ul>}
                            </div>
                            <BoardColumns label="Fees by month" columns={fees.months.map((f) => {
                                const date = monthDate(f.month);
                                return {
                                    key: f.month,
                                    label: monthName.format(date),
                                    describe: `${monthYear.format(date)}: ${m(f.paidAmount)} paid${f.owedAmount ? `, ${m(f.owedAmount)} owed` : ""}`,
                                    parts: [{ key: "paid", value: f.paidAmount, className: "fee-paid" }, { key: "owed", value: f.owedAmount, className: "fee-owed" }],
                                    value: <>{shortMoney(f.paidAmount, fees.currency!)}{f.owedAmount > 0 && <em> +{shortMoney(f.owedAmount, fees.currency!)}</em>}</>,
                                };
                            })} />
                        </>
                    )}
                </div>
            </div>
        </Slab>
    );
}

const monthName = new Intl.DateTimeFormat(undefined, { month: "short" });

/** "$690", or "$1.2k" from a thousand, for a column's head. */
function shortMoney(amount: number, currency: string): string {
    return amount >= 1000
        ? new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount)
        : money(Math.round(amount), currency);
}

const roleLamps: Series[] = [
    { key: "referee", label: "Referee", className: "role-referee" },
    { key: "assistant", label: "Assistant", className: "role-assistant" },
    { key: "fourth", label: "Fourth", className: "role-fourth" },
    { key: "notSet", label: "Not set", className: "role-notSet" },
];

/**
 * STAT-3: the games a month as a form guide of lamps, a row a month with a lamp for each game in its
 * role's color and unlit lamps up to the busiest month; over a year of months, the board's columns of lamps.
 */
function MonthsSlab({ stats, games }: CardProps) {
    const used = roleLamps.filter((s) => stats.months.some((m) => m[s.key as keyof typeof m] as number > 0));
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const total = (m: StatsData["months"][number]) => m.referee + m.assistant + m.fourth + m.notSet;
    const most = Math.max(...stats.months.map(total), 1);
    // A lamp a game while they stay lamps; past 24 in a month, the row is one bar of the roles.
    const lamps = most <= 24;
    const table = (
        <DataTable head={["Month", ...used.map((s) => s.label), "Games"]}
            rows={stats.months.map((m) => [monthYear.format(monthDate(m.month)), ...used.map((s) => m[s.key as keyof typeof m]), total(m)])} />
    );
    return (
        <Slab title="Games a month" tag={lamps ? "Each light is one game" : undefined} className="months-slab" table={table}>
            {used.length > 1 && <ul className="board-legend">{used.map((s) => <li key={s.key}><span className={`legend-swatch ${s.className}`} />{s.label}</li>)}</ul>}
            {stats.months.length > 12 ? (
                <StackedColumns blocks columns={stats.months.map((m, i) => {
                    const date = monthDate(m.month);
                    return { key: m.month, label: monthName.format(date), ...(date.getMonth() === 0 || i === 0 ? { sub: String(date.getFullYear()) } : {}), parts: { referee: m.referee, assistant: m.assistant, fourth: m.fourth, notSet: m.notSet } };
                })} series={used} describe={(c) => `in ${monthYear.format(monthDate(c.key))}`} to={(c) => games({ month: c.key })} />
            ) : (
                <ol className="lamp-rows">
                    {stats.months.map((m, i) => {
                        const date = monthDate(m.month);
                        const sum = total(m);
                        const soFar = m.month === thisMonth;
                        const lit = used.flatMap((s) => Array.from({ length: m[s.key as keyof typeof m] as number }, () => s.className));
                        const words = `${monthYear.format(date)}${soFar ? " so far" : ""}: ${sum} ${sum === 1 ? "game" : "games"}${used.length > 1 ? `, ${used.filter((s) => (m[s.key as keyof typeof m] as number) > 0).map((s) => `${m[s.key as keyof typeof m]} as ${s.label.toLowerCase()}`).join(", ")}` : ""}`;
                        const row = (
                            <>
                                <span className="lamp-month">{monthName.format(date)}{(i === 0 || date.getMonth() === 0) && <small>{date.getFullYear()}</small>}</span>
                                <span className={lamps ? "lamps" : "lamps lamp-bar"} aria-hidden style={{ "--most": most } as CSSProperties}>
                                    {lamps
                                        ? Array.from({ length: most }, (_, k) => <span key={k} className={k < lit.length ? `lamp lit ${lit[k]}` : "lamp"} />)
                                        : used.map((s) => <span key={s.key} className={`lamp lit ${s.className}`} style={{ flexGrow: m[s.key as keyof typeof m] as number }} />).concat(<span key="rest" className="lamp" style={{ flexGrow: most - sum }} />)}
                                </span>
                                <span className="lamp-total"><b>{sum}</b>{soFar && <small>so far</small>}</span>
                            </>
                        );
                        return <li key={m.month}>{sum > 0 ? <Link className="lamp-row" to={games({ month: m.month })} aria-label={words}>{row}</Link> : <div className="lamp-row" role="img" aria-label={words}>{row}</div>}</li>;
                    })}
                </ol>
            )}
        </Slab>
    );
}

/** Who you work with most, as a broadcast's name strap: a mint tag, the name on chalk, and the games together on a strip of the board. */
function MostWith({ stats, games }: CardProps) {
    const most = stats.referees.top[0];
    if (!most) {
        return null;
    }
    const to = games(most.refereeId ? { refereeId: most.refereeId } : { refereeName: most.name });
    return (
        <section className="name-strap-section" aria-label="Who you work with most">
            <Link to={to} className="name-strap" aria-label={`Most with ${most.name}: ${most.games} ${most.games === 1 ? "game" : "games"} together. See them.`}>
                <span className="strap-tag" aria-hidden>Most with</span>
                <span className="strap-name" aria-hidden>{surname(most.name) || most.name}</span>
                <span className="strap-foot" aria-hidden>
                    <span><b>{most.games}</b> {most.games === 1 ? "game" : "games"} together{surname(most.name) !== most.name && <span className="strap-full">{most.name}</span>}</span>
                    <Icon name="open" size={20} />
                </span>
            </Link>
        </section>
    );
}

/** The small figures on a strip of the board from touchline to touchline: goals, referees worked with and pitches. It stays still. */
function Ticker({ stats, period }: CardProps & { period: string }) {
    const { discipline: d, referees, places } = stats;
    const items = [
        ...(d.games > 0 ? [{ label: "Goals", value: d.goals, sub: `${rate(d.goals, d.games)} a game` }] : []),
        { label: "Referees", value: referees.count, sub: "worked with" },
        { label: "Pitches", value: places.pitches, sub: `at ${places.venues} ${places.venues === 1 ? "venue" : "venues"}` },
    ];
    return (
        <section className="ticker" aria-label={`${period}: more figures`}>
            <span className="ticker-tab" aria-hidden>{period}</span>
            <dl className="ticker-items">
                {items.map((item) => (
                    <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd><b><CountUp value={item.value} /></b> <span>{item.sub}</span></dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

/** TRK-9: where the periods were spent across the games with GPS, painted on the grass on its slab, the thirds lined up with the pitch. */
function WhereOnThePitch({ stats, settings }: CardProps) {
    const heatmaps = stats.fitness.heatmaps ?? [];
    const [role, setRole] = useState<"referee" | "assistant">();
    const heat = heatmaps.find((h) => h.role === role) ?? heatmaps[0];
    if (!heat) {
        return null;
    }
    const as = heat.role === "referee" ? "as referee" : "as an assistant";
    const games = `${heat.games} ${heat.games === 1 ? "game" : "games"}`;
    const thirds = pitchThirds(heat.cells, heat.cols, heat.rows);
    return (
        <Slab title="Where on the pitch" tag="From above" className="pitch-slab" table={
            <DataTable head={["Time in each third", "Left · far side", "Middle", "Right · near side"]} rows={[
                ["Of the length", ...thirds.length.map((s) => `${s}%`)],
                ["Of the width", ...thirds.width.map((s) => `${s}%`)],
            ]} />
        }>
            <div className="pitch-slab-head">
                <div>
                    <p className="slab-heading">{games} with GPS {as}</p>
                    <p className="slab-caption">{heat.role === "assistant"
                        ? "The periods, your touchline at the bottom."
                        : "The periods; with the kickoff direction from the watch, the first kickoff team attacks left to right."}</p>
                </div>
                {heatmaps.length > 1 && (
                    <div className="segmented pitch-role" role="group" aria-label="Role">
                        {heatmaps.map((h) => (
                            <button key={h.role} type="button" className={heat.role === h.role ? "on" : ""} aria-pressed={heat.role === h.role} onClick={() => setRole(h.role)}>{h.role === "referee" ? "Referee" : "Assistant"}</button>
                        ))}
                    </div>
                )}
            </div>
            <PitchHeatmap cells={heat.cells} cols={heat.cols} rows={heat.rows} unit={settings.distanceUnit} thirds={thirds}
                label={`Where you spent the periods in ${games} ${as}, on the pitch. Thirds of the length, left to right: ${thirds.length.join("%, ")}%. Of the width, far side to near: ${thirds.width.join("%, ")}%.`} />
        </Slab>
    );
}
