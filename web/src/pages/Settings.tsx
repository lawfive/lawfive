import { allLimits, limitValue, planEnd, sizeOf } from "../plans.ts";
import { HttpsRow } from "../components/HttpsNotice.tsx";
import { type MatchFormat, defaultFormat, defaultSprintKph, speedBandsFor, starterFormats } from "@lawfive/schema";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { type Role, type UserSettings, useAccount, useAccountPlan, useList, useMeta, useSignOut } from "../api.ts";
import { Picker } from "../components/Picker.tsx";
import { ScreenPreview, screenWords } from "./MatchScreenSetup.tsx";
import { screenSetup } from "@lawfive/schema";
import { Icon, PageHead, helpUrl, isHostedService } from "../components/ui.tsx";
import { DataRows, YouRows } from "./AccountSettings.tsx";
import { ApiKeys } from "./ApiKeys.tsx";
import { AssignorCalendars } from "./AssignorCalendars.tsx";
import { Webhooks } from "./Webhooks.tsx";
import { CalendarFeedSettings, CalendarReminders, arriveOptions } from "./Calendar.tsx";
import { Devices, useWatchLinked } from "./Devices.tsx";
import { describeFormat, roleNamesInFull, roleOrder } from "../format.ts";
import { usualFormatChoice } from "../newMatch.ts";
import { type SettingsValues, saveSettings, useSettings } from "../settings.ts";

// Settings, in groups (WEB-33), with an index:
// You (name USR-10, email USR-9, password, time zone PLAN-9, where you're signed in); Your watch
// (linked watches, the match screen UI-27, team swipes INP-10); Match day (the calendar feed CAL-1 to
// CAL-5, directions WEB-14); New matches (usual role and format SET-17, misconduct codes); Units and
// money; Fitness (maximum heart rate TRK-4, sprint speed TRK-11); Your games coming in
// (assignor calendars FEED-1); Your data (download, restore, the plan's use PLAN-6, deleting the
// account USR-7); For developers, folded (API keys, webhooks, their limits); About; Server (admins).
// Settings save as they change.

const schemes = [
    { id: "ifab", name: "Laws of the Game", sample: "UB, DT, SFP, DOGSO-H…" },
    { id: "ussf", name: "United States", sample: "UB, DT, ERL, SFP, DGH…" },
    { id: "fa", name: "England", sample: "C1–C7, S1–S7" },
];

/** The developer limits, under For developers; the rest of the plan's under Your data. */
const developerLimits = new Set(["apiKeys", "apiCallsPerMinute", "apiCallsPerDay", "webhooks"]);

/** lawfive.dev's API pages: keys, webhooks, the reference. */
const apiDocsUrl = "https://lawfive.dev/api/overview/";

function currencies() {
    const names = new Intl.DisplayNames(undefined, { type: "currency" });
    return Intl.supportedValuesOf("currency").map((code) => ({ id: code, name: `${code} · ${names.of(code) ?? code}` }));
}

/** The groups in order, for the index; the ones a person doesn't have (assignor calendars, Server) left out. */
function groupsFor({ admin, feeds }: { admin: boolean; feeds: boolean }) {
    return [
        { id: "you", title: "You" },
        { id: "watch", title: "Your watch" },
        { id: "match-day", title: "Match day" },
        { id: "new-matches", title: "New matches" },
        { id: "units", title: "Units and money" },
        { id: "fitness", title: "Fitness" },
        ...(feeds ? [{ id: "assignor-calendars", title: "Your games coming in" }] : []),
        { id: "data", title: "Your data" },
        { id: "developers", title: "For developers" },
        { id: "about", title: "About" },
        ...(admin ? [{ id: "server", title: "Server" }] : []),
    ];
}

