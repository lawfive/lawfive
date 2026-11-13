import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { type Account, ApiError, request, useAccount, useMeta } from "../api.ts";
import { Icon } from "../components/ui.tsx";
import { formatWhen } from "../format.ts";
import { BackupRows } from "./Backup.tsx";
import { SettingsRow } from "./Settings.tsx";

// Your own account in Settings (USR-7): under You, the name (USR-10), the email (confirmed by a link
// to the new address when the server can email, USR-9) and the password; under Your data, deleting
// the account. The email, password and deleting ask for the password, so a browser left signed in
// can't be used to take the account over.

type Editing = "name" | "email" | "password" | "delete";

/** Settings → You: the name, the email (with a change waiting for its link), the password. */
export function YouRows() {
    const account = useAccount();
    const client = useQueryClient();
    const [editing, setEditing] = useState<Editing>();
    const email = account.data?.email ?? "";
    const pending = account.data?.pendingEmail;
    const close = () => setEditing(undefined);
    // USR-9: the link emailed to the new address stops working.
    const cancel = useMutation({
        mutationFn: () => request<Account>("DELETE", "/account/email"),
        onSuccess: (changed) => client.setQueryData(["account"], changed),
    });
    return (
        <>
            <SettingsRow label="Name" hint={account.data?.name}>
                <button className="btn" disabled={!account.data} onClick={() => setEditing("name")}>Change name</button>
            </SettingsRow>
            <SettingsRow label="Email" hint={email}>
                <button className="btn" disabled={!account.data} onClick={() => setEditing("email")}>Change email</button>
            </SettingsRow>
            {pending && (
                <div className="settings-row email-pending" role="status">
                    <div className="email-pending-text">
                        <Icon name="mail" size={20} />
                        <div>
                            <div className="settings-label">Check {pending} for a link</div>
                            <div className="settings-hint">
                                Your email changes when you open it{account.data?.pendingEmailUntil ? `, until ${formatWhen(account.data.pendingEmailUntil)}` : ""}. Until then you sign in with {email}.
                                {cancel.error && <span className="error"> Couldn't cancel; try again.</span>}
                            </div>
                        </div>
                    </div>
                    <div className="settings-control">
                        <button className="btn" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Canceling…" : "Cancel"}</button>
                    </div>
                </div>
            )}
            <SettingsRow label="Password" hint="Watches and devices already signed in stay signed in.">
                <button className="btn" onClick={() => setEditing("password")}>Change password</button>
            </SettingsRow>
            {editing === "name" && <ChangeName current={account.data?.name ?? ""} onClose={close} />}
            {editing === "email" && <ChangeEmail current={pending ?? email} onClose={close} />}
            {editing === "password" && <ChangePassword onClose={close} />}
        </>
    );
}

/** Settings → Your data: download and restore, then deleting the account; `children` (what the plan lets it keep) between them. */
export function DataRows({ children }: { children?: ReactNode }) {
    const account = useAccount();
    const [deleting, setDeleting] = useState(false);
    return (
        <>
            <BackupRows />
            {children}
            <SettingsRow label="Delete your account" hint="Your matches, venues, referees, tracks and everything else, for good.">
                <button className="btn btn-danger" onClick={() => setDeleting(true)}><Icon name="trash" />Delete account</button>
            </SettingsRow>
            {deleting && <DeleteAccount email={account.data?.email ?? ""} onClose={() => setDeleting(false)} />}
        </>
    );
}

function AccountDialog({ title, onClose, busy, onSubmit, submit, danger, cancel = "Cancel", canSubmit = true, children }: {
    title: string;
    onClose: () => void;
    busy: boolean;
    onSubmit: () => void;
    submit: string;
    danger?: boolean;
    cancel?: string;
    canSubmit?: boolean;
    children: ReactNode;
}) {
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!busy} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
                        <Heading slot="title">{title}</Heading>
                        <div className="fields" style={{ gridTemplateColumns: "1fr" }}>{children}</div>
                        <div className="modal-actions">
                            <button type="button" className="btn" disabled={busy} onClick={onClose}>{cancel}</button>
                            <button type="submit" className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} disabled={busy || !canSubmit}>{danger && <Icon name="trash" />}{submit}</button>
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

const PasswordField = ({ label, value, onChange, autoComplete = "current-password", hint }: { label: string; value: string; onChange: (v: string) => void; autoComplete?: string; hint?: string }) => (
    <label className="field">
        <span>{label}</span>
        <input className="input" type="password" value={value} onChange={(e) => onChange(e.target.value)} required minLength={autoComplete === "new-password" ? 8 : undefined} maxLength={128} autoComplete={autoComplete} />
        {hint && <small className="muted">{hint}</small>}
    </label>
);

