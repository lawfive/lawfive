import type { AccountPlan, PlanLimits } from "./api.ts";

// Plans (PLAN-1 to PLAN-6), in words: each limit's name and unit, a plan's limits in a line, and
// when a plan ends. The server checks the limits; this only says what they are.

type LimitName = keyof PlanLimits;
type UsageName = keyof AccountPlan["usage"];

export interface LimitInfo {
    key: LimitName;
    label: string;
    /** In what an account is using, when it differs: "Notifications today". */
    usageLabel?: string;
    /** "MB" for sizes; counts have none. */
    unit?: "MB";
    hint?: string;
    /** What the account's usage calls it, when it's counted. */
    usage?: UsageName;
    /** In a plan's summary line: "50 matches". */
    short: (n: number) => string;
}

const count = (one: string, many: string) => (n: number) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const limitGroups: { title: string; limits: LimitInfo[] }[] = [
    {
        title: "What they keep",
        limits: [
            { key: "matches", label: "Matches", usage: "matches", hint: "Matches recorded on a watch are never refused.", short: count("match", "matches") },
            { key: "referees", label: "Referees", usage: "referees", short: count("referee", "referees") },
            { key: "venues", label: "Venues", usage: "venues", short: count("venue", "venues") },
            { key: "storageMb", label: "Photos and tracks", unit: "MB", usage: "storageMb", hint: "A track recorded on a watch is never refused.", short: (n) => `${sizeOf(n)} of photos and tracks` },
        ],
    },
    {
        title: "Uploads",
        limits: [
            { key: "photoMb", label: "Largest photo", unit: "MB", hint: "Never more than 10 MB.", short: (n) => `photos up to ${sizeOf(n)}` },
            { key: "fileMb", label: "Largest file", unit: "MB", hint: "Imports (at most 5 MB) and restoring an export.", short: (n) => `files up to ${sizeOf(n)}` },
        ],
    },
    {
        title: "Devices and notifications",
        limits: [
            { key: "devices", label: "Watches and phones", usage: "devices", hint: "Signed in at once. Browsers don't count.", short: count("watch or phone", "watches and phones") },
            { key: "pushPerDay", label: "Notifications a day", usageLabel: "Notifications today", usage: "pushPerDay", hint: "To all their phones together, from midnight UTC.", short: (n) => `${count("notification", "notifications")(n)} a day` },
        ],
    },
    {
        title: "Integrations",
        limits: [
            { key: "apiKeys", label: "API keys", usage: "apiKeys", short: count("API key", "API keys") },
            { key: "apiCallsPerMinute", label: "API requests a minute", hint: "From all their keys together.", short: (n) => `${n.toLocaleString()} API requests a minute` },
            { key: "apiCallsPerDay", label: "API requests a day", usageLabel: "API requests today", usage: "apiCallsPerDay", hint: "From all their keys together, from midnight UTC.", short: (n) => `${n.toLocaleString()} API requests a day` },
            { key: "webhooks", label: "Webhooks", usage: "webhooks", short: count("webhook", "webhooks") },
            { key: "assignorCalendars", label: "Assignor calendars", usage: "assignorCalendars", hint: "Calendar links from ArbiterSports and other assignor systems, each read every 30 minutes.", short: count("assignor calendar", "assignor calendars") },
        ],
    },
    {
        title: "Maps",
        limits: [
            { key: "addressSearchesPerDay", label: "Address searches a day", usageLabel: "Address searches today", usage: "addressSearchesPerDay", hint: "Finding a venue's address on the map, from midnight UTC. A pin can always be placed by hand.", short: (n) => `${count("address search", "address searches")(n)} a day` },
        ],
    },
];

export const allLimits = limitGroups.flatMap((g) => g.limits);

/** Megabytes as people say them: 500 MB, 2 GB. */
export function sizeOf(mb: number): string {
    return mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${Math.round(mb * 10) / 10} MB`;
}

/** A limit's value: "No limit", "None", "50", "2 GB". */
export function limitValue(info: LimitInfo, value: number | undefined): string {
    if (value === undefined) {
        return "No limit";
    }
    if (value === 0) {
        return "None";
    }
    return info.unit ? sizeOf(value) : value.toLocaleString();
}

/** A plan's limits in a line: "50 matches · 1 GB of photos and tracks · no webhooks". */
export function planSummary(limits: PlanLimits, most = 4): string {
    const set = allLimits.filter((l) => limits[l.key] !== undefined);
    if (set.length === 0) {
        return "No limits";
    }
    const parts = set.map((l) => (limits[l.key] === 0 ? `no ${l.label.toLowerCase()}` : l.short(limits[l.key]!)));
    return parts.length > most ? `${parts.slice(0, most).join(" · ")} · ${parts.length - most} more` : parts.join(" · ");
}

/** A plan's last day ("2026-12-02") as "Tue, Dec 2", or with the year when it isn't this one. */
export function formatEndsOn(date: string, long = false): string {
    const at = new Date(`${date}T12:00:00Z`);
    const thisYear = at.getUTCFullYear() === new Date().getFullYear();
    return at.toLocaleDateString(undefined, { timeZone: "UTC", weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }) });
}

/** "until Tue, Dec 2, then Free", for a plan that ends. */
export function planEnd(plan: { endsOn?: string; endsAt?: string; then?: { name: string } }): string | undefined {
    const day = plan.endsOn ?? plan.endsAt?.slice(0, 10);
    return day ? `until ${formatEndsOn(day)}${plan.then ? `, then ${plan.then.name}` : ""}` : undefined;
}

/** A code from a name, as the server takes it: "Friends & family" → "friends-family". */
export function codeFrom(name: string): string {
    return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
