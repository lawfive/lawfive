import { z } from "zod";
import { Id, Timestamp, TimeZone } from "./common.ts";
import { MatchRecord } from "./matchRecord.ts";
import { SchemeId } from "./misconduct.ts";
import { ClockStyle } from "./format.ts";
import { BreakClockStyle, Competition, DistanceUnit, Match, MatchTemplate, Referee, UserSettings, Venue, WatchClocks, WatchEdge, WatchLayout } from "./records.ts";

// What the API sends and receives besides the records themselves: the collections and what a
// client sends to save a record, sync pages, errors, devices, the watch's own shapes, address
// search, accounts and the server's description of itself. endpoints.ts lists the endpoints.

/** A record as a client sends it to save it: without the fields the server sets, and with version only when updating. */
function recordInput(record: z.ZodObject, name: string) {
    return record
        .omit({ id: true, version: true, updatedAt: true, deletedAt: true })
        .extend({
            id: Id.optional().describe("The id from the URL; can be left out."),
            version: z.int().min(1).optional().describe("The version last seen, when updating. Leave it out to create the record."),
        })
        .meta({ id: `${name}Input`, description: `A ${name} as a client sends it to save it: the server sets updatedAt and deletedAt, and version only goes with an update.` });
}

/** The record collections, by the name in their URL (/v1/<collection>). */
export const collections = {
    matches: { type: "match", record: Match, input: recordInput(Match, "Match") },
    "match-templates": { type: "matchTemplate", record: MatchTemplate, input: recordInput(MatchTemplate, "MatchTemplate") },
    "match-records": { type: "matchRecord", record: MatchRecord, input: recordInput(MatchRecord, "MatchRecord") },
    venues: { type: "venue", record: Venue, input: recordInput(Venue, "Venue") },
    competitions: { type: "competition", record: Competition, input: recordInput(Competition, "Competition") },
    referees: { type: "referee", record: Referee, input: recordInput(Referee, "Referee") },
    // One per user: clients create it once, then update it.
    settings: { type: "settings", record: UserSettings, input: recordInput(UserSettings, "UserSettings") },
} as const;

export type CollectionName = keyof typeof collections;
const collectionNames = Object.keys(collections) as [CollectionName, ...CollectionName[]];

/** What an API key may do: read, or read and write, one collection (KEY-2). Write includes read. */
export const ApiKeyScope = z
    .enum(collectionNames.flatMap((name) => [`${name}:read`, `${name}:write`]) as [string, ...string[]])
    .meta({ id: "ApiKeyScope", description: "<collection>:read, or <collection>:write (which includes reading it)." });

/** Whether scopes allow what an endpoint needs: "<collection>:read" or ":write", or "*:read" (any read, for sync). */
export function scopesAllow(scopes: readonly string[], need: string): boolean {
    const [area, level] = need.split(":");
    if (area === "*") {
        return readableCollections(scopes).length > 0;
    }
    return scopes.includes(`${area}:write`) || (level === "read" && scopes.includes(`${area}:read`));
}

/** The collections scopes let a key read. */
export function readableCollections(scopes: readonly string[]): CollectionName[] {
    return collectionNames.filter((name) => scopes.includes(`${name}:read`) || scopes.includes(`${name}:write`));
}

export const ApiKey = z
    .object({
        id: Id,
        name: z.string().describe("What it's for, \"RefSix import\"."),
        prefix: z.string().describe("The start of the key, to recognize it: lf_ and 8 characters."),
        scopes: z.array(ApiKeyScope),
        createdAt: Timestamp,
        lastUsedAt: Timestamp.optional().describe("To within five minutes; none until it's used."),
        expiresAt: Timestamp.optional().describe("None for a key that doesn't expire."),
        notify: z.boolean().describe("Whether the user's phones are told when this key adds a match, or cancels, postpones, moves or removes one that hasn't kicked off (NOTE-1)."),
    })
    .meta({ id: "ApiKey", description: "A key for scripts and integrations, with only the access it was given (KEY-1)." });

export const NewApiKey = z
    .object({
        name: z.string().trim().min(1).max(60),
        scopes: z.array(ApiKeyScope).min(1).describe("At least one."),
        expiresInDays: z.int().min(1).max(3650).optional().describe("Leave out for a key that doesn't expire."),
        notify: z.boolean().optional().describe("Tell the user's phones when this key adds or changes matches (NOTE-1); off when left out."),
    })
    .meta({ id: "NewApiKey" });

export const ApiKeyChange = z
    .object({
        notify: z.boolean().describe("Tell the user's phones when this key adds or changes matches (NOTE-1)."),
    })
    .meta({ id: "ApiKeyChange", description: "What can change on a key after it's made." });

// Notices (NOTE-1 to NOTE-4): what an integration did to the user's matches, for a phone to put
// into words. The push carries only the notice's id (PUSH-2).

export const MatchNoticeChange = z
    .enum(["added", "canceled", "postponed", "backOn", "kickoff", "venue", "removed"])
    .meta({ id: "MatchNoticeChange", description: "added: a new match; canceled, postponed; backOn: scheduled again after being canceled or postponed; kickoff: moved to another time; venue: moved to another venue; removed: deleted." });

export const MatchNotice = z
    .object({
        id: Id,
        source: z.string().describe("Who made the changes: the API key's name, which is usually the integration's, or the assignor calendar's (FEED-8)."),
        createdAt: Timestamp,
        matches: z.array(z.object({
            matchId: Id,
            changes: z.array(MatchNoticeChange).min(1).describe("What happened, most important first; added and removed come alone."),
            title: z.string().describe("Home v Away, or the match's name."),
            kickoff: Timestamp.optional().describe("When it kicks off now (or did, for a removed match)."),
            previousKickoff: Timestamp.optional().describe("With kickoff: when it was going to."),
            timeZone: TimeZone.optional(),
            venue: z.string().optional().describe("Where it is now: the venue, and pitch."),
            previousVenue: z.string().optional().describe("With venue: where it was going to be."),
        })).describe("The matches, soonest first."),
    })
    .meta({ id: "MatchNotice", description: "What an integration (an API key, or an assignor calendar) did to the user's matches, collected over about a minute, for a phone to write as a notification (NOTE-3)." });


// Assignor calendars (FEED-1 to FEED-10): an assignor system's private calendar link, read by the
// server every half hour into the account's matches.

export const AssignorSystem = z
    .enum(["arbiter", "assignr", "horizon", "reftown", "gotsport", "spordle", "other"])
    .meta({ id: "AssignorSystem", description: "Which system a calendar link is from: ArbiterSports, Assignr, HorizonWebRef, RefTown, GotSport, Spordle, or another (FEED-1). Each is read the same way until it has rules of its own (FEED-5)." });

export const AssignorCalendarEvent = z
    .object({
        title: z.string().describe("Home v Away, or the match's name."),
        kickoff: Timestamp,
        timeZone: TimeZone.optional(),
        venue: z.string().optional(),
        inLawFive: z.boolean().describe("A match already in LawFive at this kickoff, which the calendar takes on without changing (FEED-5)."),
    })
    .meta({ id: "AssignorCalendarEvent", description: "A game in an assignor's calendar, as it would be saved." });

export const AssignorCalendarSkipped = z
    .object({
        title: z.string().describe("The event's summary, or what's known of it."),
        kickoff: Timestamp.optional(),
        reason: z.string(),
    })
    .meta({ id: "AssignorCalendarSkipped", description: "An event that couldn't be read or saved, and why (FEED-9)." });

export const AssignorCalendarPreview = z
    .object({
        calendarName: z.string().optional().describe("What the calendar calls itself (X-WR-CALNAME)."),
        games: z.int().nonnegative().describe("Games still to come."),
        from: Timestamp.optional().describe("The first one's kickoff."),
        to: Timestamp.optional().describe("The last one's kickoff."),
        inLawFive: z.int().nonnegative().describe("Of those, how many are already in LawFive at the same kickoff."),
        first: z.array(AssignorCalendarEvent).max(3).describe("The first three, as they'd be saved."),
        skipped: z.array(AssignorCalendarSkipped).describe("Events that couldn't be read, at most 20."),
    })
    .meta({ id: "AssignorCalendarPreview", description: "What a calendar link holds, before connecting it; nothing is saved (FEED-1)." });

