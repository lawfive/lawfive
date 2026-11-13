import { z } from "zod";
import { Id, Timestamp } from "./common.ts";

// Weather for a match (WX-1 to WX-8), worked out by the server from a forecast for the pitch's
// location. Not a stored record: forecasts change through the day, so apps read it from
// GET /v1/weather rather than syncing it. Once a match is over, the weather it was played in is kept.

export const WeatherCondition = z
    .enum(["clear", "partlyCloudy", "cloudy", "fog", "drizzle", "rain", "snow", "storm"])
    .meta({ id: "WeatherCondition", description: "What the sky is doing, for the icon: the most significant condition while the match is played." });

export const WeatherRiskKind = z
    .enum(["wetField", "rain", "storm", "snow", "heat"])
    .meta({ id: "WeatherRiskKind", description: "wetField: rain in the 24 hours before (fields close); rain, storm, snow: during the match or the hour before; heat: feels-like temperature while playing." });

export const WeatherRisk = z
    .object({
        kind: WeatherRiskKind,
        level: z.enum(["possible", "likely"]).describe("possible: worth watching; likely: the match may well be called off or stopped."),
        amount: z.number().optional().describe("What the level is based on: millimeters of rain (wetField: in the 24 hours before; rain: during the match), centimeters of snow, or the highest feels-like temperature in °C (heat)."),
    })
    .meta({ id: "WeatherRisk", description: "Something in the forecast that could stop or cancel the match (WX-4). Rough rules, not a prediction." });

export const WeatherHour = z
    .object({
        time: Timestamp.describe("The start of the hour."),
        condition: WeatherCondition,
        isDay: z.boolean(),
        temperatureC: z.number(),
        precipitationMm: z.number().nonnegative().describe("Rain (or melted snow) during the hour."),
        precipitationChance: z.number().min(0).max(1).optional(),
    })
    .meta({ id: "WeatherHour" });

export const MatchWeather = z
    .object({
        matchId: Id,
        final: z.boolean().describe("true once the match is over: the weather it was played in, which no longer changes. false: a forecast, updated as kickoff gets closer."),
        condition: WeatherCondition,
        isDay: z.boolean().describe("Daylight at kickoff, for a sun or moon icon."),
        temperatureC: z.number().describe("At kickoff."),
        feelsLikeC: z.number().describe("At kickoff: the temperature with humidity, wind and sun taken into account."),
        precipitationChance: z.number().min(0).max(1).optional().describe("The highest chance of rain in any hour of the match."),
        precipitationMm: z.number().nonnegative().describe("Expected rain from an hour before kickoff to the end of the match."),
        precipitationBeforeMm: z.number().nonnegative().describe("Rain in the 24 hours before that."),
        windGustKph: z.number().nonnegative().optional().describe("The strongest gust during the match."),
        hours: z.array(WeatherHour).describe("Hour by hour from kickoff to the end of the match."),
        risks: z.array(WeatherRisk),
        updatedAt: Timestamp.describe("When the forecast was fetched."),
        source: z.string().describe("Whose data it is, to credit beside it (Open-Meteo)."),
    })
    .meta({ id: "MatchWeather", description: "The weather for one match, from the forecast for its pitch (or venue) location." });

export type WeatherCondition = z.infer<typeof WeatherCondition>;
export type WeatherRisk = z.infer<typeof WeatherRisk>;
export type WeatherHour = z.infer<typeof WeatherHour>;
export type MatchWeather = z.infer<typeof MatchWeather>;
