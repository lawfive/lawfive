import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { watchesHelpUrl } from "./Link.tsx";
import { request } from "../api.ts";
import { Icon, Loading } from "../components/ui.tsx";
import { formatShortDay, timeAgo } from "../format.ts";

// Where the account is signed in: linked watches and browsers, with Unlink for each (GET and
// DELETE /v1/devices). Shown on the Settings page: the watches under Your watch, phones and
// browsers (with Sign out everywhere else) under You. WEB-33: the phones and browsers show the latest
// few (this one first, then the most recently active), with Show all for the rest.

/** The kinds of device that are watches, from the X-LawFive-Device header each app sends. */
export const watchKinds = ["garmin", "wearos", "applewatch"];

export interface Device {
    id: string;
    kind: string;
    name: string;
    /** A watch's Garmin part number and firmware, from watch versions that send them. */
    model?: string;
    firmware?: string;
    /** VER-3: the LawFive app's version on it. */
    appVersion?: string;
    linkedAt: string;
    lastActiveAt: string;
    current: boolean;
    /** SEC-13: a watch's link, which only syncs matches. */
    watchOnly?: boolean;
}

/** Where the account is signed in and linked (GET /v1/devices). */
export function useDevices(enabled = true) {
    return useQuery({ queryKey: ["devices"], queryFn: async () => (await request<{ devices: Device[] }>("GET", "/devices")).devices, enabled });
}

/** SYNC-14: a match on one of the account's watches, from its latest download (GET /v1/devices/matches). */
export interface MatchOnWatch {
    matchId: string;
    deviceId: string;
    kind: string;
    name: string;
    since: string;
    syncedAt: string;
    upToDate: boolean;
}

/** Which matches are on which watch (SYNC-14). */
export function useMatchesOnWatches(enabled = true) {
    return useQuery({ queryKey: ["devices", "matches"], queryFn: async () => (await request<{ matches: MatchOnWatch[] }>("GET", "/devices/matches")).matches, enabled });
}

/** Whether a watch is linked: true or false once the devices are known, undefined until then. */
export function useWatchLinked(): boolean | undefined {
    const devices = useDevices();
    return devices.isSuccess ? devices.data.some((d) => watchKinds.includes(d.kind)) : undefined;
}

const isPhone = (kind: string) => kind === "android" || kind === "ios";

/** WEB-33: how many phones and browsers show before Show all. */
const latestShown = 5;

export function Devices({ show }: { show: "watches" | "others" }) {
    const client = useQueryClient();
    const devices = useDevices();
    const unlink = useMutation({
        mutationFn: (id: string) => request("DELETE", `/devices/${id}`),
        onSuccess: () => client.invalidateQueries({ queryKey: ["devices"] }),
    });
    const list = devices.data ?? [];
    const watches = list.filter((d) => watchKinds.includes(d.kind));
    // SEC-7: everywhere else, all at once: other browsers only, or everything, watches and phones too.
    const signOutOthers = useMutation({
        mutationFn: (scope: "browsers" | "all") => request("POST", "/devices/sign-out-others", { scope }),
        onSuccess: () => client.invalidateQueries({ queryKey: ["devices"] }),
    });
    const otherBrowsers = list.some((d) => d.kind === "browser" && !d.current);
    const [all, setAll] = useState(false);
    // This browser first, then the most recently active (the server sends them newest first).
    const mine = list.filter((d) => watchKinds.includes(d.kind) === (show === "watches"))
        .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
    const folds = show === "others" && mine.length > latestShown;
    const shown = folds && !all ? mine.slice(0, latestShown) : mine;

    return (
        <>
            {show === "watches" && devices.isSuccess && watches.length === 0 && (
                <div className="list-row">
                    <div className="avatar"><Icon name="watch" size={18} /></div>
                    <div className="grow">
                        <div className="title">No watch linked yet</div>
                        <div className="sub">Link your watch to download upcoming matches to it and upload the ones you referee. Not on your watch yet? <a className="link" href={watchesHelpUrl} target="_blank" rel="noreferrer">How to get it</a></div>
                    </div>
                    <Link to="/link" className="btn btn-primary">Link a watch</Link>
                </div>
            )}
            {devices.isLoading && <div className="list-row"><Loading inline /></div>}
            {shown.map((d) => (
                <div key={d.id} className="list-row">
                    <div className="avatar"><Icon name={d.kind === "browser" ? "browser" : isPhone(d.kind) ? "phone" : "watch"} size={18} /></div>
                    <div className="grow">
                        <div className="title">{d.name}{d.current && <span className="chip chip-brand" style={{ marginLeft: 8 }}>This browser</span>}</div>
                        <div className="sub">
                            {d.kind === "browser" || isPhone(d.kind) ? "Signed in" : "Linked"} {formatShortDay(d.linkedAt)} · {d.kind === "browser" ? "active" : "last synced"} {timeAgo(d.lastActiveAt)}
                            {d.firmware && <> · {d.kind === "android" ? `Android ${d.firmware}` : d.kind === "ios" ? `iOS ${d.firmware}` : `firmware ${d.firmware}`}</>}
                            {d.appVersion && <> · LawFive {d.appVersion}</>}
                            {d.watchOnly && <> · syncs matches only</>}
                        </div>
                    </div>
                    {!d.current && (
                        <button className="btn" disabled={unlink.isPending}
                            onClick={() => confirm(d.kind === "browser" ? `Sign out ${d.name}?` : `Unlink ${d.name}? It will stop syncing until you link it again.`) && unlink.mutate(d.id)}>
                            {d.kind === "browser" ? "Sign out" : "Unlink"}
                        </button>
                    )}
                </div>
            ))}
            {folds && (
                <div className="list-row devices-more">
                    <button type="button" className="btn" aria-expanded={all} onClick={() => setAll(!all)}>
                        <span className={`disclose${all ? " open" : ""}`}><Icon name="chevron" /></span>{all ? "Show fewer" : `Show all (${mine.length})`}
                    </button>
                </div>
            )}
            {show === "others" && devices.isSuccess && !list.some((d) => isPhone(d.kind)) && (
                <div className="list-row">
                    <div className="avatar"><Icon name="phone" size={18} /></div>
                    <div className="grow">
                        <div className="title">No phone yet</div>
                        <div className="sub">The phone app keeps your matches, venues and referees with you, even with no signal, and links your watch.</div>
                    </div>
                    <Link to="/get-app" className="btn"><Icon name="phone" />Get the app</Link>
                </div>
            )}
            {show === "others" && list.length > 1 && (
                <div className="list-row devices-others">
                    <div className="grow">
                        <div className="title">Sign out everywhere else</div>
                        <div className="sub">If you've lost a device, or think someone else is signed in.</div>
                    </div>
                    <div className="row">
                        {otherBrowsers && (
                            <button className="btn" disabled={signOutOthers.isPending}
                                onClick={() => confirm("Sign out your other browsers? Watches and phones stay linked.") && signOutOthers.mutate("browsers")}>
                                Browsers only
                            </button>
                        )}
                        <button className="btn btn-danger" disabled={signOutOthers.isPending}
                            onClick={() => confirm("Unlink everything else? Watches stop syncing and phones sign out until you link them again.") && signOutOthers.mutate("all")}>
                            Unlink everything
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
