# Attachments

Photos on matches, venues and referees, and files on matches, venues and competitions: PDF, spreadsheets (XLSX, CSV), Word documents (DOCX), plain text and photos, kept by the server on its disk or in S3-compatible storage. Upload the file as multipart/form-data. Photos are best made smaller first (the web app sends at most 2000 pixels on the longest side, as a JPEG without its location and camera details) with a thumbnail; files are kept exactly as sent. The server works out what a file is from its contents, never its name, and refuses anything else (HTML, SVG, XML, scripts, archives, programs, older Office formats, and spreadsheets or documents with macros). Every file but a photo is served as a download, never shown in place. They're private: fetch them with the same sign-in, or with an API key that can reach the record: read access to its collection (venues:read for a venue's) to list and fetch, write access to add, change and delete. Deleting the record deletes its attachments.

[The overview](overview.md) covers the address, signing in, API keys and errors.

## Endpoints

### GET /v1/attachments

**Attachments of a kind of record.** In order (by record, then position). With recordId, just that record's; with first, only each record's first photo (a referee's picture). Only photos unless kind says otherwise, as servers had before files. API keys: need read access to the record's collection (matches:read for a match's, venues:read for a venue's, referees:read for a referee's, competitions:read for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `recordType` | query | [AttachmentRecordType](#attachmentrecordtype) | The kinds of record that can have attachments: photos on matches, venues and referees; files on matches, venues and competitions. |
| `recordId` (optional) | query | [Id](data-model.md#id) |  |
| `kind` (optional) | query | "photo" \| "file" \| "all" | photo (when left out), file, or all of them. |
| `first` (optional) | query | "true" | Only each record's first photo. |

| Answer | Body | When |
|---|---|---|
| 200 | { attachments: [Attachment](#attachment)[] } | The attachments. |
| 400 | [ApiError](#apierror) | recordType, recordId or kind isn't valid. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without read access to the record's collection; or the account is waiting for approval. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### POST /v1/attachments

**Upload an attachment.** Added after the record's other photos, or its other files. At most 30 photos and 20 files on a record. A competition has files, not photos; a referee photos, not files. A file's name is cleaned (no folders, control or direction characters, at most 120 characters) and ends in what it really is. API keys: need write access to the record's collection (matches:write for a match's, venues:write for a venue's, referees:write for a referee's, competitions:write for a competition's).

**Body:** multipart/form-data: the fields of [AttachmentUpload](#attachmentupload), and the files `file` (required: a photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb); or a file, a PDF, XLSX, CSV, DOCX, TXT, JPEG, PNG or WebP of at most 20 MB (or the plan's attachmentMb). CSV and TXT are text in UTF-8 or Windows-1252, told apart by the name's ending), `thumb` (optional: a small version, an image of at most 1 MB, for lists and galleries (a PDF's first page, say))

| Answer | Body | When |
|---|---|---|
| 201 | [Attachment](#attachment) | Uploaded. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when it doesn't fit the account's room. A field isn't valid, the file is missing, too big or of a kind that isn't taken (the message says which, and what is), the kind doesn't suit the record, or the record has as many as it can. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without write access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | No such record: save it first. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}

**Change an attachment.** Its caption, a file's name (keeping its ending), or its place among the record's photos or files (moving a referee's photo to 0 makes it their picture). API keys: need write access to the record's collection (matches:write for a match's, venues:write for a venue's, referees:write for a referee's, competitions:write for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** [AttachmentChange](#attachmentchange)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Changed. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | The body doesn't match, or the new name is empty once cleaned. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without write access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### PUT /v1/attachments/{id}/file

**Replace an attachment's file.** A photo cropped or turned by the app, in place of the old one, or a new version of a file: it keeps its id, place, caption and name (with the new file's ending), and the old files are deleted. Its url and thumbUrl change, so a kept copy of the old one isn't shown. API keys: need write access to the record's collection (matches:write for a match's, venues:write for a venue's, referees:write for a referee's, competitions:write for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

**Body:** multipart/form-data: the fields of { width?: string, height?: string }, and the files `file` (required: for a photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb); for a file, anything an upload takes), `thumb` (optional: a small version, an image of at most 1 MB)

| Answer | Body | When |
|---|---|---|
| 200 | [Attachment](#attachment) | Replaced. |
| 400 | { error: string, issues?: [ValidationIssue](#validationissue)[] } | With storage ({ usedBytes, limitBytes }) when a bigger file doesn't fit the account's room. The file is missing, too big or of a kind that isn't taken. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without write access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### DELETE /v1/attachments/{id}

**Delete an attachment.** With its files, for good. API keys: need write access to the record's collection (matches:write for a match's, venues:write for a venue's, referees:write for a referee's, competitions:write for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |

| Answer | Body | When |
|---|---|---|
| 200 | { ok: true } | Deleted. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without write access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/attachments/{id}/file

**An attachment's file.** As uploaded, with its checked type, X-Content-Type-Options: nosniff and a sandboxing Content-Security-Policy. Every file but a photo is a download (Content-Disposition: attachment, with its name in ASCII and as filename* in UTF-8), never shown in place; a photo is shown in place, or a download with download=1. A file at an address never changes, so it can be kept (Cache-Control: private, immutable); replacing it gives the attachment new addresses, with ?v=. API keys: need read access to the record's collection (matches:read for a match's, venues:read for a venue's, referees:read for a referee's, competitions:read for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |
| `download` (optional) | query | "1" | A photo as a download too, for a website at another address than the API, where browsers ignore a link's download attribute. |
| `v` (optional) | query | string | The version in a replaced file's address; ignored. |

| Answer | Body | When |
|---|---|---|
| 200 | The file, as its own type | The file. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without read access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, or not this user's. |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

### GET /v1/attachments/{id}/thumb

**An attachment's thumbnail.** The small version, always an image; for a photo with none, the photo itself. API keys: need read access to the record's collection (matches:read for a match's, venues:read for a venue's, referees:read for a referee's, competitions:read for a competition's).

| Parameter | In | Type | Description |
|---|---|---|---|
| `id` | path | [Id](data-model.md#id) | UUID made by the device that created the record. |
| `v` (optional) | query | string | The version in a replaced file's address; ignored. |

| Answer | Body | When |
|---|---|---|
| 200 | An image | The image. |
| 401 | [ApiError](#apierror) | Not signed in, the session has ended, or the API key is unknown or has expired. |
| 403 | [ApiError](#apierror) | An API key without read access to the record's collection; or the account is waiting for approval. |
| 404 | [ApiError](#apierror) | Not found, not this user's, or a file other than a photo added without a thumbnail (hasThumb is false). |
| 413 | [ApiError](#apierror) | The request is too big. |
| 429 | [ApiError](#apierror) | Too many tries from this address; the Retry-After header says how many seconds to wait. |

## Types

### ApiError

Every LawFive error (outside /v1/auth) has this shape; some add fields.

| Field | Type | Description |
|---|---|---|
| `error` | string | What went wrong, in words a person can read. |

### Attachment

A photo on a match, venue or referee, or a file on a match, venue or competition. They're private: fetching them needs the same sign-in as the rest of the API, or an API key that can read the record.

| Field | Type | Description |
|---|---|---|
| `id` | [Id](data-model.md#id) |  |
| `recordType` | [AttachmentRecordType](#attachmentrecordtype) |  |
| `recordId` | [Id](data-model.md#id) | The match, venue, referee or competition it's on. |
| `kind` (optional) | [AttachmentKind](#attachmentkind) | Servers from before files leave it out: everything they have is a photo. |
| `contentType` | [AttachmentContentType](#attachmentcontenttype) |  |
| `name` (optional) | string | A file's name, ending in what it really is (.pdf, .xlsx…), and the name it's downloaded with. Photos have none. |
| `size` | integer | The file's size in bytes. |
| `width` (optional) | integer | Its width in pixels, when the upload gave it. |
| `height` (optional) | integer |  |
| `caption` (optional) | string |  |
| `position` | integer | Its place among the record's photos, or among its files, from 0. A referee's first photo is their picture. |
| `createdAt` | [Timestamp](data-model.md#timestamp) |  |
| `url` | string | Where to fetch the file: /v1/attachments/{id}/file, with the same sign-in or an API key that can read the record. |
| `thumbUrl` | string | A small version for lists and galleries: /v1/attachments/{id}/thumb (a photo itself when none was uploaded). |
| `hasThumb` (optional) | boolean | Whether thumbUrl gives an image: false for a file other than a photo that was added without a thumbnail, which shows its kind's icon instead. Servers from before files leave it out, as every attachment then has one. |

### AttachmentChange

What to change about an attachment; leave out what stays the same.

| Field | Type | Description |
|---|---|---|
| `caption` (optional) | string \| null | The new caption; null or an empty string removes it. |
| `name` (optional) | string | A file's new name: cleaned as an upload's is, and keeping its ending. |
| `position` (optional) | integer | Move it to this place among the record's photos, or its files (0 is first; a larger number moves it to the end). |

### AttachmentContentType

What a file is, worked out from its contents, never its name: a JPEG, PNG or WebP photo, a PDF, an Excel spreadsheet (.xlsx) or CSV, a Word document (.docx), or plain text. Photos are always JPEG, PNG or WebP.

"image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "text/csv" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/plain"

### AttachmentKind

A photo, in its record's photo grid, or a file, in its Files list: a document, or a photo kept as a file.

"photo" | "file"

### AttachmentRecordType

The kinds of record that can have attachments: photos on matches, venues and referees; files on matches, venues and competitions.

"match" | "venue" | "referee" | "competition"

### AttachmentUpload

The form fields of an upload (multipart/form-data), beside the files: file (a photo, a JPEG, PNG or WebP of at most 10 MB; or a file, a PDF, XLSX, CSV, DOCX, TXT or photo of at most 20 MB) and, optionally, thumb (a small version, an image of at most 1 MB).

| Field | Type | Description |
|---|---|---|
| `recordType` | [AttachmentRecordType](#attachmentrecordtype) |  |
| `recordId` | [Id](data-model.md#id) |  |
| `kind` (optional) | [AttachmentKind](#attachmentkind) | photo or file. Left out: a photo when it's a JPEG, PNG or WebP on a match, venue or referee; otherwise a file. |
| `name` (optional) | string | A file's name; the file part's own name when left out. It's cleaned, and its ending set to what the file is. |
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
