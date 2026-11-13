# Quiz

The Laws of the Game quiz's questions.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/quiz

**The quiz's questions.** Every active question in a language, with the Laws and protocols they refer to, for the app to pick from. The phone apps keep the last copy, for no signal. Only when `GET /v1/meta` lists `quiz`. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `language` (optional) | query | string | A two-letter language code; en by default. |

| Answer | Body | When |
|---|---|---|
| 200 | [QuizBank](data-model.md#quizbank) | The questions. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | There are no questions in that language. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |
