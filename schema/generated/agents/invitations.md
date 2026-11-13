# Invitations

Links that let someone make an account even when sign-up is closed. Admins make and cancel them; the link opens the web app's invitation page, which looks the invitation up and signs up with it.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

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
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

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

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### Invite

An invitation to make an account, even when sign-up is closed. It works once, for 14 days.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `email` (optional) | string | Who it's for; only this address can use it. None for a link anyone can use once. |
| `name` (optional) | string | Their name, to fill in the sign-up form. |
| `link` | string | The link to send: the web app's invitation page. |
| `createdBy` | string | The name of the admin who made it. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `expiresAt` | [Timestamp](data-model.md#timestamp) |  |
| `usedAt` (optional) | [Timestamp](data-model.md#timestamp) |  |
| `usedBy` (optional) | string | The name of the account made with it. |
| `emailedAt` (optional) | [Timestamp](data-model.md#timestamp) | When it was emailed, if it was. |
| `plan` (optional) | [PlanName](#planname) | The plan the account joins; the default (or the sign-up trial) when there's none. |
| `planDays` (optional) | integer | For how many days, then the default plan; none: it doesn't end. |

### InviteLookup

What the invitation page shows before someone signs up with it.

| Field | Type | Description |
|---|---|---|
| `email` (optional) | string | The address it's for; the sign-up form uses it and doesn't let it be changed. |
| `name` (optional) | string |  |
| `invitedBy` | string |  |
| `expiresAt` | [Timestamp](data-model.md#timestamp) |  |

### NewInvite

| Field | Type | Description |
|---|---|---|
| `email` (optional) | string | Who it's for; only this address can use it. |
| `name` (optional) | string | Their name, to fill in the sign-up form. |
| `send` (optional) | boolean | Email it to them (needs email set up on the server, and an email). |
| `plan` (optional) | string | The plan the account joins. |
| `planDays` (optional) | integer | For how many days, then the default plan. |

### PlanName

| Field | Type | Description |
|---|---|---|
| `code` | string | A plan's short handle, unique on the server, to look it up by: free, pro, friends-family. |
| `name` | string |  |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.
