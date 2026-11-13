import { useEffect, useState } from "react";
import type { ScreenSetup } from "@lawfive/schema";
import { darkOnWatch, textOn } from "../format.ts";
import type { ScreenAt } from "../watchPreview.ts";

// A picture of the watch's screen (UI-21, UI-27): the running match as the match screen's choices
// build it, or half-time, on a round watch (Garmin, Wear OS) or Apple Watch's rounded rectangle. The
// slots are at the same fractions of the screen as the watches draw them (UI-1), and the sizes are
// fractions of its width, as on Wear OS and Apple Watch; Garmin's own fonts differ a little by model.

export type WatchShape = "round" | "apple";

/** Apple Watch's screen is taller than wide (46 mm: 416 × 496), with corners of about a fifth of its width. */
const appleHeight = 119;
const appleCorner = 22;
const ringWidth = 2.7;

/** The time of day as the watch shows it, kept current. */
function useTimeOfDay(): string {
    const read = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, (m) => m.toUpperCase());
    const [time, setTime] = useState(read);
    useEffect(() => {
        const timer = window.setInterval(() => setTime(read()), 15_000);
        return () => window.clearInterval(timer);
    }, []);
    return time;
}

/** A pill's width from its text: the watches' Barlow figures are a little over half as wide as tall. */
function pillWidth(text: string, size: number): number {
    return text.length * size * 0.56 + size * 1.5;
}

function Pills({ pills, y, size }: { pills: { text: string; solid: boolean; className: string }[]; y: number; size: number }) {
    const gap = 2;
    const height = size * 1.45;
    const widths = pills.map((p) => pillWidth(p.text, size));
    let x = 50 - (widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1)) / 2;
    return (
        <>
            {pills.map((p, i) => {
                const left = x;
                x += widths[i] + gap;
                return (
                    <g key={i} className={`${p.className}${p.solid ? " solid" : ""}`}>
                        <rect x={left} y={y - height / 2} width={widths[i]} height={height} rx={height / 2} className="wf-pill" />
                        <text x={left + widths[i] / 2} y={y} fontSize={size} className="wf-pill-text" textAnchor="middle" dominantBaseline="central">{p.text}</text>
                    </g>
                );
            })}
        </>
    );
}

/**
 * EVT-12, UI-1: the pill row with a sin bin's pill last, outlined in the cards' yellow. The font steps down until the row
 * fits the screen's width there; if it still doesn't, the sin bin's pill drops its team ("7 4:12 +1").
 */
function SinBinPills({ screen, y, size, room }: { screen: ScreenAt; y: number; size: number; room: number }) {
    const row = (sinBin: string) => [
        ...(screen.stoppage ? [{ ...screen.stoppage, className: "wf-stoppage" }] : []),
        ...(screen.breakPill ? [{ ...screen.breakPill, className: "wf-break-pill" }] : []),
        { text: sinBin, solid: false, className: "wf-sin-bin" },
    ];
    const width = (pills: { text: string }[], at: number) => pills.reduce((sum, p) => sum + pillWidth(p.text, at), 0) + 2 * (pills.length - 1);
    const smallest = size * 0.72;
    let pills = row(screen.sinBin!);
    let at = size;
    while (at > smallest && width(pills, at) > room) {
        at -= 0.25;
    }
    if (width(pills, at) > room) {
        pills = row(screen.sinBin!.replace(/^\S+ (?=\d+ )/, ""));
    }
    return <Pills y={y} size={at} pills={pills} />;
}

/** UI-23: the ring, filling clockwise from 12 o'clock, or emptying when the match clock counts down; full orange in added time. */
function Ring({ shape, progress, down }: { shape: WatchShape; progress: number; down: boolean }) {
    const inset = ringWidth / 2;
    const path = shape === "round" ? undefined : roundedRectFromTop(inset, inset, 100 - inset, appleHeight - inset, appleCorner - inset);
    const done = progress >= 1;
    const dash = down ? { strokeDasharray: `${1 - progress} 1`, strokeDashoffset: -progress } : { strokeDasharray: `${progress} 1` };
    const outline = (className: string, extra = {}) => shape === "round"
        ? <circle cx="50" cy="50" r={50 - inset} className={className} pathLength={1} transform="rotate(-90 50 50)" {...extra} />
        : <path d={path} className={className} pathLength={1} {...extra} />;
    return (
        <>
            {outline(done ? "wf-ring-done" : "wf-track")}
            {!done && (down || progress > 0) && outline("wf-progress", dash)}
        </>
    );
}

