import { HttpsRow } from "../components/HttpsNotice.tsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { type NetworkView, type ServerSetting, request, useAccount, useMeta, useServerSettings } from "../api.ts";
import { Field, Icon, Loading, PageHead, Toggle } from "../components/ui.tsx";

// Settings → Server (ADM-1 to ADM-4), for admins: email, maps, address search, weather and
// webhooks, with plans on their own page (PLAN-1), so a self-hosted server is set up here rather than in its environment. A setting the
// environment sets is shown, fixed there; secrets are never sent back, only whether they're set.
// Each section saves on its own and takes effect straight away.

type Draft = Record<string, string | null>;

export function ServerSettings() {
    const account = useAccount();
    const settings = useServerSettings(account.data?.admin ?? false);
    if (account.data && !account.data.admin) {
        return <><PageHead back={{ to: "/settings", label: "Settings" }} title="Server" /><div className="card"><div className="empty">Only admins can change the server's settings.</div></div></>;
    }
    if (!settings.data) {
        return <Loading />;
    }
    const byKey = new Map(settings.data.map((s) => [s.key, s]));
    const s = (key: string) => byKey.get(key)!;
    const host = window.location.hostname;
    return (
        <>
            <PageHead back={{ to: "/settings", label: "Settings" }} title="Server"
                sub="For everyone on this server. A setting in the server's environment is shown here, fixed there." />
            <div className="stack">
                <div className="card settings-card-row"><HttpsRow /></div>
                <Section title="Email" intro="For invitations, approvals and forgotten passwords. Without it, admins send invitation and reset links themselves."
                    settings={[s("smtpUrl"), s("mailFrom")]} extra={<TestEmail />}>
                    {(draft, set) => (
                        <>
                            <SettingField setting={s("smtpUrl")} label="SMTP server" wide draft={draft} set={set}
                                placeholder="smtps://user:password@smtp.example.com:465"
                                info="smtp://…:587 (STARTTLS) or smtps://…:465, with the account's user name and password. Most email services offer SMTP (Postmark, Resend, Mailgun, Gmail with an app password)." />
                            <SettingField setting={s("mailFrom")} label="Sent from" wide draft={draft} set={set} placeholder={`LawFive <lawfive@${host}>`} />
                        </>
                    )}
                </Section>
                <TestPush />

                <Section title="Maps" intro="The map on venues and match tracks. OpenFreeMap's vector map by default (free, no key), with OpenStreetMap's tiles for apps that need them."
                    settings={["mapStyleUrl", "mapStyleDarkUrl", "mapStyleAttribution", "mapTileUrl", "mapAttribution", "mapSatelliteUrl", "mapSatelliteAttribution"].map(s)}>
                    {(draft, set) => (
                        <>
                            <SettingField setting={s("mapStyleUrl")} label="Map style" wide draft={draft} set={set} placeholder="https://tiles.openfreemap.org/styles/liberty" info="A MapLibre style, or off for the tiles below." />
                            <SettingField setting={s("mapStyleDarkUrl")} label="Dark style" wide draft={draft} set={set} placeholder="https://tiles.openfreemap.org/styles/dark" />
                            <SettingField setting={s("mapStyleAttribution")} label="Style credit" wide draft={draft} set={set} placeholder="OpenFreeMap © OpenMapTiles Data from OpenStreetMap" info="The credit the provider asks for, as HTML." />
                            <SettingField setting={s("mapTileUrl")} label="Tiles" wide draft={draft} set={set} placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png" info="Raster tiles, with {z}, {x} and {y}: the map when the style is off, and for apps that can't draw vector maps. A busy server should use a tile provider." />
                            <SettingField setting={s("mapAttribution")} label="Tiles credit" wide draft={draft} set={set} placeholder="© OpenStreetMap contributors" />
                            <SettingField setting={s("mapSatelliteUrl")} label="Satellite" wide draft={draft} set={set} placeholder="https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=…"
                                info="A second layer on venue maps, which makes placing pitches much easier. Providers need a key: MapTiler's free tier, for example." />
                            <SettingField setting={s("mapSatelliteAttribution")} label="Satellite credit" wide draft={draft} set={set} placeholder="© MapTiler © OpenStreetMap contributors" />
                        </>
                    )}
                </Section>

                <Section title="Address search" intro="Find on map, for placing venues. OpenStreetMap's Nominatim by default, which suits a personal server." settings={[s("geocoderUrl")]}>
                    {(draft, set) => (
                        <SettingField setting={s("geocoderUrl")} label="Search service" wide draft={draft} set={set} placeholder="https://nominatim.openstreetmap.org" info="A Nominatim-compatible service, or off." />
                    )}
                </Section>

                <Section title="Weather" intro="Forecasts for matches, and the weather past matches were played in, from Open-Meteo. Its free service needs no key and is for non-commercial use."
                    settings={["weatherUrl", "weatherHistoryUrl", "weatherApiKey", "weatherDailyLimit"].map(s)}>
                    {(draft, set) => (
                        <>
                            <SettingField setting={s("weatherUrl")} label="Forecasts" wide draft={draft} set={set} placeholder="https://api.open-meteo.com" info="An Open-Meteo-compatible service, or off for no weather. A paid plan uses https://customer-api.open-meteo.com." />
                            <SettingField setting={s("weatherHistoryUrl")} label="Past weather" wide draft={draft} set={set} placeholder="https://archive-api.open-meteo.com" info="For played matches that have no weather kept (imported ones), or off." />
                            <SettingField setting={s("weatherApiKey")} label="API key" draft={draft} set={set} placeholder="For a paid plan" />
                            <SettingField setting={s("weatherDailyLimit")} label="Calls a day, at most" draft={draft} set={set} placeholder="5000" info="The free service allows 10,000." />
                        </>
                    )}
                </Section>

                <div className="card">
                    <Link to="/settings/server/plans" className="settings-row settings-link">
                        <div>
                            <div className="settings-label">Plans</div>
                            <div className="settings-hint">What each account may use: matches, storage, watches and phones, notifications, API keys and webhooks; and trials of a bigger plan.</div>
                        </div>
                        <Icon name="back" size={16} />
                    </Link>
                </div>

                <Section title="Webhooks" intro="Webhooks can't reach private or local addresses unless this is on, so nobody can use them to reach into the server's network." settings={[s("webhookAllowPrivate")]}>
                    {(draft, set) => {
                        const setting = s("webhookAllowPrivate");
                        const value = setting.key in draft ? draft[setting.key] : setting.value;
                        return (
                            <div className="field wide">
                                <Toggle label="Let webhooks reach addresses on this server's network" checked={value === "true"} disabled={setting.source === "environment"}
                                    onChange={(on) => set(setting.key, on ? "true" : null)} />
                                {setting.source === "environment" && <FixedNote setting={setting} />}
                            </div>
                        );
                    }}
                </Section>
                <Visitors />
            </div>
        </>
    );
}

