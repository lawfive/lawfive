import { type ScreenSetup, misconductSchemes } from "@lawfive/schema";
import type { ScreenAt } from "../watchPreview.ts";
import { type Alert, AWAY, HOME, LIGHTNING, Match, type MatchSetup, formatChange, formatClock, formatCountdown, officialRoles, periodLabel, periodName, suspendReasons, withPeriod } from "./engine.ts";

/** EVT-15: a team official in an event's words, by role. */
const officialWords = ["head coach", "assistant coach", "team official"];

// DEMO: Try a match's controls, between the drawn watch and the engine (engine.ts): what each button,
// swipe, tap and key does on each kind of watch, as the watches' own controls do (INP-1 to INP-10,
// VIB-6, EVT-3), the menus they open, and what the screen shows. Plain TypeScript, so its tests can
// play a match without a browser (test/tryMatch.test.ts).

/** Garmin with five buttons; the touch Venu with two; Wear OS with one; Apple Watch with none used. */
export type WatchKind = "garmin" | "venu" | "wearos" | "apple";
export type Button = "start" | "back" | "up" | "down" | "light" | "side" | "crown";
export type Swipe = "up" | "down" | "left" | "right";
/** A swipe as a hint names it: sideways is left or right, either. */
export type SwipeWay = Swipe | "sideways";

/** What a control does now (DEMO): a button's id, "screen" for a tap, or "swipe:<way>" with the swipe's name. */
export interface Hint {
    control: string;
    text: string;
    label?: string;
}

export interface Row {
    id: string;
    label: string;
    sub?: string;
    /** UI-10: a team row's color. */
    team?: number;
    /** EVT-12: Sin bin's label in the cards' yellow, on the dark band, so it isn't taken for the Yellow card row. */
    tone?: "sinBin";
}

/** What's over the match screen: a menu, the player number, a question, the coin, or a clip of what needs a real watch. */
export type Overlay =
    | { kind: "menu"; title: string; titleTeam?: number; rows: Row[]; focus: number; from?: Swipe; back?: Overlay }
    | { kind: "number"; type: string; team: number; digits: [number, number]; active: 0 | 1; adjust?: Adjusting }
    | { kind: "confirm"; title: string; detail?: string; yes: string; danger?: boolean; then: string }
    | { kind: "coin"; side?: "Heads" | "Tails"; flips: number }
    | { kind: "clip"; what: "direction" | "pitch" }
    /** EVT-6: the red screen after a second yellow, or a second sin bin (EVT-12), until a button or a tap. */
    | { kind: "sendOff"; why: "Second yellow" | "Second sin bin"; team: number; player?: number };

/**
 * TMR-14: the two-digit entry used for Adjust clock and Adjust added time: the minutes, then the seconds, of the
 * period's time (or the stoppage total) captured when the row was chosen.
 */
export interface Adjusting {
    what: "clock" | "added";
    part: "minutes" | "seconds";
    captured: number;
    minutes: number;
}

export interface Options {
    watch: WatchKind;
    /** INP-10: the account's team swipes, for Garmin's Venu and Apple Watch; Wear OS always swipes sideways. */
    swipes: "upDown" | "sideways";
    screen: ScreenSetup;
    /** INP-4: a tap toggles stoppage (a watch setting, off by default). */
    tapStoppage?: boolean;
    /** EVT-14: Card reasons, the watch's setting (off by default), and the codes they're chosen from: the account's, else IFAB's. */
    cardReasons?: boolean;
    /** INP-12: Touch lock, the watch's setting (off by default): on a five-button Garmin, play's screen takes no taps or swipes; on Apple Watch, it's the system's Water Lock. */
    touchLock?: boolean;
    misconductScheme?: string;
}

export const watchNames: Record<WatchKind, string> = { garmin: "Garmin", venu: "Garmin Venu", wearos: "Wear OS", apple: "Apple Watch" };

/** The demo's own team colors' names, as on the watch's eight. */
const colorHex = (color: number) => (color < 0 ? undefined : `#${color.toString(16).padStart(6, "0")}`);

export class TryMatch {
    match: Match;
    overlay?: Overlay;
    /** On a decision or shoot-out screen, the highlighted choice. */
    choice = 0;
    /** The alert that last went off, for the watch's shake (VIB-1 to VIB-7). */
    lastAlert?: { alert: Alert; at: number };
    readonly setup: Partial<MatchSetup>;
    options: Options;
    /** UI-21, TMR-11: the match screen the match kicked off with; a change shows from the next match, as on a watch. */
    kickedOffWith?: ScreenSetup;

    constructor(setup: Partial<MatchSetup>, options: Options) {
        this.setup = setup;
        this.options = options;
        this.match = new Match(setup);
    }

    get touch() {
        return this.options.watch !== "garmin";
    }

    /** INP-12: Apple Watch's Water Lock, on while play's screen shows until the Digital Crown turns it off. */
    waterLocked = false;

    /** INP-12: Touch lock has play's screen, so a tap or swipe there does nothing; not on the Venu or Wear OS. */
    get touchLocked(): boolean {
        const { watch, touchLock } = this.options;
        return !!touchLock && !this.overlay && this.match.phase === "running" && (watch === "garmin" || (watch === "apple" && this.waterLocked));
    }

    /** INP-12: the option turned on or off in the middle of play: Water Lock follows at once. */
    touchLockChanged() {
        this.waterLocked = !!this.options.touchLock && this.options.watch === "apple" && !this.overlay && this.match.phase === "running";
    }

    /** INP-10: sideways on Wear OS always, and for the others as the account has it. */
    get sideways() {
        return this.options.watch === "wearos" || this.options.swipes === "sideways";
    }