export const AssignorCalendar = z
    .object({
        id: Id,
        name: z.string(),
        system: AssignorSystem,
        link: z.string().describe("The start of the link, to recognize it by: the whole link is a password, so it's never sent back (FEED-2)."),
        notify: z.boolean().describe("Tell the account's phones when it adds, moves or cancels a match (FEED-8, NOTE-1)."),
        active: z.boolean().describe("false: paused, by the person or after the link stopped working (FEED-9); not read."),
        createdAt: Timestamp,
        lastReadAt: Timestamp.optional().describe("When it was last read, whatever happened."),
        lastChangedAt: Timestamp.optional().describe("When a read last added or changed a match."),
        lastResult: z.object({
            games: z.int().nonnegative().describe("Games still to come in it."),
            added: z.int().nonnegative(),
            updated: z.int().nonnegative(),
            canceled: z.int().nonnegative(),
        }).optional().describe("What the latest read that worked found and did."),
        problem: z.string().optional().describe("Why the latest read didn't work, or why it's paused."),
        stoppedAt: Timestamp.optional().describe("When it was paused because the link stopped working (FEED-9)."),
        skipped: z.array(AssignorCalendarSkipped).describe("Events the latest read couldn't save, at most 20."),
    })
    .meta({ id: "AssignorCalendar", description: "An assignor's calendar link, read into the account's matches every 30 minutes (FEED-1 to FEED-9)." });

export const AssignorCalendarLink = z
    .object({
        url: z.string().trim().min(1).max(2000).describe("The calendar link: https, http, or webcal (read as https)."),
        system: AssignorSystem,
    })
    .meta({ id: "AssignorCalendarLink" });

export const NewAssignorCalendar = AssignorCalendarLink
    .extend({
        name: z.string().trim().min(1).max(60),
        notify: z.boolean().optional().describe("true when left out (FEED-8)."),
    })
    .meta({ id: "NewAssignorCalendar" });

export const AssignorCalendarChange = z
    .object({
        name: z.string().trim().min(1).max(60).optional(),
        notify: z.boolean().optional(),
        active: z.boolean().optional().describe("false pauses it; true starts reading it again, straight away."),
        url: z.string().trim().min(1).max(2000).optional().describe("A new link, such as one the assignor system made again (FEED-9); read straight away."),
    })
    .meta({ id: "AssignorCalendarChange" });

// Webhooks (HOOK-1 to HOOK-5).

export const WebhookTopic = z
    .enum(["match", "matchRecord", "venue", "referee", "competition", "matchTemplate"])
    .meta({ id: "WebhookTopic", description: "The kinds of record a webhook can hear about: matches, match reports (results), venues, referees, competitions and match templates." });

export const Webhook = z
    .object({
        id: Id,
        url: z.string().describe("Where deliveries are POSTed."),
        topics: z.array(WebhookTopic).describe("Which records' changes it hears about."),
        active: z.boolean().describe("Paused webhooks get no deliveries."),
        createdAt: Timestamp,
        lastDelivery: z.object({
            at: Timestamp,
            status: z.enum(["pending", "delivered", "failed"]),
            responseCode: z.int().optional(),
        }).optional().describe("The latest delivery and how it went."),
    })
    .meta({ id: "Webhook", description: "A URL that hears about changes to the account's records (HOOK-1)." });

export const WebhookInput = z
    .object({
        url: z.url({ protocol: /^https?$/ }).max(2000).describe("http or https."),
        topics: z.array(WebhookTopic).min(1),
        active: z.boolean().optional().describe("true when left out."),
    })
    .meta({ id: "WebhookInput" });

export const CreatedWebhook = Webhook
    .extend({ secret: z.string().describe("For checking a delivery's X-LawFive-Signature, shown only this once.") })
    .meta({ id: "CreatedWebhook", description: "A new webhook, with the secret its deliveries are signed with." });

export const WebhookDelivery = z
    .object({
        id: Id.describe("Also sent as X-LawFive-Delivery."),
        event: z.string().describe("match.created, matchRecord.updated, venue.deleted…"),
        status: z.enum(["pending", "delivered", "failed"]).describe("pending: waiting for its next try; failed: gave up after five tries."),
        attempts: z.int().nonnegative(),
        responseCode: z.int().optional(),
        error: z.string().optional().describe("Why the last try failed, when it didn't get an answer."),
        test: z.boolean().describe("Sent with Send test."),
        createdAt: Timestamp,
        deliveredAt: Timestamp.optional(),
    })
    .meta({ id: "WebhookDelivery", description: "One change sent to a webhook, with how it went." });

export const WebhookPayload = z
    .object({
        id: Id.describe("The delivery's id; the same on every retry, so a receiver can ignore one it has had."),
        event: z.string().describe("<topic>.<created|updated|deleted>"),
        createdAt: Timestamp.describe("When the change was made."),
        test: z.boolean().optional().describe("true for Send test; data is then an example."),
        data: z.record(z.string(), z.unknown()).describe("The record as stored (as GET returns it); for deleted, its id, version and deletedAt."),
    })
    .meta({ id: "WebhookPayload", description: "What each delivery POSTs, as JSON. It's signed: X-LawFive-Signature is t=<unix seconds>,v1=<hex HMAC-SHA256 of \"<t>.<body>\" with the webhook's secret>." });

// Download everything and restore (DATA-2, DATA-4).

const RestoreCount = z.object({ added: z.int(), updated: z.int(), unchanged: z.int() });

export const RestoreResult = z
    .object({
        records: z.record(z.string(), RestoreCount).describe("By collection: matches, venues, referees…"),
        tracks: RestoreCount,
        photos: RestoreCount,
        problems: z.array(z.string()).describe("What couldn't be restored and why, at most 50."),
    })
    .meta({ id: "RestoreResult", description: "What restoring an export did (DATA-4). Records the account already has a newer copy of are unchanged; running it again adds nothing." });

// Shared matches (DATA-7).

export const MatchShare = z
    .object({
        url: z.string().describe("The public page: PUBLIC_URL/s/<token>. Anyone with it can see the match."),
        createdAt: Timestamp,
    })
    .meta({ id: "MatchShare", description: "A match's share link (DATA-7)." });

export const SharedMatch = z
    .object({
        match: Match.describe("Only what a public page shows: without its notes, outlook, fee, crew, tags, match number, assignor or the ids of its venue, pitch, competition and template."),
        record: MatchRecord.optional().describe("Its match report, when it's been played, without notes on events or team officials' names."),
        competition: z.string().optional().describe("The competition's name."),
        venue: z.string().optional().describe("The venue's name."),
        pitch: z.string().optional().describe("The pitch's name."),
        distanceUnit: DistanceUnit.describe("The sharer's, for the figures."),
        track: z.boolean().describe("Whether GET /v1/shared/{token}/track has a track."),
    })
    .meta({ id: "SharedMatch", description: "What a match's share link shows (DATA-7): never its notes, fee, crew, contacts, player names or photos." });

// Attachments (FILE-1 to FILE-5): photos on matches, venues and referees, kept by the server.

export const AttachmentRecordType = z
    .enum(["match", "venue", "referee"])
    .meta({ id: "AttachmentRecordType", description: "The kinds of record that can have attachments." });

export const Attachment = z
    .object({
        id: Id,
        recordType: AttachmentRecordType,
        recordId: Id.describe("The match, venue or referee it's on."),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).describe("What the file is, worked out from its contents."),
        size: z.int().describe("The file's size in bytes."),
        width: z.int().optional().describe("Its width in pixels, when the upload gave it."),
        height: z.int().optional(),
        caption: z.string().optional(),
        position: z.int().describe("Its place among the record's attachments, from 0. A referee's first photo is their picture."),
        createdAt: Timestamp,
        url: z.string().describe("Where to fetch the file: /v1/attachments/{id}/file, with the same sign-in."),
        thumbUrl: z.string().describe("A small version for lists and galleries: /v1/attachments/{id}/thumb (the file itself when none was uploaded)."),
    })
    .meta({ id: "Attachment", description: "A photo on a match, venue or referee (FILE-1). The files are private: fetching them needs the same sign-in as the rest of the API." });

export const AttachmentUpload = z
    .object({
        recordType: AttachmentRecordType,
        recordId: Id,
        caption: z.string().max(500).optional(),
        width: z.coerce.number().pipe(z.int().min(1).max(20_000)).optional().describe("The image's width in pixels."),
        height: z.coerce.number().pipe(z.int().min(1).max(20_000)).optional(),
    })
    .meta({ id: "AttachmentUpload", description: "The form fields of an upload (multipart/form-data), beside the files: file (a JPEG, PNG or WebP of at most 10 MB) and, optionally, thumb (a small version, at most 1 MB)." });

export const AttachmentChange = z
    .object({
        caption: z.string().max(500).nullable().optional().describe("The new caption; null or an empty string removes it."),
        position: z.int().min(0).optional().describe("Move it to this place among the record's attachments (0 is first; a larger number moves it to the end)."),
    })
    .meta({ id: "AttachmentChange", description: "What to change about an attachment; leave out what stays the same." });

export const CreatedApiKey = ApiKey
    .extend({ key: z.string().describe("The key itself, shown only this once: send it as Authorization: Bearer <key>.") })
    .meta({ id: "CreatedApiKey", description: "A new key, with the key itself. The server keeps only a hash, so it can't show it again." });

export const Change = z
    .discriminatedUnion("collection", collectionNames.map((name) => z.object({ collection: z.literal(name), record: collections[name].record })) as never)
    .meta({ id: "Change", description: "A record as it is now, after a change: created, updated or deleted (deletedAt set)." });

export const ChangesPage = z
    .object({
        changes: z.array(Change).describe("Oldest first. A record changed several times appears once, as it is now."),
        cursor: z.int().min(0).describe("Send as since next time. Unchanged when there's nothing new."),
        more: z.boolean().describe("true when there are more changes after this page; ask again straight away."),
    })
    .meta({ id: "ChangesPage", description: "One page of the changes after a cursor, for sync." });

export const ApiError = z
    .object({ error: z.string().describe("What went wrong, in words a person can read.") })
    .meta({ id: "ApiError", description: "Every LawFive error (outside /v1/auth) has this shape; some add fields." });

export const ValidationIssue = z
    .looseObject({
        code: z.string(),
        path: z.array(z.union([z.string(), z.number()])).describe("Where in the body, for example [\"home\", \"colour\"]."),
        message: z.string(),
    })
    .meta({ id: "ValidationIssue", description: "One problem with a request body, as Zod reports it." });

export const ValidationError = z
    .object({ error: z.string(), issues: z.array(ValidationIssue) })
    .meta({ id: "ValidationError", description: "The body doesn't match the schema; issues lists each problem." });

export const SignUpMode = z
    .enum(["open", "approval", "closed"])
    .meta({ id: "SignUpMode", description: "Who can make an account (USR-2): open, anyone; approval, anyone, but an admin approves the account before it can be used; closed, only people with an invitation (USR-3)." });

export const ServerMeta = z
    .object({
        product: z.literal("LawFive"),
        apiUrl: z.string().optional().describe("The address apps should use for the API, which may differ from the one they came through (APP-13)."),
        apiVersion: z.int().describe("Raised when the API changes in a way older apps can't follow."),
        openApiUrl: z.string().optional().describe("Where this server describes its own API as OpenAPI (AGT-3); missing on servers from before it."),
        version: z.string().optional().describe("The server's version (VER-1): the day of its last change, \"2026.10.30\" (\"2026.10.30.2\" for a second change that day), or \"dev\" when run from a checkout without git. Missing on servers from before it."),
        commit: z.string().optional().describe("The commit it was built from, \"f5de635\"."),
        capabilities: z.array(z.string()).describe("What this server offers: accounts, records, changes, tracks and stats (missing on servers from before them), devices, link, watch, people, invites, calendar and import, then email, geocode, push, notices (with push, from servers that tell phones what integrations did, NOTE-1) and weather when they're switched on; merging, from servers that find duplicates and preview merges for the apps (DUP-11); plans, from servers with plans and the account's time zone (PLAN-6, PLAN-9); assignor-calendars, from servers that read assignors' calendar links (FEED-1). Ignore names you don't know."),
        maps: z.object({
            style: z.object({
                url: z.string().describe("A MapLibre style for the map (vector tiles)."),
                darkUrl: z.string().optional().describe("The style to use in dark mode, when there is one."),
                attribution: z.string().describe("The credit the map provider asks for, as HTML."),
            }).optional().describe("A vector map, which apps that can draw one use instead of tileUrl (OpenFreeMap's by default)."),
            tileUrl: z.string().describe("Map tiles (raster images), with {z}, {x} and {y} in the URL: the map when there's no style, and for apps that can't draw vector maps."),
            attribution: z.string().describe("The credit the tile provider asks for, as HTML."),
            satellite: z.object({ tileUrl: z.string(), attribution: z.string() }).optional().describe("Satellite imagery, when the server has a provider."),
        }),
        geocoder: z.object({ url: z.string() }).optional().describe("The address search service behind GET /v1/geocode, to credit it."),
        weather: z.object({ source: z.string() }).optional().describe("Whose weather data GET /v1/weather uses, to credit it."),
        firstAccount: z.literal(true).optional().describe("Nobody has an account on this server yet (USR-8): the first one can be made whatever signUp says, with the setup code when setupCodeNeeded, and it's the server's admin."),
        setupCodeNeeded: z.literal(true).optional().describe("The first account needs the code in the server's logs (ADM-5)."),
        setupPending: z.literal(true).optional().describe("The first account hasn't finished setting the server up (ADM-5)."),
        publicUrl: z.string().optional().describe("The server's own address (PUBLIC_URL), for the website to say if it isn't HTTPS (ADM-5, ADM-6)."),
        signUp: SignUpMode.optional().describe("Who can make an account (USR-2); missing on servers from before it, which were open or closed."),
    })
    .meta({ id: "ServerMeta", description: "What this server is and offers, so apps can adapt to older or self-hosted servers." });

export const Device = z
    .object({
        id: z.string().describe("The session's id, for DELETE /v1/devices/{id}."),
        kind: z.string().describe("browser, or the app's name from its X-LawFive-Device header (garmin)."),
        name: z.string().describe("For people: \"Garmin Venu 2\" (\"Garmin watch\" when it didn't say which), \"Chrome on macOS\"."),
        model: z.string().optional().describe("A watch's Garmin part number, \"006-B3703-00\", when it gives one."),
        firmware: z.string().optional().describe("A watch's firmware version, \"12.30\", when it gives one."),
        appVersion: z.string().optional().describe("The version of LawFive on it (VER-3), \"2026.10.30\", from the app= in its X-LawFive-Device header; missing for browsers and apps from before it."),
        linkedAt: Timestamp.describe("When it signed in or was linked."),
        lastActiveAt: Timestamp,
        current: z.boolean().describe("true for the device making this request."),
        watchOnly: z.boolean().optional().describe("true for a watch's link, which only syncs matches (SEC-13); absent for everything else."),
    })
    .meta({ id: "Device", description: "Somewhere the account is signed in: a browser or a linked watch." });

export const WatchMatch = z
    .object({
        id: Id,
        kickoff: z.int().nullable().describe("Seconds since 1970 (UTC)."),
        title: z.string().describe("\"STR v ROV\", for the watch's list."),
        name: z.string().nullable().describe("The match's name, or its competition's."),
        where: z.string().nullable().describe("Venue and pitch, \"Twin Creeks, Field 3\"."),
        role: z.string().nullable().describe("Referee, AR1, AR2 or 4th official."),
        weather: z.string().nullable().describe("A short forecast in the user's temperature unit, \"54° rain\" (WX-7)."),
        fee: z.object({ text: z.string().describe("\"$25\", in the fee's currency."), paid: z.boolean() }).nullable().optional()
            .describe("The fee, for the match's screen and its Paid toggle (UI-19); absent from servers before it."),
        crew: z.array(z.tuple([z.string(), z.string()])).optional().describe("The other officials, [role, name]: [\"AR1\", \"Sam Rivera\"]."),
        notes: z.string().nullable().optional().describe("The match's notes, shortened to 300 characters for the watch's memory."),
        home: z.string().max(4).describe("Short name shown on the watch."),
        away: z.string().max(4),
        homeName: z.string(),
        awayName: z.string(),
        homeColor: z.int().describe("0xRRGGBB, or -1 for none."),
        awayColor: z.int(),
        numPeriods: z.int(),
        periodSec: z.int(),
        halftimeSec: z.int().describe("The break between periods."),
        teamSize: z.int(),
        midBreak: z.boolean().describe("A break halfway through each period (for example a water break)."),
        breakLenSec: z.int(),
        extraTime: z.boolean(),
        etPeriods: z.int(),
        etPeriodSec: z.int(),
        goldenGoal: z.boolean().describe("A goal in extra time ends the match (ET-6)."),
        penalties: z.boolean(),
        clockStyle: z.union([z.literal(0), z.literal(1), z.literal(2)]).describe("For older watch builds: the account's match clock (TMR-11), 0 Match time, 1 each period from 0, 2 time left. Newer ones take it from the match screen."),
        trackStoppage: z.boolean(),
        stoppingClock: z.boolean().optional().describe("The match clock stops while play is stopped, with no added time (TMR-15); trackStoppage is on with it. Absent from servers before it."),
        stopForGoalsCards: z.boolean().optional().describe("With a stopping clock, a goal or card recorded stops it (TMR-15)."),
        breakStoppage: z.boolean().describe("The halfway break's time is added on as stoppage (TMR-12)."),
        goalScorers: z.boolean().describe("Ask the scorer's number for each goal (EVT-10)."),
        goalTypes: z.boolean(),
        sinBins: z.boolean().describe("Sin bin in the team menu (EVT-12)."),
        sinBinSec: z.int().describe("A sin bin's length, 10 minutes unless the format says."),
        misconductScheme: SchemeId.optional().describe("The codes for a card's reason on the watch (EVT-14): the competition's, else the account's."),
    })
    .meta({ id: "WatchMatch", description: "A match in the form the Garmin watch starts one from (its setup keys), plus what its list shows. Watches have little memory, so the server does the converting." });

