import { PGlite } from "@electric-sql/pglite";
import { type Match, defaultFormat, suggestAliases } from "@lawfive/schema";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, describe, test } from "node:test";
import { migrationsFolder, tables } from "../src/db/index.ts";
import { toWatchMatch } from "../src/watch.ts";

// SET-5 (2026-11-11): one rule for a team's short name, so the watch's download shows what the website
// and phones do; and the cleanup that ships with it (drizzle/0024), which removes the short names the
// website's form used to store, so those matches' short names follow their names.

const cleanup = readFileSync(new URL("../drizzle/0024_short_names_follow_names.sql", import.meta.url), "utf8");
const pg = new PGlite();
const db = drizzle(pg, { schema: tables });

before(() => migrate(db, { migrationsFolder }));

const match = (home: Match["home"], away: Match["away"]): Match => ({
    id: randomUUID(), version: 1, updatedAt: "2026-11-11T00:00:00Z", status: "scheduled", format: defaultFormat, home, away, crew: [],
} as Match);

describe("the watch's download", () => {
    test("short names from both names when none was typed", () => {
        const assignor = toWatchMatch(match({ name: "L84-HENDERSON_M" }, { name: "L84-DE ANGELIS_K" }));
        assert.deepEqual([assignor.home, assignor.away, assignor.title], ["HEN", "DEA", "HEN v DEA"]);
        const typed = toWatchMatch(match({ name: "Strikers", alias: "SFC" }, { name: "Rovers" }));
        assert.deepEqual([typed.home, typed.away], ["SFC", "ROV"]);
        const none = toWatchMatch(match({}, {}));
        assert.deepEqual([none.home, none.away], ["HOM", "AWY"]);
    });
});

describe("the cleanup of stored short names (drizzle/0024)", () => {
    const userId = "short-names";
    type Team = { name?: string; alias?: string };
    async function insert(home: Team, away: Team, deleted = false) {
        const id = randomUUID();
        await db.insert(tables.records).values({
            userId, id, type: "match", version: 1, seq: sql`nextval('record_seq')`, updatedAt: new Date(), deletedAt: deleted ? new Date() : null,
            data: { status: "scheduled", home, away, crew: [] },
        });
        return id;
    }
    const rows = async () => Object.fromEntries((await db.select().from(tables.records).where(eq(tables.records.userId, userId)))
        .map((r) => [r.id, { version: r.version, seq: r.seq, home: (r.data.home as Team).alias, away: (r.data.away as Team).alias, names: [(r.data.home as Team).name, (r.data.away as Team).name] }]));

    test("removes the short names a form or a watch made, and keeps the typed ones", async () => {
        await db.insert(tables.user).values({ id: userId, name: userId, email: `${userId}@example.com` });
        const ids = {
            // The website's suggestions for the names as they are: the pair rule, and the plain one.
            pair: await insert({ name: "L84_Roach", alias: "ROA" }, { name: "L84_Smith", alias: "SMI" }),
            plain: await insert({ name: "L84_Roach", alias: "L84" }, { name: "L84_Smith", alias: "L84" }),
            assignor: await insert({ name: "Strikers U12", alias: "U12" }, { name: "Strikers U14", alias: "U14" }),
            // Saved as Home Team v Away Team, the names changed since by a calendar.
            placeholders: await insert({ name: "Strikers", alias: "HOM" }, { name: "Rangers", alias: "AWA" }),
            quickMatch: await insert({ alias: "HOM" }, { alias: "AWY" }),
            // Typed: kept, and a side with one typed and one made loses only the made one.
            typed: await insert({ name: "Strikers", alias: "SFC" }, { name: "Rovers", alias: "RVR" }),
            oneTyped: await insert({ name: "Strikers", alias: "SFC" }, { name: "Rovers", alias: "ROV" }),
            // Made for names that changed since: indistinguishable from typed, so kept.
            oldNames: await insert({ name: "Galaxy", alias: "STR" }, { name: "United", alias: "ROV" }),
            lowerCase: await insert({ name: "Strikers", alias: "str" }, { name: "Rovers" }),
            noAliases: await insert({ name: "Strikers" }, { name: "Rovers" }),
            deleted: await insert({ name: "Strikers", alias: "STR" }, { name: "Rovers", alias: "ROV" }, true),
        };
        // Every shared case (schema/short-names.json) with names, stored as the form stored it.
        const { cases } = JSON.parse(readFileSync(new URL("../../schema/short-names.json", import.meta.url), "utf8")) as { cases: { name: string; home: Team; away: Team }[] };
        const shared = [];
        for (const c of cases.filter((x) => !x.home.alias && !x.away.alias && (x.home.name || x.away.name))) {
            const s = suggestAliases(c.home.name, c.away.name);
            shared.push({ name: c.name, id: await insert({ ...c.home, ...(s.home ? { alias: s.home } : {}) }, { ...c.away, ...(s.away ? { alias: s.away } : {}) }) });
        }
        const before = await rows();
        const [{ last }] = (await db.execute(sql`select last_value::bigint as last from record_seq`)).rows as { last: number }[];

        await pg.exec(cleanup);

        const after = await rows();
        for (const id of [ids.pair, ids.plain, ids.assignor, ids.placeholders, ids.quickMatch]) {
            assert.deepEqual([after[id].home, after[id].away], [undefined, undefined], JSON.stringify(before[id]));
            assert.equal(after[id].version, before[id].version + 1, "a new version");
            assert.ok(after[id].seq > Number(last), "and a new sync number, so phones hear of it");
            assert.deepEqual(after[id].names, before[id].names, "the names stay");
        }
        assert.deepEqual([after[ids.oneTyped].home, after[ids.oneTyped].away], ["SFC", undefined]);
        for (const id of [ids.typed, ids.oldNames, ids.lowerCase, ids.noAliases, ids.deleted]) {
            assert.deepEqual(after[id], before[id], "left as it was");
        }
        for (const { name, id } of shared) {
            assert.deepEqual([after[id].home, after[id].away], [undefined, undefined], `${name}: ${JSON.stringify(before[id])}`);
        }

        // Run again (it's in a migration, so it runs once; but if it ran again), it changes nothing.
        await pg.exec(cleanup);
        assert.deepEqual(await rows(), after);
    });

    test("ran once when the server updated: migrations record it", async () => {
        const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { tag: string }[] };
        assert.ok(journal.entries.some((e) => e.tag === "0024_short_names_follow_names"));
    });
});
