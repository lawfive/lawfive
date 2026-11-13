import type * as schema from "@lawfive/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { z } from "zod";
import { ApiError, request, useMeta } from "../api.ts";
import { Field, Icon, Select, TextInput, Toggle } from "../components/ui.tsx";
import { formatShortDay, timeAgo } from "../format.ts";

// Assignor calendars (FEED-1 to FEED-10), on the Settings page: the private calendar link an
// assignor system gives each official, read by the server every 30 minutes into the matches. Each
// shows how its latest read went, what it couldn't save, and whether it tells the phones; adding
// one previews what the link holds before anything is saved.

type AssignorCalendar = z.infer<typeof schema.AssignorCalendar>;
type Preview = z.infer<typeof schema.AssignorCalendarPreview>;
type System = z.infer<typeof schema.AssignorSystem>;

const systems: [System, string][] = [
    ["arbiter", "ArbiterSports"], ["assignr", "Assignr"], ["horizon", "HorizonWebRef"], ["reftown", "RefTown"], ["gotsport", "GotSport"], ["spordle", "Spordle"], ["other", "Another system"],
];
const systemNames = Object.fromEntries(systems) as Record<System, string>;

/** "Sat, Nov 7, 9:00 AM", where the game is. */
function kickoffAt(iso: string, timeZone: string | undefined): string {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(new Date(iso));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the latest read did, in a line. */
function lastRead(c: AssignorCalendar): string {
    if (!c.lastReadAt) {
        return "Not read yet";
    }
    const r = c.lastResult;
    const did = r ? [r.added && `${r.added} added`, r.updated && `${r.updated} changed`, r.canceled && `${r.canceled} canceled`].filter(Boolean).join(", ") : "";
    const games = r ? plural(r.games, "game", "games") + " to come" : undefined;
    return [`Read ${timeAgo(c.lastReadAt)}`, games, did || (c.lastChangedAt ? `last change ${timeAgo(c.lastChangedAt)}` : undefined)].filter(Boolean).join(" · ");
}

export function AssignorCalendars({ adding, onDone }: { adding: boolean; onDone: () => void }) {
    const client = useQueryClient();
    const notices = useMeta().data?.capabilities.includes("notices") ?? false;
    const calendars = useQuery({ queryKey: ["assignor-calendars"], queryFn: async () => (await request<{ calendars: AssignorCalendar[] }>("GET", "/assignor-calendars")).calendars });
    const refresh = () => client.invalidateQueries({ queryKey: ["assignor-calendars"] });
    const changed = () => Promise.all([refresh(), client.invalidateQueries({ queryKey: ["matches"] }), client.invalidateQueries({ queryKey: ["venues"] }), client.invalidateQueries({ queryKey: ["account-plan"] })]);
    return (
        <>
            {calendars.isSuccess && calendars.data.length === 0 && (
                <div className="list-row">
                    <div className="avatar"><Icon name="assignor" size={18} /></div>
                    <div className="grow">
                        <div className="title">No assignor calendars</div>
                        <div className="sub">ArbiterSports, Assignr, HorizonWebRef, RefTown and others give you a private calendar link. Add it here and your games come in by themselves, every 30 minutes; moved and canceled games change too.</div>
                    </div>
                </div>
            )}
            {calendars.data?.map((c) => <CalendarRow key={c.id} calendar={c} notices={notices} onChange={changed} />)}
            {adding && <AddCalendar notices={notices} onClose={onDone} onAdded={changed} />}
        </>
    );
}

function CalendarRow({ calendar: c, notices, onChange }: { calendar: AssignorCalendar; notices: boolean; onChange: () => void }) {
    const [newLink, setNewLink] = useState<string>();
    const [linking, setLinking] = useState(false);
    const change = useMutation({
        mutationFn: (body: z.input<typeof schema.AssignorCalendarChange>) => request<AssignorCalendar>("PATCH", `/assignor-calendars/${c.id}`, body),
        onSuccess: () => {
            setLinking(false);
            setNewLink(undefined);
            onChange();
        },
    });
    const read = useMutation({ mutationFn: () => request<AssignorCalendar>("POST", `/assignor-calendars/${c.id}/read`), onSuccess: onChange });
    const remove = useMutation({ mutationFn: () => request("DELETE", `/assignor-calendars/${c.id}`), onSuccess: onChange });
    const busy = change.isPending || read.isPending || remove.isPending;
    const error = (change.error ?? read.error ?? remove.error)?.message;
    // FEED-9: stopped by the server after the link stopped working, or paused by the person.
    const stopped = !c.active && c.stoppedAt;
    return (
        <div className="list-row webhook-row">
            <div className="avatar"><Icon name="assignor" size={18} /></div>
            <div className="grow">
                <div className="title">{c.name}{!c.active && <span className="chip" style={{ marginLeft: 8 }}>{stopped ? "Stopped" : "Paused"}</span>}</div>
                <div className="sub">{c.name !== systemNames[c.system] && `${systemNames[c.system]} · `}<span className="code-text">{c.link}</span></div>
                <div className="sub">{lastRead(c)}</div>
                {c.problem && <div className="sub error">{stopped ? `Stopped on ${formatShortDay(c.stoppedAt!)}. ` : ""}{c.problem}</div>}
                {c.skipped.length > 0 && (
                    <details className="feed-skipped">
                        <summary className="sub">{plural(c.skipped.length, "game", "games")} couldn't be saved</summary>
                        <ul>
                            {c.skipped.map((s, i) => (
                                <li key={i}><strong>{s.title}</strong>{s.kickoff && <span className="muted"> · {formatShortDay(s.kickoff)}</span>}<div className="muted">{s.reason}</div></li>
                            ))}
                        </ul>
                    </details>
                )}
                {notices && (
                    <div className="key-notify">
                        <Toggle label="Tell my phones when it adds, moves or cancels a match" checked={c.notify} disabled={busy} onChange={(notify) => change.mutate({ notify })} />
                    </div>
                )}
                {linking ? (
                    <form className="row feed-relink" onSubmit={(e) => {
                        e.preventDefault();
                        newLink?.trim() && change.mutate({ url: newLink.trim() });
                    }}>
                        <TextInput value={newLink} onChange={setNewLink} placeholder="https:// or webcal://" />
                        <button type="submit" className="btn btn-sm btn-primary" disabled={busy || !newLink?.trim()}>{change.isPending ? "Reading…" : "Use this link"}</button>
                        <button type="button" className="btn btn-sm" onClick={() => setLinking(false)}>Cancel</button>
                    </form>
                ) : (
                    <div className="row webhook-actions">
                        {c.active && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => read.mutate()}>{read.isPending ? "Reading…" : "Check now"}</button>}
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => change.mutate({ active: !c.active })}>{c.active ? "Pause" : change.isPending ? "Reading…" : "Resume"}</button>
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setLinking(true)}>New link</button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={busy}
                            onClick={() => confirm(`Remove "${c.name}"? It won't be read again; the matches it added stay.`) && remove.mutate()}>Remove</button>
                    </div>
                )}
                {error && <p className="error">{error}</p>}
            </div>
        </div>
    );
}

