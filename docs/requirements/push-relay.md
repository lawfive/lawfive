# Push relay (PUSH)

The push relay at `push.lawfive.app` ([relay/](../../relay/), [ARCHITECTURE.md](../ARCHITECTURE.md#open-source-and-self-hosting)) lets any LawFive server, self-hosted ones included, send notifications to LawFive's phone apps without its own Firebase project. The project runs it; this covers the relay, a server's side of it, and the first notifications on the phones.

## The relay

- **PUSH-2** **What the relay does and keeps.**
  - A phone registers its Firebase token and its server's address, and gets back a sealed handle, encrypted so only the relay can read it, lasting 90 days. The relay keeps no copy, no accounts and no match details.
  - The server sends a handle with a fixed event type and a record id, so it can't put words on anyone's phone. The app fetches the details from its own server and writes the notification.
  - It reaches only LawFive's own apps, as Firebase tokens work only for apps in the project's Firebase project.
- **PUSH-1** **Daily limits**: 25 notifications a day per device and 250 a day per server, whichever is reached first, resetting at midnight UTC, and at most 5 a minute per device and 120 a minute per server.
  - Only sends handed to Firebase count, not errors. A device is counted by its Firebase token, so registering again doesn't start its count over.
  - Over a limit the relay answers 429, saying which limit and the seconds until it lifts. The server skips that device until then, or at the server's limit stops sending and logs it.
  - The daily numbers are settings the relay's operator can change without a code change, with a different limit for a named server, such as the hosted service. A server's own admin can't raise them.
- **PUSH-3** **The operator's controls**, as settings on the relay: block a server, whose handles are then refused; change a server's daily limit; give a server a key (PUSH-7); pause all sending.
  - Any server can use the relay without registering. A server that needs a higher limit asks at support@lawfive.app.
  - The first time each day a server reaches its own daily or per-minute limit, or tries to send while blocked, the relay logs one line with the server's address only, so the operator can see whom to raise or block.
- **PUSH-7** **A relay key per known server.** A server in the relay's `SERVER_OVERRIDES` can have a key, kept there only as its SHA-256 (`keySha256`).
  - That server's sends must carry the key (`Authorization: Bearer`, from the server's `RELAY_KEY`), so nobody holding its phones' handles can use up its daily limit.
  - Without it the relay answers 401, and the server logs it and holds off for an hour.
  - Servers with no key, which includes every self-hosted server not in the overrides, are unaffected.
  - The key lives in the server's environment and its hash in the relay's settings, never in the repo.

## A server's side

- **PUSH-4** A server offers `push` in `GET /v1/meta` unless `PUSH_RELAY_URL=off`; `PUSH_RELAY_URL` points it at another relay. Each phone gives its handle to its own session with `PUT /v1/devices/current/push`, and signing out removes it. A handle the relay says is dead is forgotten.
- **PUSH-6** **A test for whoever runs the server**: Settings → Server has **Send a test notification**, for admins, when the server offers `push`.
  - It goes to the admin's own phones with notifications on, through the relay, and counts toward the limits.
  - The phone says it's a test, without asking the server anything.
  - If no phone takes it, the page says why: no phone has notifications on, they're off on the server, a limit, a blocked server, or the relay can't be reached.

## On the phone

- **PUSH-5** **Weather risks** (WX-11), beside the match reminders (APP-6), off until turned on.
  - For a match kicking off in the next 3 days, a risk the server hasn't told this person about before, or one that becomes likely, sends one notification naming the match and the risk.
  - Tapping it opens the match, asking first if a form has unsaved changes. A match with a place has a **Directions** button.
  - A risk that clears and comes back doesn't notify again, and a match moved to another day starts over.
  - It needs the app's Firebase settings, so a build without them doesn't offer it.

## Status

The relay is live with its limits, controls and keys (the hosted server sends with its key); the server's sending, new weather risks, the admin's test notification, and Android's setting and notification, opening its match when tapped, are built.

Not built yet:
- Weather risk notifications on the iPhone (PUSH-5).
- Telling a server's admin in the website when a limit is reached.
- Notifications checked on a real phone (R-18).
