# Calendar

A private calendar feed of the user's matches, for calendar apps to subscribe to.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/calendar

**The calendar feed's address.** Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [CalendarFeed](#calendarfeed) | The feed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | There's no feed; make one with POST. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/calendar

**Make the calendar feed, or a new address for it.** A new address replaces the old one, which stops working (calendars subscribed to it stop updating). Not with API keys.

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 201 | [CalendarFeed](#calendarfeed) | Made. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/calendar

**Turn the calendar feed off.** Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Its address stops working. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | There's no feed. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/calendar/{file}

**The calendar feed.** What calendar apps fetch: the user's matches as events, past and future, canceled ones marked so. The address is the secret; there's no other sign-in. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `file` | path | string | The feed's token and .ics. |

| Answer | Body | When |
|---|---|---|
| 200 | iCalendar | The calendar (text/calendar). |
| 403 | [ApiError](#apierror) | The account is suspended. |
| 404 | [ApiError](#apierror) | No feed has this address: it was replaced or turned off. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### CalendarFeed

The account's private calendar address. Anyone with it can see the matches in it; make a new one to stop the old one working.

| Field | Type | Description |
|---|---|---|
| `url` | string | The feed (https), for calendar apps that ask for an address. |
| `webcalUrl` | string | The same feed as webcal://, which opens the calendar app to subscribe. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastFetchedAt` (optional) | [Timestamp](data-model.md#timestamp) | When a calendar app last fetched it, to within an hour. |
