# Records

The user's records, one collection per kind. Ids are UUIDs made by the client, so a record created offline keeps its id. Every change raises version; an update sends the version it last saw and gets 409 if the record changed in the meantime. Deleted records are kept as markers so other devices learn of the deletion.

[The overview](overview.md) covers the address, signing in, API keys and errors.

| Collection | Record | Saved as | Notes |
|---|---|---|---|
| `/v1/matches` | [Match](data-model.md#match) | [MatchInput](data-model.md#match) |  |
| `/v1/match-templates` | [MatchTemplate](data-model.md#matchtemplate) | [MatchTemplateInput](data-model.md#matchtemplate) |  |
| `/v1/match-records` | [MatchRecord](data-model.md#matchrecord) | [MatchRecordInput](data-model.md#matchrecord) | Watches upload theirs through POST /v1/watch/records instead. |
| `/v1/venues` | [Venue](data-model.md#venue) | [VenueInput](data-model.md#venue) |  |
| `/v1/competitions` | [Competition](data-model.md#competition) | [CompetitionInput](data-model.md#competition) |  |
| `/v1/referees` | [Referee](data-model.md#referee) | [RefereeInput](data-model.md#referee) |  |
| `/v1/settings` | [UserSettings](data-model.md#usersettings) | [UserSettingsInput](data-model.md#usersettings) | There's one per user: create it once, then update it. |

Each has the same four endpoints, shown here for matches.

## Endpoints

### GET /v1/matches

**The user's matches.** Every match that isn't deleted, oldest change first. API keys: need `matches:read`.

| Answer | Body | When |
|---|---|---|
| 200 | { items: [Match](data-model.md#match)[] } | The matches. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/matches/{id}

**One match.** Deleted ones too, with deletedAt set. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [Match](data-model.md#match) | The match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/matches/{id}

**Save a match.** Creates the match (send no version) or updates it (send the version you last saw). Saving a deleted record brings it back. API keys: need `matches:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [MatchInput](data-model.md#match)

| Answer | Body | When |
|---|---|---|
| 200 | [Match](data-model.md#match) | Updated; version is raised. |
| 201 | [Match](data-model.md#match) | Created, at version 1. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The id isn't a UUID, the body's id differs from the URL's, or the body doesn't match the schema (issues lists the problems). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write, or the account waiting for approval; or a new match over the plan's limit. |
| 409 | { error: string, current?: [Match](data-model.md#match) } | It changed since the version sent (current is the record as it is now), the id belongs to another kind of record, or it would duplicate another (a match's external id, a second settings record). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/matches/{id}

**Delete a match.** Marks it deleted; it stays as a marker so other devices hear of it. Deleting it again changes nothing. Its match records go with it, marked deleted the same way, and their tracks are deleted; saving the match again doesn't bring them back. API keys: need `matches:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |
| `version` (optional) | query | integer | The version last seen; when given, the delete fails if it has changed since. |

| Answer | Body | When |
|---|---|---|
| 200 | [Match](data-model.md#match) | Deleted: the record with deletedAt. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 409 | { error: string, current: [Match](data-model.md#match) } | It changed since the version sent. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

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
