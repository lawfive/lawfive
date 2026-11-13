// TRK-9, WEB-24: the heatmap as contour bands, "painted on the grass": the time in each cell of the
// pitch's grid (schema's pitchHeat) smoothed into a field, then marching squares at a few levels,
// each ring smoothed into curves. Paths are in the drawing's own units (metres), the grid's cells
// cw by ch, so they sit on the pitch drawing as they are. Android's Contours.kt and the iPhone's
// Contours.swift are ports of this; test/contours-case.json checks all three draw the same.

export interface Contours {
    /** One path per level, lowest first; each is drawn filled (even-odd), the higher over the lower. */
    paths: string[];
    /** The levels, as shares of the highest point of the smoothed field. */
    levels: number[];
}

/** Six bands from a little time to the most, evenly spaced on the square root of the time, as the old blur's steps were. */
export const contourLevels = [0.14, 0.29, 0.44, 0.59, 0.74, 0.89];

/**
 * The time in each cell (row by row from the top) as contour paths over a drawing w by h. The grid is
 * sampled at each cell's middle, `fine` times finer, padded with empty ground so every ring closes,
 * and blurred about half a cell, so bands follow the run of play rather than the grid's squares.
 */
export function heatContours(cells: number[], cols: number, rows: number, w: number, h: number, levels = contourLevels, fine = 4): Contours {
    const max = Math.max(0, ...cells);
    if (max <= 0) {
        return { paths: levels.map(() => ""), levels };
    }
    // The square root, so the lighter places still show (as the old six steps did).
    const value = (c: number, r: number) => (c < 0 || r < 0 || c >= cols || r >= rows ? 0 : Math.sqrt(Math.max(0, cells[r * cols + c]) / max));
    const pad = 2;
    const nx = (cols + 2 * pad) * fine + 1;
    const ny = (rows + 2 * pad) * fine + 1;
    // Sample points: x in cells from the drawing's left edge, at the cells' middles.
    const at = (i: number) => i / fine - pad;
    let grid: Float64Array = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++) {
        const y = at(j) - 0.5;
        const r0 = Math.floor(y);
        const ty = y - r0;
        for (let i = 0; i < nx; i++) {
            const x = at(i) - 0.5;
            const c0 = Math.floor(x);
            const tx = x - c0;
            grid[j * nx + i] = (value(c0, r0) * (1 - tx) + value(c0 + 1, r0) * tx) * (1 - ty) + (value(c0, r0 + 1) * (1 - tx) + value(c0 + 1, r0 + 1) * tx) * ty;
        }
    }
    grid = blur(grid, nx, ny, 0.55 * fine);
    let top = 0;
    for (const v of grid) {
        top = Math.max(top, v);
    }
    if (top <= 0) {
        return { paths: levels.map(() => ""), levels };
    }
    for (let k = 0; k < grid.length; k++) {
        grid[k] /= top;
    }
    // From sample space to the drawing: a cell is w / cols across.
    const sx = w / cols / fine;
    const sy = h / rows / fine;
    const ox = -pad * fine;
    const paths = levels.map((level) =>
        march(grid, nx, ny, level)
            .filter((ring) => ring.length >= 4)
            .map((ring) => smooth(ring.map(([x, y]) => [(x + ox) * sx, (y + ox) * sy] as Point)))
            .join(""),
    );
    return { paths, levels };
}

type Point = [number, number];

/** A separable Gaussian blur of the grid. */
function blur(grid: Float64Array, nx: number, ny: number, sigma: number): Float64Array {
    const radius = Math.ceil(sigma * 3);
    const kernel: number[] = [];
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
        const v = Math.exp(-(k * k) / (2 * sigma * sigma));
        kernel.push(v);
        sum += v;
    }
    const weights = kernel.map((v) => v / sum);
    const across = new Float64Array(grid.length);
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            let v = 0;
            for (let k = -radius; k <= radius; k++) {
                const x = i + k;
                if (x >= 0 && x < nx) {
                    v += grid[j * nx + x] * weights[k + radius];
                }
            }
            across[j * nx + i] = v;
        }
    }
    const out = new Float64Array(grid.length);
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            let v = 0;
            for (let k = -radius; k <= radius; k++) {
                const y = j + k;
                if (y >= 0 && y < ny) {
                    v += across[y * nx + i] * weights[k + radius];
                }
            }
            out[j * nx + i] = v;
        }
    }
    return out;
}

