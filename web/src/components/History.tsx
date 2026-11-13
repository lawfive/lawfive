import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatShortDay } from "../format.ts";
import { type Together, describeTogether } from "../history.ts";
import { Slab } from "./Slab.tsx";
import { Icon } from "./ui.tsx";

/** Under a referee's or venue's name: how many matches, and a link to them in the match list. */
export function History({ name, together, where }: { name: string; together?: Together; where: "together" | "here" }) {
    return (
        <>
            {describeTogether(together, where)}
            {together && together.played + together.upcoming > 0 && (
                <> · <Link className="link" to={`/matches?${together.played > 0 ? "show=past&" : ""}q=${encodeURIComponent(name)}`}>See matches</Link></>
            )}
        </>
    );
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

/**
 * WEB-28: how much the user has worked with a referee or at a venue, as figures on a slab cut on the
 * diagonal: matches played (together or here) with the last one, what's coming up, and any `extra`
 * (a venue's pitches), with a way to see them. `aside` goes before the figures (a referee's picture).
 */
export function TogetherFigures({ name, together, where, extra, aside }: {
    name: string;
    together?: Together;
    where: "together" | "here";
    extra?: { label: string; value: string; sub?: string };
    aside?: ReactNode;
}) {
    const played = together?.played ?? 0;
    const upcoming = together?.upcoming ?? 0;
    const figures = [
        { label: "Played", value: String(played), sub: together?.last ? `Last ${formatShortDay(together.last)}` : "None yet" },
        { label: "Coming up", value: String(upcoming), sub: upcoming ? (upcoming === 1 ? "1 match" : `${upcoming} matches`) : "Nothing yet" },
        ...(extra ? [extra] : []),
    ];
    return (
        <Slab title={where === "here" ? "At this venue" : "Working together"} tag={together?.first ? `Since ${monthYear.format(new Date(together.first))}` : undefined}
            cut className={`figures-slab${aside ? " with-aside" : ""}`}>
            <div className="figures-slab-body">
                {aside}
                <dl className="slab-figures">
                    {figures.map((f) => (
                        <div key={f.label} className="slab-cell">
                            <dt className="slab-label">{f.label}</dt>
                            <dd>
                                <p className="slab-figure">{f.value}</p>
                                {f.sub && <span className="slab-caption">{f.sub}</span>}
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>
            {played + upcoming > 0 && (
                <Link className="slab-link" to={`/matches?${played > 0 ? "show=past&" : ""}q=${encodeURIComponent(name)}`}>See matches<Icon name="open" size={16} /></Link>
            )}
        </Slab>
    );
}
