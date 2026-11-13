import type { z } from "zod";
import type { ClockStyle } from "./format.ts";
import type { BreakClockStyle, WatchClocks, WatchEdge, WatchLayout, WatchScreen } from "./records.ts";

// The match screen (UI-21 to UI-24): the account's choices, complete, from a setup saved in any
// version, and the nearest of the six old layouts for watch builds that only know those.

type Style = z.infer<typeof ClockStyle>;

export interface ScreenSetup {
    clocks: z.infer<typeof WatchClocks>;
    mainClock: Style;
    secondClock: Style;
    breakClock: z.infer<typeof BreakClockStyle>;
    edge: z.infer<typeof WatchEdge>;
    names: boolean;
}

/** UI-24: what watches show until one is chosen: two clocks stacked, the time left over the match time,
 * with the time of day and names. */
export const defaultScreen: ScreenSetup = { clocks: "stacked", mainClock: "down", secondClock: "up", breakClock: "down", edge: "time", names: true };

const fromLayout: Record<z.infer<typeof WatchLayout>, Pick<ScreenSetup, "clocks" | "edge" | "names">> = {
    default: { clocks: "one", edge: "none", names: true },
    stacked: { clocks: "stacked", edge: "none", names: true },
    minimal: { clocks: "one", edge: "none", names: false },
    // UI-21: Scoreboard was dropped; it becomes one clock with names.
    scoreboard: { clocks: "one", edge: "none", names: true },
    sideBySide: { clocks: "sideBySide", edge: "none", names: true },
    ring: { clocks: "one", edge: "ring", names: true },
};

/** UI-22: the second clock is never a copy of the match clock. */
export function secondStyle(main: Style, second: Style): Style {
    return second !== main ? second : main === "down" ? "upEach" : "down";
}

/** The whole setup, from a saved one of any age (fields it lacks come from its layout). */
export function screenSetup(saved: z.infer<typeof WatchScreen> | undefined): ScreenSetup {
    if (!saved) {
        return defaultScreen;
    }
    const old = fromLayout[saved.layout];
    const mainClock = saved.mainClock ?? "up";
    return {
        clocks: saved.clocks ?? old.clocks,
        mainClock,
        secondClock: secondStyle(mainClock, saved.secondClock),
        breakClock: saved.breakClock ?? "down",
        edge: saved.edge ?? old.edge,
        names: saved.names ?? old.names,
    };
}

/** UI-24: the nearest old layout, for watch builds from before UI-21's choices. */
export function nearestLayout(setup: ScreenSetup): z.infer<typeof WatchLayout> {
    if (setup.clocks === "stacked") {
        return "stacked";
    }
    if (setup.clocks === "sideBySide") {
        return "sideBySide";
    }
    if (!setup.names) {
        return "minimal";
    }
    return setup.edge === "ring" ? "ring" : "default";
}

/** A setup as it's saved in the account's settings. */
export function savedScreen(setup: ScreenSetup, changedAt: string): z.infer<typeof WatchScreen> {
    return { layout: nearestLayout(setup), ...setup, secondClock: secondStyle(setup.mainClock, setup.secondClock), changedAt };
}

/** DEMO-9: the watches Try a match draws: a five-button Garmin, a Venu, Wear OS or Apple Watch. */
export const tryWatches = ["garmin", "venu", "wearos", "apple"] as const;
export type TryWatch = (typeof tryWatches)[number];

/** DEMO-9: lawfive.app's Try a match, which needs no sign-in. */
export const tryMatchSite = "https://lawfive.app/try";

/** DEMO-9: which watch Try a match shows for a linked one, from its kind (or the app that linked it) and its name. */
export function tryWatchFor(kind: string | undefined, name?: string): TryWatch {
    if (kind === "applewatch" || kind === "lawfive-applewatch") return "apple";
    if (kind === "wearos" || kind === "lawfive-wear") return "wearos";
    return /venu/i.test(name ?? "") ? "venu" : "garmin";
}

/** DEMO-9: Try a match's address with the watch and the match screen in it, under the API's names; nothing else. */
export function tryMatchUrl(watch: TryWatch, screen: ScreenSetup, teamSwipes?: "upDown" | "sideways", base = tryMatchSite): string {
    const s = { ...screen, secondClock: secondStyle(screen.mainClock, screen.secondClock) };
    const params = new URLSearchParams({
        watch, clocks: s.clocks, mainClock: s.mainClock, secondClock: s.secondClock, breakClock: s.breakClock, edge: s.edge, names: String(s.names),
    });
    if (teamSwipes) params.set("teamSwipes", teamSwipes);
    return `${base}?${params}`;
}

/** DEMO-9: what an address gives Try a match; anything missing or not understood is left to the page's own default. */
export function tryMatchFromAddress(search: string): { watch?: TryWatch; screen?: ScreenSetup; teamSwipes?: "upDown" | "sideways" } {
    const p = new URLSearchParams(search);
    const pick = <T extends string>(key: string, values: readonly T[]) => values.find((v) => v === p.get(key));
    const watch = pick("watch", tryWatches);
    const teamSwipes = pick("teamSwipes", ["upDown", "sideways"] as const);
    const keys = ["clocks", "mainClock", "secondClock", "breakClock", "edge", "names"];
    if (!keys.some((k) => p.has(k))) return { watch, teamSwipes };
    const mainClock = pick("mainClock", ["up", "upEach", "down"] as const) ?? defaultScreen.mainClock;
    const names = p.get("names");
    const screen: ScreenSetup = {
        clocks: pick("clocks", ["one", "stacked", "sideBySide"] as const) ?? defaultScreen.clocks,
        mainClock,
        secondClock: secondStyle(mainClock, pick("secondClock", ["up", "upEach", "down"] as const) ?? defaultScreen.secondClock),
        breakClock: pick("breakClock", ["down", "up"] as const) ?? defaultScreen.breakClock,
        edge: pick("edge", ["none", "ring", "time"] as const) ?? defaultScreen.edge,
        names: names === "false" ? false : names === "true" ? true : defaultScreen.names,
    };
    return { watch, screen, teamSwipes };
}
