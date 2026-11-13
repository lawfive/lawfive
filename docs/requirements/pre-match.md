# Pre-match (PRE)

The kickoff screens, changing the kickoff team, restarting after a false start, the kickoff direction from the compass, and the coin toss. These work the same on Garmin, Wear OS and Apple Watch and in Try a match; the kickoff direction needs a watch with a compass.

## Kickoff

- **PRE-1** After a match is started, the kickoff screen shows the format, both teams with a score of `0`, and "Who kicks off?" (the same words as extra time's kickoff screen, ET-7).
- **PRE-2** Selecting a team highlights it as the kickoff team and shows a **Start** control.
- **PRE-4** Pressing Start starts the match clock and the recording (ACT-1).
- **PRE-3** **Changing the kickoff team.**
  - Before Start, choosing the other team changes it, and tapping the selected team again clears the choice.
  - Once the match has started, **Change kickoff** in the game menu swaps the team that kicked off, which also decides who kicks off the next period. In extra time it changes the team that kicked off extra time (ET-7). It asks Yes or No first, so a stray tap can't change it.
  - Its sub-label names what it changes, "First kickoff: HOM" ("ET1 kickoff: HOM" in extra time), and the confirmation says "First kickoff to AWY", so in the second half it isn't read as that half's kickoff.
- **PRE-7** At half-time the button reads **End HT** ("End break" for other formats). Pressing it shows the kickoff screen again, titled with the next period (for example "2H kickoff"), with the team due to kick off already selected: the other team from the first kickoff. The referee can change it, then presses Start to begin the period.
- **PRE-5** The other team is shown as the next period's kickoff team automatically (PRE-7), and the referee can change it.
- **PRE-6** **Restart match**, in the game menu during the first period and confirmed, returns to the kickoff screen after an accidental start. It clears the clocks, score and events, and discards the recording so far.

## Kickoff direction

- **PRE-8** **Kickoff direction**, recorded with the compass. It's optional and leaves no trace when not used.
  - It's in the game menu from when the first kickoff team is chosen until the end of the first period. On a kickoff screen, where it's what the menu is opened for, it's the first item, before Coin toss (PRE-9), and the one highlighted when the menu opens on Garmin.
  - The row shows only on a watch with a compass. Connect IQ can't say whether a watch has one, so on Garmin it shows when there's a reading now or this watch has ever given one (WCH-10 for the others).
  - The screen: face the goal the kickoff team attacks, holding the watch up as if reading the time (that points its 12 o'clock, which the compass measures, straight ahead), then press Start/Stop with the other hand or tap Save. A picture shows what that looks like: the goal ahead with its net in the team's color, the arm in front with the watch on it, and a dashed line from its 12 o'clock to the goal.
  - It shows the live compass reading. Without one, Save does nothing and the screen says Back skips it. Once saved, the game menu's row reads "Saved".
  - On the kickoff screens of later regular periods, an arrow turning with the watch points at the goal the team kicking off attacks, labeled "<team> attacks" (in the team's color when it has one). Teams change ends every period and the kickoff alternates, so by default it's the first kickoff's direction; choosing the other team to kick off flips the arrow.
  - The direction is kept for the teams (where HOM attacks), so changing or swapping the kickoff team after saving it (PRE-3) keeps the arrow right. It assumes ends change every period, which is right for halves; for quarters it depends on the competition.
  - Extra time has its own toss, so its direction is recorded again (ET-7).
  - Wear OS and Apple Watch use magnetic north.
  - Accuracy depends on the watch's compass calibration (R-6). Not yet checked: whether a watch set up for the right wrist, with the screen turned over, reads 180° off.

## Coin toss

- **PRE-9** **Coin toss**, in the game menu wherever the Laws call for a toss: before kickoff (whether or not the kickoff team is chosen), on the kickoff screen before extra time, and before a penalty shoot-out.
  - On a kickoff screen it comes straight after Kickoff direction (PRE-8) where that shows, and before the cards. Elsewhere, and on a watch without a compass, it's the menu's first item.
  - It opens a large gold coin showing "H". Start/Stop or a tap flips it. The result is picked at random as the flip starts; the coin spins end over end (squashing to a line and opening on the other face), rises and falls once, slows to a stop over about 1.8 s, lands on the result with one firm vibration, and shows **HEADS** or **TAILS** in large text.
  - A tap or Start/Stop flips again; Back returns to the match.
  - The result isn't stored and doesn't choose the kickoff team, as the toss winner decides ends or kickoff. It's for casual games or a forgotten coin: Law 8 expects a real coin.

## Status

Everything above is built on all three watches and in Try a match. The compass's accuracy on real watches is tracked in R-6.
