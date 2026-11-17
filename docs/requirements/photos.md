# Photos and files (FILE)

Photos on the records they're of, and files (documents a league sends, a ground's parking map) on the matches, venues and competitions they're for, kept by the server, on the website and the phone apps. Both are attachments: the same rows, file store, room and privacy.

## Photos

- **FILE-1** Matches, venues and referees have **Photos**: on the match page under the crew, and on saved venues' and referees' pages. A grid of thumbnails ends in **Add photos** (several at once, or dropped on the card), each uploading at once, faded until it's in. A photo opens large, with arrows to the others, an optional **caption**, **Move to first**, **Download** and **Delete** (confirmed). Up to 30 a record, beside its files (FILE-6).
- **FILE-5** **A referee's first photo is their picture**, in place of their initials wherever they appear (the referees list, the match's crew, the referee popover, merging). **Make their picture** on another photo moves it first.
- **FILE-8** **Crop** in the photo viewer, on the website and both phones, shows the whole photo with a frame to drag and corners to pull, darker outside it, with **Turn** (a quarter turn clockwise) and **Reset**. On a referee's first photo, a faint circle shows their round picture (FILE-5).
  - Saving makes the cropped photo and its thumbnail in the app, as an upload does (FILE-2), and replaces the original (`PUT /v1/attachments/{id}/file`), keeping its place and caption. The old files are deleted, so it can't be uncropped.
  - Its addresses change, so no kept copy of the old one shows. A bigger file counts against the account's room (FILE-7).
