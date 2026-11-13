// The website screens on the marketing site (site/, SITE-2), from the demo's made-up data: needs the
// demo server (pnpm demo in server/) and the web UI (pnpm dev here) running, and Google Chrome.
//   pnpm site-screenshots                      every screen
//   pnpm site-screenshots match-screen quiz    only those, leaving the others as they are

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const out = new URL("../../site/public/images/", import.meta.url).pathname;
const base = process.env.WEB_URL || "http://localhost:5173";
const only = process.argv.slice(2);
const wanted = (name: string) => only.length === 0 || only.includes(name);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const scheme of ["light", "dark"] as const) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, deviceScaleFactor: 1.5 });
    // A whole screen, or just a part of it where the rest says nothing: from the top of the first
    // selector's element to the bottom of the second's (or the same one's).
    const shot = async (name: string, from?: string, to = from) => {
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
        // The demo's account has a real player's name, which doesn't belong on a public page.
        await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                n.textContent = n.textContent!.replace(/Alex Morgan/g, "Jamie Doyle").replace(/demo@lawfive\.dev/g, "jamie@example.com");
            }
            // And their initials on the board (WEB-24).
            for (const el of document.querySelectorAll(".account-initials")) {
                el.textContent = "JD";
            }
        });
        const path = `${out}web-${name}-${scheme}.jpg`;
        if (!from || !to) {
            // From the top: dismissing the prompts above can leave the page scrolled.
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path, type: "jpeg", quality: 82 });
            return;
        }
        const top = (await page.locator(from).first().boundingBox())!;
        const bottom = (await page.locator(to).first().boundingBox())!;
        const pad = 16;
        const x = Math.max(Math.min(top.x, bottom.x) - pad, 0);
        const y = Math.max(top.y - pad, 0);
        const right = Math.max(top.x + top.width, bottom.x + bottom.width) + pad;
        await page.screenshot({ path, type: "jpeg", quality: 82, fullPage: true, clip: { x, y, width: right - x, height: bottom.y + bottom.height + pad - y } });
    };
    await page.goto(base);
    await page.fill("input[type=email]", "demo@lawfive.dev");
    await page.fill("input[type=password]", "lawfive-demo");
    await page.click("button.btn-primary");
    await page.waitForSelector(".match-row");
    // Not the notice for admins on a server without HTTPS (ADM-6), which the demo is.
    const https = page.locator(".https-notice button[aria-label='Hide this on this browser']");
    if (await https.count()) {
        await https.first().click();
    }
    // Not the offers to link a watch and get the app: the page shows those itself.
    for (const notNow = page.locator("button:text-is('Not now')"); await notNow.count();) {
        await notNow.first().click();
    }
    if (wanted("matches")) {
        await shot("matches");
    }
    if (wanted("match")) {
        await page.goto(`${base}/matches?show=past`);
        await page.waitForSelector(".score");
        await page.click(".match-link >> nth=0");
        await page.waitForSelector(".scoreboard");
        await shot("match");
    }
    if (wanted("stats")) {
        await page.goto(`${base}/stats`);
        await page.waitForSelector(".stats-body");
        await shot("stats");
    }
    // UI-27: the match screen's setup on its second step, two clocks in the teams' colors in added time.
    if (wanted("match-screen")) {
        await page.goto(`${base}/settings/match-screen`);
        await page.click("text=Two, stacked");
        await page.click("button:text-is('Continue')");
        await page.click("text=Team colors");
        await page.click(".screen-moments >> text=Added time");
        await shot("match-screen", ".screen-setup");
    }
    // QUIZ-3: a question answered, with why.
    if (wanted("quiz")) {
        await page.goto(`${base}/quiz`);
        await page.click(".quiz-levels >> text=Medium");
        await page.click("button:text-is('Start the quiz')");
        await page.waitForSelector(".quiz-options");
        await page.click(".quiz-option button >> nth=0");
        await page.click("button:text-is('Check answer')");
        await page.waitForSelector(".quiz-outcome");
        await shot("quiz", ".page-head", ".card:has(.quiz-options)");
    }
    await page.close();
}
await browser.close();
console.log(`Screenshots in ${out}`);
