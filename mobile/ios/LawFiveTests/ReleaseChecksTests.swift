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

    /// PUSH-5, NOTE-3: the notification service extension is in the app, with its own privacy manifest and the app's version, as App Store Connect wants.
    func testTheNotificationServiceExtensionIsBuiltIn() throws {
        let ext = try XCTUnwrap(app.builtInPlugInsURL.flatMap { Bundle(url: $0.appending(path: "LawFiveNotifications.appex")) })
        let point = (ext.object(forInfoDictionaryKey: "NSExtension") as? [String: Any])?["NSExtensionPointIdentifier"] as? String
        XCTAssertEqual(point, "com.apple.usernotifications.service")
        for key in ["CFBundleShortVersionString", "CFBundleVersion"] {
            XCTAssertEqual(ext.object(forInfoDictionaryKey: key) as? String, app.object(forInfoDictionaryKey: key) as? String, key)
        }
        let url = try XCTUnwrap(ext.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let manifest = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        XCTAssertEqual(manifest["NSPrivacyTracking"] as? Bool, false)
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
        // IOS-9: Bluetooth only in a build with the Garmin bridge (tools/garmin-bridge.sh).
        XCTAssertEqual(modes, WatchBridge.included ? ["fetch", "bluetooth-central"] : ["fetch"])
        let tasks = try XCTUnwrap(app.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String])
        XCTAssertEqual(tasks, [AppGraph.backgroundTask])
    }
}
