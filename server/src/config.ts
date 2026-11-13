// Settings from environment variables, so the same image runs self-hosted and on the hosted service.
// See .env.example at the repo root.

import { execFileSync } from "node:child_process";

export interface Config {
    /** Postgres connection string. */
    databaseUrl: string;
    /** Signs sessions; at least 32 characters, kept secret. */
    authSecret: string;
    /** The address people and apps reach this server at, such as https://lawfive.example.com. */
    publicUrl: string;
    /** The address apps use for the API, when it isn't publicUrl (API_URL, APP-13). */
    apiUrl?: string;
    port: number;
    /** Who can make an account (USR-2): anyone, anyone with an admin's approval, or only with an invitation. */
    signUp: SignUpMode;
    /** Accounts with these addresses are admins (USR-1), lower case. */
    adminEmails: string[];
    /** Email for invitations and approvals (USR-5), or undefined when none is set up. */
    mail?: MailSettings;
    /** Map tiles for the web UI and apps. */
    maps: MapSettings;
    /** A Nominatim-compatible address lookup service, or undefined when switched off. */
    geocoderUrl?: string;
    /** Weather forecasts for matches (WX-2), or undefined when switched off. */
    weather?: WeatherSettings;
    /** Webhooks may reach private and local addresses (HOOK-4): WEBHOOK_ALLOW_PRIVATE=true, for a server on a home network. */
    webhookAllowPrivate: boolean;
    /** The push relay notifications go through (PUSH-4), or undefined with PUSH_RELAY_URL=off. */
    pushRelayUrl?: string;
    /** PUSH-7: the key the relay asks of this server (RELAY_KEY), for a server it gives one; unset for self-hosted servers. */
    relayKey?: string;
    /** Where uploaded photos go (FILE-4): an S3-compatible bucket when S3_URL is set, else this folder (UPLOADS_DIR). */
    uploadsDir: string;
    s3Url?: string;
    /** VER-1: this build's version and commit, from the image (LAWFIVE_VERSION, LAWFIVE_COMMIT) or git. */
    version: ServerVersion;
}

export interface ServerVersion {
    version: string;
    commit: string;
}

/**
 * VER-1: the version the image was built with, else (run from a checkout) tools/version.sh's,
 * else "dev".
 */
