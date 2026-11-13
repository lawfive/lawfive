import { useState } from "react";
import { Link } from "react-router";
import { useMeta } from "../api.ts";
import { Icon } from "./ui.tsx";

// ADM-6: telling whoever runs the server that it isn't on HTTPS, and where the guide is.

export const httpsGuide = "/settings/server/https";

const hiddenKey = "lawfive.httpsNoticeHidden";

/** Whether this page and PUBLIC_URL are both HTTPS; undefined until the server has said. */
export function useHttps() {
    const address = useMeta().data?.publicUrl;
    if (!address) {
        return undefined;
    }
    const { protocol, hostname } = window.location;
    return {
        address,
        secure: protocol === "https:" && address.startsWith("https://"),
        // A connection that's HTTPS to a server that doesn't know it: links it sends out would be wrong.
        addressOnly: protocol === "https:" && !address.startsWith("https://"),
        local: ["localhost", "127.0.0.1", "[::1]"].includes(hostname),
    };
}

/** Across the top of every page for admins, until it's fixed or hidden on this browser. */
export function HttpsNotice() {
    const https = useHttps();
    const [hidden, setHidden] = useState(() => {
        try {
            return localStorage.getItem(hiddenKey) === "true";
        } catch {
            return false;
        }
    });
    if (!https || https.secure || hidden || window.location.pathname === httpsGuide) {
        return null;
    }
    const hide = () => {
        setHidden(true);
        try {
            localStorage.setItem(hiddenKey, "true");
        } catch {
            // Storage can be unavailable (private windows); it just comes back next time.
        }
    };
    return (
        <div className="https-notice" role="status">
            <Icon name="info" size={18} />
            <div className="grow">
                <strong>{https.addressOnly ? "This server's address isn't HTTPS." : "This server isn't using HTTPS."}</strong>{" "}
                {https.addressOnly
                    ? "PUBLIC_URL still starts http://, so links and QR codes it makes are wrong."
                    : https.local
                        ? "That's fine for trying it out here, but Garmin watches and the store versions of the phone apps need it."
                        : "Passwords and matches travel unprotected, and Garmin watches and the store versions of the phone apps need it."}
            </div>
            <Link to={httpsGuide} className="btn btn-sm">Set up HTTPS</Link>
            <button type="button" className="icon-btn" aria-label="Hide this on this browser" title="Hide this on this browser" onClick={hide}><Icon name="close" size={16} /></button>
        </div>
    );
}

/** The same in Settings, where it stays once the notice is hidden. */
export function HttpsRow() {
    const https = useHttps();
    if (!https) {
        return null;
    }
    return (
        <Link to={httpsGuide} className="settings-row settings-link">
            <div>
                <div className="settings-label">HTTPS</div>
                <div className={`settings-hint https-state ${https.secure ? "ok" : "warn"}`}>
                    <Icon name={https.secure ? "check" : "info"} size={15} />
                    {https.secure ? "On, with a guide if it ever needs changing." : "Not set up. Here's how."}
                </div>
            </div>
            <Icon name="back" size={16} />
        </Link>
    );
}
