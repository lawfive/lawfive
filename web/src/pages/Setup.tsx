import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { type ServerSetting, request, useMeta, useServerSettings, useSignIn } from "../api.ts";
import { httpsGuide } from "../components/HttpsNotice.tsx";
import { Icon, Loading, Logo, Toggle, useTabTitle } from "../components/ui.tsx";
import { SettingField } from "./ServerSettings.tsx";

// Setting a new server up (ADM-5): the code from its logs and the first account, then its address,
// who can join, email, and maps and weather, each changeable later in Settings → Server. Anything
// the environment sets shows fixed, as there. Every step after the account can be skipped, and
// the wizard comes back on the next visit until it's finished or skipped.

type Draft = Record<string, string | null>;

function Steps({ now, total }: { now: number; total: number }) {
    return (
        <div className="setup-progress">
            <span className="muted">Step {now} of {total}</span>
            <div className="quiz-track" style={{ "--n": total } as CSSProperties} aria-hidden>
                {Array.from({ length: total }, (_, i) => <span key={i} className={i < now - 1 ? "right" : i === now - 1 ? "now" : ""} />)}
            </div>
        </div>
    );
}

function Shell({ children, now, total }: { children: ReactNode; now: number; total: number }) {
    useTabTitle("Set up");
    return (
        <div className="auth-page">
            <div className="card setup-card">
                <Logo />
                <Steps now={now} total={total} />
                <div key={now} className="setup-step">{children}</div>
            </div>
        </div>
    );
}

const allSteps = 7;

/** Before there's an account: the code, if the server wants one, then the account. */
export function SetupFirstAccount({ codeNeeded }: { codeNeeded: boolean }) {
    const [code, setCode] = useState("");
    const [codeOk, setCodeOk] = useState(!codeNeeded);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const signIn = useSignIn();
    const check = useMutation({
        mutationFn: () => request("POST", "/setup/check", { code }),
        onSuccess: () => setCodeOk(true),
    });
    if (!codeOk) {
        return (
            <Shell now={1} total={allSteps}>
                <h1>Welcome to your new server</h1>
                <p className="muted">This takes a few minutes, and you can change all of it later. First, prove it's yours: the server wrote a setup code to its logs when it started.</p>
                <pre className="setup-command"><code>docker compose logs server</code></pre>
                <form onSubmit={(e) => { e.preventDefault(); check.mutate(); }}>
                    <label className="field"><span>Setup code</span>
                        <input className="input setting-input setup-code" value={code} autoFocus autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value.toUpperCase())} />
                    </label>
                    {check.error && <p className="error">{check.error.message}</p>}
                    <div className="setup-actions"><span className="grow" /><button className="btn btn-primary" disabled={!code.trim() || check.isPending}>{check.isPending ? "Checking…" : "Continue"}</button></div>
                </form>
            </Shell>
        );
    }
    const create = (e: FormEvent) => {
        e.preventDefault();
        signIn.mutate({ mode: "signUp", name, email, password, ...(codeNeeded ? { setupCode: code } : {}) });
    };
    return (
        <Shell now={2} total={allSteps}>
            <h1>Your admin account</h1>
            <p className="muted">{codeNeeded ? "This account runs the server: it invites people, approves them and changes these settings." : "This account runs the server. Use an address listed in ADMIN_EMAILS."}</p>
            <form onSubmit={create}>
                <label className="field"><span>Name</span><input className="input" value={name} autoFocus autoComplete="name" required onChange={(e) => setName(e.target.value)} /></label>
                <label className="field"><span>Email</span><input className="input" type="email" value={email} autoComplete="email" required onChange={(e) => setEmail(e.target.value)} /></label>
                <label className="field"><span>Password</span><input className="input" type="password" value={password} autoComplete="new-password" required minLength={8} onChange={(e) => setPassword(e.target.value)} /></label>
                {signIn.error && <p className="error">{signIn.error.message}</p>}
                <div className="setup-actions"><span className="grow" /><button className="btn btn-primary" disabled={signIn.isPending}>{signIn.isPending ? "Making it…" : "Make my account"}</button></div>
            </form>
        </Shell>
    );
}

