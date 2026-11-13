# Assignor calendars

An assignor system's private calendar link (ArbiterSports, Assignr, HorizonWebRef, RefTown and others give each official one), which the server reads every 30 minutes into the account's matches through the import: new games added, moved ones changed, ones gone before kickoff canceled. The link is a password, so it's kept encrypted and never sent back. Only a signed-in session can manage them.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/assignor-calendars

**The account's assignor calendars.** Oldest first, each with how its latest read went. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { calendars: [AssignorCalendar](#assignorcalendar)[] } | The calendars. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars/preview

**Preview a calendar link.** Reads the link once and says what it holds: the games still to come, how many are already in LawFive, and the first three as they'd be saved. Nothing is saved. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

**Body:** [AssignorCalendarLink](#assignorcalendarlink)

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendarPreview](#assignorcalendarpreview) | What it holds. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the link can't be read (not a web address, a private address, no answer, or not a calendar); error says why, in words to show the person. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars

**Connect an assignor calendar.** Reads it straight away, adding its games still to come, then every 30 minutes. As many as the account's plan allows. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

**Body:** [NewAssignorCalendar](#newassignorcalendar)

| Answer | Body | When |
|---|---|---|
| 201 | [AssignorCalendar](#assignorcalendar) | Connected and read. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the link can't be read; error says why. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many assignor calendars as its plan allows. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PATCH /v1/assignor-calendars/{id}

**Change an assignor calendar.** Its name, notifications, pausing or resuming it, or a new link. Resuming it or a new link reads it straight away. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [AssignorCalendarChange](#assignorcalendarchange)

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendar](#assignorcalendar) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the new link can't be read; error says why. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/assignor-calendars/{id}

**Remove an assignor calendar.** It's no longer read; the matches it added stay, as ordinary matches. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Removed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars/{id}/read

**Read an assignor calendar now.** Instead of waiting for its next read; a paused one stays paused. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendar](#assignorcalendar) | Read, with how it went. |
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

### AssignorCalendar

An assignor's calendar link, read into the account's matches every 30 minutes.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `name` | string |  |
| `system` | [AssignorSystem](#assignorsystem) |  |
| `link` | string | The start of the link, to recognize it by: the whole link is a password, so it's never sent back. |
| `notify` | boolean | Tell the account's phones when it adds, moves or cancels a match. |
| `active` | boolean | false: paused, by the person or after the link stopped working; not read. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastReadAt` (optional) | [Timestamp](data-model.md#timestamp) | When it was last read, whatever happened. |
| `lastChangedAt` (optional) | [Timestamp](data-model.md#timestamp) | When a read last added or changed a match. |
| `lastResult` (optional) | { games: integer, added: integer, updated: integer, canceled: integer } | What the latest read that worked found and did. |
| `problem` (optional) | string | Why the latest read didn't work, or why it's paused. |
| `stoppedAt` (optional) | [Timestamp](data-model.md#timestamp) | When it was paused because the link stopped working. |
| `skipped` | [AssignorCalendarSkipped](#assignorcalendarskipped)[] | Events the latest read couldn't save, at most 20. |

### AssignorCalendarChange

| Field | Type | Description |
|---|---|---|
| `name` (optional) | string |  |
| `notify` (optional) | boolean |  |
| `active` (optional) | boolean | false pauses it; true starts reading it again, straight away. |
| `url` (optional) | string | A new link, such as one the assignor system made again; read straight away. |

### AssignorCalendarEvent

A game in an assignor's calendar, as it would be saved.

| Field | Type | Description |
|---|---|---|
| `title` | string | Home v Away, or the match's name. |
| `kickoff` | [Timestamp](data-model.md#timestamp) |  |
| `timeZone` (optional) | string | IANA time zone name, for example America/Los_Angeles. |
| `venue` (optional) | string |  |
| `inLawFive` | boolean | A match already in LawFive at this kickoff, which the calendar takes on without changing. |

### AssignorCalendarLink

| Field | Type | Description |
|---|---|---|
| `url` | string | The calendar link: https, http, or webcal (read as https). |
| `system` | [AssignorSystem](#assignorsystem) |  |

### AssignorCalendarPreview

What a calendar link holds, before connecting it; nothing is saved.

| Field | Type | Description |
|---|---|---|
| `calendarName` (optional) | string | What the calendar calls itself (X-WR-CALNAME). |
| `games` | integer | Games still to come. |
| `from` (optional) | [Timestamp](data-model.md#timestamp) | The first one's kickoff. |
| `to` (optional) | [Timestamp](data-model.md#timestamp) | The last one's kickoff. |
| `inLawFive` | integer | Of those, how many are already in LawFive at the same kickoff. |
| `first` | [AssignorCalendarEvent](#assignorcalendarevent)[] | The first three, as they'd be saved. |
| `skipped` | [AssignorCalendarSkipped](#assignorcalendarskipped)[] | Events that couldn't be read, at most 20. |

### AssignorCalendarSkipped

An event that couldn't be read or saved, and why.

| Field | Type | Description |
|---|---|---|
| `title` | string | The event's summary, or what's known of it. |
| `kickoff` (optional) | [Timestamp](data-model.md#timestamp) |  |
| `reason` | string |  |

### AssignorSystem

Which system a calendar link is from: ArbiterSports, Assignr, HorizonWebRef, RefTown, GotSport, Spordle, or another. Each is read the same way until it has rules of its own.

"arbiter" | "assignr" | "horizon" | "reftown" | "gotsport" | "spordle" | "other"

### NewAssignorCalendar

| Field | Type | Description |
|---|---|---|
| `url` | string | The calendar link: https, http, or webcal (read as https). |
| `system` | [AssignorSystem](#assignorsystem) |  |
| `name` | string |  |
| `notify` (optional) | boolean | true when left out. |

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
