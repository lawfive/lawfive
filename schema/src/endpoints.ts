import { z } from "zod";
import {
    AccountPlan, AccountStorage, AssignorCalendar, AssignorCalendarChange, AssignorCalendarLink, AssignorCalendarPreview, NewAssignorCalendar, PlanChange, PlanHistoryEntry, PlanInput, PlanRefusal, PlanSettings, Plans, Plan, PushHandle, SignOutOthers,
    Account, ApiError, AppSignIn, AppSignInCheck, AppSignInCode, AppSignInResult, AppSignInStatus, RestoreResult, MatchShare, SharedMatch, Attachment, AttachmentChange, AttachmentRecordType, AttachmentUpload, ApiKey, AuthError, CalendarFeed, NetworkView, ChangesPage, type CollectionName, AccountName, CreatedApiKey, Device, DeviceCode, DeviceToken, EmailChange, EmailConfirmation, Invite, MatchOnWatch, NameChange,
    InviteLookup, ApiKeyChange, MatchNotice, MatchImport, MatchImportFileFields, MatchImportFileResult, MatchImportResult, NewApiKey, DuplicateGroups, LikelyDuplicates, NotTheSame, RefereeMerge, RefereeMergeDraft, RefereeMergePreview, RefereeMergeResult, VenueMerge, VenueMergeDraft, VenueMergePreview, VenueMergeResult, NewInvite, OAuthError, Person, Place, ResetLink, ServerMeta, ServerSettings, ServerSettingView, Session, User, ValidationError, Webhook, WebhookDelivery, WebhookInput, WebhookPayload, WebhookTopic, CreatedWebhook, WatchMatch, WatchTrackChunk, WatchTrackResult, WatchUpload,
    WatchUploadResult, WatchFeeChange, WatchPitchMarking, WatchScreenChange, collections,
} from "./api.ts";
import { Id, Timestamp } from "./common.ts";
import { TeamSwipes } from "./records.ts";
import { SchemeId } from "./misconduct.ts";
import { importColumnsMarkdown } from "./importColumns.ts";
import { QuizBank } from "./quiz.ts";
import { GamesQuery, Stats, StatsQuery } from "./stats.ts";
import { MatchTrack, PitchOutline, TrackSummary } from "./track.ts";
import { MatchWeather } from "./weather.ts";

// Every endpoint of the API (v1), with what it takes and returns, as data: generate.ts turns this
// into generated/openapi.json and generated/API.md, and the server's tests check its routes and
// answers against it.

export interface EndpointResponse {
    description: string;
    /** The JSON body; none for an empty answer. */
    body?: z.ZodType;
    /** A plain-text body instead. */
    text?: string;
    /** A CSV body instead (any text). */
    csv?: true;
    /** An iCalendar body instead (RFC 5545, text/calendar). */
    calendar?: true;
    /** An image body instead (JPEG, PNG or WebP). */
    image?: true;
    /** A zip file instead (application/zip). */
    zip?: true;
    headers?: Record<string, string>;
}

export interface Endpoint {
    method: "get" | "post" | "put" | "patch" | "delete";
    /** OpenAPI style: /v1/matches/{id}. */
    path: string;
    group: string;
    summary: string;
    description?: string;
    /** false for endpoints that work without signing in. */
    signedIn?: false;
    /** Only there when GET /v1/meta lists this capability. */
    capability?: string;
    /** What an API key needs to use it ("matches:write"; "*:read" for any read); none when keys can't (KEY-3). */
    keyScope?: string;
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodType;
    /** A multipart/form-data body instead: its text fields, and its files with what each is. */
    form?: { fields: z.ZodObject; files: Record<string, string> };
    /** A file as the whole body instead: its type, and what it is. */
    file?: { contentType: string; description: string };
    responses: Record<number, EndpointResponse>;
}

/** The groups, in order, with what they're for. */
export const groups: Record<string, string> = {
    Server: "What the server is and offers.",
    Accounts: "Signing up, in and out (Better Auth's endpoints). Browsers keep the session in a cookie and must send an Origin header matching the server's address; apps send no Origin, take the token from the set-auth-token response header and send it as Authorization: Bearer <token>.",
    "Linking a watch": "A watch links to an account with a code (RFC 8628): it asks for a code and shows it, someone signed in enters it on the web app's Link page and approves it, and the watch, polling meanwhile, gets its own token. That token only reaches the watch's endpoints (/v1/watch/), and of the account endpoints only sign-out and get-session (SEC-13); anything else answers 403.",
    Records: "The user's records, one collection per kind. Ids are UUIDs made by the client, so a record created offline keeps its id. Every change raises version; an update sends the version it last saw and gets 409 if the record changed in the meantime. Deleted records are kept as markers so other devices learn of the deletion.",
    Tracks: "GPS and heart rate for a match report (TRK-1 to TRK-3), in LawFive's own format whatever recorded them: convert from the source (RefSix, an activity file, a phone's health store) before uploading. Not part of sync, as tracks are big; fetch one when it's shown. The figures (distance, speeds, sprints, heart rate and zones) are worked out by the server each time.",
    Sync: "Everything that changed since a device last looked.",
    People: "Admins (USR-1) see everyone on the server, approve or decline new accounts (USR-4), make other admins, and make password reset links, suspend and delete accounts, and change who can sign up (USR-7); and make plans, named sets of limits, and put each account in one (PLAN-1 to PLAN-5). Everyone else gets 403.",
    "App sign-in": "Signing in on a phone with a code the web app shows, as a QR code or in letters (APP-13), instead of typing a password.",
    Invitations: "Links that let someone make an account even when sign-up is closed (USR-3). Admins make and cancel them; the link opens the web app's invitation page, which looks the invitation up and signs up with it.",
    Import: "Adding and updating matches from a spreadsheet, CSV or JSON file (IMP-1 to IMP-8). Apps read the file into rows; the server matches each row to a match (by LawFive id, else match number), finds or adds the venues, competitions and referees it names, and saves only what the row fills in. Check first with dryRun.",
    "Assignor calendars": "An assignor system's private calendar link (ArbiterSports, Assignr, HorizonWebRef, RefTown and others give each official one), which the server reads every 30 minutes into the account's matches through the import (FEED-1 to FEED-10): new games added, moved ones changed, ones gone before kickoff canceled. The link is a password, so it's kept encrypted and never sent back. Only a signed-in session can manage them.",
    Calendar: "A private calendar feed of the user's matches (CAL-1 to CAL-5), for calendar apps to subscribe to.",
    Stats: "Reports on the user's games (STAT-1 to STAT-4), worked out by the server so every app shows the same.",
    Devices: "Where the account is signed in.",
    Attachments: "Photos on matches, venues and referees (FILE-1 to FILE-5), kept by the server on its disk or in S3-compatible storage. Upload the file as multipart/form-data, ideally already made smaller (the web app sends at most 2000 pixels on the longest side, as a JPEG without its location and camera details) with a thumbnail; the server keeps what it's sent. The files are private: fetch them with the same sign-in. Deleting the record deletes its attachments. Only a signed-in session can use them for now.",
    Export: "Everything in the account as one zip (DATA-2), and restoring one into an account (DATA-4), for backups and moving between servers. The zip has lawfive.json (what it is), README.md, records/<collection>.json (each an array of records as the API gives them), tracks/<match record id>.json, attachments.json and the photos in attachments/. Only a signed-in session can use them.",
    Sharing: "A match's share link (DATA-7): an address nobody can guess that shows the match, its log and its track to anyone who has it, without signing in. Never the notes, fee, crew, contacts, player names or photos.",
    Webhooks: "URLs that hear about changes to the account's records (HOOK-1 to HOOK-5): matches, match reports, venues, referees, competitions and templates, however they were made (the web app, the API, a watch, an import). Each delivery is a signed JSON POST (WebhookPayload), retried up to five times over about three hours when it doesn't get a 2xx answer. Only a signed-in session can manage them.",
    "API keys": "Keys for scripts and integrations (KEY-1 to KEY-4), made in the web app's Settings. A key is sent like a session token, Authorization: Bearer <key>, and can use only the collections it was given (read, or read and write), plus the weather (with matches:read) and address search (with venues:write). Keys can't manage devices or other keys, and only a signed-in session can make or delete them.",
    Watch: "What a Garmin watch uses, shaped for its little memory: matches in the form it starts one from, and finished matches as it saved them.",
    Places: "Address search for placing venues on the map.",
    Quiz: "The Laws of the Game quiz's questions (QUIZ-1).",
    Weather: "Forecasts for the user's matches, and the weather finished matches were played in (WX-1 to WX-8). The server fetches and keeps forecasts; apps never call the weather service themselves.",
};

/**
 * An endpoint's answers. LawFive's own signed-in endpoints (not Better Auth's) can also answer 401
 * (not signed in, or an unknown or expired key) and 403 (an API key without access to it, or an
 * account waiting for approval).
 */
export function responsesOf(e: Endpoint): Record<number, EndpointResponse> {
    // SEC-2, SEC-3: any endpoint can answer that it's had too many tries, or too much to read.
    const limits = {
        413: e.responses[413] ?? { description: "The request is too big.", body: ApiError },
        429: e.responses[429] ?? { description: "Too many tries from this address; the Retry-After header says how many seconds to wait.", body: ApiError },
    };
    if (e.signedIn === false || e.path.startsWith("/v1/auth/")) {
        return { ...e.responses, ...limits };
    }
    return {
        ...e.responses,
        ...limits,
        401: e.responses[401] ?? { description: "Not signed in, the session has ended, or the API key is unknown or has expired.", body: ApiError },
        403: e.responses[403] ?? { description: `${e.keyScope ? `An API key without ${e.keyScope}` : "An API key: this needs signing in"}; or the account is waiting for approval (USR-4).`, body: ApiError },
    };
}

