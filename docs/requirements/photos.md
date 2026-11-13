# Photos and files (FILE)

Photos on the records they're of, kept by the server, on the website and the phone apps. They're built as general attachments, so other kinds of file can follow.

## Adding and viewing

- **FILE-1** Matches, venues and referees have **Photos**: on the match page under the crew, and on saved venues' and referees' pages. A grid of thumbnails ends in **Add photos** (several at once, or dropped on the card), each uploading at once, faded until it's in. A photo opens large, with arrows to the others, an optional **caption**, **Move to first**, **Download** and **Delete** (confirmed). Up to 30 a record.
- **FILE-5** **A referee's first photo is their picture**, in place of their initials wherever they appear (the referees list, the match's crew, the referee popover, merging). **Make their picture** on another photo moves it first.
- **FILE-8** **Crop** in the photo viewer, on the website and both phones, shows the whole photo with a frame to drag and corners to pull, darker outside it, with **Turn** (a quarter turn clockwise) and **Reset**. On a referee's first photo, a faint circle shows their round picture (FILE-5).
  - Saving makes the cropped photo and its thumbnail in the app, as an upload does (FILE-2), and replaces the original (`PUT /v1/attachments/{id}/file`), keeping its place and caption. The old files are deleted, so it can't be uncropped.
  - Its addresses change, so no kept copy of the old one shows. A bigger file counts against the account's room (FILE-7).
- **FILE-7** **When a photo can't be added**, it's said once, under the grid, not on a tile: "This photo didn't fit" (or how many), how much of the limit is used, and what to do.
  - The website offers **Try again**, and shows other refusals (too big, not a photo) the same way.
  - An admin also gets **Change the limit**; others are told to ask an admin.
  - Once one doesn't fit, only photos small enough for the room left are sent.
  - From 80% used, the card says how much ("5.9 MB of 6 MB used"); with no room, the Add photos tile reads **Storage full**, and a tap says why.
  - The server's refusal carries `storage` with the figures.

## Storage and privacy

- **FILE-2** The apps make a photo smaller before uploading it, and the server stores it as given: at most 2000 pixels on its longest side, turned upright, as a JPEG, with a 480-pixel thumbnail, and without where it was taken or the camera's details. The server takes only JPEG, PNG and WebP (checked from the file itself, not its name), up to 10 MB.
- **FILE-3** Photos are private: the server sends them only to their owner's signed-in apps, never at a public address. Deleting a photo, its record or the account deletes the files. Merging referees (DUP-3) keeps everyone's photos, the kept referee's first.
- **FILE-4** The server keeps the files in a folder (`UPLOADS_DIR`, a Docker volume in compose.yaml) by default, or in an S3-compatible bucket with `S3_URL` (AWS S3, Cloudflare R2, Backblaze B2, MinIO). If the folder can't be written to, the server starts without photos and says so in its log.

## Later

- **FILE-6 (Later)** Other kinds of file (PDF, spreadsheets, CSV) on competitions and elsewhere, using the same attachments; and attachments with API keys.

## Status

Everything above except FILE-6 is built, in the website, the phone apps and the API (signed in, not with API keys).

Not built yet: FILE-6.
