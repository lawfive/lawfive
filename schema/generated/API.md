# LawFive API (v1)

<!-- Generated from schema/src/endpoints.ts and api.ts by `pnpm generate` in schema/. Don't edit; change those and regenerate. -->

The API of a LawFive server, which the web app, the watch apps and the phone apps use. The same reference as OpenAPI 3.1 is [openapi.json](openapi.json), for generating code or loading into an API tool.

- **Address:** everything is under `/v1` on the server: `https://api.lawfive.app/v1/...` for LawFive's own service, or your own server's address.
- **Signing in:** apps sign in (or link, for a watch), take the token and send it as `Authorization: Bearer <token>`. Browsers use the session cookie and must send an `Origin` header matching the server. Everything needs signing in unless it says otherwise; without it the answer is `401`.
- **API keys:** for scripts and integrations, made in Settings and sent the same way (`Authorization: Bearer lf_...`). Each key can use only the collections it was given; each endpoint says what a key needs, and a key without it gets `403`. See [API keys](#api-keys).
- **Errors:** a JSON body with `error`, a sentence a person can read ([ApiError](#apierror)); the account and linking endpoints have their own shapes ([AuthError](#autherror), [OAuthError](#oautherror)). Anything unexpected is a `500`. Every answer, errors included, has a `LawFive-Version` header with the server's version; an error without it came from something in front of the server (a proxy while the server restarts, say), so treat it as not reaching the server and try again rather than acting on its status.
- **Data:** JSON. Ids are UUIDs, times are ISO 8601 with a UTC offset, durations are whole seconds. Records are described in the data model ([docs/MATCH_CONFIG.md](../../docs/MATCH_CONFIG.md) and [json-schema/](json-schema/)).
- **Older servers:** check `capabilities` in `GET /v1/meta` before using address search or weather, which a server can switch off; ignore fields and capabilities you don't know.

## Endpoints

| Endpoint | What it does |
|---|---|
| [`GET /health`](#get-health) | Is the server up |
| [`GET /v1/meta`](#get-v1meta) | What this server offers |
| [`GET /v1/openapi.json`](#get-v1openapijson) | This server's API, as OpenAPI |
| [`POST /v1/auth/sign-up/email`](#post-v1authsign-upemail) | Make an account |
| [`POST /v1/auth/sign-in/email`](#post-v1authsign-inemail) | Sign in |
| [`POST /v1/auth/request-password-reset`](#post-v1authrequest-password-reset) | Email a password reset link |
| [`POST /v1/auth/reset-password`](#post-v1authreset-password) | Choose a new password |
| [`POST /v1/auth/change-password`](#post-v1authchange-password) | Change the password |
| [`POST /v1/auth/update-user`](#post-v1authupdate-user) | Change the account's name |
| [`POST /v1/auth/sign-out`](#post-v1authsign-out) | Sign out |
| [`GET /v1/auth/get-session`](#get-v1authget-session) | Who is signed in |
| [`GET /v1/account`](#get-v1account) | The signed-in account |
| [`PUT /v1/account/email`](#put-v1accountemail) | Change the account's email |
| [`DELETE /v1/account/email`](#delete-v1accountemail) | Cancel a change of email |
| [`POST /v1/account/email/confirm`](#post-v1accountemailconfirm) | Confirm a new email address |
| [`POST /v1/account/delete`](#post-v1accountdelete) | Delete the account |
| [`POST /v1/auth/device/code`](#post-v1authdevicecode) | Ask for a linking code |
| [`GET /v1/auth/device`](#get-v1authdevice) | Look up a code |
| [`POST /v1/auth/device/approve`](#post-v1authdeviceapprove) | Approve a code |
| [`POST /v1/auth/device/deny`](#post-v1authdevicedeny) | Refuse a code |
| [`POST /v1/auth/device/token`](#post-v1authdevicetoken) | Poll for the token |
| [`GET /v1/matches`](#get-v1matches) | The user's matches |
| [`GET /v1/matches/{id}`](#get-v1matchesid) | One match |
| [`PUT /v1/matches/{id}`](#put-v1matchesid) | Save a match |
| [`DELETE /v1/matches/{id}`](#delete-v1matchesid) | Delete a match |
| The same for `match-templates`, `match-records`, `venues`, `competitions`, `referees`, `settings` | See [Records](#records) |
| [`GET /v1/match-records/{id}/track`](#get-v1match-recordsidtrack) | A match report's track |
| [`PUT /v1/match-records/{id}/track`](#put-v1match-recordsidtrack) | Upload a match report's track |
| [`PUT /v1/match-records/{id}/track/pitch`](#put-v1match-recordsidtrackpitch) | Mark where the pitch is |
| [`DELETE /v1/match-records/{id}/track/pitch`](#delete-v1match-recordsidtrackpitch) | Forget where the pitch is |
| [`DELETE /v1/match-records/{id}/track`](#delete-v1match-recordsidtrack) | Delete a match report's track |
| [`GET /v1/changes`](#get-v1changes) | Changes since a cursor |
| [`GET /v1/people`](#get-v1people) | Everyone on the server |
| [`POST /v1/people/{id}/approve`](#post-v1peopleidapprove) | Approve an account |
| [`POST /v1/people/{id}/decline`](#post-v1peopleiddecline) | Decline an account |
| [`PUT /v1/people/{id}/admin`](#put-v1peopleidadmin) | Make or stop being an admin |
| [`PUT /v1/people/{id}/plan`](#put-v1peopleidplan) | Put an account in a plan |
| [`GET /v1/people/{id}/plan-history`](#get-v1peopleidplan-history) | An account's plans so far |
| [`PUT /v1/people/{id}/suspended`](#put-v1peopleidsuspended) | Suspend an account, or undo it |
| [`POST /v1/people/{id}/unlock`](#post-v1peopleidunlock) | Unlock signing in |
| [`POST /v1/people/{id}/reset-link`](#post-v1peopleidreset-link) | Make a password reset link |
| [`DELETE /v1/people/{id}`](#delete-v1peopleid) | Delete an account |
| [`GET /v1/plans`](#get-v1plans) | The plans |
| [`POST /v1/plans`](#post-v1plans) | Make a plan |
| [`PUT /v1/plans/{code}`](#put-v1planscode) | Change a plan |
| [`DELETE /v1/plans/{code}`](#delete-v1planscode) | Delete a plan |
| [`PUT /v1/plan-settings`](#put-v1plan-settings) | Choose the default plan and the sign-up trial |
| [`GET /v1/server-settings`](#get-v1server-settings) | The server's settings |
| [`PUT /v1/server-settings`](#put-v1server-settings) | Change the server's settings |
| [`POST /v1/setup/check`](#post-v1setupcheck) | Check a new server's setup code |
| [`POST /v1/setup/finish`](#post-v1setupfinish) | Finish setting the server up |
| [`GET /v1/server-settings/network`](#get-v1server-settingsnetwork) | How the server sees visitors |
| [`POST /v1/server-settings/test-email`](#post-v1server-settingstest-email) | Send a test email |
| [`POST /v1/server-settings/test-push`](#post-v1server-settingstest-push) | Send a test notification |
| [`POST /v1/app-sign-in`](#post-v1app-sign-in) | A code to sign a phone in |
| [`GET /v1/app-sign-in/{id}`](#get-v1app-sign-inid) | Whether a phone has used a code |
| [`POST /v1/app-sign-in/check`](#post-v1app-sign-incheck) | Whose a code is |
| [`POST /v1/app-sign-in/redeem`](#post-v1app-sign-inredeem) | Swap a code for a session |
| [`GET /v1/invites`](#get-v1invites) | The invitations |
| [`POST /v1/invites`](#post-v1invites) | Invite someone |
| [`DELETE /v1/invites/{id}`](#delete-v1invitesid) | Cancel an invitation |
| [`GET /v1/invite/{token}`](#get-v1invitetoken) | Look up an invitation |
| [`POST /v1/import/matches`](#post-v1importmatches) | Import matches |
| [`POST /v1/import/file`](#post-v1importfile) | Import matches from a file |
| [`GET /v1/assignor-calendars`](#get-v1assignor-calendars) | The account's assignor calendars |
| [`POST /v1/assignor-calendars/preview`](#post-v1assignor-calendarspreview) | Preview a calendar link |
| [`POST /v1/assignor-calendars`](#post-v1assignor-calendars) | Connect an assignor calendar |
| [`PATCH /v1/assignor-calendars/{id}`](#patch-v1assignor-calendarsid) | Change an assignor calendar |
| [`DELETE /v1/assignor-calendars/{id}`](#delete-v1assignor-calendarsid) | Remove an assignor calendar |
| [`POST /v1/assignor-calendars/{id}/read`](#post-v1assignor-calendarsidread) | Read an assignor calendar now |
| [`GET /v1/calendar`](#get-v1calendar) | The calendar feed's address |
| [`POST /v1/calendar`](#post-v1calendar) | Make the calendar feed, or a new address for it |
| [`DELETE /v1/calendar`](#delete-v1calendar) | Turn the calendar feed off |
| [`GET /v1/calendar/{file}`](#get-v1calendarfile) | The calendar feed |
| [`GET /v1/stats`](#get-v1stats) | Stats on the user's games |
| [`GET /v1/stats/games.csv`](#get-v1statsgamescsv) | The games, as a spreadsheet |
| [`GET /v1/devices`](#get-v1devices) | Where the account is signed in |
| [`DELETE /v1/devices/{id}`](#delete-v1devicesid) | Sign a device out |
| [`GET /v1/devices/matches`](#get-v1devicesmatches) | Which matches are on which watch |
| [`POST /v1/devices/sign-out-others`](#post-v1devicessign-out-others) | Sign out everywhere else |
| [`PUT /v1/devices/current/push`](#put-v1devicescurrentpush) | Say how to reach this phone |
| [`GET /v1/notices/{id}`](#get-v1noticesid) | What an integration did |
| [`GET /v1/account/storage`](#get-v1accountstorage) | How much of its storage the account is using |
| [`GET /v1/account/plan`](#get-v1accountplan) | The account's plan |
| [`GET /v1/attachments`](#get-v1attachments) | Attachments of a kind of record |
| [`POST /v1/attachments`](#post-v1attachments) | Upload an attachment |
| [`PUT /v1/attachments/{id}`](#put-v1attachmentsid) | Change an attachment |
| [`PUT /v1/attachments/{id}/file`](#put-v1attachmentsidfile) | Replace an attachment's file |
| [`DELETE /v1/attachments/{id}`](#delete-v1attachmentsid) | Delete an attachment |
| [`GET /v1/attachments/{id}/file`](#get-v1attachmentsidfile) | An attachment's file |
| [`GET /v1/attachments/{id}/thumb`](#get-v1attachmentsidthumb) | An attachment's thumbnail |
| [`GET /v1/export`](#get-v1export) | Download everything |
| [`POST /v1/restore`](#post-v1restore) | Restore from an export |
| [`GET /v1/matches/{id}/share`](#get-v1matchesidshare) | A match's share link |
| [`POST /v1/matches/{id}/share`](#post-v1matchesidshare) | Share a match |
| [`DELETE /v1/matches/{id}/share`](#delete-v1matchesidshare) | Stop sharing a match |
| [`GET /v1/shared/{token}`](#get-v1sharedtoken) | A shared match |
| [`GET /v1/shared/{token}/track`](#get-v1sharedtokentrack) | A shared match's track |
| [`GET /v1/webhooks`](#get-v1webhooks) | The account's webhooks |
| [`POST /v1/webhooks`](#post-v1webhooks) | Add a webhook |
| [`PUT /v1/webhooks/{id}`](#put-v1webhooksid) | Change a webhook |
| [`DELETE /v1/webhooks/{id}`](#delete-v1webhooksid) | Delete a webhook |
| [`GET /v1/webhooks/{id}/deliveries`](#get-v1webhooksiddeliveries) | A webhook's deliveries |
| [`POST /v1/webhooks/{id}/test`](#post-v1webhooksidtest) | Send a test |
| [`GET /v1/api-keys`](#get-v1api-keys) | The account's API keys |
| [`POST /v1/api-keys`](#post-v1api-keys) | Make an API key |
| [`DELETE /v1/api-keys/{id}`](#delete-v1api-keysid) | Delete an API key |
| [`PATCH /v1/api-keys/{id}`](#patch-v1api-keysid) | Change an API key |
| [`GET /v1/watch/matches`](#get-v1watchmatches) | The next matches, for the watch |
| [`POST /v1/watch/records`](#post-v1watchrecords) | Upload a finished match |
| [`POST /v1/watch/tracks`](#post-v1watchtracks) | Upload part of a match's track |
| [`POST /v1/watch/pitch`](#post-v1watchpitch) | Pitch corners from the watch |
| [`POST /v1/watch/screen`](#post-v1watchscreen) | The match screen chosen on the watch |
| [`POST /v1/watch/fee`](#post-v1watchfee) | Mark a fee paid from the watch |
| [`GET /v1/geocode`](#get-v1geocode) | Find an address |
| [`GET /v1/quiz`](#get-v1quiz) | The quiz's questions |
| [`GET /v1/weather`](#get-v1weather) | Weather for matches in a window |
| [`GET /v1/weather/{matchId}`](#get-v1weathermatchid) | One match's weather |

## Server

What the server is and offers.

### GET /health

**Is the server up.** Answers 503 if the server can't reach its database within 2 seconds, for Docker's healthcheck (ADM-7). Other services, such as weather or email, don't affect it. No sign-in needed.

| Answer | Body | When |
|---|---|---|
| 200 | `ok` (text) | It is. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |
| 503 | `database unavailable` (text) | It can't reach its database. |

### GET /v1/meta

**What this server offers.** The API version and capabilities, the map tiles to use and the data providers to credit. Apps check capabilities before using geocode or weather, which a server can switch off. No sign-in needed.

| Answer | Body | When |
|---|---|---|
| 200 | [ServerMeta](#servermeta) | The server's description. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/openapi.json

**This server's API, as OpenAPI.** The whole API as OpenAPI 3.1, for this server's version and address, so a client or an AI agent can work from what this server really does. About 340 KB, or much less compressed; https://lawfive.dev/llms.txt lists the same as smaller pages (AGT-3). No sign-in needed.

| Answer | Body | When |
|---|---|---|
| 200 | { openapi: "3.1.0" } | The description. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Accounts

Signing up, in and out (Better Auth's endpoints). Browsers keep the session in a cookie and must send an Origin header matching the server's address; apps send no Origin, take the token from the set-auth-token response header and send it as Authorization: Bearer <token>.

### POST /v1/auth/sign-up/email

**Make an account.** Signs the new account in. With SIGN_UP=closed only an invitation can make one; with SIGN_UP=approval the account is pending until an admin approves it (USR-2 to USR-4). An address in ADMIN_EMAILS without an invitation is pending even when sign-up is open (SEC-8). A new server's first account needs the setupCode from its logs (ADM-5). No sign-in needed.

**Body:** { name: [AccountName](#accountname), email: string, password: string, invite?: string }

| Answer | Body | When |
|---|---|---|
| 200 | { token: string \| null, user: [User](#user) } | Made and signed in. The user's status is pending when it waits for approval. Header: `set-auth-token`. |
| 400 | [AuthError](#autherror) | Not allowed: an invalid email, a name that's empty or over 100 characters (INVALID_NAME, USR-10), a password that's too short or long, sign-up is closed (SIGN_UP_CLOSED), or the invitation isn't valid (INVITE_INVALID) or is for another address (INVITE_EMAIL_MISMATCH). |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 422 | [AuthError](#autherror) | An account with this email already exists. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/sign-in/email

**Sign in.** No sign-in needed.

**Body:** { email: string, password: string, rememberMe?: boolean }

| Answer | Body | When |
|---|---|---|
| 200 | { redirect: boolean, token: string, user: [User](#user) } | Signed in. Header: `set-auth-token`. |
| 401 | [AuthError](#autherror) | Wrong email or password. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's, the account is suspended (ACCOUNT_SUSPENDED, USR-7), or a phone signing in to an account that already has as many watches and phones as its plan allows (DEVICE_LIMIT, PLAN-7). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [AuthError](#autherror) | Too many tries from this address (SEC-2), or too many wrong passwords for this email address (ACCOUNT_LOCKED, SEC-12): after 5 in a row it's locked for a minute, doubling to at most an hour, and even the right password waits. Retry-After says how long; resetting the password ends it. |

### POST /v1/auth/request-password-reset

**Email a password reset link.** When the server can send email (the email capability), emails a link to the web app's page for choosing a new password; it works once, for an hour (USR-7). The answer is the same whether or not there's an account with the address. Without email, an admin makes a link instead (POST /v1/people/{id}/reset-link). No sign-in needed.

**Body:** { email: string, redirectTo?: string }

| Answer | Body | When |
|---|---|---|
| 200 | { status: true, message: string } | Emailed, if there's an account with the address. |
| 400 | [AuthError](#autherror) | The server can't send email (RESET_PASSWORD_DISABLED), or the address isn't valid. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/reset-password

**Choose a new password.** With the token from a reset link, emailed or made by an admin (USR-7). Devices already signed in stay signed in. It also ends a lock after too many wrong passwords (SEC-12). No sign-in needed.

**Body:** { newPassword: string, token: string }

| Answer | Body | When |
|---|---|---|
| 200 | { status: true } | Changed; sign in with it. |
| 400 | [AuthError](#autherror) | The link was used, has expired or is mistyped (INVALID_TOKEN), or the password is too short or long. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/change-password

**Change the password.** Needs the current password (USR-7).

**Body:** { currentPassword: string, newPassword: string, revokeOtherSessions?: boolean }

| Answer | Body | When |
|---|---|---|
| 200 | { token: string \| null, user: [User](#user) } | Changed. |
| 400 | [AuthError](#autherror) | The current password is wrong (INVALID_PASSWORD), or the new one is too short or long. |
| 401 | [AuthError](#autherror) | Not signed in. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/update-user

**Change the account's name.** Better Auth's own endpoint, open only to the name (USR-10): the same rule as signing up, 1 to 100 characters with spaces at either end trimmed. GET /v1/account and get-session give the new name straight away.

**Body:** [NameChange](#namechange)

| Answer | Body | When |
|---|---|---|
| 200 | { status: true } | Changed. |
| 400 | [AuthError](#autherror) | The name is empty or longer than 100 characters, or the body has something besides the name (INVALID_NAME). |
| 401 | [AuthError](#autherror) | Not signed in. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's, or a watch's link (WATCH_ONLY). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/sign-out

**Sign out.** Ends this session. To sign out another device, use DELETE /v1/devices/{id}. No sign-in needed.

**Body:** {}

| Answer | Body | When |
|---|---|---|
| 200 | { success: true } | Signed out. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/auth/get-session

**Who is signed in.** No sign-in needed.

| Answer | Body | When |
|---|---|---|
| 200 | { session: [Session](#session), user: [User](#user) } \| null | The session and account, or null when not signed in. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/account

**The signed-in account.** Its status and whether it's an admin. The one endpoint a pending account (USR-4) can use; every other gets 403. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | The account. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/account/email

**Change the account's email.** With the password, to confirm it's them (USR-7). An address in the server's ADMIN_EMAILS can't be changed here, and can't be changed to. When the server can send email (the email capability), the new address is emailed a link that changes it when followed, once, within 24 hours (USR-9), and the old address keeps working until then; asking again replaces the link. Without email, it changes straight away. Not with API keys.

**Body:** [EmailChange](#emailchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | Changed (the server can't send email), or already the account's address. |
| 202 | [Account](#account) | A link was emailed to the new address: pendingEmail says which, and pendingEmailUntil until when. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The address isn't valid, or the password is wrong. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 409 | [ApiError](#apierror) | Another account has the address, or ADMIN_EMAILS lists the old or new one. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/account/email

**Cancel a change of email.** The link emailed to the new address stops working (USR-9). Nothing to cancel is fine too. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | Canceled, or there was nothing waiting. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/account/email/confirm

**Confirm a new email address.** What the web app's /confirm-email/<token> page sends, signed in or not (USR-9): the account's address becomes the new one, and the old address is told. It doesn't sign anyone in. The link works once, for 24 hours. No sign-in needed.

**Body:** [EmailConfirmation](#emailconfirmation)

| Answer | Body | When |
|---|---|---|
| 200 | { email: string } | Changed. |
| 400 | [ApiError](#apierror) | The link was used, canceled, replaced by a newer one, has expired or is mistyped. |
| 409 | [ApiError](#apierror) | Another account took the address meanwhile, or ADMIN_EMAILS lists the old or new one. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/account/delete

**Delete the account.** With the password, to confirm it's them (USR-7). Deletes the account and everything in it, signs out every device and stops its API keys and calendar feed. Refused for the only admin while there are other accounts. Not with API keys.

**Body:** { password: string }

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 400 | [ApiError](#apierror) | The password is wrong. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 409 | [ApiError](#apierror) | It's the server's only admin; make someone else an admin first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Linking a watch

A watch links to an account with a code (RFC 8628): it asks for a code and shows it, someone signed in enters it on the web app's Link page and approves it, and the watch, polling meanwhile, gets its own token. That token only reaches the watch's endpoints (/v1/watch/), and of the account endpoints only sign-out and get-session (SEC-13); anything else answers 403.

### POST /v1/auth/device/code

**Ask for a linking code.** Step 1, from the watch. Codes last 10 minutes. No sign-in needed.

**Body:** { client_id: "lawfive-garmin", scope?: string }

| Answer | Body | When |
|---|---|---|
| 200 | [DeviceCode](#devicecode) | A code to show. |
| 400 | [OAuthError](#oautherror) | Not a known app (invalid_client). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/auth/device

**Look up a code.** Step 2, from the Link page. Signed in, it also claims the code for this session, which approving or refusing it needs. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `user_code` | query | string | The code the watch shows. |

| Answer | Body | When |
|---|---|---|
| 200 | { user_code: string, status: "pending" \| "approved" \| "denied", client_id?: string, device_name?: string, scope?: string \| null } | The code is waiting. |
| 400 | [OAuthError](#oautherror) | No such code, or it has expired. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/device/approve

**Approve a code.** Step 2, after the lookup: links the watch to the signed-in account.

**Body:** { userCode: string }

| Answer | Body | When |
|---|---|---|
| 200 | { success: true } | Approved; the watch's next poll gets its token. |
| 400 | [OAuthError](#oautherror) | No such code, it has expired, or it wasn't looked up first. |
| 401 | [OAuthError](#oautherror) | Not signed in. |
| 403 | [AuthError](#autherror) | The account is waiting for approval (ACCOUNT_PENDING), or already has as many watches and phones as its plan allows (DEVICE_LIMIT, PLAN-7). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/device/deny

**Refuse a code.**

**Body:** { userCode: string }

| Answer | Body | When |
|---|---|---|
| 200 | { success: true } | Refused; the watch's next poll gets access_denied. |
| 400 | [OAuthError](#oautherror) | No such code, it has expired, or it wasn't looked up first. |
| 401 | [OAuthError](#oautherror) | Not signed in. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/device/token

**Poll for the token.** Step 3, from the watch, every interval seconds until it's approved, refused or expired. No sign-in needed.

**Body:** { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: string, client_id: string }

| Answer | Body | When |
|---|---|---|
| 200 | [DeviceToken](#devicetoken) | Approved: the watch's token, which only reaches the watch's endpoints (SEC-13). |
| 400 | [OAuthError](#oautherror) | Not yet (authorization_pending), too often (slow_down), refused (access_denied) or expired (expired_token). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Records

The user's records, one collection per kind. Ids are UUIDs made by the client, so a record created offline keeps its id. Every change raises version; an update sends the version it last saw and gets 409 if the record changed in the meantime. Deleted records are kept as markers so other devices learn of the deletion.

| Collection | Record | Saved as | Notes |
|---|---|---|---|
| `/v1/matches` | [Match](json-schema/Match.json) | [MatchInput](json-schema/MatchInput.json) |  |
| `/v1/match-templates` | [MatchTemplate](json-schema/MatchTemplate.json) | [MatchTemplateInput](json-schema/MatchTemplateInput.json) |  |
| `/v1/match-records` | [MatchRecord](json-schema/MatchRecord.json) | [MatchRecordInput](json-schema/MatchRecordInput.json) | Watches upload theirs through POST /v1/watch/records instead. |
| `/v1/venues` | [Venue](json-schema/Venue.json) | [VenueInput](json-schema/VenueInput.json) |  |
| `/v1/competitions` | [Competition](json-schema/Competition.json) | [CompetitionInput](json-schema/CompetitionInput.json) |  |
| `/v1/referees` | [Referee](json-schema/Referee.json) | [RefereeInput](json-schema/RefereeInput.json) |  |
| `/v1/settings` | [UserSettings](json-schema/UserSettings.json) | [UserSettingsInput](json-schema/UserSettingsInput.json) | There's one per user: create it once, then update it. |

Each has the same four endpoints, shown here for matches.

### GET /v1/matches

**The user's matches.** Every match that isn't deleted, oldest change first. API keys: need `matches:read`.

| Answer | Body | When |
|---|---|---|
| 200 | { items: [Match](json-schema/Match.json)[] } | The matches. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/matches/{id}

**One match.** Deleted ones too, with deletedAt set. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [Match](json-schema/Match.json) | The match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/matches/{id}

**Save a match.** Creates the match (send no version) or updates it (send the version you last saw). Saving a deleted record brings it back. API keys: need `matches:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [MatchInput](json-schema/MatchInput.json)

| Answer | Body | When |
|---|---|---|
| 200 | [Match](json-schema/Match.json) | Updated; version is raised. |
| 201 | [Match](json-schema/Match.json) | Created, at version 1. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The id isn't a UUID, the body's id differs from the URL's, or the body doesn't match the schema (issues lists the problems). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write, or the account waiting for approval; or a new match over the plan's limit (PLAN-4). |
| 409 | { error: string, current?: [Match](json-schema/Match.json) } | It changed since the version sent (current is the record as it is now), the id belongs to another kind of record, or it would duplicate another (a match's external id, a second settings record). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/matches/{id}

**Delete a match.** Marks it deleted; it stays as a marker so other devices hear of it. Deleting it again changes nothing. Its match records go with it, marked deleted the same way, and their tracks are deleted (RES-8); saving the match again doesn't bring them back. API keys: need `matches:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |
| `version` (optional) | query | integer | The version last seen; when given, the delete fails if it has changed since. |

| Answer | Body | When |
|---|---|---|
| 200 | [Match](json-schema/Match.json) | Deleted: the record with deletedAt. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 409 | { error: string, current: [Match](json-schema/Match.json) } | It changed since the version sent. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Tracks

GPS and heart rate for a match report (TRK-1 to TRK-3), in LawFive's own format whatever recorded them: convert from the source (RefSix, an activity file, a phone's health store) before uploading. Not part of sync, as tracks are big; fetch one when it's shown. The figures (distance, speeds, sprints, heart rate and zones) are worked out by the server each time.

### GET /v1/match-records/{id}/track

**A match report's track.** With its figures, over the periods played when the match report has their start times. API keys: need `match-records:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { track: [MatchTrack](json-schema/MatchTrack.json), summary: [TrackSummary](json-schema/TrackSummary.json), pitch?: [PitchOutline](json-schema/PitchOutline.json), heat?: { cols: integer, rows: integer, lengthM: number, widthM: number, total: number[], periods: ({ period: integer, cells: number[] })[] }, updatedAt: [Timestamp](json-schema/Timestamp.json) } | The track and its figures. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:read; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No track for this match report, or no such match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/match-records/{id}/track

**Upload a match report's track.** Replaces any track the match report had. Up to 43,200 samples (12 hours at one a second) in each series. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [MatchTrack](json-schema/MatchTrack.json)

| Answer | Body | When |
|---|---|---|
| 200 | { summary: [TrackSummary](json-schema/TrackSummary.json), updatedAt: [Timestamp](json-schema/Timestamp.json) } | Replaced the track it had. |
| 201 | { summary: [TrackSummary](json-schema/TrackSummary.json), updatedAt: [Timestamp](json-schema/Timestamp.json) } | Stored. |
| 400 | [ValidationError](#validationerror) | The body doesn't match the schema (issues lists the problems). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such match report: save it first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/match-records/{id}/track/pitch

**Mark where the pitch is.** The two corners of one touchline and the center spot, as the referee placed them (TRK-9); kept with the track, marked by: referee. Heatmaps and Stats use it. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** { corners: [[Position](json-schema/Position.json), [Position](json-schema/Position.json)], centre: [Position](json-schema/Position.json) }

| Answer | Body | When |
|---|---|---|
| 200 | { pitch: [PitchOutline](json-schema/PitchOutline.json), updatedAt: [Timestamp](json-schema/Timestamp.json) } | Kept. |
| 400 | [ValidationError](#validationerror) | The body doesn't match the schema. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No track for this match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/match-records/{id}/track/pitch

**Forget where the pitch is.** Back to the pitch found from the track (TRK-9). API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { pitch?: [PitchOutline](json-schema/PitchOutline.json), updatedAt: [Timestamp](json-schema/Timestamp.json) } | Forgotten; pitch is the one found from the track, when there's enough GPS. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No track for this match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/match-records/{id}/track

**Delete a match report's track.** The match report stays. API keys: need `match-records:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without match-records:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No track for this match report. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Sync

Everything that changed since a device last looked.

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
| 403 | [ApiError](#apierror) | An API key without *:read; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## People

Admins (USR-1) see everyone on the server, approve or decline new accounts (USR-4), make other admins, and make password reset links, suspend and delete accounts, and change who can sign up (USR-7); and make plans, named sets of limits, and put each account in one (PLAN-1 to PLAN-5). Everyone else gets 403.

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

**Put an account in a plan.** With an optional last day (in the account's time zone, PLAN-9) and the plan after it, the default when not given (PLAN-3, PLAN-5). Nothing in the account is lost if it's over the new plan's limits; only adding more is refused (PLAN-4). Not with API keys.

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

**An account's plans so far.** Each change of plan, newest first (PLAN-5): whether someone has had a trial, say. Not with API keys.

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

**Suspend an account, or undo it.** A suspended account can't sign in, and is signed out everywhere (linked watches need linking again afterward); its API keys and calendar feed stop working. Its data is kept (USR-7). Not with API keys.

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

**Unlock signing in.** After too many wrong passwords an account's address is locked for a while (SEC-12); this ends it now. A password reset ends it too. Not with API keys.

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

**Make a password reset link.** For someone who forgot their password, on any server: the admin sends it to them. It works once, for 24 hours (USR-7). Not with API keys.

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

**Delete an account.** Deletes the account and everything in it (USR-7). It can't be undone. Not with API keys.

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

**The plans.** Every plan, with how many accounts are in each, and the sign-up trial (PLAN-1, PLAN-5). Not with API keys.

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

**The server's settings.** Each setting an admin can change (ADM-1, ADM-2), where its value comes from, and the value (not for secrets). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { settings: [ServerSettingView](#serversettingview)[] } | The settings. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/server-settings

**Change the server's settings.** Sets or clears the settings sent (ADM-1); one the environment sets can't be changed, and if any can't be, none are. Takes effect straight away. GET /v1/meta says what's offered. Not with API keys.

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

**Check a new server's setup code.** While nobody has an account, whether this is the code in the server's logs (ADM-5). The first account is made through sign-up, with the code as setupCode. No sign-in needed.

**Body:** { code: string }

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | It's the code. |
| 400 | [ApiError](#apierror) | It isn't. |
| 404 | [ApiError](#apierror) | The server is already set up, or doesn't need a code. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/setup/finish

**Finish setting the server up.** The first account finished or skipped the setup wizard, so it doesn't open again (ADM-5). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Done. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/server-settings/network

**How the server sees visitors.** The address this server sees the asking admin at, and the TRUSTED_PROXIES and TRUSTED_IP_HEADER in use (SEC-14), so Settings → Server can show whether a proxy in front of it is believed. Both are environment values, not changed here. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [NetworkView](#networkview) | As it is now. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/server-settings/test-email

**Send a test email.** To the signed-in admin, through the email settings in use (ADM-4). Not with API keys.

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

**Send a test notification.** To the signed-in admin's own phones that have notifications on, through the push relay (PUSH-6). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { sent: integer } | The relay took it. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 409 | [ApiError](#apierror) | Notifications are off on this server, or none of the admin's phones has them on. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |
| 502 | [ApiError](#apierror) | The relay didn't take it; the error says why. |

## App sign-in

Signing in on a phone with a code the web app shows, as a QR code or in letters (APP-13), instead of typing a password.

### POST /v1/app-sign-in

**A code to sign a phone in.** It works once, for two minutes. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 201 | [AppSignIn](#appsignin) | Made. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/app-sign-in/{id}

**Whether a phone has used a code.** So the web app can say when the phone is signed in. Expired codes go when a new one is made, and then this answers 404. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [AppSignInStatus](#appsigninstatus) | How it stands. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such code, or not this account's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/app-sign-in/check

**Whose a code is.** For the phone to ask before signing in. It doesn't use the code up. No sign-in needed.

**Body:** [AppSignInCode](#appsignincode)

| Answer | Body | When |
|---|---|---|
| 200 | [AppSignInCheck](#appsignincheck) | It can be used. |
| 404 | [ApiError](#apierror) | No such code. |
| 410 | [ApiError](#apierror) | It was used, or it has expired. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/app-sign-in/redeem

**Swap a code for a session.** The session belongs to the device asking, and shows under Devices. No sign-in needed.

**Body:** [AppSignInCode](#appsignincode)

| Answer | Body | When |
|---|---|---|
| 200 | [AppSignInResult](#appsigninresult) | Signed in. |
| 403 | [PlanRefusal](#planrefusal) | The account is suspended, or already has as many watches and phones as its plan allows (PLAN-7). |
| 404 | [ApiError](#apierror) | No such code. |
| 410 | [ApiError](#apierror) | It was used, or it has expired. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Invitations

Links that let someone make an account even when sign-up is closed (USR-3). Admins make and cancel them; the link opens the web app's invitation page, which looks the invitation up and signs up with it.

### GET /v1/invites

**The invitations.** Newest first, including used and expired ones from the last 90 days. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { invites: [Invite](#invite)[] } | The invitations. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/invites

**Invite someone.** With send, it's emailed to them too, when the server can send email. Not with API keys.

**Body:** [NewInvite](#newinvite)

| Answer | Body | When |
|---|---|---|
| 201 | { invite: [Invite](#invite), emailed: boolean } | Made. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 409 | [ApiError](#apierror) | There's already an account with this email. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/invites/{id}

**Cancel an invitation.** Its link stops working straight away. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Canceled. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | Not an admin. |
| 404 | [ApiError](#apierror) | No such invitation, or it was used. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/invite/{token}

**Look up an invitation.** For the invitation page, before signing up with it. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `token` | path | string |  |

| Answer | Body | When |
|---|---|---|
| 200 | [InviteLookup](#invitelookup) | It can be used. |
| 404 | [ApiError](#apierror) | No such invitation: the link is mistyped, or it was canceled. |
| 410 | [ApiError](#apierror) | It was used, or it has expired. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Import

Adding and updating matches from a spreadsheet, CSV or JSON file (IMP-1 to IMP-8). Apps read the file into rows; the server matches each row to a match (by LawFive id, else match number), finds or adds the venues, competitions and referees it names, and saves only what the row fills in. Check first with dryRun.

### POST /v1/import/matches

**Import matches.** Each row adds a match or updates one: the row's ID column (a LawFive match id) wins, else its match number (any source). Only the columns a row fills in change an existing match. Venues, pitches, competitions and referees are found by name, ignoring case (venues, pitches and referees by their other names too), and added when there's none (an API key then needs write access to those too). Rows with problems are skipped and the rest are saved; nothing is saved on a dry run.

The columns, by their headings (any case or spacing, so home_colour and homeColour work too, as do common other headings like Field for Pitch):

| Column | JSON | What it's for | Example | Needed |
|---|---|---|---|---|
| ID | `id` | LawFive's own ID for a match, as in a LawFive export. Leave it empty for a new match; with it, the row updates that match. | 5c1e2a9b-… | Optional |
| Match number | `matchNumber` | The league's or assignor's number for the match. Importing a file again with the same number updates the match instead of adding a copy. | BYL-1142 | Optional |
| Assignor | `assignor` | Who assigned you the match: a person, or the assigning group's name. | Dana Whitfield | Optional |
| Status | `status` | scheduled, played, abandoned, canceled or postponed. A new match is scheduled when it's empty. | scheduled | Optional |
| Date | `date` | The day of the match: 2026-11-07, or the way your computer writes dates (11/7/2026 in the US, 7/11/2026 in most other places). | 2026-11-07 | New matches* |
| Time | `time` | The kickoff time: 14:30 or 2:30 PM. A new match with a date needs one. | 2:30 PM | Optional |
| Kickoff | `kickoff` | The date and time together, instead of Date and Time. Add a UTC offset (2026-11-07T14:30-08:00) to fix the moment exactly. | 2026-11-07 14:30 | New matches* |
| Time zone | `timeZone` | Where the kickoff time is, by its name in the time zone database. Empty: the match's own time zone, or your computer's. | America/Los_Angeles | Optional |
| Home | `home` | The home team's name. | Strikers U12 | New matches* |
| Home short name | `homeShortName` | Up to 4 letters for the home team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change. | STR | Optional |
| Home color | `homeColour` | The home team's color on the watch: black, white, red, orange, yellow, green, blue or purple, or a hex code like #D71920. | red | Optional |
| Away | `away` | The away team's name. | Rovers U12 | New matches* |
| Away short name | `awayShortName` | Up to 4 letters for the away team on the watch. Empty: made from both team names (the first three letters or digits of each, skipping the words both names start with), and it follows them when they change. | ROV | Optional |
| Away color | `awayColour` | The away team's color on the watch, written like Home color. | #0057B8 | Optional |
| Competition | `competition` | The league, cup or tournament, by name. One you don't have yet is added, as a league. | Bay Youth League U12 Boys | Optional |
| Venue | `venue` | Where it's played, by name. One you don't have yet is added; give it an address and a place on the map in Venues. | Twin Creeks Sports Complex | Optional |
| Venue address | `venueAddress` | The venue's street address, for directions: given to a venue that's added, or one that has no address yet. | 969 Caribbean Dr, Sunnyvale, CA 94089 | Optional |
| Pitch | `pitch` | The pitch at the venue. It's added to the venue if the venue doesn't have it yet. | Field 3 | Optional |
| Match name | `matchName` | A name for the match itself, shown with the competition: a round, a final, a friendly's occasion. | Semi-final | Optional |
| Age group | `ageGroup` | As the league writes it: U12, U19, Adult, O35. | U12 | Optional |
| Gender | `gender` | Who plays: male, female or co-ed (boys, girls, men, women and mixed work too). | female | Optional |
| Role | `role` | Your role: referee, AR1, AR2 or fourth official. Empty: taken from a crew column with your name in it, if there is one. | AR1 | Optional |
| Referee | `referee` | The referee's name, or one of their other names. Your own name makes it your role; someone you haven't saved yet is added to Referees. TBD or empty: nobody yet. | Priya Natarajan | Optional |
| AR1 | `ar1` | The first assistant referee's name, written like Referee. | Sam Rivera | Optional |
| AR2 | `ar2` | The second assistant referee's name, written like Referee. | Jordan Lee | Optional |
| Fourth official | `fourthOfficial` | The fourth official's name, written like Referee. | Sam Rivera | Optional |
| Template | `template` | One of your match templates, by name, for its format (periods, their length, breaks). It must already exist. Empty for a new match: the competition's template, or 2 × 45 minutes. | U12 league: 2×30 | Optional |
| Periods | `periods` | How many periods, 1 to 4: 2 for halves, 4 for quarters, 1 for a tournament game of one period. Overrides the template's. | 2 | Optional |
| Period length (min) | `periodLength` | Minutes in each period. Overrides the template's. | 30 | Optional |
| Half-time (min) | `halfTime` | Minutes of break between periods. Overrides the template's. | 5 | Optional |
| Team size | `teamSize` | Players a side on the field, 1 to 11. Overrides the template's. | 9 | Optional |
| Fee | `fee` | What you're paid for the match, as a number. | 40.50 | Optional |
| Currency | `currency` | The fee's currency, as a three-letter code (USD, GBP, EUR). Empty: your currency in Settings. | USD | Optional |
| Paid | `paid` | Whether you've been paid the fee: yes or no. | no | Optional |
| Tags | `tags` | Labels to find and filter matches by, separated by commas. | league, needs AR | Optional |
| Notes | `notes` | Anything to remember for the match. | Bring the spare flags. | Optional |
| Outlook | `outlook` | What to expect: how competitive it'll be, the teams' strengths, history between them. | Top of the table meets second. | Optional |

\* A new match needs a date (Date and Time, or Kickoff) or its teams; everything else is optional, and an empty value never changes a match. API keys: need `matches:write`.

**Body:** [MatchImport](#matchimport)

| Answer | Body | When |
|---|---|---|
| 200 | [MatchImportResult](#matchimportresult) | What happened to each row (or would, on a dry run). |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match: no rows, more than 1000, or not rows of values. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits (PLAN-4), so nothing is saved. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/import/file

**Import matches from a file.** The same import as POST /v1/import/matches, from a file the server reads: CSV (commas, semicolons or tabs), Excel (.xlsx, its Matches sheet or else the first) or JSON (a list of objects, or an object with a matches list). The web app and phone apps use this; send it with dryRun first to check every row, then again without to save. API keys: need `matches:write`.

**Body:** multipart/form-data: the fields of [MatchImportFileFields](#matchimportfilefields), and the files `file` (required: the file, at most 5 MB and 1000 rows)

| Answer | Body | When |
|---|---|---|
| 200 | [MatchImportFileResult](#matchimportfileresult) | What happened to each row (or would, on a dry run), and where each is in the file. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The file is missing, too big (5 MB, or the plan's fileMb), or can't be read; error says why, in words to show the person who chose it. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits (PLAN-4), so nothing is saved. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Assignor calendars

An assignor system's private calendar link (ArbiterSports, Assignr, HorizonWebRef, RefTown and others give each official one), which the server reads every 30 minutes into the account's matches through the import (FEED-1 to FEED-10): new games added, moved ones changed, ones gone before kickoff canceled. The link is a password, so it's kept encrypted and never sent back. Only a signed-in session can manage them.

### GET /v1/assignor-calendars

**The account's assignor calendars.** Oldest first, each with how its latest read went. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { calendars: [AssignorCalendar](#assignorcalendar)[] } | The calendars. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars/preview

**Preview a calendar link.** Reads the link once and says what it holds: the games still to come, how many are already in LawFive, and the first three as they'd be saved. Nothing is saved (FEED-1). Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

**Body:** [AssignorCalendarLink](#assignorcalendarlink)

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendarPreview](#assignorcalendarpreview) | What it holds. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the link can't be read (not a web address, a private address, no answer, or not a calendar); error says why, in words to show the person. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars

**Connect an assignor calendar.** Reads it straight away, adding its games still to come, then every 30 minutes. As many as the account's plan allows (FEED-10). Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

**Body:** [NewAssignorCalendar](#newassignorcalendar)

| Answer | Body | When |
|---|---|---|
| 201 | [AssignorCalendar](#assignorcalendar) | Connected and read. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the link can't be read; error says why. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many assignor calendars as its plan allows (PLAN-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PATCH /v1/assignor-calendars/{id}

**Change an assignor calendar.** Its name, notifications, pausing or resuming it, or a new link. Resuming it or a new link reads it straight away. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [AssignorCalendarChange](#assignorcalendarchange)

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendar](#assignorcalendar) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the new link can't be read; error says why. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/assignor-calendars/{id}

**Remove an assignor calendar.** It's no longer read; the matches it added stay, as ordinary matches. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Removed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/assignor-calendars/{id}/read

**Read an assignor calendar now.** Instead of waiting for its next read; a paused one stays paused. Only when `GET /v1/meta` lists `assignor-calendars`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [AssignorCalendar](#assignorcalendar) | Read, with how it went. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Calendar

A private calendar feed of the user's matches (CAL-1 to CAL-5), for calendar apps to subscribe to.

### GET /v1/calendar

**The calendar feed's address.** Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [CalendarFeed](#calendarfeed) | The feed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
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
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/calendar

**Turn the calendar feed off.** Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Its address stops working. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | There's no feed. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/calendar/{file}

**The calendar feed.** What calendar apps fetch: the user's matches as events (CAL-2 to CAL-4), past and future, canceled ones marked so. The address is the secret; there's no other sign-in. No sign-in needed.

| Parameter | In | Type | Description |
|---|---|---|---|
| `file` | path | string | The feed's token and .ics. |

| Answer | Body | When |
|---|---|---|
| 200 | iCalendar | The calendar (text/calendar). |
| 403 | [ApiError](#apierror) | The account is suspended (USR-7). |
| 404 | [ApiError](#apierror) | No feed has this address: it was replaced or turned off. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Stats

Reports on the user's games (STAT-1 to STAT-4), worked out by the server so every app shows the same.

### GET /v1/stats

**Stats on the user's games.** Games are matches played or abandoned. Every figure follows the filters; options lists what the filters can choose from. An API key gets only what its scopes can read: without match-records:read there are no figures from match reports or tracks (distance, discipline, added time, fitness, heatmaps); without settings:read, no heart-rate zones and the standard sprint speed; without venues:read, referees:read or competitions:read, the lists naming them are empty, while the counts stay. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | [LocalDate](json-schema/LocalDate.json) | The first day, in each match's own time zone; none for the first game. |
| `to` (optional) | query | [LocalDate](json-schema/LocalDate.json) | The last day, inclusive; none for today and on. |
| `gender` (optional) | query | [Gender](json-schema/Gender.json) |  |
| `competitionId` (optional) | query | [Id](json-schema/Id.json) |  |
| `role` (optional) | query | "referee" \| "assistant" \| "fourth" | Your role: referee, assistant (AR1 or AR2) or fourth. |
| `tag` (optional) | query | string | Games with this tag (ignoring case). |
| `venueId` (optional) | query | [Id](json-schema/Id.json) |  |

| Answer | Body | When |
|---|---|---|
| 200 | [Stats](json-schema/Stats.json) | The stats. |
| 400 | [ApiError](#apierror) | A filter isn't valid: from or to isn't a date, an unknown gender or role, or an id isn't a UUID. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/stats/games.csv

**The games, as a spreadsheet.** The games matching the filters (and, optionally, one slice of a chart), oldest first, as CSV with a header row: date, kickoff, competition, home, away, score, role, venue, pitch, age group, gender, distance (m), average heart rate, kickoff temperature (°C), rain (mm), cautions, send-offs, added time (s), fee, currency and paid (STAT-12). For an API key, the columns its scopes can't read are left empty, as for /v1/stats. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | [LocalDate](json-schema/LocalDate.json) | The first day, in each match's own time zone; none for the first game. |
| `to` (optional) | query | [LocalDate](json-schema/LocalDate.json) | The last day, inclusive; none for today and on. |
| `gender` (optional) | query | [Gender](json-schema/Gender.json) |  |
| `competitionId` (optional) | query | [Id](json-schema/Id.json) |  |
| `role` (optional) | query | "referee" \| "assistant" \| "fourth" | Your role: referee, assistant (AR1 or AR2) or fourth. |
| `tag` (optional) | query | string | Games with this tag (ignoring case). |
| `venueId` (optional) | query | [Id](json-schema/Id.json) |  |
| `pitchId` (optional) | query | [Id](json-schema/Id.json) \| "none" | At this pitch of the venue, or none for games at the venue without a pitch. |
| `refereeId` (optional) | query | [Id](json-schema/Id.json) | With this saved referee on the crew. |
| `refereeName` (optional) | query | string | With this name typed in on the crew (ignoring case). |
| `ageGroup` (optional) | query | string |  |
| `month` (optional) | query | string | Kicking off in this month, 2026-04, locally. |

| Answer | Body | When |
|---|---|---|
| 200 | CSV | The games, as a download (Content-Disposition: attachment). |
| 400 | [ApiError](#apierror) | A filter isn't valid. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Devices

Where the account is signed in.

### GET /v1/devices

**Where the account is signed in.** Browsers and linked watches, most recently active first. Apps name themselves with an X-LawFive-Device header: garmin, and from the watch app's later versions what it runs on, garmin; model=006-B3703-00; firmware=12.30, which names it (Garmin Venu 2), and its own version, app=2026.10.30 (VER-3). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { devices: [Device](#device)[] } | The devices. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
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
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/devices/matches

**Which matches are on which watch.** For a match's page to say whether it's on a watch (SYNC-14): each match in each linked watch's latest download of its next matches (GET /v1/watch/matches, from the watch or through the phone app with the watch's link), and whether the watch has it as it is now. A watch unlinked drops out; a match deleted isn't listed. Phones fetch it as they sync and keep the last answer for when there's no signal. Not with API keys. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { matches: [MatchOnWatch](#matchonwatch)[] } | The matches on watches, newest download first. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/devices/sign-out-others

**Sign out everywhere else.** Ends the account's other sessions, keeping the one asking (SEC-7): other browsers only, or every other device, which unlinks watches and signs phones out. Not with API keys.

**Body:** [SignOutOthers](#signoutothers)

| Answer | Body | When |
|---|---|---|
| 200 | { signedOut: integer } | How many were signed out. |
| 400 | [ApiError](#apierror) | Not browsers or all. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/devices/current/push

**Say how to reach this phone.** Keeps the handle the push relay gave this phone with its session, so signing out removes it (PUSH-4). Needs an X-LawFive-Device header. Not with API keys. Only when `GET /v1/meta` lists `push`. Not with API keys.

**Body:** [PushHandle](#pushhandle)

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Kept. |
| 400 | [ApiError](#apierror) | The body doesn't match, or there's no device header. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/notices/{id}

**What an integration did.** The matches an API key added or changed, from a match-changed notification's id (NOTE-3), for the phone to write the notification itself. Kept for 30 days. Not with API keys. Only when `GET /v1/meta` lists `push`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchNotice](#matchnotice) | The notice. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, not this user's, or more than 30 days old. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/account/storage

**How much of its storage the account is using.** Photos and tracks, and the limit if the account's plan has one (SEC-6, PLAN-2). Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [AccountStorage](#accountstorage) | The figures. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/account/plan

**The account's plan.** Its plan and limits, when it ends and what follows, and how much of each limit it's using (PLAN-6). Only when `GET /v1/meta` lists `plans`. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [AccountPlan](#accountplan) | The plan. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Attachments

Photos on matches, venues and referees (FILE-1 to FILE-5), kept by the server on its disk or in S3-compatible storage. Upload the file as multipart/form-data, ideally already made smaller (the web app sends at most 2000 pixels on the longest side, as a JPEG without its location and camera details) with a thumbnail; the server keeps what it's sent. The files are private: fetch them with the same sign-in. Deleting the record deletes its attachments. Only a signed-in session can use them for now.

### GET /v1/attachments

**Attachments of a kind of record.** In order (by record, then position). With recordId, just that record's; with first, only each record's first (a referee's picture). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `recordType` | query | [AttachmentRecordType](#attachmentrecordtype) | The kinds of record that can have attachments. |
| `recordId` (optional) | query | [Id](json-schema/Id.json) |  |
| `first` (optional) | query | "true" | Only each record's first attachment. |

| Answer | Body | When |
|---|---|---|
| 200 | { attachments: [Attachment](#attachment)[] } | The attachments. |
| 400 | [ApiError](#apierror) | recordType or recordId isn't valid. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/attachments

**Upload an attachment.** Added after the record's others. At most 30 on a record. Not with API keys.

**Body:** multipart/form-data: the fields of [AttachmentUpload](#attachmentupload), and the files `file` (required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)), `thumb` (optional: a small version, at most 1 MB, for lists and galleries)

| Answer | Body | When |
|---|---|---|
| 201 | [Attachment](#attachment) | Uploaded. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when it doesn't fit the account's room (FILE-7). A field isn't valid, the file is missing, too big or not a JPEG, PNG or WebP, or the record has 30 already. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such record: save it first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}

**Change an attachment.** Its caption, or its place among the record's attachments (moving a referee's photo to 0 makes it their picture). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [AttachmentChange](#attachmentchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}/file

**Replace an attachment's file.** A photo cropped or turned by the app, in place of the old one (FILE-8): it keeps its id, place and caption, and the old files are deleted. Its url and thumbUrl change, so a kept copy of the old one isn't shown. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** multipart/form-data: the fields of { width?: string, height?: string }, and the files `file` (required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)), `thumb` (optional: a small version, at most 1 MB)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Replaced. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when a bigger file doesn't fit the account's room (FILE-7). The file is missing, too big or not a JPEG, PNG or WebP. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/attachments/{id}

**Delete an attachment.** With its files, for good. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/attachments/{id}/file

**An attachment's file.** As uploaded. A file at an address never changes, so it can be kept (Cache-Control: private, immutable); replacing it (FILE-8) gives the attachment new addresses, with ?v=. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | An image | The image. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/attachments/{id}/thumb

**An attachment's thumbnail.** The small version, or the file itself when none was uploaded. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | An image | The image. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Export

Everything in the account as one zip (DATA-2), and restoring one into an account (DATA-4), for backups and moving between servers. The zip has lawfive.json (what it is), README.md, records/<collection>.json (each an array of records as the API gives them), tracks/<match record id>.json, attachments.json and the photos in attachments/. Only a signed-in session can use them.

### GET /v1/export

**Download everything.** Every record, track and photo in the account, as a zip (Content-Disposition: attachment). It's made as it's sent, so it starts straight away however big it is. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | A zip file | The zip. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/restore

**Restore from an export.** Merges an export into the account: records keep their ids, anything missing is added, and where the account has a record too, whichever was changed last is kept. Tracks are added to match reports without one; photos the account doesn't have are added. At most 2 GB. Matches, referees and venues over the plan's limits (PLAN-4) aren't added, and problems says so. Not with API keys.

**Body:** A zip made by GET /v1/export (application/zip)

| Answer | Body | When |
|---|---|---|
| 200 | [RestoreResult](#restoreresult) | Restored. |
| 400 | [ApiError](#apierror) | It isn't a LawFive export, or it's too big (2 GB, or the plan's fileMb). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 409 | [ApiError](#apierror) | Another restore for the account is under way: one at a time. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Sharing

A match's share link (DATA-7): an address nobody can guess that shows the match, its log and its track to anyone who has it, without signing in. Never the notes, fee, crew, contacts, player names or photos.

### GET /v1/matches/{id}/share

**A match's share link.** Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchShare](#matchshare) | Its link. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | It isn't shared, or there's no such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/matches/{id}/share

**Share a match.** Makes its link, or a new one in place of the old, which stops working. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 201 | [MatchShare](#matchshare) | Its link. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/matches/{id}/share

**Stop sharing a match.** Its link stops working. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Not shared any more. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
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
| 403 | [ApiError](#apierror) | The account is suspended (USR-7). |
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
| 200 | { track: [MatchTrack](json-schema/MatchTrack.json), summary: [TrackSummary](json-schema/TrackSummary.json), pitch?: [PitchOutline](json-schema/PitchOutline.json), heat?: { cols: integer, rows: integer, lengthM: number, widthM: number, total: number[], periods: ({ period: integer, cells: number[] })[] }, updatedAt: [Timestamp](json-schema/Timestamp.json) } | The track and its figures. |
| 403 | [ApiError](#apierror) | The account is suspended (USR-7). |
| 404 | [ApiError](#apierror) | No match has this link, or it has no track. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Webhooks

URLs that hear about changes to the account's records (HOOK-1 to HOOK-5): matches, match reports, venues, referees, competitions and templates, however they were made (the web app, the API, a watch, an import). Each delivery is a signed JSON POST (WebhookPayload), retried up to five times over about three hours when it doesn't get a 2xx answer. Only a signed-in session can manage them.

### GET /v1/webhooks

**The account's webhooks.** Newest first, each with its latest delivery. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { webhooks: [Webhook](#webhook)[] } | The webhooks. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/webhooks

**Add a webhook.** As many as the account's plan allows (PLAN-2). The answer has the secret deliveries are signed with, which isn't shown again. Not with API keys.

**Body:** [WebhookInput](#webhookinput)

| Answer | Body | When |
|---|---|---|
| 201 | [CreatedWebhook](#createdwebhook) | Added. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the address isn't allowed (a private network, unless the server allows it). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many webhooks as its plan allows (PLAN-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/webhooks/{id}

**Change a webhook.** Its address, topics, or pausing it (active: false). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [WebhookInput](#webhookinput)

| Answer | Body | When |
|---|---|---|
| 200 | [Webhook](#webhook) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the address isn't allowed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/webhooks/{id}

**Delete a webhook.** With its deliveries; nothing more is sent. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/webhooks/{id}/deliveries

**A webhook's deliveries.** The latest 50, newest first. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { deliveries: [WebhookDelivery](#webhookdelivery)[] } | The deliveries. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/webhooks/{id}/test

**Send a test.** Sends an example delivery now, once, and says how it went. The example is the account's latest record of the topic, or a made-up one; test is true in it. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** { topic?: [WebhookTopic](#webhooktopic) }

| Answer | Body | When |
|---|---|---|
| 200 | { delivery: [WebhookDelivery](#webhookdelivery), payload: [WebhookPayload](#webhookpayload), durationMs: integer } | Sent (whatever the answer). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## API keys

Keys for scripts and integrations (KEY-1 to KEY-4), made in the web app's Settings. A key is sent like a session token, Authorization: Bearer <key>, and can use only the collections it was given (read, or read and write), plus the weather (with matches:read) and address search (with venues:write). Keys can't manage devices or other keys, and only a signed-in session can make or delete them.

### GET /v1/api-keys

**The account's API keys.** Newest first. The keys themselves aren't kept, only their first characters. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { keys: [ApiKey](#apikey)[] } | The keys. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/api-keys

**Make an API key.** As many as the account's plan allows (PLAN-2). Not with API keys.

**Body:** [NewApiKey](#newapikey)

| Answer | Body | When |
|---|---|---|
| 201 | [CreatedApiKey](#createdapikey) | Made: the answer has the key, which isn't shown again. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many keys as its plan allows (PLAN-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/api-keys/{id}

**Delete an API key.** It stops working straight away. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PATCH /v1/api-keys/{id}

**Change an API key.** Whether the user's phones are told when it adds or changes matches (NOTE-1). Its access and expiry can't change: make a new key instead. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

**Body:** [ApiKeyChange](#apikeychange)

| Answer | Body | When |
|---|---|---|
| 200 | [ApiKey](#apikey) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Watch

What a Garmin watch uses, shaped for its little memory: matches in the form it starts one from, and finished matches as it saved them.

### GET /v1/watch/matches

**The next matches, for the watch.** Scheduled matches from three hours ago on, soonest first, so one that's about to start or running late is still there. A watch's link asking is noted as the watch now having these matches (SYNC-14, GET /v1/devices/matches), unless it's the phone app fetching them ahead for the watch (prefetch). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `limit` (optional) | query | integer | At most 10 (the default). |
| `prefetch` (optional) | query | "true" | The phone app fetching the watch's next matches ahead (APP-7), for when the watch asks without signal: not noted as on the watch. |

| Answer | Body | When |
|---|---|---|
| 200 | { matches: [WatchMatch](#watchmatch)[], serverVersion?: string, screen?: [WatchScreenChange](#watchscreenchange), teamSwipes?: [TeamSwipes](json-schema/TeamSwipes.json), misconductScheme?: [SchemeId](json-schema/SchemeId.json) } | The matches. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/records

**Upload a finished match.** Stored as a match record, and its planned match marked played. A quick match (no matchId) gets a match made for it from what the watch knew. Sending the same match again updates it, unless its result has been corrected since (RES-4) or it has been deleted since (RES-8): then nothing changes. A planned match deleted before its result first arrives comes back, played. Not with API keys.

**Body:** [WatchUpload](#watchupload)

| Answer | Body | When |
|---|---|---|
| 200 | [WatchUploadResult](#watchuploadresult) | Updated: this match was sent before (or kept as it is: corrected or deleted since). |
| 201 | [WatchUploadResult](#watchuploadresult) | Stored. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 409 | [ApiError](#apierror) | It would duplicate another record. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/tracks

**Upload part of a match's track.** The watch sends the track it recorded (TRK-7) a chunk at a time, after the match. Once every chunk and the match are in, the chunks become the match report's track, unless it has one already (from a file, say), which is kept. Sending a chunk again replaces it. Not with API keys.

**Body:** [WatchTrackChunk](#watchtrackchunk)

| Answer | Body | When |
|---|---|---|
| 200 | [WatchTrackResult](#watchtrackresult) | Received. |
| 400 | [ValidationError](#validationerror) | The body doesn't match, or the samples can't be read. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/pitch

**Pitch corners from the watch.** Corners walked on the watch (TRK-13), sent at its next sync (SYNC-12). They're kept with the match, replacing any it had, and with its venue's pitch when it has one, for its matches from then on. Not with API keys.

**Body:** [WatchPitchMarking](#watchpitchmarking)

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true, pitch: boolean } | Kept. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or it names neither matchId nor created. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such match. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/screen

**The match screen chosen on the watch.** Settings > Match screen on the watch (UI-24), sent at its next sync. It becomes the account's choice unless the website or a phone has changed it since (the latest change wins). An account with no settings yet keeps nothing. Not with API keys.

**Body:** [WatchScreenChange](#watchscreenchange)

| Answer | Body | When |
|---|---|---|
| 200 | { applied: boolean } | Whether this change is now the account's choice. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/watch/fee

**Mark a fee paid from the watch.** The watch's Paid toggle (SYNC-11), sent at its next sync. It changes only whether the fee is paid, and only if the match hasn't been changed since (the latest change wins). Not with API keys.

**Body:** [WatchFeeChange](#watchfeechange)

| Answer | Body | When |
|---|---|---|
| 200 | { paid: boolean, applied: boolean } | Whether the fee is paid now, and whether this change made it so. |
| 400 | [ValidationError](#validationerror) | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No such match, or it has no fee. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Places

Address search for placing venues on the map.

### GET /v1/geocode

**Find an address.** Through Nominatim (OpenStreetMap) by default, at most one lookup a second for the whole server, with answers cached. Every search counts against the account's plan's address searches a day (PLAN-11), cached or not. Only when `GET /v1/meta` lists `geocode`. API keys: need `venues:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `q` | query | string | The address. |

| Answer | Body | When |
|---|---|---|
| 200 | { results: [Place](#place)[] } | Up to five places. |
| 400 | [ApiError](#apierror) | q is shorter than 3 or longer than 200 characters. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without venues:write; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | Address search is off on this server (an admin can switch it on, ADM-2). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | The account's plan allows no more address searches today (PLAN-11), or two of its searches are already waiting; Retry-After says how many seconds to wait. |
| 502 | [ApiError](#apierror) | The address search service didn't answer. |

## Quiz

The Laws of the Game quiz's questions (QUIZ-1).

### GET /v1/quiz

**The quiz's questions.** Every active question in a language, with the Laws and protocols they refer to, for the app to pick from. The phone apps keep the last copy, for no signal. Only when `GET /v1/meta` lists `quiz`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `language` (optional) | query | string | A two-letter language code; en by default. |

| Answer | Body | When |
|---|---|---|
| 200 | [QuizBank](json-schema/QuizBank.json) | The questions. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | There are no questions in that language. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Weather

Forecasts for the user's matches, and the weather finished matches were played in (WX-1 to WX-8). The server fetches and keeps forecasts; apps never call the weather service themselves.

### GET /v1/weather

**Weather for matches in a window.** For the user's matches kicking off between from and to that have a place on the map and a forecast (up to 16 days ahead) or kept weather (once played). Only when `GET /v1/meta` lists `weather`. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | string | ISO 8601 time; 30 days ago by default. |
| `to` (optional) | query | string | ISO 8601 time; 17 days from now by default. At most 400 days after from. |

| Answer | Body | When |
|---|---|---|
| 200 | { items: [MatchWeather](json-schema/MatchWeather.json)[] } | The weather, one per match that has any. |
| 400 | [ApiError](#apierror) | from or to isn't a time, or they're the wrong way round or too far apart. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/weather/{matchId}

**One match's weather.** Only when `GET /v1/meta` lists `weather`. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `matchId` | path | [Id](json-schema/Id.json) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchWeather](json-schema/MatchWeather.json) | The weather. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval (USR-4). |
| 404 | [ApiError](#apierror) | No weather for this match: not found, no place on the map, or too far ahead. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

The API's own types. Records and weather are in the data model: Match, MatchTemplate, MatchRecord, Venue, Competition, Referee, UserSettings and MatchWeather, each with a JSON Schema file in [json-schema/](json-schema/). The `<Record>Input` types are those records without `updatedAt` and `deletedAt`, and with `id` and `version` optional.

### Account

The signed-in account, with what it may do.

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `name` | string |  |
| `email` | string |  |
| `status` | [AccountStatus](#accountstatus) |  |
| `admin` | boolean | Can invite and approve people (USR-1). |
| `pendingEmail` (optional) | string | A new address waiting for its owner to follow the link emailed to it (USR-9); email stays the old one until then. |
| `pendingEmailUntil` (optional) | [Timestamp](json-schema/Timestamp.json) | When that link stops working. |

### AccountName

An account's name (USR-10): 1 to 100 characters, spaces at either end trimmed.

string

### AccountPlan

The signed-in account's plan, when it ends, and what it's using (PLAN-6).

| Field | Type | Description |
|---|---|---|
| `plan` | [PlanName](#planname) |  |
| `limits` | [PlanLimits](#planlimits) |  |
| `since` | [Timestamp](json-schema/Timestamp.json) |  |
| `endsAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When it ends: the end of endsOn in the account's time zone. |
| `endsOn` (optional) | string | Its last day. |
| `then` (optional) | [PlanName](#planname) | The plan that follows when it ends. |
| `usage` | [PlanUsage](#planusage) |  |

### AccountStatus

pending: made on a server that approves new accounts, and not approved yet (USR-4). It can sign in, but only GET /v1/account answers. suspended: an admin suspended it (USR-7); it can't sign in, and its API keys and calendar feed stop working, but its data is kept.

"active" | "pending" | "suspended"

### AccountStorage

| Field | Type | Description |
|---|---|---|
| `usedBytes` | integer | Photos and tracks on this account. |
| `limitBytes` (optional) | integer | How much it may keep (SEC-6); absent when this server sets no limit. |

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### ApiKey

A key for scripts and integrations, with only the access it was given (KEY-1).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `name` | string | What it's for, "RefSix import". |
| `prefix` | string | The start of the key, to recognize it: lf_ and 8 characters. |
| `scopes` | [ApiKeyScope](#apikeyscope)[] |  |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastUsedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | To within five minutes; none until it's used. |
| `expiresAt` (optional) | [Timestamp](json-schema/Timestamp.json) | None for a key that doesn't expire. |
| `notify` | boolean | Whether the user's phones are told when this key adds a match, or cancels, postpones, moves or removes one that hasn't kicked off (NOTE-1). |

### ApiKeyChange

What can change on a key after it's made.

| Field | Type | Description |
|---|---|---|
| `notify` | boolean | Tell the user's phones when this key adds or changes matches (NOTE-1). |

### ApiKeyScope

<collection>:read, or <collection>:write (which includes reading it).

"matches:read" | "matches:write" | "match-templates:read" | "match-templates:write" | "match-records:read" | "match-records:write" | "venues:read" | "venues:write" | "competitions:read" | "competitions:write" | "referees:read" | "referees:write" | "settings:read" | "settings:write"

### AppSignIn

A code that signs a phone in to this account. It works once, for two minutes.

| Field | Type | Description |
|---|---|---|
| `id` | string | For GET /v1/app-sign-in/{id}. |
| `code` | string | Eight letters and digits. |
| `link` | string | What the QR code holds: the web app's Get the app page with the code in its fragment, which a phone's camera can open. |
| `appLink` | string | The same as a lawfive:// link, which opens the app. |
| `server` | string | The address to sign in at, for someone typing the code. |
| `expiresAt` | [Timestamp](json-schema/Timestamp.json) |  |

### AppSignInCheck

Whose the code is, so the phone can ask before signing in.

| Field | Type | Description |
|---|---|---|
| `name` | string |  |
| `email` | string |  |
| `expiresAt` | [Timestamp](json-schema/Timestamp.json) |  |

### AppSignInCode

| Field | Type | Description |
|---|---|---|
| `code` | string |  |

### AppSignInResult

| Field | Type | Description |
|---|---|---|
| `token` | string | The session token, sent from then on as Authorization: Bearer <token>. |
| `user` | { id: string, name: string, email: string, status: [AccountStatus](#accountstatus) } |  |

### AppSignInStatus

| Field | Type | Description |
|---|---|---|
| `status` | "waiting" \| "used" \| "expired" |  |
| `deviceName` (optional) | string | The phone that used it, when it said which. |

### AssignorCalendar

An assignor's calendar link, read into the account's matches every 30 minutes (FEED-1 to FEED-9).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `name` | string |  |
| `system` | [AssignorSystem](#assignorsystem) |  |
| `link` | string | The start of the link, to recognize it by: the whole link is a password, so it's never sent back (FEED-2). |
| `notify` | boolean | Tell the account's phones when it adds, moves or cancels a match (FEED-8, NOTE-1). |
| `active` | boolean | false: paused, by the person or after the link stopped working (FEED-9); not read. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastReadAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When it was last read, whatever happened. |
| `lastChangedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When a read last added or changed a match. |
| `lastResult` (optional) | { games: integer, added: integer, updated: integer, canceled: integer } | What the latest read that worked found and did. |
| `problem` (optional) | string | Why the latest read didn't work, or why it's paused. |
| `stoppedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When it was paused because the link stopped working (FEED-9). |
| `skipped` | [AssignorCalendarSkipped](#assignorcalendarskipped)[] | Events the latest read couldn't save, at most 20. |

### AssignorCalendarChange

| Field | Type | Description |
|---|---|---|
| `name` (optional) | string |  |
| `notify` (optional) | boolean |  |
| `active` (optional) | boolean | false pauses it; true starts reading it again, straight away. |
| `url` (optional) | string | A new link, such as one the assignor system made again (FEED-9); read straight away. |

### AssignorCalendarEvent

A game in an assignor's calendar, as it would be saved.

| Field | Type | Description |
|---|---|---|
| `title` | string | Home v Away, or the match's name. |
| `kickoff` | [Timestamp](json-schema/Timestamp.json) |  |
| `timeZone` (optional) | string | IANA time zone name, for example America/Los_Angeles. |
| `venue` (optional) | string |  |
| `inLawFive` | boolean | A match already in LawFive at this kickoff, which the calendar takes on without changing (FEED-5). |

### AssignorCalendarLink

| Field | Type | Description |
|---|---|---|
| `url` | string | The calendar link: https, http, or webcal (read as https). |
| `system` | [AssignorSystem](#assignorsystem) |  |

### AssignorCalendarPreview

What a calendar link holds, before connecting it; nothing is saved (FEED-1).

| Field | Type | Description |
|---|---|---|
| `calendarName` (optional) | string | What the calendar calls itself (X-WR-CALNAME). |
| `games` | integer | Games still to come. |
| `from` (optional) | [Timestamp](json-schema/Timestamp.json) | The first one's kickoff. |
| `to` (optional) | [Timestamp](json-schema/Timestamp.json) | The last one's kickoff. |
| `inLawFive` | integer | Of those, how many are already in LawFive at the same kickoff. |
| `first` | [AssignorCalendarEvent](#assignorcalendarevent)[] | The first three, as they'd be saved. |
| `skipped` | [AssignorCalendarSkipped](#assignorcalendarskipped)[] | Events that couldn't be read, at most 20. |

### AssignorCalendarSkipped

An event that couldn't be read or saved, and why (FEED-9).

| Field | Type | Description |
|---|---|---|
| `title` | string | The event's summary, or what's known of it. |
| `kickoff` (optional) | [Timestamp](json-schema/Timestamp.json) |  |
| `reason` | string |  |

### AssignorSystem

Which system a calendar link is from: ArbiterSports, Assignr, HorizonWebRef, RefTown, GotSport, Spordle, or another (FEED-1). Each is read the same way until it has rules of its own (FEED-5).

"arbiter" | "assignr" | "horizon" | "reftown" | "gotsport" | "spordle" | "other"

### Attachment

A photo on a match, venue or referee (FILE-1). The files are private: fetching them needs the same sign-in as the rest of the API.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `recordType` | [AttachmentRecordType](#attachmentrecordtype) |  |
| `recordId` | [Id](json-schema/Id.json) | The match, venue or referee it's on. |
| `contentType` | "image/jpeg" \| "image/png" \| "image/webp" | What the file is, worked out from its contents. |
| `size` | integer | The file's size in bytes. |
| `width` (optional) | integer | Its width in pixels, when the upload gave it. |
| `height` (optional) | integer |  |
| `caption` (optional) | string |  |
| `position` | integer | Its place among the record's attachments, from 0. A referee's first photo is their picture. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `url` | string | Where to fetch the file: /v1/attachments/{id}/file, with the same sign-in. |
| `thumbUrl` | string | A small version for lists and galleries: /v1/attachments/{id}/thumb (the file itself when none was uploaded). |

### AttachmentChange

What to change about an attachment; leave out what stays the same.

| Field | Type | Description |
|---|---|---|
| `caption` (optional) | string \| null | The new caption; null or an empty string removes it. |
| `position` (optional) | integer | Move it to this place among the record's attachments (0 is first; a larger number moves it to the end). |

### AttachmentRecordType

The kinds of record that can have attachments.

"match" | "venue" | "referee"

### AttachmentUpload

The form fields of an upload (multipart/form-data), beside the files: file (a JPEG, PNG or WebP of at most 10 MB) and, optionally, thumb (a small version, at most 1 MB).

| Field | Type | Description |
|---|---|---|
| `recordType` | [AttachmentRecordType](#attachmentrecordtype) |  |
| `recordId` | [Id](json-schema/Id.json) |  |
| `caption` (optional) | string |  |
| `width` (optional) | integer | The image's width in pixels. |
| `height` (optional) | integer |  |

### AuthError

An error from the account endpoints.

| Field | Type | Description |
|---|---|---|
| `message` | string |  |
| `code` | string | For example INVALID_EMAIL_OR_PASSWORD or INVALID_ORIGIN. |

It may have more fields.

### CalendarFeed

The account's private calendar address (CAL-1). Anyone with it can see the matches in it; make a new one to stop the old one working.

| Field | Type | Description |
|---|---|---|
| `url` | string | The feed (https), for calendar apps that ask for an address. |
| `webcalUrl` | string | The same feed as webcal://, which opens the calendar app to subscribe. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastFetchedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When a calendar app last fetched it, to within an hour. |

### Change

A record as it is now, after a change: created, updated or deleted (deletedAt set).

- { collection: "matches", record: [Match](json-schema/Match.json) }
- { collection: "match-templates", record: [MatchTemplate](json-schema/MatchTemplate.json) }
- { collection: "match-records", record: [MatchRecord](json-schema/MatchRecord.json) }
- { collection: "venues", record: [Venue](json-schema/Venue.json) }
- { collection: "competitions", record: [Competition](json-schema/Competition.json) }
- { collection: "referees", record: [Referee](json-schema/Referee.json) }
- { collection: "settings", record: [UserSettings](json-schema/UserSettings.json) }

### ChangesPage

One page of the changes after a cursor, for sync.

| Field | Type | Description |
|---|---|---|
| `changes` | [Change](#change)[] | Oldest first. A record changed several times appears once, as it is now. |
| `cursor` | integer | Send as since next time. Unchanged when there's nothing new. |
| `more` | boolean | true when there are more changes after this page; ask again straight away. |

### CreatedApiKey

A new key, with the key itself. The server keeps only a hash, so it can't show it again.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `name` | string | What it's for, "RefSix import". |
| `prefix` | string | The start of the key, to recognize it: lf_ and 8 characters. |
| `scopes` | [ApiKeyScope](#apikeyscope)[] |  |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastUsedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | To within five minutes; none until it's used. |
| `expiresAt` (optional) | [Timestamp](json-schema/Timestamp.json) | None for a key that doesn't expire. |
| `notify` | boolean | Whether the user's phones are told when this key adds a match, or cancels, postpones, moves or removes one that hasn't kicked off (NOTE-1). |
| `key` | string | The key itself, shown only this once: send it as Authorization: Bearer <key>. |

### CreatedWebhook

A new webhook, with the secret its deliveries are signed with.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `url` | string | Where deliveries are POSTed. |
| `topics` | [WebhookTopic](#webhooktopic)[] | Which records' changes it hears about. |
| `active` | boolean | Paused webhooks get no deliveries. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastDelivery` (optional) | { at: [Timestamp](json-schema/Timestamp.json), status: "pending" \| "delivered" \| "failed", responseCode?: integer } | The latest delivery and how it went. |
| `secret` | string | For checking a delivery's X-LawFive-Signature, shown only this once. |

### Device

Somewhere the account is signed in: a browser or a linked watch.

| Field | Type | Description |
|---|---|---|
| `id` | string | The session's id, for DELETE /v1/devices/{id}. |
| `kind` | string | browser, or the app's name from its X-LawFive-Device header (garmin). |
| `name` | string | For people: "Garmin Venu 2" ("Garmin watch" when it didn't say which), "Chrome on macOS". |
| `model` (optional) | string | A watch's Garmin part number, "006-B3703-00", when it gives one. |
| `firmware` (optional) | string | A watch's firmware version, "12.30", when it gives one. |
| `appVersion` (optional) | string | The version of LawFive on it (VER-3), "2026.10.30", from the app= in its X-LawFive-Device header; missing for browsers and apps from before it. |
| `linkedAt` | [Timestamp](json-schema/Timestamp.json) | When it signed in or was linked. |
| `lastActiveAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `current` | boolean | true for the device making this request. |
| `watchOnly` (optional) | boolean | true for a watch's link, which only syncs matches (SEC-13); absent for everything else. |

### DeviceCode

A code for linking a watch (RFC 8628).

| Field | Type | Description |
|---|---|---|
| `device_code` | string | Secret; the watch polls with it. |
| `user_code` | string | Eight letters and digits without look-alikes, shown on the watch. |
| `verification_uri` | string | The web app's Link page. |
| `verification_uri_complete` | string | The Link page with the code filled in, for a QR code. |
| `expires_in` | integer | Seconds (600). |
| `interval` | integer | Seconds to wait between polls (5). |

### DeviceToken

The watch's token once someone has approved its code.

| Field | Type | Description |
|---|---|---|
| `access_token` | string | Send as Authorization: Bearer <token>. |
| `token_type` | "Bearer" |  |
| `expires_in` | integer |  |
| `scope` | string |  |

It may have more fields.

### DuplicateGroups

Likely duplicates across all of the user's venues or referees (DUP-1, DUP-7).

| Field | Type | Description |
|---|---|---|
| `groups` | ({ reasons: string[], members: [DuplicateMember](#duplicatemember)[] })[] | Groups that are probably one venue or person, surest first. |
| `of` | integer | How many venues or referees there are in all. |

### DuplicateMember

A venue or referee as the duplicate finder and merge preview show it (DUP-2, DUP-7).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `name` | string |  |
| `aliases` | string[] | Its other names (DUP-6, DUP-9). |
| `address` (optional) | string | A venue's. |
| `pitches` (optional) | integer | A venue's number of pitches. |
| `email` (optional) | string | A referee's. |
| `phone` (optional) | string | A referee's. |
| `matches` | [MatchCount](#matchcount) |  |
| `reasons` (optional) | string[] | Why it's likely the same as the one asked about ("Same address", "Same name, in a different order"), surest first; for the likeliest only. |

### EmailChange

| Field | Type | Description |
|---|---|---|
| `email` | string |  |
| `password` | string | The account's password, to confirm it's them. |

### EmailConfirmation

Following the link that confirms a new email address (USR-9).

| Field | Type | Description |
|---|---|---|
| `token` | string | From the link emailed to the new address: /confirm-email/<token>. |

### ImportRow

A row as a spreadsheet has it: column names (Home, home_colour and homeColour are the same column) and text, number or true/false values. Empty values change nothing.

{}

It may have more fields.

### ImportedRow

| Field | Type | Description |
|---|---|---|
| `row` | integer | The row's place in rows, from 1. |
| `action` | "add" \| "update" \| "skip" | skip: it has problems, so it wasn't imported. |
| `matchId` (optional) | [Id](json-schema/Id.json) | The match it added or updated (or would). |
| `title` (optional) | string | The match in a few words, for showing the row: home v away. |
| `kickoff` (optional) | [Timestamp](json-schema/Timestamp.json) | Its kickoff, once imported. |
| `problems` | string[] | Why it's skipped, naming the column; empty when it isn't. |

### Invite

An invitation to make an account, even when sign-up is closed (USR-3). It works once, for 14 days.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `email` (optional) | string | Who it's for; only this address can use it. None for a link anyone can use once. |
| `name` (optional) | string | Their name, to fill in the sign-up form. |
| `link` | string | The link to send: the web app's invitation page. |
| `createdBy` | string | The name of the admin who made it. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `expiresAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `usedAt` (optional) | [Timestamp](json-schema/Timestamp.json) |  |
| `usedBy` (optional) | string | The name of the account made with it. |
| `emailedAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When it was emailed, if it was. |
| `plan` (optional) | [PlanName](#planname) | The plan the account joins (PLAN-5); the default (or the sign-up trial) when there's none. |
| `planDays` (optional) | integer | For how many days, then the default plan; none: it doesn't end. |

### InviteLookup

What the invitation page shows before someone signs up with it.

| Field | Type | Description |
|---|---|---|
| `email` (optional) | string | The address it's for; the sign-up form uses it and doesn't let it be changed. |
| `name` (optional) | string |  |
| `invitedBy` | string |  |
| `expiresAt` | [Timestamp](json-schema/Timestamp.json) |  |

### LikelyDuplicates

The venues or referees most likely the same as one (Merge with…, DUP-1, DUP-7).

| Field | Type | Description |
|---|---|---|
| `likely` | [DuplicateMember](#duplicatemember)[] | At most six, likeliest first, each with its reasons. |

### MatchCount

How many matches a venue or referee has, or several as if merged.

| Field | Type | Description |
|---|---|---|
| `played` | integer |  |
| `upcoming` | integer | Scheduled matches. |
| `last` (optional) | [Timestamp](json-schema/Timestamp.json) | The latest played match's kickoff. |

### MatchImport

Matches to add or update, from a spreadsheet, CSV or JSON file (IMP-1 to IMP-8).

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportRow](#importrow)[] |  |
| `timeZone` (optional) | string | For kickoffs written without a UTC offset, when the row has no Time zone column; the web app sends the browser's. UTC when not given. |
| `dateOrder` (optional) | "dmy" \| "mdy" | How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) need none. mdy when not given. |
| `dryRun` (optional) | boolean | Check every row and say what would happen, without saving anything (IMP-5). |

### MatchImportFileFields

The form fields of a file import (multipart/form-data), beside the file.

| Field | Type | Description |
|---|---|---|
| `timeZone` (optional) | string | For kickoffs written without a UTC offset, when the row has no Time zone column. |
| `dateOrder` (optional) | "dmy" \| "mdy" | How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) are always understood. |
| `dryRun` (optional) | "true" \| "false" | true: check every row and say what would happen, without saving anything (IMP-5). |

### MatchImportFileResult

MatchImportResult, for a file (IMP-2).

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportedRow](#importedrow)[] | Every row that had anything in it, in order. |
| `added` | integer |  |
| `updated` | integer |  |
| `skipped` | integer |  |
| `created` | { venues: string[], competitions: string[], referees: string[] } | Names the user had no record for, added (or, on a dry run, to be added) (IMP-4). |
| `ignoredColumns` | string[] | Columns the import doesn't know, as written in the file. |
| `file` | { kind: "table" \| "json", lines: integer[] } | How to point at a row in the file. |

### MatchImportResult

| Field | Type | Description |
|---|---|---|
| `rows` | [ImportedRow](#importedrow)[] | Every row that had anything in it, in order. |
| `added` | integer |  |
| `updated` | integer |  |
| `skipped` | integer |  |
| `created` | { venues: string[], competitions: string[], referees: string[] } | Names the user had no record for, added (or, on a dry run, to be added) (IMP-4). |
| `ignoredColumns` | string[] | Columns the import doesn't know, as written in the file. |

### MatchNotice

What an integration (an API key, or an assignor calendar) did to the user's matches, collected over about a minute, for a phone to write as a notification (NOTE-3).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `source` | string | Who made the changes: the API key's name, which is usually the integration's, or the assignor calendar's (FEED-8). |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `matches` | ({ matchId: [Id](json-schema/Id.json), changes: [MatchNoticeChange](#matchnoticechange)[], title: string, kickoff?: [Timestamp](json-schema/Timestamp.json), previousKickoff?: [Timestamp](json-schema/Timestamp.json), timeZone?: string, venue?: string, previousVenue?: string })[] | The matches, soonest first. |

### MatchNoticeChange

added: a new match; canceled, postponed; backOn: scheduled again after being canceled or postponed; kickoff: moved to another time; venue: moved to another venue; removed: deleted.

"added" | "canceled" | "postponed" | "backOn" | "kickoff" | "venue" | "removed"

### MatchOnWatch

A match on one of the account's linked watches (SYNC-14): in the watch's latest download of its next matches.

| Field | Type | Description |
|---|---|---|
| `matchId` | [Id](json-schema/Id.json) |  |
| `deviceId` | string | The watch's link, as GET /v1/devices gives it (the session's id). |
| `kind` | string | garmin, wearos or applewatch, from the watch's X-LawFive-Device header; watch when it didn't say. |
| `name` | string | For people: "Garmin Venu 2", "Galaxy Watch4", "Apple Watch Series 9" ("Garmin watch" when it didn't say which). |
| `since` | [Timestamp](json-schema/Timestamp.json) | When the watch first got the match as it has it now. |
| `syncedAt` | [Timestamp](json-schema/Timestamp.json) | The watch's latest download, which still had the match. |
| `upToDate` | boolean | false when what the watch shows of the match has changed since (teams, kickoff, format, venue, officials, notes, fee), or the match is no longer scheduled: the watch's next sync brings the change, or takes the match off. |

### MatchShare

A match's share link (DATA-7).

| Field | Type | Description |
|---|---|---|
| `url` | string | The public page: PUBLIC_URL/s/<token>. Anyone with it can see the match. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |

### NameChange

A new name for the signed-in account (USR-10); nothing else can be changed this way.

| Field | Type | Description |
|---|---|---|
| `name` | [AccountName](#accountname) |  |

### NetworkView

How the server tells visitors apart, for its limits on tries (SEC-2, SEC-14). Both settings are environment values only.

| Field | Type | Description |
|---|---|---|
| `yourAddress` | string | The address this server sees the request coming from, after believing the trusted proxies. |
| `trustedProxies` | string[] | TRUSTED_PROXIES: the proxies believed about the visitor's address; empty, none. |
| `trustedIpHeader` (optional) | string | TRUSTED_IP_HEADER, when set. |

### NewApiKey

| Field | Type | Description |
|---|---|---|
| `name` | string |  |
| `scopes` | [ApiKeyScope](#apikeyscope)[] | At least one. |
| `expiresInDays` (optional) | integer | Leave out for a key that doesn't expire. |
| `notify` (optional) | boolean | Tell the user's phones when this key adds or changes matches (NOTE-1); off when left out. |

### NewAssignorCalendar

| Field | Type | Description |
|---|---|---|
| `url` | string | The calendar link: https, http, or webcal (read as https). |
| `system` | [AssignorSystem](#assignorsystem) |  |
| `name` | string |  |
| `notify` (optional) | boolean | true when left out (FEED-8). |

### NewInvite

| Field | Type | Description |
|---|---|---|
| `email` (optional) | string | Who it's for; only this address can use it. |
| `name` (optional) | string | Their name, to fill in the sign-up form. |
| `send` (optional) | boolean | Email it to them (needs email set up on the server, and an email). |
| `plan` (optional) | string | The plan the account joins (PLAN-5). |
| `planDays` (optional) | integer | For how many days, then the default plan. |

### NotTheSame

Venues or referees the user says are different, so they aren't suggested together again (DUP-5).

| Field | Type | Description |
|---|---|---|
| `others` | [Id](json-schema/Id.json)[] | Venues or referees that aren't the same as this one, nor as each other. |

### OAuthError

An error from the linking endpoints, as RFC 8628 has them.

| Field | Type | Description |
|---|---|---|
| `error` | string | authorization_pending, slow_down, expired_token, access_denied, invalid_request, invalid_client, invalid_grant or unauthorized. |
| `error_description` (optional) | string |  |

It may have more fields.

### Person

An account on this server, as an admin sees it (USR-1).

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `name` | string |  |
| `email` | string |  |
| `status` | [AccountStatus](#accountstatus) |  |
| `admin` | boolean |  |
| `adminFromSetting` | boolean | An admin because the server's ADMIN_EMAILS lists them, which the web app can't change. |
| `joinedAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastActiveAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When one of their devices last used the account; none if never signed in since joining. |
| `invitedBy` (optional) | string | The name of the admin whose invitation they joined with. |
| `plan` | [PersonPlan](#personplan) | Their plan (PLAN-3). |
| `lockedUntil` (optional) | [Timestamp](json-schema/Timestamp.json) | Signing in is refused until then, after too many wrong passwords (SEC-12); Unlock ends it now. |

### PersonPlan

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `name` | string |  |
| `endsAt` (optional) | [Timestamp](json-schema/Timestamp.json) |  |
| `endsOn` (optional) | string |  |
| `then` (optional) | [PlanName](#planname) |  |

### Place

A place found by address search.

| Field | Type | Description |
|---|---|---|
| `name` | string | The full address. |
| `lat` | number |  |
| `lon` | number |  |

### Plan

A named set of limits (PLAN-1).

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `name` | string |  |
| `limits` | [PlanLimits](#planlimits) |  |
| `default` | boolean | New accounts join it, and accounts given no plan are in it. |
| `people` | integer | Accounts in it now. |
| `inUse` | boolean | Something refers to it (an account, an account's next plan, an unused invitation, the sign-up trial, or it's the default), so it can't be deleted. |

### PlanChange

Putting an account in a plan (PLAN-3).

| Field | Type | Description |
|---|---|---|
| `plan` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `endsOn` (optional) | string | Its last day, in the account's time zone; none: it doesn't end. |
| `then` (optional) | string | The plan after it ends; the default when left out. |

### PlanHistoryEntry

| Field | Type | Description |
|---|---|---|
| `from` (optional) | [PlanName](#planname) | None for the first entry. |
| `to` | [PlanName](#planname) |  |
| `at` | [Timestamp](json-schema/Timestamp.json) |  |
| `reason` | "sign-up" \| "invite" \| "admin" \| "ended" | sign-up: joined (a trial, or the default then); invite: joined with an invitation's plan; admin: an admin changed it; ended: the plan before it ended. |
| `by` (optional) | string | The admin's name, for reason admin. |
| `endsAt` (optional) | [Timestamp](json-schema/Timestamp.json) | When this one was set to end. |

### PlanInput

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `name` | string |  |
| `limits` | [PlanLimits](#planlimits) |  |

### PlanLimits

What a plan allows (PLAN-2).

| Field | Type | Description |
|---|---|---|
| `matches` (optional) | integer | Matches kept, not counting deleted ones; matches recorded on a watch are never refused. Left out: no limit; 0: none at all. |
| `referees` (optional) | integer | Referees kept. Left out: no limit; 0: none at all. |
| `venues` (optional) | integer | Venues kept. Left out: no limit; 0: none at all. |
| `storageMb` (optional) | integer | Megabytes of photos and tracks (SEC-6); a track recorded on a watch is never refused. Left out: no limit; 0: none at all. |
| `photoMb` (optional) | integer | The largest photo, in megabytes; the server's own most, 10 MB, still applies. Left out: no limit; 0: none at all. |
| `fileMb` (optional) | integer | The largest file brought in (an import or a restore), in megabytes; the server's own most for each (5 MB and 2 GB) still applies. Left out: no limit; 0: none at all. |
| `devices` (optional) | integer | Watches and phones signed in at once (PLAN-7); browsers don't count. Left out: no limit; 0: none at all. |
| `pushPerDay` (optional) | integer | Phone notifications a day (from midnight UTC), across all the account's phones (PLAN-8). Left out: no limit; 0: none at all. |
| `apiKeys` (optional) | integer | API keys (KEY-1). Left out: no limit; 0: none at all. |
| `apiCallsPerMinute` (optional) | integer | Requests made with the account's API keys a minute, all its keys together (PLAN-8). Left out: no limit; 0: none at all. |
| `apiCallsPerDay` (optional) | integer | Requests made with the account's API keys a day (from midnight UTC), all its keys together (PLAN-8). Left out: no limit; 0: none at all. |
| `webhooks` (optional) | integer | Webhooks (HOOK-1). Left out: no limit; 0: none at all. |
| `assignorCalendars` (optional) | integer | Assignor calendars (FEED-10). Left out: no limit; 0: none at all. |
| `addressSearchesPerDay` (optional) | integer | Address searches a day (from midnight UTC), for placing venues on the map (PLAN-11). Left out: no limit; 0: none at all. |

### PlanName

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `name` | string |  |

### PlanRefusal

An ApiError; over a plan's limit, it says which (PLAN-4).

| Field | Type | Description |
|---|---|---|
| `error` | string |  |
| `limit` (optional) | "matches" \| "referees" \| "venues" \| "storageMb" \| "photoMb" \| "fileMb" \| "devices" \| "pushPerDay" \| "apiKeys" \| "apiCallsPerMinute" \| "apiCallsPerDay" \| "webhooks" \| "assignorCalendars" \| "addressSearchesPerDay" | The plan's limit that was reached (PLAN-4). |
| `allowed` (optional) | integer | What the plan allows of it. |

### PlanSettings

| Field | Type | Description |
|---|---|---|
| `default` (optional) | string | The plan new accounts join. |
| `signUpTrial` (optional) | [SignUpTrial](#signuptrial) \| null | null: no trial. |

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

### Plans

| Field | Type | Description |
|---|---|---|
| `plans` | [Plan](#plan)[] | By name. |
| `signUpTrial` (optional) | [SignUpTrial](#signuptrial) |  |

### PushHandle

| Field | Type | Description |
|---|---|---|
| `handle` | string \| null | What the push relay gave this phone (PUSH-2), which only it can read; null to stop notifications. |

### RefereeMerge

Referees to merge into one (DUP-3, DUP-4).

| Field | Type | Description |
|---|---|---|
| `from` | [Id](json-schema/Id.json)[] | The referees to merge into this one; they're deleted. |
| `name` | string | The name to keep: one of the referees' names or other names. The rest become other names. |
| `email` (optional) | string | When they have different emails, the one to keep; otherwise the one there is. |
| `phone` (optional) | string | When they have different phone numbers, the one to keep; otherwise the one there is. |

### RefereeMergeDraft

A referee merge as chosen so far, to preview (DUP-4).

| Field | Type | Description |
|---|---|---|
| `from` | [Id](json-schema/Id.json)[] | The referees to merge into this one; they're deleted. |
| `name` (optional) | string | The name chosen so far; left out, or not one of theirs, the kept referee's. |
| `email` (optional) | string | The email chosen so far, where they differ. |
| `phone` (optional) | string | The phone number chosen so far, where they differ. |

### RefereeMergePreview

What merging these referees would make (DUP-4, DUP-11).

| Field | Type | Description |
|---|---|---|
| `referees` | [DuplicateMember](#duplicatemember)[] | The referee kept, then the others, in the order sent; each with its reasons when it's among the likeliest. |
| `names` | string[] | Every name to choose from: theirs and their other names, once each. The rest become other names. |
| `name` | string | The name that will be kept. |
| `emails` | string[] | Their emails, once each: a choice when there's more than one. |
| `email` (optional) | string |  |
| `phones` | string[] | Their phone numbers, once each: a choice when there's more than one. |
| `phone` (optional) | string |  |
| `together` | [MatchCount](#matchcount) | Their matches as one referee, crew typed in under one of their names included; a match counts once. |
| `merge` | [RefereeMerge](#refereemerge) | What to send to POST /v1/referees/{id}/merge to merge exactly this. |

### RefereeMergeResult

| Field | Type | Description |
|---|---|---|
| `referee` | [Referee](json-schema/Referee.json) | The referee they were merged into, as saved. |
| `merged` | integer | How many referees were merged into it (and deleted). |
| `matchesUpdated` | integer | Matches whose crew now names it, including crew typed as one of its names. |

### ResetLink

A link an admin sends someone who forgot their password, for servers without email (USR-7).

| Field | Type | Description |
|---|---|---|
| `link` | string | The web app's page for choosing a new password. It works once. |
| `expiresAt` | [Timestamp](json-schema/Timestamp.json) |  |

### RestoreResult

What restoring an export did (DATA-4). Records the account already has a newer copy of are unchanged; running it again adds nothing.

| Field | Type | Description |
|---|---|---|
| `records` | {} | By collection: matches, venues, referees… |
| `tracks` | { added: integer, updated: integer, unchanged: integer } |  |
| `photos` | { added: integer, updated: integer, unchanged: integer } |  |
| `problems` | string[] | What couldn't be restored and why, at most 50. |

### ServerMeta

What this server is and offers, so apps can adapt to older or self-hosted servers.

| Field | Type | Description |
|---|---|---|
| `product` | "LawFive" |  |
| `apiUrl` (optional) | string | The address apps should use for the API, which may differ from the one they came through (APP-13). |
| `apiVersion` | integer | Raised when the API changes in a way older apps can't follow. |
| `openApiUrl` (optional) | string | Where this server describes its own API as OpenAPI (AGT-3); missing on servers from before it. |
| `version` (optional) | string | The server's version (VER-1): the day of its last change, "2026.10.30" ("2026.10.30.2" for a second change that day), or "dev" when run from a checkout without git. Missing on servers from before it. |
| `commit` (optional) | string | The commit it was built from, "f5de635". |
| `capabilities` | string[] | What this server offers: accounts, records, changes, tracks and stats (missing on servers from before them), devices, link, watch, people, invites, calendar and import, then email, geocode, push, notices (with push, from servers that tell phones what integrations did, NOTE-1) and weather when they're switched on; merging, from servers that find duplicates and preview merges for the apps (DUP-11); plans, from servers with plans and the account's time zone (PLAN-6, PLAN-9); assignor-calendars, from servers that read assignors' calendar links (FEED-1). Ignore names you don't know. |
| `maps` | { style?: { url: string, darkUrl?: string, attribution: string }, tileUrl: string, attribution: string, satellite?: { tileUrl: string, attribution: string } } |  |
| `geocoder` (optional) | { url: string } | The address search service behind GET /v1/geocode, to credit it. |
| `weather` (optional) | { source: string } | Whose weather data GET /v1/weather uses, to credit it. |
| `firstAccount` (optional) | true | Nobody has an account on this server yet (USR-8): the first one can be made whatever signUp says, with the setup code when setupCodeNeeded, and it's the server's admin. |
| `setupCodeNeeded` (optional) | true | The first account needs the code in the server's logs (ADM-5). |
| `setupPending` (optional) | true | The first account hasn't finished setting the server up (ADM-5). |
| `publicUrl` (optional) | string | The server's own address (PUBLIC_URL), for the website to say if it isn't HTTPS (ADM-5, ADM-6). |
| `signUp` (optional) | [SignUpMode](#signupmode) | Who can make an account (USR-2); missing on servers from before it, which were open or closed. |

### ServerSettingView

A server setting as the admin page shows it (ADM-1).

| Field | Type | Description |
|---|---|---|
| `key` | "signUp" \| "smtpUrl" \| "mailFrom" \| "mapStyleUrl" \| "mapStyleDarkUrl" \| "mapStyleAttribution" \| "mapTileUrl" \| "mapAttribution" \| "mapSatelliteUrl" \| "mapSatelliteAttribution" \| "geocoderUrl" \| "weatherUrl" \| "weatherHistoryUrl" \| "weatherApiKey" \| "weatherDailyLimit" \| "webhookAllowPrivate" |  |
| `env` | string | Its environment variable. |
| `source` | "environment" \| "admin" \| "default" | environment: set there, so fixed; admin: set in the web app; default: neither. |
| `value` (optional) | string | The value in use, when it's set and not a secret. |
| `secret` (optional) | true | Never sent back: set says whether it has a value. |
| `set` (optional) | boolean |  |

### ServerSettings

Settings for the whole server that admins change in the web app (ADM-1, ADM-2), sending only those that change. One the environment sets is fixed there and can't be changed.

| Field | Type | Description |
|---|---|---|
| `signUp` (optional) | [SignUpMode](#signupmode) \| null | Who can make an account (USR-2, SIGN_UP). |
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

### Session

A signed-in device.

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `userId` | string |  |
| `token` | string | The bearer token. |
| `expiresAt` | string | 90 days after it was last renewed; a session is renewed once a day while it's used. |
| `createdAt` | string |  |
| `updatedAt` | string |  |

It may have more fields.

### SharedMatch

What a match's share link shows (DATA-7): never its notes, fee, crew, contacts, player names or photos.

| Field | Type | Description |
|---|---|---|
| `match` | [Match](json-schema/Match.json) | Only what a public page shows: without its notes, outlook, fee, crew, tags, match number, assignor or the ids of its venue, pitch, competition and template. |
| `record` (optional) | [MatchRecord](json-schema/MatchRecord.json) | Its match report, when it's been played, without notes on events or team officials' names. |
| `competition` (optional) | string | The competition's name. |
| `venue` (optional) | string | The venue's name. |
| `pitch` (optional) | string | The pitch's name. |
| `distanceUnit` | [DistanceUnit](json-schema/DistanceUnit.json) | The sharer's, for the figures. |
| `track` | boolean | Whether GET /v1/shared/{token}/track has a track. |

### SignOutOthers

| Field | Type | Description |
|---|---|---|
| `scope` | "browsers" \| "all" | browsers: other browsers only, so watches and phones stay linked. all: every other device too. |

### SignUpMode

Who can make an account (USR-2): open, anyone; approval, anyone, but an admin approves the account before it can be used; closed, only people with an invitation (USR-3).

"open" | "approval" | "closed"

### SignUpTrial

New accounts start in this plan for these days, then go to the default (PLAN-5).

| Field | Type | Description |
|---|---|---|
| `plan` | string | A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family. |
| `days` | integer |  |

### User

A LawFive account.

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `name` | string |  |
| `email` | string |  |
| `emailVerified` | boolean |  |
| `image` (optional) | string \| null |  |
| `createdAt` | string |  |
| `updatedAt` | string |  |

It may have more fields.

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

### VenueMerge

Venues to merge into one (DUP-7): the venue's details, and what happens to each of the others' pitches.

| Field | Type | Description |
|---|---|---|
| `from` | [Id](json-schema/Id.json)[] | The venues to merge into this one; they're deleted. |
| `name` | string | The name to keep: one of the venues' names or other names. The rest become other names. |
| `addressFrom` (optional) | [Id](json-schema/Id.json) | When they have different addresses or parking spots, the venue (this one or one of from) whose address and parking to keep; otherwise the ones there are. |
| `pitches` | ({ id: [Id](json-schema/Id.json), into?: [Id](json-schema/Id.json), name?: string })[] | What happens to each pitch of the venues in from: every one, once. |

### VenueMergeDraft

A venue merge as chosen so far, to preview (DUP-7, DUP-8).

| Field | Type | Description |
|---|---|---|
| `from` | [Id](json-schema/Id.json)[] | The venues to merge into this one; they're deleted. |
| `name` (optional) | string | The name chosen so far; left out, or not one of theirs, the kept venue's. |
| `addressFrom` (optional) | [Id](json-schema/Id.json) | The venue whose address and parking were chosen so far, where they differ. |
| `pitches` (optional) | ({ id: [Id](json-schema/Id.json), into?: [Id](json-schema/Id.json), name?: string })[] | The pitches the user has chosen for so far; the rest get the suggestion. A name can be empty while it's being typed. |

### VenueMergePreview

What merging these venues would make (DUP-7, DUP-8, DUP-11).

| Field | Type | Description |
|---|---|---|
| `venues` | [DuplicateMember](#duplicatemember)[] | The venue kept, then the others, in the order sent; each with its reasons when it's among the likeliest. |
| `names` | string[] | Every name to choose from: theirs and their other names, once each. The rest become other names. |
| `name` | string | The name that will be kept. |
| `places` | ({ venueId: [Id](json-schema/Id.json), address?: string, onMap: boolean })[] | Their different addresses and parking spots, once each: a choice when there's more than one. |
| `addressFrom` (optional) | [Id](json-schema/Id.json) | The venue whose address and parking will be kept. |
| `pitches` | ({ id: [Id](json-schema/Id.json), name: string, venue?: string, matches: integer, corners: integer, onMap: boolean, check: boolean, why: string, choice: { into?: [Id](json-schema/Id.json), name?: string }, targets: ({ id: [Id](json-schema/Id.json), name: string })[], problem?: string })[] | Every pitch of the venues merged away, riskiest first, then more matches and corners walked first (DUP-8). The order depends only on the venues, so rows stay put while the choices change. |
| `notes` | string[] | Things to know, such as corners walked over the 20 a pitch keeps. |
| `problems` | integer | Pitches that need a look before merging. |
| `together` | [MatchCount](#matchcount) | Their matches, at one venue. |
| `merge` (optional) | [VenueMerge](#venuemerge) | What to send to POST /v1/venues/{id}/merge to merge exactly this; none while there are problems. |

### VenueMergeResult

| Field | Type | Description |
|---|---|---|
| `venue` | [Venue](json-schema/Venue.json) | The venue they were merged into, as saved. |
| `merged` | integer | How many venues were merged into it (and deleted). |
| `matchesUpdated` | integer | Matches that now point at it, and at its pitches. |

### WatchEvent

[code, team, period, seconds, player, extra]. code: G goal, GO own goal, GP penalty, GF direct free kick, Y caution, Y2 second caution, R send-off, SB a sin bin, with its length in seconds in extra, SB2 a second sin bin for the same number, which counts as a send-off (EVT-12), TY and TR a team official's caution and send-off, with the role in extra (0 head coach, 1 assistant coach, 2 other), I injury, S stoppage, CK and CA the match clock and the added time corrected during play (TMR-14), with the change in seconds in extra (negative for back), E end of period, A abandoned, with the reason in extra (0 weather, 1 lightning, 2 crowd trouble, 3 not enough players, 4 other), SU play suspended, with the reason in extra as for A (TMR-13), RS play resumed, with the whole seconds suspended in extra, both at the period time where play stopped, PG and PM shoot-out kick scored and missed. team: 0 home, 1 away, -1 neither. period counts from 0. seconds: into the period, or -1 before kickoff, -2 at a break, -3 after full time, -4 in the shoot-out. player: shirt number or null. extra: a stoppage's length in seconds.

[string, integer, integer, integer, integer | null, integer | null]

### WatchFeeChange

A match's fee marked paid or not paid on the watch (SYNC-11).

| Field | Type | Description |
|---|---|---|
| `matchId` | [Id](json-schema/Id.json) |  |
| `paid` | boolean |  |
| `at` | integer | When it was changed on the watch, in seconds since 1970. |

### WatchMatch

A match in the form the Garmin watch starts one from (its setup keys), plus what its list shows. Watches have little memory, so the server does the converting.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `kickoff` | integer \| null | Seconds since 1970 (UTC). |
| `title` | string | "STR v ROV", for the watch's list. |
| `name` | string \| null | The match's name, or its competition's. |
| `where` | string \| null | Venue and pitch, "Twin Creeks, Field 3". |
| `role` | string \| null | Referee, AR1, AR2 or 4th official. |
| `weather` | string \| null | A short forecast in the user's temperature unit, "54° rain" (WX-7). |
| `fee` (optional) | { text: string, paid: boolean } \| null | The fee, for the match's screen and its Paid toggle (UI-19); absent from servers before it. |
| `crew` (optional) | ([string, string])[] | The other officials, [role, name]: ["AR1", "Sam Rivera"]. |
| `notes` (optional) | string \| null | The match's notes, shortened to 300 characters for the watch's memory. |
| `home` | string | Short name shown on the watch. |
| `away` | string |  |
| `homeName` | string |  |
| `awayName` | string |  |
| `homeColor` | integer | 0xRRGGBB, or -1 for none. |
| `awayColor` | integer |  |
| `numPeriods` | integer |  |
| `periodSec` | integer |  |
| `halftimeSec` | integer | The break between periods. |
| `teamSize` | integer |  |
| `midBreak` | boolean | A break halfway through each period (for example a water break). |
| `breakLenSec` | integer |  |
| `extraTime` | boolean |  |
| `etPeriods` | integer |  |
| `etPeriodSec` | integer |  |
| `goldenGoal` | boolean | A goal in extra time ends the match (ET-6). |
| `penalties` | boolean |  |
| `clockStyle` | 0 \| 1 \| 2 | For older watch builds: the account's match clock (TMR-11), 0 Match time, 1 each period from 0, 2 time left. Newer ones take it from the match screen. |
| `trackStoppage` | boolean |  |
| `stoppingClock` (optional) | boolean | The match clock stops while play is stopped, with no added time (TMR-15); trackStoppage is on with it. Absent from servers before it. |
| `stopForGoalsCards` (optional) | boolean | With a stopping clock, a goal or card recorded stops it (TMR-15). |
| `breakStoppage` | boolean | The halfway break's time is added on as stoppage (TMR-12). |
| `goalScorers` | boolean | Ask the scorer's number for each goal (EVT-10). |
| `goalTypes` | boolean |  |
| `sinBins` | boolean | Sin bin in the team menu (EVT-12). |
| `sinBinSec` | integer | A sin bin's length, 10 minutes unless the format says. |
| `misconductScheme` (optional) | [SchemeId](json-schema/SchemeId.json) | The codes for a card's reason on the watch (EVT-14): the competition's, else the account's. |

### WatchPitchMarking

A pitch's corners walked on the watch (TRK-13, SYNC-12).

| Field | Type | Description |
|---|---|---|
| `matchId` (optional) | [Id](json-schema/Id.json) | A planned match's id. |
| `created` (optional) | integer | Or, for a quick match, when it was started on the watch (it has no id until it's uploaded). |
| `corners` | ([integer, integer])[] | [latitude, longitude] in millionths of a degree, as the watch's tracks are: its JSON keeps only six significant figures of a decimal. |
| `at` | integer | When they were marked, in seconds since 1970. |

### WatchScreenChange

The match screen as chosen on the watch, or as it's sent to one (UI-21, UI-24); the latest change wins.

| Field | Type | Description |
|---|---|---|
| `layout` | [WatchLayout](json-schema/WatchLayout.json) | The nearest old layout. A watch that sends only this and secondClock is a build from before the four choices (UI-21). |
| `secondClock` | [ClockStyle](json-schema/ClockStyle.json) |  |
| `clocks` (optional) | [WatchClocks](json-schema/WatchClocks.json) |  |
| `mainClock` (optional) | [ClockStyle](json-schema/ClockStyle.json) |  |
| `breakClock` (optional) | [BreakClockStyle](json-schema/BreakClockStyle.json) |  |
| `edge` (optional) | [WatchEdge](json-schema/WatchEdge.json) |  |
| `names` (optional) | boolean |  |
| `at` | integer | When it was changed on the watch, in seconds since 1970. |

### WatchTrackChunk

Part of a match's track as the watch recorded it (TRK-7): GPS and heart rate about once a second during the periods.

| Field | Type | Description |
|---|---|---|
| `created` | integer | The match's created time, as in its upload: which match the track is for. |
| `start` | integer | When the track starts (the first kickoff), in seconds since 1970. |
| `index` | integer | Which chunk this is, from 0. |
| `count` | integer | How many chunks the track has. |
| `device` (optional) | string | The watch model, "venu2". |
| `data` | string | The chunk's samples as the watch packs them, "dt,dlat,dlon,speed,hr;" each: tenths of a second since the sample before (empty for 10; the chunk's first counts from start), millionths of a degree moved since the chunk's position before (the first is whole; both empty without a new fix), the speed the watch measured in cm/s, and beats a minute. Empty fields mean unknown; trailing ones are left off. |

### WatchTrackResult

| Field | Type | Description |
|---|---|---|
| `received` | integer | How many of the track's chunks the server has. |
| `count` | integer |  |
| `track` | "waiting" \| "saved" \| "kept" \| "dropped" | waiting: for more chunks or the match; saved: the track is on the match report; kept: the match report already had a track (from a file, say), which stays; dropped: nothing in it could be used (no positions or heart rate). |

### WatchUpload

A finished match as the watch saved it. The server stores it as a match record.

| Field | Type | Description |
|---|---|---|
| `created` | integer | When the match was started on the watch, in seconds since 1970. |
| `matchId` (optional) | [Id](json-schema/Id.json) \| null | The planned match it was started from; none for a quick match. |
| `device` (optional) | string | The watch model, "venu2". |
| `home` | string |  |
| `away` | string |  |
| `homeName` (optional) | string |  |
| `awayName` (optional) | string |  |
| `homeColor` (optional) | integer |  |
| `awayColor` (optional) | integer |  |
| `numPeriods` | integer |  |
| `periodSec` | integer |  |
| `halftimeSec` | integer |  |
| `teamSize` (optional) | integer |  |
| `breakAtSec` (optional) | integer | When the halfway break comes, or -1 for none. |
| `breakLenSec` (optional) | integer |  |
| `extraTime` (optional) | boolean |  |
| `etPeriods` (optional) | integer |  |
| `etPeriodSec` (optional) | integer |  |
| `goldenGoal` (optional) | boolean | The format's golden goal (ET-6). |
| `penalties` (optional) | boolean |  |
| `clockStyle` (optional) | integer |  |
| `trackStoppage` (optional) | boolean |  |
| `stoppingClock` (optional) | boolean | The format's stopping clock (TMR-15): every event's seconds are the clock's, which stood still during stoppages (S). |
| `stopForGoalsCards` (optional) | boolean |  |
| `breakStoppage` (optional) | boolean |  |
| `goalScorers` (optional) | boolean |  |
| `goalTypes` (optional) | boolean |  |
| `sinBins` (optional) | boolean | The format's sin bins (EVT-12). |
| `sinBinSec` (optional) | integer |  |
| `score` | [integer, integer] | [home, away]. |
| `pens` (optional) | [integer, integer] \| null | Shoot-out score, [home, away]. |
| `golden` (optional) | boolean | It ended on a golden goal in extra time (ET-6). |
| `distanceM` (optional) | number \| null | How far the referee ran, in meters. |
| `startedAt` (optional) | integer[] | When each period kicked off, in seconds since 1970, for the track's figures (TRK-3). |
| `kickoff` (optional) | integer | The team that kicked off the first period: 0 home, 1 away, -1 not chosen. |
| `homeHeading` (optional) | number \| null | The compass heading of the goal the home team attacked in the first period, in radians from true north, when the referee recorded it (PRE-8). |
| `events` | [WatchEvent](#watchevent)[] |  |
| `misconduct` (optional) | { scheme: [SchemeId](json-schema/SchemeId.json), codes: ([integer, string])[] } | The cards' reasons chosen on the watch (EVT-14); a code that isn't the scheme's for that card is left out. |
| `diagnostics` (optional) | { battery?: ([integer, integer, number])[], app?: string, firmware?: string, gpsFirstFixSec?: integer, gpsSamples?: integer, gpsMissed?: integer, restarts?: integer } | How the recording went, for tracing problems (DIAG-1). |

### WatchUploadResult

| Field | Type | Description |
|---|---|---|
| `recordId` | [Id](json-schema/Id.json) | The match record. The same every time this match is sent, so sending it again updates it. |
| `matchId` | [Id](json-schema/Id.json) | The planned match, or the one made for a quick match. |

### Webhook

A URL that hears about changes to the account's records (HOOK-1).

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) |  |
| `url` | string | Where deliveries are POSTed. |
| `topics` | [WebhookTopic](#webhooktopic)[] | Which records' changes it hears about. |
| `active` | boolean | Paused webhooks get no deliveries. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `lastDelivery` (optional) | { at: [Timestamp](json-schema/Timestamp.json), status: "pending" \| "delivered" \| "failed", responseCode?: integer } | The latest delivery and how it went. |

### WebhookDelivery

One change sent to a webhook, with how it went.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) | Also sent as X-LawFive-Delivery. |
| `event` | string | match.created, matchRecord.updated, venue.deleted… |
| `status` | "pending" \| "delivered" \| "failed" | pending: waiting for its next try; failed: gave up after five tries. |
| `attempts` | integer |  |
| `responseCode` (optional) | integer |  |
| `error` (optional) | string | Why the last try failed, when it didn't get an answer. |
| `test` | boolean | Sent with Send test. |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) |  |
| `deliveredAt` (optional) | [Timestamp](json-schema/Timestamp.json) |  |

### WebhookInput

| Field | Type | Description |
|---|---|---|
| `url` | string | http or https. |
| `topics` | [WebhookTopic](#webhooktopic)[] |  |
| `active` (optional) | boolean | true when left out. |

### WebhookPayload

What each delivery POSTs, as JSON. It's signed: X-LawFive-Signature is t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the webhook's secret>.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](json-schema/Id.json) | The delivery's id; the same on every retry, so a receiver can ignore one it has had. |
| `event` | string | <topic>.<created\|updated\|deleted> |
| `createdAt` | [Timestamp](json-schema/Timestamp.json) | When the change was made. |
| `test` (optional) | boolean | true for Send test; data is then an example. |
| `data` | {} | The record as stored (as GET returns it); for deleted, its id, version and deletedAt. |

### WebhookTopic

The kinds of record a webhook can hear about: matches, match reports (results), venues, referees, competitions and match templates.

"match" | "matchRecord" | "venue" | "referee" | "competition" | "matchTemplate"
