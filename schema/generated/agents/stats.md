# Stats

Reports on the user's games, worked out by the server so every app shows the same.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/stats

**Stats on the user's games.** Games are matches played or abandoned. Every figure follows the filters; options lists what the filters can choose from. An API key gets only what its scopes can read: without match-records:read there are no figures from match reports or tracks (distance, discipline, added time, fitness, heatmaps); without settings:read, no heart-rate zones and the standard sprint speed; without venues:read, referees:read or competitions:read, the lists naming them are empty, while the counts stay. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | [LocalDate](data-model.md#localdate) | The first day, in each match's own time zone; none for the first game. |
| `to` (optional) | query | [LocalDate](data-model.md#localdate) | The last day, inclusive; none for today and on. |
| `gender` (optional) | query | [Gender](data-model.md#gender) |  |
| `competitionId` (optional) | query | [Id](data-model.md#id) |  |
| `role` (optional) | query | "referee" \| "assistant" \| "fourth" | Your role: referee, assistant (AR1 or AR2) or fourth. |
| `tag` (optional) | query | string | Games with this tag (ignoring case). |
| `venueId` (optional) | query | [Id](data-model.md#id) |  |

| Answer | Body | When |
|---|---|---|
| 200 | [Stats](data-model.md#stats) | The stats. |
| 400 | [ApiError](#apierror) | A filter isn't valid: from or to isn't a date, an unknown gender or role, or an id isn't a UUID. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/stats/games.csv

**The games, as a spreadsheet.** The games matching the filters (and, optionally, one slice of a chart), oldest first, as CSV with a header row: date, kickoff, competition, home, away, score, role, venue, pitch, age group, gender, distance (m), average heart rate, kickoff temperature (°C), rain (mm), cautions, send-offs, added time (s), fee, currency and paid. For an API key, the columns its scopes can't read are left empty, as for /v1/stats. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | [LocalDate](data-model.md#localdate) | The first day, in each match's own time zone; none for the first game. |
| `to` (optional) | query | [LocalDate](data-model.md#localdate) | The last day, inclusive; none for today and on. |
| `gender` (optional) | query | [Gender](data-model.md#gender) |  |
| `competitionId` (optional) | query | [Id](data-model.md#id) |  |
| `role` (optional) | query | "referee" \| "assistant" \| "fourth" | Your role: referee, assistant (AR1 or AR2) or fourth. |
| `tag` (optional) | query | string | Games with this tag (ignoring case). |
| `venueId` (optional) | query | [Id](data-model.md#id) |  |
| `pitchId` (optional) | query | [Id](data-model.md#id) \| "none" | At this pitch of the venue, or none for games at the venue without a pitch. |
| `refereeId` (optional) | query | [Id](data-model.md#id) | With this saved referee on the crew. |
| `refereeName` (optional) | query | string | With this name typed in on the crew (ignoring case). |
| `ageGroup` (optional) | query | string |  |
| `month` (optional) | query | string | Kicking off in this month, 2026-04, locally. |

| Answer | Body | When |
|---|---|---|
| 200 | CSV | The games, as a download (Content-Disposition: attachment). |
| 400 | [ApiError](#apierror) | A filter isn't valid. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |
