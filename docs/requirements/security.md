# Security (SEC)

How the server, the website and the apps protect accounts and the server itself: limits, headers, sessions, proxies and lockouts. Security problems are reported privately to security@lawfive.app, as [SECURITY.md](../../SECURITY.md) says.

## The server and the browser

- **SEC-1** **What browsers may do.** Every answer sets a content security policy (scripts only from the server itself, nothing may frame the app), `X-Frame-Options`, `X-Content-Type-Options`, a referrer policy (only the server's name goes to map providers, never a page's address), and HSTS on an https server. A map provider's credit shows only its words and web links. lawfive.app has a content security policy of its own (SITE-9).
- **SEC-9** **Changes made with the browser's cookie come from the server's own website.** A request that changes something, signed in by the cookie, from a page at any other address (`Origin` other than `PUBLIC_URL` or `API_URL`) is refused, so a page elsewhere (a sibling subdomain, say) can't use the cookie. The apps sign in with a bearer token and tools send no `Origin`, so neither is affected.
- **SEC-10** **A share link's page lists what it shows** (DATA-7): the match's teams, kickoff, format, players, role and pitch markings, field by field, so a field added to matches later stays private until it's added there.

## Limits

- **SEC-2** **Limits on tries, per visitor.** Signing in, signing up, password reset emails, watch link codes, phone sign-in codes, invitations, shared matches, the calendar feed, the API's description (AGT-3) and changes that check a password all have limits by address.
  - The address is the connection's own; from a proxy listed in `TRUSTED_PROXIES` (SEC-14), the last one in `X-Forwarded-For` that a listed proxy didn't add; behind a second proxy (such as Cloudflare, for the hosted service), the header `TRUSTED_IP_HEADER` names.
  - Nothing a visitor writes in a request can change who they count as, and one visitor can't use up anyone else's tries.
- **SEC-14** **Only listed proxies are believed** about who's visiting.
  - `TRUSTED_PROXIES`, an environment value only, lists addresses and ranges (`172.18.0.0/16`), or `private` for every private network.
  - **Empty by default**, so no proxy is believed and a server reached directly can't be fooled by a header. A mistyped entry stops the server starting, naming it.
  - The server logs once when requests arrive through a proxy that isn't listed. **Settings → Server → Visitors' addresses** shows the address it sees the admin at, the proxies it believes, and a notice when that address looks like a proxy's.
  - The HTTPS guides (on the website and lawfive.dev) set `TRUSTED_PROXIES=private`.
  - It isn't a website setting, as a wrong value there could lock everyone, the admin included, out of signing in, and a taken-over admin account could use it to get around every limit.
- **SEC-12** **Wrong passwords lock an address for a while.**
  - Counted per email address, with an account or without, so a lock never shows who has one.
  - After 5 wrong in a row it's locked for a minute, doubling with each wrong one after a lock ends, to at most an hour. While locked even the right password is refused, saying how long is left.
  - A right password, a password reset (emailed or an admin's link) or an admin's **Unlock** on People ends it. A day without a wrong one forgets the count: the address's row is deleted then, and when its account is deleted, as the privacy policy says.
  - Sessions already signed in carry on. With email set up, the account's owner is told the first time it locks in a day.
  - It's kept in the database, so a restart doesn't reset it.
- **SEC-3** **Nothing too big to read.** A request is at most 32 MB (uploads less; a restore streams to disk with its own 2 GB limit). A zip is checked against what it says it holds before it's opened, and an .xlsx is opened a little at a time, counting what it really opens out to (at most 100 MB) whatever it says; only what was counted goes on to the spreadsheet reader. One restore at a time per account.
- **SEC-6** **Room per account.** An account's plan says how many megabytes of photos and tracks it may keep (PLAN-2; `ACCOUNT_STORAGE_LIMIT_MB` sets only a new server's first plan, PLAN-1; no limit by default), and accounts hold at most 50,000 records. People see what they're using in Settings. What's refused is what a person adds: a match recorded on a watch, and its track, are never refused, as they can't be recorded again.
- **SEC-4** **Webhooks stay off the server's network** (HOOK-4), however an address is written (an IPv4 address inside an IPv6 one included: mapped, compatible, translated, NAT64 and Teredo), and when a name changes what it points to between the check and the sending.

## Accounts and setup

- **SEC-8** **Nobody takes the server or an admin's account by typing an address.**
  - An empty server's first account needs the setup code from its logs, with `ADMIN_EMAILS` set or not, and a server emptied while it runs makes a new code (ADM-5, USR-8).
  - An account for an address `ADMIN_EMAILS` lists, made without an invitation, waits for an existing admin's approval even when sign-up is open, and isn't made at all when it's closed (USR-2), as nothing confirms that whoever typed it owns it.
  - An invitation makes one account, even with two sign-ups at the same moment.

## Sessions and devices

- **SEC-5** **The session stays on its device.**
  - The Android phone's is left out of backups and phone transfers, as are the sign-ins of the watches it passes syncs on for (APP-16). The iPhone and Apple Watch keep theirs in the keychain, this device only.
  - Release builds of every app send it only over https; debug builds may use http for a test server.
  - The one exception is a server on the referee's own network, which the iPhone app reaches over plain http only at a loopback, private or link-local address or a name ending in .local. This is checked before the password is sent, as iOS's own exception lets any IP address through.
- **SEC-13** **A watch's link only syncs matches.**
  - The session a linking code becomes (Garmin, Wear OS, Apple Watch, and the phones' Link a watch) reaches the watch's endpoints (`/v1/watch/`) and, of the account endpoints, only signing out and reading its own session; anything else answers 403. A token lifted from a watch, or from the phone passing its syncs on (APP-16), isn't the whole account.
  - Watches linked on an older server become watch-only when it upgrades, so nobody links again.
  - Devices, on the website and both phones, says "syncs matches only" for them.
  - A Garmin watch linked through the phone keeps the link only for the server and offer the wearer said yes to. The phones relay only `/v1/watch/` paths of plain words (no query or dots).
- **SEC-11** **The Android phone passes on only the watch's own requests** (APP-16): a path under `/v1/watch/` written plainly, letters, digits and hyphens between slashes, so nothing sent to the phone can become another address.
- **SEC-7** **Signing out.**
  - **Sign out everywhere else**, on the website and the phones: other browsers only, which leaves watches and phones linked, or everything, which unlinks them too. Both ask first.
  - **One device at a time**, on the website and both phones: every device in the lists but the one you're on has **Unlink** (**Sign out** for a browser), which asks first ("Unlink Forerunner 965?" "It stops syncing until you link it again."; for a phone or browser, "It's signed out until you sign in on it again.").
  - Unlinking on a watch itself signs it out on the server too, later if it can't reach it then (SYNC-6).

## Status

SEC-1 to SEC-14 are built and covered by the server's tests (and Android's for SEC-11). The apps' parts are checked by review and builds.

Not built yet:
- Ending other sessions after a password reset or an email change: both keep the account's other sessions signed in (R-14).
- Confirming email addresses.
