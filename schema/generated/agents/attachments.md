# Attachments

Photos on matches, venues and referees, kept by the server on its disk or in S3-compatible storage. Upload the file as multipart/form-data, ideally already made smaller (the web app sends at most 2000 pixels on the longest side, as a JPEG without its location and camera details) with a thumbnail; the server keeps what it's sent. The files are private: fetch them with the same sign-in. Deleting the record deletes its attachments. Only a signed-in session can use them for now.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/attachments

**Attachments of a kind of record.** In order (by record, then position). With recordId, just that record's; with first, only each record's first (a referee's picture). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `recordType` | query | [AttachmentRecordType](#attachmentrecordtype) | The kinds of record that can have attachments. |
| `recordId` (optional) | query | [Id](data-model.md#id) |  |
| `first` (optional) | query | "true" | Only each record's first attachment. |

| Answer | Body | When |
|---|---|---|
| 200 | { attachments: [Attachment](#attachment)[] } | The attachments. |
| 400 | [ApiError](#apierror) | recordType or recordId isn't valid. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/attachments

**Upload an attachment.** Added after the record's others. At most 30 on a record. Not with API keys.

**Body:** multipart/form-data: the fields of [AttachmentUpload](#attachmentupload), and the files `file` (required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)), `thumb` (optional: a small version, at most 1 MB, for lists and galleries)

| Answer | Body | When |
|---|---|---|
| 201 | [Attachment](#attachment) | Uploaded. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when it doesn't fit the account's room. A field isn't valid, the file is missing, too big or not a JPEG, PNG or WebP, or the record has 30 already. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such record: save it first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}

**Change an attachment.** Its caption, or its place among the record's attachments (moving a referee's photo to 0 makes it their picture). Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [AttachmentChange](#attachmentchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}/file

**Replace an attachment's file.** A photo cropped or turned by the app, in place of the old one: it keeps its id, place and caption, and the old files are deleted. Its url and thumbUrl change, so a kept copy of the old one isn't shown. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** multipart/form-data: the fields of { width?: string, height?: string }, and the files `file` (required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)), `thumb` (optional: a small version, at most 1 MB)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Replaced. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when a bigger file doesn't fit the account's room. The file is missing, too big or not a JPEG, PNG or WebP. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/attachments/{id}

**Delete an attachment.** With its files, for good. Not with API keys.

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

### GET /v1/attachments/{id}/file

**An attachment's file.** As uploaded. A file at an address never changes, so it can be kept (Cache-Control: private, immutable); replacing it gives the attachment new addresses, with ?v=. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | An image | The image. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key: this needs signing in; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/attachments/{id}/thumb

**An attachment's thumbnail.** The small version, or the file itself when none was uploaded. Not with API keys.

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | An image | The image. |
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

### Attachment

A photo on a match, venue or referee. The files are private: fetching them needs the same sign-in as the rest of the API.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `recordType` | [AttachmentRecordType](#attachmentrecordtype) |  |
| `recordId` | [Id](data-model.md#id) | The match, venue or referee it's on. |
| `contentType` | "image/jpeg" \| "image/png" \| "image/webp" | What the file is, worked out from its contents. |
| `size` | integer | The file's size in bytes. |
| `width` (optional) | integer | Its width in pixels, when the upload gave it. |
| `height` (optional) | integer |  |
| `caption` (optional) | string |  |
| `position` | integer | Its place among the record's attachments, from 0. A referee's first photo is their picture. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
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
| `recordId` | [Id](data-model.md#id) |  |
| `caption` (optional) | string |  |
| `width` (optional) | integer | The image's width in pixels. |
| `height` (optional) | integer |  |

### ValidationIssue

One problem with a request body, as Zod reports it.

| Field | Type | Description |
|---|---|---|
| `code` | string |  |
| `path` | (string \| number)[] | Where in the body, for example ["home", "colour"]. |
| `message` | string |  |

It may have more fields.
