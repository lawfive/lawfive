// The L5 mark (WEB-25) for the iPhone and the Apple Watch, drawn from the website's own shapes and
// colors (web/src/logo.ts), so the apps, the website and the watches never drift. It writes:
//   - the iPhone's app icon: the mark on the stadium board, as the website's home-screen icon, with
//     iOS 18's dark variant (the mark on a clear square, over the system's own dark backdrop) and its
//     tinted one (the mark in grays on black, which iOS tints);
//   - the launch screen's mark (LaunchMark, @2x and @3x) on the board's color (LaunchBackground), the
//     same in light and dark, so the icon seems to open into it;
//   - the Apple Watch app's icon: the board, which watchOS cuts round, with the mark across 0.62 of it,
//     as the Wear OS icon has it;
//   - LawFive/UI/LogoShapes.swift: the mark's outlines for SwiftUI (`LogoMark` and the lockup draw
//     them in the colors of where they sit).
// The slant is worked into the outlines (the 5's arcs become curves first), as Android's script does.
// Run from the repo root after `pnpm install` in web/ (it draws with web's playwright-core and needs
// Google Chrome installed):  node mobile/ios/tools/logo.mts

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { boardColors, markFive, markFold, markIcon, markL, markTransform, markViewBox } from "../../../web/src/logo.ts";

const repo = new URL("../../../", import.meta.url).pathname;
const { chromium } = await import(`${repo}web/node_modules/playwright-core/index.mjs`);
const assets = `${repo}mobile/ios/LawFive/Resources/Assets.xcassets`;
const watchAssets = `${repo}mobile/ios/LawFiveWatch/Resources/Assets.xcassets`;

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

/** One of the mark's paths (absolute M, H, V, L, A and Z only, as logo.ts has them), slanted, as SwiftUI Path calls. */
function swiftPath(d: string): string {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g)!;
    let i = 0;
    const num = () => Number(tokens[i++]);
    let at: Point = [0, 0];
    let start: Point = [0, 0];
    const out: string[] = [];
    const pt = (p: Point) => {
        const [x, y] = slant(p);
        return `CGPoint(x: ${+x.toFixed(3)}, y: ${+y.toFixed(3)})`;
    };
    let command = "";
    while (i < tokens.length) {
        if (/[A-Za-z]/.test(tokens[i])) command = tokens[i++];
        switch (command) {
            case "M": at = start = [num(), num()]; out.push(`p.move(to: ${pt(at)})`); command = "L"; break;
            case "L": at = [num(), num()]; out.push(`p.addLine(to: ${pt(at)})`); break;
            case "H": at = [num(), at[1]]; out.push(`p.addLine(to: ${pt(at)})`); break;
            case "V": at = [at[0], num()]; out.push(`p.addLine(to: ${pt(at)})`); break;
            case "A": {
                const [rx, ry, rot, large, sweep, x, y] = [num(), num(), num(), num(), num(), num(), num()];
                for (const [c1, c2, end] of arcToCubics(at, rx, ry, rot, large === 1, sweep === 1, [x, y])) out.push(`p.addCurve(to: ${pt(end)}, control1: ${pt(c1)}, control2: ${pt(c2)})`);
                at = [x, y];
                break;
            }
            case "Z": case "z": out.push("p.closeSubpath()"); at = start; break;
            default: throw new Error(`logo.ts uses ${command}, which this script doesn't read yet`);
        }
    }
    return out.map((line) => `            ${line}`).join("\n");
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const dataUrl = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

/** An SVG drawn `size` px square (or `w` by `h`), transparent where the SVG is. */
async function draw(svg: string, w: number, h = w): Promise<Buffer> {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;background:transparent"><img src="${dataUrl(svg)}" width="${w}" height="${h}" style="display:block"></body>`);
    await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
    const png = await page.screenshot({ omitBackground: true });
    await page.close();
    return png;
}

/** The mark alone on a 512 square (`background` behind it, or clear), `scale` of its width, as markIcon places it. */
function markOnly({ colors, background, scale = 0.7 }: { colors: { l: string; five: string; fold: string }; background?: string; scale?: number }): string {
    const w = 512 * scale;
    const h = (w * boxH) / boxW;
    const x = (512 - w) / 2 + 4;
    const y = (512 - h) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ""}
  <svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" viewBox="${markViewBox}">
    <g transform="${markTransform}">
      <path fill="${colors.l}" d="${markL}"/>
      <path fill="${colors.five}" d="${markFive}"/>
      <path fill="${colors.fold}" d="${markFold}"/>
    </g>
  </svg>
