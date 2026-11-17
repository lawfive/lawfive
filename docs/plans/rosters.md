# Plan: rosters and substitutions

**Status:** Proposed, not built. The model: each team on a match has a **roster** (shirt numbers, and for adult matches only, names; captain, goalkeeper, starters and team officials), kept in the match record and, later, saved per team for reuse; the watches get the numbers (and adult matches' short names) and record **substitutions** as a new event, with limits from the format; a photo of a team sheet can fill an adult match's roster through a vision model on the server, always checked by the referee and never kept. Youth matches keep **numbers only**, enforced by the server, because nothing in LawFive may identify anyone under 16. Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) (a new `rosters.md`, and match-events.md for substitutions) when it's built.

## In short

Before a match the referee fills in each team's **roster**: numbers, who starts, the captain and goalkeeper, the team officials, and on **adult matches only**, the players' names. It's typed, pasted from a spreadsheet, sent by a league's system through the API, or, on adult matches, **read from a photo** of the team sheet or the player cards and then checked line by line. The watch gets the roster, so it knows who's on the field, shows "#9 Silva" as a number is entered on an adult match, and records **substitutions** (off, on) with the competition's limits: how many, in how many stoppages, and whether players may come back on, as youth leagues allow. Substitutions show in the event list, the match report and Edit result, and the shared match cases hold every watch to the same rules.

For **youth matches** (any match not known to be adult) a roster is numbers only: there's no name field, the server refuses a name, imports drop names before anything is kept, and team sheets can't be photographed for reading.

Not in this plan: player stats across matches, player registration or eligibility checks, concussion substitutes (later), the referee's report on each player beyond the match report, and rosters on the share link.

## What's already there

