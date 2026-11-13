import SwiftUI

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7), as the web's: choose how hard and how long, answer,
// see how it went. Nothing about an attempt is saved (QUIZ-6); the tab keeps it while the app is open.

struct Attempt: Equatable {
    let difficulty: String
    var questions: [QuizQuestion]
    var index = 0
    /// What was picked, once the question is checked.
    var answers: [[String]] = []
    var verdict: QuizVerdict?

    var right: Int { answers.indices.filter { quizAnswerIsRight(questions[$0], picked: answers[$0]) }.count }
}

/// QUIZ-4: kept here so going back to More and in again doesn't lose an attempt; it goes when the app closes.
/// Not private, so the snapshot tests can open it at a question or the results.
@MainActor
@Observable
final class Kept {
    static let shared = Kept()
    var attempt: Attempt?
    var difficulty = "easy"
    var count = 10
}

struct QuizScreen: View {
    @Environment(AppGraph.self) private var graph
    @State private var bank: QuizBank?
    @State private var asking = false
    @Bindable private var kept = Kept.shared
    private var attempt: Attempt? {
        get { kept.attempt }
        nonmutating set { kept.attempt = newValue }
    }
    private var difficulty: String { kept.difficulty }
    private var count: Int { kept.count }

    private var step: String {
        guard let attempt else { return "setup" }
        return attempt.verdict != nil ? "results" : "q\(attempt.index)"
    }

    var body: some View {
        Page("Quiz") {
            Text("How well do you know the Laws of the Game?").font(.lfBodyMedium).foregroundStyle(LF.muted).padding(.bottom, 12)
            Group {
                if let bank {
                    content(bank).id(step)
                        // QUIZ-4: the next step comes in from the right as the last leaves to the left.
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .leading).combined(with: .opacity)))
                } else {
                    LfCard { LoadingPitch() }
                }
            }
            .animation(.easeOut(duration: 0.28), value: step)
        }
        .toolbar {
            if attempt != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if let attempt, attempt.verdict == nil, !attempt.answers.isEmpty { asking = true } else { startOver() }
                    } label: { PhIcon(.restart, tint: LF.brand, label: "Start over") }
                }
            }
        }
        .confirm("Start over?", isPresented: $asking, message: "This attempt's score goes, and you choose again.", action: "Start over", role: .destructive) { startOver() }
        .task {
            let store = QuizStore(api: graph.api)
            if bank == nil { bank = store.local() }
            if let fresh = await store.refresh() { bank = fresh }
        }
    }

    private func startOver() {
        withAnimation { attempt = nil }
    }

    @ViewBuilder
    private func content(_ bank: QuizBank) -> some View {
        if let current = attempt {
            if current.verdict != nil {
                QuizResults(bank: bank, attempt: current, again: {
                    withAnimation { attempt = Attempt(difficulty: current.difficulty, questions: pickQuiz(bank, difficulty: current.difficulty, count: current.questions.count)) }
                }, change: startOver)
            } else {
                QuizAsking(bank: bank, attempt: current, onAnswer: { picked in
                    withAnimation(.easeOut(duration: 0.22)) { attempt?.answers.append(picked) }
                }, onNext: {
                    withAnimation {
                        guard var a = attempt else { return }
                        if a.index + 1 >= a.questions.count {
                            a.verdict = quizVerdict(share: Double(a.right) / Double(a.questions.count))
                        } else {
                            a.index += 1
                        }
                        attempt = a
                    }
                })
            }
        } else {
            QuizSetup(bank: bank, difficulty: $kept.difficulty, count: $kept.count) {
                let available = quizPool(bank, difficulty: difficulty).count
                withAnimation { attempt = Attempt(difficulty: difficulty, questions: pickQuiz(bank, difficulty: difficulty, count: min(count, available))) }
            }
        }
    }
}

private struct QuizLabel: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.lfTitleSmall).tracking(0.8).foregroundStyle(LF.muted).padding(.bottom, 8)
    }
}

