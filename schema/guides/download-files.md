# Download a record's files

Fetch the files on a venue, a competition or a match (a parking map, the league's rules, a team sheet), with their names. The key needs read access to the record's collection: `venues:read` for a venue's files, `competitions:read` for a competition's, `matches:read` for a match's.

`GET /v1/attachments` with `kind=file` lists the files (without it, a record's photos come back, as servers had before files). Each file's `url` gives the file itself, with the same key. Every file but a photo comes as a download, with its name in `Content-Disposition`; the `name` in the list is the same name, ending in what the file really is.

```js
const LAWFIVE_URL = process.env.LAWFIVE_URL; // https://api.lawfive.app, or the person's own server
const LAWFIVE_KEY = process.env.LAWFIVE_KEY; // lf_...
const headers = { Authorization: `Bearer ${LAWFIVE_KEY}` };

/** The files on a record ("venue", "competition" or "match"), each with its bytes. */
async function filesOf(recordType, recordId) {
    const res = await fetch(`${LAWFIVE_URL}/v1/attachments?recordType=${recordType}&recordId=${recordId}&kind=file`, { headers });
    if (!res.ok) throw new Error(`${recordType} ${recordId}: ${res.status} ${(await res.json()).error}`);
    const { attachments } = await res.json();
    return Promise.all(attachments.map(async (file) => {
        const got = await fetch(`${LAWFIVE_URL}${file.url}`, { headers });
        if (!got.ok) throw new Error(`${file.name}: ${got.status}`);
        return { name: file.name, type: file.contentType, size: file.size, bytes: new Uint8Array(await got.arrayBuffer()) };
    }));
}
```

Save each under its `name`. A file at a `url` never changes, so one already saved can be kept; a replaced file gets a new `url`. Webhooks on the record's topic say when files are added, renamed or deleted (`attachment.created`, `attachment.updated`, `attachment.deleted`).
