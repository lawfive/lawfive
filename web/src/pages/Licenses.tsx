import type { ReactNode } from "react";
import { useMeta } from "../api.ts";
import { PageHead } from "../components/ui.tsx";
import { SettingsGroup } from "./Settings.tsx";

// Data and licenses (WX-8): the services whose data LawFive shows, with the credit their licenses
// ask for, and the open-source software it's built on. What's listed follows what this server uses.

interface Credit {
    name: string;
    url: string;
    what: ReactNode;
    licence?: { name: string; url: string };
}

const mit = { name: "MIT", url: "https://opensource.org/license/mit" };
const apache = { name: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" };
const odbl = { name: "ODbL", url: "https://opendatacommons.org/licenses/odbl/" };
const ofl = { name: "SIL Open Font License 1.1", url: "https://openfontlicense.org" };

const software: Credit[] = [
    { name: "React", url: "https://react.dev", what: "The web app's interface", licence: mit },
    { name: "React Router", url: "https://reactrouter.com", what: "Pages and links", licence: mit },
    { name: "TanStack Query", url: "https://tanstack.com/query", what: "Loading and caching data", licence: mit },
    { name: "React Aria Components", url: "https://react-spectrum.adobe.com/react-aria/", what: "Accessible menus, pickers and popovers", licence: apache },
    { name: "Leaflet", url: "https://leafletjs.com", what: "Maps", licence: { name: "BSD 2-Clause", url: "https://github.com/Leaflet/Leaflet/blob/main/LICENSE" } },
    { name: "React Leaflet", url: "https://react-leaflet.js.org", what: "Maps in React", licence: { name: "Hippocratic License 2.1", url: "https://firstdonoharm.dev/version/2/1/license/" } },
    { name: "MapLibre GL JS", url: "https://maplibre.org", what: "Drawing vector maps", licence: { name: "BSD 3-Clause", url: "https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt" } },
    { name: "MapLibre GL Leaflet", url: "https://github.com/maplibre/maplibre-gl-leaflet", what: "Vector maps inside Leaflet", licence: { name: "ISC", url: "https://github.com/maplibre/maplibre-gl-leaflet/blob/main/LICENSE" } },
    { name: "Phosphor Icons", url: "https://phosphoricons.com", what: "The icons", licence: mit },
    { name: "Barlow and Barlow Condensed", url: "https://github.com/jpt/barlow", what: "The typeface for text and headings", licence: ofl },
    { name: "JetBrains Mono", url: "https://www.jetbrains.com/lp/mono/", what: "The typeface for codes and addresses", licence: ofl },
    { name: "Fontsource", url: "https://fontsource.org", what: "Packaging the fonts so they're served with the app", licence: mit },
    { name: "read-excel-file", url: "https://gitlab.com/catamphetamine/read-excel-file", what: "Reading Excel files to import matches", licence: mit },
    { name: "Zod", url: "https://zod.dev", what: "Checking data against LawFive's data model", licence: mit },
    { name: "Hono", url: "https://hono.dev", what: "The server", licence: mit },
    { name: "Better Auth", url: "https://better-auth.com", what: "Accounts, sign-in and linking watches", licence: mit },
    { name: "Drizzle ORM", url: "https://orm.drizzle.team", what: "The database", licence: apache },
    { name: "Nodemailer", url: "https://nodemailer.com", what: "Sending email (invitations and approvals)", licence: { name: "MIT-0", url: "https://github.com/nodemailer/nodemailer/blob/master/LICENSE" } },
    { name: "Postgres.js", url: "https://github.com/porsager/postgres", what: "Connecting to PostgreSQL", licence: { name: "Unlicense", url: "https://unlicense.org" } },
];

export function Licenses() {
    const meta = useMeta().data;
    const data: Credit[] = [];
    if (meta?.weather) {
        data.push({
            name: "Open-Meteo",
            url: "https://open-meteo.com",
            what: "Weather forecasts for matches, from national weather services' models",
            licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
        });
    }
    if (meta) {
        const { style } = meta.maps;
        data.push(style ? {
            name: "Map",
            url: style.url.includes("openfreemap.org") ? "https://openfreemap.org" : new URL(style.url).origin,
            what: <Attribution html={style.attribution} />,
            ...(style.url.includes("openfreemap.org") ? { licence: odbl } : {}),
        } : {
            name: "Map",
            url: "https://www.openstreetmap.org/copyright",
            what: <Attribution html={meta.maps.attribution} />,
            ...(meta.maps.tileUrl.includes("openstreetmap.org") ? { licence: odbl } : {}),
        });
        if (meta.maps.satellite?.attribution) {
            data.push({ name: "Satellite imagery", url: meta.maps.satellite.tileUrl.split("/").slice(0, 3).join("/"), what: <Attribution html={meta.maps.satellite.attribution} /> });
        }
    }
    if (meta?.geocoder) {
        const nominatim = meta.geocoder.url.includes("nominatim.openstreetmap.org");
        data.push({
            name: nominatim ? "Nominatim" : new URL(meta.geocoder.url).host,
            url: nominatim ? "https://nominatim.org" : meta.geocoder.url,
            what: "Address search for venues, with data © OpenStreetMap contributors",
            licence: odbl,
        });
    }
    return (
        <>
            <PageHead back={{ to: "/settings", label: "Settings" }} title="Data and licenses" sub="Where LawFive's data comes from, and what it's built with." />
            <SettingsGroup title="Data">
                <CreditList credits={data} />
            </SettingsGroup>
            <SettingsGroup title="LawFive">
                <div className="settings-row">
                    <div>
                        <div className="settings-label">Open source</div>
                        <div className="settings-hint">LawFive is open source, and you can run your own server. The code and its license are at <a className="link" href="https://lawfive.dev" target="_blank" rel="noreferrer">lawfive.dev</a>.</div>
                    </div>
                </div>
            </SettingsGroup>
            <SettingsGroup title="Built with">
                <CreditList credits={software} />
            </SettingsGroup>
        </>
    );
}

function CreditList({ credits }: { credits: Credit[] }) {
    return (
        <ul className="credits">
            {credits.map((c) => (
                <li key={c.name} className="settings-row">
                    <div>
                        <div className="settings-label"><a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></div>
                        <div className="settings-hint">{c.what}</div>
                    </div>
                    {c.licence && <a className="chip" href={c.licence.url} target="_blank" rel="noreferrer">{c.licence.name}</a>}
                </li>
            ))}
        </ul>
    );
}

/** A map provider's credit, which comes as HTML from the server's settings: only its words and web links are shown (SEC-1). */
function Attribution({ html }: { html: string }) {
    const parts = Array.from(new DOMParser().parseFromString(html, "text/html").body.childNodes);
    return (
        <span className="attribution">
            {parts.map((node, i) => {
                const href = node instanceof HTMLAnchorElement ? node.href : "";
                return /^https?:/i.test(href) ? <a key={i} href={href} target="_blank" rel="noreferrer">{node.textContent}</a> : <span key={i}>{node.textContent}</span>;
            })}
        </span>
    );
}
