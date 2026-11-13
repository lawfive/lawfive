# Tracks

GPS and heart rate for a match report, in LawFive's own format whatever recorded them: convert from the source (RefSix, an activity file, a phone's health store) before uploading. Not part of sync, as tracks are big; fetch one when it's shown. The figures (distance, speeds, sprints, heart rate and zones) are worked out by the server each time.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/match-records/{id}/track

**A match report's track.** With its figures, over the periods played when the match report has their start times. API keys: need `match-records:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { track: [MatchTrack](data-model.md#matchtrack), summary: [TrackSummary](data-model.md#tracksummary), pitch?: [PitchOutline](data-model.md#pitchoutline), heat?: { cols: integer, rows: integer, lengthM: number, widthM: number, total: number[], periods: ({ period: integer, cells: number[] })[] }, updatedAt: [Timestamp](data-model.md#timestamp) } | The track and its figures. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:read; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No track for this match report, or no such match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/match-records/{id}/track

**Upload a match report's track.** Replaces any track the match report had. Up to 43,200 samples (12 hours at one a second) in each series. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [MatchTrack](data-model.md#matchtrack)

| Answer | Body | When |
|---|---|---|
| 200 | { summary: [TrackSummary](data-model.md#tracksummary), updatedAt: [Timestamp](data-model.md#timestamp) } | Replaced the track it had. |
| 201 | { summary: [TrackSummary](data-model.md#tracksummary), updatedAt: [Timestamp](data-model.md#timestamp) } | Stored. |
| 400 | [ValidationError](#validationerror) | The body doesn't match the schema (issues lists the problems). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such match report: save it first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/match-records/{id}/track/pitch

**Mark where the pitch is.** The two corners of one touchline and the center spot, as the referee placed them; kept with the track, marked by: referee. Heatmaps and Stats use it. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** { corners: [[Position](data-model.md#position), [Position](data-model.md#position)], centre: [Position](data-model.md#position) }

| Answer | Body | When |
|---|---|---|
| 200 | { pitch: [PitchOutline](data-model.md#pitchoutline), updatedAt: [Timestamp](data-model.md#timestamp) } | Kept. |
| 400 | [ValidationError](#validationerror) | The body doesn't match the schema. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No track for this match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/match-records/{id}/track/pitch

**Forget where the pitch is.** Back to the pitch found from the track. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { pitch?: [PitchOutline](data-model.md#pitchoutline), updatedAt: [Timestamp](data-model.md#timestamp) } | Forgotten; pitch is the one found from the track, when there's enough GPS. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No track for this match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/match-records/{id}/track

**Delete a match report's track.** The match report stays. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No track for this match report. |
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
