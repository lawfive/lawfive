import XCTest

// Signs in to the demo server and walks the app, taking a picture of each screen, for reviewing the
// design (as web/scripts/screenshots.ts does). Needs `pnpm demo` running in server/.
//   tools/screenshots.sh <output folder>

final class Walkthrough: XCTestCase {
    private let app = XCUIApplication()
    private var out: String { ProcessInfo.processInfo.environment["LAWFIVE_SHOTS"] ?? NSTemporaryDirectory() }
    private var server: String { ProcessInfo.processInfo.environment["LAWFIVE_DEMO"] ?? "http://localhost:3000" }
    // The demo's account, unless a test is given another (testDeletingTheAccount).
    private var account: String { ProcessInfo.processInfo.environment["LAWFIVE_EMAIL"] ?? "demo@lawfive.dev" }
    private var accountPassword: String { ProcessInfo.processInfo.environment["LAWFIVE_PASSWORD"] ?? "lawfive-demo" }

    private func shot(_ name: String) {
        Thread.sleep(forTimeInterval: 1.2)
        let data = XCUIScreen.main.screenshot().pngRepresentation
        try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
        FileManager.default.createFile(atPath: "\(out)/\(name).png", contents: data)
    }

    /// IOS-13: the tabs are the board along the bottom, each button known by "tab." and its name.
    private func tabButton(_ name: String) -> XCUIElement { app.buttons["tab.\(name)"] }

    private func tab(_ name: String) { tabButton(name).tap() }

    private func signIn(once typed: (() -> Void)? = nil) {
        let email = app.textFields["Email"]
        guard email.waitForExistence(timeout: 8) else { return }
        shot("00-sign-in")
        app.buttons["Use another server"].tap()
        let field = app.textFields["Server"]
        if !field.waitForExistence(timeout: 3) { shot("00-no-server-field"); print(app.debugDescription) }
        field.tap()
        field.press(forDuration: 1)
        if app.menuItems["Select All"].waitForExistence(timeout: 1) { app.menuItems["Select All"].tap() }
        field.typeText(server)
        typed?()
        email.tap()
        email.typeText(account)
        let password = app.secureTextFields["Password"]
        password.tap()
        password.typeText(accountPassword)
        // The button under the keyboard's form, in the app's own words.
        app.buttons.matching(NSPredicate(format: "label == 'Sign in'")).firstMatch.tap()
        // iOS may offer to save the password, over the app, once it's signed in.
        _ = tabButton("Matches").waitForExistence(timeout: 20)
        // On iOS 27 the question comes from the system's password service rather than SpringBoard.
        let offers = [app] + ["com.apple.springboard", "com.apple.AuthenticationServicesCore.AuthenticationServicesAgent", "com.apple.Passwords", "com.apple.PasswordsUIService"].map { XCUIApplication(bundleIdentifier: $0) }
        for (i, offer) in offers.enumerated() {
            let notNow = offer.buttons["Not Now"]
            if notNow.waitForExistence(timeout: i < 2 ? 4 : 1.5) {
                notNow.tap()
                break
            }
        }
        // APP-16: the first sync's screen covers the app until it's closed.
        let done = app.buttons["Done"]
        if done.waitForExistence(timeout: 12) { done.tap() }
    }

    /// Scrolls until it's on screen and clear of what lies over the page's foot (IOS-13): the tab bar
    /// along the bottom, or a form's Save bar.
    private func reveal(_ element: XCUIElement, times: Int = 12) {
        let tabs = tabButton("Matches")
        let save = app.buttons["Save"]
        func covered() -> Bool {
            var foot = app.frame.maxY
            if tabs.exists { foot = min(foot, tabs.frame.minY) }
            if save.exists, save.frame.minY > app.frame.midY { foot = min(foot, save.frame.minY) }
            return element.frame.maxY > foot - 8
        }
        for _ in 0..<times where !element.exists || !element.isHittable || covered() { app.swipeUp() }
    }

    /// Taps it once it's scrolled clear of the tab bar along the bottom (IOS-13), which lies over the page.
    private func tapClear(_ element: XCUIElement) {
        reveal(element, times: 6)
        element.tap()
    }

    private func back() { app.navigationBars.buttons.element(boundBy: 0).tap() }

