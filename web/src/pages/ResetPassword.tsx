import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError, request, useMeta } from "../api.ts";
import { Icon, Logo, useTabTitle } from "../components/ui.tsx";

// A forgotten password (USR-7): asking for an emailed link, when the server can send email (or
// being told to ask an admin for one), and the page a link opens, emailed or made by an admin.

export function ForgotPassword() {
    const meta = useMeta();
    const canEmail = meta.data?.capabilities.includes("email") ?? false;
    const [email, setEmail] = useState("");
    const ask = useMutation({ mutationFn: () => request("POST", "/auth/request-password-reset", { email }) });
    useTabTitle("Forgot password");

    return (
        <div className="auth-page">
            <div className="card auth-card">
                <Logo />
                {ask.isSuccess ? (
                    <div className="waiting-card">
                        <div className="waiting-icon"><Icon name="mail" size={24} /></div>
                        <h2>Check your email</h2>
                        <p className="muted">If there's an account for <strong>{email}</strong>, it has a link to choose a new password. The link works for an hour.</p>
                        <Link to="/" className="btn">Back to sign in</Link>
                    </div>
                ) : canEmail ? (
                    <>
                        <p className="tagline">Forgot your password? We'll email you a link to choose a new one.</p>
                        <form onSubmit={(e) => { e.preventDefault(); ask.mutate(); }}>
                            <label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
                            {ask.error && <p className="error">{ask.error.message}</p>}
                            <button className="btn btn-primary" disabled={ask.isPending}>Email me a link</button>
                        </form>
                        <div className="switch"><Link to="/">Back to sign in</Link></div>
                    </>
                ) : meta.isSuccess ? (
                    <div className="waiting-card">
                        <div className="waiting-icon"><Icon name="key" size={24} /></div>
                        <h2>Ask an admin for a link</h2>
                        <p className="muted">This server can't send email. Ask whoever runs it for a password reset link: they can make one on the People page.</p>
                        <Link to="/" className="btn">Back to sign in</Link>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function ResetPassword() {
    const { token = "" } = useParams();
    const [password, setPassword] = useState("");
    const [again, setAgain] = useState("");
    const reset = useMutation({ mutationFn: () => request("POST", "/auth/reset-password", { token, newPassword: password }) });
    const mismatch = again !== "" && again !== password;
    useTabTitle("Reset password");
    const expired = reset.error instanceof ApiError && reset.error.body.code === "INVALID_TOKEN";

    return (
        <div className="auth-page">
            <div className="card auth-card">
                <Logo />
                {reset.isSuccess ? (
                    <div className="waiting-card">
                        <div className="waiting-icon"><Icon name="check" size={24} /></div>
                        <h2>Password changed</h2>
                        <p className="muted">Sign in with your new password. Watches and other devices already signed in stay signed in.</p>
                        <Link to="/" className="btn btn-primary">Sign in</Link>
                    </div>
                ) : expired ? (
                    <div className="invite-problem">
                        <div className="waiting-icon"><Icon name="link" size={24} /></div>
                        <h2>This link can't be used</h2>
                        <p className="muted">It was used already, has expired, or isn't complete. Ask for a new one.</p>
                        <Link to="/forgot-password" className="btn">Get a new link</Link>
                    </div>
                ) : (
                    <>
                        <p className="tagline">Choose a new password for your account.</p>
                        <form onSubmit={(e) => { e.preventDefault(); if (!mismatch) reset.mutate(); }}>
                            <label className="field"><span>New password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="At least 8 characters" /></label>
                            <label className="field">
                                <span>Again</span>
                                <input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
                                {mismatch && <small className="error">The two don't match.</small>}
                            </label>
                            {reset.error && <p className="error">{reset.error.message}</p>}
                            <button className="btn btn-primary" disabled={reset.isPending || mismatch}>Change password</button>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
