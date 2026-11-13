import { useEffect, useRef, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Link } from "react-router";
import { ApiError, type Referee, useAccount } from "../api.ts";
import { initials, storageSize } from "../format.ts";
import { type Attachment, NoRoomForPhoto, type PhotoOwner, uploadPhoto, useAccountStorage, usePhotoChanges, usePhotos, useRefereePictures } from "../photos.ts";
import { CropPhoto } from "./CropPhoto.tsx";
import { Icon } from "./ui.tsx";
import { newId } from "../ids.ts";

// Photos on a match, venue or referee (FILE-1 to FILE-5): a grid of thumbnails ending in a tile to
// add more (or drop them on the card), uploading as soon as they're chosen; tapping one opens it
// large with its caption, moving it first, and deleting it. A referee's first photo is their
// picture wherever they're shown (RefereeAvatar). What couldn't be added is said once, under the
// grid (FILE-7), and how much room is left from 80% used.

const nouns: Record<PhotoOwner, string> = { match: "match", venue: "venue", referee: "referee" };

interface Pending {
    key: string;
    preview: string;
}

/** What the last try couldn't add (FILE-7). */
interface Trouble {
    /** To try again. */
    files: File[];
    noRoom: number;
    others: number;
    problem?: string;
}

const nearlyFull = 0.8;

/**
 * The photos card, on a page (a card with a small title) or among a form's sections. Without a
 * record id (a record not saved yet) it says to save first.
 */
