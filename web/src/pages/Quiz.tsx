import { type QuizBank, type QuizDifficulty, type QuizQuestion, pickQuiz, quizAnswerIsRight, quizByLaw, quizCounts, quizPool, quizReference, quizVerdict } from "@lawfive/schema";
import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { request } from "../api.ts";
import { Slab } from "../components/Slab.tsx";
import { CardShape, CountUp, Icon, Loading, PageHead, PortalContainer, lessMotion } from "../components/ui.tsx";

// The Laws of the Game quiz (QUIZ-1 to QUIZ-7): choose how hard and how long, answer, see how it went.
// Nothing about an attempt is saved (QUIZ-6); it's kept here so going to another page and back
// doesn't lose it, and goes when the app reloads.

interface Attempt {
    difficulty: QuizDifficulty;
    questions: QuizQuestion[];
    index: number;
    /** What was picked, once the question is checked. */
    answers: string[][];
    verdict?: ReturnType<typeof quizVerdict>;
}

const difficulties: { value: QuizDifficulty; label: string; sub: string }[] = [
    { value: "easy", label: "Easy", sub: "The basics of the Laws" },
    { value: "medium", label: "Medium", sub: "For referees with a few seasons in" },
    { value: "hard", label: "Hard", sub: "The ones that catch people out" },
    { value: "mixed", label: "Mixed", sub: "A bit of everything" },
];

// Kept while the app is open: an attempt, and the last choices.
let kept: { attempt?: Attempt; difficulty: QuizDifficulty; count: number } = { difficulty: "easy", count: 10 };

/** Leaving a step: its exit plays, then the next one rises in. */
const LEAVE_MS = 170;

export function Quiz() {
    return (
        <QuizPlay load={() => request<QuizBank>("GET", "/quiz")}
            head={(action) => <PageHead title="Quiz" hero sub="How well do you know the Laws of the Game?" actions={action} />} />
    );
}

/** The quiz itself, from wherever its questions come: the server in the app, a copy made at build on lawfive.app (SITE-1). */
export function QuizPlay({ load, head, after }: {
    load: () => Promise<QuizBank>;
    /** The heading, with Start over once there's an attempt. */
    head: (action: ReactNode) => ReactNode;
    /** Under the score, at the end. */
    after?: ReactNode;
}) {
    const bank = useQuery({ queryKey: ["quiz"], queryFn: load, staleTime: 60 * 60 * 1000 });
    const [attempt, setAttemptNow] = useState(kept.attempt);
    const [leaving, setLeaving] = useState(false);
    const [asking, setAsking] = useState(false);
    const portal = useContext(PortalContainer);

    const setAttempt = (next: Attempt | undefined) => {
        kept.attempt = next;
        setAttemptNow(next);
    };
    /** A change of step, with its transition. */
    const go = (change: () => void) => {
        if (lessMotion()) {
            change();
            return;
        }
        setLeaving(true);
        window.setTimeout(() => {
            change();
            setLeaving(false);
        }, LEAVE_MS);
    };
    const begin = (difficulty: QuizDifficulty, count: number) => {
        if (bank.data) {
            kept = { ...kept, difficulty, count };
            go(() => setAttempt({ difficulty, questions: pickQuiz(bank.data, difficulty, count), index: 0, answers: [] }));
        }
    };
    const startOver = () => go(() => setAttempt(undefined));
    const inProgress = attempt && !attempt.verdict && attempt.answers.length > 0;

    const key = !attempt ? "setup" : attempt.verdict ? "results" : `q${attempt.index}`;
    return (
        <>
            {head(attempt && (
                <button type="button" className="btn" onClick={() => (inProgress ? setAsking(true) : startOver())}><Icon name="restart" />Start over</button>
            ))}
            {bank.isLoading && <Loading label="Getting the questions…" />}
            {bank.isError && (
                <div className="card empty">
                    <p>The questions didn't load.</p>
                    <button type="button" className="btn" onClick={() => void bank.refetch()}>Try again</button>
                </div>
            )}
            {bank.data && (
                <div key={key} className={`quiz-step${leaving ? " leaving" : ""}`}>
                    {!attempt && <Setup bank={bank.data} onStart={begin} />}
                    {attempt && !attempt.verdict && (
                        <Asking bank={bank.data} attempt={attempt} onAnswered={(picked) => setAttempt({ ...attempt, answers: [...attempt.answers, picked] })}
                            onNext={() => go(() => {
                                const last = attempt.index + 1 >= attempt.questions.length;
                                const right = attempt.questions.filter((q, i) => quizAnswerIsRight(q, attempt.answers[i] ?? [])).length;
                                setAttempt(last ? { ...attempt, verdict: quizVerdict(right / attempt.questions.length) } : { ...attempt, index: attempt.index + 1 });
                            })} />
                    )}
                    {attempt?.verdict && <Results bank={bank.data} attempt={attempt} after={after} onAgain={() => begin(attempt.difficulty, attempt.questions.length)} onChange={startOver} />}
                </div>
            )}
            {asking && (
                <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && setAsking(false)} UNSTABLE_portalContainer={portal}>
                    <Modal className="modal">
                        <Dialog className="modal-dialog" role="alertdialog">
                            <Heading slot="title">Start over?</Heading>
                            <p className="muted">This attempt's score goes, and you choose again.</p>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-danger" onClick={() => { setAsking(false); startOver(); }}>Start over</button>
                                <div className="grow" />
                                <button type="button" className="btn btn-primary" autoFocus onClick={() => setAsking(false)}>Keep going</button>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
        </>
    );
}

function Setup({ bank, onStart }: { bank: QuizBank; onStart: (difficulty: QuizDifficulty, count: number) => void }) {
    const [difficulty, setDifficulty] = useState(kept.difficulty);
    const [count, setCount] = useState(kept.count);
    const available = quizPool(bank, difficulty).length;
    return (
        <div className="card quiz-setup">
            <h3 id="quiz-level">How hard?</h3>
            <div className="quiz-levels" role="radiogroup" aria-labelledby="quiz-level">
                {difficulties.map((d) => (
                    <button key={d.value} type="button" role="radio" aria-checked={difficulty === d.value} className={`quiz-level${difficulty === d.value ? " on" : ""}`} onClick={() => setDifficulty(d.value)}>
                        <strong>{d.label}</strong>
                        <span className="muted">{d.sub}</span>
                    </button>
                ))}
            </div>
            <h3 id="quiz-count">How many questions?</h3>
            <div className="quiz-counts" role="radiogroup" aria-labelledby="quiz-count">
                {quizCounts.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={count === n} disabled={n > available} className={`quiz-count${count === n ? " on" : ""}`} onClick={() => setCount(n)}>{n}</button>
                ))}
            </div>
            <button type="button" className="btn btn-primary quiz-go" onClick={() => onStart(difficulty, Math.min(count, available))}><Icon name="play" />Start the quiz</button>
            <p className="muted quiz-source">
                Written for LawFive from the <a href={bank.source.url} target="_blank" rel="noreferrer">Laws of the Game {bank.edition}</a>. Not official, and not endorsed by The IFAB.
            </p>
        </div>
    );
}

function Asking({ bank, attempt, onAnswered, onNext }: { bank: QuizBank; attempt: Attempt; onAnswered: (picked: string[]) => void; onNext: () => void }) {
    const question = attempt.questions[attempt.index]!;
    const answered = attempt.answers[attempt.index];
    const [picked, setPicked] = useState<string[]>([]);
    const heading = useRef<HTMLHeadingElement>(null);
    const next = useRef<HTMLButtonElement>(null);
    const total = attempt.questions.length;
    const last = attempt.index + 1 >= total;
    const right = attempt.answers.filter((a, i) => quizAnswerIsRight(attempt.questions[i]!, a)).length;
    const multiple = question.type === "multiple";
    const shown = answered ?? picked;
    const correct = answered && quizAnswerIsRight(question, answered);
    const reference = quizReference(bank, question);

    // For keyboards and screen readers, as this replaced the last question.
    useEffect(() => heading.current?.focus({ preventScroll: true }), []);
    useEffect(() => {
        if (answered) {
            next.current?.focus({ preventScroll: true });
        }
    }, [answered]);

    const choose = (id: string) => {
        if (!answered) {
            setPicked(multiple ? (picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]) : [id]);
        }
    };
    return (
        <>
            <div className="quiz-progress">
                <span className="muted">Question <strong className="figure">{attempt.index + 1}</strong> of {total}</span>
                <span className="quiz-tally" aria-live="polite"><strong key={right} className="figure">{right}</strong> correct</span>
            </div>
            <div className="quiz-track" style={{ "--n": total } as CSSProperties} aria-hidden>
                {attempt.questions.map((q, i) => {
                    const a = attempt.answers[i];
                    return <span key={q.id} className={a ? (quizAnswerIsRight(q, a) ? "right" : "wrong") : i === attempt.index ? "now" : ""} />;
                })}
            </div>
            <div className="card quiz-card">
                {multiple && <span className="chip chip-blue">Select all that apply</span>}
                <h2 ref={heading} tabIndex={-1}>{question.question}</h2>
                <div className="quiz-options" role={multiple ? "group" : "radiogroup"} aria-label="Answers">
                    {question.options.map((option, i) => {
                        const chosen = shown.includes(option.id);
                        const state = !answered ? (chosen ? "picked" : "") : option.correct ? "right" : chosen ? "wrong" : "out";
                        return (
                            <div key={option.id} className={`quiz-option ${state}`} style={{ "--i": i } as CSSProperties}>
                                <button type="button" role={multiple ? "checkbox" : "radio"} aria-checked={chosen} aria-disabled={!!answered} onClick={() => choose(option.id)}>
                                    <span className={`quiz-mark${multiple ? " square" : ""}`}>
                                        {(state === "right" || state === "picked") && <Icon name="check" size={13} />}
                                        {state === "wrong" && <Icon name="close" size={13} />}
                                    </span>
                                    <span>{option.text}</span>
                                </button>
                                {answered && (option.correct || chosen) && (
                                    <p className="quiz-why">{option.correct && multiple && !chosen && <strong>You missed this one. </strong>}{option.explanation}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
                {answered && (
                    <div className="quiz-outcome" role="status">
                        <strong className={correct ? "right" : "wrong"}>{correct ? "Correct" : "Not quite"}</strong>
                        {reference && <a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a>}
                    </div>
                )}
                <div className="quiz-actions">
                    {answered ? (
                        <button ref={next} type="button" className="btn btn-primary" onClick={onNext}>{last ? "See how you did" : "Next question"}<Icon name="next" /></button>
                    ) : (
                        <button type="button" className="btn btn-primary" disabled={picked.length === 0} onClick={() => onAnswered(picked)}>Check answer</button>
                    )}
                </div>
            </div>
        </>
    );
}

function Results({ bank, attempt, after, onAgain, onChange }: { bank: QuizBank; attempt: Attempt; after?: ReactNode; onAgain: () => void; onChange: () => void }) {
    const results = attempt.questions.map((question, i) => ({ question, picked: attempt.answers[i] ?? [], right: quizAnswerIsRight(question, attempt.answers[i] ?? []) }));
    const right = results.filter((r) => r.right).length;
    const verdict = attempt.verdict!;
    const laws = quizByLaw(bank, results);
    const missed = results.filter((r) => !r.right);
    return (
        <>
            {/* WEB-28: the score on a slab cut on the diagonal, a card dealt beside a low one; the Laws on a chalk panel's slab. */}
            <Slab title="Your score" icon="quiz" tag={`${difficulties.find((d) => d.value === attempt.difficulty)?.label ?? ""} · ${results.length}\u00a0questions`} cut level={2} className="quiz-results">
                <div className="quiz-result">
                    <div className="quiz-result-main">
                        <p className="quiz-score"><strong><CountUp value={right} /></strong><span>/ {results.length}</span></p>
                        <span className="mint-bar quiz-bar" style={{ "--share": right / results.length } as CSSProperties} aria-hidden />
                        <p className="slab-heading quiz-verdict">{verdict.title}</p>
                        <p className="slab-caption quiz-line">{verdict.line}</p>
                        <div className="row quiz-again">
                            <button type="button" className="btn btn-primary" onClick={onAgain}><Icon name="restart" />Go again</button>
                            <button type="button" className="btn" onClick={onChange}>Change the settings</button>
                        </div>
                        {after}
                    </div>
                    {verdict.card && <div className="quiz-card-shown"><CardShape colour={verdict.card} huge /></div>}
                </div>
            </Slab>
            <Slab title="By Law" tag="Weakest first" ground="panel" level={3} className="quiz-laws">
                {laws.map((law, i) => (
                    <a key={law.law} className="quiz-law" href={law.url} target="_blank" rel="noreferrer" style={{ "--i": i } as CSSProperties}>
                        <span className="quiz-law-name">Law {law.law}: {law.title}</span>
                        <span className="quiz-law-bar"><span style={{ width: `${(law.right / law.total) * 100}%` }} /></span>
                        <span className="figure">{law.right}/{law.total}</span>
                    </a>
                ))}
            </Slab>
            {missed.length > 0 && (
                <div className="card quiz-missed">
                    <h3>What you missed</h3>
                    {missed.map(({ question }) => {
                        const reference = quizReference(bank, question);
                        const answers = question.options.filter((o) => o.correct);
                        return (
                            <div key={question.id} className="quiz-miss">
                                <strong>{question.question}</strong>
                                {answers.map((o) => <p key={o.id}><Icon name="check" size={14} /> {o.text}<span className="muted"> {o.explanation}</span></p>)}
                                {reference && <a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a>}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}
