import SwiftUI

// The building blocks (DESIGN.md "Components"), as the web app and Android have them.

/// Phosphor icons (regular), by the web app's names (tools/icons.mts makes the image sets).
enum Ph: String {
    case matches, templates, venues, referees, competitions, people, plus, back, next, chevron, close, edit, trash, pause, injury, flag, out, search
    case map, pin, watch, settings, more, check, stats, quiz, restart, download, play, mail, qr, mobile, undo, link, copy, share, clock, calendar
    case info, merge, upload, report, camera, photos, portrait, phone, globe, directions, bell, bellOff, sync, eye, eyeOff, money, sun, moon, cloud, cloudSun
    case cloudMoon, cloudRain, cloudSnow, cloudFog, cloudLightning, wind, thermometer, tag, hash, note, role, message, plan, assignor, palette, crop, turn
    case distance, heart, sprint, speed, open, help, hourglass

    var image: Image { Image("ph_\(rawValue)").renderingMode(.template) }
}

struct PhIcon: View {
    let icon: Ph
    var size: CGFloat = 20
    var tint: Color = LF.text
    var label: String?

    init(_ icon: Ph, size: CGFloat = 20, tint: Color = LF.text, label: String? = nil) {
        self.icon = icon
        self.size = size
        self.tint = tint
        self.label = label
    }

    var body: some View {
        icon.image.resizable().scaledToFit().frame(width: size, height: size).foregroundStyle(tint)
            .accessibilityLabel(label ?? "").accessibilityHidden(label == nil)
    }
}

/// A slight press, as the web's buttons have (WEB-1).
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// A row that highlights while pressed, as a native list's does.
struct RowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? LF.surface2 : Color.clear)
            .contentShape(Rectangle())
    }
}

/// A chalk panel (DESIGN.md "Panels"): chalk with ink by day, a dark slab with a 1 pt edge at night,
/// 6 pt corners and a hard 3 pt drop by day; what's in it takes the panel's colors.
struct LfCard<Content: View>: View {
    var padding: CGFloat = 0
    @ViewBuilder let content: () -> Content

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        VStack(alignment: .leading, spacing: 0, content: content)
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(LF.surface)
            .clipShape(shape)
            .overlay(shape.stroke(LF.panelEdge, lineWidth: 1))
            .hardDrop(LF.panelShadow, shape)
            .ground(.panel)
    }
}

/// A hairline.
struct Hairline: View {
    var body: some View { Rectangle().fill(LF.border).frame(height: 1) }
}

/// A section's heading (DESIGN.md "A group's label"): on the grass, black italic capitals in chalk with
/// a faint chalk line running on from them to the edge, any action at the right. `small` is a section
/// inside a form: small JetBrains Mono capitals.
struct SectionTitle<Action: View>: View {
    let text: String
    var small = false
    @ViewBuilder let action: () -> Action

    var body: some View {
        HStack(spacing: 12) {
            if small {
                Text(text.uppercased()).lfLabel(12, spacing: 0.12).foregroundStyle(LF.muted)
                Spacer(minLength: 0)
            } else {
                Text(text.uppercased()).font(.display(26, relativeTo: .title2)).foregroundStyle(LF.text)
                    .accessibilityLabel(text)
                    .layoutPriority(1)
                    .accessibilityAddTraits(.isHeader)
                Rectangle().fill(LF.chalkFaint).frame(minWidth: 12, maxWidth: .infinity).frame(height: 3)
            }
            // Its words whole ("Edit result" was cut to "EDIT RES…"): the rule between gives way first.
            action().fixedSize(horizontal: true, vertical: false)
        }
        .padding(.top, small ? 20 : 26).padding(.bottom, small ? 8 : 12)
        .accessibilityElement(children: .contain)
    }
}

extension SectionTitle where Action == EmptyView {
    init(_ text: String, small: Bool = false) {
        self.text = text
        self.small = small
        action = { EmptyView() }
    }
}

