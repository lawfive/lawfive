import { sql } from "drizzle-orm";
import type { MatchWeather } from "@lawfive/schema";
import { bigint, boolean, customType, doublePrecision, index, integer, jsonb, pgSequence, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Hourly } from "../weather/openMeteo.ts";

// The database. After changing this file run `pnpm db:generate` to add a migration in drizzle/.

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// Accounts: the tables Better Auth needs (src/auth.ts).

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt,
    updatedAt,
    // USR-1: "admin" or "user" (ADMIN_EMAILS also makes admins, without changing this).
    role: text("role").notNull().default("user"),
    // USR-4: "active", or "pending" until an admin approves the account.
    status: text("status").notNull().default("active"),
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
    // SEC-13: "watch" for a watch's link (a device code), which only reaches the watch's endpoints.
    scope: text("scope"),
}, (t) => [index("session_user_id").on(t.userId)]);

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
}, (t) => [index("account_user_id").on(t.userId)]);

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
}, (t) => [index("verification_identifier").on(t.identifier)]);

// Watch linking (Better Auth's device authorization): a code shown on the watch, approved on the website.
export const deviceCode = pgTable("device_code", {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull().unique(),
    userCode: text("user_code").notNull().unique(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
});

// A code that signs a phone in (APP-13): shown by the web app, used once, gone in two minutes.
export const appSignIn = pgTable("app_sign_in", {
    id: uuid("id").primaryKey(),
    code: text("code").notNull().unique(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    deviceName: text("device_name"),
});

// SEC-12: wrong passwords per email address, account or not, and how long it's locked for.
export const signInLock = pgTable("sign_in_lock", {
    email: text("email").primaryKey(),
    failures: integer("failures").notNull(),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** When the account's owner was last told it locked, so it's at most once a day. */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

// What each signed-in session is (a Garmin watch, say), for the Devices list. Apps send an
// X-LawFive-Device header; browsers are named from their user agent instead.
export const device = pgTable("device", {
    sessionId: text("session_id").primaryKey().references(() => session.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    /** What the app says it runs on: a Garmin part number ("006-B3703-00"), and its firmware. */
    model: text("model"),
    firmware: text("firmware"),
    /** The app's own version (VER-3), "2026.10.30". */
    appVersion: text("app_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    /** PUSH-4: how to reach this phone through the push relay, which only the relay can read. */
    pushHandle: text("push_handle"),
});

// SYNC-14: the matches in each watch's latest download of its next matches (GET /v1/watch/matches),
// which replaces what it had. Gone with the watch's link. The fingerprint is of the match as the watch
// shows it, so a change to it (or to its venue or a referee's name) shows the watch has an older version.
export const watchCopy = pgTable("watch_copy", {
    sessionId: text("session_id").notNull().references(() => session.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    /** When the watch first got the match as the fingerprint has it. */
    since: timestamp("since", { withTimezone: true }).notNull(),
    /** Its latest download that had the match. */
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.sessionId, t.matchId] }), index("watch_copy_user").on(t.userId)]);

// API keys for scripts and integrations (KEY-1): only a hash of each key is kept, so a database
// leak doesn't hand out working keys. The prefix is its first characters, to recognise it by.
export const apiKey = pgTable("api_key", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** NOTE-1: tell the user's phones when this key adds or changes matches. */
    notify: boolean("notify").notNull().default(false),
}, (t) => [index("api_key_user").on(t.userId)]);

// Invitations (USR-3): a link that makes an account even when sign-up is closed, once, for 14
// days. The token is kept so an admin can copy the link again.
export const invite = pgTable("invite", {
    id: uuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    email: text("email"),
    name: text("name"),
    createdById: text("created_by_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedById: text("used_by_id").references(() => user.id, { onDelete: "set null" }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    /** PLAN-5: the plan the account joins, for how many days (then the default); none: the default. */
    planId: uuid("plan_id").references(() => plan.id, { onDelete: "set null" }),
    planDays: integer("plan_days"),
});

// Plans (PLAN-1 to PLAN-5): named sets of limits (schema's PlanLimits). Exactly one is the default,
// which accounts without a row in account_plan are in. Referred to by id, so a code can change.
export const plan = pgTable("plan", {
    id: uuid("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    limits: jsonb("limits").notNull().$type<Record<string, number>>(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt,
}, (t) => [uniqueIndex("plan_default").on(t.isDefault).where(sql`${t.isDefault}`)]);

// An account's plan when it isn't simply the default: since when, until when (the end of endsOn in
// the account's time zone, PLAN-9), and the plan after (the default when none).
export const accountPlan = pgTable("account_plan", {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").notNull().references(() => plan.id),
    since: timestamp("since", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    endsOn: text("ends_on"),
    thenPlanId: uuid("then_plan_id").references(() => plan.id),
    /** PLAN-6: the last reminder emailed about its end, in days before it (7, then 1). */
    reminded: integer("reminded"),
}, (t) => [index("account_plan_ends").on(t.endsAt)]);

// Each change of an account's plan (PLAN-5), with the plans' names then, so it outlives them.
export const planChange = pgTable("plan_change", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    fromCode: text("from_code"),
    fromName: text("from_name"),
    toCode: text("to_code").notNull(),
    toName: text("to_name").notNull(),
    /** sign-up, invite, admin or ended. */
    reason: text("reason").notNull(),
    byName: text("by_name"),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    at: timestamp("at", { withTimezone: true }).notNull(),
}, (t) => [index("plan_change_user").on(t.userId, t.at)]);

// Settings for the whole server that admins change in the web app (USR-7), by name: signUp
// overrides SIGN_UP once set.
export const serverSetting = pgTable("server_setting", {
    key: text("key").primaryKey(),
    value: jsonb("value").notNull(),
    updatedAt,
});

// The calendar feed (CAL-1): one private address per user, the token in it being the only key.
export const calendarFeed = pgTable("calendar_feed", {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
});

// The user's data: every record type from schema/ (matches, venues...) in one table, as the
// validated JSON document plus the fields sync needs. Each write takes the next number from
// record_seq, so a device asks for "everything after the last number I saw" (GET /v1/changes).

export const recordSeq = pgSequence("record_seq");

export const records = pgTable("records", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    id: uuid("id").notNull(),
    type: text("type").notNull(),
    version: integer("version").notNull(),
    seq: bigint("seq", { mode: "number" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    data: jsonb("data").notNull().$type<Record<string, unknown>>(),
}, (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    index("records_changes").on(t.userId, t.seq),
    index("records_type").on(t.userId, t.type),
    // A match's external ID is unique per user and source (A-11).
    uniqueIndex("records_external")
        .on(t.userId, sql`(${t.data}->'external'->>'source')`, sql`(${t.data}->'external'->>'id')`)
        .where(sql`${t.type} = 'match' and ${t.deletedAt} is null and ${t.data} ? 'external'`),
    // One settings record per user.
    uniqueIndex("records_settings").on(t.userId).where(sql`${t.type} = 'settings' and ${t.deletedAt} is null`),
]);

/** Binary data. Both drivers (postgres.js, PGlite) take and give bytes. */
const bytes = customType<{ data: Buffer; driverData: Uint8Array }>({
    dataType: () => "bytea",
    fromDriver: (value) => Buffer.from(value),
});

// Tracks (TRK-1): GPS and heart rate for a match report, as gzipped JSON (about 40 KB a match).
// Not in records: a track is big and only the match page reads it, so it isn't synced. It
// belongs to the match report with the same id, and stays if only that's deleted (it can come back);
// deleting the match deletes it (RES-8).
export const matchTrack = pgTable("match_track", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    matchRecordId: uuid("match_record_id").notNull(),
    source: text("source").notNull(),
    data: bytes("data").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.matchRecordId] })]);

// A track the watch recorded (TRK-7), arriving a chunk at a time after its match; the chunks
// become the match report's track once they're all in, and are deleted.
export const watchTrackChunk = pgTable("watch_track_chunk", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    created: bigint("created", { mode: "number" }).notNull(),
    index: integer("index").notNull(),
    count: integer("count").notNull(),
    start: bigint("start", { mode: "number" }).notNull(),
    device: text("device"),
    data: text("data").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.created, t.index] })]);

