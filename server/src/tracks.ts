import { Id, type Match, MatchRecord, MatchTrack, PitchOutline, UserSettings, type Venue, type PitchContext, markedCorners, pitchFrame, pitchHeat, pitchTurned, summarizeTrack, trackPitch } from "@lawfive/schema";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { gunzipSync, gzipSync } from "node:zlib";
import { type Db, tables } from "./db/index.ts";
import { type StorageLimit, noRoomFor } from "./usage.ts";

// Tracks (TRK-1 to TRK-3): GPS and heart rate for a match report, stored gzipped beside it.
// schema/src/endpoints.ts describes the endpoints.
//
//   GET    /v1/match-records/:id/track   the track and its figures
//   PUT    /v1/match-records/:id/track   upload it (replacing any it had)
//   DELETE /v1/match-records/:id/track   delete it
//   PUT    /v1/match-records/:id/track/pitch   mark where the pitch is (TRK-9)
//   DELETE /v1/match-records/:id/track/pitch   forget it, back to the one found from the track
//
// The figures are worked out on every GET, so they follow the match report's period times, the
// maximum heart rate and sprint speed in Settings, and any better maths, without anything stored going stale.

/** Stores a match report's track, replacing any it had. */
export async function saveTrack(db: Db, userId: string, matchRecordId: string, track: MatchTrack): Promise<Date> {
    const { matchTrack } = tables;
    const row = { userId, matchRecordId, source: track.source.kind, data: gzipSync(JSON.stringify(track)), updatedAt: new Date() };
    await db.insert(matchTrack).values(row)
        .onConflictDoUpdate({ target: [matchTrack.userId, matchTrack.matchRecordId], set: { source: row.source, data: row.data, updatedAt: row.updatedAt } });
    return row.updatedAt;
}

/** The match report's periods and the user's maximum heart rate and sprint speed, which the figures need. */
async function figuresFor(db: Db, userId: string, matchRecordId: string, track: MatchTrack) {
    const periods = await periodsOf(db, userId, matchRecordId);
    const [settings] = await db.select().from(tables.records)
        .where(and(eq(tables.records.userId, userId), eq(tables.records.type, "settings"), isNull(tables.records.deletedAt)));
    const { maxHeartRate, sprintKph } = (settings?.data as Partial<UserSettings> | undefined) ?? {};
    return summarizeTrack(track, periods, maxHeartRate, sprintKph);
}

async function periodsOf(db: Db, userId: string, matchRecordId: string) {
    const [record] = await db.select().from(tables.records)
        .where(and(eq(tables.records.userId, userId), eq(tables.records.id, matchRecordId), eq(tables.records.type, "matchRecord")));
    return (record?.data as Partial<MatchRecord> | undefined)?.periods;
}

/** TRK-9: what finding the pitch needs beyond the track: the user's role in the match, its pitch's pin at the venue, and corners marked on the watch (TRK-13). */
async function pitchContextOf(db: Db, userId: string, matchRecordId: string): Promise<PitchContext> {
    const [record] = await db.select().from(tables.records)
        .where(and(eq(tables.records.userId, userId), eq(tables.records.id, matchRecordId), eq(tables.records.type, "matchRecord")));
    const matchId = (record?.data as Partial<MatchRecord> | undefined)?.matchId;
    const [match] = matchId ? await db.select().from(tables.records).where(and(eq(tables.records.userId, userId), eq(tables.records.id, matchId))) : [];
    const m = match?.data as Partial<Match> | undefined;
    const [venue] = m?.venueId ? await db.select().from(tables.records).where(and(eq(tables.records.userId, userId), eq(tables.records.id, m.venueId))) : [];
    const v = venue?.data as Venue | undefined;
    const pin = v?.pitches?.find((p) => p.id === m?.pitchId)?.position;
    // TRK-13: corners walked on the watch that apply to this match.
    const corners = m && markedCorners(m as Match, v);
    return { ...(m?.role ? { role: m.role } : {}), ...(pin ? { pin } : {}), ...(corners ? { corners } : {}) };
}

