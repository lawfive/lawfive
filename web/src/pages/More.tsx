import { Link } from "react-router";
import { useSession } from "../api.ts";
import { AccountBlock, type MoreItem, moreGroups, useWaitingCount } from "../components/Layout.tsx";
import { Icon, PageHead } from "../components/ui.tsx";

// The phone tab bar has room for four places and More (WEB-31); the rest are here, in the board's
// More menu's groups, with Settings (the gear on the board) among them.

const settings: MoreItem = { to: "/settings", label: "Settings", sub: "Units, your watch, calendars and your account", icon: "settings" };

export function More() {
    const { admin, waiting } = useWaitingCount();
    const session = useSession();
    // Settings sits with the places of their own, as the board's gear does beside them.
    const groups = moreGroups.filter((g) => !g.admin || admin).map((g, i) => (i === 0 ? { ...g, items: [...g.items, settings] } : g));
    return (
        <>
            <PageHead title="More" hero />
            {session.data && <div className="board more-account"><AccountBlock session={session.data} /></div>}
            {groups.map((group, i) => (
                <section key={group.title ?? i} className="settings-group more-group" aria-label={group.title}>
                    {group.title && <h3>{group.title}</h3>}
                    <div className="card">
                        {group.items.map((item) => <MoreRow key={item.to} item={item} waiting={item.to === "/people" ? waiting : 0} />)}
                    </div>
                </section>
            ))}
        </>
    );
}

function MoreRow({ item, waiting }: { item: MoreItem; waiting: number }) {
    const inside = (
        <>
            <div className="avatar"><Icon name={item.icon} size={18} /></div>
            <div className="grow">
                <div className="title">{item.label}</div>
                <div className="sub">{waiting > 0 ? `${waiting} waiting for approval` : item.sub}</div>
            </div>
            {waiting > 0 && <span className="count-badge">{waiting}</span>}
            {item.external
                ? <span className="muted" style={{ display: "inline-flex" }}><Icon name="link" size={18} /></span>
                : <span className="muted" style={{ transform: "rotate(-90deg)", display: "inline-flex" }}><Icon name="chevron" size={18} /></span>}
        </>
    );
    return item.external
        ? <a href={item.to} target="_blank" rel="noreferrer" className="list-row">{inside}</a>
        : <Link to={item.to} className="list-row">{inside}</Link>;
}
