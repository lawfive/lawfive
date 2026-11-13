import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type Key, useState } from "react";
import { Button, Dialog, Heading, Menu, MenuItem, MenuTrigger, Modal, ModalOverlay, Popover } from "react-aria-components";
import { ApiError, type Plan, type PlanInput, type PlanLimits, type Plans as PlansList, request, useAccount, usePlans } from "../api.ts";
import { Icon, Loading, PageHead } from "../components/ui.tsx";
import { type LimitInfo, codeFrom, limitGroups, planSummary } from "../plans.ts";

// Settings → Server → Plans (PLAN-1, PLAN-2, PLAN-5), for admins: the plans, each a named set of
// limits with a code to look it up by; which one new accounts join; and a trial for new accounts.
// Who is in which plan is changed on the People page.

export function Plans() {
    const account = useAccount();
    const plans = usePlans(account.data?.admin ?? false);
    const [editing, setEditing] = useState<Plan | "new">();
    if (account.data && !account.data.admin) {
        return <><PageHead back={{ to: "/settings/server", label: "Server" }} title="Plans" /><div className="card"><div className="empty">Only admins can change plans.</div></div></>;
    }
    if (!plans.data) {
        return <Loading />;
    }
    return (
        <>
            <PageHead back={{ to: "/settings/server", label: "Server" }} title="Plans"
                sub="What each account may use. Everyone is in one plan; change someone's on the People page."
                actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" />New plan</button>} />
            <div className="stack">
                <div className="card">
                    {plans.data.plans.map((p) => <PlanRow key={p.code} plan={p} onEdit={() => setEditing(p)} />)}
                </div>
                <p className="muted plans-note">Over a limit, nothing is taken away: adding more is refused until they're under it again. Matches and tracks recorded on a watch are always kept.</p>
                <NewAccounts list={plans.data} />
            </div>
            {editing && <PlanDialog plan={editing === "new" ? undefined : editing} onClose={() => setEditing(undefined)} />}
        </>
    );
}

