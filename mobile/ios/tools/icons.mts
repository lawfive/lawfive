// The app's icons (DESIGN.md: Phosphor only): Phosphor's regular weight (bold on the watch), as vector image sets in
// LawFive/Resources/Assets.xcassets/Phosphor, under the names Android and the web app use. Shown as
// template images, so they take the tint they're given. Run from the repo root after `pnpm install`
// (it reads the web app's copy of @phosphor-icons/react):  node mobile/ios/tools/icons.mts

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const icons: Record<string, string> = {
    matches: "CalendarBlank", templates: "ListDashes", venues: "MapPin", referees: "Users", competitions: "Trophy",
    people: "UsersThree", plus: "Plus", back: "CaretLeft", next: "CaretRight", chevron: "CaretDown", close: "X",
    edit: "PencilSimple", trash: "Trash", pause: "Pause", injury: "FirstAid", flag: "Flag", out: "SignOut",
    search: "MagnifyingGlass", map: "MapTrifold", pin: "MapPinPlus", watch: "Watch", settings: "GearSix",
    more: "DotsThreeOutline", check: "Check", stats: "ChartBar", quiz: "Exam", restart: "ArrowCounterClockwise", download: "DownloadSimple", play: "Play",
    mail: "EnvelopeSimple", link: "Link", copy: "Copy", share: "Export", clock: "Clock", calendar: "CalendarDots",
    info: "Info", merge: "ArrowsMerge", upload: "UploadSimple", report: "FileText", camera: "Camera",
    photos: "Images", portrait: "UserCircle", phone: "Phone", globe: "Globe", directions: "NavigationArrow",
    bell: "Bell", bellOff: "BellSlash", sync: "ArrowsClockwise", eye: "Eye", eyeOff: "EyeSlash", money: "Money",
    sun: "Sun", moon: "Moon", cloud: "Cloud", cloudSun: "CloudSun", cloudMoon: "CloudMoon", cloudRain: "CloudRain",
    cloudSnow: "CloudSnow", cloudFog: "CloudFog", cloudLightning: "CloudLightning", wind: "Wind", thermometer: "Thermometer",
    qr: "QrCode", mobile: "DeviceMobile", undo: "ArrowCounterClockwise",
    tag: "Tag", hash: "Hash", note: "Note", role: "IdentificationBadge", message: "ChatText",
    // PLAN-6: plans.
    plan: "Gauge",
    // SET-15: the assignor.
    assignor: "ClipboardText",
    // WEB-19: a custom team color.
    palette: "Palette",
    // FILE-8: cropping and turning a photo.
    crop: "Crop", turn: "ArrowClockwise",
    // The watch's Settings and New match, as on the Garmin watch (UI-17, SET-13).
    text: "TextAa", quick: "Lightning", sliders: "SlidersHorizontal",
    // Stats' slabs (WEB-24): distance run, heart rate, sprints, top speed, and a name strap's way on, as Android's.
    distance: "Path", heart: "Heartbeat", sprint: "Lightning", speed: "Speedometer", open: "ArrowRight",
    // Help: lawfive.app's support page, from More and About.
    help: "Question",
    // EVT-12: a sin bin, on its yellow card, as Android's and the website's.
    hourglass: "HourglassMedium",
};

// WCH-6: the ones the Apple Watch app uses, written to LawFiveWatch/Resources/Assets.xcassets/Phosphor too, in
// Phosphor's bold weight as on the Garmin watch (UI-18).
const watch = ["flag", "heart", "info", "link", "matches", "play", "plus", "quick", "settings", "sliders", "sync", "text", "undo", "watch"];
// UI-18: the watch's own, for its menus' rows as the Garmin watch has them; only on the watch. Controls is the Hand (UI-17);
// location the MapPin, on the first launch's permissions screen (WCH-7).
const watchOnly: Record<string, string> = { alerts: "Vibrate", history: "ClockCounterClockwise", account: "UserCircle", controls: "Hand", location: "MapPin" };

const repo = new URL("../../../", import.meta.url).pathname;
const defs = `${repo}web/node_modules/@phosphor-icons/react/dist/defs`;
const out = `${repo}mobile/ios/LawFive/Resources/Assets.xcassets/Phosphor`;
const watchOut = `${repo}mobile/ios/LawFiveWatch/Resources/Assets.xcassets/Phosphor`;

for (const folder of [out, watchOut]) {
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder, { recursive: true });
    writeFileSync(`${folder}/Contents.json`, JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2));
}
/** A Phosphor icon's paths in one weight. */
function pathsOf(component: string, weight: "regular" | "bold"): string[] {
    const source = readFileSync(`${defs}/${component}.es.js`, "utf8");
    const next = weight === "bold" ? "duotone" : "thin";
    const part = source.split(new RegExp(`\\[\\s*"${weight}",`))[1]?.split(new RegExp(`\\]\\s*,\\s*\\[\\s*"${next}"`))[0];
    if (!part) {
        throw new Error(`${component}: no ${weight} weight`);
    }
    const elements = [...part.matchAll(/createElement\("(\w+)", \{([^}]*)\}/g)].filter(([, tag]) => tag !== "Fragment" && tag !== "e.Fragment");
    return elements.map(([, tag, attrs]) => {
        if (tag !== "path") {
            throw new Error(`${component}: a ${tag}, not a path`);
        }
        return /d: "([^"]+)"/.exec(attrs)![1];
    });
}

function write(folder: string, name: string, component: string, weight: "regular" | "bold") {
    const set = `${folder}/ph_${name}.imageset`;
    mkdirSync(set);
    writeFileSync(`${set}/ph_${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 256 256"><!-- Phosphor ${component} (${weight}), MIT license. -->${pathsOf(component, weight).map((d) => `<path fill="#000" d="${d}"/>`).join("")}</svg>\n`);
    writeFileSync(`${set}/Contents.json`, JSON.stringify({
        images: [{ filename: `ph_${name}.svg`, idiom: "universal" }],
        info: { author: "xcode", version: 1 },
        properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
    }, null, 2));
}

for (const [name, component] of Object.entries(icons)) {
    write(out, name, component, "regular");
    if (watch.includes(name)) {
        write(watchOut, name, component, "bold");
    }
}
for (const [name, component] of Object.entries(watchOnly)) {
    write(watchOut, name, component, "bold");
}
console.log(`Wrote ${Object.keys(icons).length} icons to ${out}, and ${watch.length + Object.keys(watchOnly).length} to ${watchOut}`);
