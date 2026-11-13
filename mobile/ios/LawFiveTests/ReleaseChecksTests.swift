import XCTest
@testable import LawFive

// IOS-2, IOS-11: what App Review looks at, as built into the app.
final class ReleaseChecksTests: XCTestCase {
    private let app = Bundle(for: AppGraph.self)

    func testPlainHttpOnlyOnTheLocalNetwork() throws {
        let ats = try XCTUnwrap(app.object(forInfoDictionaryKey: "NSAppTransportSecurity") as? [String: Any])
        XCTAssertEqual(ats["NSAllowsLocalNetworking"] as? Bool, true)
        XCTAssertNil(ats["NSAllowsArbitraryLoads"], "plain http to anywhere would need explaining to App Review")
    }

    func testPrivacyManifestIsBuiltIn() throws {
        let url = try XCTUnwrap(app.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let manifest = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
        let apis = try XCTUnwrap(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        XCTAssertTrue(apis.contains { $0["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults" })
    }

    func testOnlyExemptEncryptionIsDeclared() {
        XCTAssertEqual(app.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)
    }

    func testEveryPermissionSaysWhy() {
        for key in ["NSCameraUsageDescription", "NSLocalNetworkUsageDescription", "NSBluetoothAlwaysUsageDescription"] {
            XCTAssertFalse((app.object(forInfoDictionaryKey: key) as? String ?? "").isEmpty, key)
        }
    }

    func testBackgroundFetchIsDeclaredForTheTaskItRuns() throws {
        let modes = try XCTUnwrap(app.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])
        XCTAssertEqual(modes, ["fetch", "bluetooth-central"])
        let tasks = try XCTUnwrap(app.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String])
        XCTAssertEqual(tasks, [AppGraph.backgroundTask])
    }
}
