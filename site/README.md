# LawFive marketing site

The public site at [lawfive.app](https://lawfive.app), which links to the docs at [lawfive.dev](https://lawfive.dev). Static, hand-written HTML, CSS and pictures, separate from the web app and not part of the self-hosted server. Behavior is in [docs/requirements/marketing-site.md](../docs/requirements/marketing-site.md).

## Run it

```sh
cd web && pnpm build:site                             # the playable parts, into site/public/play/
cd .. && python3 -m http.server --directory site/public   # any static server works
```

Without the build, the pages still work and show pictures where the playable parts go.

## Pages

| Page | What it's for |
|---|---|
| `index.html` | The home page: what LawFive is, its features, a closer look at a few, its screens, and cards for the pages below. |
| `watch.html` | On the watch: the clocks, the match screen setup, goals and cards, the toss and ends, extra time, syncing and which watches. |
| `tracks.html` | Where you ran: tracks, heart rate, heatmaps, marking the pitch and the replay. |
| `schedule.html` | Your season: imports and integrations, reminders, the calendar, weather, venues, the crew, fees and stats. |
| `quiz.html` | The Laws quiz, playable. |
| `try.html` | Try a match: the watch in the browser, with the match screen setup under it. |
| `faq.html` | Questions and answers, as `<details>` that open. |
| `privacy.html`, `terms.html`, `delete-account.html` | The legal pages. |
| `support.html` | How to get help, at `lawfive.app/support`, the address given to the app stores. |

Every page shares the header (the stadium board: the L5 mark and LAWFIVE, then Try it, Quiz, FAQ, Docs and Sign in, the current page a tunnel in the grass) and the footer (a strip of the board with the mark). The legal pages and `support.html` keep only the mark and Sign in in the header, with their own four links in the footer.

- The feature pages and FAQ end with the same Find out more cards and invitation: change one, change all.
- Sections link to where each thing is shown in more detail or can be played, by the ids on the feature pages' topics, so renaming an id means updating its links.
- Every link to lawfive.dev carries the `ext-icon` arrow and its hidden words.
- The pages say only what's built. When a feature changes or reaches another platform, update the page that describes it.
- The Garmin watches listed on `watch.html` and in the FAQ follow `watch-garmin/manifest.xml`.

## Playable parts

The quiz on `quiz.html`, the match screen setup on `watch.html`, Try a match on `try.html` and the replay on `tracks.html` are the website's own components. Each page marks the spot with `<div class="play-part" data-lawfive="quiz">` (or `setup`, `try`, `replay`), with a picture or clip inside, and loads `play/site.js`. The code is in `web/src/site/`, built by `pnpm build:site` in `web/` into `public/play/`, which git ignores. A part loads as it nears the screen and takes its picture's place. With JavaScript on, the picture waits hidden for 1.5 seconds (`play-wait` in `styles.css`), so a part that loads in time replaces it unseen. A change to the quiz, the match screen setup, Try a match or the track section on the website changes the site at its next build, so check both.

- **Styles:** the website's stylesheet (`web/src/styles.css`), scoped at build to the part's element (`vite.site.config.ts`) so it can't touch the site's. `web/src/site/site.css` adds the little a part needs on the site's grass. The site's rules that share a name or element with the website's (`.btn`, `.chip`, `.halfway`, `h1`, `p` and so on) carry `:where(:not([data-lawfive] *))`, so they stop at a part's edge. The site's own rules for the parts are at the end of `styles.css`.
- **Fonts:** the site's own (`public/fonts/`, Latin only, from the website's Fontsource packages: Barlow 400 to 700, Barlow Condensed 600 to 900 and 700 to 900 italic, JetBrains Mono 400 and 700), declared in `styles.css`; the parts bring none.
- **The made-up replay:** a match on the North Meadow in Central Park, New York (a public park's pitch, never anyone's home or a club's ground), made in the browser by `schema/src/demoTrack.ts`, the server demo's generator, on OpenFreeMap's map.
- **Content security policy:** `_headers` allows only the site's own scripts and styles (the build keeps CSS in files and inlines no fonts) and OpenFreeMap's tiles.

## Look

It follows [DESIGN.md](../DESIGN.md): the website's Pitch & Scoreboard, a little bolder. Every page sits in the pitch frame on the mowing stripes, its hero on the grass with the title in black italic capitals, the eyebrow a tag of the board, and the halfway line under it. Dense words sit on chalk panels; Find out more and the closing invitation are stadium boards. The home page's closer look is the website's slab, styled under its own names (`.look-tab`, `.look-tag`, `.look-face`) so the site's rules can't reach a playable part's `.slab`. Dark mode is the night match and follows the visitor's system. Icons are Phosphor's, inline.

- `public/styles.css` keeps its own copy of the web app's color tokens (`web/src/styles.css`): change both.
- The L5 mark is inline in the header and footer (from `web/src/logo.ts`). `favicon.ico`, `icon.svg` and `apple-touch-icon.png` are copies of the website's, made by `pnpm icons` in `web/`: copy them again when the mark changes.
- **Carousels:** under 600 px, anything marked `data-carousel` in `index.html` becomes a row to swipe, in `styles.css`; `public/carousel.js` adds the square dots. The closer look stays stacked.

## Legal pages

`privacy.html`, `terms.html` and `delete-account.html` are drafts awaiting legal review: remove the draft banner, fill in the [brackets] and remove `noindex` before they count. If what LawFive collects changes, change `privacy.html` and each store's privacy answers with it.

## Pictures

All from made-up data, in `public/images/`.

- **Web:** with the demo running (`pnpm demo` in `server/`, `pnpm dev` in `web/`), `pnpm site-screenshots` in `web/`, or `pnpm site-screenshots match-screen quiz` for just those (names are the files' middle part: `matches`, `match`, `stats`, `match-screen`, `quiz`). The quiz's question is random, so light and dark differ.
- **Try a match** (`web-try-<light|dark>.jpg`, the stand-in on `try.html`): the site served locally after `pnpm build:site`, 1180 wide at 2×, on the five-button Garmin with STR chosen and started (the tour at its goal step), the `.try-match` element captured and scaled to 1512 wide.
- **Android** (`phone-<screen>-<light|dark>.jpg`): the app on the `pixel9pro` emulator signed in to the demo, scaled from 1280 × 2856 to 640 × 1428. The status bar is in demo mode (`settings put global sysui_demo_allowed 1`, then the `com.android.systemui.demo` broadcasts for a 9:41 clock, full battery and Wi-Fi, no notifications), with the mobile signal hidden by `settings put secure icon_blacklist mobile` (deleted afterward). Dark with `cmd uimode night yes`. Shots: Matches with the next match open; the match (Strikers U12 v Rovers U12) showing the scoreboard and the whole forecast slab; the venue (Twin Creeks Sports Complex) from At this venue's slab down to its first pitch.
- **iPhone** (`iphone-<screen>-<light|dark>.jpg`): the UI test `Walkthrough/testSitePictures` on the iPhone 17 simulator (`xcodebuild ... -only-testing:LawFiveUITests/Walkthrough/testSitePictures test` in `mobile/ios/`, with `TEST_RUNNER_LAWFIVE_DEMO` set to the demo's address and `TEST_RUNNER_LAWFIVE_SHOTS` to a folder), once each with `xcrun simctl ui <device> appearance light` and `dark`, and the status bar set with `xcrun simctl status_bar <device> override --time 9:41 --batteryState discharging --batteryLevel 100` (cleared afterward). Scaled from 1206 × 2622 to 640 × 1390.
- **Garmin** (`watch-match.jpg`, the running match; `watch-menu.jpg`, New match): the Connect IQ simulator on an `fr965`, whose system menus are black like a real watch's. Use a test copy with a fresh `SIM_TEST_ID` and `homeName`, `homeAlias`, `homeColor`, `awayName`, `awayAlias`, `awayColor` and `trackStoppage=true` set (see `watch-garmin/tools/sim/sim.sh`), cropped to the round screen at 480 square.
- **Wear OS and Apple Watch** (`watch-wear-kickoff.jpg`, `watch-apple-match.jpg`): frames from the AVD `wear6` and a watchOS simulator, with their debug launch options. The emulator's clock and the Apple Watch simulator's "no phone" icon are painted out.
- **Notification:** not a screenshot. The weather warning on the home page and `schedule.html` is HTML and CSS (`.notify` in `styles.css`, the same markup on both pages): change both together.

## Clips

In `public/video/`, each with a first picture in `public/images/clip-*.jpg`, all made-up data. `public/video.js` plays them only while on screen, and not for anyone who asks for less motion. Keep each small: silent H.264 with `-movflags +faststart`.

- **Kickoff direction:** `adb shell screenrecord` on `wear6` with no window, turning its compass by stepping `adb emu sensor set magnetic-field` (which needs `adb emu sensor set acceleration 0:0:9.8` too).
- **Mark the pitch:** `screencapture -l` of the Connect IQ simulator's window, from a throwaway copy of the app (`sim_testcopy`) changed to open on the screen and step through the corners by itself.
- **Match replay:** the site served locally after `pnpm build:site`: the replay on `tracks.html`, its Where you went card from its top to the foot of the replay's controls, 1180 wide at 1.25×, playing the first half at 120×, captured frame by frame for 24 seconds in light and dark, joined with their real timings and scaled to 654 wide.

## Deploying

Cloudflare Pages, connected to the GitHub repo, so each push to `main` deploys it. Set up once (Workers & Pages → Create → Pages → Connect to Git):

- **Production branch:** `main`
- **Framework preset:** None
- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @lawfive/web build:site`
- **Build output directory:** `site/public`
- **Environment variable:** `NODE_VERSION` = `24`

Then add `lawfive.app` under Custom domains. `public/_headers` sets the response headers and how long fonts and images are cached.
