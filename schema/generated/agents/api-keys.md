# API keys

Keys for scripts and integrations, made in the web app's Settings. A key is sent like a session token, Authorization: Bearer <key>, and can use only the collections it was given (read, or read and write), plus the weather (with matches:read) and address search (with venues:write). Keys can't manage devices or other keys, and only a signed-in session can make or delete them.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/api-keys

**The account's API keys.** Newest first. The keys themselves aren't kept, only their first characters. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { keys: [ApiKey](#apikey)[] } | The keys. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/api-keys

**Make an API key.** As many as the account's plan allows. Not with API keys.

**Body:** [NewApiKey](#newapikey)

| Answer | Body | When |
|---|---|---|
| 201 | [CreatedApiKey](#createdapikey) | Made: the answer has the key, which isn't shown again. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many keys as its plan allows. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/api-keys/{id}

**Delete an API key.** It stops working straight away. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PATCH /v1/api-keys/{id}

**Change an API key.** Whether the user's phones are told when it adds or changes matches. Its access and expiry can't change: make a new key instead. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [ApiKeyChange](#apikeychange)

| Answer | Body | When |
|---|---|---|
| 200 | [ApiKey](#apikey) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### ApiKey

A key for scripts and integrations, with only the access it was given.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `name` | string | What it's for, "RefSix import". |
| `prefix` | string | The start of the key, to recognize it: lf_ and 8 characters. |
| `scopes` | [ApiKeyScope](#apikeyscope)[] |  |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastUsedAt` (optional) | [Timestamp](data-model.md#timestamp) | To within five minutes; none until it's used. |
| `expiresAt` (optional) | [Timestamp](data-model.md#timestamp) | None for a key that doesn't expire. |
| `notify` | boolean | Whether the user's phones are told when this key adds a match, or cancels, postpones, moves or removes one that hasn't kicked off. |

### ApiKeyChange

What can change on a key after it's made.

| Field | Type | Description |
|---|---|---|
| `notify` | boolean | Tell the user's phones when this key adds or changes matches. |

### ApiKeyScope

<collection>:read, or <collection>:write (which includes reading it).

"matches:read" | "matches:write" | "match-templates:read" | "match-templates:write" | "match-records:read" | "match-records:write" | "venues:read" | "venues:write" | "competitions:read" | "competitions:write" | "referees:read" | "referees:write" | "settings:read" | "settings:write"

### CreatedApiKey

A new key, with the key itself. The server keeps only a hash, so it can't show it again.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `name` | string | What it's for, "RefSix import". |
| `prefix` | string | The start of the key, to recognize it: lf_ and 8 characters. |
| `scopes` | [ApiKeyScope](#apikeyscope)[] |  |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastUsedAt` (optional) | [Timestamp](data-model.md#timestamp) | To within five minutes; none until it's used. |
| `expiresAt` (optional) | [Timestamp](data-model.md#timestamp) | None for a key that doesn't expire. |
| `notify` | boolean | Whether the user's phones are told when this key adds a match, or cancels, postpones, moves or removes one that hasn't kicked off. |
| `key` | string | The key itself, shown only this once: send it as Authorization: Bearer <key>. |

### NewApiKey

| Field | Type | Description |
|---|---|---|
| `name` | string |  |
| `scopes` | [ApiKeyScope](#apikeyscope)[] | At least one. |
| `expiresInDays` (optional) | integer | Leave out for a key that doesn't expire. |
| `notify` (optional) | boolean | Tell the user's phones when this key adds or changes matches; off when left out. |

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
