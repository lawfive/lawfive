# Fixtures for the phones' snapshot tests

The demo account's data and a new account's, exactly as the API answers the phones, for the Android
and iPhone snapshot tests to draw screens from (each phone README's snapshot section). Both phones decode the
same files with the generated models (`schema/generated/kotlin`, `schema/generated/swift`), so
they draw the same data, as the website's screenshots do from the demo.

Generated: don't edit. After changing the demo's data (`server/src/demoData.ts`) or what an
endpoint answers, run `pnpm fixtures` in `server/`; its `pnpm test` fails while these are out of
date, and checks each file against its endpoint in `schema/src/endpoints.ts`. `pnpm generate` in
`schema/` leaves this folder alone.

They're the same every run: the clock is fixed at 2026-11-09T16:00:00.000Z (08:00 on Monday 9 November 2026
in America/Los_Angeles), kickoffs are days from then in that time zone, the weather is made up, and
each kind of record's ids count from 1 with the kind's own first part (`00000007-…` for matches).
Screens that say "today" or "in 2 days" need the same clock and time zone: `now` and `timeZone`
in `index.json`.

| File | What it is | Decode as | For |
|---|---|---|---|
| `index.json` | The clock and time zone, the accounts' names, and the ids a screen wants (the next match, the one with a track, a postponed one, …) | plain JSON | every screen |
| `demo/changes.json` | `GET /v1/changes?since=0`: every record, as the first sync after signing in gets it (settings, match templates, competitions, venues with pitches, referees, matches, match records with their events) | `ChangesPage` | Matches and Get ready, a match, the match form, Venues, Referees, Competitions, Settings |
| `demo/stats.json` | `GET /v1/stats`, no filters | `Stats` | Stats |
| `demo/weather.json` | `GET /v1/weather`: forecasts for the matches coming up, and the weather kept for those played | `{ items: [MatchWeather] }` | Matches and Get ready, a match |
| `demo/track.json` | `GET /v1/match-records/00000008-0000-4000-8000-000000000001/track`: the track, its figures, the pitch and the heatmap | `{ track: MatchTrack, summary: TrackSummary, pitch: PitchOutline, heat, updatedAt }` | a match: map, heatmap, replay, heart rate, figures |
| `new-account/changes.json` | The same for an account just made: nothing yet, so the phones' own defaults apply | `ChangesPage` | first run, empty Matches, Settings's defaults |
| `new-account/stats.json` | Stats with no games | `Stats` | empty Stats |
| `new-account/weather.json` | No weather | `{ items: [MatchWeather] }` | empty Matches |

The demo's account is Alex Morgan (demo@lawfive.dev); the new one is Jamie Park
(new@lawfive.dev). The account itself (`GET /v1/account`) isn't here: its id is made at sign-up,
so it would change every run.

## The demo's matches

| Id | Kickoff (America/Los_Angeles) | Match | Status | Role | Notes |
|---|---|---|---|---|---|
| `00000007-0000-4000-8000-000000000021` | Tue 2026-08-18 14:00 | Rangers v Athletic 0-0 | played | referee |  |
| `00000007-0000-4000-8000-000000000020` | Tue 2026-09-01 09:00 | Rovers U12 v Cobras U12 1-1 | played | referee |  |
| `00000007-0000-4000-8000-000000000019` | Tue 2026-09-15 11:30 | Thunder FC v Strikers U14 1-0 | played | ar2 |  |
| `00000007-0000-4000-8000-000000000018` | Tue 2026-09-29 14:00 | Athletic v Old Boys 1-0 | played | referee |  |
| `00000007-0000-4000-8000-000000000017` | Tue 2026-10-06 09:00 | Cobras U12 v Rovers U12 2-1 | played | referee |  |
| `00000007-0000-4000-8000-000000000016` | Tue 2026-10-13 14:00 | Rangers v Old Boys 0-1 | played | referee |  |
| `00000007-0000-4000-8000-000000000015` | Tue 2026-10-20 10:00 | Galaxy SC v Thunder FC 1-1 | played | referee |  |
| `00000007-0000-4000-8000-000000000022` | Tue 2026-10-20 10:00 | Thunder FC v Strikers U14 | cancelled | ar2 |  |
| `00000007-0000-4000-8000-000000000013` | Tue 2026-10-27 09:00 | Rovers U12 v Strikers U12 1-0 | abandoned | referee |  |
| `00000007-0000-4000-8000-000000000012` | Wed 2026-10-28 13:00 | Dynamo v Athletic 2-1 | played | referee | Harvest Cup quarter-final |
| `00000007-0000-4000-8000-000000000011` | Wed 2026-10-28 16:00 | City v Wanderers 1-1 (4-3 pens) | played | referee | Harvest Cup quarter-final |
| `00000007-0000-4000-8000-000000000014` | Sun 2026-11-01 10:00 | Thunder FC v Galaxy SC 0-2 | played | ar1 |  |
| `00000007-0000-4000-8000-000000000010` | Tue 2026-11-03 14:00 | Athletic v Rangers 2-2 | played | referee |  |
| `00000007-0000-4000-8000-000000000009` | Wed 2026-11-04 09:00 | United U12 v Strikers U12 3-1 | played | referee | track: `demo/track.json` |
| `00000007-0000-4000-8000-000000000001` | Wed 2026-11-11 09:00 | Strikers U12 v Rovers U12 | scheduled | referee |  |
| `00000007-0000-4000-8000-000000000002` | Wed 2026-11-11 11:30 | Thunder FC v Galaxy SC | scheduled | ar1 |  |
| `00000007-0000-4000-8000-000000000003` | Thu 2026-11-12 14:00 | Old Boys v Athletic | scheduled | referee |  |
| `00000007-0000-4000-8000-000000000008` | Sat 2026-11-14 09:00 | Galaxy SC v Strikers U14 | postponed | referee |  |
| `00000007-0000-4000-8000-000000000004` | Tue 2026-11-17 10:00 | Cobras U12 v Strikers U12 | scheduled | ar1 |  |
| `00000007-0000-4000-8000-000000000006` | Wed 2026-11-18 10:00 | Rovers U12 v United U12 | scheduled | referee |  |
| `00000007-0000-4000-8000-000000000007` | Wed 2026-11-25 08:30 | Dynamo v City | scheduled | fourth | Harvest Cup semi-final |
| `00000007-0000-4000-8000-000000000005` | Wed 2026-11-25 09:00 | Rovers U12 v Cobras U12 | scheduled | referee |  |
