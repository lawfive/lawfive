# Android app (APP)

The Android phone app: most of what the website does, on match day, without signal. Its pages, forms and words are the website's at a phone's width ([web-app.md](web-app.md)); this file says what the phone adds or does its own way. The iPhone app follows these requirements too, except where [iphone.md](iphone.md) says otherwise, and several below name both phones. How it's built: [mobile/android/README.md](../../mobile/android/README.md).

## The app

- **APP-1** An Android app (Android 10 and later) in Kotlin with Jetpack Compose, in LawFive's look ([DESIGN.md](../../DESIGN.md), APP-27) on Material 3 components, light and dark. Its types are generated from `schema/`, so it can't drift from the server.
- **APP-9** Installed from builds over USB for now, signed with a key kept outside the repo; the Play Store comes later. Release builds are for 64-bit ARM phones only (every Android 10+ phone it's for), as map code for the other kinds would more than double the download.
- **APP-27** **Pitch & Scoreboard** (WEB-24, WEB-25), as the website at a phone's width, page for page, from Recent (WEB-26) and the slabs (WEB-28) to Stats (STAT-14, STAT-15) and the painted heatmap (TRK-9, TRK-14). The board is the tab bar and sits behind the status bar. Where the phone differs:
  - The mowing stripes stay put as the page scrolls.
  - **Folding the next match** (WEB-27): the folded strip is two rows, a size smaller under 340 dp, and the caret a 48 dp button in the board's head. Folding crossfades while the list eases to its new height, and simply changes with animations off. The choice is saved as Settings are, so another device's change takes over once it syncs.
  - With no hover, a tap shows a Stats graphic's values, and each graphic has a spoken summary in place of the website's data table. Stats links only directly (STAT-13).
  - A venue's See matches scrolls to the matches further down its own page; a referee's Call, Text and Email sit under the slab.
  - At larger text sizes words grow, stepping down only so none breaks, while figures sized to their room don't grow. The tab bar's words shrink to fit, and Not the same and Merge… stand one above the other when they don't fit side by side.
  - The app's icon (adaptive, with a monochrome layer for themed icons), its launch screen (the board with the mark, over the grass) and its notification icon are the L5 mark on the board. The Wear OS app's icon is the mark on a round board; its running screens keep the watch's own look (WCH-6).
- **APP-24** **Notifications carry the LawFive mark** in the status bar, a white silhouette with the pitch green as accent, so they're known as LawFive's at a glance. The iPhone shows the app's icon.

## Signing in

- **APP-2** **Signing in**: choose the server (the hosted service, `https://api.lawfive.app`, by default; a build can have another built in; or any address, checked with `GET /v1/meta`, SYNC-9), then email and password, or a code from the website (APP-13). Forgot your password? is on the page.
  - The app stays signed in and shows in the website's devices list as "Android". Sign out is in Settings.
  - An account waiting for approval sees the waiting message; a suspended one is signed out. **Check again** that finds it approved syncs at once.
  - Under the form: "New to LawFive? Scan your invitation, or make an account on the website and sign in here." The words link to the server's sign-up (USR-2) when the server gives its address and is open to sign-ups.
- **APP-13** **Signing in with a code.** The website's Get the app page (APP-15) shows a code as a QR code and in letters, eight characters as on the watch (SYNC-1), with the server's address.
  - It lasts two minutes and works once. A new one takes its place while the page is in view, up to five times, then Show a new code.
  - On the phone: **Scan a QR code** (Google's code scanner: needs Google Play services, no camera permission) or **Enter a code** (the server and the code).
  - The phone shows the server, name and email and asks "Sign in on this phone?". Only Sign in uses the code, so a code from elsewhere can't sign the phone in unasked. The phone gets its own session, shown under Devices.
  - An account waiting for approval can't make a code; a suspended one can't use one.
  - The QR code holds `https://<server>/get-app#CODE`, the code in the fragment so it never reaches a server's logs. A phone's camera opens that page, whose **Open in the app** opens `lawfive://sign-in?server=…&code=…`. Links must be HTTPS (debug builds may use http), an address with a name before an @ is refused, and a link while signed in says to sign out first.
  - A self-hosted server sets `API_URL` when phones should use an address other than `PUBLIC_URL`; `GET /v1/meta` tells them.
- **APP-14** **An invitation by QR code.** People shows any open invitation as a QR code holding its link. The app's scanner reads it and shows the sign-up form on the phone (who invited them, Name, Email, fixed when the invitation is for one address, Password), signed in at once, whatever the sign-up setting (USR-3). A phone's camera opens the web page instead, which on a touch screen also offers **Use the app instead** (`lawfive://invite?server=…&token=…`).
- **APP-15** **Get the app**, the website's `/get-app` page (from Settings → Watches and devices, and Get ready, WEB-32): the steps (install, open and scan, check it's you) beside the code.
  - Each store shows "Coming soon" until it has a listing. While both do, step 1 says "In testing: ask for an invitation" (mail to support@lawfive.app), and the code waits for **I have the app** (shown at once when a phone is signed in), so its countdown doesn't run for nothing.
  - Signed out, or opened from the QR code, it offers Open in the app and the stores. At phone width it leads with those and the code in letters, the QR code behind "Using another phone?".
- **APP-10** **A server on the home network.** Android 17 lets an app reach the local network only with the "nearby devices" permission. When signing in to such a server fails, the app asks for it and tries again.

## Offline and sync

- **APP-3** **Works offline**: a copy of the account (matches, reports, venues, referees, competitions, templates, settings), kept up to date with `GET /v1/changes`. Changes made on the phone wait in an outbox; when a record changed elsewhere meanwhile, the fields changed on the phone go on top of the newer copy.
  - How sync stands is in a few words at the top right of the tabs' first pages ("Synced 4 min ago", "Syncing…"). More has Sync now, for screen readers and anyone who doesn't know the gesture.
  - Pull to refresh syncs those pages, a match, Competitions, Templates and Settings; on Settings it also fetches again what Settings asks the server for (sessions and watches, the calendar feed, storage, the plan). The devices are fetched again whenever Settings comes back into view or the app returns, so a watch unlinked on itself drops off (SYNC-6).
  - The pull's spinner stays at least 0.6 seconds. A sync that worked gives a success haptic and, where the page shows the status, a check by it in brand green for 2 seconds; one that failed says so in the status.
- **APP-23** **Only the server's own answers count.** The server marks every answer, errors included, with a `LawFive-Version` header. The phone apps, the Wear OS and Apple Watch apps, and the relay for the Garmin watch (APP-7) act on an error only when it's the server's: a record gone (404), a change refused (400, 409), a session ended (401). An error without the header, such as a proxy's 404 or 502 while the server restarts, counts as offline: changes stay waiting and the next sync tries again, so nothing is dropped and nobody is signed out. A server from before the header is known by its JSON error. The Garmin watch, going straight through Garmin Connect, can't read headers (R-19).
- **APP-16** **A big sync gets a screen of its own**, on both phones.
  - It shows when a Garmin watch hands over through the phone, however small (so a played match always does); on the first sync after signing in (known by a flag set at sign-in, so an empty account's first save isn't taken for its history); or with 10 or more changes from elsewhere at once.
  - A row for each thing moving: the match and its track's progress ("Track: 12 of 40"), or a kind of record with its count and latest name, each ticked when done.
  - Keep using LawFive hides it while the sync carries on. It says All synced when done (from a watch, once nothing has moved for 8 seconds) and closes 4 seconds later, unless it becomes the summary (APP-26). If it stops, it says why and that the rest goes by itself, and stays until closed.
- **APP-26** **What came in from the watch**, on both phones: when a sync brings played matches recorded on a watch that the phone hasn't had, however they came, a full-screen summary shows them.
  - If the sync screen (APP-16) is showing, it becomes the summary. A match a Garmin hands over has the phone sync once the server has it, so it comes down in time. Otherwise the summary opens when the app is in front with no sync moving, and adds what arrives later.
  - Not on the first sync after signing in, for a result entered or corrected on the website or a phone, or for a watch sending a match again (RES-4).
  - **Match from your watch** (or **3 matches from your watch**), then a card per match, newest first: teams, kits and score; date, competition and your role; goals and cards counted; distance, time played and whether there's a track; heart rate; the fee and whether it's paid; the crew. Tapping a match opens it; **Done** closes.
  - It's shown once, and the matches waiting are kept on the phone until it closes, so nothing is lost if the app closes first.

## Matches, venues and referees

- **APP-4** **What it shows and edits**, as the website: Matches, a match and its report, adding and editing matches, Venues (with pitches on a map), Referees, Competitions, Templates, Settings (WEB-33, with Erase this phone's data apart, APP-11) and Link a watch.
  - Bottom tabs: Matches, Venues, Referees, Stats (STAT-13), More (in the website's groups, WEB-31). Matches' Get ready (WEB-32) has Turn on reminders in place of Get the phone app.
  - A venue and a referee open on their own page, with Edit for the form. Adding is a green button floating at the bottom right of each list.
  - An account with no settings record yet sees all of Settings with the website's defaults for the phone's language and region (for en-US: miles, °F, USD, the United States' codes), used elsewhere too; its first change makes the record from them, with the phone's time zone (PLAN-9).
- **APP-8** **Left to the website**, linked from More: People and admin, API keys and webhooks, and exporting. Importing is on the phones (IMP-10); Stats has its own tab, linking to the website's full page.
- **APP-20** The match format, for matches and templates, has the website's settings and follow-up fields (WEB-15).
- **APP-5** **Photos** from the camera or the gallery on matches, venues and referees, made smaller on the phone as the website does (FILE-2), with captions; a referee's first photo is their picture (FILE-5).
- **APP-19** **Venues and referees show their match count**, as the website ("12 matches · 2 coming up", most played first). Sprint speed in Settings follows the distance unit (mph or km/h), kept in km/h. A replay's goal banner is in the scoring team's color (TRK-10, TRK-14), as on the website.

## Forms and search

- **APP-17** **Search**, on the website and both phones: an X clears it, and the keyboard stays up however the rows above change. On the phones, an empty box with focus offers the tags in use (chips over the list on Android; the system's suggestions on iPhone); one chosen filters and sits in the box with its own X. For matches, venues and referees.
- **APP-22** **Choosing from long lists** on the match form, as the website's picker (WEB-12): the venue, competition and referee open a sheet to search by any part of a name, ignoring case and accents, other names too (DUP-9). A new name offers **New venue "<typed>"** (or competition or referee), made and chosen without leaving the form, and kept even if the match isn't; a referee also offers **Just this match**. Team colors show their swatch.
- **APP-18** **Leaving a form with changes asks first**, on the website and both phones: "Are you sure you want to leave? You have unsaved changes." with Keep editing and Leave, for Cancel, Back, a tab or a link. An unchanged form leaves at once, and saving never asks.
- **APP-25** **A form's buttons stay in reach.** On Android every form has Delete (an icon, when editing), Cancel and Save in a bar fixed at the foot of the page, above the tabs; the last rows leave room for it, and it gives way to the keyboard. Cancel leaves as Back does (APP-18). The iPhone's forms are in IOS-13.

## Match reminders

- **APP-6** **Match reminders** as notifications on the phone. **Remind me of matches** is each phone's own, off until turned on (so someone using the calendar feed doesn't get two).
  - The times are the account's reminders, the same ones the calendar feed uses (CAL-3), so they're set once for the feed and every phone: minutes before kickoff (15-minute steps up to 3 hours, several allowed), and the day before and the day of at chosen times, in each match's time zone. They show under the switch while it's on, with a hint that the calendar feed and the other phones use them too, and can be changed there, without signal too, as other settings can.
  - An account that has never chosen several reminders has the one it had before (an hour before kickoff when none), as the website shows it. When the app is first updated to shared times, a phone that had its own sends them to an account that hasn't chosen any; otherwise the account's stay. Either way the phone's own copies are then forgotten.
  - Before kickoff, one reminder for each match. On Android, within 3 hours of kickoff it counts down live beside the app's name ("LawFive · 44:12"), with the kickoff time and venue ("11:30 AM · Central Park"); further off it says "in 5 hours" or "tomorrow".
  - The day before and the day of, one notification for all the matches whose reminder comes at that moment: "2 matches tomorrow" (or "today"), then a line for each in short names (SET-5) with its kickoff on the phone's 12- or 24-hour clock and its venue: "STR v ROV · 9:00 AM · Central Park". The day of's lists only matches that kick off after it. With one match it reads as a reminder before kickoff does, and a match with a reminder before kickoff at that same moment is left to that one.
  - Only matches still on: canceled, postponed and played matches have none.
  - Tapping one opens its match (a day's, the day's first); a match with a place has a **Directions** button. Both phones.
  - Every reminder leaves the notification shade at kickoff (a day's, at its last match's).
- **APP-28** **Reminders on the minute.** Android can hold back the app's scheduled work a few minutes while the phone is idle, so reminders are set as exact alarms when the person allows LawFive **Alarms & reminders** (Android 12 and later; earlier versions need nothing).
  - Turning on Remind me of matches (in Settings or Get ready) first says why ("so yours arrive on the minute"), then opens the system's Alarms & reminders page.
  - Without it, reminders still come, a few minutes late at worst; while they're on, the card says so, with **Allow** for the system's page. Coming back from it, the card and the reminders follow at once.
  - The alarms are set again when the phone restarts, the app is updated, the clock or time zone changes, and when the permission is given.
  - It's the permission the person grants, not the one Google Play keeps for alarm clocks and calendars.

## The Garmin watch through the phone

- **APP-7** **The Garmin watch syncs through the phone.** With the app installed, the watch gets its matches and sends finished ones, tracks, fee changes and pitch corners through it (Garmin's Connect IQ phone SDK), so it works without signal at the ground once the phone has synced. The watch's direct sync (SYNC-1 to SYNC-12) stays for when the app isn't there. Only a Garmin syncs this way; Wear OS and Apple Watch go to the server themselves (WCH-4).
  - A sync on the watch first asks whether the phone app is there and signed in to the watch's server (the two hosted addresses count as one). With no answer in 8 seconds, or a different server, it goes straight to the server and doesn't ask again for 10 minutes.
  - The app needn't be open: the watch's message starts it, except after Force stop until it's next opened.
  - The phone makes the watch's requests (only `/v1/watch/…`) with the watch's own token and device name, so the server sees the watch as always. One the phone doesn't answer in 30 seconds goes straight to the server.
  - Without signal, what the watch sends waits in the phone's outbox and the watch is told it's kept, which counts as sent. The watch's next matches come from what the phone fetched last, with fees marked paid since. The outbox goes, oldest first, at the next sync, and each sync fetches the watch's next matches ahead (SYNC-14).
  - The app answers Garmin Connect only for LawFive's watch app (a debug build tethered to the simulator also takes the simulator's, which names none). A watch is remembered only once the server accepts its token.
  - The outbox holds at most 500 items, dropping first a token the server never accepted, then track pieces, then the rest, match records last. A body over 64 KB isn't kept (the watch keeps it).
- **APP-12** **Linking a watch from the phone.** Link a watch lists the watches Garmin Connect knows, whether each is connected and has LawFive, each with **Link** (or **Link again** for one already on the account).
  - Link shows the steps (open LawFive on the watch, press Start, linked) and asks the watch to open LawFive, offering this phone's server and account, every few seconds (and to open LawFive every 20); after a minute without an answer, Try again.
  - Once the watch says yes (SYNC-13), the phone links it as the website does, with the phone's session, and sends the watch its server and its own token. Nothing is typed on the watch.
  - Linking with the watch's code (SYNC-1) stays below, for watches without the phone app; on a phone without Garmin Connect, the code comes first.
  - A watch without LawFive says how to install it; once LawFive is in the Connect IQ Store, Link opens its page there.

## The phone's data and the account

- **APP-11** **Erase this phone's LawFive data** (Settings → About, confirmed): signs out, removes everything the app keeps on the phone (the account's copy, unsent changes, what the watch left to upload, reminders, settings) and closes. The account stays on the server. For a fresh start, a phone changing hands, or testing.
- **APP-21** **Deleting the account in the app**, which Google and Apple require: Settings → Account → Delete account, on both phones (IOS-10), as the website (USR-7).
  - It lists what goes, offers **Download my data** there and then (saved through the system's file picker, with Delete unavailable until it's done), and asks for the password.
  - Afterward the phone signs out and removes everything APP-11 does.
  - If the server refuses (a wrong password, or the server's only admin), its words show and nothing changes on the phone. With no signal nothing's deleted, and it says so.
  - The account's watches find their token refused at the next sync and show as not linked. `lawfive.app/delete-account` explains how without the app (SITE-5).

## Status

Everything above is built. The app is in use on a real phone with a Garmin watch, through the phone and linked from it; the look is checked on the emulator against the demo, light and dark, 412 dp and 320 dp wide, at larger text.

Not built yet:

- The Play Store (APP-9).
- Checks on a real phone (R-6): the launcher icon with and without themed icons, the launch screen, the notification icon, and the stripes, boards, slabs (WEB-28) and painted heatmap (TRK-9) in sunlight; Recent (WEB-26); the scanner reading a real QR code (APP-13).
- What came in from the watch (APP-26) with a real watch.
- Deleting the account (APP-21) is checked only by the build and the server's tests.
- Only the server's own answers (APP-23) is checked by unit tests, not yet by a sync during a real restart.
- Saving Wear OS matches to Health Connect (WCH-7) on a real phone.
- Reminders on the minute (APP-28) on a real phone: an exact alarm while it's asleep, after a restart and an update, and with Alarms & reminders refused; a day's matches in one notification in a real phone's shade (APP-6).
