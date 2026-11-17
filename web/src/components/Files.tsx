import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Heading, Menu, MenuItem, MenuTrigger, Modal, ModalOverlay, Popover } from "react-aria-components";
import { Link } from "react-router";
import { ApiError, type Competition, useAccount } from "../api.ts";
import { storageSize } from "../format.ts";
import {
    type FileKind, type FileOwner, type TextPreview, NoRoomForFile, canLookAt, describeFile, downloadUrl, fileAccept, fileKind, previewLines, readTextPreview, uploadFile, useFiles,
} from "../files.ts";
import { newId } from "../ids.ts";
import { type Attachment, useAccountStorage, usePhotoChanges } from "../photos.ts";
import { FromLink, Icon, type IconName, Loading } from "./ui.tsx";

// Files on a match, venue or competition (FILE-6 to FILE-12): a list under Photos (a competition's
// only attachments), each file with its icon or thumbnail, name, kind and size, Download, and in
// its menu Look at it (photos, CSV and text), Rename and Delete. Add files takes several at once,
// or files dropped on the card, each uploading at once, faded until it's in. A match also shows
// its competition's files, read-only. What couldn't be added is said once, under the list (FILE-7).

const nouns: Record<FileOwner, string> = { match: "match", venue: "venue", competition: "competition" };
const icons: Record<FileKind, IconName> = { pdf: "pdf", xlsx: "xlsx", csv: "csv", docx: "docx", txt: "txt", photo: "fileImage" };
const nearlyFull = 0.8;

interface Pending {
    key: string;
    name: string;
}

/** What the last try couldn't add (FILE-7). */
interface Trouble {
    /** To try again: the ones that didn't fit. */
    files: File[];
    noRoom: number;
    /** Refused for what they are or their size, each with the server's reason. */
    refused: { name: string; why: string }[];
}

