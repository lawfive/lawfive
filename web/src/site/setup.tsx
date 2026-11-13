import type { ScreenSetup } from "@lawfive/schema";
import { useState } from "react";
import { Icon } from "../components/ui.tsx";
import { ScreenPreview, ScreenSteps, bothShapes, withPatch } from "../pages/MatchScreenSetup.tsx";
import { appUrl, render, storeScreen, storedScreen } from "./shell.tsx";

// lawfive.app's match screen setup (SITE-1, UI-27): the website's steps and pictures, kept in the
// visitor's browser, ending in Try it on the watch rather than saving for an account.

function Setup() {
    const kept = storedScreen();
    const [draft, setDraft] = useState<ScreenSetup>(kept.screen);
    const [step, setStepNow] = useState(kept.step);
    const set = (patch: Partial<ScreenSetup>) => {
        const next = withPatch(draft, patch);
        setDraft(next);
        storeScreen(next, step);
    };
    const setStep = (next: number) => {
        setStepNow(next);
        storeScreen(draft, next);
    };
    return (
        <div className="screen-setup">
            <ScreenSteps draft={draft} set={set} step={step} onStep={setStep}
                finish={<a className="btn btn-primary" href="/try.html"><Icon name="play" size={16} />Try it on the watch</a>}
                note={<p className="muted lf-part-after">With LawFive, it's saved for your watches and reaches them at their next sync. <a href={`${appUrl}/settings/match-screen`}>Sign in to use it</a></p>} />
            <div className="card screen-preview-card">
                <ScreenPreview setup={draft} shapes={bothShapes} />
            </div>
        </div>
    );
}

export function mount(el: HTMLElement) {
    render(el, <Setup />);
}
