import { useQuery } from "@tanstack/react-query";
import { type ScreenSetup, savedScreen, screenSetup } from "@lawfive/schema";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { request, useSave } from "../api.ts";
import { WatchFace, type WatchShape } from "../components/WatchFace.tsx";
import { Icon, PageHead, Toggle, lessMotion } from "../components/ui.tsx";
import { useSettings } from "../settings.ts";
import { momentLabel, moments, playAt, screenAt } from "../watchPreview.ts";

// UI-27: the match screen setup. UI-21's four questions one step at a time, then a review to save,
// beside pictures of the screen on a round watch and on Apple Watch, drawn from the answers so far,
// at moments of a match chosen under them, or played through. Saved for the account (UI-24).

type Style = ScreenSetup["mainClock"];

const steps = ["Clocks", "How they count", "Ring or time", "Names", "Review"];

/** TMR-11: each style named with its example for a 2 × 45 match. */
export const clockStyles: { id: Style; name: string; hint: string }[] = [
    { id: "up", name: "Match time", hint: "0 to 90, like TV" },
    { id: "upEach", name: "Each half from 0", hint: "0 to 45, then 0 to 45 again" },
    { id: "down", name: "Time left", hint: "45 down to 0" },
];

const clockChoices: { id: ScreenSetup["clocks"]; name: string; hint: string }[] = [
    { id: "one", name: "One clock", hint: "The match clock, large" },
    { id: "stacked", name: "Two, stacked", hint: "A smaller second clock under the first" },
    { id: "sideBySide", name: "Two, side by side", hint: "The same size, with a line between" },
];

const breakChoices: { id: ScreenSetup["breakClock"]; name: string; hint: string }[] = [
    { id: "down", name: "Time left", hint: "Half-time from 15:00 down to 0:00" },
    { id: "up", name: "Time taken", hint: "Half-time from 0:00 up to 15:00" },
];

const edgeChoices: { id: ScreenSetup["edge"]; name: string; hint: string }[] = [
    { id: "ring", name: "Ring", hint: "Around the edge: fills as the period runs, or empties with Time left. Round watches and Apple Watch." },
    { id: "time", name: "Time of day", hint: "Small, at the very bottom. Apple Watch always shows its own clock." },
    { id: "none", name: "Neither", hint: "Just the clocks and the score" },
];

const nameChoices: { id: boolean; name: string; hint: string }[] = [
    { id: true, name: "Team names", hint: "1 HOM/AWY 2 over the clock" },
    { id: false, name: "Scores only", hint: "The scores alone, with a bigger clock" },
];

/** One of a set of tiles, as in the setup wizard and the quiz. */
function Choices<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; name: string; hint: string }[]; onChange: (value: T) => void }) {
    return (
        <div className="screen-choices" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button key={String(o.id)} type="button" role="radio" aria-checked={value === o.id} className={`quiz-level${value === o.id ? " on" : ""}`} onClick={() => onChange(o.id)}>
                    <strong className="setup-choice-title">{o.name}</strong>
                    <span className="muted">{o.hint}</span>
                </button>
            ))}
        </div>
    );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="screen-question">
            <h3>{title}</h3>
            {children}
        </div>
    );
}

/** The setup in words, for the review and the Settings page. */
export function screenWords(s: ScreenSetup): { label: string; value: string; step: number }[] {
    const style = (id: Style) => clockStyles.find((c) => c.id === id)!;
    return [
        { label: "Clocks", value: clockChoices.find((c) => c.id === s.clocks)!.name, step: 0 },
        { label: "Match clock", value: `${style(s.mainClock).name} · ${style(s.mainClock).hint}`, step: 1 },
        ...(s.clocks === "one" ? [] : [{ label: "Second clock", value: `${style(s.secondClock).name} · ${style(s.secondClock).hint}`, step: 1 }]),
        { label: "Break clock", value: breakChoices.find((c) => c.id === s.breakClock)!.name, step: 1 },
        { label: "Ring or time", value: edgeChoices.find((c) => c.id === s.edge)!.name, step: 2 },
        { label: "Names", value: s.names ? "Team names" : "Scores only", step: 3 },
    ];
}

