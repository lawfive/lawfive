import type * as schema from "@lawfive/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { z } from "zod";
import { ApiError, request } from "../api.ts";
import { Icon, Loading } from "./ui.tsx";

// A match's share link (DATA-7), from the match page: off until turned on, then the address with
// Copy, New address and Turn off, and what the page shows and doesn't.

type MatchShare = z.infer<typeof schema.MatchShare>;

export function ShareMatch({ matchId }: { matchId: string }) {
    return (
        <DialogTrigger>
            <Button className="btn"><Icon name="share" />Share</Button>
            <ModalOverlay className="modal-overlay" isDismissable>
                <Modal className="modal key-modal">
                    <Dialog className="modal-dialog">
                        {({ close }) => <ShareDialog matchId={matchId} onClose={close} />}
                    </Dialog>
                </Modal>
            </ModalOverlay>
        </DialogTrigger>
    );
}

function ShareDialog({ matchId, onClose }: { matchId: string; onClose: () => void }) {
    const client = useQueryClient();
    const key = ["share", matchId];
    const share = useQuery({
        queryKey: key,
        queryFn: async () => {
            try {
                return await request<MatchShare>("GET", `/matches/${matchId}/share`);
            } catch (error) {
                if (error instanceof ApiError && error.status === 404) {
                    return null;
                }
                throw error;
            }
        },
    });
    const make = useMutation({ mutationFn: () => request<MatchShare>("POST", `/matches/${matchId}/share`), onSuccess: (made) => client.setQueryData(key, made) });
    const off = useMutation({ mutationFn: () => request("DELETE", `/matches/${matchId}/share`), onSuccess: () => client.setQueryData(key, null) });
    const [copied, setCopied] = useState(false);
    const copy = async (url: string) => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    const data = share.data;
    return (
        <>
            <Heading slot="title">Share this match</Heading>
            <p className="muted">
                A page anyone with the link can open, without an account: the teams, score and match log (goals, and cards with numbers and codes), and your distance, figures and heatmap.
                Never your notes, the fee, the crew, anyone's contact details, names or photos.
            </p>
            {share.isLoading ? <Loading inline /> : data ? (
                <>
                    <div className="key-reveal">
                        <code className="code-text">{data.url}</code>
                        <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void copy(data.url)}>
                            <Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}
                        </button>
                    </div>
                    <p className="muted key-usage">
                        Search engines are asked not to list it. Anyone you send it to can pass it on, and messaging apps show the match's title when the link is pasted.
                    </p>
                    <div className="modal-actions">
                        <button type="button" className="btn" disabled={make.isPending}
                            onClick={() => confirm("Make a new link? The current one stops working.") && make.mutate()}>New link</button>
                        <button type="button" className="btn" disabled={off.isPending}
                            onClick={() => confirm("Stop sharing? The link stops working.") && off.mutate()}>Stop sharing</button>
                        <div className="grow" />
                        <a className="btn" href={data.url} target="_blank" rel="noreferrer"><Icon name="link" />Open</a>
                        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                    </div>
                </>
            ) : (
                <div className="modal-actions">
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={make.isPending} onClick={() => make.mutate()}>{make.isPending ? "Making…" : "Make a link"}</button>
                </div>
            )}
            {(share.error || make.error || off.error) && <p className="error">{(share.error ?? make.error ?? off.error)!.message}</p>}
        </>
    );
}
