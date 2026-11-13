import SwiftUI

// The watch's look (WCH-6): as the Garmin app and Wear OS: white on black, the LawFive green circle behind each
// menu row's Phosphor icon, the match's own colors; Barlow Condensed for figures, as on the phone.

enum C {
    static let text = Color.white
    static let dim = Color(white: 0.667)
    static let rule = Color(white: 0.333)
    static let row = Color(red: 0x1D / 255, green: 0x23 / 255, blue: 0x21 / 255)
    static let brand = Color(red: 0x2F / 255, green: 0xAE / 255, blue: 0x7A / 255)
    static let start = Color(red: 0, green: 0xAA / 255, blue: 0x44 / 255)
    static let stoppage = Color(red: 1, green: 0x88 / 255, blue: 0)
    static let breakBlue = Color(red: 0x55 / 255, green: 0xAA / 255, blue: 1)
    static let ringTrack = Color(white: 0.165)
    static let yellow = Color(red: 0xF5 / 255, green: 0xC4 / 255, blue: 0)
    static let red = Color(red: 0xE5 / 255, green: 0x48 / 255, blue: 0x4D / 255)
    static let coin = Color(red: 0xD9 / 255, green: 0xA9 / 255, blue: 0x2C / 255)
    static let coinEdge = Color(red: 0x8A / 255, green: 0x65 / 255, blue: 0x08 / 255)
    static let coinInk = Color(red: 0x5F / 255, green: 0x45 / 255, blue: 0x03 / 255)
    /// UI-10: the kit of a team without a color, the board's blank.
    static let kitBlank = Color(red: 0x3A / 255, green: 0x40 / 255, blue: 0x3D / 255)
}

extension Font {
    static func barlow(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        let name: String
        switch weight {
        case .semibold, .bold: name = "Barlow-SemiBold"
        case .regular: name = "Barlow-Regular"
        default: name = "Barlow-Medium"
        }
        return .custom(name, fixedSize: size)
    }
    static func figure(_ size: CGFloat) -> Font { .custom("BarlowCondensed-Bold", fixedSize: size) }
}

func teamColor(_ value: Int) -> Color? {
    value < 0 ? nil : Color(red: Double((value >> 16) & 255) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
}

/// WCAG relative luminance (0 = black, 1 = white).
func luminance(_ value: Int) -> Double {
    let linear = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map { channel -> Double in
        let c = Double(channel) / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/// UI-10: black or white, whichever has the higher contrast ratio against the color, as on the other watches.
func onColor(_ value: Int) -> Color {
    let l = luminance(value)
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? .black : .white
}

/// UI-10: a color too dark to stand out from the black screen (below 1.5:1 against it) gets a thin gray edge.
func needsOutline(_ value: Int) -> Bool { (luminance(value) + 0.05) / 0.05 < 1.5 }

/// WCH-9: a button that only a tap presses. A plain button also fires for a swipe that ends inside it.
struct TapOnly: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.contentShape(Rectangle()).onTapGesture { configuration.trigger() }
    }
}

/// A menu row: an optional icon on a green circle (UI-18), a label and a muted line.
/// SET-14: a team color's square, outlined so black shows; None is the outline with a slash.
struct Swatch: View {
    let color: Int

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 5).fill(teamColor(color) ?? .clear)
            RoundedRectangle(cornerRadius: 5).stroke(C.dim, lineWidth: 1.5)
            if color < 0 {
                Path { p in
                    p.move(to: CGPoint(x: 4, y: 16))
                    p.addLine(to: CGPoint(x: 16, y: 4))
                }
                .stroke(C.dim, lineWidth: 1.5)
            }
        }
        .frame(width: 20, height: 20)
    }
}

/// SET-14: the colors Create match offers, the same as the Garmin watch's; any other is the phone's own.
let teamColorChoices: [(Int, String)] = [(-1, "None"), (0x000000, "Black"), (0xFFFFFF, "White"), (0xD71920, "Red"), (0xFF7A00, "Orange"),
                                         (0xFFD100, "Yellow"), (0x00A651, "Green"), (0x0057B8, "Blue"), (0x6A2C91, "Purple")]

func colorName(_ color: Int) -> String { teamColorChoices.first { $0.0 == color }?.1 ?? "Custom" }

