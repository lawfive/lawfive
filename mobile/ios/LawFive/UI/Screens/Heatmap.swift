import SwiftUI

// Where on the pitch (TRK-9, WEB-24), as the website's PitchHeatmap draws it (and Android's), "painted
// on the grass": the time in each cell of the grid the server sends with the track (turned as the match
// page turns it) as six contour bands rising from the grass's green to pale mint (Data/Contours.swift,
// the website's contours.ts), under the pitch's chalk markings (scaled from Law 1's) with a thin dark
// edge so they hold on the palest band, the pitch's length and width marked outside the lines, on the
// board; for the match or one period. Always the ground seen from above, never mirrored.

struct Heat: Codable, Sendable {
    var cols: Int
    var rows: Int
    var lengthM: Double
    var widthM: Double
    var total: [Double]
    var periods: [HeatPeriod]?
}

struct HeatPeriod: Codable, Sendable {
    var period: Int
    var cells: [Double]
}

/// TRK-9: a row under the drawing: the team attacking from the left goal line and from the right, and the periods it's for ("1st half", "P1, P3").
struct HeatEnds {
    let label: String
    let left: Team
    let leftHome: Bool
    let right: Team
    let rightHome: Bool
}

/// A standard pitch (Law 1), which the markings are scaled from; Stats draws on one.
private let standardLength = 105.0
private let standardWidth = 68.0
/// Room above and to the left of the drawing for the dimensions, and beyond it on the right and below, in metres.
private let room = 9.0

/// A match's heatmap on its slab (WEB-28: Where on the pitch, From above, not cut, as Stats'): the
/// periods to choose from (Match, then each), the painted pitch, and which way a team attacked
/// (`attacks`, for the period chosen or the match) beside the key.
struct HeatmapCard: View {
    let heat: Heat
    /// The match's, for its periods.
    let format: MatchFormat?
    let unit: String
    /// TRK-9: under the drawing, each end's team at its goal line, for the match or a period.
    var ends: (Int?) -> [HeatEnds] = { _ in [] }
    let attacks: (Int?) -> String?
    @State private var period: Int?

    private func shortName(_ p: Int, _ format: MatchFormat) -> String {
        if p > format.periods { return "ET\(p - format.periods)" }
        return format.periods == 2 ? periodName(format, period: p) : "P\(p)"
    }

