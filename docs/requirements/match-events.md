# Match events (EVT)

What the referee records during a match: goals, cards, sin bins, injuries, stoppages and an abandoned match. Everything here works the same on every watch (Garmin, Wear OS, Apple Watch) and in Try a match, and is checked by the shared match cases in [`schema/match-cases/`](../../schema/match-cases/).

## Goals and cards

- **EVT-1** Goals, yellow cards and red cards are recorded with the team, period and match clock time.
- **EVT-2** A goal updates the score on the screen.
- **EVT-3** **The player number.** After a goal or card the watch asks for the player's number, tens then ones (UI-8): always for a card, and for a goal unless the match doesn't record scorers (EVT-10). Numbers are never required: dismissing the prompt, or OK at `00`, records the event without one.
  - Buttons: Up/Down change the digit; Start moves on, then confirms; Back on the second digit returns to the first, and on the first dismisses.
  - Touch: swipe up or down changes the digit, tap a digit to select it, tap the OK / No number pill to confirm (EVT-9).
- **EVT-9** **Against stray touches** (rain, sweat, sleeves), the first tap on the OK / No number pill only arms it, turning it white with "Tap again"; a second tap within 3 s records the event. Any other input, or 3 s without one, disarms it. Start/Stop still confirms with one press. A full touch lock is INP-12.
- **EVT-10** **Record goal scorers**, per match, on by default (Create match, the phone settings, templates and formats; carried by Same as last). When off, a goal is recorded with no number. Cards always ask, as a second yellow is found by the number. A format saved without this setting counts as on.
- **EVT-8** **Goal types**, per match, off by default. When on, Goal offers **Goal**, **DFK** (direct free kick), **Penalty** and **Own Goal**, before the player number. The goal counts for the team it was recorded under; for an own goal the number is the player who put it in. The event list shows "Own goal HOM #4", "Pen goal AWY #9", "DFK goal AWY #10".
- **EVT-7** **Cards outside play.** Cards can be given whenever the match is open: before kickoff, at half-time (the next kickoff screen included) and after full time, before leaving the match. Goals only during play.
  - They're listed as "Before kickoff", "Half-time" or "After full time", count toward second yellows, and after full time are added to the saved match.
  - Swiping down or up opens the home or away card menu in every phase. As swipes aren't obvious at a break, the game menu also has "Card for <team>" at breaks, on the kickoff screens, at the choice after regular time and in the shoot-out. After full time, Up/Down open the card menus.

## Send-offs

- **EVT-5** A second yellow for the same numbered player on the same team counts as a sending-off; the event list shows both yellows, the second marked as a sending-off. Cards without a number can't be matched.
- **EVT-6** A second yellow brings up a full red screen naming the team and number, with a strong vibration, reminding the referee to show the red card. It stays until a button or tap.

## Sin bins and card reasons

- **EVT-12** **Temporary dismissals** (sin bins), a format setting: **Sin bins**, off by default, with a length of 1–20 minutes (10 by default). It's in every watch's Create match and Quick match and the website's and phones' formats and templates, and is carried by Same as last and planned matches.
  - **Sin bin** sits above Yellow card on every team menu, then the player number. It can be given whenever a card can, except in the shoot-out and after full time.
  - It runs on time played: it waits through breaks and suspensions (TMR-13), carries into the next period and follows Adjust clock (TMR-14). One given before kickoff or at a break starts at the next kickoff.
  - **With stoppage tracked (TMR-10) it holds while a stoppage runs**, as IFAB's guidelines for temporary dismissals include time lost to stoppages. One given during a stoppage starts when it ends. The halfway break holds it only when it counts as stoppage (TMR-12). Adjust added time doesn't move it, unless it takes back more than the earlier stoppages and so shortens the one running.
  - The running screen shows a yellow outlined pill, "AWY 7 4:12", for the one ending first, with "+1" for each other (UI-1).
  - When one ends, "AWY #7 can return" stays up until a button, which does nothing else (VIB-6, VIB-8). Waiting returns survive a restart of the app.
  - A second sin bin for the same number is a send-off, with the red screen (EVT-6). A sin bin and a caution don't combine. A red card, second yellow or second sin bin ends the countdown with no return. Undo takes one back (INP-6).
  - The match pages and report show them (a yellow card with an hourglass; a second, half and half). Edit result handles them for players, with the caution codes (RES-6), and the discipline stats count them (STAT-7).
- **EVT-14** **Card reasons**, a watch setting in Settings → Controls (and Garmin's phone settings), off by default. After a card's number or an official's role, the watch lists the misconduct codes of the match's scheme (the competition's, else the account's, DATA-6; IFAB's before a sync or when not linked), each with a short meaning, No reason first.
  - Cautions, second cautions, sin bins and officials' cautions offer the caution codes; a send-off offers the send-off codes, without the second caution's.
  - The card is recorded first, so it's never lost; Back means No reason. A second caution's red screen follows the list.
  - The upload carries the codes beside the events, so a server without this still takes the match. Garmin's History list doesn't show codes.

## Officials, injuries and substitutions

- **EVT-15** **Cards for team officials**: **Team official** after Red card in the team menu, then Yellow card or Red card, then the role (Head coach, Assistant coach, Other) in place of a number. At any time, as a player's card (EVT-7). Officials aren't matched, so two cautions never send one off automatically. Listed as "Yellow HOM head coach"; undone as other cards.
- **EVT-16** **Injuries**: **Injury** after Team official in the team menu, then the player number (none allowed). During play with stoppage tracked, it starts a stoppage unless one is running. No treatment timer. Undo takes back the injury and leaves its stoppage running. The server records it with the stoppage's length, and the match report shows it (DATA-6).
- **EVT-13 (Later)** Substitutions and team rosters, together.

## Stoppages and abandoning

- **EVT-4** With stoppage tracked (TMR-10), each stoppage is recorded with its start and length, so the record shows how the added time built up.
- **EVT-11** **Abandon match**, last in the game menu once a match is under way (before, it's Cancel match), asks why (weather, lightning, crowd trouble, not enough players, other), then Yes or No. The score stands, full time says ABANDONED, the reason is in the event list, and the match goes up as abandoned. The website and phones show it, and Stats counts it as a game.

## Status

Everything above is built on all three watches and in Try a match.

Not built yet:

- Substitutions and team rosters (EVT-13, Later).
