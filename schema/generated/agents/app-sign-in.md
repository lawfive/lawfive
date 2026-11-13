# App sign-in

Signing in on a phone with a code the web app shows, as a QR code or in letters, instead of typing a password.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### POST /v1/app-sign-in

**A code to sign a phone in.** It works once, for two minutes. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 201 | [AppSignIn](#appsignin) | Made. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/app-sign-in/{id}

**Whether a phone has used a code.** So the web app can say when the phone is signed in. Expired codes go when a new one is made, and then this answers 404. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [AppSignInStatus](#appsigninstatus) | How it stands. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
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
| 403 | [PlanRefusal](#planrefusal) | The account is suspended, or already has as many watches and phones as its plan allows. |
| 404 | [ApiError](#apierror) | No such code. |
| 410 | [ApiError](#apierror) | It was used, or it has expired. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### AccountStatus

pending: made on a server that approves new accounts, and not approved yet. It can sign in, but only GET /v1/account answers. suspended: an admin suspended it; it can't sign in, and its API keys and calendar feed stop working, but its data is kept.

"active" | "pending" | "suspended"

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### AppSignIn

A code that signs a phone in to this account. It works once, for two minutes.

| Field | Type | Description |
|---|---|---|
| `id` | string | For GET /v1/app-sign-in/{id}. |
| `code` | string | Eight letters and digits. |
| `link` | string | What the QR code holds: the web app's Get the app page with the code in its fragment, which a phone's camera can open. |
| `appLink` | string | The same as a lawfive:// link, which opens the app. |
| `server` | string | The address to sign in at, for someone typing the code. |
| `expiresAt` | [Timestamp](data-model.md#timestamp) |  |

### AppSignInCheck

Whose the code is, so the phone can ask before signing in.

| Field | Type | Description |
|---|---|---|
| `name` | string |  |
| `email` | string |  |
| `expiresAt` | [Timestamp](data-model.md#timestamp) |  |

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

### PlanRefusal

An ApiError; over a plan's limit, it says which.

| Field | Type | Description |
|---|---|---|
| `error` | string |  |
| `limit` (optional) | "matches" \| "referees" \| "venues" \| "storageMb" \| "photoMb" \| "fileMb" \| "devices" \| "pushPerDay" \| "apiKeys" \| "apiCallsPerMinute" \| "apiCallsPerDay" \| "webhooks" \| "assignorCalendars" \| "addressSearchesPerDay" | The plan's limit that was reached. |
| `allowed` (optional) | integer | What the plan allows of it. |