/** A rounded rectangle's outline starting at the middle of its top edge, so a dash fills from 12 o'clock. */
function roundedRectFromTop(x0: number, y0: number, x1: number, y1: number, r: number): string {
    const mid = (x0 + x1) / 2;
    return [
        `M${mid} ${y0}`, `H${x1 - r}`, `A${r} ${r} 0 0 1 ${x1} ${y0 + r}`, `V${y1 - r}`, `A${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
        `H${x0 + r}`, `A${r} ${r} 0 0 1 ${x0} ${y1 - r}`, `V${y0 + r}`, `A${r} ${r} 0 0 1 ${x0 + r} ${y0}`, "Z",
    ].join(" ");
}

/** UI-10: with Team colors on, the demo's teams in their colors; otherwise the plain HOM and AWY of a quick match. */
const coloredTeams = [{ name: "STR", fill: "#c62828" }, { name: "ROV", fill: "#1565c0" }];
const plainTeams = [{ name: "HOM", fill: undefined }, { name: "AWY", fill: undefined }];

/** UI-10: the board's blank, the kit of a team without a color. */
export const kitBlank = "#3a403d";
/** UI-10: a kit's height from its text's size; its cut leans "/", 0.21 of its height either side of the middle; two kits are 0.11 apart. */
const kitHeight = 1.28;
const kitSlant = 0.21;
const kitGap = 0.11;
/** The watches' text is a little over half as wide as tall; a kit has room either side of its name. */
const kitTextWidth = (text: string, size: number) => text.length * size * 0.62;
const kitRoom = 1.1;

/** One kit's shape and its name, upright and black or white by contrast (UI-10); a color too dark for the screen gets a gray edge. */
function Kit({ points, team, x, y, size, tap }: { points: string; team: FaceTeam; x: number; y: number; size: number; tap?: string }) {
    const fill = team.fill ?? kitBlank;
    return (
        <g data-tap={tap} className={tap ? "try-hit" : undefined}>
            <polygon points={points} fill={fill} className={darkOnWatch(fill) ? "wf-kit-edge" : undefined} />
            <text x={x} y={y} fontSize={size} fill={textOn(fill)} className="wf-kit-name" textAnchor="middle" dominantBaseline="central">{team.name}</text>
        </g>
    );
}

/**
 * UI-10: the score line's two teams as kits of the same width (the wider name's, with room either side), cut on one diagonal
 * where they meet, with the scores outside them; with scores only (UI-21) the scores are the kits. UI-11: on the kickoff and
 * shoot-out first-kicker screens the chosen team has a white dot above its kit, over its name, and nothing else.
 */
export function KitLine({ teams, scores, y, size, chosen = -1, taps }: { teams: [FaceTeam, FaceTeam]; scores?: [string, string]; y: number; size: number; chosen?: number; taps?: [string, string] }) {
    const h = size * kitHeight;
    const d = h * kitSlant;
    const g = h * kitGap;
    const top = y - h / 2;
    const bottom = y + h / 2;
    const w = Math.max(kitTextWidth(teams[0].name, size), kitTextWidth(teams[1].name, size)) + size * kitRoom;
    const shapes = [
        `${50 - w},${top} ${50 + d - g / 2},${top} ${50 - d - g / 2},${bottom} ${50 - w},${bottom}`,
        `${50 + d + g / 2},${top} ${50 + w},${top} ${50 + w},${bottom} ${50 - d + g / 2},${bottom}`,
    ];
    // Each name in the middle of its own part, measured at half the kit's height.
    const names = [50 - (w + g / 2) / 2, 50 + (w + g / 2) / 2];
    return (
        <g>
            {teams.map((team, i) => <Kit key={i} points={shapes[i]} team={team} x={names[i]} y={y} size={size} tap={taps?.[i]} />)}
            {chosen >= 0 && <circle cx={names[chosen]} cy={top - h * 0.37} r={h * 0.17} className="wf-kit-dot" />}
            {scores && (
                <>
                    <text x={50 - w - size * 0.45} y={y} fontSize={size} className="wf-text" textAnchor="end" dominantBaseline="central">{scores[0]}</text>
                    <text x={50 + w + size * 0.45} y={y} fontSize={size} className="wf-text" textAnchor="start" dominantBaseline="central">{scores[1]}</text>
                </>
            )}
        </g>
    );
}

/**
 * UI-10: one team on its own (a team menu's title, Sin bin over): a lone kit centered on x, cut only on the side that meets
 * the other team, home's right edge and away's left, at the score line's slant, so its shape says which side it is.
 */
export function LoneKit({ team, side, x = 50, y, size }: { team: FaceTeam; side: number; x?: number; y: number; size: number }) {
    const h = size * kitHeight;
    const d = h * kitSlant;
    const w = kitTextWidth(team.name, size) + size * kitRoom;
    const [l, r, top, bottom] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2];
    const points = side === 0
        ? `${l},${top} ${r + d},${top} ${r - d},${bottom} ${l},${bottom}`
        : `${l + d},${top} ${r},${top} ${r},${bottom} ${l - d},${bottom}`;
    return <Kit points={points} team={team} x={x} y={y} size={size} />;
}

/** A team as the screen draws it: its short name, and its color when it has one. */
export interface FaceTeam {
    name: string;
    fill?: string;
}

/**
 * A match being played (DEMO, Try a match), in place of the pictures' made-up one: its teams, score,
 * and at a break which kind it is and who kicks off next.
 */
export interface FaceMatch {
    teams: [FaceTeam, FaceTeam];
    score: [number, number];
    breakTitle: string;
    nextKickoff: string;
    endLabel: string;
}

export function WatchFace({ setup, screen, shape, colors, label, match }: { setup: ScreenSetup; screen: ScreenAt; shape: WatchShape; colors?: boolean; label?: string; match?: FaceMatch }) {
    const [home, away] = match?.teams ?? (colors ? coloredTeams : plainTeams);
    const [homeScore, awayScore] = (match?.score ?? [1, 2]).map(String);
    const time = useTimeOfDay();
    const h = shape === "round" ? 100 : appleHeight;
    const y = (f: number) => f * h;
    const apple = shape === "apple";
    // UI-25: Apple Watch's own clock is always there; on the others the time is an edge choice.
    const edge = apple ? (setup.edge === "ring" ? "ring" : "none") : setup.edge;
    // UI-10: the teams as kits, the scores outside them.
    const scoreLine = (at: number) => <KitLine teams={[home, away]} scores={[homeScore, awayScore]} y={y(at)} size={apple ? 8.5 : 8.2} />;
    // TMR-15: a stopping clock standing still is orange, the stoppage's color, in every clock.
    const clockClass = screen.stopped ? "wf-figure wf-stopped" : "wf-figure";
    const figure = (text: string, x: number, at: number, size: number, className = "wf-figure") => (
        <text x={x} y={y(at)} fontSize={size} className={className} textAnchor="middle" dominantBaseline="central">{text}</text>
    );
    const bottomTime = edge === "time" && screen.phase === "running";
    return (
        <svg className={`watch-face watch-face-${shape}`} viewBox={`0 0 100 ${h}`} role="img" aria-label={label}>
            {apple ? <rect width="100" height={h} rx={appleCorner} className="wf-screen" /> : <circle cx="50" cy="50" r="50" className="wf-screen" />}
            {apple && <text x="86" y={y(0.075)} fontSize="7" className="wf-text wf-system" textAnchor="end" dominantBaseline="central">{time}</text>}
            {screen.phase === "halftime" ? (
                <>
                    {/* UI-25: at the very bottom of every screen but the menus. */}
                    {!apple && <text x="50" y={y(0.945)} fontSize="5" className="wf-dim" textAnchor="middle" dominantBaseline="central">{time}</text>}
                    <text x={apple ? 30 : 50} y={y(apple ? 0.075 : 0.13)} fontSize="5.2" className="wf-dim" textAnchor="middle" dominantBaseline="central">{match?.breakTitle ?? "HALF-TIME"}</text>
                    {scoreLine(apple ? 0.25 : 0.27)}
                    {figure(screen.breakClock ?? "", 50, apple ? 0.44 : 0.46, 20, screen.breakOver ? "wf-figure wf-over" : "wf-figure wf-break")}
                    <text x="50" y={y(0.62)} fontSize="5.6" className="wf-dim" textAnchor="middle" dominantBaseline="central">Kickoff: {match?.nextKickoff ?? away.name}</text>
                    <rect x="25" y={y(0.78) - 6.5} width="50" height="13" rx="6.5" className="wf-start" />
                    <text x="50" y={y(0.78)} fontSize="6.5" className="wf-start-text" textAnchor="middle" dominantBaseline="central">{match?.endLabel ?? "End HT"}</text>
                </>
            ) : (
                <>
                    {edge === "ring" && <Ring shape={shape} progress={screen.progress} down={setup.mainClock === "down"} />}
                    {setup.names ? (
                        <>
                            <text x="50" y={y(0.12)} fontSize="5.8" className="wf-dim" textAnchor="middle" dominantBaseline="central">{screen.period}</text>
                            {scoreLine(0.25)}
                        </>
                    ) : (
                        <>
                            <text x="50" y={y(0.10)} fontSize="5.8" className="wf-dim" textAnchor="middle" dominantBaseline="central">{screen.period}</text>
                            {/* UI-21, UI-10: scores only, where the scores are the kits. */}
                            <KitLine teams={[{ name: homeScore, fill: home.fill }, { name: awayScore, fill: away.fill }]} y={y(0.21)} size={8.6} />
                        </>
                    )}
                    {setup.clocks === "sideBySide" ? (
                        <>
                            {figure(screen.clock, 27, 0.5, screen.clock.length > 5 ? 14.5 : 17.5, clockClass)}
                            <line x1="50" x2="50" y1={y(0.5) - h * 0.08} y2={y(0.5) + h * 0.08} className="wf-line" />
                            {figure(screen.second ?? "", 73, 0.5, screen.clock.length > 5 ? 14.5 : 17.5, clockClass)}
                        </>
                    ) : (
                        figure(screen.clock, 50, 0.5, setup.names ? (screen.clock.length > 5 ? 24 : 29) : screen.clock.length > 5 ? 28 : setup.clocks === "stacked" ? 30 : 33, clockClass)
                    )}
                    {screen.added
                        ? figure(screen.added, 50, 0.69, 9, "wf-added")
                        : setup.clocks === "stacked" && figure(screen.second ?? "", 50, 0.69, 10, screen.stopped ? "wf-second wf-stopped" : "wf-second")}
                    {screen.sinBin ? (
                        <SinBinPills screen={screen} y={y(apple ? 0.84 : 0.835)} size={apple ? 7.8 : 7.5} room={apple ? 84 : 70} />
                    ) : (
                        <Pills
                            y={y(apple ? 0.84 : 0.835)}
                            size={apple ? 7.8 : 7.5}
                            pills={[
                                ...(screen.stoppage ? [{ ...screen.stoppage, className: "wf-stoppage" }] : []),
                                ...(screen.breakPill ? [{ ...screen.breakPill, className: "wf-break-pill" }] : []),
                            ]}
                        />
                    )}
                    {bottomTime && <text x="50" y={y(0.945)} fontSize="5" className="wf-dim" textAnchor="middle" dominantBaseline="central">{time}</text>}
                </>
            )}
        </svg>
    );
}
