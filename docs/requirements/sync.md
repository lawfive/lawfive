# Account sync (SYNC)

Linking a watch to a LawFive account and syncing with it ([ARCHITECTURE.md](../ARCHITECTURE.md)). A Garmin syncs through the phone (Garmin Connect, or the LawFive Android app, APP-7), so only with the phone nearby; a Wear OS watch or Apple Watch syncs on its own whenever it's online. Linking is optional: everything else on the watch works without an account. Unless a requirement says otherwise, it applies to all three watches, and the linking pages to the website and both phones.

## Linking

- **SYNC-1** **Link account**, from Matches in the start menu or Settings → Account while not linked (UI-15, UI-17).
  - The watch asks the server for a code and shows "Enter this code at" with the address (`app.lawfive.app/link` on the hosted service), the eight-character code, large, as `XXXX-XXXX`, and "or in the LawFive phone app" ("or in the LawFive app" on a Garmin screen too narrow for it). Garmin's Get a code says "Website or LawFive app".
  - Someone signed in enters it on the website or in either phone's Link a watch, and confirms. The watch, checking every 5 seconds, then shows "Linked" with how many matches it downloaded.
  - Codes last 10 minutes. An expired code, a refused one or no connection shows a short message, and Start (or a tap) tries again. Back leaves at any time.
  - The website's and both phones' **Link a watch** say how to reach the code on every watch: "On your watch, open LawFive and go to Settings → Account → Link account. On a Garmin, then choose Get a code. The watch shows an eight-character code." Under it, "Don't have LawFive on your watch yet? How to get it" opens lawfive.dev's Watches page.
  - On the phones the Garmin section is **Garmin, from this phone**, and says an Apple Watch or Wear OS watch links with a code.
  - The website's Settings → Watches and devices has one Link a watch: the "No watch linked yet" row's, and the section's once a watch is linked.
- **SYNC-13** **Linked by the phone app** (APP-12), for a Garmin.
  - When the phone offers, the watch asks "Link to lawfive.example.com?" with the account's name under it (or "Instead of" the server it's linked to now). Start links, Back says no.
  - It shows Linking (a minute at most) until the phone sends its token, then Linked and the matches it downloaded, as after a code.
  - The server the phone gave becomes the watch's chosen server (SYNC-9). A watch linked elsewhere leaves that account first, signing out there; what waits to upload stays (SYNC-6).
  - The phone's offer is sent again until the watch answers; a new offer (Link pressed again) replaces one still on screen.
  - Not during a match: the phone is told the watch is busy.
