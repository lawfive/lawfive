import {
    AppleLogoIcon, ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, ArrowsLeftRightIcon, BellIcon, BellSlashIcon, ArrowsMergeIcon, BrowserIcon, CalendarBlankIcon, CalendarDotsIcon, CameraIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, ChartBarIcon, ChatTextIcon, CheckIcon, ClipboardTextIcon, ClockClockwiseIcon, ClockIcon, CopyIcon, DeviceMobileIcon,
    CornersInIcon, CornersOutIcon, CropIcon, DotsThreeOutlineIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, ExamIcon, ExportIcon, FileArrowUpIcon, FileCodeIcon, FileTextIcon, FileCsvIcon, FileXlsIcon, FirstAidIcon, FlagIcon,
    GaugeIcon, GearSixIcon, GlobeIcon, HardDrivesIcon, HourglassMediumIcon, GoogleLogoIcon, GooglePlayLogoIcon, HandTapIcon, HashIcon, IdentificationBadgeIcon, ImagesIcon, InfoIcon, KeyIcon, LinkIcon, LockOpenIcon, ListDashesIcon, MagnifyingGlassIcon, MapPinIcon, MapPinPlusIcon, MapTrifoldIcon,
    MicrosoftOutlookLogoIcon, MoneyIcon, NavigationArrowIcon, NoteIcon, PauseIcon, PencilSimpleIcon, PhoneIcon, PlayIcon, PlusIcon, QrCodeIcon, QuestionIcon, SignOutIcon, TableIcon, TagIcon, TrashIcon, TrophyIcon, UploadSimpleIcon,
    UserCheckIcon, UserCircleIcon, UserPlusIcon,
    UsersIcon, UsersThreeIcon, WatchIcon, PathIcon, HeartbeatIcon, LightningIcon, SpeedometerIcon, TimerIcon, ThermometerIcon, CloudRainIcon, WindIcon, SunIcon, BatteryMediumIcon, WebhooksLogoIcon, XIcon, type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { Link, type LinkProps, useLocation } from "react-router";
import type { Team } from "../api.ts";
import { colourName, teamAlias, teamColours, teamName, textOn } from "../format.ts";
import { markFive, markFold, markL, markTransform, markViewBox } from "../logo.ts";

// Small building blocks shared by the pages.

// Every icon is Phosphor's, in its regular weight (DESIGN.md); pages name them by what they're for.
const icons = {
    matches: CalendarBlankIcon,
    templates: ListDashesIcon,
    venues: MapPinIcon,
    referees: UsersIcon,
    competitions: TrophyIcon,
    people: UsersThreeIcon,
    approve: UserCheckIcon,
    invite: UserPlusIcon,
    plus: PlusIcon,
    back: CaretLeftIcon,
    next: CaretRightIcon,
    chevron: CaretDownIcon,
    close: XIcon,
    edit: PencilSimpleIcon,
    trash: TrashIcon,
    pause: PauseIcon,
    injury: FirstAidIcon,
    /** TMR-14: a clock corrected during play. */
    clockAdjusted: ClockClockwiseIcon,
    flag: FlagIcon,
    out: SignOutIcon,
    search: MagnifyingGlassIcon,
    map: MapTrifoldIcon,
    pin: MapPinPlusIcon,
    watch: WatchIcon,
    browser: BrowserIcon,
    settings: GearSixIcon,
    more: DotsThreeOutlineIcon,
    check: CheckIcon,
    stats: ChartBarIcon,
    quiz: ExamIcon,
    restart: ArrowCounterClockwiseIcon,
    // Try a match's swipes and taps (DEMO-6).
    swipeUp: ArrowUpIcon,
    swipeDown: ArrowDownIcon,
    swipeLeft: ArrowLeftIcon,
    swipeRight: ArrowRightIcon,
    swipeSideways: ArrowsLeftRightIcon,
    tap: HandTapIcon,
    // FILE-8: a quarter turn of a photo, clockwise.
    turn: ArrowClockwiseIcon,
    crop: CropIcon,
    download: DownloadSimpleIcon,
    play: PlayIcon,
    expand: CornersOutIcon,
    shrink: CornersInIcon,
    bell: BellIcon,
    bellOff: BellSlashIcon,
    mail: EnvelopeSimpleIcon,
    link: LinkIcon,
    help: QuestionIcon,
    copy: CopyIcon,
    share: ExportIcon,
    clock: ClockIcon,
    calendar: CalendarDotsIcon,
    key: KeyIcon,
    unlock: LockOpenIcon,
    plan: GaugeIcon,
    server: HardDrivesIcon,
    timeZone: GlobeIcon,
    info: InfoIcon,
    merge: ArrowsMergeIcon,
    table: TableIcon,
    upload: UploadSimpleIcon,
    file: FileArrowUpIcon,
    webhook: WebhooksLogoIcon,
    phone: DeviceMobileIcon,
    // Calling someone, a handset (the phone apps are "phone").
    call: PhoneIcon,
    qr: QrCodeIcon,
    googlePlay: GooglePlayLogoIcon,
    report: FileTextIcon,
    undo: ArrowCounterClockwiseIcon,
    camera: CameraIcon,
    photos: ImagesIcon,
    // A page's facts (DESIGN.md "Facts"), and getting there or in touch.
    role: IdentificationBadgeIcon,
    tag: TagIcon,
    hash: HashIcon,
    assignor: ClipboardTextIcon,
    note: NoteIcon,
    money: MoneyIcon,
    directions: NavigationArrowIcon,
    // WEB-24: going on to a page (Open the match).
    open: ArrowRightIcon,
    attacksRight: ArrowRightIcon,
    attacksLeft: ArrowLeftIcon,
    message: ChatTextIcon,
    portrait: UserCircleIcon,
    csv: FileCsvIcon,
    xlsx: FileXlsIcon,
    json: FileCodeIcon,
    // Stats' sections (WEB-24): distance run, heart rate, sprints, top speed, added time, the weather and a watch's battery.
    distance: PathIcon,
    heart: HeartbeatIcon,
    sprint: LightningIcon,
    speed: SpeedometerIcon,
    timer: TimerIcon,
    temperature: ThermometerIcon,
    rain: CloudRainIcon,
    wind: WindIcon,
    sun: SunIcon,
    battery: BatteryMediumIcon,
    apple: AppleLogoIcon,
    google: GoogleLogoIcon,
    outlook: MicrosoftOutlookLogoIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof icons;

export function Icon({ name, size }: { name: IconName; size?: number }) {
    const Glyph = icons[name];
    return <Glyph size={size} aria-hidden />;
}

/**
 * A fact on a page (DESIGN.md "Facts"), in a `dl.facts`: a muted icon beside a small label and the
 * value, as the Android app shows them. `wide` takes the whole row where the grid has columns.
 */
export function Fact({ icon, label, wide, children }: { icon: IconName; label: string; wide?: boolean; children: ReactNode }) {
    return (
        <div className={`fact${wide ? " fact-wide" : ""}`}>
            <span className="fact-icon"><Icon name={icon} size={17} /></span>
            <dt>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

/**
 * The L5 mark (WEB-25), its colors from where it sits: chalk and mint on the board, chalk on the grass,
 * ink and pitch green on a panel by day (`--logo-l`, `--logo-five`, `--logo-fold` in styles.css).
 */
export function LogoMark({ fold = true }: { fold?: boolean }) {
    return (
        <svg className="logo-mark" viewBox={markViewBox} aria-hidden>
            <g transform={markTransform}>
                <path className="l" d={markL} />
                <path className="five" d={markFive} />
                {fold && <path className="fold" d={markFold} />}
            </g>
        </svg>
    );
}

/** The LawFive lockup: the mark beside the name, with the tapered line under it where it's large (WEB-25). */
export function Logo({ line = true }: { line?: boolean }) {
    return (
        <div className="logo" role="img" aria-label="LawFive">
            <LogoMark />
            <span className="logo-name">
                LAWFIVE
                {line && (
                    <svg className="logo-line" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
                        <path d="M0 9.6L200 0L196 7.2L6 10Z" />
                    </svg>
                )}
            </span>
        </div>
    );
}

/** True when the system asks for less motion; animations then don't run (DESIGN.md). */
export const lessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that counts up to its value as it appears, and from one value to the next (WEB-1). */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
    const [shown, setShown] = useState(() => (lessMotion() ? value : 0));
    const current = useRef(shown);
    useEffect(() => {
        const from = current.current;
        if (from === value || lessMotion()) {
            current.current = value;
            setShown(value);
            return;
        }
        const start = performance.now();
        let frame = requestAnimationFrame(function step(now) {
            const k = Math.min(1, (now - start) / 700);
            current.current = k === 1 ? value : from + (value - from) * (1 - (1 - k) ** 3);
            setShown(current.current);
            if (k < 1) {
                frame = requestAnimationFrame(step);
            }
        });
        return () => cancelAnimationFrame(frame);
    }, [value]);
    return <>{format(shown)}</>;
}

/** The time now, updated every `ms`. */
export function useNow(ms: number): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(timer);
    }, [ms]);
    return now;
}

