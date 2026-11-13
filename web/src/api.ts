import type * as schema from "@lawfive/schema";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { z } from "zod";

// Talking to the server: the records API and accounts (schema/generated/API.md). The browser keeps the
// session cookie, so requests just include credentials.

export type Match = z.infer<typeof schema.Match>;
export type MatchTemplate = z.infer<typeof schema.MatchTemplate>;
export type MatchRecord = z.infer<typeof schema.MatchRecord>;
export type NetworkView = z.infer<typeof schema.NetworkView>;
export type MatchEvent = z.infer<typeof schema.Event>;
export type Venue = z.infer<typeof schema.Venue>;
export type Competition = z.infer<typeof schema.Competition>;
export type Referee = z.infer<typeof schema.Referee>;
export type Team = z.infer<typeof schema.Team>;
export type Role = z.infer<typeof schema.Role>;
export type Gender = z.infer<typeof schema.Gender>;
export type UserSettings = z.infer<typeof schema.UserSettings>;
export type MatchFormat = z.infer<typeof schema.MatchFormat>;
export type MatchTrack = z.infer<typeof schema.MatchTrack>;
export type TrackSummary = z.infer<typeof schema.TrackSummary>;
export type PitchOutline = z.infer<typeof schema.PitchOutline>;
export type Stats = z.infer<typeof schema.Stats>;
export type StatsQuery = z.infer<typeof schema.StatsQuery>;

interface Collections {
    matches: Match;
    "match-templates": MatchTemplate;
    "match-records": MatchRecord;
    venues: Venue;
    competitions: Competition;
    referees: Referee;
    settings: UserSettings;
}
export type Collection = keyof Collections;
export type RecordOf<C extends Collection> = Collections[C];

/** A record as sent to the server: without the fields it sets, with the version last seen when updating. */
export type Draft<C extends Collection> = Omit<RecordOf<C>, "version" | "updatedAt" | "deletedAt"> & { version?: number };

/** How much of its room an account is using (SEC-6); no limit means no limitBytes. */
export interface AccountStorage {
    usedBytes: number;
    limitBytes?: number;
}

export class ApiError extends Error {
    readonly status: number;
    readonly body: { error?: string; message?: string; code?: string; storage?: AccountStorage; issues?: { path: (string | number)[]; message: string }[]; current?: unknown };

    constructor(status: number, body: ApiError["body"]) {
        // LawFive's errors have error; the account endpoints' (Better Auth's) have message.
        super(body.error ?? body.message ?? `Request failed (${status})`);
        this.status = status;
        this.body = body;
    }
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`/v1${path}`, {
        method,
        credentials: "include",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : {};
    if (!res.ok) {
        throw new ApiError(res.status, data ?? {});
    }
    return data as T;
}

/** A multipart form: the browser sets its content type. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
    const res = await fetch(`/v1${path}`, { method: "POST", credentials: "include", body: form });
    const data = res.headers.get("content-type")?.includes("json") ? await res.json() : {};
    if (!res.ok) {
        throw new ApiError(res.status, data ?? {});
    }
    return data as T;
}

export function useList<C extends Collection>(collection: C) {
    return useQuery({
        queryKey: [collection],
        queryFn: async () => (await request<{ items: RecordOf<C>[] }>("GET", `/${collection}`)).items,
    });
}

/** Records by id, for looking up the venue, competition or referees a match points at. */
export function useLookup<C extends Collection>(collection: C) {
    const list = useList(collection);
    const map = new Map<string, RecordOf<C>>();
    for (const item of list.data ?? []) {
        map.set(item.id, item);
    }
    return map;
}

export function useRecord<C extends Collection>(collection: C, id: string | undefined) {
    return useQuery({
        queryKey: [collection, id],
        queryFn: () => request<RecordOf<C>>("GET", `/${collection}/${id}`),
        enabled: id !== undefined,
    });
}

export function useSave<C extends Collection>(collection: C) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (draft: Draft<C>) => request<RecordOf<C>>("PUT", `/${collection}/${draft.id}`, draft),
        onSuccess: (saved) => {
            // Into the cached list straight away, so a picker can select a record just created.
            client.setQueryData([collection, saved.id], saved);
            client.setQueryData<RecordOf<C>[]>([collection], (list) => list && [...list.filter((r) => r.id !== saved.id), saved]);
            void client.invalidateQueries({ queryKey: [collection], exact: true });
        },
    });
}

export function useDelete<C extends Collection>(collection: C) {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (record: RecordOf<C>) => request<RecordOf<C>>("DELETE", `/${collection}/${record.id}?version=${record.version}`),
        onSuccess: () => client.invalidateQueries({ queryKey: [collection] }),
    });
}

// Server settings and services

/** What the server offers (GET /v1/meta): capabilities, map tiles and the services to credit. */
export type Meta = z.infer<typeof schema.ServerMeta>;

/** A match report's track and its figures (TRK-2), or null when it has none. */
export function useTrack(matchRecordId: string | undefined) {
    return useQuery({
        queryKey: ["track", matchRecordId],
        enabled: matchRecordId !== undefined,
        queryFn: async () => {
            try {
                return await request<{ track: MatchTrack; summary: TrackSummary; pitch?: PitchOutline; updatedAt: string }>("GET", `/match-records/${matchRecordId}/track`);
            } catch (error) {
                if (error instanceof ApiError && error.status === 404) {
                    return null;
                }
                throw error;
            }
        },
    });
}

