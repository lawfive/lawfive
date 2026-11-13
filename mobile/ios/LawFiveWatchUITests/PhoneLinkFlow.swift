import XCTest

// Decision 4c: the watch's side of Link your Apple Watch, run while the paired iPhone simulator offers
// (the iPhone app's Walkthrough.testLinkingTheAppleWatch): the question, Link, then Linked once the
// phone has sent the server and a token. Needs the iPhone app offering and the demo server running;
// it isn't one of the tests that run on their own.
final class PhoneLinkFlow: XCTestCase {
    func testLinkingFromThePairedIPhone() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["LAWFIVE_PAIRED"] != nil, "needs the paired iPhone offering")
        let app = XCUIApplication()
        app.launchArguments = ["-noWorkout", "1"]
        app.launch()
        let link = app.buttons["Link"]
        XCTAssertTrue(link.waitForExistence(timeout: 60), "the phone's offer: \(app.debugDescription)")
        add(XCTAttachment(screenshot: XCUIScreen.main.screenshot()))
        link.tap()
        XCTAssertTrue(app.staticTexts["Linked"].waitForExistence(timeout: 45), "linked by the phone: \(app.debugDescription)")
        add(XCTAttachment(screenshot: XCUIScreen.main.screenshot()))
    }
}