// Webhooks (HOOK-1 to HOOK-5): URLs that hear about changes to the user's records, and each
// delivery to them (the latest 50 kept), retried until delivered or given up on.
export const webhook = pgTable("webhook", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    topics: jsonb("topics").$type<string[]>().notNull(),
    /** Signs each delivery; kept as it is, as signing needs it. */
    secret: text("secret").notNull(),
    active: boolean("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [index("webhook_user").on(t.userId)]);

export const webhookDelivery = pgTable("webhook_delivery", {
    id: uuid("id").primaryKey(),
    webhookId: uuid("webhook_id").notNull().references(() => webhook.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull(),
    responseCode: integer("response_code"),
    error: text("error"),
    test: boolean("test").notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
}, (t) => [index("webhook_delivery_hook").on(t.webhookId, t.createdAt), index("webhook_delivery_due").on(t.status, t.nextAttemptAt)]);

// Assignor calendars (FEED-1 to FEED-10): an assignor system's private calendar link, read every 30
// minutes into the account's matches. The link is a password, so it's kept encrypted (FEED-2).
export const assignorCalendar = pgTable("assignor_calendar", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    system: text("system").notNull(),
    /** The whole link, encrypted with a key from AUTH_SECRET; and its start, to show. */
    url: text("url").notNull(),
    link: text("link").notNull(),
    notify: boolean("notify").notNull(),
    active: boolean("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    nextReadAt: timestamp("next_read_at", { withTimezone: true }).notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
    /** For asking only for what changed (If-None-Match, If-Modified-Since). */
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastResult: jsonb("last_result").$type<{ games: number; added: number; updated: number; canceled: number }>(),
    problem: text("problem"),
    /** FEED-9: reads in a row that found the link gone or not a calendar; at 3 it's paused. */
    failures: integer("failures").notNull().default(0),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    skipped: jsonb("skipped").notNull().$type<{ title: string; kickoff?: string; reason: string }[]>().default([]),
}, (t) => [index("assignor_calendar_user").on(t.userId), index("assignor_calendar_due").on(t.active, t.nextReadAt)]);

// Each event an assignor calendar has had, and the match it became (FEED-5): by the event's UID,
// kept here rather than as the match's number, which the person can see and change.
export const assignorEvent = pgTable("assignor_event", {
    calendarId: uuid("calendar_id").notNull().references(() => assignorCalendar.id, { onDelete: "cascade" }),
    uid: text("uid").notNull(),
    matchId: uuid("match_id").notNull(),
    /** The event's properties as the calendar wrote them, never shown or exported, so a system's rules written later can read it again (FEED-5). */
    raw: jsonb("raw").notNull().$type<{ name: string; params: Record<string, string>; value: string }[]>(),
    /** What it said when last read: an event that hasn't changed changes nothing (FEED-6). */
    hash: text("hash").notNull(),
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    /** FEED-7: the calendar canceled its match, so it's scheduled again if the event comes back. */
    canceled: boolean("canceled").notNull().default(false),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.calendarId, t.uid] })]);

