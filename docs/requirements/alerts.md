# Alerts (VIB)

The watch's vibrations during a match (full time, added time, stoppage reminders, breaks and sin bins) and how a button press silences them. They work the same on Garmin, Wear OS and Apple Watch and in Try a match, checked by the shared cases in [`schema/match-cases/alerts.json`](../../schema/match-cases/alerts.json).

## The alerts

- **VIB-1** **Full time.** When the match clock reaches the period's length, the watch vibrates in an on/off pattern. Whether it repeats depends on stoppage:
  - **Without stoppage tracked** (TMR-10), it repeats every 10 s (configurable) until acknowledged or the period is ended, as it's the only signal that time is up.
  - **With stoppage tracked and stoppage time in the period** at the length (a stoppage recorded, one running, or added time put on with Adjust added time), it vibrates once and needs no press: added time is starting, and the added time alert (VIB-7) comes when that's over. A press after it isn't taken as a silence, so Start/Stop starts a stoppage straight away (VIB-6).
  - **With stoppage tracked but no stoppage time** then (a total of 0:00), it repeats until acknowledged, as without stoppage tracked, and stands for VIB-7 in that period: a stoppage started after it brings no added time alert, as the time was already up. Added time put on with Adjust added time (TMR-14) still brings VIB-7 when it's used up.
  - On a clock that stops (TMR-15), which has no added time, it always repeats until a press.
  - Which of these applies is decided as the length is reached and saved with the match, so the app starting again, Undo or Adjust added time afterward don't change it: one vibration given stays given, even if the added time is then taken back to 0:00. A clock put back before the length (TMR-14) gives the alert again, decided afresh when the length comes.
  - With the added time alert switched off but stoppage time at the length, full time is still one vibration.
- **VIB-7** **Added time used up**, with stoppage tracked (TMR-10). Once the period's length has passed, when the added time (the stoppage total, TMR-3) has run out as well, the watch vibrates in a pattern of its own, repeating every 10 s (configurable) until acknowledged or the period is ended.
  - In a 45-minute half with 2:00 of stoppage, the full-time alert (VIB-1, one vibration) comes at 45:00 and this one at 47:00. A stoppage during added time moves it later, as Law 7 adds that time too.
  - It comes once a period, only when there's stoppage time, and is on by default.
  - With no stoppage time when the length was reached, full time repeats instead (VIB-1), and this alert comes only for added time put on afterward with Adjust added time, not for a stoppage started after it.
- **VIB-2** **Stoppage reminder**, with stoppage tracked (TMR-10): while a stoppage runs, a pulse every 10 s (configurable).
- **VIB-3** **Break over**: one long vibration when the break clock reaches zero, then nothing.
- **VIB-4** **Halfway break due** (TMR-7): a repeating pattern, at the same interval as VIB-1, until the break is started or skipped. Silencing it with another button (VIB-6) stops the vibration but leaves the break due.
- **VIB-8** **Sin bin over** (EVT-12): three short pulses, repeating every 10 s (configurable) until a button. On by default. With it off, "can return" still waits for a button.

## Settings and silencing

- **VIB-5** Each alert can be turned on or off in settings: Settings → Alerts on the watch (full time is "End of each period"), though on Garmin Sin bin over is in the phone settings. Garmin's phone settings also set the repeat interval ("Repeat full-time and break alerts every (seconds)"). The lightning countdown's vibration (TMR-13) follows the break alert's switch.
- **VIB-6** **Silencing.** Pressing any button acknowledges a repeating alert, and that press only silences it, so the referee can't trigger an action by accident. The exceptions:
  - While a halfway break is due, Start/Stop starts the break (TMR-7) rather than only silencing.
  - Back (and Menu) silences the alert and opens the game menu in the same press, as opening a menu does nothing by itself. This is on Garmin and Wear OS; Apple Watch has no Back button the app handles, and its swipe to the game menu doesn't silence an alert.
  - With stoppage time at the length, full time's single vibration (VIB-1) leaves nothing waiting, so the next press does what it always does: Start/Stop starts a stoppage. With no stoppage time then, full time repeats, and the first press only silences it.
  - The press that wakes a Garmin's screen still silences an alert (INP-11).

## Status

Everything above is built on all three watches and in Try a match.

Not built yet:
- Full time's one vibration or repeat (VIB-1) has been checked only by the shared cases and tests, not on a real watch.