/// A row in a card: an avatar or icon, a title, a muted line, and something on the right.
struct ListRow<Leading: View, Trailing: View>: View {
    let title: String
    var sub: String?
    var divider = true
    var action: (() -> Void)?
    @ViewBuilder var leading: () -> Leading
    @ViewBuilder var trailing: () -> Trailing

    private var row: some View {
        HStack(spacing: 14) {
            leading()
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.barlow(16, .bold, relativeTo: .headline)).foregroundStyle(LF.text).lineLimit(2).multilineTextAlignment(.leading)
                if let sub, !sub.isEmpty {
                    // Up to four lines, so a watch's details or a long line at the largest text sizes isn't cut.
                    Text(sub).font(.lfBodySmall).foregroundStyle(LF.muted).lineLimit(4).multilineTextAlignment(.leading)
                }
            }
            Spacer(minLength: 0)
            trailing()
        }
        .padding(.horizontal, 16).padding(.vertical, 13)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        VStack(spacing: 0) {
            if divider { Hairline() }
            if let action {
                Button(action: action) { row }.buttonStyle(RowStyle())
            } else {
                row
            }
        }
    }
}

extension ListRow where Leading == EmptyView, Trailing == EmptyView {
    init(_ title: String, sub: String? = nil, divider: Bool = true, action: (() -> Void)? = nil) {
        self.init(title: title, sub: sub, divider: divider, action: action, leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// An avatar (DESIGN.md "Avatars"): initials in condensed capitals on the board's near black, round; a
/// record's icon on a board tile with the panel's corners.
struct Avatar: View {
    var text: String?
    var icon: Ph?
    var background: Color = LF.board
    var foreground: Color = LF.onBoard
    var size: CGFloat = 38
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let shape = icon == nil ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: 6))
        ZStack {
            shape.fill(background)
            if scheme == .dark { shape.stroke(LF.boardEdge, lineWidth: 1) }
            if let icon {
                PhIcon(icon, size: size * 0.5, tint: foreground)
            } else {
                // Initials grow with it (15 in the usual 38).
                Text((text ?? "").uppercased()).lfWord(size * 0.4).foregroundStyle(foreground).lineLimit(1).minimumScaleFactor(0.6)
            }
        }
        .frame(width: size, height: size)
    }
}

enum ChipTone { case plain, brand, amber, red, blue }

struct Chip: View {
    let text: String
    var tone: ChipTone = .plain

    init(_ text: String, tone: ChipTone = .plain) {
        self.text = text
        self.tone = tone
    }

    private var colors: (Color, Color) {
        switch tone {
        case .plain: return (LF.surface2, LF.muted)
        case .brand: return (LF.brand, LF.onBrand)
        case .amber: return (LF.amberSoft, LF.amberText)
        case .red: return (LF.redSoft, LF.redText)
        case .blue: return (LF.blueSoft, LF.blueText)
        }
    }

    /// A small painted tag (DESIGN.md "Chips"): 4 pt corners, condensed bold capitals, always
    /// panel-colored so it reads on the grass too.
    var body: some View {
        Text(text.uppercased())
            .lfWord(13, .bold)
            .foregroundStyle(colors.1)
            .lineLimit(1)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(colors.0, in: RoundedRectangle(cornerRadius: 4))
            .overlay { if tone == .plain { RoundedRectangle(cornerRadius: 4).stroke(LF.border, lineWidth: 1) } }
            .ground(.panel)
    }
}

