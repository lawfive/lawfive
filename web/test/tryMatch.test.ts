import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultScreen } from "@lawfive/schema";
import { TryMatch } from "../src/match/controller.ts";

// DEMO: Try a match's controls do what the watch's own do (INP-1 to INP-10, VIB-6, EVT-3); the rules
// underneath are the engine's, checked by the shared cases (matchCases.test.ts).

const t0 = 1_800_000_000_000;
const at = (m: number, s = 0) => t0 + (m * 60 + s) * 1000;
const demo = { trackStoppage: true, midBreak: true, goalScorers: true };
/** What's over the screen now, read afresh so each check sees the latest. */
const over = (t: TryMatch): TryMatch["overlay"] => t.overlay;
/** The menu over the screen, if that's what it is. */
const menu = (t: TryMatch) => {
    const o = t.overlay;
    return o?.kind === "menu" ? o : undefined;
};

test("a half on a Garmin's five buttons", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("down", t0);
    assert.equal(t.match.kickoff, 1, "Down: the away team kicks off");
    t.press("start", t0);
    assert.equal(t.match.phase, "running");
    // Up: the home team's controls; Start chooses Goal, then two digits for the scorer.
    t.press("up", at(10));
    assert.equal(over(t)?.kind, "menu");
    t.press("start", at(10));
    assert.equal(over(t)?.kind, "number");
    t.press("up", at(10));
    t.press("start", at(10));
    t.press("up", at(10));
    t.press("up", at(10));
    t.press("start", at(10));
    assert.deepEqual(t.match.score, [1, 0]);
    assert.equal(t.match.events.at(-1)?.player, 12, "1 then 2");
    // A yellow card, with Back on the first digit recording it without a number (EVT-3).
    t.press("down", at(12));
    t.press("down", at(12));
    t.press("start", at(12));
    t.press("back", at(12));
    assert.equal(t.match.events.at(-1)?.type, "Y");
    assert.equal(t.match.events.at(-1)?.player, undefined);
    // Start/Stop: stoppage on and off when tracked (TMR-10).
    t.press("start", at(15));
    assert.equal(t.match.isStoppageActive, true);
    t.press("start", at(16));
    assert.equal(t.match.isStoppageActive, false);
    // The halfway break: added on as stoppage, so due at halfway, 22:30 (TMR-7); the first press only silences it
    // (VIB-6), the next starts it.
    assert.equal(t.tick(at(22, 29)), undefined);
    assert.equal(t.tick(at(22, 30)), "breakStart");
    t.press("start", at(22, 31));
    assert.equal(t.match.breakDue, true, "silenced, still due");
    t.press("start", at(22, 32));
    assert.equal(t.match.breakRemainingMs(at(22, 32)), 120_000);
    // Back: the game menu; the period's end is first (INP-3), in Garmin's words, and asks first.
    t.press("back", at(48));
    assert.equal(over(t)?.kind, "menu");
    assert.equal(menu(t)?.rows[0].label, "End 1st half");
    t.press("start", at(48));
    assert.equal(over(t)?.kind, "confirm");
    t.press("start", at(48));
    assert.equal(t.match.phase, "break");
    t.press("start", at(60));
    assert.equal(t.match.phase, "nextKickoff");
    assert.equal(t.match.kickoffTeamOnScreen, 0, "the other team kicks off the second half");
});

