import { shortName, suggestAliases, teamColours } from "@lawfive/schema";
import type { Gender, Match, MatchFormat, Role, Team } from "./api.ts";

// Display helpers: dates, durations, team names and colours, the same way the watch shows them.

/** "5.9 MB", "120 MB", "1.5 GB"; whole under 10 MB when it is, so a limit reads "6 MB". */
export function storageSize(bytes: number): string {
    if (bytes >= 1024 ** 3) {
        return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    }
    const mb = bytes / 1024 ** 2;
    return `${mb >= 10 || Number.isInteger(mb) ? Math.ceil(mb) : mb.toFixed(1)} MB`;
}

/** As officials are shown: short, so a crew fits on a line (WEB-11). */
export const roleNames: Record<Role, string> = { referee: "Referee", ar1: "AR1", ar2: "AR2", fourth: "4th" };
/** As a form offers them, where there's room to spell it out. */
export const roleNamesInFull: Record<Role, string> = { ...roleNames, fourth: "4th official" };

/** The usual order, which Add an official also follows (WEB-11). */
export const roleOrder: Role[] = ["referee", "ar1", "ar2", "fourth"];

/**
 * A match's officials in the usual order, Referee, AR1, AR2, 4th, with the user in their
 * own place (when they have a role) rather than first.
 */
export function crewInOrder<C extends { role: Role }>(crew: C[], you: Role | undefined): ({ you: true; role: Role } | { you: false; role: Role; member: C })[] {
    const all = [
        ...(you ? [{ you: true as const, role: you }] : []),
        ...crew.map((member) => ({ you: false as const, role: member.role, member })),
    ];
    return all.map((o, i) => ({ o, i })).sort((a, b) => roleOrder.indexOf(a.o.role) - roleOrder.indexOf(b.o.role) || a.i - b.i).map(({ o }) => o);
}

/** The roles as one line of officials shows them (WEB-20). */
export const roleNamesShort: Record<Role, string> = { referee: "Ref", ar1: "AR1", ar2: "AR2", fourth: "4th" };

export interface LineOfficial { role: string; who: string; you: boolean }

const nameSuffixes = new Set(["jr", "sr", "ii", "iii", "iv"]);
const surnameParticles = new Set(["da", "das", "de", "del", "della", "den", "der", "di", "do", "dos", "du", "la", "le", "ten", "ter", "van", "von"]);
const isSuffix = (word: string) => nameSuffixes.has(word.toLowerCase().replace(/\.$/, ""));

/**
 * WEB-20: a referee's surname, guessed from their name as a schedule writes it: "Sam Rivera",
 * "Rivera, Sam", with a grade in brackets or after a dash, Jr. or III after it, or "de la" before it.
 * A name it can't make sense of comes back whole.
 */
export function surname(name: string): string {
    // A grade or level in brackets, or after a spaced dash or bar.
    const plain = name.replace(/\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?/g, " ").split(/\s[-–—|]\s/)[0];
    const parts = plain.split(",").map((p) => p.trim()).filter(Boolean);
    // "Rivera, Sam": the part before the comma, unless all that follows is a suffix ("Sam Rivera, Jr.").
    const listed = parts.length > 1 && !parts.slice(1).every(isSuffix);
    const words = (parts[0] ?? "").split(/\s+/).filter(Boolean);
    while (words.length > 1 && isSuffix(words.at(-1)!)) {
        words.pop();
    }
    let from = listed ? 0 : words.length - 1;
    while (from > 1 && surnameParticles.has(words[from - 1])) {
        from--;
    }
    return words.slice(Math.max(from, 0)).join(" ") || name.trim();
}

/**
 * WEB-20: the officials as one line reads them, in order: each role with "you", a saved referee's
 * short name or surname, or a name as typed (a club linesman isn't a surname).
 */
export function officialsLine(match: Pick<Match, "crew" | "role">, referees: Map<string, { name: string; shortName?: string }>): LineOfficial[] {
    return crewInOrder(match.crew, match.role).flatMap((o): LineOfficial[] => {
        if (o.you) {
            return [{ role: roleNamesShort[o.role], who: "you", you: true }];
        }
        const saved = o.member.refereeId ? referees.get(o.member.refereeId) : undefined;
        const who = saved ? saved.shortName?.trim() || surname(saved.name) : o.member.name;
        return who ? [{ role: roleNamesShort[o.role], who, you: false }] : [];
    });
}

export const genderNames: Record<Gender, string> = { male: "Male", female: "Female", coed: "Co-ed" };

