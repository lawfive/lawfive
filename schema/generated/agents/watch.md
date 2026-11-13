# Watch

What a Garmin watch uses, shaped for its little memory: matches in the form it starts one from, and finished matches as it saved them.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/watch/matches

**The next matches, for the watch.** Scheduled matches from three hours ago on, soonest first, so one that's about to start or running late is still there. A watch's link asking is noted as the watch now having these matches (GET /v1/devices/matches), unless it's the phone app fetching them ahead for the watch (prefetch). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `limit` (optional) | query | integer | At most 10 (the default). |
| `prefetch` (optional) | query | "true" | The phone app fetching the watch's next matches ahead, for when the watch asks without signal: not noted as on the watch. |

| Answer | Body | When |
|---|---|---|
| 200 | { matches: [WatchMatch](#watchmatch)[], serverVersion?: string, screen?: [WatchScreenChange](#watchscreenchange), teamSwipes?: [TeamSwipes](data-model.md#teamswipes), misconductScheme?: [SchemeId](data-model.md#schemeid) } | The matches. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/records

**Upload a finished match.** Stored as a match record, and its planned match marked played. A quick match (no matchId) gets a match made for it from what the watch knew. Sending the same match again updates it, unless its result has been corrected since or it has been deleted since: then nothing changes. A planned match deleted before its result first arrives comes back, played. Not with API keys.

**Body:** [WatchUpload](#watchupload)

| Answer | Body | When |
|---|---|---|
| 200 | [WatchUploadResult](#watchuploadresult) | Updated: this match was sent before (or kept as it is: corrected or deleted since). |
| 201 | [WatchUploadResult](#watchuploadresult) | Stored. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 409 | [ApiError](#apierror) | It would duplicate another record. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/tracks

**Upload part of a match's track.** The watch sends the track it recorded a chunk at a time, after the match. Once every chunk and the match are in, the chunks become the match report's track, unless it has one already (from a file, say), which is kept. Sending a chunk again replaces it. Not with API keys.

**Body:** [WatchTrackChunk](#watchtrackchunk)

| Answer | Body | When |
|---|---|---|
| 200 | [WatchTrackResult](#watchtrackresult) | Received. |
| 400 | [ValidationError](#validationerror) | The body doesn't match, or the samples can't be read. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/pitch

**Pitch corners from the watch.** Corners walked on the watch, sent at its next sync. They're kept with the match, replacing any it had, and with its venue's pitch when it has one, for its matches from then on. Not with API keys.

**Body:** [WatchPitchMarking](#watchpitchmarking)

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true, pitch: boolean } | Kept. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or it names neither matchId nor created. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/screen

**The match screen chosen on the watch.** Settings > Match screen on the watch, sent at its next sync. It becomes the account's choice unless the website or a phone has changed it since (the latest change wins). An account with no settings yet keeps nothing. Not with API keys.

**Body:** [WatchScreenChange](#watchscreenchange)

| Answer | Body | When |
|---|---|---|
| 200 | { applied: boolean } | Whether this change is now the account's choice. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/fee

**Mark a fee paid from the watch.** The watch's Paid toggle, sent at its next sync. It changes only whether the fee is paid, and only if the match hasn't been changed since (the latest change wins). Not with API keys.

**Body:** [WatchFeeChange](#watchfeechange)

| Answer | Body | When |
|---|---|---|
| 200 | { paid: boolean, applied: boolean } | Whether the fee is paid now, and whether this change made it so. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such match, or it has no fee. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### ValidationError

The body doesn't match the schema; issues lists each problem.

| Field | Type | Description |
|---|---|---|
| `error` | string |  |
| `issues` | [ValidationIssue](#validationissue)[] |  |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.

### WatchEvent

[code, team, period, seconds, player, extra]. code: G goal, GO own goal, GP penalty, GF direct free kick, Y caution, Y2 second caution, R send-off, SB a sin bin, with its length in seconds in extra, SB2 a second sin bin for the same number, which counts as a send-off, TY and TR a team official's caution and send-off, with the role in extra (0 head coach, 1 assistant coach, 2 other), I injury, S stoppage, CK and CA the match clock and the added time corrected during play, with the change in seconds in extra (negative for back), E end of period, A abandoned, with the reason in extra (0 weather, 1 lightning, 2 crowd trouble, 3 not enough players, 4 other), SU play suspended, with the reason in extra as for A, RS play resumed, with the whole seconds suspended in extra, both at the period time where play stopped, PG and PM shoot-out kick scored and missed. team: 0 home, 1 away, -1 neither. period counts from 0. seconds: into the period, or -1 before kickoff, -2 at a break, -3 after full time, -4 in the shoot-out. player: shirt number or null. extra: a stoppage's length in seconds.

[string, integer, integer, integer, integer | null, integer | null]

### WatchFeeChange

A match's fee marked paid or not paid on the watch.

| Field | Type | Description |
|---|---|---|
| `matchId` | [Id](data-model.md#id) |  |
| `paid` | boolean |  |
| `at` | integer | When it was changed on the watch, in seconds since 1970. |

### WatchMatch

A match in the form the Garmin watch starts one from (its setup keys), plus what its list shows. Watches have little memory, so the server does the converting.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `kickoff` | integer \| null | Seconds since 1970 (UTC). |
| `title` | string | "STR v ROV", for the watch's list. |
| `name` | string \| null | The match's name, or its competition's. |
| `where` | string \| null | Venue and pitch, "Twin Creeks, Field 3". |
| `role` | string \| null | Referee, AR1, AR2 or 4th official. |
| `weather` | string \| null | A short forecast in the user's temperature unit, "54° rain". |
| `fee` (optional) | { text: string, paid: boolean } \| null | The fee, for the match's screen and its Paid toggle; absent from servers before it. |
| `crew` (optional) | ([string, string])[] | The other officials, [role, name]: ["AR1", "Sam Rivera"]. |
| `notes` (optional) | string \| null | The match's notes, shortened to 300 characters for the watch's memory. |
| `home` | string | Short name shown on the watch. |
| `away` | string |  |
| `homeName` | string |  |
| `awayName` | string |  |
| `homeColor` | integer | 0xRRGGBB, or -1 for none. |
| `awayColor` | integer |  |
| `numPeriods` | integer |  |
| `periodSec` | integer |  |
| `halftimeSec` | integer | The break between periods. |
| `teamSize` | integer |  |
| `midBreak` | boolean | A break halfway through each period (for example a water break). |
| `breakLenSec` | integer |  |
| `extraTime` | boolean |  |
| `etPeriods` | integer |  |
| `etPeriodSec` | integer |  |
| `goldenGoal` | boolean | A goal in extra time ends the match. |
| `penalties` | boolean |  |
| `clockStyle` | 0 \| 1 \| 2 | For older watch builds: the account's match clock, 0 Match time, 1 each period from 0, 2 time left. Newer ones take it from the match screen. |
| `trackStoppage` | boolean |  |
| `stoppingClock` (optional) | boolean | The match clock stops while play is stopped, with no added time; trackStoppage is on with it. Absent from servers before it. |
| `stopForGoalsCards` (optional) | boolean | With a stopping clock, a goal or card recorded stops it. |
| `breakStoppage` | boolean | The halfway break's time is added on as stoppage. |
| `goalScorers` | boolean | Ask the scorer's number for each goal. |
| `goalTypes` | boolean |  |
| `sinBins` | boolean | Sin bin in the team menu. |
| `sinBinSec` | integer | A sin bin's length, 10 minutes unless the format says. |
| `misconductScheme` (optional) | [SchemeId](data-model.md#schemeid) | The codes for a card's reason on the watch: the competition's, else the account's. |

### WatchPitchMarking

A pitch's corners walked on the watch.

| Field | Type | Description |
|---|---|---|
| `matchId` (optional) | [Id](data-model.md#id) | A planned match's id. |
| `created` (optional) | integer | Or, for a quick match, when it was started on the watch (it has no id until it's uploaded). |
| `corners` | ([integer, integer])[] | [latitude, longitude] in millionths of a degree, as the watch's tracks are: its JSON keeps only six significant figures of a decimal. |
| `at` | integer | When they were marked, in seconds since 1970. |

### WatchScreenChange

The match screen as chosen on the watch, or as it's sent to one; the latest change wins.

| Field | Type | Description |
|---|---|---|
| `layout` | [WatchLayout](data-model.md#watchlayout) | The nearest old layout. A watch that sends only this and secondClock is a build from before the four choices. |
| `secondClock` | [ClockStyle](data-model.md#clockstyle) |  |
| `clocks` (optional) | [WatchClocks](data-model.md#watchclocks) |  |
| `mainClock` (optional) | [ClockStyle](data-model.md#clockstyle) |  |
| `breakClock` (optional) | [BreakClockStyle](data-model.md#breakclockstyle) |  |
| `edge` (optional) | [WatchEdge](data-model.md#watchedge) |  |
| `names` (optional) | boolean |  |
| `at` | integer | When it was changed on the watch, in seconds since 1970. |

### WatchTrackChunk

Part of a match's track as the watch recorded it: GPS and heart rate about once a second during the periods.

| Field | Type | Description |
|---|---|---|
| `created` | integer | The match's created time, as in its upload: which match the track is for. |
| `start` | integer | When the track starts (the first kickoff), in seconds since 1970. |
| `index` | integer | Which chunk this is, from 0. |
| `count` | integer | How many chunks the track has. |
| `device` (optional) | string | The watch model, "venu2". |
| `data` | string | The chunk's samples as the watch packs them, "dt,dlat,dlon,speed,hr;" each: tenths of a second since the sample before (empty for 10; the chunk's first counts from start), millionths of a degree moved since the chunk's position before (the first is whole; both empty without a new fix), the speed the watch measured in cm/s, and beats a minute. Empty fields mean unknown; trailing ones are left off. |

### WatchTrackResult

| Field | Type | Description |
|---|---|---|
| `received` | integer | How many of the track's chunks the server has. |
| `count` | integer |  |
| `track` | "waiting" \| "saved" \| "kept" \| "dropped" | waiting: for more chunks or the match; saved: the track is on the match report; kept: the match report already had a track (from a file, say), which stays; dropped: nothing in it could be used (no positions or heart rate). |

### WatchUpload

A finished match as the watch saved it. The server stores it as a match record.

| Field | Type | Description |
|---|---|---|
| `created` | integer | When the match was started on the watch, in seconds since 1970. |
| `matchId` (optional) | [Id](data-model.md#id) \| null | The planned match it was started from; none for a quick match. |
| `device` (optional) | string | The watch model, "venu2". |
| `home` | string |  |
| `away` | string |  |
| `homeName` (optional) | string |  |
| `awayName` (optional) | string |  |
| `homeColor` (optional) | integer |  |
| `awayColor` (optional) | integer |  |
| `numPeriods` | integer |  |
| `periodSec` | integer |  |
| `halftimeSec` | integer |  |
| `teamSize` (optional) | integer |  |
| `breakAtSec` (optional) | integer | When the halfway break comes, or -1 for none. |
| `breakLenSec` (optional) | integer |  |
| `extraTime` (optional) | boolean |  |
| `etPeriods` (optional) | integer |  |
| `etPeriodSec` (optional) | integer |  |
| `goldenGoal` (optional) | boolean | The format's golden goal. |
| `penalties` (optional) | boolean |  |
| `clockStyle` (optional) | integer |  |
| `trackStoppage` (optional) | boolean |  |
| `stoppingClock` (optional) | boolean | The format's stopping clock: every event's seconds are the clock's, which stood still during stoppages (S). |
| `stopForGoalsCards` (optional) | boolean |  |
| `breakStoppage` (optional) | boolean |  |
| `goalScorers` (optional) | boolean |  |
| `goalTypes` (optional) | boolean |  |
| `sinBins` (optional) | boolean | The format's sin bins. |
| `sinBinSec` (optional) | integer |  |
| `score` | [integer, integer] | [home, away]. |
| `pens` (optional) | [integer, integer] \| null | Shoot-out score, [home, away]. |
| `golden` (optional) | boolean | It ended on a golden goal in extra time. |
| `distanceM` (optional) | number \| null | How far the referee ran, in meters. |
| `startedAt` (optional) | integer[] | When each period kicked off, in seconds since 1970, for the track's figures. |
| `kickoff` (optional) | integer | The team that kicked off the first period: 0 home, 1 away, -1 not chosen. |
| `homeHeading` (optional) | number \| null | The compass heading of the goal the home team attacked in the first period, in radians from true north, when the referee recorded it. |
| `events` | [WatchEvent](#watchevent)[] |  |
| `misconduct` (optional) | { scheme: [SchemeId](data-model.md#schemeid), codes: ([integer, string])[] } | The cards' reasons chosen on the watch; a code that isn't the scheme's for that card is left out. |
| `diagnostics` (optional) | { battery?: ([integer, integer, number])[], app?: string, firmware?: string, gpsFirstFixSec?: integer, gpsSamples?: integer, gpsMissed?: integer, restarts?: integer } | How the recording went, for tracing problems. |

### WatchUploadResult

| Field | Type | Description |
|---|---|---|
| `recordId` | [Id](data-model.md#id) | The match record. The same every time this match is sent, so sending it again updates it. |
| `matchId` | [Id](data-model.md#id) | The planned match, or the one made for a quick match. |
