---
title: Upgrades
description: Update a self-hosted LawFive server to a newer version.
---

Read the [release notes](https://github.com/lawfive/lawfive/releases) first: they list what changed and anything to do before upgrading. Then, from the folder with `compose.yaml`:

```sh
docker compose pull
docker compose up -d
```

Built from source instead? Update your checkout, then run `docker compose up -d --build`.

The database is brought up to date when the server starts, so there's no separate step. [Back up](/run/backups/) first, because migrations only go forward.

To see what you're running, look under **Settings → About**, or ask the server:

```sh
curl https://lawfive.example.com/v1/meta
```

To stay on a known version rather than `latest`, set `LAWFIVE_IMAGE` to a [specific tag](/run/install/#image-tags).

## Apps on older servers

Your server can be older than the apps. It publishes what it supports in `GET /v1/meta`, and the apps adapt. You don't have to update on the same day as an app release.

## Before you upgrade

`SIGN_UP` in the environment beats a choice made on the People page, and the old `.env.example` set `SIGN_UP=open`. If your `.env` came from that version and you chose differently on the People page, remove the line or set it to your choice before upgrading.
