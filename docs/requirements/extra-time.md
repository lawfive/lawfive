# Extra time and penalties (ET)

What happens after regular time: the choice of what comes next, extra-time periods with their own toss, the golden goal, and the penalty shoot-out. This works the same on Garmin, Wear OS and Apple Watch; the website and phones show the results.

## After regular time

- **ET-1** When the last regular period ends and extra time or penalties are switched on, the watch asks what comes next: **Extra time** (if on and not yet played), **Penalties** (if on) and **End match**.
  - The screen is titled with the period just ended ("AFTER 2H"; "FULL TIME" after a match's one period, SET-16).
  - The likely choice is highlighted: extra time (or penalties without extra time) when the score is level, otherwise End match. Start/Stop takes the highlighted choice.
  - Every choice can be tapped, and all are in the game menu, as a two-legged tie can need extra time despite an uneven score. End match asks for confirmation.
  - After extra time, the same screen offers Penalties or End match.
  - Cards can still be given: Up/Down or swipes open the team controls.

## Extra time

- **ET-2** Extra time is played as its own periods (2 × 15 minutes by default), labeled ET1 and ET2, with the same clocks, alerts, stoppage and kickoff screens as regular periods. The break before extra time and between its periods is the break between periods (SET-2). There's no halfway break in extra time.
- **ET-7** **Extra time has its own toss.** The Laws call for a new toss before extra time, so the watch doesn't guess who kicks off.
  - The break before it says "New toss for kickoff" instead of a team.
  - ET1's kickoff screen starts with neither team selected and "Who kicks off?" (as the first kickoff screen, PRE-1), with no Start until one is chosen (a tap on a team, or Up/Down on Garmin).
  - ET2 goes to the other team, already selected, as the second half does (PRE-7).
  - Change kickoff (PRE-3) during extra time changes extra time's kickoff team, not the match's.
  - The kickoff direction (PRE-8) can be recorded again: it's in the game menu on ET1's kickoff screen once its team is chosen (first, before Coin toss), and during ET1, for the team kicking off ET1. ET2's kickoff screen then shows the arrow, with the ends changed.
  - The first period's direction is kept as it was and is the one sent to the server; extra time's stays on the watch.
- **ET-6** **Golden goal**, switched on per match with extra time (in Create match and the website's and phones' forms and templates; off by default).
  - A goal in an extra-time period records as usual, then the watch shows "Golden goal" and "<team> win" with **End match** and **Undo** pills.
  - End match finishes the match as full time does. Undo removes the goal and the period carries on from where it was, as if it hadn't been scored.
  - With no goal in extra time, penalties follow as usual (ET-1).
  - The full-time screen and reports say "on a golden goal" ("2-1 HOM v AWY (golden goal)"); the watch's narrow history list says "(GG)".
  - There's no silver goal.

## Penalties

- **ET-3** **Penalty shoot-out.**
  - First the referee picks the team kicking first: tap a team, or Up/Down, then Start.
  - For each kick the screen shows whose it is ("Kick 3: AWY") with **Scored** and **Missed** pills, and the teams alternate. Tap a pill, or move the highlight with Up/Down and press Start/Stop.
  - The shoot-out tally replaces the score, with each team's kicks as dots under it (filled for scored, hollow for missed). There are no player numbers.
  - Undo last event in the game menu removes the last kick. Cards are given from the game menu.
- **ET-4** The watch decides the shoot-out. Within the first five kicks each, a team wins as soon as the other can't catch up; after that it's sudden death, won in the first round where one team scores and the other doesn't. The watch then shows "<team> win" and an **End match** pill.
- **ET-5** The full-time screen and the match history show the shoot-out score ("3-0 on penalties"; "1-1 HOM v AWY (3-0 p)"), and each kick is in the event list.

## Status

Everything above is built on all three watches, and the golden goal on the website and both phones too.

Not built yet:
- The golden goal and extra time's kickoff direction haven't been checked on a real watch (R-6, R-13).
