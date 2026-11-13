---
title: Email, maps and weather
description: Set up email, photo storage, maps, address search and weather on a LawFive server.
---

All of these except photo storage can be set under **Settings → Server**. See [how settings work](/run/settings/).

## Email

Email is optional. With it, invitations can be emailed, admins hear when someone is waiting for approval, people hear when they're approved, and anyone can reset a forgotten password themselves. Without it, admins copy those links from **People** and send them however they like.

Most email services offer SMTP, including Postmark, Resend, Mailgun, and Gmail with an app password.

```ini title=".env"
SMTP_URL=smtp://user:password@smtp.example.com:587
MAIL_FROM=LawFive <lawfive@example.com>
```

Use `smtp://` on port 587 for STARTTLS, or `smtps://` on port 465. **Send a test email** in Settings → Server sends to you through the saved settings, and shows the SMTP server's own words if it fails.

## Photo storage

Photos go in the server's `uploads` volume by default. To use an S3-compatible bucket instead (AWS S3, Cloudflare R2, Backblaze B2, MinIO), set `S3_URL`:

```ini title=".env"
S3_URL=https://ACCESS_KEY:SECRET@s3.us-east-1.amazonaws.com/my-lawfive-photos
```

Add `?region=…` if the host doesn't include the region, and URL-encode the key and secret if they contain characters like `/` or `+`.

How much each account can keep is set by its [plan](/run/people/#plans-and-limits). `ACCOUNT_STORAGE_LIMIT_MB` sets the storage of a new server's first plan; after that, change it in Settings → Server → Plans. Once a plan limits storage, accounts in it also hold at most 50,000 records. A match recorded on a watch and its track are never refused, as they can't be recorded again.

## Maps

The default is OpenFreeMap's vector map, which is free, needs no key, and has a dark style.

- **Another style:** set `MAP_STYLE_URL` to any MapLibre style, with `MAP_STYLE_DARK_URL` and `MAP_STYLE_ATTRIBUTION`.
- **Raster tiles:** set `MAP_STYLE_URL=off`. `MAP_TILE_URL` then draws the map. It's OpenStreetMap's by default, which suits a personal server. A busy server should use a tile provider. Apps that can't draw vector maps always use these tiles.
- **Satellite imagery:** this makes placing pitches much easier. It adds a Map and Satellite switch on venue maps, and providers need a key. For example, with MapTiler's free tier:

  ```ini title=".env"
  MAP_SATELLITE_URL=https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=YOUR_KEY
  MAP_SATELLITE_ATTRIBUTION=© MapTiler © OpenStreetMap contributors
  ```

  Check your provider's documentation for the exact address and the credit it requires.

## Address search

Placing a venue uses OpenStreetMap's Nominatim by default, which suits a personal server. Set `GEOCODER_URL` to another Nominatim-compatible service, or to `off`.

## Weather

Forecasts and past weather come from [Open-Meteo](https://open-meteo.com), and the server stays under `WEATHER_DAILY_LIMIT` calls a day.

Open-Meteo's free API needs no key, and is for non-commercial use up to 10,000 calls a day. A commercial service needs its paid plan:

```ini title=".env"
WEATHER_URL=https://customer-api.open-meteo.com
WEATHER_HISTORY_URL=https://customer-archive-api.open-meteo.com
WEATHER_API_KEY=your-key
```

Set either address to `off` to turn it off. A self-hosted Open-Meteo works too.
