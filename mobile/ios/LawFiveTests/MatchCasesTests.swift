import XCTest
@testable import LawFive

// WCH-2, UI-27: the match screen setup's pictures read the clocks as the watches do, by the shared screen
// cases (schema/match-cases/screen.json, here as MatchCases.swift), which the watches' engines run too.
final class MatchCasesTests: XCTestCase {
    private struct Cases: Decodable { var screen: [ScreenCase] }
    private struct ScreenCase: Decodable {
        struct At: Decodable {
            var phase: String
            var period: Int
            var elapsed: Int64
            var stoppage: Int64
            var stoppageRunning: Bool
            var halfwayBreak: String?
            var breakStarted: Int64?
        }
        /** A JSON value, so null (shows nothing there) isn't taken for a field left out. */
        enum Value: Decodable, Equatable {
            case null, bool(Bool), number(Double), text(String), object([String: Value])
            init(from decoder: Decoder) throws {
                let c = try decoder.singleValueContainer()
                if c.decodeNil() { self = .null }
                else if let b = try? c.decode(Bool.self) { self = .bool(b) }
                else if let n = try? c.decode(Double.self) { self = .number(n) }
                else if let t = try? c.decode(String.self) { self = .text(t) }
                else { self = .object(try c.decode([String: Value].self)) }
            }
        }
        var name: String
        var screen: [String: String]
        var tracked: Bool
        var at: At
        var expect: [String: Value]
    }

    // The pictures' halfway break: 2 minutes, due at 21:30.
    private let breakDue: Int64 = (21 * 60 + 30) * 1000
    private let breakLength: Int64 = 2 * 60 * 1000

    func testScreenCases() throws {
        let cases = try JSONDecoder().decode(Cases.self, from: Data(matchCasesJSON.utf8)).screen
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            var setup = ScreenSetup()
            if let v = c.screen["clocks"] { setup.clocks = v }
            if let v = c.screen["mainClock"] { setup.mainClock = v }
            if let v = c.screen["secondClock"] { setup.secondClock = v }
            if let v = c.screen["breakClock"] { setup.breakClock = v }
            var moment = MatchMoment(halftime: c.at.phase == "halftime", period: c.at.period, elapsedMs: c.at.elapsed, stoppageMs: c.at.stoppage, stoppageRunning: c.at.stoppageRunning)
            switch c.at.halfwayBreak {
            case "coming": moment.breakDueInMs = breakDue - c.at.elapsed
            case "due": moment.breakDue = true
            case "running": moment.breakLeftMs = breakLength - (c.at.elapsed - (c.at.breakStarted ?? 0))
            default: break
            }
            let shown = WatchPreview.screenAt(setup, moment, tracked: c.tracked)
            let text = { (t: String?) in t.map { ScreenCase.Value.text($0) } ?? .null }
            let pill = { (p: ScreenPill?) in p.map { ScreenCase.Value.object(["text": .text($0.text), "solid": .bool($0.solid)]) } ?? .null }
            for (key, expected) in c.expect {
                let what = "\(c.name): \(key)"
                switch key {
                case "clock": XCTAssertEqual(text(shown.clock), expected, what)
                case "second": XCTAssertEqual(text(shown.second), expected, what)
                case "added": XCTAssertEqual(text(shown.added), expected, what)
                case "progress":
                    guard case .number(let n) = expected else { XCTFail(what); continue }
                    XCTAssertEqual(shown.progress, n, accuracy: 0.0001, what)
                case "stoppage": XCTAssertEqual(pill(shown.stoppage), expected, what)
                case "breakPill": XCTAssertEqual(pill(shown.breakPill), expected, what)
                case "breakClock": XCTAssertEqual(text(shown.breakClock), expected, what)
                default: XCTFail("\(what): not something the pictures show")
                }
            }
        }
    }
}
