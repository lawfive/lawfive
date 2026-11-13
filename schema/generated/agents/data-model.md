# The data model

What's stored: the records and the types they're made of. A record's `<Record>Input` is what's sent to save it: the same without `updatedAt` and `deletedAt`, and with `id` and `version` optional. Each type also has a JSON Schema file, at `https://lawfive.dev/schemas/<Type>.json`, for validating exactly.

### AbandonReason

"weather" | "lightning" | "crowdTrouble" | "notEnoughPlayers" | "other"

### BreakClockStyle

How the break clock counts: down is the time left, up the time taken.

"down" | "up"

### ClockStyle

up: Match time, counting up through the match (second half 45:00 to 90:00); upEach: Each half from 0; down: Time left in each period.

"up" | "upEach" | "down"

### Competition

One competition for one season; next season is a new record.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `name` | string |  |
| `organiser` (optional) | string |  |
| `type` | [CompetitionType](#competitiontype) |  |
| `season` (optional) | string | Season label, for example 2026-27. |
| `startDate` (optional) | [LocalDate](#localdate) |  |
| `endDate` (optional) | [LocalDate](#localdate) |  |
| `ageGroup` (optional) | string |  |
| `level` (optional) | string |  |
| `templateId` (optional) | [Id](#id) | The match template for this competition's matches: picking the competition fills the format (and fee). |
| `misconductScheme` (optional) | [SchemeId](#schemeid) | Overrides the user's default scheme for this competition's matches. |
| `notes` (optional) | string |  |

### CompetitionType

"league" | "tournament" | "cup" | "friendly"

### CrewMember

Another official on the match.

| Field | Type | Description |
|---|---|---|
| `role` | [Role](#role) |  |
| `refereeId` (optional) | [Id](#id) | A saved referee. |
| `name` (optional) | string | A name typed in, when no saved referee is linked. |

### DistanceUnit

"km" | "mi"

### Event

- { type: "goal", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), player?: integer, goalType?: [GoalType](#goaltype) }
- { type: "caution", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), offender: [Offender](#offender), misconduct?: [MisconductCode](#misconductcode) }
- { type: "secondCaution", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), offender: [Offender](#offender), misconduct?: [MisconductCode](#misconductcode) }
- { type: "sendOff", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), offender: [Offender](#offender), misconduct?: [MisconductCode](#misconductcode) }
- { type: "sinBin", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), offender: [Offender](#offender), misconduct?: [MisconductCode](#misconductcode), lengthSec: integer }
- { type: "secondSinBin", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), offender: [Offender](#offender), misconduct?: [MisconductCode](#misconductcode), lengthSec: integer }
- { type: "stoppage", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), lengthSec: integer }
- { type: "periodEnd", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp) }
- { type: "penaltyKick", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), scored: boolean, player?: integer }
- { type: "injury", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), team: [Side](#side), player?: integer, lengthSec?: integer, note?: string }
- { type: "suspension", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), reason: "weather" | "lightning" | "crowdTrouble" | "other", lengthSec?: integer, note?: string }
- { type: "clockAdjusted", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), clock: "match" | "added", changeSec: integer }
- { type: "abandonment", when: "play" | "beforeKickoff" | "break" | "afterFullTime" | "penalties", period?: integer, periodSec?: integer, at?: [Timestamp](#timestamp), reason: [AbandonReason](#abandonreason), note?: string }

### ExternalRef

A match ID from outside LawFive, unique per user and source; a re-import with the same one updates the match.

| Field | Type | Description |
|---|---|---|
| `source` | string | Where the ID comes from: manual, csv, or an assignor system. |
| `id` | string |  |

### Fee

| Field | Type | Description |
|---|---|---|
| `amount` | number |  |
| `currency` | string | ISO 4217 currency code, for example USD. |
| `paid` | boolean |  |

### Gender

Who plays: male, female or co-ed (mixed).

"male" | "female" | "coed"

### GoalType

"goal" | "directFreeKick" | "penalty" | "ownGoal"

### GpsSeries

Positions in decimal degrees (WGS 84), one per time; leave out samples without a position.

| Field | Type | Description |
|---|---|---|
| `t` | integer[] | Milliseconds after the track's start, always increasing. |
| `lat` | number[] |  |
| `lon` | number[] |  |
| `accuracyM` (optional) | number[] | How far off each position may be, in meters, when the source says. |
| `speedMps` (optional) | (number \| null)[] | The speed the watch measured at each position (m/s), when the source records it; null where it didn't, and the speed then comes from the positions. |

### HeartRateSeries

Heart rate in beats a minute, one per time.

| Field | Type | Description |
|---|---|---|
| `t` | integer[] | Milliseconds after the track's start, always increasing. |
| `bpm` | integer[] |  |

### Id

UUID made by the device that created the record.

string

### LocalDate

ISO 8601 date.

string

### Match

One referee's own copy of a match.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `name` (optional) | string |  |
| `status` | [MatchStatus](#matchstatus) |  |
| `kickoff` (optional) | [Timestamp](#timestamp) |  |
| `timeZone` (optional) | string | The venue's time zone, for showing the kickoff in local time. |
| `format` | [MatchFormat](#matchformat) | A copy of the format, so editing the template later doesn't change this match. |
| `templateId` (optional) | [Id](#id) | The template the format was copied from. |
| `home` | [Team](#team) |  |
| `away` | [Team](#team) |  |
| `gender` (optional) | [Gender](#gender) |  |
| `ageGroup` (optional) | string | Free text, as leagues write it: U12, U19, Adult, O35. |
| `competitionId` (optional) | [Id](#id) |  |
| `venueId` (optional) | [Id](#id) |  |
| `pitchId` (optional) | [Id](#id) | One of the venue's pitches. |
| `role` (optional) | [Role](#role) | The user's role in this match. |
| `crew` | [CrewMember](#crewmember)[] | The other officials. |
| `notes` (optional) | string |  |
| `outlook` (optional) | string | What to expect: competitive, one-sided, team strengths and so on. |
| `fee` (optional) | [Fee](#fee) |  |
| `external` (optional) | [ExternalRef](#externalref) |  |
| `assignor` (optional) | string | Who assigned the match: a name, typed in or set by an integration or import. |
| `tags` (optional) | [Tags](#tags) |  |
| `pitchMarking` (optional) | [PitchMarking](#pitchmarking) | The pitch's corners as marked on the watch for this match. |

### MatchDiagnostics

How the recording went, for tracing problems. Never on a shared match's page.

| Field | Type | Description |
|---|---|---|
| `battery` (optional) | ({ period: integer, at: "kickoff" \| "end", percent: number })[] | The watch's battery at each period's kickoff and end, so the last is full time. |
| `app` (optional) | string | The version of LawFive that recorded it. |
| `firmware` (optional) | string | The watch's own software. |
| `gpsFirstFixSec` (optional) | integer | Seconds from kickoff to the first GPS fix. |
| `gpsSamples` (optional) | integer | Track samples taken. |
| `gpsMissed` (optional) | integer | Of those, how many had no GPS fix. |
| `restarts` (optional) | integer | How many times the app started again mid-match. |

### MatchFormat

How a match is played: periods, breaks, extra time, penalties and what the watch records.

| Field | Type | Description |
|---|---|---|
| `periods` | integer | Periods of normal time: 1 (a tournament game of one period) to 4. |
| `periodSec` | integer |  |
| `breakSec` | integer | Between periods, and before and between extra-time periods. |
| `halfwayBreak` | boolean | A break halfway through each period of normal time. |
| `halfwayBreakSec` | integer |  |
| `teamSize` | integer |  |
| `clock` | [ClockStyle](#clockstyle) | No longer chosen per match: the account's match screen sets it. Kept for older apps. |
| `trackStoppage` | boolean |  |
| `stoppingClock` (optional) | boolean | The clock: true stops the match clock while play is stopped (a stoppage, the halfway break), as US high school (NFHS) and college (NCAA) games keep time, with no added time; it needs trackStoppage. Missing means it runs on, as the Laws have it. |
| `stopForGoalsCards` (optional) | boolean | With a stopping clock, recording a goal or a card stops it, until Start/Stop at the restart. Missing means on. |
| `breakStoppage` (optional) | boolean | With stoppage tracked, the halfway break's time is added on as stoppage. Missing means on: formats saved before the setting. |
| `goalScorers` (optional) | boolean | Ask the scorer's number for each goal. Missing means on: formats saved before this always asked. |
| `goalTypes` | boolean | Ask the goal type (goal, DFK, penalty, own goal) for each goal. |
| `extraTime` | boolean |  |
| `extraTimePeriods` | integer |  |
| `extraTimePeriodSec` | integer |  |
| `goldenGoal` (optional) | boolean | With extra time, a goal in it ends the match, the scoring team winning. Missing means off. |
| `penalties` | boolean |  |
| `sinBins` (optional) | boolean | Temporary dismissals: Sin bin in the watch's team menu, a countdown with the match clock. Missing means off. |
| `sinBinSec` (optional) | integer | A sin bin's length. Missing means 10 minutes. |

### MatchRecord

What happened in a match, as recorded on a watch, or entered or corrected afterward (RES).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `matchId` (optional) | [Id](#id) | The planned match; absent for a quick match started on the watch, for which the server makes a match. |
| `device` (optional) | string | What recorded it: the watch app and the watch, for example garmin:006-B3703-00 (a Garmin part number), wearos:SM-R860 (the model) or applewatch:Watch7,3 (the hardware identifier; applewatch:Apple Watch from apps before it). |
| `outcome` | "completed" \| "abandoned" |  |
| `periods` | [PeriodPlayed](#periodplayed)[] |  |
| `score` | { home: integer, away: integer } |  |
| `penalties` (optional) | { home: integer, away: integer } | Shoot-out score, when there was one. |
| `goldenGoal` (optional) | boolean | The match ended on a golden goal in extra time: the team that scored it won. |
| `stoppingClock` (optional) | boolean | The match was played on a clock that stops, as US high school and college games are: events' times are the clock's, its stoppages are when it stood still, and there was no added time, so the added-time stats leave the match out. |
| `distanceM` (optional) | number | Distance the referee covered during the match, in meters, from the watch's GPS. |
| `kickoffDirection` (optional) | { team: "home" \| "away", bearingDeg: number } | Which way the first period's kickoff team attacked, when the referee recorded it on the watch; heatmaps use it. |
| `events` | [Event](#event)[] |  |
| `diagnostics` (optional) | [MatchDiagnostics](#matchdiagnostics) | How the recording went. |
| `editedAt` (optional) | [Timestamp](#timestamp) | When its result was last corrected after the match; set by the server whenever the outcome, score, shoot-out, golden goal or events change. A watch's later upload of the same match then changes nothing. |
| `original` (optional) | [RecordedResult](#recordedresult) | The result exactly as the watch first sent it, kept by the server the first time it's corrected, so it can be shown or put back. Absent for results entered without a watch. |

### MatchStatus

"scheduled" | "played" | "abandoned" | "cancelled" | "postponed"

### MatchTemplate

A reusable match format, such as "U12 league: 2×30, 5 min half-time".

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `name` | string |  |
| `format` | [MatchFormat](#matchformat) |  |
| `defaults` | { fee?: [Fee](#fee) } | Filled into a match made from this template, or from a competition that uses it, when the match has none. Not the user's role: that depends on the match. |

### MatchTrack

GPS and heart rate for one match report, each on its own times, kept as recorded (up to about one sample a second).

| Field | Type | Description |
|---|---|---|
| `source` | [TrackSource](#tracksource) |  |
| `start` | [Timestamp](#timestamp) | The time the series' times count from. |
| `gps` (optional) | [GpsSeries](#gpsseries) |  |
| `heartRate` (optional) | [HeartRateSeries](#heartrateseries) |  |
| `pitch` (optional) | [PitchOutline](#pitchoutline) |  |

### MatchWeather

The weather for one match, from the forecast for its pitch (or venue) location.

| Field | Type | Description |
|---|---|---|
| `matchId` | [Id](#id) |  |
| `final` | boolean | true once the match is over: the weather it was played in, which no longer changes. false: a forecast, updated as kickoff gets closer. |
| `condition` | [WeatherCondition](#weathercondition) |  |
| `isDay` | boolean | Daylight at kickoff, for a sun or moon icon. |
| `temperatureC` | number | At kickoff. |
| `feelsLikeC` | number | At kickoff: the temperature with humidity, wind and sun taken into account. |
| `precipitationChance` (optional) | number | The highest chance of rain in any hour of the match. |
| `precipitationMm` | number | Expected rain from an hour before kickoff to the end of the match. |
| `precipitationBeforeMm` | number | Rain in the 24 hours before that. |
| `windGustKph` (optional) | number | The strongest gust during the match. |
| `hours` | [WeatherHour](#weatherhour)[] | Hour by hour from kickoff to the end of the match. |
| `risks` | [WeatherRisk](#weatherrisk)[] |  |
| `updatedAt` | [Timestamp](#timestamp) | When the forecast was fetched. |
| `source` | string | Whose data it is, to credit beside it (Open-Meteo). |

### MisconductCode

| Field | Type | Description |
|---|---|---|
| `scheme` | [SchemeId](#schemeid) |  |
| `code` | string |  |

### MisconductScheme

A set of caution and send-off codes.

| Field | Type | Description |
|---|---|---|
| `id` | [SchemeId](#schemeid) |  |
| `name` | string |  |
| `source` | string | Where the codes come from. |
| `cautions` | ({ code: string, description: string, short?: string })[] |  |
| `sendOffs` | ({ code: string, description: string, short?: string })[] |  |
| `secondCaution` | string | The send-off code for a second caution in the same match (2CT, S7). |

### Offender

- { kind: "player", number?: integer }
- { kind: "teamOfficial", role: [TeamOfficialRole](#teamofficialrole), name?: string }

### PeriodPlayed

| Field | Type | Description |
|---|---|---|
| `period` | integer |  |
| `extraTime` | boolean |  |
| `startedAt` (optional) | [Timestamp](#timestamp) |  |
| `playedSec` | integer | From kickoff to the end of the period, including added time; time play was suspended is left out. With a stopping clock, the clock's time, so the period's length. |
| `stoppedSec` (optional) | integer | With a stopping clock, how long the clock stood still in the period (its stoppages): the period ran for playedSec plus this, and any suspensions. |
| `suspended` (optional) | ({ fromSec: integer, lengthSec: integer })[] | When play was suspended in the period and resumed, on the clock of day from startedAt: the period ran for playedSec plus these. The track's figures leave them out. |

### Pitch

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `name` | string |  |
| `aliases` (optional) | string[] | Other names it goes by, such as those of pitches combined into it by a merge; imports and pickers find the pitch by them. |
| `position` (optional) | [Position](#position) | Where the pitch itself is, which can be some way from the venue's address. |
| `markings` (optional) | [PitchMarking](#pitchmarking)[] | Its corners as marked on the watch, oldest first. Each is used for matches kicking off after it, until a later one. |

### PitchMarking

Pitch corners marked on the watch.

| Field | Type | Description |
|---|---|---|
| `corners` | [Position](#position)[] | Two to four of the pitch's corners, in any order, as walked on the watch. |
| `at` | [Timestamp](#timestamp) | When they were marked. |

### PitchOutline

Where the pitch is and which way it lies, for heatmaps.

| Field | Type | Description |
|---|---|---|
| `corners` | [[Position](#position), [Position](#position)] | The corners at the two ends of one touchline. |
| `centre` | [Position](#position) | The center spot. |
| `by` | "referee" \| "corners" \| "auto" | Marked by the referee on the map, from corners walked on the watch, or found automatically. |

### Position

GPS position in decimal degrees (WGS 84).

| Field | Type | Description |
|---|---|---|
| `lat` | number |  |
| `lon` | number |  |

### QuizBank

The Laws of the Game quiz's questions in one language.

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | integer |  |
| `language` | string |  |
| `edition` | string |  |
| `effectiveDate` | string |  |
| `source` | { title: string, url: string } |  |
| `laws` | [QuizLaw](#quizlaw)[] |  |
| `protocols` | [QuizProtocol](#quizprotocol)[] |  |
| `questions` | [QuizQuestion](#quizquestion)[] |  |

### QuizLaw

| Field | Type | Description |
|---|---|---|
| `law` | integer |  |
| `title` | string |  |
| `url` | string |  |

### QuizOption

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `text` | string |  |
| `correct` | boolean |  |
| `explanation` | string | Why this option is right or wrong; shown after answering. |

### QuizProtocol

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `title` | string |  |
| `relatedLaws` | integer[] |  |
| `url` | string \| null |  |

### QuizQuestion

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `status` | string | active, draft or retired; the API only sends active ones. |
| `type` | string | single, multiple or true_false. |
| `difficulty` | string | easy, medium or hard. |
| `refs` | [QuizRef](#quizref)[] |  |
| `tags` | string[] |  |
| `question` | string |  |
| `options` | [QuizOption](#quizoption)[] |  |
| `editionAdded` | string |  |
| `lastReviewed` | string |  |

### QuizRef

What a question is based on: a Law and section, or a protocol.

| Field | Type | Description |
|---|---|---|
| `law` (optional) | integer |  |
| `section` (optional) | string \| null |  |
| `protocol` (optional) | string |  |

### RecordedResult

A match's result as the watch recorded it, before any correction.

| Field | Type | Description |
|---|---|---|
| `outcome` | "completed" \| "abandoned" |  |
| `score` | { home: integer, away: integer } |  |
| `penalties` (optional) | { home: integer, away: integer } |  |
| `goldenGoal` (optional) | boolean |  |
| `events` | [Event](#event)[] |  |

### Referee

Someone the user officiates with.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `name` | string |  |
| `shortName` (optional) | string | What the officials line on match cards calls them; without it, their surname as guessed from the name. |
| `aliases` (optional) | string[] | Other names they go by, such as the ones merged into this referee; imports and searches find the referee by them. |
| `email` (optional) | string |  |
| `phone` (optional) | string |  |
| `notes` (optional) | string |  |
| `tags` (optional) | [Tags](#tags) |  |
| `distinctFrom` (optional) | [Id](#id)[] | Referees the user said aren't the same person, so they aren't suggested as duplicates again. |

### Role

"referee" | "ar1" | "ar2" | "fourth"

### SchemeId

A misconduct scheme's ID, the name of its file in schema/misconduct/ (ifab, ussf, fa).

string

### Side

"home" | "away"

### SpeedBand

With the default sprint speed: walking under 7 km/h; jogging 7–13; running 13–18; highSpeed 18–21; sprinting 21 and over. A user's own sprint speed scales them all.

"walking" | "jogging" | "running" | "highSpeed" | "sprinting"

### Stats

Stats on the user's games, for the filters in the query.

| Field | Type | Description |
|---|---|---|
| `options` | { years: integer[], genders: [Gender](#gender)[], competitions: ({ id: [Id](#id), name: string, season?: string, games: integer })[], tags: string[], venues: ({ id: [Id](#id), name: string, games: integer })[] } | What the filters can choose from: from all your games, whatever is filtered. |
| `games` | { total: integer, abandoned: integer, first?: [LocalDate](#localdate), last?: [LocalDate](#localdate) } |  |
| `roles` | { referee: integer, ar1: integer, ar2: integer, fourth: integer, notSet: integer } |  |
| `distance` | { totalM: number, games: integer, tracked: integer, averageM?: number, byRole: ({ role: "referee" \| "assistant" \| "fourth", games: integer, averageM: number })[], longest?: { matchId: [Id](#id), kickoff: [Timestamp](#timestamp), title: string, role?: [Role](#role), distanceM: number }, shortest?: { matchId: [Id](#id), kickoff: [Timestamp](#timestamp), title: string, role?: [Role](#role), distanceM: number }, overTime: ({ matchId: [Id](#id), kickoff: [Timestamp](#timestamp), distanceM: number, totalM: number })[] } |  |
| `months` | ({ month: string, referee: integer, assistant: integer, fourth: integer, notSet: integer })[] | Every month from the first game to the last, by role. |
| `busiest` | ({ day: integer, hour: integer, games: integer })[] | Only the day and hour pairs with games. |
| `ageGroups` | ({ ageGroup: string, male: integer, female: integer, coed: integer, notSet: integer })[] | Youngest first; games without an age group are left out. |
| `places` | { venues: integer, pitches: integer, top: ({ venueId: [Id](#id), pitchId?: [Id](#id), venue: string, pitch?: string, games: integer })[] } |  |
| `referees` | { count: integer, top: ({ refereeId?: [Id](#id), name: string, games: integer })[] } |  |
| `weather` | { games: integer, rainy: integer, averageTemperatureC?: number, hottest?: { matchId: [Id](#id), kickoff: [Timestamp](#timestamp), title: string, role?: [Role](#role), temperatureC: number }, coldest?: { matchId: [Id](#id), kickoff: [Timestamp](#timestamp), title: string, role?: [Role](#role), temperatureC: number }, windiest?: { matchId: [Id](#id), kickoff: [Timestamp](#timestamp), title: string, role?: [Role](#role), windGustKph: number }, temperaturesC: number[] } |  |
| `fees` | { currency?: string, games: integer, earnedAmount: number, paidAmount: number, owedAmount: number, otherCurrencies: ({ currency: string, games: integer, amount: number })[], months: ({ month: string, paidAmount: number, owedAmount: number })[], competitions: ({ competitionId?: [Id](#id), name: string, games: integer, amount: number })[] } |  |
| `discipline` | { games: integer, cautions: integer, sendOffs: integer, secondCautions: integer, sinBins?: integer, goals: integer, ageGroups: ({ ageGroup: string, games: integer, cautions: integer, sendOffs: integer })[], competitions: ({ competitionId?: [Id](#id), name: string, games: integer, cautions: integer, sendOffs: integer })[], codes: ({ misconduct: [MisconductCode](#misconductcode), cautions: integer, sendOffs: integer })[] } |  |
| `fitness` | { games: ({ matchId: [Id](#id), kickoff: [Timestamp](#timestamp), distanceM?: number, avgBpm?: integer, maxBpm?: integer, sprints?: integer, topSpeedMps?: number })[], maxHeartRate?: integer, zones?: ({ zone: integer, fromBpm: integer, sec: number })[], speedBands?: ({ band: [SpeedBand](#speedband), sec: number, distanceM: number })[], sprintKph?: number, heatmaps?: ({ role: "referee" \| "assistant", cols: integer, rows: integer, cells: number[], games: integer })[] } |  |
| `addedTime` | { periods: integer, averageSec?: number, byPeriod: ({ period: integer, periods: integer, averageSec: number })[], ageGroups: ({ ageGroup: string, periods: integer, averageSec: number })[], competitions: ({ competitionId?: [Id](#id), name: string, periods: integer, averageSec: number })[] } |  |
| `watches` (optional) | { games: integer, models: ({ device: string, name: string, platform: "garmin" \| "wearos" \| "applewatch" \| "other", games: integer, batteryGames: integer, drainPerHour?: number, drainPerGame?: number })[] } | The watches the games were recorded on and how much battery a match used on each, from the battery readings the watches send with a match. Absent from servers before it, and for an API key that can't read match reports. |
| `years` | ({ year: integer, games: integer, asCentre: integer, distanceM: number, distanceGames: integer, referees: integer, venues: integer, feesAmount: number })[] | Each year with games, newest first. |

### Tags

string[]

### Team

A team as typed in for one match. Saved teams come later, tied to a competition.

| Field | Type | Description |
|---|---|---|
| `name` (optional) | string |  |
| `alias` (optional) | string | A short name typed for the watch. With none, one is made from the two team names: the first three letters or digits of each in capitals, skipping the words both names start with when those would be the same (L84_Roach and L84_Smith show ROA and SMI), or HOM/AWY with no name. Leave it out to have it follow the names. |
| `colour` (optional) | string | The team's primary color; the watch picks black or white text for contrast. |

### TeamOfficialRole

"headCoach" | "assistantCoach" | "other"

### TeamSwipes

How a swipe on the watch's match screen opens a team's controls: upDown is down for home and up for away, with sideways swipes for the game menu; sideways is right for home and left for away, with up for the game menu.

"upDown" | "sideways"

### TemperatureUnit

"c" | "f"

### Timestamp

ISO 8601 date and time with a UTC offset.

string (date and time)

### TrackSource

| Field | Type | Description |
|---|---|---|
| `kind` | [TrackSourceKind](#tracksourcekind) |  |
| `device` (optional) | string | What recorded it, for example garmin:venu2. |
| `app` (optional) | string | The app that recorded it, with its version: RefSix 1.9.1. |

### TrackSourceKind

lawfive: a LawFive watch app; refsix: imported from RefSix; fit, gpx, tcx: an activity file; appleHealth, healthConnect: a phone's health store; strava: from Strava.

"lawfive" | "refsix" | "fit" | "gpx" | "tcx" | "appleHealth" | "healthConnect" | "strava" | "other"

### TrackSummary

What the server works out from a track: GPS figures when it has GPS, heart-rate figures when it has heart rate.

| Field | Type | Description |
|---|---|---|
| `covers` | "periods" \| "track" | periods: only the periods played, from the match report's period start times; track: the whole track (the report has no start times). |
| `total` | { distanceM?: number, topSpeedMps?: number, sprints?: integer, speedBands?: ({ band: [SpeedBand](#speedband), sec: number, distanceM: number })[], avgBpm?: integer, maxBpm?: integer, zones?: ({ zone: integer, fromBpm: integer, sec: number })[] } |  |
| `periods` | ({ distanceM?: number, topSpeedMps?: number, sprints?: integer, speedBands?: ({ band: [SpeedBand](#speedband), sec: number, distanceM: number })[], avgBpm?: integer, maxBpm?: integer, zones?: ({ zone: integer, fromBpm: integer, sec: number })[], period: integer })[] | Each period with a start time; empty when covers is track. |
| `maxHeartRate` (optional) | integer | The maximum heart rate the zones are worked out from (Settings). |
| `sprintKph` | number | The sprint speed the speed bands and sprints are worked out from (Settings; 21 by default). |

### UserSettings

The user's preferences; one per user, first set from the browser's language when the account is created.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `misconductScheme` | [SchemeId](#schemeid) | The default scheme for cards; a competition can override it. |
| `currency` | string | Default currency for fees. |
| `distanceUnit` | [DistanceUnit](#distanceunit) |  |
| `temperatureUnit` | [TemperatureUnit](#temperatureunit) |  |
| `timeZone` (optional) | string | Where the person is: a plan ends at the end of its last day here. Filled in from the first browser or phone that signs in. |
| `mapsApp` (optional) | "auto" \| "google" \| "apple" | Where Directions open: auto (Apple Maps in the iPhone app, Google Maps everywhere else, the same when not set), or always Google Maps or Apple Maps. |
| `maxHeartRate` (optional) | integer | Beats a minute, for heart-rate zones. |
| `sprintKph` (optional) | number | Where sprinting starts, in km/h, for the speed bands and sprints; the other bands scale with it. 21 when not set. |
| `calendarArriveMin` (optional) | integer | Minutes before kickoff the calendar feed's events start, for travel and warming up; 0 starts them at kickoff. 30 when not set. |
| `calendarReminderMin` (optional) | integer | Before several reminders: minutes before kickoff for the calendar feed's one reminder; 0 for none. Used only when none of calendarReminders, calendarDayBefore and calendarDayOf is set; 60 when nothing is. |
| `calendarReminders` (optional) | integer[] | The calendar feed's reminders, in minutes before kickoff: 15-minute steps up to 3 hours. |
| `calendarDayBefore` (optional) | string | A reminder the day before a match at this time (HH:MM, in the match's time zone); none when not set. |
| `watchScreen` (optional) | [WatchScreen](#watchscreen) | Missing until it's first chosen: watches then keep two clocks stacked (time left over match time) with the time of day and names, or their own choice. |
| `teamSwipes` (optional) | [TeamSwipes](#teamswipes) | For Garmin and Apple watches; upDown when not set. Wear OS watches always swipe sideways, as a swipe down from the top opens their quick settings. |
| `calendarDayOf` (optional) | string | A reminder on the day of a match at this time (HH:MM, in the match's time zone), when that's before the event starts; none when not set. |
| `nextMatchCollapsed` (optional) | boolean | The match list's next match folded to a single strip; open when not set. |
| `usualRole` (optional) | [Role](#role) | The role a new match starts with on the match forms; referee when not set. An import, an integration or a quick match from the watch keeps its own. |
| `usualFormat` (optional) | [UsualFormat](#usualformat) | The format a new match starts with on the match forms: the last one saved on a form, or chosen in Settings. Not set until then: forms start from defaultFormat (2×45), offering the starter formats. A competition's template still wins. |
| `getReady` (optional) | { hidden?: boolean, unitsConfirmed?: boolean } | Get ready on Matches, the same on the website and the phones: what the person chose there, so it follows them to another browser or phone. |

### UsualFormat

The format new matches start with: the last one saved on a match form, or one chosen in Settings.

| Field | Type | Description |
|---|---|---|
| `format` | [MatchFormat](#matchformat) |  |
| `templateId` (optional) | [Id](#id) | The template it came from, if it did, so the form can show its name. |
| `starterId` (optional) | string | The starter format it came from (starterFormats' id, "us-u10"), if it did and is unchanged. |
| `changedAt` | [Timestamp](#timestamp) | When it was last set. |

### Venue

| Field | Type | Description |
|---|---|---|
| `id` | [Id](#id) |  |
| `version` | integer | Raised by the server on every change; clients send the version they last saw so conflicts can be spotted. |
| `updatedAt` | [Timestamp](#timestamp) |  |
| `deletedAt` (optional) | [Timestamp](#timestamp) | Set when the record is deleted; deleted records are kept so other devices learn of the deletion. |
| `name` | string |  |
| `aliases` (optional) | string[] | Other names it goes by, such as the ones merged into this venue; imports and searches find the venue by them. |
| `address` (optional) | string | Street address; often where you park. |
| `position` (optional) | [Position](#position) | The address's position (parking), for directions. |
| `pitches` | [Pitch](#pitch)[] | Named pitches ("Field 3"), each with its own position. |
| `notes` (optional) | string |  |
| `tags` (optional) | [Tags](#tags) |  |
| `distinctFrom` (optional) | [Id](#id)[] | Venues the user said aren't the same place, so they aren't suggested as duplicates again. |

### WatchClocks

One clock, or two: a smaller second clock under the first, or two the same size side by side.

"one" | "stacked" | "sideBySide"

### WatchEdge

What the edge of the running screen shows: nothing, the ring or the time of day.

"none" | "ring" | "time"

### WatchLayout

The running screen as watch builds from before the four choices know it: the nearest of the six old layouts. scoreboard is no longer offered.

"default" | "stacked" | "minimal" | "scoreboard" | "sideBySide" | "ring"

### WatchScreen

How the watch's running screen looks, for all the account's watches.

| Field | Type | Description |
|---|---|---|
| `layout` | [WatchLayout](#watchlayout) | For older watch builds: the nearest old layout, kept in step with the fields below. |
| `secondClock` | [ClockStyle](#clockstyle) | What the second clock shows; down is the time left. Never the same as mainClock. |
| `clocks` (optional) | [WatchClocks](#watchclocks) | Missing in setups saved before the four choices: worked out from layout. |
| `mainClock` (optional) | [ClockStyle](#clockstyle) | How the match clock counts; up (Match time) when missing. |
| `breakClock` (optional) | [BreakClockStyle](#breakclockstyle) | How the break clock counts; down when missing. |
| `edge` (optional) | [WatchEdge](#watchedge) | Missing in older setups: worked out from layout. |
| `names` (optional) | boolean | The team names over the clock, or false for scores only. Missing in older setups: worked out from layout. |
| `changedAt` | [Timestamp](#timestamp) | When it was last changed, wherever that was: the latest change wins. |

### WeatherCondition

What the sky is doing, for the icon: the most significant condition while the match is played.

"clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm"

### WeatherHour

| Field | Type | Description |
|---|---|---|
| `time` | [Timestamp](#timestamp) | The start of the hour. |
| `condition` | [WeatherCondition](#weathercondition) |  |
| `isDay` | boolean |  |
| `temperatureC` | number |  |
| `precipitationMm` | number | Rain (or melted snow) during the hour. |
| `precipitationChance` (optional) | number |  |

### WeatherRisk

Something in the forecast that could stop or cancel the match. Rough rules, not a prediction.

| Field | Type | Description |
|---|---|---|
| `kind` | [WeatherRiskKind](#weatherriskkind) |  |
| `level` | "possible" \| "likely" | possible: worth watching; likely: the match may well be called off or stopped. |
| `amount` (optional) | number | What the level is based on: millimeters of rain (wetField: in the 24 hours before; rain: during the match), centimeters of snow, or the highest feels-like temperature in °C (heat). |

### WeatherRiskKind

wetField: rain in the 24 hours before (fields close); rain, storm, snow: during the match or the hour before; heat: feels-like temperature while playing.

"wetField" | "rain" | "storm" | "snow" | "heat"
