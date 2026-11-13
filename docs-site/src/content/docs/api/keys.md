---
title: API keys
description: Make and use API keys for LawFive scripts and integrations.
---

API keys let scripts and integrations reach your account, limited to what you give them. A leaked key can't take over the account: keys can't manage devices or other keys, act as a watch, or sign in.

## Making a key

Under **Settings → API keys**, choose **New key**, and give it:

- **A name**, so you can tell your keys apart.
- **Access to each area:** none, read, or read and write. The areas are matches, match reports, venues, referees, competitions, templates and settings.
- **An expiry:** 30 days, 90 days (the default), a year, or never.
- **Notifications,** for a key that can change matches: whether your phones are told when it adds a match, or cancels, postpones, moves or removes one. Turn it on for an app that adds your assignments, and leave it off for a script loading your own matches. You can change it later in the list (`PATCH /v1/api-keys/{id}`).

The key is shown once. The server keeps only a hash, so a lost key has to be replaced, not recovered. An account can have as many keys as its [plan](/run/people/#plans-and-limits) allows: 20 on a new server. A plan can also limit how many requests its keys make a minute and a day, all keys together; past that, the API answers 429 with a Retry-After header.

## Using a key

```sh
curl https://lawfive.example.com/v1/venues \
  -H "Authorization: Bearer lf_your_key"
```

| Answer | Meaning |
|---|---|
| `401` | The key is unknown, deleted or expired. The answer says which. |
| `403` | The key doesn't have that access. The answer says what it would need. |

## What needs which access

Each endpoint in [the reference](/api/reference/) says what a key needs. A few aren't obvious:

- **Weather** needs matches read.
- **Address search** needs venues read and write.
- **`GET /v1/changes`** includes only the areas the key can read.
- **Stats** (`GET /v1/stats` and the games as CSV) need matches read, and include only what the key can read. Without match reports, there's nothing from reports or tracks: no distance, cards, added time, fitness, heatmaps or watches. Without settings, there are no heart-rate zones. Without venues, referees or competitions, the lists that name them are empty, though the counts stay.
- **Finding duplicates and previewing merges** need venues or referees read, and matches read too, for the counts. **Merging** needs write access to them and to matches; **Not the same** needs write access to them.

Endpoints are closed to keys unless their description gives a scope.

## Deleting a key

**Delete** in the list stops it working straight away. Keys don't appear in the Devices list.