/** USR-10: the same rule as signing up: 1 to 100 characters, trimmed. */
function ChangeName({ current, onClose }: { current: string; onClose: () => void }) {
    const client = useQueryClient();
    const [name, setName] = useState(current);
    const trimmed = name.trim();
    const save = useMutation({
        mutationFn: () => request("POST", "/auth/update-user", { name: trimmed }),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ["account"] }), client.invalidateQueries({ queryKey: ["session"] })]);
            onClose();
        },
    });
    const error = save.error instanceof ApiError && save.error.body.code === "INVALID_NAME" ? "A name is 1 to 100 characters." : save.error?.message;
    return (
        <AccountDialog title="Change your name" onClose={onClose} busy={save.isPending} onSubmit={() => trimmed !== current ? save.mutate() : onClose()}
            submit={save.isPending ? "Saving…" : "Change name"} canSubmit={trimmed.length > 0 && trimmed.length <= 100}>
            <label className="field">
                <span>Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" autoFocus />
                <small className="muted">Your phones and watches show it the next time they sync.</small>
            </label>
            {error && <p className="error">{error}</p>}
        </AccountDialog>
    );
}

function ChangeEmail({ current, onClose }: { current: string; onClose: () => void }) {
    const client = useQueryClient();
    const canEmail = useMeta().data?.capabilities.includes("email") ?? false;
    const [email, setEmail] = useState(current);
    const [password, setPassword] = useState("");
    const save = useMutation({
        mutationFn: () => request<Account>("PUT", "/account/email", { email: email.trim(), password }),
        onSuccess: async (changed) => {
            // USR-9: with a link emailed (202), the account says what's waiting; Settings shows it.
            client.setQueryData(["account"], changed);
            await Promise.all([client.invalidateQueries({ queryKey: ["account"] }), client.invalidateQueries({ queryKey: ["session"] })]);
            onClose();
        },
    });
    const error = save.error instanceof ApiError && save.error.body.issues ? "That email address doesn't look right." : save.error?.message;
    return (
        <AccountDialog title="Change your email" onClose={onClose} busy={save.isPending} onSubmit={() => save.mutate()} submit={save.isPending ? "Saving…" : "Change email"}>
            <label className="field">
                <span>New email</span>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                <small className="muted">{canEmail ? "We'll email it a link. Your email changes when you open it, within 24 hours." : "You sign in with it from now on."}</small>
            </label>
            <PasswordField label="Your password" value={password} onChange={setPassword} />
            {error && <p className="error">{error}</p>}
        </AccountDialog>
    );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [again, setAgain] = useState("");
    const [done, setDone] = useState(false);
    const save = useMutation({
        mutationFn: () => request("POST", "/auth/change-password", { currentPassword: current, newPassword: next }),
        onSuccess: () => setDone(true),
    });
    const mismatch = again !== "" && again !== next;
    const error = save.error instanceof ApiError && save.error.body.code === "INVALID_PASSWORD" ? "Your current password isn't right." : save.error?.message;
    if (done) {
        return (
            <AccountDialog title="Password changed" onClose={onClose} busy={false} onSubmit={onClose} submit="Done">
                <p className="muted" style={{ margin: 0 }}>Use it next time you sign in. Watches and devices already signed in stay signed in.</p>
            </AccountDialog>
        );
    }
    return (
        <AccountDialog title="Change your password" onClose={onClose} busy={save.isPending} onSubmit={() => !mismatch && save.mutate()} submit={save.isPending ? "Saving…" : "Change password"}>
            <PasswordField label="Current password" value={current} onChange={setCurrent} />
            <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" hint="At least 8 characters." />
            <label className="field">
                <span>New password again</span>
                <input className="input" type="password" value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
                {mismatch && <small className="error">The two don't match.</small>}
            </label>
            {error && <p className="error">{error}</p>}
        </AccountDialog>
    );
}

function DeleteAccount({ email, onClose }: { email: string; onClose: () => void }) {
    const client = useQueryClient();
    const [password, setPassword] = useState("");
    const remove = useMutation({
        mutationFn: () => request("POST", "/account/delete", { password }),
        onSuccess: () => {
            client.clear();
            window.location.assign("/");
        },
    });
    return (
        <AccountDialog title="Delete your account?" onClose={onClose} busy={remove.isPending} onSubmit={() => remove.mutate()} submit={remove.isPending ? "Deleting…" : "Delete my account"} cancel="Keep my account" canSubmit={password.length > 0} danger>
            <p className="muted delete-who"><strong>{email}</strong>. This can't be undone.</p>
            <ul className="delete-lines">
                <li><Icon name="matches" size={18} />Matches, match reports and tracks</li>
                <li><Icon name="photos" size={18} />Photos, venues and referees</li>
                <li><Icon name="competitions" size={18} />Competitions, templates and settings</li>
                <li><Icon name="key" size={18} />API keys and the calendar feed</li>
                <li><Icon name="watch" size={18} />Phones and watches get signed out</li>
            </ul>
            {/* USR-7: the same download as Settings → Your data, without leaving the dialog. */}
            <div className="delete-copy">
                <div className="grow">
                    <strong>Keep a copy first</strong>
                    <small className="muted">One zip of everything, which can be restored on any LawFive server.</small>
                </div>
                <a className="btn" href="/v1/export" download><Icon name="download" />Download my data</a>
            </div>
            <PasswordField label="Your password, to confirm" value={password} onChange={setPassword} />
            {remove.error && <p className="error">{remove.error.message}</p>}
        </AccountDialog>
    );
}