/**
 * Marching squares: the closed rings where the field crosses the level, in sample coordinates. The
 * grid's edge is empty ground, so every ring closes; a saddle is split by the middle's value.
 */
export function march(grid: ArrayLike<number>, nx: number, ny: number, level: number): Point[][] {
    // An edge's crossing, keyed by which edge: horizontal edges from (i, j) to (i + 1, j), vertical from (i, j) to (i, j + 1).
    const key = (horizontal: boolean, i: number, j: number) => (horizontal ? 0 : 1) + 2 * (i + j * nx);
    const point = (k: number): Point => {
        const horizontal = k % 2 === 0;
        const n = Math.floor(k / 2);
        const i = n % nx;
        const j = Math.floor(n / nx);
        const a = grid[j * nx + i];
        const b = horizontal ? grid[j * nx + i + 1] : grid[(j + 1) * nx + i];
        const t = b === a ? 0.5 : (level - a) / (b - a);
        return horizontal ? [i + t, j] : [i, j + t];
    };
    const links = new Map<number, number[]>();
    const link = (p: number, q: number) => {
        links.set(p, [...(links.get(p) ?? []), q]);
        links.set(q, [...(links.get(q) ?? []), p]);
    };
    for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
            const a = grid[j * nx + i] > level;
            const b = grid[j * nx + i + 1] > level;
            const c = grid[(j + 1) * nx + i + 1] > level;
            const d = grid[(j + 1) * nx + i] > level;
            const top = key(true, i, j);
            const right = key(false, i + 1, j);
            const bottom = key(true, i, j + 1);
            const left = key(false, i, j);
            const crossed: number[] = [];
            if (a !== b) crossed.push(top);
            if (b !== c) crossed.push(right);
            if (c !== d) crossed.push(bottom);
            if (d !== a) crossed.push(left);
            if (crossed.length === 2) {
                link(crossed[0], crossed[1]);
            } else if (crossed.length === 4) {
                const middle = (grid[j * nx + i] + grid[j * nx + i + 1] + grid[(j + 1) * nx + i + 1] + grid[(j + 1) * nx + i]) / 4 > level;
                if (middle === a) {
                    link(top, right);
                    link(bottom, left);
                } else {
                    link(left, top);
                    link(right, bottom);
                }
            }
        }
    }
    const seen = new Set<number>();
    const rings: Point[][] = [];
    for (const start of links.keys()) {
        if (seen.has(start)) {
            continue;
        }
        const ring = [start];
        seen.add(start);
        let current = start;
        for (;;) {
            const next = (links.get(current) ?? []).find((n) => !seen.has(n));
            if (next === undefined) {
                break;
            }
            seen.add(next);
            ring.push(next);
            current = next;
        }
        rings.push(simplify(ring.map(point)));
    }
    return rings;
}

/** Drops points closer than a tenth of a sample to the last kept, so curves stay light. */
function simplify(ring: Point[]): Point[] {
    const out: Point[] = [];
    for (const p of ring) {
        const last = out[out.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.35) {
            out.push(p);
        }
    }
    return out;
}

const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** A closed ring as a smooth path through its points (Catmull-Rom, as cubic curves). */
export function smooth(ring: Point[]): string {
    const count = ring.length;
    if (count < 3) {
        return "";
    }
    let d = `M${n(ring[0][0])} ${n(ring[0][1])}`;
    for (let i = 0; i < count; i++) {
        const p0 = ring[(i - 1 + count) % count];
        const p1 = ring[i];
        const p2 = ring[(i + 1) % count];
        const p3 = ring[(i + 2) % count];
        const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
    }
    return `${d}Z`;
}
