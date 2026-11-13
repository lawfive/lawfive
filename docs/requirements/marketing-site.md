# Marketing site (SITE)

The marketing site at lawfive.app, with its feature pages, playable parts and legal pages, and the look of the docs at lawfive.dev. Neither is part of the self-hosted server. The site is hand-written HTML and CSS in [site/](../../site/), deployed by Cloudflare Pages from `main`.

## The site

- **SITE-1** A static site at `lawfive.app`, separate from the web app: a home page of what LawFive is, its features and its screens, with the feature pages and FAQ of SITE-8. It follows the system's light or dark setting and works at phone width.
- **SITE-4** It says "referees" and "matches" throughout, and "soccer" and "football" where it says who it's for.
- **SITE-3** **Signing up.** The site offers **Create an account** (`app.lawfive.app/signup`) and **Sign in** (`app.lawfive.app`). The home page, FAQ, support page and terms say new accounts are approved by hand while LawFive is in testing, as the hosted service's sign-up is set to approval (USR-2); its email is set in the web app, so admins hear of new accounts and people hear when they're approved.
  - The Android and Garmin apps are described as on their way to their stores, and the iPhone, Wear OS and Apple Watch apps as in early testing, with no store badges until they're listed.
- **SITE-2** Its screenshots and clips are captures of made-up data, from the web app (`pnpm site-screenshots` in `web/`), the phone apps and the watches, in light and dark except the watches. The page says they're sample data.

## What it shows

- **SITE-6** **The home page shows**:
  - the phone apps on Android and iPhone, notifications included;
  - the watch apps on Garmin, Wear OS and Apple Watch, each with its state (in testing or early testing);
  - a closer look at kickoff direction (PRE-8), marking the pitch's corners (TRK-13), the match screen setup (UI-27), match replay (TRK-10), weather warnings (WX-3, PUSH-5) and the Laws quiz (QUIZ-1 to QUIZ-5), each saying which devices have it;
  - a **Find out more** row of cards for the feature pages and FAQ (SITE-8);
  - links to the docs at lawfive.dev, in the header, the footer and a section for self-hosters and developers.

  Silent clips recorded from the apps and emulators with made-up data show the first three. They play only while on screen, and not by themselves for anyone who's asked for less motion.
- **SITE-8** **Feature pages and a FAQ**, each its own page with the same header (Try it, Quiz, FAQ, Docs and Sign in; Docs left out on phones, and FAQ too on the narrowest), a short hero, then topics, each with its words and, where there is one, a picture or clip and which devices have it; then the cards for the other pages and the closing invitation. Every page's footer links them all. They say only what's built, with each platform's state as on the home page (SITE-3).
  - **On the watch** (`watch.html`): the clocks, the match screen setup, goals and cards, kickoff, the toss and the ends, extra time and penalties, syncing, and which watches.
  - **Where you ran** (`tracks.html`): the figures, marking the pitch, heatmaps, the replay and activity files.
  - **Your season** (`schedule.html`): imports and integrations, reminders, the calendar feed and directions, the weather, venues and the crew, fees, reports, stats and taking your data.
  - **The Laws quiz** (`quiz.html`) and **Try a match** (`try.html`, SITE-9).
  - **Questions** (`faq.html`): getting started, watches and phones, your matches and data, and running your own, as questions that open, linking to the pages that say more. Its contact link goes to support@lawfive.app.
- **SITE-10** **Links between sections.** Each feature card, closer look and topic with more detail elsewhere, or something to play, links to it with a short link and a caret: the replay (`tracks.html#replay`), Try a match, the quiz, the match screen setup (`watch.html#setup`), and the sections of `watch.html`, `tracks.html` and `schedule.html`. The hero offers "Or try a match". **Links to the docs** at lawfive.dev (in the header, the footer, the buttons and the FAQ) carry an arrow up and out, and tell a screen reader they go to the docs.
- **SITE-7** **On a phone**, the feature cards, the watches, each phone's screens and the website's screens become rows to swipe, snapping to each with the next peeking in, with dots to tap under each. Nothing moves by itself. The closer look stays stacked, and wider screens keep their grids. It still swipes without the script.

## Playable on the site

- **SITE-9** **Four parts are playable**, built from the website's own components (`web/src/site/`, by `pnpm build:site` in `web/` into `site/public/play/`, which Cloudflare Pages builds and git ignores):
  - **The whole quiz** on `quiz.html`, beside a column of its four short cards on a computer (QUIZ-2 to QUIZ-5), with the active questions copied in at build, nothing saved, and "Track your matches too" at the end.
  - **The match screen setup** on `watch.html` (UI-27): its steps and pictures, ending in Try it on the watch, with Sign in to use it.
  - **Try a match** on `try.html` (DEMO-1): a made-up match with the visitor's match screen and the setup under it, a change showing from the next match. **Change** beside the watch goes down to the setup, and its **New match with it** comes back up.
  - **The match replay** on `tracks.html` (TRK-10): the website's track section, read-only, with its figures, heart rate and heatmap, for a made-up match on the North Meadow in Central Park, New York, from the demo's track generator (`schema/src/demoTrack.ts`), on OpenFreeMap's map.

  The visitor's match screen is kept in their browser between pages; nothing leaves it. Each part loads as it nears the screen, in place of its picture or clip, which stays without JavaScript or without the build. With JavaScript on, the picture waits hidden for a moment, so a part that loads in time replaces it unseen. The parts take the website's own look (WEB-24), their styles scoped to the part so they can't touch the site's, and the site's rules kept out of them; the fonts are the site's. The content security policy allows only the site's own scripts and styles, and OpenFreeMap's tiles.

