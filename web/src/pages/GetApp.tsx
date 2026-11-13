import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { type AppSignIn, type AppSignInStatus, ApiError, type Session, request, useMeta } from "../api.ts";
import { QrCode } from "../components/QrCode.tsx";
import { Icon, Loading, Logo, PageHead, useNow } from "../components/ui.tsx";
import { useDevices } from "./Devices.tsx";

// Getting the phone app (APP-13, APP-15): where to install it, and a code that signs it in, as a QR
// code and in letters like the watch's. A code lasts two minutes, and a new one takes its place
// while the page is in view, a few times over. The QR code holds this page's address with the code
// in its fragment, so a phone's own camera lands on the page, which then opens the app.

/** Where each store's page will be; until then, "Coming soon". */
const stores = [
    { name: "Google Play", icon: "googlePlay", url: undefined },
    { name: "App Store", icon: "apple", url: undefined },
] as const satisfies readonly { name: string; icon: string; url: string | undefined }[];

/** APP-15: while neither store has it, the apps are in testing, and testers are invited by writing in. */
const inTesting = stores.every((s) => !s.url);
const invitationUrl = "mailto:support@lawfive.app?subject=" + encodeURIComponent("Testing the LawFive app")
    + "&body=" + encodeURIComponent("I'd like to test the LawFive app on my phone (Android or iPhone): ");

/** How many times a new code takes the place of an expired one before asking. */
const maxRenewals = 5;

