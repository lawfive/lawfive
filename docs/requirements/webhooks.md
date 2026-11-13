# Webhooks (HOOK)

Changes sent to another app or a script as they happen, set up in the website's Settings beside the API keys (the phones leave this to the website, APP-8). The API reference is [schema/generated/API.md](../../schema/generated/API.md), and [schema/guides/receive-webhooks.md](../../schema/guides/receive-webhooks.md) shows how to check one.

## Setting one up

- **HOOK-1** Settings has a **Webhooks** list: each webhook's address, its topics and how the last delivery went, with **Send test** (HOOK-5), **Deliveries**, **Pause** / **Resume** and **Delete** (confirmed).
  - **New webhook** asks for an http or https address and the topics: matches, results (match reports), venues, referees, competitions and templates.
  - Its **signing secret** (`whsec_…`) is shown once, with Copy and how to check a signature.
  - An account has as many webhooks as its plan allows (PLAN-2).
- **HOOK-5** **Send test** sends an example for a chosen topic at once: the latest record of that kind in the account, or a made-up one when there's none, marked `"test": true`. It shows how it went (the answer or the error, and how long it took) and what was sent.

## Deliveries

- **HOOK-2** When a record in a topic is added, changed or deleted, however it happened (the website, a watch, an import, a merge, an API key), each active webhook for that topic gets a POST of JSON:
  - `id` (the delivery), `event` (`match.created`, `venue.updated`, `referee.deleted`…), `createdAt`, and `data`: the record as the API returns it, or for a deleted one its id, version and when it was deleted.
  - Headers: `X-LawFive-Event`, `X-LawFive-Delivery` (the id) and `X-LawFive-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body" with the secret>`, so the receiver can check it and reject old ones.
- **HOOK-3** A delivery succeeds on a 2xx answer within 10 seconds; redirects aren't followed. Otherwise it's tried again after 1 minute, 5 minutes, 30 minutes and 2 hours, then marked failed. The latest 50 deliveries of each webhook are listed: the event, whether it was a test, the outcome, the answer or error, and how many tries.
- **HOOK-4** An address that is, or looks up to, a private, loopback or link-local address (IPv4 or IPv6) is refused when the webhook is saved and again before each delivery, so a webhook can't reach into the server's own network. Self-hosters who want webhooks on their own network set `WEBHOOK_ALLOW_PRIVATE=true`, or an admin allows it in the server settings (ADM-1).

## Status

Everything above is built, on the website.
