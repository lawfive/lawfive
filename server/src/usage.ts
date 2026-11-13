import { count, eq, sql } from "drizzle-orm";
import { type Db, tables } from "./db/index.ts";

// SEC-6: how much of the server an account takes up. Only photos and tracks a person adds count:
// a match recorded on a watch, and its track, are never refused, as they can't be recorded again.

/** Far more than anyone refereeing could make; it stops a script filling the database. */
export const maxRecords = 50_000;

/** How much an account may keep, from its plan (PLAN-2), in bytes; none means no limit. */
export type StorageLimit = (userId: string) => Promise<number | undefined>;

export async function filesUsed(db: Db, userId: string): Promise<number> {
    const { attachment, matchTrack } = tables;
    const [photos] = await db.select({ bytes: sql<number>`coalesce(sum(${attachment.size}), 0)::bigint` }).from(attachment).where(eq(attachment.userId, userId));
    const [tracks] = await db.select({ bytes: sql<number>`coalesce(sum(octet_length(${matchTrack.data})), 0)::bigint` }).from(matchTrack).where(eq(matchTrack.userId, userId));
    return Number(photos.bytes) + Number(tracks.bytes);
}

/** Whether `adding` more bytes fits, in words to show if it doesn't. */
export async function noRoomFor(db: Db, userId: string, adding: number, limit: StorageLimit | undefined): Promise<string | undefined> {
    const most = await limit?.(userId);
    if (most === undefined || (await filesUsed(db, userId)) + adding <= most) {
        return undefined;
    }
    return "Your account's storage is full. Delete some photos or tracks, or ask an admin of this server for a plan with more room.";
}

/** Whether a limit is set and the account already has more records than anyone should. */
export async function tooManyRecords(db: Db, userId: string, limit: StorageLimit | undefined): Promise<boolean> {
    if (await limit?.(userId) === undefined) {
        return false;
    }
    const [row] = await db.select({ n: count() }).from(tables.records).where(eq(tables.records.userId, userId));
    return row.n >= maxRecords;
}
