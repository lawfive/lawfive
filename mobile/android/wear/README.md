# LawFive for Wear OS

The match on a Wear OS watch ([wear-os-and-apple-watch.md](../../../docs/requirements/wear-os-and-apple-watch.md)), in the look in [DESIGN.md](../../../DESIGN.md#wear-os-and-apple-watch). Kotlin and Compose, a module beside the [phone app](../README.md), syncing straight with the server. A match is a Health Services exercise (WCH-7), giving heart rate, location and distance for its track. What still needs checking on a real watch is in [R-13](../../../docs/requirements/risks.md).

## Build and test

From `mobile/android`, with the phone app's requirements:

```bash
./gradlew :wear:testDebugUnitTest      # the match's rules
./gradlew :wear:assembleDebug          # wear/build/outputs/apk/debug/wear-debug.apk
```

On an emulator, make an AVD from the `android-wear` system image with the `wearos_large_round` device. Health Services makes up a run once the app has its permissions:

```bash
adb shell pm grant app.lawfive android.permission.health.READ_HEART_RATE   # and ACCESS_FINE_LOCATION, ACTIVITY_RECOGNITION
adb shell am broadcast -a whs.USE_SYNTHETIC_PROVIDERS com.google.android.wearable.healthservices
adb shell am broadcast -a whs.synthetic.user.START_RUNNING com.google.android.wearable.healthservices
```

The track being recorded is in `files/tracks/current.json` (`adb shell run-as app.lawfive cat files/tracks/current.json`). Mark pitch (TRK-13) uses the emulator's GPS: send `adb emu geo fix <lon> <lat>` every second or so while a corner is averaged.

Debug builds take launch extras for reaching a screen quickly (see `MainActivity.kt`):

```bash
adb shell am start -n app.lawfive/app.lawfive.wear.MainActivity --es server http://10.0.2.2:3000 --es screen 0,0,2,0,1,1 --ez begin true --el ago 2700
```

| Extra | What it does |
|---|---|
| `server` | A server's address |
| `screen` | The match screen's choices, `clocks,mainClock,secondClock,breakClock,edge,names` (UI-21): clocks 0 one, 1 stacked, 2 side by side; clock styles 0 Match time, 1 Each half from 0, 2 Time left; break 0 time left, 1 time taken; edge 0 neither, 1 ring, 2 time of day; names 1 or 0 |
| `syncScreen` | The sync screen at `1` or `2` of 3, or `stopped` (UI-26) |
| `format` | A Quick match format as JSON |
| `begin` | Start a match |
| `phase` | `golden` plays into extra time and scores (a `format` with `goldenGoal`); `et` stops at ET1's kickoff |
| `ago` | Move the period's start that many seconds back |
| `stoppage` | Start a stoppage (with `"stoppingClock":true` in `format`, the clock stands still, TMR-15) |
| `goals` | Add some goals |
| `suspend` (`--ei`), `suspendAgo` (`--el`) | Suspend for a reason's number (1 lightning, TMR-13), that many seconds back |
| `sinBins` | `team,player,secondsAgo;…` (team 0 home, 1 away, player 0 for none), with `"sinBins":true` in `format` (EVT-12) |
| `cardReasons` (`--ez`) | Card reasons on or off (EVT-14) |
| `heading` (`--ef`) | A made-up compass reading in radians |

## How it's laid out

In `src/main/java/app/lawfive/wear/`:

| File | What's in it |
|---|---|
| `MatchEngine.kt` | The match's rules, with no Android in them; tested by the shared match cases (`MatchCasesTest.kt`, WCH-2) and `MatchEngineTest.kt`. |
| `AppState.kt` | The state the screens and service share; saving and syncing. |
| `Server.kt`, `Store.kt` | The API, and the file everything's kept in. |
| `Compass.kt` | The kickoff direction's compass (WCH-10). |
| `Recording.kt`, `TrackPacking.kt` | Recording a match (WCH-7), and packing the track as the Garmin watch does (TRK-7). |
| `PitchScreen.kt` | Marking the pitch's corners (TRK-13). |
| `Permissions.kt` | The first launch's screen explaining the permissions, then asking for them together, and Settings → Permissions while one is refused (WCH-7). |
| `MatchService.kt` | Alerts with the screen off, and the ongoing activity. |
| `Misconduct.kt` | The misconduct codes for a card's reason (EVT-14), written by `pnpm generate` in `schema/`. |
| `Screens.kt`, `MatchScreens.kt`, `Components.kt` | Before and after a match, the match itself, and the look. |
