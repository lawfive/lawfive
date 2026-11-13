import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as tables from "./tables.ts";

/** The database, whichever driver is behind it: postgres.js in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof tables>;

export const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

export { tables };
