import SwiftUI
import UIKit

// WEB-24: the slab, the broadcast stats package's section (DESIGN.md "Slab"), as the website's `Slab`
// at a phone's width and as Android's Slab.kt: a section as a broadcast's caption over its graphic. A
// chalk title tab in black italic capitals, its right edge cut on the kits' diagonal, overlapping the
// slab's top-left corner, with a mint tag beside it saying what's counted; under them the slab: the
// board by default, a chalk panel with corner arcs for dense lists (its tab then a strip of the
// board), or the grass. Made for Stats first; since WEB-28 also a match's track figures and heatmap, its
// weather, a venue's and a referee's figures and the quiz's score. With it, the type that fits its room:
// words that grow with the phone's text size but never break, and figures sized to their room that
// don't grow.

/// The faces the slabs measure, by their PostScript names.
enum LfFace: String {
    case display = "BarlowCondensed-BlackItalic"
    case word = "BarlowCondensed-ExtraBold"
    case mono = "JetBrainsMono-Regular"
    case semibold = "Barlow-SemiBold"
    case medium = "Barlow-Medium"

    /// At a fixed size (the size given is the size drawn).
    func font(_ size: CGFloat) -> Font {
        switch self {
        case .display: return Font.custom(rawValue, fixedSize: size).monospacedDigit()
        case .mono: return Font.custom(rawValue, fixedSize: size).weight(.bold)
        default: return Font.custom(rawValue, fixedSize: size)
        }
    }

    /// How wide `text` sets at `size`, with `tracking` (in em) after each letter.
    func width(_ text: String, _ size: CGFloat, tracking: CGFloat = 0) -> CGFloat {
        let count = CGFloat(text.count)
        let spacing = count * tracking * size
        // JetBrains Mono: every letter 0.6 em, bold or not.
        if self == .mono { return count * 0.6 * size + spacing }
        guard let font = UIFont(name: rawValue, size: size) else { return count * 0.5 * size + spacing }
        // A little to spare for the figures' fixed widths and the italic's lean.
        return (text as NSString).size(withAttributes: [.font: font]).width * (self == .display ? 1.04 : 1.01) + spacing
    }
}

/// A word's size grown with the phone's text size (Dynamic Type), as `relativeTo` grows SwiftUI's.
func grown(_ size: CGFloat, _ style: UIFont.TextStyle = .body) -> CGFloat {
    UIFontMetrics(forTextStyle: style).scaledValue(for: size)
}

/// The sizes to try, largest first: a step of about 6% at a time (or `factor`), down to `least`.
func steps(from size: CGFloat, to least: CGFloat, factor: CGFloat = 0.94) -> [CGFloat] {
    var out: [CGFloat] = []
    var s = size
    while s > least {
        out.append(s)
        s *= factor
    }
    out.append(least)
    return out
}

/// Words at the largest size up to `size` at which each word fits the width on its own line, so they
/// wrap between words but never break one ("SEND-OFFS", "SPRINTING"), at any text size. It takes the
/// width it's offered. Chosen by `ViewThatFits` from the longest word's width at each size, so nothing
/// it draws feeds back into the width it's given.
struct WordFit: View {
    let text: String
    let face: LfFace
    /// The largest size, already grown where it grows with the text size.
    let size: CGFloat
    var color: Color = LF.text
    var tracking: CGFloat = 0
    var alignment: TextAlignment = .leading
    /// Line height as a share of the size (as Android's), or the font's own.
    var line: CGFloat?
    var least: CGFloat = 7
    /// At most this many lines, then …; as many as it takes when not given.
    var lines: Int?

    var body: some View {
        let words = text.split(separator: " ").map(String.init)
        let frame: Alignment = alignment == .center ? .center : alignment == .trailing ? .trailing : .leading
        ViewThatFits(in: .horizontal) {
            ForEach(steps(from: size, to: min(least, size)), id: \.self) { s in
                Text(text)
                    .font(face.font(s))
                    .tracking(s * tracking)
                    .lineSpacing(line.map { s * ($0 - 1.2) } ?? 0)
                    .foregroundStyle(color)
                    .multilineTextAlignment(alignment)
                    .lineLimit(lines)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(idealWidth: words.map { face.width($0, s, tracking: tracking) }.max() ?? 0, maxWidth: .infinity, alignment: frame)
            }
        }
    }
}

/// A figure on one line that steps down from `size` until it fits the width it's offered (never under
/// `least`), with an optional unit small beside it ("27.0 MI"); sized to its room, so it doesn't grow
/// with the text size. `trim` lays it out as tall as its digits rather than the font's whole ascent.
struct FitFigure: View {
    let figure: String
    var unit = ""
    let size: CGFloat
    var color: Color = LF.onBoardStrong
    var unitColor: Color?
    var alignment: Alignment = .leading
    var least: CGFloat = 16
    var trim = true
    /// The unit's size, as a share of the figure's.
    var unitShare: CGFloat = 0.36
    var tracking: CGFloat = -0.01

