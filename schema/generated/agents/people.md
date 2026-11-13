# People

Admins see everyone on the server, approve or decline new accounts, make other admins, and make password reset links, suspend and delete accounts, and change who can sign up; and make plans, named sets of limits, and put each account in one. Everyone else gets 403.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/people

**Everyone on the server.** Waiting for approval first, then everyone else by name. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { people: [Person](#person)[] } | The accounts. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/people/{id}/approve

**Approve an account.** It can use LawFive straight away; they're emailed when the server can send email. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 200 | [Person](#person) | Approved. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/people/{id}/decline

**Decline an account.** Deletes an account that's waiting for approval. Approved accounts can't be declined. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Declined and deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 409 | [ApiError](#apierror) | The account isn't waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/people/{id}/admin

**Make or stop being an admin.** Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** { admin: boolean }

| Answer | Body | When |
|---|---|---|
| 200 | [Person](#person) | Changed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 409 | [ApiError](#apierror) | Your own account, an account waiting for approval, or one that ADMIN_EMAILS makes an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/people/{id}/plan

**Put an account in a plan.** With an optional last day (in the account's time zone) and the plan after it, the default when not given. Nothing in the account is lost if it's over the new plan's limits; only adding more is refused. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** [PlanChange](#planchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Person](#person) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, there's no such plan, or the last day has passed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/people/{id}/plan-history

**An account's plans so far.** Each change of plan, newest first: whether someone has had a trial, say. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

| Answer | Body | When |
|---|---|---|
| 200 | { changes: [PlanHistoryEntry](#planhistoryentry)[] } | The changes. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/people/{id}/suspended

**Suspend an account, or undo it.** A suspended account can't sign in, and is signed out everywhere (linked watches need linking again afterward); its API keys and calendar feed stop working. Its data is kept. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** { suspended: boolean }

| Answer | Body | When |
|---|---|---|
| 200 | [Person](#person) | Changed. |
| 400 | [ApiError](#apierror) | The body isn't { suspended: true } or { suspended: false }. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 409 | [ApiError](#apierror) | Your own account, an account waiting for approval, or one that ADMIN_EMAILS makes an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/people/{id}/unlock

**Unlock signing in.** After too many wrong passwords an account's address is locked for a while; this ends it now. A password reset ends it too. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 200 | [Person](#person) | Unlocked. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/people/{id}/reset-link

**Make a password reset link.** For someone who forgot their password, on any server: the admin sends it to them. It works once, for 24 hours. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 201 | [ResetLink](#resetlink) | Made. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 409 | [ApiError](#apierror) | Your own account (change it in Settings), or one waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/people/{id}

**Delete an account.** Deletes the account and everything in it. It can't be undone. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | string |  |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such account. |
| 409 | [ApiError](#apierror) | Your own account (delete it in Settings), or one that ADMIN_EMAILS makes an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/plans

**The plans.** Every plan, with how many accounts are in each, and the sign-up trial. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [Plans](#plans) | The plans. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/plans

**Make a plan.** Not with API keys.

**Body:** [PlanInput](#planinput)

| Answer | Body | When |
|---|---|---|
| 201 | [Plan](#plan) | Made. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 409 | [ApiError](#apierror) | Another plan has this code. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/plans/{code}

**Change a plan.** Its name, code or limits; everyone in it gets the new limits straight away. A new code breaks anything outside LawFive that refers to the old one. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `code` | path | string |  |

**Body:** [PlanInput](#planinput)

| Answer | Body | When |
|---|---|---|
| 200 | [Plan](#plan) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such plan. |
| 409 | [ApiError](#apierror) | Another plan has the new code. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/plans/{code}

**Delete a plan.** Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `code` | path | string |  |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such plan. |
| 409 | [ApiError](#apierror) | It's in use (Plan.inUse): move its accounts to another plan first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/plan-settings

**Choose the default plan and the sign-up trial.** Not with API keys.

**Body:** [PlanSettings](#plansettings)

| Answer | Body | When |
|---|---|---|
| 200 | [Plans](#plans) | Changed: the plans as they are now. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or there's no such plan. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/server-settings

**The server's settings.** Each setting an admin can change, where its value comes from, and the value (not for secrets). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { settings: [ServerSettingView](#serversettingview)[] } | The settings. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/server-settings

**Change the server's settings.** Sets or clears the settings sent; one the environment sets can't be changed, and if any can't be, none are. Takes effect straight away. GET /v1/meta says what's offered. Not with API keys.

**Body:** [ServerSettings](#serversettings)

| Answer | Body | When |
|---|---|---|
| 200 | { settings: [ServerSettingView](#serversettingview)[] } | Changed: the settings as they are now. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, a value isn't one the setting takes, or the environment sets it. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/setup/check

**Check a new server's setup code.** While nobody has an account, whether this is the code in the server's logs. The first account is made through sign-up, with the code as setupCode. No sign-in needed.

**Body:** { code: string }

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | It's the code. |
| 400 | [ApiError](#apierror) | It isn't. |
| 404 | [ApiError](#apierror) | The server is already set up, or doesn't need a code. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/setup/finish

**Finish setting the server up.** The first account finished or skipped the setup wizard, so it doesn't open again. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Done. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/server-settings/network

**How the server sees visitors.** The address this server sees the asking admin at, and the TRUSTED_PROXIES and TRUSTED_IP_HEADER in use, so Settings → Server can show whether a proxy in front of it is believed. Both are environment values, not changed here. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [NetworkView](#networkview) | As it is now. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/server-settings/test-email

**Send a test email.** To the signed-in admin, through the email settings in use. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { to: string } | Sent. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 409 | [ApiError](#apierror) | Email isn't set up. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |
| 502 | [ApiError](#apierror) | The SMTP server didn't take it; the error says why. |

### POST /v1/server-settings/test-push

**Send a test notification.** To the signed-in admin's own phones that have notifications on, through the push relay. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { sent: integer } | The relay took it. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 409 | [ApiError](#apierror) | Notifications are off on this server, or none of the admin's phones has them on. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |
| 502 | [ApiError](#apierror) | The relay didn't take it; the error says why. |

## Types

### AccountStatus

pending: made on a server that approves new accounts, and not approved yet. It can sign in, but only GET /v1/account answers. suspended: an admin suspended it; it can't sign in, and its API keys and calendar feed stop working, but its data is kept.

"active" | "pending" | "suspended"

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### NetworkView

How the server tells visitors apart, for its limits on tries. Both settings are environment values only.

| Field | Type | Description |
|---|---|---|
| `yourAddress` | string | The address this server sees the request coming from, after believing the trusted proxies. |
| `trustedProxies` | string[] | TRUSTED_PROXIES: the proxies believed about the visitor's address; empty, none. |
| `trustedIpHeader` (optional) | string | TRUSTED_IP_HEADER, when set. |

### Person

An account on this server, as an admin sees it.

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `name` | string |  |
| `email` | string |  |
| `status` | [AccountStatus](#accountstatus) |  |
| `admin` | boolean |  |
| `adminFromSetting` | boolean | An admin because the server's ADMIN_EMAILS lists them, which the web app can't change. |
| `joinedAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastActiveAt` (optional) | [Timestamp](data-model.md#timestamp) | When one of their devices last used the account; none if never signed in since joining. |
| `invitedBy` (optional) | string | The name of the admin whose invitation they joined with. |
| `plan` | [PersonPlan](#personplan) | Their plan. |
| `lockedUntil` (optional) | [Timestamp](data-model.md#timestamp) | Signing in is refused until then, after too many wrong passwords; Unlock ends it now. |

### PersonPlan

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `name` | string |  |
| `endsAt` (optional) | [Timestamp](data-model.md#timestamp) |  |
| `endsOn` (optional) | string |  |
| `then` (optional) | [PlanName](#planname) |  |

### Plan

A named set of limits.

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `name` | string |  |
| `limits` | [PlanLimits](#planlimits) |  |
| `default` | boolean | New accounts join it, and accounts given no plan are in it. |
| `people` | integer | Accounts in it now. |
| `inUse` | boolean | Something refers to it (an account, an account's next plan, an unused invitation, the sign-up trial, or it's the default), so it can't be deleted. |

### PlanChange

Putting an account in a plan.

| Field | Type | Description |
|---|---|---|
| `plan` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `endsOn` (optional) | string | Its last day, in the account's time zone; none: it doesn't end. |
| `then` (optional) | string | The plan after it ends; the default when left out. |

### PlanHistoryEntry

| Field | Type | Description |
|---|---|---|
| `from` (optional) | [PlanName](#planname) | None for the first entry. |
| `to` | [PlanName](#planname) |  |
| `at` | [Timestamp](data-model.md#timestamp) |  |
| `reason` | "sign-up" \| "invite" \| "admin" \| "ended" | sign-up: joined (a trial, or the default then); invite: joined with an invitation's plan; admin: an admin changed it; ended: the plan before it ended. |
| `by` (optional) | string | The admin's name, for reason admin. |
| `endsAt` (optional) | [Timestamp](data-model.md#timestamp) | When this one was set to end. |

### PlanInput

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `name` | string |  |
| `limits` | [PlanLimits](#planlimits) |  |

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

### PlanSettings

| Field | Type | Description |
|---|---|---|
| `default` (optional) | string | The plan new accounts join. |
| `signUpTrial` (optional) | [SignUpTrial](#signuptrial) \| null | null: no trial. |

### Plans

| Field | Type | Description |
|---|---|---|
| `plans` | [Plan](#plan)[] | By name. |
| `signUpTrial` (optional) | [SignUpTrial](#signuptrial) |  |

### ResetLink

A link an admin sends someone who forgot their password, for servers without email.

| Field | Type | Description |
|---|---|---|
| `link` | string | The web app's page for choosing a new password. It works once. |
| `expiresAt` | [Timestamp](data-model.md#timestamp) |  |

### ServerSettingView

A server setting as the admin page shows it.

| Field | Type | Description |
|---|---|---|
| `key` | "signUp" \| "smtpUrl" \| "mailFrom" \| "mapStyleUrl" \| "mapStyleDarkUrl" \| "mapStyleAttribution" \| "mapTileUrl" \| "mapAttribution" \| "mapSatelliteUrl" \| "mapSatelliteAttribution" \| "geocoderUrl" \| "weatherUrl" \| "weatherHistoryUrl" \| "weatherApiKey" \| "weatherDailyLimit" \| "webhookAllowPrivate" |  |
| `env` | string | Its environment variable. |
| `source` | "environment" \| "admin" \| "default" | environment: set there, so fixed; admin: set in the web app; default: neither. |
| `value` (optional) | string | The value in use, when it's set and not a secret. |
| `secret` (optional) | true | Never sent back: set says whether it has a value. |
| `set` (optional) | boolean |  |

### ServerSettings

Settings for the whole server that admins change in the web app, sending only those that change. One the environment sets is fixed there and can't be changed.

| Field | Type | Description |
|---|---|---|
| `signUp` (optional) | [SignUpMode](#signupmode) \| null | Who can make an account (SIGN_UP). |
| `smtpUrl` (optional) | string \| null | Email through an SMTP server: smtp://user:password@host:587 or smtps://…:465. A secret: never sent back (SMTP_URL). null or "" clears it, back to the default. |
| `mailFrom` (optional) | string \| null | The sender, "LawFive <lawfive@example.com>" (MAIL_FROM). null or "" clears it, back to the default. |
| `mapStyleUrl` (optional) | string \| null | A MapLibre style for the map, or off for raster tiles (MAP_STYLE_URL). null or "" clears it, back to the default. |
| `mapStyleDarkUrl` (optional) | string \| null | The style for dark mode (MAP_STYLE_DARK_URL). null or "" clears it, back to the default. |
| `mapStyleAttribution` (optional) | string \| null | The style's credit, as HTML (MAP_STYLE_ATTRIBUTION). null or "" clears it, back to the default. |
| `mapTileUrl` (optional) | string \| null | Raster tiles, with {z}, {x} and {y} (MAP_TILE_URL). null or "" clears it, back to the default. |
| `mapAttribution` (optional) | string \| null | The tiles' credit, as HTML (MAP_ATTRIBUTION). null or "" clears it, back to the default. |
| `mapSatelliteUrl` (optional) | string \| null | Satellite tiles, with the provider's key (MAP_SATELLITE_URL). null or "" clears it, back to the default. |
| `mapSatelliteAttribution` (optional) | string \| null | Their credit, as HTML (MAP_SATELLITE_ATTRIBUTION). null or "" clears it, back to the default. |
| `geocoderUrl` (optional) | string \| null | Address search (Nominatim-compatible), or off (GEOCODER_URL). null or "" clears it, back to the default. |
| `weatherUrl` (optional) | string \| null | Forecasts (Open-Meteo-compatible), or off (WEATHER_URL). null or "" clears it, back to the default. |
| `weatherHistoryUrl` (optional) | string \| null | Past weather for played matches, or off (WEATHER_HISTORY_URL). null or "" clears it, back to the default. |
| `weatherApiKey` (optional) | string \| null | For a paid plan. A secret: never sent back (WEATHER_API_KEY). null or "" clears it, back to the default. |
| `weatherDailyLimit` (optional) | string \| null | Weather calls a day at most (WEATHER_DAILY_LIMIT). null or "" clears it, back to the default. |
| `webhookAllowPrivate` (optional) | string \| null | true lets webhooks reach private and local addresses (WEBHOOK_ALLOW_PRIVATE). null or "" clears it, back to the default. |

### SignUpMode

Who can make an account: open, anyone; approval, anyone, but an admin approves the account before it can be used; closed, only people with an invitation.

"open" | "approval" | "closed"

### SignUpTrial

New accounts start in this plan for these days, then go to the default.

| Field | Type | Description |
|---|---|---|
| `plan` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `days` | integer |  |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.
