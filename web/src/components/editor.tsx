import { useEffect, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Blocker, useBlocker, useLocation, useNavigate } from "react-router";
import { ApiError, type Collection, type Draft, type RecordOf, useDelete, useRecord, useSave } from "../api.ts";
import { Icon } from "./ui.tsx";

// Editing one record: loads it (or starts from a blank one), keeps the draft, saves with the
// version it was loaded at (the server answers 409 if it changed meanwhile), deletes.

export function useEditor<C extends Collection>(collection: C, id: string | undefined, blank: () => Draft<C>) {
    const isNew = id === undefined;
    const record = useRecord(collection, id);
    const [draft, setDraft] = useState<Draft<C> | undefined>(isNew ? blank : undefined);
    const save = useSave(collection);
    const remove = useDelete(collection);
    const navigate = useNavigate();
    // WEB-16: a page opened from elsewhere keeps its way back through being edited.
    const { state: cameFrom } = useLocation();
    // APP-18: the draft as it started, and leaving on purpose (saved or deleted) rather than losing it.
    const started = useRef<string | undefined>(undefined);
    const leaving = useRef(false);
    if (draft && started.current === undefined) {
        started.current = JSON.stringify(draft);
    }
    const dirty = !!draft && JSON.stringify(draft) !== started.current;
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (!dirty) {
            return;
        }
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

    useEffect(() => {
        if (record.data && !draft) {
            const { updatedAt, deletedAt, ...rest } = record.data;
            setDraft(rest as Draft<C>);
        }
    }, [record.data, draft]);

    const update = (change: Partial<Draft<C>>) => setDraft((d) => (d ? { ...d, ...change } : d));
    /** Starts the draft again from a record saved elsewhere (after a merge), dropping unsaved edits. */
    const reset = (saved: RecordOf<C>) => {
        const { updatedAt, deletedAt, ...rest } = saved;
        started.current = JSON.stringify(rest);
        setDraft(rest as Draft<C>);
    };
    const error = errorText(save.error ?? remove.error);

    return {
        draft,
        /** The record as last saved, once loaded. */
        saved: record.data,
        reset,
        isNew,
        loading: !draft,
        update,
        error,
        saving: save.isPending,
        blocker,
        save: (then: (saved: RecordOf<C>) => string, prepare: (draft: Draft<C>) => Draft<C> = (d) => d) =>
            draft && save.mutate(prepare(draft), { onSuccess: (saved) => { leaving.current = true; navigate(then(saved), { state: cameFrom }); } }),
        remove: (then: string) => record.data && remove.mutate(record.data, { onSuccess: () => { leaving.current = true; navigate(then); } }),
    };
}

function errorText(error: Error | null): string | undefined {
    if (!error) {
        return undefined;
    }
    if (error instanceof ApiError && error.status === 409 && error.body.current) {
        return "Someone changed this on another device while you were editing. Reload to see their version.";
    }
    if (error instanceof ApiError && error.body.issues?.length) {
        return error.body.issues.map((i) => `${i.path.join(" › ") || "Record"}: ${i.message}`).join("; ");
    }
    return error.message;
}

export function FormActions({ editor, onCancel, onDelete, deleteLabel, deleteMessage }: {
    editor: { error?: string; saving: boolean; isNew: boolean; blocker?: Blocker };
    onCancel: () => void;
    onDelete?: () => void;
    deleteLabel?: string;
    /** Said under the question when deleting, such as what goes with it. */
    deleteMessage?: string;
}) {
    return (
        <>
            {editor.error && <p className="error">{editor.error}</p>}
            <div className="form-actions">
                {!editor.isNew && onDelete && (
                    // On phones only the trash shows, so the bar fits; the label stays its name.
                    <button type="button" className="btn btn-danger form-delete" aria-label={deleteLabel ?? "Delete"} onClick={() => confirm(`${deleteLabel ?? "Delete"}?${deleteMessage ? `\n\n${deleteMessage}` : ""}`) && onDelete()}>
                        <Icon name="trash" /><span className="form-delete-label">{deleteLabel ?? "Delete"}</span>
                    </button>
                )}
                <div className="grow" />
                <button type="button" className="btn" onClick={onCancel}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editor.saving}>{editor.saving ? "Saving…" : "Save"}</button>
            </div>
            {editor.blocker?.state === "blocked" && <LeavePrompt blocker={editor.blocker} />}
        </>
    );
}

/** APP-18: asked before leaving a form with changes, whichever way they're leaving. */
function LeavePrompt({ blocker }: { blocker: Blocker }) {
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && blocker.reset?.()}>
            <Modal className="modal">
                <Dialog className="modal-dialog" role="alertdialog">
                    <Heading slot="title">Are you sure you want to leave?</Heading>
                    <p className="muted">You have unsaved changes. If you leave now, they'll be lost.</p>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-danger" onClick={() => blocker.proceed?.()}>Leave</button>
                        <div className="grow" />
                        <button type="button" className="btn btn-primary" autoFocus onClick={() => blocker.reset?.()}>Keep editing</button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
