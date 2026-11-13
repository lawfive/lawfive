# Weather

Forecasts for the user's matches, and the weather finished matches were played in. The server fetches and keeps forecasts; apps never call the weather service themselves.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/weather

**Weather for matches in a window.** For the user's matches kicking off between from and to that have a place on the map and a forecast (up to 16 days ahead) or kept weather (once played). Only when `GET /v1/meta` lists `weather`. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `from` (optional) | query | string | ISO 8601 time; 30 days ago by default. |
| `to` (optional) | query | string | ISO 8601 time; 17 days from now by default. At most 400 days after from. |

| Answer | Body | When |
|---|---|---|
| 200 | { items: [MatchWeather](data-model.md#matchweather)[] } | The weather, one per match that has any. |
| 400 | [ApiError](#apierror) | from or to isn't a time, or they're the wrong way round or too far apart. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/weather/{matchId}

**One match's weather.** Only when `GET /v1/meta` lists `weather`. API keys: need `matches:read`.

| Parameter | In | Type | Description |
|---|---|---|---|
| `matchId` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | [MatchWeather](data-model.md#matchweather) | The weather. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without matches:read; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No weather for this match: not found, no place on the map, or too far ahead. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |
