import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { Link } from "react-router";
import { request, useList, useMeta, useSession } from "../api.ts";
import { useDevices, watchKinds } from "../pages/Devices.tsx";
import { watchesHelpUrl } from "../pages/Link.tsx";
import { type SettingsValues, defaultSettings, deviceTimeZone, useChangeSettings, useSettings } from "../settings.ts";
import { Slab } from "./Slab.tsx";
import { Icon } from "./ui.tsx";

// WEB-32: Get ready, on Matches for an account that hasn't set up yet: the five things that make
// LawFive work for a referee, each ticking itself when it's done, until they all are or it's hidden.
// Hiding it, and "They're right" for the units, are kept with the account's settings (getReady), so
// they follow the person to another browser or phone.

type Remembered = { hidden?: boolean; units?: boolean };

/** Where this browser kept them before the settings had a place for them. */
const storageKey = (userId: string) => `lawfive.getReady.${userId}`;

function rememberedHere(userId: string): Remembered {
    try {
        return JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}") as Remembered;
    } catch {
        return {};
    }
}

/** Moved over once a page load, however many parts of the page use Get ready. */
let moved = false;

/** "Los Angeles time", from America/Los_Angeles. */
function zoneName(zone: string): string {
    return `${zone.split("/").at(-1)!.replaceAll("_", " ")} time`;
}

/** "Miles, °F, USD and Los Angeles time". */
function unitsLine(settings: SettingsValues): string {
    return `${settings.distanceUnit === "mi" ? "Miles" : "Kilometers"}, °${settings.temperatureUnit.toUpperCase()}, ${settings.currency} and ${zoneName(settings.timeZone ?? deviceTimeZone())}`;
}

/** Whether the units or time zone are other than this browser would have guessed: someone chose them. */
function unitsChosen(settings: SettingsValues): boolean {
    const guess = defaultSettings();
    return settings.distanceUnit !== guess.distanceUnit || settings.temperatureUnit !== guess.temperatureUnit
        || settings.currency !== guess.currency || (!!settings.timeZone && settings.timeZone !== deviceTimeZone());
}

interface Step {
    key: string;
    title: string;
    /** What it's for while it's to do; what's done once it is. */
    line: ReactNode;
    done: boolean;
    actions?: (lead: boolean) => ReactNode;
}

/** What Get ready needs: whether it shows, and what's done. Shared with Matches, which keeps Did you know back while it shows. */
export function useGetReady() {
    const userId = useSession().data?.user.id;
    const { settings, record } = useSettings();
    const change = useChangeSettings();
    const state: Remembered = { hidden: settings.getReady?.hidden, units: settings.getReady?.unitsConfirmed };
    const remember = (choice: Remembered) => void change({
        getReady: { ...settings.getReady, ...(choice.hidden ? { hidden: true } : {}), ...(choice.units ? { unitsConfirmed: true } : {}) },
    });
    // What this browser kept before (local storage) moves to the account once, then goes.
    useEffect(() => {
        if (!record || !userId || moved) {
            return;
        }
        moved = true;
        const old = rememberedHere(userId);
        const missing = (old.hidden && !record.getReady?.hidden) || (old.units && !record.getReady?.unitsConfirmed);
        const forget = () => {
            try {
                localStorage.removeItem(storageKey(userId));
            } catch {
                // Nothing to forget in a private window.
            }
        };
        if (!missing) {
            forget();
            return;
        }
        void change({ getReady: { ...record.getReady, ...(old.hidden ? { hidden: true } : {}), ...(old.units ? { unitsConfirmed: true } : {}) } })
            .then((saved) => saved && forget());
    }, [record, userId]);
    const devices = useDevices(!state.hidden);
    const matches = useList("matches");
    const feeds = useMeta().data?.capabilities.includes("assignor-calendars") ?? false;
    const calendars = useQuery({
        queryKey: ["assignor-calendars"],
        queryFn: async () => (await request<{ calendars: unknown[] }>("GET", "/assignor-calendars")).calendars,
        enabled: feeds && !state.hidden,
    });
    const loaded = devices.isSuccess && matches.isSuccess && !!record && (!feeds || !calendars.isPending);
    const watches = (devices.data ?? []).filter((d) => watchKinds.includes(d.kind));
    const phones = (devices.data ?? []).filter((d) => d.kind === "android" || d.kind === "ios");
    const games = matches.data?.length ?? 0;
    const connected = (calendars.data?.length ?? 0) > 0;
    const unitsDone = !!state.units || unitsChosen(settings);
    const done = { watch: watches.length > 0, phone: phones.length > 0, units: unitsDone, games: games > 0 || connected, screen: !!settings.watchScreen };
    const allDone = Object.values(done).every(Boolean);
    return {
        /** Known either way: hidden, or what it needs has loaded. */
        settled: (!!record && !!state.hidden) || loaded,
        show: !state.hidden && loaded && !allDone,
        done, watches, phones, games, connected, feeds, settings, remember,
    };
}

