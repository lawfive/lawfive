import assert from "node:assert/strict";
import { test } from "node:test";
import { appleWatchName, deviceName, devicePlatform, wearOsModelName } from "../src/index.ts";

// Which watch recorded a match, as people know it (STAT-15).

test("Garmin watches by part number", () => {
    assert.equal(deviceName("garmin:006-B3703-00"), "Garmin Venu 2");
    assert.equal(deviceName("garmin:006-b4315-00"), "Garmin Forerunner 965", "any case");
    assert.equal(deviceName("garmin:006-B9999-00"), "Garmin 006-B9999-00", "one it doesn't know, with what the watch said");
    assert.equal(deviceName("garmin"), "Garmin watch", "a watch that didn't say");
    assert.equal(devicePlatform("garmin:006-B3703-00"), "garmin");
});

test("Apple Watches by hardware identifier", () => {
    assert.equal(deviceName("applewatch:Watch7,3"), "Apple Watch Series 9");
    assert.equal(deviceName("applewatch:Watch4,1"), "Apple Watch Series 4");
    assert.equal(deviceName("applewatch:Watch6,18"), "Apple Watch Ultra");
    assert.equal(deviceName("applewatch:Watch7,5"), "Apple Watch Ultra 2");
    assert.equal(deviceName("applewatch:Watch6,10"), "Apple Watch SE (2nd generation)");
    assert.equal(deviceName("applewatch:Watch7,9"), "Apple Watch Series 10");
    assert.equal(deviceName("applewatch:Watch8,3"), "Apple Watch Series 12");
    assert.equal(deviceName("applewatch:Watch9,1"), "Apple Watch", "one it doesn't know yet");
    assert.equal(deviceName("applewatch:Apple Watch"), "Apple Watch", "an older app's, which said only that");
    assert.equal(deviceName("applewatch"), "Apple Watch");
    assert.equal(appleWatchName(undefined), "Apple Watch");
    assert.equal(devicePlatform("applewatch:Watch7,3"), "applewatch");
});

test("Wear OS watches by model", () => {
    assert.equal(deviceName("wearos:SM-R860"), "Galaxy Watch4");
    assert.equal(deviceName("wearos:SM-R875F"), "Galaxy Watch4", "with the region's letters");
    assert.equal(deviceName("wearos:SM-R890"), "Galaxy Watch4 Classic");
    assert.equal(deviceName("wearos:SM-R920"), "Galaxy Watch5 Pro");
    assert.equal(deviceName("wearos:SM-R965U"), "Galaxy Watch6 Classic");
    assert.equal(deviceName("wearos:SM-L310"), "Galaxy Watch7");
    assert.equal(deviceName("wearos:SM-L705F"), "Galaxy Watch Ultra");
    assert.equal(wearOsModelName("Google Pixel Watch 3"), "Pixel Watch 3");
    assert.equal(wearOsModelName("Pixel Watch"), "Pixel Watch");
    assert.equal(wearOsModelName("pixel watch 2"), "Pixel Watch 2");
    assert.equal(deviceName("wearos:TicWatch Pro 5"), "TicWatch Pro 5", "others as the watch gave it");
    assert.equal(deviceName("wearos:SM-R999"), "SM-R999");
    assert.equal(deviceName("wearos"), "Wear OS watch");
    assert.equal(devicePlatform("wearos:SM-R860"), "wearos");
});

test("anything else as given", () => {
    assert.equal(deviceName("fit:something"), "fit:something");
    assert.equal(devicePlatform("fit:something"), "other");
    assert.equal(devicePlatform("other:thing"), "other");
    assert.equal(devicePlatform(""), "other");
    assert.equal(devicePlatform("WearOS:SM-R860"), "wearos", "the kind in any case");
});