    /** INP-10: which way opens the home team's controls, the away team's, and the game menu. */
    swipeWays(): { home: SwipeWay; away: SwipeWay; game: SwipeWay } {
        return this.sideways ? { home: "right", away: "left", game: "up" } : { home: "down", away: "up", game: "sideways" };
    }

    startOver() {
        this.match = new Match(this.setup);
        this.waterLocked = false;
        this.overlay = undefined;
        this.choice = 0;
    }

    name(team: number) {
        return team === HOME ? this.match.setup.home : this.match.setup.away;
    }

    // ---- Time ----

    /** Once a simulated second: what's due fires, as the watch's timer does. */
    tick(now: number): Alert | undefined {
        const alert = this.match.tick(now);
        if (alert) {
            this.lastAlert = { alert, at: now };
        }
        return alert;
    }

    // ---- Controls ----

    /** EVT-12: "can return" over the match screen, during play, until a button or a tap. */
    get canReturn(): boolean {
        const m = this.match;
        return (m.phase === "running" || m.phase === "golden") && m.sinBinReturns.length > 0;
    }

    /**
     * VIB-6: while an alert repeats, the first press of anything but Back only silences it; EVT-12: "can return" the
     * same, with its vibration off too.
     */
    private silenced(now: number, back: boolean) {
        if (!this.match.hasActiveAlert(now) && !this.canReturn) {
            return false;
        }
        this.match.acknowledgeAlerts(now);
        return !back;
    }

    /** An input, and then the decide screen's recommended choice highlighted if it's just come up (ET-1). */
    private input(now: number, act: () => void) {
        const before = this.match.phase;
        const covered = this.overlay !== undefined;
        act();
        // INP-12: Water Lock comes on as play's screen shows: at kickoff, on resuming, back from a menu or the number.
        if (this.options.touchLock && this.options.watch === "apple" && this.match.phase === "running" && !this.overlay && (before !== "running" || covered)) {
            this.waterLocked = true;
        }
        if (before !== "decide" && this.match.phase === "decide") {
            this.syncChoice();
        }
    }

    press(button: Button, now: number) {
        this.input(now, () => this.pressNow(button, now));
    }

    private pressNow(button: Button, now: number) {
        if (button === "light") {
            return;
        }
        // INP-12: turning the Digital Crown turns Water Lock off.
        if (button === "crown") {
            this.waterLocked = false;
            return;
        }
        if (this.silenced(now, button === "back")) {
            return;
        }
        if (this.overlay) {
            this.overlayPress(button, now);
            return;
        }
        const m = this.match;
        // Wear OS's button: stoppage, when it's tracked (INP-4).
        if (button === "side") {
            if (m.phase === "running" && m.setup.trackStoppage) {
                m.toggleStoppage(now);
            }
            return;
        }
        if (button === "back") {
            if (m.phase === "done") {
                this.startOver();
            } else {
                this.openGameMenu(now);
            }
            return;
        }
        if (button === "up" || button === "down") {
            const team = button === "up" ? HOME : AWAY;
            this.teamButton(team, now);
            return;
        }
        this.startButton(now);
    }

    /** Up or Down on the main screen: choose a team where one's chosen, else its controls (INP-7). */
    private teamButton(team: number, now: number) {
        const m = this.match;
        switch (m.phase) {
            case "pre":
            case "ready":
            case "nextKickoff":
                m.selectKickoff(team);
                return;
            case "decide":
                this.choice = Math.max(0, Math.min(this.decisions().length - 1, this.choice + (team === HOME ? -1 : 1)));
                return;
            case "penalties":
                if (!m.penStarted) {
                    m.selectPenaltyFirst(team);
                } else {
                    this.choice = team === HOME ? 0 : 1;
                }
                return;
            default:
                this.openTeamMenu(team, now);
        }
    }

    /** Start/Stop on the main screen (INP-7). */
    private startButton(now: number) {
        const m = this.match;
        switch (m.phase) {
            case "ready":
                this.kickedOffWith = this.options.screen;
                m.start(now, this.kickedOffWith);
                return;
            case "nextKickoff":
                m.startNextPeriod(now);
                return;
            case "running":
                if (m.breakDue) {
                    m.startBreak(now);
                } else if (m.setup.trackStoppage) {
                    m.toggleStoppage(now);
                } else {
                    this.openGameMenu(now);
                }
                return;
            case "break":
                m.endHalftime();
                return;
            case "decide":
                this.decide(this.decisions()[this.choice].id, now);
                return;
            case "penalties":
                if (!m.penStarted) {
                    m.startPenalties();
                } else if (m.penaltyWinner() >= 0) {
                    m.finish(now);
                } else {
                    m.recordKick(this.choice === 0);
                }
                return;
            case "golden":
                m.finish(now);
                return;
            case "done":
                this.startOver();
                return;
            // TMR-13: Start/Stop resumes, as it ends half-time.
            case "suspended":
                m.resume(now);
                return;
            default:
        }
    }

    swipe(direction: Swipe, now: number) {
        this.input(now, () => this.swipeNow(direction, now));
    }

    private swipeNow(direction: Swipe, now: number) {
        // INP-12: nothing, not even silencing an alert.
        if (this.touchLocked) {
            return;
        }
        // Every watch here has a touch screen, the five-button Garmins too, so each takes swipes (INP-1 to INP-3).
        if (this.overlay) {
            if (direction === "right") {
                // WCH-9: a swipe right goes back.
                this.overlayPress("back", now);
            } else if (this.overlay.kind === "menu" && (direction === "up" || direction === "down")) {
                this.move(direction === "up" ? 1 : -1);
            } else if (this.overlay.kind === "number" && (direction === "up" || direction === "down")) {
                this.nudgeDigit(direction === "up" ? 1 : -1);
            }
            return;
        }
        if (this.silenced(now, false)) {
            return;
        }
        // INP-1 to INP-3, INP-10.
        const team = this.sideways
            ? direction === "right" ? HOME : direction === "left" ? AWAY : undefined
            : direction === "down" ? HOME : direction === "up" ? AWAY : undefined;
        if (team !== undefined) {
            if (this.match.phase === "running" || this.match.phase === "break" || this.match.phase === "golden" || this.match.phase === "done"
                || this.match.phase === "pre" || this.match.phase === "ready" || this.match.phase === "nextKickoff" || this.match.phase === "suspended") {
                this.openTeamMenu(team, now, direction);
            }
            return;
        }
        if ((this.sideways && direction === "up") || (!this.sideways && (direction === "left" || direction === "right"))) {
            this.openGameMenu(now, direction);
        }
    }

