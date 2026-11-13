import type * as schema from "@lawfive/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { z } from "zod";
import { ApiError, request, useMeta } from "../api.ts";
import { Field, Icon, Select, TextInput, Toggle } from "../components/ui.tsx";
import { formatShortDay, timeAgo } from "../format.ts";

// API keys for scripts and integrations (KEY-1 to KEY-4), on the Settings page: the list with
// Delete for each, and a dialog to make one, choosing what it can reach. The new key is shown
// once; the server keeps only a hash. A key that can change matches can also tell your phones
// when it adds or changes one (NOTE-1), on the server's that offer it.

type ApiKey = z.infer<typeof schema.ApiKey>;
type CreatedApiKey = z.infer<typeof schema.CreatedApiKey>;
type Access = "none" | "read" | "write";

/** The collections a key can be given, in the order the dialog lists them. */
const areas: [string, string][] = [
    ["matches", "Matches"],
    ["match-records", "Match reports"],
    ["venues", "Venues"],
    ["referees", "Referees"],
    ["competitions", "Competitions"],
    ["match-templates", "Templates"],
    ["settings", "Settings"],
];
const areaNames = Object.fromEntries(areas);
const levels: [Access, string][] = [["none", "None"], ["read", "Read"], ["write", "Read and write"]];

/** "Matches (read and write), Venues (read)". */
function describeScopes(scopes: string[]): string {
    return scopes.map((s) => {
        const [area, level] = s.split(":");
        return `${areaNames[area] ?? area} (${level === "write" ? "read and write" : "read"})`;
    }).join(", ");
}

/** Whether a key can add or change matches, which is all its notices are about. */
const writesMatches = (scopes: string[]) => scopes.includes("matches:write");

export function ApiKeys({ making, onDone }: { making: boolean; onDone: () => void }) {
    const client = useQueryClient();
    const notices = useMeta().data?.capabilities.includes("notices") ?? false;
    const keys = useQuery({ queryKey: ["api-keys"], queryFn: async () => (await request<{ keys: ApiKey[] }>("GET", "/api-keys")).keys });
    const remove = useMutation({
        mutationFn: (id: string) => request("DELETE", `/api-keys/${id}`),
        onSuccess: () => client.invalidateQueries({ queryKey: ["api-keys"] }),
    });
    const notify = useMutation({
        mutationFn: ({ id, on }: { id: string; on: boolean }) => request<ApiKey>("PATCH", `/api-keys/${id}`, { notify: on }),
        onSettled: () => client.invalidateQueries({ queryKey: ["api-keys"] }),
    });

    return (
        <>
            {keys.isSuccess && keys.data.length === 0 && (
                <div className="list-row">
                    <div className="avatar"><Icon name="key" size={18} /></div>
                    <div className="grow">
                        <div className="title">No API keys</div>
                        <div className="sub">For importing matches with a script, or connecting another app. Each key reaches only what you give it.</div>
                    </div>
                </div>
            )}
            {keys.data?.map((k) => {
                const expired = k.expiresAt !== undefined && new Date(k.expiresAt) <= new Date();
                return (
                    <div key={k.id} className="list-row">
                        <div className="avatar"><Icon name="key" size={18} /></div>
                        <div className="grow">
                            <div className="title">{k.name} <span className="code-text muted key-prefix">{k.prefix}…</span></div>
                            <div className="sub">{describeScopes(k.scopes)}</div>
                            <div className="sub">
                                Made {formatShortDay(k.createdAt)} · {k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : "never used"}
                                {k.expiresAt && (expired ? <> · <span className="error">expired</span></> : ` · expires ${formatShortDay(k.expiresAt)}`)}
                            </div>
                            {notices && writesMatches(k.scopes) && (
                                <div className="key-notify">
                                    <Toggle label="Tell my phones when it adds or changes matches" checked={k.notify} disabled={notify.isPending}
                                        onChange={(on) => notify.mutate({ id: k.id, on })} />
                                </div>
                            )}
                        </div>
                        <button className="btn" disabled={remove.isPending}
                            onClick={() => confirm(`Delete the key "${k.name}"? Anything using it stops working.`) && remove.mutate(k.id)}>
                            Delete
                        </button>
                    </div>
                );
            })}
            {notify.error && <p className="error">{notify.error.message}</p>}
            {making && <NewKey notices={notices} onClose={onDone} onCreated={() => client.invalidateQueries({ queryKey: ["api-keys"] })} />}
        </>
    );
}