- **FILE-7** **When a photo or file can't be added**, it's said once, under the grid or the list, not on a tile: "This photo didn't fit" (or how many), how much of the limit is used, and what to do.
  - The website offers **Try again**, and shows other refusals (too big, a kind that isn't taken) the same way.
  - An admin also gets **Change the limit**; others are told to ask an admin.
  - Once one doesn't fit, only photos small enough for the room left are sent.
  - From 80% used, the card says how much ("5.9 MB of 6 MB used"); with no room, the Add photos tile reads **Storage full**, and a tap says why.
  - The server's refusal carries `storage` with the figures.

## Files

- **FILE-6** **Files** on matches, venues and competitions: a **Files** card under Photos on the match and venue pages, and on the competition's page, which has Files alone.
  - Each file shows its icon or thumbnail (FILE-12), its name, kind and size ("Field map · PDF · 1.2 MB"), with **Download**, **Rename** and **Delete** (confirmed).
  - **Add files** takes several at once, or files dropped on the card; each uploads at once, faded until it's in. A photo added here stays a file, with a thumbnail, and isn't part of the photo grid.
  - A competition's files also show on each of its matches, under the match's own, as **From the competition**, read-only there.
  - Up to 20 a record, beside its 30 photos. Referees have photos only, and templates neither.
- **FILE-9** **What a file can be:** PDF, Excel spreadsheets (XLSX), CSV, Word documents (DOCX), plain text (TXT) and photos (JPEG, PNG, WebP), up to 20 MB or the plan's largest file (PLAN-2). Files are kept exactly as they're sent.
  - The server works out what a file is from the file itself, never its name or the type the sender gives: a PDF starts with `%PDF-`; an XLSX or DOCX is a zip (checked against what it says it holds before it's opened, SEC-3) holding an Excel workbook or a Word document; CSV and TXT are text in UTF-8 or the older Windows encoding, with no NUL or other control characters, told apart by the name's ending.
  - Everything else is refused, saying what it is and what's taken ("Older Office files (.xls, .doc) aren't taken, as they can carry macros: save it as .xlsx or .docx. LawFive keeps PDF, spreadsheets (XLSX, CSV), Word documents (DOCX), text (TXT) and photos (JPEG, PNG, WebP)."). That includes spreadsheets and documents with macros (`.xlsm`, `.docm`), the older Office formats, PowerPoint and other Office files, web pages, SVG and XML (even renamed as text), scripts, archives, programs, GIF and HEIC.
  - A file whose name says it's one kind but is another, such as a web page named `.pdf`, is refused, saying so.
- **FILE-10** **A file's name** is the one it was added with, cleaned: no folders, no control characters and none of the invisible ones that change direction or hide (so `invoice‮fdp.exe` can't pass for a PDF), at most 120 characters, and its ending set to what the file really is (`Schedule.CSV` is kept as `Schedule.csv`; a PDF named `Card.docx` as `Card.pdf`). Renaming cleans the new name the same way, and the file keeps its ending. A name with nothing left is "File".
- **FILE-11** **Every file but a photo is downloaded, never shown in place:** it's sent as an attachment with its name (in plain letters, and in full in UTF-8), its checked type, `nosniff` and a sandboxing policy, so nothing a person adds runs as a page at the server's address. Photos are shown in place, and are a download too with `?download=1`, for a website at another address than the API.
- **FILE-12** **Previews:** photos, and PDFs added on the phones, have a thumbnail made by the app that adds them (a PDF's first page); other files show their kind's icon. CSV and text files can be looked at in the apps: the first 200 lines, as text in the monospaced font, never as a page.
- **FILE-13** **On the phones**, a PDF opens in the app, page by page, with zoom; other files open on the iPhone in Quick Look and on Android with **Open with**; **Share** sends any file to another app.
  - The files of the next 3 days' matches (their own, their venue's and their competition's) are kept on the phone, fetched when there's signal and kept until the match is over, so a parking map opens at a ground without signal. **Keep on this phone** keeps any file until it's turned off.
  - Kept files stay in the app's own storage, left out of the phone's backups, in at most 200 MB (the oldest match's go first), and are removed on signing out. Settings shows how much is kept, with **Remove kept files**.
  - Without signal, a file that isn't kept says "Opens when there's signal."

## Storage and privacy

- **FILE-2** The apps make a photo smaller before uploading it, and the server stores it as given: at most 2000 pixels on its longest side, turned upright, as a JPEG, with a 480-pixel thumbnail, and without where it was taken or the camera's details. For photos, the server takes only JPEG, PNG and WebP (checked from the file itself, not its name), up to 10 MB or the plan's largest photo. Files are FILE-9.
- **FILE-3** Photos and files are private: the server sends them only to their owner's signed-in apps and to API keys that can reach their record (FILE-14), never at a public address, in a share link (SEC-10) or in the calendar feed. Deleting a photo or file, its record or the account deletes the files. Merging referees or venues (DUP-3) keeps everyone's photos and files, the kept one's first. There's no virus scanning: a file goes back only to the account that added it, and is always downloaded (FILE-11).
- **FILE-4** The server keeps the files in a folder (`UPLOADS_DIR`, a Docker volume in compose.yaml) by default, or in an S3-compatible bucket with `S3_URL` (AWS S3, Cloudflare R2, Backblaze B2, MinIO). If the folder can't be written to, the server starts without photos or files and says so in its log. Files need nothing more to set up than photos do.
- **FILE-14** **API keys** reach photos and files with the access of the record they're on: read access to its collection (`venues:read` for a venue's) to list and fetch them, write access to add, rename, move, replace and delete them (KEY-3).
- **FILE-15** **Webhooks** on a record's topic (HOOK-2) get `attachment.created`, `attachment.updated` (renamed, moved, replaced, or moved to another record by a merge) and `attachment.deleted` (on its own, or with its record) for its photos and files, with the attachment as the API gives it and its address, but not the file, which the receiver fetches with a key.

## Status

Photos (FILE-1 to FILE-5, FILE-7, FILE-8) are built in the server, the website and both phone apps. Files are built in the server and the API (FILE-9 to FILE-11, thumbnails kept and counted, API keys FILE-14, webhooks FILE-15) and on the website: the Files card on match, venue and competition pages, From the competition on matches, the text preview, and refusals said under the list (FILE-6, FILE-7, FILE-12).

Not built yet: files in the phone apps (FILE-6, FILE-7 and FILE-12 for files, and FILE-13).
