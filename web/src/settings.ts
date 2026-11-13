import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Draft, type UserSettings, request, useList, useSave } from "./api.ts";
import { directionsUrl } from "./format.ts";
import { newId } from "./ids.ts";

// The user's preferences: units, currency, misconduct codes. Set from the browser's language when
// the account is created (and for an account that has none yet), then changed on the Settings page.

/** Regions that use miles for distance. */
const milesRegions = new Set(["US", "LR", "MM"]);
/** Regions that use Fahrenheit. */
const fahrenheitRegions = new Set(["US", "LR", "MM", "BS", "BZ", "KY", "PW", "FM", "MH"]);
const euro = ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"];
const currencyByRegion: Record<string, string> = {
    ...Object.fromEntries(euro.map((r) => [r, "EUR"])),
    US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP",
    JP: "JPY", KR: "KRW", CN: "CNY", IN: "INR", SG: "SGD", HK: "HKD", PH: "PHP", ID: "IDR", MY: "MYR", TH: "THB", VN: "VND",
    ZA: "ZAR", NG: "NGN", GH: "GHS", KE: "KES", EG: "EGP", AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY",
    CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", IS: "ISK",
};

function region(locale: string): string | undefined {
    try {
        return new Intl.Locale(locale).maximize().region;
    } catch {
        return undefined;
    }
}

export type SettingsValues = Omit<UserSettings, "id" | "version" | "updatedAt" | "deletedAt">;

/** Sensible settings for a browser language such as en-US, en-GB or de-DE. */
export function defaultSettings(locale: string = typeof navigator === "undefined" ? "en-US" : navigator.language): SettingsValues {
    const r = region(locale) ?? "US";
    return {
        currency: currencyByRegion[r] ?? "USD",
        distanceUnit: milesRegions.has(r) ? "mi" : "km",
        temperatureUnit: fahrenheitRegions.has(r) ? "f" : "c",
        misconductScheme: r === "US" ? "ussf" : r === "GB" ? "fa" : "ifab",
    };
}

export function newSettingsDraft(locale?: string): Draft<"settings"> {
    return { id: newId(), ...defaultSettings(locale), timeZone: deviceTimeZone() };
}

/** This browser's time zone, America/Los_Angeles. */
export function deviceTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Filled in once a page load, however many pages use the settings. */
let zoneFilled = false;
/** Made once, however many parts of a page use the settings at the same moment (Matches and Get ready). */
let creating = false;

/**
 * The user's settings. An account without any (made before settings existed, or by another app)
 * gets the browser's defaults, saved once; until then the defaults are used.
 */
export function useSettings(): { settings: SettingsValues; record?: UserSettings } {
    const list = useList("settings");
    const save = useSave("settings");
    const record = list.data?.[0];
    useEffect(() => {
        if (list.isSuccess && !record && !creating) {
            creating = true;
            save.mutate(newSettingsDraft(), { onSettled: () => { creating = false; } });
        } else if (record && !record.timeZone && !zoneFilled) {
            // PLAN-9: an account's time zone comes from the first browser or phone that signs in.
            zoneFilled = true;
            const { updatedAt: _u, deletedAt: _d, ...draft } = record;
            save.mutate({ ...draft, timeZone: deviceTimeZone() });
        }
    }, [list.isSuccess, record, save]);
    return { settings: record ?? defaultSettings(), record };
}

/** Directions links (WEB-14) in the maps app chosen in Settings. */
export function useDirections(): (to: { lat: number; lon: number } | string) => string {
    const app = useList("settings").data?.[0]?.mapsApp ?? "auto";
    return (to) => directionsUrl(to, app);
}

/** Changes made quickly, from anywhere on the page, queue up so each saves on top of the last. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Saves one change on top of the latest saved settings, shown at once (Settings, Get ready's
 * choices, the match form's usual format). Resolves true once saved; false if it couldn't be, when
 * the settings are fetched again so what shows is what's saved.
 */
export function saveSettings(client: QueryClient, patch: Partial<SettingsValues>): Promise<boolean> {
    client.setQueryData<UserSettings[]>(["settings"], (list) => list?.map((s) => ({ ...s, ...patch })));
    const done = queue.then(async () => {
        const latest = client.getQueryData<UserSettings[]>(["settings"])?.[0];
        if (!latest) {
            return false;
        }
        const { updatedAt: _u, deletedAt: _d, ...draft } = { ...latest, ...patch };
        try {
            const saved = await request<UserSettings>("PUT", `/settings/${draft.id}`, draft);
            client.setQueryData<UserSettings[]>(["settings"], [saved]);
            return true;
        } catch {
            await client.invalidateQueries({ queryKey: ["settings"] });
            return false;
        }
    });
    queue = done;
    return done;
}

/** saveSettings for this page's query client. */
export function useChangeSettings(): (patch: Partial<SettingsValues>) => Promise<boolean> {
    const client = useQueryClient();
    return (patch) => saveSettings(client, patch);
}
