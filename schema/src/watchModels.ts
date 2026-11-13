import { garminModelName } from "./garminModels.ts";

// Which watch recorded a match, as people know it (STAT-15). A match report's device is the watch
// app's kind and what the watch said it was, joined by the server (POST /v1/watch/records, from the
// X-LawFive-Device header's kind):
//
//   garmin:006-B3703-00    a Garmin's part number (System.getDeviceSettings().partNumber), named by garminModels.ts
//   wearos:SM-R860         a Wear OS watch's Build.MODEL
//   applewatch:Watch7,3    an Apple Watch's hardware identifier; "applewatch:Apple Watch" from apps before it
//
// An app that didn't say which watch leaves the kind alone ("garmin").

export const watchPlatforms = ["garmin", "wearos", "applewatch", "other"] as const;
export type WatchPlatform = (typeof watchPlatforms)[number];

/**
 * Apple Watches by hardware identifier (hw.machine), Series 4 on; each size and cellular version has
 * its own, and they share a name, as people know them.
 */
const appleWatches: Record<string, string> = {};
const appleFamilies: [string, string[]][] = [
    ["Series 4", ["Watch4,1", "Watch4,2", "Watch4,3", "Watch4,4"]],
    ["Series 5", ["Watch5,1", "Watch5,2", "Watch5,3", "Watch5,4"]],
    ["SE", ["Watch5,9", "Watch5,10", "Watch5,11", "Watch5,12"]],
    ["Series 6", ["Watch6,1", "Watch6,2", "Watch6,3", "Watch6,4"]],
    ["Series 7", ["Watch6,6", "Watch6,7", "Watch6,8", "Watch6,9"]],
    ["SE (2nd generation)", ["Watch6,10", "Watch6,11", "Watch6,12", "Watch6,13"]],
    ["Series 8", ["Watch6,14", "Watch6,15", "Watch6,16", "Watch6,17"]],
    ["Ultra", ["Watch6,18"]],
    ["Series 9", ["Watch7,1", "Watch7,2", "Watch7,3", "Watch7,4"]],
    ["Ultra 2", ["Watch7,5"]],
    ["Series 10", ["Watch7,8", "Watch7,9", "Watch7,10", "Watch7,11"]],
    ["Ultra 3", ["Watch7,12"]],
    ["SE 3", ["Watch7,13", "Watch7,14", "Watch7,15", "Watch7,16"]],
    ["Series 11", ["Watch7,17", "Watch7,18", "Watch7,19", "Watch7,20"]],
    // 2026's, from the watchOS simulator's device types; their cellular versions aren't known yet.
    ["Ultra 4", ["Watch8,1"]],
    ["Series 12", ["Watch8,3", "Watch8,4"]],
];
for (const [name, identifiers] of appleFamilies) {
    for (const identifier of identifiers) {
        appleWatches[identifier.toLowerCase()] = `Apple Watch ${name}`;
    }
}

/** "Apple Watch Series 9" for "Watch7,3"; "Apple Watch" for one LawFive doesn't know, or none. */
export function appleWatchName(identifier: string | undefined): string {
    return (identifier && appleWatches[identifier.trim().toLowerCase()]) || "Apple Watch";
}

/**
 * Samsung's Wear OS watches by the model code in Build.MODEL ("SM-R860", "SM-R865F", "SM-L310U"):
 * the letter and three digits after "SM-", whatever region letters follow. Sizes and LTE versions
 * share a name, as people know them.
 */
const galaxyWatches: Record<string, string> = {};
const galaxyFamilies: [string, string[]][] = [
    ["Galaxy Watch4", ["R860", "R865", "R870", "R875"]],
    ["Galaxy Watch4 Classic", ["R880", "R885", "R890", "R895"]],
    ["Galaxy Watch FE", ["R861", "R866"]],
    ["Galaxy Watch5", ["R900", "R905", "R910", "R915"]],
    ["Galaxy Watch5 Pro", ["R920", "R925"]],
    ["Galaxy Watch6", ["R930", "R935", "R940", "R945"]],
    ["Galaxy Watch6 Classic", ["R950", "R955", "R960", "R965"]],
    ["Galaxy Watch7", ["L300", "L305", "L310", "L315"]],
    ["Galaxy Watch Ultra", ["L705"]],
    ["Galaxy Watch8", ["L320", "L325", "L330", "L335"]],
    ["Galaxy Watch8 Classic", ["L500", "L505"]],
];
for (const [name, codes] of galaxyFamilies) {
    for (const code of codes) {
        galaxyWatches[code] = name;
    }
}

/**
 * "Galaxy Watch4" for "SM-R860", "Pixel Watch 3" for "Google Pixel Watch 3" or "Pixel Watch 3", or
 * undefined for a model LawFive doesn't know (shown as the watch gave it).
 */
export function wearOsModelName(model: string | undefined): string | undefined {
    const text = model?.trim() ?? "";
    const samsung = /^SM-([RL]\d{3})/i.exec(text);
    if (samsung) {
        return galaxyWatches[samsung[1].toUpperCase()];
    }
    const pixel = /^(?:Google\s+)?Pixel\s+Watch(?:\s+(\d+))?/i.exec(text);
    return pixel ? `Pixel Watch${pixel[1] ? ` ${pixel[1]}` : ""}` : undefined;
}

/** A device's kind and the rest: "garmin:006-B3703-00" is garmin and 006-B3703-00. */
function split(device: string): { platform: WatchPlatform; model?: string } {
    const text = device.trim();
    const colon = text.indexOf(":");
    const kind = (colon < 0 ? text : text.slice(0, colon)).toLowerCase();
    const model = colon < 0 ? undefined : text.slice(colon + 1).trim() || undefined;
    return (watchPlatforms as readonly string[]).includes(kind) && kind !== "other" ? { platform: kind as WatchPlatform, ...(model ? { model } : {}) } : { platform: "other" };
}

/** The watch app that recorded it: garmin, wearos or applewatch, or other for anything else. */
export function devicePlatform(device: string): WatchPlatform {
    return split(device).platform;
}

/**
 * A device as people know it: "Garmin Venu 2" for "garmin:006-B3703-00", "Apple Watch Series 9"
 * for "applewatch:Watch7,3" (and "Apple Watch" for one it doesn't know, or an older app's
 * "applewatch:Apple Watch"), "Galaxy Watch4" for "wearos:SM-R860" (a Wear OS model it doesn't know
 * as given), "Garmin watch" or "Wear OS watch" when the watch didn't say; anything else as given.
 */
export function deviceName(device: string): string {
    const { platform, model } = split(device);
    if (platform === "applewatch") {
        return appleWatchName(model);
    }
    if (platform === "wearos") {
        return model ? wearOsModelName(model) ?? model : "Wear OS watch";
    }
    if (platform === "garmin") {
        const name = garminModelName(model);
        return name ? `Garmin ${name}` : model ? `Garmin ${model}` : "Garmin watch";
    }
    return device;
}