/** The match screen in a line, for Try a match (DEMO-4): "two clocks stacked, the time of day, names". */
export function screenLine(s: ScreenSetup): string {
    const clocks = { one: "one clock", stacked: "two clocks stacked", sideBySide: "two clocks side by side" }[s.clocks];
    const edge = { ring: "the ring", time: "the time of day", none: "" }[s.edge];
    return [clocks, edge, s.names ? "names" : "scores only"].filter(Boolean).join(", ");
}

type Shapes = { shape: WatchShape; name: string; yours: boolean }[];

/** Both shapes, neither anyone's: for lawfive.app, which has no account (SITE-1). */
export const bothShapes: Shapes = [{ shape: "round", name: "Garmin, Wear OS", yours: false }, { shape: "apple", name: "Apple Watch", yours: false }];

/** Which shapes the account's linked watches have, so theirs come first, labeled. */
function useWatchShapes(given?: Shapes): Shapes {
    const devices = useQuery({ queryKey: ["devices"], queryFn: async () => (await request<{ devices: { kind: string }[] }>("GET", "/devices")).devices, enabled: !given });
    if (given) {
        return given;
    }
    const kinds = new Set((devices.data ?? []).map((d) => d.kind));
    const round = { shape: "round" as const, name: "Garmin, Wear OS", yours: kinds.has("garmin") || kinds.has("wearos") };
    const apple = { shape: "apple" as const, name: "Apple Watch", yours: kinds.has("applewatch") };
    return apple.yours && !round.yours ? [apple, round] : [round, apple];
}