    /** A tap on something on the screen: a team, the Start pill, a row, a choice (INP-8, INP-9). */
    tap(target: string, now: number) {
        this.input(now, () => this.tapNow(target, now));
    }

    private tapNow(target: string, now: number) {
        // INP-12.
        if (this.touchLocked) {
            return;
        }
        if (this.silenced(now, false)) {
            return;
        }
        const m = this.match;
        const [what, value] = target.split(":");
        if (this.overlay) {
            this.overlayTap(what, value, now);
            return;
        }
        switch (what) {
            case "team":
                if (m.phase === "pre" || m.phase === "ready" || m.phase === "nextKickoff") {
                    m.selectKickoff(Number(value));
                } else if (m.phase === "penalties" && !m.penStarted) {
                    m.selectPenaltyFirst(Number(value));
                } else {
                    this.openTeamMenu(Number(value), now);
                }
                return;
            case "start":
            case "endBreak":
            case "done":
            // TMR-13: INP-8, only the pill itself resumes.
            case "resume":
                this.startButton(now);
                return;
            case "decide":
                this.decide(value as "extraTime" | "penalties" | "endMatch", now);
                return;
            case "kick":
                if (m.penaltyWinner() < 0) {
                    m.recordKick(value === "scored");
                } else {
                    m.finish(now);
                }
                return;
            case "golden":
                if (value === "end") {
                    m.finish(now);
                } else {
                    m.undoGoldenGoal();
                }
                return;
            case "screen":
                // INP-4: only when the watch's setting turns it on.
                if (this.options.tapStoppage && m.phase === "running" && m.setup.trackStoppage) {
                    m.toggleStoppage(now);
                }
                return;
            default:
        }
    }

    /** The keyboard: arrows, Enter and Escape, as the watch's own buttons or swipes. */
    key(key: string, now: number): boolean {
        const watch = this.options.watch;
        if (key === "Escape" || key === "Backspace") {
            this.press("back", now);
            return true;
        }
        if (key === "Enter" || key === " ") {
            if (watch === "apple" && this.touchLocked) {
                // INP-12: the crown, under Water Lock.
                this.press("crown", now);
            } else if (this.overlay || watch === "garmin" || watch === "venu") {
                this.press("start", now);
            } else if (this.match.phase === "running" && watch === "wearos") {
                this.press("side", now);
            } else {
                this.press("start", now);
            }
            return true;
        }
        const arrows: Record<string, Swipe> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
        const direction = arrows[key];
        if (!direction) {
            return false;
        }
        if (watch === "garmin" || (this.overlay && (direction === "up" || direction === "down"))) {
            if (direction === "up" || direction === "down") {
                this.press(direction, now);
                return true;
            }
            if (watch === "garmin") {
                return false;
            }
        }
        // On a touch watch, an arrow is a swipe across the screen the arrow's way (DEMO-3).
        this.swipe(direction, now);
        return true;
    }

    // ---- Menus ----

    private move(by: number) {
        if (this.overlay?.kind !== "menu") {
            return;
        }
        this.overlay.focus = Math.max(0, Math.min(this.overlay.rows.length - 1, this.overlay.focus + by));
    }

    private overlayPress(button: Button, now: number) {
        const o = this.overlay!;
        if (o.kind === "menu") {
            if (button === "up") {
                this.move(-1);
            } else if (button === "down") {
                this.move(1);
            } else if (button === "start") {
                this.choose(o.rows[o.focus].id, now);
            } else if (button === "back") {
                // EVT-14: Back on the reason is No reason, then the red screen if it's waiting.
                this.overlay = o.back;
            }
        } else if (o.kind === "number") {
            if (button === "up" || button === "down") {
                this.nudgeDigit(button === "up" ? 1 : -1);
            } else if (button === "start") {
                if (o.active === 0) {
                    o.active = 1;
                } else if (o.adjust) {
                    this.adjustNext(o.adjust, o.digits[0] * 10 + o.digits[1]);
                } else {
                    this.record(o.type, o.team, o.digits[0] * 10 + o.digits[1], now);
                }
            } else if (button === "back") {
                if (o.active === 1) {
                    o.active = 0;
                } else if (o.adjust) {
                    this.adjustBack(o.adjust);
                } else {
                    // EVT-3: dismissing records it without a number.
                    this.record(o.type, o.team, 0, now);
                }
            }
        } else if (o.kind === "confirm") {
            if (button === "start") {
                this.overlay = undefined;
                this.choose(o.then, now);
            } else if (button === "back") {
                this.overlay = undefined;
            }
        } else if (o.kind === "coin") {
            if (button === "start") {
                this.overlay = { kind: "coin", side: Math.random() < 0.5 ? "Heads" : "Tails", flips: o.flips + 1 };
            } else if (button === "back") {
                this.overlay = undefined;
            }
        } else if (o.kind === "sendOff" || button === "back" || button === "start") {
            // EVT-6: any button puts the red screen away.
            this.overlay = undefined;
        }
    }

