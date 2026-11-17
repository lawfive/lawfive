# Plan: Garmin corrections

**Status:** Proposed, not built. Two fixes to the Garmin watch app: its planned match from the phone settings takes the short names from SET-5's rule, as every other copy does, and a request sent straight through Garmin Connect gives up what it was sending only when LawFive itself has refused it, never over a proxy's error page. Their requirement changes are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) when it's built.

## In short

**Short names.** A planned match set in Garmin Connect's phone settings shows `STR` v `STR` for Strikers U12 v Strikers U14, and `ST.` for St. Louis City, where the website, the phones, the server's download and Try a match all show `U12` v `U14` and `STL`. The watch gets its own copy of the rule in `schema/src/shortNames.ts`, checked by the same cases in `schema/short-names.json`, so the five copies can't drift apart.

**A 404 while the server restarts.** Without the LawFive phone app, the watch's requests go through Garmin Connect, which hides an answer's headers and, as far as can be told, its body when the status isn't 200. So the watch can't tell LawFive's "no such match" from Traefik's "404 page not found" while the server restarts, and it drops a fee change, a match screen or pitch corners it should have kept. The fix: a 400 or 404 counts as LawFive's refusal only with a sign that LawFive gave it: its JSON error (through the phone app, which passes it on), or, going direct, the server answering `GET /v1/meta` as LawFive straight afterward and refusing the same request again. Anything else waits for the next sync.

Not in this plan: a match the server refuses with 409 (it stays queued and stops the sync, as today); the watch's 401, which unlinks it (an [open question](#open-questions)); Wear OS and Apple Watch, which read headers (APP-23) and are already right.

## What's already there

### Short names

- **The rule:** `schema/src/shortNames.ts`, `suggestAliases(home, away)` and `shortName(teams, side)`: the typed short name; else the first three letters or digits of each name in capitals, skipping the words both names start with when those would be the same; else `HOM`/`AWY`. Words are split at anything that isn't a letter or digit (`\p{L}\p{N}`), so `St. Louis City` gives `STL`, and accented letters count (`Ñublense` gives `ÑUB`).
- **Its copies:** the server's watch download (`server/src/watch.ts`, `toWatchMatch`), the website and Try a match (`web/src/format.ts`), Android's `ui/Format.kt` and the iPhone's `UI/Format.swift`. All run the 20 cases in `schema/short-names.json`; `pnpm generate` (`schema/src/generate.ts`, `shortNameFiles`) copies them into Kotlin and Swift test files.
- **Garmin's planned match** (SET-11, R-9): `watch-garmin/source/Settings.mc`. `matchSetup(planned)` and the New match row's `plannedTitle` both call `teamAlias(alias, name, fallback)`, which takes the alias cut to 4 characters, else the name's first three characters in capitals (`name.substring(0, 3).toUpper()`), else the fallback. It sees one name at a time, so it can't skip a shared first word, and it keeps punctuation and spaces (`ST.`, `L84`). `MatchTests.mc` tests it (`testTeamAlias`, `testPlannedTitle`). A downloaded match is already right, as its short names come from the server.
- **The upload:** a match started from the planned match uploads as a quick match (no `matchId`). The server keeps the watch's short name only when it differs from what the names give (`server/src/watch.ts`, `team()`), so today Strikers U12 v Strikers U14 is stored with `STR` typed for both, and a later rename on the website doesn't change them. The fix mends this too.
- **The shared match cases** (`schema/match-cases/`, WCH-2) don't cover short names: they test the match engine. `pnpm generate` writes them into `watch-garmin/source/MatchCases.mc` as a `(:debug)` Monkey C function (`schema/src/matchCasesGenerate.ts`, `monkeyC()`), and `tools/test-watches.sh` checks the generated files are current. The short-name cases can follow the same path.
- **Where the old rule is written down:** SET-5's last-but-one bullet and match-setup.md's Status; `docs/MATCH_CONFIG.md` (the line on Garmin's phone settings); the phone settings' titles in `watch-garmin/resources/settings/settings.xml` ("blank = first 3 letters of the name, or HOM"); the settings table in `watch-garmin/README.md`; the SET-5 row in CONTRIBUTING.md's keep-in-step table; the `about` in `schema/short-names.json`.

### Requests and their answers

- **The server's own answers:** every answer has a `LawFive-Version` header (`server/src/app.ts`, APP-23), and every error from the API is JSON with an `error` sentence (the account endpoints answer Better Auth's `{ "message", "code" }` instead): `{ "error": "no such match" }`, including an unknown `/v1/` path (`{ "error": "not found" }`, 404) and anything unexpected (500). `GET /v1/meta` answers `{ "product": "LawFive", … }` to anyone.
- **The phones' relays** (APP-7, IOS-9): `mobile/android/.../watch/WatchBridge.kt` (`HttpTransport.send`) and `mobile/ios/LawFive/Watch/WatchBridge.swift` treat an error without the header or a JSON body as no answer (`isLawFive` in each `Api`), so the item goes in the phone's outbox and the watch is told 202 (kept). A real refusal is passed to the watch as its status and its JSON body. Through the phone, the watch is safe.
- **Going direct:** `watch-garmin/source/Phone.mc`, `direct()`, calls `Communications.makeWebRequest` with a JSON response type; the callback gets `(code, data)`. `Sync.fromServer(data)` (`Sync.mc`) says an answer is LawFive's when `data` is a dictionary with an `error`. How each request treats an answer today:

  | Request | Requirement | Gives up on | Otherwise |
  |---|---|---|---|
  | `POST /v1/watch/records` (a match) | SYNC-4 | 400 with `fromServer` | anything else stops the sync; the match stays queued |
  | `POST /v1/watch/tracks` (a chunk) | TRK-7 | 400 with `fromServer` (skips the chunk); 404 with `fromServer` (drops the track) | stops the sync; the chunk stays |
  | `POST /v1/watch/fee` | SYNC-11 | **any 400 or 404** | stops the sync |
  | `POST /v1/watch/screen` | UI-24 | **any 400 or 404** | stops the sync |
  | `POST /v1/watch/pitch` | SYNC-12 | **any 400 or 404** | stops the sync |
  | `POST /v1/auth/sign-out` (queued) | SYNC-6 | 2xx, or any positive code with `fromServer` | stays queued |
  | Any of them | SYNC-6 | **any 401 unlinks the watch** (`fail()`) | |

  So the fee, screen and pitch drop on a proxy's 404 (R-19's case). Matches and tracks are protected only if Garmin Connect hands over an error's body; if it doesn't (below), they're never given up, and a match the server refuses blocks the queue and stops every sync before the download.

