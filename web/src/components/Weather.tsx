import {
    CaretDownIcon, CloudFogIcon, CloudIcon, CloudLightningIcon, CloudMoonIcon, CloudRainIcon, CloudSnowIcon, CloudSunIcon, MoonIcon, SunIcon,
    type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";
import type React from "react";
import { Link } from "react-router";
import { formatTemperature, timeAgo } from "../format.ts";
import type { SettingsValues } from "../settings.ts";
import { Slab, SlabFigure } from "./Slab.tsx";
import {
    type MatchWeather, type WeatherCondition, type WeatherRisk,
    conditionName, explainRisk, formatDegrees, formatRain, formatWind, riskNames, riskTitle,
} from "../weather.ts";

// Weather on screen (WX-5): Phosphor's weather icons (a clear day's sun and a storm in amber), the
// risk badges with their reasons, and the match page's weather slab.

const conditionIcons: Record<WeatherCondition, [day: PhosphorIcon, night: PhosphorIcon]> = {
    clear: [SunIcon, MoonIcon],
    partlyCloudy: [CloudSunIcon, CloudMoonIcon],
    cloudy: [CloudIcon, CloudIcon],
    fog: [CloudFogIcon, CloudFogIcon],
    drizzle: [CloudRainIcon, CloudRainIcon],
    rain: [CloudRainIcon, CloudRainIcon],
    snow: [CloudSnowIcon, CloudSnowIcon],
    storm: [CloudLightningIcon, CloudLightningIcon],
};

export function WeatherIcon({ condition, isDay = true, size = 20 }: { condition: WeatherCondition; isDay?: boolean; size?: number }) {
    const Glyph = conditionIcons[condition][isDay ? 0 : 1];
    const amber = (condition === "clear" && isDay) || condition === "storm";
    return <Glyph className={`wx-icon${amber ? " wx-amber" : ""}`} size={size} role="img" aria-label={conditionName(condition, isDay)} />;
}

/** "☁ 54°" beside a match in lists. */
export function WeatherBrief({ weather, unit }: { weather: MatchWeather; unit: "c" | "f" }) {
    return (
        <span className="wx-brief" title={`${conditionName(weather.condition, weather.isDay)}, ${formatTemperature(weather.temperatureC, unit)} at kickoff`}>
            <WeatherIcon condition={weather.condition} isDay={weather.isDay} size={18} />
            {formatDegrees(weather.temperatureC, unit)}
        </span>
    );
}

const riskIcons: Record<WeatherRisk["kind"], WeatherCondition> = { wetField: "rain", rain: "rain", storm: "storm", snow: "snow", heat: "clear" };

/** One risk as a badge (amber possible, red likely); tap for the reason. */
export function RiskBadge({ risk, weather, settings }: { risk: WeatherRisk; weather: MatchWeather; settings: SettingsValues }) {
    return (
        <DialogTrigger>
            <Button className={`chip wx-risk ${risk.level === "likely" ? "chip-red" : "chip-amber"}`} aria-label={`${riskTitle(risk)}: why`}>
                <WeatherIcon condition={riskIcons[risk.kind]} size={14} />
                {riskNames[risk.kind]}
            </Button>
            <Popover className="ref-popover wx-popover" placement="bottom end" offset={6}>
                <Dialog className="ref-dialog" aria-label={riskTitle(risk)}>
                    <strong>{riskTitle(risk)}</strong>
                    <p>{explainRisk(risk, settings, weather.final)}</p>
                    <span className="muted wx-source">{weather.final ? "Weather at the time" : `Forecast updated ${timeAgo(weather.updatedAt)}`} · {weather.source}</span>
                </Dialog>
            </Popover>
        </DialogTrigger>
    );
}

export function RiskBadges({ weather, settings }: { weather: MatchWeather; settings: SettingsValues }) {
    return <>{weather.risks.map((r) => <RiskBadge key={r.kind} risk={r} weather={weather} settings={settings} />)}</>;
}

const hourFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric" });

/**
 * The match page's weather (WX-5) under the scoreboard, on a slab (WEB-28): the temperature at kickoff
 * large with the conditions, the other figures in cells, the risk badges, and the rest (hour by hour,
 * the risks spelled out, when it was updated, and the credit, WX-8) in a popover. Not cut on the
 * diagonal, as the badges and Details open popovers.
 */
export function WeatherSlab({ weather, settings }: { weather: MatchWeather; settings: SettingsValues }) {
    const { temperatureUnit: t, distanceUnit: d } = settings;
    const figures = [
        // A temperature stays whole, as the large one; other units sit small beside their figure.
        { label: "Feels like", value: formatTemperature(weather.feelsLikeC, t), whole: true },
        weather.precipitationChance !== undefined && !weather.final && { label: "Chance of rain", value: `${Math.round(weather.precipitationChance * 100)}%` },
        weather.final && { label: "Rain", value: weather.precipitationMm > 0 ? formatRain(weather.precipitationMm, d) : "None" },
        weather.windGustKph !== undefined && { label: "Gusts", value: formatWind(weather.windGustKph, d) },
    ].filter((f) => f !== false);
    const details = [
        weather.precipitationChance !== undefined && !weather.final && `${Math.round(weather.precipitationChance * 100)}% chance of rain`,
        weather.precipitationMm > 0 && `${formatRain(weather.precipitationMm, d)} of rain during the match`,
        weather.precipitationBeforeMm > 0 ? `${formatRain(weather.precipitationBeforeMm, d)} of rain in the 24 hours before` : "No rain in the 24 hours before",
        weather.windGustKph !== undefined && `Gusts to ${formatWind(weather.windGustKph, d)}`,
    ].filter(Boolean);
    return (
        <Slab title={weather.final ? "Weather" : "Forecast"} tag="At kickoff" className="wx-slab">
            <div className="wx-slab-grid">
                <div className="wx-now">
                    <p className="slab-figure big"><WeatherIcon condition={weather.condition} isDay={weather.isDay} size={44} />{formatTemperature(weather.temperatureC, t)}</p>
                    <span className="slab-caption">{conditionName(weather.condition, weather.isDay)}</span>
                </div>
                <dl className="wx-figures">
                    {figures.map((f) => (
                        <div key={f.label} className="slab-cell">
                            <dt className="slab-label quiet">{f.label}</dt>
                            <dd>{"whole" in f ? <p className="slab-figure">{f.value}</p> : <SlabFigure text={f.value} />}</dd>
                        </div>
                    ))}
                </dl>
                <div className="wx-slab-foot">
                {weather.risks.length > 0 && <span className="wx-badges"><RiskBadges weather={weather} settings={settings} /></span>}
                <DialogTrigger>
                    <Button className="link-button wx-more">Details<CaretDownIcon size={14} /></Button>
                    <Popover className="ref-popover wx-details-popover" placement="bottom end" offset={6}>
                        <Dialog className="ref-dialog" aria-label={weather.final ? "The weather" : "The forecast"}>
                            <ul className="wx-details">{details.map((text, i) => <li key={i}>{text}</li>)}</ul>
                            {weather.hours.length > 1 && (
                                <ol className="wx-hours" aria-label="Hour by hour">
                                    {weather.hours.map((h) => (
                                        <li key={h.time}>
                                            <span className="muted">{hourFormat.format(new Date(h.time))}</span>
                                            <WeatherIcon condition={h.condition} isDay={h.isDay} size={22} />
                                            <strong>{formatDegrees(h.temperatureC, t)}</strong>
                                            <span className="wx-rain">
                                                {h.precipitationMm >= 0.1 ? formatRain(h.precipitationMm, d) : h.precipitationChance !== undefined && !weather.final ? `${Math.round(h.precipitationChance * 100)}%` : "–"}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            {weather.risks.length > 0 && (
                                <ul className="wx-risks">
                                    {weather.risks.map((r) => (
                                        <li key={r.kind} className={r.level}>
                                            <strong>{riskTitle(r)}</strong>
                                            <span>{explainRisk(r, settings, weather.final)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <span className="muted wx-source">
                                {weather.final ? "The weather when the match was played" : `Forecast updated ${timeAgo(weather.updatedAt)}; it changes as kickoff gets closer`}
                                {" · "}Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{weather.source}</a>
                                {" · "}<Link to="/settings/licenses">Licenses</Link>
                            </span>
                        </Dialog>
                    </Popover>
                </DialogTrigger>
                </div>
            </div>
        </Slab>
    );
}

/** In the weather's place on the scoreboard when an upcoming match has none yet, and why. */
export function WeatherStripNote({ children }: { children: React.ReactNode }) {
    return <div className="wx-strip wx-strip-note muted">{children}</div>;
}
