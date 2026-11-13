import ImageIO
import WatchKit
import SwiftUI
import UniformTypeIdentifiers
import XCTest
@testable import LawFiveWatch

// The Apple Watch's screens as pictures for review (mobile/ios/README.md#snapshot-pictures): watchOS has
// no UIKit window to host a view in, so SwiftUI's ImageRenderer draws them, at the watch's size.
// Skipped unless LAWFIVE_SNAPSHOTS names the folder. A trial: see mobile/ios/README.md.

@MainActor
final class WatchSnapshots: XCTestCase {
    private let saved = URL.documentsDirectory.appending(path: "lawfive.json")
    private let aside = URL.temporaryDirectory.appending(path: "lawfive.json.aside")

    override func setUp() async throws {
        guard let folder = ProcessInfo.processInfo.environment["LAWFIVE_SNAPSHOTS"], !folder.isEmpty else {
            throw XCTSkip("Pictures for review: run with LAWFIVE_SNAPSHOTS")
        }
        // The watch app's own match and settings on this simulator, put back after.
        try? FileManager.default.removeItem(at: aside)
        try? FileManager.default.copyItem(at: saved, to: aside)
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: saved)
        try? FileManager.default.copyItem(at: aside, to: saved)
    }

    private func write<V: View>(_ name: String, _ view: V) throws {
        let folder = URL(fileURLWithPath: ProcessInfo.processInfo.environment["LAWFIVE_SNAPSHOTS"]!)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let bounds = WKInterfaceDeviceBounds.current
        let renderer = ImageRenderer(content: view.frame(width: bounds.width, height: bounds.height).background(.black).environment(\.colorScheme, .dark))
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.cgImage, "ImageRenderer drew nothing")
        let url = folder.appending(path: "\(name).png") as CFURL
        let out = try XCTUnwrap(CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(out, image, nil)
        XCTAssertTrue(CGImageDestinationFinalize(out))
    }

    func testTheKickoffScreen() throws {
        let state = AppState()
        var setup = MatchSetup()
        setup.homeName = "Strikers U12"
        setup.awayName = "Rovers U12"
        setup.home = "STR"
        setup.away = "ROV"
        state.beginMatch(setup)
        try write("watch-kickoff__46mm-dark-1x", MatchFlow().environment(state))
        state.clearMatch()
    }

    /// UI-10, UI-11: the kits at their hardest: the widest aliases and two-figure scores, a white kit against a black one
    /// (its gray edge), and no colors, on the score line, scores only and the kickoff's dot. On the narrowest watch, the
    /// SE's 40 mm (LAWFIVE_WATCH_SIMULATOR for tools/snapshots.sh), they must fit across.
    func testTheKits() throws {
        let teams: [(String, String, Int, Int)] = [("WOLW", "MMMM", 0xFFFFFF, 0x000000), ("HOM", "AWY", -1, -1), ("STR", "ROV", 0xFF7A00, 0x0057B8)]
        for (i, (homeName, awayName, homeColor, awayColor)) in teams.enumerated() {
            for names in [true, false] {
                let state = AppState()
                var setup = MatchSetup()
                (setup.home, setup.away, setup.homeColor, setup.awayColor) = (homeName, awayName, homeColor, awayColor)
                state.beginMatch(setup)
                let match = try XCTUnwrap(state.match)
                match.selectKickoff(away)
                if names { try write("watch-kits-\(i)-kickoff", MatchFlow().environment(state)) }
                var screen = WatchScreen()
                screen.names = names
                match.start(nowMs(), screen: screen)
                match.score = [10, 12]
                try write("watch-kits-\(i)-\(names ? "running" : "scores")", MatchFlow().environment(state))
                state.clearMatch()
            }
        }
    }
}

/// The screen's size in points.
enum WKInterfaceDeviceBounds {
    static var current: CGSize { WKInterfaceDevice.current().screenBounds.size }
}
