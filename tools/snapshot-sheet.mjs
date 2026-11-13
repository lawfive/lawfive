#!/usr/bin/env node
// The phones' snapshot pictures side by side (each phone README's snapshot section): each screen, in each
// theme and text size, on Android (412 and 320 dp) and the iPhone (17 and SE), with the website's
// phone screenshot where it has the same screen. One HTML page that points at the pictures where
// they are, so nothing is copied. Pictures are named `{screen}__{width}-{theme}-{text}.png`.
//
//   node tools/snapshot-sheet.mjs [--android dir] [--ios dir] [--web dir] [--out file]
//
// Defaults: mobile/android/build/snapshots, mobile/ios/build/snapshots, no website, and
// build/snapshots/sheet.html. The website's are `pnpm screenshots <dir> light|dark` in web/,
// named phone-{name}.png, one folder per theme: pass the folder that holds light/ and dark/.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith("--") ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []));
const android = resolve(root, args.android ?? "mobile/android/build/snapshots");
const ios = resolve(root, args.ios ?? "mobile/ios/build/snapshots");
const web = args.web ? resolve(root, args.web) : undefined;
const out = resolve(root, args.out ?? "build/snapshots/sheet.html");

// The screens both phones draw, in the order a referee meets them, and the website's name for each.
const screens = [
    ["matches", "Matches", "matches"],
    ["matches-new", "Matches, a new account", undefined],
    ["match-played", "A played match", "match-played"],
    ["match-form", "A new match", "match-edit"],
    ["settings", "Settings", undefined],
    ["stats", "Stats", "stats"],
    ["quiz", "Quiz, a question answered", undefined],
    ["quiz-result", "Quiz, the result", undefined],
];
const columns = [["Android 412", android, "412"], ["iPhone 17", ios, "iphone17"], ["Android 320", android, "320"], ["iPhone SE", ios, "se"]];
const variants = ["light-1x", "dark-1x", "light-large", "dark-large"];

const files = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : []);
const had = new Set([...files(android).map((f) => join(android, f)), ...files(ios).map((f) => join(ios, f))]);
const link = (file) => encodeURI(relative(dirname(out), file));
// A tall screen may come in frames: matches__412-light-1x.png, or …-1x_1.png, …-1x_2.png.
const frames = (dir, screen, width, variant) => {
    const base = `${screen}__${width}-${variant}`;
    return files(dir).filter((f) => f === `${base}.png` || f.startsWith(`${base}_`)).sort().map((f) => join(dir, f));
};
const cell = (pictures) => (pictures.length
    ? pictures.map((p) => `<a href="${link(p)}"><img src="${link(p)}" alt="" loading="lazy"></a>`).join("")
    : `<span class="none">none</span>`);

let shown = 0;
const sections = screens.map(([key, title, webName]) => {
    const rows = variants.map((variant) => {
        const cells = columns.map(([, dir, width]) => {
            const pictures = frames(dir, key, width, variant);
            shown += pictures.length;
            return `<td>${cell(pictures)}</td>`;
        });
        const [theme, text] = variant.split("-");
        const site = web && webName && text === "1x" ? [join(web, theme, `phone-${webName}.png`)].filter(existsSync) : [];
        return `<tr><th scope="row">${theme}<br>${text === "1x" ? "standard text" : "large text"}</th>${cells.join("")}${web ? `<td>${cell(site)}</td>` : ""}</tr>`;
    });
    return `<section><h2>${title} <code>${key}</code></h2><table><thead><tr><td></td>${columns.map(([name]) => `<th scope="col">${name}</th>`).join("")}${web ? "<th scope=\"col\">Website</th>" : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snapshot sheet</title>
<style>
:root { --ground: #f4f1e8; --ink: #14201a; --muted: #5d6b63; --line: #d6d0c0; }
@media (prefers-color-scheme: dark) { :root { --ground: #0f1612; --ink: #e9efe9; --muted: #93a39a; --line: #2a3a31; } }
body { margin: 0; padding: 16px; background: var(--ground); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 22px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 20px; }
h2 { font-size: 18px; margin: 28px 0 8px; } code { color: var(--muted); font-size: 13px; }
table { border-collapse: collapse; } th, td { vertical-align: top; padding: 6px; border-top: 1px solid var(--line); }
thead th { text-align: left; font-weight: 600; border: 0; } tbody th { text-align: left; font-weight: 500; color: var(--muted); white-space: nowrap; }
img { display: block; width: 200px; height: auto; margin-bottom: 6px; border: 1px solid var(--line); }
.none { color: var(--muted); }
</style></head><body>
<h1>Snapshot sheet</h1>
<p>${shown} pictures from ${relative(root, android)} and ${relative(root, ios)}${web ? ` and the website's from ${relative(root, web)}` : ""}. Click a picture for its full size.</p>
${sections.join("\n")}
</body></html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
const unused = [...had].filter((f) => !html.includes(link(f)));
console.log(`${relative(root, out)}: ${shown} pictures${unused.length ? `; ${unused.length} not on the sheet (other screens or names): ${unused.slice(0, 5).map((f) => relative(root, f)).join(", ")}${unused.length > 5 ? ", …" : ""}` : ""}`);
