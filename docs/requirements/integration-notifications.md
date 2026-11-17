# Matches from integrations (NOTE)

A phone notification when an app with an API key, such as an assignor's, adds a match or changes one that's coming up, so a new assignment or a cancellation isn't missed. It's built on the push relay (PUSH-1 to PUSH-4), with the option on API keys on the website and the setting on the phones.

- **NOTE-1** **Which saves notify:** only those made with an API key set to notify.
  - The key's option, **Tell my phones when it adds or changes matches**, is off by default and can be changed later. It's offered when the key can write matches and the server has push.
  - The person's own saves (the watch, the phones, the website, a file they import themselves) and keys without it never notify; nor does a merge, made with a key or not, moving matches to the kept venue (DUP-7).
  - Assignor calendars count as integrations, on by default (FEED-8).
- **NOTE-2** **What's news:** a new scheduled match; and for a match that hasn't kicked off, canceled, postponed, back on (scheduled again after either), a new kickoff, another venue or pitch, or removed (deleted).
  - Notes, fees and anything else stay quiet, as does a save that changes nothing (a retry).
  - A key's changes are collected for about a minute and sent as one notification. Several changes to one match say how it went from the first to the last (added then removed says nothing).
  - Changes to matches kicking off within 24 hours are collected for 30 seconds instead, apart from the rest, so they arrive soon and a burst of them is still one notification.
  - One notification counts once against the relay's limits (PUSH-1).
- **NOTE-3** **What it says**, written by the phone from `GET /v1/notices/{id}`; the push carries only that id (PUSH-2).
  - For one match: "New match", "Canceled", "Postponed", "Back on", "Kickoff moved", "Venue changed" or "Removed" with its name, then when and where it is now and what changed ("Now Sat, Nov 7, 11:30 AM · was 9:00 AM"), with the key's name beside it.
  - For several: "RefSync added 3 matches" or "changed", with a line each.
  - Tapping it opens the match, or the match list for several or a removed one. A match moved to another venue that's still on has **Directions** (APP-6).
  - Before writing it, the phone syncs, so its reminders move or go with the match (APP-6).
  - Notices are kept 30 days.
- **NOTE-4** **On the phone:** **Tell me about matches from integrations** beside **Tell me about weather risks**, off until turned on, where the server offers `notices` (`GET /v1/meta`). The phone registers with the relay while either is on, and tells the server, as it registers and whenever it changes, whether matches from integrations are on, so the server sends them only to phones that want them (PUSH-4). The iPhone's differences are IOS-14.
- **NOTE-5** **Saying when no phone will hear.** A key set to notify does nothing while none of the account's phones has **Tell me about matches from integrations** on (after a fresh install, for one).
  - On the website's API keys, beside a key with the option on: "No phone will be told. Turn on Tell me about matches from integrations in the LawFive app on your phone." It goes once a phone has the setting on.
  - The same beside an assignor calendar set to notify (FEED-8), on the website's Assignor calendars.
  - A notice made while no phone has the setting on is kept as reaching no phone, not as sent, so it's clear afterward that nothing went; it isn't sent later. A phone that hasn't said which it wants counts as having the setting on, so the website only says no phone will be told when that's so.
  - The phones say nothing about it: a phone with the setting off is one where the person chose not to be told.

## Status

The server's notices, the website's option on API keys and its warning when no phone will hear (NOTE-5), and the phones' setting and wording are built (the iPhone's as IOS-14), and a key's changes have reached an Android emulator through the live relay as one notification.

Not built yet:
- A notification on a real phone, asleep (R-18), the iPhone's through TestFlight.