    private overlayTap(what: string, value: string, now: number) {
        const o = this.overlay!;
        if (o.kind === "menu" && what === "row") {
            o.focus = Number(value);
            this.choose(o.rows[Number(value)].id, now);
        } else if (o.kind === "number") {
            if (what === "digit") {
                o.active = Number(value) as 0 | 1;
            } else if (what === "nudge") {
                this.nudgeDigit(Number(value));
            } else if (what === "ok" && o.adjust) {
                this.adjustNext(o.adjust, o.digits[0] * 10 + o.digits[1]);
            } else if (what === "ok") {
                this.record(o.type, o.team, o.digits[0] * 10 + o.digits[1], now);
            } else if (what === "none") {
                this.record(o.type, o.team, 0, now);
            }
        } else if (o.kind === "confirm") {
            this.overlay = undefined;
            if (what === "yes") {
                this.choose(o.then, now);
            }
        } else if (o.kind === "coin" && what === "flip") {
            this.overlay = { kind: "coin", side: Math.random() < 0.5 ? "Heads" : "Tails", flips: o.flips + 1 };
        } else if (what === "close" || o.kind === "sendOff") {
            this.overlay = o.kind === "menu" ? o.back : undefined;
        }
    }

    private nudgeDigit(by: number) {
        if (this.overlay?.kind !== "number") {
            return;
        }
        const o = this.overlay;
        o.digits[o.active] = (o.digits[o.active] + by + 10) % 10;
    }

    /** UI-6: a team's controls: a goal in play, and cards at any time (EVT-7); EVT-12: Sin bin above Yellow card, where the format has them. */
    openTeamMenu(team: number, _now: number, from?: Swipe) {
        const m = this.match;
        const rows: Row[] = [];
        if (m.phase === "running") {
            if (m.setup.goalTypes) {
                rows.push({ id: "goal:G", label: "Goal" }, { id: "goal:GP", label: "Penalty goal" }, { id: "goal:GF", label: "DFK goal" }, { id: "goal:GO", label: "Own goal", sub: `Counts for ${this.name(team)}` });
            } else {
                rows.push({ id: "goal:G", label: "Goal" });
            }
        }
        // EVT-15, EVT-16: a team official's card after the players', then an injury.
        // EVT-12: Sin bin above Yellow card with sin bins in the format (the owner's order).
        if (m.setup.sinBins && m.phase !== "penalties" && m.phase !== "done") {
            rows.push({ id: "card:SB", label: "Sin bin", tone: "sinBin" });
        }
        rows.push({ id: "card:Y", label: "Yellow card" }, { id: "card:R", label: "Red card" }, { id: "official", label: "Team official" }, { id: "injury", label: "Injury" });
        this.overlay = { kind: "menu", title: this.name(team), titleTeam: team, rows: rows.map((r) => ({ ...r, id: `${r.id}:${team}` })), focus: 0, from };
    }

    /**
     * INP-3: a period as the watch's game menu names it: spelled out on Wear OS and Apple Watch ("first half"), Garmin's
     * shorter words on its narrow rows ("1st half", "ET1").
     */
    periodWords(period: number): string {
        const n = this.match.setup.numPeriods;
        if (this.options.watch === "wearos" || this.options.watch === "apple") {
            return periodName(period, n, this.match.setup.etPeriods);
        }
        // SET-16: one period is "period" there too ("End period").
        return n === 2 && period < 2 ? (period === 0 ? "1st half" : "2nd half") : n === 1 && period === 0 ? "period" : periodLabel(period, n);
    }

    /** Half-time's own button and row: "End half-time" where there's room, "End HT" on Garmin. */
    get endHalftimeLabel(): string {
        if (!this.match.isHalftime) {
            return "End break";
        }
        return this.options.watch === "wearos" || this.options.watch === "apple" ? "End half-time" : "End HT";
    }

