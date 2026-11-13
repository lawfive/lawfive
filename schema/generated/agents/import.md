# Import

Adding and updating matches from a spreadsheet, CSV or JSON file. Apps read the file into rows; the server matches each row to a match (by LawFive id, else match number), finds or adds the venues, competitions and referees it names, and saves only what the row fills in. Check first with dryRun.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### POST /v1/import/matches

**Import matches.** Each row adds a match or updates one: the row's ID column (a LawFive match id) wins, else its match number (any source). Only the columns a row fills in change an existing match. Venues, pitches, competitions and referees are found by name, ignoring case (venues, pitches and referees by their other names too), and added when there's none (an API key then needs write access to those too). Rows with problems are skipped and the rest are saved; nothing is saved on a dry run.

The columns, by their headings (any case or spacing, so home_colour and homeColour work too, as do common other headings like Field for Pitch):

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

\* A new match needs a date (Date and Time, or Kickoff) or its teams; everything else is optional, and an empty value never changes a match. API keys: need `matches:write`.

**Body:** [MatchImport](#matchimport)

| Answer | Body | When |
|---|---|---|
| 200 | [MatchImportResult](#matchimportresult) | What happened to each row (or would, on a dry run). |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match: no rows, more than 1000, or not rows of values. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits, so nothing is saved. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/import/file

**Import matches from a file.** The same import as POST /v1/import/matches, from a file the server reads: CSV (commas, semicolons or tabs), Excel (.xlsx, its Matches sheet or else the first) or JSON (a list of objects, or an object with a matches list). The web app and phone apps use this; send it with dryRun first to check every row, then again without to save. API keys: need `matches:write`.

**Body:** multipart/form-data: the fields of [MatchImportFileFields](#matchimportfilefields), and the files `file` (required: the file, at most 5 MB and 1000 rows)

| Answer | Body | When |
|---|---|---|
| 200 | [MatchImportFileResult](#matchimportfileresult) | What happened to each row (or would, on a dry run), and where each is in the file. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The file is missing, too big (5 MB, or the plan's fileMb), or can't be read; error says why, in words to show the person who chose it. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits, so nothing is saved. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### ImportRow

A row as a spreadsheet has it: column names (Home, home_colour and homeColour are the same column) and text, number or true/false values. Empty values change nothing.

{}

It may have more fields.

### ImportedRow

| Field | Type | Description |
|---|---|---|
| `row` | integer | The row's place in rows, from 1. |
| `action` | "add" \| "update" \| "skip" | skip: it has problems, so it wasn't imported. |
| `matchId` (optional) | [Id](data-model.md#id) | The match it added or updated (or would). |
| `title` (optional) | string | The match in a few words, for showing the row: home v away. |
| `kickoff` (optional) | [Timestamp](data-model.md#timestamp) | Its kickoff, once imported. |
| `problems` | string[] | Why it's skipped, naming the column; empty when it isn't. |

### MatchImport

Matches to add or update, from a spreadsheet, CSV or JSON file.

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportRow](#importrow)[] |  |
| `timeZone` (optional) | string | For kickoffs written without a UTC offset, when the row has no Time zone column; the web app sends the browser's. UTC when not given. |
| `dateOrder` (optional) | "dmy" \| "mdy" | How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) need none. mdy when not given. |
| `dryRun` (optional) | boolean | Check every row and say what would happen, without saving anything. |

### MatchImportFileFields

The form fields of a file import (multipart/form-data), beside the file.

| Field | Type | Description |
|---|---|---|
| `timeZone` (optional) | string | For kickoffs written without a UTC offset, when the row has no Time zone column. |
| `dateOrder` (optional) | "dmy" \| "mdy" | How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) are always understood. |
| `dryRun` (optional) | "true" \| "false" | true: check every row and say what would happen, without saving anything. |

### MatchImportFileResult

MatchImportResult, for a file.

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportedRow](#importedrow)[] | Every row that had anything in it, in order. |
| `added` | integer |  |
| `updated` | integer |  |
| `skipped` | integer |  |
| `created` | { venues: string[], competitions: string[], referees: string[] } | Names the user had no record for, added (or, on a dry run, to be added). |
| `ignoredColumns` | string[] | Columns the import doesn't know, as written in the file. |
| `file` | { kind: "table" \| "json", lines: integer[] } | How to point at a row in the file. |

### MatchImportResult

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportedRow](#importedrow)[] | Every row that had anything in it, in order. |
| `added` | integer |  |
| `updated` | integer |  |
| `skipped` | integer |  |
| `created` | { venues: string[], competitions: string[], referees: string[] } | Names the user had no record for, added (or, on a dry run, to be added). |
| `ignoredColumns` | string[] | Columns the import doesn't know, as written in the file. |

### PlanRefusal

An ApiError; over a plan's limit, it says which.

| Field | Type | Description |
|---|---|---|
| `error` | string |  |
| `limit` (optional) | "matches" \| "referees" \| "venues" \| "storageMb" \| "photoMb" \| "fileMb" \| "devices" \| "pushPerDay" \| "apiKeys" \| "apiCallsPerMinute" \| "apiCallsPerDay" \| "webhooks" \| "assignorCalendars" \| "addressSearchesPerDay" | The plan's limit that was reached. |
| `allowed` (optional) | integer | What the plan allows of it. |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.
