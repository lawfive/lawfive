import { deviceName, summarizeTrack } from "@lawfive/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button, Dialog, DropZone, FileTrigger, Heading, Modal, ModalOverlay, isFileDropItem } from "react-aria-components";
import { type Match, type MatchRecord, type MatchTrack, type TrackSummary, request } from "../api.ts";
import { formatDistance, formatShortDay, formatTime, periodName, teamAlias } from "../format.ts";
import type { SettingsValues } from "../settings.ts";
import { type TrackFile, acceptedTrackTypes, kickoffInRecording, periodsFromStretches, readTrackFile, recordingSpan } from "../trackFile.ts";
import { Icon } from "./ui.tsx";
import { newId } from "../ids.ts";

// Adding a track from an activity file (TRK-8): FIT, GPX or TCX, from Garmin Connect or another
// app. A preview first: when it was recorded (and a warning if that isn't when the match kicked
// off), what it holds, and what it replaces. A match without a match report gets one, with the
// periods from where the recording was paused and the score typed in.

const sourceNames: Record<MatchTrack["source"]["kind"], string> = {
    lawfive: "LawFive watch", refsix: "RefSix", fit: "FIT file", gpx: "GPX file", tcx: "TCX file",
    appleHealth: "Apple Health", healthConnect: "Health Connect", strava: "Strava", other: "another app",
};

/** Where a played match without a track takes a file: a drop area in place of the track card. */
export function TrackDrop({ onFile }: { onFile: (file: File) => void }) {
    return (
        <section className="section">
            <h3 style={{ marginBottom: 10 }}>Movement and heart rate</h3>
            <DropZone className="drop-zone track-drop" aria-label="Drop an activity file for this match's track"
                getDropOperation={() => "copy"}
                onDrop={async (e) => {
                    const item = e.items.find(isFileDropItem);
                    if (item) {
                        onFile(await item.getFile());
                    }
                }}>
                <div className="drop-icon" aria-hidden><Icon name="upload" size={26} /></div>
                <strong>Add your track</strong>
                <span className="muted">Drop the activity file from your watch here, or</span>
                <FileTrigger acceptedFileTypes={acceptedTrackTypes} onSelect={(files) => files?.[0] && onFile(files[0])}>
                    <Button className="btn btn-primary"><Icon name="file" />Choose a file</Button>
                </FileTrigger>
                <span className="muted drop-hint">FIT, GPX or TCX. In Garmin Connect, open the activity, then the gear menu: Export Original (or Export to GPX or TCX).</span>
            </DropZone>
        </section>
    );
}

