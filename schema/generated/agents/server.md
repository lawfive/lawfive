# Server

What the server is and offers.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /health

**Is the server up.** Answers 503 if the server can't reach its database within 2 seconds, for Docker's healthcheck. Other services, such as weather or email, don't affect it. No sign-in needed.

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

**This server's API, as OpenAPI.** The whole API as OpenAPI 3.1, for this server's version and address, so a client or an AI agent can work from what this server really does. About 340 KB, or much less compressed; https://lawfive.dev/llms.txt lists the same as smaller pages. No sign-in needed.

| Answer | Body | When |
|---|---|---|
| 200 | { openapi: "3.1.0" } | The description. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### ServerMeta

What this server is and offers, so apps can adapt to older or self-hosted servers.

| Field | Type | Description |
|---|---|---|
| `product` | "LawFive" |  |
| `apiUrl` (optional) | string | The address apps should use for the API, which may differ from the one they came through. |
| `apiVersion` | integer | Raised when the API changes in a way older apps can't follow. |
| `openApiUrl` (optional) | string | Where this server describes its own API as OpenAPI; missing on servers from before it. |
| `version` (optional) | string | The server's version: the day of its last change, "2026.10.30" ("2026.10.30.2" for a second change that day), or "dev" when run from a checkout without git. Missing on servers from before it. |
| `commit` (optional) | string | The commit it was built from, "f5de635". |
| `capabilities` | string[] | What this server offers: accounts, records, changes, tracks and stats (missing on servers from before them), devices, link, watch, people, invites, calendar and import, then email, geocode, push, notices (with push, from servers that tell phones what integrations did) and weather when they're switched on; merging, from servers that find duplicates and preview merges for the apps; plans, from servers with plans and the account's time zone; assignor-calendars, from servers that read assignors' calendar links. Ignore names you don't know. |
| `maps` | { style?: { url: string, darkUrl?: string, attribution: string }, tileUrl: string, attribution: string, satellite?: { tileUrl: string, attribution: string } } |  |
| `geocoder` (optional) | { url: string } | The address search service behind GET /v1/geocode, to credit it. |
| `weather` (optional) | { source: string } | Whose weather data GET /v1/weather uses, to credit it. |
| `firstAccount` (optional) | true | Nobody has an account on this server yet: the first one can be made whatever signUp says, with the setup code when setupCodeNeeded, and it's the server's admin. |
| `setupCodeNeeded` (optional) | true | The first account needs the code in the server's logs. |
| `setupPending` (optional) | true | The first account hasn't finished setting the server up. |
| `publicUrl` (optional) | string | The server's own address (PUBLIC_URL), for the website to say if it isn't HTTPS. |
| `signUp` (optional) | [SignUpMode](#signupmode) | Who can make an account; missing on servers from before it, which were open or closed. |

### SignUpMode

Who can make an account: open, anyone; approval, anyone, but an admin approves the account before it can be used; closed, only people with an invitation.

"open" | "approval" | "closed"
