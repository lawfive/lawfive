---
title: What you need
description: What a self-hosted LawFive server needs before you start.
---

A LawFive server is one Docker image and a Postgres database. `compose.yaml` runs both, so there's nothing else to install.

| You need | Why |
|---|---|
| A machine with Docker and Docker Compose | Runs the server and its database. Images are published for Intel and ARM. |
| A little time in a terminal | To copy two files, set one secret and read one code from the logs. The rest happens in the browser. |
| A domain or address with HTTPS, for real use | [Watches and phones need it](/run/https/). Trying it out on `localhost` doesn't. |

You can also add these later:

- **An SMTP server**, to email invitations and password resets. Without one, admins copy the links and send them themselves.
- **An S3-compatible bucket**, to keep photos outside the Docker volume.
- **A map provider key**, for satellite imagery when placing pitches.

These are all covered in [Email, maps and weather](/run/services/).

## How big a machine

LawFive is light. Measured on a running server with a few accounts:

| | Memory | Disk |
|---|---|---|
| The server | about 80 MB | its image, about 610 MB |
| Postgres | about 50 MB | its image, about 430 MB, and the database, from about 65 MB |
| A reverse proxy such as Caddy | about 20 MB | its image, about 90 MB |

A machine with 1 GB of memory and one CPU is plenty, with a few GB of disk free. Photos are what grow as people use it, and [plans](/run/people/#plans-and-limits) limit how much each account can keep.

## What your server talks to

Out of the box, a server uses a few free outside services. Each one can be changed or switched off with the setting beside it (see the [settings reference](/run/settings/)).

| Service | Used for | Setting |
|---|---|---|
| [OpenFreeMap](https://openfreemap.org) | The map | `MAP_STYLE_URL` |
| OpenStreetMap | Map tiles for apps that can't draw vector maps | `MAP_TILE_URL` |
| OpenStreetMap's Nominatim | Finding addresses | `GEOCODER_URL` |
| [Open-Meteo](https://open-meteo.com) | Forecasts and past weather | `WEATHER_URL`, `WEATHER_HISTORY_URL` |
| LawFive's push relay | [Notifications on phones](/run/notifications/) | `PUSH_RELAY_URL` |

## What's different on your own server

Only the app's publisher can send notifications to the store apps, so a self-hosted server sends them through the project's [push relay](/run/notifications/). It works without signing up, within daily limits.

Signing in with Apple or Google isn't built. Self-hosted servers use email and password.