/** UI-27: the pictures, the moments under them, Stoppage tracked, Team colors, and Play through with its scrubber. */
export function ScreenPreview({ setup, compact, shapes: given }: { setup: ScreenSetup; compact?: boolean; shapes?: Shapes }) {
    const shapes = useWatchShapes(given);
    const [momentId, setMomentId] = useState("first");
    const [tracked, setTracked] = useState(true);
    const [colors, setColors] = useState(false);
    /** Where Play through is, 0 to 1; none while a moment is chosen. */
    const [position, setPosition] = useState<number>();
    const [playing, setPlaying] = useState(false);
    const frame = useRef<number>(undefined);
    const shown = moments.filter((m) => tracked || !m.stoppage);
    const chosen = shown.find((m) => m.id === momentId) ?? shown[0];
    const at = position !== undefined ? playAt(position) : chosen.moment;
    const screen = screenAt(setup, at, tracked);

    const cancel = () => {
        if (frame.current !== undefined) {
            cancelAnimationFrame(frame.current);
        }
        frame.current = undefined;
    };
    const pause = () => {
        cancel();
        setPlaying(false);
    };
    /** About 30 seconds for the whole match, from where the scrubber is; with less motion asked for, in steps. */
    const play = () => {
        cancel();
        const from = position === undefined || position >= 1 ? 0 : position;
        const start = performance.now() - from * 30_000;
        setPlaying(true);
        setPosition(from);
        const step = (now: number) => {
            const t = (now - start) / 30_000;
            if (t >= 1) {
                setPosition(1);
                pause();
                return;
            }
            setPosition(lessMotion() ? Math.floor(t * 100) / 100 : t);
            frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
    };
    useEffect(() => cancel, []);

    return (
        <div className={`screen-preview${compact ? " compact" : ""}`}>
            <div className="screen-preview-faces">
                {shapes.map((s) => (
                    <figure key={s.shape} className={`screen-face screen-face-${s.shape}`}>
                        <WatchFace setup={setup} screen={screen} shape={s.shape} colors={colors} label={`The match screen on ${s.name}`} />
                        <figcaption>{s.name}{s.yours && <span className="chip chip-brand">Yours</span>}</figcaption>
                    </figure>
                ))}
            </div>
            {!compact && (
                <>
                    <div className="screen-moments" role="radiogroup" aria-label="Moment of the match">
                        {shown.map((m) => (
                            <button key={m.id} type="button" role="radio" aria-checked={position === undefined && m.id === chosen.id}
                                className={`chip screen-moment${position === undefined && m.id === chosen.id ? " on" : ""}`}
                                onClick={() => { pause(); setPosition(undefined); setMomentId(m.id); }}>
                                {m.name}
                            </button>
                        ))}
                    </div>
                    <div className="screen-play">
                        <button type="button" className="btn btn-icon" aria-label={playing ? "Pause" : "Play through"} onClick={playing ? pause : play}>
                            <Icon name={playing ? "pause" : "play"} size={16} />
                        </button>
                        <input type="range" min={0} max={1000} value={Math.round((position ?? 0) * 1000)} aria-label="Play through the match"
                            style={{ "--played": position ?? 0 } as CSSProperties}
                            onChange={(e) => { pause(); setPosition(Number(e.target.value) / 1000); }} />
                        <span className={`screen-play-at${position === undefined ? " muted" : ""}`}>{position === undefined ? "Play through" : momentLabel(at)}</span>
                    </div>
                    <div className="screen-preview-foot">
                        <Toggle label="Stoppage tracked" checked={tracked} onChange={setTracked} />
                        <Toggle label="Team colors" checked={colors} onChange={setColors} />
                    </div>
                </>
            )}
        </div>
    );
}

/** UI-27: the steps, one at a time, and the review; how it starts and ends is the page's (the app saves, lawfive.app tries it, SITE-1). */
export function ScreenSteps({ draft, set, step, onStep, cancel, finish, note }: {
    draft: ScreenSetup;
    set: (patch: Partial<ScreenSetup>) => void;
    step: number;
    onStep: (step: number) => void;
    /** On the first step, in Back's place. */
    cancel?: ReactNode;
    /** On the review, in Continue's place. */
    finish: ReactNode;
    /** Under the review. */
    note?: ReactNode;
}) {
    const last = steps.length - 1;
    return (
        <div className="card screen-steps">
            {/* The steps by name, so what's coming is clear; each can be gone back or ahead to. */}
            <ol className="screen-stepper" style={{ "--n": steps.length } as CSSProperties}>
                {steps.map((name, i) => (
                    <li key={name} className={i < step ? "done" : i === step ? "now" : ""}>
                        <button type="button" aria-current={i === step ? "step" : undefined} onClick={() => onStep(i)}>
                            <span className="screen-stepper-bar" />
                            <span className="screen-stepper-name">{name}</span>
                        </button>
                    </li>
                ))}
            </ol>
            <div key={step} className="setup-step">
                {step === 0 && (
                    <>
                        <h2>How many clocks?</h2>
                        <Choices label="Clocks" value={draft.clocks} options={clockChoices} onChange={(clocks) => set({ clocks })} />
                    </>
                )}
                {step === 1 && (
                    <>
                        <h2>How does each count?</h2>
                        <p className="muted">Stoppage always counts up.</p>
                        <Question title="Match clock">
                            <Choices label="Match clock" value={draft.mainClock} options={clockStyles} onChange={(mainClock) => set({ mainClock })} />
                        </Question>
                        {draft.clocks !== "one" && (
                            <Question title="Second clock">
                                <Choices label="Second clock" value={draft.secondClock} options={clockStyles.filter((c) => c.id !== draft.mainClock)} onChange={(secondClock) => set({ secondClock })} />
                            </Question>
                        )}
                        <Question title="Break clock">
                            <Choices label="Break clock" value={draft.breakClock} options={breakChoices} onChange={(breakClock) => set({ breakClock })} />
                        </Question>
                    </>
                )}
                {step === 2 && (
                    <>
                        <h2>Ring or time of day?</h2>
                        <p className="muted">At the edge of the screen; one or the other, as there's room for one.</p>
                        <Choices label="Ring or time" value={draft.edge} options={edgeChoices} onChange={(edge) => set({ edge })} />
                    </>
                )}
                {step === 3 && (
                    <>
                        <h2>Team names, or scores only?</h2>
                        <Choices label="Names" value={draft.names} options={nameChoices} onChange={(names) => set({ names })} />
                    </>
                )}
                {step === last && (
                    <>
                        <h2>Your match screen</h2>
                        <dl className="screen-review">
                            {screenWords(draft).map((w) => (
                                <div key={w.label}>
                                    <dt>{w.label}</dt>
                                    <dd>{w.value}</dd>
                                    <button type="button" className="btn btn-ghost" onClick={() => onStep(w.step)}>Change</button>
                                </div>
                            ))}
                        </dl>
                        {note}
                    </>
                )}
            </div>
            <div className="setup-actions">
                {step > 0
                    ? <button type="button" className="btn btn-ghost" onClick={() => onStep(step - 1)}><Icon name="back" size={16} />Back</button>
                    : cancel}
                <span className="grow" />
                {step < last
                    ? <button type="button" className="btn btn-primary" onClick={() => onStep(step + 1)}>Continue</button>
                    : finish}
            </div>
        </div>
    );
}

/** UI-22: the second clock is never the match clock's style. */
export function withPatch(d: ScreenSetup, patch: Partial<ScreenSetup>): ScreenSetup {
    const next = { ...d, ...patch };
    if (next.secondClock === next.mainClock) {
        next.secondClock = next.mainClock === "down" ? "upEach" : "down";
    }
    return next;
}

export function MatchScreenSetup() {
    const { settings, record } = useSettings();
    const save = useSave("settings");
    const navigate = useNavigate();
    // Back from Try a match (DEMO): the draft and step it was tried from.
    const back = useLocation().state as { draft?: ScreenSetup; step?: number } | null;
    const [draft, setDraft] = useState<ScreenSetup>(() => back?.draft ?? screenSetup(settings.watchScreen));
    const [step, setStep] = useState(back?.step ?? 0);
    const touched = useRef(back?.draft !== undefined);
    // Starts from the account's setup once it has loaded, unless something's been chosen already.
    useEffect(() => {
        if (!touched.current && record) {
            setDraft(screenSetup(record.watchScreen));
        }
    }, [record]);
    const set = (patch: Partial<ScreenSetup>) => {
        touched.current = true;
        setDraft((d) => withPatch(d, patch));
    };
    const finish = () => {
        if (!record) {
            return;
        }
        const { updatedAt: _u, deletedAt: _d, ...rest } = record;
        save.mutate({ ...rest, watchScreen: savedScreen(draft, new Date().toISOString()) }, { onSuccess: () => navigate("/settings") });
    };

    return (
        <>
            <PageHead title="Match screen" sub="What your watches show while a period runs. It reaches them at their next sync and starts at the next kickoff." back={{ to: "/settings", label: "Settings" }} />
            <div className="screen-setup">
                <ScreenSteps draft={draft} set={set} step={step} onStep={setStep}
                    cancel={<Link to="/settings" className="btn btn-ghost">Cancel</Link>}
                    finish={<button type="button" className="btn btn-primary" disabled={!record || save.isPending} onClick={finish}>{save.isPending ? "Saving…" : "Save for my watches"}</button>}
                    note={save.isError && <p className="error">Couldn't save; try again.</p>} />
                <div className="card screen-preview-card">
                    <ScreenPreview setup={draft} />
                    <Link to="/try" state={{ screen: draft, step }} className="btn screen-try"><Icon name="play" size={16} />Try it in a match</Link>
                </div>
            </div>
        </>
    );
}
