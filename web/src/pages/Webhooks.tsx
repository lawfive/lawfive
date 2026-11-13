import type * as schema from "@lawfive/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Dialog, Heading, Menu, MenuItem, MenuTrigger, Modal, ModalOverlay, Popover } from "react-aria-components";
import type { z } from "zod";
import { ApiError, request } from "../api.ts";
import { Field, Icon, TextInput } from "../components/ui.tsx";
import { timeAgo } from "../format.ts";

// Webhooks (HOOK-1 to HOOK-5), on the Settings page beside the API keys: the list, with Send test,
// the latest deliveries, Pause and Delete for each, and a dialog to add one. Its signing secret is
// shown once, with how to check a delivery with it.

type Webhook = z.infer<typeof schema.Webhook>;
type CreatedWebhook = z.infer<typeof schema.CreatedWebhook>;
type Delivery = z.infer<typeof schema.WebhookDelivery>;
type Topic = z.infer<typeof schema.WebhookTopic>;
type TestResult = { delivery: Delivery; payload: z.infer<typeof schema.WebhookPayload>; durationMs: number };

/** The topics, in the order the dialog lists them. */
const topics: [Topic, string, string][] = [
    ["match", "Matches", "Added, changed (status, kickoff, crew…) or deleted, imports included"],
    ["matchRecord", "Results", "Match reports: from the watch, the website or an activity file"],
    ["venue", "Venues", "Added, changed, deleted"],
    ["referee", "Referees", "Added, changed, deleted, merged"],
    ["competition", "Competitions", "Added, changed, deleted"],
    ["matchTemplate", "Templates", "Added, changed, deleted"],
];
const topicNames = Object.fromEntries(topics.map(([t, name]) => [t, name])) as Record<Topic, string>;
/** What Send test sends for each topic. */
const exampleNames: Record<Topic, string> = { match: "match", matchRecord: "match report", venue: "venue", referee: "referee", competition: "competition", matchTemplate: "template" };

/** "Delivered 2 min ago · 200", "Waiting to retry · 500", "Failed · No answer in 10 s". */
function describeDelivery(d: { status: string; responseCode?: number; error?: string; at?: string; createdAt?: string; deliveredAt?: string }): string {
    const when = d.at ?? d.deliveredAt ?? d.createdAt;
    const outcome = d.responseCode !== undefined ? String(d.responseCode) : d.error ?? "";
    const state = d.status === "delivered" ? "Delivered" : d.status === "pending" ? "Waiting to retry" : "Failed";
    return [`${state}${when ? ` ${timeAgo(when)}` : ""}`, outcome].filter(Boolean).join(" · ");
}

export function Webhooks({ making, onDone }: { making: boolean; onDone: () => void }) {
    const client = useQueryClient();
    const hooks = useQuery({ queryKey: ["webhooks"], queryFn: async () => (await request<{ webhooks: Webhook[] }>("GET", "/webhooks")).webhooks });
    const refresh = () => client.invalidateQueries({ queryKey: ["webhooks"] });
    return (
        <>
            {hooks.isSuccess && hooks.data.length === 0 && (
                <div className="list-row">
                    <div className="avatar"><Icon name="webhook" size={18} /></div>
                    <div className="grow">
                        <div className="title">No webhooks</div>
                        <div className="sub">Tell another app or a script about changes as they happen: matches, results, venues, referees, competitions and templates.</div>
                    </div>
                </div>
            )}
            {hooks.data?.map((h) => <WebhookRow key={h.id} hook={h} onChange={refresh} />)}
            {making && <NewWebhook onClose={onDone} onCreated={refresh} />}
        </>
    );
}

