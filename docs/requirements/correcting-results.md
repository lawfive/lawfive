# Correcting a result (RES)

What the watch records is a first draft. After full time the referee can correct a played match's result, add misconduct codes the watch didn't ask for, or enter a result for a match refereed without the watch. This is on the website and both phones, with the server keeping the watch's recording.

## Editing and adding

- **RES-1** **Edit result** on a played match's page.
  - It edits the goals (team, period, minute as a referee writes it, 23 or 45+2, player number, goal type), the cautions and send-offs (team, player number or team official, and a misconduct code from the match's scheme: the competition's, else the account's), the shoot-out's kicks, and the outcome (played to full time, or abandoned and why).
  - The misconduct code sets are shown as Laws of the Game, United States and England.
  - The **score is worked out from the goals**, never typed on its own. A goal needs no minute or number to count.
  - Stoppages, suspensions, injuries and the watch's other records stay as they were, and so do the periods, which drive the track's timeline.
  - A minute outside its period is refused, saying so. A minute left as it was keeps the watch's exact second, so saving without changes changes nothing.
- **RES-2** **Add result** for a match refereed without the watch: the same form, offered once a match has been played or its kickoff has passed. Its periods come from the match's format, and a scheduled match becomes played (or abandoned).
- **RES-5** The phones edit and add results the same way, offline like other edits, with the same rules, tested with the same cases as the website's.
- **RES-6** **A second caution is a send-off** (EVT-5). A caution to a numbered player of the same team who was already cautioned in the match becomes a second caution on saving, the form saying so as it's entered, and goes back to a caution when the first is deleted. Sin bins are settled the same way, on their own: a second for the same numbered player is a second sin bin (a send-off), and goes back to a sin bin when the first goes (EVT-12).

## The watch's recording

- **RES-3** **The watch's recording is kept.** The first time a watch's result is corrected, the server keeps it as it was and notes when.
  - The match page says "Edited after the match" with the date, has **Show as recorded** to see the watch's version in place, and **Put back the watch's**, after a confirmation, which clears the correction.
  - The printed report says it was corrected (DATA-6).
  - A result entered without a watch has no recording to keep.
- **RES-4** **A watch can't undo a correction.** A watch sending a match again after it's been corrected (an outbox that stalled, a lost answer) changes nothing, and the watch is told it's saved, so it stops sending it.
- **RES-7** **A match is the format it was played in.**
  - When a watch sends a planned match, the server keeps the format the watch played it in (periods, their length, the breaks, and the halfway break and extra time where the watch says them; what an older watch leaves out stays as planned), as it does for a quick match. Its periods are named and timed from what happened everywhere.
  - A format the match can't hold (a single period) leaves the plan's.
  - For a format changed after the match, and older matches, the website and both phones name the periods from the report: as many periods of normal time as the watch recorded, when that's more than planned or a whole match had fewer. An abandoned match's missing periods follow the plan. All three share the same cases.

## Deleting a match

- **RES-8** **Deleting a match deletes its report and track.**
  - On the server, a deleted match's reports are marked deleted with it, so every app drops them at its next sync, and their tracks are deleted.
  - Delete match? says what goes with it, the same on the website and both phones: "It goes from LawFive, on every device", then ", with its report and track", ", with its report", or, while it isn't known whether there's a track (no signal), ", with its report and any track".
  - Neither comes back on its own: a watch sending the match again changes nothing and is told it's saved (as RES-4); saving the match again brings back only the match; restoring an export doesn't add a report whose match the account doesn't have or has deleted.
  - A planned match deleted before its first result arrives comes back played, with the result, so a recording is never lost.
  - Download everything has only the tracks of the reports in it.
  - When a server is upgraded, it tidies older data: reports whose match is deleted or missing are marked deleted and their tracks removed. A report that names no match is left alone.

## Status

Everything above is built on the server, the website and both phones.

Not built yet:
- Add result (RES-2) and the phones' Delete match? wording (RES-8) haven't been seen on a real phone.