export const WatchEvent = z
    .tuple([z.string(), z.int(), z.int(), z.int(), z.int().nullable(), z.int().nullable()])
    .meta({
        id: "WatchEvent",
        description: "[code, team, period, seconds, player, extra]. code: G goal, GO own goal, GP penalty, GF direct free kick, Y caution, Y2 second caution, R send-off, SB a sin bin, with its length in seconds in extra, SB2 a second sin bin for the same number, which counts as a send-off (EVT-12), TY and TR a team official's caution and send-off, with the role in extra (0 head coach, 1 assistant coach, 2 other), I injury, S stoppage, CK and CA the match clock and the added time corrected during play (TMR-14), with the change in seconds in extra (negative for back), E end of period, A abandoned, with the reason in extra (0 weather, 1 lightning, 2 crowd trouble, 3 not enough players, 4 other), SU play suspended, with the reason in extra as for A (TMR-13), RS play resumed, with the whole seconds suspended in extra, both at the period time where play stopped, PG and PM shoot-out kick scored and missed. team: 0 home, 1 away, -1 neither. period counts from 0. seconds: into the period, or -1 before kickoff, -2 at a break, -3 after full time, -4 in the shoot-out. player: shirt number or null. extra: a stoppage's length in seconds.",
    });

export const WatchFeeChange = z
    .object({
        matchId: Id,
        paid: z.boolean(),
        at: z.int().positive().describe("When it was changed on the watch, in seconds since 1970."),
    })
    .meta({ id: "WatchFeeChange", description: "A match's fee marked paid or not paid on the watch (SYNC-11)." });

export const WatchScreenChange = z
    .object({
        layout: WatchLayout.describe("The nearest old layout. A watch that sends only this and secondClock is a build from before the four choices (UI-21)."),
        secondClock: ClockStyle,
        clocks: WatchClocks.optional(),
        mainClock: ClockStyle.optional(),
        breakClock: BreakClockStyle.optional(),
        edge: WatchEdge.optional(),
        names: z.boolean().optional(),
        at: z.int().positive().describe("When it was changed on the watch, in seconds since 1970."),
    })
    .meta({ id: "WatchScreenChange", description: "The match screen as chosen on the watch, or as it's sent to one (UI-21, UI-24); the latest change wins." });

export const WatchPitchMarking = z
    .object({
        matchId: Id.optional().describe("A planned match's id."),
        created: z.int().positive().optional().describe("Or, for a quick match, when it was started on the watch (it has no id until it's uploaded)."),
        corners: z.array(z.tuple([z.int().min(-90_000_000).max(90_000_000), z.int().min(-180_000_000).max(180_000_000)])).min(2).max(4)
            .describe("[latitude, longitude] in millionths of a degree, as the watch's tracks are: its JSON keeps only six significant figures of a decimal."),
        at: z.int().positive().describe("When they were marked, in seconds since 1970."),
    })
    .meta({ id: "WatchPitchMarking", description: "A pitch's corners walked on the watch (TRK-13, SYNC-12)." });

export const WatchUpload = z
    .object({
        created: z.int().positive().describe("When the match was started on the watch, in seconds since 1970."),
        matchId: Id.nullable().optional().describe("The planned match it was started from; none for a quick match."),
        device: z.string().max(40).optional().describe("The watch model, \"venu2\"."),
        home: z.string().max(4),
        away: z.string().max(4),
        homeName: z.string().max(60).optional(),
        awayName: z.string().max(60).optional(),
        homeColor: z.int().optional(),
        awayColor: z.int().optional(),
        numPeriods: z.int(),
        periodSec: z.int(),
        halftimeSec: z.int(),
        teamSize: z.int().optional(),
        breakAtSec: z.int().optional().describe("When the halfway break comes, or -1 for none."),
        breakLenSec: z.int().optional(),
        extraTime: z.boolean().optional(),
        etPeriods: z.int().optional(),
        etPeriodSec: z.int().optional(),
        goldenGoal: z.boolean().optional().describe("The format's golden goal (ET-6)."),
        penalties: z.boolean().optional(),
        clockStyle: z.int().optional(),
        trackStoppage: z.boolean().optional(),
        stoppingClock: z.boolean().optional().describe("The format's stopping clock (TMR-15): every event's seconds are the clock's, which stood still during stoppages (S)."),
        stopForGoalsCards: z.boolean().optional(),
        breakStoppage: z.boolean().optional(),
        goalScorers: z.boolean().optional(),
        goalTypes: z.boolean().optional(),
        sinBins: z.boolean().optional().describe("The format's sin bins (EVT-12)."),
        sinBinSec: z.int().optional(),
        score: z.tuple([z.int(), z.int()]).describe("[home, away]."),
        pens: z.tuple([z.int(), z.int()]).nullable().optional().describe("Shoot-out score, [home, away]."),
        golden: z.boolean().optional().describe("It ended on a golden goal in extra time (ET-6)."),
        distanceM: z.number().nonnegative().nullable().optional().describe("How far the referee ran, in meters."),
        startedAt: z.array(z.int().positive()).max(8).optional().describe("When each period kicked off, in seconds since 1970, for the track's figures (TRK-3)."),
        kickoff: z.int().min(-1).max(1).optional().describe("The team that kicked off the first period: 0 home, 1 away, -1 not chosen."),
        homeHeading: z.number().nullable().optional().describe("The compass heading of the goal the home team attacked in the first period, in radians from true north, when the referee recorded it (PRE-8)."),
        events: z.array(WatchEvent),
        // EVT-14: beside the events rather than in them, so a server from before it still takes the match.
        misconduct: z.object({
            scheme: SchemeId.describe("The codes the watch listed."),
            codes: z.array(z.tuple([z.int().nonnegative(), z.string().min(1).max(12)])).max(200).describe("[the card's index in events, its code]."),
        }).optional().catch(undefined).describe("The cards' reasons chosen on the watch (EVT-14); a code that isn't the scheme's for that card is left out."),
        // A problem here must never cost a match, so anything it can't read is left out rather than refused.
        diagnostics: z.object({
            battery: z.array(z.tuple([z.int(), z.int(), z.number()])).max(24).optional().describe("[period from 0, 0 kickoff or 1 its end, percent]."),
            app: z.string().max(40).optional(),
            firmware: z.string().max(40).optional(),
            gpsFirstFixSec: z.int().nonnegative().optional().describe("Seconds from kickoff to the first GPS fix."),
            gpsSamples: z.int().nonnegative().optional().describe("Track samples taken."),
            gpsMissed: z.int().nonnegative().optional().describe("Of those, how many had no GPS fix."),
            restarts: z.int().nonnegative().optional().describe("How many times the app started again mid-match (R-5)."),
        }).optional().catch(undefined).describe("How the recording went, for tracing problems (DIAG-1)."),
    })
    .meta({ id: "WatchUpload", description: "A finished match as the watch saved it. The server stores it as a match record." });

