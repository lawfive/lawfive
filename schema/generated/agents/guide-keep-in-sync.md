# Keep a copy up to date

Follow every change with `GET /v1/changes`, deletions included, without missing any. The key needs read access to each collection you want; the others are left out.

Keep the cursor with your copy, and save both together, so a crash repeats a page rather than skipping one. Applying a change twice does no harm, because each one is the whole record as it is now.

```js
const LAWFIVE_URL = process.env.LAWFIVE_URL;
const LAWFIVE_KEY = process.env.LAWFIVE_KEY;

// Your own storage: a record by collection and id, and the cursor. Start the cursor at 0.
const copy = new Map();
let cursor = 0;

async function syncOnce() {
    let more = true;
    while (more) {
        const res = await fetch(`${LAWFIVE_URL}/v1/changes?since=${cursor}&limit=500`, {
            headers: { Authorization: `Bearer ${LAWFIVE_KEY}` },
        });
        if (res.status === 429) {
            await new Promise((done) => setTimeout(done, Number(res.headers.get("retry-after")) * 1000));
            continue;
        }
        if (!res.ok) throw new Error(`changes: ${res.status} ${(await res.json()).error}`);
        const page = await res.json();
        for (const { collection, record } of page.changes) {
            const key = `${collection}/${record.id}`;
            if (record.deletedAt) copy.delete(key);
            else copy.set(key, record);
        }
        cursor = page.cursor;
        more = page.more;
    }
}

await syncOnce();
```

Run `syncOnce` on a timer, or when a webhook says something changed. A record changed several times appears once, as it is now. Tracks and photos aren't in this feed: a match report's track has its own endpoints.