    /** INP-3: the game menu, with what fits the moment. */
    openGameMenu(now: number, from?: Swipe) {
        const m = this.match;
        const rows: Row[] = [];
        const endRow = { id: "end", label: m.periodEndsMatch ? "End match" : `End ${this.periodWords(m.period)}` };
        switch (m.phase) {
            case "running": {
                // During play: the period's end first, as it's done every match (but for a due halfway break's Start,
                // which is what the menu is opened for then, TMR-7); then stoppage and the halfway break;
                // Undo (this period's events only, INP-6); the kickoff's corrections; Restart and Abandon last.
                if (m.breakDue) {
                    rows.push({ id: "startBreak", label: "Start break", sub: formatClock(m.setup.breakLenSec * 1000) });
                }
                rows.push(endRow);
                if (m.setup.trackStoppage) {
                    rows.push({ id: "stoppage", label: this.stoppageWords });
                }
                if (m.breakDue) {
                    rows.push({ id: "skipBreak", label: "Skip break" });
                }
                const left = m.breakRemainingMs(now);
                if (left !== undefined) {
                    rows.push({ id: "endBreak", label: "End break", sub: `${formatCountdown(left)} left` });
                }
                if (m.lastUndoableEvent) {
                    rows.push({ id: "undo", label: "Undo last event", sub: this.describe(m.lastUndoableEvent) });
                }
                // TMR-14: correcting the clock, and with stoppage tracked the added time.
                rows.push({ id: "adjustClock", label: "Adjust clock", sub: withPeriod(m.period, m.setup.numPeriods, formatClock(m.matchMs(now))) });
                // TMR-15: a stopping clock has no added time.
                if (m.setup.trackStoppage && !m.stoppingClock) {
                    rows.push({ id: "adjustAdded", label: "Adjust added time", sub: formatClock(m.stoppageTotalMs(now)) });
                }
                // PRE-3: named as the first kickoff (or ET1's), not the current period's, which can be the other team.
                rows.push({ id: "swapKickoff", label: "Change kickoff", sub: `${m.isExtraTime ? "ET1 kickoff" : "First kickoff"}: ${this.name(m.firstKickoff)}` });
                if (m.period === 0 || m.period === m.setup.numPeriods) {
                    rows.push({ id: "direction", label: "Kickoff direction", sub: "Face the goal" });
                }
                if (m.period === 0) {
                    rows.push({ id: "restart", label: "Restart match", sub: "Back to kickoff" });
                }
                // TMR-13: for a delay the match carries on after; before Abandon, which ends it.
                rows.push({ id: "suspend", label: "Suspend match", sub: "Lightning, weather" });
                rows.push({ id: "abandon", label: "Abandon match", sub: "Keeps the score" });
                break;
            }
            case "suspended":
                // TMR-13: Resume first, as it's what the menu is most often opened for; Abandon last.
                rows.push({ id: "resume", label: "Resume match" });
                if (m.suspendReason === LIGHTNING) {
                    rows.push({ id: "lightningAgain", label: "Lightning again", sub: "Back to 30:00" });
                }
                rows.push({ id: "card:0", label: `Card for ${this.name(HOME)}` }, { id: "card:1", label: `Card for ${this.name(AWAY)}` });
                if (m.lastUndoableEvent) {
                    rows.push({ id: "undo", label: "Undo last event", sub: this.describe(m.lastUndoableEvent) });
                }
                rows.push({ id: "abandon", label: "Abandon match", sub: "Keeps the score" });
                break;
            case "pre":
            case "ready":
            case "nextKickoff":
                // PRE-8, PRE-9: Kickoff direction first, as it's what the menu is opened for on a kickoff screen, then
                // the toss (the owner's order).
                rows.push({ id: "direction", label: "Kickoff direction", sub: "Face the goal" }, { id: "coin", label: "Coin toss" });
                rows.push({ id: "card:0", label: `Card for ${this.name(HOME)}` }, { id: "card:1", label: `Card for ${this.name(AWAY)}` });
                if (m.phase !== "nextKickoff") {
                    rows.push({ id: "cancel", label: "Cancel match", sub: "Nothing is saved" });
                }
                break;
            case "break":
                rows.push({ id: "endHalftime", label: this.endHalftimeLabel });
                rows.push({ id: "card:0", label: `Card for ${this.name(HOME)}` }, { id: "card:1", label: `Card for ${this.name(AWAY)}` });
                if (m.lastUndoableEvent) {
                    rows.push({ id: "undo", label: "Undo last event", sub: this.describe(m.lastUndoableEvent) });
                }
                break;
            case "decide":
            case "penalties":
            case "golden":
                rows.push({ id: "card:0", label: `Card for ${this.name(HOME)}` }, { id: "card:1", label: `Card for ${this.name(AWAY)}` });
                if (m.lastUndoableEvent) {
                    rows.push({ id: "undo", label: "Undo last event", sub: this.describe(m.lastUndoableEvent) });
                }
                rows.push({ id: "finish", label: "End match" });
                break;
            case "done":
                rows.push({ id: "card:0", label: `Card for ${this.name(HOME)}` }, { id: "card:1", label: `Card for ${this.name(AWAY)}` }, { id: "startOver", label: "Start over" });
                break;
        }
        this.overlay = { kind: "menu", title: "Game", rows, focus: 0, from };
    }

