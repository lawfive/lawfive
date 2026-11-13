import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ApiError, type CalendarFeed, request } from "../api.ts";
import type { SettingsValues } from "../settings.ts";
import { Icon, Loading } from "../components/ui.tsx";
import { timeAgo } from "../format.ts";

// The calendar feed on the Settings page (CAL-1 to CAL-5): turn it on, add it to a calendar app
// (buttons for Apple, Google and Outlook, or copy the address), and make a new address or turn it
// off. The arrival time and reminder are settings, saved with the rest (Settings.tsx).

/** `children`, the feed's own times (Events start, Reminders), show only once it's on. */
export function CalendarFeedSettings({ children }: { children?: ReactNode }) {
    const client = useQueryClient();
    const [copied, setCopied] = useState(false);
    const feed = useQuery({
        queryKey: ["calendar"],
        queryFn: async () => {
            try {
                return await request<CalendarFeed>("GET", "/calendar");
            } catch (error) {
                if (error instanceof ApiError && error.status === 404) {
                    return null;
                }
                throw error;
            }
        },
    });
    const make = useMutation({
        mutationFn: () => request<CalendarFeed>("POST", "/calendar", {}),
        onSuccess: (made) => client.setQueryData(["calendar"], made),
    });
    const off = useMutation({
        mutationFn: () => request("DELETE", "/calendar"),
        onSuccess: () => client.setQueryData(["calendar"], null),
    });

    if (feed.isLoading) {
        return <div className="settings-row"><Loading inline /></div>;
    }
    const data = feed.data;
    if (!data) {
        return (
            <div className="list-row">
                <div className="avatar"><Icon name="calendar" size={18} /></div>
                <div className="grow">
                    <div className="title">Your matches in your calendar</div>
                    <div className="sub">Subscribe in Google, Apple or Outlook calendar: every match with its venue, crew and forecast, kept up to date as you change them here.</div>
                </div>
                <button className="btn btn-primary" disabled={make.isPending} onClick={() => make.mutate()}>Turn on</button>
            </div>
        );
    }

    const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(data.webcalUrl)}`;
    const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(data.url)}&name=${encodeURIComponent("LawFive matches")}`;
    const copy = async () => {
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <>
            <div className="calendar-feed">
                <div className="settings-label">Add your matches to a calendar app</div>
                <div className="settings-hint calendar-note">Each match shows the venue, your crew, the fee and the forecast, and changes you make here follow.</div>
                <div className="calendar-add">
                    <a className="btn btn-primary" href={data.webcalUrl}><Icon name="apple" />Apple Calendar</a>
                    <a className="btn" href={google} target="_blank" rel="noreferrer"><Icon name="google" />Google Calendar</a>
                    <a className="btn" href={outlook} target="_blank" rel="noreferrer"><Icon name="outlook" />Outlook</a>
                </div>
                <div className="key-reveal calendar-url">
                    <code className="code-text">{data.url}</code>
                    <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}</button>
                </div>
                <p className="settings-hint calendar-note">
                    {data.lastFetchedAt ? `A calendar app last checked it ${timeAgo(data.lastFetchedAt)}.` : "No calendar app has used it yet."}
                    {" "}Calendar apps check for changes every hour or so; Google Calendar can take up to a day. Keep the address private: anyone with it can see your matches.
                </p>
                <div className="calendar-manage">
                    <button className="btn" disabled={make.isPending}
                        onClick={() => confirm("Make a new address? The current one stops working, so calendars subscribed to it stop updating until you add the new one.") && make.mutate()}>
                        New address
                    </button>
                    <button className="btn" disabled={off.isPending}
                        onClick={() => confirm("Turn the calendar feed off? Calendars subscribed to it stop updating.") && off.mutate()}>
                        Turn off
                    </button>
                </div>
            </div>
            {children}
        </>
    );
}

/** "45 min", "1 hour", "1 h 15 min": a time before kickoff, short. */
function beforeText(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h === 0 ? `${m} min` : m === 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : `${h} h ${m} min`;
}

/** CAL-3: every 15 minutes up to 3 hours before kickoff. */
const steps = Array.from({ length: 12 }, (_, i) => (i + 1) * 15);
export const arriveOptions: [number, string][] = [[0, "At kickoff"], ...steps.map((m): [number, string] => [m, `${beforeText(m)} before`])];

/**
 * CAL-3: the reminders before a match: any of the 15-minute steps, and the day before and the day
 * of at times of the user's choosing. An account from before keeps its one reminder until changed.
 */
export function CalendarReminders({ settings, onChange }: { settings: SettingsValues; onChange: (patch: Partial<SettingsValues>) => void }) {
    const several = settings.calendarReminders !== undefined || settings.calendarDayBefore !== undefined || settings.calendarDayOf !== undefined;
    const legacy = settings.calendarReminderMin ?? 60;
    const chosen = several ? settings.calendarReminders ?? [] : steps.includes(legacy) ? [legacy] : [];
    const dayBefore = several ? settings.calendarDayBefore : legacy === 1440 ? "19:00" : undefined;
    const dayOf = several ? settings.calendarDayOf : undefined;
    // Every change writes all three, so the old single reminder stops applying.
    const save = (patch: { reminders?: number[]; dayBefore?: string | null; dayOf?: string | null }) => onChange({
        calendarReminders: [...(patch.reminders ?? chosen)].sort((a, b) => b - a),
        calendarDayBefore: patch.dayBefore === undefined ? dayBefore : patch.dayBefore ?? undefined,
        calendarDayOf: patch.dayOf === undefined ? dayOf : patch.dayOf ?? undefined,
    });
    const left = steps.filter((m) => !chosen.includes(m));
    return (
        <div className="reminders">
            <div className="reminder-chips">
                {[...chosen].sort((a, b) => b - a).map((m) => (
                    <span key={m} className="chip">
                        {beforeText(m)} before
                        <button type="button" aria-label={`Remove the reminder ${beforeText(m)} before`} onClick={() => save({ reminders: chosen.filter((x) => x !== m) })}><Icon name="close" size={12} /></button>
                    </span>
                ))}
                {left.length > 0 && (
                    <select className="input reminder-add" aria-label="Add a reminder" value="" onChange={(e) => e.target.value && save({ reminders: [...chosen, Number(e.target.value)] })}>
                        <option value="">{chosen.length ? "Add another…" : "Add a reminder…"}</option>
                        {left.map((m) => <option key={m} value={m}>{beforeText(m)} before</option>)}
                    </select>
                )}
            </div>
            {/* Two rows on one grid, so their checkboxes and times line up. */}
            <div className="day-reminders">
                <DayReminder label="The day before, at" value={dayBefore} fallback="19:00" onChange={(v) => save({ dayBefore: v })} />
                <DayReminder label="The day of, at" value={dayOf} fallback="08:00" onChange={(v) => save({ dayOf: v })} />
            </div>
        </div>
    );
}

function DayReminder({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (value: string | null) => void }) {
    return (
        <div className="day-reminder">
            <label className="toggle"><input type="checkbox" checked={value !== undefined} onChange={(e) => onChange(e.target.checked ? fallback : null)} />{label}</label>
            {/* Always there, so turning it on doesn't move the row; greyed out while off. */}
            <input className="input day-time" type="time" aria-label={label} value={value ?? fallback} disabled={value === undefined}
                onChange={(e) => e.target.value && onChange(e.target.value)} />
        </div>
    );
}