export const WatchTrackChunk = z
    .object({
        created: z.int().positive().describe("The match's created time, as in its upload: which match the track is for."),
        start: z.int().positive().describe("When the track starts (the first kickoff), in seconds since 1970."),
        index: z.int().nonnegative().describe("Which chunk this is, from 0."),
        count: z.int().min(1).max(200).describe("How many chunks the track has."),
        device: z.string().max(40).optional().describe("The watch model, \"venu2\"."),
        data: z.string().max(32_768).describe("The chunk's samples as the watch packs them, \"dt,dlat,dlon,speed,hr;\" each: tenths of a second since the sample before (empty for 10; the chunk's first counts from start), millionths of a degree moved since the chunk's position before (the first is whole; both empty without a new fix), the speed the watch measured in cm/s, and beats a minute. Empty fields mean unknown; trailing ones are left off."),
    })
    .refine((c) => c.index < c.count, { message: "index must be less than count", path: ["index"] })
    .meta({ id: "WatchTrackChunk", description: "Part of a match's track as the watch recorded it (TRK-7): GPS and heart rate about once a second during the periods." });

export const WatchTrackResult = z
    .object({
        received: z.int().describe("How many of the track's chunks the server has."),
        count: z.int(),
        track: z.enum(["waiting", "saved", "kept", "dropped"]).describe("waiting: for more chunks or the match; saved: the track is on the match report; kept: the match report already had a track (from a file, say), which stays; dropped: nothing in it could be used (no positions or heart rate)."),
    })
    .meta({ id: "WatchTrackResult" });

export const WatchUploadResult = z
    .object({
        recordId: Id.describe("The match record. The same every time this match is sent, so sending it again updates it."),
        matchId: Id.describe("The planned match, or the one made for a quick match."),
    })
    .meta({ id: "WatchUploadResult" });

export const Place = z
    .object({
        name: z.string().describe("The full address."),
        lat: z.number(),
        lon: z.number(),
    })
    .meta({ id: "Place", description: "A place found by address search." });

// Accounts and linking are Better Auth's endpoints (better-auth.com); these are the parts of
// their answers that LawFive's apps use. They may carry more fields.

export const User = z
    .looseObject({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        emailVerified: z.boolean(),
        image: z.string().nullable().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
    })
    .meta({ id: "User", description: "A LawFive account." });

export const Session = z
    .looseObject({
        id: z.string(),
        userId: z.string(),
        token: z.string().describe("The bearer token."),
        expiresAt: z.string().describe("90 days after it was last renewed; a session is renewed once a day while it's used."),
        createdAt: z.string(),
        updatedAt: z.string(),
    })
    .meta({ id: "Session", description: "A signed-in device." });

export const AuthError = z
    .looseObject({ message: z.string(), code: z.string().describe("For example INVALID_EMAIL_OR_PASSWORD or INVALID_ORIGIN.") })
    .meta({ id: "AuthError", description: "An error from the account endpoints." });

export const OAuthError = z
    .looseObject({
        error: z.string().describe("authorization_pending, slow_down, expired_token, access_denied, invalid_request, invalid_client, invalid_grant or unauthorized."),
        error_description: z.string().optional(),
    })
    .meta({ id: "OAuthError", description: "An error from the linking endpoints, as RFC 8628 has them." });

export const DeviceCode = z
    .object({
        device_code: z.string().describe("Secret; the watch polls with it."),
        user_code: z.string().describe("Eight letters and digits without look-alikes, shown on the watch."),
        verification_uri: z.string().describe("The web app's Link page."),
        verification_uri_complete: z.string().describe("The Link page with the code filled in, for a QR code."),
        expires_in: z.int().describe("Seconds (600)."),
        interval: z.int().describe("Seconds to wait between polls (5)."),
    })
    .meta({ id: "DeviceCode", description: "A code for linking a watch (RFC 8628)." });

export const DeviceToken = z
    .looseObject({
        access_token: z.string().describe("Send as Authorization: Bearer <token>."),
        token_type: z.literal("Bearer"),
        expires_in: z.int(),
        scope: z.string(),
    })
    .meta({ id: "DeviceToken", description: "The watch's token once someone has approved its code." });

// Accounts, admins and invitations (USR-1 to USR-6).

export const AccountStatus = z
    .enum(["active", "pending", "suspended"])
    .meta({ id: "AccountStatus", description: "pending: made on a server that approves new accounts, and not approved yet (USR-4). It can sign in, but only GET /v1/account answers. suspended: an admin suspended it (USR-7); it can't sign in, and its API keys and calendar feed stop working, but its data is kept." });

export const Account = z
    .object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        status: AccountStatus,
        admin: z.boolean().describe("Can invite and approve people (USR-1)."),
        pendingEmail: z.string().optional().describe("A new address waiting for its owner to follow the link emailed to it (USR-9); email stays the old one until then."),
        pendingEmailUntil: Timestamp.optional().describe("When that link stops working."),
    })
    .meta({ id: "Account", description: "The signed-in account, with what it may do." });

/** USR-10: an account's name, at sign-up and when it's changed: the words people see, trimmed, 1 to 100 characters. */
export const AccountName = z.string().trim().min(1).max(100).meta({ id: "AccountName", description: "An account's name (USR-10): 1 to 100 characters, spaces at either end trimmed." });

export const NameChange = z
    .object({ name: AccountName })
    .strict()
    .meta({ id: "NameChange", description: "A new name for the signed-in account (USR-10); nothing else can be changed this way." });

export const EmailConfirmation = z
    .object({ token: z.string().min(10).max(200).describe("From the link emailed to the new address: /confirm-email/<token>.") })
    .meta({ id: "EmailConfirmation", description: "Following the link that confirms a new email address (USR-9)." });

export const MatchOnWatch = z
    .object({
        matchId: Id,
        deviceId: z.string().describe("The watch's link, as GET /v1/devices gives it (the session's id)."),
        kind: z.string().describe("garmin, wearos or applewatch, from the watch's X-LawFive-Device header; watch when it didn't say."),
        name: z.string().describe("For people: \"Garmin Venu 2\", \"Galaxy Watch4\", \"Apple Watch Series 9\" (\"Garmin watch\" when it didn't say which)."),
        since: Timestamp.describe("When the watch first got the match as it has it now."),
        syncedAt: Timestamp.describe("The watch's latest download, which still had the match."),
        upToDate: z.boolean().describe("false when what the watch shows of the match has changed since (teams, kickoff, format, venue, officials, notes, fee), or the match is no longer scheduled: the watch's next sync brings the change, or takes the match off."),
    })
    .meta({ id: "MatchOnWatch", description: "A match on one of the account's linked watches (SYNC-14): in the watch's latest download of its next matches." });

export const AccountStorage = z
    .object({
        usedBytes: z.number().int().nonnegative().describe("Photos and tracks on this account."),
        limitBytes: z.number().int().positive().optional().describe("How much it may keep (SEC-6); absent when this server sets no limit."),
    })
    .meta({ id: "AccountStorage" });

// Plans (PLAN-1 to PLAN-9): named sets of limits; every account is in one.

const allowed = (what: string) => z.int().min(0).max(1_000_000_000).optional().describe(`${what} Left out: no limit; 0: none at all.`);

export const PlanLimits = z
    .object({
        matches: allowed("Matches kept, not counting deleted ones; matches recorded on a watch are never refused."),
        referees: allowed("Referees kept."),
        venues: allowed("Venues kept."),
        storageMb: allowed("Megabytes of photos and tracks (SEC-6); a track recorded on a watch is never refused."),
        photoMb: allowed("The largest photo, in megabytes; the server's own most, 10 MB, still applies."),
        fileMb: allowed("The largest file brought in (an import or a restore), in megabytes; the server's own most for each (5 MB and 2 GB) still applies."),
        devices: allowed("Watches and phones signed in at once (PLAN-7); browsers don't count."),
        pushPerDay: allowed("Phone notifications a day (from midnight UTC), across all the account's phones (PLAN-8)."),
        apiKeys: allowed("API keys (KEY-1)."),
        apiCallsPerMinute: allowed("Requests made with the account's API keys a minute, all its keys together (PLAN-8)."),
        apiCallsPerDay: allowed("Requests made with the account's API keys a day (from midnight UTC), all its keys together (PLAN-8)."),
        webhooks: allowed("Webhooks (HOOK-1)."),
        assignorCalendars: allowed("Assignor calendars (FEED-10)."),
        addressSearchesPerDay: allowed("Address searches a day (from midnight UTC), for placing venues on the map (PLAN-11)."),
    })
    .meta({ id: "PlanLimits", description: "What a plan allows (PLAN-2)." });

export type PlanLimitName = keyof z.infer<typeof PlanLimits>;
export const planLimitNames = Object.keys(PlanLimits.shape) as PlanLimitName[];

