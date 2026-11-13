import { Button, Header, Menu, MenuItem, MenuSection, MenuTrigger, Popover, Separator } from "react-aria-components";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { type Session, useAccount, useMeta, usePeople, useSignOut } from "../api.ts";
import { HttpsNotice, httpsGuide } from "./HttpsNotice.tsx";
import { PlanNotice } from "./PlanNotice.tsx";
import { initials } from "../format.ts";
import { Icon, type IconName, LogoMark, helpUrl } from "./ui.tsx";

/** WEB-24: the stadium board's own pages, in this order; the current one is a tunnel onto the pitch. The same as the phones' tabs (WEB-31). */
const sections = [
    { to: "/matches", label: "Matches", icon: "matches" },
    { to: "/venues", label: "Venues", icon: "venues" },
    { to: "/referees", label: "Referees", icon: "referees" },
    { to: "/stats", label: "Stats", icon: "stats" },
] as const;

export interface MoreItem {
    to: string;
    label: string;
    sub: string;
    icon: IconName;
    /** Opens outside the app, in a new tab. */
    external?: boolean;
}

/**
 * WEB-31: everything else, under More on the board and on the phone's More page, in these groups:
 * the places of their own, then getting LawFive onto a watch and phone and Help, then for admins
 * the server's tools under an Admin heading.
 */
export const moreGroups: { title?: string; admin?: boolean; items: MoreItem[] }[] = [
    {
        items: [
            { to: "/competitions", label: "Competitions", sub: "Leagues, cups and tournaments", icon: "competitions" },
            { to: "/templates", label: "Templates", sub: "Formats you use often", icon: "templates" },
            { to: "/quiz", label: "Quiz", sub: "How well do you know the Laws of the Game?", icon: "quiz" },
            { to: "/try", label: "Try a match", sub: "The watch app, here in the browser", icon: "play" },
        ],
    },
    {
        items: [
            { to: "/link", label: "Link a watch", sub: "Enter the code your watch shows", icon: "watch" },
            { to: "/get-app", label: "Get the app", sub: "LawFive on your phone", icon: "phone" },
            // WEB-29.
            { to: helpUrl, label: "Help", sub: "Questions, and how to reach us", icon: "help", external: true },
        ],
    },
    {
        title: "Admin",
        admin: true,
        items: [
            { to: "/people", label: "People", sub: "Invite people and approve new accounts", icon: "people" },
            { to: "/settings/server/plans", label: "Plans", sub: "What each account can use", icon: "plan" },
            { to: "/settings/server", label: "Server settings", sub: "Email, maps, weather and HTTPS, for everyone", icon: "server" },
        ],
    },
];

/** The pages More leads to, so it's lit on them; Settings' own pages light the gear instead. */
export function underMore(pathname: string): boolean {
    return moreGroups.some((g) => g.items.some((i) => !i.external && (pathname === i.to || pathname.startsWith(`${i.to}/`))));
}

/** Phones have room for five tabs (STAT-4), the board's four and More (WEB-31), where Settings is too. */
const tabs = [
    { to: "/matches", label: "Matches", icon: "matches" },
    { to: "/venues", label: "Venues", icon: "venues" },
    { to: "/referees", label: "Referees", icon: "referees" },
    { to: "/stats", label: "Stats", icon: "stats" },
    { to: "/more", label: "More", icon: "more" },
] as const;

/** How many accounts wait for an admin's approval (USR-4); none for everyone else. */
export function useWaitingCount(): { admin: boolean; waiting: number } {
    const admin = useAccount().data?.admin ?? false;
    const people = usePeople(admin);
    return { admin, waiting: (people.data ?? []).filter((p) => p.status === "pending").length };
}

/** Who's signed in, with a button to sign out: the top of More on phones. */
export function AccountBlock({ session }: { session: Session }) {
    const signOut = useSignOut();
    return (
        <div className="account">
            {/* WEB-24: on the board, the initials in a chalk circle as at the board's right on a computer. */}
            <span className="account-initials" aria-hidden>{initials(session.user.name)}</span>
            <div className="account-who">
                <strong>{session.user.name}</strong>
                <span>{session.user.email}</span>
            </div>
            <button type="button" className="btn btn-sm" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
                <Icon name="out" size={16} />{signOut.isPending ? "Signing out…" : "Sign out"}
            </button>
        </div>
    );
}

