import { useQuery } from "@tanstack/react-query";
import { type Match, type ScreenSetup, screenSetup, tryMatchFromAddress, tryWatchFor } from "@lawfive/schema";
import { Link, useLocation } from "react-router";
import { request, useList } from "../api.ts";
import { Loading, PageHead } from "../components/ui.tsx";
import { screenLine } from "./MatchScreenSetup.tsx";
import { teamAlias } from "../format.ts";
import type { WatchKind } from "../match/controller.ts";
import type { MatchSetup } from "../match/engine.ts";
import { TryMatch, demoMatch } from "../match/TryMatch.tsx";
import { useSettings } from "../settings.ts";

// DEMO: Try a match on the website: the account's match screen (UI-21) and team swipes (INP-10), on the
// watch it used last first (a Venu as the Venu), with its next planned match's format, teams and colors,
// or a made-up match if there's none. Nothing is saved.

const colorOf = (hex?: string) => (hex ? Number.parseInt(hex.slice(1), 16) : -1);

/** A planned match as the watch starts it (SYNC-3). */
export function setupOf(match: Match): Partial<MatchSetup> {
    const f = match.format;
    return {
        home: teamAlias(match, "home"), away: teamAlias(match, "away"),
        homeColor: colorOf(match.home.colour), awayColor: colorOf(match.away.colour),
        numPeriods: f.periods, periodSec: f.periodSec, halftimeSec: f.breakSec, midBreak: f.halfwayBreak, breakLenSec: f.halfwayBreakSec,
        trackStoppage: f.trackStoppage, breakStoppage: f.breakStoppage ?? true, goalScorers: f.goalScorers ?? true, goalTypes: f.goalTypes,
        extraTime: f.extraTime, etPeriods: f.extraTimePeriods, etPeriodSec: f.extraTimePeriodSec, goldenGoal: f.goldenGoal ?? false, penalties: f.penalties,
        // EVT-12: off for formats saved before sin bins, as the watch payload sends them.
        sinBins: f.sinBins ?? false, sinBinSec: f.sinBinSec ?? 600,
        // TMR-15: off for formats saved before it.
        stoppingClock: f.stoppingClock ?? false, stopForGoalsCards: f.stopForGoalsCards ?? true,
    };
}

export function TryMatchPage() {
    const { settings, record } = useSettings();
    // From the match screen setup (UI-27): its draft, unsaved, and the way back to it.
    const from = useLocation().state as { screen?: ScreenSetup; step?: number } | null;
    const matches = useList("matches");
    const devices = useQuery({ queryKey: ["devices"], queryFn: async () => (await request<{ devices: { kind: string; name: string }[] }>("GET", "/devices")).devices });
    const ready = record !== undefined && matches.isSuccess && !devices.isPending;
    const next = (matches.data ?? [])
        .filter((m) => m.status === "scheduled" && m.kickoff && Date.parse(m.kickoff) > Date.now())
        .sort((a, b) => Date.parse(a.kickoff!) - Date.parse(b.kickoff!))[0];
    // DEMO-1: the devices come most recently used first.
    const latest = (devices.data ?? []).find((d) => d.kind === "garmin" || d.kind === "wearos" || d.kind === "applewatch");
    // DEMO-9: a watch named in the address (Link a watch's Try a match, SYNC-15) wins over the latest.
    const asked = tryMatchFromAddress(useLocation().search).watch;
    const watch: WatchKind = asked ?? tryWatchFor(latest?.kind, latest?.name);
    const screen = from?.screen ?? screenSetup(settings.watchScreen);
    const name = (m: Match) => `${m.home.name ?? teamAlias(m, "home")} v ${m.away.name ?? teamAlias(m, "away")}`;
    return (
        <>
            <PageHead
                title="Try a match"
                sub={`A match on the watch, here in the browser, with ${from?.screen ? "the match screen you're setting up" : "your match screen"}. Nothing is saved.`}
                back={from?.screen ? { to: "/settings/match-screen", label: "Match screen", state: { draft: from.screen, step: from.step } } : undefined}
            />
            {ready ? (
                <TryMatch
                    key={next?.id ?? "demo"}
                    setup={next ? setupOf(next) : demoMatch}
                    screen={screen}
                    swipes={settings.teamSwipes ?? "upDown"}
                    misconductScheme={settings.misconductScheme}
                    watch={watch}
                    caption={next ? `Your next match: ${name(next)}, its format and colors` : "A made-up match: you have no match coming up"}
                    screenRow={
                        <div className="try-side-screen">
                            <span>{from?.screen ? "The one you're setting up" : `Yours: ${screenLine(screen)}`}</span>
                            {from?.screen
                                ? <Link to="/settings/match-screen" state={{ draft: from.screen, step: from.step }} className="btn btn-sm">Back to it</Link>
                                : <Link to="/settings/match-screen" className="btn btn-sm">Change</Link>}
                        </div>
                    }
                />
            ) : (
                <Loading />
            )}
        </>
    );
}
