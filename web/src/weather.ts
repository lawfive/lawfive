import type * as schema from "@lawfive/schema";
import { useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import { request, useMeta } from "./api.ts";
import { formatTemperature } from "./format.ts";

// Match weather from the server (GET /v1/weather, WX-5): the forecast while a match is coming up,
// the weather it was played in once it's over, and the risks worth a badge (WX-4).

export type MatchWeather = z.infer<typeof schema.MatchWeather>;
export type WeatherCondition = MatchWeather["condition"];
export type WeatherRisk = MatchWeather["risks"][number];

const DAY_MS = 86_400_000;

/** Weather for the matches kicking off in a window, by match id; nothing when the server has no weather. */
export function useWeather(window: "upcoming" | "past") {
    const meta = useMeta();
    const enabled = meta.data?.capabilities.includes("weather") ?? false;
    const query = useQuery({
        queryKey: ["weather", window],
        queryFn: async () => {
            const now = Date.now();
            // Upcoming: the default window (the last month and the next 16 days). Past: the last year.
            const range = window === "past" ? `?from=${new Date(now - 365 * DAY_MS).toISOString()}&to=${new Date(now).toISOString()}` : "";
            return (await request<{ items: MatchWeather[] }>("GET", `/weather${range}`)).items;
        },
        enabled,
        // Forecasts change every hour or two on the server; checking every 10 minutes is plenty.
        staleTime: 10 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
    });
    return new Map((query.data ?? []).map((w) => [w.matchId, w]));
}

export function useMatchWeather(matchId: string | undefined) {
    const meta = useMeta();
    const enabled = (meta.data?.capabilities.includes("weather") ?? false) && matchId !== undefined;
    const query = useQuery({
        queryKey: ["weather", "match", matchId],
        queryFn: () => request<MatchWeather>("GET", `/weather/${matchId}`).catch(() => null),
        enabled,
        staleTime: 10 * 60 * 1000,
        refetchInterval: 10 * 60 * 1000,
    });
    return { weather: query.data ?? undefined, enabled, isLoading: enabled && query.isLoading };
}

const conditionNames: Record<WeatherCondition, string> = {
    clear: "Sunny",
    partlyCloudy: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Fog",
    drizzle: "Drizzle",
    rain: "Rain",
    snow: "Snow",
    storm: "Thunderstorms",
};

export function conditionName(condition: WeatherCondition, isDay = true): string {
    return condition === "clear" && !isDay ? "Clear" : conditionNames[condition];
}

export const riskNames: Record<WeatherRisk["kind"], string> = {
    wetField: "Wet field",
    rain: "Rain",
    storm: "Storms",
    snow: "Snow",
    heat: "Heat",
};

/** "Rain likely", "Heat possible". */
export function riskTitle(risk: WeatherRisk): string {
    return `${riskNames[risk.kind]} ${risk.level}`;
}

/** Rain in the user's units: millimetres, or inches for accounts set to miles. */
export function formatRain(mm: number, distanceUnit: "km" | "mi"): string {
    if (distanceUnit === "mi") {
        const inches = mm / 25.4;
        return `${inches < 0.1 ? inches.toFixed(2) : inches.toFixed(1)} in`;
    }
    return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

/** Wind in km/h, or mph for accounts set to miles. */
export function formatWind(kph: number, distanceUnit: "km" | "mi"): string {
    return distanceUnit === "mi" ? `${Math.round(kph / 1.609344)} mph` : `${Math.round(kph)} km/h`;
}

/** "54°", the short form for lists. */
export function formatDegrees(celsius: number, unit: "c" | "f"): string {
    return `${Math.round(unit === "f" ? celsius * 9 / 5 + 32 : celsius)}°`;
}

/** Why the badge is there, in a sentence or two, in the user's units. */
export function explainRisk(risk: WeatherRisk, units: { distanceUnit: "km" | "mi"; temperatureUnit: "c" | "f" }, final = false): string {
    const amount = risk.amount ?? 0;
    switch (risk.kind) {
        case "wetField":
            return `${formatRain(amount, units.distanceUnit)} of rain ${final ? "fell" : "is forecast"} in the 24 hours before kickoff. `
                + `Many parks close grass fields after about ${formatRain(12, units.distanceUnit)}; check with the league or the field's owner.`;
        case "rain":
            return `${formatRain(amount, units.distanceUnit)} of rain ${final ? "fell" : "is expected"} from an hour before kickoff to the end of the match.`;
        case "storm":
            return `Thunderstorms ${final ? "were" : "are"} forecast during the match or the hour before. `
                + "Play stops at the first thunder or lightning, usually until 30 minutes after the last.";
        case "snow":
            return `${amount < 1 ? "Some" : `${Math.round(amount)} cm of`} snow ${final ? "fell" : "is forecast"} before or during the match.`;
        case "heat":
            return `It ${final ? "felt" : "will feel"} like ${formatTemperature(amount, units.temperatureUnit)} during the match. Plan water (hydration) breaks.`;
    }
}