/// DESIGN.md "Choice tiles": outlined on the panel; the chosen one lit on the board, chalk on near
/// black with a hard drop (a mint edge at night).
private struct ChoiceTile: ViewModifier {
    let on: Bool
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 6)
        let dark = scheme == .dark
        content
            .background(on ? LF.board : LF.surface, in: shape)
            .overlay(shape.strokeBorder(on ? (dark ? LF.boardAccent : LF.board) : LF.borderInput, lineWidth: on ? 1 : 2))
            .hardDrop(on && !dark ? LF.board.opacity(0.35) : .clear, shape)
            .animation(.easeOut(duration: 0.15), value: on)
    }
}

extension View {
    fileprivate func choiceTile(_ on: Bool) -> some View { modifier(ChoiceTile(on: on)) }
}

private struct QuizSetup: View {
    let bank: QuizBank
    @Binding var difficulty: String
    @Binding var count: Int
    let start: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        let available = quizPool(bank, difficulty: difficulty).count
        LfCard(padding: 16) {
            QuizLabel(text: "How hard?")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible())], spacing: 8) {
                ForEach(quizDifficulties, id: \.value) { d in
                    let on = difficulty == d.value
                    Button { withAnimation(.easeOut(duration: 0.15)) { difficulty = d.value } } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(d.label.uppercased()).font(.lfHeadlineSmall).foregroundStyle(on ? LF.onBoardStrong : LF.text)
                            Text(d.sub).font(.lfBodySmall).foregroundStyle(on ? LF.onBoardMuted : LF.muted).multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
                        .choiceTile(on)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.bottom, 18)
            QuizLabel(text: "How many questions?")
            HStack(spacing: 8) {
                ForEach(quizCounts, id: \.self) { n in
                    let on = count == n
                    Button { withAnimation(.easeOut(duration: 0.15)) { count = n } } label: {
                        Text("\(n)").font(.lfHeadlineSmall).foregroundStyle(on ? LF.onBoardStrong : LF.text)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .choiceTile(on)
                    }
                    .buttonStyle(.plain)
                    .disabled(n > available)
                    .opacity(n > available ? 0.4 : 1)
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(.bottom, 18)
            PrimaryButton("Start the quiz", icon: .play, wide: true, action: start)
            Button {
                if let url = URL(string: bank.source.url) { openURL(url) }
            } label: {
                Text("Written for LawFive from the Laws of the Game \(bank.edition). Not official, and not endorsed by The IFAB.")
                    .font(.lfBodySmall).foregroundStyle(LF.muted).multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
        }
    }
}

private struct QuizAsking: View {
    let bank: QuizBank
    let attempt: Attempt
    let onAnswer: ([String]) -> Void
    let onNext: () -> Void
    @State private var picked: [String] = []
    @Environment(\.openURL) private var openURL

    var body: some View {
        let question = attempt.questions[attempt.index]
        let answered = attempt.answers.indices.contains(attempt.index) ? attempt.answers[attempt.index] : nil
        let multiple = question.type == "multiple"
        let last = attempt.index + 1 >= attempt.questions.count
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Question \(attempt.index + 1) of \(attempt.questions.count)").font(.lfBodyMedium).foregroundStyle(LF.muted)
                Spacer()
                Text("\(attempt.right)").font(.lfHeadlineSmall).foregroundStyle(LF.brandStrong).contentTransition(.numericText())
                Text("correct").font(.lfBodyMedium).foregroundStyle(LF.muted)
            }
            .padding(.bottom, 8)
            HStack(spacing: 4) {
                ForEach(attempt.questions.indices, id: \.self) { i in
                    let a = attempt.answers.indices.contains(i) ? attempt.answers[i] : nil
                    Capsule().fill(a.map { quizAnswerIsRight(attempt.questions[i], picked: $0) ? LF.brand : LF.red } ?? (i == attempt.index ? LF.muted : LF.border)).frame(height: 6)
                }
            }
            .padding(.bottom, 12)
            LfCard(padding: 16) {
                if multiple {
                    Chip("Select all that apply", tone: .blue).padding(.bottom, 10)
                }
                Text(question.question).font(.lfTitleLarge).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true).padding(.bottom, 14)
                ForEach(question.options, id: \.id) { option in
                    optionRow(option, multiple: multiple, answered: answered).padding(.bottom, 8)
                }
                if let answered {
                    let right = quizAnswerIsRight(question, picked: answered)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(right ? "Correct" : "Not quite").font(.lfHeadlineSmall).foregroundStyle(right ? LF.brandStrong : LF.redText)
                        if let reference = quizReference(bank, question) {
                            Button(reference.label) { if let url = URL(string: reference.url) { openURL(url) } }
                                .font(.lfBodySmall).foregroundStyle(LF.brandStrong).buttonStyle(.plain)
                        }
                    }
                    .padding(.top, 6)
                    .transition(.opacity)
                    .sensoryFeedback(right ? .success : .warning, trigger: answered)
                }
                Group {
                    if answered == nil {
                        PrimaryButton("Check answer", enabled: !picked.isEmpty, wide: true) { onAnswer(picked) }
                    } else {
                        PrimaryButton(last ? "See how you did" : "Next question", wide: true, action: onNext)
                    }
                }
                .padding(.top, 14)
            }
        }
    }

    private func optionRow(_ option: QuizOption, multiple: Bool, answered: [String]?) -> some View {
        let chosen = (answered ?? picked).contains(option.id)
        let state: String = answered == nil ? (chosen ? "picked" : "") : option.correct ? "right" : chosen ? "wrong" : "out"
        let background: Color = state == "right" ? LF.brandSoft : state == "wrong" ? LF.redSoft : LF.surface
        let edge: Color = state == "picked" || state == "right" ? LF.brand : state == "wrong" ? LF.red : LF.border
        let fill: Color = state == "picked" || state == "right" ? LF.brand : state == "wrong" ? LF.red : .clear
        return Button {
            guard answered == nil else { return }
            withAnimation(.easeOut(duration: 0.15)) {
                if multiple {
                    if chosen { picked.removeAll { $0 == option.id } } else { picked.append(option.id) }
                } else {
                    picked = [option.id]
                }
            }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .top, spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: multiple ? 5 : 10).fill(fill)
                        RoundedRectangle(cornerRadius: multiple ? 5 : 10).stroke(fill == .clear ? LF.muted : fill, lineWidth: 1.5)
                        if state == "picked" || state == "right" { PhIcon(.check, size: 13, tint: LF.onBrand) }
                        if state == "wrong" { PhIcon(.close, size: 13, tint: .white) }
                    }
                    .frame(width: 20, height: 20)
                    Text(option.text).font(.lfBodyLarge).foregroundStyle(LF.text).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                if answered != nil, option.correct || chosen {
                    Text((option.correct && multiple && !chosen ? "You missed this one. " : "") + option.explanation)
                        .font(.lfBodyMedium).foregroundStyle(LF.text).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 30)
                        .transition(.opacity)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(background, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(edge, lineWidth: state == "picked" ? 2 : 1))
            .opacity(state == "out" ? 0.6 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? .isSelected : [])
    }
}

