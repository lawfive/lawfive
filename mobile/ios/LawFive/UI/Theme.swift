import SwiftUI
import UIKit

// LawFive's look on iPhone (IOS-1, IOS-13, WEB-24, DESIGN.md): Pitch & Scoreboard. The page is the
// grass, figures sit on near-black stadium boards, dense content on chalk panels (dark slabs at a
// night match); Barlow for text, Barlow Condensed (black italic on the boards) for headings and
// figures, JetBrains Mono for codes and the boards' small labels; on native controls.
//
// As on the website and Android, where something sits sets its colors: the working tokens
// (`LF.text`, `LF.muted`, `LF.surface`, `LF.brand`…) take the ground under them (`Ground`), so
// components use them and need no colors of their own. The page is the grass, so its words are chalk;
// `LfCard` and the other panels set `.ground(.panel)`, boards `.ground(.board)`. The ground travels as
// a UIKit trait bridged to SwiftUI's environment, so each token stays a plain `Color` that resolves
// for the mode and the ground it's drawn on.

/// What something sits on (DESIGN.md "Color"): the grass, a chalk panel, or a stadium board.
enum Ground: Int, Sendable {
    case grass, panel, board
}

struct GroundTrait: UITraitDefinition {
    static let defaultValue = Ground.grass
    static let affectsColorAppearance = true
    static let name = "LawFive ground"
}

extension UITraitCollection {
    var ground: Ground { self[GroundTrait.self] }
}

extension UIMutableTraits {
    var ground: Ground {
        get { self[GroundTrait.self] }
        set { self[GroundTrait.self] = newValue }
    }
}

struct GroundKey: EnvironmentKey, UITraitBridgedEnvironmentKey {
    static let defaultValue = Ground.grass
    static func read(from traits: UITraitCollection) -> Ground { traits.ground }
    static func write(to traits: inout UIMutableTraits, value: Ground) { traits.ground = value }
}

extension EnvironmentValues {
    var ground: Ground {
        get { self[GroundKey.self] }
        set { self[GroundKey.self] = newValue }
    }
}

extension View {
    /// What's inside sits on `ground`: its words, buttons and fields take that ground's colors.
    func ground(_ ground: Ground) -> some View { environment(\.ground, ground) }
}

extension UIColor {
    convenience init(hex: UInt32, alpha: CGFloat = 1) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
    }
}

/// One mode's colors for one ground, by the website's names (DESIGN.md's tokens), as Android's `LawFiveColors`.
struct Tokens {
    // The working tokens, for where something sits.
    var surface: UIColor
    var surface2: UIColor
    /// Inside a field people type in.
    var field: UIColor
    var text: UIColor
    var muted: UIColor
    var border: UIColor
    /// Around fields people type in: about 3:1 against what's behind them (WCAG 1.4.11).
    var borderInput: UIColor
    var brand: UIColor
    var brandStrong: UIColor
    var brandSoft: UIColor
    var onBrand: UIColor
    /// Red words (errors, Delete, a red chip), dark enough on a panel (and light enough on the grass) to read (WCAG AA).
    var redText: UIColor
    var redSoft: UIColor
    var amberSoft: UIColor
    var amberText: UIColor
    var blueSoft: UIColor
    var blueText: UIColor
    /// A clear day's sun and a storm (WX-5).
    var weatherAmber: UIColor
    var chartGrid: UIColor

