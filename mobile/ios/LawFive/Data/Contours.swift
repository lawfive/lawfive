import Foundation

// TRK-9, WEB-24: the heatmap as contour bands, "painted on the grass", ported from the website's
// web/src/contours.ts (as Android's Contours.kt) so the three copies draw the same bands from the
// same grid: the time in each cell of the pitch's grid smoothed into a field, then marching squares at
// a few levels, each ring smoothed into curves. Rings are in the drawing's own units (metres), the
// grid's cells w / cols by h / rows, so they sit on the pitch drawing as they are. Kept apart from the
// drawing so it can be tested with the website's cases.

/// A point in the drawing (or in sample space while marching).
struct Pt: Equatable {
    var x: Double
    var y: Double
}

/// One cubic curve of a smoothed ring: its two control points and where it ends.
struct Cubic: Equatable {
    var c1: Pt
    var c2: Pt
    var to: Pt
}

/// A closed ring as curves from `start`, back to it.
struct SmoothRing: Equatable {
    var start: Pt
    var curves: [Cubic]
}

/// Six bands from a little time to the most, evenly spaced on the square root of the time.
let contourLevels = [0.14, 0.29, 0.44, 0.59, 0.74, 0.89]

/// The time in each cell (row by row from the top) as contour rings over a drawing w by h, one list
/// per level, lowest first; each level is drawn filled (even-odd), the higher over the lower. The grid
/// is sampled at each cell's middle, `fine` times finer, padded with empty ground so every ring
/// closes, and blurred about half a cell, so bands follow the run of play rather than the grid's squares.
func heatContours(_ cells: [Double], cols: Int, rows: Int, w: Double, h: Double, levels: [Double] = contourLevels, fine: Int = 4) -> [[SmoothRing]] {
    let most = max(0, cells.max() ?? 0)
    if most <= 0 { return levels.map { _ in [] } }
    // The square root, so the lighter places still show.
    func value(_ c: Int, _ r: Int) -> Double {
        c < 0 || r < 0 || c >= cols || r >= rows ? 0 : (max(0, cells[r * cols + c]) / most).squareRoot()
    }
    let pad = 2
    let nx = (cols + 2 * pad) * fine + 1
    let ny = (rows + 2 * pad) * fine + 1
    // Sample points: x in cells from the drawing's left edge, at the cells' middles.
    func at(_ i: Int) -> Double { Double(i) / Double(fine) - Double(pad) }
    var grid = [Double](repeating: 0, count: nx * ny)
    for j in 0..<ny {
        let y = at(j) - 0.5
        let r0 = Int(floor(y))
        let ty = y - Double(r0)
        for i in 0..<nx {
            let x = at(i) - 0.5
            let c0 = Int(floor(x))
            let tx = x - Double(c0)
            grid[j * nx + i] = (value(c0, r0) * (1 - tx) + value(c0 + 1, r0) * tx) * (1 - ty) + (value(c0, r0 + 1) * (1 - tx) + value(c0 + 1, r0 + 1) * tx) * ty
        }
    }
    grid = blur(grid, nx: nx, ny: ny, sigma: 0.55 * Double(fine))
    let top = grid.max() ?? 0
    if top <= 0 { return levels.map { _ in [] } }
    for k in grid.indices { grid[k] /= top }
    // From sample space to the drawing: a cell is w / cols across.
    let sx = w / Double(cols) / Double(fine)
    let sy = h / Double(rows) / Double(fine)
    let ox = Double(-pad * fine)
    return levels.map { level in
        march(grid, nx: nx, ny: ny, level: level)
            .filter { $0.count >= 4 }
            .compactMap { ring in smooth(ring.map { Pt(x: ($0.x + ox) * sx, y: ($0.y + ox) * sy) }) }
    }
}

/// A separable Gaussian blur of the grid.
private func blur(_ grid: [Double], nx: Int, ny: Int, sigma: Double) -> [Double] {
    let radius = Int(ceil(sigma * 3))
    let kernel = (-radius...radius).map { k in exp(-Double(k * k) / (2 * sigma * sigma)) }
    let sum = kernel.reduce(0, +)
    let weights = kernel.map { $0 / sum }
    var across = [Double](repeating: 0, count: grid.count)
    for j in 0..<ny {
        for i in 0..<nx {
            var v = 0.0
            for k in -radius...radius {
                let x = i + k
                if x >= 0 && x < nx { v += grid[j * nx + x] * weights[k + radius] }
            }
            across[j * nx + i] = v
        }
    }
    var out = [Double](repeating: 0, count: grid.count)
    for j in 0..<ny {
        for i in 0..<nx {
            var v = 0.0
            for k in -radius...radius {
                let y = j + k
                if y >= 0 && y < ny { v += across[y * nx + i] * weights[k + radius] }
            }
            out[j * nx + i] = v
        }
    }
    return out
}

