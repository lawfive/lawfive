# Duplicates and merging (DUP)

The same referee entered twice under different names ("John Doe" from one schedule, "Doe, John" from another), or the same venue ("Twin Creeks" and "Twin Creeks Sports Complex"), found and merged by the user. Merging works on the website and in the Android and iPhone apps (DUP-12); the server works out the duplicates and each merge's preview, so every app shows the same (DUP-11).

## Referees

- **DUP-1** Two ways in: **Find duplicates** on the Referees page looks across all referees; **Merge with…** on a referee's page starts from that one. Nothing is merged unless the user chooses it.
- **DUP-2** **Likely duplicates**, each with why: the same email or phone; the same name in a different order (Doe, John); the same surname and initial (J. Doe); one with a middle name; or a similar spelling (Jon Doe). Names are compared without accents, punctuation or case, other names included. Find duplicates shows groups, surest first; Merge with shows the likeliest few, then a search through all the others.
- **DUP-3** Merging keeps one referee. Every match whose crew names any of the others, or has one of their names typed in, names the kept one instead, so match counts, stats and the calendar add up (4 matches and 3 make 7). The others are deleted, and their names become the kept referee's **other names**.
- **DUP-4** Before merging, a **preview**: which name to keep (the rest become other names), and which email or phone where they differ; empty details (the short name too, WEB-20) filled from the others, tags combined and notes joined; and how many matches they make together. A merge can't be undone.
- **DUP-5** **Not the same person** on a group remembers it on each of them, so they're never flagged together again. They can still be merged by hand.
- **DUP-6** A referee's other names can also be added and removed on their page. Imports, the match form's referee picker, the Referees list's search and the match search find a referee by any of them, so a name merged away doesn't come back as a new referee.

## Venues and pitches

- **DUP-7** **Venues too**, as for referees: **Find duplicates** on the Venues page, **Merge with…** on a venue's edit page, and **Not the same venue**.
  - Likely duplicates, surest first: the same address (ignoring the usual short forms, such as St for Street, and the town or zip code after it); places (parking or pitches) within 150 m; or similar names, compared as referees' are.
  - The preview picks the name to keep and, where they differ, whose address and parking; fills empty details, combines tags and joins notes; and says how many matches they make together. A merge can't be undone.
- **DUP-8** **Every pitch is shown and confirmed** in a venue merge. Each pitch of the venues merged away comes with a suggestion: **the same as** a pitch (of the kept venue, or kept from another venue in the merge) with the same name within 30 m or with none placed to check, or with another name within 30 m; otherwise **kept as a pitch of its own**.
  - The riskiest come first, with a **Check** label saying why, then **Likely fine**: a kept pitch that needs a new name; the same by position only; by name with no position to check; by name and position; then kept. Within each, more matches and corners walked first. The order is set when the venues are chosen and stays put while choices change.
  - A kept pitch must have a name no other pitch of the venue has; the merge waits until it's renamed in the preview.
  - **The same as** moves its matches to that pitch, adds its corners walked (TRK-13) in date order (the newest 20, saying how many go), fills a missing position, and keeps its name as the pitch's other name. **Kept** moves the pitch across with its matches.
- **DUP-9** **Venues and pitches have other names**, as referees do: added by merging, and added and removed on the venue's edit page (each pitch has its own), and shown on the venue's page. Imports (IMP-4), the venue picker on the website's and phones' match forms (APP-22), and the venue searches find them by any of them.

## How merging works

- **DUP-10** **Old ids are corrected.** The server remembers what each merge replaced, so a match saved later with a merged venue's, pitch's or referee's id (from a phone offline during the merge) is saved pointing where it went, through later merges too.
- **DUP-11** **The server works it all out:** the likely duplicates and their reasons, the likeliest for one, and each merge's preview (the choices, every pitch's suggestion, order, **Check** and why, the problems, the notes and the matches together).
  - The preview is its own request, asked for again whenever a choice changes, and gives the merge to send. The merge checks the same things, so one with a problem is refused.
  - **Not the same** is one request for the whole group.
  - Finding duplicates and previewing need only read access, as they change nothing.
  - The apps only show the answers. On a server that doesn't offer `merging`, they hide Find duplicates and Merge with….
- **DUP-12** **Merging on the phones**, for referees and venues.
  - **Find duplicates** under the Venues and Referees lists, with **Not the same** and **Merge…** on each group; **Merge with…** on the edit page (on iPhone the form closes and the merge opens on the page under it).
  - **Two steps:** pick those that are the same (the likeliest first with their reasons, then a search), then **Next** to review the merged one: its name and, where they differ, address or email and phone; for venues every pitch (DUP-8), with a menu for what happens to it and its name when kept.
  - **Merge N into Name** stays at the bottom, waiting while a pitch needs a look or a newer preview is coming.
  - Afterward the phone syncs and goes back to where the merge started.
  - It needs a connection, with no offline queue: offline, the screens say "Merging needs a connection" with **Try again**.
- **DUP-13** **Likely duplicates where they're seen**, on the website and both phones.
  - Over the Venues and Referees lists, a line such as **2 venues look like duplicates** with **Review**, opening Find duplicates.
  - On a venue's or referee's page, a card **Probably the same as Twin Creeks** with the reasons, **Not the same venue** (or person) and **Merge…**, keeping this one.
  - Both come from the server's groups, so they agree with Find duplicates and a weak likeness never shows. Neither shows when there are none, offline, or on a server without merging.
  - The merge preview's note under the names reads **The rest are kept as an alias, so searches and imports still find them.**

## Status

Everything above is built for referees and venues, on the website, both phones and the API.

Not checked yet:

- A merge of real duplicate venues, and one on a real phone on a slow connection.
- A phone offline during a merge.
- A watch uploading a match at a merged venue.
