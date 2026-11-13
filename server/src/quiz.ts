import { QuizBank } from "@lawfive/schema";
import { Hono } from "hono";
import { existsSync, readFileSync } from "node:fs";

// The Laws of the Game quiz's questions (QUIZ-1): GET /v1/quiz, from the files in schema/quiz/, so a
// new server image updates the questions without a new app. Only active questions go out.

const folder = new URL("../../schema/quiz/", import.meta.url);
const banks = new Map<string, QuizBank>();

function bank(language: string): QuizBank | undefined {
    const known = banks.get(language);
    if (known) {
        return known;
    }
    const file = new URL(`questions-${language}.json`, folder);
    if (!existsSync(file)) {
        return undefined;
    }
    const parsed = QuizBank.parse(JSON.parse(readFileSync(file, "utf8")));
    const active = { ...parsed, questions: parsed.questions.filter((q) => q.status === "active") };
    banks.set(language, active);
    return active;
}

export function quizApi() {
    const api = new Hono();
    api.get("/quiz", (c) => {
        const language = c.req.query("language") ?? "en";
        const found = /^[a-z]{2}$/.test(language) ? bank(language) : undefined;
        if (!found) {
            return c.json({ error: "There are no questions in that language." }, 404);
        }
        c.header("Cache-Control", "private, max-age=3600");
        return c.json(found);
    });
    return api;
}
