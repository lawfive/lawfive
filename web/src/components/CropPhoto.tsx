import { useEffect, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Attachment, type CropFrame, replacePhoto, turned, usePhotoChanges } from "../photos.ts";
import { Icon } from "./ui.tsx";

// Cropping and turning a photo (FILE-8): the whole photo with a frame to drag and its corners to
// pull, darker outside it, and a quarter turn. On a referee's first photo a faint circle in the
// frame shows what their picture will be, as pictures are the middle of the photo, round. Saving
// sends the cropped photo in place of the old one; it can't be uncropped afterward.

const whole: CropFrame = { x: 0, y: 0, w: 1, h: 1 };
/** The smallest the frame gets, as a share of each side. */
const least = 0.08;

type Grab = "move" | "nw" | "ne" | "sw" | "se";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The frame after dragging a part of it by (dx, dy), kept inside the photo. */
function dragged(start: CropFrame, grab: Grab, dx: number, dy: number): CropFrame {
    if (grab === "move") {
        return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
    }
    let { x, y, w, h } = start;
    if (grab.includes("w")) {
        const nx = clamp(x + dx, 0, x + w - least);
        w += x - nx;
        x = nx;
    } else {
        w = clamp(w + dx, least, 1 - x);
    }
    if (grab.includes("n")) {
        const ny = clamp(y + dy, 0, y + h - least);
        h += y - ny;
        y = ny;
    } else {
        h = clamp(h + dy, least, 1 - y);
    }
    return { x, y, w, h };
}

export function CropPhoto({ photo, circle, onClose }: { photo: Attachment; circle: boolean; onClose: (saved?: Attachment) => void }) {
    const { refresh } = usePhotoChanges();
    const [image, setImage] = useState<ImageBitmap>();
    const [quarters, setQuarters] = useState(0);
    const [shown, setShown] = useState<string>();
    const [frame, setFrame] = useState<CropFrame>(whole);
    const [size, setSize] = useState({ w: 0, h: 0 });
    const [saving, setSaving] = useState(false);
    const [problem, setProblem] = useState<string>();
    const picture = useRef<HTMLImageElement>(null);
    const grabbing = useRef<{ grab: Grab; x: number; y: number; start: CropFrame }>(undefined);

    useEffect(() => {
        let gone = false;
        void fetch(photo.url, { credentials: "include" }).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((b) => (gone ? b.close() : setImage(b)))
            .catch(() => setProblem("The photo couldn't be opened."));
        return () => { gone = true; };
    }, [photo.url]);

    // The photo as turned, to show under the frame.
    useEffect(() => {
        if (!image) {
            return;
        }
        let url: string | undefined;
        turned(image, quarters).toBlob((blob) => {
            if (blob) {
                url = URL.createObjectURL(blob);
                setShown(url);
            }
        }, "image/jpeg", 0.9);
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [image, quarters]);

    useEffect(() => {
        const element = picture.current;
        if (!element) {
            return;
        }
        const measure = new ResizeObserver(() => setSize({ w: element.clientWidth, h: element.clientHeight }));
        measure.observe(element);
        return () => measure.disconnect();
    }, [shown]);

    const start = (grab: Grab) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        grabbing.current = { grab, x: e.clientX, y: e.clientY, start: frame };
    };
    const move = (e: React.PointerEvent) => {
        const g = grabbing.current;
        if (g && size.w && size.h) {
            setFrame(dragged(g.start, g.grab, (e.clientX - g.x) / size.w, (e.clientY - g.y) / size.h));
        }
    };
    const stop = () => { grabbing.current = undefined; };
    // The arrow keys move the frame; with Shift they change its size.
    const keys = (e: React.KeyboardEvent) => {
        const step = 0.02;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) {
            e.preventDefault();
            setFrame(dragged(frame, e.shiftKey ? "se" : "move", d[0], d[1]));
        }
    };
    const turn = () => {
        // The frame turns with the photo.
        setFrame((f) => ({ x: 1 - f.y - f.h, y: f.x, w: f.h, h: f.w }));
        setQuarters((q) => (q + 1) % 4);
    };
    const save = async () => {
        if (!image) {
            return;
        }
        setSaving(true);
        setProblem(undefined);
        try {
            const saved = await replacePhoto(photo, image, quarters, frame);
            await refresh();
            onClose(saved);
        } catch (e) {
            setProblem((e as Error).message);
            setSaving(false);
        }
    };
    const unchanged = quarters === 0 && frame.x === 0 && frame.y === 0 && frame.w === 1 && frame.h === 1;
    const px = { left: frame.x * size.w, top: frame.y * size.h, width: frame.w * size.w, height: frame.h * size.h };
    const round = Math.min(px.width, px.height);

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!saving} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal photo-modal">
                <Dialog className="modal-dialog photo-dialog" aria-label="Crop photo">
                    <div className="photo-head">
                        <Heading slot="title" className="photo-title">Crop photo</Heading>
                        <button type="button" className="icon-btn" aria-label="Close" onClick={() => onClose()}><Icon name="close" /></button>
                    </div>
                    <div className="photo-stage crop-stage" onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
                        {shown ? (
                            <div className="crop-area">
                                <img ref={picture} src={shown} alt="" draggable={false} />
                                {[
                                    { left: 0, top: 0, width: size.w, height: px.top },
                                    { left: 0, top: px.top + px.height, width: size.w, height: size.h - px.top - px.height },
                                    { left: 0, top: px.top, width: px.left, height: px.height },
                                    { left: px.left + px.width, top: px.top, width: size.w - px.left - px.width, height: px.height },
                                ].map((shade, i) => <span key={i} className="crop-shade" style={shade} aria-hidden />)}
                                <div className="crop-frame" style={px} tabIndex={0} role="group" aria-label="The part to keep: drag it, or use the arrow keys (with Shift to change its size)"
                                    onPointerDown={start("move")} onKeyDown={keys}>
                                    {circle && <span className="crop-circle" style={{ width: round, height: round }} aria-hidden />}
                                    {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                                        <span key={corner} className={`crop-handle ${corner}`} onPointerDown={start(corner)} aria-hidden />
                                    ))}
                                </div>
                            </div>
                        ) : !problem && <span className="muted">Opening…</span>}
                    </div>
                    {circle && <p className="muted crop-note">The circle is their picture: the middle of the photo, round.</p>}
                    <div className="row photo-actions">
                        <button type="button" className="btn btn-sm" disabled={!image || saving} onClick={turn}><Icon name="turn" />Turn</button>
                        <button type="button" className="btn btn-sm" disabled={unchanged || saving} onClick={() => { setFrame(whole); setQuarters(0); }}>Reset</button>
                        <div className="grow" />
                        <button type="button" className="btn btn-sm" disabled={saving} onClick={() => onClose()}>Cancel</button>
                        <button type="button" className="btn btn-sm btn-primary" disabled={unchanged || saving || !image} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
                    </div>
                    {problem && <p className="error">{problem}</p>}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
