import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useMeta, useSignIn } from "../api.ts";
import { LegalNote, Logo, helpUrl, useTabTitle } from "../components/ui.tsx";
import { SetupFirstAccount } from "./Setup.tsx";

// Signing in, or making an account when the server allows it (USR-2): anyone can when sign-up is
// open; with approval, the account waits for an admin; when it's closed, only an invitation link
// (the Invite page) makes one. A forgotten password is reset by a link (USR-7). /signup opens on making
// an account, for the phones' sign-in page to link to (APP-2).

export function SignIn() {
    const [chosenMode, setMode] = useState<"signIn" | "signUp">();
    const meta = useMeta().data;
    const { pathname } = useLocation();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const signIn = useSignIn();
    const signUp = meta?.signUp ?? "open";
    const mode = chosenMode ?? (pathname === "/signup" && signUp !== "closed" ? "signUp" : "signIn");
    useTabTitle(mode === "signUp" ? "Create account" : "Sign in");

    // USR-8, ADM-5: a new server opens on setting it up.
    if (meta?.firstAccount) {
        return <SetupFirstAccount codeNeeded={!!meta.setupCodeNeeded} />;
    }
    return (
        <div className="auth-page">
            <div className="auth-stack">
                <div className="card auth-card">
                    <Logo />
                    <p className="tagline">{"Your matches, on your wrist and everywhere else."}</p>
                    <form onSubmit={(e) => { e.preventDefault(); signIn.mutate({ mode, name, email, password }); }}>
                        {mode === "signUp" && (
                            <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
                        )}
                        <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
                        <label className="field"><span>Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signIn" ? "current-password" : "new-password"} /></label>
                        {mode === "signUp" && signUp === "approval" && (
                            <p className="auth-note">An admin approves new accounts before they can be used.</p>
                        )}
                        {mode === "signUp" && <LegalNote action="making an account" />}
                        {signIn.error && <p className="error">{signIn.error.message}</p>}
                        <button className="btn btn-primary" disabled={signIn.isPending}>{mode === "signIn" ? "Sign in" : "Create account"}</button>
                        {mode === "signIn" && <Link to="/forgot-password" className="auth-forgot">Forgot your password?</Link>}
                    </form>
                    {signUp === "closed" ? (
                        <div className="switch">New accounts are by invitation. Ask whoever runs this server.</div>
                    ) : (
                        <div className="switch">
                            {mode === "signIn" ? "New here?" : "Already have an account?"}{" "}
                            <button type="button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); signIn.reset(); }}>{mode === "signIn" ? "Create an account" : "Sign in"}</button>
                        </div>
                    )}
                </div>
                {/* WEB-29. */}
                <p className="auth-footer"><a href={helpUrl} target="_blank" rel="noreferrer">Help</a></p>
            </div>
        </div>
    );
}
