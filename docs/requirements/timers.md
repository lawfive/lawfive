# Timers (TMR)

The match clock, the stoppage clock and the break clock on the watch. Everything here works the same on every watch (Garmin, Wear OS, Apple Watch) and in Try a match, and is checked by the shared match cases in `schema/match-cases/`.

## The clocks

- **TMR-1** The match clock doesn't stop for stoppages, unless the format's clock stops (TMR-15). How it counts is chosen in the match screen setup (TMR-11, UI-21).
- **TMR-2** At the period's length the match clock keeps counting until the referee ends the period, shown as the length plus the time over it: `45:00 +1:12`.
- **TMR-3** With stoppage tracked (TMR-10), the stoppage clock counts up only while a stoppage runs, and shows the total of the period's stoppages: the added time to signal. It starts at 0:00 each period.
- **TMR-4** The break clock runs for a set length, counting down (**Time left**, the default) or up (**Time taken**), as chosen in the match screen setup (UI-21). Stoppages don't affect it. A countdown to a break still to come always counts down (UI-4).
- **TMR-8** Every clock is worked out from stored start times, not by counting ticks, so the clocks stay right while the screen sleeps and the match carries on correctly if the app closes or crashes.
- **TMR-11** **Match clock style**, set once for the account in the match screen setup (UI-21) and taken at kickoff. For a 2 × 45 match:
  - **Match time** ("0 to 90, like TV"): the second half runs 45:00 → 90:00 and extra time 90:00 → 120:00. Each period starts at its scheduled time, whatever the added time before it.
  - **Each half from 0** ("0 to 45, then 0 to 45 again").
  - **Time left** ("45 down to 0"), the default.

  In every style the clock holds at the period's end with the added time under it (TMR-2), and alerts, breaks and recorded event times are the same. The event list shows match time with Match time ("2H 67:14"), and time within the period otherwise ("2H 22:14").

## Periods and breaks

- **TMR-5** Ending a period that isn't the last starts the half-time break (15 minutes by default). The next period starts only after End HT, then Start on the kickoff screen (PRE-7).
- **TMR-6** Ending the last period ends the match, unless extra time or penalties are on, when the watch asks what comes next (ET-1).
- **TMR-7** **The halfway break** (for drinks or cooling), switched on before the match with a length (2 minutes by default). It comes in each regular period, and none in extra time.
  - When its time is added on as stoppage (TMR-12, or always with a clock that stops, TMR-15), it's due at exactly halfway: 22:30 in a 45-minute half, whatever its length, as it takes none of the period's time.
  - Otherwise it's centered on halfway, due half its length before it: 21:30 for a 2-minute break in a 45-minute half.
  - Until it's due, the break pill counts down to it (UI-4).
  - When it's due, the watch vibrates (VIB-4) and shows a blue "break due" pill, but the break doesn't start, as play may not have stopped.
  - The referee starts it at a natural stoppage, with Start/Stop, by tapping the pill or with Start break, at the top of the game menu while it's due (INP-3). It then runs its full length.
  - Skip break drops it, and a due break not started by the period's end is dropped.
  - End break ends a running break early, keeping the time it took.
- **TMR-12** **Break as stoppage**, per match, on by default, as Law 7 allows for drinks and cooling breaks. It applies only with stoppage tracked and a halfway break. When on, the break's time is added on as a stoppage, with no stoppage reminders (VIB-2) during it, and the break is due at exactly halfway (TMR-7). A stoppage already running when the break starts carries on through it, so the time is counted once. Older matches count as off.
- **TMR-9** Actions that can't easily be put right ask for confirmation (UI-7): ending a period, ending the match, Cancel match, Restart match, Undo and Change kickoff.

## Stoppage time

- **TMR-10** Stoppage tracking is per match, off by default. When off there's no stoppage clock, pill, game menu row or reminder, and tapping for stoppage (INP-4) does nothing. During play Start/Stop then starts a due halfway break or silences an alert, and otherwise opens the game menu (INP-7). Time past the period's length (`45:00 +1:12`) still shows.
- **TMR-16** **The added time left.** From the period's length, the stoppage pill counts down the added time still to play (the stoppage total less the time past the length), so the referee needn't work it out.
  - It holds still while a stoppage runs in added time, as Law 7 adds that too.
  - It reaches 0:00 as the added time alert fires (VIB-7), then shows the time over (`+0:05`).
  - Before the length, the pill shows the total, the figure to signal. The total is also in the game menu and the event list.
  - For every referee, with no setting.

## Correcting and pausing

- **TMR-13** **Suspend and resume**, for a lightning or weather delay after which the match carries on.
  - **Suspend match**, in the game menu during play, asks why (Weather, Lightning, Crowd trouble, Other) and suspends at once. Every clock stops where it is, and recording pauses (ACT-2).
  - The **Suspended** screen shows the score and, for lightning, a 30:00 countdown that vibrates once at zero (**Lightning again** starts it over); otherwise the time suspended, counting up.
  - Cards can be given while suspended, timed where play stopped; goals can't.
  - **Resume** carries the period on from where it stopped, so the delay is neither played nor added time. Abandon (EVT-11) ends the period where play stopped.
  - The record keeps it as a `suspension` event with its length. The match pages and report show "Suspended 34:12 · Lightning", and the track's figures leave the delay out (TRK-3, TRK-9, TRK-14).
  - A match resumed on another day is out of scope: abandon it, then correct the result (RES-2).
- **TMR-14** **Correcting the clock.** During play the game menu has **Adjust clock**, and with stoppage tracked **Adjust added time**.
  - Each asks the right minutes and seconds (UI-8), counted from the period's kickoff whatever the clock style, then confirms the change ("Clock +0:40?"). No change records nothing.
  - Adjust clock moves the period's start, so every clock, the halfway break and the alerts follow; never before 0:00. Adjust added time moves the stoppage total, never below 0:00.
  - Events already recorded keep their times. The correction is recorded as a `clockAdjusted` event, shown as "Clock adjusted +0:40", and can be undone while its period is played (INP-6).
  - A period whose match clock was corrected is left out of the added-time stats (STAT-9).
- **TMR-15** **A clock that stops**, for US high school (NFHS) and college (NCAA) games where the referee keeps the time. A format setting, **Clock**: **Runs on** (the Laws, the default) or **Stops when play stops**, which turns stoppage tracking on.
  - While a stoppage runs the match clock stands still, in orange. Start/Stop stops and starts it, and the game menu's row reads Stop clock and Start clock.
  - There's no stoppage pill, added time, Adjust added time or added time alert. The halfway break always stops the clock.
  - **Goals and cards stop it**, on by default: recording a goal or card stops the clock until Start/Stop at the restart. An injury stops it too (EVT-16).
  - The period ends when the clock reaches its length: the clock holds there and the full-time alert repeats until a press.
  - Events record the clock's time, and sin bins hold while it's stopped (EVT-12).
  - The record says the clock stopped, with each period's time stopped, so the track's figures and replay take in the stops. The match pages and report say so, and never show added time. These matches are left out of STAT-9.
  - Starter formats for it are in SET-17.

## Status

Everything above is built on all three watches and in Try a match.

Not built yet: Wear OS's stopped clock (TMR-15) hasn't been seen in an emulator.