export function Settings() {
    const { settings, record } = useSettings();
    const client = useQueryClient();
    const signOut = useSignOut();
    const [status, setStatus] = useState<"saved" | "saving" | "error">();
    const [currencyList] = useState(currencies);
    const [makingKey, setMakingKey] = useState(false);
    const [makingHook, setMakingHook] = useState(false);
    const { hash, state } = useLocation();
    // Get ready's Connect a calendar (WEB-32) opens Add calendar straight away.
    const [addingCalendar, setAddingCalendar] = useState(() => (state as { addCalendar?: boolean } | null)?.addCalendar === true);
    const account = useAccount();
    const meta = useMeta();
    const admin = account.data?.admin ?? false;
    const assignorCalendars = meta.data?.capabilities.includes("assignor-calendars") ?? false;
    const groups = groupsFor({ admin, feeds: assignorCalendars });
    // For developers is folded until it's opened, or linked to.
    const [developers, setDevelopers] = useState(() => hash === "#developers");
    // A link to one group (#units, #assignor-calendars) lands on it once what's above it has loaded.
    const laidOut = meta.isSuccess && account.isSuccess;
    useEffect(() => {
        if (hash === "#developers") {
            setDevelopers(true);
        }
        if (hash && laidOut) {
            document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
        }
    }, [hash, laidOut]);
    // One Link a watch: the "No watch linked yet" row's until there's one, then the group's.
    const watchLinked = useWatchLinked();

    /** Saves one change on top of the latest saved settings; changes made quickly queue up. */
    const change = (patch: Partial<SettingsValues>) => {
        setStatus("saving");
        void saveSettings(client, patch).then(async (saved) => {
            setStatus(saved ? "saved" : "error");
            if (saved && ("maxHeartRate" in patch || "sprintKph" in patch)) {
                // Heart-rate zones and speed bands are worked out from them (TRK-4, TRK-11).
                await Promise.all([client.invalidateQueries({ queryKey: ["track"] }), client.invalidateQueries({ queryKey: ["stats"] })]);
            }
        });
    };

    return (
        <>
            <PageHead title="Settings" hero sub={status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save; try again" : "Changes are saved as you make them."} />

            <div className="settings-layout">
                <SettingsIndex groups={groups} />
                <div className="settings-groups">
                    <SettingsGroup title="You" id="you" action={<button className="btn" onClick={() => signOut.mutate()}><Icon name="out" />Sign out</button>}>
                        <YouRows />
                        <SettingsRow label="Time zone" hint="For games from your assignor's calendar that don't say their time zone, and when a plan ends (at midnight here). Each match keeps its own.">
                            <TimeZoneChoice value={settings.timeZone} onChange={(timeZone) => change({ timeZone })} />
                        </SettingsRow>
                        <div className="settings-subhead">Where you're signed in</div>
                        <Devices show="others" />
                    </SettingsGroup>

                    <SettingsGroup title="Your watch" id="watch" action={watchLinked && <Link to="/link" className="btn"><Icon name="plus" />Link a watch</Link>}>
                        <Devices show="watches" />
                        <SettingsRow label="Match screen" hint="What your watches show while a match runs. Try it here first, as if on your wrist.">
                            <div className="row settings-buttons">
                                <Link to="/try" className="btn"><Icon name="play" />Try a match</Link>
                                <Link to="/settings/match-screen" className="btn"><Icon name="watch" />Change</Link>
                            </div>
                        </SettingsRow>
                        <MatchScreenSummary settings={settings} />
                        <SettingsRow label="Team swipes" hint="On Garmin and Apple watches, how a swipe opens a team's controls: down for home and up for away, or right for home and left for away. Wear OS watches always swipe sideways.">
                            <Segmented value={settings.teamSwipes ?? "upDown"} onChange={(teamSwipes) => change({ teamSwipes })} options={[["upDown", "Up and down"], ["sideways", "Sideways"]]} />
                        </SettingsRow>
                    </SettingsGroup>

                    <SettingsGroup title="Match day" id="match-day">
                        {/* CAL-3: the feed's own start time, once there's a feed to have it. */}
                        <CalendarFeedSettings>
                            <SettingsRow label="Events start" hint="When your calendar shows you as busy from, for travel and warming up. The description gives the kickoff.">
                                <MinutesSelect label="Events start" value={settings.calendarArriveMin ?? 30} options={arriveOptions} onChange={(calendarArriveMin) => change({ calendarArriveMin })} />
                            </SettingsRow>
                        </CalendarFeedSettings>
                        {/* CAL-3, APP-6: the account's reminders, for the phones and the calendar feed alike, so shown with or without a feed. */}
                        <SettingsRow label="Match reminders" hint="For matches still to come: as many as you like before kickoff, and the day before and the day of at times you choose (in the match's time zone). The LawFive phone apps remind you at these times on each phone where Remind me of matches is on, and your calendar feed's events carry them. Google Calendar uses its own notification settings for calendars you subscribe to.">
                            <CalendarReminders settings={settings} onChange={change} />
                        </SettingsRow>
                        <SettingsRow label="Directions open in" hint="On the website, the Android app and the iPhone app. Automatic is Apple Maps in the iPhone app and Google Maps everywhere else.">
                            <Segmented value={settings.mapsApp ?? "auto"} onChange={(mapsApp) => change({ mapsApp })} options={[["auto", "Automatic"], ["google", "Google"], ["apple", "Apple"]]} />
                        </SettingsRow>
                    </SettingsGroup>

                    <SettingsGroup title="New matches" id="new-matches">
                        <SettingsRow label="Usual role" hint="Your role on a new match. Change it on the match when it's different.">
                            <Segmented value={settings.usualRole ?? "referee"} onChange={(usualRole: Role) => change({ usualRole })}
                                options={roleOrder.map((r) => [r, roleNamesInFull[r]] as [Role, string])} />
                        </SettingsRow>
                        <UsualFormat settings={settings} onChange={(usualFormat) => change({ usualFormat })} />
                        <SettingsRow label="Misconduct codes" hint="The codes for cautions and send-offs. A competition can use a different set.">
                            <div className="scheme-list">
                                {schemes.map((s) => (
                                    <label key={s.id} className={`scheme${settings.misconductScheme === s.id ? " on" : ""}`}>
                                        <input type="radio" name="scheme" checked={settings.misconductScheme === s.id} onChange={() => change({ misconductScheme: s.id })} />
                                        <span><strong>{s.name}</strong><small>{s.sample}</small></span>
                                    </label>
                                ))}
                            </div>
                        </SettingsRow>
                    </SettingsGroup>

                    <SettingsGroup title="Units and money" id="units">
                        <SettingsRow label="Distance" hint="The distance you cover in matches; also rain (inches with miles) and wind.">
                            <Segmented value={settings.distanceUnit} onChange={(distanceUnit) => change({ distanceUnit })} options={[["km", "Kilometers"], ["mi", "Miles"]]} />
                        </SettingsRow>
                        <SettingsRow label="Temperature" hint="Match-day forecasts.">
                            <Segmented value={settings.temperatureUnit} onChange={(temperatureUnit) => change({ temperatureUnit })} options={[["c", "°C"], ["f", "°F"]]} />
                        </SettingsRow>
                        <SettingsRow label="Currency" hint="For new match fees. Each fee keeps its own currency.">
                            <div className="settings-picker">
                                <Picker label="Currency" value={settings.currency} items={currencyList} clearable={false} onChange={(currency) => currency && change({ currency })} />
                            </div>
                        </SettingsRow>
                        {/* Get ready's "Your units and time zone" lands here: the zone itself is under You. */}
                        <a href="#you" className="settings-row settings-link">
                            <div>
                                <div className="settings-label">Time zone</div>
                                <div className="settings-hint">{(settings.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone).replaceAll("_", " ")}, under You.</div>
                            </div>
                            <Icon name="back" size={16} />
                        </a>
                    </SettingsGroup>

                    <SettingsGroup title="Fitness" id="fitness">
                        <SettingsRow label="Maximum heart rate" hint="For the heart-rate zones on match pages. Your highest reading from a hard effort is best; 220 minus your age is a rough guide.">
                            <MaxHeartRate value={settings.maxHeartRate} onChange={(maxHeartRate) => change({ maxHeartRate })} />
                        </SettingsRow>
                        <SettingsRow label="Sprint speed" hint="Where sprinting starts in your match figures and Stats. The other speed bands move with it.">
                            <SprintSpeed value={settings.sprintKph} unit={settings.distanceUnit} onChange={(sprintKph) => change({ sprintKph })} />
                        </SettingsRow>
                    </SettingsGroup>

                    {assignorCalendars && (
                        <SettingsGroup title="Your games coming in" id="assignor-calendars" action={<button className="btn" onClick={() => setAddingCalendar(true)}><Icon name="plus" />Add calendar</button>}>
                            <AssignorCalendars adding={addingCalendar} onDone={() => setAddingCalendar(false)} />
                        </SettingsGroup>
                    )}

                    <SettingsGroup title="Your data" id="data">
                        <DataRows><PlanRows admin={admin} developer={false} /></DataRows>
                    </SettingsGroup>

                    <SettingsGroup title="For developers" id="developers"
                        action={<button className="btn" aria-expanded={developers} aria-controls="developer-tools" onClick={() => setDevelopers(!developers)}><span className={`disclose${developers ? " open" : ""}`}><Icon name="chevron" /></span>{developers ? "Hide" : "Show"}</button>}>
                        <div className="settings-row">
                            <div>
                                <div className="settings-label">API keys and webhooks</div>
                                <div className="settings-hint">For a script or another app to read and change your matches, or hear about changes as they happen. <a className="link" href={apiDocsUrl} target="_blank" rel="noreferrer">How LawFive's API works</a></div>
                                {/* Q-19: what an integration may send, as the terms' Acceptable use says. */}
                                <div className="settings-hint">Nothing that identifies anyone under 16 (names, photos, contact details); team names, age groups and shirt numbers are fine. <a className="link" href="https://lawfive.app/terms.html#minors" target="_blank" rel="noreferrer">The terms</a></div>
                            </div>
                        </div>
                        {developers && (
                            <div id="developer-tools">
                                <div className="settings-subhead">
                                    <span>API keys</span>
                                    <button className="btn btn-sm" onClick={() => setMakingKey(true)}><Icon name="plus" size={16} />New key</button>
                                </div>
                                <ApiKeys making={makingKey} onDone={() => setMakingKey(false)} />
                                <div className="settings-subhead">
                                    <span>Webhooks</span>
                                    <button className="btn btn-sm" onClick={() => setMakingHook(true)}><Icon name="plus" size={16} />New webhook</button>
                                </div>
                                <Webhooks making={makingHook} onDone={() => setMakingHook(false)} />
                                <PlanRows admin={admin} developer />
                            </div>
                        )}
                    </SettingsGroup>

                    <SettingsGroup title="About" id="about">
                        <Version />
                        <HelpRow />
                        {isHostedService() && (
                            <a href="https://lawfive.app/privacy.html" target="_blank" rel="noreferrer" className="settings-row settings-link">
                                <div>
                                    <div className="settings-label">Privacy and terms</div>
                                    <div className="settings-hint">What the hosted service keeps, and the terms for using it.</div>
                                </div>
                                <Icon name="back" size={16} />
                            </a>
                        )}
                        <Link to="/settings/licenses" className="settings-row settings-link">
                            <div>
                                <div className="settings-label">Data and licenses</div>
                                <div className="settings-hint">Weather, maps and address search: where they come from, and the software LawFive is built with.</div>
                            </div>
                            <Icon name="back" size={16} />
                        </Link>
                    </SettingsGroup>

                    {admin && (
                        <SettingsGroup title="Server" id="server">
                            <Link to="/settings/server" className="settings-row settings-link">
                                <div>
                                    <div className="settings-label">Server settings</div>
                                    <div className="settings-hint">Email, maps, address search, weather, plans and webhooks, for everyone on this server.</div>
                                </div>
                                <Icon name="back" size={16} />
                            </Link>
                            <HttpsRow />
                        </SettingsGroup>
                    )}
                </div>
            </div>
        </>
    );
}

/**
 * The index of Settings' groups: sticky on the left on wide screens, chips at the top on phones.
 * The group being read is marked as the page scrolls.
 */
function SettingsIndex({ groups }: { groups: { id: string; title: string }[] }) {
    const [current, setCurrent] = useState(groups[0]?.id);
    const ids = groups.map((g) => g.id).join(" ");
    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            // The last group whose heading has reached the top quarter of the window.
            const line = window.innerHeight * 0.25;
            let at = ids.split(" ")[0];
            for (const id of ids.split(" ")) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= line) {
                    at = id;
                }
            }
            // At the foot of the page, the last group, however short.
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                at = ids.split(" ").at(-1) ?? at;
            }
            setCurrent(at);
        };
        const onScroll = () => {
            if (!frame) {
                frame = requestAnimationFrame(update);
            }
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
            cancelAnimationFrame(frame);
        };
    }, [ids]);
    return (
        <nav className="settings-index" aria-label="Settings">
            <ol>
                {groups.map((g) => (
                    <li key={g.id}>
                        <a href={`#${g.id}`} aria-current={current === g.id ? "location" : undefined}>{g.title}</a>
                    </li>
                ))}
            </ol>
        </nav>
    );
}