</svg>
`;
}

const board = { l: boardColors.l, five: boardColors.five, fold: boardColors.fold };
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// The iPhone's icon: iOS rounds the corners itself, so a square board, the mark at the website's
// apple-touch-icon size (0.7). iOS 18's dark icon sets the mark on the system's dark backdrop, and its
// tinted one tints the grays (the L brightest, as it is chalk on the board).
const appIcon = `${assets}/AppIcon.appiconset`;
rmSync(appIcon, { recursive: true, force: true });
mkdirSync(appIcon, { recursive: true });
writeFileSync(`${appIcon}/icon.png`, await draw(markIcon({ radius: 0 }), 1024));
writeFileSync(`${appIcon}/icon-dark.png`, await draw(markOnly({ colors: board }), 1024));
writeFileSync(`${appIcon}/icon-tinted.png`, await draw(markOnly({ colors: { l: "#ffffff", five: "#bdbdbd", fold: "#7a7a7a" }, background: "#000000" }), 1024));
writeFileSync(`${appIcon}/Contents.json`, json({
    images: [
        { filename: "icon.png", idiom: "universal", platform: "ios", size: "1024x1024" },
        { appearances: [{ appearance: "luminosity", value: "dark" }], filename: "icon-dark.png", idiom: "universal", platform: "ios", size: "1024x1024" },
        { appearances: [{ appearance: "luminosity", value: "tinted" }], filename: "icon-tinted.png", idiom: "universal", platform: "ios", size: "1024x1024" },
    ],
    info: { author: "xcode", version: 1 },
}));

// The launch screen: the mark in the middle of the board, at the size it has on the home screen's
// icon (an icon is about 64 pt across on a phone, the mark 0.7 of it), in both modes.
const launch = `${assets}/LaunchMark.imageset`;
rmSync(launch, { recursive: true, force: true });
mkdirSync(launch, { recursive: true });
const launchW = 45;
const launchH = Math.round((launchW * boxH) / boxW);
const launchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markViewBox}" width="${boxW}" height="${boxH}"><g transform="${markTransform}"><path fill="${board.l}" d="${markL}"/><path fill="${board.five}" d="${markFive}"/><path fill="${board.fold}" d="${markFold}"/></g></svg>`;
for (const scale of [2, 3]) writeFileSync(`${launch}/mark@${scale}x.png`, await draw(launchSvg, launchW * scale, launchH * scale));
writeFileSync(`${launch}/Contents.json`, json({
    images: [{ filename: "mark@2x.png", idiom: "universal", scale: "2x" }, { filename: "mark@3x.png", idiom: "universal", scale: "3x" }],
    info: { author: "xcode", version: 1 },
}));
const hex = (h: string) => ({ red: `0x${h.slice(1, 3).toUpperCase()}`, green: `0x${h.slice(3, 5).toUpperCase()}`, blue: `0x${h.slice(5, 7).toUpperCase()}`, alpha: "1.000" });
writeFileSync(`${assets}/LaunchBackground.colorset/Contents.json`, json({
    colors: [{ color: { "color-space": "srgb", components: hex(boardColors.board) }, idiom: "universal" }],
    info: { author: "xcode", version: 1 },
}));

// The Apple Watch's icon: watchOS cuts it round, so the board with the mark across 0.62 of it.
const watchIcon = `${watchAssets}/AppIcon.appiconset`;
rmSync(watchIcon, { recursive: true, force: true });
mkdirSync(watchIcon, { recursive: true });
writeFileSync(`${watchIcon}/icon.png`, await draw(markIcon({ radius: 0, scale: 0.62 }), 1024));
writeFileSync(`${watchIcon}/Contents.json`, json({
    images: [{ filename: "icon.png", idiom: "universal", platform: "watchos", size: "1024x1024" }],
    info: { author: "xcode", version: 1 },
}));

await browser.close();

// The earlier logo, which SwiftUI now draws from LogoShapes.swift.
rmSync(`${assets}/Logo.imageset`, { recursive: true, force: true });

// SwiftUI's copy: the outlines in the mark's own box (126 × 100), slanted.
writeFileSync(`${repo}mobile/ios/LawFive/UI/LogoShapes.swift`, `import SwiftUI

// Generated by mobile/ios/tools/logo.mts from web/src/logo.ts (WEB-25): don't edit by hand.
// The L5 mark's outlines, already slanted, in a box ${boxW} wide and ${boxH} high.

enum LogoShapes {
    static let width: CGFloat = ${boxW}
    static let height: CGFloat = ${boxH}

    static let l: Path = {
        Path { p in
${swiftPath(markL)}
        }
    }()

    static let five: Path = {
        Path { p in
${swiftPath(markFive)}
        }
    }()

    /// The darker fold at the 5's foot; left out at small sizes, where it would blur.
    static let fold: Path = {
        Path { p in
${swiftPath(markFold)}
        }
    }()

    /// The tapered line under the lockup's name, in a box 200 wide and 10 high, stretched to the name's width.
    static let line: Path = {
        Path { p in
            p.move(to: CGPoint(x: 0, y: 9.6))
            p.addLine(to: CGPoint(x: 200, y: 0))
            p.addLine(to: CGPoint(x: 196, y: 7.2))
            p.addLine(to: CGPoint(x: 6, y: 10))
            p.closeSubpath()
        }
    }()

    /// The mark's colors on the stadium board, as the icons show it (boardColors).
    static let board: UInt32 = 0x${boardColors.board.slice(1).toUpperCase()}
    static let boardL: UInt32 = 0x${boardColors.l.slice(1).toUpperCase()}
    static let boardFive: UInt32 = 0x${boardColors.five.slice(1).toUpperCase()}
    static let boardFold: UInt32 = 0x${boardColors.fold.slice(1).toUpperCase()}
}
`);
console.log("Wrote the app icon (with its dark and tinted variants), the launch screen's mark and color, the Apple Watch's icon and LawFive/UI/LogoShapes.swift");
