# iPhone app (IOS)

The iPhone app does what the Android app does, by the same requirements ([android.md](android.md)), and what that file says of the website goes for it too. This file says where the iPhone differs. The Apple Watch app is in [wear-os-and-apple-watch.md](wear-os-and-apple-watch.md). How it's built: [mobile/ios/README.md](../../mobile/ios/README.md).

## The app

- **IOS-1** An iPhone app (iOS 17 and later) in Swift with SwiftUI, in LawFive's look ([DESIGN.md](../../DESIGN.md), IOS-13) on native navigation and controls, light and dark. Its types are generated from `schema/`, so it can't drift from the server. iPhone only, in portrait, for now. The app uses no third-party packages except Garmin's SDK (IOS-9); its tests also use swift-snapshot-testing.
- **IOS-13** **Pitch & Scoreboard** (WEB-24, WEB-25), as the Android app (APP-27), page for page: the grass and pitch frame, the board along the bottom as the tab bar and behind the status bar, the titles, chalk panels and boards, the website's chips, buttons, fields and segmented control, the folding next match (WEB-27), Recent (WEB-26), Stats (STAT-14, STAT-15), the slabs (WEB-28) and the painted heatmap (TRK-9). The iPhone way where it differs:
  - The tab bar is LawFive's own board over the system's tabs. Each tab keeps its native navigation stack and state, and only the tab in front is in VoiceOver's reach. Tabs switch without Android's crossfade.
  - Pages after a tab's first keep the system's navigation bar, as a strip of the board, with Back (its swipe and long-press menu) and the page's actions, so Edit, and Add on Competitions and Templates, stay in that bar.
  - Search is a field in the page, Add a chalk slab at the bottom right, and how sync stands sits beside the title, as on Android.
  - Forms open in a sheet, on the grass, with the Save bar at their foot, holding Delete when editing.
  - Confirmations are the system's alerts, except leaving a form with unsaved changes, which asks in LawFive's look (APP-18).
  - On Stats, In detail's links scroll the page to their parts, the filters scroll across inside their board, and the busiest times' kickoff hours follow the phone's 12- or 24-hour setting.
  - Wherever the periods of a heatmap don't fit side by side, they share the board's width with a long name over two lines.
  - The app's icon (with iOS 18's dark and tinted icons) and its launch screen are the L5 mark on the board. The Apple Watch app's icon is the mark on the board that watchOS cuts round; its running screens keep the watch's own look (WCH-6).
- **IOS-4** **What it shows and edits** as APP-4 and APP-20, with Did you know (TIP-1 to TIP-3), and the same left to the website as APP-8.
- **IOS-7** **Photos** as APP-5, from the camera or the phone's photos. The viewer swipes between them and pinches to look closer.
- **IOS-8** **Maps** are Apple's, with a Map / Satellite switch on every map, so the server's map settings (ADM-2) don't apply. Directions open Apple Maps. The calendar feed offers Add to Calendar, the system's subscribe.

## Signing in and sync

- **IOS-2** **Signing in** as APP-2: the hosted service by default, or any address; email and password, a code from the website (APP-13), or an invitation (APP-14).
  - The session's token is kept in the keychain. The phone shows in the website's devices list as an iPhone with its iOS version.
  - Addresses are https, except that plain http works for a server on the local network, by its IP address or a name ending in `.local`, so a server at home works. A home server on another name (such as `.home.arpa`) needs its IP address; any other plain http address gets a message saying so.
  - Return in Email goes to the password (Next), and in the password signs in (Go). With a field focused, the page scrolls Sign in into view above the keyboard, on the smallest iPhones too.
- **IOS-3** **Works offline** as APP-3. It syncs on opening, after a change, on pull to refresh and with Sync now in More. The pull is the system's; a sync that worked shows APP-3's check, beside the title, and its haptic. In the background it syncs when iOS allows, which is less predictable than on Android.
- **IOS-12** **Only the server's own answers count**, as APP-23, on the iPhone and Apple Watch apps.

## Reminders, erasing and deleting