/** A yellow or red card, or the two of a second caution, drawn as the card itself, never an icon (DESIGN.md). `order` staggers it as it's dealt in. */
export function CardShape({ colour, large, huge, order = 0, sinBin }: { colour: "yellow" | "red" | "second"; large?: boolean; huge?: boolean; order?: number; sinBin?: boolean }) {
    return (
        <span className={`card-shape ${colour}${huge ? " huge" : large ? " large" : ""}${sinBin ? " sin-bin" : ""}`} style={{ "--i": order } as CSSProperties} aria-hidden>
            {sinBin && <HourglassMediumIcon />}
        </span>
    );
}

/**
 * EVT-12: a sin bin as the card shown on a match's timeline (`.card-icon`), the yellow card with Phosphor's hourglass
 * on it for the time off; a second sin bin, a send-off, as the half-and-half of a second caution.
 */
export function SinBinCard({ second }: { second?: boolean }) {
    return (
        <span className={`card-icon ${second ? "second" : "yellow"} sin-bin`} aria-hidden>
            <HourglassMediumIcon />
        </span>
    );
}

/**
 * Pitch markings in thin lines (WEB-4): the center circle and the halfway line behind an empty
 * list's message (drawn in as it appears, WEB-7).
 */
export function Pitch() {
    // Sized to the card's shorter side; the halfway line runs from the circle out past the viewBox to
    // the card's edges, stopping at the circle so it never runs through the message inside it (WEB-17).
    return (
        <svg className="pitch-markings pitch-centre" viewBox="0 0 200 200" overflow="visible" fill="none" stroke="currentColor" strokeWidth={1.2} aria-hidden>
            <circle cx="100" cy="100" r="84" pathLength={1} transform="rotate(-90 100 100)" />
            <path d="M16 100H-500" pathLength={1} />
            <path d="M184 100H700" pathLength={1} />
        </svg>
    );
}