export function AddTrack({ file: first, match, record, existing, settings, onClose }: {
    file: File;
    match: Match;
    record?: MatchRecord;
    existing?: { track: MatchTrack; summary: TrackSummary };
    settings: SettingsValues;
    onClose: () => void;
}) {
    const client = useQueryClient();
    const [file, setFile] = useState(first);
    const [read, setRead] = useState<TrackFile>();
    const [readError, setReadError] = useState<string>();
    const [score, setScore] = useState({ home: "", away: "" });
    useEffect(() => {
        let current = true;
        setRead(undefined);
        setReadError(undefined);
        readTrackFile(file)
            .then((r) => current && setRead(r))
            .catch((error: unknown) => current && setReadError(error instanceof Error ? error.message : "That file couldn't be read."));
        return () => {
            current = false;
        };
    }, [file]);

    // A match report's own periods; without one, the stretches the recording ran.
    const periods = record?.periods ?? (read ? periodsFromStretches(read.stretches, match.format) : []);
    const summary = read && summarizeTrack(read.track, periods, settings.maxHeartRate, settings.sprintKph);
    const span = read && recordingSpan(read.track);
    const goals = (s: string) => (/^\d{1,2}$/.test(s.trim()) ? Number(s) : undefined);
    const scoreReady = record !== undefined || (goals(score.home) !== undefined && goals(score.away) !== undefined);

    const save = useMutation({
        mutationFn: async (track: MatchTrack) => {
            let recordId = record?.id;
            if (!recordId) {
                recordId = newId();
                await request("PUT", `/match-records/${recordId}`, {
                    matchId: match.id, outcome: "completed", periods, events: [],
                    score: { home: goals(score.home), away: goals(score.away) },
                    ...(track.source.device ? { device: track.source.device } : {}),
                });
            }
            await request("PUT", `/match-records/${recordId}/track`, track);
            return recordId;
        },
        onSuccess: async (recordId) => {
            await Promise.all([
                client.invalidateQueries({ queryKey: ["match-records"] }),
                client.invalidateQueries({ queryKey: ["track", recordId] }),
                client.invalidateQueries({ queryKey: ["stats"] }),
            ]);
            onClose();
        },
    });

    const describe = (track: MatchTrack, s: TrackSummary | undefined) => [
        s?.total.distanceM !== undefined && formatDistance(s.total.distanceM, settings.distanceUnit),
        track.gps && `${track.gps.t.length.toLocaleString()} positions`,
        track.heartRate && `${track.heartRate.t.length.toLocaleString()} heart-rate readings`,
    ].filter(Boolean).join(" · ");

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!save.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal track-modal">
                <Dialog className="modal-dialog">
                    <Heading slot="title">{existing ? "Replace the track" : "Add the track"}</Heading>
                    <p className="import-file"><Icon name="file" size={18} /><strong>{file.name}</strong></p>
                    {!read && !readError && <p className="muted">Reading…</p>}
                    {readError && <p className="error">{readError}</p>}
                    {read && span && (
                        <>
                            <dl className="track-preview">
                                <div><dt>Recorded</dt><dd>{formatShortDay(new Date(span.from).toISOString())}, {formatTime(new Date(span.from).toISOString())} to {formatTime(new Date(span.to).toISOString())}{read.deviceName && <span className="muted"> · {read.deviceName}</span>}</dd></div>
                                <div><dt>Holds</dt><dd>{describe(read.track, summary)}</dd></div>
                                {!record && (
                                    <div>
                                        <dt>Periods</dt>
                                        <dd>
                                            {periods.length
                                                ? <ul className="track-periods">{periods.map((p) => <li key={p.period}>{periodName(match.format, p.period)} <span className="muted">· {formatTime(p.startedAt!)}, {Math.round(p.playedSec / 60)} min</span></li>)}</ul>
                                                : <span className="muted">It was never paused, so the figures cover the whole recording.</span>}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            {!kickoffInRecording(read.track, match.kickoff) && match.kickoff && (
                                <p className="track-warning"><Icon name="info" size={18} />This match kicked off {formatShortDay(match.kickoff)} at {formatTime(match.kickoff)}, which isn't when this was recorded. Check it's the right file.</p>
                            )}
                            {!record && (
                                <fieldset className="track-score">
                                    <legend>Final score</legend>
                                    <p className="muted">This match has no match report yet, so one is made with these periods and the score.</p>
                                    <div className="track-score-row">
                                        <label>{teamAlias(match, "home")}<input className="input" inputMode="numeric" value={score.home} onChange={(e) => setScore({ ...score, home: e.target.value })} aria-label="Home goals" /></label>
                                        <span aria-hidden>–</span>
                                        <label><input className="input" inputMode="numeric" value={score.away} onChange={(e) => setScore({ ...score, away: e.target.value })} aria-label="Away goals" />{teamAlias(match, "away")}</label>
                                    </div>
                                </fieldset>
                            )}
                            {existing && (
                                <p className="track-replaces">
                                    <strong>Replaces the track from {sourceNames[existing.track.source.kind]}{existing.track.source.device && /^(garmin|wearos|applewatch):/.test(existing.track.source.device) ? ` (${deviceName(existing.track.source.device)})` : ""}</strong>
                                    <span className="muted">{describe(existing.track, existing.summary)}</span>
                                </p>
                            )}
                        </>
                    )}
                    {save.error && <p className="error">{save.error.message}</p>}
                    <div className="modal-actions">
                        <FileTrigger acceptedFileTypes={acceptedTrackTypes} onSelect={(files) => files?.[0] && setFile(files[0])}>
                            <Button className="btn btn-ghost" isDisabled={save.isPending}>Choose another file</Button>
                        </FileTrigger>
                        <button type="button" className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                        <button type="button" className="btn btn-primary" disabled={!read || !scoreReady || save.isPending} onClick={() => read && save.mutate(read.track)}>
                            <Icon name="upload" />
                            {save.isPending ? "Saving…" : existing ? "Replace track" : "Add track"}
                        </button>
                    </div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