    private choose(id: string, now: number) {
        const m = this.match;
        const [what, a, b, c] = id.split(":");
        this.overlay = undefined;
        switch (what) {
            case "official":
                // EVT-15: the card, then the official's role in place of a number.
                this.overlay = { kind: "menu", title: `Official ${this.name(Number(a))}`, titleTeam: Number(a), rows: [{ id: `officialCard:Y:${a}`, label: "Yellow card" }, { id: `officialCard:R:${a}`, label: "Red card" }], focus: 0 };
                return;
            case "officialCard":
                this.overlay = { kind: "menu", title: `${a === "R" ? "Red" : "Yellow"} ${this.name(Number(b))}`, titleTeam: Number(b), rows: officialRoles.map((label, role) => ({ id: `officialRole:${a}:${b}:${role}`, label })), focus: 0 };
                return;
            case "officialRole":
                m.addOfficialCard(a === "R", Number(b), Number(c), now);
                this.askReason(Number(b), a === "R");
                return;
            case "reason":
                // EVT-14: a code, or No reason (none), for the card just recorded; then the red screen if it's waiting.
                if (a) {
                    m.giveReason(a);
                }
                this.overlay = this.afterReason;
                this.afterReason = undefined;
                return;
            case "injury":
                // EVT-16: the player's number, as for a card (EVT-3).
                this.overlay = { kind: "number", type: "I", team: Number(a), digits: [0, 0], active: 0 };
                return;
            case "goal":
                if (m.setup.goalScorers && a !== "GO") {
                    this.overlay = { kind: "number", type: a, team: Number(b), digits: [0, 0], active: 0 };
                } else {
                    m.addEvent(a, Number(b), undefined, now);
                }
                return;
            case "card":
                if (b === undefined) {
                    // "Card for HOM" from the game menu: that team's controls, as on the watches (EVT-7).
                    this.openTeamMenu(Number(a), now);
                } else {
                    // EVT-3: always a number for a card.
                    this.overlay = { kind: "number", type: a, team: Number(b), digits: [0, 0], active: 0 };
                }
                return;
            case "end":
                this.overlay = { kind: "confirm", title: m.periodEndsMatch ? "End match?" : `End ${this.periodWords(m.period)}?`, yes: m.periodEndsMatch ? "End match" : "End", then: "endNow" };
                return;
            case "endNow":
                m.endPeriod(now);
                return;
            case "startBreak":
                m.startBreak(now);
                return;
            case "skipBreak":
                m.skipBreak();
                return;
            case "stoppage":
                m.toggleStoppage(now);
                return;
            case "endBreak":
                m.endBreakEarly(now);
                return;
            case "adjustClock":
            case "adjustAdded": {
                // TMR-14: from what the clock shows now, in whole seconds.
                const captured = Math.trunc((what === "adjustClock" ? m.matchMs(now) : m.stoppageTotalMs(now)) / 1000);
                this.adjustEntry({ what: what === "adjustClock" ? "clock" : "added", part: "minutes", captured, minutes: Math.trunc(captured / 60) });
                return;
            }
            case "adjustNow":
                if (a === "clock") {
                    m.adjustClock(Number(b), now);
                } else {
                    m.adjustAdded(Number(b), now);
                }
                return;
            case "undo":
                this.overlay = { kind: "confirm", title: "Undo?", detail: m.lastUndoableEvent ? this.describe(m.lastUndoableEvent) : undefined, yes: "Undo", then: "undoNow" };
                return;
            case "undoNow":
                if (m.phase === "golden") {
                    m.undoGoldenGoal();
                } else {
                    m.undoLastEvent(now);
                }
                return;
            case "swapKickoff":
                m.swapKickoff();
                return;
            case "restart":
                this.overlay = { kind: "confirm", title: "Restart match?", detail: "Back to the kickoff; the score goes", yes: "Restart", danger: true, then: "restartNow" };
                return;
            case "restartNow":
                m.restart();
                return;
            case "abandon":
                this.overlay = { kind: "menu", title: "Why?", rows: ["Weather", "Lightning", "Crowd trouble", "Not enough players", "Other"].map((label, i) => ({ id: `abandonWhy:${i}`, label })), focus: 0 };
                return;
            case "abandonWhy":
                this.overlay = { kind: "confirm", title: "Abandon match?", detail: `${m.score[HOME]}-${m.score[AWAY]} stands`, yes: "Abandon", danger: true, then: `abandonNow:${a}` };
                return;
            case "suspend":
                // TMR-13: the abandonment's reasons but not enough players; choosing one suspends at once (Resume undoes it).
                this.overlay = { kind: "menu", title: "Suspend match", rows: suspendReasons.map(([n, label]) => ({ id: `suspendWhy:${n}`, label })), focus: 0 };
                return;
            case "suspendWhy":
                m.suspend(Number(a), now);
                return;
            case "resume":
                m.resume(now);
                return;
            case "lightningAgain":
                m.lightningAgain(now);
                return;
            case "abandonNow":
                m.abandon(now, Number(a));
                return;
            case "direction":
                this.overlay = { kind: "clip", what: "direction" };
                return;
            case "coin":
                this.overlay = { kind: "coin", flips: 0 };
                return;
            case "cancel":
            case "startOver":
                this.startOver();
                return;
            case "endHalftime":
                m.endHalftime();
                return;
            case "finish":
                this.overlay = { kind: "confirm", title: "End match?", yes: "End match", then: "finishNow" };
                return;
            case "finishNow":
                m.finish(now);
                return;
            default:
        }
    }

    /** TMR-14: the minutes or the seconds of the time being corrected, starting from the captured time. */
    private adjustEntry(adjust: Adjusting) {
        const value = adjust.part === "minutes" ? Math.min(adjust.minutes, 99) : adjust.captured % 60;
        this.overlay = { kind: "number", type: adjust.what, team: -1, digits: [Math.trunc(value / 10), value % 10], active: 0, adjust };
    }

    /** TMR-14: what the change would be, and whether the value entered can be confirmed (seconds up to 59). */
    adjustValid(adjust: Adjusting, value: number) {
        return adjust.part === "minutes" || value <= 59;
    }

    /** TMR-14: OK on the minutes goes to the seconds; on the seconds, the change confirmed, or nothing if there's none. */
    private adjustNext(adjust: Adjusting, value: number) {
        if (!this.adjustValid(adjust, value)) {
            return;
        }
        if (adjust.part === "minutes") {
            this.adjustEntry({ ...adjust, part: "seconds", minutes: value });
            return;
        }
        const target = adjust.minutes * 60 + value;
        const change = target - adjust.captured;
        if (change === 0) {
            this.overlay = undefined;
            return;
        }
        const garmin = this.options.watch === "garmin" || this.options.watch === "venu";
        // Garmin's system fonts may not have the minus sign (U+2212), so its watch uses a hyphen.
        const signed = garmin ? formatChange(change).replace("\u2212", "-") : formatChange(change);
        this.overlay = {
            kind: "confirm", title: `${adjust.what === "clock" ? "Clock" : "Added time"} ${signed}?`, detail: `To ${formatClock(target * 1000)}`,
            yes: garmin ? "Yes" : "Adjust", then: `adjustNow:${adjust.what}:${change}`,
        };
    }

    /** TMR-14: Back on the seconds' first digit returns to the minutes as entered; on the minutes', to the match. */
    private adjustBack(adjust: Adjusting) {
        this.overlay = undefined;
        if (adjust.part === "seconds") {
            this.adjustEntry({ ...adjust, part: "minutes" });
        }
    }

    private record(type: string, team: number, number: number, now: number) {
        this.overlay = undefined;
        const player = number > 0 ? number : undefined;
        // EVT-6: a second yellow, or a second sin bin (EVT-12), is a send-off: the red screen says so.
        const sendOff: Overlay | undefined = this.match.addEvent(type, team, player, now)
            ? { kind: "sendOff", why: type === "SB" ? "Second sin bin" : "Second yellow", team, player }
            : undefined;
        if (type === "Y" || type === "R" || type === "SB") {
            this.askReason(team, type === "R", sendOff);
        } else {
            this.overlay = sendOff;
        }
    }

    /** EVT-14: the red screen that waits for the reason, after a second yellow or second sin bin. */
    private afterReason?: Overlay;

