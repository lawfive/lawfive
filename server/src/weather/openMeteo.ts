// Forecasts and past weather from Open-Meteo (open-meteo.com; data CC BY 4.0): hour-by-hour
// weather for several places in one request. Free without a key for non-commercial use (10,000
// calls a day); a paid plan's key goes in WEATHER_API_KEY, and WEATHER_URL (forecasts) and
// WEATHER_HISTORY_URL (past weather) can point at a self-hosted copy.

/** One place's forecast, hour by hour. Totals (rain, snow, gusts) are for the hour before each time. */
export interface Hourly {
    /** Seconds since 1970, on the hour. */
    time: number[];
    temperature: (number | null)[];
    apparent: (number | null)[];
    precipitation: (number | null)[];
    /** Chance of more than 0.1 mm, 0 to 100; missing beyond the models that give it. */
    chance: (number | null)[];
    /** Centimetres. */
    snowfall: (number | null)[];
    /** WMO weather code. */
    code: (number | null)[];
    gust: (number | null)[];
    isDay: (number | null)[];
}

export interface Place {
    lat: number;
    lon: number;
}

/** Fetches forecasts for places, in the same order; `days` ahead (up to 16), plus the day before. */
export type ForecastProvider = (places: Place[], days: number) => Promise<Hourly[]>;

// Eight values: Open-Meteo counts a request with more than ten as more than one call.
const variables = {
    temperature: "temperature_2m",
    apparent: "apparent_temperature",
    precipitation: "precipitation",
    chance: "precipitation_probability",
    snowfall: "snowfall",
    code: "weather_code",
    gust: "wind_gusts_10m",
    isDay: "is_day",
} as const;

const userAgent = "LawFive/0.1 (+https://lawfive.dev)";

/** Hourly weather for places, in the same order, from an Open-Meteo endpoint. */
async function hourlyFor(url: string, places: Place[], params: Record<string, string>, apiKey?: string): Promise<Hourly[]> {
    const query = new URLSearchParams({
        latitude: places.map((p) => p.lat).join(","),
        longitude: places.map((p) => p.lon).join(","),
        hourly: Object.values(variables).join(","),
        timeformat: "unixtime",
        wind_speed_unit: "kmh",
        ...params,
        ...(apiKey ? { apikey: apiKey } : {}),
    });
    const res = await fetch(`${url}?${query}`, {
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
        throw new Error(`Open-Meteo answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as unknown;
    // One place comes back as an object, several as a list.
    const list = (Array.isArray(body) ? body : [body]) as { hourly?: Record<string, (number | null)[]> }[];
    if (list.length !== places.length) {
        throw new Error(`Open-Meteo sent ${list.length} answers for ${places.length} places`);
    }
    return list.map(({ hourly }) => {
        if (!hourly || !Array.isArray(hourly.time)) {
            throw new Error("Open-Meteo sent an answer without hourly data");
        }
        const column = (name: string) => hourly[name] ?? hourly.time.map(() => null);
        return {
            time: hourly.time as number[],
            temperature: column(variables.temperature),
            apparent: column(variables.apparent),
            precipitation: column(variables.precipitation),
            chance: column(variables.chance),
            snowfall: column(variables.snowfall),
            code: column(variables.code),
            gust: column(variables.gust),
            isDay: column(variables.isDay),
        };
    });
}

export function openMeteo(baseUrl: string, apiKey?: string): ForecastProvider {
    return (places, days) => hourlyFor(`${baseUrl.replace(/\/$/, "")}/v1/forecast`, places, { past_days: "1", forecast_days: String(days) }, apiKey);
}

/** The weather at one place between two dates (inclusive, UTC), from the past (WX-10). */
export type HistoryProvider = (place: Place, from: string, to: string) => Promise<Hourly>;

/**
 * Open-Meteo's historical weather (archive-api.open-meteo.com): any date since 1940, the most
 * recent days from its weather models. Each request is one place, so one call.
 */
export function openMeteoHistory(baseUrl: string, apiKey?: string): HistoryProvider {
    return async (place, from, to) => (await hourlyFor(`${baseUrl.replace(/\/$/, "")}/v1/archive`, [place], { start_date: from, end_date: to }, apiKey))[0];
}
