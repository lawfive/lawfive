import XCTest
@testable import LawFive

// TRK-9, WEB-24: the painted heatmap's bands work out as the website's (web/src/contours.ts), with the
// same cases as web/test/contours.test.ts and Android's ContoursTest, and the same paths for the same grid.
final class ContoursTests: XCTestCase {
    private func numbers(_ d: String) -> [Double] {
        let regex = try! NSRegularExpression(pattern: "-?[\\d.]+")
        return regex.matches(in: d, range: NSRange(d.startIndex..., in: d)).map { Double(d[Range($0.range, in: d)!])! }
    }

    func testNoTimeOnThePitchDrawsNoBands() {
        let paths = heatContours(Array(repeating: 0, count: 24 * 18), cols: 24, rows: 18, w: 115, h: 84)
        XCTAssertEqual(paths.count, contourLevels.count)
        XCTAssertTrue(paths.allSatisfy { $0.isEmpty })
    }

    func testTimeInOnePlaceDrawsAClosedBandAtEveryLevelAroundThatPlace() {
        let cols = 24
        let rows = 18
        var cells = Array(repeating: 0.0, count: cols * rows)
        cells[9 * cols + 12] = 600
        cells[9 * cols + 11] = 300
        let paths = heatContours(cells, cols: cols, rows: rows, w: 120, h: 90).map(svgPath)
        XCTAssertEqual(paths.count, 6)
        for d in paths {
            XCTAssertNotNil(d.range(of: "^M[\\d.]+ [\\d.]+C", options: .regularExpression), d)
            XCTAssertTrue(d.hasSuffix("Z"))
            // Every point of every band lies around the hot cells (x 55 to 65, y 45 to 50), within a few cells.
            let n = numbers(d)
            for i in stride(from: 0, to: n.count, by: 2) {
                XCTAssertTrue(n[i] > 35 && n[i] < 85, "x \(n[i])")
                XCTAssertTrue(n[i + 1] > 25 && n[i + 1] < 70, "y \(n[i + 1])")
            }
        }
        // Higher levels draw smaller rings.
        XCTAssertLessThanOrEqual(paths[5].count, paths[0].count)
    }

    func testMarchingSquaresClosesARingRoundASingleHighPoint() {
        let grid: [Double] = [
            0, 0, 0,
            0, 1, 0,
            0, 0, 0,
        ]
        let rings = march(grid, nx: 3, ny: 3, level: 0.5)
        XCTAssertEqual(rings.count, 1)
        XCTAssertEqual(rings[0].count, 4)
        for p in rings[0] { XCTAssertEqual(abs(p.x - 1) + abs(p.y - 1), 0.5, accuracy: 1e-9) }
    }

    func testTheSameGridDrawsTheWebsitesPaths() {
        let paths = heatContours(ContourCase.cells, cols: ContourCase.cols, rows: ContourCase.rows, w: ContourCase.w, h: ContourCase.h).map(svgPath)
        XCTAssertEqual(paths.count, ContourCase.paths.count)
        for (ours, theirs) in zip(paths, ContourCase.paths) {
            // The same commands and numbers, each within a rounding step (the platforms' exp can differ in its last digit).
            let shape = { (d: String) in d.replacingOccurrences(of: "[-\\d.]+", with: "#", options: .regularExpression) }
            XCTAssertEqual(shape(ours), shape(theirs))
            let a = numbers(theirs)
            let b = numbers(ours)
            XCTAssertEqual(a.count, b.count)
            for i in a.indices where i < b.count { XCTAssertLessThanOrEqual(abs(a[i] - b[i]), 0.1 + 1e-9, "\(a[i]) and \(b[i]) at \(i)") }
        }
    }
}
