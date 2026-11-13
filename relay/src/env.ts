// What the relay runs with. Everything but the bindings is a setting or secret in Cloudflare (README.md).

export interface RateLimit {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface CounterStub {
    fetch(url: string, init: { method: string; body: string }): Promise<Response>;
}

export interface CounterNamespace {
    idFromName(name: string): unknown;
    get(id: unknown): CounterStub;
}

export interface Env {
    COUNTERS: CounterNamespace;
    SEND_LIMIT?: RateLimit;
    REGISTER_LIMIT?: RateLimit;
    /** Secret: 32 random bytes, base64, sealing the handles. Replacing it cancels them all, and apps register again. */
    HANDLE_KEY: string;
    /** Secret: the Firebase service account's JSON. */
    FCM_SERVICE_ACCOUNT: string;
    /** PUSH-1: the daily limits; unset means the defaults below. */
    DEVICE_DAILY_LIMIT?: string;
    SERVER_DAILY_LIMIT?: string;
    /**
     * PUSH-3: by server address: {"https://api.lawfive.app":{"dailyLimit":5000},"https://bad.example":{"blocked":true}}.
     * PUSH-7: keySha256, the SHA-256 (hex) of a key that server's sends must carry, so nobody else can use up its limit.
     */
    SERVER_OVERRIDES?: string;
    /** PUSH-3: "true" stops all sending. */
    PAUSED?: string;
}

export const DEFAULT_DEVICE_DAILY_LIMIT = 25;
export const DEFAULT_SERVER_DAILY_LIMIT = 250;

const positive = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return value !== undefined && value !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** A setting that can't be read counts as unset, so a mistyped one never stops the relay. */
type Override = { dailyLimit?: number; blocked?: boolean; keySha256?: string };

function overrides(env: Env): Record<string, Override> {
    try {
        const parsed: unknown = JSON.parse(env.SERVER_OVERRIDES || "{}");
        return parsed && typeof parsed === "object" ? parsed as Record<string, Override> : {};
    } catch {
        console.error("SERVER_OVERRIDES isn't JSON; ignoring it");
        return {};
    }
}

export function limitsFor(env: Env, server: string) {
    const override = overrides(env)[server];
    // PUSH-7: a key's hash that isn't one can't be matched, so the server's sends are refused rather than open.
    const keySha256 = typeof override?.keySha256 === "string" ? override.keySha256.trim().toLowerCase() : undefined;
    return {
        blocked: override?.blocked === true,
        ...(keySha256 !== undefined ? { keySha256 } : {}),
        deviceDaily: positive(env.DEVICE_DAILY_LIMIT, DEFAULT_DEVICE_DAILY_LIMIT),
        serverDaily: Number.isInteger(override?.dailyLimit) && override!.dailyLimit! >= 0
            ? override!.dailyLimit!
            : positive(env.SERVER_DAILY_LIMIT, DEFAULT_SERVER_DAILY_LIMIT),
    };
}