test("a touch watch's swipes follow the account's team swipes, and Wear OS's always go sideways", () => {
    const apple = new TryMatch({}, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    apple.tap("team:0", t0);
    apple.tap("start", t0);
    apple.swipe("down", at(1));
    assert.equal(menu(apple)?.titleTeam, 0, "down: home");
    apple.swipe("right", at(1));
    assert.equal(over(apple), undefined, "a swipe right goes back (WCH-9)");
    apple.swipe("left", at(1));
    assert.equal(menu(apple)?.title, "Game");
    const wear = new TryMatch({ trackStoppage: true, goalScorers: false }, { watch: "wearos", swipes: "upDown", screen: defaultScreen });
    wear.tap("team:1", t0);
    wear.tap("start", t0);
    wear.swipe("right", at(1));
    assert.equal(menu(wear)?.titleTeam, 0, "right: home");
    wear.swipe("right", at(1));
    wear.swipe("up", at(1));
    assert.equal(menu(wear)?.title, "Game", "up: the game menu");
    wear.press("back", at(1));
    wear.press("side", at(2));
    assert.equal(wear.match.isStoppageActive, true, "the button: stoppage (INP-4)");
    // A goal tap on a row records without asking for a number when scorers are off.
    wear.swipe("left", at(3));
    wear.tap("row:0", at(3));
    assert.deepEqual(wear.match.score, [0, 1]);
});

test("the hints say what each control does now", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    assert.ok(t.hints(t0).some((h) => h.control === "up" && h.text === "HOM kicks off"));
    t.press("up", t0);
    assert.ok(t.hints(t0).some((h) => h.control === "start" && h.text === "Start the match"));
    t.press("start", t0);
    assert.ok(t.hints(at(1)).some((h) => h.control === "start" && h.text === "Start stoppage"));
});

test("a five-button Garmin's touch screen takes taps and swipes too", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.tap("team:1", t0);
    assert.equal(t.match.kickoff, 1);
    t.tap("start", t0);
    assert.equal(t.match.phase, "running");
    t.swipe("down", at(1));
    assert.equal(t.overlay?.kind, "menu");
    t.swipe("right", at(1));
    assert.equal(t.overlay, undefined);
});

test("a swipe's hint names its way, as the account's team swipes have it (DEMO-6)", () => {
    const swipes = (t: TryMatch) => t.hints(at(1)).filter((h) => h.control.startsWith("swipe:")).map((h) => `${h.label}: ${h.text}`);
    const wear = new TryMatch(demo, { watch: "wearos", swipes: "upDown", screen: defaultScreen });
    wear.tap("team:0", t0);
    wear.tap("start", t0);
    assert.deepEqual(swipes(wear), ["Swipe right: HOM's controls", "Swipe left: AWY's controls", "Swipe up: Game menu"]);
    const apple = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    apple.tap("team:0", t0);
    apple.tap("start", t0);
    assert.deepEqual(swipes(apple), ["Swipe down: HOM's controls", "Swipe up: AWY's controls", "Swipe sideways: Game menu"]);
});

