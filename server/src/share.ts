import { Id, type Match, type MatchRecord, type SharedMatch, type UserSettings, type Venue } from "@lawfive/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import type { z } from "zod";
import { type Db, tables } from "./db/index.ts";
import { onRecordWrite, toRecord } from "./records.ts";
import { trackView } from "./tracks.ts";

// Share links (DATA-7): a match's public page, at an address nobody can guess, off until the owner
// turns it on. It shows the match, its log and its track, and never the notes, fee, crew,
// contacts, player names or photos. schema/src/endpoints.ts describes the endpoints.
//
//   GET    /v1/matches/:id/share     its link (signed in)
//   POST   /v1/matches/:id/share     make it, or a new one in place of the old
//   DELETE /v1/matches/:id/share     stop sharing
//   GET    /v1/shared/:token         the match, for its public page (no sign-in)
//   GET    /v1/shared/:token/track   its track and figures

type Shared = z.infer<typeof SharedMatch>;

/**
 * What a public page may show of a match, field by field (SEC-10): a field added to matches later stays
 * private until it's added here. Never the notes, outlook, fee, tags, match number, assignor, crew or
 * the ids of its venue, pitch, competition and template.
 */
function publicMatch(match: Match): Match {
    const { id, version, updatedAt, name, status, kickoff, timeZone, format, home, away, gender, ageGroup, role, pitchMarking } = match;
    return {
        id, version, updatedAt, status, format, home, away, crew: [],
        ...(name !== undefined ? { name } : {}), ...(kickoff !== undefined ? { kickoff } : {}), ...(timeZone !== undefined ? { timeZone } : {}),
        ...(gender !== undefined ? { gender } : {}), ...(ageGroup !== undefined ? { ageGroup } : {}), ...(role !== undefined ? { role } : {}),
        ...(pitchMarking !== undefined ? { pitchMarking } : {}),
    };
}

function publicRecord(record: MatchRecord): MatchRecord {
    const { diagnostics, ...rest } = record;
    return {
        ...rest,
        events: rest.events.map((e) => {
            const { note, ...event } = e as typeof e & { note?: string };
            if ("offender" in event && event.offender.kind === "teamOfficial") {
                const { name, ...offender } = event.offender;
                return { ...event, offender } as typeof e;
            }
            return event as typeof e;
        }),
    };
}

const noindex = { "x-robots-tag": "noindex, nofollow" };

export function sharedMatchApi(db: Db) {
    const { matchShare, records, user } = tables;
    const api = new Hono();

    /** The share's owner and match, unless the link is unknown or the owner suspended. */
    async function find(token: string) {
        const [share] = /^[\w-]{20,100}$/.test(token) ? await db.select().from(matchShare).where(eq(matchShare.token, token)) : [];
        if (!share) {
            return { error: 404 as const };
        }
        const [owner] = await db.select({ status: user.status }).from(user).where(eq(user.id, share.userId));
        if (owner?.status === "suspended") {
            return { error: 403 as const };
        }
        const [row] = await db.select().from(records)
            .where(and(eq(records.userId, share.userId), eq(records.type, "match"), eq(records.id, share.matchId), isNull(records.deletedAt)));
        if (!row) {
            return { error: 404 as const };
        }
        const [report] = await db.select().from(records)
            .where(and(eq(records.userId, share.userId), eq(records.type, "matchRecord"), isNull(records.deletedAt), sql`${records.data}->>'matchId' = ${share.matchId}`))
            .orderBy(sql`${records.updatedAt} desc`).limit(1);
        return { share, match: toRecord(row) as Match, report: report && (toRecord(report) as MatchRecord) };
    }
    const missing = (c: { json: (body: unknown, status: 403 | 404, headers: Record<string, string>) => Response }, error: 403 | 404) =>
        c.json({ error: error === 403 ? "this match's account is suspended" : "no match has this link: it was replaced or turned off" }, error, noindex);

    api.get("/shared/:token", async (c) => {
        const found = await find(c.req.param("token"));
        if (found.error) {
            return missing(c, found.error);
        }
        const { share, match, report } = found;
        const byId = async (type: string, id?: string) => {
            const [row] = id ? await db.select().from(records).where(and(eq(records.userId, share.userId), eq(records.type, type), eq(records.id, id))) : [];
            return row?.data as Record<string, unknown> | undefined;
        };
        const venue = await byId("venue", match.venueId) as Venue | undefined;
        const competition = await byId("competition", match.competitionId);
        const [settings] = await db.select().from(records)
            .where(and(eq(records.userId, share.userId), eq(records.type, "settings"), isNull(records.deletedAt)));
        const [track] = report ? await db.select({ id: tables.matchTrack.matchRecordId }).from(tables.matchTrack)
            .where(and(eq(tables.matchTrack.userId, share.userId), eq(tables.matchTrack.matchRecordId, report.id))) : [];
        const body: Shared = {
            match: publicMatch(match),
            ...(report ? { record: publicRecord(report) } : {}),
            ...(competition?.name ? { competition: competition.name as string } : {}),
            ...(venue?.name ? { venue: venue.name } : {}),
            ...(venue && match.pitchId ? { pitch: venue.pitches.find((p) => p.id === match.pitchId)?.name } : {}),
            distanceUnit: (settings?.data as Partial<UserSettings> | undefined)?.distanceUnit ?? "km",
            track: Boolean(track),
        };
        if (body.pitch === undefined) {
            delete body.pitch;
        }
        return c.json(body, 200, { ...noindex, "cache-control": "private, max-age=60" });
    });

    api.get("/shared/:token/track", async (c) => {
        const found = await find(c.req.param("token"));
        if (found.error) {
            return missing(c, found.error);
        }
        const view = found.report && await trackView(db, found.share.userId, found.report.id);
        return view ? c.json(view, 200, noindex) : c.json({ error: "this match has no track" }, 404, noindex);
    });

    return api;
}

export function shareApi(db: Db, publicUrl: string) {
    const { matchShare, records } = tables;
    const api = new Hono<{ Variables: { userId: string } }>();
    const out = (row: typeof matchShare.$inferSelect) => ({ url: `${publicUrl}/s/${row.token}`, createdAt: row.createdAt.toISOString() });

    // A deleted match's link goes with it.
    onRecordWrite(db, (write) => {
        if (write.type === "match" && write.action === "deleted") {
            void db.delete(matchShare).where(and(eq(matchShare.userId, write.userId), eq(matchShare.matchId, write.row.id)))
                .catch((e) => console.error("share", e));
        }
    });

    api.get("/matches/:id/share", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const [row] = id.success ? await db.select().from(matchShare).where(and(eq(matchShare.userId, c.var.userId), eq(matchShare.matchId, id.data))) : [];
        return row ? c.json(out(row)) : c.json({ error: "this match isn't shared" }, 404);
    });

    api.post("/matches/:id/share", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const [match] = id.success ? await db.select({ id: records.id }).from(records)
            .where(and(eq(records.userId, c.var.userId), eq(records.type, "match"), eq(records.id, id.data), isNull(records.deletedAt))) : [];
        if (!match || !id.success) {
            return c.json({ error: "no such match" }, 404);
        }
        const values = { token: randomBytes(24).toString("base64url"), userId: c.var.userId, matchId: id.data, createdAt: new Date() };
        const [row] = await db.insert(matchShare).values(values)
            .onConflictDoUpdate({ target: [matchShare.userId, matchShare.matchId], set: { token: values.token, createdAt: values.createdAt } }).returning();
        return c.json(out(row), 201);
    });

    api.delete("/matches/:id/share", async (c) => {
        const id = Id.safeParse(c.req.param("id"));
        const removed = id.success ? await db.delete(matchShare).where(and(eq(matchShare.userId, c.var.userId), eq(matchShare.matchId, id.data))).returning() : [];
        return removed.length ? c.json({ ok: true as const }) : c.json({ error: "this match isn't shared" }, 404);
    });

    return api;
}