/// The team's short name on its color, as on the watch.
struct TeamBadge: View {
    let team: Team
    /// The other team: a short name not typed is made from both names (SET-5).
    let other: Team
    let home: Bool
    var large = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let color = parseColor(team.colour)
        let edge = color == nil || kitVanishes(color!, dark: scheme == .dark)
        Text(teamAlias(team, other: other, home: home))
            .font(.condensed(large ? 19 : 15, .heavy, italic: true, relativeTo: large ? .title3 : .footnote))
            .tracking(0.6)
            .foregroundStyle(color.map(textOn) ?? LF.text)
            .lineLimit(1)
            .padding(.horizontal, large ? 10 : 6)
            .frame(minWidth: large ? 64 : 42, minHeight: large ? 36 : 24)
            .background(color?.color ?? LF.surface2, in: RoundedRectangle(cornerRadius: 4))
            .overlay { if edge { RoundedRectangle(cornerRadius: 4).stroke(LF.border, lineWidth: 1) } }
    }
}

struct PrimaryButton: View {
    let text: String
    var icon: Ph?
    var enabled = true
    var wide = false
    var danger = false
    let action: () -> Void

    init(_ text: String, icon: Ph? = nil, enabled: Bool = true, wide: Bool = false, danger: Bool = false, action: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.enabled = enabled
        self.wide = wide
        self.danger = danger
        self.action = action
    }

    var body: some View {
        // DESIGN.md "Buttons": a slab in the ground's brand (chalk with board words on the grass and on a
        // board, pitch green with white on a panel) with a hard 3 pt board drop; `danger` the one red button.
        let shape = RoundedRectangle(cornerRadius: 6)
        let ink = !enabled ? LF.muted : danger ? Color.white : LF.onBrand
        Button(action: action) {
            HStack(spacing: 7) {
                if let icon { PhIcon(icon, size: 18, tint: ink) }
                // A long label at the largest text sizes steps down a little rather than ending in "…".
                Text(text.uppercased()).lfWord().foregroundStyle(ink).lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 16).frame(minHeight: 44)
            .frame(maxWidth: wide ? .infinity : nil)
            .background(!enabled ? LF.surface2 : danger ? LF.redStrong : LF.brand, in: shape)
            .hardDrop(enabled ? LF.board : .clear, shape)
            .accessibilityLabel(text)
        }
        .buttonStyle(PressStyle())
        .disabled(!enabled)
    }
}

struct SecondaryButton: View {
    let text: String
    var icon: Ph?
    var enabled = true
    var wide = false
    var danger = false
    let action: () -> Void

    init(_ text: String, icon: Ph? = nil, enabled: Bool = true, wide: Bool = false, danger: Bool = false, action: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.enabled = enabled
        self.wide = wide
        self.danger = danger
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            SecondaryLabel(text: text, icon: icon, danger: danger, wide: wide)
                .opacity(enabled ? 1 : 0.45)
        }
        .buttonStyle(PressStyle())
        .disabled(!enabled)
    }
}

/// What a secondary button looks like, for Menu and ShareLink labels too.
struct SecondaryLabel: View {
    let text: String
    var icon: Ph?
    var danger = false
    var wide = false

    var body: some View {
        // A 2 pt outline in the field color (a chalk outline on the grass), the board's words.
        HStack(spacing: 7) {
            if let icon { PhIcon(icon, size: 18, tint: danger ? LF.redText : LF.text) }
            // A long label at the largest text sizes steps down a little rather than ending in "…".
            Text(text.uppercased()).lfWord().foregroundStyle(danger ? LF.redText : LF.text).lineLimit(1).minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 14).frame(minHeight: 44)
        .frame(maxWidth: wide ? .infinity : nil)
        .background(LF.field, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(LF.borderInput, lineWidth: 2))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
        .accessibilityAddTraits(.isButton)
    }
}

struct LinkButton: View {
    let text: String
    var color: Color = LF.brand
    let action: () -> Void

    init(_ text: String, color: Color = LF.brand, action: @escaping () -> Void) {
        self.text = text
        self.color = color
        self.action = action
    }

