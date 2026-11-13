import SwiftUI
import XCTest
@testable import LawFive

// The screens the reviews kept checking (mobile/ios/README.md#snapshot-pictures), drawn from the
// fixtures with their clock and time zone, in every variant (SnapshotHost.swift). Skipped unless
// LAWFIVE_SNAPSHOTS names the pictures' folder: run them with tools/snapshots.sh.

@MainActor
final class ScreenSnapshots: XCTestCase {
    private static var graphs: [Fixtures.Account: AppGraph] = [:]
    private var zoneBefore: TimeZone?

    override func setUp() async throws {
        guard Snapshots.wanted else { throw XCTSkip("Pictures for review: run tools/snapshots.sh") }
        AppClock.fixed = Fixtures.index.clock
        zoneBefore = NSTimeZone.default
        NSTimeZone.default = Fixtures.index.zone
        XCTAssertEqual(TimeZone.current.identifier, Fixtures.index.timeZone)
    }

    override func tearDown() async throws {
        AppClock.fixed = nil
        if let zoneBefore { NSTimeZone.default = zoneBefore }
        Kept.shared.attempt = nil
    }

    /// An account on the phone as after its first sync, signed out of nothing real: its own settings,
    /// database and folder, and the fixtures as its server.
    private func graph(_ account: Fixtures.Account) async throws -> AppGraph {
        if let graph = ScreenSnapshots.graphs[account] { return graph }
        let suite = "LawFiveSnapshots-\(account.rawValue)"
        UserDefaults.standard.removePersistentDomain(forName: suite)
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let folder = FileManager.default.temporaryDirectory.appending(path: "lawfive-snapshots/\(account.rawValue)")
        try? FileManager.default.removeItem(at: folder)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        // A session that's new to this phone forgets the keychain's token (SessionStore), so this one
        // has none and never syncs; the app's own sign-in on this simulator is put back straight after.
        let token = Keychain.read()
        let graph = AppGraph(defaults: defaults, dbFile: nil, folder: folder, protocols: [FixtureServer.self])
        Keychain.write(token)
        let person = Fixtures.index.person(account)
        graph.session.setServer(FixtureServer.address(account))
        graph.session.setStatus("active", name: person.name, email: person.email)
        // Did you know comes up at random (TIP-2): none, so the pictures are the same every run.
        for tip in tips { graph.session.tipDone(tip.id) }
        try await Fixtures.load(account, into: graph)
        await graph.weather.refresh()
        await graph.weather.refresh(past: true)
        await graph.onWatch.refresh()
        ScreenSnapshots.graphs[account] = graph
        return graph
    }

    /// The signed-in app at a tab and page, as RootView shows it: the grass, the pages and the board along the bottom.
    private func app(_ graph: AppGraph, tab: AppTab, _ path: [Route] = []) -> some View {
        let nav = Nav()
        nav.tab = tab
        nav.paths[tab] = path
        return ZStack {
            PitchStripes()
            SignedIn(nav: nav)
        }
        .environment(graph)
        .tint(LF.brand)
    }

    func testMatches() async throws {
        let graph = try await graph(.demo)
        try await Snapshots.take("matches") { self.app(graph, tab: .matches) }
    }

    func testMatchesForANewAccount() async throws {
        let graph = try await graph(.newAccount)
        try await Snapshots.take("matches-new") { self.app(graph, tab: .matches) }
    }

    func testAPlayedMatch() async throws {
        let graph = try await graph(.demo)
        let id = try XCTUnwrap(Fixtures.index.demo.matches["withTrack"])
        try await Snapshots.take("match-played", settle: 1.2) { self.app(graph, tab: .matches, [.match(id)]) }
    }

    func testSettings() async throws {
        let graph = try await graph(.demo)
        // APP-6: with this phone's reminders on, so their times show; off again for the screens after.
        graph.reminders.update(ReminderSettings(enabled: true), matches: [], venues: [])
        defer { graph.reminders.update(ReminderSettings(), matches: [], venues: []) }
        try await Snapshots.take("settings") { self.app(graph, tab: .more, [.settings]) }
    }

    /// A new match's form, as its sheet holds it (the sheet's own frame and the page behind aren't drawn).
    func testTheMatchForm() async throws {
        let graph = try await graph(.demo)
        try await Snapshots.take("match-form") {
            NavigationStack { MatchEditScreen(id: nil) }
                .environment(Nav())
                .environment(graph)
                .tint(LF.brand)
                .background { PitchStripes() }
        }
    }

    func testStats() async throws {
        let graph = try await graph(.demo)
        // The first picture as Stats first opens, the rest with the answer the one before kept, so
        // the page is laid out with its figures from the start (which hung until the referees'
        // straps kept to the width they read, 2026-11-10). The sections rise in as they come (0.7 s).
        try await Snapshots.take("stats", settle: 1.6) { self.app(graph, tab: .stats) }
    }

    /// The quiz at its third question, answered, after one right and one wrong; then the results.
    func testTheQuiz() async throws {
        let graph = try await graph(.demo)
        let url = try XCTUnwrap(Bundle.main.url(forResource: "questions-en", withExtension: "json"))
        let bank = try jsonDecoder.decode(QuizBank.self, from: Data(contentsOf: url))
        let questions = Array(quizPool(bank, difficulty: "easy").prefix(10))
        XCTAssertEqual(questions.count, 10)
        let right = { (q: QuizQuestion) in q.options.filter(\.correct).map(\.id) }
        let wrong = { (q: QuizQuestion) in [q.options.first { !$0.correct }!.id] }
        let asking = Attempt(difficulty: "easy", questions: questions, index: 2, answers: [right(questions[0]), wrong(questions[1]), right(questions[2])])
        try await Snapshots.take("quiz", prepare: { Kept.shared.attempt = asking }) { self.app(graph, tab: .more, [.quiz]) }

        let answers = questions.indices.map { $0 % 3 == 1 ? wrong(questions[$0]) : right(questions[$0]) }
        var done = Attempt(difficulty: "easy", questions: questions, index: 9, answers: answers)
        let verdict = quizVerdicts.first { Double(done.right) / 10 >= $0.from }!
        done.verdict = QuizVerdict(title: verdict.title, line: verdict.lines[0], card: verdict.card)
        // The score counts up as it comes in.
        try await Snapshots.take("quiz-result", settle: 2, prepare: { Kept.shared.attempt = done }) { self.app(graph, tab: .more, [.quiz]) }
    }
}