/** After the account: the rest of the server, opened by Layout until it's finished or skipped. */
export function SetupWizard() {
    const settings = useServerSettings(true);
    const meta = useMeta().data;
    const client = useQueryClient();
    const navigate = useNavigate();
    const [step, setStep] = useState(3);
    const [draft, setDraft] = useState<Draft>({});
    const finish = useMutation({
        mutationFn: (_to: string) => request("POST", "/setup/finish"),
        onSuccess: async (_answer, to) => {
            await client.invalidateQueries({ queryKey: ["meta"] });
            navigate(to, { replace: true });
        },
    });
    const save = useMutation({
        mutationFn: async () => {
            if (Object.keys(draft).length > 0) {
                const answer = await request<{ settings: ServerSetting[] }>("PUT", "/server-settings", draft);
                client.setQueryData(["server-settings"], answer.settings);
            }
        },
        onSuccess: () => {
            setDraft({});
            void client.invalidateQueries({ queryKey: ["meta"] });
            setStep((s) => s + 1);
        },
    });
    const test = useMutation({ mutationFn: () => request<{ to: string }>("POST", "/server-settings/test-email") });
    if (!settings.data) {
        return <div className="auth-page"><Loading /></div>;
    }
    const byKey = new Map(settings.data.map((s) => [s.key, s]));
    const s = (key: string) => byKey.get(key)!;
    const set = (key: string, value: string | null) => setDraft({ ...draft, [key]: value });
    const valueOf = (key: string) => (key in draft ? draft[key] : s(key).value);
    const footer = (
        <div className="setup-actions">
            {step > 3 && <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}><Icon name="back" size={16} />Back</button>}
            <span className="grow" />
            <button type="button" className="btn btn-ghost" disabled={finish.isPending} onClick={() => finish.mutate("/matches")}>Skip the rest</button>
            <button type="button" className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Continue"}</button>
        </div>
    );
    const error = (save.error ?? finish.error) && <p className="error">{(save.error ?? finish.error)!.message}</p>;

    if (step === 3) {
        const here = window.location.origin;
        const address = meta?.publicUrl ?? here;
        const secure = address.startsWith("https://");
        const same = address.replace(/\/$/, "") === here;
        return (
            <Shell now={3} total={allSteps}>
                <h1>Your server's address</h1>
                <p className="muted">Apps and emails use this address. It's set by <code>PUBLIC_URL</code> on the server, and changing it means restarting the server.</p>
                <div className="key-reveal setup-address"><code>{address}</code></div>
                <ul className="setup-checks">
                    <li className={same ? "ok" : "warn"}><Icon name={same ? "check" : "info"} size={16} />{same ? "You're using this address now." : `You're at ${here}, which isn't it. Links in emails and QR codes will go to the address above.`}</li>
                    <li className={secure ? "ok" : "warn"}><Icon name={secure ? "check" : "info"} size={16} /><span>{secure ? "It's HTTPS, which the watches and phones need." : "It isn't HTTPS. That's fine for trying this out on your own network, but Garmin watches and release builds of the phone apps need HTTPS with a valid certificate."}{!secure && <>{" "}<a href={httpsGuide} target="_blank" rel="noreferrer">How to set it up</a></>}</span></li>
                </ul>
                {error}{footer}
            </Shell>
        );
    }
    if (step === 4) {
        const fixed = s("signUp").source === "environment";
        const mode = valueOf("signUp") ?? "closed";
        const modes = [
            ["closed", "Only people you invite", "Nobody can sign up without an invitation. The safest for a server on the internet."],
            ["approval", "New accounts need approval", "People can sign up, and wait until you approve them."],
            ["open", "Anyone can sign up", "New accounts can be used straight away."],
        ] as const;
        return (
            <Shell now={4} total={allSteps}>
                <h1>Who can join?</h1>
                <p className="muted">You can change this any time on the People page.</p>
                <div className="setup-choices" role="radiogroup" aria-label="Who can join">
                    {modes.map(([value, title, hint]) => (
                        <button key={value} type="button" role="radio" aria-checked={mode === value} disabled={fixed} className={`quiz-level${mode === value ? " on" : ""}`} onClick={() => set("signUp", value)}>
                            <strong className="setup-choice-title">{title}</strong>
                            <span className="muted">{hint}</span>
                        </button>
                    ))}
                </div>
                {fixed && <p className="muted">Set by <code>SIGN_UP</code> on the server.</p>}
                {error}{footer}
            </Shell>
        );
    }
    if (step === 5) {
        return (
            <Shell now={5} total={allSteps}>
                <h1>Email</h1>
                <p className="muted">For invitations, approvals and forgotten passwords. It's optional: without it, you copy those links and send them yourself.</p>
                <div className="fields setup-fields">
                    <SettingField setting={s("smtpUrl")} label="SMTP server" wide draft={draft} set={set} placeholder="smtps://user:password@smtp.example.com:465"
                        info="smtp://…:587 (STARTTLS) or smtps://…:465, with the account's user name and password." />
                    <SettingField setting={s("mailFrom")} label="Sent from" wide draft={draft} set={set} placeholder="LawFive <lawfive@example.com>" />
                </div>
                {s("smtpUrl").set && (
                    <p className="setup-test">
                        <button type="button" className="btn" disabled={test.isPending} onClick={() => test.mutate()}><Icon name="mail" />{test.isPending ? "Sending…" : "Send a test email"}</button>
                        {test.data && <span className="muted">Sent to {test.data.to}.</span>}
                        {test.error && <span className="error">{test.error.message}</span>}
                    </p>
                )}
                {error}{footer}
            </Shell>
        );
    }
    if (step === 6) {
        const on = (key: string) => valueOf(key) !== "off";
        return (
            <Shell now={6} total={allSteps}>
                <h1>Maps and weather</h1>
                <p className="muted">These work with no accounts or keys, using free public services. Your server asks them on people's behalf, sending the addresses and places it looks up.</p>
                <div className="setup-toggles">
                    <Toggle label="Address search on venues (OpenStreetMap's Nominatim)" checked={on("geocoderUrl")} disabled={s("geocoderUrl").source === "environment"} onChange={(v) => set("geocoderUrl", v ? null : "off")} />
                    <Toggle label="Weather for matches (Open-Meteo, free for non-commercial use)" checked={on("weatherUrl")} disabled={s("weatherUrl").source === "environment"} onChange={(v) => set("weatherUrl", v ? null : "off")} />
                </div>
                <div className="fields setup-fields">
                    <SettingField setting={s("mapSatelliteUrl")} label="Satellite imagery (optional)" wide draft={draft} set={set} placeholder="https://api.maptiler.com/…?key=…"
                        info="Adds a satellite layer to maps, which makes placing pitches much easier. Providers need a key; see .env.example." />
                </div>
                {error}{footer}
            </Shell>
        );
    }
    return (
        <Shell now={7} total={allSteps}>
            <h1>You're ready</h1>
            <p className="muted">Everything here is in Settings → Server, with plans for what each account may use, and who's on the server is on People. A few good next steps:</p>
            <div className="setup-next">
                <Link to="/get-app" className="list-row" onClick={(e) => { e.preventDefault(); finish.mutate("/get-app"); }}><div className="avatar"><Icon name="phone" size={18} /></div><div className="grow"><div className="title">Get the app</div><div className="sub">Sign in on your phone with a code</div></div></Link>
                <Link to="/link" className="list-row" onClick={(e) => { e.preventDefault(); finish.mutate("/link"); }}><div className="avatar"><Icon name="watch" size={18} /></div><div className="grow"><div className="title">Link a watch</div><div className="sub">Your matches on your wrist</div></div></Link>
                <Link to="/people" className="list-row" onClick={(e) => { e.preventDefault(); finish.mutate("/people"); }}><div className="avatar"><Icon name="people" size={18} /></div><div className="grow"><div className="title">Invite people</div><div className="sub">Your crew, or your whole association</div></div></Link>
            </div>
            {finish.error && <p className="error">{finish.error.message}</p>}
            <div className="setup-actions"><button type="button" className="btn btn-ghost" onClick={() => setStep(6)}><Icon name="back" size={16} />Back</button><span className="grow" /><button type="button" className="btn btn-primary" disabled={finish.isPending} onClick={() => finish.mutate("/matches")}>Go to my matches</button></div>
        </Shell>
    );
}
