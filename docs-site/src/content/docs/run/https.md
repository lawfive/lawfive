---
title: Set up HTTPS
description: Put a LawFive server behind HTTPS with Caddy, Traefik, nginx, Cloudflare Tunnel or Tailscale Funnel.
sidebar:
  label: Set up HTTPS
---

LawFive speaks plain HTTP on port 3000. Something in front of it holds the certificate. LawFive doesn't manage certificates itself.

:::note[Why it matters]
Garmin watches can only make requests to HTTPS addresses with a valid certificate, and a Garmin watch's direct sync has to reach the server from the internet. Phone and watch apps from a store send your session only over HTTPS. The one exception is the iPhone app, which also allows plain `http` for a server on your local network, by IP address or a name ending in `.local`.
:::

Your server has this same guide built in, with your domain filled in, under **Settings → Server → HTTPS**. It also tells you when it's set up correctly.

## Choose a method

| Method | Best for | The trade-off |
|---|---|---|
| [Caddy](#caddy) | The simplest with your own domain. It gets and renews the certificate itself. | Ports 80 and 443 must reach this machine, and nothing else may be using them. |
| [Traefik](#traefik) | A machine that already runs Traefik. | Names must match your Traefik setup. |
| [nginx and Certbot](#nginx-and-certbot) | A machine that already runs nginx, outside Docker. | nginx and Certbot are yours to keep updated. |
| [Cloudflare Tunnel](#cloudflare-tunnel) | A server at home: no open ports, behind any router. | The domain must be on Cloudflare, it can see the traffic, and uploads are limited to 100 MB on its free plan. |
| [Tailscale Funnel](#tailscale-funnel) | No domain of your own: you get a free `.ts.net` address. | Funnel must be allowed in your tailnet, and the address has Tailscale's name in it. |

The examples use `lawfive.example.com`. Replace it with your own domain.

## Caddy

1. Point your domain at this machine's public address in DNS. If it's behind a router, forward ports 80 and 443 to it.

2. Add Caddy beside the server, in a new file next to `compose.yaml`:

   ```yaml title="compose.override.yaml"
   services:
     caddy:
       image: caddy:2
       restart: unless-stopped
       command: caddy reverse-proxy --from lawfive.example.com --to server:3000
       ports:
         - "80:80"
         - "443:443"
         - "443:443/udp"
       volumes:
         - caddy-data:/data

   volumes:
     caddy-data:
   ```

3. [Finish up](#finish-up).

## Traefik

1. Point your domain at your Traefik machine in DNS.

2. Give the server Traefik's labels and network, in a new file next to `compose.yaml`. The network, entry point and certificate resolver must use the names in your Traefik setup.

   ```yaml title="compose.override.yaml"
   services:
     server:
       labels:
         - traefik.enable=true
         - traefik.http.routers.lawfive.rule=Host(`lawfive.example.com`)
         - traefik.http.routers.lawfive.entrypoints=websecure
         - traefik.http.routers.lawfive.tls.certresolver=letsencrypt
         - traefik.http.services.lawfive.loadbalancer.server.port=3000
       networks:
         - default
         - traefik

   networks:
     traefik:
       external: true
   ```

3. Optional: while the server restarts after an update, Traefik has no route to it and answers 404. To have it answer 503 (try again) instead, add this file to the folder Traefik's file provider reads. It's used only while the server's own route is gone.

   ```yaml title="lawfive-restarting.yml"
   http:
     routers:
       lawfive-restarting:
         rule: "Host(`lawfive.example.com`)"
         priority: 1
         entryPoints: [websecure]
         tls: {}
         service: lawfive-restarting
     services:
       lawfive-restarting:
         loadBalancer:
           servers: []
   ```

4. [Finish up](#finish-up).

## nginx and Certbot

1. Point your domain at this machine's public address in DNS. If it's behind a router, forward ports 80 and 443 to it.

2. Add a site to nginx. The size limit allows restoring a large export, and turning buffering off lets one download as it's made.

   ```nginx title="/etc/nginx/conf.d/lawfive.example.com.conf"
   server {
       listen 80;
       server_name lawfive.example.com;
       client_max_body_size 2g;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_buffering off;
       }
   }
   ```

3. Get the certificate. Certbot adds it to that site, and renews it by itself once installed.

   ```sh
   sudo certbot --nginx -d lawfive.example.com
   ```

4. [Finish up](#finish-up).

## Cloudflare Tunnel

1. In Cloudflare's Zero Trust dashboard, make a tunnel under Networks, and copy its token. Add a public hostname of your domain, with the service `http://server:3000`.

2. Run the tunnel beside the server, in a new file next to `compose.yaml`:

   ```yaml title="compose.override.yaml"
   services:
     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel run
       environment:
         TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
   ```

3. Add these to `.env`. The first makes limits on wrong passwords count each visitor rather than Cloudflare.

   ```ini title=".env"
   TRUSTED_IP_HEADER=CF-Connecting-IP
   CLOUDFLARE_TUNNEL_TOKEN=the-token-from-cloudflare
   ```

4. [Finish up](#finish-up).

:::caution
Cloudflare's free plan limits an upload to 100 MB, so a larger export can't be restored through the tunnel.
:::

## Tailscale Funnel

1. Install Tailscale on this machine and sign in, then share the server. It prints your address.

   ```sh
   tailscale funnel --bg 3000
   ```

2. [Finish up](#finish-up), using the address it printed, such as `https://your-machine.your-tailnet.ts.net`.

## Finish up

1. Tell LawFive its new address, keep port 3000 to this machine, and let it believe the proxy about who's visiting, in `.env`:

   ```ini title=".env"
   PUBLIC_URL=https://lawfive.example.com
   PORT=127.0.0.1:3000
   TRUSTED_PROXIES=private
   ```

   `private` believes any proxy on a private network or this machine, which is where each method above runs. Without `TRUSTED_PROXIES`, everyone counts as the proxy's one address, so they share one limit on wrong passwords. To be stricter, list your proxy's network instead, such as `172.18.0.0/16`.

2. Start it all again:

   ```sh
   docker compose up -d
   ```

3. Open your new address and sign in again. **Settings → Server → HTTPS** says when it's right.

Phones and watches linked to the old address need signing in or linking again.

## Behind more than one proxy

`TRUSTED_PROXIES` lists the proxies LawFive believes about the visitor's address: addresses, ranges such as `172.18.0.0/16`, or `private`. It's empty by default, so a server reached directly can't be fooled. **Settings → Server → Visitors' addresses** shows the address the server sees you at; if that's your proxy's, the setting is missing.

If another proxy such as Cloudflare sits in front of your reverse proxy, set `TRUSTED_IP_HEADER` to the header it puts the visitor's address in, as well as `TRUSTED_PROXIES`. For Cloudflare, that's `CF-Connecting-IP`. Without it, limits on wrong passwords count everyone arriving through that proxy together.

That header is only as good as the path to your server. If your reverse proxy can also be reached directly, not just through Cloudflare, anyone can send it with any address and dodge those limits. Either reach the server only through a Cloudflare Tunnel (above), or let your reverse proxy take that host's traffic only from [Cloudflare's addresses](https://www.cloudflare.com/ips/). In Traefik that's an `ipAllowList` middleware on the router, with the ranges from cloudflare.com/ips-v4 and /ips-v6.

If phones should reach the API at a different address from the website, set `API_URL`. Most servers leave it unset.
