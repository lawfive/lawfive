# LawFive: web UI

The signed-in website: matches, match reports from the watch (with replay and heatmaps), templates, venues with maps, referees, competitions, stats, the Laws of the Game quiz, settings and, for admins, people and the server's settings. React with [Vite](https://vite.dev), [TanStack Query](https://tanstack.com/query), [React Router](https://reactrouter.com), [React Aria Components](https://react-spectrum.adobe.com/react-aria/) (pickers, ⓘ explanations, dialogs) and [Leaflet](https://leafletjs.com) with [MapLibre GL](https://maplibre.org) for maps. It talks only to the server's `/v1` API ([schema/generated/API.md](../schema/generated/API.md)) with the types from [schema/](../schema/). In production the server serves the built files, so a self-hosted server stays one container. What it does is in [docs/requirements/web-app.md](../docs/requirements/web-app.md) and each feature's file.

## Run it

Needs Node 24+ and pnpm. In two terminals:

```sh
cd server && pnpm demo     # API on :3000, in memory, with sample data
cd web && pnpm dev         # http://localhost:5173 (passes /v1 to :3000)
```

Sign in as `demo@lawfive.dev` / `lawfive-demo`, an admin, with two people waiting for approval on People. New accounts in the demo wait for approval too, and its emails are printed in the demo server's output instead of sent. The demo's data is rebuilt each time it starts. To use a real database, run `pnpm dev` in `server/` with `PUBLIC_URL=http://localhost:5173` in `.env`.

A second copy can run beside the first (for example while a watch is linked to the first): `PORT=3001 WEB_URL=http://localhost:5174 pnpm demo` in `server/`, `API_URL=http://localhost:3001 pnpm dev --port 5174` here, and `WEB_URL=http://localhost:5174` for `pnpm screenshots`.

## Commands (in `web/`)

| Command | What it does |
|---|---|
| `pnpm dev` | Development server with hot reload. |
| `pnpm build` | Type check, then build to `dist/` (the server serves it; the Docker image builds it). |
| `pnpm test` | Type check, then the unit tests in `test/` (display rules, search, the replay, track files, tips, stats arithmetic, the match screen pictures' clocks). |
| `pnpm screenshots <folder> [dark]` | Signs in to the demo and saves desktop and phone screenshots of every page with your installed Google Chrome (headless). Needs both servers above. |
| `pnpm site-screenshots` | The same for lawfive.app's pictures in `site/public/images/` ([site/README.md](../site/README.md)). |
| `pnpm build:site` | Builds lawfive.app's playable parts (quiz, match screen setup, Try a match, replay) into `site/` (`vite.site.config.ts`). |
| `pnpm examples` | Writes the example import files (`public/examples/lawfive-matches.csv`, `.xlsx`, `.json`) from `scripts/examples.ts`, the Excel one with the column guide as a second sheet. Run it after changing `schema/src/importColumns.ts`. |
| `pnpm icons` | Redraws the icons from the L5 mark in `src/logo.ts` with your installed Google Chrome: the website's in `public/`, the Garmin app's (`watch-garmin/resources/drawables/launcher_icon.svg` and a PNG per size in `watch-garmin/resources-launcher-*/`) and the emails' header (`server/src/mail-wordmark.png`). Run it after the mark changes. |

## Layout

| Path | What it is |
|---|---|
| `src/main.tsx` | Routes (a data router, so forms can ask before losing changes); the sign-in page until there's a session. |
| `src/api.ts` | API calls and hooks: `useList`, `useRecord`, `useSave`, `useDelete`, sign-in. |
| `src/styles.css` | All styles: the color tokens with dark mode, the stadium board on wide screens, the tab bar on phones. |
| `src/format.ts` | Dates, minutes, team names and colors (the same contrast rule as the watch); tab titles for matches (`matchTabTitle`). |
| `src/components/` | The shell (`Layout`, with `moreGroups` for the More menu), form fields, `Icon`, the pitch's pieces and `useTabTitle` (`ui.tsx`), `Picker`, `QuickCreate`, `VenueMap` and `useMapTiles`, the track and heatmap components, `ListTools`, `FormatFields`, `editor.tsx` (`useEditor`), `Photos`, `CropPhoto`, `ShareMatch`, `Weather`, `WatchFace`, `QrCode`, `DidYouKnow`, `Slab`, `GetReady`, `AddressLookUp`, `HttpsNotice`, `PlanNotice`, the charts (`charts.tsx`, `boardCharts.tsx`) and the merge dialogs. |
| `src/pages/` | One file per area: matches, results, templates, venues, referees, competitions, stats, settings, server settings and people, the setup wizard (`Setup.tsx`), the HTTPS guide, link a watch, importing (`Import.tsx`), the quiz, the match screen setup, Try a match, More, sign-in and the account pages. |
| `src/match/` | Try a match: the match rules in TypeScript (`engine.ts`, passing the shared match cases), the watch's buttons (`controller.ts`) and screens (`TryMatch.tsx`). |
| `src/watchPreview.ts` | What the match screen setup's watch pictures show at each moment, by the watches' rules. |
| `src/replay.ts`, `src/contours.ts`, `src/pitchEnds.ts`, `src/trackFile.ts` | The replay's timeline; the heatmap's contour bands; who attacked from each end; reading FIT, GPX and TCX files. |
| `src/stats.ts`, `src/games.ts` | Stats' arithmetic; opening the match list on a chart's games. |
| `src/matchSheet.ts`, `src/report.ts` | Matches as a spreadsheet, and the match report. |
| `src/newMatch.ts` | Where a new match starts: the usual role and format, or its template's. |
| `src/settings.ts` | The user's settings, with defaults from the browser's language. |
| `src/plans.ts`, `src/merging.ts`, `src/tips.ts`, `src/weather.ts`, `src/history.ts`, `src/search.ts`, `src/photos.ts` | Plans in words; merging; Did you know; match weather; how much you've worked with each referee or venue; match search; shrinking photos before upload. |
| `src/site/` | lawfive.app's playable parts, built by `pnpm build:site` (`src/site/site.css` adds what they need on the site). |

Reading an import file is the server's job (`POST /v1/import/file`).

## Conventions

- The look follows [DESIGN.md](../DESIGN.md): Barlow, Barlow Condensed and JetBrains Mono, the color tokens in `src/styles.css`, and Phosphor icons through `Icon` in `src/components/ui.tsx`.
- No external fonts, scripts or trackers: fonts are bundled from Fontsource packages (`src/main.tsx`). The only outside requests are map tiles from the providers set on the server (`MAP_STYLE_URL`, `MAP_TILE_URL`, `MAP_SATELLITE_URL`); address lookups and weather go through the server.
- Related records (venue, competition, referee, template) are chosen with `Picker`, since lists grow long. Plain selects are for short fixed lists.
- A field whose meaning isn't obvious gets an `info` explanation (an ⓘ that opens on tap, so it works on phones).
- The map library loads only on pages with a map. With satellite imagery set up on the server, maps get a Map / Satellite switch, remembered in the browser.
- Saves send the version the record was loaded at; if another device changed it meanwhile, the server refuses and the page says so.
- New records get their UUID in the browser, as in the apps.
- For a visible change, check `pnpm screenshots` against the demo, light and dark, desktop and phone.
