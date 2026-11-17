# Plan: Strava and other health integrations

**Status:** Proposed, not built. The model: a match's track can come from a workout recorded by any watch, found by its time in the phone's health store (Health Connect on Android, Apple Health on the iPhone) or in Strava, converted to LawFive's track format (TRK-1) and attached to the match's report. The health stores come first, as they need no outside service; Strava waits on its terms. Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) when it's built.

## In short

Many referees run a match with LawFive and record it with another watch: a Garmin running its own soccer activity, a Polar, a Coros, a Pixel Watch, an Apple Watch's Workout app. Today their movement and heart rate reach LawFive only as a file uploaded on the website (TRK-8). This plan brings them in by themselves where it can:

- **Health Connect (Android) and Apple Health (iPhone):** after a match, the phone looks for a workout recorded at the match's time, and offers it: "Found a recording: Polar Pacer, 10:52 to 12:41. Add it to this match?" One tap reads its route and heart rate, converts them, and uploads the track.
- **Strava:** connecting a Strava account lets the server find each new activity at a match's time, the same way. It's last, and only built once Strava says in writing that LawFive may keep what it reads.
- **Posting a match to Strava** isn't proposed for now.

Every source ends in the same track (TRK-1), so the figures, map, replay and heatmaps (TRK-3 to TRK-15) work unchanged.

Not in this plan: Garmin Connect's own API (below), Polar's and Coros's APIs, and reading anything from the health stores but workouts, their routes and heart rate.

## What's already there