- **SYNC-15** **What next, once a watch is linked**, on the website's and both phones' Link a watch, after a code, from a Garmin on this phone (APP-12) or an Apple Watch from the iPhone (WCH-12).
  - A tick and "**{watch} is linked**", with the name the server gave it ("Your watch is linked" without one; "Your Apple Watch is linked" for one linked from the iPhone).
  - Then a line for that kind of watch, known from the app the code came from (`client_id`: `lawfive-garmin`, `lawfive-wear` or `lawfive-applewatch`; a server that doesn't say is taken as a Garmin):
    - Garmin: "It's downloading your next matches. It syncs through your phone when it's nearby, even with no signal at the field." On the website: "…through your phone, with the LawFive app or Garmin Connect, so keep it nearby".
    - Wear OS and Apple Watch: "It's downloading your next matches. It syncs on its own whenever it's online, so a match you finish with no signal goes up once it's back."
  - Under it, **Next**, two rows: **Your match screen**, with the account's in a line (as Settings shows it, UI-27) and **Set it up**, opening the match screen setup; and **Try a match on your {watch}** ("on your watch" without a name: "See how a match runs on it, with your match screen. Nothing is saved.") with **Try it**, opening Try a match with that watch and the account's match screen (DEMO-9). On the phones a row can be tapped anywhere. Then **Done**.
  - On the iPhone the panel takes the whole page, and Done goes back to where Link a watch was opened from.
  - **On a phone without Garmin Connect** the code comes first and there's no Garmin section. Under the code: "Have a Garmin? Install Garmin Connect and it links from here." (on the iPhone, Install Garmin Connect opens its App Store page). The line under the page's title reads "Link any watch with the code it shows.", and the Link a watch rows in More and Settings read "With the code on your watch".
  - With Garmin Connect, the page has both the Garmin section and the code, and the rows read "From this phone, or with a code".
- **SYNC-6** **Unlink** (confirmed) forgets the account and the downloaded matches, and signs the watch out on the server, so the devices lists drop it. Queued matches stay and upload if the watch is linked again.
  - Without a connection at the time (a Garmin without its phone nearby), the old link is kept just for signing out, with the server it came from. The watch signs it out the next time it can reach that server, when the app starts and before each sync, oldest first, up to 5 on a Garmin; it goes once that server answers.
  - A reset (DATA-8) keeps those waiting, with its own if its sign-out didn't get through, and so does linking to another account through the phone (SYNC-13, WCH-12).
  - A watch the server already refused (401) has nothing to sign out.
  - Unlinking a watch on the website or a phone (each device has Unlink, SEC-7) has the same effect at the watch's next sync ("Unlinked; link again").

## The server

- **SYNC-2** The server is a phone setting, "LawFive server", defaulting to the hosted service (`https://api.lawfive.app`). Self-hosters change it there.
  - Watches only make HTTPS requests with a valid certificate.
  - A linked Garmin keeps the server it was linked with in its own storage, so changing the setting in Garmin Connect can't send a linked watch (and its token) elsewhere; it takes effect at the next link.
  - The hosted service's two addresses (`api.lawfive.app` and `app.lawfive.app`) count as one server for a Garmin's sync through the phone.
- **SYNC-8** A Garmin build installed over USB can have a server built in (`watch-garmin/tools/device/install.sh <watch> --server https://...`), since a sideloaded app gets no phone settings (R-9). It wins over the phone setting, which on a sideloaded watch can hold a value left from an earlier install that nothing can change; a server chosen on the watch (SYNC-9) wins over both. While getting a code, and when that fails, Link account shows which server it's asking.
- **SYNC-9** **Choosing the server on the watch** (Garmin). Link account opens a short menu: **Server** (showing "LawFive (hosted)" or the server's address) and **Get a code** (SYNC-1).
  - Server offers "LawFive (hosted)" or "My own server", which opens Garmin's text entry (a keyboard or a letter scroller, depending on the watch) with `https://` or the current address filled in. An address typed without `https://` gets it.
  - The watch asks the address for LawFive's server information (`/v1/meta`) and keeps it only when a LawFive server answers ("Found LawFive"; otherwise "No LawFive server there", or the connection problem, and Start to type it again).
  - The server chosen on the watch is remembered and wins over the phone setting (SYNC-2) and a built-in server (SYNC-8). It can be changed whenever the watch isn't linked, and Account shows it under Unlink.
- **SYNC-10** **The watch says which it is** (Garmin): every request, linking included, carries its Garmin part number and firmware version (`X-LawFive-Device: garmin; model=006-B3703-00; firmware=12.30`).
  - The server names it from a table of the watches LawFive supports, made from the Connect IQ SDK's device files, with an entry for each regional part number.
  - The website's Link page asks "Link this Garmin Venu 2 to your account?", Settings' devices list shows "Garmin Venu 2" with its firmware (updated as it syncs), and a track's source names the watch it was recorded on.
  - A model the table doesn't have, or a watch that doesn't send it, shows as "Garmin watch".

## Matches down and up

- **SYNC-3** While linked, the watch keeps the account's next 10 scheduled matches (from three hours before kickoff on).
  - They're refreshed when the app starts (unless a match is in progress), after linking, after full time, and with Sync now.
  - They head the start menu, soonest first, as "STR v ROV" with the day, time (in the watch's 12- or 24-hour format) and place.
  - Starting one uses its teams, short names, colors and format, with this watch's alert and timer-name settings, and keeps the match's id so the result is linked to it.
- **SYNC-4** At full time a finished match is queued, and uploaded straight away if it can be, otherwise at the next sync.
  - The queue survives restarts and holds up to 10 matches. A match is sent again when cards are given after full time, replacing the earlier copy.
  - The full-time screen says "Sent to LawFive" or "Uploads when phone is near" on a Garmin. On Wear OS and Apple Watch it says "Sent to LawFive", "Waiting to send", or, not linked, "On this watch only" and "Link to send it", as the Garmin's History does.
  - When the watch is linked (with a code or by the phone app), every match in History not yet on LawFive is queued too, oldest first, including ones finished while it wasn't linked, with their tracks (TRK-7).
  - A match, or a piece of its track, is given up only when LawFive itself refuses it (its answer says why, as JSON). A proxy's error page, such as a 404 while the server restarts (R-19), leaves it for the next sync.
- **SYNC-7** The distance the referee covered is read from the activity recording at full time and uploaded with the match.
- **SYNC-11** **Changes made on the watch.** Marking a match's fee paid or not paid (UI-19) is kept in the watch's outbox and sent at the next sync, so it works without a connection. The server changes only that, and the latest change wins over one made on the website in between. Each downloaded match brings its fee, crew (roles and names) and notes (shortened to fit the watch's memory).
- **SYNC-12** **Pitch corners from the watch** (TRK-13) wait in an outbox like the fee changes and are sent at the next sync, after the matches they belong to (a quick match's once the match itself has gone up). One marking per match; marking again replaces it.
- **SYNC-14** **On your watch.** The server notes which matches each linked watch got in its latest download of its next matches (SYNC-3), directly or through the phone app with the watch's link (APP-7), but not the phone fetching them ahead for later. (`GET /v1/devices/matches`)
  - A match's page says "On your Venu 2 since 8:12 PM" (when the watch first got it as it is), "On your Venu 2, an older version" when something the watch shows has changed since (teams, kickoff, format, venue, officials, notes or fee) or the match is no longer scheduled, or "Not on a watch yet". The watch's name drops a leading "Garmin ".
  - On the website it's the Watch line in The match's facts, for a scheduled match from three hours before kickoff until it has a report; nothing when no watch is linked.
  - Unlinking a watch drops its matches. Phones keep the last answer for when there's no signal.
  - A list the phone gives the watch without signal isn't known to the server until the watch's next online sync.

## The Account menu

- **SYNC-5** **Settings → Account**, while linked, shows when it last synced (or the last problem: "Phone not connected", "Couldn't reach server"), how many matches and tracks are waiting to upload, the server, **Record track** (TRK-7), **Sync on opening** (UI-16) and **Unlink**. **Sync now** is in Matches (UI-16).

## Status

Linking with a code and by the phone app, the next matches, uploads with an outbox, the Account menu, unlinking, the distance, the server built in or chosen on the watch, the watch's model, the fee and pitch corners from the watch, and what next after linking are built, through the Android app too where it's there (APP-7).

Not built yet:
- Background sync while the app is closed.
- SYNC-14 is on the server only: the match pages, and the phones' fetching ahead and offline copy, are still to come.
- SYNC-15 on the phones has been checked only in their unit tests, not on a real phone.
