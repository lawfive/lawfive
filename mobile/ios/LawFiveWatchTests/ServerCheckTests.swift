import XCTest
@testable import LawFiveWatch

// SYNC-9: a typed server address is kept only once LawFive answers GET /v1/meta there, as on Garmin.

final class ServerCheckTests: XCTestCase {
    func testLawFiveIsFound() {
        XCTAssertNil(serverProblem(product: "LawFive", status: nil, reached: true))
    }

    func testAnythingElseThatAnswersIsNoLawFiveServer() {
        XCTAssertEqual(serverProblem(product: nil, status: nil, reached: true), "No LawFive server there")
        XCTAssertEqual(serverProblem(product: "Something else", status: nil, reached: true), "No LawFive server there")
        XCTAssertEqual(serverProblem(product: nil, status: 404, reached: true), "No LawFive server there")
        XCTAssertEqual(serverProblem(product: nil, status: 503, reached: true), "The server said no (503)")
    }

    func testNothingAnsweringSaysSo() {
        XCTAssertEqual(serverProblem(product: nil, status: nil, reached: false), "Can't reach the server")
    }
}