type EmptyPicture = "venue" | "crew" | "bracket" | "format";

// A pitch from above, as the venue, and as the crew's diagonal. On phones: EmptyState.
const pitchFromAbove = <rect pathLength={1} x="20" y="45" width="160" height="110" />;
const EmptyPictures: Record<EmptyPicture, ReactNode> = {
    // The whole pitch, with the maps' teardrop pin on it.
    venue: <>
        {pitchFromAbove}
        <path pathLength={1} d="M100 45V155M20 75h24v50H20M180 75h-24v50h24" />
        <circle pathLength={1} cx="100" cy="100" r="18" />
        <path pathLength={1} d="M130 92L114.7 72.9A20 20 0 1 1 145.3 72.9Z" />
        <circle className="spot" cx="130" cy="60" r="5" fill="currentColor" stroke="none" />
    </>,
    // The diagonal system: the referee in the middle, an assistant on each touchline.
    crew: <>
        {pitchFromAbove}
        <path pathLength={1} d="M100 45V155M60 155L140 45" />
        <circle className="spot" cx="100" cy="100" r="7" fill="currentColor" stroke="none" />
        <circle className="spot" cx="140" cy="45" r="5" fill="currentColor" stroke="none" />
        <circle className="spot" cx="60" cy="155" r="5" fill="currentColor" stroke="none" />
    </>,
    // A tournament's bracket, narrowing to one.
    bracket: <>
        <path pathLength={1} d="M30 40h40v40H30M30 120h40v40H30M70 60h40v80H70M110 100h60" />
        <circle className="spot" cx="170" cy="100" r="5" fill="currentColor" stroke="none" />
    </>,
    // A match as a bar: two periods with the break between.
    format: <>
        <rect pathLength={1} x="20" y="80" width="70" height="40" />
        <rect pathLength={1} x="110" y="80" width="70" height="40" />
        <path pathLength={1} d="M90 100h20M20 130v6M55 130v6M90 130v6M110 130v6M145 130v6M180 130v6" />
    </>,
};

