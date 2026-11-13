import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Key, useState } from "react";
import { Button, Dialog, Heading, Menu, MenuItem, MenuTrigger, Modal, ModalOverlay, Popover } from "react-aria-components";
import { Link } from "react-router";
import { ApiError, type Invite, type Person, type PlanHistoryEntry, request, useAccount, useMeta, usePeople, usePlans, useServerSettings } from "../api.ts";
import { QrCode } from "../components/QrCode.tsx";
import { Icon, PageHead } from "../components/ui.tsx";
import { formatShortDay, formatTime, initials, timeAgo } from "../format.ts";
import { planEnd } from "../plans.ts";

// Who can use this server, for admins (USR-1 to USR-7): who can sign up, changed here; accounts
// waiting for approval, with Approve and Decline; invitations, with their links to copy; and
// everyone with an account, with Make admin and a menu for a password reset link, suspending and
// deleting. Inviting opens a dialog that makes a link, and emails it when the server can. Each
// member's plan (PLAN-3) shows on their row and changes from their menu; an invitation can carry one.

const signUpWords = {
    open: { title: "Anyone can sign up", hint: "New accounts can be used straight away." },
    approval: { title: "New accounts need approval", hint: "People can sign up, and wait here until an admin approves them." },
    closed: { title: "Only people you invite", hint: "Nobody can sign up without an invitation." },
};
type SignUpMode = keyof typeof signUpWords;

function daysLeft(iso: string): string {
    const days = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
    return days <= 1 ? "expires today" : `expires in ${days} days`;
}

export function People() {
    const account = useAccount();
    const isAdmin = account.data?.admin ?? false;
    const people = usePeople(isAdmin);
    const invites = useQuery({
        queryKey: ["invites"],
        queryFn: async () => (await request<{ invites: Invite[] }>("GET", "/invites")).invites,
        enabled: isAdmin,
    });
    const meta = useMeta();
    const [inviting, setInviting] = useState(false);

    if (account.isSuccess && !isAdmin) {
        return (
            <>
                <PageHead title="People" hero />
                <div className="card empty">Only admins can see who uses this server.</div>
            </>
        );
    }

    const all = people.data ?? [];
    const waiting = all.filter((p) => p.status === "pending");
    const members = all.filter((p) => p.status !== "pending");
    const now = Date.now();
    const open = (invites.data ?? []).filter((i) => !i.usedAt && Date.parse(i.expiresAt) > now);
    const done = (invites.data ?? []).filter((i) => i.usedAt || Date.parse(i.expiresAt) <= now).slice(0, 5);
    const mode = meta.data?.signUp ?? "open";
    const emailEnabled = meta.data?.capabilities.includes("email") ?? false;

    return (
        <>
            <PageHead
                title="People"
                hero
                sub="Who can use LawFive on this server."
                actions={<div className="row" style={{ gap: 8 }}>
                    <Link to="/settings/server/plans" className="btn"><Icon name="plan" />Plans</Link>
                    <button className="btn btn-primary" onClick={() => setInviting(true)}><Icon name="invite" />Invite someone</button>
                </div>}
            />

            <SignUpSetting mode={mode} />

            {waiting.length > 0 && (
                <section className="settings-group">
                    <h3 className="people-heading">Waiting for approval <span className="count-badge">{waiting.length}</span></h3>
                    <div className="card">
                        {waiting.map((p) => <WaitingRow key={p.id} person={p} />)}
                    </div>
                </section>
            )}

            <section className="settings-group">
                <h3 className="people-heading">Invitations</h3>
                <div className="card">
                    {invites.isSuccess && open.length === 0 && (
                        <div className="list-row">
                            <div className="avatar"><Icon name="mail" size={18} /></div>
                            <div className="grow">
                                <div className="title">No invitations waiting</div>
                                <div className="sub">An invitation link lets someone make an account, even when sign-up is closed. It works once, for 14 days.</div>
                            </div>
                            <button className="btn" onClick={() => setInviting(true)}>Invite someone</button>
                        </div>
                    )}
                    {open.map((i) => <InviteRow key={i.id} invite={i} />)}
                    {done.map((i) => <InviteRow key={i.id} invite={i} done />)}
                </div>
            </section>

            <section className="settings-group">
                <h3 className="people-heading">Members <span className="muted people-count">{members.length}</span></h3>
                <div className="card">
                    {members.map((p) => <MemberRow key={p.id} person={p} me={p.id === account.data?.id} emailEnabled={emailEnabled} />)}
                </div>
            </section>

            {inviting && <InviteDialog emailEnabled={emailEnabled} onClose={() => setInviting(false)} />}
        </>
    );
}

/** Who can make an account (USR-2), changed here (USR-7) unless the server's SIGN_UP fixes it (ADM-1). */
function SignUpSetting({ mode }: { mode: SignUpMode }) {
    const client = useQueryClient();
    const fixed = useServerSettings().data?.find((s) => s.key === "signUp")?.source === "environment";
    const save = useMutation({
        mutationFn: (signUp: SignUpMode) => request("PUT", "/server-settings", { signUp }),
        onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["meta"] }), client.invalidateQueries({ queryKey: ["server-settings"] })]),
    });
    const shown = save.isPending ? save.variables : mode;
    return (
        <div className="people-mode">
            <Icon name={shown === "closed" ? "mail" : shown === "approval" ? "approve" : "invite"} size={18} />
            <div className="grow">
                <label className="people-mode-choice">
                    <strong>Who can make an account</strong>
                    <select className="input" value={shown} disabled={save.isPending || fixed} onChange={(e) => save.mutate(e.target.value as SignUpMode)}>
                        {(Object.keys(signUpWords) as SignUpMode[]).map((m) => <option key={m} value={m}>{signUpWords[m].title}</option>)}
                    </select>
                </label>
                <div className="muted">{signUpWords[shown].hint} Invitation links work whatever this says.</div>
                {fixed && <div className="muted">Set by <code>SIGN_UP</code> on the server, so it's changed there.</div>}
                {save.error && <div className="error">{save.error.message}</div>}
            </div>
        </div>
    );
}

function useRefresh() {
    const client = useQueryClient();
    return () => Promise.all([client.invalidateQueries({ queryKey: ["people"] }), client.invalidateQueries({ queryKey: ["invites"] })]);
}

function WaitingRow({ person }: { person: Person }) {
    const refresh = useRefresh();
    const decide = useMutation({
        mutationFn: (action: "approve" | "decline") => request("POST", `/people/${person.id}/${action}`, {}),
        onSuccess: refresh,
    });
    return (
        <div className="list-row person-row">
            <div className="avatar avatar-waiting">{initials(person.name)}</div>
            <div className="grow">
                <div className="title">{person.name}</div>
                <div className="sub">{person.email} · signed up {timeAgo(person.joinedAt)}</div>
                {decide.error && <div className="error">{decide.error.message}</div>}
            </div>
            <div className="row-actions">
                <button className="btn" disabled={decide.isPending}
                    onClick={() => confirm(`Decline ${person.name}? Their account is deleted; they can sign up again.`) && decide.mutate("decline")}>
                    Decline
                </button>
                <button className="btn btn-primary" disabled={decide.isPending} onClick={() => decide.mutate("approve")}><Icon name="check" />Approve</button>
            </div>
        </div>
    );
}

