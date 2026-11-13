# Data and export (DATA)

Saving matches on the watch, and getting an account's records out of LawFive: the full download and restore, the spreadsheet, the match report and share links. The watch parts apply to every watch; the rest is on the website and both phones, and in the API.

## On the watch

- **DATA-1** When the match ends, its events are saved on the watch.
- **DATA-3** Saved matches can be reviewed on the watch from History (UI-17): score, summary and event list.
- **DATA-8** **Reset LawFive**, last in Settings → About, confirmed. It erases everything the app keeps on the watch (the link, the downloaded matches, History, what waits to upload, tracks, the chosen server) but not its settings (alerts, timer names, Quick match), then closes, so it opens as on a new watch.
  - A linked watch first signs out on the server when the phone is near (a few seconds at most), so the devices lists drop it.
  - Activities saved in Garmin Connect stay.
  - For a fresh start, a watch changing hands, or testing.

## Getting everything out

- **DATA-2** **Download everything**, in Settings → Account: one zip of all the account's records as JSON (matches, match reports, venues, referees, competitions, templates, settings), with the tracks and photos and a short README of the format.
- **DATA-4** **Restore from a LawFive export**, beside Download everything, merges the zip into the account.
  - Records keep their ids. Anything missing is added; where a record is in both, the one changed last is kept. Tracks and photos come too.
  - It says what it added, updated and left alone, and running it twice changes nothing more.
  - One restore runs at a time.
- **DATA-5** **Matches as a spreadsheet** (CSV or XLSX), from the match list as narrowed by its tab, search and tag, with the columns Import uses (IMP).
  - A spreadsheet edited and imported again updates the same matches (by their LawFive id) rather than adding copies.
  - A crew name typed into a match (not a saved referee) stays typed when the file is imported again, rather than becoming a new referee.
  - Only typed short names are exported, so on import the rest keep following the team names (SET-5).

## The match report

- **DATA-6** **Match report** for a played match: a page laid out for printing (and saving as PDF from the browser), and **Copy as text**. Leagues share no common format, so it gives what their forms ask for, to print, attach or paste. It has:
  - The competition, teams, date and kickoff, venue and pitch, the match number and assignor (SET-15), and the officials.
  - The score, with any shoot-out, and "corrected after the match" for a result edited since (RES-1).
  - For an abandoned match, the minute and its note ("Abandoned 67': note", EVT-11).
  - Any suspensions (TMR-13) and clock corrections (TMR-14) with their minutes, each a section only when there were any.
  - The goals, and each caution and send-off with the team, player number ("Player" when the card has none, EVT-3; a team official's role and name, EVT-15), minute, and offense code in the account's code set (Laws of the Game, United States or England) with its meaning: "UB (Unsporting behavior)". Goals and Cards say None when there were none.
  - Each injury (EVT-16) with the team, player number ("Player" without one), minute, how long play was stopped when the watch timed it ("Play stopped 1:30") and its note; a section only when there were any.
  - The match's notes, for the written account.
  - The phones' text says the same as the website's, line for line, with the kickoff's time in the phone's 12- or 24-hour setting.

## Sharing a match

- **DATA-7** **Share link** for a match, off until turned on from the match page.
  - An address nobody can guess (like the calendar feed, CAL-1), with Copy, New address (the old one stops working) and Turn off.
  - It opens a public page, hidden from search engines, with the teams, competition, date, venue name, score, the match log (goals, and cards with player numbers, codes and minutes), and the distance, track figures and heatmap.
  - Never the notes, fee, crew (names or contacts), assignor, player or team officials' names, notes on events, or photos: the page gets only the fields it lists (SEC-10).
  - Anyone sent the link can pass it on, and messaging apps show its title in link previews; the page says so where it's turned on.

## Status

Everything above is built: the watch keeps the last 10 matches with their event lists; the download, restore and spreadsheet are on the website and in the API; the match report and share links are on the website and both phones, with the phones' report text checked against the website's by the same case.