/** Shown as two groups of four, as on the watch. */
const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4, 8)}`;
const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

export function GetApp({ session }: { session?: Session }) {
    const code = useLocation().hash.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return code.length === 8 || !session ? <OnThePhone code={code} session={session} /> : <SignInCode />;
}

function Stores() {
    return (
        <div className="store-list">
            {stores.map((store) => {
                const inside = (
                    <>
                        <Icon name={store.icon} size={24} />
                        <span><small>{store.url ? "Get it on" : "Coming soon"}</small><b>{store.name}</b></span>
                    </>
                );
                return store.url
                    ? <a key={store.name} className="store-badge" href={store.url}>{inside}</a>
                    : <div key={store.name} className="store-badge soon">{inside}</div>;
            })}
        </div>
    );
}

/** A phone-width window, where the code is for this phone rather than one held up to the screen. */
function usePhoneWidth(): boolean {
    const query = "(max-width: 760px)";
    const [phone, setPhone] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const media = window.matchMedia(query);
        const changed = () => setPhone(media.matches);
        media.addEventListener("change", changed);
        return () => media.removeEventListener("change", changed);
    }, []);
    return phone;
}

/**
 * Signed in: the steps beside the code (APP-15). While the apps are in testing, the code waits for
 * "I have the app", so it doesn't count down for someone who can't use it yet; a phone already signed
 * in shows it at once. On a phone-width screen it leads with Open in the LawFive app and the code in
 * letters, the QR code behind "Using another phone?".
 */
function SignInCode() {
    const client = useQueryClient();
    const [renewal, setRenewal] = useState(0);
    const now = useNow(250);
    const phone = usePhoneWidth();
    const devices = useDevices();
    const hasPhone = devices.data?.some((d) => d.kind === "android" || d.kind === "ios") ?? false;
    const [haveApp, setHaveApp] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const ready = !inTesting || haveApp || hasPhone;
    const made = useQuery({
        queryKey: ["app-sign-in", renewal],
        queryFn: () => request<AppSignIn>("POST", "/app-sign-in", {}),
        enabled: ready,
        gcTime: 0,
        staleTime: Infinity,
        retry: false,
    });
    const code = made.data;
    const status = useQuery({
        queryKey: ["app-sign-in-status", code?.id],
        queryFn: () => request<AppSignInStatus>("GET", `/app-sign-in/${code!.id}`),
        enabled: !!code,
        retry: false,
        gcTime: 0,
        refetchInterval: (query) => (query.state.data?.status === "used" ? false : 2000),
    });
    const used = status.data?.status === "used";
    const secondsLeft = code ? Math.max(0, Math.ceil((Date.parse(code.expiresAt) - now) / 1000)) : 0;
    const expired = !!code && !used && secondsLeft === 0;
    const worn = renewal >= maxRenewals;

    useEffect(() => {
        if (expired && !worn && document.visibilityState === "visible") {
            setRenewal((n) => n + 1);
        }
    }, [expired, worn, now]);
    useEffect(() => {
        if (used) {
            void client.invalidateQueries({ queryKey: ["devices"] });
        }
    }, [used, client]);

    if (used) {
        return (
            <>
                <PageHead title="Get the app" />
                <div className="card link-card">
                    <div className="link-illustration done" aria-hidden><Icon name="check" size={34} /></div>
                    <h2>{status.data?.deviceName ? `Signed in on ${status.data.deviceName}` : "Signed in on your phone"}</h2>
                    <p className="muted">Your matches are on their way to it. It shows in Settings under You, where you can sign it out any time.</p>
                    <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                        <Link to="/settings" className="btn">Settings</Link>
                        <Link to="/matches" className="btn btn-primary">See matches</Link>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            {/* Reached from More, Matches' Get ready and Settings, so it names none of them as the way back. */}
            <PageHead title="Get the app" sub="Your matches, venues and referees on your phone, even with no signal." />
            <div className={`card get-app${phone ? " on-phone" : ""}`}>
                <div className="get-app-steps">
                    <ol>
                        <li>
                            <b>Install LawFive</b>
                            {inTesting && (
                                <span className="get-app-testing">
                                    In testing: <a href={invitationUrl}>ask for an invitation</a>
                                    <span className="muted"> at support@lawfive.app, saying whether it's for Android or an iPhone.</span>
                                </span>
                            )}
                            <Stores />
                        </li>
                        <li>
                            <b>{phone ? "Tap Open in the LawFive app" : "Open it and tap Scan a QR code"}</b>
                            <span className="muted">{phone
                                ? "No password to type. Or in the app, tap Enter a code and type the code and server shown here."
                                : "No password to type. The code tells the app which server and which account."}</span>
                        </li>
                        <li>
                            <b>Check it's you, and you're in</b>
                            <span className="muted">The phone gets a sign-in of its own, which you can end from Settings.</span>
                        </li>
                    </ol>
                </div>
                <div className={`get-app-code${ready ? "" : " waiting"}`}>
                    {inTesting && devices.isPending ? (
                        <div className="qr-holder"><div className="qr-tile qr-waiting"><Loading /></div></div>
                    ) : !ready ? (
                        <div className="get-app-wait">
                            <div className="link-illustration small" aria-hidden><Icon name="qr" size={26} /></div>
                            <p><b>Once LawFive is on your phone</b></p>
                            <p className="muted">A sign-in code shows here. It lasts two minutes, so it waits until you have the app.</p>
                            <button type="button" className="btn btn-primary" onClick={() => setHaveApp(true)}><Icon name="check" />I have the app</button>
                        </div>
                    ) : code ? (
                        <>
                            {phone && <a className="btn btn-primary app-open" href={code.appLink}><Icon name="phone" />Open in the LawFive app</a>}
                            {!phone && code.appLink && <a className="btn btn-primary touch-only" href={code.appLink}><Icon name="phone" />Open in the app</a>}
                            {phone && <TypedCode code={code} first />}
                            {(!phone || showQr) && (
                                <div className={`qr-holder${expired ? " expired" : ""}`} key={code.id}>
                                    <QrCode text={code.link} label={`QR code to sign in to LawFive on a phone. The code is ${formatCode(code.code)}.`} />
                                    {expired && worn && (
                                        <div className="qr-over">
                                            <button className="btn btn-primary" onClick={() => setRenewal(0)}>Show a new code</button>
                                        </div>
                                    )}
                                </div>
                            )}
                            {phone && expired && worn && !showQr && <button className="btn btn-primary" onClick={() => setRenewal(0)}>Show a new code</button>}
                            <div className="qr-clock" role="timer" aria-label={`A new code in ${secondsLeft} seconds`}>
                                <div className="qr-clock-bar"><span style={{ transform: `scaleX(${Math.min(1, (Date.parse(code.expiresAt) - now) / 120_000)})` }} /></div>
                                <span className="qr-clock-time">{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</span>
                            </div>
                            {!phone && <TypedCode code={code} />}
                            {phone && (
                                <button type="button" className="link-button get-app-other" aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>
                                    <Icon name="qr" size={16} />{showQr ? "Hide the QR code" : "Using another phone? Show a QR code"}
                                </button>
                            )}
                        </>
                    ) : made.error ? (
                        <div className="qr-problem">
                            <p className="error">{made.error instanceof ApiError ? made.error.message : "Couldn't make a code."}</p>
                            <button className="btn" onClick={() => void made.refetch()}>Try again</button>
                        </div>
                    ) : (
                        <div className="qr-holder"><div className="qr-tile qr-waiting"><Loading /></div></div>
                    )}
                </div>
            </div>
        </>
    );
}

/** The code in letters with its server, for the app's Enter a code. */
function TypedCode({ code, first }: { code: AppSignIn; first?: boolean }) {
    return (
        <div className="qr-typed">
            <span>{first ? <>Or in the app, tap <b>Enter a code</b>:</> : <>Can't scan? In the app, tap <b>Enter a code</b>:</>}</span>
            <div className="code-display" translate="no">{formatCode(code.code)}</div>
            <span>on the server <code>{hostOf(code.server)}</code></span>
        </div>
    );
}

/**
 * On the phone: where a camera lands from the QR code, signed in or not. It opens the app with the
 * code; without the app, it says where to get it first. Going to /get-app signed out, it has only that.
 */
function OnThePhone({ code, session }: { code: string; session?: Session }) {
    const meta = useMeta();
    const server = meta.data?.apiUrl ?? window.location.origin;
    return (
        <div className="auth-page">
            <div className="card auth-card">
                <Logo />
                {code ? (
                    <>
                        <p className="tagline">Sign in to LawFive on this phone, with no password to type.</p>
                        <a className="btn btn-primary app-open" href={`lawfive://sign-in?server=${encodeURIComponent(server)}&code=${code}`}>
                            <Icon name="phone" />Open in the app
                        </a>
                        <p className="auth-note centered">The code <code>{formatCode(code)}</code> lasts two minutes and works once.</p>
                        <h3 className="app-store-title">Don't have the app yet?</h3>
                    </>
                ) : <p className="tagline">Your matches, venues and referees on your phone, even with no signal.</p>}
                <Stores />
                {code && <p className="auth-note centered">Once it's installed, come back to this page. If the code has run out, show a new one in the web app.</p>}
                {session && <p className="auth-note centered">See how a match runs on the watch before you install: <Link to="/try">Try a match</Link></p>}
                <div className="switch">
                    {session ? <Link to="/matches">Open LawFive on the web</Link> : <>Or use the website: <Link to="/">Sign in</Link></>}
                </div>
            </div>
        </div>
    );
}