struct MenuRow: View {
    let label: String
    var sub: String?
    var icon: String?
    var fill: Color?
    var textColor: Color = C.text
    /// SET-14: a team color's swatch in place of an icon.
    var swatch: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon {
                    ZStack {
                        Circle().fill(C.brand)
                        Image("ph_\(icon)").renderingMode(.template).resizable().scaledToFit().frame(width: 17, height: 17).foregroundStyle(.black)
                    }
                    .frame(width: 27, height: 27)
                }
                if let swatch { Swatch(color: swatch).padding(.trailing, 2) }
                VStack(alignment: .leading, spacing: 0) {
                    Text(label).font(.barlow(15, .semibold)).foregroundStyle(textColor).lineLimit(1)
                    if let sub { Text(sub).font(.barlow(12, .regular)).foregroundStyle(fill != nil ? textColor : C.dim).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: sub != nil ? 50 : 44)
            .background(fill ?? C.row, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(TapOnly())
    }
}

struct ToggleRow: View {
    let label: String
    var sub: String?
    let on: Bool
    let change: (Bool) -> Void

    var body: some View {
        Button { change(!on) } label: {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(label).font(.barlow(15, .semibold)).foregroundStyle(C.text).lineLimit(1)
                    if let sub { Text(sub).font(.barlow(12, .regular)).foregroundStyle(C.dim).lineLimit(1) }
                }
                Spacer(minLength: 0)
                Capsule().fill(on ? C.brand : C.rule).frame(width: 32, height: 19)
                    .overlay(alignment: on ? .trailing : .leading) { Circle().fill(.white).frame(width: 14, height: 14).padding(2.5) }
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: sub != nil ? 50 : 44)
            .background(C.row, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(TapOnly())
    }
}

/// UI-13: the large green button.
struct PillButton: View {
    let label: String
    var color: Color = C.start
    var textColor: Color = .white
    var width: CGFloat?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label).font(.barlow(16, .semibold)).foregroundStyle(textColor).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: width ?? .infinity, minHeight: 42)
                .background(color, in: Capsule())
        }
        .buttonStyle(TapOnly())
    }
}

/// UI-7.
struct ConfirmScreen: View {
    let question: String
    var detail: String?
    var yes = "Yes"
    var danger = false
    let onYes: () -> Void
    let onNo: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Text(question).font(.barlow(18, .semibold)).multilineTextAlignment(.center).foregroundStyle(C.text)
            if let detail { Text(detail).font(.barlow(13, .regular)).foregroundStyle(C.dim).multilineTextAlignment(.center) }
            Spacer().frame(height: 6)
            PillButton(label: yes, color: danger ? C.red : C.start, action: onYes)
            PillButton(label: "No", color: C.row, action: onNo)
        }
        .padding(.horizontal, 8)
    }
}

/// UI-10: a kit's outline, cut on the side that meets the other team and leaning as "/": home's right edge, away's left,
/// `cut` across its height.
struct KitShape: Shape {
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

/// UI-10: a team as a kit: its name (or score) upright in the middle of its part, on the team's color or the board's blank,
/// with black or white words by contrast. On its own it's cut only on the side that meets the other team, so its shape says
/// which side it is; a pair is two of them, `widest` giving both the same width, side by side with `Kit.meet` between.
/// UI-11: `dot` is the chosen team's white dot above it, over its name.
struct Kit: View {
    let name: String
    let color: Int
    let size: CGFloat
    let home: Bool
    var widest: [String] = []
    var dot = false

    static func height(_ size: CGFloat) -> CGFloat { (size * 1.3).rounded() }
    /// The spacing between a pair: they overlap by the slant across both cuts, less a gap of about 0.11 of the height.
    static func meet(_ size: CGFloat) -> CGFloat { -height(size) * 0.31 }

    var body: some View {
        let h = Kit.height(size)
        // The cut runs 0.21 of the height either way of the middle of the line where a pair meets.
        let cut = h * 0.42
        let pad = h * 0.35
        let shape = KitShape(home: home, cut: cut)
        ZStack {
            ForEach(Array(widest.enumerated()), id: \.offset) { _, other in label(other).hidden() }
            label(name).foregroundStyle(color < 0 ? .white : onColor(color))
        }
        .overlay {
            if dot { Circle().fill(.white).frame(width: h * 0.34, height: h * 0.34).offset(y: -h * 0.87) }
        }
        // The name in the middle of its part: the slant's half is on the cut side.
        .padding(.leading, home ? pad : pad + cut / 2)
        .padding(.trailing, home ? pad + cut / 2 : pad)
        .frame(height: h)
        .background {
            shape.fill(teamColor(color) ?? C.kitBlank)
            if color >= 0 && needsOutline(color) { shape.stroke(C.dim, lineWidth: 1) }
        }
    }

    private func label(_ text: String) -> some View {
        Text(text).font(.barlow(size, .semibold)).lineLimit(1).fixedSize()
    }
}