    var body: some View {
        // A ghost: the board's words in the brand color, no outline.
        Button(action: action) {
            Text(text.uppercased()).lfWord(16).foregroundStyle(color).padding(.vertical, 6).padding(.horizontal, 6)
                // 44 pt to tap (for gloves) without taking more room than its words.
                .contentShape(Rectangle().inset(by: -6))
        }
            .buttonStyle(PressStyle())
            .accessibilityLabel(text)
    }
}

/// An icon-only button in the top bar (Edit, Add).
struct BarIcon: View {
    let icon: Ph
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            PhIcon(icon, size: 22, tint: LF.brand, label: label)
                .frame(width: 34, height: 34).contentShape(Rectangle())
        }
    }
}

/// Two or more options side by side, one chosen (DESIGN.md "Segmented control"): the board's, chalk
/// words on near black, the chosen one a chalk slab.
struct Segmented<T: Hashable>: View {
    let options: [(T, String)]
    @Binding var selected: T
    /// Behind the options: the board, or the board's dots where it sits on a board already (Stats' filters).
    var background: Color?
    /// Each option's least height: 48 pt where gloves tap it (Stats' filters).
    var minHeight: CGFloat = 0
    /// The options share the width equally.
    var fill = false
    /// A long word goes over two lines inside its option rather than being cut (the periods over a heatmap on the narrowest phones).
    var wrap = false
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let back = background ?? LF.board
        HStack(spacing: 2) {
            ForEach(options, id: \.0) { value, label in
                let on = value == selected
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { selected = value }
                } label: {
                    Group {
                        if wrap {
                            Text(label.uppercased()).lfWord(16).multilineTextAlignment(.center).lineLimit(2).fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text(label.uppercased()).lfWord(16).lineLimit(1).fixedSize()
                        }
                    }
                        .foregroundStyle(on ? LF.board : LF.onBoardMuted)
                        .padding(.horizontal, wrap ? 4 : 14).padding(.vertical, 7)
                        .frame(maxWidth: fill ? .infinity : nil, minHeight: minHeight, maxHeight: wrap ? .infinity : nil)
                        .background(on ? LF.chalk : back, in: RoundedRectangle(cornerRadius: 4))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .fixedSize(horizontal: false, vertical: wrap)
        .padding(3)
        .background(back, in: RoundedRectangle(cornerRadius: 6))
        .overlay { if scheme == .dark && background == nil { RoundedRectangle(cornerRadius: 6).stroke(LF.boardEdge, lineWidth: 1) } }
        .sensoryFeedback(.selection, trigger: selected)
    }
}

/// An empty list (WEB-4, WEB-17): on the grass, the message inside a chalk center circle with the
/// halfway line running out from it to the touchlines, stopping at it so no chalk runs through the
/// words; inside a panel, the faint drawing behind it.
struct EmptyState<Action: View>: View {
    var picture: EmptyPicture = .center
    let title: String
    let text: String
    @ViewBuilder var action: () -> Action
    @Environment(\.colorScheme) private var scheme
    @Environment(\.ground) private var ground

    var body: some View {
        if ground == .grass { onGrass } else { inPanel }
    }

