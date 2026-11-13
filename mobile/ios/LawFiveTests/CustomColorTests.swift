import UIKit
import XCTest
@testable import LawFive

// WEB-19: a custom team color from Apple's picker is saved as #RRGGBB in sRGB.
final class CustomColorTests: XCTestCase {
    func testAnSRGBColorKeepsItsValue() {
        XCTAssertEqual(hexString(UIColor(red: 42 / 255, green: 157 / 255, blue: 143 / 255, alpha: 1).cgColor), "#2A9D8F")
        XCTAssertEqual(hexString(UIColor.black.cgColor), "#000000")
        XCTAssertEqual(hexString(UIColor.white.cgColor), "#FFFFFF")
    }

    func testADisplayP3ColorOutsideSRGBIsClamped() {
        XCTAssertEqual(hexString(UIColor(displayP3Red: 1, green: 0, blue: 0, alpha: 1).cgColor), "#FF0000")
    }

    func testItReadsBackAsTheSameColor() {
        let c = parseColor(hexString(UIColor(red: 0.2, green: 0.4, blue: 0.6, alpha: 1).cgColor))
        XCTAssertEqual(c?.r ?? 0, 0.2, accuracy: 0.003)
        XCTAssertEqual(c?.g ?? 0, 0.4, accuracy: 0.003)
        XCTAssertEqual(c?.b ?? 0, 0.6, accuracy: 0.003)
    }
}