    /// Down Matches to Past (made once it's scrolled to, under Get ready) half a screen at a time, as a swipe
    /// can fling it past and out of the lazy list at the largest text sizes.
    private func scrollToPast() {
        let past = app.buttons["Past"]
        for _ in 0..<20 where !(past.exists && past.isHittable && past.frame.maxY < tabButton("Matches").frame.minY - 8) {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.75)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.35)), withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        // Settled, so the tap that follows lands rather than stopping the scroll.
        Thread.sleep(forTimeInterval: 1)
    }

    func testWalkThrough() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        Thread.sleep(forTimeInterval: 5)
        shot("01-matches")
        app.swipeUp()
        shot("02-matches-list")
        // WEB-26: Recent under the upcoming list, then its button into all the past matches.
        reveal(app.staticTexts["RECENT"])
        shot("02-matches-recent")
        let allPast = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'All ' AND label ENDSWITH ' past matches'")).firstMatch
        reveal(allPast)
        shot("02-matches-recent-2")
        allPast.tap()
        for _ in 0..<4 { app.swipeDown(velocity: .fast) }
        XCTAssertTrue(app.buttons["Past"].isSelected, "All past matches opens Past")
        shot("03-matches-past")
        app.swipeUp()
        shot("03-matches-rows")
        // A played match: scoreboard, events, heatmap.
        tapClear(app.staticTexts["United U12"].firstMatch)
        Thread.sleep(forTimeInterval: 3)
        shot("04-match-played")
        for i in 1...5 {
            app.swipeUp()
            shot("05-match-played-\(i)")
        }
        back()
        app.buttons["Upcoming"].tap()
        // An upcoming one: the weather and its details. From the top, as Recent (WEB-26) lists played
        // matches with the same teams further down.
        for _ in 0..<4 { app.swipeDown(velocity: .fast) }
        tapClear(app.staticTexts["Strikers U12"].firstMatch)
        Thread.sleep(forTimeInterval: 2)
        shot("06-match")
        app.buttons["Details"].firstMatch.tap()
        shot("08-weather")
        app.swipeDown(velocity: .fast)
        Thread.sleep(forTimeInterval: 1)
        back()
        tab("Venues")
        Thread.sleep(forTimeInterval: 3)
        shot("10-venues")
        // By name: the duplicates hint and the map's switch come before the list, when there are duplicates.
        tapClear(app.staticTexts["Twin Creeks Sports Complex"].firstMatch)
        Thread.sleep(forTimeInterval: 3)
        shot("11-venue")
        app.swipeUp()
        shot("12-venue-2")
        app.buttons["Edit"].tap()
        Thread.sleep(forTimeInterval: 2)
        shot("13-venue-edit")
        app.swipeUp()
        shot("14-venue-edit-2")
        app.buttons["Cancel"].tap()
        back()
        tab("Referees")
        Thread.sleep(forTimeInterval: 1)
        shot("20-referees")
        // The first referee in the list (the search box comes before the rows now, IOS-13).
        tapClear(app.staticTexts["Jordan Lee"].firstMatch)
        shot("21-referee")
        back()
        // STAT-13: the Stats tab, down the page.
        tab("Stats")
        Thread.sleep(forTimeInterval: 2)
        shot("25-stats")
        for n in 26...29 {
            app.swipeUp()
            shot("\(n)-stats-\(n - 24)")
        }
        tab("More")
        shot("30-more")
        app.buttons["Settings, Units, your watch, calendars and your account"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 2)
        shot("31-settings")
        app.swipeUp()
        shot("32-settings-2")
        app.swipeUp()
        shot("33-settings-3")
        // WEB-33: Import matches is in Settings → Your data, as on the website.
        let importRow = app.buttons["Import matches, From a spreadsheet or JSON file"].firstMatch
        reveal(importRow)
        importRow.tap()
        shot("37-import")
        back()
        back()
        app.buttons["Templates, Formats you use often"].firstMatch.tap()
        shot("34-templates")
        app.buttons["Add a template"].tap()
        Thread.sleep(forTimeInterval: 1)
        shot("35-template-new")
        app.buttons["Cancel"].tap()
        back()
        app.buttons["Link a watch, With the code on your watch"].firstMatch.tap()
        shot("36-link")
        back()
        tab("Matches")
        // Tapped again, the tab goes back to its first page.
        tab("Matches")
        app.buttons["Add a match"].tap()
        Thread.sleep(forTimeInterval: 1)
        shot("40-match-new")
        app.swipeUp()
        shot("41-match-new-2")
        app.swipeUp()
        shot("42-match-new-3")
        app.swipeUp()
        shot("43-match-new-4")
    }

    /// The owner's choices of 2026-11-09 on the iPhone (WEB-31 to WEB-33, SET-17, WEB-12, SYNC-14, TRK-9, USR-7,
    /// USR-9, USR-10): a picture of each screen they changed, named `c..`.
    func testChoicesPictures() {
        continueAfterFailure = true
        app.launch()
        // USR-7: Forgot your password? under the card, once the server's typed and looked up.
        signIn {
            Thread.sleep(forTimeInterval: 2.5)
            // The keyboard away, so what's under the card shows.
            self.app.staticTexts["Your matches, on your wrist and everywhere else."].tap()
            Thread.sleep(forTimeInterval: 0.8)
            // On a small phone (the SE) the keyboard stays: dragged away, then the page up to what's under the card.
            if self.app.keyboards.count > 0 {
                self.app.swipeDown(velocity: .slow)
                Thread.sleep(forTimeInterval: 0.8)
                self.app.swipeUp(velocity: .slow)
                Thread.sleep(forTimeInterval: 0.8)
            }
            self.shot("c01-sign-in")
        }
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        Thread.sleep(forTimeInterval: 5)
        func labelled(_ text: String) -> XCUIElement { app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", text)).firstMatch }
        /// Down the page a little under a screen at a time, a picture each step, until `until` is in view.
        func walk(_ prefix: String, until: XCUIElement, steps: Int = 12) {
            Thread.sleep(forTimeInterval: 1)
            for n in 0..<steps {
                shot(String(format: "%@-%02d", prefix, n))
                if until.exists, until.isHittable, until.frame.maxY < tabButton("Matches").frame.minY - 8 { break }
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.78)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.25)))
            }
        }
        // WEB-32: Get ready on Matches.
        walk("c02-matches", until: app.buttons["Hide this list"], steps: 10)
        let change = app.buttons["Change"].firstMatch
        // At the largest text sizes the walk ends past it: back up the page until it can be tapped.
        for _ in 0..<6 where !(change.exists && change.isHittable && change.frame.minY > 100) { app.swipeDown(velocity: .slow) }
        if change.exists {
            tapClear(change)
            Thread.sleep(forTimeInterval: 1.5)
            shot("c03-settings-at-units")
            back()
        }
        for _ in 0..<6 { app.swipeDown(velocity: .fast) }
        // SYNC-14: the Watch fact on a scheduled match.
        let upcoming = app.staticTexts["Strikers U12"].firstMatch
        if upcoming.waitForExistence(timeout: 5) {
            tapClear(upcoming)
            Thread.sleep(forTimeInterval: 2)
            walk("c04-match-watch", until: labelled("FORMAT"), steps: 8)
            back()
        }
        // TRK-9: the heatmap's ends, on a played match.
        let past = app.buttons["Past"]
        // The list is lazy: Past is made once it's scrolled to, under Get ready.
        scrollToPast()
        if past.waitForExistence(timeout: 5) {
            tapClear(past)
            Thread.sleep(forTimeInterval: 1)
            let played = app.staticTexts["United U12"].firstMatch
            if !played.waitForExistence(timeout: 8) { shot("c05-no-played-match") }
            if played.exists {
                tapClear(played)
                Thread.sleep(forTimeInterval: 3)
                let drawing = labelled("Where you spent the match")
                _ = drawing.waitForExistence(timeout: 20)
                for _ in 0..<14 where !(drawing.exists && drawing.frame.minY > 90 && drawing.frame.maxY < app.frame.height * 0.62) {
                    app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.7)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.45)), withVelocity: .slow, thenHoldForDuration: 0.2)
                    Thread.sleep(forTimeInterval: 0.5)
                }
                shot("c05-heatmap-ends")
                back()
            }
        }
        // Slab captions on Stats (By role's Counted in games).
        tab("Stats")
        Thread.sleep(forTimeInterval: 4)
        let byRole = labelled("By role")
        if byRole.waitForExistence(timeout: 15) {
            for _ in 0..<8 where !(byRole.isHittable && byRole.frame.minY > 90 && byRole.frame.minY < app.frame.height * 0.4) { app.swipeUp(velocity: .slow) }
            shot("c06-stats-captions")
        }
        // WEB-31: More in the website's groups.
        tab("More")
        Thread.sleep(forTimeInterval: 1)
        shot("c07-more")
        // WEB-33: Settings in groups, top to bottom.
        app.buttons["Settings, Units, your watch, calendars and your account"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 2.5)
        walk("c08-settings", until: app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Erase this phone'")).firstMatch, steps: 40)
        for _ in 0..<12 { app.swipeDown(velocity: .fast) }
        // USR-10, USR-9, USR-7: the account's sheets.
        for (row, picture) in [("Name", "c09-name"), ("Email", "c10-email"), ("Password", "c11-password")] {
            let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@ OR label CONTAINS %@", "\(row),", ", \(row),")).firstMatch
            guard button.waitForExistence(timeout: 3) else { continue }
            button.tap()
            Thread.sleep(forTimeInterval: 1.2)
            shot(picture)
            let cancel = app.buttons["Cancel"].firstMatch
            if cancel.exists { cancel.tap() }
            Thread.sleep(forTimeInterval: 1)
        }
        back()
        // Decision 4c: Link a watch, with the paired Apple Watch when LawFive is on it.
        app.buttons["Link a watch, With the code on your watch"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 2)
        shot("c12-link")
        // With a paired Apple Watch that has LawFive: the offer, and what the phone says while it waits.
        let linkApple = app.buttons["Link your Apple Watch"]
        if linkApple.exists {
            linkApple.tap()
            Thread.sleep(forTimeInterval: 8)
            shot("c12-link-apple-watch-offered")
            let cancel = app.buttons["Cancel"].firstMatch
            if cancel.exists { cancel.tap() }
        }
        back()
        // SET-17: the match form's usual role and Format beside the kickoff; WEB-12: a new venue's address.
        tab("Matches")
        tab("Matches")
        app.buttons["Add a match"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 1.5)
        let formatField = app.buttons["Format"].firstMatch
        reveal(formatField)
        shot("c13-match-form")
        let officials = labelled("Your role")
        reveal(officials)
        shot("c14-match-form-role")
        let venue = app.buttons["Venue"]
        for _ in 0..<6 where !venue.isHittable { app.swipeDown() }
        if venue.waitForExistence(timeout: 3) {
            venue.tap()
            let search = app.textFields["Search"]
            if search.waitForExistence(timeout: 3) {
                search.typeText("Northgate")
                let create = app.buttons["New venue \"Northgate\""]
                if create.waitForExistence(timeout: 3) {
                    create.tap()
                    Thread.sleep(forTimeInterval: 1.5)
                    shot("c15-new-venue")
                }
            }
        }
    }

    /// Decision 4c: Link your Apple Watch, with a paired watch simulator that has LawFive open; the watch's side is
    /// seen by `xcrun simctl io <watch> screenshot` while this waits.
    func testLinkingTheAppleWatch() {
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("More").waitForExistence(timeout: 20), "signed in")
        tab("More")
        app.buttons["Link a watch, With the code on your watch"].firstMatch.tap()
        let link = app.buttons["Link your Apple Watch"]
        guard link.waitForExistence(timeout: 8) else { return XCTFail("no paired Apple Watch with LawFive") }
        link.tap()
        // Long enough for the watch to answer (the offer stands for a minute), until it's linked or it gives up.
        for n in 0..<14 {
            Thread.sleep(forTimeInterval: 5)
            shot(String(format: "c16-link-apple-watch-%02d", n))
            if app.staticTexts["Your Apple Watch is linked"].exists || app.buttons["Try again"].exists { break }
        }
    }

    /// Saving a match on the phone, through to its page, and deleting it again.
    // QUIZ-7: the quiz under More, after Templates; IOS-10: what Delete account shows.
    /// WEB-27: the caret folds the next match to a strip and opens it again, the strip still opening the
    /// match; it ends open, as the demo starts.
    func testFoldingTheNextMatch() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        // iOS's offer to save the password can come after signing in has finished waiting for it.
        let notNow = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Not Now"]
        if notNow.waitForExistence(timeout: 8) { notNow.tap() }
        let fold = app.buttons["Fold the next match to a strip"]
        let show = app.buttons["Show the next match"]
        // The demo's account may have been left folded.
        if show.waitForExistence(timeout: 5) { show.tap() }
        XCTAssertTrue(fold.waitForExistence(timeout: 5))
        XCTAssertEqual(fold.value as? String, "Expanded")
        shot("fold-1-open")
        fold.tap()
        XCTAssertTrue(show.waitForExistence(timeout: 5))
        XCTAssertEqual(show.value as? String, "Collapsed")
        shot("fold-2-folded")
        let strip = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Next match, ' OR label BEGINSWITH 'Today, '")).firstMatch
        XCTAssertTrue(strip.label.contains("Kickoff in"), strip.label)
        strip.tap()
        XCTAssertTrue(app.navigationBars.buttons.element(boundBy: 0).waitForExistence(timeout: 5), "the strip opens the match")
        shot("fold-3-match")
        back()
        XCTAssertTrue(show.waitForExistence(timeout: 5), "still folded")
        show.tap()
        XCTAssertTrue(fold.waitForExistence(timeout: 5))
    }

    /// TRK-9, WEB-24: the pitch heatmap painted on the grass, on a played match (each period too) and on
    /// Stats, for comparing with the website's and Android's. Named `<set>-…` after `LAWFIVE_SET`.
    func testHeatmapPictures() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        let set = ProcessInfo.processInfo.environment["LAWFIVE_SET"] ?? "heatmap"
        let drawing = { [app] (label: String) in app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch }
        // Down the page by the right-hand touchline, clear of the map, until the drawing and its key are in view.
        func bringUp(_ element: XCUIElement) {
            let height = app.frame.height
            for _ in 0..<30 {
                // Its top a little under the bar, or higher on a short screen so the key under it shows too.
                let off = element.exists ? element.frame.minY - max(110, min(330, height - element.frame.height - 190)) : height * 0.4
                if element.exists, abs(off) < 40 { return }
                let move = max(-height * 0.4, min(height * 0.4, off)) / height
                // Slowly, and held at the end, so the page doesn't run on.
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.55 + max(0, move) / 2)).press(forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.55 + max(0, move) / 2 - move)), withVelocity: .slow, thenHoldForDuration: 0.2)
                Thread.sleep(forTimeInterval: 0.6)
            }
        }
        // The played match among the past ones (an upcoming match has the same team), as testWalkThrough finds it.
        let past = app.buttons["Past"]
        // The list is lazy: Past is made once it's scrolled to, under Get ready (WEB-32) when it shows.
        _ = tabButton("Matches").waitForExistence(timeout: 10)
        scrollToPast()
        XCTAssertTrue(past.waitForExistence(timeout: 10))
        tapClear(past)
        XCTAssertTrue(app.staticTexts["United U12"].firstMatch.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        tapClear(app.staticTexts["United U12"].firstMatch)
        Thread.sleep(forTimeInterval: 3)
        let match = drawing("Where you spent the match")
        // The track comes from the server after the page opens.
        _ = match.waitForExistence(timeout: 20)
        bringUp(match)
        XCTAssertTrue(match.exists, "the match's heatmap")
        shot("\(set)-match")
        app.buttons["First half"].firstMatch.tap()
        XCTAssertTrue(drawing("Where you spent the first half").waitForExistence(timeout: 3), "the first half's")
        shot("\(set)-match-first-half")
        back()
        tab("Stats")
        Thread.sleep(forTimeInterval: 4)
        let stats = drawing("Where you spent the periods")
        _ = stats.waitForExistence(timeout: 20)
        bringUp(stats)
        XCTAssertTrue(stats.exists, "Stats' heatmap")
        shot("\(set)-stats")
        // The assistant's: the lower of the two Assistant buttons (the filters' is at the top of the page).
        app.buttons.matching(NSPredicate(format: "label == 'Assistant'")).allElementsBoundByIndex.max { $0.frame.minY < $1.frame.minY }?.tap()
        Thread.sleep(forTimeInterval: 1)
        shot("\(set)-stats-assistant")
    }

    /// WEB-28: the slabs beyond Stats, for comparing with the website's and Android's: a match's weather
    /// (a forecast and a played match's), its track's figures (The running) and its heatmap, a venue's and
    /// a referee's figures (See matches scrolling to the matches), and the quiz's score. Each brought
    /// near the top and named `iphone-<place>-<set>` after `LAWFIVE_SET` ("light-402").
    func testSlabPictures() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        let set = ProcessInfo.processInfo.environment["LAWFIVE_SET"] ?? "slabs"
        let labelled = { [app] (label: String) in app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch }
        // Down (or up) the page by the right-hand touchline, clear of the map, until its top is a little under the bar.
        func bringUp(_ element: XCUIElement, top: CGFloat = 140) {
            let height = app.frame.height
            for _ in 0..<40 {
                let off = element.exists ? element.frame.minY - top : height * 0.4
                if element.exists, abs(off) < 18 { return }
                let move = max(-height * 0.4, min(height * 0.4, off)) / height
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.55 + max(0, move) / 2)).press(forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: 0.55 + max(0, move) / 2 - move)), withVelocity: .slow, thenHoldForDuration: 0.2)
                Thread.sleep(forTimeInterval: 0.6)
            }
        }
        func picture(_ title: String, _ place: String) {
            let tab = labelled(title)
            if !tab.waitForExistence(timeout: 20) {
                shot("iphone-\(place)-\(set)-missing")
                print(app.debugDescription)
                XCTFail("\(title)'s slab")
            }
            bringUp(tab)
            shot("iphone-\(place)-\(set)")
        }
        Thread.sleep(forTimeInterval: 4)
        // An upcoming match's forecast.
        tapClear(app.staticTexts["Strikers U12"].firstMatch)
        Thread.sleep(forTimeInterval: 2)
        picture("Forecast", "weather")
        back()
        // A played match's weather, track and heatmap.
        app.swipeDown()
        app.swipeDown()
        let past = app.buttons["Past"]
        // The list is lazy: Past is made once it's scrolled to, under Get ready (WEB-32) when it shows.
        _ = tabButton("Matches").waitForExistence(timeout: 10)
        scrollToPast()
        XCTAssertTrue(past.waitForExistence(timeout: 10))
        tapClear(past)
        XCTAssertTrue(app.staticTexts["United U12"].firstMatch.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        tapClear(app.staticTexts["United U12"].firstMatch)
        Thread.sleep(forTimeInterval: 3)
        picture("Weather", "weather-played")
        picture("The running", "track")
        picture("Where on the pitch", "pitch")
        back()
        tab("Venues")
        Thread.sleep(forTimeInterval: 3)
        // By its first words, clear of the add button over the list's right at large text sizes.
        let venue = app.staticTexts["Twin Creeks Sports Complex"].firstMatch
        // Up by the left-hand touchline, clear of the venues' map, which would take a swipe in the middle.
        for _ in 0..<8 where !venue.exists || venue.frame.maxY > tabButton("Matches").frame.minY - 60 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.7)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.35)))
        }
        venue.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
        Thread.sleep(forTimeInterval: 3)
        picture("At this venue", "venue")
        // See matches goes to the matches further down the page.
        let see = app.buttons["See matches"].firstMatch
        tapClear(see)
        Thread.sleep(forTimeInterval: 1.5)
        let here = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Matches here'")).firstMatch
        XCTAssertTrue(here.exists && here.frame.minY > 0 && here.frame.maxY < app.frame.midY, "See matches scrolled to the matches")
        back()
        tab("Referees")
        Thread.sleep(forTimeInterval: 2)
        // By its first words, clear of the add button over the list's right at large text sizes.
        let referee = app.staticTexts["Sam Rivera"].firstMatch
        // Up by the left-hand touchline, clear of the venues' map, which would take a swipe in the middle.
        for _ in 0..<8 where !referee.exists || referee.frame.maxY > tabButton("Matches").frame.minY - 60 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.7)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.35)))
        }
        referee.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
        Thread.sleep(forTimeInterval: 3)
        picture("Working together", "referee")
        back()
        // The quiz's score, after five questions answered with the last choice of each.
        tab("More")
        let quiz = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Quiz'")).firstMatch
        XCTAssertTrue(quiz.waitForExistence(timeout: 5))
        tapClear(quiz)
        XCTAssertTrue(app.buttons["Start the quiz"].waitForExistence(timeout: 8))
        app.buttons["5"].firstMatch.tap()
        tapClear(app.buttons["Start the quiz"])
        for n in 1...5 {
            let check = app.buttons["Check answer"]
            XCTAssertTrue(check.waitForExistence(timeout: 5), "question \(n)")
            reveal(check)
            let options = app.buttons.allElementsBoundByIndex.filter { $0.frame.maxY <= check.frame.minY && $0.frame.minY > app.frame.height * 0.15 && $0.label != "Start over" }
            options.max { $0.frame.minY < $1.frame.minY }?.tap()
            check.tap()
            let next = app.buttons[n == 5 ? "See how you did" : "Next question"]
            XCTAssertTrue(next.waitForExistence(timeout: 5))
            tapClear(next)
            Thread.sleep(forTimeInterval: 0.8)
        }
        Thread.sleep(forTimeInterval: 1.5)
        picture("Your score", "quiz")
    }

    /// STAT-14, STAT-15: Stats as the broadcast stats package, a picture each step of the way top to
    /// bottom, then again with Role = Assistant (the demo's Venu 2 then has no battery readings). Named
    /// `<set>-NN` and `assistant-<set>-NN` after `LAWFIVE_SET`.
    func testStatsPictures() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Stats").waitForExistence(timeout: 20), "signed in")
        let set = ProcessInfo.processInfo.environment["LAWFIVE_SET"] ?? "stats"
        tab("Stats")
        Thread.sleep(forTimeInterval: 4)
        shot("\(set)-start")
        let labelled = { [app] (label: String) in app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch }
        if !labelled("By role").waitForExistence(timeout: 15) {
            shot("\(set)-no-stats")
            XCTFail("the stats came")
        }
        let full = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Full stats'")).firstMatch
        func walk(_ prefix: String) {
            Thread.sleep(forTimeInterval: 1.5)
            for n in 0..<60 {
                shot(String(format: "%@-%02d", prefix, n))
                if full.exists, full.isHittable, full.frame.maxY < tabButton("Stats").frame.minY - 8 { break }
                // A little under a screen at a time, so nothing falls between two pictures.
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.78))
                start.press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.22)))
            }
        }
        walk(set)
        XCTAssertTrue(labelled("Your watches").exists, "the watches")
        // Back to the top, and the assistant's games.
        let fourth = app.buttons["Fourth"]
        for _ in 0..<30 where !(fourth.exists && fourth.isHittable) { app.swipeDown(velocity: .fast) }
        // Role's Assistant, on the filters board: the topmost of the two (Where on the pitch has one too).
        let assistant = app.buttons.matching(NSPredicate(format: "label == 'Assistant'")).allElementsBoundByIndex.min { $0.frame.minY < $1.frame.minY }
        XCTAssertNotNil(assistant)
        assistant?.tap()
        Thread.sleep(forTimeInterval: 3)
        walk("assistant-\(set)")
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'no battery readings yet'")).firstMatch.exists, "the Venu 2 without readings")
    }

    func testQuizAndDeleteAccountFromMore() {
        app.launch()
        signIn()
        tab("More")
        XCTAssertFalse(tabButton("Quiz").exists)
        shot("40-more")
        let quiz = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Quiz'")).firstMatch
        XCTAssertTrue(quiz.waitForExistence(timeout: 5))
        XCTAssertLessThan(app.buttons["Templates, Formats you use often"].firstMatch.frame.minY, quiz.frame.minY)
        quiz.tap()
        XCTAssertTrue(app.buttons["Start the quiz"].waitForExistence(timeout: 8))
        shot("41-quiz")
        back()
        app.buttons["Settings, Units, your watch, calendars and your account"].firstMatch.tap()
        let delete = app.buttons["Delete your account, Your matches, venues, referees, tracks and everything else, for good."].firstMatch
        reveal(delete, times: 12)
        delete.tap()
        XCTAssertTrue(app.staticTexts["Delete your account?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Download my data"].exists)
        XCTAssertFalse(app.buttons["Delete my account"].isEnabled)
        shot("42-delete-account")
        app.buttons["Keep my account"].tap()
        XCTAssertTrue(delete.waitForExistence(timeout: 5))
    }

    /// IOS-10: deleting the account for real, from Settings, on a throwaway account given by
    /// LAWFIVE_EMAIL and LAWFIVE_PASSWORD on LAWFIVE_DEMO's server. Skipped without one, as it deletes
    /// the account it signs in to.
    func testDeletingTheAccount() throws {
        guard ProcessInfo.processInfo.environment["LAWFIVE_EMAIL"] != nil else { throw XCTSkip("needs a throwaway account") }
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("More").waitForExistence(timeout: 20), "signed in")
        tab("More")
        shot("delete-0-more")
        let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settings'")).firstMatch
        reveal(settings, times: 6)
        settings.tap()
        let delete = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Delete your account'")).firstMatch
        reveal(delete, times: 12)
        delete.tap()
        XCTAssertTrue(app.staticTexts["Delete your account?"].waitForExistence(timeout: 5))
        let password = app.secureTextFields["Your password, to confirm"]
        password.tap()
        password.typeText(accountPassword)
        shot("delete-1-confirm")
        app.buttons["Delete my account"].tap()
        XCTAssertTrue(app.textFields["Email"].waitForExistence(timeout: 20), "signed out, back at sign-in")
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: app.staticTexts["Delete your account?"])
        waitForExpectations(timeout: 5)
        shot("delete-2-signed-out")
    }

    /// APP-22: a team's color shows its swatch, and a venue is searched for or made from what's typed.
    func testMatchFormChoosers() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        app.buttons["Add a match"].tap()
        let color = app.buttons["Color"].firstMatch
        XCTAssertTrue(color.waitForExistence(timeout: 5), "the color menu")
        color.tap()
        let red = app.buttons["Red"].firstMatch
        XCTAssertTrue(red.waitForExistence(timeout: 3), "the colors")
        Thread.sleep(forTimeInterval: 0.6)
        shot("50-color-menu")
        red.tap()
        Thread.sleep(forTimeInterval: 0.6)
        shot("51-color-chosen")
        let venue = app.buttons["Venue"]
        reveal(venue, times: 6)
        venue.tap()
        let search = app.textFields["Search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3), "the search sheet")
        Thread.sleep(forTimeInterval: 0.6)
        shot("52-venue-sheet")
        search.typeText("Northgate")
        let create = app.buttons["New venue \"Northgate\""]
        XCTAssertTrue(create.waitForExistence(timeout: 3), "offers a new venue")
        shot("53-venue-new")
        create.tap()
        XCTAssertFalse(search.waitForExistence(timeout: 1.5), "the sheet closed")
        // WEB-12: a new venue asks for its address first, to place it; without one it's made unplaced.
        let make = app.buttons["Create"]
        XCTAssertTrue(make.waitForExistence(timeout: 3), "the new venue's form")
        shot("53-venue-address")
        make.tap()
        XCTAssertFalse(make.waitForExistence(timeout: 1.5), "the venue's form closed")
        XCTAssertEqual(app.buttons["Venue"].value as? String, "Northgate", "it's chosen")
        shot("54-venue-chosen")
    }

    func testSavingAndDeletingAMatch() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        app.buttons["Add a match"].tap()
        let home = app.textFields["Home"]
        home.tap()
        home.typeText("Walkthrough FC")
        let away = app.textFields["Away"]
        away.tap()
        away.typeText("Test Town")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Walkthrough FC v Test Town"].waitForExistence(timeout: 5), "saved, and on its page")
        Thread.sleep(forTimeInterval: 3)
        shot("44-match-saved")
        app.buttons["Edit"].tap()
        let delete = app.buttons["Delete match"]
        reveal(delete, times: 10)
        delete.tap()
        app.alerts.buttons["Delete"].tap()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 3)
        XCTAssertFalse(app.staticTexts["Walkthrough FC"].exists, "gone from the list")
        shot("45-after-delete")
    }

    /// The marketing site's pictures (site/public/images/iphone-*): Matches, the next match, a venue.
    func testSitePictures() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        // The demo's account may have been left with the next match folded (WEB-27).
        let show = app.buttons["Show the next match"]
        if show.waitForExistence(timeout: 4) { show.tap() }
        Thread.sleep(forTimeInterval: 4)
        if app.buttons["Got it"].exists { app.buttons["Got it"].tap() }
        // Matches and the match at the top of the page: the next match's board, then the scoreboard and the forecast.
        shot("site-matches")
        app.staticTexts.matching(identifier: "Strikers U12").element(boundBy: 1).tap()
        Thread.sleep(forTimeInterval: 4)
        shot("site-match")
        back()
        tab("Venues")
        Thread.sleep(forTimeInterval: 3)
        let venue = app.staticTexts["Twin Creeks Sports Complex"].firstMatch
        // Up by the left-hand touchline, clear of the venues' map.
        for _ in 0..<8 where !venue.exists || venue.frame.maxY > tabButton("Matches").frame.minY - 60 {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.7)).press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.35)))
        }
        venue.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.5)).tap()
        Thread.sleep(forTimeInterval: 4)
        // The venue from At this venue's slab down to its map, Directions just under the tab bar.
        let directions = app.buttons["Directions"].firstMatch
        XCTAssertTrue(directions.waitForExistence(timeout: 10))
        let height = app.frame.height
        for _ in 0..<14 {
            let off = directions.frame.minY - tabButton("Matches").frame.minY
            if abs(off) < 1.5 { break }
            // Slowly, by the right-hand touchline, and a little further for the drag's slop.
            let move = max(-0.4, min(0.4, (off > 0 ? off + 10 : off - 10) / height))
            let start = move > 0 ? 0.75 : 0.3
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: start)).press(forDuration: 0.05,
                thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.975, dy: start - move)), withVelocity: .slow, thenHoldForDuration: 0.4)
            Thread.sleep(forTimeInterval: 0.8)
        }
        print("SITE Directions at \(directions.frame.minY), tab bar at \(tabButton("Matches").frame.minY)")
        Thread.sleep(forTimeInterval: 3)
        shot("site-venue")
    }

    /// WEB-23: Call, Text and Email as a group of icons on a match's crew and in the Referees list.
    func testContactButtons() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        app.staticTexts.matching(identifier: "Strikers U12").element(boundBy: 1).tap()
        let call = app.buttons["Call Sam Rivera"].firstMatch
        reveal(call, times: 8)
        XCTAssertTrue(call.exists && app.buttons["Text Sam Rivera"].exists && app.buttons["Email Sam Rivera"].exists, "the crew's buttons")
        shot("70-crew-contact")
        back()
        tab("Referees")
        XCTAssertTrue(app.buttons["Email Jordan Lee"].waitForExistence(timeout: 5), "the list's buttons")
        shot("71-referees-contact")
    }

    /// FILE-8: a referee's picture cropped, with the circle showing what their picture will be.
    func testCroppingAPhoto() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tab("Referees")
        tapClear(app.staticTexts["Chris O'Neill"].firstMatch)
        let first = app.buttons["Photo 1"]
        reveal(first, times: 6)
        first.tap()
        Thread.sleep(forTimeInterval: 2)
        shot("79-viewer")
        app.buttons["Crop"].tap()
        XCTAssertTrue(app.navigationBars["Crop photo"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 2)
        shot("80-crop-open")
        // Pull the bottom right corner in, then move the frame.
        let area = app.otherElements["The part to keep: drag it, or pull its corners"]
        let frame = area.frame
        let corner = area.coordinate(withNormalizedOffset: CGVector(dx: 0.99, dy: 0.99))
        corner.press(forDuration: 0.1, thenDragTo: area.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.65)))
        area.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.35)).press(forDuration: 0.1, thenDragTo: area.coordinate(withNormalizedOffset: CGVector(dx: 0.45, dy: 0.45)))
        XCTAssertGreaterThan(frame.width, 10)
        shot("81-crop-dragged")
        app.buttons["Turn"].tap()
        shot("82-crop-turned")
        app.navigationBars["Crop photo"].buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Crop photo"].waitForNonExistence(timeout: 15), "saved")
        Thread.sleep(forTimeInterval: 3)
        shot("83-after-crop")
    }

    /// RES-1, RES-3, RES-5: a played match's result corrected, shown as recorded, and put back.
    func testCorrectingAResult() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        app.buttons["Past"].tap()
        // The next match's board reads as one button (IOS-13), so the first is a played one.
        let named = app.staticTexts.matching(identifier: "United U12")
        XCTAssertTrue(named.firstMatch.waitForExistence(timeout: 5))
        tapClear(named.firstMatch)
        let edit = app.buttons["Edit result"]
        reveal(edit, times: 8)
        shot("60-match-events")
        edit.tap()
        // A form's title is on the page, its bar hidden (IOS-13).
        XCTAssertTrue(app.staticTexts["Edit result"].waitForExistence(timeout: 5))
        shot("61-edit-result")
        // Scrolled clear of the Save bar along the form's foot (IOS-13), which lies over it.
        let add = app.buttons["Add a caution"]
        let bar = app.buttons["Save"]
        _ = bar
        reveal(add)
        add.tap()
        Thread.sleep(forTimeInterval: 0.5)
        app.swipeUp()
        shot("62-edit-result-added")
        app.buttons["Save"].tap()
        let note = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Edited after the match'")).firstMatch
        for _ in 0..<8 where !note.exists { app.swipeUp() }
        XCTAssertTrue(note.waitForExistence(timeout: 8), "says it was corrected")
        shot("63-edited")
        app.buttons["Show as recorded"].tap()
        shot("64-as-recorded")
        app.buttons["Show the corrected result"].tap()
        app.buttons["Put back the watch's"].tap()
        app.alerts.buttons["Put back"].tap()
        Thread.sleep(forTimeInterval: 6)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Edited after the match'")).firstMatch.exists, "put back")
        shot("65-put-back")
    }

    /// A match's form with its officials: each row's role and referee both readable.
    func testEditingAMatchsOfficials() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tapClear(app.staticTexts["Strikers U12"].firstMatch)
        app.buttons["Edit"].tap()
        let add = app.buttons["Add an official"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        reveal(add, times: 6)
        XCTAssertEqual(app.buttons.matching(identifier: "Role").firstMatch.value as? String, "AR1", "the role's shown")
        shot("46-officials")
        app.buttons["Cancel"].tap()
    }

    /// The match form's Details (WEB-21) and a referee's Shown as with the surname it guesses in its
    /// hint (WEB-20).
    func testDetailsAndShownAs() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tapClear(app.staticTexts["Strikers U12"].firstMatch)
        app.buttons["Edit"].tap()
        // Details is just above Officials.
        let add = app.buttons["Add an official"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        reveal(add, times: 6)
        app.swipeDown(velocity: .slow)
        shot("48-match-details")
        app.buttons["Cancel"].tap()
        tab("Referees")
        tapClear(app.staticTexts["Sam Rivera"].firstMatch)
        app.buttons["Edit"].tap()
        XCTAssertTrue(app.staticTexts["Match cards show \u{201C}Rivera\u{201D}, from the name"].waitForExistence(timeout: 5), "the guess in the hint")
        shot("49-referee-shown-as")
        app.buttons["Cancel"].tap()
    }

    /// Merging duplicates (DUP-12), step by step: referees, then venues. Merges for real, so the demo needs restarting after.
    func testMergingDuplicates() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        let merge = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Merge 2 into'")).firstMatch

        tab("Referees")
        app.swipeUp()
        shot("merge-referees-1-list")
        app.buttons["Find duplicates"].tap()
        XCTAssertTrue(app.buttons["Merge…"].waitForExistence(timeout: 10))
        shot("merge-referees-2-duplicates")
        app.buttons["Merge…"].tap()
        XCTAssertTrue(app.buttons["Next"].waitForExistence(timeout: 10))
        shot("merge-referees-3-pick")
        app.buttons["Next"].tap()
        XCTAssertTrue(app.buttons["srivera@baylandsyouth.org"].waitForExistence(timeout: 10))
        shot("merge-referees-4-review")
        app.buttons["srivera@baylandsyouth.org"].tap()
        shot("merge-referees-5-chosen")
        merge.tap()
        XCTAssertTrue(app.staticTexts["No likely duplicates"].waitForExistence(timeout: 20))
        shot("merge-referees-6-after")
        back()
        app.swipeDown()
        tapClear(app.staticTexts["Sam Rivera"].firstMatch)
        shot("merge-referees-7-merged")

        tab("Venues")
        app.swipeUp()
        app.swipeUp()
        shot("merge-venues-1-list")
        app.buttons["Find duplicates"].tap()
        XCTAssertTrue(app.buttons["Merge…"].waitForExistence(timeout: 10))
        shot("merge-venues-2-duplicates")
        app.buttons["Merge…"].tap()
        XCTAssertTrue(app.buttons["Next"].waitForExistence(timeout: 10))
        shot("merge-venues-3-pick")
        app.buttons["Next"].tap()
        XCTAssertTrue(merge.waitForExistence(timeout: 10))
        shot("merge-venues-4-review")
        app.swipeUp()
        shot("merge-venues-5-pitches")
        // The pitch kept under a name another has: renamed.
        let name = app.textFields.matching(NSPredicate(format: "identifier == 'Name' AND value == 'Field 1'")).firstMatch
        name.tap()
        name.press(forDuration: 1)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        name.typeText("Field 1 (north)")
        app.buttons["Done"].firstMatch.tap()
        shot("merge-venues-6-renamed")
        app.swipeUp()
        app.swipeUp()
        shot("merge-venues-7-ready")
        merge.tap()
        XCTAssertTrue(app.staticTexts["No likely duplicates"].waitForExistence(timeout: 20))
        back()
        app.swipeDown()
        app.swipeDown()
        tapClear(app.staticTexts["Twin Creeks Sports Complex"].firstMatch)
        shot("merge-venues-8-merged")
    }

    /// Likely duplicates on the lists and pages (DUP-13), and the back menu naming the page behind (WEB-16).
    func testDuplicateHintsAndBackMenu() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tab("Venues")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS 'look like duplicates'")).firstMatch.waitForExistence(timeout: 10))
        shot("hints-venues")
        tapClear(app.staticTexts["Twin Creeks Sports Complex"].firstMatch)
        XCTAssertTrue(app.staticTexts["Probably the same as Twin Creeks"].waitForExistence(timeout: 10))
        shot("hints-venue")
        tab("Referees")
        shot("hints-referees")
        tab("Matches")
        tapClear(app.staticTexts["Strikers U12"].firstMatch)
        Thread.sleep(forTimeInterval: 2)
        tapClear(app.staticTexts["Sam Rivera"].firstMatch)
        XCTAssertTrue(app.staticTexts["Probably the same as Rivera, Sam"].waitForExistence(timeout: 10))
        shot("hints-referee")
        // The back button stays a chevron; its title, which its long-press menu and VoiceOver use, names the match.
        let back = app.navigationBars.buttons["BackButton"]
        XCTAssertTrue(back.label.hasPrefix("Match · "), "the back button names the match: \(back.label)")
    }

    /// PLAN-6, PLAN-9: the account's plan, what it's using, and its time zone, in Settings.
    func testPlanInSettings() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tab("More")
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settings'")).firstMatch.tap()
        let usage = app.staticTexts["Photos and tracks"].firstMatch
        reveal(usage, times: 12)
        XCTAssertTrue(usage.waitForExistence(timeout: 10), "the plan shows what's used")
        shot("plan-settings")
        let zone = app.staticTexts["Time zone"].firstMatch
        reveal(zone, times: 4)
        XCTAssertTrue(zone.exists, "the time zone shows")
        shot("plan-time-zone")
    }

    /// UI-27: Settings' Match screen, and its setup a step at a time, with a moment chosen.
    /// A tile or chip whose label starts with its name (a tile's hint follows it).
    private func choose(_ name: String) {
        let button = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
        reveal(button, times: 6)
        button.tap()
    }

    func testMatchScreenSetup() {
        continueAfterFailure = false
        app.launch()
        signIn()
        XCTAssertTrue(tabButton("Matches").waitForExistence(timeout: 20), "signed in")
        tab("More")
        let settings = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Settings'")).firstMatch
        if !settings.waitForExistence(timeout: 10) { shot("screen-no-settings") }
        settings.tap()
        let change = app.buttons["Change"].firstMatch
        reveal(change, times: 14)
        XCTAssertTrue(change.waitForExistence(timeout: 10), "the match screen's Change")
        app.swipeUp()
        shot("screen-settings")
        change.tap()
        XCTAssertTrue(app.staticTexts["How many clocks?"].waitForExistence(timeout: 10), "the setup's first step")
        shot("screen-step1")
        choose("Two, side by side")
        app.buttons["Continue"].tap()
        choose("Time left")
        choose("Time taken")
        shot("screen-step2")
        app.buttons["Continue"].tap()
        choose("Ring")
        choose("Added time")
        shot("screen-step3")
        app.buttons["Continue"].tap()
        choose("Scores only")
        choose("Half-time")
        shot("screen-step4")
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Your match screen"].waitForExistence(timeout: 5), "the review")
        shot("screen-review")
    }
}
