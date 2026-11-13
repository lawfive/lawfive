import { QuizBank } from "@lawfive/schema";
import { QuizPlay } from "../pages/Quiz.tsx";
import { appUrl, render } from "./shell.tsx";

// lawfive.app's quiz (SITE-1, QUIZ-2 to QUIZ-5): the website's, with the active questions copied in
// at build from schema/quiz/, as the server sends them (GET /v1/quiz). Nothing is saved (QUIZ-6).

async function load(): Promise<QuizBank> {
    const bank = QuizBank.parse((await import("../../../schema/quiz/questions-en.json")).default);
    return { ...bank, questions: bank.questions.filter((q) => q.status === "active") };
}

export function mount(el: HTMLElement) {
    render(el, (
        <QuizPlay load={load}
            head={(action) => action && <div className="lf-part-head">{action}</div>}
            after={<p className="muted lf-part-after">Track your matches too: <a href={appUrl}>try LawFive</a>, free.</p>} />
    ));
}
