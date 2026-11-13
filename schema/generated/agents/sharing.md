# Sharing

A match's share link: an address nobody can guess that shows the match, its log and its track to anyone who has it, without signing in. Never the notes, fee, crew, contacts, player names or photos.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/matches/{id}/share

**A match's share link.** Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchShare](#matchshare) | Its link. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | It isn't shared, or there's no such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/matches/{id}/share

**Share a match.** Makes its link, or a new one in place of the old, which stops working. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 201 | [MatchShare](#matchshare) | Its link. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/matches/{id}/share

**Stop sharing a match.** Its link stops working. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Not shared any more. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | It isn't shared. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/shared/{token}

**A shared match.** What the share link's page shows. The token is the secret; there's no other sign-in. Answers carry X-Robots-Tag: noindex. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `token` | path | string | The token in the share link. |

| Answer | Body | When |
|---|---|---|
| 200 | [SharedMatch](#sharedmatch) | The match. |
| 403 | [ApiError](#apierror) | The account is suspended. |
| 404 | [ApiError](#apierror) | No match has this link: it was replaced or turned off, or the match was deleted. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/shared/{token}/track

**A shared match's track.** With its figures, as the owner sees them. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `token` | path | string | The token in the share link. |

| Answer | Body | When |
|---|---|---|
| 200 | { track: [MatchTrack](data-model.md#matchtrack), summary: [TrackSummary](data-model.md#tracksummary), pitch?: [PitchOutline](data-model.md#pitchoutline), heat?: { cols: integer, rows: integer, lengthM: number, widthM: number, total: number[], periods: ({ period: integer, cells: number[] })[] }, updatedAt: [Timestamp](data-model.md#timestamp) } | The track and its figures. |
| 403 | [ApiError](#apierror) | The account is suspended. |
| 404 | [ApiError](#apierror) | No match has this link, or it has no track. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### MatchShare

A match's share link.

| Field | Type | Description |
|---|---|---|
| `url` | string | The public page: PUBLIC_URL/s/<token>. Anyone with it can see the match. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |

### SharedMatch

What a match's share link shows: never its notes, fee, crew, contacts, player names or photos.

| Field | Type | Description |
|---|---|---|
| `match` | [Match](data-model.md#match) | Only what a public page shows: without its notes, outlook, fee, crew, tags, match number, assignor or the ids of its venue, pitch, competition and template. |
| `record` (optional) | [MatchRecord](data-model.md#matchrecord) | Its match report, when it's been played, without notes on events or team officials' names. |
| `competition` (optional) | string | The competition's name. |
| `venue` (optional) | string | The venue's name. |
| `pitch` (optional) | string | The pitch's name. |
| `distanceUnit` | [DistanceUnit](data-model.md#distanceunit) | The sharer's, for the figures. |
| `track` | boolean | Whether GET /v1/shared/{token}/track has a track. |