private struct QuizResults: View {
    let bank: QuizBank
    let attempt: Attempt
    let again: () -> Void
    let change: () -> Void
    @State private var shown = 0
    @State private var filled = false
    @State private var width: CGFloat = 0
    @Environment(\.openURL) private var openURL

    var body: some View {
        let verdict = attempt.verdict
        let results: [(question: QuizQuestion, right: Bool)] = attempt.questions.indices.map { (attempt.questions[$0], quizAnswerIsRight(attempt.questions[$0], picked: attempt.answers[$0])) }
        let total = attempt.questions.count
        let share = CGFloat(attempt.right) / CGFloat(max(total, 1))
        // As Android's under 380 dp: the page's width less its margins.
        let narrow = width <= 338
        let level = quizDifficulties.first { $0.value == attempt.difficulty }?.label
        VStack(spacing: 0) {
            WidthReader(width: $width)
            // WEB-28: the score on a slab cut on the diagonal, a card dealt beside a low one; the Laws on a chalk panel's slab.
            Slab(title: "Your score", tag: [level, "\(total)\u{00A0}questions"].compactMap { $0 }.joined(separator: " · "), icon: .quiz, cut: true) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 14) {
                        FitFigure(figure: "\(shown)", unit: "/ \(total)", size: narrow ? 76 : 96, unitColor: LF.onBoardMuted, least: 40)
                            .contentTransition(.numericText())
                        // As long as the share right (at least a sliver), as the website's.
                        GeometryReader { geo in
                            SlantShape(left: 5, right: 5).fill(LF.boardAccent)
                                .frame(width: max(14, min(330, geo.size.width * 0.7) * share))
                        }
                        .frame(height: 12)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(attempt.right) of \(total) right")
                    if let card = verdict?.card {
                        CardShape(kind: card == "red" ? .red : .yellow, width: narrow ? 64 : 82, height: narrow ? 88 : 112)
                            .padding(.trailing, 6).padding(.top, 4)
                            .accessibilityHidden(true)
                    }
                }
                WordFit(text: (verdict?.title ?? "").uppercased(), face: .display, size: grown(34, .title2), color: LF.onBoardStrong)
                    .padding(.top, 22)
                    .accessibilityAddTraits(.isHeader)
                Text(verdict?.line ?? "").font(.barlow(15, .medium, relativeTo: .subheadline)).foregroundStyle(LF.muted)
                    .fixedSize(horizontal: false, vertical: true).padding(.top, 6)
                Flow(spacing: 10) {
                    PrimaryButton("Go again", icon: .restart, action: again)
                    SecondaryButton("Change the settings", action: change)
                }
                .padding(.top, 18)
            }
            .padding(.top, 12)
            Slab(title: "By Law", tag: "Weakest first", ground: .panel) {
                ForEach(quizByLaw(bank, results: results), id: \.law) { law in
                    Button { if let url = URL(string: law.url) { openURL(url) } } label: {
                        HStack(spacing: 10) {
                            Text("Law \(law.law): \(law.title)").font(.lfBodyMedium).foregroundStyle(LF.text).lineLimit(2)
                            Spacer(minLength: 0)
                            ZStack(alignment: .leading) {
                                Capsule().fill(LF.border)
                                Capsule().fill(LF.brand).frame(width: filled ? 60 * Double(law.right) / Double(law.total) : 0)
                            }
                            .frame(width: 60, height: 6)
                            Text("\(law.right)/\(law.total)").font(.lfTitleMedium).foregroundStyle(LF.text)
                        }
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 30)
            let missed = results.filter { !$0.right }.map(\.question)
            if !missed.isEmpty {
                LfCard(padding: 16) {
                    QuizLabel(text: "What you missed")
                    ForEach(missed, id: \.id) { q in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(q.question).font(.lfTitleMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                            ForEach(q.options.filter(\.correct), id: \.id) { o in
                                HStack(alignment: .top, spacing: 6) {
                                    PhIcon(.check, size: 14, tint: LF.brandStrong).padding(.top, 3)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(o.text).font(.lfBodyMedium).foregroundStyle(LF.text).fixedSize(horizontal: false, vertical: true)
                                        Text(o.explanation).font(.lfBodySmall).foregroundStyle(LF.muted).fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                            }
                            if let reference = quizReference(bank, q) {
                                Button(reference.label) { if let url = URL(string: reference.url) { openURL(url) } }
                                    .font(.lfBodySmall).foregroundStyle(LF.brandStrong).buttonStyle(.plain)
                            }
                        }
                        .padding(.bottom, 12)
                    }
                }
                .padding(.top, 24)
            }
        }
        .task {
            // The score counts up as it appears (WEB-1).
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(.easeOut(duration: 0.6)) { filled = true }
            for n in stride(from: 0, through: attempt.right, by: 1) {
                withAnimation(.snappy(duration: 0.2)) { shown = n }
                try? await Task.sleep(for: .milliseconds(70))
            }
        }
    }
}
