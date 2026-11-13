// The L5 mark (WEB-25) for Android, drawn from the website's own shapes and colors (web/src/logo.ts),
// so the app, the website and the watch never drift. It writes:
//   - the launcher icon (adaptive): the mark on the stadium board, as the website's home-screen
//     icons; its foreground (the mark in the board's colors), and its monochrome layer (the mark
//     alone, which Android tints for themed icons); the board itself is @color/launcher_background;
//   - the launch screen's icon (Android 12 and later): the same mark, on the board's color
//     (values-v31/themes.xml), the same in light and dark;
//   - the notifications' small icon: the mark as a white silhouette, which is all Android uses of it;
//   - the Wear OS app's launcher icon: the mark on a round board;
//   - ui/theme/LogoShapes.kt: the mark's outlines for Compose (`LogoMark` and the lockup draw them in
//     the colors of where they sit).
// Vector drawables can't skew, so the mark's slant is worked into the outlines here (its two arcs
// become curves first). Run from the repo root (Node 24 reads the website's TypeScript as is):
//   node mobile/android/tools/logo.mts

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { boardColors, markFive, markFold, markL, markTransform, markViewBox } from "../../../web/src/logo.ts";

const repo = new URL("../../../", import.meta.url).pathname;
const res = `${repo}mobile/android/app/src/main/res`;
const wearRes = `${repo}mobile/android/wear/src/main/res`;

type Point = [number, number];

/** An SVG arc as cubic curves (the SVG spec's endpoint-to-center conversion, in quarter turns at most). */
function arcToCubics(from: Point, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, to: Point): Point[][] {
    const phi = (rotation * Math.PI) / 180;
    const [x1, y1] = from;
    const [x2, y2] = to;
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
    const y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const sign = large === sweep ? -1 : 1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
    const cxp = (coef * rx * y1p) / ry;
    const cyp = (-coef * ry * x1p) / rx;
    const cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
    const cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    if (sweep && delta < 0) delta += 2 * Math.PI;
    const pieces = Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9);
    const step = delta / pieces;
    const k = (4 / 3) * Math.tan(step / 4);
    const at = (t: number): Point => [cx + rx * Math.cos(phi) * Math.cos(t) - ry * Math.sin(phi) * Math.sin(t), cy + rx * Math.sin(phi) * Math.cos(t) + ry * Math.cos(phi) * Math.sin(t)];
    const tangent = (t: number): Point => [-rx * Math.cos(phi) * Math.sin(t) - ry * Math.sin(phi) * Math.cos(t), -rx * Math.sin(phi) * Math.sin(t) + ry * Math.cos(phi) * Math.cos(t)];
    const curves: Point[][] = [];
    for (let i = 0; i < pieces; i++) {
        const a = theta1 + i * step;
        const b = a + step;
        const [p0, p3] = [at(a), at(b)];
        const [d0, d3] = [tangent(a), tangent(b)];
        curves.push([[p0[0] + k * d0[0], p0[1] + k * d0[1]], [p3[0] - k * d3[0], p3[1] - k * d3[1]], i === pieces - 1 ? to : p3]);
    }
    return curves;
}

/** The mark's transform ("translate(22 0) skewX(-12)") as a function of a point. */
const [, tx, ty] = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(markTransform)!.map(Number);
const skew = Math.tan((Number(/skewX\(([-\d.]+)\)/.exec(markTransform)![1]) * Math.PI) / 180);
const slant = ([x, y]: Point): Point => [x + skew * y + tx, y + ty];
const [, , boxW, boxH] = markViewBox.split(/\s+/).map(Number);

/** One of the mark's paths (absolute M, H, V, L, A and Z only, as logo.ts has them), slanted, as M, L, C and Z. */
function slanted(d: string, place: (p: Point) => Point): string {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g)!;
    let i = 0;
    const num = () => Number(tokens[i++]);
    let at: Point = [0, 0];
    let start: Point = [0, 0];
    const out: string[] = [];
    const fmt = (p: Point) => {
        const [x, y] = place(slant(p));
        return `${+x.toFixed(3)},${+y.toFixed(3)}`;
    };
    let command = "";
    while (i < tokens.length) {
        if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
        switch (command) {
            case "M": at = start = [num(), num()]; out.push(`M${fmt(at)}`); command = "L"; break;
            case "L": at = [num(), num()]; out.push(`L${fmt(at)}`); break;
            case "H": at = [num(), at[1]]; out.push(`L${fmt(at)}`); break;
            case "V": at = [at[0], num()]; out.push(`L${fmt(at)}`); break;
            case "A": {
                const [rx, ry, rot, large, sweep, x, y] = [num(), num(), num(), num(), num(), num(), num()];
                for (const [c1, c2, end] of arcToCubics(at, rx, ry, rot, large === 1, sweep === 1, [x, y])) out.push(`C${fmt(c1)} ${fmt(c2)} ${fmt(end)}`);
                at = [x, y];
                break;
            }
            case "Z": case "z": out.push("Z"); at = start; break;
            default: throw new Error(`logo.ts uses ${command}, which this script doesn't read yet`);
        }
    }
    return out.join(" ");
}

