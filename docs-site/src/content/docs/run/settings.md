---
title: Settings reference
description: Every setting a LawFive server takes, and where each one can be set.
---

Most settings can be changed by an admin under **Settings → Server**, and take effect straight away, with no restart. The same settings can be set in `.env` instead.

A setting's value comes from the first of these that has one:

1. **The environment.** The web app shows it but can't change it ("Set by `SMTP_URL` on the server"). An empty variable counts as unset.
2. **Settings → Server**, set by an admin.
3. **The default.**

Secrets entered in the web app (the SMTP address, the weather API key, and people's assignor calendar links) are stored encrypted with a key made from `AUTH_SECRET`, and never sent back. After a new `AUTH_SECRET` they count as unset, and have to be entered again; an assignor calendar pauses and says so.

## Set in the environment only

The server needs these before it can read its database or tell who the admins are, or changing them would strand data.

| Setting | What it does |
|---|---|
| `AUTH_SECRET` | **Required.** Signs sign-in sessions. At least 32 characters: `openssl rand -base64 32`. |
| `PUBLIC_URL` | The address people and apps use to reach the server. |
| `POSTGRES_PASSWORD` | The database password. Set it before the first start. |
| `DATABASE_URL` | The database, when running outside Compose. Compose sets this itself. |
| `ADMIN_EMAILS` | Admins by email, comma-separated. |
| `PORT` | Where port 3000 is published. Use `127.0.0.1:3000` behind a proxy on the same machine. Outside Docker, the port the server listens on. |
| `UPLOADS_DIR` | Where photos are kept, when running outside Docker. In Docker it's the `uploads` volume, at `/data/uploads`. |
| `S3_URL` | An S3-compatible bucket for photos, instead of a folder. |

These are in the environment too, and aren't in Settings → Server:

| Setting | What it does |
|---|---|
| `LAWFIVE_IMAGE` | The image to run. Unset, Compose builds from source. |
| `API_URL` | The address phones use for the API, if it isn't `PUBLIC_URL`. |
| `TRUSTED_PROXIES` | The proxies whose word on the visitor's address is believed: addresses, ranges such as `172.18.0.0/16`, or `private` for any private network. Empty by default, which believes none. Behind a reverse proxy, set it ([Set up HTTPS](/run/https/#finish-up)). A mistyped entry stops the server starting, naming it. |
| `TRUSTED_IP_HEADER` | The header a second proxy puts the visitor's address in, such as `CF-Connecting-IP`. Read only from a proxy in `TRUSTED_PROXIES`. |
| `PUSH_RELAY_URL` | Where notifications to phones go, `https://push.lawfive.app` by default. `off` stops them. |
| `RELAY_KEY` | Only for a server the push relay has given a key (the hosted service). Leave it unset. |
| `ACCOUNT_STORAGE_LIMIT_MB` | Megabytes of photos and tracks for a new server's first plan; after that, [plans](/run/people/#plans-and-limits) set it. No limit by default. |

## Also in Settings → Server

| Setting | What it does | Default |
|---|---|---|
| `SIGN_UP` | `open`, `approval` or `closed` (on the People page). See [People and sign-up](/run/people/). | `open` |
| `SMTP_URL` | The SMTP server: `smtp://user:password@host:587` for STARTTLS, or `smtps://…:465`. | No email |
| `MAIL_FROM` | Who email comes from: `LawFive <lawfive@example.com>`. | |
| `MAP_STYLE_URL` | A MapLibre style, or `off` for raster tiles. | OpenFreeMap's Liberty |
| `MAP_STYLE_DARK_URL` | The style for dark mode. | OpenFreeMap's Dark |
| `MAP_STYLE_ATTRIBUTION` | The credit the style needs. | OpenFreeMap's |
| `MAP_TILE_URL` | Raster tiles, with `{z}/{x}/{y}`. | OpenStreetMap's |
| `MAP_ATTRIBUTION` | The credit the tiles need. | OpenStreetMap's |
| `MAP_SATELLITE_URL` | Satellite imagery as a second map layer. Providers need a key. | None |
| `MAP_SATELLITE_ATTRIBUTION` | The credit the imagery needs. | |
| `GEOCODER_URL` | A Nominatim-compatible address search, or `off`. | `https://nominatim.openstreetmap.org` |
| `WEATHER_URL` | Forecasts from Open-Meteo, or `off`. | `https://api.open-meteo.com` |
| `WEATHER_HISTORY_URL` | Past weather for played matches that have none, or `off`. | `https://archive-api.open-meteo.com` |
| `WEATHER_API_KEY` | For Open-Meteo's paid plan. | None |
| `WEATHER_DAILY_LIMIT` | The most weather calls a day. | 5000 |
| `WEBHOOK_ALLOW_PRIVATE` | `true` lets webhooks send to private and local addresses, and assignor calendars be read from them (and over http), for testing. | Refused |

The repository's `.env.example` lists all of these with notes.
