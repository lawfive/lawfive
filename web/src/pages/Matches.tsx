import { Fragment, useEffect, useState } from "react";
import { Button, Dialog, DialogTrigger, Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";
import { Link, useSearchParams } from "react-router";
import { type Match, type MatchRecord, type Referee, type Team, type Venue, useList, useLookup, useSave } from "../api.ts";
import { DidYouKnow } from "../components/DidYouKnow.tsx";
import { CardShape, CountUp, Halfway, Icon, KitPanels, Loading, PageHead, Pitch, Tags, TeamBadge, useNow, FromLink, ContactButtons, lessMotion } from "../components/ui.tsx";
import { RiskBadges, WeatherBrief, WeatherIcon } from "../components/Weather.tsx";
import { conditionName } from "../weather.ts";
import { gameMatches, isGame } from "@lawfive/schema";
import { crewInOrder, describePlayers, officialsLine, directionsUrl, formatDistance, formatTemperature, matchTitle, money, roleNames, timeParts } from "../format.ts";
import { describeGames, gamesQueryFrom } from "../games.ts";
import { type Together, describeTogether, useWorkedTogether } from "../history.ts";
import { matchesSearch } from "../search.ts";
import { type SettingsValues, useSettings } from "../settings.ts";
import { type MatchWeather, useWeather } from "../weather.ts";
import { ImportMatches } from "./Import.tsx";
import { useWatchLinked } from "./Devices.tsx";
import { GetReady, useGetReady } from "../components/GetReady.tsx";
import { RefereeAvatar } from "../components/Photos.tsx";
import { downloadMatchesCsv, downloadMatchesXlsx } from "../matchSheet.ts";

// The match list: the next match with a countdown (WEB-2), then what's coming up (soonest first)
// and what's been played (latest first), each match as a team-sheet row (WEB-3): the two kits down
// its edge, the kickoff like a fixture board, the weather, its officials and the venue, and for a
// played match the score and the cards shown. A search covers most fields. From the Stats page it
// shows just the games behind a chart (STAT-11), with what they're narrowed to and a way back.

const listKey = "lawfive.matchList";

/**
 * A few of the matches at a venue or with a referee, for their pages: the next ones, then the
 * latest, as the Android app shows them, with a link to all of them in the match list.
 */
export function MatchesWith({ title, name, matches, none }: { title: string; name: string; matches: Match[]; none: string }) {
    const records = useList("match-records");
    const venues = useLookup("venues");
    const competitions = useLookup("competitions");
    const referees = useLookup("referees");
    const { settings } = useSettings();
    const upcomingWeather = useWeather("upcoming");
    const pastWeather = useWeather("past");
    const together = useWorkedTogether().referees;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const coming = (m: Match) => (m.status === "scheduled" || m.status === "postponed") && (!m.kickoff || new Date(m.kickoff) >= today);
    const shown = [
        ...matches.filter(coming).sort((a, b) => (a.kickoff ?? "9999").localeCompare(b.kickoff ?? "9999")),
        ...matches.filter((m) => !coming(m)).sort((a, b) => (b.kickoff ?? "").localeCompare(a.kickoff ?? "")),
    ].slice(0, 5);
    const recordFor = new Map((records.data ?? []).filter((r) => r.matchId).map((r) => [r.matchId!, r]));
    return (
        <section className="match-list-with">
            {/* WEB-24: named on the grass as the match list's own heads are, with how many in small capitals. */}
            <div className="list-head">
                <h2>{title}</h2>
                {matches.length > 0 && <span>{matches.length} {matches.length === 1 ? "match" : "matches"}</span>}
            </div>
            {shown.length === 0 && <p className="muted">{none}</p>}
            <div className="match-list">
            {shown.map((m, i) => (
                <MatchRow key={m.id} order={i} match={m} record={recordFor.get(m.id)} together={together} referees={referees} settings={settings}
                    weather={upcomingWeather.get(m.id) ?? pastWeather.get(m.id)}
                    venue={m.venueId ? venues.get(m.venueId) : undefined}
                    competition={m.competitionId ? competitions.get(m.competitionId)?.name : undefined} />
            ))}
            </div>
            {matches.length > shown.length && (
                <div className="list-more"><Link className="btn" to={`/matches?${matches.some((m) => !coming(m)) ? "show=past&" : ""}q=${encodeURIComponent(name)}`}>See all {matches.length}<Icon name="open" /></Link></div>
            )}
        </section>
    );
}

/** The match list as the user left it (tab, search, tag, Stats' narrowing), for the match page's back link. */
export function matchListLink(): string {
    try {
        return `/matches${sessionStorage.getItem(listKey) ?? ""}`;
    } catch {
        return "/matches";
    }
}

export function Matches() {
    const [params, setParams] = useSearchParams();
    const games = gamesQueryFrom(params);
    const tab = games || params.get("show") === "past" ? "past" : "upcoming";
    const query = params.get("q") ?? "";
    // "labelled", not "tag": that one narrows the list to Stats' games (games.ts).
    const tag = params.get("labelled") ?? undefined;
    const setTag = (t: string | undefined) => setParam("labelled", t);
    // Tags show under the search while it has focus (or one is chosen), not as a row of their own.
    const [searching, setSearching] = useState(false);
    useEffect(() => {
        try {
            sessionStorage.setItem(listKey, params.size ? `?${params}` : "");
        } catch {
            // Without storage, back goes to the upcoming list.
        }
    }, [params]);
    const [importing, setImporting] = useState(false);
    const matches = useList("matches");
    const records = useList("match-records");
    const venues = useLookup("venues");
    const competitions = useLookup("competitions");
    const referees = useLookup("referees");
    const templates = useLookup("match-templates");
    const { settings, record: settingsRecord } = useSettings();
    // WEB-27: the next match folded to a strip or open, kept with the account's settings; shown
    // straight away, then saved.
    const saveSettings = useSave("settings");
    const [nextFolded, setNextFolded] = useState<boolean>();
    const folded = nextFolded ?? settings.nextMatchCollapsed ?? false;
    const toggleNext = () => {
        setNextFolded(!folded);
        if (settingsRecord) {
            const { updatedAt: _u, deletedAt: _d, ...draft } = settingsRecord;
            saveSettings.mutate({ ...draft, nextMatchCollapsed: !folded });
        }
    };
    const ctx = { venues, competitions, referees };
    const weather = useWeather(tab);
    const pastWeather = useWeather("past");
    const together = useWorkedTogether().referees;
    // WEB-32: Get ready, until it's all done or hidden; it took the place of the watch and app prompts.
    const getReady = useGetReady();
    // WEB-17: the empty list promises the watch only once one is linked.
    const watchLinked = useWatchLinked();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isUpcoming = (m: Match) => (m.status === "scheduled" || m.status === "postponed") && (!m.kickoff || new Date(m.kickoff) >= today);
    const all = matches.data ?? [];
    const found = all.filter((m) => matchesSearch(m, ctx, query) && (!tag || m.tags?.includes(tag)) && (!games || gameMatches(m, games)));
    const shown = found
        .filter((m) => (tab === "upcoming" ? isUpcoming(m) : !isUpcoming(m)))
        .sort((a, b) => (tab === "upcoming" ? 1 : -1) * ((a.kickoff ?? "9999").localeCompare(b.kickoff ?? "9999")));
    const elsewhere = found.length - shown.length;
    // WEB-26: under the upcoming list, the last few played, then the way into all of them.
    const pastAll = all.filter((m) => !isUpcoming(m)).sort((a, b) => (b.kickoff ?? "").localeCompare(a.kickoff ?? ""));
    const recent = tab === "upcoming" && !query && !tag && !games ? pastAll.slice(0, 3) : [];
    const recordFor = new Map((records.data ?? []).filter((r) => r.matchId).map((r) => [r.matchId!, r]));
    const allTags = [...new Set(all.flatMap((m) => m.tags ?? []))].sort();

    const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
    const thisWeek = all.filter((m) => isUpcoming(m) && m.status === "scheduled" && m.kickoff && new Date(m.kickoff) < weekAhead).length;
    const unpaid = all.filter((m) => m.fee && !m.fee.paid && m.status !== "cancelled" && !isUpcoming(m));
    const unpaidTotal = unpaid.reduce((sum, m) => sum + (m.fee?.amount ?? 0), 0);
    // STAT-16: the same count as Stats' games: played or abandoned, with a kickoff.
    const playedCount = all.filter(isGame).length;
    const now = Date.now();
    const next = all
        .filter((m) => m.status === "scheduled" && m.kickoff && Date.parse(m.kickoff) >= now)
        .sort((a, b) => a.kickoff!.localeCompare(b.kickoff!))[0];
    const setParam = (key: string, value: string | undefined) => {
        const next = new URLSearchParams(params);
        if (value) {
            next.set(key, value);
        } else {
            next.delete(key);
        }
        setParams(next, { replace: key === "q" });
    };
    const showPast = () => {
        setParam("show", "past");
        document.querySelector(".list-tools")?.scrollIntoView({ block: "start", behavior: lessMotion() ? "auto" : "smooth" });
    };
    const otherTab = (
        <button className="link-button" onClick={() => setParam("show", tab === "upcoming" ? "past" : undefined)}>
            {elsewhere} in {tab === "upcoming" ? "past" : "upcoming"} matches
        </button>
    );

    return (
        <>
            <PageHead
                title="Matches"
                hero
                actions={<NewMatchButton onImport={() => setImporting(true)} exportCount={shown.length}
                    onExport={(kind) => {
                        const look = { ...ctx, templates };
                        void (kind === "csv" ? Promise.resolve(downloadMatchesCsv(shown, look)) : downloadMatchesXlsx(shown, look));
                    }} />}
            />
            {importing && <ImportMatches onClose={() => setImporting(false)} />}
            {!games && next && (
                <NextMatch match={next} settings={settings} weather={weather.get(next.id)} referees={referees} folded={folded} onFold={toggleNext}
                    venue={next.venueId ? venues.get(next.venueId) : undefined}
                    competition={next.competitionId ? competitions.get(next.competitionId)?.name : undefined} />
            )}
            {/* WEB-2, WEB-24: the figures as the board's second line, divided by chalk; not three zeros before there's a match. */}
            {!games && all.length > 0 && (
                <div className="match-facts">
                    <div><b><CountUp value={thisWeek} /></b><span><span className="facts-long">in the </span>next 7 days</span></div>
                    <div>
                        <b><CountUp value={unpaidTotal} format={(n) => money(Math.round(n * 100) / 100, unpaid[0]?.fee?.currency ?? settings.currency)} /></b>
                        <span><span className="facts-long">fees </span>owed{unpaid.length > 0 && <span className="muted facts-long"> · {unpaid.length} {unpaid.length === 1 ? "match" : "matches"}</span>}</span>
                    </div>
                    <div><b><CountUp value={playedCount} /></b><span>played</span></div>
                </div>
            )}
            {!games && <GetReady ready={getReady} onImport={() => setImporting(true)} />}
            {!games && <Halfway />}
            {!games && <DidYouKnow ready={!matches.isLoading && getReady.settled} blocked={getReady.show} played={playedCount} />}
            {/* Search and the tabs once there's something to search. */}
            {(all.length > 0 || !matches.isSuccess) && <div className="list-tools">
                <div className="segmented">
                    <button className={tab === "upcoming" ? "on" : ""} onClick={() => setParam("show", undefined)}>Upcoming</button>
                    <button className={tab === "past" ? "on" : ""} onClick={() => setParam("show", "past")}>Past</button>
                </div>
                <div className="search-wrap">
                    <label className="search">
                        <Icon name="search" size={17} />
                        {/* The chosen tag sits in the box, so choosing one moves nothing on the page. */}
                        {tag && (
                            <span className="chip chip-brand search-tag">
                                {tag}
                                <button type="button" aria-label={`Stop filtering by ${tag}`} onClick={() => setTag(undefined)}><Icon name="close" size={12} /></button>
                            </span>
                        )}
                        <input type="search" value={query} placeholder="Search teams, venues, officials, tags…" aria-label="Search matches"
                            onChange={(e) => setParam("q", e.target.value || undefined)} onFocus={() => setSearching(true)} onBlur={() => setSearching(false)} />
                        {/* APP-17; pressing it mustn't take focus from the search. */}
                        {query && <button type="button" className="search-clear" aria-label="Clear the search" onMouseDown={(e) => e.preventDefault()} onClick={() => setParam("q", undefined)}><Icon name="close" size={15} /></button>}
                    </label>
                    {/* Over the list, not pushing it down, while the search has focus. */}
                    {allTags.length > 0 && searching && (
                        <div className="chip-layer" aria-label="Your tags">
                            {allTags.map((t) => (
                                // Pressing a chip mustn't take focus from the search, or the layer would go before the click lands.
                                <button key={t} type="button" className={`chip${tag === t ? " chip-brand" : ""}`} onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setTag(tag === t ? undefined : t)}>{t}</button>
                            ))}
                        </div>
                    )}
                </div>
            </div>}
            {games && (
                <div className="games-filter">
                    <span className="muted">From Stats:</span>
                    {describeGames(games, ctx).map((label) => <span key={label} className="chip chip-brand">{label}</span>)}
                    <span className="muted">{shown.length} {shown.length === 1 ? "game" : "games"}</span>
                    <button type="button" className="link-button" onClick={() => setParams(new URLSearchParams({ show: "past" }))}>Show all matches</button>
                </div>
            )}

            {matches.isLoading && <Loading />}
            {!matches.isLoading && shown.length === 0 && (query || tag || games ? (
                <div className="card empty" style={{ marginTop: 16 }}>
                    No matches found.
                    {elsewhere > 0 && <> {otherTab}</>}
                </div>
            ) : (
                <div className="card empty pitch-empty" style={{ marginTop: 16 }}>
                    <Pitch />
                    <h2>{tab === "upcoming" ? "Nothing coming up" : "No past matches yet"}</h2>
                    <p className="muted">
                        {tab === "upcoming"
                            ? watchLinked ? "Add a game once and it's on your watch and phone, ready for kickoff." : "Add a game once and it's ready for kickoff. Link your watch to have it there too."
                            : "Games you've finished, with the score, the cards and how far you ran."}
                        {elsewhere > 0 && recent.length === 0 && <> Also {otherTab}.</>}
                    </p>
                    {/* WEB-32: none of its own while Get ready above offers the same (Add a match, Import, Link your watch), so a new account sees each once. */}
                    {!getReady.show && (
                        <div className="row" style={{ justifyContent: "center" }}>
                            {tab === "upcoming" && <Link to="/matches/new" className="btn btn-primary"><Icon name="plus" />Add a match</Link>}
                            <button type="button" className="btn" onClick={() => setImporting(true)}><Icon name="upload" />Import matches</button>
                            {tab === "upcoming" && watchLinked === false && <Link to="/link" className="btn"><Icon name="watch" />Link your watch</Link>}
                        </div>
                    )}
                </div>
            ))}
            {shown.length > 0 && (
                <div className="list-head">
                    <h2>{games ? "Games" : tab === "upcoming" ? "Upcoming" : "Past"}</h2>
                    <span>{shown.length} {shown.length === 1 ? "match" : "matches"}</span>
                </div>
            )}
            {shown.length > 0 && (
                <div className="match-list">
                    {shown.map((m, i) => (
                        <MatchRow key={m.id} order={i} match={m} record={recordFor.get(m.id)} together={together} referees={referees} settings={settings} weather={weather.get(m.id)}
                            venue={m.venueId ? venues.get(m.venueId) : undefined}
                            competition={m.competitionId ? competitions.get(m.competitionId)?.name : undefined} />
                    ))}
                </div>
            )}
            {shown.length > 0 && elsewhere > 0 && recent.length === 0 && <p className="muted" style={{ fontSize: 14 }}>Also {otherTab}.</p>}
            {recent.length > 0 && (
                <>
                    <div className="list-head">
                        <h2>Recent</h2>
                        <span>{recent.length < pastAll.length ? `The last ${recent.length} of ${pastAll.length}` : `${recent.length} ${recent.length === 1 ? "match" : "matches"}`}</span>
                    </div>
                    <div className="match-list">
                        {recent.map((m, i) => (
                            <MatchRow key={m.id} order={shown.length + i} match={m} record={recordFor.get(m.id)} together={together} referees={referees} settings={settings} weather={pastWeather.get(m.id)}
                                venue={m.venueId ? venues.get(m.venueId) : undefined}
                                competition={m.competitionId ? competitions.get(m.competitionId)?.name : undefined} />
                        ))}
                    </div>
                    <div className="list-more">
                        <button type="button" className="btn" onClick={showPast}>
                            {pastAll.length === 1 ? "The past match" : `All ${pastAll.length} past matches`}<Icon name="next" />
                        </button>
                    </div>
                </>
            )}
        </>
    );
}

