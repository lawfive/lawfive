import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
    type MailSettings, type MapSettings, type SettingValues, type SignUpMode, type WeatherSettings,
    geocoderSetting, mailSettings, mapSettings, signUpMode, weatherSettings,
} from "./config.ts";
import { type Db, tables } from "./db/index.ts";

// Server settings (ADM-1 to ADM-4): what an admin can change in the web app (Settings → Server),
// unless the environment sets it, which then fixes it there. Each keeps its environment
// variable's name and format ("off", "true", numbers), so the two read the same, and is kept in
// server_setting under its own key (signUp is USR-7's, from before). Secrets (the SMTP address,
// which holds its password, and the weather API key) are stored encrypted with a key made from
// AUTH_SECRET and never sent back: a new AUTH_SECRET means entering them again.

export interface SettingDef {
    key: string;
    env: string;
    secret?: boolean;
}

export const settingDefs = [
    { key: "signUp", env: "SIGN_UP" },
    { key: "smtpUrl", env: "SMTP_URL", secret: true },
    { key: "mailFrom", env: "MAIL_FROM" },
    { key: "mapStyleUrl", env: "MAP_STYLE_URL" },
    { key: "mapStyleDarkUrl", env: "MAP_STYLE_DARK_URL" },
    { key: "mapStyleAttribution", env: "MAP_STYLE_ATTRIBUTION" },
    { key: "mapTileUrl", env: "MAP_TILE_URL" },
    { key: "mapAttribution", env: "MAP_ATTRIBUTION" },
    { key: "mapSatelliteUrl", env: "MAP_SATELLITE_URL" },
    { key: "mapSatelliteAttribution", env: "MAP_SATELLITE_ATTRIBUTION" },
    { key: "geocoderUrl", env: "GEOCODER_URL" },
    { key: "weatherUrl", env: "WEATHER_URL" },
    { key: "weatherHistoryUrl", env: "WEATHER_HISTORY_URL" },
    { key: "weatherApiKey", env: "WEATHER_API_KEY", secret: true },
    { key: "weatherDailyLimit", env: "WEATHER_DAILY_LIMIT" },
    { key: "webhookAllowPrivate", env: "WEBHOOK_ALLOW_PRIVATE" },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof settingDefs)[number]["key"];

/** A setting as the admin page shows it: where its value comes from, and the value unless it's a secret. */
export interface SettingView {
    key: SettingKey;
    env: string;
    source: "environment" | "admin" | "default";
    value?: string;
    secret?: true;
    /** A secret: whether it has a value. */
    set?: boolean;
}

const httpUrl = /^https?:\/\/[^\s]+$/;
const offOrUrl = (v: string) => v === "off" || httpUrl.test(v);

/** Why a value can't be used, or undefined when it can. */
function problemWith(key: SettingKey, value: string): string | undefined {
    switch (key) {
        case "signUp":
            return ["open", "approval", "closed"].includes(value) ? undefined : "Sign-up is open, approval or closed.";
        case "smtpUrl":
            return /^smtps?:\/\/[^\s]+$/.test(value) ? undefined : "An SMTP address starts smtp:// or smtps://.";
        case "mapStyleUrl":
        case "geocoderUrl":
        case "weatherUrl":
        case "weatherHistoryUrl":
            return offOrUrl(value) ? undefined : "An http(s) address, or off.";
        case "mapStyleDarkUrl":
        case "mapTileUrl":
        case "mapSatelliteUrl":
            return httpUrl.test(value) ? undefined : "An http(s) address.";
        case "weatherDailyLimit":
            return /^[1-9]\d{0,6}$/.test(value) ? undefined : "A whole number of calls a day.";
        case "webhookAllowPrivate":
            return value === "true" || value === "false" ? undefined : "true or false.";
        default:
            return undefined;
    }
}

export class ServerSettingsStore {
    private stored = new Map<string, string>();
    private readonly listeners: (() => void)[] = [];
    private readonly cipherKey: Buffer;
    private readonly db: Db;
    private readonly env: SettingValues;
    private readonly publicUrl: string;

    constructor(db: Db, env: SettingValues, authSecret: string, publicUrl: string) {
        this.db = db;
        this.env = env;
        this.publicUrl = publicUrl;
        this.cipherKey = createHash("sha256").update(`lawfive server settings:${authSecret}`).digest();
    }