    /**
     * EVT-14: with Card reasons on, the card just recorded is followed by the codes of the match's scheme, No reason
     * first: a caution's for a yellow (also a second one), a sin bin or an official's yellow, a send-off's (without
     * the second caution's) for a red. Off, straight on to what comes next.
     */
    private askReason(team: number, sendOff: boolean, next?: Overlay) {
        if (!this.options.cardReasons) {
            this.overlay = next;
            return;
        }
        const scheme = misconductSchemes[this.options.misconductScheme ?? "ifab"] ?? misconductSchemes.ifab!;
        const codes = sendOff ? scheme.sendOffs.filter((c) => c.code !== scheme.secondCaution) : scheme.cautions;
        this.afterReason = next;
        this.overlay = {
            kind: "menu", title: "Reason", titleTeam: team, focus: 0, back: next,
            rows: [{ id: "reason:", label: "No reason" }, ...codes.map((c) => ({ id: `reason:${c.code}`, label: c.code, sub: c.short ?? c.description }))],
        };
    }

    // ---- The decision after regular time, and its screen (ET-1) ----

    decisions(): { id: "extraTime" | "penalties" | "endMatch"; label: string }[] {
        const m = this.match;
        return [
            ...(m.canExtraTime ? [{ id: "extraTime" as const, label: "Extra time" }] : []),
            ...(m.canPenalties ? [{ id: "penalties" as const, label: "Penalties" }] : []),
            { id: "endMatch" as const, label: "End match" },
        ];
    }

    /** When the decide screen comes up, its recommended choice is highlighted. */
    syncChoice() {
        const m = this.match;
        if (m.phase === "decide") {
            const index = this.decisions().findIndex((d) => d.id === m.recommendedDecision);
            this.choice = Math.max(index, 0);
        }
    }

    private decide(id: "extraTime" | "penalties" | "endMatch", now: number) {
        const m = this.match;
        if (id === "extraTime") {
            m.chooseExtraTime(now);
        } else if (id === "penalties") {
            m.choosePenalties();
            this.choice = 0;
        } else {
            m.finish(now);
        }
    }

    // ---- What's on the screen ----

    describe(e: { type: string; team: number; player?: number; extra?: number }) {
        // TMR-14: "Clock +0:40", "Added time −1:05" (a hyphen on Garmin).
        if (e.type === "CK" || e.type === "CA") {
            const change = formatChange(e.extra ?? 0);
            return `${e.type === "CK" ? "Clock" : "Added time"} ${this.options.watch === "garmin" || this.options.watch === "venu" ? change.replace("\u2212", "-") : change}`;
        }
        const names: Record<string, string> = { G: "Goal", GO: "Own goal", GP: "Penalty goal", GF: "DFK goal", Y: "Yellow", Y2: "2nd yellow", R: "Red", TY: "Yellow", TR: "Red", I: "Injury", PG: "Pen scored", PM: "Pen missed", SB: "Sin bin", SB2: "2nd sin bin" };
        // EVT-15: "Yellow HOM head coach", or "team official" for another.
        const official = e.type === "TY" || e.type === "TR" ? ` ${officialWords[e.extra ?? 2] ?? officialWords[2]}` : "";
        return `${names[e.type] ?? e.type} ${this.name(e.team)}${official}${e.player !== undefined ? ` #${e.player}` : ""}`;
    }

    teams(): [{ name: string; fill?: string }, { name: string; fill?: string }] {
        const s = this.match.setup;
        return [{ name: s.home, fill: colorHex(s.homeColor) }, { name: s.away, fill: colorHex(s.awayColor) }];
    }

    /** The running screen as the pictures draw it (WatchFace), from the engine's state. */
    /** The match screen shown: the one kicked off with, or before kickoff the one set now. */
    get screen(): ScreenSetup {
        return this.kickedOffWith ?? this.options.screen;
    }

    screenAt(now: number): ScreenAt {
        const m = this.match;
        const setup = this.screen;
        if (m.phase === "break") {
            const left = m.breakRemainingMs(now) ?? 0;
            return { phase: "halftime", period: periodLabel(m.period, m.setup.numPeriods), clock: "", progress: 0, breakClock: m.breakClockText(now) ?? "0:00", breakOver: left === 0 };
        }
        const { clock, added } = m.clockDisplay(now);
        const left = m.breakRemainingMs(now);
        const dueIn = m.breakDueInMs(now);
        return {
            phase: "running",
            period: periodLabel(m.period, m.setup.numPeriods),
            clock,
            second: setup.clocks === "one" ? undefined : m.secondClockText(now),
            added,
            // TMR-16: from the period's length, the added time left.
            stoppage: m.stoppagePill(now),
            breakPill: m.breakDue
                ? { text: "Break due", solid: true }
                : left !== undefined ? { text: m.breakClockText(now) ?? "", solid: true } : dueIn !== undefined ? { text: formatCountdown(dueIn), solid: false } : undefined,
            progress: m.periodProgress(now),
            // EVT-12: the sin bin ending first, after the stoppage and break pills.
            sinBin: m.sinBinPill(now),
            // TMR-15: the stopping clock standing still, in orange.
            stopped: m.clockStopped,
        };
    }

    /** INP-4: what Start/Stop does to the stoppage clock; on a clock that stops (TMR-15), to the match clock. */
    private get stoppageWords() {
        const m = this.match;
        if (m.stoppingClock) {
            return m.isStoppageActive ? "Start clock" : "Stop clock";
        }
        return m.isStoppageActive ? "End stoppage" : "Start stoppage";
    }

    // ---- Hints: what each control does now (DEMO) ----

