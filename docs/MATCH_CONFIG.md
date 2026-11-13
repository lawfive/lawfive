# Match data fields

Every field of a match: what it means, its default, and whether the watch's Quick match and Create match can set it. Behavior is in [match setup](requirements/match-setup.md) (SET-9 to SET-17) and [extra time](requirements/extra-time.md).

| Field | Type | Values | Default | Notes | Create match |
|---|---|---|---|---|---|
| Match ID | str | | | The match's id | No |
| Match Name | str | | | The match's name | No |
| Number of Periods | integer | 1–4 | 2 | 1 is a tournament game of one period (SET-16), whose break is only before extra time | Yes |
| Break duration | float | | 15 | Minutes between periods, and before and between extra-time periods | Yes |
| Period length | float | | 45 | Minutes | Yes |
| Team Size | integer | | 11 | Stored, not used yet | Yes |
| Mid Period Break | boolean | | false | A break halfway through each period (not in extra time) | Yes |
| Period Break Duration | float | | 2 | The halfway break's minutes | Yes |
| Match Clock | str | Up, UpEach, Down | Up | For older apps; the account's match screen sets it (TMR-11). Up: match time (second half 45:00–90:00). UpEach: each half from 0:00. Down: time left | No |
| Track Stoppage | boolean | | false | Track stoppage time | Yes |
| Clock | str | Runs on, Stops | Runs on | Runs on: the Laws, stoppages added on. Stops: the clock stops when play stops, with no added time, for US high school and college (TMR-15). Stops turns on Track Stoppage | Yes |
| Goals and cards stop it | boolean | | true | With a clock that stops: recording a goal or card stops it until Start/Stop at the restart | Yes |
| Home Name | str | | | The home team's name | No |
| Home Alias | str | ≤ 4 characters | HOM | The home team's short name on screen | No |
| Home Color | hex | | | The home team's primary color | No |
| Away Name | str | | | The away team's name | No |
| Away Alias | str | ≤ 4 characters | AWY | The away team's short name on screen | No |
| Away Color | hex | | | The away team's primary color | No |
| Extra Time | boolean | | false | Extra time is allowed | Yes |
| Extra time periods | integer | | 2 | How many extra-time periods | Yes |
| Extra time duration | float | | 15 | Minutes of each extra-time period | Yes |
| Golden Goal | boolean | | false | With extra time: the first goal in extra time wins (ET-6) | Yes |
| Penalties | boolean | | false | Penalties decide it | Yes |
| Sin Bins | boolean | | false | Temporary dismissals: Sin bin in the team menu, counted down with the match clock (EVT-12) | Yes |
| Sin Bin Length | float | 1–20 | 10 | Minutes of match clock a sin-binned player is off | Yes |
| Kickoff | datetime | | null | When the match kicks off | No |
| Role | str | Referee, Assistant, 4th, null | null | The wearer's role | No |
| Referee | str | | null | The referee's name | No |
| AR1 | str | | null | The first assistant referee's name | No |
| AR2 | str | | null | The second assistant referee's name | No |
| 4TH | str | | null | The fourth official's name | No |
| Notes | str | | | Notes on the match | No |
| Forecast | str | | | The weather forecast | No |
| Outlook | str | | | The expected game: competitive, one-sided, team strengths and so on | No |
| Fees | float | | | The fee to collect | No |
| Assignor | str | | | Who assigned the match: a person or an assigning group (SET-15) | No |
| Record Goal Scorers | boolean | | true | Each goal asks for the player's number. Cards always do | Yes |
| Record Goal Type | boolean | Goal, Own, Penalty, DFK | false | Each goal asks its type | Yes |

## In the schema

The formal definition is `Match` and `MatchFormat` in [schema/src/](../schema/src/). Differences from the table:

- Durations are seconds: `periodSec`, `breakSec`, `halfwayBreakSec`, `extraTimePeriodSec`.
- Mid Period Break is `halfwayBreak` with `halfwayBreakSec`.
- Golden Goal is `goldenGoal`, and Sin Bins `sinBins` with `sinBinSec` (missing means 600); missing means off for both.
- Clock is `stoppingClock` (true for Stops; missing means it runs on). Goals and cards stop it is `stopForGoalsCards` (missing means on). A match played on a clock that stops says so in its record (`stoppingClock`), with each period's `stoppedSec`.
- Match Clock is `clock`: `up`, `upEach` or `down`.
- Home and Away Name, Alias and Color are the `home` and `away` teams, each with `name`, `alias` and `colour` (`#RRGGBB`).
- Role is `referee`, `ar1`, `ar2` or `fourth`. Referee, AR1, AR2 and 4TH are the `crew` list (a saved referee or a typed name, with a role).
- Match ID is `id` (a UUID). An ID from an assignor or a file goes in `external` (`source` and `id`), used to update the match on re-import.
- Forecast isn't stored with the match: the server works it out from the venue's place (`MatchWeather`, `GET /v1/weather`).
- Fees is `fee`: an amount, a currency, and whether it's paid.
- Assignor is `assignor`, a name typed or set by an import or integration. It isn't sent to the watch.
- Added: `status`, `timeZone`, `competitionId`, `venueId`, `pitchId`, `templateId`, `gender` (`male`, `female` or `coed`), `ageGroup` (free text such as U12, Adult, O35) and `tags`.

