# Working on the LawFive Garmin watch app

Garmin Connect IQ (Monkey C). Read [README.md](README.md) for setup, commands, code layout and pitfalls before changing code. Behavior is defined in [../docs/requirements/](../docs/requirements/README.md) (see the root CLAUDE.md for how to keep it up to date). Run the commands below from this folder.

## Before reporting work as done

1. Strict build for one watch: `monkeyc ... -d fr965 ... -l 3` (see the README's "Build and run").
2. Unit tests pass (`monkeyc -t`, then `monkeydo ... -t`). Add tests in `source/MatchTests.mc` for match-logic changes; a rule all the watches share goes in `schema/match-cases/` instead (`pnpm generate` there, then `pnpm test:watches` from the root, WCH-2). Helpers there must be `(:debug)`; tests that finish a match must back up and restore the `"history"` storage key, tests that remember a format must restore `"lastFormat"`, and tests that queue uploads must restore `"outbox"`.
3. Release build for every target: "46 OUT OF 46 DEVICES BUILT".
4. For anything on screen or any input change, check in the simulator on a button watch (`fr965`) and a touch-first watch (`venu3` or `venu2`). Use `tools/sim/sim.sh` and a test copy (`sim_testcopy`) so the real app's data is untouched, then load the real build back afterward (`sim_run bin/LawFive-<device>.prg <device>`).

For sync changes, also run the flow against the demo server (README, "Account sync"); that needs the simulator's HTTPS requirement off, so turn it back on afterward.

## Simulator etiquette

- Tell the user before a run that uses key presses, taps or drags: it brings the simulator forward and moves their mouse. Afterward run `open -a "Visual Studio Code"` to give focus back, unless they're actively looking at the simulator.
- Screenshots (`sim_shot`) are fine at any time and don't take focus.
- If the simulator isn't running, `open -g` it (background), or plain `open` if the user wants to look at it.

## Pitfalls

- Touch input arrives twice (Select + tap; Start/Stop key + Select). Screens that take taps and buttons extend `TapAwareDelegate`.
- Only append to the `MatchPhase` enum; saved matches store the phase as a number.
- The system Menu2, Picker and Confirmation look different on each watch. The app draws its own team and goal-type menus (`TeamMenuItem`, MenuStyle.mc), number entry (`DigitEntryView`) and confirmations (`ConfirmView`); every other menu uses the system Menu2 (UI-6).
- `bin/` holds build output, the test copy and the compiled sim tools; it can be deleted and rebuilt.
- `monkey.jungle` must keep its explicit `base.sourcePath`/`base.resourcePath`; without them the compiler also compiles `bin/testcopy` and fails with "Redefinition" errors.