export const PlanCode = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and hyphens").min(1).max(40)
    .describe("A plan's short handle, unique on the server, to look it up by (PLAN-1): free, pro, friends-family.");

export const PlanName = z.object({ code: PlanCode, name: z.string() }).meta({ id: "PlanName" });

export const Plan = z
    .object({
        code: PlanCode,
        name: z.string(),
        limits: PlanLimits,
        default: z.boolean().describe("New accounts join it, and accounts given no plan are in it."),
        people: z.int().nonnegative().describe("Accounts in it now."),
        inUse: z.boolean().describe("Something refers to it (an account, an account's next plan, an unused invitation, the sign-up trial, or it's the default), so it can't be deleted."),
    })
    .meta({ id: "Plan", description: "A named set of limits (PLAN-1)." });

export const PlanInput = z
    .object({
        code: PlanCode,
        name: z.string().trim().min(1).max(60),
        limits: PlanLimits,
    })
    .meta({ id: "PlanInput" });

export const SignUpTrial = z
    .object({
        plan: PlanCode,
        days: z.int().min(1).max(366),
    })
    .meta({ id: "SignUpTrial", description: "New accounts start in this plan for these days, then go to the default (PLAN-5)." });

export const Plans = z
    .object({
        plans: z.array(Plan).describe("By name."),
        signUpTrial: SignUpTrial.optional(),
    })
    .meta({ id: "Plans" });

export const PlanSettings = z
    .object({
        default: PlanCode.optional().describe("The plan new accounts join."),
        signUpTrial: SignUpTrial.nullable().optional().describe("null: no trial."),
    })
    .meta({ id: "PlanSettings" });

export const PlanUsage = z
    .object({
        matches: z.int(),
        referees: z.int(),
        venues: z.int(),
        storageMb: z.number().describe("Photos and tracks, in megabytes."),
        devices: z.int().describe("Watches and phones signed in."),
        pushPerDay: z.int().describe("Notifications sent today (UTC)."),
        apiKeys: z.int(),
        apiCallsPerDay: z.int().describe("Requests with the account's API keys today (UTC)."),
        webhooks: z.int(),
        assignorCalendars: z.int().optional().describe("Absent from older servers."),
        addressSearchesPerDay: z.int().optional().describe("Address searches today (UTC); absent from older servers."),
    })
    .meta({ id: "PlanUsage", description: "How much of each limit the account is using; per-minute and per-file limits aren't counted." });

export const AccountPlan = z
    .object({
        plan: PlanName,
        limits: PlanLimits,
        since: Timestamp,
        endsAt: Timestamp.optional().describe("When it ends: the end of endsOn in the account's time zone."),
        endsOn: z.iso.date().optional().describe("Its last day."),
        then: PlanName.optional().describe("The plan that follows when it ends."),
        usage: PlanUsage,
    })
    .meta({ id: "AccountPlan", description: "The signed-in account's plan, when it ends, and what it's using (PLAN-6)." });

export const PlanChange = z
    .object({
        plan: PlanCode,
        endsOn: z.iso.date().optional().describe("Its last day, in the account's time zone; none: it doesn't end."),
        then: PlanCode.optional().describe("The plan after it ends; the default when left out."),
    })
    .meta({ id: "PlanChange", description: "Putting an account in a plan (PLAN-3)." });

export const PlanHistoryEntry = z
    .object({
        from: PlanName.optional().describe("None for the first entry."),
        to: PlanName,
        at: Timestamp,
        reason: z.enum(["sign-up", "invite", "admin", "ended"]).describe("sign-up: joined (a trial, or the default then); invite: joined with an invitation's plan; admin: an admin changed it; ended: the plan before it ended."),
        by: z.string().optional().describe("The admin's name, for reason admin."),
        endsAt: Timestamp.optional().describe("When this one was set to end."),
    })
    .meta({ id: "PlanHistoryEntry" });

export const PersonPlan = z
    .object({
        code: PlanCode,
        name: z.string(),
        endsAt: Timestamp.optional(),
        endsOn: z.iso.date().optional(),
        then: PlanName.optional(),
    })
    .meta({ id: "PersonPlan" });

export const PlanRefusal = z
    .object({
        error: z.string(),
        limit: z.enum(planLimitNames as [PlanLimitName, ...PlanLimitName[]]).optional().describe("The plan's limit that was reached (PLAN-4)."),
        allowed: z.int().optional().describe("What the plan allows of it."),
    })
    .meta({ id: "PlanRefusal", description: "An ApiError; over a plan's limit, it says which (PLAN-4)." });

export const PushHandle = z
    .object({
        handle: z.string().min(1).max(4096).nullable().describe("What the push relay gave this phone (PUSH-2), which only it can read; null to stop notifications."),
    })
    .meta({ id: "PushHandle" });

export const SignOutOthers = z
    .object({
        scope: z.enum(["browsers", "all"]).describe("browsers: other browsers only, so watches and phones stay linked. all: every other device too."),
    })
    .meta({ id: "SignOutOthers" });

export const Person = z
    .object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        status: AccountStatus,
        admin: z.boolean(),
        adminFromSetting: z.boolean().describe("An admin because the server's ADMIN_EMAILS lists them, which the web app can't change."),
        joinedAt: Timestamp,
        lastActiveAt: Timestamp.optional().describe("When one of their devices last used the account; none if never signed in since joining."),
        invitedBy: z.string().optional().describe("The name of the admin whose invitation they joined with."),
        plan: PersonPlan.describe("Their plan (PLAN-3)."),
        lockedUntil: Timestamp.optional().describe("Signing in is refused until then, after too many wrong passwords (SEC-12); Unlock ends it now."),
    })
    .meta({ id: "Person", description: "An account on this server, as an admin sees it (USR-1)." });

export const Invite = z
    .object({
        id: Id,
        email: z.string().optional().describe("Who it's for; only this address can use it. None for a link anyone can use once."),
        name: z.string().optional().describe("Their name, to fill in the sign-up form."),
        link: z.string().describe("The link to send: the web app's invitation page."),
        createdBy: z.string().describe("The name of the admin who made it."),
        createdAt: Timestamp,
        expiresAt: Timestamp,
        usedAt: Timestamp.optional(),
        usedBy: z.string().optional().describe("The name of the account made with it."),
        emailedAt: Timestamp.optional().describe("When it was emailed, if it was."),
        plan: PlanName.optional().describe("The plan the account joins (PLAN-5); the default (or the sign-up trial) when there's none."),
        planDays: z.int().optional().describe("For how many days, then the default plan; none: it doesn't end."),
    })
    .meta({ id: "Invite", description: "An invitation to make an account, even when sign-up is closed (USR-3). It works once, for 14 days." });

export const NewInvite = z
    .object({
        email: z.email().max(254).optional().describe("Who it's for; only this address can use it."),
        name: z.string().trim().min(1).max(100).optional().describe("Their name, to fill in the sign-up form."),
        send: z.boolean().optional().describe("Email it to them (needs email set up on the server, and an email)."),
        plan: PlanCode.optional().describe("The plan the account joins (PLAN-5)."),
        planDays: z.int().min(1).max(366).optional().describe("For how many days, then the default plan."),
    })
    .meta({ id: "NewInvite" });

export const ResetLink = z
    .object({
        link: z.string().describe("The web app's page for choosing a new password. It works once."),
        expiresAt: Timestamp,
    })
    .meta({ id: "ResetLink", description: "A link an admin sends someone who forgot their password, for servers without email (USR-7)." });

const setting = (env: string, about: string) =>
    z.string().max(2000).nullable().optional().describe(`${about} (${env}). null or "" clears it, back to the default.`);