/** The account at the board's right: its initials and name, opening who's signed in and Sign out. */
function AccountMenu({ session }: { session: Session }) {
    const signOut = useSignOut();
    return (
        <MenuTrigger>
            <Button className="account-button" aria-label={`Account: ${session.user.name}`}>
                <span className="account-initials" aria-hidden>{initials(session.user.name)}</span>
                <span className="account-name">{session.user.name}</span>
            </Button>
            <Popover className="menu-popover" placement="bottom end" offset={4}>
                <div className="menu-head">
                    <strong>{session.user.name}</strong>
                    <span>{session.user.email}</span>
                </div>
                <Menu className="menu" aria-label="Account" onAction={(key) => key === "out" && signOut.mutate()}>
                    <MenuItem id="out" className="menu-item" textValue="Sign out">
                        <Icon name="out" size={18} />
                        <span><strong>Sign out</strong><small>On this browser</small></span>
                    </MenuItem>
                </Menu>
            </Popover>
        </MenuTrigger>
    );
}

/** More, on the board: the pages that don't have a place of their own there (WEB-31). */
function MoreMenu({ admin, waiting }: { admin: boolean; waiting: number }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const groups = moreGroups.filter((g) => !g.admin || admin);
    return (
        <MenuTrigger>
            <Button className={`nav-link nav-more${underMore(pathname) ? " active" : ""}`}>
                <Icon name="more" />More
                {waiting > 0 && <span className="nav-dot" aria-label={`${waiting} waiting for approval`} />}
                <span className="caret" aria-hidden><Icon name="chevron" size={14} /></span>
            </Button>
            <Popover className="menu-popover more-popover" placement="bottom start" offset={4}>
                <Menu className="menu" aria-label="More" onAction={(key) => !String(key).startsWith("http") && navigate(String(key))}>
                    {groups.map((group, g) => (
                        <MenuSection key={group.title ?? g} className="menu-section">
                            {g > 0 && <Separator className="menu-separator" />}
                            {group.title && <Header className="menu-section-title">{group.title}</Header>}
                            {group.items.map((item) => (
                                <MenuItem key={item.to} id={item.to} className="menu-item" textValue={item.label}
                                    {...(item.external ? { href: item.to, target: "_blank", rel: "noreferrer" } : {})}>
                                    <Icon name={item.icon} size={18} />
                                    <span>
                                        {/* The line under it says how many; the dot is the More button's, marking where they are. */}
                                        <strong>{item.label}{item.to === "/people" && waiting > 0 && <span className="nav-dot menu-dot" aria-hidden />}</strong>
                                        <small>{item.to === "/people" && waiting > 0 ? `${waiting} waiting for approval` : item.sub}</small>
                                    </span>
                                </MenuItem>
                            ))}
                        </MenuSection>
                    ))}
                </Menu>
            </Popover>
        </MenuTrigger>
    );
}

/** The signed-in app (WEB-24): the stadium board across the top on wide screens, a tab bar along the bottom on phones, and the page on the pitch between its touchlines. */
export function Layout({ session }: { session: Session }) {
    const { admin, waiting } = useWaitingCount();
    const setupPending = useMeta().data?.setupPending;
    const { pathname } = useLocation();
    // ADM-5: the first account goes on to set the server up, until it's finished or skipped. The
    // wizard opens the HTTPS guide in a new tab.
    if (admin && setupPending && pathname !== httpsGuide) {
        return <Navigate to="/setup" replace />;
    }
    return (
        <div className="shell">
            <header className="topbar">
                <Link to="/matches" className="wordmark" aria-label="LawFive: go to Matches"><LogoMark />LAW<span>FIVE</span></Link>
                <nav className="topnav" aria-label="Main">
                    {sections.map((s) => (
                        <NavLink key={s.to} to={s.to} className="nav-link"><Icon name={s.icon} />{s.label}</NavLink>
                    ))}
                    <MoreMenu admin={admin} waiting={waiting} />
                </nav>
                <div className="topbar-end">
                    <NavLink to="/settings" className={({ isActive }) => `icon-btn${isActive && !underMore(pathname) ? " active" : ""}`} aria-label="Settings" title="Settings"><Icon name="settings" size={22} /></NavLink>
                    <AccountMenu session={session} />
                </div>
            </header>
            <div className="pitch-frame">
                <span className="frame-corners" aria-hidden />
                <main className="main">
                    {admin && !setupPending && <HttpsNotice />}
                    <PlanNotice />
                    <Outlet />
                </main>
            </div>
            <nav className="tabbar" aria-label="Main">
                {tabs.map((s) => (
                    <NavLink key={s.to} to={s.to} className={({ isActive }) => `nav-link${isActive || (s.to === "/more" && (underMore(pathname) || pathname.startsWith("/settings"))) ? " active" : ""}`}>
                        <span className="tab-icon"><Icon name={s.icon} />{s.to === "/more" && waiting > 0 && <span className="tab-dot" aria-label={`${waiting} waiting for approval`} />}</span>
                        {s.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
