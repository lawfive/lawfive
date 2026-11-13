---
title: API overview
description: How the LawFive API works, and how to make your first request.
---

Everything LawFive does goes through one versioned API, which the web app, the phones and the watches all use. Your scripts can use it too, on your own server or the hosted service.

## Your first request

1. In your server's website, make [an API key](/api/keys/) with read access to matches.
2. Ask for your matches:

   ```sh
   curl https://lawfive.example.com/v1/matches \
     -H "Authorization: Bearer lf_your_key"
   ```

To see what a server offers without signing in:

```sh
curl https://lawfive.example.com/v1/meta
```

## The basics

| | |
|---|---|
| **Address** | Everything is under `/v1` on your server. The hosted service is `https://api.lawfive.app`. |
| **Format** | JSON. Ids are UUIDs chosen by the client, times are ISO 8601 with a UTC offset, and durations are whole seconds. |
| **Errors** | A JSON body with `error`, a sentence a person can read. |
| **From LawFive** | Every answer has a `LawFive-Version` header. An error without it came from something in front of the server, such as a proxy while the server restarts: try again rather than acting on its status. |
| **Too many tries** | `429`, with `Retry-After` saying how many seconds to wait. |
| **Request size** | At most 32 MB, and less for uploads. |

## Signing in

| Who | How |
|---|---|
| Scripts and integrations | [An API key](/api/keys/), sent as `Authorization: Bearer lf_…`. This is what you want. |
| Apps | Sign in, take the token from the `set-auth-token` response header, and send it as `Authorization: Bearer <token>`. |
| Watches | Link with a code (RFC 8628), then send the token the same way. It reaches only the watch's endpoints (`/v1/watch/`), signing out and its own session. |
| Browsers | The session cookie, with an `Origin` header matching the server. |

Sessions last 90 days, and renew each day they're used.

## Records

Each kind of record has its own collection, with the same endpoints: `matches`, `match-templates`, `match-records`, `venues`, `competitions`, `referees` and `settings`. For example, for matches:

| Endpoint | What it does |
|---|---|
| `GET /v1/matches` | List them |
| `GET /v1/matches/{id}` | Get one |
| `PUT /v1/matches/{id}` | Save one, with an id you choose |
| `DELETE /v1/matches/{id}` | Delete one |

To keep up with changes, use [`GET /v1/changes`](/api/sync/), or have them sent to you with [webhooks](/api/webhooks/).

## Older servers

A server may be older than your code, especially a self-hosted one. Check `capabilities` in `GET /v1/meta` before using address search or weather, which a server can switch off. Ignore fields and capabilities you don't know. See also [Apps on older servers](/run/upgrades/#apps-on-older-servers).

## For AI agents and tools

- [`llms.txt`](/llms.txt) lists smaller Markdown pages an AI agent can fetch as it needs them, starting with [an overview](/agents/overview.md). Point your agent at it when you ask it to write an integration.
- [Worked examples](/api/examples/) show the rules a type list can't, such as cursors and saving without overwriting someone's change.
- `GET /v1/openapi.json` on any server, with no sign-in, describes the API as that server's version has it, as OpenAPI 3.1. It's about 400 KB, so it suits tools better than reading it whole. `openApiUrl` in `GET /v1/meta` gives its address.
- [The whole API as OpenAPI 3.1](/openapi.json), for the latest version, and JSON Schema for each record, such as [Match](/schemas/Match.json) and [Venue](/schemas/Venue.json).
- [The API reference](/api/reference/), generated from the same source. The server's tests check it against the description, so they can't drift apart.
