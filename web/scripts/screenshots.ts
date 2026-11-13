// Screenshots of the web UI, for reviewing the design. Needs the demo server (pnpm demo in
// server/) and the web UI (pnpm dev here) running, and Google Chrome installed.
//   pnpm screenshots <output folder> [light|dark]

import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "screenshots";
const scheme = process.argv[3] === "dark" ? "dark" : "light";
const base = process.env.WEB_URL || "http://localhost:5173";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
for (const [device, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const page = await browser.newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
    const shot = async (name: string, fullPage = true) => {
        // A long-lived request shouldn't stop the run: the picture is what's being checked.
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
        // Vector maps (MapLibre) finish drawing after the network goes quiet.
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${out}/${device}-${name}.png`, fullPage });
    };

    await page.goto(base);
    await shot("sign-in", false);
    await page.fill("input[type=email]", "demo@lawfive.dev");
    await page.fill("input[type=password]", "lawfive-demo");
    await page.click("button.btn-primary");
    await page.waitForSelector(".match-row");
    await shot("matches");
    await page.click(".crew-chip.saved >> nth=0");
    await page.waitForSelector(".ref-popover");
    await shot("referee-popover", false);
    await page.keyboard.press("Escape");
    if (await page.locator(".wx-risk").count()) {
        await page.click(".wx-risk >> nth=0");
        await page.waitForSelector(".wx-popover");
        await shot("weather-popover", false);
        await page.keyboard.press("Escape");
    }
    // Did you know (TIP-1), brought up on its own page: this visit's tip already chosen, and the device prompts out of the way.
    const tipContext = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 2, storageState: await page.context().storageState() });
    const tipPage = await tipContext.newPage();
    await tipPage.addInitScript(() => {
        sessionStorage.setItem("lawfive.tipThisVisit", "mark-pitch");
        localStorage.setItem("lawfive.linkPromptDismissed", "1");
        localStorage.setItem("lawfive.appPromptDismissed", "1");
    });
    await tipPage.goto(base);
    // WEB-32: the tip waits while Get ready shows, so an account still getting ready has none to show.
    await tipPage.locator(".tip-card, .get-ready").first().waitFor();
    if (await tipPage.locator(".tip-card").count()) {
        await tipPage.waitForTimeout(500);
        await tipPage.screenshot({ path: `${out}/${device}-did-you-know.png` });
        await tipPage.click(".tip-card >> text=Show me");
        await tipPage.waitForSelector(".tip-steps");
        await tipPage.waitForTimeout(400);
        await tipPage.screenshot({ path: `${out}/${device}-did-you-know-steps.png` });
    } else {
        console.log(`${device}: no Did you know while Get ready shows (WEB-32); its pictures are left out`);
    }
    await tipContext.close();
    await page.fill("input[type=search]", "twin creeks");
    await shot("matches-search", false);
    await page.fill("input[type=search]", "");
    await page.click("text=Past");
    await page.waitForSelector(".score");
    await shot("matches-past");
    // Importing (IMP-1): the menu beside New match, the drop area, and the check of the CSV example
    // (closed without importing, so the demo data stays as it is for the rest).
    await page.click("button[aria-label='Import and export']");
    await page.waitForSelector(".menu-popover");
    await shot("new-match-menu", false);
    await page.click(".menu-item");
    await page.waitForSelector(".drop-zone");
    await shot("import", false);
    await page.setInputFiles(".drop-zone input[type=file]", new URL("../public/examples/lawfive-matches.csv", import.meta.url).pathname);
    await page.waitForSelector(".import-rows");
    await shot("import-check", false);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/matches/import/columns`);
    await page.waitForSelector(".guide-table");
    await shot("import-columns");
    await page.goto(`${base}/matches?show=past`);
    await page.waitForSelector(".score");
    await page.click(".match-row:has(.score) .match-link");
    await page.waitForSelector(".timeline");
    await shot("match-played");
    await page.goto(`${base}/matches?show=past`);
    await page.click(".match-row:has-text('Rangers') .match-link");
    await page.waitForSelector(".timeline");
    await shot("match-cards");
    await page.goto(`${base}/matches`);
    await page.click(".match-link >> nth=0");
    await page.waitForSelector(".scoreboard");
    await shot("match-upcoming");
    await page.click("text=Edit");
    await page.waitForSelector("form");
    await shot("match-edit");
    await page.click("[aria-label='About Short name']");
    await page.waitForSelector(".info-popover");
    await shot("info-tip", false);
    await page.keyboard.press("Escape");
    // WEB-19: the team color menu, with Custom under the watch's eight.
    await page.click(".colour-button >> nth=0");
    await page.waitForSelector(".colour-popover");
    await shot("colour-menu", false);
    await page.fill(".colour-custom input", "#2a9d8f");
    await shot("colour-menu-custom", false);
    // Back to the team's red, which closes the menu.
    await page.click(".colour-grid [aria-label='Red']");
    const venue = page.getByRole("combobox", { name: "Venue" });
    await venue.click();
    await venue.fill("");
    await page.waitForTimeout(100);
    await venue.pressSequentially("Kezar", { delay: 60 });
    await page.waitForSelector(".picker-popover");
    await shot("picker", false);
    await page.click(".picker-action");
    await page.waitForSelector(".modal");
    await shot("quick-create", false);
    await page.keyboard.press("Escape");
    for (const section of ["venues", "referees", "templates", "competitions"]) {
        await page.goto(`${base}/${section}`);
        await page.waitForSelector(".list-row");
        await page.waitForTimeout(section === "venues" ? 1500 : 0);
        await shot(section);
    }
    await page.click(".list-row >> nth=0");
    await shot("competition-edit");
    // Duplicate referees (DUP-1): the groups, the merge dialog (closed without merging), and a referee's page.
    await page.goto(`${base}/referees/duplicates`);
    await page.waitForSelector(".duplicate-group, .pitch-empty");
    await shot("referee-duplicates");
    if (await page.locator(".duplicate-group").count()) {
        await page.click(".duplicate-group .btn-primary");
        await page.waitForSelector(".merge-modal");
        await shot("referee-merge", false);
        await page.keyboard.press("Escape");
    }
    // Duplicate venues (DUP-7): the groups, and the merge dialog with its pitches (closed without merging).
    await page.goto(`${base}/venues/duplicates`);
    await page.waitForSelector(".duplicate-group, .pitch-empty");
    await shot("venue-duplicates");
    if (await page.locator(".duplicate-group").count()) {
        await page.click(".duplicate-group .btn-primary");
        await page.waitForSelector(".merge-pitches");
        await page.waitForTimeout(300);
        await page.locator(".merge-venues").screenshot({ path: `${out}/${device}-venue-merge.png` });
        await page.keyboard.press("Escape");
    }
    await page.goto(`${base}/referees`);
    await page.click(".list-row:has-text('Sam Rivera')");
    await page.waitForSelector(".figures-slab");
    await shot("referee");
    await page.click("text=Edit");
    await page.waitForSelector("form");
    await shot("referee-edit");
    await page.goto(`${base}/stats`);
    await page.waitForSelector(".stats-body");
    await shot("stats");
    for (const section of ["settings", "settings/licenses", "link", "get-app", "more"]) {
        await page.goto(`${base}/${section}`);
        if (section === "get-app") {
            // APP-15: the sign-in code waits for "I have the app", so it doesn't count down for nobody;
            // on a phone it's a link to open rather than a QR code to scan.
            await page.waitForSelector("text=I have the app");
            await shot("get-app-first");
            await page.click("text=I have the app");
            await page.waitForTimeout(800);
        } else {
            await page.waitForSelector(section === "link" ? ".code-input" : section === "more" ? ".list-row" : ".settings-row");
        }
        await shot(section.replace("/", "-"));
    }
    // WEB-33: API keys are under For developers, folded until it's linked to.
    await page.goto(`${base}/settings#developers`);
    await page.click("text=New key");
    await page.waitForSelector(".key-modal");
    await page.fill(".key-modal input", `Screenshots ${device}`);
    await page.getByLabel("Matches: Read and write").check();
    await page.getByLabel("Venues: Read", { exact: true }).check();
    await shot("api-key-new", false);
    await page.click("text=Make key");
    await page.waitForSelector(".key-reveal");
    await shot("api-key-made", false);
    await page.click("text=Done");
    await page.waitForSelector(`.list-row:has-text('Screenshots ${device}')`);
    await shot("settings-keys");
    // Delete it again, so repeated runs don't fill the account's keys.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.click(`.list-row:has-text('Screenshots ${device}') >> text=Delete`);
    await page.waitForSelector(`.list-row:has-text('Screenshots ${device}')`, { state: "detached" });
    // The calendar feed (CAL-1), turned on by the first run.
    await page.goto(`${base}/settings`);
    await page.waitForSelector(".settings-row");
    if (await page.locator("button:text-is('Turn on')").count()) {
        await page.click("button:text-is('Turn on')");
    }
    await page.waitForSelector(".calendar-feed");
    // WEB-33: the calendar feed is under Match day.
    await page.locator(".settings-group:has(h3:text-is('Match day'))").screenshot({ path: `${out}/${device}-settings-calendar.png` });
    // Server settings, as an admin (ADM-1): one fixed by the environment, the rest changeable.
    await page.goto(`${base}/settings/server`);
    await page.waitForSelector(".form-section");
    await shot("server-settings");
    // Try a match (DEMO): kicked off, then a team's controls.
    await page.goto(`${base}/try`);
    await page.waitForSelector(".try-watch");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await shot("try-match");
    await page.keyboard.press("ArrowUp");
    await shot("try-match-menu", false);
    // People, as an admin (USR-1): waiting accounts, invitations, members; and inviting someone.
    await page.goto(`${base}/people`);
    await page.waitForSelector(".person-row");
    await shot("people");
    await page.click(".page-head >> text=Invite someone");
    await page.waitForSelector(".key-modal");
    await page.getByLabel("Name optional").fill("Casey Morgan");
    await page.getByLabel("Email optional").fill(`casey.${device}.${Date.now()}@example.com`);
    await shot("invite-new", false);
    await page.click(".key-modal button[type=submit]");
    await page.waitForSelector(".key-reveal");
    await shot("invite-made", false);
    const link = await page.locator(".key-reveal code").textContent();
    await page.click("text=Done");
    // Signed out: the invitation page, sign-up with approval, and waiting for it (USR-3, USR-4).
    const visitor = await browser.newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 2 });
    await visitor.goto(link!.replace(/^https?:\/\/[^/]+/, base));
    await visitor.waitForSelector("form");
    await visitor.screenshot({ path: `${out}/${device}-invite-page.png` });
    await visitor.goto(base);
    await visitor.click("text=Create an account");
    await visitor.screenshot({ path: `${out}/${device}-sign-up.png` });
    await visitor.fill("input[autocomplete=name]", "Robin Hale");
    await visitor.fill("input[type=email]", `robin.${device}.${Date.now()}@example.com`);
    await visitor.fill("input[type=password]", "screenshots-only");
    await visitor.click("button.btn-primary");
    await visitor.waitForSelector(".waiting-card");
    await visitor.screenshot({ path: `${out}/${device}-waiting.png` });
    await visitor.close();
    await page.goto(`${base}/venues`);
    await page.waitForSelector(".list-row");
    await page.click(".list-row >> nth=0");
    await page.waitForSelector(".match-list");
    await page.waitForTimeout(1500);
    await shot("venue");
    await page.click("text=Edit");
    await page.waitForSelector(".map-pin");
    await page.waitForTimeout(1500);
    await shot("venue-edit");
    await page.close();
}
await browser.close();
console.log(`Screenshots in ${out}`);