/** "U12 · Female", or whichever of the two is set. */
export function describePlayers(match: Pick<Match, "ageGroup" | "gender">): string {
    return [match.ageGroup, match.gender && genderNames[match.gender]].filter(Boolean).join(" · ");
}

/** The watch's team colours (SET-14), in its order. */
export { teamColours };

/** WCAG relative luminance, as on the watch (Colors.luminance). */
function luminance(hex: string): number {
    const n = Number.parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 0xff, n & 0xff]
        .map((v) => v / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}

/** A team colour that would vanish against the page: "dark" (black kits, in dark mode) or "light" (white kits, in light mode). */
export function kitEdge(hex: string): "dark" | "light" | undefined {
    const l = luminance(hex);
    return l < 0.02 ? "dark" : l > 0.8 ? "light" : undefined;
}

/** UI-10: a team colour too dark to stand out from the watch's black screen (below 1.5:1), which gets a thin gray edge (the watch's Colors.needsOutline). */
export function darkOnWatch(hex: string): boolean {
    return (luminance(hex) + 0.05) / 0.05 < 1.5;
}

/** Black or white text, whichever contrasts more with the colour (as on the watch). */
export function textOn(hex: string): string {
    const l = luminance(hex);
    return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#FFFFFF";
}

/**
 * The short name a team shows, as on the watch (SET-5): the one typed, else one from both team
 * names (L84_Roach v L84_Smith: ROA, SMI), else HOM/AWY. schema's shortName, so the server's
 * watch download, Try a match and the phones give the same.
 */
export function teamAlias(teams: { home: Team; away: Team }, side: "home" | "away"): string {
    return shortName(teams, side);
}

/** SET-5: the suggestion for a pair of names, which the match form shows until one is typed. */
export { suggestAliases };

/** The colour's name in the watch's list, or "Custom". */
export function colourName(hex: string | undefined): string {
    if (!hex) {
        return "None";
    }
    return teamColours.find((c) => c.hex === hex.toUpperCase())?.name ?? "Custom";
}

export function teamName(team: Team, side: "home" | "away"): string {
    return team.name ?? (side === "home" ? "Home" : "Away");
}

type NamedOrTimed = { home: { name?: string }; away: { name?: string }; kickoff?: string };

/** No team name and no kickoff: nothing to tell the match by. */
export function isBlankMatch(m: NamedOrTimed): boolean {
    return !m.home.name?.trim() && !m.away.name?.trim() && !m.kickoff;
}

/**
 * WEB-30: a match needs a team name or a kickoff to be saved: a new one, and one that had either
 * (one saved blank before, as a watch's quick match can be, can still be edited as it is).
 */
export function needsNameOrKickoff(m: NamedOrTimed, saved?: NamedOrTimed): boolean {
    return isBlankMatch(m) && (!saved || !isBlankMatch(saved));
}

export const nameOrKickoffNeeded = "Add a team name or a kickoff time to save this match.";

/**
 * RES-8: what Delete match? says goes with it: its report, and its track when it has one (`track`
 * undefined: not known yet, or no signal on a phone). The same words on Android and the iPhone.
 */
export function deleteMatchMessage(report: boolean, track?: boolean): string {
    const goes = "It goes from LawFive, on every device";
    if (!report) {
        return `${goes}.`;
    }
    return `${goes}, with its report${track === true ? " and track" : track === false ? "" : " and any track"}.`;
}