/** Addresses from private networks, which a visitor on the internet never has: a proxy's. */
const privateLooking = (ip: string) => /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|::ffff:(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.)/i.test(ip);

/** SEC-14: how the server tells visitors apart, for its limits on wrong passwords; set in its environment only. */
function Visitors() {
    const network = useQuery({ queryKey: ["server-network"], queryFn: () => request<NetworkView>("GET", "/server-settings/network") });
    if (!network.data) {
        return null;
    }
    const { yourAddress, trustedProxies, trustedIpHeader } = network.data;
    const proxyNotBelieved = privateLooking(yourAddress) && window.location.hostname !== "localhost";
    return (
        <div className="card form-section">
            <h2>Visitors' addresses</h2>
            <p className="muted" style={{ marginTop: -6 }}>Limits on wrong passwords and codes count each visitor by their address. Behind a proxy, the server believes what it says about the visitor only when it's listed in <code>TRUSTED_PROXIES</code>, in the server's environment.</p>
            <dl className="facts-list">
                <dt>This server sees you as</dt>
                <dd><code>{yourAddress}</code></dd>
                <dt>Proxies believed</dt>
                <dd>{trustedProxies.length ? trustedProxies.map((p, i) => <span key={p}>{i > 0 && ", "}<code>{p}</code></span>) : "None: TRUSTED_PROXIES is empty"}{trustedIpHeader && <>, then <code>{trustedIpHeader}</code></>}</dd>
            </dl>
            {proxyNotBelieved && (
                <p className="photo-notice">
                    <Icon name="info" size={16} />
                    <span>That looks like a proxy's address, not yours, so everyone may be sharing one limit. Add your proxy's network to <code>TRUSTED_PROXIES</code>, for example <code>172.18.0.0/16</code>, or <code>private</code> for any private network, and restart the server. <a className="link" href="https://lawfive.dev/run/settings/" target="_blank" rel="noreferrer">How</a></span>
                </p>
            )}
        </div>
    );
}

