import SwiftUI

// WEB-24: Stats' graphics in the broadcast stats package, as the website's boardCharts.tsx and
// Android's BoardCharts.kt: a head-to-head bar whose parts meet on the kits' diagonal, slanted bars
// with their values written beside them, columns with their values over them, and time split across
// bands with the shares on elbows over a bar. Each is honest: lengths and heights are to scale, and
// the values are written. Each is one element for VoiceOver, with a summary of what it shows (STAT-13).

/// A part of a whole: how much, and its color.
struct Share {
    let value: Double
    let color: Color
}

/// Parts of a whole side by side, each as long as its share (at least 20 pt), meeting on the diagonal:
/// paid v owed, referee v assistant. Drawn only; the words are the caller's.
struct HeadToHead: View {
    let parts: [Share]
    var height: CGFloat = 32

    var body: some View {
        Canvas { c, size in
            let shown = parts.filter { $0.value > 0 }
            guard !shown.isEmpty else { return }
            let cut: CGFloat = 14
            let overlap: CGFloat = 10
            let least: CGFloat = 20
            let room = size.width + overlap * CGFloat(shown.count - 1)
            let total = shown.reduce(0) { $0 + $1.value }
            var widths = shown.map { max(least, CGFloat($0.value / total) * room) }
            // What the least widths added comes off the widest.
            let over = widths.reduce(0, +) - room
            if over > 0, let widest = widths.indices.max(by: { widths[$0] < widths[$1] }) { widths[widest] -= over }
            var x: CGFloat = 0
            for (i, p) in shown.enumerated() {
                let x1 = x + widths[i]
                let path = Path { q in
                    q.move(to: CGPoint(x: i == 0 ? x : x + cut, y: 0))
                    q.addLine(to: CGPoint(x: x1, y: 0))
                    q.addLine(to: CGPoint(x: i == shown.count - 1 ? x1 : x1 - cut, y: size.height))
                    q.addLine(to: CGPoint(x: x, y: size.height))
                    q.closeSubpath()
                }
                c.fill(path, with: .color(p.color))
                x = x1 - overlap
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// A row of slanted bars: its label (with an icon), how much, how it's written, its color.
struct SlantBar: Identifiable {
    let label: String
    let value: Double
    let display: String
    let color: Color
    var icon: Ph?
    var id: String { label }
}

/// Slanted bars, a row each, as the website's at a phone's width: the label over its bar, the bar to
/// scale, its value in black italic beside it.
struct SlantBars: View {
    let rows: [SlantBar]

    var body: some View {
        let most = max(rows.map(\.value).max() ?? 0, 0) > 0 ? rows.map(\.value).max()! : 1
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        if let icon = r.icon { PhIcon(icon, size: 18, tint: LF.muted) }
                        Text(r.label).font(.barlow(16, .semibold)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                    }
                    GeometryReader { geo in
                        HStack(spacing: 12) {
                            SlantShape(left: 12, right: 12).fill(r.color)
                                .frame(width: max(14, (geo.size.width - 96) * CGFloat(r.value / most)), height: 18)
                            Text(r.display).font(LfFace.display.font(26)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize().padding(.trailing, 2)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .frame(height: 30)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(r.label): \(r.display)")
            }
        }
    }
}

/// A column: its label under it, its value written over it, how much, and itself in words.
struct BoardColumn {
    let label: String
    let value: Double
    let display: String
    let describe: String
}

/// Columns to scale on the board with their values over them and labels under (the website's
/// `BoardColumns`); a tap on one says what's in it above them, as the phones have no hover (STAT-13).
struct BoardColumns: View {
    let columns: [BoardColumn]
    let color: Color
    let summary: String
    var height: CGFloat = 150
    @State private var picked: Int?

    var body: some View {
        let most = (columns.map(\.value).max() ?? 0) > 0 ? columns.map(\.value).max()! : 1
        VStack(alignment: .leading, spacing: 4) {
            Text(picked.map { columns[$0].describe } ?? "Tap a column to see what's in it")
                .font(.lfBodySmall).foregroundStyle(picked != nil ? LF.text : LF.muted)
                .lineLimit(2).frame(minHeight: 36, alignment: .topLeading)
                .accessibilityHidden(true)
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(columns.enumerated()), id: \.offset) { i, col in
                    Button {
                        picked = picked == i ? nil : i
                    } label: {
                        VStack(spacing: 0) {
                            Text(col.display).font(LfFace.display.font(22)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize().padding(.bottom, 5)
                            GeometryReader { geo in
                                Rectangle().fill(color).frame(width: min(geo.size.width * 0.76, 56)).frame(maxWidth: .infinity)
                            }
                            .frame(height: height * CGFloat(col.value / most))
                            Text(col.label.uppercased()).lfWord(16).foregroundStyle(LF.onBoard).lineLimit(1).fixedSize().padding(.top, 8).padding(.bottom, 4)
                        }
                        .padding(.top, 6)
                        .frame(maxWidth: .infinity)
                        .background(picked == i ? LF.surface2 : Color.clear, in: RoundedRectangle(cornerRadius: 4))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(summary)
        }
    }
}

/// A band of time: its name, a line under it (a speed or a heart rate), how long, its color.
struct TimeBand {
    let name: String
    let sub: String
    let sec: Double
    let color: Color
}

/// Time split across ordered bands (the website's elbow bar): one bar to scale, the shares over it in
/// columns with elbows down to their parts; `stepped` raises each zone a step, as heart-rate zones.
struct ElbowBar: View {
    let bands: [TimeBand]
    let summary: String
    var stepped = false

    var body: some View {
        let pcts = shares(bands.map(\.sec))
        let total = max(bands.reduce(0) { $0 + $1.sec }, 0) > 0 ? bands.reduce(0) { $0 + $1.sec } : 1
        let n = max(1, bands.count)
        let barHeight: CGFloat = stepped ? 84 : 36
        let room = { (column: CGFloat) in column * CGFloat(n) + 4 * CGFloat(n - 1) }
        let words = bands.flatMap { $0.name.uppercased().split(separator: " ").map(String.init) }
        // One size for every share and one for every name, the largest at which each fits its column
        // (the room shared equally), so a long word never breaks; chosen by ViewThatFits, as WordFit.
        return VStack(spacing: 4) {
            ViewThatFits(in: .horizontal) {
                ForEach(steps(from: 28, to: 14, factor: 0.92), id: \.self) { f in
                    HStack(alignment: .top, spacing: 4) {
                        ForEach(Array(pcts.enumerated()), id: \.offset) { _, p in
                            Text("\(p)%").font(LfFace.display.font(f)).foregroundStyle(LF.onBoardStrong).lineLimit(1).fixedSize().frame(maxWidth: .infinity)
                        }
                    }
                    .frame(idealWidth: room(pcts.map { LfFace.display.width("\($0)%", f) }.max() ?? 0), maxWidth: .infinity)
                }
            }
            ViewThatFits(in: .horizontal) {
                ForEach(steps(from: grown(14, .footnote), to: 7, factor: 0.92), id: \.self) { w in
                    HStack(alignment: .top, spacing: 4) {
                        ForEach(Array(bands.enumerated()), id: \.offset) { _, b in
                            Text(b.name.uppercased()).font(LfFace.word.font(w)).tracking(w * 0.05).lineSpacing(-w * 0.15)
                                .foregroundStyle(LF.onBoard).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .frame(idealWidth: room(words.map { LfFace.word.width($0, w, tracking: 0.05) }.max() ?? 0), maxWidth: .infinity)
                }
            }
            .padding(.bottom, -4)
            Canvas { c, size in
                var from = 0.0
                for (i, b) in bands.enumerated() {
                    let center = CGFloat(from + b.sec / total / 2) * size.width
                    from += b.sec / total
                    guard b.sec > 0 else { continue }
                    let top = (CGFloat(i) + 0.5) / CGFloat(n) * size.width
                    let path = Path { p in
                        p.move(to: CGPoint(x: top, y: 0))
                        p.addLine(to: CGPoint(x: top, y: size.height * 8 / 24))
                        p.addLine(to: CGPoint(x: center, y: size.height * 18 / 24))
                        p.addLine(to: CGPoint(x: center, y: size.height))
                    }
                    c.stroke(path, with: .color(LF.onBoardDim), lineWidth: 1.5)
                }
            }
            .frame(height: 28)
            GeometryReader { geo in
                let shown = bands.enumerated().filter { $0.element.sec > 0 }
                let gaps = 2 * CGFloat(max(0, shown.count - 1))
                // Each part at least 3 pt, the rest shared by time.
                let room = max(0, geo.size.width - gaps - 3 * CGFloat(shown.count))
                HStack(alignment: .bottom, spacing: 2) {
                    ForEach(shown, id: \.offset) { i, b in
                        Rectangle().fill(b.color)
                            .frame(width: 3 + room * CGFloat(b.sec / total), height: stepped ? barHeight * (0.2 + CGFloat(i + 1) * 0.16) : barHeight)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
            .frame(height: barHeight)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
    }
}
