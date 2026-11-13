import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { useWidth } from "./charts.tsx";

// WEB-24: Stats' graphics in the broadcast stats package, drawn in HTML so they take the ground's
// tokens (styles.css): a head-to-head bar whose parts meet on the kits' diagonal, slanted bars with
// their values written beside them, and columns with their values over them. Colors come from
// classes that set --c. Each is honest: lengths and heights are to scale, and the values are written.

/** Parts of a whole side by side, each as long as its share, meeting on the diagonal (paid v owed, referee v assistant). Drawn only; the words are the caller's. */
export function HeadToHead({ parts, className }: { parts: { key: string; value: number; className: string }[]; className?: string }) {
    const shown = parts.filter((p) => p.value > 0);
    return (
        <div className={`head-to-head${className ? ` ${className}` : ""}`} aria-hidden>
            {shown.map((p, i) => (
                <span key={p.key} className={`${p.className}${i === 0 ? " first" : ""}${i === shown.length - 1 ? " last" : ""}`} style={{ flexGrow: p.value }} />
            ))}
        </div>
    );
}

export interface SlantBar {
    key: string;
    label: ReactNode;
    value: number;
    /** The value as written beside the bar. */
    display: ReactNode;
    /** The games behind it (STAT-11). */
    to?: string;
    /** Sets --c; chalk on a board, ink on a panel, by default. */
    className?: string;
    /** The row in words, for screen readers when the label links. */
    describe?: string;
}

/** Slanted bars, a row each: the label, the bar to scale, its value; on a narrow slab the label goes over its bar. */
export function SlantBars({ rows }: { rows: SlantBar[] }) {
    const most = Math.max(...rows.map((r) => r.value), 1);
    return (
        <ul className="slant-bars">
            {rows.map((r) => (
                <li key={r.key} className={r.className}>
                    <span className="slant-label">{r.to ? <Link to={r.to} className="chart-link" aria-label={r.describe}>{r.label}</Link> : r.label}</span>
                    <span className="slant-track">
                        <span className="slant-bar" style={{ "--share": r.value / most } as CSSProperties} />
                        <b className="slant-value">{r.display}</b>
                    </span>
                </li>
            ))}
        </ul>
    );
}

export interface BoardColumn {
    key: string;
    label: string;
    /** Stacked from the foot, in order. */
    parts: { key: string; value: number; className: string }[];
    /** Written over the column when there's room; the sum by default. */
    value?: ReactNode;
    /** The column in words: its hover title and part of the chart's spoken summary. */
    describe: string;
}

/** Columns to scale with their values over them (as many as fit; every column's in its title and the table) and their labels under. */
export function BoardColumns({ columns, label, height = 150 }: { columns: BoardColumn[]; label: string; height?: number }) {
    const [ref, width] = useWidth();
    const sum = (c: BoardColumn) => c.parts.reduce((s, p) => s + p.value, 0);
    const most = Math.max(...columns.map(sum), 1);
    const slot = width / Math.max(columns.length, 1);
    // Values over the columns while each has room for one; labels as often as they fit.
    const values = slot >= 46;
    const every = Math.max(1, Math.ceil(40 / Math.max(slot, 1)));
    return (
        <div ref={ref} className="board-columns" role="img" aria-label={`${label}: ${columns.map((c) => c.describe).join("; ")}`} style={{ "--plot": `${height}px` } as CSSProperties}>
            {width > 0 && columns.map((c, i) => {
                const total = sum(c);
                const body = (
                    <>
                        <span className="board-column-stack">
                            {values && total > 0 && <span className="board-column-value">{c.value ?? total}</span>}
                            {c.parts.filter((p) => p.value > 0).reverse().map((p) => <span key={p.key} className={`board-column-part ${p.className}`} style={{ height: `${(p.value / most) * height}px` }} />)}
                        </span>
                        <span className="board-column-label">{i % every === 0 ? c.label : ""}</span>
                    </>
                );
                return <span key={c.key} className="board-column" title={c.describe}>{body}</span>;
            })}
        </div>
    );
}