    /** Reads what admins have set. */
    async load(): Promise<void> {
        const rows = await this.db.select().from(tables.serverSetting).where(inArray(tables.serverSetting.key, settingDefs.map((d) => d.key)));
        const stored = new Map<string, string>();
        for (const row of rows) {
            const def = settingDefs.find((d) => d.key === row.key);
            // Always written as text, but "16" or "true" can come back as a number or a boolean:
            // postgres.js and Drizzle each parse a jsonb column, so it's parsed twice (not in PGlite).
            if (!def || !["string", "number", "boolean"].includes(typeof row.value)) {
                continue;
            }
            const text = String(row.value);
            const value = "secret" in def ? this.decrypt(text) : text;
            if (value === undefined) {
                console.error(`The server setting ${def.env} can't be read (was AUTH_SECRET changed?); set it again in Settings → Server.`);
            } else {
                stored.set(row.key, value);
            }
        }
        this.stored = stored;
    }

    /** Set in the environment, so fixed there. */
    fixed(def: SettingDef): boolean {
        return !!this.env[def.env];
    }

    /** All the settings in the environment's shape: the environment's, else an admin's. */
    values(): SettingValues {
        return Object.fromEntries(settingDefs.map((d) => [d.env, this.env[d.env] || this.stored.get(d.key)]));
    }

    mail(): MailSettings | undefined {
        return mailSettings(this.values(), this.publicUrl);
    }

    maps(): MapSettings {
        return mapSettings(this.values());
    }

    geocoderUrl(): string | undefined {
        return geocoderSetting(this.values());
    }

    weather(): WeatherSettings | undefined {
        return weatherSettings(this.values());
    }

    webhookAllowPrivate(): boolean {
        return this.values().WEBHOOK_ALLOW_PRIVATE === "true";
    }

    signUp(): SignUpMode {
        try {
            return signUpMode(this.values().SIGN_UP);
        } catch {
            return "open";
        }
    }

    describe(): SettingView[] {
        return settingDefs.map((d) => {
            const value = this.env[d.env] || this.stored.get(d.key);
            const source = this.fixed(d) ? "environment" : this.stored.has(d.key) ? "admin" : "default";
            return "secret" in d
                ? { key: d.key, env: d.env, source, secret: true, set: !!value }
                : { key: d.key, env: d.env, source, ...(value !== undefined ? { value } : {}) };
        });
    }

    /**
     * Sets (a value) or clears (null or "") settings; nothing changes if any can't be, and the
     * answer says why. Then everything that uses them follows (onChange).
     */
    async update(changes: Partial<Record<SettingKey, string | null>>): Promise<{ error: string } | undefined> {
        for (const [key, value] of Object.entries(changes)) {
            const def = settingDefs.find((d) => d.key === key);
            if (!def) {
                return { error: `There's no setting ${key}.` };
            }
            if (this.fixed(def)) {
                return { error: `${def.env} is set on the server, so it can't be changed here.` };
            }
            if (value) {
                const problem = value.length > 2000 ? "Too long." : problemWith(def.key, value.trim());
                if (problem) {
                    return { error: `${def.env}: ${problem}` };
                }
            }
        }
        const { serverSetting } = tables;
        for (const [key, raw] of Object.entries(changes)) {
            const def = settingDefs.find((d) => d.key === key)!;
            const value = raw?.trim();
            if (!value) {
                await this.db.delete(serverSetting).where(eq(serverSetting.key, key));
                continue;
            }
            const stored = "secret" in def ? this.encrypt(value) : value;
            await this.db.insert(serverSetting).values({ key, value: stored })
                .onConflictDoUpdate({ target: serverSetting.key, set: { value: stored, updatedAt: new Date() } });
        }
        await this.load();
        for (const listener of this.listeners) {
            listener();
        }
        return undefined;
    }

    onChange(listener: () => void): void {
        this.listeners.push(listener);
    }

    private encrypt(text: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", this.cipherKey, iv);
        const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
        return `enc:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
    }

    private decrypt(stored: string): string | undefined {
        if (!stored.startsWith("enc:")) {
            return undefined;
        }
        try {
            const raw = Buffer.from(stored.slice(4), "base64");
            const decipher = createDecipheriv("aes-256-gcm", this.cipherKey, raw.subarray(0, 12));
            decipher.setAuthTag(raw.subarray(12, 28));
            return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
        } catch {
            return undefined;
        }
    }
}