/**
 * A list with nothing in it yet (WEB-17): the pitch lines behind, its own picture above the words
 * (behind them it couldn't be made out), what it's for, and a way to add the first.
 */
export function EmptyList({ picture, title, text, action }: { picture: EmptyPicture; title: string; text: string; action: { to: string; label: string } }) {
    return (
        <div className="empty pitch-empty">
            <Pitch />
            <svg className="empty-picture" viewBox="10 30 180 140" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>{EmptyPictures[picture]}</svg>
            <h2>{title}</h2>
            <p className="muted">{text}</p>
            <div className="row" style={{ justifyContent: "center" }}>
                <Link to={action.to} className="btn btn-primary"><Icon name="plus" />{action.label}</Link>
            </div>
        </div>
    );
}

/** SITE-5: the hosted service's terms and policy; a self-hosted server has its own, or none. */
export const isHostedService = () => window.location.hostname === "app.lawfive.app";

/** WEB-29: Help, the same everywhere: lawfive.app's support page, with its common questions and how to write in. */
export const helpUrl = "https://lawfive.app/support";

export function LegalNote({ action }: { action: string }) {
    return isHostedService() ? (
        <p className="auth-note">By {action} you agree to LawFive's <a href="https://lawfive.app/terms.html" target="_blank" rel="noreferrer">terms</a> and <a href="https://lawfive.app/privacy.html" target="_blank" rel="noreferrer">privacy policy</a>.</p>
    ) : null;
}

/**
 * Waiting for a page or part of one (WEB-9): the pitch being marked out, faint brand green, over
 * and over. `inline` is the small one for a row; a page's is centred with an optional line under it.
 * Like the placeholders, it shows only once loading has taken 0.3s.
 */
export function Loading({ label, inline }: { label?: string; inline?: boolean }) {
    const lines = inline ? (
        <svg viewBox="0 0 220 140" width={30} fill="none" stroke="currentColor" strokeWidth={10} aria-hidden>
            <rect className="mark" pathLength={1} x="6" y="6" width="208" height="128" rx="8" />
            <path className="mark" pathLength={1} d="M110 6v128" style={{ "--i": 1 } as CSSProperties} />
            <circle className="mark" pathLength={1} cx="110" cy="70" r="26" style={{ "--i": 3 } as CSSProperties} />
        </svg>
    ) : (
        <svg viewBox="0 0 220 140" width={76} fill="none" stroke="currentColor" strokeWidth={4} aria-hidden>
            <rect className="mark" pathLength={1} x="4" y="4" width="212" height="132" rx="5" />
            <path className="mark" pathLength={1} d="M110 4v132" style={{ "--i": 1 } as CSSProperties} />
            <path className="mark" pathLength={1} d="M4 36h30v68H4M216 36h-30v68h30" style={{ "--i": 2 } as CSSProperties} />
            <circle className="mark" pathLength={1} cx="110" cy="70" r="22" style={{ "--i": 3 } as CSSProperties} />
        </svg>
    );
    return inline ? (
        <span className="loading loading-inline placeholder-appear" role="status" aria-label={label ?? "Loading"}>{lines}</span>
    ) : (
        <div className="loading placeholder-appear" role="status" aria-label={label ? undefined : "Loading"}>{lines}{label && <span>{label}</span>}</div>
    );
}

