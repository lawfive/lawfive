# LawFive: Garmin watch app

The Garmin Connect IQ app (Monkey C) for running a soccer match: match, stoppage and break clocks; goals, cards and sin bins; extra time and shoot-outs; a coin toss and kickoff direction; a Garmin soccer activity with GPS and the referee's own track; and sync with a LawFive account, directly or through the Android app. It installs over USB; it isn't in the Connect IQ Store yet.

What it should do is in [docs/requirements/](../docs/requirements/README.md) (the screens in [match-screen.md](../docs/requirements/match-screen.md)); code comments reference its IDs, such as `TMR-7`. How it fits with the rest of LawFive is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), and the kickoff direction picture shared with the other watches in [DESIGN.md](../DESIGN.md#kickoff-direction-picture).

## Requirements

- **Connect IQ SDK 9.3.0** and the targets' device profiles, from the SDK Manager. The active SDK path is in `~/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg`.
- **Java** for the compiler (OpenJDK 27 works).
- **VS Code** with Garmin's "Monkey C" extension, its `monkeyC.developerKeyPath` pointing at your developer key. Keep the key outside the repo: the scripts look for `$HOME/.lawfive/garmin/developer_key` (a link works), or `SIM_KEY`. Back it up: without it you can't publish updates to an app already in the Store.

## Build and run

From this folder, with these set first:

```sh
SDK="$(cat "$HOME/Library/Application Support/Garmin/ConnectIQ/current-sdk.cfg")"
KEY="${SIM_KEY:-$HOME/.lawfive/garmin/developer_key}"
```

| Task | Command |
|---|---|
| Build for one watch (strict type checks) | `"$SDK/bin/monkeyc" -f monkey.jungle -d fr965 -y "$KEY" -o bin/LawFive.prg -l 3` |
| Build every target (release package) | `"$SDK/bin/monkeyc" -e -r -f monkey.jungle -y "$KEY" -o bin/LawFive.iq -l 3` (expect "46 OUT OF 46 DEVICES BUILT": regional variants make 28 models into 46 builds) |
| Run in the simulator | `open "$SDK/bin/ConnectIQ.app"`, then `"$SDK/bin/monkeydo" bin/LawFive.prg fr965` |
| Build, load and switch the simulator to a watch | `tools/sim/run.sh venu3` (the simulator has no device menu; loading the app for a device switches it) |
| Install on a real watch over USB | `tools/device/install.sh venu2` (your watch's exact model id) |
| Unit tests | `"$SDK/bin/monkeyc" -t -f monkey.jungle -d fr965 -y "$KEY" -o bin/LawFive-test.prg -l 3`, then `"$SDK/bin/monkeydo" bin/LawFive-test.prg fr965 -t` (with the simulator running) |

`install.sh` copies the release build to `GARMIN/APPS`; it needs `brew install libmtp`, with OpenMTP and Garmin Express closed. A sideloaded app gets no phone settings, only defaults (R-9); `--server https://lawfive.example.com` builds your own server in (SYNC-8), and `--test-matches` queues two made-up finished matches with tracks, once, for trying a sync. Its version comes from git (VER-1, `tools/version.sh watch`, with `+` for uncommitted changes), shown in Settings → About; other builds say `dev`.

The device IDs used most are `fr965` (5 buttons and touch), `venu3` and `venu2` (2 buttons and touch). All targets are in [manifest.xml](manifest.xml).

## Test

Unit tests cover the match logic. The rules every watch shares are the shared match cases (`schema/match-cases/`), played through `Match.mc` (WCH-2; `pnpm test:watches` from the repo root). Screens and input need the simulator.

### In the simulator

Source [tools/sim/sim.sh](tools/sim/sim.sh) in bash (in zsh its repo path is wrong):

```sh
source tools/sim/sim.sh
sim_build_tools                                    # once: compiles the Swift helpers into bin/tools
prg=$(sim_testcopy venu3 periodMin=1 midBreak=true midBreakMin=0.25)   # separate app id, short timings
sim_run "$prg" venu3                               # load it; app output goes to bin/sim.log
sim_shot bin/shot.png                              # screenshot of the simulator window only
sim_key 36                                         # Start/Stop (53 = Back, 126/125 = Up/Down)
sim_tap 690 398; sim_drag 690 380 690 560          # tap / swipe down, in screen points
```

- Use a test copy: its own app ID leaves the real app's settings, match and history alone.
- After unit tests the simulator often goes blank. Quit it (`pkill -f ConnectIQ.app/Contents/MacOS/simulator`) and `sim_run` again.
- The first key after loading an app is often dropped. Send a harmless one first (`sim_key 56`), and screenshot before acting on a menu position.
- `sim_bounds` gives the window position. A full-size capture is 2× the window's points, and the watch image starts below the 28-point title bar.
- To debug input, add `System.println` to the test copy only and read `bin/sim.log` (don't truncate it while the simulator writes).
- The tools need macOS Screen Recording and Accessibility permission for VS Code. Key presses, taps and drags bring the simulator forward and briefly move the mouse.

### Account sync

Run the demo server (`pnpm demo` in `server/`, `pnpm dev` in `web/`) and a test copy pointed at it:

```bash
bash -c 'source tools/sim/sim.sh; sim_run "$(sim_testcopy fr965 serverUrl=http://localhost:3000)" fr965'
```

- Turn off *Settings → Use Device HTTPS Requirements* to reach `http://localhost`, and back on afterward.
- Link account, then enter the code at http://localhost:5173/link as `demo@lawfive.dev` / `lawfive-demo`. The demo forgets everything when it restarts.
- The simulator's text entry takes no typing from the Mac keyboard, so set the server with `serverUrl=` as above.
- For a track (TRK-7), play a GPX file in *Simulation → Activity Data* and set *Settings → Set GPS Quality* to Good before kickoff (no heart rate from GPX).
- Through the Android app instead (APP-7): [mobile/android/README.md](../mobile/android/README.md#testing-the-watch-through-the-phone).
- Failures show as codes: -1001 not HTTPS, -400 an unreadable response, -104 no phone connection, 401 unlinked, 404 a route the server doesn't have (an older server).

### On a real watch

[TESTING-ON-A-WATCH.md](TESTING-ON-A-WATCH.md) is a checklist for one session on hardware, covering what [R-6](../docs/requirements/risks.md) says needs a real watch.

## How it's laid out

### Source files

| File | What it holds |
|---|---|
| [LawFiveApp.mc](source/LawFiveApp.mc) | Entry: loads a saved match, runs the 1-second tick, manages GPS, saves the activity on exit. |
| [Match.mc](source/Match.mc) | The match model: phases, clocks, breaks, alerts, events, saving. All match rules live here. |
| [MatchView.mc](source/MatchView.mc), [MatchDelegate.mc](source/MatchDelegate.mc) | The match screen for every phase, and its buttons, taps and swipes. |
| [TapAwareDelegate.mc](source/TapAwareDelegate.mc) | Base input handler separating Start/Stop from taps (see Pitfalls). |
| [Wake.mc](source/Wake.mc) | Whether a Back press is the one waking the screen (INP-11). |
| [Home.mc](source/Home.mc) | Menus before and after a match: start menu, Matches, Settings, History, menu icons (UI-15 to UI-19). |
| [Menus.mc](source/Menus.mc) | Team, game and event menus (INP-3), number entry, send-offs, confirmed actions. |
| [Setup.mc](source/Setup.mc) | Create match, Same as last match, Team colors. |
| [MenuStyle.mc](source/MenuStyle.mc) | The custom team menu (`TeamMenuItem`) and system menus (`systemMenu`); teams as kits (`drawTeamKit`, UI-10); the time of day (`drawTimeOfDay`, UI-25). |
| [ConfirmView.mc](source/ConfirmView.mc) | Confirmations with Yes / No pills. |
| [Alerts.mc](source/Alerts.mc) | Vibration patterns, keeping the screen on (UI-12). |
| [Compass.mc](source/Compass.mc), [CoinToss.mc](source/CoinToss.mc) | Kickoff direction (PRE-8) and the coin toss (PRE-9). |
| [Recorder.mc](source/Recorder.mc) | The soccer activity, paused at half-time. |
| [History.mc](source/History.mc) | The last 10 finished matches. |
| [Pitch.mc](source/Pitch.mc) | Marking a pitch's corners from averaged GPS (TRK-13). |
| [Sync.mc](source/Sync.mc), [SyncView.mc](source/SyncView.mc) | Account sync (token, downloads, outbox, fees, pitch corners) and its screen (UI-26). |
| [Phone.mc](source/Phone.mc), [PhoneLink.mc](source/PhoneLink.mc) | Requests through the Android app when it answers, else through Garmin Connect (APP-7); being linked by the phone (SYNC-13). |
| [TrackLog.mc](source/TrackLog.mc) | The match's own track (TRK-7): GPS and heart rate each second, in 5-minute chunks. |
| [Link.mc](source/Link.mc), [Server.mc](source/Server.mc) | Link account's code, and choosing the server (SYNC-9, checked against `/v1/meta`). |
| [Settings.mc](source/Settings.mc), [Screen.mc](source/Screen.mc) | Phone settings and a new match's setup (`matchSetup`); the match screen's four choices (UI-21 to UI-24). |
| [Util.mc](source/Util.mc) | `Clock.nowMs()`, time formatting, `Colors`. |
| [MatchTests.mc](source/MatchTests.mc) | Unit tests (`(:test)`), helpers marked `(:debug)`. |
| [Misconduct.mc](source/Misconduct.mc), [MatchCases.mc](source/MatchCases.mc) | Generated by `pnpm generate` in `schema/` from `schema/misconduct/` (EVT-14) and `schema/match-cases/`. Don't edit. [MatchCasesTests.mc](source/MatchCasesTests.mc) plays the cases. |
| [tools/device/](tools/device/) | `install.sh`; `mtpput.c`, the copy helper (libmtp's `mtp-sendfile` can't find folders on the Venu 2); `add-test-matches.sh` and `TestMatches.mc` for `--test-matches`. |
| [tools/fonts/](tools/fonts/) | The small time-of-day font ([its README](tools/fonts/README.md)). |
| `resources/drawables/launcher_icon.svg`, `resources-launcher-*/` | The app icon (UI-14), made from `web/src/logo.ts` by `pnpm icons` in `web/`. Don't edit. Each `resources-launcher-<size>` PNG is given to its watches in `monkey.jungle`; a watch missing there gets the SVG scaled, and a release build warns "The launcher icon ... isn't compatible". |

### The match model

- **Phases.** `PHASE_PRE`, `PHASE_READY`, `PHASE_RUNNING`, `PHASE_BREAK`, `PHASE_DONE`, `PHASE_NEXT_KICKOFF`, `PHASE_DECIDE` (extra time, penalties or end), `PHASE_PENALTIES`, `PHASE_GOLDEN` (ET-6). The phase is saved as a number, so **only append** to the enum.
- **Extra time** is periods after the regular ones (`period >= numPeriods`, `isExtraTime()`), with its own length (`currentPeriodSec()`) and the same break phases. Its own toss (ET-7) sets `etKickoff` (-1 until chosen) and `etHomeHeading`, used by `kickoffFor()` and `attackHeading()` from ET1 on.
- **Clocks from timestamps.** Clocks come from stored start times (`periodStart`, `stoppageStart`, `breakEnd`) and `Clock.nowMs()`, never from counting ticks, so a match resumes correctly after a restart (TMR-8).
- **The tick.** `Match.tick()` runs each second: it makes breaks due, ends them and fires at most one vibration. While suspended (TMR-13) only the lightning countdown runs. A sin bin (EVT-12) counts time played (`playedMs`), then waits in `sinBinReturns` for a button.
- **The stopping clock (TMR-15).** With `stoppingClock`, `matchMs` is the time since kickoff less the stoppage clock (`stoppageTotalMs`), held at the period's length, with no added time. A stoppage starts with Start/Stop, an injury, the halfway break (per `breakStoppage`) and, with `stopForGoalsCards`, a goal or card.
- **Saving.** The match is written to `Application.Storage` key `"match"` on every change. Other keys: `"history"`, `"lastFormat"`; for sync `"authToken"`, `"syncedMatches"`, `"outbox"`, `"lastSync"`, `"linkedServer"`, `"server"`; `"compassSeen"` (PRE-8); for the track `"trackState"`, `"trk<created>_<n>"` and `"trackOutbox"`.
- **Configuration is copied.** A match is built from a setup dictionary (`Settings.matchSetup`) holding the [MATCH_CONFIG.md](../docs/MATCH_CONFIG.md) fields, so changing settings never alters a match in progress. Unused fields go in `details`. Newer keys load with defaults (`numberOr`, `booleanOr`, `stringOr`), so older saved matches still load.
- **Events** are `[type, team, period, matchSeconds, player, durationSeconds]`. Types: `G` goal (`GO`, `GP`, `GF` own, penalty, direct free kick, EVT-8); `Y`, `Y2` (second yellow), `R`; `S` stoppage; `E` period end; `PG`/`PM` shoot-out kicks; `CK`/`CA` clock or added time corrected (TMR-14); `SB`/`SB2` sin bins (EVT-12); `SU`/`RS` suspended and resumed (TMR-13). The last place holds a change, length, reason or seconds as the type needs. A card's reason code (EVT-14) is a seventh field on the watch, uploaded beside the events as `misconduct` so older servers still take the match. Outside play, `matchSeconds` is `-1` before kickoff, `-2` at a break, `-3` after full time, `-4` in the shoot-out.
- **Account sync** (SYNC-1 to SYNC-13). The server is the one the watch linked with (`"linkedServer"`, so a changed `serverUrl` can't send its token elsewhere, SYNC-2); before linking, the one chosen on the watch, else one built in, else `serverUrl`. Get a code calls `POST /v1/auth/device/code` (client `lawfive-garmin`) and polls `/v1/auth/device/token`. Requests send `Authorization: Bearer` and `X-LawFive-Device: garmin; model=<part number>; firmware=<version>` (SYNC-10). A sync uploads the outbox (`POST /v1/watch/records`), then tracks a chunk at a time (`POST /v1/watch/tracks`), then downloads the next 10 matches (`GET /v1/watch/matches`).

### Phone settings

Edited in the Garmin Connect app, or in the simulator under *File → Edit Persistent Storage → Edit Application.Properties*. Many are also in the watch's Settings.

| Key | Default | Meaning |
|---|---|---|
| `homeName`, `awayName` | blank | A planned match's teams |
| `homeAlias`, `awayAlias` | blank | Short names, up to 4 characters; blank is the first 3 letters (SET-5) |
| `homeColor`, `awayColor` | blank | Team colors as hex, `#C8102E` (UI-10) |
| `numPeriods`, `periodMin`, `halftimeMin` | 2, 45, 15 | Format; minutes can be fractions (22.5); 1 to 4 periods (SET-16) |
| `teamSize` | 11 | Stored with the match only |
| `midBreak`, `midBreakMin` | off, 2 | A break halfway through each period |
| `extraTime`, `etPeriods`, `etPeriodMin` | off, 2, 15 | Extra time (ET-2) |
| `goldenGoal`, `penalties` | off | Golden goal (ET-6), shoot-out (ET-3) |
| `sinBins`, `sinBinMin` | off, 10 | Sin bins, 1 to 20 minutes (EVT-12) |
| `trackStoppage` | off | Stoppage clock; off, Start/Stop opens the game menu (TMR-10) |
| `clockKind`, `stopForGoalsCards` | 0, on | 0 runs on, 1 stops when play stops; and whether goals and cards stop it (TMR-15) |
| `breakStoppage` | on | The halfway break counts as stoppage (TMR-12) |
| `goalScorers`, `goalTypes` | on, off | Ask the scorer's number (EVT-10), and the goal's type (EVT-8) |
| `screenClocks` | -1 | 0 one clock, 1 two stacked, 2 side by side (UI-21); -1 until set once from the older `faceLayout` (`Screen.migrate`, UI-24) |
| `mainClock`, `secondClock` | 2, 0 | 0 Match time, 1 Each half from 0, 2 Time left (TMR-11); never the same (UI-22) |
| `breakClock` | 0 | 0 time left, 1 time taken (TMR-4) |
| `screenEdge` | 2 | 0 neither, 1 the ring (UI-23), 2 the time of day (UI-25) |
| `screenNames` | on | Team names over the clock; off for scores only |
| `faceLayout`, `clockStyle` | 0 | Older layout settings, read once into the choices above |
| `alertRepeatSec`, `stoppageReminderSec` | 10, 10 | Repeat interval for repeating alerts (VIB-1, VIB-7); stoppage reminder interval (0 off) |
| `vibeFullTime`, `vibeAdded`, `vibeSinBin`, `vibeStoppage`, `vibeBreak` | on | Each alert on or off |
| `tapStoppage` | off | A tap starts or ends a stoppage |
| `cardReasons` | off | A Reason list after a card's number (EVT-14) |
| `touchLock` | off | Only buttons work during play (INP-12); watches with Up and Down only (`Settings.hasTeamButtons()`) |
| `stoppageLabel`, `breakLabel` | stoppage, break | Timer names in the menus |
| `serverUrl` | https://api.lawfive.app | The server to link to (SYNC-2), for self-hosting; takes effect at the next link |
| `recordTrack` | on | Keep GPS and heart rate for LawFive while linked (TRK-7) |
| `syncOnOpen` | on | Sync when the app opens (UI-16) |

## Pitfalls

- **Touch watches deliver input twice.** A tap arrives as Select, then as `onTap` if `onSelect` returns false. Start/Stop arrives as a key and Select in the same millisecond. `TapAwareDelegate` handles Start/Stop in `onKey` and taps in `onTap` and ignores the extra Select; new screens taking both should extend it.
- **Simulator keys.** Esc (Back) skips `onKey` for `onBack`, so anything that must see every press (silencing alerts) also checks `onBack`, `onMenu` and `onSelect`. Venu simulators still send Up/Down from the arrow keys, though real Venus have no such buttons; use the mouse.
- **Shared simulator storage.** Watch models share storage per app ID, so a match started on `venu3` resumes on `venu2`. Unit tests use real storage: they clear the match (`cleanUp`) and restore `"history"` and `"lastFormat"` when they change them.
- **Strict typing (`-l 3`).** Storage values need the exact storage types (see the `MatchData` typedef). Cast `String.substring`'s nullable result. Call `Menu2` items' `getSubLabel` only on items that have one. Test helpers must be `(:debug)`. `alias` is a keyword. Cast values from storage or a setup dictionary before comparing (`setup["x"] as Boolean`).
- **Menu icons must be drawables.** An `IconMenuItem` given a bitmap crashes ("Symbol Not Found", no stack); `MenuIcon` (Home.mc) wraps it. A drawable is drawn into its own area at (0, 0), so center it in `dc.getWidth()` × `dc.getHeight()` (see `ColorSwatch`). The icons are black SVGs in `resources/drawables/icons`, scaled to 6% of the screen without dithering, on a green circle.
- **Venu has no Down button.** System menus there scroll the focused row to the top, hiding rows above, so lists open at the top without `BUTTON_INPUT_DOWN` (`listFocus` in Setup.mc).
- **AMOLED backlight.** `Attention.backlight(true)` throws `BacklightOnTooLongException` once held on too long; catch it (`Alerts.screenOn`).
- **System widgets differ per watch.** `Menu2`, `Picker` and `Confirmation` look different on each (a white panel on Venu 2/3; one Picker digit column at a time). The app draws its own team menu, number entry and confirmations; other menus use `Menu2` (UI-6).
- **Source paths are explicit.** The compiler otherwise scans the whole folder, so `bin/testcopy` breaks the build with "Redefinition of ..." errors. Keep `base.sourcePath` and `base.resourcePath` in [monkey.jungle](monkey.jungle) up to date.
- **Round screens.** Rows near the top and bottom are narrower; `MatchView.rowWidth(y)` gives the usable width, and layouts fall back to a smaller font.