export function MatchRow({ order, match, record, venue, competition, referees, together, settings, weather }: {
    /** Its place in the list, which staggers the rows as they rise in. */
    order: number;
    match: Match;
    record?: MatchRecord;
    venue?: { id: string; name: string };
    competition?: string;
    referees: Map<string, Referee>;
    together: Map<string, Together>;
    settings: SettingsValues;
    weather?: MatchWeather;
}) {
    const about = [match.name ?? competition, describePlayers(match)].filter(Boolean).join(" · ");
    const cards = record && cardCounts(record);
    const played = !!record || match.status === "played" || match.status === "abandoned";
    // WEB-24: what the row's chalk panel ends on: how far you ran once played, else the fee.
    const figure = record?.distanceM !== undefined
        ? <span className="row-figure" title="Distance you covered">{formatDistance(record.distanceM, settings.distanceUnit)}</span>
        : !played && match.fee ? <span className="row-figure" title="Your fee">{money(match.fee.amount, match.fee.currency)}</span> : null;
    // WEB-3, WEB-24: a stadium board: the kickoff, the two kits with the score between them once
    // played, then a chalk panel with the officials, where and what, and the figures.
    return (
        <div className={`match-row board${record ? " has-score" : ""}`} style={{ "--i": Math.min(order, 12) } as React.CSSProperties}>
            <div className="kickoff">
                <Kickoff iso={match.kickoff} played={played} />
                {weather && <WeatherBrief weather={weather} unit={settings.temperatureUnit} />}
            </div>
            <Link to={`/matches/${match.id}`} className="match-link" aria-label={`${matchTitle(match)}${record ? `, ${record.score.home}–${record.score.away}` : ""}`}>
                <KitPanels home={match.home} away={match.away} middle={record && <Score record={record} />} />
            </Link>
            <div className="match-info panel">
                <div className="match-main">
                    {(match.role || match.crew.length > 0) && (
                        <div className="crew">
                            {crewInOrder(match.crew, match.role).map((o, i) => {
                                if (o.you) {
                                    return <span key={i} className="crew-chip you">{roleNames[o.role]} <small>you</small></span>;
                                }
                                const c = o.member;
                                const referee = c.refereeId ? referees.get(c.refereeId) : undefined;
                                return referee
                                    ? <RefereeChip key={i} role={roleNames[c.role]} referee={referee} together={together.get(referee.id)} />
                                    : <span key={i} className="crew-chip"><b>{roleNames[c.role]}</b> {c.name ?? "Unknown"}</span>;
                            })}
                        </div>
                    )}
                    {(about || venue) && (
                        <div className="match-meta">
                            {venue && <FromLink to={`/venues/${venue.id}`} className="venue-link">{venue.name}</FromLink>}
                            {about && venue && " · "}
                            {about}
                        </div>
                    )}
                    {match.tags?.length ? <div className="match-tags"><Tags tags={match.tags} /></div> : null}
                </div>
                <div className="match-side">
                    {figure}
                    {cards && (cards.yellow > 0 || cards.red > 0) && (
                        <span className="card-counts" aria-label={`${cards.yellow} ${cards.yellow === 1 ? "caution" : "cautions"}, ${cards.red} ${cards.red === 1 ? "send-off" : "send-offs"}`}>
                            {cards.yellow > 0 && <span><CardShape colour="yellow" order={order} />{cards.yellow}</span>}
                            {cards.red > 0 && <span><CardShape colour="red" order={order + 1} />{cards.red}</span>}
                        </span>
                    )}
                    <StatusChip match={match} />
                    {weather && !weather.final && match.status === "scheduled" && <RiskBadges weather={weather} settings={settings} />}
                    {match.fee && !match.fee.paid && match.status === "played" && <span className="chip chip-amber">Fee due</span>}
                </div>
            </div>
        </div>
    );
}