/**
 * Where a map will be, swept while it loads (WEB-8): in the map's place while the map library
 * loads, then under the map until its tiles have.
 */
export function MapPlaceholder({ height }: { height?: number }) {
    return height === undefined ? <div className="map-placeholder sweep" aria-hidden /> : <div className="map map-placeholder sweep" style={{ height }} aria-hidden />;
}

/** The team's short name on its colour, as the watch shows it (SET-5, UI-10). */
/** WEB-24: a team as its kit, the panel in its color and the name in black or white by contrast (textOn, as the watch); no color is the board's dark gray. */
function kitStyle(team: Team): CSSProperties {
    return team.colour ? { background: team.colour, color: textOn(team.colour) } : { background: "var(--kit-blank)", color: "var(--on-board-strong)" };
}

/**
 * WEB-24: the two kits side by side on a board, home on the left, cut on the diagonal where they
 * meet; a score (or anything else) can sit on the board between them.
 */
export function KitPanels({ home, away, middle, labels, size }: { home: Team; away: Team; middle?: ReactNode; labels?: boolean; size?: "large" | "small" }) {
    return (
        <div className={`kits${middle ? " with-middle" : ""}${size ? ` kits-${size}` : ""}`}>
            <span className="kit kit-home" style={kitStyle(home)}>
                {labels && <small className="kit-label">Home</small>}
                <span className="kit-name">{teamName(home, "home")}</span>
            </span>
            {middle}
            <span className="kit kit-away" style={kitStyle(away)}>
                {labels && <small className="kit-label">Away</small>}
                <span className="kit-name">{teamName(away, "away")}</span>
            </span>
        </div>
    );
}

/** WEB-24: the halfway line across the pitch frame, touchline to touchline, with the center spot; it divides a page's halves. */
export function Halfway() {
    return <div className="halfway" aria-hidden><span /></div>;
}

/** WEB-24: a center circle in chalk around what matters most (a countdown, a season's total), the halfway line running out from it to the touchlines when `line` is set; it sizes to the room it has. */
export function CentreCircle({ children, line, className }: { children: ReactNode; line?: boolean; className?: string }) {
    return (
        <div className={`centre-circle-row${line ? " with-line" : ""}${className ? ` ${className}` : ""}`}>
            <div className="centre-circle">{children}</div>
        </div>
    );
}

/** A team's short name on its color (SET-5: from both teams' names when none was typed, so it takes the pair). */
export function TeamBadge({ teams, side, large, small }: { teams: { home: Team; away: Team }; side: "home" | "away"; large?: boolean; small?: boolean }) {
    const team = teams[side];
    const style = team.colour ? { background: team.colour, color: textOn(team.colour), borderColor: team.colour.toUpperCase() === "#FFFFFF" ? "var(--border)" : team.colour } : undefined;
    return <span className={`team-badge${large ? " large" : small ? " small" : ""}`} style={style}>{teamAlias(teams, side)}</span>;
}

/** Where a back link goes and what it says (WEB-16). */
export interface BackTo {
    to: string;
    label: string;
    /** Carried on, for a page that has its own way back. */
    state?: unknown;
}

/** WEB-16: the page a referee or venue is being opened from, when it isn't its own list. */
export const CameFrom = createContext<BackTo | undefined>(undefined);

