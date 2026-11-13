# Wear OS and Apple Watch apps (WCH)

Apps for referees on Wear OS and Apple Watch, doing what the Garmin app does, by the same requirements (TMR, EVT, INP, UI, VIB, ET, SYNC and the rest) wherever those aren't Garmin's own. This file says what's particular to these two watches.

## The apps

- **WCH-1** **A Wear OS app** ([mobile/android/wear/](../../mobile/android/wear/): Kotlin, Compose, Wear OS 3 and later) and **an Apple Watch app** ([mobile/ios/README.md](../../mobile/ios/README.md#apple-watch): Swift, SwiftUI, watchOS 10 and later, inside the iPhone app's project, as Apple requires).
- **WCH-2** **The same match** as the Garmin watch: phases, clocks in the three styles, stoppage, the halfway break, added time, goals with player numbers and types, cards with second yellows, undo, kickoff choice and swap, restart, extra time, the shoot-out, the coin toss (PRE-9), full time, the match screen's choices (UI-21 to UI-23, UI-25) and the added time alert (VIB-7).
  - Each watch has its own copy of the rules, and every copy runs the same cases, written once as data in [schema/match-cases/](../../schema/match-cases/): the three watches' engines run all of them, and the match screen pictures on the website and phones run the screen cases. `pnpm test:watches` runs every copy.
  - A difference between copies is a bug in one of them.
- **WCH-3** **Offline first.** The match is saved on the watch on every change and survives the app being closed (TMR-8). Finished matches wait on the watch until the server has them (SYNC-4).
- **WCH-4** **Straight to the server**, over the watch's own connection (through the phone, Wi-Fi or LTE, as its system finds), with the Garmin watch's API: linking with a code (SYNC-1), the next matches (SYNC-3), finished matches, the fee's Paid toggle (SYNC-11) and the match screen (UI-24).
  - They name themselves to the server as `wearos` and `applewatch`, and show in Devices.
  - A self-hosted server's address can be typed on the watch (SYNC-9). On Wear OS that's the system's own text entry, which shows what's typed on every keyboard.
- **WCH-5** **The match keeps running with the screen off.** Alerts still vibrate (VIB-1 to VIB-6), and the screen stays on near the end of a period (UI-12), as far as each system allows.
  - On Wear OS a foreground service and an ongoing activity do this, and the match is a tap away on the watch face.
  - On Apple Watch the match's workout session (WCH-7) does it, with no time limit (R-16). If Apple Health was refused there's no workout, so the kickoff screen says alerts stop with the screen off and to allow Health for LawFive in Settings.
- **WCH-11** **Setting up a match and the settings, as on the Garmin watch.**
  - New match offers **Same as last** once a match has been started (SET-13). **Custom** is Create match, with the Same as last switch, every row of SET-9 in its order, and **Team colors** last (SET-14: the same eight colors and None).
  - Settings has **Timer names** (SET-8, typed with the system's text entry, with Use the defaults), **Quick match** (Create match's rows, kept as they're changed) and **About** (the versions, the server, history kept, lawfive.dev, and **Reset LawFive**, DATA-8).
  - Reset keeps the settings, as on Garmin. Wear OS then closes; Apple Watch, which can't close an app, goes back to the start.
  - The game menu and the break pill use the timer names the match was created with (UI-5).

## The look and the controls

- **WCH-6** **The look follows the Garmin watch and the phone apps**: white on black, slots at the same fractions of the screen (UI-1), the watch's meanings for color (orange stoppage, blue break, yellow and red cards), Barlow and Barlow Condensed, and Phosphor icons on the green circle (UI-18). Each app draws its own components, not the system's watch component library.
  - Controls are the Garmin touch watch's: swipe down for the home team, up for the away team, sideways for the game menu (INP-1 to INP-3; Wear OS swipes sideways, INP-10); a physical button for stoppage where there is one (INP-4); the crown scrolls lists.
  - The Wear OS app's icon is the L5 mark on a round board (WEB-25); the Apple Watch's is the mark on the board that watchOS cuts round (IOS-13).
- **WCH-9** **A swipe right goes back** on every menu and number screen, as on the Garmin Venu, and a sideways drag is never a tap on what's under it. The match screen keeps its own swipes. Back from the player number goes straight to the match. There's no Cancel row in the team menu, as it would crowd the rows that matter during play. Apple Watch also keeps its X.

## The compass and recording

- **WCH-10** **The kickoff direction (PRE-8)**, with the same screen, picture and arrows as Garmin's, saved with the match and sent up.
  - The row shows only when the system says there's a compass: a magnetic field sensor on Wear OS, `headingAvailable` on Apple Watch.
  - Headings are from magnetic north, not true north as on Garmin, as these watches have no location to correct them with. The arrows only compare headings from the same watch, and a heatmap turned by it may be off by the local difference.
- **WCH-7** **Recording GPS and heart rate** for tracks and the distance covered (TRK-7, SYNC-7), and **marking a pitch** (TRK-13), as on Garmin. All of it needs a real watch to test properly (R-13).
  - **Apple Watch:** the match is a HealthKit workout (soccer, outdoors) from the first kickoff, paused between periods (ACT-2) and ended at full time, giving the heart rate and distance; the location is from Core Location. At full time it's saved to Apple Health with its route, so it shows in Fitness; a canceled match drops it. **Record track** and **Save to Health** are in Settings → Account, on by default.
  - **Wear OS:** a Health Services exercise (soccer) in the match's foreground service, giving the heart rate, location and distance, with **Record track** in Settings.
  - On both, the track is sampled once a second during the periods and sent as the Garmin watch's (`POST /v1/watch/tracks`, the last 3 kept), with the distance and GPS figures in the record (SYNC-7, DIAG-1). Restart match drops the recording so far (PRE-6). The server keeps which app and model recorded a match and its track (VER-3).
  - **Permissions:** the first time the app opens, one LawFive screen says what it asks for and why (location for the track, as the kickoff direction's compass needs none; heart rate and Health for the workout, which on Apple Watch keeps alerts going with the screen off; on Wear OS also physical activity and notifications). Continue asks (Wear OS also offers Not now); nothing asks between Start match or Quick match and kickoff. Refused, the match still runs and a screen says what's lost and where to turn it on (the watch's Settings → Privacy & Security on Apple Watch; Settings → Permissions on Wear OS, which asks again or opens the app's settings). On Apple Watch without Precise Location, the kickoff screen says there'll be no track.
  - **Health Connect** isn't on watches, so the Android phone app saves Wear OS matches there after a sync: a soccer exercise named as Garmin's activity ("Ref Strikers U12 v Rovers U12"), with its route, heart rate and distance, once per match. **Save Wear OS matches**, in Settings → Your watch where Health Connect is, is on unless switched off and asks for Health Connect's permission, whose "why" link opens the privacy policy.
  - Google Play needs a declaration for these permissions, on phone and watch, when the apps are submitted (APP-9).
  - **Mark pitch** (TRK-13), from a downloaded match's screen or a played match in History (which says whether it's sent), is Garmin's screen: each corner averaged over five seconds of fixes within 25 m, the position read every second; two to four corners, and leaving saves two or more. The corners go at the next sync after the matches (SYNC-12), to the planned match each came from.

## Linking and the phone

- **WCH-12** **Link your Apple Watch from the iPhone.** On Link a watch, when an Apple Watch is paired and LawFive is on it, the iPhone offers Link your Apple Watch.
  - The iPhone sends the watch the same offer, accept, link and linked messages as the Garmin's (IOS-9), over WatchConnectivity. The offer also waits for up to a minute for when LawFive isn't open on the watch; the token only ever goes straight to the watch.
  - The watch asks "Link to {server}?" with "As {account}", or "Instead of {host}" when it's linked elsewhere. It answers busy during a match. Closing the question is No.
  - On Link, the phone gets the watch a token of its own: a device code asked for in the watch's name under `lawfive-applewatch`, approved with the phone's session, then collected. The watch keeps it only for the server and offer it said yes to (SEC-5), as linking with a code does.
  - Linking with a code stays.
- **WCH-8 (Later)** A bridge through the phone app, for what only a live link to the phone can do, such as starting a match from the phone.

## Status

Everything above but WCH-8 is built, played through on the Wear OS emulator and in UI tests on the Apple Watch simulator, syncing with the demo server. Recording, Mark pitch and the compass are tried with made-up readings; saving to Health Connect is unit-tested.

Not built yet:

- Recording, Mark pitch (WCH-7) and the compass (WCH-10) on real watches (R-13); Health Connect from a real phone.
- Linking the Apple Watch from the iPhone (WCH-12) on hardware (R-6, R-13).
- The icons in a real watch's app list (seen as renderings only).
- Behind Garmin:
  - History has only the sent line and Mark pitch: no Summary, Events, Paid toggle, send now or Remove from watch (UI-17, UI-20).
  - No Remind every or Repeat alerts every (both fixed at 10 seconds, VIB-1, VIB-2), and no Sync on opening setting.
  - Extra time and Penalties aren't in the game menu after regular time (ET-1).
  - The Apple Watch's menu puts Kickoff direction before Change kickoff.
