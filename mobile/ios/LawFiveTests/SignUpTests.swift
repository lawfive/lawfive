import XCTest
@testable import LawFive

// APP-29: when the sign-in card offers Create an account, and the line under it, from GET /v1/meta.

final class SignUpTests: XCTestCase {
    private func meta(_ fields: [String: JSONValue]) -> JSONValue { .object(["product": .string("LawFive")].merging(fields) { a, _ in a }) }

    func testOffersAnAccountWhereTheServerTakesNewOnes() {
        for mode in ["open", "approval"] {
            let site = AppGraph.Website(meta: meta(["signUp": .string(mode)]))
            XCTAssertTrue(site.takesNewAccounts, mode)
            XCTAssertEqual(site.line, "Have an invitation? Scan it with Scan a QR code.")
        }
    }

    func testNotOnAClosedServer() {
        let site = AppGraph.Website(meta: meta(["signUp": .string("closed")]))
        XCTAssertFalse(site.takesNewAccounts)
        XCTAssertEqual(site.line, "New accounts on this server are by invitation. Scan yours with Scan a QR code.")
    }

    /// ADM-5: its first account needs the setup code, on its website.
    func testNotOnANewServer() {
        let site = AppGraph.Website(meta: meta(["signUp": .string("open"), "firstAccount": .bool(true)]))
        XCTAssertFalse(site.takesNewAccounts)
        XCTAssertEqual(site.line, "This server isn't set up yet. Open it in a browser to make the first account.")
    }

    /// One that couldn't be reached, isn't LawFive, or is from before it said.
    func testNotWhenTheServerHasntSaid() {
        XCTAssertFalse(AppGraph.Website(meta: nil).takesNewAccounts)
        XCTAssertFalse(AppGraph.Website(meta: .object(["product": .string("Other"), "signUp": .string("open")])).takesNewAccounts)
        XCTAssertFalse(AppGraph.Website(meta: meta([:])).takesNewAccounts)
        XCTAssertEqual(AppGraph.Website(meta: nil).line, "Have an invitation? Scan it with Scan a QR code.")
    }

    /// USR-7: from its publicUrl, whatever it says of new accounts.
    func testForgottenPasswordsOnTheWebsite() {
        XCTAssertEqual(AppGraph.Website(meta: meta(["signUp": .string("closed"), "publicUrl": .string("https://app.lawfive.app/")])).forgotPassword?.absoluteString,
                       "https://app.lawfive.app/forgot-password")
        XCTAssertNil(AppGraph.Website(meta: meta(["publicUrl": .string("app.lawfive.app")])).forgotPassword)
    }
}