/// Marching squares: the closed rings where the field crosses the level, in sample coordinates. The
/// grid's edge is empty ground, so every ring closes; a saddle is split by the middle's value.
func march(_ grid: [Double], nx: Int, ny: Int, level: Double) -> [[Pt]] {
    // An edge's crossing, keyed by which edge: horizontal edges from (i, j) to (i + 1, j), vertical from (i, j) to (i, j + 1).
    func key(_ horizontal: Bool, _ i: Int, _ j: Int) -> Int { (horizontal ? 0 : 1) + 2 * (i + j * nx) }
    func point(_ k: Int) -> Pt {
        let horizontal = k % 2 == 0
        let n = k / 2
        let i = n % nx
        let j = n / nx
        let a = grid[j * nx + i]
        let b = horizontal ? grid[j * nx + i + 1] : grid[(j + 1) * nx + i]
        let t = b == a ? 0.5 : (level - a) / (b - a)
        return horizontal ? Pt(x: Double(i) + t, y: Double(j)) : Pt(x: Double(i), y: Double(j) + t)
    }
    // In the order they're first met, as the website's Map keeps them, so rings start where its do.
    var links: [Int: [Int]] = [:]
    var order: [Int] = []
    func link(_ p: Int, _ q: Int) {
        if links[p] == nil { order.append(p) }
        links[p, default: []].append(q)
        if links[q] == nil { order.append(q) }
        links[q, default: []].append(p)
    }
    for j in 0..<(ny - 1) {
        for i in 0..<(nx - 1) {
            let a = grid[j * nx + i] > level
            let b = grid[j * nx + i + 1] > level
            let c = grid[(j + 1) * nx + i + 1] > level
            let d = grid[(j + 1) * nx + i] > level
            let top = key(true, i, j)
            let right = key(false, i + 1, j)
            let bottom = key(true, i, j + 1)
            let left = key(false, i, j)
            var crossed: [Int] = []
            if a != b { crossed.append(top) }
            if b != c { crossed.append(right) }
            if c != d { crossed.append(bottom) }
            if d != a { crossed.append(left) }
            if crossed.count == 2 {
                link(crossed[0], crossed[1])
            } else if crossed.count == 4 {
                let middle = (grid[j * nx + i] + grid[j * nx + i + 1] + grid[(j + 1) * nx + i + 1] + grid[(j + 1) * nx + i]) / 4 > level
                if middle == a {
                    link(top, right)
                    link(bottom, left)
                } else {
                    link(left, top)
                    link(right, bottom)
                }
            }
        }
    }
    var seen = Set<Int>()
    var rings: [[Pt]] = []
    for start in order where !seen.contains(start) {
        var ring = [start]
        seen.insert(start)
        var current = start
        while let next = links[current]?.first(where: { !seen.contains($0) }) {
            seen.insert(next)
            ring.append(next)
            current = next
        }
        rings.append(simplify(ring.map(point)))
    }
    return rings
}

/// Drops points closer than about a third of a sample to the last kept, so curves stay light.
private func simplify(_ ring: [Pt]) -> [Pt] {
    var out: [Pt] = []
    for p in ring {
        if let last = out.last, hypot(p.x - last.x, p.y - last.y) <= 0.35 { continue }
        out.append(p)
    }
    return out
}

/// A closed ring as a smooth ring through its points (Catmull-Rom, as cubic curves), or nil under three points.
func smooth(_ ring: [Pt]) -> SmoothRing? {
    let count = ring.count
    if count < 3 { return nil }
    let curves = (0..<count).map { i -> Cubic in
        let p0 = ring[(i - 1 + count) % count]
        let p1 = ring[i]
        let p2 = ring[(i + 1) % count]
        let p3 = ring[(i + 2) % count]
        return Cubic(
            c1: Pt(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6),
            c2: Pt(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6),
            to: p2
        )
    }
    return SmoothRing(start: ring[0], curves: curves)
}

/// A level's rings as SVG path data, exactly as the website writes them (a tenth of a metre), to compare the copies.
func svgPath(_ rings: [SmoothRing]) -> String {
    rings.map { ring in
        var d = "M\(tenth(ring.start.x)) \(tenth(ring.start.y))"
        for c in ring.curves {
            d += "C\(tenth(c.c1.x)) \(tenth(c.c1.y)) \(tenth(c.c2.x)) \(tenth(c.c2.y)) \(tenth(c.to.x)) \(tenth(c.to.y))"
        }
        return d + "Z"
    }.joined()
}

/// A number to a tenth as JavaScript prints Math.round(v * 10) / 10: "17.5", "2", "-0.5".
private func tenth(_ v: Double) -> String {
    let r = Int(floor(v * 10 + 0.5))
    if r == 0 { return "0" }
    let sign = r < 0 ? "-" : ""
    let a = abs(r)
    return a % 10 == 0 ? "\(sign)\(a / 10)" : "\(sign)\(a / 10).\(a % 10)"
}
