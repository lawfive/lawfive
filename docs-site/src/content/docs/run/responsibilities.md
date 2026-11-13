---
title: Running it for others
description: What you take on when other people use your LawFive server.
---

A server you run is yours. When other people use it, their data is in your care, not the LawFive project's: the project never receives it, and LawFive's own [terms](https://lawfive.app/terms) and [privacy policy](https://lawfive.app/privacy) cover only the hosted service at lawfive.app.

## What you're responsible for

- **Their data.** Matches, match reports, fees, GPS tracks with heart rate, and photos. Location and health data are sensitive, and youth soccer means some names and photos may be of minors.
- **The law where you and they are.** Privacy laws such as GDPR or California's may apply, depending on who uses your server and where.
- **Telling them.** A self-hosted server shows no terms or privacy policy, so let people know yourself who runs it, what it keeps, and how to ask for their data or have it deleted. Everyone can download their own data with **Download everything** and delete their account in Settings.

## A starting checklist

- **Keep the host patched,** and Docker with it.
- **Keep the database private.** `compose.yaml` doesn't publish Postgres's port, so it's only reachable inside the Compose network. Keep it that way.
- **Use HTTPS,** in front of the server ([Set up HTTPS](/run/https/)), and keep the server's own port off the internet.
- **Choose who can join** on purpose, with approval or invitations if it isn't meant for everyone ([People and sign-up](/run/people/)).
- **Back up,** the database and photos both, and try a restore once ([Backups](/run/backups/)).
- **Upgrade for security fixes.** Fixes go into the newest release. To hear about them, watch the repository's releases on GitHub (**Watch → Custom → Releases**), and read each release's notes before [upgrading](/run/upgrades/).

## What depends on the project

- **Phone notifications** go through LawFive's push relay, which sees as little as possible ([Notifications](/run/notifications/)). You can turn them off.
- **Signing in with Apple or Google** doesn't exist yet. If it's added, it will be tied to the project's own apps, so it may not work on every server.