/** SET-17: the format new matches start with: the last saved on a match form, or chosen here from the starters or the templates. */
function UsualFormat({ settings, onChange }: { settings: SettingsValues; onChange: (usual: NonNullable<UserSettings["usualFormat"]>) => void }) {
    const templates = useList("match-templates").data ?? [];
    const usual = settings.usualFormat;
    const choice = usualFormatChoice(usual, templates);
    const items = [
        ...(choice.id === "last" ? [{ id: "last", name: choice.name, detail: describeFormat(usual!.format) }] : []),
        ...starterFormats.map((s) => ({ id: `starter:${s.id}`, name: s.name, detail: describeFormat(s.format) })),
        ...templates.map((t) => ({ id: `template:${t.id}`, name: t.name, detail: `Your template · ${describeFormat(t.format)}` })),
    ];
    const pick = (id: string | undefined) => {
        if (!id || id === choice.id) {
            return;
        }
        const starter = starterFormats.find((s) => `starter:${s.id}` === id);
        const template = templates.find((t) => `template:${t.id}` === id);
        const format: MatchFormat | undefined = starter?.format ?? template?.format;
        if (format) {
            onChange({ format, ...(starter ? { starterId: starter.id } : {}), ...(template ? { templateId: template.id } : {}), changedAt: new Date().toISOString() });
        }
    };
    return (
        <SettingsRow label="Usual format" hint={`${usual ? describeFormat(usual.format) : `Not chosen yet: ${describeFormat(defaultFormat)}, 11 a side`}. A new match starts with it, unless its competition has a template; saving a new match makes its format the usual one.`}>
            <div className="settings-picker">
                <Picker label="Usual format" value={choice.id === "none" ? undefined : choice.id} items={items} clearable={false} onChange={pick} placeholder="Choose a format…" />
            </div>
        </SettingsRow>
    );
}