    private var onGrass: some View {
        VStack(spacing: 8) {
            if picture != .center {
                Canvas { c, size in picture.draw(in: &c, size: size, color: LF.chalk.opacity(0.55)) }
                    .frame(width: 96, height: 74)
                    .padding(.bottom, 2)
            }
            Text(title.uppercased()).font(.display(30, relativeTo: .title2)).foregroundStyle(LF.text).multilineTextAlignment(.center)
                .accessibilityLabel(title)
                .accessibilityAddTraits(.isHeader)
            Text(text).font(.lfBodyMedium).foregroundStyle(LF.chalk.opacity(0.8)).multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            action().padding(.top, 8)
        }
        .padding(.vertical, 24)
        .frame(maxWidth: 270)
        .frame(maxWidth: .infinity, minHeight: 300)
        .background {
            GeometryReader { geo in
                let d = min(geo.size.width, 360)
                Canvas { c, size in
                    let r = d / 2 - chalkWidth / 2
                    let mid = CGPoint(x: size.width / 2, y: size.height / 2)
                    let line = GraphicsContext.Shading.color(LF.chalkLine)
                    c.stroke(Path(ellipseIn: CGRect(x: mid.x - r, y: mid.y - r, width: 2 * r, height: 2 * r)), with: line, lineWidth: chalkWidth)
                    c.stroke(Path { p in
                        p.move(to: CGPoint(x: 0, y: mid.y)); p.addLine(to: CGPoint(x: mid.x - r, y: mid.y))
                        p.move(to: CGPoint(x: mid.x + r, y: mid.y)); p.addLine(to: CGPoint(x: size.width, y: mid.y))
                    }, with: line, lineWidth: chalkWidth)
                }
            }
            .toTouchlines()
        }
        .padding(.vertical, 18)
    }

    private var inPanel: some View {
        VStack(spacing: 6) {
            if picture != .center {
                Canvas { c, size in
                    picture.draw(in: &c, size: size, color: LF.brand.opacity(scheme == .dark ? 0.55 : 0.45))
                }
                .frame(width: 120, height: 93)
                .padding(.bottom, 6)
            }
            Text(title.uppercased()).font(.display(24, relativeTo: .title3)).foregroundStyle(LF.text).multilineTextAlignment(.center)
                .accessibilityLabel(title)
            Text(text).font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center).frame(maxWidth: 320)
            action().padding(.top, 10)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity, minHeight: 240)
        .background {
            Canvas { c, size in
                let line = GraphicsContext.Shading.color(LF.brand.opacity(scheme == .dark ? 0.12 : 0.09))
                let middle = CGPoint(x: size.width / 2, y: size.height / 2)
                let r = min(size.width, size.height) * 0.32
                c.stroke(Path(ellipseIn: CGRect(x: middle.x - r, y: middle.y - r, width: 2 * r, height: 2 * r)), with: line, lineWidth: 2)
                c.stroke(Path { $0.move(to: CGPoint(x: 0, y: middle.y)); $0.addLine(to: CGPoint(x: size.width, y: middle.y)) }, with: line, lineWidth: 2)
                c.fill(Path(ellipseIn: CGRect(x: middle.x - 4, y: middle.y - 4, width: 8, height: 8)), with: line)
            }
        }
    }
}

/// WEB-17: the picture above an empty list's words, as the web's (`EmptyPictures` in ui.tsx), with the same coordinates. Matches have only the lines behind.
enum EmptyPicture {
    case center, venue, crew, bracket, format

