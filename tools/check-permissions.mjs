// SITE-14: lawfive.app/permissions (site/public/permissions.html) lists every permission each app declares.
// Each app has a section marked data-app="…", and each entry in it a data-permission="…" holding the
// identifiers it covers, space-separated, so this matches identifiers, not words. It fails when an app
// declares a permission its section doesn't name, and when a section names one its app doesn't declare,
// unless it's in `notDeclared` below with the reason.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const read = (file) => readFileSync(join(root, file), "utf8").replace(/<!--[\s\S]*?-->/g, "");

/** Android: every <uses-permission> (and the -sdk-23 form) in the app's own manifest. */
function androidManifest(file) {
    // A tools:node="remove" entry takes a library's permission out of the built app, so it isn't declared.
    return [...read(file).matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*)>/g)]
        .filter((m) => !/tools:node="remove"/.test(m[1]))
        .map((m) => m[1].match(/android:name="([^"]+)"/)?.[1])
        .filter(Boolean);
}

/** iPhone and Apple Watch: each NS…UsageDescription key, and each background mode, as `UIBackgroundModes:fetch`. */
function infoPlist(file) {
    const text = read(file);
    const keys = [...text.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]);
    for (const [, key, values] of text.matchAll(/<key>(UIBackgroundModes|WKBackgroundModes)<\/key>\s*<array>([\s\S]*?)<\/array>/g)) {
        for (const [, mode] of values.matchAll(/<string>([^<]+)<\/string>/g)) keys.push(`${key}:${mode}`);
    }
    return keys;
}

/** Notifications have no usage key on Apple's systems: an app that asks for them, in its Swift, counts as declaring them. */
function asksToNotify(dir) {
    const swift = readdirSync(join(root, dir), { recursive: true }).filter((f) => String(f).endsWith(".swift"));
    return swift.some((f) => /\.requestAuthorization\(options:/.test(read(join(dir, String(f))))) ? ["UNUserNotificationCenter"] : [];
}

/** Garmin: every <iq:uses-permission id="…">. */
function garminManifest(file) {
    return [...read(file).matchAll(/<iq:uses-permission\s+id="([^"]+)"/g)].map((m) => m[1]);
}

// The project sets which Info.plist each target uses (INFOPLIST_FILE in mobile/ios/LawFive.xcodeproj).
const declared = {
    android: androidManifest("mobile/android/app/src/main/AndroidManifest.xml"),
    iphone: [...infoPlist("mobile/ios/Info.plist"), ...asksToNotify("mobile/ios/LawFive")],
    garmin: garminManifest("watch-garmin/manifest.xml"),
    "wear-os": androidManifest("mobile/android/wear/src/main/AndroidManifest.xml"),
    "apple-watch": [...infoPlist("mobile/ios/LawFiveWatch-Info.plist"), ...asksToNotify("mobile/ios/LawFiveWatch")],
};

// On the page, though the app's own manifest doesn't declare them. Each says why; when the reason goes,
// so does the entry (the check fails for one the app now declares, or the page no longer names).
const notDeclared = {
    android: {
        // Added to the built app by its libraries, as the merged manifest shows after a build
        // (app/build/intermediates/merged_manifest/). Check it there when a library is added or updated.
        "android.permission.ACCESS_WIFI_STATE": "MapLibre's",
        "android.permission.WAKE_LOCK": "Firebase Cloud Messaging's and WorkManager's",
        "com.google.android.c2dm.permission.RECEIVE": "Firebase Cloud Messaging's",
        "android.permission.FOREGROUND_SERVICE": "WorkManager's",
    },
};

const page = readFileSync(join(root, "site/public/permissions.html"), "utf8");
const order = ["android", "iphone", "garmin", "wear-os", "apple-watch"];
const sections = [...page.matchAll(/<section\b[^>]*\bdata-app="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
const problems = [];
const found = sections.map((s) => s[1]);
if (found.join() !== order.join()) problems.push(`sections are ${found.join(", ") || "missing"}; expected ${order.join(", ")}`);

let entries = 0;
for (const [, app, body] of sections) {
    const named = new Set([...body.matchAll(/\bdata-permission="([^"]+)"/g)].flatMap((m) => m[1].trim().split(/\s+/)));
    const has = new Set(declared[app] ?? []);
    const allowed = notDeclared[app] ?? {};
    entries += named.size;
    for (const p of has) if (!named.has(p)) problems.push(`${app}: declares ${p}, which the page doesn't list`);
    for (const p of named) {
        if (has.has(p) && p in allowed) problems.push(`${app}: ${p} is declared now; remove it from notDeclared in tools/check-permissions.mjs`);
        else if (!has.has(p) && !(p in allowed)) problems.push(`${app}: the page lists ${p}, which the app doesn't declare`);
    }
    for (const p of Object.keys(allowed)) if (!named.has(p)) problems.push(`${app}: ${p} is in notDeclared but not on the page`);
}

if (problems.length) {
    console.error(`The Permissions page (site/public/permissions.html) and the apps disagree:\n${problems.map((p) => `  ${p}`).join("\n")}`);
    process.exit(1);
}
console.log(`Permissions page lists all ${entries} permissions across ${sections.length} apps`);