export function matchTitle(match: Match): string {
    return `${teamName(match.home, "home")} v ${teamName(match.away, "away")}`;
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const shortDayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function formatDay(iso: string): string {
    const date = new Date(iso);
    const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
    if (days === 0) {
        return "Today";
    }
    if (days === 1) {
        return "Tomorrow";
    }
    if (days === -1) {
        return "Yesterday";
    }
    return dayFormat.format(date);
}

export const formatShortDay = (iso: string) => shortDayFormat.format(new Date(iso));

/** WEB-22: a match as its browser tab names it, "Rovers v Strikers · Sat, Nov 7": the same teams meet more than once. */
export function matchTabTitle(match: Match): string {
    return [match.name ?? matchTitle(match), match.kickoff && formatShortDay(match.kickoff)].filter(Boolean).join(" · ");
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(iso: string, now: number = Date.now()): string {
    const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
    if (minutes < 2) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
        return `${hours} h ago`;
    }
    const days = Math.round(hours / 24);
    return days < 14 ? `${days} ${days === 1 ? "day" : "days"} ago` : `on ${formatShortDay(iso)}`;
}
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** A moment near now, as a sentence carries it: "8:12 PM" today, "yesterday, 8:12 PM", "tomorrow, 8:12 PM", else "Sat, Nov 7, 8:12 PM". */
export function formatWhen(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    const days = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
    const time = formatTime(iso);
    return days === 0 ? time : days === -1 ? `yesterday, ${time}` : days === 1 ? `tomorrow, ${time}` : `${formatShortDay(iso)}, ${time}`;
}

/** The kickoff time in two parts, for a fixture board: "9:00" and "AM" (no second part on a 24-hour clock). */
export function timeParts(iso: string): [string, string | undefined] {
    const parts = timeFormat.formatToParts(new Date(iso));
    const period = parts.find((p) => p.type === "dayPeriod")?.value;
    return [parts.filter((p) => p.type !== "dayPeriod").map((p) => p.value).join("").trim(), period];
}

function startOfDay(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function minutes(sec: number): string {
    const m = sec / 60;
    return Number.isInteger(m) ? `${m}` : m.toFixed(1);
}

const suspensionReasons = { weather: "Weather", lightning: "Lightning", crowdTrouble: "Crowd trouble", other: "Other reason" } as const;

/** TMR-13: play suspended and resumed, "Suspended 34:12 · Lightning", without the length when it never resumed; as on the phones. */
export function suspensionWords(event: { reason: keyof typeof suspensionReasons; lengthSec?: number }): string {
    const length = event.lengthSec === undefined ? "" : ` ${Math.floor(event.lengthSec / 60)}:${String(event.lengthSec % 60).padStart(2, "0")}`;
    return `Suspended${length} · ${suspensionReasons[event.reason] ?? "Other reason"}`;
}

/** TMR-14: a clock corrected during play, "Clock adjusted +0:40" or "Added time adjusted −1:05", as on the phones. */
export function clockAdjustedWords(event: { clock: "match" | "added"; changeSec: number }): string {
    const change = Math.abs(event.changeSec);
    return `${event.clock === "added" ? "Added time" : "Clock"} adjusted ${event.changeSec < 0 ? "\u2212" : "+"}${Math.floor(change / 60)}:${String(change % 60).padStart(2, "0")}`;
}

/** EVT-12: a sin bin's length, "10 min", kept on one line, as the match page and the report give it. */
export function sinBinLength(lengthSec: number): string {
    return `${minutes(lengthSec)} min`;
}

/** "2 × 45 min, 15 min break" and the switches that are on; one period has no break but before extra time (SET-16). */
export function describeFormat(format: MatchFormat): string {
    const parts = [`${format.periods} × ${minutes(format.periodSec)} min`];
    if (format.periods > 1 || format.extraTime) {
        parts.push(`${minutes(format.breakSec)} min break`);
    }
    // TMR-15.
    if (format.stoppingClock) {
        parts.push("stopping clock");
    }
    if (format.extraTime) {
        parts.push(`ET ${format.extraTimePeriods} × ${minutes(format.extraTimePeriodSec)}${format.goldenGoal ? ", golden goal" : ""}`);
    }
    if (format.penalties) {
        parts.push("penalties");
    }
    if (format.halfwayBreak) {
        parts.push(`${minutes(format.halfwayBreakSec)} min halfway break`);
    }
    // EVT-12.
    if (format.sinBins) {
        parts.push(`${minutes(format.sinBinSec ?? 600)} min sin bins`);
    }
    return parts.join(" · ");
}

export function money(amount: number, currency: string): string {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

/**
 * Match minute as a referee would write it: 23', or 45+2' in added time. A clock that stops (TMR-15) has no added
 * time: it holds at the length, so an event there is in the length's minute.
 */
export function matchMinute(format: MatchFormat, period: number, periodSec: number): string {
    const regular = period <= format.periods;
    const length = regular ? format.periodSec : format.extraTimePeriodSec;
    const start = regular
        ? (period - 1) * format.periodSec
        : format.periods * format.periodSec + (period - format.periods - 1) * format.extraTimePeriodSec;
    const lengthMin = length / 60;
    const minute = format.stoppingClock ? Math.min(Math.floor(periodSec / 60) + 1, Math.ceil(lengthMin)) : Math.floor(periodSec / 60) + 1;
    return minute > lengthMin
        ? `${Math.round((start + length) / 60)}+${minute - lengthMin}'`
        : `${Math.round(start / 60) + minute}'`;
}

/**
 * Q-20: the format as the match was played, for naming and timing its periods: as many periods of
 * normal time as the watch recorded, when that differs from the plan (more than planned, or a whole
 * match of fewer). An abandoned match's missing periods leave the plan's. The server keeps a watch's
 * format on the match from then on; this covers a format edited after the match, and matches before.
 */
export function asPlayed(format: MatchFormat, record?: { outcome: string; periods: { extraTime: boolean }[] }): MatchFormat {
    const normal = record?.periods.filter((p) => !p.extraTime).length ?? 0;
    const differs = record?.outcome === "completed" ? normal !== format.periods : normal > format.periods;
    return normal >= 1 && normal <= 4 && differs ? { ...format, periods: normal } : format;
}

export function periodName(format: MatchFormat, period: number): string {
    if (period > format.periods) {
        return `Extra time ${period - format.periods}`;
    }
    if (format.periods === 2) {
        return period === 1 ? "First half" : "Second half";
    }
    // SET-16: a match of one period, beside "Extra time 1" when it has some.
    return format.periods === 1 ? "Regular time" : `Period ${period}`;
}

/** Where Directions open (Settings): automatic is Google Maps on the website. */
export type MapsApp = "auto" | "google" | "apple";

/** Directions to a place or an address (WEB-14), from where the user is, in their maps app. */
export function directionsUrl(to: { lat: number; lon: number } | string, app: MapsApp = "auto"): string {
    const at = typeof to === "string" ? encodeURIComponent(to) : `${to.lat},${to.lon}`;
    return app === "apple" ? `https://maps.apple.com/?daddr=${at}` : `https://www.google.com/maps/dir/?api=1&destination=${at}`;
}

/** "5.6 km" or "3.5 mi", in the user's unit (Settings). */
export function formatDistance(metres: number, unit: "km" | "mi"): string {
    return unit === "mi" ? `${(metres / 1609.344).toFixed(1)} mi` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * A pitch's length or width (TRK-9, WEB-24): whole metres, or whole yards where distances are in
 * miles, as pitches there are measured in yards: 105 m is "105 m" or "115 yd".
 */
export function formatPitchSize(metres: number, unit: "km" | "mi"): string {
    return unit === "mi" ? `${Math.round(metres / 0.9144)} yd` : `${Math.round(metres)} m`;
}

/** Like formatDistance, but metres or yards below half a kilometre or mile: "350 m", "120 yd". */
export function formatShortDistance(metres: number, unit: "km" | "mi"): string {
    if (unit === "mi") {
        return metres < 804.672 ? `${Math.round(metres / 0.9144)} yd` : formatDistance(metres, unit);
    }
    return metres < 500 ? `${Math.round(metres)} m` : formatDistance(metres, unit);
}

/** "18.4 km/h" or "11.4 mph", in the user's distance unit (Settings). */
export function formatSpeed(metresPerSecond: number, unit: "km" | "mi"): string {
    return unit === "mi" ? `${(metresPerSecond * 2.236936).toFixed(1)} mph` : `${(metresPerSecond * 3.6).toFixed(1)} km/h`;
}

/** "45 s" under a minute, then "12 min". */
export function formatDuration(sec: number): string {
    return sec < 59.5 ? `${Math.round(sec)} s` : `${Math.round(sec / 60)} min`;
}

/** "12°C" or "54°F", in the user's unit (Settings). */
export function formatTemperature(celsius: number, unit: "c" | "f"): string {
    return unit === "f" ? `${Math.round(celsius * 9 / 5 + 32)}°F` : `${Math.round(celsius)}°C`;
}

/**
 * Two letters for an avatar. Assignor exports write names like "84-Van Der Wal, Travis (REG)":
 * a region number in front, the surname first and a grade after, which should give TV, not 8D.
 */
export function initials(name: string): string {
    const plain = name.replace(/\(.*?\)/g, "").replace(/^[^\p{L}]+/u, "").trim();
    const [before, after] = plain.split(",").map((part) => part.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w)));
    const words = after?.length ? [after[0], before[0]] : before;
    const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words).map((w) => w.match(/\p{L}/u)?.[0] ?? "");
    return letters.join("").toUpperCase() || "?";
}

/** "Venu 2" from "Garmin Venu 2", as "On your Venu 2" reads; "Garmin watch" (a watch that didn't say which) stays. */
export function watchShortName(name: string): string {
    const short = name.replace(/^Garmin\s+/, "");
    return /^watch$/i.test(short) ? name : short;
}