    /// The ground itself and what's drawn on it, the same wherever they're used.
    struct Fixed {
        let dark: Bool
        var pitch: UIColor { dark ? UIColor(hex: 0x0F2E20) : UIColor(hex: 0x12613E) }
        var pitchStripe: UIColor { dark ? UIColor(hex: 0x0D291C) : UIColor(hex: 0x115E3C) }
        var chalk: UIColor { dark ? UIColor(hex: 0xE6E9E3) : UIColor(hex: 0xF4F2E9) }
        var chalkLine: UIColor { dark ? UIColor(hex: 0xB4BDB6) : UIColor(hex: 0xF4F2E9) }
        var chalkMuted: UIColor { dark ? UIColor(hex: 0xA6C2B0) : UIColor(hex: 0xC4DCCD) }
        var chalkFaint: UIColor { dark ? UIColor(hex: 0xB4BDB6, alpha: 0.30) : UIColor(hex: 0xF4F2E9, alpha: 0.32) }
        var heroShadow: UIColor { dark ? UIColor(hex: 0x2FAE7A) : UIColor(hex: 0x06301D) }
        var board: UIColor { dark ? UIColor(hex: 0x121614) : UIColor(hex: 0x0B0E0D) }
        var boardEdge: UIColor { dark ? UIColor(hex: 0x313C36) : .clear }
        var boardDots: UIColor { dark ? UIColor(hex: 0x232C27) : UIColor(hex: 0x1C2420) }
        var boardRule: UIColor { dark ? UIColor(hex: 0x2E3934) : UIColor(hex: 0x25302B) }
        var onBoard: UIColor { dark ? UIColor(hex: 0xE6E9E3) : UIColor(hex: 0xF4F2E9) }
        var onBoardMuted: UIColor { dark ? UIColor(hex: 0xA7B1AB) : UIColor(hex: 0xB6BFBA) }
        var onBoardDim: UIColor { dark ? UIColor(hex: 0x7C8580) : UIColor(hex: 0x7F8883) }
        var panel: UIColor { dark ? UIColor(hex: 0x0F1B15) : UIColor(hex: 0xF4F2E9) }
        var panel2: UIColor { dark ? UIColor(hex: 0x16241D) : UIColor(hex: 0xE9E7DC) }
        var panelEdge: UIColor { dark ? UIColor(hex: 0x5D6A63) : .clear }
        var panelShadow: UIColor { dark ? .clear : UIColor(hex: 0x06301D, alpha: 0.45) }
        var ink: UIColor { dark ? UIColor(hex: 0xE6E9E3) : UIColor(hex: 0x0E1311) }
        var inkMuted: UIColor { dark ? UIColor(hex: 0xA3AEA7) : UIColor(hex: 0x4D5650) }
        var inkBrand: UIColor { dark ? UIColor(hex: 0x2FAE7A) : UIColor(hex: 0x0B6B47) }
        /// A panel's heavy 3 pt rule (the figures across its top, Where's league table): `--ink-rule`.
        var inkRule: UIColor { dark ? UIColor(hex: 0x7D8A83) : UIColor(hex: 0x0E1311) }
    }

