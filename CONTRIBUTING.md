# Contributing to LawFive

Thanks for helping. LawFive is a product for soccer referees: watch apps that run the match, phone apps and a website for everything around it, and a server anyone can host. The [README](README.md) lists the parts, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) says how they fit together.

- **A bug or an idea:** open an issue. For anything bigger than a small fix, open one before you start, so we can agree on the behavior first.
- **A security problem:** don't open an issue; follow [SECURITY.md](SECURITY.md).
- **Running your own server:** see [lawfive.dev](https://lawfive.dev).

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting set up

You need Node 24 or later and pnpm. Run `pnpm install` at the root, then follow the README of the part you're working on: each says how to build, run and test it. To try the website with sample data and no database, run `pnpm demo` in `server/` and `pnpm dev` in `web/`, then sign in at http://localhost:5173 as `demo@lawfive.dev` / `lawfive-demo`.

## Making a change

1. **Behavior is written down first.** [docs/requirements/](docs/requirements/) says what LawFive does, area by area. A change in behavior changes its requirement in the same pull request, and code comments name the requirement they implement (`// TMR-7: ...`).
2. **Keep every copy in step.** Many features live in more than one app; see the table below. A change to one is made in the others too, in the same piece of work, or the gap is written in that area's Status.
3. **Follow the design.** [DESIGN.md](DESIGN.md) is how LawFive looks on every device. Read it before a visible change, and update it when the design language changes.
4. **Keep the tests passing** in each part you change, and look at a visible change on screen (each README says how: screenshots for the website, snapshot pictures for the phones).
5. **Generated files are made, not edited.** Change `schema/src/` and run `pnpm generate` in `schema/`. After changing `server/src/db/tables.ts`, run `pnpm db:generate` in `server/`, and never edit a committed migration. A new or changed endpoint is described in `schema/src/endpoints.ts` too, and the server's tests check it against that.
6. **Versions come from git** (`tools/version.sh`): never bump one by hand.

Keep personal details (local paths, keys, credentials) out of the repo, and make server features work in the self-hosted Docker setup.

## Pull requests

Keep each one to one change, say what it changes and why, and name the requirement IDs it touches. Contributions are under the [Apache License 2.0](LICENSE), as the rest of the project is.

## Releasing

For the maintainer (VER-5). Every change to main is published as the image's `edge` tag, and the hosted service runs it. A release is for self-hosters, made when there's something worth upgrading for:

1. On main, with nothing waiting to push, run `tools/release.sh`. It tags the commit with the server's version from git (`v2026.11.12`) and pushes the tag.
2. CI tests it, publishes the image as `2026.11.12` and `latest`, then makes the GitHub release with the server's changes since the last one.
3. Edit the release to add anything self-hosters must do before upgrading (a setting that changed, a step to take), at the top.

If nothing in the server has changed since the last release, the script says so and stops. The apps aren't tagged: store builds are made by the maintainer, each with its own version from git, and they work with older servers (VER-4).

## Keep every copy in step

| A change to | Also check |
|---|---|
| A watch's match, screens or controls | The other two watches (WCH-2); the clocks' copies on the website and phones (`watchPreview.ts`, `WatchPreview.kt`, `WatchPreview.swift`) and the shared match cases (`schema/match-cases/`, `pnpm test:watches`); the match screen pictures (`WatchFace`, both phones' `WatchScreenPicker`); Try a match (`web/src/match/`: its engine, controller and screens); the site's pages, pictures and FAQ that describe it (`watch.html` first); lawfive.dev |
| The match screen setup or a setting sent to watches | The website, Android and iPhone; the watches' own Settings where they have it; Try a match; the site's `watch.html` |
| The quiz (its questions or how it works) | The questions in `schema/quiz/` (Android builds them in; the iPhone's copy is remade by `pnpm generate` in `schema/`); the website, Android and iPhone; the site's `quiz.html` |
| A track, the replay or heatmaps | The website, Android and iPhone (TRK-14), the replay's timeline (`web/src/replay.ts`, `TrackReplay.kt`, `TrackReplay.swift`), and the heatmap's bands in `web/src/contours.ts` with both phones' ports (`Contours.kt`, `Contours.swift`) and the case they share (`web/test/contours-case.json`); the site's `tracks.html`, its clips and its playable replay (`web/src/site/`) |
| Stats (their figures, charts or slabs) | The website's arithmetic (`web/src/stats.ts`, with `server/src/stats.ts` and `schema/src/stats.ts`) and both phones' ports (`StatsMath.kt`, `StatsMath.swift`, and their tests); the charts (`boardCharts.tsx`, `BoardCharts.kt`, `BoardCharts.swift`); the site's `schedule.html` |
| The slab, or any shared component of the look | `web/src/components/Slab.tsx`, `Slab.kt`, `Slab.swift` and DESIGN.md's Slab; lawfive.app's closer look (`.look-tab`, `.look-tag`, `.look-face` in `site/public/styles.css`) |
| The color tokens or the L5 mark | Tokens: `web/src/styles.css`, `site/public/styles.css`, `docs-site/src/styles/lawfive.css`, `Theme.kt`, `Theme.swift`. The mark: `web/src/logo.ts`, then `pnpm icons` in `web/` (the website's and the Garmin's icons), the copies in `site/public/` and `docs-site/public/`, and `node mobile/android/tools/logo.mts` and `node mobile/ios/tools/logo.mts` |
| The match report (DATA-6) | `web/src/report.ts` and `web/src/pages/MatchReport.tsx`, and the phones' text of it (`reportText` in Android's `Match.kt` and the iPhone's `Match.swift`); the site's `schedule.html` |
| The cards' shapes (yellow, red, second caution, sin bin) | `CardShape` and `SinBinCard` in `web/src/components/ui.tsx`, `CardShape` in `Pitch.kt` and `Pitch.swift` |
| Did you know (tips) | `web/src/tips.ts`, `Tips.kt`, `Tips.swift` |
| A team's short name (SET-5) | The rule in `schema/src/shortNames.ts` with its cases in `schema/short-names.json` (`pnpm generate` copies them to the phones' tests), and its ports in Android's `ui/Format.kt` and the iPhone's `UI/Format.swift`; Garmin's planned match from its phone settings still has its own first-three rule |
| Period names, dates and other display words | `web/src/format.ts`, Android's `ui/Format.kt`, the iPhone's `UI/Format.swift`; plans' words (`web/src/plans.ts`, `Plans.kt`, `Plans.swift`); merging (`web/src/merging.ts`, `Merging.kt`, `Merging.swift`) |
| The misconduct codes | `schema/misconduct/` (Android builds them in; the iPhone's copies, and the watches' lists for Card reasons, EVT-14: `Misconduct.mc`, `Misconduct.kt`, `Misconduct.swift`, are remade by `pnpm generate` in `schema/`) |
| What LawFive collects, or the privacy and terms links | `site/public/privacy.html`; both `PrivacyInfo.xcprivacy` files and the stores' privacy answers; the links on the website (`web/src/components/ui.tsx`, `web/src/pages/Settings.tsx`), Android (`SignInLink.kt`, `More.kt`, `HealthRationaleActivity.kt`) and the iPhone (`SignIn.swift`, `More.swift`) |
| The settings' defaults for a new account | `web/src/settings.ts` and both phones' ports (`SettingsDefaults.kt`, `SettingsDefaults.swift`), with their tests |
| Help, or Link a watch's steps | Help (WEB-29): `helpUrl` in `web/src/components/ui.tsx` (More, Settings, sign-in), Android's `More.kt`, the iPhone's `More.swift`. Link a watch (SYNC-1): `web/src/pages/Link.tsx`, both phones' `More.kt` and `More.swift`, the watches' own menus, and lawfive.dev's Watches page |
| The navigation (the board, the tab bar, More) | The website (`moreGroups` in `web/src/components/Layout.tsx`), Android and iPhone (WEB-31) |
| Try a match's address (DEMO-9) | `tryMatchUrl`, `tryMatchFromAddress` and `tryWatchFor` in `schema/src/screen.ts` with their cases in `schema/test/screen.test.ts`, the phones' ports (`TryMatch.kt`, `TryMatch.swift`, with tests on the same cases), and the pages that read it (`web/src/site/try.tsx`, `web/src/pages/TryMatchPage.tsx`) |
| What next once a watch is linked (SYNC-15) | `Linked` in `web/src/pages/Link.tsx`, Android's `More.kt` and the iPhone's `More.swift` |
| A screen in the phones' snapshot tests | Both phones' copies (`ScreenSnapshots.kt`, `ScreenSnapshots.swift`), with the same screen keys, so the sheet pairs them |
| The demo's data (`server/src/demoData.ts`) or an endpoint's answer the phones read | `pnpm fixtures` in `server/` (the phones' snapshot fixtures in `schema/generated/fixtures/`; the server's tests say when they're stale) |
| Anything the site or docs describe | The page that describes it on lawfive.app (`site/README.md`) and lawfive.dev (`docs-site/README.md` lists each page's source) |

A new place a feature lives is added to this table.
