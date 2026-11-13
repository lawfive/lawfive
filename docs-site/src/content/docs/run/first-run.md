---
title: The setup wizard
description: What a new LawFive server asks for the first time you open it.
---

While a server has no accounts, opening it starts a setup wizard. It comes back on each visit until you finish or skip it.

| Step | What it does |
|---|---|
| **Setup code** | Asks for a code from the server's logs, so whoever reaches a public server first can't take it. Find it with `docker compose logs server`. A new code is made each time the server starts, until the first account exists. |
| **Admin account** | Your name, email and password. This first account is an admin. |
| **Server address** | Shows `PUBLIC_URL`, and says if it isn't the address you're using or isn't HTTPS. |
| **Who can join** | Open, approval or invitation only. See [People and sign-up](/run/people/). |
| **Email** | The SMTP server, with a test. See [Email](/run/services/#email). |
| **Maps and weather** | Address search and weather on or off, and satellite imagery. See [Email, maps and weather](/run/services/). |
| **What next** | Get the app, link a watch, invite people. What each account may use is set by [plans](/run/people/#plans-and-limits). |

You can go back, and skip every step after the account. A setting fixed in `.env` shows as fixed. All of this is available afterward under **Settings → Server** and **People**.

## Admins by address

`ADMIN_EMAILS` in `.env` makes those addresses admins, which the web app can't change. It doesn't skip the setup code: the first account still needs it, whatever its address, as typing an address proves nothing about who's typing it. Later, an account for a listed address waits for an admin's approval unless it was invited. See [People and sign-up](/run/people/).

```ini title=".env"
ADMIN_EMAILS=you@example.com
```

## Afterward

A server with accounts never shows the wizard again. Admins see a notice at the top of each page while the server isn't on HTTPS, softer on `localhost`. To fix that, see [Set up HTTPS](/run/https/).
