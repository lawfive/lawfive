# Save a record safely

Create, change and delete a match without overwriting a change made elsewhere, such as on the person's watch. The key needs `matches:read` and `matches:write`.

You choose a new record's id, so repeating a create after a lost connection can't make a second copy. `PUT` replaces the whole record, so read it first and send every field back, not only the ones you changed. Every record has a `version`: send the one you last saw, and the server answers `409` with the record as it is now if it has changed since. The `format` block holds every setting a match's format needs.

```js
const LAWFIVE_URL = process.env.LAWFIVE_URL;
const LAWFIVE_KEY = process.env.LAWFIVE_KEY;

async function call(method, path, body) {
    const res = await fetch(`${LAWFIVE_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${LAWFIVE_KEY}`, "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
}

// Create: no version. 201 means it's new.
const id = crypto.randomUUID();
const created = await call("PUT", `/v1/matches/${id}`, {
    status: "scheduled",
    kickoff: "2030-03-09T10:00:00-08:00",
    timeZone: "America/Los_Angeles",
    home: { name: "Strikers" },
    away: { name: "Rovers" },
    crew: [],
    format: {
        periods: 2, periodSec: 2700, breakSec: 900, halfwayBreak: false, halfwayBreakSec: 120,
        teamSize: 11, clock: "up", trackStoppage: false, breakStoppage: true,
        goalScorers: true, goalTypes: false, extraTime: false, extraTimePeriods: 2, extraTimePeriodSec: 900, penalties: false,
    },
});
if (created.status === 400) throw new Error(JSON.stringify(created.body.issues));

// Update: apply your change to the latest record and send its version. If someone got there first,
// apply it again to the record the 409 hands back. The server sets updatedAt, so leave it out.
async function update(id, change) {
    let { body: latest } = await call("GET", `/v1/matches/${id}`);
    for (let tries = 0; tries < 3; tries++) {
        const { updatedAt, deletedAt, ...fields } = latest;
        const saved = await call("PUT", `/v1/matches/${id}`, change(fields));
        if (saved.status !== 409) return saved;
        if (!saved.body.current) throw new Error(saved.body.error);
        latest = saved.body.current;
    }
    throw new Error("It keeps changing; try again later");
}
const updated = await update(id, (match) => ({ ...match, notes: "Bring spare flags." }));

// Delete: it stays as a marker with deletedAt, so other devices hear of it.
const deleted = await call("DELETE", `/v1/matches/${id}?version=${updated.body.version}`);
```

A `400` lists what's wrong in `issues`. A `409` with no `current` means the id belongs to another kind of record, or the save would duplicate another, such as a second match with the same `external` id. Saving a deleted record brings it back.
