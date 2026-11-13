# Read matches with their venues and officials

List someone's upcoming matches, with the names a match only refers to by id. The key needs `matches:read`, `venues:read` and `referees:read`.

A match holds ids rather than copies: `venueId` points to a venue, `pitchId` to one of that venue's pitches, and each `crew` member has either a `refereeId` or a typed `name`. Both can be missing, so check.

```js
const LAWFIVE_URL = process.env.LAWFIVE_URL; // https://api.lawfive.app, or the person's own server
const LAWFIVE_KEY = process.env.LAWFIVE_KEY; // lf_...

async function get(path) {
    const res = await fetch(`${LAWFIVE_URL}${path}`, { headers: { Authorization: `Bearer ${LAWFIVE_KEY}` } });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.json()).error}`);
    return res.json();
}

const [{ items: matches }, { items: venues }, { items: referees }] = await Promise.all([
    get("/v1/matches"), get("/v1/venues"), get("/v1/referees"),
]);
const venueById = new Map(venues.map((v) => [v.id, v]));
const refereeById = new Map(referees.map((r) => [r.id, r]));

const upcoming = matches
    .filter((m) => m.status === "scheduled" && m.kickoff && new Date(m.kickoff) > new Date())
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))
    .map((m) => ({
        id: m.id,
        title: m.name ?? `${m.home.name ?? "Home"} v ${m.away.name ?? "Away"}`,
        kickoff: m.kickoff,
        venue: venueById.get(m.venueId)?.name,
        crew: m.crew.map((c) => ({ role: c.role, name: refereeById.get(c.refereeId)?.name ?? c.name })),
    }));
```

The list leaves out deleted records. `kickoff` is optional, and it carries its own UTC offset, so keep that offset when showing the time. A key without one of those scopes gets `403`, and the error says which it needs.
