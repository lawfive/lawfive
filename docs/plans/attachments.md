# Plan: files on venues, competitions and more

**Status:** Being built. Agreed: its requirements are in [photos.md](../requirements/photos.md) (FILE-6, FILE-9 to FILE-15) and the agreed ones it changes. Built: step 1, the schema and the server; step 2, the website; and step 3, the phones (Android and the iPhone), checked in their snapshots and unit tests, not yet on real phones. Step 4, docs and policy: lawfive.app's pages, lawfive.dev's (storage, backups, plans) and an API guide for downloading a record's files are written; the privacy policy's line for files is drafted and waits for sign-off. The privacy manifests and the stores' answers need no change: photos and other user content are already declared, and keeping files uses no API that needs a reason.

## In short

A venue gets its **parking map** and **field layout**; a competition its **rules**, **schedule** and **forms**; a match its **team sheets** or the league's **match card**. Each record has a **Files** list under its photos (a competition, which has no photos, has Files alone), with the file's name, kind, size and a preview where one can be made. A competition's files also show on each of its matches. On the phones a file opens in the app (PDFs) or in another app, can be shared, and the files for the next few days' matches are **kept on the phone**, for a ground without signal. Files count against the account's storage like photos, come with **Download everything**, go with their record or the account, and can be reached with an **API key** that can reach their record.

Not in this plan: files on referees or templates, files of the account itself ("my documents"), virus scanning, editing a file in LawFive, files on the watch, and sharing a file through a share link.

## What's already there