/** Where dialogs open: the page's end in the app; inside the part on lawfive.app, as its styles are scoped to it (SITE-1). */
export const PortalContainer = createContext<Element | undefined>(undefined);
const listsWithLinks: Record<string, string> = { "/matches": "Matches", "/stats": "Stats" };

/** A link to a referee or venue that remembers where it was followed from, for its back link. */
export function FromLink(props: LinkProps) {
    const here = useContext(CameFrom);
    const { pathname, search } = useLocation();
    const list = listsWithLinks[pathname];
    const from = here ?? (list ? { to: pathname + search, label: list } : undefined);
    return <Link {...props} state={from ? { from } : undefined} />;
}

/** WEB-16: back to where this page was opened from, else to `list`. */
export function useBackTo(list: BackTo): BackTo {
    const { state } = useLocation();
    return (state as { from?: BackTo } | null)?.from ?? list;
}

/**
 * WEB-22: the browser tab's title, the page first and LawFive last ("Venues · LawFive"), as narrow tabs
 * cut the end off. Back to plain "LawFive" when the page goes.
 */
export function useTabTitle(page: string | undefined) {
    useEffect(() => {
        if (!page) {
            return;
        }
        document.title = `${page} · LawFive`;
        return () => {
            document.title = "LawFive";
        };
    }, [page]);
}

/** A page's heading; its title (or `tab`, when the heading isn't plain text or says too little) names the browser tab too. */
export function PageHead({ title, sub, back, actions, tab, hero }: {
    title: ReactNode;
    sub?: ReactNode;
    back?: BackTo;
    actions?: ReactNode;
    tab?: string;
    /** WEB-24: a core page's title as a chalk hero on the grass (Matches, Stats). */
    hero?: boolean;
}) {
    useTabTitle(tab ?? (typeof title === "string" ? title : undefined));
    return (
        <>
            {back && <Link className="back" to={back.to} state={back.state}><Icon name="back" size={18} /><span className="back-label">{back.label}</span></Link>}
            {/* A long hero title steps down on phones, so it fits on one line. */}
            <div className={hero ? `page-head hero${typeof title === "string" && title.length > 8 ? " long" : ""}` : "page-head"}>
                <div>
                    <h1>{title}</h1>
                    {sub && <p>{sub}</p>}
                </div>
                {actions && <div className="row">{actions}</div>}
            </div>
        </>
    );
}

/** A labelled form field, optionally with an ⓘ that explains it. */
export function Field({ label, info, wide, children }: { label: string; info?: ReactNode; wide?: boolean; children: ReactNode }) {
    const id = useId();
    return (
        <div className={`field${wide ? " wide" : ""}`} role="group" aria-labelledby={id}>
            <span className="field-label">
                <span id={id}>{label}</span>
                {info && <InfoTip label={label}>{info}</InfoTip>}
            </span>
            {children}
        </div>
    );
}

/** An ⓘ button that opens a short explanation. A tap target rather than hover, so it works on phones. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
    return (
        <DialogTrigger>
            <Button className="info-button" aria-label={`About ${label}`}><Icon name="info" size={18} /></Button>
            <Popover className="info-popover" placement="top" offset={6}>
                <Dialog className="info-dialog" aria-label={label}>{children}</Dialog>
            </Popover>
        </DialogTrigger>
    );
}

export function TextInput({ value, onChange, ...rest }: { value: string | undefined; onChange: (value: string | undefined) => void; placeholder?: string; type?: string; maxLength?: number }) {
    return <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} {...rest} />;
}

export function NumberInput({ value, onChange, min, max, step }: { value: number | undefined; onChange: (value: number | undefined) => void; min?: number; max?: number; step?: number }) {
    return (
        <input className="input" type="number" inputMode="decimal" value={value ?? ""} min={min} max={max} step={step ?? 1}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
    );
}

/** Minutes on screen, seconds in the record. */
export function MinutesInput({ sec, onChange, min, max }: { sec: number; onChange: (sec: number) => void; min: number; max: number }) {
    return <NumberInput value={sec / 60} min={min} max={max} step={0.5} onChange={(m) => onChange(Math.round((m ?? 0) * 60))} />;
}