function MemberRow({ person, me, emailEnabled }: { person: Person; me: boolean; emailEnabled: boolean }) {
    const refresh = useRefresh();
    const [dialog, setDialog] = useState<"reset" | "delete" | "plan">();
    const toggle = useMutation({
        mutationFn: (admin: boolean) => request("PUT", `/people/${person.id}/admin`, { admin }),
        onSuccess: refresh,
    });
    const suspend = useMutation({
        mutationFn: (suspended: boolean) => request("PUT", `/people/${person.id}/suspended`, { suspended }),
        onSuccess: refresh,
    });
    // SEC-12: locked after too many wrong passwords, until then or an admin's Unlock.
    const unlock = useMutation({
        mutationFn: () => request("POST", `/people/${person.id}/unlock`, {}),
        onSuccess: refresh,
    });
    const suspended = person.status === "suspended";
    const locked = person.lockedUntil !== undefined && Date.parse(person.lockedUntil) > Date.now();
    const why = me ? "You can't change your own admin access." : person.adminFromSetting ? "The server's ADMIN_EMAILS setting makes them an admin." : undefined;
    const onAction = (key: Key) => {
        if (key === "reset" || key === "delete" || key === "plan") {
            setDialog(key);
        } else if (key === "suspend") {
            if (suspended) {
                suspend.mutate(false);
            } else if (confirm(`Suspend ${person.name}? They're signed out everywhere and can't sign in, and their API keys and calendar feed stop working, until you undo it. Their matches are kept; linked watches need linking again afterward.`)) {
                suspend.mutate(true);
            }
        }
    };
    return (
        <div className={`list-row person-row${suspended ? " person-suspended" : ""}`}>
            <div className="avatar">{initials(person.name)}</div>
            <div className="grow">
                <div className="title">
                    {person.name}
                    {person.admin && <span className="chip chip-brand person-chip">Admin</span>}
                    {suspended && <span className="chip chip-red person-chip">Suspended</span>}
                    {locked && !suspended && <span className="chip chip-amber person-chip" title="Too many wrong passwords">Locked until {formatTime(person.lockedUntil!)}</span>}
                    {me && <span className="chip person-chip">You</span>}
                </div>
                <div className="sub">{person.email}</div>
                <div className="sub">
                    Joined {formatShortDay(person.joinedAt)}
                    {person.invitedBy && ` · invited by ${person.invitedBy}`}
                    {person.lastActiveAt ? ` · active ${timeAgo(person.lastActiveAt)}` : ""}
                </div>
                <div className="sub person-plan"><Icon name="plan" size={14} />{person.plan.name}{planEnd(person.plan) ? ` ${planEnd(person.plan)}` : ""}</div>
                {(toggle.error ?? suspend.error ?? unlock.error) && <div className="error">{(toggle.error ?? suspend.error ?? unlock.error)?.message}</div>}
            </div>
            <div className="row-actions">
                {locked && !suspended && (
                    <button className="btn" disabled={unlock.isPending} onClick={() => unlock.mutate()}
                        title="Let them sign in again now, after too many wrong passwords"><Icon name="unlock" />Unlock</button>
                )}
                {!suspended && (
                    <button className="btn" disabled={toggle.isPending || why !== undefined} title={why}
                        onClick={() => (person.admin
                            ? confirm(`Remove ${person.name}'s admin access?`) && toggle.mutate(false)
                            : confirm(`Make ${person.name} an admin? They'll be able to invite and approve people, and make other admins.`) && toggle.mutate(true))}>
                        {person.admin ? "Remove admin" : "Make admin"}
                    </button>
                )}
                {me && <button className="btn" onClick={() => setDialog("plan")}><Icon name="plan" />Plan</button>}
                {!me && (
                    <MenuTrigger>
                        <Button className="btn btn-icon" aria-label={`More for ${person.name}`}><Icon name="more" size={18} /></Button>
                        <Popover className="menu-popover" placement="bottom end" offset={6}>
                            <Menu className="menu" aria-label={`More for ${person.name}`} onAction={onAction}
                                disabledKeys={person.adminFromSetting ? ["suspend", "delete"] : []}>
                                <MenuItem id="plan" className="menu-item" textValue="Change plan">
                                    <Icon name="plan" size={18} />
                                    <span><strong>Change plan</strong><small>{person.plan.name}{planEnd(person.plan) ? ` ${planEnd(person.plan)}` : ""}</small></span>
                                </MenuItem>
                                <MenuItem id="reset" className="menu-item" textValue="Password reset link">
                                    <Icon name="key" size={18} />
                                    <span><strong>Password reset link</strong><small>{emailEnabled ? "For when they can't use the emailed one" : "For a forgotten password; you send it to them"}</small></span>
                                </MenuItem>
                                <MenuItem id="suspend" className="menu-item" textValue={suspended ? "Undo suspension" : "Suspend"}>
                                    <Icon name={suspended ? "approve" : "pause"} size={18} />
                                    <span><strong>{suspended ? "Undo suspension" : "Suspend"}</strong><small>{person.adminFromSetting ? "ADMIN_EMAILS makes them an admin" : suspended ? "They can sign in again" : "Blocks signing in; keeps their data"}</small></span>
                                </MenuItem>
                                <MenuItem id="delete" className="menu-item menu-item-danger" textValue="Delete account">
                                    <Icon name="trash" size={18} />
                                    <span><strong>Delete account</strong><small>{person.adminFromSetting ? "ADMIN_EMAILS makes them an admin" : "And everything in it, for good"}</small></span>
                                </MenuItem>
                            </Menu>
                        </Popover>
                    </MenuTrigger>
                )}
            </div>
            {dialog === "reset" && <ResetLinkDialog person={person} onClose={() => setDialog(undefined)} />}
            {dialog === "delete" && <DeletePersonDialog person={person} onClose={() => setDialog(undefined)} />}
            {dialog === "plan" && <PersonPlanDialog person={person} me={me} onClose={() => setDialog(undefined)} />}
        </div>
    );
}

