# Match setup (SET)

How a match is set up before it starts: its format, teams and details, on the watch, in Garmin's phone settings, and on the website and phone apps. The watch's parts work the same on Garmin, Wear OS and Apple Watch; the match forms are on the website and both phone apps.

## Ways to set up a match

- **SET-1** A match is set up in one of three ways:
  - planned ahead, in the Garmin app's settings in the Garmin Connect phone app (teams and format, SET-11), or with a LawFive account (SET-12);
  - on the watch as a **quick match**, with the default format and no team names to type;
  - on the watch with **Create match** (SET-9), changing the format before starting.
- **SET-4** Planned matches are stored on the watch, and the referee picks one from a list, beside the quick match, to start it. Garmin's phone settings hold one planned match; a linked account brings more (SET-12).
- **SET-12** Planned matches reach the watch from the referee's LawFive account (SYNC-3), directly from the server or through the phone app. The single planned match in Garmin's phone settings is for people without an account.
- **SET-11** **Garmin's phone settings.** Quick match and Create match start from the format set there, falling back to the defaults in [MATCH_CONFIG.md](../MATCH_CONFIG.md) for anything not set.
  - The format fields: periods, lengths, team size, halfway break, stoppage tracking, break as stoppage (TMR-12), the clock and whether goals and cards stop it (TMR-15), extra time, penalties, and whether to record goal types (EVT-8). Durations are minutes and may be decimal (2.5).
  - The planned match's team names, short names and colors (hex, for example `#C8102E`), which apply to the planned match only.

## The format

- **SET-2** The default format is 2 periods of 45 minutes with a 15-minute break between them.
- **SET-6** The number of periods (1 to 4, SET-16) and their length are set on the phone and in Create match, for youth formats such as 2 × 30 or 4 × 12.
- **SET-16** **One period**, for tournament games of a single period. There's no half-time or next kickoff: ending the period is full time (TMR-6), or the choice of extra time and penalties when they're on (ET-1). The halfway break (TMR-7), extra time with its own toss (ET-2, ET-7) and penalties still work.
  - No period label: where `1H` would show, the running screen leaves its slot empty, so the layout doesn't move (UI-1, UI-3). Extra time keeps ET1 and ET2.
  - The event list and Adjust clock's sub-label give the time alone ("23:40"), and Adjust clock's entry asks "Minutes played".
  - The game menu's row is "End period" before extra time or penalties, otherwise "End match". The choice after it is titled "FULL TIME" ("Full time: 1-1" on Wear OS and Apple Watch). History's summary calls it "Period".
  - The break between periods is used only before extra time, so it's named for it: "Break before ET" in the watches' Create match, "Before ET" on the phones' forms, "Break before extra time" on the website. Summaries leave it out unless extra time is on: "1x20'" on the watches, "1 × 20 min" on the website and phones.
  - The website and phones call its period "Regular time" (beside "Extra time 1"), and a match recorded as one whole period shows as one.
  - The shared cases are in [`schema/match-cases/one-period.json`](../../schema/match-cases/one-period.json).
- **SET-7** Extra time and penalty shoot-outs, switched on per match (ET-1 to ET-5).
- **SET-8** The three timers are the **match**, **stoppage** and **break** timers. The stoppage and break timers can be renamed in the phone settings (for example "water" for the break); a blank name uses the default. Names are copied into a match when it's created. The match timer's name is fixed.
- **SET-17** **Usual role and format.** Settings → New matches has **Usual role** (Referee until chosen; the same roles a match has) and **Usual format**: the format last saved on a match form on the website or a phone, which can be changed there.
  - A new match on a form starts with the usual role, and with its competition template's format if it has one, else the usual format, else 2 × 45 (SET-2). Saving a new match saves the usual format only when it changed. Imports, integrations and quick matches from the watch change neither.
  - Every account is offered the **starter formats**, built into LawFive rather than templates (nothing to sync or delete): U8 4v4 2×20, U9–U10 7v7 2×25, U11–U12 9v9 2×30, U13–U14 2×35, U15–U16 2×40, U17–U19 2×45 and Adult 2×45, with 5 minutes at halftime up to U12 and 10 from U13. Players a side follow U.S. Soccer's small-sided standards; lengths follow US Youth Soccer's recommendations, with U8 and U15–U16 as leagues play them; adult follows Law 7.
  - For a clock that stops (TMR-15): High school (NFHS) 2×40 with 10 minutes at halftime and College (NCAA) 2×45 with 15, both 11 a side and without extra time (NFHS Rule 7-1; NCAA Rules 7.1 and 7.2.1). NCAA's regular season has no extra time, and the states' NFHS overtimes differ.
  - A match's age group suggests its starter: HS, Varsity and JV suggest High school, and College and NCAA suggest College. The U-ages keep the youth formats, which play the Laws.
  - On the website's form, Format sits beside Kickoff, offering Your usual (when it isn't a starter's or a template's), the starter formats and the templates. Under it is the format in words, or, for a typed age group, its starter with Use it.

