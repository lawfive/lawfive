# API keys (KEY)

Keys for scripts and integrations, such as importing matches from another app, made in the website's Settings. Matches are imported through the public API with a key rather than a built-in importer. The API reference is [schema/generated/API.md](../../schema/generated/API.md).

## Making and managing keys

- **KEY-1** Settings has an **API keys** list: each key's name, its first characters (`lf_` and 8 more), what it can reach, when it was made and last used, and when it expires, with **Delete** (confirmed; the key stops working at once). An account has as many keys as its plan allows (PLAN-2). Under For developers and in New key, a line reminds that nothing may identify anyone under 16 (names, photos, contact details), linking to the terms.
- **KEY-2** **New key** asks for:
  - a name ("API import" is suggested);
  - the access for each area (matches, match reports, venues, referees, competitions, templates, settings): none, read, or read and write;
  - an expiry: 30 days, 90 days (the default), a year, or never;
  - for a key that can write matches, whether it tells your phones when it adds or changes them (NOTE-1), changeable later in the list.

  The key is shown once, with **Copy**. The server keeps only a hash, so a lost key is replaced, not recovered.

## Using a key

- **KEY-3** A key is sent like a session token (`Authorization: Bearer <key>`) and reaches only the areas it was given; anything else gets 403 saying what it would need.
  - Weather and stats need matches read; stats then hold only what the key can read (STAT-4).
  - Address search needs venues read and write.
  - Sync (`/v1/changes`) includes only the areas it can read.
  - Keys can't manage devices or keys, act as a watch, or sign in, so a leaked key can't take over the account.
  - A new endpoint is closed to keys until its description gives a scope.
- **KEY-4** An unknown, deleted or expired key gets 401 saying which. Keys aren't devices and don't appear in the Devices list.

## Status

Everything above is built: keys with per-area access, made and deleted in Settings, and checked against the API description.