/** UI-24, UI-27: the account's match screen, for all its watches, in pictures and words; Change opens the setup. */
function MatchScreenSummary({ settings }: { settings: SettingsValues }) {
    const setup = screenSetup(settings.watchScreen);
    return (
        <div className="settings-row screen-summary">
            <ScreenPreview setup={setup} compact />
            <dl className="screen-review">
                {screenWords(setup).map((w) => (
                    <div key={w.label}><dt>{w.label}</dt><dd>{w.value}</dd></div>
                ))}
            </dl>
        </div>
    );
}

/** WEB-29: lawfive.app's support page, with its common questions and how to write in. */
function HelpRow() {
    return (
        <a href={helpUrl} target="_blank" rel="noreferrer" className="settings-row settings-link">
            <div>
                <div className="settings-label">Help</div>
                <div className="settings-hint">Questions, and how to reach us.</div>
            </div>
            <Icon name="back" size={16} />
        </a>
    );
}

/** VER-2: the server's version, which is the web app's too (the server serves this build of it). */
function Version() {
    const meta = useMeta().data;
    return (
        <div className="settings-row">
            <div>
                <div className="settings-label">Version</div>
                <div className="settings-hint">The server and this web app, built together. Watches show theirs under Your watch, phones under You.</div>
            </div>
            <div className="settings-control">
                {meta?.version ? <>LawFive {meta.version}{meta.commit && meta.commit !== "unknown" && <> <code>{meta.commit}</code></>}</> : "Version unknown"}
            </div>
        </div>
    );
}