    /**
     * What each control does now: a button's id, "screen" for a tap, and a swipe as "swipe:<way>"
     * (up, down, left, right, or sideways for either) with what it's called.
     */
    hints(now: number): Hint[] {
        const m = this.match;
        const o = this.overlay;
        const alerting = m.hasActiveAlert(now) || this.canReturn;
        const watch = this.options.watch;
        const out: Hint[] = [];
        const add = (control: string, text: string | undefined) => text && out.push({ control, text });
        // INP-12: under Water Lock, only the crown does anything.
        if (watch === "apple" && this.touchLocked) {
            add("crown", "Turn it to unlock Water Lock");
            return out;
        }
        const swipe = (way: SwipeWay, text: string) => out.push({ control: `swipe:${way}`, label: `Swipe ${way}`, text });
        const ways = this.swipeWays();
        if (alerting) {
            add(watch === "garmin" || watch === "venu" ? "start" : "screen", this.canReturn && !o ? "Put away \u201ccan return\u201d" : "Silence the alert");
            add("back", watch === "garmin" || watch === "venu" ? "Silence it and open the game menu" : undefined);
        }
        if (o?.kind === "menu") {
            add(this.touch ? "screen" : "start", this.touch ? "Tap a row to choose it" : `Choose: ${o.rows[o.focus]?.label ?? ""}`);
            if (this.touch) {
                swipe("right", "Back");
            } else {
                add("up", "Move up");
                add("down", "Move down");
            }
            add("back", watch === "apple" || watch === "wearos" ? undefined : "Back");
            return out;
        }
        if (o?.kind === "number") {
            const done = o.adjust ? (o.adjust.part === "minutes" ? "Then the seconds" : "Check the change") : "Record it";
            add(this.touch ? "screen" : "start", this.touch ? "Swipe up or down to change the digit, then OK" : o.active === 0 ? "Next digit" : done);
            if (!this.touch) {
                add("up", "Digit up");
                add("down", "Digit down");
                add("back", o.active === 1 ? "Back to the first digit" : o.adjust ? (o.adjust.part === "seconds" ? "Back to the minutes" : "Leave the clock as it is") : "Record it without a number");
            }
            return out;
        }
        if (o) {
            add(this.touch ? "screen" : "start", o.kind === "coin" ? "Flip the coin" : o.kind === "confirm" ? o.yes : "Close");
            if (watch === "garmin" || watch === "venu") {
                add("back", "Back");
            } else {
                swipe("right", "Back");
            }
            return out;
        }
        const garmin = watch === "garmin";
        /** INP-1 to INP-3, INP-10: the team controls (cards only, out of play) and the game menu. */
        const teamSwipes = (what: string, game = true) => {
            if (garmin) {
                return;
            }
            swipe(ways.home, `${this.name(HOME)}'s ${what}`);
            swipe(ways.away, `${this.name(AWAY)}'s ${what}`);
            if (game) {
                swipe(ways.game, "Game menu");
            }
        };
        switch (m.phase) {
            case "pre":
            case "ready":
            case "nextKickoff": {
                const ready = m.phase === "ready" || (m.phase === "nextKickoff" && m.kickoffFor(m.period + 1) >= 0);
                if (garmin) {
                    add("up", `${this.name(HOME)} kicks off`);
                    add("down", `${this.name(AWAY)} kicks off`);
                    add("start", ready ? (m.phase === "nextKickoff" ? `Start ${periodLabel(m.period + 1, m.setup.numPeriods)}` : "Start the match") : undefined);
                } else {
                    add("screen", ready ? "Tap Start to kick off" : "Tap the team kicking off");
                    if (watch === "venu") {
                        add("start", ready ? "Start" : undefined);
                    }
                }
                if (garmin || watch === "venu") {
                    add("back", "Game menu: coin toss, cards");
                } else {
                    swipe(ways.game, "Game menu: coin toss, cards");
                }
                break;
            }
            case "running": {
                const stoppage = m.setup.trackStoppage ? this.stoppageWords : "Game menu";
                if (garmin || watch === "venu") {
                    add("start", m.breakDue ? "Start the break" : stoppage);
                    add("back", "Game menu");
                    if (garmin) {
                        add("up", `${this.name(HOME)}'s controls`);
                        add("down", `${this.name(AWAY)}'s controls`);
                    } else {
                        teamSwipes("controls", false);
                    }
                } else {
                    if (watch === "wearos" && m.setup.trackStoppage) {
                        add("side", stoppage);
                    }
                    teamSwipes("controls");
                }
                break;
            }
            case "break":
                add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? (m.isHalftime ? "End half-time" : "End the break") : `Tap ${this.endHalftimeLabel} when the teams are back`);
                if (garmin || watch === "venu") {
                    add("back", "Game menu");
                }
                teamSwipes("cards", watch !== "venu");
                break;
            case "decide":
                add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? `Choose: ${this.decisions()[this.choice]?.label}` : "Tap what comes next");
                if (garmin) {
                    add("up", "Move up");
                    add("down", "Move down");
                }
                break;
            case "penalties":
                if (!m.penStarted) {
                    if (garmin) {
                        add("up", `${this.name(HOME)} kicks first`);
                        add("down", `${this.name(AWAY)} kicks first`);
                    }
                    add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? "Start the shoot-out" : "Tap the team kicking first, then Start");
                } else if (m.penaltyWinner() >= 0) {
                    add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? "End the match" : "Tap End match");
                } else {
                    add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? (this.choice === 0 ? "Scored" : "Missed") : "Tap Scored or Missed");
                    if (garmin) {
                        add("up", "Scored");
                        add("down", "Missed");
                    }
                }
                break;
            case "golden":
                add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? "End the match" : "Tap End match, or Undo");
                break;
            case "suspended":
                add(garmin || watch === "venu" ? "start" : "screen", garmin || watch === "venu" ? "Resume the match" : "Tap Resume when play can restart");
                if (garmin || watch === "venu") {
                    add("back", "Game menu: Lightning again, cards, Abandon");
                }
                teamSwipes("cards", watch !== "venu");
                break;
            case "done":
                add(garmin || watch === "venu" ? "start" : "screen", "Start over");
                break;
        }
        return out;
    }
}
