import SwiftUI
import UIKit
import XCTest
@testable import LawFive

// IOS-13, WEB-24: the grounds' colors, the fonts the look needs, and that a token resolves for the
// ground it's drawn on, as Android's ContrastTest checks its own.
@MainActor
final class ThemeTests: XCTestCase {
    private func rgb(_ c: UIColor) -> (Double, Double, Double, Double) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    private func luminance(_ c: (Double, Double, Double)) -> Double {
        func channel(_ v: Double) -> Double { v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        return 0.2126 * channel(c.0) + 0.7152 * channel(c.1) + 0.0722 * channel(c.2)
    }

    /// A see-through color over what's behind it.
    private func over(_ top: UIColor, _ under: UIColor) -> (Double, Double, Double) {
        let (r, g, b, a) = rgb(top)
        let (r2, g2, b2, _) = rgb(under)
        return (r * a + r2 * (1 - a), g * a + g2 * (1 - a), b * a + b2 * (1 - a))
    }

    private func contrast(_ a: (Double, Double, Double), _ b: (Double, Double, Double)) -> Double {
        let (x, y) = (luminance(a), luminance(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    /// The real background of each ground: the grass (its darker stripe too), a panel, a board.
    private func backgrounds(dark: Bool, ground: Ground) -> [UIColor] {
        let f = Tokens.Fixed(dark: dark)
        switch ground {
        case .grass: return [f.pitch, f.pitchStripe]
        case .panel: return [f.panel]
        case .board: return [f.board]
        }
    }

    func testWordsReadOnEveryGroundInBothModes() {
        for dark in [false, true] {
            for ground in [Ground.grass, .panel, .board] {
                let t = Tokens.of(dark: dark, ground: ground)
                for bg in backgrounds(dark: dark, ground: ground) {
                    let behind = over(bg, bg)
                    for (name, color) in [("text", t.text), ("muted", t.muted), ("brand", t.brand), ("redText", t.redText)] {
                        let c = contrast(over(color, bg), behind)
                        XCTAssertGreaterThanOrEqual(c, 4.5, "\(name) on \(ground) \(dark ? "at night" : "by day"): \(c)")
                    }
                    // Chips are always panel-colored, wherever they sit (DESIGN.md "Chips"): their words on their soft colors.
                    if ground == .panel {
                        for (name, fg, soft) in [("amber", t.amberText, t.amberSoft), ("red", t.redText, t.redSoft), ("blue", t.blueText, t.blueSoft)] {
                            let c = contrast(over(fg, bg), over(soft, bg))
                            XCTAssertGreaterThanOrEqual(c, 4.5, "\(name) chip \(dark ? "at night" : "by day"): \(c)")
                        }
                    }
                    // A primary button's words on its slab.
                    XCTAssertGreaterThanOrEqual(contrast(over(t.onBrand, bg), over(t.brand, bg)), 4.5, "onBrand on brand on \(ground)")
                }
            }
        }
    }

    func testTheBoardsWordsRead() {
        for dark in [false, true] {
            let f = Tokens.Fixed(dark: dark)
            let board = over(f.board, f.board)
            XCTAssertGreaterThanOrEqual(contrast(over(f.onBoardMuted, f.board), board), 4.5, "muted on the board")
            XCTAssertGreaterThanOrEqual(contrast(over(UIColor(hex: 0x2FAE7A), f.board), board), 4.5, "mint labels on the board")
        }
        XCTAssertGreaterThanOrEqual(contrast(over(.white, UIColor(hex: 0xB8232A)), over(UIColor(hex: 0xB8232A), .white)), 4.5, "white on the red button")
    }

    func testFieldsShowAgainstWhatsAroundThem() {
        for dark in [false, true] {
            for ground in [Ground.grass, .panel] {
                let t = Tokens.of(dark: dark, ground: ground)
                for bg in backgrounds(dark: dark, ground: ground) {
                    let c = contrast(over(t.borderInput, bg), over(bg, bg))
                    XCTAssertGreaterThanOrEqual(c, 3, "a field's edge on \(ground) \(dark ? "at night" : "by day"): \(c)")
                }
            }
        }
    }

    func testTheFontsAreThere() {
        for name in ["Barlow-Regular", "Barlow-Medium", "Barlow-SemiBold", "Barlow-Bold", "BarlowCondensed-SemiBold", "BarlowCondensed-Bold", "BarlowCondensed-ExtraBold",
                     "BarlowCondensed-Black", "BarlowCondensed-BoldItalic", "BarlowCondensed-ExtraBoldItalic", "BarlowCondensed-BlackItalic", "JetBrainsMono-Regular"] {
            XCTAssertNotNil(UIFont(name: name, size: 12), name)
        }
    }

    /// The ground travels to UIKit's colors through the trait SwiftUI bridges.
    func testATokenFollowsTheGroundItsDrawnOn() {
        func pixel(_ ground: Ground) -> (Double, Double, Double) {
            let renderer = ImageRenderer(content: Rectangle().fill(LF.text).frame(width: 4, height: 4).ground(ground).environment(\.colorScheme, .light))
            renderer.scale = 1
            let image = renderer.uiImage!
            let data = image.cgImage!.dataProvider!.data! as Data
            return (Double(data[0]) / 255, Double(data[1]) / 255, Double(data[2]) / 255)
        }
        let chalk = Tokens.Fixed(dark: false).chalk
        let ink = Tokens.Fixed(dark: false).ink
        let (onGrass, onPanel) = (pixel(.grass), pixel(.panel))
        XCTAssertLessThan(contrast(onGrass, over(chalk, chalk)), 1.1, "chalk on the grass")
        XCTAssertLessThan(contrast(onPanel, over(ink, ink)), 1.1, "ink on a panel")
    }
}