## Legal and support pages

- **SITE-5** **Privacy, terms and account deletion**: `lawfive.app/privacy`, `/terms` and `/delete-account`, linked from the site's footer.
  - They cover the hosted service. Someone else's server is theirs to answer for, apart from notifications, which pass through the project's relay and Firebase from any server (PUSH-2).
  - The privacy policy and terms are drafts awaiting legal review, marked so on the page; their effective date goes in on the day they go final.
  - On the hosted service, the sign-up and invitation forms link to them, as do Settings → About on the website and phones. A self-hosted server doesn't show them.
  - The publisher is a sole proprietor in California, doing business as LawFive, with no street address; privacy@lawfive.app is the contact. The terms name the Apache License 2.0 and are governed by California law. Liability is capped at the greater of what someone paid in the last 12 months or US$50. There's 30 days' notice before a shutdown, and at least 30 days' email notice before a free account's limits (such as storage) change.
  - The minimum age is 16 everywhere, with a parent's or guardian's permission under 18. The terms' Acceptable use and the privacy policy's Young referees say no personal information may identify anyone under 16 (names, photos, contact details); team names, age groups and shirt numbers are fine.
  - The privacy policy names injuries among the match details, and says data is kept in the United States, so people elsewhere send it there when they use LawFive. It names the companies that run the hosted service, keep its encrypted backups and send its account email. Account email covers notice of changes to a plan, the service, the terms or the policy, and there's no marketing without asking.
  - The privacy policy and the deletion page say backups and server logs are kept 30 days, and they are.
- **SITE-11** **A support page**, `lawfive.app/support`, linked from every page's footer and given to the stores as the support address. It says to write to support@lawfive.app and what to put in the message; answers the common questions (signing in, invitations, watches, TestFlight feedback); points to Download everything, the deletion page and privacy@lawfive.app; sends people on someone else's server to its owner and self-hosters to lawfive.dev; and asks for security problems by email, not in public.
- **SITE-14** **A permissions page**, `lawfive.app/permissions`, linked from every page's footer, the privacy policy, the FAQ and lawfive.dev's pages on the phone and watch apps, and given to the stores' reviewers. For each app in turn (Android, iPhone, Garmin, Wear OS, Apple Watch) it lists every permission the app asks for, by the name the phone or watch shows: what LawFive uses it for, when it's asked, and what still works if the answer is no. Those the system grants without asking, and those a library lists that LawFive never asks for, are named too, briefly. Each entry carries the system's identifiers for the stores' reviewers.
  - It's kept in step with the apps: a permission added to or removed from any app changes the page in the same piece of work, and the root tests fail when an app's manifest or Info.plist declares a permission the page doesn't name, or the page names one the app doesn't declare (apart from a short list of known reasons, such as permissions libraries add).

## The look

- **SITE-13** **lawfive.app in the website's look** (WEB-24) **and logo** (WEB-25), Pitch & Scoreboard, bolder than the app, like a ground on match day. [DESIGN.md](../../DESIGN.md) has the details.
  - The **stadium board across the top** at every width (the L5 mark beside LAWFIVE, FIVE in mint; the links in condensed capitals, the page you're on a tunnel onto the pitch), and a strip of the board along the foot with the mark.
  - Every page on the **mowing stripes inside the pitch frame**, its hero on the grass (the eyebrow a tag of the board, the title in Barlow Condensed black italic capitals, offset) with the **halfway line** and center spot under it. On the home page the screens stand on a chalk center circle.
  - **Chalk panels** hold the dense words (What it does, the feature pages' topics, the questions, the legal and support pages' text, with the title on the grass). **Stadium boards** hold Find out more and the closing invitation, and the closer look is the website's slabs (WEB-28). Screens are framed in the board's black.
  - The weather warning is drawn in the site's own look rather than shot on a phone: the forecast checked each day before kickoff, the day a risk appears, and the notification as a LawFive card with the mark, the warning and Directions.
  - A night match in dark mode. The favicon and home-screen icon are the website's.
  - The privacy policy and terms keep their words to the letter.
- **SITE-12** **The docs at lawfive.dev in the website's look** (WEB-24, WEB-25), kept calm for long reading:
  - The **stadium board across the top**, with the L5 mark, DOCS as a small label, search, the GitHub link and the light, dark and auto switch.
  - The **sidebar on the grass**, its groups in black italic capitals in chalk; the current page a chalk tab running into the page on a computer, and a chalk slab in the phone's menu.
  - The words on a **chalk panel** (a dark slab at a night match), with no stripes or green behind them. Titles and `h2`s in Barlow Condensed black italic capitals, `h3`s in Barlow Condensed extra-bold in ordinary case, body text in Barlow, code in JetBrains Mono.
  - Tables with the board's small labels over a heavy rule and hairlines between rows. Code blocks are wells in LawFive's colors (keywords pitch green, strings blue, numbers amber, never the cards' yellow or red), a terminal's title bar a strip of the board. Notices are soft panels in amber, blue, red or pitch green.
  - Only the home page's hero (and the 404 page's) is on the grass, with the halfway line and center circle beside it on a computer, the mark inside.
  - The favicon and icons are the website's, and the phone's bars take the board. Phosphor icons only. Every text color is 4.5:1 or more on its background, in light and dark.

## Status

Everything above is built, with every page of lawfive.app and lawfive.dev checked from phone to desktop widths in light and dark.

The permissions page's (SITE-14) Garmin entries use Garmin's names for the permissions, still to be checked against what the Connect IQ Store shows.

Not built yet:
- Legal review of the privacy policy and terms, and their effective date (SITE-5).
- The support page linked from the apps' About.
