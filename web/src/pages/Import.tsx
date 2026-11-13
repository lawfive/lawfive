import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, DropZone, FileTrigger, Heading, Modal, ModalOverlay, isFileDropItem } from "react-aria-components";
import { type MatchImportFileResult, type MatchImportResult, upload } from "../api.ts";
import { Icon } from "../components/ui.tsx";
import { formatShortDay, formatTime } from "../format.ts";

/** The file types the picker offers. The server reads the file (IMP-2). */
const acceptedTypes = [".csv", ".tsv", ".txt", ".xlsx", ".json", "text/csv", "text/tab-separated-values", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
const maxRows = 1000;

/** How this browser writes dates (7/11/2026 is 7 November in most places, 11 July in the US). */
function dateOrder(): "dmy" | "mdy" {
    const parts = new Intl.DateTimeFormat(undefined).formatToParts(new Date(2026, 10, 7)).map((p) => p.type);
    return parts.indexOf("day") < parts.indexOf("month") ? "dmy" : "mdy";
}

// Importing matches (IMP-1 to IMP-8): example files to start from, a big drop area (or a file
// picker), then a check of every row (a dry run) before anything is saved, and what happened.

export const examples = [
    { href: "/examples/lawfive-matches.csv", label: "CSV", icon: "csv" },
    { href: "/examples/lawfive-matches.xlsx", label: "Excel", icon: "xlsx" },
    { href: "/examples/lawfive-matches.json", label: "JSON", icon: "json" },
] as const;

export function ImportMatches({ onClose }: { onClose: () => void }) {
    const client = useQueryClient();
    const [file, setFile] = useState<File>();
    const send = (picked: File, dryRun: boolean) => {
        const form = new FormData();
        form.set("file", picked);
        form.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);
        form.set("dateOrder", dateOrder());
        form.set("dryRun", String(dryRun));
        return upload<MatchImportFileResult>("/import/file", form);
    };
    const check = useMutation({ mutationFn: (picked: File) => send(picked, true) });
    const run = useMutation({
        mutationFn: (picked: File) => send(picked, false),
        onSuccess: () => Promise.all(["matches", "venues", "competitions", "referees"].map((key) => client.invalidateQueries({ queryKey: [key] }))),
    });

    const choose = (picked: File | undefined) => {
        if (!picked) {
            return;
        }
        run.reset();
        setFile(picked);
        check.mutate(picked);
    };
    const startOver = () => {
        setFile(undefined);
        check.reset();
        run.reset();
    };

    const preview = check.data;
    const done = run.data;
    const busy = check.isPending || run.isPending;
    const lineOf = (row: number) => `${preview?.file.kind === "json" ? "Item" : "Row"} ${preview?.file.lines[row - 1] ?? row}`;

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!busy} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal import-modal">
                <Dialog className="modal-dialog">
                    <Heading slot="title">Import matches</Heading>

                    {done ? (
                        <>
                            <div className="import-done">
                                <div className="waiting-icon"><Icon name="check" size={26} /></div>
                                <p><strong>{describeDone(done)}</strong></p>
                                {done.skipped > 0 && <p className="muted">{done.skipped} {done.skipped === 1 ? "row was" : "rows were"} skipped; fix {done.skipped === 1 ? "it" : "them"} in the file and import it again. The matches already imported will be updated, not copied.</p>}
                            </div>
                            {done.skipped > 0 && <ImportRows result={done} lineOf={lineOf} onlyProblems />}
                            <div className="modal-actions">
                                <button type="button" className="btn" onClick={startOver}>Import another file</button>
                                <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                            </div>
                        </>
                    ) : preview && file ? (
                        <>
                            <p className="import-file"><Icon name="file" size={18} /><strong>{file.name}</strong><span className="muted">· {preview.file.lines.length} {preview.file.lines.length === 1 ? "row" : "rows"}</span></p>
                            <div className="import-summary">
                                {preview.added > 0 && <span className="chip chip-brand">{preview.added} new</span>}
                                {preview.updated > 0 && <span className="chip chip-blue">{preview.updated} {preview.updated === 1 ? "update" : "updates"}</span>}
                                {preview.skipped > 0 && <span className="chip chip-red">{preview.skipped} with problems</span>}
                            </div>
                            <Adds result={preview} />
                            {preview.ignoredColumns.length > 0 && (
                                <p className="import-note muted">Columns it doesn't know, and skips: {preview.ignoredColumns.join(", ")}.</p>
                            )}
                            <ImportRows result={preview} lineOf={lineOf} />
                            {run.error && <p className="error">{run.error.message}</p>}
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" disabled={busy} onClick={startOver}>Choose another file</button>
                                <button type="button" className="btn btn-primary" disabled={busy || preview.added + preview.updated === 0} onClick={() => run.mutate(file)}>
                                    <Icon name="upload" />
                                    {run.isPending ? "Importing…" : `Import ${preview.added + preview.updated} ${preview.added + preview.updated === 1 ? "match" : "matches"}`}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="muted import-intro">
                                Add matches from a spreadsheet or a JSON file, one match a row. A row with the match number of a match you already have updates it, changing only the columns it fills in.
                            </p>
                            <div className="import-examples">
                                <span className="muted">Start from an example:</span>
                                {examples.map((e) => <a key={e.label} className="btn btn-sm" href={e.href} download><Icon name={e.icon} />{e.label}</a>)}
                                <a className="link import-guide-link" href="/matches/import/columns" target="_blank" rel="noreferrer"><Icon name="table" size={17} />What each column means</a>
                            </div>
                            <DropZone className="drop-zone" aria-label="Drop a file to import"
                                getDropOperation={() => "copy"}
                                onDrop={async (e) => {
                                    const item = e.items.find(isFileDropItem);
                                    if (item) {
                                        choose(await item.getFile());
                                    }
                                }}>
                                <div className="drop-icon" aria-hidden><Icon name="upload" size={28} /></div>
                                <strong>{busy ? "Reading and checking…" : "Drop a file here"}</strong>
                                <span className="muted">or</span>
                                <FileTrigger acceptedFileTypes={acceptedTypes} onSelect={(files) => choose(files?.[0] ?? undefined)}>
                                    <Button className="btn btn-primary" isDisabled={busy}><Icon name="file" />Choose a file</Button>
                                </FileTrigger>
                                <span className="muted drop-hint">CSV, Excel (.xlsx) or JSON, up to {maxRows} matches</span>
                            </DropZone>
                            {check.error && <p className="error">{check.error.message}</p>}
                            <div className="modal-actions">
                                <button type="button" className="btn" onClick={onClose}>Cancel</button>
                            </div>
                        </>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function describeDone(done: MatchImportResult): string {
    const parts = [done.added && `added ${done.added} ${done.added === 1 ? "match" : "matches"}`, done.updated && `updated ${done.updated}`].filter(Boolean);
    return parts.length ? `Done: ${parts.join(" and ")}.` : "Nothing was imported.";
}

/** The venues, competitions and referees the import adds, because none had those names. */
function Adds({ result }: { result: MatchImportResult }) {
    const { venues, competitions, referees } = result.created;
    const groups = [["venues", venues], ["competitions", competitions], ["referees", referees]] as const;
    if (groups.every(([, names]) => names.length === 0)) {
        return null;
    }
    return (
        <p className="import-note">
            Also adds {groups.filter(([, names]) => names.length).map(([kind, names]) => (
                <span key={kind}>{kind}: <strong>{names.join(", ")}</strong>; </span>
            ))}
            <span className="muted">they're matched by name, so check the spelling.</span>
        </p>
    );
}

/** Every row: where it is in the file, the match, what happens to it, and any problems. */
function ImportRows({ result, lineOf, onlyProblems }: { result: MatchImportResult; lineOf: (row: number) => string; onlyProblems?: boolean }) {
    const rows = onlyProblems ? result.rows.filter((r) => r.action === "skip") : result.rows;
    return (
        <ol className="import-rows">
            {rows.map((r) => (
                <li key={r.row} className={r.action === "skip" ? "has-problems" : ""}>
                    <span className="import-line">{lineOf(r.row)}</span>
                    <div className="grow">
                        <div className="import-title">
                            {r.kickoff && <span className="muted">{formatShortDay(r.kickoff)}, {formatTime(r.kickoff)} · </span>}
                            {r.title}
                        </div>
                        {r.problems.length > 0 && <ul className="import-problems">{r.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
                    </div>
                    <span className={`chip ${r.action === "add" ? "chip-brand" : r.action === "update" ? "chip-blue" : "chip-red"}`}>
                        {r.action === "add" ? "New" : r.action === "update" ? "Update" : "Skipped"}
                    </span>
                </li>
            ))}
        </ol>
    );
}