/**
 * New match, with a menu beside it for the other ways to add matches (importing a file, IMP-1)
 * and for taking the list out as a spreadsheet (DATA-5).
 */
function NewMatchButton({ onImport, onExport, exportCount }: { onImport: () => void; onExport: (kind: "xlsx" | "csv") => void; exportCount: number }) {
    return (
        <div className="split-button">
            <Link to="/matches/new" className="btn btn-primary"><Icon name="plus" />New match</Link>
            <MenuTrigger>
                <Button className="btn btn-primary split-more" aria-label="Import and export"><Icon name="chevron" size={16} /></Button>
                <Popover className="menu-popover" placement="bottom end" offset={6}>
                    <Menu className="menu" aria-label="Import and export" disabledKeys={exportCount ? [] : ["xlsx", "csv"]}
                        onAction={(key) => (key === "import" ? onImport() : onExport(key as "xlsx" | "csv"))}>
                        <MenuItem id="import" className="menu-item" textValue="Import matches">
                            <Icon name="upload" size={18} />
                            <span><strong>Import matches</strong><small>From a spreadsheet, CSV or JSON file</small></span>
                        </MenuItem>
                        <MenuItem id="xlsx" className="menu-item" textValue="Export to Excel">
                            <Icon name="xlsx" size={18} />
                            <span><strong>Export to Excel</strong><small>{exportCount === 1 ? "The match listed" : `The ${exportCount} matches listed`}, in Import's columns</small></span>
                        </MenuItem>
                        <MenuItem id="csv" className="menu-item" textValue="Export as CSV">
                            <Icon name="csv" size={18} />
                            <span><strong>Export as CSV</strong><small>The same, as a CSV file</small></span>
                        </MenuItem>
                    </Menu>
                </Popover>
            </MenuTrigger>
        </div>
    );
}