// Share links (DATA-7): a match's public page, by a token nobody can guess.
export const matchShare = pgTable("match_share", {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("match_share_match").on(t.userId, t.matchId)]);

// Attachments (FILE-1 to FILE-5): photos on matches, venues and referees. The files themselves are
// in the file store (storage.ts), under the user's id, so an account's files can all be found.
export const attachment = pgTable("attachment", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    caption: text("caption"),
    position: integer("position").notNull(),
    /** The store's key for the file, and for its thumbnail when one was uploaded. */
    fileKey: text("file_key").notNull(),
    thumbKey: text("thumb_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (t) => [index("attachment_record").on(t.userId, t.recordType, t.recordId, t.position)]);

// Weather (WX-2): forecasts by place, in squares about 5 km across, shared by every match there
// whoever's it is; and the weather each match was played in, kept once it's over (WX-6).

export const weatherForecast = pgTable("weather_forecast", {
    cell: text("cell").primaryKey(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    hourly: jsonb("hourly").notNull().$type<Hourly>(),
});

// PUSH-5: the weather risks each person has been told about for a match, so each is told once.
export const riskAlert = pgTable("risk_alert", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    /** The kickoff they were for: a match moved to another day starts again. */
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    /** "wetField:possible" and so on. */
    told: jsonb("told").notNull().$type<string[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.matchId] })]);

export const matchWeather = pgTable("match_weather", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    matchId: uuid("match_id").notNull(),
    /** The kickoff it was worked out for: a match moved to another day gets a forecast again. */
    kickoff: timestamp("kickoff", { withTimezone: true }).notNull(),
    data: jsonb("data").notNull().$type<MatchWeather>(),
    createdAt,
}, (t) => [primaryKey({ columns: [t.userId, t.matchId] })]);

// DUP-7: what each merge replaced (a venue, a pitch combined into another, a referee), so a match
// saved later with an old id, from a phone that was offline during the merge, is corrected.
export const mergedId = pgTable("merged_id", {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    oldId: uuid("old_id").notNull(),
    /** "venue", "pitch" or "referee". */
    kind: text("kind").notNull(),
    newId: uuid("new_id").notNull(),
    /** For a pitch, the venue it's in now. */
    venueId: uuid("venue_id"),
    createdAt,
}, (t) => [primaryKey({ columns: [t.userId, t.oldId] })]);

// NOTE-2: what an API key did to a user's matches, collected for about a minute (or sent at once
// when a match kicks off within a day), then sent to their phones as one notification whose id is
// this notice's. The phone fetches it and writes the words (PUSH-2). Kept 30 days.
export const matchNotice = pgTable("match_notice", {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    /** The key, which may since have been deleted, and its name then. */
    keyId: uuid("key_id").notNull(),
    source: text("source").notNull(),
    /** Each match's state before the first change and after the last, by match id. */
    matches: jsonb("matches").notNull().$type<Record<string, { before?: NoticeState; after?: NoticeState }>>(),
    urgent: boolean("urgent").notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt,
}, (t) => [index("match_notice_due").on(t.sentAt, t.sendAt)]);

/** What a notice keeps of a match, to say what changed. */
export interface NoticeState {
    title: string;
    status: string;
    kickoff?: string;
    timeZone?: string;
    venueId?: string;
    pitchId?: string;
}
