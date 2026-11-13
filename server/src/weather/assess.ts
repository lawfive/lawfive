import type { MatchFormat, MatchWeather, WeatherCondition, WeatherRisk } from "@lawfive/schema";
import type { Hourly } from "./openMeteo.ts";

// From a place's hourly forecast to one match's weather: the conditions while it's played and the
// risks that could stop or cancel it (WX-3, WX-4). Rough rules, written to be easy to explain.

const HOUR = 3600;

/** WMO weather codes (as Open-Meteo sends them) to the conditions apps draw. */
export function conditionOf(code: number | null): WeatherCondition {
    if (code === null || code <= 1) {
        return "clear";
    }
    if (code === 2) {
        return "partlyCloudy";
    }
    if (code === 3) {
        return "cloudy";
    }
    if (code === 45 || code === 48) {
        return "fog";
    }
    if (code >= 51 && code <= 57) {
        return "drizzle";
    }
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
        return "rain";
    }
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
        return "snow";
    }
    if (code >= 95) {
        return "storm";
    }
    return "cloudy";
}

/** Least to most significant: a match's icon is the most significant condition while it's played. */
const significance: WeatherCondition[] = ["clear", "partlyCloudy", "cloudy", "fog", "drizzle", "rain", "snow", "storm"];

/** How long a match takes, kickoff to final whistle, without extra time or stoppage. */
export function matchLengthSec(format: MatchFormat): number {
    return format.periods * format.periodSec
        + (format.periods - 1) * format.breakSec
        + (format.halfwayBreak ? format.periods * format.halfwayBreakSec : 0);
}

/** The thresholds behind the risk badges (WX-4): [possible, likely]. */
export const thresholds = {
    /** Rain in the 24 hours before (mm): many parks close grass fields after about half an inch. */
    wetField: [12, 25],
    /** Rain from an hour before kickoff to the end (mm); a 70% chance in any hour also counts as possible. */
    rain: [5, 10],
    rainChance: 0.7,
    /** Snow before or during (cm): any at all is possible. */
    snow: [0.1, 2],
    /** Highest feels-like temperature while playing (°C): 90 °F and 100 °F. */
    heat: [32, 38],
    /** A thunderstorm in the forecast is possible; with a 50% chance of rain or more, likely. */
    stormChance: 0.5,
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

type Assessed = Omit<MatchWeather, "matchId" | "final" | "updatedAt" | "source">;

/**
 * The weather for a match kicking off at `kickoff` (seconds since 1970) and lasting `lengthSec`,
 * or undefined when the forecast doesn't reach kickoff (too far ahead, or too long ago).
 */
export function assess(h: Hourly, kickoff: number, lengthSec: number): Assessed | undefined {
    const end = kickoff + lengthSec;
    const start = kickoff - HOUR;
    const first = h.time[0];
    const last = h.time.at(-1);
    if (first === undefined || last === undefined || kickoff < first || kickoff > last) {
        return undefined;
    }
    const indexes = (keep: (t: number) => boolean) => h.time.flatMap((t, i) => (keep(t) ? [i] : []));
    const sum = (list: number[], values: (number | null)[]) => list.reduce((total, i) => total + (values[i] ?? 0), 0);
    const max = (list: number[], values: (number | null)[]) => {
        const known = list.map((i) => values[i]).filter((v): v is number => v !== null && v !== undefined);
        return known.length ? Math.max(...known) : undefined;
    };
    const at = (t: number) => h.time.indexOf(t);

    // Totals are for the hour before each time: these hours overlap the match (and the hour before it).
    const during = indexes((t) => t > start && t - HOUR < end);
    const before = indexes((t) => t > start - 24 * HOUR && t <= start);
    // Instant values (temperature, the weather code) on each hour while playing.
    const kickoffHour = Math.floor(kickoff / HOUR) * HOUR;
    const playing = indexes((t) => t >= kickoffHour && t <= end);
    const nearest = at(Math.round(kickoff / HOUR) * HOUR);
    const k = nearest >= 0 ? nearest : playing[0];

    const precipitationMm = round1(sum(during, h.precipitation));
    const precipitationBeforeMm = round1(sum(before, h.precipitation));
    const snowCm = round1(sum([...before, ...during], h.snowfall));
    const chance = max(during, h.chance);
    const hottest = max(playing, h.apparent);
    const codes = playing.map((i) => h.code[i]);
    const condition = codes.map(conditionOf).reduce((worst, c) => (significance.indexOf(c) > significance.indexOf(worst) ? c : worst), "clear" as WeatherCondition);
    const storm = during.some((i) => (h.code[i] ?? 0) >= 95);

    const risks: WeatherRisk[] = [];
    const add = (kind: WeatherRisk["kind"], amount: number, [possible, likely]: readonly [number, number], alsoPossible = false) => {
        if (amount >= likely) {
            risks.push({ kind, level: "likely", amount });
        } else if (amount >= possible || alsoPossible) {
            risks.push({ kind, level: "possible", amount });
        }
    };
    add("wetField", precipitationBeforeMm, thresholds.wetField);
    if (storm) {
        risks.push({ kind: "storm", level: (chance ?? 0) / 100 >= thresholds.stormChance ? "likely" : "possible" });
    }
    add("rain", precipitationMm, thresholds.rain, (chance ?? 0) / 100 >= thresholds.rainChance);
    add("snow", snowCm, thresholds.snow);
    if (hottest !== undefined) {
        add("heat", round1(hottest), thresholds.heat);
    }

    // Hour by hour from kickoff: each hour's totals are on the next hour's entry.
    const hours: MatchWeather["hours"] = [];
    for (let t = kickoffHour; t < end; t += HOUR) {
        const i = at(t);
        const next = at(t + HOUR);
        if (i < 0) {
            break;
        }
        const nextChance = next >= 0 ? h.chance[next] : null;
        hours.push({
            time: new Date(t * 1000).toISOString(),
            condition: conditionOf(h.code[i]),
            isDay: h.isDay[i] !== 0,
            temperatureC: round1(h.temperature[i] ?? 0),
            precipitationMm: round1(next >= 0 ? h.precipitation[next] ?? 0 : 0),
            ...(nextChance !== null ? { precipitationChance: nextChance / 100 } : {}),
        });
    }

    const gust = max(during, h.gust);
    return {
        condition,
        isDay: h.isDay[k] !== 0,
        temperatureC: round1(h.temperature[k] ?? 0),
        feelsLikeC: round1(h.apparent[k] ?? h.temperature[k] ?? 0),
        ...(chance !== undefined ? { precipitationChance: chance / 100 } : {}),
        precipitationMm,
        precipitationBeforeMm,
        ...(gust !== undefined ? { windGustKph: Math.round(gust) } : {}),
        hours,
        risks,
    };
}