    static func make(dark: Bool, ground: Ground) -> Tokens {
        let f = Fixed(dark: dark)
        let white = UIColor.white
        // On the grass and on a board: light words on dark green or near black.
        var t = Tokens(
            surface: .clear, surface2: white.withAlphaComponent(0.09), field: .clear,
            text: f.chalk, muted: f.chalkMuted, border: f.chalkFaint, borderInput: f.chalkLine,
            brand: f.chalk, brandStrong: white, brandSoft: white.withAlphaComponent(0.14), onBrand: f.board,
            redText: UIColor(hex: 0xFFC2BE), redSoft: UIColor(hex: 0xD4202A, alpha: 0.30),
            amberSoft: UIColor(hex: 0xF7C600, alpha: 0.22), amberText: UIColor(hex: 0xFFE08A),
            blueSoft: UIColor(hex: 0x78AAE6, alpha: 0.22), blueText: UIColor(hex: 0xC6DDFF),
            weatherAmber: UIColor(hex: 0xFFD25E), chartGrid: f.chalkFaint
        )
        switch ground {
        case .grass:
            break
        case .board:
            t.surface = f.board
            t.surface2 = f.boardDots
            t.text = f.onBoard
            t.muted = f.onBoardMuted
            t.border = f.boardRule
            t.brandSoft = white.withAlphaComponent(0.12)
        case .panel:
            t = Tokens(
                surface: f.panel, surface2: f.panel2, field: dark ? UIColor(hex: 0x0B130F) : UIColor(hex: 0xFBFAF6),
                text: f.ink, muted: f.inkMuted, border: dark ? UIColor(hex: 0x26332C) : UIColor(hex: 0xD6D4C8), borderInput: dark ? UIColor(hex: 0x6B7872) : UIColor(hex: 0x858A82),
                brand: f.inkBrand, brandStrong: dark ? UIColor(hex: 0x5CC999) : UIColor(hex: 0x08573A), brandSoft: dark ? UIColor(hex: 0x173A2B) : UIColor(hex: 0xDBE8DB),
                onBrand: dark ? UIColor(hex: 0x04140D) : .white,
                redText: dark ? UIColor(hex: 0xFF8589) : UIColor(hex: 0xB8232A), redSoft: dark ? UIColor(hex: 0x3A1B1C) : UIColor(hex: 0xF6DCD7),
                amberSoft: dark ? UIColor(hex: 0x3A3214) : UIColor(hex: 0xF6E8B5), amberText: dark ? UIColor(hex: 0xF0CD5A) : UIColor(hex: 0x6F5400),
                blueSoft: dark ? UIColor(hex: 0x172636) : UIColor(hex: 0xDDE6EE), blueText: dark ? UIColor(hex: 0x8AB8EA) : UIColor(hex: 0x1A5699),
                weatherAmber: dark ? UIColor(hex: 0xE8A317) : UIColor(hex: 0xA06D00), chartGrid: dark ? UIColor(hex: 0x26332C) : UIColor(hex: 0xDCDACF)
            )
        }
        return t
    }

    /// The six sets (two modes, three grounds), made once.
    private static let all: [Bool: [Ground: Tokens]] = [
        false: [.grass: make(dark: false, ground: .grass), .panel: make(dark: false, ground: .panel), .board: make(dark: false, ground: .board)],
        true: [.grass: make(dark: true, ground: .grass), .panel: make(dark: true, ground: .panel), .board: make(dark: true, ground: .board)],
    ]

    static func of(_ traits: UITraitCollection) -> Tokens { all[traits.userInterfaceStyle == .dark]![traits.ground]! }
    static func of(dark: Bool, ground: Ground) -> Tokens { all[dark]![ground]! }
}

/// A token that follows the ground it's drawn on, and the mode.
private func working(_ key: KeyPath<Tokens, UIColor>) -> Color {
    Color(uiColor: UIColor { Tokens.of($0)[keyPath: key] })
}

/// A color of the ground itself, the same on any ground.
private func fixed(_ key: KeyPath<Tokens.Fixed, UIColor>) -> Color {
    Color(uiColor: fixedUI(key))
}

func fixedUI(_ key: KeyPath<Tokens.Fixed, UIColor>) -> UIColor {
    UIColor { Tokens.Fixed(dark: $0.userInterfaceStyle == .dark)[keyPath: key] }
}

/// A token for a known ground and mode, fixed: for what iOS 17 draws outside the ground's trait, such
/// as a menu's label, where `LF`'s tokens would take the grass's colors.
func ink(_ key: KeyPath<Tokens, UIColor>, _ ground: Ground, _ scheme: ColorScheme) -> Color {
    Color(uiColor: Tokens.of(dark: scheme == .dark, ground: ground)[keyPath: key])
}

private func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
}

/// The web's tokens by the same names.
enum LF {
    // The working tokens: they take the ground they're on.
    /// The page: the grass.
    static let bg = fixed(\.pitch)
    static let surface = working(\.surface)
    static let surface2 = working(\.surface2)
    static let field = working(\.field)
    static let text = working(\.text)
    static let muted = working(\.muted)
    static let border = working(\.border)
    static let borderInput = working(\.borderInput)
    static let brand = working(\.brand)
    static let brandStrong = working(\.brandStrong)
    static let brandSoft = working(\.brandSoft)
    static let onBrand = working(\.onBrand)
    static let redText = working(\.redText)
    static let redSoft = working(\.redSoft)
    static let amberSoft = working(\.amberSoft)
    static let amberText = working(\.amberText)
    static let blueSoft = working(\.blueSoft)
    static let blueText = working(\.blueText)
    /// DESIGN.md: a clear day's sun and a storm are amber; the rest take the text color.
    static let weatherAmber = working(\.weatherAmber)
    static let chartGrid = working(\.chartGrid)

