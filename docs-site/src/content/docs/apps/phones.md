---
title: Phone apps
description: Connect the LawFive Android and iPhone apps to your own server.
---

The same apps work with the hosted service and with your own server.

:::note[Availability]
The apps aren't in Google Play or the App Store yet. Until they are, [build them from source](/contribute/overview/).
:::

## Signing in

The quickest way is from the website, already signed in on a computer:

1. On your server's website, open **Settings → Watches and devices → Get the app**, or go to `/get-app`. It shows a QR code, with the code in letters and your server's address.
2. In the phone app, choose **Scan a QR code**. Without Google Play services on Android, or if you'd rather type it, choose **Enter a code**, and enter the server and the code.
3. Check that the server, name and email are right, then choose **Sign in**.

The code lasts two minutes and works once.

Or sign in with a password: choose **Use another server**, enter your server's address, then your email and password. The app checks the address is a LawFive server before going on.

## Invitations

An invitation on **People** also shows as a QR code. Scanning it in the app opens the form to make an account on the phone. A phone's camera opens the web page instead, which also offers **Use the app instead**.

## Addresses

| App | Which addresses work |
|---|---|
| Android | `https://`. Debug builds also allow `http://` for a test server. |
| iPhone | `https://`, or `http://` for a server on your local network, by IP address or a name ending in `.local`. |

## Offline at the ground

Each phone keeps its own copy of your matches, and an outbox of changes. It sends them when it has a connection, so poor signal at a ground doesn't lose anything.

## Stats

The **Stats** tab shows your games in figures and charts, worked out by your server as on the website: your role, distance, games by month, fitness and where on the pitch you spend your time, busiest kickoff times, age groups, venues, weather, cards, fees and the referees you work with most. Choose the time (all time, the last 12 months or a year) and your role at the top. The last figures for each choice stay on the phone, so they're there without signal. Tap a column or the line to see what's in it. **Full stats** at the bottom opens the website, for added time, more filters, tables and the CSV.

## Merging duplicates

The same venue or referee entered twice, often from two leagues' schedules (Twin Creeks and Twin Creeks Sports Complex, or Sam Rivera and Rivera, Sam), can be merged on the phone as on the website. When there are likely duplicates, the Venues or Referees list says so at the top, and a venue's or referee's page shows which ones it's probably the same as, with **Merge…** and **Not the same**. **Find duplicates** under the list shows every group, with why; **Merge with…** on a venue's or referee's edit page starts from that one. Pick the ones that are the same, then **Next** to choose the name to keep, and for venues what happens to each pitch, before **Merge**. Your server works out the suggestions and checks each choice, so merging needs a connection, and a server from before it doesn't offer it. A merge can't be undone.

## Directions

Every place a match or venue shows has a **Directions** button. It opens Google Maps or Apple Maps, as chosen under **Directions open in** in Settings on the website or either app: Automatic is Apple Maps in the iPhone app and Google Maps everywhere else.

## Reminders

Match reminders are scheduled on the phone after each sync, so they work on any server. On Android, a reminder in the last 3 hours before kickoff counts down to it live, and goes away at kickoff. Tapping one opens the match, and a match with a place has a **Directions** button.

## Weather risks

On Android, **Tell me about weather risks** in Settings, under Match reminders, sends a notification when the forecast shows a new risk to a match in the next 3 days, with its day and kickoff ("tomorrow, 9:00 AM"). It's off until you turn it on, and the iPhone will follow. Tapping one opens the match, and a match with a place has a **Directions** button. See [Notifications](/run/notifications/) for how this reaches your phone and what passes through the relay on the way.

## Matches from integrations

If an app adds your assignments with an API key, it can tell your phone when it adds a match, or cancels, postpones, moves or removes one. Turn on **Tell me about matches from integrations** beside the weather risks on Android, and **Tell my phones when it adds or changes matches** for that key under **Settings → API keys** on the website. Several changes from one app in the same minute come as one notification. Tapping one opens the match, or the match list when there are several, and a match moved to another venue has a **Directions** button.
