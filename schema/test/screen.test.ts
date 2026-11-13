import assert from "node:assert/strict";
import { test } from "node:test";
import { type ScreenSetup, UserSettings, defaultScreen, nearestLayout, savedScreen, screenSetup, secondStyle, tryMatchFromAddress, tryMatchUrl, tryWatchFor } from "../src/index.ts";

// The match screen's choices (UI-21 to UI-24), from setups saved before and after them.

const at = "2026-11-03T12:00:00.000Z";
const oneClock: ScreenSetup = { clocks: "one", mainClock: "up", secondClock: "down", breakClock: "down", edge: "none", names: true };

test("until one is chosen, the screen is two stacked clocks with the time left and the time of day", () => {
    assert.deepEqual(screenSetup(undefined), { clocks: "stacked", mainClock: "down", secondClock: "up", breakClock: "down", edge: "time", names: true });
    assert.equal(screenSetup(undefined), defaultScreen);
});

test("old setups are read as the four choices", () => {
    assert.deepEqual(screenSetup({ layout: "ring", secondClock: "down", changedAt: at }),
        { clocks: "one", mainClock: "up", secondClock: "down", breakClock: "down", edge: "ring", names: true });
    assert.equal(screenSetup({ layout: "minimal", secondClock: "down", changedAt: at }).names, false);
    assert.equal(screenSetup({ layout: "sideBySide", secondClock: "upEach", changedAt: at }).clocks, "sideBySide");
    // Scoreboard was dropped: one clock with names.
    assert.deepEqual(screenSetup({ layout: "scoreboard", secondClock: "down", changedAt: at }), oneClock);
});

test("new fields win over the old layout", () => {
    const s = screenSetup({ layout: "default", secondClock: "down", clocks: "stacked", mainClock: "down", breakClock: "up", edge: "time", names: false, changedAt: at });
    assert.deepEqual(s, { clocks: "stacked", mainClock: "down", secondClock: "upEach", breakClock: "up", edge: "time", names: false });
});

test("the second clock is never the match clock", () => {
    assert.equal(secondStyle("up", "up"), "down");
    assert.equal(secondStyle("down", "down"), "upEach");
    assert.equal(secondStyle("upEach", "upEach"), "down");
    assert.equal(secondStyle("up", "upEach"), "upEach");
});

test("older watches get the nearest layout", () => {
    const base = oneClock;
    assert.equal(nearestLayout(base), "default");
    assert.equal(nearestLayout({ ...base, edge: "ring" }), "ring");
    assert.equal(nearestLayout({ ...base, edge: "time" }), "default");
    assert.equal(nearestLayout({ ...base, names: false, edge: "ring" }), "minimal");
    assert.equal(nearestLayout({ ...base, clocks: "stacked", names: false }), "stacked");
    assert.equal(nearestLayout({ ...base, clocks: "sideBySide", edge: "ring" }), "sideBySide");
});

test("a saved setup is valid settings and reads back the same", () => {
    const setup = { ...oneClock, clocks: "sideBySide" as const, mainClock: "down" as const, secondClock: "down" as const, edge: "ring" as const };
    const saved = savedScreen(setup, at);
    assert.equal(saved.layout, "sideBySide");
    assert.equal(saved.secondClock, "upEach");
    const settings = UserSettings.parse({ id: crypto.randomUUID(), version: 1, updatedAt: at, misconductScheme: "uk", currency: "USD", distanceUnit: "mi", temperatureUnit: "f", watchScreen: saved });
    assert.deepEqual(screenSetup(settings.watchScreen), { ...setup, secondClock: "upEach" });
});

// DEMO-9: Try a match's address, from the phones and the website after linking.

test("Try a match's address carries the watch and the match screen, and reads back the same", () => {
    const url = tryMatchUrl("wearos", oneClock, "sideways");
    assert.equal(url, "https://lawfive.app/try?watch=wearos&clocks=one&mainClock=up&secondClock=down&breakClock=down&edge=none&names=true&teamSwipes=sideways");
    assert.deepEqual(tryMatchFromAddress(new URL(url).search), { watch: "wearos", screen: oneClock, teamSwipes: "sideways" });
});

test("an address without the screen leaves it to the page, and nonsense is the default", () => {
    assert.deepEqual(tryMatchFromAddress(""), { watch: undefined, teamSwipes: undefined });
    assert.deepEqual(tryMatchFromAddress("?watch=pebble&clocks=lots&names=maybe&teamSwipes=diagonal"), { watch: undefined, screen: defaultScreen, teamSwipes: undefined });
    // The second clock is never the match clock, whatever the address says.
    assert.equal(tryMatchFromAddress("?mainClock=down&secondClock=down").screen?.secondClock, "upEach");
});

test("a linked watch is shown as its kind, a Venu as the Venu", () => {
    assert.equal(tryWatchFor("lawfive-applewatch"), "apple");
    assert.equal(tryWatchFor("wearos", "Galaxy Watch4"), "wearos");
    assert.equal(tryWatchFor("lawfive-wear", "Galaxy Watch4"), "wearos");
    assert.equal(tryWatchFor("lawfive-garmin", "Garmin Venu 2"), "venu");
    assert.equal(tryWatchFor("garmin", "Garmin Forerunner 965"), "garmin");
    assert.equal(tryWatchFor(undefined), "garmin");
});
