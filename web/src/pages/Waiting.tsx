import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { type Session, useMeta, useSignOut } from "../api.ts";
import { Icon, Logo, useTabTitle } from "../components/ui.tsx";

// What an account waiting for an admin's approval sees (USR-4): it can sign in, but nothing else
// until it's approved. It checks every half minute, so it opens up on its own once approved.

export function Waiting({ session }: { session: Session }) {
    const client = useQueryClient();
    const signOut = useSignOut();
    const emails = useMeta().data?.capabilities.includes("email") ?? false;
    const check = () => client.invalidateQueries({ queryKey: ["session"] });
    useTabTitle("Waiting for approval");

    useEffect(() => {
        const timer = setInterval(() => void client.invalidateQueries({ queryKey: ["session"] }), 30_000);
        return () => clearInterval(timer);
    }, [client]);

    return (
        <div className="auth-page">
            <div className="card auth-card waiting-card">
                <Logo />
                <div className="waiting-icon"><Icon name="clock" size={26} /></div>
                <h2>Waiting for approval</h2>
                <p className="muted">
                    Thanks, {session.user.name.split(" ")[0]}. Your account is made, and an admin needs to approve it before you can use LawFive.
                    {emails ? <> We'll email <strong>{session.user.email}</strong> when it's ready.</> : " Check back here soon."}
                </p>
                <div className="waiting-actions">
                    <button className="btn btn-primary" onClick={() => void check()}>Check again</button>
                    <button className="btn" onClick={() => signOut.mutate()}><Icon name="out" />Sign out</button>
                </div>
            </div>
        </div>
    );
}
