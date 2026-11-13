import { type ReactNode, useId } from "react";
import { Icon, type IconName } from "./ui.tsx";

// WEB-24: the slab, the broadcast stats package's section (Stats, 2026-11-08): a dark board slab
// with its caption as a stylized header, a chalk title tab cut on the kits' diagonal in black italic
// capitals, overlapping the slab's top-left corner, with a mint tag beside it saying what's counted.
// Used on Stats, and since 2026-11-08 (WEB-28) for a match's track figures and heatmap, its weather,
// a venue's and a referee's figures and the quiz's score; see DESIGN.md's Components.

export interface SlabProps {
    /** The tab's words, the section's heading (an h2, or `level`). */
    title: ReactNode;
    /** The mint tag beside the title: what the figures count ("Games", "Km a game"). Short; it goes under the title when the two don't fit side by side. */
    tag?: ReactNode;
    /** A Phosphor icon before the title. */
    icon?: IconName;
    /**
     * What the section sits on: the board's near black (the default, for figures and graphics), a
     * chalk panel with the pitch's corner arcs (for dense lists; its tab is then a strip of the board),
     * or the grass itself (the tab alone over things drawn on the pitch).
     */
    ground?: "board" | "panel" | "grass";
    /** The slab's right edge cut on the kits' diagonal, as a figure's slab is. Clips what's inside, so not for anything with tips or menus. */
    cut?: boolean;
    /** The section's numbers as a table, behind a Data table toggle at its foot (STAT-3). */
    table?: ReactNode;
    /** The heading's level, when the slab sits under another heading. */
    level?: 2 | 3;
    id?: string;
    className?: string;
    children: ReactNode;
}

export function Slab({ title, tag, icon, ground = "board", cut = false, table, level = 2, id, className, children }: SlabProps) {
    const headingId = useId();
    const Heading = level === 3 ? "h3" : "h2";
    return (
        <section id={id} className={`slab slab-${ground}${cut ? " slab-cut" : ""}${className ? ` ${className}` : ""}`} aria-labelledby={headingId}>
            <div className="slab-tab">
                <Heading id={headingId} className="slab-title">{icon && <Icon name={icon} size={20} />}<span>{title}</span></Heading>
                {tag && <span className="slab-tag">{tag}</span>}
            </div>
            <div className="slab-body">
                <div className={ground === "board" ? "slab-face board" : ground === "panel" ? "slab-face card corner-arcs" : "slab-face"}>
                    {children}
                    {table && <DataToggle>{table}</DataToggle>}
                </div>
            </div>
        </section>
    );
}

/** A section's numbers as a table, opened from a small outlined Data table button (STAT-3); it takes the colors of the ground it's on. */
export function DataToggle({ children, label }: { children: ReactNode; label?: string }) {
    return (
        <details className="data-toggle">
            <summary>
                <Icon name="table" size={14} />
                <span className="data-closed">{label ?? "Data table"}</span>
                <span className="data-open">Hide {label ? label.toLowerCase() : "data table"}</span>
            </summary>
            <div className="table-scroll">{children}</div>
        </details>
    );
}

/** "27.0 mi" as its figure and its unit, so the unit can sit small beside it. */
export function figureAndUnit(text: string): [string, string] {
    const found = /^([\d.,−-]+)\s*(.*)$/.exec(text);
    return found ? [found[1], found[2]] : [text, ""];
}

/** A figure on a slab with its unit small beside it ("2.9 mi", "136 bpm"). */
export function SlabFigure({ text, className = "slab-figure" }: { text: string; className?: string }) {
    const [figure, unit] = figureAndUnit(text);
    return <p className={className}>{figure}{unit && <small>{unit}</small>}</p>;
}