export function SettingsGroup({ title, action, id, children }: { title: string; action?: ReactNode; id?: string; children: ReactNode }) {
    return (
        <section className="settings-group" id={id}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                <h3>{title}</h3>
                {action}
            </div>
            <div className="card">{children}</div>
        </section>
    );
}

/** Saved when it's left or Enter is pressed, and only when it's empty or 100 to 240 (TRK-4). */
function MaxHeartRate({ value, onChange }: { value: number | undefined; onChange: (value: number | undefined) => void }) {
    const [draft, setDraft] = useState(value === undefined ? "" : String(value));
    const [seen, setSeen] = useState(value);
    if (value !== seen) {
        // Saved elsewhere, or the settings just loaded.
        setSeen(value);
        setDraft(value === undefined ? "" : String(value));
    }
    const number = draft.trim() === "" ? undefined : Number(draft);
    const valid = number === undefined || (Number.isInteger(number) && number >= 100 && number <= 240);
    const commit = () => valid && number !== value && onChange(number);
    return (
        <div className="max-hr">
            <input className="input" type="number" inputMode="numeric" min={100} max={240} placeholder="Not set" aria-label="Maximum heart rate"
                value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
            <span className="muted">bpm</span>
            {!valid && <div className="error max-hr-error">Between 100 and 240</div>}
        </div>
    );
}

