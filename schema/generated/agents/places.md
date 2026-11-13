# Places

Address search for placing venues on the map.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/geocode

**Find an address.** Through Nominatim (OpenStreetMap) by default, at most one lookup a second for the whole server, with answers cached. Every search counts against the account's plan's address searches a day, cached or not. Only when `GET /v1/meta` lists `geocode`. API keys: need `venues:write`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `q` | query | string | The address. |

| Answer | Body | When |
|---|---|---|
| 200 | { results: [Place](#place)[] } | Up to five places. |
| 400 | [ApiError](#apierror) | q is shorter than 3 or longer than 200 characters. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without venues:write; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Address search is off on this server (an admin can switch it on). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | The account's plan allows no more address searches today, or two of its searches are already waiting; Retry-After says how many seconds to wait. |
| 502 | [ApiError](#apierror) | The address search service didn't answer. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### Place

A place found by address search.

| Field | Type | Description |
|---|---|---|
| `name` | string | The full address. |
| `lat` | number |  |
| `lon` | number |  |