- **Events record numbers, never names.** In `schema/src/matchRecord.ts`, a goal, injury and penalty kick have `player` (1–99, optional); cards and sin bins have `offender`, a player with an optional `number` or a team official with a `role` (head coach, assistant coach, other) and an optional `name` (EVT-15). Second yellows are found by team and number (EVT-5).
- **The watches' events** are tuples `[code, team, period, seconds, player, extra]` (`G`, `Y`, `Y2`, `R`, `SB`, `SB2`, `TY`, `TR`, `I`, …), turned into events by `fromWatchUpload` in `server/src/watch.ts`; an unknown code is skipped, so an older server drops a new event and keeps the match. The engines are `watch-garmin/source/Match.mc`, `mobile/android/wear/…/MatchEngine.kt`, `mobile/ios/LawFiveWatch/MatchEngine.swift` and Try a match's `web/src/match/engine.ts`, held together by `schema/match-cases/` and `pnpm test:watches` (WCH-2).
- **Number entry** (EVT-3, UI-8): two digits, tens then ones, never required. The team menu is Goal, Sin bin (when on), Yellow card, Red card, Team official, Injury (UI-6, EVT-12, EVT-15, EVT-16).
- **A team on a match** is `Team` in `schema/src/records.ts`: name, short name (`alias`, SET-5) and color; its description says "Saved teams come later, tied to a competition." A match has `ageGroup` (free text: U12, Adult, O35) and `gender`; a competition has `ageGroup` too. `starterFormatFor` in `schema/src/format.ts` already reads age groups (U6 to U19, HS, Varsity, JV, College, NCAA) to suggest a format (SET-17).
- **The match report** (DATA-6, `web/src/report.ts`, the phones' `reportText`) gives players as `#9` ("Player" without a number) and officials by role and name. The share link never shows player or team officials' names (DATA-7, SEC-10).
- **The rule on minors** (SITE-5): the terms' Acceptable use (`site/public/terms.html#minors`) and the privacy policy's Young referees say no personal information may identify anyone under 16 (names, photos, contact details); team names, age groups and shirt numbers are fine, "so record young players by number". API keys' New key and Settings' integrations repeat it (KEY-1; `web/src/pages/ApiKeys.tsx`, `web/src/pages/Settings.tsx`).
- **Scanning on the phones:** the iPhone scans QR codes with VisionKit's `DataScannerViewController` (`SignIn.swift`), which can also read text; Android uses Google's code scanner from Play services (`play-services-code-scanner`, an ML Kit API) for QR codes, but not ML Kit's text recognition.
- **Imports** (IMP) read CSV, XLSX and JSON on the server (`server/src/importFile.ts`), with a check of every row before saving. **API keys** have per-area access (KEY-2: matches, match reports, venues, referees, competitions, templates, settings); **webhooks** have the same topics (HOOK-1).
- **No AI service** is used anywhere today. Outside services the server calls (weather, address search) are named on the privacy page and in Data and licenses, and switch off without their settings.

## Proposed behavior

### Youth and adult matches

Everything about names turns on one question: **is this match known to be adult?**

- The match's age group decides, else its competition's. **Adult** when it's one of: Adult, Open, Senior, Amateur, Men, Men's, Women, Women's, Reserves, an over-age (O30, O35, O40…), College, NCAA, University. Case and spacing don't matter.
- **Everything else is youth**, including every U-age (U19 and U23 too), HS, Varsity, JV, anything unrecognized, and no age group at all. So a match is youth until someone says otherwise.
- One rule everywhere: `isAdultAgeGroup` in `schema/src/` with shared cases (as short names have `schema/short-names.json`), ported to both phones.
- **Names need the referee's word too:** the first name added to a team's roster asks once, "Everyone named here is 16 or older", with the terms linked. A player in an adult match who is under 16 is added by number only.

### The roster

On each team of a match (website and both phones, offline like any edit, in the match record):

- **Players**, up to 30 a team: number (1–99), and on adult matches a **name** and a **short name for the watch** (up to 10 characters, made from the surname until typed); **starter** or substitute; **captain** (one) and **goalkeeper** (one or more). A player needs a number, or on an adult match a name.
- **Team officials**, up to 8: role (head coach, assistant coach, other, as EVT-15's) and name. Officials are adults, so their names are allowed on every match, as on a card already (see the open questions).
- **Where it shows:** a **Teams** card on the match page, the two rosters side by side (stacked on a phone), starters first by number, then substitutes, with C and GK marks. On a youth match the card says "Numbers only, as this is a youth match", linking to the rule.
- **Changing the age group** of a match whose roster has names to a youth one asks to remove the names first; the server refuses a youth match with names.
- **Merging matches** keeps the kept match's roster, filling an empty team from the other.

### Saved teams (second step)

A **Teams** list (beside Venues and Referees): a team's name, short name, color, competition and age group, with its usual roster. Picking a team name on the match form that matches a saved team offers its roster; **Save as a team** on a match's roster makes one. A saved team follows the same youth rule by its own age group, else its competition's. It's a new collection (`teams`), so a new area for API keys and webhooks.

### On the watch

- **The download** carries each roster as numbers, starters and, on adult matches, the short names, nothing else (no captain or officials' names).
- **Number entry** on an adult match shows the name under the number as it's dialed ("9 · SILVA"), and a number not on the roster says "Not on the roster" without stopping it. The second-yellow red screen names the player (EVT-6). The event list reads "Yellow HOM #9 Silva".
- **Who's on the field:** the starters, changed by each substitution. Without a roster, the watch doesn't know, and asks only for numbers.

### Substitutions

A format setting, **Substitutions**, off by default (Create match, the phones' and website's formats and templates, Garmin's phone settings, Same as last), with:

- **Limit:** none, or 1 to 15 a team (Law 3 gives five in top competitions, three in many); **One more in extra time**, on or off.
- **Stoppages:** none, or 1 to 6 a team. Half-time and the breaks before and during extra time don't count, as Law 3 says.
- **Players may come back** (return substitutions, as youth and some amateur leagues play): off by default; when on, no limit or stoppages apply.

With it on, the team menu has **Substitution** after Red card. It asks for the **player off**, then the **player on** (two-digit entry, UI-8, titled "Sub HOM", unit "Player off" and "Player on"; either can be left out), then **Another** or **Done**: the substitutions entered together are one stoppage. They can be made during play and at breaks, not before kickoff (that's a change to the team sheet), in the shoot-out or after full time. They don't change any clock.

- **Limits warn, never block.** Past the limit or the stoppages, "HOM has made 5 of 5" asks Record anyway or Back, as a referee may need to record what happened. The team menu's row shows the count ("Substitution 3/5").
- **With a roster,** it says when the player off isn't on the field, was sent off (who can't be replaced, Law 3), or the player on has already come off with returns off. Each says, then lets it be recorded.
- **Undo** takes back the last substitution (INP-6), returning both players.
- **Recorded** on the watch as `SUB`, with the player off in `player` and the player on in `extra`; uploaded as the event `substitution` (team, `off`, `on`, timing), so an older server drops it and keeps the match.
- **The event list** reads "Sub HOM #9 → #14" ("Sub HOM #9 Silva → #14 Ortiz" on an adult match with names). Garmin's History shows the same.

**Shown afterward:** the match log on the website and phones, the match report's **Substitutions** section (minute, team, off, on; each team's starters and substitutes listed above it, names on adult matches), Copy as text, and **Edit result**, which adds, changes and removes substitutions (RES). Stats don't count them at first.

### Reading a team sheet (adult matches)

On an adult match's Teams card, **Read a team sheet**: one to four photos of the sheet or the player cards (the camera or the phone's photos; a file on the website), for one team or both.

- **The server sends the photos to a vision model** (Claude, through the Anthropic API: an image in, the roster out as JSON checked against the roster's schema with structured outputs), with the two team names, and no tools. What the photo says is data, never instructions; nothing it returns is saved by itself.
- **The referee checks every line** on a review screen before anything is added: each player's number, name, starter, captain and goalkeeper editable, lines the model was unsure of marked amber, numbers outside 1–99 left out, and **Add to roster** (or Replace) at the end. Nothing is ever added without it.
- **The photos aren't kept:** they're read in memory and dropped, never put in the file store or the logs. **Keep the photo on the match**, off by default, adds it to the match's photos instead (FILE-1).
- **On a youth match** there's no Read a team sheet at all, on any app or in the API: a youth team sheet shows children's names, and often their photos and birth dates on player cards, and sending those to an outside service would put them in LawFive's hands. Youth rosters are typed (the number pad is fast) or imported, where the names are dropped (below).
- **The first use** on each device says what happens ("The photo goes to Anthropic to be read, and isn't kept") and asks to go on, as Apple's review rules ask before personal data goes to an outside AI service.
- **Cost:** a 2000-pixel photo is about 1,500 tokens to the model, the request about 3,000 in all, and the answer 1,000 to 3,000 (with the model's thinking at low effort). On Claude Opus 5.5 ($4 and $20 a million tokens in and out) that's about 2 to 7 cents a sheet; Claude Sonnet 5.5 ($2 and $10) about half; Claude Haiku 5.5 ($0.10 and $0.50) under a cent. To measure on real sheets before choosing (see the open questions).
- **Limits:** a plan's **team sheet readings a day** (PLAN-2), from midnight UTC like the others, and a server-wide `TEAM_SHEET_DAILY_LIMIT` (like `WEATHER_DAILY_LIMIT`), so a busy day can't run up the bill.
- **Hosted service:** LawFive's key. **Self-hosted:** `ANTHROPIC_API_KEY` in the server's settings (or set by an admin, ADM-1, kept encrypted); `TEAM_SHEET_MODEL` to choose the model. Without a key, `GET /v1/meta` leaves out `team-sheets` and no app shows the button.

### Imports, the API and integrations

- **A roster file** (CSV, XLSX or JSON, read by the server as imports are): columns Team (home or away, or the team's name), Number, Name, Short name, Starter, Captain, Goalkeeper, and Role for an official. On the Teams card (**Import a roster**) and as `POST /v1/matches/{id}/roster/import` with `dryRun`, checked row by row as IMP-5 does. On a youth match, the check says names will be left out, and only numbers are kept; the file isn't kept.
- **Through the API:** a roster is part of the match, so `PUT /v1/matches/{id}` with a key that can write matches sets it, and reading a match gives it; saved teams get their own area (`teams:read`, `teams:write`). The server refuses a name on a youth match with a 400 naming the rule ("Names aren't kept for youth matches: send shirt numbers only. A match is youth unless its age group is an adult one.").
- **Webhooks:** the matches topic carries the roster with the match; saved teams get a **teams** topic.
- **League and tournament systems** that hold team sheets can send them before kickoff with a key (a match found by its match number, IMP-3), and NOTE-1's notice can say "Team sheets added". Assignor systems (and their calendar feeds) don't carry rosters, so nothing comes from them.

### Privacy and the stores

Rosters bring other people's names into LawFive on purpose, and a new outside service:

- **`privacy.html`:** What we keep gains "Rosters: shirt numbers, starters, captains and goalkeepers, and for adult matches, players' and team officials' names". Who else sees it gains Anthropic, only when Read a team sheet is used: the photos are sent to read them, and LawFive doesn't keep them. Young referees says youth matches keep numbers only and their team sheets can't be read. A new effective date, and account email before it (SITE-5).
- **`terms.html`:** Acceptable use adds "Add players' names only to adult matches, and only when everyone named is 16 or older."
- **The stores:** Apple's App Privacy already declares names, photos and other user content (`PrivacyInfo.xcprivacy` in `mobile/ios/LawFive/Resources/`); check that the answers still hold with names of other people and an AI processor, and Google Play's Data safety (names and photos, sent to a service provider on LawFive's behalf).
- **The apps' reminder lines** (KEY-1, Settings' integrations) say names are only for adult matches. The permissions page (SITE-14) changes only if on-device reading adds a library.
- **Data and licenses:** Anthropic credited where team sheet reading is on.

## Proposed requirements

Drafts. Rosters, as **ROS-n** (a new area, `rosters.md`):

- **ROS-1** **Youth unless known to be adult:** a match is adult when its age group, else its competition's, is Adult, Open, Senior, Amateur, Men('s), Women('s), Reserves, an over-age, College, NCAA or University; anything else, or none, is youth. One rule (`isAdultAgeGroup`) everywhere, with shared cases.
- **ROS-2** **A roster on each team of a match:** up to 30 players (number, starter or substitute, captain, goalkeeper) and 8 team officials (role, name), edited on the website and both phones, offline, in the match record.
- **ROS-3** **Names only on adult matches:** players' names and short names only when ROS-1 says adult, after the referee confirms once per team that everyone named is 16 or older; the server refuses names on a youth match from any app, import or key, and a match with names can't become youth until they're removed.
- **ROS-4** **The Teams card** on the match page: both rosters, starters first, C and GK marks; on a youth match, "Numbers only, as this is a youth match".
- **ROS-5** **On the watch:** the download carries numbers, starters and adult matches' short names; number entry shows the name, "Not on the roster" when it isn't, and the red screen and event list name the player.
- **ROS-6** **Read a team sheet** on adult matches only: one to four photos read by a vision model on the server, every line checked by the referee before it's added, the photos not kept unless Keep the photo on the match is chosen, the first use on each device asking first. Never on youth matches.
- **ROS-7** **Team sheet readings** limited by plan a day and by `TEAM_SHEET_DAILY_LIMIT`; on with `ANTHROPIC_API_KEY` (self-hosted: their own key, or off), the `team-sheets` capability saying so.
- **ROS-8** **Import a roster** from CSV, XLSX or JSON, checked row by row; on a youth match only the numbers are kept.
- **ROS-9** **Rosters through the API and webhooks:** with the match (matches access and topic); saved teams in their own area and topic.
- **ROS-10 (Later)** **Saved teams** with their usual roster, offered on the match form and made from a match's roster.
- **ROS-11** **Privacy:** the privacy policy, terms, the stores' answers and the apps' reminder lines say names are for adult matches only and that team sheets go to Anthropic to be read and aren't kept.

Substitutions, in **EVT** (EVT-13 replaced, as its Later label goes):

- **EVT-13** **Substitutions**, a format setting, off by default: Substitution after Red card in the team menu, the player off then the player on (either can be left out), Another or Done, during play and at breaks; Undo takes one back; listed as "Sub HOM #9 → #14"; uploaded as `substitution`.
- **EVT-17** **Limits:** a number a team (none, 1–15), one more in extra time, and stoppages a team (none, 1–6) that half-time and extra time's breaks don't count; substitutions entered together are one stoppage. Past a limit the watch says so and asks, never refuses; the team menu shows the count.
- **EVT-18** **Players may come back** (return substitutions): no limits apply, and a player who came off can go on again.
- **EVT-19** **With a roster,** the watch knows who's on the field, and says when the player off isn't on it or was sent off, or the player on has already come off with returns off, then lets it be recorded.
- **EVT-20 (Later)** Concussion substitutes, as additional permanent substitutions that don't count toward the limit.

And changes to agreed ones: DATA-6 (the report's Substitutions and team sheets), RES (Edit result's substitutions), INP-6 (Undo), UI-6 (the team menu), SET-9, SET-11 and MATCH_CONFIG.md (the format's fields and keys), DEMO-1 (Try a match), PLAN-2 (team sheet readings a day), KEY-2 and HOOK-1 (a teams area, with ROS-10), SITE-5 (the rule on minors in full), and `Team`'s description in `schema/src/records.ts`.

## Open questions

1. **How rosters work with minors (the main one).**
   - (a) **Numbers only, everywhere:** no player names in LawFive at all.
   - (b) **Names only on matches known to be adult** (ROS-1), youth by default, enforced by the server, with the referee confirming everyone named is 16 or older; youth team sheets never read.
   - (c) Names everywhere with a warning on youth matches.

   **Recommend (b).** (c) breaks the terms and the privacy policy as they stand. (a) is the safest and costs adult referees the main reason to keep rosters (a match report naming the cautioned player). (b) keeps names where the policy allows them, makes the safe answer the default (an empty or unknown age group is youth), and puts the check on the server, so no app, import or key gets round it.

2. **Which age groups count as adult?** (a) ROS-1's list, College and NCAA included; (b) the same without College and NCAA; (c) also U20, U21 and U23. **Recommend (a):** college players are all but never under 16, and college referees are the ones with formal team sheets; (c) is out, as a U-age names the top of the range, not the bottom.

3. **Team officials' names on youth matches.** (a) Allowed, as officials are adults and EVT-15 already takes a name on a card; (b) roles only, like players' numbers. **Recommend (a),** under the same confirmation that everyone named is 16 or older; a youth team's under-16 helper is added by role only.

4. **Reading youth team sheets at all.** (a) Never; (b) later, on the phone only (Apple's Vision and ML Kit's text recognition), keeping just the numbers, the photo never leaving the phone; (c) on the server, keeping only numbers. **Recommend (a) now, (b) worth trying later:** (c) still hands children's names and faces to an outside service, which (b) avoids, but (b) reads layouts poorly and adds ML Kit's text recognition to Android.

5. **Where reading runs for adult matches.** (a) On the server with Claude (one place to improve, on the website too, at a cost per sheet); (b) on the phones (free and private, but only lines of text with positions to turn into numbers and names by guesswork, weak on handwriting, and nothing on the website); (c) both, the phone first. **Recommend (a).**

6. **Which model, and how many readings a plan gets.** (a) Claude Opus 5.5 by default, `TEAM_SHEET_MODEL` to change it, the Standard plan at 10 a day; (b) a cheaper default (Sonnet or Haiku) once tried on real sheets; (c) off on the hosted service until a paid plan (A-4). **Recommend (a), measuring (b) in the checks:** start with the most accurate, and move down only where real sheets read as well.

7. **Keeping the photo.** (a) Never kept unless Keep the photo on the match is chosen, off by default; (b) kept for a week to read again. **Recommend (a).**

8. **Saved teams in the first version?** (a) Later, after rosters on matches have been used; (b) now. **Recommend (a):** a roster on the match covers the match report and the watch, and saved teams bring a new collection, area and topic.

9. **The Substitution row.** (a) After Red card, only with the format setting on; (b) always there; (c) first, after Goal. **Recommend (a):** a youth referee who never records subs keeps a five-row menu, and cards stay where the hand expects them.

10. **Limits: warn or refuse?** (a) Warn and ask, never refuse; (b) refuse past the limit. **Recommend (a):** the watch records what happened; refusing could leave a real substitution out of the record.

11. **What counts as one stoppage for substitutions.** (a) Those entered together (Another, then Done); (b) those within the same tracked stoppage, else within a minute of match time; (c) not counted, the limit only. **Recommend (a):** it's what the referee did, needs no guessing, and works with stoppage off.

12. **Should a substitution start a stoppage?** (a) No, the referee does, as now; (b) yes, with stoppage tracked, as IFAB counts substitutions in added time. **Recommend (a)** at first: the stoppage is usually already running when subs come on.

## The work, in order

1. **The rule and the record:** `isAdultAgeGroup` with its cases (and both phones' ports); the roster on `Team` in `schema/src/records.ts`; the `substitution` event in `matchRecord.ts`; the format's substitution fields in `format.ts` and MATCH_CONFIG.md; the server's refusal of youth names on every path (records, import, keys) with tests; `pnpm generate`. About 1 day.
2. **The shared cases and the four engines:** `schema/match-cases/substitutions.json` (a sub in play and at half-time, the count and its warning, stoppages with half-time not counting, extra time's extra one, returns, a sent-off player, Undo, entering several together); then Garmin (`Match.mc`, the team menu and number entry in `Menus.mc`, History), Wear OS (`MatchEngine.kt`, `MatchScreens.kt`), Apple Watch (`MatchEngine.swift`, `Views.swift`) and Try a match (`engine.ts`, its controller and screens); Create match's rows and Garmin's phone settings; `fromWatchUpload` for `SUB`; `pnpm test:watches`. About 3 to 4 days.
3. **The roster on the watch:** the download's numbers, starters and short names (`server/src/watch.ts`), number entry's name and Not on the roster, who's on the field; a size check on the smallest Garmin. About 1 day.
4. **Website and phones:** the Teams card and its editor, the youth line, the confirmation, the age group change; the match log, Edit result's substitutions (and the shared result cases), the report's sections in `web/src/report.ts` and both phones' `reportText`; formats and templates; snapshots and screenshots. About 2 days.
5. **Imports, API and webhooks:** the roster import with its check, the endpoint descriptions in `schema/src/endpoints.ts`, NOTE-1's notice for team sheets added. About 1 day.
6. **Reading a team sheet:** the server endpoint (`POST /v1/matches/{id}/roster/read`, images in, a proposed roster out, nothing stored), the Anthropic SDK with structured output from the roster's schema, the limits and capability, the review screen on the website and both phones, the first-use notice. About 2 days.
7. **Policy and docs:** `privacy.html`, `terms.html` (new effective dates), the stores' answers, the reminder lines in `ApiKeys.tsx` and `Settings.tsx`, Data and licenses on all three, lawfive.app's pages on the watch and the match report, lawfive.dev (the API guide for rosters, the self-hosting page's `ANTHROPIC_API_KEY`), and CONTRIBUTING.md's table (rows for the youth rule and its ports, the roster's words in the report, and substitutions with the engines). Half a day, plus the maintainer reading the policy changes.
8. **Saved teams** (ROS-10), when wanted: the `teams` collection, its list, the match form's offer, Save as a team, the area and topic. About 1½ days.

About 2 weeks across the parts before saved teams, most of it in the four engines and the policy.

## Checks

- The youth rule against every age group in the demo data and a season's real schedules: nothing youth reads as adult.
- A name sent for a youth match by the website, each phone offline then syncing, an import, and an API key: refused or dropped every time, and nothing stored.
- A real adult match with substitutions on each watch (R-6, R-13): the longer team menu on the narrowest round screen, the off and on entry, the warnings, and the report afterward.
- Team sheets from several leagues, typed and handwritten, read by each model: the share of lines right, and the cost per sheet, before choosing the default.
- A photo with written instructions in it ("ignore the above…"): read as text, nothing else.
- The hosted service's team sheet readings in their first weeks, against the daily limit.