## On the watch

- **Create match** (New match → Custom) edits the fields marked Yes, starting from the phone settings or the defaults above.
- **Same as last match** in Create match repeats those fields from the last match started (SET-13).
- **Phone settings** (Garmin Connect app) hold the planned match's names, aliases and colors, and the format fields. The other fields (Match ID, Match Name, Kickoff, Role, officials, Notes, Forecast, Outlook, Fees) arrive with account sync (SET-12).
- **The match screen** isn't part of a match. Its choices (clocks, how the match, second and break clocks count, ring or time of day, names or scores only) belong to the account (UI-21, UI-24), and the watch takes them at kickoff.
- **Track Stoppage** off means no stoppage clock: Start/Stop opens the game menu during play instead (TMR-10).
- **Clock** set to Stops (TMR-15):
  - The match clock stops while a stoppage runs (Start/Stop, an injury, the halfway break, and a goal or card unless Goals and cards stop it is off), shown in orange, with no stoppage pill and no added time.
  - The clock holds at the period's length, where full time repeats until a button press.
  - Events record the clock's time.
  - It needs Track Stoppage, so Create match hides that row (and Break as stoppage) while it's on.
  - In Create match it comes after Team size as "Clock" (Runs on or Stops), then "Goals, cards stop". Same as last's summary ends "· Stop clock".
- **Record Goal Type** is on or off per match ("Goal types" in Create match, or the phone settings). When on, each goal asks Goal / DFK / Penalty / Own Goal, stored as the event type `G`, `GF`, `GP` or `GO` (EVT-8).
- **Sin Bins** on adds **Sin bin** to the team menu, between Yellow card and Red card, then the player number.
  - Each runs for Sin Bin Length of match clock, waiting through breaks and suspensions, shown as a pill ("AWY 7 4:12"), and ends with "AWY #7 can return" and its own vibration.
  - A second for the same number is a send-off.
  - Recorded as `SB` (with the length), and `SB2` for a second (EVT-12).
- **Aliases** (short names) show on the match screen (SET-5).
  - A downloaded match has them from the server: the one typed for it; else one made from both team names, the first 3 letters or digits of each in capitals, skipping words both names start with when those would match (L84_Roach v L84_Smith shows ROA v SMI); else HOM/AWY with no name.
  - Only a typed alias is stored, so the rest follow the names.
  - Garmin's planned match from the phone settings takes a blank alias as the name's first 3 letters in capitals.
- **Colors** are hex on the phone (`#C8102E`, `C8102E` or `#C12`). Create match offers None, Black, White, Red, Orange, Yellow, Green, Blue and Purple under "Team colors" (SET-14). The name's text is black or white, whichever contrasts more.

### Keys

| Field | Key in the match data (`watch-garmin/source/Match.mc`) | Phone setting |
|---|---|---|
| Number of Periods | `numPeriods` | `numPeriods` |
| Break duration | `halftimeSec` (seconds) | `halftimeMin` |
| Period length | `periodSec` (seconds) | `periodMin` |
| Team Size | `teamSize` | `teamSize` |
| Mid Period Break | `breakAtSec` ((period − break) / 2, or -1) | `midBreak` |
| Period Break Duration | `breakLenSec` (seconds) | `midBreakMin` |
| Home/Away Name | `homeName`, `awayName` | `homeName`, `awayName` |
| Home/Away Alias | `home`, `away` (as shown) | `homeAlias`, `awayAlias` |
| Home/Away Color | `homeColor`, `awayColor` (number, -1 none) | `homeColor`, `awayColor` |
| Extra Time | `extraTime` | `extraTime` |
| Extra time periods | `etPeriods` | `etPeriods` |
| Extra time duration | `etPeriodSec` (seconds) | `etPeriodMin` |
| Golden Goal | `goldenGoal` (only with `extraTime`) | `goldenGoal` |
| Penalties | `penalties` | `penalties` |
| Sin Bins | `sinBins` | `sinBins` |
| Sin Bin Length | `sinBinSec` (seconds) | `sinBinMin` |
| Match Clock | `clockStyle` (0 Up, 1 UpEach, 2 Down; the account's, for older watch builds, TMR-11) | `clockStyle` (what the watch showed) |
| Track Stoppage | `trackStoppage` | `trackStoppage` |
| Clock | `stoppingClock` | `clockKind` (0 Runs on, 1 Stops when play stops) |
| Goals and cards stop it | `stopForGoalsCards` | `stopForGoalsCards` |
| Break as stoppage | `breakStoppage` (on: the halfway break is added as stoppage, TMR-12) | `breakStoppage` |
| Record Goal Scorers | `goalScorers` (missing means on, EVT-10) | `goalScorers` |
| Record Goal Type | `goalTypes`; each goal's type in its event | `goalTypes` |
| Everything else | `details` (stored only) | none (account sync, SET-12) |
