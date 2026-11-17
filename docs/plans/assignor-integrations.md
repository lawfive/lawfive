# Plan: assignor integrations

**Status:** Proposed, not built. The model: every way a referee's assignments reach LawFive (a calendar link, a connected assignor account, a file, another app with an API key) goes through one reader that turns games into matches by the FEED rules, with each system read by its own small rules. Calendar links stay the route that works everywhere; an account connection is added where a system has an API an official can authorize (Assignr first). Its requirements are drafted under [Proposed requirements](#proposed-requirements), to move into [docs/requirements/](../requirements/) when it's built.

## In short

Referees get their games from assignor systems, and most of those systems give each official a **private calendar link**. LawFive already reads those links ([assignor calendars](../requirements/assignor-calendars.md)), but with one set of rules for every system except ArbiterSports' team calendars. This plan makes LawFive work with as many systems as practical, each by its best route:

- **Calendar links, read properly per system:** rules for each system's own calendar (ArbiterSports' official calendar, Assignr, GotSport, HorizonWebRef, RefTown, Stack Officials, Spordle, Ref Insight), written from real calendars.
- **An assignor account, connected:** where a system lets an official authorize another app (Assignr's OAuth API), LawFive reads the games from the API instead, with the position, the fee and, if wanted, the crew, which calendars don't reliably carry.
- **Calendar files:** an `.ics` file imported once, read by the same rules, for systems that offer only a download.
- **Apps by others:** anything else keeps using API keys and the import endpoint, as now.

Every route ends in the same place: the match is added, moved or canceled by the FEED rules, the phones are told (NOTE-2), and the watches show a canceled match as canceled (SYNC-16). The phones get their own screen for all of it (FEED-11).

Not in this plan: reading assignment emails (an [open question](#open-questions)), accepting, declining or self-assigning games from LawFive, sending match reports back to an assignor, and anything that needs an assignor's password.

## What's already there

- **Assignor calendars** (FEED-1 to FEED-10, [assignor-calendars.md](../requirements/assignor-calendars.md)), on the server and the website:
  - `server/src/feeds/calendars.ts`: the `AssignorCalendars` loop reads due calendars every minute (each every 30 minutes with jitter, FEED-3), encrypts the link with a key from `AUTH_SECRET` (FEED-2), and `sync()` works out what each event does (new, changed, taken on at the same kickoff, canceled when gone, back on) and saves through `importMatches` (`server/src/import.ts`) with the system as the match number's source.
  - `server/src/feeds/ical.ts` parses calendars (time zones, Windows zone names, repeats); `server/src/feeds/fetch.ts` fetches as webhooks are sent (HTTPS, no private addresses, 2 MB, three redirects).
  - `server/src/feeds/rules.ts`: `readSummary` and Other's rules for every system, `arbiter()` for ArbiterSports' team calendars, and `rulesVersion` per system, so changed rules read the kept events again (FEED-12).
  - Tables `assignor_calendar` and `assignor_event` (`server/src/db/tables.ts`): the event's UID, its match, its raw properties (kept, never shown), a hash, and whether the calendar canceled it.
  - The systems offered are `AssignorSystem` in `schema/src/api.ts`: ArbiterSports, Assignr, HorizonWebRef, RefTown, GotSport, Spordle and Other. Endpoints are under `/v1/assignor-calendars` in `schema/src/endpoints.ts`, behind the `assignor-calendars` capability.
  - The website's page is `web/src/pages/AssignorCalendars.tsx`. The phones only link to it, from the Get ready card (`GetReady.kt`, `GetReady.swift`).
- **Importing** (IMP, [importing.md](../requirements/importing.md)): CSV, Excel and JSON files read on the server (`server/src/importFile.ts`), each row checked like any save; a row updates a match by its ID, else by its match number whatever its source (IMP-3). Venues, competitions and referees are found by name or added (IMP-4).
- **API keys** (KEY, [api-keys.md](../requirements/api-keys.md)) with per-area scopes, and `POST /v1/import/matches` for apps that send rows. **Webhooks** (HOOK) send changes out.
- **Notices** (NOTE, [integration-notifications.md](../requirements/integration-notifications.md); `server/src/notices.ts`): a key set to notify, or a calendar (FEED-8), tells the phones about new, canceled, postponed, moved and removed matches, collected into one notification.
- **Canceled matches on the watches** (SYNC-16): a canceled or postponed match stays in the watch's list, marked.
- **Plans** (PLAN-2): assignor calendars are a limit (FEED-10); plans-and-limits' Status lists "assignor connections as a limit, once they exist".
- **Match fields** an assignor fills (`schema/src/records.ts`): `external` (source and match number), `role`, `crew`, `assignor`, `fee`, venue and pitch, `ageGroup`, `gender`, `competition`.
- **The privacy rule for minors:** the terms (`site/public/terms.html#minors`) say nothing may identify anyone under 16, and API keys remind of it (KEY-1).

## The systems

What each system offers an official, from the systems' own help pages unless marked. **Sure** means seen in the system's own documentation or a real calendar; **likely** means one source or indirect; **unknown** means not found and to be checked with a real account.

| System | Used for (US soccer) | Calendar link | API an official can authorize | Exports | What the games carry |
|---|---|---|---|---|---|
| **ArbiterSports** (ArbiterOne, ArbiterGame) | High school and college; some state associations and adult leagues | **Sure:** an official's own feed of the games they're assigned (not the group's schedule), sent by email from Settings → Preferences → Calendar Sync. Team calendars on ArbiterLive are read already. | **No.** The Partner API is REST with Scheduling, Registration and Eligibility scopes, for partners whose data access is limited to allowlisted groups, schools and state offices (sure). Nothing for an individual official. | Unknown for officials | Team calendar, **sure** (a real one, in `rules.ts`): site, subsite, level, sport, team, game number in the UID, times in UTC. Official's calendar: position, fee and both teams **unknown** (FEED-12's Status expects them; not confirmed). |
| **Assignr** | Youth clubs and leagues, adult recreational leagues | **Sure:** subscribe from the app's menu; the official's assigned games from a month ago to three months ahead. Fields unknown. | **Yes, sure.** API v2 with OAuth 2.0: authorization code with refresh tokens (PKCE for public apps), scopes `read` and `write`, access tokens of about two hours, redirect addresses registered in advance. `GET /v2/current_account/games` gives the account's games. Access by asking Assignr Support for a developer account; RefSix already connects this way ("Authorize Access"). | Unknown | **Sure** (API reference): home and away teams, venue with street and city, subvenue, start time and time zone, age group, gender, league, canceled, and each assignment's position, official's name, accepted or declined, and fees (game fees and travel fees). |
| **GotSport** | US Youth Soccer and US Club Soccer state associations, leagues and tournaments | **Likely:** "Add Accepted to Calendar" on the Referees tab. Whether it's a link that updates or a one-time file is unknown. | No public API found | Unknown | Unknown |
| **Stack Officials** (gameofficials.net now redirects to it) | AYSO regions (listed on AYSO's wiki), leagues and tournaments on Sports Connect | Unknown: no calendar link found; its pages mention schedule sync with Sports Connect, and an app | No public API found | Unknown | Unknown |
| **HorizonWebRef** | Youth leagues and clubs | **Sure:** My Schedule → Utilities → iCal → iCal Sync URL, with time zone modes in the link (`tzMode=org&tz=America/Chicago`) | No public API found | Unknown | Unknown |
| **RefTown** | Officials associations, schools | **Sure:** a read-only key for the game schedule, meetings, or both, updated a few times a day. Start times can be **padded** by minutes for pregame and travel (Calendar Preferences), and a vCalendar 1.0 format can be chosen. | No API found | **Likely:** games to Outlook and to Excel | Site address from the schools and teams roster (likely); the rest unknown |
| **Ref Insight** | Youth leagues (newer) | **Likely:** a personal calendar URL of all the official's assignments | Unknown (it connects with RefSix, so some partner route exists) | Unknown | Unknown |
| **Spordle** | Canada | **Likely:** a subscription to the games assigned, each event linking to the game | Unknown | Unknown | Unknown |
| **RefQuest** (RQ Assign) | College conferences | Unknown | Unknown | Unknown | Unknown |
| **Others** (Demosphere, Bound, Tourney Direct and the like) | Local leagues and tournaments | Many have calendar links | Not looked at | Not looked at | Read by Other's rules |

Every system also emails assignments and changes; what those emails hold wasn't looked at.

What this means:

- **Calendars are the route for most systems.** Only Assignr offers an official an API today. ArbiterSports' API is for partners and their allowlisted organizations, not for an official.
- **The fee and position are where calendars fall short.** Assignr's API has both; whether any calendar has them is unknown until real calendars are read.
- **Two system quirks change kickoffs:** RefTown can pad start times, so an event's start may be before the kickoff; HorizonWebRef's link carries its own time zone mode. Both need their rules, and the preview (FEED-1) should say what it found.

## Proposed behavior

### One list: Assignors

**Settings → Assignor calendars** becomes **Settings → Assignors** (website and both phones): one list of the person's calendar links and connected accounts, each with its system, how it last went (FEED-9), Pause, Resume, Check now and Remove. **Add** offers:

- **Paste a calendar link** (FEED-1 as it is), with the system chosen from a longer list: ArbiterSports, Assignr, GotSport, HorizonWebRef, Ref Insight, RefTown, Spordle, Stack Officials, or another.
- **Connect your Assignr account**, where the server has Assignr's credentials (below). Assignr is first because its API is open to an official's own authorization; another system joins the same way when it offers one.

API keys stay under For developers; a key set to notify keeps naming itself in notices (NOTE-3).

### Calendar links, per system

Each system gets its own rules in `rules.ts` (FEED-12), written from a real calendar of that system, with what's missing read by Other's rules. Raising `rulesVersion` reads the kept events again, so games already in LawFive improve too. In order of use among US soccer referees, as far as known:

1. **ArbiterSports, an official's calendar:** both teams, the position, the fee if it's there, the site and subsite, the game number (`G-` UID) as the match number.
2. **Assignr's calendar**, for referees on servers without Assignr's credentials: the position, teams, venue and game number as Assignr writes them, so a later account connection finds the same matches.
3. **GotSport, Stack Officials, HorizonWebRef, RefTown, Ref Insight, Spordle**, as real calendars arrive.

System quirks:

- **RefTown's padding:** if a calendar's events start earlier than the kickoff by the same minutes each time, the preview says so ("Games start 30 minutes early: RefTown's Calendar Preferences pad them"), and the calendar has a setting to take the padding off (minutes subtracted from each start).
- **HorizonWebRef's time zone modes:** the link is kept as pasted, with its parameters; times written with a zone are read in it (FEED-4).
- **vCalendar 1.0** (RefTown's option) isn't read; the preview says to uncheck "Use vCalendar 1.0 Format" in RefTown.

Real calendars come from referees who use each system. They're kept as test fixtures with every name, place and number changed, so no one's schedule or identity is in the repo.

### An assignor account

**Connecting:** Connect your Assignr account sends the person to Assignr to approve read access, then back to the server, which keeps the tokens and says which Assignr account is connected ("Connected as Dana Whitfield"). Nothing is read until **Connect** on a preview, as with a calendar: "12 games from Sat, Nov 21 to Sun, Jan 31; 3 already in LawFive".

**Reading:** every 30 minutes with jitter, as calendars are (FEED-3): the person's games from today to 90 days ahead (Assignr's `current_account/games`, 50 a page). Each game becomes an import row, through the same `sync()` as a calendar's events, so FEED-5 to FEED-7 apply unchanged:

- teams, the venue with its address (given to a new venue, or one without, so it reaches Directions), the subvenue as the pitch, the game's time zone, age group and gender, the league as the competition, and Assignr's game ID as the match number (source `assignr`);
- the person's own assignment's **position** as their role (Referee, AR1, AR2, fourth official; others such as "Observer" are left as the match's notes);
- the assignment's **fee**, in its currency ([open question](#open-questions) on how it follows changes);
- a game Assignr marks canceled, or that no longer lists the person (declined or unassigned), before kickoff: the match is canceled (FEED-7), and the phones are told (NOTE-2, "Canceled").

**The crew**, off by default per connection (**Add my crew's names**): the other officials' names, as crew, found among the person's referees by name or added (IMP-4). Never their contact details: Assignr's game-day contacts are not fetched. Beside the switch, the reminder API keys carry (KEY-1): nothing may identify anyone under 16, and youth referees can be younger.

**Tokens are passwords** (as FEED-2): encrypted with the key from `AUTH_SECRET`, refreshed before they expire (saving each new refresh token), never in the API, exports or backups. A refresh Assignr refuses (access revoked in Assignr, or a changed `AUTH_SECRET`) stops the connection with "Stopped on Nov 9: reconnect to Assignr" until **Reconnect** (FEED-9). **Remove** revokes the access at Assignr where it can and forgets the tokens; its matches stay as ordinary matches.

**Rate:** Assignr allows an application 180 requests a minute, 500 in five minutes and 5,000 an hour. A connection's read is usually one request; the jitter spreads them, and a 429 waits as Retry-After says. Whether the limit is per application (shared by everyone on the hosted service) or per token is to be asked when access is granted.

Webhooks: Assignr's are subscriptions for a site (an assigning organization), not for an official, so connections poll.

### One match per game, whatever the route

- A game read by two routes is one match. Within a system, the match number (Arbiter's game number, Assignr's game ID) is what joins them; across systems, only the same kickoff (FEED-5), as two systems' numbers can collide.
- **Connecting an account takes over a calendar of the same system:** "You have an Assignr calendar too. Use the account instead?" Yes pauses the calendar and hands its games to the connection by game number, then kickoff, so nothing is added twice and nothing is canceled in between. The calendar can then be removed.
- **Apps by others** (API keys) keep importing as now. A key's rows that carry a system's game numbers meet the built-in routes' matches by number (IMP-3). A guide on lawfive.dev, **Write an assignor integration**, says so: fill the match number with the system's own game number, set the key to notify (NOTE-1), and import again rather than deleting.

### Calendar files

**Import matches** (IMP-1) also takes an `.ics` file, read with the rules of the system chosen in the dialog, checked row by row (IMP-5), and saved as any import is: for a system that offers only a download, or an export a referee already has. It's a one-off: a file has no "gone from the calendar", so nothing is canceled by it.

### Credentials per server

- **Hosted service:** LawFive's own Assignr application.
- **Self-hosted:** the connection is offered only where the server has `ASSIGNR_CLIENT_ID` and `ASSIGNR_CLIENT_SECRET` (environment or Settings → Server, ADM-1), with the server's callback address registered in its own Assignr application; `GET /v1/meta` lists `assignor-accounts`. Without them, Assignr's calendar link works as now, and the self-hosting docs say how to ask Assignr for a developer account.
- No broker: the project doesn't relay other servers' assignor tokens, as the push relay keeps nothing (PUSH-2).

### Limits

One plan limit, **assignor connections**, counts calendar links and connected accounts together (FEED-10, PLAN-2), so a plan's "3" means three, however they're made. New matches count against matches and venues as now (PLAN-4).

### The phones (FEED-11)

**Settings → Assignors** on Android and the iPhone: the list with how each last went, Pause, Resume, Check now and Remove; **Paste a calendar link** with its preview and Connect, as on the website; **Connect your Assignr account** opens the server's connect page in the system's browser sheet (Custom Tabs, `ASWebAuthenticationSession`) and returns to the list. The Get ready card's Connect a calendar opens this screen instead of the website. It needs a connection and says so, as importing does (IMP-10).

### When a route stops (FEED-13)

Once, when a calendar or account stops (FEED-9), the phones say so: "Your Assignr connection stopped. Reconnect to keep your games coming in." It needs a new event type on the relay (PUSH-2) and the phones' wording. Built in this plan, as an account that stops silently is worse than a calendar that does.

### Privacy

- The privacy page (`site/public/privacy.html`), both `PrivacyInfo.xcprivacy` files and the stores' answers (CONTRIBUTING.md's keep-in-step table): an assignor account's tokens are kept encrypted; what's read (the person's games, positions, fees, venues, and crew names only if switched on); never other officials' contact details; removed with the connection.
- An assignor's data is shown only to the account it's read for, as everything else is.
- Assignr's API terms are read when access is granted, and anything they ask (attribution, retention) is added here before it's built.

## Proposed requirements

Drafts, as **FEED-n** and **IMP-n**, with edits to existing ones:

- **FEED-14 (Draft)** **Settings → Assignors**: calendar links and connected accounts in one list, on the website and both phones, with the systems ArbiterSports, Assignr, GotSport, HorizonWebRef, Ref Insight, RefTown, Spordle, Stack Officials and Other.
- **FEED-15 (Draft)** **Connecting an Assignr account** by Assignr's OAuth, where the server has its credentials: approved at Assignr, previewed, then connected, saying which account; Remove revokes and forgets it, leaving its matches.
- **FEED-16 (Draft)** **Reading an account** every 30 minutes: the person's games from today to 90 days ahead, each through FEED-5 to FEED-7, with teams, venue and address, pitch, time zone, age group, gender, league, the person's position as role, the game ID as match number, and the fee. A game canceled, declined or unassigned before kickoff cancels its match.
- **FEED-17 (Draft)** **An account's tokens are passwords**: encrypted as FEED-2, refreshed, never sent back; a refused refresh stops it until Reconnect (FEED-9).
- **FEED-18 (Draft)** **The crew from an assignor**, off by default per connection: names only, never contact details, with the under-16 reminder.
- **FEED-19 (Draft)** **One match per game:** within a system by its game number, across systems by kickoff; connecting an account takes over a calendar of the same system.
- **FEED-20 (Draft)** **Credentials per server:** `ASSIGNR_CLIENT_ID` and `ASSIGNR_CLIENT_SECRET`, the `assignor-accounts` capability; without them only calendar links.
- **FEED-21 (Draft)** **System quirks in the preview:** RefTown's padding found and taken off by a setting; vCalendar 1.0 named as unreadable.
- **IMP-11 (Draft)** **Calendar files:** Import matches takes `.ics`, read with the chosen system's rules, as a one-off import.
- Edits: **FEED-1** (the longer system list, under FEED-14); **FEED-10** and **PLAN-2** (one limit, assignor connections); **FEED-11** (the phones' screen as above); **FEED-12** (each system's calendar rules as written); **FEED-13** (calendars and accounts, built); **NOTE-1** (connected accounts count as integrations, as calendars do).

## The work, in order

1. **The reader, shared:** `sync()` in `calendars.ts` takes games from any route (key, start, columns, canceled, raw), so calendars and accounts share it; tables `assignor_account` and `assignor_account_game` beside the calendar's, or one table of routes with a kind (the migration with `pnpm db:generate`); one limit across both. Tests for the takeover and for numbers colliding across systems. About a day.
2. **Calendar rules per system**, each from a real calendar, made anonymous as a fixture: ArbiterSports' official calendar first, then Assignr's, then the others as they come; RefTown's padding and vCalendar in the preview; `AssignorSystem` gains Stack Officials and Ref Insight. About half a day a system, once a calendar is in hand.
3. **Assignr connection:** a developer account from Assignr first; then OAuth start and callback, token storage and refresh, the poller with backoff on 429, the game-to-columns rules, preview, the crew option, endpoints in `schema/src/endpoints.ts`, server settings (ADM-1), and tests against a fake Assignr. About 2 days.
4. **Website:** Settings → Assignors, Connect and Reconnect, the takeover question, the crew switch, `.ics` in Import matches (IMP-11, with `importFile.ts`). About a day.
5. **Android and iPhone** (FEED-11): the screen, the browser sheet for connecting, the Get ready card's link; snapshot fixtures (`pnpm fixtures`). About 2 days for both.
6. **FEED-13:** the relay's event type, the server's send, both phones' wording. About a day.
7. **Docs and privacy:** the privacy page and stores' answers, lawfive.dev's server settings (the Assignr variables) and the integration guide, lawfive.app's FAQ and `schedule.html`. Half a day.

About 8 to 10 days, most of it in the Assignr connection and the phones, plus waiting on Assignr's developer access and on real calendars from referees.

## Open questions

1. **Which first after ArbiterSports' team calendars?**
   - (a) The Assignr account connection; (b) per-system calendar rules first, as they help every server; (c) both together.
   - **Recommendation: (c), in the order of the work:** the reader and ArbiterSports' official calendar first (the most-used system, a calendar any server can read), then Assignr's connection while waiting on real calendars for the rest.
2. **Assignr on self-hosted servers.**
   - (a) Each server registers its own Assignr application (`ASSIGNR_CLIENT_ID`, `ASSIGNR_CLIENT_SECRET`); (b) the hosted service brokers the OAuth for every server; (c) self-hosted servers use calendar links only.
   - **Recommendation: (a), falling back to (c)** where a self-hoster has no credentials. (b) would put other servers' assignor tokens through the project's infrastructure, and Assignr may not allow one application to act for many servers.
3. **The crew from an assignor.**
   - (a) Never; (b) names only, off by default, with the under-16 reminder; (c) names on by default.
   - **Recommendation: (b).** Crew names fill the match report and Referees, but LawFive can't know a youth referee's age, and the terms put that on the person, as API keys do.
4. **Fees from an assignor.**
   - (a) On new matches only (as notes are, FEED-6); (b) on new matches, then following the assignor's changes until the person changes the fee or marks it paid; (c) never.
   - **Recommendation: (b)**, as an assignor's fee change is news the referee wants, and their own edits and Paid stay theirs. Assignr's travel fees go into the notes until mileage is built ([mileage.md](mileage.md)), not into the fee.
5. **A game the person is unassigned from or declines.**
   - (a) Canceled, as a game gone from a calendar is (FEED-7); (b) deleted; (c) left as it is.
   - **Recommendation: (a)**, so the person sees what happened, with Delete a tap away, and the watch shows it canceled (SYNC-16).
6. **One limit or two.**
   - (a) One limit, assignor connections, counting calendars and accounts; (b) separate limits.
   - **Recommendation: (a).** To a referee they're the same thing, and the takeover moves a calendar to an account without changing the count.
7. **Assignment emails.**
   - (a) A private forwarding address per account, with rules per system's emails; (b) later; (c) never.
   - **Recommendation: (b).** It needs a mail service receiving for the server, which self-hosted servers don't have, and calendars and the API already cover the systems that matter most.
8. **ArbiterSports' Partner API.**
   - (a) Ask ArbiterSports to become a partner; (b) not now.
   - **Recommendation: (b).** Its data is limited to allowlisted organizations, so it would serve an assigning group that asks for LawFive, not an individual official; the official's calendar covers them.

## Checks

- A real calendar from each system, read against what its website shows: kickoff (with RefTown's padding and HorizonWebRef's zone modes), teams, venue, position, fee.
- A real Assignr account through a season's weekend: a game added, moved, canceled and unassigned in Assignr, each in LawFive within 30 minutes with one notification; a token refreshed over several days; access revoked in Assignr.
- The takeover from an Assignr calendar to the account adds and cancels nothing.
- The hosted service's Assignr request rate in its first weeks.

## Sources

- ArbiterSports: [How do I subscribe to an Arbiter calendar feed?](https://arbitersportshelp.zendesk.com/hc/en-us/articles/19923818904205), [Arbiter Partner API](https://arbitersportshelp.zendesk.com/hc/en-us/articles/20509495354253-Arbiter-API) (both read through search summaries; the pages refused direct reading).
- Assignr: [API overview](https://support.assignr.com/en/articles/8526572-api-overview), [Authentication](https://assignr-api.readme.io/reference/authentication), [Access to the API](https://assignr-api.readme.io/reference/access-to-the-api), [Rate limits](https://assignr-api.readme.io/reference/rate-limits), [Account's games](https://assignr-api.readme.io/reference/getv2currentaccountgames), [Creating a webhook subscription](https://assignr-api.readme.io/reference/postv2webhookssubscriptions), [Adding your games to your calendar](https://support.assignr.com/en/articles/8526508), [Integration with REFSIX](https://support.assignr.com/en/articles/10490988-integration-with-refsix).
- GotSport: [Link assigned matches to iCalendar](https://support.gotsport.com/referees-how-to-link-assigned-matches-to-icalendar-desktop/mobile).
- Stack Officials: [stackofficials.com](https://stackofficials.com/) (gameofficials.net answers with a permanent redirect there), [AYSO wiki](https://wiki.ayso.org/wiki/Stack_Officials).
- HorizonWebRef: [External calendar time zone](https://helpcenter.horizonwebref.com/en/articles/7962469-how-do-i-control-my-external-calendar-s-time-zone), [Subscribe on iPhone](https://helpcenter.horizonwebref.com/en/articles/6222489-how-to-subscribe-to-icalendar-on-iphone-ipad).
- RefTown: [Knowledge base](https://reftown.com/kb_print.asp?nomenu=1).
- Ref Insight: [Personal calendar URL](https://ideas.refinsight.com/changelog/calendar-updates-enhancement-personal-calendar-url).
- RefQuest: [refquest.com](https://refquest.com/solutions/assign).

Not confirmed: what any official's calendar holds beyond ArbiterSports' team calendar; whether GotSport's calendar link updates; whether Stack Officials and RefQuest have calendar links; whether Assignr's rate limit is per application or per token, and whether it will grant LawFive access.
