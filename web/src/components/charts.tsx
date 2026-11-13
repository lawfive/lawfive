import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

// Charts for the Stats page (STAT-3): the data tables every graphic has, the width a drawing is
// drawn at, and the board's columns of lamps for the games a month over more than a year (the rest
// of Stats' graphics are in boardCharts.tsx). Colors come from classes that set --c (styles.css).

/** The width an element is drawn at, kept up to date. */
export function useWidth(): [RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

export function DataTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
    return (
        <table className="data-table">
            <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}</tr>)}</tbody>
        </table>
    );
}

export interface Series {
    key: string;
    label: string;
    /** Sets --c, the series colour (styles.css). */
    className: string;
}

const plot = { top: 14, bottom: 34, left: 30, right: 6 };

/** Gridline values from min (0 by default) to at least max, about four of them, at round steps. */
function ticks(max: number, min = 0): number[] {
    const raw = Math.max(max - min, max > 1 ? 1 : 0.1) / 4;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
    // Up to the first step at or above max, so the tallest mark fits.
    const out = [Math.floor(min / step) * step];
    while (out[out.length - 1] < max - step * 0.001 || out.length < 2) {
        out.push(Math.round((out[out.length - 1] + step) * 100) / 100);
    }
    return out;
}

export interface Column {
    key: string;
    label: string;
    /** A second line under the label (the year under January). */
    sub?: string;
    parts: Record<string, number>;
}