- **Attachments** (FILE-1 to FILE-8): photos on matches, venues and referees. Rows in the `attachment` table (`server/src/db/tables.ts`: record type and id, content type, size, width and height, caption, position, file and thumbnail keys); the endpoints in `server/src/attachments.ts` and `schema/src/endpoints.ts` (`GET`, `POST /v1/attachments`, `PUT /v1/attachments/{id}`, `PUT …/file`, `DELETE`, `GET …/file` and `…/thumb`); the schema in `schema/src/api.ts` (`AttachmentRecordType` is `match | venue | referee`, `Attachment.contentType` is the three image types).
- **What the server takes:** only JPEG, PNG and WebP, checked from the first bytes (`imageType`), up to 10 MB or the plan's `photoMb`, 30 a record, with an optional thumbnail of at most 1 MB. The apps shrink photos first (2000 px, a 480 px thumbnail, no location or camera details: `web/src/photos.ts`, Android's `Photos.kt`, the iPhone's `Photos.swift`).
- **How files are served:** with the checked content type, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Cache-Control: private, max-age=31536000, immutable`; a replaced file (FILE-8) gets new addresses with `?v=`. No `Content-Disposition`: the website's Download relies on the link's `download` attribute.
- **Storage** (FILE-4, R-10): a folder (`UPLOADS_DIR`) or an S3-compatible bucket (`S3_URL`), keys `<user id>/<attachment id>` (`server/src/storage.ts`, whose key pattern also allows a version and `.thumb`). Without a writable folder the server starts without attachments, and `GET /v1/meta` leaves out the `attachments` capability.
- **Room** (SEC-6, PLAN-2, FILE-7): `filesUsed` in `server/src/usage.ts` adds up attachments' sizes and tracks against the plan's storage; a refusal carries `storage` with the figures, which the website and both phones show under the grid.
- **Deleting and merging:** a deleted match, venue or referee takes its attachments (an `onRecordWrite` hook); deleting the account deletes every file (`deleteAccountFiles`); merging moves them to the kept record (`moveAttachments`, DUP-3).
- **Export and restore** (DATA-2, DATA-4): `server/src/backup.ts` writes `attachments.json` and the files in `attachments/`, named by content type (`jpg`, `png`, `webp`), and restores them only when `imageType` accepts them.
- **API keys** (KEY-3): each endpoint names its scope in `schema/src/endpoints.ts` (`keyScope: "venues:read"`); the attachment endpoints have none, so keys can't use them ("Only a signed-in session can use them for now").
- **The phones** load photos when there's signal ("Photos show when there's signal"), through Coil on Android and the system's loading on the iPhone; nothing is kept for offline use on purpose. Android already has a `FileProvider` for the camera's photo.
- **Competitions** have no page of their own: a list with an edit form on the website (`web/src/pages/Competitions.tsx`) and on the phones (`CompetitionsScreen`, `CompetitionEditScreen` in Android's `Library.kt`, and the iPhone's copy).
- **Reading spreadsheets** safely already exists for imports (`server/src/importFile.ts`, `server/src/zipFile.ts`, SEC-3): a zip is checked against what it says it holds before it's opened.

## Proposed behavior

### Which records

| Record | Files | What for |
|---|---|---|
| Venue | Yes, beside its photos | Parking maps, field layouts, the club's rules for the ground |
| Competition | Yes (its only attachments) | Rules, schedules, the league's forms and contact sheets |
| Match | Yes, beside its photos | Team sheets, the league's match card, an incident form to fill in |
| Referee | No | Their documents are their own; their photos stay |
| Template | No | A format, not a place or an event |

A competition's files show on each of its matches too, under the match's own, as **From the competition**, read-only there.

### What a file can be

- **Taken:** PDF; spreadsheets (XLSX, CSV); Word documents (DOCX); plain text (TXT); and the photo types (JPEG, PNG, WebP). A photo added to Files stays a file there (with a thumbnail), not part of the photo grid.
- **Checked from the file itself**, never its name or the type the browser says:
  - PDF: starts with `%PDF-`.
  - XLSX and DOCX: a zip (checked as imports check one, SEC-3) holding `[Content_Types].xml` and `xl/` or `word/`, and no macros (`vbaProject.bin`), so `.xlsm` and `.docm` are refused.
  - CSV and TXT: text in UTF-8 (or the older Windows encoding, as imports read it), with no NUL bytes. Which of the two is the name's ending.
- **Refused:** everything else, by name in the message ("LawFive keeps PDF, spreadsheets, Word documents, text and photos"). In particular HTML, SVG, XML, JavaScript, archives, programs and the older Office formats (`.xls`, `.doc`), which can carry scripts or macros.
- **Size:** up to 20 MB a file (the plan's **largest file**, PLAN-2), 20 files a record, beside the 30 photos. Files are kept as they're sent: the apps don't change a PDF or a spreadsheet.

### Names

A file keeps the **name it was added with**, cleaned: no folders, no control or direction-changing characters (so `invoice‮fdp.exe` can't pass for a PDF), at most 120 characters, and its ending set to match what it really is. It can be renamed (the caption's place in the viewer), and a renamed file keeps its ending.

### Serving it safely

- **Every file but a photo is a download:** `Content-Disposition: attachment` with the name (ASCII, and `filename*` in UTF-8), the checked content type, `nosniff`, and the same sandboxing policy. Nothing a user adds is ever shown as a page at the server's address.
- **Photos** stay shown in place, as today; with `?download=1` they're a download too, so the website's Download works when the website and the API are at different addresses (where browsers ignore the link's `download` attribute).
- **Thumbnails** are always images, made by the app (as today).
- **Private, as photos are** (FILE-3): only to the owner's signed-in apps and, newly, their API keys; never in a share link (SEC-10) or the calendar feed.

### Previews

- **Photos and PDFs** get a thumbnail made by the app that adds them: the first page, on the phones, by the system's own renderer (Android's `PdfRenderer`, the iPhone's PDFKit). A PDF added on the website has no thumbnail and shows its icon, to keep the website free of a PDF library.
- **Everything else** shows a Phosphor icon for its kind (`FilePdf`, `FileXls`, `FileCsv`, `FileDoc`, `FileText`), with its name, kind and size ("Field map · PDF · 1.2 MB").
- **CSV and text** can be looked at on the website and the phones: the first 200 lines as text in JetBrains Mono, never as HTML.

### On the website

A **Files** card under Photos on the match and venue pages, and on a new **competition page** (its details, its matches, its files). The card lists the files with **Add files** (several at once, or dropped on the card), each uploading at once, faded until it's in; each row has **Download**, **Rename** and **Delete** (confirmed). Refusals (too big, a kind not taken, no room) are said once under the list, as FILE-7 says for photos.

### On the phones

The same Files card, from the phone's files (and the camera for a photo).

- **Opening:** a PDF opens in the app, page by page, with zoom (`PdfRenderer` on Android, PDFKit on the iPhone); other kinds open on the iPhone in Quick Look and on Android with **Open with** (an app that can show it, through the `FileProvider`). **Share** sends the file to another app.
- **Kept on the phone:** the files of the venue, the competition and the match itself, for every match in the **next 3 days**, are fetched when the phone has signal and kept until the match is over, so a parking map opens at a ground without signal. **Keep on this phone** on any file keeps it until turned off. Kept files stay in the app's own storage (left out of backups) and are removed on signing out, in at most 200 MB, the oldest match's first. Settings shows how much is kept, with **Remove kept files**.
- **Without signal**, a file that isn't kept says "Opens when there's signal."

### API keys and webhooks

- **Keys reach a file through its record:** listing and fetching need the record's read access (`venues:read` for a venue's files), adding, renaming and deleting its write access. The endpoint description names the scope per record type, so KEY-3's rule (a new endpoint is closed to keys until it names a scope) holds.
- **Webhooks:** `attachment.created`, `attachment.updated` (renamed, moved, replaced) and `attachment.deleted`, to the webhooks with the record's topic (venues, matches, competitions), with the attachment as the API gives it, its address, and no file. The receiver fetches it with a key.

### Storage, plans, export and deletion

- **Room:** files count as photos do (SEC-6); the plan's storage becomes "photos, files and tracks". A new **largest file** limit (PLAN-2) sits beside largest photo. Thumbnails count too (they don't today).
- **Download everything** puts files in `attachments/` with their real endings and names in `attachments.json`; **Restore** checks each as an upload is checked, and skips what isn't taken, listing it under problems.
- **Deleting** a competition takes its files, as a match, venue or referee does; merging venues or matches moves them (DUP-3).
- **Self-hosted:** the same store (`UPLOADS_DIR` or `S3_URL`), the same switch: without it, there are neither photos nor files. Nothing new to set.

## The work, in order

1. **Schema and server:** `AttachmentRecordType` with `competition`; `contentType` with the document types and a `name` on attachments (a migration, `pnpm db:generate`); the type checks beside `imageType`, including the zip check from `zipFile.ts`; the per-record counts for photos and files; `Content-Disposition` and `?download=1`; the largest file limit in plans; thumbnails counted in `filesUsed`; competitions' deletes in the hook; scopes for keys by record type (the endpoint descriptions and the access check); the webhook events; export names and restore checks in `backup.ts`; tests for each type, each refusal, a disguised file (HTML named `.pdf`, an `.xlsm` named `.xlsx`), a name with direction characters, and keys with and without the record's access. About 1½ days.
2. **Website:** the Files card (match, venue), the new competition page with it, From the competition on matches, the text preview, the refusals; `pnpm screenshots` light and dark, desktop and phone. About 1½ days.
3. **Android and iPhone:** the Files card, adding from the phone's files, the PDF thumbnail and viewer, Quick Look and Open with, Share, the kept files and their Settings row; a competition page on both; the snapshot screens (both phones' `ScreenSnapshots`, with fixtures from `pnpm fixtures`). About 2 days.
4. **Docs and policy:** `privacy.html` ("Photos and files you add to matches, venues and competitions"), both `PrivacyInfo.xcprivacy` files and the stores' answers if the categories change (they likely don't: other user content is declared), lawfive.app's pages that mention photos, lawfive.dev (the API guide for attachments with keys, the self-hosting page's storage section), and CONTRIBUTING.md's table (a row for files: the server's checks and serving, `web/src/components/Files.tsx`, the phones' `Files.kt` and `Files.swift`, and the kept files).

About 5 to 6 days across the parts, most of it in the phones' viewing and keeping.

## Checks

- Real league files: a scanned PDF rule book, an exported schedule in XLSX and CSV, a DOCX form, opened from each app.
- A file with a disguised type, a macro-enabled spreadsheet, and an HTML or SVG file renamed, all refused, on the website and the API.
- A parking map opened on each phone in airplane mode the day before a match, and gone after it.
- Download from the website with the website and the API at different addresses (the hosted service) and at one (a self-hosted server).
- A key with venues read only: lists and fetches a venue's files, and can't add one or reach a match's.
- Download everything and Restore with files on another server.
