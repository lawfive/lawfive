# LawFive: server

The API, accounts, sync, the web UI's files and background jobs (weather, webhooks, notifications, assignor calendars). TypeScript on Node 24 with [Hono](https://hono.dev), [Drizzle](https://orm.drizzle.team) on Postgres and [Better Auth](https://www.better-auth.com). It ships as one Docker image, the same for self-hosting and the hosted service. How it fits with the apps is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md); the guide for running a server is at [lawfive.dev](https://lawfive.dev).

## Run it

**With Docker** (from the repo root):

```sh
cp .env.example .env         # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d         # server on http://localhost:3000, Postgres in a volume
docker compose logs server   # the setup code; open the server and it walks you through the rest
```

**From the published image:** CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the tests on every push, then builds the image from `main` and release tags for Intel and ARM and publishes it as `ghcr.io/<owner>/<repo>`: `latest` and the version for a release, `edge` for main, and `sha-<commit>` (VER-5; releasing is in [CONTRIBUTING.md](../CONTRIBUTING.md#releasing)). On the Docker host, copy `compose.yaml` and `.env.example` (as `.env`), set `LAWFIVE_IMAGE=ghcr.io/<owner>/<repo>:latest` and `AUTH_SECRET`, and run `docker compose pull && docker compose up -d`. The same two commands update it. If the image is private, `docker login ghcr.io` first with a GitHub token that has `read:packages`.

**Without a database:** `pnpm demo` here runs it in memory (PGlite) with sample data; then `pnpm dev` in `web/` and open http://localhost:5173. Its weather is made up, so every risk badge shows; `DEMO_WEATHER=live pnpm demo` fetches real forecasts instead.

**For development** (Node 24+, pnpm), with the database from Docker:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up -d db
cd server && pnpm install && pnpm dev     # reads ../.env, restarts on changes
```

## Configure it

The first time you open a new server, a wizard asks for the setup code from its logs, makes your admin account and walks through the settings ([server settings](../docs/requirements/server-settings.md)). Most settings can then be changed in the web app (Settings → Server, and sign-up on People) or fixed in the environment, which wins. What each account may use is set by plans (Settings → Server → Plans, [plans and limits](../docs/requirements/plans-and-limits.md)). `.env.example` lists every setting.

- **HTTPS:** the watch and phone apps need a valid certificate, so a public server goes behind a reverse proxy (Caddy, Traefik, nginx; Settings → Server → HTTPS has a guide). Set `PUBLIC_URL` to its `https://` address, and `API_URL` if phones should use another address for the API.
- **Behind a proxy:** set `TRUSTED_PROXIES` (`private`, or the proxy's network such as `172.18.0.0/16`). It's empty by default, so everyone arriving through a proxy counts as the proxy's address for the limits on wrong passwords. Behind a second proxy such as Cloudflare, also set `TRUSTED_IP_HEADER` to the header carrying the visitor's address (`CF-Connecting-IP`).
- **Admins:** `ADMIN_EMAILS` (optional) names admins by address. It doesn't skip the setup code.
- **Who can join:** `SIGN_UP` is `open`, `approval` (an admin approves each account on People) or `closed` (invitations only). A new server's first account can always be made and becomes admin.
- **Email:** set `SMTP_URL` and `MAIL_FROM` to email invitations, approvals and password reset links, and to confirm a change of email by a link to the new address. Without them, changing email needs only the password, and admins copy invitation and reset links from People.
- **Webhooks** refuse private and local addresses unless `WEBHOOK_ALLOW_PRIVATE=true`, for receivers on your own network.
- **Notifications** (new weather risks, matches an integration adds or changes) go through the project's [push relay](../relay/README.md), since only the apps' publisher can reach the store apps. It sees no match details. `PUSH_RELAY_URL=off` stops them, or names another relay. `RELAY_KEY` is only for a server the relay has given its own key; self-hosted servers leave it unset.
- **Photos** are kept in the `uploads` volume (`/data/uploads` in the container, or `UPLOADS_DIR`; back it up with the database), or in an S3-compatible bucket with `S3_URL`. `ACCOUNT_STORAGE_LIMIT_MB` only sets a new server's first plan; by default there's no limit.
- **Maps** default to OpenFreeMap's vector map (free, no key, with a dark style). `MAP_STYLE_URL` (with `MAP_STYLE_DARK_URL`, `MAP_STYLE_ATTRIBUTION`) chooses another MapLibre style, or `off` for raster tiles from `MAP_TILE_URL` (OpenStreetMap's by default, also used by apps that can't draw vector maps). `MAP_SATELLITE_URL` adds satellite imagery, which makes placing pitches much easier; providers need a key.
- **Address lookup** is OpenStreetMap's Nominatim by default (`GEOCODER_URL`), which suits a personal server.
- **Weather** comes from Open-Meteo: forecasts (`WEATHER_URL`) and past weather for played matches that have none kept, such as imported ones (`WEATHER_HISTORY_URL`), within `WEATHER_DAILY_LIMIT` calls a day. Either can be `off`. `WEATHER_API_KEY` is for Open-Meteo's paid plan.
- **Backups:** Settings → Account has Download everything (a zip of the account) and Restore from an export. A restore is written to the container's temporary folder while it's read, so it needs that much free space (at most 2 GB).
- **Version:** Settings → About and `GET /v1/meta` show it. CI passes it in from git (`tools/version.sh server`); an image you build yourself says `dev` unless you pass `--build-arg LAWFIVE_VERSION=… --build-arg LAWFIVE_COMMIT=…`, and a server run from a checkout reads it from git.

## Test it

| Command (in `server/`) | What it does |
|---|---|
| `pnpm test` | Type check, then the API tests, on PGlite (Postgres in-process), so no database or Docker is needed. |
| `pnpm dev` | Runs the server, restarting on changes. |
| `pnpm demo` | Runs it in memory with sample data (`src/demoData.ts`); sign in as `demo@lawfive.dev` / `lawfive-demo`. |
| `pnpm fixtures` | Writes the phones' snapshot fixtures to `schema/generated/fixtures/`. Run it after changing the demo's data or an endpoint's answer; `pnpm test` fails while they're stale. |
| `pnpm db:generate` | After changing `src/db/tables.ts`, writes a new migration to `drizzle/`. Migrations run when the server starts. |

## The API

Everything is under `/v1`. The full reference is [schema/generated/API.md](../schema/generated/API.md), and as OpenAPI 3.1 [schema/generated/openapi.json](../schema/generated/openapi.json), both generated from [schema/src/endpoints.ts](../schema/src/endpoints.ts). The tests check the server against it: its routes must be exactly the ones listed, and every answer in the tests must match its description field for field. A new or changed endpoint goes there first (then `pnpm generate` in `schema/`).

- Apps sign in, take the token from the `set-auth-token` response header and send it as `Authorization: Bearer <token>`. The web UI uses the session cookie. A watch links with a code instead (RFC 8628).
- Scripts and integrations use an API key made in Settings, sent the same way, which reaches only the collections it was given.
- Sessions last 90 days and renew each day they're used, so a watch that syncs now and then stays linked.
- Records are the types in [schema/](../schema/), one collection each, with ids chosen by the client. `GET /v1/changes` is for sync.

### How records are stored

All record types share one `records` table: the record as JSON (validated against the schema on the way in), plus the user, type, `version`, `updatedAt`, `deletedAt` and a sequence number `seq`. Each write takes the next `seq`, and `GET /v1/changes` returns everything after the last `seq` a device saw. Writes for one user are serialized with a Postgres advisory lock, so sequence numbers commit in order and sync never skips a record. Deleted records stay as markers so other devices learn of the deletion.

## Layout

Everything is in `src/`, one file per area:

- **Startup and HTTP:** `main.ts` (config, database, migrations, HTTP; serves `web/dist`, or `WEB_ROOT`, when it exists), `app.ts` (routes, security headers, body limits), `config.ts` (environment variables).
- **Accounts and access:** `auth.ts` (Better Auth), `access.ts` (sign-up, approval, admins, People, invitations, a new server's setup code; the wizard is `web/src/pages/Setup.tsx`), `limits.ts` and `lockout.ts` (who a request counts as, limits on tries, the lock after wrong passwords), `devices.ts`, `appSignIn.ts` (a phone signing in with a code from the website), `apiKeys.ts`, `serverSettings.ts` (Settings → Server over the environment and database, secrets encrypted), `plans.ts` and `usage.ts` (plans, trials, reminders, and what's refused over a limit).
- **Records and sync:** `records.ts` (deleting a match deletes its match reports and their tracks), `watch.ts` and `watchTrack.ts` (the watch's endpoints and formats, which matches are on which watch, a track arriving in chunks), `tracks.ts` (gzipped tracks, figures from `schema/src/track.ts`), `attachments.ts` and `storage.ts` (photos in a folder or an S3-compatible bucket), `backup.ts` and `zipFile.ts` (Download everything and restore), `share.ts` (share links).
- **Features:** `import.ts` and `importFile.ts` (importing CSV, Excel or JSON, with a dry run; columns in `schema/src/importColumns.ts`), `feeds/` (assignor calendars), `duplicates.ts` and `merge.ts` (duplicate referees and venues), `stats.ts` (stats and CSV; which games match a filter is `schema/src/stats.ts`), `calendar.ts` (the iCalendar feed), `quiz.ts` (questions from `schema/quiz/`), `geocode.ts`, `weather/` (the Open-Meteo client, risk rules in `assess.ts`, the refresh job in `service.ts`), `zones.ts` (time zones without a library).
- **Outgoing:** `push.ts` (notifications through the relay), `notices.ts` (what an API key did to matches, for the phones), `webhooks.ts` (sending, signing, retrying, staying off the server's own network), `mail.ts` (SMTP and the messages).
- **Demo:** `demo.ts`, `demoData.ts` (sample data and made-up weather), `fixtures.ts` (the phones' fixtures: the demo on a fixed clock, read back through the API).
- **Database:** `db/tables.ts`; `drizzle/` (outside `src/`) holds the migrations generated from it, and the odd data-only one (`drizzle-kit generate --custom`).

`test/` holds the API tests: `contract.ts` checks requests and answers against the API description, `spec.test.ts` that the routes match it. `Dockerfile` builds the image with the web UI, from the repo root (see `compose.yaml`).

## Pitfalls

- Never edit a committed migration; add a new one.
- `SIGN_UP` in the environment overrides the choice on People. An `.env` copied from an older `.env.example` may set `SIGN_UP=open`; remove the line or set your choice.
- Behind a proxy without `TRUSTED_PROXIES`, every visitor shares the proxy's limit on tries.
