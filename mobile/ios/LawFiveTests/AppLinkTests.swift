import XCTest
@testable import LawFive

// As Android's AppLinkTest: what a QR code or lawfive:// link asks for, and what it may not.

final class AppLinkTests: XCTestCase {
    private let token = "abcDEF123_-xyz789"

    func testReadsTheWebAppsQrCodes() {
        XCTAssertEqual(AppLink.parse("https://app.lawfive.app/get-app#BCDF2345"), .signIn(server: "https://app.lawfive.app", code: "BCDF2345"))
        XCTAssertEqual(AppLink.parse("https://lawfive.example.com:8443/invite/\(token)"), .invite(server: "https://lawfive.example.com:8443", token: token))
    }

    func testReadsLinksThatOpenTheApp() {
        XCTAssertEqual(AppLink.parse("lawfive://sign-in?server=https%3A%2F%2Fapi.lawfive.app&code=BCDF2345"), .signIn(server: "https://api.lawfive.app", code: "BCDF2345"))
        XCTAssertEqual(AppLink.parse("lawfive://invite?server=https%3A%2F%2Fapi.lawfive.app&token=\(token)"), .invite(server: "https://api.lawfive.app", token: token))
    }

    func testCodesAreReadHoweverTheyAreTyped() {
        XCTAssertEqual(AppLink.normalizeCode("wdjb-mjht"), "WDJBMJHT")
        XCTAssertEqual(AppLink.normalizeCode(" WDJB MJHT "), "WDJBMJHT")
        XCTAssertNil(AppLink.normalizeCode("WDJB"))
    }

    func testPlainHttpOnlyOnTheRefereesOwnNetwork() {
        for host in ["localhost", "127.0.0.1", "10.0.0.4", "172.16.5.9", "172.31.255.1", "192.168.1.51", "169.254.3.3", "nas.local", "[::1]", "fe80::1", "fd12::5"] {
            XCTAssertTrue(AppLink.isLocalNetwork(host), host)
        }
        for host in ["203.0.113.5", "8.8.8.8", "172.32.0.1", "192.169.0.1", "nas", "lawfive.example.com", "2001:db8::1", "10.0.0", "300.1.1.1"] {
            XCTAssertFalse(AppLink.isLocalNetwork(host), host)
        }
    }

    func testPlainHttpOnlyWhenAllowed() {
        XCTAssertNil(AppLink.parse("http://192.0.2.5:3000/get-app#BCDF2345"))
        XCTAssertNil(AppLink.parse("lawfive://sign-in?server=http%3A%2F%2Fevil.example&code=BCDF2345"))
        XCTAssertEqual(AppLink.parse("http://192.0.2.5:3000/get-app#BCDF2345", allowHttp: true), .signIn(server: "http://192.0.2.5:3000", code: "BCDF2345"))
    }

    func testRefusesWhatIsNotOurs() {
        for text in [
            "", "not a link", "https://example.com/", "https://example.com/get-app", "https://example.com/get-app#short",
            "https://example.com/invite/x", "lawfive://sign-in?code=BCDF2345", "lawfive://other?server=https%3A%2F%2Fa.example&code=BCDF2345",
            "ftp://example.com/get-app#BCDF2345", "mailto:someone@example.com",
            // Reads as app.lawfive.app at a glance, but the server is evil.example.
            "https://app.lawfive.app@evil.example/get-app#BCDF2345",
            "lawfive://sign-in?server=https%3A%2F%2Fapp.lawfive.app%40evil.example&code=BCDF2345",
        ] {
            XCTAssertNil(AppLink.parse(text), text)
        }
    }
}