/** A match report's track with its figures and pitch, as GET /v1/match-records/:id/track and a shared match (DATA-7) give it. */
export async function trackView(db: Db, userId: string, matchRecordId: string) {
    const [row] = await db.select().from(tables.matchTrack)
        .where(and(eq(tables.matchTrack.userId, userId), eq(tables.matchTrack.matchRecordId, matchRecordId)));
    if (!row) {
        return undefined;
    }
    const track = JSON.parse(gunzipSync(row.data).toString("utf8")) as MatchTrack;
    // TRK-9: the pitch it has, or one found from where the user went.
    const periods = await periodsOf(db, userId, matchRecordId);
    const context = await pitchContextOf(db, userId, matchRecordId);
    const pitch = trackPitch(track, periods, context);
    // The heatmap's grid, turned as the match page turns it, for the phone apps.
    const [record] = await db.select().from(tables.records)
        .where(and(eq(tables.records.userId, userId), eq(tables.records.id, matchRecordId), eq(tables.records.type, "matchRecord")));
    const direction = (record?.data as Partial<MatchRecord> | undefined)?.kickoffDirection;
    const grid = pitch && context.role !== "fourth" ? pitchHeat(track, periods ?? [], pitch, pitchTurned(pitch, track, periods ?? [], context.role, direction)) : undefined;
    const frame = pitch && pitchFrame(pitch);
    const heat = grid && frame ? { ...grid, lengthM: Math.round(frame.lengthM * 10) / 10, widthM: Math.round(frame.widthM * 10) / 10 } : undefined;
    return { track, summary: await figuresFor(db, userId, matchRecordId, track), ...(pitch ? { pitch } : {}), ...(heat ? { heat } : {}), updatedAt: row.updatedAt.toISOString() };
}

export function tracksApi(db: Db, storageLimit?: StorageLimit) {
    const api = new Hono<{ Variables: { userId: string } }>();
    const { matchTrack, records } = tables;
    const byId = (userId: string, id: string) => and(eq(matchTrack.userId, userId), eq(matchTrack.matchRecordId, id));

    async function load(userId: string, matchRecordId: string) {
        const [row] = await db.select().from(matchTrack).where(byId(userId, matchRecordId));
        return row && { row, track: JSON.parse(gunzipSync(row.data).toString("utf8")) as MatchTrack };
    }

    api.get("/match-records/:id/track", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const view = id.success ? await trackView(db, c.var.userId, id.data) : undefined;
        return view ? c.json(view) : c.json({ error: "no track for this match report" }, 404);
    });

    api.put("/match-records/:id/track", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        if (!id.success) {
            return c.json({ error: "no such match report" }, 404);
        }
        const userId = c.var.userId;
        const [record] = await db.select({ id: records.id }).from(records)
            .where(and(eq(records.userId, userId), eq(records.id, id.data), eq(records.type, "matchRecord")));
        if (!record) {
            return c.json({ error: "no such match report; save it first" }, 404);
        }
        const body = MatchTrack.safeParse(await c.req.json().catch(() => undefined));
        if (!body.success) {
            return c.json({ error: "invalid track", issues: body.error.issues }, 400);
        }
        const track = body.data;
        const full = await noRoomFor(db, userId, 0, storageLimit);
        if (full) {
            return c.json({ error: full }, 409);
        }
        const [existing] = await db.select({ userId: matchTrack.userId }).from(matchTrack).where(byId(userId, id.data));
        const updatedAt = await saveTrack(db, userId, id.data, track);
        return c.json({ summary: await figuresFor(db, userId, id.data, track), updatedAt: updatedAt.toISOString() }, existing ? 200 : 201);
    });

    // TRK-9: where the pitch is, marked by the referee on the match page.
    api.put("/match-records/:id/track/pitch", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const found = id.success ? await load(c.var.userId, id.data) : undefined;
        if (!found || !id.success) {
            return c.json({ error: "no track for this match report" }, 404);
        }
        const body = PitchOutline.safeParse({ ...(await c.req.json().catch(() => ({}))), by: "referee" });
        if (!body.success) {
            return c.json({ error: "invalid pitch", issues: body.error.issues }, 400);
        }
        const track = { ...found.track, pitch: body.data };
        const updatedAt = await saveTrack(db, c.var.userId, id.data, track);
        return c.json({ pitch: body.data, updatedAt: updatedAt.toISOString() });
    });

    api.delete("/match-records/:id/track/pitch", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const found = id.success ? await load(c.var.userId, id.data) : undefined;
        if (!found || !id.success) {
            return c.json({ error: "no track for this match report" }, 404);
        }
        const { pitch: _, ...track } = found.track;
        const updatedAt = await saveTrack(db, c.var.userId, id.data, track);
        const pitch = trackPitch(track, await periodsOf(db, c.var.userId, id.data), await pitchContextOf(db, c.var.userId, id.data));
        return c.json({ ...(pitch ? { pitch } : {}), updatedAt: updatedAt.toISOString() });
    });

    api.delete("/match-records/:id/track", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const deleted = id.success ? await db.delete(matchTrack).where(byId(c.var.userId, id.data)).returning({ id: matchTrack.matchRecordId }) : [];
        return deleted.length ? c.json({ ok: true as const }) : c.json({ error: "no track for this match report" }, 404);
    });

    return api;
}
