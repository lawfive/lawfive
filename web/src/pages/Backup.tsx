import type * as schema from "@lawfive/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { z } from "zod";
import { ApiError } from "../api.ts";
import { Icon } from "../components/ui.tsx";
import { SettingsRow } from "./Settings.tsx";

// Download everything and restore (DATA-2, DATA-4), in Settings → Your data: the whole account as a
// zip, and a zip merged back in, with what it added, updated and left alone.

type RestoreResult = z.infer<typeof schema.RestoreResult>;

const collectionNames: Record<string, string> = {
    matches: "Matches", "match-records": "Match reports", venues: "Venues", referees: "Referees",
    competitions: "Competitions", "match-templates": "Templates", settings: "Settings",
};

export function BackupRows() {
    const client = useQueryClient();
    const input = useRef<HTMLInputElement>(null);
    const restore = useMutation({
        mutationFn: async (file: File) => {
            const res = await fetch("/v1/restore", { method: "POST", credentials: "include", headers: { "content-type": "application/zip" }, body: file });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new ApiError(res.status, data);
            }
            return data as RestoreResult;
        },
        // Everything may have changed.
        onSuccess: () => client.invalidateQueries(),
    });
    return (
        <>
            <SettingsRow label="Download everything" hint="Your matches, match reports, venues, referees, competitions, templates, settings, tracks and photos, as one zip: a backup, or for moving to another LawFive server.">
                <a className="btn" href="/v1/export" download><Icon name="download" />Download</a>
            </SettingsRow>
            <SettingsRow label="Restore from an export" hint="Adds what a LawFive export has that this account doesn't. Where both have something, the one changed last is kept, so restoring twice changes nothing more.">
                <button className="btn" disabled={restore.isPending} onClick={() => input.current?.click()}>
                    <Icon name="upload" />{restore.isPending ? "Restoring…" : "Restore"}
                </button>
                <input ref={input} type="file" accept=".zip,application/zip" hidden
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) { restore.mutate(file); } e.target.value = ""; }} />
            </SettingsRow>
            {(restore.data || restore.error) && (
                <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && restore.reset()}>
                    <Modal className="modal key-modal">
                        <Dialog className="modal-dialog">
                            <Heading slot="title">{restore.data ? "Restored" : "Couldn't restore"}</Heading>
                            {restore.error && <p className="error">{restore.error.message}</p>}
                            {restore.data && <RestoreSummary result={restore.data} />}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-primary" onClick={() => restore.reset()}>Done</button>
                            </div>
                        </Dialog>
                    </Modal>
                </ModalOverlay>
            )}
        </>
    );
}

function RestoreSummary({ result }: { result: RestoreResult }) {
    const rows = [
        ...Object.entries(result.records).map(([name, count]) => [collectionNames[name] ?? name, count] as const),
        ["Tracks", result.tracks] as const,
        ["Photos", result.photos] as const,
    ].filter(([, c]) => c.added + c.updated + c.unchanged > 0);
    return (
        <>
            {rows.length === 0 ? <p className="muted">The export had nothing in it.</p> : (
                <table className="data-table restore-table">
                    <thead><tr><th scope="col" /><th scope="col">Added</th><th scope="col">Updated</th><th scope="col">Already here</th></tr></thead>
                    <tbody>{rows.map(([name, c]) => <tr key={name}><th scope="row">{name}</th><td>{c.added}</td><td>{c.updated}</td><td>{c.unchanged}</td></tr>)}</tbody>
                </table>
            )}
            {result.problems.length > 0 && (
                <>
                    <p className="settings-label" style={{ marginTop: 14 }}>Not restored</p>
                    <ul className="restore-problems">{result.problems.map((p, i) => <li key={i} className="muted">{p}</li>)}</ul>
                </>
            )}
        </>
    );
}
