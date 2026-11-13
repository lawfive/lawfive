# Architecture

How LawFive fits together: the pieces, the data model, how data moves between them, the identifiers that are fixed once published, self-hosting, and what's next. Behavior is in the [requirements](requirements/README.md); this file is about the system around it.

## Product

LawFive is a product for soccer referees, named after Law 5 ("The Referee") in the Laws of the Game. It has watch apps for running a match (Garmin, Wear OS, Apple Watch), phone apps (Android, iPhone), a server with a web UI, and a website at **lawfive.app**. The open-source project lives at **lawfive.dev**.

It is **open source and self-hostable**: anyone can run the server and point the published watch and phone apps at it. The project also runs a hosted service at `app.lawfive.app` and `api.lawfive.app`, which the apps use by default. Anyone can sign up there; new accounts are approved by hand for now. A small paid plan may come later, for people who don't want to run a server and for features that are hard to run on your own (A-4).

Besides running the match, LawFive covers the work around it: matches set up once (or read from an assignor's calendar) and synced to every device, weather for each match, reminders and notifications, a calendar feed, venues and fellow referees, stats, and GPS and heart rate from the watch (distance, tracks, replays, heatmaps).

## Components

| Component | Folder | Language | Role |
|---|---|---|---|
| Shared contract | [schema/](../schema/) | TypeScript (Zod) | The data model, the API description and example files every component is tested against. Generates JSON Schema, OpenAPI, an API reference, and Kotlin and Swift types. |
| Server | [server/](../server/) | TypeScript (Hono, Drizzle, Better Auth) | The source of truth: accounts, the API, the web UI's files, and background jobs (weather, webhooks, notifications, assignor calendars). One Docker image with Postgres. |
| Web UI | [web/](../web/) | TypeScript (React, Vite) | The signed-in website: matches and their reports, templates, venues, referees, competitions, stats and settings. Static files the server serves. |
| Marketing site | [site/](../site/) | HTML and CSS | `lawfive.app` on Cloudflare Pages: hand-written pages, with the web UI's quiz, match screen setup, Try a match and replay built in (SITE-9). |
| Push relay | [relay/](../relay/) | TypeScript | Lets any LawFive server wake a LawFive app without holding Firebase's keys, at `push.lawfive.app` on Cloudflare Workers. Keeps no user data. |
| Docs site | [docs-site/](../docs-site/) | Astro Starlight | `lawfive.dev`, for self-hosters and developers. Its API reference is made from `schema/generated/`. |
| Android app | [mobile/android/](../mobile/android/) | Kotlin (Jetpack Compose) | Match-day companion: an offline copy of the user's matches, the bridge to a Garmin watch, reminders, photos. |
| iPhone app | [mobile/ios/](../mobile/ios/) | Swift (SwiftUI) | As Android. |
| Wear OS app | [mobile/android/wear/](../mobile/android/wear/) | Kotlin (Compose) | The match on the watch, offline, syncing straight to the server. A module beside the phone app, with the same application ID. |
| Apple Watch app | [mobile/ios/LawFiveWatch/](../mobile/ios/README.md#apple-watch) | Swift (SwiftUI) | The same, as a target in the iPhone app's project. |
| Garmin watch app | [watch-garmin/](../watch-garmin/) | Monkey C | Runs the match. Syncs through the phone app when it's there, else directly with the server. |

The repo is a monorepo with the folders above. Types are generated from `schema/` for TypeScript, Kotlin and Swift. Monkey C has no generated types, but `pnpm generate` writes the shared match cases into it (`watch-garmin/source/MatchCases.mc`), so every watch runs the same cases (WCH-2).

## Data and sync

**The server owns all data.** Every client, the web UI included, reads and writes through one versioned API (`/v1/…`).

**Apps choose their server.** At sign-in the phone apps offer the hosted service or "my own server" (a URL). Self-hosted servers often run older versions than the apps, so the server publishes its API version and capabilities (`GET /v1/meta`) and the apps adapt. `/v1` only grows: new fields are optional and unknown ones are ignored (VER-4).

**Phones work offline.** Each phone keeps a local database of the user's records and an outbox of changes. When it has a connection it sends the outbox (each change carries the version it was based on), then asks for what changed since its last sync (`GET /v1/changes`, with a cursor). On a conflict (409) the phone puts its changed top-level fields onto the newer copy and sends it again ([sync](requirements/sync.md)).

**Watches hold only what they need:** the upcoming matches, in the shape the server's watch endpoints give, and the records of matches played, kept until the server confirms them.

**Watch sync paths:**

1. *Direct.* A Garmin watch makes web requests through the Garmin Connect phone app. It links to the user's account once with a code entered on the website, and then downloads matches and uploads results itself. Garmin only allows HTTPS with a valid certificate, so a self-hosted server must be reachable over HTTPS from the internet. Wear OS and Apple Watch sync directly over their own connection, with the same API.
2. *Through the phone app.* On Android, a Garmin watch's requests go through the LawFive app with Garmin's Connect IQ mobile SDK. The app relays the watch's own requests, so there's one watch format, made by the server. Without signal it keeps what the watch sends and answers with its last fetch (APP-7). The watch tries the phone first and falls back to direct. The iPhone does the same with Garmin's iOS SDK, not yet tried on hardware (IOS-9). A live link between the phones and Wear OS or Apple Watch is later (WCH-8).

**The server keeps the watch small.** `GET /v1/watch/matches` gives the next matches (at most 10) in the shape the watch starts a match from, and `POST /v1/watch/records` takes a finished match as the watch saved it, short event codes and all, and converts it. Re-sending a match updates the same record. The Garmin app has 768 KB of memory (64 KB in the background). Which matches each watch holds is kept per watch session (`GET /v1/devices/matches`), outside the records, so a watch's syncs don't change match versions (SYNC-14).

**Each client has its own UI over the API.** The web UI, served by the server so self-hosters get it too, handles management. The phones are native for match day, the watch bridge, offline use and notifications; management features can stay web-only until there's a reason to build them natively.

## Data model

The schema in [schema/](../schema/) defines these records (see its [examples](../schema/examples/) and the match fields in [MATCH_CONFIG.md](MATCH_CONFIG.md)). Everything belongs to one user account; nothing is shared between accounts, though a match can have a read-only share link (DATA-7).

| Record | What it holds |
|---|---|
| Match template | A reusable match format ("U12 league: 2×30, 5 min half-time"): periods, lengths, breaks, halfway break, extra time (and golden goal), penalties, stoppage tracking, goal types, team size. An optional default fee. |
| Match | One referee's own copy of a fixture: its format (copied from a template, so editing the template doesn't change past matches), kickoff and time zone, status (scheduled, played, abandoned, canceled, postponed), home and away teams (name, short name, color, typed per match), gender and age group, competition, venue and pitch, the user's role and the crew, notes, fee, and an optional external match ID. |
| Match record | The match report the watch uploads: actual period times, events, final score and penalty result, distance covered, kickoff direction. It can have a track (GPS and heart rate, TRK-1), stored apart from the record. |
| Event | Goal (with type), caution, second caution, send-off, sin bin, stoppage, penalty kick, period end, injury, suspension (such as a lightning delay), abandonment. Team, period, match time and player number where they apply. Cards are for a player or a team official, and can carry a misconduct code. |
| Venue | Name and street address (often where you park), with named pitches ("Field 3"), each with its own GPS position and marked corners (TRK-13), which place its heatmap. |
| Competition | One flat record per competition per season: name, organizer, type, season, age group and level. It can link to a match template, which sets its matches' format and fee, and can override the misconduct scheme. |
| Referee | People the user works with, linked to matches with their role (Referee, AR1, AR2, 4th). |
| Settings | One synced record per user: units, currency, misconduct scheme, the usual role and format (SET-17), and more. |
| Tags | Free-text labels ("indoor", "needs AR") on matches, venues and referees; up to 20 each, unique ignoring case. |
| Match weather | Not a stored record: the server works it out from the forecast for the match's place and serves it at `GET /v1/weather`. Kept with the match once it's over. |
| Misconduct scheme | Caution and send-off codes from IFAB, US Soccer and The FA, as data files in `schema/misconduct/`, so more can be added without code changes. |

Rules:

- **One copy per referee.** If two LawFive users officiate the same match, each has their own.
- **IDs:** every record has a UUID made by whichever device created it, so phones can create records offline. A match can also have an external match ID with its source (`csv`, `manual`, an assignor), unique per user and source, used to find and update the same match when a file or calendar is read again.
- **Units and names:** durations in seconds, colors as hex, times as ISO 8601 with a UTC offset, camelCase JSON, readable event types (`ownGoal`, `secondCaution`).
- **Misconduct codes:** a card stores its scheme and code, so changing the scheme later doesn't change old matches.
- **Short names:** a team's short name that isn't typed is worked out where it's shown, by one rule in `schema/src/shortNames.ts`, ported to both phones and tested by shared cases (SET-5).
- **Sync fields on every record:** last-updated time, a deleted marker, and a version.
- **Not in the schema yet:** saved teams (later they belong to a competition, since many teams last only a season), nested competitions (divisions, a tournament within a league) and substitutions. The watch's own preferences (vibration, reminders, labels) are device settings, not match data.

## Features and where they live

| Feature | How |
|---|---|
| Weather | A server job keeps Open-Meteo forecasts by place (squares about 5 km across), only for places with a match in the next 16 days, more often as kickoff nears, within a daily limit. Apps read each match's weather and risks from `GET /v1/weather`; the watch gets a short line. Self-hosters need no key ([weather](requirements/weather.md)). |
| Notifications | Match reminders are scheduled on the phone, at the account's reminder times (APP-6, IOS-6, CAL-3). The server decides on new weather risks (PUSH-5) and on matches an integration adds or changes ([integration notifications](requirements/integration-notifications.md)), and sends them through the push relay. |
| Assignor calendars | The server reads each assignor system's private calendar link (stored encrypted) every 30 minutes: one reader, with small rules per system for how it writes its games, saving through the import. Each event's text is kept with its match, so rules added later can read old games again. Arbiter is first ([assignor calendars](requirements/assignor-calendars.md)). |
| Calendar feed | A subscribable ICS feed per user, built on each fetch ([calendar feed](requirements/calendar-feed.md)). |
| Quiz | Questions are files in `schema/quiz/`, served at `GET /v1/quiz`; each app works out an attempt with the same rules and saves nothing ([quiz](requirements/quiz.md)). |
| Stats | Worked out by the server on request (`GET /v1/stats`, and `GET /v1/stats/games.csv`). Which games match a filter is one function in `schema/src/stats.ts`, used by the web app's match list too, so a chart's count and the list it opens agree ([stats](requirements/stats.md)). |
| Position and heart rate | Every source is converted into LawFive's track format before upload, and the server works out the figures, so they're the same whichever watch recorded them. Sources: the watch apps' own recording; imported RefSix, FIT, GPX and TCX files; later Strava, Health Connect and Apple Health. Heatmaps need the pitch's position, found from the track, marked by hand, or from corners walked on the watch ([tracks](requirements/tracks.md)). |
| Photos | Attachments on matches, venues and referees, kept in a folder or any S3-compatible bucket and served through the API ([photos](requirements/photos.md)). |
| Integrations | [API keys](requirements/api-keys.md) per area, signed [webhooks](requirements/webhooks.md), [importing](requirements/importing.md) matches from files, downloading or restoring a whole account ([data export](requirements/data-export.md)), and [API descriptions for agents](requirements/agent-descriptions.md). |
| Plans and limits | Named sets of limits per account, set by admins and checked by the server where things are added ([plans and limits](requirements/plans-and-limits.md)). |
| Duplicates and merging | Found and previewed by the server only; the website and both phones show what it answers ([merging](requirements/merging.md)). |

## Open source and self-hosting

**What self-hosters run:** the server's Docker image and Postgres, behind HTTPS with a valid certificate, set up by one `compose.yaml` (built from source, or a published image when `LAWFIVE_IMAGE` is set). Photos go in a Docker volume or any S3-compatible bucket. Email is optional, through any SMTP server.

**What needs the project's own services:**

| Need | Why it can't simply be self-hosted | Approach |
|---|---|---|
| Push notifications | Only the app's publisher can send pushes to the store apps | Self-hosted servers send through the project's push relay ([relay/](../relay/)), free within its limits ([push relay](requirements/push-relay.md)). |
| Sign in with Apple or Google | Tied to the apps' registration with Apple and Google | Self-hosted servers use email and password, or their own single sign-on (OIDC). The hosted service can add Apple and Google sign-in. |
| Store builds of the apps | Signed with the project's keys | Everyone uses the same store apps; anyone can also build them from source. |

**The hosted service** runs the same published image behind Caddy and Cloudflare. Encrypted nightly backups are kept 21 days and logs 30, so the privacy policy's 30 days holds. Its settings and secrets stay on the server, never in the repo.

## Naming and identifiers

The product is **LawFive**, one word (it matches the domain and is easy to search for). Some identifiers are permanent once published:

| Identifier | Value | Changeable later? |
|---|---|---|
| Display names, store listings | LawFive; on the App Store, LawFive Referee (IOS-11) | Yes |
| Repo, folder and package names | `lawfive` | Yes (refactor) |
| Marketing site | `lawfive.app` | Yes |
| Web UI (hosted) | `app.lawfive.app` | Painful: sign-in and deep-link setup |
| Hosted API (the apps' default server) | `api.lawfive.app` | Painful: built into installed apps |
| Docs, self-hosting guide, API reference | `lawfive.dev` | Yes |
| Push relay | `push.lawfive.app` | Painful: built into self-hosted servers and the apps |
| App links (APP-13, APP-14) | `lawfive://sign-in`, `lawfive://invite` | Painful: built into installed apps and the web app |
| Android application ID | `app.lawfive` | No, once uploaded to the Play Console |
| iOS bundle IDs | `app.lawfive`, `app.lawfive.watchkitapp` | No, once on App Store Connect (they are) |
| Connect IQ app ID | The UUID in `watch-garmin/manifest.xml` | No; the display name can change |
| Server image | `ghcr.io/<owner>/lawfive` | Yes, but self-hosters' compose files and the docs follow |

`.app` and `.dev` are on the HSTS preload list, so every subdomain must serve HTTPS, which the apps need anyway.

## Key decisions

The technology and design choices that still shape the code.

**Shared contract**

- **Zod as the single schema source.** Records, API types and the watch's formats are written once in `schema/` and generated into JSON Schema, OpenAPI 3.1, Kotlin and Swift, so no client keeps its own copy.
- **Endpoints described as data** in `schema/src/endpoints.ts`. The server's tests check it both ways: the routes must be exactly those described, and every answer must match its description. Each server serves an OpenAPI document built from its own schema.
- **Logic shared where it must agree** (stats filters, track and pitch math, short names, the quiz) lives in `schema/src/`; the phones port it and run the same test cases.

**Server**

- **One Docker image (Node, Hono) with Postgres,** the same for self-hosters and the hosted service. Background jobs (weather, webhook retries, plan changes, calendars) run inside it, so self-hosting needs no queue service.
- **Drizzle** for the database, with committed migrations. Tests run against PGlite.
- **Records as schema-validated JSON** in one table with sync columns. A global sequence number per write drives `GET /v1/changes`; updates carry a version and get 409 with the current record on conflict. Ids are client-made UUIDs.
- **Better Auth** for accounts: email and password, bearer tokens for apps, a session cookie for the web UI. Watches link through its device-authorization flow (a code shown on the watch, entered on the website), so the server sees an ordinary link whether the website or a phone approves it.
- **API keys** in LawFive's own table, beside sessions: only a hash is stored, scopes follow the record collections, and an endpoint without a declared scope is closed to keys.
- **Derived, not synced:** match weather, stats, track figures and merge previews are worked out on request. Forecasts would flood the change feed, figures never go stale when the math changes, and merge rules live in one place instead of three languages.
- **Tracks** (parallel arrays per series, no resampling) are stored gzipped in their own table, not as synced records, as they're large and only the match page needs them. The Garmin watch sends them in chunks that decode on their own, in any order.
- **Files** go to a folder or an S3-compatible bucket (signed without the AWS SDK), resized in the browser so the server needs no image library, and served only through the API.
- **Webhooks** are delivery rows in Postgres, retried by a loop in the server, signed like Stripe's (HMAC-SHA256), with addresses checked against private ranges.
- **Server settings** set in the web app use each environment variable's name and format; the environment wins. Secrets are encrypted with a key derived from `AUTH_SECRET`.
- **Garmin's server-side APIs aren't used:** they need approval per organization, so self-hosters couldn't use them.

**Apps**

- **Native apps per platform:** Jetpack Compose on Android; SwiftUI with no third-party packages on iPhone (iOS 17 and later). Each keeps every record's JSON whole locally, so a save never drops fields a newer server added.
- **The match rules are one copy per language** (Monkey C, Kotlin, Swift, and TypeScript for Try a match), held together by the shared match cases in `schema/match-cases/`. Garmin's Monkey C can't share code, so a shared engine would still be two copies.
- **Wear OS and Apple Watch sync directly,** not through a phone bridge: no extra server work, one path to test, and it works with no phone app installed.
- **Web UI:** React, Vite, TanStack Query and React Router, plain CSS with color tokens, fonts and icons bundled, so it makes no outside requests. Maps are OpenFreeMap's vector style drawn by MapLibre inside Leaflet, set by the server; the iPhone uses MapKit, so the server's map settings don't apply there.
- **Marketing site:** hand-written HTML that works without scripts; its playable parts come from a second Vite entry in `web/`. The docs site is separate (Astro Starlight, npm, outside the pnpm workspace), as its audience differs.

**Distribution**

- **The push relay** is a small Cloudflare Worker that keeps nothing, rather than a hosted push service whose sending key every self-hosted server would need. A phone's Firebase token and server are sealed into a handle only the relay can read, so limits go by a server the sender can't fake; a Durable Object per server keeps exact counts. Firebase Cloud Messaging carries only an event and an id.
- **Versions come from git** (`tools/version.sh`, VER-1): each part that ships on its own is versioned by the date of the last commit that touched it. There's no shared schema version.
- **The server image** is built by GitHub Actions after the tests pass and published to the GitHub Container Registry for Intel and ARM.
- **Apache License 2.0** for the whole repo, with a `NOTICE` file that copies keep.
- **The paid service is sold on the website.** The apps are fully useful without it, with no purchasing or upgrade prompts inside them (outside regions where linking to web checkout is allowed). Apple may still expect in-app purchase, so the design leaves room for it.
- **Weather from Open-Meteo,** whose free API is non-commercial: a paid hosted service needs its paid plan (`WEATHER_API_KEY`) or a self-hosted Open-Meteo.

## What's built and what's next

Every piece exists: the schema, server, web UI, marketing site, docs site and push relay; the Garmin app with direct sync and the Android bridge; the Android and iPhone apps; and the Wear OS and Apple Watch apps. The Garmin watch and the Android app are in real use. Both phones have snapshot tests of their screens from shared sample data. The [requirements index](requirements/README.md) has the detail per area, and [risks](requirements/risks.md) what still needs checking on real devices.

Still to do:

- **Real devices:** the open checks on Garmin and Android (R-6); the iPhone, Wear OS and Apple Watch on real hardware, including tracks and pitch marking on the watches (R-12, R-13).
- **The iPhone's Garmin bridge** proven over Bluetooth (IOS-9).
- **Server notifications** on a real Android phone (R-18), and built on the iPhone.
- **More track sources:** Strava, Health Connect and Apple Health (TRK-12).
- **The watches' match screens** in the website's look ([DESIGN.md](../DESIGN.md)).
- **Mileage** from home to the pitch, as a proposal in [plans/mileage.md](plans/mileage.md).
- **The stores:** Connect IQ (starting with a private beta), Google Play (APP-9) and the App Store (IOS-10, IOS-11).
- **The paid hosted service,** once there is something worth paying for (A-4).

**For the stores and a public launch:**

- A trademark search and filing for LawFive (avoiding FIFA and IFAB marks), so forks can run but not under the name.
- If the hosted service offers Google sign-in on iOS, it must offer Sign in with Apple too.
- Health and location data bring extra store review and GDPR duties, and some youth referees are minors.
- Before the repo is public: a last check for personal details, contribution guidelines, and moving the repo to the `lawfive` GitHub organization (which renames the image, so the compose files and docs follow).

## Open questions

| ID | Question |
|---|---|
| A-4 | Which features a paid plan on the hosted service has. Limits per account, which a plan would set, are in [plans and limits](requirements/plans-and-limits.md). |