/** A password reset link an admin sends (USR-7), made as the dialog opens. */
function ResetLinkDialog({ person, onClose }: { person: Person; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const make = useQuery({
        queryKey: ["reset-link", person.id],
        queryFn: () => request<{ link: string; expiresAt: string }>("POST", `/people/${person.id}/reset-link`, {}),
        gcTime: 0,
        staleTime: Infinity,
        retry: false,
    });
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal key-modal">
                <Dialog className="modal-dialog">
                    <Heading slot="title">Password reset link</Heading>
                    {make.data ? (
                        <>
                            <p className="muted">Send this to {person.name}. It lets whoever has it choose a new password for {person.email}, once, in the next 24 hours.</p>
                            <div className="key-reveal">
                                <code className="code-text">{make.data.link}</code>
                                <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void navigator.clipboard.writeText(make.data.link).then(() => setCopied(true))}>
                                    <Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                        </>
                    ) : make.error ? <p className="error">{make.error.message}</p> : <p className="muted">Making a link…</p>}
                    <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** Deleting someone's account (USR-7), after typing their email. */
function DeletePersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
    const refresh = useRefresh();
    const [typed, setTyped] = useState("");
    const remove = useMutation({
        mutationFn: () => request("DELETE", `/people/${person.id}`),
        onSuccess: async () => {
            await refresh();
            onClose();
        },
    });
    const matches = typed.trim().toLowerCase() === person.email.toLowerCase();
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!remove.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e) => { e.preventDefault(); if (matches) remove.mutate(); }}>
                        <Heading slot="title">Delete {person.name}'s account?</Heading>
                        <p className="muted">Everything in it goes too: their matches, match reports and tracks, venues, referees and settings. It can't be undone. To stop them signing in but keep their data, suspend the account instead.</p>
                        <label className="field">
                            <span>Type their email to confirm</span>
                            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={person.email} autoComplete="off" />
                        </label>
                        {remove.error && <p className="error">{remove.error.message}</p>}
                        <div className="modal-actions">
                            <button type="button" className="btn" disabled={remove.isPending} onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-danger-solid" disabled={!matches || remove.isPending}>{remove.isPending ? "Deleting…" : "Delete account"}</button>
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function InviteRow({ invite, done }: { invite: Invite; done?: boolean }) {
    const refresh = useRefresh();
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const cancel = useMutation({ mutationFn: () => request("DELETE", `/invites/${invite.id}`), onSuccess: refresh });
    const who = invite.name ?? invite.email ?? "Anyone with the link";
    const copy = async () => {
        await navigator.clipboard.writeText(invite.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <div className={`list-row person-row${done ? " invite-done" : ""}`}>
            <div className="avatar avatar-invite"><Icon name={invite.email ? "mail" : "link"} size={17} /></div>
            <div className="grow">
                <div className="title">{who}</div>
                <div className="sub">
                    {invite.name && invite.email ? `${invite.email} · ` : ""}
                    {invite.usedAt
                        ? `Joined ${formatShortDay(invite.usedAt)}${invite.usedBy && invite.usedBy !== who ? ` as ${invite.usedBy}` : ""}`
                        : done
                            ? `Expired ${formatShortDay(invite.expiresAt)}`
                            : `Invited by ${invite.createdBy} ${timeAgo(invite.createdAt)} · ${daysLeft(invite.expiresAt)}${invite.emailedAt ? " · emailed" : ""}${invite.plan ? ` · ${invite.plan.name}${invite.planDays ? ` for ${invite.planDays} days` : ""}` : ""}`}
                </div>
            </div>
            {!done && (
                <div className="row-actions">
                    <button className="btn" onClick={() => confirm(`Cancel the invitation for ${who}? The link stops working.`) && cancel.mutate()} disabled={cancel.isPending}>Cancel</button>
                    <button className="btn" onClick={() => setShowQr(true)}><Icon name="qr" />QR code</button>
                    <button className={`btn${copied ? " copied" : ""}`} onClick={() => void copy()}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy link"}</button>
                </div>
            )}
            {showQr && <InviteQrDialog invite={invite} onClose={() => setShowQr(false)} />}
        </div>
    );
}

/** An invitation as a QR code (APP-14): a phone's camera opens the link, and the app's scanner reads it directly. */
function InviteQrDialog({ invite, onClose }: { invite: Invite; onClose: () => void }) {
    const who = invite.name ?? invite.email;
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog invite-qr">
                    <Heading slot="title">{who ? `Invitation for ${who}` : "Scan to join"}</Heading>
                    <p className="muted">Have them scan this with the LawFive app, or with their phone's camera to open the invitation. It works once{invite.email ? `, for ${invite.email}` : ""}.</p>
                    <QrCode text={invite.link} label={`QR code for the invitation${who ? ` for ${who}` : ""}`} />
                    <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function InviteDialog({ emailEnabled, onClose }: { emailEnabled: boolean; onClose: () => void }) {
    const refresh = useRefresh();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [send, setSend] = useState(true);
    const plans = usePlans();
    const [plan, setPlan] = useState("");
    const [days, setDays] = useState("");
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    const create = useMutation({
        mutationFn: () => request<{ invite: Invite; emailed: boolean }>("POST", "/invites", {
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(email.trim() && emailEnabled && send ? { send: true } : {}),
            ...(plan ? { plan, ...(Number(days) > 0 ? { planDays: Math.min(Number(days), 366) } : {}) } : {}),
        }),
        onSuccess: refresh,
    });
    const made = create.data;
    const error = create.error instanceof ApiError && create.error.body.issues
        ? "That email address doesn't look right."
        : create.error?.message;
    const canShare = typeof navigator !== "undefined" && "share" in navigator;

    if (made && showQr) {
        return <InviteQrDialog invite={made.invite} onClose={onClose} />;
    }
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal key-modal">
                <Dialog className="modal-dialog">
                    {made ? (
                        <>
                            <Heading slot="title">Invitation ready</Heading>
                            <p className="muted">
                                {made.emailed
                                    ? <>We've emailed it to <strong>{made.invite.email}</strong>. You can also send them the link yourself.</>
                                    : <>Send this link to {made.invite.name ?? made.invite.email ?? "them"}{made.invite.email ? "" : ": anyone who has it can use it, once"}. It works for 14 days.</>}
                            </p>
                            <div className="key-reveal">
                                <code className="code-text">{made.invite.link}</code>
                                <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void navigator.clipboard.writeText(made.invite.link).then(() => setCopied(true))}>
                                    <Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18, gap: 8 }}>
                                {canShare && (
                                    <button type="button" className="btn" onClick={() => void navigator.share({ title: "Join me on LawFive", text: "Here's your invitation to LawFive:", url: made.invite.link }).catch(() => undefined)}>
                                        <Icon name="share" />Share
                                    </button>
                                )}
                                <button type="button" className="btn" onClick={() => setShowQr(true)}><Icon name="qr" />QR code</button>
                                <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
                            <Heading slot="title">Invite someone</Heading>
                            <p className="muted invite-intro">They get a link to make an account, even when sign-up is closed. It works once, for 14 days.</p>
                            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                                <label className="field"><span>Name <small className="muted">optional</small></span>
                                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Jordan Lee" autoComplete="off" />
                                </label>
                                <label className="field"><span>Email <small className="muted">optional</small></span>
                                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@example.com" autoComplete="off" />
                                    <small className="muted">{email.trim() ? "Only this address can use the invitation." : "Leave it empty for a link anyone can use, once."}</small>
                                </label>
                                {emailEnabled && email.trim() && (
                                    <label className="check-row">
                                        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} />
                                        Email the invitation to them
                                    </label>
                                )}
                                {plans.data && plans.data.plans.length > 1 && (
                                    <div className="field">
                                        <span>Plan</span>
                                        <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                                            <option value="">{plans.data.signUpTrial ? "As anyone who signs up" : `The default (${plans.data.plans.find((p) => p.default)?.name ?? ""})`}</option>
                                            {plans.data.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                                        </select>
                                        {plan && (
                                            <div className="row plan-trial">
                                                <span className="muted">For</span>
                                                <input className="input plan-days" inputMode="numeric" aria-label="Days" placeholder="Always" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                                                <span className="muted">{days ? "days, then the default plan" : "days; empty keeps it until you change it"}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {error && <p className="error">{error}</p>}
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18, gap: 8 }}>
                                <button type="button" className="btn" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={create.isPending}>{email.trim() && emailEnabled && send ? "Send invitation" : "Make link"}</button>
                            </div>
                        </form>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

/** PLAN-3, PLAN-5: putting someone in a plan, until a day and then another, with their plans so far. */
function PersonPlanDialog({ person, me, onClose }: { person: Person; me: boolean; onClose: () => void }) {
    const client = useQueryClient();
    const plans = usePlans();
    const [plan, setPlan] = useState(person.plan.code);
    const [ends, setEnds] = useState(!!person.plan.endsOn);
    const [endsOn, setEndsOn] = useState(person.plan.endsOn ?? inDays(30));
    const [then, setThen] = useState(person.plan.then?.code ?? "");
    const history = useQuery({
        queryKey: ["plan-history", person.id],
        queryFn: async () => (await request<{ changes: PlanHistoryEntry[] }>("GET", `/people/${person.id}/plan-history`)).changes,
    });
    const save = useMutation({
        mutationFn: () => request<Person>("PUT", `/people/${person.id}/plan`, { plan, ...(ends ? { endsOn, ...(then ? { then } : {}) } : {}) }),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ["people"] }), client.invalidateQueries({ queryKey: ["plans"] }), client.invalidateQueries({ queryKey: ["account-plan"] })]);
            onClose();
        },
    });
    const all = plans.data?.plans ?? [];
    const fallback = all.find((p) => p.default);
    const ended = (history.data ?? []).filter((c) => c.reason === "ended").length;
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!save.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                        <Heading slot="title">{me ? "Your plan" : `${person.name}'s plan`}</Heading>
                        <p className="muted">Over its limits, nothing is taken away: adding more is refused until they're under them again.</p>
                        <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                            <label className="field"><span>Plan</span>
                                <select className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
                                    {all.map((p) => <option key={p.code} value={p.code}>{p.name}{p.default ? " (default)" : ""}</option>)}
                                </select>
                            </label>
                            <div className="field">
                                <label className="check-row">
                                    <input type="checkbox" checked={ends} onChange={(e) => setEnds(e.target.checked)} />
                                    Ends, as for a trial
                                </label>
                                {ends && (
                                    <div className="row plan-trial">
                                        <span className="muted">After</span>
                                        <input className="input plan-date" type="date" aria-label="Last day" value={endsOn} min={inDays(0)} onChange={(e) => setEndsOn(e.target.value)} />
                                        <span className="muted">then</span>
                                        <select className="input" aria-label="Then" value={then} onChange={(e) => setThen(e.target.value)}>
                                            <option value="">{fallback ? `${fallback.name} (the default)` : "The default"}</option>
                                            {all.filter((p) => !p.default).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                {ends && <small className="muted">At midnight at the end of that day where they are{ended ? `. ${ended === 1 ? "One plan of theirs has" : `${ended} plans of theirs have`} ended before.` : "."}</small>}
                            </div>
                        </div>
                        {(history.data?.length ?? 0) > 0 && (
                            <div className="plan-history">
                                <h4>So far</h4>
                                <ul>
                                    {(history.data ?? []).slice(0, 8).map((c, i) => (
                                        <li key={i}>
                                            <strong>{c.to.name}</strong>
                                            <span className="muted"> · {formatShortDay(c.at)} · {historyWhy(c)}{c.endsAt ? `, until ${formatShortDay(new Date(Date.parse(c.endsAt) - 1).toISOString())}` : ""}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {save.error && <p className="error">{save.error.message}</p>}
                        <div className="modal-actions">
                            <button type="button" className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={save.isPending || (ends && !endsOn)}>{save.isPending ? "Saving…" : "Save"}</button>
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function historyWhy(change: PlanHistoryEntry): string {
    switch (change.reason) {
        case "sign-up":
            return "when they signed up";
        case "invite":
            return "from their invitation";
        case "ended":
            return change.from ? `when ${change.from.name} ended` : "when the last one ended";
        default:
            return change.by ? `by ${change.by}` : "by an admin";
    }
}

/** Today plus some days, as a date input wants it, in this browser's time. */
function inDays(days: number): string {
    const at = new Date(Date.now() + days * 86_400_000);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}