/** The part of a name before its ending, and the ending, which a file keeps when renamed (FILE-10). */
function splitName(name: string): [string, string] {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/**
 * The Files card, on a page (a card with a small title) or among a form's sections. Without a
 * record id (a record not saved yet) it says to save first. On a match, `competition` adds the
 * competition's files under the match's own.
 */
export function Files({ recordType, recordId, inForm, competition }: { recordType: FileOwner; recordId: string | undefined; inForm?: boolean; competition?: Pick<Competition, "id" | "name"> }) {
    const files = useFiles(recordType, recordId);
    const theirs = useFiles("competition", competition?.id);
    const { refresh } = usePhotoChanges();
    const [pending, setPending] = useState<Pending[]>([]);
    const [over, setOver] = useState(false);
    const [looking, setLooking] = useState<Attachment>();
    const input = useRef<HTMLInputElement>(null);
    const list = files.data ?? [];
    const fromCompetition = theirs.data ?? [];
    const storage = useAccountStorage().data;
    const admin = useAccount().data?.admin ?? false;
    const [trouble, setTrouble] = useState<Trouble>();
    const limit = storage?.limitBytes;
    const used = storage?.usedBytes ?? 0;
    const full = limit !== undefined && used >= limit;

    const add = async (chosen: File[]) => {
        if (!recordId || chosen.length === 0) {
            return;
        }
        const left: Trouble = { files: [], noRoom: 0, refused: [] };
        setTrouble(undefined);
        if (full) {
            setTrouble({ ...left, files: chosen, noRoom: chosen.length });
            return;
        }
        const added = chosen.map((file) => ({ file, key: newId() }));
        setPending((p) => [...p, ...added.map(({ file, key }) => ({ key, name: file.name }))]);
        // One at a time, in the order chosen, so they keep that order. Once one hasn't fitted, only
        // those small enough for what's left are sent.
        let room: number | undefined;
        for (const { file, key } of added) {
            try {
                await uploadFile(recordType, recordId, file, room);
                await refresh();
                room = undefined;
            } catch (e) {
                const sizes = e instanceof ApiError ? e.body.storage : undefined;
                if (sizes?.limitBytes !== undefined) {
                    room = Math.max(0, sizes.limitBytes - sizes.usedBytes);
                }
                if (sizes || e instanceof NoRoomForFile) {
                    left.files.push(file);
                    left.noRoom += 1;
                } else {
                    left.refused.push({ name: file.name, why: (e as Error).message });
                }
            }
            setPending((p) => p.filter((x) => x.key !== key));
        }
        await refresh();
        setTrouble(left.noRoom > 0 || left.refused.length > 0 ? left : undefined);
    };

    const usage = limit !== undefined && used / limit >= nearlyFull && <span className="photo-usage">{storageSize(used)} of {storageSize(limit)} used</span>;
    const title = inForm ? <h2 className="photos-title">Files{usage}</h2> : <h3 className="card-title photos-title">Files{usage}</h3>;

    return (
        <section className={`card files${inForm ? " form-section" : " files-card"}${over ? " files-over" : ""}`}
            onDragOver={(e) => { if (recordId && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}>
            {title}
            {!recordId ? (
                <p className="muted files-note">Save the {nouns[recordType]} to add files.</p>
            ) : files.isLoading ? (
                <ul className="file-list" aria-busy><li className="file-row file-placeholder"><span className="file-tile" /><span className="file-main"><span className="placeholder-bar" style={{ width: "55%" }} /><span className="placeholder-bar" style={{ width: "30%" }} /></span></li></ul>
            ) : (
                <ul className="file-list">
                    {list.map((f) => <FileRow key={f.id} file={f} onLook={() => setLooking(f)} />)}
                    {pending.map((p) => (
                        <li key={p.key} className="file-row file-pending" role="status">
                            <span className="file-tile"><Icon name="upload" size={22} /></span>
                            <span className="file-main"><span className="file-name">{p.name}</span><span className="file-sub">Uploading…</span></span>
                        </li>
                    ))}
                    <li>
                        {full ? (
                            <button type="button" className="file-add" onClick={() => setTrouble({ files: [], noRoom: 0, refused: [] })}>
                                <Icon name="info" size={20} />
                                <span><strong>Storage full</strong><small>Tap to see why</small></span>
                            </button>
                        ) : (
                            <button type="button" className="file-add" onClick={() => input.current?.click()}>
                                <Icon name="addFiles" size={20} />
                                <span><strong>Add files</strong><small>PDF, spreadsheets, Word, text or photos, up to 20 MB each</small></span>
                            </button>
                        )}
                    </li>
                </ul>
            )}
            {trouble && <FileTrouble trouble={trouble} limit={limit} used={used} admin={admin} onRetry={() => void add(trouble.files)} onDismiss={() => setTrouble(undefined)} />}
            {competition && fromCompetition.length > 0 && (
                <>
                    {/* FILE-6: the competition's files, read-only here; they're changed on its page. */}
                    <h4 className="files-from">From the competition · <FromLink to={`/competitions/${competition.id}`}>{competition.name}</FromLink></h4>
                    <ul className="file-list">
                        {fromCompetition.map((f) => <FileRow key={f.id} file={f} readOnly onLook={() => setLooking(f)} />)}
                    </ul>
                </>
            )}
            <input ref={input} type="file" accept={fileAccept} multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {looking && <FileViewer file={looking} onClose={() => setLooking(undefined)} />}
        </section>
    );
}

function FileTrouble({ trouble, limit, used, admin, onRetry, onDismiss }: { trouble: Trouble; limit?: number; used: number; admin: boolean; onRetry: () => void; onDismiss: () => void }) {
    // The server ends each refusal with what it takes; that's said once, after them all.
    const taken = trouble.refused.map((r) => r.why.match(/\s*(LawFive keeps .*)$/)?.[1]).find(Boolean);
    const { noRoom } = trouble;
    const refused = trouble.refused.map((r) => ({ ...r, why: taken ? r.why.replace(` ${taken}`, "").replace(taken, "") : r.why }));
    return (
        <div className="photo-notice" role="alert">
            <Icon name="info" size={18} />
            <div className="grow">
                {(noRoom > 0 || refused.length === 0) && limit !== undefined && (
                    <p>
                        <strong>{noRoom === 0 ? "Your storage is full." : noRoom === 1 ? "This file didn't fit." : `${noRoom} files didn't fit.`}</strong>{" "}
                        You've used {storageSize(used)} of {storageSize(limit)}. Delete some photos, files or tracks to make room{admin ? <>. <Link to="/settings/server/plans">Change the limit</Link></> : ", or ask an admin of this server for more."}
                    </p>
                )}
                {refused.length === 1 && <p><strong>{refused[0].name} wasn't added.</strong> {refused[0].why}</p>}
                {refused.length > 1 && (
                    <>
                        <p><strong>{refused.length} files weren't added.</strong></p>
                        <ul className="file-refusals">{refused.map((r, i) => <li key={i}><strong>{r.name}:</strong> {r.why}</li>)}</ul>
                    </>
                )}
                {taken && <p>{taken}</p>}
            </div>
            {trouble.files.length > 0 && <button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button>}
            <button type="button" className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}><Icon name="close" size={16} /></button>
        </div>
    );
}

/** One file: its picture, name and line, Download, and (unless it's read-only here) a menu to look, rename or delete. */
function FileRow({ file, readOnly, onLook }: { file: Attachment; readOnly?: boolean; onLook: () => void }) {
    const { change, remove } = usePhotoChanges();
    const name = file.name ?? "File";
    const [base, ending] = splitName(name);
    const [renaming, setRenaming] = useState(false);
    const [draft, setDraft] = useState(base);
    const field = useRef<HTMLInputElement>(null);
    const kind = fileKind(file);
    const lookable = canLookAt(file);
    // The new name while it's saved, so the row doesn't flick back to the old one.
    const shownName = change.isPending && change.variables?.name ? change.variables.name : name;
    useEffect(() => {
        if (renaming) {
            field.current?.select();
        }
    }, [renaming]);
    const finish = (save: boolean) => {
        setRenaming(false);
        if (save && draft.trim() && draft.trim() !== base) {
            change.mutate({ id: file.id, name: `${draft.trim()}${ending}` });
        }
    };
    // FILE-12: a thumbnail when one was made (a photo, or a PDF added on a phone), else its kind's icon.
    const thumb = file.hasThumb ?? kind === "photo";
    return (
        <li className={`file-row${change.isPending || remove.isPending ? " file-pending" : ""}`}>
            <span className={`file-tile${thumb ? " file-thumb" : ""}`}>{thumb ? <img src={file.thumbUrl} alt="" loading="lazy" /> : <Icon name={icons[kind]} size={22} />}</span>
            <span className="file-main">
                {renaming ? (
                    <span className="file-rename">
                        <input ref={field} className="input" value={draft} maxLength={120} aria-label={`New name for ${name}`}
                            onChange={(e) => setDraft(e.target.value)} onBlur={() => finish(true)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { finish(false); } }} />
                        <span className="muted">{ending}</span>
                    </span>
                ) : lookable ? (
                    <button type="button" className="file-name" onClick={onLook} title={name}>{shownName}</button>
                ) : (
                    <a className="file-name" href={downloadUrl(file)} download={name} title={name}>{shownName}</a>
                )}
                <span className="file-sub">{remove.isPending ? "Deleting…" : describeFile(file)}</span>
                {(change.error || remove.error) && <span className="error">{(change.error ?? remove.error)!.message}</span>}
            </span>
            <span className="file-actions">
                <a className="icon-btn" href={downloadUrl(file)} download={name} aria-label={`Download ${name}`} title="Download"><Icon name="download" size={18} /></a>
                {!readOnly && (
                    <MenuTrigger>
                        <Button className="icon-btn" aria-label={`More for ${name}`}><Icon name="more" size={18} /></Button>
                        <Popover className="menu-popover" placement="bottom end" offset={4}>
                            <Menu className="menu" aria-label={name} onAction={(key) => {
                                if (key === "look") {
                                    onLook();
                                } else if (key === "rename") {
                                    setDraft(base);
                                    setRenaming(true);
                                } else if (key === "delete" && confirm(`Delete ${name}? It can't be got back.`)) {
                                    remove.mutate(file.id);
                                }
                            }}>
                                {lookable && <MenuItem id="look" className="menu-item" textValue="Look at it"><Icon name="look" size={18} /><span><strong>Look at it</strong><small>{kind === "photo" ? "Shown large" : `The first ${previewLines} lines, as text`}</small></span></MenuItem>}
                                <MenuItem id="rename" className="menu-item" textValue="Rename"><Icon name="edit" size={18} /><span><strong>Rename</strong><small>It stays {ending ? `a ${ending.slice(1).toUpperCase()} file` : "the same kind"}</small></span></MenuItem>
                                <MenuItem id="delete" className="menu-item menu-item-danger" textValue="Delete"><Icon name="trash" size={18} /><span><strong>Delete</strong><small>For good</small></span></MenuItem>
                            </Menu>
                        </Popover>
                    </MenuTrigger>
                )}
            </span>
        </li>
    );
}

/** A photo large, or a CSV or text file's first lines as text in the monospaced font, never as a page (FILE-12). */
function FileViewer({ file, onClose }: { file: Attachment; onClose: () => void }) {
    const name = file.name ?? "File";
    const photo = fileKind(file) === "photo";
    const [text, setText] = useState<TextPreview>();
    const [problem, setProblem] = useState<string>();
    useEffect(() => {
        if (!photo) {
            readTextPreview(file).then(setText, (e: Error) => setProblem(e.message));
        }
    }, [file, photo]);
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => !isOpen && onClose()}>
            <Modal className="modal photo-modal file-modal">
                <Dialog className="modal-dialog photo-dialog" aria-label={name}>
                    <div className="photo-head">
                        <Heading slot="title" className="photo-title file-title">{name}</Heading>
                        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
                    </div>
                    {photo ? (
                        <div className="photo-stage"><img src={file.url} alt={name} /></div>
                    ) : problem ? (
                        <p className="error">{problem}</p>
                    ) : !text ? (
                        <div className="file-text file-text-loading"><Loading /></div>
                    ) : text.lines.length === 0 ? (
                        <p className="muted">This file is empty.</p>
                    ) : (
                        <pre className={`file-text${fileKind(file) === "txt" ? " file-text-wrap" : ""}`} tabIndex={0} aria-label={`The first lines of ${name}`}>{text.lines.join("\n")}</pre>
                    )}
                    <div className="row photo-actions">
                        <span className="muted file-viewer-note">{photo ? describeFile(file) : text?.more ? `The first ${previewLines} lines · ${describeFile(file)}` : describeFile(file)}</span>
                        <div className="grow" />
                        <a className="btn btn-sm" href={downloadUrl(file)} download={name}><Icon name="download" />Download</a>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
