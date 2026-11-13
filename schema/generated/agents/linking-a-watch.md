# Linking a watch

A watch links to an account with a code (RFC 8628): it asks for a code and shows it, someone signed in enters it on the web app's Link page and approves it, and the watch, polling meanwhile, gets its own token. That token only reaches the watch's endpoints (/v1/watch/), and of the account endpoints only sign-out and get-session; anything else answers 403.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

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
| 403 | [AuthError](#autherror) | The account is waiting for approval (ACCOUNT_PENDING), or already has as many watches and phones as its plan allows (DEVICE_LIMIT). |
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
| 200 | [DeviceToken](#devicetoken) | Approved: the watch's token, which only reaches the watch's endpoints. |
| 400 | [OAuthError](#oautherror) | Not yet (authorization_pending), too often (slow_down), refused (access_denied) or expired (expired_token). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

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

### OAuthError

An error from the linking endpoints, as RFC 8628 has them.

| Field | Type | Description |
|---|---|---|
| `error` | string | authorization_pending, slow_down, expired_token, access_denied, invalid_request, invalid_client, invalid_grant or unauthorized. |
| `error_description` (optional) | string |  |

It may have more fields.