## Create match on the watch

- **SET-9** **Create match** (New match → Custom, UI-16) is one list of the quick match's fields with their values, in this order:
  - **Start match**, which starts a HOM v AWY match with that format;
  - periods, period length, and the break between periods ("Half-time" for two periods);
  - team size;
  - **Clock** (Runs on or Stops) and, while it stops, **Goals, cards stop** (TMR-15);
  - stoppage tracking (TMR-10), goal scorers (EVT-10) and goal types (EVT-8), each on or off;
  - extra time (then its periods, period length and golden goal, ET-6) and penalties;
  - the halfway break (then its length and, with stoppage tracked, break as stoppage, TMR-12);
  - sin bins (then their length, EVT-12);
  - **Team colors** (SET-14), always last.

  Rows that matter only when a switch is on show only then, straight after it. While the clock stops, the stoppage tracking and break as stoppage rows are hidden. Selecting a row edits it: a list of choices for periods, extra-time periods and break length, and two-digit entry (UI-8) for minutes and team size.
- **SET-13** **Same as last match.** Once a match has been played, Create match starts with a **Same as last match** switch ("Same as last" on screen, to fit round watches), on, with the last format under it (for example "2x45' · HT 15' · ET").
  - While it's on, the list is just the switch, Start match and Team colors, and Start match starts a HOM v AWY match with the format of the most recently started match (quick, planned or created), including stoppage tracking and goal types. Teams and colors aren't carried over.
  - Turning it off shows every row, starting from the last match's values; turning it back on returns to exactly the last format.
  - Button watches open the list on Start match; watches without a Down button (Venu) open it at the top, so the switch shows. Choice and color lists likewise open on the current value on button watches, and at the top on the Venu.
- **SET-14** **Team colors** in Create match (always shown, with a summary such as "HOM Red · AWY Blue" or "None") opens Home team and Away team, each showing its color. Each opens a list of None, Black, White, Red, Orange, Yellow, Green, Blue and Purple, with a swatch beside each and the current one focused. The colors are used as in UI-10. A hex color from the phone settings shows as "Custom".

## Teams and details

- **SET-3** With no names given, teams are `HOM` and `AWY`; a planned match shows its short names instead (SET-5).
- **SET-5** **Short names.** The match screen shows each team's short name (up to 4 characters).
  - A short name typed for the match shows as typed. An empty one counts as none.
  - With none, it's made from both team names: the first three letters or digits of each, in capitals (`RIV` for Riverside FC, `STL` for St. Louis City). When those are the same, the words both names start with are skipped (`L84_Roach` v `L84_Smith` gives `ROA` v `SMI`, `L84-HENDERSON_M` v `L84-DE ANGELIS_K` gives `HEN` v `DEA`, `Strikers U12` v `Strikers U14` gives `U12` v `U14`), unless that still can't tell them apart. With no name, `HOM` and `AWY`.
  - The suggestion comes from the two names alone, even when the other team's short name was typed.
  - One rule everywhere: the server's watch download (so every watch shows it), the website, Try a match and both phones, checked by the shared cases in [`schema/short-names.json`](../../schema/short-names.json). Garmin's planned match from its own phone settings takes the name's first three characters instead.
  - Only a typed short name is stored, so short names follow the names wherever they change (the forms, an import, a calendar feed, the API). The forms show the suggestion as the field's placeholder, a watch's quick match keeps its short name only when it differs from what its names give, and the match spreadsheet exports only typed short names.
  - If a short name doesn't fit, the score line uses a smaller font; only then is it cut. Full names are used for the planned match in the start menu and for the activity's name.
- **SET-10** Every match carries the fields in [MATCH_CONFIG.md](../MATCH_CONFIG.md), with that file's defaults. Team size is stored and changes nothing on the watch. A downloaded match's name or competition, kickoff, role, venue and pitch, other officials, forecast, notes and fee are shown on its own screen (UI-19); the outlook isn't sent to the watch.
- **SET-15** **Assignor**: who assigned the match, as a name on the match, beside the match number on the website's and phones' forms. As it's typed, it offers the assignors already used on other matches. Integrations and imports fill it in (an **Assignor** column), and people can type it. It's shown on the match page and the printed report and found by the match list's search. It isn't sent to the watch.

## Status

Everything above is built on the watches, the website, both phones, the server and Try a match, where each applies.

Not built yet:
- SET-5's rule for Garmin's planned match from its own phone settings, which takes the name's first three characters (a downloaded match has its short names from the server).