- **The track format** (`schema/src/track.ts`): `MatchTrack` with a source (`TrackSourceKind` already includes `appleHealth`, `healthConnect` and `strava`), a start, GPS (`t`, `lat`, `lon`, optional accuracy and the watch's speed) and heart rate as separate series, up to 43,200 samples each. Uploaded with `PUT /v1/match-records/{id}/track` (TRK-2, `match-records:write`), stored gzipped beside the report, figures worked out on each fetch.
- **Activity files** (TRK-8): `web/src/trackFile.ts` converts FIT (with `fit-file-parser`), GPX and TCX in the browser; `kickoffInRecording` warns when the kickoff isn't in the recording (or up to an hour before it began); `periodsFromStretches` makes a report's periods from where the recording paused, for a match with no report; `web/src/components/AddTrack.tsx` previews before saving and asks the score. Website only.
- **Health Connect, writing** (WCH-7): `mobile/android/app/src/main/java/app/lawfive/data/HealthSave.kt` saves Wear OS matches as soccer exercises with route, heart rate and distance, under `androidx.health.connect:connect-client`; the manifest asks only `WRITE_*` health permissions, and `HealthRationaleActivity` opens the privacy policy.
- **HealthKit, on the Apple Watch only** (WCH-7): `mobile/ios/LawFiveWatch/Recording.swift` runs the match as a workout and saves it with its route. The Watch has the HealthKit entitlement and `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` (`LawFiveWatch-Info.plist`); the iPhone app has neither.
- **Privacy:** `site/public/privacy.html` says LawFive reads nothing from Apple Health or Health Connect apart from the Apple Watch's and Wear OS watch's own readings during a match. `site/public/permissions.html` (SITE-14) lists every permission, checked against the manifests by `tools/check-permissions.mjs`. The iPhone's `PrivacyInfo.xcprivacy` already lists health and fitness data.
- **Where a track is seen by others:** a match's share link (DATA-7, `server/src/share.ts`) shows its track to anyone with the link; API keys read tracks with `match-records:read` (TRK-2); the API is described for AI agents (AGT).
- **Garmin's server APIs aren't used** (Key decisions in [ARCHITECTURE.md](../ARCHITECTURE.md)), as they need approval per organization.

## The sources

What each offers, from its own documentation unless marked.

| Source | Route and heart rate | What it takes | Limits and terms |
|---|---|---|---|
| **Health Connect** (Android) | Exercise sessions with `ExerciseRoute` (positions with accuracy) and heart rate records in the session's time. Whether another app's session has a route depends on that app: Polar's own help pages disagree on whether it writes routes (unconfirmed). | Read permissions `READ_EXERCISE`, `READ_HEART_RATE`, and `READ_EXERCISE_ROUTES`, which only the person can grant (in Health Connect, or through the route request screen). A route written by another app read in the background answers `ConsentRequired`, so routes are read with the app open. Data from more than 30 days before the first grant needs `READ_HEALTH_DATA_HISTORY`. | Google Play: the Health apps declaration in Play Console (App content), filled again when new data types are read; only what user-facing features need; the privacy policy shown in Health Connect is the app's. |
| **Apple Health** (iPhone) | Workouts with `HKWorkoutRoute` (read in batches with `HKWorkoutRouteQuery`, each a `CLLocation` with accuracy and speed) and heart rate samples. An Apple Watch's Workout app writes routes; Garmin Connect and Polar Flow write workouts to Apple Health, but routes are **unlikely** (Polar's page lists none; reports on Garmin conflict). | The HealthKit entitlement on the iPhone app, `NSHealthShareUsageDescription`, and the person's permission per type. Apple doesn't tell an app whether reading was refused, so "nothing found" and "not allowed" look alike. | App Review: health data never for advertising or data mining (5.1.3), never in iCloud, the use said in the description (2.5.1). |
| **Strava** | Any activity's streams (time, positions, heart rate, speed), for activities from almost every watch, as Garmin, Coros, Polar, Suunto and Wahoo send to Strava by themselves. | OAuth per athlete (scope `activity:read_all` for private activities), access tokens of six hours with refresh tokens. One webhook subscription per application says when an activity is created, changed or deleted, or the athlete disconnects; the activity is then fetched. | Default 100 reads per 15 minutes and 1,000 a day per application (200 and 2,000 once upgraded in the dashboard), shared by all its athletes. A new application connects only its owner's account, then up to 10 athletes; more needs Strava's review, which reports say now needs a Strava subscription for the developer (unconfirmed). The API agreement: data from an athlete shown only to that athlete; no applications that replicate Strava. Reported but not confirmed in Strava's own text: no use in AI applications (prompts and context included); nothing cached longer than **7 days** (API Policy 6.2); deletion within 48 hours of disconnecting. |
| **Garmin Connect** | Activities as FIT files and JSON. | The Connect Developer Program: an application reviewed by Garmin, its tiers for organizations; a "Personal" tier reads only the developer's own data. New applications are **paused** with no date to reopen (reported, not on Garmin's pages). | Not usable by a self-hosted server, as the Key decisions say. Garmin's "Export Original" file through TRK-8 stays the Garmin route. |

What this means:

- **The health stores are where to start:** no outside service, nothing to register per server, data the person already chose to keep on their phone. But routes from watches other than Apple's and Google's own are patchy there; heart rate is more reliable.
- **Strava is the one place with every watch's route,** and its terms are the obstacle: a 7-day limit on keeping its data would rule out a track kept with a match, and a share link would show it to others.

## Proposed behavior

### Finding a match's recording

One rule, written once in `schema/src/` with the phones' ports and a shared case, as stats and track math are:

- **A candidate** is a workout or activity whose recording covers the match's kickoff, or began up to an hour after it (the window TRK-8 already warns with), that LawFive didn't write itself (not its own Apple Watch workouts or Wear OS exercises saved to Health Connect, which already have tracks).
- **The best candidate** is soccer before other kinds, then the one whose start is nearest the kickoff.
- **One recording, several matches** (a tournament day under one activity): each match takes the stretch from 10 minutes before its kickoff to its last period's end (from its report), or, without a report, to the next match's kickoff or its format's length with breaks and 20 minutes more, whichever comes first.
- **Which matches look:** played, or scheduled with the kickoff passed, from the last 30 days, without a track. A match with a track from a LawFive watch or a file is never offered another.

