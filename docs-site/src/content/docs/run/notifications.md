---
title: Notifications
description: How phone notifications reach people on a self-hosted LawFive server, what the push relay sees, its limits, and how to turn it off.
---

A LawFive server can tell people's phones about two things:

- **A new weather risk** to a match in the next 3 days.
- **Matches from integrations:** an app with an API key, such as an assignor's, added a match, or canceled, postponed, moved or removed one that hasn't kicked off. Only keys set to notify count, and changes people make themselves never do. A key's changes are collected for a minute and sent as one notification, except a change to a match within a day, which goes at once.

Each person turns each one on in the app ([weather risks](/apps/phones/#weather-risks), [matches from integrations](/apps/phones/#matches-from-integrations)), and they're off until they do. It's on Android for now. The iPhone will follow.

Match reminders are separate. The phone schedules those itself, so they work on any server and don't use any of this.

## Why there's a relay

Only an app's publisher can send notifications to its store builds, because that takes keys tied to the app. A self-hosted server can't hold them, so it sends through a small relay the project runs at `push.lawfive.app`. There's nothing to set up or sign up for.

```
Your server → LawFive's relay → Firebase → the LawFive app → back to your server for the details
```

## What the relay sees

| It sees | It doesn't see |
|---|---|
| Your phones' Firebase tokens, sealed so only the relay can read them | Names, teams or accounts |
| Your server's address | Venues, kickoff times or forecasts |
| The kind of notification (a weather risk, matches from integrations, or a test), and a random ID for the match or the change | What the notification will say |
| The address your server sends from | Anything else in your database |

The relay stores no copy of the tokens. It keeps a scrambled form of each one and your server's address, to count the day's notifications, and clears them the next day.

The server sends only a fixed kind of event and an ID, so no server can put its own words on anyone's phone. The app asks its own server what's going on and writes the notification itself.

Firebase is Google's service, so Google sees each phone's token and that a notification was sent to it. If that doesn't suit you, turn this off.

## Limits

| Limit | Each day | Each minute |
|---|---|---|
| Per phone | 25 | 5 |
| Per server | 250 | 120 |

Days reset at midnight UTC, and only notifications that reached Firebase count. If a server reaches a limit, it stops sending until then and says so in its logs:

```
Over the push relay's server limit; no notifications until 2026-11-08T00:00:00.000Z
```

These limits are comfortable for a server with a few referees. If yours needs more, write to [support@lawfive.app](mailto:support@lawfive.app) with its address. Any server can use the relay without signing up; one that misuses it can be blocked. A server with a raised limit, such as the hosted one, may also be given a key (`RELAY_KEY`), so nobody else can use up its limit; a self-hosted server doesn't need one. The relay notes a server's address in its logs once a day when the server reaches its limit, or tries to send while blocked, and nothing else.

## Testing it

As an admin, turn on **Tell me about weather risks** in the Android app, then choose **Send a test notification** under **Settings → Server** on the website. It goes to your own phones. If it doesn't arrive, the page says why.

## Turning it off

```ini title=".env"
PUSH_RELAY_URL=off
```

Then restart with `docker compose up -d`. The server stops offering notifications, and the setting goes away in the apps.

## Using another relay

`PUSH_RELAY_URL` can point at a relay of your own, but it only works with apps built to match. A relay holds the Firebase keys for one set of apps, so you'd need your own Firebase project and your own builds of the apps. See [the push relay](/contribute/relay/).

## If notifications don't arrive

See [Troubleshooting](/run/troubleshooting/#notifications-dont-arrive).
