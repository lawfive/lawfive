# Match screen (UI)

How the watch app looks: the running screen and the choices it's built from, the teams as kits, the app's own screens, menus and Settings, and the match screen setup on the website and phones. It's the same on every watch (Garmin, Wear OS, Apple Watch) unless a requirement says otherwise, and Try a match draws the same running screen. The clock readings are checked by the shared match cases in [`schema/match-cases/`](../../schema/match-cases/).

## The running screen

- **UI-1** While a period runs, the screen uses fixed slots, so nothing moves when timers come and go. The match clock is large in the very middle; the added time and pills sit lower.

  ```
          1H
    0 HOM | AWY 2

        12:00          <- match clock
        +1:12          <- added time, only after the period's length
   (3:00)  (0:30)      <- stoppage pill (orange), break pill (blue)
  ```

  A running sin bin (EVT-12) adds a yellow outlined pill last in the row; with three pills the font steps down, then the sin bin pill drops the team.
- **UI-2** The stoppage pill shows only once the period has stoppage time; the break pill only while a halfway break is to come, due or running. Two pills that wouldn't fit across a round screen use a smaller font.
- **UI-3** The screen shows the period (`1H`, `2H`, ET1, ET2). A match of one period leaves the slot empty (SET-16).
- **UI-4** The stoppage pill is solid orange while a stoppage runs and outlined when paused; from the period's length it shows the added time left, then the time over, still orange (TMR-16). The break pill is blue: outlined while counting down to the halfway break (TMR-7), solid with "<name> due", then solid with the break's countdown. It goes once the break is over or skipped.
- **UI-5** No labels on the timers: they're told apart by position and color. The stoppage and break names (SET-8) are used in the menus ("Start stoppage", "Start break") and the event list.
- **UI-12** The screen stays on from 30 s before the period's time is up until the referee ends it, and while a halfway break is due, the app turning the backlight on every second. AMOLED watches limit how long an app may keep it on; past that it goes off as normal (R-6).

## Choosing the screen

