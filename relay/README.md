# LawFive push relay

Only an app's publisher can send notifications to its store builds, so every LawFive server, hosted or self-hosted, sends through this relay: a Cloudflare Worker at `push.lawfive.app`, run by the project. Self-hosters don't run it. Behavior is in [docs/requirements/push-relay.md](../docs/requirements/push-relay.md) and [integration-notifications.md](../docs/requirements/integration-notifications.md); what it means for someone running a server is lawfive.dev's [Notifications page](../docs-site/src/content/docs/run/notifications.md).

## How it works

It keeps no accounts, tokens or match details. A phone's Firebase token and its server are sealed into a handle only the relay can read, which the phone gives its server. The server sends the handle with a fixed event type (`weather-risk`, `match-changed` or `test`) and a record id, so it can't put words on anyone's phone; the phone asks its own server for the details and writes the notification. Firebase tokens work only for apps in the project's Firebase project, so this reaches only LawFive's own apps.

```
POST /v1/register   { token, server, platform }    →  { handle, expiresAt }
POST /v1/send       { handle, type, id }           →  { sent: true }    (Authorization: Bearer <key>, for a server with one)
GET  /health
```

| `/v1/send` answers | Meaning | What the server does |
|---|---|---|
| 200 | Firebase took it | Nothing |
| 401 | This server's override names a key (below), and the send didn't carry it | Logs it, and stops for an hour |
| 403 | This server is blocked | Logs it |
| 410 | The handle or the phone's token is dead | Forgets the handle |
| 429 | Over a limit: `limit` is `device`, `server` or `address`, with `retryAfter` in seconds | Skips the device, or stops, until then |
| 502, 503 | Firebase failed, or the relay is paused | Tries again at the next refresh |

## Limits

| Limit | Value | Where |
|---|---|---|
| Per device, a day | 25 | `DEVICE_DAILY_LIMIT` |
| Per server, a day | 250 | `SERVER_DAILY_LIMIT`, or per server in `SERVER_OVERRIDES` |
| Per device, a minute | 5 | `src/counter.ts` |
| Per server, a minute | 120 | `src/counter.ts` |
| Sends per address, a minute | 300 | `wrangler.toml` |
| Registrations per address, a minute | 20 | `wrangler.toml` |
| Request size | 4 KB | `src/index.ts` |
| Handle lifetime | 90 days; apps renew at 30 | `src/handle.ts` |

Days are UTC. Only sends Firebase took count toward a limit.

## Logs

Requests aren't logged, and nothing printed carries tokens or handles. The first time each day a server reaches its own limit (daily or per minute), or tries to send while blocked, the Worker logs one line with the server's address, such as `https://ref.example.com reached its daily limit of 250 notifications`. These are in Cloudflare's Workers Logs (the Worker → Observability), for deciding whom to give a higher limit (people ask at support@lawfive.app) or block. A phone reaching its limit isn't logged.

## Settings

Variables on the Worker in Cloudflare (Settings → Variables and Secrets), not in this repo. `keep_vars` stops a deploy from removing them, and a change takes effect straight away.

| Variable | What it does |
|---|---|
| `DEVICE_DAILY_LIMIT`, `SERVER_DAILY_LIMIT` | The daily limits; unset means the values above. |
| `SERVER_OVERRIDES` | JSON by server address, as phones give it: `{"https://api.lawfive.app":{"dailyLimit":5000,"keySha256":"…"},"https://bad.example":{"blocked":true}}`. A blocked server's handles are refused. `keySha256` is the SHA-256, in hex, of a key the server sends as `Authorization: Bearer <key>` (its `RELAY_KEY`); sends without it get 401, so nobody holding its phones' handles can use up its limit. Only the hash is kept, so the variable stays readable. Servers with no `keySha256` need no key. |
| `PAUSED` | `true` stops all sending. |

Two secrets, set with `npx wrangler secret put <name>`:

| Secret | What it is |
|---|---|
| `HANDLE_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. Replacing it cancels every handle, and apps register again on their next sync. |
| `FCM_SERVICE_ACCOUNT` | The Firebase service account's JSON (Project settings → Service accounts → Generate new private key). |

### Giving a server a key

For a server with its own limit, such as the hosted one, so nobody else claiming its address can use up that limit:

1. Make a key, `openssl rand -base64 32`, and its hash, `printf %s '<key>' | shasum -a 256`.
2. Set the key as `RELAY_KEY` in that server's environment and restart it. The relay ignores a key it doesn't ask for, so nothing changes yet.
3. Add `"keySha256":"<hash>"` to the server's entry in `SERVER_OVERRIDES`. From then on, its sends need the key.

To change a key, make a new one and do steps 2 and 3 one straight after the other: in between, the server's sends get 401 and it holds off for an hour (weather risks are tried again at the next refresh). To drop a key, remove `keySha256` first, then `RELAY_KEY`.

## Develop and deploy

```sh
pnpm test        # type check and the tests, with a made-up Firebase
pnpm dev         # on Cloudflare's local runtime; put test secrets in .dev.vars
pnpm run deploy  # needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
```

To try the whole path, run the demo server against it (`PUSH_RELAY_URL=https://push.lawfive.app pnpm demo` in `server/`) and sign in from an app build with Firebase values.

The deploy token needs Workers Scripts edit, and Workers Routes and DNS edit on `lawfive.app` for its address.
