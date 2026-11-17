# LawFive for iPhone

The iPhone app ([iphone.md](../../docs/requirements/iphone.md)), in Swift and SwiftUI on native navigation, in LawFive's look ([DESIGN.md](../../DESIGN.md)). It works offline at the ground, syncs with any LawFive server, and does what the [Android app](../android/) does. The [Apple Watch app](#apple-watch) is a target in this project. What still needs checking on a real iPhone, the Garmin watch bridge (IOS-9) included, is in [R-12](../../docs/requirements/risks.md).

## Requirements

- Xcode 27 or later, on a Mac. The app runs on iOS 17 or later.
- Xcode downloads Garmin's Connect IQ SDK as a Swift package; using it means accepting [Garmin's license](https://developer.garmin.com/connect-iq/sdk/). It also downloads Firebase's (`firebase-ios-sdk`, pinned at 13.1.1) for notifications from the server, of which the app uses only Firebase Cloud Messaging.
- Optional, for notifications from the server (weather risks, PUSH-5; matches from integrations, NOTE-4; IOS-14) through the [push relay](../../relay/): the `GoogleService-Info.plist` of a Firebase app registered as `app.lawfive`, at `~/.lawfive/apple/GoogleService-Info.plist`, or wherever `LAWFIVE_FIREBASE_PLIST` says (on the `xcodebuild` command line, or in the environment). A build phase (`tools/firebase-settings.sh`) copies it into the app when it's there. It identifies the app rather than being secret, but stays out of the repo (it's in `.gitignore`), as Android's do, so a fork makes its own. Without it the app builds and works, and doesn't offer the setting; the build log says so. A build for another relay sets `LAWFIVE_PUSH_RELAY`.
- For the Apple Watch app, the watchOS simulator: `xcodebuild -downloadPlatform watchOS`.

## Build and run

From this folder, with any installed simulator as the destination.

| What | Command |
|---|---|
| Build | `xcodebuild -project LawFive.xcodeproj -scheme LawFive -destination 'platform=iOS Simulator,name=iPhone 18 Pro Max' build` |
| Run it | open `LawFive.xcodeproj` in Xcode and press Run |
| Remake the icons | `node mobile/ios/tools/icons.mts` from the repo root (Phosphor's; the Apple Watch's in bold, UI-18) |
| Remake the L5 mark (app icon, launch screen, Apple Watch icon, `UI/LogoShapes.swift`) | `node mobile/ios/tools/logo.mts` from the repo root, after `pnpm install` in `web/`; it draws from `web/src/logo.ts` with Google Chrome |

With sample data: `pnpm demo` in `server/`, run the app in a simulator, choose **Use another server**, enter `http://localhost:3000`, and sign in as `demo@lawfive.dev` / `lawfive-demo`.

On a real iPhone: choose your Apple account's team under Signing & Capabilities and run on the plugged-in phone. A free personal team works, with builds that expire after 7 days; TestFlight and the App Store need a paid account. The bundle IDs are `app.lawfive`, `app.lawfive.notifications` (the notification service extension) and `app.lawfive.watchkitapp`, and the iPhone app and extension share the App Group `group.app.lawfive` (`LawFive.entitlements`, `LawFiveNotifications.entitlements`, and `SharedState.group` in `Shared/SharedState.swift`); under your own team, change them to your own in those places, the targets and as `WKCompanionAppBundleIdentifier` in `LawFiveWatch-Info.plist`. The app has the Push Notifications capability (`aps-environment`), which a free personal team doesn't offer: take it out of `LawFive.entitlements` for one. TestFlight builds pass the team on the command line (`DEVELOPMENT_TEAM=…`), never in the project.

## Test

| What | Command |
|---|---|
| Unit tests | the build command with `-only-testing:LawFiveTests test` |
| Snapshot pictures (below) | `tools/snapshots.sh [--no-build] [--keep] [--watch] [testStats …]` |
| Walk every screen in a UI test (`LawFiveUITests`) and take pictures | `tools/screenshots.sh <folder> [light\|dark]`, with the demo running |

`FixturesTests` checks every fixture file decodes with the app's models and reaches `Records`. The UI test `Walkthrough` also takes pictures of parts of the app, named after `LAWFIVE_SET`: `testStatsPictures`, `testSlabPictures`, `testHeatmapPictures`, `testChoicesPictures`, and `testMergingDuplicates` (it merges, so restart the demo after).

### Snapshot pictures

`tools/snapshots.sh` draws the main screens straight from their views, as unit tests, from the demo account's and a new account's data in `schema/generated/fixtures/`, at the fixtures' clock and time zone. They're for looking at: nothing is compared or committed, and they don't run in CI.

