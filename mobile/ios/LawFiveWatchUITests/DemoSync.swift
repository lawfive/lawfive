import XCTest

// SYNC-4, SYNC-17: syncing with the demo server (`pnpm demo` in server/), linked with a watch token from its device
// flow (client_id lawfive-applewatch). Run with TEST_RUNNER_LAWFIVE_DEMO (http://localhost:3000) and
// TEST_RUNNER_LAWFIVE_TOKEN; it isn't one of the tests that run on their own.
final class DemoSync: XCTestCase {
    private let app = XCUIApplication()
    private var environment: [String: String] { ProcessInfo.processInfo.environment }

    private func linkedArguments() throws -> [String] {
        let server = try XCTUnwrap(environment["LAWFIVE_DEMO"], "needs the demo server")
        let token = try XCTUnwrap(environment["LAWFIVE_TOKEN"], "needs a watch token from the demo")
        return ["-reset", "1", "-noWorkout", "1", "-server", server, "-token", token]
    }

    private func shot(_ name: String) {
        sleep(1)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // SYNC-17: a match LawFive refuses, first in the outbox, is given up; the match after it still goes, and History
    // says the refused one is not on LawFive.
    func testARefusedMatchIsGivenUp() throws {
        try XCTSkipUnless(environment["LAWFIVE_DEMO"] != nil, "needs the demo server")
        continueAfterFailure = false
        app.launchArguments = try linkedArguments() + ["-refusedRecord", "1", "-begin", "1", "-finish", "1"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Sent to LawFive"].waitForExistence(timeout: 30), "the match after it went: \(app.debugDescription)")
        shot("full time, sent")
        app.buttons["Done"].tap()
        let history = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'History'")).firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        let refused = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'REF 0-0 USD'")).firstMatch
        XCTAssertTrue(refused.waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(refused.label.hasSuffix("Not sent"), refused.label)
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label ENDSWITH 'Sent'")).firstMatch.exists)
        shot("history")
        refused.tap()
        XCTAssertTrue(app.staticTexts["Not on LawFive"].waitForExistence(timeout: 5))
        shot("not on LawFive")
    }
}