    func draw(in c: inout GraphicsContext, size: CGSize, color: Color) {
        let line = GraphicsContext.Shading.color(color)
        let k = size.width / 180
        func at(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: (x - 10) * k, y: (y - 30) * k) }
        var path = Path()
        func lines(_ points: [(CGFloat, CGFloat)]) {
            path.addLines(points.map { at($0.0, $0.1) })
        }
        var spots: [(CGFloat, CGFloat, CGFloat)] = []
        let pitch: [(CGFloat, CGFloat)] = [(20, 45), (180, 45), (180, 155), (20, 155), (20, 45)]
        switch self {
        case .center:
            break
        case .venue:
            lines(pitch)
            lines([(100, 45), (100, 155)])
            lines([(20, 75), (44, 75), (44, 125), (20, 125)])
            lines([(180, 75), (156, 75), (156, 125), (180, 125)])
            let spot = at(100, 100)
            path.addEllipse(in: CGRect(x: spot.x - 18 * k, y: spot.y - 18 * k, width: 36 * k, height: 36 * k))
            // The maps' teardrop pin.
            lines([(130, 92), (114.7, 72.9)])
            path.addArc(center: at(130, 60), radius: 20 * k, startAngle: .degrees(140), endAngle: .degrees(40), clockwise: false)
            path.addLine(to: at(130, 92))
            spots = [(130, 60, 5)]
        case .crew:
            lines(pitch)
            lines([(100, 45), (100, 155)])
            lines([(60, 155), (140, 45)])
            spots = [(100, 100, 7), (140, 45, 5), (60, 155, 5)]
        case .bracket:
            lines([(30, 40), (70, 40), (70, 80), (30, 80)])
            lines([(30, 120), (70, 120), (70, 160), (30, 160)])
            lines([(70, 60), (110, 60), (110, 140), (70, 140)])
            lines([(110, 100), (170, 100)])
            spots = [(170, 100, 5)]
        case .format:
            lines([(20, 80), (90, 80), (90, 120), (20, 120), (20, 80)])
            lines([(110, 80), (180, 80), (180, 120), (110, 120), (110, 80)])
            lines([(90, 100), (110, 100)])
            for x: CGFloat in [20, 55, 90, 110, 145, 180] { lines([(x, 130), (x, 136)]) }
        }
        c.stroke(path, with: line, lineWidth: 1.4)
        for (x, y, r) in spots {
            let p = at(x, y)
            c.fill(Path(ellipseIn: CGRect(x: p.x - r * k, y: p.y - r * k, width: 2 * r * k, height: 2 * r * k)), with: line)
        }
    }
}

/// A search that found nothing: plain, as it needs no explaining (WEB-17).
struct NoResults<Action: View>: View {
    let message: String
    @ViewBuilder var action: () -> Action

    var body: some View {
        VStack(spacing: 12) {
            Text(message).font(.lfBodyMedium).foregroundStyle(LF.muted).multilineTextAlignment(.center)
            action()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
    }
}

extension NoResults where Action == EmptyView {
    init(_ message: String) {
        self.message = message
        action = { EmptyView() }
    }
}

/// The loading pitch (WEB-9): a small pitch marked out over and over in brand green; `inline` is the small one, for a row.
struct LoadingPitch: View {
    var inline = false

    var body: some View {
        TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.4) / 1.4
            Canvas { c, size in
                let color = GraphicsContext.Shading.color(LF.brand.opacity(inline ? 0.6 : 0.35))
                if t > 0.05 { c.stroke(Path(CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)), with: color, lineWidth: 2) }
                if t > 0.3 { c.stroke(Path { $0.move(to: CGPoint(x: size.width / 2, y: 0)); $0.addLine(to: CGPoint(x: size.width / 2, y: size.height)) }, with: color, lineWidth: 2) }
                if t > 0.55 {
                    let r = size.height * 0.2
                    c.stroke(Path(ellipseIn: CGRect(x: size.width / 2 - r, y: size.height / 2 - r, width: 2 * r, height: 2 * r)), with: color, lineWidth: 2)
                }
            }
        }
        .frame(width: inline ? 30 : 76, height: inline ? 19 : 48)
        .padding(inline ? 0 : 32)
        .frame(maxWidth: inline ? nil : .infinity)
        .accessibilityLabel("Loading")
    }
}

/// A fact on a page: an icon, a small label and the value; a value with `tone` shows as a chip (your
/// role). `wide` is kept for callers; each fact takes its own row.
struct Fact: Identifiable {
    let icon: Ph
    let label: String
    let value: String
    var wide = false
    var tone: ChipTone?
    /// A fact with several lines (the Watch fact, SYNC-14), in place of `value`.
    var lines: [FactLine]?
    var id: String { label }
}

/// A line of a fact with several: plain, amber for something to do, or muted.
struct FactLine: Equatable {
    let text: String
    var tone: ChipTone?
}

/// Facts in a chalk panel (a match's, a venue's, a referee's).
struct FactsCard: View {
    let facts: [Fact]

    var body: some View {
        LfCard { Facts(facts: facts) }
    }
}

