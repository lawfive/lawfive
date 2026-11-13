# Assignor calendars (FEED)

ArbiterSports, Assignr, HorizonWebRef, RefTown and others give each official a private calendar link to their games. Pasted into LawFive once, it's read by the server every 30 minutes into the person's matches, so new games come in, and moved or canceled ones change, without typing anything or importing a file. It's on the server and the website, with the phones to follow (FEED-11).

## Connecting

- **FEED-1** **Settings → Assignor calendars → Add calendar.**
  - Paste the link (`webcal://` is read as `https://`) and choose the system it's from (ArbiterSports, Assignr, HorizonWebRef, RefTown, GotSport, Spordle, or another).
  - **Look at it**: the server reads it once and says what it holds ("4 games from Sat, Nov 7 to Sun, Nov 15; 1 already in LawFive"), with the first three as they'd be saved, and what it can't read.
  - Nothing is saved until **Connect**, with a name (the system's, or the calendar's own).
  - A calendar can be paused and resumed, read now (**Check now**), given a new link, and removed. Removing it leaves its matches as ordinary matches.
  - Any number per account, within the plan (FEED-10).
- **FEED-2** **The link is a password:** anyone with it reads the schedule. It's stored encrypted with a key from `AUTH_SECRET`, shown only as its site ("https://www.arbitersports.com/…"), and never sent back by the API, exports or backups. A backup restored elsewhere, or a changed `AUTH_SECRET`, needs it pasted again (the calendar says so and pauses).
- **FEED-11 (Draft)** **On the phones:** an Integrations screen on Android and the iPhone that lists the calendars with how each last went, and adds, pauses, resumes and removes them as the website does.

## Reading

- **FEED-3** Every 30 minutes, up to two minutes later at random so a server with many calendars doesn't read them at once, asking only for what changed (`If-None-Match`, `If-Modified-Since`). Fetched as webhooks are sent (HOOK-4, SEC-4): HTTPS only (HTTP too where `WEBHOOK_ALLOW_PRIVATE` is on, for testing on a local network), never the server's own network, at most 2 MB in 10 seconds, and at most three redirects, each checked again.
- **FEED-4** **What's read:** events with a start time still to come, at most 500, soonest first.
  - Times are in UTC, in the event's `TZID` (an IANA name, a Windows name as Outlook writes them, or a path ending in one), or with no zone in the calendar's `X-WR-TIMEZONE`, else the account's time zone (PLAN-9).
  - A game written in UTC with no zone named (as ArbiterSports writes them) takes the account's time zone as the match's.
  - All-day events (an unavailable day) are skipped. A repeating event is read as its first time, and a repeat's own changed instance as its own game.
- **FEED-9** **When it goes wrong:**
  - A link that answers 404, 410, 401 or 403, or not with a calendar, three reads in a row is paused, with "Stopped on Nov 9" and why under it, until it's resumed or given a new link.
  - Any other failure (no answer, the site's own error) is shown and tried again at the next read.
  - Games that can't be read or saved are listed under the calendar with why (at most 20), as an import's problem rows are (IMP-5).
  - A plan's limit reached stops only new matches.
- **FEED-10** **Limits:** a plan limit, **assignor calendars** (PLAN-2), each still read every 30 minutes. It's free on every plan, with the count as the control (for example 3 on the hosted service's free plan). New matches count against the plan's matches and venues (PLAN-4).

## From event to match

- **FEED-5** Each event becomes an import row (IMP-3), so venues and competitions are found by name or added, and every save is checked as any other.
  - Until a system has its own rules (FEED-12), every system is read the same way. From the title: a position before a colon as the person's role ("Center:", "AR1:", "4th:"); then the teams when it names them plainly ("U12 Girls: Strikers v Rovers", "vs", "Rovers @ Strikers" for away at home), with a division before them as the match's name; else the rest of the title as the name. The location's first part is the venue (the rest is usually its address), and the description the notes.
  - An event is remembered by its UID with the match it became, by the server, not as the match number the person sees and can change.
  - Its properties as the calendar wrote them are kept with it (never shown or exported), so a system's rules written later read the games already there again.
  - An event at the same kickoff as a scheduled match already in LawFive, not yet any calendar's, takes that match on as it is, rather than adding a copy.
- **FEED-12** **Each system's own rules,** from a real calendar, with what's missing read by FEED-5's. Raising a system's rules version reads its kept events again.
  - **ArbiterSports** (from a team's calendar): the description's `Team:` is the team whose calendar it is, and the title "Varsity-3 Boys-Soccer @ Opponent" (away) or "vs Opponent" (home) gives the other side.
  - `Site:` is the venue, with LOCATION as its address (given to a new venue, or one with none, so it reaches Directions), and `Subsite:` the pitch.
  - `Level:` is the age group, and `Sport:` beginning Boys or Girls the gender.
  - The UID "G-" and a number is Arbiter's game number, the match number (source `arbiter`).
- **FEED-6** **What stays the person's:**
  - An event that hasn't changed since it was last read changes nothing, so the person's edits stay until the assignor changes the game. Then what the calendar sets (kickoff, venue, teams, name) wins, as the assignor is the source of truth for assignments.
  - Notes are written only on a new match. Reports, photos, fees, crew and tags are never touched.
  - A match deleted in LawFive isn't brought back, and a played or abandoned match is never changed.
- **FEED-7** **Gone from the calendar,** or marked canceled in it, before kickoff: the match is canceled (not deleted, so the person sees what happened, with Delete a tap away). If the game comes back, it's scheduled again. After kickoff it's left as it is, as calendars list only games to come.

## Notifications

- **FEED-8** A calendar is an integration for NOTE-1 to NOTE-3, on by default, with **Tell my phones when it adds, moves or cancels a match** to turn it off per calendar, and the calendar's name as who made the change ("Arbiter: NorCal added 3 matches").
- **FEED-13 (Later)** **A notification when a calendar stops,** once, as FEED-9 pauses it. It needs a kind of push the relay doesn't have yet.

## Status

The server's side (FEED-1 to FEED-10, and ArbiterSports' rules from a team's calendar) and the website's Settings → Assignor calendars, with its preview, are built.

Not built yet:
- The phones' screen (FEED-11).
- ArbiterSports' rules for an official's own calendar (how it writes both teams, the position and the fee), and the other systems' rules (FEED-12).
- A notification when a calendar stops (FEED-13).