    private func line(_ s: CGFloat) -> some View {
        (Text(figure).font(LfFace.display.font(s)).tracking(s * tracking).foregroundColor(color)
            + (unit.isEmpty ? Text("") : Text(" " + unit.uppercased()).font(LfFace.display.font(s * unitShare)).foregroundColor(unitColor ?? color)))
            .lineLimit(1)
            .fixedSize()
            .padding(.trailing, s * 0.05)
            // Barlow Condensed: ascent 1 em, descent 0.2 em, the figures 0.7 em tall.
            .padding(.top, trim ? -s * 0.2 : 0)
            .padding(.bottom, trim ? -s * 0.1 : 0)
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            ForEach(steps(from: size, to: min(least, size)), id: \.self) { s in line(s) }
        }
        .frame(maxWidth: .infinity, alignment: alignment)
    }
}

/// Reads the width offered to it (a zero-height line in a stack), whatever its neighbors draw, so a
/// graphic can size its parts to its room without what it draws feeding back into that room.
struct WidthReader: View {
    @Binding var width: CGFloat

    var body: some View {
        GeometryReader { g in
            Color.clear
                .onAppear { width = g.size.width }
                .onChange(of: g.size.width) { _, w in width = w }
        }
        .frame(height: 0)
        .accessibilityHidden(true)
    }
}

/// A shape cut on the diagonal: its top edge starts `left` in and its bottom edge ends `right` short,
/// as the website's clip-paths (a title tab: right only; the mint tag: both; a cut slab: right).
struct SlantShape: Shape {
    var left: CGFloat = 0
    var right: CGFloat = 0

    func path(in r: CGRect) -> Path {
        Path { p in
            p.move(to: CGPoint(x: r.minX + min(left, r.width), y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX - min(right, r.width), y: r.maxY))
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
            p.closeSubpath()
        }
    }
}

/// The kits' diagonal on phones: a tab's cut, and a figure slab's right edge.
let tabCut: CGFloat = 18
let slabCut: CGFloat = 26

/// The board as a surface of any shape: near black, by day a hard drop and a deep soft shadow, at night
/// a 1 pt lighter edge round the shape; what's in it takes the board's colors.
private struct BoardSurface<S: Shape>: ViewModifier {
    let shape: S
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        content
            .background(LF.board)
            .clipShape(shape)
            .overlay { if scheme == .dark { shape.stroke(LF.boardEdge, lineWidth: 2).clipShape(shape).allowsHitTesting(false) } }
            .background {
                if scheme != .dark {
                    shape.fill(Color.black.opacity(0.3)).offset(y: 3).shadow(color: .black.opacity(0.35), radius: 10, y: 6)
                }
            }
            .ground(.board)
    }
}

extension View {
    func boardSurface<S: Shape>(_ shape: S) -> some View { modifier(BoardSurface(shape: shape)) }
}

/// What a slab sits on.
enum SlabGround { case board, panel, grass }

