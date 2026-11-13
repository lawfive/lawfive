import Foundation

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7), by the same rules as schema/src/quiz.ts. The questions
// come from the server when it can be reached; otherwise the last copy, else the one built in, so
// it works at a ground without signal.

struct QuizStore {
    let api: Api

    private var cache: URL {
        URL.applicationSupportDirectory.appending(path: "quiz-en.json")
    }

    /// The last copy from the server, else the one built in.
    func local() -> QuizBank? {
        if let data = try? Data(contentsOf: cache), let bank = try? jsonDecoder.decode(QuizBank.self, from: data) { return bank }
        guard let url = Bundle.main.url(forResource: "questions-en", withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
        return try? jsonDecoder.decode(QuizBank.self, from: data)
    }

    /// The server's questions, kept for next time; nil with no signal, or a server without them.
    func refresh() async -> QuizBank? {
        guard let answer = try? await api.call("GET", "/v1/quiz"), let bank: QuizBank = try? answer.decoded(), let data = try? jsonEncoder.encode(bank) else { return nil }
        try? FileManager.default.createDirectory(at: URL.applicationSupportDirectory, withIntermediateDirectories: true)
        try? data.write(to: cache)
        return bank
    }
}

let quizDifficulties: [(value: String, label: String, sub: String)] = [
    ("easy", "Easy", "The basics of the Laws"),
    ("medium", "Medium", "For referees with a few seasons in"),
    ("hard", "Hard", "The ones that catch people out"),
    ("mixed", "Mixed", "A bit of everything"),
]
let quizCounts = [5, 10, 15, 20]

func quizPool(_ bank: QuizBank, difficulty: String) -> [QuizQuestion] {
    bank.questions.filter { $0.status == "active" && (difficulty == "mixed" || $0.difficulty == difficulty) }
}

/// QUIZ-2: an attempt's questions, at random, with their options shuffled too, except true or false.
func pickQuiz(_ bank: QuizBank, difficulty: String, count: Int) -> [QuizQuestion] {
    quizPool(bank, difficulty: difficulty).shuffled().prefix(count).map { q in
        var out = q
        if q.type != "true_false" { out.options = q.options.shuffled() }
        return out
    }
}

/// Right only with every correct option and no others.
func quizAnswerIsRight(_ question: QuizQuestion, picked: [String]) -> Bool {
    Set(question.options.filter(\.correct).map(\.id)) == Set(picked)
}

/// "Law 12.4 – Fouls and Misconduct", or a protocol's title, with where to read it.
func quizReference(_ bank: QuizBank, _ question: QuizQuestion) -> (label: String, url: String)? {
    guard let ref = question.refs.first else { return nil }
    if let id = ref.protocol {
        guard let protocolEntry = bank.protocols.first(where: { $0.id == id }) else { return nil }
        guard let url = protocolEntry.url ?? bank.laws.first(where: { $0.law == protocolEntry.relatedLaws.first })?.url else { return nil }
        return (protocolEntry.title, url)
    }
    guard let law = bank.laws.first(where: { $0.law == ref.law }) else { return nil }
    return ("Law \(law.law)\(ref.section.map { ".\($0)" } ?? "") – \(law.title)", law.url)
}

struct QuizVerdict: Hashable {
    let title: String
    let line: String
    let card: String?
}

/// QUIZ-5: the same list as schema/src/quiz.ts's quizVerdicts (a test checks).
let quizVerdicts: [(from: Double, title: String, card: String?, lines: [String])] = [
    (1, "Flawless", nil, ["Full marks. Not one decision to review.", "Perfect. The assessor put their pen down halfway through."]),
    (0.8, "Great", nil, ["That's a top-marks assessment. Book the final.", "You clearly read the Laws, and not just the bit about offside."]),
    (0.6, "Solid", nil, ["Good enough for the middle, with a quick read before kickoff.", "A safe pair of hands, and a few missed calls nobody saw."]),
    (0.4, "Needs improvement", "yellow", ["The assessor has a few notes. It's a long few notes.", "Consider this a caution. The Laws are free to read."]),
    (0.2, "Rough day", "yellow", ["Somewhere, a U10 coach is saying they could've told you that.", "Even the parents behind the rope are checking the rulebook now."]),
    (0, "Sent off", "red", ["Straight red. Did you read the Laws, or just the team sheet?", "Bold answers. Wrong, but bold. See you at the refresher course."]),
]

func quizVerdict(share: Double) -> QuizVerdict {
    let v = quizVerdicts.first { share >= $0.from } ?? quizVerdicts[quizVerdicts.count - 1]
    return QuizVerdict(title: v.title, line: v.lines.randomElement() ?? "", card: v.card)
}

struct QuizLawRow: Hashable {
    let law: Int
    let title: String
    let url: String
    var right: Int
    var total: Int
}

/// QUIZ-5: how an attempt went per Law, weakest first, from each question's main reference.
func quizByLaw(_ bank: QuizBank, results: [(question: QuizQuestion, right: Bool)]) -> [QuizLawRow] {
    var rows: [Int: QuizLawRow] = [:]
    for (question, right) in results {
        let ref = question.refs.first
        let number = ref?.law ?? bank.protocols.first(where: { $0.id == ref?.protocol })?.relatedLaws.first
        guard let law = bank.laws.first(where: { $0.law == number }) else { continue }
        var row = rows[law.law] ?? QuizLawRow(law: law.law, title: law.title, url: law.url, right: 0, total: 0)
        row.total += 1
        row.right += right ? 1 : 0
        rows[law.law] = row
    }
    return rows.values.sorted {
        let a = Double($0.right) / Double($0.total), b = Double($1.right) / Double($1.total)
        return a == b ? $0.law < $1.law : a < b
    }
}