- **UI-21** **The running screen is built from four choices**, made in the match screen setup (UI-27, or Settings → Match screen on a watch) and fixed at kickoff:
  1. **Clocks**: one; two **stacked** (a smaller gray second clock under the match clock, replaced by the added time from the period's length); or two **side by side** (the same size, a thin line between, the match clock on the left; in added time they hold, `45:00 | 0:00`, with the added time below).
  2. **How each counts**: the match clock (TMR-11), the second clock (UI-22) and the break clock (TMR-4). Stoppage always counts up.
  3. **Ring, time of day or neither** at the screen's edge (UI-23, UI-25), never both.
  4. **Names or scores only**: the score line with the names, or a small `0 - 2` with each number on its team's color and a larger clock.

  The ring or time moves nothing. Every layout keeps the added time and second clock in one lower slot and the pills below it in the same place, so the tap for a due break (TMR-7) doesn't move. Side by side keeps its size with the ring, dropping one font size only where the digits would cross into it. The watches use their system fonts.
- **UI-22** **The second clock** is one of the other two match clock styles (TMR-11), never the match clock's: Time left by default, or the time from 0 when the match clock is Time left. It holds at the period's end.
- **UI-23** **The ring** follows the match clock: counting up, it fills clockwise from 12 o'clock in LawFive green; counting down, it starts full and empties. It runs over a dark track, starts again each period, and turns full orange from the period's length until the period ends. Round watches and Apple Watch (along its rounded edge) have it; square Garmin and Wear OS watches show the time of day instead.
- **UI-25** **The time of day is on every screen**, in the watch's 12- or 24-hour format, kept current on a still screen.
  - Menus (system menus and the app's team and goal-type menus) have it small and dim above the title. On Garmin a system menu's title scrolls away with its list.
  - Every other screen has it small and dim at the very bottom, as low as fits inside the edge, on Garmin in the font the watch carries for it (its smallest on screens under 360 pixels).
  - The running match has it only when chosen instead of the ring.
  - Apple Watch shows the system's clock at the top of every screen instead, which the app can't turn off.
- **UI-24** **The match screen belongs to the account**, and all its watches follow.
  - It's chosen on the website, the phones or a watch, and **the latest change wins**: a watch sends its change at its next sync and takes a newer one from the account. A watch starts a changed screen at the next kickoff.
  - **Until one is chosen**, it's two clocks stacked, **Time left** over **Match time**, the break clock's Time left, the time of day and the names. A watch with its own choice keeps it; an account with no settings yet leaves it on that watch only.
  - Unlinking leaves the watch's screen as it is.
  - Changes in the Garmin Connect phone settings aren't sent up (R-9); the account's next change replaces them.
  - Older watch builds, with six fixed layouts, get the nearest one; one that sends its layout to an account with nothing chosen counts up.
- **UI-27** **The match screen setup** on the website and phones (Settings → Match screen) asks UI-21's questions one step at a time, then a review to save.
  - The steps (Clocks, How they count, Ring or time, Names, Review) are named above, and any can be gone to.
  - A live picture beside them shows the screen on a round watch and on Apple Watch's rounded rectangle (the account's linked watches' shapes first, labeled).
  - Each clock style is named with an example for a 2 × 45 match.
  - **Moments** show the screen at points of a match: 1st half 23:12, 2nd half 67:40, added time, a stoppage running and paused, a halfway break coming, due and running, and half-time. A **Stoppage tracked** switch drops the stoppage moments; **Team colors** shows the demo's STR in red and ROV in blue instead of HOM and AWY.
  - **Play through** runs a 2 × 45 match in about 30 seconds, with a scrubber (dragging pauses it) and where it is in words ("2H 67:40", "Half-time 3:00").
  - The picture is a drawing, not a screenshot, but its readings come from the watches' rules and are tested with the same cases. It shows the Laws' running clock, never TMR-15's.

## The teams

- **UI-10** **The teams are kits** wherever the score line appears (kickoff, running, breaks, extra time, shoot-out, full time).
  - Two kits of the same width (the wider name's, with room either side), cut on one "/" diagonal where they meet (0.21 of the height either side of the middle, with a small gap). Each short name (SET-5) sits upright in its part; the scores sit outside. With scores only, the scores are the kits.
  - A team's color (SET-11) fills its kit; without one, the board's dark gray. The text is black or white, whichever contrasts more (WCAG). A color too dark for the black screen gets a thin gray edge.
  - **One team on its own** (the team menu's title and the screens after it, and Sin bin over) is a lone kit cut only on the side facing the other team, so its shape says which side it is.
  - Only the shape slants: the names keep the watch's fonts.
- **UI-11** On the kickoff and shoot-out first-kicker screens, the chosen team has a white dot above its kit, and nothing else; before a choice, neither has one. Nothing is filled or outlined, so a white kit only ever means a team in white.

## The app's own screens

- **UI-6** **The team menu** (Goal, Sin bin when on, Yellow card, Red card, then the rest) and the goal-type menu are drawn by the app in a dark style, titled with the team's lone kit.
  - Every row is a dark band, so rows look tappable; on button watches the focused row is brighter with a white outline. Yellow card and Red card rows are yellow and red; labels are left-aligned.
  - No Cancel row. On Wear OS and Apple Watch a swipe right goes back, never tapping the row under it. Back from the player number goes straight to the match.
  - Every other menu is the watch's system menu, so it looks like the watch's own.
- **UI-7** **Confirmations**: a short question ("Restart match?"), maybe a smaller gray detail ("Clock and events are cleared"; for Undo, the event), then a **Yes** pill (green, or red for Cancel match and Restart match) over a gray **No**. Yes and No, not Confirm and Cancel, because under "Cancel match?" a Cancel pill would read as the action. Yes is highlighted first; Start/Stop presses the highlighted pill, Up/Down or a swipe moves it, Back cancels, a tap presses a pill.
- **UI-8** **The two-digit entry screen**, for player numbers and Create match's minutes and team size (SET-9): a title ("Goal HOM", with a small card for cards; "Period length") and a unit ("Player number", "Minutes", "Players").
  - Each digit has its own dark box; the active one is brighter, with a white outline and up/down arrows.
  - The bottom pill is a green **OK**, or a gray **No number** or **No break** at `00` where zero means that.
  - In Create match it dims outside the phone settings' ranges (period 1–60 min, break 0–30, extra-time period 1–30, team size 1–11), shown under the title, and Back on the first digit keeps the old value.
  - On Apple Watch the Digital Crown turns the outlined digit; tapping a digit or its arrows picks it.
- **UI-9** The home team's controls slide in from the top and the away team's from the bottom, matching the swipes and Up/Down; with sideways swipes (INP-10), from the left and right. They slide back out the same way.
- **UI-13** The Start button on every kickoff screen and the shoot-out's first-kicker screen is large and green, about half the screen wide, in the large font.

## Menus and Settings

- **UI-15** **The start menu** has four fixed rows with icons: **Matches**, **New match**, **History** and **Settings**. Their sub-labels change in place, so the highlight never moves, and are short enough not to be cut off on the smallest round screens (about 13 characters): "3 coming up" or "None yet" (the last sync's problem in its place, or "Link to sync", which opens Link account); "Quick · 2x45'"; "Last: STR 3-2 ROV" or "None yet"; "Linked" or "Not linked". The details are a row further in: the last sync under Matches' Sync now and Settings' Account, the half-time under New match's Quick match, the server under Account. Back from each returns to its row.
- **UI-16** **Matches** lists **Sync now** (with the last sync, or each step: "Sending match 1 of 2…", "Sending track 3 of 18…", "Getting matches…"), then the downloaded matches, soonest first and highlighted, updated in place. **New match** offers the planned match (set in the phone settings), **Quick match**, **Same as last** (starting straight away, once a match has been played, and left out when it's the same as Quick match) and **Custom** (SET-9). The watch syncs quietly on opening unless **Sync on opening** is off; finished matches are always sent at full time.
- **UI-19** **A downloaded match opens its own screen**: **Start match**, with the match's format under it in Quick match's words ("2×45' · HT 15'", "1×20'" for one period; on Garmin after the kickoff's day and time, "Sat 9:00 · 2x45' · HT 15'"); **Fee** ("Fee $25", only with a fee) as a Paid toggle (SYNC-11), one per match, with no icon on Garmin; then its details one row each (name or competition, your role, venue and pitch, the crew, the forecast, the notes in full); then **Mark pitch** (TRK-13).
- **UI-17** **Settings**:
  - **Account**: the last sync, anything waiting, the server, Sync on opening, Sync now and Unlink, or Link account. On Wear OS and Apple Watch an unlinked watch's Account starts with Link account and Server, so the server is seen before getting a code.
  - **Alerts**: "End of each period" (VIB-1), added time used up (VIB-7), breaks, stoppage vibrations, and how often reminders and alerts repeat.
  - **Controls**: Tap for stoppage (INP-4), Card reasons (EVT-14), Touch lock on five-button Garmins and Apple Watch (INP-12).
  - **Record track**; on Apple Watch with Save to Health; on Wear OS saying what's missing without permission.
  - **Match screen** (UI-21), **Timer names** and **Quick match** (the Create match list, saved for Quick match).
  - **About**: the app's version, the server and its version, history kept, and Reset LawFive (DATA-8).
  - A sideloaded watch, with no phone settings (R-9), can change everything here.

  **History** lists the watch's finished matches with "Sent", "Waiting to send" or "Not sent". Each opens its status (when sent, with the track's progress, or press to send; one finished unlinked goes on linking, SYNC-4), **Summary** (score, each period with its added time, cards, distance), **Events**, and **Remove from watch** (confirmed, warning when it hasn't reached LawFive). Wear OS has a Permissions row while anything's refused.
- **UI-20** **History's match screen** has the fee's **Paid** toggle too, so a fee paid after the game can be marked (the fee as it was at kickoff), and **Mark pitch** (TRK-13).
- **UI-18** **Icons**: Phosphor (bold) in black on a LawFive green circle, left of each row in the start menu, New match and Settings, the same on all three watches (WCH-6):
  - Matches CalendarBlank, New match Plus, History ClockCounterClockwise, Settings GearSix; Quick match Lightning, Same as last ArrowCounterClockwise, Custom SlidersHorizontal; Account UserCircle, Alerts Vibrate, Controls Hand, Match screen Watch, Timer names TextAa, About Info.
  - Wear OS and Apple Watch also use Play for Start match, ArrowsClockwise for Sync now, Link for Link account and the Flag for Mark pitch only. Wear OS's Permissions is ShieldCheck; Apple Watch's permissions screen uses MapPin and Heartbeat.
- **UI-14** **The app's icon** is the L5 mark (WEB-25) in the board's colors (chalk L, mint 5 and its darker fold), filling the width of a transparent square for the black app list, drawn in flat colors at each watch's exact size (40 to 70 px).

## Sync on the watch

- **UI-26** **A sync that sends matches or tracks gets its own screen**: a green ring for progress, "Syncing", what's going ("Sending track", "3 of 18") and the time of day.
  - It comes up over the home or full-time screen, once a sync, never over a match being played or a menu in use (going back brings it up), so every match sent shows it.
  - Back leaves it running. It ends with All synced and how many matches went, closing after 3 seconds; if it stops, it says why and that nothing's lost, and stays.
  - The full-time screen's small line shows the same step. On Garmin, at full time with no phone connected, it stays away, as that screen already says the match uploads when the phone is near. Wear OS and Apple Watch, with no phone to wait for, say when they can't reach the server.
  - Syncs with nothing to send stay quiet (UI-16).

## Status

Everything above is built on all three watches, with the setup's pictures, moments and Play through on the website and both phones, and the running screen in Try a match.

Not built yet:

- UI-14's icon checked on a real AMOLED watch and a real MIP one.
- The kits (UI-10, UI-11) checked on real watches (R-6).
- On Apple Watch, the screens after the team and official menus keep the system's plain titles rather than a lone kit.
