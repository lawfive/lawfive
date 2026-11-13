import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, type InviteLookup, type Session, request, useMeta, useSignIn, useSignOut } from "../api.ts";
import { Icon, Loading, Logo, LegalNote, useTabTitle } from "../components/ui.tsx";
import { formatShortDay } from "../format.ts";

// An invitation link (USR-3): who it's from, and the form to make an account with it, whatever the
// server's sign-up setting. An invitation for one address fills it in and keeps it.

export function Invite({ session }: { session?: Session }) {
    const { token = "" } = useParams();
    useTabTitle("Invitation");
    const lookup = useQuery({
        queryKey: ["invite", token],
        queryFn: () => request<InviteLookup>("GET", `/invite/${encodeURIComponent(token)}`),
        retry: false,
    });

    return (
        <div className="auth-page">
            <div className="card auth-card">
                <Logo />
                {lookup.isLoading ? (
                    <Loading label="Looking up your invitation" />
                ) : lookup.error ? (
                    <Unusable error={lookup.error} />
                ) : lookup.data && session ? (
                    <SignedIn session={session} />
                ) : lookup.data ? (
                    <Form token={token} invite={lookup.data} />
                ) : null}
            </div>
        </div>
    );
}

function Form({ token, invite }: { token: string; invite: InviteLookup }) {
    const [name, setName] = useState(invite.name ?? "");
    const [email, setEmail] = useState(invite.email ?? "");
    const [password, setPassword] = useState("");
    const signUp = useSignIn();
    const navigate = useNavigate();
    const server = useMeta().data?.apiUrl ?? window.location.origin;

    return (
        <>
            <p className="tagline"><strong>{invite.invitedBy}</strong> invited you to LawFive. Make your account to get started.</p>
            <form onSubmit={(e) => {
                e.preventDefault();
                signUp.mutate({ mode: "signUp", name, email, password, invite: token }, { onSuccess: () => navigate("/matches", { replace: true }) });
            }}>
                <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
                <label className="field">
                    <span>Email</span>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" readOnly={invite.email !== undefined} />
                    {invite.email && <small className="muted">The invitation is for this address.</small>}
                </label>
                <label className="field"><span>Password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label>
                <LegalNote action="making an account" />
                {signUp.error && <p className="error">{signUp.error.message}</p>}
                <button className="btn btn-primary" disabled={signUp.isPending}>Create account</button>
            </form>
            <p className="auth-note centered">The invitation works once, until {formatShortDay(invite.expiresAt)}.</p>
            <a className="btn touch-only app-open" href={`lawfive://invite?server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}`}>
                <Icon name="phone" />Use the app instead
            </a>
            <div className="switch">Already have an account? <Link to="/">Sign in</Link></div>
        </>
    );
}

function Unusable({ error }: { error: Error }) {
    const gone = error instanceof ApiError && error.status === 410;
    return (
        <div className="invite-problem">
            <div className="waiting-icon"><Icon name="link" size={24} /></div>
            <h2>{gone ? "This invitation can't be used" : "This invitation link isn't valid"}</h2>
            <p className="muted">{error.message} Ask whoever invited you for a new link.</p>
            <Link to="/" className="btn">Go to sign in</Link>
        </div>
    );
}

function SignedIn({ session }: { session: Session }) {
    const signOut = useSignOut();
    return (
        <div className="invite-problem">
            <h2>You're already signed in</h2>
            <p className="muted">You're signed in as {session.user.email}. To make a new account with this invitation, sign out first.</p>
            <div className="waiting-actions">
                <Link to="/matches" className="btn btn-primary">Open LawFive</Link>
                <button className="btn" onClick={() => signOut.mutate()}>Sign out</button>
            </div>
        </div>
    );
}
