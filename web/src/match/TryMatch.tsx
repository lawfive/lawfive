import type { ScreenSetup } from "@lawfive/schema";
import { type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { KitLine, LoneKit, WatchFace, type FaceMatch, type WatchShape } from "../components/WatchFace.tsx";
import { Icon, type IconName, lessMotion } from "../components/ui.tsx";
import { type Button, type Overlay, type Swipe, type SwipeWay, TryMatch as Controller, type WatchKind, watchNames } from "./controller.ts";
import { AWAY, HOME, type MatchSetup, formatClock, formatCountdown, formatSummary, periodLabel, suspendReasons } from "./engine.ts";

// DEMO: Try a match, the watch in the browser. A real match from the engine (engine.ts), on a drawn
// Garmin (or the touch Venu), Wear OS watch or Apple Watch, worked by its own buttons, swipes and taps
// (controller.ts) and the keyboard, with hints beside the controls, time at 1×, 10× or 60× with Skip to,
// and a short tour that's always there. Nothing is saved: it never becomes a match on the account. The running screen is the
// match screen setup's picture (WatchFace), live; the other screens are kept simple and true to each watch.

export interface TryMatchProps {
    /** The match: the account's next planned one, or a made-up one. */
    setup: Partial<MatchSetup>;
    /** UI-21: the account's match screen, or the visitor's. */
    screen: ScreenSetup;
    swipes: "upDown" | "sideways";
    /** The watch to show first: the account's own kind where it has one. */
    watch?: WatchKind;
    /** EVT-14: the codes for a card's reason, the account's (IFAB's when there's none). */
    misconductScheme?: string;
    /** Says what the match is, under the watch ("Strikers U12 v Rovers U12", or that it's made up). */
    caption?: string;
    /** The match screen it's using and the way to change it, beside the watch (the website's; lawfive.app has the setup under it). */
    screenRow?: ReactNode;
}

/** A made-up match, with what there is to try switched on: stoppage, the halfway break and scorers. */
export const demoMatch: Partial<MatchSetup> = {
    home: "STR", away: "ROV", homeColor: 0xd71920, awayColor: 0x0057b8,
    trackStoppage: true, midBreak: true, breakLenSec: 120, goalScorers: true,
};

const speeds = [1, 10, 60] as const;
const keyNames: Partial<Record<Button, string>> = { start: "Enter", back: "Esc", up: "↑", down: "↓", side: "Enter" };
/** A swipe's key, its icon, and the arrow it's pressed with (DEMO-3). */
const swipeKeys: Record<SwipeWay, { key: string; icon: IconName }> = {
    up: { key: "↑", icon: "swipeUp" }, down: { key: "↓", icon: "swipeDown" }, left: { key: "←", icon: "swipeLeft" },
    right: { key: "→", icon: "swipeRight" }, sideways: { key: "← →", icon: "swipeSideways" },
};
const arrowWays: Record<string, Swipe> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

/** A pill to tap: green for go, red for danger, quiet for the rest. */
function Pill({ label, x, y, width, tap, tone = "go", size = 6.5, focus }: { label: string; x: number; y: number; width: number; tap: string; tone?: "go" | "danger" | "quiet"; size?: number; focus?: boolean }) {
    const height = size * 2;
    return (
        <g data-tap={tap} className="try-hit">
            <rect x={x - width / 2} y={y - height / 2} width={width} height={height} rx={height / 2} className={`try-pill try-pill-${tone}${focus ? " focus" : ""}`} />
            <text x={x} y={y} fontSize={size} className="try-pill-text" textAnchor="middle" dominantBaseline="central">{label}</text>
        </g>
    );
}

function Text({ children, y, size = 6, dim, x = 50, color }: { children: ReactNode; y: number; size?: number; dim?: boolean; x?: number; color?: string }) {
    return <text x={x} y={y} fontSize={size} fill={color} className={dim ? "wf-dim" : "wf-text"} textAnchor="middle" dominantBaseline="central">{children}</text>;
}

/** A menu: Garmin's as its own list (the chosen row large, in the middle); Wear OS's and Apple Watch's as rows of pills. */
function MenuScreen({ o, h, garmin, teams }: { o: Extract<Overlay, { kind: "menu" }>; h: number; garmin: boolean; teams: ReturnType<Controller["teams"]> }) {
    // UI-6, UI-10: a team's menu, and the menus after it, have the team as a lone kit for their title.
    const title = o.titleTeam !== undefined
        ? <LoneKit team={{ name: o.title, fill: teams[o.titleTeam].fill }} side={o.titleTeam} y={h * (garmin ? 0.17 : h === 100 ? 0.15 : 0.13)} size={6.4} />
        : <Text y={h * (garmin ? 0.17 : 0.13)} size={6} dim>{o.title}</Text>;
    if (garmin) {
        const around = [-1, 0, 1].map((d) => o.focus + d).filter((i) => i >= 0 && i < o.rows.length);
        return (
            <>
                {title}
                <line x1="18" x2="82" y1={h * 0.41} y2={h * 0.41} className="wf-line" />
                <line x1="18" x2="82" y1={h * 0.61} y2={h * 0.61} className="wf-line" />
                {around.map((i) => {
                    const row = o.rows[i];
                    const middle = i === o.focus;
                    const y = h * (middle ? 0.51 : i < o.focus ? 0.31 : 0.71);
                    return (
                        <g key={row.id} data-tap={`row:${i}`} className="try-hit">
                            <rect x="10" y={y - (middle ? 9 : 7)} width="80" height={middle ? 18 : 14} fill="transparent" />
                            <text x="50" y={row.sub && middle ? y - 2.6 : y} fontSize={middle ? 7.4 : 5.6} className={`${middle ? "wf-text try-strong" : "wf-dim"}${row.tone === "sinBin" ? " try-sin-bin" : ""}`} textAnchor="middle" dominantBaseline="central">{row.label}</text>
                            {row.sub && middle && <text x="50" y={y + 4.6} fontSize="4.4" className="wf-dim" textAnchor="middle" dominantBaseline="central">{row.sub}</text>}
                        </g>
                    );
                })}
                {o.focus < o.rows.length - 1 && <path d={`M47 ${h * 0.86} L50 ${h * 0.89} L53 ${h * 0.86}`} className="try-more" />}
            </>
        );
    }
    // Three rows at a time, scrolled to keep the chosen one in view.
    const first = Math.max(0, Math.min(o.focus - 1, o.rows.length - 3));
    return (
        <>
            {title}
            {o.rows.slice(first, first + 3).map((row, k) => {
                const i = first + k;
                const y = h * (0.33 + k * 0.2);
                return (
                    <g key={row.id} data-tap={`row:${i}`} className="try-hit">
                        <rect x="9" y={y - 8.5} width="82" height="17" rx="8.5" className={`try-row${i === o.focus ? " focus" : ""}`} />
                        {/* EVT-12: Sin bin's label in the cards' yellow on the dark band, unlike the cards' own rows. */}
                        <text x="16" y={row.sub ? y - 2.4 : y} fontSize="5.8" className={`wf-text try-strong${row.tone === "sinBin" ? " try-sin-bin" : ""}`} dominantBaseline="central">{row.label}</text>
                        {row.sub && <text x="16" y={y + 3.6} fontSize="4.2" className="wf-dim" dominantBaseline="central">{row.sub}</text>}
                    </g>
                );
            })}
        </>
    );
}

/** EVT-3: the player number, two digits with the one being changed highlighted. */
function NumberScreen({ o, t, h, touch }: { o: Extract<Overlay, { kind: "number" }>; t: Controller; h: number; touch: boolean }) {
    const names: Record<string, string> = { G: "Goal", GP: "Penalty goal", GF: "DFK goal", Y: "Yellow", R: "Red", I: "Injury", SB: "Sin bin" };
    const adjust = o.adjust;
    // TMR-14: the minutes, then the seconds, of the period's time or the added time.
    const title = adjust ? (adjust.what === "clock" ? "Adjust clock" : "Added time") : `${names[o.type] ?? o.type} ${t.name(o.team)}`;
    // SET-16: a match of one period has no label: "Minutes played".
    const label = periodLabel(t.match.period, t.match.setup.numPeriods);
    const into = adjust?.what === "clock" ? (label ? ` into ${label}` : " played") : "";
    const unit = adjust ? `${adjust.part === "minutes" ? "Minutes" : "Seconds"}${into}` : "Player number";
    const valid = !adjust || t.adjustValid(adjust, o.digits[0] * 10 + o.digits[1]);
    return (
        <>
            <Text y={h * 0.16} size={5.6} dim>{title}</Text>
            <Text y={h * 0.27} size={4.6} dim>{unit}</Text>
            {[0, 1].map((d) => (
                <g key={d} data-tap={`digit:${d}`} className="try-hit">
                    <rect x={d === 0 ? 27 : 51} y={h * 0.47 - 13} width="22" height="26" rx="4" className={o.active === d ? "try-digit on" : "try-digit"} />
                    <text x={d === 0 ? 38 : 62} y={h * 0.47} fontSize="20" className="wf-figure" textAnchor="middle" dominantBaseline="central">{o.digits[d]}</text>
                </g>
            ))}
            {touch ? (
                <>
                    <g data-tap="nudge:1" className="try-hit"><path d={`M44 ${h * 0.3} L50 ${h * 0.25} L56 ${h * 0.3}`} className="try-more" /></g>
                    {adjust ? (
                        <Pill label="OK" x={50} y={h * 0.76} width={26} tap="ok" size={5.6} tone={valid ? undefined : "quiet"} />
                    ) : (
                        <>
                            <Pill label="OK" x={36} y={h * 0.76} width={26} tap="ok" size={5.6} />
                            <Pill label="No number" x={66} y={h * 0.76} width={30} tap="none" tone="quiet" size={5} />
                        </>
                    )}
                </>
            ) : (
                <Text y={h * 0.74} size={4.6} dim>{o.active === 0 ? "Start: next digit" : !valid ? "Up to 59 seconds" : adjust ? "Start: OK" : "Start: record it"}</Text>
            )}
        </>
    );
}

/** PRE-8's picture (DESIGN.md, kickoff direction): the forearm across the screen, the watch a ring on it, an arrow to the goal. */
function DirectionScreen({ h }: { h: number }) {
    return (
        <>
            <Text y={h * 0.15} size={5.6} dim>Kickoff direction</Text>
            <rect x="8" y={h * 0.4} width="84" height="12" rx="6" fill="#555555" />
            <circle cx="50" cy={h * 0.46} r="8" fill="none" stroke="#ffffff" strokeWidth="1.6" />
            <line x1="50" x2="50" y1={h * 0.46 - 8} y2={h * 0.46 - 5} stroke="#ffffff" strokeWidth="1.6" />
            <path d={`M50 ${h * 0.46 - 11} L50 ${h * 0.2} M46 ${h * 0.25} L50 ${h * 0.2} L54 ${h * 0.25}`} className="try-arrow" />
            <Text y={h * 0.66} size={4.8}>On a real watch, you face the goal</Text>
            <Text y={h * 0.73} size={4.8}>and its compass reads the way.</Text>
            <Pill label="OK" x={50} y={h * 0.86} width={26} tap="close" size={5.4} tone="quiet" />
        </>
    );
}

/** The screens that aren't the running match or half-time. */
function OtherScreen({ t, now, h, kind }: { t: Controller; now: number; h: number; kind: WatchKind }) {
    const m = t.match;
    const [home, away] = t.teams();
    // UI-10: the score line's scores, outside the kits.
    const scores: [string, string] = [String(m.score[HOME]), String(m.score[AWAY])];
    const touch = kind !== "garmin";
    const o = t.overlay;
    if (o?.kind === "menu") {
        return <MenuScreen o={o} h={h} garmin={kind === "garmin" || kind === "venu"} teams={t.teams()} />;
    }
    if (o?.kind === "number") {
        return <NumberScreen o={o} t={t} h={h} touch={touch} />;
    }
    if (o?.kind === "confirm") {
        return (
            <>
                <Text y={h * 0.3} size={8}>{o.title}</Text>
                {o.detail && <Text y={h * 0.42} size={5} dim>{o.detail}</Text>}
                <Pill label={o.yes} x={50} y={h * 0.6} width={46} tap="yes" tone={o.danger ? "danger" : "go"} size={6} />
                <Pill label="No" x={50} y={h * 0.78} width={46} tap="no" tone="quiet" size={6} />
            </>
        );
    }
    if (o?.kind === "coin") {
        return (
            <>
                <Text y={h * 0.15} size={5.6} dim>Coin toss</Text>
                <g key={o.flips} className="try-coin">
                    <circle cx="50" cy={h * 0.45} r="17" className="try-coin-face" />
                    <circle cx="50" cy={h * 0.45} r="13.5" className="try-coin-rim" />
                    <text x="50" y={h * 0.45} fontSize="6" className="try-coin-text" textAnchor="middle" dominantBaseline="central">{o.side ?? "?"}</text>
                </g>
                <Pill label={o.side ? "Flip again" : "Flip the coin"} x={50} y={h * 0.78} width={48} tap="flip" size={5.6} />
            </>
        );
    }
    if (o?.kind === "clip") {
        return <DirectionScreen h={h} />;
    }
    if (o?.kind === "sendOff") {
        // EVT-6: the full red screen, naming the player, until a button or a tap; EVT-12: for a second sin bin too.
        return (
            <>
                {h === 100 ? <circle cx="50" cy="50" r="50" className="try-send-off" /> : <rect width="100" height={h} rx="22" className="try-send-off" />}
                <Text y={h * 0.32} size={7}>{o.why}</Text>
                <Text y={h * 0.45} size={6.4}>{o.player !== undefined ? `#${o.player} ` : ""}{t.name(o.team)}</Text>
                <text x="50" y={h * 0.62} fontSize="13" className="wf-figure" textAnchor="middle" dominantBaseline="central">Send off</text>
            </>
        );
    }
    switch (m.phase) {
        case "pre":
        case "ready":
        case "nextKickoff": {
            const next = m.phase === "nextKickoff";
            const chosen = next ? m.kickoffFor(m.period + 1) : m.kickoff;
            const summary = next
                ? `${periodLabel(m.period + 1, m.setup.numPeriods)} kickoff`
                : formatSummary(m.setup);
            return (
                <>
                    <Text y={h * 0.15} size={5.4} dim>{summary}</Text>
                    {/* UI-11: the chosen team has a dot above its kit; before a choice, neither. */}
                    <KitLine teams={[home, away]} scores={scores} y={h * 0.35} size={8.4} chosen={chosen} taps={["team:0", "team:1"]} />
                    {chosen < 0
                        ? <Text y={h * 0.62} size={6.6}>Who kicks off?</Text>
                        : <Pill label="Start" x={50} y={h * 0.64} width={52} tap="start" size={8} />}
                </>
            );
        }
        case "decide": {
            const level = m.score[HOME] === m.score[AWAY];
            return (
                <>
                    <Text y={h * 0.14} size={5.4} dim>{level ? `Level, ${m.score[HOME]}-${m.score[AWAY]}` : `${m.score[HOME]}-${m.score[AWAY]}`}</Text>
                    {t.decisions().map((d, i) => (
                        <Pill key={d.id} label={d.label} x={50} y={h * (0.36 + i * 0.19)} width={60} tap={`decide:${d.id}`} size={6.2}
                            tone={i === t.choice ? "go" : "quiet"} focus={i === t.choice} />
                    ))}
                </>
            );
        }
        case "penalties": {
            if (!m.penStarted) {
                return (
                    <>
                        <Text y={h * 0.15} size={5.4} dim>Who kicks first?</Text>
                        <KitLine teams={[home, away]} scores={scores} y={h * 0.37} size={8.4} chosen={m.penFirst} taps={["team:0", "team:1"]} />
                        {m.penFirst >= 0 && <Pill label="Start" x={50} y={h * 0.66} width={52} tap="start" size={8} />}
                    </>
                );
            }
            const pens = m.penaltyScore() ?? [0, 0];
            const winner = m.penaltyWinner();
            const dots = (team: number, x: number) => m.kickResults(team).slice(-5).map((scored, i) => (
                <circle key={i} cx={x + i * 5} cy={h * 0.46} r="1.8" className={scored ? "try-kick-scored" : "try-kick-missed"} />
            ));
            return (
                <>
                    <Text y={h * 0.13} size={5.4} dim>PENALTIES</Text>
                    <KitLine teams={[home, away]} scores={[String(pens[HOME]), String(pens[AWAY])]} y={h * 0.27} size={7.6} />
                    {dots(HOME, 20)}
                    {dots(AWAY, 60)}
                    {winner >= 0 ? (
                        <>
                            <Text y={h * 0.6} size={6.4}>{t.name(winner)} win</Text>
                            <Pill label="End match" x={50} y={h * 0.78} width={52} tap="kick:end" size={6.4} />
                        </>
                    ) : (
                        <>
                            <Text y={h * 0.58} size={5.6} dim>{t.name(m.nextKicker())} to kick</Text>
                            <Pill label="Scored" x={32} y={h * 0.76} width={30} tap="kick:scored" size={5.8} tone={t.choice === 0 ? "go" : "quiet"} focus={t.choice === 0} />
                            <Pill label="Missed" x={68} y={h * 0.76} width={30} tap="kick:missed" size={5.8} tone={t.choice === 1 ? "go" : "quiet"} focus={t.choice === 1} />
                        </>
                    )}
                </>
            );
        }
        case "golden":
            return (
                <>
                    <Text y={h * 0.15} size={5.4} dim>GOLDEN GOAL</Text>
                    <text x="50" y={h * 0.33} fontSize="13" className="wf-figure" textAnchor="middle" dominantBaseline="central">{m.score[HOME]}–{m.score[AWAY]}</text>
                    <Text y={h * 0.49} size={6}>{t.name(m.goldenWinner())} win</Text>
                    <Pill label="End match" x={50} y={h * 0.66} width={52} tap="golden:end" size={6.2} />
                    <Pill label="Undo" x={50} y={h * 0.83} width={52} tap="golden:undo" size={6} tone="quiet" />
                </>
            );
        case "suspended": {
            // TMR-13: as half-time's screen: the reason (or LIGHTNING), the score, the lightning countdown or the time
            // suspended, and a Resume pill that only a tap on itself works (INP-8).
            const lightning = m.lightningLeftMs(now);
            const suspended = formatClock(m.suspendedMs(now) ?? 0);
            const reason = suspendReasons.find(([n]) => n === m.suspendReason)?.[1] ?? "Other";
            return (
                <>
                    <Text y={h * 0.15} size={5.4} dim>{lightning !== undefined ? "LIGHTNING" : "SUSPENDED"}</Text>
                    <KitLine teams={[home, away]} scores={scores} y={h * 0.29} size={7.6} />
                    <text x="50" y={h * 0.47} fontSize="18" className={lightning === undefined ? "wf-figure" : lightning > 0 ? "wf-figure wf-break" : "wf-figure try-lightning-over"}
                        textAnchor="middle" dominantBaseline="central">{lightning !== undefined ? formatCountdown(lightning) : suspended}</text>
                    <Text y={h * 0.62} size={5.2} dim>{lightning !== undefined ? `Suspended ${suspended}` : reason === "Other" ? "Other reason" : reason}</Text>
                    <Pill label="Resume" x={50} y={h * 0.78} width={50} tap="resume" size={6.4} />
                </>
            );
        }
        case "done": {
            const pens = m.penaltyScore();
            return (
                <>
                    <Text y={h * 0.15} size={5.4} dim>{m.isAbandoned ? "ABANDONED" : "FULL TIME"}</Text>
                    <KitLine teams={[home, away]} scores={scores} y={h * 0.34} size={8.2} />
                    {pens && <Text y={h * 0.47} size={5} dim>Pens {pens[HOME]}–{pens[AWAY]}</Text>}
                    <Text y={h * 0.58} size={5} dim>A demo: nothing is saved</Text>
                    <Pill label="Start over" x={50} y={h * 0.76} width={52} tap="done" size={6.4} />
                </>
            );
        }
        default:
            return null;
    }
}

/**
 * EVT-12: a sin bin over, over the match screen until a button or a tap: the team as a lone kit (UI-10), the number large,
 * "can return" in the start green, and how many more are waiting.
 */
function CanReturnScreen({ t, h }: { t: Controller; h: number }) {
    const first = t.match.sinBinReturns[0];
    const team = t.teams()[first.team];
    const more = t.match.sinBinReturns.length - 1;
    return (
        <>
            <LoneKit team={team} side={first.team} y={h * 0.25} size={7.6} />
            {first.player !== undefined && <text x="50" y={h * 0.45} fontSize="24" className="wf-figure" textAnchor="middle" dominantBaseline="central">#{first.player}</text>}
            <text x="50" y={h * (first.player !== undefined ? 0.64 : 0.47)} fontSize="9" className="wf-figure try-can-return" textAnchor="middle" dominantBaseline="central">can return</text>
            {more > 0 && <Text y={h * 0.77} size={5.4} dim>+{more}</Text>}
        </>
    );
}

/** The watch's screen: the live match screen, half-time, or one of the others. */
function Screen({ t, now, kind }: { t: Controller; now: number; kind: WatchKind }) {
    const shape: WatchShape = kind === "apple" ? "apple" : "round";
    const m = t.match;
    const h = shape === "apple" ? 119 : 100;
    if (!t.overlay && t.canReturn) {
        return (
            <svg className={`watch-face watch-face-${shape}`} viewBox={`0 0 100 ${h}`} role="img" aria-label={`${t.match.sinBinReturnText()}, on ${watchNames[kind]}`}>
                {shape === "apple" ? <rect width="100" height={h} rx="22" className="wf-screen" /> : <circle cx="50" cy="50" r="50" className="wf-screen" />}
                <CanReturnScreen t={t} h={h} />
            </svg>
        );
    }
    if (!t.overlay && (m.phase === "running" || m.phase === "break")) {
        const next = m.phase === "break" ? m.kickoffFor(m.period + 1) : -1;
        const face: FaceMatch = {
            teams: t.teams(),
            score: m.score,
            breakTitle: m.isHalftime ? "HALF-TIME" : "BREAK",
            nextKickoff: next >= 0 ? t.name(next) : "the toss",
            endLabel: t.endHalftimeLabel,
        };
        return (
            <div className="try-face">
                <WatchFace setup={t.screen} screen={t.screenAt(now)} shape={shape} match={face} label={`The match on ${watchNames[kind]}`} />
                {/* INP-8: at a break, only the pill itself ends it. */}
                {m.phase === "break" && <svg className="try-face-hits" viewBox={`0 0 100 ${h}`}><rect data-tap="endBreak" x="25" y={h * 0.78 - 6.5} width="50" height="13" rx="6.5" fill="transparent" className="try-hit" /></svg>}
            </div>
        );
    }
    return (
        <svg className={`watch-face watch-face-${shape}`} viewBox={`0 0 100 ${h}`} role="img" aria-label={`The match on ${watchNames[kind]}`}>
            {shape === "apple" ? <rect width="100" height={h} rx="22" className="wf-screen" /> : <circle cx="50" cy="50" r="50" className="wf-screen" />}
            <OtherScreen t={t} now={now} h={h} kind={kind} />
        </svg>
    );
}

/** The watch's own buttons, where they are on its case. */
const buttonsOf: Record<WatchKind, { id: Button; name: string; angle: number; side: "left" | "right"; inert?: boolean; idle?: string }[]> = {
    garmin: [
        { id: "light", name: "Light", angle: -55, side: "left", inert: true },
        { id: "up", name: "Up", angle: -90, side: "left" },
        { id: "down", name: "Down", angle: -125, side: "left" },
        { id: "start", name: "Start", angle: 55, side: "right" },
        { id: "back", name: "Back", angle: 125, side: "right" },
    ],
    venu: [
        { id: "start", name: "Start", angle: 55, side: "right" },
        { id: "back", name: "Back", angle: 125, side: "right" },
    ],
    wearos: [{ id: "side", name: "Button", angle: 90, side: "right", idle: "Stoppage, when it's tracked" }],
    apple: [],
};

/** Where a button's hint sits: level with it, and clear of it where it sticks out past the case (the middle ones). */
function hintPlace(angle: number): CSSProperties {
    const reach = Math.max(0, Math.round(Math.abs(Math.sin((angle * Math.PI) / 180)) * 176 - 150));
    return { "--angle": `${angle}deg`, "--reach": `${reach}px` } as CSSProperties;
}

interface TourStep {
    title: string;
    text: (kind: WatchKind, t: Controller) => string;
    done: (t: Controller) => boolean;
    /** The control the step waits for, marked on the watch and in the hints: a button's id, "screen", or "swipe:<way>". */
    control: (kind: WatchKind, t: Controller) => string;
    skipTo?: "halfway" | "end";
}

const buttoned = (kind: WatchKind) => kind === "garmin" || kind === "venu";

/** DEMO-6: the tour, about eight steps through a half, each waiting for the control it shows. */
function tourSteps(t: Controller): TourStep[] {
    const s = t.match.setup;
    const ways = t.swipeWays();
    const swipeHome = `Swipe ${ways.home}`;
    const steps: TourStep[] = [
        {
            title: "Choose who kicks off",
            text: (kind) => (kind === "garmin" ? `Up for ${s.home}, Down for ${s.away}.` : `Tap ${s.home} or ${s.away}.`),
            done: (c) => c.match.kickoff >= 0,
            control: (kind) => (kind === "garmin" ? "up" : "screen"),
        },
        {
            title: "Start the match",
            text: (kind) => (kind === "garmin" ? "Press Start." : "Tap the green Start: only the pill starts it, so a stray tap can't."),
            done: (c) => c.match.phase === "running",
            control: (kind) => (kind === "garmin" ? "start" : "screen"),
        },
        {
            title: `A goal for ${s.home}`,
            text: (kind) => (kind === "garmin"
                ? `Up opens ${s.home}'s controls; Start on Goal${s.goalScorers ? ", then the scorer's number, a digit at a time" : ""}.`
                : `${swipeHome} for ${s.home}'s controls, then tap Goal${s.goalScorers ? " and the scorer's number" : ""}.`),
            done: (c) => c.match.score[HOME] > 0,
            control: (kind) => (kind === "garmin" ? "up" : `swipe:${ways.home}`),
        },
        {
            title: "A yellow card",
            text: (kind) => (kind === "garmin" ? "Up or Down for a team, then Yellow card and the player's number." : "Open a team's controls, then Yellow card and the number."),
            done: (c) => c.match.events.some((e) => e.type === "Y" || e.type === "Y2"),
            control: (kind) => (kind === "garmin" ? "up" : `swipe:${ways.home}`),
        },
    ];
    if (s.stoppingClock) {
        // TMR-15: a clock that stops.
        steps.push({
            title: "Stop the clock",
            text: (kind) => (buttoned(kind) ? "Start stops the clock, which turns orange; Start again starts it at the restart. A goal or card stops it too."
                : kind === "wearos" ? "The watch's button stops the clock, which turns orange, and starts it again." : "From the game menu: Stop clock, then Start clock."),
            done: (c) => c.match.events.some((e) => e.type === "S"),
            control: (kind) => (buttoned(kind) ? "start" : kind === "wearos" ? "side" : `swipe:${ways.game}`),
        });
    } else if (s.trackStoppage) {
        steps.push({
            title: "A stoppage",
            text: (kind) => (buttoned(kind) ? "Start starts a stoppage; Start again ends it. The orange pill adds it up, and in added time counts down what's left."
                : kind === "wearos" ? "The watch's button starts a stoppage, and ends it." : "From the game menu: Start stoppage, then End stoppage."),
            done: (c) => c.match.events.some((e) => e.type === "S"),
            control: (kind) => (buttoned(kind) ? "start" : kind === "wearos" ? "side" : `swipe:${ways.game}`),
        });
    }
    if (s.midBreak) {
        steps.push({
            title: "The halfway break",
            text: (kind) => `Skip to the halfway break. At 21:30 it's due and the watch buzzes; ${buttoned(kind) ? "Start" : "the game menu's Start break"} starts its countdown.`,
            done: (c) => c.match.breakRemainingMs(Number.MAX_SAFE_INTEGER) !== undefined || (c.match.scheduledBreakDone && !c.match.breakDue),
            control: (kind) => (buttoned(kind) ? "start" : `swipe:${ways.game}`),
            skipTo: "halfway",
        });
    }
    steps.push(
        {
            title: "Time up",
            // VIB-1: with stoppage tracked and stoppage time, one buzz as added time starts; without either, it buzzes
            // until answered.
            text: (kind, c) => (s.trackStoppage && !c.match.fullTimeRepeats && (c.match.stoppageMs > 0 || c.match.isStoppageActive)
                ? "Skip to the end of the half. At 45:00 the watch buzzes once; added time counts on in orange, and the pill counts down what's left of it."
                : `Skip to the end of the half. At 45:00 the watch buzzes until you ${buttoned(kind) ? "press a button" : "tap"}${s.trackStoppage ? ", as there's no stoppage time to add" : ""}; added time counts on in orange.`),
            done: (c) => c.match.fullTimeAcked,
            control: (kind) => (buttoned(kind) ? "start" : "screen"),
            skipTo: "end",
        },
        {
            title: "End the half",
            text: (kind) => (buttoned(kind) ? "Back opens the game menu, with End 1st half at the top. Confirm it." : "Open the game menu; End first half is at the top."),
            done: (c) => c.match.phase === "break" || c.match.period > 0,
            control: (kind) => (buttoned(kind) ? "back" : `swipe:${ways.game}`),
        },
        {
            title: "Half-time",
            text: (kind) => `The break clock counts down. ${buttoned(kind) ? "Start" : "End half-time"} when the teams are back; the other team kicks off the second half.`,
            done: (c) => c.match.phase === "nextKickoff" || c.match.period > 0,
            control: (kind) => (buttoned(kind) ? "start" : "screen"),
        },
    );
    return steps;
}

/** A hint as a row under the watch: what it is, what it does now, and its key. */
interface HintRow {
    control: string;
    label: string;
    text: string;
    icon?: IconName;
    key?: string;
    /** A button's: beside the watch on a computer, so only under it on a phone. */
    narrow?: boolean;
}

/** DEMO-3: what the keys do on this watch, for a computer. */
function KeyGuide({ kind, t }: { kind: WatchKind; t: Controller }) {
    const keys = (rows: [string, string, string][]) => (
        <div className="try-keys-grid">
            {rows.map(([key, name, what]) => (
                <div key={name}><kbd>{key}</kbd><span><b>{name}</b>{what}</span></div>
            ))}
        </div>
    );
    if (kind === "garmin") {
        return (
            <section className="try-keys" aria-label="What the keys do">
                <h3>Your keyboard is the watch</h3>
                <p className="muted">The keys press the buttons they're named for.</p>
                {keys([["↑", "Up", ""], ["↓", "Down", ""], ["Enter", "Start", ""], ["Esc", "Back", ""]])}
            </section>
        );
    }
    const ways = t.swipeWays();
    const [home, away] = [t.name(HOME), t.name(AWAY)];
    return (
        <section className="try-keys" aria-label="What the keys do">
            <h3>Your keyboard is the watch</h3>
            <p className="muted">The arrows are swipes across the screen, the arrow's way. In a menu, ↑ and ↓ move through it.</p>
            {keys([
                [swipeKeys[ways.home].key, `Swipe ${ways.home}`, `${home}'s controls`],
                [swipeKeys[ways.away].key, `Swipe ${ways.away}`, `${away}'s controls`],
                [swipeKeys[ways.game].key, `Swipe ${ways.game}`, "Game menu"],
                ["Enter", kind === "venu" ? "Start" : "Tap", kind === "venu" ? "The button" : "The green pill, or the chosen row"],
                ...(kind === "venu" ? [["Esc", "Back", "The button"] as [string, string, string]] : []),
            ])}
        </section>
    );
}

export function TryMatch({ setup, screen, swipes, watch = "garmin", caption, screenRow, misconductScheme }: TryMatchProps) {
    const [kind, setKind] = useState<Exclude<WatchKind, "venu">>(watch === "venu" ? "garmin" : watch);
    const [venu, setVenu] = useState(watch === "venu");
    // EVT-14: the watch's Card reasons setting, off as on a new watch.
    const [cardReasons, setCardReasons] = useState(false);
    // INP-12: the watch's Touch lock, for the five-button Garmins and Apple Watch.
    const [touchLock, setTouchLock] = useState(false);
    const shown: WatchKind = kind === "garmin" && venu ? "venu" : kind;
    const [controller, setController] = useState(() => new Controller(setup, { watch: shown, swipes, screen }));
    controller.options = { watch: shown, swipes, screen, cardReasons, misconductScheme, touchLock };
    const [, setRevision] = useState(0);
    const redraw = useCallback(() => setRevision((r) => r + 1), []);

    // Time: the visitor's clock, faster when asked, with Skip to.
    const [speed, setSpeed] = useState<(typeof speeds)[number]>(1);
    const clock = useRef({ sim: Date.now(), real: performance.now(), speed: 1, lastTick: Date.now() });
    const now = () => clock.current.sim + (performance.now() - clock.current.real) * clock.current.speed;
    const rebase = (sim: number, newSpeed = clock.current.speed) => {
        clock.current = { ...clock.current, sim, real: performance.now(), speed: newSpeed };
    };
    const [buzz, setBuzz] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => {
            const at = now();
            // Every simulated second, as the watch's timer ticks; a long jump catches up at most a minute.
            let ticks = 0;
            while (clock.current.lastTick + 1000 <= at && ticks < 120) {
                clock.current.lastTick += 1000;
                ticks += 1;
                if (controller.tick(clock.current.lastTick)) {
                    setBuzz((b) => b + 1);
                    if (!lessMotion() && "vibrate" in navigator) {
                        navigator.vibrate?.([180, 90, 180]);
                    }
                }
            }
            if (clock.current.lastTick + 1000 <= at) {
                clock.current.lastTick = Math.floor(at / 1000) * 1000;
            }
            redraw();
        }, 100);
        return () => window.clearInterval(timer);
    }, [controller, redraw]);
    const setSpeedTo = (s: (typeof speeds)[number]) => {
        rebase(now(), s);
        setSpeed(s);
    };

    const m = controller.match;
    const at = now();
    /** Skip to: a few seconds before the moment, as only forward is possible. */
    const skipTargets: { id: "halfway" | "end" | "breakEnd"; label: string; to: number }[] = [];
    if (m.phase === "running" && m.periodStart !== undefined) {
        const due = m.breakDueInMs(at);
        if (due !== undefined && due > 5000) {
            skipTargets.push({ id: "halfway", label: "The halfway break", to: at + due - 3000 });
        }
        const left = m.currentPeriodSec * 1000 - m.matchMs(at);
        if (left > 6000) {
            skipTargets.push({ id: "end", label: `The end of ${periodLabel(m.period, m.setup.numPeriods) || "the period"}`, to: at + left - 5000 });
        }
    }
    // TMR-13: the end of the lightning wait.
    const lightningLeft = m.lightningLeftMs(at);
    if (lightningLeft !== undefined && lightningLeft > 6000) {
        skipTargets.push({ id: "breakEnd", label: "The end of the lightning wait", to: at + lightningLeft - 5000 });
    }
    if (m.phase === "break") {
        const left = m.breakRemainingMs(at) ?? 0;
        if (left > 6000) {
            skipTargets.push({ id: "breakEnd", label: m.isHalftime ? "The end of half-time" : "The end of the break", to: at + left - 5000 });
        }
    }
    const skip = (to: number) => {
        rebase(to);
        clock.current.lastTick = to - 1000;
        redraw();
    };

    const act = (fn: () => void) => {
        fn();
        redraw();
    };

    // Swipes and taps on the screen. The pointer is held by the screen until it's let go, so a drag that
    // leaves the watch still ends as a swipe, and nothing on the page is selected or dragged along the way.
    const start = useRef<{ x: number; y: number } | undefined>(undefined);
    const onDown = (e: ReactPointerEvent) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: ReactPointerEvent) => {
        const from = start.current;
        start.current = undefined;
        if (!from) {
            return;
        }
        const dx = e.clientX - from.x;
        const dy = e.clientY - from.y;
        if (Math.hypot(dx, dy) > 24) {
            const direction: Swipe = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
            act(() => controller.swipe(direction, now()));
            return;
        }
        // Held by the screen, the event's target is the screen: what's under the finger is the tap's.
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = under?.closest("[data-tap]")?.getAttribute("data-tap") ?? "screen";
        act(() => controller.tap(target, now()));
    };

    // The keyboard: arrows, Enter and Escape, unless a field has focus; Enter on a button or link outside the watch is that control's.
    // An arrow that swipes shows a finger crossing the screen its way, so it's clear what the key did.
    const [trail, setTrail] = useState<{ way: Swipe; n: number }>();
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            const control = el?.closest("button, a") && !el.closest(".try-watch");
            if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, select, textarea") || (control && (e.key === "Enter" || e.key === " "))) {
                return;
            }
            const way = arrowWays[e.key];
            const swiped = way !== undefined && controller.options.watch !== "garmin" && !(controller.overlay && (way === "up" || way === "down"));
            if (controller.key(e.key, now())) {
                e.preventDefault();
                if (swiped) {
                    setTrail((t) => ({ way, n: (t?.n ?? 0) + 1 }));
                }
                redraw();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [controller, redraw]);

    // The tour, always there (DEMO-6): the steps follow the match, so starting over starts it again.
    const [cup, setCup] = useState(false);
    const steps = tourSteps(controller);
    const stepIndex = steps.findIndex((s) => !s.done(controller));
    const step = !cup && stepIndex >= 0 ? steps[stepIndex] : undefined;
    // The control the step waits for: inside a menu or number, the one that chooses.
    // INP-12: under Apple Watch's Water Lock, the crown first.
    const wanted = step && (controller.touchLocked && shown === "apple" ? "crown" : controller.overlay ? (buttoned(shown) ? "start" : "screen") : step.control(shown, controller));
    const hintList = controller.hints(at);
    const hintFor = (control: string) => hintList.find((h) => h.control === control)?.text;

    const startOver = () => {
        rebase(Date.now(), clock.current.speed);
        clock.current.lastTick = Date.now();
        setCup(false);
        setController(new Controller(setup, { watch: shown, swipes, screen }));
    };
    /** After the tour: the last seconds of a level second half of a cup match, for extra time and a shoot-out. */
    const tryCup = () => {
        const cupSetup = { ...setup, extraTime: true, penalties: true, midBreak: false };
        const c = new Controller(cupSetup, { watch: shown, swipes, screen });
        const t0 = Date.now();
        c.match.selectKickoff(HOME);
        c.kickedOffWith = screen;
        c.match.start(t0 - (cupSetup.periodSec ?? 2700) * 1000 * 2, screen);
        c.match.endPeriod(t0 - (cupSetup.periodSec ?? 2700) * 1000 - 600_000);
        c.match.endHalftime();
        c.match.startNextPeriod(t0 - ((cupSetup.periodSec ?? 2700) - 20) * 1000);
        setCup(true);
        rebase(t0);
        clock.current.lastTick = t0;
        setController(c);
    };

    const buttons = buttonsOf[shown];
    const shape = shown === "apple" ? "apple" : "round";
    const rows: HintRow[] = [
        ...buttons.filter((b) => hintFor(b.id)).map((b) => ({ control: b.id, label: b.name, text: hintFor(b.id)!, key: keyNames[b.id], narrow: true })),
        ...hintList.filter((h) => h.control === "screen").map((h) => ({ control: h.control, label: "Screen", text: h.text, icon: "tap" as const, key: "Enter" })),
        // INP-12: Apple Watch's Water Lock, which the crown turns off.
        ...hintList.filter((h) => h.control === "crown").map((h) => ({ control: h.control, label: "Crown", text: h.text, icon: "unlock" as const, key: "Enter" })),
        ...hintList.filter((h) => h.control.startsWith("swipe:")).map((h) => {
            const way = swipeKeys[h.control.slice(6) as SwipeWay];
            return { control: h.control, label: h.label ?? "", text: h.text, icon: way.icon, key: way.key };
        }),
    ];
    const restart = (
        <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { startOver(); e.currentTarget.blur(); }}>
            <Icon name="restart" size={16} />Restart the tour
        </button>
    );
    const skipFor = step?.skipTo && skipTargets.find((t) => t.id === step.skipTo);

    // A button clicked with a mouse or a finger lets go of the focus, so the arrows that work the watch next
    // don't draw a focus ring around it; one reached with the keyboard keeps it (DEMO-3).
    const letGo = (e: ReactMouseEvent) => {
        if (e.detail > 0) {
            (e.target as Element).closest("button")?.blur();
        }
    };

    return (
        <div className="try-match" onClick={letGo}>
            <div className="try-stage">
                <section className="try-tour" aria-label="The tour" aria-live="polite">
                    <div className="try-tour-head">
                        <span className="try-tour-count">{step ? `Step ${stepIndex + 1} of ${steps.length}` : cup ? "After the tour" : "Tour done"}</span>
                        {step && restart}
                    </div>
                    <div className="try-tour-bar" aria-hidden="true">
                        {steps.map((s, i) => <span key={s.title} className={!step || i < stepIndex ? "done" : i === stepIndex ? "now" : undefined} />)}
                    </div>
                    {step ? (
                        <>
                            <strong>{step.title}</strong>
                            <p>{step.text(shown, controller)}</p>
                            {skipFor && (
                                <div className="try-tour-actions">
                                    <button type="button" className="btn btn-primary" onClick={() => skip(skipFor.to)}><Icon name="next" size={16} />{skipFor.label}</button>
                                </div>
                            )}
                        </>
                    ) : cup ? (
                        <>
                            <strong>A level cup match</strong>
                            <p>Twenty seconds of the second half left, level. When it ends, choose extra time: it has its own toss, then a shoot-out if it's still level.</p>
                            <div className="try-tour-actions">{restart}</div>
                        </>
                    ) : (
                        <>
                            <strong>That's a half</strong>
                            <p>Carry on into the second half, or try the end of a level cup match: extra time with its own toss, then a shoot-out.</p>
                            <div className="try-tour-actions">
                                <button type="button" className="btn btn-primary" onClick={tryCup}>Extra time and penalties</button>
                                {restart}
                            </div>
                        </>
                    )}
                </section>
                <div className="try-watch-row">
                    <div className="try-hints try-hints-left">
                        {buttons.filter((b) => b.side === "left").map((b) => (
                            <span key={b.id} className={`try-hint${hintFor(b.id) ? "" : " idle"}${b.id === wanted ? " on" : ""}`} style={hintPlace(b.angle)}>
                                {keyNames[b.id] && hintFor(b.id) && <kbd>{keyNames[b.id]}</kbd>}
                                {hintFor(b.id) ?? (b.inert ? "Not used here" : b.idle ?? b.name)}
                            </span>
                        ))}
                    </div>
                    <div key={buzz} className={`try-watch try-watch-${shape} try-${shown}${buzz ? " buzz" : ""}`}>
                        {buttons.map((b) => (
                            <button key={b.id} type="button" className={`try-button try-button-${b.side}${b.id === wanted ? " on" : ""}`} style={{ "--angle": `${b.angle}deg` } as CSSProperties}
                                aria-label={`${b.name}${hintFor(b.id) ? `: ${hintFor(b.id)}` : ""}`} disabled={b.inert}
                                onClick={() => act(() => controller.press(b.id, now()))} />
                        ))}
                        {shown === "apple" && (touchLock
                            // INP-12: with Touch lock on, the Digital Crown turns Water Lock off.
                            ? <button type="button" className={`try-crown${wanted === "crown" ? " on" : ""}`} aria-label={`Digital Crown${hintFor("crown") ? `: ${hintFor("crown")}` : ""}`}
                                onClick={() => act(() => controller.press("crown", now()))} />
                            : <span className="try-crown" aria-hidden="true" />)}
                        <div className="try-screen" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = undefined; }} onDragStart={(e) => e.preventDefault()}>
                            <Screen t={controller} now={at} kind={shown} />
                            {trail && <span key={trail.n} className={`try-trail try-trail-${trail.way}`} aria-hidden="true" />}
                        </div>
                    </div>
                    <div className="try-hints try-hints-right">
                        {buttons.filter((b) => b.side === "right").map((b) => (
                            <span key={b.id} className={`try-hint${hintFor(b.id) ? "" : " idle"}${b.id === wanted ? " on" : ""}`} style={hintPlace(b.angle)}>
                                {hintFor(b.id) ?? b.idle ?? b.name}
                                {keyNames[b.id] && hintFor(b.id) && <kbd>{keyNames[b.id]}</kbd>}
                            </span>
                        ))}
                    </div>
                </div>
                {rows.length > 0 && (
                    // Under the watch: the screen's taps and swipes, and on a phone, where there's no room beside it, the buttons' too.
                    <ul className="try-rows" aria-label="What the controls do now">
                        {rows.map((r) => (
                            <li key={r.control} className={[r.narrow && "narrow-only", r.control === wanted && "on"].filter(Boolean).join(" ") || undefined}>
                                {r.icon && <Icon name={r.icon} size={18} />}
                                <strong>{r.label}</strong>
                                <span>{r.text}</span>
                                {r.control === wanted && <em>This step</em>}
                                {r.key && <kbd>{r.key}</kbd>}
                            </li>
                        ))}
                    </ul>
                )}
                {caption && <p className="try-caption muted">{caption}</p>}
                <KeyGuide kind={shown} t={controller} />
            </div>
            <aside className="card try-side">
                <div className="try-side-group">
                    <h3>Watch</h3>
                    <div className="segmented" role="radiogroup" aria-label="Watch">
                        {(["garmin", "wearos", "apple"] as const).map((k) => (
                            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); redraw(); }}>
                                {watchNames[k]}
                            </button>
                        ))}
                    </div>
                    {kind === "garmin" && (
                        <>
                            <div className="segmented" role="radiogroup" aria-label="Garmin's buttons">
                                {([[false, "Five buttons"], [true, "Venu: two"]] as const).map(([v, label]) => (
                                    <button key={label} type="button" role="radio" aria-checked={venu === v} className={venu === v ? "on" : ""} onClick={() => { setVenu(v); redraw(); }}>{label}</button>
                                ))}
                            </div>
                            <p className="muted try-side-note">Five buttons: Forerunner, fēnix and epix, whose screens take taps and swipes too. Two: the Venu watches, where the teams are swipes.</p>
                        </>
                    )}
                </div>
                <div className="try-side-group">
                    <h3>Card reasons</h3>
                    <div className="segmented" role="radiogroup" aria-label="Card reasons">
                        {([[false, "Off"], [true, "Ask after the number"]] as const).map(([v, label]) => (
                            <button key={label} type="button" role="radio" aria-checked={cardReasons === v} className={cardReasons === v ? "on" : ""} onClick={() => setCardReasons(v)}>{label}</button>
                        ))}
                    </div>
                    <p className="muted try-side-note">The watch's setting, in Controls: after a card's number, its misconduct code, with No reason first.</p>
                </div>
                {(shown === "garmin" || shown === "apple") && (
                    <div className="try-side-group">
                        <h3>Touch lock</h3>
                        <div className="segmented" role="radiogroup" aria-label="Touch lock">
                            {([[false, "Off"], [true, "On"]] as const).map(([v, label]) => (
                                <button key={label} type="button" role="radio" aria-checked={touchLock === v} className={touchLock === v ? "on" : ""}
                                    onClick={() => { setTouchLock(v); controller.options = { ...controller.options, touchLock: v }; controller.touchLockChanged(); redraw(); }}>{label}</button>
                            ))}
                        </div>
                        <p className="muted try-side-note">{shown === "apple"
                            ? "The watch's setting, in Controls: the system's Water Lock comes on whenever play's screen shows, and turning the Digital Crown turns it off."
                            : "The watch's setting, in Controls: during play the screen takes no taps or swipes, so rain and sleeves can't work it; the buttons do everything. Not on the Venu, whose teams are swipes."}</p>
                    </div>
                )}
                {screenRow && (
                    <div className="try-side-group">
                        <h3>Match screen</h3>
                        {screenRow}
                    </div>
                )}
                <div className="try-side-group">
                    <h3>Time</h3>
                    <div className="segmented" role="radiogroup" aria-label="Speed">
                        {speeds.map((s) => (
                            <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? "on" : ""} onClick={() => setSpeedTo(s)}>{s}×</button>
                        ))}
                    </div>
                    {skipTargets.length > 0 && (
                        <div className="try-skips">
                            <span className="muted">Skip to</span>
                            {skipTargets.map((s) => (
                                <button key={s.id} type="button" className="btn" onClick={() => skip(s.to)}><Icon name="next" size={16} />{s.label}</button>
                            ))}
                        </div>
                    )}
                </div>
                <button type="button" className="btn btn-ghost try-start-over" onClick={(e) => { startOver(); e.currentTarget.blur(); }}><Icon name="restart" size={16} />Start the match over</button>
            </aside>
        </div>
    );
}
