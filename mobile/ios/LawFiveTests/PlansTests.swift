import XCTest
@testable import LawFive

// PLAN-6: the account's plan in the same words as the website's Settings and the Android app.
final class PlansTests: XCTestCase {
    private let usage = PlanUsage(matches: 40, referees: 3, venues: 2, storageMb: 512.5, devices: 1, pushPerDay: 0, apiKeys: 0, apiCallsPerDay: 12, webhooks: 0)
    private func plan(_ limits: PlanLimits, endsOn: String? = nil) -> AccountPlan {
        AccountPlan(plan: PlanName(code: "pro", name: "Pro"), limits: limits, since: "2026-11-02T10:00:00Z", endsOn: endsOn, then: endsOn.map { _ in PlanName(code: "free", name: "Free") }, usage: usage)
    }

    func testTheLimitsAPlanSetsAndStorageAlways() {
        XCTAssertEqual(planLines(plan(PlanLimits(matches: 50, storageMb: 2048, apiCallsPerMinute: 120, webhooks: 0))), [
            PlanLine(label: "Matches", figure: "40", of: "of 50", share: 0.8),
            PlanLine(label: "Photos and tracks", figure: "512.5 MB", of: "of 2 GB", share: 512.5 / 2048),
            PlanLine(label: "API requests a minute", figure: "120", of: "at most", share: nil),
            PlanLine(label: "Webhooks", figure: "0", of: "of none", share: 1),
        ])
        XCTAssertEqual(planLines(plan(PlanLimits())), [PlanLine(label: "Photos and tracks", figure: "512.5 MB", of: nil, share: nil)])
    }

    func testWhenAPlanEndsAndWhatFollows() {
        let today = ISO8601DateFormatter().date(from: "2026-11-02T12:00:00Z")!
        XCTAssertEqual(planEnd(plan(PlanLimits(), endsOn: "2026-11-08"), today: today), "Until Sun, Nov 8, then Free")
        XCTAssertEqual(planEnd(plan(PlanLimits(), endsOn: "2027-01-08"), today: today), "Until Fri, Jan 8, 2027, then Free")
        XCTAssertNil(planEnd(plan(PlanLimits())))
    }
}
