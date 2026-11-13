---
title: Backups
description: Back up and restore a self-hosted LawFive server.
---

A server keeps its data in two places: the Postgres database, and the photos. Back up both, together, and keep `.env`, since `AUTH_SECRET` is what unlocks secrets saved in the web app.

## Back up the server

Run these from the folder with `compose.yaml`.

**The database:**

```sh
docker compose exec -T db pg_dump -U lawfive lawfive | gzip > lawfive-db.sql.gz
```

**The photos**, unless they're in an S3 bucket, in which case back up the bucket instead:

```sh
docker compose run --rm --no-deps --entrypoint "" -v "$PWD:/backup" server \
  tar czf /backup/lawfive-uploads.tar.gz -C /data uploads
```

This writes as the image's `node` user (user ID 1000), so on Linux the folder has to be writable by it.

Copy the two files and `.env` off the machine, on a schedule that suits you.

## Restore the server

Do this on a new install: follow [Install a server](/run/install/) up to editing `.env`, then restore instead of starting it, so the server never starts with an empty database. Use the backed-up `.env`, or at least its `AUTH_SECRET`.

Put `lawfive-db.sql.gz` and `lawfive-uploads.tar.gz` in the folder with `compose.yaml`, then run these from it. `--wait` holds until the database is ready to take the restore.

```sh
docker compose up -d --wait db
gunzip -c lawfive-db.sql.gz | docker compose exec -T db psql -U lawfive lawfive
docker compose run --rm --no-deps --entrypoint "" -v "$PWD:/backup" server \
  tar xzf /backup/lawfive-uploads.tar.gz -C /data
docker compose up -d
```

On its first start the server's log may say `relation "__drizzle_migrations" already exists, skipping`. That's expected.

Try a restore on a spare machine at least once, so you know your backups work before you need them.

## One person's account

Anyone can keep their own copy, whichever server they're on. **Settings → Account** has:

- **Download everything:** a zip of the account's records as JSON, with its tracks and photos, and a short README of the format.
- **Restore from an export:** merges a zip into the account. Records keep their ids, and where a record is in both, the one changed last is kept. Running it twice changes nothing more.

This also moves an account from one server to another.

A restore is written to the container's temporary folder while it's read, so it needs that much free space, up to the 2 GB limit. Behind a proxy, check that the proxy's upload limit allows it too.
