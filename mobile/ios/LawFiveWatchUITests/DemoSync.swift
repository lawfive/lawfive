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

    /// UI-26: the sync screen comes up over full time and closes itself 3 seconds after All synced.
    private func waitForTheSyncScreen() {
        let synced = app.staticTexts["All synced"]
        if synced.waitForExistence(timeout: 5) {
            expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: synced)
            waitForExpectations(timeout: 10)
        }
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
        waitForTheSyncScreen()
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

    // UI-17, SYNC-4: History's status row: the match that went says when, and one no longer waiting is sent again from
    // it (and, refused again, is still not on LawFive).
    func testSendingFromHistory() throws {
        try XCTSkipUnless(environment["LAWFIVE_DEMO"] != nil, "needs the demo server")
        continueAfterFailure = false
        app.launchArguments = try linkedArguments() + ["-refusedRecord", "1", "-begin", "1", "-finish", "1"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Sent to LawFive"].waitForExistence(timeout: 30), app.debugDescription)
        waitForTheSyncScreen()
        app.buttons["Done"].tap()
        let history = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'History'")).firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'HOM'")).firstMatch.tap()
        let sent = app.staticTexts["Sent to LawFive"]
        XCTAssertTrue(sent.waitForExistence(timeout: 5), app.debugDescription)
        shot("sent, with when")
        app.buttons["Back"].firstMatch.tap()
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'REF 0-0 USD'")).firstMatch.tap()
        let send = app.buttons["Not on LawFive, Press to send"]
        XCTAssertTrue(send.waitForExistence(timeout: 5), app.debugDescription)
        shot("press to send")
        send.tap()
        // Queued again and sent, LawFive refuses it once more: the row says so again once the sync is done.
        XCTAssertTrue(app.buttons["Not on LawFive, Press to send"].waitForExistence(timeout: 30), app.debugDescription)
        shot("refused again")
    }

    // SYNC-5, UI-16: linked, Account has the last sync, the server, Sync on opening and Unlink, and no Sync now, which is
    // in Matches; turning Sync on opening off says so.
    func testAccountWhileLinked() throws {
        try XCTSkipUnless(environment["LAWFIVE_DEMO"] != nil, "needs the demo server")
        continueAfterFailure = false
        app.launchArguments = try linkedArguments()
        app.launch()
        let matches = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Matches'")).firstMatch
        XCTAssertTrue(matches.waitForExistence(timeout: 10))
        matches.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Sync now'")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settings'")).firstMatch
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        settings.tap()
        let account = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Account'")).firstMatch
        XCTAssertTrue(account.waitForExistence(timeout: 5))
        account.tap()
        XCTAssertTrue(app.staticTexts["Last sync"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["Server"].exists)
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Sync now'")).firstMatch.exists)
        let toggle = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Sync on opening'")).firstMatch
        XCTAssertTrue(toggle.waitForExistence(timeout: 5), app.debugDescription)
        shot("account")
        toggle.tap()
        let off = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Only with Sync now'")).firstMatch
        XCTAssertTrue(off.waitForExistence(timeout: 5) || app.staticTexts["Only with Sync now"].exists, app.debugDescription)
        app.swipeUp()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Unlink'")).firstMatch.waitForExistence(timeout: 5))
        shot("account, sync on opening off")
    }

    // SYNC-9: a typed address is checked before it's kept: nothing there says so, and it stays in the box to correct; the
    // demo is found, and kept. -typedServer types it, as watchOS's text entry can't be driven here.
    func testCheckingAServerAddress() throws {
        let server = try XCTUnwrap(environment["LAWFIVE_DEMO"], "needs the demo server")
        continueAfterFailure = false
        func openAccount() {
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settings'")).firstMatch.tap()
            let account = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Account'")).firstMatch
            XCTAssertTrue(account.waitForExistence(timeout: 5))
            account.tap()
        }
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-typedServer", "http://localhost:9"]
        app.launch()
        openAccount()
        XCTAssertTrue(app.staticTexts["Can't reach the server"].waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertEqual(app.textFields.firstMatch.value as? String, "http://localhost:9", "kept in the box to correct")
        shot("server not there")
        app.terminate()
        app.launchArguments = ["-noWorkout", "1", "-typedServer", server]
        app.launch()
        openAccount()
        XCTAssertTrue(app.staticTexts["Found LawFive"].waitForExistence(timeout: 20), app.debugDescription)
        XCTAssertTrue(app.textFields.firstMatch.placeholderValue?.contains("localhost:3000") == true, app.debugDescription)
        shot("server found")
    }

    // UI-19: the demo's next match: Start match, the fee, its details labeled one row each, with the crew, and Mark pitch.
    func testADownloadedMatch() throws {
        try XCTSkipUnless(environment["LAWFIVE_DEMO"] != nil, "needs the demo server")
        continueAfterFailure = false
        app.launchArguments = try linkedArguments()
        app.launch()
        let matches = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Matches'")).firstMatch
        XCTAssertTrue(matches.waitForExistence(timeout: 10))
        matches.tap()
        let next = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'STR v ROV'")).firstMatch
        XCTAssertTrue(next.waitForExistence(timeout: 10), app.debugDescription)
        next.tap()
        XCTAssertTrue(app.staticTexts["Your role"].waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(app.staticTexts["AR1"].exists && app.staticTexts["Sam Rivera"].exists, app.debugDescription)
        shot("downloaded match")
        app.swipeUp()
        shot("downloaded match, further")
        app.swipeUp()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Mark pitch'")).firstMatch.waitForExistence(timeout: 5))
        shot("downloaded match, end")
    }
}