/** In the user's unit; saved in km/h when it's left or Enter is pressed, and only from 15 to 35 km/h. Empty is the default (TRK-11). */
function SprintSpeed({ value, unit, onChange }: { value: number | undefined; unit: "km" | "mi"; onChange: (value: number | undefined) => void }) {
    const perKph = unit === "mi" ? 1 / 1.609344 : 1;
    const label = unit === "mi" ? "mph" : "km/h";
    const shown = (kph: number) => String(Math.round(kph * perKph * 10) / 10);
    const [draft, setDraft] = useState(value === undefined ? "" : shown(value));
    const [seen, setSeen] = useState(`${value}:${unit}`);
    if (`${value}:${unit}` !== seen) {
        // Saved elsewhere, the settings just loaded, or the unit changed.
        setSeen(`${value}:${unit}`);
        setDraft(value === undefined ? "" : shown(value));
    }
    const number = draft.trim() === "" ? undefined : Number(draft.replace(",", "."));
    const kph = number === undefined ? undefined : Math.round((number / perKph) * 10) / 10;
    const valid = kph === undefined || (Number.isFinite(kph) && kph >= 15 && kph <= 35);
    const commit = () => valid && kph !== value && onChange(kph);
    const bands = speedBandsFor(valid && kph !== undefined ? kph : defaultSprintKph);
    const at = (band: string) => Math.round(bands.find((b) => b.band === band)!.fromKph * perKph);
    return (
        <div className="max-hr sprint-speed">
            <input className="input" type="number" inputMode="decimal" step={0.5} placeholder={shown(defaultSprintKph)} aria-label="Sprint speed"
                value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
            <span className="muted">{label}</span>
            {valid
                ? <div className="sprint-bands muted">Jogging from {at("jogging")}, running {at("running")}, high speed {at("highSpeed")}, sprinting {at("sprinting")} {label}</div>
                : <div className="error max-hr-error">Between {shown(15)} and {shown(35)} {label}</div>}
        </div>
    );
}

