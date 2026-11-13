# Server settings (ADM)

Setting up and running a self-hosted server from the website: the setup wizard, Settings → Server, the HTTPS notice and the health check. It's on the website only, for admins.

## Setting up a new server

- **ADM-5** **A setup wizard**, so a new server needn't be set up by knowing its environment. While a server has no accounts, the website opens on it:
  1. A **setup code** from the server's logs, made at each start and held in memory until the first account exists, so whoever reaches a public server first can't take it (R-15). It's asked for with `ADMIN_EMAILS` set too (SEC-8), and a server emptied while it runs makes a new one.
  2. The **admin account**: name, email and password.
  3. Signed in, **the server's address**, read-only from `PUBLIC_URL`, saying if it isn't the one in use or isn't HTTPS, as watches and phones need.
  4. **Who can join**, closed by default.
  5. **Email**, with a test once it's set.
  6. **Maps and weather**: address search and weather on or off, and satellite imagery.
  7. **What next**: get the app, link a watch, invite people, and plans for what each account may use (PLAN-1).

  A bar shows progress and it can go back. Every step after the account can be skipped, and anything the environment sets shows fixed (ADM-1). It comes back on the next visit until finished or skipped. A server that already has accounts never sees it. Everything in it is in Settings → Server and People afterward.

## Settings → Server

- **ADM-1** **Settings → Server**, for admins, at the top of Settings. One rule for every setting there, and for sign-up on the People page:
  - a value in the environment is shown and fixed ("Set by `SMTP_URL` on the server");
  - otherwise an admin can set it, and it takes effect at once, without a restart;
  - otherwise the default.

  An empty environment variable counts as unset.
- **ADM-2** **What it covers**: email (`SMTP_URL`, `MAIL_FROM`); maps (`MAP_STYLE_URL`, `MAP_STYLE_DARK_URL`, `MAP_STYLE_ATTRIBUTION`, `MAP_TILE_URL`, `MAP_ATTRIBUTION`, `MAP_SATELLITE_URL`, `MAP_SATELLITE_ATTRIBUTION`); address search (`GEOCODER_URL`); weather (`WEATHER_URL`, `WEATHER_HISTORY_URL`, `WEATHER_API_KEY`, `WEATHER_DAILY_LIMIT`); webhooks to private addresses (`WEBHOOK_ALLOW_PRIVATE`); room per account, set by plans (Settings → Server → Plans, PLAN-1; `ACCOUNT_STORAGE_LIMIT_MB` sets only a new server's first plan); and who can sign up (`SIGN_UP`, USR-7). Values take the same form as the environment's, `off` included.
  - These stay in the environment only, as the server needs them before it can read its database or tell who the admins are, or because changing them strands data: `DATABASE_URL`, `POSTGRES_PASSWORD`, `AUTH_SECRET`, `PUBLIC_URL`, `ADMIN_EMAILS`, `PORT`, `UPLOADS_DIR`, `S3_URL`.
- **ADM-3** **Secrets** (the SMTP address, which holds its password, and the weather API key) are stored encrypted with a key made from `AUTH_SECRET` and never sent back. The page says whether one is set, with Clear, and typing replaces it. After a new `AUTH_SECRET` they count as unset and are entered again.
- **ADM-4** **Send a test email** sends to the admin asking, through the saved settings, and shows the SMTP server's own words if it fails.

## HTTPS and health

- **ADM-6** **Saying when a server isn't on HTTPS.** Once past the wizard, an admin sees a notice at the top of every page while the page isn't on HTTPS or `PUBLIC_URL` doesn't start `https://`, saying why it matters, in softer words on localhost.
  - It can be hidden on that browser. Settings and Settings → Server keep an **HTTPS** row with the state either way.
  - **Set up HTTPS** opens a guide (Settings → Server → HTTPS, also linked from the wizard's address step): the state, then Caddy, Traefik, nginx with Certbot, Cloudflare Tunnel and Tailscale Funnel, each with when it suits and its trade-off, what to copy with your domain filled in, and setting `PUBLIC_URL`. The Traefik example includes a fallback route that answers 503 while the server starts or is replaced.
  - LawFive doesn't hold certificates itself.
- **ADM-7** **What counts as healthy.** `GET /health`, which Docker's healthcheck calls, answers `ok` when the server can reach its database within 2 seconds, and 503 otherwise.
  - Nothing else affects it: weather, webhooks, email, the push relay and photo storage can each be down with the server still in service.
  - While starting, the image's healthcheck runs every 2 seconds (Docker 25 and later), so a proxy that waits for healthy, such as Traefik, routes to a new server a moment after it's ready.

## Status

ADM-1 to ADM-7 are built; the wizard has been run through on a real Docker install, and Caddy tried from the HTTPS guide.

Not built yet:
- Email hasn't been tried with a real SMTP server.
- The HTTPS guide's methods other than Caddy have had their files checked but not been run for real.
