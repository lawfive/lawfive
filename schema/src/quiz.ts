import { z } from "zod";

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7). The questions are data, in schema/quiz/ (docs/QUIZ.md
// has the format), which the server serves, so a wrong answer can be fixed without an app release.
// What's here is shared by the server and the web app; the phone apps follow the same rules.

const text = z.string().min(1);

export const QuizOption = z
    .object({
        id: text,
        text,
        correct: z.boolean(),
        explanation: z.string().describe("Why this option is right or wrong; shown after answering."),
    })
    .meta({ id: "QuizOption" });

export const QuizRef = z
    .object({
        law: z.int().min(1).max(17).optional(),
        section: z.string().nullable().optional(),
        protocol: z.string().optional(),
    })
    .meta({ id: "QuizRef", description: "What a question is based on: a Law and section, or a protocol." });

export const QuizQuestion = z
    .object({
        id: text,
        status: z.string().describe("active, draft or retired; the API only sends active ones."),
        type: z.string().describe("single, multiple or true_false."),
        difficulty: z.string().describe("easy, medium or hard."),
        refs: z.array(QuizRef),
        tags: z.array(z.string()),
        question: text,
        options: z.array(QuizOption).min(2),
        editionAdded: z.string(),
        lastReviewed: z.string(),
    })
    .meta({ id: "QuizQuestion" });

export const QuizLaw = z.object({ law: z.int(), title: text, url: z.string() }).meta({ id: "QuizLaw" });
export const QuizProtocol = z
    .object({ id: text, title: text, relatedLaws: z.array(z.int()), url: z.string().nullable() })
    .meta({ id: "QuizProtocol" });

export const QuizBank = z
    .object({
        schemaVersion: z.int(),
        language: z.string(),
        edition: z.string(),
        effectiveDate: z.string(),
        source: z.object({ title: z.string(), url: z.string() }),
        laws: z.array(QuizLaw),
        protocols: z.array(QuizProtocol),
        questions: z.array(QuizQuestion),
    })
    .meta({ id: "QuizBank", description: "The Laws of the Game quiz's questions in one language." });

export type QuizBank = z.infer<typeof QuizBank>;
export type QuizQuestion = z.infer<typeof QuizQuestion>;

export const quizDifficulties = ["easy", "medium", "hard", "mixed"] as const;
export type QuizDifficulty = (typeof quizDifficulties)[number];
export const quizCounts = [5, 10, 15, 20] as const;

const shuffled = <T>(items: readonly T[], random: () => number): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
};

/** The questions at this difficulty ("mixed" for all of them). */
export const quizPool = (bank: QuizBank, difficulty: QuizDifficulty) =>
    bank.questions.filter((q) => q.status === "active" && (difficulty === "mixed" || q.difficulty === difficulty));

/** QUIZ-2: an attempt's questions, at random, with their options shuffled too, except true or false. */
export function pickQuiz(bank: QuizBank, difficulty: QuizDifficulty, count: number, random: () => number = Math.random): QuizQuestion[] {
    return shuffled(quizPool(bank, difficulty), random)
        .slice(0, count)
        .map((q) => (q.type === "true_false" ? q : { ...q, options: shuffled(q.options, random) }));
}

/** Right only with every correct option and no others (a "multiple" question's rule goes for all). */
export function quizAnswerIsRight(question: QuizQuestion, picked: readonly string[]): boolean {
    const right = question.options.filter((o) => o.correct).map((o) => o.id);
    return right.length === picked.length && right.every((id) => picked.includes(id));
}

/** "Law 12.4 – Fouls and Misconduct", or a protocol's title, with where to read it. */
export function quizReference(bank: QuizBank, question: QuizQuestion): { label: string; url: string } | undefined {
    const ref = question.refs[0];
    if (ref?.protocol) {
        const protocol = bank.protocols.find((p) => p.id === ref.protocol);
        if (!protocol) {
            return undefined;
        }
        const url = protocol.url ?? bank.laws.find((l) => l.law === protocol.relatedLaws[0])?.url;
        return url ? { label: protocol.title, url } : undefined;
    }
    const law = bank.laws.find((l) => l.law === ref?.law);
    if (!law) {
        return undefined;
    }
    return { label: `Law ${law.law}${ref?.section ? `.${ref.section}` : ""} – ${law.title}`, url: law.url };
}

/**
 * QUIZ-5: how it went, from the score as a share of 1. Each has a few things to say, one chosen at
 * random; the lower ones tease a little. The phone apps keep the same list (Quiz.kt, Quiz.swift).
 */
export const quizVerdicts = [
    { from: 1, title: "Flawless", card: undefined, lines: ["Full marks. Not one decision to review.", "Perfect. The assessor put their pen down halfway through."] },
    { from: 0.8, title: "Great", card: undefined, lines: ["That's a top-marks assessment. Book the final.", "You clearly read the Laws, and not just the bit about offside."] },
    { from: 0.6, title: "Solid", card: undefined, lines: ["Good enough for the middle, with a quick read before kickoff.", "A safe pair of hands, and a few missed calls nobody saw."] },
    { from: 0.4, title: "Needs improvement", card: "yellow", lines: ["The assessor has a few notes. It's a long few notes.", "Consider this a caution. The Laws are free to read."] },
    { from: 0.2, title: "Rough day", card: "yellow", lines: ["Somewhere, a U10 coach is saying they could've told you that.", "Even the parents behind the rope are checking the rulebook now."] },
    { from: 0, title: "Sent off", card: "red", lines: ["Straight red. Did you read the Laws, or just the team sheet?", "Bold answers. Wrong, but bold. See you at the refresher course."] },
] as const;

export function quizVerdict(share: number, random: () => number = Math.random) {
    const verdict = quizVerdicts.find((v) => share >= v.from) ?? quizVerdicts[quizVerdicts.length - 1]!;
    return { title: verdict.title, card: verdict.card as "yellow" | "red" | undefined, line: verdict.lines[Math.floor(random() * verdict.lines.length)]! };
}

/** QUIZ-5: how an attempt went per Law, weakest first, from each question's main reference. */
export function quizByLaw(bank: QuizBank, results: readonly { question: QuizQuestion; right: boolean }[]) {
    const laws = new Map<number, { law: number; title: string; url: string; right: number; total: number }>();
    for (const { question, right } of results) {
        const ref = question.refs[0];
        const number = ref?.law ?? bank.protocols.find((p) => p.id === ref?.protocol)?.relatedLaws[0];
        const law = bank.laws.find((l) => l.law === number);
        if (law) {
            const row = laws.get(law.law) ?? { law: law.law, title: law.title, url: law.url, right: 0, total: 0 };
            row.total += 1;
            row.right += right ? 1 : 0;
            laws.set(law.law, row);
        }
    }
    return [...laws.values()].sort((a, b) => a.right / a.total - b.right / b.total || a.law - b.law);
}
