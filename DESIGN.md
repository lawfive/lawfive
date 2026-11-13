# Design

How LawFive looks. The rules come first; the rest describes the design language in place, **Pitch & Scoreboard**, so new work matches it. It covers the web UI, and the sections below say how the [Android app](#android-app), the [iPhone app](#iphone-app), [Wear OS and Apple Watch](#wear-os-and-apple-watch), the [marketing site](#marketing-site) and the docs at lawfive.dev carry it. The watches' running screens keep their own look, apart from the teams, which are kits as on the boards. The Garmin watch app draws with the watch's own fonts; its look is in [docs/requirements/match-screen.md](docs/requirements/match-screen.md).

Where code and this file disagree, fix one of them in the same piece of work. Check visible changes:

- **Web**: `pnpm screenshots` in [web/](web/) (light and dark, desktop and phone).
- **Phones**: the snapshot pictures, every variant of a screen at once from the shared fixtures (each app's README, "Snapshot"): Android at 412 and 320 dp, light and dark, text at 1.0 and 1.3 ([mobile/android/](mobile/android/)); the iPhone's `tools/snapshots.sh` at the iPhone 17's and the SE's size, light and dark, default and largest text ([mobile/ios/](mobile/ios/)). `node tools/snapshot-sheet.mjs` puts them side by side.
- **Flows**, and anything outside a view (the keyboard, a sheet over its page, the status bar): the simulators and emulators, as with the iPhone's `tools/screenshots.sh`.

## Rules

NEVER use generic AI-generated aesthetics:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Cliched color schemes (purple gradients on white or dark backgrounds)
- Predictable layouts and component patterns
- Cookie-cutter design that lacks context-specific character

AVOID using:
- Cliche soccer/football themes (soccer ball/whistle)
- Layout shifts from what the user does. Focusing, typing, hovering or choosing must not move the content around it.
  - Anything that appears in answer (suggestions, tag choices, tips, menus) is a layer over the page (`.chip-layer`, the popovers), not inserted into the flow.
  - A choice that stays shows inside its control (a chosen tag sits in the search box).
  - What loads in place keeps its space with placeholders.
  - The one exception: follow-up fields open directly under the switch that turns them on (`.format-reveal`), since flipping it is asking for them.

DO use:
- Unique fonts chosen for the brand, not defaults
- Cohesive colors and themes grounded in the product's story
- Animations for effects and micro-interactions while respecting prefers-reduced-motion
- Context-specific character in every component
- Use Phosphor icons and do not mix any other icon packs

## Polish

The goal is the best experience a referee could have, not just something that works. Every change should feel finished:

- Start from the person using it: what they're trying to do, where they are (a pitch, in a hurry, gloves, sun, poor signal), and what would confuse them. If it's not clear what's happening, that's a bug.
- Say what's going on. Anything slow or in the background shows it's moving and what it's doing, on every device involved; anything that stops says why and what happens next.
- Don't lose people's work, and don't let them do something by accident that they can't undo.
- Think through the whole of it: empty, loading, long text, failure, no signal, dark mode, phone width, the smallest watch. Then look at it on a screen before calling it done; on the phones, the snapshot pictures show every variant of a screen at once.
- Keep it consistent. The same thing looks and works the same on the web, the phones and the watches, and a change to one considers the others.
- Sweat the small things: alignment, spacing, words, and how it feels to tap. Fix what you notice along the way rather than leaving it for later.

## The story

LawFive is the referee's own record of their matches. Its character comes from what a referee handles and stands on, not from soccer clip art: bold, flat and loud, like a ground on match day.

- **The pitch.** The page is the grass, with wide, quiet mowing stripes. **Chalk lines** give it structure: touchlines frame every page, the halfway line divides it, the center circle holds the figure that matters most, a penalty area frames the next match.
- **The scoreboard.** Match-day figures (kickoffs, scores, countdowns, distances, fees) sit on near-black **stadium boards** in Barlow Condensed black italic. A goal shows the score after it ("2–1"), not a ball.
- **The kits.** Teams are panels in their color, cut on the diagonal where they meet.
- **The cards.** Yellow and red mean cautions and send-offs, and nothing else, drawn as tilted physical cards, never icons.
- **The chalk panel.** Dense content (details, lists, charts, forms) sits on chalk panels.
- **A night match.** Dark mode is the same ground under floodlights: darker grass, dimmed chalk, dark slabs for panels, and a mint second ink.
- **Home first.** The home team is on the left side by side ("Strikers U12 v Rovers U12") and on top when stacked, on every device and in the calendar feed.

## Type

All fonts are bundled through Fontsource (imported in [web/src/main.tsx](web/src/main.tsx)), so a self-hosted server makes no requests to Google or anyone else. Only these weights are loaded; import another there before using it.

| Token | Font | Weights | Used for |
|---|---|---|---|
| `--font` | Barlow | 400, 500, 600, 700 | Text, field labels, list rows, body copy |
| `--display` | Barlow Condensed | 600, 700, 800, 900; 700, 800 and 900 italic | Headings (black italic capitals), board figures, kit names, buttons, chips, the navigation |
| `--mono` | JetBrains Mono | 400, 700 | Code, and the boards' small labels (`h3`s, "NEXT MATCH", a figure's label, the heatmap's key) |

- **Sizes**: body 16px. `h1` 64px black italic capitals (44px on phones); a hero title (`PageHead` with `hero`: Matches, Stats) 112px (72px on phones); the match page's title 46px. `h2` 26px on panels, 46–60px on the grass. `h3` and labels 11.5–13px JetBrains Mono bold capitals, spaced 0.1–0.16em, muted. Board figures run from 34px (a row's fee) to 200px (the next kickoff).
- Barlow Condensed never sets paragraphs. JetBrains Mono is for what's read character by character and the board's short labels, never sentences.
- Numbers that line up (tables, clocks, scores, dates) use `font-variant-numeric: tabular-nums`.
- Italic figures get 0.04–0.06em right padding so the last digit and the offset aren't clipped.

### The hero offset

`--hero-shadow`, `--hero-shadow-big`, `--title-shadow`: on every page's title (`.page-head h1`) and on chalk hero figures directly on the grass, on phones too.

- By day a hard 0.035em offset in dark green (`#06301d`), scaling with the type.
- At night the mint second ink (`#2fae7a`): 5px 4px at 140px and up, 4px 3px for hero figures, 3px 2px for other titles; on phones 3px 2px for hero figures, 2px 2px otherwise.
- Never on boards, kits, panels, section headings or small text.

### Code

Anything code-like is shown as code: API keys and prefixes, the watch link code, calendar and invitation links, server settings and environment variables (`SIGN_UP`), HTTP headers. Wrap it in `<code>` (or `code-text`):

- JetBrains Mono at 0.86em, on a faint tint (`--text` at 7%) with small rounded corners.
- A key or link shown alone, to copy, sits in a `.key-reveal` box (`--surface-2` with a border, Copy beside it), with no tint of its own.
- The large watch-code input is JetBrains Mono at full size, no tint.
- Plain-text places (a hover title, an email's text part) name settings as plain words.

### Email

Mail apps don't load web fonts, so emails ([server/src/mail.ts](server/src/mail.ts)) use the reader's system font with the LawFive green, under a board strip carrying the mark and LAWFIVE as a picture (`server/src/mail-wordmark.png`, drawn at 2x by `pnpm icons` in `web/` and sent inside the email; alt text "LawFive").

## Color

Colors are CSS custom properties on `:root` in [web/src/styles.css](web/src/styles.css), redefined for dark mode under `prefers-color-scheme: dark`. The app follows the system setting, with no switch. Always use the tokens; never write raw colors in components.

**Where something sits sets its colors.** The working tokens (`--text`, `--muted`, `--border`, `--border-input`, `--brand`, `--brand-strong`, `--brand-soft`, `--on-brand`, `--surface`, `--surface-2`, `--field`, the soft and text colors) change with the ground under them, so components need no colors of their own:

- **On the grass** (the default): chalk words, pale green muted words; a primary button is a chalk slab with board-black words; plain buttons, fields and search are chalk outlines; surfaces see-through.
- **On a panel** (`.card`, `.panel`, dialogs, popovers, menus, chips, notices, tiles and the rest listed in styles.css): ink on chalk by day, chalk on a dark slab at night; the brand is pitch green.
- **On a board** (`.board`, the top bar and tab bar, segmented controls, the info tip, a form's Save bar): chalk and white on near black.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--pitch`, `--pitch-stripe` | `#12613e`, `#115e3c` | `#0f2e20`, `#0d291c` | The grass and its mowing stripe (256px bands, edges blended over 120px: `--stripe`, `--stripe-blend`) |
| `--chalk` | `#f4f2e9` | `#e6e9e3` | Words on the grass; the chalk panel |
| `--chalk-line` | `#f4f2e9` | `#b4bdb6` | Pitch markings and rules (3px, `--line`) |
| `--chalk-muted` | `#c4dccd` | `#a6c2b0` | Secondary words on the grass |
| `--board` | `#0b0e0d` | `#121614` (edge `#313c36`) | The stadium board |
| `--on-board`, `--on-board-strong`, `--on-board-muted`, `--on-board-dim` | `#f4f2e9`, `#fff`, `#b6bfba`, `#7f8883` | `#e6e9e3`, `#fff`, `#a7b1ab`, `#7c8580` | Words and figures on the board; dim for the side that lost |
| `--board-dots` | `#1c2420` | `#232c27` | The lit-dot matrix |
| `--board-accent` | `#2fae7a` | same | The board's mint labels ("NEXT MATCH", "FULL TIME") |
| `--panel`, `--panel-2` | `#f4f2e9`, `#e9e7dc` | `#0f1b15`, `#16241d` (edge `#5d6a63`) | Chalk panels; hover and wells on them |
| `--ink`, `--ink-muted` | `#0e1311`, `#4d5650` | `#e6e9e3`, `#a3aea7` | Words on a panel |
| `--ink-border`, `--ink-rule` | `#d6d4c8`, `#0e1311` | `#26332c`, `#7d8a83` | A panel's hairlines; its heavy 3px rules |
| `--ink-input`, `--ink-field` | `#858a82`, `#fbfaf6` | `#6b7872`, `#0b130f` | Around and inside fields on a panel (about 3:1, WCAG 1.4.11) |
| `--ink-brand`, `--ink-brand-strong`, `--ink-brand-soft`, `--ink-on-brand` | `#0b6b47`, `#08573a`, `#dbe8db`, `#fff` | `#2fae7a`, `#5cc999`, `#173a2b`, `#04140d` | Pitch green on a panel: primary buttons, links, your role, focus |
| `--yellow`, `--red` | `#f7c600`, `#d4202a` | same | The cards, and red shapes |
| `--ink-red-text`, `--red-strong` | `#b8232a`, `#b8232a` | `#ff8589`, same | Red as words (errors, danger); behind white words (the one red button) |
| `--ink-amber-soft`, `--ink-amber-text`, `--ink-blue-soft`, `--ink-blue-text`, `--ink-red-soft` | `#f6e8b5`, `#6f5400`, `#dde6ee`, `#1a5699`, `#f6dcd7` | `#3a3214`, `#f0cd5a`, `#172636`, `#8ab8ea`, `#3a1b1c` | Notices and chips: possible risks and waiting (amber), information (blue), likely risks (red) |
| `--kit-blank` | `#3a403d` | same | A team with no color |
| `--contour-ground`, `--contour-1`…`6` | `#12613e`; `#1a6e45` → `#c6e7cb` | `#0e2c1e`; `#133a28` → `#5f9d7b` | The pitch heatmap |
| `--on-yellow` | `#1b1600` | same | Text on `--yellow` (the waiting count badge) |
| `--parking` | `#1d5fa8` | same | The parking pin on venue maps |
| `--coin`, `--coin-edge`, `--coin-ink` | `#d9a92c`, `#8a6508`, `#5f4503` | same | The watch's coin, in a tip's picture |
| `--qr-ink`, `--qr-paper`, `--qr-arc` | `#0c1f18`, `#ffffff`, `#0b6b47` | same | A QR code: dark on white in dark mode too, as scanners expect |

- **Contrast**: every text color is 4.5:1 or more on its real background (chalk on the grass 6.7:1, pale green 5.2:1, ink-muted on chalk 6.8:1, the board's muted words 10:1); 3:1 at 24px and up.
- **Yellow and red** are for cautions and send-offs (and yellow for things waiting on you), never decoration.
- **Gradients** are only functional: the half-yellow, half-red second caution, the striped "no color" swatch, the mowing stripes and the panels' corner arcs.
- **The phone's own bars** take `--board` in light and dark: the `theme-color` tags in [web/index.html](web/index.html), the manifest's colors and the icons' board (`boardColors` in `web/src/logo.ts`) can't read the tokens, so change them with `--board`.

### The L5 mark

A heavy italic L and a 5 with a darker fold at its foot, drawn as shapes in [web/src/logo.ts](web/src/logo.ts). Every other copy is drawn from it.

- **`LogoMark`** takes its colors from where it sits: chalk L and mint 5 on the board, all chalk on the grass, ink and pitch green on a panel (chalk and mint at night).
- **The top board**: the mark beside LAWFIVE in Barlow Condensed black italic, FIVE in mint.
- **The lockup** (`Logo`), for large places (sign-in, the setup wizard, the shared match page): the mark beside LAWFIVE with a tapered line in the 5's color under it.
- **Icons**: the favicon and home-screen icons are the mark on the board, the same in light and dark, the fold left out under 24px (`pnpm icons` in `web/`, which also draws the Garmin's: the mark alone in the board's colors on a transparent square). lawfive.app and lawfive.dev use copies. The phones' and their watches' icons come from `mobile/android/tools/logo.mts` and `mobile/ios/tools/logo.mts`.

### Team colors

- The watch's eight (black, white, red, orange, yellow, green, blue, purple; `teamColours` in [web/src/format.ts](web/src/format.ts)) or any **Custom** color; text on them black or white by contrast (`textOn`).
- The web's `ColourMenu`: the eight as a 4×2 grid, a Custom row opening the browser's picker (a hue wheel until chosen, then the color with its hex in mono), then No color. The phones: the eight in a menu, then Custom… under a divider.

### Chart palettes

In styles.css, each checked for color-blind separation and contrast in both modes. Values are always written, never only colored.

- **Speed bands** (`--speed-1`…`5`): a green ramp; on the board, the night ramp by day too.
- **Heart-rate zones** (`--zone-1`…`5`, line `--hr-line`): an orange ramp; on the board, the night ramp.
- **Roles, genders and fees**: chalk (referee, male, paid), mint (assistant and AR1, female, owed), deep mint (`--role-ar2`), gray (`--role-fourth`: fourth official, co-ed), dark gray for none (`--role-none`). The phones have them in `Theme.kt` and `Theme.swift` (`roleAr2`, `roleFourth`, `roleNone`).
- **Busiest times** (`--heat-1`…`6`): grass green to pale mint, day and night; chalk figures on the first three, board-black on the rest.
- **Heatmap**: `--contour-*`.

## Icons

Every icon is [Phosphor](https://phosphoricons.com), regular weight, through `Icon` in [web/src/components/ui.tsx](web/src/components/ui.tsx). Pages name an icon by what it's for (`<Icon name="venues" />`); the mapping to Phosphor lives there. To add an icon, add a name there.

- No other packs, no hand-drawn icons, no characters standing in for icons (×, ⓘ). Native selects' arrow is Phosphor's caret-down, in CSS.
- No soccer balls or whistles, even though Phosphor has a ball.
- **Sizes**: 19px on the board's tabs, 22px in the phone's tab bar, 18px in buttons, 16–18px inline and in avatars; larger only as an illustration.
- **One icon per meaning** across web and phones: Directions is always the navigation arrow (`directions`), never the folded map or a pin, which are for the app's own maps. Call is the handset (`call`); `phone` is the phone apps' device.
- Icons are `currentColor`, never a color of their own, except weather: in [Weather.tsx](web/src/components/Weather.tsx) a clear day's sun and a storm are `--weather-amber` (`#b77d00` light, `#e8a317` dark).
- Brand logos (Apple, Google, Google Play, Outlook) are Phosphor's, only on buttons that open that company's app or store.
- **Not icons**: the cards (`CardShape`, `.card-icon`), kits (`KitPanels`), pitch markings, team badges, and the logo.
- Android's notification icon is the L5 mark (`ic_notification`), accented in `--ink-brand`.

## Shape and surface

- **The pitch frame** (`.pitch-frame` in `Layout`): a 3px chalk rectangle with a quarter circle at each corner, up to 1240px wide with 44px inside (28px under 960px). On phones it's 8px from the screen's edges, the words 21px in.
- **Boards** (`.board`): near black, 6px corners, a deep drop shadow by day, a 1px lighter edge at night. Rows divide by `--board-rule`, not gaps.
- **Panels** (`.card`, `.panel`): chalk (a dark slab with a 1px edge at night), 6px corners (`--radius`), a hard 3px drop by day. `.corner-arcs` adds the pitch's quarter circles in brand green. Rows divide by 1px hairlines; hover is `--surface-2`; figures across a panel's top sit between heavy 3px rules.
- **Radius**: 6px for every surface (boards, panels, buttons, fields, segmented controls, notices, dialogs, popovers, menus, photos, tiles); 4px for chips, kit badges, tile rows, menu items and the board's tabs (top only); round for avatars and the timeline's minute. No other radii.
- **Lines**: chalk markings 3px (`--line`); fields and buttons 2px (3px for the next match's large buttons); hairlines 1px.
- **Focus**: inputs get a `--brand` border and a 3px `--brand-soft` ring; other controls a 2–3px brand outline.

## Components

In styles.css and ui.tsx. The phones have the same components under the same names unless their sections say otherwise.

### Page head

`PageHead`: an optional back link (a caret and the parent in condensed capitals; a record as "Match · Strikers U12 v Rovers U12", one line cut with …), the `h1`, a muted line, actions at the right.

- `hero` (Matches, Stats) adds the hero offset. Top-level pages have the hero title; over eight letters it steps down to 52px on phones.
- It names the browser tab, page first: "Champion Stadium · LawFive" (a match adds its short date), from its heading or `tab`.

### Buttons

- **`.btn`**: 40px high, Barlow Condensed extra-bold capitals, an icon before the label. Default is a 2px outline in the field color.
- **`btn-primary`**: a brand slab with a hard 3px board-black drop. Also `btn-ghost` and `btn-danger` (red words).
- **`btn-danger-solid`**: the one red button that does it, in a dialog listing what goes, unavailable until it can be done.
- **`.split-button`**: a caret beside the main action opens a `.menu-popover` (items with an icon, a bold label and a muted line).
- Busy buttons say what they're doing ("Saving…").
- **`ContactButtons`**: Call, Text and Email as a `.button-group`, joined by 1px hairlines, outer corners round, icons in `--brand-strong`. `icons-only` (40px wide) at a row's right; in a popover, three equal buttons with 15px words that shrink to its width.

### Chips and badges

- **`.chip`**: 4px corners, Barlow Condensed bold capitals, always panel-colored so they read on the grass. `chip-brand` (a green slab), `chip-amber`, `chip-red`, `chip-blue`. Risk badges are chips.
- **Crew chips**: your role in green with a small "you", in its place among Referee, AR1, AR2, 4th.
- **Tags**: choices and suggestions show in `.chip-layer` under the search or tag box; suggested tags with a plus; values typed before (`SuggestInput`) as plain chips.
- **Team badge**: the short name in Barlow Condensed extra-bold italic on its color; small, normal, large.
- **Count badge**: yellow, for things waiting on you.
- **Info tip**: Phosphor's info icon beside a label; tapping opens a board-colored popover.

### Kits

`KitPanels`: the two teams on a board, home on the left.

- Each a panel in its color (`--kit-blank` with none), the name in black italic capitals in black or white (`textOn`).
- Cut on the diagonal where they meet: 24px (34px large, 14–18px small).
- Each kit is a container; its name is never larger than 22% of the panel's width, so a long word steps down rather than breaking.
- `labels` adds HOME and AWAY in mono. Something can sit between them (the score, the kickoff).

### Board pieces and pitch lines

- **`.board-head`** (mint `.board-label` left, muted right) and **`.board-foot`**: small labels.
- **`.dots`**: the lit-dot matrix behind the biggest figures. On a scoreboard before kickoff it runs edge to edge behind the kits; on phones, behind the time alone.
- **`Halfway`**: touchline to touchline with its center spot.
- **`CentreCircle`**: a chalk circle (up to 340px) around a page's main figure; `line` runs the halfway line out from it.
- **`.penalty-area`**: a box open to its touchline, with its arc on the far side.
- **`Pitch`** (`.pitch-empty`): the faint circle and halfway line behind an empty list inside a card, in brand green at 0.08 (0.1 dark), the line stopping at the circle. Each line draws in once, so the circle has no seam.

### Card shapes

`CardShape`: yellow, red, or the half-and-half second caution, tilted as if just shown.

- Small (11×15px, 13×18px in a row) beside counts; large 30×40px; `huge` 104×144px (82×112px on phones, 64×88px on the narrowest) with a real shadow. On the timeline (`.card-icon`) 30×42px.
- **Sin bin**: the yellow card with Phosphor HourglassMedium in `--on-yellow` (`SinBinCard`; `CardShape`'s SinBin on Android, sinBin on the iPhone). A second sin bin is the half-and-half card (with a small hourglass in its yellow corner on the web and Android).
- **On the replay's scrubber** (too small for the hourglass): a goal is a round dot in the team's color ringed in the text color, a card an upright rectangle, so shape tells them apart. A sin bin is the yellow mark with an `--on-yellow` band; a second sin bin's is red.

### Slab

`Slab` in [web/src/components/Slab.tsx](web/src/components/Slab.tsx): a section as a broadcast's caption over its graphic. `<Slab title tag? icon? ground? cut? table? level? id? className?>`.

- **Title tab**: chalk with board-black words, black italic capitals at 28px (22px on phones), its right edge cut on the diagonal (18px), overlapping the slab's top-left corner (10px left, half its height over the top), an optional icon.
- **Tag**: a mint mono tag beside it, cut on both sides, saying what's counted as a caption ("Counted in games", "Playing time only"), never a lone noun. No tag on a record's figures before a first match.
- **`ground`**: `"board"` (default); `"panel"`, a chalk panel with corner arcs for dense lists, its tab then a board strip; `"grass"`, the tab alone over the grass.
- **`cut`**: cuts the right edge too (44px, 26px on phones), for figures. It clips, so not for anything with tips or menus.
- **`table`**: the numbers behind a small outlined **Data table** button (Hide data table when open; 44px high on touch screens).
- **`level`**: the heading as an `h3`. The tab is the section's heading, so the page outline holds.
- **Inside**: `.slab-label` (mint mono, pitch green on a panel), `.slab-figure` (`big`, `huge`, the unit small beside it), `.slab-caption`, `.slab-note`, `SlabFigure`, `figureAndUnit`. A slab is a container, so its graphics size to it. At night it keeps its thin edge round the cut (`--slab-drop`).
- **Used for**: Stats; a match's track and weather; At this venue and Working together; the quiz's Your score and By Law; lawfive.app's closer look (in the site's own copy). The phones use it in the same places.
- **Not for**: forms, settings, lists, long text, the match list and next match, and panels holding a map, a replay, a chart or a table.

### Rows and tiles

- **Facts** (`dl.facts`, `Fact`): cells divided by hairlines on a panel, each a muted icon, a small mono label and the value.
- **Tile rows** (`.tile-rows`): on the grass, 8px apart, at least 60px high, 4px corners. A 64px board tile with what identifies the row in black italic (REF, AR1; a pitch's number), then a chalk panel with the name (18px extra-bold) and a muted line. At night the tile has a 1px edge.
- **Choice tiles** (`.quiz-level`, `.quiz-count`, `.scheme`): outlined on the panel, names in black italic; the chosen one lit on the board with a hard drop (a mint edge at night). Step progress bars are square segments.
- **List rows**: an avatar, a title, a muted line, meta at the right (under the text on phones).
- **Segmented control**: the board's, the chosen option a chalk slab. **Search**: a 2px outline.
- **Avatars** (`.avatar`): round initials in condensed capitals on near black; a record's icon on a board tile; yellow for someone waiting, pitch green for you. A referee's first photo is their avatar (`RefereeAvatar`).

### Headings

- **A group's label** (`h3` on the grass: Settings' groups, People's lists): black italic capitals at 30px (26px on phones) in chalk, a faint 3px chalk line running on, any action at the right.
- A page's sections on the grass (Events, Officials, Pitches) are `h2`s at 46px. A section inside a form keeps small mono capitals.
- **A panel's heading** (`.card-title`, a form section's `h2`): black italic at 26px in ink; on a board, the mint label.

### Officials line

`OfficialsLine`: the crew on one muted line, Referee, AR1, AR2, 4th, each role in small capitals (11px bold, spaced 0.06em) then a surname (or **Shown as**, or a name as typed), "you" in semibold brand-strong, middle dots between, cut with an ellipsis. On the next match and the phones' rows, where chips would wrap; the web's match rows use crew chips.

### Loading and empty

- **Placeholders** (WEB-8): faint shapes (`.placeholder-bar`, `--text` at 8%) laid out like what's coming, inside the real cards. `.sweep` passes a faint green band across, staggered by `--i`. `.placeholder-appear` shows them only after 0.3s. Maps show `MapPlaceholder` until their tiles draw.
- **`Loading`**, everywhere else: a small pitch (76px; 30px `inline`) marked out over and over in `--brand` at 35%, each line 150ms after the last, centered where the content will be, after 0.3s.
- **`EmptyList`** on the grass: the message inside a center circle in chalk at 70%, sized to hold it (at least 500px high on a computer, 400px on a phone), the halfway line running out to the touchlines and stopping at it. A black italic title, chalk words, Add as the chalk slab. The quiz's result sits the same way.
- **Inside a panel**, a picture (`EmptyPictures`; `EmptyPicture` on the phones, same coordinates) at about 45% brand green over the faint pitch, then a title, one muted line and a button. Pictures: none for matches, a pitch with a pin for venues, the diagonal system for referees, a bracket for competitions, a bar for templates.
- A search that finds nothing is plain muted words.

### Photos

- **`Photos`**: square thumbnails (6px corners), ending in a dashed **Add photos** tile that turns brand-soft on hover or drag. Uploading shows faded with "Uploading…". A referee's first photo has a "Picture" chip.
- **Viewer**: a near-black stage that keeps its size between photos; round previous and next buttons (and arrow keys); the caption saved on blur; Move to first (Make their picture), Download, Delete.
- **`CropPhoto`**: the frame a 2px white line with heavier corners, the photo outside 55% darker; for a referee's picture, its circle in white dashes. Turn and Reset left, Cancel and Save right.
- **`.drop-zone`**: dashed on `--surface-2` with an icon tile, "Drop a file here" and a primary button; brand-soft with a solid border while a file is over it.

### QR code

`QrCode`: drawn from `uqr`'s modules, rounded, in `--qr-ink` on a white tile in both modes, with four thin corner arcs. The L5 mark sits on a small board tile at the center (`boardColors`). It uses the strongest error correction; check any change by decoding a screenshot.

### Weather slab

`WeatherSlab`: under the scoreboard, a slab (not cut, as it opens popovers), Weather or Forecast, tagged At kickoff.

- The icon and temperature at up to 64px in black italic, the condition under them; feels like, rain and gusts in cells (rows, label beside figure, on a phone).
- Risk badges and Details (a popover with the hours, the risks, the update time and the credit) at the right on a wide screen, along the foot under a rule on a narrow one. The phones' Details open a sheet.
- No forecast yet: one line on the grass between chalk rules (`WeatherStripNote`).

### Pitch heatmap

`PitchHeatmap` (TRK-9): the time on the pitch, painted on the grass, on a board. Always seen from above, never mirrored. Centered, up to 800px; the margin beyond the touchlines is wider than beyond the goal lines, for assistants.

- **Bands**: six, from the grass's green to pale mint (`--contour-1`…`6`; greens only), edged in a thin dark line. From [web/src/contours.ts](web/src/contours.ts) (square root of the time, sampled four times finer, blurred, marching squares at six levels, smoothed); the phones port it, checked against `web/test/contours-case.json`.
- **Markings**: full chalk (70% at night) over a thin dark edge. No 16.5 m marking.
- **Dimensions**: dimension lines with slash ticks along the top and left, in whole meters or yards (`formatPitchSize`).
- **Key**: LESS, the ground and six bands, MORE TIME.
- **The ends**, only with a recorded kickoff direction and never for extra time: a row per way round, goal line to goal line: the team attacking left to right (`TeamBadge`, ArrowRight), the period centered (mono 11px bold, muted: 1ST HALF, P1), ArrowLeft and the other team. Arrows 18px; rows 8px apart.
- A hover tip per cell (not on the phones). On Stats, one per role.
- **On the track map**: a pitch found automatically is dashed; adjusting fills it lightly in brand green with round handles.

### Stats' graphics

`boardCharts.tsx`; chalk and mint on the board.

- **`HeadToHead`**: parts of a whole to scale, meeting on the diagonal.
- **`SlantBars`**: a label, a slanted bar, the value in black italic (label over bar under 480px).
- **`BoardColumns`**: columns with values over them while they fit.
- **`StackedColumns`** (`charts.tsx`): columns of lamps, for more than a year of months.

### Next match

`.next-match`, atop the match list: a board in the penalty area, open to the left touchline.

- The time at 200px on the dots beside the day, sized to what's beside the day so "12:30 PM" fits; on the narrowest board the day goes above. The kits with HOME and AWAY under it.
- A caret (`.next-fold`) folds the board to **the strip**: the time at 34px, the countdown at 28px; two rows under 640px (container query), a step smaller under 340px.
- **Stadium clock** (`.countdown-board`), a board beside it: each unit a lit cell, mint colons, sized to the board (28 to 64px).
- Directions and Open the match are large chalk outlines.
- **`.match-facts`**: large chalk figures with a word under each, between chalk rules.

### Match row

`.match-row`: a board per match, 12px apart, its night edge drawn once over everything so corners stay clean.

- The kickoff cell is wide enough that "12:30 PM" never touches the kits (184px; 164px narrower): the day over the date in small capitals over the time at 42px, the weather under it.
- The kits, the score between them once played (the loser dimmed, a shoot-out small under it).
- A chalk panel: crew chips, the venue, tags; at the right a figure (fee before, distance after), card counts, status chips, risk badges, Fee due.
- Container query: the panel drops under the kits below 820px; below 560px the kickoff runs along the top.
- The list's heading on the grass ("Upcoming", "Past") carries the count. Under Upcoming, **Recent** shows the last three played, then All N past matches as a chalk outline.

### Scoreboard and events

- **`Scoreboard`**: the status in mint; the kits with the score at 136px between them (the loser dimmed), or the kickoff before. On phones each team takes a row.
- **`Events`**: the timeline down a chalk halfway line, home's events left and away's right, the minute in a board-black circle ringed in chalk. A goal is the score after it at 46px (the scorer's side chalk, the rest pale green); a card a tilted card; neutral events muted. Each period a chalk band as wide as the kits; the end on the board ("Full time 3–1").
- A corrected match ends with "Edited after the match", Show as recorded and Put back the watch's.

### A match's page

- **Wide**: scoreboard and weather across; events down the left; The match, officials (tile rows) and photos down the right. **Phone**: The match, events, officials, photos, track.
- **The match**: a chalk panel with corner arcs; kickoff, fee and periods between heavy rules; label-and-value rows (label over value under 400px), the venue first (linked in brand-strong, with Directions).
- **`TrackSection`**: **The running** on a cut slab (the distance huge over a mint bar; top speed, sprints and heart rate in cells); the map, replay and heart rate on panels; **Where on the pitch** on a slab (not cut); Each period on a panel. The same on the shared page and lawfive.app's replay.

### Stats

`Stats.tsx`, `StatsDetail.tsx`: the **broadcast stats package**, every section on a slab with a Data table. Sections rise in once; nothing moves after.

- **Filters** on one board, each with a mint label.
- **Games**: a huge chalk figure on the grass with the hero offset (up to 300px). **By role** beside it (under it under 640px): board tiles with role-colored bars, figures at 60px.
- **Distance** up to 150px and **Cards shown** (the three huge cards rising from a cut slab, counts up to 112px) on cut slabs; **Fees** earned up to 132px, with head-to-head, slant bars and columns.
- **Games a month** is a form guide of lamps in each game's role color; **Most with** a name strap; **the ticker** a still board strip.
- **In detail**, on the halfway line with a small nav: The running, The fixtures and The games. **Your watches** are drawn flat in a real watch's grays with a mint ring for battery used an hour (full at 30%).

### A referee's and a venue's pages

A venue and a referee open on their own page; Edit opens the form, whose back link names the page.

- **`TogetherFigures`** ([History.tsx](web/src/components/History.tsx)): a cut slab, At this venue or Working together, tagged "Since Sep 2026". Mint labels over black italic figures up to 72px with a muted line, in cells divided by board rules (two to a row narrow, an odd last one across); a referee's picture on a board tile before them; See matches → along the foot.
- A venue's map is framed in a 3px chalk line; its pitches are tile rows. Matches together or here are match rows under a 46px heading.
- **The phones** (`TogetherSlab`): two to a row where they fit (stacked under about 280 dp or pt), beside a 72-unit initials tile in `kitBlank`, figures at 52; See matches scrolls down the page.

### Forms

- **The match form**: the kits under the teams as the boards will show them (`.kits-preview`), live. Format beside Kickoff, with a line under it that keeps its place: the format in words, or the age group's starter with Use it.
- **`ResultEdit.tsx`**: opens with the board's scoreboard ("From the goals below"); each goal or card its own small card on `--surface-2` (type, a team switch whose other badge fades, trash, then the fields, wrapping on a phone); a red border and line under one that can't be saved; Add buttons per kind (two to a row on a phone); the shoot-out's kicks; the outcome last.
- **Save**: on the [Save bar](#layout). A Save that can't save says why in red words at the top of the section that needs it, scrolled to (WEB-30).

### Sign-in and setup

- **Sign-in pages** (sign-in, reset, invitation, waiting, setup): the card on the halfway line inside a chalk center circle (620px, or 88% of a phone's width). A page's icon is a board tile with the icon in mint. **Help** under the card, underlined.
- **`Setup.tsx`**: a wider card with the logo, "Step 3 of 7" over the quiz's bar, choices as the quiz's tiles, warnings in amber-soft, Back, Skip the rest and Continue along the foot. Steps slide in like the quiz's.

### Settings

- **Groups**, in order (WEB-33): You, Your watch, Match day, New matches, Units and money, Fitness, Your games coming in, Your data, For developers (folded), About, and Server for admins, each a group label with its action at the right.
- **Index**: sticky on the left (188px, the current one with a 3px chalk bar); under 960px, wrapping chips at the top.
- **Rows**: label and hint left, control right (stacked on phones). A named part of a panel is a mono subhead (`.settings-subhead`); **Advanced** is a fold (`.settings-advanced`); a change waiting is an amber-soft row.
- **Where you're signed in**: this device and the four most recent others, then Show all (n).
- **`ServerSettings.tsx`**: each field saves on its own; addresses in mono (`.setting-input`); one set by the environment is read-only ("Set by `SMTP_URL` on the server"); a secret shows only whether it's set.
- **`Plans.tsx`**: a row per plan with its code in a mono `.plan-code` tag. **`.plan-usage`**: a label, a condensed figure with "of 50" muted, and a thin bar, green, yellow from 80%, red when full. A plan ending within a week shows a brand-soft notice atop every page.

### Get ready, More and getting set up

- **`GetReady.tsx`**: a slab on the grass tagged "N of 5 done", over tile rows; a done step's tile turns pitch green with a check. The next row has the primary button.
- **More**: groups divided by rules, the admins' under a mono ADMIN heading (`moreGroups`, shared with the phones). **Who's signed in** is a board: initials in a chalk circle, the name in black italic, the email, Sign out.
- **Link a watch**: the code typed into a board in chalk mono at 32px, like the watch's screen.
- **`GetApp.tsx`**: numbered steps (brand-soft circles) beside the QR code, a draining clock and the code in mono. **`.store-badge`**s sit side by side while each name fits, dashed and muted while "Coming soon". On a touch screen Open in the app (`.touch-only`) comes first.

### Quiz

`Quiz.tsx`.

- Choices are choice tiles. The running total is a figure over a bar of pieces, brand for right, red for wrong. An answer turns brand-soft or red-soft with a marked circle or square; the rest fade. Steps slide 16 to 20px and fade (`quiz-in`, `.leaving`).
- **Your score**: a cut slab tagged with difficulty and count; the score counts up and pops at up to 150px; a mint bar for the share right; the verdict in black italic; Go again and Change the settings.
- A huge `CardShape` is dealt in beside a low score: the only joke the cards are allowed.
- **By Law** (Weakest first) on a panel slab; What you missed on a panel.
- The phones: the score at 96 (76 narrowest), the card 82 × 112 or 64 × 88.

### Did you know

`DidYouKnow`: a panel under the week's figures: a 64px brand-soft tile with a picture (pitch markings, the coin, two yellow cards, or an icon), small brand capitals, a bold title, a muted line, Got it (ghost) and Show me (a dialog of numbered steps). It only fades in, and never loads beside a device prompt.

### Match screen setup

`MatchScreenSetup.tsx`: the setup wizard's look inside the app.

- Steps as the quiz's bar, each piece named (current semibold, others muted); on phones only the current step is named, the rest kept for screen readers.
- Choices as tiles with a muted example, brand-soft with a brand ring when chosen.
- **`WatchFace`**: the running screen on a round watch and an Apple Watch, drawn as the watches draw them, black in both modes (`--watch-*`: screen, text, dim, rule, track, ring green, stoppage orange, break blue). A "Yours" chip marks linked watches' shapes, which come first.
- Under them: the moments as chips (one swipeable row on phones); Play through (a square play button, a brand-filled scrubber, the position in tabular figures, "2H 67:40"); and **Try it in a match**.

### Try a match

`TryMatch.tsx` (DEMO-1).

- **The watch**, large, its case and buttons in `--watch-case`, `--watch-case-edge`, `--watch-button` (dark grays in both modes); the screen as the watch draws it (`WatchFace`, or simple SVG screens). Garmin's menus are its list, the chosen row large between hairlines; Wear OS and Apple Watch have pill rows. Buttons drawn 40 × 16, taking a press 44px across.
- **Hints** level with each button: semibold, muted when the button does nothing now, brand when the tour needs it; the key in a small mono `kbd`.
- **`.try-rows`** under the watch: a row per tap or swipe (a Phosphor icon, what it does, the key). On phones the buttons' rows join them, without keys.
- **The tour**: a card above the watch. The current row is brand-soft with **This step**, and its button gets a breathing brand ring (still with less motion).
- **Your keyboard is the watch** (computers): an arrow that swipes sends a soft white dot across the screen (`try-trail`).

### Match report and shared page

- **`MatchReport`**: a panel like a sheet: "Match report" in small brand capitals, the teams in Barlow Condensed and the score at the right, the facts in a grid, Goals and Cautions and send-offs as left-aligned tables (the code bold, its meaning muted), the notes. Printing drops navigation and buttons and turns the tokens to ink on white.
- **`SharedMatchPage`**: the app's look without navigation, inside the pitch frame: the wordmark and "A shared match", the scoreboard, events and track (nothing that changes anything). A dead link gets a small centered card.

## Layout

- **Wide screens**: the **stadium board across the top** (76px), sticky, above the maps' controls and under dialogs (`scroll-padding-top` keeps link targets clear).
  - The LAWFIVE wordmark; Matches, Venues, Referees, Stats, Competitions and Quiz with icons, the current page a **tunnel** (a grass-green tab with rounded top corners running into the pitch).
  - **More**: Templates, People for admins (a yellow dot and "2 waiting for approval" when people wait, and a dot on More), Link a watch, Get the app.
  - Settings and the account (initials in a chalk circle and the name) at the right.
  - Under 1180px the tabs drop their icons and the account its name; under 960px the tabs tighten.
- **Under 820px**: the board becomes the **tab bar** along the bottom (Matches, Venues, Referees, Stats, More; 22px icons; the current tab white with a chalk bar on top).
  - Edge to edge (`viewport-fit=cover`): the tab bar runs under the gesture bar, padded by `env(safe-area-inset-bottom)`, and a board band covers the status bar so nothing scrolls under the clock.
  - Nothing scrolls sideways.
  - A form's **Save bar** is a board strip along the foot in the tab bar's place; its Delete is the trash alone (named for screen readers), so Delete, Cancel and Save fit one row.
- **Other breakpoints**: 1180px (tabs and big figures tighten), 960px (two columns become one; the next match stacks), 600px (list meta goes under the text).

## Android app

Pitch & Scoreboard on Material 3's components ([mobile/android/](mobile/android/)), reading as the website does at phone width, not as a stock Android app. Screens follow the website's components; this section lists what's particular.

### Tokens and type

- `ui/theme/Theme.kt` holds the website's tokens by the same names, light and dark: the ground (`pitch`, `chalk`, `chalkMuted`, `heroShadow`…), the board (`board`, `boardEdge`, `boardDots`, `onBoard`, `boardAccent`…), the panel (`panel`, `panelEdge`, `ink`, `inkBrand`…), the cards, `kitBlank`, `onYellow`.
- **Grounds**: the working tokens (`text`, `muted`, `borderInput`, `surface`, `field`, `brand`, the soft colors, `weatherAmber`, `chartGrid`…) come from a `Ground` (Grass, Panel, Board), read through `colors`. `LfCard`, dialogs, menus, sheets, chips and maps provide `OnPanel`; `Board`, the tab bar, the segmented control, the Save bar and the photo viewer provide `OnBoard`. Each ground also sets Material's color scheme, so Material's parts match and no Material purple shows.
- **Type**: the website's fonts and weights, bundled. `LfType.display` (black italic, tabular figures), `LfType.label` (mono bold capitals, 0.12–0.16em), `LfType.word` (condensed extra-bold). Material's `headline*` and `display*` are black italic; `titleSmall` the mono label; `labelLarge` the button's word.
- Figures sized to their room don't grow with the text size; words do, stepping down only so a word never breaks (`FitText`, `WordFitText`).
- **Icons**: Phosphor as vector drawables from the web's package (`tools/icons.mts`), in the `Ph` enum, drawn with `PhIcon`.

### The L5 mark

`tools/logo.mts` reads `web/src/logo.ts` and writes the adaptive launcher icon (the board as `@color/launcher_background`, the mark at 0.44 of the 108 dp square, a monochrome layer), the launch screen (the mark on `@color/board`, so the icon seems to open into it), `ic_notification`, the Wear OS icon (0.62 of a round board) and `ui/theme/LogoShapes.kt`. Vector drawables can't skew, so the script works the slant into the outlines. `LogoMark` and `Logo` draw as the website's.

### The page and navigation

- **`Screen`**: the grass with mowing stripes (256 dp bands, 120 dp blends) that stay put as the page scrolls (`pitchStripes`), in the **pitch frame** (`pitchFrame`: touchlines 8 dp in, words 21 dp in, `PagePad`), its goal lines across the top and under the last row (above the add button's room on a short page).
- A board band covers the status bar, its icons light in both modes.
- **Page head**: a back link in condensed capitals with a caret; the title with the hero offset (mint 3 × 2 dp for a hero, 2 × 2 dp otherwise at night). Matches and Stats 64 sp (52 sp over eight letters); others 40 sp (32 sp long). It steps down until its longest word fits. Sync status muted at its right.
- **Tab bar**: the board along the bottom, 22 dp icons (stepping down to fit at large text, never cut), the current tab white with a 3 dp chalk bar across 80% of it.
- **Adding**: a chalk slab at the bottom right with a board-black plus and a 3 dp board drop.

### Surfaces and controls

- **`LfCard`**: chalk, 6 dp corners, a hard 3 dp drop in dark green at 45% by day (`hardDrop`); a 1 dp `panelEdge` at night. **`Board`**: a 3 dp drop and a soft shadow by day, a 1 dp edge at night; `BoardHead`; `dots` (1.3 dp every 7 dp).
- **Pitch pieces** (`ui/components/Pitch.kt`): `Halfway` (16 dp spot), `ChalkRule` (3 dp), `ChalkFigures`, `cornerArcs`, `KitPanels`, `CardShape`. A kit's name starts at no more than 22% of its panel (never under 14 sp), steps down until its longest word fits (to 9 sp), then wraps between words.
- **Buttons**: 44 dp (for gloves), 6 dp corners. Primary a brand slab with a 3 dp board drop; `danger` the one red button; secondary a 2 dp `borderInput` outline; `LinkButton` a ghost; `IconAction` a 2 dp outline. Words step down where narrow, to 10 sp, never cut.
- **Chips** 4 dp; **team badges** 4 dp; **fields** 6 dp, brand when focused; **avatars** as the website's.
- **`SectionTitle`**: black italic at 26 sp with the running chalk line; `small` for mono capitals in a form.
- **Dialogs, menus and sheets**: chalk panels, 6 dp, black italic titles. The photo viewer and crop on near black.

### Slab on Android

`Slab(title, tag, icon, ground = SlabGround.Board | Panel | Grass, cut)` in `ui/components/Slab.kt`.

- The tab 38 dp with 22 sp words, 6 dp out to the left, the slab 19 dp under it; the cut 26 dp. The title is a heading for TalkBack.
- Title and tag share the width; the tag wraps, or goes under the title when it would make the tab taller. A word never breaks.
- With it: `SlabLabel`, `SlabFigure`, `SlabRow` (a figure as a row: a rule over it, label left, figure right), `SlabRule`, `MintBar`, `slantShape` and `Modifier.boardSurface(shape)`.
- No Data table: each graphic has a spoken summary instead.

### Screens on Android

- **Next match**: the kickoff up to 92 sp, sized to the board; the fold caret a 48 dp button. The strip: countdown 22 sp, time 30 sp, a size smaller under 340 dp; folded or open is kept with the account's settings.
- **Sizes**: a row's kickoff 36 sp and officials line 13 sp; the scoreboard's score 88 sp and kickoff 68 sp; the weather's temperature 56 dp; an event's score 38 sp; officials' tiles 60 dp; The running's distance up to 72 dp (`TrackFigures`).
- **Heatmap**: `PitchHeatmap` in `ui/screens/Heatmap.kt`, bands from `data/Contours.kt`; dimension figures 14 down to 10 sp.
- **Stats**: arithmetic in `data/StatsMath.kt`, graphics in `components/BoardCharts.kt`. Filter options 48 dp; By role tiles 134 dp, figures 42 dp; cards 82 × 112 dp (64 × 88 under 380 dp). A tap on a running-total stretch or a temperature column says what's in it.
- **More**: who's signed in, then two cards of rows; no admin area. **Settings** ends with Erase this phone's data in its own card.
- **Forms**: Delete (a 44 dp red trash outline), Cancel and Save on a board strip above the tabs. Paired short fields (Short name and Color) stack under about 250 dp at default text, so a label never wraps.
- **Empty lists** (`EmptyState`): the circle up to 360 dp, the picture in chalk at 55%; under 360 dp or at large text, the words alone in a circle that grows.
- **Maps** (`VenueMap`, `TrackMap`): the panel's colors.
- **Motion**: pages crossfade, and so does the back gesture, following the finger. The pull indicator is a board with chalk, running only during a pulled sync.

## iPhone app

Pitch & Scoreboard on native navigation ([mobile/ios/](mobile/ios/)), matched to Android section by section, at the same sizes in pt. Where Android's choice comes from Material, the iPhone takes iOS's own.

### Tokens and type

- `LF` in `UI/Theme.swift` holds the same tokens as `Theme.kt`. The working tokens follow the `Ground`, a UIKit trait bridged to SwiftUI (`UITraitBridgedEnvironmentKey`), so each stays a plain `Color`; `.ground(.panel)` and `.ground(.board)` set it.
- iOS 17 draws a menu's label outside the trait, so fields that open menus (`FieldBox`, `Choice`, the team color, Add photos) take fixed colors through `ink(_:_:_:)`.
- **Type**: the same fonts, all growing with the text size: `Font.display`, `Text.lfLabel`, `Text.lfWord`, `lfHeadline*`, `lfTitleSmall`, `lfLabelLarge`. At the largest sizes a button's words step down to 70% rather than end in ….
- **Icons**: Phosphor as template image sets (`tools/icons.mts`), through `PhIcon`.
- **The mark** (`tools/logo.mts`): the app icon (the mark at 0.7 on a square board; iOS 18's dark icon on a clear square, its tinted icon in grays, the L brightest), the launch screen (`LaunchMark` on `LaunchBackground`), the Apple Watch icon (0.62 of the board) and `UI/LogoShapes.swift`.

### The page and navigation

- **`PageFrame`** (`RootView.swift`, through `Page` and `FormPage`): stripes (`PitchStripes`) and frame (`PitchMarkings`) as Android's. Sync status at the head's right on a tab's first page. The status bar's words are light (`UIStatusBarStyleLightContent`).
- **Tab bar**: LawFive's own over the system's hidden one, with a selection haptic; tapping the open tab returns to its first page. Each tab keeps its own navigation stack; only the front tab is in VoiceOver's reach.
- On a tab's first page and the sign-in pages, a board band covers the status bar (`statusBand`). **On pages after it, the native navigation bar is a strip of the board**, with the system's Back (swipe and long-press menu) and the page's actions in chalk; the title stays in the page head.
- **Search** is a field in the page: an X clears it; tags in use show on a panel under it while empty and focused.

### Components on the iPhone

- **Pitch pieces** (`UI/Components/Pitch.swift`): as Android's. Kit names wrap with a 0.92 line height, both kits growing taller together, HOME and AWAY level at the top; a one-line strip steps the whole name down.
- **`Slab(title:tag:icon:ground:cut:)`** (`UI/Components/Slab.swift`): Android's sizes, the tab growing with Dynamic Type; laid out by its own `Layout`s; a heading for VoiceOver. With `SlabLabel`, `SlabFigure`, `SlabRow`, `MintBar`, `SlabRule`, `SlantShape`, `.boardSurface(_:)`, and `WordFit` and `FitFigure`, chosen by `ViewThatFits` so nothing drawn feeds back into its room.
- **Fields**: 2 pt of the brand when focused. Switches pitch green. A link button is 44 pt to tap.
- **`SectionTitle`** is kept whole: the title takes the room left, so "EDIT RESULT" never ends in ….
- **Sizes**: next kickoff up to 92 pt, countdown cells up to 60 pt, a row's kickoff 36 pt, kit names 24 pt, a row's score 46 pt; the scoreboard's score 88 pt with kit names 26 pt; an event's score 38 pt. The next kickoff's time doesn't grow with the text size, so AM or PM is never cut.

### Screens on the iPhone

- **Stats**: `Data/StatsMath.swift` and `Components/BoardCharts.swift`; VoiceOver reads each graphic as one summary.
- **Heatmap** (`UI/Screens/Heatmap.swift`, `Data/Contours.swift`, `LF.contour`): the periods share the board's width, wrapping wherever they don't fit (`ViewThatFits`).
- **Forms**: a sheet on the grass with no top bar, the board strip at its foot (Delete only for something saved), hidden while the keyboard is up; it can't be swiped away by accident.
- **Settings**: each group has an anchor for Get ready's Change. The account's changes, and a new venue from the match form, are sheets on a chalk panel that open as tall as their content (`fittedDetents`).
- **Get ready**: buttons share the width when they fit; on an iPhone 17 they stack.
- **More**: at the largest text sizes Sign out goes under the name.

### Differs from Android

- The native navigation bar instead of a back link; Edit stays in it.
- Pages slide in and tabs switch at once, where Android crossfades both.
- Forms open in a sheet. A match row has a context menu (Edit, Directions).
- Risk badges explain themselves in a popover; confirming is the system's alert; weather details and tips are sheets with detents on the panel.
- Pull to refresh is the system's spinner in chalk. Pickers, the share sheet, photo picker, camera and QR scanner are native. Light haptics on switches and choices.
- The app icon has iOS 18's dark and tinted icons; there's no notification icon.

## Wear OS and Apple Watch

The Garmin watch's look (black, the match's colors, slots at the same fractions of the screen; [docs/requirements/wear-os-and-apple-watch.md](docs/requirements/wear-os-and-apple-watch.md)) with the phones' type: Barlow for text, Barlow Condensed for clocks and scores. Each uses its system's list scrolling and crown with LawFive's own components, so all three watches read as one app.

### Menus and icons

- Menu rows are pills on `#1D2321`, with a Phosphor icon in black on a LawFive green circle where they lead somewhere.
- Icons are Phosphor's bold weight, written into the watch apps by the phones' icon tools, one per meaning on all three watches: Matches CalendarBlank, New match Plus, History ClockCounterClockwise, Settings GearSix, Quick match Lightning, Same as last ArrowCounterClockwise, Custom SlidersHorizontal, Account UserCircle, Alerts Vibrate, Match screen Watch, Timer names TextAa, About Info, Start match Play, Sync now ArrowsClockwise, Link account Link, Controls Hand, and Flag for Mark pitch only. Wear OS's Permissions row is ShieldCheck; the Apple Watch's first-launch permissions use MapPin and Heartbeat.
- **App icons**: the L5 mark on a round board (Wear OS) or on the board watchOS cuts round, across 0.62 of it.
- On the Apple Watch the link question from the iPhone uses the confirmation layout, scrolling, so a long server name wraps.

### The teams are kits

The boards' kits in the watch's own fonts (UI-10), on all three watches, the website's and phones' pictures of the screen, and Try a match.

- On the score line, two kits of the same width (the wider name's), cut on one "/" diagonal where they meet (0.21 of the kit's height either side of the middle, a gap of 0.11 of it).
- Names upright (only the shape slants, as Garmin's fonts can't), black or white by contrast. Scores sit outside; with scores only, the scores are the kits.
- No color is `#3a403d`. A color too dark for the black screen gets a thin gray edge.
- At kickoff and the shoot-out's first kicker, the chosen team has a white dot above its kit, and nothing else; on a small screen it sits between title and kit, nearer the kit.
- One team alone (the team menu, Can return) is a lone kit cut only on the side facing the other team.

### Match states

- **Suspended** (TMR-13), after the half-time screen's layout: LIGHTNING or SUSPENDED, the score, the lightning countdown in the break blue turning the start green at 0:00 (or the time suspended counting up in the normal color), and the green Resume pill. Its icon on the website is Phosphor Pause.
- **Stoppage pill in added time** (TMR-16): orange, solid while a stoppage runs, outlined otherwise. Its figure counts the added time left down to 0:00, then the time over with a plus ("+0:05"), outlined the same: the plus, not a new color, tells it apart.
- **A clock that stops** (TMR-15): standing still it's the stoppage orange (the match clock and second clock alike, and `.wf-stopped` in Try a match), running the normal color; only the color changes. On the format forms, **Clock** is a choice (Runs on, Stops when play stops) at the head of On the watch, with Goals and cards stop it under it and Track stoppage shown on and grayed.
- **Sin bin** (EVT-12): the pill row's last pill, outlined in yellow with yellow words. **Can return** is a full black screen: the lone kit, the number large, "can return" in the start green, "+1" in gray for more. The team menu's Sin bin row is the dark band with yellow words, unlike the filled Yellow card row.

### Kickoff direction picture

On every watch the same drawing shows how to hold the watch: the forearm in `#555555` across the screen, the watch a white ring on it with a tick at 12 o'clock, and an arrow from 12 o'clock toward the goal. Gray with no reading.

## Marketing site

### lawfive.app

[site/](site/) is Pitch & Scoreboard, a little bolder than the app, in hand-written pages with their own copy of the tokens and fonts (`site/public/styles.css`; a token change is made in each copy). It follows the system's light or dark setting.

- **The board** across the top at every width: the mark and LAWFIVE; Try it, Quiz, FAQ and Docs (Docs dropped under 480px, FAQ under 400px), the current page a tunnel; Sign in a chalk outline. **The foot** is a board strip.
- **Every page** is in the pitch frame on the stripes, as the app's.
- **The hero**: an eyebrow (a mint mono label on a board tag), the title with the hero offset (up to 132px on the home page, 112px elsewhere, 44–72px on phones), a chalk lede, then the halfway line. Screens are framed in the board's black (a screen, a phone, a watch), never anyone's product art.
- **Sections**: a mono label over a 44–72px black italic heading; groups are labels at 34px (28px on phones) with a chalk line running on.
- **Chalk panels** hold dense words (What it does, topics, questions, legal text).
- **Boards** hold the big moments:
  - **The closer look**: the [slab](#slab) in the site's own classes (`.look-tab`, `.look-tag`, `.look-face`, so they can't reach a playable part's `.slab`), the tab 28–38px (24px on phones), a mint tag naming its page, sides alternating.
  - **Find out more**: a board per page, lit with a mint bar on hover; five or six in a row, three under 1100px, two under 700px, a list under 600px.
- **`.where`**: a semibold line led by a short rule naming the devices. App states are chips: In testing a chalk tag, Early testing a chalk outline.
- Yellow and red appear only as the small tilted cards beside "Goals, cards and stoppages".
- Clips stop off screen and don't autoplay with less motion. Under 600px long grids become swipeable rows (scroll snapping, the next slide peeking, square chalk dots).
- **`.go`**: links between sections in condensed extra-bold capitals with a 14px caret, on a line of their own. A link out to the docs adds Phosphor's arrow up and out (`.ext-icon`).
- **Wording**: "referees" and "matches" throughout. The home page alone also says "soccer" and "football", once each, so people searching for either find it.

### The playable parts

SITE-9. The website's own components, built in by `pnpm build:site` in `web/`.

- `web/src/site/` imports `web/src/styles.css`, scoped at build to the part's element; `web/src/site/site.css` removes the part's own stripes (they'd not line up with the page's) and the status bar band.
- The site's rules that share a name or element with the website's carry `:where(:not([data-lawfive] *))`, so they stop at a part's edge. The parts bring no fonts.
- Each part's picture or clip stands in until it loads.
- **`quiz.html`**: the quiz takes two thirds of the width beside its four short cards (`.quiz-layout`), stacking under 900px.
- **`try.html`**: Try a match under the hero, then the match screen setup; Change beside the watch goes down to it, New match back up.

### lawfive.dev

[docs-site/](docs-site/) is Astro Starlight in Pitch & Scoreboard, calm for reading, with its own copy of the tokens (`src/styles/lawfive.css`; a token change is made in each copy). Starlight's colors are set for three places:

- **The board** across the top: the mark and LAWFIVE, then DOCS in mono after a thin rule; search as an outline.
- **The grass** for the sidebar: groups in black italic chalk capitals, links pale green, the current page a chalk tab running into the page.
- **The chalk panel** for the words, so nothing striped is behind long reading:
  - Titles and `h2`s in black italic capitals; `h3`s in condensed extra-bold, ordinary case; body Barlow 16px; links pitch green, underlined; inline code as [Code](#code).
  - Tables: mono capitals over a heavy `--ink-rule`, a setting's name kept whole.
  - Code blocks are wells (`--panel-2`, `--ink-field` at night) colored by `src/code-themes.mjs` (keywords pitch green, strings blue, numbers amber, comments muted; never the cards' colors).
  - Notices: soft panels with a 4px edge (amber caution, blue information, red danger, green tips).
- **The home hero** (and the 404) is the one place on the grass, with the halfway line through a center circle holding the mark.
- Phosphor replaces every Starlight and Pagefind icon at build time (`astro.config.mjs`).
- Unlike the site, it keeps Starlight's light, dark and auto switch, which docs readers expect.

## Motion

Short and purposeful, all in one block at the end of [web/src/styles.css](web/src/styles.css) inside `@media (prefers-reduced-motion: no-preference)`, so nothing moves for people who've asked for less. Script-driven motion (`CountUp`) checks `lessMotion()` in ui.tsx.

- **Micro-interactions**, 120–250ms: buttons press in (scale 0.96); Copy pops a tick (`copied`); rows and chips ease their colors; a match row's kits slide 3px apart on hover (the next match's 4px).
- **Entrances**, about 450ms, eased out: an empty list's markings chalk in (the circle from the top, then the halfway line out from the spot); match rows rise in 45ms apart (`--i`); Stats' sections rise once; badges pop; cards are dealt in; numbers count up; countdown figures drop in as they change; dialogs lift in and popovers fade in.
- **The replay**: the goal pulse, the score flash and the event banners.
- **Try a match**: alerts shake the watch once (`try-buzz`); the coin flips (`try-coin`).
- **Don't** animate anything that pushes content around (a row's kits move inside clipped panels), don't loop, and don't hold up anything someone is waiting to use. Only the placeholders' sweep and the loading pitch loop, and only while something loads.