/// A slab (DESIGN.md "Slab"): `title` in the tab (a heading for VoiceOver), an optional Phosphor `icon`
/// before it and a mint `tag` beside it (what's counted: "Games", "Km a game"; the two share the width
/// and the tag goes under the title when it would otherwise make the tab taller). `cut` cuts the slab's
/// right edge on the diagonal, for figures; it clips, so not for anything with menus. What's inside
/// takes the ground's colors.
struct Slab<Content: View>: View {
    let title: String
    var tag: String?
    var icon: Ph?
    var ground: SlabGround = .board
    var cut = false
    @ViewBuilder let content: () -> Content
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        SlabLayout(grass: ground == .grass) {
            face
            SlabTab(title: title, tag: tag, icon: icon, onBoard: ground == .panel)
        }
    }

    @ViewBuilder private var face: some View {
        switch ground {
        case .board:
            VStack(alignment: .leading, spacing: 0, content: content)
                .padding(.leading, 16).padding(.top, 40).padding(.bottom, 20).padding(.trailing, cut ? slabCut + 10 : 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .ground(.board)
                .boardSurface(cut ? AnyShape(SlantShape(right: slabCut)) : AnyShape(RoundedRectangle(cornerRadius: 6)))
        case .panel:
            let shape = RoundedRectangle(cornerRadius: 6)
            VStack(alignment: .leading, spacing: 0, content: content)
                .padding(.leading, 16).padding(.top, 40).padding(.bottom, 18).padding(.trailing, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(LF.surface)
                .overlay { CornerArcs() }
                .clipShape(shape)
                .overlay { if scheme == .dark { shape.stroke(LF.panelEdge, lineWidth: 1) } }
                .hardDrop(LF.panelShadow, shape)
                .ground(.panel)
        case .grass:
            VStack(alignment: .leading, spacing: 0, content: content)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// The slab under its tab: the tab hangs 6 pt out over the slab's top-left corner, 19 pt of it over the
/// slab; on the grass it sits above what's drawn.
private struct SlabLayout: Layout {
    let grass: Bool
    private let overhang: CGFloat = 6

    private func measure(_ width: CGFloat, _ subviews: Subviews) -> (tab: CGSize, face: CGSize, y: CGFloat) {
        let tab = subviews[1].sizeThatFits(ProposedViewSize(width: width + overhang, height: nil))
        let face = subviews[0].sizeThatFits(ProposedViewSize(width: width, height: nil))
        return (tab, face, grass ? tab.height + 14 : max(0, tab.height - 19))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 360
        let m = measure(width, subviews)
        return CGSize(width: width, height: m.y + m.face.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let m = measure(bounds.width, subviews)
        subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.minY + m.y), proposal: ProposedViewSize(width: bounds.width, height: m.face.height))
        subviews[1].place(at: CGPoint(x: bounds.minX - overhang, y: bounds.minY), proposal: ProposedViewSize(width: bounds.width + overhang, height: m.tab.height))
    }
}

/// How wide a chip must be for its longest word.
private struct LeastWidth: LayoutValueKey { static let defaultValue: CGFloat = 0 }

/// The title tab and its tag, side by side, wrapping their words when the two don't fit across.
private struct SlabTab: View {
    let title: String
    let tag: String?
    let icon: Ph?
    let onBoard: Bool

    var body: some View {
        let back = onBoard ? LF.board : LF.chalk
        let ink = onBoard ? LF.onBoardStrong : LF.board
        let size = grown(22, .title3)
        let tagSize = grown(10.5, .caption1)
        let words = title.uppercased().split(separator: " ").map { LfFace.display.width(String($0), size) }
        let tagWords = (tag ?? "").uppercased().split(separator: " ").map { LfFace.mono.width(String($0), tagSize, tracking: 0.08) }
        TabLayout {
            HStack(spacing: 8) {
                if let icon { PhIcon(icon, size: 19, tint: ink) }
                Text(title.uppercased())
                    .font(LfFace.display.font(size))
                    .lineSpacing(-size * 0.2)
                    .foregroundStyle(ink)
                    .padding(.trailing, 2)
            }
            .padding(.leading, 12).padding(.trailing, 30).padding(.vertical, 4)
            .frame(minHeight: 38, maxHeight: .infinity, alignment: .leading)
            .background(SlantShape(right: tabCut).fill(back).shadow(color: .black.opacity(0.3), radius: 3, y: 2))
            .layoutValue(key: LeastWidth.self, value: (words.max() ?? 0) + 12 + 32 + (icon == nil ? 0 : 27))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(title)
            .accessibilityAddTraits(.isHeader)
            if let tag {
                Text(tag.uppercased())
                    .font(LfFace.mono.font(tagSize))
                    .tracking(tagSize * 0.08)
                    .foregroundStyle(LF.board)
                    .padding(.leading, 26).padding(.trailing, 24).padding(.vertical, 4)
                    .frame(minHeight: 38, maxHeight: .infinity, alignment: .leading)
                    .background(SlantShape(left: tabCut, right: tabCut).fill(LF.boardAccent).shadow(color: .black.opacity(0.3), radius: 3, y: 2))
                    .layoutValue(key: LeastWidth.self, value: (tagWords.max() ?? 0) + 52)
            }
        }
    }
}

/// Side by side while both fit; else the title keeps its line where it can and the tag wraps; when even
/// that would make the tab taller, the tag goes under the title (as Android's).
private struct TabLayout: Layout {
    private let overlap: CGFloat = 14

    private struct Plan {
        var title: CGSize
        var tag: CGSize?
        var stacked: Bool
    }

    private func plan(_ width: CGFloat, _ subviews: Subviews) -> Plan {
        let title = subviews[0]
        let titleWant = title.sizeThatFits(.unspecified).width
        let titleMin = title[LeastWidth.self]
        guard subviews.count > 1 else {
            let w = min(titleWant, max(width, titleMin))
            return Plan(title: CGSize(width: w, height: title.sizeThatFits(ProposedViewSize(width: w, height: nil)).height), tag: nil, stacked: false)
        }
        let tag = subviews[1]
        let tagWant = tag.sizeThatFits(.unspecified).width
        let tagMin = tag[LeastWidth.self]
        let room = width + overlap
        let height = { (v: LayoutSubview, w: CGFloat) in v.sizeThatFits(ProposedViewSize(width: w, height: nil)).height }
        let titleW = titleWant + tagWant <= room ? titleWant : min(width, max(titleMin, min(titleWant, room - min(tagWant, 96))))
        let tagW = min(tagWant, room - titleW)
        let tallest = max(height(tag, tagWant), height(title, titleW))
        // A point's grace: the least widths are measured, the chips' own sizes laid out.
        if tagW + 2 < tagMin || height(tag, tagW) > tallest + 1 {
            let t = CGSize(width: titleW, height: height(title, titleW))
            let gw = min(tagWant, width)
            return Plan(title: t, tag: CGSize(width: gw, height: height(tag, gw)), stacked: true)
        }
        let h = max(height(title, titleW), height(tag, tagW))
        return Plan(title: CGSize(width: titleW, height: h), tag: CGSize(width: tagW, height: h), stacked: false)
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let p = plan(proposal.width ?? 360, subviews)
        guard let tag = p.tag else { return p.title }
        return p.stacked ? CGSize(width: max(p.title.width, tag.width), height: p.title.height + tag.height)
            : CGSize(width: p.title.width + tag.width - overlap, height: p.title.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let p = plan(proposal.width ?? bounds.width, subviews)
        // The tag first, so the title's cut lies over it.
        if let tag = p.tag {
            let at = p.stacked ? CGPoint(x: bounds.minX, y: bounds.minY + p.title.height) : CGPoint(x: bounds.minX + p.title.width - overlap, y: bounds.minY)
            subviews[1].place(at: at, proposal: ProposedViewSize(tag))
        }
        subviews[0].place(at: bounds.origin, proposal: ProposedViewSize(p.title))
    }
}

/// A small mint label on a slab (pitch green on a panel), or muted with `quiet`; its words never break.
struct SlabLabel: View {
    let text: String
    var quiet = false
    var icon: Ph?
    var color: Color?
    var alignment: TextAlignment = .leading
    @Environment(\.ground) private var ground

    init(_ text: String, quiet: Bool = false, icon: Ph? = nil, color: Color? = nil, alignment: TextAlignment = .leading) {
        self.text = text
        self.quiet = quiet
        self.icon = icon
        self.color = color
        self.alignment = alignment
    }

    var body: some View {
        let tint = color ?? (quiet ? LF.muted : ground == .panel ? LF.brand : LF.boardAccent)
        HStack(spacing: 8) {
            if let icon { PhIcon(icon, size: 16, tint: tint) }
            WordFit(text: text.uppercased(), face: .mono, size: grown(12, .caption1), color: tint, tracking: 0.14, alignment: alignment)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The mint bar under a slab's figure, its ends cut on the slant.
struct MintBar: View {
    var height: CGFloat = 12
    var fraction: CGFloat = 0.7
    var most: CGFloat = 330

    var body: some View {
        GeometryReader { geo in
            SlantShape(left: 5, right: 5).fill(LF.boardAccent).frame(width: min(most, geo.size.width * fraction))
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// A slab's figure (`.slab-figure`): black italic, the unit small beside it ("27.0 MI"), stepping down
/// to fit. `size` is its largest.
struct SlabFigure: View {
    let text: String
    let size: CGFloat
    var color: Color = LF.onBoardStrong
    var alignment: Alignment = .leading

    var body: some View {
        let parts = figureAndUnit(text)
        FitFigure(figure: parts.figure, unit: parts.unit, size: size, color: color, alignment: alignment, least: 18)
    }
}

/// A slab's own hairline: 2 pt in the ground's border.
struct SlabRule: View {
    var vertical = false
    var body: some View {
        Rectangle().fill(LF.border).frame(width: vertical ? 2 : nil, height: vertical ? nil : 2).accessibilityHidden(true)
    }
}

/// WEB-28: a figure as a row of a slab at a phone's width: a rule over it, the quiet label on the left
/// and the figure on the right with its unit small (or `whole`, as a temperature stays), and an optional
/// caption under it on the right. Read as one by VoiceOver.
struct SlabRow: View {
    let label: String
    let figure: String
    var caption: String?
    var size: CGFloat = 32
    var whole = false

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            SlabRule()
            HStack(alignment: .center, spacing: 12) {
                SlabLabel(label, quiet: true)
                Group {
                    if whole {
                        FitFigure(figure: figure, size: size, alignment: .trailing, least: 18)
                    } else {
                        SlabFigure(text: figure, size: size, alignment: .trailing)
                    }
                }
                .fixedSize()
            }
            .padding(.vertical, 8)
            if let caption {
                Text(caption)
                    .font(.barlow(13, .medium, relativeTo: .footnote))
                    .foregroundStyle(LF.muted)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, 24).padding(.bottom, 8).padding(.top, -4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityElement(children: .combine)
    }
}
