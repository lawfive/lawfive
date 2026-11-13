---
title: Contribute
description: How the LawFive repository is organized, and how to work in it.
sidebar:
  label: Overview
---

LawFive lives in one repository, with a folder for each part.

| Folder | What it is | Built with |
|---|---|---|
| `schema/` | The shared data model and API description | TypeScript, Zod |
| `server/` | API, accounts, sync and background jobs | TypeScript, Hono, Drizzle, Better Auth |
| `web/` | The web app, served by the server | React, Vite |
| `watch-garmin/` | The Garmin watch app | Monkey C |
| `mobile/android/` | The Android app, with Wear OS in `wear/` | Kotlin, Compose |
| `mobile/ios/` | The iPhone app, with Apple Watch in `LawFiveWatch/` | Swift, SwiftUI |
| `relay/` | The push relay, run by the project | TypeScript, Cloudflare Workers |
| `site/` | The marketing site | HTML, CSS |
| `docs-site/` | This site | Astro Starlight |
| `docs/` | Requirements, architecture, data fields | Markdown |
| `tools/` | Versions from git (`version.sh`) | Shell |

## Build one part

- [The server and web app](/contribute/server-web/)
- [The Garmin watch app](/contribute/garmin/)
- [Android and Wear OS](/contribute/android/)
- [iPhone and Apple Watch](/contribute/iphone/)
- [The push relay](/contribute/relay/)

## How we work

- **Requirements come first.** [`docs/requirements/`](https://github.com/lawfive/lawfive/tree/main/docs/requirements) defines how LawFive behaves, one file per area, and each requirement has a stable ID such as `TMR-7`. Behavior changes update it in the same piece of work, and code comments refer to those IDs.
- **Keep the apps alike.** The phones do the same things, as do the watches; [`CONTRIBUTING.md`](https://github.com/lawfive/lawfive/blob/main/CONTRIBUTING.md) lists where each feature's copies live. The match rules have a copy in each watch and on the website, all tested by the cases in `schema/match-cases/`: run `pnpm test:watches` from the repo root after changing any.
- **[`DESIGN.md`](https://github.com/lawfive/lawfive/blob/main/DESIGN.md) is how it looks,** including its rules: Phosphor icons only, no soccer balls or whistles. Check anything visible on a screen, in light and dark.
- **Permissions are listed for referees** on [lawfive.app/permissions](https://lawfive.app/permissions), app by app. An app that asks for a new one, or stops asking, changes that page (`site/public/permissions.html`) in the same piece of work; `pnpm test` at the root fails while a manifest or Info.plist and the page disagree.
- **Keep it self-hostable.** A server feature has to run in the self-hosted Docker setup.
- **Keep personal details out:** local paths, keys and credentials.
- **Be kind.** Everyone taking part follows the [Code of Conduct](https://github.com/lawfive/lawfive/blob/main/CODE_OF_CONDUCT.md); report a problem to [conduct@lawfive.app](mailto:conduct@lawfive.app).
- **Versions come from git** ([`tools/version.sh`](https://github.com/lawfive/lawfive/blob/main/tools/version.sh)). Never bump a version number by hand.

## Before you open a pull request

Run the tests for what you changed. Each guide above lists them. After changing the data model or API description, run `pnpm generate` in `schema/`.