const patterns = () => endpoints.map((e) => ({ e, pattern: new RegExp(`^${e.path.replace(/\{\w+\}/g, "[^/]+")}$`) }));
let compiled: ReturnType<typeof patterns> | undefined;

/** The described endpoint for a request path, if there is one. */
export function findEndpoint(method: string, path: string): Endpoint | undefined {
    compiled ??= patterns();
    return compiled.find(({ e, pattern }) => e.method === method.toLowerCase() && pattern.test(path))?.e;
}

const jsonError = (description: string): EndpointResponse => ({ description, body: ApiError });
/** A refusal that can be a plan's limit (PLAN-4), saying which. */
const planRefused = (description: string): EndpointResponse => ({ description, body: PlanRefusal });

/** A track with its figures, for its owner and on a shared match. */
const TrackView = z.object({
    track: MatchTrack,
    summary: TrackSummary,
    pitch: PitchOutline.optional().describe("The pitch: the track's own (marked by the referee, or from RefSix), else from corners walked on the watch (TRK-13), else one found from where the referee went (TRK-9), when there's enough GPS."),
    heat: z.object({
        cols: z.int(),
        rows: z.int(),
        lengthM: z.number(),
        widthM: z.number(),
        total: z.array(z.number()).describe("Seconds in each cell, row by row from the top of the drawing, left to right."),
        periods: z.array(z.object({ period: z.int(), cells: z.array(z.number()) })),
    }).optional().describe("Where the time was spent on the pitch, turned as the match page draws it (TRK-9), for apps that draw it rather than work it out. None without a pitch, or for a fourth official."),
    updatedAt: Timestamp,
});
const authError = (description: string): EndpointResponse => ({ description, body: AuthError });
const oauthError = (description: string): EndpointResponse => ({ description, body: OAuthError });
const success = z.object({ success: z.literal(true) });
const tokenHeader = { "set-auth-token": "The session token, for apps to send as Authorization: Bearer <token>." };
const idParam = z.object({ id: Id });

/** How the collections are named in words, and anything particular about one. */
export const collectionDocs: Record<CollectionName, { one: string; many: string; note?: string }> = {
    matches: { one: "match", many: "matches" },
    "match-templates": { one: "match template", many: "match templates" },
    "match-records": { one: "match record", many: "match records", note: "Watches upload theirs through POST /v1/watch/records instead." },
    venues: { one: "venue", many: "venues" },
    competitions: { one: "competition", many: "competitions" },
    referees: { one: "referee", many: "referees" },
    settings: { one: "settings record", many: "settings records", note: "There's one per user: create it once, then update it." },
};

function recordEndpoints(collection: CollectionName): Endpoint[] {
    const { record, input } = collections[collection];
    const { one, many, note } = collectionDocs[collection];
    const path = `/v1/${collection}`;
    const conflict = z.object({ error: z.string(), current: record.optional().describe("The record as it is now, when it changed since the version sent.") });
    const extra = note ? ` ${note}` : "";
    return [
        {
            method: "get", path, group: "Records", keyScope: `${collection}:read`, summary: `The user's ${many}`,
            description: `Every ${one} that isn't deleted, oldest change first.`,
            responses: { 200: { description: `The ${many}.`, body: z.object({ items: z.array(record) }) } },
        },
        {
            method: "get", path: `${path}/{id}`, group: "Records", keyScope: `${collection}:read`, summary: `One ${one}`,
            description: "Deleted ones too, with deletedAt set.",
            params: idParam,
            responses: { 200: { description: `The ${one}.`, body: record }, 404: jsonError("Not found, or not this user's.") },
        },
        {
            method: "put", path: `${path}/{id}`, group: "Records", keyScope: `${collection}:write`, summary: `Save a ${one}`,
            description: `Creates the ${one} (send no version) or updates it (send the version you last saw).${extra} Saving a deleted record brings it back.`,
            params: idParam,
            body: input,
            responses: {
                200: { description: "Updated; version is raised.", body: record },
                201: { description: "Created, at version 1.", body: record },
                400: { description: "The id isn't a UUID, the body's id differs from the URL's, or the body doesn't match the schema (issues lists the problems).", body: ValidationError.partial({ issues: true }) },
                ...(["matches", "referees", "venues"].includes(collection)
                    ? { 403: planRefused(`An API key without ${collection}:write, or the account waiting for approval; or a new ${one} over the plan's limit (PLAN-4).`) } as Record<number, EndpointResponse>
                    : {}),
                409: { description: "It changed since the version sent (current is the record as it is now), the id belongs to another kind of record, or it would duplicate another (a match's external id, a second settings record).", body: conflict },
            },
        },
        {
            method: "delete", path: `${path}/{id}`, group: "Records", keyScope: `${collection}:write`, summary: `Delete a ${one}`,
            description: `Marks it deleted; it stays as a marker so other devices hear of it. Deleting it again changes nothing.${collection === "matches"
                ? " Its match records go with it, marked deleted the same way, and their tracks are deleted (RES-8); saving the match again doesn't bring them back."
                : ""}`,
            params: idParam,
            query: z.object({ version: z.int().min(1).optional().describe("The version last seen; when given, the delete fails if it has changed since.") }),
            responses: {
                200: { description: "Deleted: the record with deletedAt.", body: record },
                404: jsonError("Not found, or not this user's."),
                409: { description: "It changed since the version sent.", body: conflict.required({ current: true }) },
            },
        },
    ];
}