### What Connect IQ gives the callback for an error

- **Garmin's documentation** for `makeWebRequest` says the callback's `responseCode` is "the server response code or a BLE_\* error type", and its `data` is "the content if the request was successful, or `null`". It lists the negative codes: -400 for a body that doesn't fit the response type, -401 for headers it doesn't accept, -1002 for an unexpected content type, -300 for a timeout and so on.
- **The forums** agree that a 4xx or 5xx reaches the callback with its status and `null` data. Several developers report that an error whose body isn't JSON (a plain-text 403, an empty 401) comes back as -400 instead of its status, at least in the simulator; one reports a plain 404 arriving as 404 with `null`. Garmin staff have said the simulator is more lenient than the devices about content types. Nobody reports an error's JSON body arriving.
- **How sure:** fairly sure (the official text and every report point the same way) that a direct request's error body never reaches the watch, so `fromServer` is false for every direct error, but it isn't proven for both Garmin Connect apps (Android and iPhone) on a real watch. A proxy's 404 may arrive as 404 or as -400 depending on its body and the phone; the fix must be right either way. The plan's first step checks it.

## Proposed behavior

### Short names on the planned match

- The planned match's short names come from the shared rule: the typed short name from the phone settings (up to 4 characters; empty counts as none), else the suggestion from **both** names, else `HOM`/`AWY`. The New match row (`plannedTitle`) and the match itself use the same pair.
- **A Monkey C copy of the rule** in `Settings.mc` (`shortNames(homeAlias, homeName, awayAlias, awayName)`, returning the pair), a line-for-line port of `suggestAliases`:
  - **Words:** split at anything that isn't a letter or digit. Monkey C has no Unicode classes, so a character counts as a letter or digit when it's `0`–`9`, `A`–`Z`, `a`–`z`, or any character from U+00C0 up, except `×` and `÷` and the punctuation blocks (U+2000–U+206F, U+3000–U+303F). That matches `\p{L}\p{N}` for every name in the cases and for real team names; a name in a script it gets wrong still makes a short name, just not the server's.
  - **Capitals:** `String.toUpper()` if it handles accented letters on the watch (step 1 checks), else a small table for Latin-1 and Latin Extended-A letters (`ñ` → `Ñ`, `ü` → `Ü`).
  - Comments say it's a copy of `schema/src/shortNames.ts`, as the phones' copies do.