export function Select<T extends string>({ value, onChange, options, empty }: { value: T | undefined; onChange: (value: T | undefined) => void; options: [T, string][]; empty?: string }) {
    return (
        <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as T))}>
            {empty !== undefined && <option value="">{empty}</option>}
            {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
    );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
    return (
        <label className={`toggle${disabled ? " disabled" : ""}`}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    );
}

/** The team's badge as a button; it opens the colour choices (the watch's eight, none, or any other). */
export function ColourMenu({ teams, side, label, onChange }: { teams: { home: Team; away: Team }; side: "home" | "away"; label: string; onChange: (hex: string | undefined) => void }) {
    const team = teams[side];
    return (
        <DialogTrigger>
            <Button className="colour-button" aria-label={`${label}: ${colourName(team.colour)}`}>
                <TeamBadge teams={teams} side={side} />
                <Icon name="chevron" size={15} />
            </Button>
            <Popover className="colour-popover" placement="bottom end" offset={6}>
                <Dialog className="colour-dialog" aria-label={label}>
                    {({ close }) => {
                        const pick = (hex: string | undefined) => { onChange(hex); close(); };
                        // WEB-19: a color that isn't one of the watch's eight.
                        const custom = team.colour && !teamColours.some((c) => c.hex === team.colour!.toUpperCase()) ? team.colour.toUpperCase() : undefined;
                        return (
                            <>
                                <div className="colour-grid">
                                    {teamColours.map((c) => (
                                        <button type="button" key={c.hex} title={c.name} aria-label={c.name}
                                            className={`swatch${team.colour?.toUpperCase() === c.hex ? " on" : ""}`} style={{ background: c.hex }} onClick={() => pick(c.hex)} />
                                    ))}
                                </div>
                                {/* The browser's own picker, opened by the whole row; the color applies as it's chosen. */}
                                <label className={`colour-custom${custom ? " on" : ""}`}>
                                    <span className={`swatch${custom ? "" : " any"}`} style={custom ? { background: custom } : undefined} />
                                    <span className="colour-custom-name">Custom</span>
                                    {custom && <span className="colour-custom-hex">{custom}</span>}
                                    <input type="color" aria-label="Custom color" value={(team.colour ?? "#888888").toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} />
                                </label>
                                <button type="button" className="btn btn-ghost colour-none" onClick={() => pick(undefined)}>No color</button>
                            </>
                        );
                    }}
                </Dialog>
            </Popover>
        </DialogTrigger>
    );
}

/** Chips with a box to add more: tags, or (with `names`) a referee's other names, which can hold commas ("Doe, John"). */
/**
 * Tags as chips with a box to add more. `suggestions` are the tags already used elsewhere: while
 * the box has focus, those not on this record show under it, narrowed by what's typed, to add with a tap.
 */
export function TagInput({ tags, onChange, names, suggestions }: { tags: string[] | undefined; onChange: (tags: string[] | undefined) => void; names?: boolean; suggestions?: string[] }) {
    const [draft, setDraft] = useState("");
    const [focused, setFocused] = useState(false);
    const list = tags ?? [];
    const has = (tag: string) => list.some((t) => t.toLowerCase() === tag.toLowerCase());
    const add = (value = draft) => {
        const tag = value.trim();
        if (tag && !has(tag)) {
            onChange([...list, tag]);
        }
        setDraft("");
    };
    const typed = draft.trim().toLowerCase();
    const offered = focused ? (suggestions ?? []).filter((s) => !has(s) && s.toLowerCase().includes(typed)).slice(0, 10) : [];
    return (
        <div className="tag-field">
        <div className="tag-input">
            {list.map((tag) => (
                <span className="chip" key={tag}>
                    {tag}
                    <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(list.length > 1 ? list.filter((t) => t !== tag) : undefined)}><Icon name="close" size={12} /></button>
                </span>
            ))}
            <input value={draft} placeholder={list.length ? "" : names ? "Add a name" : "Add a tag"} maxLength={names ? 100 : 30} onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); add(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || (e.key === "," && !names)) { e.preventDefault(); add(); } }} />
        </div>
        {/* Over what's below, not pushing it down, while the box has focus. */}
        {offered.length > 0 && (
            <div className="chip-layer" aria-label="Tags you've used">
                {offered.map((s) => (
                    // Pressing a suggestion keeps the focus in the box, so more can be added.
                    <button key={s} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}><Icon name="plus" size={12} />{s}</button>
                ))}
            </div>
        )}
        </div>
    );
}

