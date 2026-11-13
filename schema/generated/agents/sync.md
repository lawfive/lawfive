# Sync

Everything that changed since a device last looked.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/changes

**Changes since a cursor.** Every record written after the cursor, deletions included, oldest first, across all collections (for an API key, the ones it can read). Start with since=0, keep the cursor, and ask again while more is true. Changes made at the same time are never skipped. API keys: any read scope; only those collections are included.

| Parameter | In | Type | Description |
|---|---|---|---|
| `since` (optional) | query | integer | The cursor from the last page; 0 (the default) for everything. |
| `limit` (optional) | query | integer | Changes per page: 500 by default, at most 1000. |

| Answer | Body | When |
|---|---|---|
| 200 | [ChangesPage](#changespage) | A page of changes. |
| 400 | [ApiError](#apierror) | since or limit isn't a whole number. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without *:read; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### Change

A record as it is now, after a change: created, updated or deleted (deletedAt set).

- { collection: "matches", record: [Match](data-model.md#match) }
- { collection: "match-templates", record: [MatchTemplate](data-model.md#matchtemplate) }
- { collection: "match-records", record: [MatchRecord](data-model.md#matchrecord) }
- { collection: "venues", record: [Venue](data-model.md#venue) }
- { collection: "competitions", record: [Competition](data-model.md#competition) }
- { collection: "referees", record: [Referee](data-model.md#referee) }
- { collection: "settings", record: [UserSettings](data-model.md#usersettings) }

### ChangesPage

One page of the changes after a cursor, for sync.

| Field | Type | Description |
|---|---|---|
| `changes` | [Change](#change)[] | Oldest first. A record changed several times appears once, as it is now. |
| `cursor` | integer | Send as since next time. Unchanged when there's nothing new. |
| `more` | boolean | true when there are more changes after this page; ask again straight away. |