- **Screens:** `matches`, `matches-new`, `match-played`, `match-canceled`, `settings`, `settings-notifications` (the iPhone's alone so far: Settings where the build and server offer notifications from the server), `licenses`, `licenses-full`, `license`, `match-form`, `stats`, `quiz` and `quiz-result`.
- **Variants:** iPhone 17 and iPhone SE (375 × 667) sizes, light and dark, default and largest standard text, each the page's whole height.
- **Where:** `build/snapshots/{screen}__{iphone17|se}-{light|dark}-{1x|large}.png` (gitignored), named as Android's so `tools/snapshot-sheet.mjs` can pair them.
- **Running:** it builds for testing into `build/DerivedData` (incremental; `--no-build` skips it; `LAWFIVE_DERIVED_DATA` for another), then tests on one simulator (`LAWFIVE_SIMULATOR`, iPhone 17 by default), shut down after unless it was up already or `--keep` is given. Test names run only those screens; a full run starts afresh. In a plain unit test run they skip.
- **The Apple Watch:** `--watch` also draws the watch's on its own simulator (`LAWFIVE_WATCH_SIMULATOR`; the 40 mm SE is the narrowest), from `LawFiveWatchTests`: the kickoff screen, the kits at their hardest (`watch-kits-*.png`, UI-10 and UI-11), Matches, a downloaded match's screen (`watch-planned-details__{width}pt.png`, UI-19), Start anyway's question and the sync screen partway through a track (UI-26).
- **How it works** (`LawFiveTests/SnapshotHost.swift`, `ScreenSnapshots.swift`): each screen is the signed-in app (`SignedIn(nav:)`) in its own window, with its own `AppGraph` (own settings, in-memory database, temporary folder, and `FixtureServer`, a `URLProtocol` answering from the fixtures). `AppClock.fixed` holds the clock. `SnapshotHost` draws a screen at a time as the page scrolls (`drawHierarchy`) and joins the pieces; swift-snapshot-testing (1.19.7, MIT) writes the PNGs.
- **What differs from a phone:** the map draws (it needs a connection for tiles); the status bar's band is empty.
- **A new screen:** add it to `ScreenSnapshots.swift` with the same key as Android's `ScreenSnapshots.kt`.

## How it's laid out

The API's types are generated into `schema/generated/swift/LawFive.swift` (`pnpm generate` in `schema/`). Files added under `LawFive/` join the app by themselves (synchronized folders).

| Where | What |
|---|---|
| `LawFive/App/` | The app and `AppGraph`, its parts made once. |
| `LawFive/Data/` | The session, API client, database (SQLite: each record's JSON whole, and the outbox) and sync (outbox up, `GET /v1/changes` down), as Android's `data/`; reminders, weather and tips. |
| `LawFive/UI/` | `Theme.swift` (the web's color tokens by the same names, and the fonts), `Components/` and `Screens/`. The working tokens (`LF.text`, `LF.brand`…) follow the `Ground` they're on (grass, chalk panel or board), a UIKit trait bridged to SwiftUI's environment: `LfCard` sets `.ground(.panel)`, `Board` `.ground(.board)`. `Components/Pitch.swift` has the pitch's pieces; `RootView.swift` the board along the bottom. |
| `Data/StatsMath.swift`, `UI/Screens/Stats.swift`, `UI/Components/Slab.swift`, `BoardCharts.swift` | Stats (STAT-13 to STAT-15), with the website's arithmetic tested on its cases. |
| `Data/Contours.swift`, `UI/Screens/Heatmap.swift` | The heatmap (TRK-9), a port of `web/src/contours.ts` (`ContoursTests`). |
| `Data/Merging.swift`, `UI/Screens/Merge.swift` | Duplicates and merging (DUP-11, DUP-12). |
| `Data/Quiz.swift`, `UI/Screens/QuizScreen.swift` | The quiz (QUIZ-1 to QUIZ-7); `Resources/questions-en.json` is copied from `schema/quiz/` by `pnpm generate`. |
| `Data/TryMatch.swift`, `UI/Components/BrowserView.swift` | Try a match from an address (DEMO-9), a port of `schema/src/screen.ts` tested on its cases (`TryMatchTests`), opened in Safari's view. |
| `Data/StarterFormats.swift` | The starter formats (SET-17; `ChoicesTests` checks them against `schema/generated/starter-formats.json`). |
| `Data/SyncActivity.swift`, `UI/Screens/SyncScreen.swift`, `UI/Screens/FromWatch.swift` | The sync screen (APP-16) and what came in from the watch (APP-26). |
| `LawFive/Watch/` | The Garmin watch through the phone (IOS-9): `WatchRelay` and `WatchLinker` as Android's, and `WatchBridge` to Garmin's SDK, on only in Debug builds until it's proven (`GARMIN_BRIDGE`; `tools/garmin-bridge.sh` takes its background mode out of the others). `AppleWatchLink` links the paired Apple Watch over WatchConnectivity, with `WatchLinker`'s messages as JSON under `lawfive`; the watch's side is `LawFiveWatch/PhoneLink.swift` and `PhoneLinkRules.swift`. |
| `Data/Push.swift`, `LawFiveNotifications/`, `Shared/` | Notifications from the server (IOS-14, as Android's `Push.kt` and `Notices.kt`): `Push` gets a Firebase token, registers it at the relay and gives the handle to the server with what the phone wants (PUSH-4); the notification service extension (`NotificationService.swift`, its own target, `app.lawfive.notifications`) asks the server for a push's details and writes it. `Shared/` is compiled into both: the words (`PushWords.swift`, tested on Android's cases in `PushTests`), the plain formatting they use (`Words.swift`), and what the app shares with the extension (`SharedState.swift`: the server and device header in the App Group's settings, the session in the keychain in the App Group's access group). |
| `tools/firebase-settings.sh` | A build phase: copies the Firebase settings into the app when they're there (above). |
| `tools/stamp-version.sh` | A build phase: the version comes from git (VER-1, `tools/version.sh ios`). Never bump it by hand. |
| `Info.plist` | Written by hand. Plain `http` works only for a server on the local network (IOS-2); `ITSAppUsesNonExemptEncryption` is false, as the apps use only https (IOS-11). |
| `*/Resources/PrivacyInfo.xcprivacy` | Each target's privacy manifest (IOS-11), kept the same as `site/public/privacy.html` and the App Store's answers. |

The tabs are the board along the bottom (`BoardTabBar`), over the system's tabs with their bar hidden, so each tab keeps its own navigation stack; pages keep its height clear at their foot. UI tests find a tab by `tab.<name>` (`tab.Matches`) and scroll what they tap clear of it (`reveal`).

Fonts are from Google Fonts (OFL, licenses in `LawFive/Resources/Licenses`): Barlow, Barlow Condensed and JetBrains Mono, in the weights the website loads. Icons are Phosphor (MIT, its license there too). Data and licenses' Full license texts (WX-12) list them and the Swift packages the app bundles, by hand in `Data/Licenses.swift`; `LicensesTests` checks every package in `Package.resolved` that isn't only for tests is there.

## Notifications from the server

To try them, the app needs its Firebase settings (above), and a server that sends through the relay: `PUSH_RELAY_URL=https://push.lawfive.app PORT=3010 WEB_URL=http://localhost:3010 node --env-file-if-exists=../.env src/demo.ts` in `server/` runs a second demo that does. On Apple silicon the simulator gets real pushes from APNs' sandbox, so sign in to it, turn the switches on in Settings → Match day (or run `Walkthrough/testNotificationsFromTheServer` with `TEST_RUNNER_LAWFIVE_DEMO=http://localhost:3010`), then:

- **A test:** Settings → Server → Send a test notification on the website, as the demo's admin.
- **Matches from integrations:** make an API key on the website with **Tell my phones when it adds or changes matches**, and add or change a match kicking off within a day with it (`PUT /v1/matches/{id}`), which goes at once.
- **Weather risks** come when the demo's forecast has one for a match in the next 3 days after the phone registers.

`xcrun simctl push` doesn't run the notification service extension, so it shows the relay's placeholder words; a real push does.

## Apple Watch

`LawFiveWatch/` is the watch app ([wear-os-and-apple-watch.md](../../docs/requirements/wear-os-and-apple-watch.md)), embedded in the iPhone app and syncing straight with the server. A match is a HealthKit workout (WCH-7), which keeps it running with the screen off and records the track; it's prepared, and Core Location started, from the match's setup, so GPS and the heart rate are ready at kickoff (ACT-5). Touch lock (INP-12) uses the system's Water Lock (`WKInterfaceDevice.enableWaterLock()`). What still needs checking on a real watch is in [R-13](../../docs/requirements/risks.md).

```bash
tools/test-watch-engine.sh    # the match's rules and linking, on the Mac, with the shared match cases (or pnpm test:watches from the root)
xcodebuild -project LawFive.xcodeproj -scheme LawFiveWatch -destination 'platform=watchOS Simulator,name=Apple Watch Series 12 (46mm)' test    # a whole match through the controls
```

- **Against the demo.** `LawFiveWatchUITests/DemoSync` syncs with `pnpm demo` in `server/`: History's status row and sending from it (UI-17), a match LawFive refuses (SYNC-17), Account while linked (SYNC-5), a downloaded match's screen (UI-19) and the server address check (SYNC-9). Run it with `TEST_RUNNER_LAWFIVE_DEMO=http://localhost:3000` and, for the linked ones, `TEST_RUNNER_LAWFIVE_TOKEN` (a watch token from the demo's device flow, `client_id` `lawfive-applewatch`); without them it skips.
- **Positions.** Mark pitch (TRK-13) and the kickoff screen's GPS ready (ACT-5) use the simulator's position: `xcrun simctl location <watch> set <lat,lon>` (`testMarkingAPitch` needs one); with none, the kickoff screen says GPS searching. For a track, play a route: `xcrun simctl location <watch> start --speed=4 <lat,lon> <lat,lon> ...`.
- **Linking from the iPhone** works with a paired iPhone and watch simulator (`xcrun simctl list pairs`). Install the watch app after the iPhone app (`xcrun simctl install <watch> .../Debug-watchsimulator/LawFiveWatch.app`), open it, run `Walkthrough/testLinkingTheAppleWatch` on the iPhone and, once it's offering, `LawFiveWatchUITests/PhoneLinkFlow` on the watch with `TEST_RUNNER_LAWFIVE_PAIRED=1` (`test-without-building`).

Debug builds take launch arguments for reaching a screen quickly:

```bash
xcrun simctl launch <watch> app.lawfive.watchkitapp -server http://localhost:3000 -screen 0,0,2,0,1,1 -cup 1 -begin 1 -ago 2700
```

| Argument | What it does |
|---|---|
| `-server` | A server's address |
| `-screen` | The match screen's choices, as Wear OS's `screen` extra (UI-21) |
| `-reset`, `-clear` | Forget everything, or the match |
| `-token` | Link with a token |
| `-typedServer` | Types that address into Account's Server box and submits it, once, for its check (SYNC-9) |
| `-refusedRecord` | A finished match whose upload LawFive refuses, first in the outbox (SYNC-17) |
| `-syncScreen` | The sync screen at `1` or `2` of 3 matches, partway through a `track`, or `stopped` (UI-26) |
| `-plain`, `-cup` | A test format; `-golden` adds golden goal to `-cup` |
| `-phase golden`, `-phase et`, `-phase decide` | Play into extra time and score (ET-6), stop at ET1's kickoff (ET-7), or at the choice after regular time (ET-1) |
| `-begin` | Start a match with some goals |
| `-ago` | Move the period's start that many seconds back |
| `-stoppage`, `-added <seconds>` | Start a stoppage; put that much stoppage on the period (TMR-16) |
| `-sinbins <seconds>` | Sin bins of that length; with `-begin`, AWY 7 and HOM 4 at kickoff (EVT-12) |
| `-reasons <scheme>` | Card reasons on, with `ifab`, `ussf` or `fa` (EVT-14) |
| `-periods 1` | A one-period format (SET-16) |
| `-stopclock` | The clock that stops (TMR-15) |
| `-touchlock` | Touch lock on (INP-12) |
| `-finish` | End the match |
| `-kickoff none\|home\|away` | A new match's kickoff screen with that team chosen (UI-11) |
| `-menu home\|away` | That team's menu over a match (UI-10) |
| `-heading` | A made-up compass reading in radians |
| `-noWorkout` | No workout, track or permissions screen (the UI tests use it, except `testRecordingAMatch` and `testPermissionsRefused`) |
| `-refused` | The permissions screen as after a refusal |

## Pitfalls

- **Clicking in the simulator.** On Xcode 27, use an iOS 27 simulator such as iPhone 18 Pro Max: Device Hub doesn't pass mouse clicks to iOS 17.
- **Archive export.** If `xcodebuild -exportArchive` fails with "Copy failed", Homebrew's rsync is first on `PATH`; run it with `PATH=/usr/bin:/bin:/usr/sbin:/sbin`.
- **Snapshot drawing.** The simulator draws no more than 8,192 pixels a side, and swift-snapshot-testing's own strategies (`layer.render`) leave SwiftUI's content out, so `SnapshotHost` draws a screen at a time with `drawHierarchy`. iOS sizes some type from the simulator's text setting, so each pass sets it and puts it back.
- **Watch pictures.** watchOS has no window to host a view, so they use `ImageRenderer`, which skips views the system draws for SwiftUI: screens of lists or the navigation stack may come out incomplete, and stay with `LawFiveWatchUITests`.
- **WatchConnectivity.** Install the watch app after the iPhone app on a paired simulator, or it isn't seen as installed.
- **The compass** (WCH-10) can't be tried on a simulator except with `-heading`.
- **Notifications in UI tests.** On iOS 27 the question about notifications doesn't always come where XCUITest finds it, and a notification tapped in Notification Center under XCUITest doesn't open the app; a banner over the open app does.
- **Water Lock.** watchOS honors it only for an app in front with a workout running, and only the Digital Crown turns it off.
