import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router";
import { ApiError, request } from "../api.ts";
import { Icon, Loading, Logo, useTabTitle } from "../components/ui.tsx";

// USR-9: the page the link emailed to a new address opens, signed in or not. Following the link is
// the confirmation, so it's sent straight away; it doesn't sign anyone in.

export function ConfirmEmail({ signedIn = false }: { signedIn?: boolean }) {
    const { token = "" } = useParams();
    const client = useQueryClient();
    const confirm = useMutation({
        mutationFn: () => request<{ email: string }>("POST", "/account/email/confirm", { token }),
        onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["account"] }), client.invalidateQueries({ queryKey: ["session"] })]),
    });
    // Once, even when React runs effects twice in development.
    const sent = useRef(false);
    useEffect(() => {
        if (!sent.current) {
            sent.current = true;
            confirm.mutate();
        }
    }, []);
    useTabTitle("Confirm your email");
    // Signed out, Settings is the sign-in page first, then Settings.
    const settings = "/settings#you";
    const problem = confirm.error instanceof ApiError && (confirm.error.status === 400 || confirm.error.status === 409)
        ? confirm.error.message
        : confirm.error && "Couldn't reach the server. Check your connection and open the link again.";

    return (
        <div className="auth-page">
            <div className="card auth-card">
                <Logo />
                {confirm.isSuccess ? (
                    <div className="waiting-card">
                        <div className="waiting-icon"><Icon name="check" size={24} /></div>
                        <h2>Email changed</h2>
                        <p className="muted">Your email is now <strong>{confirm.data.email}</strong>. Sign in with it from now on; your old address has been told.</p>
                        <Link to={signedIn ? settings : "/"} className="btn btn-primary">{signedIn ? "Back to Settings" : "Sign in"}</Link>
                    </div>
                ) : problem ? (
                    <div className="invite-problem">
                        <div className="waiting-icon"><Icon name="link" size={24} /></div>
                        <h2>This link can't be used</h2>
                        <p className="muted">{problem}</p>
                        {/* A 400's words already say what to do; a 409 (the address taken meanwhile) doesn't. */}
                        {confirm.error instanceof ApiError && confirm.error.status === 409 && <p className="muted">Your email hasn't changed. To use another, change it in Settings → You.</p>}
                        <Link to={settings} className="btn">{signedIn ? "Go to Settings" : "Sign in to Settings"}</Link>
                    </div>
                ) : (
                    <div className="waiting-card">
                        <Loading label="Confirming your new email…" />
                    </div>
                )}
            </div>
        </div>
    );
}