- **The phone settings' wording:** "Home short name, up to 4 letters (blank: made from both team names, or HOM)", the same for away.
- **The upload:** nothing changes on the server; a planned match's short names now match the suggestion, so only typed ones are stored.

### The shared cases on the watch

`pnpm generate` writes `schema/short-names.json` into `watch-garmin/source/ShortNameCases.mc` as a `(:debug)` function returning the cases, with `monkeyC()` from `matchCasesGenerate.ts`. A test in `MatchTests.mc` runs every case through `Settings.shortNames`. `tools/test-watches.sh` adds the file to the generated files it checks are current, and the `about` line names Garmin's copy.

### What counts as LawFive refusing a request

One rule for every request the watch sends, direct or through the phone. A refusal is a 400 or 404 (what each request does with one is unchanged: a match or a track chunk skipped, a track dropped, a fee, screen or pitch change dropped) that comes with a sign it's LawFive's:

1. **Its JSON error came with it** (`Sync.fromServer`): always the case through the phone app, and the case going direct if Garmin Connect ever passes the body on. Acted on at once.
2. **Otherwise, going direct, the watch checks before giving up.** It asks `GET /v1/meta`. If that answers 200 with `product` "LawFive", the server is up, so the watch sends the same request once more:
   - refused again (400 or 404), it's LawFive's refusal and is acted on;
   - accepted, it carries on as sent;
   - anything else, it stops the sync as offline.

   If `/v1/meta` isn't LawFive's (a proxy's 404 or 502, a timeout, a negative code), the sync stops with "Couldn't reach server" (`Sync.problemFor`), not "Server error 404", and everything waits.
3. **Anything else** (5xx, 409, negative codes, a 400 or 404 without the sign) stops the sync as today, keeping what was being sent.

This needs no change on the server, so it works with every server version (a server from before TRK-7 still has its tracks dropped, now by the check), behind any proxy (Traefik's 404 with no backend, Caddy's and nginx's 502, Cloudflare's 52x), and costs two extra requests only when a refusal happens, which is rare. The one way it could still go wrong is a proxy answering 404 for the request, then letting `/v1/meta` through, then answering 404 again within a second or two; no ordinary restart does that.

`fromServer` in the sign-out queue (SYNC-6) becomes the same check, with a 401 counting as a refusal there (the link is already gone), so a queued sign-out is crossed off only when LawFive answered. Today it looks for an `error` key, which Better Auth's errors don't have (`{ "message", "code" }`), so if sign-out answers a link already ended with an error, that sign-out stays queued even through the phone; step 3 checks what it answers.

### Options considered

- **Look for the server's JSON error body** (what `fromServer` does now): right through the phone, but going direct it almost certainly never sees one, so on its own it never gives anything up. Kept as the first sign.
- **Never drop on a 404 without a positive sign, and nothing more:** safe from proxies, but a fee change for a match deleted on the website would then stop every sync, before the matches come down, for good. Needs a way to learn the refusal is real, which is the check.
- **Check the server before giving up** (recommended): above.
- **A status proxies never produce,** such as answering the watch's refusals as 200 with `{ "refused": "…" }` (a 200's body certainly arrives) or a rare 4xx: certain once in place, but it needs a server change the watch asks for (Wear OS, Apple Watch and the phones expect today's statuses), and the watch still needs today's handling for servers from before it, which brings back the problem. Worth it only if step 1 shows the check is unreliable.

## Proposed requirements

Changes to agreed requirements, and one new one:

- **SET-5** The "One rule everywhere" bullet loses its last sentence ("Garmin's planned match from its own phone settings takes the name's first three characters instead") and names Garmin's planned match among the copies the shared cases check. match-setup.md's Status drops its Not built line. `docs/MATCH_CONFIG.md`'s line on Garmin's phone settings says the same.
- **SYNC-17** **What counts as LawFive refusing.** A watch gives up something it was sending (a match, a track or a piece of it, a fee, the match screen, pitch corners, a queued sign-out) only when LawFive refused it: an answer marked as the server's (its `LawFive-Version` header, or its JSON error). A Garmin watch going straight through Garmin Connect, which shows neither, checks that the server answers `GET /v1/meta` as LawFive and sends the request again; refused a second time, it's the server's. Anything else leaves it for the next sync.
- **SYNC-4** Its last bullet points at SYNC-17 instead of saying it itself; **SYNC-11**, **SYNC-12** and **UI-24** say a refused change is dropped per SYNC-17.
- **R-19** rewritten as what's left: the check run during a real restart, through both Garmin Connect apps.
- **R-6** gains: a sync straight through Garmin Connect during a server restart, and the planned match's short names with accented names, on a real watch.

## Open questions

1. **What an unexplained 401 does.** Any 401 unlinks the watch today (SYNC-6). A proxy doesn't normally answer 401 while a server restarts, but one with its own sign-in in front of LawFive (forward auth) would unlink every watch going direct.
   - (a) Leave it: unlink on any 401.
   - (b) The same check as SYNC-17 before unlinking: `/v1/meta` answers as LawFive, the request is sent again, and a second 401 unlinks.
   - **Recommendation: (b).** It's a few lines once the check exists, and unlinking is the costliest mistake the watch can make, as linking again needs the website.
2. **How far the Monkey C copy goes with letters.** `\p{L}` covers every script; the watch can't test for it.
   - (a) ASCII letters and digits only, the rest as separators (`Ñublense` gives `UBL`).
   - (b) ASCII plus everything from U+00C0 but `×`, `÷` and punctuation, as above.
   - (c) A table of Unicode letter ranges.
   - **Recommendation: (b).** It passes every shared case and covers the names referees type (Latin letters with accents); (c) costs memory on the smallest watches for names they'd rarely see. A case with a curly apostrophe or an en dash (`St. Mary’s`, `Rovers – Blue`) goes in `short-names.json` so all five copies agree on punctuation.
3. **Whether to check through the phone too.** Through the phone app, a 400 or 404 that reaches the watch is already the server's (the relay keeps anything else), so the check isn't needed.
   - (a) Check only when going direct.
   - (b) Check whenever there's no JSON error.
   - **Recommendation: (b).** It's the same rule wherever the answer came from, and it covers a relay that one day passes on an answer it shouldn't; through the phone the JSON error is there, so it costs nothing.

## The work, in order

1. **What Garmin Connect passes on** (half a day): a test server answering 404 with LawFive's JSON, 404 with Traefik's plain text, an empty 401 and a 502, called from the simulator and from a real watch through Garmin Connect on Android and on an iPhone; note each `(code, data)`. And `"ñü".toUpper()` on the watch. The results go in R-19 and decide the capitals table.
2. **Short names** (half a day to a day): `Settings.shortNames` and the letter test; `plannedTitle` and `matchSetup` through it; `ShortNameCases.mc` from `pnpm generate`; the test in `MatchTests.mc` in place of `testTeamAlias`; `test-watches.sh`; the settings' titles. Strict build, unit tests, all 46 release builds; the New match row in the simulator on `fr965` and `venu3`.
3. **Refusals** (a day): one function in `Sync.mc` that takes `(code, data)` and either acts, or runs the `/v1/meta` check and the second send; `onUploaded`, `onTrackSent`, `onFeeSent`, `onScreenSent`, `onPitchSent` and the sign-out queue through it (and `fail()`'s 401, if question 1 says so); tests in `MatchTests.mc` for each outcome (JSON error, meta not LawFive, refused twice, accepted on the second send); a sync against the demo server with the server stopped behind a proxy.
4. **Requirements and docs** (an hour): SET-5 and the Status, SYNC-17 and the lines that point at it, R-19, R-6, `MATCH_CONFIG.md`, the Garmin README's settings table, CONTRIBUTING.md's SET-5 row, `short-names.json`'s `about`.

About 2 to 3 days, most of it in step 1's checks and step 3's tests.

## Checks

- On a real watch going direct (the phone app closed): a sync while the server restarts behind Traefik, with a fee change, a match screen change and pitch corners waiting; all three are still there afterward and go at the next sync.
- A fee change for a match deleted on the website: dropped after the check, and the sync goes on to download the matches.
- A planned match of Strikers U12 v Strikers U14 set in Garmin Connect: `U12` v `U14` on the watch, the same on the website after the upload, and both following a rename there.
