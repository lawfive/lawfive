import { type ScreenSetup, tryMatchFromAddress } from "@lawfive/schema";
import { useRef, useState } from "react";
import { Icon, lessMotion } from "../components/ui.tsx";
import { TryMatch, demoMatch } from "../match/TryMatch.tsx";
import { ScreenSteps, screenLine, withPatch } from "../pages/MatchScreenSetup.tsx";
import { render, storeScreen, storedScreen } from "./shell.tsx";

// lawfive.app's Try a match (SITE-1, DEMO-1): the website's, with a made-up match, the visitor's
// match screen from the setup (kept in their browser), and the setup under it to change it. As on a
// watch, a change shows from the next match. As the setup is usually below the fold, Change beside the
// watch goes down to it, and New match with it comes back up.
// DEMO-9: the phones open it with the watch and the account's match screen in the address; that screen is
// shown as it is, without Change or the setup, so nothing here seems to change the account's.

function Try() {
    const asked = tryMatchFromAddress(location.search);
    const kept = storedScreen();
    const [screen, setScreen] = useState<ScreenSetup>(asked.screen ?? kept.screen);
    const [step, setStep] = useState(kept.step);
    const [run, setRun] = useState(0);
    const watch = useRef<HTMLDivElement>(null);
    const setup = useRef<HTMLHeadingElement>(null);
    const goTo = (el: HTMLElement | null) => {
        el?.scrollIntoView({ behavior: lessMotion() ? "auto" : "smooth", block: "start" });
        el?.focus({ preventScroll: true });
    };
    const set = (patch: Partial<ScreenSetup>) => {
        const next = withPatch(screen, patch);
        setScreen(next);
        storeScreen(next, step);
    };
    return (
        <>
            <div ref={watch} tabIndex={-1} className="lf-try-watch">
                <TryMatch key={run} setup={demoMatch} screen={screen} swipes={asked.teamSwipes ?? "upDown"} watch={asked.watch}
                    caption="A made-up match: Strikers v Rovers, 2 × 45 with a halfway break"
                    screenRow={
                        <div className="try-side-screen">
                            <span>{screenLine(screen).replace(/^./, (c) => c.toUpperCase())}</span>
                            {!asked.screen && <button type="button" className="btn btn-sm" onClick={() => goTo(setup.current)}>Change<Icon name="swipeDown" size={14} /></button>}
                        </div>
                    } />
            </div>
            {asked.screen ? (
                <p className="lf-try-setup muted">Your match screen, from LawFive. Change it in <b>Settings → Match screen</b>.</p>
            ) : <div className="lf-try-setup">
                <h3 ref={setup} tabIndex={-1}>Your match screen</h3>
                <p className="muted">As on a watch, a change shows from the next match.</p>
                <ScreenSteps draft={screen} set={set} step={step} onStep={(s) => { setStep(s); storeScreen(screen, s); }}
                    finish={<button type="button" className="btn btn-primary" onClick={() => { setRun(run + 1); goTo(watch.current); }}><Icon name="restart" size={16} />New match with it</button>} />
            </div>}
        </>
    );
}

export function mount(el: HTMLElement) {
    // DEMO-9: opened with the account's screen, the page's own "change it here" card doesn't apply.
    if (tryMatchFromAddress(location.search).screen) document.getElementById("try-own-screen")?.remove();
    render(el, <Try />);
}