    // The ground itself and the things drawn on it.
    static let pitch = fixed(\.pitch)
    static let pitchStripe = fixed(\.pitchStripe)
    static let chalk = fixed(\.chalk)
    /// The pitch markings: touchlines, the halfway line, circles, rules (3 pt).
    static let chalkLine = fixed(\.chalkLine)
    static let chalkMuted = fixed(\.chalkMuted)
    static let chalkFaint = fixed(\.chalkFaint)
    /// The hard offset under a page's title on the grass: dark green by day, mint at night.
    static let heroShadow = fixed(\.heroShadow)
    static let board = fixed(\.board)
    /// A board's 1 pt edge at night (none by day).
    static let boardEdge = fixed(\.boardEdge)
    static let boardDots = fixed(\.boardDots)
    static let boardRule = fixed(\.boardRule)
    static let onBoard = fixed(\.onBoard)
    static let onBoardStrong = Color.white
    static let onBoardMuted = fixed(\.onBoardMuted)
    /// On the board, the side that lost.
    static let onBoardDim = fixed(\.onBoardDim)
    /// The board's mint labels ("NEXT MATCH", "FULL TIME").
    static let boardAccent = Color(uiColor: UIColor(hex: 0x2FAE7A))
    static let panel = fixed(\.panel)
    static let panel2 = fixed(\.panel2)
    /// A panel's 1 pt edge at night (none by day).
    static let panelEdge = fixed(\.panelEdge)
    /// A panel's hard 3 pt drop by day (none at night).
    static let panelShadow = fixed(\.panelShadow)
    static let ink = fixed(\.ink)
    static let inkMuted = fixed(\.inkMuted)
    static let inkBrand = fixed(\.inkBrand)
    /// A panel's heavy 3 pt rule: `--ink-rule`.
    static let inkRule = fixed(\.inkRule)
    /// A team with no color, on the board.
    static let kitBlank = Color(uiColor: UIColor(hex: 0x3A403D))