    var body: some View {
        let periods = heat.periods ?? []
        let cells = period.flatMap { p in periods.first { $0.period == p }?.cells } ?? heat.total
        Slab(title: "Where on the pitch", tag: "From above") {
            VStack(alignment: .leading, spacing: 14) {
                if let format, periods.count > 1 {
                    // Where they don't fit (the narrowest phones, large text) the periods share the board's width,
                    // "Second half" over two lines in its button, as on the website.
                    let options = [(Int?.none, "Match")] + periods.map { (Int?.some($0.period), shortName($0.period, format)) }
                    ViewThatFits(in: .horizontal) {
                        Segmented(options: options, selected: $period)
                        Segmented(options: options, selected: $period, fill: true, wrap: true).frame(maxWidth: .infinity)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                PitchHeatmap(cols: heat.cols, rows: heat.rows, cells: cells, unit: unit,
                             label: "Where you spent \(period.flatMap { p in format.map { "the \(periodName($0, period: p).lowercased())" } } ?? "the match"), on the pitch",
                             lengthM: heat.lengthM, widthM: heat.widthM, attacks: attacks(period), ends: ends(period))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// The pitch painted on the grass (TRK-9, WEB-24): the ground with flat mowing stripes, the time as
/// contour bands, the chalk markings, the length along the top and the width down the left outside the
/// lines (in metres, or yards with miles), and the key under it (LESS, the ground and the six bands,
/// MORE TIME) with `attacks` on its left. With `thirds` (Stats), the share of the time in each third of
/// the length under the pitch and of the width beside it, lined up with its thirds.
struct PitchHeatmap: View {
    let cols: Int
    let rows: Int
    let cells: [Double]
    let unit: String
    let label: String
    var lengthM = standardLength
    var widthM = standardWidth
    var attacks: String?
    var thirds: Thirds?
    /// TRK-9: under the drawing, each end's team at its goal line, a row for each way round.
    var ends: [HeatEnds] = []
    @State private var width: CGFloat = 320

    var body: some View {
        // The drawing in metres: the pitch with its margins (wider beyond the touchlines, where
        // assistants run), the room for the dimensions above and to the left.
        let w = lengthM * (1 + 2 * heatMarginLength)
        let h = widthM * (1 + 2 * heatMarginWidth)
        let viewW = w + room + 1
        let viewH = h + room + 1
        let left = lengthM * heatMarginLength
        let top = widthM * heatMarginWidth
        let narrow = width < 300
        let side: CGFloat = thirds == nil ? 0 : narrow ? 42 : 52
        let gap: CGFloat = thirds == nil ? 0 : 8
        let drawingW = max(100, width - side - gap)
        let k = drawingW / viewW
        let drawingH = k * viewH
        // The dimensions' figures fit the room beside the lines: 14 pt, smaller on a narrow drawing.
        let figure = min(14, max(10, k * room * 0.8))
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: gap) {
                PitchDrawing(cols: cols, rows: rows, cells: cells, lengthM: lengthM, widthM: widthM, unit: unit, figure: figure)
                    .frame(width: drawingW, height: drawingH)
                    .accessibilityElement()
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(.isImage)
                if let thirds {
                    ZStack(alignment: .topLeading) {
                        Text("ACROSS").font(LfFace.mono.font(9.5)).tracking(0.76).foregroundStyle(LF.onBoardMuted).lineLimit(1).minimumScaleFactor(0.7)
                            .frame(width: side).offset(y: k * (room + top) - 18)
                        VStack(spacing: 0) {
                            ForEach(Array(thirds.width.enumerated()), id: \.offset) { i, share in ThirdCell(share: share, narrow: narrow).padding(.top, i > 0 ? 3 : 0) }
                        }
                        .frame(width: side, height: k * widthM)
                        .offset(y: k * (room + top))
                    }
                    .frame(width: side, height: drawingH, alignment: .topLeading)
                    .accessibilityHidden(true)
                }
            }
            if let thirds {
                HStack(spacing: 0) {
                    ForEach(Array(thirds.length.enumerated()), id: \.offset) { i, share in ThirdCell(share: share, narrow: narrow).padding(.leading, i > 0 ? 3 : 0) }
                }
                .frame(width: k * lengthM, height: 38)
                .padding(.leading, k * (room + left)).padding(.top, 10)
                .accessibilityHidden(true)
                Text("TIME IN EACH THIRD OF THE LENGTH").font(LfFace.mono.font(9.5)).tracking(0.76).foregroundStyle(LF.onBoardMuted)
                    .lineLimit(1).minimumScaleFactor(0.7)
                    .frame(width: k * lengthM).padding(.leading, k * (room + left)).padding(.top, 8)
                    .accessibilityHidden(true)
            }
            if !ends.isEmpty {
                // Under the drawing, each end at its goal line, as the website's.
                VStack(spacing: 8) {
                    ForEach(Array(ends.enumerated()), id: \.offset) { _, e in PitchEndsRow(e: e) }
                }
                .frame(width: k * lengthM)
                .padding(.leading, k * (room + left)).padding(.top, 8)
            }
            HeatKey(attacks: attacks).padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { WidthReader(width: $width) }
    }
}

/// TRK-9: a row of the ends: the left team's short name on its color with an arrow to the right, the
/// periods, and the right team's with an arrow to the left.
private struct PitchEndsRow: View {
    let e: HeatEnds

    var body: some View {
        let left = teamAlias(e.left, other: e.right, home: e.leftHome)
        let right = teamAlias(e.right, other: e.left, home: e.rightHome)
        HStack(spacing: 0) {
            // The teams keep their size at each goal line; the periods between them step down to fit.
            HStack(spacing: 4) {
                TeamBadge(team: e.left, other: e.right, home: e.leftHome)
                PhIcon(.open, size: 18, tint: LF.text)
            }
            .fixedSize()
            Text(e.label.uppercased()).lfLabel(11, spacing: 0.08).foregroundStyle(LF.muted)
                .lineLimit(1).minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity).padding(.horizontal, 6)
            HStack(spacing: 4) {
                // Phosphor's ArrowLeft is ArrowRight turned round.
                PhIcon(.open, size: 18, tint: LF.text).rotationEffect(.degrees(180))
                TeamBadge(team: e.right, other: e.left, home: e.rightHome)
            }
            .fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(e.label): \(left) attacking left to right, \(right) attacking right to left")
    }
}

/// The key: which way a team attacked on the left, LESS, the ground and the six bands, MORE TIME on the right.
private struct HeatKey: View {
    let attacks: String?

    private var scale: some View {
        HStack(spacing: 10) {
            Text("LESS").lfLabel(11, spacing: 0.08).foregroundStyle(LF.muted)
            HStack(spacing: 2) {
                ForEach(0..<7, id: \.self) { i in
                    Rectangle().fill(i == 0 ? LF.contourGround : LF.contour[i - 1]).frame(width: 15, height: 12)
                        .overlay { Rectangle().strokeBorder(Color.black.opacity(0.18), lineWidth: 1) }
                }
            }
            Text("MORE TIME").lfLabel(11, spacing: 0.08).foregroundStyle(LF.muted)
        }
        .lineLimit(1)
        .fixedSize()
        .accessibilityHidden(true)
    }

    var body: some View {
        if let attacks {
            let words = Text(attacks).font(.barlow(13.5, .semibold, relativeTo: .footnote)).foregroundStyle(LF.text)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 14) { words.fixedSize(); Spacer(minLength: 0); scale }
                VStack(alignment: .trailing, spacing: 6) {
                    words.fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    scale
                }
            }
        } else {
            HStack { Spacer(minLength: 0); scale }
        }
    }
}

/// The drawing itself, in metres scaled to fit: the grass, the bands, the markings and the dimensions.
private struct PitchDrawing: View {
    let cols: Int
    let rows: Int
    let cells: [Double]
    let lengthM: Double
    let widthM: Double
    let unit: String
    let figure: CGFloat
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let w = lengthM * (1 + 2 * heatMarginLength)
        let h = widthM * (1 + 2 * heatMarginWidth)
        let bands = heatContours(cells, cols: cols, rows: rows, w: w, h: h)
        // At a night match the chalk is at 70%.
        let chalk = LF.chalk.opacity(scheme == .dark ? 0.7 : 1)
        let lengthText = Text(formatPitchSize(lengthM, unit: unit)).font(.custom("BarlowCondensed-ExtraBoldItalic", fixedSize: figure)).foregroundStyle(LF.text)
        let widthText = Text(formatPitchSize(widthM, unit: unit)).font(.custom("BarlowCondensed-ExtraBoldItalic", fixedSize: figure)).foregroundStyle(LF.text)
        Canvas { c, size in
            let k = size.width / (w + room + 1)
            let left = lengthM * heatMarginLength
            let top = widthM * heatMarginWidth
            let length = lengthM
            let width = widthM
            let scale = min(lengthM / standardLength, widthM / standardWidth)
            let cx = left + length / 2
            let cy = top + width / 2
            let r = 9.15 * scale
            // Everything in metres from the drawing's top left; the dimensions sit in the room above and to the left.
            func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: (room + x) * k, y: (room + y) * k) }
            let ground = Path(roundedRect: CGRect(origin: p(0, 0), size: CGSize(width: w * k, height: h * k)), cornerRadius: k)
            c.fill(ground, with: .color(LF.contourGround))
            c.drawLayer { g in
                g.clip(to: ground)
                // Flat mowing stripes, a tenth of the drawing's length each.
                let stripe = w / 10
                for i in 0..<5 {
                    g.fill(Path(CGRect(origin: p(Double(2 * i + 1) * stripe, 0), size: CGSize(width: stripe * k, height: h * k))), with: .color(LF.contourStripe))
                }
                let paths = bands.map { rings in
                    Path { path in
                        for ring in rings {
                            path.move(to: p(ring.start.x, ring.start.y))
                            for cu in ring.curves { path.addCurve(to: p(cu.to.x, cu.to.y), control1: p(cu.c1.x, cu.c1.y), control2: p(cu.c2.x, cu.c2.y)) }
                            path.closeSubpath()
                        }
                    }
                }
                for (i, band) in paths.enumerated() { g.fill(band, with: .color(LF.contour[i]), style: FillStyle(eoFill: true)) }
                for band in paths { g.stroke(band, with: .color(LF.contourLine.opacity(0.5)), lineWidth: 0.8) }
            }
            // The markings as one path, so the dark edge under them and the chalk over them match.
            let markings = Path { m in
                m.addRect(CGRect(origin: p(left, top), size: CGSize(width: length * k, height: width * k)))
                m.move(to: p(cx, top)); m.addLine(to: p(cx, top + width))
                m.addEllipse(in: CGRect(x: (room + cx - r) * k, y: (room + cy - r) * k, width: 2 * r * k, height: 2 * r * k))
                for (depth, span) in [(16.5, 40.32), (5.5, 18.32)] {
                    let d = depth * scale
                    let s = min(span * scale, width)
                    m.move(to: p(left, top + (width - s) / 2)); m.addLine(to: p(left + d, top + (width - s) / 2))
                    m.addLine(to: p(left + d, top + (width + s) / 2)); m.addLine(to: p(left, top + (width + s) / 2))
                    m.move(to: p(left + length, top + (width - s) / 2)); m.addLine(to: p(left + length - d, top + (width - s) / 2))
                    m.addLine(to: p(left + length - d, top + (width + s) / 2)); m.addLine(to: p(left + length, top + (width + s) / 2))
                }
                // The arcs at the penalty areas (the D), outside the areas only.
                let dx = 5.5 * scale
                if dx < r {
                    let turn = acos(dx / r)
                    let spotL = p(left + 11 * scale, cy)
                    let spotR = p(left + length - 11 * scale, cy)
                    m.move(to: CGPoint(x: spotL.x + r * k * cos(-turn), y: spotL.y + r * k * sin(-turn)))
                    m.addArc(center: spotL, radius: r * k, startAngle: .radians(-turn), endAngle: .radians(turn), clockwise: false)
                    m.move(to: CGPoint(x: spotR.x + r * k * cos(.pi + turn), y: spotR.y + r * k * sin(.pi + turn)))
                    m.addArc(center: spotR, radius: r * k, startAngle: .radians(.pi + turn), endAngle: .radians(.pi - turn), clockwise: true)
                }
            }
            c.stroke(markings, with: .color(LF.contourCase.opacity(0.38)), style: StrokeStyle(lineWidth: 3.4, lineJoin: .round))
            c.stroke(markings, with: .color(chalk), lineWidth: 1.7)
            func spot(_ at: CGPoint, _ radius: Double) -> Path { Path(ellipseIn: CGRect(x: at.x - radius * k, y: at.y - radius * k, width: 2 * radius * k, height: 2 * radius * k)) }
            c.fill(spot(p(cx, cy), 0.65), with: .color(chalk))
            c.fill(spot(p(left + 11 * scale, cy), 0.5), with: .color(chalk))
            c.fill(spot(p(left + length - 11 * scale, cy), 0.5), with: .color(chalk))
            // The dimensions, outside the lines: the length along the top, the width down the left.
            let dims = -5.0
            let tick = 1.6
            let lines = Path { d in
                d.move(to: p(left, top)); d.addLine(to: p(left, dims - tick))
                d.move(to: p(left + length, top)); d.addLine(to: p(left + length, dims - tick))
                d.move(to: p(left, dims)); d.addLine(to: p(left + length, dims))
                d.move(to: p(left, top)); d.addLine(to: p(dims - tick, top))
                d.move(to: p(left, top + width)); d.addLine(to: p(dims - tick, top + width))
                d.move(to: p(dims, top)); d.addLine(to: p(dims, top + width))
            }
            c.stroke(lines, with: .color(LF.text.opacity(0.6)), lineWidth: 1)
            let ticks = Path { t in
                for (tx, ty) in [(left, dims), (left + length, dims), (dims, top), (dims, top + width)] {
                    t.move(to: p(tx - tick, ty + tick)); t.addLine(to: p(tx + tick, ty - tick))
                }
            }
            c.stroke(ticks, with: .color(LF.text), lineWidth: 1.6)
            func dimension(_ text: Text, at: CGPoint, turned: Bool) {
                let laid = c.resolve(text)
                let s = laid.measure(in: CGSize(width: 200, height: 50))
                c.drawLayer { g in
                    g.translateBy(x: at.x, y: at.y)
                    if turned { g.rotate(by: .degrees(-90)) }
                    g.fill(Path(CGRect(x: -s.width / 2 - 8, y: -s.height / 2, width: s.width + 16, height: s.height)), with: .color(LF.surface))
                    g.draw(laid, at: .zero, anchor: .center)
                }
            }
            dimension(lengthText, at: p(cx, dims), turned: false)
            dimension(widthText, at: p(dims, cy), turned: true)
        }
    }
}

/// A third's share in the heatmap's own bands: chalk figures, board-black on the three palest bands by
/// day (at night the bands are dim, so all chalk).
private struct ThirdCell: View {
    let share: Int
    let narrow: Bool
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let step = thirdStep(share)
        let ink = step >= 4 && scheme != .dark ? Color(uiColor: UIColor(hex: 0x0E1311)) : LF.chalk
        Text("\(share)%").font(LfFace.display.font(narrow ? 16 : 20)).foregroundStyle(ink).lineLimit(1).fixedSize().padding(.trailing, 1)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(LF.contour[step - 1])
    }
}