/** Columns, each split into series stacked from the baseline, with a readout of a column on hover. */
export function StackedColumns({ columns, series, totals = false, blocks = false, height = blocks ? 250 : 220, describe, format = String, to }: {
    columns: Column[];
    series: Series[];
    /** The total over each column. */
    totals?: boolean;
    /**
     * WEB-24: on the board, a lamp for each one (whole counts), unlit lamps up to the busiest column, and
     * each total as a board figure over its column; solid columns when the lamps would be too small.
     */
    blocks?: boolean;
    height?: number;
    /** The readout's heading for a column. */
    describe?: (c: Column) => string;
    /** How values are written (axis, totals, readout). */
    format?: (value: number) => string;
    /** Where a column links to: the games behind it (STAT-11). */
    to?: (c: Column) => string | undefined;
}) {
    const [ref, width] = useWidth();
    const [hover, setHover] = useState<number>();
    const navigate = useNavigate();
    const sum = (c: Column) => series.reduce((s, x) => s + (c.parts[x.key] ?? 0), 0);
    const most = Math.max(...columns.map(sum), 0);
    const yTicks = ticks(most);
    const slotGuess = (width - 12) / Math.max(columns.length, 1);
    // Big totals over the columns when each has room for them.
    const bigTotals = blocks && slotGuess >= 34;
    const pad = blocks ? { top: bigTotals ? 44 : 22, bottom: 36, left: 2, right: 2 } : plot;
    const top = blocks ? Math.max(most, 1) : yTicks[yTicks.length - 1];
    const plotWidth = Math.max(width - pad.left - pad.right, 10);
    // The board's lamps stay lamp-sized (at most 18px a game), so a quiet season makes a shorter board.
    const plotHeight = blocks ? Math.min(height - pad.top - pad.bottom, Math.max(top, 4) * 18) : height - pad.top - pad.bottom - (totals ? 6 : 0);
    const chartHeight = blocks ? plotHeight + pad.top + pad.bottom : height;
    const slot = plotWidth / Math.max(columns.length, 1);
    const barWidth = blocks ? Math.min(72, Math.max(slot * 0.78, 2)) : Math.min(36, Math.max(slot * 0.62, 2));
    const y = (v: number) => pad.top + (totals ? 6 : 0) + plotHeight - (v / top) * plotHeight;
    // A lamp a game when they'd each be at least 5px, with 3px between.
    const lamps = blocks && plotHeight / top >= 5 && columns.every((c) => Number.isInteger(sum(c)));
    const lamp = plotHeight / top;
    // Labels only as often as they fit.
    const every = Math.max(1, Math.ceil((blocks ? 40 : 34) / slot));
    const hovered = hover === undefined ? undefined : columns[hover];

    return (
        <div className="column-chart" ref={ref}>
            {width > 0 && (
                <svg width={width} height={chartHeight} role="img" aria-label={columns.map((c) => `${c.label} ${sum(c)}`).join(", ")}
                    onPointerLeave={() => setHover(undefined)}>
                    {!blocks && yTicks.map((v) => (
                        <g key={v}>
                            <line className="chart-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(v)} y2={y(v)} />
                            <text className="chart-label" x={pad.left - 6} y={y(v) + 4} textAnchor="end">{format(v)}</text>
                        </g>
                    ))}
                    {columns.map((c, i) => {
                        const x = pad.left + i * slot + (slot - barWidth) / 2;
                        let base = 0;
                        const parts = series.filter((s) => (c.parts[s.key] ?? 0) > 0);
                        if (lamps) {
                            // Unlit lamps up to the busiest month, then each game lit in its series' color from the foot.
                            const lit = parts.flatMap((s) => Array.from({ length: c.parts[s.key] }, () => s.className));
                            return (
                                <g key={c.key} className={hover === i ? "column on" : "column"}>
                                    <rect className={`column-hit${to?.(c) ? " clickable" : ""}`} x={pad.left + i * slot} y={0} width={slot} height={chartHeight}
                                        {...(to?.(c) ? { role: "link", tabIndex: 0, "aria-label": `${c.label}: ${format(sum(c))}` } : {})}
                                        onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(undefined)}
                                        onClick={() => { const link = to?.(c); if (link) navigate(link); }}
                                        onKeyDown={(e) => { const link = to?.(c); if (link && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); navigate(link); } }} />
                                    {Array.from({ length: top }, (_, k) => (
                                        <rect key={k} className={`column-lamp${k < lit.length ? ` lit ${lit[k]}` : ""}`} x={x} y={y(k + 1) + Math.min(3, lamp * 0.3)} width={barWidth} height={Math.max(lamp - Math.min(3, lamp * 0.3), 1)} />
                                    ))}
                                    <text className={`chart-total${bigTotals ? " big" : ""}`} x={x} y={y(top) - (bigTotals ? 10 : 6)}>{format(sum(c))}</text>
                                    {i % every === 0 && (
                                        <>
                                            <text className="chart-label month" x={x} y={chartHeight - pad.bottom + 18}>{c.label}</text>
                                            {c.sub && <text className="chart-label strong" x={x} y={chartHeight - pad.bottom + 32}>{c.sub}</text>}
                                        </>
                                    )}
                                </g>
                            );
                        }
                        return (
                            <g key={c.key} className={hover === i ? "column on" : "column"}>
                                <rect className={`column-hit${to?.(c) ? " clickable" : ""}`} x={pad.left + i * slot} y={pad.top} width={slot} height={plotHeight + (totals ? 6 : 0)}
                                    {...(to?.(c) ? { role: "link", tabIndex: 0, "aria-label": `${c.label}: ${format(sum(c))}` } : {})}
                                    onPointerEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(undefined)}
                                    onClick={() => {
                                        const link = to?.(c);
                                        if (link) {
                                            navigate(link);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        const link = to?.(c);
                                        if (link && (e.key === "Enter" || e.key === " ")) {
                                            e.preventDefault();
                                            navigate(link);
                                        }
                                    }} />
                                {parts.map((s, j) => {
                                    const value = c.parts[s.key];
                                    const y0 = y(base);
                                    base += value;
                                    const y1 = y(base);
                                    // A 2px gap above each segment but the top one.
                                    const gapAbove = j < parts.length - 1 ? 2 : 0;
                                    const h = Math.max(y0 - y1 - gapAbove, 1);
                                    const last = j === parts.length - 1;
                                    return last
                                        ? <path key={s.key} className={`column-part ${s.className}`} d={roundedTop(x, y0 - h, barWidth, h, Math.min(4, h, barWidth / 2))} />
                                        : <rect key={s.key} className={`column-part ${s.className}`} x={x} y={y0 - h} width={barWidth} height={h} />;
                                })}
                                {(totals || blocks) && sum(c) > 0 && <text className={blocks ? `chart-total${bigTotals ? " big" : ""}` : "chart-value"} x={blocks ? x : x + barWidth / 2} y={y(sum(c)) - (bigTotals ? 10 : 5)} textAnchor={blocks ? "start" : "middle"}>{format(sum(c))}</text>}
                                {i % every === 0 && (
                                    <>
                                        <text className={`chart-label${blocks ? " month" : ""}`} x={blocks ? x : x + barWidth / 2} y={chartHeight - pad.bottom + (blocks ? 18 : 16)} textAnchor={blocks ? "start" : "middle"}>{c.label}</text>
                                        {c.sub && <text className="chart-label strong" x={blocks ? x : x + barWidth / 2} y={chartHeight - pad.bottom + (blocks ? 32 : 29)} textAnchor={blocks ? "start" : "middle"}>{c.sub}</text>}
                                    </>
                                )}
                            </g>
                        );
                    })}
                    <line className="chart-axis" x1={pad.left} x2={pad.left + plotWidth} y1={y(0)} y2={y(0)} />
                </svg>
            )}
            {hovered && hover !== undefined && (
                <div className={`chart-tip ${hover > columns.length / 2 ? "tip-left" : "tip-right"}`}
                    style={{ left: pad.left + hover * slot + slot / 2, top: pad.top }}>
                    <strong>{format(sum(hovered))}</strong> {describe ? describe(hovered) : hovered.label}
                    {series.length > 1 && series.filter((s) => (hovered.parts[s.key] ?? 0) > 0).map((s) => (
                        <div key={s.key} className="tip-row"><span className={`tip-key ${s.className}`} />{s.label} <strong>{format(hovered.parts[s.key])}</strong></div>
                    ))}
                    {to?.(hovered) && <div className="tip-hint">Click to see these games</div>}
                </div>
            )}
        </div>
    );
}

/** A bar with its top corners rounded, square at the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