    static let yellow = Color(uiColor: UIColor(hex: 0xF7C600))
    static let coin = Color(uiColor: UIColor(hex: 0xD9A92C))
    static let coinEdge = Color(uiColor: UIColor(hex: 0x8A6508))
    static let coinInk = Color(uiColor: UIColor(hex: 0x5F4503))
    /// A red card, a delete icon: red as a mark.
    static let red = Color(uiColor: UIColor(hex: 0xD4202A))
    /// Behind white words, a filled Delete button, as the website's --red-strong.
    static let redStrong = Color(uiColor: UIColor(hex: 0xB8232A))
    /// Text on the yellow: the waiting count.
    static let onYellow = Color(uiColor: UIColor(hex: 0x1B1600))
    /// Speed bands on maps, walking to sprinting (DESIGN.md, TRK-5).
    static let speed = [dynamic(0x3A9A6C, 0x1F8A59), dynamic(0x187D4F, 0x36A677), dynamic(0x0B5E3E, 0x62C294), dynamic(0x06472D, 0x9BDCB9), dynamic(0x03301D, 0xD4F2E2)]
    // Stats on the board and the grass (WEB-24, the broadcast stats package), the same day and night,
    // as Android's: roles and genders in chalk, mint, a deep mint and grays (their values always written).
    /// AR2, inside the assistant's mint: `--role-ar2`.
    static let roleAr2 = Color(uiColor: UIColor(hex: 0x1D7A54))
    /// The fourth official, and co-ed: `--role-fourth`.
    static let roleFourth = Color(uiColor: UIColor(hex: 0x9AA39E))
    /// None set: `--role-none`.
    static let roleNone = Color(uiColor: UIColor(hex: 0x5B6560))
    /// Busiest times' lit tiles, from the grass's green to pale mint (`--heat-1`…`6`): chalk figures on the first three, board-black on the rest.
    static let heat = ([0x1B4A34, 0x1F6142, 0x237A50, 0x4FAE80, 0x86CFA6, 0xC6ECD5] as [UInt32]).map { Color(uiColor: UIColor(hex: $0)) }
    /// Speed bands on the board: the night match's ramp by day too, dark green to pale mint.
    static let boardSpeed = ([0x1F8A59, 0x36A677, 0x62C294, 0x9BDCB9, 0xD4F2E2] as [UInt32]).map { Color(uiColor: UIColor(hex: $0)) }
    /// Heart-rate zones on the board: the night match's orange ramp by day too, dark to pale.
    static let boardZones = ([0x8A3311, 0xB8481A, 0xD95926, 0xEC8257, 0xF5AD8A] as [UInt32]).map { Color(uiColor: UIColor(hex: $0)) }
    // TRK-9, WEB-24: the pitch heatmap painted on the grass (`--contour-*`), as Android's: its ground and
    // stripe, six bands from the grass's green to pale mint (greens only: yellow and red stay with the
    // cards), the bands' edges and the markings' dark edge; darker at a night match, the chalk at 70%.
    static let contourGround = dynamic(0x12613E, 0x0E2C1E)
    static let contourStripe = dynamic(0x0F5A39, 0x0B2418)
    static let contour = [
        dynamic(0x1A6E45, 0x133A28), dynamic(0x258052, 0x194832), dynamic(0x359463, 0x22593E),
        dynamic(0x52AB78, 0x2E6C4C), dynamic(0x86C79D, 0x418360), dynamic(0xC6E7CB, 0x5F9D7B),
    ]
    static let contourLine = dynamic(0x083D25, 0x03110A)
    static let contourCase = dynamic(0x0A3A24, 0x04140C)
    /// Parking's blue on the web's pins.
    static let parkingBlue = Color(uiColor: UIColor(hex: 0x1D5FA8))
}

/// The type scale, as Android's, growing with the phone's text size.
extension Font {
    static func barlow(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .medium: name = "Barlow-Medium"
        case .semibold: name = "Barlow-SemiBold"
        case .bold, .heavy, .black: name = "Barlow-Bold"
        default: name = "Barlow-Regular"
        }
        return .custom(name, size: size, relativeTo: style)
    }

    /// Barlow Condensed black italic: headings, kit names and the figures on the boards, with figures
    /// of one width. Write the words in capitals where DESIGN.md has them.
    static func display(_ size: CGFloat, relativeTo style: Font.TextStyle = .title) -> Font {
        Font.custom("BarlowCondensed-BlackItalic", size: size, relativeTo: style).monospacedDigit()
    }

    /// Barlow Condensed upright, from semibold to black: the board's words (buttons, chips, tabs).
    static func condensed(_ size: CGFloat, _ weight: Font.Weight = .heavy, italic: Bool = false, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case .semibold: name = italic ? "BarlowCondensed-BoldItalic" : "BarlowCondensed-SemiBold"
        case .bold: name = italic ? "BarlowCondensed-BoldItalic" : "BarlowCondensed-Bold"
        case .black: name = italic ? "BarlowCondensed-BlackItalic" : "BarlowCondensed-Black"
        default: name = italic ? "BarlowCondensed-ExtraBoldItalic" : "BarlowCondensed-ExtraBold"
        }
        return .custom(name, size: size, relativeTo: style)
    }

    static func mono(_ size: CGFloat, bold: Bool = false, relativeTo style: Font.TextStyle = .body) -> Font {
        let font = Font.custom("JetBrainsMono-Regular", size: size, relativeTo: style)
        return bold ? font.weight(.bold) : font
    }

    static let lfDisplayLarge = display(56, relativeTo: .largeTitle)
    static let lfDisplayMedium = display(42, relativeTo: .largeTitle)
    static let lfHeadlineLarge = display(34, relativeTo: .largeTitle)
    static let lfHeadlineSmall = display(26, relativeTo: .title2)
    static let lfTitleLarge = barlow(20, .bold, relativeTo: .title3)
    static let lfTitleMedium = barlow(16, .semibold, relativeTo: .headline)
    /// Section labels: small capitals in JetBrains Mono, as the boards' own labels (the website's h3); give it `.lfLabel()`'s spacing.
    static let lfTitleSmall = mono(12, bold: true, relativeTo: .footnote)
    static let lfBodyLarge = barlow(16)
    static let lfBodyMedium = barlow(15, relativeTo: .subheadline)
    static let lfBodySmall = barlow(13, .medium, relativeTo: .footnote)
    /// Buttons and tabs: the board's words.
    static let lfLabelLarge = condensed(17, relativeTo: .headline)
    static let lfLabelMedium = barlow(13, .semibold, relativeTo: .footnote)
    static let lfLabelSmall = barlow(11, .semibold, relativeTo: .caption2)
}

