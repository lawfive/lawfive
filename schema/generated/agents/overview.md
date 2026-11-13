# The LawFive API

LawFive is for soccer referees: it keeps their matches, match reports, venues and the officials they work with. Everything it does goes through this API. Each person's data is their own, on the hosted service or a server someone runs themselves.

## The basics

- **Address:** everything is under `/v1` on the server: `https://api.lawfive.app` for the hosted service, or a server's own address. Ask the person which one they use.
- **What a server offers:** `GET /v1/meta` needs no sign-in. Check `capabilities` before using address search or weather, which a server can switch off, and ignore fields and capabilities you don't know. A server may be older than these pages.
- **This server's exact API:** `GET /v1/openapi.json` needs no sign-in, and describes the version that server runs. `openApiUrl` in `GET /v1/meta` is its full address; a server from before it has no such field.
- **Data:** JSON. Ids are UUIDs chosen by the client, times are ISO 8601 with a UTC offset, and durations are whole seconds.
- **Errors:** a JSON body with `error`, a sentence a person can read. `429` means too many tries: wait for the seconds in `Retry-After`. `413` means the request is too big. Every answer from the server has a `LawFive-Version` header; an error without it came from a proxy in front of the server (while it restarts, say), so try again rather than acting on its status.

## API keys

Integrations use an API key, which the person makes in the website's Settings → API keys and which is shown once. Send it as `Authorization: Bearer lf_...`. Ask for the least access the job needs.

- **Access:** per collection, read or read and write, written `<collection>:read` and `<collection>:write`. The collections are `matches`, `match-templates`, `match-records`, `venues`, `competitions`, `referees`, `settings`.
- **`401`** means the key is unknown, deleted or expired, and **`403`** means it lacks that access; each says which.
- **Closed to keys:** anything whose section says "Not with API keys", such as stats, photos, devices and managing webhooks. Those need the person signed in.

## Pages

| Page | What it covers |
|---|---|
| [The data model](data-model.md) | The records and every type they're made of |
| [Keep a copy up to date](guide-keep-in-sync.md) | Follow every change with `GET /v1/changes`, deletions included, without missing any. The key needs read access to each collection you want; the others are left out. |
| [Read matches with their venues and officials](guide-read-matches.md) | List someone's upcoming matches, with the names a match only refers to by id. The key needs `matches:read`, `venues:read` and `referees:read`. |
| [Receive changes as they happen](guide-receive-webhooks.md) | Check that a webhook delivery is really from LawFive, then act on it once. The person makes the webhook in the website's Settings → Webhooks, chooses its topics and gets its `whsec_...` secret once. |
| [Save a record safely](guide-save-a-record.md) | Create, change and delete a match without overwriting a change made elsewhere, such as on the person's watch. The key needs `matches:read` and `matches:write`. |
| [Server](server.md) | What the server is and offers. |
| [Accounts](accounts.md) | Signing up, in and out (Better Auth's endpoints). |
| [Linking a watch](linking-a-watch.md) | A watch links to an account with a code (RFC 8628): it asks for a code and shows it, someone signed in enters it on the web app's Link page and approves it, and the watch, polling meanwhile, gets its own token. |
| [Records](records.md) | The user's records, one collection per kind. |
| [Tracks](tracks.md) | GPS and heart rate for a match report, in LawFive's own format whatever recorded them: convert from the source (RefSix, an activity file, a phone's health store) before uploading. |
| [Sync](sync.md) | Everything that changed since a device last looked. |
| [People](people.md) | Admins see everyone on the server, approve or decline new accounts, make other admins, and make password reset links, suspend and delete accounts, and change who can sign up; and make plans, named sets of limits, and put each account in one. |
| [App sign-in](app-sign-in.md) | Signing in on a phone with a code the web app shows, as a QR code or in letters, instead of typing a password. |
| [Invitations](invitations.md) | Links that let someone make an account even when sign-up is closed. |
| [Import](import.md) | Adding and updating matches from a spreadsheet, CSV or JSON file. |
| [Assignor calendars](assignor-calendars.md) | An assignor system's private calendar link (ArbiterSports, Assignr, HorizonWebRef, RefTown and others give each official one), which the server reads every 30 minutes into the account's matches through the import: new games added, moved ones changed, ones gone before kickoff canceled. |
| [Calendar](calendar.md) | A private calendar feed of the user's matches, for calendar apps to subscribe to. |
| [Stats](stats.md) | Reports on the user's games, worked out by the server so every app shows the same. |
| [Devices](devices.md) | Where the account is signed in. |
| [Attachments](attachments.md) | Photos on matches, venues and referees, kept by the server on its disk or in S3-compatible storage. |
| [Export](export.md) | Everything in the account as one zip, and restoring one into an account, for backups and moving between servers. |
| [Sharing](sharing.md) | A match's share link: an address nobody can guess that shows the match, its log and its track to anyone who has it, without signing in. |
| [Webhooks](webhooks.md) | URLs that hear about changes to the account's records: matches, match reports, venues, referees, competitions and templates, however they were made (the web app, the API, a watch, an import). |
| [API keys](api-keys.md) | Keys for scripts and integrations, made in the web app's Settings. |
| [Watch](watch.md) | What a Garmin watch uses, shaped for its little memory: matches in the form it starts one from, and finished matches as it saved them. |
| [Places](places.md) | Address search for placing venues on the map. |
| [Quiz](quiz.md) | The Laws of the Game quiz's questions. |
| [Weather](weather.md) | Forecasts for the user's matches, and the weather finished matches were played in. |
