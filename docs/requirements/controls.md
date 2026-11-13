# Controls (INP)

How the referee works the watch during a match: swipes for the team controls and the game menu, the buttons, Undo, and the touch lock. This covers Garmin (five-button watches and the Venu), Wear OS and Apple Watch, and Try a match, which copies them; where they differ, the requirement says so.

## Swipes and the game menu

- **INP-2** A swipe down opens the home team's controls: goal (during play only), yellow card and red card. It works in every phase (EVT-7). With sideways team swipes (INP-10), a swipe right opens them instead.
- **INP-1** A swipe up (from the bottom) opens the away team's controls, the same as INP-2. With sideways team swipes, a swipe left opens them instead.
  - With sin bins on, every team menu (in play, outside play and while suspended) is Goal, Sin bin, Yellow card, Red card, then the rest (EVT-12).
- **INP-10** **Team swipes**, set for the account on the website and the phone apps (Settings, under Match screen; not on the watches): **Up and down** (the default; INP-1 to INP-3) or **Sideways**.
  - Sideways: a swipe right (left to right) opens the home team's controls, a swipe left the away team's, a swipe up the game menu, and a swipe down nothing.
  - Garmin and Apple Watch follow the setting, which reaches them at their next sync.
  - Wear OS always swipes sideways, as a swipe down from the top edge opens its quick settings, which an app can't take over.
  - On Garmin touch watches that turn a swipe right into Back (R-1), the drag that comes first tells the swipe from the Back button.
  - The buttons stay as INP-7 has them, and the team controls slide in from the side they're swiped from (UI-9).
- **INP-3** **The game menu** opens with a sideways swipe or the Back button. With sideways team swipes it's a swipe up instead, and Back still opens it (R-1).
  - **During play**, in order: Start break while the halfway break is due (TMR-7), as it's what the menu is opened for then; the period's end (spelled out where the row has room, "End first half", "End half-time", "End extra time 1"; Garmin's are "End 1st half" and "End HT"; "End match" when it ends the match), Start or End stoppage, Skip break while it's due (or End break while it runs), Undo last event, Adjust clock, Adjust added time (with stoppage tracked, TMR-14), Change kickoff, Kickoff direction, Restart match (first period only), Suspend match (TMR-13), Abandon match.
  - **Before kickoff and at breaks**: on a kickoff screen, Kickoff direction first (once the team is chosen, on a watch with a compass), then Coin toss; otherwise Coin toss first where there's a toss. It also holds the choices after regular time (ET-1), and on the kickoff and shoot-out screens the cards and Cancel match or End match.
  - **While suspended** (TMR-13): Resume match, Lightning again (lightning only), Card for HOM, Card for AWY, Undo last event, Abandon match. Wear OS's side button doesn't resume.
- **INP-6** **Undo**: the most recent goal, card, injury, shoot-out kick or, while its period is played, clock correction (TMR-14) can be undone from the game menu, with confirmation (for a goal recorded for the wrong team, say).
  - Only an event in the current period can be undone: while play runs, one recorded since this period's kickoff; at a break, before kickoff, in the shoot-out or after full time, one in the period last played. Otherwise the menu has no Undo row.
  - Shared cases are in [`schema/match-cases/events.json`](../../schema/match-cases/events.json).
  - Earlier events can't be edited on the watch.

## Buttons

- **INP-5** Match actions work with the physical buttons as well as touch, because touch is unreliable in rain and sweat. On watches with fewer buttons (Venu), the essential actions (stoppage, end period) come first for the buttons.
- **INP-4** With stoppage tracked (TMR-10), a physical button always starts and ends a stoppage. Tapping the screen to start and end one is a setting, off by default, because of the risk of stray taps.
- **INP-7** **Button mapping** on Garmin's match screen:

  | Button | 5-button watches | Venu |
  |---|---|---|
  | Start/Stop (top right) | During play: start or end a stoppage when tracked, otherwise the game menu (TMR-10); starts a due break; Start on kickoff screens; End HT at half-time; the highlighted choice after regular time (ET-1) and in the shoot-out (ET-3) | Same |
  | Back (bottom right) | Game menu; leaves the full-time screen | Same; holding it (Menu) also opens the game menu |
  | Up (middle left) | Home team's controls; chooses home on the kickoff and first-kicker screens; moves the Scored/Missed highlight in a shoot-out | None: swipe down (or right with sideways team swipes), or tap the team or pill |
  | Down (bottom left) | Away team's controls; chooses away on the kickoff and first-kicker screens; moves the Scored/Missed highlight in a shoot-out | None: swipe up (or left with sideways team swipes), or tap the team or pill |

  While a repeating alert vibrates, the first press of any button but Back only silences it; Back silences it and opens the game menu (VIB-6). With the screen off, the Back press that turns it on only shows the match screen (INP-11).
- **INP-11** **Back with the screen off only turns it on.** On Garmin, the Back press that turns the screen on shows the match screen without opening the game menu (or leaving the full-time screen), so a second press opens it. It still silences a repeating alert (VIB-6).
  - The press counts as the waking one while the screen is off or dimmed, or turned on less than 0.4 s before. Watches on Connect IQ 5 with an AMOLED or LCD screen report this; older ones keep one press.
  - Start/Stop and Up/Down are unchanged.
  - Wear OS: what a button press does with the screen off is the system's, to check on a real watch (R-13). Apple Watch has no Back button.

## Touch

- **INP-8** On touch screens, starting the match or the next period needs a tap on the green Start pill itself, so a stray tap, or a swipe read as a tap, can't start it.
- **INP-9** A tap never acts as the Start/Stop button, and each Start/Stop press acts once. Garmin touch watches report a tap both as Select and as a tap with a position, and the Start/Stop button both as a key and as Select, so taps are handled only by position.
- **INP-12** **Touch lock**: a setting, off by default, that ignores taps and swipes on the running screen so only the buttons work. It's on watches with enough buttons for a match: **Touch lock** in Settings → Controls (and Garmin's phone settings), whose summary says "Touch lock" when it's on.
  - **Five-button Garmins** (Forerunner, fēnix, epix): while a period is played, the running screen takes no taps or swipes at all, not even to silence an alert or put "can return" away (EVT-12), and a swipe right that the watch sends as Back (R-1) does nothing. Up, Down, Start/Stop and Back work as in INP-7. The menus, number entry and confirmations they open still take touch, as do the kickoff, break, suspended, decide, shoot-out and full-time screens. No lock symbol shows on the running screen.
  - Which Garmins: those that report both Up and Down among their buttons, so a new model needs no list. The Venu watches, whose teams are swipes (INP-5), don't show the row, and their phone setting does nothing.
  - **Apple Watch**: the system's **Water Lock**, turned on each time play's screen shows (at each kickoff, on resuming, and back from a menu or the number entry). The Digital Crown turns it off, and an app can't, so the referee turns the crown to use the screen, and it locks again on the way back to play. watchOS honors it only while the match's workout runs (WCH-7), so with Apple Health refused it does nothing.
  - **Wear OS**: not offered. Its watches have one or two buttons, the second the system's, so a match can't be run by buttons alone (INP-5), and the system's own touch or water lock can't be turned on by an app.
  - **Try a match**: the setting for the five-button Garmin and the Apple Watch, with the crown turning Water Lock off.

## Status

Everything above is built on the watches it applies to and in Try a match.

Not built yet:
- Team swipes (INP-10) and the touch lock (INP-12) haven't been checked on a real Garmin or Apple Watch (R-6).
