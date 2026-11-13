import { useEffect, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Tip, type TipArt as Art, dismissTip, tipForThisVisit } from "../tips.ts";
import { Icon } from "./ui.tsx";

/** A tip's picture: pitch markings, the watch's coin or two cards where it has its own, else a Phosphor icon. */
function TipArt({ art }: { art: Art }) {
    return (
        <div className="tip-art" aria-hidden>
            {art === "corners" ? (
                <svg viewBox="0 0 64 64">
                    <g className="tip-lines"><rect x="11" y="15" width="42" height="34" rx="1.5" /><path d="M32 15V49" /><circle cx="32" cy="32" r="6" /></g>
                    <circle cx="11" cy="15" r="4.5" fill="currentColor" />
                    <circle cx="53" cy="15" r="4.5" fill="currentColor" />
                    <circle cx="53" cy="49" r="4.5" fill="currentColor" />
                    <circle cx="11" cy="49" r="4.5" fill="var(--brand-soft)" stroke="currentColor" strokeWidth="2" strokeDasharray="2.5 2" />
                </svg>
            ) : art === "coin" ? (
                <svg viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="20" fill="var(--coin)" />
                    <circle cx="32" cy="32" r="16" fill="none" stroke="var(--coin-edge)" strokeWidth="1.2" />
                    <text x="32" y="41" textAnchor="middle" fontFamily="var(--display)" fontWeight="700" fontSize="25" fill="var(--coin-ink)">H</text>
                </svg>
            ) : art === "direction" ? (
                <svg viewBox="0 0 64 64">
                    <g className="tip-lines"><rect x="9" y="15" width="46" height="34" rx="1.5" /><path d="M32 15V49M55 24H48V40H55" /></g>
                    <circle cx="32" cy="32" r="2.6" fill="currentColor" />
                    <path d="M32 32H49M43.5 26.5L49.5 32L43.5 37.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ) : art === "cards" ? (
                <svg viewBox="0 0 64 64">
                    <rect x="19" y="17" width="20" height="28" rx="2.5" fill="var(--yellow)" transform="rotate(-12 29 31)" />
                    <rect x="27" y="19" width="20" height="28" rx="2.5" fill="var(--yellow)" stroke="var(--brand-soft)" strokeWidth="1.5" transform="rotate(8 37 33)" />
                </svg>
            ) : (
                <Icon name={art} size={30} />
            )}
        </div>
    );
}

function TipSteps({ tip, onClose, onDone }: { tip: Tip; onClose: () => void; onDone: () => void }) {
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog tip-dialog">
                    <div className="tip-dialog-head">
                        <TipArt art={tip.art} />
                        <div>
                            <div className="next-label">Did you know</div>
                            <Heading slot="title">{tip.title}</Heading>
                        </div>
                    </div>
                    <ol className="tip-steps">
                        {tip.steps.map((step, i) => <li key={step}><span className="tip-step-figure">{i + 1}</span><span>{step}</span></li>)}
                    </ol>
                    {tip.note && <p className="tip-note">{tip.note}</p>}
                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>Close</button>
                        <button type="button" className="btn btn-primary" onClick={onDone}>Got it</button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** TIP-1: now and then, one tip on the Matches page. `ready` once the matches and the device prompts are known. */
export function DidYouKnow({ ready, blocked, played }: { ready: boolean; blocked: boolean; played: number }) {
    const [tip, setTip] = useState<Tip>();
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (ready) {
            setTip(tipForThisVisit(blocked, played));
        }
    }, [ready]);
    if (!tip || blocked) {
        return null;
    }
    const done = () => {
        dismissTip(tip.id);
        setOpen(false);
        setTip(undefined);
    };
    return (
        <section className="card tip-card" aria-label="Did you know">
            <TipArt art={tip.art} />
            <div className="grow">
                <div className="next-label">Did you know</div>
                <div className="tip-title">{tip.title}</div>
                <div className="tip-body">{tip.body}</div>
            </div>
            <div className="row" style={{ flexWrap: "nowrap" }}>
                <button type="button" className="btn btn-ghost" onClick={done}>Got it</button>
                <button type="button" className="btn" onClick={() => setOpen(true)}>Show me</button>
            </div>
            {open && <TipSteps tip={tip} onClose={() => setOpen(false)} onDone={done} />}
        </section>
    );
}
