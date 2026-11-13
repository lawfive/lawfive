// LawFive's icons (WEB-25), all drawn from the L5 mark in src/logo.ts: the website's in public/ (the
// mark on the stadium board), the Garmin watch's app icon (UI-14) and the emails' header (USR-5).
// Run again after the mark changes; needs Google Chrome installed.
//   pnpm icons

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { boardColors, markFive, markFold, markIcon, markL, markTransform, markViewBox } from "../src/logo.ts";

const dir = new URL("../public/", import.meta.url);
const repo = new URL("../../", import.meta.url);
const dataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

// The browser's own icon: rounded, the same in light and dark.
writeFileSync(new URL("icon.svg", dir), markIcon());

const browser = await chromium.launch({ channel: "chrome", headless: true });

/** An SVG drawn `size` px square, transparent where the SVG is. */
async function draw(size: number, svg: string): Promise<Buffer> {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:transparent"><img src="${dataUrl(svg)}" width="${size}" height="${size}" style="display:block"></body>`);
    await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
    const png = await page.screenshot({ omitBackground: true });
    await page.close();
    return png;
}

/** The board with the mark, `size` px square, transparent outside its rounded corners. */
const board = (size: number, o: Parameters<typeof markIcon>[0] = {}) => draw(size, markIcon(o));

// Home screens round the corners themselves, so theirs are square boards: iOS's full, Android's
// maskable icon with the mark inside the safe circle (the middle 80%). The install icons keep the corners.
writeFileSync(new URL("apple-touch-icon.png", dir), await board(180, { radius: 0 }));
writeFileSync(new URL("icon-192.png", dir), await board(192));
writeFileSync(new URL("icon-512.png", dir), await board(512));
writeFileSync(new URL("icon-maskable-512.png", dir), await board(512, { radius: 0, scale: 0.56 }));

// favicon.ico for browsers that don't take the SVG: PNGs at 16, 32 and 48 px in an ICO wrapper,
// the fold left out under 24px.
const pngs = [];
for (const size of [16, 32, 48]) {
    pngs.push({ size, data: await board(size, { fold: size >= 24 }) });
}
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
});
writeFileSync(new URL("favicon.ico", dir), Buffer.concat([header, ...pngs.map((p) => p.data)]));

// UI-14: the Garmin watch's app icon. The app list is black, so the mark goes straight on it in the
// board's colors (chalk L, mint 5, the fold), filling the width of a transparent square. The compiler
// scales resources/'s SVG for any watch; each size a target needs also gets a PNG drawn here, which
// monkey.jungle gives the watches of that size (their launcherIcon in the device profiles).
const c = boardColors;
const watchMark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -13 126 126" width="126" height="126">
  <!-- UI-14: the L5 mark (WEB-25) in the board's colors, from web/src/logo.ts by web/scripts/icons.ts (pnpm icons). -->
  <g transform="${markTransform}">
    <path fill="${c.l}" d="${markL}"/>
    <path fill="${c.five}" d="${markFive}"/>
    <path fill="${c.fold}" d="${markFold}"/>
  </g>
</svg>
`;
const watch = new URL("watch-garmin/", repo);
writeFileSync(new URL("resources/drawables/launcher_icon.svg", watch), watchMark);
for (const size of [40, 54, 60, 61, 65, 70]) {
    const folder = new URL(`resources-launcher-${size}/drawables/`, watch);
    mkdirSync(folder, { recursive: true });
    writeFileSync(new URL("launcher_icon.png", folder), await draw(size, watchMark));
    writeFileSync(new URL("drawables.xml", folder), `<drawables>
    <!-- UI-14: the app icon at ${size} px, drawn by web/scripts/icons.ts (pnpm icons); flat colors, as dithering speckles an icon this small. -->
    <bitmap id="LauncherIcon" filename="launcher_icon.png" dithering="none"/>
</drawables>
`);
}

// USR-5: the emails' header, the board across the top of the website: the mark beside LAWFIVE in
// Barlow Condensed black italic, FIVE in mint. Drawn at 2x on the board's color (mail apps can't load
// the font, and an opaque image reads the same on a light or a dark mail app); the server sends it
// with each email as an inline image, shown at half its size.
const font = readFileSync(new URL("../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-900-italic.woff2", import.meta.url)).toString("base64");
const mailMark = `<svg viewBox="${markViewBox}" style="height:0.95em;width:auto;margin-right:0.22em;display:block;overflow:visible"><g transform="${markTransform}"><path fill="${c.l}" d="${markL}"/><path fill="${c.five}" d="${markFive}"/><path fill="${c.fold}" d="${markFold}"/></g></svg>`;
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(`<style>
    @font-face { font-family: "Barlow Condensed"; font-style: italic; font-weight: 900; src: url(data:font/woff2;base64,${font}) format("woff2"); }
    body { margin: 0; background: ${c.board}; }
    .wordmark { display: inline-flex; align-items: center; padding: 4px 6px 4px 2px; background: ${c.board}; color: ${c.l};
        font: italic 900 26px/1 "Barlow Condensed"; letter-spacing: 0.01em; }
    .wordmark span { color: ${c.five}; }
</style><div class="wordmark">${mailMark}LAW<span>FIVE</span></div>`);
await page.evaluate(() => document.fonts.ready);
writeFileSync(new URL("server/src/mail-wordmark.png", repo), await page.locator(".wordmark").screenshot());
await page.close();

await browser.close();
