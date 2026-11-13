---
title: The server and web app
description: Develop the LawFive server and web app locally.
sidebar:
  label: Server and web app
---

You'll need Node 24 or later and pnpm. Install from the repository's root:

```sh
pnpm install
```

## The demo server

This is the quickest way to work on anything. It runs in memory, with sample data and no database or Docker.

```sh
cd server && pnpm demo
cd web && pnpm dev       # in a second terminal
```

Open `http://localhost:5173`, and sign in as `demo@lawfive.dev` with the password `lawfive-demo`.

The demo's weather is made up, so every risk badge shows. `DEMO_WEATHER=live pnpm demo` fetches real forecasts instead. It forgets everything when it restarts.

## With a real database

```sh
cp .env.example .env     # then set AUTH_SECRET
docker compose -f compose.yaml -f compose.dev.yaml up -d db
cd server && pnpm dev    # reads ../.env, and restarts on changes
```

## Commands

| Folder | Command | What it does |
|---|---|---|
| `server/` | `pnpm test` | Type check, then the API tests. They use an in-process Postgres, so they need no database or Docker. |
| `server/` | `pnpm dev` | Runs the server, restarting on changes. |
| `server/` | `pnpm db:generate` | After changing `src/db/tables.ts`, writes a new migration. |
| `web/` | `pnpm test` | Type check, then the unit tests in `test/`. |
| `web/` | `pnpm build` | Builds the web app to `dist/`. |
| `web/` | `pnpm screenshots` | Takes pictures against the demo: light and dark, desktop and phone. |
| `web/` | `pnpm icons` | Remakes LawFive's icons from the L5 mark in `src/logo.ts`, after the mark changes. Needs Google Chrome. |
| `web/` | `pnpm build:site` | Builds lawfive.app's playable parts (the quiz, the match screen setup, Try a match and the replay) into `site/public/play/`. |
| `schema/` | `pnpm generate` | Remakes everything generated from the schema. |
| `schema/` | `pnpm test` | Checks the schema and its examples. |

## Rules that keep it working

- **Never edit a committed migration.** Add a new one. Migrations run when the server starts.
- **Describe new endpoints in `schema/src/endpoints.ts`.** The tests check that the server's routes are exactly the ones listed, and that every answer is one it describes.
- **Check visible changes on screen,** with `pnpm screenshots`.
