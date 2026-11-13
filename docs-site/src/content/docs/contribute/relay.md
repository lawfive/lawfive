---
title: The push relay
description: How LawFive's push relay works, and how to run your own.
sidebar:
  label: Push relay
---

The relay in `relay/` lets any LawFive server wake a LawFive app without holding Firebase's keys. It's a small Cloudflare Worker with no dependencies, and self-hosters don't need to run it. [Notifications](/run/notifications/) covers what it means for someone running a server.

## How it works

1. A phone gets a token from Firebase, and sends it with its server's address to `POST /v1/register`.
2. The relay seals the two together with AES-GCM into a handle that only it can read, valid for 90 days, and keeps no copy.
3. The phone gives the handle to its server with `PUT /v1/devices/current/push`, which keeps it with that phone's session.
4. To notify the phone, the server sends `POST /v1/send` with the handle, a fixed event type and a record ID.
5. The relay opens the handle, checks the limits, and passes a data message to Firebase.
6. The app wakes, asks its own server for the details, and writes the notification.

Because the handle is sealed, a sender can't fake which server it's sending for, so that's what limits and blocks go by. Someone registering can claim any server, but a handle only ever reaches the phone that registered it. So that claiming a server can't use up its limit, a server in `SERVER_OVERRIDES` can have a key, kept there as its SHA-256 (`keySha256`): its sends must carry `Authorization: Bearer <key>` (the server's `RELAY_KEY`), or get 401 (PUSH-7). `relay/README.md` has the steps for giving a server a key.

## Developing

```sh
cd relay
pnpm test    # type check and the tests, with a made-up Firebase
pnpm dev     # on Cloudflare's local runtime; put test secrets in .dev.vars
```

To try the whole path, run the demo server against a relay, and sign in from a build with Firebase values:

```sh
cd server
PUSH_RELAY_URL=https://your-relay.example.com pnpm demo
```

## Running your own

You'd need your own Firebase project, your own builds of the apps, and a Cloudflare account. `relay/README.md` lists the settings and secrets, and `wrangler.toml` holds the address to change. Point your builds at it with `lawfive.push.relay`, and your server with `PUSH_RELAY_URL`.