export const ServerSettings = z
    .object({
        signUp: SignUpMode.nullable().optional().describe("Who can make an account (USR-2, SIGN_UP)."),
        smtpUrl: setting("SMTP_URL", "Email through an SMTP server: smtp://user:password@host:587 or smtps://…:465. A secret: never sent back"),
        mailFrom: setting("MAIL_FROM", "The sender, \"LawFive <lawfive@example.com>\""),
        mapStyleUrl: setting("MAP_STYLE_URL", "A MapLibre style for the map, or off for raster tiles"),
        mapStyleDarkUrl: setting("MAP_STYLE_DARK_URL", "The style for dark mode"),
        mapStyleAttribution: setting("MAP_STYLE_ATTRIBUTION", "The style's credit, as HTML"),
        mapTileUrl: setting("MAP_TILE_URL", "Raster tiles, with {z}, {x} and {y}"),
        mapAttribution: setting("MAP_ATTRIBUTION", "The tiles' credit, as HTML"),
        mapSatelliteUrl: setting("MAP_SATELLITE_URL", "Satellite tiles, with the provider's key"),
        mapSatelliteAttribution: setting("MAP_SATELLITE_ATTRIBUTION", "Their credit, as HTML"),
        geocoderUrl: setting("GEOCODER_URL", "Address search (Nominatim-compatible), or off"),
        weatherUrl: setting("WEATHER_URL", "Forecasts (Open-Meteo-compatible), or off"),
        weatherHistoryUrl: setting("WEATHER_HISTORY_URL", "Past weather for played matches, or off"),
        weatherApiKey: setting("WEATHER_API_KEY", "For a paid plan. A secret: never sent back"),
        weatherDailyLimit: setting("WEATHER_DAILY_LIMIT", "Weather calls a day at most"),
        webhookAllowPrivate: setting("WEBHOOK_ALLOW_PRIVATE", "true lets webhooks reach private and local addresses"),
    })
    .meta({
        id: "ServerSettings",
        description: "Settings for the whole server that admins change in the web app (ADM-1, ADM-2), sending only those that change. One the environment sets is fixed there and can't be changed.",
    });

export const NetworkView = z
    .object({
        yourAddress: z.string().describe("The address this server sees the request coming from, after believing the trusted proxies."),
        trustedProxies: z.array(z.string()).describe("TRUSTED_PROXIES: the proxies believed about the visitor's address; empty, none."),
        trustedIpHeader: z.string().optional().describe("TRUSTED_IP_HEADER, when set."),
    })
    .meta({ id: "NetworkView", description: "How the server tells visitors apart, for its limits on tries (SEC-2, SEC-14). Both settings are environment values only." });

export const ServerSettingView = z
    .object({
        key: z.enum(Object.keys(ServerSettings.shape) as [string, ...string[]]),
        env: z.string().describe("Its environment variable."),
        source: z.enum(["environment", "admin", "default"]).describe("environment: set there, so fixed; admin: set in the web app; default: neither."),
        value: z.string().optional().describe("The value in use, when it's set and not a secret."),
        secret: z.literal(true).optional().describe("Never sent back: set says whether it has a value."),
        set: z.boolean().optional(),
    })
    .meta({ id: "ServerSettingView", description: "A server setting as the admin page shows it (ADM-1)." });

export const EmailChange = z
    .object({
        email: z.email().max(254),
        password: z.string().describe("The account's password, to confirm it's them."),
    })
    .meta({ id: "EmailChange" });

export const InviteLookup = z
    .object({
        email: z.string().optional().describe("The address it's for; the sign-up form uses it and doesn't let it be changed."),
        name: z.string().optional(),
        invitedBy: z.string(),
        expiresAt: Timestamp,
    })
    .meta({ id: "InviteLookup", description: "What the invitation page shows before someone signs up with it." });

// Signing in on the phone with a code (APP-13).

export const AppSignIn = z
    .object({
        id: z.string().describe("For GET /v1/app-sign-in/{id}."),
        code: z.string().describe("Eight letters and digits."),
        link: z.string().describe("What the QR code holds: the web app's Get the app page with the code in its fragment, which a phone's camera can open."),
        appLink: z.string().describe("The same as a lawfive:// link, which opens the app."),
        server: z.string().describe("The address to sign in at, for someone typing the code."),
        expiresAt: Timestamp,
    })
    .meta({ id: "AppSignIn", description: "A code that signs a phone in to this account. It works once, for two minutes." });

export const AppSignInStatus = z
    .object({
        status: z.enum(["waiting", "used", "expired"]),
        deviceName: z.string().optional().describe("The phone that used it, when it said which."),
    })
    .meta({ id: "AppSignInStatus" });

export const AppSignInCode = z.object({ code: z.string() }).meta({ id: "AppSignInCode" });

export const AppSignInCheck = z
    .object({ name: z.string(), email: z.string(), expiresAt: Timestamp })
    .meta({ id: "AppSignInCheck", description: "Whose the code is, so the phone can ask before signing in." });

export const AppSignInResult = z
    .object({
        token: z.string().describe("The session token, sent from then on as Authorization: Bearer <token>."),
        user: z.object({ id: z.string(), name: z.string(), email: z.string(), status: AccountStatus }),
    })
    .meta({ id: "AppSignInResult" });

// The calendar feed (CAL-1 to CAL-5).

export const CalendarFeed = z
    .object({
        url: z.string().describe("The feed (https), for calendar apps that ask for an address."),
        webcalUrl: z.string().describe("The same feed as webcal://, which opens the calendar app to subscribe."),
        createdAt: Timestamp,
        lastFetchedAt: Timestamp.optional().describe("When a calendar app last fetched it, to within an hour."),
    })
    .meta({ id: "CalendarFeed", description: "The account's private calendar address (CAL-1). Anyone with it can see the matches in it; make a new one to stop the old one working." });

/** One row of an import (IMP-2): the file's column names (any case or spacing) and their values. */
export const ImportRow = z
    .record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]))
    .meta({ id: "ImportRow", description: "A row as a spreadsheet has it: column names (Home, home_colour and homeColour are the same column) and text, number or true/false values. Empty values change nothing." });

export const MatchImport = z
    .object({
        rows: z.array(ImportRow).min(1).max(1000),
        timeZone: TimeZone.optional().describe("For kickoffs written without a UTC offset, when the row has no Time zone column; the web app sends the browser's. UTC when not given."),
        dateOrder: z.enum(["dmy", "mdy"]).optional().describe("How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) need none. mdy when not given."),
        dryRun: z.boolean().optional().describe("Check every row and say what would happen, without saving anything (IMP-5)."),
    })
    .meta({ id: "MatchImport", description: "Matches to add or update, from a spreadsheet, CSV or JSON file (IMP-1 to IMP-8)." });

export const MatchImportFileFields = z
    .object({
        timeZone: TimeZone.optional().describe("For kickoffs written without a UTC offset, when the row has no Time zone column."),
        dateOrder: z.enum(["dmy", "mdy"]).optional().describe("How to read dates written with slashes or dots (7/11/2026); ISO dates (2026-11-07) are always understood."),
        dryRun: z.enum(["true", "false"]).optional().describe("true: check every row and say what would happen, without saving anything (IMP-5)."),
    })
    .meta({ id: "MatchImportFileFields", description: "The form fields of a file import (multipart/form-data), beside the file." });

export const ImportedRow = z
    .object({
        row: z.int().describe("The row's place in rows, from 1."),
        action: z.enum(["add", "update", "skip"]).describe("skip: it has problems, so it wasn't imported."),
        matchId: Id.optional().describe("The match it added or updated (or would)."),
        title: z.string().optional().describe("The match in a few words, for showing the row: home v away."),
        kickoff: Timestamp.optional().describe("Its kickoff, once imported."),
        problems: z.array(z.string()).describe("Why it's skipped, naming the column; empty when it isn't."),
    })
    .meta({ id: "ImportedRow" });

export const MatchImportResult = z
    .object({
        rows: z.array(ImportedRow).describe("Every row that had anything in it, in order."),
        added: z.int(),
        updated: z.int(),
        skipped: z.int(),
        created: z
            .object({ venues: z.array(z.string()), competitions: z.array(z.string()), referees: z.array(z.string()) })
            .describe("Names the user had no record for, added (or, on a dry run, to be added) (IMP-4)."),
        ignoredColumns: z.array(z.string()).describe("Columns the import doesn't know, as written in the file."),
    })
    .meta({ id: "MatchImportResult" });

export const MatchImportFileResult = MatchImportResult
    .extend({
        file: z.object({
            kind: z.enum(["table", "json"]).describe("table: a row of a CSV or Excel file; json: an item of a JSON list."),
            lines: z.array(z.int()).describe("Where each row is in the file, in the order of rows' row numbers: its line, or its item number."),
        }).describe("How to point at a row in the file."),
    })
    .meta({ id: "MatchImportFileResult", description: "MatchImportResult, for a file (IMP-2)." });

export const RefereeMerge = z
    .object({
        from: z.array(Id).min(1).max(20).describe("The referees to merge into this one; they're deleted."),
        name: z.string().min(1).max(100).describe("The name to keep: one of the referees' names or other names. The rest become other names."),
        email: z.email().optional().describe("When they have different emails, the one to keep; otherwise the one there is."),
        phone: z.string().min(1).max(30).optional().describe("When they have different phone numbers, the one to keep; otherwise the one there is."),
    })
    .meta({ id: "RefereeMerge", description: "Referees to merge into one (DUP-3, DUP-4)." });

