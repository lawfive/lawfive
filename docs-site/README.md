# LawFive docs

The site at [lawfive.dev](https://lawfive.dev), for people running a server, using the API or building LawFive: [Astro Starlight](https://starlight.astro.build), static files, on Cloudflare Pages. It isn't part of the self-hosted server, and referee help doesn't belong here.

```sh
npm install
npm run dev      # http://localhost:4321
npm test         # builds, then checks every internal link and anchor, and that nothing personal got in
```

This folder uses npm with its own lockfile, outside the repo's pnpm workspace, so Cloudflare needs no pnpm setup and nothing here touches the root `pnpm-lock.yaml`.

## Writing

Pages are in `src/content/docs/`; the sidebar is in `astro.config.mjs`. Write for someone competent who hasn't seen LawFive, and leave out requirement IDs. Keep each page true to its sources (requirement files are in `docs/requirements/`):

| Page | From |
|---|---|
| `run/settings`, `run/services` | `.env.example`, `compose.yaml`; `security.md` (SEC-14) |
| `run/https` | `web/src/pages/HttpsGuide.tsx`, the same guide inside a server; `security.md` (SEC-14) |
| `run/first-run`, `run/people` | `server-settings.md`, `people.md`, `plans-and-limits.md` |
| `run/responsibilities` | `compose.yaml`, `SECURITY.md`, `push-relay.md`, and what a self-hosted server shows (SITE-5's links only on the hosted service) |
| `api/keys`, `api/webhooks` | `api-keys.md`, `webhooks.md` |
| `run/notifications`, `contribute/relay` | `push-relay.md`, `relay/README.md` |
| `run/requirements`, `run/install`, `run/upgrades`, `run/backups` | `compose.yaml`, `.env.example`, `server/README.md`, `versions.md` (VER-5) for image tags and releases; `data-export.md` (DATA-2, DATA-4) for backups |
| `run/troubleshooting` | `server-settings.md` (ADM-7), `security.md` (SEC-2, SEC-12, SEC-14), `webhooks.md` (HOOK-4), and the server's log messages (`server/src/push.ts`) |
| `apps/phones` | `android.md`, `iphone.md` (APP-2, APP-6, APP-13 to APP-15), and STAT-13 (`stats.md`), DUP-12 (`merging.md`), PUSH-5 (`push-relay.md`), NOTE-4 (`integration-notifications.md`), WEB-14 (`web-app.md`) |
| `apps/watches` | `sync.md` (SYNC-1, SYNC-8, SYNC-9), `security.md` (SEC-13), `wear-os-and-apple-watch.md` (WCH-4), APP-7 (`android.md`), IOS-9 (`iphone.md`) |
| `api/overview`, `api/sync` | `schema/src/endpoints.ts`, `server/README.md`, `agent-descriptions.md` |
| `index.mdx` | `compose.yaml`, `.env.example` |
| `contribute/architecture` | `docs/ARCHITECTURE.md` |
| `contribute/license-security` | `security.md`, `LICENSE`, `NOTICE`, `SECURITY.md` |
| `contribute/*` | Each component's README |

`api/reference.md`, `api/examples.md`, `public/openapi.json`, `public/schemas/`, `public/agents/` and `public/llms.txt` aren't committed: `scripts/sync-api.mjs` makes them from `schema/generated/` before each build. The examples' source is `schema/guides/`.

## Look

It follows [DESIGN.md](../DESIGN.md)'s Pitch & Scoreboard, kept calm for reading: the stadium board across the top, the sidebar on the grass with the current page as a tunnel into it, and the words on a chalk panel (a dark slab at night), with nothing striped or green behind them. Only the home page's hero sits on the grass, with the halfway line and center circle beside it.

| File | What it is |
|---|---|
| `src/styles/lawfive.css` | Its own copy of the website's color tokens (`web/src/styles.css`), as `site/` keeps one: change each. Starlight's colors are set from them. |
| `src/code-themes.mjs` | Code blocks in the same colors, a light and a dark theme. |
| `src/components/SiteTitle.astro`, `Hero.astro` | The L5 mark and LAWFIVE on the board, and the home page's hero. The mark's shapes come from `web/src/logo.ts`, so they can't drift. |
| `public/icon.svg`, `favicon.ico`, `apple-touch-icon.png` | Copies of `web/public/`'s, made by `pnpm icons` in `web/`. Copy them again when they change. |
| `astro.config.mjs` | The fonts, and Starlight's icons swapped for Phosphor at build time. |

`npm run build` passes `--force`; otherwise Astro keeps rendered pages in `node_modules/.astro` linked to an old code stylesheet after the code colors change.

## Deploying

A Cloudflare Pages project connected to the GitHub repo, separate from the marketing site's (Workers & Pages → Create → Pages → Connect to Git):

- **Production branch:** `main`
- **Framework preset:** Astro
- **Root directory:** `docs-site`
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Build watch paths** (Settings → Builds): include `docs-site/*` and `schema/generated/*`

Node's version comes from `.node-version`. Then add `lawfive.dev` under Custom domains.

## Going live

Until the code is public, every page has a preview banner and asks search engines not to index it. When it's ready:

1. Make the repo and the image at `ghcr.io/lawfive/lawfive` public. If either moves, search this folder for `lawfive/lawfive`.
2. Set `DOCS_PUBLIC=true` in the Pages project's environment variables, and redeploy.