/// A page's facts as rows divided by hairlines (DESIGN.md "Facts"): a muted icon beside a small
/// JetBrains Mono label over its value, so the value has the panel's width, as the website's on a phone.
struct Facts: View {
    let facts: [Fact]
    var divideFirst = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(facts.enumerated()), id: \.offset) { i, f in
                if i > 0 || divideFirst { Hairline().padding(.horizontal, 16) }
                HStack(alignment: .top, spacing: 12) {
                    PhIcon(f.icon, size: 18, tint: LF.muted).padding(.top, 1)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(f.label.uppercased()).lfLabel(11, spacing: 0.12).foregroundStyle(LF.muted)
                        if let lines = f.lines {
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                                Text(l.text).font(.barlow(16, l.tone == .plain ? .regular : .semibold))
                                    .foregroundStyle(l.tone == .amber ? LF.amberText : l.tone == .plain ? LF.muted : LF.text)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        } else if let tone = f.tone {
                            Chip(f.value, tone: tone)
                        } else {
                            Text(f.value).font(.barlow(16, .semibold)).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

extension View {
    /// A sheet as tall as what's in it (`height`, measured inside its scroll view), up to the whole screen, so
    /// its buttons at the foot show without dragging it up (the SE, large text); it can still be pulled to full height.
    func fittedDetents(_ height: CGFloat) -> some View {
        presentationDetents([.height(height + 12), .large])
    }
}

/// A row of small things that wraps onto more lines. One wider than the row (a sentence at the largest
/// text sizes) is given the row's width, so it wraps within it rather than running off the screen.
struct Flow: Layout {
    var spacing: CGFloat = 6

    private func fitted(_ view: LayoutSubview, within width: CGFloat) -> CGSize {
        let ideal = view.sizeThatFits(.unspecified)
        return ideal.width > width ? view.sizeThatFits(ProposedViewSize(width: width, height: nil)) : ideal
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = fitted(view, within: width)
            if x > 0, x + size.width > width {
                y += row + spacing
                x = 0
                row = 0
            }
            x += size.width + spacing
            row = max(row, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: widest, height: y + row)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
        for view in subviews {
            let size = fitted(view, within: bounds.width)
            // A point's grace: the width it was given can round down from what it asked for, which mustn't wrap the last one.
            if x > bounds.minX, x + size.width > bounds.maxX + 1 {
                y += row + spacing
                x = bounds.minX
                row = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            row = max(row, size.height)
        }
    }
}

extension View {
    /// The page's words 21 pt in from the screen's edge, inside the pitch frame's touchlines.
    func lfPage() -> some View {
        padding(.horizontal, pagePad).padding(.bottom, 24)
    }
}

/// WEB-23: a referee's phone and email as Call, Text and Email, joined in one group of icons, rather
/// than the number and address themselves, which only their profile shows.
struct ContactButtons: View {
    let phone: String?
    let email: String?
    let name: String
    @Environment(\.openURL) private var openURL

    var body: some View {
        let dial = phone.map { $0.filter { $0.isNumber || $0 == "+" } }
        let buttons: [(Ph, String, String)] = [
            dial.map { (.phone, "Call \(name)", "tel:\($0)") },
            dial.map { (.message, "Text \(name)", "sms:\($0)") },
            email.map { (.mail, "Email \(name)", "mailto:\($0)") },
        ].compactMap { $0 }
        if !buttons.isEmpty {
            HStack(spacing: 0) {
                ForEach(Array(buttons.enumerated()), id: \.offset) { i, b in
                    if i > 0 { Rectangle().fill(LF.borderInput).frame(width: 1, height: 40) }
                    Button { if let url = URL(string: b.2) { openURL(url) } } label: {
                        PhIcon(b.0, size: 19, tint: LF.brandStrong, label: b.1).frame(width: 42, height: 40).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(LF.field, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(LF.borderInput, lineWidth: 1))
        }
    }
}
