# Export

Everything in the account as one zip, and restoring one into an account, for backups and moving between servers. The zip has lawfive.json (what it is), README.md, records/<collection>.json (each an array of records as the API gives them), tracks/<match record id>.json, attachments.json and the photos in attachments/. Only a signed-in session can use them.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/export

**Download everything.** Every record, track and photo in the account, as a zip (Content-Disposition: attachment). It's made as it's sent, so it starts straight away however big it is. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | A zip file | The zip. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/restore

**Restore from an export.** Merges an export into the account: records keep their ids, anything missing is added, and where the account has a record too, whichever was changed last is kept. Tracks are added to match reports without one; photos the account doesn't have are added. At most 2 GB. Matches, referees and venues over the plan's limits aren't added, and problems says so. Not with API keys.

**Body:** A zip made by GET /v1/export (application/zip)

| Answer | Body | When |
|---|---|---|
| 200 | [RestoreResult](#restoreresult) | Restored. |
| 400 | [ApiError](#apierror) | It isn't a LawFive export, or it's too big (2 GB, or the plan's fileMb). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 409 | [ApiError](#apierror) | Another restore for the account is under way: one at a time. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### RestoreResult

What restoring an export did. Records the account already has a newer copy of are unchanged; running it again adds nothing.

| Field | Type | Description |
|---|---|---|
| `records` | {} | By collection: matches, venues, referees… |
| `tracks` | { added: integer, updated: integer, unchanged: integer } |  |
| `photos` | { added: integer, updated: integer, unchanged: integer } |  |
| `problems` | string[] | What couldn't be restored and why, at most 50. |
