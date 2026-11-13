import XCTest

// WCH-2, WCH-6: a whole match through the watch's controls, against nothing but the app.
//   xcodebuild -project LawFive.xcodeproj -scheme LawFiveWatch -destination 'platform=watchOS Simulator,name=<watch>' test

final class WatchFlow: XCTestCase {
    private let app = XCUIApplication()

    private func tap(_ label: String, file: StaticString = #filePath, line: UInt = #line) {
        let found = app.buttons[label]
        if !found.waitForExistence(timeout: 5) {
            // Lists can need scrolling on a small screen.
            app.swipeUp()
        }
        XCTAssertTrue(found.waitForExistence(timeout: 3), "\(label) isn't there: \(app.debugDescription)", file: file, line: line)
        found.tap()
    }

    private func see(_ text: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(app.staticTexts[text].waitForExistence(timeout: 5), "\(text) isn't there: \(app.debugDescription)", file: file, line: line)
    }

    private func swipe(_ from: CGVector, _ to: CGVector) {
        app.coordinate(withNormalizedOffset: from).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: to))
    }
    private func swipeDownForHome() { swipe(CGVector(dx: 0.5, dy: 0.25), CGVector(dx: 0.5, dy: 0.75)) }
    private func swipeUpForAway() { swipe(CGVector(dx: 0.5, dy: 0.75), CGVector(dx: 0.5, dy: 0.25)) }
    private func swipeForMenu() { swipe(CGVector(dx: 0.8, dy: 0.5), CGVector(dx: 0.2, dy: 0.5)) }

    // WCH-9: a swipe right leaves the team menu, and is never a tap on the row under it.
    func testSwipeRightLeavesAMenu() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        see("Who kicks off?")
        tap("HOM")
        tap("Start")
        see("1H")

        swipeUpForAway()
        let row = app.buttons["Yellow card"]
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        row.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).press(forDuration: 0.05, thenDragTo: row.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)))
        see("1H")
        XCTAssertFalse(app.buttons["OK"].exists)

        // From the player number too, recording nothing.
        swipeUpForAway()
        tap("Yellow card")
        XCTAssertTrue(app.buttons["OK"].waitForExistence(timeout: 5))
        swipe(CGVector(dx: 0.1, dy: 0.5), CGVector(dx: 0.9, dy: 0.5))
        see("1H")
    }

    // INP-10: with sideways team swipes, right opens home, left away, up the game menu, and down nothing.
    func testSidewaysTeamSwipes() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-swipes", "sideways"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        tap("Start")
        see("1H")
        let row = app.buttons["Yellow card"]

        swipe(CGVector(dx: 0.2, dy: 0.5), CGVector(dx: 0.8, dy: 0.5))
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["HOM"].exists)
        XCTAssertFalse(app.staticTexts["AWY"].exists)
        swipe(CGVector(dx: 0.1, dy: 0.5), CGVector(dx: 0.9, dy: 0.5))
        see("1H")

        swipe(CGVector(dx: 0.8, dy: 0.5), CGVector(dx: 0.2, dy: 0.5))
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["AWY"].exists)
        XCTAssertFalse(app.staticTexts["HOM"].exists)
        swipe(CGVector(dx: 0.1, dy: 0.5), CGVector(dx: 0.9, dy: 0.5))
        see("1H")

        swipeDownForHome()
        XCTAssertFalse(row.waitForExistence(timeout: 2), "a swipe down does nothing")
        swipeUpForAway()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End first half'")).firstMatch.waitForExistence(timeout: 5))
    }

    // PRE-8: with a compass (a made-up reading, as a simulator has none), the direction saves and points the second half's kickoff.
    func testKickoffDirection() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-heading", "1.2"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        swipeForMenu()
        tap("Kickoff direction, Face the goal")
        see("Face the goal")
        tap("Save")
        tap("Start")
        see("1H")
        swipeForMenu()
        let end = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End first half'")).firstMatch
        XCTAssertTrue(end.waitForExistence(timeout: 5))
        end.tap()
        tap("End first half")
        tap("End half-time")
        see("AWY attacks")
    }

    // PRE-8, WCH-10: a watch with no compass doesn't offer it. A simulator has none.
    func testNoCompassNoMenuRow() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Coin toss"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Kickoff direction'")).firstMatch.exists)
    }

    // EVT-11: from the game menu: why, then Yes or No, and the full-time screen says so.
    func testAbandoningAMatch() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        tap("Start")
        see("1H")
        swipeForMenu()
        let abandon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Abandon match'")).firstMatch
        for _ in 0..<8 where !abandon.isHittable { app.swipeUp() }
        abandon.tap()
        tap("Lightning")
        see("Abandon match?")
        tap("Abandon")
        see("ABANDONED")
    }

    // EVT-15, EVT-16: a team official's card asks the role, an injury the number; Undo names them.
    func testTeamOfficialAndInjury() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        tap("Start")
        see("1H")

        swipeDownForHome()
        tap("Team official")
        shot("official card")
        tap("Red card")
        shot("official role")
        tap("Assistant coach")
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Red HOM assistant coach"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()

        swipeUpForAway()
        tap("Injury")
        see("Injury AWY")
        shot("injury number")
        tap("None")
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Injury AWY"].waitForExistence(timeout: 5))
        shot("game menu undo injury")
    }

    // TMR-14: Adjust clock and Adjust added time in the game menu during play: the minutes, then the seconds, the change to
    // confirm, and Undo naming it; Back from the seconds goes to the minutes, and from the minutes to the match.
    func testAdjustingTheClock() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1", "-begin", "1", "-ago", "1420", "-stoppage", "1"]
        app.launch()
        see("1H")
        swipeForMenu()
        let adjust = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Adjust clock, 1H 23:'")).firstMatch
        XCTAssertTrue(adjust.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Adjust added time, 0:'")).firstMatch.exists, "with stoppage tracked")
        // A short scroll, to the two rows.
        swipe(CGVector(dx: 0.5, dy: 0.75), CGVector(dx: 0.5, dy: 0.6))
        shot("game menu adjust")
        adjust.tap()
        see("Adjust clock")
        see("Minutes into 1H")
        shot("adjust minutes")
        tap("Ones up")
        tap("OK")
        see("Seconds into 1H")
        shot("adjust seconds")
        tap("OK")
        see("Clock +1:00?")
        shot("adjust confirm")
        tap("Adjust")
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Clock +1:00"].waitForExistence(timeout: 5))

        let added = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Adjust added time'")).firstMatch
        if !added.exists { app.swipeUp() }
        added.tap()
        see("Added time")
        tap("OK")
        see("Seconds")
        app.buttons["Back"].firstMatch.tap()
        see("Minutes")
        app.buttons["Back"].firstMatch.tap()
        see("1H")
    }

    // TMR-13: Suspend match in the game menu during play, then a reason, which suspends at once: the Suspended screen
    // with lightning's countdown, the game menu while suspended (Lightning again, a card, Undo), and Resume.
    func testSuspendingAMatch() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1", "-begin", "1", "-ago", "1200"]
        app.launch()
        see("1H")
        swipeForMenu()
        let suspend = app.buttons["Suspend match, Lightning, weather"]
        XCTAssertTrue(suspend.waitForExistence(timeout: 5))
        for _ in 0..<8 where !suspend.isHittable { app.swipeUp() }
        suspend.tap()
        XCTAssertTrue(app.buttons["Weather"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Crowd trouble"].exists)
        XCTAssertFalse(app.buttons["Not enough players"].exists, "never a reason to suspend")
        tap("Lightning")
        see("LIGHTNING")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Suspended 0:0'")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH '29:5'")).firstMatch.waitForExistence(timeout: 5), "the countdown runs")
        shot("suspended lightning")
        if let folder = ProcessInfo.processInfo.environment["LAWFIVE_SHOTS"] {
            try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: folder).appending(path: "applewatch-suspended.png"))
        }

        swipeForMenu()
        XCTAssertTrue(app.buttons["Resume match"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End first half'")).firstMatch.exists, "nothing of play's")
        shot("suspended menu")
        tap("Lightning again, Back to 30:00")
        see("LIGHTNING")

        // EVT-7: a card while suspended, which Undo can take back; never the suspension.
        swipeUpForAway()
        XCTAssertFalse(app.buttons["Goal"].waitForExistence(timeout: 2), "no goals while suspended")
        tap("Yellow card")
        tap("None")
        see("LIGHTNING")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow AWY"].waitForExistence(timeout: 5))
        tap("Undo last event, Yellow AWY")
        tap("Undo")
        see("LIGHTNING")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Resume match"].waitForExistence(timeout: 5))
        // The goal before it (from -begin), past the suspension.
        XCTAssertTrue(app.buttons["Undo last event, Goal HOM #2"].exists, "the suspension isn't undone")
        app.buttons["Back"].firstMatch.tap()

        tap("Resume")
        see("1H")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH '20:'")).firstMatch.waitForExistence(timeout: 5), "carries on from where it stopped")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Suspend match, Lightning, weather"].waitForExistence(timeout: 5))
    }

    // EVT-12: with sin bins in the format, the pill last in the row (with the stoppage and break pills), Sin bin in the team
    // menu above Yellow card, a second for the same number the red screen, and "can return" until a tap.
    func testSinBins() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1", "-sinbins", "300", "-begin", "1", "-ago", "48", "-stoppage", "1"]
        app.launch()
        see("1H")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'AWY 7 4:'")).firstMatch.waitForExistence(timeout: 5), "the one ending first, with +1")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label ENDSWITH '+1'")).firstMatch.exists)
        save("applewatch-sinbin-pill")
        shot("sin bin pill")

        swipeDownForHome()
        let row = app.buttons["Sin bin"]
        XCTAssertTrue(row.waitForExistence(timeout: 5), "above Yellow card")
        XCTAssertLessThan(app.buttons["Goal"].frame.midY, row.frame.midY)
        XCTAssertLessThan(row.frame.midY, app.buttons["Yellow card"].frame.midY)
        save("applewatch-sinbin-row")
        shot("team menu sin bin")
        row.tap()
        see("Sin bin HOM")
        for _ in 0..<4 { tap("Ones up") }
        tap("OK")
        // HOM #4 already has one (from -sinbins with -begin): a send-off.
        see("Second sin bin")
        see("#4 HOM")
        save("applewatch-sinbin-second")
        shot("second sin bin")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, 2nd sin bin HOM #4"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()

        // Past their length: "can return", until a tap, which does nothing else.
        app.terminate()
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1", "-sinbins", "60", "-begin", "1", "-ago", "100"]
        app.launch()
        see("can return")
        see("+1")
        XCTAssertTrue(app.staticTexts["#7"].exists, "the first to end")
        save("applewatch-sinbin-return")
        shot("can return")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        see("1H")
        XCTAssertFalse(app.staticTexts["can return"].waitForExistence(timeout: 2), "a tap lets it go")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Sin bin HOM #4"].waitForExistence(timeout: 5), "the tap recorded nothing")
    }

    // EVT-12, SET-9: Sin bins in Quick match's format, with its length on the two digits, 1 to 20 minutes; Sin bin over in Alerts.
    func testSinBinSettings() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("Settings, Not linked")
        tap("Alerts, All on")
        XCTAssertTrue(app.buttons["Sin bin over, Vibrate when one can return"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        tap("Quick match, 2×45' · HT 15'")
        let toggle = app.buttons["Sin bins, Off"]
        for _ in 0..<8 where !(toggle.exists && toggle.isHittable) { app.swipeUp() }
        toggle.tap()
        let length = app.buttons["Sin bin length, 10 min"]
        XCTAssertTrue(length.waitForExistence(timeout: 5), "straight after it while it's on")
        for _ in 0..<4 where !length.isHittable { app.swipeUp() }
        save("applewatch-sinbin-settings")
        length.tap()
        see("Minutes, 1 to 20")
        tap("Tens up")
        tap("Tens up")
        XCTAssertFalse(app.buttons["OK"].isEnabled, "30 is too long")
        tap("Tens down")
        tap("OK")
        XCTAssertTrue(app.buttons["Sin bin length, 20 min"].waitForExistence(timeout: 5))
    }

    // EVT-14: with Card reasons on, the Reason list after the number (or the official's role): No reason first, the
    // cautions' codes or the send-offs', the code in the events' words; Back gives none; a second yellow's red screen after it.
    func testCardReasons() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1", "-begin", "1", "-ago", "300", "-reasons", "ussf"]
        app.launch()
        see("1H")

        swipeDownForHome()
        tap("Yellow card")
        for _ in 0..<4 { tap("Ones up") }
        tap("OK")
        let none = app.buttons["No reason"]
        XCTAssertTrue(none.waitForExistence(timeout: 5), "the Reason list")
        XCTAssertTrue(app.buttons["UB, Unsporting behavior"].exists)
        XCTAssertLessThan(none.frame.midY, app.buttons["UB, Unsporting behavior"].frame.midY, "No reason first")
        XCTAssertFalse(app.buttons["SFP, Serious foul play"].exists, "the cautions' codes")
        save("applewatch-reason")
        shot("reason list")
        tap("DT, Dissent")
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow HOM #4 DT"].waitForExistence(timeout: 5), "the code after the number")
        app.buttons["Back"].firstMatch.tap()

        // A second yellow: the reason, then the red screen.
        swipeDownForHome()
        tap("Yellow card")
        for _ in 0..<4 { tap("Ones up") }
        tap("OK")
        tap("No reason")
        see("Second yellow")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        see("1H")

        // A send-off's codes; Back gives none.
        swipeUpForAway()
        tap("Red card")
        tap("None")
        XCTAssertTrue(app.buttons["SFP, Serious foul play"].waitForExistence(timeout: 5), "the send-offs' codes")
        XCTAssertFalse(app.buttons["UB, Unsporting behavior"].exists)
        app.buttons["Back"].firstMatch.tap()
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Red AWY"].waitForExistence(timeout: 5), "no reason given")
        app.buttons["Back"].firstMatch.tap()

        // EVT-15: after a team official's role.
        swipeDownForHome()
        tap("Team official")
        tap("Yellow card")
        tap("Head coach")
        tap("UB, Unsporting behavior")
        see("1H")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow HOM head coach UB"].waitForExistence(timeout: 5))
    }

    // EVT-14: Card reasons in Settings, Controls, off by default.
    func testCardReasonsSetting() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("Settings, Not linked")
        tap("Controls, Tap for stoppage: off")
        tap("Card reasons, Off")
        XCTAssertTrue(app.buttons["Card reasons, Ask after the number"].waitForExistence(timeout: 5))
    }

    /// A picture for the docs and reviews, when LAWFIVE_SHOTS names a folder (TEST_RUNNER_LAWFIVE_SHOTS for xcodebuild).
    private func save(_ name: String) {
        guard let folder = ProcessInfo.processInfo.environment["LAWFIVE_SHOTS"] else { return }
        sleep(1)
        try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: folder).appending(path: "\(name).png"))
    }

    private func shot(_ name: String) {
        // After the page has slid in.
        sleep(1)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    // SET-9, SET-13, SET-14, UI-17, DATA-8: Create match with a team color, Same as last once a match is
    // started (in Create match; not in New match when it's Quick match's format), Settings' new rows, and
    // Reset LawFive forgetting the last match but keeping the settings.
    func testSetupAndReset() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()
        tap("New match, Quick · 2×45' · HT 15'")
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Same as last'")).firstMatch.exists)
        tap("Custom, Choose the format")
        see("Create match")
        shot("create")
        // Team colors is last: scrolled to, and left to settle, so the tap isn't taken as part of the scroll.
        app.swipeUp()
        app.swipeUp()
        app.swipeUp()
        sleep(1)
        tap("Team colors, None")
        tap("Home team, None")
        shot("colors")
        tap("Red")
        XCTAssertTrue(app.buttons["Home team, Red"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        tap("Team colors, HOM Red · AWY None")
        app.buttons["Back"].firstMatch.tap()
        app.swipeDown()
        app.swipeDown()
        tap("Start match, 2×45' · HT 15'")
        see("Who kicks off?")
        swipeForMenu()
        let cancel = app.buttons["Cancel match"]
        for _ in 0..<6 where !cancel.isHittable { app.swipeUp() }
        cancel.tap()
        tap("Cancel match")

        tap("New match, Quick · 2×45' · HT 15'")
        // SET-13: the last match was Quick match's format, so New match doesn't offer it twice; Create match still does.
        XCTAssertTrue(app.buttons["Quick match, 2×45' · HT 15'"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Same as last'")).firstMatch.exists)
        tap("Custom, Choose the format")
        XCTAssertTrue(app.switches.matching(NSPredicate(format: "label BEGINSWITH 'Same as last'")).firstMatch.waitForExistence(timeout: 5)
            || app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Same as last'")).firstMatch.exists)
        shot("same as last")
        app.buttons["Back"].firstMatch.tap()
        app.buttons["Back"].firstMatch.tap()

        tap("Settings, Not linked")
        shot("settings")
        tap("Timer names, Stoppage · break")
        shot("timer names")
        app.buttons["Back"].firstMatch.tap()
        tap("About, LawFive for Apple Watch")
        shot("about")
        tap("Reset LawFive, Erase everything here")
        see("Reset LawFive?")
        tap("Reset")
        tap("New match, Quick · 2×45' · HT 15'")
        XCTAssertTrue(app.buttons["Quick match, 2×45' · HT 15'"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Same as last'")).firstMatch.exists)
    }

    /// Apple Health's question (Review, each page's switch, Next, Continue and Done), then the location's.
    private func answerHealthAndLocation() {
        let system = XCUIApplication(bundleIdentifier: "com.apple.Carousel")
        let names = ["Review", "Next", "Continue", "Done"]
        for step in 0..<20 {
            print("ANSWER", step, system.buttons.allElementsBoundByIndex.map { $0.label }, system.cells.allElementsBoundByIndex.map { $0.label })
            if system.buttons["Allow While Using App"].exists {
                // The location's question, last: precise, as a track needs it; its buttons are below the
                // fold, and tapping scrolls to them.
                let precise = system.switches["Precise"]
                print("PRECISE", precise.exists, String(describing: precise.value))
                if precise.exists, (precise.value as? String) == "0" { precise.tap() }
                system.buttons["Allow While Using App"].tap()
                return
            } else if system.cells["Past 30 Days"].exists {
                // The history page: a choice first, then Done.
                system.cells["Past 30 Days"].tap()
                sleep(1)
                for _ in 0..<3 where !(system.cells["Done"].exists && system.cells["Done"].isHittable) {
                    system.collectionViews.firstMatch.swipeUp()
                    sleep(1)
                }
                if system.cells["Done"].exists { system.cells["Done"].tap() }
            } else if let name = names.first(where: { system.buttons[$0].exists && system.buttons[$0].isHittable }) {
                system.buttons[name].tap()
            } else if let name = names.first(where: { system.cells[$0].exists && system.cells[$0].isHittable }) {
                system.cells[name].tap()
            } else if let off = system.switches.allElementsBoundByIndex.first(where: { ($0.value as? String) == "0" && $0.isHittable }) {
                off.tap()
            } else if system.collectionViews.firstMatch.exists {
                system.collectionViews.firstMatch.swipeUp()
            } else {
                sleep(1)
            }
            sleep(1)
        }
    }

    // WCH-7, TRK-7: with the workout on, the first launch says what LawFive asks for and why, then Apple Health and
    // the location ask; nothing asks between Start match and the kickoff; then a period records, and abandoning ends
    // the workout. Run with a route playing (xcrun simctl location <watch> start ...) to have positions in the track;
    // the app's files show it.
    func testRecordingAMatch() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1"]
        app.launch()
        see("Before your first match")
        shot("permissions")
        tap("Continue")
        sleep(2)
        answerHealthAndLocation()
        // Allowed, it goes straight on; refused, it says so, with Done.
        let done = app.buttons["Done"]
        if done.waitForExistence(timeout: 3) { done.tap() }
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        see("Who kicks off?")
        tap("HOM")
        tap("Start")
        see("1H")
        sleep(30)
        shot("recording")
        swipeForMenu()
        let abandon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Abandon match'")).firstMatch
        for _ in 0..<8 where !abandon.isHittable { app.swipeUp() }
        abandon.tap()
        tap("Lightning")
        tap("Abandon")
        see("ABANDONED")
    }

    // TRK-13: from History, two corners at the simulator's position, saved on the way out. Run with a
    // position set (xcrun simctl location <watch> set <lat,lon>) and the location allowed.
    func testMarkingAPitch() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-begin", "1", "-finish", "1"]
        app.launch()
        tap("Done")
        tap("History, 1 kept")
        let played = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'HOM'")).firstMatch
        XCTAssertTrue(played.waitForExistence(timeout: 5))
        played.tap()
        tap("Mark pitch, Walk its corners")
        let system = XCUIApplication(bundleIdentifier: "com.apple.Carousel")
        if system.buttons["Allow While Using App"].waitForExistence(timeout: 3) { system.buttons["Allow While Using App"].tap() }
        see("Corner 1")
        XCTAssertTrue(app.staticTexts["GPS good"].waitForExistence(timeout: 15))
        app.tap()
        see("Hold still…")
        XCTAssertTrue(app.staticTexts["Corner 2"].waitForExistence(timeout: 10))
        app.tap()
        XCTAssertTrue(app.staticTexts["Back saves 2 corners"].waitForExistence(timeout: 10))
        shot("two corners")
        app.buttons["Back"].firstMatch.tap()
        // Back on the played match, which waits for a link to send it and its corners.
        see("Not sent")
    }

    func testAWholeMatch() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1"]
        app.launch()

        // Quick match, choosing who kicks off.
        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        see("Who kicks off?")

        // The coin toss, from the game menu, before kickoff.
        swipeForMenu()
        tap("Coin toss")
        tap("Flip the coin")
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label == 'Heads' OR label == 'Tails'")).firstMatch.waitForExistence(timeout: 4))
        // Back to the game menu it opened from, then the match.
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Coin toss"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Who kicks off?"].waitForExistence(timeout: 5))
        sleep(1)

        tap("HOM")
        tap("Start")
        see("1H")

        // A goal with a number: 10, with the arrow, then 13 with the Digital Crown turning the ones once they're tapped.
        swipeDownForHome()
        tap("Goal")
        app.buttons["Tens up"].firstMatch.tap()
        let ones = app.staticTexts["Ones"]
        XCTAssertTrue(ones.waitForExistence(timeout: 5))
        ones.tap()
        // The crown goes to the focused view, which can take a moment to settle on a slow simulator.
        sleep(2)
        for _ in 0..<3 where (ones.value as? String) == "0" {
            XCUIDevice.shared.rotateDigitalCrown(delta: 0.3)
            sleep(2)
        }
        XCTAssertNotEqual(ones.value as? String, "0", "the crown turns the digit being set")
        XCTAssertEqual(app.staticTexts["Tens"].value as? String, "1", "and leaves the other")
        shot("number entry")
        tap("OK")
        see("1")

        // EVT-3: OK at 00 is no number, so two yellows at 00 are never a second yellow.
        swipeUpForAway()
        tap("Yellow card")
        tap("OK")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow AWY"].waitForExistence(timeout: 5), "00 records no number")
        tap("Undo last event, Yellow AWY")
        tap("Undo")

        // A second yellow for the away team's number 1 brings up the send-off screen.
        swipeUpForAway()
        tap("Yellow card")
        tap("Ones up")
        tap("OK")
        swipeUpForAway()
        tap("Yellow card")
        tap("Ones up")
        tap("OK")
        see("Send off")
        app.buttons.firstMatch.tap()

        // Undo takes it back.
        swipeForMenu()
        tap("Undo last event, 2nd yellow AWY #1")
        tap("Undo")

        // Half-time, the second half, the end.
        swipeForMenu()
        let endFirst = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End first half'")).firstMatch
        XCTAssertTrue(endFirst.waitForExistence(timeout: 5))
        endFirst.tap()
        tap("End first half")
        see("HALF-TIME")

        // EVT-7: a card at half-time, from the game menu.
        swipeForMenu()
        tap("Card for HOM")
        tap("Yellow card")
        tap("OK")
        see("HALF-TIME")

        tap("End half-time")
        see("2H kickoff")
        tap("Start")
        see("2H")
        swipeForMenu()
        // INP-6: the first half's events (and half-time's card) can't be undone in the second.
        let end = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End match'")).firstMatch
        XCTAssertTrue(end.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Undo last event'")).firstMatch.exists)
        XCTAssertTrue(end.waitForExistence(timeout: 5))
        end.tap()
        tap("End match")
        see("FULL TIME")
        see("Match saved")
        tap("Done")

        // It's kept.
        let history = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'History'")).firstMatch
        XCTAssertTrue(history.waitForExistence(timeout: 5))
        history.tap()
        XCTAssertTrue(app.staticTexts["HOM 1-0 AWY"].waitForExistence(timeout: 5))

        // UI-17: its own screen, as on the Garmin watch: Summary, Events, Mark pitch and Remove from watch.
        app.staticTexts["HOM 1-0 AWY"].tap()
        see("On this watch only · Link to send it")
        shot("history match")
        let summary = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Summary'")).firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 5))
        summary.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cards, 2 cautions'")).firstMatch.waitForExistence(timeout: 5)
            || app.staticTexts["2 cautions · 0 send-offs"].exists)
        shot("history summary")
        app.buttons["Back"].firstMatch.tap()
        let events = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Events'")).firstMatch
        XCTAssertTrue(events.waitForExistence(timeout: 5))
        events.tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Goal HOM #1'")).firstMatch.waitForExistence(timeout: 5))
        shot("history events")
        app.buttons["Back"].firstMatch.tap()
        tap("Remove from watch")
        see("Not sent to LawFive")
        shot("history remove")
        tap("Remove")
        XCTAssertTrue(app.staticTexts["Finished matches show here"].waitForExistence(timeout: 5))
    }

    // INP-3, INP-6: during play the period's end comes first, and Undo only once there's an event this period;
    // UI-17: Settings' Controls row and the switches beside it, and Alerts' repeat intervals.
    func testMenusAndSettings() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-noWorkout", "1", "-plain", "1"]
        app.launch()
        tap("Settings, Not linked")
        shot("settings")
        tap("Controls, Tap for stoppage: off")
        shot("controls")
        tap("Tap for stoppage, Tap the screen to start and end it")
        app.buttons["Back"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Controls, Tap for stoppage: on"].waitForExistence(timeout: 5))
        app.swipeUp()
        shot("settings 2")
        app.swipeDown()
        tap("Alerts, All on")
        app.swipeUp()
        shot("alerts")
        tap("Repeat alerts every, 10 s")
        tap("15 s")
        XCTAssertTrue(app.buttons["Repeat alerts every, 15 s"].waitForExistence(timeout: 5))
        app.buttons["Back"].firstMatch.tap()
        tap("Account, Not linked")
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Record track'")).firstMatch.exists)
        shot("account")
        app.buttons["Back"].firstMatch.tap()
        app.buttons["Back"].firstMatch.tap()

        tap("New match, Quick · 2×45' · HT 15'")
        tap("Quick match, 2×45' · HT 15'")
        tap("HOM")
        tap("Start")
        see("1H")
        swipeForMenu()
        let first = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'End first half'")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Undo last event'")).firstMatch.exists)
        shot("game menu")
        app.buttons["Back"].firstMatch.tap()
        swipeUpForAway()
        tap("Yellow card")
        tap("OK")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow AWY"].waitForExistence(timeout: 5))
        shot("game menu undo")
        app.swipeUp()
        shot("game menu end")
        app.swipeDown()
        app.swipeDown()
        first.tap()
        see("End first half?")
        shot("end first half")
        tap("End first half")
        see("HALF-TIME")
        shot("half-time")
        swipeForMenu()
        XCTAssertTrue(app.buttons["Undo last event, Yellow AWY"].waitForExistence(timeout: 5), "at half-time, the half just ended's")
        shot("half-time menu")
    }

    // WCH-7: what the first launch says once Apple Health or the location was refused.
    func testPermissionsRefused() {
        continueAfterFailure = false
        app.launchArguments = ["-reset", "1", "-refused", "1"]
        app.launch()
        see("The match still runs")
        shot("permissions refused")
        tap("Done")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'New match'")).firstMatch.waitForExistence(timeout: 5))
    }
}
