# Importing matches (IMP)

Adding many matches at once from a league's or assignor's schedule, and updating them when it changes. Importing works the same on the website, in the Android and iPhone apps and through the API, as the server reads the files.

## The file

- **IMP-1** On the website, the Matches page's **New match** button has a menu beside it with **Import matches**; an empty match list offers it too. It opens a dialog with links to the example files and the column guide, and a large area to drop a file on, or a button to choose one.
- **IMP-2** **Files**, up to 1000 rows and 5 MB, with example files of the same three matches in each format:
  - CSV, with commas, semicolons or tabs between fields; CSV that isn't UTF-8 is read in the older Windows encoding, so accents survive;
  - Excel (`.xlsx`): the sheet called Matches, else the first, so other sheets (like the example's Columns) are ignored;
  - JSON: a list of objects, or an object with a `matches` list; an object inside one becomes columns like "home name".

  The first row names the columns, in any case or spacing (Home color, home_colour and homeColour are the same); columns it doesn't know are skipped and listed. One match a row; blank rows are skipped. **The server reads the file** (`POST /v1/import/file`), so the website, the phones and the API read files the same way; `POST /v1/import/matches` takes rows already read (IMP-8).
- **IMP-9** A **column guide** explains every column: what it's for, how to write it, an example, and whether a new match needs it. It's a page of its own (linked beside the example files, opening in a new tab), the Excel example's second sheet (Columns), the import endpoint's API description, and the table under Import columns below. All come from one list in [`schema/src/importColumns.ts`](../../schema/src/importColumns.ts); `pnpm generate` in `schema/` copies it here and a test checks the copy.

## Matching and saving

- **IMP-3** A row updates a match when its **ID** column is a LawFive match's ID; otherwise when its **match number** is a match's (whatever its source); otherwise it adds a new match (with that number, from the source "import"). A later row with the same number as an earlier one in the file updates the match the earlier one added. A new match needs at least a date or its teams.
- **IMP-4** Venues, competitions and referees are found by name, ignoring case; a referee, venue or pitch by any of its other names too (DUP-6, DUP-9). One that isn't found is **added**: a venue with just its name (and the Venue address column's address, if given), a competition as a league. A pitch the venue doesn't have is added to it. A template must already exist. The check lists what will be added, as names are matched by their spelling.
- **IMP-5** Nothing is saved until the user has seen a **check of every row**: how many are new, updates and with problems; each row with its place in the file (row number, or item in JSON), date, teams and what happens to it; and the problems, naming the column. **Import** then saves the rows without problems, and the rows skipped are listed afterward.
- **IMP-6** **Dates and times:**
  - a Date column (2026-11-07, or with slashes or dots, read in the order the browser's language writes dates) and a Time column (10:00, 2:30 PM, 9am), or a Kickoff column (an ISO date and time, with or without a UTC offset); Excel date and time cells work as they are;
  - a time without an offset is in the row's Time zone, else the match's, else the browser's;
  - updating only the date or only the time keeps the other.
- **IMP-7** An update **changes only the columns the row fills in**; empty and missing columns leave the match as it is.
  - A crew column replaces that role's official. The user's own name in one is their role. TBD, TBA, TBC or none means nobody yet.
  - Fee, Currency and Paid each change only themselves.
  - Colors are #RRGGBB or the watch's color names; status, gender and role take the usual words (canceled or cancelled, boys or male, ref or referee).
  - An empty short name follows the team names (SET-5). The website's match spreadsheet exports only short names that were typed, so a file imported again keeps the rest following the names.
- **IMP-8** Each match is **checked like any other save** (the data model's rules: lengths, ranges, formats), so an import can't save what the app couldn't. Apps and scripts import with `POST /v1/import/matches`, with `dryRun` for the check. An API key needs matches:write, and write access to venues, competitions or referees to add them.

## On the phones

- **IMP-10** In the Android and iPhone apps, More > **Import matches** (and an empty match list) opens a screen that says what a file needs, links to the example files and the column guide on the website, and offers Choose a file from the phone's files. As on the web, every row is checked before anything is saved (IMP-5), showing where it is in the file, what happens to it and any problems, then Import. The date order comes from the phone's region. It needs a connection, and says so rather than queueing.

## Import columns

<!-- import-columns: generated from schema/src/importColumns.ts by pnpm generate -->

| Column | JSON | What it's for | Example | Needed |
|---|---|---|---|---|
| ID | `id` | LawFive's own ID for a match, as in a LawFive export. Leave it empty for a new match; with it, the row updates that match. | 5c1e2a9b-… | Optional |
| Match number | `matchNumber` | The league's or assignor's number for the match. Importing a file again with the same number updates the match instead of adding a copy. | BYL-1142 | Optional |
| Assignor | `assignor` | Who assigned you the match: a person, or the assigning group's name. | Dana Whitfield | Optional |
| Status | `status` | scheduled, played, abandoned, canceled or postponed. A new match is scheduled when it's empty. | scheduled | Optional |
| Date | `date` | The day of the match: 2026-11-07, or the way your computer writes dates (11/7/2026 in the US, 7/11/2026 in most other places). | 2026-11-07 | New matches* |
| Time | `time` | The kickoff time: 14:30 or 2:30 PM. A new match with a date needs one. | 2:30 PM | Optional |
| Kickoff | `kickoff` | The date and time together, instead of Date and Time. Add a UTC offset (2026-11-07T14:30-08:00) to fix the moment exactly. | 2026-11-07 14:30 | New matches* |
| Time zone | `timeZone` | Where the kickoff time is, by its name in the time zone database. Empty: the match's own time zone, or your computer's. | America/Los_Angeles | Optional |
| Home | `home` | The home team's name. | Strikers U12 | New matches* |
| Home short name | `homeShortName` | Up to 4 letters for the home team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change. | STR | Optional |
| Home color | `homeColour` | The home team's color on the watch: black, white, red, orange, yellow, green, blue or purple, or a hex code like #D71920. | red | Optional |
| Away | `away` | The away team's name. | Rovers U12 | New matches* |
| Away short name | `awayShortName` | Up to 4 letters for the away team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change. | ROV | Optional |
| Away color | `awayColour` | The away team's color on the watch, written like Home color. | #0057B8 | Optional |
| Competition | `competition` | The league, cup or tournament, by name. One you don't have yet is added, as a league. | Bay Youth League U12 Boys | Optional |
| Venue | `venue` | Where it's played, by name. One you don't have yet is added; give it an address and a place on the map in Venues. | Twin Creeks Sports Complex | Optional |
| Venue address | `venueAddress` | The venue's street address, for directions: given to a venue that's added, or one that has no address yet. | 969 Caribbean Dr, Sunnyvale, CA 94089 | Optional |
| Pitch | `pitch` | The pitch at the venue. It's added to the venue if the venue doesn't have it yet. | Field 3 | Optional |
| Match name | `matchName` | A name for the match itself, shown with the competition: a round, a final, a friendly's occasion. | Semi-final | Optional |
| Age group | `ageGroup` | As the league writes it: U12, U19, Adult, O35. | U12 | Optional |
| Gender | `gender` | Who plays: male, female or co-ed (boys, girls, men, women and mixed work too). | female | Optional |
| Role | `role` | Your role: referee, AR1, AR2 or fourth official. Empty: taken from a crew column with your name in it, if there is one. | AR1 | Optional |
| Referee | `referee` | The referee's name, or one of their other names. Your own name makes it your role; someone you haven't saved yet is added to Referees. TBD or empty: nobody yet. | Priya Natarajan | Optional |
| AR1 | `ar1` | The first assistant referee's name, written like Referee. | Sam Rivera | Optional |
| AR2 | `ar2` | The second assistant referee's name, written like Referee. | Jordan Lee | Optional |
| Fourth official | `fourthOfficial` | The fourth official's name, written like Referee. | Sam Rivera | Optional |
| Template | `template` | One of your match templates, by name, for its format (periods, their length, breaks). It must already exist. Empty for a new match: the competition's template, or 2 × 45 minutes. | U12 league: 2×30 | Optional |
| Periods | `periods` | How many periods, 1 to 4: 2 for halves, 4 for quarters, 1 for a tournament game of one period. Overrides the template's. | 2 | Optional |
| Period length (min) | `periodLength` | Minutes in each period. Overrides the template's. | 30 | Optional |
| Half-time (min) | `halfTime` | Minutes of break between periods. Overrides the template's. | 5 | Optional |
| Team size | `teamSize` | Players a side on the field, 1 to 11. Overrides the template's. | 9 | Optional |
| Fee | `fee` | What you're paid for the match, as a number. | 40.50 | Optional |
| Currency | `currency` | The fee's currency, as a three-letter code (USD, GBP, EUR). Empty: your currency in Settings. | USD | Optional |
| Paid | `paid` | Whether you've been paid the fee: yes or no. | no | Optional |
| Tags | `tags` | Labels to find and filter matches by, separated by commas. | league, needs AR | Optional |
| Notes | `notes` | Anything to remember for the match. | Bring the spare flags. | Optional |
| Outlook | `outlook` | What to expect: how competitive it'll be, the teams' strengths, history between them. | Top of the table meets second. | Optional |

\* A new match needs a date (Date and Time, or Kickoff) or its teams; everything else is optional, and an empty value never changes a match.

<!-- /import-columns -->

## Status

Everything above is built, on the website, both phones and the API.

Not built yet:

- Importing straight from assignor systems' APIs (A-3 in [ARCHITECTURE.md](../ARCHITECTURE.md)). Their calendar links are covered in [assignor-calendars.md](assignor-calendars.md).
