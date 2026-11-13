# Working on LawFive

LawFive (lawfive.app; open-source project at lawfive.dev) is a product for soccer referees: watch apps for running a match, phone apps, and a server with a web UI. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together and [CONTRIBUTING.md](CONTRIBUTING.md) for how changes are made. Each component has its own README (and CLAUDE.md where it has specific rules).

| Folder | What it is |
|---|---|
| [watch-garmin/](watch-garmin/) | The Garmin Connect IQ watch app (Monkey C). |
| [docs/](docs/) | Requirements (`requirements/`), architecture, the match data fields, the quiz format, plans. |
| [schema/](schema/) | The shared data model (TypeScript, Zod). Change `src/`, run `pnpm generate`, and keep `pnpm test` passing (Node 24+, pnpm). |
| [server/](server/) | The server (TypeScript, Hono, Drizzle, Better Auth). Keep `pnpm test` passing; after changing `src/db/tables.ts` run `pnpm db:generate` and never edit a committed migration. A new or changed endpoint is described in `schema/src/endpoints.ts` too (the tests check the server against it). |
| [web/](web/) | The web UI (React, Vite). Follow [DESIGN.md](DESIGN.md). Keep `pnpm test` (type check and unit tests) passing; for visible changes, check with `pnpm screenshots` against the demo (light and dark, desktop and phone). |
| [site/](site/) | The marketing page at lawfive.app: hand-written HTML and CSS, with the website's quiz, match screen setup, Try a match and replay built in by `pnpm build:site` in `web/` (SITE-9). Follow [DESIGN.md](DESIGN.md); deployed by Cloudflare Pages from `main`. |
| [docs-site/](docs-site/) | The docs at lawfive.dev, for self-hosters and developers (Astro Starlight, npm, not in the pnpm workspace). Follow [DESIGN.md](DESIGN.md); keep `npm test` passing, and its pages true to what they document (its README lists each page's source). |
| [relay/](relay/) | The push relay at push.lawfive.app, on Cloudflare Workers (TypeScript, no dependencies). Run by the project, not self-hosters. Keep `pnpm test` passing; keep its secrets and settings in Cloudflare, never the repo. |
| [mobile/](mobile/) | The Android app (Kotlin, Jetpack Compose) and the iPhone app (Swift, SwiftUI), and their watch apps (`mobile/android/wear/`, `mobile/ios/LawFiveWatch/`). Each has its own README. Keep them doing the same things. For a visible change, look at the snapshot pictures (each README's snapshot section: every variant from the shared fixtures, no server); flows stay with the UI tests and emulators. A full pass on the simulators (dark, a narrow phone, large text) only before shipping a big visible change, saying first how long it takes. |
| [tools/](tools/) | `version.sh`: versions from git for every part (VER-1). `release.sh`: releases the server (VER-5), only when the user asks. `snapshot-sheet.mjs`: the phones' snapshot pictures (and the website's) side by side in one page. `test-watches.sh` (`pnpm test:watches` from the root): every copy of the match rules against the shared match cases (WCH-2). |

The project is open source and self-hostable: keep personal details (local paths, keys, credentials, the maintainer's devices and hosts) out of the repo, and design server features so they run in the self-hosted Docker setup. `private/` is the maintainer's own notes, a separate repo that's gitignored here: never link to it from the repo or copy from it into the repo.

## Design

[DESIGN.md](DESIGN.md) is how LawFive looks: the rules (no generic AI look, no soccer-ball or whistle clichés, Phosphor icons only) and the design language in place (Barlow, Barlow Condensed and JetBrains Mono, the color tokens, components, layout, motion). Read it before any visible change to the web UI or the phone and watch apps, follow it, and update it in the same piece of work when the design language changes. Its Polish section is the standard: strive for the best experience for the user, and treat confusing or unfinished as not done.

## Keep every copy in step

Many features live in more than one place. [CONTRIBUTING.md](CONTRIBUTING.md#keep-every-copy-in-step) lists them. A change to one is checked in every place listed and made there too where it applies, in the same piece of work. Anything left for later is said so, and goes in that area's Status. A new place a feature lives is added to the table.

## Requirements are the source of truth

- [docs/requirements/](docs/requirements/) defines behavior, one file per area. Check it before changing behavior, and update it in the same piece of work:
  - New behavior gets a requirement with the next ID in its area; changed behavior edits its requirement. A requirement with no label is agreed; others are labeled Draft, Proposed, Later or Dropped. Never reuse, renumber or delete IDs.
  - Write it for a stranger: what the product does, in plain words. No history, no who-decided-what, no dates, no implementation detail the code already shows (see the requirements README).
  - Keep each file's Status current, and [risks.md](docs/requirements/risks.md), especially R-6 (what still needs checking on a real watch).
- Decisions the user makes are written into the requirement as how it is. Their dated record, if wanted, goes in `private/decisions.md`, not the repo. There's no changelog: commit messages are the record.
- Design choices that need the user: ask, with options and a recommendation, rather than guessing.
- Code comments reference requirement IDs (for example `// TMR-7: ...`). Keep that up, and match the surrounding style.
- Architecture decisions (technology, sync, identifiers) go in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)'s Key decisions.

## Git

- Commits use the identity in this repo's local git config (unsigned). Don't change it.
- Commit or push only when the user asks.
- Versions come from git (`tools/version.sh`, VER-1): never bump a version number by hand.
