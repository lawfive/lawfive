import { screenSetup, tryWatchFor } from "@lawfive/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { ApiError, type Session, request } from "../api.ts";
import { Icon, PageHead } from "../components/ui.tsx";
import { useSettings } from "../settings.ts";
import { screenLine } from "./MatchScreenSetup.tsx";

// Linking a watch: the watch shows an eight-character code; typing it here, signed in, and
// confirming gives the watch access to this account (Better Auth device authorization).

/** lawfive.dev's Watches page: which watches, how to install the app, and linking. */
export const watchesHelpUrl = "https://lawfive.dev/apps/watches/";

/** The watch asking, as the code's lookup says: its name, and the app asking to link (`lawfive-garmin`). */
type Asking = { code: string; device?: string; client?: string };
type Step = { name: "enter" } | ({ name: "confirm" } & Asking) | ({ name: "done" } & Asking);

/** Upper case, letters and digits only: "wdjb-mjht" and "WDJB MJHT" both become WDJBMJHT. */
export function normaliseCode(text: string): string {
    return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Shown as two groups of four, as on the watch. */
function formatCode(code: string): string {
    return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4, 8)}` : code;
}

function problem(error: unknown): string {
    if (error instanceof ApiError) {
        const body = error.body as { error?: string };
        if (body.error === "expired_token") {
            return "That code has expired. On the watch, choose Link account again for a new one.";
        }
        if (body.error === "invalid_request" || error.status === 400) {
            return "That code doesn't match a watch waiting to link. Check the code on the watch and try again.";
        }
    }
    return "Something went wrong. Try again in a moment.";
}

export function LinkWatch({ session }: { session: Session }) {
    const [params] = useSearchParams();
    // ?user_code= is the server's own link (verification_uri_complete), for a QR code on the watch later.
    const [code, setCode] = useState(normaliseCode(params.get("user_code") ?? params.get("code") ?? ""));
    const [step, setStep] = useState<Step>({ name: "enter" });
    const [error, setError] = useState<string>();
    const [busy, setBusy] = useState(false);
    const client = useQueryClient();

    const run = async (task: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await task();
        } catch (e) {
            setError(problem(e));
        } finally {
            setBusy(false);
        }
    };
    const check = () => run(async () => {
        const status = await request<{ status: string; device_name?: string; client_id?: string }>("GET", `/auth/device?user_code=${code}`);
        if (status.status !== "pending") {
            throw new ApiError(400, { error: "invalid_request" });
        }
        // The watch says which it is, from versions that send it.
        setStep({ name: "confirm", code, device: status.device_name, client: status.client_id });
    });
    const approve = (asking: Asking) => run(async () => {
        await request("POST", "/auth/device/approve", { userCode: asking.code });
        await client.invalidateQueries({ queryKey: ["devices"] });
        setStep({ name: "done", code: asking.code, device: asking.device, client: asking.client });
    });
    const deny = (userCode: string) => run(async () => {
        await request("POST", "/auth/device/deny", { userCode });
        setCode("");
        setStep({ name: "enter" });
    });

    return (
        <>
            {/* Reached from More, Matches' Get ready and Settings, so it names none of them as the way back. */}
            <PageHead title="Link a watch" />
            <div className="card link-card">
                {step.name === "enter" && (
                    <form onSubmit={(e) => { e.preventDefault(); void check(); }}>
                        <div className="link-illustration" aria-hidden><Icon name="watch" size={34} /></div>
                        <h2>Enter the code from your watch</h2>
                        {/* SYNC-1: the way to the code on every watch, in the watches' own words. */}
                        <p className="muted">On your watch, open LawFive and go to <b>Settings → Account → Link account</b>. On a Garmin, then choose <b>Get a code</b>. The watch shows an eight-character code.</p>
                        <input className="input code-input" value={formatCode(code)} autoFocus autoComplete="off" autoCapitalize="characters" spellCheck={false}
                            aria-label="Code from the watch" placeholder="XXXX-XXXX" maxLength={9}
                            onChange={(e) => setCode(normaliseCode(e.target.value).slice(0, 8))} />
                        {error && <p className="error">{error}</p>}
                        <button className="btn btn-primary" disabled={code.length !== 8 || busy}>{busy ? "Checking…" : "Continue"}</button>
                        <p className="muted link-get-app">Don't have LawFive on your watch yet? <a href={watchesHelpUrl} target="_blank" rel="noreferrer">How to get it</a></p>
                    </form>
                )}
                {step.name === "confirm" && (
                    <div>
                        <div className="link-illustration" aria-hidden><Icon name="watch" size={34} /></div>
                        <h2>Link {step.device ? `this ${step.device}` : "this watch"} to your account?</h2>
                        <p className="muted">
                            The {step.device ?? "watch"} showing <b className="code-text">{formatCode(step.code)}</b> will be able to download your upcoming matches
                            and upload the ones you referee, as <b>{session.user.email}</b>. You can unlink it any time in Settings, under Your watch.
                        </p>
                        {error && <p className="error">{error}</p>}
                        <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                            <button className="btn" disabled={busy} onClick={() => void deny(step.code)}>Don't link</button>
                            <button className="btn btn-primary" disabled={busy} onClick={() => void approve(step)}>Link watch</button>
                        </div>
                    </div>
                )}
                {step.name === "done" && <Linked device={step.device} client={step.client} />}
            </div>
        </>
    );
}

/**
 * SYNC-15: what next, once a watch is linked: what it does now for its kind (only a Garmin syncs through the
 * phone, APP-7), the match screen with Set it up, and Try a match on that watch (DEMO-9).
 */
function Linked({ device, client }: { device?: string; client?: string }) {
    const { settings } = useSettings();
    const watch = tryWatchFor(client, device);
    const name = device ?? "watch";
    return (
        <div>
            <div className="link-illustration done" aria-hidden><Icon name="check" size={34} /></div>
            <h2>{device ? `${device} is linked` : "Your watch is linked"}</h2>
            <p className="muted">
                {watch === "garmin" || watch === "venu"
                    ? "It's downloading your next matches. It syncs through your phone, with the LawFive app or Garmin Connect, so keep it nearby."
                    : "It's downloading your next matches. It syncs on its own whenever it's online, so a match you finish with no signal goes up once it's back."}
            </p>
            <h3 className="link-next-head">Next</h3>
            <div className="link-next">
                <div className="list-row">
                    <div className="avatar"><Icon name="watch" size={18} /></div>
                    <div className="grow">
                        <div className="title">Your match screen</div>
                        <div className="sub">{screenLine(screenSetup(settings.watchScreen)).replace(/^./, (c) => c.toUpperCase())}</div>
                    </div>
                    <RouterLink to="/settings/match-screen" className="btn">Set it up</RouterLink>
                </div>
                <div className="list-row">
                    <div className="avatar"><Icon name="play" size={18} /></div>
                    <div className="grow">
                        <div className="title">Try a match on your {name}</div>
                        <div className="sub">See how a match runs on it, with your match screen. Nothing is saved.</div>
                    </div>
                    <RouterLink to={`/try?watch=${watch}`} className="btn">Try it</RouterLink>
                </div>
            </div>
            <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
                <RouterLink to="/matches" className="btn btn-primary">Done</RouterLink>
            </div>
        </div>
    );
}