test("level after regular time: the decision's recommended choice is highlighted", () => {
    const t = new TryMatch({ extraTime: true, penalties: true }, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("up", t0);
    t.press("start", t0);
    t.match.endPeriod(at(45));
    t.match.endHalftime();
    t.match.startNextPeriod(at(60));
    t.press("back", at(105));
    t.press("start", at(105));
    t.press("start", at(105));
    assert.equal(t.match.phase, "decide");
    assert.equal(t.decisions()[t.choice].id, "extraTime");
    t.press("down", at(105));
    t.press("start", at(105));
    assert.equal(t.match.phase, "penalties");
});

test("during play the game menu leads with the period's end, and offers Undo only for this period's events (INP-3, INP-6)", () => {
    const t = new TryMatch({}, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.openGameMenu(at(1));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["End first half", "Adjust clock", "Change kickoff", "Kickoff direction", "Restart match", "Suspend match", "Abandon match"]);
    t.match.addEvent("Y", 1, 4, at(2));
    t.openGameMenu(at(3));
    assert.deepEqual(menu(t)?.rows.slice(0, 2).map((r) => r.label), ["End first half", "Undo last event"]);
    t.match.endPeriod(at(46));
    t.openGameMenu(at(47));
    assert.equal(menu(t)?.rows[0].label, "End half-time");
    assert.ok(menu(t)?.rows.some((r) => r.label === "Undo last event"), "at half-time, the half just ended's");
    t.match.endHalftime();
    t.match.startNextPeriod(at(60));
    t.openGameMenu(at(61));
    assert.equal(menu(t)?.rows[0].label, "End match");
    assert.ok(!menu(t)?.rows.some((r) => r.label === "Undo last event"), "not the first half's in the second");
});

test("while the halfway break is due, the game menu leads with Start break (INP-3, TMR-7)", () => {
    const t = new TryMatch({ midBreak: true }, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    // Not added on as stoppage (stoppage isn't tracked), so centered on halfway: 21:30.
    t.tick(at(21, 30));
    assert.equal(t.match.breakDue, true);
    t.openGameMenu(at(21, 31));
    assert.deepEqual(menu(t)?.rows.slice(0, 3).map((r) => r.label), ["Start break", "End first half", "Skip break"]);
    t.match.skipBreak();
    t.openGameMenu(at(21, 32));
    assert.equal(menu(t)?.rows[0].label, "End first half", "once it's skipped, the period's end leads again");
});

test("a team official's card asks the role, and an injury the number and starts the stoppage (EVT-15, EVT-16)", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("up", t0);
    t.press("start", t0);
    t.press("up", at(5));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Goal", "Yellow card", "Red card", "Team official", "Injury"]);
    // Team official, then the card, then the role in place of a number.
    for (let i = 0; i < 3; i++) {
        t.press("down", at(5));
    }
    t.press("start", at(5));
    assert.equal(menu(t)?.title, "Official HOM");
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Yellow card", "Red card"]);
    t.press("start", at(5));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Head coach", "Assistant coach", "Other"]);
    t.press("down", at(5));
    t.press("start", at(5));
    assert.equal(over(t), undefined);
    assert.deepEqual(t.match.events.at(-1), { type: "TY", team: 0, period: 0, seconds: 300, extra: 1 });
    // Injury: the number, then the stoppage runs as Start/Stop would start it.
    t.press("down", at(10));
    for (let i = 0; i < 4; i++) {
        t.press("down", at(10));
    }
    t.press("start", at(10));
    assert.equal(over(t)?.kind, "number");
    t.press("start", at(10));
    t.press("up", at(10));
    t.press("start", at(10));
    assert.deepEqual(t.match.events.at(-1), { type: "I", team: 1, period: 0, seconds: 600, player: 1 });
    assert.equal(t.match.isStoppageActive, true);
    // Undo names it, and takes it back; the stoppage goes on until Start/Stop.
    t.openGameMenu(at(11));
    assert.equal(menu(t)?.rows.find((r) => r.id === "undo")?.sub, "Injury AWY #1");
    const undo = menu(t)?.rows.findIndex((r) => r.id === "undo") ?? -1;
    for (let i = 0; i < undo; i++) {
        t.press("down", at(11));
    }
    t.press("start", at(11));
    assert.equal(over(t)?.kind, "confirm");
    t.press("start", at(12));
    assert.equal(t.match.events.at(-1)?.type, "TY");
    assert.equal(t.match.isStoppageActive, true);
});

test("Card for a team at half-time opens its controls, with Team official and Injury (EVT-7)", () => {
    const t = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.match.endPeriod(at(45));
    t.openGameMenu(at(46));
    const row = menu(t)?.rows.findIndex((r) => r.id === "card:1") ?? -1;
    t.tap(`row:${row}`, at(46));
    assert.equal(menu(t)?.title, "AWY");
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Yellow card", "Red card", "Team official", "Injury"]);
    t.tap("row:3", at(46));
    t.tap("none", at(46));
    assert.deepEqual(t.match.events.at(-1), { type: "I", team: 1, period: 0, seconds: -2 });
    assert.equal(t.match.isStoppageActive, false);
    t.openGameMenu(at(47));
    assert.equal(menu(t)?.rows.find((r) => r.id === "undo")?.sub, "Injury AWY");
});

test("Adjust clock: the minutes, the seconds, then the change to confirm; Undo takes it back (TMR-14)", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("up", t0);
    t.press("start", t0);
    t.openGameMenu(at(23, 40));
    const rows = menu(t)?.rows ?? [];
    assert.deepEqual(rows.filter((r) => r.id.startsWith("adjust")).map((r) => [r.label, r.sub]), [["Adjust clock", "1H 23:40"], ["Adjust added time", "0:00"]]);
    assert.ok(rows.findIndex((r) => r.id === "adjustClock") < rows.findIndex((r) => r.id === "swapKickoff"), "before Change kickoff");
    for (let i = 0; i < rows.findIndex((r) => r.id === "adjustClock"); i++) {
        t.press("down", at(23, 40));
    }
    t.press("start", at(23, 40));
    const o = over(t);
    assert.ok(o?.kind === "number" && o.adjust?.part === "minutes");
    assert.deepEqual(o.digits, [2, 3]);
    // 24 minutes, then Back from the seconds to the minutes and on again, then 20 seconds.
    t.press("start", at(23, 41));
    t.press("up", at(23, 41));
    t.press("start", at(23, 42));
    const s = over(t);
    assert.ok(s?.kind === "number" && s.adjust?.part === "seconds");
    assert.deepEqual(s.digits, [4, 0]);
    t.press("back", at(23, 43));
    const back = over(t);
    assert.ok(back?.kind === "number" && back.adjust?.part === "minutes");
    assert.deepEqual(back.digits, [2, 4], "the minutes as entered");
    t.press("start", at(23, 44));
    t.press("start", at(23, 44));
    t.press("down", at(23, 45));
    t.press("down", at(23, 45));
    t.press("start", at(23, 46));
    t.press("start", at(23, 46));
    const confirm = over(t);
    assert.ok(confirm?.kind === "confirm");
    assert.equal(confirm.title, "Clock +0:40?");
    assert.equal(confirm.detail, "To 24:20");
    t.press("start", at(23, 50));
    assert.deepEqual(t.match.events.at(-1), { type: "CK", team: -1, period: 0, seconds: 1470, extra: 40 });
    assert.equal(t.match.matchMs(at(23, 50)), (24 * 60 + 30) * 1000, "the time the entry took carries on");
    t.openGameMenu(at(24));
    assert.equal(menu(t)?.rows.find((r) => r.id === "undo")?.sub, "Clock +0:40");
});