/**
 * A text box offering what's been typed before (the assignors, SET-15) as chips under it while it has
 * focus, as TagInput offers tags; a chip fills the box.
 */
export function SuggestInput({ value, onChange, suggestions, label, ...rest }: {
    value: string | undefined; onChange: (value: string | undefined) => void; suggestions: string[]; label: string; placeholder?: string; maxLength?: number;
}) {
    const [focused, setFocused] = useState(false);
    const typed = (value ?? "").trim().toLowerCase();
    const offered = focused ? suggestions.filter((s) => s.toLowerCase() !== typed && s.toLowerCase().includes(typed)).slice(0, 8) : [];
    return (
        <div className="tag-field">
            <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...rest} />
            {offered.length > 0 && (
                <div className="chip-layer" aria-label={label}>
                    {offered.map((s) => (
                        <button key={s} type="button" className="chip" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(s)}>{s}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Every tag on some records, once each, sorted: the suggestions for a TagInput. */
export function tagsOf(records: { tags?: string[] }[] | undefined): string[] {
    return [...new Set((records ?? []).flatMap((r) => r.tags ?? []))].sort();
}

/**
 * A text box that grows with what's typed in it (outlook, notes), up to most of the screen, then
 * scrolls. Browsers that size boxes to their content (field-sizing) do it themselves.
 */
export function TextArea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        const box = ref.current;
        if (box && !CSS.supports("field-sizing", "content")) {
            box.style.height = "auto";
            box.style.height = `${box.scrollHeight + 2}px`;
        }
    }, [value]);
    return <textarea ref={ref} className="input grow" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}


/**
 * WEB-23: a referee's phone and email as Call, Text and Email buttons, joined in a group, rather than
 * the number and address themselves, which only their profile shows. The number or address is in each
 * button's tooltip; words where there's room, icons alone where there isn't.
 */
export function ContactButtons({ phone, email, name, words = false }: { phone?: string; email?: string; name: string; words?: boolean }) {
    if (!phone && !email) {
        return null;
    }
    const dial = phone?.replace(/[^\d+]/g, "");
    const buttons: [IconName, string, string, string][] = [
        ...(phone ? [["call", `tel:${dial}`, "Call", phone], ["message", `sms:${dial}`, "Text", phone]] as [IconName, string, string, string][] : []),
        ...(email ? [["mail", `mailto:${email}`, "Email", email]] as [IconName, string, string, string][] : []),
    ];
    return (
        <div className={`button-group${words ? "" : " icons-only"}`} role="group" aria-label={`Get in touch with ${name}`}>
            {buttons.map(([icon, href, label, detail]) => (
                <a key={label} className="btn" href={href} title={`${label} ${detail}`} aria-label={`${label} ${name}`} onClick={(e) => e.stopPropagation()}>
                    <Icon name={icon} size={words ? 16 : 17} />{words && label}
                </a>
            ))}
        </div>
    );
}
export function Tags({ tags }: { tags: string[] | undefined }) {
    return tags?.length ? <>{tags.map((t) => <span key={t} className="chip">{t}</span>)}</> : null;
}