function AddCalendar({ notices, onClose, onAdded }: { notices: boolean; onClose: () => void; onAdded: () => void }) {
    const [url, setUrl] = useState<string>();
    const [system, setSystem] = useState<System>("arbiter");
    const [name, setName] = useState<string>();
    const [notify, setNotify] = useState(true);
    const errorOf = (e: Error | null) => (e instanceof ApiError && e.body.issues ? e.body.issues.map((i) => i.message).join("; ") : e?.message);
    const preview = useMutation({
        mutationFn: () => request<Preview>("POST", "/assignor-calendars/preview", { url: url?.trim(), system }),
        onSuccess: (p) => setName((n) => n ?? (p.calendarName && p.calendarName !== systemNames[system] ? p.calendarName : systemNames[system])),
    });
    const connect = useMutation({
        mutationFn: () => request<AssignorCalendar>("POST", "/assignor-calendars", { url: url?.trim(), system, name: name?.trim() ?? systemNames[system], notify: notices ? notify : undefined }),
        onSuccess: () => {
            onAdded();
            onClose();
        },
    });
    const seen = preview.data;
    // A changed link or system needs looking at again.
    const reset = () => preview.reset();
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal key-modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        seen ? connect.mutate() : preview.mutate();
                    }}>
                        <Heading slot="title">Add an assignor calendar</Heading>
                        <p className="muted">Your assignor's site gives you a private calendar link for your games, usually under Calendar sync, Subscribe or iCal feed. Treat it like a password: LawFive keeps it encrypted.</p>
                        <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                            <Field label="Calendar link">
                                <TextInput value={url} onChange={(v) => {
                                    setUrl(v);
                                    reset();
                                }} placeholder="https:// or webcal://" />
                            </Field>
                            <Field label="From" info="Each system writes its games a little differently. ArbiterSports games come in with their teams, venue and its address, pitch, level and game number. Other systems' games come in with their kickoff and venue, and their teams and your position when the title names them; more follows as each system is added, from the games already read.">
                                <Select value={system} onChange={(v) => {
                                    setSystem(v ?? "other");
                                    reset();
                                }} options={systems} />
                            </Field>
                            {seen && (
                                <>
                                    <div className="feed-preview">
                                        {seen.games === 0 ? (
                                            <p><strong>No games to come in it yet.</strong> Connect it anyway, and new games come in as they're assigned.</p>
                                        ) : (
                                            <p>
                                                <strong>{plural(seen.games, "game", "games")}</strong> from {formatShortDay(seen.from!)} to {formatShortDay(seen.to!)}
                                                {seen.inLawFive > 0 && <>; {seen.inLawFive} already in LawFive, which it takes on as they are</>}.
                                            </p>
                                        )}
                                        {seen.first.length > 0 && (
                                            <ul>
                                                {seen.first.map((g, i) => (
                                                    <li key={i}>
                                                        <strong>{g.title}</strong>
                                                        <div className="muted">{kickoffAt(g.kickoff, g.timeZone)}{g.venue && ` · ${g.venue}`}{g.inLawFive && " · already in LawFive"}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {seen.skipped.length > 0 && <p className="muted">{plural(seen.skipped.length, "event", "events")} can't be read: {seen.skipped[0].reason}</p>}
                                    </div>
                                    <Field label="Name"><TextInput value={name} onChange={setName} maxLength={60} placeholder={systemNames[system]} /></Field>
                                    {notices && (
                                        <Field label="Notifications" info="Your phones are told when it adds a game, or moves or cancels one, as one notification a minute at most. Turn on Matches from integrations in the phone app too.">
                                            <Toggle label="Tell my phones when it adds, moves or cancels a match" checked={notify} onChange={setNotify} />
                                        </Field>
                                    )}
                                </>
                            )}
                        </div>
                        {(preview.error ?? connect.error) && <p className="error">{errorOf(preview.error ?? connect.error)}</p>}
                        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
                            <button type="button" className="btn" onClick={onClose}>Cancel</button>
                            {seen ? (
                                <button type="submit" className="btn btn-primary" disabled={connect.isPending}>{connect.isPending ? "Connecting…" : "Connect"}</button>
                            ) : (
                                <button type="submit" className="btn btn-primary" disabled={preview.isPending || !url?.trim()}>{preview.isPending ? "Reading…" : "Look at it"}</button>
                            )}
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}