extension Text {
    /// The board's small labels ("NEXT MATCH", "VENUE"): JetBrains Mono bold capitals, spaced (0.14 em).
    func lfLabel(_ size: CGFloat = 11.5, spacing: CGFloat = 0.14) -> Text {
        font(.mono(size, bold: true, relativeTo: .caption)).tracking(size * spacing)
    }

    /// The board's words (buttons, chips, tabs): Barlow Condensed extra-bold, spaced 0.05 em.
    func lfWord(_ size: CGFloat = 17, _ weight: Font.Weight = .heavy) -> Text {
        font(.condensed(size, weight, relativeTo: .headline)).tracking(size * 0.05)
    }
}

/// The system's own bars and controls in LawFive's colors and fonts, so what's native still reads as
/// LawFive: the navigation bar is the board (DESIGN.md "Navigation"), its words chalk.
@MainActor
func styleSystemBars() {
    let chalk = fixedUI(\.onBoard)
    let board = fixedUI(\.board)
    let bar = UINavigationBarAppearance()
    bar.configureWithOpaqueBackground()
    bar.backgroundColor = board
    bar.shadowColor = .clear
    bar.titleTextAttributes = [.font: UIFont(name: "BarlowCondensed-BlackItalic", size: 20) ?? .boldSystemFont(ofSize: 20), .foregroundColor: chalk]
    bar.largeTitleTextAttributes = [.font: UIFont(name: "BarlowCondensed-BlackItalic", size: 34) ?? .boldSystemFont(ofSize: 34), .foregroundColor: chalk]
    let buttons = UIBarButtonItemAppearance()
    let word = UIFont(name: "BarlowCondensed-ExtraBold", size: 18) ?? .boldSystemFont(ofSize: 18)
    buttons.normal.titleTextAttributes = [.font: word, .foregroundColor: chalk, .kern: 0.9]
    bar.backButtonAppearance = buttons
    bar.buttonAppearance = buttons
    bar.doneButtonAppearance = buttons
    UINavigationBar.appearance().standardAppearance = bar
    UINavigationBar.appearance().scrollEdgeAppearance = bar
    UINavigationBar.appearance().compactAppearance = bar
    UINavigationBar.appearance().tintColor = chalk
    // Switches and the like: the panel's pitch green, as they mostly sit on panels.
    UISwitch.appearance().onTintColor = fixedUI(\.inkBrand)
    UISegmentedControl.appearance().selectedSegmentTintColor = fixedUI(\.chalk)
    // The pull to refresh (APP-3) on the grass: chalk.
    UIRefreshControl.appearance().tintColor = fixedUI(\.chalk)
}
