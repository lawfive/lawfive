import SwiftUI

// Pitch & Scoreboard's own pieces (IOS-13, WEB-24, DESIGN.md "Components"), as the website and
// Android draw them: the grass and its mowing stripes, the chalk markings (the pitch frame, the halfway
// line), stadium boards with their lit dots, the kits cut on the diagonal, the cards, and the L5 mark
// (WEB-25).

/// Chalk markings are 3 pt.
let chalkWidth: CGFloat = 3
/// The touchlines sit 8 pt in from the screen's edge, the words 21 pt in (as the website's on phones).
let touchline: CGFloat = 8
let pagePad: CGFloat = 21

/// The grass with its mowing stripes: wide, quiet bands (256 pt, the darker one close to the grass),
/// each edge blended over 120 pt, so nothing catches the eye. They stay put as the page scrolls.
struct PitchStripes: View {
    var body: some View {
        GeometryReader { geo in
            let band: CGFloat = 256
            let blend: CGFloat = 120
            let period = 2 * band
            let count = Int(ceil(geo.size.height / period)) + 1
            ZStack(alignment: .top) {
                LF.pitch
                VStack(spacing: 0) {
                    ForEach(0..<count, id: \.self) { _ in
                        LinearGradient(stops: [
                            .init(color: LF.pitchStripe, location: 0),
                            .init(color: LF.pitch, location: blend / (2 * band)),
                            .init(color: LF.pitch, location: 0.5),
                            .init(color: LF.pitchStripe, location: (band + blend) / (2 * band)),
                            .init(color: LF.pitchStripe, location: 1),
                        ], startPoint: .top, endPoint: .bottom)
                        .frame(height: period)
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
            .clipped()
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// The pitch frame (DESIGN.md "Shape and surface"): touchlines 8 pt in from the screen's edges, the
/// goal line across the top of a page's first row and under its last, with a quarter circle at each
/// corner, as a pitch's corner arcs. It scrolls with the page; on a short page it runs to the foot of
/// what's showing (`minHeight`).
struct PitchMarkings: View {
    var top = true
    var bottom = true

    var body: some View {
        Canvas { c, size in
            let w = chalkWidth
            let inset = touchline + w / 2
            let arc: CGFloat = 22
            let left = inset
            let right = size.width - inset
            let y0 = w / 2
            let y1 = size.height - w / 2
            let line = GraphicsContext.Shading.color(LF.chalkLine)
            var p = Path()
            p.move(to: CGPoint(x: left, y: top ? y0 : -10))
            p.addLine(to: CGPoint(x: left, y: bottom ? y1 : size.height + 10))
            p.move(to: CGPoint(x: right, y: top ? y0 : -10))
            p.addLine(to: CGPoint(x: right, y: bottom ? y1 : size.height + 10))
            if top {
                p.move(to: CGPoint(x: left - w / 2, y: y0))
                p.addLine(to: CGPoint(x: right + w / 2, y: y0))
                p.addArc(center: CGPoint(x: left, y: y0), radius: arc, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
                p.move(to: CGPoint(x: right - arc, y: y0))
                p.addArc(center: CGPoint(x: right, y: y0), radius: arc, startAngle: .degrees(180), endAngle: .degrees(90), clockwise: true)
            }
            if bottom {
                p.move(to: CGPoint(x: left - w / 2, y: y1))
                p.addLine(to: CGPoint(x: right + w / 2, y: y1))
                p.move(to: CGPoint(x: left + arc, y: y1))
                p.addArc(center: CGPoint(x: left, y: y1), radius: arc, startAngle: .degrees(0), endAngle: .degrees(-90), clockwise: true)
                p.move(to: CGPoint(x: right - arc, y: y1))
                p.addArc(center: CGPoint(x: right, y: y1), radius: arc, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            }
            c.stroke(p, with: line, lineWidth: w)
        }
        .accessibilityHidden(true)
    }
}

extension View {
    /// Widens past the page's padding to the touchlines (the halfway line runs touchline to touchline).
    func toTouchlines() -> some View {
        padding(.horizontal, -(pagePad - touchline - chalkWidth))
    }

    /// A hard drop under a surface (3 pt straight down, no blur): a panel's by day, a primary button's.
    func hardDrop<S: Shape>(_ color: Color, _ shape: S, offset: CGFloat = 3) -> some View {
        background(shape.fill(color).offset(y: offset))
    }
}

/// The halfway line, touchline to touchline, with the center spot: it divides a page's halves.
struct Halfway: View {
    var body: some View {
        Canvas { c, size in
            let y = size.height / 2
            c.stroke(Path { $0.move(to: CGPoint(x: 0, y: y)); $0.addLine(to: CGPoint(x: size.width, y: y)) }, with: .color(LF.chalkLine), lineWidth: chalkWidth)
            c.fill(Path(ellipseIn: CGRect(x: size.width / 2 - 8, y: y - 8, width: 16, height: 16)), with: .color(LF.chalkLine))
        }
        .frame(height: 16)
        .toTouchlines()
        .accessibilityHidden(true)
    }
}

/// A heavy chalk rule (3 pt), as between a board's figures on the grass.
struct ChalkRule: View {
    var color: Color = LF.chalkLine
    var body: some View { Rectangle().fill(color).frame(height: chalkWidth).accessibilityHidden(true) }
}

/// The lit-dot matrix behind a board's biggest figures: 1.3 pt dots every 7 pt.
struct Dots: View {
    var color: Color = LF.boardDots

    var body: some View {
        Canvas { c, size in
            var p = Path()
            var y: CGFloat = 3
            while y < size.height + 7 {
                var x: CGFloat = 3
                while x < size.width + 7 {
                    p.addEllipse(in: CGRect(x: x - 1.3, y: y - 1.3, width: 2.6, height: 2.6))
                    x += 7
                }
                y += 7
            }
            c.fill(p, with: .color(color))
        }
        .accessibilityHidden(true)
    }
}

/// A stadium board (DESIGN.md "Boards"): near black, 6 pt corners, a hard drop and a soft shadow by
/// day, a 1 pt lighter edge at night; what's in it takes the board's colors.
struct Board<Content: View>: View {
    var shadow = true
    var spacing: CGFloat = 0
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        VStack(alignment: .leading, spacing: spacing, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LF.board)
            .clipShape(shape)
            .overlay { if scheme == .dark { shape.stroke(LF.boardEdge, lineWidth: 1) } }
            .background {
                if shadow && scheme != .dark {
                    shape.fill(Color.black.opacity(0.3)).offset(y: 3)
                        .shadow(color: .black.opacity(0.35), radius: 10, y: 6)
                }
            }
            .ground(.board)
    }
}

/// A board's head: the mint label on the left, small muted words on the right, then anything else.
struct BoardHead<Trailing: View>: View {
    let label: String
    var about: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Text(label.uppercased()).lfLabel(11).foregroundStyle(LF.boardAccent).lineLimit(1).layoutPriority(1)
            Text(about?.uppercased() ?? "").lfLabel(11).foregroundStyle(LF.onBoardMuted).lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .trailing)
            trailing()
        }
        .padding(.horizontal, 14).padding(.top, 12)
    }
}

extension BoardHead where Trailing == EmptyView {
    init(_ label: String, about: String? = nil) {
        self.label = label
        self.about = about
        trailing = { EmptyView() }
    }
}

/// A team's kit color, or the board's blank kit for a team with none.
func kitColor(_ team: Team) -> Color { parseColor(team.colour)?.color ?? LF.kitBlank }

/// A kit panel's words: black or white by contrast, as on the watch.
func kitInk(_ team: Team) -> Color { parseColor(team.colour).map(textOn) ?? .white }

/// A kit cut on the diagonal where it meets the other: home's right edge leans, away's left.
struct KitCut: Shape {
    let home: Bool
    let cut: CGFloat

    func path(in r: CGRect) -> Path {
        Path { p in
            if home {
                p.move(to: CGPoint(x: r.minX, y: r.minY))
                p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
                p.addLine(to: CGPoint(x: r.maxX - cut, y: r.maxY))
                p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            } else {
                p.move(to: CGPoint(x: r.minX + cut, y: r.minY))
                p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
                p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
                p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            }
            p.closeSubpath()
        }
    }
}

enum KitSize { case small, normal, large }

/// The two kits side by side (WEB-24, `KitPanels`): home on the left, each a panel in its color with
/// the name in black italic capitals in black or white by contrast, cut on the diagonal where they
/// meet; something can sit on the board between them (the score). A name never sets larger than 22%
/// of what its panel holds; a long word steps down until it fits rather than breaking, and a long
/// name wraps between words up to the kits' lines, the kits growing taller for it at large text.
struct KitPanels<Middle: View>: View {
    let home: Team
    let away: Team
    var size: KitSize = .normal
    var labels = false
    var lines = 2
    /// About how wide what sits between the kits is, so the names can size to what's left.
    var middleWidth: CGFloat = 96
    var hasMiddle = false
    @ViewBuilder var middle: () -> Middle

    private var cut: CGFloat { size == .small ? 14 : size == .normal ? 22 : 18 }
    private var minHeight: CGFloat { size == .small ? 40 : size == .normal ? 64 : 76 }
    private var nameSize: CGFloat { size == .small ? 19 : size == .normal ? 24 : 26 }

    /// The width the row is offered, read as it's laid out, for the names' size.
    @State private var width: CGFloat = 0

    var body: some View {
        row
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }

    /// The row's least height: room for the label and the names' lines at the default text size. It
    /// grows for a name that takes more (large text), so a name is never cut.
    private var height: CGFloat {
        let label: CGFloat = labels ? 17 : 0
        return max(minHeight, 16 + label + nameSize * 0.95 * CGFloat(lines))
    }

    private var row: some View {
        let kitWidth = (width - (hasMiddle ? middleWidth : 0)) / 2
        let fit = (kitWidth - cut - 24) * 0.22
        // As Android's: never larger than 22% of what the panel holds nor than the size grown with the
        // phone's text size, and not under 14 pt grown; a name whose longest word still doesn't fit steps
        // down further (`WordFit`), wrapping between words.
        let name = min(max(fit, grown(14, .title3)), grown(nameSize, .title3))
        // Without anything between them, the away kit tucks under the diagonal, a 7 pt board gap between.
        let tuck = hasMiddle ? 0 : cut - 7
        return HStack(spacing: 0) {
            kit(home, home: true, name: name)
                .frame(width: width > 0 ? kitWidth : nil)
            if hasMiddle {
                middle().frame(maxHeight: .infinity)
            }
            kit(away, home: false, name: name)
                .frame(width: width > 0 ? kitWidth + tuck : nil)
                .padding(.leading, -tuck)
        }
        // As tall as the taller name needs, both kits that height.
        .fixedSize(horizontal: false, vertical: true)
    }

    private func kit(_ team: Team, home: Bool, name: CGFloat) -> some View {
        let ink = kitInk(team)
        let words = teamName(team, home: home).uppercased()
        let align: TextAlignment = home ? .leading : .trailing
        return VStack(alignment: home ? .leading : .trailing, spacing: 3) {
            if labels { Text(home ? "HOME" : "AWAY").lfLabel(10.5, spacing: 0.16).foregroundStyle(ink.opacity(0.85)) }
            Group {
                if lines > 1 {
                    // As Android's: a word never breaks. The name steps down from its size until its
                    // longest word fits the panel (not under 9 pt), wrapping between words, up to its
                    // lines; each kit on its own.
                    WordFit(text: words, face: .display, size: name, color: ink, alignment: align, line: 0.92, least: 9, lines: lines)
                } else {
                    // On one line (a strip of kits): the whole name steps down to fit, cut only past 9 pt.
                    ViewThatFits(in: .horizontal) {
                        ForEach(steps(from: name, to: min(9, name)), id: \.self) { s in
                            Text(words).font(LfFace.display.font(s)).foregroundStyle(ink).lineLimit(1).fixedSize()
                        }
                        Text(words).font(LfFace.display.font(min(9, name))).foregroundStyle(ink).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: home ? .leading : .trailing)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(teamName(team, home: home))
        }
        .padding(.leading, home ? 14 : cut + 10).padding(.trailing, home ? cut + 8 : 14).padding(.vertical, 8)
        // With HOME and AWAY, from the top, so the two labels stay level when one name takes more lines.
        .frame(maxWidth: .infinity, minHeight: height, maxHeight: .infinity, alignment: labels ? (home ? .topLeading : .topTrailing) : (home ? .leading : .trailing))
        .background(kitColor(team))
        .clipShape(KitCut(home: home, cut: cut))
    }
}

extension KitPanels where Middle == EmptyView {
    init(home: Team, away: Team, size: KitSize = .normal, labels: Bool = false, lines: Int = 2) {
        self.home = home
        self.away = away
        self.size = size
        self.labels = labels
        self.lines = lines
        middle = { EmptyView() }
    }
}

/// A card as shown: yellow, red, or the half-and-half second caution, tilted as if just shown, with a real
/// shadow. A sin bin (EVT-12) is the yellow card with an hourglass on it, so it isn't read as a caution, as Android's and the website's.
enum CardKind { case yellow, red, second, sinBin }

struct CardShape: View {
    let kind: CardKind
    var width: CGFloat = 11
    var height: CGFloat = 15

    var body: some View {
        let tilt: Double = kind == .yellow ? -8 : kind == .red ? 5 : kind == .sinBin ? 6 : -3
        let shape = RoundedRectangle(cornerRadius: width * 0.12)
        ZStack {
            switch kind {
            case .yellow: LF.yellow
            case .sinBin:
                LF.yellow
                PhIcon(.hourglass, size: width * 0.64, tint: LF.onYellow)
            case .red: LF.red
            case .second:
                LF.red
                Path { p in
                    p.move(to: .zero)
                    p.addLine(to: CGPoint(x: width, y: 0))
                    p.addLine(to: CGPoint(x: 0, y: height))
                    p.closeSubpath()
                }
                .fill(LF.yellow)
            }
        }
        .frame(width: width, height: height)
        .clipShape(shape)
        .shadow(color: .black.opacity(0.35), radius: width > 20 ? 3 : 1, y: width > 20 ? 2 : 1)
        .rotationEffect(.degrees(tilt))
        .accessibilityHidden(true)
    }
}

/// The L5 mark (WEB-25), its colors from where it sits: chalk and mint on a board, all chalk on the
/// grass, ink and pitch green on a panel. `height` sets its size.
struct LogoMark: View {
    var height: CGFloat
    var five: Color?
    @Environment(\.ground) private var ground

    var body: some View {
        let fiveColor = five ?? (ground == .board ? LF.boardAccent : ground == .grass ? LF.chalk : LF.brand)
        let fold = height >= 24 && ground != .grass
        Canvas { c, size in
            let k = size.height / LogoShapes.height
            c.scaleBy(x: k, y: k)
            c.fill(LogoShapes.l, with: .color(LF.text))
            c.fill(LogoShapes.five, with: .color(fiveColor))
            if fold {
                c.fill(LogoShapes.fold, with: .color(ground == .board ? Color(uiColor: UIColor(hex: LogoShapes.boardFold)) : Color.black.opacity(0.38)))
            }
        }
        .frame(width: height * LogoShapes.width / LogoShapes.height, height: height)
        .accessibilityHidden(true)
    }
}

/// The lockup (WEB-25): the mark beside LAWFIVE in black italic, a tapered line in the 5's color under the name.
struct Logo: View {
    var size: CGFloat = 40
    @Environment(\.ground) private var ground

    var body: some View {
        let five = ground == .board ? LF.boardAccent : ground == .grass ? LF.chalk : LF.brand
        HStack(spacing: size * 0.24) {
            LogoMark(height: size * 0.95, five: five)
            VStack(alignment: .leading, spacing: size * 0.08) {
                Text("LAWFIVE").font(.display(size)).foregroundStyle(LF.text).padding(.trailing, size * 0.04)
                    .fixedSize()
                Canvas { c, s in
                    c.scaleBy(x: s.width / 200, y: s.height / 10)
                    c.fill(LogoShapes.line, with: .color(five))
                }
                .frame(height: size * 0.12)
            }
            .fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("LawFive")
    }
}

/// A figure and the words under it, between chalk rules (the match list's figures).
struct ChalkFigures: View {
    let figures: [(String, String)]
    var size: CGFloat = 40

    var body: some View {
        VStack(spacing: 0) {
            ChalkRule()
            HStack(spacing: 0) {
                ForEach(Array(figures.enumerated()), id: \.offset) { i, f in
                    if i > 0 { Rectangle().fill(LF.chalkLine).frame(width: chalkWidth) }
                    VStack(alignment: .leading, spacing: 6) {
                        Text(f.0).font(.display(size)).foregroundStyle(LF.text).lineLimit(1).minimumScaleFactor(0.6)
                        Text(f.1).font(.barlow(15, .semibold, relativeTo: .subheadline)).foregroundStyle(LF.text).lineLimit(2)
                    }
                    .padding(.leading, i == 0 ? 2 : 12).padding(.trailing, 6).padding(.top, 12).padding(.bottom, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            ChalkRule()
        }
    }
}

/// A panel's pitch corners: four quarter arcs in the brand green (DESIGN.md "Panels", `.corner-arcs`).
struct CornerArcs: View {
    var radius: CGFloat = 18

    var body: some View {
        Canvas { c, size in
            let w: CGFloat = 2
            let r = radius - w / 2
            var p = Path()
            p.addArc(center: CGPoint(x: 0, y: 0), radius: r, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            p.move(to: CGPoint(x: size.width - r, y: 0))
            p.addArc(center: CGPoint(x: size.width, y: 0), radius: r, startAngle: .degrees(180), endAngle: .degrees(90), clockwise: true)
            p.move(to: CGPoint(x: r, y: size.height))
            p.addArc(center: CGPoint(x: 0, y: size.height), radius: r, startAngle: .degrees(0), endAngle: .degrees(-90), clockwise: true)
            p.move(to: CGPoint(x: size.width - r, y: size.height))
            p.addArc(center: CGPoint(x: size.width, y: size.height), radius: r, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            c.stroke(p, with: .color(LF.brand), lineWidth: w)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
