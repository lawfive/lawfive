import XCTest
@testable import LawFive

// WEB-20: the officials on one line, as the website's next match and the phones' rows show them.
final class OfficialsLineTests: XCTestCase {
    private let referees = [
        "r1": Referee(id: "r1", version: 1, updatedAt: "2026-11-03T00:00:00Z", name: "Sam  Rivera "),
        "r2": Referee(id: "r2", version: 1, updatedAt: "2026-11-03T00:00:00Z", name: "Pelé"),
        "r3": Referee(id: "r3", version: 1, updatedAt: "2026-11-03T00:00:00Z", name: "Samuel Rivera", shortName: " Sammy "),
    ]

    private func line(role: String?, _ crew: [CrewMember]) -> String {
        var m = Match(id: "m1", version: 1, updatedAt: "2026-11-03T00:00:00Z", status: "scheduled", format: defaultFormat, home: Team(), away: Team(), crew: crew)
        m.role = role
        return officialsLine(m) { id in id.flatMap { referees[$0] } }.map { "\($0.role) \($0.who)" }.joined(separator: " · ")
    }

    func testInOrderWithSurnamesTypedNamesAndYou() {
        XCTAssertEqual(line(role: "referee", [CrewMember(role: "ar2", name: "Club linesman"), CrewMember(role: "ar1", refereeId: "r1")]),
                       "Ref you · AR1 Rivera · AR2 Club linesman")
        XCTAssertEqual(line(role: "ar2", [CrewMember(role: "fourth", refereeId: "r2"), CrewMember(role: "referee", name: "Ana Ruiz")]),
                       "Ref Ana Ruiz · AR2 you · 4th Pelé")
    }

    func testAShortNameOfTheirOwnComesFirst() {
        XCTAssertEqual(line(role: nil, [CrewMember(role: "referee", refereeId: "r3")]), "Ref Sammy")
    }

    func testSurnamesFromNamesAsSchedulesWriteThem() {
        let cases: [(String, String)] = [
            ("Sam Rivera", "Rivera"), ("Sam  Rivera ", "Rivera"), ("Pelé", "Pelé"), ("Mary-Kate Smith-Jones", "Smith-Jones"),
            ("Sam Rivera (Grade 7)", "Rivera"), ("Sam Rivera [USSF 8]", "Rivera"), ("Sam Rivera (Grade", "Rivera"), ("Sam Rivera - Grade 7", "Rivera"),
            ("Rivera, Sam", "Rivera"), ("Rivera, Sam (Grade 7)", "Rivera"), ("RIVERA, SAM", "RIVERA"),
            ("Sam Rivera Jr.", "Rivera"), ("Sam Rivera, Jr.", "Rivera"), ("Sam Rivera III", "Rivera"), ("Rivera Jr., Sam", "Rivera"),
            ("Maria de la Cruz", "de la Cruz"), ("de la Cruz, Maria", "de la Cruz"), ("Ludwig van Beethoven", "van Beethoven"), ("Van Morrison", "Morrison"),
            ("(Grade 7)", "(Grade 7)"), ("  ", ""),
        ]
        for (name, expected) in cases {
            XCTAssertEqual(surname(name), expected, name)
        }
    }

    func testNobodyToShow() {
        XCTAssertEqual(line(role: nil, []), "")
        XCTAssertEqual(line(role: nil, [CrewMember(role: "ar1", refereeId: "gone")]), "", "a referee no longer saved is left out")
    }
}