function NewKey({ notices, onClose, onCreated }: { notices: boolean; onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState<string>();
    const [access, setAccess] = useState<Record<string, Access>>({});
    const [expiry, setExpiry] = useState<string | undefined>("90");
    const [notify, setNotify] = useState(false);
    const create = useMutation({
        mutationFn: (body: z.input<typeof schema.NewApiKey>) => request<CreatedApiKey>("POST", "/api-keys", body),
        onSuccess: onCreated,
    });
    const scopes = Object.entries(access).filter(([, a]) => a !== "none").map(([area, a]) => `${area}:${a}`);
    const canNotify = notices && writesMatches(scopes);
    const error = create.error instanceof ApiError && create.error.body.issues
        ? create.error.body.issues.map((i) => `${i.path.join(" › ")}: ${i.message}`).join("; ")
        : create.error?.message;
    const made = create.data;
    const [copied, setCopied] = useState(false);

    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!made} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal key-modal">
                <Dialog className="modal-dialog">
                    {made ? (
                        <>
                            <Heading slot="title">Copy your key</Heading>
                            <p className="muted">This is the only time it's shown, so keep it somewhere safe. Anyone who has it gets this access: {describeScopes(made.scopes)}.</p>
                            <div className="key-reveal">
                                <code className="code-text">{made.key}</code>
                                <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void navigator.clipboard.writeText(made.key).then(() => setCopied(true))}>
                                    <Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                            <p className="muted key-usage">Send it as <code className="code-text">Authorization: Bearer {made.prefix}…</code></p>
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                                <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            create.mutate({ name: name ?? "", scopes, ...(expiry ? { expiresInDays: Number(expiry) } : {}), ...(canNotify && notify ? { notify: true } : {}) });
                        }}>
                            <Heading slot="title">New API key</Heading>
                            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                                <Field label="Name"><TextInput value={name} onChange={setName} maxLength={60} placeholder="API import" /></Field>
                                <Field label="Access" info="Read lets it fetch; read and write also lets it add, change and delete. Leave out anything it doesn't need.">
                                    <table className="key-access">
                                        <thead>
                                            <tr><td />{levels.map(([, label]) => <th key={label} scope="col">{label}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {areas.map(([area, label]) => (
                                                <tr key={area}>
                                                    <th scope="row">{label}</th>
                                                    {levels.map(([level, levelLabel]) => (
                                                        <td key={level}>
                                                            <input type="radio" name={`access-${area}`} aria-label={`${label}: ${levelLabel}`}
                                                                checked={(access[area] ?? "none") === level} onChange={() => setAccess((a) => ({ ...a, [area]: level }))} />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Field>
                                <Field label="Expires">
                                    <Select value={expiry} onChange={setExpiry} empty="Never"
                                        options={[["30", "In 30 days"], ["90", "In 90 days"], ["365", "In a year"]]} />
                                </Field>
                                {canNotify && (
                                    <Field label="Notifications" info="For an app that adds your assignments: your phones are told when it adds a match, or cancels, postpones, moves or removes one, as one notification a minute at most. Leave it off for a script loading your own matches. Turn on Matches from integrations in the phone app too.">
                                        <Toggle label="Tell my phones when it adds or changes matches" checked={notify} onChange={setNotify} />
                                    </Field>
                                )}
                            </div>
                            {/* Q-19: a reminder of what it may send, as the terms' Acceptable use says. */}
                            <p className="muted key-usage">Nothing that identifies anyone under 16 (names, photos, contact details); team names, age groups and shirt numbers are fine. <a className="link" href="https://lawfive.app/terms.html#minors" target="_blank" rel="noreferrer">The terms</a></p>
                            {error && <p className="error">{error}</p>}
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                                <button type="button" className="btn" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={create.isPending || !name?.trim() || scopes.length === 0}>Make key</button>
                            </div>
                        </form>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
