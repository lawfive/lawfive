# Accounts

Signing up, in and out (Better Auth's endpoints). Browsers keep the session in a cookie and must send an Origin header matching the server's address; apps send no Origin, take the token from the set-auth-token response header and send it as Authorization: Bearer <token>.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### POST /v1/auth/sign-up/email

**Make an account.** Signs the new account in. With SIGN_UP=closed only an invitation can make one; with SIGN_UP=approval the account is pending until an admin approves it. An address in ADMIN_EMAILS without an invitation is pending even when sign-up is open. A new server's first account needs the setupCode from its logs. No sign-in needed.

**Body:** { name: [AccountName](#accountname), email: string, password: string, invite?: string }

| Answer | Body | When |
|---|---|---|
| 200 | { token: string \| null, user: [User](#user) } | Made and signed in. The user's status is pending when it waits for approval. Header: `set-auth-token`. |
| 400 | [AuthError](#autherror) | Not allowed: an invalid email, a name that's empty or over 100 characters (INVALID_NAME), a password that's too short or long, sign-up is closed (SIGN_UP_CLOSED), or the invitation isn't valid (INVITE_INVALID) or is for another address (INVITE_EMAIL_MISMATCH). |
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
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's, the account is suspended (ACCOUNT_SUSPENDED), or a phone signing in to an account that already has as many watches and phones as its plan allows (DEVICE_LIMIT). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [AuthError](#autherror) | Too many tries from this address, or too many wrong passwords for this email address (ACCOUNT_LOCKED): after 5 in a row it's locked for a minute, doubling to at most an hour, and even the right password waits. Retry-After says how long; resetting the password ends it. |

### POST /v1/auth/request-password-reset

**Email a password reset link.** When the server can send email (the email capability), emails a link to the web app's page for choosing a new password; it works once, for an hour. The answer is the same whether or not there's an account with the address. Without email, an admin makes a link instead (POST /v1/people/{id}/reset-link). No sign-in needed.

**Body:** { email: string, redirectTo?: string }

| Answer | Body | When |
|---|---|---|
| 200 | { status: true, message: string } | Emailed, if there's an account with the address. |
| 400 | [AuthError](#autherror) | The server can't send email (RESET_PASSWORD_DISABLED), or the address isn't valid. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/reset-password

**Choose a new password.** With the token from a reset link, emailed or made by an admin. Devices already signed in stay signed in. It also ends a lock after too many wrong passwords. No sign-in needed.

**Body:** { newPassword: string, token: string }

| Answer | Body | When |
|---|---|---|
| 200 | { status: true } | Changed; sign in with it. |
| 400 | [AuthError](#autherror) | The link was used, has expired or is mistyped (INVALID_TOKEN), or the password is too short or long. |
| 403 | [AuthError](#autherror) | A browser request whose Origin isn't the server's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/auth/change-password

**Change the password.** Needs the current password.

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

**Change the account's name.** Better Auth's own endpoint, open only to the name: the same rule as signing up, 1 to 100 characters with spaces at either end trimmed. GET /v1/account and get-session give the new name straight away.

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

**The signed-in account.** Its status and whether it's an admin. The one endpoint a pending account can use; every other gets 403. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | The account. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/account/email

**Change the account's email.** With the password, to confirm it's them. An address in the server's ADMIN_EMAILS can't be changed here, and can't be changed to. When the server can send email (the email capability), the new address is emailed a link that changes it when followed, once, within 24 hours, and the old address keeps working until then; asking again replaces the link. Without email, it changes straight away. Not with API keys.

**Body:** [EmailChange](#emailchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | Changed (the server can't send email), or already the account's address. |
| 202 | [Account](#account) | A link was emailed to the new address: pendingEmail says which, and pendingEmailUntil until when. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The address isn't valid, or the password is wrong. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 409 | [ApiError](#apierror) | Another account has the address, or ADMIN_EMAILS lists the old or new one. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/account/email

**Cancel a change of email.** The link emailed to the new address stops working. Nothing to cancel is fine too. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | [Account](#account) | Canceled, or there was nothing waiting. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/account/email/confirm

**Confirm a new email address.** What the web app's /confirm-email/<token> page sends, signed in or not: the account's address becomes the new one, and the old address is told. It doesn't sign anyone in. The link works once, for 24 hours. No sign-in needed.

**Body:** [EmailConfirmation](#emailconfirmation)

| Answer | Body | When |
|---|---|---|
| 200 | { email: string } | Changed. |
| 400 | [ApiError](#apierror) | The link was used, canceled, replaced by a newer one, has expired or is mistyped. |
| 409 | [ApiError](#apierror) | Another account took the address meanwhile, or ADMIN_EMAILS lists the old or new one. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/account/delete

**Delete the account.** With the password, to confirm it's them. Deletes the account and everything in it, signs out every device and stops its API keys and calendar feed. Refused for the only admin while there are other accounts. Not with API keys.

**Body:** { password: string }

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 400 | [ApiError](#apierror) | The password is wrong. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 409 | [ApiError](#apierror) | It's the server's only admin; make someone else an admin first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### Account

The signed-in account, with what it may do.

| Field | Type | Description |
|---|---|---|
| `id` | string |  |
| `name` | string |  |
| `email` | string |  |
| `status` | [AccountStatus](#accountstatus) |  |
| `admin` | boolean | Can invite and approve people. |
| `pendingEmail` (optional) | string | A new address waiting for its owner to follow the link emailed to it; email stays the old one until then. |
| `pendingEmailUntil` (optional) | [Timestamp](data-model.md#timestamp) | When that link stops working. |

### AccountName

An account's name: 1 to 100 characters, spaces at either end trimmed.

string

### AccountStatus

pending: made on a server that approves new accounts, and not approved yet. It can sign in, but only GET /v1/account answers. suspended: an admin suspended it; it can't sign in, and its API keys and calendar feed stop working, but its data is kept.

"active" | "pending" | "suspended"

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### AuthError

An error from the account endpoints.

| Field | Type | Description |
|---|---|---|
| `message` | string |  |
| `code` | string | For example INVALID_EMAIL_OR_PASSWORD or INVALID_ORIGIN. |

It may have more fields.

### EmailChange

| Field | Type | Description |
|---|---|---|
| `email` | string |  |
| `password` | string | The account's password, to confirm it's them. |

### EmailConfirmation

Following the link that confirms a new email address.

| Field | Type | Description |
|---|---|---|
| `token` | string | From the link emailed to the new address: /confirm-email/<token>. |

### NameChange

A new name for the signed-in account; nothing else can be changed this way.

| Field | Type | Description |
|---|---|---|
| `name` | [AccountName](#accountname) |  |

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

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.
