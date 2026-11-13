import XCTest
@testable import LawFive

// QUIZ-1 to QUIZ-5: the same rules as schema/test/quiz.test.ts, on the real questions built in.
@MainActor
final class QuizTests: XCTestCase {
    private func bank() throws -> QuizBank {
        let url = try XCTUnwrap(Bundle(for: AppGraph.self).url(forResource: "questions-en", withExtension: "json"))
        return try jsonDecoder.decode(QuizBank.self, from: Data(contentsOf: url))
    }

    func testPicksAtRandomAtTheDifficulty() throws {
        let b = try bank()
        let quiz = pickQuiz(b, difficulty: "easy", count: 10)
        XCTAssertEqual(quiz.count, 10)
        XCTAssertEqual(Set(quiz.map(\.id)).count, 10)
        XCTAssertTrue(quiz.allSatisfy { $0.difficulty == "easy" })
        XCTAssertNotEqual(pickQuiz(b, difficulty: "hard", count: 20).map(\.id), pickQuiz(b, difficulty: "hard", count: 20).map(\.id))
        for q in pickQuiz(b, difficulty: "mixed", count: 500) where q.type == "true_false" {
            XCTAssertEqual(q.options.map(\.text), ["True", "False"])
        }
    }

    func testRightOnlyWithAllTheCorrectOptions() throws {
        let q = try XCTUnwrap(try bank().questions.first { $0.type == "multiple" })
        let right = q.options.filter(\.correct).map(\.id)
        XCTAssertTrue(quizAnswerIsRight(q, picked: right))
        XCTAssertTrue(quizAnswerIsRight(q, picked: right.reversed()))
        XCTAssertFalse(quizAnswerIsRight(q, picked: Array(right.dropFirst())))
        if let wrong = q.options.first(where: { !$0.correct }) {
            XCTAssertFalse(quizAnswerIsRight(q, picked: right + [wrong.id]))
        }
    }

    func testEveryQuestionHasAReference() throws {
        let b = try bank()
        for q in b.questions { XCTAssertNotNil(quizReference(b, q), q.id) }
    }

    func testVerdictAndWeakestLaw() throws {
        XCTAssertEqual(quizVerdict(share: 1).title, "Flawless")
        XCTAssertEqual(quizVerdict(share: 0.79).title, "Solid")
        XCTAssertEqual(quizVerdict(share: 0).card, "red")
        let b = try bank()
        let a = try XCTUnwrap(b.questions.first { $0.refs.first?.law == 11 })
        let c = try XCTUnwrap(b.questions.first { $0.refs.first?.law == 12 })
        XCTAssertEqual(quizByLaw(b, results: [(a, true), (c, false)]).map(\.law), [12, 11])
    }
}