/** The next match (WEB-2): the kickoff large, a countdown to it, the teams, venue, your role and the forecast. */
/** WEB-20: the officials on one line, the roles in small capitals; cut with an ellipsis when it doesn't fit. */
function OfficialsLine({ match, referees }: { match: Match; referees: Map<string, Referee> }) {
    const officials = officialsLine(match, referees);
    return officials.length ? (
        <div className="officials-line" title={officials.map((o) => `${o.role} ${o.who}`).join(" · ")}>
            {officials.map((o, i) => (
                <span key={i}>{i > 0 && " · "}<span className="official-role">{o.role}</span> {o.you ? <b>you</b> : o.who}</span>
            ))}
        </div>
    ) : null;
}

function NextMatch({ match, venue, competition, settings, weather, referees, folded, onFold }: {
    match: Match; venue?: Venue; competition?: string; settings: SettingsValues; weather?: MatchWeather; referees: Map<string, Referee>;
    /** WEB-27: shown as a single strip of the board, with a button to open it again. */
    folded: boolean;
    onFold: () => void;
}) {
    // Where to drive to: the pitch's pin, else the venue's.
    const pitch = venue?.pitches.find((p) => p.id === match.pitchId);
    const destination = pitch?.position ?? venue?.position;
    const now = useNow(10_000);
    const kickoff = new Date(match.kickoff!);
    const [time, period] = timeParts(match.kickoff!);
    const minutesLeft = Math.max(0, Math.ceil((kickoff.getTime() - now) / 60_000));
    const units: [number, string, string][] = [[Math.floor(minutesLeft / 1440), "day", "days"], [Math.floor((minutesLeft % 1440) / 60), "hr", "hrs"], [minutesLeft % 60, "min", "min"]];
    const shown = units.slice(units.findIndex(([n], i) => n > 0 || i === 2));
    const today = kickoff.toDateString() === new Date(now).toDateString();
    const about = [match.name ?? competition, describePlayers(match)].filter(Boolean).join(" · ");
    const officials = officialsLine(match, referees);
    const countdownLabel = `Kickoff in ${shown.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(" ")}`;
    if (folded) {
        // WEB-27: one strip of the board: the day and time, the kits as badges and the countdown.
        return (
            <section className="next-match folded" aria-labelledby="next-label">
                <div className="board next-strip">
                    <Link to={`/matches/${match.id}`} className="next-strip-link" aria-label={`${matchTitle(match)}, ${kickoff.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} at ${time}${period ? ` ${period}` : ""}. ${countdownLabel}`}>
                        <h2 id="next-label" className="board-label">{today ? "Today" : "Next match"}</h2>
                        <span className="next-strip-when" aria-hidden>
                            {!today && (
                                // The day over the date, as on the open board's kickoff.
                                <span className="next-strip-day">
                                    <span>{kickoff.toLocaleDateString(undefined, { weekday: "short" })}</span>
                                    <span>{kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                                </span>
                            )}
                            <b>{time}{period && <small>{period}</small>}</b>
                        </span>
                        <span className="next-strip-teams" aria-hidden><TeamBadge teams={match} side="home" /><TeamBadge teams={match} side="away" /></span>
                        <span className="next-strip-count" aria-hidden>
                            {minutesLeft === 0 ? "Kickoff" : shown.map(([n, one], i) => <span key={one}>{i > 0 ? String(n).padStart(2, "0") : n}<small>{one[0]}</small></span>)}
                        </span>
                    </Link>
                    <button type="button" className="next-fold" aria-expanded={false} aria-label="Show the next match" onClick={onFold}><Icon name="chevron" size={18} /></button>
                </div>
            </section>
        );
    }
    // WEB-2, WEB-24: the scoreboard in the penalty area (open to the touchline), the countdown on a
    // board of its own beside it, then the forecast, your fee and the way into the match.
    return (
        <section className="next-match" aria-labelledby="next-label">
            <div className="penalty-area">
                <article className="board next-board">
                    <div className="board-head">
                        <h2 id="next-label" className="board-label">{today ? "Today" : "Next match"}</h2>
                        {about && <span className="board-about">{about}</span>}
                        <button type="button" className="next-fold" aria-expanded aria-label="Fold the next match to a strip" onClick={onFold}><Icon name="chevron" size={18} /></button>
                    </div>
                    <Link to={`/matches/${match.id}`} className="next-when" aria-label={`${matchTitle(match)}, ${kickoff.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} at ${time}${period ? ` ${period}` : ""}`}>
                        <span className="next-day" aria-hidden>
                            <span>{today ? "Today" : kickoff.toLocaleDateString(undefined, { weekday: "short" })}</span>
                            <span>{kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        </span>
                        <span className="next-time" aria-hidden>{time}{period && <small>{period}</small>}</span>
                    </Link>
                    {/* The kits lead into the match as the time does; one stop for the keyboard is enough. */}
                    <Link to={`/matches/${match.id}`} className="next-kits" tabIndex={-1} aria-hidden>
                        <KitPanels home={match.home} away={match.away} labels size="large" />
                    </Link>
                </article>
                <dl className="next-facts">
                    {venue && (
                        <div>
                            <Icon name="venues" size={22} />
                            <div>
                                <dt>Venue</dt>
                                <dd className="next-fact-main"><FromLink to={`/venues/${venue.id}`} className="venue-link">{venue.name}</FromLink>{pitch && ` · ${pitch.name}`}</dd>
                                {venue.address && <dd className="muted next-fact-sub">{venue.address}</dd>}
                            </div>
                        </div>
                    )}
                    {officials.length > 0 && (
                        <div>
                            <Icon name="referees" size={22} />
                            <div>
                                <dt>Officials</dt>
                                <dd className="next-fact-main"><OfficialsLine match={match} referees={referees} /></dd>
                            </div>
                        </div>
                    )}
                </dl>
            </div>
            <div className="next-side">
                {/* WEB-24: a stadium clock: each unit a lit cell on the board, two figures after the first. */}
                <div className="countdown-board board">
                    <span className="board-label">{minutesLeft === 0 ? "Kickoff" : "Starts in"}</span>
                    <div className="countdown" role="timer" aria-label={countdownLabel}>
                        {shown.map(([n, one, many], i) => (
                            <Fragment key={one}>
                                {i > 0 && <i className="countdown-sep" aria-hidden>:</i>}
                                <div><b key={n}>{i > 0 ? String(n).padStart(2, "0") : n}</b><span>{n === 1 ? one : many}</span></div>
                            </Fragment>
                        ))}
                    </div>
                </div>
                {(weather || match.fee) && (
                    <div className="next-figures">
                        {weather && (
                            <div title="Forecast for kickoff">
                                <span className="next-figure"><WeatherIcon condition={weather.condition} isDay={weather.isDay} size={28} />{formatTemperature(weather.temperatureC, settings.temperatureUnit)}</span>
                                <span className="muted">{conditionName(weather.condition, weather.isDay)}</span>
                            </div>
                        )}
                        {match.fee && (
                            <div>
                                <span className="next-figure">{money(match.fee.amount, match.fee.currency)}</span>
                                <span className="muted">Your fee</span>
                            </div>
                        )}
                    </div>
                )}
                {weather && !weather.final && weather.risks.length > 0 && <div className="next-risks"><RiskBadges weather={weather} settings={settings} /></div>}
                <div className="next-actions">
                    {destination && (
                        <a className="btn next-directions" href={directionsUrl(destination, settings.mapsApp)} target="_blank" rel="noreferrer">
                            <Icon name="directions" />Directions
                        </a>
                    )}
                    <Link to={`/matches/${match.id}`} className="btn next-open">Open the match<Icon name="open" /></Link>
                </div>
            </div>
        </section>
    );
}

/** The kickoff like a fixture board (WEB-3): the day small, then the time large; a played match its date large. */
function Kickoff({ iso, played }: { iso?: string; played?: boolean }) {
    if (!iso) {
        return <span className="kickoff-day">No date</span>;
    }
    const d = new Date(iso);
    const [time, period] = timeParts(iso);
    const today = new Date().toDateString() === d.toDateString();
    const otherYear = d.getFullYear() !== new Date().getFullYear();
    const full = d.toLocaleDateString(undefined, { dateStyle: "full" });
    if (played) {
        return (
            <>
                <span className={`kickoff-day${today ? " today" : ""}`} aria-label={full}>{today ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" })}{otherYear ? ` ${d.getFullYear()}` : ""}</span>
                <span className="kickoff-time kickoff-date">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
            </>
        );
    }
    return (
        <>
            {/* The day over the date ("Mon" / "Nov 9"), as on the next match's board. */}
            <span className={`kickoff-day${today ? " today" : " two-line"}`} aria-label={full}>
                {today ? "Today" : <>
                    <span>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{otherYear ? ` ${d.getFullYear()}` : ""}</span>
                </>}
            </span>
            <span className="kickoff-time">{time}{period && <small>{period}</small>}</span>
        </>
    );
}

/** The final score, home first; the side that lost is muted (on penalties when level). */
function Score({ record }: { record: MatchRecord }) {
    const { home, away } = record.score;
    const pens = record.penalties;
    const lost = (side: "home" | "away") => {
        const [us, them] = side === "home" ? [home, away] : [away, home];
        return us < them || (us === them && pens !== undefined && (side === "home" ? pens.home < pens.away : pens.away < pens.home));
    };
    return (
        <span className="score">
            <span className={lost("home") ? "lost" : ""}>{home}</span>
            <span className="score-dash">–</span>
            <span className={lost("away") ? "lost" : ""}>{away}</span>
            {pens && <small>({pens.home}–{pens.away} p)</small>}
        </span>
    );
}

/** Cards shown in a match (WEB-5): a second caution counts as a caution and a send-off, and a second sin bin as a send-off (EVT-12), as in Stats. */
function cardCounts(record: MatchRecord): { yellow: number; red: number } {
    let yellow = 0;
    let red = 0;
    for (const e of record.events) {
        if (e.type === "caution" || e.type === "secondCaution") {
            yellow += 1;
        }
        if (e.type === "sendOff" || e.type === "secondCaution" || e.type === "secondSinBin") {
            red += 1;
        }
    }
    return { yellow, red };
}

/** A saved official: tap for how often you've worked together and how to reach them. */
function RefereeChip({ role, referee, together }: { role: string; referee: Referee; together?: Together }) {
    return (
        <DialogTrigger>
            <Button className="crew-chip saved"><b>{role}</b> {referee.name}</Button>
            <Popover className="ref-popover" placement="bottom start" offset={6}>
                <Dialog className="ref-dialog" aria-label={referee.name}>
                    <div className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                        <RefereeAvatar referee={referee} name={referee.name} />
                        <div>
                            <strong>{referee.name}</strong>
                            <div className="muted" style={{ fontSize: 13 }}>{describeTogether(together, "together")}</div>
                        </div>
                    </div>
                    <ContactButtons phone={referee.phone} email={referee.email} name={referee.name} words />
                    <FromLink to={`/referees/${referee.id}`} className="ref-open">Open profile</FromLink>
                </Dialog>
            </Popover>
        </DialogTrigger>
    );
}

export function StatusChip({ match }: { match: Match }) {
    switch (match.status) {
        case "postponed": return <span className="chip chip-amber">Postponed</span>;
        case "cancelled": return <span className="chip">Canceled</span>;
        case "abandoned": return <span className="chip chip-red">Abandoned</span>;
        default: return null;
    }
}
