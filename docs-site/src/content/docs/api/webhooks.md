---
title: Webhooks
description: Receive signed LawFive events when records change, and check their signatures.
---

Webhooks tell your own service whenever a record changes, however it happened: the web app, a watch, an import, a merge or an API key.

## Making a webhook

Under **Settings → Webhooks**, choose **New webhook**, and give it an `http` or `https` address and its topics: matches, results (match reports), venues, referees, competitions and templates. An account can have as many as its [plan](/run/people/#plans-and-limits) allows: 10 on a new server.

Its signing secret (`whsec_…`) is shown once. Keep it with your receiver.

**Send test** sends an example straight away, marked `"test": true`, and shows how it went.

## What's sent

A `POST` of JSON:

```json
{
  "id": "6c0a3f7e-5d0b-4a55-9d0e-0f4a1b2c3d4e",
  "event": "match.updated",
  "createdAt": "2026-11-07T09:00:00-08:00",
  "data": { "id": "…" }
}
```

- `id` identifies the delivery. Use it to spot a repeat.
- `event` is the record and what happened: `match.created`, `venue.updated`, `referee.deleted` and so on.
- `data` is the record as the API returns it. For a deleted one, it's the id, version and when it was deleted.

And these headers:

| Header | What it holds |
|---|---|
| `X-LawFive-Event` | The event |
| `X-LawFive-Delivery` | The delivery's id |
| `X-LawFive-Signature` | `t=<unix seconds>,v1=<signature>` |

## Checking the signature

The signature is the hex HMAC-SHA256 of `<t>.<body>`, using your secret. Check it against the raw body, before parsing it, and reject old ones.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function isFromLawFive(rawBody, header, secret, maxAgeSeconds = 300) {
    const fields = Object.fromEntries(header.split(",").map((part) => part.split("=")));
    const age = Math.abs(Date.now() / 1000 - Number(fields.t));
    if (!(age <= maxAgeSeconds)) return false;
    const expected = createHmac("sha256", secret).update(`${fields.t}.${rawBody}`).digest();
    const given = Buffer.from(fields.v1 ?? "", "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
}
```

## Answering

Answer with a `2xx` within 10 seconds. Redirects aren't followed. If a delivery fails, it's tried again after 1 minute, 5 minutes, 30 minutes and 2 hours, then marked failed.

**Deliveries** on each webhook lists the latest 50, with the outcome, the answer or error, and how many tries it took. You can also **Pause** and **Resume** a webhook.

## Private addresses

A webhook can't send to a private, loopback or link-local address, checked when it's saved and again before each delivery. On your own server, you can allow them with [`WEBHOOK_ALLOW_PRIVATE=true`](/run/settings/).