export function serverVersion(env: NodeJS.ProcessEnv = process.env): ServerVersion {
    if (env.LAWFIVE_VERSION) {
        return { version: env.LAWFIVE_VERSION, commit: env.LAWFIVE_COMMIT || "unknown" };
    }
    try {
        const script = new URL("../../tools/version.sh", import.meta.url).pathname;
        const [version, commit] = execFileSync(script, ["server"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().split(" ");
        return { version, commit };
    } catch {
        return { version: "dev", commit: "unknown" };
    }
}

export type SignUpMode = "open" | "approval" | "closed";

export interface MailSettings {
    /** An SMTP server: smtp://user:password@host:587 (STARTTLS) or smtps://...:465. */
    url: string;
    /** The sender: "LawFive <lawfive@example.com>". */
    from: string;
}

export interface WeatherSettings {
    /** An Open-Meteo-compatible forecast service. */
    url: string;
    /** Its historical weather, for played matches without kept weather (WX-10); none when switched off. */
    historyUrl?: string;
    /** For Open-Meteo's paid plans (their customer-api address), which a commercial service needs. */
    apiKey?: string;
    /** Calls a day at most; the free plan allows 10,000. */
    dailyLimit: number;
}

export interface MapLayer {
    tileUrl: string;
    attribution: string;
}

export interface MapStyle {
    url: string;
    darkUrl?: string;
    attribution: string;
}

export interface MapSettings extends MapLayer {
    /** A vector map (a MapLibre style), used instead of the tiles by apps that can draw one. */
    style?: MapStyle;
    /** Aerial imagery, offered as a second layer when a provider is set up (they need a key). */
    satellite?: MapLayer;
}

/** OpenFreeMap: free, no key or limits, and self-hostable; with a dark style for dark mode. */
export const openFreeMap: MapStyle = {
    url: "https://tiles.openfreemap.org/styles/liberty",
    darkUrl: "https://tiles.openfreemap.org/styles/dark",
    attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

/**
 * OpenFreeMap's vector map, with OpenStreetMap's own tiles for apps that can only draw raster
 * tiles (fine for a personal server; a busy one should set a tile provider).
 */
export const defaultMaps: MapSettings = {
    style: openFreeMap,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

/**
 * Settings in the environment's shape (SMTP_URL, MAP_STYLE_URL…): the environment itself, or with
 * what an admin set in the web app for those it leaves unset (ADM-1, serverSettings.ts).
 */
export type SettingValues = Record<string, string | undefined>;

/** The vector map from MAP_STYLE_URL and friends: OpenFreeMap by default, none with "off". */
function mapStyle(env: SettingValues): MapStyle | undefined {
    const url = env.MAP_STYLE_URL;
    if (url === "off") {
        return undefined;
    }
    if (!url) {
        return openFreeMap;
    }
    return {
        url,
        ...(env.MAP_STYLE_DARK_URL ? { darkUrl: env.MAP_STYLE_DARK_URL } : {}),
        attribution: env.MAP_STYLE_ATTRIBUTION ?? "",
    };
}

/** Email (USR-5): SMTP_URL, sent from MAIL_FROM (LawFive at the server's own address by default); none without SMTP_URL. */
export function mailSettings(env: SettingValues, publicUrl: string): MailSettings | undefined {
    return env.SMTP_URL ? { url: env.SMTP_URL, from: env.MAIL_FROM || `LawFive <lawfive@${new URL(publicUrl).hostname}>` } : undefined;
}

export function mapSettings(env: SettingValues): MapSettings {
    const style = mapStyle(env);
    return {
        ...(style ? { style } : {}),
        tileUrl: env.MAP_TILE_URL || defaultMaps.tileUrl,
        attribution: env.MAP_ATTRIBUTION || defaultMaps.attribution,
        ...(env.MAP_SATELLITE_URL ? { satellite: { tileUrl: env.MAP_SATELLITE_URL, attribution: env.MAP_SATELLITE_ATTRIBUTION ?? "" } } : {}),
    };
}

/** Address search: Nominatim by default, none with "off". */
export function geocoderSetting(env: SettingValues): string | undefined {
    return env.GEOCODER_URL === "off" ? undefined : (env.GEOCODER_URL || "https://nominatim.openstreetmap.org");
}

/** Weather (WX-1, WX-10): Open-Meteo by default, none with "off". */
export function weatherSettings(env: SettingValues): WeatherSettings | undefined {
    if (env.WEATHER_URL === "off") {
        return undefined;
    }
    const limit = Number(env.WEATHER_DAILY_LIMIT || 5000);
    return {
        url: env.WEATHER_URL || "https://api.open-meteo.com",
        ...(env.WEATHER_HISTORY_URL === "off" ? {} : { historyUrl: env.WEATHER_HISTORY_URL || "https://archive-api.open-meteo.com" }),
        apiKey: env.WEATHER_API_KEY || undefined,
        dailyLimit: Number.isFinite(limit) && limit > 0 ? limit : 5000,
    };
}

export function signUpMode(value: string | undefined): SignUpMode {
    const mode = value || "open";
    if (mode !== "open" && mode !== "approval" && mode !== "closed") {
        throw new Error(`SIGN_UP must be open, approval or closed, not "${mode}"`);
    }
    return mode;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
    const required = (name: string): string => {
        const value = env[name];
        if (!value) {
            throw new Error(`${name} is not set (see .env.example)`);
        }
        return value;
    };
    const authSecret = required("AUTH_SECRET");
    if (authSecret.length < 32) {
        throw new Error("AUTH_SECRET must be at least 32 characters (try: openssl rand -base64 32)");
    }
    return {
        databaseUrl: required("DATABASE_URL"),
        authSecret,
        publicUrl: env.PUBLIC_URL ?? "http://localhost:3000",
        ...(env.API_URL ? { apiUrl: env.API_URL.replace(/\/+$/, "") } : {}),
        port: Number(env.PORT ?? 3000),
        signUp: signUpMode(env.SIGN_UP),
        adminEmails: (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
        ...(mailSettings(env, env.PUBLIC_URL ?? "http://localhost") ? { mail: mailSettings(env, env.PUBLIC_URL ?? "http://localhost") } : {}),
        maps: mapSettings(env),
        geocoderUrl: geocoderSetting(env),
        weather: weatherSettings(env),
        webhookAllowPrivate: env.WEBHOOK_ALLOW_PRIVATE === "true",
        ...(env.PUSH_RELAY_URL === "off" ? {} : { pushRelayUrl: env.PUSH_RELAY_URL || "https://push.lawfive.app" }),
        ...(env.RELAY_KEY ? { relayKey: env.RELAY_KEY } : {}),
        uploadsDir: env.UPLOADS_DIR || "uploads",
        ...(env.S3_URL ? { s3Url: env.S3_URL } : {}),
        version: serverVersion(env),
    };
}