function WebhookRow({ hook, onChange }: { hook: Webhook; onChange: () => void }) {
    const [showing, setShowing] = useState<"test" | "deliveries">();
    const test = useMutation({
        mutationFn: (topic: Topic) => request<TestResult>("POST", `/webhooks/${hook.id}/test`, { topic }),
        onSuccess: () => {
            setShowing("test");
            onChange();
        },
    });
    const deliveries = useQuery({
        queryKey: ["webhook-deliveries", hook.id],
        enabled: showing === "deliveries",
        queryFn: async () => (await request<{ deliveries: Delivery[] }>("GET", `/webhooks/${hook.id}/deliveries`)).deliveries,
    });
    const save = useMutation({
        mutationFn: (active: boolean) => request("PUT", `/webhooks/${hook.id}`, { url: hook.url, topics: hook.topics, active }),
        onSuccess: onChange,
    });
    const remove = useMutation({ mutationFn: () => request("DELETE", `/webhooks/${hook.id}`), onSuccess: onChange });
    const result = test.data;
    return (
        <div className="list-row webhook-row">
            <div className="avatar"><Icon name="webhook" size={18} /></div>
            <div className="grow">
                <div className="title"><span className="code-text webhook-url">{hook.url}</span>{!hook.active && <span className="chip" style={{ marginLeft: 8 }}>Paused</span>}</div>
                <div className="sub">{hook.topics.map((t) => topicNames[t]).join(", ")}</div>
                <div className="sub">{hook.lastDelivery ? describeDelivery(hook.lastDelivery) : "Nothing sent yet"}</div>
                <div className="row webhook-actions">
                    {/* HOOK-5: a test of one of its topics, chosen from a menu when it has more than one. */}
                    {hook.topics.length === 1 ? (
                        <button type="button" className="btn btn-sm" disabled={test.isPending} onClick={() => test.mutate(hook.topics[0])}>{test.isPending ? "Sending…" : "Send test"}</button>
                    ) : (
                        <MenuTrigger>
                            <Button className="btn btn-sm" isDisabled={test.isPending}>{test.isPending ? "Sending…" : <>Send test<Icon name="chevron" size={14} /></>}</Button>
                            <Popover className="menu-popover" placement="bottom start" offset={6}>
                                <Menu className="menu" aria-label="Send a test" onAction={(key) => test.mutate(key as Topic)}>
                                    {hook.topics.map((t) => (
                                        <MenuItem key={t} id={t} className="menu-item" textValue={topicNames[t]}>
                                            <span><strong>{topicNames[t]}</strong><small>Your latest {exampleNames[t]}, or a made-up one</small></span>
                                        </MenuItem>
                                    ))}
                                </Menu>
                            </Popover>
                        </MenuTrigger>
                    )}
                    <button type="button" className="btn btn-sm" onClick={() => setShowing(showing === "deliveries" ? undefined : "deliveries")}>Deliveries</button>
                    <button type="button" className="btn btn-sm" disabled={save.isPending} onClick={() => save.mutate(!hook.active)}>{hook.active ? "Pause" : "Resume"}</button>
                    <button type="button" className="btn btn-sm btn-danger" disabled={remove.isPending}
                        onClick={() => confirm(`Delete the webhook to ${hook.url}? Nothing more is sent to it.`) && remove.mutate()}>Delete</button>
                </div>
                {test.error && <p className="error">{test.error.message}</p>}
                {showing === "test" && result && (
                    <div className="webhook-result">
                        <p className={result.delivery.status === "delivered" ? "" : "error"}>
                            {result.delivery.status === "delivered" ? "Delivered" : "Not delivered"}: {result.delivery.responseCode !== undefined ? `answered ${result.delivery.responseCode}` : result.delivery.error} in {result.durationMs} ms
                        </p>
                        <details>
                            <summary>What was sent</summary>
                            <pre className="code-block">{JSON.stringify(result.payload, null, 2)}</pre>
                        </details>
                    </div>
                )}
                {showing === "deliveries" && (
                    <ul className="webhook-deliveries">
                        {deliveries.data?.length === 0 && <li className="muted">Nothing sent yet.</li>}
                        {deliveries.data?.slice(0, 20).map((d) => (
                            <li key={d.id}>
                                <span className="code-text">{d.event}</span>{d.test && <span className="chip">Test</span>}
                                <span className={d.status === "failed" ? "error" : "muted"}>{describeDelivery(d)}{d.attempts > 1 ? ` · ${d.attempts} tries` : ""}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function NewWebhook({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
    const [url, setUrl] = useState<string>();
    const [chosen, setChosen] = useState<Topic[]>(["match", "matchRecord"]);
    const create = useMutation({
        mutationFn: () => request<CreatedWebhook>("POST", "/webhooks", { url: url?.trim(), topics: chosen }),
        onSuccess: onCreated,
    });
    const error = create.error instanceof ApiError && create.error.body.issues
        ? create.error.body.issues.map((i) => i.message).join("; ")
        : create.error?.message;
    const made = create.data;
    const [copied, setCopied] = useState(false);
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!made} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal key-modal">
                <Dialog className="modal-dialog">
                    {made ? (
                        <>
                            <Heading slot="title">Copy the signing secret</Heading>
                            <p className="muted">Each delivery is signed with it, so your receiver can check it came from LawFive. This is the only time it's shown.</p>
                            <div className="key-reveal">
                                <code className="code-text">{made.secret}</code>
                                <button type="button" className={`btn${copied ? " copied" : ""}`} onClick={() => void navigator.clipboard.writeText(made.secret).then(() => setCopied(true))}>
                                    <Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy"}
                                </button>
                            </div>
                            <p className="muted key-usage">
                                Each POST has <code className="code-text">X-LawFive-Signature: t=…,v1=…</code>: v1 is the hex HMAC-SHA256 of <code className="code-text">t.body</code> (the time, a dot, and the raw body) with this secret.
                                Answer with a 2xx; anything else is tried again, five times over about three hours.
                            </p>
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                                <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            create.mutate();
                        }}>
                            <Heading slot="title">New webhook</Heading>
                            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                                <Field label="URL" info="Where each change is POSTed, as JSON. https is best; http works too.">
                                    <TextInput value={url} onChange={setUrl} placeholder="https://example.com/lawfive" />
                                </Field>
                                <Field label="Send changes to">
                                    <div className="webhook-topics">
                                        {topics.map(([t, name, hint]) => (
                                            <label key={t} className="toggle">
                                                <input type="checkbox" checked={chosen.includes(t)} onChange={(e) => setChosen(e.target.checked ? [...chosen, t] : chosen.filter((x) => x !== t))} />
                                                <span>{name} <small className="muted">{hint}</small></span>
                                            </label>
                                        ))}
                                    </div>
                                </Field>
                            </div>
                            {error && <p className="error">{error}</p>}
                            <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                                <button type="button" className="btn" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={create.isPending || !url?.trim() || chosen.length === 0}>Add webhook</button>
                            </div>
                        </form>
                    )}
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
