import { heatGrid } from "@lawfive/schema";
import { type PointerEvent, type ReactNode, useId, useMemo, useState } from "react";
import { heatContours } from "../contours.ts";
import { formatDuration, formatPitchSize } from "../format.ts";

// Where the referee spent the periods, on a drawing of the pitch (TRK-9): the time in each cell
// of a grid over the pitch (schema's pitchHeat), as contour bands painted on the grass (WEB-24): the
// grass's green rising to pale mint where the most time was spent, under the chalk markings (with a
// thin dark edge, so they hold on the palest band), the pitch's length and width marked outside the
// lines. The cells come turned so the kickoff team attacks left to right when that's known; the
// drawing is the ground seen from above.

/** A standard pitch, which the markings are scaled from (Law 1). */
const standard = { length: 105, width: 68 };

export function PitchHeatmap({ cells, cols, rows, lengthM = standard.length, widthM = standard.width, label, attacks, unit, thirds, ends }: {
    cells: number[];
    cols: number;
    rows: number;
    /** The pitch's size, for its shape; a standard pitch for Stats, where pitches of all sizes add up. */
    lengthM?: number;
    widthM?: number;
    label: string;
    /** Under the drawing: which way a team attacked, when known. */
    attacks?: string;
    /** The person's distance unit: the pitch's size in metres, or in yards with miles. */
    unit: "km" | "mi";
    /**
     * Stats (WEB-24): the share of the time in each third of the length (left to right) and of the
     * width (far side to near), as strips lined up with the pitch's thirds under it and beside it.
     */
    thirds?: { length: number[]; width: number[] };
    /**
     * TRK-9: the direction of play, a row for each way round the match was played: what's at the
     * left goal line, what's at the right, and which periods, under the halfway line.
     */
    ends?: { label: string; left: ReactNode; right: ReactNode }[];
}) {
    const id = useId();
    const [hover, setHover] = useState<{ cell: number; x: number; y: number }>();
    // The drawing in metres: the pitch with its margins (wider beyond the touchlines, where
    // assistants run), the touchline at the bottom; room above and to the left for the dimensions.
    const w = lengthM * (1 + 2 * heatGrid.marginLength);
    const h = widthM * (1 + 2 * heatGrid.marginWidth);
    const left = lengthM * heatGrid.marginLength;
    const top = widthM * heatGrid.marginWidth;
    const room = 9;
    const view = { x: -room, y: -room, w: w + room + 1, h: h + room + 1 };
    const cw = w / cols;
    const ch = h / rows;
    const { paths } = useMemo(() => heatContours(cells, cols, rows, w, h), [cells, cols, rows, w, h]);
    const scale = Math.min(lengthM / standard.length, widthM / standard.width);
    const box = (depth: number, span: number, end: "left" | "right") => {
        const d = depth * scale;
        const s = Math.min(span * scale, widthM);
        return `M${end === "left" ? left : left + lengthM} ${top + (widthM - s) / 2}h${end === "left" ? d : -d}v${s}h${end === "left" ? -d : d}`;
    };
    const r = 9.15 * scale;
    const cx = left + lengthM / 2;
    const cy = top + widthM / 2;
    // The markings as one path, so the dark edge under them and the chalk over them match.
    const markings = [
        `M${left} ${top}h${lengthM}v${widthM}h${-lengthM}Z`,
        `M${cx} ${top}V${top + widthM}`,
        `M${cx + r} ${cy}a${r} ${r} 0 1 0 ${-2 * r} 0a${r} ${r} 0 1 0 ${2 * r} 0`,
        box(16.5, 40.32, "left"), box(16.5, 40.32, "right"),
        box(5.5, 18.32, "left"), box(5.5, 18.32, "right"),
        // The arcs at the penalty areas (the D), outside the areas only.
        dArc(left + 11 * scale, cy, r, left + 16.5 * scale, 1),
        dArc(left + lengthM - 11 * scale, cy, r, left + lengthM - 16.5 * scale, -1),
    ].join("");
    const spots: [number, number][] = [[cx, cy], [left + 11 * scale, cy], [left + lengthM - 11 * scale, cy]];
    // Flat mowing stripes, a tenth of the drawing's length each.
    const stripes = Array.from({ length: 5 }, (_, i) => `M${(2 * i + 1) * (w / 10)} 0h${w / 10}v${h}h${-w / 10}Z`).join("");
    const onMove = (e: PointerEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = view.x + ((e.clientX - rect.left) / rect.width) * view.w;
        const y = view.y + ((e.clientY - rect.top) / rect.height) * view.h;
        const col = Math.floor(x / cw);
        const row = Math.floor(y / ch);
        if (col < 0 || col >= cols || row < 0 || row >= rows) {
            setHover(undefined);
            return;
        }
        setHover({ cell: row * cols + col, x: (((col + 0.5) * cw - view.x) / view.w) * 100, y: ((row * ch - view.y) / view.h) * 100 });
    };
    // Where a dimension's figure sits, as a share of the drawing.
    const pct = (v: number, axis: "x" | "y") => `${((v - view[axis]) / view[axis === "x" ? "w" : "h"]) * 100}%`;
    const dims = { y: -5, x: -5 };
    const tick = 1.6;
    return (
        <figure className={thirds ? "pitch-heat with-thirds" : "pitch-heat"}>
            <div className="pitch-heat-drawing">
                <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
                    <defs>
                        <clipPath id={`${id}-clip`}><rect width={w} height={h} rx={1} /></clipPath>
                    </defs>
                    <rect className="pitch-heat-grass" width={w} height={h} rx={1} />
                    <path className="pitch-heat-stripe" d={stripes} clipPath={`url(#${id}-clip)`} />
                    <g clipPath={`url(#${id}-clip)`}>
                        {paths.map((d, i) => d && <path key={i} className={`contour-fill contour-${i + 1}`} d={d} fillRule="evenodd" />)}
                        <path className="contour-lines" d={paths.join("")} />
                    </g>
                    <path className="pitch-heat-case" d={markings} />
                    <path className="pitch-heat-lines" d={markings} />
                    {spots.map(([x, y], i) => <circle key={i} className="pitch-heat-spot" cx={x} cy={y} r={i === 0 ? 0.65 : 0.5} />)}
                    {/* The dimensions, outside the lines: the length along the top, the width down the left. */}
                    <g className="pitch-heat-dims">
                        <path d={`M${left} ${top}V${dims.y - tick}M${left + lengthM} ${top}V${dims.y - tick}M${left} ${dims.y}H${left + lengthM}`} />
                        <path d={`M${left} ${top}H${dims.x - tick}M${left} ${top + widthM}H${dims.x - tick}M${dims.x} ${top}V${top + widthM}`} />
                        <path className="tick" d={`M${left - tick} ${dims.y + tick}l${2 * tick} ${-2 * tick}M${left + lengthM - tick} ${dims.y + tick}l${2 * tick} ${-2 * tick}M${dims.x - tick} ${top + tick}l${2 * tick} ${-2 * tick}M${dims.x - tick} ${top + widthM + tick}l${2 * tick} ${-2 * tick}`} />
                    </g>
                    {hover && cells[hover.cell] > 0 && (
                        <rect className="pitch-heat-on" x={(hover.cell % cols) * cw} y={Math.floor(hover.cell / cols) * ch} width={cw} height={ch} />
                    )}
                </svg>
                <span className="pitch-heat-dim" style={{ left: pct(cx, "x"), top: pct(dims.y, "y") }} aria-hidden>{formatPitchSize(lengthM, unit)}</span>
                <span className="pitch-heat-dim vertical" style={{ left: pct(dims.x, "x"), top: pct(cy, "y") }} aria-hidden>{formatPitchSize(widthM, unit)}</span>
                {thirds && (
                    <>
                        <div className="pitch-thirds along" style={{ left: pct(left, "x"), width: `${(lengthM / view.w) * 100}%` }} aria-hidden>
                            {thirds.length.map((share, i) => <span key={i} className={`contour-${thirdStep(share)}`}>{share}%</span>)}
                            <small>Time in each third of the length</small>
                        </div>
                        <div className="pitch-thirds across" style={{ top: pct(top, "y"), height: `${(widthM / view.h) * 100}%` }} aria-hidden>
                            <small>Across</small>
                            {thirds.width.map((share, i) => <span key={i} className={`contour-${thirdStep(share)}`}>{share}%</span>)}
                        </div>
                    </>
                )}
                {hover && cells[hover.cell] > 0 && (
                    <div className="chart-tip" style={{ left: `${hover.x}%`, top: `${hover.y}%` }}>
                        <strong>{formatDuration(cells[hover.cell])}</strong> here
                    </div>
                )}
            </div>
            {ends && ends.length > 0 && (
                // Under the drawing (not in it, as its labels are placed by its height), each end at its goal line.
                <div className="pitch-ends" style={{ paddingLeft: pct(left, "x"), paddingRight: `calc(100% - ${pct(left + lengthM, "x")})` }}>
                    {ends.map((e) => (
                        <div key={e.label} className="pitch-ends-row">
                            <span className="pitch-ends-left">{e.left}</span>
                            <span className="pitch-ends-label">{e.label}</span>
                            <span className="pitch-ends-right">{e.right}</span>
                        </div>
                    ))}
                </div>
            )}
            <figcaption className="pitch-heat-key">
                {attacks && <span className="pitch-heat-attacks">{attacks}</span>}
                <span className="pitch-heat-scale">
                    Less
                    <span className="pitch-heat-swatches" aria-hidden>{[0, 1, 2, 3, 4, 5, 6].map((s) => <span key={s} className={`contour-swatch contour-${s}`} />)}</span>
                    More time
                </span>
            </figcaption>
        </figure>
    );
}

/** A third's shade on the heatmap's own scale: a third with two thirds of the time is the palest band. */
function thirdStep(share: number): number {
    return Math.max(1, Math.min(6, Math.ceil(share / 11)));
}

/** The penalty arc: the part of the circle round the penalty mark (at x) that's outside the area (whose line is at edge); dir 1 faces right. */
function dArc(x: number, y: number, r: number, edge: number, dir: 1 | -1): string {
    const dx = Math.abs(edge - x);
    if (dx >= r) {
        return "";
    }
    const dy = Math.sqrt(r * r - dx * dx);
    return `M${edge} ${y - dy}A${r} ${r} 0 0 ${dir === 1 ? 1 : 0} ${edge} ${y + dy}`;
}
