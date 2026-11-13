import XCTest
@testable import LawFive

// WEB-14: Directions open in the maps app chosen in Settings; automatic is Apple Maps on iPhone.
final class DirectionsTests: XCTestCase {
    func testAutomaticAndAppleOpenAppleMapsGoogleOpensGoogleMaps() {
        XCTAssertEqual(directionsURL(lat: 33.6, lon: -117.6, app: nil)?.absoluteString, "https://maps.apple.com/?daddr=33.6,-117.6")
        XCTAssertEqual(directionsURL(lat: 33.6, lon: -117.6, app: "auto")?.absoluteString, "https://maps.apple.com/?daddr=33.6,-117.6")
        XCTAssertEqual(directionsURL(lat: 33.6, lon: -117.6, app: "google")?.absoluteString, "https://www.google.com/maps/dir/?api=1&destination=33.6,-117.6")
    }

    func testAnAddressIsEncoded() {
        XCTAssertEqual(directionsURL(to: "30901 Oso Pkwy, Trabuco Canyon", app: "google")?.absoluteString,
                       "https://www.google.com/maps/dir/?api=1&destination=30901%20Oso%20Pkwy,%20Trabuco%20Canyon")
    }
}
