# Testing on a real watch

Unit tests and the simulator cover the watch app's logic and screens, but some things only a real watch shows: how vibrations feel, whether the screen stays on, GPS, the battery, and sync through a real phone ([R-6](../docs/requirements/risks.md)). This is a script for one session in three parts: **at home** (about 20 minutes), **a short practice match** (about 30 minutes at a field or park), and **a real match**.

Tick each box and note anything odd beside it: what you did, what you expected, what happened. The IDs are the requirements each check covers.

## 1. At home

### Install and link

- [ ] Charge the watch to 100%.
- [ ] Install: `tools/device/install.sh venu2` (your watch's model id). A sideloaded app gets no phone settings (R-9), so choose the server on the watch, or build one in with `--server https://lawfive.example.com` (SYNC-8).
- [ ] The icon shows in the app list, clear on black (UI-14).
- [ ] On the website, add a match starting within three hours, at a venue placed on the map (for a forecast).
- [ ] On the watch: **Matches** ("Link to get your matches"), **Server**, **My own server**: type your server's address. It says "Found LawFive" (SYNC-9). Note how easy the typing was.
- [ ] **Get a code** shows `XXXX-XXXX` with the address. Enter it on the website's Link page: the watch says "Linked" with how many matches it downloaded (SYNC-1).
- [ ] The start menu's Matches says "1 coming up · synced …"; inside, the match is under Sync now as "STR v ROV" with day, time and place (SYNC-3, UI-16), and its forecast with the degree sign (WX-7).
- [ ] Settings → Alerts and Timer names work with no phone settings (UI-17). Note how the icons look (UI-18).
- [ ] Give the match a fee, crew and notes on the website and Sync now. The match's screen has Start match, "Fee $…" with a Paid toggle, then competition, role, venue, crew, forecast and notes; Notes opens the whole text (UI-19). Easy to read and scroll?
- [ ] **Mark pitch** (TRK-13) on a real field: at each corner press Start and hold still while it averages. Note how long GPS takes, and whether the pitch lines up with the satellite map on the website's heatmap once a match has a track.
- [ ] Flip the fee to Paid with the phone nearby: the website shows it within seconds. Flip it back with Bluetooth off, then turn it on and Sync now: the website follows (SYNC-11).
- [ ] **Account** shows the last sync; **Sync now** works (SYNC-5).

### Through the LawFive Android app (APP-7)

With the [Android app](../mobile/android/README.md) signed in to the watch's server:

- [ ] With the watch unlinked, Link a watch in the app's More lists it, and Link links it with only Start pressed on the watch (APP-12, SYNC-13).
- [ ] Sync now on the watch works, at most a second or two slower than direct. The app's Settings → linked devices shows the watch, seen just now.
- [ ] With the phone's data and Wi-Fi off (Bluetooth on), flip a fee to Paid and Sync now: it says synced and keeps the match list. With data back and the app opened, the website shows it paid.
- [ ] With data off, finish a short match: the watch says "Sent to LawFive". Once the app syncs, it's on the website with its track.
- [ ] Swipe the app away from recent apps and wait, then Sync now: Garmin Connect starts the app to answer. After Force stop it can't until the app is opened, and the watch goes direct after 8 seconds.
- [ ] Sign out of or uninstall the app: the watch syncs directly again (signed out: at once; uninstalled: at once if Garmin Connect reports the app missing, else after 8 seconds the first time; note which).

### Vibrations and the screen

**New match → Custom**: 2 periods of 2 minutes, half-time 1 minute, halfway break on (1 minute), stoppage tracking on.

- [ ] Halfway break due (about 0:30): a repeating pattern you'd notice while moving. Start/Stop starts the break; the game menu's End break ends it (VIB-4, TMR-7).
- [ ] Break over: one long vibration (VIB-3).
- [ ] A running stoppage pulses every 10 s (VIB-2).
- [ ] Time up after a stoppage in the period: the pattern once, nothing to press; Start/Stop then starts a stoppage (VIB-1). Is one buzz enough while running?
- [ ] Time up with no stoppage in the period: the pattern every 10 s until a button; the first press only silences it, and a later stoppage brings no added time alert (VIB-1, VIB-6, VIB-7).
- [ ] Added time used up: its own pattern every 10 s until a button; the first press only silences it, except Back, which also opens the game menu (VIB-7, VIB-6).
- [ ] With stoppage tracking off, time up repeats every 10 s until a button (VIB-1, VIB-6).
- [ ] From 30 s before time up until the period ends, the screen stays on (UI-12). Does it go off after a while?
- [ ] Note any alert you might miss while running.

### The rest of the game menu

- [ ] **Coin toss**: the flip is smooth (PRE-9).
- [ ] **Kickoff direction**, outside away from metal: save one way, turn round, and it says you're facing the other way (PRE-8). Note how far off it is, twice.
- [ ] Close the app mid-match and reopen it: the clocks carry on correctly (TMR-8, R-5).
- [ ] **Adjust clock** (TMR-14): it starts at the clock's time. Forward 40 seconds moves every clock and History says "Clock +0:40"; the minus in "Clock -1:00?" reads clearly. It survives reopening the app; Undo takes it back. Adjust added time works the same, with a stoppage running too.
- [ ] **Suspend match → Lightning** (TMR-13): the clock stops and the screen says LIGHTNING, the 30:00 countdown readable at a glance, "Suspended" counting up. A card now is at the time play stopped. Lightning again restarts the countdown. At 0:00 with the screen off, one long vibration, and the countdown turns green. Reopening the app keeps it as it was. Resume carries the clock on, History shows "Suspended" and "Resumed after ...", and Garmin Connect's activity has a pause without an extra lap (ACT-2).
- [ ] **Sin bins** (EVT-12), on with a 1-minute length in Create match:
  - Sin bin sits between Yellow card and Red card, not mistaken for Yellow. Give one to #7.
  - The pill "AWY 7 1:00" comes last, outlined in yellow, counting down; with the stoppage and halfway break pills, all three fit and read at a glance.
  - At 0:00: three short pulses, repeating, and "AWY #7 can return" in green; any button (or tap on a Venu) dismisses it and does nothing else.
  - A stoppage holds the pill still, delaying "can return".
  - A second to #7 shows the red "2nd SIN BIN" screen.
  - Reopening the app during a countdown or "can return" brings it back.
  - History and the website show "Sin bin AWY #7" and "2nd sin bin AWY #7".
- [ ] **A clock that stops** (TMR-15), Clock set to Stops with 2-minute periods:
  - Start/Stop stands the clocks still in orange, no stoppage pill, with the stoppage reminders; again runs them on in white.
  - A goal, card or injury stops it by itself (orange at a glance in sunlight).
  - Reopening the app keeps it stopped.
  - At 2:00 full time repeats until a button and the clock holds.
  - The game menu says "Stop clock" or "Start clock", with no Adjust added time; History's times are the clock's, and the website says the clock stopped.
- [ ] **Golden goal** (ET-6), Extra time and Golden goal on, 1-minute periods: a goal in extra time shows "Golden goal" with the winner, End match and Undo. Undo carries on; End match shows "On a golden goal", History "(GG)", the website the same. Are the pills easy to hit?
- [ ] **Extra time's toss** (ET-7): the break says "New toss for kickoff" and ET1's kickoff has no team chosen. Pick one, record the direction facing the goal it attacks, play ET1: ET2's kickoff points the other way for the other team.
- [ ] Finish or cancel the run, and delete it on the website.

## 2. A short practice match

With the watch linked, start the downloaded match (or Custom, 2 × 10 minutes with a 3-minute half-time).

- [ ] Wait for GPS before kickoff.
- [ ] Walk, jog and sprint through the first period. Record a goal for each team and a yellow card with a number.
- [ ] Half-time pauses the recording (ACT-2). Kick off the second period and move again.
- [ ] Buttons and swipes with wet fingers and a sleeve over the screen edge (INP-5, EVT-9).
- [ ] With Team swipes set to Sideways on the website (Settings, Match screen) and synced: right opens HOM, left AWY, up the game menu, down nothing; Back still opens the game menu (INP-10, R-1).
- [ ] The time of day shows at the bottom of every screen but the menus (small above the title there); on the running match only when chosen instead of the ring (UI-25).
- [ ] Full time says "Sent to LawFive", or "Uploads when phone is near" then sends (SYNC-4).
- [ ] Garmin Connect has a soccer activity with the GPS map, paused at half-time (ACT-1, ACT-2, ACT-4).
- [ ] The website has the score, events and "You covered" (SYNC-7). Note the distance against Garmin Connect's.
- [ ] The watch's track (TRK-7): "Sending track…" then "Sent to LawFive" (or "Track uploads when phone is near"); the match page has a track from "LawFive watch" with heart rate. Note its distance and upload time. The watch's sync screen shows over full time (UI-26), and the phone's too (APP-16).
- [ ] In Garmin Connect on the web, **Export Original** from the activity's gear menu and compare its distance with the watch track's. Replace the track (TRK-8) only if the watch's looks wrong.

## 3. A real match

As the practice match, plus:

- [ ] History shows the fee's Paid toggle (UI-20); flip it and check the website.
- [ ] Battery at kickoff and full time (R-4), against what the match report keeps (DIAG-1).
- [ ] The whole track arrives, about 100 KB on the watch (TRK-7).
- [ ] Clocks, pills and score read in sunlight (UI-1).
- [ ] The match screen's choices (UI-21): one clock, two stacked and side by side, names and scores only. Readable while running, side by side with the ring especially?
- [ ] The ring (UI-23) fills (or empties on Time left), turns orange at the period's end, and costs no noticeable battery.
- [ ] The time of day (UI-25) on every screen it shows: small but readable in sunlight, and clear of what's above.
- [ ] The added time alert (VIB-7): four quick pulses, distinct from full time's.
- [ ] Added time left (TMR-16): the orange pill shows the total until the period's length, then counts down, holding during a stoppage; 0:00 as the alert comes, then "+0:05" and on. Readable while running?
- [ ] The break clock counting up (Time taken, TMR-4), at half-time and in the halfway break's pill.
- [ ] Touch and buttons with sweat, and in rain.
- [ ] **Touch lock** (INP-12, five-button watches): during play taps and swipes do nothing, not even silencing an alert, and the buttons do everything; touch works again at half-time, kickoff and full time. Does it stop stray taps in rain?
- [ ] Anything you reached for and couldn't find, or pressed by accident.

## What to note

Besides anything that failed: the battery at kickoff and full time; the distances (website, Garmin Connect, the watch's track, Garmin's file); whether the track arrived, how long it took and anything missing; how far off the kickoff direction was; whether the screen stayed on; and the activity's FIT file (Export Original) if the track or distance looks wrong.
