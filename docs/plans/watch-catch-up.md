# Plan: Wear OS and Apple Watch catch up with Garmin

**Status:** Being built. Done: steps 1 (Extra time and Penalties in the game menu) 2 (uploads LawFive refuses; sending one again from History comes with step 5) and 3 (Wear OS's alert intervals, in the shared cases). The model: the Garmin app is the reference, and every place the Wear OS app ([mobile/android/wear/](../../mobile/android/wear/)) or the Apple Watch app ([mobile/ios/LawFiveWatch/](../../mobile/ios/LawFiveWatch/)) falls short of an agreed watch requirement is brought up to it, on both where both lack it. Almost nothing here is new behavior, so [Proposed requirements](#proposed-requirements) mostly lists the existing IDs these watches will then meet, with one new one.

## In short

A referee who moves from a Garmin to a Wear OS watch or an Apple Watch should find the same app. Today they don't quite: Wear OS's **History** is a list with nothing behind it, neither watch lets the referee **send a match now** from History, Wear OS's **alerts repeat** every 10 seconds whatever is wanted, neither has **Sync on opening** (both sync every time the app comes to the front, even mid-match), and neither offers **Extra time** and **Penalties** in the game menu after regular time. Smaller things add up too: number entry and confirmations that work differently from UI-7, UI-8 and EVT-9, Create match's minutes in steps of five, a downloaded match's screen without its crew, a typed server address that isn't checked, and an upload LawFive refuses that blocks every sync after it.

This plan closes each gap on both watches, in the order that gets the most to referees soonest, and keeps the shared match cases passing throughout, with two new settings added to them.

Not in this plan:

- **Tips on the watch (TIP-4):** Later on every watch, the Garmin included, so it isn't catching up. When it's taken up it should be built on all three at once.
- **The bridge through the phone (WCH-8):** Later.
- **What each requirement makes particular to a platform**, listed under [What's already there](#whats-already-there).

## What's already there

- **One match, three copies.** Each watch has its own engine (`MatchEngine.kt`, `MatchEngine.swift`, Garmin's `Match.mc`), run against the shared cases in [schema/match-cases/](../../schema/match-cases/) by `pnpm test:watches` ([tools/test-watches.sh](../../tools/test-watches.sh)), with Try a match's engine (`web/src/match/engine.ts`) run against them in `web/test/matchCases.test.ts`. Every engine already has `chooseExtraTime`, `choosePenalties` and the repeat and reminder intervals (`repeatSec`, `reminderSec`, fixed at 10 s until a setting gives them), so no gap below needs a new match rule.
- **The Apple Watch is further along than its Status says.** Its History already has Summary, Events, the fee's Paid toggle and Remove from watch (`PlayedPage`, `SummaryPage` and `PlayedEventsPage` in `Views.swift`; `FinishedMatch` keeps the setup, events, clock style, distance and fee). Its Alerts already have Remind every and Repeat alerts every (`Saved.stoppageReminderSec`, `Saved.alertRepeatSec`, passed to the match at kickoff). Its game menu during play already has Kickoff direction after Change kickoff, as INP-3 orders it. What it lacks in History is the status row that sends a match now.
- **The rest of the game menu matches INP-3 on both**: during play, while suspended, at breaks and kickoff screens (Kickoff direction then Coin toss, PRE-8, PRE-9), and the decide screen itself lists Extra time, Penalties and End match with the likely one highlighted (ET-1).
- **Settings match UI-17 on both** for Controls, Record track, Match screen, Timer names, Quick match and About; Account has Link account and Server first while unlinked (WCH-11).
- **A proxy's error is never a refusal** on either (`Server.kt`, `Server.swift`, APP-23), so only LawFive's own answer can drop anything.
- **Deliberately different, so left alone:**
  - Wear OS has no Touch lock (INP-12) and always swipes sideways (INP-10); its side button doesn't resume a suspended match (INP-3).
  - Apple Watch shows the system's clock rather than the app's time of day (UI-25), uses Water Lock for Touch lock (INP-12), and has no Back button, so its swipe to the game menu doesn't silence an alert (VIB-6).
  - Headings from magnetic north (WCH-10), recording through Health Services and HealthKit (WCH-7), and the Apple Watch going back to the start after Reset, as it can't close an app (WCH-11).
  - Garmin-only: the planned match from Garmin Connect's phone settings (SET-11), the kickoff's day and time under Start match (UI-19), the narrow rows' "End 1st half" (INP-3), linking by the Android app (SYNC-13; the Apple Watch's own is WCH-12), the watch's part number (SYNC-10) and the button mappings (INP-7, INP-11).
  - History keeps 10 matches on Garmin and 30 on the others. No requirement sets the number, and memory isn't the limit there, so it stays.

## Proposed behavior

Each gap says what each watch does today and what it will do. Everything follows DESIGN.md's [Wear OS and Apple Watch](../../DESIGN.md#wear-os-and-apple-watch): rows are pills on `#1D2321`, a Phosphor icon on the green circle only where a row leads somewhere and an icon is already assigned, Barlow for text and Barlow Condensed for figures. Nothing below needs a new icon.

### History (UI-17, UI-20)

- **Wear OS today:** History lists each match with "Sent", "Waiting to send" or "Not sent"; opening one shows that line and Mark pitch. `Finished` (`Store.kt`) keeps only the score, teams and match id.
- **Apple Watch today:** everything UI-17 asks for but the status row: it's a line of text, without when it was sent, the track's progress, or a way to send it.
- **Both will have**, as the Garmin's `HistoryMatchMenu`:
  - **The status row first:** "Sent to LawFive" with the day and time it went and the track ("Sat 9:41 · track sent", "track 3 of 18 sent" while it goes); "Waiting to send" with **Press to send now** (or "Link to send" unlinked); "Not on LawFive" with **Press to send**, for one no longer waiting; "On this watch only" with "Link to send it". A press starts a sync, and the row follows its steps.
  - **Summary** (score, each period with its added time, cards, sin bins, distance) and **Events** (the full-time screen's list), from the record kept with the match. A match kept before this has neither row, as on the Apple Watch now.
  - **Fee** as a Paid toggle (UI-20), the fee as it was at kickoff, changed with the downloaded match's (SYNC-11).
  - **Mark pitch**, then **Remove from watch**, confirmed, warning when it hasn't reached LawFive ("Not sent to LawFive", "Remove it anyway? It will be lost"), taking its upload and track with it.
- The list's line says the day too, as Garmin's: "Sat 24 Oct · Sent".
- Wear OS's `Finished` gains the setup, events, clock style, distance and fee, as the Apple Watch's `FinishedMatch` has them; cards after full time (EVT-7) update its events, and marking a fee paid updates History's copy too.
- On both, History keeps the match as it's uploaded, as Garmin's `History` does, so one no longer waiting (refused by LawFive, say) can be queued again from its status row.

### How often alerts repeat (VIB-1, VIB-2, VIB-4, VIB-7, VIB-8)

- **Wear OS today:** Alerts has the five switches only; repeats and the stoppage reminder are every 10 s.
- **Apple Watch today:** as Garmin.
- **Wear OS will have** Garmin's two rows after the switches: **Remind every** (Off, 10, 20, 30, 60 s; "Off" or "20 s" under it) and **Repeat alerts every** (5, 10, 15, 20, 30 s), each a choice list. The match takes both at kickoff, as it takes the switches, and Reset keeps them with the other settings (`AppState.reset` lists what it keeps, so they're added there; the Apple Watch's already are).

### Syncing on opening (UI-16, SYNC-3, SYNC-5)

- **Today, both** sync every time the app comes to the front (`MainActivity.onResume`, the Apple Watch's `scenePhase` going active), with a match in progress too, and there's no setting. On Wear OS that can be every wrist raise during play.
- **Both will:**
  - Have **Sync on opening** in Settings → Account, on by default, "When the app opens" or "Only with Sync now", as Garmin's.
  - Never sync on opening while a match is in progress, as SYNC-3 says; full time still sends the match at once (UI-16).
  - Count coming to the front as opening only after the app has been away a while,: 5 minutes or more (WCH-13), as these watches close apps on their own, so a sync only when the app starts would rarely happen, and one on every return would be one on every glance between matches.
  - Still sync straight away after a change made on the watch (a fee marked, a pitch, the match screen), as they do now, and with Sync now.

### Account (SYNC-5, UI-17)

- **Today, both,** linked: Sync now (with the last sync under it) and Unlink (with the server under it).
- **Both will have** SYNC-5's rows: **Last sync** (or the last problem), **Waiting to upload** ("2 matches, 1 track", only when something waits), **Server**, **Sync on opening**, then **Unlink**. Sync now stays in Matches, where UI-16 has it, and leaves Account, as on Garmin.

### After regular time (ET-1)

- **Today, both:** the decide screen's rows are right, but its game menu has only the cards, Undo, End match and Abandon. Try a match's game menu (`web/src/match/controller.ts`) is the same.
- **All three will have** **Extra time** (with "2x15'" under it) and **Penalties** at the top of the decide screen's game menu, where they're available, as Garmin's `gameMenu` has them, calling the engines' existing `chooseExtraTime` and `choosePenalties`.

### The start menu, Matches and the sync's steps (UI-15, UI-16, UI-26)

- **Today, both:** Matches' sub-label is the next match's title (or "None coming up"), History's is "3 kept", and Sync now says only "Syncing…". The sync screen counts matches, not tracks.
- **Both will have** UI-15's sub-labels: Matches "3 coming up", "None yet", the last sync's problem, or "Link to sync"; History "Last: STR 3-2 ROV" or "None yet". Sync now shows each step, "Sending match 1 of 2…", "Sending track 3 of 18…", "Getting matches…"; the sync screen's ring and line take in the tracks ("Sending track", "3 of 18"), as UI-26 has them.

### A downloaded match's screen (UI-19, SYNC-11, TRK-13)

- **Today, both:** Start match, Mark pitch, the fee, then the venue, name, role, forecast and notes as plain gray lines without labels. The crew the server sends isn't read.
- **Both will have** UI-19's order and rows: **Start match**, **Fee**, then one labeled row each for **Match**, **Your role**, **Venue**, each official of the crew ("AR1", "Sam Ortiz"), **Forecast** and **Notes** (in full, wrapping), then **Mark pitch**, whose line says "3 corners marked, to send" once walked, as Garmin's.

### Number entry and Create match (UI-8, EVT-3, EVT-9, SET-6, SET-9)

- **Today, both:** the player number has a gray **None** and a green **OK** side by side, and OK records at one tap. Create match's period length, break and extra-time period are lists in steps of five minutes (so 4 × 12 or 2 × 32 can't be set), and team size runs 4 to 11.
- **Both will have:**
  - UI-8's one pill: green **OK**, or gray **No number** at `00`; a swipe right still records the event with no number (EVT-3, WCH-9).
  - EVT-9's guard: the first tap turns the pill white with "Tap again", a second within 3 s records it, and anything else or 3 s disarms it.
  - Create match's minutes and team size on the two-digit entry, with UI-8's ranges (period 1–60, break 0–30 with **No break** at `00`, extra-time period 1–30, team size 1–11), as the sin bin length already is. The halfway break's length stays a list, as on Garmin.

### Confirmations (UI-7)

- **Today, both:** the green or red pill names the action ("Restart", "Undo", "Cancel match", "Remove"), and Undo's is red.
- **Both will have** UI-7's **Yes** over a gray **No**, red only where Garmin's is (Cancel match, Restart match, Abandon match, Unlink, Reset LawFive, Remove from watch), so Undo, End match, Change kickoff and Adjust are green, as on Garmin and Try a match; the question above the pills names the action.

### Uploads LawFive refuses (SYNC-4)

- **Today, both:** if LawFive itself refuses a finished match (400), the sync stops there with "The server said no (400)", the match stays first in the outbox, and every later sync stops at it, so nothing after it goes, and no matches come down.
- **Both will** give up that match, as Garmin's `onUploaded` does, and carry on with the rest. History keeps it, saying "Not on LawFive"; its status row's press tries it once more. A track chunk refused with 400 or a track refused with 404 is dropped only when it's LawFive's answer, as now.

### Typing a server address (SYNC-9, WCH-4)

- **Today, both:** the typed address is saved as typed, with `https://` added; nothing checks it.
- **Both will** ask the address for `/v1/meta` before keeping it, as Garmin's `ServerCheckView` does: "Checking…", then "Found LawFive" and back to Account, or "No LawFive server there" (or the connection's problem) with the address kept in the box to correct.

### The Apple Watch's titles after the team menu (UI-6, UI-10)

- **Today:** the team menu has the team's lone kit, but the screens after it (Goal type, Team official, the official's role, Reason) have the system's plain title ("Goal", "Official", "Red HOM", "Reason"), and the official menu has both.
- **It will** title each with the team's lone kit and the word beside it, as Wear OS's `WatchList(title, team, color)` does, and hide the system title on them.

## Proposed requirements

These watches will then meet, as written: **UI-7**, **UI-8**, **UI-15**, **UI-16**, **UI-17**, **UI-19**, **UI-20**, **UI-26**, **EVT-3**, **EVT-9**, **ET-1**, **VIB-1**, **VIB-2**, **VIB-4**, **VIB-5**, **VIB-7**, **VIB-8**, **SET-6**, **SET-9**, **SYNC-3**, **SYNC-4**, **SYNC-5**, **SYNC-9** (written for Garmin; WCH-4 points to it, and its words "(Garmin)" go) and **UI-6**/**UI-10** on Apple Watch.

New, in [wear-os-and-apple-watch.md](../requirements/wear-os-and-apple-watch.md):

- **WCH-13** **Opening, on watches that sync themselves.** For Sync on opening (UI-16), the app opens when it starts or comes back to the front after 5 minutes or more away; never with a match in progress (SYNC-3). A change made on the watch (a fee, a pitch, the match screen) syncs straight away, whatever the setting.

When it's built, the Status lines move with it:

- Wear OS and Apple Watch's "Behind Garmin" list goes, and the lines in the UI, EVT, ET, VIB and SYNC Status sections that say what differs on these two watches.
- match-screen.md's line on the Apple Watch's plain titles goes.
- TMR-15's line stays until Wear OS's stopped clock is seen on the emulator ([Checks](#checks)).

## The work, in order

1. **After regular time:** Extra time and Penalties in the decide screen's game menu on both watches and in Try a match's controller; a flow check on each. About 2 hours.
2. **Uploads LawFive refuses:** give up a refused match and carry on, on both, with History's "Not on LawFive". About 3 hours.
3. **Alerts on Wear OS:** the two settings in `Saved`, their rows, the match taking them at kickoff, Reset keeping them. In the shared cases, `repeatSec` and `reminderSec` join `CaseFormat` (`schema/src/matchCases.ts`) as watch settings the match takes, like `vibeAdded`, with new cases in `alerts.json` and `stoppage.json` (full time repeating every 5 s, the reminder every 20 s, the reminder off); `pnpm generate`, then each runner (Garmin's `MatchCasesTests.mc`, `MatchCasesTest.kt`, the Apple Watch's `CaseRunner.swift`, `web/test/matchCases.test.ts`) passes them in. About half a day.
4. **Sync on opening and Account** on both: the setting, WCH-13's rule in place of the sync on every resume, SYNC-5's rows. About half a day.
5. **History:** Wear OS's `Finished` record, its match page, Summary, Events, Paid and Remove; the status row with send now on both; the list's day. About a day, most of it on Wear OS.
6. **The start menu, Matches and the sync's steps** on both: the sub-labels, Sync now's steps, the tracks on the sync screen. About half a day.
7. **A downloaded match's screen** on both: reading the crew, the labeled rows in UI-19's order, Mark pitch's line. About half a day.
8. **Number entry, Create match and confirmations** on both, with the Apple Watch's UI tests (`LawFiveWatchUITests/WatchFlow.swift`) updated for the new pills. About a day.
9. **The server address check** on both. About 3 hours.
10. **The Apple Watch's titles** after the team menu. About 2 hours.
11. **Requirements and docs:** WCH-13, the Status lines above, the Wear OS and iOS READMEs where they describe these screens, and lawfive.dev's Watches page if it says what differs.

About 5 to 6 days across both watches. The shared cases pass after every step: steps 1, 2 and 4 to 10 change no match rule, and step 3's new cases run on all four engines before Wear OS's settings land.

## Checks

- `pnpm test:watches` after each step, and the Wear OS unit tests and the Apple Watch's engine tests as it runs them.
- **Wear OS emulator** (the README's AVD and debug launch extras): each flow above against the demo server, including Sync on opening off, send now from History, a refused match (a debug extra that queues a record the server refuses), the sync's steps with a track, and Wear OS's **stopped clock** (`stoppingClock` in the format, then `stoppage`), seen in orange, which closes TMR-15's Status line.
- **Apple Watch simulator:** the UI tests, plus the watch's snapshot pictures (`LAWFIVE_SNAPSHOTS`, mobile/ios/README.md) for History, Summary, the number entry, the confirmations and the kit titles, at the smallest and largest watch sizes.
- **Real watches (R-13),** added to its list: the repeat intervals felt during play; Tap again with wet fingers; a wrist raise mid-match not syncing, and a sync on coming back after a break between matches; the server check over LTE and through the phone.