### Offering it

On a match's page in the Android and iPhone apps (and on the website too, once Strava is connected), in the Movement and heart rate card's place (TRK-5, TRK-14), a played match without a track and with a candidate shows **Found a recording**: what recorded it ("Polar Pacer, through Health Connect"), from when to when, whether it has a route and heart rate, and the distance. **Add** reads it, previews it as TRK-8 does, and uploads it. A match with no report asks the score first and makes its periods from the recording, as TRK-8 does on the website.

It doesn't attach by itself: a phone can't tell a warm-up jog from the match, and a wrong track spoils the figures and Stats. **Automatic** is an [open question](#open-questions).

A track with heart rate but no route is added as it is (TRK-1 allows either), and the card says "No route in this recording".

### Health Connect (Android)

- **Settings → Fitness → Read from Health Connect**, off until turned on, next to Save Wear OS matches. Turning it on asks for exercise, heart rate and exercise routes; the explanation says what for, and the "why" link is the privacy policy, as for saving.
- The phone looks when the app is opened and after a sync, only while it's open (routes from other apps need it), and reads only within the matches' windows.
- Without the route permission, it reads heart rate and says routes need "Allow exercise routes" in Health Connect, with a button to the route request screen.
- No history permission: matches from before 30 days ahead of the first grant aren't looked for.

### Apple Health (iPhone)

- **Settings → Fitness → Read from Apple Health**, off until turned on, asking for workouts, workout routes and heart rate. The iPhone app gains the HealthKit capability and `NSHealthShareUsageDescription`: "LawFive finds the workout you recorded during a match, from any watch, to show your movement and heart rate on it."
- The phone looks when the app is opened and after a sync, reading the routes with `HKWorkoutRouteQuery` (each position's speed and accuracy go into the track).
- As Apple doesn't say whether reading was refused, a match with nothing found says "No recording found in Apple Health", with where to check LawFive's access in the Health app.

### Strava

Only after Strava answers in writing (see [open questions](#open-questions)):

- **Settings → Fitness → Connect Strava** (Strava's own "Connect with Strava" button, as its brand guidelines ask), on the website and the phones' browser sheet; the server keeps the tokens encrypted as assignor links are (FEED-2).
- The server hears of new activities by Strava's webhook (answering within two seconds and fetching afterward), or, where Strava can't reach the server, by asking for activities since the last one every 30 minutes. Each activity found as a candidate for a match is offered on the match page as above; Add fetches its streams once and converts them on the server.
- Tracks from Strava are shown only to their owner: never on a share link (DATA-7), never to an API key (so not to agents, AGT). Disconnecting deletes them within 48 hours, and they say "From Strava" with Strava's attribution.
- **Self-hosted:** each server registers its own Strava application (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`) and is limited to its owner and up to 10 athletes until Strava reviews it, enough for a small server. The hosted service applies for review.

### Garmin

No Garmin Connect API: a referee with a Garmin can run LawFive's own Garmin app (TRK-7), upload the Export Original file (TRK-8), or let Garmin Connect send activities to Strava. The plan doesn't change the Key decision.

### Privacy and the stores

- `site/public/privacy.html`: what's read from Health Connect, Apple Health and Strava (a workout's route and heart rate, only for a match the person adds it to), and that nothing else is; replacing "Apart from those readings we read nothing from Apple Health or Health Connect".
- `site/public/permissions.html`: the read permissions (Android) and Apple Health on the iPhone, with `tools/check-permissions.mjs` passing.
- Google Play: the Health apps declaration updated for the read types, and the Data safety form.
- App Store: the iPhone's HealthKit purpose string, the privacy manifest's health and fitness entry (already listed) checked, and the App Store description naming the Apple Health integration (2.5.1).
- The terms' minors rule doesn't change: these are the person's own readings.

## Proposed requirements

Drafts, as **TRK-n**, **APP-n** and **IOS-n**, with TRK-12 replaced by them:

- **TRK-16 (Draft)** **A match's recording, found by time:** a workout covering the kickoff, or starting up to an hour after it, not written by LawFive, soccer first, then the nearest start; one recording over several matches cut to each match's stretch; played matches from the last 30 days without a track.
- **TRK-17 (Draft)** **Found a recording** on the match page (website and phones): what, when, route and heart rate, distance; Add previews and uploads, asking the score for a match without a report; a recording with heart rate only is added as such.
- **TRK-18 (Draft)** **Health Connect** on Android: Read from Health Connect in Settings → Fitness, off by default; exercise, heart rate and routes, read only with the app open, never before the 30 days the first grant allows.
- **TRK-19 (Draft)** **Apple Health** on the iPhone: Read from Apple Health in Settings → Fitness, off by default; workouts, routes and heart rate.
- **TRK-20 (Later)** **Strava:** a connected account's activities found by the webhook or by asking, offered as TRK-17; its tracks shown only to their owner, never on share links or to API keys, deleted within 48 hours of disconnecting; each server's own Strava application. Waits on Strava's written answer on keeping its data.
- **APP-30 (Draft)** The Health apps declaration in Play Console covers reading exercise, heart rate and routes, with the privacy policy as Health Connect shows it.
- **IOS-16 (Draft)** The iPhone app has the HealthKit capability and its purpose string, for reading (IOS-11).

## The work, in order

1. **The rule and reports from recordings, shared:** the candidate rule and the per-match stretch in `schema/src/`, with a shared case and the Kotlin and Swift ports; `periodsFromStretches` moved from `web/src/trackFile.ts` to `schema/src/` so the phones and server make the same periods. About a day.
2. **Android, Health Connect:** the read permissions in the manifest, Settings → Fitness, finding and converting sessions (route, heart rate, device from the record's metadata), the Found a recording card with the score question, the route consent flow; the Play declaration; snapshots. About 2 days.
3. **iPhone, Apple Health:** the capability, purpose string, Settings, `HKWorkoutRouteQuery` and heart rate reads, the same card; snapshots. About 2 days.
4. **Privacy and docs:** the privacy and permissions pages, the stores' forms, lawfive.app's `tracks.html` on where tracks come from. Half a day.
5. **Strava**, once its answer allows it: OAuth, tokens, the webhook with its challenge and a poll for servers it can't reach, streams to track, the owner-only rules, deletion on disconnect, server settings, the Found a recording card on the website, Connect on the website and phones, lawfive.dev's Strava page for self-hosters. About 3 days.

About 5 to 6 days without Strava, 8 to 9 with it.

### Why this order

Health Connect first: the Android app is in real use, already depends on the Health Connect client, and the Play declaration it needs for writing (WCH-7) can cover reading in the same form. Apple Health next, as the iPhone's first App Review can take the HealthKit reading with everything else. Strava last because it's the only part that needs an outside party's permission, that's limited per server, and whose terms may not allow keeping a track at all; meanwhile its Export Original file works through TRK-8.

## Open questions

1. **Attach by itself, or offer?**
   - (a) Always offer, one tap to add; (b) attach by itself when a match has a report and exactly one soccer recording covers it; (c) attach any candidate.
   - **Recommendation: (a) now, (b) later as a setting** once offers have been seen to pick the right recording in real use.
2. **Which first.**
   - (a) Health Connect, Apple Health, then Strava; (b) Strava first, as it has every watch's route; (c) Apple Health first.
   - **Recommendation: (a)**, for the reasons above.
3. **Strava and its 7-day rule.**
   - (a) Ask Strava in writing whether a track kept with a match, shown only to its owner, is allowed, and build only with a yes; (b) build keeping only the figures, not the track, losing the map, replay and heatmaps; (c) don't connect Strava, and say in the app how to download the file from Strava for TRK-8.
   - **Recommendation: (a), with (c) meanwhile.** (b) leaves the feature too thin to be worth Strava's review.
4. **Posting a match to Strava.**
   - (a) Not now; (b) an opt-in to post matches recorded by LawFive's Wear OS and Apple Watch apps as Soccer activities (FIT upload, `activity:write`); (c) every match with a track.
   - **Recommendation: (a).** Garmin Connect and Apple's Workout data already reach Strava for most referees, a second copy would be a duplicate, and posting adds the write scope to Strava's review. (b) is the one to revisit if Wear OS and Apple Watch referees ask.
5. **Reading from before the first grant.**
   - (a) No history permission: the 30 days before the first grant on Android, whatever Apple Health has on the iPhone; (b) ask for `READ_HEALTH_DATA_HISTORY` to look back further.
   - **Recommendation: (a).** Matches are added soon after they're played, and one fewer permission is one fewer thing for Play to question.
6. **Reading in the background on Android.**
   - (a) Only with the app open; (b) ask for `READ_HEALTH_DATA_IN_BACKGROUND` too.
   - **Recommendation: (a).** Routes from other apps need the app open anyway, so a background read would find heart rate without the route.

## Checks

- Real recordings through each store: an Apple Watch Workout app soccer session, a Pixel or Galaxy Watch through Health Connect, a Polar and a Coros through each, and a Garmin through Garmin Connect's sharing; which carry a route and which only heart rate. This replaces the conflicting reports in the table.
- A tournament day under one recording, cut into its matches, against the referee's memory of when each started.
- The Play declaration and App Review accepting the read permissions.
- Strava's written answer on keeping data, showing it only to its owner, and AI use, before step 5.

## Sources

- Health Connect: [Exercise routes](https://developer.android.com/health-and-fitness/health-connect/features/exercise-routes), [HealthPermission](https://developer.android.com/reference/kotlin/androidx/health/connect/client/permission/HealthPermission), [Publish your health app on Google Play](https://developer.android.com/health-and-fitness/health-connect/publish), [Health Connect policy FAQs](https://support.google.com/googleplay/android-developer/answer/12991134).
- Apple: [Reading route data](https://developer.apple.com/documentation/healthkit/reading-route-data), [HKWorkoutRouteQuery](https://developer.apple.com/documentation/healthkit/hkworkoutroutequery), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (2.5.1, 5.1.3).
- Strava: [Getting started](https://developers.strava.com/docs/getting-started/), [Rate limits](https://developers.strava.com/docs/rate-limits/), [Webhooks](https://developers.strava.com/docs/webhooks/), [Uploads](https://developers.strava.com/docs/uploads/), [API reference](https://developers.strava.com/docs/reference/), [API agreement](https://www.strava.com/legal/api), [Developer program](https://communityhub.strava.com/developers-knowledge-base-14/our-developer-program-3203). Reported, not in Strava's own pages as read: [the 2026 changes](https://tryterra.co/blog/strava-api-changes-2026) (tiers, subscription, AI, 7-day caching), [the 2024 agreement change](https://dcrainmaker.com/2024/11/stravas-changes-to-kill-off-apps.html), [7-day and 48-hour rules](https://communityhub.strava.com/developers-api-7/clarification-on-api-policy-6-2-retaining-an-athlete-s-own-activity-data-for-historical-comparison-13928) (community answers, not Strava staff).
- Garmin: [Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview), [the pause](https://tryterra.co/blog/garmin-connect-developer-program-pause) (reported).
- Polar: [Flow and Health Connect](https://support.polar.com/en/flow-app-health-connect), [Flow and Apple Health](https://support.polar.com/en/support/connecting_polar_flow_with_apple_health).

Not confirmed: Strava's 7-day, 48-hour and AI rules in its own current text, and the subscription for review; Garmin's pause; which watches' apps write routes to Health Connect and Apple Health (Garmin, Coros, Polar).
