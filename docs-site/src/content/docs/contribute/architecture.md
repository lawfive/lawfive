---
title: How it fits together
description: The parts of LawFive, and how data moves between them.
---

**The server owns all data.** Every client reads and writes through one versioned API, including the web app. The server is one Docker image with Postgres, the same for self-hosters and the hosted service.

## The parts

| Part | Its job |
|---|---|
| Shared contract (`schema/`) | The data model and every endpoint ([the API reference](/api/reference/)). It generates JSON Schema, OpenAPI, Kotlin and Swift, and the shared match cases every watch runs, Garmin's in Monkey C. |
| [Server](/contribute/server-web/) | The source of truth: accounts, the API, the web app's files, and background jobs for weather, webhooks, notifications and reading assignor calendars. |
| [Web app](/contribute/server-web/) | Management: matches, reports, stats, people and settings. |
| Phone apps ([Android](/contribute/android/), [iPhone](/contribute/iphone/)) | Match day: an offline copy of your matches, reminders, photos, and the bridge to a Garmin watch. |
| Watch apps ([Garmin](/contribute/garmin/), [Wear OS](/contribute/android/#wear-os), [Apple Watch](/contribute/iphone/#apple-watch)) | Run the match. They hold only upcoming matches and the records of matches played, until those are confirmed as uploaded. |

## Sync

**Apps choose their server.** At sign-in, they offer the hosted service or your own address. Self-hosted servers often run older versions than the apps, so a server publishes what it supports, and the apps adapt.

**Phones work offline.** Signal at grounds varies widely, so each phone keeps a local database and an outbox. It sends the outbox, then asks what changed since its last sync with `GET /v1/changes`. Each change carries the version it was based on, so a conflict can be spotted.

**Watches take one of two routes:**

- **Directly.** A Garmin watch makes requests through the Garmin Connect app. Wear OS and Apple Watch use their own connection.
- **Through the phone.** On Android, a Garmin watch's requests go through the LawFive app using Garmin's SDK, which works without signal at the ground once the phone has synced. The same is built for iPhone, but hasn't been tried on hardware yet.

## How records are stored

All record types share one table: the record as JSON, validated against the schema on the way in, plus its user, type, version, times and a sequence number. Writes for one user are serialized with a Postgres advisory lock, so sequence numbers commit in order, and [sync](/api/sync/) never skips a record.

## Tracks

Every source of position and heart rate, the watches and imported files alike, is converted into one track format before upload. The server works out the figures, so they're the same whichever watch recorded them.

## What the project runs

The store apps are signed with the project's keys, so a few things can't be self-hosted the usual way. Notifications go through [a relay the project runs](/contribute/relay/), because only the app's publisher can send to the store apps. Self-hosters can also build the apps from source.
