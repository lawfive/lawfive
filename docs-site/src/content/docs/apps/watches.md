---
title: Watches
description: Connect Garmin, Wear OS and Apple Watch apps to your own LawFive server.
---

## Getting the app

- **Garmin:** install LawFive from [Garmin's Connect IQ Store](https://apps.garmin.com/en-US/apps/1e9bdbc1-ba90-4096-8279-d4db70f3721a), in the Connect IQ app on your phone or from that page. It lists the watches it runs on.
- **Wear OS and Apple Watch:** not in their stores yet. Until they are, [build them from source](/contribute/overview/).

What each watch app asks the watch for (location, heart rate and the rest), when it asks, and what still works without each, is on [Permissions](https://lawfive.app/permissions) at lawfive.app.

## Linking a watch

The Garmin, Wear OS and Apple Watch apps all link the same way:

1. On the watch, [choose your server](#choosing-your-server).
2. In LawFive on the watch, go to **Settings → Account → Link account**. On a Garmin, then choose **Get a code**; Wear OS and Apple Watch show the code straight away (so does **Matches** on their start menu, until they're linked). The watch shows eight characters, valid for 10 minutes.
3. On your server's website, open `/link` while signed in (or **Link a watch** in its More menu), enter the code, and approve it. The Android and iPhone apps take the code too, under **More → Link a watch**.

Once it's linked, the website and the phone apps offer the next two steps: set up your match screen, and try a match on that watch in your browser, with that screen. You'll then see the watch under **Settings → Your watch**, on the website and in the phone apps, where you can unlink it. Matches you finished before linking are sent too, oldest first.

**Unlinking on the watch** (**Settings → Account → Unlink**) signs it out on your server too, so it drops off those lists. Without a connection at the time, the watch does that the next time it has one (a Garmin needs its phone nearby).

**An Apple Watch paired with your iPhone** can skip the code: in the iPhone app, open **More → Link a watch** and tap **Link your Apple Watch**. The watch asks "Link to {your server}?"; tap **Link**. The watch gets its own token for the server the iPhone is signed in to, and that sets its server too, so there's nothing to type. This has been tried on paired simulators, not yet on a real iPhone and Apple Watch.

## Choosing your server

Choose your server before linking. You can change it whenever the watch isn't linked.

**On Garmin:** choose **Server** in the Link account menu, then **My own server**, and type your address. An address without `https://` gets it added. The watch asks the address for LawFive's server information, and keeps it only when a LawFive server answers, showing "Found LawFive". Otherwise it says what went wrong, so you can try again. You can also set it from your phone: in the Connect IQ app, LawFive's **Settings** has **LawFive server to link to**. A watch that's already linked keeps the server it linked with.

**On Wear OS and Apple Watch:** open **Settings → Account**, and type your address in the server field. It needs `https://`, which is added if you leave it out. On Wear OS, leaving the field empty goes back to the hosted service.

A Garmin app you install yourself over USB can also have a server built in. See [the Garmin app](/contribute/garmin/#installing-on-your-watch).

## How watches sync

| Watch | Route |
|---|---|
| Garmin, with the Android app | Through the LawFive app, which works without signal at the ground once the phone has synced. |
| Garmin, otherwise | Directly, through Garmin Connect on the phone. It needs signal when it syncs. |
| Wear OS and Apple Watch | Directly, over the watch's own connection: through the phone, Wi-Fi or LTE. |

A watch syncs when the app opens (on Wear OS and Apple Watch, also when it comes back after five minutes or more away), never during a match; at full time, to send the match; after anything changed on the watch; and with **Sync now** in **Matches**. **Settings → Account** shows the last sync, what's waiting to upload and the server, and **Sync on opening** turns the sync on opening off. A match your server refuses is set aside so the others still go, and History says it's not on LawFive; pressing that line in the match's History sends it again.

Through Garmin Connect, your server must be reachable from the internet with a valid HTTPS certificate. See [Set up HTTPS](/run/https/), and if a watch can't connect, [Troubleshooting](/run/troubleshooting/#a-watch-or-phone-cant-connect).

Linking a Garmin watch through the iPhone app is built, but hasn't been tried on real hardware yet.
