# Devices

Where the account is signed in.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/devices

**Where the account is signed in.** Browsers and linked watches, most recently active first. Apps name themselves with an X-LawFive-Device header: garmin, and from the watch app's later versions what it runs on, garmin; model=006-B3703-00; firmware=12.30, which names it (Garmin Venu 2), and its own version, app=2026.10.30. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { devices: [Device](#device)[] } | The devices. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/devices/{id}

**Sign a device out.** Unlinks a watch or signs a browser out; its next request gets 401. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Signed out. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/devices/matches

**Which matches are on which watch.** For a match's page to say whether it's on a watch: each match in each linked watch's latest download of its next matches (GET /v1/watch/matches, from the watch or through the phone app with the watch's link), and whether the watch has it as it is now. A watch unlinked drops out; a match deleted isn't listed. Phones fetch it as they sync and keep the last answer for when there's no signal. Not with API keys. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { matches: [MatchOnWatch](#matchonwatch)[] } | The matches on watches, newest download first. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/devices/sign-out-others

**Sign out everywhere else.** Ends the account's other sessions, keeping the one asking: other browsers only, or every other device, which unlinks watches and signs phones out. Not with API keys.

**Body:** [SignOutOthers](#signoutothers)

| Answer | Body | When |
|---|---|---|
| 200 | { signedOut: integer } | How many were signed out. |
| 400 | [ApiError](#apierror) | Not browsers or all. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/devices/current/push

**Say how to reach this phone.** Keeps the handle the push relay gave this phone with its session, so signing out removes it. Needs an X-LawFive-Device header. Not with API keys. Only when `GET /v1/meta` lists `push`. Not with API keys.

**Body:** [PushHandle](#pushhandle)

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Kept. |
| 400 | [ApiError](#apierror) | The body doesn't match, or there's no device header. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/notices/{id}

**What an integration did.** The matches an API key added or changed, from a match-changed notification's id, for the phone to write the notification itself. Kept for 30 days. Not with API keys. Only when `GET /v1/meta` lists `push`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchNotice](#matchnotice) | The notice. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, not this user's, or more than 30 days old. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/account/storage

**How much of its storage the account is using.** Photos and tracks, and the limit if the account's plan has one. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [AccountStorage](#accountstorage) | The figures. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/account/plan

**The account's plan.** Its plan and limits, when it ends and what follows, and how much of each limit it's using. Only when `GET /v1/meta` lists `plans`. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [AccountPlan](#accountplan) | The plan. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### AccountPlan

The signed-in account's plan, when it ends, and what it's using.

| Field | Type | Description |
|---|---|---|
| `plan` | [PlanName](#planname) |  |
| `limits` | [PlanLimits](#planlimits) |  |
| `since` | [Timestamp](data-model.md#timestamp) |  |
| `endsAt` (optional) | [Timestamp](data-model.md#timestamp) | When it ends: the end of endsOn in the account's time zone. |
| `endsOn` (optional) | string | Its last day. |
| `then` (optional) | [PlanName](#planname) | The plan that follows when it ends. |
| `usage` | [PlanUsage](#planusage) |  |

### AccountStorage

| Field | Type | Description |
|---|---|---|
| `usedBytes` | integer | Photos and tracks on this account. |
| `limitBytes` (optional) | integer | How much it may keep; absent when this server sets no limit. |

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### Device

Somewhere the account is signed in: a browser or a linked watch.

| Field | Type | Description |
|---|---|---|
| `id` | string | The session's id, for DELETE /v1/devices/{id}. |
| `kind` | string | browser, or the app's name from its X-LawFive-Device header (garmin). |
| `name` | string | For people: "Garmin Venu 2" ("Garmin watch" when it didn't say which), "Chrome on macOS". |
| `model` (optional) | string | A watch's Garmin part number, "006-B3703-00", when it gives one. |
| `firmware` (optional) | string | A watch's firmware version, "12.30", when it gives one. |
| `appVersion` (optional) | string | The version of LawFive on it, "2026.10.30", from the app= in its X-LawFive-Device header; missing for browsers and apps from before it. |
| `linkedAt` | [Timestamp](data-model.md#timestamp) | When it signed in or was linked. |
| `lastActiveAt` | [Timestamp](data-model.md#timestamp) |  |
| `current` | boolean | true for the device making this request. |
| `watchOnly` (optional) | boolean | true for a watch's link, which only syncs matches; absent for everything else. |

### MatchNotice

What an integration (an API key, or an assignor calendar) did to the user's matches, collected over about a minute, for a phone to write as a notification.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `source` | string | Who made the changes: the API key's name, which is usually the integration's, or the assignor calendar's. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `matches` | ({ matchId: [Id](data-model.md#id), changes: [MatchNoticeChange](#matchnoticechange)[], title: string, kickoff?: [Timestamp](data-model.md#timestamp), previousKickoff?: [Timestamp](data-model.md#timestamp), timeZone?: string, venue?: string, previousVenue?: string })[] | The matches, soonest first. |

### MatchNoticeChange

added: a new match; canceled, postponed; backOn: scheduled again after being canceled or postponed; kickoff: moved to another time; venue: moved to another venue; removed: deleted.

"added" | "canceled" | "postponed" | "backOn" | "kickoff" | "venue" | "removed"

### MatchOnWatch

A match on one of the account's linked watches: in the watch's latest download of its next matches.

| Field | Type | Description |
|---|---|---|
| `matchId` | [Id](data-model.md#id) |  |
| `deviceId` | string | The watch's link, as GET /v1/devices gives it (the session's id). |
| `kind` | string | garmin, wearos or applewatch, from the watch's X-LawFive-Device header; watch when it didn't say. |
| `name` | string | For people: "Garmin Venu 2", "Galaxy Watch4", "Apple Watch Series 9" ("Garmin watch" when it didn't say which). |
| `since` | [Timestamp](data-model.md#timestamp) | When the watch first got the match as it has it now. |
| `syncedAt` | [Timestamp](data-model.md#timestamp) | The watch's latest download, which still had the match. |
| `upToDate` | boolean | false when what the watch shows of the match has changed since (teams, kickoff, format, venue, officials, notes, fee), or the match is no longer scheduled: the watch's next sync brings the change, or takes the match off. |

### PlanLimits

What a plan allows.

| Field | Type | Description |
|---|---|---|
| `matches` (optional) | integer | Matches kept, not counting deleted ones; matches recorded on a watch are never refused. Left out: no limit; 0: none at all. |
| `referees` (optional) | integer | Referees kept. Left out: no limit; 0: none at all. |
| `venues` (optional) | integer | Venues kept. Left out: no limit; 0: none at all. |
| `storageMb` (optional) | integer | Megabytes of photos and tracks; a track recorded on a watch is never refused. Left out: no limit; 0: none at all. |
| `photoMb` (optional) | integer | The largest photo, in megabytes; the server's own most, 10 MB, still applies. Left out: no limit; 0: none at all. |
| `fileMb` (optional) | integer | The largest file brought in (an import or a restore), in megabytes; the server's own most for each (5 MB and 2 GB) still applies. Left out: no limit; 0: none at all. |
| `devices` (optional) | integer | Watches and phones signed in at once; browsers don't count. Left out: no limit; 0: none at all. |
| `pushPerDay` (optional) | integer | Phone notifications a day (from midnight UTC), across all the account's phones. Left out: no limit; 0: none at all. |
| `apiKeys` (optional) | integer | API keys. Left out: no limit; 0: none at all. |
| `apiCallsPerMinute` (optional) | integer | Requests made with the account's API keys a minute, all its keys together. Left out: no limit; 0: none at all. |
| `apiCallsPerDay` (optional) | integer | Requests made with the account's API keys a day (from midnight UTC), all its keys together. Left out: no limit; 0: none at all. |
| `webhooks` (optional) | integer | Webhooks. Left out: no limit; 0: none at all. |
| `assignorCalendars` (optional) | integer | Assignor calendars. Left out: no limit; 0: none at all. |
| `addressSearchesPerDay` (optional) | integer | Address searches a day (from midnight UTC), for placing venues on the map. Left out: no limit; 0: none at all. |

### PlanName

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `name` | string |  |

### PlanUsage

How much of each limit the account is using; per-minute and per-file limits aren't counted.

| Field | Type | Description |
|---|---|---|
| `matches` | integer |  |
| `referees` | integer |  |
| `venues` | integer |  |
| `storageMb` | number | Photos and tracks, in megabytes. |
| `devices` | integer | Watches and phones signed in. |
| `pushPerDay` | integer | Notifications sent today (UTC). |
| `apiKeys` | integer |  |
| `apiCallsPerDay` | integer | Requests with the account's API keys today (UTC). |
| `webhooks` | integer |  |
| `assignorCalendars` (optional) | integer | Absent from older servers. |
| `addressSearchesPerDay` (optional) | integer | Address searches today (UTC); absent from older servers. |

### PushHandle

| Field | Type | Description |
|---|---|---|
| `handle` | string \| null | What the push relay gave this phone, which only it can read; null to stop notifications. |

### SignOutOthers

| Field | Type | Description |
|---|---|---|
| `scope` | "browsers" \| "all" | browsers: other browsers only, so watches and phones stay linked. all: every other device too. |