/** The mark as a vector drawable: `share` of the square's width, centered (nudged right as the website's icons are, for the slant). */
function markDrawable({ sizeDp, share, colors, background, note }: { sizeDp: number; share: number; colors: { l: string; five: string; fold?: string }; background?: string; note: string }): string {
    const view = 108;
    const w = view * share;
    const scale = w / boxW;
    const x0 = (view - w) / 2 + (view * 4) / 512;
    const y0 = (view - boxH * scale) / 2;
    const place = ([x, y]: Point): Point => [x0 + x * scale, y0 + y * scale];
    const argb = (hex: string) => `#FF${hex.replace("#", "").toUpperCase()}`;
    const paths = [
        background && `    <path android:fillColor="${argb(background)}" android:pathData="M0,0 H${view} V${view} H0 Z" />`,
        `    <path android:fillColor="${argb(colors.l)}" android:pathData="${slanted(markL, place)}" />`,
        `    <path android:fillColor="${argb(colors.five)}" android:pathData="${slanted(markFive, place)}" />`,
        colors.fold && `    <path android:fillColor="${argb(colors.fold)}" android:pathData="${slanted(markFold, place)}" />`,
    ].filter(Boolean);
    return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by mobile/android/tools/logo.mts from web/src/logo.ts (WEB-25): ${note} -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${sizeDp}dp"
    android:height="${sizeDp}dp"
    android:viewportWidth="${view}"
    android:viewportHeight="${view}">
${paths.join("\n")}
</vector>
`;
}

const board = { l: boardColors.l, five: boardColors.five, fold: boardColors.fold };
const white = { l: "#ffffff", five: "#ffffff" };

// An adaptive icon is 108 dp, of which launchers show the middle 72 under a mask (a circle on
// Pixels, whose safe zone is 66 dp across): the mark takes 0.44 of the 108, as the website's maskable
// icon has it inside its safe circle, so its corners clear the circle with room round them.
writeFileSync(`${res}/drawable/ic_launcher_foreground.xml`, markDrawable({ sizeDp: 108, share: 0.44, colors: board, note: "the launcher icon's foreground, the mark in the board's colors over @color/launcher_background." }));
writeFileSync(`${res}/drawable/ic_launcher_monochrome.xml`, markDrawable({ sizeDp: 108, share: 0.44, colors: white, note: "the launcher icon's monochrome layer, tinted by the launcher for themed icons." }));
// The launch screen's icon sits in a 240 dp box of which a 160 dp circle shows: the same share keeps
// it the launcher icon's size, so the icon seems to open into the launch screen.
writeFileSync(`${res}/drawable/ic_splash.xml`, markDrawable({ sizeDp: 108, share: 0.44, colors: board, note: "the launch screen's icon, on the board's color in light and dark." }));
// The status bar's icons are 24 dp with about 1 dp clear round them.
writeFileSync(`${res}/drawable/ic_notification.xml`, markDrawable({ sizeDp: 24, share: 22 / 24, colors: white, note: "the notifications' small icon, a white silhouette (APP-24)." }));
// Wear OS shows the launcher icon whole, as a circle, with no adaptive mask: the board as a circle
// with the mark across 0.62 of it, about the margin of the watch's own app icons.
writeFileSync(`${wearRes}/drawable/ic_launcher_foreground.xml`, markDrawable({ sizeDp: 108, share: 0.62, colors: board, note: "the Wear OS app's icon, over a round board (ic_launcher.xml)." }));

// The earlier mark's files, which this script used to write.
for (const old of [`${res}/drawable/logo.xml`, `${res}/drawable-night/logo.xml`, `${res}/drawable-night/ic_splash.xml`]) rmSync(old, { force: true });

// Compose's copy: the outlines in the mark's own box (126 × 100), slanted.
const kotlinDir = `${repo}mobile/android/app/src/main/java/app/lawfive/ui/theme`;
mkdirSync(kotlinDir, { recursive: true });
const same = (p: Point): Point => p;
writeFileSync(`${kotlinDir}/LogoShapes.kt`, `package app.lawfive.ui.theme

// Generated by mobile/android/tools/logo.mts from web/src/logo.ts (WEB-25): don't edit by hand.
// The L5 mark's outlines, already slanted, in a box ${boxW} wide and ${boxH} high.

object LogoShapes {
    const val WIDTH = ${boxW}f
    const val HEIGHT = ${boxH}f
    const val L = "${slanted(markL, same)}"
    const val FIVE = "${slanted(markFive, same)}"
    /** The darker fold at the 5's foot; left out at small sizes, where it would blur. */
    const val FOLD = "${slanted(markFold, same)}"
    /** The tapered line under the lockup's name, in a box 200 wide and 10 high, stretched to the name's width. */
    const val LINE = "M0,9.6 L200,0 L196,7.2 L6,10 Z"
    /** The mark's colors on the stadium board, as the icons show it (boardColors). */
    const val BOARD = 0xFF${boardColors.board.slice(1).toUpperCase()}
    const val BOARD_L = 0xFF${boardColors.l.slice(1).toUpperCase()}
    const val BOARD_FIVE = 0xFF${boardColors.five.slice(1).toUpperCase()}
    const val BOARD_FOLD = 0xFF${boardColors.fold.slice(1).toUpperCase()}
}
`);
console.log("Wrote the launcher icon (foreground and monochrome), the launch screen's icon, the notifications' icon, the watch's launcher icon and ui/theme/LogoShapes.kt");
