import XCTest
@testable import LawFive

// A new account's settings before it has a record (the website's defaults, the first change making
// the record), and the first sync after signing in told by its own flag, not by the cursor.

@MainActor
final class SettingsAndSessionTests: XCTestCase {
    private func defaults(_ id: String) -> UserSettings { SettingsDefaults.settings(for: Locale(identifier: id), id: "x") }

    func testDefaultsFollowTheRegionAsTheWebsites() {
        let us = defaults("en_US")
        XCTAssertEqual([us.distanceUnit, us.temperatureUnit, us.currency, us.misconductScheme], ["mi", "f", "USD", "ussf"])
        let gb = defaults("en_GB")
        XCTAssertEqual([gb.distanceUnit, gb.temperatureUnit, gb.currency, gb.misconductScheme], ["km", "c", "GBP", "fa"])
        let de = defaults("de_DE")
        XCTAssertEqual([de.distanceUnit, de.temperatureUnit, de.currency, de.misconductScheme], ["km", "c", "EUR", "ifab"])
        let ca = defaults("fr_CA")
        XCTAssertEqual([ca.distanceUnit, ca.temperatureUnit, ca.currency, ca.misconductScheme], ["km", "c", "CAD", "ifab"])
        let jp = defaults("ja_JP")
        XCTAssertEqual([jp.distanceUnit, jp.temperatureUnit, jp.currency, jp.misconductScheme], ["km", "c", "JPY", "ifab"])
        XCTAssertEqual(defaults("de").currency, "EUR", "a language alone takes its likeliest region")
    }

    func testTheFirstChangeMakesTheRecordWithThePhonesTimeZone() async {
        let db = Db(file: nil)
        let records = Records(db: db)
        await records.reload()
        XCTAssertNil(records.settings)
        let shown = records.effectiveSettings
        XCTAssertEqual(records.effectiveSettings.id, shown.id, "the defaults keep their id")
        await records.saveSettings { $0.distanceUnit = "km" }
        let saved = await db.all(Collections.settings)
        XCTAssertEqual(saved.map(\.id), [shown.id])
        XCTAssertEqual(records.settings?.timeZone, TimeZone.current.identifier)
        XCTAssertEqual(records.settings?.distanceUnit, "km")
        let queued = await db.outboxCount()
        XCTAssertEqual(queued, 1, "queued for the server")
        // A second change, straight after: the same record, with both.
        await records.saveSettings { $0.temperatureUnit = "f" }
        let after = await db.all(Collections.settings)
        XCTAssertEqual(after.map(\.id), [shown.id])
        XCTAssertEqual(records.settings?.distanceUnit, "km")
        XCTAssertEqual(records.settings?.temperatureUnit, "f")
    }

    func testTwoQuickChangesBuildOnEachOther() async {
        let db = Db(file: nil)
        let records = Records(db: db)
        await records.reload()
        async let a: Void = records.saveSettings { $0.distanceUnit = "mi" }
        async let b: Void = records.saveSettings { $0.mapsApp = "google" }
        _ = await (a, b)
        let rows = await db.all(Collections.settings)
        XCTAssertEqual(rows.count, 1, "one record, not two")
        XCTAssertEqual(records.settings?.distanceUnit, "mi")
        XCTAssertEqual(records.settings?.mapsApp, "google")
    }

    func testTheFirstSyncIsToldByItsOwnFlag() {
        let token = Keychain.read()
        defer { Keychain.write(token) }
        let suite = "SettingsAndSessionTests"
        let store = UserDefaults(suiteName: suite)!
        store.removePersistentDomain(forName: suite)
        store.set(true, forKey: "installed")
        defer { store.removePersistentDomain(forName: suite) }
        XCTAssertFalse(SessionStore(defaults: store).firstSync, "an install from before the flag isn't in its first sync")
        let session = SessionStore(defaults: store)
        session.signedIn(server: "https://example.com", token: "t", userId: "u", name: "Sam", email: "sam@example.com", status: "active")
        XCTAssertTrue(session.firstSync)
        session.synced(cursor: 0, at: Date())
        XCTAssertTrue(session.firstSync, "a page pulled isn't the end of it")
        XCTAssertTrue(SessionStore(defaults: store).firstSync, "kept through the app closing")
        session.firstSyncDone()
        XCTAssertFalse(session.firstSync, "done, even with nothing pulled and the cursor still 0")
        XCTAssertFalse(SessionStore(defaults: store).firstSync)
        session.signedIn(server: "https://example.com", token: "t", userId: "u", name: "Sam", email: "sam@example.com", status: "active")
        session.signedOut()
        XCTAssertFalse(session.firstSync)
        XCTAssertFalse(SessionStore(defaults: store).firstSync)
    }
}