export function SettingsRow({ label, hint, children }: { label: string; hint?: ReactNode; children?: ReactNode }) {
    return (
        <div className="settings-row">
            <div>
                <div className="settings-label">{label}</div>
                {hint && <div className="settings-hint">{hint}</div>}
            </div>
            {children && <div className="settings-control">{children}</div>}
        </div>
    );
}

function MinutesSelect({ label, value, options, onChange }: { label: string; value: number; options: [number, string][]; onChange: (value: number) => void }) {
    // A value set elsewhere that isn't one of the choices still shows.
    const all = options.some(([v]) => v === value) ? options : [...options, [value, `${value} min before`] as [number, string]].sort((a, b) => a[0] - b[0]);
    return (
        <select className="input minutes-select" aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {all.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
    );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: [T, string][] }) {
    return (
        <div className="segmented" role="radiogroup">
            {options.map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => value !== v && onChange(v)}>{label}</button>
            ))}
        </div>
    );
}

/**
 * PLAN-6: the account's plan and how much of each of its limits is used (SEC-6's storage among them):
 * under Your data, the plan and what it keeps; under For developers, the API's and webhooks' limits.
 */
function PlanRows({ admin, developer }: { admin: boolean; developer: boolean }) {
    const plan = useAccountPlan();
    if (!plan.data) {
        return null;
    }
    const { limits, usage } = plan.data;
    const ends = planEnd(plan.data);
    // The limits the plan sets, and storage always, as it's what fills up.
    const shown = allLimits.filter((l) => developerLimits.has(l.key) === developer && (limits[l.key] !== undefined || l.key === "storageMb"));
    if (developer && shown.length === 0) {
        return null;
    }
    return (
        <div className="settings-plan">
            {developer ? <div className="settings-subhead"><span>Your plan's limits</span></div> : (
                <SettingsRow label={`Plan: ${plan.data.plan.name}`}
                    hint={ends ? `${ends[0].toUpperCase()}${ends.slice(1)}. Nothing in your account is lost then; only adding more over its limits stops.` : admin ? "What your account can use on this server. Change it on People, or the plans themselves in Plans." : "What your account can use on this server. Ask an admin of this server to change it."}>
                    {admin ? <Link to="/settings/server/plans" className="btn"><Icon name="plan" />Plans</Link> : null}
                </SettingsRow>
            )}
            <div className="plan-usage">
                {shown.map((info) => {
                    const allowed = limits[info.key];
                    const used = info.usage !== undefined ? usage[info.usage] : undefined;
                    const share = allowed && used !== undefined ? Math.min(1, used / allowed) : undefined;
                    return (
                        <div key={info.key} className="plan-usage-item">
                            <div className="plan-usage-label">{info.usageLabel ?? info.label}</div>
                            <div className="plan-usage-figure">
                                {used !== undefined
                                    ? <>{info.unit ? sizeOf(used) : used.toLocaleString()}{allowed !== undefined && <span className="muted"> of {limitValue(info, allowed)}</span>}</>
                                    : <><span className="muted">at most </span>{limitValue(info, allowed)}</>}
                            </div>
                            {share !== undefined && <div className={`plan-meter${share >= 1 ? " full" : share >= 0.8 ? " near" : ""}`}><span style={{ width: `${share * 100}%` }} /></div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** PLAN-9: the account's time zone, from any of them, with this browser's offered when it differs. */
function TimeZoneChoice({ value, onChange }: { value: string | undefined; onChange: (zone: string) => void }) {
    const [zones] = useState(() => Intl.supportedValuesOf("timeZone").map((z) => ({ id: z, name: z.replaceAll("_", " ") })));
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (
        <div className="time-zone">
            <div style={{ width: 280, maxWidth: "100%" }}>
                <Picker label="Time zone" value={value ?? here} items={zones} clearable={false} onChange={(zone) => zone && onChange(zone)} />
            </div>
            {value && value !== here && <button type="button" className="btn btn-ghost" onClick={() => onChange(here)}>Use this device's ({here.replaceAll("_", " ")})</button>}
        </div>
    );
}