- **IOS-6** **Match reminders** as APP-6, at the account's times, with a day's matches in one notification, without the live countdown. iOS keeps at most 64 waiting, so the soonest 60 are scheduled, again after each sync. iOS shows each at the moment it's set for, so the iPhone needs nothing like APP-28.
- **IOS-5** **Erase this phone's LawFive data** as APP-11, except that the app returns to signing in rather than closing, as iPhone apps don't close themselves.
- **IOS-10** **Deleting the account in the app** as APP-21.

## The Garmin watch

- **IOS-9 (Draft)** **The Garmin watch through the phone** (APP-7) and **linking from the phone** (APP-12), with Garmin's Connect IQ iOS SDK 1.8.0. The same relay and linking as Android, with these differences:
  - The app learns of watches when Garmin Connect is opened once to share them (Choose watches in Garmin Connect), and remembers them. Garmin Connect returns to the app by a URL scheme, so self-hosters need no domain setup.
  - The app talks to the watch over Bluetooth itself. Garmin's SDK starts only once someone has shared a watch or chooses to, so any Bluetooth permission prompt comes then, not at launch for people without a Garmin.
  - iOS, not the watch's message, decides when the app wakes (`bluetooth-central` and state restoration), so a watch that gets no answer goes straight to the server, as it always can.
  - It has to be proven on a real iPhone and watch before the app is submitted, or its Bluetooth settings and its part of Link a watch come out. The bridge's rules are tested with Android's cases; nothing over Bluetooth is tested yet (R-12). The SDK's license and App Store questions are R-17.

## The App Store

- **IOS-11** **What the App Store checks**, on the iPhone and Apple Watch apps:
  - A privacy manifest in each (`PrivacyInfo.xcprivacy`): no tracking, what's collected and why, and UserDefaults with reason CA92.1, the only required-reason API in use. It's kept the same as the privacy policy (SITE-5). The Apple Watch's lists precise location, health and fitness, as the iPhone's does.
  - A reason for each permission asked for: the camera, the local network and Bluetooth (IOS-9); on the Apple Watch, Apple Health (reading the heart rate and distance, saving the workout) and the location while in use (WCH-7). Notifications ask in the system's own words, the photo picker needs no permission, and the Apple Watch's compass reads magnetic north, which needs no location permission (to confirm on a real watch, WCH-10).
  - Background modes are only what's used: `fetch` for the iPhone's background sync, `bluetooth-central` for the Garmin bridge (IOS-9, R-17), and `workout-processing` for the Apple Watch's workout session (WCH-5, WCH-7, R-16).
  - Both apps declare they use only the system's own encryption (`ITSAppUsesNonExemptEncryption` false), so App Store Connect doesn't ask about export compliance for each build.
  - A test checks all of this as built.
  - The App Store listing is named LawFive Referee, as LawFive was taken; the name under the icon stays LawFive. The listing says Garmin watches sync directly on iPhone (IOS-9).

## Status

Everything above but IOS-9's Bluetooth is built and checked on simulators (iOS 17 at the smallest width, and the current iOS), against the demo in light and dark and at the largest standard text size, and briefly on an iPad (R-12). It's on App Store Connect as LawFive Referee, with phone and watch builds up for internal TestFlight testing. Linking the paired Apple Watch from the iPhone (WCH-12) works on a simulator pair.

Not built yet:

- Testing on a real iPhone (R-6, R-12): the icon on the home screen in light, dark and tinted, the launch screen opening from it, the stripes, boards, slabs (WEB-28), Stats' lamps and greens and the painted heatmap (TRK-9) in sunlight, the 44 pt buttons with gloves, Recent (WEB-26), In detail's links scrolling, and what came in from the watch (APP-26).
- The pull to refresh's check and haptic (IOS-3) are built but not yet seen, as the simulator's scripted drags don't pull.
- Proving IOS-9 on hardware.
- Linking the Apple Watch (WCH-12) on hardware (R-6, R-13).
- The App Store listing (IOS-10, IOS-11).
- Notifications from the server: weather risks and matches from integrations (PUSH-5, NOTE-4), with their settings.
