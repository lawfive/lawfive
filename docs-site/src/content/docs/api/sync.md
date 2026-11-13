---
title: Keeping in sync
description: Use GET /v1/changes to follow everything that changes in a LawFive account.
---

`GET /v1/changes` returns every record written since a cursor, oldest first, across all collections, deletions included. The apps sync with it, and your code can too. With an API key, it includes only the collections the key can read.

## How to use it

1. Start with `since=0`, for everything.
2. Keep the cursor from each answer.
3. Ask again while `more` is true.
4. Later, ask from your last cursor to get just what's new.

```sh
curl "https://lawfive.example.com/v1/changes?since=0&limit=500" \
  -H "Authorization: Bearer lf_your_key"
```

| Parameter | What it does |
|---|---|
| `since` | The cursor from the last page. 0, the default, means everything. |
| `limit` | Changes per page: 500 by default, at most 1000. |

The answer's shape is [ChangesPage](/api/reference/#changespage).

## Why it can't skip anything

Each write takes the next number in a sequence, and writes for one user happen one at a time, so numbers commit in order. Deleted records stay as markers, so other devices learn of the deletion.

## Changes or webhooks?

Use `GET /v1/changes` when your code runs now and then, or has to be sure it's seen everything. Use [webhooks](/api/webhooks/) to react straight away. Together, they cover missed deliveries: react to webhooks, and catch up with changes.