/** Stats on the user's games for the filters (STAT-1); the last answer stays while the next loads. */
export function useStats(query: StatsQuery) {
    const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => e[1] !== undefined));
    return useQuery({
        queryKey: ["stats", params.toString()],
        queryFn: () => request<Stats>("GET", `/stats${params.size ? `?${params}` : ""}`),
        placeholderData: (previous) => previous,
    });
}

export function useMeta() {
    return useQuery({ queryKey: ["meta"], queryFn: () => request<Meta>("GET", "/meta"), staleTime: Infinity });
}

export type Place = z.infer<typeof schema.Place>;

/** Looks up an address (through the server, which uses OpenStreetMap's Nominatim by default). */
export async function geocode(q: string): Promise<Place[]> {
    return (await request<{ results: Place[] }>("GET", `/geocode?q=${encodeURIComponent(q)}`)).results;
}

// Accounts (Better Auth, under /v1/auth)

export interface Session {
    user: { id: string; name: string; email: string; status?: "active" | "pending" };
}

export function useSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: () => request<Session | null>("GET", "/auth/get-session"),
        staleTime: 5 * 60 * 1000,
    });
}

export function useSignIn() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (input: { mode: "signIn" | "signUp"; name: string; email: string; password: string; setupCode?: string; invite?: string }) =>
            input.mode === "signIn"
                ? request("POST", "/auth/sign-in/email", { email: input.email, password: input.password })
                : request<{ user: Session["user"] }>("POST", "/auth/sign-up/email", { name: input.name, email: input.email, password: input.password, ...(input.invite ? { invite: input.invite } : {}), ...(input.setupCode ? { setupCode: input.setupCode } : {}) }),
        onSuccess: async (data, input) => {
            // A new account starts with settings from the browser's language (one waiting for
            // approval can't save any yet; it gets them when it's first used).
            if (input.mode === "signUp" && (data as { user?: Session["user"] }).user?.status !== "pending") {
                const { newSettingsDraft } = await import("./settings.ts");
                const draft = newSettingsDraft();
                await request("PUT", `/settings/${draft.id}`, draft).catch(() => undefined);
            }
            // ADM-5: the first account goes on to set the server up.
            await client.invalidateQueries({ queryKey: ["meta"] });
            await client.invalidateQueries({ queryKey: ["session"] });
        },
    });
}

/**
 * Back to the sign-in page: no session, and nothing of the account's left in memory. The session
 * is set rather than cleared, so the app (which watches it) switches to signing in at once.
 */
export function showSignedOut(client: QueryClient) {
    client.setQueryData(["session"], null);
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== "session" });
}

/** Signs this browser out; other devices, linked watches included, stay signed in. */
export function useSignOut() {
    const client = useQueryClient();
    const navigate = useNavigate();
    return useMutation({
        mutationFn: () => request("POST", "/auth/sign-out", {}),
        onSettled: () => {
            showSignedOut(client);
            navigate("/", { replace: true });
        },
    });
}

// The account, and people on the server (USR-1 to USR-5)

export type Account = z.infer<typeof schema.Account>;
export type Person = z.infer<typeof schema.Person>;
export type Invite = z.infer<typeof schema.Invite>;
export type AppSignIn = z.infer<typeof schema.AppSignIn>;
export type AppSignInStatus = z.infer<typeof schema.AppSignInStatus>;
export type InviteLookup = z.infer<typeof schema.InviteLookup>;
export type CalendarFeed = z.infer<typeof schema.CalendarFeed>;
export type MatchImport = z.infer<typeof schema.MatchImport>;
export type MatchImportResult = z.infer<typeof schema.MatchImportResult>;
export type MatchImportFileResult = z.infer<typeof schema.MatchImportFileResult>;

export type Plan = z.infer<typeof schema.Plan>;
export type Plans = z.infer<typeof schema.Plans>;
export type PlanLimits = z.infer<typeof schema.PlanLimits>;
export type PlanInput = z.infer<typeof schema.PlanInput>;
export type AccountPlan = z.infer<typeof schema.AccountPlan>;
export type PlanHistoryEntry = z.infer<typeof schema.PlanHistoryEntry>;

/** The signed-in account's plan, its end, and what it's using (PLAN-6). */
export function useAccountPlan() {
    return useQuery({ queryKey: ["account-plan"], queryFn: () => request<AccountPlan>("GET", "/account/plan"), staleTime: 60 * 1000 });
}

/** Every plan, for admins (PLAN-1). */
export function usePlans(enabled = true) {
    return useQuery({ queryKey: ["plans"], queryFn: () => request<Plans>("GET", "/plans"), enabled });
}

/** The signed-in account: whether it's an admin, or waiting for approval. */
export function useAccount() {
    return useQuery({ queryKey: ["account"], queryFn: () => request<Account>("GET", "/account"), staleTime: 60 * 1000 });
}

/** A server setting as admins see it (ADM-1): where it comes from, and its value unless it's a secret. */
export type ServerSetting = z.infer<typeof schema.ServerSettingView>;

/** The settings admins change (Settings → Server, and sign-up on People). */
export function useServerSettings(enabled = true) {
    return useQuery({
        queryKey: ["server-settings"],
        queryFn: async () => (await request<{ settings: ServerSetting[] }>("GET", "/server-settings")).settings,
        enabled,
    });
}

/** Everyone on the server, for admins; refreshed now and then so new sign-ups show up. */
export function usePeople(enabled = true) {
    return useQuery({
        queryKey: ["people"],
        queryFn: async () => (await request<{ people: Person[] }>("GET", "/people")).people,
        enabled,
        refetchInterval: 60 * 1000,
    });
}
