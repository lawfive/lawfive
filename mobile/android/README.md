# LawFive for Android

The Android phone app ([android.md](../../docs/requirements/android.md)), in Kotlin and Jetpack Compose, in LawFive's look ([DESIGN.md](../../DESIGN.md)). It works offline at the ground and syncs with any LawFive server. It isn't on Google Play yet (APP-9). The Wear OS app is a module in this project, with [its own README](wear/).

## Requirements

- JDK 21 (`brew install openjdk@21`).
- The Android SDK: Android Studio, or `brew install --cask android-commandlinetools` then `sdkmanager "platforms;android-37.0" "build-tools;37.0.0" "platform-tools"`.
- `local.properties` in this folder (not committed):
  - `sdk.dir=/Users/you/Library/Android/sdk`.
  - Optional: `lawfive.server=https://lawfive.example.com` to build in another server than the hosted `https://api.lawfive.app` (the sign-in screen's Use another server takes any address anyway).
  - Optional, to sign release builds: `lawfive.keystore=…`, `lawfive.keystore.password=…`, `lawfive.keystore.alias=…`. Make the key once and keep it safe outside the repo, as a phone only takes updates signed with the same key: `keytool -genkeypair -keystore ~/lawfive-release.jks -alias lawfive -keyalg RSA -keysize 4096 -validity 10000`.
  - Optional, for notifications from the server (weather risks, PUSH-5; matches from integrations, NOTE-4) through the [push relay](../../relay/): the values from a Firebase app registered as `app.lawfive` (its `google-services.json`). They identify the app rather than being secret, but stay out of the repo so a fork makes its own. Without them the app works and doesn't offer the setting.

```ini
lawfive.firebase.appId=1:…:android:…
lawfive.firebase.apiKey=…
lawfive.firebase.projectId=…
lawfive.firebase.senderId=…
# Optional: another relay.
# lawfive.push.relay=https://push.example.com
```

## Build and run

From this folder, with `JAVA_HOME` set to JDK 21.

| What | Command |
|---|---|
| Build | `./gradlew :app:assembleDebug` |
| Install on a phone or emulator | `./gradlew :app:installDebug` |
| Release build | `./gradlew :app:assembleRelease` (64-bit ARM only, about 18 MB) |
| Check a Google Play release | `tools/release-check.sh`: the tests, target levels, no local server or tethering built in, distinct phone and watch version codes, and the bundles (`bundleRelease`) |
| Install the release build over USB | `adb install app/build/outputs/apk/release/app-release.apk` |
| Install over Wi-Fi | `tools/wifi.sh` with the phone plugged in once: it switches adb to Wi-Fi and remembers the address in `local.properties`. Later, unplugged, `tools/wifi.sh` reconnects |

The version comes from git (VER-1, `tools/version.sh android`): versionName is the day of the app's last change and versionCode counts its commits, so a newer build always installs over an older one.

An emulator: `sdkmanager "emulator" "system-images;android-37.0;google_apis;arm64-v8a"`, `avdmanager create avd -n pixel9pro -k "system-images;android-37.0;google_apis;arm64-v8a" -d pixel_9_pro`, then `emulator -avd pixel9pro`. The demo server (`pnpm demo` in `server/`) is `http://10.0.2.2:3000` from there. Debug builds allow plain http; release builds only HTTPS.

## Test

| What | Command |
|---|---|
| Unit tests, snapshot tests included | `./gradlew :app:testDebugUnitTest` |
| Wear OS unit tests | `./gradlew :wear:testDebugUnitTest` |
| Snapshot tests alone | `./gradlew :app:testDebugUnitTest --rerun --tests 'app.lawfive.snapshots.*'`, with `-Plawfive.snapshots.only=matches,stats` for some screens |

`FixturesTest` checks every fixture file decodes with the app's models and JSON settings.

### Snapshot tests

Pictures of the main screens from the shared fixtures (`schema/generated/fixtures`), drawn by Android's own code on Robolectric (native graphics) and written by Roborazzi, with no emulator. They're for looking at: every run writes them all, nothing is compared or committed, and a changed picture never fails the build.

- **Where:** `mobile/android/build/snapshots/` (gitignored), as `{screen}__{width}-{theme}-{text}.png`, such as `matches__412-light-1x.png`. The iPhone's use the same screen keys, with widths `iphone17` and `se`, so `tools/snapshot-sheet.mjs` can pair them.
- **Screens:** `matches` (the demo account), `matches-new` (a new account), `match-played` (a match with a track), `settings`, `match-form`, `stats`, `quiz` and `quiz-result`.
- **Variants:** light and dark, 412 and 320 dp wide, font scale 1.0 (`1x`) and 1.3 (`large`), at 2x. Each page is drawn whole, as tall as its content (at least the phone's height).
- **The data:** an in-test server on 127.0.0.1 (`app/src/test/.../snapshots/FakeServer.kt`) answers from the fixtures, through the app's own sync and stores. The clock is stopped at the fixtures' moment (`AppClock`) in their time zone. The test's log lists requests the fixtures don't cover.
- **What differs from a phone:** no status, navigation or tab bar; maps are their empty panel (MapLibre can't run on the JVM).
- **A new screen:** add a `snap(...)` to `ScreenSnapshots.screens()`, with text it waits for and its setup, and the same key in the iPhone's `ScreenSnapshots.swift`.

### Testing the watch through the phone

With Garmin Connect on the phone and the [Garmin app](../../watch-garmin/README.md) on a watch, signed in to the watch's server:

- `adb logcat -s LawFiveWatch` shows what Connect IQ sees at start and each message from the watch.
- `adb shell run-as app.lawfive cat files/watch-relay.json` (debug builds) shows what the phone keeps for the watch.
- To check a watch's message starts the app, go home and `adb shell am kill app.lawfive`.

With the Connect IQ simulator on the emulator (over adb; quirks in [R-11](../../docs/requirements/risks.md)):

1. Add `lawfive.ciq.tethered=true` to `local.properties` (debug builds only), build and install, and sign in to `http://localhost:3000` with `adb reverse tcp:3000 tcp:3000`, so the app and simulator share the server address.
2. `adb forward tcp:7381 tcp:7381`, with the app running.
3. Start the simulator and load a watch test copy *before* connecting (a fresh `SIM_TEST_ID`, see the Garmin README's "Account sync"), then *adb Connection → Start*.
4. Link a watch in the app's More. Linking syncs; `adb logcat | grep AdbConnection` shows the requests.
5. Without signal: `adb reverse --remove tcp:3000`, mark a fee paid on the watch and Sync now. The app keeps it and answers with the matches it fetched last; `adb reverse tcp:3000 tcp:3000` and Sync now in the app sends it.

After no answer, the watch asks for the phone app at most every 10 minutes (`RETRY_MS` in `Phone.mc`; 0 in a test copy retries at once). Remove `lawfive.ciq.tethered` afterward: with it, the app listens to the simulator only.

### Debug launch commands

```bash
adb shell am start -n app.lawfive/.MainActivity --ez watchSync true        # act out a watch handing over matches and a track (APP-16)
adb shell pm grant app.lawfive android.permission.POST_NOTIFICATIONS
adb shell am start -n app.lawfive/.MainActivity --el reminderIn 2700       # a match reminder for a kickoff that many seconds away (APP-6)
adb shell am start -n app.lawfive/.MainActivity --ez dayReminder true      # the day before's reminder for two matches (APP-6)
adb shell appops set app.lawfive SCHEDULE_EXACT_ALARM deny                 # reminders without Alarms & reminders (APP-28); allow to undo
adb shell dumpsys alarm | grep -A3 app.lawfive                             # the reminders' exact alarms
```

What came in from the watch (APP-26): signed in and synced once, save a new match report with a `device` (such as `garmin:venu2`) for one of the account's matches (`PUT /v1/match-records/{id}`), then pull down on Matches. Run the `watchSync` command after to see the sync screen hand over to it. `files/from-watch.json` holds what's waiting.

## How it's laid out

Code is in `app/src/main/java/app/lawfive/`; the API's types are generated into `schema/generated/kotlin/LawFive.kt` (`pnpm generate` in `schema/`).

| Where | What |
|---|---|
| `data/` | The session, the API client, the database (Room: each record's JSON whole, and the outbox) and sync: the outbox up, then `GET /v1/changes` down. A record changed elsewhere gets the phone's changed fields on top of the newer copy. |
| `ui/` | Screens, components and the theme. `ui/theme/Theme.kt` has the website's tokens and grounds: the page is grass, `LfCard` and dialogs are chalk panels (`OnPanel`), boards are near black (`OnBoard`), and the working colors (`colors.text`, `colors.brand`…) follow their ground. The pitch's pieces are in `ui/components/Pitch.kt`. |
| `data/FromWatch.kt`, `ui/screens/FromWatchScreen.kt` | What came in from the watch (APP-26). |
| `data/StatsStore.kt`, `data/StatsMath.kt`, `ui/screens/Stats.kt`, `ui/components/Slab.kt`, `ui/components/BoardCharts.kt` | Stats (STAT-13 to STAT-15), with a tested port of `web/src/stats.ts`, the slab and the charts. |
| `data/Contours.kt`, `ui/screens/Heatmap.kt` | The heatmap (TRK-9), a port of `web/src/contours.ts` tested with its cases (`ContoursTest`). |
| `data/Merging.kt`, `ui/screens/Merge.kt` | Duplicates and merging (DUP-11, DUP-12), worked out by the server. |
| `data/Quiz.kt`, `ui/screens/Quiz.kt` | The quiz (QUIZ-1 to QUIZ-7); `build.gradle.kts` adds `schema/quiz/` to the assets. |
| `Reminders.kt` | Match reminders (APP-6) at the account's times, a day's matches in one notification, as exact alarms with WorkManager when they aren't allowed (APP-28), and `lawFiveNotification`, every notification's look (APP-24). |
| `Notices.kt`, `Push.kt` | Notifications for matches from integrations (NOTE-1 to NOTE-4) and from the server through the relay (PUSH-4, PUSH-5). |
| `data/HealthSave.kt`, `HealthRationaleActivity.kt` | Saving a Wear OS watch's matches to Health Connect, and its rationale page (WCH-7). |
| `watch/` | The Garmin watch through the phone (APP-7): `WatchRelay` answers the watch's sync requests (with signal, using the watch's token; without, from its outbox and the last matches), `WatchBridge` connects to Garmin's Connect IQ SDK, `WatchMessageReceiver` starts the app for a watch's message, `WatchLinker` links a watch (APP-12). |

From the repo root after `pnpm install`, `node mobile/android/tools/icons.mts` makes the Phosphor icons as vector drawables (the Wear OS app's in bold, UI-18), and `node mobile/android/tools/logo.mts` the L5 mark from `web/src/logo.ts`: launcher, launch screen, notification and Wear OS icons, and `ui/theme/LogoShapes.kt`. Rerun it after the mark changes; never edit its output.

Fonts are from Google Fonts (OFL, licenses in `app/src/main/assets/licences`): Barlow, Barlow Condensed and JetBrains Mono, in the weights the website loads. Icons are Phosphor (MIT).

## Pitfalls

- **JDK.** Newer JDKs than 21 are too new for the Android build tools.
- **Release over debug.** Uninstall a debug build before installing the release build; they're signed with different keys.
- **Wi-Fi adb.** The phone forgets Wi-Fi mode when it restarts: plug in and run `tools/wifi.sh` again. With cable and Wi-Fi both connected, adb sees the phone twice; pick one with `adb -s`.
- **Local network.** Android 17 asks before an app reaches the local network (a home server, or the demo); the sign-in screen asks when it can't connect.
- **Force stop.** After it, Android delivers nothing to the app (a watch's message included) until it's opened; use `adb shell am kill` instead.
- **Simulator over adb.** Loading an app or restarting the phone app while connected stops the simulator loading apps until it's restarted (with `pkill` of its `monkeydo` and `shell` helpers too).