function PlanRow({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
    const client = useQueryClient();
    const refresh = () => Promise.all([client.invalidateQueries({ queryKey: ["plans"] }), client.invalidateQueries({ queryKey: ["people"] })]);
    const makeDefault = useMutation({ mutationFn: () => request("PUT", "/plan-settings", { default: plan.code }), onSuccess: refresh });
    const remove = useMutation({ mutationFn: () => request("DELETE", `/plans/${plan.code}`), onSuccess: refresh });
    const onAction = (key: Key) => {
        if (key === "default") {
            makeDefault.mutate();
        } else if (key === "delete" && confirm(`Delete the ${plan.name} plan?`)) {
            remove.mutate();
        }
    };
    const why = plan.default ? "It's the default" : plan.inUse ? (plan.people ? `${plan.people === 1 ? "Someone is" : `${plan.people} people are`} in it` : "An invitation, a trial or someone's next plan uses it") : "It's not used";
    return (
        <div className="list-row plan-row">
            <div className="avatar"><Icon name="plan" size={18} /></div>
            <div className="grow">
                <div className="title">
                    {plan.name}
                    <code className="plan-code">{plan.code}</code>
                    {plan.default && <span className="chip chip-brand person-chip">Default</span>}
                </div>
                <div className="sub">{planSummary(plan.limits, 6)}</div>
                {(makeDefault.error ?? remove.error) && <div className="error">{(makeDefault.error ?? remove.error)?.message}</div>}
            </div>
            <div className="plan-people muted">{plan.people === 1 ? "1 person" : `${plan.people} people`}</div>
            <div className="row-actions">
                <button className="btn" onClick={onEdit}><Icon name="edit" />Edit</button>
                <MenuTrigger>
                    <Button className="btn btn-icon" aria-label={`More for ${plan.name}`}><Icon name="more" size={18} /></Button>
                    <Popover className="menu-popover" placement="bottom end" offset={6}>
                        <Menu className="menu" aria-label={`More for ${plan.name}`} onAction={onAction} disabledKeys={[...(plan.default ? ["default"] : []), ...(plan.inUse ? ["delete"] : [])]}>
                            <MenuItem id="default" className="menu-item" textValue="Make it the default">
                                <Icon name="approve" size={18} />
                                <span><strong>Make it the default</strong><small>{plan.default ? "It is already" : "New accounts join it, and anyone not given a plan is in it"}</small></span>
                            </MenuItem>
                            <MenuItem id="delete" className="menu-item menu-item-danger" textValue="Delete plan">
                                <Icon name="trash" size={18} />
                                <span><strong>Delete plan</strong><small>{plan.inUse ? why : "Nobody is in it"}</small></span>
                            </MenuItem>
                        </Menu>
                    </Popover>
                </MenuTrigger>
            </div>
        </div>
    );
}

/** Which plan new accounts join, and a trial of another first (PLAN-5). */
function NewAccounts({ list }: { list: PlansList }) {
    const client = useQueryClient();
    const current = list.plans.find((p) => p.default)?.code ?? "";
    const [trialOn, setTrialOn] = useState(!!list.signUpTrial);
    const [trialPlan, setTrialPlan] = useState(list.signUpTrial?.plan ?? list.plans.find((p) => !p.default)?.code ?? current);
    const [days, setDays] = useState(String(list.signUpTrial?.days ?? 30));
    const [saved, setSaved] = useState(false);
    const save = useMutation({
        mutationFn: (body: object) => request<PlansList>("PUT", "/plan-settings", body),
        onSuccess: (answer) => {
            client.setQueryData(["plans"], answer);
            setSaved(true);
        },
    });
    const dayCount = Number(days);
    const daysValid = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 366;
    const changed = trialOn !== !!list.signUpTrial || (trialOn && (trialPlan !== list.signUpTrial?.plan || dayCount !== list.signUpTrial?.days));
    return (
        <form className="card form-section" onSubmit={(e) => { e.preventDefault(); save.mutate({ signUpTrial: trialOn ? { plan: trialPlan, days: dayCount } : null }); }}>
            <h2>New accounts</h2>
            <p className="muted" style={{ marginTop: -6 }}>Whoever signs up or uses an invitation joins the default plan, unless the invitation names another.</p>
            <div className="fields">
                <label className="field">
                    <span>Default plan</span>
                    <select className="input" value={current} disabled={save.isPending} onChange={(e) => save.mutate({ default: e.target.value })}>
                        {list.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                    </select>
                </label>
                <div className="field wide">
                    <label className="check-row">
                        <input type="checkbox" checked={trialOn} onChange={(e) => { setSaved(false); setTrialOn(e.target.checked); }} />
                        Start new accounts with a trial of another plan
                    </label>
                    {trialOn && (
                        <div className="row plan-trial">
                            <select className="input" aria-label="Trial plan" value={trialPlan} onChange={(e) => { setSaved(false); setTrialPlan(e.target.value); }}>
                                {list.plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
                            </select>
                            <span className="muted">for</span>
                            <input className="input plan-days" inputMode="numeric" aria-label="Days" value={days} onChange={(e) => { setSaved(false); setDays(e.target.value.replace(/\D/g, "")); }} />
                            <span className="muted">days, then the default plan</span>
                        </div>
                    )}
                    {trialOn && !daysValid && <small className="error">From 1 to 366 days.</small>}
                </div>
            </div>
            <div className="row server-settings-actions">
                <span className="grow" />
                {save.error ? <span className="error">{save.error.message}</span> : saved && !changed && <span className="muted"><Icon name="check" size={15} /> Saved</span>}
                <button type="submit" className="btn btn-primary" disabled={!changed || (trialOn && !daysValid) || save.isPending}>{save.isPending ? "Saving…" : "Save"}</button>
            </div>
        </form>
    );
}

/** Making or changing a plan: its name, code and each limit, empty for none (PLAN-1, PLAN-2). */
function PlanDialog({ plan, onClose }: { plan?: Plan; onClose: () => void }) {
    const client = useQueryClient();
    const [name, setName] = useState(plan?.name ?? "");
    const [code, setCode] = useState(plan?.code ?? "");
    const [codeTyped, setCodeTyped] = useState(!!plan);
    const [limits, setLimits] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(plan?.limits ?? {}).map(([k, v]) => [k, String(v)])));
    const shownCode = codeTyped ? code : codeFrom(name);
    const save = useMutation({
        mutationFn: (body: PlanInput) => plan ? request<Plan>("PUT", `/plans/${plan.code}`, body) : request<Plan>("POST", "/plans", body),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ["plans"] }), client.invalidateQueries({ queryKey: ["people"] }), client.invalidateQueries({ queryKey: ["account-plan"] })]);
            onClose();
        },
    });
    const body: PlanInput = {
        name: name.trim(),
        code: shownCode,
        limits: Object.fromEntries(Object.entries(limits).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])) as PlanLimits,
    };
    const codeValid = /^[a-z0-9-]{1,40}$/.test(shownCode);
    const error = save.error instanceof ApiError && save.error.body.issues ? "Check the name, code and limits." : save.error?.message;
    return (
        <ModalOverlay className="modal-overlay" isOpen isDismissable={!save.isPending} onOpenChange={(open) => !open && onClose()}>
            <Modal className="modal plan-modal">
                <Dialog className="modal-dialog">
                    <form onSubmit={(e) => { e.preventDefault(); save.mutate(body); }}>
                        <Heading slot="title">{plan ? `Change ${plan.name}` : "New plan"}</Heading>
                        <p className="muted">{plan ? `Everyone in it${plan.people ? ` (${plan.people === 1 ? "1 person" : `${plan.people} people`})` : ""} gets the new limits straight away.` : "Leave a limit empty for none, or 0 to leave it out of the plan altogether."}</p>
                        <div className="fields plan-fields">
                            <label className="field"><span>Name</span>
                                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Pro" autoFocus={!plan} />
                            </label>
                            <label className="field"><span>Code</span>
                                <input className="input setting-input" value={shownCode} spellCheck={false} autoComplete="off" maxLength={40} placeholder="pro"
                                    onChange={(e) => { setCodeTyped(true); setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
                                <small className="muted">{plan && shownCode !== plan.code ? "Anything outside LawFive that uses the old code stops finding it." : "To look it up by, in the API and invitations. Stays when it's renamed."}</small>
                            </label>
                        </div>
                        {limitGroups.map((group) => (
                            <fieldset key={group.title} className="plan-group">
                                <legend>{group.title}</legend>
                                <div className="fields plan-fields">
                                    {group.limits.map((info) => <LimitField key={info.key} info={info} value={limits[info.key] ?? ""} onChange={(v) => setLimits({ ...limits, [info.key]: v })} />)}
                                </div>
                            </fieldset>
                        ))}
                        {error && <p className="error">{error}</p>}
                        <div className="modal-actions">
                            <button type="button" className="btn" disabled={save.isPending} onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn btn-primary" disabled={!body.name || !codeValid || save.isPending}>{save.isPending ? "Saving…" : plan ? "Save" : "Make plan"}</button>
                        </div>
                    </form>
                </Dialog>
            </Modal>
        </ModalOverlay>
    );
}

function LimitField({ info, value, onChange }: { info: LimitInfo; value: string; onChange: (value: string) => void }) {
    return (
        <label className="field">
            <span>{info.label}</span>
            <div className="input-with-unit">
                <input className="input" inputMode="numeric" value={value} placeholder="No limit" onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))} />
                {info.unit && <span className="muted">{info.unit}</span>}
            </div>
            {info.hint && <small className="muted">{info.hint}</small>}
        </label>
    );
}
