---
title: Install a server
description: Run a LawFive server with Docker Compose, from the published image or from source.
---

These steps give you a working server on port 3000. You can try it on `localhost` straight away. To use it from phones and watches, carry on to [Set up HTTPS](/run/https/) afterward.

## From the published image

This is the way to run a real server.

1. Make a folder on the Docker host, and put these two files from [the repository](https://github.com/lawfive/lawfive) in it: `compose.yaml`, and `.env.example` saved as `.env`.

   ```sh
   mkdir lawfive && cd lawfive
   curl -O https://raw.githubusercontent.com/lawfive/lawfive/main/compose.yaml
   curl -o .env https://raw.githubusercontent.com/lawfive/lawfive/main/.env.example
   ```

2. Make a secret. It signs sign-in sessions, and has to be at least 32 characters.

   ```sh
   openssl rand -base64 32
   ```

3. Edit `.env`. Set `AUTH_SECRET` to that secret, and choose the image and a database password:

   ```ini title=".env"
   LAWFIVE_IMAGE=ghcr.io/lawfive/lawfive:latest
   AUTH_SECRET=the-secret-you-just-made
   POSTGRES_PASSWORD=a-password-of-your-own
   ```

4. Start it:

   ```sh
   docker compose pull
   docker compose up -d
   ```

5. Read the setup code from the logs:

   ```sh
   docker compose logs server
   ```

6. Open `http://localhost:3000`, or the machine's address, and follow [the setup wizard](/run/first-run/).

:::caution[Choose the database password before the first start]
Postgres only takes `POSTGRES_PASSWORD` when it first creates its database. Changing it in `.env` later stops the server connecting. The database only listens inside the Compose network, so the default isn't reachable from outside, but it's still better to set your own.
:::

### Image tags

| Tag | What it is |
|---|---|
| `latest` | The newest release |
| A version, such as `2026.11.12` | One release, to stay on it |
| `edge` | The newest build from `main`, ahead of the next release (what the hosted service runs) |
| `sha-<commit>` | The build of one commit |

Each release's notes, with anything to do before upgrading, are on [GitHub's releases page](https://github.com/lawfive/lawfive/releases).

## From source

To build the image yourself, clone the repository and work from its root:

```sh
cp .env.example .env           # then set AUTH_SECRET
docker compose up -d --build
docker compose logs server
```

Leave `LAWFIVE_IMAGE` unset. An image you build this way shows its version as `dev` unless you pass `--build-arg LAWFIVE_VERSION=… --build-arg LAWFIVE_COMMIT=…`.

## Just trying it out

To look around with sample data, with no database or Docker, see [the demo server](/contribute/server-web/#the-demo-server).

## Check it works

Once it's behind [HTTPS](/run/https/):

1. `curl https://lawfive.example.com/health` answers `ok`.
2. The address opens in a browser with no certificate warning, and **Settings → Server → HTTPS** says it's set up correctly.
3. You can sign in with the admin account from the wizard.
4. A phone app signs in with **Use another server** and your address. See [Phones](/apps/phones/).
5. A watch links from **Link a watch**. See [Watches](/apps/watches/).

## Next

- [Finish the setup wizard](/run/first-run/)
- [Set up HTTPS](/run/https/), which watches and phones need
