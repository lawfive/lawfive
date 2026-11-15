import XCTest
@testable import LawFive

// WX-12: the full license texts, kept by hand on the iPhone: every Swift package the app bundles is
// listed, and every text is there with its own copyright line.
final class LicensesTests: XCTestCase {
    /// Packages that only build or test the app, never in it: swift-snapshot-testing and what it brings;
    /// and those Firebase's package names for products the app doesn't use (Analytics, Firestore, App Check
    /// and the rest), whose code isn't in the app.
    private let testOnly: Set<String> = ["swift-snapshot-testing", "swift-custom-dump", "swift-issue-reporting", "swift-syntax",
                                         "abseil-cpp-binary", "app-check", "google-ads-on-device-conversion-ios-sdk", "googleappmeasurement",
                                         "grpc-binary", "gtm-session-fetcher", "interop-ios-for-google-sdks", "leveldb"]

    func testEveryBundledPackageIsListed() throws {
        let resolved = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appending(path: "../LawFive.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved")
        let pins = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: resolved)) as? [String: Any])["pins"] as? [[String: Any]]
        let identities = try XCTUnwrap(pins).compactMap { $0["identity"] as? String }
        XCTAssertFalse(identities.isEmpty)
        let listed = Set(Licenses.libraries.compactMap(\.package))
        for identity in identities where !testOnly.contains(identity) {
            XCTAssertTrue(listed.contains(identity), "\(identity) is in Package.resolved: list it in Data/Licenses.swift, or in testOnly here if the app doesn't bundle it")
        }
    }

    func testEveryTextIsThereWithItsCopyright() throws {
        for c in Licenses.works + Licenses.libraries {
            if let text = c.license.text {
                XCTAssertTrue(text.prefix(400).contains("Copyright"), "\(c.id): its copyright line")
            } else {
                XCTAssertEqual(c.license.short, "Terms", "\(c.id): a text, or terms on the web")
            }
        }
        XCTAssertNotNil(Licenses.find("font:barlow")?.license.text)
        XCTAssertNotNil(Licenses.find("icons:phosphor")?.license.text)
    }

    /// The same text and paragraphs as Android's LicensesTest.
    func testALicensesTextIsSetAsParagraphs() {
        let p = Licenses.paragraphs("""
        ---------------------------------
        SIL OPEN FONT LICENSE Version 1.1
        ---------------------------------

        PREAMBLE
        The goals of the Open Font License (OFL) are to stimulate worldwide
        development of collaborative font projects.

        ### [kdbush.hpp](https://github.com/mourner/kdbush.hpp) by Vladimir Agafonkin

        ```
        Copyright (c) 2016,  Vladimir Agafonkin
        Permission to use, copy:
        ```
        MapLibre Native Android uses portions of Activity.
        URL: [https://developer.android.com](https://developer.android.com)
        License: The Apache Software License
        * Redistributions of source code must retain
          the above copyright notice.
        * Redistributions in binary form
        """)
        XCTAssertEqual(p, [
            LicenseParagraph(text: "SIL OPEN FONT LICENSE Version 1.1"),
            LicenseParagraph(text: "PREAMBLE", heading: true),
            LicenseParagraph(text: "The goals of the Open Font License (OFL) are to stimulate worldwide development of collaborative font projects."),
            LicenseParagraph(text: "kdbush.hpp by Vladimir Agafonkin", heading: true),
            LicenseParagraph(text: "Copyright (c) 2016, Vladimir Agafonkin Permission to use, copy: MapLibre Native Android uses portions of Activity.\n"
                + "URL: https://developer.android.com\nLicense: The Apache Software License\n"
                + "* Redistributions of source code must retain the above copyright notice.\n* Redistributions in binary form"),
        ])
        XCTAssertTrue(Licenses.paragraphs("END OF TERMS AND CONDITIONS")[0].heading)
        XCTAssertFalse(Licenses.paragraphs("THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED.")[0].heading)
    }
}
