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

    /// `screens`: how many screens tall, for a list drawn whole.
    private func write<V: View>(_ name: String, _ view: V, screens: CGFloat = 1) throws {
        let folder = URL(fileURLWithPath: ProcessInfo.processInfo.environment["LAWFIVE_SNAPSHOTS"]!)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let bounds = WKInterfaceDeviceBounds.current
        let renderer = ImageRenderer(content: view.frame(width: bounds.width, height: bounds.height * screens, alignment: .top).background(.black).environment(\.colorScheme, .dark))
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

    /// UI-16, UI-19, SYNC-16: Matches with a scheduled match, a canceled and a postponed one, the canceled one's page, and
    /// the question starting it asks.
    func testTheMatchesList() throws {
        let state = AppState()
        let now = nowSeconds()
        let matches = [
            try PlannedMatchesTests.match("next", kickoff: now + 3600),
            try PlannedMatchesTests.match("canceled", kickoff: now + 7200, status: "cancelled"),
            try PlannedMatchesTests.match("postponed", kickoff: now + 86_400, status: "postponed"),
        ]
        state.update { s in
            s.token = "snapshot"
            s.matches = matches
        }
        // ImageRenderer leaves out the list's ScrollView (mobile/ios/README.md#pitfalls), so the rows as the list stacks them.
        try write("watch-matches__46mm-dark-1x", VStack(spacing: 5) {
            MenuRow(label: "Sync now", sub: state.syncLine, icon: "sync") {}
            ForEach(matches.listed(now: now)) { PlannedRow(m: $0) }
        }.padding(.horizontal, 4))
        try write("watch-planned-canceled__46mm-dark-1x", VStack(spacing: 5) { PlannedDetails(m: matches[1]) {} }.padding(.horizontal, 4).environment(state))
        try write("watch-start-anyway__46mm-dark-1x", ConfirmScreen(question: "Start anyway?", detail: matches[1].statusDetail, onYes: {}, onNo: {}))
    }

    /// UI-19: a downloaded match's screen, the rows as the list stacks them (ImageRenderer leaves the list out): Start match,
    /// the fee, the details with the crew and the notes in full, then Mark pitch with corners waiting to go (TRK-13).
    func testADownloadedMatch() throws {
        let state = AppState()
        var m = try PlannedMatchesTests.match("next", kickoff: nowSeconds() + 3600)
        m.name = "Bay Youth League U12 Boys"
        m.weather = "61° rain"
        m.fee = PlannedMatch.Fee(text: "$40", paid: false)
        m.crew = [["AR1", "Sam Rivera"], ["AR2", "Club linesman"]]
        m.notes = "Moved to the far pitch. Parking is behind the gym; the gate code is with the club secretary."
        state.update { s in
            s.matches = [m]
            s.pitches = nil
        }
        state.queuePitch(matchId: m.id, created: nil, corners: [[37.4, -122.1], [37.401, -122.1], [37.401, -122.101]])
        let size = Int(WKInterfaceDeviceBounds.current.width)
        try write("watch-planned-details__\(size)pt", VStack(spacing: 5) { PlannedDetails(m: m) {} }.padding(.horizontal, 4).environment(state), screens: 3)
        state.update { $0.pitches = nil }
    }

    /// UI-26: the sync screen partway through a track, after its match.
    func testTheSyncScreen() throws {
        let state = AppState()
        state.showSyncScreenForTesting("track")
        try write("watch-sync-track__46mm-dark-1x", SyncScreen().environment(state))
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