export const endpoints: Endpoint[] = [
    {
        method: "get", path: "/health", group: "Server", signedIn: false, summary: "Is the server up",
        description: "Answers 503 if the server can't reach its database within 2 seconds, for Docker's healthcheck (ADM-7). Other services, such as weather or email, don't affect it.",
        responses: { 200: { description: "It is.", text: "ok" }, 503: { description: "It can't reach its database.", text: "database unavailable" } },
    },
    {
        method: "get", path: "/v1/meta", group: "Server", signedIn: false, summary: "What this server offers",
        description: "The API version and capabilities, the map tiles to use and the data providers to credit. Apps check capabilities before using geocode or weather, which a server can switch off.",
        responses: { 200: { description: "The server's description.", body: ServerMeta } },
    },

    {
        method: "get", path: "/v1/openapi.json", group: "Server", signedIn: false, summary: "This server's API, as OpenAPI",
        description: "The whole API as OpenAPI 3.1, for this server's version and address, so a client or an AI agent can work from what this server really does. About 340 KB, or much less compressed; https://lawfive.dev/llms.txt lists the same as smaller pages (AGT-3).",
        responses: { 200: { description: "The description.", body: z.looseObject({ openapi: z.literal("3.1.0") }) } },
    },

    {
        method: "post", path: "/v1/auth/sign-up/email", group: "Accounts", signedIn: false, summary: "Make an account",
        description: "Signs the new account in. With SIGN_UP=closed only an invitation can make one; with SIGN_UP=approval the account is pending until an admin approves it (USR-2 to USR-4). An address in ADMIN_EMAILS without an invitation is pending even when sign-up is open (SEC-8). A new server's first account needs the setupCode from its logs (ADM-5).",
        body: z.object({
            name: AccountName,
            email: z.string(),
            password: z.string().min(8).max(128),
            invite: z.string().optional().describe("The token from an invitation link (USR-3): the account is active straight away, whatever the sign-up setting."),
        }),
        responses: {
            200: { description: "Made and signed in. The user's status is pending when it waits for approval.", body: z.looseObject({ token: z.string().nullable(), user: User }), headers: tokenHeader },
            400: authError("Not allowed: an invalid email, a name that's empty or over 100 characters (INVALID_NAME, USR-10), a password that's too short or long, sign-up is closed (SIGN_UP_CLOSED), or the invitation isn't valid (INVITE_INVALID) or is for another address (INVITE_EMAIL_MISMATCH)."),
            403: authError("A browser request whose Origin isn't the server's."),
            422: authError("An account with this email already exists."),
        },
    },
    {
        method: "post", path: "/v1/auth/sign-in/email", group: "Accounts", signedIn: false, summary: "Sign in",
        body: z.object({ email: z.string(), password: z.string(), rememberMe: z.boolean().optional() }),
        responses: {
            200: { description: "Signed in.", body: z.looseObject({ redirect: z.boolean(), token: z.string(), user: User }), headers: tokenHeader },
            401: authError("Wrong email or password."),
            403: authError("A browser request whose Origin isn't the server's, the account is suspended (ACCOUNT_SUSPENDED, USR-7), or a phone signing in to an account that already has as many watches and phones as its plan allows (DEVICE_LIMIT, PLAN-7)."),
            429: authError("Too many tries from this address (SEC-2), or too many wrong passwords for this email address (ACCOUNT_LOCKED, SEC-12): after 5 in a row it's locked for a minute, doubling to at most an hour, and even the right password waits. Retry-After says how long; resetting the password ends it."),
        },
    },
    {
        method: "post", path: "/v1/auth/request-password-reset", group: "Accounts", signedIn: false, summary: "Email a password reset link",
        description: "When the server can send email (the email capability), emails a link to the web app's page for choosing a new password; it works once, for an hour (USR-7). The answer is the same whether or not there's an account with the address. Without email, an admin makes a link instead (POST /v1/people/{id}/reset-link).",
        body: z.object({ email: z.string(), redirectTo: z.string().optional().describe("Ignored: the link always opens the web app's reset page.") }),
        responses: {
            200: { description: "Emailed, if there's an account with the address.", body: z.object({ status: z.literal(true), message: z.string() }) },
            400: authError("The server can't send email (RESET_PASSWORD_DISABLED), or the address isn't valid."),
            403: authError("A browser request whose Origin isn't the server's."),
        },
    },
    {
        method: "post", path: "/v1/auth/reset-password", group: "Accounts", signedIn: false, summary: "Choose a new password",
        description: "With the token from a reset link, emailed or made by an admin (USR-7). Devices already signed in stay signed in. It also ends a lock after too many wrong passwords (SEC-12).",
        body: z.object({ newPassword: z.string().min(8).max(128), token: z.string() }),
        responses: {
            200: { description: "Changed; sign in with it.", body: z.object({ status: z.literal(true) }) },
            400: authError("The link was used, has expired or is mistyped (INVALID_TOKEN), or the password is too short or long."),
            403: authError("A browser request whose Origin isn't the server's."),
        },
    },
    {
        method: "post", path: "/v1/auth/change-password", group: "Accounts", summary: "Change the password",
        description: "Needs the current password (USR-7).",
        body: z.object({ currentPassword: z.string(), newPassword: z.string().min(8).max(128), revokeOtherSessions: z.boolean().optional().describe("Sign out everywhere else too, linked watches included.") }),
        responses: {
            200: { description: "Changed.", body: z.looseObject({ token: z.string().nullable(), user: User }) },
            400: authError("The current password is wrong (INVALID_PASSWORD), or the new one is too short or long."),
            401: authError("Not signed in."),
            403: authError("A browser request whose Origin isn't the server's."),
        },
    },
    {
        method: "post", path: "/v1/auth/update-user", group: "Accounts", summary: "Change the account's name",
        description: "Better Auth's own endpoint, open only to the name (USR-10): the same rule as signing up, 1 to 100 characters with spaces at either end trimmed. GET /v1/account and get-session give the new name straight away.",
        body: NameChange,
        responses: {
            200: { description: "Changed.", body: z.object({ status: z.literal(true) }) },
            400: authError("The name is empty or longer than 100 characters, or the body has something besides the name (INVALID_NAME)."),
            401: authError("Not signed in."),
            403: authError("A browser request whose Origin isn't the server's, or a watch's link (WATCH_ONLY)."),
        },
    },
    {
        method: "post", path: "/v1/auth/sign-out", group: "Accounts", signedIn: false, summary: "Sign out",
        description: "Ends this session. To sign out another device, use DELETE /v1/devices/{id}.",
        body: z.object({}),
        responses: { 200: { description: "Signed out.", body: success } },
    },
    {
        method: "get", path: "/v1/auth/get-session", group: "Accounts", signedIn: false, summary: "Who is signed in",
        responses: { 200: { description: "The session and account, or null when not signed in.", body: z.object({ session: Session, user: User }).nullable() } },
    },

    {
        method: "post", path: "/v1/auth/device/code", group: "Linking a watch", signedIn: false, summary: "Ask for a linking code",
        description: "Step 1, from the watch. Codes last 10 minutes.",
        body: z.object({ client_id: z.literal("lawfive-garmin").describe("The app asking; only known apps can link."), scope: z.string().optional() }),
        responses: { 200: { description: "A code to show.", body: DeviceCode }, 400: oauthError("Not a known app (invalid_client).") },
    },
    {
        method: "get", path: "/v1/auth/device", group: "Linking a watch", signedIn: false, summary: "Look up a code",
        description: "Step 2, from the Link page. Signed in, it also claims the code for this session, which approving or refusing it needs.",
        query: z.object({ user_code: z.string().describe("The code the watch shows.") }),
        responses: {
            200: { description: "The code is waiting.", body: z.object({
                user_code: z.string(),
                status: z.enum(["pending", "approved", "denied"]),
                client_id: z.string().optional().describe("The app asking to link (lawfive-garmin), when signed in."),
                device_name: z.string().optional().describe("The watch asking, \"Garmin Venu 2\", when it said which it is (its X-LawFive-Device header)."),
                scope: z.string().nullable().optional(),
            }) },
            400: oauthError("No such code, or it has expired."),
        },
    },
    {
        method: "post", path: "/v1/auth/device/approve", group: "Linking a watch", summary: "Approve a code",
        description: "Step 2, after the lookup: links the watch to the signed-in account.",
        body: z.object({ userCode: z.string() }),
        responses: {
            200: { description: "Approved; the watch's next poll gets its token.", body: success },
            400: oauthError("No such code, it has expired, or it wasn't looked up first."),
            401: oauthError("Not signed in."),
            403: authError("The account is waiting for approval (ACCOUNT_PENDING), or already has as many watches and phones as its plan allows (DEVICE_LIMIT, PLAN-7)."),
        },
    },
    {
        method: "post", path: "/v1/auth/device/deny", group: "Linking a watch", summary: "Refuse a code",
        body: z.object({ userCode: z.string() }),
        responses: {
            200: { description: "Refused; the watch's next poll gets access_denied.", body: success },
            400: oauthError("No such code, it has expired, or it wasn't looked up first."),
            401: oauthError("Not signed in."),
        },
    },
    {
        method: "post", path: "/v1/auth/device/token", group: "Linking a watch", signedIn: false, summary: "Poll for the token",
        description: "Step 3, from the watch, every interval seconds until it's approved, refused or expired.",
        body: z.object({
            grant_type: z.literal("urn:ietf:params:oauth:grant-type:device_code"),
            device_code: z.string(),
            client_id: z.string(),
        }),
        responses: {
            200: { description: "Approved: the watch's token, which only reaches the watch's endpoints (SEC-13).", body: DeviceToken },
            400: oauthError("Not yet (authorization_pending), too often (slow_down), refused (access_denied) or expired (expired_token)."),
        },
    },

    ...(Object.keys(collections) as CollectionName[]).flatMap(recordEndpoints),

    {
        method: "get", path: "/v1/match-records/{id}/track", group: "Tracks", keyScope: "match-records:read", summary: "A match report's track",
        description: "With its figures, over the periods played when the match report has their start times.",
        params: idParam,
        responses: {
            200: { description: "The track and its figures.", body: TrackView },
            404: jsonError("No track for this match report, or no such match report."),
        },
    },
    {
        method: "put", path: "/v1/match-records/{id}/track", group: "Tracks", keyScope: "match-records:write", summary: "Upload a match report's track",
        description: "Replaces any track the match report had. Up to 43,200 samples (12 hours at one a second) in each series.",
        params: idParam,
        body: MatchTrack,
        responses: {
            200: { description: "Replaced the track it had.", body: z.object({ summary: TrackSummary, updatedAt: Timestamp }) },
            201: { description: "Stored.", body: z.object({ summary: TrackSummary, updatedAt: Timestamp }) },
            400: { description: "The body doesn't match the schema (issues lists the problems).", body: ValidationError },
            404: jsonError("No such match report: save it first."),
        },
    },
    {
        method: "put", path: "/v1/match-records/{id}/track/pitch", group: "Tracks", keyScope: "match-records:write", summary: "Mark where the pitch is",
        description: "The two corners of one touchline and the center spot, as the referee placed them (TRK-9); kept with the track, marked by: referee. Heatmaps and Stats use it.",
        params: idParam,
        body: PitchOutline.omit({ by: true }),
        responses: {
            200: { description: "Kept.", body: z.object({ pitch: PitchOutline, updatedAt: Timestamp }) },
            400: { description: "The body doesn't match the schema.", body: ValidationError },
            404: jsonError("No track for this match report."),
        },
    },
    {
        method: "delete", path: "/v1/match-records/{id}/track/pitch", group: "Tracks", keyScope: "match-records:write", summary: "Forget where the pitch is",
        description: "Back to the pitch found from the track (TRK-9).",
        params: idParam,
        responses: {
            200: { description: "Forgotten; pitch is the one found from the track, when there's enough GPS.", body: z.object({ pitch: PitchOutline.optional(), updatedAt: Timestamp }) },
            404: jsonError("No track for this match report."),
        },
    },
    {
        method: "delete", path: "/v1/match-records/{id}/track", group: "Tracks", keyScope: "match-records:write", summary: "Delete a match report's track",
        description: "The match report stays.",
        params: idParam,
        responses: { 200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("No track for this match report.") },
    },

    {
        method: "get", path: "/v1/changes", group: "Sync", keyScope: "*:read", summary: "Changes since a cursor",
        description: "Every record written after the cursor, deletions included, oldest first, across all collections (for an API key, the ones it can read). Start with since=0, keep the cursor, and ask again while more is true. Changes made at the same time are never skipped.",
        query: z.object({
            since: z.int().min(0).optional().describe("The cursor from the last page; 0 (the default) for everything."),
            limit: z.int().min(1).optional().describe("Changes per page: 500 by default, at most 1000."),
        }),
        responses: { 200: { description: "A page of changes.", body: ChangesPage }, 400: jsonError("since or limit isn't a whole number.") },
    },

    {
        method: "get", path: "/v1/stats", group: "Stats", keyScope: "matches:read", summary: "Stats on the user's games",
        description: "Games are matches played or abandoned. Every figure follows the filters; options lists what the filters can choose from. An API key gets only what its scopes can read: without match-records:read there are no figures from match reports or tracks (distance, discipline, added time, fitness, heatmaps); without settings:read, no heart-rate zones and the standard sprint speed; without venues:read, referees:read or competitions:read, the lists naming them are empty, while the counts stay.",
        query: StatsQuery,
        responses: { 200: { description: "The stats.", body: Stats }, 400: jsonError("A filter isn't valid: from or to isn't a date, an unknown gender or role, or an id isn't a UUID.") },
    },
    {
        method: "get", path: "/v1/stats/games.csv", group: "Stats", keyScope: "matches:read", summary: "The games, as a spreadsheet",
        description: "The games matching the filters (and, optionally, one slice of a chart), oldest first, as CSV with a header row: date, kickoff, competition, home, away, score, role, venue, pitch, age group, gender, distance (m), average heart rate, kickoff temperature (°C), rain (mm), cautions, send-offs, added time (s), fee, currency and paid (STAT-12). For an API key, the columns its scopes can't read are left empty, as for /v1/stats.",
        query: GamesQuery,
        responses: { 200: { description: "The games, as a download (Content-Disposition: attachment).", csv: true }, 400: jsonError("A filter isn't valid.") },
    },

    {
        method: "get", path: "/v1/account", group: "Accounts", summary: "The signed-in account",
        description: "Its status and whether it's an admin. The one endpoint a pending account (USR-4) can use; every other gets 403.",
        responses: { 200: { description: "The account.", body: Account } },
    },
    {
        method: "put", path: "/v1/account/email", group: "Accounts", summary: "Change the account's email",
        description: "With the password, to confirm it's them (USR-7). An address in the server's ADMIN_EMAILS can't be changed here, and can't be changed to. When the server can send email (the email capability), the new address is emailed a link that changes it when followed, once, within 24 hours (USR-9), and the old address keeps working until then; asking again replaces the link. Without email, it changes straight away.",
        body: EmailChange,
        responses: {
            200: { description: "Changed (the server can't send email), or already the account's address.", body: Account },
            202: { description: "A link was emailed to the new address: pendingEmail says which, and pendingEmailUntil until when.", body: Account },
            400: { description: "The address isn't valid, or the password is wrong.", body: ValidationError.partial({ issues: true }) },
            409: jsonError("Another account has the address, or ADMIN_EMAILS lists the old or new one."),
        },
    },
    {
        method: "delete", path: "/v1/account/email", group: "Accounts", summary: "Cancel a change of email",
        description: "The link emailed to the new address stops working (USR-9). Nothing to cancel is fine too.",
        responses: { 200: { description: "Canceled, or there was nothing waiting.", body: Account } },
    },
    {
        method: "post", path: "/v1/account/email/confirm", group: "Accounts", signedIn: false, summary: "Confirm a new email address",
        description: "What the web app's /confirm-email/<token> page sends, signed in or not (USR-9): the account's address becomes the new one, and the old address is told. It doesn't sign anyone in. The link works once, for 24 hours.",
        body: EmailConfirmation,
        responses: {
            200: { description: "Changed.", body: z.object({ email: z.string() }) },
            400: jsonError("The link was used, canceled, replaced by a newer one, has expired or is mistyped."),
            409: jsonError("Another account took the address meanwhile, or ADMIN_EMAILS lists the old or new one."),
        },
    },
    {
        method: "post", path: "/v1/account/delete", group: "Accounts", summary: "Delete the account",
        description: "With the password, to confirm it's them (USR-7). Deletes the account and everything in it, signs out every device and stops its API keys and calendar feed. Refused for the only admin while there are other accounts.",
        body: z.object({ password: z.string() }),
        responses: {
            200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) },
            400: jsonError("The password is wrong."),
            409: jsonError("It's the server's only admin; make someone else an admin first."),
        },
    },

    {
        method: "get", path: "/v1/people", group: "People", summary: "Everyone on the server",
        description: "Waiting for approval first, then everyone else by name.",
        responses: { 200: { description: "The accounts.", body: z.object({ people: z.array(Person) }) }, 403: jsonError("Not an admin.") },
    },
    {
        method: "post", path: "/v1/people/{id}/approve", group: "People", summary: "Approve an account",
        description: "It can use LawFive straight away; they're emailed when the server can send email.",
        params: z.object({ id: z.string() }),
        body: z.object({}),
        responses: { 200: { description: "Approved.", body: Person }, 403: jsonError("Not an admin."), 404: jsonError("No such account.") },
    },
    {
        method: "post", path: "/v1/people/{id}/decline", group: "People", summary: "Decline an account",
        description: "Deletes an account that's waiting for approval. Approved accounts can't be declined.",
        params: z.object({ id: z.string() }),
        body: z.object({}),
        responses: {
            200: { description: "Declined and deleted.", body: z.object({ ok: z.literal(true) }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
            409: jsonError("The account isn't waiting for approval."),
        },
    },
    {
        method: "put", path: "/v1/people/{id}/admin", group: "People", summary: "Make or stop being an admin",
        params: z.object({ id: z.string() }),
        body: z.object({ admin: z.boolean() }),
        responses: {
            200: { description: "Changed.", body: Person },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
            409: jsonError("Your own account, an account waiting for approval, or one that ADMIN_EMAILS makes an admin."),
        },
    },
    {
        method: "put", path: "/v1/people/{id}/plan", group: "People", summary: "Put an account in a plan",
        description: "With an optional last day (in the account's time zone, PLAN-9) and the plan after it, the default when not given (PLAN-3, PLAN-5). Nothing in the account is lost if it's over the new plan's limits; only adding more is refused (PLAN-4).",
        params: z.object({ id: z.string() }),
        body: PlanChange,
        responses: {
            200: { description: "Changed.", body: Person },
            400: { description: "The body doesn't match, there's no such plan, or the last day has passed.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
        },
    },
    {
        method: "get", path: "/v1/people/{id}/plan-history", group: "People", summary: "An account's plans so far",
        description: "Each change of plan, newest first (PLAN-5): whether someone has had a trial, say.",
        params: z.object({ id: z.string() }),
        responses: {
            200: { description: "The changes.", body: z.object({ changes: z.array(PlanHistoryEntry) }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
        },
    },
    {
        method: "put", path: "/v1/people/{id}/suspended", group: "People", summary: "Suspend an account, or undo it",
        description: "A suspended account can't sign in, and is signed out everywhere (linked watches need linking again afterward); its API keys and calendar feed stop working. Its data is kept (USR-7).",
        params: z.object({ id: z.string() }),
        body: z.object({ suspended: z.boolean() }),
        responses: {
            200: { description: "Changed.", body: Person },
            400: jsonError("The body isn't { suspended: true } or { suspended: false }."),
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
            409: jsonError("Your own account, an account waiting for approval, or one that ADMIN_EMAILS makes an admin."),
        },
    },
    {
        method: "post", path: "/v1/people/{id}/unlock", group: "People", summary: "Unlock signing in",
        description: "After too many wrong passwords an account's address is locked for a while (SEC-12); this ends it now. A password reset ends it too.",
        params: z.object({ id: z.string() }),
        body: z.object({}),
        responses: {
            200: { description: "Unlocked.", body: Person },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
        },
    },
    {
        method: "post", path: "/v1/people/{id}/reset-link", group: "People", summary: "Make a password reset link",
        description: "For someone who forgot their password, on any server: the admin sends it to them. It works once, for 24 hours (USR-7).",
        params: z.object({ id: z.string() }),
        body: z.object({}),
        responses: {
            201: { description: "Made.", body: ResetLink },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
            409: jsonError("Your own account (change it in Settings), or one waiting for approval."),
        },
    },
    {
        method: "delete", path: "/v1/people/{id}", group: "People", summary: "Delete an account",
        description: "Deletes the account and everything in it (USR-7). It can't be undone.",
        params: z.object({ id: z.string() }),
        responses: {
            200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such account."),
            409: jsonError("Your own account (delete it in Settings), or one that ADMIN_EMAILS makes an admin."),
        },
    },
    {
        method: "get", path: "/v1/plans", group: "People", summary: "The plans",
        description: "Every plan, with how many accounts are in each, and the sign-up trial (PLAN-1, PLAN-5).",
        responses: { 200: { description: "The plans.", body: Plans }, 403: jsonError("Not an admin.") },
    },
    {
        method: "post", path: "/v1/plans", group: "People", summary: "Make a plan",
        body: PlanInput,
        responses: {
            201: { description: "Made.", body: Plan },
            400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
            409: jsonError("Another plan has this code."),
        },
    },
    {
        method: "put", path: "/v1/plans/{code}", group: "People", summary: "Change a plan",
        description: "Its name, code or limits; everyone in it gets the new limits straight away. A new code breaks anything outside LawFive that refers to the old one.",
        params: z.object({ code: z.string() }),
        body: PlanInput,
        responses: {
            200: { description: "Changed.", body: Plan },
            400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such plan."),
            409: jsonError("Another plan has the new code."),
        },
    },
    {
        method: "delete", path: "/v1/plans/{code}", group: "People", summary: "Delete a plan",
        params: z.object({ code: z.string() }),
        responses: {
            200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) },
            403: jsonError("Not an admin."),
            404: jsonError("No such plan."),
            409: jsonError("It's in use (Plan.inUse): move its accounts to another plan first."),
        },
    },
    {
        method: "put", path: "/v1/plan-settings", group: "People", summary: "Choose the default plan and the sign-up trial",
        body: PlanSettings,
        responses: {
            200: { description: "Changed: the plans as they are now.", body: Plans },
            400: { description: "The body doesn't match, or there's no such plan.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
        },
    },
    {
        method: "get", path: "/v1/server-settings", group: "People", summary: "The server's settings",
        description: "Each setting an admin can change (ADM-1, ADM-2), where its value comes from, and the value (not for secrets).",
        responses: {
            200: { description: "The settings.", body: z.object({ settings: z.array(ServerSettingView) }) },
            403: jsonError("Not an admin."),
        },
    },
    {
        method: "put", path: "/v1/server-settings", group: "People", summary: "Change the server's settings",
        description: "Sets or clears the settings sent (ADM-1); one the environment sets can't be changed, and if any can't be, none are. Takes effect straight away. GET /v1/meta says what's offered.",
        body: ServerSettings,
        responses: {
            200: { description: "Changed: the settings as they are now.", body: z.object({ settings: z.array(ServerSettingView) }) },
            400: { description: "The body doesn't match, a value isn't one the setting takes, or the environment sets it.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
        },
    },
    {
        method: "post", path: "/v1/setup/check", group: "People", signedIn: false, summary: "Check a new server's setup code",
        description: "While nobody has an account, whether this is the code in the server's logs (ADM-5). The first account is made through sign-up, with the code as setupCode.",
        body: z.object({ code: z.string() }),
        responses: {
            200: { description: "It's the code.", body: z.object({ ok: z.literal(true) }) },
            400: jsonError("It isn't."),
            404: jsonError("The server is already set up, or doesn't need a code."),
        },
    },
    {
        method: "post", path: "/v1/setup/finish", group: "People", summary: "Finish setting the server up",
        description: "The first account finished or skipped the setup wizard, so it doesn't open again (ADM-5).",
        responses: {
            200: { description: "Done.", body: z.object({ ok: z.literal(true) }) },
            403: jsonError("Not an admin."),
        },
    },
    {
        method: "get", path: "/v1/server-settings/network", group: "People", summary: "How the server sees visitors",
        description: "The address this server sees the asking admin at, and the TRUSTED_PROXIES and TRUSTED_IP_HEADER in use (SEC-14), so Settings → Server can show whether a proxy in front of it is believed. Both are environment values, not changed here.",
        responses: {
            200: { description: "As it is now.", body: NetworkView },
            403: jsonError("Not an admin."),
        },
    },
    {
        method: "post", path: "/v1/server-settings/test-email", group: "People", summary: "Send a test email",
        description: "To the signed-in admin, through the email settings in use (ADM-4).",
        responses: {
            200: { description: "Sent.", body: z.object({ to: z.string() }) },
            403: jsonError("Not an admin."),
            409: jsonError("Email isn't set up."),
            502: jsonError("The SMTP server didn't take it; the error says why."),
        },
    },

    {
        method: "post", path: "/v1/app-sign-in", group: "App sign-in", summary: "A code to sign a phone in",
        description: "It works once, for two minutes.",
        responses: { 201: { description: "Made.", body: AppSignIn } },
    },
    {
        method: "get", path: "/v1/app-sign-in/{id}", group: "App sign-in", summary: "Whether a phone has used a code",
        description: "So the web app can say when the phone is signed in. Expired codes go when a new one is made, and then this answers 404.",
        params: idParam,
        responses: { 200: { description: "How it stands.", body: AppSignInStatus }, 404: jsonError("No such code, or not this account's.") },
    },
    {
        method: "post", path: "/v1/app-sign-in/check", group: "App sign-in", signedIn: false, summary: "Whose a code is",
        description: "For the phone to ask before signing in. It doesn't use the code up.",
        body: AppSignInCode,
        responses: { 200: { description: "It can be used.", body: AppSignInCheck }, 404: jsonError("No such code."), 410: jsonError("It was used, or it has expired.") },
    },
    {
        method: "post", path: "/v1/app-sign-in/redeem", group: "App sign-in", signedIn: false, summary: "Swap a code for a session",
        description: "The session belongs to the device asking, and shows under Devices.",
        body: AppSignInCode,
        responses: {
            200: { description: "Signed in.", body: AppSignInResult },
            403: planRefused("The account is suspended, or already has as many watches and phones as its plan allows (PLAN-7)."),
            404: jsonError("No such code."),
            410: jsonError("It was used, or it has expired."),
        },
    },
    {
        method: "get", path: "/v1/invites", group: "Invitations", summary: "The invitations",
        description: "Newest first, including used and expired ones from the last 90 days.",
        responses: { 200: { description: "The invitations.", body: z.object({ invites: z.array(Invite) }) }, 403: jsonError("Not an admin.") },
    },
    {
        method: "post", path: "/v1/invites", group: "Invitations", summary: "Invite someone",
        description: "With send, it's emailed to them too, when the server can send email.",
        body: NewInvite,
        responses: {
            201: { description: "Made.", body: z.object({ invite: Invite, emailed: z.boolean().describe("Whether it was emailed; when not, send the link yourself.") }) },
            400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("Not an admin."),
            409: jsonError("There's already an account with this email."),
        },
    },
    {
        method: "delete", path: "/v1/invites/{id}", group: "Invitations", summary: "Cancel an invitation",
        description: "Its link stops working straight away.",
        params: idParam,
        responses: { 200: { description: "Canceled.", body: z.object({ ok: z.literal(true) }) }, 403: jsonError("Not an admin."), 404: jsonError("No such invitation, or it was used.") },
    },
    {
        method: "get", path: "/v1/invite/{token}", group: "Invitations", signedIn: false, summary: "Look up an invitation",
        description: "For the invitation page, before signing up with it.",
        params: z.object({ token: z.string() }),
        responses: {
            200: { description: "It can be used.", body: InviteLookup },
            404: jsonError("No such invitation: the link is mistyped, or it was canceled."),
            410: jsonError("It was used, or it has expired."),
        },
    },

    {
        method: "post", path: "/v1/referees/{id}/merge", group: "Records", keyScope: "referees:write", summary: "Merge referees into this one",
        description: "For duplicates (DUP-3): the matches whose crew names any of them, or has one of their names typed in, are changed to this referee; the others are deleted, and their names kept as this one's other names. Details are combined: the chosen name, email and phone (else whichever there is), the short name the officials line uses (WEB-20; this one's, else another's), tags together, notes joined, and who they're not. A match saved later naming a merged referee is quietly corrected to this one. Apps send the merge from POST /v1/referees/{id}/merge/preview. An API key needs matches:write too.",
        params: idParam,
        body: RefereeMerge,
        responses: {
            200: { description: "Merged.", body: RefereeMergeResult },
            400: { description: "The body doesn't match, the name isn't one of theirs, or it lists this referee.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without referees:write and matches:write."),
            404: jsonError("This referee, or one to merge, doesn't exist."),
        },
    },
    {
        method: "post", path: "/v1/venues/{id}/merge", group: "Records", keyScope: "venues:write", summary: "Merge venues into this one",
        description: "For duplicates (DUP-7): the matches at any of them move to this venue; the others are deleted, and their names kept as this one's other names. Each of their pitches is either kept, under a name no other pitch of the venue has, or combined into a pitch that's the same, whose matches it takes, whose corners walked it adds to (the newest 20, in date order), whose position it fills when there's none, and whose other names get its name. Details are combined: the chosen name, the address and parking from the chosen venue (else whichever there is), tags together, notes joined, and which venues it's not. A match saved later with a merged venue's or pitch's id is quietly corrected to where it went. Apps send the merge from POST /v1/venues/{id}/merge/preview. An API key needs matches:write too.",
        params: idParam,
        body: VenueMerge,
        responses: {
            200: { description: "Merged.", body: VenueMergeResult },
            400: { description: "The body doesn't match; the name isn't one of theirs; a pitch is missing, listed twice or combined into one that isn't kept; two kept pitches share a name; or it lists this venue.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without venues:write and matches:write."),
            404: jsonError("This venue, or one to merge, doesn't exist."),
        },
    },
    {
        method: "get", path: "/v1/duplicates/referees", group: "Records", keyScope: "referees:read", capability: "merging", summary: "Likely duplicate referees",
        description: "For Find duplicates (DUP-1, DUP-2): groups of referees who are probably one person, with why, surest first; referees marked not the same (DUP-5) aren't grouped. The server works this out so every app shows the same (DUP-11). An API key needs matches:read too, for the counts.",
        responses: { 200: { description: "The groups.", body: DuplicateGroups }, 403: jsonError("An API key without referees:read and matches:read.") },
    },
    {
        method: "get", path: "/v1/duplicates/venues", group: "Records", keyScope: "venues:read", capability: "merging", summary: "Likely duplicate venues",
        description: "For Find duplicates (DUP-7): groups of venues that are probably one place (the same address, places within 150 m, or similar names), with why, surest first; venues marked not the same aren't grouped. An API key needs matches:read too, for the counts.",
        responses: { 200: { description: "The groups.", body: DuplicateGroups }, 403: jsonError("An API key without venues:read and matches:read.") },
    },
    {
        method: "get", path: "/v1/referees/{id}/duplicates", group: "Records", keyScope: "referees:read", capability: "merging", summary: "Referees likely the same as this one",
        description: "For Merge with… (DUP-1, DUP-2): the likeliest few, with why. Search the referees list for anyone else. An API key needs matches:read too.",
        params: idParam,
        responses: { 200: { description: "The likeliest, best first.", body: LikelyDuplicates }, 403: jsonError("An API key without referees:read and matches:read."), 404: jsonError("No such referee.") },
    },
    {
        method: "get", path: "/v1/venues/{id}/duplicates", group: "Records", keyScope: "venues:read", capability: "merging", summary: "Venues likely the same as this one",
        description: "For Merge with… (DUP-7): the likeliest few, with why. Search the venues list for any other. An API key needs matches:read too.",
        params: idParam,
        responses: { 200: { description: "The likeliest, best first.", body: LikelyDuplicates }, 403: jsonError("An API key without venues:read and matches:read."), 404: jsonError("No such venue.") },
    },
    {
        method: "post", path: "/v1/referees/{id}/merge/preview", group: "Records", keyScope: "referees:read", capability: "merging", summary: "Preview merging referees",
        description: "What merging them into this one would make, from the choices so far (DUP-4): the names, emails and phones to choose from and those chosen, and their matches together. Nothing is saved. Apps ask again whenever a choice changes, and send the answer's merge to POST /v1/referees/{id}/merge. An API key needs matches:read too.",
        params: idParam,
        body: RefereeMergeDraft,
        responses: {
            200: { description: "The preview.", body: RefereeMergePreview },
            400: { description: "The body doesn't match, or it lists this referee.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without referees:read and matches:read."),
            404: jsonError("This referee, or one to merge, doesn't exist."),
        },
    },
    {
        method: "post", path: "/v1/venues/{id}/merge/preview", group: "Records", keyScope: "venues:read", capability: "merging", summary: "Preview merging venues",
        description: "What merging them into this one would make, from the choices so far (DUP-7, DUP-8): the names and addresses to choose from and those chosen; every pitch of the others, riskiest first, with its suggestion or the user's choice, why, and any problem; notes; and their matches together. Nothing is saved. Apps ask again whenever a choice changes, and send the answer's merge (there when nothing needs a look) to POST /v1/venues/{id}/merge. An API key needs matches:read too.",
        params: idParam,
        body: VenueMergeDraft,
        responses: {
            200: { description: "The preview.", body: VenueMergePreview },
            400: { description: "The body doesn't match, or it lists this venue.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without venues:read and matches:read."),
            404: jsonError("This venue, or one to merge, doesn't exist."),
        },
    },
    {
        method: "post", path: "/v1/referees/{id}/not-the-same", group: "Records", keyScope: "referees:write", capability: "merging", summary: "Say referees aren't the same person",
        description: "Not the same person (DUP-5): each of them remembers the others in distinctFrom, so they aren't suggested together again. They can still be merged by hand.",
        params: idParam,
        body: NotTheSame,
        responses: {
            200: { description: "Saved.", body: z.object({ ok: z.literal(true) }) },
            400: { description: "The body doesn't match, or it lists this referee.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without referees:write."),
            404: jsonError("This referee, or one of the others, doesn't exist."),
        },
    },
    {
        method: "post", path: "/v1/venues/{id}/not-the-same", group: "Records", keyScope: "venues:write", capability: "merging", summary: "Say venues aren't the same place",
        description: "Not the same venue (DUP-7): each of them remembers the others in distinctFrom, so they aren't suggested together again. They can still be merged by hand.",
        params: idParam,
        body: NotTheSame,
        responses: {
            200: { description: "Saved.", body: z.object({ ok: z.literal(true) }) },
            400: { description: "The body doesn't match, or it lists this venue.", body: ValidationError.partial({ issues: true }) },
            403: jsonError("An API key without venues:write."),
            404: jsonError("This venue, or one of the others, doesn't exist."),
        },
    },
    {
        method: "post", path: "/v1/import/matches", group: "Import", keyScope: "matches:write", summary: "Import matches",
        description: "Each row adds a match or updates one: the row's ID column (a LawFive match id) wins, else its match number (any source). Only the columns a row fills in change an existing match. Venues, pitches, competitions and referees are found by name, ignoring case (venues, pitches and referees by their other names too), and added when there's none (an API key then needs write access to those too). Rows with problems are skipped and the rest are saved; nothing is saved on a dry run.\n\nThe columns, by their headings (any case or spacing, so home_colour and homeColour work too, as do common other headings like Field for Pitch):\n\n" + importColumnsMarkdown(),

        body: MatchImport,
        responses: {
            200: { description: "What happened to each row (or would, on a dry run).", body: MatchImportResult },
            400: { description: "The body doesn't match: no rows, more than 1000, or not rows of values.", body: ValidationError.partial({ issues: true }) },
            403: planRefused("An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits (PLAN-4), so nothing is saved."),
        },
    },
    {
        method: "post", path: "/v1/import/file", group: "Import", keyScope: "matches:write", summary: "Import matches from a file",
        description: "The same import as POST /v1/import/matches, from a file the server reads: CSV (commas, semicolons or tabs), Excel (.xlsx, its Matches sheet or else the first) or JSON (a list of objects, or an object with a matches list). The web app and phone apps use this; send it with dryRun first to check every row, then again without to save.",
        form: { fields: MatchImportFileFields, files: { file: "required: the file, at most 5 MB and 1000 rows" } },
        responses: {
            200: { description: "What happened to each row (or would, on a dry run), and where each is in the file.", body: MatchImportFileResult },
            400: { description: "The file is missing, too big (5 MB, or the plan's fileMb), or can't be read; error says why, in words to show the person who chose it.", body: ValidationError.partial({ issues: true }) },
            403: planRefused("An API key without matches:write; or the matches, venues or referees it would add are over the plan's limits (PLAN-4), so nothing is saved."),
        },
    },
    {
        method: "get", path: "/v1/assignor-calendars", group: "Assignor calendars", capability: "assignor-calendars", summary: "The account's assignor calendars",
        description: "Oldest first, each with how its latest read went.",
        responses: { 200: { description: "The calendars.", body: z.object({ calendars: z.array(AssignorCalendar) }) } },
    },
    {
        method: "post", path: "/v1/assignor-calendars/preview", group: "Assignor calendars", capability: "assignor-calendars", summary: "Preview a calendar link",
        description: "Reads the link once and says what it holds: the games still to come, how many are already in LawFive, and the first three as they'd be saved. Nothing is saved (FEED-1).",
        body: AssignorCalendarLink,
        responses: {
            200: { description: "What it holds.", body: AssignorCalendarPreview },
            400: { description: "The body doesn't match, or the link can't be read (not a web address, a private address, no answer, or not a calendar); error says why, in words to show the person.", body: ValidationError.partial({ issues: true }) },
        },
    },
    {
        method: "post", path: "/v1/assignor-calendars", group: "Assignor calendars", capability: "assignor-calendars", summary: "Connect an assignor calendar",
        description: "Reads it straight away, adding its games still to come, then every 30 minutes. As many as the account's plan allows (FEED-10).",
        body: NewAssignorCalendar,
        responses: {
            201: { description: "Connected and read.", body: AssignorCalendar },
            400: { description: "The body doesn't match, or the link can't be read; error says why.", body: ValidationError.partial({ issues: true }) },
            403: planRefused("An API key, or the account already has as many assignor calendars as its plan allows (PLAN-4)."),
        },
    },
    {
        method: "patch", path: "/v1/assignor-calendars/{id}", group: "Assignor calendars", capability: "assignor-calendars", summary: "Change an assignor calendar",
        description: "Its name, notifications, pausing or resuming it, or a new link. Resuming it or a new link reads it straight away.",
        params: idParam,
        body: AssignorCalendarChange,
        responses: {
            200: { description: "Changed.", body: AssignorCalendar },
            400: { description: "The body doesn't match, or the new link can't be read; error says why.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("Not found, or not this user's."),
        },
    },
    {
        method: "delete", path: "/v1/assignor-calendars/{id}", group: "Assignor calendars", capability: "assignor-calendars", summary: "Remove an assignor calendar",
        description: "It's no longer read; the matches it added stay, as ordinary matches.",
        params: idParam,
        responses: { 200: { description: "Removed.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "post", path: "/v1/assignor-calendars/{id}/read", group: "Assignor calendars", capability: "assignor-calendars", summary: "Read an assignor calendar now",
        description: "Instead of waiting for its next read; a paused one stays paused.",
        params: idParam,
        responses: { 200: { description: "Read, with how it went.", body: AssignorCalendar }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "get", path: "/v1/calendar", group: "Calendar", summary: "The calendar feed's address",
        responses: { 200: { description: "The feed.", body: CalendarFeed }, 404: jsonError("There's no feed; make one with POST.") },
    },
    {
        method: "post", path: "/v1/calendar", group: "Calendar", summary: "Make the calendar feed, or a new address for it",
        description: "A new address replaces the old one, which stops working (calendars subscribed to it stop updating).",
        body: z.object({}),
        responses: { 201: { description: "Made.", body: CalendarFeed } },
    },
    {
        method: "delete", path: "/v1/calendar", group: "Calendar", summary: "Turn the calendar feed off",
        responses: { 200: { description: "Its address stops working.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("There's no feed.") },
    },
    {
        method: "get", path: "/v1/calendar/{file}", group: "Calendar", signedIn: false, summary: "The calendar feed",
        description: "What calendar apps fetch: the user's matches as events (CAL-2 to CAL-4), past and future, canceled ones marked so. The address is the secret; there's no other sign-in.",
        params: z.object({ file: z.string().describe("The feed's token and .ics.") }),
        responses: { 200: { description: "The calendar (text/calendar).", calendar: true }, 403: jsonError("The account is suspended (USR-7)."), 404: jsonError("No feed has this address: it was replaced or turned off.") },
    },

    {
        method: "get", path: "/v1/devices", group: "Devices", summary: "Where the account is signed in",
        description: "Browsers and linked watches, most recently active first. Apps name themselves with an X-LawFive-Device header: garmin, and from the watch app's later versions what it runs on, garmin; model=006-B3703-00; firmware=12.30, which names it (Garmin Venu 2), and its own version, app=2026.10.30 (VER-3).",
        responses: { 200: { description: "The devices.", body: z.object({ devices: z.array(Device) }) } },
    },
    {
        method: "delete", path: "/v1/devices/{id}", group: "Devices", summary: "Sign a device out",
        description: "Unlinks a watch or signs a browser out; its next request gets 401.",
        params: z.object({ id: z.string() }),
        responses: { 200: { description: "Signed out.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("Not found, or not this user's.") },
    },

    {
        method: "get", path: "/v1/devices/matches", group: "Devices", summary: "Which matches are on which watch",
        description: "For a match's page to say whether it's on a watch (SYNC-14): each match in each linked watch's latest download of its next matches (GET /v1/watch/matches, from the watch or through the phone app with the watch's link), and whether the watch has it as it is now. A watch unlinked drops out; a match deleted isn't listed. Phones fetch it as they sync and keep the last answer for when there's no signal. Not with API keys.",
        responses: { 200: { description: "The matches on watches, newest download first.", body: z.object({ matches: z.array(MatchOnWatch) }) } },
    },
    {
        method: "post", path: "/v1/devices/sign-out-others", group: "Devices", summary: "Sign out everywhere else",
        description: "Ends the account's other sessions, keeping the one asking (SEC-7): other browsers only, or every other device, which unlinks watches and signs phones out.",
        body: SignOutOthers,
        responses: { 200: { description: "How many were signed out.", body: z.object({ signedOut: z.number().int().nonnegative() }) }, 400: jsonError("Not browsers or all.") },
    },

    {
        method: "put", path: "/v1/devices/current/push", group: "Devices", capability: "push", summary: "Say how to reach this phone",
        description: "Keeps the handle the push relay gave this phone with its session, so signing out removes it (PUSH-4). Needs an X-LawFive-Device header. Not with API keys.",
        body: PushHandle,
        responses: { 200: { description: "Kept.", body: z.object({ ok: z.literal(true) }) }, 400: jsonError("The body doesn't match, or there's no device header.") },
    },
    {
        method: "get", path: "/v1/notices/{id}", group: "Devices", capability: "push", summary: "What an integration did",
        description: "The matches an API key added or changed, from a match-changed notification's id (NOTE-3), for the phone to write the notification itself. Kept for 30 days. Not with API keys.",
        params: idParam,
        responses: { 200: { description: "The notice.", body: MatchNotice }, 404: jsonError("Not found, not this user's, or more than 30 days old.") },
    },

    {
        method: "get", path: "/v1/account/storage", group: "Devices", summary: "How much of its storage the account is using",
        description: "Photos and tracks, and the limit if the account's plan has one (SEC-6, PLAN-2).",
        responses: { 200: { description: "The figures.", body: AccountStorage } },
    },
    {
        method: "get", path: "/v1/account/plan", group: "Devices", capability: "plans", summary: "The account's plan",
        description: "Its plan and limits, when it ends and what follows, and how much of each limit it's using (PLAN-6).",
        responses: { 200: { description: "The plan.", body: AccountPlan } },
    },

    {
        method: "get", path: "/v1/api-keys", group: "API keys", summary: "The account's API keys",
        description: "Newest first. The keys themselves aren't kept, only their first characters.",
        responses: { 200: { description: "The keys.", body: z.object({ keys: z.array(ApiKey) }) } },
    },
    {
        method: "post", path: "/v1/api-keys", group: "API keys", summary: "Make an API key",
        description: "As many as the account's plan allows (PLAN-2).",
        body: NewApiKey,
        responses: {
            201: { description: "Made: the answer has the key, which isn't shown again.", body: CreatedApiKey },
            400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) },
            403: planRefused("An API key, or the account already has as many keys as its plan allows (PLAN-4)."),
        },
    },
    {
        method: "delete", path: "/v1/api-keys/{id}", group: "API keys", summary: "Delete an API key",
        description: "It stops working straight away.",
        params: idParam,
        responses: { 200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "patch", path: "/v1/api-keys/{id}", group: "API keys", summary: "Change an API key",
        description: "Whether the user's phones are told when it adds or changes matches (NOTE-1). Its access and expiry can't change: make a new key instead.",
        params: idParam,
        body: ApiKeyChange,
        responses: { 200: { description: "Changed.", body: ApiKey }, 400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) }, 404: jsonError("Not found, or not this user's.") },
    },

    {
        method: "get", path: "/v1/export", group: "Export", summary: "Download everything",
        description: "Every record, track and photo in the account, as a zip (Content-Disposition: attachment). It's made as it's sent, so it starts straight away however big it is.",
        responses: { 200: { description: "The zip.", zip: true } },
    },
    {
        method: "post", path: "/v1/restore", group: "Export", summary: "Restore from an export",
        description: "Merges an export into the account: records keep their ids, anything missing is added, and where the account has a record too, whichever was changed last is kept. Tracks are added to match reports without one; photos the account doesn't have are added. At most 2 GB. Matches, referees and venues over the plan's limits (PLAN-4) aren't added, and problems says so.",
        file: { contentType: "application/zip", description: "A zip made by GET /v1/export" },
        responses: {
            200: { description: "Restored.", body: RestoreResult },
            400: jsonError("It isn't a LawFive export, or it's too big (2 GB, or the plan's fileMb)."),
            409: jsonError("Another restore for the account is under way: one at a time."),
        },
    },
    {
        method: "get", path: "/v1/matches/{id}/share", group: "Sharing", summary: "A match's share link",
        params: idParam,
        responses: { 200: { description: "Its link.", body: MatchShare }, 404: jsonError("It isn't shared, or there's no such match.") },
    },
    {
        method: "post", path: "/v1/matches/{id}/share", group: "Sharing", summary: "Share a match",
        description: "Makes its link, or a new one in place of the old, which stops working.",
        params: idParam,
        responses: { 201: { description: "Its link.", body: MatchShare }, 404: jsonError("No such match.") },
    },
    {
        method: "delete", path: "/v1/matches/{id}/share", group: "Sharing", summary: "Stop sharing a match",
        description: "Its link stops working.",
        params: idParam,
        responses: { 200: { description: "Not shared any more.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("It isn't shared.") },
    },
    {
        method: "get", path: "/v1/shared/{token}", group: "Sharing", signedIn: false, summary: "A shared match",
        description: "What the share link's page shows. The token is the secret; there's no other sign-in. Answers carry X-Robots-Tag: noindex.",
        params: z.object({ token: z.string().describe("The token in the share link.") }),
        responses: { 200: { description: "The match.", body: SharedMatch }, 403: jsonError("The account is suspended (USR-7)."), 404: jsonError("No match has this link: it was replaced or turned off, or the match was deleted.") },
    },
    {
        method: "get", path: "/v1/shared/{token}/track", group: "Sharing", signedIn: false, summary: "A shared match's track",
        description: "With its figures, as the owner sees them.",
        params: z.object({ token: z.string().describe("The token in the share link.") }),
        responses: { 200: { description: "The track and its figures.", body: TrackView }, 403: jsonError("The account is suspended (USR-7)."), 404: jsonError("No match has this link, or it has no track.") },
    },

    {
        method: "get", path: "/v1/attachments", group: "Attachments", summary: "Attachments of a kind of record",
        description: "In order (by record, then position). With recordId, just that record's; with first, only each record's first (a referee's picture).",
        query: z.object({
            recordType: AttachmentRecordType,
            recordId: Id.optional(),
            first: z.enum(["true"]).optional().describe("Only each record's first attachment."),
        }),
        responses: { 200: { description: "The attachments.", body: z.object({ attachments: z.array(Attachment) }) }, 400: jsonError("recordType or recordId isn't valid.") },
    },
    {
        method: "post", path: "/v1/attachments", group: "Attachments", summary: "Upload an attachment",
        description: "Added after the record's others. At most 30 on a record.",
        form: { fields: AttachmentUpload, files: { file: "required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)", thumb: "optional: a small version, at most 1 MB, for lists and galleries" } },
        responses: {
            201: { description: "Uploaded.", body: Attachment },
            400: { description: "With storage ({ usedBytes, limitBytes }) when it doesn't fit the account's room (FILE-7). A field isn't valid, the file is missing, too big or not a JPEG, PNG or WebP, or the record has 30 already.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("No such record: save it first."),
        },
    },
    {
        method: "put", path: "/v1/attachments/{id}", group: "Attachments", summary: "Change an attachment",
        description: "Its caption, or its place among the record's attachments (moving a referee's photo to 0 makes it their picture).",
        params: idParam,
        body: AttachmentChange,
        responses: {
            200: { description: "Changed.", body: Attachment },
            400: { description: "The body doesn't match.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("Not found, or not this user's."),
        },
    },
    {
        method: "put", path: "/v1/attachments/{id}/file", group: "Attachments", summary: "Replace an attachment's file",
        description: "A photo cropped or turned by the app, in place of the old one (FILE-8): it keeps its id, place and caption, and the old files are deleted. Its url and thumbUrl change, so a kept copy of the old one isn't shown.",
        params: idParam,
        form: { fields: z.object({ width: z.string().optional().describe("The new width in pixels."), height: z.string().optional() }), files: { file: "required: the photo, a JPEG, PNG or WebP of at most 10 MB (or the plan's photoMb)", thumb: "optional: a small version, at most 1 MB" } },
        responses: {
            200: { description: "Replaced.", body: Attachment },
            400: { description: "With storage ({ usedBytes, limitBytes }) when a bigger file doesn't fit the account's room (FILE-7). The file is missing, too big or not a JPEG, PNG or WebP.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("Not found, or not this user's."),
        },
    },
    {
        method: "delete", path: "/v1/attachments/{id}", group: "Attachments", summary: "Delete an attachment",
        description: "With its files, for good.",
        params: idParam,
        responses: { 200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "get", path: "/v1/attachments/{id}/file", group: "Attachments", summary: "An attachment's file",
        description: "As uploaded. A file at an address never changes, so it can be kept (Cache-Control: private, immutable); replacing it (FILE-8) gives the attachment new addresses, with ?v=.",
        params: idParam,
        responses: { 200: { description: "The image.", image: true }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "get", path: "/v1/attachments/{id}/thumb", group: "Attachments", summary: "An attachment's thumbnail",
        description: "The small version, or the file itself when none was uploaded.",
        params: idParam,
        responses: { 200: { description: "The image.", image: true }, 404: jsonError("Not found, or not this user's.") },
    },

    {
        method: "get", path: "/v1/webhooks", group: "Webhooks", summary: "The account's webhooks",
        description: "Newest first, each with its latest delivery.",
        responses: { 200: { description: "The webhooks.", body: z.object({ webhooks: z.array(Webhook) }) } },
    },
    {
        method: "post", path: "/v1/webhooks", group: "Webhooks", summary: "Add a webhook",
        description: "As many as the account's plan allows (PLAN-2). The answer has the secret deliveries are signed with, which isn't shown again.",
        body: WebhookInput,
        responses: {
            201: { description: "Added.", body: CreatedWebhook },
            400: { description: "The body doesn't match, or the address isn't allowed (a private network, unless the server allows it).", body: ValidationError.partial({ issues: true }) },
            403: planRefused("An API key, or the account already has as many webhooks as its plan allows (PLAN-4)."),
        },
    },
    {
        method: "put", path: "/v1/webhooks/{id}", group: "Webhooks", summary: "Change a webhook",
        description: "Its address, topics, or pausing it (active: false).",
        params: idParam,
        body: WebhookInput,
        responses: {
            200: { description: "Changed.", body: Webhook },
            400: { description: "The body doesn't match, or the address isn't allowed.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("Not found, or not this user's."),
        },
    },
    {
        method: "delete", path: "/v1/webhooks/{id}", group: "Webhooks", summary: "Delete a webhook",
        description: "With its deliveries; nothing more is sent.",
        params: idParam,
        responses: { 200: { description: "Deleted.", body: z.object({ ok: z.literal(true) }) }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "get", path: "/v1/webhooks/{id}/deliveries", group: "Webhooks", summary: "A webhook's deliveries",
        description: "The latest 50, newest first.",
        params: idParam,
        responses: { 200: { description: "The deliveries.", body: z.object({ deliveries: z.array(WebhookDelivery) }) }, 404: jsonError("Not found, or not this user's.") },
    },
    {
        method: "post", path: "/v1/server-settings/test-push", group: "People", summary: "Send a test notification",
        description: "To the signed-in admin's own phones that have notifications on, through the push relay (PUSH-6).",
        responses: {
            200: { description: "The relay took it.", body: z.object({ sent: z.number().int().positive().describe("How many phones.") }) },
            403: jsonError("Not an admin."),
            409: jsonError("Notifications are off on this server, or none of the admin's phones has them on."),
            502: jsonError("The relay didn't take it; the error says why."),
        },
    },

    {
        method: "post", path: "/v1/webhooks/{id}/test", group: "Webhooks", summary: "Send a test",
        description: "Sends an example delivery now, once, and says how it went. The example is the account's latest record of the topic, or a made-up one; test is true in it.",
        params: idParam,
        body: z.object({ topic: WebhookTopic.optional().describe("match when left out.") }),
        responses: {
            200: { description: "Sent (whatever the answer).", body: z.object({ delivery: WebhookDelivery, payload: WebhookPayload, durationMs: z.int() }) },
            404: jsonError("Not found, or not this user's."),
        },
    },

    {
        method: "get", path: "/v1/watch/matches", group: "Watch", summary: "The next matches, for the watch",
        description: "Scheduled matches from three hours ago on, soonest first, so one that's about to start or running late is still there. A watch's link asking is noted as the watch now having these matches (SYNC-14, GET /v1/devices/matches), unless it's the phone app fetching them ahead for the watch (prefetch).",
        query: z.object({
            limit: z.int().optional().describe("At most 10 (the default)."),
            prefetch: z.enum(["true"]).optional().describe("The phone app fetching the watch's next matches ahead (APP-7), for when the watch asks without signal: not noted as on the watch."),
        }),
        responses: {
            200: {
                description: "The matches.",
                body: z.object({
                    matches: z.array(WatchMatch),
                    serverVersion: z.string().optional().describe("The server's version (VER-3), for the watch's About screen."),
                    screen: WatchScreenChange.optional().describe("The match screen chosen for the account (UI-24), once one has been."),
                    teamSwipes: TeamSwipes.optional().describe("How swipes open the team controls (INP-10), once it's been set for the account."),
                    misconductScheme: SchemeId.optional().describe("The account's misconduct codes, for a quick match's card reasons on the watch (EVT-14); a planned match carries its own."),
                }),
            },
        },
    },
    {
        method: "post", path: "/v1/watch/records", group: "Watch", summary: "Upload a finished match",
        description: "Stored as a match record, and its planned match marked played. A quick match (no matchId) gets a match made for it from what the watch knew. Sending the same match again updates it, unless its result has been corrected since (RES-4) or it has been deleted since (RES-8): then nothing changes. A planned match deleted before its result first arrives comes back, played.",
        body: WatchUpload,
        responses: {
            200: { description: "Updated: this match was sent before (or kept as it is: corrected or deleted since).", body: WatchUploadResult },
            201: { description: "Stored.", body: WatchUploadResult },
            400: { description: "The body doesn't match.", body: ValidationError },
            409: jsonError("It would duplicate another record."),
        },
    },
    {
        method: "post", path: "/v1/watch/tracks", group: "Watch", summary: "Upload part of a match's track",
        description: "The watch sends the track it recorded (TRK-7) a chunk at a time, after the match. Once every chunk and the match are in, the chunks become the match report's track, unless it has one already (from a file, say), which is kept. Sending a chunk again replaces it.",
        body: WatchTrackChunk,
        responses: {
            200: { description: "Received.", body: WatchTrackResult },
            400: { description: "The body doesn't match, or the samples can't be read.", body: ValidationError },
        },
    },
    {
        method: "post", path: "/v1/watch/pitch", group: "Watch", summary: "Pitch corners from the watch",
        description: "Corners walked on the watch (TRK-13), sent at its next sync (SYNC-12). They're kept with the match, replacing any it had, and with its venue's pitch when it has one, for its matches from then on.",
        body: WatchPitchMarking,
        responses: {
            200: { description: "Kept.", body: z.object({ ok: z.literal(true), pitch: z.boolean().describe("Whether they were kept with a venue's pitch too.") }) },
            400: { description: "The body doesn't match, or it names neither matchId nor created.", body: ValidationError.partial({ issues: true }) },
            404: jsonError("No such match."),
        },
    },
    {
        method: "post", path: "/v1/watch/screen", group: "Watch", summary: "The match screen chosen on the watch",
        description: "Settings > Match screen on the watch (UI-24), sent at its next sync. It becomes the account's choice unless the website or a phone has changed it since (the latest change wins). An account with no settings yet keeps nothing.",
        body: WatchScreenChange,
        responses: {
            200: { description: "Whether this change is now the account's choice.", body: z.object({ applied: z.boolean() }) },
            400: { description: "The body doesn't match.", body: ValidationError },
        },
    },
    {
        method: "post", path: "/v1/watch/fee", group: "Watch", summary: "Mark a fee paid from the watch",
        description: "The watch's Paid toggle (SYNC-11), sent at its next sync. It changes only whether the fee is paid, and only if the match hasn't been changed since (the latest change wins).",
        body: WatchFeeChange,
        responses: {
            200: { description: "Whether the fee is paid now, and whether this change made it so.", body: z.object({ paid: z.boolean(), applied: z.boolean() }) },
            400: { description: "The body doesn't match.", body: ValidationError },
            404: jsonError("No such match, or it has no fee."),
        },
    },

    {
        method: "get", path: "/v1/geocode", group: "Places", capability: "geocode", keyScope: "venues:write", summary: "Find an address",
        description: "Through Nominatim (OpenStreetMap) by default, at most one lookup a second for the whole server, with answers cached. Every search counts against the account's plan's address searches a day (PLAN-11), cached or not.",
        query: z.object({ q: z.string().min(3).max(200).describe("The address.") }),
        responses: {
            200: { description: "Up to five places.", body: z.object({ results: z.array(Place) }) },
            400: jsonError("q is shorter than 3 or longer than 200 characters."),
            404: jsonError("Address search is off on this server (an admin can switch it on, ADM-2)."),
            429: { description: "The account's plan allows no more address searches today (PLAN-11), or two of its searches are already waiting; Retry-After says how many seconds to wait.", body: ApiError },
            502: jsonError("The address search service didn't answer."),
        },
    },

    {
        method: "get", path: "/v1/quiz", group: "Quiz", capability: "quiz", summary: "The quiz's questions",
        description: "Every active question in a language, with the Laws and protocols they refer to, for the app to pick from. The phone apps keep the last copy, for no signal.",
        query: z.object({ language: z.string().optional().describe("A two-letter language code; en by default.") }),
        responses: {
            200: { description: "The questions.", body: QuizBank },
            404: jsonError("There are no questions in that language."),
        },
    },
    {
        method: "get", path: "/v1/weather", group: "Weather", capability: "weather", keyScope: "matches:read", summary: "Weather for matches in a window",
        description: "For the user's matches kicking off between from and to that have a place on the map and a forecast (up to 16 days ahead) or kept weather (once played).",
        query: z.object({
            from: z.string().optional().describe("ISO 8601 time; 30 days ago by default."),
            to: z.string().optional().describe("ISO 8601 time; 17 days from now by default. At most 400 days after from."),
        }),
        responses: {
            200: { description: "The weather, one per match that has any.", body: z.object({ items: z.array(MatchWeather) }) },
            400: jsonError("from or to isn't a time, or they're the wrong way round or too far apart."),
        },
    },
    {
        method: "get", path: "/v1/weather/{matchId}", group: "Weather", capability: "weather", keyScope: "matches:read", summary: "One match's weather",
        params: z.object({ matchId: Id }),
        responses: { 200: { description: "The weather.", body: MatchWeather }, 404: jsonError("No weather for this match: not found, no place on the map, or too far ahead.") },
    },
];