/** A card of settings with its own Save, which sends only what changed. */
function Section({ title, intro, settings, extra, children }: {
    title: string;
    intro: string;
    settings: ServerSetting[];
    extra?: ReactNode;
    children: (draft: Draft, set: (key: string, value: string | null) => void) => ReactNode;
}) {
    const client = useQueryClient();
    const [draft, setDraft] = useState<Draft>({});
    const [saved, setSaved] = useState(false);
    const save = useMutation({
        mutationFn: (changes: Draft) => request<{ settings: ServerSetting[] }>("PUT", "/server-settings", changes),
        onSuccess: (answer) => {
            client.setQueryData(["server-settings"], answer.settings);
            void client.invalidateQueries({ queryKey: ["meta"] });
            setDraft({});
            setSaved(true);
        },
    });
    const changed = Object.keys(draft).length > 0;
    const allFixed = settings.every((s) => s.source === "environment");
    return (
        <form className="card form-section" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <h2>{title}</h2>
            <p className="muted" style={{ marginTop: -6 }}>{intro}</p>
            <div className="fields">{children(draft, (key, value) => { setSaved(false); setDraft({ ...draft, [key]: value }); })}</div>
            {!allFixed && (
                <div className="row server-settings-actions">
                    {extra}
                    <span className="grow" />
                    {save.error ? <span className="error">{save.error.message}</span> : saved && !changed && <span className="muted"><Icon name="check" size={15} /> Saved</span>}
                    {changed && <button type="button" className="btn btn-ghost" onClick={() => setDraft({})}>Undo</button>}
                    <button type="submit" className="btn btn-primary" disabled={!changed || save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
                </div>
            )}
            {allFixed && extra && <div className="row server-settings-actions">{extra}</div>}
        </form>
    );
}

/** One setting: its value (or, for a secret, whether it's set), fixed when the environment sets it. */
export function SettingField({ setting, label, info, placeholder, wide, draft, set }: {
    setting: ServerSetting;
    label: string;
    info?: string;
    placeholder?: string;
    wide?: boolean;
    draft: Draft;
    set: (key: string, value: string | null) => void;
}) {
    const fixed = setting.source === "environment";
    const editing = setting.key in draft;
    const value = editing ? draft[setting.key] ?? "" : setting.secret ? "" : setting.value ?? "";
    return (
        <Field label={label} info={info} wide={wide}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
                <input className="input grow setting-input" value={value} readOnly={fixed}
                    type={setting.secret ? "password" : "text"} autoComplete="off" spellCheck={false}
                    placeholder={setting.secret && setting.set && !editing ? "Set: type to replace" : placeholder}
                    onChange={(e) => set(setting.key, e.target.value)} />
                {setting.secret && setting.set && !fixed && !editing && (
                    <button type="button" className="btn btn-ghost" onClick={() => set(setting.key, null)}>Clear</button>
                )}
            </div>
            {fixed ? <FixedNote setting={setting} /> : editing && draft[setting.key] === null && <small className="muted">Cleared when you save.</small>}
        </Field>
    );
}

function FixedNote({ setting }: { setting: ServerSetting }) {
    return <small className="muted">Set by <code>{setting.env}</code> on the server, so it's changed there.</small>;
}

/** PUSH-6: does a notification reach a phone? To the admin's own, and why not if it doesn't. */
function TestPush() {
    const meta = useMeta();
    const send = useMutation({ mutationFn: () => request<{ sent: number }>("POST", "/server-settings/test-push", {}) });
    if (!meta.data?.capabilities.includes("push")) {
        return null;
    }
    return (
        <div className="card form-section">
            <h2>Notifications</h2>
            <p className="muted" style={{ marginTop: -6 }}>Phones get notifications through LawFive's push relay, which sees no match details. To try it, turn on Tell me about weather risks in the Android app, then send one to your own phones.</p>
            <div className="row">
                <button type="button" className="btn" disabled={send.isPending} onClick={() => send.mutate()}><Icon name="bell" />{send.isPending ? "Sending…" : "Send a test notification"}</button>
                {send.data && <span className="muted">Sent to {send.data.sent === 1 ? "your phone" : `${send.data.sent} phones`}</span>}
                {send.error && <span className="error">{send.error.message}</span>}
            </div>
        </div>
    );
}

/** ADM-4: Send a test email, to the admin asking. */
function TestEmail() {
    const send = useMutation({ mutationFn: () => request<{ to: string }>("POST", "/server-settings/test-email", {}) });
    return (
        <>
            <button type="button" className="btn" disabled={send.isPending} onClick={() => send.mutate()}><Icon name="mail" />{send.isPending ? "Sending…" : "Send a test email"}</button>
            {send.data && <span className="muted">Sent to {send.data.to}</span>}
            {send.error && <span className="error">{send.error.message}</span>}
        </>
    );
}
