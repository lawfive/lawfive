---
title: Troubleshooting
description: Common problems running a LawFive server, and how to fix them.
---

Start by checking that the server is up, and reading its logs:

```sh
docker compose ps
docker compose logs --tail 100 server
curl http://localhost:3000/health
```

`/health` answers `ok` when the server can reach its database, and 503 with `database unavailable` when it can't. Docker's healthcheck uses it, so a container marked `unhealthy` usually means a database problem. Weather, email and notification outages don't affect it.

## Keeping an eye on it

Point an uptime checker, such as Uptime Kuma, Gatus or a hosted one, at `https://lawfive.example.com/health`, and have it alert you when the answer isn't `ok`. To follow the logs as they're written:

```sh
docker compose logs -f server
```

Docker keeps a container's logs until the container is removed. To cap their size, set log rotation in Docker's `/etc/docker/daemon.json` and restart Docker:

```json title="/etc/docker/daemon.json"
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

## The server won't start

**`Set AUTH_SECRET in .env`:** Compose needs `AUTH_SECRET`. Make one with `openssl rand -base64 32`, and put it in `.env` next to `compose.yaml`.

**It can't connect to the database after changing `POSTGRES_PASSWORD`:** Postgres keeps the password from its first start. Put the old one back in `.env`.

## The wizard asks for a code I can't find

It's in the logs, from `docker compose logs server`. A new one is made at each start, so use the most recent.

It's asked for with `ADMIN_EMAILS` set too. If the server's accounts were all removed while it ran, it makes a new code then, also in the logs.

## A watch or phone can't connect

- **Is it HTTPS with a valid certificate?** Watches need this. Open `/v1/meta` on your address in a browser, and check there's no certificate warning.
- **Is `PUBLIC_URL` right?** It has to be the `https://` address people use. Settings → Server → HTTPS says when it's set up correctly. See [Finish up](/run/https/#finish-up).
- **Can it be reached from outside your network?** A Garmin watch's direct sync goes through Garmin Connect, and needs this.
- **Did the address change?** Phones and watches linked to the old address need signing in or linking again.

The Garmin watch shows request failures as codes:

| Code | Meaning |
|---|---|
| -1001 | The address isn't HTTPS |
| -400 | An answer the watch couldn't read |
| -104 | No connection to the phone |
| 401 | The watch is no longer linked |
| 404 | A route the server doesn't have, so the server may be out of date |

## The certificate never arrives

Caddy, Traefik and Certbot get certificates from Let's Encrypt, which first has to reach your machine at the name.

- **Does the name point here?** `dig +short lawfive.example.com` should give this machine's public address, or your router's if it forwards to it.
- **Are ports 80 and 443 open from the internet?** Let's Encrypt checks over one of them, so the router has to forward both, and nothing else on the machine may be using them.
- **What does the proxy say?** Its logs name the reason, for example `docker compose logs caddy`.
- **Did it stop trying?** After repeated failures Let's Encrypt refuses a name for about an hour. Fix the cause, then wait.

## The browser says there are too many redirects

Something keeps sending it back to where it started. LawFive itself never redirects to HTTPS, so the loop is in a proxy.

- **Behind Cloudflare's proxy?** Its SSL mode **Flexible** talks plain HTTP to your server, whose proxy redirects it to HTTPS, and round it goes. Set **Full (strict)** under SSL/TLS.
- **Two proxies, one behind the other?** Only the outer one should send HTTP to HTTPS. The inner one takes what it's given.

## Notifications don't arrive

Start with **Send a test notification** under **Settings → Server**, which says what's wrong if it can't send.

- **Is it turned on?** Each person turns on **Tell me about weather risks** or **Tell me about matches from integrations** in the app's Settings, under Match reminders, and the phone has to allow the app's notifications. It's on Android for now.
- **Doesn't the setting show?** The app has to be a build with Firebase settings, and the server has to offer notifications, so check `push` (and `notices`, for matches from integrations) is in `capabilities` from `/v1/meta` and that `PUSH_RELAY_URL` isn't `off`.
- **Is there a match to warn about?** It only covers scheduled matches with a venue on the map, kicking off in the next 3 days, when weather is on. Each risk notifies once, plus once more if it becomes likely.
- **Matches from integrations?** Only saves made with an API key set to notify count, and only for matches that haven't kicked off.
- **Is the server at a limit?** Look for `Over the push relay's` in `docker compose logs server`. See [the limits](/run/notifications/#limits).
- **Can the server reach the relay?** Look for `The push relay can't be reached` in the logs, and check it can make outgoing HTTPS requests.

## People are locked out for too many tries

Behind a reverse proxy, everyone can look like one visitor, so they share one limit on wrong passwords. **Settings → Server → Visitors' addresses** shows the address the server sees you at. If it's your proxy's, set `TRUSTED_PROXIES` (`private` suits most setups) and restart. Behind a second proxy such as Cloudflare, also set `TRUSTED_IP_HEADER` to the header that proxy uses: for Cloudflare, `CF-Connecting-IP`. See [Behind more than one proxy](/run/https/#behind-more-than-one-proxy).

One person locked out with the message "Too many wrong passwords for this account" is different: that's their own address's lock. It ends by itself within an hour, when they reset their password, or when an admin chooses **Unlock** on **People**.

## A webhook won't save

Addresses that are, or look up to, private, loopback or link-local are refused, so nobody can use a webhook to reach into the server's network. For receivers on your own network, set `WEBHOOK_ALLOW_PRIVATE=true`. See [Private addresses](/api/webhooks/#private-addresses).

## Saved email or weather settings disappeared

They're encrypted with a key made from `AUTH_SECRET`, so they count as unset after that changes. Enter them again under Settings → Server.

## A restore fails

Check for free space in the container, up to the 2 GB a restore can take. Check your proxy's upload limit too: nginx needs `client_max_body_size`, and Cloudflare's free plan stops at 100 MB. See [One person's account](/run/backups/#one-persons-account).
