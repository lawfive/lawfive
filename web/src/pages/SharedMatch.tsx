import type * as schema from "@lawfive/schema";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { z } from "zod";
import { ApiError, type MatchTrack, type PitchOutline, type TrackSummary, request } from "../api.ts";
import { TrackSection } from "../components/TrackSection.tsx";
import { Loading, Logo, useTabTitle } from "../components/ui.tsx";
import { asPlayed, matchTabTitle, matchTitle } from "../format.ts";
import { fullDate } from "../report.ts";
import { defaultSettings } from "../settings.ts";
import { Events, Scoreboard } from "./MatchPage.tsx";

// A shared match's public page (DATA-7), at /s/<token> whether or not anyone is signed in: the
// scoreboard, the match log and the track, as the owner shared them. The server leaves out the
// notes, fee, crew, contacts and names.

type Shared = z.infer<typeof schema.SharedMatch>;

export function SharedMatchPage() {
    const { token } = useParams();
    const shared = useQuery({
        queryKey: ["shared", token],
        retry: false,
        queryFn: () => request<Shared>("GET", `/shared/${token}`),
    });
    const track = useQuery({
        queryKey: ["shared-track", token],
        enabled: shared.data?.track === true,
        retry: false,
        queryFn: () => request<{ track: MatchTrack; summary: TrackSummary; pitch?: PitchOutline }>("GET", `/shared/${token}/track`),
    });

    const data = shared.data;
    useTabTitle(data && matchTabTitle(data.match));
    let body: React.ReactNode;
    if (shared.isLoading) {
        body = <Loading />;
    } else if (!data) {
        const gone = shared.error instanceof ApiError && (shared.error.status === 404 || shared.error.status === 403);
        body = (
            <div className="card shared-gone">
                <h2>{gone ? "This link doesn't work any more" : "This match couldn't be loaded"}</h2>
                <p className="muted">{gone ? "Whoever shared it may have stopped sharing it or made a new link. Ask them for the current one." : shared.error?.message}</p>
            </div>
        );
    } else {
        const { record } = data;
        // Q-20: its periods named as they were played.
        const m = { ...data.match, format: asPlayed(data.match.format, record) };
        const settings = { ...defaultSettings(), distanceUnit: data.distanceUnit };
        const where = [data.venue, data.pitch].filter(Boolean).join(", ");
        body = (
            <>
                <div className="page-head">
                    <div>
                        <h1>{m.name ?? matchTitle(m)}</h1>
                        <p>{[data.competition, m.kickoff && fullDate(m.kickoff, m.timeZone, true), where].filter(Boolean).join(" · ")}</p>
                    </div>
                </div>
                <Scoreboard match={m} record={record} />
                {record && <Events match={m} record={record} />}
                {record && track.data && (
                    <TrackSection match={m} record={record} track={track.data.track} summary={track.data.summary} pitch={track.data.pitch} settings={settings} readOnly />
                )}
                {record && data.track && track.isLoading && <Loading label="Loading the track" />}
            </>
        );
    }
    return (
        <div className="shared-page">
            <header className="shared-head">
                <a href="https://lawfive.dev" className="shared-logo"><Logo /></a>
                <span className="muted">A shared match</span>
            </header>
            {/* WEB-24: the match on the pitch, between its touchlines, as in the app. */}
            <div className="pitch-frame">
                <span className="frame-corners" aria-hidden />
                <main className="main">{body}</main>
            </div>
            <footer className="shared-foot muted">Shared from LawFive, for referees.</footer>
        </div>
    );
}
