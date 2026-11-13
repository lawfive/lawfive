// Local dates and times in a time zone, without a library: the import (IMP-3), the calendar feed
// (CAL-3) and plans ending at the end of a day where the person is (PLAN-9).

/** The UTC offset of a time zone at a moment, in minutes ("America/Los_Angeles" in November: -480). */
function offsetMinutes(timeZone: string, at: number): number {
    const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}

/** A local date and time in a time zone, as an ISO timestamp with that zone's offset then. */
export function zonedTimestamp(date: string, time: string, timeZone: string): string {
    const [y, m, d] = date.split("-").map(Number);
    const [h, min] = time.split(":").map(Number);
    const wall = Date.UTC(y, m - 1, d, h, min);
    // The offset at the guess, then again at the moment it gives, which settles across a clock change.
    const offset = offsetMinutes(timeZone, wall - offsetMinutes(timeZone, wall) * 60_000);
    const sign = offset < 0 ? "-" : "+";
    const abs = Math.abs(offset);
    return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** A timestamp's local date and time in a time zone. */
export function wallTime(iso: string, timeZone: string): { date: string; time: string } {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