export const VenueMerge = z
    .object({
        from: z.array(Id).min(1).max(20).describe("The venues to merge into this one; they're deleted."),
        name: z.string().min(1).max(100).describe("The name to keep: one of the venues' names or other names. The rest become other names."),
        addressFrom: Id.optional().describe("When they have different addresses or parking spots, the venue (this one or one of from) whose address and parking to keep; otherwise the ones there are."),
        pitches: z.array(z.object({
            id: Id.describe("A pitch of one of the venues in from."),
            into: Id.optional().describe("The pitch it's the same as: one of this venue's, or one kept from another. Its matches move to that pitch, its corners walked are added to it, and its name becomes another name of it."),
            name: z.string().min(1).max(60).optional().describe("Without into, the pitch is kept, under this name (its own, or a new one): no other pitch of the merged venue may have it."),
        })).max(200).describe("What happens to each pitch of the venues in from: every one, once."),
    })
    .meta({ id: "VenueMerge", description: "Venues to merge into one (DUP-7): the venue's details, and what happens to each of the others' pitches." });

export const VenueMergeResult = z
    .object({
        venue: Venue.describe("The venue they were merged into, as saved."),
        merged: z.int().describe("How many venues were merged into it (and deleted)."),
        matchesUpdated: z.int().describe("Matches that now point at it, and at its pitches."),
    })
    .meta({ id: "VenueMergeResult" });

export const RefereeMergeResult = z
    .object({
        referee: Referee.describe("The referee they were merged into, as saved."),
        merged: z.int().describe("How many referees were merged into it (and deleted)."),
        matchesUpdated: z.int().describe("Matches whose crew now names it, including crew typed as one of its names."),
    })
    .meta({ id: "RefereeMergeResult" });

// Finding duplicates and previewing a merge (DUP-11): the server works out everything the apps show,
// so the website and the phones only present it.

export const MatchCount = z
    .object({
        played: z.int(),
        upcoming: z.int().describe("Scheduled matches."),
        last: Timestamp.optional().describe("The latest played match's kickoff."),
    })
    .meta({ id: "MatchCount", description: "How many matches a venue or referee has, or several as if merged." });

export const DuplicateMember = z
    .object({
        id: Id,
        name: z.string(),
        aliases: z.array(z.string()).describe("Its other names (DUP-6, DUP-9)."),
        address: z.string().optional().describe("A venue's."),
        pitches: z.int().optional().describe("A venue's number of pitches."),
        email: z.string().optional().describe("A referee's."),
        phone: z.string().optional().describe("A referee's."),
        matches: MatchCount,
        reasons: z.array(z.string()).optional().describe("Why it's likely the same as the one asked about (\"Same address\", \"Same name, in a different order\"), surest first; for the likeliest only."),
    })
    .meta({ id: "DuplicateMember", description: "A venue or referee as the duplicate finder and merge preview show it (DUP-2, DUP-7)." });

export const DuplicateGroups = z
    .object({
        groups: z.array(z.object({
            reasons: z.array(z.string()).describe("Why they're probably one, in a few words each."),
            members: z.array(DuplicateMember).min(2).describe("Most matches first: the one a merge keeps unless the user picks another."),
        })).describe("Groups that are probably one venue or person, surest first."),
        of: z.int().describe("How many venues or referees there are in all."),
    })
    .meta({ id: "DuplicateGroups", description: "Likely duplicates across all of the user's venues or referees (DUP-1, DUP-7)." });

export const LikelyDuplicates = z
    .object({ likely: z.array(DuplicateMember).describe("At most six, likeliest first, each with its reasons.") })
    .meta({ id: "LikelyDuplicates", description: "The venues or referees most likely the same as one (Merge with…, DUP-1, DUP-7)." });

export const NotTheSame = z
    .object({ others: z.array(Id).min(1).max(20).describe("Venues or referees that aren't the same as this one, nor as each other.") })
    .meta({ id: "NotTheSame", description: "Venues or referees the user says are different, so they aren't suggested together again (DUP-5)." });

export const RefereeMergeDraft = z
    .object({
        from: RefereeMerge.shape.from,
        name: z.string().max(100).optional().describe("The name chosen so far; left out, or not one of theirs, the kept referee's."),
        email: z.string().max(254).optional().describe("The email chosen so far, where they differ."),
        phone: z.string().max(30).optional().describe("The phone number chosen so far, where they differ."),
    })
    .meta({ id: "RefereeMergeDraft", description: "A referee merge as chosen so far, to preview (DUP-4)." });

export const RefereeMergePreview = z
    .object({
        referees: z.array(DuplicateMember).describe("The referee kept, then the others, in the order sent; each with its reasons when it's among the likeliest."),
        names: z.array(z.string()).describe("Every name to choose from: theirs and their other names, once each. The rest become other names."),
        name: z.string().describe("The name that will be kept."),
        emails: z.array(z.string()).describe("Their emails, once each: a choice when there's more than one."),
        email: z.string().optional(),
        phones: z.array(z.string()).describe("Their phone numbers, once each: a choice when there's more than one."),
        phone: z.string().optional(),
        together: MatchCount.describe("Their matches as one referee, crew typed in under one of their names included; a match counts once."),
        merge: RefereeMerge.describe("What to send to POST /v1/referees/{id}/merge to merge exactly this."),
    })
    .meta({ id: "RefereeMergePreview", description: "What merging these referees would make (DUP-4, DUP-11)." });

const PitchChoice = z.object({
    id: Id,
    into: Id.optional().describe("The pitch it's the same as."),
    name: z.string().max(60).optional().describe("Without into, kept, under this name."),
});

export const VenueMergeDraft = z
    .object({
        from: VenueMerge.shape.from,
        name: z.string().max(100).optional().describe("The name chosen so far; left out, or not one of theirs, the kept venue's."),
        addressFrom: Id.optional().describe("The venue whose address and parking were chosen so far, where they differ."),
        pitches: z.array(PitchChoice).max(200).optional().describe("The pitches the user has chosen for so far; the rest get the suggestion. A name can be empty while it's being typed."),
    })
    .meta({ id: "VenueMergeDraft", description: "A venue merge as chosen so far, to preview (DUP-7, DUP-8)." });

export const VenueMergePreview = z
    .object({
        venues: z.array(DuplicateMember).describe("The venue kept, then the others, in the order sent; each with its reasons when it's among the likeliest."),
        names: z.array(z.string()).describe("Every name to choose from: theirs and their other names, once each. The rest become other names."),
        name: z.string().describe("The name that will be kept."),
        places: z.array(z.object({
            venueId: Id,
            address: z.string().optional(),
            onMap: z.boolean().describe("Whether its parking is on the map."),
        })).describe("Their different addresses and parking spots, once each: a choice when there's more than one."),
        addressFrom: Id.optional().describe("The venue whose address and parking will be kept."),
        pitches: z.array(z.object({
            id: Id,
            name: z.string().describe("Its name now."),
            venue: z.string().optional().describe("The venue it's from, when there are several."),
            matches: z.int(),
            corners: z.int().describe("How many times its corners were walked on the watch (TRK-13)."),
            onMap: z.boolean(),
            check: z.boolean().describe("Whether to look at it first (shown as Check); the rest are likely fine."),
            why: z.string().describe("Why it's suggested as it is, in a few words."),
            choice: PitchChoice.omit({ id: true }).describe("What happens to it: the user's choice, else the suggestion."),
            targets: z.array(z.object({ id: Id, name: z.string() })).describe("The pitches it can be the same as: those the merged venue keeps, under the names they'll have."),
            problem: z.string().optional().describe("What's wrong with its choice; the merge waits until there's none."),
        })).describe("Every pitch of the venues merged away, riskiest first, then more matches and corners walked first (DUP-8). The order depends only on the venues, so rows stay put while the choices change."),
        notes: z.array(z.string()).describe("Things to know, such as corners walked over the 20 a pitch keeps."),
        problems: z.int().describe("Pitches that need a look before merging."),
        together: MatchCount.describe("Their matches, at one venue."),
        merge: VenueMerge.optional().describe("What to send to POST /v1/venues/{id}/merge to merge exactly this; none while there are problems."),
    })
    .meta({ id: "VenueMergePreview", description: "What merging these venues would make (DUP-7, DUP-8, DUP-11)." });