/** The checklist (WEB-32), from useGetReady; nothing once every row is done or it's hidden. */
export function GetReady({ ready, onImport }: { ready: ReturnType<typeof useGetReady>; onImport: () => void }) {
    if (!ready.show) {
        return null;
    }
    const { done, watches, phones, games, connected, feeds, settings, remember } = ready;
    const steps: Step[] = [
        {
            key: "watch",
            title: "Link your watch",
            done: done.watch,
            line: watches.length > 0 ? `Linked: ${watches.map((w) => w.name).join(", ")}`
                : <>Your next matches go to it, and each one you referee comes back here with every goal and card. Not on your watch yet? <a href={watchesHelpUrl} target="_blank" rel="noreferrer">How to get it</a></>,
            actions: (lead) => <Link to="/link" className={`btn btn-sm${lead ? " btn-primary" : ""}`}><Icon name="watch" size={16} />Link a watch</Link>,
        },
        {
            key: "phone",
            title: "Get the phone app",
            done: done.phone,
            line: phones.length > 0 ? `Signed in on ${phones.map((p) => p.name).join(", ")}` : "Your matches, venues and referees with you, even with no signal.",
            actions: (lead) => <Link to="/get-app" className={`btn btn-sm${lead ? " btn-primary" : ""}`}><Icon name="phone" size={16} />Get the app</Link>,
        },
        {
            key: "units",
            title: "Your units and time zone",
            done: done.units,
            line: done.units ? unitsLine(settings) : `${unitsLine(settings)}, guessed from this browser.`,
            actions: (lead) => (
                <>
                    <Link to="/settings#units" className="btn btn-sm">Change</Link>
                    <button type="button" className={`btn btn-sm${lead ? " btn-primary" : ""}`} onClick={() => remember({ units: true })}><Icon name="check" size={16} />They're right</button>
                </>
            ),
        },
        {
            key: "games",
            title: "Bring in your games",
            done: done.games,
            line: connected ? `Your assignor's calendar is connected${games ? `: ${games} ${games === 1 ? "match" : "matches"}` : ""}`
                : games > 0 ? `${games} ${games === 1 ? "match" : "matches"} so far`
                : feeds ? "Connect your assignor's calendar and your games come in by themselves, kept up to date. Or add one yourself."
                : "Add your next game, or import a season's schedule from a spreadsheet.",
            actions: (lead) => (
                <>
                    {feeds
                        ? <Link to="/settings#assignor-calendars" state={{ addCalendar: true }} className="btn btn-sm"><Icon name="calendar" size={16} />Connect a calendar</Link>
                        : <button type="button" className="btn btn-sm" onClick={onImport}><Icon name="upload" size={16} />Import</button>}
                    <Link to="/matches/new" className={`btn btn-sm${lead ? " btn-primary" : ""}`}><Icon name="plus" size={16} />Add a match</Link>
                </>
            ),
        },
        {
            key: "screen",
            title: "Choose your match screen",
            done: done.screen,
            line: settings.watchScreen ? "Chosen. Change it any time in Settings." : "What your watch shows while a match runs: which clocks, the time of day and the team names.",
            actions: (lead) => <Link to="/settings/match-screen" className={`btn btn-sm${lead ? " btn-primary" : ""}`}><Icon name="watch" size={16} />Choose</Link>,
        },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const lead = steps.find((s) => !s.done)!.key;
    return (
        <Slab title="Get ready" tag={`${doneCount} of ${steps.length} done`} ground="grass" className="get-ready">
            <ol className="tile-rows get-ready-rows">
                {steps.map((s, i) => (
                    <li key={s.key} className={`tile-row${s.done ? " done" : ""}`}>
                        <span className="row-tile" aria-hidden>{s.done ? <Icon name="check" size={26} /> : i + 1}</span>
                        <span className="row-main">
                            <span className="row-who">
                                <span className="row-name">{s.title}{s.done && <span className="visually-hidden">: done</span>}</span>
                                <span className="row-sub">{s.line}</span>
                            </span>
                            {!s.done && s.actions && <span className="get-ready-actions">{s.actions(s.key === lead)}</span>}
                        </span>
                    </li>
                ))}
            </ol>
            <p className="get-ready-foot">
                <button type="button" className="link-button" onClick={() => remember({ hidden: true })}>Hide this list</button>
                <span>Everything here is in Settings and More too.</span>
            </p>
        </Slab>
    );
}