export function Photos({ recordType, recordId, inForm }: { recordType: PhotoOwner; recordId: string | undefined; inForm?: boolean }) {
    const photos = usePhotos(recordType, recordId);
    const { refresh } = usePhotoChanges();
    const [pending, setPending] = useState<Pending[]>([]);
    const [open, setOpen] = useState<number>();
    const [over, setOver] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const list = photos.data ?? [];
    const storage = useAccountStorage().data;
    const admin = useAccount().data?.admin ?? false;
    const [trouble, setTrouble] = useState<Trouble>();
    const limit = storage?.limitBytes;
    const used = storage?.usedBytes ?? 0;
    const full = limit !== undefined && used >= limit;

    const add = async (files: File[]) => {
        if (!recordId) {
            return;
        }
        const photoFiles = files.filter((f) => f.type.startsWith("image/"));
        const notPhotos = files.length - photoFiles.length;
        const left: Trouble = { files: [], noRoom: 0, others: notPhotos, problem: notPhotos > 0 ? "Only photos can be added here." : undefined };
        setTrouble(undefined);
        if (full) {
            setTrouble({ ...left, files: photoFiles, noRoom: photoFiles.length });
            return;
        }
        const added = photoFiles.map((file) => ({ file, key: newId(), preview: URL.createObjectURL(file) }));
        setPending((p) => [...p, ...added.map(({ key, preview }) => ({ key, preview }))]);
        // One at a time, in the order chosen, so they keep that order. Once one hasn't fitted, only
        // those small enough for what's left are sent.
        let room: number | undefined;
        for (const { file, key, preview } of added) {
            try {
                await uploadPhoto(recordType, recordId, file, room);
                await refresh();
                room = undefined;
            } catch (e) {
                left.files.push(file);
                const sizes = e instanceof ApiError ? e.body.storage : undefined;
                if (sizes?.limitBytes !== undefined) {
                    room = Math.max(0, sizes.limitBytes - sizes.usedBytes);
                }
                if (sizes || e instanceof NoRoomForPhoto) {
                    left.noRoom += 1;
                } else {
                    left.others += 1;
                    left.problem = (e as Error).message;
                }
            }
            setPending((p) => p.filter((x) => x.key !== key));
            URL.revokeObjectURL(preview);
        }
        await refresh();
        setTrouble(left.files.length > 0 || left.others > 0 ? left : undefined);
    };

    const usage = limit !== undefined && used / limit >= nearlyFull && <span className="photo-usage">{storageSize(used)} of {storageSize(limit)} used</span>;

    return (
        <section className={`card photos${inForm ? " form-section" : " photos-card"}${over ? " photos-over" : ""}`}
            onDragOver={(e) => { if (recordId && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void add([...e.dataTransfer.files]); }}>
            {inForm ? <h2 className="photos-title">Photos{usage}</h2> : <h3 className="card-title photos-title">Photos{usage}</h3>}
            {!recordId ? (
                <p className="muted photos-note">Save the {nouns[recordType]} to add photos.</p>
            ) : (
                <div className="photo-grid">
                    {list.map((a, i) => (
                        <button type="button" key={a.id} className="photo-tile" onClick={() => setOpen(i)} aria-label={a.caption ?? `Photo ${i + 1}`}>
                            <img src={a.thumbUrl} alt="" loading="lazy" />
                            {recordType === "referee" && i === 0 && <span className="chip photo-badge">Picture</span>}
                        </button>
                    ))}
                    {pending.map((p) => (
                        <div key={p.key} className="photo-tile photo-pending" role="status">
                            <img src={p.preview} alt="" />
                            <span className="photo-uploading">Uploading…</span>
                        </div>
                    ))}
                    {full ? (
                        <button type="button" className="photo-tile photo-add" onClick={() => setTrouble({ files: [], noRoom: 0, others: 0 })}>
                            <Icon name="info" size={22} />
                            <span>Storage full</span>
                        </button>
                    ) : (
                        <button type="button" className="photo-tile photo-add" onClick={() => input.current?.click()}>
                            <Icon name="camera" size={22} />
                            <span>Add photos</span>
                        </button>
                    )}
                </div>
            )}
            {trouble && (
                <div className="photo-notice" role="alert">
                    <Icon name="info" size={18} />
                    <div className="grow">
                        {(trouble.noRoom > 0 || trouble.others === 0) && limit !== undefined && (
                            <p>
                                <strong>{trouble.noRoom === 0 ? "Your storage is full." : trouble.noRoom === 1 ? "This photo didn't fit." : `${trouble.noRoom} photos didn't fit.`}</strong>{" "}
                                You've used {storageSize(used)} of {storageSize(limit)}. Delete some photos or tracks to make room{admin ? <>. <Link to="/settings/server/plans">Change the limit</Link></> : ", or ask an admin of this server for more."}
                            </p>
                        )}
                        {trouble.others > 0 && <p><strong>{trouble.others === 1 ? "A photo wasn't added." : `${trouble.others} photos weren't added.`}</strong> {trouble.problem}</p>}
                    </div>
                    {trouble.files.length > 0 && <button type="button" className="btn btn-sm" onClick={() => void add(trouble.files)}>Try again</button>}
                    <button type="button" className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={() => setTrouble(undefined)}><Icon name="close" size={16} /></button>
                </div>
            )}
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {open !== undefined && list[open] && (
                <PhotoViewer photos={list} index={open} recordType={recordType} onIndex={setOpen} onClose={() => setOpen(undefined)} />
            )}
        </section>
    );
}

function PhotoViewer({ photos, index, recordType, onIndex, onClose }: {
    photos: Attachment[]; index: number; recordType: PhotoOwner; onIndex: (i: number) => void; onClose: () => void;
}) {
    const photo = photos[index];
    const { change, remove } = usePhotoChanges();
    const [caption, setCaption] = useState(photo.caption ?? "");
    useEffect(() => setCaption(photo.caption ?? ""), [photo.id, photo.caption]);
    const saveCaption = () => {
        if (caption.trim() !== (photo.caption ?? "")) {
            change.mutate({ id: photo.id, caption: caption.trim() || null });
        }
    };
    const go = (step: number) => {
        saveCaption();
        onIndex((index + step + photos.length) % photos.length);
    };
    const first = recordType === "referee" ? "Make their picture" : "Move to first";
    // FILE-8: cropping it, with their picture's circle on a referee's first photo.
    const [cropping, setCropping] = useState(false);
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(isOpen) => { if (!isOpen) { saveCaption(); onClose(); } }}>
            <Modal className="modal photo-modal">
                <Dialog className="modal-dialog photo-dialog" aria-label={photo.caption ?? `Photo ${index + 1} of ${photos.length}`}>
                    {/* The arrow keys step through the photos, except while typing a caption. */}
                    <div onKeyDown={(e) => {
                        if ((e.target as HTMLElement).tagName !== "INPUT" && photos.length > 1 && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                            go(e.key === "ArrowLeft" ? -1 : 1);
                        }
                    }}>
                        <div className="photo-head">
                            <Heading slot="title" className="photo-title">Photo {index + 1} of {photos.length}</Heading>
                            <button type="button" className="icon-btn" aria-label="Close" onClick={() => { saveCaption(); onClose(); }}><Icon name="close" /></button>
                        </div>
                        <div className="photo-stage">
                            <img key={photo.id} src={photo.url} alt={photo.caption ?? ""} />
                            {photos.length > 1 && (
                                <>
                                    <button type="button" className="photo-step prev" aria-label="Previous photo" onClick={() => go(-1)}><Icon name="back" /></button>
                                    <button type="button" className="photo-step next" aria-label="Next photo" onClick={() => go(1)}><Icon name="next" /></button>
                                </>
                            )}
                        </div>
                        <input className="input photo-caption" value={caption} maxLength={500} placeholder="Add a caption" aria-label="Caption"
                            onChange={(e) => setCaption(e.target.value)} onBlur={saveCaption} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
                        <div className="row photo-actions">
                            {index > 0 && (
                                <button type="button" className="btn btn-sm" disabled={change.isPending}
                                    onClick={() => change.mutate({ id: photo.id, position: 0 }, { onSuccess: () => onIndex(0) })}>
                                    <Icon name={recordType === "referee" ? "portrait" : "photos"} />{first}
                                </button>
                            )}
                            <button type="button" className="btn btn-sm" onClick={() => setCropping(true)}><Icon name="crop" />Crop</button>
                            <a className="btn btn-sm" href={photo.url} download={`photo-${index + 1}.jpg`}><Icon name="download" />Download</a>
                            <div className="grow" />
                            <button type="button" className="btn btn-sm btn-danger" disabled={remove.isPending}
                                onClick={() => confirm("Delete this photo? It can't be got back.") && remove.mutate(photo.id, {
                                    onSuccess: () => (photos.length === 1 ? onClose() : onIndex(Math.min(index, photos.length - 2))),
                                })}>
                                <Icon name="trash" />Delete
                            </button>
                        </div>
                        {(change.error || remove.error) && <p className="error">{(change.error ?? remove.error)!.message}</p>}
                    </div>
                    {cropping && <CropPhoto photo={photo} circle={recordType === "referee" && index === 0} onClose={() => setCropping(false)} />}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** A referee's avatar: their picture (their first photo), else their initials. */
export function RefereeAvatar({ referee, name, large, photoOnly }: { referee?: Pick<Referee, "id">; name: string; large?: boolean; photoOnly?: boolean }) {
    const picture = useRefereePictures().get(referee?.id ?? "");
    const size = large ? " avatar-large" : "";
    // WEB-24: where the role already stands in for the initials (the match's officials), only a picture shows.
    return picture
        ? <div className={`avatar avatar-photo${size}`}><img src={picture.thumbUrl} alt="" loading="lazy" /></div>
        : photoOnly ? null : <div className={`avatar${size}`}>{initials(name)}</div>;
}
