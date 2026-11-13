import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { QuizBank, pickQuiz, quizAnswerIsRight, quizByLaw, quizReference, quizVerdict } from "../src/index.ts";

const folder = new URL("../quiz/", import.meta.url);
const files = readdirSync(folder).filter((f) => f.endsWith(".json"));
const bank = QuizBank.parse(JSON.parse(readFileSync(new URL("questions-en.json", folder), "utf8")));

test("every question file follows its format and rules", () => {
    assert.ok(files.includes("questions-en.json"));
    for (const file of files) {
        const b = QuizBank.parse(JSON.parse(readFileSync(new URL(file, folder), "utf8")));
        assert.equal(file, `questions-${b.language}.json`);
        assert.equal(new Set(b.questions.map((q) => q.id)).size, b.questions.length, "ids are unique");
        for (const q of b.questions) {
            const correct = q.options.filter((o) => o.correct).length;
            assert.ok(["single", "multiple", "true_false"].includes(q.type), q.id);
            assert.ok(["easy", "medium", "hard"].includes(q.difficulty), q.id);
            assert.ok(["active", "draft", "retired"].includes(q.status), q.id);
            assert.ok(q.type === "multiple" ? correct >= 2 : correct === 1, `${q.id} has ${correct} correct`);
            if (q.type === "true_false") {
                assert.deepEqual(q.options.map((o) => o.text), ["True", "False"], q.id);
            }
            assert.ok(quizReference(b, q), `${q.id} has a reference`);
        }
    }
});

test("the iPhone's bundled copy is the same as the file here (run pnpm generate)", () => {
    const copy = new URL("../../mobile/ios/LawFive/Resources/questions-en.json", import.meta.url);
    assert.equal(readFileSync(copy, "utf8"), readFileSync(new URL("questions-en.json", folder), "utf8"));
});

test("a quiz is random, at the difficulty chosen, with no repeats and true or false in order", () => {
    const quiz = pickQuiz(bank, "easy", 10);
    assert.equal(quiz.length, 10);
    assert.equal(new Set(quiz.map((q) => q.id)).size, 10);
    assert.ok(quiz.every((q) => q.difficulty === "easy"));
    assert.equal(pickQuiz(bank, "mixed", 500).length, bank.questions.length);
    for (const q of pickQuiz(bank, "mixed", 500)) {
        if (q.type === "true_false") {
            assert.deepEqual(q.options.map((o) => o.text), ["True", "False"]);
        }
    }
    const order = () => pickQuiz(bank, "hard", 20).map((q) => q.id).join();
    assert.notEqual(order(), order());
    bank.questions.push({ ...bank.questions[0]!, id: "RETIRED", status: "retired" });
    assert.ok(!pickQuiz(bank, "mixed", 500).some((q) => q.id === "RETIRED"), "only active questions");
    bank.questions.pop();
});

test("an answer is right only with every correct option and no others", () => {
    const multiple = bank.questions.find((q) => q.type === "multiple")!;
    const right = multiple.options.filter((o) => o.correct).map((o) => o.id);
    assert.ok(quizAnswerIsRight(multiple, right));
    assert.ok(quizAnswerIsRight(multiple, [...right].reverse()));
    assert.ok(!quizAnswerIsRight(multiple, right.slice(1)), "not with one missing");
    const wrong = multiple.options.find((o) => !o.correct);
    if (wrong) {
        assert.ok(!quizAnswerIsRight(multiple, [...right, wrong.id]), "not with a wrong one too");
    }
});

test("a reference names the Law and section, or the protocol", () => {
    const q = bank.questions.find((x) => x.refs[0]?.section && x.refs[0]?.law)!;
    assert.match(quizReference(bank, q)!.label, /^Law \d+\.\S+ – /);
    const protocol = bank.questions.find((x) => x.refs[0]?.protocol);
    if (protocol) {
        assert.ok(quizReference(bank, protocol)!.url.startsWith("http"));
    }
});

test("the verdict follows the score, and the weakest Law comes first", () => {
    assert.equal(quizVerdict(1).title, "Flawless");
    assert.equal(quizVerdict(0.8).title, "Great");
    assert.equal(quizVerdict(0.79).title, "Solid");
    assert.equal(quizVerdict(0.5).title, "Needs improvement");
    assert.equal(quizVerdict(0.2).title, "Rough day");
    assert.equal(quizVerdict(0).card, "red");
    const a = bank.questions.find((q) => q.refs[0]?.law === 11)!;
    const b = bank.questions.find((q) => q.refs[0]?.law === 12)!;
    const rows = quizByLaw(bank, [{ question: a, right: true }, { question: b, right: false }]);
    assert.deepEqual(rows.map((r) => r.law), [12, 11]);
});
