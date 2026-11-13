# Webhooks

URLs that hear about changes to the account's records: matches, match reports, venues, referees, competitions and templates, however they were made (the web app, the API, a watch, an import). Each delivery is a signed JSON POST (WebhookPayload), retried up to five times over about three hours when it doesn't get a 2xx answer. Only a signed-in session can manage them.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/webhooks

**The account's webhooks.** Newest first, each with its latest delivery. Not with API keys.

| Answer | Body | When |
|---|---|---|
| 200 | { webhooks: [Webhook](#webhook)[] } | The webhooks. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/webhooks

**Add a webhook.** As many as the account's plan allows. The answer has the secret deliveries are signed with, which isn't shown again. Not with API keys.

**Body:** [WebhookInput](#webhookinput)

| Answer | Body | When |
|---|---|---|
| 201 | [CreatedWebhook](#createdwebhook) | Added. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the address isn't allowed (a private network, unless the server allows it). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [PlanRefusal](#planrefusal) | An API key, or the account already has as many webhooks as its plan allows. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/webhooks/{id}

**Change a webhook.** Its address, topics, or pausing it (active: false). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [WebhookInput](#webhookinput)

| Answer | Body | When |
|---|---|---|
| 200 | [Webhook](#webhook) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the address isn't allowed. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/webhooks/{id}

**Delete a webhook.** With its deliveries; nothing more is sent. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/webhooks/{id}/deliveries

**A webhook's deliveries.** The latest 50, newest first. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { deliveries: [WebhookDelivery](#webhookdelivery)[] } | The deliveries. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/webhooks/{id}/test

**Send a test.** Sends an example delivery now, once, and says how it went. The example is the account's latest record of the topic, or a made-up one; test is true in it. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** { topic?: [WebhookTopic](#webhooktopic) }

| Answer | Body | When |
|---|---|---|
| 200 | { delivery: [WebhookDelivery](#webhookdelivery), payload: [WebhookPayload](#webhookpayload), durationMs: integer } | Sent (whatever the answer). |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### CreatedWebhook

A new webhook, with the secret its deliveries are signed with.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `url` | string | Where deliveries are POSTed. |
| `topics` | [WebhookTopic](#webhooktopic)[] | Which records' changes it hears about. |
| `active` | boolean | Paused webhooks get no deliveries. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastDelivery` (optional) | { at: [Timestamp](data-model.md#timestamp), status: "pending" \| "delivered" \| "failed", responseCode?: integer } | The latest delivery and how it went. |
| `secret` | string | For checking a delivery's X-LawFive-Signature, shown only this once. |

### PlanRefusal

An ApiError; over a plan's limit, it says which.

| Field | Type | Description |
|---|---|---|
| `error` | string |  |
| `limit` (optional) | "matches" \| "referees" \| "venues" \| "storageMb" \| "photoMb" \| "fileMb" \| "devices" \| "pushPerDay" \| "apiKeys" \| "apiCallsPerMinute" \| "apiCallsPerDay" \| "webhooks" \| "assignorCalendars" \| "addressSearchesPerDay" | The plan's limit that was reached. |
| `allowed` (optional) | integer | What the plan allows of it. |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.

### Webhook

A URL that hears about changes to the account's records.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `url` | string | Where deliveries are POSTed. |
| `topics` | [WebhookTopic](#webhooktopic)[] | Which records' changes it hears about. |
| `active` | boolean | Paused webhooks get no deliveries. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `lastDelivery` (optional) | { at: [Timestamp](data-model.md#timestamp), status: "pending" \| "delivered" \| "failed", responseCode?: integer } | The latest delivery and how it went. |

### WebhookDelivery

One change sent to a webhook, with how it went.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) | Also sent as X-LawFive-Delivery. |
| `event` | string | match.created, matchRecord.updated, venue.deleted… |
| `status` | "pending" \| "delivered" \| "failed" | pending: waiting for its next try; failed: gave up after five tries. |
| `attempts` | integer |  |
| `responseCode` (optional) | integer |  |
| `error` (optional) | string | Why the last try failed, when it didn't get an answer. |
| `test` | boolean | Sent with Send test. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `deliveredAt` (optional) | [Timestamp](data-model.md#timestamp) |  |

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
| `id` | [Id](data-model.md#id) | The delivery's id; the same on every retry, so a receiver can ignore one it has had. |
| `event` | string | <topic>.<created\|updated\|deleted> |
| `createdAt` | [Timestamp](data-model.md#timestamp) | When the change was made. |
| `test` (optional) | boolean | true for Send test; data is then an example. |
| `data` | {} | The record as stored (as GET returns it); for deleted, its id, version and deletedAt. |

### WebhookTopic

The kinds of record a webhook can hear about: matches, match reports (results), venues, referees, competitions and match templates.

"match" | "matchRecord" | "venue" | "referee" | "competition" | "matchTemplate"