test("Adjust added time on Apple Watch: put back, with the minus sign; no change, nothing recorded (TMR-14)", () => {
    const t = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.match.toggleStoppage(at(5));
    t.match.toggleStoppage(at(6, 5));
    t.openGameMenu(at(10));
    const row = menu(t)?.rows.findIndex((r) => r.id === "adjustAdded") ?? -1;
    assert.equal(menu(t)?.rows[row].sub, "1:05");
    t.tap(`row:${row}`, at(10));
    t.tap("digit:1", at(10));
    t.tap("nudge:-1", at(10));
    t.tap("ok", at(10));
    t.tap("ok", at(10));
    const confirm = over(t);
    assert.ok(confirm?.kind === "confirm");
    assert.equal(confirm.title, "Added time −1:00?");
    assert.equal(confirm.yes, "Adjust");
    t.tap("yes", at(11));
    assert.equal(t.match.stoppageTotalMs(at(11)), 5000);
    // The same value again changes nothing.
    t.openGameMenu(at(12));
    t.tap(`row:${menu(t)?.rows.findIndex((r) => r.id === "adjustAdded") ?? -1}`, at(12));
    t.tap("ok", at(12));
    t.tap("ok", at(12));
    assert.equal(over(t), undefined);
    assert.equal(t.match.events.at(-1)?.type, "CA");
    assert.equal(t.match.events.length, 2);
});

test("Suspend match for lightning: the clocks stop, the countdown runs, and only the pill resumes (TMR-13)", () => {
    const t = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.openGameMenu(at(20));
    const rows = menu(t)?.rows ?? [];
    assert.deepEqual(rows.slice(-2).map((r) => r.label), ["Suspend match", "Abandon match"], "Suspend just before Abandon");
    t.tap(`row:${rows.findIndex((r) => r.id === "suspend")}`, at(20));
    assert.equal(menu(t)?.title, "Suspend match");
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Weather", "Lightning", "Crowd trouble", "Other"]);
    t.tap("row:1", at(20));
    assert.equal(t.match.phase, "suspended", "at once, with no Yes or No");
    assert.equal(over(t), undefined);
    assert.equal(t.match.lightningLeftMs(at(25)), 25 * 60 * 1000);
    // A tap off the pill does nothing (INP-8); the team swipe opens cards only.
    t.tap("screen", at(25));
    assert.equal(t.match.phase, "suspended");
    t.swipe("up", at(26));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Yellow card", "Red card", "Team official", "Injury"]);
    t.overlay = undefined;
    t.openGameMenu(at(27));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Resume match", "Lightning again", "Card for HOM", "Card for AWY", "Abandon match"]);
    t.tap("row:1", at(27));
    assert.equal(t.match.lightningLeftMs(at(27)), 30 * 60 * 1000, "Lightning again starts it over");
    t.tap("resume", at(40));
    assert.equal(t.match.phase, "running");
    assert.equal(t.match.matchMs(at(40)), 20 * 60 * 1000, "carries on from where it stopped");
    assert.deepEqual(t.match.events.at(-1), { type: "RS", team: -1, period: 0, seconds: 1200, extra: 1200 });
});

test("on a Garmin, Start/Stop resumes, and Back opens the menu while suspended (TMR-13)", () => {
    const t = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("up", t0);
    t.press("start", t0);
    t.match.suspend(0, at(10));
    t.press("back", at(11));
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["Resume match", "Card for HOM", "Card for AWY", "Abandon match"], "no Lightning again for weather");
    t.press("back", at(11));
    t.press("start", at(15));
    assert.equal(t.match.phase, "running");
    assert.equal(t.match.matchMs(at(15)), 10 * 60 * 1000);
});

test("Sin bin above Yellow card, the number, the pill counting down, then can return until a tap (EVT-12)", () => {
    const off = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    off.tap("team:0", t0);
    off.tap("start", t0);
    off.swipe("up", at(1));
    assert.ok(!menu(off)?.rows.some((r) => r.label === "Sin bin"), "only with sin bins on in the format");

    const t = new TryMatch({ ...demo, sinBins: true, sinBinSec: 600 }, { watch: "apple", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.swipe("up", at(5));
    const rows = menu(t)?.rows ?? [];
    assert.deepEqual(rows.map((r) => r.label), ["Goal", "Sin bin", "Yellow card", "Red card", "Team official", "Injury"]);
    assert.equal(rows[1].tone, "sinBin", "in the cards' yellow");
    t.tap("row:1", at(5));
    const entry = over(t);
    assert.equal(entry?.kind === "number" && entry.type, "SB");
    t.tap("digit:1", at(5));
    for (let i = 0; i < 7; i++) {
        t.tap("nudge:1", at(5));
    }
    t.tap("ok", at(5));
    assert.deepEqual(t.match.events.at(-1), { type: "SB", team: 1, period: 0, seconds: 300, player: 7, extra: 600 });
    assert.equal(t.screenAt(at(6)).sinBin, "AWY 7 9:00");
    t.openGameMenu(at(7));
    assert.equal(menu(t)?.rows.find((r) => r.id === "undo")?.sub, "Sin bin AWY #7");
    t.overlay = undefined;
    // Ten minutes of the match clock later: the vibration, and "can return" until a tap, which does nothing else.
    assert.equal(t.tick(at(15)), "sinBinEnd");
    assert.ok(t.canReturn);
    assert.equal(t.screenAt(at(15)).sinBin, undefined);
    assert.equal(t.hints(at(15))[0].text, "Put away “can return”");
    t.tap("screen", at(15, 2));
    assert.ok(!t.canReturn);
    assert.equal(over(t), undefined);
    assert.equal(t.match.phase, "running");
});

test("a second sin bin for the same number is a send-off: the red screen, until a button (EVT-12, EVT-6)", () => {
    const t = new TryMatch({ ...demo, sinBins: true, sinBinSec: 300 }, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("up", t0);
    t.press("start", t0);
    /** Down for the away team's controls, a row's worth of Down presses, Start, then the number's two digits. */
    const card = (minute: number, downs: number, label: string, number: number) => {
        t.press("down", at(minute));
        for (let i = 0; i < downs; i++) {
            t.press("down", at(minute));
        }
        assert.equal(menu(t)?.rows[menu(t)!.focus].label, label);
        t.press("start", at(minute));
        t.press("start", at(minute));
        for (let i = 0; i < number; i++) {
            t.press("up", at(minute));
        }
        t.press("start", at(minute));
    };
    card(2, 1, "Sin bin", 1);
    assert.equal(t.match.events.at(-1)?.type, "SB");
    assert.equal(over(t), undefined);
    card(4, 1, "Sin bin", 1);
    assert.deepEqual(t.match.events.at(-1), { type: "SB2", team: 1, period: 0, seconds: 240, player: 1, extra: 300 });
    assert.deepEqual(over(t), { kind: "sendOff", why: "Second sin bin", team: 1, player: 1 });
    assert.equal(t.screenAt(at(5)).sinBin, undefined, "sent off: no countdown");
    t.press("up", at(5));
    assert.equal(over(t), undefined, "any button puts it away");
    // A second yellow has the same screen (EVT-6), and a yellow after a sin bin is only a caution (Q-22).
    card(6, 2, "Yellow card", 9);
    assert.equal(over(t), undefined);
    card(7, 2, "Yellow card", 9);
    assert.equal(t.match.events.at(-1)?.type, "Y2");
    const shown = over(t);
    assert.equal(shown?.kind === "sendOff" ? shown.why : undefined, "Second yellow");
});

test("with the sin bin vibration off, the first press only puts can return away; Back opens the menu too (EVT-12, VIB-6)", () => {
    const t = new TryMatch({ ...demo, sinBins: true, sinBinSec: 60 }, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.match.vibeSinBin = false;
    t.press("up", t0);
    t.press("start", t0);
    t.match.addEvent("SB", 0, 0, at(1));
    assert.equal(t.screenAt(at(1, 30)).sinBin, "HOM 0:30", "no number: the team alone");
    assert.equal(t.tick(at(2)), undefined, "no vibration");
    assert.ok(t.canReturn);
    assert.equal(t.match.sinBinReturnText(), "HOM can return");
    t.press("up", at(2, 5));
    assert.ok(!t.canReturn);
    assert.equal(over(t), undefined, "Up only put it away");
    t.match.addEvent("SB", 1, 4, at(3));
    t.tick(at(4));
    assert.ok(t.canReturn);
    t.press("back", at(4, 5));
    assert.ok(!t.canReturn);
    assert.equal(menu(t)?.title, "Game", "Back puts it away and opens the game menu");
});

test("with Card reasons on, the codes come after the number, No reason first, then the red screen for a second yellow (EVT-14)", () => {
    const options = { watch: "garmin" as const, swipes: "upDown" as const, screen: defaultScreen, cardReasons: true, misconductScheme: "ussf" };
    const t = new TryMatch(demo, options);
    t.press("up", t0);
    t.press("start", t0);
    /** Down for the away team's controls, Down to the row, Start, then the number's two digits. */
    const card = (match: TryMatch, minute: number, label: string, number: number) => {
        match.press("down", at(minute));
        while (menu(match) && menu(match)!.rows[menu(match)!.focus].label !== label) {
            match.press("down", at(minute));
        }
        match.press("start", at(minute));
        match.press("start", at(minute));
        for (let i = 0; i < number; i++) {
            match.press("up", at(minute));
        }
        match.press("start", at(minute));
    };
    card(t, 2, "Yellow card", 9);
    assert.equal(menu(t)?.title, "Reason");
    assert.deepEqual(menu(t)?.rows.slice(0, 3).map((r) => [r.label, r.sub]), [["No reason", undefined], ["UB", "Unsporting behavior"], ["DT", "Dissent"]]);
    assert.equal(menu(t)?.focus, 0, "No reason is first");
    t.press("down", at(2));
    t.press("start", at(2));
    assert.equal(t.match.events.at(-1)?.reason, "UB");
    assert.equal(over(t), undefined);
    // The second yellow: Back on the reason gives none, and the red screen follows.
    card(t, 3, "Yellow card", 9);
    assert.equal(menu(t)?.title, "Reason");
    t.press("back", at(3));
    assert.equal(t.match.events.at(-1)?.type, "Y2");
    assert.equal(t.match.events.at(-1)?.reason, undefined);
    assert.equal(over(t)?.kind, "sendOff");
    t.press("up", at(3));
    // A red's list is the send-offs', without the second caution's code.
    card(t, 4, "Red card", 5);
    assert.deepEqual(menu(t)?.rows.map((r) => r.label), ["No reason", "SFP", "VC", "S", "DGH", "DGF", "AL"]);
    // Off (the watch's default): no list.
    const off = new TryMatch(demo, { ...options, cardReasons: false });
    off.press("up", t0);
    off.press("start", t0);
    card(off, 2, "Yellow card", 9);
    assert.equal(over(off), undefined);
    assert.equal(off.match.events.at(-1)?.type, "Y");
});

test("Touch lock: a five-button Garmin's screen takes no taps or swipes in play, and Apple Watch's Water Lock waits for the crown (INP-12)", () => {
    const garmin = new TryMatch(demo, { watch: "garmin", swipes: "upDown", screen: defaultScreen, touchLock: true, tapStoppage: true });
    garmin.press("up", t0);
    garmin.press("start", t0);
    garmin.tap("screen", at(5));
    assert.equal(garmin.match.isStoppageActive, false, "a tap does nothing, Tap for stoppage too");
    garmin.swipe("down", at(5));
    assert.equal(over(garmin), undefined, "a swipe does nothing");
    garmin.press("up", at(6));
    assert.equal(over(garmin)?.kind, "menu", "the buttons still work");

    const apple = new TryMatch(demo, { watch: "apple", swipes: "upDown", screen: defaultScreen, touchLock: true });
    apple.tap("team:0", t0);
    apple.tap("start", t0);
    assert.equal(apple.match.phase, "running");
    assert.equal(apple.waterLocked, true, "on at kickoff");
    apple.swipe("down", at(5));
    assert.equal(over(apple), undefined, "locked: no team menu");
    assert.deepEqual(apple.hints(at(5)).map((h) => h.control), ["crown"]);
    apple.press("crown", at(6));
    apple.swipe("down", at(6));
    assert.equal(over(apple)?.kind, "menu", "the crown unlocks it");
    apple.swipe("right", at(7));
    assert.equal(over(apple), undefined);
    assert.equal(apple.waterLocked, true, "back on play's screen, locked again");

    const venu = new TryMatch(demo, { watch: "venu", swipes: "upDown", screen: defaultScreen, touchLock: true });
    venu.tap("team:0", t0);
    venu.tap("start", t0);
    venu.swipe("down", at(5));
    assert.equal(over(venu)?.kind, "menu", "not on the Venu, whose teams are swipes");
});

test("one period: the menu says End period, and Adjust clock has the time alone (SET-16)", () => {
    const t = new TryMatch({ ...demo, numPeriods: 1, periodSec: 1200, penalties: true }, { watch: "wearos", swipes: "upDown", screen: defaultScreen });
    t.tap("team:0", t0);
    t.tap("start", t0);
    t.swipe("up", at(5));
    const rows = menu(t)?.rows ?? [];
    assert.equal(rows[0].label, "End period");
    assert.equal(rows.find((r) => r.id === "adjustClock")?.sub, "5:00");
    assert.equal(t.screenAt(at(5)).period, "", "no label on the screen");
});

test("a stopping clock: Start stops it in orange with no pill, a goal stops it too, and the menu says Start clock (TMR-15)", () => {
    const t = new TryMatch({ ...demo, stoppingClock: true }, { watch: "garmin", swipes: "upDown", screen: defaultScreen });
    t.press("down", t0);
    t.press("start", t0);
    assert.equal(t.hints(at(5)).find((h) => h.control === "start")?.text, "Stop clock");
    t.press("start", at(10));
    const stopped = t.screenAt(at(11));
    assert.equal(stopped.stopped, true, "orange while it stands still");
    assert.equal(stopped.stoppage, undefined, "no stoppage pill");
    t.press("back", at(11));
    const rows = menu(t)?.rows ?? [];
    assert.equal(rows.find((r) => r.id === "stoppage")?.label, "Start clock");
    assert.equal(rows.some((r) => r.id === "adjustAdded"), false, "no added time to correct");
    t.press("back", at(11));
    t.press("start", at(12));
    assert.equal(t.screenAt(at(13)).stopped, false);
    // A goal recorded stops it: Up, Goal, then Back on the first digit for no number.
    t.press("up", at(20));
    t.press("start", at(20));
    t.press("back", at(20));
    assert.deepEqual(t.match.score, [1, 0]);
    assert.equal(t.match.clockStopped, true);
});
